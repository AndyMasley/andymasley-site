import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { boundsDistanceSquared, chooseLod, type Quality, type TownTile, type V3, type WorldManifest, type WorldMetrics } from './contracts';
import { TownSurfaces } from './surfaces';
import { decodeCoverPNG } from './cover-data';
import { applyArtMaterial, treeArtColor } from './art-materials';

type TreePlan = { near: Set<number>; shadows: Set<number>; key: string };
type LoadedTile = { group: THREE.Group; level: number; lastUsed: number; trees?: THREE.Group; treeRows?: number[][]; treePlan?: TreePlan };
type MaterialEntry = { material: THREE.Material; refs: number; textures: string[] };
const TEXTURE_SLOTS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'alphaMap'] as const;

export class TownWorld {
  readonly metrics: WorldMetrics = { pending: 0, loaded: 0, triangles: 0, bytes: 0, errors: 0 };
  readonly root = new THREE.Group();
  readonly loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  readonly loaded = new Map<string, LoadedTile>();
  private inflight = new Map<string, AbortController>();
  private wanted = new Map<string, number>();
  private materialPool = new Map<string, MaterialEntry>();
  private texturePool = new Map<string, { texture: THREE.Texture; refs: number }>();
  private leases = new WeakMap<THREE.Object3D, Set<string>>();
  private prototypes: THREE.Group[] = [];
  private backdropMaterials: THREE.Material[] = [];
  private failures = new Map<string, number>();
  private disposed = false;
  private generation = 0;
  private low = false;
  private mobile = false;
  private treeShadows = true;
  private position: V3 = [0, 0, 0];
  private preparingAt: V3 | null = null;
  private sharedAbort = new AbortController();
  private surfaces?: TownSurfaces;

  constructor(readonly manifest: WorldManifest, readonly manifestUrl: string, readonly onChange: () => void) {
    this.root.name = 'Webster scenery';
    if (manifest.surfaces) this.surfaces = new TownSurfaces(manifest.surfaces, async (asset, color, signal, data = false) => {
      const response = await fetch(this.url(asset.url), { signal });
      if (!response.ok) throw new Error(`Ground surface could not load (${response.status}).`);
      if (data) {
        const bytes = new Uint8Array(await response.arrayBuffer());
        this.metrics.bytes += Number(response.headers.get('content-length')) || bytes.length;
        if (this.disposed || signal.aborted) throw new DOMException('Loading cancelled', 'AbortError');
        const mask = decodeCoverPNG(bytes);
        const texture = new THREE.DataTexture(mask.data, mask.width, mask.height);
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.generateMipmaps = true;
        texture.needsUpdate = true;
        return texture;
      }
      const blob = await response.blob();
      this.metrics.bytes += Number(response.headers.get('content-length')) || blob.size;
      const bitmap = await createImageBitmap(blob, { imageOrientation: 'none', premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
      if (this.disposed || signal.aborted) {
        bitmap.close();
        throw new DOMException('Loading cancelled', 'AbortError');
      }
      const texture = new THREE.Texture(bitmap);
      texture.flipY = false;
      texture.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      texture.needsUpdate = true;
      return texture;
    });
  }

  url(path: string): string { return new URL(path, this.manifestUrl).href; }

  private ownsCell(tile: TownTile, position: V3): boolean {
    const size = this.manifest.tileSizeM ?? 250;
    return position[0] >= tile.origin[0] && position[0] < tile.origin[0] + size &&
      position[2] <= tile.origin[2] && position[2] > tile.origin[2] - size;
  }

  async fetchJson<T>(path: string, signal?: AbortSignal): Promise<T> {
    const response = await fetch(this.url(path), { signal });
    if (!response.ok) throw new Error(`Town asset could not load (${response.status}).`);
    const text = await response.text();
    this.metrics.bytes += Number(response.headers.get('content-length')) || text.length;
    return JSON.parse(text) as T;
  }

  async loadGlb(path: string, signal: AbortSignal = this.sharedAbort.signal): Promise<THREE.Group> {
    const url = this.url(path);
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error(`Scenery could not load (${response.status}).`);
    const data = await response.arrayBuffer();
    this.metrics.bytes += Number(response.headers.get('content-length')) || data.byteLength;
    const gltf = await this.loader.parseAsync(data, new URL('.', url).href);
    if (this.disposed || signal.aborted) {
      this.disposeRaw(gltf.scene);
      throw new DOMException('Loading cancelled', 'AbortError');
    }
    gltf.scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        for (const slot of TEXTURE_SLOTS) {
          const texture = (material as THREE.MeshStandardMaterial)[slot];
          if (!texture) continue;
          const reference = gltf.parser.associations.get(texture);
          const definition = gltf.parser.json.textures?.[reference?.textures ?? -1];
          const imageIndex = definition?.extensions?.KHR_texture_basisu?.source ?? definition?.source;
          const uri = gltf.parser.json.images?.[imageIndex]?.uri;
          texture.userData.sourceUrl = uri ? new URL(uri, url).href : `${url}#image-${imageIndex ?? texture.uuid}`;
        }
      }
    });
    this.acquireMaterials(gltf.scene);
    gltf.scene.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.receiveShadow = true;
        object.castShadow = /building|landmark|car|roof|facade/i.test(object.name);
      }
    });
    return gltf.scene;
  }

  async initialize(): Promise<void> {
    await this.surfaces?.initialize(this.sharedAbort.signal);
    const fallback = await this.loadGlb(this.manifest.fallback.url);
    fallback.name = 'Town landscape overview';
    fallback.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.renderOrder = -100;
      object.castShadow = false;
      object.receiveShadow = false;
      const backdrop = (material: THREE.Material): THREE.Material => {
        const copy = material.clone();
        copy.depthWrite = false;
        this.backdropMaterials.push(copy);
        return copy;
      };
      object.material = Array.isArray(object.material) ? object.material.map(backdrop) : backdrop(object.material);
    });
    this.root.add(fallback);
    for (const prototype of this.manifest.trees?.prototypes ?? []) {
      this.prototypes.push(await this.loadGlb(prototype.url));
    }
  }

  setQuality(quality: Quality, mobile: boolean): void {
    this.mobile = mobile;
    this.low = quality === 'low' || (quality === 'auto' && mobile);
    this.treeShadows = !this.low && !mobile;
    this.generation++;
  }

  updatePresentation(timeSeconds: number, position: V3 = this.position): void {
    this.surfaces?.update(position, this.low || this.mobile, timeSeconds);
  }

  presentationResources() {
    return this.surfaces?.grassResources() ?? { tufts: 0, triangles: 0, bytes: 0, indexedTiles: 0, bins: 0, rebuilds: 0, materials: 0 };
  }

  update(position: V3, lookAhead: V3, force = false): void {
    if (this.disposed) return;
    const preparing = this.preparingAt;
    if (preparing) position = lookAhead = preparing;
    this.position = position;
    const radius = this.low ? 620 : 950;
    const time = performance.now();
    let selected = (preparing ? this.readinessTiles(position) : this.manifest.tiles)
      .map((tile) => ({ tile, distance: Math.sqrt(boundsDistanceSquared(tile.bounds, position)), ahead: Math.sqrt(boundsDistanceSquared(tile.bounds, lookAhead)) }))
      .filter(({ distance, ahead }) => preparing || distance < radius || ahead < (this.low ? 240 : 350))
      .sort((a, b) => Number(this.ownsCell(b.tile, position)) - Number(this.ownsCell(a.tile, position)) || Math.min(a.distance, a.ahead + 80) - Math.min(b.distance, b.ahead + 80));
    if (!preparing) selected = selected.slice(0, this.low ? 26 : 48);
    const desired = new Map<string, number>();
    const treePlans = this.planTrees(selected.map(({ tile }) => tile));
    for (const { tile, distance } of selected) {
      let level = chooseLod(tile, distance, this.low);
      const cached = this.loaded.get(tile.id);
      if (cached) {
        cached.lastUsed = time;
        const boundary = Math.min(cached.level, level) === 0 ? (this.low ? 160 : 280) : (this.low ? 430 : 650);
        if (!force && cached.level !== level && Math.abs(distance - boundary) < 35) level = cached.level;
        cached.group.visible = true;
        const treePlan = treePlans.get(tile.id);
        if (cached.treeRows && treePlan && cached.treePlan?.key !== treePlan.key) {
          if (cached.trees) this.releaseTrees(cached.trees);
          cached.trees = this.buildTrees(cached.treeRows, tile.origin, treePlan);
          cached.treePlan = treePlan;
          this.root.add(cached.trees);
        }
        if (cached.trees) cached.trees.visible = distance < (this.low ? 500 : 800);
      }
      desired.set(tile.id, level);
    }
    this.wanted = desired;
    for (const [id, controller] of this.inflight) if (!desired.has(id)) controller.abort();
    for (const [id, cached] of this.loaded) {
      if (!desired.has(id)) {
        cached.group.visible = false;
        if (cached.trees) cached.trees.visible = false;
        if (time - cached.lastUsed > 8000 || this.loaded.size > (this.low ? 32 : 56)) this.evict(id);
      }
    }
    for (const { tile } of selected) {
      if (this.inflight.size >= 2) break;
      if (this.inflight.has(tile.id) || this.loaded.get(tile.id)?.level === desired.get(tile.id)) continue;
      if (time - (this.failures.get(tile.id) ?? -Infinity) < 10000) continue;
      void this.loadTile(tile, desired.get(tile.id)!);
    }
    this.metrics.pending = this.inflight.size;
    this.metrics.loaded = this.loaded.size;
  }

  private readinessTiles(position: V3): TownTile[] {
    const owner = this.manifest.tiles.find((tile) => this.ownsCell(tile, position));
    if (owner?.lods.length) return [owner];
    return this.manifest.tiles.filter((tile) => tile.lods.length && boundsDistanceSquared(tile.bounds, position) < 1);
  }

  isReadyAt(position: V3): boolean {
    return this.readinessTiles(position).every((tile) => this.loaded.has(tile.id));
  }

  async prepareAt(position: V3, timeoutMs = 25000): Promise<void> {
    if (this.preparingAt) throw new Error('Another street is already loading.');
    const target: V3 = [...position];
    this.preparingAt = target;
    const start = performance.now();
    try {
      do {
        if (this.disposed) throw new DOMException('Loading cancelled', 'AbortError');
        this.update(target, target, true);
        if (this.isReadyAt(target)) return;
        await new Promise((resolve) => setTimeout(resolve, 80));
      } while (performance.now() - start < timeoutMs);
      throw new Error('This street is taking longer to load. Check your connection and try again.');
    } finally {
      this.preparingAt = null;
    }
  }

  private async loadTile(tile: TownTile, level: number): Promise<void> {
    const abort = new AbortController();
    this.inflight.set(tile.id, abort);
    const lod = tile.lods.find((item) => item.level === level)!;
    let group: THREE.Group | undefined;
    let treeRows: number[][] | undefined;
    try {
      group = lod ? await this.loadGlb(lod.url, abort.signal) : new THREE.Group();
      group.position.fromArray(tile.origin);
      group.updateMatrixWorld(true);
      await this.surfaces?.apply(group, tile.id, abort.signal);
      if (tile.treeFile && this.prototypes.length) {
        const rows = await this.fetchJson<number[][] | { rows: number[][] }>(tile.treeFile.url, abort.signal);
        treeRows = Array.isArray(rows) ? rows : rows.rows;
      }
      if (this.disposed || abort.signal.aborted || !this.wanted.has(tile.id)) {
        this.releaseGroup(group);
        return;
      }
      this.evict(tile.id);
      this.root.add(group);
      // The final update allocates tree instances once, after global shadow selection.
      this.loaded.set(tile.id, { group, treeRows, level, lastUsed: performance.now() });
      this.failures.delete(tile.id);
    } catch (error) {
      if (group) this.releaseGroup(group);
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        this.failures.set(tile.id, performance.now());
        this.metrics.errors++;
        console.warn('Webster section will retry:', tile.id, error);
      }
    } finally {
      this.inflight.delete(tile.id);
      this.metrics.pending = this.inflight.size;
      this.metrics.loaded = this.loaded.size;
      this.onChange();
      if (!this.disposed) this.update(this.position, this.position);
    }
  }

  private planTrees(tiles: TownTile[]): Map<string, TreePlan> {
    const plans = new Map<string, TreePlan>();
    const candidates: { id: string; index: number; score: number }[] = [];
    const nearRadius = this.low ? 120 : 200;
    for (const tile of tiles) {
      const cached = this.loaded.get(tile.id);
      if (!cached?.treeRows) continue;
      const plan: TreePlan = { near: new Set(), shadows: new Set(), key: '' };
      cached.treeRows.forEach((row, index) => {
        const distance = Math.hypot(row[0] + tile.origin[0] - this.position[0], row[2] + tile.origin[2] - this.position[2]);
        // Per-anchor LOD, with a 20m exit band to avoid rebuilding at the boundary.
        const wasNear = cached.treePlan?.near.has(index);
        if (distance < nearRadius + (wasNear ? 20 : 0)) plan.near.add(index);
        const wasShadow = cached.treePlan?.shadows.has(index);
        // Enter at72m, leave by80m; the global cap is across all visible tiles.
        if (this.treeShadows && distance < (wasShadow ? 80 : 72)) {
          candidates.push({ id: tile.id, index, score: distance - (wasShadow ? 8 : 0) });
        }
      });
      plans.set(tile.id, plan);
    }
    candidates.sort((a, b) => a.score - b.score || a.id.localeCompare(b.id) || a.index - b.index);
    for (const candidate of candidates.slice(0, 24)) plans.get(candidate.id)!.shadows.add(candidate.index);
    for (const plan of plans.values()) {
      plan.key = `${Number(!this.low)}:${Number(this.treeShadows)}:${[...plan.near].join(',')}|${[...plan.shadows].sort((a, b) => a - b).join(',')}`;
    }
    return plans;
  }

  private buildTrees(rows: number[][], origin: V3, plan: TreePlan): THREE.Group {
    const group = new THREE.Group();
    group.position.fromArray(origin);
    const matrix = new THREE.Matrix4();
    const point = new THREE.Vector3();
    const scale = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const treeTint = new THREE.Color();
    const definitions = this.manifest.trees.prototypes;
    const near = definitions.findIndex((definition) => definition.role === 'crown' && definition.level === 0);
    const far = definitions.findIndex((definition) => definition.role === 'crown' && definition.level === 1);
    const trunk = definitions.findIndex((definition) => definition.role === 'trunk');
    const bands = [{ index: near < 0 ? 0 : near, kind: 'near' }, { index: far < 0 ? Math.max(0, near) : far, kind: 'far' }, { index: trunk, kind: 'trunk' }];
    for (const band of bands) {
      const prototype = this.prototypes[band.index];
      if (!prototype) continue;
      const isTrunk = band.kind === 'trunk';
      prototype.updateMatrixWorld(true);
      for (const castShadow of [false, true]) {
        const indices = rows.map((_, index) => index).filter((index) =>
          (isTrunk || plan.near.has(index) === (band.kind === 'near')) && plan.shadows.has(index) === castShadow);
        if (!indices.length) continue;
        prototype.traverse((object) => {
          if (!(object instanceof THREE.Mesh)) return;
          // Geometry/materials are shared with the prototypes; only instance matrices are allocated.
          for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
            if (material.alphaTest > 0) material.alphaToCoverage = true;
          }
          const mesh = new THREE.InstancedMesh(object.geometry, object.material, indices.length);
          mesh.name = `Webster trees | ${band.kind} | ${castShadow ? 'shadow' : 'ordinary'}`;
          mesh.userData.treeKind = band.kind;
          mesh.userData.sourceRows = indices;
          mesh.castShadow = castShadow;
          mesh.receiveShadow = !this.low && this.treeShadows;
          indices.forEach((rowIndex, index) => {
            const row = rows[rowIndex];
            const height = row[4] / 0.30;
            const radius = Math.max(0.12, Math.min(0.4, height * 0.015));
            point.set(row[0], row[1] - (isTrunk ? height * 0.36 : 0), row[2]);
            scale.set(isTrunk ? radius : row[3], isTrunk ? height * 0.35 : row[4], isTrunk ? radius : row[5]);
            quaternion.setFromAxisAngle(up, isTrunk ? 0 : row[6]);
            matrix.compose(point, quaternion, scale).multiply(object.matrixWorld);
            mesh.setMatrixAt(index, matrix);
            if (!isTrunk) mesh.setColorAt(index, treeArtColor(row[0] + origin[0], row[2] + origin[2], treeTint));
          });
          mesh.instanceMatrix.needsUpdate = true;
          if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
          mesh.computeBoundingBox();
          mesh.computeBoundingSphere();
          group.add(mesh);
        });
      }
    }
    return group;
  }

  private acquireMaterials(group: THREE.Object3D): void {
    const keys = new Set<string>();
    const local = new Map<THREE.Material, THREE.Material>();
    group.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const replace = (input: THREE.Material): THREE.Material => {
        if (local.has(input)) return local.get(input)!;
        const standard = input as THREE.MeshStandardMaterial;
        const textureKeys = TEXTURE_SLOTS.map((slot) => {
          const texture = standard[slot];
          if (!texture) return '';
          const source = texture.userData?.sourceUrl || texture.image?.src || texture.name;
          return JSON.stringify([source, texture.colorSpace, texture.wrapS, texture.wrapT, texture.repeat.toArray(), texture.offset.toArray(), texture.rotation, texture.channel, texture.flipY]);
        });
        const key = JSON.stringify([input.name, input.type, standard.color?.getHex(), standard.roughness, standard.metalness, standard.emissive?.getHex(), input.side, input.opacity, input.transparent, input.alphaTest, standard.vertexColors, textureKeys]);
        let entry = this.materialPool.get(key);
        if (!entry) {
          const textures: string[] = [];
          TEXTURE_SLOTS.forEach((slot, index) => {
            const texture = standard[slot];
            if (!texture) return;
            const textureKey = textureKeys[index];
            const shared = this.texturePool.get(textureKey);
            if (shared) {
              if (shared.texture !== texture) texture.dispose();
              standard[slot] = shared.texture;
              shared.refs++;
            } else {
              texture.anisotropy = 4;
              this.texturePool.set(textureKey, { texture, refs: 1 });
            }
            textures.push(textureKey);
          });
          if (standard.isMeshStandardMaterial) {
            standard.envMapIntensity = 0.12;
            applyArtMaterial(standard);
          }
          entry = { material: input, refs: 0, textures };
          this.materialPool.set(key, entry);
        } else if (entry.material !== input) {
          TEXTURE_SLOTS.forEach((slot) => {
            const texture = standard[slot];
            if (texture && ![...this.texturePool.values()].some((value) => value.texture === texture)) texture.dispose();
          });
          input.dispose();
        }
        if (!keys.has(key)) entry.refs++;
        keys.add(key);
        local.set(input, entry.material);
        return entry.material;
      };
      object.material = Array.isArray(object.material) ? object.material.map(replace) : replace(object.material);
    });
    this.leases.set(group, keys);
  }

  releaseGroup(group: THREE.Object3D): void {
    group.removeFromParent();
    this.surfaces?.release(group);
    const geometries = new Set<THREE.BufferGeometry>();
    group.traverse((object) => { if (object instanceof THREE.Mesh) geometries.add(object.geometry); });
    geometries.forEach((geometry) => geometry.dispose());
    for (const key of this.leases.get(group) ?? []) {
      const entry = this.materialPool.get(key);
      if (entry && --entry.refs <= 0) {
        entry.material.dispose();
        this.materialPool.delete(key);
        for (const textureKey of entry.textures) {
          const texture = this.texturePool.get(textureKey);
          if (texture && --texture.refs <= 0) { texture.texture.dispose(); this.texturePool.delete(textureKey); }
        }
      }
    }
    this.leases.delete(group);
  }

  private releaseTrees(group: THREE.Group): void {
    group.removeFromParent();
    group.traverse((object) => { if (object instanceof THREE.InstancedMesh) object.dispose(); });
    group.clear();
  }

  private disposeRaw(group: THREE.Object3D): void {
    group.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.geometry.dispose();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        for (const slot of TEXTURE_SLOTS) (material as THREE.MeshStandardMaterial)[slot]?.dispose();
        material.dispose();
      }
    });
  }

  private evict(id: string): void {
    const entry = this.loaded.get(id);
    if (!entry) return;
    this.releaseGroup(entry.group);
    if (entry.trees) this.releaseTrees(entry.trees);
    this.loaded.delete(id);
  }

  residentResources(): { materialCount: number; textureCount: number; estimatedTextureBytes: number; estimatedGeometryBytes: number } {
    const buffers = new Set<ArrayBufferLike>();
    const inspect = (object: THREE.Object3D): void => {
      if (!(object instanceof THREE.Mesh)) return;
      for (const attribute of Object.values(object.geometry.attributes) as (THREE.BufferAttribute | THREE.InterleavedBufferAttribute)[]) {
        const array = attribute instanceof THREE.InterleavedBufferAttribute ? attribute.data.array : attribute.array;
        buffers.add(array.buffer);
      }
      if (object.geometry.index) buffers.add(object.geometry.index.array.buffer);
      if (object instanceof THREE.InstancedMesh) {
        buffers.add(object.instanceMatrix.array.buffer);
        if (object.instanceColor) buffers.add(object.instanceColor.array.buffer);
      }
    };
    this.root.traverse(inspect);
    for (const prototype of this.prototypes) prototype.traverse(inspect);
    let estimatedTextureBytes = 0;
    for (const { texture } of this.texturePool.values()) {
      const image = texture.image;
      if (image?.width && image?.height) estimatedTextureBytes += image.width * image.height * 4 * (texture.generateMipmaps ? 4 / 3 : 1);
    }
    const surfaces = this.surfaces?.resources() ?? { materials: 0, textures: 0, bytes: 0 };
    return { materialCount: this.materialPool.size + surfaces.materials, textureCount: this.texturePool.size + surfaces.textures, estimatedTextureBytes: Math.round(estimatedTextureBytes + surfaces.bytes), estimatedGeometryBytes: [...buffers].reduce((sum, buffer) => sum + buffer.byteLength, 0) };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.sharedAbort.abort();
    for (const controller of this.inflight.values()) controller.abort();
    for (const id of [...this.loaded.keys()]) this.evict(id);
    for (const object of [...this.root.children]) this.releaseGroup(object);
    for (const prototype of this.prototypes) this.releaseGroup(prototype);
    for (const material of this.backdropMaterials) material.dispose();
    this.surfaces?.dispose();
    this.root.removeFromParent();
  }
}
