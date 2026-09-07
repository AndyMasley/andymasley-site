import * as THREE from 'three';
import { bridgeDeckDisplacement, GREAT_BRIDGE_EVIDENCE } from './bridge-grade';
import type { V3 } from './contracts';

const source = GREAT_BRIDGE_EVIDENCE.sourceRoadGeometry;
const materials = new Map(source.meshes.map(mesh => [mesh.meshName, new Set(mesh.materials)]));

/** Only existing road/sidewalk primitives participate. Terrain, river,
 * buildings, parked cars and added landmark geometry stay put. */
export function applyMeasuredBridgeSurface(group: THREE.Group, tileId: string, origin: V3): number {
  if (tileId !== source.tileId || group.userData.measuredBridgeSurface !== undefined) return 0;
  group.updateMatrixWorld(true);
  const point = new THREE.Vector3(), inverse = new THREE.Matrix4();
  let count = 0;
  group.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    // GLTFLoader represents a multi-material source mesh as named child
    // primitives (roads_1, roads_2, ...) inside the original roads group.
    const allowed = materials.get(object.name) ?? materials.get(object.parent?.name ?? '');
    if (!allowed) return;
    const geometry = object.geometry, position = geometry.getAttribute('position');
    if (!position) return;
    const list = Array.isArray(object.material) ? object.material : [object.material];
    const index = geometry.index, total = index?.count ?? position.count;
    const parts = geometry.groups.length ? geometry.groups : [{ start: 0, count: total, materialIndex: 0 }];
    const eligible = new Set<number>(), protectedVertices = new Set<number>();
    for (const part of parts) {
      const target = allowed.has(list[part.materialIndex ?? 0]?.name) ? eligible : protectedVertices;
      for (let i = part.start; i < Math.min(total, part.start + part.count); i++) target.add(index ? index.getX(i) : i);
    }
    inverse.copy(object.matrixWorld).invert();
    const changedVertices = new Set<number>();
    const oldNormals = geometry.getAttribute('normal')?.clone();
    let changed = false;
    for (const id of eligible) {
      if (protectedVertices.has(id)) continue;
      point.fromBufferAttribute(position, id).applyMatrix4(object.matrixWorld);
      const offset = bridgeDeckDisplacement(point.x + origin[0], -(point.z + origin[2]));
      if (!offset) continue;
      point.y += offset;
      point.applyMatrix4(inverse); position.setXYZ(id, point.x, point.y, point.z);
      changedVertices.add(id);
      count++; changed = true;
    }
    if (changed) {
      position.needsUpdate = true; geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
      if (oldNormals) {
        const normal = geometry.getAttribute('normal');
        for (let i = 0; i < normal.count; i++) if (!changedVertices.has(i)) normal.setXYZ(i, oldNormals.getX(i), oldNormals.getY(i), oldNormals.getZ(i));
        normal.needsUpdate = true;
      }
    }
  });
  group.userData.measuredBridgeSurface = count;
  return count;
}
