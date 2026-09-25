import * as THREE from 'three';
import type { NetworkData, RoadEdge } from './engine';

/**
 * Lane coordinates for the drivable asphalt, so the surface can wear the way
 * trafficked New England pavement does: darker polished wheel paths, a patchy
 * oil-drip band down each lane, paler untrafficked margins, gutter grime and
 * sealed longitudinal and transverse cracks. Each road vertex receives its
 * signed distance from the nearest street centreline, the distance along that
 * street, the carriageway half-width (negative for one-way streets) and a
 * weight that fades the effect out at junctions and off the carriageway.
 * The coordinates come from the mapped centrelines; the wear itself is an
 * authored interpretation, not a pavement condition survey.
 */
export const ROAD_LANE_ATTRIBUTE = 'townRoadLane';
export const WALK_WEAR_MATERIALS = new Set(['Streetscape | warm sidewalk concrete', 'Streetscape | cool sidewalk concrete', 'Streetscape | repaired sidewalk concrete']);
export type RoadWearReport = { meshes: number; vertices: number; worn: number; bytes: number };

type Segment = { ax: number; an: number; tx: number; tn: number; length: number; s0: number; half: number; twoWay: boolean; road: number };
const CELL = 25;

function centreline(edge: RoadEdge): number[][] {
  // Directed edges share the street centreline; lane_offset_m is the driving line.
  return edge.points.map(p => [p[0], p[1]]);
}

export class RoadWear {
  private readonly segments: Segment[] = [];
  private readonly grid = new Map<string, number[]>();

  constructor(network: NetworkData) {
    const physical = new Map<number, RoadEdge[]>();
    for (const edge of network.edges) {
      const id = Number(edge.physical_id ?? edge.id);
      const list = physical.get(id); if (list) list.push(edge); else physical.set(id, [edge]);
    }
    // A named street keeps one identity through the nodes that split it into
    // edges, so wear only fades where a different street meets it.
    const streets = new Map<string, number>();
    for (const [id, list] of physical) {
      const edge = list.find(e => Number(e.direction) === 1) ?? list[0];
      const name = String(edge.name ?? '');
      const key = name && name !== 'Unnamed road' ? `name:${name}` : `edge:${id}`;
      if (!streets.has(key)) streets.set(key, streets.size);
      const road = streets.get(key)!;
      const width = Number(edge.width_m ?? 7);
      if (!(width > 2)) continue;
      const line = centreline(edge);
      const twoWay = list.length > 1 && Math.abs(Number(edge.lane_offset_m ?? 0)) > 0.2;
      let s = 0;
      for (let i = 1; i < line.length; i++) {
        const a = line[i - 1], b = line[i], length = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (length < 1e-3) continue;
        const index = this.segments.length;
        this.segments.push({ ax: a[0], an: a[1], tx: (b[0] - a[0]) / length, tn: (b[1] - a[1]) / length, length, s0: s, half: width / 2, twoWay, road });
        s += length;
        const minX = Math.floor((Math.min(a[0], b[0]) - width) / CELL), maxX = Math.floor((Math.max(a[0], b[0]) + width) / CELL);
        const minN = Math.floor((Math.min(a[1], b[1]) - width) / CELL), maxN = Math.floor((Math.max(a[1], b[1]) + width) / CELL);
        for (let x = minX; x <= maxX; x++) for (let n = minN; n <= maxN; n++) {
          const key = `${x}_${n}`, cell = this.grid.get(key);
          if (cell) cell.push(index); else this.grid.set(key, [index]);
        }
      }
    }
  }

  /** Nearest segment to an east/north point, and the gap to the nearest other road's edge. */
  private nearest(x: number, n: number): { segment: Segment; distance: number; otherGap: number } | null {
    let best: Segment | null = null, bestD = Infinity, otherGap = Infinity;
    const candidates = this.grid.get(`${Math.floor(x / CELL)}_${Math.floor(n / CELL)}`);
    if (!candidates) return null;
    const perRoad = new Map<number, number>();
    for (const i of candidates) {
      const s = this.segments[i];
      const dx = x - s.ax, dn = n - s.an, t = Math.min(s.length, Math.max(0, dx * s.tx + dn * s.tn));
      const d = Math.hypot(dx - s.tx * t, dn - s.tn * t);
      const edgeGap = d - s.half;
      if (edgeGap < (perRoad.get(s.road) ?? Infinity)) perRoad.set(s.road, edgeGap);
      if (d < bestD) { bestD = d; best = s; }
    }
    if (!best) return null;
    for (const [road, gap] of perRoad) if (road !== best.road) otherGap = Math.min(otherGap, gap);
    return { segment: best, distance: bestD, otherGap };
  }

  /** Adds lane coordinates to the tile's drive-road meshes (once). */
  apply(group: THREE.Group, origin: readonly number[]): RoadWearReport {
    const existing = group.userData.roadWear as RoadWearReport | undefined;
    if (existing) return existing;
    const report: RoadWearReport = { meshes: 0, vertices: 0, worn: 0, bytes: 0 };
    group.userData.roadWear = report;
    group.updateMatrixWorld(true);
    const inverse = group.matrixWorld.clone().invert(), relative = new THREE.Matrix4();
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    group.traverse(object => {
      if (!(object instanceof THREE.Mesh) || object instanceof THREE.InstancedMesh) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      // Drive asphalt and its paved inventory variants; earth and gravel roads keep their own finish.
      const paved = (m: THREE.Material | undefined) => !!m?.name?.startsWith('Drive road | asphalt') && ![1, 2].includes(Number(m.userData?.townRoadSurfaceType));
      const walk = (m: THREE.Material | undefined) => !!m && WALK_WEAR_MATERIALS.has(m.name);
      const road = materials.some(paved);
      if (!road && !materials.some(walk)) return;
      const groups = (object.geometry as THREE.BufferGeometry).groups;
      const eligible = (t: number) => {
        if (!groups.length) return paved(materials[0]) || walk(materials[0]);
        const group = groups.find((g: { start: number; count: number }) => t >= g.start && t < g.start + g.count);
        const m = group ? materials[group.materialIndex ?? 0] : undefined;
        return paved(m) || walk(m);
      };
      // Main Street's registered walks already carry their own joint rhythm.
      const main = object.geometry.getAttribute('townMainCoord');
      const geometry = object.geometry as THREE.BufferGeometry, position = geometry.getAttribute('position');
      if (!position || geometry.hasAttribute(ROAD_LANE_ATTRIBUTE)) return;
      relative.copy(inverse).multiply(object.matrixWorld);
      const values = new Float32Array(position.count * 4);
      const index = geometry.index, count = index ? index.count : position.count;
      const east = (v: THREE.Vector3) => v.x + origin[0], north = (v: THREE.Vector3) => -(v.z + origin[2]);
      const nearCache = new Map<number, ReturnType<RoadWear['nearest']>>();
      for (let t = 0; t + 2 < count; t += 3) {
        if (!eligible(t)) continue;
        const ids = [index ? index.getX(t) : t, index ? index.getX(t + 1) : t + 1, index ? index.getX(t + 2) : t + 2];
        a.fromBufferAttribute(position, ids[0]).applyMatrix4(relative);
        b.fromBufferAttribute(position, ids[1]).applyMatrix4(relative);
        c.fromBufferAttribute(position, ids[2]).applyMatrix4(relative);
        const cx = (east(a) + east(b) + east(c)) / 3, cn = (north(a) + north(b) + north(c)) / 3;
        const found = this.nearest(cx, cn);
        if (!found || found.distance > found.segment.half + (road ? 1.5 : 7.0)) continue;
        const s = found.segment;
        for (const [k, v] of [a, b, c].entries()) {
          const x = east(v), n = north(v), dx = x - s.ax, dn = n - s.an;
          const along = s.s0 + dx * s.tx + dn * s.tn;
          // Left of travel is positive.
          const lateral = -dx * s.tn + dn * s.tx;
          // Fade out where another street's carriageway comes within a few metres.
          let near = nearCache.get(ids[k]);
          if (near === undefined) { near = this.nearest(x, n); nearCache.set(ids[k], near); }
          const gap = near && near.segment.road === s.road ? near.otherGap : Math.min(near?.otherGap ?? Infinity, 0);
          let weight = Math.min(1, Math.max(0, (gap - 1.0) / 6.0));
          if (main && (main.getX(ids[k]) !== 0 || main.getY(ids[k]) !== 0)) weight = 0;
          const o = ids[k] * 4;
          values[o] = lateral; values[o + 1] = along; values[o + 2] = s.twoWay ? s.half : -s.half; values[o + 3] = weight;
          if (weight > 0) report.worn++;
        }
      }
      geometry.setAttribute(ROAD_LANE_ATTRIBUTE, new THREE.BufferAttribute(values, 4));
      report.meshes++; report.vertices += position.count; report.bytes += values.byteLength;
    });
    return report;
  }
}

/**
 * Albedo and roughness wear for drive asphalt, in the art-material asphalt
 * pass. Expects vTownRoadLane, vTownArtWorld, townArtNoise, townArtHash and
 * townArtFootprint; sets townRoadWearRough for the roughness stage.
 */
export const ROAD_WEAR_GLSL = `
float townRoadWeight = clamp(vTownRoadLane.w, 0.0, 1.0);
float townRoadHalf = abs(vTownRoadLane.z);
float townRoadLat = abs(vTownRoadLane.x);
float townRoadAlong = vTownRoadLane.y;
float townRoadWearRough = 0.0;
float townRoadSeal = 0.0;
if (townRoadWeight > 0.001 && townRoadHalf > 1.0) {
  // Lane centres sit a quarter-width out on two-way streets, mid-road on one-way.
  float townLaneCentre = vTownRoadLane.z > 0.0 ? townRoadHalf * 0.5 : 0.0;
  float townFromLane = abs(townRoadLat - townLaneCentre);
  float townLaneBreak = townArtNoise(vec2(townRoadAlong * 0.55, townRoadLat * 2.3));
  float townWheel = exp(-pow((townFromLane - 0.82) / 0.32, 2.0));
  float townDrip = exp(-pow(townFromLane / 0.30, 2.0)) * smoothstep(0.35, 0.85, townArtNoise(vec2(townRoadAlong * 2.1, townRoadLat * 6.0 + 3.7)));
  float townMargin = smoothstep(townLaneCentre + 1.3, townLaneCentre + 2.2, townRoadLat);
  float townGutter = smoothstep(townRoadHalf - 0.55, townRoadHalf - 0.05, townRoadLat);
  // The whole travel lane is a little darker and smoother than the margins;
  // the wheel paths most of all, with a patchy oil-drip band between them.
  float townTravelled = 1.0 - smoothstep(1.2, 1.8, townFromLane);
  vec3 townWear = vec3(1.0 - townWheel * 0.14 * mix(0.55, 1.0, townLaneBreak) - townTravelled * 0.04);
  townWear *= 1.0 - townDrip * 0.2;
  townWear *= mix(1.0, 1.06, townMargin * (1.0 - townGutter));
  townWear = mix(townWear, townWear * vec3(0.95, 0.92, 0.86), townGutter * mix(0.5, 1.0, townLaneBreak));
  diffuseColor.rgb *= mix(vec3(1.0), townWear, townRoadWeight);
  townRoadWearRough = (-townWheel * 0.07 - townDrip * 0.05 + townGutter * 0.03) * townRoadWeight;
  // Sealed cracks: the paving joint down the centre, thermal cracks across the
  // carriageway every ten to eighteen metres, and edge cracking near the curb.
  float townCrackAA = max(townArtFootprint * 0.7, 0.002);
  float townCrackResolved = 1.0 - smoothstep(0.012, 0.05, townArtFootprint);
  float townJointWobble = (townArtNoise(vec2(townRoadAlong * 0.35, 1.3)) - 0.5) * 0.09;
  float townJointOn = step(0.35, townArtNoise(vec2(townRoadAlong * 0.045, 7.1)));
  float townJoint = (1.0 - smoothstep(0.012, 0.02 + townCrackAA, abs(vTownRoadLane.x - townJointWobble))) * townJointOn;
  float townCell = floor(townRoadAlong / 13.0);
  float townCellSeed = townArtHash(vec2(townCell, 19.7));
  float townCrackAt = (townCell + 0.2 + townCellSeed * 0.6) * 13.0 + (townArtNoise(vec2(townRoadLat * 0.9, townCell * 3.1)) - 0.5) * 0.7;
  float townCrackReach = townRoadHalf * mix(0.45, 1.0, townArtHash(vec2(townCell, 3.3)));
  float townTransverse = (1.0 - smoothstep(0.011, 0.018 + townCrackAA, abs(townRoadAlong - townCrackAt)))
    * step(0.4, townCellSeed) * (1.0 - smoothstep(townCrackReach - 0.4, townCrackReach, townRoadLat));
  float townEdgeLine = townRoadHalf - 0.55 - townArtNoise(vec2(townRoadAlong * 0.08, 5.1)) * 0.5;
  float townEdgeCrack = (1.0 - smoothstep(0.01, 0.017 + townCrackAA, abs(townRoadLat - townEdgeLine - (townArtNoise(vec2(townRoadAlong * 0.6, 2.2)) - 0.5) * 0.12)))
    * step(0.55, townArtNoise(vec2(townRoadAlong * 0.06, 11.9)));
  // Utility-cut patches: rectangles of newer, darker asphalt with sealed seams.
  float townPatchCell = floor(townRoadAlong / 34.0);
  float townPatchSeed = townArtHash(vec2(townPatchCell, 71.3));
  float townPatchSide = townArtHash(vec2(townPatchCell, 13.1)) < 0.5 ? -1.0 : 1.0;
  vec2 townPatchSize = vec2(mix(1.4, 4.2, townArtHash(vec2(townPatchCell, 5.7))), mix(0.9, 2.2, townArtHash(vec2(townPatchCell, 8.3))));
  vec2 townPatchCentre = vec2((townPatchCell + 0.2 + 0.6 * townPatchSeed) * 34.0, townPatchSide * clamp(mix(0.6, townRoadHalf - 1.2, townArtHash(vec2(townPatchCell, 2.9))), 0.5, townRoadHalf));
  vec2 townPatchD = abs(vec2(townRoadAlong, vTownRoadLane.x) - townPatchCentre) - townPatchSize * 0.5;
  float townPatchInside = step(0.62, townPatchSeed) * (1.0 - smoothstep(-townCrackAA, townCrackAA, max(townPatchD.x, townPatchD.y)));
  float townPatchSeam = step(0.62, townPatchSeed) * (1.0 - smoothstep(0.012, 0.022 + townCrackAA, abs(max(townPatchD.x, townPatchD.y)))) * townCrackResolved;
  diffuseColor.rgb = mix(diffuseColor.rgb, mix(vec3(dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722))), diffuseColor.rgb, 0.6) * 0.72, townPatchInside * townRoadWeight);
  townRoadWearRough += townPatchInside * 0.03 * townRoadWeight;
  townRoadSeal = max(max(max(townJoint, townTransverse), townEdgeCrack), townPatchSeam) * townCrackResolved * townRoadWeight;
  diffuseColor.rgb *= 1.0 - townRoadSeal * 0.42;
  townRoadWearRough -= townRoadSeal * 0.18;
  townArtHeight -= townRoadSeal * 0.0004;
  // Cast-iron manhole covers in the lanes, every sixty to ninety metres.
  float townHoleCell = floor(townRoadAlong / 76.0);
  float townHoleSeed = townArtHash(vec2(townHoleCell, 41.3));
  float townHoleSide = townArtHash(vec2(townHoleCell, 7.9)) < 0.5 ? -1.0 : 1.0;
  vec2 townHoleD = vec2(townRoadAlong - (townHoleCell + 0.15 + 0.7 * townHoleSeed) * 76.0, vTownRoadLane.x - townHoleSide * (townLaneCentre + (townArtHash(vec2(townHoleCell, 3.1)) - 0.5) * 0.9));
  float townHoleR = length(townHoleD);
  float townHole = step(0.3, townHoleSeed) * (1.0 - smoothstep(0.34, 0.34 + townCrackAA, townHoleR)) * townRoadWeight;
  float townHoleRim = step(0.3, townHoleSeed) * (1.0 - smoothstep(0.34, 0.47 + townCrackAA, townHoleR)) * townRoadWeight;
  float townHoleGrid = step(0.5, fract(townHoleD.x * 9.0 + 0.25)) * step(0.5, fract(townHoleD.y * 9.0 + 0.25));
  float townHoleRing = 1.0 - smoothstep(0.02, 0.03 + townCrackAA, abs(townHoleR - 0.3));
  float townHoleRaised = max(townHoleGrid * step(townHoleR, 0.27), townHoleRing);
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.8, townHoleRim * (1.0 - townHole));
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.045, 0.043, 0.041) * mix(0.8, 1.35, townHoleRaised), townHole);
  townRoadWearRough += townHole * (0.55 - 0.25 * townHoleRaised - 0.9);
  townArtHeight += townHole * townHoleRaised * 0.0025 * townCrackResolved;
  // Curb-side storm-drain grates.
  float townDrainCell = floor(townRoadAlong / 88.0);
  float townDrainSeed = townArtHash(vec2(townDrainCell, 17.7));
  float townDrainSide = townArtHash(vec2(townDrainCell, 29.5)) < 0.5 ? -1.0 : 1.0;
  vec2 townDrainD = vec2(townRoadAlong - (townDrainCell + 0.2 + 0.6 * townDrainSeed) * 88.0, vTownRoadLane.x - townDrainSide * (townRoadHalf - 0.36));
  float townDrain = step(0.35, townDrainSeed) * (1.0 - smoothstep(0.0, townCrackAA, max(abs(townDrainD.x) - 0.45, abs(townDrainD.y) - 0.3))) * townRoadWeight;
  float townDrainSlot = step(0.45, fract(townDrainD.x * 16.0)) * step(abs(townDrainD.y), 0.25) * step(abs(townDrainD.x), 0.4);
  diffuseColor.rgb = mix(diffuseColor.rgb, mix(vec3(0.05, 0.047, 0.043), vec3(0.004), townDrainSlot), townDrain);
  townRoadWearRough += townDrain * (0.5 - 0.9);
  townArtHeight -= townDrain * townDrainSlot * 0.004 * townCrackResolved;
}
`;

/**
 * Sidewalk concrete along a street: tooled control joints every five feet,
 * slab-to-slab tone from separate pours and grime toward the curb. Expects
 * the same lane coordinates as the asphalt.
 */
export const WALK_WEAR_GLSL = `
float townWalkWeight = clamp(vTownRoadLane.w, 0.0, 1.0);
if (townWalkWeight > 0.001 && abs(vTownRoadLane.z) > 1.0) {
  float townWalkFromCurb = abs(vTownRoadLane.x) - abs(vTownRoadLane.z);
  float townWalkAA = max(townArtFootprint * 0.7, 0.002);
  float townWalkResolved = 1.0 - smoothstep(0.015, 0.06, townArtFootprint);
  float townWalkPhase = vTownRoadLane.y / 1.524;
  float townWalkJoint = (1.0 - smoothstep(0.004, 0.008 + townWalkAA, abs(fract(townWalkPhase + 0.5) - 0.5) * 1.524)) * townWalkResolved;
  float townSlab = townArtHash(vec2(floor(townWalkPhase), floor(townWalkFromCurb / 1.6) + 3.1));
  vec3 townWalk = vec3(mix(0.93, 1.06, townSlab));
  townWalk *= 1.0 - 0.08 * (1.0 - smoothstep(0.15, 0.9, townWalkFromCurb));
  townWalk *= 1.0 - townWalkJoint * 0.38;
  diffuseColor.rgb *= mix(vec3(1.0), townWalk, townWalkWeight);
  townArtHeight -= townWalkJoint * 0.0015 * townWalkWeight;
}
`;
