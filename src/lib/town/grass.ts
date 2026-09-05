import * as THREE from 'three';
import type { V3 } from './contracts';

export const GRASS_LIMITS = { tufts: 8000, fadeStart: 8, radius: 14, selectionRadius: 22, spacing: 0.45, rebuildDistance: 6, tiles: 4 } as const;
export interface GrassMask {
  data: Uint8Array | Uint8ClampedArray;
  width: number;
  height: number;
  bounds: readonly number[];
  core: readonly number[];
}
export interface GrassGround { y: number; normal: [number, number, number] }
type Triangle = { x: number; y: number; z: number; ux: number; uy: number; uz: number; vx: number; vy: number; vz: number; inverse: number; normal: [number, number, number] };

const cellKey = (x: number, z: number) => (x + 65536) * 131072 + z + 65536;
function random(x: number, z: number, salt = 0): number {
  let value = Math.imul(x ^ salt, 374761393) ^ Math.imul(z, 668265263);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
}

/** World-grid seeds do not depend on tile ID, loading order or display LOD. */
export function grassSite(x: number, z: number): { x: number; z: number; seed: number } {
  return {
    x: (x + 0.18 + random(x, z, 719) * 0.64) * GRASS_LIMITS.spacing,
    z: (z + 0.18 + random(x, z, 977) * 0.64) * GRASS_LIMITS.spacing,
    seed: random(x, z, 1877),
  };
}

export function grassMaskFromTexture(texture: THREE.Texture, bounds: readonly number[]): GrassMask | null {
  const image = texture.image as { data?: Uint8Array | Uint8ClampedArray; width?: number; height?: number } | undefined;
  const { data, width, height } = image ?? {};
  if (!(data instanceof Uint8Array || data instanceof Uint8ClampedArray) || !width || !height ||
      data.length !== width * height * 4 || texture.flipY || bounds.length !== 4 || !bounds.every(Number.isFinite)) return null;
  if (bounds[2] <= bounds[0] || bounds[3] <= bounds[1]) return null;
  // The fixed cover release has eight gutter pixels surrounding its 256px core.
  const gx = width === 272 ? (bounds[2] - bounds[0]) * 8 / width : 0;
  const gz = height === 272 ? (bounds[3] - bounds[1]) * 8 / height : 0;
  return { data, width, height, bounds, core: [bounds[0] + gx, bounds[1] + gz, bounds[2] - gx, bounds[3] - gz] };
}

/** Soil is alpha, not opacity. A full neighboring texel must also be lawn. */
export function grassAllowed(mask: GrassMask, x: number, z: number): boolean {
  const [minX, minZ, maxX, maxZ] = mask.bounds;
  const px = Math.floor((x - minX) / (maxX - minX) * mask.width);
  const pz = Math.floor((z - minZ) / (maxZ - minZ) * mask.height);
  if (px < 1 || pz < 1 || px >= mask.width - 1 || pz >= mask.height - 1) return false;
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    const i = ((pz + dz) * mask.width + px + dx) * 4;
    if (mask.data[i] < 224 || mask.data[i + 1] > 12 || mask.data[i + 2] > 8 || mask.data[i + 3] > 12) return false;
  }
  return true;
}

/** An index is built only when its tile approaches the camera. Source meshes are never edited. */
export class GrassTerrain {
  private triangles: Triangle[] = [];
  private bins = new Map<number, number[]>();
  private binReferences = 0;

  constructor(meshes: readonly THREE.Mesh[]) {
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    for (const mesh of meshes) {
      const position = mesh.geometry.getAttribute('position');
      if (!position) continue;
      const index = mesh.geometry.getIndex();
      const count = index?.count ?? position.count;
      const vertex = (target: THREE.Vector3, i: number) => target.fromBufferAttribute(position, index ? index.getX(i) : i).applyMatrix4(mesh.matrixWorld);
      for (let i = 0; i + 2 < count; i += 3) {
        vertex(a, i); vertex(b, i + 1); vertex(c, i + 2);
        const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z;
        const vx = c.x - a.x, vy = c.y - a.y, vz = c.z - a.z;
        const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        const length = Math.hypot(nx, ny, nz), determinant = ux * vz - uz * vx;
        if (!Number.isFinite(length) || length < 1e-8 || ny / length < 0.78 || Math.abs(determinant) < 1e-8) continue;
        const x0 = Math.floor(Math.min(a.x, b.x, c.x) / 8), x1 = Math.floor(Math.max(a.x, b.x, c.x) / 8);
        const z0 = Math.floor(Math.min(a.z, b.z, c.z) / 8), z1 = Math.floor(Math.max(a.z, b.z, c.z) / 8);
        if ((x1 - x0 + 1) * (z1 - z0 + 1) > 4096) continue;
        const t = this.triangles.length;
        this.triangles.push({ x: a.x, y: a.y, z: a.z, ux, uy, uz, vx, vy, vz, inverse: 1 / determinant, normal: [nx / length, ny / length, nz / length] });
        for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
          const key = cellKey(x, z), bin = this.bins.get(key);
          if (bin) bin.push(t); else this.bins.set(key, [t]);
          this.binReferences++;
        }
      }
    }
  }

  sample(x: number, z: number): GrassGround | null {
    let result: GrassGround | null = null;
    for (const id of this.bins.get(cellKey(Math.floor(x / 8), Math.floor(z / 8))) ?? []) {
      const t = this.triangles[id], qx = x - t.x, qz = z - t.z;
      const b = (qx * t.vz - qz * t.vx) * t.inverse;
      const c = (t.ux * qz - t.uz * qx) * t.inverse;
      if (b < -1e-6 || c < -1e-6 || b + c > 1.000001) continue;
      const y = t.y + b * t.uy + c * t.vy;
      if (!result || y > result.y) result = { y, normal: t.normal };
    }
    return result;
  }

  resources(): { triangles: number; bins: number; bytes: number } {
    return { triangles: this.triangles.length, bins: this.bins.size, bytes: this.triangles.length * 13 * 8 + this.binReferences * 4 };
  }
}

type GrassTile = { group: THREE.Object3D; id: string; mask: GrassMask; terrain: THREE.Mesh[]; index?: GrassTerrain; mesh?: THREE.InstancedMesh; capacity?: number };
type Candidate = { tile: GrassTile; x: number; y: number; z: number; seed: number; distance: number; normal: [number, number, number] };

function tuftGeometry(): THREE.BufferGeometry {
  const positions: number[] = [], colors: number[] = [], roots: number[] = [], indices: number[] = [];
  const root = new THREE.Color('#3f542d'), middle = new THREE.Color('#51663b'), tip = new THREE.Color('#657b49');
  for (let blade = 0; blade < 6; blade++) {
    const angle = blade * 2.39996 + random(blade, 1) * 1.1;
    const rootAngle = blade * 2.39996 + random(blade, 19) * 0.8;
    const rootRadius = 0.045 + Math.sqrt(random(blade, 23)) * 0.145;
    const rootX = Math.cos(rootAngle) * rootRadius, rootZ = Math.sin(rootAngle) * rootRadius;
    const height = 0.045 + random(blade, 3) * 0.035, width = 0.003 + random(blade, 7) * 0.0015;
    const lean = 0.012 + random(blade, 13) * 0.040;
    const twist = (random(blade, 31) - 0.5) * 0.014;
    const vertices = [[-width, 0, 0], [width, 0, 0], [-width * 0.65 + lean * 0.3, height * 0.60, twist], [width * 0.65 + lean * 0.3, height * 0.60, twist], [lean, height, twist * 1.8]];
    const start = positions.length / 3;
    vertices.forEach(([x, y, z], i) => {
      positions.push(rootX + x * Math.cos(angle) - z * Math.sin(angle), y, rootZ + x * Math.sin(angle) + z * Math.cos(angle));
      roots.push(rootX, rootZ);
      const color = i < 2 ? root : i < 4 ? middle : tip;
      colors.push(color.r, color.g, color.b);
    });
    indices.push(start, start + 1, start + 3, start, start + 3, start + 2, start + 2, start + 3, start + 4);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('townGrassRoot', new THREE.Float32BufferAttribute(roots, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

export class TownGrass {
  private tiles = new Map<THREE.Object3D, GrassTile>();
  private geometry?: THREE.BufferGeometry;
  private material?: THREE.MeshStandardMaterial;
  private uniforms = { townGrassCamera: { value: new THREE.Vector3() }, townGrassTime: { value: 0 } };
  private last = new THREE.Vector3(Infinity, Infinity, Infinity);
  private lastLow = true;
  private dirty = true;
  private disposed = false;
  private rebuilds = 0;

  register(group: THREE.Object3D, id: string, mask: GrassMask, terrain: THREE.Mesh[]): void {
    this.release(group);
    this.tiles.set(group, { group, id, mask, terrain });
    this.dirty = true;
  }

  private shared(): void {
    if (this.geometry) return;
    this.geometry = tuftGeometry();
    this.material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide });
    this.material.name = 'Town | short sage grass blades';
    this.material.forceSinglePass = true;
    this.material.customProgramCacheKey = () => 'town-grass-short-patches-v2';
    this.material.onBeforeCompile = shader => {
      Object.assign(shader.uniforms, this.uniforms);
      shader.vertexShader = `attribute vec2 townGrassRoot;\nuniform vec3 townGrassCamera;\nuniform float townGrassTime;\n${shader.vertexShader}`
        .replace('#include <begin_vertex>', `
#include <begin_vertex>
vec4 townTuftWorld = modelMatrix * instanceMatrix * vec4(0.0,0.0,0.0,1.0);
float townTuftDistance = length(townTuftWorld.xz - townGrassCamera.xz);
float townTuftGrowth = 1.0 - smoothstep(${GRASS_LIMITS.fadeStart.toFixed(1)},${GRASS_LIMITS.radius.toFixed(1)},townTuftDistance);
float townTuftWind = sin(townGrassTime*1.15 + townTuftWorld.x*0.38 + townTuftWorld.z*0.21);
transformed.x += townTuftWind * position.y * position.y * 0.29;
vec3 townBladeRoot = vec3(townGrassRoot.x,0.0,townGrassRoot.y);
transformed = townBladeRoot + (transformed-townBladeRoot) * townTuftGrowth;
`);
    };
  }

  update(position: V3, low: boolean, time: number): void {
    if (this.disposed || !position.every(Number.isFinite)) return;
    this.uniforms.townGrassCamera.value.fromArray(position);
    this.uniforms.townGrassTime.value = Number.isFinite(time) ? time : 0;
    const moved = Math.hypot(position[0] - this.last.x, position[2] - this.last.z);
    if (!this.dirty && low === this.lastLow && moved < GRASS_LIMITS.rebuildDistance) return;
    this.dirty = false; this.lastLow = low; this.last.fromArray(position); this.rebuilds++;
    if (low) {
      for (const tile of this.tiles.values()) { this.removeMesh(tile); tile.index = undefined; }
      return;
    }
    const distance = (tile: GrassTile) => {
      const b = tile.mask.core;
      return Math.hypot(Math.max(b[0] - position[0], 0, position[0] - b[2]), Math.max(b[1] - position[2], 0, position[2] - b[3]));
    };
    const seen = new Set<string>();
    const active = [...this.tiles.values()].filter(tile => tile.group.visible && distance(tile) < GRASS_LIMITS.selectionRadius)
      .sort((a, b) => Number(Boolean(b.group.parent)) - Number(Boolean(a.group.parent)) || distance(a) - distance(b))
      .filter(tile => { if (seen.has(tile.id)) return false; seen.add(tile.id); return true; }).slice(0, GRASS_LIMITS.tiles);
    for (const tile of this.tiles.values()) if (!active.includes(tile)) { this.removeMesh(tile); tile.index = undefined; }
    const candidates: Candidate[] = [];
    const radius = GRASS_LIMITS.selectionRadius, spacing = GRASS_LIMITS.spacing;
    for (const tile of active) {
      tile.index ??= new GrassTerrain(tile.terrain);
      const b = tile.mask.core;
      const x0 = Math.floor(Math.max(b[0], position[0] - radius) / spacing), x1 = Math.ceil(Math.min(b[2], position[0] + radius) / spacing);
      const z0 = Math.floor(Math.max(b[1], position[2] - radius) / spacing), z1 = Math.ceil(Math.min(b[3], position[2] + radius) / spacing);
      for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
        const site = grassSite(x, z), d = Math.hypot(site.x - position[0], site.z - position[2]);
        if (d > radius || site.x < b[0] || site.x >= b[2] || site.z < b[1] || site.z >= b[3] || !grassAllowed(tile.mask, site.x, site.z)) continue;
        const ground = tile.index.sample(site.x, site.z);
        if (!ground) continue;
        candidates.push({ tile, x: site.x, z: site.z, y: ground.y, normal: ground.normal, seed: site.seed, distance: d });
      }
    }
    candidates.sort((a, b) => a.distance - b.distance || a.x - b.x || a.z - b.z);
    const selected = candidates.slice(0, GRASS_LIMITS.tufts);
    const matrix = new THREE.Matrix4(), worldMatrix = new THREE.Matrix4(), inverse = new THREE.Matrix4();
    const p = new THREE.Vector3(), scale = new THREE.Vector3(), normal = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    const q = new THREE.Quaternion(), yaw = new THREE.Quaternion(), color = new THREE.Color();
    for (const tile of active) {
      const rows = selected.filter(row => row.tile === tile);
      if (!rows.length) { this.removeMesh(tile); continue; }
      this.shared();
      if (!tile.mesh || tile.capacity! < rows.length) {
        this.removeMesh(tile);
        tile.capacity = Math.min(GRASS_LIMITS.tufts, Math.ceil(rows.length / 512) * 512);
        tile.mesh = new THREE.InstancedMesh(this.geometry!, this.material!, tile.capacity);
        tile.mesh.name = `Town grass | ${tile.id}`;
        tile.mesh.userData.townGrass = true;
        tile.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        tile.mesh.receiveShadow = true;
        tile.mesh.castShadow = false;
        tile.group.add(tile.mesh);
      }
      inverse.copy(tile.group.matrixWorld).invert();
      rows.forEach((row, i) => {
        const size = 0.78 + row.seed * 0.48;
        p.set(row.x, row.y + 0.006, row.z); scale.setScalar(size);
        q.setFromUnitVectors(up, normal.fromArray(row.normal)); yaw.setFromAxisAngle(up, row.seed * Math.PI * 2); q.multiply(yaw);
        worldMatrix.compose(p, q, scale); matrix.multiplyMatrices(inverse, worldMatrix);
        tile.mesh!.setMatrixAt(i, matrix);
        const tint = 0.92 + row.seed * 0.13;
        tile.mesh!.setColorAt(i, color.setRGB(tint, tint, tint * 0.96));
      });
      tile.mesh.count = rows.length;
      tile.mesh.instanceMatrix.needsUpdate = true;
      if (tile.mesh.instanceColor) tile.mesh.instanceColor.needsUpdate = true;
      tile.mesh.computeBoundingSphere();
      if (tile.mesh.boundingSphere) tile.mesh.boundingSphere.radius += 0.08;
    }
  }

  private removeMesh(tile: GrassTile): void {
    if (!tile.mesh) return;
    tile.mesh.removeFromParent();
    tile.mesh.dispose();
    tile.mesh = undefined; tile.capacity = undefined;
  }

  release(group: THREE.Object3D): void {
    const tile = this.tiles.get(group);
    if (!tile) return;
    this.removeMesh(tile);
    this.tiles.delete(group);
    this.dirty = true;
  }

  resources(): { tufts: number; triangles: number; bytes: number; indexedTiles: number; bins: number; rebuilds: number; materials: number } {
    let tufts = 0, bytes = 0, indexedTiles = 0, bins = 0;
    if (this.geometry) {
      for (const attribute of Object.values(this.geometry.attributes)) bytes += attribute.array.byteLength;
      bytes += this.geometry.index?.array.byteLength ?? 0;
    }
    for (const tile of this.tiles.values()) {
      if (tile.index) { const index = tile.index.resources(); indexedTiles++; bytes += index.bytes; bins += index.bins; }
      if (tile.mesh) { tufts += tile.mesh.count; bytes += tile.mesh.instanceMatrix.array.byteLength + (tile.mesh.instanceColor?.array.byteLength ?? 0); }
    }
    return { tufts, triangles: tufts * 18, bytes, indexedTiles, bins, rebuilds: this.rebuilds, materials: this.material ? 1 : 0 };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const group of this.tiles.keys()) this.release(group);
    this.geometry?.dispose(); this.material?.dispose();
    this.geometry = undefined; this.material = undefined;
  }
}
