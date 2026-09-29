import * as THREE from 'three';
import { EXPLORATION_LIMITS, type ExplorationGround, type ExplorationSurfaceLike } from './exploration';

export const EXPLORATION_SURFACE_LIMITS = { groups: 96, tiles: 4, candidates: 32 } as const;
type Intersect = (ray: THREE.Raycaster, meshes: readonly THREE.Mesh[]) => THREE.Intersection[];
export type ExplorationSurfaceOptions = {
  groups: () => Iterable<THREE.Group>;
  solids?: (position: THREE.Vector3, radius: number) => readonly THREE.Mesh[];
  intersect?: Intersect;
};
type Tile = { ground: THREE.Mesh[]; water: Set<THREE.Mesh>; solids: THREE.Mesh[]; bounds: THREE.Box3; children: number; revision: unknown; matrix: number[] };
type Bounds = { box: THREE.Box3; matrix: number[]; geometry: THREE.BufferGeometry; version: number; count: number };
const skip = /grass|foliage|leaves|leaf|canopy|crown|flower|shadow|paint|window|glass|cloud/i;
const supports = /terrain|ground|building|facade|roof|bridge|wall|foundation|asphalt|road|stone|brick|pavement|paving|sidewalk|walk|floor|parking|lot/i;

/** Reads resident scene geometry only. Mesh/box classification is cached once
 * per adopted tile; exact ray tests reuse the session's camera BVH when supplied.
 * No source meshes, global raycast hooks or material side flags are modified. */
export class ExplorationSurface implements ExplorationSurfaceLike {
  readonly metrics = { rays: 0, testedMeshes: 0, limited: 0, cachedGroups: 0, broadPhaseMeshes: 0, broadPhaseCandidates: 0 };
  private readonly tiles = new Map<THREE.Group, Tile>();
  private readonly boxes = new WeakMap<THREE.Mesh, Bounds>();
  private readonly ray = new THREE.Raycaster();
  private readonly hit = new THREE.Vector3();
  private readonly normalMatrix = new THREE.Matrix3();
  private readonly instanceMatrix = new THREE.Matrix4();
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

  private refresh(): void {
    if (this.disposed) return;
    const live = new Set<THREE.Group>();
    for (const group of this.options.groups()) {
      if (!this.visible(group) || live.size >= EXPLORATION_SURFACE_LIMITS.groups) continue;
      live.add(group); group.updateWorldMatrix(true, false);
      const previous = this.tiles.get(group);
      // Adopted optional scenery can arrive after the tile's first foot query.
      // Nested edits can explicitly increment this cheap caller-owned revision.
      if (previous && previous.children === group.children.length && previous.revision === group.userData.explorationRevision && previous.matrix.every((value, i) => value === group.matrixWorld.elements[i])) continue;
      const tile: Tile = { ground: [], water: new Set(), solids: [], bounds: new THREE.Box3(), children: group.children.length, revision: group.userData.explorationRevision, matrix: [...group.matrixWorld.elements] };
      group.updateWorldMatrix(true, true);
      group.traverse(object => {
        if (!(object instanceof THREE.Mesh) || !object.geometry.attributes.position) return;
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        let name = `${object.name} ${materials.map(material => material.name).join(' ')}`;
        for (let parent = object.parent; parent && parent !== group; parent = parent.parent) name += ` ${parent.name}`;
        const water = /\bwater\b/i.test(name) || materials.some(material => material.userData.townArt?.kind === 'water');
        const terrain = /terrain|ground|asphalt|road|pavement|sidewalk/i.test(name);
        if (!water && (!supports.test(name) || !terrain && skip.test(name))) return;
        if (object instanceof THREE.InstancedMesh && !/parked/i.test(name)) return;
        if (!water && materials.every(material => material.transparent || material.opacity < .98 || material.alphaTest > 0)) return;
        tile.bounds.union(this.bounds(object));
        if (water) tile.water.add(object);
        else tile.solids.push(object);
        if (!(object instanceof THREE.InstancedMesh)) tile.ground.push(object);
      });
      this.tiles.set(group, tile);
    }
    for (const group of this.tiles.keys()) if (!live.has(group)) this.tiles.delete(group);
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
    return [...new Set(this.nearby(position, Math.min(300, radius)).flatMap(tile => tile.ground))].filter(mesh => this.visible(mesh));
  }

  private cast(origin: THREE.Vector3, direction: THREE.Vector3, length: number, meshes: readonly THREE.Mesh[]): THREE.Intersection[] | null {
    this.ray.set(origin, direction); this.ray.near = .001; this.ray.far = length;
    const candidates: { mesh: THREE.Mesh; distance: number }[] = [];
    for (const mesh of meshes) {
      if (!this.visible(mesh)) continue;
      const box = this.bounds(mesh);
      if (!this.ray.ray.intersectBox(box, this.hit)) continue;
      const distance = box.containsPoint(origin) ? 0 : this.hit.distanceTo(origin);
      if (distance <= length) candidates.push({ mesh, distance });
    }
    if (candidates.length > EXPLORATION_SURFACE_LIMITS.candidates) { this.metrics.limited++; return null; }
    candidates.sort((a, b) => a.distance - b.distance);
    const relevant = candidates.map(candidate => candidate.mesh);
    this.metrics.rays++; this.metrics.testedMeshes += relevant.length;
    return this.options.intersect ? this.options.intersect(this.ray, relevant) : this.ray.intersectObjects(relevant, false);
  }

  ground(point: THREE.Vector3, maxRise = .5, maxDrop = 100): ExplorationGround | null {
    if (this.disposed || ![point.x, point.y, point.z, maxRise, maxDrop].every(Number.isFinite) || maxRise < 0 || maxDrop < 0) return null;
    const tiles = this.nearby(point), meshes = tiles.flatMap(tile => tile.ground), water = new Set(tiles.flatMap(tile => [...tile.water]));
    const rise = Math.min(2, maxRise), drop = Math.min(160, maxDrop), origin = point.clone(); origin.y += rise + .005;
    const hits = this.cast(origin, new THREE.Vector3(0, -1, 0), rise + drop + .01, meshes);
    if (!hits) return null;
    for (const hit of hits) {
      if (!hit.face) continue;
      const mesh = hit.object as THREE.Mesh, normal = hit.face.normal.clone();
      this.instanceMatrix.copy(mesh.matrixWorld);
      if (mesh instanceof THREE.InstancedMesh && hit.instanceId !== undefined) { const instance = new THREE.Matrix4(); mesh.getMatrixAt(hit.instanceId, instance); this.instanceMatrix.multiply(instance); }
      normal.applyMatrix3(this.normalMatrix.getNormalMatrix(this.instanceMatrix)).normalize();
      if (normal.y < .25) continue;
      return { y: hit.point.y, normal, water: water.has(mesh) };
    }
    return null;
  }

  private solids(point: THREE.Vector3, radius: number): readonly THREE.Mesh[] {
    // A resident ground query must succeed separately; camera candidates alone
    // can include a distant neighbor whose world bounds overlap a missing tile.
    return this.options.solids?.(point, radius) ?? this.nearby(point, radius).flatMap(tile => tile.solids);
  }

  private capsuleCandidates(from: THREE.Vector3, to: THREE.Vector3, radius: number, height: number): THREE.Mesh[] {
    const box = new THREE.Box3().setFromPoints([from, to]); box.max.y += height;
    // The side rays also extend by the forward padding: at diagonal headings
    // their combined axis reach can be sqrt(2) times the capsule radius.
    box.expandByScalar(radius * Math.SQRT2 + .02);
    const candidates: THREE.Mesh[] = [];
    // Every ray in this query remains inside the capsule's swept envelope.
    // Inspect each scene mesh once, rather than repeating a whole tile scan
    // for every torso/side/head ray or every sidewalk-path sample.
    for (const mesh of this.solids(from, from.distanceTo(to) + radius + 1)) {
      this.metrics.broadPhaseMeshes++;
      if (this.visible(mesh) && box.intersectsBox(this.bounds(mesh))) candidates.push(mesh);
    }
    this.metrics.broadPhaseCandidates += candidates.length;
    return candidates;
  }

  private ceiling(origin: THREE.Vector3, length: number, meshes: readonly THREE.Mesh[]): number | null {
    const up = new THREE.Vector3(0, 1, 0), direct = this.cast(origin, up, length, meshes);
    if (!direct) return null;
    // A single-sided roof faces skyward. The reverse ray catches that underside
    // without changing the shared source material or global raycast behavior.
    const reverse = this.cast(origin.clone().addScaledVector(up, length), up.negate(), length, meshes);
    if (!reverse) return null;
    return Math.min(direct[0]?.distance ?? Infinity, ...reverse.map(hit => length - hit.distance));
  }

  sweep(from: THREE.Vector3, to: THREE.Vector3, radius: number = EXPLORATION_LIMITS.radius, height: number = EXPLORATION_LIMITS.height): THREE.Vector3 {
    const result = from.clone();
    if (this.disposed || ![from.x, from.y, from.z, to.x, to.y, to.z, radius, height].every(Number.isFinite) || radius <= 0 || height <= 0) return result;
    const direction = to.clone().sub(from), length = direction.length();
    if (length < 1e-7) return to.clone(); direction.divideScalar(length);
    const meshes = this.capsuleCandidates(from, to, radius, height);
    const side = new THREE.Vector3(-direction.z, 0, direction.x).normalize();
    const rays: [number, number][] = [[0, .36], [0, height * .55], [0, height - .05], [-radius, height * .55], [radius, height * .55]];
    if (direction.y > .01) rays.push([0, height]);
    if (direction.y < -.01) rays.push([0, .01]);
    let allowed = length;
    for (const [offset, y] of rays) {
      const start = from.clone().addScaledVector(side, offset); start.y += y;
      const padding = Math.abs(direction.y) > .9 ? .005 : radius;
      const hits = this.cast(start, direction, length + padding, meshes);
      if (!hits) return result;
      if (hits.length) allowed = Math.min(allowed, Math.max(0, hits[0].distance - padding - .015));
    }
    if (direction.y > .99) {
      const top = from.clone(); top.y += height;
      const ceiling = this.ceiling(top, length + .02, meshes);
      if (ceiling === null) return result;
      allowed = Math.min(allowed, Math.max(0, ceiling - .015));
    }
    return result.addScaledVector(direction, allowed);
  }

  clear(point: THREE.Vector3, radius: number = EXPLORATION_LIMITS.radius, height: number = EXPLORATION_LIMITS.height): boolean {
    if (this.disposed || ![point.x, point.y, point.z, radius, height].every(Number.isFinite) || radius <= 0 || height <= 0) return false;
    const meshes = this.capsuleCandidates(point, point, radius, height);
    for (const y of [.36, height - .08]) for (const angle of [0, Math.PI / 4, Math.PI / 2, Math.PI * 3 / 4]) {
      const direction = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
      const start = point.clone().addScaledVector(direction, -radius); start.y += y;
      const hits = this.cast(start, direction, radius * 2, meshes);
      if (!hits || hits.length) return false;
    }
    const origin = point.clone(); origin.y += .10;
    const overhead = this.ceiling(origin, height - .10, meshes);
    return overhead === Infinity;
  }

  dispose(): void { this.disposed = true; this.tiles.clear(); this.metrics.cachedGroups = 0; }
}
