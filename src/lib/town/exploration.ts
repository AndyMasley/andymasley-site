import * as THREE from 'three';
import type { RoadGraph, RoadEdge } from './engine';

export const EXPLORATION_LIMITS = { radius: .26, height: 1.75, walkSpeed: 2.8, runSpeed: 7.2, flightSpeed: 40, flightBoostSpeed: 80, ascentSpeed: 30, descentSpeed: 35, altitude: 1000, gravity: 24, terminalSpeed: 45, stepHeight: .85, slopeNormal: .42, frameSeconds: .10, stepSeconds: .025 } as const;
export type ExplorationGround = { y: number; normal: THREE.Vector3; water: boolean; fallback?: boolean };
export interface ExplorationSurfaceLike {
  ground(point: THREE.Vector3, maxRise?: number, maxDrop?: number): ExplorationGround | null;
  sweep(from: THREE.Vector3, to: THREE.Vector3, radius?: number, height?: number): THREE.Vector3;
  clear(point: THREE.Vector3, radius?: number, height?: number): boolean;
  recoverGround?(point: THREE.Vector3): ExplorationGround | null;
}
export type ExplorationInput = { forward?: number; right?: number; turn?: number; run?: boolean; ascend?: boolean; descend?: boolean };
export type ExplorationBlock = 'unloaded' | 'water' | 'obstacle' | null;
const finitePoint = (point: THREE.Vector3): boolean => [point.x, point.y, point.z].every(Number.isFinite);
const axis = (value = 0): number => Number.isFinite(value) ? THREE.MathUtils.clamp(value, -1, 1) : 0;
const clearance = .025;

/** Feet and heading use Three's Y-up frame; positive right strafes independently
 * of camera heading, and positive turn rotates to the right. No DOM or timer. */
export class OnFootController {
  readonly position = new THREE.Vector3();
  heading = 0;
  active = false;
  jetpack = false;
  grounded = true;
  speed = 0;
  blocked: ExplorationBlock = null;
  private verticalSpeed = 0;
  private readonly safe = new THREE.Vector3();
  private lastGroundHeight = 0;
  private readonly motion = new THREE.Vector3();
  private footContact?: THREE.Vector3;
  private fallbackSupport = false;

  get heightAboveGround(): number { const height = this.position.y - this.lastGroundHeight; return Number.isFinite(height) ? Math.max(0, height) : 0; }
  get velocity(): THREE.Vector3 { return this.motion.clone(); }

  enter(carPosition: THREE.Vector3, heading: number, surface: ExplorationSurfaceLike): boolean {
    if (!finitePoint(carPosition) || !Number.isFinite(heading)) return false;
    const right = new THREE.Vector3(Math.cos(heading), 0, -Math.sin(heading));
    const forward = new THREE.Vector3(-Math.sin(heading), 0, -Math.cos(heading));
    // Prefer the right verge, then the other side and positions beyond the car.
    // Every exit is terrain-supported and reached without passing through a wall.
    for (const [side, along] of [[2, 0], [-2, 0], [2.8, 0], [-2.8, 0], [1.8, -2.8], [-1.8, -2.8], [0, -3.5]]) {
      const point = carPosition.clone().addScaledVector(right, side).addScaledVector(forward, along);
      const ground = surface.ground(point, .6, 2);
      if (!ground || ground.water || ground.normal.y < EXPLORATION_LIMITS.slopeNormal) continue;
      point.y = ground.y + clearance;
      if (!surface.clear(point)) continue;
      const start = carPosition.clone(); start.y = Math.max(start.y, point.y);
      if (surface.sweep(start, point).distanceToSquared(point) > .01) continue;
      return this.enterAt(point, heading, surface);
    }
    return false;
  }

  /** A safe, explicit reset for a prepared landmark or recovery location. */
  enterAt(point: THREE.Vector3, heading: number, surface: ExplorationSurfaceLike): boolean {
    if (!finitePoint(point) || !Number.isFinite(heading)) return false;
    const ground = surface.ground(point, .6, 2);
    if (!ground || ground.water || ground.normal.y < EXPLORATION_LIMITS.slopeNormal) return false;
    const supported = point.clone(); supported.y = ground.y + clearance;
    if (!surface.clear(supported)) return false;
    this.position.copy(supported); this.safe.copy(supported); this.heading = heading; this.lastGroundHeight = ground.y; this.motion.set(0, 0, 0); this.footContact = undefined; this.fallbackSupport = !!ground.fallback;
    this.active = true; this.grounded = true; this.jetpack = false; this.verticalSpeed = 0; this.speed = 0; this.blocked = null;
    return true;
  }

  leave(): void { this.motion.set(0, 0, 0); this.active = false; this.jetpack = false; this.verticalSpeed = 0; this.speed = 0; this.blocked = null; }
  setJetpack(enabled: boolean): void { this.jetpack = this.active && enabled; this.verticalSpeed = 0; }

  update(dt: number, input: ExplorationInput, surface: ExplorationSurfaceLike): void {
    if (!this.active || !Number.isFinite(dt) || dt <= 0) return;
    if (!finitePoint(this.position)) this.position.copy(this.safe);
    if (!Number.isFinite(this.heading)) this.heading = 0;
    const seconds = Math.min(dt, EXPLORATION_LIMITS.frameSeconds), steps = Math.ceil(seconds / EXPLORATION_LIMITS.stepSeconds), step = seconds / steps;
    const before = this.position.clone(); this.blocked = null;
    for (let i = 0; i < steps; i++) this.step(step, input, surface);
    this.motion.copy(this.position).sub(before).divideScalar(seconds);
    this.speed = Math.hypot(this.motion.x, this.motion.z);
  }

  private footGround(point: THREE.Vector3, surface: ExplorationSurfaceLike, airborne: boolean): ExplorationGround | null {
    const center = surface.ground(point, airborne ? .1 : EXPLORATION_LIMITS.stepHeight, EXPLORATION_LIMITS.altitude + 80);
    if (airborne || !this.footContact || center && center.y + clearance >= point.y - .04) return center;
    // Preserve a real leading-foot contact while the body center crosses a
    // stair edge. Recheck its resident surface instead of inventing a floor.
    if (Math.hypot(point.x - this.footContact.x, point.z - this.footContact.z) > EXPLORATION_LIMITS.radius + .07) return center;
    const contact = this.footContact.clone().setY(point.y), edge = surface.ground(contact, .1, 2);
    return edge && !edge.water && edge.normal.y >= EXPLORATION_LIMITS.slopeNormal && edge.y + clearance <= point.y + .04 && (!center || edge.y > center.y) ? edge : center;
  }

  /** A curb can meet the capsule before its center reaches the top. Probe the
   * leading foot, then try a real up/across/down path; every leg checks walls
   * and ceilings. No raised collision plane or invented ground is involved. */
  private walkSweep(target: THREE.Vector3, surface: ExplorationSurfaceLike): THREE.Vector3 {
    const direct = surface.sweep(this.position, target);
    if (direct.distanceToSquared(target) < 1e-6 || !this.grounded) return direct;
    const stepped = target.clone(); let contact: THREE.Vector3 | undefined;
    if (stepped.y - this.position.y <= .04) {
      const direction = target.clone().sub(this.position).setY(0);
      if (direction.lengthSq() < 1e-9) return direct;
      const ahead = target.clone().addScaledVector(direction.normalize(), EXPLORATION_LIMITS.radius + .06);
      const support = surface.ground(ahead, EXPLORATION_LIMITS.stepHeight, 2);
      if (!support || support.water || support.normal.y < EXPLORATION_LIMITS.slopeNormal) return direct;
      stepped.y = support.y + clearance; contact = ahead;
    }
    const rise = stepped.y - this.position.y;
    if (rise <= .04 || rise > EXPLORATION_LIMITS.stepHeight + .001) return direct;
    const raised = this.position.clone().setY(stepped.y + .03), up = surface.sweep(this.position, raised);
    if (up.distanceToSquared(raised) > 1e-6) return direct;
    const across = stepped.clone().setY(raised.y), crossed = surface.sweep(up, across);
    if (crossed.distanceToSquared(across) > 1e-6) return direct;
    const down = surface.sweep(crossed, stepped);
    if (down.distanceToSquared(stepped) >= .0025) return direct;
    if (contact) this.footContact = contact;
    target.copy(stepped);
    return down;
  }

  private step(dt: number, input: ExplorationInput, surface: ExplorationSurfaceLike): void {
    this.heading -= axis(input.turn) * 2.2 * dt;
    const groundDrop = EXPLORATION_LIMITS.altitude + 80;
    let ground = this.footGround(this.position, surface, !this.grounded);
    if (this.grounded && this.fallbackSupport && (!ground || ground.fallback)) {
      // The overview can sit below newly adopted grading. Only the surface's
      // terrain-only, ceiling-checked migration may raise an existing fallback
      // contact; ordinary steps and roofs retain their normal collision rules.
      const adopted = surface.recoverGround?.(this.position);
      if (adopted && !adopted.water && !adopted.fallback && Number.isFinite(adopted.y) && adopted.y > this.position.y && adopted.y - this.position.y <= 8) {
        this.position.y = adopted.y + clearance; this.safe.copy(this.position);
        this.footContact = undefined; this.fallbackSupport = false; ground = adopted;
      }
    }
    // A missing streamed tile stops an unprotected walker at its last safe
    // edge. Airborne movement remains free; only unsafe descent must hover.
    if (!ground && this.grounded && !this.jetpack) { this.blocked = 'unloaded'; this.verticalSpeed = 0; return; }
    if (ground) this.lastGroundHeight = ground.y;
    const takingOff = this.jetpack && !!input.ascend && !input.descend;
    const airborne = !this.grounded || takingOff || !ground && this.jetpack;
    const forward = axis(input.forward), right = axis(input.right), magnitude = Math.max(1, Math.hypot(forward, right));
    const speed = this.jetpack && airborne ? input.run ? EXPLORATION_LIMITS.flightBoostSpeed : EXPLORATION_LIMITS.flightSpeed : input.run ? EXPLORATION_LIMITS.runSpeed : EXPLORATION_LIMITS.walkSpeed;
    const dx = (-Math.sin(this.heading) * forward + Math.cos(this.heading) * right) / magnitude * speed * dt;
    const dz = (-Math.cos(this.heading) * forward - Math.sin(this.heading) * right) / magnitude * speed * dt;
    const proposed = this.position.clone().add(new THREE.Vector3(dx, 0, dz));
    const support = Math.abs(dx) + Math.abs(dz) < 1e-9 ? ground : this.footGround(proposed, surface, airborne);
    if (!airborne && (!support || support.water || support.normal.y < EXPLORATION_LIMITS.slopeNormal)) {
      if (Math.abs(dx) + Math.abs(dz) > 1e-8) this.blocked = !support ? 'unloaded' : support.water ? 'water' : 'obstacle';
      proposed.copy(this.position);
    } else {
      const rise = support ? support.y + clearance - this.position.y : 0;
      if (!airborne && rise > EXPLORATION_LIMITS.stepHeight + .001) { proposed.copy(this.position); this.blocked = 'obstacle'; }
      else {
        if (!airborne && support && rise >= -EXPLORATION_LIMITS.stepHeight) proposed.y = support.y + clearance;
        const swept = airborne ? surface.sweep(this.position, proposed) : this.walkSweep(proposed, surface);
        if (swept.distanceToSquared(proposed) > 1e-6) {
          this.blocked = 'obstacle';
          // Airborne tangents need no terrain below them. Walking tangents keep
          // their independently checked dry, traversable ground footprint.
          for (const component of ['x', 'z'] as const) {
            const slide = this.position.clone(); slide[component] = proposed[component];
            if (Math.abs(slide[component] - this.position[component]) < 1e-8) continue;
            if (!airborne) {
              const floor = surface.ground(slide, EXPLORATION_LIMITS.stepHeight, groundDrop);
              if (!floor || floor.water || floor.normal.y < EXPLORATION_LIMITS.slopeNormal || floor.y + clearance - slide.y > EXPLORATION_LIMITS.stepHeight) continue;
              if (floor.y + clearance - slide.y >= -EXPLORATION_LIMITS.stepHeight) slide.y = floor.y + clearance;
            }
            const result = airborne ? surface.sweep(this.position, slide) : this.walkSweep(slide, surface);
            if (Math.hypot(result.x - this.position.x, result.z - this.position.z) > Math.hypot(swept.x - this.position.x, swept.z - this.position.z)) swept.copy(result);
          }
        }
        proposed.copy(swept);
      }
    }
    // Sliding and step traversal can change the floor under the accepted feet.
    const floor = proposed.x === this.position.x && proposed.z === this.position.z ? ground
      : !this.footContact && proposed.x === this.position.x + dx && proposed.z === this.position.z + dz ? support
      : this.footGround(proposed, surface, airborne);
    if (floor) this.lastGroundHeight = floor.y;
    const base = floor ? floor.y + clearance : -Infinity;
    this.grounded = !!floor && !floor.water && Math.abs(proposed.y - base) <= .04;
    if (this.jetpack) this.verticalSpeed = input.ascend && !input.descend ? EXPLORATION_LIMITS.ascentSpeed : input.descend && !input.ascend ? -EXPLORATION_LIMITS.descentSpeed : 0;
    else this.verticalSpeed = this.grounded ? 0 : Math.max(-EXPLORATION_LIMITS.terminalSpeed, this.verticalSpeed - EXPLORATION_LIMITS.gravity * dt);
    if (!floor && this.verticalSpeed < 0) { this.verticalSpeed = 0; this.blocked = 'unloaded'; }
    const vertical = proposed.clone();
    // Keep the last known ground datum across unloaded tiles; crossing a lower
    // valley never pulls the player down to a newly reduced ceiling.
    const ceiling = Math.max(proposed.y, this.lastGroundHeight + EXPLORATION_LIMITS.altitude);
    vertical.y = Math.max(base, Math.min(ceiling, proposed.y + this.verticalSpeed * dt));
    if (floor?.water && vertical.y < floor.y + 2) {
      this.jetpack = true; this.blocked = 'water'; this.verticalSpeed = 0;
      vertical.y = proposed.y >= floor.y + 2 ? floor.y + 2 : Math.min(floor.y + 2, proposed.y + EXPLORATION_LIMITS.ascentSpeed * dt);
    }
    const resolved = Math.abs(vertical.y - proposed.y) < 1e-9 ? proposed : surface.sweep(proposed, vertical);
    if (Math.abs(resolved.y - vertical.y) > .001) { this.verticalSpeed = 0; this.blocked = 'obstacle'; }
    this.position.copy(resolved);
    this.grounded = !!floor && !floor.water && Math.abs(this.position.y - base) <= .04;
    if (this.grounded) { this.position.y = base; this.verticalSpeed = 0; this.safe.copy(this.position); this.fallbackSupport = !!floor?.fallback; }
  }

}

export type SummonRoad = { edgeId: number; s: number; position: THREE.Vector3; heading: number; distance: number };
function summonRoadAllowed(edge: RoadEdge): boolean {
  const kind = `${edge.highway ?? ''} ${edge.road_class ?? ''} ${edge.access ?? ''} ${edge.name ?? ''}`;
  return ![1, 7].includes(Number(edge.road_type)) && Number(edge.speed_kph ?? 40) < 90 && !/motorway|freeway|expressway|trunk|ramp|private|no[_ -]?access|\bI[- ]?395\b/i.test(kind);
}

/** Return an existing canonical lane pose, never an invented off-road spawn.
 * Without surface, callers can first stream the nearest mapped road; a second
 * call with surface validates resident ground/vehicle clearance before adoption. */
export function nearestSummonRoad(graph: RoadGraph, point: THREE.Vector3, surface?: ExplorationSurfaceLike, maxDistance = 2000): SummonRoad | null {
  if (!finitePoint(point) || !Number.isFinite(maxDistance) || maxDistance <= 0) return null;
  const radius = Math.min(maxDistance, 2000), candidates: SummonRoad[] = [];
  const nearby = new Set<number>();
  for (let x = Math.floor((point.x - radius - 8) / 120); x <= Math.floor((point.x + radius + 8) / 120); x++) for (let n = Math.floor((-point.z - radius - 8) / 120); n <= Math.floor((-point.z + radius + 8) / 120); n++) {
    for (const id of graph.grid.get(`${x},${n}`) ?? []) nearby.add(id);
  }
  for (const edgeId of nearby) {
    const edge = graph.edges.get(edgeId)!;
    if (!summonRoadAllowed(edge)) continue;
    const path = graph.paths.get(edgeId); if (!path) continue;
    const end = Math.min(path.length - 5, (graph.obstacleStops.get(edgeId) ?? Infinity) - 4, (graph.boundaryStops.get(edgeId) ?? Infinity) - 6);
    if (end <= 5) continue;
    let closest: SummonRoad | undefined;
    for (let i = 0; i + 1 < path.points.length; i++) {
      const a = path.points[i], b = path.points[i + 1], dx = b[0] - a[0], dn = b[1] - a[1], lengthSquared = dx * dx + dn * dn;
      if (!lengthSquared) continue;
      const boxDistance = Math.hypot(point.x - THREE.MathUtils.clamp(point.x, Math.min(a[0], b[0]), Math.max(a[0], b[0])), -point.z - THREE.MathUtils.clamp(-point.z, Math.min(a[1], b[1]), Math.max(a[1], b[1])));
      if (boxDistance > (closest?.distance ?? radius)) continue;
      const t = THREE.MathUtils.clamp(((point.x - a[0]) * dx + (-point.z - a[1]) * dn) / lengthSquared, 0, 1);
      const s = THREE.MathUtils.clamp(path.distance[i] + Math.sqrt(lengthSquared) * t, 5, end);
      const [position, tangent] = path.sample(s), world = new THREE.Vector3(position[0], position[2], -position[1]);
      const distance = Math.hypot(world.x - point.x, world.z - point.z);
      if (distance > radius || closest && closest.distance <= distance) continue;
      closest = { edgeId, s, position: world, heading: Math.atan2(-tangent[0], tangent[1]), distance };
    }
    if (closest) candidates.push(closest);
  }
  candidates.sort((a, b) => a.distance - b.distance || a.edgeId - b.edgeId);
  for (const candidate of candidates.slice(0, 48)) {
    if (!surface) return candidate;
    const ground = surface.ground(candidate.position, 1.2, 2);
    if (!ground || ground.water || ground.normal.y < .85 || Math.abs(ground.y - candidate.position.y) > 1.2) continue;
    // Check the car footprint on its actual lane, not merely its center.
    const forward = new THREE.Vector3(-Math.sin(candidate.heading), 0, -Math.cos(candidate.heading));
    const right = new THREE.Vector3(Math.cos(candidate.heading), 0, -Math.sin(candidate.heading));
    let valid = true;
    for (const along of [-1.8, 0, 1.8]) for (const side of [-.85, .85]) {
      const at = candidate.position.clone().addScaledVector(forward, along).addScaledVector(right, side);
      const support = surface.ground(at, 1.2, 2);
      if (!support || support.water || Math.abs(support.y - ground.y) > .5) { valid = false; break; }
      at.y = support.y + clearance;
      if (!surface.clear(at, .20, 1.6)) { valid = false; break; }
    }
    if (valid) return candidate;
  }
  return null;
}
