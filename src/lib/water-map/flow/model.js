import { fetchPacked, fetchJSON } from '../core/assets.js';
import { SLAB_MOVE } from '../core/config.js';

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

export class WaterModel {
  async load() {
    const [wu, feats, anc, cdata] = await Promise.all([fetchJSON('wu.json'), fetchJSON('features.json'), fetchPacked('anchors.dat.png'), fetchJSON('county_data.json')]);
    this.wu = wu; this.features = feats; this.anchors = parseAnchors(anc); this.cdata = cdata;
    this._move();
    this.n = wu.id.length;
    this.plants = feats.plants; this.placeholders = feats.te_placeholders;
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
    // plants grouped by county
    this.plantsByCounty = new Map();
    for (const p of this.plants) { if (p.county < 0) continue; let a = this.plantsByCounty.get(p.county); if (!a) this.plantsByCounty.set(p.county, (a = [])); a.push(p); }
    // rank of each county by total withdrawals
    const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => this.total[b] - this.total[a]);
    this.rank = new Int32Array(n); order.forEach((c, r) => { this.rank[c] = r + 1; });
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
    const pick = (a, ...types) => { for (const t of types) if (a[t] && a[t].length) return a[t]; return null; };
    const nearestTo = (list, x, z) => { let best = list[0], bd = Infinity; for (const p of list) { const d = (p[0] - x) ** 2 + (p[1] - z) ** 2; if (d < bd) { bd = d; best = p; } } return best; };
    for (let i = 0; i < this.n; i++) {
      const a = A[i]; if (!a) continue;
      const c = this.county(i);
      const riv = pick(a, 'riv', 'lake', 'land');
      const lake = a.lake && a.lake.length ? a.lake : null;
      const surf = (vol) => {   // rivers vs lake shores: the Great Lakes counties draw mostly from the lakes
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
      // reclaimed water comes from a wastewater plant
      const wwtp = a.wwtp.length ? [nearestTo(a.wwtp, ux, uz)] : [plantPt];
      const LOCAL = { ir: 1, li: 1, do: 1, mi: 1, go: 1 };
      for (const k of CAT_KEYS) {
        if (k === 'pt') continue;   // power plants are handled one by one below
        const to = k === 'ps' ? [plantPt] : use[k];
        for (const [s, vol] of Object.entries(c.src[k])) {
          if (vol <= 0) continue;
          if (s === 'sf') { for (const [from, v2, st] of surf(vol)) if (v2 > 0) out.push({ county: i, cat: k, kind: KIND.intake, src: st, vol: v2, from, to, local: !!LOCAL[k] }); }
          else if (s === 'ss') out.push({ county: i, cat: k, kind: KIND.intake, src: SRC.sea, vol, from: sea, to });
          else out.push({ county: i, cat: k, kind: KIND.intake, src: SRC.ground, vol, from: to, to, well: true });
        }
      }
      if (c.W.ps > 0 && urb.length > 1) out.push({ county: i, cat: 'ps', kind: KIND.deliver, src: SRC.delivered, vol: c.W.ps, from: [plantPt], to: urb });
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
      if (gw > 0) out.push({ county, cat: 'pt', kind: KIND.intake, src: SRC.ground, vol: gw, from: at, to: at, well: true, plant: p });
      const a = this.anchors[county];
      const ww = a && a.wwtp.length ? a.wwtp : a && a.urban.length ? a.urban : at;
      if (rec > 0 && a) out.push({ county, cat: 'pt', kind: KIND.intake, src: SRC.reclaimed, vol: rec, from: ww, to: at, plant: p });
      if (ps > 0 && a) out.push({ county, cat: 'pt', kind: KIND.intake, src: SRC.delivered, vol: ps, from: a.wtp.length ? a.wtp : a.urban.length ? a.urban : at, to: at, plant: p });
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
    return out;
  }
}
