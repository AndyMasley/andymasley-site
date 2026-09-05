/**
 * Bounded DOM/runtime smoke test. This executes the current room inline module
 * with real Three geometry, materials, scene traversal and raycasting.
 * GPU/WebGL, audio output, canvas painting and actual layout are mocked.
 * This is NOT browser, visual, shader compilation, or pagination-layout QA.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import * as RealThree from 'three';
import ts from 'typescript';
import { enrichLibrary, loadLibraryMaterials } from './graphics';
import { buildLibraryDepth } from './depth';
import { BookMotion } from './book-motion';
import { canStand, slideMove, damp, qualityStep, localMovement } from './physics';

const source = readFileSync(join(__dirname, '../../pages/room.astro'), 'utf8');
let camera: RealThree.PerspectiveCamera;
let scene: RealThree.Scene;
let renderCount = 0;
let nextRAF = 0;
const rafs = new Map<number, FrameRequestCallback>();
let loggedErrors: ReturnType<typeof vi.spyOn>;

const byId = (id: string) => document.getElementById(id)!;
const tick = async (ms = 16) => {
  vi.advanceTimersByTime(ms);
  const current = [...rafs.values()]; rafs.clear();
  current.forEach(callback => callback(performance.now()));
  // Book initialization deliberately waits multiple RAF/microtask boundaries.
  for (let i = 0; i < 8; i++) await Promise.resolve();
};
const frames = async (count: number, ms = 16) => { for (let i = 0; i < count; i++) await tick(ms); };
const key = (code: string, type = 'keydown', target: EventTarget = document.body) => {
  const event = new KeyboardEvent(type, { code, key: code === 'Space' ? ' ' : code, bubbles: true, cancelable: true });
  target.dispatchEvent(event); return event;
};
const enter = async () => { byId('start-button').click(); await tick(); };
const pause = () => byId('pause-room').click();

class Renderer {
  domElement = document.createElement('canvas');
  shadowMap = { enabled: false, type: 0, autoUpdate: true, needsUpdate: false };
  capabilities = { getMaxAnisotropy: () => 8 };
  toneMapping = 0; toneMappingExposure = 0;
  setSize() {} setPixelRatio() {}
  render(s: RealThree.Scene, c: RealThree.PerspectiveCamera) { s.updateMatrixWorld(true); c.updateMatrixWorld(true); renderCount++; }
}
class PMREM { compileEquirectangularShader() {} fromEquirectangular() { return { texture: new RealThree.Texture() }; } dispose() {} }
class RenderPass { constructor(s: RealThree.Scene, c: RealThree.PerspectiveCamera) { scene = s; camera = c; } }
class Composer {
  constructor(public renderer: Renderer) {}
  setPixelRatio() {} setSize() {} addPass() {}
  render() { this.renderer.render(scene, camera); }
}
class Bloom { strength: number; constructor(_size: unknown, strength: number) { this.strength = strength; } setSize() {} }
class ShaderPass { uniforms: Record<string, RealThree.IUniform>; constructor(shader: { uniforms: Record<string, RealThree.IUniform> }) { this.uniforms = RealThree.UniformsUtils.clone(shader.uniforms); } }
class Reflector extends RealThree.Mesh { constructor(geometry: RealThree.BufferGeometry) { super(geometry, new RealThree.MeshBasicMaterial()); } }
class AudioParam { value = 0; setValueAtTime() {} linearRampToValueAtTime() {} exponentialRampToValueAtTime() {} setTargetAtTime() {} cancelScheduledValues() {} }
class AudioNode {
  gain = new AudioParam(); frequency = new AudioParam(); Q = new AudioParam(); pan = new AudioParam();
  positionX = new AudioParam(); positionY = new AudioParam(); positionZ = new AudioParam();
  forwardX = new AudioParam(); forwardY = new AudioParam(); forwardZ = new AudioParam();
  upX = new AudioParam(); upY = new AudioParam(); upZ = new AudioParam();
  connect() { return this; } disconnect() {} start() {} stop() {}
}
class AudioContext {
  sampleRate = 8000; currentTime = 0; destination = new AudioNode(); state = 'running';
  listener = new AudioNode();
  createGain() { return new AudioNode(); } createConvolver() { return new AudioNode(); }
  createBufferSource() { return new AudioNode(); } createBiquadFilter() { return new AudioNode(); }
  createOscillator() { return new AudioNode(); } createStereoPanner() { return new AudioNode(); }
  createPanner() { return new AudioNode(); }
  createBuffer(channels: number, size: number) { const data = Array.from({ length: channels }, () => new Float32Array(Math.floor(size))); return { getChannelData: (index: number) => data[index] }; }
  resume() { this.state = 'running'; return Promise.resolve(); } suspend() { this.state = 'suspended'; return Promise.resolve(); }
}

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date', 'performance'] });
  loggedErrors = vi.spyOn(console, 'error').mockImplementation(() => {});
  const body = source.split('<body>')[1].split('</body>')[0];
  document.body.innerHTML = body.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '');
  document.head.innerHTML = [...source.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)].map(match => `<style>${match[1]}</style>`).join('');
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('pointer: coarse') || query.includes('prefers-reduced-motion'), media: query, addEventListener() {}, removeEventListener() {} }));
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { rafs.set(++nextRAF, callback); return nextRAF; });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => rafs.delete(id));
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.stubGlobal('AudioContext', AudioContext);
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
  Object.defineProperty(document, 'pointerLockElement', { configurable: true, get: () => null });
  document.exitPointerLock = vi.fn();
  HTMLElement.prototype.setPointerCapture = vi.fn();
  HTMLElement.prototype.releasePointerCapture = vi.fn();
  HTMLElement.prototype.scrollIntoView = vi.fn();
  // Coarse layout metrics only allow exercising reader state/navigation logic.
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get() { return this.id === 'book-stage' ? 900 : 1024; } });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get() { return this.id === 'book-stage' ? 680 : 768; } });
  Object.defineProperty(HTMLElement.prototype, 'scrollHeight', { configurable: true, get() { return Math.max(20, (this.textContent?.length || 0) / 8); } });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => new Proxy({}, {
    get(target, property) {
      if (property in target) return (target as Record<PropertyKey, unknown>)[property];
      if (property === 'createLinearGradient' || property === 'createRadialGradient') return () => ({ addColorStop() {} });
      if (property === 'measureText') return (text: string) => ({ width: text.length * 8 });
      if (property === 'getImageData') return () => ({ data: new Uint8ClampedArray(1024 * 1024 * 4) });
      return () => {};
    },
    set(target, property, value) { (target as Record<PropertyKey, unknown>)[property] = value; return true; }
  }) as never);
  const scripts = [...source.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)];
  const dataScript = scripts.find(match => match[2].includes('window.plunkittText ='))![2];
  Function(ts.transpile(dataScript, { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext }))();
  window.libraryReady = Promise.resolve({
    THREE: { ...RealThree, WebGLRenderer: Renderer, PMREMGenerator: PMREM },
    EffectComposer: Composer, RenderPass, UnrealBloomPass: Bloom, ShaderPass,
    OutputPass: class {}, Reflector, enrichLibrary, loadLibraryMaterials, buildLibraryDepth, BookMotion, canStand, slideMove, damp, qualityStep, localMovement,
  } as unknown as Awaited<Window['libraryReady']>);
  const main = scripts.find(match => match[1].includes('type="module"'))![2];
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  await new AsyncFunction(main)();
});

afterAll(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); rafs.clear(); });

describe('Borges current room module runtime smoke', () => {
  it('initializes real geometry and enables entry without a caught runtime exception', () => {
    expect(loggedErrors).not.toHaveBeenCalled();
    expect(byId('loading-note').textContent).toContain('hexagonal gallery');
    expect((byId('start-button') as HTMLButtonElement).disabled).toBe(false);
    expect(byId('library-canvas')).toBeTruthy();
    const instances: RealThree.InstancedMesh[] = [];
    scene.traverse(object => { if ((object as RealThree.InstancedMesh).isInstancedMesh) instances.push(object as RealThree.InstancedMesh); });
    expect(instances.some(mesh => mesh.count >= 242 && mesh.geometry.getAttribute('archiveTile'))).toBe(true);
  });

  it('supports immediate drag-mode entry without the intro timer reopening the menu', async () => {
    await enter();
    await frames(6);
    expect(document.body.classList.contains('exploring')).toBe(true);
    expect(byId('start-prompt').classList.contains('visible')).toBe(false);
    expect((byId('touch-controls') as HTMLElement).hidden).toBe(false);
    pause();
  });

  it('moves with keys and clears held movement and velocity across blur/resume', async () => {
    await enter(); document.body.focus();
    const initial = camera.position.clone();
    key('KeyW'); await frames(12);
    expect(camera.position.distanceTo(initial)).toBeGreaterThan(0.03);
    expect(canStand(camera.position.x, camera.position.z)).toBe(true);
    window.dispatchEvent(new Event('blur'));
    expect(byId('start-prompt').classList.contains('visible')).toBe(true);
    await enter();
    const resumed = camera.position.clone();
    await frames(12);
    expect(camera.position.x).toBeCloseTo(resumed.x, 8);
    expect(camera.position.z).toBeCloseTo(resumed.z, 8);
    pause();
  });

  it('handles the direct-reader event, preserves the full text, and closes with Escape', async () => {
    const request = new CustomEvent('library:read-direct', { cancelable: true });
    expect(window.dispatchEvent(request)).toBe(false);
    await frames(8);
    expect(byId('reading-overlay').classList.contains('visible')).toBe(true);
    expect(byId('start-prompt').classList.contains('visible')).toBe(false);
    expect(document.activeElement).toBe(byId('reader-close'));
    expect(document.querySelectorAll('.book-sr-fulltext .chapter-title')).toHaveLength(26);
    const renderedBefore = renderCount;
    await frames(6);
    expect(renderCount).toBe(renderedBefore);
    key('Escape');
    expect(byId('reading-overlay').classList.contains('visible')).toBe(false);
    expect(byId('start-prompt').classList.contains('visible')).toBe(true);
  });

  it('routes the menu reader button through one reader and preserves native Space on close', async () => {
    byId('read-without-3d').click();
    await frames(8);
    expect(byId('reading-content').classList.contains('full-book-view')).toBe(true);
    expect(byId('reading-content').classList.contains('text-only')).toBe(false);
    const close = byId('reader-close'); close.focus();
    expect(key('Space', 'keydown', close).defaultPrevented).toBe(false);
    close.click();
    expect(byId('reading-overlay').classList.contains('visible')).toBe(false);
    expect(byId('start-prompt').classList.contains('visible')).toBe(true);
    expect(loggedErrors).not.toHaveBeenCalled();
  });
});
