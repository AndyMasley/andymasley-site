// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { regularizeCover } from '../cover-cleanup';

const W = 272, H = 272;
type Cover = { r: number; g: number; b: number; a: number };
const LAWN: Cover = { r: 255, g: 0, b: 0, a: 0 }, PAVED: Cover = { r: 0, g: 0, b: 255, a: 0 };
const CANOPY: Cover = { r: 0, g: 255, b: 0, a: 0 }, NONE: Cover = { r: 0, g: 0, b: 0, a: 0 };

function mask(paint: (x: number, y: number) => Cover): Uint8Array {
  const data = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const c = paint(x, y), o = (y * W + x) * 4;
    data[o] = c.r; data[o + 1] = c.g; data[o + 2] = c.b; data[o + 3] = c.a;
  }
  return data;
}
const at = (data: Uint8Array, x: number, y: number) => { const o = (y * W + x) * 4; return { r: data[o], g: data[o + 1], b: data[o + 2], a: data[o + 3] }; };
const share = (data: Uint8Array, x: number, y: number) => { const c = at(data, x, y); return c.b / Math.max(1, c.r + c.g + c.b + c.a); };

/** A street along x with a driveway to a house, a paved lot, specks, a halo and trees. */
function neighbourhood(x: number, y: number): Cover {
  if (x >= 150 && x < 162 && y >= 60 && y < 72) return NONE;                          // house
  if (Math.hypot(x - 110, y - 115) < 4.5) return CANOPY;                                // a tree over the lot
  if (y >= 40 && y < 48) return PAVED;                                                 // street, reaching both edges
  if (x >= 154 && x < 158 && y >= 48 && y < 60) return PAVED;                          // driveway to the house
  if ((x === 148 || x === 149 || x === 162 || x === 163) && y >= 60 && y < 72) return PAVED; // 2 px halo beside the walls
  if (x >= 80 && x < 120 && y >= 100 && y < 130) return PAVED;                         // a lot, joined below
  if (x >= 98 && x < 102 && y >= 48 && y < 100) return PAVED;                          // its entrance
  if (x >= 200 && x < 203 && y >= 150 && y < 153) return PAVED;                        // an isolated 3x3 speck
  if (Math.hypot(x - 60, y - 200) < 7) return CANOPY;                                   // one yard tree
  if (x >= 170 && x < 250 && y >= 170 && y < 250) return CANOPY;                       // a wood
  return LAWN;
}

describe('land-cover cleanup at load', () => {
  it('keeps streets, drives and lots, drops specks and wall halos, and gives yard trees lawn', () => {
    const data = mask(neighbourhood), before = new Uint8Array(data);
    const report = regularizeCover(data, W, H);
    expect(report.islands).toBeGreaterThanOrEqual(1);
    expect(report.yardCanopy).toBe(2);
    expect(report.pavedAfter).toBeGreaterThan(report.pavedBefore * 0.9);
    // Street, driveway and lot interiors stay fully paved.
    for (const [x, y] of [[20, 44], [156, 54], [100, 115], [100, 80]]) expect(share(data, x, y)).toBeGreaterThan(0.95);
    // The speck and the halo become lawn.
    expect(share(data, 201, 151)).toBeLessThan(0.05);
    for (const y of [62, 66, 70]) { expect(share(data, 148, y)).toBeLessThan(0.3); expect(share(data, 163, y)).toBeLessThan(0.3); }
    // The yard tree hands its weight to lawn; the wood keeps its litter.
    expect(at(data, 60, 200).g).toBe(0);
    expect(at(data, 60, 200).r).toBeGreaterThan(250);
    expect(at(data, 210, 210).g).toBe(255);
    // A tree standing over the lot leaves paving beneath it, not a lawn island.
    expect(share(data, 110, 115)).toBeGreaterThan(0.95);
    expect(at(data, 110, 115).g).toBe(0);
    // Buildings stay excluded; every pixel keeps its total cover.
    for (let y = 60; y < 72; y++) for (let x = 150; x < 162; x++) expect(at(data, x, y)).toEqual(NONE);
    for (let i = 0; i < W * H; i++) {
      const sum = (d: Uint8Array) => d[i * 4] + d[i * 4 + 1] + d[i * 4 + 2] + d[i * 4 + 3];
      expect(Math.abs(sum(data) - sum(before))).toBeLessThanOrEqual(1);
    }
  });

  it('leaves one crisp half-way contour along a straight paved edge', () => {
    const data = mask((x, y) => (y < 120 ? PAVED : LAWN));
    regularizeCover(data, W, H);
    for (const x of [40, 136, 230]) {
      // The contour stays on the original edge, and the band is only a couple of pixels wide.
      expect(share(data, x, 119)).toBeGreaterThan(0.5);
      expect(share(data, x, 120)).toBeLessThan(0.5);
      expect(share(data, x, 117)).toBeGreaterThan(0.97);
      expect(share(data, x, 122)).toBeLessThan(0.03);
    }
  });

  it('decides seams the same way in both tiles that draw them', () => {
    // Two tiles whose masks overlap by 16 px (each 8 px gutter repeats the other's first 8 px).
    const world = (x: number, y: number): Cover => {
      const h = (Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1;
      if (Math.hypot(x - 262, y - 90) < 5) return CANOPY;                  // a yard tree across the seam
      if (x >= 258 && x < 267 && y >= 150 && y < 153) return PAVED;         // a small paved strip across it
      if (Math.abs(h) > 0.985) return PAVED;                                // scattered specks
      if (y >= 200 && y < 210) return PAVED;                                // a street across it
      return LAWN;
    };
    const left = mask((x, y) => world(x, y)), right = mask((x, y) => world(x + 256, y));
    regularizeCover(left, W, H); regularizeCover(right, W, H);
    // The terrain seam is at left x = 264 = right x = 8; drawing samples a pixel or two past it.
    for (let y = 0; y < H; y++) for (let dx = -3; dx <= 2; dx++) expect(at(left, 264 + dx, y)).toEqual(at(right, 8 + dx, y));
  });

  it('is stable when applied again and ignores malformed input', () => {
    const data = mask(neighbourhood);
    regularizeCover(data, W, H);
    const once = new Uint8Array(data);
    regularizeCover(data, W, H);
    let moved = 0;
    for (let i = 0; i < W * H; i++) if (Math.abs(data[i * 4 + 2] - once[i * 4 + 2]) > 24) moved++;
    expect(moved).toBeLessThan(W * H * 0.002);
    const bad = new Uint8Array(10);
    expect(regularizeCover(bad, W, H)).toMatchObject({ changed: 0 });
    expect(bad).toEqual(new Uint8Array(10));
  });
});
