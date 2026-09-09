import * as THREE from 'three';
import catalog from '../../../data/derived/town/moderne-frontage-grounds.json';
import release from '../../../data/derived/town/release.json';
import { applyGroundedSiteFeatures, type GroundedSiteRecord } from './arrival-grounds';
import type { V3 } from './contracts';

const tiles = catalog.tiles as Record<string, { origin: number[]; lods: { level: number; sha256: string }[]; features: string[] }>;
const records = new Map<string, GroundedSiteRecord>();
function record(tileId: string): GroundedSiteRecord | undefined {
  const tile = tiles[tileId];
  if (!tile) return;
  const previous = records.get(tileId);
  if (previous) return previous;
  const ids = new Set(tile.features);
  const value = { ...tile, features: catalog.features.filter(f => ids.has(f.id)).map(f => ({ ...f, basis: catalog.policy, triangles: Array.from({ length: f.indices.length / 3 }, (_, i) => f.indices.slice(i * 3, i * 3 + 3).map(k => f.points[k])) })) };
  records.set(tileId, value);
  return value;
}

/** Official photo 168 proves a pale walking surface at the registered Moderne
 * parcel front. Its bounded connection to retained paving is inferred. */
export function applyModerneFrontageGrounds(group: THREE.Group, tileId: string, origin: V3, level: number, sourceSha256: string) {
  if (catalog.sourceManifestSha256 !== release.manifestSha256) return;
  return applyGroundedSiteFeatures(group, tileId, origin, level, sourceSha256, record(tileId), 'moderneFrontageGrounds', '248 Main pedestrian forecourt');
}
