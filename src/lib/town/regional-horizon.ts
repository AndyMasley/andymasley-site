import * as THREE from 'three';
import { withLoadDeadline } from './critical-load';

export const HORIZON_LIMITS = { vertices: 200000, triangles: 450000, decodedBytes: 12 * 1048576, transferBytes: 8 * 1048576 } as const;
type Attribute = { byteOffset: number; count: number; itemSize: number; componentType: 'float32' | 'int8' | 'uint8' | 'uint32' };
export type HorizonCatalog = {
  version: number; format: string; sourceManifestSha256: string;
  asset: { url: string; rawUrl: string; compression: string; bytes: number; decodedBytes: number; sha256: string; decodedSha256: string };
  mesh: { vertexCount: number; triangles: number; attributes: { position: Attribute; normal: Attribute; color: Attribute }; index: Attribute; bounds: { min: number[]; max: number[] } };
  model: { earthRadiusM: number; verticalOffsetM: number; radiusM: number; refraction: boolean };
};
const integer = (value: number, maximum: number): boolean => Number.isSafeInteger(value) && value >= 0 && value <= maximum;
const checksum = async (buffer: ArrayBuffer): Promise<string> => [...new Uint8Array(await crypto.subtle.digest('SHA-256', buffer))].map(value => value.toString(16).padStart(2, '0')).join('');

/** A single measured, non-colliding regional heightfield. Its curvature follows
 * the observer's local tangent frame; it never changes the playable terrain. */
export class RegionalHorizon {
  readonly root = new THREE.Group();
  private mesh?: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  private disposed = false;
  private geometryBytes = 0;

  constructor(readonly catalog: HorizonCatalog) {
    const { asset, mesh, model } = catalog;
    if (catalog.version !== 1 || catalog.format !== 'town-horizon-f32-v1' || asset.compression !== 'gzip'
      || !integer(asset.bytes, HORIZON_LIMITS.transferBytes) || asset.bytes === 0
      || !integer(asset.decodedBytes, HORIZON_LIMITS.decodedBytes) || asset.decodedBytes === 0
      || !integer(mesh.vertexCount, HORIZON_LIMITS.vertices) || mesh.vertexCount < 3
      || !integer(mesh.triangles, HORIZON_LIMITS.triangles) || mesh.triangles === 0
      || model.earthRadiusM !== 6371008.8 || model.verticalOffsetM !== 100 || model.refraction !== false
      || !Number.isFinite(model.radiusM) || model.radiusM < 200000 || model.radiusM > 300000) throw new Error('Invalid regional horizon catalog.');
    this.root.name = 'Measured regional horizon';
  }

  async initialize(baseURL: string, signal: AbortSignal): Promise<void> {
    await withLoadDeadline(signal, async requestSignal => {
      const { asset } = this.catalog;
      const response = await fetch(new URL(typeof DecompressionStream === 'function' ? asset.url : asset.rawUrl, baseURL), { signal: requestSignal });
      if (!response.ok) throw new Error(`Regional landscape could not load (${response.status}).`);
      const payload = await response.arrayBuffer();
      if (requestSignal.aborted || this.disposed) throw new DOMException('Loading cancelled', 'AbortError');
      const magic = new Uint8Array(payload, 0, Math.min(2, payload.byteLength));
      let decoded = payload;
      if (magic[0] === 31 && magic[1] === 139) {
        if (payload.byteLength !== asset.bytes || await checksum(payload) !== asset.sha256) throw new Error('Regional landscape transport checksum did not match.');
        const reader = new Blob([payload]).stream().pipeThrough(new DecompressionStream('gzip')).getReader();
        const target = new Uint8Array(asset.decodedBytes); let offset = 0;
        try {
          for (;;) {
            const { value, done } = await reader.read(); if (done) break;
            if (requestSignal.aborted || this.disposed) throw new DOMException('Loading cancelled', 'AbortError');
            if (offset + value.length > target.length) throw new Error('Regional landscape exceeded its decoded size.');
            target.set(value, offset); offset += value.length;
          }
          if (offset !== target.length) throw new Error('Regional landscape was incomplete.');
          decoded = target.buffer;
        } finally { void reader.cancel().catch(() => {}); reader.releaseLock(); }
      }
      if (decoded.byteLength !== asset.decodedBytes || await checksum(decoded) !== asset.decodedSha256) throw new Error('Regional landscape checksum did not match.');
      if (requestSignal.aborted || this.disposed) throw new DOMException('Loading cancelled', 'AbortError');
      this.adopt(decoded);
    }, { label: 'Regional landscape', timeoutMs: 30000 });
  }

  private array(buffer: ArrayBuffer, attribute: Attribute, type: Attribute['componentType'], count: number, size: number): Float32Array | Int8Array | Uint8Array | Uint32Array {
    const Constructor = type === 'float32' ? Float32Array : type === 'uint32' ? Uint32Array : type === 'int8' ? Int8Array : Uint8Array;
    if (attribute.componentType !== type || attribute.count !== count || attribute.itemSize !== size
      || !integer(attribute.byteOffset, buffer.byteLength) || attribute.byteOffset % 4 !== 0
      || attribute.byteOffset + count * size * Constructor.BYTES_PER_ELEMENT > buffer.byteLength) throw new Error('Invalid regional geometry range.');
    return new Constructor(buffer, attribute.byteOffset, count * size);
  }

  adopt(buffer: ArrayBuffer): void {
    if (this.disposed) return;
    if (this.mesh) throw new Error('Regional landscape is already loaded.');
    if (buffer.byteLength !== this.catalog.asset.decodedBytes) throw new Error('Regional geometry size did not match.');
    const { mesh, model } = this.catalog, a = mesh.attributes;
    const positions = this.array(buffer, a.position, 'float32', mesh.vertexCount, 3);
    const normals = this.array(buffer, a.normal, 'int8', mesh.vertexCount, 3);
    const colors = this.array(buffer, a.color, 'uint8', mesh.vertexCount, 3);
    const indices = this.array(buffer, mesh.index, 'uint32', mesh.triangles * 3, 1);
    const ranges = [positions, normals, colors, indices].map(array => [array.byteOffset, array.byteOffset + array.byteLength]).sort((left, right) => left[0] - right[0]);
    if (ranges.some((range, i) => i > 0 && range[0] < ranges[i - 1][1])) throw new Error('Regional geometry attributes overlap.');
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i], y = positions[i + 1], z = positions[i + 2];
      if (![x, y, z].every(Number.isFinite) || Math.hypot(x, z) > model.radiusM + 5000 || y < -200 || y > 3000) throw new Error('Regional geometry has an invalid elevation or position.');
    }
    for (const index of indices) if (index >= mesh.vertexCount) throw new Error('Regional geometry index is out of range.');
    const geometry = new THREE.BufferGeometry();
    const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, envMapIntensity: 0 });
    try {
      geometry.setAttribute('position', new THREE.BufferAttribute(positions.slice(), 3));
      geometry.setAttribute('normal', new THREE.BufferAttribute(normals.slice(), 3, true));
      geometry.setAttribute('color', new THREE.BufferAttribute(colors.slice(), 3, true));
      geometry.setIndex(new THREE.BufferAttribute(indices.slice(), 1));
      geometry.computeBoundingBox(); geometry.computeBoundingSphere();
      material.name = 'Source-measured regional landscape';
      material.onBeforeCompile = shader => {
        shader.vertexShader = shader.vertexShader.replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
vec2 horizonNormalDelta = position.xz - cameraPosition.xz;
float horizonNormalDistance = length(horizonNormalDelta);
float horizonNormalAngle = horizonNormalDistance / ${model.earthRadiusM.toFixed(1)};
objectNormal.y /= max(0.99, cos(horizonNormalAngle));
objectNormal.xz += objectNormal.y * (1.0 + (position.y + ${model.verticalOffsetM.toFixed(1)}) / ${model.earthRadiusM.toFixed(1)}) * sin(horizonNormalAngle) * horizonNormalDelta / max(horizonNormalDistance, 0.001);`);
        shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
vec2 horizonDelta = transformed.xz - cameraPosition.xz;
float horizonHalfAngle = length(horizonDelta) / ${(2 * model.earthRadiusM).toFixed(1)};
float horizonSine = sin(horizonHalfAngle);
transformed.y -= 2.0 * (${model.earthRadiusM.toFixed(1)} + transformed.y + ${model.verticalOffsetM.toFixed(1)}) * horizonSine * horizonSine;`);
      };
      material.customProgramCacheKey = () => 'webster-measured-horizon-v1';
      this.mesh = new THREE.Mesh(geometry, material);
      this.mesh.name = 'Regional hills beyond Webster';
      this.mesh.userData.townHorizon = true;
      this.mesh.castShadow = this.mesh.receiveShadow = false;
      this.mesh.frustumCulled = false;
      this.mesh.matrixAutoUpdate = false; this.mesh.updateMatrix();
      this.geometryBytes = Object.values(geometry.attributes).reduce((sum, attr) => sum + attr.array.byteLength, 0) + geometry.index!.array.byteLength;
      this.root.add(this.mesh);
    } catch (error) { geometry.dispose(); material.dispose(); throw error; }
  }

  resources() {
    return { ready: !!this.mesh, draws: this.mesh ? 1 : 0, triangles: this.mesh ? this.catalog.mesh.triangles : 0,
      geometryBytes: this.geometryBytes, transferBytes: this.catalog.asset.bytes, radiusM: this.catalog.model.radiusM,
      earthRadiusM: this.catalog.model.earthRadiusM, refraction: this.catalog.model.refraction };
  }

  dispose(): void {
    if (this.disposed) return; this.disposed = true;
    this.mesh?.geometry.dispose(); this.mesh?.material.dispose(); this.mesh = undefined;
    this.root.clear(); this.root.removeFromParent(); this.geometryBytes = 0;
  }
}
