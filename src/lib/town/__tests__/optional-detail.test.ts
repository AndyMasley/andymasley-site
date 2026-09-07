import { afterEach, describe, expect, it, vi } from 'vitest';
import { beginOptionalDetail, TileDetailStream } from '../optional-detail';

afterEach(() => vi.useRealTimers());
describe('optional scenery', () => {
  it('uses base download time before starting its extra-wait budget', async () => {
    vi.useFakeTimers();
    let resolve!: (value: number) => void;
    const job = beginOptionalDetail(new AbortController().signal, () => new Promise<number>(done => { resolve = done; }));
    await vi.advanceTimersByTimeAsync(10_000);
    const result = job.finish(1500);
    await vi.advanceTimersByTimeAsync(1400);
    resolve(7);
    expect(await result).toBe(7);
  });
  it('cancels stalled requests even when a reader ignores its signal', async () => {
    vi.useFakeTimers();
    let signal!: AbortSignal;
    const job = beginOptionalDetail(new AbortController().signal, s => { signal = s; return new Promise(() => {}); });
    const result = job.finish(100);
    await vi.advanceTimersByTimeAsync(100);
    expect(await result).toBeUndefined();
    expect(signal.aborted).toBe(true);
  });
  it('ends immediately when a tile is no longer wanted', async () => {
    const parent = new AbortController();
    const job = beginOptionalDetail(parent.signal, () => new Promise(() => {}));
    const result = job.finish(); parent.abort();
    expect(await result).toBeUndefined();
  });
  it('never caches a response that arrived after abort', async () => {
    let resolve!: (value: unknown) => void;
    const read = vi.fn(() => new Promise<unknown>(done => { resolve = done; }));
    const stream = new TileDetailStream(() => ({ url: '/detail', bytes: 1 }), (value): value is string => typeof value === 'string', read);
    const parent = new AbortController(), first = stream.tile('a', parent.signal);
    parent.abort(); resolve('late'); await first;
    const second = stream.tile('a', new AbortController().signal);
    resolve('fresh'); expect(await second).toBe('fresh');
    expect(read).toHaveBeenCalledTimes(2);
  });
  it('keeps a bounded LRU and rejects malformed packets', async () => {
    const read = vi.fn(async (url: string) => url === 'bad' ? 9 : url);
    const stream = new TileDetailStream(id => ({ url: id, bytes: 1 }), (value): value is string => typeof value === 'string', read);
    const signal = new AbortController().signal;
    for (let i = 0; i < 65; i++) await stream.tile(String(i), signal);
    await stream.tile('64', signal); expect(read).toHaveBeenCalledTimes(65);
    await stream.tile('0', signal); expect(read).toHaveBeenCalledTimes(66);
    expect(await stream.tile('bad', signal)).toBeUndefined(); expect(stream.failures).toBe(1);
    stream.dispose(); expect(await stream.tile('64', signal)).toBeUndefined();
  });
});
