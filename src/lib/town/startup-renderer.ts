import * as THREE from 'three';
export { CameraRaycastIndex } from './camera-raycast';

export const STARTUP_RENDERER_LIMITS = { textures: 512, sliceMs: 8, durationMs: 20000, pollMs: 10 } as const;

export type StartupRendererMetrics = {
  textures: number; initializedTextures: number; programs: number; renderedFrames: number;
  durationMs: number; timedOut: boolean; gpuReady: boolean;
};

type Options = {
  renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera; signal: AbortSignal;
  /** Runs the real quality-selected pipeline while the loading overlay covers it. */
  render: () => void;
  /** Cinematic rendering must compile into its HDR scene target, not the canvas. */
  compile?: () => Set<THREE.Material>;
  onProgress?: (done: number, total: number) => void;
};
type ReadyProgram = { isReady(): boolean };

function sceneTextures(scene: THREE.Scene): THREE.Texture[] {
  const textures = new Set<THREE.Texture>();
  const add = (value: unknown): void => {
    if (value instanceof THREE.Texture && !value.isRenderTargetTexture && value.image) textures.add(value);
    else if (Array.isArray(value)) for (const entry of value) if (entry instanceof THREE.Texture) add(entry);
  };
  scene.traverse(object => {
    const material = (object as THREE.Mesh).material;
    if (!material) return;
    for (const item of Array.isArray(material) ? material : [material]) {
      for (const value of Object.values(item)) add(value);
      if (item instanceof THREE.ShaderMaterial) for (const uniform of Object.values(item.uniforms)) add(uniform.value);
    }
  });
  add(scene.environment); add(scene.background);
  return [...textures];
}

/** Move first-use driver work behind the loader without changing visual quality.
 * The deadline bounds yields/polling and extra views; one GL submission cannot
 * be interrupted, and the final real starting view is always submitted. */
export async function warmStartupRenderer({ renderer, scene, camera, signal, render, compile, onProgress }: Options): Promise<StartupRendererMetrics> {
  const started = performance.now(), deadline = started + STARTUP_RENDERER_LIMITS.durationMs;
  const metrics: StartupRendererMetrics = { textures: 0, initializedTextures: 0, programs: 0, renderedFrames: 0, durationMs: 0, timedOut: false, gpuReady: false };
  const original = camera.quaternion.clone(), yaw = new THREE.Quaternion();
  const lifetime = new AbortController(), gl = renderer.getContext();
  const cancel = (): void => lifetime.abort(new DOMException('Town startup was cancelled', 'AbortError'));
  const contextLost = (): void => lifetime.abort(new DOMException('Town graphics context was lost', 'AbortError'));
  signal.addEventListener('abort', cancel, { once: true });
  renderer.domElement.addEventListener('webglcontextlost', contextLost);
  const check = (): void => {
    if (signal.aborted) cancel();
    if (lifetime.signal.aborted) throw lifetime.signal.reason;
    if (gl.isContextLost()) { contextLost(); throw lifetime.signal.reason; }
  };
  const expired = (): boolean => {
    if (performance.now() < deadline) return false;
    metrics.timedOut = true; return true;
  };
  const pause = (milliseconds = 0): Promise<void> => new Promise((resolve, reject) => {
    check();
    const abort = (): void => { clearTimeout(timer); lifetime.signal.removeEventListener('abort', abort); reject(lifetime.signal.reason); };
    const timer = setTimeout(() => { lifetime.signal.removeEventListener('abort', abort); resolve(); }, milliseconds);
    lifetime.signal.addEventListener('abort', abort, { once: true });
  });
  let fence: WebGLSync | null = null;
  try {
    check();
    const textures = sceneTextures(scene);
    metrics.textures = textures.length;
    const count = Math.min(textures.length, STARTUP_RENDERER_LIMITS.textures), total = count + 6;
    let done = 0, slice = performance.now();
    onProgress?.(done, total);
    for (const texture of textures.slice(0, count)) {
      check(); if (expired()) break;
      renderer.initTexture(texture); metrics.initializedTextures++; done++;
      if (performance.now() - slice >= STARTUP_RENDERER_LIMITS.sliceMs) {
        onProgress?.(done, total); await pause(); check(); slice = performance.now();
      }
    }
    await pause(); check();
    const materials = compile ? compile() : renderer.compile(scene, camera);
    const programs = new Set<ReadyProgram>();
    for (const material of materials) {
      // r160 compileAsync only polls currentProgram and its hidden timeout is
      // not cancellable. Shared materials can have several geometry/side variants.
      const owned = renderer.properties.get(material).programs as Map<string, ReadyProgram> | undefined;
      for (const program of owned?.values() ?? []) if (typeof program.isReady === 'function') programs.add(program);
    }
    metrics.programs = programs.size;
    while (true) {
      check();
      if ([...programs].every(program => program.isReady()) || expired()) break;
      await pause(STARTUP_RENDERER_LIMITS.pollMs);
    }
    done++; onProgress?.(done, total);
    // Full-resolution draws allocate/upload actual shadow, geometry, texture,
    // AO, bloom and grade resources. A scene-only compile cannot do this.
    for (const angle of [0, Math.PI / 2, Math.PI, -Math.PI / 2, 0]) {
      check();
      if (expired()) break;
      camera.quaternion.copy(original).premultiply(yaw.setFromAxisAngle(camera.up, angle));
      camera.updateMatrixWorld(); render(); metrics.renderedFrames++; done++;
      onProgress?.(done, total); await pause();
    }
    check();
    camera.quaternion.copy(original); camera.updateMatrixWorld();
    if (metrics.renderedFrames !== 5) { render(); metrics.renderedFrames++; }
    check();
    // Wait for submitted uploads/draws without a blocking finish/readPixels.
    if ('fenceSync' in gl) {
      const gl2 = gl as WebGL2RenderingContext;
      fence = gl2.fenceSync(gl2.SYNC_GPU_COMMANDS_COMPLETE, 0); gl2.flush();
      if (fence) while (true) {
        check();
        const status = gl2.clientWaitSync(fence, 0, 0);
        if (status === gl2.ALREADY_SIGNALED || status === gl2.CONDITION_SATISFIED) { metrics.gpuReady = true; break; }
        if (status === gl2.WAIT_FAILED || expired()) break;
        await pause(STARTUP_RENDERER_LIMITS.pollMs);
      }
    }
    onProgress?.(total, total);
    metrics.durationMs = performance.now() - started;
    return metrics;
  } finally {
    camera.quaternion.copy(original); camera.updateMatrixWorld();
    signal.removeEventListener('abort', cancel);
    renderer.domElement.removeEventListener('webglcontextlost', contextLost);
    if (fence && !gl.isContextLost()) (gl as WebGL2RenderingContext).deleteSync(fence);
  }
}
