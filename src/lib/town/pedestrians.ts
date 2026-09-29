import * as THREE from 'three';
import { GrassTerrain } from './grass';
import { HumanoidBatch, humanoidAppearance, type HumanoidAppearance } from './humanoid';

export interface PedestrianSurface {
  ground(point: THREE.Vector3, maxRise?: number, maxDrop?: number): { y: number; normal: THREE.Vector3; water: boolean } | null;
  clear(point: THREE.Vector3, radius?: number, height?: number): boolean;
}
export interface PedestrianOptions extends PedestrianSurface {
  groups: () => Iterable<THREE.Group>;
  isVisible?: (point: THREE.Vector3) => boolean;
  low?: boolean;
}
export interface SidewalkPath { id: string; points: THREE.Vector3[]; lengths: number[]; length: number }
interface Seed { point: THREE.Vector3; direction: THREE.Vector3 }
interface SidewalkIndex { terrain: GrassTerrain; seeds: Seed[]; cursor: number; nextScan: number; sortedFor?: THREE.Vector3 }
interface PendingPath { path: SidewalkPath; samples: THREE.Vector3[]; cursor: number; index: SidewalkIndex }
interface Walker { path: SidewalkPath; distance: number; direction: number; pause: number; yaw: number; position: THREE.Vector3; appearance: HumanoidAppearance; speed: number; phase: number; lastGround: number; supported: boolean; groundOffset: number }
export const PEDESTRIAN_LIMITS = { high: 24, low: 10, radius: 150, retireRadius: 190, pathMinimum: 6, pathMaximum: 24, footRadius: .29, geometryPerFrame: 1, attemptsPerFrame: 1, planningInterval: .25, validationPerFrame: 1, routeSeparation: 2.4 } as const;

function seeded(value: string): number { let n = 2166136261; for (let i = 0; i < value.length; i++) n = Math.imul(n ^ value.charCodeAt(i), 16777619); return n >>> 0; }
function distanceXZ(a: THREE.Vector3, b: THREE.Vector3): number { return Math.hypot(a.x - b.x, a.z - b.z); }

/** Reads only material-tagged sidewalk faces; source meshes and transforms stay intact. */
export function sidewalkIndex(group: THREE.Group): SidewalkIndex | null {
  group.updateWorldMatrix(true, true);
  const positions: number[] = [], seeds: Seed[] = [], seen = new Set<string>();
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), normal = new THREE.Vector3();
  group.traverse(object => {
    if (!(object instanceof THREE.Mesh) || object instanceof THREE.InstancedMesh) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    const geometry = object.geometry, position = geometry.getAttribute('position'), index = geometry.index;
    if (!position || !materials.some(material => /sidewalk concrete/i.test(material.name))) return;
    const count = index?.count ?? position.count;
    for (const part of geometry.groups.length ? geometry.groups : [{ start: 0, count, materialIndex: 0 }]) {
      if (!/sidewalk concrete/i.test(materials[part.materialIndex ?? 0]?.name ?? '')) continue;
      for (let i = part.start; i + 2 < Math.min(count, part.start + part.count); i += 3) {
        a.fromBufferAttribute(position, index ? index.getX(i) : i).applyMatrix4(object.matrixWorld);
        b.fromBufferAttribute(position, index ? index.getX(i + 1) : i + 1).applyMatrix4(object.matrixWorld);
        c.fromBufferAttribute(position, index ? index.getX(i + 2) : i + 2).applyMatrix4(object.matrixWorld);
        normal.crossVectors(b.clone().sub(a), c.clone().sub(a)).normalize();
        if (normal.y < .9) continue;
        positions.push(...a.toArray(), ...b.toArray(), ...c.toArray());
        if (seeds.length >= 180) continue;
        const point = a.clone().add(b).add(c).multiplyScalar(1 / 3), key = `${Math.floor(point.x / 2)}:${Math.floor(point.z / 2)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const edges = [b.clone().sub(a), c.clone().sub(b), a.clone().sub(c)].sort((u, v) => v.lengthSq() - u.lengthSq());
        const direction = edges[0]; direction.y = 0; direction.normalize();
        seeds.push({ point, direction });
      }
    }
  });
  if (!positions.length) return null;
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const proxy = new THREE.Mesh(geometry), terrain = new GrassTerrain([proxy], .9);
  geometry.dispose(); (proxy.material as THREE.Material).dispose();
  seeds.sort((a, b) => seeded(a.point.x.toFixed(1) + ':' + a.point.z.toFixed(1)) - seeded(b.point.x.toFixed(1) + ':' + b.point.z.toFixed(1)));
  return { terrain, seeds, cursor: 0, nextScan: 0 };
}

/** Pure resident-sidewalk support test. It performs no world raycasts. */
function sidewalkSupport(index: SidewalkIndex, point: THREE.Vector3): THREE.Vector3 | null {
  const center = index.terrain.sample(point.x, point.z);
  if (!center) return null;
  const r = PEDESTRIAN_LIMITS.footRadius;
  for (const [x, z] of [[r, 0], [-r, 0], [0, r], [0, -r], [r * .7, r * .7], [-r * .7, r * .7], [r * .7, -r * .7], [-r * .7, -r * .7]]) {
    const support = index.terrain.sample(point.x + x, point.z + z);
    if (!support || Math.abs(support.y - center.y) > .12) return null;
  }
  return new THREE.Vector3(point.x, center.y + .012, point.z);
}

function worldSupport(point: THREE.Vector3, surface: PedestrianSurface): THREE.Vector3 | null {
  const ground = surface.ground(point, .35, .5);
  if (!ground || ground.water || ground.normal.y < .9 || Math.abs(ground.y + .012 - point.y) > .18 || !surface.clear(point, .30, 1.86)) return null;
  return point.clone().setY(Math.max(point.y, ground.y + .012));
}

/** Rejects partial foot support, curbs, holes, road crossings, water and solids. */
export function sidewalkPoint(index: SidewalkIndex, point: THREE.Vector3, surface: PedestrianSurface): THREE.Vector3 | null {
  const supported = sidewalkSupport(index, point);
  return supported && worldSupport(supported, surface);
}

function traceSidewalkPath(index: SidewalkIndex, seed: Seed, steps = 16): SidewalkPath | null {
  const start = sidewalkSupport(index, seed.point);
  if (!start) return null;
  const extend = (sign: number) => {
    const points = [start.clone()]; let direction = seed.direction.clone().multiplyScalar(sign);
    for (let step = 0; step < steps; step++) {
      const previous = points[points.length - 1]; let chosen: THREE.Vector3 | null = null, nextDirection = direction;
      for (const angle of [0, .22, -.22, .44, -.44]) {
        const turn = direction.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), angle);
        const candidate = sidewalkSupport(index, previous.clone().addScaledVector(turn, .75));
        const middle = candidate && sidewalkSupport(index, previous.clone().lerp(candidate, .5));
        if (candidate && middle && Math.abs(candidate.y - previous.y) <= .16 && !points.slice(0, -3).some(point => distanceXZ(point, candidate) < .6)) { chosen = candidate; nextDirection = turn; break; }
      }
      if (!chosen) break;
      points.push(chosen); direction = nextDirection;
    }
    return points;
  };
  const points = [...extend(-1).reverse().slice(0, -1), ...extend(1)], lengths = [0];
  for (let i = 1; i < points.length; i++) lengths.push(lengths[i - 1] + points[i].distanceTo(points[i - 1]));
  const length = lengths[lengths.length - 1];
  if (length < PEDESTRIAN_LIMITS.pathMinimum) return null;
  const id = `${Math.round(start.x)}:${Math.round(start.z)}`;
  return { id, points, lengths, length };
}

function validationSamples(path: SidewalkPath): THREE.Vector3[] {
  const samples: THREE.Vector3[] = [];
  for (let i = 0; i < path.points.length; i++) {
    if (i) samples.push(path.points[i - 1].clone().lerp(path.points[i], .5));
    samples.push(path.points[i]);
  }
  return samples;
}

/** Synchronous utility for offline checks. Runtime uses the incremental queue. */
export function makeSidewalkPath(index: SidewalkIndex, seed: Seed, surface: PedestrianSurface): SidewalkPath | null {
  const path = traceSidewalkPath(index, seed);
  if (!path) return null;
  for (const point of validationSamples(path)) {
    const supported = worldSupport(point, surface);
    if (!supported) return null;
    point.copy(supported);
  }
  return path;
}

function pathsOverlap(a: SidewalkPath, b: SidewalkPath): boolean {
  return a.points.some(point => b.points.some(other => distanceXZ(point, other) < PEDESTRIAN_LIMITS.routeSeparation));
}

function pathPoint(path: SidewalkPath, distance: number): { point: THREE.Vector3; tangent: THREE.Vector3 } {
  const s = Math.max(0, Math.min(path.length, distance)); let i = 1;
  while (i < path.lengths.length - 1 && path.lengths[i] < s) i++;
  const a = path.points[i - 1], b = path.points[i], t = (s - path.lengths[i - 1]) / Math.max(.001, path.lengths[i] - path.lengths[i - 1]);
  return { point: a.clone().lerp(b, t), tangent: b.clone().sub(a).setY(0).normalize() };
}

export class Pedestrians {
  readonly group: THREE.Group;
  private readonly batch: HumanoidBatch;
  private readonly cache = new Map<THREE.Group, SidewalkIndex | null>();
  private readonly walkers: Walker[] = [];
  private previousTime?: number;
  private initial = true;
  private disposed = false;
  private planningTime = 0;
  private pathAttempts = 0;
  private capacity: number;
  private nextPlanning = 0;
  private maxPlanningTime = 0;
  private maxRuntimeTime = 0;
  private pending?: PendingPath;
  private validationSamples = 0;
  private nextWalkerProbe = 0;

  constructor(private readonly options: PedestrianOptions) {
    this.capacity = options.low ? PEDESTRIAN_LIMITS.low : PEDESTRIAN_LIMITS.high;
    this.batch = new HumanoidBatch(PEDESTRIAN_LIMITS.high);
    this.group = this.batch.group;
  }

  get metrics(): { people: number; capacity: number; draws: number; indexedTiles: number; pathAttempts: number; planningMs: number; maxPlanningMs: number; maxRuntimeMs: number; pendingSamples: number; validationSamples: number } {
    return { people: this.walkers.length, capacity: this.capacity, draws: this.walkers.length ? 6 : 0, indexedTiles: this.cache.size, pathAttempts: this.pathAttempts, planningMs: this.planningTime, maxPlanningMs: this.maxPlanningTime, maxRuntimeMs: this.maxRuntimeTime, pendingSamples: this.pending ? this.pending.samples.length - this.pending.cursor : 0, validationSamples: this.validationSamples };
  }

  setLow(low: boolean): void { this.capacity = low ? PEDESTRIAN_LIMITS.low : PEDESTRIAN_LIMITS.high; this.walkers.length = Math.min(this.walkers.length, this.capacity); }

  get positions(): readonly THREE.Vector3[] { return this.walkers.map(walker => walker.position.clone()); }

  /** Loading-cover work yields between candidates and stops after 1500 ms of
   * planning or four elapsed seconds; each chunk validates at most one position. */
  async prepare(time: number, focus: THREE.Vector3, signal: AbortSignal): Promise<void> {
    const started = performance.now(), planning = this.planningTime;
    for (let i = 0; i < 600 && !this.disposed; i++) {
      if (signal.aborted) throw new DOMException('Pedestrian preparation cancelled', 'AbortError');
      if (i > 0 && (this.planningTime - planning >= 1500 || performance.now() - started >= 4000 || this.walkers.filter(walker => walker.supported && distanceXZ(walker.position, focus) < PEDESTRIAN_LIMITS.radius).length >= Math.min(6, this.capacity))) break;
      this.update(time, focus, true);
      await new Promise<void>(resolve => setTimeout(resolve, 0));
    }
    if (signal.aborted) throw new DOMException('Pedestrian preparation cancelled', 'AbortError');
  }

  private visible(point: THREE.Vector3): boolean { return this.options.isVisible?.(point.clone().add(new THREE.Vector3(0, .9, 0))) ?? true; }

  update(time: number, focus: THREE.Vector3, preparing = false): void {
    if (this.disposed || !Number.isFinite(time) || !focus.toArray().every(Number.isFinite)) return;
    const dt = this.previousTime === undefined ? 0 : Math.max(0, Math.min(.1, time - this.previousTime)); this.previousTime = time;
    const planning = preparing || time >= this.nextPlanning, started = performance.now();
    if (planning) {
      this.nextPlanning = time + PEDESTRIAN_LIMITS.planningInterval;
      const groups = [...this.options.groups()].filter(group => group.visible);
      const retained = new Set(groups);
      for (const group of this.cache.keys()) if (!retained.has(group)) this.cache.delete(group);
      groups.sort((a, b) => distanceXZ(a.getWorldPosition(new THREE.Vector3()), focus) - distanceXZ(b.getWorldPosition(new THREE.Vector3()), focus));
      let built = 0;
      for (const group of groups) {
        if (this.cache.has(group) || built >= PEDESTRIAN_LIMITS.geometryPerFrame) continue;
        if (distanceXZ(group.getWorldPosition(new THREE.Vector3()), focus) > 350) continue;
        this.cache.set(group, sidewalkIndex(group)); built++;
      }
      for (let i = this.walkers.length - 1; i >= 0; i--) {
        const walker = this.walkers[i];
        if ((!walker.supported || distanceXZ(walker.position, focus) > PEDESTRIAN_LIMITS.retireRadius) && !this.visible(walker.position)) this.walkers.splice(i, 1);
      }
      if (this.pending && ![...this.cache.values()].includes(this.pending.index)) this.pending = undefined;
      let attempts = 0;
      for (const index of this.cache.values()) {
        if (!index || this.pending || this.walkers.length >= this.capacity || attempts >= PEDESTRIAN_LIMITS.attemptsPerFrame) continue;
        if (!index.sortedFor || distanceXZ(index.sortedFor, focus) > 30) {
          index.seeds.sort((a, b) => distanceXZ(a.point, focus) - distanceXZ(b.point, focus));
          index.sortedFor = focus.clone(); index.cursor = 0;
        }
        if (index.cursor >= index.seeds.length && time >= index.nextScan) { index.cursor = 0; index.nextScan = time + 3; }
        while (index.cursor < index.seeds.length && attempts < PEDESTRIAN_LIMITS.attemptsPerFrame && this.walkers.length < this.capacity) {
          const seed = index.seeds[index.cursor++], distance = distanceXZ(seed.point, focus);
          if (distance > PEDESTRIAN_LIMITS.radius || distance < 5 || this.walkers.some(walker => walker.path.points.some(point => distanceXZ(point, seed.point) < 4))) continue;
          if (!this.initial && !preparing && this.visible(seed.point)) continue;
          attempts++; this.pathAttempts++;
          // Short routes finish preparation quickly; all candidates first pass the
          // cheap sidewalk mask before any expensive source-geometry raycast.
          const path = traceSidewalkPath(index, seed, 6);
          if (!path || this.walkers.some(walker => pathsOverlap(path, walker.path))) continue;
          this.pending = { path, samples: validationSamples(path), cursor: 0, index };
          break;
        }
      }
    }
    // One collision position per frame: a route can never synchronously fan out
    // into hundreds of raycasts. It is invisible until every sample is safe.
    let validations = 0;
    if (this.pending) {
      const pending = this.pending, point = pending.samples[pending.cursor];
      const supported = worldSupport(point, this.options); validations++; this.validationSamples++;
      if (!supported) this.pending = undefined;
      else {
        point.copy(supported); pending.cursor++;
        if (pending.cursor >= pending.samples.length) {
          const path = pending.path, value = seeded(path.id), distance = path.length * ((value % 61) + 20) / 100, at = pathPoint(path, distance);
          if ((preparing || !this.visible(at.point)) && this.walkers.length < this.capacity && !this.walkers.some(walker => pathsOverlap(path, walker.path))) {
            this.walkers.push({ path, distance, direction: 1, pause: 0, yaw: Math.atan2(-at.tangent.x, -at.tangent.z), position: at.point,
              appearance: humanoidAppearance(value), speed: .82 + (value % 29) * .013, phase: (value % 43) / 7, lastGround: time, supported: true, groundOffset: 0 });
          }
          this.pending = undefined;
        }
      }
    }
    this.initial = false;
    this.batch.begin();
    for (const walker of this.walkers) {
      let speed = 0;
      walker.pause = Math.max(0, walker.pause - dt);
      if (!walker.pause) {
        const distance = Math.max(0, Math.min(walker.path.length, walker.distance + walker.direction * walker.speed * dt)), next = pathPoint(walker.path, distance);
        const occupied = distanceXZ(next.point, focus) < .9 || this.walkers.some(other => other !== walker && distanceXZ(next.point, other.position) < .8 && distanceXZ(next.point, other.position) < distanceXZ(walker.position, other.position));
        if (!preparing && time >= this.nextWalkerProbe && time - walker.lastGround > 1 && validations < PEDESTRIAN_LIMITS.validationPerFrame) {
          validations++; this.validationSamples++; this.nextWalkerProbe = time + .10;
          const ground = this.options.ground(next.point, .3, .5); walker.lastGround = time;
          walker.supported = !!ground && !ground.water && Math.abs(ground.y - next.point.y) < .22 && this.options.clear(next.point, .30, 1.86);
          if (walker.supported && ground) walker.groundOffset = ground.y + .012 - next.point.y;
        }
        if (!occupied && walker.supported) { walker.distance = distance; walker.position.copy(next.point).add(new THREE.Vector3(0, walker.groundOffset, 0)); speed = walker.speed; walker.phase += dt; }
        if (walker.distance <= 0 || walker.distance >= walker.path.length) { walker.direction *= -1; walker.pause = .85; }
      }
      const direction = pathPoint(walker.path, walker.distance).tangent.multiplyScalar(walker.direction), target = Math.atan2(-direction.x, -direction.z);
      const angle = Math.atan2(Math.sin(target - walker.yaw), Math.cos(target - walker.yaw)); walker.yaw += Math.max(-dt * 3.2, Math.min(dt * 3.2, angle));
      this.batch.set({ position: walker.position, yaw: walker.yaw, appearance: walker.appearance, speed, time: walker.phase });
    }
    this.batch.commit();
    const elapsed = performance.now() - started; this.planningTime += elapsed; this.maxPlanningTime = Math.max(this.maxPlanningTime, elapsed);
    if (!preparing) this.maxRuntimeTime = Math.max(this.maxRuntimeTime, elapsed);
  }

  dispose(): void { if (this.disposed) return; this.disposed = true; this.batch.dispose(); this.cache.clear(); this.walkers.length = 0; this.pending = undefined; }
}
