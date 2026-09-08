import * as THREE from 'three';

type WallTarget = {
  id: string;
  outline: readonly (readonly number[])[];
  base: number;
  floor?: number;
  peak: number;
  replaceBody?: boolean;
};
type Vertex = { values: number[][]; height: number };
type Face = { ids: number[]; material: THREE.Material; target?: WallTarget; heights?: number[] };
export type FoundationWallReport = { version: 1; ids: string[]; repairedTriangles: number; splitTriangles: number; addedTriangles: number };

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
  const report: FoundationWallReport = { version: 1, ids: [], repairedTriangles: 0, splitTriangles: 0, addedTriangles: 0 };
  if (!rows.length) return report;
  group.updateMatrixWorld(true);
  const meshes: THREE.Mesh[] = [], sources = new Map<string, THREE.Material>();
  group.traverse(o => {
    if (!(o instanceof THREE.Mesh) || o.userData.townCrafted) return;
    const materials = Array.isArray(o.material) ? o.material : [o.material];
    materials.forEach(m => sources.set(m.name, m));
    if (materials.some(m => m.name === FOUNDATION || WALL_NAMES.has(m.name))) meshes.push(o);
  });
  const foundation = sources.get(FOUNDATION), wall = [...sources.values()].find(m => WALL_NAMES.has(m.name));
  if (!foundation || !wall) return report;
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
        const candidates = rows.filter(r => center.y >= r.base - .01 && center.y <= r.peak + .01 &&
          boundaryDistance(r.outline, center.x, -center.z) < .025 && vertices.every(v => boundaryDistance(r.outline, v.x, -v.z) < .08));
        if (candidates.length !== 1) continue;
        face.target = candidates[0]; face.heights = vertices.map(v => v.y);
        if (material.name === FOUNDATION && Math.max(...face.heights) > face.target.floor! + .20) affected.add(face.target.id);
      }
    }
    prepared.set(mesh, faces);
  }
  const retired = new Set<THREE.BufferGeometry>();
  for (const [mesh, faces] of prepared) {
    const corrections = faces.filter(f => f.target && affected.has(f.target.id) &&
      (f.material.name === FOUNDATION ? Math.max(...f.heights!) > f.target.floor! + .00001 : Math.min(...f.heights!) < f.target.floor! - .00001));
    if (!corrections.length) continue;
    const change = new Set(corrections), original = mesh.geometry, attributes = Object.entries(original.attributes);
    const positionIndex = attributes.findIndex(([name]) => name === 'position');
    const buckets = new Map<THREE.Material, number[][]>();
    const append = (material: THREE.Material, vertices: Vertex[], retainSource = false) => {
      if (vertices.length < 3) return 0;
      let count = 0;
      const values = buckets.get(material) ?? attributes.map(() => []);
      for (let i = 1; i < vertices.length - 1; i++) {
        const tri = [vertices[0], vertices[i], vertices[i + 1]];
        const a = new THREE.Vector3().fromArray(tri[0].values[positionIndex]), b = new THREE.Vector3().fromArray(tri[1].values[positionIndex]), c = new THREE.Vector3().fromArray(tri[2].values[positionIndex]);
        if (!retainSource && b.sub(a).cross(c.sub(a)).lengthSq() < 1e-16) continue;
        for (const v of tri) v.values.forEach((attribute, k) => values[k].push(...attribute));
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
      const emitted = append(face.material.name === FOUNDATION ? wall : face.material, upper) + append(foundation, lower);
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
  report.ids = [...affected].sort(); group.userData.foundationWallFinish = report;
  return report;
}
