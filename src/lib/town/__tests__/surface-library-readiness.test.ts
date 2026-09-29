// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadSurfaceLibrary, releaseSurfaceLibrary, surfaceSet, SURFACE_KINDS } from '../surface-library';

const base = 'https://example.test/town/manifest.json';
const bitmap = () => ({ width: 512, height: 512, close: vi.fn() });
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, blob: async () => new Blob() }));
  vi.stubGlobal('createImageBitmap', vi.fn().mockImplementation(async () => bitmap()));
});
afterEach(() => { releaseSurfaceLibrary(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('authored surface startup readiness', () => {
  it('awaits every full image while keeping the shared placeholder texture objects', async () => {
    const owner = {}, ready = loadSurfaceLibrary(base, true, new AbortController().signal, owner);
    const albedo = surfaceSet('asphalt')!.albedo;
    expect(albedo.image.width).toBe(1);
    await ready;
    expect(surfaceSet('asphalt')!.albedo).toBe(albedo);
    expect(albedo.image.width).toBe(512);
    expect(albedo.generateMipmaps).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(SURFACE_KINDS.length * 3);
    const close = albedo.image.close;
    releaseSurfaceLibrary({}); expect(close).not.toHaveBeenCalled();
    releaseSurfaceLibrary(owner); releaseSurfaceLibrary(owner); expect(close).toHaveBeenCalledOnce();
  });

  it('keeps usable placeholder tones after failed requests', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 503 } as Response);
    await expect(loadSurfaceLibrary(base, false, new AbortController().signal, {})).rejects.toThrow('503');
    expect(surfaceSet('asphalt')!.albedo.image.width).toBe(1);
    expect(surfaceSet('asphalt')!.normal).toBeNull();
    expect(createImageBitmap).not.toHaveBeenCalled();
  });

  it('bounds a stalled decode and closes every image that finishes after the deadline', async () => {
    vi.useFakeTimers();
    const finish: ((image: ImageBitmap) => void)[] = [];
    vi.mocked(createImageBitmap).mockImplementation(() => new Promise(resolve => { finish.push(resolve); }));
    const ready = loadSurfaceLibrary(base, false, new AbortController().signal, {});
    const failed = expect(ready).rejects.toThrow('taking longer');
    await flush(); expect(finish).toHaveLength(SURFACE_KINDS.length);
    await vi.advanceTimersByTimeAsync(12000); await failed;
    const late = finish.map(resolve => { const image = bitmap(); resolve(image as unknown as ImageBitmap); return image; });
    await flush();
    expect(late.every(image => image.close.mock.calls.length === 1)).toBe(true);
    expect(surfaceSet('asphalt')!.albedo.image.width).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('settles cancellation promptly even when fetch ignores abort', async () => {
    vi.useFakeTimers();
    vi.mocked(fetch).mockImplementation(() => new Promise(() => {}));
    const request = new AbortController(), holder = {};
    const ready = loadSurfaceLibrary(base, true, request.signal, holder);
    const aborted = expect(ready).rejects.toMatchObject({ name: 'AbortError' });
    await flush(); request.abort(); await aborted;
    expect(vi.getTimerCount()).toBe(0);
    const next = loadSurfaceLibrary(base, false, new AbortController().signal, holder);
    const released = expect(next).rejects.toMatchObject({ name: 'AbortError' });
    releaseSurfaceLibrary(holder); await released;
    expect(surfaceSet('asphalt')).toBeUndefined(); expect(vi.getTimerCount()).toBe(0);
  });
});
