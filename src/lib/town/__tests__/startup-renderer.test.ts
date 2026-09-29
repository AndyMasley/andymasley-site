// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { STARTUP_RENDERER_LIMITS, warmStartupRenderer } from '../startup-renderer';

function fixture() {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
  camera.position.set(2, 3, 4); camera.lookAt(10, 1, -10);
  const quaternion = camera.quaternion.clone(), controller = new AbortController();
  const canvas = new EventTarget(), material = new THREE.MeshStandardMaterial();
  scene.add(new THREE.Mesh(new THREE.BoxGeometry(), material));
  const programs = new Map<string, { isReady: () => boolean }>();
  const get = vi.fn(() => ({ programs }));
  const gl = { isContextLost: vi.fn(() => false) };
  const renderer = {
    domElement: canvas, getContext: () => gl, properties: { get },
    compile: vi.fn(() => new Set([material])), initTexture: vi.fn(),
  };
  const render = vi.fn(), onProgress = vi.fn();
  const args = { renderer: renderer as unknown as THREE.WebGLRenderer, scene, camera, signal: controller.signal, render, onProgress };
  return { scene, camera, quaternion, controller, canvas, material, programs, get, gl, renderer, render, onProgress, args };
}

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('covered startup renderer warmup', () => {
  it('initializes unique material and uniform textures and all shared shader variants before real pipeline views', async () => {
    const f = fixture(), texture = new THREE.DataTexture(new Uint8Array(4), 1, 1), extra = texture.clone();
    const target = new THREE.WebGLRenderTarget(1, 1);
    f.material.map = texture; f.material.normalMap = texture;
    const shader = new THREE.ShaderMaterial({ uniforms: { samples: { value: [texture, extra, target.texture] } } });
    f.scene.add(new THREE.Mesh(new THREE.BoxGeometry(), shader));
    let ready = false;
    const early = { isReady: vi.fn(() => ready) }, last = { isReady: vi.fn(() => true) };
    f.programs.set('early-shared-variant', early); f.programs.set('last-shared-variant', last);
    setTimeout(() => { ready = true; }, 25);
    const views: number[][] = [];
    f.render.mockImplementation(() => { expect(ready).toBe(true); views.push(f.camera.quaternion.toArray()); });
    const compile = vi.fn(() => new Set([f.material]));
    const result = warmStartupRenderer({ ...f.args, compile });
    await vi.runAllTimersAsync();
    expect(await result).toMatchObject({ textures: 2, initializedTextures: 2, programs: 2, renderedFrames: 5, timedOut: false });
    expect(f.renderer.initTexture.mock.calls.map(([value]) => value)).toEqual([texture, extra]);
    expect(compile).toHaveBeenCalledOnce(); expect(f.renderer.compile).not.toHaveBeenCalled();
    expect(early.isReady.mock.calls.length).toBeGreaterThan(1); expect(last.isReady).toHaveBeenCalled();
    expect(views[0]).toEqual(f.quaternion.toArray()); expect(views[4]).toEqual(f.quaternion.toArray());
    expect(new Set(views.map(value => JSON.stringify(value))).size).toBe(4);
    expect(f.camera.quaternion.equals(f.quaternion)).toBe(true); expect(f.camera.position.toArray()).toEqual([2, 3, 4]);
    expect(vi.getTimerCount()).toBe(0); target.dispose();
  });

  it('cancels pending shader polling before disposed material caches can be accessed', async () => {
    const f = fixture(), program = { isReady: vi.fn(() => false) };
    f.programs.set('pending', program);
    const remove = vi.spyOn(f.canvas, 'removeEventListener');
    const result = warmStartupRenderer(f.args), rejected = expect(result).rejects.toMatchObject({ name: 'AbortError' });
    await vi.advanceTimersByTimeAsync(0);
    const reads = program.isReady.mock.calls.length;
    f.controller.abort(); await rejected;
    f.get.mockImplementation(() => { throw new Error('renderer disposed'); });
    await vi.runAllTimersAsync();
    expect(program.isReady).toHaveBeenCalledTimes(reads); expect(f.render).not.toHaveBeenCalled();
    expect(remove).toHaveBeenCalledWith('webglcontextlost', expect.any(Function));
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cancels on context loss and restores the camera even when a covered render fails', async () => {
    const f = fixture(); f.programs.set('pending', { isReady: () => false });
    const result = warmStartupRenderer(f.args), rejected = expect(result).rejects.toMatchObject({ name: 'AbortError' });
    await vi.advanceTimersByTimeAsync(0);
    f.gl.isContextLost.mockReturnValue(true); f.canvas.dispatchEvent(new Event('webglcontextlost'));
    await rejected; expect(vi.getTimerCount()).toBe(0);
    expect(f.camera.quaternion.equals(f.quaternion)).toBe(true); expect(f.render).not.toHaveBeenCalled();

    const second = fixture(); second.render.mockImplementationOnce(() => {}).mockImplementationOnce(() => { throw new Error('draw failed'); });
    const failed = warmStartupRenderer(second.args), failure = expect(failed).rejects.toThrow('draw failed');
    await vi.runAllTimersAsync(); await failure;
    expect(second.camera.quaternion.equals(second.quaternion)).toBe(true); expect(vi.getTimerCount()).toBe(0);
  });

  it('bounds an unfinished shader poll and still submits the original playable view', async () => {
    const f = fixture(); f.programs.set('pending', { isReady: () => false });
    f.render.mockImplementation(() => expect(f.camera.quaternion.equals(f.quaternion)).toBe(true));
    const result = warmStartupRenderer(f.args);
    await vi.advanceTimersByTimeAsync(STARTUP_RENDERER_LIMITS.durationMs + 1);
    expect(await result).toMatchObject({ timedOut: true, renderedFrames: 1 });
    expect(f.render).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
  });

  it('waits nonblockingly for real GPU work and deletes its fence on completion or abort', async () => {
    for (const abort of [false, true]) {
      const f = fixture(), fence = {};
      const gl = Object.assign(f.gl, {
        SYNC_GPU_COMMANDS_COMPLETE: 1, ALREADY_SIGNALED: 2, CONDITION_SATISFIED: 3, WAIT_FAILED: 4,
        fenceSync: vi.fn(() => fence), flush: vi.fn(), deleteSync: vi.fn(),
        clientWaitSync: vi.fn().mockReturnValueOnce(5).mockReturnValue(2),
      });
      const result = warmStartupRenderer(f.args);
      const rejection = abort ? expect(result).rejects.toMatchObject({ name: 'AbortError' }) : undefined;
      for (let i = 0; i < 10 && !gl.fenceSync.mock.calls.length; i++) await vi.advanceTimersToNextTimerAsync();
      expect(gl.fenceSync).toHaveBeenCalledOnce();
      if (abort) { f.controller.abort(); await rejection; }
      else { await vi.runAllTimersAsync(); expect((await result).gpuReady).toBe(true); }
      expect(gl.deleteSync).toHaveBeenCalledWith(fence); expect(vi.getTimerCount()).toBe(0);
    }
  });
});
