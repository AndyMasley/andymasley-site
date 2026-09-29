import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';

const LIMITS = { minimumTriangles: 512, geometries: 512, triangles: 6000000, bytes: 64 * 1048576, preparationMs: 15000, pending: 64 };
type Attribute = THREE.BufferAttribute | THREE.InterleavedBufferAttribute;
type Entry = { tree: MeshBVH; position: Attribute; index: THREE.BufferAttribute | null; positionVersion: number; indexVersion: number; start: number; count: number; triangles: number; bytes: number; release: () => void };
const version = (attribute: Attribute): number => attribute instanceof THREE.InterleavedBufferAttribute ? attribute.data.version : attribute.version;
const triangleCount = (mesh: THREE.Mesh): number => Math.floor((mesh.geometry.index?.count ?? mesh.geometry.attributes.position?.count ?? 0) / 3);

/** Session-owned camera indexes. Render geometry and global raycast methods stay untouched. */
export class CameraRaycastIndex {
  readonly metrics = { geometries: 0, triangles: 0, bytes: 0, eligibleTriangles: 0, fallbackTriangles: 0, acceleratedQueries: 0, nativeQueries: 0, buildMs: 0, maxBuildMs: 0, failures: 0, limited: 0, pending: 0 };
  private readonly entries = new Map<THREE.BufferGeometry, Entry>();
  private readonly pending = new Map<THREE.BufferGeometry, THREE.Mesh>();
  private readonly rejected = new WeakSet<THREE.BufferGeometry>();
  private readonly observed = new WeakSet<THREE.Mesh>();
  private readonly lifetime = new AbortController();
  private timer?: ReturnType<typeof setTimeout>;
  private readonly inverse = new THREE.Matrix4();
  private readonly linear = new THREE.Matrix3();
  private readonly direction = new THREE.Vector3();
  private readonly ray = new THREE.Ray();

  private eligible(mesh: THREE.Mesh): boolean {
    const geometry = mesh.geometry, position = geometry.attributes.position;
    return !!position && !Array.isArray(mesh.material) && !(mesh instanceof THREE.InstancedMesh) && !(mesh instanceof THREE.SkinnedMesh)
      && mesh.raycast === THREE.Mesh.prototype.raycast && mesh.getVertexPosition === THREE.Mesh.prototype.getVertexPosition
      && !Object.keys(geometry.morphAttributes).length && triangleCount(mesh) >= LIMITS.minimumTriangles
      && geometry.drawRange.start % 3 === 0 && (geometry.drawRange.count === Infinity || geometry.drawRange.count % 3 === 0)
      && (position instanceof THREE.InterleavedBufferAttribute ? position.data.usage : position.usage) === THREE.StaticDrawUsage;
  }

  private observe(mesh: THREE.Mesh, eligible: boolean): void {
    if (this.observed.has(mesh)) return;
    this.observed.add(mesh);
    this.metrics[eligible ? 'eligibleTriangles' : 'fallbackTriangles'] += triangleCount(mesh);
  }

  private valid(geometry: THREE.BufferGeometry, entry: Entry): boolean {
    return entry.position === geometry.attributes.position && entry.index === geometry.index
      && entry.positionVersion === version(entry.position) && entry.indexVersion === (entry.index?.version ?? 0)
      && entry.start === geometry.drawRange.start && entry.count === geometry.drawRange.count;
  }

  private build(mesh: THREE.Mesh): void {
    const geometry = mesh.geometry;
    if (this.lifetime.signal.aborted || this.rejected.has(geometry) || !this.eligible(mesh)) return;
    const previous = this.entries.get(geometry);
    if (previous && this.valid(geometry, previous)) return;
    previous?.release();
    const triangles = triangleCount(mesh);
    if (this.entries.size >= LIMITS.geometries || this.metrics.triangles + triangles > LIMITS.triangles || this.metrics.bytes >= LIMITS.bytes) { this.metrics.limited++; this.rejected.add(geometry); return; }
    const started = performance.now();
    try {
      // Indirect mode preserves the source index and non-indexed topology.
      // Material arrays use native raycasts: this pinned version's indirect
      // tree does not preserve their per-group side semantics.
      const tree = new MeshBVH(geometry, { indirect: true, setBoundingBox: false, maxLeafTris: 10 });
      const data = MeshBVH.serialize(tree, { cloneBuffers: false }) as ReturnType<typeof MeshBVH.serialize> & { indirectBuffer?: Uint16Array | Uint32Array };
      const bytes = data.roots.reduce((sum, root) => sum + root.byteLength, 0) + (data.indirectBuffer?.byteLength ?? 0);
      if (this.metrics.bytes + bytes > LIMITS.bytes) { this.metrics.limited++; this.rejected.add(geometry); return; }
      const release = (): void => {
        if (!this.entries.has(geometry)) return;
        this.entries.delete(geometry); geometry.removeEventListener('dispose', onDispose);
        this.metrics.geometries--; this.metrics.triangles -= triangles; this.metrics.bytes -= bytes;
      };
      const onDispose = (): void => { release(); this.pending.delete(geometry); this.rejected.add(geometry); this.metrics.pending = this.pending.size; };
      this.entries.set(geometry, { tree, position: geometry.attributes.position, index: geometry.index, positionVersion: version(geometry.attributes.position), indexVersion: geometry.index?.version ?? 0, start: geometry.drawRange.start, count: geometry.drawRange.count, triangles, bytes, release });
      geometry.addEventListener('dispose', onDispose);
      this.metrics.geometries++; this.metrics.triangles += triangles; this.metrics.bytes += bytes;
    } catch { this.metrics.failures++; this.rejected.add(geometry); }
    finally { const ms = performance.now() - started; this.metrics.buildMs += ms; this.metrics.maxBuildMs = Math.max(this.metrics.maxBuildMs, ms); }
  }

  private pause(signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      const cancel = (): void => { clearTimeout(timer); cleanup(); reject(new DOMException('Camera preparation cancelled', 'AbortError')); };
      const cleanup = (): void => { signal.removeEventListener('abort', cancel); this.lifetime.signal.removeEventListener('abort', cancel); };
      const timer = setTimeout(() => { cleanup(); resolve(); }, 0);
      signal.addEventListener('abort', cancel, { once: true }); this.lifetime.signal.addEventListener('abort', cancel, { once: true });
      if (signal.aborted || this.lifetime.signal.aborted) cancel();
    });
  }

  async prepare(meshes: readonly THREE.Mesh[], signal: AbortSignal, onProgress?: (done: number, total: number) => void): Promise<void> {
    const selected = new Map<THREE.BufferGeometry, THREE.Mesh>();
    for (const mesh of meshes) { const eligible = this.eligible(mesh); this.observe(mesh, eligible); if (eligible) selected.set(mesh.geometry, mesh); }
    let done = 0; const start = performance.now(); onProgress?.(0, selected.size);
    for (const mesh of selected.values()) {
      await this.pause(signal);
      if (performance.now() - start >= LIMITS.preparationMs) { this.metrics.limited++; break; }
      this.build(mesh); done++; onProgress?.(done, selected.size);
    }
    if (signal.aborted || this.lifetime.signal.aborted) throw new DOMException('Camera preparation cancelled', 'AbortError');
  }

  private queue(mesh: THREE.Mesh): void {
    if (this.lifetime.signal.aborted || this.rejected.has(mesh.geometry) || this.pending.size >= LIMITS.pending) return;
    this.pending.set(mesh.geometry, mesh); this.metrics.pending = this.pending.size;
    if (this.timer !== undefined) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      const next = this.pending.entries().next().value as [THREE.BufferGeometry, THREE.Mesh] | undefined;
      if (!next || this.lifetime.signal.aborted) return;
      this.pending.delete(next[0]); this.metrics.pending = this.pending.size; this.build(next[1]);
      const following = this.pending.values().next().value as THREE.Mesh | undefined;
      if (following) this.queue(following);
    }, 80);
  }

  intersect(raycaster: THREE.Raycaster, meshes: readonly THREE.Mesh[]): THREE.Intersection[] {
    const hits: THREE.Intersection[] = [];
    for (const mesh of meshes) {
      if (!mesh.layers.test(raycaster.layers)) continue;
      const eligible = this.eligible(mesh); this.observe(mesh, eligible);
      let entry = eligible && !this.lifetime.signal.aborted ? this.entries.get(mesh.geometry) : undefined;
      if (entry && !this.valid(mesh.geometry, entry)) { entry.release(); entry = undefined; }
      if (!entry) {
        this.metrics.nativeQueries++; raycaster.intersectObject(mesh, false, hits);
        if (eligible) this.queue(mesh);
        continue;
      }
      this.inverse.copy(mesh.matrixWorld).invert(); this.ray.copy(raycaster.ray).applyMatrix4(this.inverse);
      const scale = this.direction.copy(raycaster.ray.direction).normalize().applyMatrix3(this.linear.setFromMatrix4(this.inverse)).length();
      if (!(scale > 0) || !Number.isFinite(scale)) {
        this.metrics.nativeQueries++; raycaster.intersectObject(mesh, false, hits); continue;
      }
      this.metrics.acceleratedQueries++;
      // An affine transform scales distance along this particular ray by the
      // length of its transformed unit direction, even under parent shear.
      // Bound traversal to the short probe instead of the entire tile. Keep
      // all hits in the interval so excluding a front face retains rear faces.
      const near = raycaster.near * scale, far = raycaster.far * scale;
      const guard = 64 * Number.EPSILON * Math.max(1, this.ray.origin.length(), Math.abs(near), Number.isFinite(far) ? Math.abs(far) : 0);
      for (const hit of entry.tree.raycast(this.ray, (mesh.material as THREE.Material).side, Math.max(0, near - guard), far + guard)) {
        hit.point.applyMatrix4(mesh.matrixWorld); hit.distance = hit.point.distanceTo(raycaster.ray.origin); hit.object = mesh;
        if (hit.distance >= raycaster.near && hit.distance <= raycaster.far) hits.push(hit);
      }
    }
    return hits.sort((a, b) => a.distance - b.distance);
  }

  dispose(): void {
    this.lifetime.abort(); if (this.timer !== undefined) clearTimeout(this.timer); this.timer = undefined;
    this.pending.clear(); this.metrics.pending = 0;
    for (const entry of [...this.entries.values()]) entry.release();
  }
}
