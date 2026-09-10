import * as THREE from 'three';

export const TRUNK_CONTACT_SOURCE_SHA256 = '2b8f76d7ea1a104974b6acebf63ac62738ce0a7f99063741d686ff577beb36b9';
export const TRUNK_CONTACT_BASIS = 'VC-0167: authored modest trunk-foot flare within the retained source trunk footprint. Existing tree anchors, ground and crown join heights stay fixed; no surveyed trunk dimensions or species are asserted.';
const owned = new WeakMap<THREE.Group, THREE.BufferGeometry>();

/** One shared closed trunk, replacing the fixed octagonal straight prototype.
 * Six original perimeter points retain all four extrema while staying inside
 * the source foot. Three rings give a short flare and tapered shaft: 32 faces
 * versus the source 28, with fewer vertices. Textures/materials stay borrowed. */
export function createTrunkContactPrototype(base: THREE.Group): THREE.Group {
  base.updateMatrixWorld(true);
  const meshes: THREE.Mesh[] = [];
  base.traverse(object => { if (object instanceof THREE.Mesh) meshes.push(object); });
  if (meshes.length !== 1) throw new Error('Trunk contact requires the fixed single trunk primitive.');
  const source = meshes[0], materials = Array.isArray(source.material) ? source.material : [source.material];
  const position = source.geometry.getAttribute('position');
  if (!position || position.count !== 36 || source.geometry.index?.count !== 84 ||
      !source.geometry.getAttribute('uv') || materials.some(m => !/trunk|bark/i.test(m.name))) {
    throw new Error('Trunk contact requires the retained 28-triangle bark prototype.');
  }
  const points = Array.from({ length: position.count }, (_, i) => new THREE.Vector3().fromBufferAttribute(position, i).applyMatrix4(source.matrixWorld));
  const bounds = new THREE.Box3().setFromPoints(points), size = bounds.getSize(new THREE.Vector3()), center = bounds.getCenter(new THREE.Vector3());
  if (![...bounds.min, ...bounds.max, ...size].every(Number.isFinite) || Math.min(size.x, size.y, size.z) <= 0 ||
      points.some(p => Math.min(Math.abs(p.y - bounds.min.y), Math.abs(p.y - bounds.max.y)) > 1e-5)) {
    throw new Error('Trunk contact requires finite straight two-ring source geometry.');
  }
  const lower = new Map<string, THREE.Vector3>();
  for (const point of points) if (Math.abs(point.y - bounds.min.y) < 1e-5) lower.set(`${point.x.toFixed(6)},${point.z.toFixed(6)}`, point);
  const ring = [...lower.values()].sort((a, b) => Math.atan2(a.z - center.z, a.x - center.x) - Math.atan2(b.z - center.z, b.x - center.x));
  if (ring.length !== 8) throw new Error('Trunk contact requires the fixed octagonal source foot.');
  const isExtreme = (p: THREE.Vector3): boolean => ['x', 'z'].some(axis => {
    const key = axis as 'x' | 'z'; return Math.min(Math.abs(p[key] - bounds.min[key]), Math.abs(p[key] - bounds.max[key])) < 1e-5;
  });
  const diagonals = ring.filter(p => !isExtreme(p));
  if (diagonals.length !== 4) throw new Error('Trunk contact requires four source footprint extrema.');
  // Remove opposite diagonal corners only. This is an inscribed convex hexagon,
  // so the new root cannot encroach beyond the original octagonal source foot.
  const foot = ring.filter(p => p !== diagonals[0] && p !== diagonals[2]);
  const geometry = new THREE.BufferGeometry(), result = new THREE.Group();
  owned.set(result, geometry);
  try {
    const vertices: number[] = [], uvs: number[] = [], indices: number[] = [];
    const heights = [0, .14, 1], widths = [1, .76, .60], sides = foot.length;
    for (let tier = 0; tier < heights.length; tier++) for (let j = 0; j <= sides; j++) {
      const p = foot[j % sides], radius = widths[tier];
      vertices.push(center.x + (p.x - center.x) * radius, bounds.min.y + size.y * heights[tier], center.z + (p.z - center.z) * radius);
      // The borrowed bark repeats twice over the retained trunk height.
      uvs.push(j / sides * 2, heights[tier] * 2);
    }
    for (let tier = 0; tier < 2; tier++) for (let j = 0; j < sides; j++) {
      const low = tier * (sides + 1) + j, high = low + sides + 1;
      indices.push(low, high, high + 1, low, high + 1, low + 1);
    }
    // Independent cap vertices keep flat ground/top normals, while the shaft
    // remains smoothly shaded. Both caps are closed without centre vertices.
    for (const tier of [0, 2]) {
      const start = vertices.length / 3;
      for (let j = 0; j < sides; j++) {
        const p = foot[j], radius = widths[tier];
        vertices.push(center.x + (p.x - center.x) * radius, bounds.min.y + size.y * heights[tier], center.z + (p.z - center.z) * radius);
        uvs.push((p.x - bounds.min.x) / size.x, (p.z - bounds.min.z) / size.z);
      }
      for (let j = 1; j < sides - 1; j++) {
        if (tier === 0) indices.push(start, start + j, start + j + 1);
        else indices.push(start, start + j + 1, start + j);
      }
    }
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices); geometry.computeVertexNormals();
    const normal = geometry.getAttribute('normal'), n = new THREE.Vector3();
    for (let tier = 0; tier < 3; tier++) {
      const a = tier * (sides + 1), b = a + sides;
      n.set(normal.getX(a) + normal.getX(b), normal.getY(a) + normal.getY(b), normal.getZ(a) + normal.getZ(b)).normalize();
      normal.setXYZ(a, n.x, n.y, n.z); normal.setXYZ(b, n.x, n.y, n.z);
    }
    geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, source.material);
    mesh.name = `${source.name} | grounded trunk foot`; mesh.castShadow = source.castShadow; mesh.receiveShadow = source.receiveShadow;
    result.name = `${base.name || 'Trunk'} | grounded foot`; result.add(mesh);
    result.userData.townBorrowedMaterials = true;
    result.userData.townTrunkContact = {
      sourceTriangles: 28, triangles: indices.length / 3, vertices: vertices.length / 3,
      geometryBytes: Object.values(geometry.attributes).reduce((sum, a) => sum + a.array.byteLength, 0) + geometry.index!.array.byteLength,
      bounds: { min: bounds.min.toArray(), max: bounds.max.toArray() }, basis: TRUNK_CONTACT_BASIS,
    };
    return result;
  } catch (error) { disposeTrunkContactPrototype(result); throw error; }
}

/** Release only the owned replacement geometry, never source maps/materials. */
export function disposeTrunkContactPrototype(group: THREE.Group): void {
  const geometry = owned.get(group); if (!geometry) return;
  geometry.dispose(); owned.delete(group); group.clear();
}
