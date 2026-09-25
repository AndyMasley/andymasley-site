// @vitest-environment node
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import library from '../../../../data/derived/town/material-library.json';
import { RoadWear, ROAD_LANE_ATTRIBUTE, ROAD_WEAR_GLSL, WALK_WEAR_GLSL } from '../road-wear';
import { findSignPlacements, signLabel } from '../street-signs';
import { StreetDressing, updateDressingViewport } from '../street-dressing';
import { FILM } from '../cinematic';
import { applyArtMaterial } from '../art-materials';
import { CurbParking } from '../curb-parking';
import { createTouringCar } from '../vehicle';
import { HouseDressing, type RoadLookup } from '../house-dressing';
import type { NetworkData, RoadEdge } from '../engine';

const edge = (id: number, physical: number, from: number, to: number, points: number[][], name: string, width = 8, direction = 1, type = 5): RoadEdge =>
  ({ id, physical_id: physical, from, to, points, name, width_m: width, lane_offset_m: width / 4, direction, road_type: type });

/** Two streets crossing at the origin (east/north metres), both directions stored. */
function crossing(): NetworkData {
  return { edges: [
    edge(0, 0, 1, 0, [[-120, 0, 10], [0, 0, 10]], 'SCHOOL STREET'), edge(1, 0, 0, 1, [[0, 0, 10], [-120, 0, 10]], 'SCHOOL STREET', 8, -1),
    edge(2, 1, 0, 2, [[0, 0, 10], [120, 0, 10]], 'SCHOOL STREET'), edge(3, 1, 2, 0, [[120, 0, 10], [0, 0, 10]], 'SCHOOL STREET', 8, -1),
    edge(4, 2, 0, 3, [[0, 0, 10], [0, 120, 10]], 'CHURCH STREET', 7), edge(5, 2, 3, 0, [[0, 120, 10], [0, 0, 10]], 'CHURCH STREET', 7, -1),
  ] };
}

describe('street-name signs', () => {
  it('letters blades in the current Massachusetts mixed-case form', () => {
    expect(signLabel('SCHOOL STREET')).toBe('School St');
    expect(signLabel('THOMPSON ROAD')).toBe('Thompson Rd');
    expect(signLabel('ARTHUR J REMILLARD JR WAY')).toBe('Arthur J Remillard Jr Way');
    expect(signLabel('BOYDEN STREET EXTENSION')).toBe('Boyden Street Ext');
  });
  it('places one post at a corner of each named intersection, clear of both carriageways', () => {
    const placements = findSignPlacements(crossing());
    expect(placements).toHaveLength(1);
    const [sign] = placements;
    expect(new Set(sign.names)).toEqual(new Set(['SCHOOL STREET', 'CHURCH STREET']));
    // Outside School Street's 4 m half-width and Church Street's 3.5 m half-width.
    expect(Math.abs(sign.n)).toBeGreaterThan(4);
    expect(Math.abs(sign.x)).toBeGreaterThan(3.5);
  });
});

describe('road lane coordinates', () => {
  it('measures lateral offset from the mapped centreline, distance along it and a junction fade', () => {
    const wear = new RoadWear(crossing());
    // A tile at the origin (origin y 0), with a 110 m School Street ribbon up to the junction.
    const group = new THREE.Group();
    const positions: number[] = [];
    for (let x = -110; x < 0; x += 10) {
      const quad = [[x, 4], [x + 10, 4], [x + 10, -4], [x, -4]].map(([e, n]) => [e, 10, -n]);
      for (const k of [0, 1, 2, 0, 2, 3]) positions.push(...quad[k]);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const material = new THREE.MeshStandardMaterial(); material.name = 'Drive road | asphalt';
    group.add(new THREE.Mesh(geometry, material));
    const report = wear.apply(group, [0, 0, 0]);
    expect(report.meshes).toBe(1);
    const lane = geometry.getAttribute(ROAD_LANE_ATTRIBUTE);
    expect(lane.itemSize).toBe(4);
    for (let i = 0; i < lane.count; i++) {
      expect(Math.abs(lane.getX(i))).toBeCloseTo(4, 3); // ribbon edges sit at the half-width
      expect(lane.getZ(i)).toBeCloseTo(4, 3); // two-way half-width, positive
      const east = positions[i * 3];
      expect(lane.getY(i)).toBeCloseTo(east + 120, 3); // distance along from the street's start
      // Full wear away from the junction, none within a couple of metres of Church Street.
      if (east <= -20) expect(lane.getW(i)).toBe(1);
      if (east >= 0) expect(lane.getW(i)).toBe(0);
    }
    expect(wear.apply(group, [0, 0, 0])).toBe(report);
  });
  it('keeps wear out of earth and gravel roads', () => {
    const wear = new RoadWear(crossing());
    const group = new THREE.Group();
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([-50, 10, -2, -40, 10, -2, -40, 10, 2], 3));
    const material = new THREE.MeshStandardMaterial(); material.name = 'Drive road | asphalt | gravel inventory surface'; material.userData.townRoadSurfaceType = 2;
    group.add(new THREE.Mesh(geometry, material));
    expect(wear.apply(group, [0, 0, 0]).meshes).toBe(0);
    expect(geometry.hasAttribute(ROAD_LANE_ATTRIBUTE)).toBe(false);
  });
  it('compiles into drive asphalt and sidewalk concrete only', () => {
    const compile = (name: string) => {
      const m = new THREE.MeshStandardMaterial(); m.name = name; applyArtMaterial(m);
      const shader = { vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader, uniforms: {} };
      m.onBeforeCompile(shader as Parameters<THREE.Material['onBeforeCompile']>[0], {} as THREE.WebGLRenderer);
      return { shader, m };
    };
    const road = compile('Drive road | asphalt');
    expect(road.shader.fragmentShader).toContain(ROAD_WEAR_GLSL.trim().slice(0, 60));
    expect(road.shader.vertexShader).toContain(`vTownRoadLane = ${ROAD_LANE_ATTRIBUTE};`);
    expect((road.m as THREE.MeshStandardMaterial & { defaultAttributeValues?: Record<string, number[]> }).defaultAttributeValues?.[ROAD_LANE_ATTRIBUTE]).toEqual([0, 0, 0, 0]);
    const walk = compile('Streetscape | warm sidewalk concrete');
    expect(walk.shader.fragmentShader).toContain(WALK_WEAR_GLSL.trim().slice(0, 60));
    expect(compile('Streetscape | granite curb').shader.fragmentShader).not.toContain('vTownRoadLane');
  });
});

describe('curbside parking', () => {
  it('parks only on registered aprons, clear of the carriageway and the junction', () => {
    const parking = new CurbParking(crossing());
    // Tile 0_-1 holds the stretch of School Street east of the junction (north from -250 to 0).
    const group = new THREE.Group();
    const apron: number[] = [];
    // A 2.6 m apron along the south curb (north -4 to -6.6), from 5 to 115 m east.
    const quad = [[5, -4], [115, -4], [115, -6.6], [5, -6.6]].map(([e, n]) => [e, 10, -n + 250]);
    for (const k of [0, 2, 1, 0, 3, 2]) apron.push(...quad[k]);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(apron, 3));
    const material = new THREE.MeshStandardMaterial(); material.name = 'Streetscape | parking apron asphalt';
    group.add(new THREE.Mesh(geometry, material));
    const report = parking.apply(group, '0_-1', [0, 0, -250], 0);
    expect(report.spaces).toBeGreaterThan(8);
    expect(report.cars).toBeGreaterThan(0);
    const placements = group.userData.curbParkingCars.placements as { center: number[]; forward: number[] }[];
    for (const car of placements) {
      expect(car.center[1]).toBeLessThan(-4.9); // beyond the 4 m half-width with the body on the apron
      expect(car.center[1]).toBeGreaterThan(-5.7);
      expect(car.center[0]).toBeGreaterThan(15); // no parking near the junction at the origin
      expect(car.forward[0]).toBeCloseTo(1, 5); // south side of an east-running street faces east
    }
    expect(parking.apply(group, '0_-1', [0, 0, -250], 0)).toBe(report);
    parking.dispose();
  });
});

describe('driveway cars', () => {
  /** A street along north = 0 (8 m wide), houses 10 m square set back 20 m, each with a paved strip to its east half. */
  function street(houses: number[], lot?: number) {
    const roads: RoadLookup = { nearestRoad: (x, n, max = 40) => Math.abs(n) > max ? null : { x, n: 0, z: 10, tx: 1, tn: 0, width: 8, type: 5, distance: Math.abs(n) } };
    const group = new THREE.Group();
    const terrain = new THREE.Mesh(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([-200, 10, 20, 200, 10, 20, 200, 10, -60, -200, 10, 20, 200, 10, -60, -200, 10, -60], 3)));
    terrain.name = 'terrain'; group.add(terrain);
    const walls: number[] = [], normals: number[] = [];
    for (const hx of houses) {
      const ring = [[hx - 5, 20], [hx + 5, 20], [hx + 5, 30], [hx - 5, 30]];
      for (let i = 0; i < 4; i++) {
        const [ae, an] = ring[i], [be, bn] = ring[(i + 1) % 4];
        // Outward normal of a counter-clockwise ring in east/north is (dn, -de); x = east, z = -north.
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
    if (lot !== undefined) {
      const paving = new THREE.Mesh(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([lot - 2, 10.01, -4, lot + 8, 10.01, -4, lot + 8, 10.01, -20, lot - 2, 10.01, -4, lot + 8, 10.01, -20, lot - 2, 10.01, -20], 3)), new THREE.MeshStandardMaterial());
      (paving.material as THREE.Material).name = 'Finished parking | asphalt'; group.add(paving);
    }
    // Land cover at 1 m: lawn everywhere, pavement from the curb to each house's front, east half.
    const width = 400, height = 80, data = new Uint8Array(width * height * 4);
    for (let i = 0; i < width * height; i++) data[i * 4] = 255;
    for (const hx of [...houses, ...(lot === undefined ? [] : [lot])]) for (let n = 5; n <= 20; n++) for (let e = hx; e < hx + 4; e++) {
      const i = (Math.floor(60 - n) * width + (e + 200)) * 4; data[i] = 0; data[i + 2] = 255;
    }
    group.userData.coverMask = { data, width, height, bounds: [-200, -60, 200, 20], core: [-200, -60, 200, 20] };
    return { group, dressing: new HouseDressing(roads) };
  }

  it('parks on the paved drive, centred across it, clear of the house and the street', () => {
    const houses = [-150, -90, -30, 30, 90, 150];
    const { group, dressing } = street(houses);
    const report = dressing.apply(group, [0, 0, 0], 0);
    expect(report.driveways).toBe(houses.length);
    expect(report.cars).toBeGreaterThan(0);
    const built = group.getObjectByName('House dressing')!;
    const cars = built.userData.drivewayCars.placements as { center: number[]; forward: number[]; grade: number[] }[];
    expect(cars).toHaveLength(report.cars);
    for (const car of cars) {
      const hx = houses.find(h => Math.abs(car.center[0] - h - 2) < 1)!;
      expect(hx).toBeDefined();
      expect(car.center[0]).toBeCloseTo(hx + 2, 1); // centred on the 4 m strip
      expect(car.center[1] + 2.3).toBeLessThan(20); // nose clear of the house front
      expect(car.center[1] - 2.3).toBeGreaterThan(4 + 1.5); // tail clear of the carriageway and curb
      expect(Math.abs(car.forward[1])).toBeCloseTo(1, 5);
      expect(car.center[2]).toBeCloseTo(10.016, 3);
      expect(car.grade).toEqual([0, 0]);
    }
    expect(dressing.apply(group, [0, 0, 0], 0)).toBe(report);
    dressing.dispose();
  });

  it('runs a front walk from each street-facing door to the street edge', () => {
    const houses = [-150, -90, -30, 30, 90, 150];
    const { group, dressing } = street(houses);
    group.userData.openings = { doors: houses.map(hx => [hx - 3, 11.1, -20]), garageDoors: [] };
    const report = dressing.apply(group, [0, 0, 0], 0);
    expect(report.walks).toBeGreaterThanOrEqual(3);
    const walks = group.getObjectByName('House dressing | front walks') as THREE.Mesh;
    const position = walks.geometry.getAttribute('position'), lane = walks.geometry.getAttribute(ROAD_LANE_ATTRIBUTE);
    expect(lane.count).toBe(position.count);
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i), n = -position.getZ(i);
      expect(houses.some(hx => Math.abs(x - (hx - 3)) < 0.6)).toBe(true);
      expect(n).toBeLessThanOrEqual(20);
      expect(n).toBeGreaterThan(4.05); // meets the street edge, never the carriageway
      expect(position.getY(i)).toBeCloseTo(10.05, 3);
    }
    // Faces up.
    const a = new THREE.Vector3().fromBufferAttribute(position, 0), b = new THREE.Vector3().fromBufferAttribute(position, 1), c = new THREE.Vector3().fromBufferAttribute(position, 2);
    expect(new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).y).toBeGreaterThan(0);
    expect(report.walkM / report.walks).toBeGreaterThan(14);
    dressing.dispose();
  });

  it('leaves a door alone when an authored frontage already paves its walk', () => {
    const houses = [-150, -90, -30, 30, 90, 150];
    const { group, dressing } = street(houses);
    group.userData.openings = { doors: houses.map(hx => [hx - 3, 11.1, -20]), garageDoors: [] };
    // Crafted frontage walks in front of the first three doors, from the wall to the street.
    const quads: number[] = [];
    for (const hx of houses.slice(0, 3)) { const a = hx - 3.6, b = hx - 2.4; quads.push(a, 10.02, -19.9, a, 10.02, -5, b, 10.02, -19.9, b, 10.02, -19.9, a, 10.02, -5, b, 10.02, -5); } // faces up
    const crafted = new THREE.Mesh(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(quads, 3)), new THREE.MeshStandardMaterial());
    crafted.name = 'Crafted building frontage | paving'; (crafted.material as THREE.Material).name = 'Crafted frontage | paving | #656966'; crafted.userData.townCrafted = true; group.add(crafted);
    const report = dressing.apply(group, [0, 0, 0], 0);
    const walks = group.getObjectByName('House dressing | front walks') as THREE.Mesh;
    const position = walks.geometry.getAttribute('position'), xs = new Set<number>();
    for (let i = 0; i < position.count; i++) xs.add(Math.round(position.getX(i)));
    for (const hx of houses.slice(0, 3)) expect([...xs].some(x => Math.abs(x - (hx - 3)) < 1)).toBe(false);
    expect(report.walks).toBeGreaterThanOrEqual(1);
    dressing.dispose();
  });

  it('never parks on a parking lot or at a distant level of detail', () => {
    // The same house and paved frontage, but the pavement is a finished parking lot.
    const lot = street([30], 30);
    expect(lot.dressing.apply(lot.group, [0, 0, 0], 0).driveways).toBe(0);
    const far = street([-30, 30]);
    expect(far.dressing.apply(far.group, [0, 0, 0], 1).cars).toBe(0);
  });
});

describe('chimneys', () => {
  /** Gable-roofed buildings (east x width, north 20 to 20 + depth, eaves 3 m up) beside a street along north = 0. */
  function block(buildings: { x: number; w: number; d: number }[]) {
    const roads: RoadLookup = { nearestRoad: (x, n, max = 40) => Math.abs(n) > max ? null : { x, n: 0, z: 10, tx: 1, tn: 0, width: 8, type: 5, distance: Math.abs(n) } };
    const group = new THREE.Group();
    const walls: number[] = [], normals: number[] = [], roof: number[] = [];
    for (const { x, w, d } of buildings) {
      const ring = [[x - w / 2, 20], [x + w / 2, 20], [x + w / 2, 20 + d], [x - w / 2, 20 + d]];
      for (let i = 0; i < 4; i++) {
        const [ae, an] = ring[i], [be, bn] = ring[(i + 1) % 4];
        const le = be - ae, ln = bn - an, l = Math.hypot(le, ln);
        for (const v of [[ae, 10, -an], [be, 10, -bn], [be, 10.6, -bn], [ae, 10, -an], [be, 10.6, -bn], [ae, 10.6, -an]]) { walls.push(...v); normals.push(ln / l, 0, le / l); }
      }
      const west = x - w / 2, east = x + w / 2, ridge = -(20 + d / 2);
      const A = [west, 13, -20], B = [east, 13, -20], C = [east, 15.5, ridge], D = [west, 15.5, ridge], E = [east, 13, -(20 + d)], F = [west, 13, -(20 + d)];
      for (const v of [A, B, C, A, C, D, D, C, E, D, E, F]) roof.push(...v);
    }
    const geometry = (positions: number[], name: string, normal?: number[]) => {
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      if (normal) g.setAttribute('normal', new THREE.Float32BufferAttribute(normal, 3));
      const m = new THREE.MeshStandardMaterial(); m.name = name; return new THREE.Mesh(g, m);
    };
    group.add(geometry(walls, 'V2 inferred | foundation', normals), geometry(roof, 'V2 inferred | roof'));
    return { group, dressing: new HouseDressing(roads) };
  }

  it('crowns most house ridges with a brick chimney, never a garage', () => {
    const houses = [-140, -100, -60, -20, 20, 60, 100, 140].map(x => ({ x, w: 10, d: 10 }));
    const { group, dressing } = block(houses);
    const report = dressing.apply(group, [0, 0, 0], 0);
    expect(report.chimneys).toBeGreaterThan(0);
    expect(report.chimneys).toBeLessThanOrEqual(houses.length);
    const chimney = group.getObjectByName('Street dressing | chimney') as THREE.Mesh;
    expect(chimney.castShadow).toBe(true);
    expect((chimney.material as THREE.Material).userData.townArt?.kind).toBe('brick');
    const box = new THREE.Box3().setFromObject(chimney);
    expect(box.max.y).toBeGreaterThan(15.5 + 0.8);
    expect(box.max.y).toBeLessThan(15.5 + 1.3);
    // Every chimney stands on a ridge line (north 25), within its roof.
    const position = chimney.geometry.getAttribute('position');
    for (let i = 0; i < position.count; i++) expect(Math.abs(-position.getZ(i) - 25)).toBeLessThan(0.5);
    dressing.dispose();
    const garages = block([-100, -60, -20, 20, 60, 100].map(x => ({ x, w: 6, d: 6.5 })));
    expect(garages.dressing.apply(garages.group, [0, 0, 0], 0).chimneys).toBe(0);
    // The same houses with a vehicle door in each front wall.
    const attached = block(houses);
    attached.group.userData.openings = { doors: [], garageDoors: houses.map(h => [h.x + 2, 11.1, -20]) };
    expect(attached.dressing.apply(attached.group, [0, 0, 0], 0).chimneys).toBe(0);
  });
});

describe('street dressing placement', () => {
  it('sizes overhead wire ribbons from the live drawing buffer', () => {
    const dressing = new StreetDressing(crossing());
    updateDressingViewport(dressing, { getDrawingBufferSize: (target: THREE.Vector2) => target.set(1600, 900) } as unknown as THREE.WebGLRenderer);
    const wire = (dressing as unknown as { materials: { wire: THREE.ShaderMaterial } }).materials.wire;
    expect(wire.uniforms.townViewport.value.toArray()).toEqual([1600, 900]);
    // A vertex behind the camera slides along its wire rather than fanning the ribbon.
    expect(wire.vertexShader).toContain('point += townWireDir * ((0.3 - depth) / rate);');
    dressing.dispose();
  });
  it('sets poles off the street centreline, not the driving line', () => {
    const dressing = new StreetDressing(crossing());
    const poles = (dressing as unknown as { poles: { x: number; n: number }[] }).poles;
    expect(poles.length).toBeGreaterThan(0);
    for (const pole of poles) {
      // School Street runs along n = 0 (half-width 4 m): poles stand 0.75 m beyond the edge.
      if (Math.abs(pole.x) > 15 && Math.abs(pole.n) < 10) expect(Math.abs(pole.n)).toBeCloseTo(4.75, 3);
    }
  });
});

describe('surface library', () => {
  it('ships every authored texture with the recorded size and hash', () => {
    expect(Object.keys(library.materials).sort()).toEqual(['asphalt', 'brick', 'cedar', 'clapboard', 'concrete', 'foundation', 'granite', 'shingles']);
    for (const set of Object.values(library.materials)) for (const entry of [set.albedo, set.normal, set.orm]) {
      const bytes = readFileSync(new URL(`../../../../public/town-materials/${library.library}/${entry.url}`, import.meta.url));
      expect(bytes.length).toBe(entry.bytes);
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(entry.sha256);
    }
  });
});

describe('car body lean', () => {
  it('rolls and pitches only the sprung body, within bounds, leaving the wheels on the road', () => {
    const car = createTouringCar();
    const body = car.root.getObjectByName('Sprung body')!;
    const wheelY = car.wheels.map(w => w.position.y);
    car.update({ distanceM: 3, steeringRadians: 0.1, braking: true, rollRadians: -0.03, pitchRadians: -0.02 });
    expect(body.rotation.z).toBeCloseTo(-0.03, 8);
    expect(body.rotation.x).toBeCloseTo(-0.02, 8);
    expect(car.wheels.map(w => w.position.y)).toEqual(wheelY);
    car.update({ distanceM: 3, steeringRadians: 0, braking: false, rollRadians: 5, pitchRadians: Number.NaN });
    expect(Math.abs(body.rotation.z)).toBeLessThanOrEqual(0.06);
    expect(body.rotation.x).toBe(0);
    car.dispose();
  });
});

describe('camera finish', () => {
  it('keeps motion blur bounded and the grade in a sane range', () => {
    expect(FILM.tone).toBe('agx');
    expect(FILM.motion.shutter).toBeLessThanOrEqual(0.5);
    expect(FILM.motion.maxPixels).toBeLessThanOrEqual(32);
    expect(FILM.sharpen).toBeGreaterThan(0);
    expect(FILM.sharpen).toBeLessThan(1);
    expect(FILM.grade.contrast).toBeLessThan(2);
  });
});
