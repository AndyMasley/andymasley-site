/** Estimated retained JS bytes, not compressed transfer size or a heap census. */
export function estimateRetainedBytes(value: unknown): number {
  if (value == null) return 4;
  if (typeof value === 'number') return 8;
  if (typeof value === 'boolean') return 4;
  if (typeof value === 'string') return value.length * 2 + 16;
  if (ArrayBuffer.isView(value)) return value.byteLength;
  if (value instanceof ArrayBuffer) return value.byteLength;
  if (Array.isArray(value)) return 24 + value.reduce((sum, item) => sum + 8 + estimateRetainedBytes(item), 0);
  if (typeof value === 'object') return Object.entries(value).reduce((sum, [key, item]) => sum + key.length * 2 + 16 + estimateRetainedBytes(item), 32);
  return 0;
}

/** LRU budgets constrain both count and estimated decoded retention. Oversized
 * packets remain usable by the caller but are never kept in the cache. */
export class ByteCache<T> {
  private entries = new Map<string, { value: T; bytes: number }>();
  bytes = 0;
  evictions = 0;
  hits = 0;
  misses = 0;
  constructor(public maxBytes = 8 * 1024 * 1024, public maxEntries = 64) {}
  get size(): number { return this.entries.size; }
  get(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) { this.misses++; return; }
    this.hits++; this.entries.delete(key); this.entries.set(key, entry); return entry.value;
  }
  set(key: string, value: T, bytes = estimateRetainedBytes(value)): void {
    this.delete(key);
    if (!Number.isFinite(bytes) || bytes < 0 || bytes > this.maxBytes) return;
    this.entries.set(key, { value, bytes }); this.bytes += bytes; this.trim();
  }
  delete(key: string): void {
    const entry = this.entries.get(key); if (!entry) return;
    this.bytes -= entry.bytes; this.entries.delete(key);
  }
  trim(): void {
    while (this.bytes > this.maxBytes || this.entries.size > this.maxEntries) { this.delete(this.entries.keys().next().value!); this.evictions++; }
  }
  clear(): void { this.entries.clear(); this.bytes = 0; }
  resources() { return { entries: this.size, estimatedBytes: this.bytes, budgetBytes: this.maxBytes, evictions: this.evictions, hits: this.hits, misses: this.misses }; }
}
