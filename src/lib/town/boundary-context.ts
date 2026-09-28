import * as THREE from 'three';
import catalog from '../../../data/derived/town/boundary-context-index.json';
import { boundsDistanceSquared, type AssetRef, type Bounds, type V3 } from './contracts';
import { TileDetailStream } from './optional-detail';
import { withLoadDeadline } from './critical-load';

type ContextRef = AssetRef & { origin: V3; bounds: Bounds; triangles: number; trees: number };
export type ContextPacket = { version: 1; cellId: string; sourceManifestSha256: string; origin: V3; batches: { role: string; positions: number[] }[]; trees: number[][]; records: unknown[] };
const index = catalog as unknown as { version: number; sourceManifestSha256: string; cellSizeM: number; drivable: boolean; tiles: Record<string, ContextRef> };
const roles = new Set(['ground', 'water', 'bank', 'road', 'roof', 'wall0', 'wall1', 'wall2', 'wall3', 'wall4', 'window']);
const palette: Record<string, number> = { ground: 0x697850, water: 0x476b70, bank: 0x746f5d, road: 0x44474a, roof: 0x565451, wall0: 0xd3d0c3, wall1: 0xb4bcb7, wall2: 0xd8c6aa, wall3: 0xadbbb9, wall4: 0xab8778, window: 0x536770 };
/** Smooth only newly generated land. Roof/wall creases stay sharp, and every
 * position remains exact; this removes triangulation shading from the DEM. */
export function smoothContextGround(geometry: THREE.BufferGeometry): void {
  const p = geometry.getAttribute('position'), normals = geometry.getAttribute('normal');
  const groups = new Map<string, { normal: THREE.Vector3; indices: number[] }>();
  for (let i = 0; i < p.count; i++) {
    const key = `${p.getX(i)},${p.getY(i)},${p.getZ(i)}`;
    let row = groups.get(key); if (!row) { row = { normal: new THREE.Vector3(), indices: [] }; groups.set(key, row); }
    row.normal.x += normals.getX(i); row.normal.y += normals.getY(i); row.normal.z += normals.getZ(i); row.indices.push(i);
  }
  for (const row of groups.values()) { row.normal.normalize(); for (const i of row.indices) normals.setXYZ(i, row.normal.x, row.normal.y, row.normal.z); }
  normals.needsUpdate = true;
}
export function boundaryContextAsset(id: string): ContextRef | undefined { return index.tiles[id]; }
export function validBoundaryContext(value: unknown, id: string): value is ContextPacket {
  const p = value as ContextPacket, ref = index.tiles[id];
  if (!ref || p?.version !== 1 || p.cellId !== id || p.sourceManifestSha256 !== index.sourceManifestSha256 || !Array.isArray(p.origin) || p.origin.length !== 3 || p.origin.some((v, i) => v !== ref.origin[i]) || !Array.isArray(p.batches) || p.batches.length > roles.size || !Array.isArray(p.trees) || p.trees.length > 1000 || !Array.isArray(p.records)) return false;
  const used = new Set<string>(); let triangles = 0;
  for (const b of p.batches) {
    if (!roles.has(b.role) || used.has(b.role) || !Array.isArray(b.positions) || b.positions.length % 9 || b.positions.length > 1800000 || b.positions.some(v => !Number.isFinite(v) || Math.abs(v) > 1600)) return false;
    used.add(b.role); triangles += b.positions.length / 9;
  }
  return triangles === ref.triangles && p.trees.length === ref.trees && p.trees.every(row => Array.isArray(row) && row.length === 6 && row.every(Number.isFinite) && row[3] >= 3 && row[3] <= 30 && row[4] > 0 && row[4] <= 10);
}

/** Only new outside-town geometry is created. Source objects are never passed
 * to this constructor, and tree prototype ownership remains with TownWorld. */
export function createBoundaryContext(packet: ContextPacket): THREE.Group {
  const group = new THREE.Group(); group.name = `Neighboring scenery | ${packet.cellId}`; group.position.fromArray(packet.origin);
  group.userData.boundaryContext = { nonDrivable: true, sourceManifestSha256: packet.sourceManifestSha256, records: packet.records.length };
  for (const batch of packet.batches) {
    if (!batch.positions.length) continue;
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(batch.positions, 3)); geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    if (batch.role === 'ground') smoothContextGround(geometry);
    const material = new THREE.MeshStandardMaterial({ name: `Boundary context | ${batch.role}`, color: palette[batch.role], roughness: batch.role === 'water' ? .3 : batch.role === 'window' ? .28 : .96, metalness: batch.role === 'window' ? .12 : 0, dithering: true });
    const mesh = new THREE.Mesh(geometry, material); mesh.name = `Non-drivable context | ${batch.role}`; mesh.receiveShadow = true; mesh.castShadow = batch.role.startsWith('wall') || batch.role === 'roof'; group.add(mesh);
  }
  return group;
}

export function boundaryTreeRows(packet: ContextPacket): number[][] {
  return packet.trees.map(([x, north, ground, height, radius, yaw]) => [x - packet.origin[0], ground + height * .71 - packet.origin[1], -north - packet.origin[2], radius, height * .30, radius, yaw]);
}

export type ContextTreePlan = { near: Set<number>; shadows: Set<number>; key: string };
type TreeCell = { id: string; rows: number[][]; origin: V3 };
/** A small global near-detail allowance; context can only spend shadows left
 * by the mapped town, never exceed its shared shadow budget. */
export function planContextTrees(cells: readonly TreeCell[], position: V3, low: boolean, shadowBudget: number): Map<string, ContextTreePlan> {
  const plans = new Map(cells.map(cell => [cell.id, { near: new Set<number>(), shadows: new Set<number>(), key: '' }]));
  const candidates = cells.flatMap(cell => cell.rows.map((row,index) => ({ id: cell.id, index, distance: Math.hypot(row[0]+cell.origin[0]-position[0],row[2]+cell.origin[2]-position[2]) }))).filter(row => row.distance < 90);
  candidates.sort((a,b) => a.distance-b.distance || a.id.localeCompare(b.id) || a.index-b.index);
  const near = candidates.slice(0,low ? 12 : 32);
  for (const row of near) plans.get(row.id)!.near.add(row.index);
  for (const row of near.filter(row => row.distance < 55).slice(0,low ? 0 : Math.max(0,Math.min(12,Math.floor(shadowBudget))))) plans.get(row.id)!.shadows.add(row.index);
  for (const plan of plans.values()) plan.key = `${Number(low)}:${[...plan.near].sort((a,b)=>a-b).join(',')}|${[...plan.shadows].sort((a,b)=>a-b).join(',')}`;
  return plans;
}
function treeInstanceBytes(group: THREE.Group): number {
  let bytes=0; group.traverse(object => { if(object instanceof THREE.InstancedMesh) bytes += object.instanceMatrix.array.byteLength + (object.instanceColor?.array.byteLength ?? 0); }); return bytes;
}

type Hooks = {
  adopt(group: THREE.Group): void; release(group: THREE.Group): void;
  trees(rows: number[][], origin: V3, plan: ContextTreePlan): THREE.Group; releaseTrees(group: THREE.Group): void;
  changed(): void;
};
/** An optional, independently bounded neighboring scenery stream. Its requests
 * start only after the owner street and shared prototypes are ready. They do
 * not participate in readiness, drive-graph selection or the original tile LOD. */
export class BoundaryContext {
  readonly root = new THREE.Group();
  private readonly stream: TileDetailStream<ContextPacket>;
  private readonly loaded = new Map<string, { body: THREE.Group; trees: THREE.Group; rows: number[][]; origin: V3; plan: ContextTreePlan; treeBytes: number; bytes: number; triangles: number; last: number }>();
  private readonly inflight = new Map<string, AbortController>();
  private readonly failures = new Map<string, number>();
  private wanted = new Set<string>();
  private disposed = false;
  private enabled: boolean;
  private low = false;
  private maxAssemblyMs = 0;
  private treeDetailKey = '';
  private position: V3 = [0,0,0];
  private shadowBudget = 0;
  constructor(sourceManifestSha256: string | undefined, read: (url: string, signal: AbortSignal) => Promise<unknown>, private readonly hooks: Hooks) {
    this.root.name = 'Outside mapped town | non-drivable context';
    this.enabled = sourceManifestSha256 === index.sourceManifestSha256 && index.version === 1 && !index.drivable;
    this.stream = new TileDetailStream(boundaryContextAsset, validBoundaryContext, read, 4 * 1024 * 1024);
  }
  setLow(low: boolean): void { this.low = low; this.stream.setBudget((low ? 2 : 4) * 1024 * 1024); }
  update(position: V3, ready: boolean, shadowBudget = 0): void {
    if (this.disposed || !this.enabled) return;
    this.position = [...position]; this.shadowBudget = shadowBudget;
    const now = performance.now(), radius = this.low ? 1100 : 1450;
    const selected = Object.entries(index.tiles).map(([id, ref]) => ({ id, ref, distance: boundsDistanceSquared(ref.bounds, position) })).filter(row => row.distance < radius * radius).sort((a, b) => a.distance - b.distance).slice(0, this.low ? 12 : 20);
    this.wanted = new Set(selected.map(row => row.id));
    for (const [id, abort] of this.inflight) if (!this.wanted.has(id)) abort.abort();
    for (const [id, entry] of this.loaded) {
      entry.body.visible = entry.trees.visible = this.wanted.has(id);
      if (entry.body.visible) entry.last = now;
      else if (now - entry.last > 4000) this.evict(id);
    }
    // Hidden objects cannot accumulate indefinitely during repeated teleports.
    let bytes = [...this.loaded.values()].reduce((sum, row) => sum + row.bytes, 0);
    for (const [id, entry] of [...this.loaded].filter(([, row]) => !row.body.visible).sort((a, b) => a[1].last - b[1].last)) {
      if (bytes <= (this.low ? 12 : 24) * 1024 * 1024) break;
      bytes -= entry.bytes; this.evict(id);
    }
    this.refreshTreeDetail();
    if (!ready || this.inflight.size) return;
    const next = selected.find(row => !this.loaded.has(row.id) && now - (this.failures.get(row.id) ?? -Infinity) > 10000);
    if (!next) return;
    const abort = new AbortController(); this.inflight.set(next.id, abort);
    void withLoadDeadline(abort.signal, signal => this.stream.tile(next.id, signal), { label: 'Neighboring scenery', timeoutMs: 8000 }).then(packet => {
      if (!packet || abort.signal.aborted || this.disposed || !this.wanted.has(next.id)) { if (!abort.signal.aborted && !this.disposed) this.failures.set(next.id, performance.now()); return; }
      const start = performance.now(); let body: THREE.Group | undefined, trees: THREE.Group | undefined;
      try {
        body = createBoundaryContext(packet); this.hooks.adopt(body);
        const rows = boundaryTreeRows(packet), cells = this.visibleTreeCells();
        const plan = planContextTrees([...cells,{id:next.id,rows,origin:packet.origin}],this.position,this.low,this.shadowBudget).get(next.id)!;
        trees = this.hooks.trees(rows, packet.origin, plan);
        this.root.add(body, trees);
        let bytes = 0; body.traverse(object => { if (object instanceof THREE.Mesh) for (const attribute of Object.values(object.geometry.attributes)) bytes += (attribute as THREE.BufferAttribute).array.byteLength; });
        const treeBytes = treeInstanceBytes(trees);
        this.loaded.set(next.id, { body, trees, rows, origin:packet.origin, plan, treeBytes, bytes:bytes+treeBytes+rows.length*7*8, triangles: next.ref.triangles, last: performance.now() });
        this.treeDetailKey = ''; this.refreshTreeDetail();
        this.failures.delete(next.id); this.maxAssemblyMs = Math.max(this.maxAssemblyMs, performance.now() - start);
      } catch { if (trees) this.hooks.releaseTrees(trees); if (body) this.hooks.release(body); this.failures.set(next.id, performance.now()); }
      this.hooks.changed();
    }).catch(() => { if (!abort.signal.aborted && !this.disposed) this.failures.set(next.id, performance.now()); }).finally(() => { if (this.inflight.get(next.id) === abort) this.inflight.delete(next.id); this.hooks.changed(); });
  }
  shadowDemand(position: V3): number {
    if(this.low)return 0;
    let count=0;for(const row of this.loaded.values())if(row.body.visible)for(const tree of row.rows){if(Math.hypot(tree[0]+row.origin[0]-position[0],tree[2]+row.origin[2]-position[2])<55&&++count===12)return count;}return count;
  }
  private visibleTreeCells(): TreeCell[] { return [...this.loaded].filter(([,row])=>row.body.visible).map(([id,row])=>({id,rows:row.rows,origin:row.origin})); }
  private refreshTreeDetail(): void {
    const cells=this.visibleTreeCells(), key=`${Math.floor(this.position[0]/8)},${Math.floor(this.position[2]/8)}:${this.low}:${this.shadowBudget}:${cells.map(row=>row.id).sort().join(',')}`;
    if(key===this.treeDetailKey)return;
    this.treeDetailKey=key; const started=performance.now();
    const plans=planContextTrees(cells,this.position,this.low,this.shadowBudget);
    for(const [id,plan] of plans){
      const row=this.loaded.get(id)!;if(row.plan.key===plan.key)continue;
      const trees=this.hooks.trees(row.rows,row.origin,plan), bytes=treeInstanceBytes(trees);
      this.hooks.releaseTrees(row.trees);row.trees=trees;row.bytes+=bytes-row.treeBytes;row.treeBytes=bytes;row.plan=plan;this.root.add(trees);
    }
    this.maxAssemblyMs=Math.max(this.maxAssemblyMs,performance.now()-started);
  }
  retry(): void { this.failures.clear(); }
  resources() { return { ...this.stream.resources(), enabled: this.enabled, loaded: this.loaded.size, pending: this.inflight.size, failures: this.stream.failures, retainedGeometryBytes: [...this.loaded.values()].reduce((sum, row) => sum + row.bytes, 0), triangles: [...this.loaded.values()].filter(row => row.body.visible).reduce((sum, row) => sum + row.triangles, 0), maxAssemblyMs: this.maxAssemblyMs, nearTrees:[...this.loaded.values()].filter(row=>row.body.visible).reduce((sum,row)=>sum+row.plan.near.size,0), shadowTrees:[...this.loaded.values()].filter(row=>row.body.visible).reduce((sum,row)=>sum+row.plan.shadows.size,0) }; }
  private evict(id: string): void { const row = this.loaded.get(id); if (!row) return; this.hooks.releaseTrees(row.trees); this.hooks.release(row.body); this.loaded.delete(id); }
  dispose(): void { if (this.disposed) return; this.disposed = true; for (const abort of this.inflight.values()) abort.abort(); this.inflight.clear(); this.stream.dispose(); for (const id of this.loaded.keys()) this.evict(id); this.failures.clear(); this.wanted.clear(); this.root.removeFromParent(); }
}
