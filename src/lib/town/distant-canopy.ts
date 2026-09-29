import * as THREE from 'three';

const owned = new WeakMap<THREE.Group, Set<THREE.BufferGeometry>>();

// These are shading neighborhoods inside the one existing hull, not extra
// trees, surveyed branches or additional geometry. Unequal staggered tiers
// break the whole-crown sphere into a collection of smaller leafy boughs.
const boughs = [
  ...Array.from({ length: 6 }, (_, i) => { const a = i * Math.PI / 3 + .28; return new THREE.Vector3(Math.cos(a) * .29, -.23 + .025 * Math.sin(i * 2.1), Math.sin(a) * .29); }),
  ...Array.from({ length: 7 }, (_, i) => { const a = i * Math.PI * 2 / 7 + .62; return new THREE.Vector3(Math.cos(a) * .34, .04 + .035 * Math.sin(i * 1.7), Math.sin(a) * .34); }),
  ...Array.from({ length: 5 }, (_, i) => { const a = i * Math.PI * 2 / 5; return new THREE.Vector3(Math.cos(a) * .24, .29 + .025 * Math.sin(i * 2.4), Math.sin(a) * .24); }),
  new THREE.Vector3(.045, .395, -.025),
];

function crownBough(point: THREE.Vector3, center: THREE.Vector3): number {
  center.set(0, 0, 0); let weight = 0, nearest = Infinity;
  for (const bough of boughs) {
    const distance = point.distanceToSquared(bough);
    // Blending, rather than assigning a nearest lobe, keeps shared vertices
    // smooth across crown pockets and avoids hard artificial patch boundaries.
    const w = Math.exp(-distance * 65);
    center.addScaledVector(bough, w); weight += w; nearest = Math.min(nearest, distance);
  }
  center.multiplyScalar(1 / Math.max(weight, 1e-12));
  return Math.sqrt(nearest);
}

/** TER-023/024 motivate mature, irregular canopy masses. Their species palette
 * is regional inference; source anchors, envelopes and habitat families remain. */
export function createDistantCanopyPrototype(base: THREE.Group): THREE.Group {
  base.updateMatrixWorld(true);
  const result = new THREE.Group(), geometries = new Set<THREE.BufferGeometry>();
  result.name = `${base.name || 'Distant crown'} | layered canopy`;
  owned.set(result, geometries);
  try {
    base.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      const geometry = object.geometry.clone();
      geometries.add(geometry);
      geometry.applyMatrix4(object.matrixWorld);
      const position = geometry.getAttribute('position');
      if (!position?.count) throw new Error('Distant canopy requires a nonempty crown.');
      geometry.computeBoundingBox();
      const bounds = geometry.boundingBox!.clone(), size = bounds.getSize(new THREE.Vector3());
      if (![size.x, size.y, size.z].every(value => Number.isFinite(value) && value > 0)) throw new Error('Distant canopy requires finite crown dimensions.');
      const colors = new Float32Array(position.count * 3), originalColors = geometry.getAttribute('color');
      for (let i = 0; i < position.count; i++) {
        const x = (position.getX(i) - bounds.min.x) / size.x - .5;
        const z = (position.getZ(i) - bounds.min.z) / size.z - .5;
        const t = (position.getY(i) - bounds.min.y) / size.y;
        const envelope = Math.sin(t * Math.PI);
        const clump = Math.sin(x * 11.3 + t * 4.1) * Math.cos(z * 9.7 - t * 3.3);
        // Coherent unequal bough lobes, not per-vertex jitter. At driving
        // distance the retained hull reads as crown layers instead of a ball.
        const angle = Math.atan2(z, x);
        const scallop = Math.sin(angle * 6 + t * 7.1) * Math.sin(t * Math.PI * 3 + .4);
        const spread = 1 + .040 * envelope * Math.sin(angle * 3 + t * 4.2) + .027 * clump + .032 * envelope * scallop;
        position.setXYZ(i,
          bounds.min.x + size.x * (.5 + x * spread + .013 * envelope),
          bounds.min.y + size.y * (t + .019 * envelope * clump + .009 * envelope * scallop),
          bounds.min.z + size.z * (.5 + z * spread - .009 * envelope));
      }
      geometry.computeBoundingBox();
      const nextBounds = geometry.boundingBox!, nextSize = nextBounds.getSize(new THREE.Vector3());
      for (let i = 0; i < position.count; i++) position.setXYZ(i,
        bounds.min.x + (position.getX(i) - nextBounds.min.x) * size.x / nextSize.x,
        bounds.min.y + (position.getY(i) - nextBounds.min.y) * size.y / nextSize.y,
        bounds.min.z + (position.getZ(i) - nextBounds.min.z) * size.z / nextSize.z);
      position.needsUpdate = true;
      const oldNormal = geometry.getAttribute('normal')?.clone();
      geometry.computeVertexNormals();
      const normal = geometry.getAttribute('normal');
      const soft = new THREE.Vector3(), actual = new THREE.Vector3(), center = bounds.getCenter(new THREE.Vector3());
      const point = new THREE.Vector3(), bough = new THREE.Vector3(), cluster = new THREE.Vector3();
      for (let i = 0; i < normal.count; i++) {
        actual.fromBufferAttribute(normal, i);
        if (actual.lengthSq() < 1e-8) actual.set(oldNormal?.getX(i) ?? 0, oldNormal?.getY(i) ?? 1, oldNormal?.getZ(i) ?? 0).normalize();
        // Preserve a soft global envelope, but light each smaller bough from
        // its own center. A global sphere normal alone made the entire forest
        // read as giant smooth blobs even when the rim shader cut leaf notches.
        soft.set((position.getX(i) - center.x) / (size.x * size.x), (position.getY(i) - center.y) / (size.y * size.y), (position.getZ(i) - center.z) / (size.z * size.z)).normalize();
        point.set((position.getX(i) - center.x) / size.x, (position.getY(i) - center.y) / size.y, (position.getZ(i) - center.z) / size.z);
        const pocket = crownBough(point, bough), t = point.y + .5;
        cluster.copy(point).sub(bough).divide(size).normalize();
        const facing = cluster.dot(soft);
        if (facing < .35) cluster.addScaledVector(soft, .35 - facing).normalize();
        if (soft.dot(actual) > .25) actual.multiplyScalar(.12).addScaledVector(soft, .40).addScaledVector(cluster, .48).normalize();
        normal.setXYZ(i, actual.x, actual.y, actual.z);
        // The same bough field bakes shaded undersides and brighter outer tips;
        // no new shader, texture, alpha layer or per-frame CPU work is needed.
        const exposure = THREE.MathUtils.smoothstep(cluster.y, -.55, .80);
        const recess = THREE.MathUtils.smoothstep(pocket, .16, .32);
        const shade = .67 + .17 * THREE.MathUtils.smoothstep(t, .05, .95) + .16 * exposure - .075 * recess;
        colors[i * 3] = shade * (.99 + t * .025) * (originalColors?.getX(i) ?? 1);
        colors[i * 3 + 1] = shade * (originalColors?.getY(i) ?? 1);
        colors[i * 3 + 2] = shade * (1.015 - t * .055) * (originalColors?.getZ(i) ?? 1);
      }
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      geometry.computeBoundingBox(); geometry.computeBoundingSphere();
      const mesh = new THREE.Mesh(geometry, object.material);
      mesh.name = object.name; mesh.castShadow = object.castShadow; mesh.receiveShadow = object.receiveShadow;
      result.add(mesh);
    });
    if (!result.children.length) throw new Error('Distant canopy requires a crown primitive.');
    const buffers = new Set<ArrayBufferLike>();
    for (const geometry of geometries) {
      for (const attribute of Object.values(geometry.attributes)) buffers.add(attribute instanceof THREE.InterleavedBufferAttribute ? attribute.data.array.buffer : attribute.array.buffer);
      if (geometry.index) buffers.add(geometry.index.array.buffer);
    }
    result.userData.townDistantCanopy = { geometryBytes: [...buffers].reduce((sum, buffer) => sum + buffer.byteLength, 0), boughs: boughs.length, basis: 'TER-023 and TER-024: mature late-summer canopy character, authored staggered bough-cluster lighting, recessed interiors and scalloped crown edges; original anchors, topology and exact bounds retained.' };
    return result;
  } catch (error) { disposeDistantCanopyPrototype(result); throw error; }
}

export function disposeDistantCanopyPrototype(group: THREE.Group): void {
  const geometries = owned.get(group); if (!geometries) return;
  for (const geometry of geometries) geometry.dispose();
  owned.delete(group); group.clear();
}
