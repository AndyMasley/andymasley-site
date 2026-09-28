// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import index from '../../../../data/derived/town/rail-corridor-index.json';
import release from '../../../../data/derived/town/release.json';
import * as rail from '../rail-corridor';
import { openRailWalks } from '../rail-corridor-ground';
import { tileAssemblySteps } from '../tile-assembly';
import { TownWorld } from '../world';
import type { AssetRef, TownTile, WorldManifest } from '../contracts';
import type { TileDetailStream } from '../optional-detail';
import { estimateRetainedBytes } from '../byte-cache';

const roots: THREE.Group[] = [];
afterEach(() => {
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
  for (const root of roots) root.traverse(o => { if (o instanceof THREE.Mesh) { geometries.add(o.geometry); (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => materials.add(m)); } });
  geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); roots.length = 0;
});
const fresh = () => { const group = new THREE.Group(); roots.push(group); return group; };
function packet(tileId = '0_0', points?: rail.RailPoint[]): rail.RailCorridorPacket {
  const [e, n] = tileId.split('_').map(v => Number(v) * 250);
  return { version: 1, tileId, origin: [e, 0, -n], sourceManifestSha256: index.sourceManifestSha256, sourceRailwaySha256: index.sourceRailwaySha256,
    sourceLods: { '0': 'a'.repeat(64), '1': 'b'.repeat(64), '2': 'c'.repeat(64) },
    rows: [{ wayId: 1, bridge: false, points: points ?? [[e - 2, n + 125, 10, 0, 0, 1], [e + 252, n + 125, 10, 254, 0, 1]] }] };
}
const apply = (group: THREE.Group, p = packet(), level = 0) => rail.applyRailCorridor(group, p.tileId, p.origin as [number, number, number], level, p.sourceLods[String(level)], p)!;
const meshes = (group: THREE.Object3D, role?: string) => { const out: THREE.Mesh[] = []; group.traverse(o => { if (o instanceof THREE.Mesh && o.name.startsWith('Rail corridor |') && (!role || o.name === `Rail corridor | ${role}`)) out.push(o); }); return out; };
function plane(group: THREE.Group, name: string, e: number, n: number, width: number, depth: number, height: number) {
  const geometry = new THREE.PlaneGeometry(width, depth).rotateX(-Math.PI / 2).translate(e, height, -n), material = new THREE.MeshStandardMaterial(); material.name = name;
  const mesh = new THREE.Mesh(geometry, material); mesh.name = name === 'terrain' ? 'terrain' : 'retained road'; group.add(mesh); return mesh;
}
function ray(group: THREE.Object3D, role: string, from: THREE.Vector3, direction = new THREE.Vector3(0, -1, 0)) {
  group.updateMatrixWorld(true); return new THREE.Raycaster(from, direction).intersectObjects(meshes(group, role), false);
}
function sourceSnapshot(mesh: THREE.Mesh) {
  return { mesh, geometry: mesh.geometry, material: mesh.material, index: mesh.geometry.index, indexValues: mesh.geometry.index?.array.slice(), attributes: Object.fromEntries(Object.entries(mesh.geometry.attributes).map(([k, a]) => [k, { attribute: a, values: a.array.slice() }])) };
}
function unchanged(saved: ReturnType<typeof sourceSnapshot>) {
  expect(saved.mesh.geometry).toBe(saved.geometry); expect(saved.mesh.material).toBe(saved.material); expect(saved.mesh.geometry.index).toBe(saved.index); expect(saved.index?.array).toEqual(saved.indexValues);
  for (const [name, value] of Object.entries(saved.attributes)) { expect(saved.mesh.geometry.getAttribute(name)).toBe(value.attribute); expect(value.attribute.array).toEqual(value.values); }
}

describe('continuous source-qualified railway geometry', () => {
  it('ships only current, content-addressed packets with source provenance', () => {
    expect(index.sourceManifestSha256).toBe(release.manifestSha256);
    expect(createHash('sha256').update(fs.readFileSync('data/source/town/rail-crossings/active-railways.json')).digest('hex')).toBe(index.sourceRailwaySha256);
    const rows = Object.entries(index.tiles as Record<string, AssetRef>); expect(rows.length).toBeGreaterThan(0);
    for (const [id, asset] of rows) {
      const bytes = fs.readFileSync(`public${asset.url}`), value = JSON.parse(bytes.toString());
      expect(bytes.length).toBe(asset.bytes); expect(createHash('sha256').update(bytes).digest('hex')).toBe(asset.sha256);
      expect(rail.railCorridorAsset(id)).toEqual(asset); expect(rail.validRailCorridorPacket(value, id)).toBe(true);
      expect(estimateRetainedBytes(value), `${id} desktop rail packet retention`).toBeLessThanOrEqual(1.5 * 1024 * 1024);
    }
    expect(rail.railCorridorAsset('unregistered')).toBeUndefined();
  });

  it.each(['owner', 'origin', 'manifest', 'rail source', 'LOD hashes', 'empty rows', 'nonfinite point', 'normal', 'reversed station', 'coincident points', 'unbounded station'])(
    'rejects malformed %s before adding geometry or exclusions', failure => {
      const p = packet(), group = fresh(), source = plane(group, 'terrain', 125, 125, 250, 250, 9.7), saved = sourceSnapshot(source);
      if (failure === 'owner') p.tileId = '1_0';
      if (failure === 'origin') p.origin[0]++;
      if (failure === 'manifest') p.sourceManifestSha256 = 'd'.repeat(64);
      if (failure === 'rail source') p.sourceRailwaySha256 = 'e'.repeat(64);
      if (failure === 'LOD hashes') p.sourceLods['2'] = 'invalid';
      if (failure === 'empty rows') p.rows = [];
      if (failure === 'nonfinite point') p.rows[0].points[1][2] = NaN;
      if (failure === 'normal') p.rows[0].points[0][5] = 0;
      if (failure === 'reversed station') p.rows[0].points[1][3] = 0;
      if (failure === 'coincident points') p.rows[0].points[1].splice(0, 2, ...p.rows[0].points[0].slice(0, 2));
      if (failure === 'unbounded station') p.rows[0].points[1][3] = 1e12;
      expect(rail.validRailCorridorPacket(p, '0_0')).toBe(false);
      // Stop at validation for malicious station ranges: calling a broken
      // renderer with them would monopolize the test process.
      if (failure !== 'unbounded station') expect(rail.applyRailCorridor(group, '0_0', [0, 0, 0], 0, 'a'.repeat(64), p)?.rejected).toBe(true);
      unchanged(saved); expect(group.children).toEqual([source]); expect(group.userData).toEqual({});
    });

  it('rejects the wrong runtime source/LOD/origin atomically and ignores absent optional data', () => {
    const p = packet(), group = fresh();
    expect(rail.applyRailCorridor(group, '0_0', [0, 0, 0], 0, p.sourceLods['0'])).toBeUndefined();
    for (const [origin, level, sha] of [[[0, 0, 0], 0, 'wrong'], [[0, 0, 0], 3, p.sourceLods['0']], [[0, 0, 1], 0, p.sourceLods['0']]] as const) {
      expect(rail.applyRailCorridor(group, '0_0', [...origin], level, sha, p)?.rejected).toBe(true);
      expect(group.children).toEqual([]); expect(group.userData).toEqual({});
    }
  });

  it.each([0, 1, 2])('keeps retained source exact and emits finite, wound, tile-clipped geometry at LOD %i', level => {
    const p = packet(), group = fresh(), source = plane(group, 'terrain', 125, 125, 250, 250, 9.66), saved = sourceSnapshot(source);
    const disposed = vi.spyOn(source.geometry, 'dispose'), report = apply(group, p, level);
    expect(report.status).toBe('applied'); expect(report.rejected).toBe(false); expect(report.ties).toBeGreaterThan(300);
    unchanged(saved); expect(disposed).not.toHaveBeenCalled();
    let count = 0, invalid = 0, outside = 0;
    for (const mesh of meshes(group)) {
      const position = mesh.geometry.getAttribute('position'), normals = mesh.geometry.getAttribute('normal'); count += position.count / 3;
      for (let i = 0; i < position.count; i++) {
        const p = new THREE.Vector3().fromBufferAttribute(position, i);
        if (!p.toArray().every(Number.isFinite) || p.x < -1e-5 || p.x > 250 + 1e-5 || p.z < -250 - 1e-5 || p.z > 1e-5) outside++;
      }
      for (let i = 0; i < position.count; i += 3) {
        const [a, b, c] = [0, 1, 2].map(k => new THREE.Vector3().fromBufferAttribute(position, i + k));
        const normal = b.sub(a).cross(c.sub(a)), stored = new THREE.Vector3().fromBufferAttribute(normals, i);
        if (normal.lengthSq() < 1e-13 || Math.abs(stored.length() - 1) > 1e-5 || normal.normalize().dot(stored) < .999) invalid++;
      }
    }
    expect(outside).toBe(0); expect(invalid).toBe(0); expect(count).toBe(report.triangles); expect(report.geometryBytes).toBeGreaterThan(0);
    const children = [...group.children], exclusions = group.userData.environmentGrassExclusions;
    expect(apply(group, p, level)).toBe(report); expect(group.children).toEqual(children); expect(group.userData.environmentGrassExclusions).toBe(exclusions);
    for (const north of [125 - .72, 125 + .72]) expect(ray(group, 'running surface', new THREE.Vector3(70, 20, -north))[0]?.point.y).toBeCloseTo(10, 6);
    for (const north of [125 - .7174, 125, 125 + .7174]) expect(ray(group, 'running surface', new THREE.Vector3(70, 20, -north))).toEqual([]);
    if (level < 2) {
      // A sleeper is a solid timber block, including its broad station-end faces.
      const station = .61 * 120, x = station - 2;
      const front = ray(group, 'timber ties', new THREE.Vector3(x - .2, 9.80, -125), new THREE.Vector3(1, 0, 0));
      expect(front[0]?.distance).toBeCloseTo(.08, 4);
      const back = ray(group, 'timber ties', new THREE.Vector3(x + .2, 9.80, -125), new THREE.Vector3(-1, 0, 0));
      expect(back[0]?.distance).toBeCloseTo(.08, 4);
    }
  });

  it('suppresses ties and ballast on asphalt, preserves panels, and ignores an overhead road', () => {
    const group = fresh(), p = packet('0_0', [[-2, 125, 10, 0, 0, 1], [100, 125, 10, 102, 0, 1], [112, 125, 10, 114, 0, 1], [135, 125, 10, 137, 0, 1], [175, 125, 10, 177, 0, 1], [252, 125, 10, 254, 0, 1]]);
    const sources = [plane(group, 'Drive road | asphalt', 106, 125, 12, 12, 10), plane(group, 'Rail crossing panels', 106, 125, 6, 2, 10.004), plane(group, 'Drive road | asphalt', 155, 125, 12, 12, 18)];
    const saved = sources.map(sourceSnapshot); apply(group, p); saved.forEach(unchanged);
    for (const x of [100.1, 102, 106, 111.9]) {
      expect(ray(group, 'timber ties', new THREE.Vector3(x, 30, -125))).toEqual([]);
      expect(ray(group, 'ballast', new THREE.Vector3(x, 30, -125))).toEqual([]);
      expect(ray(group, 'running surface', new THREE.Vector3(x, 30, -125.75))[0]?.point.y).toBeCloseTo(10.007, 5);
    }
    const station = Math.round((155 + 2) / .61) * .61, x = station - 2;
    expect(ray(group, 'timber ties', new THREE.Vector3(x, 30, -125))[0]?.point.y).toBeCloseTo(9.86, 5);
    expect(ray(group, 'running surface', new THREE.Vector3(x, 30, -125.75))[0]?.point.y).toBeCloseTo(10, 5);
  });

  it('keeps bridge rails and sleepers at the registered grade above lower roads', () => {
    const p = packet(), group = fresh(); p.rows[0].bridge = true;
    plane(group, 'Drive road | asphalt', 100, 125, 30, 12, 4);
    const report = apply(group, p); expect(report.bridges).toBe(1); expect(meshes(group, 'ballast')).toEqual([]);
    expect(ray(group, 'running surface', new THREE.Vector3(100, 30, -125.75))[0]?.point.y).toBeCloseTo(10, 5);
    expect(ray(group, 'bridge structure', new THREE.Vector3(100, 30, -125))[0]?.point.y).toBeCloseTo(9.75, 5);
    expect(report.ties).toBeGreaterThan(300);
  });

  it('discards faces that collapse at uploaded Float32 precision', () => {
    const p = packet('0_0', [-2, 200.000008, 200.000019, 252].map(e => [e, 125, 10, e + 2, 0, 1])), group = fresh();
    expect(apply(group, p).status).toBe('applied');
    let collapsed = 0;
    for (const mesh of meshes(group)) {
      const p = mesh.geometry.getAttribute('position');
      for (let i = 0; i < p.count; i += 3) {
        const [a, b, c] = [0, 1, 2].map(k => new THREE.Vector3().fromBufferAttribute(p, i + k));
        if (b.sub(a).cross(c.sub(a)).lengthSq() < 1e-14) collapsed++;
      }
    }
    expect(collapsed).toBe(0);
  });

  it('joins adjacent tile clips without changing the elevation, rail edges, or sleeper phase', () => {
    const points: rail.RailPoint[] = [[-2, 123, 10, 0, 0, 1], [240, 125, 11, Math.hypot(242, 2), 0, 1], [260, 126, 12, Math.hypot(242, 2) + Math.hypot(20, 1), 0, 1], [502, 123, 12.5, Math.hypot(242, 2) + Math.hypot(20, 1) + Math.hypot(242, 3), 0, 1]];
    const west = packet('0_0', points.slice(0, 3)), east = packet('1_0', structuredClone(points.slice(1))), groups = [fresh(), fresh()];
    expect(apply(groups[0], west).rejected).toBe(false); expect(apply(groups[1], east).rejected).toBe(false);
    const boundary = (group: THREE.Group, offset: number, role: string) => {
      const values = new Set<string>();
      for (const mesh of meshes(group, role)) {
        const p = mesh.geometry.getAttribute('position');
        for (let i = 0; i < p.count; i++) if (Math.abs(p.getX(i) + offset - 250) < 1e-5) values.add([p.getY(i), p.getZ(i)].map(v => v.toFixed(4)).join(','));
      }
      return [...values].sort();
    };
    for (const role of ['running surface', 'rusted steel', 'ballast']) {
      const a = boundary(groups[0], 0, role), b = boundary(groups[1], 250, role); expect(a.length).toBeGreaterThan(0); expect(a).toEqual(b);
    }
    // A sleeper deliberately centered exactly on the seam exercises both halves.
    const straight: rail.RailPoint[] = [[240, 125, 10, 0.61 * 400 - 10, 0, 1], [260, 125, 10, 0.61 * 400 + 10, 0, 1]], halves = [fresh(), fresh()];
    apply(halves[0], packet('0_0', straight)); apply(halves[1], packet('1_0', structuredClone(straight)));
    expect(boundary(halves[0], 0, 'timber ties')).toEqual(boundary(halves[1], 250, 'timber ties'));
    expect(ray(halves[0], 'timber ties', new THREE.Vector3(249.95, 20, -125))[0]?.point.y).toBeCloseTo(9.86, 5);
    expect(ray(halves[1], 'timber ties', new THREE.Vector3(.05, 20, -125))[0]?.point.y).toBeCloseTo(9.86, 5);
  });

  it('uses globally registered head and toe heights despite different neighbor terrain and paving', () => {
    const points: rail.RailPoint[] = [[240, 125, 10, 240, 0, 1, 9.4, 9.45, 10.03, 9.99], [260, 125, 10, 260, 0, 1, 9.4, 9.45, 10.03, 9.99]];
    const groups = [fresh(), fresh()];
    for (let i = 0; i < groups.length; i++) {
      plane(groups[i], 'terrain', 125, 125, 250, 250, i ? 8.7 : 9.3);
      plane(groups[i], 'Drive road | asphalt', i ? 5 : 245, 125, 10, 1.52, i ? 10.2 : 10);
      expect(apply(groups[i], packet(`${i}_0`, structuredClone(points))).rejected).toBe(false);
      const x = i ? .05 : 249.95;
      expect(ray(groups[i], 'running surface', new THREE.Vector3(x, 20, -125.75))[0]?.point.y).toBeCloseTo(10.03, 5);
      expect(ray(groups[i], 'running surface', new THREE.Vector3(x, 20, -124.25))[0]?.point.y).toBeCloseTo(9.99, 5);
      // At the outer toe both scenes use the same registered ground sample,
      // rather than their deliberately different local terrain height.
      expect(ray(groups[i], 'ballast', new THREE.Vector3(x, 20, -127.299))[0]?.point.y).toBeCloseTo(9.40646, 3);
    }
  });
});

describe('railway sidewalk and curb opening', () => {
  function fixture() {
    const group = fresh(), geometry = new THREE.BufferGeometry();
    const points = [[100, 10.125, -120], [112, 10.125, -120], [112, 10.125, -130], [100, 10.125, -130], [115, 10.125, -120], [125, 10.125, -120], [125, 10.125, -130], [115, 10.125, -130]];
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(points.flat(), 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(points.flatMap(p => [p[0] / 10, -p[2] / 10]), 2));
    geometry.setAttribute('color', new THREE.Uint8BufferAttribute(points.flatMap((_, i) => [20 + i, 40 + i, 60 + i]), 3, true));
    geometry.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]); geometry.addGroup(0, 6, 0); geometry.addGroup(6, 6, 1); geometry.computeVertexNormals();
    const walk = new THREE.MeshStandardMaterial(), asphalt = new THREE.MeshStandardMaterial(); walk.name = 'Streetscape | warm sidewalk concrete'; asphalt.name = 'Drive road | asphalt';
    const mesh = new THREE.Mesh(geometry, [walk, asphalt]); group.add(mesh);
    const curbGeometry = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([[105, 10, -120], [105, 10, -130], [105, 10.125, -130], [105, 10.125, -120]].flat(), 3));
    curbGeometry.setIndex([0, 1, 2, 0, 2, 3]); curbGeometry.computeVertexNormals();
    const curbMaterial = new THREE.MeshStandardMaterial(); curbMaterial.name = 'Streetscape | granite curb';
    const curb = new THREE.Mesh(curbGeometry, curbMaterial); group.add(curb);
    // The source geometry is shared with a separate upper walk. Its resource
    // and every elevated face must survive the lower crossing operation.
    const high = new THREE.Mesh(geometry, mesh.material); high.position.y = 8; group.add(high);
    return { group, mesh, curb, high };
  }
  function materialArea(mesh: THREE.Mesh, material: number) {
    const g = mesh.geometry, p = g.getAttribute('position'); let area = 0;
    for (const part of g.groups.length ? g.groups : [{ start: 0, count: g.index?.count ?? p.count, materialIndex: 0 }]) {
      if (part.materialIndex !== material) continue;
      for (let i = part.start; i < part.start + part.count; i += 3) {
        const [a, b, c] = [0, 1, 2].map(k => new THREE.Vector3().fromBufferAttribute(p, g.index?.getX(i + k) ?? i + k));
        area += b.sub(a).cross(c.sub(a)).length() / 2;
      }
    }
    return area;
  }
  it('cuts exactly a 3.2 m corridor through the walk and vertical curb while preserving grouped asphalt and shared source channels', () => {
    const { group, mesh, curb, high } = fixture(), saved = sourceSnapshot(mesh), upper = sourceSnapshot(high);
    const dispose = vi.spyOn(mesh.geometry, 'dispose'), materials = mesh.material;
    const result = openRailWalks(group, [0, 0, 0], packet());
    expect(result.meshes).toBe(2); expect(result.cutTriangles).toBe(4); expect(result.panels.length).toBeGreaterThan(0);
    expect(mesh.material).toBe(materials); unchanged(upper); expect(dispose).not.toHaveBeenCalled();
    for (const [name, before] of Object.entries(saved.attributes)) {
      const after = mesh.geometry.getAttribute(name);
      expect(after.normalized).toBe(before.attribute.normalized);
      expect(after.array.constructor).toBe(before.values.constructor);
      expect(after.array.slice(0, before.values.length)).toEqual(before.values);
      expect(after.array.every(Number.isFinite)).toBe(true);
    }
    const asphalt = mesh.geometry.groups.find(g => g.materialIndex === 1)!;
    expect(asphalt.count).toBe(6); expect(Array.from(mesh.geometry.index!.array.slice(asphalt.start, asphalt.start + asphalt.count))).toEqual([4, 5, 6, 4, 6, 7]);
    expect(materialArea(mesh, 0)).toBeCloseTo(120 - 12 * 3.2, 3); expect(materialArea(mesh, 1)).toBeCloseTo(100, 6);
    expect(materialArea(curb, 0)).toBeCloseTo((10 - 3.2) * .125, 5);
    for (const panel of result.panels) for (const [e, n, height] of panel) {
      expect(e).toBeGreaterThanOrEqual(100); expect(e).toBeLessThanOrEqual(112);
      expect(n).toBeGreaterThanOrEqual(123.4 - 1e-9); expect(n).toBeLessThanOrEqual(126.6 + 1e-9);
      expect(10.125 - height).toBeCloseTo(.13, 8);
    }
  });
  it('leaves bridge-level crossings and disjoint walk/curb geometry exact', () => {
    const { group, mesh, curb, high } = fixture(), saved = [mesh, curb, high].map(sourceSnapshot), p = packet(); p.rows[0].bridge = true;
    expect(openRailWalks(group, [0, 0, 0], p)).toEqual({ panels: [], meshes: 0, cutTriangles: 0 }); saved.forEach(unchanged);
    p.rows[0].bridge = false; p.rows[0].points.forEach(point => { point[1] += 20; });
    expect(openRailWalks(group, [0, 0, 0], p)).toEqual({ panels: [], meshes: 0, cutTriangles: 0 }); saved.forEach(unchanged);
  });
});

const testTile: TownTile = { id: 'rail-test', origin: [0, 0, 0], bounds: { min: [0, 0, -250], max: [250, 100, 0] }, lods: [{ level: 0, url: 'rail-test.glb', bytes: 20, sha256: 'a'.repeat(64) }] };
const manifest: WorldManifest = { version: 1, coordinates: { axes: 'Y_UP', conversion: '(x,z,-y)', sourceCRS: 'EPSG:6491', horizontalOrigin: [1, 2], sourceVerticalOffsetM: 100 }, tiles: [testTile], fallback: { url: 'fallback.glb', bytes: 1 }, trees: { prototypes: [] }, car: { url: 'car.glb', bytes: 1, forward: '-Z', wheelNodes: [] }, stats: {} };
const emptyReport = { status: 'applied' as const, rejected: false, segments: 1, ties: 2, bridges: 0, triangles: 10, geometryBytes: 120 };
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('rail corridor scene lifecycle', () => {
  it('runs after every surface repair and reports a rejected packet for retry', () => {
    const group = new THREE.Group(), packet = {} as rail.RailCorridorPacket;
    const report = { ...emptyReport, status: 'source-mismatch' as const, rejected: true };
    const apply = vi.spyOn(rail, 'applyRailCorridor').mockReturnValue(report);
    const steps = tileAssemblySteps(group, testTile, 0, { railCorridor: packet });
    expect(steps.at(-1)?.name).toBe('railCorridor');
    expect(steps.at(-2)?.name).toBe('eddyBlockRepair');
    steps.at(-1)!.apply();
    expect(apply).toHaveBeenCalledExactlyOnceWith(group, testTile.id, testTile.origin, 0, testTile.lods[0].sha256, packet);
    expect(group.userData.assemblyReports.railCorridor).toBe(report);
    expect(group.userData.optionalDetailMissing).toEqual(['railCorridor']);
  });

  it.each([false, true])('retains the total detail budget and disposes the rail stream on mobile=%s', mobile => {
    const world = new TownWorld(manifest, 'https://example.test/manifest.json', () => {});
    const stream = (world as unknown as { railCorridor: TileDetailStream<rail.RailCorridorPacket> }).railCorridor;
    const dispose = vi.spyOn(stream, 'dispose');
    try {
      world.setQuality('auto', mobile);
      const { retrySources, sourceImages, ...details } = world.streamingResources().caches;
      const scale = mobile ? .5 : 1, mib = 1024 * 1024;
      expect(details.railCorridor.budgetBytes).toBe(1.5 * mib * scale);
      expect(Object.values(details).reduce((sum, cache) => sum + cache.budgetBytes, 0)).toBeLessThanOrEqual(65 * mib * scale);
      stream.failures = 2;
      expect(world.finishResources().optionalFailures).toBe(2);
      expect(world.researchResources().optionalFailures).toBe(2);
    } finally { world.dispose(); }
    expect(dispose).toHaveBeenCalledOnce();
    expect(stream.resources().entries).toBe(0);
  });

  it.each(['success', 'abort', 'parse failure'] as const)('waits for the rail packet without delaying source decode, and handles %s', async outcome => {
    const world = new TownWorld(manifest, 'https://example.test/manifest.json', () => {});
    const stream = (world as unknown as { railCorridor: TileDetailStream<rail.RailCorridorPacket> }).railCorridor;
    const group = new THREE.Group(), mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()); group.add(mesh);
    const geometryDispose = vi.spyOn(mesh.geometry, 'dispose');
    const bytes = new ArrayBuffer(20), header = new DataView(bytes); header.setUint32(0, 0x46546c67, true); header.setUint32(4, 2, true); header.setUint32(8, 20, true);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(bytes)));
    const parsed = { scene: group, scenes: [group], animations: [], cameras: [], asset: {}, parser: { associations: new Map(), json: {} } };
    const parse = vi.spyOn(world.loader, 'parseAsync');
    if (outcome === 'parse failure') parse.mockRejectedValue(new Error('Source parse failed'));
    else parse.mockResolvedValue(parsed as unknown as Awaited<ReturnType<typeof world.loader.parseAsync>>);
    let finish!: (packet: rail.RailCorridorPacket) => void, railSignal: AbortSignal | undefined;
    vi.spyOn(stream, 'hasAsset').mockReturnValue(true);
    vi.spyOn(stream, 'tile').mockImplementation((_id, signal) => { railSignal = signal; return new Promise(resolve => { finish = resolve; }); });
    const apply = vi.spyOn(rail, 'applyRailCorridor').mockReturnValue(emptyReport), controller = new AbortController();
    let settled = false;
    const loaded = world.loadGlb(testTile.lods[0].url, controller.signal, testTile).finally(() => { settled = true; });
    const rejected = outcome === 'success' ? undefined : expect(loaded).rejects.toMatchObject(outcome === 'abort' ? { name: 'AbortError' } : { message: 'Source parse failed' });
    const packet = {} as rail.RailCorridorPacket;
    try {
      await vi.waitFor(() => expect(parse).toHaveBeenCalledOnce());
      if (outcome === 'success') {
        expect(settled).toBe(false); finish(packet);
        expect(await loaded).toBe(group);
        expect(apply).toHaveBeenCalledExactlyOnceWith(group, testTile.id, testTile.origin, 0, testTile.lods[0].sha256, packet);
        expect(group.userData.optionalDetailMissing).toEqual([]);
        expect(geometryDispose).not.toHaveBeenCalled(); world.releaseGroup(group);
      } else {
        if (outcome === 'abort') controller.abort();
        await rejected;
        expect(railSignal?.aborted).toBe(true); expect(apply).not.toHaveBeenCalled();
      }
    } finally {
      finish?.(packet); world.dispose();
      if (outcome === 'parse failure') { mesh.geometry.dispose(); (mesh.material as THREE.Material).dispose(); }
    }
    expect(geometryDispose).toHaveBeenCalledOnce();
  });
});
