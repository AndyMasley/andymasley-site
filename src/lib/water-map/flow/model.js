import { fetchPacked, fetchJSON } from '../core/assets.js';
import { SLAB_MOVE, plantName } from '../core/config.js';
import { TRANSFERS, IMPORTS, RATIO_FIX } from '../core/transfers.js';
import { aqGraph, aqPath } from './aqroute.js';

/**
 * The water budget: USGS 2015 county estimates (Dieter et al. 2018 data release, version 2.0) plus the USGS 2015
 * thermoelectric plant model (Harris & Diehl). Volumes are million gallons per day (Mgal/d).
 *
 * Every flow the map draws is a stream: a volume moving from a kind of source to a kind of use, or from a use to a
 * fate. Consumptive use (water that evaporates or is otherwise removed) is only estimated by USGS for irrigation and
 * thermoelectric power in 2015; for the other uses the map stops at the use.
 *
 * Irrigation is split into crops and golf courses where USGS reported the split (35 states, DC and the USVI do; 15 states
 * and Puerto Rico report irrigation as one number, which stays under crops there).
 */

export const SRC = { river: 0, ground: 1, sea: 2, reclaimed: 3, delivered: 4, lake: 5 };
export const SRC_NAME = ['Rivers & reservoirs', 'Groundwater', 'Saline surface water', 'Reclaimed wastewater', 'Public-supply deliveries', 'Lakes'];
export const KIND = { intake: 0, vapor: 1, ret: 2, deliver: 3 };
export const CAT_KEYS = ['pt', 'ir', 'ps', 'in', 'aq', 'mi', 'do', 'li', 'go'];
const ANCHOR_TYPES = ['riv', 'ret', 'lake', 'sea', 'land', 'crop', 'urban', 'golf', 'wtp', 'wwtp'];
const SLAB_NAMES = ['conus', 'ak', 'hi', 'pr'];

function parseAnchors(buf) {
  const dv = new DataView(buf);
  const magic = String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3));
  const types = magic === 'ANC2' ? ANCHOR_TYPES : ANCHOR_TYPES.slice(0, 7);
  const n = dv.getUint32(4, true);
  let o = 8;
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    const slab = SLAB_NAMES[dv.getUint8(o)]; o += 1;
    const counts = []; for (let k = 0; k < types.length; k++) { counts.push(dv.getUint8(o)); o += 1; }
    const a = { slab };
    for (const t of ANCHOR_TYPES) a[t] = [];
    types.forEach((t, k) => {
      const arr = a[t];
      for (let j = 0; j < counts[k]; j++) {
        if (t === 'riv') { arr.push([dv.getFloat32(o, true), dv.getFloat32(o + 4, true), dv.getFloat32(o + 8, true)]); o += 12; }
        else { arr.push([dv.getFloat32(o, true), dv.getFloat32(o + 4, true)]); o += 8; }
      }
    });
    out[i] = a;
  }
  return out;
}

/** a route cut into pieces no longer than `step` world units, so channels and particles can follow the ground */
function densify(pts, step) {
  const out = [pts[0]];
  for (let q = 1; q < pts.length; q++) {
    const a = out[out.length - 1], b = pts[q], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (L < 1e-6) continue;
    const n = Math.max(1, Math.ceil(L / step));
    for (let k = 1; k <= n; k++) out.push(k === n ? b : [a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]);
  }
  return out;
}

export class WaterModel {
  async load() {
    const [wu, feats, anc, cdata] = await Promise.all([fetchJSON('wu.json'), fetchJSON('features.json'), fetchPacked('anchors.dat.png'), fetchJSON('county_data.json')]);
    this.wu = wu; this.features = feats; this.anchors = parseAnchors(anc); this.cdata = cdata;
    this._move();
    this.n = wu.id.length;
    this.plants = feats.plants; this.placeholders = feats.te_placeholders;
    // (plant names as a reader would say them; the EIA's own spelling stays searchable)
    for (const p of this.plants) { if (p.eia_name == null) { p.eia_name = p.name; p.name = plantName(p.name); } }
    this._derive();
    return this;
  }
  /** shift everything baked in the inset slabs to where the map now draws them */
  _move() {
    const mv = (o, xk = 'x', zk = 'z') => { const m = o && SLAB_MOVE[o.slab]; if (m) { o[xk] += m[0]; o[zk] += m[1]; } };
    for (const c of this.cdata) mv(c, 'cx', 'cz');
    for (const a of this.anchors) {
      const m = a && SLAB_MOVE[a.slab]; if (!m) continue;
      for (const k of Object.keys(a)) if (Array.isArray(a[k])) for (const p of a[k]) { p[0] += m[0]; p[1] += m[1]; }
    }
    const F = this.features;
    for (const l of F.lakes) mv(l, 'cx', 'cz');
    for (const d of F.dams) mv(d);
    for (const c of F.cities) mv(c);
    for (const h of F.te_placeholders) mv(h);
    for (const p of F.plants) {
      const m = SLAB_MOVE[p.slab]; if (!m) continue;
      p.x += m[0]; p.z += m[1];
      for (const q of [p.intake, p.outfall]) if (q) { q.x += m[0]; q.z += m[1]; }
    }
    for (const a of F.aqueducts) {
      const m = SLAB_MOVE[a.slab]; if (!m) continue;
      for (const sg of a.segs) for (let i = 0; i < sg.p.length; i += 2) { sg.p[i] += m[0]; sg.p[i + 1] += m[1]; }
    }
  }
  v(k, i) { const a = this.wu[k]; return a ? (a[i] || 0) : 0; }
  /** true where USGS reported crop and golf irrigation separately for this county's state */
  golfSplit(i) { const a = this.wu.ic_w; return !!(a && a[i] != null); }
  /** per-county budget by category: withdrawals by source, consumption, returns (Mgal/d) */
  county(i) {
    const v = (k) => this.v(k, i);
    const split = this.golfSplit(i);
    const c = {};
    c.ps = { sf: v('ps_sf'), ss: v('ps_ss'), gf: v('ps_gf'), gs: v('ps_gs') };
    c.do = { sf: v('do_sf'), gf: v('do_gf') };
    c.in = { sf: v('in_sf'), ss: v('in_ss'), gf: v('in_gf'), gs: v('in_gs') };
    c.ir = split ? { sf: v('ic_sf'), gf: v('ic_gf') } : { sf: v('ir_sf'), gf: v('ir_gf') };
    c.go = split ? { sf: v('ig_sf'), gf: v('ig_gf') } : { sf: 0, gf: 0 };
    c.li = { sf: v('li_sf'), gf: v('li_gf') };
    c.aq = { sf: v('aq_sf'), ss: v('aq_ss'), gf: v('aq_gf'), gs: v('aq_gs') };
    c.mi = { sf: v('mi_sf'), ss: v('mi_ss'), gf: v('mi_gf'), gs: v('mi_gs') };
    c.pt = { sf: v('po_sf') + v('pc_sf'), ss: v('po_ss') + v('pc_ss'), gf: v('po_gf') + v('pc_gf'), gs: v('po_gs') + v('pc_gs') };
    const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);
    const W = {}; for (const k of CAT_KEYS) W[k] = sum(c[k]);
    const cu = { ir: split ? v('ic_cu') : v('ir_cu'), go: split ? v('ig_cu') : 0, pt: v('po_cuf') + v('po_cus') + v('pc_cuf') + v('pc_cus') };
    const other = { ir_rec: split ? v('ic_rec') : v('ir_rec'), go_rec: split ? v('ig_rec') : 0, pt_rec: v('po_rec') + v('pc_rec'), pt_ps: v('po_ps') + v('pc_ps'), do_del: v('do_del') };
    const acres = { ir: split ? v('ic_ac') : v('ir_spr') + v('ir_mic') + v('ir_sur'), go: split ? v('ig_ac') : 0 };
    return { src: c, W, total: sum(W), cu, other, acres, split, pop: v('pop'), name: this.wu.name[i], st: this.wu.st[i], id: this.wu.id[i] };
  }
  _derive() {
    const n = this.n;
    this.ix = new Map(this.wu.id.map((f, i) => [f, i]));
    this.total = new Float32Array(n);
    this.byCat = CAT_KEYS.map(() => new Float32Array(n));
    this.national = this.aggregate(Array.from({ length: n }, (_, i) => i));
    for (let i = 0; i < n; i++) {
      const c = this.county(i);
      this.total[i] = c.total;
      CAT_KEYS.forEach((k, j) => { this.byCat[j][i] = c.W[k]; });
    }
    // states
    this.states = new Map();
    for (let i = 0; i < n; i++) { const st = this.wu.st[i]; let a = this.states.get(st); if (!a) this.states.set(st, (a = [])); a.push(i); }
    this.unsplitStates = [...this.states.keys()].filter((st) => !this.golfSplit(this.states.get(st)[0]) && this.aggregate(this.states.get(st)).W.ir > 0).sort();
    this.splitStates = [...this.states.keys()].filter((st) => this.golfSplit(this.states.get(st)[0])).sort();
    // in words: "36 states and DC", "14 states and Puerto Rico"
    const words = (list) => { const n = list.filter((s) => !['DC', 'PR', 'VI'].includes(s)).length, extra = list.filter((s) => ['DC', 'PR', 'VI'].includes(s) && (s !== 'VI' || this.aggregate(this.states.get(s)).W.ir > 0)); return `${n} states${extra.length ? ` and ${extra.map((s) => ({ DC: 'DC', PR: 'Puerto Rico', VI: 'the Virgin Islands' }[s])).join(' and ')}` : ''}`; };
    this.splitWords = words(this.splitStates); this.unsplitWords = words(this.unsplitStates);
    // California's 2015 irrigation figures divide 40 counties' water between wells and surface water in one statewide
    // proportion, about 70 percent groundwater (see "Imported water in the West" under the map), so for those counties
    // the split by source is not an estimate for the county itself
    this.propIr = new Set();
    for (const i of this.states.get('CA') || []) { const c = this.county(i), t = c.src.ir.gf + c.src.ir.sf; if (t > 0 && Math.abs(c.src.ir.gf / t - 0.7046) < 0.001) this.propIr.add(i); }
    // plants grouped by county
    this.plantsByCounty = new Map();
    for (const p of this.plants) { if (p.county < 0) continue; let a = this.plantsByCounty.get(p.county); if (!a) this.plantsByCounty.set(p.county, (a = [])); a.push(p); }
    // rank of each county by total withdrawals
    const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => this.total[b] - this.total[a]);
    this.rank = new Int32Array(n); order.forEach((c, r) => { this.rank[c] = r + 1; });
    // each county's estimated public-supply use: its domestic deliveries times its state's ratio of public-supply
    // withdrawals to domestic deliveries (see core/transfers.js)
    this.psDemand = new Float32Array(n);
    for (const [st, ids] of this.states) {
      let S = 0, Dd = 0; for (const i of ids) { S += this.county(i).W.ps; Dd += this.v('do_del', i); }
      const k = RATIO_FIX[st] ?? (Dd > 0 ? S / Dd : 0);
      for (const i of ids) this.psDemand[i] = this.v('do_del', i) * k;
    }
  }
  /** sum the budget over a set of counties: withdrawals by use and source, consumption, population */
  aggregate(ids) {
    const out = { W: Object.fromEntries(CAT_KEYS.map((k) => [k, 0])), bySrc: Object.fromEntries(CAT_KEYS.map((k) => [k, { sf: 0, ss: 0, gf: 0, gs: 0 }])),
      src: { sf: 0, ss: 0, gf: 0, gs: 0 }, cu: { ir: 0, go: 0, pt: 0 }, total: 0, pop: 0, acres: { ir: 0, go: 0 },
      other: { ir_rec: 0, go_rec: 0, pt_rec: 0, pt_ps: 0, do_del: 0 }, splitAll: true, splitAny: false };
    for (const i of ids) {
      const c = this.county(i);
      for (const k of CAT_KEYS) { out.W[k] += c.W[k]; for (const s in c.src[k]) { out.bySrc[k][s] += c.src[k][s]; out.src[s] += c.src[k][s]; } }
      out.cu.ir += c.cu.ir; out.cu.go += c.cu.go; out.cu.pt += c.cu.pt; out.total += c.total; out.pop += c.pop;
      out.acres.ir += c.acres.ir; out.acres.go += c.acres.go;
      for (const k in c.other) out.other[k] += c.other[k];
      if (c.W.ir > 0 || c.W.go > 0) { if (c.split) out.splitAny = true; else out.splitAll = false; }
    }
    return out;
  }
  /**
   * Streams for the particle system. Each stream: { county, cat, kind, src, vol, from: [[x,z],...], to: [[x,z],...],
   * depthFrom (groundwater starts below ground) }. Plants carry their own intake/outfall points.
   */
  streams() {
    const out = [];
    const A = this.anchors;
    // each county's public-water hub and built-up area, and its public-supply streams, for the transfers below
    const hubs = new Array(this.n), urbs = new Array(this.n), psIn = new Array(this.n), psDel = new Array(this.n);
    // each county's own surface intakes by use, and its fields, for the West's imported water (core/transfers.js IMPORTS)
    const inBy = new Array(this.n), fields = new Array(this.n);
    const pick = (a, ...types) => { for (const t of types) if (a[t] && a[t].length) return a[t]; return null; };
    const nearestTo = (list, x, z) => { let best = list[0], bd = Infinity; for (const p of list) { const d = (p[0] - x) ** 2 + (p[1] - z) ** 2; if (d < bd) { bd = d; best = p; } } return best; };
    for (let i = 0; i < this.n; i++) {
      const a = A[i]; if (!a) continue;
      const c = this.county(i);
      const riv = pick(a, 'riv', 'lake', 'land');
      const lake = a.lake && a.lake.length ? a.lake : null;
      // where a mapped canal or aqueduct runs through the county (the dry West), farms, towns and industry take their
      // surface water from it, not from rivers whose natural flow it has carried away (farms not from the aqueducts
      // built for cities, AQ_CITY in core/flows_data.js)
      const canal = this.canals && this.canals.get(i);
      const farmCanal = this.farmCanals ? this.farmCanals.get(i) : canal;
      const surf = (vol, k) => {   // rivers vs lake shores: the Great Lakes counties draw mostly from the lakes
        // (a town or a factory takes its canal water where the canal passes nearest it, not all along the canal)
        if (canal && (k === 'ps' || k === 'in')) return [[canalNear, vol, SRC.river]];
        if (farmCanal && (k === 'ir' || k === 'go' || k === 'li')) return [[farmCanal, vol, SRC.river]];
        if (!lake) return [[riv, vol, SRC.river]];
        const big = a.riv.length ? Math.max(...a.riv.map((r) => r[2])) : 0;
        const fl = big > 200 ? 0.3 : 0.75;
        return [[riv, vol * (1 - fl), SRC.river], [lake, vol * fl, SRC.lake]];
      };
      const sea = pick(a, 'sea', 'riv', 'land');
      const use = { ps: pick(a, 'urban', 'land'), do: pick(a, 'land'), in: pick(a, 'urban', 'land'), ir: pick(a, 'crop', 'land'),
        li: pick(a, 'crop', 'land'), aq: pick(a, 'riv', 'land'), mi: pick(a, 'land'), pt: pick(a, 'urban', 'land'), go: pick(a, 'golf', 'land') };
      // a county's public water system: intakes and wells feed a treatment plant (a mapped water works when the county
      // has one, otherwise a point near the middle of its built-up area), which then distributes the water to the city
      const urb = use.ps;
      let ux = 0, uz = 0; for (const p of urb) { ux += p[0]; uz += p[1]; } ux /= urb.length; uz /= urb.length;
      const plantPt = a.wtp.length ? nearestTo(a.wtp, ux, uz) : nearestTo(urb, ux, uz);
      const canalNear = canal ? canal.slice().sort((p, q) => ((p[0] - plantPt[0]) ** 2 + (p[1] - plantPt[1]) ** 2) - ((q[0] - plantPt[0]) ** 2 + (q[1] - plantPt[1]) ** 2)).slice(0, 3) : null;
      hubs[i] = plantPt; urbs[i] = urb;
      const first = out.length;
      // reclaimed water comes from a wastewater plant
      const wwtp = a.wwtp.length ? [nearestTo(a.wwtp, ux, uz)] : [plantPt];
      const LOCAL = { ir: 1, li: 1, do: 1, mi: 1, go: 1 };
      for (const k of CAT_KEYS) {
        if (k === 'pt') continue;   // power plants are handled one by one below
        const to = k === 'ps' ? [plantPt] : use[k];
        for (const [s, vol] of Object.entries(c.src[k])) {
          if (vol <= 0) continue;
          if (s === 'sf') { for (const [from, v2, st] of surf(vol, k)) if (v2 > 0) out.push({ county: i, cat: k, kind: KIND.intake, src: st, vol: v2, from, to, local: !!LOCAL[k] }); }
          else if (s === 'ss') out.push({ county: i, cat: k, kind: KIND.intake, src: SRC.sea, vol, from: sea, to });
          else out.push({ county: i, cat: k, kind: KIND.intake, src: SRC.ground, vol, from: to, to, well: true, sal: s === 'gs' });
        }
      }
      for (let q = first; q < out.length; q++) if (out[q].cat === 'ps') (psIn[i] || (psIn[i] = [])).push(out[q]);
      for (let q = first; q < out.length; q++) { const s = out[q]; if (s.kind !== KIND.intake || s.well || s.src === SRC.sea || s.src === SRC.reclaimed) continue; const o = inBy[i] || (inBy[i] = {}); (o[s.cat] || (o[s.cat] = [])).push(s); }
      fields[i] = use.ir;
      if (c.W.ps > 0 && urb.length > 1) { const d = { county: i, cat: 'ps', kind: KIND.deliver, src: SRC.delivered, vol: c.W.ps, from: [plantPt], to: urb }; out.push(d); psDel[i] = d; }
      // irrigation (crops, and golf courses where USGS split them): reclaimed water in, vapour up, the rest back
      for (const k of ['ir', 'go']) {
        const rec = k === 'ir' ? c.other.ir_rec : c.other.go_rec;
        if (rec > 0) out.push({ county: i, cat: k, kind: KIND.intake, src: SRC.reclaimed, vol: rec, from: wwtp, to: use[k], local: true });
        const W = c.W[k] + rec, cu = c.cu[k];
        if (cu > 0) out.push({ county: i, cat: k, kind: KIND.vapor, src: SRC.river, vol: Math.min(cu, W || cu), from: use[k], to: use[k] });
        const ret = Math.max(0, W - cu);
        if (ret > 0) out.push({ county: i, cat: k, kind: KIND.ret, src: SRC.river, vol: ret, from: use[k], to: pick(a, 'ret', 'riv', 'land'), spread: true });
      }
    }
    // thermoelectric power: one stream set per plant (county totals allocated to plants by the USGS plant model)
    const plantStreams = (p, county, loc) => {
      const at = [[loc.x, loc.z]];
      const intake = p.intake ? [[p.intake.x, p.intake.z]] : at;
      const outfall = p.outfall ? [[p.outfall.x, p.outfall.z]] : at;
      const src = p.src || {};
      const sw = (src.sf || 0), ss = (src.ss || 0), gw = (src.gf || 0) + (src.gs || 0), rec = (src.rec || 0), ps = (src.ps || 0);
      const kindSrc = p.intake && p.intake.kind === 'sea' ? SRC.sea : (p.intake && p.intake.kind === 'lake' ? SRC.lake : SRC.river);
      if (sw > 0) out.push({ county, cat: 'pt', kind: KIND.intake, src: kindSrc, vol: sw, from: intake, to: at, plant: p });
      if (ss > 0) out.push({ county, cat: 'pt', kind: KIND.intake, src: SRC.sea, vol: ss, from: intake, to: at, plant: p });
      if (src.gf > 0) out.push({ county, cat: 'pt', kind: KIND.intake, src: SRC.ground, vol: src.gf, from: at, to: at, well: true, plant: p });
      if (src.gs > 0) out.push({ county, cat: 'pt', kind: KIND.intake, src: SRC.ground, vol: src.gs, from: at, to: at, well: true, sal: true, plant: p });
      const a = this.anchors[county];
      // reclaimed water and water bought from a utility come by pipe from the plants nearest the power plant
      const near2 = (list) => list.slice().sort((q, r) => ((q[0] - loc.x) ** 2 + (q[1] - loc.z) ** 2) - ((r[0] - loc.x) ** 2 + (r[1] - loc.z) ** 2)).slice(0, 2);
      const ww = a && a.wwtp.length ? near2(a.wwtp) : a && a.urban.length ? near2(a.urban) : at;
      if (rec > 0 && a) out.push({ county, cat: 'pt', kind: KIND.intake, src: SRC.reclaimed, vol: rec, from: ww, to: at, plant: p });
      if (ps > 0 && a) out.push({ county, cat: 'pt', kind: KIND.intake, src: SRC.delivered, vol: ps, from: a.wtp.length ? near2(a.wtp) : a.urban.length ? near2(a.urban) : at, to: at, plant: p });
      const W = sw + ss + gw + rec + ps;
      const cu = Math.min(p.c || 0, W);
      if (cu > 0) out.push({ county, cat: 'pt', kind: KIND.vapor, src: SRC.river, vol: cu, from: at, to: at, plant: p, tower: /TOWER|COMPLEX/.test(p.cooling || '') });
      if (W - cu > 0) out.push({ county, cat: 'pt', kind: KIND.ret, src: kindSrc, vol: W - cu, from: at, to: outfall, plant: p });
    };
    for (const p of this.plants) if ((p.w || 0) > 0 && p.county >= 0) plantStreams(p, p.county, p);
    for (const h of this.placeholders) {
      const a = this.anchors[h.county];
      const loc = a && a.urban.length ? { x: a.urban[0][0], z: a.urban[0][1] } : { x: h.x, z: h.z };
      const near = a ? (h.src.ss ? (a.sea[0] || a.riv[0]) : (a.riv[0] || a.lake[0])) : null;
      const pseudo = { ...h, name: null, intake: near ? { kind: h.src.ss ? 'sea' : 'river', x: near[0], z: near[1] } : null, outfall: near ? { kind: 'river', x: near[0] + 0.05, z: near[1] + 0.05 } : null, cooling: 'unknown' };
      plantStreams(pseudo, h.county, loc);
    }
    this._transfers(out, hubs, urbs, psIn, psDel);
    this._imports(out, hubs, inBy, fields);
    return out;
  }

  /**
   * Water the big public systems move between counties (core/transfers.js): taken out of the counties it is withdrawn
   * in and drawn along the system's route to each county it serves, where it is piped on to the built-up area.
   * this.xIn / this.xOut list, by county, what came in and went out: { sys, from | to, vol }.
   */
  /** a route through its waypoints, along the mapped aqueducts wherever one joins two of them */
  _follow(way) {
    if (!this._aqg) this._aqg = aqGraph(this.features.aqueducts);
    const out = [way[0]];
    for (let i = 0; i + 1 < way.length; i++) {
      const a = way[i], b = way[i + 1];
      if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 1e-6) continue;
      const p = aqPath(this._aqg, a, b);
      if (p) for (let k = 1; k < p.length; k++) out.push(p[k]); else out.push(b);
    }
    return out;
  }
  /**
   * The West's imported water (core/transfers.js IMPORTS): USGS counts it in the county that receives it, as surface
   * water, so the county keeps its totals and that part of its surface intakes for the use starts at the aqueduct's
   * intake instead, drawn along the aqueduct. this.imp lists, by county, what came in: { sys, vol, cat, what }.
   */
  _imports(out, hubs, inBy, fields) {
    this.imp = new Map();
    for (const sys of IMPORTS) {
      for (const t of sys.to) {
        const i = this.ix.get(t.fips); if (i == null || !hubs[i]) continue;
        const cat = t.cat || 'ps';
        const surf = ((inBy[i] && inBy[i][cat]) || []).filter((s) => !s.route);
        const sfT = surf.reduce((a, s) => a + s.vol, 0), vol = Math.min(t.mgd, sfT);
        if (!(vol > 0.05)) continue;
        for (const s of surf) s.vol *= (sfT - vol) / sfT;
        let a = this.imp.get(i); if (!a) this.imp.set(i, (a = [])); a.push({ sys, vol, cat, what: t.what || sys.from });
        // (a county can take a system's water by its own way: t.at overrides the system's intakes and routes)
        const at = t.at || sys.at, wsum = at.reduce((q, x) => q + x[1], 0) || 1;
        for (const [pt, w, rk] of at) {
          const v = vol * w / wsum; if (v < 0.02) continue;
          const way = [pt, ...((sys.routes && sys.routes[rk]) || [])];
          const last = way[way.length - 1];
          // public supply ends at the county's water works; crops at the fields nearest the aqueduct's end
          let dest = hubs[i];
          if (cat !== 'ps' && fields[i] && fields[i].length) { let bd = Infinity; for (const f of fields[i]) { const d = (f[0] - last[0]) ** 2 + (f[1] - last[1]) ** 2; if (d < bd) { bd = d; dest = f; } } }
          const route = densify(this._follow([...way, dest]), 1.2);
          out.push({ county: i, cat, kind: KIND.intake, src: SRC.river, vol: v, from: [pt], to: [dest], route, xfer: sys.id, imp: true });
        }
      }
    }
  }
  _transfers(out, hubs, urbs, psIn, psDel) {
    this.xIn = new Map(); this.xOut = new Map(); this.xTaken = new Map();
    const push = (m, k, v) => { let a = m.get(k); if (!a) m.set(k, (a = [])); a.push(v); };
    const sent = new Float64Array(this.n), sentGw = new Float64Array(this.n);
    for (const sys of TRANSFERS) {
      const ex = sys.from.map((f) => ({ ...f, i: this.ix.get(f.fips) ?? -1 })).filter((f) => f.i >= 0 && hubs[f.i]);
      // the part of each county's public-supply withdrawals that is the system's: as given, or what is left after the
      // county's own estimated use
      for (const f of ex) { const W = this.county(f.i).W.ps; f.s = f.share != null ? Math.min(1, f.share) * W : Math.max(0, W - this.psDemand[f.i]); }
      const S = ex.reduce((a, f) => a + f.s, 0);
      const exSet = new Set(ex.map((f) => f.i));
      const tos = sys.to.map((t) => ({ ...t, i: this.ix.get(t.fips) ?? -1 })).filter((t) => t.i >= 0 && hubs[t.i]);
      for (const t of tos) {
        if (t.all) t.d = S;
        else if (t.mgd != null) t.d = t.mgd;
        else if (t.group && sys.groups) {
          const g = tos.filter((u) => u.group === t.group), pop = g.reduce((a, u) => a + this.v('ps_pop', u.i), 0);
          t.d = pop > 0 ? sys.groups[t.group] * this.v('ps_pop', t.i) / pop : 0;
        } else t.d = exSet.has(t.i) ? this.psDemand[t.i] : Math.max(0, this.psDemand[t.i] - this.county(t.i).W.ps);
      }
      const D = tos.reduce((a, t) => a + t.d, 0), M = Math.min(S, D);
      if (!(M > 0)) continue;
      for (const f of ex) for (const t of tos) {
        if (t.i === f.i) continue;   // what a system delivers where it withdrew the water stays there
        const vol = M * (f.s / S) * (t.d / D);
        if (vol < 0.05) continue;
        sent[f.i] += vol; if (sys.gw) sentGw[f.i] += vol;
        push(this.xOut, f.i, { sys, to: t.i, vol, what: f.what });
        push(this.xIn, t.i, { sys, from: f.i, vol, what: f.what });
        const hub = hubs[t.i], urb = urbs[t.i];
        // where the water leaves: the reservoirs given, or else the exporting county's own water works
        const at = f.at || [[hubs[f.i], 1, null]];
        const wsum = at.reduce((a, x) => a + x[1], 0) || 1;
        for (const [pt, w, rk] of at) {
          const v = vol * w / wsum; if (v < 0.02) continue;
          const route = densify(this._follow([pt, ...((sys.routes && sys.routes[rk]) || []), hub]), 1.2);
          out.push({ county: t.i, exporter: f.i, cat: 'ps', kind: KIND.intake, src: sys.gw ? SRC.ground : SRC.lake, vol: v, from: [pt], to: [hub], route, xfer: sys.id });
          if (urb && urb.length > 1) out.push({ county: t.i, cat: 'ps', kind: KIND.deliver, src: SRC.delivered, vol: v, from: [hub], to: urb, xferDel: sys.id });
        }
      }
    }
    // the exporting counties keep only what their systems did not send away: from surface water first, then wells
    for (let i = 0; i < this.n; i++) {
      const E = sent[i]; if (!(E > 0)) continue;
      const list = psIn[i] || [];
      const surf = list.filter((s) => !s.well), wells = list.filter((s) => s.well);
      const sfT = surf.reduce((a, s) => a + s.vol, 0), gwT = wells.reduce((a, s) => a + s.vol, 0);
      // (from surface water first, except what a groundwater system sent, which comes from wells first)
      const eg0 = Math.min(sentGw[i], gwT), es = Math.min(E - eg0, sfT), eg = Math.min(eg0 + (E - eg0 - es), gwT);
      this.xTaken.set(i, { sf: es, gw: eg });
      if (sfT > 0) for (const s of surf) s.vol *= (sfT - es) / sfT;
      if (gwT > 0) for (const s of wells) s.vol *= (gwT - eg) / gwT;
      const W = this.county(i).W.ps;
      if (psDel[i] && W > 0) psDel[i].vol *= Math.max(0, W - E) / W;
    }
  }
}
