// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createSummerSky } from '../atmosphere';
import { CLOUD_DENSITY_URL, installCloudDensity, loadCloudDensity, streamCloudSky } from '../cloud-density';

const pmrem = vi.hoisted(() => ({ maps: [] as unknown[], disposed: vi.fn() }));
vi.mock('three', async importOriginal => {
  const actual = await importOriginal<typeof import('three')>();
  return { ...actual, PMREMGenerator: class {
    fromScene(scene: THREE.Scene) {
      pmrem.maps.push((scene.children[0] as THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>).material.uniforms.summerCloudDensity.value);
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
  pmrem.maps.length = 0; pmrem.disposed.mockClear();
  bitmap = { width: 2048, height: 1024, close: vi.fn() };
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, blob: async () => new Blob() }));
  vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bitmap));
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('optional cloud density artwork', () => {
  it('decodes a vertically oriented non-color density map with seamless longitude sampling', async () => {
    const signal = new AbortController().signal, texture = await loadCloudDensity(signal);
    expect(fetch).toHaveBeenCalledWith(CLOUD_DENSITY_URL, { signal });
    expect(createImageBitmap).toHaveBeenCalledWith(expect.any(Blob), { imageOrientation: 'flipY', premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
    expect(texture.flipY).toBe(false); expect(texture.colorSpace).toBe(THREE.NoColorSpace);
    expect(texture.wrapS).toBe(THREE.RepeatWrapping); expect(texture.wrapT).toBe(THREE.ClampToEdgeWrapping);
    expect(texture.minFilter).toBe(THREE.LinearFilter); expect(texture.generateMipmaps).toBe(false);
    texture.dispose(); bitmap.close();
  });

  it('closes a decoded bitmap that arrives after cancellation', async () => {
    const request = new AbortController();
    vi.mocked(createImageBitmap).mockImplementationOnce(async () => { request.abort(); return bitmap as ImageBitmap; });
    await expect(loadCloudDensity(request.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(bitmap.close).toHaveBeenCalledTimes(1);
  });

  it('shares one texture across visible sky and reflection sky without changing their horizon treatment', async () => {
    const texture = await loadCloudDensity(new AbortController().signal), visible = createSummerSky(direction), reflection = createSummerSky(direction, { surroundings: true });
    for (const sky of [visible, reflection]) {
      installCloudDensity(sky, texture);
      expect(sky.material.uniforms.summerCloudDensity.value).toBe(texture);
      expect(sky.material.fragmentShader).not.toContain('cloudField(cloudUV');
      expect(sky.material.fragmentShader).toContain('townEveningSky(color,direction');
    }
    expect(visible.material.uniforms.summerSurroundings.value).toBe(0); expect(reflection.material.uniforms.summerSurroundings.value).toBe(1);
    destroy(visible); destroy(reflection); texture.dispose(); bitmap.close();
  });

  it('refreshes reflections once and releases only its owned density map on session disposal', async () => {
    const sky = createSummerSky(direction), request = new AbortController(), replace = vi.fn();
    const dispose = streamCloudSky(renderer, sky, direction, request.signal, replace);
    await vi.waitFor(() => expect(replace).toHaveBeenCalledTimes(1));
    const texture = sky.material.uniforms.summerCloudDensity.value as THREE.Texture, release = vi.spyOn(texture, 'dispose');
    expect(pmrem.maps).toEqual([texture]); expect(pmrem.disposed).toHaveBeenCalledTimes(1); expect(fetch).toHaveBeenCalledTimes(1);
    request.abort(); dispose();
    expect(release).toHaveBeenCalledTimes(1); expect(bitmap.close).toHaveBeenCalledTimes(1);
    replace.mock.calls[0][0].dispose(); destroy(sky);
  });

  it('leaves the original procedural sky and environment untouched when the optional image fails', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response);
    const sky = createSummerSky(direction), original = sky.material.fragmentShader, replace = vi.fn();
    const dispose = streamCloudSky(renderer, sky, direction, new AbortController().signal, replace);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(sky.material.fragmentShader).toBe(original); expect(replace).not.toHaveBeenCalled(); expect(pmrem.maps).toEqual([]);
    expect(createImageBitmap).not.toHaveBeenCalled(); dispose(); destroy(sky);
  });

  it('starts no request for an already-disposed session', () => {
    const request = new AbortController(); request.abort(); const sky = createSummerSky(direction);
    streamCloudSky(renderer, sky, direction, request.signal, vi.fn())();
    expect(fetch).not.toHaveBeenCalled(); destroy(sky);
  });
});
