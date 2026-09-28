import * as THREE from 'three';
import type { Frame } from './crafted-frontages';
import { PavementIndex, clipRoadPaintPolygon, roadPaintHeightAt } from './road-finish';

export type StairBlock = { u: number; v: number; width: number; depth: number; bottom: number; top: number };
export type StairRoadDecision = { id: string; status: 'compacted' | 'omitted'; blocks: number; maximumProjection: number; feature?: 'deck' | 'exterior-stair' };
type StairFrame = Pick<Frame, 'start' | 'tangent' | 'outward' | 'structId'>;
const MINIMUM_TREAD = .24;

/** Generated entrance stairs must fit beside the rendered carriageway. Source
 * building positions, door sills, main floors and road geometry are unchanged.
 * Parking lots are deliberately not carriageways. The index is lazy: most
 * tiles never ask for a new stair flight. */
export class StairRoadClearance {
  readonly decisions: StairRoadDecision[] = [];
  private index?: PavementIndex;
  constructor(private readonly group: THREE.Object3D, private readonly origin: readonly number[]) {}

  private roads(): PavementIndex {
    if (this.index) return this.index;
    this.group.updateMatrixWorld(true);
    const inverse = this.group.matrixWorld.clone().invert(), matrix = new THREE.Matrix4(), point = new THREE.Vector3(), triangles: number[][][] = [];
    this.group.traverse(object => {
      if (!(object instanceof THREE.Mesh) || object instanceof THREE.InstancedMesh) return;
      const geometry = object.geometry, position = geometry.getAttribute('position'); if (!position) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material], count = geometry.index?.count ?? position.count;
      const groups = geometry.groups.length ? geometry.groups : [{ start: 0, count, materialIndex: 0 }];
      matrix.copy(inverse).multiply(object.matrixWorld);
      for (const part of groups) {
        const material = materials[part.materialIndex ?? 0];
        if (!material || material.name !== 'Drive road | asphalt' && !material.userData.townRoadSurfaceType) continue;
        for (let i = part.start; i + 2 < Math.min(count, part.start + part.count); i += 3) triangles.push([0, 1, 2].map(k => {
          point.fromBufferAttribute(position, geometry.index?.getX(i + k) ?? i + k).applyMatrix4(matrix);
          return [point.x + this.origin[0], -point.z - this.origin[2], point.y + this.origin[1]];
        }));
      }
    });
    return this.index = new PavementIndex(triangles);
  }

  fits(frame: StairFrame, blocks: readonly StairBlock[]): boolean {
    for (const block of blocks) {
      const footprint = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => {
        const u = block.u + a * block.width / 2, v = block.v + b * block.depth / 2;
        return [frame.start[0] + frame.tangent[0] * u + frame.outward[0] * v, frame.start[1] + frame.tangent[1] * u + frame.outward[1] * v];
      });
      for (const road of this.roads().candidates(footprint)) {
        const overlap = clipRoadPaintPolygon(footprint, road.triangle); if (overlap.length < 3) continue;
        let area = 0; for (let i = 1; i < overlap.length - 1; i++) area += Math.abs((overlap[i][0] - overlap[0][0]) * (overlap[i + 1][1] - overlap[0][1]) - (overlap[i][1] - overlap[0][1]) * (overlap[i + 1][0] - overlap[0][0])) / 2;
        if (area < 1e-6) continue;
        const heights = overlap.map(p => roadPaintHeightAt(road.triangle, p));
        // An overhead bridge is not a ground-level stair conflict. Steps whose
        // tops just meet the road grade likewise do not obstruct that surface.
        if (block.top > Math.min(...heights) + .04 && block.bottom < Math.max(...heights) + 4.3) return false;
      }
    }
    return true;
  }

  /** A photographed deck's depth is inferred. Retain its observed wall,
   * width and level, but fit the complete slab/posts/railing envelope. */
  fitProjection(frame: StairFrame, block: StairBlock, minimumDepth = 1, feature: 'deck' | 'exterior-stair' = 'deck'): number | undefined {
    if (this.fits(frame, [block])) return block.depth;
    const back = block.v - block.depth / 2, at = (depth: number): StairBlock => ({ ...block, v: back + depth / 2, depth });
    if (minimumDepth > block.depth || !this.fits(frame, [at(minimumDepth)])) {
      this.decisions.push({ id: frame.structId, status: 'omitted', blocks: 1, maximumProjection: back + block.depth, feature });
      return undefined;
    }
    let lo = minimumDepth, hi = block.depth;
    for (let i = 0; i < 16; i++) { const mid = (lo + hi) / 2; if (this.fits(frame, [at(mid)])) lo = mid; else hi = mid; }
    const depth = Math.max(minimumDepth, Math.floor(lo * 100) / 100);
    this.decisions.push({ id: frame.structId, status: 'compacted', blocks: 1, maximumProjection: back + depth, feature });
    return depth;
  }

  /** Keep a complete flight. Try a shorter inferred run, retaining at least a
   * 24cm tread and the full landing, before omitting an unsupported layout. */
  fitFlight(frame: StairFrame, blocks: readonly StairBlock[], record = true): StairBlock[] | undefined {
    if (this.fits(frame, blocks)) return [...blocks];
    const first = blocks[0]?.depth > .6 ? 1 : 0, flight = blocks.slice(first);
    if (flight.length > 1) {
      const tread = flight[1].v - flight[0].v, anchor = flight[0].v - flight[0].depth / 2;
      if (tread > MINIMUM_TREAD && flight.every((b, i) => i === 0 || Math.abs(b.v - flight[i - 1].v - tread) < 1e-5)) {
        const ratio = MINIMUM_TREAD / tread, shorter = [...blocks.slice(0, first), ...flight.map(b => ({ ...b, v: anchor + (b.v - anchor) * ratio, depth: b.depth * ratio }))];
        if (this.fits(frame, shorter)) {
          if (record) this.decisions.push({ id: frame.structId, status: 'compacted', blocks: blocks.length, maximumProjection: Math.max(...shorter.map(b => b.v + b.depth / 2)) });
          return shorter;
        }
      }
    }
    if (record) this.decisions.push({ id: frame.structId, status: 'omitted', blocks: blocks.length, maximumProjection: Math.max(...blocks.map(b => b.v + b.depth / 2)) });
    return undefined;
  }
}
