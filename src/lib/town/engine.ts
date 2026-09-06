import { classifyTurnOptions, chooseTurnOption } from './turn-options';
import { roadSpeedLimitMps, cruiseCeilingMps } from './speed-policy';
import { reverseDrivingPosition } from './reverse-direction';

/** Road-guided simulation using the source geometry from driving/drive_webster.py.
 * Positions are local east/north/up metres. Rendering may map [x,y,z] to
 * Three.js [x,z,-y]; never change the network or simulation coordinate system.
 * No browser, renderer, physics library, or React dependency.
 */
export type Vec3 = [number, number, number];
export type XY = readonly [number, number];
export type TurnRequest = 'LEFT' | 'RIGHT' | null;
export type TurnLabel = 'Left' | 'Right' | 'Straight' | 'U-turn';
export type Pose = [position: Vec3, tangent: Vec3];
export interface BlockedSpan { from_m: number; lane_from_m?: number; [key: string]: unknown }
export interface RoadEdge {
  id: number; from: number; to: number; points: number[][];
  name?: string; speed_kph?: number; lane_offset_m?: number; width_m?: number;
  physical_id?: number; blocked_spans?: BlockedSpan[]; [key: string]: unknown;
}
export interface NetworkData {
  edges: RoadEdge[];
  blocked_turns?: { from_edge: number; to_edge: number; [key: string]: unknown }[];
  [key: string]: unknown;
}
export interface Choice { edgeId: number; angleDeg: number; label: TurnLabel; name: string }
export interface Connector { path: Path; trim: number; fromTrim: number; speed: number; angle: number; nextId: number }
export interface PlannedConnection extends Connector { choice: Choice }
export interface Junction { edgeId: number; distance: number; choices: Choice[]; selected: Choice | null; obstacle?: boolean }

export const MPH = 0.44704;
export const LANDMARKS = {
  DOWNTOWN: { name: 'Downtown / Town Hall', xy: [-2794.49126, -907.79101] as XY },
  LAKE: { name: 'Webster Lake / South Pond', xy: [1667.19788, -3368.22769] as XY },
  BEACH: { name: 'Memorial Beach', xy: [-874.48813, -443.51927] as XY },
  RANCH: { name: 'Indian Ranch', xy: [424.12913, -487.71768] as XY },
  BARTLETT: { name: 'Bartlett High', xy: [-2035.88441, -1776.97041] as XY },
  // Authored viewpoint beside a verified southbound School Street graph point.
  // Offset west of the centreline selects its right-hand lane, not a parcel centroid.
  SCHOOL: { name: 'School Street homes', xy: [-3088.50, -1099.42] as XY },
} as const;
export type LandmarkKey = keyof typeof LANDMARKS;

export function add(a: Vec3, b: Vec3): Vec3 { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
export function sub(a: Vec3, b: Vec3): Vec3 { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
export function mul(a: Vec3, k: number): Vec3 { return [a[0] * k, a[1] * k, a[2] * k]; }
export function length(a: Vec3): number { return Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]); }
export function xyLength(a: Vec3): number { return Math.hypot(a[0], a[1]); }
export function lerp(a: Vec3, b: Vec3, t: number): Vec3 { return add(mul(a, 1 - t), mul(b, t)); }
export function clamp(v: number, lo: number, hi: number): number { return Math.min(hi, Math.max(lo, v)); }
export function normalized(a: Vec3): Vec3 { const n = length(a); return n > 1e-9 ? mul(a, 1 / n) : [0, 1, 0]; }
export function headingAngle(a: Vec3, b: Vec3): number {
  return Math.atan2(a[0] * b[1] - a[1] * b[0], a[0] * b[0] + a[1] * b[1]) * (180 / Math.PI);
}
function required<K, V>(map: Map<K, V>, key: K, kind: string): V {
  const value = map.get(key);
  if (value === undefined) throw new Error(`Unknown ${kind}: ${String(key)}`);
  return value;
}

/** Piecewise-linear 3D path parameterized by horizontal distance. */
export class Path {
  points: Vec3[] = [];
  distance: number[] = [0];
  length: number;

  constructor(points: readonly (readonly number[])[]) {
    for (const point of points) {
      if (point.length < 2 || !point.slice(0, 3).every(Number.isFinite)) throw new Error('Road points must contain finite XY coordinates.');
      const p: Vec3 = [Number(point[0]), Number(point[1]), Number(point[2] ?? 0)];
      if (!this.points.length || xyLength(sub(p, this.points[this.points.length - 1])) > 1e-5) this.points.push(p);
    }
    if (this.points.length < 2) throw new Error('A road path needs two distinct XY points.');
    for (let i = 1; i < this.points.length; i++) this.distance.push(this.distance[i - 1] + xyLength(sub(this.points[i], this.points[i - 1])));
    this.length = this.distance[this.distance.length - 1];
  }

  sample(distance: number): Pose {
    const s = clamp(distance, 0, this.length);
    // Python bisect_right, including exact vertices and the final endpoint.
    let lo = 0, hi = this.distance.length;
    while (lo < hi) { const mid = (lo + hi) >>> 1; if (s < this.distance[mid]) hi = mid; else lo = mid + 1; }
    const i = Math.min(this.points.length - 2, Math.max(0, lo - 1));
    const a = this.points[i], b = this.points[i + 1];
    const fraction = (s - this.distance[i]) / (this.distance[i + 1] - this.distance[i]);
    return [lerp(a, b, fraction), normalized(sub(b, a))];
  }

  curvature(s: number, radius = 4): number {
    const a = this.sample(s - radius)[0], b = this.sample(s)[0], c = this.sample(s + radius)[0];
    const ab = sub(b, a), bc = sub(c, b), ca = sub(a, c);
    const denominator = xyLength(ab) * xyLength(bc) * xyLength(ca);
    return denominator < 1e-6 ? 0 : 2 * (ab[0] * bc[1] - ab[1] * bc[0]) / denominator;
  }
}

export function roundedPath(input: readonly (readonly number[])[], offset = 0): Path {
  const points = new Path(input).points;
  const rounded: Vec3[] = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const a = points[i - 1], b = points[i], c = points[i + 1];
    const incoming = sub(b, a), outgoing = sub(c, b);
    const l1 = xyLength(incoming), l2 = xyLength(outgoing);
    const angle = Math.abs(headingAngle(incoming, outgoing) * (Math.PI / 180));
    if (angle < 0.025) { rounded.push(b); continue; }
    const trim = Math.min(l1 * 0.32, l2 * 0.32, 3.5, 0.9 / Math.max(0.1, Math.sin(angle / 2)));
    const p = lerp(b, a, trim / l1), q = lerp(b, c, trim / l2);
    rounded.push(p);
    for (let step = 1; step < 9; step++) {
      const t = step / 8;
      rounded.push(add(add(mul(p, (1 - t) ** 2), mul(b, 2 * t * (1 - t))), mul(q, t * t)));
    }
  }
  rounded.push(points[points.length - 1]);
  const center = new Path(rounded), count = Math.max(2, Math.ceil(center.length / 1.5) + 1);
  const positions = Array.from({ length: count }, (_, i) => center.sample(center.length * i / (count - 1))[0]);
  let offsets = positions.map((p, i) => {
    const a = positions[Math.max(0, i - 2)], c = positions[Math.min(count - 1, i + 2)];
    const ab = sub(p, a), bc = sub(c, p), ca = sub(a, c);
    const denominator = xyLength(ab) * xyLength(bc) * xyLength(ca);
    const curvature = denominator > 1e-6 ? Math.abs(2 * (ab[0] * bc[1] - ab[1] * bc[0]) / denominator) : 0;
    return Math.min(offset, 0.4 / Math.max(0.0001, curvature));
  });
  const conservative = offsets.map((_, i) => Math.min(...offsets.slice(Math.max(0, i - 2), Math.min(count, i + 3))));
  offsets = conservative.map((_, i) => {
    const nearby = conservative.slice(Math.max(0, i - 2), Math.min(count, i + 3));
    return nearby.reduce((sum, value) => sum + value, 0) / nearby.length;
  });
  return new Path(positions.map((p, i) => {
    const s = center.length * i / (count - 1);
    const before = center.sample(Math.max(0, s - 1.5))[0], after = center.sample(Math.min(center.length, s + 1.5))[0];
    const direction = normalized(sub(after, before)), planar = Math.max(1e-8, xyLength(direction));
    return [p[0] + offsets[i] * direction[1] / planar, p[1] - offsets[i] * direction[0] / planar, p[2]];
  }));
}

export class RoadGraph {
  data: NetworkData;
  edges = new Map<number, RoadEdge & { name: string; speed_kph: number }>();
  outgoing = new Map<number, number[]>();
  paths = new Map<number, Path>();
  obstacleStops = new Map<number, number>();
  blockedTurns = new Set<string>();
  grid = new Map<string, Set<number>>();
  choiceCache = new Map<number, Choice[]>();

  constructor(data: NetworkData) {
    this.data = data;
    for (const edge of data.edges) {
      if (!Number.isInteger(edge.id) || !Number.isInteger(edge.from) || !Number.isInteger(edge.to)) throw new Error('Road IDs must be integers.');
      this.edges.set(edge.id, { ...edge, name: edge.name ?? 'Unnamed local road', speed_kph: edge.speed_kph ?? 40 });
    }
    for (const item of data.blocked_turns ?? []) this.blockedTurns.add(`${item.from_edge},${item.to_edge}`);
    for (const edge of this.edges.values()) {
      const path = roundedPath(edge.points, Number(edge.lane_offset_m ?? 1.5));
      this.paths.set(edge.id, path);
      const spans = edge.blocked_spans ?? [];
      if (spans.length) {
        const sourceLength = new Path(edge.points).length;
        const first = Math.min(...spans.map(span => span.lane_from_m !== undefined ? Number(span.lane_from_m) : Number(span.from_m) * path.length / sourceLength));
        this.obstacleStops.set(edge.id, Math.max(0, first - 2.6));
      }
      const outgoing = this.outgoing.get(edge.from) ?? [];
      outgoing.push(edge.id); this.outgoing.set(edge.from, outgoing);
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const p of edge.points) { minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]); minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); }
      for (let ix = Math.floor(minX / 120); ix <= Math.floor(maxX / 120); ix++) {
        for (let iy = Math.floor(minY / 120); iy <= Math.floor(maxY / 120); iy++) {
          const key = `${ix},${iy}`, cell = this.grid.get(key) ?? new Set<number>();
          cell.add(edge.id); this.grid.set(key, cell);
        }
      }
    }
    if (!this.edges.size) throw new Error('The embedded driving road network is empty.');
  }

  choices(edgeId: number): Choice[] {
    const cached = this.choiceCache.get(edgeId); if (cached) return cached;
    const edge = required(this.edges, edgeId, 'road'), path = required(this.paths, edgeId, 'path');
    const incoming = path.sample(path.length)[1], choices: Choice[] = [], inverses: Choice[] = [];
    for (const candidate of this.outgoing.get(edge.to) ?? []) {
      if (this.blockedTurns.has(`${edgeId},${candidate}`)) continue;
      const other = required(this.edges, candidate, 'road'), otherPath = required(this.paths, candidate, 'path');
      if ((this.obstacleStops.get(candidate) ?? 1e20) <= Math.min(11, otherPath.length * 0.32) + 0.5) continue;
      const angle = headingAngle(incoming, otherPath.sample(0)[1]);
      const inverse = other.to === edge.from && (other.physical_id ?? candidate) === (edge.physical_id ?? edgeId);
      const label: TurnLabel = Math.abs(angle) >= 150 ? 'U-turn' : angle > 25 ? 'Left' : angle < -25 ? 'Right' : 'Straight';
      (inverse ? inverses : choices).push({ edgeId: candidate, angleDeg: angle, label, name: other.name });
    }
    const result = classifyTurnOptions(edge, choices.length ? choices : inverses, this.edges);
    this.choiceCache.set(edgeId, result); return result;
  }

  choose(edgeId: number, requested: TurnRequest = null): Choice | null {
    return chooseTurnOption(this.choices(edgeId), required(this.edges, edgeId, 'road').name, requested);
  }

  connector(edgeId: number, nextId: number): Connector {
    const a = required(this.paths, edgeId, 'path'), b = required(this.paths, nextId, 'path');
    const angle = Math.abs(headingAngle(a.sample(a.length)[1], b.sample(0)[1]));
    const fromTrim = Math.min(a.length * 0.32, 11), trim = Math.min(b.length * 0.32, 11);
    const [p0, d0] = a.sample(a.length - fromTrim), [p3, d3] = b.sample(trim);
    const chord = xyLength(sub(p3, p0));
    const incomingHandle = angle > 150 ? Math.min(Math.max(3, fromTrim * 0.8), 8) : Math.max(0.08, Math.min(fromTrim * 0.85, chord * 0.6));
    const outgoingHandle = angle > 150 ? Math.min(Math.max(3, trim * 0.8), 8) : Math.max(0.08, Math.min(trim * 0.85, chord * 0.6));
    const p1 = add(p0, mul(d0, incomingHandle)), p2 = sub(p3, mul(d3, outgoingHandle));
    p1[2] = p0[2] + (p3[2] - p0[2]) / 3; p2[2] = p0[2] + (p3[2] - p0[2]) * 2 / 3;
    const samples = Math.max(64, Math.trunc((trim + fromTrim + chord) * 2)), points: Vec3[] = [];
    const appendCubic = (controls: Vec3[], count: number) => {
      for (let i = 0; i <= count; i++) {
        const t = (1 - Math.cos(Math.PI * i / count)) / 2, u = 1 - t;
        points.push(add(add(mul(controls[0], u ** 3), mul(controls[1], 3 * u * u * t)), add(mul(controls[2], 3 * u * t * t), mul(controls[3], t ** 3))));
      }
    };
    if (angle > 150 && chord < 0.3) {
      const forward = normalized([d0[0], d0[1], 0]), right: Vec3 = [forward[1], -forward[0], 0];
      const reach = Math.min(5, Math.max(1, fromTrim * 0.8));
      const side = Math.min(1.4, Math.max(0.3, Number(required(this.edges, edgeId, 'road').width_m ?? 4) / 4));
      const top = add(p0, mul(forward, reach));
      appendCubic([p0, add(p0, mul(forward, reach * 0.6)), add(top, mul(right, side)), top], 64);
      appendCubic([top, sub(top, mul(right, side)), sub(p3, mul(d3, reach * 0.6)), p3], 64);
    } else appendCubic([p0, p1, p2, p3], samples);
    const path = new Path(points);
    let curvature = 0;
    for (let i = 1; i < 30; i++) curvature = Math.max(curvature, Math.abs(path.curvature(path.length * i / 30, 1.5)));
    let speed = clamp(Math.sqrt(1.7 / Math.max(0.004, curvature)), 2.1, 16);
    if (angle > 150) speed = Math.min(speed, 2.4);
    return { path, trim, fromTrim, speed, angle, nextId };
  }

  nearest(xy: XY | readonly number[], preferConnected = true): [edgeId: number, s: number, distance: number] {
    let best: [distance: number, edgeId: number, s: number] | null = null;
    for (const [edgeId, path] of this.paths) {
      if (this.edges.get(edgeId)?.manual_reverse_of !== undefined) continue;
      if (preferConnected && (!this.choices(edgeId).length || this.obstacleStops.has(edgeId))) continue;
      for (let i = 0; i < path.points.length - 1; i++) {
        const a = path.points[i], b = path.points[i + 1], dx = b[0] - a[0], dy = b[1] - a[1];
        const t = clamp(((xy[0] - a[0]) * dx + (xy[1] - a[1]) * dy) / Math.max(1e-8, dx * dx + dy * dy), 0, 1);
        const p = lerp(a, b, t), distance = Math.hypot(xy[0] - p[0], xy[1] - p[1]);
        if (best === null || distance < best[0]) best = [distance, edgeId, path.distance[i] + t * (path.distance[i + 1] - path.distance[i])];
      }
    }
    if (best === null) throw new Error('No connected road is available near this landmark.');
    return [best[1], best[2], best[0]];
  }

  nearby(x: number, y: number, radius = 140): Set<number> {
    const ids = new Set<number>();
    for (let ix = Math.floor((x - radius) / 120); ix <= Math.floor((x + radius) / 120); ix++) {
      for (let iy = Math.floor((y - radius) / 120); iy <= Math.floor((y + radius) / 120); iy++) {
        for (const id of this.grid.get(`${ix},${iy}`) ?? []) ids.add(id);
      }
    }
    return ids;
  }
}

export class DriveEngine {
  graph: RoadGraph;
  edgeId: number;
  s: number;
  phase: 'ROAD' | 'TURN' = 'ROAD';
  connection: PlannedConnection | null = null;
  connectionS = 0;
  queued: TurnRequest = null;
  queuedEdge: number | null = null;
  cruiseAtLimit = false;
  speed = 0; cruise = 0; acceleration = 0;
  paused = false; distance = 0; elapsed = 0; junctions = 0;
  endOfRoute = false;
  lastMessage = 'Press Up to cruise. Choose turns with Left / Right.';
  history: [number, number][] = [];
  private planKey: string | null = null;
  private planValue: PlannedConnection | null = null;

  constructor(graph: RoadGraph, edgeId?: number, s = 0) {
    this.graph = graph;
    this.edgeId = edgeId ?? graph.edges.keys().next().value!;
    this.s = clamp(s, 0, this.path.length);
  }
  get edge() { return required(this.graph.edges, this.edgeId, 'road'); }
  get path() { return required(this.graph.paths, this.edgeId, 'path'); }

  plan(): PlannedConnection | null {
    if (this.obstacleAhead() !== undefined) return null;
    const requested = this.graph.choices(this.edgeId).length > 1 ? this.queued : null;
    const key = `${this.edgeId},${requested},${this.queuedEdge}`;
    if (this.planKey === key) return this.planValue;
    const choice = this.graph.choices(this.edgeId).find(choice => choice.edgeId === this.queuedEdge) ?? this.graph.choose(this.edgeId, requested);
    const plan = choice ? { ...this.graph.connector(this.edgeId, choice.edgeId), choice } : null;
    this.planKey = key; this.planValue = plan; return plan;
  }

  queue(direction: TurnRequest): void {
    this.queued = direction;
    this.queuedEdge = null;
    this.lastMessage = direction === 'LEFT' ? 'Left turn requested at the next junction.' : direction === 'RIGHT' ? 'Right turn requested at the next junction.' : 'Continuing straight where possible.';
  }

  queueChoice(edgeId: number): boolean {
    const choice = this.nextJunction()?.choices.find(option => option.edgeId === edgeId);
    if (!choice) return false;
    this.queued = null;
    this.queuedEdge = edgeId;
    this.lastMessage = `${choice.label} onto ${choice.name} selected.`;
    return true;
  }

  flipDirection(): boolean {
    const pose = this.pose();
    const target = reverseDrivingPosition(this.graph, this.phase === 'TURN' && this.connectionS > this.connection!.path.length / 2 ? this.connection!.nextId : this.edgeId, pose);
    if (!target) return false;
    this.edgeId = target.edgeId;
    this.s = target.s;
    this.phase = 'ROAD'; this.connection = null; this.connectionS = 0;
    this.planKey = null; this.planValue = null;
    this.queued = null; this.queuedEdge = null;
    this.acceleration = 0; this.endOfRoute = false;
    this.lastMessage = `Turned around on ${this.edge.name}.`;
    return true;
  }

  pose(ahead = 0): Pose {
    if (this.phase === 'TURN') {
      const connection = this.connection!, s = this.connectionS + ahead;
      if (s <= connection.path.length) return connection.path.sample(s);
      return required(this.graph.paths, connection.nextId, 'path').sample(connection.trim + s - connection.path.length);
    }
    const plan = this.plan(), s = this.s + ahead;
    if (plan && s > this.path.length - plan.fromTrim) {
      const over = s - (this.path.length - plan.fromTrim);
      if (over <= plan.path.length) return plan.path.sample(over);
      return required(this.graph.paths, plan.nextId, 'path').sample(plan.trim + over - plan.path.length);
    }
    return this.path.sample(s);
  }

  nextJunction(maximum = 400): Junction | null {
    let edgeId = this.phase === 'TURN' ? this.connection!.nextId : this.edgeId;
    let startS = this.phase === 'TURN' ? this.connection!.trim : this.s;
    let distance = this.phase === 'TURN' ? this.connection!.path.length - this.connectionS : 0;
    const seen = new Set<number>();
    for (let i = 0; i < 80; i++) {
      if (seen.has(edgeId)) return null; seen.add(edgeId);
      const obstacle = this.obstacleAhead(edgeId, startS);
      if (obstacle !== undefined) {
        distance += Math.max(0, obstacle - startS);
        return { edgeId, distance, choices: [], selected: null, obstacle: true };
      }
      distance += required(this.graph.paths, edgeId, 'path').length - startS;
      const choices = this.graph.choices(edgeId);
      if (choices.length > 1 || !choices.length || choices[0].label === 'U-turn') {
        return { edgeId, distance, choices, selected: choices.find(choice => choice.edgeId === this.queuedEdge) ?? this.graph.choose(edgeId, this.queued) };
      }
      const choice = this.graph.choose(edgeId);
      if (!choice || distance > maximum) return null;
      edgeId = choice.edgeId; startS = 0;
    }
    return null;
  }

  obstacleAhead(edgeId = this.edgeId, s = this.s): number | undefined {
    const first = this.graph.obstacleStops.get(edgeId);
    if (first === undefined || s <= first + 2.6) return first;
    const edge = required(this.graph.edges, edgeId, 'road');
    const path = required(this.graph.paths, edgeId, 'path');
    const scale = edge.blocked_spans?.some(span => span.lane_from_m === undefined || span.lane_to_m === undefined)
      ? path.length / new Path(edge.points).length : 1;
    const remaining = (edge.blocked_spans ?? []).map(span => ({
      from: Number(span.lane_from_m ?? Number(span.from_m) * scale),
      to: Number(span.lane_to_m ?? Number(span.to_m ?? span.from_m) * scale),
    })).filter(span => span.to + 0.15 >= s);
    return remaining.length ? Math.max(0, Math.min(...remaining.map(span => span.from)) - 2.6) : undefined;
  }

  roadLimit(): number {
    return roadSpeedLimitMps(this.phase === 'TURN' ? required(this.graph.edges, this.connection!.nextId, 'road') : this.edge);
  }

  speedLimit(): number {
    const limit = this.roadLimit();
    if (this.phase === 'TURN' || this.plan()) return limit;
    const remaining = Math.max(0, (this.obstacleAhead() ?? this.path.length) - this.s - 0.15);
    return Math.min(limit, Math.sqrt(2 * 2.2 * remaining));
  }

  /** Advance a known path distance; public for exact deterministic test fixtures. */
  advance(amount: number): void {
    let remaining = amount, transitions = 0;
    while (remaining > 1e-8 && transitions < 50) {
      if (this.phase === 'TURN') {
        const connection = this.connection!, available = connection.path.length - this.connectionS;
        const advance = Math.min(remaining, available);
        this.connectionS += advance; remaining -= advance;
        if (available <= advance + 1e-7) {
          const previous = this.edgeId;
          this.edgeId = connection.nextId; this.s = connection.trim;
          this.history.push([previous, this.edgeId]); this.history = this.history.slice(-1000);
          this.phase = 'ROAD'; this.connection = null; this.planKey = null; transitions++;
        }
      } else {
        const plan = this.plan(), end = this.obstacleAhead() ?? this.path.length - (plan?.fromTrim ?? 0);
        const available = Math.max(0, end - this.s), advance = Math.min(remaining, available);
        this.s += advance; remaining -= advance;
        if (available <= advance + 1e-7) {
          if (!plan) {
            this.speed = this.cruise = 0; this.cruiseAtLimit = false; this.endOfRoute = true;
            this.lastMessage = this.obstacleAhead() !== undefined
              ? 'Mapped building obstructs this road. Turn around or choose another starting location.'
              : 'End of mapped route. Turn around or choose another starting location.';
            break;
          }
          this.s = end; this.phase = 'TURN'; this.connection = plan; this.connectionS = 0;
          if (this.graph.choices(this.edgeId).length > 1) {
            this.junctions++;
            this.lastMessage = this.queued && plan.choice.label.toUpperCase() !== this.queued
              ? `No ${this.queued.toLowerCase()} branch here; taking ${plan.choice.label.toLowerCase()}.`
              : `${plan.choice.label} onto ${plan.choice.name}`;
            this.queued = null; this.queuedEdge = null;
          } else if (plan.choice.label === 'U-turn') this.lastMessage = 'Mapped dead end — turning around.';
          if (this.queuedEdge === plan.nextId) this.queuedEdge = null;
          transitions++;
        }
      }
    }
    this.distance += amount - remaining;
  }

  step(dt: number, throttle = false, brake = false, maxMph?: number): void {
    dt = clamp(dt, 0, 0.1);
    if (this.paused) return;
    this.elapsed += dt;
    if (throttle) { this.endOfRoute = false; this.cruiseAtLimit = true; }
    if (brake) this.cruiseAtLimit = false;
    if (this.cruiseAtLimit) this.cruise = cruiseCeilingMps(this.phase === 'TURN' ? required(this.graph.edges, this.connection!.nextId, 'road') : this.edge, maxMph);
    if (brake) this.cruise = Math.max(0, Math.min(this.cruise, this.speed) - 5.5 * dt);
    const target = Math.min(this.cruise, this.speedLimit());
    const desired = clamp((target - this.speed) * 1.7, brake ? -5.5 : -3.2, 1.9);
    this.acceleration += clamp(desired - this.acceleration, -5.5 * dt, 3.5 * dt);
    const previousSpeed = this.speed;
    this.speed = Math.max(0, this.speed + this.acceleration * dt);
    if (Math.abs(target - this.speed) < 0.015 && Math.abs(this.acceleration) < 0.08) this.speed = target;
    this.advance(Math.max(0, (previousSpeed + this.speed) * 0.5 * dt));
  }
}

export function advanceRealTime(engine: DriveEngine, elapsed: number, throttle = false, brake = false, maxMph?: number): number {
  let remaining = clamp(elapsed, 0, 0.5);
  const integrated = remaining;
  while (remaining > 1e-8) { const step = Math.min(1 / 60, remaining); engine.step(step, throttle, brake, maxMph); remaining -= step; }
  return integrated;
}

/** The same safe spawn/teleport used by the Blender modal operator. */
export function spawnAtLandmark(graph: RoadGraph, landmark: LandmarkKey = 'DOWNTOWN'): DriveEngine {
  const [edgeId, s] = graph.nearest(LANDMARKS[landmark].xy);
  const engine = new DriveEngine(graph, edgeId, s), plan = engine.plan();
  if (plan) engine.s = Math.min(s, engine.path.length - plan.fromTrim);
  return engine;
}
