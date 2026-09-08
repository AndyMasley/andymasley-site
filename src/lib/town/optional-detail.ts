import type { AssetRef } from './contracts';
import { ByteCache } from './byte-cache';

/** Start beside the base scenery, allowing a bounded extra wait once it arrives. */
export function beginOptionalDetail<T>(parent: AbortSignal, read: (signal: AbortSignal) => Promise<T>) {
  const controller = new AbortController();
  let stop!: () => void;
  const cancelled = new Promise<undefined>(resolve => { stop = () => { controller.abort(); resolve(undefined); }; });
  parent.addEventListener('abort', stop, { once: true });
  if (parent.aborted) stop();
  const pending = Promise.race([Promise.resolve().then(() => controller.signal.aborted ? undefined : read(controller.signal)).catch(() => undefined), cancelled]);
  return {
    cancel: () => { stop(); parent.removeEventListener('abort', stop); },
    async finish(graceMs = 1500): Promise<T | undefined> {
      const timer = setTimeout(stop, graceMs);
      try { return await pending; }
      finally { clearTimeout(timer); parent.removeEventListener('abort', stop); }
    },
  };
}

/** Only nearby supplemental packets are retained, never an all-town payload. */
export class TileDetailStream<T> {
  failures = 0;
  private cache: ByteCache<T>;
  private disposed = false;
  constructor(
    private asset: (id: string) => AssetRef | undefined,
    private valid: (value: unknown, id: string) => value is T,
    private read: (url: string, signal: AbortSignal) => Promise<unknown>,
    budgetBytes = 8 * 1024 * 1024,
  ) { this.cache = new ByteCache(budgetBytes); }
  hasAsset(id: string): boolean { return !!this.asset(id); }
  resources() { return this.cache.resources(); }
  setBudget(bytes: number): void { this.cache.maxBytes = bytes; this.cache.trim(); }
  async tile(id: string, signal: AbortSignal): Promise<T | undefined> {
    if (this.disposed || signal.aborted) return undefined;
    const cached = this.cache.get(id);
    if (cached !== undefined) return cached;
    const asset = this.asset(id);
    if (!asset) return undefined;
    try {
      const value = await this.read(asset.url, signal);
      if (signal.aborted || this.disposed) return undefined;
      if (!this.valid(value, id)) throw new Error('Invalid town detail packet.');
      this.cache.set(id, value);
      return value;
    } catch (error) {
      if (!signal.aborted && !this.disposed) this.failures++;
      return undefined;
    }
  }
  dispose(): void { this.disposed = true; this.cache.clear(); }
}
