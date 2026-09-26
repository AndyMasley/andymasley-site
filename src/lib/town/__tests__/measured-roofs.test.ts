// @vitest-environment node
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import index from '../../../../data/derived/town/measured-roofs-index.json';
import homeIndex from '../../../../data/derived/town/residential-evidence-index.json';
import { measuredRoofAsset, validMeasuredRoofPacket, measuredBody, isMeasuredOther, isPhotographedHouse, evergreens, MEASURED_ROOF_COVERAGE, type MeasuredRoof, type MeasuredOther, type MeasuredRoofPacket } from '../measured-roofs';
import { treeForm } from '../vegetation';
import { applyEvidenceBuildings, mergeVehicleDoors, MEASURED_WALL_INSET } from '../evidence-buildings';
import { prepareOpenings } from '../opening-detail';
import { Batch } from '../crafted-frontages';
import type { EvidenceBuilding } from '../evidence-types';

const tiles = index.tiles.split(',');
const packet = (tile: string): MeasuredRoofPacket => JSON.parse(readFileSync(resolve('public', measuredRoofAsset(tile)!.url.slice(1)), 'utf8'));
/** The measured houses of a tile's packet (its garages and other buildings left out). */
const houses = (tile: string) => packet(tile).rows.filter((r): r is MeasuredRoof => !isMeasuredOther(r) && !isPhotographedHouse(r));
const decode = (s: string) => new Uint8Array(Buffer.from(s, 'base64'));
function vertices(r: MeasuredRoof) { const b = decode(r.v); return new Int16Array(b.buffer, b.byteOffset, b.length / 2); }
function tris(r: MeasuredRoof, key: string) { const b = decode(key), n = vertices(r).length / 3; return n <= 255 ? Array.from(b) : Array.from(new Uint16Array(b.buffer, b.byteOffset, b.length / 2)); }

const homes = new Map<string, string>(), records = new Map<string, EvidenceBuilding>();
for (const [tile, asset] of Object.entries(homeIndex.tiles as Record<string, { url: string }>))
  for (const row of JSON.parse(readFileSync(resolve('public', asset.url.slice(1)), 'utf8')).buildings) { homes.set(row.id, tile); records.set(row.id, row); }

describe('measured house roofs', () => {
  it('ships one valid packet per listed tile, for measured residential houses only', () => {
    const dir = resolve('public', index.dir.slice(1));
    expect(readdirSync(dir).sort()).toEqual(tiles.map(t => `${t}.json`).sort());
    let count = 0; const seen = new Set<string>();
    for (const tile of tiles) {
      const p = packet(tile);
      expect(validMeasuredRoofPacket(p, tile), tile).toBe(true);
      for (const row of p.rows) {
        if (isMeasuredOther(row)) expect(homes.has(row.id), row.id).toBe(false);
        else { expect(homes.get(row.id), row.id).toBe(tile); if (!isPhotographedHouse(row)) count++; }
        expect(seen.has(row.id)).toBe(false); seen.add(row.id);
      }
    }
    expect(count).toBe(index.count);
    expect(seen.size).toBe(index.count + index.photographed + index.others + index.kept);
    expect(MEASURED_ROOF_COVERAGE.houses).toBeGreaterThan(homeIndex.count * .9);
    expect(measuredRoofAsset('no-such-tile')).toBeUndefined();
    // the game's tile bitmap holds exactly the listed tiles
    expect(MEASURED_ROOF_COVERAGE.tiles).toBe(tiles.length);
    for (let x = -20; x <= 20; x++) for (let y = -20; y <= 20; y++) expect(!!measuredRoofAsset(`${x}_${y}`), `${x}_${y}`).toBe(tiles.includes(`${x}_${y}`));
    expect(existsSync(resolve('public/town-evidence/v1/measured'))).toBe(true);
  });

  it('keeps every tile packet small enough to stream beside its scenery', () => {
    for (const tile of tiles) expect(JSON.stringify(packet(tile)).length, tile).toBeLessThan(200_000);
    expect(index.bytes).toBeLessThan(15_000_000);
  });

  it('rejects packets with out-of-range indices, bad colours or the wrong tile', () => {
    const p = packet(tiles[0]), row = houses(tiles[0])[0];
    expect(validMeasuredRoofPacket({ ...p, tileId: 'x' }, tiles[0])).toBe(false);
    expect(validMeasuredRoofPacket({ ...p, rows: [{ ...row, rc: 'red' }] }, tiles[0])).toBe(false);
    const n = vertices(row).length / 3, big = n <= 255 ? Buffer.from([0, 1, 255]) : Buffer.from(new Uint16Array([0, 1, 65535]).buffer);
    expect(validMeasuredRoofPacket({ ...p, rows: [{ ...row, r: big.toString('base64') }] }, tiles[0])).toBe(false);
    expect(validMeasuredRoofPacket({ ...p, rows: [row, row] }, tiles[0])).toBe(false);
  });

  it('builds roofs that face the sky and walls that stand upright, below the measured peak', () => {
    let checked = 0;
    for (const tile of tiles.slice(0, 40)) for (const row of houses(tile)) {
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
    const tile = tiles.find(t => houses(t).some(r => r.rc && r.c.length))!;
    const row = houses(tile).find(r => r.rc && r.c.length)!;
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
    for (const tile of tiles) for (const r of houses(tile)) { rows++; if (r.wc) painted++; if (r.f) read++; }
    expect(painted / rows).toBeGreaterThan(.9); expect(read / rows).toBeGreaterThan(.9);
    const tile = tiles.find(t => houses(t).some(r => r.wc && r.f?.shutters && r.f.material === 'siding'))!;
    const row = houses(tile).find(r => r.wc && r.f?.shutters && r.f.material === 'siding')!;
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
    const tile = tiles.find(t => houses(t).length)!, row = houses(tile)[0], [e, n] = row.o;
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
    const tile = tiles.find(t => houses(t).length)!, row = houses(tile)[0], [e, n] = row.o;
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

  it('hangs photographed garage doors beside the entry, in their colour, and keeps yard dressing clear of them', () => {
    const tile = tiles.find(t => houses(t).length)!, row = houses(tile)[0], [e, n] = row.o;
    const build = (f: NonNullable<MeasuredRoof['f']>, gathered = true) => {
      const frames = [{ start: [e - 6.32, n - 4.32], tangent: [1, 0], outward: [0, -1], width: 12.64, front: true, groundMaximum: row.b, clearanceM: 5 }];
      const home: EvidenceBuilding = { id: row.id, tileId: tile, address: 'Fixture', outline: [[e - 6.32, n - 4.32], [e + 6.32, n - 4.32], [e + 6.32, n + 4.32], [e - 6.32, n + 4.32]],
        frames, base: row.b, floor: row.b + .4, eave: row.b + 5.8, peak: row.b + 9, stories: 2, style: 'RAISED RANCH', year: 1975, material: 'siding', paint: '#d9d5c8',
        roof: 'gable', porch: 'none', documented: false, evidenceIds: [], colorsDated: false, entry: { frameIndex: 0, u: 3, floor: row.b + .4 } } as EvidenceBuilding;
      const group = new THREE.Group(), geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute([e - 4, row.b + 2, -(n - 4), e - 2, row.b + 2, -(n - 4), e - 4, row.b + 4, -(n - 4)], 3));
      const inferred = new THREE.MeshStandardMaterial(); inferred.name = 'V2 inferred | siding';
      group.add(new THREE.Mesh(geometry, inferred));
      if (gathered) group.userData.openings = { doors: [], garageDoors: [] };
      applyEvidenceBuildings(group, tile, [0, 0, 0], 0, [home], [], undefined, [], [{ ...row, e: [row.b + 5.8], ep: [5.8], f }]);
      const doors = new Map<string, THREE.MeshStandardMaterial>();
      group.traverse(o => { if (o instanceof THREE.Mesh) for (const m of [o.material].flat()) if (m.name.startsWith('Crafted frontage | door |')) doors.set(m.name, m as THREE.MeshStandardMaterial); });
      return { group, doors };
    };
    const plain = build({ material: 'siding', bays: 3 });
    expect(plain.group.userData.openings.garageDoors).toHaveLength(0);
    // two doors on the right of the front as seen from the street (east, for a south-facing front), painted blue
    const { group, doors } = build({ material: 'siding', bays: 3, gd: 2, gs: 'right', gc: '#3f6c9e' });
    const garages = group.userData.openings.garageDoors as number[][];
    expect(garages).toHaveLength(2);
    for (const [x, , z] of garages) {
      expect(x - e).toBeGreaterThan(3 - 6.32 + 1); // clear of the entry at u = 3
      expect(x - e).toBeLessThan(6.32);
      expect(-z).toBeCloseTo(n - 4.32, 0);
    }
    expect(Math.abs(garages[0][0] - garages[1][0])).toBeGreaterThan(2.2);
    // the observed colour is kept, not swapped for a period door colour
    const blue = doors.get('Crafted frontage | door | #3f6c9e');
    expect(blue).toBeDefined();
    const shader = { vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader, uniforms: {} };
    blue!.onBeforeCompile(shader as Parameters<THREE.Material['onBeforeCompile']>[0], {} as THREE.WebGLRenderer);
    expect(shader.fragmentShader).toContain('#define TOWN_DOOR_KEEP_COLOR');
    // no ground-floor window over the garage doors
    let low = 0;
    group.traverse(o => { if (o instanceof THREE.Mesh && [o.material].flat().some(m => m.name.includes('| glass |'))) {
      const p = o.geometry.getAttribute('position');
      for (let i = 0; i < p.count; i++) if (p.getY(i) < row.b + 2.4 && p.getX(i) - e > 1.4 && -p.getZ(i) < n - 4) low++;
    } });
    expect(low).toBe(0);
    // In the game the tile's openings are gathered after assembly; the doors join them, facing and width kept.
    const late = build({ material: 'siding', bays: 3, gd: 2, gs: 'right', gc: '#3f6c9e' }, false).group;
    expect(late.userData.openings).toBeUndefined();
    late.userData.openings = prepareOpenings(late); mergeVehicleDoors(late);
    const merged = (late.userData.openings.garageDoors as number[][]).filter(d => d.length === 6);
    expect(merged).toHaveLength(2);
    for (const d of merged) { expect(d[3]).toBeCloseTo(0, 5); expect(d[4]).toBeCloseTo(1, 5); expect(d[5]).toBeGreaterThan(2); }
  });

  it('puts a photographed garage in its wing and moves a plan entry the doors displace onto a fitted stoop', () => {
    const tile = tiles.find(t => houses(t).length)!, row = houses(tile)[0], [e0, n0] = row.o, b = row.b;
    // A main block (8 m) and a garage wing to its west (4 m, set back 1.2 m), both facing the street to the south.
    const ring = [[-4, 1.2], [0, 1.2], [0, 0], [8, 0], [8, 8], [-4, 8]].map(([x, y]) => [e0 + x, n0 + y]);
    const frames = ring.map((a, i) => {
      const c = ring[(i + 1) % ring.length], width = Math.hypot(c[0] - a[0], c[1] - a[1]), t = [(c[0] - a[0]) / width, (c[1] - a[1]) / width];
      return { start: a, tangent: t, outward: [t[1], -t[0]], width, front: i === 0, groundMaximum: b, clearanceM: 6 };
    });
    const home = { id: row.id, tileId: tile, address: 'Fixture', outline: ring, frames, base: b, floor: b + .5, eave: b + 5.8, peak: b + 8, stories: 2, style: 'COLONIAL', year: 1960,
      material: 'siding', paint: '#eee4b7', roof: 'gable', porch: 'none', documented: false, evidenceIds: [], colorsDated: false, entry: { frameIndex: 0, u: 2, floor: b + .5 } } as unknown as EvidenceBuilding;
    const group = new THREE.Group();
    const flat = (name: string, y: number, [x0, y0, x1, y1]: number[]) => {
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([x0, y, -y0, x1, y, -y0, x1, y, -y1, x0, y, -y0, x1, y, -y1, x0, y, -y1], 3));
      const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial()); mesh.name = name; group.add(mesh);
    };
    flat('terrain_1', b, [e0 - 30, n0 - 30, e0 + 30, n0 + 30]);
    const wall = new THREE.BufferGeometry(); wall.setAttribute('position', new THREE.Float32BufferAttribute([e0 + 2, b + 2, -n0, e0 + 4, b + 2, -n0, e0 + 2, b + 4, -n0], 3));
    const inferred = new THREE.MeshStandardMaterial(); inferred.name = 'V2 inferred | siding'; group.add(new THREE.Mesh(wall, inferred));
    group.userData.openings = { doors: [], garageDoors: [] };
    const f = { material: 'siding', bays: 2, gd: 1, gs: 'left', gc: '#3f6c9e' } as const;
    applyEvidenceBuildings(group, tile, [0, 0, 0], 0, [home], [], undefined, [], [{ ...row, e: frames.map(() => b + 5.8), ep: frames.map(() => 5.8), f }]);
    const garages = group.userData.openings.garageDoors as number[][];
    expect(garages).toHaveLength(1);
    expect(garages[0][0] - e0).toBeGreaterThan(-4); expect(garages[0][0] - e0).toBeLessThan(0);
    // the door now stands centred on the main block, on a stoop of fitted blocks
    const moved = (group.userData.addressFrontages as { id: string; frameIndex: number; entry: { u: number } }[]).find(s => s.id === row.id)!;
    expect(moved.frameIndex).toBe(2);
    let stoop = 0;
    group.traverse(o => { if (o instanceof THREE.Mesh && [o.material].flat().some(m => m.name === 'Crafted frontage | stone | #a3a297')) {
      const p = o.geometry.getAttribute('position');
      for (let i = 0; i < p.count; i++) { expect(Math.abs(p.getX(i) - e0 - 4)).toBeLessThan(1); expect(-p.getZ(i) - n0).toBeLessThan(.33); stoop++; }
    } });
    expect(stoop).toBeGreaterThan(0);
  });

  it('builds a raised ranch as a split foyer: main windows under the eaves, the lower level sided with its own windows', () => {
    const tile = tiles.find(t => houses(t).length)!, row = houses(tile)[0], [e, n] = row.o, b = row.b;
    const frames = [{ start: [e - 6.32, n - 4.32], tangent: [1, 0], outward: [0, -1], width: 12.64, front: true, groundMaximum: b + .7, groundAt: [b + .2, b + .45, b + .7], clearanceM: 6 }];
    const home = { id: row.id, tileId: tile, address: 'Fixture', outline: [[e - 6.32, n - 4.32], [e + 6.32, n - 4.32], [e + 6.32, n + 4.32], [e - 6.32, n + 4.32]],
      frames, base: b, floor: b + 1.7, eave: b + 4.6, peak: b + 7, stories: 1, style: 'RAISED RANCH', year: 1972, material: 'siding', paint: '#f1f1ed',
      roof: 'gable', porch: 'none', documented: false, evidenceIds: [], colorsDated: false, entry: { frameIndex: 0, u: 6.32, floor: b + 1.7 } } as unknown as EvidenceBuilding;
    const group = new THREE.Group(), geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([e - 4, b + 2, -(n - 4.32), e - 2, b + 2, -(n - 4.32), e - 4, b + 4, -(n - 4.32)], 3));
    const inferred = new THREE.MeshStandardMaterial(); inferred.name = 'V2 inferred | siding';
    group.add(new THREE.Mesh(geometry, inferred));
    applyEvidenceBuildings(group, tile, [0, 0, 0], 0, [home], [], undefined, [], [{ ...row, e: [b + 4.6], ep: [4.6], f: { material: 'siding', bays: 3 } }]);
    const glass: number[][] = [], band: number[] = [];
    group.traverse(o => { if (o instanceof THREE.Mesh) for (const m of [o.material].flat()) {
      const p = o.geometry.getAttribute('position');
      if (m.name.includes('| glass |')) for (let i = 0; i < p.count; i += 36) { let lo = Infinity, hi = -Infinity; for (let k = i; k < i + 36 && k < p.count; k++) { lo = Math.min(lo, p.getY(k)); hi = Math.max(hi, p.getY(k)); } glass.push([lo - b, hi - b]); }
      if (m.name === 'Crafted frontage | foundation | #858579') for (let i = 0; i < p.count; i++) band.push(p.getY(i) - b);
    } });
    // main floor a storey under the 4.6 m wall top (not at the 1.7 m entry landing): sills near 2.9 m, heads under the frieze
    const upper = glass.filter(([lo]) => lo > 2), lower = glass.filter(([, hi]) => hi < 2.2);
    expect(upper.length).toBeGreaterThan(0); expect(lower.length).toBeGreaterThan(0);
    for (const [lo, hi] of upper) { expect(lo).toBeGreaterThan(2.6); expect(hi).toBeLessThan(4.6 - .2); }
    for (const [lo] of lower) expect(lo).toBeGreaterThan(.55);
    // concrete only to a low strip above grade, not up to the entry landing
    expect(Math.max(...band)).toBeLessThan(.7 + .3 + .01);
  });

  it('rebuilds garages, sheds and other plain buildings: measured bodies, doors where the drive meets them, windows by storey', () => {
    const others = tiles.flatMap(t => packet(t).rows.filter(isMeasuredOther).map(r => ({ tile: t, row: r })));
    expect(others.filter(o => o.row.k !== 'v').length).toBe(index.others);
    expect(others.filter(o => o.row.k === 'v').length).toBe(index.kept);
    const build = ({ tile, row }: { tile: string; row: MeasuredOther }) => {
      const ring = row.ol.map(([x, y]) => [row.o[0] + x / 10, row.o[1] + y / 10]), [e, n] = row.o;
      const group = new THREE.Group(), add = (name: string, positions: number[]) => {
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        const m = new THREE.MeshStandardMaterial(); m.name = name; const mesh = new THREE.Mesh(g, m); mesh.name = name.startsWith('terrain') ? name : 'buildings_1'; group.add(mesh); return mesh;
      };
      add('terrain_1', [e - 40, row.b, -(n - 40), e + 40, row.b, -(n - 40), e + 40, row.b, -(n + 40), e - 40, row.b, -(n - 40), e + 40, row.b, -(n + 40), e - 40, row.b, -(n + 40)]);
      // The scenery's box: a wall triangle on the first edge and its dark door.
      const [a, b] = [ring[0], ring[1]], mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const siding = add('V2 inferred | siding', [a[0], row.b + .5, -a[1], b[0], row.b + .5, -b[1], mid[0], row.b + 2, -mid[1]]);
      const door = add('V2 inferred | door', [mid[0] - .5, row.b + .8, -mid[1], mid[0] + .5, row.b + .8, -mid[1], mid[0], row.b + 1.8, -mid[1]]);
      group.userData.openings = { doors: [], garageDoors: [] };
      const report = applyEvidenceBuildings(group, tile, [0, 0, 0], 0, [], [], undefined, [], [row])!;
      const names = new Map<string, number>();
      group.traverse(o => { if (o instanceof THREE.Mesh) for (const m of [o.material].flat()) names.set(m.name, (names.get(m.name) ?? 0) + o.geometry.getAttribute('position').count); });
      return { group, report, names, siding, door };
    };
    // a measured garage: its body, its vehicle doors on the drive's wall, the scenery's box and door gone
    const garage = others.find(o => o.row.k === 'o' && o.row.gn && o.row.wc)!;
    const g = build(garage);
    expect(g.report.otherIds).toEqual([garage.row.id]);
    expect(g.report.buildingIds).toEqual([]);
    expect(g.siding.parent).toBeNull(); expect(g.door.parent).toBeNull();
    expect(g.names.get(`Crafted frontage | wall | ${garage.row.wc}`)).toBeGreaterThan(0);
    const doors = g.group.userData.openings.garageDoors as number[][];
    expect(doors.length).toBeGreaterThan(0); expect(doors.length).toBeLessThanOrEqual(garage.row.gn!);
    const ring = garage.row.ol.map(([x, y]) => [garage.row.o[0] + x / 10, garage.row.o[1] + y / 10]), wall = garage.row.gw!;
    const [a, b] = [ring[wall], ring[(wall + 1) % ring.length]], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    for (const [x, , z] of doors) {
      // on that wall's line, 0.3 m out, and within its length
      const t = [(b[0] - a[0]) / len, (b[1] - a[1]) / len], rel = [x - a[0], -z - a[1]];
      expect(Math.abs(rel[0] * t[1] - rel[1] * t[0])).toBeLessThan(.7);
      expect(rel[0] * t[0] + rel[1] * t[1]).toBeGreaterThan(0); expect(rel[0] * t[0] + rel[1] * t[1]).toBeLessThan(len);
    }
    // a scenery box kept as it is: its siding repainted, its floating door replaced
    const kept = others.find(o => o.row.k === 'v' && o.row.wc && o.row.dw !== undefined && o.row.h! > 2.6)!;
    const v = build(kept);
    expect(v.siding.parent).not.toBeNull(); expect(v.door.parent).toBeNull();
    expect([...[v.siding.material].flat()].map(m => m.name)).toContain(`Crafted frontage | wall | ${kept.row.wc}`);
    expect([...v.names.keys()].some(k => k.startsWith('Crafted frontage | door |'))).toBe(true);
    expect([...v.names.keys()].some(k => k.startsWith('Crafted frontage | roof |'))).toBe(false);
    // a building: storeys of windows and a door toward the street
    const building = others.find(o => o.row.k === 'b' && o.row.dw !== undefined && o.row.p! - o.row.b > 6)!;
    const w = build(building);
    expect([...w.names.keys()].some(k => k.includes('| glass |'))).toBe(true);
    expect([...w.names.keys()].some(k => k.startsWith('Crafted frontage | door |'))).toBe(true);
    // photographed buildings: brick in the read colour, overhead doors in the street face, a shopfront under its awning
    const brick = others.find(o => o.row.k === 'b' && o.row.m === 'brick' && o.row.wc)!;
    expect(build(brick).names.get(`Crafted frontage | brick | ${brick.row.wc}`)).toBeGreaterThan(0);
    const bays = others.find(o => o.row.k === 'b' && o.row.fb?.od && o.row.fb.oc)!;
    const works = build(bays);
    expect((works.group.userData.openings.garageDoors as number[][]).length).toBeGreaterThan(0);
    expect(works.names.get(`Crafted frontage | door | ${bays.row.fb!.oc}`)).toBeGreaterThan(0);
    const shop = others.find(o => o.row.k === 'b' && o.row.fb?.st && o.row.fb.aw);
    if (shop) {
      const front = build(shop);
      expect(front.names.get(`Crafted frontage | metal | ${shop.row.fb!.aw}`)).toBeGreaterThan(0);
      expect([...front.names.keys()].some(k => k.includes('| glass |'))).toBe(true);
    }
  });

  it('paints a house the lidar could not fit from its photograph, on the scenery body', () => {
    const tile = tiles.find(t => packet(t).rows.filter(isPhotographedHouse).some(r => r.wc && r.f?.door))!;
    const photo = packet(tile).rows.filter(isPhotographedHouse).find(r => r.wc && r.f?.door)!;
    const home = records.get(photo.id)!;
    expect(houses(tile).some(r => r.id === photo.id)).toBe(false);
    const [a, b] = [home.outline[0], home.outline[1]], mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const group = new THREE.Group(), geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([a[0], home.base + .5, -a[1], b[0], home.base + .5, -b[1], mid[0], home.base + 2, -mid[1]], 3));
    const inferred = new THREE.MeshStandardMaterial(); inferred.name = 'V2 inferred | siding';
    const mesh = new THREE.Mesh(geometry, inferred); group.add(mesh);
    const report = applyEvidenceBuildings(group, tile, [0, 0, 0], 0, [home], [], undefined, [], [photo])!;
    expect(report.buildingIds).toEqual([photo.id]);
    expect(report.removedTriangles).toBe(0);
    const wall = photo.f?.material === 'brick' ? 'brick' : photo.f?.material === 'stone' ? 'stone' : photo.f?.material === 'stucco' ? 'stucco' : photo.f?.material === 'shingle' ? 'shingle' : 'wall';
    expect([mesh.material].flat().map(m => m.name)).toContain(`Crafted frontage | ${wall} | ${photo.wc}`);
    const names = new Set<string>();
    group.traverse(o => { if (o instanceof THREE.Mesh) for (const m of [o.material].flat()) names.add(m.name); });
    if (home.entry) expect(names.has(`Crafted frontage | door | ${photo.f!.door}`)).toBe(true);
  });

  it('marks the evergreens the leaf-off aerial shows among the scenery trees', () => {
    const release = resolve('public/town-assets', readdirSync(resolve('public/town-assets')).find(d => existsSync(resolve('public/town-assets', d, 'manifest.json')))!);
    const manifest = JSON.parse(readFileSync(resolve(release, 'manifest.json'), 'utf8')) as { tiles: { id: string; treeFile?: { url: string; count: number } }[] };
    let trees = 0, conifers = 0;
    for (const tile of manifest.tiles) {
      if (!tile.treeFile?.count) continue;
      const p = packet(tile.id), flag = evergreens(p.trees, tile.treeFile.count);
      expect(flag, tile.id).toBeDefined();
      for (let i = 0; i < tile.treeFile.count; i++) { trees++; if (flag!(i)) conifers++; }
    }
    expect(trees).toBe(index.trees); expect(conifers).toBe(index.evergreens);
    expect(conifers / trees).toBeGreaterThan(.04); expect(conifers / trees).toBeLessThan(.3);
    // a mismatched count falls back to the habitat draw
    expect(evergreens({ n: 3, c: 'Bw==' }, 4)).toBeUndefined();
    const row = [10, 12, -10, 1.2, 3, 1.2, 0];
    expect(treeForm(row, [0, 0, 0], false, true).renderFamily).toBe('conifer');
    expect(treeForm(row, [0, 0, 0], false, false).renderFamily).toBe('broadleaf');
  });

  it('sets walls in under the roofprint so the eaves overhang', () => {
    expect(MEASURED_WALL_INSET).toBeGreaterThan(.2); expect(MEASURED_WALL_INSET).toBeLessThan(.5);
    const tile = tiles.find(t => houses(t).length)!, row = houses(tile)[0], batch = new Batch(new THREE.Vector3(), 0);
    measuredBody(batch, row.id, tile, row, 'wall', '#d9d5c8', '#50544e');
    const built = batch.finish(); expect(built.triangles).toBeGreaterThan(10);
    built.group.traverse(o => { if (o instanceof THREE.Mesh) { o.geometry.dispose(); for (const m of [o.material].flat()) m.dispose(); } });
  });
});
