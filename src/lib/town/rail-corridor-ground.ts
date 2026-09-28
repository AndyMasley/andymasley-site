import * as THREE from 'three';
import type { RailCorridorPacket } from './rail-corridor';
import type { V3 } from './contracts';

type Point = number[];
const cross = (a: Point, b: Point, c: Point) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
function split(poly: Point[], a: Point, b: Point, sign: number): [Point[], Point[]] {
  const inside: Point[] = [], outside: Point[] = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length], x = cross(a, b, p) * sign, y = cross(a, b, q) * sign;
    if (x >= -1e-9) inside.push(p); if (x <= 1e-9) outside.push(p);
    if (x > 1e-9 && y < -1e-9 || x < -1e-9 && y > 1e-9) {
      const t = x / (x - y), v = p.map((value, k) => value + (q[k] - value) * t); inside.push(v); outside.push(v);
    }
  }
  return [inside, outside];
}
function partition(poly: Point[], ring: Point[]): { kept: Point[][]; cut: Point[] } {
  const kept: Point[][] = [], sign = cross(ring[0], ring[1], ring[2]) >= 0 ? 1 : -1;
  for (let i = 0; i < ring.length && poly.length >= 3; i++) {
    const [inside, outside] = split(poly, ring[i], ring[(i + 1) % ring.length], sign);
    if (outside.length >= 3) kept.push(outside); poly = inside;
  }
  return { kept, cut: poly };
}
const component = (a: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, i: number, k: number): number => 'isInterleavedBufferAttribute' in a ? a.data.array[i * a.data.stride + a.offset + k] : a.array[i * a.itemSize + k];

/** Open only the inferred walk/curb pieces that obstruct the mapped rails.
 * Retained vertices, material groups and all attribute channels are preserved;
 * removed horizontal walk footprints receive flush crossing panels. */
export function openRailWalks(group: THREE.Group, origin: V3, packet: RailCorridorPacket): { panels: Point[][]; meshes: number; cutTriangles: number } {
  const domains = packet.rows.filter(r => !r.bridge).flatMap(row => row.points.slice(1).map((b, i) => {
    const a = row.points[i], at = (p: number[], v: number) => [p[0] + p[4] * v, p[1] + p[5] * v];
    const ring = [at(a, -1.6), at(a, 1.6), at(b, 1.6), at(b, -1.6)];
    return { a, b, ring, minE: Math.min(...ring.map(p => p[0])), maxE: Math.max(...ring.map(p => p[0])), minN: Math.min(...ring.map(p => p[1])), maxN: Math.max(...ring.map(p => p[1])) };
  }));
  const panels: Point[][] = [], retired = new Set<THREE.BufferGeometry>(); let meshes = 0, cutTriangles = 0;
  group.updateMatrixWorld(true); const inverseRoot = group.matrixWorld.clone().invert(), v = new THREE.Vector3(), weights = new THREE.Vector3();
  group.traverse(o => {
    if (!(o instanceof THREE.Mesh)) return;
    const materials = Array.isArray(o.material) ? o.material : [o.material], walk = (name: string) => /^Streetscape \| (?:warm|cool|repaired) sidewalk concrete$/.test(name), curb = (name: string) => name === 'Streetscape | granite curb';
    if (!materials.some(m => walk(m.name) || curb(m.name))) return;
    const old = o.geometry as THREE.BufferGeometry, position = old.getAttribute('position'); if (!position) return;
    const count = old.index?.count ?? position.count, matrix = inverseRoot.clone().multiply(o.matrixWorld), indices: number[] = [], groups: { start: number; count: number; materialIndex: number }[] = [], additions = new Map<string, number[]>();
    let added = 0, changed = false;
    const append = (q: Point, ids: number[], triangle: THREE.Vector3[]) => {
      THREE.Triangle.getBarycoord(new THREE.Vector3(q[0], q[2], -q[1]), triangle[0], triangle[1], triangle[2], weights);
      const w = [weights.x, weights.y, weights.z], id = position.count + added++;
      for (const [name, attribute] of Object.entries(old.attributes)) {
        const values = additions.get(name) ?? [];
        for (let k = 0; k < attribute.itemSize; k++) values.push(w.reduce((s, weight, j) => s + weight * component(attribute, ids[j], k), 0));
        if (name === 'normal' && !attribute.normalized) { const length = Math.hypot(...values.slice(-3)); if (length > 0) for (let k = values.length - 3; k < values.length; k++) values[k] /= length; }
        additions.set(name, values);
      }
      return id;
    };
    for (const part of old.groups.length ? old.groups : [{ start: 0, count, materialIndex: 0 }]) {
      const begin = indices.length, name = materials[part.materialIndex ?? 0]?.name ?? '';
      for (let i = part.start; i + 2 < Math.min(count, part.start + part.count); i += 3) {
        const ids = [0, 1, 2].map(k => old.index?.getX(i + k) ?? i + k);
        if (!walk(name) && !curb(name)) { indices.push(...ids); continue; }
        const face = ids.map(id => { v.fromBufferAttribute(position, id).applyMatrix4(matrix); return [v.x + origin[0], -v.z - origin[2], v.y + origin[1]]; });
        const triangle = face.map(p => new THREE.Vector3(p[0], p[2], -p[1])), originalNormal = triangle[1].clone().sub(triangle[0]).cross(triangle[2].clone().sub(triangle[0]));
        const minE = Math.min(...face.map(p => p[0])), maxE = Math.max(...face.map(p => p[0])), minN = Math.min(...face.map(p => p[1])), maxN = Math.max(...face.map(p => p[1]));
        let pieces = [face], removed = false;
        for (const d of domains) {
          if (d.maxE < minE || d.minE > maxE || d.maxN < minN || d.minN > maxN || face.every(p => Math.abs(p[2] - d.a[2]) > 1.2 && Math.abs(p[2] - d.b[2]) > 1.2)) continue;
          pieces = pieces.flatMap(poly => {
            const { kept, cut } = partition(poly, d.ring);
            const area = cut.slice(2).reduce((s, _, j) => s + new THREE.Vector3(...cut[j + 1] as V3).sub(new THREE.Vector3(...cut[0] as V3)).cross(new THREE.Vector3(...cut[j + 2] as V3).sub(new THREE.Vector3(...cut[0] as V3))).length(), 0);
            if (area < 1e-9) return [poly]; removed = true;
            if (walk(name) && Math.abs(originalNormal.y) > originalNormal.length() * .7) {
              const dx = d.b[0] - d.a[0], dn = d.b[1] - d.a[1], length2 = dx * dx + dn * dn;
              panels.push(cut.map(q => { const t = Math.max(0, Math.min(1, ((q[0] - d.a[0]) * dx + (q[1] - d.a[1]) * dn) / length2)); return [q[0], q[1], d.a[2] + (d.b[2] - d.a[2]) * t - .005]; }));
            }
            return kept;
          });
        }
        if (!removed) { indices.push(...ids); continue; }
        changed = true; cutTriangles++;
        for (const poly of pieces) for (let j = 1; j + 1 < poly.length; j++) {
          const q = [poly[0], poly[j], poly[j + 1]], points = q.map(p => new THREE.Vector3(p[0], p[2], -p[1])), normal = points[1].clone().sub(points[0]).cross(points[2].clone().sub(points[0]));
          if (normal.lengthSq() < 1e-14) continue;
          if (normal.dot(originalNormal) < 0) [q[1], q[2]] = [q[2], q[1]];
          indices.push(...q.map(p => append(p, ids, triangle)));
        }
      }
      if (indices.length > begin) groups.push({ start: begin, count: indices.length - begin, materialIndex: part.materialIndex ?? 0 });
    }
    if (!changed) return;
    const geometry = new THREE.BufferGeometry();
    for (const [name, attribute] of Object.entries(old.attributes)) {
      const Type = attribute.array.constructor as { new(length: number): typeof attribute.array }, array = new Type((position.count + added) * attribute.itemSize);
      for (let i = 0; i < attribute.count; i++) for (let k = 0; k < attribute.itemSize; k++) array[i * attribute.itemSize + k] = component(attribute, i, k);
      array.set(additions.get(name) ?? [], position.count * attribute.itemSize); geometry.setAttribute(name, new THREE.BufferAttribute(array, attribute.itemSize, attribute.normalized));
    }
    geometry.setIndex(indices); groups.forEach(g => geometry.addGroup(g.start, g.count, g.materialIndex)); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    o.geometry = geometry; retired.add(old); meshes++;
  });
  group.traverse(o => { if (o instanceof THREE.Mesh) retired.delete(o.geometry); }); retired.forEach(g => g.dispose());
  return { panels, meshes, cutTriangles };
}
