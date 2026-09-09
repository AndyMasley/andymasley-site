import * as THREE from 'three';
import index from '../../../data/derived/town/foundation-wall-index.json';
import release from '../../../data/derived/town/release.json';
import type { AssetRef } from './contracts';

type WallTarget = {
  id: string;
  outline: readonly (readonly number[])[];
  segments?: readonly (readonly number[])[];
  materialSignature?: MaterialSignature;
  base: number;
  floor?: number;
  peak: number;
  replaceBody?: boolean;
};
type Vertex = { values: number[][]; height: number };
type Face = { ids: number[]; material: THREE.Material; target?: WallTarget; heights?: number[] };
type MaterialSignature = readonly [string, readonly number[], number, number, readonly number[]];
type SourceRow = readonly [string, number, number, number, number, readonly number[]];
export type FoundationWallPacket = { version: 2; tileId: string; sourceManifestSha256: string; origin: number[]; sourceSha256: string[]; materials: MaterialSignature[]; rows: SourceRow[] };
export type FoundationWallReport = { version: 2; ids: string[]; repairedTriangles: number; splitTriangles: number; addedTriangles: number; unresolved: string[]; rejectedMeshes: number };
const assets = index.tiles as Record<string, AssetRef & { count: number }>;
export const foundationWallAsset = (tileId: string): AssetRef | undefined => assets[tileId];
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
export function validFoundationWallPacket(value: unknown, tileId: string): value is FoundationWallPacket {
  if (!value || typeof value !== 'object') return false;
  const p = value as FoundationWallPacket;
  return p.version === 2 && p.tileId === tileId && p.sourceManifestSha256 === index.sourceManifestSha256 &&
    Array.isArray(p.origin) && p.origin.length === 3 && p.origin.every(finite) &&
    Array.isArray(p.sourceSha256) && p.sourceSha256.length === 3 && p.sourceSha256.every(s => typeof s === 'string' && /^[a-f0-9]{64}$/.test(s)) &&
    Array.isArray(p.materials) && p.materials.every(m => Array.isArray(m) && m.length === 5 && WALL_NAMES.has(m[0]) && Array.isArray(m[1]) && m[1].length === 3 && m[1].every(finite) && finite(m[2]) && finite(m[3]) && Array.isArray(m[4]) && m[4].length === 2 && m[4].every(v => finite(v) && v > 0 && v <= 2)) &&
    Array.isArray(p.rows) && p.rows.length === assets[tileId]?.count && p.rows.every(r => Array.isArray(r) && r.length === 6 && typeof r[0] === 'string' && [r[1],r[2],r[3]].every(finite) && r[1] > r[2] + .04 && r[3] > r[1] && Number.isInteger(r[4]) && r[4] >= 0 && r[4] < p.materials.length && Array.isArray(r[5]) && r[5].length >= 4 && r[5].length % 4 === 0 && r[5].every(Number.isSafeInteger)) && new Set(p.rows.map(r => r[0])).size === p.rows.length;
}
export function applyFoundationWallFinish(group: THREE.Object3D, tileId: string, origin: readonly number[], level: number, sourceSha256: string, packet?: FoundationWallPacket): FoundationWallReport | { rejected: true; rejectionReason: string } | undefined {
  if (!packet) return;
  if (!validFoundationWallPacket(packet, tileId) || release.manifestSha256 !== index.sourceManifestSha256 || packet.sourceSha256[level] !== sourceSha256 || packet.origin.some((v, i) => v !== origin[i])) return { rejected: true, rejectionReason: 'Foundation wall source or origin mismatch' };
  const targets: WallTarget[] = packet.rows.map(([id, floor, base, peak, material, points]) => ({ id, floor, base, peak, outline: [], materialSignature: packet.materials[material], segments: Array.from({length: points.length / 4}, (_, i) => [points[i*4]/1000+origin[0], points[i*4+1]/1000+origin[2], points[i*4+2]/1000+origin[0], points[i*4+3]/1000+origin[2]]) }));
  return repairFoundationWalls(group, new THREE.Vector3().fromArray(origin), targets);
}
function materialMatches(material: THREE.Material, signature: MaterialSignature): boolean {
  const m = material as THREE.MeshStandardMaterial;
  return m.name === signature[0] && !!m.color && [m.color.r, m.color.g, m.color.b].every((v, i) => Math.abs(v - signature[1][i]) < 1e-6) && Math.abs(m.roughness - signature[2]) < 1e-6 && Math.abs(m.metalness - signature[3]) < 1e-6;
}
function supportDistance(row: WallTarget, x: number, z: number): number {
  if (!row.segments) return boundaryDistance(row.outline, x, -z);
  let minimum = Infinity;
  for (const [ax, az, bx, bz] of row.segments) {
    const dx = bx - ax, dz = bz - az, t = Math.max(0, Math.min(1, ((x-ax)*dx+(z-az)*dz)/(dx*dx+dz*dz || 1)));
    minimum = Math.min(minimum, Math.hypot(x-ax-t*dx, z-az-t*dz));
  }
  return minimum;
}


const WALL_NAMES = new Set(['V2 inferred | siding', 'V2 inferred | brick', 'V2 inferred | concrete_wall']);
const FOUNDATION = 'V2 inferred | foundation';

function boundaryDistance(outline: WallTarget['outline'], x: number, north: number): number {
  let minimum = Infinity;
  for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
    const a = outline[j], b = outline[i], dx = b[0] - a[0], dy = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (north - a[1]) * dy) / (dx * dx + dy * dy || 1)));
    minimum = Math.min(minimum, Math.hypot(x - a[0] - t * dx, north - a[1] - t * dy));
  }
  return minimum;
}

function clip(vertices: Vertex[], height: number, above: boolean): Vertex[] {
  const result: Vertex[] = [];
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    const a = vertices[j], b = vertices[i], insideA = above ? a.height >= height : a.height <= height;
    const insideB = above ? b.height >= height : b.height <= height;
    if (insideA !== insideB) {
      const t = (height - a.height) / (b.height - a.height);
      result.push({ height, values: a.values.map((attribute, k) => attribute.map((value, c) => value + (b.values[k][c] - value) * t)) });
    }
    if (insideB) result.push(b);
  }
  return result;
}

/** The frozen inferred bodies assigned some entire base-to-eave triangles to
 * foundation. Split only those registered vertical walls at their retained floor
 * plane. No normal, roof, footprint, stair, measured or protected body is moved. */
export function repairFoundationWalls(group: THREE.Object3D, origin: THREE.Vector3, targets: readonly WallTarget[]): FoundationWallReport {
  if (group.userData.foundationWallFinish) return group.userData.foundationWallFinish as FoundationWallReport;
  const rows = targets.filter(r => !r.replaceBody && Number.isFinite(r.floor) && r.floor! > r.base + .04 && r.floor! < r.peak - .2);
  const report: FoundationWallReport = { version: 2, ids: [], repairedTriangles: 0, splitTriangles: 0, addedTriangles: 0, unresolved: [], rejectedMeshes: 0 };
  if (!rows.length) return report;
  group.updateMatrixWorld(true);
  const meshes: THREE.Mesh[] = [], sources = new Set<THREE.Material>();
  const grid = new Map<string, WallTarget[]>(), ownWalls = new Map<string, Set<THREE.Material>>();
  for (const row of rows) {
    const points = row.segments?.flatMap(s => [[s[0],s[1]],[s[2],s[3]]]) ?? row.outline.map(p => [p[0],-p[1]]);
    const xs = points.map(p => p[0]), zs = points.map(p => p[1]);
    for (let x=Math.floor((Math.min(...xs)-.1)/32);x<=Math.floor((Math.max(...xs)+.1)/32);x++) for (let z=Math.floor((Math.min(...zs)-.1)/32);z<=Math.floor((Math.max(...zs)+.1)/32);z++) { const key=x+','+z; const cell=grid.get(key)??[];cell.push(row);grid.set(key,cell); }
  }
  group.traverse(o => {
    if (!(o instanceof THREE.Mesh) || o.userData.townCrafted) return;
    const materials = Array.isArray(o.material) ? o.material : [o.material];
    materials.forEach(m => sources.add(m));
    if (materials.some(m => m.name === FOUNDATION || WALL_NAMES.has(m.name))) meshes.push(o);
  });
  const foundation = [...sources].find(m => m.name === FOUNDATION);
  if (!foundation) return report;
  const wallById = new Map<string, THREE.Material>();
  for (const row of rows) if (row.materialSignature) { const matches = [...sources].filter(m => materialMatches(m, row.materialSignature!)); if (matches.length) wallById.set(row.id, matches[0]); }
  const prepared = new Map<THREE.Mesh, Face[]>(), affected = new Set<string>(), point = new THREE.Vector3();
  for (const mesh of meshes) {
    const geometry = mesh.geometry, position = geometry.getAttribute('position'), index = geometry.index;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material], faces: Face[] = [];
    const count = index?.count ?? position.count;
    for (const part of geometry.groups.length ? geometry.groups : [{ start: 0, count, materialIndex: 0 }]) {
      const material = materials[part.materialIndex ?? 0];
      for (let i = part.start; i < part.start + part.count; i += 3) {
        const ids = [0, 1, 2].map(k => index ? index.getX(i + k) : i + k), face: Face = { ids, material };
        faces.push(face);
        if (material.name !== FOUNDATION && !WALL_NAMES.has(material.name)) continue;
        const vertices = ids.map(id => point.fromBufferAttribute(position, id).applyMatrix4(mesh.matrixWorld).add(origin).clone());
        const normal = vertices[1].clone().sub(vertices[0]).cross(vertices[2].clone().sub(vertices[0]));
        if (normal.lengthSq() < 1e-12 || Math.abs(normal.normalize().y) > .025) continue;
        const center = vertices.reduce((sum, v) => sum.add(v), new THREE.Vector3()).multiplyScalar(1 / 3);
        const candidates = (grid.get(Math.floor(center.x/32)+','+Math.floor(center.z/32)) ?? []).filter(r => center.y >= r.base - .01 && center.y <= r.peak + .01 &&
          supportDistance(r, center.x, center.z) < .003 && vertices.every(v => supportDistance(r, v.x, v.z) < .003));
        if (candidates.length !== 1) continue;
        face.target = candidates[0]; face.heights = vertices.map(v => v.y);
        if (WALL_NAMES.has(material.name)) { const set=ownWalls.get(face.target.id)??new Set<THREE.Material>();set.add(material);ownWalls.set(face.target.id,set); }
        if (material.name === FOUNDATION && Math.max(...face.heights) > face.target.floor! + .20) affected.add(face.target.id);
      }
    }
    prepared.set(mesh, faces);
  }
  for (const id of affected) if (!wallById.has(id)) { const own = [...(ownWalls.get(id) ?? [])]; if (!rows.find(r => r.id === id)?.materialSignature && own.length === 1) wallById.set(id, own[0]); else report.unresolved.push(id); }
  report.rejectedMeshes = report.unresolved.length;
  const retired = new Set<THREE.BufferGeometry>();
  for (const [mesh, faces] of prepared) {
    const corrections = faces.filter(f => f.target && affected.has(f.target.id) && wallById.has(f.target.id) &&
      (f.material.name === FOUNDATION ? Math.max(...f.heights!) > f.target.floor! + .00001 : Math.min(...f.heights!) < f.target.floor! - .00001));
    if (!corrections.length) continue;
    const change = new Set(corrections), original = mesh.geometry, attributes = Object.entries(original.attributes);
    const positionIndex = attributes.findIndex(([name]) => name === 'position'), normalIndex = attributes.findIndex(([name]) => name === 'normal'), uvIndex = attributes.findIndex(([name]) => name === 'uv');
    const buckets = new Map<THREE.Material, number[][]>();
    const append = (material: THREE.Material, vertices: Vertex[], retainSource = false, uvScale: readonly number[] = [1,1]) => {
      if (vertices.length < 3) return 0;
      let count = 0;
      const values = buckets.get(material) ?? attributes.map(() => []);
      for (let i = 1; i < vertices.length - 1; i++) {
        const tri = [vertices[0], vertices[i], vertices[i + 1]];
        const a = new THREE.Vector3().fromArray(tri[0].values[positionIndex].map(Math.fround)), b = new THREE.Vector3().fromArray(tri[1].values[positionIndex].map(Math.fround)), c = new THREE.Vector3().fromArray(tri[2].values[positionIndex].map(Math.fround));
        if (!retainSource) {
          const cross = b.sub(a).cross(c.sub(a));
          if (cross.lengthSq() < 1e-16 || normalIndex >= 0 && cross.dot(new THREE.Vector3().fromArray(tri[0].values[normalIndex])) < cross.length() * .99) continue;
        }
        for (const v of tri) v.values.forEach((attribute, k) => values[k].push(...(k === uvIndex ? attribute.map((v, axis) => v * uvScale[axis]) : attribute)));
        count++;
      }
      buckets.set(material, values); return count;
    };
    for (const face of faces) {
      const vertices = face.ids.map((id, i) => ({ height: face.heights?.[i] ?? 0, values: attributes.map(([, attribute]) =>
        Array.from({ length: attribute.itemSize }, (_, k) => [attribute.getX, attribute.getY, attribute.getZ, attribute.getW][k].call(attribute, id))) }));
      if (!change.has(face)) { append(face.material, vertices, true); continue; }
      const floor = face.target!.floor!;
      const upper = clip(vertices, floor, true), lower = clip(vertices, floor, false);
      const scale = face.target!.materialSignature?.[4] ?? [1,1];
      const emitted = append(face.material.name === FOUNDATION ? wallById.get(face.target!.id)! : face.material, upper, false, face.material.name === FOUNDATION ? scale : [1,1]) + append(foundation, lower, false, face.material.name === FOUNDATION ? [1,1] : scale.map(v => 1/v));
      report.repairedTriangles++; report.addedTriangles += emitted - 1;
      if (upper.length >= 3 && lower.length >= 3) report.splitTriangles++;
    }
    const geometry = new THREE.BufferGeometry(), materials: THREE.Material[] = [], values = attributes.map(() => [] as number[]);
    let cursor = 0;
    for (const [material, data] of buckets) {
      const count = data[positionIndex].length / 3;
      if (!count) continue;
      geometry.addGroup(cursor, count, materials.length); materials.push(material); cursor += count;
      data.forEach((attribute, k) => { for (const value of attribute) values[k].push(value); });
    }
    attributes.forEach(([name, source], k) => geometry.setAttribute(name, new THREE.Float32BufferAttribute(values[k], source.itemSize)));
    geometry.userData = { ...original.userData, foundationWallMaterialSplit: true };
    geometry.computeBoundingBox(); geometry.computeBoundingSphere(); mesh.geometry = geometry; mesh.material = materials; retired.add(original);
  }
  const retained = new Set<THREE.BufferGeometry>(); group.traverse(o => { if (o instanceof THREE.Mesh) retained.add(o.geometry); });
  retired.forEach(g => { if (!retained.has(g)) g.dispose(); });
  report.ids = [...affected].filter(id => wallById.has(id)).sort(); group.userData.foundationWallFinish = report;
  return report;
}
