// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createSummerSky } from '../atmosphere';
import { SKY_ART_URL, installSkyArt, loadSkyArt, prepareSkyArt, streamSkyArt } from '../sky-art';

const pmrem = vi.hoisted(() => ({ maps: [] as unknown[], disposed: vi.fn(), fail: false }));
vi.mock('three', async importOriginal => {
  const actual = await importOriginal<typeof import('three')>();
  return { ...actual, PMREMGenerator: class {
    fromScene(scene: THREE.Scene) {
      pmrem.maps.push((scene.children[0] as THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>).material.uniforms.summerSkyArt.value);
      if (pmrem.fail) throw new Error('PMREM unavailable');
      return new actual.WebGLRenderTarget(16, 16);
    }
    dispose() { pmrem.disposed(); }
  } };
});

const direction = new THREE.Vector3(-290, 118, -65);
const renderer = { getContext: () => ({ isContextLost: () => false }) } as unknown as THREE.WebGLRenderer;
const destroy = (sky: ReturnType<typeof createSummerSky>) => { sky.geometry.dispose(); sky.material.dispose(); };
let bitmap: { width: number; height: number; close: () => void };
beforeEach(() => {
  pmrem.maps.length = 0; pmrem.disposed.mockClear(); pmrem.fail = false;
  bitmap = { width: 2048, height: 1024, close: vi.fn() };
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, blob: async () => new Blob() }));
  vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bitmap));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('optional photographic sky artwork', () => {
  it('reports readiness only after the image and reflection environment are installed', async () => {
    let finish!: (image: ImageBitmap) => void;
    vi.mocked(createImageBitmap).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const sky = createSummerSky(direction), replace = vi.fn(), preparation = prepareSkyArt(renderer, sky, direction, new AbortController().signal, replace);
    let ready = false; void preparation.ready.then(() => { ready = true; });
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
    expect(ready).toBe(false); expect(pmrem.maps).toEqual([]);
    finish(bitmap as ImageBitmap); await preparation.ready;
    expect(replace).toHaveBeenCalledOnce(); expect(pmrem.maps).toEqual([sky.material.uniforms.summerSkyArt.value]);
    preparation.dispose(); replace.mock.calls[0][0].dispose(); destroy(sky);
  });

  it('bounds readiness when decode ignores cancellation and releases its late bitmap', async () => {
    vi.useFakeTimers();
    let finish!: (image: ImageBitmap) => void;
    vi.mocked(createImageBitmap).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const sky = createSummerSky(direction), original = sky.material.fragmentShader, replace = vi.fn();
    const preparation = prepareSkyArt(renderer, sky, direction, new AbortController().signal, replace);
    await vi.advanceTimersByTimeAsync(12000); await preparation.ready;
    expect(replace).not.toHaveBeenCalled(); expect(sky.material.fragmentShader).toBe(original); expect(vi.getTimerCount()).toBe(0);
    finish(bitmap as ImageBitmap); await vi.advanceTimersByTimeAsync(0);
    expect(bitmap.close).toHaveBeenCalledOnce(); preparation.dispose(); destroy(sky);
  });

  it('settles cancellation promptly and releases a decoded image after context loss', async () => {
    vi.useFakeTimers();
    vi.mocked(fetch).mockImplementationOnce(() => new Promise(() => {}));
    const sky = createSummerSky(direction), request = new AbortController(), replace = vi.fn();
    const preparation = prepareSkyArt(renderer, sky, direction, request.signal, replace);
    await vi.advanceTimersByTimeAsync(0); request.abort(); await preparation.ready;
    expect(vi.getTimerCount()).toBe(0); expect(replace).not.toHaveBeenCalled();
    const lostRenderer = { getContext: () => ({ isContextLost: () => true }) } as unknown as THREE.WebGLRenderer;
    const lost = prepareSkyArt(lostRenderer, sky, direction, new AbortController().signal, replace); await lost.ready;
    expect(bitmap.close).toHaveBeenCalledOnce(); expect(pmrem.maps).toEqual([]); lost.dispose(); preparation.dispose(); destroy(sky);
  });

  it('keeps the procedural sky and frees reflection resources when PMREM fails', async () => {
    pmrem.fail = true;
    const sky = createSummerSky(direction), original = sky.material.fragmentShader, replace = vi.fn();
    const preparation = prepareSkyArt(renderer, sky, direction, new AbortController().signal, replace); await preparation.ready;
    expect(replace).not.toHaveBeenCalled(); expect(sky.material.fragmentShader).toBe(original);
    expect(pmrem.disposed).toHaveBeenCalledOnce(); expect(bitmap.close).toHaveBeenCalledOnce(); preparation.dispose(); destroy(sky);
  });

  it('keeps encoded sRGB values for shader decoding and supplies seamless oriented sampling', async () => {
    const signal = new AbortController().signal, texture = await loadSkyArt(signal);
    expect(fetch).toHaveBeenCalledWith(SKY_ART_URL, { signal });
    expect(createImageBitmap).toHaveBeenCalledWith(expect.any(Blob), { imageOrientation: 'flipY', premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
    expect(texture.flipY).toBe(false); expect(texture.colorSpace).toBe(THREE.NoColorSpace);
    expect(texture.wrapS).toBe(THREE.RepeatWrapping); expect(texture.wrapT).toBe(THREE.ClampToEdgeWrapping);
    expect(texture.minFilter).toBe(THREE.LinearFilter); expect(texture.generateMipmaps).toBe(false);
    texture.dispose(); bitmap.close();
  });

  it('closes a decoded bitmap that arrives after cancellation', async () => {
    const request = new AbortController();
    vi.mocked(createImageBitmap).mockImplementationOnce(async () => { request.abort(); return bitmap as ImageBitmap; });
    await expect(loadSkyArt(request.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(bitmap.close).toHaveBeenCalledTimes(1);
  });

  it('shares one texture across visible sky and reflection sky without changing their horizon treatment', async () => {
    const texture = await loadSkyArt(new AbortController().signal), visible = createSummerSky(direction), reflection = createSummerSky(direction, { surroundings: true });
    for (const sky of [visible, reflection]) {
      const original = sky.material.fragmentShader;
      const sunAndLandscape = original.slice(original.indexOf('// A broad warm scatter'));
      installSkyArt(sky, texture);
      expect(sky.material.uniforms.summerSkyArt.value).toBe(texture);
      expect(sky.material.fragmentShader).not.toContain('cloudField(cloudUV');
      expect(sky.material.fragmentShader).not.toContain('vec3 cloudColor');
      expect(sky.material.fragmentShader).toContain('townEveningSky(color,direction');
      expect(sky.material.fragmentShader).toContain('townSkyLinear(townSkySample(skyUV))*2.2');
      expect(sky.material.fragmentShader).toContain('step(vec3(0.04045),color)');
      expect(sky.material.fragmentShader).toContain('asin(clamp(direction.y,0.0,1.0))*0.636619772');
      expect(sky.material.fragmentShader).toContain('0.5+0.5*pow(skyLatitude,0.65)');
      expect(sky.material.fragmentShader).toContain('mix(color,skyArt,smoothstep(0.0,0.10,elevation))');
      expect(sky.material.fragmentShader.endsWith(sunAndLandscape)).toBe(true);
    }
    expect(visible.material.uniforms.summerSurroundings.value).toBe(0); expect(reflection.material.uniforms.summerSurroundings.value).toBe(1);
    destroy(visible); destroy(reflection); texture.dispose(); bitmap.close();
  });

  it('refreshes reflections once and releases only its owned sky artwork on session disposal', async () => {
    const sky = createSummerSky(direction), request = new AbortController(), replace = vi.fn();
    const dispose = streamSkyArt(renderer, sky, direction, request.signal, replace);
    await vi.waitFor(() => expect(replace).toHaveBeenCalledTimes(1));
    const texture = sky.material.uniforms.summerSkyArt.value as THREE.Texture, release = vi.spyOn(texture, 'dispose');
    expect(pmrem.maps).toEqual([texture]); expect(pmrem.disposed).toHaveBeenCalledTimes(1); expect(fetch).toHaveBeenCalledTimes(1);
    request.abort(); dispose();
    expect(release).toHaveBeenCalledTimes(1); expect(bitmap.close).toHaveBeenCalledTimes(1);
    replace.mock.calls[0][0].dispose(); destroy(sky);
  });

  it('leaves the original procedural sky and environment untouched when the optional image fails', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response);
    const sky = createSummerSky(direction), original = sky.material.fragmentShader, replace = vi.fn();
    const dispose = streamSkyArt(renderer, sky, direction, new AbortController().signal, replace);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(sky.material.fragmentShader).toBe(original); expect(replace).not.toHaveBeenCalled(); expect(pmrem.maps).toEqual([]);
    expect(createImageBitmap).not.toHaveBeenCalled(); dispose(); destroy(sky);
  });

  it('starts no request for an already-disposed session', () => {
    const request = new AbortController(); request.abort(); const sky = createSummerSky(direction);
    streamSkyArt(renderer, sky, direction, request.signal, vi.fn())();
    expect(fetch).not.toHaveBeenCalled(); destroy(sky);
  });
});
