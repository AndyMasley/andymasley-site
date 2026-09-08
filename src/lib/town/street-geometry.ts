import * as THREE from 'three';
import { PavementIndex, clipRoadPaintPolygon, roadPaintHeightAt } from './road-finish';

type Point = readonly number[];
type Polygon = number[][];
export interface StreetGeometryReport {
  version: 1; meshes: number; sourceTriangles: number; retainedTriangles: number;
  removedAreaM2: number; exteriorAreaM2: number; geometryBytes: number;
}

const cross = (a: Point, b: Point, c: Point) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
export function streetPolygonArea(p: readonly Point[]): number {
  let twice = 0;
  for (let i = 1; i + 1 < p.length; i++) twice += cross(p[0], p[i], p[i + 1]);
  return Math.abs(twice) * 0.5;
}

/** Split a convex polygon without discarding the part outside a clipping edge. */
function split(polygon: Polygon, distance: (p: Point) => number): [Polygon, Polygon] {
  const inside: Polygon = [], outside: Polygon = [];
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length], da = distance(a), db = distance(b);
    if (da >= -1e-9) inside.push(a);
    if (da <= 1e-9) outside.push(a);
    if ((da > 1e-9 && db < -1e-9) || (da < -1e-9 && db > 1e-9)) {
      const t = da / (da - db), intersection = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      inside.push(intersection); outside.push(intersection);
    }
  }
  return [inside, outside];
}

/** Polygon difference preserves separate convex pieces, so junction openings
 * do not become new diagonals spanning the shoulder that remains outside. */
export function subtractStreetPolygon(polygon: Polygon, cut: Polygon): Polygon[] {
  if (cut.length < 3 || streetPolygonArea(cut) < 1e-8) return [polygon];
  const sign = cross(cut[0], cut[1], cut[2]) >= 0 ? 1 : -1;
  let remaining = polygon;
  const pieces: Polygon[] = [];
  for (let i = 0; i < cut.length && remaining.length >= 3; i++) {
    const [inside, outside] = split(remaining, p => sign * cross(cut[i], cut[(i + 1) % cut.length], p));
    if (outside.length >= 3 && streetPolygonArea(outside) > 1e-8) pieces.push(outside);
    remaining = inside;
  }
  return pieces;
}

/** Only the overlap within the same vertical road layer is removed. An
 * overpass above a surface road must keep its own exterior shoulder. */
export function exteriorShoulderPieces(shoulder: Polygon, pavement: PavementIndex): Polygon[] {
  let pieces: Polygon[] = [shoulder.map(p => p.slice(0, 2))];
  for (const support of pavement.candidates(shoulder)) {
    let cut = clipRoadPaintPolygon(shoulder.map(p => p.slice(0, 2)), support.triangle);
    if (cut.length < 3 || streetPolygonArea(cut) < 1e-8) continue;
    const difference = (p: Point) => roadPaintHeightAt(support.triangle, p) - roadPaintHeightAt(shoulder, p);
    cut = split(cut, p => difference(p) + 0.6)[0];
    cut = split(cut, p => 0.6 - difference(p))[0];
    if (cut.length < 3 || streetPolygonArea(cut) < 1e-8) continue;
    pieces = pieces.flatMap(piece => subtractStreetPolygon(piece, cut));
    if (!pieces.length) break;
  }
  return pieces;
}

function isPavement(material: THREE.Material): boolean {
  return material.name === 'Drive road | asphalt' || material.name === 'Streetscape | parking apron asphalt'
    || !!material.userData.townRoadSurfaceType;
}

/** Resolve the exterior road edge from the actual decoded pavement. This is
 * a rendering derivative; the source archive and guided graph are untouched. */
export function applyStreetGeometry(group: THREE.Group): StreetGeometryReport {
  if (group.userData.streetGeometry) return group.userData.streetGeometry;
  const report: StreetGeometryReport = { version: 1, meshes: 0, sourceTriangles: 0, retainedTriangles: 0, removedAreaM2: 0, exteriorAreaM2: 0, geometryBytes: 0 };
  group.updateMatrixWorld(true);
  const inverseRoot = group.matrixWorld.clone().invert(), point = new THREE.Vector3();
  const roadTriangles: Polygon[] = [], targets: THREE.Mesh[] = [];
  const matrixFor = (mesh: THREE.Mesh) => inverseRoot.clone().multiply(mesh.matrixWorld);
  const triangleAt = (mesh: THREE.Mesh, offset: number, matrix: THREE.Matrix4): Polygon => {
    const p = mesh.geometry.getAttribute('position'), index = mesh.geometry.index;
    return [0, 1, 2].map(k => { point.fromBufferAttribute(p, index?.getX(offset + k) ?? offset + k).applyMatrix4(matrix); return [point.x, -point.z, point.y]; });
  };
  group.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    if (!materials.some(m => isPavement(m) || m.name === 'Drive road | weathered shoulder')) return;
    const geometry = object.geometry, p = geometry.getAttribute('position'); if (!p) return;
    const count = geometry.index?.count ?? p.count, matrix = matrixFor(object);
    for (const part of geometry.groups.length ? geometry.groups : [{ start: 0, count, materialIndex: 0 }]) {
      if (!isPavement(materials[part.materialIndex ?? 0])) continue;
      for (let i = part.start; i + 2 < Math.min(count, part.start + part.count); i += 3) {
        const triangle = triangleAt(object, i, matrix);
        if (streetPolygonArea(triangle) > 1e-8) roadTriangles.push(triangle);
      }
    }
    if (materials.some(m => m.name === 'Drive road | weathered shoulder')) targets.push(object);
  });
  const pavement = new PavementIndex(roadTriangles), obsolete = new Set<THREE.BufferGeometry>();
  for (const mesh of targets) {
    const source = mesh.geometry, material = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const count = source.index?.count ?? source.getAttribute('position').count, matrix = matrixFor(mesh);
    const attributes = Object.entries(source.attributes), values = new Map(attributes.map(([name]) => [name, [] as number[]]));
    const geometry = new THREE.BufferGeometry();
    let outputCount = 0, modified = false;
    const emit = (ids: number[], weights: number[][]) => {
      for (const weight of weights) for (const [name, attribute] of attributes) {
        const output = values.get(name)!;
        for (let k = 0; k < attribute.itemSize; k++) {
          const component = (id: number) => k === 0 ? attribute.getX(id) : k === 1 ? attribute.getY(id) : k === 2 ? attribute.getZ(id) : attribute.getW(id);
          output.push(component(ids[0]) * weight[0] + component(ids[1]) * weight[1] + component(ids[2]) * weight[2]);
        }
      }
      outputCount += weights.length;
    };
    for (const part of source.groups.length ? source.groups : [{ start: 0, count, materialIndex: 0 }]) {
      const start = outputCount;
      for (let offset = part.start; offset + 2 < Math.min(count, part.start + part.count); offset += 3) {
        const ids = [0, 1, 2].map(k => source.index?.getX(offset + k) ?? offset + k);
        if (material[part.materialIndex ?? 0]?.name !== 'Drive road | weathered shoulder') { emit(ids, [[1, 0, 0], [0, 1, 0], [0, 0, 1]]); continue; }
        const triangle = triangleAt(mesh, offset, matrix), area = streetPolygonArea(triangle);
        report.sourceTriangles++;
        if (area < 1e-8) { modified = true; continue; }
        const pieces = exteriorShoulderPieces(triangle, pavement), retained = pieces.reduce((sum, p) => sum + streetPolygonArea(p), 0);
        report.removedAreaM2 += Math.max(0, area - retained); report.exteriorAreaM2 += retained;
        if (retained >= area - 1e-7) { emit(ids, [[1, 0, 0], [0, 1, 0], [0, 0, 1]]); report.retainedTriangles++; continue; }
        modified = true;
        const [a, b, c] = triangle, det = cross(a, b, c);
        for (const piece of pieces) for (let i = 1; i + 1 < piece.length; i++) {
          const face = [piece[0], piece[i], piece[i + 1]];
          if (streetPolygonArea(face) < 1e-8) continue;
          if (cross(face[0], face[1], face[2]) * det < 0) face.reverse();
          emit(ids, face.map(p => { const u = cross(a, p, c) / det, v = cross(a, b, p) / det; return [1 - u - v, u, v]; }));
          report.retainedTriangles++;
        }
      }
      if (outputCount > start) geometry.addGroup(start, outputCount - start, part.materialIndex ?? 0);
    }
    if (!modified) { geometry.dispose(); continue; }
    for (const [name, attribute] of attributes) {
      const array = new Float32Array(values.get(name)!);
      geometry.setAttribute(name, new THREE.BufferAttribute(array, attribute.itemSize)); report.geometryBytes += array.byteLength;
    }
    geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    geometry.userData = { ...source.userData, streetExteriorDerivative: true };
    mesh.geometry = geometry; obsolete.add(source); report.meshes++;
  }
  group.traverse(object => { if (object instanceof THREE.Mesh) obsolete.delete(object.geometry); });
  obsolete.forEach(g => g.dispose());
  group.userData.streetGeometry = report;
  return report;
}
