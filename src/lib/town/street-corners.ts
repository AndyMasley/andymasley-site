import * as THREE from 'three';
import index from '../../../data/derived/town/street-corners-index.json';
import type { AssetRef, V3 } from './contracts';

type Point = [number, number, number];
type Triangle = [Point, Point, Point];
interface Corner { id: string; kind: 'sidewalk' | 'apron'; triangles: Triangle[]; boundary: Point[][] }
export interface StreetCornerPacket {
  version: 1; tileId: string; sourceManifestSha256: string;
  sourceLods: Record<string, string>; features: Corner[];
}
export interface StreetCornerReport { features: number; triangles: number; rejected: boolean }
export function streetCornerAsset(tileId: string): AssetRef | undefined {
  return (index.tiles as Record<string, AssetRef>)[tileId];
}
export function validStreetCornerPacket(value: unknown, tileId: string): value is StreetCornerPacket {
  const p = value as StreetCornerPacket | undefined;
  if (!p || p.version !== 1 || p.tileId !== tileId || p.sourceManifestSha256 !== index.sourceManifestSha256
    || !p.sourceLods || !Array.isArray(p.features) || p.features.length > 120) return false;
  const cell = tileId.split('_').map(Number);
  const point = (v: unknown): v is Point => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite)
    && Math.abs(v[0] - (cell[0] + .5) * 250) < 225 && Math.abs(v[1] - (cell[1] + .5) * 250) < 225
    && v[2] > -1000 && v[2] < 3000;
  return Object.entries(p.sourceLods).length <= 3 && Object.entries(p.sourceLods).every(([key, sha]) => ['0', '1', '2'].includes(key) && /^[a-f0-9]{64}$/.test(sha))
    && p.features.every(f => f && typeof f.id === 'string' && ['sidewalk', 'apron'].includes(f.kind)
      && Array.isArray(f.triangles) && f.triangles.length > 0 && f.triangles.length < 20000
      && f.triangles.every(t => Array.isArray(t) && t.length === 3 && t.every(point))
      && Array.isArray(f.boundary) && f.boundary.length < 1000 && f.boundary.every(r => Array.isArray(r) && r.length >= 3 && r.length < 20000 && r.every(point)));
}

/** Corner geometry is authored from retained sidewalk-width evidence, not a
 * new claim about surveyed curb positions. The source archive stays intact. */
export function applyStreetCorners(group: THREE.Group, tileId: string, origin: V3, level: number, sourceSha256: string, packet?: StreetCornerPacket): StreetCornerReport {
  const report: StreetCornerReport = { features: 0, triangles: 0, rejected: false };
  if (!packet) return report;
  if (group.userData.streetCorners) return group.userData.streetCorners;
  if (!validStreetCornerPacket(packet, tileId) || packet.sourceLods[String(level)] !== sourceSha256) return { ...report, rejected: true };
  const positions = { sidewalk: [] as number[], apron: [] as number[] }, exclusions: number[][][] = [];
  const emit = (kind: Corner['kind'], triangle: Point[], top: boolean) => {
    const [a, b, c] = triangle;
    if (top && (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]) < 0) triangle = [a, c, b];
    for (const p of triangle) positions[kind].push(p[0] - origin[0], p[2] - origin[1], -p[1] - origin[2]);
    report.triangles++;
  };
  for (const feature of packet.features) {
    for (const triangle of feature.triangles) {
      emit(feature.kind, triangle, true);
      // Triangle exclusions retain genuine holes, such as planted islands.
      exclusions.push(triangle.map(p => p.slice(0, 2)));
    }
    if (feature.kind === 'sidewalk') for (const ring of feature.boundary) {
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i], b = ring[(i + 1) % ring.length];
        const aa: Point = [a[0], a[1], a[2] - .18], bb: Point = [b[0], b[1], b[2] - .18];
        emit('sidewalk', [a, aa, bb], false); emit('sidewalk', [a, bb, b], false);
      }
    }
    report.features++;
  }
  for (const kind of ['sidewalk', 'apron'] as const) {
    if (!positions[kind].length) continue;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions[kind], 3));
    // World-scale UVs keep the paving grain consistent across tile ownership.
    const uv: number[] = [];
    for (let i = 0; i < positions[kind].length; i += 3) uv.push((positions[kind][i] + origin[0]) / 3, (-positions[kind][i + 2] - origin[2]) / 3);
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    const material = new THREE.MeshStandardMaterial({ color: kind === 'sidewalk' ? '#b6b3a7' : '#555653', roughness: .94 });
    material.name = kind === 'sidewalk' ? 'Streetscape | warm sidewalk concrete' : 'Finished street corner | asphalt apron';
    if (kind === 'apron') material.userData.townRoadSurfaceType = 6;
    const mesh = new THREE.Mesh(geometry, material); mesh.name = `finished_street_corner_${kind}`;
    mesh.receiveShadow = true; mesh.castShadow = kind === 'sidewalk';
    mesh.userData.townCrafted = true; mesh.userData.category = 'roads'; group.add(mesh);
  }
  group.userData.environmentGrassExclusions = [...(group.userData.environmentGrassExclusions ?? []), ...exclusions];
  group.userData.environmentTreeExclusions = [...(group.userData.environmentTreeExclusions ?? []), ...exclusions];
  group.userData.streetCorners = report;
  return report;
}
