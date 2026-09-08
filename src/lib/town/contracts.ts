export type V3 = [number, number, number];
export interface AssetRef { url: string; bytes: number; sha256?: string }
export interface Bounds { min: V3; max: V3 }
export interface GroundSurfaces {
  grass: { color: AssetRef; normal: AssetRef; roughness: AssetRef; repeatM: number };
  soil?: { color: AssetRef; repeatM: number };
  forest?: { color: AssetRef; repeatM: number };
  impervious?: { color: AssetRef; repeatM: number };
  /** Bounds include the mask gutter, in Three.js world X/Z metres. Image row zero is minZ. */
  masks: Record<string, AssetRef & { bounds: [number, number, number, number] }>;
}
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
  surfaces?: GroundSurfaces;
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
  const vector = (v: unknown): v is number[] => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite);
  const asset = (a: unknown): a is AssetRef => {
    if (!a || typeof a !== 'object') return false;
    const r = a as AssetRef;
    return typeof r.url === 'string' && !!r.url && !/^(?:javascript|data):/i.test(r.url) && !r.url.split('/').includes('..') &&
      Number.isSafeInteger(r.bytes) && r.bytes >= 0 && (r.sha256 === undefined || /^[a-f0-9]{64}$/.test(r.sha256));
  };
  if (!m || m.version !== 1 || m.coordinates?.axes !== 'Y_UP' || !Array.isArray(m.tiles) || !m.tiles.length ||
      !asset(m.fallback) || !asset(m.car) || !Array.isArray(m.trees?.prototypes) || !m.trees.prototypes.every(asset) ||
      (m.tileSizeM !== undefined && (!Number.isFinite(m.tileSizeM) || m.tileSizeM <= 0))) {
    throw new Error('This town release has an unsupported asset manifest. Please reload the page.');
  }
  const ids = new Set<string>();
  for (const tile of m.tiles) {
    if (!tile || typeof tile.id !== 'string' || !tile.id || ids.has(tile.id) || !Array.isArray(tile.lods) || (!tile.lods.length && !tile.treeFile) ||
        !vector(tile.origin) || !vector(tile.bounds?.min) || !vector(tile.bounds?.max) || tile.bounds.min.some((n, i) => n > tile.bounds.max[i]) ||
        new Set(tile.lods.map(lod => lod?.level)).size !== tile.lods.length ||
        !tile.lods.every(lod => asset(lod) && Number.isInteger(lod.level) && lod.level >= 0 && lod.level <= 2 &&
          (lod.geometricErrorM === undefined || Number.isFinite(lod.geometricErrorM) && lod.geometricErrorM >= 0)) ||
        (tile.treeFile !== undefined && (!asset(tile.treeFile) || !Number.isSafeInteger(tile.treeFile.count) || tile.treeFile.count < 0))) {
      throw new Error('The town scenery manifest contains an invalid or duplicate section.');
    }
    ids.add(tile.id);
  }
}
