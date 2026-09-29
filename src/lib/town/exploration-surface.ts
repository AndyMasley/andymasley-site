import * as THREE from 'three';
import { EXPLORATION_LIMITS, type ExplorationGround, type ExplorationSurfaceLike } from './exploration';

export const EXPLORATION_SURFACE_LIMITS = { groups: 96, tiles: 4, candidates: 32, maxDrop: 2000 } as const;
type Intersect = (ray: THREE.Raycaster, meshes: readonly THREE.Mesh[]) => THREE.Intersection[];
export type ExplorationSurfaceOptions = {
  groups: () => Iterable<THREE.Group>;
  fallbackGroups?: () => Iterable<THREE.Group>;
  fallbackAllowed?: (position: THREE.Vector3) => boolean;
  solids?: (position: THREE.Vector3, radius: number) => readonly THREE.Mesh[];
  intersect?: Intersect;
};
type Tile = { ground: THREE.Mesh[]; terrain: THREE.Mesh[]; water: Set<THREE.Mesh>; solids: THREE.Mesh[]; bounds: THREE.Box3; children: number; revision: unknown; matrix: number[] };
type Bounds = { box: THREE.Box3; matrix: number[]; geometry: THREE.BufferGeometry; version: number; count: number };
const skip = /foliage|leaves|leaf|canopy|crown|flower|shadow|paint|window|glass|cloud|blade|tuft/i;
const terrainNames = /terrain|ground|lawn|grass|soil|earth|gravel|sand|turf|field|trail/i;
const supports = /terrain|ground|lawn|grass|soil|earth|gravel|sand|turf|field|trail|building|facade|roof|bridge|wall|foundation|asphalt|road|stone|brick|pavement|paving|sidewalk|curb|walk|floor|parking|lot/i;
type Capsule = { meshes: THREE.Mesh[]; bounds: Map<THREE.Mesh, THREE.Box3> };

/** Reads resident scene geometry, with optional shared coarse terrain only
 * where detailed support is absent and the caller permits fallback. Mesh/box
 * classification is cached; exact rays reuse the session's camera BVH.
 * No source meshes, global raycast hooks or material side flags are modified. */
export class ExplorationSurface implements ExplorationSurfaceLike {
  readonly metrics = { rays: 0, testedMeshes: 0, limited: 0, cachedGroups: 0, broadPhaseMeshes: 0, broadPhaseCandidates: 0 };
  private readonly tiles = new Map<THREE.Group, Tile>();
  private readonly fallbackTiles = new Map<THREE.Group, Tile>();
  private readonly boxes = new WeakMap<THREE.Mesh, Bounds>();
  private readonly ray = new THREE.Raycaster();
  private readonly hit = new THREE.Vector3();
  private readonly normalMatrix = new THREE.Matrix3();
  private readonly instanceMatrix = new THREE.Matrix4();
  private solidsCache?: { point: THREE.Vector3; radius: number; meshes: readonly THREE.Mesh[] };
  private disposed = false;

  constructor(private readonly options: ExplorationSurfaceOptions) {}

  private visible(mesh: THREE.Object3D): boolean {
    for (let item: THREE.Object3D | null = mesh; item; item = item.parent) if (!item.visible) return false;
    return true;
  }

  private bounds(mesh: THREE.Mesh): THREE.Box3 {
    mesh.updateWorldMatrix(true, false);
    const position = mesh.geometry.attributes.position;
    const version = position instanceof THREE.InterleavedBufferAttribute ? position.data.version : position?.version ?? 0;
    const prior = this.boxes.get(mesh), matrix = mesh.matrixWorld.elements;
    if (prior && prior.geometry === mesh.geometry && prior.version === version && prior.count === (mesh instanceof THREE.InstancedMesh ? mesh.count : 0) && prior.matrix.every((value, i) => value === matrix[i])) return prior.box;
    const box = new THREE.Box3();
    if (mesh instanceof THREE.InstancedMesh) { mesh.computeBoundingBox(); if (mesh.boundingBox) box.copy(mesh.boundingBox); }
    else { if (!mesh.geometry.boundingBox || prior && prior.version !== version) mesh.geometry.computeBoundingBox(); if (mesh.geometry.boundingBox) box.copy(mesh.geometry.boundingBox); }
    box.applyMatrix4(mesh.matrixWorld);
    this.boxes.set(mesh, { box, matrix: [...matrix], geometry: mesh.geometry, version, count: mesh instanceof THREE.InstancedMesh ? mesh.count : 0 });
    return box;
  }

  private refreshGroups(groups: Iterable<THREE.Group>, cache: Map<THREE.Group, Tile>, terrainOnly = false): void {
    if (this.disposed) return;
    const live = new Set<THREE.Group>();
    for (const group of groups) {
      if (!this.visible(group) || live.size >= EXPLORATION_SURFACE_LIMITS.groups) continue;
      live.add(group); group.updateWorldMatrix(true, false);
      const previous = cache.get(group);
      // Adopted optional scenery can arrive after the tile's first foot query.
      // Nested edits can explicitly increment this cheap caller-owned revision.
      if (previous && previous.children === group.children.length && previous.revision === group.userData.explorationRevision && previous.matrix.every((value, i) => value === group.matrixWorld.elements[i])) continue;
      const tile: Tile = { ground: [], terrain: [], water: new Set(), solids: [], bounds: new THREE.Box3(), children: group.children.length, revision: group.userData.explorationRevision, matrix: [...group.matrixWorld.elements] };
      group.updateWorldMatrix(true, true);
      group.traverse(object => {
        if (!(object instanceof THREE.Mesh) || !object.geometry.attributes.position) return;
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        let name = `${object.name} ${materials.map(material => material.name).join(' ')}`;
        for (let parent = object.parent; parent && parent !== group; parent = parent.parent) name += ` ${parent.name}`;
        const water = /\bwater\b/i.test(name) || materials.some(material => material.userData.townArt?.kind === 'water');
        const terrain = terrainNames.test(name) || /asphalt|road|pavement|sidewalk|curb/i.test(name);
        if (terrainOnly && !water && (!terrainNames.test(name) || /building|facade|roof|wall|foundation/i.test(name))) return;
        if (!water && (!supports.test(name) || !terrain && skip.test(name))) return;
        if (object instanceof THREE.InstancedMesh && !/parked/i.test(name)) return;
        if (!water && materials.every(material => material.transparent || material.opacity < .98 || material.alphaTest > 0)) return;
        tile.bounds.union(this.bounds(object));
        if (water) tile.water.add(object);
        else tile.solids.push(object);
        if (!(object instanceof THREE.InstancedMesh)) {
          tile.ground.push(object);
          if (!water && terrainNames.test(name) && !/building|facade|roof|bridge|wall|foundation|floor|parked/i.test(name)) tile.terrain.push(object);
        }
      });
      cache.set(group, tile); this.solidsCache = undefined;
    }
    for (const group of cache.keys()) if (!live.has(group)) { cache.delete(group); this.solidsCache = undefined; }
  }

  private refresh(): void {
    this.refreshGroups(this.options.groups(), this.tiles);
    this.metrics.cachedGroups = this.tiles.size;
  }

  private nearby(point: THREE.Vector3, radius = 1): Tile[] {
    this.refresh();
    return [...this.tiles.values()].map(tile => {
      const x = THREE.MathUtils.clamp(point.x, tile.bounds.min.x, tile.bounds.max.x), z = THREE.MathUtils.clamp(point.z, tile.bounds.min.z, tile.bounds.max.z);
      return { tile, distance: Math.hypot(point.x - x, point.z - z) };
    }).filter(entry => entry.distance <= radius).sort((a, b) => a.distance - b.distance).slice(0, EXPLORATION_SURFACE_LIMITS.tiles).map(entry => entry.tile);
  }

  /** Prepare exact support geometry during the loading screen, including
   * sidewalks and water that the camera's obstruction list need not contain. */
  preparationMeshes(position: THREE.Vector3, radius = 180): readonly THREE.Mesh[] {
    if (this.disposed || ![position.x, position.y, position.z, radius].every(Number.isFinite) || radius < 0) return [];
    const nearby = this.nearby(position, Math.min(300, radius));
    this.refreshGroups(this.options.fallbackGroups?.() ?? [], this.fallbackTiles, true);
    return [...new Set([...nearby, ...this.fallbackTiles.values()].flatMap(tile => tile.ground))].filter(mesh => this.visible(mesh));
  }

  private cast(origin: THREE.Vector3, direction: THREE.Vector3, length: number, meshes: readonly THREE.Mesh[], boxes?: ReadonlyMap<THREE.Mesh, THREE.Box3>, accept?: (hit: THREE.Intersection) => boolean): THREE.Intersection[] {
    this.ray.set(origin, direction); this.ray.near = .001; this.ray.far = length;
    const candidates: { mesh: THREE.Mesh; distance: number }[] = [];
    for (const mesh of meshes) {
      if (!this.visible(mesh)) continue;
      const box = boxes?.get(mesh) ?? this.bounds(mesh);
      if (!this.ray.ray.intersectBox(box, this.hit)) continue;
      const distance = box.containsPoint(origin) ? 0 : this.hit.distanceTo(origin);
      if (distance <= length) candidates.push({ mesh, distance });
    }
    if (candidates.length > EXPLORATION_SURFACE_LIMITS.candidates) this.metrics.limited++;
    candidates.sort((a, b) => a.distance - b.distance);
    this.metrics.rays++;
    const hits: THREE.Intersection[] = []; let nearest = length;
    // Dense layered landscaping must not turn a valid floor into an unloaded
    // gap. Query bounded batches, stopping once bounds prove the best support.
    for (let offset = 0; offset < candidates.length; offset += EXPLORATION_SURFACE_LIMITS.candidates) {
      if (accept && candidates[offset].distance > nearest) break;
      const relevant = candidates.slice(offset, offset + EXPLORATION_SURFACE_LIMITS.candidates).map(candidate => candidate.mesh);
      this.metrics.testedMeshes += relevant.length;
      if (accept) this.ray.far = nearest;
      const batch = this.options.intersect ? this.options.intersect(this.ray, relevant) : this.ray.intersectObjects(relevant, false);
      for (const hit of batch) if (!accept || accept(hit)) { hits.push(hit); nearest = Math.min(nearest, hit.distance); }
    }
    return hits.sort((a, b) => a.distance - b.distance);
  }

  private surfaceNormal(hit: THREE.Intersection): THREE.Vector3 | null {
    if (!hit.face) return null;
    const mesh = hit.object as THREE.Mesh, normal = hit.face.normal.clone();
    this.instanceMatrix.copy(mesh.matrixWorld);
    if (mesh instanceof THREE.InstancedMesh && hit.instanceId !== undefined) { const instance = new THREE.Matrix4(); mesh.getMatrixAt(hit.instanceId, instance); this.instanceMatrix.multiply(instance); }
    return normal.applyMatrix3(this.normalMatrix.getNormalMatrix(this.instanceMatrix)).normalize();
  }

  ground(point: THREE.Vector3, maxRise = .5, maxDrop = 100): ExplorationGround | null {
    if (this.disposed || ![point.x, point.y, point.z, maxRise, maxDrop].every(Number.isFinite) || maxRise < 0 || maxDrop < 0) return null;
    const rise = Math.min(2, maxRise), drop = Math.min(EXPLORATION_SURFACE_LIMITS.maxDrop, maxDrop), origin = point.clone(); origin.y += rise + .005;
    const sample = (tiles: Tile[]): ExplorationGround | null => {
      const meshes = tiles.flatMap(tile => tile.ground), water = new Set(tiles.flatMap(tile => [...tile.water]));
      const hit = this.cast(origin, new THREE.Vector3(0, -1, 0), rise + drop + .01, meshes, undefined, hit => (this.surfaceNormal(hit)?.y ?? 0) >= .25)[0];
      return hit ? { y: hit.point.y, normal: this.surfaceNormal(hit)!, water: water.has(hit.object as THREE.Mesh) } : null;
    };
    const resident = sample(this.nearby(point));
    if (resident) return resident;
    if (this.options.fallbackAllowed?.(point) === false) return null;
    this.refreshGroups(this.options.fallbackGroups?.() ?? [], this.fallbackTiles, true);
    const fallback = sample([...this.fallbackTiles.values()]);
    return fallback ? { ...fallback, fallback: true } : null;
  }

  /** Reconcile a formerly coarse-supported walker with newly loaded grading.
   * The controller must request this only after fallback support. Roofs,
   * bridges and buildings are never recovery floors; every other solid still
   * blocks the upward body path and the standing destination. */
  recoverGround(point: THREE.Vector3): ExplorationGround | null {
    if (this.disposed || ![point.x, point.y, point.z].every(Number.isFinite)) return null;
    const terrain = this.nearby(point).flatMap(tile => tile.terrain);
    if (!terrain.length) return null;
    const origin = point.clone(); origin.y += 8;
    const hit = this.cast(origin, new THREE.Vector3(0, -1, 0), 8, terrain, undefined, hit => (this.surfaceNormal(hit)?.y ?? 0) >= EXPLORATION_LIMITS.slopeNormal)[0];
    if (!hit || hit.point.y <= point.y + .04 || hit.point.y - point.y > 8) return null;
    const target = point.clone().setY(hit.point.y + .025);
    if (!this.clear(target)) return null;
    // Newly resident earth occupies the previous overview contact. Ignore
    // only those classified terrain meshes during this single reconciliation;
    // ceiling, bridge and building meshes keep their exact collision tests.
    const ignoredTerrain = new Set(terrain);
    if (!this.clearFiltered(point, EXPLORATION_LIMITS.radius, EXPLORATION_LIMITS.height, ignoredTerrain)) return null;
    const resolved = this.sweepFiltered(point, target, EXPLORATION_LIMITS.radius, EXPLORATION_LIMITS.height, ignoredTerrain);
    if (resolved.distanceToSquared(target) > .0001) return null;
    return { y: hit.point.y, normal: this.surfaceNormal(hit)!, water: false };
  }

  private solids(point: THREE.Vector3, radius: number): readonly THREE.Mesh[] {
    // A resident ground query must succeed separately; camera candidates alone
    // can include a distant neighbor whose world bounds overlap a missing tile.
    if (!this.options.solids) return this.nearby(point, radius).flatMap(tile => tile.solids);
    this.refresh();
    const cached = this.solidsCache;
    if (cached && cached.point.distanceTo(point) + radius <= cached.radius) return cached.meshes;
    const expanded = radius + 8, meshes = this.options.solids(point, expanded);
    this.solidsCache = { point: point.clone(), radius: expanded, meshes };
    return meshes;
  }

  private capsuleCandidates(from: THREE.Vector3, to: THREE.Vector3, radius: number, height: number, ignore?: ReadonlySet<THREE.Mesh>): Capsule {
    const box = new THREE.Box3().setFromPoints([from, to]); box.max.y += height;
    // The side rays also extend by the forward padding: at diagonal headings
    // their combined axis reach can be sqrt(2) times the capsule radius.
    box.expandByScalar(radius * Math.SQRT2 + .02);
    const meshes: THREE.Mesh[] = [], bounds = new Map<THREE.Mesh, THREE.Box3>();
    // Every ray in this query remains inside the capsule's swept envelope.
    // Inspect each scene mesh once, rather than repeating a whole tile scan
    // for every torso/side/head ray or every sidewalk-path sample.
    for (const mesh of this.solids(from, from.distanceTo(to) + radius + 1)) {
      this.metrics.broadPhaseMeshes++;
      if (ignore?.has(mesh) || !this.visible(mesh)) continue;
      const meshBox = this.bounds(mesh);
      if (box.intersectsBox(meshBox)) { meshes.push(mesh); bounds.set(mesh, meshBox); }
    }
    this.metrics.broadPhaseCandidates += meshes.length;
    return { meshes, bounds };
  }

  private ceiling(origin: THREE.Vector3, length: number, meshes: readonly THREE.Mesh[], boxes: ReadonlyMap<THREE.Mesh, THREE.Box3>): number | null {
    const up = new THREE.Vector3(0, 1, 0), direct = this.cast(origin, up, length, meshes, boxes);
    if (!direct) return null;
    // A single-sided roof faces skyward. The reverse ray catches that underside
    // without changing the shared source material or global raycast behavior.
    const reverse = this.cast(origin.clone().addScaledVector(up, length), up.negate(), length, meshes, boxes);
    if (!reverse) return null;
    return Math.min(direct[0]?.distance ?? Infinity, ...reverse.map(hit => length - hit.distance));
  }

  sweep(from: THREE.Vector3, to: THREE.Vector3, radius: number = EXPLORATION_LIMITS.radius, height: number = EXPLORATION_LIMITS.height): THREE.Vector3 {
    return this.sweepFiltered(from, to, radius, height);
  }

  private sweepFiltered(from: THREE.Vector3, to: THREE.Vector3, radius: number, height: number, ignore?: ReadonlySet<THREE.Mesh>): THREE.Vector3 {
    const result = from.clone();
    if (this.disposed || ![from.x, from.y, from.z, to.x, to.y, to.z, radius, height].every(Number.isFinite) || radius <= 0 || height <= 0) return result;
    const direction = to.clone().sub(from), length = direction.length();
    if (length < 1e-7) return to.clone(); direction.divideScalar(length);
    const { meshes, bounds } = this.capsuleCandidates(from, to, radius, height, ignore);
    const side = new THREE.Vector3(-direction.z, 0, direction.x).normalize();
    const rays: [number, number][] = [[0, .36], [0, height * .55], [0, height - .05], [-radius, height * .55], [radius, height * .55]];
    if (direction.y > .01) rays.push([0, height]);
    if (direction.y < -.01) rays.push([0, .01]);
    let allowed = length;
    for (const [offset, y] of rays) {
      const start = from.clone().addScaledVector(side, offset); start.y += y;
      const padding = Math.abs(direction.y) > .9 ? .005 : radius;
      const hits = this.cast(start, direction, length + padding, meshes, bounds);
      if (!hits) return result;
      if (hits.length) allowed = Math.min(allowed, Math.max(0, hits[0].distance - padding - .015));
    }
    if (direction.y > .99) {
      const top = from.clone(); top.y += height;
      const ceiling = this.ceiling(top, length + .02, meshes, bounds);
      if (ceiling === null) return result;
      allowed = Math.min(allowed, Math.max(0, ceiling - .015));
    }
    return result.addScaledVector(direction, allowed);
  }

  clear(point: THREE.Vector3, radius: number = EXPLORATION_LIMITS.radius, height: number = EXPLORATION_LIMITS.height): boolean {
    return this.clearFiltered(point, radius, height);
  }

  private clearFiltered(point: THREE.Vector3, radius: number, height: number, ignore?: ReadonlySet<THREE.Mesh>): boolean {
    if (this.disposed || ![point.x, point.y, point.z, radius, height].every(Number.isFinite) || radius <= 0 || height <= 0) return false;
    const { meshes, bounds } = this.capsuleCandidates(point, point, radius, height, ignore);
    for (const y of [.36, height - .08]) for (const angle of [0, Math.PI / 4, Math.PI / 2, Math.PI * 3 / 4]) {
      const direction = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
      const start = point.clone().addScaledVector(direction, -radius); start.y += y;
      const hits = this.cast(start, direction, radius * 2, meshes, bounds);
      if (!hits || hits.length) return false;
    }
    const origin = point.clone(); origin.y += .10;
    const overhead = this.ceiling(origin, height - .10, meshes, bounds);
    return overhead === Infinity;
  }

  dispose(): void { this.disposed = true; this.tiles.clear(); this.fallbackTiles.clear(); this.solidsCache = undefined; this.metrics.cachedGroups = 0; }
}
