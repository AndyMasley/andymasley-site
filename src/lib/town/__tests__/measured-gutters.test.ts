// @vitest-environment node
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import index from '../../../../data/derived/town/measured-roofs-index.json';
import { Batch } from '../crafted-frontages';
import { measuredBody, roofEdgeOutward, roofHeight, isMeasuredOther, isPhotographedHouse, type MeasuredRoof, type MeasuredRoofPacket } from '../measured-roofs';

function concaveRoof(origin: [number, number] = [3.56, 3.56]): MeasuredRoof {
  const outline = [[0, 0], [10, 0], [10, 3], [3, 3], [3, 10], [0, 10]];
  return { id: 'concave', o: origin, b: 40, p: 45, q: 1, e: [], c: [], w: '',
    v: Buffer.from(new Int16Array(outline.flatMap(([e, n]) => [Math.round((e - 3.56) * 100), Math.round((n - 3.56) * 100), 500])).buffer).toString('base64'),
    r: Buffer.from([0, 1, 2, 0, 2, 3, 0, 3, 5, 3, 4, 5]).toString('base64'), g: [[-.56, -.56, 6.44, -.56, 44.78]] };
}
const packet = (tile: string): MeasuredRoofPacket => JSON.parse(readFileSync(resolve('public' + index.dir, `${tile}.json`), 'utf8'));

describe('measured roof gutters', () => {
  it('faces away from a concave roof with either edge ordering and after world translation', () => {
    for (const origin of [[3.56, 3.56], [2003.56, -896.44]] as [number, number][]) {
      const roof = concaveRoof(origin), height = roofHeight(roof);
      for (const edge of [[-.56, -.56, 6.44, -.56], [6.44, -.56, -.56, -.56]]) {
        const out = roofEdgeOutward(height, roof.o, edge);
        expect(out[0]).toBeCloseTo(0, 10); expect(out[1]).toBeCloseTo(1, 10);
      }
    }
  });

  it('places the fascia outside the concave edge and the downspout against its inset wall', () => {
    const batch = new Batch(new THREE.Vector3(1000, 20, -2000), 0);
    measuredBody(batch, 'concave', 'fixture', concaveRoof(), 'wall', '#ffffff', '#444444');
    const { group } = batch.finish();
    const meshes = group.children.filter((o): o is THREE.Mesh => o instanceof THREE.Mesh);
    const metal = (color: string) => meshes.find(o => [o.material].flat().some(m => m.name.endsWith(` | metal | ${color}`)))!;
    const fascia = metal('#aaa99e').geometry.getAttribute('position'), pipe = metal('#b6b5aa').geometry.getAttribute('position');
    expect(fascia.count).toBe(36); expect(pipe.count).toBe(72);
    const north = (p: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, start: number, end: number) => {
      let sum = 0; for (let i = start; i < end; i++) sum -= p.getZ(i) - 2000; return sum / (end - start);
    };
    expect(north(fascia, 0, 36)).toBeCloseTo(3.07, 3);
    expect(north(pipe, 36, 72)).toBeCloseTo(2.7, 3);
    for (const mesh of meshes) { mesh.geometry.dispose(); for (const m of [mesh.material].flat()) m.dispose(); }
  });

  it('keeps gutters outside the measured wings at 14 Grenier Avenue and 3 Abbey Road', () => {
    const examples = [
      ['168828_864454', [1.44, -9.73, .25, -2.51, 59.62]],
      ['169015_864574', [-3.65, -1.57, -9.15, -.23, 50.08]],
    ] as const;
    for (const [id, edge] of examples) {
      const roof = packet('-10_-13').rows.find(r => r.id === id) as MeasuredRoof;
      expect(roof.g).toContainEqual([...edge]);
      const height = roofHeight(roof), out = roofEdgeOutward(height, roof.o, edge);
      const e = roof.o[0] + (edge[0] + edge[2]) / 2, n = roof.o[1] + (edge[1] + edge[3]) / 2;
      expect(height(e + .1 * out[0], n + .1 * out[1])).toBeUndefined();
      expect(height(e - .1 * out[0], n - .1 * out[1])).toBeDefined();
    }
  });

  it('has no inward gutter faces in the full measured town at an independent probe distance', () => {
    const failures: string[] = []; let checked = 0;
    for (const tile of index.tiles.split(',')) for (const row of packet(tile).rows) {
      if (isPhotographedHouse(row) || isMeasuredOther(row) && row.k === 'v') continue;
      const roof = row as MeasuredRoof, height = roofHeight(roof);
      for (const edge of roof.g ?? []) {
        if (Math.hypot(edge[2] - edge[0], edge[3] - edge[1]) < .8) continue;
        checked++;
        const out = roofEdgeOutward(height, roof.o, edge), e = roof.o[0] + (edge[0] + edge[2]) / 2, n = roof.o[1] + (edge[1] + edge[3]) / 2;
        if (height(e + .1 * out[0], n + .1 * out[1]) !== undefined && height(e - .1 * out[0], n - .1 * out[1]) === undefined) failures.push(`${tile}/${roof.id}`);
      }
    }
    expect(checked).toBeGreaterThan(32000); expect(failures).toEqual([]);
  });

  it('retains the radial fallback where both roof sides are ambiguous', () => {
    for (const height of [() => undefined, () => 44]) {
      const out = roofEdgeOutward(height, [0, 0], [1, 3, 5, 3]);
      expect(out[0]).toBeCloseTo(0); expect(out[1]).toBe(1);
    }
    expect(roofEdgeOutward(() => undefined, [0, 0], [1, 3, 1, 3])).toEqual([0, 0]);
  });
});
