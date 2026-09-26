import { dir, grid, count, photographed, others, kept } from '../../../data/derived/town/measured-roofs-index.json';
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
    /** Street context: mailbox, foundation shrubs, street-facing garage doors (count, side as seen, colour), front fence. */
    mb?: 'curb' | 'house' | 'none'; sh?: 'none' | 'some' | 'many'; gd?: number; gs?: 'left' | 'right' | 'center'; gc?: string;
    /** The driveway's surface. */
    dw?: 'asphalt' | 'gravel' | 'concrete' | 'pavers' | 'none';
    fe?: 'picket' | 'chain' | 'stone' | 'retaining' | 'rail' | 'privacy' | 'iron' | 'hedge'; fc?: string;
    /** The fence's runs along the lot's street frontage: [e0, n0, e1, n1] in decimetres from `o`. */
    fl?: number[][];
  };
};
/** A garage, shed or other building that is not one of the evidence houses.
 * 'o' (garage or shed) and 'b' (a building with storeys of windows) carry a
 * measured body like a house's; 'v' keeps the scenery's own box and takes
 * only doors and paint. `ol` is the roofprint ring, decimetres from `o`,
 * counter-clockwise; walls stand `in` inside it ('v': on it, `h` high). */
export type MeasuredOther = {
  id: string; k: 'o' | 'b' | 'v'; o: [number, number]; b: number; ol: [number, number][];
  p?: number; v?: string; r?: string; w?: string; t?: string; q?: number; in?: number; g?: number[][];
  /** Per ring edge, the inset wall's top above `b` (as a house's `ep`). */
  ep?: (number | [number, number][] | null)[];
  h?: number; rc?: string; wc?: string; tc?: string;
  /** The ring edge holding `gn` vehicle doors (in colour `gc`), or the one holding a hinged door (on a building, its street face). */
  gw?: number; gn?: number; gc?: string; dw?: number;
  /** Wall material from a photograph. */
  m?: 'siding' | 'shingle' | 'wood' | 'brick' | 'block' | 'concrete' | 'metal' | 'stucco' | 'stone';
  /** A photographed building's street face: storeys, shopfront, awning colour,
   * window pattern and columns, overhead doors (count, colour), entrance door. */
  fb?: { fl?: number; st?: number; aw?: string; wn?: 'none' | 'few' | 'rows' | 'band'; bays?: number; od?: number; oc?: string; dc?: string };
};
/** A house the LiDAR could not fit whose street photograph was read: its
 * facade reads only (as a measured house's), at the plan's centre `o`. */
export type PhotographedHouse = { id: string; k: 'h'; o: [number, number]; b: number; wc?: string; tc?: string; f?: MeasuredRoof['f'] };
/** Which of the tile's scenery trees are evergreens in the leaf-off aerial: `n` tree rows, `c` base64 bits in row order. */
export type TreeFamilies = { n: number; c: string };
export type MeasuredRoofPacket = { version: 1; tileId: string; rows: (MeasuredRoof | MeasuredOther | PhotographedHouse)[]; trees?: TreeFamilies };
/** The evergreen flag of each tree row, when the packet's count matches the rows. */
export function evergreens(families: TreeFamilies | undefined, rows: number): ((index: number) => boolean) | undefined {
  if (!families || families.n !== rows) return undefined;
  const bits = atob(families.c);
  return bits.length === (rows + 7) >> 3 ? index => !!(bits.charCodeAt(index >> 3) & (1 << (index & 7))) : undefined;
}
export const isMeasuredOther = (row: MeasuredRoof | MeasuredOther | PhotographedHouse): row is MeasuredOther => 'k' in row && (row.k === 'o' || row.k === 'b' || row.k === 'v');
export const isPhotographedHouse = (row: MeasuredRoof | MeasuredOther | PhotographedHouse): row is PhotographedHouse => 'k' in row && row.k === 'h';

/** Tiles with a packet: a bitmap over tile columns and rows from [x0, y0], `width` wide. */
const [x0, y0, width, bitmap] = grid as [number, number, number, string], held = atob(bitmap);
const hasPacket = (tileId: string): boolean => {
  const m = /^(-?\d+)_(-?\d+)$/.exec(tileId);
  if (!m) return false;
  const x = +m[1] - x0, y = +m[2] - y0, k = y * width + x;
  return x >= 0 && x < width && y >= 0 && k >> 3 < held.length && !!(held.charCodeAt(k >> 3) & (1 << (k & 7)));
};
let packetTiles = 0;
for (let i = 0; i < held.length; i++) for (let b = held.charCodeAt(i); b; b >>= 1) packetTiles += b & 1;
export const MEASURED_ROOF_COVERAGE = { houses: count, photographed, others, kept, tiles: packetTiles };
export const measuredRoofAsset = (tileId: string): AssetRef | undefined =>
  hasPacket(tileId) ? { url: `${dir}/${tileId}.json`, bytes: 0 } : undefined;

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
  if (p.trees !== undefined && !(p.trees && Number.isInteger(p.trees.n) && p.trees.n > 0 && typeof p.trees.c === 'string' && /^[A-Za-z0-9+/]*={0,2}$/.test(p.trees.c))) return false;
  const ids = new Set<string>();
  for (const row of p.rows) {
    if (!row || typeof row.id !== 'string' || ids.has(row.id)) return false;
    ids.add(row.id);
    if (isMeasuredOther(row)) { if (!validOther(row)) return false; continue; }
    if (isPhotographedHouse(row)) {
      if (!Array.isArray(row.o) || row.o.length !== 2 || !row.o.every(finite) || !finite(row.b) || !hex(row.wc) || !hex(row.tc) || !validFacade(row.f)) return false;
      continue;
    }
    if ('k' in row && (row as { k?: unknown }).k !== undefined) return false;
    const r = row;
    if (!Array.isArray(r.e) || !r.e.every(e => e === null || finite(e)) || !Array.isArray(r.c) || !r.c.every(c => Array.isArray(c) && c.length === 7 && c.every(finite))) return false;
    if (!validBody(r, r.e.length) || !hex(r.wc) || !validFacade(r.f)) return false;
  }
  return true;
}

/** A measured body: origin and base, peak above base, fit share, vertex and
 * index strings in range, gutters, per-frame wall tops, colours. */
function validBody(r: Pick<MeasuredRoof, 'o' | 'b' | 'p' | 'q' | 'v' | 'r' | 'w' | 't' | 'g' | 'ep' | 'rc' | 'tc'>, frames: number): boolean {
  if (!Array.isArray(r.o) || r.o.length !== 2 || !r.o.every(finite) || !finite(r.b) || !finite(r.p) || !finite(r.q) || r.p <= r.b) return false;
  if (typeof r.v !== 'string' || typeof r.r !== 'string' || typeof r.w !== 'string' || (r.t !== undefined && typeof r.t !== 'string') || !hex(r.rc) || !hex(r.tc)) return false;
  if (r.g !== undefined && !(Array.isArray(r.g) && r.g.every(g => Array.isArray(g) && g.length === 5 && g.every(finite)))) return false;
  if (r.ep !== undefined && !(Array.isArray(r.ep) && r.ep.length === frames && r.ep.every(p => p === null || finite(p) ||
    (Array.isArray(p) && p.length >= 2 && p.every((x, i) => Array.isArray(x) && x.length === 2 && x.every(finite) && (i === 0 || x[0] >= p[i - 1][0])))))) return false;
  try {
    const v = int16(r.v), n = v.length / 3;
    if (!n || v.length % 3) return false;
    for (const s of [r.r, r.w, r.t ?? '']) { const t = Array.from(indices(s, n)); if (t.length % 3 || t.some(i => i >= n)) return false; }
  } catch { return false; }
  return true;
}

function validFacade(f: MeasuredRoof['f']): boolean {
  if (f === undefined) return true;
  if (!f || typeof f !== 'object' || !hex(f.door) || !hex(f.shutters) ||
    (f.bays !== undefined && !(Number.isInteger(f.bays) && f.bays >= 1 && f.bays <= 12)) ||
    (f.material !== undefined && !['siding', 'shingle', 'brick', 'stone', 'stucco'].includes(f.material)) ||
    (f.porch !== undefined && !['none', 'open', 'enclosed', 'stacked'].includes(f.porch)) ||
    (f.side !== undefined && !['left', 'right', 'center', 'full'].includes(f.side)) ||
    [f.ground, f.upper].some(x => x !== undefined && x !== 'open' && x !== 'enclosed') ||
    (f.levels !== undefined && f.levels !== 2 && f.levels !== 3) ||
    (f.mb !== undefined && !['curb', 'house', 'none'].includes(f.mb)) || (f.sh !== undefined && !['none', 'some', 'many'].includes(f.sh)) ||
    (f.dw !== undefined && !['asphalt', 'gravel', 'concrete', 'pavers', 'none'].includes(f.dw)) ||
    (f.gd !== undefined && !(Number.isInteger(f.gd) && f.gd >= 1 && f.gd <= 3)) || (f.gs !== undefined && !['left', 'right', 'center'].includes(f.gs)) ||
    (f.fe !== undefined && !['picket', 'chain', 'stone', 'retaining', 'rail', 'privacy', 'iron', 'hedge'].includes(f.fe)) || !hex(f.gc) || !hex(f.fc) ||
    (f.fl !== undefined && !(f.fe && Array.isArray(f.fl) && f.fl.every(l => Array.isArray(l) && l.length === 4 && l.every(x => Number.isInteger(x) && Math.abs(x) < 2000))))) return false;
  return true;
}

function validOther(r: MeasuredOther): boolean {
  if (!['o', 'b', 'v'].includes(r.k) || !Array.isArray(r.o) || r.o.length !== 2 || !r.o.every(finite) || !finite(r.b)) return false;
  if (!Array.isArray(r.ol) || r.ol.length < 3 || r.ol.length > 200 || !r.ol.every(q => Array.isArray(q) && q.length === 2 && q.every(x => Number.isInteger(x) && Math.abs(x) < 20000))) return false;
  const edges = r.ol.length, edge = (i: unknown) => i === undefined || (Number.isInteger(i) && (i as number) >= 0 && (i as number) < edges);
  if (!edge(r.gw) || !edge(r.dw) || (r.gn !== undefined && !(Number.isInteger(r.gn) && r.gn >= 1 && r.gn <= 3)) || (r.gw === undefined) !== (r.gn === undefined)) return false;
  if (!hex(r.rc) || !hex(r.wc) || !hex(r.tc) || !hex(r.gc)) return false;
  if (r.m !== undefined && !['siding', 'shingle', 'wood', 'brick', 'block', 'concrete', 'metal', 'stucco', 'stone'].includes(r.m)) return false;
  if (r.fb !== undefined) {
    const f = r.fb, count = (v: unknown, max: number) => v === undefined || (Number.isInteger(v) && (v as number) >= 0 && (v as number) <= max);
    if (!f || typeof f !== 'object' || r.k !== 'b' || !count(f.fl, 6) || !count(f.st, 1) || !count(f.bays, 20) || !count(f.od, 8) || !hex(f.aw) || !hex(f.oc) ||
      (f.dc !== undefined && f.dc !== 'glass' && !hex(f.dc)) || (f.wn !== undefined && !['none', 'few', 'rows', 'band'].includes(f.wn))) return false;
  }
  if (r.k === 'v') return finite(r.h) && r.h > 0 && r.h < 30 && r.v === undefined;
  return finite(r.in) && r.in >= 0 && r.in <= .5 && validBody(r as Parameters<typeof validBody>[0], edges);
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
