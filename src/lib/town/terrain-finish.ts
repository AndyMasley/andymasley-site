import * as THREE from 'three';
import index from '../../../data/derived/town/terrain-finish-index.json';
import type { AssetRef, V3 } from './contracts';

export type TerrainPatch = [triangle: number, vertices: [u: number, v: number, height: number][]];
export interface TerrainMeshFinish { mesh: string; geometryStamp: string; positions: number; triangles: number; patches: TerrainPatch[] }
export interface TerrainFinishPacket {
  version: 1; tileId: string; sourceManifestSha256: string;
  levels: { level: number; sourceSha256: string; meshes: TerrainMeshFinish[] }[];
}
export function terrainGeometryStamp(geometry: THREE.BufferGeometry): string {
  let hash = 2166136261;
  for (const attribute of [geometry.getAttribute('position'), geometry.index]) if (attribute) {
    const array = attribute.array;
    for (const value of new Uint8Array(array.buffer, array.byteOffset, array.byteLength)) hash = Math.imul(hash ^ value, 16777619) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

export interface TerrainFinishReport { meshes: number; replacedTriangles: number; addedTriangles: number; maximumDropM: number; collapsedTriangles: number; windingRepairs: number; normalRepairs: number; rejected: boolean; rejectionReason?: string; maximumFootprintDriftM2?: number }
type TerrainEnvelope = { raise: number; lower: number; footprintToleranceM2?: number };

/** Optional, individually streamed terrain repairs; no all-town geometry import. */
export function terrainFinishAsset(tileId: string, level = 0): AssetRef | undefined {
  return (index.tiles as unknown as Record<string, { levels: Record<string, AssetRef> }>)[tileId]?.levels[String(level)];
}

export function validTerrainFinishPacket(value: unknown, tileId: string): value is TerrainFinishPacket {
  const p = value as TerrainFinishPacket | undefined;
  if (!p || p.version !== 1 || p.tileId !== tileId || p.sourceManifestSha256 !== index.sourceManifestSha256 || !Array.isArray(p.levels) || p.levels.length > 3) return false;
  const levels = new Set<number>();
  return p.levels.every(level => {
    if (!level || ![0, 1, 2].includes(level.level) || levels.has(level.level) || !/^[0-9a-f]{64}$/.test(level.sourceSha256) || !Array.isArray(level.meshes)) return false;
    levels.add(level.level);
    const names = new Set<string>();
    return level.meshes.every(mesh => {
      if (!mesh || !/^terrain(?:\b|_)/i.test(mesh.mesh) || names.has(mesh.mesh) || !/^[0-9a-f]{8}$/.test(mesh.geometryStamp) || !Number.isInteger(mesh.positions) || mesh.positions < 3 || !Number.isInteger(mesh.triangles) || mesh.triangles < 1 || !Array.isArray(mesh.patches)) return false;
      names.add(mesh.mesh);
      const removed = new Set<number>();
      return mesh.patches.every(patch => {
        if (!Array.isArray(patch) || patch.length !== 2 || !Number.isInteger(patch[0]) || patch[0] < 0 || patch[0] >= mesh.triangles || removed.has(patch[0]) || !Array.isArray(patch[1]) || !patch[1].length || patch[1].length % 3 || patch[1].length > 12000) return false;
        removed.add(patch[0]);
        return patch[1].every(v => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite) && v[0] >= -0.000002 && v[1] >= -0.000002 && v[0] + v[1] <= 1.000002 && v[2] > -1000 && v[2] < 3000);
      });
    });
  });
}

/** Apply source-triangle patches before terrain material/grass registration.
 * Retained vertex attributes are copied exactly. New UVs and attributes use the
 * source triangle's barycentric coordinates; only their vertical position moves.
 * The group is interpreted relative to the tile origin, even when already placed.
 */
export function applyTerrainFinish(group: THREE.Object3D, tileId: string, origin: V3, level: number, packet?: TerrainFinishPacket, stateKey = 'terrainFinish', envelope: TerrainEnvelope = { raise: 0, lower: 2 }): TerrainFinishReport {
  const report: TerrainFinishReport = { meshes: 0, replacedTriangles: 0, addedTriangles: 0, maximumDropM: 0, collapsedTriangles: 0, windingRepairs: 0, normalRepairs: 0, rejected: false };
  if (!packet || group.userData[stateKey]) return report;
  if (!validTerrainFinishPacket(packet, tileId)) return { ...report, rejected: true, rejectionReason: 'Invalid terrain packet' };
  const source = packet.levels.find(row => row.level === level);
  if (!source) return report;
  group.updateMatrixWorld(true);
  const inverseRoot = group.matrixWorld.clone().invert(), matches = new Map<string, THREE.Mesh[]>(), owners = new Map<THREE.BufferGeometry, number>();
  group.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    owners.set(object.geometry, (owners.get(object.geometry) ?? 0) + 1);
    if (/^terrain(?:\b|_)/i.test(object.name)) matches.set(object.name, [...(matches.get(object.name) ?? []), object]);
  });
  // Validate every source match before changing any scene geometry.
  for (const patch of source.meshes) {
    const candidates = matches.get(patch.mesh), g = candidates?.[0]?.geometry;
    if (candidates?.length !== 1 || !g || terrainGeometryStamp(g) !== patch.geometryStamp || g.getAttribute('position').count !== patch.positions || (g.index?.count ?? patch.positions) !== patch.triangles * 3 || Object.values(g.attributes).some(a => a instanceof THREE.InterleavedBufferAttribute || !(a.array instanceof Float32Array) || a.normalized)) return { ...report, rejected: true, rejectionReason: `Terrain predecessor mismatch: ${patch.mesh}` };
  }
  const replacements: { mesh: THREE.Mesh; geometry: THREE.BufferGeometry; patch: TerrainMeshFinish }[] = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), point = new THREE.Vector3();
  const firstPoint = new THREE.Vector3(), secondPoint = new THREE.Vector3(), thirdPoint = new THREE.Vector3(), face = new THREE.Vector3(), normal = new THREE.Vector3();
  try {
    for (const patch of source.meshes) {
      const mesh = matches.get(patch.mesh)![0], geometry = mesh.geometry, position = geometry.getAttribute('position');
      const matrix = inverseRoot.clone().multiply(mesh.matrixWorld), inverse = matrix.clone().invert();
      const sourceAttributes = Object.entries(geometry.attributes);
      const extra = patch.patches.reduce((sum, [, vertices]) => sum + vertices.length, 0), attributes: Record<string, THREE.BufferAttribute> = {};
      for (const [name, attribute] of sourceAttributes) {
        const array = new Float32Array((position.count + extra) * attribute.itemSize);
        array.set(attribute.array as Float32Array);
        attributes[name] = new THREE.BufferAttribute(array, attribute.itemSize);
      }
      let next = position.count;
      const additions = new Map<number, number[]>();
      for (const [triangle, vertices] of patch.patches) {
        const sourceIds = [0, 1, 2].map(k => geometry.index ? geometry.index.getX(triangle * 3 + k) : triangle * 3 + k), appended: number[] = [];
        a.fromBufferAttribute(position, sourceIds[0]); b.fromBufferAttribute(position, sourceIds[1]); c.fromBufferAttribute(position, sourceIds[2]);
        for (const [u, v, height] of vertices) {
          const weights = [1 - u - v, u, v];
          for (const [name, attribute] of sourceAttributes) {
            const output = attributes[name].array as Float32Array;
            const size = attribute.itemSize, sourceArray = attribute.array, first = sourceIds[0] * size, second = sourceIds[1] * size, third = sourceIds[2] * size;
            for (let k = 0; k < size; k++) output[next * size + k] = weights[0] * sourceArray[first + k] + u * sourceArray[second + k] + v * sourceArray[third + k];
          }
          point.copy(a).multiplyScalar(weights[0]).addScaledVector(b, u).addScaledVector(c, v).applyMatrix4(matrix);
          const drop = point.y + origin[1] - height;
          if (drop < -envelope.raise - 0.0001 || drop > envelope.lower + 0.0001) throw new Error('Terrain repair exceeded its declared vertical envelope.');
          report.maximumDropM = Math.max(report.maximumDropM, drop);
          point.y = height - origin[1]; point.applyMatrix4(inverse);
          attributes.position.setXYZ(next, point.x, point.y, point.z);
          if (attributes.normal) {
            const normal = attributes.normal, length = Math.hypot(normal.getX(next), normal.getY(next), normal.getZ(next));
            if (length > 0) normal.setXYZ(next, normal.getX(next) / length, normal.getY(next) / length, normal.getZ(next) / length);
          }
          appended.push(next++);
        }
        // Float32 can collapse sub-millimetre polygon-overlay slivers. Keep the
        // source footprint area and only remove faces with no projected area.
        const sourceFirst = a.clone().applyMatrix4(matrix), sourceSecond = b.clone().applyMatrix4(matrix), sourceThird = c.clone().applyMatrix4(matrix);
        const originalArea = sourceSecond.sub(sourceFirst).cross(sourceThird.sub(sourceFirst)).y;
        if (envelope.footprintToleranceM2 !== undefined) {
          // Prove the supplied partition before Float32 rounding. Dense bank
          // boundaries can accumulate a few square centimetres of quantization
          // drift; that is separate from a missing or overlapping source patch.
          let partition = 0;
          for (let i = 0; i < vertices.length; i += 3) {
            const [p, q, r] = vertices.slice(i, i + 3);
            partition += Math.abs((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
          }
          // Match the offline overlay's 0.2 cm² absolute area tolerance; the
          // cross product here is twice the projected polygon area.
          if (Math.abs(partition - 1) * Math.abs(originalArea) > Math.max(.00004, Math.abs(originalArea) * .000002)) throw new Error('Constructed terrain partition does not cover its source triangle.');
        }
        const retained: number[] = []; let coveredArea = 0;
        for (let i = 0; i < appended.length; i += 3) {
          const ids = appended.slice(i, i + 3);
          firstPoint.fromBufferAttribute(attributes.position, ids[0]).applyMatrix4(matrix);
          secondPoint.fromBufferAttribute(attributes.position, ids[1]).applyMatrix4(matrix);
          thirdPoint.fromBufferAttribute(attributes.position, ids[2]).applyMatrix4(matrix);
          let area = face.copy(secondPoint).sub(firstPoint).cross(thirdPoint.clone().sub(firstPoint)).y;
          if (Math.abs(area) < 1e-10) { report.collapsedTriangles++; continue; }
          if (area * originalArea < 0) { [ids[1], ids[2]] = [ids[2], ids[1]]; area = -area; report.windingRepairs++; }
          coveredArea += Math.abs(area);
          if (attributes.normal) {
            firstPoint.fromBufferAttribute(attributes.position, ids[0]); secondPoint.fromBufferAttribute(attributes.position, ids[1]); thirdPoint.fromBufferAttribute(attributes.position, ids[2]);
            face.copy(secondPoint).sub(firstPoint).cross(thirdPoint.sub(firstPoint)).normalize();
            normal.set(0, 0, 0);
            for (const id of ids) normal.add(point.fromBufferAttribute(attributes.normal, id));
            if (envelope.raise > 0 || face.dot(normal) <= 0) {
              for (const id of ids) attributes.normal.setXYZ(id, face.x, face.y, face.z);
              report.normalRepairs++;
            }
          }
          retained.push(...ids);
        }
        const drift = Math.abs(coveredArea - Math.abs(originalArea));
        if (envelope.footprintToleranceM2 !== undefined) report.maximumFootprintDriftM2 = Math.max(report.maximumFootprintDriftM2 ?? 0, drift / 2);
        if (drift > Math.max(envelope.footprintToleranceM2 === undefined ? .0002 : envelope.footprintToleranceM2 * 2, Math.abs(originalArea) * .00002)) throw new Error(`Terrain repair lost its source footprint: ${patch.mesh} triangle ${triangle}, source ${Math.abs(originalArea)}, covered ${coveredArea}.`);
        additions.set(triangle, retained);
      }
      const indices: number[] = [], output = new THREE.BufferGeometry();
      for (const [name, attribute] of Object.entries(attributes)) output.setAttribute(name, attribute);
      const groups = geometry.groups.length ? geometry.groups : [{ start: 0, count: patch.triangles * 3, materialIndex: 0 }];
      for (const range of groups) {
        const start = indices.length;
        for (let i = range.start; i < range.start + range.count; i += 3) {
          const replacement = additions.get(i / 3);
          if (replacement) indices.push(...replacement);
          else for (let k = 0; k < 3; k++) indices.push(geometry.index ? geometry.index.getX(i + k) : i + k);
        }
        output.addGroup(start, indices.length - start, range.materialIndex);
      }
      output.setIndex(indices); output.computeBoundingBox(); output.computeBoundingSphere();
      replacements.push({ mesh, geometry: output, patch });
    }
  } catch (error) {
    replacements.forEach(row => row.geometry.dispose());
    return { meshes: 0, replacedTriangles: 0, addedTriangles: 0, maximumDropM: 0, collapsedTriangles: 0, windingRepairs: 0, normalRepairs: 0, rejected: true, rejectionReason: error instanceof Error ? error.message : 'Terrain transaction failed' };
  }
  for (const row of replacements) {
    const previous = row.mesh.geometry;
    row.mesh.geometry = row.geometry;
    owners.set(previous, owners.get(previous)! - 1);
    if (!owners.get(previous)) previous.dispose();
    report.meshes++; report.replacedTriangles += row.patch.patches.length;
    report.addedTriangles += (row.geometry.index!.count / 3 - row.patch.triangles);
  }
  group.userData[stateKey] = report;
  return report;
}
