import * as THREE from 'three';
import type { NetworkData, RoadEdge } from './engine';
import { GrassTerrain } from './grass';
import { StreetSigns } from './street-signs';

/**
 * Overhead utility corridors and curbside hydrants along named local,
 * collector and arterial streets. Webster's residential streets are lined with
 * wooden distribution poles carrying a primary crossarm, a neutral and a
 * lower communications bundle, with cobra-head lights on some poles; that
 * general pattern is recorded in the visual reference, but these particular
 * pole positions, spacing (about 40-48 m), transformer and light placement and
 * hydrant positions are authored from the road centrelines. They are not a
 * utility survey. Streets with mapped poles keep those instead.
 */
type Pole = { x: number; n: number; z: number; ox: number; on: number; tx: number; tn: number; light: boolean; transformer: boolean };
type Span = { a: number; b: number };
type Hydrant = { x: number; n: number; z: number; ox: number; on: number };
export type DressingReport = { poles: number; spans: number; hydrants: number; signs: number; triangles: number; bytes: number; skippedMapped: number };

const TILE = 250;
const POLE_TOP = 9.4;
const ELIGIBLE_TYPES = new Set([3, 4, 5]);
const tileKey = (x: number, n: number) => `${Math.floor(x / TILE)}_${Math.floor(n / TILE)}`;

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) / 4294967296;
}

function mulberry(seed: number): () => number {
  let a = Math.floor(seed * 4294967296) >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** Street centreline of a directed edge (lanes sit right of travel). */
function centreline(edge: RoadEdge): number[][] {
  // Both directed edges of a street share its centreline; lane_offset_m is
  // where traffic drives, to the right of it, not an offset of these points.
  return edge.points.map(p => [p[0], p[1], p[2] ?? 0]);
}

// The street and house dressing of one tile run back to back and share one
// terrain index; only the latest tile's index is kept, and it can be dropped.
let terrainGroup: THREE.Group | null = null, terrainIndex: GrassTerrain | null = null;

/** Terrain triangles of a tile in tile-local coordinates, for ground sampling. */
export function tileTerrain(group: THREE.Group): GrassTerrain {
  if (terrainGroup !== group || !terrainIndex) { terrainIndex = buildTileTerrain(group); terrainGroup = group; }
  return terrainIndex;
}

/** Releases the shared terrain index once a tile's dressing is complete. */
export function releaseTileTerrain(): void { terrainGroup = null; terrainIndex = null; }

function buildTileTerrain(group: THREE.Group): GrassTerrain {
  group.updateMatrixWorld(true);
  const inverse = group.matrixWorld.clone().invert(), terrain: THREE.Mesh[] = [];
  group.traverse(o => {
    if (!(o instanceof THREE.Mesh) || o.userData.townCrafted) return;
    for (let p: THREE.Object3D | null = o; p && p !== group; p = p.parent) if (p.name === 'terrain' || p.name.startsWith('terrain_')) {
      const proxy = new THREE.Mesh(o.geometry, o.material); proxy.matrixAutoUpdate = false; proxy.matrixWorld.copy(inverse).multiply(o.matrixWorld); terrain.push(proxy); break;
    }
  });
  return new GrassTerrain(terrain);
}

export class StreetDressing {
  private readonly poles: Pole[] = [];
  private readonly spans: Span[] = [];
  private readonly hydrants: Hydrant[] = [];
  private readonly polesByTile = new Map<string, number[]>();
  private readonly spansByTile = new Map<string, number[]>();
  private readonly hydrantsByTile = new Map<string, number[]>();
  private readonly materials: { wood: THREE.MeshStandardMaterial; metal: THREE.MeshStandardMaterial; porcelain: THREE.MeshStandardMaterial; hydrant: THREE.MeshStandardMaterial; cap: THREE.MeshStandardMaterial; lamp: THREE.MeshStandardMaterial; signPost: THREE.MeshStandardMaterial; wire: THREE.ShaderMaterial };
  private readonly signs: StreetSigns;
  private readonly viewport = new THREE.Vector2(1, 1);
  private readonly roadSamples = new Map<string, number[][]>();

  constructor(network: NetworkData) {
    this.signs = new StreetSigns(network);
    const degree = new Map<number, number>();
    const physical = new Map<number, RoadEdge[]>();
    for (const edge of network.edges) {
      const id = Number(edge.physical_id ?? edge.id);
      const list = physical.get(id); if (list) list.push(edge); else physical.set(id, [edge]);
    }
    for (const list of physical.values()) for (const node of [list[0].from, list[0].to]) degree.set(node, (degree.get(node) ?? 0) + 1);
    const nodePoint = new Map<number, number[]>();
    for (const list of physical.values()) { const e = list[0]; nodePoint.set(e.from, e.points[0]); nodePoint.set(e.to, e.points[e.points.length - 1]); }
    const junctions = [...degree.entries()].filter(([, d]) => d >= 3).map(([node]) => nodePoint.get(node)).filter((p): p is number[] => !!p);
    const junctionGrid = new Map<string, number[][]>();
    for (const p of junctions) { const k = `${Math.floor(p[0] / 50)}_${Math.floor(p[1] / 50)}`; const l = junctionGrid.get(k); if (l) l.push(p); else junctionGrid.set(k, [p]); }
    const nearJunction = (x: number, n: number, radius: number): boolean => {
      const cx = Math.floor(x / 50), cn = Math.floor(n / 50);
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const p of junctionGrid.get(`${cx + i}_${cn + j}`) ?? []) if (Math.hypot(p[0] - x, p[1] - n) < radius) return true;
      return false;
    };
    for (const [id, list] of physical) {
      const edge = list.find(e => Number(e.direction) === 1) ?? list[0];
      const name = String(edge.name ?? '');
      if (ELIGIBLE_TYPES.has(Number(edge.road_type))) this.indexRoad(centreline(edge), Number(edge.width_m ?? 7), Number(edge.road_type));
      if (!ELIGIBLE_TYPES.has(Number(edge.road_type)) || !name || name === 'Unnamed road' || /INTERSTATE|RAMP/i.test(name)) continue;
      const line = centreline(edge);
      const width = Number(edge.width_m ?? 7);
      const random = mulberry(hash(`${id}:${name}`));
      // One side per street: north or south of east-west runs, east or west of north-south runs.
      const sideChoice = hash(name) < 0.5 ? 1 : -1;
      const lengths = [0];
      for (let i = 1; i < line.length; i++) lengths.push(lengths[i - 1] + Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]));
      const total = lengths[lengths.length - 1];
      if (total < 30) continue;
      const at = (s: number): { p: number[]; tx: number; tn: number } => {
        let i = 1; while (i < lengths.length - 1 && lengths[i] < s) i++;
        const a = line[i - 1], b = line[i], seg = lengths[i] - lengths[i - 1] || 1, t = Math.min(1, Math.max(0, (s - lengths[i - 1]) / seg));
        const tx = (b[0] - a[0]) / seg, tn = (b[1] - a[1]) / seg;
        return { p: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t], tx, tn };
      };
      const outwardFor = (tx: number, tn: number): [number, number] => {
        // Left normal (-tn, tx); choose the one on the street's side.
        let ox = -tn, on = tx;
        const eastWest = Math.abs(tx) >= Math.abs(tn);
        const positive = eastWest ? on > 0 : ox > 0;
        if (positive !== (sideChoice > 0)) { ox = -ox; on = -on; }
        return [ox, on];
      };
      let s = 8 + random() * 14, previous = -1, count = 0;
      while (s < total - 8) {
        const { p, tx, tn } = at(s);
        const [ox, on] = outwardFor(tx, tn);
        const d = width / 2 + 0.75;
        const x = p[0] + ox * d, n = p[1] + on * d;
        if (!nearJunction(p[0], p[1], 13)) {
          const index = this.poles.length;
          this.poles.push({ x, n, z: p[2], ox, on, tx, tn, light: count % 3 === 1, transformer: random() < 0.2 });
          const key = tileKey(x, n); const l = this.polesByTile.get(key); if (l) l.push(index); else this.polesByTile.set(key, [index]);
          if (previous >= 0 && Math.hypot(this.poles[previous].x - x, this.poles[previous].n - n) < 62) {
            const span = this.spans.length; this.spans.push({ a: previous, b: index });
            const sk = tileKey(this.poles[previous].x, this.poles[previous].n); const sl = this.spansByTile.get(sk); if (sl) sl.push(span); else this.spansByTile.set(sk, [span]);
          }
          previous = index; count++;
        } else previous = -1;
        s += 40 + random() * 8;
      }
      // Hydrants on the far side of the street, roughly every 130 m.
      let h = 20 + random() * 60;
      while (h < total - 10) {
        const { p, tx, tn } = at(h);
        const [ox, on] = outwardFor(tx, tn);
        const d = width / 2 + 0.55;
        const x = p[0] - ox * d, n = p[1] - on * d;
        const index = this.hydrants.length;
        this.hydrants.push({ x, n, z: p[2], ox: -ox, on: -on });
        const key = tileKey(x, n); const l = this.hydrantsByTile.get(key); if (l) l.push(index); else this.hydrantsByTile.set(key, [index]);
        h += 115 + random() * 45;
      }
    }
    const standard = (name: string, color: string, roughness: number, metalness = 0): THREE.MeshStandardMaterial => {
      const m = new THREE.MeshStandardMaterial({ color, roughness, metalness });
      m.name = `Street dressing | ${name}`; m.userData.townCrafted = true; m.envMapIntensity = 0.3; return m;
    };
    this.materials = {
      wood: standard('weathered creosote pole', '#4a3f33', 0.92),
      metal: standard('galvanized hardware', '#8b908d', 0.5, 0.6),
      porcelain: standard('insulators', '#b9c2bd', 0.35),
      hydrant: standard('hydrant red', '#9b1f18', 0.55),
      cap: standard('hydrant bonnet', '#d8d4c6', 0.5),
      lamp: standard('luminaire lens', '#e9e6d8', 0.3),
      signPost: standard('galvanized sign post', '#a3a8a4', 0.42, 0.75),
      wire: wireMaterial(this.viewport),
    };
  }

  private indexRoad(line: number[][], width: number, type: number): void {
    for (let i = 1; i < line.length; i++) {
      const a = line[i - 1], b = line[i], length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (length < 1e-3) continue;
      const tx = (b[0] - a[0]) / length, tn = (b[1] - a[1]) / length;
      for (let s = 0; s < length; s += 4) {
        const t = s / length, x = a[0] + (b[0] - a[0]) * t, n = a[1] + (b[1] - a[1]) * t, z = a[2] + (b[2] - a[2]) * t;
        const key = `${Math.floor(x / 20)}_${Math.floor(n / 20)}`;
        const cell = this.roadSamples.get(key), row = [x, n, z, tx, tn, width, type];
        if (cell) cell.push(row); else this.roadSamples.set(key, [row]);
      }
    }
  }

  /** Nearest sampled street centreline point within `max` metres (east/north). */
  nearestRoad(x: number, n: number, max = 40): { x: number; n: number; z: number; tx: number; tn: number; width: number; type: number; distance: number } | null {
    let best: number[] | undefined, distance = max;
    const cx = Math.floor(x / 20), cn = Math.floor(n / 20), reach = Math.ceil(max / 20);
    for (let i = -reach; i <= reach; i++) for (let j = -reach; j <= reach; j++) for (const row of this.roadSamples.get(`${cx + i}_${cn + j}`) ?? []) {
      const d = Math.hypot(row[0] - x, row[1] - n);
      if (d < distance) { distance = d; best = row; }
    }
    return best ? { x: best[0], n: best[1], z: best[2], tx: best[3], tn: best[4], width: best[5], type: best[6], distance } : null;
  }

  resources(): { poles: number; spans: number; hydrants: number; signs: number } {
    return { poles: this.poles.length, spans: this.spans.length, hydrants: this.hydrants.length, signs: this.signs.count };
  }

  /** Adds the tile's dressing (once). `mapped` are east/north points of mapped poles in or near the tile. */
  apply(group: THREE.Group, tileId: string, origin: readonly number[], level: number, mapped: readonly number[][]): DressingReport | undefined {
    if (group.userData.streetDressing) return group.userData.streetDressing;
    const report: DressingReport = { poles: 0, spans: 0, hydrants: 0, signs: 0, triangles: 0, bytes: 0, skippedMapped: 0 };
    const poleIds = this.polesByTile.get(tileId) ?? [], spanIds = this.spansByTile.get(tileId) ?? [], hydrantIds = this.hydrantsByTile.get(tileId) ?? [];
    const signs = level > 1 ? [] : this.signs.placements(tileId);
    if (!poleIds.length && !hydrantIds.length && !signs.length) { group.userData.streetDressing = report; return report; }
    const ground = tileTerrain(group);
    const local = (x: number, y: number, n: number): [number, number, number] => [x - origin[0], y - origin[1], -n - origin[2]];
    const groundAt = (x: number, n: number, fallback: number): number => {
      const p = ground.sample(x - origin[0], -n - origin[2]);
      const y = p ? p.y + origin[1] : fallback;
      return Math.abs(y - fallback) < 3 ? y : fallback;
    };
    const builder = new Builder();
    const skipped = new Set<number>();
    for (const id of poleIds) {
      const pole = this.poles[id];
      if (mapped.some(m => Math.hypot(m[0] - pole.x, m[1] - pole.n) < 22)) { skipped.add(id); report.skippedMapped++; continue; }
      const base = groundAt(pole.x, pole.n, pole.z) - 0.6, top = pole.z + POLE_TOP;
      const c = local(pole.x, 0, pole.n);
      // Tapered, slightly leaning pole.
      builder.cylinder('wood', [c[0], base, c[2]], [c[0] + pole.ox * 0.06, top, c[2] - pole.on * 0.06], 0.145, 0.105, level ? 6 : 8);
      if (level > 1) { report.poles++; continue; }
      // Crossarm across the street direction, with three pin insulators.
      const ax = pole.ox, az = -pole.on;
      const arm = (t: number): [number, number, number] => [c[0] + pole.ox * 0.06 + ax * t, top - 0.42, c[2] - pole.on * 0.06 + az * t];
      builder.beam('wood', arm(-1.2), arm(1.2), 0.055, 4);
      for (const t of [-1.0, -0.35, 1.0]) { const p = arm(t); builder.cylinder('porcelain', [p[0], p[1] + 0.05, p[2]], [p[0], p[1] + 0.2, p[2]], 0.045, 0.035, 6); }
      // Braces.
      builder.beam('metal', arm(-0.7), [c[0] + pole.ox * 0.05, top - 1.05, c[2] - pole.on * 0.05], 0.018, 4);
      builder.beam('metal', arm(0.7), [c[0] + pole.ox * 0.05, top - 1.05, c[2] - pole.on * 0.05], 0.018, 4);
      if (pole.transformer) {
        const tx = c[0] + pole.ox * 0.38, tz = c[2] - pole.on * 0.38;
        builder.cylinder('metal', [tx, top - 2.35, tz], [tx, top - 1.45, tz], 0.27, 0.27, 10);
        builder.cylinder('metal', [tx, top - 1.45, tz], [tx, top - 1.38, tz], 0.29, 0.2, 10);
      }
      if (pole.light) {
        // Cobra-head light reaching over the street.
        const sx = c[0], sz = c[2], rx = -pole.ox, rz = pole.on;
        const bend: [number, number, number] = [sx + rx * 1.3, top - 2.55, sz + rz * 1.3];
        builder.beam('metal', [sx, top - 2.9, sz], bend, 0.03, 5);
        builder.beam('metal', bend, [sx + rx * 2.1, top - 2.5, sz + rz * 2.1], 0.03, 5);
        builder.box('metal', [sx + rx * 2.35, top - 2.52, sz + rz * 2.35], [rx, rz], 0.62, 0.14, 0.28);
        builder.box('lamp', [sx + rx * 2.38, top - 2.6, sz + rz * 2.38], [rx, rz], 0.46, 0.02, 0.2);
      }
      report.poles++;
    }
    for (const id of spanIds) {
      const span = this.spans[id], a = this.poles[span.a], b = this.poles[span.b];
      if (skipped.has(span.a) || skipped.has(span.b) || mapped.some(m => Math.hypot(m[0] - b.x, m[1] - b.n) < 22)) continue;
      const topA = a.z + POLE_TOP, topB = b.z + POLE_TOP;
      const pa = local(a.x + a.ox * 0.06, 0, a.n + a.on * 0.06), pb = local(b.x + b.ox * 0.06, 0, b.n + b.on * 0.06);
      const length = Math.hypot(pb[0] - pa[0], pb[2] - pa[2]);
      const wires: { dy: number; offset: number; sag: number; radius: number }[] = level > 1
        ? [{ dy: -0.3, offset: 0, sag: 0.9, radius: 0.012 }, { dy: -3.4, offset: 0.12, sag: 0.8, radius: 0.028 }]
        : [{ dy: -0.25, offset: -1.0, sag: 0.75, radius: 0.009 }, { dy: -0.25, offset: -0.35, sag: 0.75, radius: 0.009 }, { dy: -0.25, offset: 1.0, sag: 0.75, radius: 0.009 },
           { dy: -1.35, offset: 0.12, sag: 0.85, radius: 0.011 }, { dy: -3.4, offset: 0.14, sag: 0.95, radius: 0.028 }, { dy: -3.75, offset: 0.14, sag: 1.0, radius: 0.018 }];
      for (const w of wires) {
        const offsetA: [number, number] = [a.ox * w.offset, -a.on * w.offset], offsetB: [number, number] = [b.ox * w.offset, -b.on * w.offset];
        const start: [number, number, number] = [pa[0] + offsetA[0], topA + w.dy - origin[1], pa[2] + offsetA[1]];
        const end: [number, number, number] = [pb[0] + offsetB[0], topB + w.dy - origin[1], pb[2] + offsetB[1]];
        builder.wire(start, end, w.sag * (length / 44) ** 2, w.radius, level ? 6 : 10);
      }
      report.spans++;
    }
    for (const id of hydrantIds) {
      const h = this.hydrants[id], y = groundAt(h.x, h.n, h.z) - 0.05, c = local(h.x, 0, h.n);
      builder.cylinder('hydrant', [c[0], y, c[2]], [c[0], y + 0.1, c[2]], 0.16, 0.16, 10);
      builder.cylinder('hydrant', [c[0], y + 0.1, c[2]], [c[0], y + 0.62, c[2]], 0.115, 0.105, 10);
      builder.cylinder('cap', [c[0], y + 0.62, c[2]], [c[0], y + 0.74, c[2]], 0.13, 0.06, 10);
      builder.cylinder('cap', [c[0], y + 0.74, c[2]], [c[0], y + 0.8, c[2]], 0.03, 0.025, 6);
      const rx = -h.ox, rz = h.on;
      builder.cylinder('hydrant', [c[0], y + 0.46, c[2]], [c[0] + rx * 0.2, y + 0.46, c[2] + rz * 0.2], 0.055, 0.055, 8);
      builder.cylinder('hydrant', [c[0] - rz * 0.02, y + 0.42, c[2] + rx * 0.02], [c[0] + rz * 0.17, y + 0.42, c[2] - rx * 0.17], 0.04, 0.04, 8);
      builder.cylinder('hydrant', [c[0] + rz * 0.02, y + 0.42, c[2] - rx * 0.02], [c[0] - rz * 0.17, y + 0.42, c[2] + rx * 0.17], 0.04, 0.04, 8);
      report.hydrants++;
    }
    for (const sign of signs) {
      const base = groundAt(sign.x, sign.n, sign.z), c = local(sign.x, 0, sign.n);
      builder.cylinder('signPost', [c[0], base - origin[1] - 0.3, c[2]], [c[0], base - origin[1] + 2.98, c[2]], 0.032, 0.03, 8);
      builder.cylinder('signPost', [c[0], base - origin[1] + 2.98, c[2]], [c[0], base - origin[1] + 3.0, c[2]], 0.04, 0.02, 8);
      report.signs++;
    }
    const built = builder.finish(this.materials);
    if (signs.length) {
      const blades = this.signs.blades(tileId, local, groundAt);
      if (blades) built.add(blades);
    }
    if (built.children.length) { built.name = 'Street dressing'; group.add(built); }
    built.traverse(o => { if (o instanceof THREE.Mesh) { report.triangles += (o.geometry.index?.count ?? o.geometry.getAttribute('position').count) / 3; for (const a of Object.values(o.geometry.attributes)) report.bytes += (a as THREE.BufferAttribute).array.byteLength; } });
    group.userData.streetDressing = report;
    return report;
  }

  dispose(): void {
    for (const material of Object.values(this.materials)) material.dispose();
    this.signs.dispose();
  }
}

type Role = string;

/** Merged solid geometry per role plus screen-width-aware wire ribbons. */
export class Builder {
  private solid = new Map<Role, { p: number[]; n: number[] }>();
  private wires = { p: [] as number[], dir: [] as number[], side: [] as number[], radius: [] as number[], index: [] as number[] };

  private target(role: Role) { let t = this.solid.get(role); if (!t) this.solid.set(role, t = { p: [], n: [] }); return t; }

  cylinder(role: Role, a: number[], b: number[], r0: number, r1: number, sides: number): void {
    const t = this.target(role);
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), axis = B.clone().sub(A);
    const len = axis.length(); if (len < 1e-5) return;
    axis.divideScalar(len);
    const u = Math.abs(axis.y) < 0.9 ? new THREE.Vector3(0, 1, 0).cross(axis).normalize() : new THREE.Vector3(1, 0, 0).cross(axis).normalize();
    const v = axis.clone().cross(u);
    const ring = (i: number) => { const ang = (i / sides) * Math.PI * 2; return u.clone().multiplyScalar(Math.cos(ang)).add(v.clone().multiplyScalar(Math.sin(ang))); };
    const slope = (r0 - r1) / len;
    for (let i = 0; i < sides; i++) {
      const d0 = ring(i), d1 = ring(i + 1);
      const p00 = A.clone().addScaledVector(d0, r0), p01 = A.clone().addScaledVector(d1, r0), p10 = B.clone().addScaledVector(d0, r1), p11 = B.clone().addScaledVector(d1, r1);
      const n0 = d0.clone().addScaledVector(axis, slope).normalize(), n1 = d1.clone().addScaledVector(axis, slope).normalize();
      // Counter-clockwise from outside (u, v, axis is right-handed).
      for (const [p, n] of [[p00, n0], [p11, n1], [p10, n0], [p00, n0], [p01, n1], [p11, n1]] as [THREE.Vector3, THREE.Vector3][]) { t.p.push(p.x, p.y, p.z); t.n.push(n.x, n.y, n.z); }
      // Top cap.
      for (const p of [B, p10, p11]) { t.p.push(p.x, p.y, p.z); t.n.push(axis.x, axis.y, axis.z); }
    }
  }

  beam(role: Role, a: number[], b: number[], r: number, sides: number): void { this.cylinder(role, a, b, r, r, sides); }

  /** Axis-aligned-in-plan box: `dir` (east, north-ish in three x/z) is its length axis. */
  box(role: Role, center: number[], dir: [number, number], length: number, height: number, width: number): void {
    const t = this.target(role);
    const L = new THREE.Vector3(dir[0], 0, dir[1]).normalize(), W = new THREE.Vector3(-L.z, 0, L.x), H = new THREE.Vector3(0, 1, 0);
    const C = new THREE.Vector3(...center);
    // Each face (n, a, b) has cross(a, b) = n, so its quads wind outward.
    const nL = L.clone().negate(), nW = W.clone().negate(), nH = H.clone().negate();
    const faces: [THREE.Vector3, THREE.Vector3, THREE.Vector3, number, number, number][] = [
      [L, H, W, length, height, width], [nL, W, H, length, width, height],
      [W, L, H, width, length, height], [nW, H, L, width, height, length],
      [H, W, L, height, width, length], [nH, L, W, height, length, width],
    ];
    for (const [n, a, b, dn, da, db] of faces) {
      const c = C.clone().addScaledVector(n, dn / 2);
      const q = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([i, j]) => c.clone().addScaledVector(a, i * da / 2).addScaledVector(b, j * db / 2));
      for (const k of [0, 1, 2, 0, 2, 3]) { t.p.push(q[k].x, q[k].y, q[k].z); t.n.push(n.x, n.y, n.z); }
    }
  }

  /**
   * A straight board from a to b (any slope): `up` sets which way its
   * `height` extends (made perpendicular to the board), `depth` its thickness.
   */
  board(role: Role, a: THREE.Vector3, b: THREE.Vector3, up: THREE.Vector3, height: number, depth: number): void {
    const t = this.target(role);
    const L = new THREE.Vector3().subVectors(b, a), length = L.length();
    if (length < 1e-4) return;
    L.divideScalar(length);
    const H = up.clone().addScaledVector(L, -up.dot(L));
    if (H.lengthSq() < 1e-8) return;
    H.normalize();
    const D = new THREE.Vector3().crossVectors(L, H);
    const C = a.clone().add(b).multiplyScalar(0.5);
    const nL = L.clone().negate(), nH = H.clone().negate(), nD = D.clone().negate();
    // Faces (n, u, v) with cross(u, v) = n wind outward, as in box().
    const faces: [THREE.Vector3, THREE.Vector3, THREE.Vector3, number, number, number][] = [
      [D, L, H, depth, length, height], [nD, H, L, depth, height, length],
      [H, D, L, height, depth, length], [nH, L, D, height, length, depth],
      [L, H, D, length, height, depth], [nL, D, H, length, depth, height],
    ];
    for (const [n, u, v, dn, du, dv] of faces) {
      const c = C.clone().addScaledVector(n, dn / 2);
      const q = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([i, j]) => c.clone().addScaledVector(u, i * du / 2).addScaledVector(v, j * dv / 2));
      for (const k of [0, 1, 2, 0, 2, 3]) { t.p.push(q[k].x, q[k].y, q[k].z); t.n.push(n.x, n.y, n.z); }
    }
  }

  /** A ground-hugging quad; wound to face up. */
  quad(role: Role, corners: THREE.Vector3[]): void {
    const t = this.target(role);
    const n = new THREE.Vector3().subVectors(corners[1], corners[0]).cross(new THREE.Vector3().subVectors(corners[2], corners[0]));
    const flip = n.y < 0;
    if (flip) n.negate();
    n.normalize();
    for (const k of flip ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3]) { t.p.push(corners[k].x, corners[k].y, corners[k].z); t.n.push(n.x, n.y, n.z); }
  }

  /** A sagging conductor drawn as a screen-width-aware ribbon. */
  wire(a: [number, number, number], b: [number, number, number], sag: number, radius: number, segments: number): void {
    const w = this.wires, point = (t: number) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - 4 * sag * t * (1 - t), a[2] + (b[2] - a[2]) * t];
    for (let i = 0; i < segments; i++) {
      const p0 = point(i / segments), p1 = point((i + 1) / segments);
      const d = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]], l = Math.hypot(d[0], d[1], d[2]) || 1;
      const base = w.p.length / 3;
      for (const p of [p0, p0, p1, p1]) w.p.push(p[0], p[1], p[2]);
      for (let k = 0; k < 4; k++) { w.dir.push(d[0] / l, d[1] / l, d[2] / l); w.radius.push(radius); }
      w.side.push(-1, 1, -1, 1);
      w.index.push(base, base + 1, base + 2, base + 2, base + 1, base + 3);
    }
  }

  finish(materials: Record<string, THREE.Material>): THREE.Group {
    const group = new THREE.Group();
    for (const [role, data] of this.solid) {
      if (!data.p.length) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(data.p, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(data.n, 3));
      g.computeBoundingBox(); g.computeBoundingSphere();
      const mesh = new THREE.Mesh(g, materials[role]);
      mesh.name = `Street dressing | ${role}`; mesh.userData.townCrafted = true;
      mesh.castShadow = role === 'wood' || role === 'hydrant' || role === 'chimney'; mesh.receiveShadow = true;
      group.add(mesh);
    }
    if (this.wires.p.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(this.wires.p, 3));
      g.setAttribute('townWireDir', new THREE.Float32BufferAttribute(this.wires.dir, 3));
      g.setAttribute('townWireSide', new THREE.Float32BufferAttribute(this.wires.side, 1));
      g.setAttribute('townWireRadius', new THREE.Float32BufferAttribute(this.wires.radius, 1));
      g.setIndex(this.wires.index);
      g.computeBoundingBox(); g.computeBoundingSphere();
      g.boundingSphere!.radius += 2;
      const mesh = new THREE.Mesh(g, materials.wire);
      mesh.name = 'Street dressing | overhead wires'; mesh.userData.townCrafted = true;
      mesh.renderOrder = 2; mesh.frustumCulled = true;
      group.add(mesh);
    }
    return group;
  }
}

/** Conductors stay at least ~1.3 px wide and fade by their true coverage, so
 * thin wires neither vanish nor shimmer at distance. Unlit dark cable. */
function wireMaterial(viewport: THREE.Vector2): THREE.ShaderMaterial {
  const material = new THREE.ShaderMaterial({
    name: 'Street dressing | overhead wire',
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { diffuse: { value: new THREE.Color('#151719') }, townViewport: { value: viewport } }]),
    vertexShader: /* glsl */`
uniform vec2 townViewport;
attribute vec3 townWireDir;
attribute float townWireSide;
attribute float townWireRadius;
varying float vTownWireAlpha;
#include <fog_pars_vertex>
void main() {
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  vec4 clip = projectionMatrix * mvPosition;
  vec4 ahead = projectionMatrix * (modelViewMatrix * vec4(position + townWireDir * 0.5, 1.0));
  vec2 ndc = clip.xy / clip.w, ndcAhead = ahead.xy / ahead.w;
  vec2 along = (ndcAhead - ndc) * townViewport * 0.5;
  float alongLength = length(along);
  vec2 across = alongLength > 1e-5 ? vec2(-along.y, along.x) / alongLength : vec2(0.0, 1.0);
  float pixelsPerMetre = townViewport.y * 0.5 * projectionMatrix[1][1] / max(-mvPosition.z, 0.05);
  float widthPx = 2.0 * townWireRadius * pixelsPerMetre;
  float drawPx = max(widthPx, 1.3);
  vTownWireAlpha = clamp(widthPx / drawPx, 0.0, 1.0);
  clip.xy += across * townWireSide * drawPx / townViewport * clip.w;
  gl_Position = clip;
  #include <fog_vertex>
}`,
    fragmentShader: /* glsl */`
uniform vec3 diffuse;
varying float vTownWireAlpha;
#include <common>
#include <fog_pars_fragment>
void main() {
  gl_FragColor = vec4(diffuse, 0.25 + 0.7 * vTownWireAlpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`,
    transparent: true,
    depthWrite: false,
    fog: true,
  });
  material.userData.townCrafted = true;
  return material;
}

/** Keeps the wire width uniform in sync with the drawing buffer. */
export function updateDressingViewport(dressing: StreetDressing | undefined, renderer: THREE.WebGLRenderer): void {
  if (!dressing) return;
  renderer.getDrawingBufferSize((dressing as unknown as { viewport: THREE.Vector2 }).viewport);
}
