import * as THREE from 'three';
import index from '../../../data/derived/town/street-corner-ground-index.json';
import { applyTerrainFinish, terrainFinishAsset, validTerrainFinishPacket, type TerrainFinishPacket } from './terrain-finish';
import { environmentGroundAsset } from './environment-ground';
import type { AssetRef, V3 } from './contracts';
export type StreetCornerGroundPacket = TerrainFinishPacket & { sourceTerrainSha256: string | null; sourceEnvironmentSha256: string | null };
export function streetCornerGroundAsset(tileId: string, level = 0): AssetRef | undefined {
  return (index.tiles as Record<string, { levels: Record<string, AssetRef> }>)[tileId]?.levels[String(level)];
}
export function validStreetCornerGroundPacket(value: unknown, tileId: string): value is StreetCornerGroundPacket {
  if (!validTerrainFinishPacket(value, tileId)) return false;
  const p = value as StreetCornerGroundPacket;
  return [p.sourceTerrainSha256, p.sourceEnvironmentSha256].every(v => v === null || typeof v === 'string' && /^[a-f0-9]{64}$/.test(v));
}
/** Construction grading has an explicit envelope separate from road lowering. */
export function applyStreetCornerGround(group: THREE.Group, tileId: string, origin: V3, level: number, sourceSha256: string, packet?: StreetCornerGroundPacket) {
  if (!packet) return;
  if (!validStreetCornerGroundPacket(packet, tileId)
    || packet.levels.find(r => r.level === level)?.sourceSha256 !== sourceSha256
    || packet.sourceTerrainSha256 !== (terrainFinishAsset(tileId, level)?.sha256 ?? null)
    || packet.sourceEnvironmentSha256 !== (environmentGroundAsset(tileId, level)?.sha256 ?? null)) return { rejected: true };
  return applyTerrainFinish(group, tileId, origin, level, packet, 'streetCornerGround', { raise: 1.6, lower: .5, footprintToleranceM2: .0005 });
}
