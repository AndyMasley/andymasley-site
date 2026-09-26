// @vitest-environment node
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import context from '../../../../data/derived/town/street-context.json';
import { StreetDressing, idRuns } from '../street-dressing';
import { HouseDressing, type RoadLookup } from '../house-dressing';
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
    for (const name of ['House dressing | weathered split rail', 'House dressing | chain-link mesh', 'House dressing | galvanised fence post', 'House dressing | clipped hedge', 'Crafted frontage | stone | #9a968d'])
      expect(names.has(name), name).toBe(true);
    // Everything stands on the frontage line, never out in the street or up against the house.
    group.traverse(o => { if (o instanceof THREE.Mesh && /picket|board fence|split rail|chain-link|hedge|stone/.test([o.material].flat()[0].name)) {
      const p = o.geometry.getAttribute('position');
      for (let i = 0; i < p.count; i++) { const n = -p.getZ(i); expect(n).toBeGreaterThan(4); expect(n).toBeLessThan(8); }
    } });
    dressing.dispose();
  });
});
