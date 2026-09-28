// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { HouseDressing, onPavedCover, type RoadLookup } from '../house-dressing';
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

function paveExistingCover(group: THREE.Group, lawn?: (east: number, north: number) => boolean): void {
  const mask = group.userData.coverMask;
  for (let y = 0; y < mask.height; y++) for (let x = 0; x < mask.width; x++) {
    const e = mask.bounds[0] + (x + .5) / mask.width * (mask.bounds[2] - mask.bounds[0]);
    const n = -(mask.bounds[1] + (y + .5) / mask.height * (mask.bounds[3] - mask.bounds[1]));
    const index = (y * mask.width + x) * 4, grass = lawn?.(e, n) ?? false;
    mask.data[index] = grass ? 255 : 0; mask.data[index + 2] = grass ? 0 : 255;
  }
}
function apronVertices(group: THREE.Group, kind = 'pavers'): THREE.Vector3[] {
  const object = group.getObjectByName(`House dressing | ${kind} drive aprons`) as THREE.Mesh | undefined;
  if (!object) return [];
  const positions = object.geometry.getAttribute('position');
  return Array.from({ length: positions.count }, (_, i) => new THREE.Vector3().fromBufferAttribute(positions, i));
}

describe('photographed material on existing generic pavement', () => {
  it.each(['pavers', 'concrete', 'gravel'])('restores owner-observed %s without changing the cover facts', surface => {
    const { group, dressing } = yard(surface); paveExistingCover(group);
    const original = group.userData.coverMask.data.slice();
    expect(dressing.apply(group, origin, 0).aprons).toBe(1);
    const vertices = apronVertices(group, surface); expect(vertices.length).toBeGreaterThan(0);
    for (const p of vertices) { expect(p.z).toBeGreaterThanOrEqual(-20); expect(p.z).toBeLessThanOrEqual(-12.3 + .0001); expect(Math.abs(p.x - 10)).toBeLessThanOrEqual(3.3001); }
    expect(group.userData.coverMask.data).toEqual(original);
    dressing.dispose();
  });

  it.each(['asphalt', 'none', undefined])('preserves existing paving policy for %s', surface => {
    const { group, dressing } = yard(surface); paveExistingCover(group);
    if (surface === undefined) group.userData.houseObservations = group.userData.houseObservations.filter((o: { id: string }) => o.id !== 'known');
    expect(dressing.apply(group, origin, 0).aprons).toBe(0);
    dressing.dispose();
  });

  it('does not borrow a neighboring material for an unowned garage over pavement', () => {
    const { group, dressing } = yard('pavers', 'gravel'); paveExistingCover(group);
    group.userData.houseFootprints = [];
    expect(dressing.apply(group, origin, 0).aprons).toBe(0);
    dressing.dispose();
  });

  it('clips both sides at neighboring footprints and an angled sidewalk, not only the centerline', () => {
    const { group, dressing } = yard('pavers'); paveExistingCover(group);
    group.userData.houseFootprints.push({ id: 'neighbor-shed', outline: [[1006, 2012], [1008.5, 2012], [1008.5, 2018], [1006, 2018]], walls: [] });
    const material = new THREE.MeshStandardMaterial(); material.name = 'Streetscape | warm sidewalk concrete';
    const sidewalk = new THREE.Mesh(new THREE.PlaneGeometry(15, 1.2).rotateX(-Math.PI / 2).rotateY(.3).translate(10, 10.06, -15), material); group.add(sidewalk);
    dressing.apply(group, origin, 0);
    const vertices = apronVertices(group); expect(vertices.length).toBeGreaterThan(0);
    for (const p of vertices) {
      expect(p.x < 8.5 && p.x > 6 && p.z > -18 && p.z < -12).toBe(false);
      const sx = p.x - 10, sz = p.z + 15;
      expect(Math.abs(Math.sin(.3) * sx + Math.cos(.3) * sz)).toBeGreaterThanOrEqual(.6 - .00001);
    }
    // No material may continue past the full-width sidewalk as an isolated patch.
    expect(Math.max(...vertices.map(p => p.z))).toBeLessThan(-14.5);
    dressing.dispose();
  });

  it('does not jump across a lawn gap to another paved island', () => {
    const { group, dressing } = yard('pavers');
    paveExistingCover(group, (_east, north) => north >= 2016 && north <= 2018);
    dressing.apply(group, origin, 0);
    const vertices = apronVertices(group); expect(vertices.length).toBeGreaterThan(0);
    expect(Math.max(...vertices.map(p => p.z))).toBeLessThanOrEqual(-18);
    dressing.dispose();
  });

  it('starts on the first verified pixel at the roof edge without painting the unresolved strip', () => {
    const { group, dressing } = yard('pavers');
    const mask = group.userData.coverMask;
    mask.bounds[1] += .6; mask.bounds[3] += .6;
    paveExistingCover(group, (_east, north) => north > 2019.6);
    expect(dressing.apply(group, origin, 0).aprons).toBe(1);
    const vertices = apronVertices(group); expect(vertices.length).toBeGreaterThan(0);
    for (const p of vertices) {
      const px = Math.floor((p.x + origin[0] - mask.bounds[0]) / (mask.bounds[2] - mask.bounds[0]) * mask.width);
      const py = Math.floor((p.z + origin[2] - mask.bounds[1]) / (mask.bounds[3] - mask.bounds[1]) * mask.height);
      expect(mask.data[(py * mask.width + px) * 4 + 2]).toBe(255);
    }
    expect(Math.min(...vertices.map(p => p.z))).toBeGreaterThan(-20);
    dressing.dispose();
  });

  it('leaves disconnected pavement unpainted when it never reaches the garage threshold', () => {
    const { group, dressing } = yard('pavers');
    paveExistingCover(group, (_east, north) => north > 2019);
    expect(dressing.apply(group, origin, 0).aprons).toBe(0);
    dressing.dispose();
  });
});

describe('exact source cover clipping', () => {
  const cover = () => ({ data: new Uint8Array([0,0,255,0, 0,0,255,0, 0,0,255,0, 255,0,0,0]), width: 2, height: 2, bounds: [0,0,2,2], core: [0,0,2,2] });

  it('rejects a diagonal lawn-pixel sliver missed by corners, edge midpoints and center', () => {
    const mask = cover(), corners = [[.99,1.02],[1.2,.8],[1.16,.76],[.95,.98]];
    const samples = [...corners, ...corners.map((p,i) => [(p[0]+corners[(i+1)%4][0])/2,(p[1]+corners[(i+1)%4][1])/2]), [1.075,.89]];
    for (const [x,z] of samples) expect(mask.data[(Math.floor(z)*2+Math.floor(x))*4+2]).toBe(255);
    expect(onPavedCover(mask, corners)).toBe(false);
    // Coordinates are world metres; translating the tile cannot alter classification.
    mask.bounds = [1000,-2000,1002,-1998];
    expect(onPavedCover(mask, corners.map(([x,z]) => [x+1000,z-2000]))).toBe(false);
  });

  it('retains zero-area boundary contact but rejects positive-area overlap', () => {
    const mask = cover();
    expect(onPavedCover(mask, [[0,0],[1,0],[1,1],[0,1]])).toBe(true);
    expect(onPavedCover(mask, [[.9,.9],[1.01,.9],[1.01,1.01],[.9,1.01]])).toBe(false);
  });

  it('rejects cells extending beyond the known raster instead of inventing coverage', () => {
    const mask = cover();
    expect(onPavedCover(mask, [[-.01,0],[.5,0],[.5,.5],[-.01,.5]])).toBe(false);
    expect(onPavedCover(mask, [[0,0],[.5,0],[.5,.5],[0,.5]])).toBe(true);
  });
});
