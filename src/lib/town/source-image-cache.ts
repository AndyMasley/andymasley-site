import * as THREE from 'three';
import type { GLTFLoader, GLTFLoaderPlugin, GLTFParser } from 'three/examples/jsm/loaders/GLTFLoader.js';
import release from '../../../data/derived/town/release.json';
import { ByteCache } from './byte-cache';
import { withLoadDeadline } from './critical-load';

type Delegate = { load(url: string, loaded: (value: object) => void, progress: ((event: ProgressEvent) => void) | undefined, failed: (error: unknown) => void): unknown };
type Reader = (url: string, signal: AbortSignal) => Promise<Blob>;
const cancelled = () => new DOMException('Image loading cancelled', 'AbortError');

/** Share immutable encoded bytes, never decoded ImageBitmaps. Separate glTF
 * parsers still use their normal decoder and independently owned images, so a
 * retired material cannot close another pending parser's bitmap. */
export class SourceImageCache {
  private readonly cache = new ByteCache<Blob>(8 * 1024 * 1024, 64);
  private readonly pending = new Map<string, Promise<Blob>>();
  private readonly abort = new AbortController();
  private readonly installed = new WeakSet<GLTFLoader>();
  private readonly objectURLs = new Set<string>();
  private disposed = false;
  private joined = 0;
  constructor(private readonly origin: string, private readonly read: Reader = async (url, signal) => {
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error(`Image could not load (${response.status}).`);
    return response.blob();
  }) {}

  accepts(url: string): boolean {
    try {
      const parsed = new URL(url);
      return parsed.origin === this.origin && (parsed.pathname.startsWith(`/town-assets/${release.directory}/textures/`) || parsed.pathname.startsWith('/town-finish/v1/art/')) && /\.(?:png|jpe?g|webp)$/i.test(parsed.pathname);
    } catch { return false; }
  }

  async bytes(url: string): Promise<Blob> {
    if (this.disposed) throw cancelled();
    // glTF resolves "../textures/…" by concatenation; fetch normalizes it.
    // Normalize before lookup too, so a hint and parser share that same request.
    url = new URL(url).href;
    const cached = this.cache.get(url); if (cached) return cached;
    const pending = this.pending.get(url); if (pending) { this.joined++; return pending; }
    const work = withLoadDeadline(this.abort.signal, signal => this.read(url, signal), { label: 'Scenery images', timeoutMs: 25000 }).then(blob => {
      if (this.disposed) throw cancelled();
      this.cache.set(url, blob, blob.size); return blob;
    });
    this.pending.set(url, work);
    try { return await work; } finally { if (this.pending.get(url) === work) this.pending.delete(url); }
  }

  /** Install before aliases/atlas plugins so their ordinary delegate also uses
   * the same exact-URL byte cache. Other releases and inline images bypass it. */
  install(loader: GLTFLoader): void {
    if (this.installed.has(loader)) return; this.installed.add(loader);
    loader.register((parser: GLTFParser): GLTFLoaderPlugin & { name: string } => {
      const delegate = parser.textureLoader as unknown as Delegate;
      const proxy = Object.create(delegate) as THREE.Loader & Delegate;
      proxy.load = (url, loaded = () => {}, progress, failed = () => {}) => {
        if (!this.accepts(url)) return delegate.load(url, loaded, progress, failed);
        const fallback = (error: unknown) => {
          if (this.disposed) { failed(cancelled()); return; }
          // Preserve the original loader's hosting/credentials behavior when
          // an encoded-byte request or object-URL decode is not supported.
          try { delegate.load(url, loaded, progress, failed); } catch (reason) { failed(reason ?? error); }
        };
        void this.bytes(url).then(blob => {
          if (this.disposed) { failed(cancelled()); return; }
          const objectURL = URL.createObjectURL(blob); this.objectURLs.add(objectURL);
          const releaseURL = () => { if (this.objectURLs.delete(objectURL)) URL.revokeObjectURL(objectURL); };
          try {
            delegate.load(objectURL, value => {
              releaseURL();
              if (this.disposed) {
                const image = value instanceof THREE.Texture ? value.source.data : value;
                if (value instanceof THREE.Texture) value.dispose();
                if (image && typeof image === 'object' && 'close' in image && typeof image.close === 'function') image.close();
                failed(cancelled()); return;
              }
              loaded(value);
            }, progress, error => { releaseURL(); fallback(error); });
          } catch (error) { releaseURL(); fallback(error); }
        }, fallback);
        return undefined;
      };
      parser.textureLoader = proxy as typeof parser.textureLoader;
      return { name: 'WEBSTER_SHARED_ENCODED_IMAGES' };
    });
  }

  setLow(low: boolean): void { this.cache.maxBytes = (low ? 4 : 8) * 1024 * 1024; this.cache.trim(); }
  prefetch(urls: readonly string[]): void {
    // Errors are deliberately left to the authoritative glTF image request.
    // It retries normal loading; a speculative hint can never fail the street.
    for (const url of urls) if (this.accepts(url)) void this.bytes(url).catch(() => {});
  }
  resources() { return { ...this.cache.resources(), pending: this.pending.size, joined: this.joined, objectURLs: this.objectURLs.size }; }
  dispose(): void {
    if (this.disposed) return; this.disposed = true; this.abort.abort(); this.cache.clear(); this.pending.clear();
    for (const url of this.objectURLs) URL.revokeObjectURL(url); this.objectURLs.clear();
  }
}
