// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import index from '../../../../data/derived/town/measured-roofs-index.json';
import homeIndex from '../../../../data/derived/town/residential-evidence-index.json';
import { setbackWalls, type MeasuredRoof, type MeasuredRoofPacket } from '../measured-roofs';
import type { EvidenceBuilding } from '../evidence-types';

describe('measured setback wall planes', () => {
  it('snaps to the closest plan direction regardless of frame order', () => {
    const length = Math.hypot(9.99, .35), outward: [number, number] = [.35 / length, -9.99 / length];
    const roof: Pick<MeasuredRoof, 'o' | 'b' | 'v' | 'w'> = { o: [2000, -1000], b: 40,
      v: Buffer.from(new Int16Array([0, 0, 200, 999, 35, 200, 999, 35, 500, 0, 0, 500]).buffer).toString('base64'),
      w: Buffer.from([0, 1, 2, 0, 2, 3]).toString('base64') };
    const plan = [{ start: [2000, -1100], outward: [0, -1] }, { start: [2000, -1200], outward }];
    const walls = setbackWalls(roof, plan);
    expect(walls).toEqual(setbackWalls(roof, [...plan].reverse())); expect(walls).toHaveLength(1);
    expect(walls[0].outward[0]).toBeCloseTo(outward[0], 10); expect(walls[0].outward[1]).toBeCloseTo(outward[1], 10);
    for (const point of [[2000, -1000], [2009.99, -999.65]]) {
      expect(Math.abs((point[0] - walls[0].start[0]) * outward[0] + (point[1] - walls[0].start[1]) * outward[1])).toBeLessThan(1e-5);
    }
  });

  it('keeps the measured 15 Aldrich Street wall planes stable when plan frames are reordered', () => {
    const tile = '-10_-1', id = '168827_867517';
    const roof = (JSON.parse(readFileSync(resolve('public' + index.dir, tile + '.json'), 'utf8')) as MeasuredRoofPacket).rows.find(r => r.id === id) as MeasuredRoof;
    const asset = (homeIndex.tiles as Record<string, { url: string }>)[tile];
    const home = (JSON.parse(readFileSync(resolve('public' + asset.url), 'utf8')).buildings as EvidenceBuilding[]).find(h => h.id === id)!;
    expect(home.address).toContain('ALDRICH');
    const plan = home.frames.map(f => ({ outward: f.outward, start: [f.start[0] + f.tangent[0] * .32 - f.outward[0] * .32, f.start[1] + f.tangent[1] * .32 - f.outward[1] * .32] }));
    expect(setbackWalls(roof, plan)).toEqual(setbackWalls(roof, [...plan].reverse()));
  });
});
