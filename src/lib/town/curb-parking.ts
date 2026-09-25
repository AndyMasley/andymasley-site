import * as THREE from 'three';
import type { NetworkData, RoadEdge } from './engine';
import { GrassTerrain } from './grass';
import { addParkedLife, type ParkedPlacement } from './parked-life';
import { applyArtMaterial } from './art-materials';

/**
 * Parallel-parked cars on the registered curbside parking aprons of downtown
 * streets, facing the direction of travel on their side. Aprons are the only
 * places used, so a parked car never stands in a traffic lane. Which spaces
 * are occupied and the car colours are authored and stable; this is a summer
 * scene, not a count of any real vehicle.
 */
export type CurbParkingReport = { cars: number; spaces: number };

const APRON = 'Streetscape | parking apron asphalt';
const TILE = 250;
const SPACE = 6.7;
const palette = ['#ecebe3', '#aeb7b8', '#56666b', '#8e2e2b', '#263e57', '#d0c3a4', '#333739', '#647261', '#9aa3a6', '#1f2a33'];

function hash(value: string): number { let n = 2166136261; for (let i = 0; i < value.length; i++) n = Math.imul(n ^ value.charCodeAt(i), 16777619) >>> 0; return n; }

type Street = { line: number[][]; half: number; name: string };

export class CurbParking {
  private readonly streets: Street[] = [];
  private readonly byTile = new Map<string, number[]>();
  /** One material per car part, shared by every tile's instanced cars. */
  private readonly materials = new Map<string, THREE.MeshStandardMaterial>();

  private readonly junctions: number[][] = [];

  constructor(network: NetworkData) {
    const seen = new Set<number>(), degree = new Map<number, number>(), nodes = new Map<number, number[]>();
    for (const edge of network.edges as RoadEdge[]) {
      const id = Number(edge.physical_id ?? edge.id);
      if (seen.has(id)) continue;
      seen.add(id);
      for (const [node, point] of [[edge.from, edge.points[0]], [edge.to, edge.points[edge.points.length - 1]]] as [number, number[]][]) {
        degree.set(node, (degree.get(node) ?? 0) + 1); nodes.set(node, point);
      }
      const line = edge.points.map(p => [p[0], p[1]]);
      if (line.length < 2) continue;
      const index = this.streets.length;
      this.streets.push({ line, half: Number(edge.width_m ?? 7) / 2, name: String(edge.name ?? id) });
      // Register every tile the street passes near, sampling long segments too.
      const keys = new Set<string>();
      for (let i = 0; i < line.length; i++) {
        const a = line[i], b = line[Math.min(line.length - 1, i + 1)], steps = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 10));
        for (let k = 0; k <= steps; k++) {
          const x = a[0] + (b[0] - a[0]) * k / steps, n = a[1] + (b[1] - a[1]) * k / steps;
          for (const dx of [-12, 12]) for (const dn of [-12, 12]) keys.add(`${Math.floor((x + dx) / TILE)}_${Math.floor((n + dn) / TILE)}`);
        }
      }
      for (const key of keys) { const list = this.byTile.get(key); if (list) list.push(index); else this.byTile.set(key, [index]); }
    }
    for (const [node, count] of degree) if (count >= 3) this.junctions.push(nodes.get(node)!);
  }

  /** Adds the tile's curbside cars (once). */
  apply(group: THREE.Group, tileId: string, origin: readonly number[], level: number): CurbParkingReport {
    const existing = group.userData.curbParking as CurbParkingReport | undefined;
    if (existing) return existing;
    const report: CurbParkingReport = { cars: 0, spaces: 0 };
    group.userData.curbParking = report;
    if (level > 1) return report;
    const aprons = apronProxies(group);
    if (!aprons.length) return report;
    const ground = new GrassTerrain(aprons);
    const placements: ParkedPlacement[] = [];
    const heightAt = (east: number, north: number): number | undefined => {
      const p = ground.sample(east - origin[0], -north - origin[2]);
      return p ? p.y + origin[1] : undefined;
    };
    for (const index of this.byTile.get(tileId) ?? []) {
      const street = this.streets[index], line = street.line;
      const lengths = [0];
      for (let i = 1; i < line.length; i++) lengths.push(lengths[i - 1] + Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]));
      const total = lengths[lengths.length - 1];
      // Position and a smoothed direction at distance s along the street.
      const at = (d: number): [number, number] => {
        const s = Math.min(total, Math.max(0, d));
        let i = 1; while (i < lengths.length - 1 && lengths[i] < s) i++;
        const a = line[i - 1], b = line[i], seg = lengths[i] - lengths[i - 1] || 1, t = (s - lengths[i - 1]) / seg;
        return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      };
      for (let s = SPACE / 2; s + SPACE / 2 <= total; s += SPACE) {
        const p = at(s), ahead = at(s + 2.5), behind = at(s - 2.5);
        const dx = ahead[0] - behind[0], dn = ahead[1] - behind[1], l = Math.hypot(dx, dn);
        if (l < 1) continue;
        const tx = dx / l, tn = dn / l;
        for (const side of [-1, 1]) {
          // Left of the street direction is (-tn, tx); traffic keeps right, so
          // cars on the left side face against the street direction.
          const ox = -tn * side, on = tx * side, facing = side > 0 ? -1 : 1;
          // No parking within about 15 m of an intersection (crosswalks, corner ramps).
          if (this.junctions.some(j => Math.hypot(j[0] - p[0], j[1] - p[1]) < 15)) break;
          for (const lateral of [street.half + 1.25, street.half + 1.5, street.half + 1.75]) {
            const cx = p[0] + ox * lateral, cn = p[1] + on * lateral;
            if (Math.floor(cx / TILE) + '_' + Math.floor(cn / TILE) !== tileId) break;
            const fx = tx * facing, fn = tn * facing, rx = fn, rn = -fx;
            // The parked-car footprint (4.55 x 2.28 m) plus a hand's clearance must lie on the apron.
            const corners = [[-2.35, -1.22], [2.35, -1.22], [2.35, 1.22], [-2.35, 1.22], [0, -1.22], [0, 1.22]].map(([u, v]) => [cx + fx * u + rx * v, cn + fn * u + rn * v]);
            const heights = corners.map(c => heightAt(c[0], c[1]));
            if (heights.some(h => h === undefined)) continue;
            corners.length = 4; heights.length = 4;
            report.spaces++;
            const value = hash(`${street.name}:${Math.round(cx * 2)}:${Math.round(cn * 2)}`);
            if (value % 100 < 58) {
              const h = heights as number[], mean = h.reduce((x, y) => x + y, 0) / 4;
              const along = ((h[1] + h[2]) - (h[0] + h[3])) / (4 * 2.35), across = ((h[2] + h[3]) - (h[0] + h[1])) / (4 * 1.22);
              if (Math.hypot(along, across) <= 0.12) placements.push({ center: [cx, cn, mean + 0.016], corners, forward: [fx, fn], grade: [along, across], color: palette[(value >>> 8) % palette.length], scale: 0.95 + (value % 7) * 0.008 });
            }
            break;
          }
        }
      }
    }
    // Keep a car length between neighbours from overlapping segments.
    const kept: ParkedPlacement[] = [];
    for (const p of placements) if (!kept.some(q => Math.hypot(q.center[0] - p.center[0], q.center[1] - p.center[1]) < 5.4)) kept.push(p);
    addParkedLife(group, origin as [number, number, number], level, kept, 'curbParkingCars', 'Curbside parking | parked cars', this.materials);
    // Same paint, glass and rubber response as the cars parked in lots.
    for (const material of this.materials.values()) applyArtMaterial(material);
    report.cars = kept.length;
    return report;
  }

  dispose(): void {
    for (const material of this.materials.values()) material.dispose();
    this.materials.clear();
  }
}

/** Tile-local proxies holding only parking-apron triangles. */
function apronProxies(group: THREE.Group): THREE.Mesh[] {
  group.updateMatrixWorld(true);
  const inverse = group.matrixWorld.clone().invert(), proxies: THREE.Mesh[] = [];
  group.traverse(object => {
    if (!(object instanceof THREE.Mesh) || object instanceof THREE.InstancedMesh || object.userData.townCrafted) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    const apron = (m: THREE.Material | undefined) => !!m?.name?.startsWith(APRON);
    if (!materials.some(apron)) return;
    const geometry = object.geometry as THREE.BufferGeometry, position = geometry.getAttribute('position'), index = geometry.index;
    if (!position) return;
    const count = index ? index.count : position.count, groups = geometry.groups.length ? geometry.groups : [{ start: 0, count, materialIndex: 0 }];
    const out: number[] = [];
    for (const g of groups) {
      if (!apron(materials[g.materialIndex ?? 0])) continue;
      for (let i = g.start; i < g.start + g.count; i++) {
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
