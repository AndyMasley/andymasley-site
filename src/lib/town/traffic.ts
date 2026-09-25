import * as THREE from 'three';
import { DriveEngine, type RoadGraph, type Vec3 } from './engine';
import { TemplateFleet } from './parked-life';
import { applyArtMaterial } from './art-materials';

/**
 * Light local traffic. A handful of cars drive the same mapped lanes as the
 * player at each road's limit, take turns at random (mostly straight on), slow
 * for turns, keep a safe gap to whatever is ahead in their lane (the player's
 * car included) and hold back while another vehicle is inside the junction
 * they are about to enter. They appear and leave well away from the player,
 * outside the camera's view or deep in the haze. The player's car eases off
 * behind a slower car ahead. Tail lamps light while a car brakes or waits.
 * Numbers, routes and colours are authored; this is not a traffic count.
 */
export type TrafficMetrics = { cars: number; spawned: number; retired: number; yields: number; braking: number };
type Car = { engine: DriveEngine; id: number; color: THREE.Color; scale: number; chose: number | null; waited: number; yielding: boolean };
/** Where an approaching car stands: the junction node it is heading for and its distance to the turn. */
type Approach = { node: number; toJunction: number; range: number; id: number };
type Vehicle = { engine: DriveEngine; position: Vec3; tangent: Vec3 };

const PALETTE = ['#ecebe3', '#aeb7b8', '#56666b', '#8e2e2b', '#263e57', '#d0c3a4', '#333739', '#647261', '#9aa3a6', '#1f2a33', '#7b1f24', '#2d4a3a'];
/** Template car length (m) and the radius within which a vehicle ahead is in this lane. */
const LENGTH = 4.6, LANE = 1.9;
/** Extra following distance (m) behind the player's car, which the chase camera sits 9 m behind. */
const PLAYER_MARGIN = 9;
/** Spawn ring, the distance inside which a spawn must be out of view, and the retirement distance (m). */
export const TRAFFIC_RANGE = { min: 170, max: 380, view: 330, retire: 430 } as const;

function mulberry(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export class Traffic {
  readonly root: THREE.Group;
  readonly metrics: TrafficMetrics = { cars: 0, spawned: 0, retired: 0, yields: 0, braking: 0 };
  private readonly fleet: TemplateFleet;
  private readonly cars: Car[] = [];
  private readonly random: () => number;
  private readonly eligibility = new Map<number, boolean>();
  private readonly matrix = new THREE.Matrix4();
  private readonly forward = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private readonly up = new THREE.Vector3();
  private readonly worldUp = new THREE.Vector3(0, 1, 0);
  private readonly size = new THREE.Vector3();
  private clock = 0;
  private serial = 0;

  constructor(private readonly graph: RoadGraph, readonly capacity = 12, seed = 0x7a11c) {
    this.fleet = new TemplateFleet(capacity, 'Traffic | moving cars');
    // Same paint, glass and rubber response as the parked cars.
    for (const material of this.fleet.materials) applyArtMaterial(material);
    this.root = this.fleet.group;
    this.random = mulberry(seed);
  }

  /** Current cars (read-only views for tests and diagnostics). */
  get vehicles(): readonly DriveEngine[] { return this.cars.map(car => car.engine); }

  /**
   * Advances traffic by `dt` seconds when `running`, retires and spawns cars
   * around the player, sets the player's lead limit for its next step, and
   * places the instanced cars. `camera` decides what is out of view.
   */
  update(dt: number, player: DriveEngine, camera: THREE.Camera, running: boolean): void {
    const here = player.pose()[0];
    camera.getWorldDirection(this.forward);
    const flat = Math.hypot(this.forward.x, this.forward.z) || 1;
    const view = { x: camera.position.x, z: camera.position.z, fx: this.forward.x / flat, fz: this.forward.z / flat };
    const hidden = (p: Vec3, d: number): boolean => {
      const wx = p[0] - view.x, wz = -p[1] - view.z;
      return d > TRAFFIC_RANGE.view || (wx * view.fx + wz * view.fz) / (Math.hypot(wx, wz) || 1) < 0.45;
    };
    for (let i = this.cars.length - 1; i >= 0; i--) {
      const car = this.cars[i], p = car.engine.pose()[0], d = Math.hypot(p[0] - here[0], p[1] - here[1]);
      const done = d > TRAFFIC_RANGE.retire || car.engine.endOfRoute || car.waited > 30;
      if ((done && hidden(p, d)) || d > 900) { this.cars.splice(i, 1); this.metrics.retired++; }
    }
    if (running) {
      this.clock += dt;
      if (this.cars.length < this.capacity && this.clock > 0.4) { this.clock = 0; this.spawn(here, hidden); }
      const vehicles: Vehicle[] = [player, ...this.cars.map(car => car.engine)].map(engine => { const [position, tangent] = engine.pose(); return { engine, position, tangent }; });
      const approaches = new Map<DriveEngine, Approach>();
      for (const car of this.cars) {
        const plan = car.engine.phase === 'ROAD' ? car.engine.plan() : null;
        if (plan) approaches.set(car.engine, { node: car.engine.edge.to, toJunction: car.engine.path.length - plan.fromTrim - car.engine.s, range: approachRange(car.engine.speed), id: car.id });
      }
      for (const car of this.cars) this.drive(car, Math.min(dt, 0.1), vehicles, approaches);
      const gap = this.gap(player, vehicles);
      player.leadLimit = gap === undefined ? Infinity : followSpeed(gap);
    }
    this.place();
  }

  /** Removes every car (after a teleport, for example). */
  clear(player?: DriveEngine): void {
    this.metrics.retired += this.cars.length;
    this.cars.length = 0;
    if (player) player.leadLimit = Infinity;
    this.place();
  }

  dispose(): void {
    this.cars.length = 0;
    this.fleet.dispose();
  }

  private eligible(edgeId: number): boolean {
    let known = this.eligibility.get(edgeId);
    if (known === undefined) {
      const edge = this.graph.edges.get(edgeId), path = this.graph.paths.get(edgeId);
      known = !!edge && !!path && edge.manual_reverse_of === undefined && path.length > 30
        && !this.graph.obstacleStops.has(edgeId) && !this.graph.boundaryStops.has(edgeId) && this.graph.choices(edgeId).length > 0;
      this.eligibility.set(edgeId, known);
    }
    return known;
  }

  private spawn(here: Vec3, hidden: (p: Vec3, d: number) => boolean): void {
    const candidates = [...this.graph.nearby(here[0], here[1], TRAFFIC_RANGE.max)];
    for (let attempt = 0; attempt < 8 && candidates.length; attempt++) {
      const edgeId = candidates[Math.floor(this.random() * candidates.length)];
      if (!this.eligible(edgeId)) continue;
      const path = this.graph.paths.get(edgeId)!;
      const s = 6 + this.random() * (path.length - 12);
      const p = path.sample(s)[0], d = Math.hypot(p[0] - here[0], p[1] - here[1]);
      if (d < TRAFFIC_RANGE.min || d > TRAFFIC_RANGE.max || !hidden(p, d)) continue;
      if (this.cars.some(car => { const q = car.engine.pose()[0]; return Math.hypot(q[0] - p[0], q[1] - p[1]) < 40; })) continue;
      const engine = new DriveEngine(this.graph, edgeId, s);
      engine.cruiseAtLimit = true;
      engine.speed = engine.cruise = engine.roadLimit() * 0.85;
      this.cars.push({ engine, id: this.serial++, color: new THREE.Color(PALETTE[Math.floor(this.random() * PALETTE.length)]), scale: 0.96 + this.random() * 0.05, chose: null, waited: 0, yielding: false });
      this.metrics.spawned++;
      return;
    }
  }

  private drive(car: Car, dt: number, vehicles: Vehicle[], approaches: Map<DriveEngine, Approach>): void {
    const engine = car.engine;
    // Choose the next junction's branch once, mostly straight on, never a U-turn by choice.
    const next = engine.nextJunction(160);
    if (next && next.choices.length > 1 && car.chose !== next.edgeId) {
      car.chose = next.edgeId;
      const options = next.choices.filter(choice => choice.label !== 'U-turn');
      const weights = options.map(choice => choice.label === 'Straight' ? 3 : choice.label === 'Right' ? 1.4 : 1);
      let pick = this.random() * weights.reduce((a, b) => a + b, 0);
      const choice = options.find((_, i) => (pick -= weights[i]) <= 0) ?? options[0];
      if (choice) engine.queueChoice(choice.edgeId);
    }
    let limit = Infinity;
    const plan = engine.phase === 'ROAD' ? engine.plan() : null;
    const toJunction = plan ? engine.path.length - plan.fromTrim - engine.s : Infinity;
    // Slow for turns: into the connector at its comfortable speed, and through it.
    if (engine.phase === 'TURN' && engine.connection!.choice.label !== 'Straight') limit = Math.max(3, engine.connection!.speed);
    if (plan && plan.choice.label !== 'Straight') limit = Math.min(limit, Math.sqrt(Math.max(3, plan.speed) ** 2 + 2 * 2.2 * Math.max(0, toJunction)));
    // Hang further back from the player's car, out of the chase camera's frame.
    const gap = this.gap(engine, vehicles, PLAYER_MARGIN);
    if (gap !== undefined) limit = Math.min(limit, followSpeed(gap));
    // Hold at the junction while another vehicle is moving inside it.
    const busy = plan !== null && toJunction < approachRange(engine.speed) && this.junctionBusy(engine, vehicles, approaches);
    if (busy) {
      limit = Math.min(limit, Math.sqrt(2 * 3 * Math.max(0, toJunction - 1.5)));
      if (!car.yielding) this.metrics.yields++;
      car.waited += dt;
    } else car.waited = 0;
    car.yielding = busy;
    engine.leadLimit = limit;
    engine.step(dt, true, false);
  }

  /**
   * Bumper gap (m) to the nearest vehicle ahead along this engine's own route,
   * if one is close; the player's car (the first vehicle) counts `playerMargin` metres nearer.
   */
  private gap(engine: DriveEngine, vehicles: Vehicle[], playerMargin = 0): number | undefined {
    const reach = Math.max(30, engine.speed * 3.2) + playerMargin;
    for (let d = 2.5; d <= reach; d += 2.5) {
      const [q, t] = engine.pose(d);
      for (const v of vehicles) {
        if (v.engine === engine || Math.abs(v.position[0] - q[0]) > LANE || Math.abs(v.position[1] - q[1]) > LANE) continue;
        // Oncoming traffic, whose lane can pass close on tight bends, is not ahead in this lane.
        if (Math.hypot(v.position[0] - q[0], v.position[1] - q[1]) < LANE && Math.abs(v.position[2] - q[2]) < 3 && v.tangent[0] * t[0] + v.tangent[1] * t[1] > -0.5) return d - LENGTH - (v === vehicles[0] ? playerMargin : 0);
      }
    }
    return undefined;
  }

  /**
   * Whether this car must hold at its line: another vehicle is moving through
   * the junction, the player is approaching it, or another car nearer the
   * junction (or level with it and earlier) goes first. The order is total, so
   * two cars waiting at one junction never wait on each other.
   */
  private junctionBusy(engine: DriveEngine, vehicles: Vehicle[], approaches: Map<DriveEngine, Approach>): boolean {
    const node = engine.edge.points[engine.edge.points.length - 1], mine = approaches.get(engine);
    for (const v of vehicles) {
      if (v.engine === engine) continue;
      // Turning through this junction, or just leaving it (a car waiting at its own line does not hold it).
      if (v.engine.phase === 'TURN' && v.engine.edge.to === engine.edge.to) return true;
      const d = Math.hypot(v.position[0] - node[0], v.position[1] - node[1]);
      if (d < 9 && v.engine.speed > 1) return true;
      const other = approaches.get(v.engine);
      if (mine && other && other.node === mine.node && other.toJunction < other.range
        && (other.toJunction < mine.toJunction - 0.5 || (Math.abs(other.toJunction - mine.toJunction) <= 0.5 && other.id < mine.id))) return true;
      // The player never waits, so an approaching player has the right of way.
      if (!this.cars.some(car => car.engine === v.engine) && d < 26 && v.engine.speed > 0.5) {
        const ahead = v.engine.pose(Math.min(20, d + 2))[0];
        if (Math.hypot(ahead[0] - node[0], ahead[1] - node[1]) < d) return true;
      }
    }
    return false;
  }

  private place(): void {
    let i = 0, lit = 0;
    for (const car of this.cars) {
      if (i >= this.fleet.capacity) break;
      const [p, t] = car.engine.pose();
      this.forward.set(t[0], t[2], -t[1]).normalize();
      this.right.crossVectors(this.forward, this.worldUp).normalize();
      this.up.crossVectors(this.right, this.forward).normalize();
      this.matrix.makeBasis(this.right, this.up, this.forward.negate());
      this.matrix.scale(this.size.setScalar(car.scale));
      this.matrix.setPosition(p[0], p[2], -p[1]);
      this.fleet.set(i++, this.matrix, car.color);
      // Brake lamps while slowing, and while held at a junction or in a queue.
      if (car.engine.acceleration < -0.6 || (car.engine.speed < 0.4 && car.engine.leadLimit < 0.5)) this.fleet.setBrake(lit++, this.matrix);
    }
    this.fleet.commit(i);
    this.fleet.commitBrakes(lit);
    this.metrics.cars = i;
    this.metrics.braking = lit;
  }
}

/** How far before a junction (m) a car at `speed` starts checking it, enough to stop comfortably. */
function approachRange(speed: number): number {
  return Math.min(45, Math.max(16, speed * speed / 5 + 8));
}

/** Speed (m/s) that can still stop about four metres short of a vehicle `gap` metres ahead. */
export function followSpeed(gap: number): number {
  return Math.sqrt(2 * 3 * Math.max(0, gap - 4));
}
