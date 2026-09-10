import * as THREE from 'three';
import catalog from '../../../data/derived/town/french-river-park-furniture.json';
import park from '../../../data/derived/town/french-river-park.json';
import release from '../../../data/derived/town/release.json';
import { Batch, type Frame } from './crafted-frontages';
import { PavementIndex, clipRoadPaintPolygon, roadPaintHeightAt } from './road-finish';
import type { V3 } from './contracts';

type Piece = typeof catalog.pieces[number];
type Foot = { u: number; v: number; width: number; depth: number; bottom: number };
type Placement = { piece: Piece; floor: number; feet: Foot[]; groundRange: number[]; supportChecks: number };
export type FrenchRiverParkFurnitureReport = {
  status: 'applied' | 'source-mismatch' | 'no-park' | 'no-support';
  ids: string[]; omittedIds: string[]; triangles: number; meshes: number;
  geometryBytes: number; supportChecks: number; level: number; sourceInputSha256: string;
  placements: { id: string; kind: string; groundRange: number[]; feet: { ring: number[][]; bottom: number }[] }[];
};

const area = (ring: number[][]): number => {
  // Local differences avoid cancellation in small foot polygons at town coordinates.
  let sum = 0; const a = ring[0];
  for (let i = 1; i + 1 < ring.length; i++) sum += (ring[i][0] - a[0]) * (ring[i + 1][1] - a[1]) - (ring[i + 1][0] - a[0]) * (ring[i][1] - a[1]);
  return Math.abs(sum) / 2;
};
function inside(point: number[], ring: number[][]): boolean {
  const sides = ring.map((a, i) => { const b = ring[(i + 1) % ring.length]; return (b[0] - a[0]) * (point[1] - a[1]) - (b[1] - a[1]) * (point[0] - a[0]); });
  return sides.every(v => v >= -1e-7) || sides.every(v => v <= 1e-7);
}
function rectangle(piece: Piece, u: number, v: number, width: number, depth: number): number[][] {
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => piece.center.map((p, i) => p + piece.tangent[i] * (u + a * width / 2) + piece.outward[i] * (v + b * depth / 2)));
}

/** Only the successfully installed park pad batch can support furniture. The
 * inverse root transform keeps support correct before and after world placement. */
function padSurface(group: THREE.Group, origin: V3): PavementIndex {
  const triangles: number[][][] = [], point = new THREE.Vector3();
  const addition = group.children.find(o => o.name === 'French River Park paths and pads');
  if (!addition) return new PavementIndex([]);
  group.updateMatrixWorld(true); const inverse = group.matrixWorld.clone().invert();
  addition.traverse(o => {
    if (!(o instanceof THREE.Mesh) || !o.userData.townCrafted || !o.userData.sourceIds?.includes('FRP-PALE-PADS') || Array.isArray(o.material)) return;
    const metadata = o.material.userData.frenchRiverPark;
    if (metadata?.sourceInputSha256 !== catalog.sourceInputSha256 || metadata.surface !== 'pale-pad' || !catalog.pieces.every(p => metadata.featureIds?.includes(p.padId))) return;
    const geometry = o.geometry, position = geometry.getAttribute('position'), index = geometry.index;
    if (!position) return;
    const matrix = inverse.clone().multiply(o.matrixWorld);
    for (let i = 0; i + 2 < (index?.count ?? position.count); i += 3) {
      const triangle = [0, 1, 2].map(k => {
        point.fromBufferAttribute(position, index?.getX(i + k) ?? i + k).applyMatrix4(matrix);
        return [point.x + origin[0], -point.z - origin[2], point.y + origin[1]];
      });
      if (triangle.flat().every(Number.isFinite) && area(triangle) > 1e-9) triangles.push(triangle);
    }
  });
  return new PavementIndex(triangles);
}

function coverage(shape: number[][], surface: PavementIndex): { area: number; heights: number[] } {
  let supportedArea = 0; const heights: number[] = [];
  for (const face of surface.candidates(shape)) {
    const clipped = clipRoadPaintPolygon(shape, face.triangle);
    if (clipped.length < 3 || area(clipped) < 1e-10) continue;
    supportedArea += area(clipped);
    heights.push(...clipped.map(p => roadPaintHeightAt(face.triangle, p)));
  }
  return { area: supportedArea, heights };
}
function heightAt(point: number[], surface: PavementIndex): number | undefined {
  const values = surface.candidates([point]).filter(f => inside(point, f.triangle)).map(f => roadPaintHeightAt(f.triangle, point));
  if (!values.length || values.some(v => !Number.isFinite(v)) || Math.max(...values) - Math.min(...values) > .006) return;
  return Math.max(...values);
}

/** Preflight the full plan envelope, all physical foot rectangles and every
 * foot corner before emitting any part. A hole cannot leave a seat without legs. */
function supported(piece: Piece, surface: PavementIndex): Placement | undefined {
  const pad = park.features.find(f => f.id === piece.padId);
  const outline = pad?.outline;
  if (!pad || pad.surface !== 'pale-pad' || !outline || outline.length !== 4) return;
  const retained = new PavementIndex(Array.from({ length: pad.indices.length / 3 }, (_, i) => pad.indices.slice(i * 3, i * 3 + 3).map(k => [...pad.points[k], 0])));
  const envelope = rectangle(piece, 0, 0, piece.widthM, piece.depthM);
  if (!envelope.every(p => inside(p, piece.ring) && inside(p, outline))) return;
  const observed = coverage(envelope, surface), retainedCoverage = coverage(envelope, retained);
  const tolerance = catalog.limits.coverageToleranceM2;
  if (Math.abs(observed.area - area(envelope)) > tolerance || Math.abs(retainedCoverage.area - area(envelope)) > tolerance || !observed.heights.length) return;
  const groundRange = [Math.min(...observed.heights), Math.max(...observed.heights)];
  if (groundRange[1] - groundRange[0] > catalog.limits.maximumPieceGroundRangeM) return;
  const table = piece.kind === 'picnic-table';
  const feet: Foot[] = []; let supportChecks = envelope.length;
  for (const side of [-1, 1]) for (const front of [-1, 1]) {
    const foot = { u: side * (piece.widthM / 2 - .22), v: front * (table ? .48 : .19), width: .075, depth: .075, bottom: 0 };
    const ring = rectangle(piece, foot.u, foot.v, foot.width, foot.depth);
    if (!ring.every(p => inside(p, piece.ring) && inside(p, outline))) return;
    const actual = coverage(ring, surface), exact = coverage(ring, retained);
    const corners = ring.map(p => heightAt(p, surface)); supportChecks += corners.length;
    if (corners.some(v => v === undefined) || Math.abs(actual.area - area(ring)) > tolerance || Math.abs(exact.area - area(ring)) > tolerance) return;
    const heights = [...actual.heights, ...corners as number[]];
    if (!heights.length || Math.max(...heights) - Math.min(...heights) > catalog.limits.maximumFootGroundRangeM) return;
    foot.bottom = Math.min(...heights) - catalog.limits.footEmbedM; feet.push(foot);
  }
  return { piece, floor: groundRange[1], feet, groundRange, supportChecks };
}

function emit(batch: Batch, placement: Placement): void {
  const { piece: p, floor, feet } = placement, green = catalog.colors.green, metal = catalog.colors.metal;
  const f: Frame = { start: p.center, tangent: p.tangent, outward: p.outward, structId: p.id, tileId: catalog.tileId };
  const seat = floor + .45, table = p.kind === 'picnic-table';
  for (const foot of feet) batch.box(f, 'metal', foot.u, (foot.bottom + seat - .03) / 2, foot.v, foot.width, seat - .03 - foot.bottom, foot.depth, metal);
  if (table) {
    const top = floor + .76, boards = batch.level === 0 ? 5 : batch.level === 1 ? 3 : 1;
    for (let i = 0; i < boards; i++) batch.box(f, 'trim', 0, top, -.35 + (i + .5) * .7 / boards, p.widthM, .052, .7 / boards - (boards > 1 ? .009 : 0), green);
    const seatBoards = batch.level === 0 ? 2 : 1;
    for (const sign of [-1, 1]) for (let i = 0; i < seatBoards; i++) batch.box(f, 'trim', 0, seat, sign * .64 - .115 + (i + .5) * .23 / seatBoards, p.widthM, .047, .23 / seatBoards - (seatBoards > 1 ? .008 : 0), green);
    for (const sign of [-1, 1]) {
      const u = sign * (p.widthM / 2 - .22);
      batch.box(f, 'metal', u, seat - .055, 0, .085, .08, 1.4, metal);
      // The upper table supports attach to the lower seat cross-frame; they
      // are not extra unsampled ground contacts.
      if (batch.level < 2) for (const side of [-1, 1]) batch.box(f, 'metal', u, (seat + top) / 2 - .024, side * .25, .065, top - seat, .065, metal);
      else batch.box(f, 'metal', u, (seat + top) / 2 - .024, 0, .075, top - seat, .5, metal);
    }
  } else {
    const boards = batch.level === 0 ? 3 : batch.level === 1 ? 2 : 1;
    for (let i = 0; i < boards; i++) {
      batch.box(f, 'trim', 0, seat, -.225 + (i + .5) * .45 / boards, p.widthM, .045, .45 / boards - (boards > 1 ? .009 : 0), green);
      // Back lies toward the inland edge; the authored seat faces generally north.
      batch.box(f, 'trim', 0, seat + .16 + (i + .5) * .28 / boards, -.27, p.widthM, .28 / boards - (boards > 1 ? .014 : 0), .045, green);
    }
    for (const side of [-1, 1]) {
      const u = side * (p.widthM / 2 - .22);
      batch.box(f, 'metal', u, seat - .045, 0, .075, .065, .58, metal);
      batch.box(f, 'metal', u, seat + .20, -.28, .055, .47, .055, metal);
      if (batch.level === 0) batch.box(f, 'metal', u, seat + .205, -.035, .06, .045, .43, metal);
    }
  }
}

export function applyFrenchRiverParkFurniture(group: THREE.Group, tileId: string, origin: V3, level: number, sourceSha256: string): FrenchRiverParkFurnitureReport | undefined {
  if (tileId !== catalog.tileId) return;
  const empty = (status: FrenchRiverParkFurnitureReport['status']): FrenchRiverParkFurnitureReport => ({ status, ids: [], omittedIds: [], triangles: 0, meshes: 0, geometryBytes: 0, supportChecks: 0, level, sourceInputSha256: catalog.sourceInputSha256, placements: [] });
  if (catalog.sourceManifestSha256 !== release.manifestSha256 || catalog.sourceManifestSha256 !== park.sourceManifestSha256 || catalog.sourceInputSha256 !== park.sourceInputSha256 || catalog.lods.find(l => l.level === level)?.sha256 !== sourceSha256 || origin.length !== 3 || catalog.origin.some((v, i) => v !== origin[i])) return empty('source-mismatch');
  const parkReport = group.userData.frenchRiverPark;
  if (parkReport?.status !== 'applied' || parkReport.sourceInputSha256 !== catalog.sourceInputSha256 || !catalog.pieces.every(p => parkReport.ids?.includes(p.padId))) return empty('no-park');
  const prior = group.userData.frenchRiverParkFurniture as FrenchRiverParkFurnitureReport | undefined;
  if (prior) return prior.level === level && prior.sourceInputSha256 === catalog.sourceInputSha256 ? prior : empty('source-mismatch');
  const surface = padSurface(group, origin), placements: Placement[] = [], omittedIds: string[] = [];
  for (const piece of catalog.pieces) { const placement = supported(piece, surface); if (placement) placements.push(placement); else omittedIds.push(piece.id); }
  if (!placements.length) return { ...empty('no-support'), omittedIds };
  const batch = new Batch(new THREE.Vector3().fromArray(origin), level);
  for (const placement of placements) emit(batch, placement);
  const built = batch.finish(); built.group.name = 'French River Park furniture';
  built.group.userData.appearanceBasis = catalog.policy;
  built.group.traverse(o => {
    if (!(o instanceof THREE.Mesh) || Array.isArray(o.material)) return;
    o.userData.category = 'french-river-park-furniture';
    o.name = `French River Park furniture | ${o.material.userData.surfaceRole}`;
    o.material.name = o.name; o.material.userData.appearanceBasis = catalog.policy;
    o.material.userData.sourceInputSha256 = catalog.sourceInputSha256;
  });
  group.add(built.group);
  const report: FrenchRiverParkFurnitureReport = { ...empty('applied'), ids: placements.map(p => p.piece.id), omittedIds, triangles: built.triangles, meshes: built.group.children.length, geometryBytes: built.bytes, supportChecks: placements.reduce((n, p) => n + p.supportChecks, 0), placements: placements.map(p => ({ id: p.piece.id, kind: p.piece.kind, groundRange: p.groundRange, feet: p.feet.map(f => ({ ring: rectangle(p.piece, f.u, f.v, f.width, f.depth), bottom: f.bottom })) })) };
  group.userData.frenchRiverParkFurniture = report;
  return report;
}
