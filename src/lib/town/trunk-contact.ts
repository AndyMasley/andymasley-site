import * as THREE from 'three';
import { trunkProfile } from './vegetation';

export const TRUNK_CONTACT_SOURCE_SHA256 = '2b8f76d7ea1a104974b6acebf63ac62738ce0a7f99063741d686ff577beb36b9';
export const TRUNK_CONTACT_BASIS = 'VC-0167: authored grounded trunk. A root flare with shallow buttresses, a steady taper and a slightly irregular section; each instance continues its crown skeleton from just below the implied ground. Tree anchors, ground and crown heights stay fixed; no surveyed trunk dimensions or species are asserted.';
const owned = new WeakMap<THREE.Group, THREE.BufferGeometry>();

/** Near trunks are round with a buttressed flare; far ones keep a few faces. */
const DETAIL = {
  near: { sides: 10, rings: [0, 0.03, 0.07, 0.12, 0.32, 0.58, 0.82, 1] },
  far: { sides: 6, rings: [0, 0.12, 1] },
} as const;

/** One shared trunk replacing the fixed octagonal straight prototype. It
 * spans the source's [-1, 1] box in y (foot to top); its radius follows
 * `trunkProfile`, 1 just above the flare. Textures/materials stay borrowed. */
export function createTrunkContactPrototype(base: THREE.Group, detail: keyof typeof DETAIL = 'near'): THREE.Group {
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
  const foot = new Set(points.filter(p => Math.abs(p.y - bounds.min.y) < 1e-5).map(p => `${p.x.toFixed(6)},${p.z.toFixed(6)}`));
  if (foot.size !== 8) throw new Error('Trunk contact requires the fixed octagonal source foot.');
  const { sides, rings } = DETAIL[detail];
  const geometry = new THREE.BufferGeometry(), result = new THREE.Group();
  owned.set(result, geometry);
  try {
    const vertices: number[] = [], uvs: number[] = [], indices: number[] = [];
    const rx = size.x / 2, rz = size.z / 2;
    const radius = (h: number, angle: number) => {
      if (detail === 'far') return trunkProfile(h);
      // Shallow buttresses at the foot and a slightly irregular section above.
      const buttress = 0.11 * (1 - Math.min(1, h / 0.12)) ** 2 * Math.cos(5 * angle + 0.7);
      return trunkProfile(h) * (1 + buttress + 0.025 * Math.sin(3 * angle + 7 * h) + 0.015 * Math.cos(7 * angle - 3 * h));
    };
    for (const h of rings) for (let j = 0; j <= sides; j++) {
      // The seam column repeats the first exactly; only its UV differs.
      const angle = (j % sides) / sides * Math.PI * 2, r = radius(h, angle);
      vertices.push(center.x + Math.cos(angle) * r * rx, bounds.min.y + size.y * h, center.z + Math.sin(angle) * r * rz);
      // Bark wraps twice around and twice up; the bark material maps it in
      // world space, so these only matter to a plain fallback material.
      uvs.push(j / sides * 2, h * 2);
    }
    for (let tier = 0; tier < rings.length - 1; tier++) for (let j = 0; j < sides; j++) {
      const low = tier * (sides + 1) + j, high = low + sides + 1;
      indices.push(low, high, high + 1, low, high + 1, low + 1);
    }
    // A flat top closes the trunk inside the crown; the foot is buried.
    const start = vertices.length / 3, top = rings.length - 1;
    for (let j = 0; j < sides; j++) {
      vertices.push(vertices[(top * (sides + 1) + j) * 3], vertices[(top * (sides + 1) + j) * 3 + 1], vertices[(top * (sides + 1) + j) * 3 + 2]);
      uvs.push(0.5 + Math.cos(j / sides * Math.PI * 2) * 0.5, 0.5 + Math.sin(j / sides * Math.PI * 2) * 0.5);
    }
    for (let j = 1; j < sides - 1; j++) indices.push(start, start + j + 1, start + j);
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices); geometry.computeVertexNormals();
    // The seam column is duplicated for its UVs; share one smooth normal.
    const normal = geometry.getAttribute('normal'), n = new THREE.Vector3();
    for (let tier = 0; tier < rings.length; tier++) {
      const a = tier * (sides + 1), b = a + sides;
      n.set(normal.getX(a) + normal.getX(b), normal.getY(a) + normal.getY(b), normal.getZ(a) + normal.getZ(b)).normalize();
      normal.setXYZ(a, n.x, n.y, n.z); normal.setXYZ(b, n.x, n.y, n.z);
    }
    geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, source.material);
    mesh.name = `${source.name} | grounded trunk ${detail}`; mesh.castShadow = source.castShadow; mesh.receiveShadow = source.receiveShadow;
    result.name = `${base.name || 'Trunk'} | grounded ${detail}`; result.add(mesh);
    result.userData.townBorrowedMaterials = true;
    result.userData.townTrunkContact = {
      detail, sourceTriangles: 28, triangles: indices.length / 3, vertices: vertices.length / 3,
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
