// @vitest-environment node
import fs from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import catalog from '../../../../data/derived/town/network-transfer.json';
import { decodeNetworkTransfer, networkTransferURL } from '../network-transfer';
import { readCriticalJson } from '../critical-load';
import { compressedJsonURL } from '../json-transfer';
const sourceURL = `https://example.test/town-assets/${catalog.directory}/network.json`;
const original = JSON.parse(gunzipSync(fs.readFileSync('data/derived/town/engine-network.json.gz')).toString());
const bytes = fs.readFileSync('public' + catalog.url), packed = JSON.parse(gunzipSync(bytes).toString());
describe('lossless full road network transport', () => {
  it('reconstructs every source node, edge, coordinate and attribute exactly', () => {
    expect(bytes.length).toBe(catalog.bytes); expect(createHash('sha256').update(bytes).digest('hex')).toBe(catalog.sha256);
    const before = JSON.stringify(packed), decoded = decodeNetworkTransfer(packed);
    expect(decoded).toStrictEqual(original); expect(JSON.stringify(packed)).toBe(before);
    expect(catalog.exactReversedPaths).toBeGreaterThan(1300); expect(bytes.length).toBeLessThan(700000);
    const edges = decoded.edges as typeof original.edges;
    const ref = packed.network.edges.find((edge: { points: unknown }) => !Array.isArray(edge.points));
    expect(edges.find((edge: { id: number }) => edge.id === ref.id).points[0]).not.toBe(edges.find((edge: { id: number }) => edge.id === ref.points.reverse).points.at(-1));
  });
  it('rejects source mismatches, malformed deltas and unresolved reverse references', () => {
    expect(() => decodeNetworkTransfer({ ...packed, sourceSha256: '0'.repeat(64) })).toThrow();
    for (const points of [[0, 0, NaN, 1, 2, 3], { reverse: -1 }, [0, 1]]) {
      const bad = { ...packed, network: { ...packed.network, edges: [{ ...packed.network.edges[0], points }] } };
      expect(() => decodeNetworkTransfer(bad)).toThrow();
    }
    expect(networkTransferURL(sourceURL.replace(catalog.directory, 'old'))).toBeUndefined();
    expect(networkTransferURL(sourceURL.replace('network.json', 'manifest.json'))).toBeUndefined();
  });
  it('uses the compact source and falls back to unchanged JSON after a corrupt response', async () => {
    for (const corrupt of [false, true]) {
      const fetcher = vi.fn(async (url: string) => new Response(url === networkTransferURL(sourceURL) ? corrupt ? 'bad' : bytes : JSON.stringify(original)));
      vi.stubGlobal('fetch', fetcher);
      try {
        expect(await readCriticalJson(sourceURL, new AbortController().signal)).toStrictEqual(original);
        expect(fetcher.mock.calls.map(row => row[0])).toEqual(corrupt ? [networkTransferURL(sourceURL), compressedJsonURL(sourceURL)] : [networkTransferURL(sourceURL)]);
      } finally { vi.unstubAllGlobals(); }
    }
  });
  it('does not retry the legacy source after a cancelled compact transfer', async () => {
    const abort = new AbortController(), fetcher = vi.fn(async (_url: string, options: RequestInit) => {
      abort.abort(); expect(options.signal?.aborted).toBe(true); throw new DOMException('cancelled', 'AbortError');
    }); vi.stubGlobal('fetch', fetcher);
    try { await expect(readCriticalJson(sourceURL, abort.signal)).rejects.toHaveProperty('name', 'AbortError'); expect(fetcher).toHaveBeenCalledOnce(); }
    finally { vi.unstubAllGlobals(); }
  });
  it('retires a stalled compact encoding and retries the original without cancelling the game', async () => {
    vi.useFakeTimers(); let compactSignal!: AbortSignal;
    const fetcher = vi.fn(async (url: string, options: RequestInit) => {
      if (url === networkTransferURL(sourceURL)) { compactSignal = options.signal!; return new Promise<Response>(() => {}); }
      return new Response(JSON.stringify(original));
    }); vi.stubGlobal('fetch', fetcher);
    try {
      const abort = new AbortController(), pending = readCriticalJson(sourceURL, abort.signal);
      await vi.advanceTimersByTimeAsync(8001);
      expect(await pending).toStrictEqual(original); expect(compactSignal.aborted).toBe(true); expect(abort.signal.aborted).toBe(false);
      expect(fetcher.mock.calls.map(row => row[0])).toEqual([networkTransferURL(sourceURL), compressedJsonURL(sourceURL)]);
    } finally { vi.unstubAllGlobals(); vi.useRealTimers(); }
  });
});
