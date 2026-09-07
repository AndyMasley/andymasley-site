// @vitest-environment node
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import index from '../../../../data/derived/town/paved-surfaces-index.json';
import reference from '../../../../data/derived/town/paved-mask-decoder-reference.json';
import { decodeCoverPNG } from '../cover-data';
import { parkingFinishAsset, pavedMaskReference } from '../paved-surfaces';
import { validParkingPacket, type ParkingPacket } from '../parking-finish';

const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const read = (url: string) => readFileSync(resolve(process.cwd(), 'public', url.replace(/^\//, '')));

describe('committed paved-surface asset contracts', () => {
  it('accepts every real tile packet and retains identical complete lots in overlapping tiles', () => {
    const lots = new Map<string, string>();
    let duplicates = 0;
    for (const [tileId, ref] of Object.entries(index.lotAssets)) {
      const bytes = read(ref.url);
      expect(bytes.length).toBe(ref.bytes);
      expect(digest(bytes)).toBe(ref.sha256);
      expect(parkingFinishAsset(tileId)?.url).toBe(ref.url);
      const packet = JSON.parse(bytes.toString()) as ParkingPacket;
      expect(validParkingPacket(packet, tileId)).toBe(true);
      expect(validParkingPacket(packet, `${tileId}-wrong`)).toBe(false);
      expect(new Set(packet.lots.map(lot => lot.id)).size).toBe(packet.lots.length);
      for (const lot of packet.lots) {
        expect(lot.sourcePolygons.length).toBeGreaterThan(0);
        expect(Array.isArray(lot.treeIslands)).toBe(true);
        for (const tree of lot.treeIslands ?? []) {
          expect(tree.center.every(Number.isFinite)).toBe(true);
          expect([0, 1.15]).toContain(tree.radiusM);
        }
        const value = JSON.stringify(lot);
        if (lots.has(lot.id)) { expect(value).toBe(lots.get(lot.id)); duplicates++; }
        else lots.set(lot.id, value);
      }
    }
    expect(lots.size).toBe(index.stats.lots);
    expect(duplicates).toBeGreaterThan(0);
  });

  it('binds every override to its original hash and exact coordinate bounds', () => {
    for (const [tileId, row] of Object.entries(index.masks)) {
      const source = { url: 'original.png', bytes: 1, sha256: row.sourceSha256, bounds: row.bounds as [number, number, number, number] };
      expect(pavedMaskReference(tileId, source)?.sha256).toBe(row.sha256);
      expect(pavedMaskReference(tileId, { ...source, sha256: '0'.repeat(64) })).toBeUndefined();
      expect(pavedMaskReference(tileId, { ...source, bounds: [source.bounds[0] + .001, ...source.bounds.slice(1)] as [number, number, number, number] })).toBeUndefined();
    }
  });

  it('preserves every semantic RGBA byte through the actual runtime decoder', () => {
    expect(Object.keys(index.masks).sort()).toEqual(Object.keys(reference.masks).sort());
    const references = reference.masks as Record<string, { rgbaSha256: string; pngSha256: string }>;
    for (const [tileId, row] of Object.entries(index.masks)) {
      const bytes = read(row.url);
      expect(bytes.length).toBe(row.bytes);
      expect(digest(bytes)).toBe(row.sha256);
      expect(row.sha256).toBe(references[tileId].pngSha256);
      const decoded = decodeCoverPNG(bytes);
      expect([decoded.width, decoded.height]).toEqual([272, 272]);
      expect(digest(decoded.data)).toBe(references[tileId].rgbaSha256);
    }
  });
});
