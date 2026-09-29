import * as THREE from 'three';
import type { RoadGraph, RoadEdge } from './engine';

export const EXPLORATION_LIMITS = { radius: .30, height: 1.75, walkSpeed: 2.1, runSpeed: 5.4, flightSpeed: 9, ascentSpeed: 6, descentSpeed: 5, altitude: 45, gravity: 18, terminalSpeed: 18, stepHeight: .42, slopeNormal: .65, frameSeconds: .10, stepSeconds: .025 } as const;
export type ExplorationGround = { y: number; normal: THREE.Vector3; water: boolean };
export interface ExplorationSurfaceLike {
  ground(point: THREE.Vector3, maxRise?: number, maxDrop?: number): ExplorationGround | null;
  sweep(from: THREE.Vector3, to: THREE.Vector3, radius?: number, height?: number): THREE.Vector3;
  clear(point: THREE.Vector3, radius?: number, height?: number): boolean;
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
    this.position.copy(supported); this.safe.copy(supported); this.heading = heading;
    this.active = true; this.grounded = true; this.jetpack = false; this.verticalSpeed = 0; this.speed = 0; this.blocked = null;
    return true;
  }

  leave(): void { this.active = false; this.jetpack = false; this.verticalSpeed = 0; this.speed = 0; this.blocked = null; }
  setJetpack(enabled: boolean): void { this.jetpack = this.active && enabled; this.verticalSpeed = 0; }

  update(dt: number, input: ExplorationInput, surface: ExplorationSurfaceLike): void {
    if (!this.active || !Number.isFinite(dt) || dt <= 0) return;
    if (!finitePoint(this.position)) this.position.copy(this.safe);
    if (!Number.isFinite(this.heading)) this.heading = 0;
    const seconds = Math.min(dt, EXPLORATION_LIMITS.frameSeconds), steps = Math.ceil(seconds / EXPLORATION_LIMITS.stepSeconds), step = seconds / steps;
    const before = this.position.clone(); this.blocked = null;
    for (let i = 0; i < steps; i++) this.step(step, input, surface);
    this.speed = Math.hypot(this.position.x - before.x, this.position.z - before.z) / seconds;
  }

  private step(dt: number, input: ExplorationInput, surface: ExplorationSurfaceLike): void {
    this.heading -= axis(input.turn) * 2.2 * dt;
    const ground = surface.ground(this.position, EXPLORATION_LIMITS.stepHeight, EXPLORATION_LIMITS.altitude + 80);
    // Never integrate gravity into absent/unloaded geometry. Streaming resumes
    // movement when a real support surface becomes resident beneath the player.
    if (!ground) { this.blocked = 'unloaded'; this.verticalSpeed = 0; return; }
    const forward = axis(input.forward), right = axis(input.right), magnitude = Math.max(1, Math.hypot(forward, right));
    const speed = this.jetpack && !this.grounded ? EXPLORATION_LIMITS.flightSpeed : input.run ? EXPLORATION_LIMITS.runSpeed : EXPLORATION_LIMITS.walkSpeed;
    const dx = (-Math.sin(this.heading) * forward + Math.cos(this.heading) * right) / magnitude * speed * dt;
    const dz = (-Math.cos(this.heading) * forward - Math.sin(this.heading) * right) / magnitude * speed * dt;
    const proposed = this.position.clone().add(new THREE.Vector3(dx, 0, dz));
    const support = Math.abs(dx) + Math.abs(dz) < 1e-9 ? ground : surface.ground(proposed, EXPLORATION_LIMITS.stepHeight, EXPLORATION_LIMITS.altitude + 80);
    const aboveWater = !!support?.water && !this.grounded && proposed.y >= support.y + .5;
    if (!support || support.water && !aboveWater || !support.water && support.normal.y < EXPLORATION_LIMITS.slopeNormal) {
      if (Math.abs(dx) + Math.abs(dz) > 1e-8) this.blocked = !support ? 'unloaded' : support.water ? 'water' : 'obstacle';
      proposed.copy(this.position);
    } else {
      const rise = support.y + clearance - this.position.y;
      if (this.grounded && rise > EXPLORATION_LIMITS.stepHeight + .001) { proposed.copy(this.position); this.blocked = 'obstacle'; }
      else {
        if (this.grounded && rise >= -.45) proposed.y = support.y + clearance;
        const swept = surface.sweep(this.position, proposed);
        if (swept.distanceToSquared(proposed) > 1e-6) {
          this.blocked = 'obstacle';
          // Try the two wall tangents without allowing either to escape its
          // independently checked ground/water footprint.
          for (const component of ['x', 'z'] as const) {
            const slide = this.position.clone(); slide[component] = proposed[component];
            const floor = surface.ground(slide, EXPLORATION_LIMITS.stepHeight, EXPLORATION_LIMITS.altitude + 80);
            if (!floor || floor.water && (this.grounded || slide.y < floor.y + .5) || !floor.water && floor.normal.y < EXPLORATION_LIMITS.slopeNormal) continue;
            if (this.grounded && Math.abs(floor.y + clearance - slide.y) <= EXPLORATION_LIMITS.stepHeight) slide.y = floor.y + clearance;
            const result = surface.sweep(this.position, slide);
            if (result.distanceToSquared(this.position) > swept.distanceToSquared(this.position)) swept.copy(result);
          }
        }
        proposed.copy(swept);
      }
    }
    // Re-query the accepted position, since wall sliding can change its floor.
    const floor = proposed.x === this.position.x && proposed.z === this.position.z ? ground
      : proposed.x === this.position.x + dx && proposed.z === this.position.z + dz ? support
      : surface.ground(proposed, EXPLORATION_LIMITS.stepHeight, EXPLORATION_LIMITS.altitude + 80);
    if (!floor) { this.blocked = 'unloaded'; this.verticalSpeed = 0; return; }
    const base = floor.y + clearance, hover = floor.y + 2;
    this.grounded = !floor.water && proposed.y <= base + .04;
    if (this.jetpack) this.verticalSpeed = input.ascend && !input.descend ? EXPLORATION_LIMITS.ascentSpeed : input.descend && !input.ascend ? -EXPLORATION_LIMITS.descentSpeed : 0;
    else this.verticalSpeed = this.grounded ? 0 : Math.max(-EXPLORATION_LIMITS.terminalSpeed, this.verticalSpeed - EXPLORATION_LIMITS.gravity * dt);
    const vertical = proposed.clone();
    const ceiling = Math.max(proposed.y, floor.y + EXPLORATION_LIMITS.altitude);
    vertical.y = Math.max(base, Math.min(ceiling, proposed.y + this.verticalSpeed * dt));
    if (floor.water && vertical.y < hover) {
      // Water can be crossed in flight. Releasing the pack or descending over
      // the lake engages a hover so landing requires returning to dry ground.
      this.jetpack = true; this.blocked = 'water'; this.verticalSpeed = 0;
      vertical.y = proposed.y >= hover ? hover : Math.min(hover, proposed.y + EXPLORATION_LIMITS.ascentSpeed * dt);
    }
    const resolved = surface.sweep(proposed, vertical);
    if (Math.abs(resolved.y - vertical.y) > .001) { this.verticalSpeed = 0; this.blocked = 'obstacle'; }
    this.position.copy(resolved);
    this.grounded = !floor.water && this.position.y <= base + .04;
    if (this.grounded) { this.position.y = base; this.verticalSpeed = 0; this.safe.copy(this.position); }
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
