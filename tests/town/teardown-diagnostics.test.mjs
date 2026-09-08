// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installTextureFailureProbe, retiredTextureDiagnostic } from './teardown-diagnostics.mjs';
const error = { generation: 1, uri: '../textures/source.jpg', time: 1000, name: 'AbortError', retired: true, aborted: true, imageCacheDisposed: true };
const generation = { generation: 1, retired: true, aborted: true, children: 0, loaded: 0, inflight: 0, resources: { materialCount: 0, textureCount: 0, estimatedTextureBytes: 0, estimatedGeometryBytes: 0 }, cacheBytes: 0, activeDetailRequests: 0, queuedDetailRequests: 0, imageResources: { pending: 0, objectURLs: 0 } };
const entry = { type: 'error', text: "THREE.GLTFLoader: Couldn't load texture ../textures/source.jpg", time: 1001 };
const probe = (e = error, g = generation) => ({ errors: [e], generations: [g] });
afterEach(() => vi.unstubAllGlobals());
describe('strict test-only retired texture diagnostics', () => {
  it('accepts only the exact correlated AbortError after all retired resources are released', () => {
    expect(retiredTextureDiagnostic(entry, probe())).toBe(error);
    for (const changed of [{ uri: 'other.jpg' }, { time: 9999 }, { name: 'Error' }, { retired: false }, { aborted: false }, { imageCacheDisposed: false }]) expect(retiredTextureDiagnostic(entry, probe({ ...error, ...changed }))).toBeNull();
  });
  it('does not excuse live objects, requests, retained textures or pending image decoding', () => {
    for (const changed of [{ retired: false }, { children: 1 }, { loaded: 1 }, { inflight: 1 }, { cacheBytes: 1 }, { activeDetailRequests: 1 }, { queuedDetailRequests: 1 }, { resources: { textureCount: 1 } }, { imageResources: { pending: 1, objectURLs: 0 } }, { imageResources: { pending: 0, objectURLs: 1 } }]) expect(retiredTextureDiagnostic(entry, probe(error, { ...generation, ...changed }))).toBeNull();
  });
  it('observer rethrows identical errors and leaves live decode or HTTP failures unexpected', async () => {
    for (const retired of [false, true]) {
      const failure = retired ? new DOMException('Retired scene', 'AbortError') : new Error('503 / decoder failure');
      const parser = { json: { images: [{ uri: '../textures/source.jpg' }] }, options: { path: 'https://example.test/tiles/' }, loadImageSource: vi.fn(() => Promise.reject(failure)) };
      const world = { loader: { register: factory => factory(parser) }, disposed: retired, sharedAbort: { signal: { aborted: retired } }, sourceImages: { disposed: retired } };
      vi.stubGlobal('window', { __townSmoke: {}, __webster: { world } });
      installTextureFailureProbe(); const wrapped = parser.loadImageSource; installTextureFailureProbe(); expect(parser.loadImageSource).toBe(wrapped);
      await expect(parser.loadImageSource(0)).rejects.toBe(failure);
      const observed = window.__townSmoke.textureProbe.errors[0];
      expect(observed).toMatchObject({ uri: '../textures/source.jpg', url: 'https://example.test/textures/source.jpg', retired, aborted: retired, name: failure.name });
      if (!retired) expect(retiredTextureDiagnostic({ ...entry, time: observed.time }, probe(observed))).toBeNull();
    }
  });
});
