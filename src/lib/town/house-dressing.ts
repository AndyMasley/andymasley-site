import * as THREE from 'three';
import { Builder, tileTerrain } from './street-dressing';
import { GrassTerrain, type GrassMask } from './grass';
import { addParkedLife, surfaceProxies, type ParkedPlacement } from './parked-life';
import { ROAD_LANE_ATTRIBUTE } from './road-wear';
import { applyArtMaterial } from './art-materials';

/**
 * Front-yard dressing for houses: clipped foundation shrubs (yew, boxwood,
 * hydrangea in late-summer bloom) in dark mulch beds along the walls that face
 * the street, curbside mailboxes on local streets, aluminium gutters with
 * downspouts along the eaves of pitched roofs, painted rake boards up their
 * gables, and a car in some driveways. Driveways are the paved land-cover
 * class between a house and its local street; which ones hold a car, and its
 * colour, are authored and stable, not a record of anyone's vehicle. The planting habit and
 * mailbox forms follow ordinary New England front yards; which houses have
 * them, species, sizes and positions are authored from each building's
 * foundation outline, its doors and the nearest street. None is surveyed.
 */
export type RoadLookup = { nearestRoad(x: number, n: number, max?: number): { x: number; n: number; z: number; tx: number; tn: number; width: number; type: number; distance: number } | null };
export type HouseDressingReport = { buildings: number; frontWalls: number; shrubs: number; beds: number; mailboxes: number; gutterM: number; downspouts: number; rakeM: number; chimneys: number; driveways: number; cars: number; walks: number; walkM: number; triangles: number };

/** Surfaces a driveway car must never stand on. */
const DRIVEWAY_BLOCKERS = /^(?:Streetscape \||Finished parking \||Finished street corner \|)/;
const DRIVEWAY_PALETTE = ['#ecebe3', '#aeb7b8', '#56666b', '#8e2e2b', '#263e57', '#d0c3a4', '#333739', '#647261', '#9aa3a6', '#1f2a33'];
const FOUNDATION = /^(?:V2 inferred \| (?:foundation|concrete_wall)$|Crafted frontage \| foundation \|)/;
type Segment = { a: THREE.Vector3; b: THREE.Vector3; nx: number; nz: number; building: number };
type Outline = { walls: Segment[]; x0: number; x1: number; z0: number; z1: number };
type SurfaceTests = { paved(east: number, north: number): boolean; blocked(east: number, north: number): boolean };

/** Each building's foundation walls with their plan bounds (tile-local x/z). */
function buildingOutlines(segments: readonly Segment[]): Map<number, Outline> {
  const outlines = new Map<number, Outline>();
  for (const w of segments) {
    let o = outlines.get(w.building);
    if (!o) { o = { walls: [], x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity }; outlines.set(w.building, o); }
    o.walls.push(w);
    o.x0 = Math.min(o.x0, w.a.x, w.b.x); o.x1 = Math.max(o.x1, w.a.x, w.b.x); o.z0 = Math.min(o.z0, w.a.z, w.b.z); o.z1 = Math.max(o.z1, w.a.z, w.b.z);
  }
  return outlines;
}

/** Whether a tile-local point lies inside an outline (even-odd rule over its walls). */
function inside(o: Outline, x: number, z: number): boolean {
  if (x < o.x0 || x > o.x1 || z < o.z0 || z > o.z1) return false;
  let crossings = 0;
  for (const w of o.walls) if ((w.a.z > z) !== (w.b.z > z) && w.a.x + (z - w.a.z) * (w.b.x - w.a.x) / (w.b.z - w.a.z) > x) crossings++;
  return crossings % 2 === 1;
}

function seeded(x: number, z: number, salt: number): () => number {
  let s = (Math.imul(Math.round(x * 7) ^ salt, 0x27d4eb2d) ^ Math.imul(Math.round(z * 7) + 0x165667b1, 0x85ebca6b)) >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function shrubGeometry(detail: number): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const p = g.getAttribute('position');
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    // Lumpy clipped mass: gentle lobes, a flattened, slightly flared base.
    const lobe = 1 + 0.09 * Math.sin(v.x * 4.1 + v.z * 2.3) * Math.cos(v.y * 3.7 - v.z * 1.9) + 0.05 * Math.sin(v.x * 9.3 - v.y * 7.1 + v.z * 8.7);
    v.multiplyScalar(lobe);
    if (v.y < -0.35) v.y = -0.35 + (v.y + 0.35) * 0.25;
    v.y += 0.4;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  g.computeBoundingBox(); g.computeBoundingSphere();
  return g;
}

/** Leaf clumps, crevice shade and hydrangea heads from world-space noise. */
function shrubMaterial(): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.82, metalness: 0 });
  m.name = 'House dressing | clipped shrub foliage';
  m.userData.townCrafted = true;
  m.envMapIntensity = 0.15;
  m.onBeforeCompile = shader => {
    shader.vertexShader = `attribute float townShrubKind;\nvarying float vTownShrubKind;\nvarying vec3 vTownShrubWorld;\nvarying float vTownShrubHeight;\n${shader.vertexShader}`.replace('#include <project_vertex>', `#include <project_vertex>
vec4 townShrubP = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
townShrubP = instanceMatrix * townShrubP;
#endif
vTownShrubWorld = (modelMatrix * townShrubP).xyz;
vTownShrubHeight = clamp(position.y / 1.4, 0.0, 1.0);
vTownShrubKind = townShrubKind;`);
    shader.fragmentShader = `varying float vTownShrubKind;\nvarying vec3 vTownShrubWorld;\nvarying float vTownShrubHeight;
float townShrubHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float townShrubNoise(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(townShrubHash(i), townShrubHash(i + vec3(1,0,0)), f.x), mix(townShrubHash(i + vec3(0,1,0)), townShrubHash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(townShrubHash(i + vec3(0,0,1)), townShrubHash(i + vec3(1,0,1)), f.x), mix(townShrubHash(i + vec3(0,1,1)), townShrubHash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
${shader.fragmentShader}`.replace('#include <map_fragment>', `#include <map_fragment>
float townShrubLeaf = townShrubNoise(vTownShrubWorld * 11.0);
float townShrubClump = townShrubNoise(vTownShrubWorld * 3.2 + 7.1);
diffuseColor.rgb *= mix(0.5, 1.25, townShrubLeaf) * mix(0.75, 1.12, townShrubClump);
diffuseColor.rgb *= mix(0.45, 1.0, smoothstep(0.0, 0.55, vTownShrubHeight));
// Hydrangea (kind 2): mophead blooms, white to blush or blue per plant.
if (vTownShrubKind > 1.5 && vTownShrubKind < 2.5) {
  float townBloom = smoothstep(0.58, 0.66, townShrubNoise(vTownShrubWorld * 4.3 + 3.3)) * smoothstep(0.35, 0.7, vTownShrubHeight);
  vec3 townPetal = mix(vec3(0.82, 0.83, 0.80), mix(vec3(0.62, 0.42, 0.58), vec3(0.38, 0.48, 0.72), step(0.5, fract(vTownShrubKind * 7.0 + townShrubNoise(floor(vTownShrubWorld * 0.5))))), step(0.4, townShrubNoise(floor(vTownShrubWorld * 0.7) + 1.7)));
  diffuseColor.rgb = mix(diffuseColor.rgb, townPetal * mix(0.8, 1.05, townShrubLeaf), townBloom);
}
float townShrubRelief = townShrubLeaf * 0.02 + townShrubClump * 0.03;`).replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
vec3 townShrubDx = dFdx(-vViewPosition), townShrubDy = dFdy(-vViewPosition);
vec3 townShrubR1 = cross(townShrubDy, normal), townShrubR2 = cross(normal, townShrubDx);
float townShrubDet = dot(townShrubDx, townShrubR1);
if (abs(townShrubDet) > 1e-10) normal = normalize(abs(townShrubDet) * normal - sign(townShrubDet) * (dFdx(townShrubRelief) * townShrubR1 + dFdy(townShrubRelief) * townShrubR2));`);
  };
  m.customProgramCacheKey = () => 'house-dressing-shrub-v1';
  return m;
}

function mulchMaterial(): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color: '#3b2b1f', roughness: 0.97, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  m.name = 'House dressing | bark mulch bed';
  m.userData.townCrafted = true;
  m.envMapIntensity = 0.1;
  m.onBeforeCompile = shader => {
    shader.vertexShader = `varying vec3 vTownMulchWorld;\n${shader.vertexShader}`.replace('#include <project_vertex>', '#include <project_vertex>\nvTownMulchWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = `varying vec3 vTownMulchWorld;
float townMulchHash(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
${shader.fragmentShader}`.replace('#include <map_fragment>', `#include <map_fragment>
vec2 townChip = floor(vTownMulchWorld.xz * vec2(38.0, 17.0) + vec2(0.0, floor(vTownMulchWorld.x * 38.0) * 0.37));
diffuseColor.rgb *= mix(0.55, 1.45, townMulchHash(townChip)) * mix(0.85, 1.1, townMulchHash(floor(vTownMulchWorld.xz * 3.0)));`);
  };
  m.customProgramCacheKey = () => 'house-dressing-mulch-v1';
  return m;
}

function walkMaterial(): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color: '#a8a59b', roughness: 0.92, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  m.name = 'House dressing | concrete walk';
  applyArtMaterial(m);
  return m;
}

export class HouseDressing {
  private readonly shrubHigh = shrubGeometry(2);
  private readonly shrubLow = shrubGeometry(1);
  private readonly shrub = shrubMaterial();
  private readonly mulch = mulchMaterial();
  private readonly solids: Record<string, THREE.MeshStandardMaterial>;
  /** Driveway cars share one material per part across tiles. */
  private readonly carMaterials = new Map<string, THREE.MeshStandardMaterial>();
  /** Front walks: poured concrete with the sidewalk joints and texture. */
  private readonly walk = walkMaterial();

  constructor(private readonly roads: RoadLookup) {
    const standard = (name: string, color: string, roughness: number, metalness = 0): THREE.MeshStandardMaterial => {
      const m = new THREE.MeshStandardMaterial({ color, roughness, metalness });
      m.name = `House dressing | ${name}`; m.userData.townCrafted = true; m.envMapIntensity = 0.3; return m;
    };
    this.solids = {
      box: standard('mailbox enamel', '#1c1f21', 0.45, 0.3),
      flag: standard('mailbox flag', '#a3241c', 0.5),
      post: standard('painted post', '#d9d6cc', 0.7),
      darkPost: standard('treated post', '#4c4034', 0.85),
      gutter: standard('painted aluminium gutter', '#e4e2da', 0.5, 0.1),
      rake: standard('painted rake board', '#e7e4da', 0.72),
      chimney: standard('brick chimney', '#8a5243', 0.9),
      chimneyCap: standard('cast chimney cap', '#8f8c84', 0.86),
      flue: standard('clay flue liner', '#7c4a37', 0.82),
      mulch: this.mulch,
    };
    // Chimney brick takes the shared running-bond library texture.
    applyArtMaterial(this.solids.chimney);
  }

  apply(group: THREE.Group, origin: readonly number[], level: number): HouseDressingReport {
    const existing = group.userData.houseDressing as HouseDressingReport | undefined;
    if (existing) return existing;
    const report: HouseDressingReport = { buildings: 0, frontWalls: 0, shrubs: 0, beds: 0, mailboxes: 0, gutterM: 0, downspouts: 0, rakeM: 0, chimneys: 0, driveways: 0, cars: 0, walks: 0, walkM: 0, triangles: 0 };
    group.userData.houseDressing = report;
    if (level > 1) return report;
    group.updateMatrixWorld(true);
    const inverse = group.matrixWorld.clone().invert();
    const segments: Segment[] = [];
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), relative = new THREE.Matrix4();
    group.traverse(object => {
      if (!(object instanceof THREE.Mesh) || object instanceof THREE.InstancedMesh) return;
      const material = Array.isArray(object.material) ? object.material[0] : object.material;
      if (!material || !FOUNDATION.test(material.name)) return;
      relative.copy(inverse).multiply(object.matrixWorld);
      const position = object.geometry.getAttribute('position'), normals = object.geometry.getAttribute('normal'), index = object.geometry.index;
      if (!position) return;
      const normalMatrix = new THREE.Matrix3().getNormalMatrix(relative), authored = new THREE.Vector3();
      const count = index ? index.count : position.count;
      for (let t = 0; t + 2 < count; t += 3) {
        a.fromBufferAttribute(position, index ? index.getX(t) : t).applyMatrix4(relative);
        b.fromBufferAttribute(position, index ? index.getX(t + 1) : t + 1).applyMatrix4(relative);
        c.fromBufferAttribute(position, index ? index.getX(t + 2) : t + 2).applyMatrix4(relative);
        const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
        const length = n.length();
        if (length < 1e-6) continue;
        n.divideScalar(length);
        // Authored vertex normals decide which side is outside.
        if (normals) {
          authored.set(0, 0, 0);
          for (let k = 0; k < 3; k++) authored.add(new THREE.Vector3().fromBufferAttribute(normals, index ? index.getX(t + k) : t + k));
          if (authored.applyMatrix3(normalMatrix).dot(n) < 0) n.negate();
        }
        if (Math.abs(n.y) > 0.3) continue;
        const sorted = [a.clone(), b.clone(), c.clone()].sort((p, q) => p.y - q.y);
        if (Math.abs(sorted[0].y - sorted[1].y) > 0.2 || Math.hypot(sorted[0].x - sorted[1].x, sorted[0].z - sorted[1].z) < 1.0) continue;
        const horizontal = Math.hypot(n.x, n.z);
        segments.push({ a: sorted[0], b: sorted[1], nx: n.x / horizontal, nz: n.z / horizontal, building: -1 });
      }
    });
    // Buildings: segments sharing (or nearly sharing) end points.
    const parent = segments.map((_, i) => i);
    const find = (i: number): number => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
    const grid = new Map<string, number[]>();
    segments.forEach((s, i) => { for (const p of [s.a, s.b]) { const k = `${Math.round(p.x * 2)}_${Math.round(p.z * 2)}`; const l = grid.get(k); if (l) l.push(i); else grid.set(k, [i]); } });
    for (const list of grid.values()) for (let i = 1; i < list.length; i++) { const x = find(list[0]), y = find(list[i]); if (x !== y) parent[x] = y; }
    segments.forEach((s, i) => { s.building = find(i); });
    const doors: number[][] = group.userData.openings?.doors ?? [];
    const ground = tileTerrain(group);
    const groundAt = (x: number, z: number, fallback: number) => { const p = ground.sample(x, z); return p && Math.abs(p.y - fallback) < 2.5 ? p.y : fallback; };
    const toEast = (x: number) => x + origin[0], toNorth = (z: number) => -(z + origin[2]);
    const shrubs: { m: THREE.Matrix4; color: THREE.Color; kind: number }[] = [];
    const builder = new Builder();
    const buildings = new Map<number, { best: Segment; bestLength: number }>();
    const frontWalls: Segment[] = [];
    for (const segment of segments) {
      const mid = segment.a.clone().add(segment.b).multiplyScalar(0.5);
      const road = this.roads.nearestRoad(toEast(mid.x), toNorth(mid.z), 40);
      if (!road) continue;
      const toRoadE = road.x - toEast(mid.x), toRoadN = road.n - toNorth(mid.z), d = Math.hypot(toRoadE, toRoadN) || 1;
      // Wall outward in east/north is (nx, -nz).
      if ((segment.nx * toRoadE - segment.nz * toRoadN) / d < 0.45) continue;
      report.frontWalls++;
      frontWalls.push(segment);
      const length = segment.a.distanceTo(segment.b);
      const known = buildings.get(segment.building);
      if (!known || length > known.bestLength) buildings.set(segment.building, { best: segment, bestLength: length });
      if (length < 1.6) continue;
      const random = seeded(mid.x + origin[0], mid.z + origin[2], 811);
      const species = random();
      const kindFor = (): number => species < 0.38 ? 0 : species < 0.66 ? 1 : species < 0.86 ? 2 : (random() < 0.5 ? 1 : 2);
      const dir = segment.b.clone().sub(segment.a).divideScalar(length);
      let placed = 0;
      for (let t = 0.55 + random() * 0.4; t < length - 0.45; t += 0.9 + random() * 0.55) {
        const p = segment.a.clone().addScaledVector(dir, t);
        if (doors.some(door => Math.hypot(door[0] - p.x, door[2] - p.z) < 1.35)) continue;
        if (random() < 0.16) continue;
        const kind = kindFor();
        const radius = kind === 2 ? 0.5 + random() * 0.25 : kind === 0 ? 0.42 + random() * 0.22 : 0.34 + random() * 0.2;
        const height = radius * (kind === 0 ? 1.5 + random() * 0.4 : kind === 2 ? 1.35 + random() * 0.3 : 1.15 + random() * 0.3);
        const x = p.x + segment.nx * (0.3 + radius * 0.85), z = p.z + segment.nz * (0.3 + radius * 0.85);
        const y = groundAt(x, z, p.y) - 0.04;
        const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), random() * Math.PI * 2), new THREE.Vector3(radius, height / 1.4, radius));
        // Linear foliage reflectance: yew, boxwood and hydrangea leaf greens.
        const color = kind === 0 ? new THREE.Color().setRGB(0.05, 0.095, 0.045) : kind === 1 ? new THREE.Color().setRGB(0.09, 0.15, 0.052) : new THREE.Color().setRGB(0.085, 0.15, 0.065);
        color.multiplyScalar(0.9 + random() * 0.2);
        shrubs.push({ m, color, kind: kind + random() * 0.4 });
        placed++;
      }
      if (placed && level === 0) {
        // Mulch bed hugging the wall, following the ground at its corners.
        const depth = 1.25;
        const corners = [segment.a, segment.b, segment.b.clone().add(new THREE.Vector3(segment.nx * depth, 0, segment.nz * depth)), segment.a.clone().add(new THREE.Vector3(segment.nx * depth, 0, segment.nz * depth))]
          .map(p => new THREE.Vector3(p.x, groundAt(p.x, p.z, segment.a.y) + 0.03, p.z));
        builder.quad('mulch', corners);
        report.beds++;
      }
    }
    for (const { best } of buildings.values()) {
      report.buildings++;
      const mid = best.a.clone().add(best.b).multiplyScalar(0.5);
      const road = this.roads.nearestRoad(toEast(mid.x), toNorth(mid.z), 38);
      if (!road || road.type !== 5 || road.distance < 7) continue;
      const toHouseE = toEast(mid.x) - road.x, toHouseN = toNorth(mid.z) - road.n, d = Math.hypot(toHouseE, toHouseN) || 1;
      const offset = road.width / 2 + 0.5;
      const east = road.x + toHouseE / d * offset + road.tx * 1.6, north = road.n + toHouseN / d * offset + road.tn * 1.6;
      const x = east - origin[0], z = -north - origin[2];
      const y = groundAt(x, z, road.z);
      const random = seeded(east, north, 4513);
      const face: [number, number] = [-toHouseE / d, toHouseN / d];
      const painted = random() < 0.55;
      builder.box(painted ? 'post' : 'darkPost', [x, y + 0.52, z], face, 0.1, 1.04, 0.1);
      builder.box(painted ? 'post' : 'darkPost', [x - face[0] * 0.02, y + 1.06, z - face[1] * 0.02], face, 0.36, 0.05, 0.2);
      builder.box('box', [x, y + 1.19, z], face, 0.46, 0.2, 0.19);
      builder.cylinder('box', [x - face[0] * 0.23, y + 1.29, z - face[1] * 0.23], [x + face[0] * 0.23, y + 1.29, z + face[1] * 0.23], 0.095, 0.095, 10);
      if (random() < 0.4) builder.box('flag', [x - face[0] * 0.05 + face[1] * 0.1, y + 1.33, z - face[1] * 0.05 - face[0] * 0.1], face, 0.04, 0.16, 0.012);
      report.mailboxes++;
    }
    const outlines = buildingOutlines(segments);
    const tests = level === 0 ? this.surfaceTests(group, origin) : null;
    const driveways = tests ? this.driveways(group, origin, [...buildings.values()], outlines, tests, report) : [];
    const walks = tests ? this.walkways(origin, frontWalls, outlines, doors, tests, groundAt, report) : null;
    this.gutters(group, inverse, builder, groundAt, report);
    this.chimneys(group, inverse, builder, report);
    const built = builder.finish(this.solids);
    if (shrubs.length) {
      const geometry = level === 0 ? this.shrubHigh : this.shrubLow;
      const mesh = new THREE.InstancedMesh(geometry, this.shrub, shrubs.length);
      const kinds = new Float32Array(shrubs.length);
      shrubs.forEach((s, i) => { mesh.setMatrixAt(i, s.m); mesh.setColorAt(i, s.color); kinds[i] = s.kind; });
      // The per-instance kind is an instanced attribute on a per-tile geometry view.
      mesh.geometry = geometry.clone();
      mesh.geometry.setAttribute('townShrubKind', new THREE.InstancedBufferAttribute(kinds, 1));
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingBox(); mesh.computeBoundingSphere();
      mesh.name = 'House dressing | foundation shrubs';
      mesh.userData.townCrafted = true;
      mesh.castShadow = level === 0; mesh.receiveShadow = true;
      built.add(mesh);
      report.shrubs = shrubs.length;
    }
    if (driveways.length) {
      addParkedLife(built, origin as [number, number, number], level, driveways, 'drivewayCars', 'Driveway | parked cars', this.carMaterials);
      for (const material of this.carMaterials.values()) applyArtMaterial(material);
      report.cars = driveways.length;
    }
    if (walks) built.add(walks);
    if (built.children.length) { built.name = 'House dressing'; group.add(built); }
    built.traverse(o => { if (o instanceof THREE.Mesh) report.triangles += ((o.geometry.index?.count ?? o.geometry.getAttribute('position').count) / 3) * (o instanceof THREE.InstancedMesh ? o.count : 1); });
    return report;
  }

  /**
   * Point tests shared by driveways and walks (east/north metres): the paved
   * land-cover class, and surfaces nothing may stand on or cross (streets by
   * the network; sidewalks, curbs, aprons, lots and corner work by their
   * triangles). Null without the tile's cover data.
   */
  private surfaceTests(group: THREE.Group, origin: readonly number[]): SurfaceTests | null {
    const cover = group.userData.coverMask as GrassMask | undefined;
    if (!cover) return null;
    const [x0, z0, x1, z1] = cover.bounds, sx = cover.width / (x1 - x0), sz = cover.height / (z1 - z0);
    const paved = (east: number, north: number): boolean => {
      const px = Math.floor((east - x0) * sx), pz = Math.floor((-north - z0) * sz);
      if (px < 0 || pz < 0 || px >= cover.width || pz >= cover.height) return false;
      const i = (pz * cover.width + px) * 4;
      return cover.data[i + 2] > 150 && cover.data[i] < 100 && cover.data[i + 1] < 100;
    };
    let blockers: GrassTerrain | undefined;
    const blocked = (east: number, north: number): boolean => {
      const street = this.roads.nearestRoad(east, north, 16);
      if (street && street.distance < street.width / 2 + 0.9) return true;
      blockers ??= new GrassTerrain(surfaceProxies(group, name => DRIVEWAY_BLOCKERS.test(name), true));
      return !!blockers.sample(east - origin[0], -north - origin[2]);
    };
    return { paved, blocked };
  }

  /**
   * A poured concrete front walk, about a metre wide with control joints,
   * straight out from most street-facing doors to the first pavement it meets:
   * a driveway, a sidewalk, or the street edge. It follows the ground. Doors
   * whose walk would cross another building or run beyond 40 m get none.
   */
  private walkways(origin: readonly number[], fronts: Segment[], outlines: Map<number, Outline>, doors: number[][], tests: SurfaceTests, groundAt: (x: number, z: number, fallback: number) => number, report: HouseDressingReport): THREE.Mesh | null {
    const position: number[] = [], normal: number[] = [], lane: number[] = [];
    const east = (x: number) => x + origin[0], north = (z: number) => -(z + origin[2]);
    const done: number[][] = [];
    for (const door of doors) {
      // The street-facing wall the door is set in.
      let wall: Segment | undefined, best = 0.9;
      for (const w of fronts) {
        const ex = w.b.x - w.a.x, ez = w.b.z - w.a.z, t = Math.max(0, Math.min(1, ((door[0] - w.a.x) * ex + (door[2] - w.a.z) * ez) / (ex * ex + ez * ez || 1)));
        const d = Math.hypot(w.a.x + ex * t - door[0], w.a.z + ez * t - door[2]);
        if (d < best) { best = d; wall = w; }
      }
      if (!wall || done.some(p => Math.hypot(p[0] - door[0], p[1] - door[2]) < 1.5)) continue;
      const random = seeded(east(door[0]), north(door[2]), 3301);
      if (random() > 0.82) continue;
      const ex = wall.b.x - wall.a.x, ez = wall.b.z - wall.a.z, l = Math.hypot(ex, ez) || 1;
      const t = ((door[0] - wall.a.x) * ex + (door[2] - wall.a.z) * ez) / (l * l);
      const sx = wall.a.x + ex * t + wall.nx * 0.02, sz = wall.a.z + ez * t + wall.nz * 0.02;
      const others = [...outlines.values()].filter(o => o.walls[0].building !== wall!.building && o.x0 - 45 < sx && o.x1 + 45 > sx && o.z0 - 45 < sz && o.z1 + 45 > sz);
      let length = 0, reached = false;
      for (let s = 0.5; s <= 40; s += 0.5) {
        const x = sx + wall.nx * s, z = sz + wall.nz * s;
        if (others.some(o => x > o.x0 - 0.4 && x < o.x1 + 0.4 && z > o.z0 - 0.4 && z < o.z1 + 0.4 && (inside(o, x, z) || o.walls.some(w => { const wx = w.b.x - w.a.x, wz = w.b.z - w.a.z, q = Math.max(0, Math.min(1, ((x - w.a.x) * wx + (z - w.a.z) * wz) / (wx * wx + wz * wz || 1))); return Math.hypot(w.a.x + wx * q - x, w.a.z + wz * q - z) < 0.4; })))) break;
        if (tests.paved(east(x), north(z)) || tests.blocked(east(x), north(z))) { length = s; reached = true; break; }
      }
      if (!reached || length < 1.5) continue;
      done.push([door[0], door[2]]);
      const half = 0.47 + random() * 0.1, ax = -wall.nz, az = wall.nx;
      const steps = Math.max(1, Math.ceil(length));
      const corner = (s: number, side: number) => {
        const x = sx + wall!.nx * s + ax * side * half, z = sz + wall!.nz * s + az * side * half;
        return [x, groundAt(x, z, door[1] - 1.1) + 0.05, z];
      };
      for (let k = 0; k < steps; k++) {
        const s0 = length * k / steps, s1 = length * (k + 1) / steps;
        const q = [corner(s0, -1), corner(s0, 1), corner(s1, 1), corner(s1, -1)];
        const u = [[0, s0], [2 * half, s0], [2 * half, s1], [0, s1]];
        // (across x outward) is up, so this order winds counter-clockwise seen from above.
        for (const i of [0, 1, 2, 0, 2, 3]) { position.push(...q[i]); normal.push(0, 1, 0); lane.push(1.01 + u[i][0], u[i][1], 1.01, 1); }
      }
      report.walks++; report.walkM += length;
    }
    if (!position.length) return null;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normal, 3));
    geometry.setAttribute(ROAD_LANE_ATTRIBUTE, new THREE.Float32BufferAttribute(lane, 4));
    geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, this.walk);
    mesh.name = 'House dressing | front walks'; mesh.userData.townCrafted = true; mesh.receiveShadow = true;
    return mesh;
  }

  /**
   * A parked car on some house driveways. A driveway is the paved land-cover
   * class between a house front and its street; the car's whole footprint must
   * lie on it, clear of carriageways, sidewalks, curbs, aprons, parking lots
   * and every building wall. It stands nose to the house (a few are backed
   * in), at the head of the drive and centred across it.
   */
  private driveways(group: THREE.Group, origin: readonly number[], fronts: { best: Segment; bestLength: number }[], outlines: Map<number, Outline>, tests: SurfaceTests, report: HouseDressingReport): ParkedPlacement[] {
    const { paved, blocked } = tests;
    const ground = tileTerrain(group);
    const heightAt = (east: number, north: number): number | undefined => ground.sample(east - origin[0], -north - origin[2])?.y;
    const lot = (group.userData.parkedLife?.placements ?? []) as ParkedPlacement[];
    const footprint: number[][] = [];
    for (const u of [-2.4, -1.6, -0.8, 0, 0.8, 1.6, 2.4]) for (const v of [-1.15, 0, 1.15]) footprint.push([u, v]);
    const placements: ParkedPlacement[] = [];
    for (const { best, bestLength } of fronts) {
      if (bestLength < 5 || bestLength > 24) continue;
      const mid = best.a.clone().add(best.b).multiplyScalar(0.5);
      const me = mid.x + origin[0], mn = -(mid.z + origin[2]);
      const road = this.roads.nearestRoad(me, mn, 42);
      if (!road || road.distance < 9) continue;
      const ne = (me - road.x) / road.distance, nn = (mn - road.n) / road.distance, te = -nn, tn = ne;
      const half = road.width / 2;
      const near = [...outlines.values()].filter(o => o.x0 - 40 < mid.x && o.x1 + 40 > mid.x && o.z0 - 40 < mid.z && o.z1 + 40 > mid.z);
      const clearOfBuildings = (east: number, north: number): boolean => {
        const x = east - origin[0], z = -north - origin[2];
        for (const o of near) {
          if (x < o.x0 - 0.6 || x > o.x1 + 0.6 || z < o.z0 - 0.6 || z > o.z1 + 0.6) continue;
          for (const w of o.walls) {
            const ex = w.b.x - w.a.x, ez = w.b.z - w.a.z, t = Math.max(0, Math.min(1, ((x - w.a.x) * ex + (z - w.a.z) * ez) / (ex * ex + ez * ez || 1)));
            if (Math.hypot(w.a.x + ex * t - x, w.a.z + ez * t - z) < 0.6) return false;
          }
          if (inside(o, x, z)) return false;
        }
        return true;
      };
      const fits = (depth: number, along: number): boolean => {
        const ce = road.x + ne * depth + te * along, cn = road.n + nn * depth + tn * along;
        if (!paved(ce, cn)) return false;
        for (const [u, v] of footprint) if (!paved(ce + ne * u + te * v, cn + nn * u + tn * v)) return false;
        for (const [u, v] of footprint) if (!clearOfBuildings(ce + ne * u + te * v, cn + nn * u + tn * v)) return false;
        for (const [u, v] of footprint) if (blocked(ce + ne * u + te * v, cn + nn * u + tn * v)) return false;
        return true;
      };
      let found: { depth: number; along: number } | null = null;
      // Head of the drive first (nearest the house), then outward along the street.
      search: for (let depth = Math.min(road.distance - 3.1, half + 28); depth >= half + 4.8; depth -= 0.5) {
        for (let k = 0; k <= 48; k++) {
          const along = (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.5;
          if (fits(depth, along)) { found = { depth, along }; break search; }
        }
      }
      if (!found) continue;
      // Centre across the paved strip.
      let lo = found.along, hi = found.along;
      while (lo - found.along > -3 && fits(found.depth, lo - 0.25)) lo -= 0.25;
      while (hi - found.along < 3 && fits(found.depth, hi + 0.25)) hi += 0.25;
      const along = (lo + hi) / 2, depth = found.depth;
      report.driveways++;
      const ce = road.x + ne * depth + te * along, cn = road.n + nn * depth + tn * along;
      const random = seeded(ce, cn, 9187);
      if (random() > 0.6) continue;
      if ([...placements, ...lot].some(p => Math.hypot(p.center[0] - ce, p.center[1] - cn) < 5.5)) continue;
      const nose = random() < 0.82 ? 1 : -1, fe = ne * nose, fn = nn * nose, re = fn, rn = -fe;
      const scale = 0.95 + random() * 0.05;
      const at = (u: number, v: number) => [ce + (fe * u + re * v) * scale, cn + (fn * u + rn * v) * scale];
      const corners = [[-2.276, -1.14], [2.276, -1.14], [2.276, 1.14], [-2.276, 1.14]].map(([u, v]) => at(u, v));
      const levels = [[-1.325, -0.814], [1.325, -0.814], [1.325, 0.814], [-1.325, 0.814]].map(([u, v]) => { const [e, n] = at(u, v); return heightAt(e, n); });
      if (levels.some(h => h === undefined)) continue;
      const h = levels as number[], mean = h.reduce((a, b) => a + b, 0) / 4;
      const slope = ((h[1] + h[2]) - (h[0] + h[3])) / (4 * 1.325 * scale), cross = ((h[2] + h[3]) - (h[0] + h[1])) / (4 * 0.814 * scale);
      if (Math.hypot(slope, cross) > 0.12 || Math.abs((h[0] + h[2]) - (h[1] + h[3])) > 0.08) continue;
      if (corners.some(([e, n]) => { const y = heightAt(e, n); return y === undefined || y > mean + 0.25; })) continue;
      placements.push({ center: [ce, cn, mean + 0.016], corners, forward: [fe, fn], grade: [slope, cross], color: DRIVEWAY_PALETTE[Math.floor(random() * DRIVEWAY_PALETTE.length)], scale });
    }
    return placements;
  }

  /**
   * A brick chimney on the main ridge of most house roofs: a centre chimney
   * or one near a gable end, rising about a metre above the ridge under a cast
   * cap with a clay flue. Roofs are told apart as connected pieces of roof
   * surface; garages (a vehicle door beneath), sheds (small roofs) and very
   * large roofs get none.
   * Which houses have one, and where, is authored.
   */
  private chimneys(group: THREE.Group, inverse: THREE.Matrix4, builder: Builder, report: HouseDressingReport): void {
    const relative = new THREE.Matrix4(), p = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    const garages: number[][] = group.userData.openings?.garageDoors ?? [];
    group.traverse(object => {
      if (!(object instanceof THREE.Mesh) || object instanceof THREE.InstancedMesh) return;
      const material = Array.isArray(object.material) ? object.material[0] : object.material;
      if (material?.name !== 'V2 inferred | roof') return;
      relative.copy(inverse).multiply(object.matrixWorld);
      const position = object.geometry.getAttribute('position'), index = object.geometry.index;
      if (!position) return;
      const count = index ? index.count : position.count;
      const key = (v: THREE.Vector3) => `${Math.round(v.x * 100)},${Math.round(v.y * 100)},${Math.round(v.z * 100)}`;
      // Roofs: triangles joined through shared corners. Plan area tells a house from a garage.
      const ids = new Map<string, number>(), parent: number[] = [];
      const id = (v: THREE.Vector3): number => { const k = key(v); let i = ids.get(k); if (i === undefined) { i = parent.length; ids.set(k, i); parent.push(i); } return i; };
      const find = (i: number): number => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
      const triangles: { corner: number; area: number; x: number[]; z: number[] }[] = [];
      // A ridge is a level edge shared by two differently pitched faces that both fall away from it.
      const ridges = new Map<string, { a: THREE.Vector3; b: THREE.Vector3; corner: number; normals: THREE.Vector3[] }>();
      for (let t = 0; t + 2 < count; t += 3) {
        for (let k = 0; k < 3; k++) p[k].fromBufferAttribute(position, index ? index.getX(t + k) : t + k).applyMatrix4(relative);
        const i0 = id(p[0]), i1 = id(p[1]), i2 = id(p[2]);
        const r0 = find(i0), r1 = find(i1); if (r0 !== r1) parent[r0] = r1;
        const r2 = find(i2), r3 = find(i1); if (r2 !== r3) parent[r2] = r3;
        triangles.push({ corner: i0, area: Math.abs((p[1].x - p[0].x) * (p[2].z - p[0].z) - (p[2].x - p[0].x) * (p[1].z - p[0].z)) / 2, x: [p[0].x, p[1].x, p[2].x], z: [p[0].z, p[1].z, p[2].z] });
        const n = new THREE.Vector3().subVectors(p[1], p[0]).cross(new THREE.Vector3().subVectors(p[2], p[0]));
        if (n.lengthSq() < 1e-8) continue;
        n.normalize(); if (n.y < 0) n.negate();
        if (n.y < 0.3 || n.y > 0.97) continue;
        for (let k = 0; k < 3; k++) {
          const a = p[k], b = p[(k + 1) % 3], c = p[(k + 2) % 3];
          if (Math.abs(a.y - b.y) > 0.03 || c.y > Math.min(a.y, b.y) - 0.3) continue;
          const ka = key(a), kb = key(b), edge = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
          const ridge = ridges.get(edge);
          if (ridge) ridge.normals.push(n); else ridges.set(edge, { a: a.clone(), b: b.clone(), corner: i0, normals: [n] });
        }
      }
      const area = new Map<number, number>(), bounds = new Map<number, number[]>();
      for (const tri of triangles) {
        const root = find(tri.corner);
        area.set(root, (area.get(root) ?? 0) + tri.area);
        const b = bounds.get(root) ?? [Infinity, Infinity, -Infinity, -Infinity];
        b[0] = Math.min(b[0], ...tri.x); b[1] = Math.min(b[1], ...tri.z); b[2] = Math.max(b[2], ...tri.x); b[3] = Math.max(b[3], ...tri.z);
        bounds.set(root, b);
      }
      // A roof over a vehicle door is a garage or a house with one attached: no chimney.
      const garaged = (root: number): boolean => { const b = bounds.get(root)!; return garages.some(([x, , z]) => x > b[0] - 0.8 && x < b[2] + 0.8 && z > b[1] - 0.8 && z < b[3] + 0.8); };
      // The longest ridge of each roof carries its chimney.
      const main = new Map<number, { a: THREE.Vector3; b: THREE.Vector3; length: number }>();
      for (const ridge of ridges.values()) {
        if (ridge.normals.length !== 2 || ridge.normals[0].dot(ridge.normals[1]) > 0.9) continue;
        const length = ridge.a.distanceTo(ridge.b), root = find(ridge.corner), plan = area.get(root) ?? 0;
        if (length < 4 || plan < 62 || plan > 450 || garaged(root)) continue;
        const known = main.get(root);
        if (!known || length > known.length) main.set(root, { a: ridge.a, b: ridge.b, length });
      }
      for (const { a, b, length } of main.values()) {
        const mid = a.clone().add(b).multiplyScalar(0.5);
        const random = seeded(mid.x, mid.z, 6121);
        if (random() > 0.66) continue;
        const dir = new THREE.Vector3().subVectors(b, a).divideScalar(length);
        const t = random() < 0.45 ? 0.5 : random() < 0.5 ? 1.15 / length : 1 - 1.15 / length;
        const at = a.clone().addScaledVector(dir, length * t);
        const top = at.y + 0.85 + random() * 0.4, bottom = at.y - 1.5, along = 0.62 + random() * 0.22, across = 0.6 + random() * 0.14;
        builder.box('chimney', [at.x, (top + bottom) / 2, at.z], [dir.x, dir.z], along, top - bottom, across);
        builder.box('chimneyCap', [at.x, top + 0.04, at.z], [dir.x, dir.z], along + 0.1, 0.08, across + 0.1);
        builder.box('flue', [at.x, top + 0.16, at.z], [dir.x, dir.z], 0.22, 0.17, 0.22);
        report.chimneys++;
      }
    });
  }

  /**
   * Eaves are the level, lowest edges of pitched roof faces whose slope falls
   * away outward. A K-style gutter runs just below each, and eaves longer than
   * about four metres drop a downspout at each end to the ground.
   */
  private gutters(group: THREE.Group, inverse: THREE.Matrix4, builder: Builder, groundAt: (x: number, z: number, fallback: number) => number, report: HouseDressingReport): void {
    const relative = new THREE.Matrix4(), p = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    const spouts = new Set<string>();
    group.traverse(object => {
      if (!(object instanceof THREE.Mesh) || object instanceof THREE.InstancedMesh) return;
      const material = Array.isArray(object.material) ? object.material[0] : object.material;
      if (material?.name !== 'V2 inferred | roof') return;
      relative.copy(inverse).multiply(object.matrixWorld);
      const position = object.geometry.getAttribute('position'), index = object.geometry.index;
      if (!position) return;
      const count = index ? index.count : position.count;
      // Roof edges used by one face only are the roof's outline: sloped ones
      // are gable rakes and receive a painted rake board.
      const key = (v: THREE.Vector3) => `${Math.round(v.x * 100)},${Math.round(v.y * 100)},${Math.round(v.z * 100)}`;
      const edges = new Map<string, { a: THREE.Vector3; b: THREE.Vector3; inner: THREE.Vector3; uses: number }>();
      for (let t = 0; t + 2 < count; t += 3) {
        for (let k = 0; k < 3; k++) p[k].fromBufferAttribute(position, index ? index.getX(t + k) : t + k).applyMatrix4(relative);
        const face = new THREE.Vector3().subVectors(p[1], p[0]).cross(new THREE.Vector3().subVectors(p[2], p[0]));
        if (face.lengthSq() < 1e-8) continue;
        const slope = Math.abs(face.normalize().y);
        if (slope < 0.3 || slope > 0.97) continue;
        for (let k = 0; k < 3; k++) {
          const a = p[k], b = p[(k + 1) % 3], ka = key(a), kb = key(b), id = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
          const edge = edges.get(id);
          if (edge) edge.uses++; else edges.set(id, { a: a.clone(), b: b.clone(), inner: p[(k + 2) % 3].clone(), uses: 1 });
        }
      }
      const up = new THREE.Vector3(0, 1, 0);
      for (const edge of edges.values()) {
        if (edge.uses !== 1) continue;
        const rise = Math.abs(edge.a.y - edge.b.y), run = Math.hypot(edge.a.x - edge.b.x, edge.a.z - edge.b.z);
        if (rise < 0.25 || run < 0.3 || rise / run > 3) continue;
        const along = new THREE.Vector3().subVectors(edge.b, edge.a).normalize();
        const out = new THREE.Vector3().subVectors(edge.a, edge.inner);
        out.addScaledVector(along, -out.dot(along)).setY(0);
        if (out.lengthSq() < 1e-6) continue;
        out.normalize();
        const shift = (v: THREE.Vector3) => v.clone().addScaledVector(up, -0.1).addScaledVector(out, 0.025);
        builder.board('rake', shift(edge.a), shift(edge.b), up, 0.2, 0.035);
        report.rakeM += edge.a.distanceTo(edge.b);
      }
      for (let t = 0; t + 2 < count; t += 3) {
        for (let k = 0; k < 3; k++) p[k].fromBufferAttribute(position, index ? index.getX(t + k) : t + k).applyMatrix4(relative);
        const n = new THREE.Vector3().subVectors(p[1], p[0]).cross(new THREE.Vector3().subVectors(p[2], p[0]));
        if (n.lengthSq() < 1e-8) continue;
        n.normalize(); if (n.y < 0) n.negate();
        if (n.y < 0.3 || n.y > 0.97) continue;
        const low = Math.min(p[0].y, p[1].y, p[2].y);
        for (let k = 0; k < 3; k++) {
          const a = p[k], b = p[(k + 1) % 3];
          if (Math.abs(a.y - low) > 0.04 || Math.abs(b.y - low) > 0.04) continue;
          const length = a.distanceTo(b);
          if (length < 1.2) continue;
          // Outward: the horizontal part of the face normal (downslope direction).
          const out = new THREE.Vector3(n.x, 0, n.z).normalize();
          const dir = new THREE.Vector3().subVectors(b, a).divideScalar(length);
          if (Math.abs(dir.dot(out)) > 0.2) continue;
          const mid = a.clone().add(b).multiplyScalar(0.5).addScaledVector(out, 0.07);
          builder.box('gutter', [mid.x, mid.y - 0.07, mid.z], [dir.x, dir.z], length + 0.04, 0.12, 0.13);
          report.gutterM += length;
          if (length < 4) continue;
          for (const end of [a, b]) {
            const key = `${Math.round(end.x * 2)}_${Math.round(end.z * 2)}`;
            if (spouts.has(key)) continue;
            spouts.add(key);
            const x = end.x + out.x * 0.1 - dir.x * (end === a ? -0.15 : 0.15), z = end.z + out.z * 0.1 - dir.z * (end === a ? -0.15 : 0.15);
            const bottom = groundAt(x, z, end.y - 6) + 0.12;
            if (end.y - 0.12 - bottom < 1.5 || end.y - bottom > 14) continue;
            builder.box('gutter', [x, (end.y - 0.12 + bottom) / 2, z], [dir.x, dir.z], 0.07, end.y - 0.12 - bottom, 0.09);
            builder.box('gutter', [x + out.x * 0.12, bottom - 0.02, z + out.z * 0.12], [out.x, out.z], 0.3, 0.07, 0.08);
            report.downspouts++;
          }
        }
      }
    });
  }

  dispose(): void {
    for (const material of this.carMaterials.values()) material.dispose();
    this.carMaterials.clear();
    this.walk.dispose();
    this.shrubHigh.dispose(); this.shrubLow.dispose();
    this.shrub.dispose(); this.mulch.dispose();
    for (const material of Object.values(this.solids)) material.dispose();
  }
}
