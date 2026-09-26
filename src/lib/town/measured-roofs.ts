import { dir, grid, count, photographed, others, kept } from '../../../data/derived/town/measured-roofs-index.json';
import type { AssetRef } from './contracts';
import type { Batch, Frame, Role } from './crafted-frontages';
import type { SetbackWall } from './evidence-types';

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
  /** An open porch cut from the body under its roof: the frame it fronts, the
   * porch ceiling above `b`, and its strips (the house wall behind may step),
   * each [u0, u1] along that frame's inset wall, the depth of the house wall
   * behind and that wall's top ([u from the strip's start, height above `b`]). */
  pp?: { f: number; c: number; s: [number, number, number, [number, number][]][] };
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
    /** The street front's layout as photographed, in percent of its width from its left end as seen. */
    lo?: FrontLayout;
  };
};
/** Entrance doors, window centres on each storey (w1 the ground floor) and in
 * the attic or gable, dormers (centre and kind: gabled, shed, hipped,
 * eyebrow), garage doors and the porch's extent, in percent of the street
 * front's width from its left end as seen; how the roof meets the street and
 * the storeys that show. */
export type FrontLayout = {
  d?: number[]; w1?: number[]; w2?: number[]; w3?: number[]; wa?: number[]; gx?: number[];
  dm?: [number, 'g' | 's' | 'h' | 'e'][]; pw?: [number, number];
  rf?: 'side' | 'front' | 'cross' | 'hip' | 'gambrel' | 'mansard' | 'flat' | 'shed'; st?: number;
  /** The frame the photograph shows, where it is not the plan's front. */
  sf?: number;
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
/** Which of the tile's trees are evergreens in the leaf-off aerial: `n` tree rows, `c` base64 bits in row order. */
export type TreeFamilies = { n: number; c: string };
/** Trees the survey found near the tile's streets and houses: `n` scenery tree
 * rows, `k` base64 bits of those kept, and `t` base64 int16 per survey tree:
 * tile-local x and z, height and crown radius, in decimetres. */
export type SurveyTrees = { n: number; k: string; t: string };
export type MeasuredRoofPacket = { version: 1; tileId: string; rows: (MeasuredRoof | MeasuredOther | PhotographedHouse)[]; trees?: TreeFamilies; lt?: SurveyTrees };
/** The evergreen flag of each tree row, when the packet's count matches the rows. */
export function evergreens(families: TreeFamilies | undefined, rows: number): ((index: number) => boolean) | undefined {
  if (!families || families.n !== rows) return undefined;
  const bits = atob(families.c);
  return bits.length === (rows + 7) >> 3 ? index => !!(bits.charCodeAt(index >> 3) & (1 << (index & 7))) : undefined;
}
/** A tile's tree rows with the survey's trees in place of the scenery's near
 * its streets and houses: the scenery rows kept, then each survey tree stood on
 * the ground (its crown centre at 71% of its height, as the scenery's), or
 * undefined when the packet was made for other rows. Every tree keeps its place
 * in the list, so the evergreen flags stay aligned. */
export function surveyTreeRows(lt: SurveyTrees, rows: readonly number[][], origin: readonly number[], ground: (e: number, n: number) => number | undefined): number[][] | undefined {
  if (lt.n !== rows.length) return undefined;
  const bits = atob(lt.k), q = int16(lt.t);
  const kept = rows.filter((_, i) => bits.charCodeAt(i >> 3) >> (i & 7) & 1);
  const feet = kept.map(r => r[1] - .71 * r[4] / .30).sort((a, b) => a - b), fallback = feet.length ? feet[feet.length >> 1] : origin[1];
  const out = [...kept];
  for (let i = 0; i + 3 < q.length; i += 4) {
    const x = q[i] / 10, z = q[i + 1] / 10, h = Math.max(2, q[i + 2] / 10), r = Math.max(.8, q[i + 3] / 10), e = x + origin[0], n = -(z + origin[2]);
    const g = ground(e, n) ?? fallback, yaw = ((Math.sin(e * 12.9898 + n * 78.233) * 43758.5453) % 1 + 1) % 1 * Math.PI * 2;
    out.push([x, g - origin[1] + .71 * h, z, r, .30 * h, r, yaw]);
  }
  return out;
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
  if (p.lt !== undefined && !(p.lt && Number.isInteger(p.lt.n) && p.lt.n >= 0 && [p.lt.k, p.lt.t].every(v => typeof v === 'string' && /^[A-Za-z0-9+/]*={0,2}$/.test(v)) &&
    atob(p.lt.k).length === (p.lt.n + 7) >> 3 && atob(p.lt.t).length % 8 === 0)) return false;
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
    if (r.pp !== undefined && !(r.pp && Number.isInteger(r.pp.f) && r.pp.f >= 0 && r.pp.f < r.e.length && finite(r.pp.c) && Array.isArray(r.pp.s) && r.pp.s.length >= 1 && r.pp.s.length <= 6 &&
      r.pp.s.every(([u0, u1, d, t], i) => finite(u0) && finite(u1) && u1 > u0 && (i === 0 || u0 >= r.pp!.s[i - 1][1] - .25) && finite(d) && d > 0 && d < 5 &&
        Array.isArray(t) && t.length >= 2 && t.every(q => Array.isArray(q) && q.length === 2 && q.every(finite))))) return false;
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
    (f.fl !== undefined && !(f.fe && Array.isArray(f.fl) && f.fl.every(l => Array.isArray(l) && l.length === 4 && l.every(x => Number.isInteger(x) && Math.abs(x) < 2000)))) ||
    (f.lo !== undefined && !validLayout(f.lo))) return false;
  return true;
}

const percent = (x: unknown) => Number.isInteger(x) && (x as number) >= 0 && (x as number) <= 100;
function validLayout(lo: FrontLayout): boolean {
  if (!lo || typeof lo !== 'object') return false;
  for (const k of ['d', 'w1', 'w2', 'w3', 'wa', 'gx'] as const) if (lo[k] !== undefined && !(Array.isArray(lo[k]) && lo[k]!.length <= 30 && lo[k]!.every(percent))) return false;
  if (lo.dm !== undefined && !(Array.isArray(lo.dm) && lo.dm.length <= 8 && lo.dm.every(d => Array.isArray(d) && d.length === 2 && percent(d[0]) && ['g', 's', 'h', 'e'].includes(d[1])))) return false;
  if (lo.pw !== undefined && !(Array.isArray(lo.pw) && lo.pw.length === 2 && lo.pw.every(percent) && lo.pw[1] > lo.pw[0])) return false;
  if (lo.rf !== undefined && !['side', 'front', 'cross', 'hip', 'gambrel', 'mansard', 'flat', 'shed'].includes(lo.rf)) return false;
  if (lo.sf !== undefined && !(Number.isInteger(lo.sf) && lo.sf >= 0 && lo.sf < 200)) return false;
  return lo.st === undefined || [1, 1.5, 2, 2.5, 3, 3.5].includes(lo.st);
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

/** The walls of a measured body that stand back from every wall of its plan
 * (given as each wall's inset start and outward direction): wall triangles
 * grouped by plane, each plane split where its spans along the wall part. */
export function setbackWalls(roof: Pick<MeasuredRoof, 'o' | 'b' | 'v' | 'w'>, plan: readonly { start: readonly number[]; outward: readonly number[] }[]): SetbackWall[] {
  // Planes are compared about the body's own origin: centimetre vertices tilt
  // small triangles' normals, which would shift offsets taken from the town's.
  const v = int16(roof.v), t = indices(roof.w, v.length / 3), planes: { o: [number, number]; d: number; tris: number[][] }[] = [];
  const directions = plan.map(f => f.outward);
  for (let i = 0; i < t.length; i += 3) {
    const p = [t[i], t[i + 1], t[i + 2]].map(k => [v[k * 3] / 100, v[k * 3 + 1] / 100, roof.b + v[k * 3 + 2] / 100]);
    const ax = p[1][0] - p[0][0], ay = p[1][1] - p[0][1], az = p[1][2] - p[0][2], bx = p[2][0] - p[0][0], by = p[2][1] - p[0][1], bz = p[2][2] - p[0][2];
    let nx = ay * bz - az * by, ny = az * bx - ax * bz;
    const nz = ax * by - ay * bx, l = Math.hypot(nx, ny);
    if (l < .01 || Math.abs(nz) > .1 * l) continue;
    nx /= l; ny /= l;
    // Walls square to the plan take its exact direction.
    const snap = directions.find(o => o[0] * nx + o[1] * ny > .9986);
    if (snap) { nx = snap[0]; ny = snap[1]; }
    const d = (nx * (p[0][0] + p[1][0] + p[2][0]) + ny * (p[0][1] + p[1][1] + p[2][1])) / 3;
    let plane = planes.find(q => q.o[0] * nx + q.o[1] * ny > .9986 && Math.abs(q.d - d) < .08);
    if (!plane) planes.push(plane = { o: [nx, ny], d, tris: [] });
    plane.tris.push(p.flat());
  }
  const out: SetbackWall[] = [];
  for (const { o, d, tris } of planes) {
    if (plan.some(f => f.outward[0] * o[0] + f.outward[1] * o[1] > .9986 && Math.abs(f.outward[0] * (f.start[0] - roof.o[0]) + f.outward[1] * (f.start[1] - roof.o[1]) - d) < .15)) continue;
    const tangent: [number, number] = [-o[1], o[0]];
    const flat = tris.map(p => [0, 3, 6].flatMap(k => [tangent[0] * p[k] + tangent[1] * p[k + 1], p[k + 2]]))
      .map(q => ({ q, lo: Math.min(q[0], q[2], q[4]), hi: Math.max(q[0], q[2], q[4]) })).sort((a, b) => a.lo - b.lo);
    // Separate walls on one plane (two dormers) are separate faces.
    for (let k = 0; k < flat.length;) {
      let hi = flat[k].hi, j = k + 1;
      while (j < flat.length && flat[j].lo < hi + .05) hi = Math.max(hi, flat[j++].hi);
      const lo = flat[k].lo, part = flat.slice(k, j);
      k = j;
      if (hi - lo < 1.2) continue;
      out.push({ start: [roof.o[0] + o[0] * d + tangent[0] * lo, roof.o[1] + o[1] * d + tangent[1] * lo], tangent, outward: o, width: hi - lo,
        outline: part.flatMap(({ q }) => [q[0] - lo, q[1], q[2] - lo, q[3], q[4] - lo, q[5]]) });
    }
  }
  return out;
}

/** The height of a measured roof over a point (east, north), or undefined
 * off the roof: the highest of its roof triangles there. */
export function roofHeight(roof: { o: readonly number[]; b: number; v: string; r: string }): (e: number, n: number) => number | undefined {
  const v = int16(roof.v), t = indices(roof.r, v.length / 3), tris: number[][] = [];
  for (let i = 0; i < t.length; i += 3) tris.push([t[i], t[i + 1], t[i + 2]].flatMap(k => [v[k * 3] / 100, v[k * 3 + 1] / 100, v[k * 3 + 2] / 100]));
  return (e, n) => {
    const x = e - roof.o[0], y = n - roof.o[1];
    let best: number | undefined;
    for (const [ax, ay, az, bx, by, bz, cx, cy, cz] of tris) {
      const d = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
      if (Math.abs(d) < 1e-9) continue;
      const l1 = ((by - cy) * (x - cx) + (cx - bx) * (y - cy)) / d, l2 = ((cy - ay) * (x - cx) + (ax - cx) * (y - cy)) / d, l3 = 1 - l1 - l2;
      if (l1 < -1e-6 || l2 < -1e-6 || l3 < -1e-6) continue;
      const z = roof.b + l1 * az + l2 * bz + l3 * cz;
      if (best === undefined || z > best) best = z;
    }
    return best;
  };
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
