// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import type { GLTFLoader, GLTFLoaderPlugin, GLTFParser } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as THREE from 'three';
import release from '../../../../data/derived/town/release.json';
import { SourceImageCache } from '../source-image-cache';
const origin = 'https://example.test', url = `${origin}/town-assets/${release.directory}/textures/example.jpg`;
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
function parser(cache: SourceImageCache, load: (url: string, done: (value: object) => void, progress: unknown, failed: (error: unknown) => void) => unknown) {
  const value = { textureLoader: { load, isImageBitmapLoader: true } } as unknown as GLTFParser;
  const loader = { register: vi.fn((factory: (parser: GLTFParser) => GLTFLoaderPlugin) => { factory(value); return loader; }) } as unknown as GLTFLoader;
  cache.install(loader); cache.install(loader);
  expect(loader.register).toHaveBeenCalledOnce();
  const read = (source = url) => new Promise<object>((resolve, reject) => value.textureLoader.load(source, resolve, undefined, reject));
  return { read, value };
}
describe('per-world immutable encoded image requests', () => {
  it('coalesces pending URLs across parsers while retaining independently decoded images', async () => {
    let resolve!: (blob: Blob) => void;
    const read = vi.fn(() => new Promise<Blob>(r => { resolve = r; })), cache = new SourceImageCache(origin, read);
    const decoded: { close: ReturnType<typeof vi.fn>; source: string }[] = [];
    const load = vi.fn((source: string, done: (image: object) => void) => { const image = { close: vi.fn(), source }; decoded.push(image); done(image); });
    const a = parser(cache, load), b = parser(cache, load), one = a.read(), two = b.read(url.replace('/textures/', '/tiles/../textures/'));
    await flush(); expect(read).toHaveBeenCalledOnce(); resolve(new Blob(['identical source bytes']));
    const [i, j] = await Promise.all([one, two]); expect(i).not.toBe(j); expect(load).toHaveBeenCalledTimes(2);
    expect(decoded.every(image => image.source.startsWith('blob:'))).toBe(true);
    expect(cache.resources()).toMatchObject({ entries: 1, estimatedBytes: 22, joined: 1, objectURLs: 0, pending: 0 });
    await a.read(); expect(read).toHaveBeenCalledOnce(); cache.dispose();
    expect(decoded.every(image => image.close.mock.calls.length === 0)).toBe(true);
    expect(cache.resources().estimatedBytes).toBe(0);
  });
  it('bounds encoded retention and never caches oversized blobs', async () => {
    const cache = new SourceImageCache(origin, async () => new Blob([new Uint8Array(3 * 1024 * 1024)]));
    cache.setLow(true); await cache.bytes(url); await cache.bytes(url + '?second');
    expect(cache.resources()).toMatchObject({ budgetBytes: 4 * 1024 * 1024, estimatedBytes: 3 * 1024 * 1024, entries: 1, evictions: 1 });
    cache.dispose();
    const big = new SourceImageCache(origin, async () => new Blob([new Uint8Array(9 * 1024 * 1024)]));
    expect((await big.bytes(url)).size).toBe(9 * 1024 * 1024); expect(big.resources().entries).toBe(0); big.dispose();
  });
  it('keeps other releases, unrelated hosts and inline images with their normal loader', async () => {
    const read = vi.fn(async () => new Blob()), cache = new SourceImageCache(origin, read), image = {};
    const load = vi.fn((_source: string, done: (value: object) => void) => done(image)), f = parser(cache, load);
    for (const source of [url.replace(release.directory, 'old'), url.replace(origin, 'https://other.test'), 'data:image/png;base64,A', 'blob:original']) expect(await f.read(source)).toBe(image);
    expect(read).not.toHaveBeenCalled(); expect(load).toHaveBeenCalledTimes(4); cache.dispose();
  });
  it('falls back to the original decoder request after a fetch or object URL failure', async () => {
    for (const fetchFails of [true, false]) {
      const cache = new SourceImageCache(origin, async () => { if (fetchFails) throw Error('host rejects fetch'); return new Blob(['valid']); });
      const load = vi.fn((source: string, done: (value: object) => void, _progress: unknown, failed: (error: unknown) => void) => source.startsWith('blob:') ? failed(Error('decoder rejected object URL')) : done({ source }));
      expect(await parser(cache, load).read()).toEqual({ source: url }); expect(cache.resources().objectURLs).toBe(0); cache.dispose();
    }
  });
  it('cancels unresolved fetches and closes only a late unadopted decoder image', async () => {
    let signal!: AbortSignal, resolve!: (value: Blob) => void;
    const cache = new SourceImageCache(origin, async (_url, abort) => { signal = abort; return new Promise(r => { resolve = r; }); });
    const load = vi.fn(), promise = parser(cache, load).read(); const check = expect(promise).rejects.toHaveProperty('name', 'AbortError');
    await flush(); cache.dispose(); expect(signal.aborted).toBe(true); resolve(new Blob(['late'])); await check; expect(load).not.toHaveBeenCalled();
    let done!: (image: object) => void;
    const second = new SourceImageCache(origin, async () => new Blob(['valid']));
    const pending = parser(second, (_url, callback) => { done = callback; }).read(), late = expect(pending).rejects.toHaveProperty('name', 'AbortError');
    await flush(); expect(second.resources().objectURLs).toBe(1); second.dispose();
    const image = { close: vi.fn() }, texture = new THREE.Texture(image as unknown as ImageBitmap), dispose = vi.spyOn(texture, 'dispose'); done(texture); await late;
    expect(image.close).toHaveBeenCalledOnce(); expect(dispose).toHaveBeenCalledOnce(); expect(second.resources().objectURLs).toBe(0);
  });
});
