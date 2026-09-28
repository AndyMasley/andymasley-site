// @vitest-environment node
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import context from '../../../../data/derived/town/street-context.json';
import { StreetDressing, idRuns } from '../street-dressing';
import { HouseDressing, type RoadLookup } from '../house-dressing';
import { Batch } from '../crafted-frontages';
import { TownSurfaces } from '../surfaces';
import type { GroundSurfaces } from '../contracts';
import type { NetworkData, RoadEdge } from '../engine';

const edge = (id: number, physical: number, points: number[][], name: string, direction = 1): RoadEdge =>
  ({ id, physical_id: physical, from: id * 2, to: id * 2 + 1, points, name, width_m: 8, lane_offset_m: 2, direction, road_type: 5 });
/** One street per physical id, both directions stored. */
const streets = (list: { id: number; points: number[][]; name?: string }[]): NetworkData =>
  ({ edges: list.flatMap(({ id, points, name = '' }, k) => [edge(k * 2, id, points, name), edge(k * 2 + 1, id, [...points].reverse(), name, -1)]) });

const cleared = idRuns(context.centreCleared), free = idRuns(context.poleFree), positive = idRuns(context.polesPositive), negative = idRuns(context.polesNegative);
const plain = Array.from({ length: 5000 }, (_, i) => i).find(i => !cleared.has(i) && !free.has(i) && !positive.has(i) && !negative.has(i))!;

describe('streets as photographed', () => {
  it('clears yellow centre paint only from streets photographed without it', () => {
    const id = [...cleared][0];
    // A cleared street along north = 0 and an ordinary one along north = 60, both unnamed (no poles or signs).
    const dressing = new StreetDressing(streets([{ id, points: [[-120, 0, 10], [120, 0, 10]] }, { id: plain, points: [[-120, 60, 10], [120, 60, 10]] }]), context);
    // Tiles stand at their origin in the world, their geometry local to it (x = east - ox, z = -north - oz), inside a 'roads' node.
    const origin = [125, 10, -125];
    const stripe = (n: number) => { const p: number[] = []; for (let e = 10; e < 110; e += 10) for (const [x, m] of [[e, n - .06], [e + 10, n - .06], [e + 10, n + .06], [e, n - .06], [e + 10, n + .06], [e, n + .06]]) p.push(x - origin[0], .02, -m - origin[2]); return p; };
    const tile = () => { const group = new THREE.Group(), roads = new THREE.Group(); roads.name = 'roads'; group.add(roads); group.position.fromArray(origin); return { group, roads }; };
    const mesh = (parent: THREE.Object3D, positions: number[], name: string) => {
      const m = new THREE.MeshStandardMaterial(); m.name = name;
      const mesh = new THREE.Mesh(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)), m);
      parent.add(mesh); return mesh;
    };
    const { group, roads } = tile();
    const yellow = mesh(roads, [...stripe(0), ...stripe(60)], 'Drive road | warm yellow paint');
    const edgeLine = mesh(roads, stripe(0.5), 'Drive road | white edge paint');
    dressing.apply(group, '0_0', origin, 0, []);
    const kept = yellow.geometry.index!;
    expect(kept.count).toBe(stripe(60).length / 3);
    const position = yellow.geometry.getAttribute('position');
    for (let i = 0; i < kept.count; i++) expect(-(position.getZ(kept.getX(i)) + origin[2])).toBeCloseTo(60, 0);
    expect(yellow.visible).toBe(true);
    expect(edgeLine.geometry.index).toBeNull();
    // A tile holding only the cleared street's paint hides the emptied mesh.
    const only = tile(), finished = mesh(only.group, stripe(0), 'Finished road | solid yellow centerline');
    dressing.apply(only.group, '0_0', origin, 0, []);
    expect(finished.visible).toBe(false);
    dressing.dispose();
  });

  it('stands poles on the photographed side, and none along streets photographed without them', () => {
    const poles = (id: number) => {
      const dressing = new StreetDressing(streets([{ id, points: [[-200, 0, 10], [200, 0, 10]], name: 'SCHOOL STREET' }]), context);
      const list = (dressing as unknown as { poles: { x: number; n: number }[] }).poles.map(p => p.n);
      dressing.dispose(); return list;
    };
    const north = [...positive].find(k => !free.has(k))!, south = [...negative].find(k => !free.has(k))!;
    expect(poles(north).length).toBeGreaterThan(4);
    for (const n of poles(north)) expect(n).toBeCloseTo(4.75, 3);
    for (const n of poles(south)) expect(n).toBeCloseTo(-4.75, 3);
    expect(poles([...free][0])).toHaveLength(0);
    expect(idRuns('13-15,20')).toEqual(new Set([13, 14, 15, 20]));
    expect(poles(plain).length).toBeGreaterThan(4);
  });
});

describe('yards as photographed', () => {
  /** A street along north = 0 (8 m wide) with 10 m square houses set back 20 m, centred on `houses`. */
  function street(houses: number[], paved: number[][] = []) {
    const roads: RoadLookup = { nearestRoad: (x, n, max = 40) => Math.abs(n) > max ? null : { x, n: 0, z: 10, tx: 1, tn: 0, width: 8, type: 5, distance: Math.abs(n) } };
    const group = new THREE.Group();
    const terrain = new THREE.Mesh(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([-200, 10, 20, 200, 10, 20, 200, 10, -60, -200, 10, 20, 200, 10, -60, -200, 10, -60], 3)));
    terrain.name = 'terrain'; group.add(terrain);
    const walls: number[] = [], normals: number[] = [];
    for (const hx of houses) {
      const ring = [[hx - 5, 20], [hx + 5, 20], [hx + 5, 30], [hx - 5, 30]];
      for (let i = 0; i < 4; i++) {
        const [ae, an] = ring[i], [be, bn] = ring[(i + 1) % 4];
        const le = be - ae, ln = bn - an, l = Math.hypot(le, ln), ox = ln / l, oz = le / l;
        const a0 = [ae, 10, -an], b0 = [be, 10, -bn], b1 = [be, 10.6, -bn], a1 = [ae, 10.6, -an];
        for (const v of [a0, b0, b1, a0, b1, a1]) { walls.push(...v); normals.push(ox, 0, oz); }
      }
    }
    const foundation = new THREE.BufferGeometry();
    foundation.setAttribute('position', new THREE.Float32BufferAttribute(walls, 3));
    foundation.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    const material = new THREE.MeshStandardMaterial(); material.name = 'V2 inferred | foundation';
    group.add(new THREE.Mesh(foundation, material));
    // Land cover at 1 m: lawn, with pavement from the curb to the house front over `paved` east ranges.
    const width = 400, height = 80, data = new Uint8Array(width * height * 4);
    for (let i = 0; i < width * height; i++) data[i * 4] = 255;
    for (const [e0, e1] of paved) for (let n = 5; n <= 20; n++) for (let e = e0; e < e1; e++) { const i = (Math.floor(60 - n) * width + (e + 200)) * 4; data[i] = 0; data[i + 2] = 255; }
    group.userData.coverMask = { data, width, height, bounds: [-200, -60, 200, 20], core: [-200, -60, 200, 20] };
    return { group, dressing: new HouseDressing(roads) };
  }
  const houses = [-150, -90, -30, 30, 90, 150];
  const materials = (group: THREE.Group) => {
    const names = new Map<string, number>();
    group.traverse(o => { if (o instanceof THREE.Mesh) for (const m of [o.material].flat()) names.set(m.name, (names.get(m.name) ?? 0) + (o.geometry.getAttribute('position')?.count ?? 0)); });
    return names;
  };

  it('puts a curbside mailbox only where the photograph shows one', () => {
    const { group, dressing } = street(houses);
    group.userData.houseObservations = houses.map((hx, i) => ({ e: hx, n: 25, b: 10, mb: i < 2 ? 'curb' : i < 4 ? 'house' : 'none' }));
    expect(dressing.apply(group, [0, 0, 0], 0).mailboxes).toBe(2);
    dressing.dispose();
  });

  it('plants the foundation beds as full as the photograph shows', () => {
    const shrubs = (sh?: string) => {
      const { group, dressing } = street(houses);
      if (sh) group.userData.houseObservations = houses.map(hx => ({ e: hx, n: 25, b: 10, sh }));
      const count = dressing.apply(group, [0, 0, 0], 0).shrubs; dressing.dispose(); return count;
    };
    expect(shrubs('none')).toBe(0);
    expect(shrubs('some')).toBeGreaterThan(0);
    expect(shrubs('many')).toBeGreaterThan(shrubs('some'));
    expect(shrubs('many')).toBeGreaterThanOrEqual(shrubs());
  });

  it('plants only the exterior faces of measured foundation bands, joined to their exact photo ID', () => {
    const origin = [1000, 60, -2000], group = new THREE.Group(), batch = new Batch(new THREE.Vector3().fromArray(origin), 0);
    group.position.fromArray(origin);
    const ring = [[1000, 2020], [1010, 2020], [1010, 2030], [1000, 2030]];
    const walls = ring.map((start, i) => {
      const end = ring[(i + 1) % ring.length], dx = end[0] - start[0], dn = end[1] - start[1], width = Math.hypot(dx, dn);
      return { start, tangent: [dx / width, dn / width], outward: [dn / width, -dx / width], width };
    });
    walls.forEach(w => batch.box({ ...w, structId: 'known', tileId: 't' }, 'foundation', w.width / 2, 70.3, .022, w.width, .6, .08));
    group.add(batch.finish().group);
    const terrain = new THREE.Mesh(new THREE.PlaneGeometry(100,100).rotateX(-Math.PI / 2).translate(0,10,-25)); terrain.name = 'terrain'; group.add(terrain);
    group.userData.houseFootprints = [{ id: 'known', outline: ring, walls }];
    // The old nearest-centre join would use this other house's contradictory photo.
    group.userData.houseObservations = [{ id: 'known', e: 1040, n: 2025, sh: 'many', mb: 'none' }, { id: 'neighbor', e: 1005, n: 2025, sh: 'none', mb: 'curb' }];
    const roads: RoadLookup = { nearestRoad: (x, n) => ({ x, n: 2000, z: 70, tx: 1, tn: 0, width: 8, type: 5, distance: n - 2000 }) };
    const dressing = new HouseDressing(roads), report = dressing.apply(group, origin, 0);
    expect(report.buildings).toBe(1); expect(report.frontWalls).toBe(1); expect(report.mailboxes).toBe(0); expect(report.shrubs).toBeGreaterThan(0);
    const shrubs = group.getObjectByName('House dressing | foundation shrubs') as THREE.InstancedMesh, matrix = new THREE.Matrix4();
    for (let i = 0; i < shrubs.count; i++) { shrubs.getMatrixAt(i, matrix); expect(-matrix.elements[14] - origin[2]).toBeLessThan(2020); }
    dressing.dispose();
  });

  it('keeps front walks out of source houses without exposed foundation meshes', () => {
    const { group, dressing } = street(houses);
    group.userData.openings = { doors: houses.map(hx => [hx, 11.1, -20]), garageDoors: [] };
    group.userData.houseObservations = houses.map(hx => ({ e: hx, n: 25, sh: 'none', mb: 'none' }));
    group.userData.houseFootprints = houses.slice(0, 3).map((hx, i) => ({ id: `obstacle-${i}`, outline: [[hx - 4, 10], [hx + 4, 10], [hx + 4, 18], [hx - 4, 18]], walls: [] }));
    const report = dressing.apply(group, [0, 0, 0], 0);
    expect(report.walks).toBeGreaterThan(0);
    const walk = group.getObjectByName('House dressing | front walks') as THREE.Mesh, p = walk.geometry.getAttribute('position');
    for (let i = 0; i < p.count; i++) expect(p.getX(i)).toBeGreaterThan(20);
    dressing.dispose();
  });

  it('keeps downhill front walks on actual terrain and omits unsupported walks without partial slabs', () => {
    for (const supported of [true, false]) {
      const { group, dressing } = street(houses), terrain = group.getObjectByName('terrain') as THREE.Mesh;
      if (supported) { const p = terrain.geometry.getAttribute('position'); for (let i=0;i<p.count;i++) p.setY(i,10-(p.getZ(i)+20)*.4); }
      else group.remove(terrain);
      group.userData.openings = { doors: houses.map(hx => [hx,11.1,-20]), garageDoors: [] };
      const report = dressing.apply(group,[0,0,0],0), walk = group.getObjectByName('House dressing | front walks') as THREE.Mesh | undefined;
      if (supported) {
        expect(report.walks).toBeGreaterThan(0); const p=walk!.geometry.getAttribute('position');
        let low=Infinity; for(let i=0;i<p.count;i++){expect(p.getY(i)).toBeCloseTo(10-(p.getZ(i)+20)*.4+.05,4);low=Math.min(low,p.getY(i));} expect(low).toBeLessThan(7);
      } else { expect(report.walks).toBe(0); expect(walk).toBeUndefined(); }
      dressing.dispose();
    }
  });

  it('removes live grass from house aprons added after the cover mask was registered', async () => {
    const { group, dressing } = street([-30]);
    const mask = group.userData.coverMask, source = mask.data.slice();
    const definition: GroundSurfaces = { grass: { color: { url: 'g', bytes: 1 }, normal: { url: 'n', bytes: 1 }, roughness: { url: 'r', bytes: 1 }, repeatM: 1 }, masks: { t: { url: 'mask', bytes: 1, bounds: mask.bounds } } };
    const surfaces = new TownSurfaces(definition, async () => { const texture = new THREE.DataTexture(mask.data.slice(), mask.width, mask.height); texture.flipY = false; return texture; });
    await surfaces.apply(group, 't', new AbortController().signal);
    const countInDrive = () => {
      const mesh = group.getObjectByName('Town grass | t') as THREE.InstancedMesh, matrix = new THREE.Matrix4(); let count = 0;
      for (let i = 0; i < (mesh?.count ?? 0); i++) { mesh.getMatrixAt(i, matrix); const x = matrix.elements[12], n = -matrix.elements[14]; if (Math.abs(x + 28) < 1 && n > 7 && n < 17) count++; }
      return count;
    };
    surfaces.update([-28, 10, -12], false, 0); expect(countInDrive()).toBeGreaterThan(0);
    group.userData.openings = { doors: [], garageDoors: [[-28, 11, -19.7, 0, 1, 2.4]] };
    group.userData.houseObservations = [{ e: -30, n: 25, sh: 'none', mb: 'none', dw: 'asphalt' }];
    expect(dressing.apply(group, [0, 0, 0], 0).aprons).toBe(1);
    expect(group.userData.hardscapeGrassExclusions.pendingTriangles).toBeGreaterThan(0);
    surfaces.refreshGrassExclusions(group); surfaces.update([-28, 10, -12], false, 0);
    expect(countInDrive()).toBe(0); expect(group.userData.coverMask.data).toEqual(source);
    expect((group.getObjectByName('Town grass | t') as THREE.InstancedMesh).count).toBeGreaterThan(0);
    expect(group.userData.hardscapeGrassExclusions.pendingTriangles).toBe(0);
    surfaces.update([-28, 10, -12], true, 0); surfaces.update([-28, 10, -12], false, 0); expect(countInDrive()).toBe(0);
    surfaces.dispose(); dressing.dispose();
  });

  it('paves a drive in front of garage doors the land cover leaves on lawn, in the photographed surface', () => {
    // Garage doors in the front wall (north 20, facing the street to the south) of the first four houses; the fourth already has its drive.
    const { group, dressing } = street(houses, [[25, 35]]);
    group.userData.openings = { doors: [], garageDoors: houses.slice(0, 4).map(hx => [hx + 2, 11, -19.7, 0, 1, 2.4]) };
    group.userData.houseObservations = houses.map((hx, i) => ({ e: hx, n: 25, b: 10, dw: i === 1 ? 'gravel' : i === 2 ? 'none' : 'asphalt' }));
    const report = dressing.apply(group, [0, 0, 0], 0);
    expect(report.aprons).toBe(2);
    const asphalt = group.getObjectByName('House dressing | asphalt drive aprons') as THREE.Mesh, gravel = group.getObjectByName('House dressing | gravel drive aprons') as THREE.Mesh;
    expect((asphalt.material as THREE.Material).name).toBe('House dressing | asphalt drive');
    expect((gravel.material as THREE.Material).name).toBe('House dressing | gravel drive');
    for (const mesh of [asphalt, gravel]) {
      const p = mesh.geometry.getAttribute('position');
      for (let i = 0; i < p.count; i++) {
        const n = -p.getZ(i); expect(n).toBeLessThanOrEqual(20.01); expect(n).toBeGreaterThan(4.9); // from the wall to the street edge
        expect(p.getY(i)).toBeCloseTo(10.04, 3);
      }
      const a = new THREE.Vector3().fromBufferAttribute(p, 0), b = new THREE.Vector3().fromBufferAttribute(p, 1), c = new THREE.Vector3().fromBufferAttribute(p, 2);
      expect(new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).y).toBeGreaterThan(0);
    }
    dressing.dispose();
  });

  it('builds photographed fences and walls along the frontage, painted as seen', () => {
    const { group, dressing } = street(houses);
    const run = (hx: number): number[][] => [[hx - 5, 6.2, hx - 1, 6.2], [hx + 1, 6.2, hx + 5, 6.2]];
    const kinds = [['picket', '#f4f4f0'], ['privacy', '#7a7268'], ['rail', undefined], ['chain', undefined], ['retaining', undefined], ['hedge', undefined]] as const;
    group.userData.houseObservations = houses.map((hx, i) => ({ e: hx, n: 25, b: 10, fe: kinds[i][0], fc: kinds[i][1], fl: run(hx) }));
    const report = dressing.apply(group, [0, 0, 0], 0);
    expect(report.fenceM).toBeCloseTo(houses.length * 8, 3);
    const names = materials(group);
    expect(names.has('House dressing | painted picket #f4f4f0')).toBe(true);
    expect(names.has('House dressing | board fence #7a7268')).toBe(true);
    for (const name of ['House dressing | weathered split rail', 'House dressing | chain-link mesh', 'House dressing | galvanised fence post', 'Crafted frontage | stone | #9a968d'])
      expect(names.has(name), name).toBe(true);
    // The hedge grows as clipped shrubs along its run, a shrub every half metre, on the yard side of the line.
    const shrubs = group.getObjectByName('House dressing | foundation shrubs') as THREE.InstancedMesh, m = new THREE.Matrix4(), at = new THREE.Vector3();
    const hedge: number[] = [];
    for (let i = 0; i < shrubs.count; i++) { shrubs.getMatrixAt(i, m); at.setFromMatrixPosition(m); if (-at.z > 4 && -at.z < 8) hedge.push(-at.z); }
    expect(hedge.length).toBeGreaterThanOrEqual(14);
    for (const n of hedge) { expect(n).toBeGreaterThan(6.2); expect(n).toBeLessThan(7); }
    // Everything stands on the frontage line, never out in the street or up against the house.
    group.traverse(o => { if (o instanceof THREE.Mesh && /picket|board fence|split rail|chain-link|hedge|stone/.test([o.material].flat()[0].name)) {
      const p = o.geometry.getAttribute('position');
      for (let i = 0; i < p.count; i++) { const n = -p.getZ(i); expect(n).toBeGreaterThan(4); expect(n).toBeLessThan(8); }
    } });
    dressing.dispose();
  });
});
