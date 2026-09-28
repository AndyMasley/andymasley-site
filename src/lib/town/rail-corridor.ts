import * as THREE from 'three';
import index from '../../../data/derived/town/rail-corridor-index.json';
import release from '../../../data/derived/town/release.json';
import { tileGround } from './address-frontage';
import { PavementIndex, roadPaintHeightAt } from './road-finish';
import { registerHardscapeGrassExclusions } from './hardscape-grass-exclusions';
import { openRailWalks } from './rail-corridor-ground';
import { applyTerrainFinish, validTerrainFinishPacket, type TerrainFinishPacket } from './terrain-finish';
import type { AssetRef, V3 } from './contracts';

/** East, north, base rail elevation, station, left-normal E/N; production
 * packets also carry global left/right toe ground and left/right rail tops. */
export type RailPoint = [number, number, number, number, number, number, ...number[]];
export interface RailCorridorPacket {
  version: 1; tileId: string; origin: number[]; sourceManifestSha256: string;
  sourceRailwaySha256: string; sourceLods: Record<string, string>;
  extraBounds?: number[][];
  terrain?: TerrainFinishPacket;
  rows: { wayId: number; bridge: boolean; points: RailPoint[] }[];
}
export type RailCorridorReport = {
  status: 'applied' | 'source-mismatch' | 'no-support'; rejected: boolean;
  segments: number; ties: number; bridges: number; triangles: number; geometryBytes: number;
};
type Vertex = [number, number, number]; // east, north, elevation
type Kind = 'ballast' | 'timber ties' | 'rusted steel' | 'running surface' | 'bridge structure' | 'crossing panels';
const colors: Record<Kind, string> = { ballast: '#656458', 'timber ties': '#443d31', 'rusted steel': '#685347', 'running surface': '#88938e', 'bridge structure': '#414a46', 'crossing panels': '#474b48' };
const finite = (v: unknown, n: number): v is number[] => Array.isArray(v) && v.length === n && v.every(Number.isFinite);
export const railCorridorAsset = (id: string): AssetRef | undefined => (index.tiles as Record<string, AssetRef>)[id];

export function validRailCorridorPacket(value: unknown, tileId: string): value is RailCorridorPacket {
  const p = value as RailCorridorPacket | undefined, [e, n] = tileId.split('_').map(Number);
  return !!p && p.version === 1 && p.tileId === tileId && finite(p.origin, 3)
    && p.origin[0] === e * 250 && p.origin[1] === 0 && p.origin[2] === -n * 250
    && p.sourceManifestSha256 === index.sourceManifestSha256 && p.sourceRailwaySha256 === index.sourceRailwaySha256
    && !!p.sourceLods && Object.keys(p.sourceLods).length === 3 && ['0', '1', '2'].every(k => /^[a-f0-9]{64}$/.test(p.sourceLods[k]))
    && (p.extraBounds === undefined || Array.isArray(p.extraBounds) && p.extraBounds.length <= 4 && p.extraBounds.every(b => finite(b, 4) && b[0] < b[2] && b[1] < b[3] && b[2] - b[0] <= 250 && b[3] - b[1] <= 250))
    && (p.terrain === undefined || validTerrainFinishPacket(p.terrain, tileId))
    && Array.isArray(p.rows) && p.rows.length > 0 && p.rows.length < 100 && p.rows.every(r => r && Number.isSafeInteger(r.wayId) && typeof r.bridge === 'boolean'
      && Array.isArray(r.points) && r.points.length >= 2 && r.points.length < 10000 && r.points.every((q, i) => (finite(q, 6) || finite(q, 8) || finite(q, 10))
        && q.length === r.points[0].length && q.slice(6).every(h => h > -100 && h < 1000)
        && q[2] > -100 && q[2] < 1000 && q[3] >= 0 && q[3] <= 20000 && Math.abs(Math.hypot(q[4], q[5]) - 1) < .001
        && [[e * 250, n * 250, (e + 1) * 250, (n + 1) * 250], ...(p.extraBounds ?? [])].some(b => q[0] >= b[0] - 10 && q[0] <= b[2] + 10 && q[1] >= b[1] - 10 && q[1] <= b[3] + 10)
        && (i === 0 || q[3] > r.points[i - 1][3] && q[3] - r.points[i - 1][3] < 500
          && Math.hypot(q[0] - r.points[i - 1][0], q[1] - r.points[i - 1][1]) > .00001
          && Math.abs(q[3] - r.points[i - 1][3] - Math.hypot(q[0] - r.points[i - 1][0], q[1] - r.points[i - 1][1])) < .5)))
    && p.rows.reduce((sum, r) => sum + r.points.at(-1)![3] - r.points[0][3], 0) < 2500;
}

function split(poly: Vertex[], distance: (p: Vertex) => number): [Vertex[], Vertex[]] {
  const inside: Vertex[] = [], outside: Vertex[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], x = distance(a), y = distance(b);
    if (x >= -1e-9) inside.push(a); if (x <= 1e-9) outside.push(a);
    if (x > 1e-9 && y < -1e-9 || x < -1e-9 && y > 1e-9) {
      const t = x / (x - y), q = a.map((v, k) => v + (b[k] - v) * t) as Vertex;
      inside.push(q); outside.push(q);
    }
  }
  return [inside, outside];
}
const cross = (a: number[], b: number[], c: number[]) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
function subtract(poly: Vertex[], clip: number[][]): Vertex[][] {
  const sign = cross(clip[0], clip[1], clip[2]) >= 0 ? 1 : -1, kept: Vertex[][] = [];
  for (let i = 0; i < clip.length && poly.length >= 3; i++) {
    const [inside, outside] = split(poly, q => sign * cross(clip[i], clip[(i + 1) % clip.length], q));
    if (outside.length >= 3) kept.push(outside); poly = inside;
  }
  return kept;
}
function pavement(group: THREE.Group, origin: V3): PavementIndex {
  const triangles: number[][][] = [], v = new THREE.Vector3();
  group.updateMatrixWorld(true); const inverse = group.matrixWorld.clone().invert();
  group.traverse(o => {
    if (!(o instanceof THREE.Mesh)) return;
    const g = o.geometry, p = g.getAttribute('position'), mats = Array.isArray(o.material) ? o.material : [o.material];
    if (!p) return; const count = g.index?.count ?? p.count, matrix = inverse.clone().multiply(o.matrixWorld);
    for (const part of g.groups.length ? g.groups : [{ start: 0, count, materialIndex: 0 }]) {
      const m = mats[part.materialIndex ?? 0];
      if (!m || !(m.name === 'Drive road | asphalt' || m.userData.townRoadSurfaceType === 5 || /sidewalk concrete$|asphalt apron$|parking apron asphalt$/.test(m.name))) continue;
      for (let i = part.start; i + 2 < Math.min(count, part.start + part.count); i += 3) {
        const tri = [0, 1, 2].map(k => { v.fromBufferAttribute(p, g.index?.getX(i + k) ?? i + k).applyMatrix4(matrix); return [v.x + origin[0], -v.z - origin[2], v.y + origin[1]]; });
        if (Math.abs(cross(tri[0], tri[1], tri[2])) > .000001) triangles.push(tri);
      }
    }
  });
  return new PavementIndex(triangles);
}
function onTriangle(q: number[], tri: number[][]): boolean {
  const sides = [cross(tri[0], tri[1], q), cross(tri[1], tri[2], q), cross(tri[2], tri[0], q)];
  return sides.every(v => v >= -1e-7) || sides.every(v => v <= 1e-7);
}
function material(kind: Kind): THREE.MeshStandardMaterial {
  const metal = kind === 'running surface' || kind === 'rusted steel' || kind === 'bridge structure';
  const m = new THREE.MeshStandardMaterial({ color: colors[kind], roughness: kind === 'running surface' ? .47 : .92, metalness: metal ? .45 : 0, envMapIntensity: kind === 'running surface' ? .28 : .12 });
  m.name = `Rail corridor | ${kind}`; m.userData.townCrafted = true; m.userData.railRole = kind;
  if (kind === 'running surface') { m.polygonOffset = true; m.polygonOffsetFactor = -1; m.polygonOffsetUnits = -1; }
  if (kind === 'ballast' || kind === 'timber ties') {
    m.onBeforeCompile = shader => {
      shader.vertexShader = 'varying vec3 vRailPoint;\n' + shader.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvRailPoint=(modelMatrix*vec4(transformed,1.)).xyz;');
      shader.fragmentShader = 'varying vec3 vRailPoint;\n' + shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>\nvec2 railGrain=floor(vRailPoint.xz*${kind === 'ballast' ? '32.' : 'vec2(9.,95.)'});\nfloat railNoise=fract(sin(dot(railGrain,vec2(127.1,311.7)))*43758.5453);\nfloat railDetail=1.-smoothstep(.04,.15,length(fwidth(vRailPoint.xz)));\ndiffuseColor.rgb*=mix(1.,.73+.52*railNoise,railDetail);`);
    };
    m.customProgramCacheKey = () => `rail-corridor-${kind}-v1`;
  }
  return m;
}

/** The centerline and station originate in one continuous source path. Every
 * emitted face is clipped to its tile, including sleepers straddling seams. */
export function applyRailCorridor(group: THREE.Group, tileId: string, origin: V3, level: number, sourceSha256: string, packet?: RailCorridorPacket): RailCorridorReport | undefined {
  if (!packet) return;
  if (group.userData.railCorridor) return group.userData.railCorridor;
  const report: RailCorridorReport = { status: 'source-mismatch', rejected: true, segments: 0, ties: 0, bridges: 0, triangles: 0, geometryBytes: 0 };
  if (!validRailCorridorPacket(packet, tileId) || packet.sourceManifestSha256 !== release.manifestSha256 || packet.sourceLods[String(level)] !== sourceSha256 || packet.origin.some((v, i) => v !== origin[i])) return report;
  if (packet.terrain) {
    const terrain = applyTerrainFinish(group, tileId, origin, level, packet.terrain, 'railTerrain', { raise: 0, lower: 5.5, footprintToleranceM2: .0001 });
    if (terrain.rejected) return report;
  }
  const walks = openRailWalks(group, origin, packet), ground = tileGround(group, origin, 0), originalRoad = pavement(group, origin);
  const road = new PavementIndex([...originalRoad.triangles, ...walks.panels.flatMap(p => p.slice(2).map((_, i) => [p[0], p[i + 1], p[i + 2]]))]);
  const chunks = new Map<Kind, { p: number[]; n: number[] }>();
  const cores = [[origin[0], -origin[2], origin[0] + 250, -origin[2] + 250], ...(packet.extraBounds ?? [])];
  const bounds = [Math.min(...cores.map(b => b[0])), Math.min(...cores.map(b => b[1])), Math.max(...cores.map(b => b[2])), Math.max(...cores.map(b => b[3]))], exclusions: number[][][] = [];
  const clipCore = (poly: Vertex[], bounds: number[]) => {
    for (const f of [(p: Vertex) => p[0] - bounds[0], (p: Vertex) => bounds[2] - p[0], (p: Vertex) => p[1] - bounds[1], (p: Vertex) => bounds[3] - p[1]]) poly = split(poly, f)[0];
    return poly;
  };
  const removePaving = (poly: Vertex[]): Vertex[][] => {
    let pieces = [poly];
    for (const { triangle } of road.candidates(poly)) {
      const near = poly.some(q => Math.abs(roadPaintHeightAt(triangle, q) - q[2]) < 1.2);
      if (near) pieces = pieces.flatMap(p => subtract(p, triangle));
    }
    return pieces;
  };
  const emit = (kind: Kind, poly: Vertex[], hint: THREE.Vector3, avoidRoad = false): void => {
    const clipped = cores.map(bounds => clipCore(poly, bounds)).filter(p => p.length >= 3);
    if (!clipped.length) return;
    const chunk = chunks.get(kind) ?? { p: [], n: [] }; chunks.set(kind, chunk);
    for (const shape of avoidRoad ? clipped.flatMap(removePaving) : clipped) for (let i = 1; i + 1 < shape.length; i++) {
      // Judge area and normals at the precision actually uploaded to the GPU;
      // tiny clipped remainders can collapse after Float32 conversion.
      const q = [shape[0], shape[i], shape[i + 1]], v = q.map(p => new THREE.Vector3(Math.fround(p[0] - origin[0]), Math.fround(p[2] - origin[1]), Math.fround(-p[1] - origin[2])));
      const normal = v[1].clone().sub(v[0]).cross(v[2].clone().sub(v[0])); if (normal.lengthSq() < 1e-14) continue;
      if (normal.dot(hint) < 0) { [v[1], v[2]] = [v[2], v[1]]; normal.negate(); }
      normal.normalize(); v.forEach(p => chunk.p.push(p.x, p.y, p.z)); for (let k = 0; k < 3; k++) chunk.n.push(normal.x, normal.y, normal.z);
    }
  };
  const up = new THREE.Vector3(0, 1, 0), down = new THREE.Vector3(0, -1, 0);
  walks.panels.forEach(p => emit('crossing panels', p as Vertex[], up));
  group.userData.railWalks = { meshes: walks.meshes, cutTriangles: walks.cutTriangles, panels: walks.panels.length };
  const lerp = (a: RailPoint, b: RailPoint, t: number): RailPoint => a.map((v, k) => v + (b[k] - v) * t) as RailPoint;
  const railHeight = (p: RailPoint, lateral: number, bridge: boolean): number => {
    if (bridge) return p[2];
    if (p.length === 10) return (p[8] + p[9]) / 2 + (p[8] - p[9]) * lateral / 1.5;
    const q = [p[0] + p[4] * lateral, p[1] + p[5] * lateral];
    const surfaces = road.candidates([q]).filter(s => onTriangle(q, s.triangle)).map(s => roadPaintHeightAt(s.triangle, q)).filter(h => Math.abs(h - p[2]) < 1.2);
    return surfaces.length ? Math.max(...surfaces) + .007 : p[2];
  };
  const at = (p: RailPoint, lateral: number, vertical: number, bridge: boolean): Vertex => [p[0] + p[4] * lateral, p[1] + p[5] * lateral, railHeight(p, lateral, bridge) + vertical];
  const prism = (kind: Kind, a: RailPoint, b: RailPoint, left: number, right: number, bottom: number, top: number, bridge: boolean, avoidRoad = false, cap = false) => {
    const al = at(a, left, top, bridge), ar = at(a, right, top, bridge), bl = at(b, left, top, bridge), br = at(b, right, top, bridge);
    const ald = at(a, left, bottom, bridge), ard = at(a, right, bottom, bridge), bld = at(b, left, bottom, bridge), brd = at(b, right, bottom, bridge);
    emit(kind, [al, ar, br, bl], up, avoidRoad); emit(kind, [ald, ard, brd, bld], down, avoidRoad);
    emit(kind, [al, ald, bld, bl], new THREE.Vector3(-a[4], 0, a[5]), avoidRoad);
    emit(kind, [ar, ard, brd, br], new THREE.Vector3(a[4], 0, -a[5]), avoidRoad);
    if (cap) {
      const along = new THREE.Vector3(b[0] - a[0], b[2] - a[2], a[1] - b[1]);
      emit(kind, [al, ar, ard, ald], along.clone().negate(), avoidRoad);
      emit(kind, [bl, br, brd, bld], along, avoidRoad);
    }
  };
  const countedBridges = new Set<number>();
  for (const row of packet.rows) for (let i = 1; i < row.points.length; i++) {
    const a = row.points[i - 1], b = row.points[i], length = b[3] - a[3];
    if (Math.max(a[0], b[0]) + 2.4 < bounds[0] || Math.min(a[0], b[0]) - 2.4 > bounds[2] || Math.max(a[1], b[1]) + 2.4 < bounds[1] || Math.min(a[1], b[1]) - 2.4 > bounds[3]) continue;
    report.segments++;
    const domain = [at(a, -2.3, 0, row.bridge), at(a, 2.3, 0, row.bridge), at(b, 2.3, 0, row.bridge), at(b, -2.3, 0, row.bridge)];
    for (const core of cores) { const exclusion = clipCore(domain, core).map(p => p.slice(0, 2)); if (exclusion.length >= 3) exclusions.push(exclusion); }
    if (!row.bridge) {
      emit('ballast', [at(a, -1.45, -.20, false), at(a, 1.45, -.20, false), at(b, 1.45, -.20, false), at(b, -1.45, -.20, false)], up, true);
      for (const sign of [-1, 1]) {
        const toe = (p: RailPoint): Vertex => { const q = at(p, sign * 2.3, -.34, false), h = p[sign > 0 ? 6 : 7] ?? ground(q[0], q[1]); q[2] = Math.min(railHeight(p, sign * 1.45, false) - .205, h === undefined ? q[2] : h + .006); return q; };
        emit('ballast', [at(a, sign * 1.45, -.20, false), toe(a), toe(b), at(b, sign * 1.45, -.20, false)], up, true);
      }
    } else {
      countedBridges.add(row.wayId);
      prism('bridge structure', a, b, -1.3, 1.3, -.72, -.25, true);
      for (const side of [-1, 1]) prism('bridge structure', a, b, side * 1.22 - .075, side * 1.22 + .075, -1.05, -.20, true);
    }
    for (const side of [-1, 1]) {
      const center = side * (1.435 / 2 + .065 / 2);
      prism('running surface', a, b, center - .0325, center + .0325, -.035, 0, row.bridge);
      if (level < 2) {
        prism('rusted steel', a, b, center - .009, center + .009, -.135, -.035, row.bridge, true);
        prism('rusted steel', a, b, center - .065, center + .065, -.15, -.135, row.bridge, true);
      }
    }
    for (let station = Math.ceil((a[3] - 1e-8) / .61) * .61; station < b[3] - 1e-8; station += .61) {
      const t = (station - a[3]) / length, p = lerp(a, b, t), dx = (b[0] - a[0]) / length, dn = (b[1] - a[1]) / length;
      const start = [...p] as RailPoint, end = [...p] as RailPoint;
      start[0] -= dx * .12; start[1] -= dn * .12; end[0] += dx * .12; end[1] += dn * .12;
      const foot = [at(start, -1.3, -.14, row.bridge), at(start, 1.3, -.14, row.bridge), at(end, 1.3, -.14, row.bridge), at(end, -1.3, -.14, row.bridge)];
      const total = Math.abs(cross(foot[0], foot[1], foot[2])) + Math.abs(cross(foot[0], foot[2], foot[3]));
      const kept = removePaving(foot).reduce((s, r) => s + r.slice(2).reduce((v, _, j) => v + Math.abs(cross(r[0], r[j + 1], r[j + 2])), 0), 0);
      if (!row.bridge && kept < total - .00001) continue;
      if (level === 2) emit('timber ties', foot, up); else prism('timber ties', start, end, -1.3, 1.3, -.265, -.14, row.bridge, false, true);
      report.ties++;
    }
  }
  const built = new THREE.Group(); built.name = 'Norwich Branch continuous railway';
  for (const [kind, chunk] of chunks) {
    if (!chunk.p.length) continue;
    const geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(chunk.p, 3)).setAttribute('normal', new THREE.Float32BufferAttribute(chunk.n, 3));
    geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, material(kind)); mesh.name = `Rail corridor | ${kind}`; mesh.receiveShadow = true; mesh.castShadow = kind !== 'ballast';
    mesh.userData.townCrafted = true; mesh.userData.sourceIds = [...new Set(packet.rows.map(r => String(r.wayId)))]; built.add(mesh);
    report.triangles += chunk.p.length / 9; report.geometryBytes += (chunk.p.length + chunk.n.length) * 4;
  }
  report.status = report.segments ? 'applied' : 'no-support'; report.rejected = false; report.bridges = countedBridges.size;
  group.add(built); registerHardscapeGrassExclusions(group, exclusions);
  group.userData.environmentTreeExclusions = [...(group.userData.environmentTreeExclusions ?? []), ...exclusions];
  group.userData.railCorridor = report; return report;
}
