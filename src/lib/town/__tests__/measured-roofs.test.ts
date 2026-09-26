// @vitest-environment node
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import index from '../../../../data/derived/town/measured-roofs-index.json';
import homeIndex from '../../../../data/derived/town/residential-evidence-index.json';
import { measuredRoofAsset, validMeasuredRoofPacket, measuredBody, MEASURED_ROOF_COVERAGE, type MeasuredRoof, type MeasuredRoofPacket } from '../measured-roofs';
import { applyEvidenceBuildings, MEASURED_WALL_INSET } from '../evidence-buildings';
import { Batch } from '../crafted-frontages';
import type { EvidenceBuilding } from '../evidence-types';

const tiles = index.tiles.split(',');
const packet = (tile: string): MeasuredRoofPacket => JSON.parse(readFileSync(resolve('public', measuredRoofAsset(tile)!.url.slice(1)), 'utf8'));
const decode = (s: string) => new Uint8Array(Buffer.from(s, 'base64'));
function vertices(r: MeasuredRoof) { const b = decode(r.v); return new Int16Array(b.buffer, b.byteOffset, b.length / 2); }
function tris(r: MeasuredRoof, key: string) { const b = decode(key), n = vertices(r).length / 3; return n <= 255 ? Array.from(b) : Array.from(new Uint16Array(b.buffer, b.byteOffset, b.length / 2)); }

const homes = new Map<string, string>();
for (const [tile, asset] of Object.entries(homeIndex.tiles as Record<string, { url: string }>))
  for (const row of JSON.parse(readFileSync(resolve('public', asset.url.slice(1)), 'utf8')).buildings) homes.set(row.id, tile);

describe('measured house roofs', () => {
  it('ships one valid packet per listed tile, for measured residential houses only', () => {
    const dir = resolve('public', index.dir.slice(1));
    expect(readdirSync(dir).sort()).toEqual(tiles.map(t => `${t}.json`).sort());
    let count = 0; const seen = new Set<string>();
    for (const tile of tiles) {
      const p = packet(tile);
      expect(validMeasuredRoofPacket(p, tile), tile).toBe(true);
      for (const row of p.rows) {
        expect(homes.get(row.id), row.id).toBe(tile);
        expect(seen.has(row.id)).toBe(false); seen.add(row.id);
      }
      count += p.rows.length;
    }
    expect(count).toBe(index.count);
    expect(MEASURED_ROOF_COVERAGE.houses).toBeGreaterThan(homeIndex.count * .9);
    expect(measuredRoofAsset('no-such-tile')).toBeUndefined();
    expect(existsSync(resolve('public/town-evidence/v1/measured'))).toBe(true);
  });

  it('keeps every tile packet small enough to stream beside its scenery', () => {
    for (const tile of tiles) expect(JSON.stringify(packet(tile)).length, tile).toBeLessThan(200_000);
    expect(index.bytes).toBeLessThan(12_000_000);
  });

  it('rejects packets with out-of-range indices, bad colours or the wrong tile', () => {
    const p = packet(tiles[0]), row = p.rows[0];
    expect(validMeasuredRoofPacket({ ...p, tileId: 'x' }, tiles[0])).toBe(false);
    expect(validMeasuredRoofPacket({ ...p, rows: [{ ...row, rc: 'red' }] }, tiles[0])).toBe(false);
    const n = vertices(row).length / 3, big = n <= 255 ? Buffer.from([0, 1, 255]) : Buffer.from(new Uint16Array([0, 1, 65535]).buffer);
    expect(validMeasuredRoofPacket({ ...p, rows: [{ ...row, r: big.toString('base64') }] }, tiles[0])).toBe(false);
    expect(validMeasuredRoofPacket({ ...p, rows: [row, row] }, tiles[0])).toBe(false);
  });

  it('builds roofs that face the sky and walls that stand upright, below the measured peak', () => {
    let checked = 0;
    for (const tile of tiles.slice(0, 40)) for (const row of packet(tile).rows) {
      const v = vertices(row), top = Math.max(...Array.from({ length: v.length / 3 }, (_, i) => v[i * 3 + 2])) / 100;
      expect(row.b + top).toBeLessThanOrEqual(row.p + .02);
      const roof = tris(row, row.r), wall = tris(row, row.w);
      expect(roof.length).toBeGreaterThan(0); expect(wall.length).toBeGreaterThan(0);
      for (const [list, up] of [[roof, true], [wall, false]] as const) for (let i = 0; i < list.length; i += 3) {
        const p = [0, 1, 2].map(k => [v[list[i + k] * 3], v[list[i + k] * 3 + 1], v[list[i + k] * 3 + 2]].map(x => x / 100));
        const a = p[1].map((x, k) => x - p[0][k]), b = p[2].map((x, k) => x - p[0][k]);
        const n = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], l = Math.hypot(...n);
        if (up) expect(n[2] / l).toBeGreaterThan(.15); else expect(Math.abs(n[2] / l)).toBeLessThanOrEqual(.9);
      }
      checked++;
    }
    expect(checked).toBeGreaterThan(200);
  });

  it('replaces the inferred body, colours the roof and keeps windows under the measured eaves', () => {
    const tile = tiles.find(t => packet(t).rows.some(r => r.rc && r.c.length))!;
    const row = packet(tile).rows.find(r => r.rc && r.c.length)!;
    const [e, n] = row.o;
    const frames = [{ start: [e - 5, n - 4], tangent: [1, 0], outward: [0, -1], width: 10, front: true, groundMaximum: row.b, clearanceM: 5 }];
    const home: EvidenceBuilding = { id: row.id, tileId: tile, address: 'Fixture', outline: [[e - 5, n - 4], [e + 5, n - 4], [e + 5, n + 4], [e - 5, n + 4]],
      frames, base: row.b, floor: row.b + .4, eave: row.b + 6, peak: row.p, stories: 2, style: 'COLONIAL', year: 1920, material: 'siding', paint: '#d9d5c8',
      roof: 'gable', porch: 'none', documented: false, evidenceIds: [], colorsDated: false, entry: null };
    const measured = { ...row, e: [row.b + 3.2], ep: [3.2] };
    const group = new THREE.Group(), geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([e - 4, row.b + 2, -(n - 4), e - 2, row.b + 2, -(n - 4), e - 4, row.b + 4, -(n - 4)], 3));
    const material = new THREE.MeshStandardMaterial(); material.name = 'V2 inferred | siding';
    group.add(new THREE.Mesh(geometry, material));
    const report = applyEvidenceBuildings(group, tile, [0, 0, 0], 0, [home], [], undefined, [], [measured])!;
    expect(report.buildingIds).toEqual([row.id]);
    expect(report.removedTriangles).toBe(1);
    const names = new Set<string>(); let glassTop = -Infinity;
    group.traverse(o => { if (o instanceof THREE.Mesh) for (const m of [o.material].flat()) {
      names.add(m.name);
      if (m.name.includes('| glass |')) { const p = o.geometry.getAttribute('position'); for (let i = 0; i < p.count; i++) glassTop = Math.max(glassTop, p.getY(i)); }
    } });
    expect(names.has(`Crafted frontage | roof | ${row.rc}`)).toBe(true);
    expect(names.has('Crafted frontage | brick | #86523f')).toBe(true);
    expect(glassTop).toBeLessThan(row.b + 3.2);
  });

  it('paints houses from their street photographs: siding, trim and shutter colours', () => {
    let rows = 0, painted = 0, read = 0;
    for (const tile of tiles) for (const r of packet(tile).rows) { rows++; if (r.wc) painted++; if (r.f) read++; }
    expect(painted / rows).toBeGreaterThan(.9); expect(read / rows).toBeGreaterThan(.9);
    const tile = tiles.find(t => packet(t).rows.some(r => r.wc && r.f?.shutters && r.f.material === 'siding'))!;
    const row = packet(tile).rows.find(r => r.wc && r.f?.shutters && r.f.material === 'siding')!;
    const [e, n] = row.o;
    const frames = [{ start: [e - 6, n - 4], tangent: [1, 0], outward: [0, -1], width: 12, front: true, groundMaximum: row.b, clearanceM: 5 }];
    const home: EvidenceBuilding = { id: row.id, tileId: tile, address: 'Fixture', outline: [[e - 6, n - 4], [e + 6, n - 4], [e + 6, n + 4], [e - 6, n + 4]],
      frames, base: row.b, floor: row.b + .4, eave: row.b + 6, peak: row.p, stories: 2, style: 'COLONIAL', year: 1920, material: 'brick', paint: '#d9d5c8',
      roof: 'gable', porch: 'none', documented: false, evidenceIds: [], colorsDated: false, entry: null };
    const measured = { ...row, e: [row.b + 5.6], ep: [5.6], f: { ...row.f, bays: 3 } };
    const group = new THREE.Group(), geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([e - 4, row.b + 2, -(n - 4), e - 2, row.b + 2, -(n - 4), e - 4, row.b + 4, -(n - 4)], 3));
    const inferred = new THREE.MeshStandardMaterial(); inferred.name = 'V2 inferred | brick';
    group.add(new THREE.Mesh(geometry, inferred));
    expect(applyEvidenceBuildings(group, tile, [0, 0, 0], 0, [home], [], undefined, [], [measured])!.buildingIds).toEqual([row.id]);
    const names = new Set<string>();
    group.traverse(o => { if (o instanceof THREE.Mesh) for (const m of [o.material].flat()) names.add(m.name); });
    // the photo's siding overrides the assessor's brick, in the photographed colour
    expect(names.has(`Crafted frontage | wall | ${row.wc}`)).toBe(true);
    expect([...names].some(m => m.startsWith('Crafted frontage | brick |') && m !== 'Crafted frontage | brick | #86523f')).toBe(false);
    // shutters are painted boards in one photographed colour, never door leaves
    expect(names.has(`Crafted frontage | trim | ${row.f!.shutters}`)).toBe(true);
    expect([...names].some(m => m.startsWith('Crafted frontage | door |'))).toBe(false);
    if (row.tc) expect(names.has(`Crafted frontage | trim | ${row.tc}`)).toBe(true);
    group.traverse(o => { if (o instanceof THREE.Mesh) { o.geometry.dispose(); for (const m of [o.material].flat()) m.dispose(); } });
  });

  it('puts upper windows in a measured gable only where its rakes clear them', () => {
    const tile = tiles[0], row = packet(tile).rows[0], [e, n] = row.o;
    const glassTops = (ep: MeasuredRoof['ep']) => {
      const frames = [{ start: [e - 6.32, n - 4.32], tangent: [1, 0], outward: [0, -1], width: 12.64, front: true, groundMaximum: row.b, clearanceM: 5 }];
      const home: EvidenceBuilding = { id: row.id, tileId: tile, address: 'Fixture', outline: [[e - 6.32, n - 4.32], [e + 6.32, n - 4.32], [e + 6.32, n + 4.32], [e - 6.32, n + 4.32]],
        frames, base: row.b, floor: row.b + .4, eave: row.b + 5.8, peak: row.b + 9, stories: 2, style: 'COLONIAL', year: 1920, material: 'siding', paint: '#d9d5c8',
        roof: 'gable', porch: 'none', documented: false, evidenceIds: [], colorsDated: false, entry: null };
      const group = new THREE.Group(), geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute([e - 4, row.b + 2, -(n - 4), e - 2, row.b + 2, -(n - 4), e - 4, row.b + 4, -(n - 4)], 3));
      const inferred = new THREE.MeshStandardMaterial(); inferred.name = 'V2 inferred | siding';
      group.add(new THREE.Mesh(geometry, inferred));
      applyEvidenceBuildings(group, tile, [0, 0, 0], 0, [home], [], undefined, [], [{ ...row, e: [row.b + 5.8], ep, f: { material: 'siding', bays: 3 } }]);
      const tops: [number, number][] = [];
      group.traverse(o => { if (o instanceof THREE.Mesh && [o.material].flat().some(m => m.name.includes('| glass |'))) {
        const p = o.geometry.getAttribute('position');
        for (let i = 0; i < p.count; i += 36) { let x = 0, y = -Infinity; for (let k = i; k < i + 36 && k < p.count; k++) { x += p.getX(k) / 36; y = Math.max(y, p.getY(k)); } tops.push([x - e, y - row.b]); }
      } });
      return tops;
    };
    const level = glassTops([5.8]), gable = glassTops([[[0, 5.8], [6, 8.6], [12, 5.8]]]);
    expect(Math.max(...level.map(t => t[1]))).toBeLessThan(5.8);
    // an attic window stands in the middle of the gable, under its rakes
    const attic = gable.filter(t => t[1] > 5.8);
    expect(attic.length).toBeGreaterThan(0);
    for (const [x, y] of attic) expect(y).toBeLessThan(8.6 - Math.abs(x) * 2.8 / 6);
  });

  it('builds stacked porches up the storeys, open or enclosed as photographed', () => {
    const tile = tiles[0], row = packet(tile).rows[0], [e, n] = row.o;
    const inFront = (f: NonNullable<MeasuredRoof['f']>) => {
      const frames = [{ start: [e - 6.32, n - 4.32], tangent: [1, 0], outward: [0, -1], width: 12.64, front: true, groundMaximum: row.b + .3, clearanceM: 6 }];
      const home: EvidenceBuilding = { id: row.id, tileId: tile, address: 'Fixture', outline: [[e - 6.32, n - 4.32], [e + 6.32, n - 4.32], [e + 6.32, n + 4.32], [e - 6.32, n + 4.32]],
        frames, base: row.b, floor: row.b + .4, eave: row.b + 8.6, peak: row.b + 10, stories: 3, style: 'TRIPLE DECKER', year: 1910, material: 'siding', paint: '#d9d5c8',
        roof: 'flat', porch: 'none', documented: false, evidenceIds: [], colorsDated: false, entry: { frameIndex: 0, u: 6, floor: row.b + .4 } } as EvidenceBuilding;
      const group = new THREE.Group(), geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute([e - 4, row.b + 2, -(n - 4), e - 2, row.b + 2, -(n - 4), e - 4, row.b + 4, -(n - 4)], 3));
      const inferred = new THREE.MeshStandardMaterial(); inferred.name = 'V2 inferred | siding';
      group.add(new THREE.Mesh(geometry, inferred));
      applyEvidenceBuildings(group, tile, [0, 0, 0], 0, [home], [], undefined, [], [{ ...row, e: [row.b + 8.6], ep: [8.6], f }]);
      const roles = new Map<string, number>();
      group.traverse(o => { if (o instanceof THREE.Mesh) for (const m of [o.material].flat()) {
        const role = m.name.split(' | ')[1], p = o.geometry.getAttribute('position');
        // above the second floor, more than a metre out from the (inset) front wall
        for (let i = 0; i < p.count; i++) if (p.getY(i) > row.b + 3.8 && -p.getZ(i) < n - 4 - 1) roles.set(role, (roles.get(role) ?? 0) + 1);
      } });
      return roles;
    };
    // the measured body itself is the same in both; the upper porches differ
    const stack = { material: 'siding', porch: 'stacked', side: 'full', ground: 'open' } as const;
    const none = inFront({ material: 'siding', porch: 'none' }), open = inFront({ ...stack, upper: 'open' }), enclosed = inFront({ ...stack, upper: 'enclosed' });
    const count = (m: Map<string, number>, k: string) => m.get(k) ?? 0;
    expect(count(open, 'trim')).toBeGreaterThan(count(none, 'trim'));
    expect(count(enclosed, 'wall')).toBeGreaterThan(count(open, 'wall'));
    expect(count(enclosed, 'glass')).toBeGreaterThan(count(open, 'glass'));
  });

  it('sets walls in under the roofprint so the eaves overhang', () => {
    expect(MEASURED_WALL_INSET).toBeGreaterThan(.2); expect(MEASURED_WALL_INSET).toBeLessThan(.5);
    const row = packet(tiles[0]).rows[0], batch = new Batch(new THREE.Vector3(), 0);
    measuredBody(batch, row.id, tiles[0], row, 'wall', '#d9d5c8', '#50544e');
    const built = batch.finish(); expect(built.triangles).toBeGreaterThan(10);
    built.group.traverse(o => { if (o instanceof THREE.Mesh) { o.geometry.dispose(); for (const m of [o.material].flat()) m.dispose(); } });
  });
});
