// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { roofPanelRows } from '../roof-panels';
import { applyEvidenceBuildings, photoLayout } from '../evidence-buildings';
import { Batch } from '../crafted-frontages';
import { roofHeight, type MeasuredRoof } from '../measured-roofs';
import type { EvidenceBuilding } from '../evidence-types';
import homes from '../../../../data/derived/town/residential-evidence-index.json';
import measured from '../../../../data/derived/town/measured-roofs-index.json';

function actual(tile: string, id: string) {
  const asset = (homes.tiles as Record<string, { url: string }>)[tile];
  const home = (JSON.parse(readFileSync(`public${asset.url}`, 'utf8')).buildings as EvidenceBuilding[]).find(h => h.id === id)!;
  const roof = (JSON.parse(readFileSync(`public${measured.dir}/${tile}.json`, 'utf8')).rows as MeasuredRoof[]).find(r => r.id === id)!;
  return { home, roof };
}
function source(home: EvidenceBuilding) {
  const f = home.frames.find(f => f.front) ?? home.frames[0], e = f.start[0] + f.tangent[0] * f.width / 2 - f.outward[0] * .05, n = f.start[1] + f.tangent[1] * f.width / 2 - f.outward[1] * .05;
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute([e, home.floor + 1, -n, e + f.tangent[0] * .1, home.floor + 1, -n - f.tangent[1] * .1, e, home.floor + 1.1, -n], 3));
  const material = new THREE.MeshStandardMaterial(); material.name = 'V2 inferred | siding';
  const group = new THREE.Group(); group.add(new THREE.Mesh(geometry, material)); return group;
}
function dispose(group: THREE.Object3D) { group.traverse(o => { if (o instanceof THREE.Mesh) { o.geometry.dispose(); for (const m of [o.material].flat()) m.dispose(); } }); }

describe('solar placement on individual measured roof columns', () => {
  it('places full-size modules on front gables that slope across the array and shallow roofs', () => {
    for (const height of [(u: number, _d: number) => 50 + u * .6, (_u: number, d: number) => 50 + d * .06]) {
      const rows = roofPanelRows((u, d) => d <= 8 ? height(u, d) : undefined, 0, .99);
      expect(rows.length).toBeGreaterThanOrEqual(4);
      for (const row of rows) {
        expect(Math.hypot(row.depth, row.heights[3] - row.heights[0])).toBeCloseTo(1.7, 5);
        expect(row.d + row.depth + .35).toBeLessThanOrEqual(8 + 1e-8);
      }
    }
  });

  it('ends each column at its own hip ridge, keeping modules separate without using a shared midpoint', () => {
    const height = (u: number, d: number) => 50 + .6 * Math.min(d, 3 + u) - .6 * Math.max(0, d - 3 - u);
    const left = roofPanelRows(height, 0, .99), right = roofPanelRows(height, 3, .99);
    expect(left.length).toBe(1); expect(right.length).toBe(3);
    for (const rows of [left, right]) for (let i = 1; i < rows.length; i++) expect(rows[i].d).toBeGreaterThanOrEqual(rows[i - 1].d + rows[i - 1].depth + .019);
  });

  it('searches beyond an invalid roof-step cell without shrinking modules or bridging the step', () => {
    const height = (_u: number, d: number) => 50 + d * .6 + (d < 1.3 ? 0 : 1.2);
    const rows = roofPanelRows(height, 0, .99, 7);
    expect(rows.length).toBeGreaterThan(0); expect(rows[0].d).toBeGreaterThanOrEqual(1.3 - 1e-8);
    for (const row of rows) expect(Math.hypot(row.depth, row.heights[3] - row.heights[0])).toBeCloseTo(1.7, 5);
  });

  it('bounds searches and rejects invalid numeric surfaces', () => {
    let calls = 0;
    expect(roofPanelRows(() => { calls++; return undefined; }, 0, .99, Infinity)).toEqual([]);
    expect(calls).toBeLessThanOrEqual(101);
    expect(roofPanelRows(() => NaN, 0, .99)).toEqual([]);
    expect(roofPanelRows(() => 50, NaN, .99)).toEqual([]);
    expect(roofPanelRows(() => 50, 0, Infinity)).toEqual([]);
    for (const row of roofPanelRows(() => 50, 0, .99, Infinity)) expect(row.d + row.depth + .35).toBeLessThanOrEqual(10);
  });

  it('projects a photographed solar span that straddles a wall gap without moving windows', () => {
    const { home } = actual('5_-4', '172713_866750'), f = home.frames.find(f => f.front)!;
    const fixture: EvidenceBuilding = { ...home, frames: [{ ...f, start: [0, 0], tangent: [1, 0], outward: [0, -1], width: 4, front: true }, { ...f, start: [6, 0], tangent: [1, 0], outward: [0, -1], width: 3, front: false }] };
    const without = photoLayout(fixture, { w1: [20, 80] })!, withSolar = photoLayout(fixture, { w1: [20, 80] }, { sol: [20, 80] })!;
    expect(withSolar.windows).toEqual(without.windows);
    expect(withSolar.solar).toEqual({ frameIndex: 0, u0: 1.8, u1: 4 });
  });

  it.each([
    ['-8_-4', '169477_866797'], ['-9_-1', '169271_867404'], ['9_-14', '173537_864134'],
    ['-9_-15', '169252_863866'], ['5_-4', '172713_866750'], ['3_-2', '172035_867144'],
  ] as const)('restores observed arrays with full-size rigid cells at every LOD: %s/%s', (tile, id) => {
    const { home, roof } = actual(tile, id), height = roofHeight(roof);
    let first: number[][][] | undefined;
    for (const level of [0, 1, 2]) {
      const group = source(home), spy = vi.spyOn(Batch.prototype, 'polygon');
      try {
        applyEvidenceBuildings(group, tile, [0, 0, 0], level, [home], [], undefined, [], [roof]);
        const panels = spy.mock.calls.filter(c => c[1] === 'glass' && c[3] === '#1c2533').map(([f, , ps]) => ps.map(([u, y, v]) => [f.start[0] + f.tangent[0] * u + f.outward[0] * v, y, f.start[1] + f.tangent[1] * u + f.outward[1] * v]));
        expect(panels.length).toBeGreaterThan(0); if (first) expect(panels).toEqual(first); else first = panels;
        for (const ps of panels) {
          expect(Math.hypot(ps[1][0] - ps[0][0], ps[1][2] - ps[0][2])).toBeCloseTo(.99, 6);
          expect(Math.abs(Math.hypot(...ps[3].map((v, k) => v - ps[0][k])) - 1.7)).toBeLessThanOrEqual(.03);
          const [a, b, c, d] = ps.map(p => new THREE.Vector3(...p));
          expect(Math.abs(d.clone().sub(a).dot(b.clone().sub(a).cross(c.clone().sub(a)).normalize()))).toBeLessThan(1e-8);
          for (const tri of [[ps[0], ps[1], ps[2]], [ps[0], ps[2], ps[3]]]) for (let i = 0; i <= 16; i++) for (let j = 0; j <= 16 - i; j++) {
            const p = [0, 1, 2].map(k => tri[0][k] * (1 - i / 16 - j / 16) + tri[1][k] * i / 16 + tri[2][k] * j / 16), h = height(p[0], p[2]);
            expect(h).toBeDefined(); expect(p[1] - h!).toBeGreaterThanOrEqual(-.02); expect(p[1] - h!).toBeLessThanOrEqual(.3);
          }
        }
      } finally { spy.mockRestore(); dispose(group); }
    }
  });

  it('keeps a genuinely authored dormer clear at 47 First Street', () => {
    const { home, roof } = actual('-11_-7', '168689_865846'), group = source(home), spy = vi.spyOn(Batch.prototype, 'polygon');
    try {
      applyEvidenceBuildings(group, home.tileId, [0, 0, 0], 0, [home], [], undefined, [], [roof]);
      expect(spy.mock.calls.some(c => c[1] === 'roof')).toBe(true);
      expect(spy.mock.calls.filter(c => c[1] === 'glass' && c[3] === '#1c2533')).toHaveLength(0);
    } finally { spy.mockRestore(); dispose(group); }
  });
});
