import * as THREE from 'three';
import catalog from '../../../data/derived/town/french-river-park.json';
import release from '../../../data/derived/town/release.json';
import { applyGroundedSiteFeatures, type GroundedSiteRecord, type ArrivalGroundReport } from './arrival-grounds';
import { PavementIndex, clipRoadPaintPolygon, roadPaintHeightAt } from './road-finish';
import type { V3 } from './contracts';
import { applyFrenchRiverParkIsland, type FrenchRiverParkIslandReport } from './french-river-park-island';

type Tile = { origin: number[]; lods: { level: number; sha256: string }[]; features: string[] };
const tiles = catalog.tiles as Record<string, Tile>, records = new Map<string, GroundedSiteRecord>();
const area = (p: number[][]) => Math.abs(p.reduce((sum, a, i) => { const b = p[(i + 1) % p.length]; return sum + a[0] * b[1] - b[0] * a[1]; }, 0)) / 2;
type Guard = { supportedAreaM2: number; expectedAreaM2: number; waterIntersectionVertices: number; minimumTerrainAboveWaterM: number | null };
export type FrenchRiverParkReport = Omit<ArrivalGroundReport, 'status'> & Guard & { status: ArrivalGroundReport['status'] | 'water-conflict'; meshes: number; sourceInputSha256: string; island?: FrenchRiverParkIslandReport };

function record(tileId: string): GroundedSiteRecord | undefined {
  const tile = tiles[tileId]; if (!tile) return;
  const cached = records.get(tileId); if (cached) return cached;
  const ids = new Set(tile.features);
  const value: GroundedSiteRecord = { ...tile, features: catalog.features.filter(f => ids.has(f.id)).map(f => ({ ...f, basis: `${catalog.policy} ${f.inference}`, triangles: Array.from({ length: f.indices.length / 3 }, (_, i) => f.indices.slice(i * 3, i * 3 + 3).map(k => f.points[k])) })) };
  records.set(tileId, value); return value;
}

/** A projected river polygon extends underneath retained park land. Compare
 * actual planes on every clipped overlap; never raise land or hide water to fit a trace. */
function groundGuard(group: THREE.Group, origin: V3, source: GroundedSiteRecord): Guard {
  const points = source.features.flatMap(f => f.triangles.flat());
  const bounds = [Math.min(...points.map(p => p[0])), Math.min(...points.map(p => p[1])), Math.max(...points.map(p => p[0])), Math.max(...points.map(p => p[1]))];
  const terrain: number[][][] = [], water: number[][][] = [], point = new THREE.Vector3();
  group.updateMatrixWorld(true); const inverse = group.matrixWorld.clone().invert();
  group.traverse(o => {
    if (!(o instanceof THREE.Mesh)) return;
    const kind = /^(terrain|water)(?:\b|_)/i.exec(o.name)?.[1]; if (!kind) return;
    const g = o.geometry, p = g.getAttribute('position'), ix = g.index, matrix = inverse.clone().multiply(o.matrixWorld);
    if (!p) return;
    for (let i = 0; i < (ix?.count ?? p.count); i += 3) {
      const tri = [0, 1, 2].map(k => { point.fromBufferAttribute(p, ix?.getX(i + k) ?? i + k).applyMatrix4(matrix); return [point.x + origin[0], -point.z - origin[2], point.y + origin[1]]; });
      if (Math.max(...tri.map(p => p[0])) < bounds[0] || Math.min(...tri.map(p => p[0])) > bounds[2] || Math.max(...tri.map(p => p[1])) < bounds[1] || Math.min(...tri.map(p => p[1])) > bounds[3] || area(tri) < 1e-8) continue;
      (kind.toLowerCase() === 'terrain' ? terrain : water).push(tri);
    }
  });
  const landIndex = new PavementIndex(terrain), waterIndex = new PavementIndex(water);
  let supportedAreaM2 = 0, minimum = Infinity, waterIntersectionVertices = 0;
  for (const feature of source.features) for (const shape of feature.triangles) {
    const seen = new Set<string>();
    for (const land of landIndex.candidates(shape)) {
      const clipped = clipRoadPaintPolygon(shape, land.triangle); if (clipped.length < 3 || area(clipped) < 1e-8) continue;
      const key = clipped.map(p => p.map(n => n.toFixed(6)).join(',')).sort().join('|'); if (seen.has(key)) continue;
      seen.add(key); supportedAreaM2 += area(clipped);
      for (const river of waterIndex.candidates(clipped)) {
        const overlap = clipRoadPaintPolygon(clipped, river.triangle); if (overlap.length < 3 || area(overlap) < 1e-8) continue;
        for (const p of overlap) { minimum = Math.min(minimum, roadPaintHeightAt(land.triangle, p) - roadPaintHeightAt(river.triangle, p)); waterIntersectionVertices++; }
      }
    }
  }
  return { supportedAreaM2, expectedAreaM2: source.features.reduce((s, f) => s + f.areaM2, 0), minimumTerrainAboveWaterM: Number.isFinite(minimum) ? minimum : null, waterIntersectionVertices };
}

export function applyFrenchRiverPark(group: THREE.Group, tileId: string, origin: V3, level: number, sourceSha256: string): FrenchRiverParkReport | undefined {
  const source = record(tileId); if (!source || catalog.sourceManifestSha256 !== release.manifestSha256) return;
  const prior = group.userData.frenchRiverPark as FrenchRiverParkReport | undefined; if (prior) return prior;
  const empty = (status: FrenchRiverParkReport['status'], guard: Guard = { expectedAreaM2: 0, supportedAreaM2: 0, minimumTerrainAboveWaterM: null, waterIntersectionVertices: 0 }): FrenchRiverParkReport => ({ status, ids: [], triangles: 0, plantings: 0, geometryBytes: 0, meshes: 0, sourceInputSha256: catalog.sourceInputSha256, ...guard });
  if (source.lods.find(l => l.level === level)?.sha256 !== sourceSha256 || source.origin.some((v, i) => v !== origin[i])) return empty('source-mismatch');
  const guard = groundGuard(group, origin, source);
  if (Math.abs(guard.supportedAreaM2 - guard.expectedAreaM2) > .005) return empty('no-support', guard);
  if (guard.minimumTerrainAboveWaterM !== null && guard.minimumTerrainAboveWaterM < catalog.minimumTerrainAboveWaterM) return empty('water-conflict', guard);
  const result = applyGroundedSiteFeatures(group, tileId, origin, level, sourceSha256, source, 'frenchRiverParkSurface', 'French River Park paths and pads');
  if (!result || result.status !== 'applied') return empty(result?.status ?? 'no-support', guard);
  // The source tree scatter predates this registered lot. Clear only anchors
  // within its accepted hardstanding; the island and surrounding trees remain.
  const parking = source.features.filter(f => f.id.startsWith('FRP-PARKING')).flatMap(f => f.triangles);
  group.userData.environmentTreeExclusions = [...(group.userData.environmentTreeExclusions ?? []), ...parking];
  const addition = group.children.find(o => o.name === 'French River Park paths and pads')!; let meshes = 0;
  addition.traverse(o => {
    if (!(o instanceof THREE.Mesh) || Array.isArray(o.material) || !(o.material instanceof THREE.MeshStandardMaterial)) return;
    const ids = new Set<string>(o.userData.sourceIds ?? []), features = catalog.features.filter(f => ids.has(f.sid));
    o.material.name = `French River Park | ${features[0]?.surface ?? 'paving'}`;
    o.material.userData.frenchRiverPark = { sourceInputSha256: catalog.sourceInputSha256, featureIds: features.map(f => f.id), surface: features[0]?.surface, inference: features[0]?.inference };
    // Existing metre-based filtered paving shader and tile-owned disposal remain intact.
    o.material.roughness = .96; meshes++;
  });
  const island = applyFrenchRiverParkIsland(group, tileId, origin, level, sourceSha256);
  return group.userData.frenchRiverPark = { ...result, ...guard, meshes: meshes + (island?.meshes ?? 0), triangles: result.triangles + (island?.triangles ?? 0), geometryBytes: result.geometryBytes + (island?.geometryBytes ?? 0), island, sourceInputSha256: catalog.sourceInputSha256 };
}
