// @vitest-environment node
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import library from '../../../../data/derived/town/material-library.json';
import { RoadWear, ROAD_LANE_ATTRIBUTE, ROAD_WEAR_GLSL, WALK_WEAR_GLSL } from '../road-wear';
import { findSignPlacements, signLabel } from '../street-signs';
import { StreetDressing } from '../street-dressing';
import { FILM } from '../cinematic';
import { applyArtMaterial } from '../art-materials';
import { CurbParking } from '../curb-parking';
import { createTouringCar } from '../vehicle';
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

describe('street dressing placement', () => {
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
