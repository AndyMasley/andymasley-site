// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { HouseDressing, type RoadLookup } from '../house-dressing';
import { Batch } from '../crafted-frontages';

const origin = [1000, 60, -2000];
function yard(surface: string | undefined = 'gravel', neighbor = 'none', hedge = false) {
  const group = new THREE.Group(), batch = new Batch(new THREE.Vector3().fromArray(origin), 0);
  group.position.fromArray(origin);
  const ring = [[1000, 2020], [1020, 2020], [1020, 2030], [1000, 2030]];
  const walls = ring.map((start, i) => {
    const end = ring[(i + 1) % ring.length], dx = end[0] - start[0], dn = end[1] - start[1], width = Math.hypot(dx, dn);
    return { start, tangent: [dx / width, dn / width], outward: [dn / width, -dx / width], width };
  });
  walls.forEach(w => batch.box({ ...w, structId: 'known', tileId: 't' }, 'foundation', w.width / 2, 70.3, .022, w.width, .6, .08));
  group.add(batch.finish().group);
  group.userData.houseFootprints = [{ id: 'known', outline: ring, walls }];
  group.userData.houseObservations = [
    ...(surface === undefined ? [] : [{ id: 'known', e: 1045, n: 2025, b: 70, sh: 'many', mb: 'none', dw: surface, ...(hedge ? { fe: 'hedge', fl: [[1000, 2019.5, 1020, 2019.5]] } : {}) }]),
    { id: 'neighbor', e: 1010, n: 2021, b: 70, sh: 'none', mb: 'none', dw: neighbor },
  ];
  group.userData.openings = { doors: [[2, 11.1, -20]], garageDoors: [[10, 11.2, -20, 0, 1, 6]] };
  const terrain = new THREE.Mesh(new THREE.PlaneGeometry(100, 100).rotateX(-Math.PI / 2).translate(30, 10, -30));
  terrain.name = 'terrain'; group.add(terrain);
  const width = 100, height = 100, data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) data[i * 4] = 255;
  group.userData.coverMask = { data, width, height, bounds: [980, -2080, 1080, -1980], core: [980, -2080, 1080, -1980] };
  const roads: RoadLookup = { nearestRoad: (x, n) => ({ x, n: 2000, z: 70, tx: 1, tn: 0, width: 8, type: 5, distance: Math.abs(n - 2000) }) };
  return { group, dressing: new HouseDressing(roads) };
}
function meshes(group: THREE.Group, material: string): THREE.Mesh[] {
  const result: THREE.Mesh[] = [];
  group.traverse(o => { if (o instanceof THREE.Mesh && [o.material].flat().some(m => m.name === material)) result.push(o); });
  return result;
}
function garageCrownConflicts(group: THREE.Group): number {
  const shrub = group.getObjectByName('House dressing | foundation shrubs') as THREE.InstancedMesh;
  const matrix = new THREE.Matrix4(); let conflicts = 0;
  for (let i = 0; i < (shrub?.count ?? 0); i++) {
    shrub.getMatrixAt(i, matrix);
    const radius = Math.max(Math.hypot(matrix.elements[0], matrix.elements[2]), Math.hypot(matrix.elements[8], matrix.elements[10])) * 1.12;
    const across = matrix.elements[12] - 10, out = matrix.elements[14] + 20;
    if (Math.abs(across) < 3.15 + radius && out > -.3 - radius && out < 1.6 + radius) conflicts++;
  }
  return conflicts;
}

describe('source-owned yards and actual opening clearance', () => {
  it.each([
    ['gravel', 'none', 'gravel'], ['none', 'asphalt', null], [undefined, 'none', 'asphalt'],
  ])('resolves owner %s before nearer neighbor %s', (surface, neighbor, expected) => {
    const { group, dressing } = yard(surface as string | undefined, neighbor as string);
    // Passing undefined should omit the known photo, not invoke the fixture default.
    if (surface === undefined) group.userData.houseObservations = group.userData.houseObservations.filter((o: { id: string }) => o.id !== 'known');
    const report = dressing.apply(group, origin, 0);
    expect(report.aprons).toBe(expected ? 1 : 0);
    if (expected) expect(meshes(group, `House dressing | ${expected} drive`)).toHaveLength(1);
    dressing.dispose();
  });

  it.each([0, 1])('clears whole shrub crowns from the wide garage at LOD %s', level => {
    const { group, dressing } = yard();
    expect(dressing.apply(group, origin, level).shrubs).toBeGreaterThan(0);
    expect(garageCrownConflicts(group)).toBe(0);
    dressing.dispose();
  });

  it('clears photographed hedge crowns from the actual garage approach', () => {
    const { group, dressing } = yard('gravel', 'none', true);
    const report = dressing.apply(group, origin, 0);
    expect(report.fenceM).toBeGreaterThan(0); expect(report.shrubs).toBeGreaterThan(0);
    expect(garageCrownConflicts(group)).toBe(0);
    dressing.dispose();
  });

  it('splits mulch around the full garage and pedestrian entry, preserving planted beds', () => {
    const { group, dressing } = yard();
    const report = dressing.apply(group, origin, 0); group.updateMatrixWorld(true);
    const mulch = meshes(group, 'House dressing | bark mulch bed');
    const hit = (x: number) => new THREE.Raycaster(new THREE.Vector3(x + origin[0], 85, -19.3 + origin[2]), new THREE.Vector3(0, -1, 0)).intersectObjects(mulch).length > 0;
    expect(report.beds).toBeGreaterThan(0);
    for (const x of [1, 2, 3, 7, 8, 9, 10, 11, 12, 13]) expect(hit(x)).toBe(false);
    expect([15, 16, 17, 18, 19].some(hit)).toBe(true);
    expect(group.userData.hardscapeGrassExclusions.pendingTriangles).toBeGreaterThan(0);
    dressing.dispose();
  });

  it('retains observed pavers as jointed paving with metre-scaled UVs and grass exclusions', () => {
    const { group, dressing } = yard('pavers');
    expect(dressing.apply(group, origin, 0).aprons).toBe(1);
    const [pavers] = meshes(group, 'House dressing | paver drive');
    expect(pavers).toBeDefined();
    const uv = pavers.geometry.getAttribute('uv'), p = pavers.geometry.getAttribute('position');
    expect(uv.count).toBe(p.count);
    for (let i = 0; i < uv.count; i++) expect(Number.isFinite(uv.getX(i)) && Number.isFinite(uv.getY(i))).toBe(true);
    expect(Math.abs(uv.getX(1) - uv.getX(0)) * .4).toBeCloseTo(6.6, 4);
    const material = pavers.material as THREE.MeshStandardMaterial, map = material.map as THREE.DataTexture;
    const pixels = map.image.data;
    expect(new Set(pixels).size).toBeGreaterThan(10);
    expect(material.bumpMap).toBe(map);
    expect(group.userData.hardscapeGrassExclusions.pendingTriangles).toBeGreaterThan(p.count / 3);
    const dispose = vi.fn(); map.addEventListener('dispose', dispose);
    dressing.dispose(); expect(dispose).toHaveBeenCalledTimes(1);
  });

  it.each([0, 1])('draws open chain-link attached to both terrain endpoints at LOD %s', level => {
    const { group, dressing } = yard('none');
    group.remove(group.getObjectByName('terrain')!);
    const terrain = new THREE.Mesh(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([-20, 9, 20, 80, 14, 20, 80, 14, -80, -20, 9, 20, 80, 14, -80, -20, 9, -80], 3)));
    terrain.name = 'terrain'; group.add(terrain);
    group.userData.houseObservations[0].fe = 'chain';
    group.userData.houseObservations[0].fl = [[1001, 2010, 1007, 2010]];
    dressing.apply(group, origin, level);
    const [fence] = meshes(group, 'House dressing | chain-link mesh');
    expect(fence).toBeDefined();
    const p = fence.geometry.getAttribute('position'), uv = fence.geometry.getAttribute('uv');
    expect(p.count).toBe(12); // Two flat panels, not two closed boxes.
    for (let i = 0; i < p.count; i++) {
      const base = 10 + .05 * p.getX(i), offset = p.getY(i) - base;
      expect(Math.min(Math.abs(offset - .01), Math.abs(offset - 1.19))).toBeLessThan(.00001);
      expect(Number.isFinite(uv.getX(i)) && Number.isFinite(uv.getY(i))).toBe(true);
    }
    const m = fence.material as THREE.MeshStandardMaterial, map = m.alphaMap as THREE.DataTexture;
    const pixels = map.image.data;
    const green = Array.from({ length: pixels.length / 4 }, (_, i) => pixels[i * 4 + 1]);
    expect(green.filter(value => value === 0).length / green.length).toBeGreaterThan(.8);
    expect(green.filter(value => value === 255).length).toBeGreaterThan(0);
    const sample = (x: number, y: number) => pixels[(y * 128 + x) * 4 + 1];
    expect(sample(32, 32)).toBe(255); expect(sample(64, 0)).toBe(0);
    expect(m.opacity).toBe(1); expect(m.side).toBe(THREE.DoubleSide);
    const dispose = vi.fn(); map.addEventListener('dispose', dispose);
    dressing.dispose(); expect(dispose).toHaveBeenCalledTimes(1);
  });
});
