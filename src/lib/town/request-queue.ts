/** Bound supplemental transfers independently of critical street/texture loads.
 * Aborted queued jobs never start, and aborted active jobs release the slot even
 * if a test reader or an obsolete browser callback ignores its signal. */
export class RequestQueue {
  private pending: (() => void)[] = [];
  active = 0;
  peakActive = 0;
  cancelled = 0;
  constructor(public limit = 3) {}
  get queued(): number { return this.pending.length; }
  run<T>(signal: AbortSignal, task: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      let settled = false, started = false;
      const end = (error?: unknown, value?: T) => {
        if (settled) return; settled = true;
        signal.removeEventListener('abort', abort);
        if (started) this.active--; else { const i = this.pending.indexOf(start); if (i >= 0) this.pending.splice(i, 1); }
        if (error) reject(error); else resolve(value as T);
        this.pump();
      };
      const abort = () => { this.cancelled++; end(new DOMException('Loading cancelled', 'AbortError')); };
      const start = () => {
        if (settled) return;
        started = true; this.active++; this.peakActive = Math.max(this.peakActive, this.active);
        Promise.resolve().then(() => { if (signal.aborted) throw new DOMException('Loading cancelled', 'AbortError'); return task(); }).then(value => end(undefined, value), error => end(error));
      };
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) { abort(); return; }
      this.pending.push(start); this.pump();
    });
  }
  private pump(): void { while (this.active < this.limit && this.pending.length) this.pending.shift()!(); }
}
