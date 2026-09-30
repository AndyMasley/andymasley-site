import * as THREE from 'three';
import { withLoadDeadline } from './critical-load';

export const REGIONAL_CANOPY_LIMITS = { instances: 25000, triangles: 500000, decodedBytes: 2 * 1048576, transferBytes: 1048576 } as const;
type Attribute = { byteOffset: number; count: number; itemSize: number; componentType: 'float32' };
export type RegionalCanopyCatalog = {
  version: number; format: string; sourceManifestSha256: string;
  asset: { url: string; rawUrl: string; compression: string; bytes: number; decodedBytes: number; sha256: string; decodedSha256: string };
  instances: { count: number; attributes: { anchor: Attribute; size: Attribute; seed: Attribute; edgeDistance: Attribute } };
  model: { earthRadiusM: number; verticalOffsetM: number; outerDistanceM: number };
};
const integer = (value: number, maximum: number): boolean => Number.isSafeInteger(value) && value >= 0 && value <= maximum;
const checksum = async (buffer: ArrayBuffer): Promise<string> => [...new Uint8Array(await crypto.subtle.digest('SHA-256', buffer))].map(value => value.toString(16).padStart(2, '0')).join('');
const cancelled = () => new DOMException('Loading cancelled', 'AbortError');

function validateCatalog(catalog: RegionalCanopyCatalog): void {
  const { asset, instances, model } = catalog;
  if (catalog.version !== 1 || catalog.format !== 'town-regional-canopy-f32-v1' || asset.compression !== 'gzip'
    || !integer(instances.count, REGIONAL_CANOPY_LIMITS.instances) || instances.count < 1
    || !integer(asset.bytes, REGIONAL_CANOPY_LIMITS.transferBytes) || asset.bytes === 0
    || !integer(asset.decodedBytes, REGIONAL_CANOPY_LIMITS.decodedBytes) || asset.decodedBytes !== instances.count * 32
    || ![catalog.sourceManifestSha256, asset.sha256, asset.decodedSha256].every(value => /^[a-f0-9]{64}$/.test(value))
    || model.earthRadiusM !== 6371008.8 || model.verticalOffsetM !== 100 || model.outerDistanceM !== 6000) throw new Error('Invalid regional canopy catalog.');
}

/** Independent telemetry/test oracle for the continuous shader transition.
 * The source-edge taper prevents an abrupt cutoff when flying toward the end
 * of sampled coverage. Mapped forest color remains on the terrain beneath it. */
export function regionalCanopyTransition(distanceM: number, edgeDistanceM: number): { opacity: number; relief: number } {
  if (![distanceM, edgeDistanceM].every(Number.isFinite) || distanceM < 0 || edgeDistanceM < 0) throw new RangeError('Invalid canopy distance.');
  const smooth = (a: number, b: number, value: number) => { const t = Math.max(0, Math.min(1, (value - a) / (b - a))); return t * t * (3 - 2 * t); };
  return { opacity: (1 - smooth(6000, 14000, distanceM)) * (1 - smooth(4000, 6000, edgeDistanceM)),
    relief: 1 - .8 * Math.max(smooth(2500, 8000, distanceM), smooth(2500, 6000, edgeDistanceM)) };
}

function crownGeometry(): THREE.InstancedBufferGeometry {
  const source = new THREE.IcosahedronGeometry(1, 0), geometry = new THREE.InstancedBufferGeometry();
  try {
    const vertices: number[] = [], indices: number[] = [], unique = new Map<string, number>();
    const p = source.getAttribute('position');
    for (let i = 0; i < p.count; i++) {
      const xyz = [p.getX(i), p.getY(i), p.getZ(i)], key = xyz.map(value => value.toFixed(6)).join(',');
      let index = unique.get(key);
      if (index === undefined) { index = vertices.length / 3; unique.set(key, index); vertices.push(...xyz); }
      indices.push(index);
    }
    // Normalize the prototype envelope; authored per-instance dimensions are
    // radii in X/Z and total tree height above the measured ground anchor.
    const horizontalRadius = Math.max(...Array.from({ length: vertices.length / 3 }, (_, i) => Math.hypot(vertices[i * 3], vertices[i * 3 + 2])));
    const extent = [horizontalRadius, Math.max(...vertices.filter((_, i) => i % 3 === 1).map(Math.abs)), horizontalRadius];
    const normals: number[] = [];
    for (let i = 0; i < vertices.length; i += 3) {
      // Preserve the conservative circular XZ footprint at every yaw. Scaling
      // each horizontal axis to its separate extrema would exceed that disk.
      const normal = new THREE.Vector3().fromArray(vertices, i).multiply(new THREE.Vector3(...extent)).normalize();
      for (let axis = 0; axis < 3; axis++) vertices[i + axis] /= extent[axis];
      normals.push(...normal.toArray());
    }
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setIndex(new THREE.Uint16BufferAttribute(indices, 1));
    return geometry;
  } catch (error) { geometry.dispose(); throw error; }
  finally { source.dispose(); }
}

function canopyMaterial(): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({ color: new THREE.Color().setRGB(.095, .16, .057, THREE.LinearSRGBColorSpace), roughness: .95, metalness: 0, envMapIntensity: .12, alphaHash: true });
  material.name = 'Mapped regional forest canopy';
  material.onBeforeCompile = shader => {
    shader.vertexShader = `attribute vec3 townCanopyAnchor;
attribute vec3 townCanopySize;
attribute float townCanopySeed;
attribute float townCanopyEdge;
varying float vTownCanopyOpacity;
varying float vTownCanopyShade;
float townCanopyRelief() {
  float distanceM = length(cameraPosition - townCanopyAnchor);
  return 1.0 - 0.8 * max(smoothstep(2500.0,8000.0,distanceM),smoothstep(2500.0,6000.0,townCanopyEdge));
}
vec3 townCanopyScale() { return townCanopySize * vec3(1.0,0.39 * townCanopyRelief(),1.0); }
vec3 townCanopyYaw(vec3 value) {
  float angle = townCanopySeed * 6.28318530718, c = cos(angle), s = sin(angle);
  return vec3(c * value.x - s * value.z,value.y,s * value.x + c * value.z);
}
vec3 townCanopyWorld(vec3 point) {
  return townCanopyAnchor + townCanopyYaw(point * townCanopyScale()) + vec3(0.0,townCanopySize.y * 0.61 * townCanopyRelief(),0.0);
}
` + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
objectNormal = normalize(townCanopyYaw(objectNormal / townCanopyScale()));
vec3 canopyNormalPoint = townCanopyWorld(position);
vec2 canopyNormalDelta = canopyNormalPoint.xz - cameraPosition.xz;
float canopyNormalDistance = length(canopyNormalDelta), canopyNormalAngle = canopyNormalDistance / 6371008.8;
objectNormal.y /= max(0.99,cos(canopyNormalAngle));
objectNormal.xz += objectNormal.y * (1.0 + (canopyNormalPoint.y + 100.0) / 6371008.8) * sin(canopyNormalAngle) * canopyNormalDelta / max(canopyNormalDistance,0.001);`);
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
transformed = townCanopyWorld(position);
// Stable unbent world coordinates anchor alpha hashing while the camera moves.
#ifdef USE_ALPHAHASH
vPosition = transformed;
#endif
float canopyDistance = length(cameraPosition - townCanopyAnchor);
vTownCanopyOpacity = (1.0-smoothstep(6000.0,14000.0,canopyDistance)) * (1.0-smoothstep(4000.0,6000.0,townCanopyEdge));
vTownCanopyShade = (0.94+0.10*townCanopySeed) * (0.86+0.16*(position.y+1.0)*0.5);
vec2 canopyDelta = transformed.xz - cameraPosition.xz;
float canopySine = sin(length(canopyDelta) / 12742017.6);
transformed.y -= 2.0 * (6371008.8 + transformed.y + 100.0) * canopySine * canopySine;`);
    shader.fragmentShader = 'varying float vTownCanopyOpacity; varying float vTownCanopyShade;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= vTownCanopyShade;\ndiffuseColor.a *= vTownCanopyOpacity;');
  };
  material.customProgramCacheKey = () => 'webster-regional-canopy-v1';
  return material;
}

/** Authored crown representations sampled from mapped forest coverage, not
 * surveyed individual tree locations/species. One draw, no frame traversal. */
export class RegionalCanopy {
  readonly root = new THREE.Group();
  private mesh?: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.MeshStandardMaterial>;
  private disposed = false;
  private loading?: AbortController;
  private geometryBytes = 0;

  constructor(readonly catalog: RegionalCanopyCatalog) { validateCatalog(catalog); this.root.name = 'Mapped regional forest'; }

  async initialize(baseURL: string, signal: AbortSignal): Promise<void> {
    if (this.disposed || signal.aborted) throw cancelled();
    if (this.mesh || this.loading) throw new Error('Regional canopy is already loaded or loading.');
    const controller = new AbortController(), abort = () => controller.abort();
    this.loading = controller; signal.addEventListener('abort', abort, { once: true });
    try {
      await withLoadDeadline(controller.signal, async requestSignal => {
        const { asset } = this.catalog;
        const response = await fetch(new URL(typeof DecompressionStream === 'function' ? asset.url : asset.rawUrl, baseURL), { signal: requestSignal });
        if (!response.ok) throw new Error(`Regional forest could not load (${response.status}).`);
        const payload = await response.arrayBuffer();
        if (requestSignal.aborted || this.disposed) throw cancelled();
        const magic = new Uint8Array(payload, 0, Math.min(2, payload.byteLength)); let decoded = payload;
        if (magic[0] === 31 && magic[1] === 139) {
          if (payload.byteLength !== asset.bytes || await checksum(payload) !== asset.sha256) throw new Error('Regional forest transport checksum did not match.');
          if (requestSignal.aborted || this.disposed) throw cancelled();
          const reader = new Blob([payload]).stream().pipeThrough(new DecompressionStream('gzip')).getReader();
          const target = new Uint8Array(asset.decodedBytes); let offset = 0;
          try {
            for (;;) {
              const { value, done } = await reader.read();
              if (requestSignal.aborted || this.disposed) throw cancelled();
              if (done) break;
              if (offset + value.length > target.length) throw new Error('Regional forest exceeded its decoded size.');
              target.set(value, offset); offset += value.length;
            }
            if (offset !== target.length) throw new Error('Regional forest was incomplete.');
            decoded = target.buffer;
          } finally { void reader.cancel().catch(() => {}); reader.releaseLock(); }
        }
        if (decoded.byteLength !== asset.decodedBytes || await checksum(decoded) !== asset.decodedSha256) throw new Error('Regional forest checksum did not match.');
        if (requestSignal.aborted || this.disposed) throw cancelled();
        this.adopt(decoded);
      }, { label: 'Regional forest', timeoutMs: 30000 });
    } finally { signal.removeEventListener('abort', abort); if (this.loading === controller) this.loading = undefined; }
  }

  adopt(buffer: ArrayBuffer): void {
    if (this.disposed) return;
    if (this.mesh) throw new Error('Regional canopy is already loaded.');
    validateCatalog(this.catalog);
    if (buffer.byteLength !== this.catalog.asset.decodedBytes) throw new Error('Regional canopy geometry size did not match.');
    const { count, attributes } = this.catalog.instances, ranges: number[][] = [];
    const read = (attribute: Attribute, size: number): Float32Array => {
      const end = attribute.byteOffset + count * size * 4;
      if (attribute.componentType !== 'float32' || attribute.count !== count || attribute.itemSize !== size
        || !integer(attribute.byteOffset, buffer.byteLength) || attribute.byteOffset % 4 || end > buffer.byteLength
        || ranges.some(([low, high]) => attribute.byteOffset < high && end > low)) throw new Error('Invalid regional canopy attribute range.');
      ranges.push([attribute.byteOffset, end]); return new Float32Array(buffer, attribute.byteOffset, count * size);
    };
    const anchor = read(attributes.anchor, 3), size = read(attributes.size, 3), seed = read(attributes.seed, 1), edge = read(attributes.edgeDistance, 1);
    for (let i = 0; i < count; i++) {
      const x = anchor[i * 3], y = anchor[i * 3 + 1], z = anchor[i * 3 + 2], sx = size[i * 3], sy = size[i * 3 + 1], sz = size[i * 3 + 2];
      if (![x, y, z, sx, sy, sz, seed[i], edge[i]].every(Number.isFinite) || Math.hypot(x, z) > 20000 || y < -150 || y > 1500
        || sx < 2 || sx > 150 || sz < 2 || sz > 150 || sy < 3 || sy > 45 || seed[i] < 0 || seed[i] > 1 || edge[i] < 0 || edge[i] > 6000) throw new Error('Invalid regional canopy instance.');
    }
    const geometry = crownGeometry(); let material: THREE.MeshStandardMaterial | undefined, mesh: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.MeshStandardMaterial> | undefined;
    try {
      material = canopyMaterial();
      for (const [name, data, components] of [
        ['townCanopyAnchor', anchor, 3], ['townCanopySize', size, 3], ['townCanopySeed', seed, 1], ['townCanopyEdge', edge, 1],
      ] as const) geometry.setAttribute(name, new THREE.InstancedBufferAttribute(data.slice(), components));
      geometry.instanceCount = count;
      mesh = new THREE.Mesh(geometry, material);
      mesh.name = 'Regional forest crown representations'; mesh.userData.townHorizon = true;
      mesh.castShadow = mesh.receiveShadow = false; mesh.frustumCulled = false;
      mesh.matrixAutoUpdate = false; mesh.updateMatrix();
      this.geometryBytes = Object.values(geometry.attributes).reduce((sum, attribute) => sum + attribute.array.byteLength, 0) + geometry.index!.array.byteLength;
      this.root.add(mesh); this.mesh = mesh;
    } catch (error) { mesh?.removeFromParent(); geometry.dispose(); material?.dispose(); this.geometryBytes = 0; throw error; }
  }

  resources() {
    const instances = this.mesh ? this.catalog.instances.count : 0;
    return { ready: !!this.mesh, instances, triangles: instances * 20, draws: this.mesh ? 1 : 0, geometryBytes: this.geometryBytes,
      transferBytes: this.catalog.asset.bytes, outerDistanceM: this.catalog.model.outerDistanceM };
  }

  dispose(): void {
    if (this.disposed) return; this.disposed = true; this.loading?.abort(); this.loading = undefined;
    this.mesh?.geometry.dispose(); this.mesh?.material.dispose(); this.mesh = undefined;
    this.root.clear(); this.root.removeFromParent(); this.geometryBytes = 0;
  }
}
