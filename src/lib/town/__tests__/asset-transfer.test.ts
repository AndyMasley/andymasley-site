// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { gzipSync } from 'node:zlib';
import { compressedSceneURL, readSceneBuffer } from '../asset-transfer';
import release from '../../../../data/derived/town/release.json';

const rawURL = `https://example.test/town-assets/${release.directory}/tiles/-12_-4-0.glb`;
const compressedURL = `https://example.test/town-transfer/gzip-v1/${release.directory}/tiles/-12_-4-0.glb.gz`;
const glb = (() => {
  const text = JSON.stringify({ asset: { version: '2.0' } });
  const json = new TextEncoder().encode(text.padEnd(Math.ceil(text.length / 4) * 4));
  const bytes = new Uint8Array(20 + json.length), view = new DataView(bytes.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, bytes.length, true);
  view.setUint32(12, json.length, true);
  view.setUint32(16, 0x4e4f534a, true);
  bytes.set(json, 20);
  return bytes.buffer;
})();
const gzip = Uint8Array.from(gzipSync(new Uint8Array(glb))).buffer;
const signal = () => new AbortController().signal;

afterEach(() => vi.unstubAllGlobals());

describe('Lossless scenery transfer', () => {
  it('maps only pinned scene GLBs to a same-origin compressed sidecar and preserves the query', () => {
    expect(compressedSceneURL(rawURL)).toBe(compressedURL);
    expect(compressedSceneURL(`${rawURL}?check=1`)).toBe(`${compressedURL}?check=1`);
    expect(compressedSceneURL(rawURL.replace(release.directory, 'another-release'))).toBeUndefined();
    expect(compressedSceneURL(rawURL.replace('.glb', '.png'))).toBeUndefined();
    expect(compressedSceneURL('https://example.test/unrelated/model.glb')).toBeUndefined();
  });

  it('decodes to the exact original GLB and counts encoded transfer bytes', async () => {
    const fetch = vi.fn(async () => new Response(gzip, { headers: { 'Content-Length': String(gzip.byteLength) } }));
    vi.stubGlobal('fetch', fetch);
    const bytes = vi.fn(), abort = signal();
    const result = await readSceneBuffer(rawURL, abort, bytes);
    expect(new Uint8Array(result)).toEqual(new Uint8Array(glb));
    expect(fetch).toHaveBeenCalledExactlyOnceWith(compressedURL, { signal: abort });
    expect(bytes).toHaveBeenCalledExactlyOnceWith(gzip.byteLength);
  });

  it('uses received buffer length when the successful response has no content length', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(gzip)));
    const bytes = vi.fn();
    await readSceneBuffer(rawURL, signal(), bytes);
    expect(bytes).toHaveBeenCalledExactlyOnceWith(gzip.byteLength);
  });

  it('accepts a GLB already decoded by the host without decompressing it a second time', async () => {
    const decompress = vi.fn(() => { throw new Error('must not decompress a GLB'); });
    vi.stubGlobal('DecompressionStream', decompress);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(glb, { headers: { 'Content-Length': '31' } })));
    const bytes = vi.fn();
    expect(new Uint8Array(await readSceneBuffer(rawURL, signal(), bytes))).toEqual(new Uint8Array(glb));
    expect(decompress).not.toHaveBeenCalled();
    expect(bytes).toHaveBeenCalledExactlyOnceWith(31);
  });

  it('requests only raw scenery when streaming decompression is unsupported', async () => {
    vi.stubGlobal('DecompressionStream', undefined);
    const fetch = vi.fn(async () => new Response(glb));
    vi.stubGlobal('fetch', fetch);
    const bytes = vi.fn(), abort = signal();
    expect(new Uint8Array(await readSceneBuffer(rawURL, abort, bytes))).toEqual(new Uint8Array(glb));
    expect(fetch).toHaveBeenCalledExactlyOnceWith(rawURL, { signal: abort });
    expect(bytes).toHaveBeenCalledExactlyOnceWith(glb.byteLength);
  });

  it('requests only raw scenery for unversioned external assets', async () => {
    const fetch = vi.fn(async () => new Response(glb));
    vi.stubGlobal('fetch', fetch);
    const url = 'https://example.test/other.glb', abort = signal();
    await readSceneBuffer(url, abort, vi.fn());
    expect(fetch).toHaveBeenCalledExactlyOnceWith(url, { signal: abort });
  });

  it('falls back to raw scenery when the compressed sidecar is missing', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response('missing', { status: 404 })).mockResolvedValueOnce(new Response(glb));
    vi.stubGlobal('fetch', fetch);
    const bytes = vi.fn();
    expect(new Uint8Array(await readSceneBuffer(rawURL, signal(), bytes))).toEqual(new Uint8Array(glb));
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([compressedURL, rawURL]);
    expect(bytes).toHaveBeenCalledExactlyOnceWith(glb.byteLength);
  });

  it.each([
    ['corrupt gzip', new Uint8Array([31, 139, 8, 255]).buffer],
    ['gzip containing another format', Uint8Array.from(gzipSync('not a GLB')).buffer],
  ])('falls back after %s and counts both received payloads', async (_label, damaged) => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response(damaged)).mockResolvedValueOnce(new Response(glb));
    vi.stubGlobal('fetch', fetch);
    const bytes = vi.fn();
    expect(new Uint8Array(await readSceneBuffer(rawURL, signal(), bytes))).toEqual(new Uint8Array(glb));
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([compressedURL, rawURL]);
    expect(bytes.mock.calls.map(([count]) => count)).toEqual([damaged.byteLength, glb.byteLength]);
  });

  it('never starts a raw fallback after fetch reports cancellation', async () => {
    const abortError = new DOMException('cancelled', 'AbortError');
    const fetch = vi.fn().mockRejectedValue(abortError);
    vi.stubGlobal('fetch', fetch);
    const bytes = vi.fn();
    await expect(readSceneBuffer(rawURL, signal(), bytes)).rejects.toBe(abortError);
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([compressedURL]);
    expect(bytes).not.toHaveBeenCalled();
  });

  it('never starts a raw fallback when cancellation arrives while reading the payload', async () => {
    const abort = new AbortController(), bytes = vi.fn();
    const fetch = vi.fn(async (_source: string) => ({
      ok: true,
      headers: new Headers(),
      arrayBuffer: async () => { abort.abort(); return gzip; },
    }));
    vi.stubGlobal('fetch', fetch);
    await expect(readSceneBuffer(rawURL, abort.signal, bytes)).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([compressedURL]);
    expect(bytes).toHaveBeenCalledExactlyOnceWith(gzip.byteLength);
  });

  it('propagates the raw failure after a compressed failure without retrying indefinitely', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response(null, { status: 404 })).mockResolvedValueOnce(new Response(null, { status: 503 }));
    vi.stubGlobal('fetch', fetch);
    await expect(readSceneBuffer(rawURL, signal(), vi.fn())).rejects.toThrow('Scenery could not load (503).');
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([compressedURL, rawURL]);
  });
});
