import index from '../../../data/derived/town/measured-roofs-index.json';
import type { AssetRef } from './contracts';
import type { Batch, Frame, Role } from './crafted-frontages';

/** One house measured from the 2021 LiDAR roof returns: a closed body whose
 * roof sections, ridge heights and eaves follow the fitted planes, with the
 * walls set in under the roofprint so eaves and rakes overhang. Vertices are
 * centimetres east/north of `o` and above `b`; indices are triangles. */
export type MeasuredRoof = {
  id: string;
  o: [number, number];
  b: number;
  p: number;
  v: string;
  r: string;
  w: string;
  t?: string;
  e: (number | null)[];
  /** Per frame, the inset wall's top above `b`: one height when level, else a
   * polyline of [u, height] along the frame (gables rise and fall, wings step). */
  ep?: (number | [number, number][] | null)[];
  c: number[][];
  g?: number[][];
  q: number;
  rc?: string;
  wc?: string;
  tc?: string;
  /** Read from the assessor's street photograph, when one shows the house;
   * shutters is their colour, absent when the front windows have none. */
  f?: {
    material?: 'siding' | 'shingle' | 'brick' | 'stone' | 'stucco'; porch?: 'none' | 'open' | 'enclosed' | 'stacked'; shutters?: string; bays?: number; door?: string;
    side?: 'left' | 'right' | 'center' | 'full'; ground?: 'open' | 'enclosed'; upper?: 'open' | 'enclosed'; levels?: number;
  };
};
export type MeasuredRoofPacket = { version: 1; tileId: string; rows: MeasuredRoof[] };

const tiles = new Set(index.tiles.split(','));
export const MEASURED_ROOF_COVERAGE = { houses: index.count, tiles: tiles.size };
export const measuredRoofAsset = (tileId: string): AssetRef | undefined =>
  tiles.has(tileId) ? { url: `${index.dir}/${tileId}.json`, bytes: 0 } : undefined;

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const hex = (v: unknown) => v === undefined || (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v));
function bytes(s: string): Uint8Array {
  const b = atob(s), out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
}
const int16 = (s: string) => { const b = bytes(s); return new Int16Array(b.buffer, 0, b.length >> 1); };
/** Triangle indices are bytes when a body has at most 255 vertices. */
const indices = (s: string, vertices: number): ArrayLike<number> => {
  const b = bytes(s);
  return vertices <= 255 ? b : new Uint16Array(b.buffer, 0, b.length >> 1);
};

export function validMeasuredRoofPacket(value: unknown, tileId: string): value is MeasuredRoofPacket {
  if (!value || typeof value !== 'object') return false;
  const p = value as MeasuredRoofPacket;
  if (p.version !== 1 || p.tileId !== tileId || !Array.isArray(p.rows)) return false;
  const ids = new Set<string>();
  for (const r of p.rows) {
    if (!r || typeof r.id !== 'string' || ids.has(r.id)) return false;
    ids.add(r.id);
    if (!Array.isArray(r.o) || r.o.length !== 2 || !r.o.every(finite) || !finite(r.b) || !finite(r.p) || !finite(r.q) || r.p <= r.b) return false;
    if (typeof r.v !== 'string' || typeof r.r !== 'string' || typeof r.w !== 'string' || (r.t !== undefined && typeof r.t !== 'string')) return false;
    if (!Array.isArray(r.e) || !r.e.every(e => e === null || finite(e)) || !Array.isArray(r.c) || !r.c.every(c => Array.isArray(c) && c.length === 7 && c.every(finite))) return false;
    if (r.g !== undefined && !(Array.isArray(r.g) && r.g.every(g => Array.isArray(g) && g.length === 5 && g.every(finite)))) return false;
    if (r.ep !== undefined && !(Array.isArray(r.ep) && r.ep.length === r.e.length && r.ep.every(p => p === null || finite(p) ||
      (Array.isArray(p) && p.length >= 2 && p.every((x, i) => Array.isArray(x) && x.length === 2 && x.every(finite) && (i === 0 || x[0] >= p[i - 1][0])))))) return false;
    if (!hex(r.rc) || !hex(r.wc) || !hex(r.tc)) return false;
    if (r.f !== undefined) {
      const f = r.f;
      if (!f || typeof f !== 'object' || !hex(f.door) || !hex(f.shutters) ||
        (f.bays !== undefined && !(Number.isInteger(f.bays) && f.bays >= 1 && f.bays <= 12)) ||
        (f.material !== undefined && !['siding', 'shingle', 'brick', 'stone', 'stucco'].includes(f.material)) ||
        (f.porch !== undefined && !['none', 'open', 'enclosed', 'stacked'].includes(f.porch)) ||
        (f.side !== undefined && !['left', 'right', 'center', 'full'].includes(f.side)) ||
        [f.ground, f.upper].some(x => x !== undefined && x !== 'open' && x !== 'enclosed') ||
        (f.levels !== undefined && f.levels !== 2 && f.levels !== 3)) return false;
    }
    try {
      const v = int16(r.v), n = v.length / 3;
      if (!n || v.length % 3) return false;
      for (const s of [r.r, r.w, r.t ?? '']) { const t = Array.from(indices(s, n)); if (t.length % 3 || t.some(i => i >= n)) return false; }
    } catch { return false; }
  }
  return true;
}

/** Adds the measured body, its chimneys and a foundation band to a batch.
 * Walls take the house's wall role and paint; the roof its measured colour. */
export function measuredBody(batch: Batch, structId: string, tileId: string, roof: MeasuredRoof, wall: Role, paint: string | undefined, fallbackRoof: string): void {
  const f: Frame = { start: roof.o, tangent: [1, 0], outward: [0, -1], structId, tileId };
  const v = int16(roof.v), count = v.length / 3;
  // Fascia, rakes and soffits are painted trim, as on the houses themselves.
  for (const [role, key, color] of [['roof', roof.r, roof.rc ?? fallbackRoof], [wall, roof.w, paint], ['trim', roof.t ?? '', roof.tc ?? '#e1dfd6']] as const) {
    const t = indices(key, count), p = new Float32Array(t.length * 3), n = new Float32Array(t.length * 3);
    for (let i = 0; i < t.length; i += 3) {
      for (let k = 0; k < 3; k++) {
        const j = t[i + k] * 3, o = (i + k) * 3;
        p[o] = v[j] / 100; p[o + 1] = roof.b + v[j + 2] / 100; p[o + 2] = -v[j + 1] / 100;
      }
      const o = i * 3;
      const ax = p[o + 3] - p[o], ay = p[o + 4] - p[o + 1], az = p[o + 5] - p[o + 2];
      const bx = p[o + 6] - p[o], by = p[o + 7] - p[o + 1], bz = p[o + 8] - p[o + 2];
      let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
      const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
      for (let k = 0; k < 3; k++) { n[o + k * 3] = nx; n[o + k * 3 + 1] = ny; n[o + k * 3 + 2] = nz; }
    }
    if (t.length) batch.geometry(f, role as Role, p, n, color);
  }
  // Gutters hang on the fascia along level roofprint edges; a downspout runs
  // from each long run back under the soffit and down the inset wall.
  if (batch.level === 0) for (const [e0, n0, e1, n1, z] of roof.g ?? []) {
    const dx = e1 - e0, dy = n1 - n0, length = Math.hypot(dx, dy);
    if (length < .8) continue;
    const t = [dx / length, dy / length], mid = [(e0 + e1) / 2, (n0 + n1) / 2];
    const out = t[1] * mid[0] - t[0] * mid[1] >= 0 ? [t[1], -t[0]] : [-t[1], t[0]];
    const g: Frame = { start: [roof.o[0] + e0, roof.o[1] + n0], tangent: t, outward: out, structId, tileId };
    batch.box(g, 'metal', length / 2, z + .1, .07, length, .12, .12, '#aaa99e');
    if (length > 4) {
      const drop = z - (roof.b + .15);
      if (drop > 1) {
        batch.box(g, 'metal', .35, z + .06, -.13, .07, .07, .4, '#b6b5aa');
        batch.box(g, 'metal', .35, z - drop / 2, -.3, .07, drop, .07, '#b6b5aa');
      }
    }
  }
  // Chimneys stand where the returns rise sharply above the fitted roof.
  for (const [de, dn, top, sx, sy, yaw, roofZ] of roof.c) {
    const bottom = roofZ - .35, h = top - bottom;
    if (h <= .2) continue;
    batch.box(f, 'brick', de, bottom + h / 2, -dn, sx, h, sy, '#86523f', yaw);
    batch.box(f, 'foundation', de, top + .04, -dn, sx + .1, .08, sy + .1, '#8f8c84', yaw);
  }
}
