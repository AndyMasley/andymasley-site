import { KIND, SRC } from './model.js';
import { aqGraph } from './aqroute.js';
import { projectLower48 } from '../core/proj.js';
import { DROP_CONSUMED, DROP_DIVERSIONS, AQ_FLOWS } from '../core/flows_data.js';

const AF_MGD = 325851 / 365 / 1e6;      // one acre-foot a year, in million gallons a day

/**
 * A drop of water followed down the rivers, by chance at every place it passes.
 *
 * The rivers are HydroRIVERS reaches (net/rivers.js), each with its long-term mean natural discharge and the reach
 * downstream of it. The water taken out of them is the map's own: every surface intake the model draws (flow/model.js
 * streams), placed on the reach it draws from. A drop that reaches a place where water is taken out is taken with the
 * chance that the intakes there take water out of the river: what they withdraw over what flows past. The flow past
 * is the natural flow less what the uses upstream consumed or piped away. A drop taken goes to one of those intakes,
 * in proportion to what each withdrew, and is then consumed with the chance that its use consumes water:
 *  - crops and golf courses: what USGS estimated the county consumed of what it withdrew, 2015;
 *  - a power plant: what the USGS plant model estimated it consumed of what it withdrew, 2015;
 *  - public supply and industry: national shares from USGS (core/flows_data.js DROP_CONSUMED);
 *  - livestock, fish farms, mines and homes with their own intakes: USGS has not estimated it, so the drop goes back.
 * Water not consumed goes back to a river near where it was used, and the drop goes on from there, until it reaches
 * the sea, a lake with no outlet, or the border, or is consumed.
 *
 * A lake mixes the water that passes through it, so everything taken from a lake is taken where a drop first enters
 * it, against the flow out of the lake.
 */

const MGD_PER_CMS = 22.8244653;         // one cubic meter a second, in million gallons a day
const CELL = 2.0;                        // spatial index cell, world units

/** spherical conic equal-area projections (scripts/water-map/proj.py), to name the sea a river reaches */
function conicEA(rotLon, center, parallels, k, translate) {
  const D = Math.PI / 180, l0 = -rotLon;
  const p1 = parallels[0] * D, p2 = parallels[1] * D, sy0 = Math.sin(p1);
  const n = (sy0 + Math.sin(p2)) / 2, c = 1 + sy0 * (2 * n - sy0), r0 = Math.sqrt(c) / n;
  const raw = (lam, phi) => { const r = Math.sqrt(c - 2 * n * Math.sin(phi)) / n; return [r * Math.sin(lam * n), r0 - r * Math.cos(lam * n)]; };
  const [cx, cy] = raw(center[0] * D, center[1] * D);
  const tx = translate[0] - k * cx, ty = translate[1] + k * cy;
  return (X, Y) => {
    const x = (X - tx) / k, y = -(Y - ty) / k, r0y = r0 - y;
    const lam = Math.atan2(x, Math.abs(r0y)) * Math.sign(r0y);
    const rr = Math.hypot(x, r0y);
    const phi = Math.asin(Math.max(-1, Math.min(1, (c - rr * rr * n * n) / (2 * n))));
    let lon = lam / n / D + l0; lon = ((lon + 180) % 360 + 360) % 360 - 180;
    return [lon, phi / D];
  };
}
const K = 1240.583314171773, TX = 528.2480705172319, TY = 315.4452552440835;
const INVERSE = {
  conus: conicEA(96, [-0.6, 38.7], [29.5, 45.5], K, [TX, TY]),
  ak: conicEA(154, [-2, 58.5], [55, 65], K * 0.35, [TX - 0.307 * K, TY + 0.201 * K]),
  hi: conicEA(157, [-3, 19.9], [8, 18], K, [TX - 0.205 * K, TY + 0.212 * K]),
  pr: conicEA(66, [0, 18], [8, 18], K, [TX + 0.350 * K, TY + 0.224 * K]),
};

/** the sea a river mouth opens on, from its longitude and latitude */
function seaAt(slab, lon, lat) {
  if (slab === 'ak') return lat > 68 ? 'the Arctic Ocean' : lon < -157 ? 'the Bering Sea' : 'the Pacific';
  if (slab === 'pr') return lat > 18.25 ? 'the Atlantic' : 'the Caribbean Sea';
  if (slab === 'hi') return 'the Pacific';
  if (lon < -116.5) return 'the Pacific';
  if (lat < 32.6 && lon < -112.5) return 'the Gulf of California';
  if (lat < 31.2 && lon > -98 && lon < -81.6) return 'the Gulf of Mexico';
  return 'the Atlantic';
}

/**
 * The canals a diversion's water runs along, as one graph (flow/aqroute.js). Where the pieces of different canals do not
 * meet (an aqueduct mapped from OpenStreetMap and its branch from the National Hydrography Dataset, or a stretch
 * OpenStreetMap maps under another name), the shortest links between them up to `gap` world units (about 50 km) are
 * added, as a spanning tree.
 */
function canalGraph(aqueducts, names, gap = 10) {
  const g = aqGraph(aqueducts.filter((a) => names.includes(a.name)).map((a) => ({ ...a, kind: 'aqueduct' })));
  const { pts, adj } = g, n = pts.length, comp = new Int32Array(n).fill(-1);
  let nc = 0;
  for (let s = 0; s < n; s++) if (comp[s] < 0) {
    const st = [s]; comp[s] = nc;
    while (st.length) { const u = st.pop(); for (const [v] of adj[u]) if (comp[v] < 0) { comp[v] = nc; st.push(v); } }
    nc++;
  }
  if (nc > 1) {
    const cand = [];
    for (let i = 0; i < n; i++) {
      if (adj[i].length > 1) continue;
      for (let j = 0; j < n; j++) {
        if (comp[j] === comp[i]) continue;
        const d = Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]);
        if (d < gap) cand.push([d, i, j]);
      }
    }
    cand.sort((a, b) => a[0] - b[0]);
    const up = Array.from({ length: nc }, (_, k) => k), find = (k) => (up[k] === k ? k : (up[k] = find(up[k])));
    for (const [d, i, j] of cand) { const a = find(comp[i]), b = find(comp[j]); if (a !== b) { up[a] = b; adj[i].push([j, d]); adj[j].push([i, d]); } }
  }
  return g;
}

/** the shortest ways through a graph from one point: { dist, prev } */
function shortest(g, src) {
  const n = g.pts.length, dist = new Float64Array(n).fill(Infinity), prev = new Int32Array(n).fill(-1), done = new Uint8Array(n);
  const h = [];
  const push = (d, i) => { h.push([d, i]); let k = h.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (h[p][0] <= h[k][0]) break; [h[p], h[k]] = [h[k], h[p]]; k = p; } };
  const pop = () => {
    const top = h[0], last = h.pop();
    if (h.length) { h[0] = last; let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < h.length && h[l][0] < h[m][0]) m = l; if (r < h.length && h[r][0] < h[m][0]) m = r; if (m === k) break; [h[m], h[k]] = [h[k], h[m]]; k = m; } }
    return top;
  };
  dist[src] = 0; push(0, src);
  while (h.length) {
    const [d, u] = pop(); if (done[u]) continue; done[u] = 1;
    for (const [v, w] of g.adj[u]) { const nd = d + w; if (nd < dist[v]) { dist[v] = nd; prev[v] = u; push(nd, v); } }
  }
  return { dist, prev };
}

function pointInRing(r, x, z) {
  let inside = false;
  for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
    const xi = r[i], zi = r[i + 1], xj = r[j], zj = r[j + 1];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi || 1e-12) + xi) inside = !inside;
  }
  return inside;
}

export class DropModel {
  /**
   * model: the WaterModel. streams: its streams (FlowParticles.streams). nets: one per slab with rivers,
   * { slab: Slab, R } (R from parseRivers). countyAt(x, z): county index or -1. lakes: features.lakes.
   */
  constructor(model, streams, nets, { countyAt, lakes = [], slabMove = {} }) {
    this.m = model; this.streams = streams; this.countyAt = countyAt;
    this.nets = nets.map((n) => ({ ...n, name: n.slab.name }));
    this.lakes = lakes; this.slabMove = slabMove;
    this.ready = false;
  }
  netAt(x, z) { return this.nets.find((N) => N.slab.contains(x, z)) || null; }
  lonLat(N, x, z) { const f = INVERSE[N.name]; return f ? f(x - N.slab.offset[0], z - N.slab.offset[1]) : [0, 0]; }
  kmPerUnit(N) { return N.slab.mpu / 1000; }

  // ------------------------------------------------------------------ tables
  prepare() {
    if (this.ready) return this;
    for (const N of this.nets) this._index(N);
    this._lakes();
    this._place();
    for (const N of this.nets) this._flows(N);
    this.ready = true;
    return this;
  }
  /** a grid of river vertices for finding the nearest river, and each vertex's reach (the river layer's own, if given) */
  _index(N) {
    const R = N.R;
    if (N.grid && N.reachOf && N.cell) { N.key = (i, j) => `${i},${j}`; N.cellSize = N.cell; }
    else {
      const grid = new Map(), reachOf = new Uint32Array(R.nv);
      for (let r = 0; r < R.n; r++) for (let k = 0; k < R.nvs[r]; k++) {
        const v = R.start[r] + k; reachOf[v] = r;
        const key = Math.floor(R.x[v] / CELL) * 100003 + Math.floor(R.z[v] / CELL);
        let a = grid.get(key); if (!a) grid.set(key, (a = [])); a.push(v);
      }
      N.grid = grid; N.reachOf = reachOf; N.key = (i, j) => i * 100003 + j; N.cellSize = CELL;
    }
    // flow order: upstream reaches first (further from the outlet), and in the United States or not
    N.order = Uint32Array.from({ length: R.n }, (_, i) => i).sort((a, b) => R.dd[b] - R.dd[a]);
    const us = new Uint8Array(R.n);
    for (let r = 0; r < R.n; r++) { const n = R.nvs[r]; for (const k of n > 3 ? [0, n >> 2, n >> 1, (3 * n) >> 2, n - 1] : [0, n - 1]) { const v = R.start[r] + k; if (this.countyAt(R.x[v], R.z[v]) >= 0) { us[r] = 1; break; } } }
    // whether the United States lies anywhere downstream: once it does not, the drop has left for good
    const usDown = new Uint8Array(R.n);
    for (let q = R.n - 1; q >= 0; q--) { const r = N.order[q], nx = R.next[r]; usDown[r] = us[r] || (nx >= 0 && usDown[nx]) ? 1 : 0; }
    N.us = us; N.usDown = usDown;
  }
  /** the nearest river vertex within `radiusKm` of a point (on a reach with at least `minQ` m3/s): { N, r, v, x, z, d (km) } */
  nearest(x, z, radiusKm, N = this.netAt(x, z), minQ = 0) {
    if (!N || !N.grid) return null;
    const R = N.R, rad = radiusKm / this.kmPerUnit(N), c = N.cellSize;
    const i0 = Math.floor((x - rad) / c), i1 = Math.floor((x + rad) / c), j0 = Math.floor((z - rad) / c), j1 = Math.floor((z + rad) / c);
    let best = -1, bd = rad;
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const a = N.grid.get(N.key(i, j)); if (!a) continue;
      for (const v of a) { const d = Math.hypot(R.x[v] - x, R.z[v] - z); if (d <= bd && (!minQ || R.q[N.reachOf[v]] >= minQ)) { bd = d; best = v; } }
    }
    if (best < 0) return null;
    return { N, r: N.reachOf[best], v: best, x: R.x[best], z: R.z[best], d: bd * this.kmPerUnit(N) };
  }
  /** the biggest river within `radiusKm` of a point: the vertex of the reach with the most natural flow there */
  biggest(x, z, radiusKm, N = this.netAt(x, z)) {
    if (!N || !N.grid) return null;
    const R = N.R, rad = radiusKm / this.kmPerUnit(N), c = N.cellSize;
    // (each cell's biggest flow, so that the cells are searched biggest first and the search stops early)
    if (!N.cellMax) {
      N.cellMax = new Map();
      for (const [k, a] of N.grid) { let b = 0; for (const v of a) { const q = R.q[N.reachOf[v]]; if (q > b) b = q; } N.cellMax.set(k, b); }
    }
    const i0 = Math.floor((x - rad) / c), i1 = Math.floor((x + rad) / c), j0 = Math.floor((z - rad) / c), j1 = Math.floor((z + rad) / c);
    const cells = [];
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const k = N.key(i, j), mx = N.cellMax.get(k); if (mx != null) cells.push([mx, k]); }
    cells.sort((p, q) => q[0] - p[0]);
    let best = -1, bq = -1, bd = Infinity;
    for (const [mx, k] of cells) {
      if (mx < bq) break;
      for (const v of N.grid.get(k)) {
        const d = Math.hypot(R.x[v] - x, R.z[v] - z); if (d > rad) continue;
        const q = R.q[N.reachOf[v]];
        if (q > bq || (q === bq && d < bd)) { bq = q; bd = d; best = v; }
      }
    }
    if (best < 0) return null;
    return { N, r: N.reachOf[best], v: best, x: R.x[best], z: R.z[best], d: bd * this.kmPerUnit(N) };
  }
  /** lakes and reservoirs the rivers run through: which reaches are in each, and the reach each drains by */
  _lakes() {
    const polys = [], LCELL = 10, grid = new Map();
    this.lakes.forEach((l, li) => {
      if (!l.polys || !l.polys.length) return;
      const mv = this.slabMove[l.slab] || [0, 0];
      const rings = l.polys.map((p) => p.map((ring) => { const o = ring.slice(); for (let k = 0; k < o.length; k += 2) { o[k] += mv[0]; o[k + 1] += mv[1]; } return o; }));
      let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
      for (const p of rings) { const o = p[0]; for (let k = 0; k < o.length; k += 2) { x0 = Math.min(x0, o[k]); x1 = Math.max(x1, o[k]); z0 = Math.min(z0, o[k + 1]); z1 = Math.max(z1, o[k + 1]); } }
      const P = { li, l, rings, box: [x0, z0, x1, z1] };
      polys.push(P);
      // (a coarse grid of the lakes' boxes, for finding the few lakes near a point)
      for (let i = Math.floor(x0 / LCELL); i <= Math.floor(x1 / LCELL); i++) for (let j = Math.floor(z0 / LCELL); j <= Math.floor(z1 / LCELL); j++) {
        const key = i * 100003 + j; let a = grid.get(key); if (!a) grid.set(key, (a = [])); a.push(P);
      }
    });
    this.lakePolys = polys;
    this._lakeNearby = (x0, z0, x1, z1) => {
      const out = new Set();
      for (let i = Math.floor(x0 / LCELL); i <= Math.floor(x1 / LCELL); i++) for (let j = Math.floor(z0 / LCELL); j <= Math.floor(z1 / LCELL); j++) { const a = grid.get(i * 100003 + j); if (a) for (const P of a) out.add(P); }
      return out;
    };
    const inside = (P, x, z) => { if (x < P.box[0] || x > P.box[2] || z < P.box[1] || z > P.box[3]) return false; for (const p of P.rings) { if (pointInRing(p[0], x, z) && !p.slice(1).some((h) => pointInRing(h, x, z))) return true; } return false; };
    this._insideLake = inside;
    for (const N of this.nets) {
      const R = N.R, lakeOf = new Int32Array(R.n).fill(-1);
      for (let r = 0; r < R.n; r++) {
        const v = R.start[r] + (R.nvs[r] >> 1), x = R.x[v], z = R.z[v];
        const a = grid.get(Math.floor(x / LCELL) * 100003 + Math.floor(z / LCELL)); if (!a) continue;
        for (const P of a) if (inside(P, x, z)) { lakeOf[r] = P.li; break; }
      }
      // each lake drains by the reach in it whose next reach is outside it (the biggest, where there are several)
      const out = new Map();
      for (let r = 0; r < R.n; r++) {
        const L = lakeOf[r]; if (L < 0) continue;
        const nx = R.next[r];
        if (nx >= 0 && lakeOf[nx] === L) continue;
        const o = out.get(L); if (o == null || R.q[r] > R.q[o]) out.set(L, r);
      }
      N.lakeOf = lakeOf; N.lakeOut = out;
    }
  }
  /** the lake whose shore is within `km` of a point (only lakes a river runs through, unless `any`) */
  lakeNear(N, x, z, km, any = false) {
    const rad = km / this.kmPerUnit(N);
    let best = -1, bd = rad;
    for (const P of this._lakeNearby(x - rad, z - rad, x + rad, z + rad)) {
      if (any ? !P.l.name : !N.lakeOut.has(P.li)) continue;
      const b = P.box; if (x < b[0] - rad || x > b[2] + rad || z < b[1] - rad || z > b[3] + rad) continue;
      if (this._insideLake(P, x, z)) return P.li;
      for (const p of P.rings) for (const r of p) for (let k = 0; k + 3 < r.length; k += 2) {
        const ax = r[k], az = r[k + 1], ex = r[k + 2] - ax, ez = r[k + 3] - az;
        // (an edge whose box is further than the best so far cannot be nearer)
        if (Math.min(ax, ax + ex) > x + bd || Math.max(ax, ax + ex) < x - bd || Math.min(az, az + ez) > z + bd || Math.max(az, az + ez) < z - bd) continue;
        const t = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / (ex * ex + ez * ez || 1)));
        const d = Math.hypot(x - ax - t * ex, z - az - t * ez);
        if (d < bd) { bd = d; best = P.li; }
      }
    }
    return best;
  }
  /** what share of a stream's water its use consumes, and whether anyone has estimated it */
  consumed(s) {
    if (!this._cons) this._cons = new WeakMap();
    let c = this._cons.get(s);
    if (!c) { c = this._consumed(s); this._cons.set(s, c); }
    return c;
  }
  _consumed(s) {
    if (s.cat === 'pt') {
      const p = s.plant || {}, src = p.src || {};
      const W = (src.sf || 0) + (src.ss || 0) + (src.gf || 0) + (src.gs || 0) + (src.rec || 0) + (src.ps || 0);
      return { f: W > 0 ? Math.min(p.c || 0, W) / W : 0, est: true };
    }
    if (s.cat === 'ir' || s.cat === 'go') {
      const c = this.m.county(s.county), W = c.W[s.cat] + (s.cat === 'ir' ? c.other.ir_rec : c.other.go_rec);
      return { f: W > 0 ? Math.min(c.cu[s.cat], W) / W : 0, est: true };
    }
    const d = DROP_CONSUMED[s.cat];
    return d ? { f: d.share, est: true } : { f: 0, est: false };
  }
  /**
   * Every surface intake, placed on the river it draws from: a county's intakes on its rivers' reaches (the map's own
   * anchors), lake shores on the lake, a plant's intake where the plant model puts it, a system's reservoirs and
   * aqueduct intakes where they are. Where a county's water reaches its users by canal (the dry West), its intakes go
   * on the county's rivers, since the map does not know where each canal begins.
   */
  _place() {
    const m = this.m, A = m.anchors, wts = (list) => { const w = list.map((p) => (p.length > 2 ? Math.sqrt(p[2] || 1) : 1)); const t = w.reduce((a, b) => a + b, 0) || 1; return w.map((x) => x / t); };
    for (const N of this.nets) { N.take = new Map(); N.W = new Float64Array(N.R.n + this.lakes.length); N.dep = new Float64Array(N.R.n + this.lakes.length); }
    this.unplaced = 0; this.placed = 0;
    // (the points along canals the model draws a county's surface water from, main.js)
    const canalPts = new Set();
    for (const mm of [m.canals, m.farmCanals]) if (mm) for (const arr of mm.values()) for (const p of arr) canalPts.add(p);
    const put = (N, node, s, v, at, vtx) => {
      let a = N.take.get(node); if (!a) N.take.set(node, (a = []));
      a.push({ s, v, at, vtx });
      N.W[node] += v;
      N.dep[node] += s.route ? v : v * this.consumed(s).f;
      this.placed += v;
    };
    // a point on a river or lake shore -> the node the water is taken at (a reach, or a lake as a whole)
    const nodeAt = (x, z, km, lakeFirst) => {
      const N = this.netAt(x, z); if (!N) return null;
      if (lakeFirst) { const L = this.lakeNear(N, x, z, 3); if (L >= 0) return { N, node: N.R.n + L, lake: L, vtx: -1 }; }
      const h = this.nearest(x, z, km, N); if (!h) return null;
      const L = N.lakeOf[h.r];
      if (L >= 0 && N.lakeOut.has(L)) return { N, node: N.R.n + L, lake: L, vtx: h.v };
      return { N, node: h.r, lake: -1, vtx: h.v };
    };
    // the measured diversions (core/flows_data.js DROP_DIVERSIONS): where their water goes, what the receiving counties'
    // own intakes lose for it, and the Central Arizona Project's whole pumping in place of the part of it the map routes
    const plans = this._plan();
    const skip = new Set(), cut = new Map();
    for (const P of plans) for (const t of P.to) {
      if (t.cat === 'wl') continue;
      const key = `${t.i}|${t.cat}`;
      if (t.p.replace) skip.add(key); else cut.set(key, (cut.get(key) || 0) + t.v);
    }
    let capScale = 1;
    for (const d of DROP_DIVERSIONS) {
      if (d.imp) {
        const routed = this.streams.filter((s) => s.imp && s.xfer === d.imp && s.kind === KIND.intake).reduce((a, s) => a + s.vol, 0);
        const f = AQ_FLOWS[d.aq];
        if (f && routed > 0) capScale = f.mgd / routed;
      }
    }
    const cutLeft = new Map();
    for (const [k, v] of cut) {
      const [i, cat] = k.split('|');
      const own = this.streams.filter((s) => s.county === +i && s.cat === cat && s.kind === KIND.intake && !s.well && !s.route && (s.src === SRC.river || s.src === SRC.lake)).reduce((a, s) => a + s.vol, 0);
      cutLeft.set(k, own > 0 ? Math.max(0, own - v) / own : 1);
    }
    // a stream's water, split among points the way its channels are, each on the river or lake it is nearest
    const place = (pts, vol, km, lakeFirst, s) => {
      const w = wts(pts);
      pts.forEach((p, j) => {
        const v = vol * w[j]; if (!(v > 0)) return;
        const at = nodeAt(p[0], p[1], km, lakeFirst);
        if (!at) { this.unplaced += v; return; }
        put(at.N, at.node, s, v, [p[0], p[1]], at.vtx);
      });
    };
    // a county's surface water from its rivers, taken where it is used: the share of its places of use within 30 km of
    // the county's big rivers (the map's anchors) from those, and the share of those further away from the biggest
    // river within 30 km of each (the farms around Panguitch, Utah, on the Sevier, not on the Colorado in Glen Canyon,
    // where Garfield County's anchors are)
    const big = new Map();   // (many streams share a county's places of use)
    const local = (pts, vol, s) => {
      const to = s.to && s.to.length ? s.to : null, N0 = to && this.netAt(to[0][0], to[0][1]);
      if (!N0) return place(pts, vol, 4, false, s);
      const far = 30 / this.kmPerUnit(N0);
      let kept = 0;
      for (const q of to) {
        let h = null;
        if (!pts.some((p) => Math.hypot(p[0] - q[0], p[1] - q[1]) <= far)) {
          const k = `${q[0]},${q[1]}`;
          if (!big.has(k)) big.set(k, this.biggest(q[0], q[1], 30));
          h = big.get(k);
        }
        if (!h) { kept++; continue; }
        const L = h.N.lakeOf[h.r], node = L >= 0 && h.N.lakeOut.has(L) ? h.N.R.n + L : h.r;
        put(h.N, node, s, vol / to.length, [h.x, h.z], h.v);
      }
      if (kept) place(pts, vol * kept / to.length, 4, false, s);
    };
    for (const s of this.streams) {
      if (s.kind !== KIND.intake || s.well || !(s.vol > 0)) continue;
      if (s.src !== SRC.river && s.src !== SRC.lake) continue;
      const key = `${s.county}|${s.cat}`;
      if (!s.route && skip.has(key)) continue;
      let scale = s.imp && s.xfer === 'cap' ? capScale : !s.route && cutLeft.has(key) ? cutLeft.get(key) : 1;
      let pts, km = 4, lakeFirst = s.src === SRC.lake && !s.plant;
      if (s.route) {
        // a system's water: its reservoir or aqueduct intake (on the lake, where there is one), or, where it leaves
        // from a county's own water works, that county's own rivers
        const own = !(s.res || s.imp);
        pts = own && A[s.exporter] && A[s.exporter].riv.length ? A[s.exporter].riv : [s.from[0]];
        lakeFirst = !own; km = 8;
      } else if (s.plant) {
        pts = [s.from[0]]; km = 8; lakeFirst = !!(s.plant.intake && s.plant.intake.kind === 'lake');
      } else {
        const a = A[s.county];
        const onCanal = s.from.length && canalPts.has(s.from[0]);
        pts = onCanal && a && a.riv.length ? a.riv : s.from;
        if (s.src === SRC.lake) {
          km = 12;
          // the map draws part of the surface water of every county on a lake from the lake. A drop is taken from the
          // lake only for the county's places of use near its shore (within 10 km); the rest of that water is taken
          // from the county's rivers (the Carson Valley's farms draw on the Carson River, not on Lake Tahoe)
          if (!onCanal && a && a.riv.length && s.to && s.to.length) {
            const r = 10 / this.kmPerUnit(this.netAt(s.from[0][0], s.from[0][1]) || this.nets[0]);
            const near = s.to.filter((q) => s.from.some((p) => Math.hypot(p[0] - q[0], p[1] - q[1]) <= r)).length / s.to.length;
            if (near < 1) {
              local(a.riv, s.vol * scale * (1 - near), s);
              if (near > 0) place(pts, s.vol * scale * near, km, lakeFirst, s);
              continue;
            }
          }
        } else if (!onCanal) { local(pts, s.vol * scale, s); continue; }
      }
      place(pts, s.vol * scale, km, lakeFirst, s);
    }
    // the measured diversions themselves, taken where their canals meet the river
    this.diversions = [];
    for (const P of plans) {
      for (const t of P.to) put(P.N, P.node, t.s, t.v, P.intake, P.vtx);
      this.diversions.push({ d: P.d, node: P.node, N: P.N, mgd: P.mgd, to: P.to });
    }
  }
  /**
   * The measured diversions that are not in the map's own flows (DROP_DIVERSIONS): for each, where its canal meets the
   * river, how much it takes, and a stream of its own to each place its water goes, along its canals.
   * Returns [{ d, N, node, vtx, intake, mgd, to: [{ i, cat, v, p, s }] }].
   */
  _plan() {
    const m = this.m, plans = [], graphs = new Map();
    const surf = (i, cat) => { const c = m.county(i); return (c.src[cat] && c.src[cat].sf) || 0; };
    for (const d of DROP_DIVERSIONS) {
      if (d.imp) continue;
      const f = AQ_FLOWS[d.aq], aq = m.features.aqueducts.filter((a) => a.name === d.aq);
      if (!f || !aq.length) continue;
      const mgd = d.af ? d.af * AF_MGD : f.mgd;
      // where the canal meets a big river: its vertex nearest one (natural flow at least 50 m3/s)
      let best = null;
      for (const a of aq) for (const sg of a.segs) for (let k = 0; k < sg.p.length; k += 2) {
        const x = sg.p[k], z = sg.p[k + 1], N = this.netAt(x, z); if (!N) continue;
        const h = this.nearest(x, z, 12, N, 50); if (!h) continue;
        if (!best || h.d < best.h.d) best = { x, z, h, N };
      }
      if (!best) continue;
      const N = best.N, R = N.R;
      let r = best.h.r, intake = [best.x, best.z], vtx = best.h.v;
      if (d.mainQ) {
        for (let g = 0; g < 200 && R.q[r] < d.mainQ && R.next[r] >= 0; g++) r = R.next[r];
        // the canal's head: its point nearest the reach it takes from
        let bd = Infinity;
        for (const a of aq) for (const sg of a.segs) for (let k = 0; k < sg.p.length; k += 2) {
          for (let q = 0; q < R.nvs[r]; q++) {
            const v = R.start[r] + q, dd = Math.hypot(R.x[v] - sg.p[k], R.z[v] - sg.p[k + 1]);
            if (dd < bd) { bd = dd; intake = [sg.p[k], sg.p[k + 1]]; vtx = v; }
          }
        }
      }
      const L = N.lakeOf[r], node = L >= 0 && N.lakeOut.has(L) ? R.n + L : r;
      // the canals, and the ways along them from the intake
      const way = (names) => {
        const key = names.join('|');
        if (!graphs.has(key)) {
          const g = canalGraph(m.features.aqueducts, names);
          let src = 0, bd = Infinity;
          g.pts.forEach((p, i) => { const dd = Math.hypot(p[0] - intake[0], p[1] - intake[1]); if (dd < bd) { bd = dd; src = i; } });
          const { dist, prev } = shortest(g, src);
          const live = []; for (let i = 0; i < g.pts.length; i++) if (dist[i] < Infinity) live.push(i);
          graphs.set(key, { g, dist, prev, live, county: live.map((i) => this.countyAt(g.pts[i][0], g.pts[i][1])) });
        }
        return graphs.get(key);
      };
      // how much goes to each place: measured parts first, the rest shared by weight
      const parts = d.parts || [];
      const fixed = parts.reduce((a, p) => a + (p.af ? p.af * AF_MGD : 0), 0);
      const wsum = parts.reduce((a, p) => a + (p.af ? 0 : p.w || 0), 0);
      const left = Math.max(0, mgd - fixed), to = [];
      for (const p of parts) {
        const v = p.af ? p.af * AF_MGD : wsum > 0 ? left * p.w / wsum : 0;
        const cats = [].concat(p.cat), ids = (p.to || [p.fips]).map((fp) => m.ix.get(fp)).filter((i) => i != null);
        const pieces = [];
        for (const i of ids) for (const cat of cats) pieces.push({ i, cat, w: ids.length * cats.length > 1 ? surf(i, cat) : 1 });
        const pw = pieces.reduce((a, q) => a + q.w, 0);
        for (const q of pieces) if (q.w > 0 && v * q.w / pw > 0) to.push({ ...q, v: v * q.w / pw, p });
      }
      // a canal's far end: of its points, the one furthest along the way from the intake
      const farEnd = (W, name) => {
        const on = new Set();
        for (const a of m.features.aqueducts) if (a.name === name) for (const sg of a.segs) for (let k = 0; k < sg.p.length; k += 2) on.add(`${sg.p[k]},${sg.p[k + 1]}`);
        let far = -1;
        for (const i of W.live) if (on.has(`${W.g.pts[i][0]},${W.g.pts[i][1]}`) && (far < 0 || W.dist[i] > W.dist[far])) far = i;
        return far;
      };
      // where each part's water is used, and the way there along the canals
      for (const t of to) {
        const W = way(t.p.via || d.via || [d.aq]), { g, prev, live } = W;
        const a = m.anchors[t.i] || {};
        const list = t.cat === 'ps' ? (a.wtp && a.wtp.length ? a.wtp : a.urban) : t.cat === 'wl' ? null : (a.crop && a.crop.length ? a.crop : a.land);
        const nearV = (x, z) => { let b = live[0], bd = Infinity; for (const i of live) { const dd = Math.hypot(g.pts[i][0] - x, g.pts[i][1] - z); if (dd < bd) { bd = dd; b = i; } } return { v: b, d: bd }; };
        const terms = (t.p.ends || []).map((nm) => farEnd(W, nm)).filter((i) => i >= 0);
        let v, dest;
        if (t.p.at) {
          dest = projectLower48(t.p.at[0], t.p.at[1]); v = nearV(dest[0], dest[1]).v;
        } else if (terms.length) {
          // where the canals named end: the county's fields or water works nearest one of those ends, or the end itself
          v = terms[0]; dest = g.pts[v];
          if (list && list.length) {
            let bd = Infinity;
            for (const e of terms) for (const q of list) { const dd = Math.hypot(q[0] - g.pts[e][0], q[1] - g.pts[e][1]); if (dd < bd) { bd = dd; dest = q; v = e; } }
          }
        } else if (list && list.length) {
          // the fields or water works nearest the canals
          let bd = Infinity;
          for (const q of list) { const h = nearV(q[0], q[1]); if (h.d < bd) { bd = h.d; dest = q; v = h.v; } }
        } else {
          let far = -1;
          live.forEach((i, k) => { if (W.county[k] === t.i && (far < 0 || W.dist[i] > W.dist[far])) far = i; });
          v = far >= 0 ? far : live[live.length - 1]; dest = g.pts[v];
        }
        const along = [];
        for (let k = v; k >= 0; k = prev[k]) along.push(g.pts[k]);
        along.reverse();
        const route = [intake, ...along];
        if (Math.hypot(dest[0] - g.pts[v][0], dest[1] - g.pts[v][1]) > 0.05) route.push([dest[0], dest[1]]);
        t.s = { county: t.i, cat: t.cat, kind: KIND.intake, src: SRC.river, vol: t.v, from: [intake], to: [[dest[0], dest[1]]], route, xfer: `div:${d.aq}`, div: d, who: t.p.who || d.who };
      }
      plans.push({ d, N, node, vtx, intake, mgd, to });
    }
    return plans;
  }
  /** the flow past each reach: its natural flow less what was consumed or piped away upstream */
  _flows(N) {
    const R = N.R, n = R.n, up = new Float64Array(n), Q = new Float64Array(n + this.lakes.length);
    for (let q = 0; q < n; q++) {
      const r = N.order[q];
      const nx = R.next[r];
      // (a lake's water is taken as it passes its outlet)
      const L = N.lakeOf[r];
      const own = N.dep[r] + (L >= 0 && N.lakeOut.get(L) === r ? N.dep[n + L] : 0);
      if (nx >= 0) up[nx] += up[r] + own;
    }
    const nat = (r) => R.q[r] * MGD_PER_CMS;
    for (let r = 0; r < n; r++) Q[r] = Math.max(nat(r) - up[r], 0.03 * nat(r));
    for (const [L, r] of N.lakeOut) Q[n + L] = Math.max(nat(r) - up[r], 0.03 * nat(r));
    N.up = up; N.Q = Q;
  }

  // ------------------------------------------------------------------ the walk
  /** where a drop dropped at (x, z) enters the rivers: the nearest river the map draws within `km` */
  start(x, z, km = 64) {
    if (!this.ready) this.prepare();
    const h = this.nearest(x, z, km);
    if (!h) return null;
    return { ...h, from: [x, z] };
  }
  /** where the rivers from a start end if nothing is taken: _mouth's answer, or null where they leave the country */
  endOf(st) {
    const N = st.N, R = N.R;
    let r = st.r;
    for (let g = 0; g < 200000; g++) {
      const nx = R.next[r];
      if (nx < 0) return this._mouth(N, r);
      if (!N.usDown[nx]) return null;
      r = nx;
    }
    return null;
  }
  /** a return to the rivers near a point: the nearest reach, the sea, or the ground */
  _back(N, x, z) {
    const h = this.nearest(x, z, 24, N);
    if (h) return { N, r: h.r, v: h.v, x: h.x, z: h.z };
    const [lon, lat] = this.lonLat(N, x, z);
    const sea = this._seaNear(N, x, z, 12);
    return sea ? { sea: seaAt(N.name, lon, lat), x, z } : { ground: true, x, z };
  }
  _seaNear(N, x, z, km) {
    const rad = km / this.kmPerUnit(N), s = N.slab;
    for (let a = 0; a < 16; a++) for (const f of [0.25, 0.5, 1]) {
      const px = x + Math.cos(a * Math.PI / 8) * rad * f, pz = z + Math.sin(a * Math.PI / 8) * rad * f;
      if (!s.contains(px, pz)) continue;
      const m = s.maskAt(px, pz); if (!(m & 1) && !(m & 2)) return true;
    }
    return false;
  }
  /** the end of the rivers: the sea, a lake with no outlet, or the edge of the map */
  _mouth(N, r) {
    const R = N.R, v = R.start[r] + R.nvs[r] - 1, x = R.x[v], z = R.z[v];
    const [lon, lat] = this.lonLat(N, x, z);
    if (this._seaNear(N, x, z, 14)) return { kind: 'sea', name: seaAt(N.name, lon, lat), x, z };
    const L = N.lakeOf[r] >= 0 ? N.lakeOf[r] : this.lakeNear(N, x, z, 10, true);
    const l = L >= 0 ? this.lakes[L] : null;
    return { kind: 'sink', lake: l ? l.name : null, x, z };
  }
  /**
   * One drop's journey from a start (this.start), by the chances above. With `rec`, each step keeps the path the drop
   * took, for the map to draw. rnd: a random number generator.
   * Returns { steps: [{ type, ... }], end: { kind, ... }, uses }.
   */
  walk(st, rnd, rec = true, maxUses = 40) {
    const steps = [];
    let N = st.N, R = N.R, r = st.r, k = st.v - R.start[r];   // reach, vertex within it
    let skip = -1, seen = new Set(), uses = 0, path = rec ? [[st.from[0], st.from[1]], [st.x, st.z]] : null;
    if (rec) steps.push({ type: 'fall', at: st.from, to: [st.x, st.z], km: st.d, path: path.slice(), N, r });
    path = rec ? [[st.x, st.z]] : null;
    let km = 0, names = rec ? [] : null, dry = 0, total = 0;
    // (the rivers and lakes passed, for the words: a reach in a big lake goes by the lake's name, since the names the
    // rivers carry through the big lakes are the main inflow's)
    const note = (rr, len) => {
      if (!rec) return;
      const L = N.lakeOf[rr], lake = L >= 0 && this.lakes[L].name && this.lakes[L].area_km2 >= 400 ? this.lakes[L].name : null;
      const nm = lake || (R.name[rr] ? R.names[R.name[rr] - 1] : null);
      const last = names[names.length - 1];
      if (last && last.name === nm && last.lake === !!lake) last.km += len; else names.push({ name: nm, km: len, lake: !!lake });
    };
    const flush = () => { total += km; if (rec && path.length > 1) steps.push({ type: 'river', path, km, names, N }); path = rec ? [path[path.length - 1]] : null; km = 0; names = rec ? [] : null; };
    for (let guard = 0; guard < 200000; guard++) {
      { const nat = R.q[r] * MGD_PER_CMS; if (nat > 0 && N.up[r] / nat > dry) dry = N.up[r] / nat; }
      // a lake: everything taken from it, as the drop enters
      const L = N.lakeOf[r];
      const node = L >= 0 && N.lakeOut.has(L) ? R.n + L : r;
      const fresh = node >= R.n ? !seen.has(L) : node !== skip;
      if (L >= 0) seen.add(L);
      const W = N.W[node];
      if (fresh && W > 0 && uses < maxUses) {
        const p = Math.min(1, W / N.Q[node]);
        if (rnd() < p) {
          // which intake: in proportion to what each withdrew here
          const list = N.take.get(node);
          let u = rnd() * W, t = list[list.length - 1];
          for (const e of list) { u -= e.v; if (u <= 0) { t = e; break; } }
          // along the reach to the intake, if it is downstream of the drop
          if (rec && node < R.n && t.vtx >= 0 && N.reachOf[t.vtx] === r) {
            const kk = t.vtx - R.start[r];
            if (kk > k) { for (let q = k + 1; q <= kk; q++) path.push([R.x[R.start[r] + q], R.z[R.start[r] + q]]); km += R.lk[r] * (kk - k) / Math.max(1, R.nvs[r] - 1); note(r, R.lk[r] * (kk - k) / Math.max(1, R.nvs[r] - 1)); k = kk; }
          }
          flush();
          uses++;
          const s = t.s, c = this.consumed(s);
          const step = { type: 'take', s, at: t.at, lake: L >= 0 ? this.lakes[L] : null, p, W, Q: N.Q[node], N, from: rec ? [R.x[R.start[r] + k], R.z[R.start[r] + k]] : null };
          if (rec) steps.push(step);
          const gone = rnd() < c.f;
          const use = { type: 'use', s, consumed: gone, share: c.f, est: c.est, N };
          if (rec) steps.push(use);
          if (gone) return { steps, end: { kind: 'consumed', s, share: c.f }, uses, km: total, dry };
          // back to a river near where it was used
          const back = this._backFrom(N, s, rnd, t.at);
          if (rec) steps.push({ type: 'back', s, to: back, N });
          if (back.sea) return { steps, end: { kind: 'sea', name: back.sea, x: back.x, z: back.z, viaUse: true }, uses, km: total, dry };
          if (back.ground) return { steps, end: { kind: 'ground', x: back.x, z: back.z }, uses, km: total, dry };
          N = back.N; R = N.R; r = back.r; k = back.v - R.start[r];
          seen = new Set(); if (N.lakeOf[r] >= 0) seen.add(N.lakeOf[r]);
          skip = r;
          if (rec) path = [[back.x, back.z]];
          continue;
        }
      }
      // on down the reach
      if (rec) for (let q = k + 1; q < R.nvs[r]; q++) path.push([R.x[R.start[r] + q], R.z[R.start[r] + q]]);
      const len = R.lk[r] * (R.nvs[r] - 1 - k) / Math.max(1, R.nvs[r] - 1);
      km += len; note(r, len);
      const nx = R.next[r];
      if (nx < 0) {
        flush();
        const mouth = this._mouth(N, r);
        // (a river that runs off the edge of the map, rather than into the sea or a closed basin)
        const v = R.start[r] + R.nvs[r] - 1, s = N.slab, e = 2.5;
        if (mouth.kind === 'sink' && (R.x[v] < s.x0 + e || R.x[v] > s.x1 - e || R.z[v] < s.z0 + e || R.z[v] > s.z1 - e)) return { steps, end: { kind: 'edge', x: R.x[v], z: R.z[v] }, uses, km: total, dry };
        return { steps, end: mouth, uses, km: total, dry };
      }
      if (!N.usDown[nx]) {
        // across the border, with no more of the United States downstream
        if (rec) path.push([R.x[R.start[nx]], R.z[R.start[nx]]]);
        flush();
        const [lon, lat] = this.lonLat(N, R.x[R.start[nx]], R.z[R.start[nx]]);
        return { steps, end: { kind: 'border', country: N.name === 'conus' && lat < 36 ? 'Mexico' : 'Canada', x: R.x[R.start[nx]], z: R.z[R.start[nx]], river: R.name[nx] ? R.names[R.name[nx] - 1] : null }, uses, km: total, dry };
      }
      r = nx; k = 0; skip = -1;
    }
    flush();
    return { steps, end: { kind: 'lost' }, uses, km: total, dry };
  }
  /**
   * where water goes back after its use: a utility's wastewater plant, a plant's outfall, or the county's rivers, the
   * one nearest the place the water was used (for a diversion) or taken (`from`, the intake)
   */
  _backFrom(N, s, rnd, from = null) {
    const a = this.m.anchors[s.county] || {};
    // (a diversion's water goes back near the place it was used, which can be far from the county's rivers: the
    // Imperial Valley drains to the Salton Sea, not the Colorado)
    const div = s.div && s.to && s.to[0], near = div || from;
    const one = (list) => {
      if (!list || !list.length) return null;
      if (!near) return list[Math.floor(rnd() * list.length)];
      let b = list[0], bd = Infinity;
      for (const q of list) { const d = Math.hypot(q[0] - near[0], q[1] - near[1]); if (d < bd) { bd = d; b = q; } }
      return b;
    };
    if (div && s.cat !== 'ps') {
      // the river nearest the fields or refuges, where there is one
      const b = this._back(this.netAt(div[0], div[1]) || N, div[0], div[1]);
      if (!b.ground) return b;
    }
    let p = null;
    if (s.cat === 'pt' && s.plant) p = s.plant.outfall ? [s.plant.outfall.x, s.plant.outfall.z] : [s.plant.x, s.plant.z];
    else if (s.cat === 'ps') p = one(a.wwtp) || one(a.ret) || (s.to && s.to[0]);
    else p = one(a.ret) || one(a.riv) || (s.to && s.to[0]);
    if (!p) return { ground: true, x: 0, z: 0 };
    const M = this.netAt(p[0], p[1]) || N;
    return this._back(M, p[0], p[1]);
  }
  /**
   * The odds for drops entering the rivers at a start: n journeys, counted by how they ended.
   * Returns { n, ends: Map(key -> { kind, label, count, cat }), used (taken at least once), uses (total) }.
   */
  odds(st, n = 1000, seed = 1) {
    let a = seed >>> 0;
    const rnd = () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const ends = new Map();
    let used = 0, uses = 0, dry = 0;
    for (let i = 0; i < n; i++) {
      const j = this.walk(st, rnd, false);
      if (j.uses > 0) used++;
      if (j.dry > dry) dry = j.dry;
      uses += j.uses;
      const e = j.end;
      const key = e.kind === 'consumed' ? `c:${e.s.cat}` : e.kind === 'sea' ? `s:${e.name}` : e.kind === 'sink' ? `k:${e.lake || ''}` : e.kind === 'border' ? `b:${e.country}` : e.kind;
      const o = ends.get(key) || { key, kind: e.kind, count: 0, cat: e.kind === 'consumed' ? e.s.cat : null, name: e.name || e.lake || e.country || null };
      o.count++; ends.set(key, o);
    }
    return { n, ends, used, uses, dry };
  }
}
