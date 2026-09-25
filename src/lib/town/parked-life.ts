import * as THREE from 'three';
import template from '../../../data/derived/town/parked-vehicle-template.json';
import clearance from '../../../data/derived/town/parked-clearance.json';
import type { ParkingBay } from './parking-finish';
import type { V3 } from './contracts';

type XY = readonly number[];
export interface ParkedPlacement { center: number[]; corners: number[][]; forward: number[]; grade: number[]; color: string; scale: number }
const palette = ['#ecebe3', '#aeb7b8', '#56666b', '#8e2e2b', '#263e57', '#d0c3a4', '#333739', '#647261'];
function hash(value: string): number { let n = 2166136261; for (let i = 0; i < value.length; i++) n = Math.imul(n ^ value.charCodeAt(i), 16777619) >>> 0; return n; }

/** Occupancy is deliberately sparse and stable. It is an authored summer
 * scene, never a claim about a real person's car or a measured parking count. */
export function parkedPlacements(bays: readonly ParkingBay[], height: (p: XY) => number | undefined, excluded: readonly THREE.Box3[] = []): ParkedPlacement[] {
  const selected: ParkedPlacement[] = [];
  const ordered = bays.map(bay => ({ bay, value: hash(bay.lotId + ':' + bay.corners.map(p => p.map(v => v.toFixed(2)).join(',')).join('|')) })).sort((a, b) => a.value - b.value);
  for (const { bay, value } of ordered) {
    if (selected.length >= 14) break;
    if (value % 100 >= 24) continue;
    const center = bay.corners.reduce((n, p) => [n[0] + p[0] / 4, n[1] + p[1] / 4], [0, 0]);
    if (clearance.bays.some(b => b.lotId === bay.lotId && Math.hypot(b.center[0] - center[0], b.center[1] - center[1]) < .02)) continue;
    if (excluded.some(b => center[0] > b.min.x - 3 && center[0] < b.max.x + 3 && center[1] > b.min.z - 3 && center[1] < b.max.z + 3)) continue;
    const dx = bay.corners[3][0] - bay.corners[0][0], dy = bay.corners[3][1] - bay.corners[0][1], length = Math.hypot(dx, dy);
    const forward = [dx / length, dy / length], right = [forward[1], -forward[0]], scale = .94 + (value % 7) * .009;
    const corners = [[-2.276, -1.14], [2.276, -1.14], [2.276, 1.14], [-2.276, 1.14]].map(([a, b]) => [center[0] + (forward[0] * a + right[0] * b) * scale, center[1] + (forward[1] * a + right[1] * b) * scale]);
    const contacts = [[-1.325, -.814], [1.325, -.814], [1.325, .814], [-1.325, .814]].map(([a, b]) => [center[0] + (forward[0] * a + right[0] * b) * scale, center[1] + (forward[1] * a + right[1] * b) * scale]);
    const levels = contacts.map(height);
    if (levels.some(v => v === undefined || !Number.isFinite(v))) continue;
    const h = levels as number[], mean = h.reduce((a, b) => a + b, 0) / 4;
    const along = ((h[1] + h[2]) - (h[0] + h[3])) / (4 * 1.325 * scale), across = ((h[2] + h[3]) - (h[0] + h[1])) / (4 * .814 * scale);
    if (Math.hypot(along, across) > .12 || Math.abs((h[0] + h[2]) - (h[1] + h[3])) > .08) continue;
    if (corners.some(p => { const z = height(p); return z === undefined || z > mean + .25; })) continue;
    selected.push({ center: [...center, mean + .016], corners, forward, grade: [along, across], color: palette[value % palette.length], scale });
  }
  return selected;
}

function decode(value: string): Uint8Array {
  const raw = atob(value), array = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) array[i] = raw.charCodeAt(i);
  return array;
}

type TemplatePart = (typeof template.parts)[number];

/** One part of the packed parked-car template as renderable geometry. */
function partGeometry(part: TemplatePart): { geometry: THREE.BufferGeometry; painted: boolean; triangles: number } {
  const packed = decode(part.positions), normals = decode(part.normals), indices = decode(part.indices);
  const source = new Int16Array(packed.buffer), nn = new Int8Array(normals.buffer);
  const positions = Float32Array.from(source, v => v / template.positionScale), normal = Float32Array.from(nn, v => v / template.normalScale);
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3)); geometry.setAttribute('normal', new THREE.BufferAttribute(normal, 3)); geometry.setIndex(new THREE.BufferAttribute(new Uint16Array(indices.buffer), 1));
  geometry.normalizeNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  return { geometry, painted: /deep teal/.test(part.name), triangles: indices.byteLength / 2 / 3 };
}

function partMaterial(part: TemplatePart): THREE.MeshStandardMaterial {
  const painted = /deep teal/.test(part.name), glass = /glass/.test(part.name);
  const material = new THREE.MeshStandardMaterial({ color: painted ? 0xffffff : part.color, roughness: glass ? .2 : part.roughness, metalness: part.metalness, envMapIntensity: glass ? .7 : .45 });
  material.name = painted ? 'Parked | graphite' : part.name;
  return material;
}

/**
 * The parked-car template as one set of instanced meshes (seven draws) with
 * room for `capacity` cars whose world matrices change every frame (traffic).
 */
export class TemplateFleet {
  readonly group = new THREE.Group();
  readonly meshes: THREE.InstancedMesh[] = [];
  readonly materials: THREE.MeshStandardMaterial[] = [];
  constructor(readonly capacity: number, label: string) {
    this.group.name = label;
    for (const part of template.parts) {
      const { geometry, painted } = partGeometry(part), material = partMaterial(part);
      const mesh = new THREE.InstancedMesh(geometry, material, capacity);
      mesh.name = label; mesh.count = 0; mesh.frustumCulled = false;
      mesh.castShadow = true; mesh.receiveShadow = true; mesh.userData.townCrafted = true; mesh.userData.category = 'cars';
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      if (painted) { mesh.userData.painted = true; for (let i = 0; i < capacity; i++) mesh.setColorAt(i, new THREE.Color(1, 1, 1)); }
      this.meshes.push(mesh); this.materials.push(material); this.group.add(mesh);
    }
  }
  /** Places car `i`; the painted body takes `color`. */
  set(i: number, matrix: THREE.Matrix4, color: THREE.Color): void {
    for (const mesh of this.meshes) { mesh.setMatrixAt(i, matrix); if (mesh.userData.painted) mesh.setColorAt(i, color); }
  }
  /** Shows the first `count` cars. */
  commit(count: number): void {
    for (const mesh of this.meshes) {
      mesh.count = count; mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }
  dispose(): void {
    for (const mesh of this.meshes) { mesh.geometry.dispose(); mesh.dispose(); }
    for (const material of this.materials) material.dispose();
    this.group.removeFromParent();
  }
}

/** Seven shared material draws per tile, independent of vehicle count. */
export function addParkedLife(group: THREE.Group, origin: V3, level: number, placements: readonly ParkedPlacement[], key = 'parkedLife', label = 'Finished parking | parked touring cars', shared?: Map<string, THREE.MeshStandardMaterial>): void {
  if (!placements.length || group.userData[key]) return;
  const matrices = placements.map(p => {
    const f = new THREE.Vector3(p.forward[0], p.grade[0], -p.forward[1]).normalize();
    const r = new THREE.Vector3(p.forward[1], p.grade[1], p.forward[0]).normalize();
    const up = new THREE.Vector3().crossVectors(r, f).normalize();
    const right = new THREE.Vector3().crossVectors(f, up).normalize();
    const matrix = new THREE.Matrix4().makeBasis(right, up, f.negate());
    matrix.scale(new THREE.Vector3(p.scale, p.scale, p.scale)); matrix.setPosition(p.center[0] - origin[0], p.center[2] - origin[1], -p.center[1] - origin[2]);
    return matrix;
  });
  let triangles = 0, draws = 0;
  for (const part of template.parts) {
    if (level >= 2 && /aluminum|lamps|soft black/.test(part.name)) continue;
    const { geometry, painted, triangles: count } = partGeometry(part);
    let material = shared?.get(part.name);
    if (!material) { material = partMaterial(part); shared?.set(part.name, material); }
    const mesh = new THREE.InstancedMesh(geometry, material, placements.length); mesh.name = label;
    mesh.castShadow = true; mesh.receiveShadow = true; mesh.userData.townCrafted = true; mesh.userData.category = 'cars'; mesh.userData.appearanceBasis = template.basis;
    matrices.forEach((m, i) => { mesh.setMatrixAt(i, m); if (painted) mesh.setColorAt(i, new THREE.Color(placements[i].color)); });
    mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; mesh.computeBoundingBox(); mesh.computeBoundingSphere(); group.add(mesh);
    triangles += count * placements.length; draws++;
  }
  group.userData[key] = { cars: placements.length, draws, triangles, placements };
}

/**
 * Tile-local proxies holding only the triangles whose material passes `test`,
 * for point-on-surface queries (a GrassTerrain over them). Crafted additions
 * are skipped unless asked for.
 */
export function surfaceProxies(group: THREE.Group, test: (name: string) => boolean, crafted = false): THREE.Mesh[] {
  group.updateMatrixWorld(true);
  const inverse = group.matrixWorld.clone().invert(), proxies: THREE.Mesh[] = [];
  group.traverse(object => {
    if (!(object instanceof THREE.Mesh) || object instanceof THREE.InstancedMesh || (!crafted && object.userData.townCrafted)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    const pass = (m: THREE.Material | undefined) => !!m?.name && test(m.name);
    if (!materials.some(pass)) return;
    const geometry = object.geometry as THREE.BufferGeometry, position = geometry.getAttribute('position'), index = geometry.index;
    if (!position) return;
    const count = index ? index.count : position.count, groups = geometry.groups.length ? geometry.groups : [{ start: 0, count, materialIndex: 0 }];
    const out: number[] = [];
    for (const g of groups) {
      if (!pass(materials[g.materialIndex ?? 0])) continue;
      for (let i = g.start; i < Math.min(count, g.start + g.count); i++) {
        const v = index ? index.getX(i) : i;
        out.push(position.getX(v), position.getY(v), position.getZ(v));
      }
    }
    if (!out.length) return;
    const proxyGeometry = new THREE.BufferGeometry();
    proxyGeometry.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
    const proxy = new THREE.Mesh(proxyGeometry);
    proxy.matrixAutoUpdate = false;
    proxy.matrixWorld.copy(inverse).multiply(object.matrixWorld);
    proxies.push(proxy);
  });
  return proxies;
}
