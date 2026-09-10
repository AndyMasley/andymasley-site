import * as THREE from 'three';
import catalog from '../../../data/derived/town/french-river-park.json';
import release from '../../../data/derived/town/release.json';
import { Batch, type Frame } from './crafted-frontages';
import { PavementIndex, clipRoadPaintPolygon, roadPaintHeightAt } from './road-finish';
import type { V3 } from './contracts';

const cross = (a: number[], b: number[], c: number[]) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
const area = (p: number[][]) => Math.abs(p.reduce((s, a, i) => { const b = p[(i + 1) % p.length]; return s + a[0] * b[1] - a[1] * b[0]; }, 0)) / 2;
type Fragment = { polygon: number[][]; support: number[][] };
export type FrenchRiverParkIslandReport = { status: 'applied' | 'source-mismatch' | 'no-support'; areaM2: number; triangles: number; geometryBytes: number; meshes: number };

/** Clip a convex polygon by a linear half-plane, retaining its positive side. */
function halfPlane(polygon: number[][], value: (p: number[]) => number): number[][] {
  const out: number[][] = [];
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length], va = value(a), vb = value(b), ina = va >= 0, inb = vb >= 0;
    if (ina !== inb) { const t = va / (va - vb); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
    if (inb) out.push(b);
  }
  return out;
}

/** Partition the exact highest retained plane; vertex-only maxima would bridge
 * road/terrain intersections and can float above a narrow shoulder. */
export function highestGroundFragments(shapes: number[][][], supports: number[][][]): Fragment[] {
  const index = new PavementIndex(supports), order = new Map(supports.map((t, i) => [t, i])), result: Fragment[] = [];
  for (const shape of shapes) for (const base of index.candidates(shape)) {
    const clipped = clipRoadPaintPolygon(shape, base.triangle); if (clipped.length < 3 || area(clipped) < 1e-8) continue;
    let parts = [clipped];
    for (const other of index.candidates(clipped)) {
      if (base.triangle === other.triangle || !parts.length) continue;
      const overlap = clipRoadPaintPolygon(clipped, other.triangle); if (overlap.length < 3 || area(overlap) < 1e-8) continue;
      const tie = order.get(other.triangle)! < order.get(base.triangle)! ? 1e-8 : -1e-8;
      const heightDifference = (p: number[]) => roadPaintHeightAt(other.triangle, p) - roadPaintHeightAt(base.triangle, p) + tie;
      if (Math.max(...overlap.map(heightDifference)) <= 0) continue;
      const sign = Math.sign(cross(...other.triangle as [number[], number[], number[]]));
      const constraints = other.triangle.map((a, i) => (p: number[]) => sign * cross(a, other.triangle[(i + 1) % 3], p));
      constraints.push(heightDifference);
      const outside: number[][][] = [];
      for (const part of parts) {
        let remaining = part;
        for (const constraint of constraints) {
          const kept = halfPlane(remaining, p => -constraint(p));
          if (kept.length >= 3 && area(kept) > 1e-8) outside.push(kept);
          remaining = halfPlane(remaining, constraint); if (remaining.length < 3 || area(remaining) < 1e-8) break;
        }
      }
      parts = outside;
    }
    for (const polygon of parts) result.push({ polygon, support: base.triangle });
  }
  return result;
}

function mulchFinish(material: THREE.MeshStandardMaterial): void {
  const previous = material.onBeforeCompile, key = material.customProgramCacheKey();
  material.name = 'French River Park | authored brown planting mulch'; material.roughness = .99;
  material.userData.frenchRiverParkIsland = { id: catalog.island.id, sourceInputSha256: catalog.sourceInputSha256, inference: catalog.island.inference };
  material.onBeforeCompile = (shader, renderer) => {
    previous.call(material, shader, renderer);
    shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', `
// Continuous world-metre grain, filtered before small bark fragments alias.
vec2 parkMulchPoint=vCraftedWorld.xz;
float parkMulchFootprint=max(length(dFdx(parkMulchPoint)),length(dFdy(parkMulchPoint)));
float parkMulchBroad=craftedGroundNoise(parkMulchPoint*.8+vec2(13.0,7.0))-.5;
float parkMulchFine=(craftedGroundNoise(mat2(.8,.6,-.6,.8)*parkMulchPoint*vec2(12.0,35.0))-.5)*(1.0-smoothstep(.015,.07,parkMulchFootprint));
diffuseColor.rgb*=1.0+parkMulchBroad*.42+parkMulchFine*.28;
#include <roughnessmap_fragment>
`);
  };
  material.customProgramCacheKey = () => `${key}|french-park-mulch-v1`;
}

export function applyFrenchRiverParkIsland(group: THREE.Group, tileId: string, origin: V3, level: number, sourceSha256: string): FrenchRiverParkIslandReport | undefined {
  const source = catalog.island, tile = (catalog.tiles as Record<string, { origin: number[]; lods: { level: number; sha256: string }[] }>)[tileId];
  if (!tile || source.tileId !== tileId) return;
  const prior = group.userData.frenchRiverParkIsland as FrenchRiverParkIslandReport | undefined; if (prior) return prior;
  const empty = (status: FrenchRiverParkIslandReport['status']): FrenchRiverParkIslandReport => ({ status, areaM2: 0, triangles: 0, geometryBytes: 0, meshes: 0 });
  if (catalog.sourceManifestSha256 !== release.manifestSha256 || tile.lods.find(l => l.level === level)?.sha256 !== sourceSha256 || tile.origin.some((v, i) => v !== origin[i])) return empty('source-mismatch');
  const shapes = source.triangles, points = shapes.flat(), bounds = [Math.min(...points.map(p => p[0])), Math.min(...points.map(p => p[1])), Math.max(...points.map(p => p[0])), Math.max(...points.map(p => p[1]))];
  const supports: number[][][] = [], point = new THREE.Vector3(); group.updateMatrixWorld(true); const inverse = group.matrixWorld.clone().invert();
  group.traverse(o => {
    if (!(o instanceof THREE.Mesh) || !/^(terrain|roads)(?:\b|_)/i.test(o.name)) return;
    const terrain = /^terrain(?:\b|_)/i.test(o.name), g = o.geometry, p = g.getAttribute('position'), ix = g.index, m = inverse.clone().multiply(o.matrixWorld); if (!p) return;
    for (let i = 0; i < (ix?.count ?? p.count); i += 3) {
      const material = Array.isArray(o.material) ? o.material[g.groups.find((row: { start: number; count: number; materialIndex?: number }) => i >= row.start && i < row.start + row.count)?.materialIndex ?? 0] : o.material;
      if (!terrain && !/Drive road \| (asphalt|weathered shoulder)/i.test(material?.name ?? '')) continue;
      const tri = [0, 1, 2].map(k => { point.fromBufferAttribute(p, ix?.getX(i + k) ?? i + k).applyMatrix4(m); return [point.x + origin[0], -point.z - origin[2], point.y + origin[1]]; });
      if (Math.max(...tri.map(p => p[0])) < bounds[0] || Math.min(...tri.map(p => p[0])) > bounds[2] || Math.max(...tri.map(p => p[1])) < bounds[1] || Math.min(...tri.map(p => p[1])) > bounds[3] || area(tri) < 1e-8) continue;
      supports.push(tri);
    }
  });
  const fragments = highestGroundFragments(shapes, supports), supported = fragments.reduce((s, f) => s + area(f.polygon), 0);
  if (Math.abs(supported - source.areaM2) > .0001) return empty('no-support');
  const positions: number[] = [], normals: number[] = [], exclusions: number[][][] = [];
  for (const fragment of fragments) for (let i = 1; i < fragment.polygon.length - 1; i++) {
    const tri = [fragment.polygon[0], fragment.polygon[i], fragment.polygon[i + 1]].map(p => [Math.fround(p[0] - origin[0]) + origin[0], Math.fround(p[1] + origin[2]) - origin[2]]);
    // Source intersections produce sub-pixel slivers. Establish orientation in
    // the actual tile-local Float32 coordinates before computing their normals.
    if (Math.abs(cross(...tri as [number[], number[], number[]])) < 1e-7) continue;
    if (cross(...tri as [number[], number[], number[]]) > 0) tri.reverse();
    const vertices = tri.map(p => new THREE.Vector3(p[0], Math.fround(roadPaintHeightAt(fragment.support, p) + source.heightOffsetM - origin[1]) + origin[1], p[1]));
    const normal = vertices[1].clone().sub(vertices[0]).cross(vertices[2].clone().sub(vertices[0])).normalize();
    for (const v of vertices) { positions.push(v.x, v.y, v.z); normals.push(normal.x, normal.y, normal.z); }
    exclusions.push(tri);
  }
  const batch = new Batch(new THREE.Vector3(...origin), level), frame: Frame = { structId: source.id, tileId, start: [0, 0], tangent: [1, 0], outward: [0, 1] };
  batch.geometry(frame, 'paving', positions, normals, source.color);
  const built = batch.finish(); built.group.name = 'French River Park planting island';
  built.group.traverse(o => { if (o instanceof THREE.Mesh && o.material instanceof THREE.MeshStandardMaterial) mulchFinish(o.material); });
  const parent = group.children.find(o => o.name === 'French River Park paths and pads') ?? group; parent.add(built.group);
  group.userData.environmentGrassExclusions = [...(group.userData.environmentGrassExclusions ?? []), ...exclusions];
  const report: FrenchRiverParkIslandReport = { status: 'applied', areaM2: supported, triangles: built.triangles, geometryBytes: built.bytes, meshes: built.group.children.length };
  return group.userData.frenchRiverParkIsland = report;
}
