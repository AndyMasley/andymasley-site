// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readCriticalJson, withLoadDeadline } from '../critical-load';
import { gzipSync } from 'node:zlib';
import release from '../../../../data/derived/town/release.json';

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
describe('critical load lifecycle', () => {
  it('bounds a response body that stalls after successful headers and aborts its request', async () => {
    vi.useFakeTimers(); let request!: AbortSignal;
    vi.stubGlobal('fetch', vi.fn(async (_url, options) => { request = options.signal; return { ok: true, headers: new Headers(), text: () => new Promise(() => {}) }; }));
    const result = readCriticalJson('/network.json', new AbortController().signal, { timeoutMs: 100, label: 'Street map' });
    const check = expect(result).rejects.toThrow('Street map is taking longer to load');
    await vi.advanceTimersByTimeAsync(100); await check; expect(request.aborted).toBe(true); expect(vi.getTimerCount()).toBe(0);
  });
  it('rejects promptly on parent abort and disposes a late decode exactly once', async () => {
    let finish!: (value: string) => void; const discard = vi.fn(), controller = new AbortController();
    const result = withLoadDeadline(controller.signal, () => new Promise<string>(resolve => { finish = resolve; }), {}, discard);
    await Promise.resolve(); const check = expect(result).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort(); await check; finish('late scene'); await Promise.resolve(); await Promise.resolve(); expect(discard).toHaveBeenCalledExactlyOnceWith('late scene');
  });
  it('does not close a successful result when its old parent later aborts', async () => {
    const discard = vi.fn(), controller = new AbortController();
    expect(await withLoadDeadline(controller.signal, async () => 'owned', {}, discard)).toBe('owned');
    controller.abort(); expect(discard).not.toHaveBeenCalled();
  });
  it('reports decoded progress without comparing it to a compressed Content-Length', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"value":7}', { headers: { 'content-length': '4', 'content-encoding': 'gzip' } })));
    const progress = vi.fn();
    expect(await readCriticalJson('/data', new AbortController().signal, { onProgress: progress })).toEqual({ value: 7 });
    expect(progress).toHaveBeenLastCalledWith({ receivedBytes: 11, totalBytes: undefined });
  });
  it('rejects HTML and a failed HTTP response with retryable asset-specific errors', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response('<html>missing</html>')).mockResolvedValueOnce(new Response('', { status: 503 })); vi.stubGlobal('fetch', fetch);
    await expect(readCriticalJson('/map', new AbortController().signal, { label: 'Street map' })).rejects.toThrow('Street map was incomplete or invalid');
    await expect(readCriticalJson('/map', new AbortController().signal)).rejects.toThrow('(503)');
  });
  it('uses the pinned JSON sidecar for the root-relative startup URL in the rendered page', async () => {
    vi.stubGlobal('location', { href: 'https://example.test/town/' });
    const url = `/town-assets/${release.directory}/manifest.json`;
    const fetch = vi.fn(async () => new Response(Uint8Array.from(gzipSync('{"ready":true}')))); vi.stubGlobal('fetch', fetch);
    expect(await readCriticalJson(url, new AbortController().signal)).toEqual({ ready: true });
    expect(fetch).toHaveBeenCalledExactlyOnceWith(`https://example.test/town-transfer/json-gzip-v1${url}.gz`, expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });
  it('decodes exact lossless JSON sidecars without a raw request, and raw-falls back when unavailable', async () => {
    const url = `https://example.test/town-assets/${release.directory}/manifest.json`;
    const bytes = Uint8Array.from(gzipSync('{"edge":123,"name":"Lake — Road"}'));
    const fetch = vi.fn().mockResolvedValueOnce(new Response(bytes)).mockResolvedValueOnce(new Response('', { status: 404 })).mockResolvedValueOnce(new Response('{"edge":456}'));
    vi.stubGlobal('fetch', fetch); const progress = vi.fn();
    expect(await readCriticalJson(url, new AbortController().signal, { onProgress: progress })).toEqual({ edge: 123, name: 'Lake — Road' });
    expect(fetch.mock.calls[0][0]).toContain('/town-transfer/json-gzip-v1/town-assets/');
    expect(progress).toHaveBeenLastCalledWith({ receivedBytes: bytes.length, totalBytes: undefined });
    expect(await readCriticalJson(url, new AbortController().signal)).toEqual({ edge: 456 }); expect(fetch.mock.calls[2][0]).toBe(url);
  });
});
