// @vitest-environment node
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import index from '../../../../data/derived/town/measured-roofs-index.json';
import { Batch } from '../crafted-frontages';
import { chimneyBottom, measuredBody, roofHeight, isMeasuredOther, isPhotographedHouse, type MeasuredRoof, type MeasuredRoofPacket } from '../measured-roofs';

const packet = (tile: string): MeasuredRoofPacket => JSON.parse(readFileSync(resolve('public' + index.dir, `${tile}.json`), 'utf8'));
const footprint = (origin: readonly number[], chimney: readonly number[], fraction: number, edge: number) => {
  const [de, dn, , sx, sy, yaw] = chimney, c = Math.cos(yaw), s = Math.sin(yaw);
  const [u, v] = [[sx * (fraction - .5), -sy / 2], [sx / 2, sy * (fraction - .5)], [sx * (.5 - fraction), sy / 2], [-sx / 2, sy * (.5 - fraction)]][edge];
  return [origin[0] + de + c * u - s * v, origin[1] + dn + s * u + c * v];
};

describe('measured chimney roof contacts', () => {
  it('carries rotated stacks below their downhill corners in the source world datum', () => {
    const chimney = [2, 3, 58, 1.4, .8, .78, 52.8], origin = [1000, -2000];
    const height = (e: number, n: number) => 50 + .8 * (e - origin[0]) + .4 * (n - origin[1]);
    const bottom = chimneyBottom(height, origin, chimney);
    const lowCorner = Math.min(...[0, 1, 2, 3].map(edge => { const p = footprint(origin, chimney, 0, edge); return height(p[0], p[1]); }));
    expect(bottom).toBeCloseTo(lowCorner - .35, 9);
    expect(chimneyBottom((e, n) => height(e - 4000, n + 3000) + 70, [5000, -5000], [...chimney.slice(0, 6), chimney[6] + 70])).toBeCloseTo(bottom + 70, 9);
    expect(chimneyBottom(() => undefined, origin, chimney)).toBe(chimney[6] - .35);
  });

  it('intersects a valley between the chimney corners and side midpoint', () => {
    const chimney = [0, 0, 54, 1.4, 1.4, 0, 50.84], height = (_e: number, n: number) => 50 + 4 * Math.abs(n - .21);
    const bottom = chimneyBottom(height, [0, 0], chimney);
    expect(bottom).toBeLessThan(50);
    for (let i = 0; i <= 100; i++) expect(bottom).toBeLessThanOrEqual(height(.7, (i / 100 - .5) * 1.4));
  });

  it('preserves the surveyed top and yawed footprint while joining the roof at 42 Bates Point Road', () => {
    const roof = packet('4_-10').rows.find(r => r.id === '172451_865329') as MeasuredRoof;
    const chimney = roof.c[0], [de, dn, top] = chimney, height = roofHeight(roof), batch = new Batch(new THREE.Vector3(100, 20, -300), 1);
    measuredBody(batch, roof.id, '4_-10', { ...roof, c: [chimney], g: [] }, 'wall', '#ffffff', '#444444');
    const { group } = batch.finish(), meshes = group.children.filter((o): o is THREE.Mesh => o instanceof THREE.Mesh);
    const brick = meshes.find(o => [o.material].flat().some(m => m.name.endsWith(' | brick | #86523f')))!;
    const p = brick.geometry.getAttribute('position'), ys = Array.from({ length: p.count }, (_, i) => p.getY(i) + 20);
    expect(Math.max(...ys)).toBeCloseTo(top, 4);
    expect(Math.min(...ys)).toBeLessThan(53.5);
    for (let edge = 0; edge < 4; edge++) for (let i = 0; i <= 40; i++) {
      const point = footprint(roof.o, chimney, i / 40, edge);
      expect(Math.min(...ys)).toBeLessThanOrEqual(height(point[0], point[1])!);
    }
    let e = 0, n = 0; for (let i = 0; i < p.count; i++) { e += p.getX(i) + 100; n -= p.getZ(i) - 300; }
    expect(e / p.count).toBeCloseTo(roof.o[0] + de, 3); expect(n / p.count).toBeCloseTo(roof.o[1] + dn, 3);
    for (const mesh of meshes) { mesh.geometry.dispose(); for (const m of [mesh.material].flat()) m.dispose(); }
  });

  it('leaves no floating stack walls above the full measured town at denser independent perimeter samples', () => {
    let checked = 0; const floating: string[] = [];
    for (const tile of index.tiles.split(',')) for (const roof of packet(tile).rows) {
      if (isMeasuredOther(roof) || isPhotographedHouse(roof) || !roof.c.length) continue;
      const height = roofHeight(roof);
      for (const [stack, chimney] of roof.c.entries()) {
        checked++; const bottom = chimneyBottom(height, roof.o, chimney);
        let lowest = Infinity;
        for (let edge = 0; edge < 4; edge++) for (let i = 0; i <= 40; i++) {
          const p = footprint(roof.o, chimney, i / 40, edge), h = height(p[0], p[1]);
          if (h !== undefined) lowest = Math.min(lowest, h);
        }
        if (bottom > lowest + .01) floating.push(`${tile}/${roof.id}/${stack}`);
      }
    }
    expect(checked).toBeGreaterThan(2500); expect(floating).toEqual([]);
  });
});
