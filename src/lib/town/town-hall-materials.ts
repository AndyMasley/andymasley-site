import * as THREE from 'three';
import data from '../../../data/derived/town/town-hall-materials.json';
import { frontageMaterial } from './crafted-frontages';

type CorrectionReport = { version: number; status: 'applied' | 'source-mismatch'; triangles: number };

/** Correct the retained source body before material pooling, without changing its roof or named trim. */
export function applyTownHallMaterials(group: THREE.Group, tileId: string, level: number, sourceSha256: string): CorrectionReport | undefined {
  if (tileId !== data.tileId) return;
  if (group.userData.townHallMaterials) return group.userData.townHallMaterials;
  const source = data.lods.find(row => row.level === level);
  const reject = (): CorrectionReport => group.userData.townHallMaterials = { version: data.version, status: 'source-mismatch' as const, triangles: 0 };
  if (!source || source.sha256 !== sourceSha256) return reject();
  const matches: THREE.Mesh[] = [];
  group.traverse(object => {
    if (object instanceof THREE.Mesh && object.name === data.meshName && object.parent?.name === data.parentName) matches.push(object);
  });
  const mesh = matches[0];
  if (matches.length !== 1 || !mesh || Array.isArray(mesh.material) || mesh.material.name !== data.sourceMaterial) return reject();
  const geometry = mesh.geometry;
  const count = geometry.index?.count ?? geometry.getAttribute('position')?.count;
  if (count !== source.totalTriangles * 3 || geometry.groups.length !== 0) return reject();

  const brick = frontageMaterial('brick', '#' + new THREE.Color().setRGB(...data.brickLinearRGB as [number, number, number]).getHexString());
  brick.name = 'Town Hall | corrected brick body';
  brick.userData.appearanceBasis = data.appearanceBasis;
  brick.userData.structId = data.structId;
  // A new group table shares immutable source buffers; adjacent buildings and
  // all roof triangles retain the original material and exact vertex data.
  const corrected = new THREE.BufferGeometry();
  corrected.setIndex(geometry.index);
  for (const [name, attribute] of Object.entries(geometry.attributes)) corrected.setAttribute(name, attribute);
  corrected.boundingBox = geometry.boundingBox?.clone() ?? null;
  corrected.boundingSphere = geometry.boundingSphere?.clone() ?? null;
  corrected.userData = { ...geometry.userData, townHallMaterialCorrection: data.version };
  const first = source.wallTriangles[0] * 3, end = (source.wallTriangles[1] + 1) * 3;
  if (first > 0) corrected.addGroup(0, first, 0);
  corrected.addGroup(first, end - first, 1);
  if (end < count) corrected.addGroup(end, count - end, 0);
  mesh.geometry = corrected;
  mesh.material = [mesh.material, brick];
  let stillReferenced = false;
  group.traverse(object => { if (object instanceof THREE.Mesh && object.geometry === geometry) stillReferenced = true; });
  if (!stillReferenced) geometry.dispose();
  return group.userData.townHallMaterials = { version: data.version, status: 'applied' as const, triangles: (end - first) / 3 };
}
