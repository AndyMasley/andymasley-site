import * as THREE from 'three';
import index from '../../../data/derived/town/road-ground-clearance-index.json';
import { applyTerrainFinish, terrainGeometryStamp, validTerrainFinishPacket, type TerrainFinishPacket, type TerrainFinishReport } from './terrain-finish';
import type { AssetRef, V3 } from './contracts';

export type RoadGroundClearancePacket = TerrainFinishPacket & {
  sourceRegistrationSha256: string;
  roadPredecessors: { name: string; geometryStamp: string }[];
};
const tiles = index.tiles as Record<string, { origin: number[]; levels: Record<string, AssetRef> }>;
export function roadGroundClearanceAsset(tileId: string, level = 0): AssetRef | undefined {
  return tiles[tileId]?.levels[String(level)];
}
export function validRoadGroundClearancePacket(value: unknown, tileId: string): value is RoadGroundClearancePacket {
  if (!validTerrainFinishPacket(value, tileId)) return false;
  const packet = value as RoadGroundClearancePacket;
  return packet.sourceRegistrationSha256 === index.sourceRegistrationSha256
    && Array.isArray(packet.roadPredecessors) && packet.roadPredecessors.length > 0
    && packet.roadPredecessors.every(p => p && typeof p.name === 'string' && /^[0-9a-f]{8}$/.test(p.geometryStamp));
}
/** Streamed offline partitions keep expensive planar overlay out of tile assembly.
 * Exact source and road/terrain predecessor guards preserve the input scene when
 * an upstream correction changes. The bounded blend retains the original terrain
 * outside the registered road's 0.75 m transition and lowers at most 0.8 m. */
export function applyRoadGroundClearance(group: THREE.Group, tileId: string, origin: V3, level: number, sourceSha256: string, packet?: RoadGroundClearancePacket): TerrainFinishReport | undefined {
  if (group.userData.roadGroundClearance) return group.userData.roadGroundClearance as TerrainFinishReport;
  if (!packet) return;
  const tile = tiles[tileId], reject = (reason: string): TerrainFinishReport => ({ meshes: 0, replacedTriangles: 0, addedTriangles: 0, maximumDropM: 0, collapsedTriangles: 0, windingRepairs: 0, normalRepairs: 0, rejected: true, rejectionReason: reason });
  if (!tile || !tile.levels[String(level)] || !validRoadGroundClearancePacket(packet, tileId)
    || tile.origin.some((v, i) => Math.abs(v - origin[i]) > .000001)
    || packet.levels.find(p => p.level === level)?.sourceSha256 !== sourceSha256) return reject('Road-ground source or registration mismatch');
  const meshes: THREE.Mesh[] = [];
  group.traverse(object => { if (object instanceof THREE.Mesh) meshes.push(object); });
  for (const predecessor of packet.roadPredecessors) {
    const matches = meshes.filter(m => m.name === predecessor.name);
    if (matches.length !== 1 || terrainGeometryStamp(matches[0].geometry) !== predecessor.geometryStamp) return reject('Road-ground road predecessor mismatch');
  }
  return applyTerrainFinish(group, tileId, origin, level, packet, 'roadGroundClearance', { raise: 0, lower: .8, footprintToleranceM2: .0001 });
}
