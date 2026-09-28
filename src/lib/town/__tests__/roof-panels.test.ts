// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { fitRoofPanel } from '../roof-panels';
import { applyEvidenceBuildings } from '../evidence-buildings';
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
function dispose(group: THREE.Object3D) {
  group.traverse(o => { if (o instanceof THREE.Mesh) { o.geometry.dispose(); for (const m of [o.material].flat()) m.dispose(); } });
}

describe('rigid measured-roof solar panels', () => {
  it('keeps a planar roof slope and nine-centimetre mounting gap without changing the footprint', () => {
    const height = (u: number, d: number) => 50 + .2 * u + .8 * d;
    const fitted = fitRoofPanel(height, 20, -30, .99, 1.5)!;
    const corners = [[20, -30], [20.99, -30], [20.99, -28.5], [20, -28.5]];
    for (const [i, [u, d]] of corners.entries()) expect(fitted[i]).toBeCloseTo(height(u, d) + .09, 10);
    expect(fitted[0] + fitted[2]).toBeCloseTo(fitted[1] + fitted[3], 10);
  });

  it('fits modest roof variation with one rigid plane and clears an interior bump', () => {
    const height = (u: number, d: number) => 50 + d * .6 + (u > .3 && u < .7 && d > .3 && d < .7 ? .12 : 0);
    const fitted = fitRoofPanel(height, 0, 0, 1, 1)!;
    expect(fitted).toBeDefined();
    expect(fitted[0] + fitted[2]).toBeCloseTo(fitted[1] + fitted[3], 10);
    for (let i = 0; i <= 20; i++) for (let j = 0; j <= 20; j++) {
      const u = i / 20, d = j / 20, panel = fitted[0] + (fitted[1] - fitted[0]) * u + (fitted[3] - fitted[0]) * d;
      expect(panel - height(u, d)).toBeGreaterThanOrEqual(.09 - 1e-10);
      expect(panel - height(u, d)).toBeLessThan(.3);
    }
  });

  it('rejects a folded valley, roof step and a roof hole inside otherwise valid corners', () => {
    expect(fitRoofPanel((u, d) => 50 + d * .6 + 1.5 * Math.abs(u - .5), 0, 0, 1, 1)).toBeUndefined();
    expect(fitRoofPanel((u, d) => 50 + d * .6 + (u > .4 ? .8 : 0), 0, 0, 1, 1)).toBeUndefined();
    expect(fitRoofPanel((u, d) => u > .35 && u < .65 && d > .35 && d < .65 ? undefined : 50, 0, 0, 1, 1)).toBeUndefined();
  });

  it.each([
    ['-10_-2', '169022_867164', 12], // 20 Lincoln: interior penetration under almost coplanar corners.
    ['-13_-9', '168110_865567', 1], // 26 Houghton: a fourth corner more than half a metre off-plane.
    ['-1_7', '171167_869555', 12], // 113 Sutton: bridge across a lower roof facet.
    ['-6_-5', '169840_866368', 3], // 11 Gorski: both folded and penetrating candidates.
  ] as const)('keeps rigid source-grounded panels at every LOD: %s/%s', (tile, id, count) => {
    const { home, roof } = actual(tile, id), height = roofHeight(roof);
    let first: number[][][] | undefined;
    for (const level of [0, 1, 2]) {
      const group = source(home), spy = vi.spyOn(Batch.prototype, 'polygon');
      try {
        applyEvidenceBuildings(group, tile, [0, 0, 0], level, [home], [], undefined, [], [roof]);
        const panels = spy.mock.calls.filter(c => c[1] === 'glass' && c[3] === '#1c2533').map(([f, , points]) => points.map(([u, y, v]) => [f.start[0] + f.tangent[0] * u + f.outward[0] * v, y, f.start[1] + f.tangent[1] * u + f.outward[1] * v]));
        expect(panels).toHaveLength(count);
        if (first) expect(panels).toEqual(first); else first = panels;
        for (const ps of panels) {
          const [a, b, c, d] = ps.map(p => new THREE.Vector3(...p)), normal = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
          expect(Math.abs(d.clone().sub(a).dot(normal))).toBeLessThan(1e-8);
          for (const tri of [[ps[0], ps[1], ps[2]], [ps[0], ps[2], ps[3]]]) for (let i = 0; i <= 16; i++) for (let j = 0; j <= 16 - i; j++) {
            const p = [0, 1, 2].map(k => tri[0][k] * (1 - i / 16 - j / 16) + tri[1][k] * i / 16 + tri[2][k] * j / 16), h = height(p[0], p[2]);
            expect(h).toBeDefined(); expect(p[1] - h!).toBeGreaterThanOrEqual(-.02); expect(p[1] - h!).toBeLessThanOrEqual(.3);
          }
        }
        if (id === '169022_867164') {
          const expected = [[-2255.272624228667, -423.2673723904354], [-2255.073820843667, -424.2372059914354], [-2256.4573404143835, -424.52080966694075], [-2256.6561437993837, -423.55097606594074]];
          const retained = panels.find(ps => Math.abs(ps[0][0] - expected[0][0]) < 1e-8)!;
          expect(retained).toBeDefined();
          retained.forEach((p, i) => { expect(p[0]).toBeCloseTo(expected[i][0], 9); expect(p[2]).toBeCloseTo(expected[i][1], 9); });
        }
      } finally { spy.mockRestore(); dispose(group); }
    }
  });
});
