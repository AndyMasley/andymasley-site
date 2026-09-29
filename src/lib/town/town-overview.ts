import * as THREE from 'three';
import { withLoadDeadline } from './critical-load';

export const OVERVIEW_LIMITS = { triangles: 1250000, vertices: 1800000, decodedBytes: 24.5 * 1048576, transferBytes: 12 * 1048576, tiles: 2048 } as const;
export type OverviewKind = 'terrain' | 'water' | 'roads' | 'buildings' | 'trees';
type Attribute = { byteOffset: number; count: number; itemSize: number; componentType: 'uint16' | 'int8' | 'uint8' | 'uint32' };
export type OverviewLayer = {
  kind: OverviewKind; vertexCount: number; triangles: number;
  attributes: { position: Attribute; normal: Attribute; color: Attribute; tileIndex: Attribute }; index: Attribute;
  bounds: { min: number[]; max: number[] }; sourceTriangles: number; geometricErrorM: number;
};
export type OverviewCatalog = {
  version: number; format: string; sourceManifestSha256: string; sourceReleaseDirectory: string;
  quantization: { origin: number[]; scale: number[] };
  asset: { url: string; rawUrl?: string; compression: string; bytes: number; decodedBytes: number; sha256: string; decodedSha256: string };
  tiles: { id: string; origin: number[]; bounds: { min: number[]; max: number[] }; sourceIds: (number | string)[] }[];
  layers: OverviewLayer[];
};
const kinds: OverviewKind[] = ['terrain', 'water', 'roads', 'buildings', 'trees'];
const integer = (n: number, min = 0, max = Number.MAX_SAFE_INTEGER): boolean => Number.isSafeInteger(n) && n >= min && n <= max;
const finiteTriple = (v: number[]): boolean => v.length === 3 && v.every(Number.isFinite);

/** Five persistent, opaque batches show the whole town without requesting
 * distant street models. Source-owner masks swap only genuinely resident detail. */
export class TownOverview {
  readonly root = new THREE.Group();
  private readonly owner = new Map<string, number>();
  private readonly coverage: Uint8Array<ArrayBuffer>;
  private readonly mask: THREE.DataTexture;
  private ready = false;
  private disposed = false;
  private geometryBytes = 0;
  private coveredGeometry = 0;
  private coveredTrees = 0;

  constructor(readonly catalog: OverviewCatalog) {
    const { asset, tiles, layers, quantization } = catalog;
    if (catalog.version !== 1 || catalog.format !== 'town-overview-q16-v1'
      || !integer(tiles.length, 1, OVERVIEW_LIMITS.tiles) || new Set(tiles.map(t => t.id)).size !== tiles.length
      || !finiteTriple(quantization.origin) || !finiteTriple(quantization.scale) || quantization.scale.some(n => n <= 0)
      || !integer(asset.decodedBytes, 1, OVERVIEW_LIMITS.decodedBytes) || !integer(asset.bytes, 1, OVERVIEW_LIMITS.transferBytes)
      || layers.length !== kinds.length || kinds.some(kind => layers.filter(layer => layer.kind === kind).length !== 1)
      || layers.some(layer => !integer(layer.triangles) || !integer(layer.vertexCount))
      || layers.reduce((sum, layer) => sum + layer.vertexCount, 0) > OVERVIEW_LIMITS.vertices
      || layers.reduce((sum, layer) => sum + layer.triangles, 0) > OVERVIEW_LIMITS.triangles) throw new Error('Invalid whole-town overview catalog.');
    tiles.forEach((tile, index) => this.owner.set(tile.id, index));
    this.coverage = new Uint8Array(tiles.length * 4);
    this.mask = new THREE.DataTexture(this.coverage, tiles.length, 1, THREE.RGBAFormat, THREE.UnsignedByteType);
    this.mask.minFilter = this.mask.magFilter = THREE.NearestFilter;
    this.mask.generateMipmaps = false; this.mask.colorSpace = THREE.NoColorSpace; this.mask.needsUpdate = true;
    this.root.name = 'Whole-town distant scenery';
  }

  async initialize(baseURL: string, signal: AbortSignal, onBytes: (bytes: number) => void): Promise<void> {
    await withLoadDeadline(signal, async requestSignal => {
      const asset = this.catalog.asset, canDecompress = typeof DecompressionStream === 'function';
      const source = canDecompress ? asset.url : asset.rawUrl;
      if (!source) throw new Error('This browser cannot unpack the distant town.');
      const response = await fetch(new URL(source, baseURL), { signal: requestSignal });
      if (!response.ok) throw new Error(`Distant town could not load (${response.status}).`);
      const payload = await response.arrayBuffer();
      onBytes(Number(response.headers.get('content-length')) || payload.byteLength);
      if (requestSignal.aborted || this.disposed) throw new DOMException('Loading cancelled', 'AbortError');
      const digest = async (buffer: ArrayBuffer): Promise<string> => [...new Uint8Array(await crypto.subtle.digest('SHA-256', buffer))].map(value => value.toString(16).padStart(2, '0')).join('');
      const header = new Uint8Array(payload, 0, Math.min(2, payload.byteLength));
      let decoded = payload;
      if (header[0] === 31 && header[1] === 139) {
        if (payload.byteLength !== asset.bytes || await digest(payload) !== asset.sha256) throw new Error('Distant town transport checksum did not match.');
        const reader = new Blob([payload]).stream().pipeThrough(new DecompressionStream('gzip')).getReader();
        const target = new Uint8Array(asset.decodedBytes); let at = 0;
        try {
          for (;;) {
            const { value, done } = await reader.read(); if (done) break;
            if (requestSignal.aborted || this.disposed) throw new DOMException('Loading cancelled', 'AbortError');
            if (at + value.length > target.length) throw new Error('Distant town exceeded its decoded size.');
            target.set(value, at); at += value.length;
          }
          if (at !== target.length) throw new Error('Distant town was incomplete.');
          decoded = target.buffer;
        } finally { void reader.cancel().catch(() => {}); reader.releaseLock(); }
      }
      if (decoded.byteLength !== asset.decodedBytes || await digest(decoded) !== asset.decodedSha256) throw new Error('Distant town geometry checksum did not match.');
      if (requestSignal.aborted || this.disposed) throw new DOMException('Loading cancelled', 'AbortError');
      this.adopt(decoded);
    }, { label: 'Distant town', timeoutMs: 30000 });
  }

  private array(buffer: ArrayBuffer, attribute: Attribute, type: Attribute['componentType'], count: number, size: number): Uint8Array | Int8Array | Uint16Array | Uint32Array {
    const Constructor = type === 'uint16' ? Uint16Array : type === 'uint32' ? Uint32Array : type === 'int8' ? Int8Array : Uint8Array;
    if (attribute.componentType !== type || attribute.count !== count || attribute.itemSize !== size
      || !integer(count, 0, OVERVIEW_LIMITS.vertices * 3) || !integer(attribute.byteOffset)
      || attribute.byteOffset % Constructor.BYTES_PER_ELEMENT !== 0
      || attribute.byteOffset + count * size * Constructor.BYTES_PER_ELEMENT > buffer.byteLength) throw new Error('Invalid distant town geometry range.');
    return new Constructor(buffer, attribute.byteOffset, count * size);
  }

  adopt(buffer: ArrayBuffer): void {
    if (this.disposed) return;
    if (this.ready) throw new Error('Distant town is already loaded.');
    if (buffer.byteLength !== this.catalog.asset.decodedBytes) throw new Error('Distant town geometry size did not match.');
    const pending: THREE.Mesh[] = [];
    try {
      for (const layer of this.catalog.layers) {
        const count = layer.vertexCount;
        if (!integer(count, 0, OVERVIEW_LIMITS.vertices) || !integer(layer.triangles, 0, OVERVIEW_LIMITS.triangles)) throw new Error('Invalid distant town geometry count.');
        const a = layer.attributes;
        const packed = this.array(buffer, a.position, 'uint16', count, 3), normals = this.array(buffer, a.normal, 'int8', count, 3);
        const colors = this.array(buffer, a.color, 'uint8', count, 3), owners = this.array(buffer, a.tileIndex, 'uint16', count, 1);
        const indices = this.array(buffer, layer.index, 'uint32', layer.triangles * 3, 1);
        const positions = new Float32Array(count * 3), { origin, scale } = this.catalog.quantization;
        for (let i = 0; i < positions.length; i++) positions[i] = origin[i % 3] + packed[i] * scale[i % 3];
        for (const owner of owners) if (owner >= this.catalog.tiles.length) throw new Error('Distant geometry has an unknown source tile.');
        for (let i = 0; i < indices.length; i += 3) {
          const a = indices[i], b = indices[i + 1], c = indices[i + 2];
          if (a >= count || b >= count || c >= count || owners[a] !== owners[b] || owners[a] !== owners[c]) throw new Error('Distant triangle crosses source ownership.');
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('normal', new THREE.BufferAttribute(normals.slice(), 3, true));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors.slice(), 3, true));
        geometry.setAttribute('townOverviewTile', new THREE.BufferAttribute(owners.slice(), 1));
        geometry.setIndex(new THREE.BufferAttribute(indices.slice(), 1));
        geometry.computeBoundingBox(); geometry.computeBoundingSphere();
        const material = this.material(layer.kind);
        const mesh = new THREE.Mesh(geometry, material);
        mesh.name = `Distant town ${layer.kind}`; mesh.castShadow = mesh.receiveShadow = false;
        mesh.userData.townOverview = true;
        mesh.matrixAutoUpdate = false; mesh.updateMatrix();
        pending.push(mesh);
      }
      this.geometryBytes = pending.reduce((sum, mesh) => sum + Object.values(mesh.geometry.attributes).reduce((n, a) => n + a.array.byteLength, 0) + (mesh.geometry.index?.array.byteLength ?? 0), 0);
      this.root.add(...pending); this.ready = true;
    } catch (error) {
      for (const mesh of pending) { mesh.geometry.dispose(); (mesh.material as THREE.Material).dispose(); }
      throw error;
    }
  }

  private material(kind: OverviewKind): THREE.MeshStandardMaterial {
    const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: kind === 'water' ? .42 : .95, metalness: 0, envMapIntensity: .12 });
    material.name = `Whole-town ${kind}`;
    if (kind === 'roads') { material.polygonOffset = true; material.polygonOffsetFactor = -2; material.polygonOffsetUnits = -2; }
    const channel = kind === 'trees' ? 'g' : 'r';
    material.onBeforeCompile = shader => {
      shader.uniforms.townOverviewCoverage = { value: this.mask };
      shader.vertexShader = 'attribute float townOverviewTile; varying float vTownOverviewTile;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvTownOverviewTile = townOverviewTile;');
      shader.fragmentShader = 'uniform sampler2D townOverviewCoverage; varying float vTownOverviewTile;\n' + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>\nif(texture2D(townOverviewCoverage,vec2((vTownOverviewTile+0.5)/${this.catalog.tiles.length.toFixed(1)},0.5)).${channel}>0.5) discard;`);
    };
    material.customProgramCacheKey = () => `whole-town-v1:${channel}:${this.catalog.tiles.length}`;
    return material;
  }

  setCoverage(geometryIds: Iterable<string>, treeIds: Iterable<string>): void {
    if (this.disposed) return;
    const next = new Uint8Array(this.coverage.length);
    for (const id of geometryIds) { const index = this.owner.get(id); if (index !== undefined) next[index * 4] = 255; }
    for (const id of treeIds) { const index = this.owner.get(id); if (index !== undefined) next[index * 4 + 1] = 255; }
    let changed = false; this.coveredGeometry = this.coveredTrees = 0;
    for (let i = 0; i < next.length; i++) {
      if (next[i] !== this.coverage[i]) changed = true;
      if (i % 4 === 0 && next[i]) this.coveredGeometry++;
      if (i % 4 === 1 && next[i]) this.coveredTrees++;
    }
    if (changed) { this.coverage.set(next); this.mask.needsUpdate = true; }
  }

  resources() {
    return { ready: this.ready, tiles: this.catalog.tiles.length, coveredGeometryTiles: this.coveredGeometry, coveredTreeTiles: this.coveredTrees,
      distantGeometryTiles: this.catalog.tiles.length - this.coveredGeometry, distantTreeTiles: this.catalog.tiles.length - this.coveredTrees,
      triangles: this.ready ? this.catalog.layers.reduce((sum, layer) => sum + layer.triangles, 0) : 0,
      draws: this.root.children.length, geometryBytes: this.geometryBytes, maskBytes: this.disposed ? 0 : this.coverage.byteLength, transferBytes: this.catalog.asset.bytes };
  }

  dispose(): void {
    if (this.disposed) return; this.disposed = true;
    for (const child of [...this.root.children] as THREE.Mesh[]) { child.geometry.dispose(); (child.material as THREE.Material).dispose(); }
    this.root.clear(); this.root.removeFromParent(); this.mask.dispose(); this.ready = false; this.geometryBytes = 0;
  }
}
