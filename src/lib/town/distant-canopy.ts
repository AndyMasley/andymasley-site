import * as THREE from 'three';

const owned = new WeakMap<THREE.Group, Set<THREE.BufferGeometry>>();

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
        const spread = 1 + .049 * envelope * Math.sin(Math.atan2(z, x) * 3 + t * 4.2) + .027 * clump;
        position.setXYZ(i,
          bounds.min.x + size.x * (.5 + x * spread + .013 * envelope),
          bounds.min.y + size.y * (t + .019 * envelope * clump),
          bounds.min.z + size.z * (.5 + z * spread - .009 * envelope));
        // Baked occlusion between broad branch masses softens the uniform solid
        // spheres without more triangles, texture lookups or work while driving.
        const shade = .73 + .21 * THREE.MathUtils.smoothstep(t, .05, .95) + .045 * clump;
        colors[i * 3] = shade * (.985 + t * .02) * (originalColors?.getX(i) ?? 1);
        colors[i * 3 + 1] = shade * (originalColors?.getY(i) ?? 1);
        colors[i * 3 + 2] = shade * (1.015 - t * .045) * (originalColors?.getZ(i) ?? 1);
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
      for (let i = 0; i < normal.count; i++) {
        actual.fromBufferAttribute(normal, i);
        if (actual.lengthSq() < 1e-8) actual.set(oldNormal?.getX(i) ?? 0, oldNormal?.getY(i) ?? 1, oldNormal?.getZ(i) ?? 0).normalize();
        // Sparse hull triangles still determine occlusion and silhouette. A
        // partial ellipsoid normal field softens their planar lighting without
        // replacing the hull or introducing transparent billboard layers.
        soft.set((position.getX(i) - center.x) / (size.x * size.x), (position.getY(i) - center.y) / (size.y * size.y), (position.getZ(i) - center.z) / (size.z * size.z)).normalize();
        if (soft.dot(actual) > .25) actual.multiplyScalar(.72).addScaledVector(soft, .28).normalize();
        normal.setXYZ(i, actual.x, actual.y, actual.z);
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
    result.userData.townDistantCanopy = { geometryBytes: [...buffers].reduce((sum, buffer) => sum + buffer.byteLength, 0), basis: 'TER-023 and TER-024: mature late-summer canopy character, authored unequal bough lobes and soft crown lighting; original anchors, topology and exact bounds retained.' };
    return result;
  } catch (error) { disposeDistantCanopyPrototype(result); throw error; }
}

export function disposeDistantCanopyPrototype(group: THREE.Group): void {
  const geometries = owned.get(group); if (!geometries) return;
  for (const geometry of geometries) geometry.dispose();
  owned.delete(group); group.clear();
}
