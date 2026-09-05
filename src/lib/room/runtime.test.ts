/**
 * Bounded DOM/runtime smoke test. This executes the current room inline module
 * with real Three geometry, materials, scene traversal and raycasting.
 * GPU/WebGL, audio output, canvas painting and actual layout are mocked.
 * This is NOT browser, visual, shader compilation, or pagination-layout QA.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
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
let coarsePointer = false;
let pointerLock: Element | null = null;
let stageWidth = 900, stageHeight = 680;
const fragments = Function(`return [${source.split('const borgesQuotes = [')[1].split('\n    ];')[0]}]`)() as { source: string; quote: string }[];

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
const pointer = (type: string, x: number, y: number, pointerType = 'mouse', pointerId = 1) => {
  const event = new MouseEvent(type, { clientX: x, clientY: y, button: 0, bubbles: true, cancelable: true });
  Object.defineProperties(event, { pointerId: { value: pointerId }, pointerType: { value: pointerType } });
  byId('library-canvas').dispatchEvent(event); return event;
};
const clickAt = (x: number, y: number, type = 'mouse') => {
  pointer('pointerdown', x, y, type); pointer('pointerup', x, y, type); pointer('click', x, y, type);
};
const mouseLookAt = async (position: RealThree.Vector3) => {
  const direction = position.clone().sub(camera.position).normalize();
  const orientation = new RealThree.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
  const event = new MouseEvent('mousemove', { bubbles: true });
  Object.defineProperties(event, {
    movementX: { value: (orientation.y - Math.atan2(-direction.x, -direction.z)) / 0.0022 },
    movementY: { value: (orientation.x - Math.asin(direction.y)) / 0.0022 },
  });
  document.body.dispatchEvent(event); await frames(3);
};
const shelfTarget = () => {
  scene.updateMatrixWorld(true);
  const shelf = scene.children.find(object => (object as RealThree.InstancedMesh).isInstancedMesh && (object as RealThree.Mesh).geometry.getAttribute('archiveTile')) as RealThree.InstancedMesh;
  const matrix = new RealThree.Matrix4();
  for (let i = 0; i < shelf.count; i++) {
    shelf.getMatrixAt(i, matrix);
    const world = new RealThree.Vector3().setFromMatrixPosition(matrix).applyMatrix4(shelf.matrixWorld);
    if (world.y > 1.8 && world.y < 2.4 && world.distanceTo(camera.position) < 5.5) {
      const ray = new RealThree.Raycaster(camera.position, world.clone().sub(camera.position).normalize());
      const index = ray.intersectObject(shelf)[0]?.instanceId;
      if (index !== undefined) return { world, mesh: shelf, index, fragment: fragments[index % fragments.length] };
    }
  }
  throw new Error('No shelf book within centered interaction range');
};

class Renderer {
  domElement = document.createElement('canvas');
  constructor() { this.domElement.getBoundingClientRect = () => new DOMRect(16, 24, 1024, 768); }
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
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: (query.includes('pointer: coarse') && coarsePointer) || query.includes('prefers-reduced-motion'), media: query, addEventListener() {}, removeEventListener() {} }));
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { rafs.set(++nextRAF, callback); return nextRAF; });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => rafs.delete(id));
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.stubGlobal('AudioContext', AudioContext);
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
  Object.defineProperty(document, 'pointerLockElement', { configurable: true, get: () => pointerLock });
  document.exitPointerLock = vi.fn(() => { if (pointerLock) { pointerLock = null; document.dispatchEvent(new Event('pointerlockchange')); } });
  HTMLElement.prototype.requestPointerLock = vi.fn(async function (this: HTMLElement) { pointerLock = this; document.dispatchEvent(new Event('pointerlockchange')); });
  HTMLElement.prototype.setPointerCapture = vi.fn();
  HTMLElement.prototype.releasePointerCapture = vi.fn();
  HTMLElement.prototype.scrollIntoView = vi.fn();
  // Coarse layout metrics only allow exercising reader state/navigation logic.
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get() { return this.id === 'book-stage' ? stageWidth : 1024; } });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get() { return this.id === 'book-stage' ? stageHeight : 768; } });
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
afterEach(async () => {
  key('Escape'); await frames(60); pause(); stageWidth = 900; stageHeight = 680;
  (byId('room-motion') as HTMLInputElement).checked = true;
  byId('room-motion').dispatchEvent(new Event('change'));
  coarsePointer = false; await enter();
  await mouseLookAt(camera.position.clone().add(new RealThree.Vector3(-1, 0, 0)));
  pause();
});

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

  it.each([0, 3])('seals doorway wall %i above the opening from both gallery and corridor sides', wall => {
    scene.updateMatrixWorld(true);
    const parts: RealThree.Object3D[] = [];
    scene.traverse(object => { if (object.name === `Doorway wall ${wall}`) parts.push(object); });
    expect(parts).toHaveLength(3);
    const a = wall * Math.PI / 3;
    const normal = new RealThree.Vector3(Math.cos(a), 0, Math.sin(a));
    const tangent = new RealThree.Vector3(-normal.z, 0, normal.x);
    const apothem = 5 * Math.cos(Math.PI / 6);
    for (const side of [-1, 1]) {
      const direction = normal.clone().multiplyScalar(-side);
      for (const offset of [-2.4, -1.6, -0.88, 0, 0.88, 1.6, 2.4]) {
        for (const y of [2.8, 4, 5.8]) {
          const origin = normal.clone().multiplyScalar(apothem + side).addScaledVector(tangent, offset).setY(y);
          const ray = new RealThree.Raycaster(origin, direction, 0, 2);
          expect(ray.intersectObjects(parts, false).length, `wall ${wall}, side ${side}, tangent ${offset}, height ${y}`).toBeGreaterThan(0);
        }
      }
      for (const offset of [-0.65, 0, 0.65]) {
        const origin = normal.clone().multiplyScalar(apothem + side).addScaledVector(tangent, offset).setY(1.5);
        const ray = new RealThree.Raycaster(origin, direction, 0, 2);
        expect(ray.intersectObjects(parts, false), `door ${wall}, side ${side}, tangent ${offset}`).toHaveLength(0);
      }
    }
  });

  it('enters desktop mouse-look by default with a centered crosshair and no hand cursor option', async () => {
    const requests = vi.mocked(HTMLElement.prototype.requestPointerLock).mock.calls.length;
    await enter();
    await frames(6);
    expect(document.body.classList.contains('exploring')).toBe(true);
    expect(byId('start-prompt').classList.contains('visible')).toBe(false);
    expect((byId('touch-controls') as HTMLElement).hidden).toBe(true);
    expect(HTMLElement.prototype.requestPointerLock).toHaveBeenCalledTimes(requests + 1);
    expect(document.body.classList.contains('pointer-locked')).toBe(true);
    expect(getComputedStyle(byId('library-canvas')).cursor).toBe('none');
    expect(getComputedStyle(byId('crosshair')).left).toBe('50%');
    expect(getComputedStyle(byId('crosshair')).top).toBe('50%');
    expect(document.getElementById('room-fps')).toBeNull();
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

  it('shows a separate E reminder and opens the centered shelf book with E', async () => {
    await enter();
    const target = shelfTarget();
    await mouseLookAt(target.world);
    expect(byId('object-label').classList.contains('visible')).toBe(true);
    expect(document.querySelector('#object-label .label-inner')?.textContent).toBe(target.fragment.source);
    expect(document.querySelector('#object-label .label-action')?.textContent).toBe('E to open');
    expect(byId('controls-hint').textContent).toContain('E to open');
    pointer('pointermove', 20, 20); await frames(3);
    expect(document.querySelector('#object-label .label-inner')?.textContent).toBe(target.fragment.source);
    key('KeyE'); await frames(8);
    expect(byId('reading-overlay').classList.contains('visible')).toBe(true);
    expect(byId('reading-text').textContent).toContain(target.fragment.quote);
    byId('reader-close').click(); await frames(4);
    expect(document.body.classList.contains('exploring')).toBe(true);
    expect(document.body.classList.contains('pointer-locked')).toBe(true);
    pause();
  });

  it.each(['backdrop', 'Return button', 'Escape'])('returns straight to exploration when a borrowed book closes via %s', async method => {
    await enter();
    const target = shelfTarget(); await mouseLookAt(target.world);
    const position = camera.position.clone();
    key('KeyE'); await frames(8);
    expect(byId('reading-overlay').classList.contains('visible')).toBe(true);
    if (method === 'backdrop') byId('reading-overlay').click();
    else if (method === 'Return button') byId('reader-close').click();
    else key('Escape');
    await frames(6);
    expect(byId('reading-overlay').classList.contains('visible')).toBe(false);
    expect(byId('start-prompt').classList.contains('visible')).toBe(false);
    expect(document.body.classList.contains('exploring')).toBe(true);
    expect(camera.position.x).toBeCloseTo(position.x, 8);
    expect(camera.position.z).toBeCloseTo(position.z, 8);
    await frames(60);
    expect(byId('reading-overlay').classList.contains('visible')).toBe(false);
    expect(byId('start-prompt').classList.contains('visible')).toBe(false);
    if (method === 'Escape') {
      document.body.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape', repeat: true, bubbles: true, cancelable: true }));
      await frames(3);
      expect(byId('start-prompt').classList.contains('visible')).toBe(false);
      expect(document.body.classList.contains('exploring')).toBe(true);
    }
    key('Escape', 'keyup');
    key('Escape'); await frames(3);
    expect(byId('start-prompt').classList.contains('visible')).toBe(true);
  });

  it('keeps exploring after a book closes even when mouse-look reacquisition is rejected', async () => {
    await enter();
    const target = shelfTarget(); await mouseLookAt(target.world);
    key('KeyE'); await frames(8);
    vi.mocked(HTMLElement.prototype.requestPointerLock).mockRejectedValueOnce(new Error('Pointer lock cooldown'));
    byId('reading-overlay').click(); await frames(6);
    expect(byId('reading-overlay').classList.contains('visible')).toBe(false);
    expect(byId('start-prompt').classList.contains('visible')).toBe(false);
    expect(document.body.classList.contains('exploring')).toBe(true);
    expect(document.body.classList.contains('pointer-locked')).toBe(false);
    expect((byId('touch-controls') as HTMLElement).hidden).toBe(false);
    const before = camera.quaternion.clone();
    pointer('pointerdown', 300, 300); pointer('pointermove', 330, 300); pointer('pointerup', 330, 300);
    await frames(3);
    expect(camera.quaternion.equals(before)).toBe(false);
  });

  it('keeps the menu closed while mouse-look reacquisition is pending after closing a book', async () => {
    await enter();
    const target = shelfTarget(); await mouseLookAt(target.world);
    key('KeyE'); await frames(8);
    let completeLock!: () => void;
    vi.mocked(HTMLElement.prototype.requestPointerLock).mockImplementationOnce(function (this: HTMLElement) {
      const element = this;
      return new Promise<void>(resolve => {
        completeLock = () => { pointerLock = element; document.dispatchEvent(new Event('pointerlockchange')); resolve(); };
      });
    });
    byId('reader-close').click(); await frames(6);
    expect(byId('reading-overlay').classList.contains('visible')).toBe(false);
    expect(byId('start-prompt').classList.contains('visible')).toBe(false);
    completeLock(); await frames(6);
    expect(document.body.classList.contains('exploring')).toBe(true);
    expect(document.body.classList.contains('pointer-locked')).toBe(true);
    expect(byId('reading-overlay').classList.contains('visible')).toBe(false);
    expect(byId('start-prompt').classList.contains('visible')).toBe(false);
  });

  it('opens the actual centered Plunkitt cover while leaving its pedestal alone', async () => {
    await enter();
    const volume = scene.getObjectByName('Plunkitt volume')!;
    await mouseLookAt(new RealThree.Vector3(0.42, 0.9, 0));
    key('KeyE'); await frames(3);
    expect(byId('reading-overlay').classList.contains('visible')).toBe(false);
    await mouseLookAt(volume.getWorldPosition(new RealThree.Vector3()));
    document.body.dispatchEvent(new MouseEvent('click', { button: 0, clientX: 20, clientY: 20, bubbles: true }));
    await frames(8);
    expect(byId('reading-content').classList.contains('full-book-view')).toBe(true);
    expect(byId('reading-overlay').classList.contains('visible')).toBe(true);
    byId('reader-close').click(); await frames(4); pause();
  });

  it('gives E and Enter the same centered target independently of pointer coordinates', async () => {
    await enter();
    const target = shelfTarget();
    for (const code of ['KeyE', 'Enter']) {
      await mouseLookAt(target.world);
      pointer('pointermove', 1000, 740); await frames(3);
      key(code, 'keydown', byId('library-canvas')); await frames(8);
      expect(byId('reading-overlay').classList.contains('visible')).toBe(true);
      expect(byId('reading-text').textContent).toContain(target.fragment.quote);
      byId('reader-close').click(); await frames(4);
    }
    pause();
  });

  it('keeps touch center targeting after drag contact ends and opens the centered book with Read', async () => {
    coarsePointer = true;
    await enter();
    const target = scene.getObjectByName('Plunkitt volume')!.getWorldPosition(new RealThree.Vector3());
    const direction = target.sub(camera.position).normalize();
    const orientation = new RealThree.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
    const dx = (orientation.y - Math.atan2(-direction.x, -direction.z)) / 0.004;
    const dy = (orientation.x - Math.asin(direction.y)) / 0.004;
    const rect = byId('library-canvas').getBoundingClientRect();
    const x = rect.left + rect.width / 2, y = rect.top + rect.height / 2;
    pointer('pointerdown', x, y, 'touch');
    pointer('pointermove', x + 30, y, 'touch');
    pointer('pointermove', x + dx, y + dy, 'touch');
    pointer('pointerup', x + dx, y + dy, 'touch');
    pointer('pointerleave', x + dx, y + dy, 'touch');
    pointer('click', x + dx, y + dy, 'touch');
    await frames(6);
    expect((byId('touch-controls') as HTMLElement).hidden).toBe(false);
    expect((byId('touch-read') as HTMLButtonElement).disabled).toBe(false);
    expect(byId('object-label').textContent).toContain('Plunkitt of Tammany Hall');
    expect(byId('reading-overlay').classList.contains('visible')).toBe(false);
    byId('touch-read').click(); await frames(8);
    expect(byId('reading-overlay').classList.contains('visible')).toBe(true);
    expect(byId('reading-content').classList.contains('full-book-view')).toBe(true);
    byId('reader-close').click(); await frames(4);
    clickAt(20, 20, 'touch'); await frames(3);
    expect(byId('reading-overlay').classList.contains('visible')).toBe(false);
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

  it('offers visible page controls and keeps Contents expanded state synchronized', async () => {
    localStorage.removeItem('library-plunkitt-position');
    byId('read-without-3d').click(); await frames(8);
    expect((byId('reader-pagination') as HTMLElement).hidden).toBe(false);
    expect((byId('reader-prev') as HTMLButtonElement).disabled).toBe(true);
    expect((byId('reader-next') as HTMLButtonElement).disabled).toBe(false);
    const firstPosition = byId('reader-position').textContent;
    byId('reader-next').click();
    expect(byId('reader-position').textContent).not.toBe(firstPosition);
    expect((byId('reader-prev') as HTMLButtonElement).disabled).toBe(false);
    byId('reader-prev').click();
    expect(byId('reader-position').textContent).toBe(firstPosition);
    byId('reader-contents').click();
    expect(byId('reader-contents').getAttribute('aria-expanded')).toBe('true');
    expect(byId('reading-content').classList.contains('contents-open')).toBe(true);
    (document.querySelector('#rail-chapters button') as HTMLButtonElement).click();
    expect(byId('reader-contents').getAttribute('aria-expanded')).toBe('false');
    byId('reader-contents').click(); byId('reader-close').click(); await frames(4);
    expect(byId('reader-contents').getAttribute('aria-expanded')).toBe('false');
    expect(byId('reading-content').classList.contains('contents-open')).toBe(false);
    expect((byId('reader-pagination') as HTMLElement).hidden).toBe(true);
  });

  it.each([[650, 230], [304, 230]])('initializes a readable spread at stage size %i by %i', async (width, height) => {
    stageWidth = width; stageHeight = height;
    localStorage.removeItem('library-plunkitt-position');
    byId('read-without-3d').click(); await frames(8);
    const page = byId('well-right');
    expect(parseFloat(page.style.width)).toBeGreaterThan(240);
    expect(document.querySelector('.page-text')?.textContent).toContain('Plunkitt of Tammany Hall');
    expect(byId('reader-position').textContent).toMatch(/Pages? \d/);
    expect((byId('reader-next') as HTMLButtonElement).disabled).toBe(false);
  });

  it('cancels a borrowed book mid-flight without a stale reader and permits a fresh opening', async () => {
    (byId('room-motion') as HTMLInputElement).checked = false;
    byId('room-motion').dispatchEvent(new Event('change'));
    await enter();
    const target = shelfTarget();
    const before = new RealThree.Matrix4(); target.mesh.getMatrixAt(target.index, before);
    await mouseLookAt(target.world); key('KeyE'); await frames(2);
    expect(byId('reading-overlay').classList.contains('visible')).toBe(false);
    key('Escape');
    key('KeyE');
    await frames(100);
    const restored = new RealThree.Matrix4(); target.mesh.getMatrixAt(target.index, restored);
    expect(restored.elements).toEqual(before.elements);
    expect(byId('reading-overlay').classList.contains('visible')).toBe(false);
    expect(byId('start-prompt').classList.contains('visible')).toBe(false);
    expect(document.body.classList.contains('exploring')).toBe(true);
    pause(); byId('read-without-3d').click(); await frames(8);
    expect(byId('reading-overlay').classList.contains('visible')).toBe(true);
    expect(byId('reading-content').classList.contains('full-book-view')).toBe(true);
  });

  it('falls back to centered drag controls if pointer lock is rejected', async () => {
    vi.mocked(HTMLElement.prototype.requestPointerLock).mockRejectedValueOnce(new Error('Unavailable'));
    await enter(); await frames(3);
    expect(document.body.classList.contains('pointer-locked')).toBe(false);
    expect(document.body.classList.contains('exploring')).toBe(true);
    expect((byId('touch-controls') as HTMLElement).hidden).toBe(false);
    const before = camera.quaternion.clone();
    pointer('pointerdown', 300, 300); pointer('pointermove', 330, 300);
    pointer('pointercancel', 330, 300); await frames(3);
    const afterCancel = camera.quaternion.clone();
    expect(afterCancel.equals(before)).toBe(false);
    pointer('pointermove', 800, 300); await frames(3);
    expect(camera.quaternion.equals(afterCancel)).toBe(true);
    clickAt(20, 20); await frames(3);
    expect(byId('reading-overlay').classList.contains('visible')).toBe(false);
  });
});
