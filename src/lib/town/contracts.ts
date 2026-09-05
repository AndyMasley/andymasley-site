export type V3 = [number, number, number];
export interface AssetRef { url: string; bytes: number; sha256?: string }
export interface Bounds { min: V3; max: V3 }
export interface TownTile {
  id: string;
  origin: V3;
  bounds: Bounds;
  lods: (AssetRef & { level: number; geometricErrorM?: number })[];
  treeFile?: AssetRef & { count: number };
  sourceIds?: string[];
}
export interface WorldManifest {
  version: number;
  tileSizeM?: number;
  sourceSha256?: string;
  coordinates: { axes: string; conversion: string; horizontalOrigin: number[]; sourceCRS: string; sourceVerticalOffsetM: number };
  tiles: TownTile[];
  fallback: AssetRef;
  trees: { prototypes: (AssetRef & { id: string; role?: 'crown' | 'trunk'; level?: number })[] };
  car: AssetRef & { forward: string; wheelNodes: string[] };
  stats: Record<string, number | string>;
}
export type Quality = 'auto' | 'high' | 'low';
export interface WorldMetrics {
  pending: number;
  loaded: number;
  triangles: number;
  bytes: number;
  errors: number;
}

export function boundsDistanceSquared(bounds: Bounds, point: V3): number {
  const dx = Math.max(bounds.min[0] - point[0], 0, point[0] - bounds.max[0]);
  const dz = Math.max(bounds.min[2] - point[2], 0, point[2] - bounds.max[2]);
  return dx * dx + dz * dz;
}

export function chooseLod(tile: TownTile, distance: number, low: boolean): number {
  const levels = [...tile.lods].sort((a, b) => a.level - b.level);
  if (!levels.length) return 0;
  const desired = distance < (low ? 160 : 280) ? 0 : distance < (low ? 430 : 650) ? 1 : 2;
  return (levels.find((level) => level.level >= desired) ?? levels[levels.length - 1]).level;
}

export function validateManifest(value: unknown): asserts value is WorldManifest {
  const m = value as WorldManifest;
  if (!m || m.version !== 1 || m.coordinates?.axes !== 'Y_UP' || !Array.isArray(m.tiles) || !m.tiles.length || !m.fallback?.url || !m.car?.url) {
    throw new Error('This town release has an unsupported asset manifest. Please reload the page.');
  }
  const ids = new Set<string>();
  for (const tile of m.tiles) {
    if (ids.has(tile.id) || (!tile.lods?.length && !tile.treeFile) || !tile.origin?.every(Number.isFinite) || !tile.bounds?.min?.every(Number.isFinite) || !tile.bounds?.max?.every(Number.isFinite)) {
      throw new Error('The town scenery manifest contains an invalid or duplicate section.');
    }
    ids.add(tile.id);
  }
}
