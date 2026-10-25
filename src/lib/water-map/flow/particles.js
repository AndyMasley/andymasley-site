import * as THREE from 'three';
import { CATS, SRC_DEF, RETURN_GRAY, PIPED_GRAY } from '../core/config.js';
import { KIND, SRC, CAT_KEYS } from './model.js';

/**
 * GPU particles for every water stream. Each particle is an instanced quad carrying its whole path; the vertex shader
 * moves it and stretches it into a short streak along its motion, so nothing is updated on the CPU per frame. One
 * streak stands for a fixed volume (Mgal/d), so density on the map follows volume.
 *
 * Paths are built like plumbing: water leaves a source (a river intake, a lakeshore, the sea, a well) along a trunk to
 * a hub at the place it is used (a city's treatment plant, a farm district's canal head, a power plant), then branches
 * out to the individual use sites. Returns run from the hub back to the nearest river downstream; consumption rises as
 * vapour from fields and cooling towers.
 *
 * Two layers: a national layer for the whole country, and a denser detail layer rebuilt around the view when you zoom
 * in, with faint lines showing the channels.
 */

const SRC_COL = {
  [SRC.river]: [0.22, 0.55, 1.00], [SRC.lake]: [0.22, 0.55, 1.00], [SRC.ground]: [0.18, 0.95, 0.78], [SRC.sea]: [0.25, 0.92, 0.95],
  [SRC.reclaimed]: [0.70, 0.55, 1.00], [SRC.delivered]: [0.40, 0.68, 1.00],
};
const hexLin = (h) => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; };   // three converts hex sRGB -> linear
/** the kind of source a stream draws from, as the panels name it (SRC_DEF) */
export const srcKey = (s) => (s.src === SRC.ground ? (s.sal ? 'gs' : 'gf') : s.src === SRC.sea ? 'ss' : s.src === SRC.reclaimed ? 'rec' : s.src === SRC.delivered ? 'ps' : 'sf');
const SRC_LIN = Object.fromEntries(Object.entries(SRC_DEF).map(([k, d]) => [k, hexLin(d.color)]));
const RET_LIN = hexLin(RETURN_GRAY), PIPED_LIN = hexLin(PIPED_GRAY);
/** a selected place's colours: each stream in the colour of its source; returns grey; a utility's pipes to its customers pale */
const placeCol = (s) => (s.kind === KIND.ret ? RET_LIN : s.kind === KIND.deliver ? PIPED_LIN : SRC_LIN[srcKey(s)]);
/** diameter in pixels of the dot at a source drawing share f of a place's water (its area follows the water) */
export const markerPx = (f) => 5 + 14 * Math.sqrt(Math.min(1, Math.max(0, f)));

// small deterministic RNG so the layout is stable between loads
export function mulberry32(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

const CAT_IDX = Object.fromEntries(CAT_KEYS.map((k, i) => [k, i]));

// The curve every particle and every channel follows: source (a) to hub (h) to use site (b), lifted over the ground.
// Shared by the particle and channel shaders so particles ride exactly on the drawn channels.
const PATH_GLSL = /* glsl */`
        vec3 bez(vec3 a, vec3 b, float lift, float t) {
          vec3 m = (a + b) * 0.5; m.y = max(a.y, b.y) + lift;
          float u = 1.0 - t;
          return u * u * a + 2.0 * u * t * m + t * t * b;
        }
        vec3 pathAt(float t, float kind) {
          // in the underground view, wells draw from the aquifer drawn below the land
          float wellDepth = aA.w > 0.0 ? aA.w + uAqMode * uAqDepth : aA.w;
          vec3 a = vec3(aA.x, aA.y * uExag - wellDepth, aA.z), h = vec3(aH.x, aH.y * uExag, aH.z), b = vec3(aB.x, aB.y * uExag, aB.z);
          if (kind > 0.5 && kind < 1.5) {
            // vapour: rises from the use site (or a cooling tower's lip), drifting a little downwind
            float r = aC.x * (0.55 + 0.45 * smoothstep(0.0, 1.0, uCamDist / 400.0));
            vec3 o = vec3(aA.x, -aA.w, aA.z) * uModelScale;
            return b + o + vec3(0.22 * r * t, 0.03 + r * (1.0 - (1.0 - t) * (1.0 - t)), -0.06 * r * t);
          }
          if (aA.w > 0.0) {
            // groundwater: straight up out of the ground, then over to the use site
            vec3 m = vec3(a.x, aA.y * uExag + aC.x, a.z);
            float u = 1.0 - t;
            return u * u * a + 2.0 * u * t * m + t * t * b;
          }
          float sp = aH.w;
          if (t < sp) return bez(a, h, aC.x + 2.0 * aE.x * uExag, t / max(sp, 1e-4));
          return bez(h, b, aC.y + 2.0 * aE.y * uExag, (t - sp) / max(1.0 - sp, 1e-4));
        }`;
const CAT_COL = Object.fromEntries(CATS.map((c) => [c.k, hexLin(c.color)]));

function nearest(list, x, z) {
  let best = list[0], bd = Infinity;
  for (const p of list) { const d = (p[0] - x) ** 2 + (p[1] - z) ** 2; if (d < bd) { bd = d; best = p; } }
  return best;
}
/** index into a list of anchors, weighted by river discharge when the anchors carry one (bigger rivers supply more) */
function pickWeighted(list, rnd) {
  if (!(list[0] && list[0].length > 2)) return Math.floor(rnd() * list.length);
  let tot = 0; for (const p of list) tot += Math.sqrt(p[2] || 1);
  let r = rnd() * tot;
  for (let i = 0; i < list.length; i++) { r -= Math.sqrt(list[i][2] || 1); if (r <= 0) return i; }
  return list.length - 1;
}

export class FlowParticles {
  constructor(shared, slabs, model) {
    this.shared = shared; this.slabs = slabs; this.model = model;
    this.group = new THREE.Group(); this.group.name = 'flows';
    model.plants.forEach((p, i) => { p._i = i; });
    this.catVis = new Float32Array(CAT_KEYS.length).fill(1);
    this.catW = new Float32Array(CAT_KEYS.length).fill(1);   // emphasis by use: isolation, hover, a Sankey band
    this.kindVis = new Float32Array(4).fill(1);
    this.hole = new THREE.Vector4(0, 0, -1, -1);   // detail region: x, z, inner, outer radius
    this.common = {
      uExag: shared.uExag, uTime: shared.uTime, uCamDist: shared.uCamDist, uViewport: shared.uViewport, uSel: shared.uSelCounty, uHov: shared.uHoverCounty,
      uCat: { value: this.catVis }, uKind: { value: this.kindVis }, uHole: { value: this.hole },
      uSize: { value: 1 }, uAlpha: { value: 1 }, uDayLook: { value: 0 }, uSpeed: { value: 1 }, uTrail: { value: 0.06 }, uCatW: { value: this.catW }, uFocusSrc: { value: -1 }, uVapor: { value: 1 },
      uAqDepth: shared.uAqDepth,
      uModelScale: { value: 0.1 }, uAqMode: shared.uAqMode, uNight: shared.uNight,
      // a selected place's own water is redrawn by the focus layer: hide it here and dim everything else
      uFocusOn: { value: 0 }, uHideCounty: { value: -1 }, uHideCat: { value: -1 }, uHidePlant: { value: -1 },
    };
    this.detail = null;
    this.focus = null;
  }
  slabAt(x, z) { for (const s of this.slabs) if (s.contains(x, z)) return s; return null; }
  setPlants(layer) { this.plantItems = new Map(layer.items.map((it) => [it.p.eia, it])); this.common.uModelScale = layer.uScale; }
  /** ground height in world units per unit of exaggeration (metres / metres-per-unit of that slab) */
  hAt(x, z) { const s = this.slabAt(x, z); return s ? Math.max(0, s.sampleH(x, z)) / s.mpu : 0; }
  /** highest ground above the straight line between two points (units per unit of exaggeration) */
  clearance(ax, az, ha, bx, bz, hb) {
    let c = 0;
    for (const q of [0.2, 0.4, 0.6, 0.8]) c = Math.max(c, this.hAt(ax + (bx - ax) * q, az + (bz - az) * q) - (ha + (hb - ha) * q));
    return c;
  }
  /** the hub of a stream: where its water is gathered before spreading to the use sites */
  hubOf(s) {
    if (s._hub) return s._hub;
    let h;
    if (s.plant || s.to.length === 1) h = s.to[0];
    else if (s.kind === KIND.deliver) h = s.from[0];
    else {
      let cx = 0, cz = 0; for (const p of s.to) { cx += p[0]; cz += p[1]; } cx /= s.to.length; cz /= s.to.length;
      h = nearest(s.to, cx, cz);
    }
    s._hub = h;
    return h;
  }

  /**
   * For a diffuse use (fields, ranches, rural homes, mines), each intake feeds the use sites near it through a canal
   * head part of the way toward them, so the water reads as one channel that then branches, the way irrigation canals do.
   */
  localFans(s) {
    if (s._fans) return s._fans;
    s._fans = s.from.map((f) => {
      let near = s.to.filter((q) => (q[0] - f[0]) ** 2 + (q[1] - f[1]) ** 2 < 20);
      if (!near.length) near = s.to.slice().sort((p1, p2) => ((p1[0] - f[0]) ** 2 + (p1[1] - f[1]) ** 2) - ((p2[0] - f[0]) ** 2 + (p2[1] - f[1]) ** 2)).slice(0, 3);
      let cx = 0, cz = 0; for (const q of near) { cx += q[0]; cz += q[1]; } cx /= near.length; cz /= near.length;
      return { near, head: [f[0] + (cx - f[0]) * 0.55, f[1] + (cz - f[1]) * 0.55] };
    });
    return s._fans;
  }
  /** returns spread over the fields: the sites draining to each river point, gathered at a collector on the way */
  returnGroups(s) {
    if (s._rg) return s._rg;
    const byKey = new Map();
    for (const o of s.from) {
      const r = nearest(s.to, o[0], o[1]), key = `${r[0]},${r[1]}`;
      let e = byKey.get(key); if (!e) byKey.set(key, (e = { r, sites: [] }));
      e.sites.push(o);
    }
    for (const e of byKey.values()) {
      let cx = 0, cz = 0; for (const q of e.sites) { cx += q[0]; cz += q[1]; } cx /= e.sites.length; cz /= e.sites.length;
      e.head = [cx + (e.r[0] - cx) * 0.45, cz + (e.r[1] - cz) * 0.45];
    }
    s._rg = { groups: [...byKey.values()], byKey };
    return s._rg;
  }

  /**
   * turn streams into particle arrays (and, optionally, channel lines) at `unit` Mgal/d per particle. For a selected
   * place (`place`), particles ride its drawn channels exactly, take the colour of their source, and returns are left
   * to the channels' grey dashes.
   */
  generate(streams, unit, rnd, withPaths = false, place = false) {
    const J = place ? 0 : 1;   // jitter around the anchors (none when particles must ride drawn channels)
    // (for a place, the water it returns and a utility's pipes to its customers are drawn as channels only)
    const cnt = streams.map((s) => { if (place && (s.kind === KIND.ret || s.kind === KIND.deliver)) return 0; const x = s.vol / unit; let n = Math.floor(x); if (rnd() < x - n) n++; return n; });
    const N = cnt.reduce((a, b) => a + b, 0);
    const A = new Float32Array(N * 4), Hb = new Float32Array(N * 4), B = new Float32Array(N * 4), C = new Float32Array(N * 4), D = new Float32Array(N * 4), E = new Float32Array(N * 4);
    const col0 = new Float32Array(N * 3), col1 = new Float32Array(N * 3);
    const lines = withPaths ? new Map() : null;
    const addLine = (a, b, col, vol, county, kind) => {
      if (!lines) return;
      const key = `${a[0].toFixed(3)},${a[1].toFixed(3)}>${b[0].toFixed(3)},${b[1].toFixed(3)}`;
      let l = lines.get(key);
      if (!l) { l = { a, b, col, vol: 0, county, kind }; lines.set(key, l); }
      l.vol += vol;
    };
    let p = 0;
    for (let si = 0; si < streams.length; si++) {
      const s = streams[si], n = cnt[si];
      if (!n) continue;
      const ci = CAT_IDX[s.cat], cc = CAT_COL[s.cat];
      const big = Math.min(1, Math.sqrt(s.vol) / 60);
      const hub = this.hubOf(s);
      // very large streams would pile thousands of streaks onto one path: fade each streak so the bundle stays legible
      const alphaK = Math.min(1, 14 / Math.sqrt(n));
      for (let k = 0; k < n; k++, p++) {
        let ax, az, hx = 0, hz = 0, bx, bz, depth = 0, arc1 = 0, arc2 = 0, split = 1, period = 3, rise = 0, c1 = 0, c2 = 0, L = 0;
        const t = s.to[Math.floor(rnd() * s.to.length)];
        const phase = (k + rnd() * 0.6) / n;
        if (s.kind === KIND.intake && s.well) {
          // groundwater: up out of the ground beneath the use site
          bx = t[0] + (rnd() - 0.5) * 0.12 * J; bz = t[1] + (rnd() - 0.5) * 0.12 * J;
          ax = bx + (rnd() - 0.5) * 0.22 * J; az = bz + (rnd() - 0.5) * 0.22 * J; depth = 0.10 + rnd() * 0.18;
          hx = bx; hz = bz; arc1 = 0.05; L = 0.4; period = 1.6 + rnd() * 0.8;
        } else if (s.kind === KIND.vapor) {
          bx = t[0]; bz = t[1]; ax = 0; az = 0;
          rise = s.tower ? 0.45 + rnd() * 0.5 : 0.18 + rnd() * 0.35;
          period = 3.0 + rnd() * 1.8;
          if (s.plant) {
            // steam leaves from the lip of one of the plant's cooling towers (model units, scaled on the GPU)
            const it = this.plantItems && this.plantItems.get(s.plant.eia);
            if (it && it.towers.length) {
              const tw = it.towers[Math.floor(rnd() * it.towers.length)];
              const c = Math.cos(it.rot), sn = Math.sin(it.rot);
              ax = c * tw[0] + sn * tw[2]; az = -sn * tw[0] + c * tw[2];
              depth = -tw[1];
            } else depth = -0.4;
          } else { bx += (rnd() - 0.5) * 0.25 * J; bz += (rnd() - 0.5) * 0.25 * J; }
          hx = bx; hz = bz;
        } else if (s.kind === KIND.ret) {
          if (s.spread) {
            // irrigation returns: from the fields to a collector, then on to the nearest river point downstream
            const RG = this.returnGroups(s);
            const o = s.from[Math.floor(rnd() * s.from.length)];
            const r = nearest(s.to, o[0], o[1]), e = RG.byKey.get(`${r[0]},${r[1]}`);
            ax = o[0] + (rnd() - 0.5) * 0.12 * J; az = o[1] + (rnd() - 0.5) * 0.12 * J;
            bx = r[0] + (rnd() - 0.5) * 0.04 * J; bz = r[1] + (rnd() - 0.5) * 0.04 * J;
            hx = e.head[0]; hz = e.head[1];
            const L1 = Math.hypot(hx - ax, hz - az), L2 = Math.hypot(bx - hx, bz - hz);
            L = L1 + L2; split = L > 1e-6 ? L1 / L : 1;
            arc1 = 0.006 + 0.02 * L1; arc2 = 0.008 + 0.025 * L2;
          } else {
            // a power plant's discharge: from the plant to its outfall
            const o = s.from[0], r = s.to[0];
            ax = o[0] + (rnd() - 0.5) * 0.05 * J; az = o[1] + (rnd() - 0.5) * 0.05 * J;
            bx = r[0] + (rnd() - 0.5) * 0.04 * J; bz = r[1] + (rnd() - 0.5) * 0.04 * J;
            hx = bx; hz = bz;
            L = Math.hypot(bx - ax, bz - az); arc1 = 0.008 + 0.025 * L;
            addLine([o[0], o[1]], [r[0], r[1]], RET_LIN, unit, s.county, s.kind);
          }
        } else if (s.local && s.kind === KIND.intake) {
          // diffuse uses (fields, ranches, rural homes, mines): each intake runs to a canal head, then out to the land
          const j = pickWeighted(s.from, rnd), f = s.from[j], fan = this.localFans(s)[j];
          const tt = fan.near[Math.floor(rnd() * fan.near.length)];
          ax = f[0] + (rnd() - 0.5) * 0.05 * J; az = f[1] + (rnd() - 0.5) * 0.05 * J;
          bx = tt[0] + (rnd() - 0.5) * 0.14 * J; bz = tt[1] + (rnd() - 0.5) * 0.14 * J;
          hx = fan.head[0]; hz = fan.head[1];
          const L1 = Math.hypot(hx - ax, hz - az), L2 = Math.hypot(bx - hx, bz - hz);
          L = L1 + L2; split = L > 1e-6 ? L1 / L : 1;
          arc1 = 0.008 + 0.025 * L1; arc2 = 0.004 + 0.02 * L2;
          if (k < 64 && L1 > 0.05) addLine([f[0], f[1]], fan.head, cc, unit, s.county, s.kind);
          if (L2 > 0.05) addLine(fan.head, [tt[0], tt[1]], cc, unit, s.county, s.kind);
        } else {
          // intake or delivery: source -> hub (trunk) -> use site (branch)
          const f = s.kind === KIND.deliver ? s.from[0] : s.from[pickWeighted(s.from, rnd)];
          const spread = s.plant ? 0.05 + 0.12 * big : 0.05;
          ax = f[0] + (rnd() - 0.5) * spread * J; az = f[1] + (rnd() - 0.5) * spread * J;
          hx = hub[0]; hz = hub[1];
          const jt = s.plant ? 0.03 + 0.04 * big : 0.10;
          bx = t[0] + (rnd() - 0.5) * jt * J; bz = t[1] + (rnd() - 0.5) * jt * J;
          const L1 = Math.hypot(hx - ax, hz - az), L2 = Math.hypot(bx - hx, bz - hz);
          L = L1 + L2;
          split = L > 1e-6 ? L1 / L : 1;
          const low = s.cat === 'ir' || s.cat === 'go' || s.cat === 'li' || s.cat === 'do' || s.kind === KIND.deliver;
          arc1 = (low ? 0.008 : 0.014) + (low ? 0.025 : 0.05) * L1;
          arc2 = 0.004 + 0.02 * L2;
          if (k < 64) { addLine([f[0], f[1]], [hub[0], hub[1]], s.kind === KIND.deliver ? cc : SRC_COL[s.src] || cc, unit, s.county, s.kind); }
          if (L2 > 0.05) addLine([hub[0], hub[1]], [t[0], t[1]], cc, unit, s.county, s.kind);
        }
        if (L > 0) period = Math.min(9, Math.max(1.1, 0.5 + L / 0.9));
        const ha = s.kind === KIND.vapor ? 0 : this.hAt(ax, az), hh = this.hAt(hx, hz), hb = this.hAt(bx, bz);
        if (s.kind !== KIND.vapor) {
          if (split < 1) { c1 = this.clearance(ax, az, ha, hx, hz, hh); c2 = this.clearance(hx, hz, hh, bx, bz, hb); }
          else c1 = this.clearance(ax, az, ha, bx, bz, hb);
        }
        A[4 * p] = ax; A[4 * p + 1] = ha; A[4 * p + 2] = az; A[4 * p + 3] = depth;
        Hb[4 * p] = hx; Hb[4 * p + 1] = hh; Hb[4 * p + 2] = hz; Hb[4 * p + 3] = split;
        B[4 * p] = bx; B[4 * p + 1] = hb; B[4 * p + 2] = bz; B[4 * p + 3] = s.kind;
        C[4 * p] = s.kind === KIND.vapor ? rise : arc1; C[4 * p + 1] = arc2; C[4 * p + 2] = period; C[4 * p + 3] = phase;
        // w: 0 not a power plant, 1 a plant outside the USGS plant model, 2 + i the model's plant i
        D[4 * p] = s.county; D[4 * p + 1] = ci; D[4 * p + 2] = s.src; D[4 * p + 3] = s.plant ? (s.plant._i != null ? s.plant._i + 2 : 1) : 0;
        E[4 * p] = c1; E[4 * p + 1] = c2; E[4 * p + 2] = alphaK;
        // colours: water on its way to a use is the colour of that use the whole way (for a selected place, the colour of
        // its source); vapour is white; returns fade to grey as they leave
        let k0 = cc, k1 = cc;
        if (s.kind === KIND.vapor) { k0 = [0.95, 0.95, 0.93]; k1 = [0.84, 0.85, 0.85]; }
        else if (place) { k0 = k1 = placeCol(s); }
        else if (s.kind === KIND.ret) { k0 = cc; k1 = RET_LIN; }
        else if (s.kind === KIND.deliver) { k0 = cc; k1 = [Math.min(1, cc[0] * 1.1 + 0.08), Math.min(1, cc[1] * 1.1 + 0.08), Math.min(1, cc[2] * 1.1 + 0.08)]; }
        col0.set(k0, 3 * p); col1.set(k1, 3 * p);
      }
    }
    return { N, A, Hb, B, C, D, E, col0, col1, lines };
  }

  /** mode: 0 the national layer, 1 the detail layer around the view, 2 the focus layer for a selected place */
  makeMesh(arr, mode) {
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('aCorner', new THREE.Float32BufferAttribute([0, -1, 1, -1, 1, 1, 0, 1], 2));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    for (const [k, a, n] of [['aA', arr.A, 4], ['aH', arr.Hb, 4], ['aB', arr.B, 4], ['aC', arr.C, 4], ['aD', arr.D, 4], ['aE', arr.E, 4], ['aCol0', arr.col0, 3], ['aCol1', arr.col1, 3]]) g.setAttribute(k, new THREE.InstancedBufferAttribute(a, n));
    g.instanceCount = arr.N;
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(430, 0, 320), 2000);
    const mesh = new THREE.Mesh(g, this.material(mode));
    mesh.frustumCulled = false; mesh.renderOrder = mode === 2 ? 7 : 6;
    return mesh;
  }

  /** build the national layer with `unit` Mgal/d per particle */
  build(unit, maxCount = 260000) {
    const streams = this.model.streams();
    this.streams = streams;
    let total = 0; for (const s of streams) total += s.vol;
    if (total / unit > maxCount) unit = total / maxCount;
    this.unit = unit; this.totalVol = total; this.maxCount = maxCount;
    this.byCounty = new Map();
    for (const s of streams) { let a = this.byCounty.get(s.county); if (!a) this.byCounty.set(s.county, (a = [])); a.push(s); }
    const arr = this.generate(streams, unit, mulberry32(2015));
    this.national = this.makeMesh(arr, 0);
    this.mat = this.national.material;
    this.group.add(this.national);
    this.count = arr.N;
    return this;
  }

  /** dense particles and channel lines for the counties around (x, z) */
  buildDetail(x, z, radius, budget) {
    const cd = this.model.cdata;
    const set = [];
    let vol = 0;
    for (let i = 0; i < cd.length; i++) {
      const c = cd[i]; if (!c) continue;
      if (Math.hypot(c.cx - x, c.cz - z) > radius + 12) continue;
      const ss = this.byCounty.get(i); if (!ss) continue;
      for (const s of ss) { set.push(s); vol += s.vol; }
    }
    if (this.detail) { this.group.remove(this.detail.mesh, this.detail.lines); this.detail.mesh.geometry.dispose(); this.detail.lines.geometry.dispose(); }
    this.detail = null;
    if (!set.length) return;
    const unit = Math.max(0.04, vol / budget);
    const arr = this.generate(set, unit, mulberry32(Math.floor(x * 31 + z * 17)), true);
    const mesh = this.makeMesh(arr, 1);
    // channel lines, evaluated on the GPU along the same curves the particles follow
    const pos = [], end = [], col = [], extra = [];
    for (const l of arr.lines.values()) {
      const a = l.a, b = l.b;
      const ha = this.hAt(a[0], a[1]), hb = this.hAt(b[0], b[1]);
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (L < 0.03) continue;
      const arc = l.kind === KIND.ret ? 0.01 + 0.03 * L : 0.008 + 0.03 * L;
      const clear = this.clearance(a[0], a[1], ha, b[0], b[1], hb);
      const w = Math.min(1, 0.22 + 0.28 * Math.log10(1 + l.vol));
      const segs = Math.max(4, Math.min(16, Math.ceil(L * 6)));
      for (let k = 0; k < segs; k++) {
        for (const tt of [k / segs, (k + 1) / segs]) {
          pos.push(a[0], ha, a[1]); end.push(b[0], hb, b[1]);
          col.push(l.col[0] * w, l.col[1] * w, l.col[2] * w);
          extra.push(tt, arc, clear, l.county);
        }
      }
    }
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    lg.setAttribute('aEnd', new THREE.Float32BufferAttribute(end, 3));
    lg.setAttribute('aCol', new THREE.Float32BufferAttribute(col, 3));
    lg.setAttribute('aX', new THREE.Float32BufferAttribute(extra, 4));
    const lines = new THREE.LineSegments(lg, this.lineMaterial());
    lines.frustumCulled = false; lines.renderOrder = 5;
    this.group.add(lines, mesh);
    this.detail = { mesh, lines, unit, x, z, radius, N: arr.N };
  }

  /**
   * The channels a selected place's water runs through, as ribbons whose width follows the water they carry, in the
   * colour of its source. They use the same anchors and curves as generate() does for a place, so its particles ride
   * on them: trunks from each source to the hub, branches from the hub to each use site, short local runs, wells,
   * returns (grey) and a utility's pipes to its customers (pale).
   */
  channels(streams, W = 0) {
    const segs = new Map();
    // a flow under 1% of the place's water draws only its trunk from the source, not a branch to every site it serves
    const tiny = (s) => W > 0 && s.vol < 0.01 * W;
    const add = (r) => {
      const key = `${r.cat}|${r.kind}|${r.sk}|${r.a[0].toFixed(3)},${r.a[1].toFixed(3)}|${r.h[0].toFixed(3)},${r.h[1].toFixed(3)}|${r.b[0].toFixed(3)},${r.b[1].toFixed(3)}|${r.split}`;
      const e = segs.get(key);
      if (e) e.vol += r.vol; else segs.set(key, r);
    };
    const wts = (list) => { const w = list.map((p) => (list[0] && list[0].length > 2 ? Math.sqrt(p[2] || 1) : 1)); const t = w.reduce((a, b) => a + b, 0) || 1; return w.map((x) => x / t); };
    for (const s of streams) {
      if (s.kind === KIND.vapor || !(s.vol > 0)) continue;
      const col = placeCol(s);
      const hub = this.hubOf(s);
      const low = s.cat === 'ir' || s.cat === 'go' || s.cat === 'li' || s.cat === 'do' || s.kind === KIND.deliver;
      const base = { cat: s.cat, kind: s.kind, sk: s.kind === KIND.intake ? srcKey(s) : '', county: s.county, well: false, depth: 0, col };
      if (s.kind === KIND.intake && s.well) {
        for (const t of s.to) add({ ...base, a: t, h: t, b: t, split: 1, arc1: 0.05, arc2: 0, depth: 0.28, well: true, vol: s.vol / s.to.length });
      } else if (s.kind === KIND.ret) {
        if (s.spread) {
          // fields -> collector (one run per field), collector -> river (one channel per collector)
          const RG = this.returnGroups(s), per = s.vol / s.from.length;
          for (const e of RG.groups) {
            for (const o of e.sites) { const L1 = Math.hypot(e.head[0] - o[0], e.head[1] - o[1]); if (L1 > 1e-4) add({ ...base, a: o, h: e.head, b: e.head, split: 1, arc1: 0.006 + 0.02 * L1, arc2: 0, vol: per }); }
            const L2 = Math.hypot(e.r[0] - e.head[0], e.r[1] - e.head[1]);
            if (L2 > 1e-4) add({ ...base, a: e.head, h: e.head, b: e.r, split: 0, arc1: 0, arc2: 0.008 + 0.025 * L2, vol: per * e.sites.length });
          }
        } else {
          const o = s.from[0], r = s.to[0], L = Math.hypot(r[0] - o[0], r[1] - o[1]);
          if (L > 1e-4) add({ ...base, a: o, h: r, b: r, split: 1, arc1: 0.008 + 0.025 * L, arc2: 0, vol: s.vol });
        }
      } else if (s.local && s.kind === KIND.intake) {
        // intake -> canal head (the whole share of that intake), canal head -> each field
        const w = wts(s.from), fans = this.localFans(s);
        s.from.forEach((f, j) => {
          const fan = fans[j], L1 = Math.hypot(fan.head[0] - f[0], fan.head[1] - f[1]);
          if (L1 > 1e-4) add({ ...base, a: f, h: fan.head, b: fan.head, split: 1, arc1: 0.008 + 0.025 * L1, arc2: 0, vol: s.vol * w[j] });
          if (!tiny(s)) for (const t of fan.near) { const L2 = Math.hypot(t[0] - fan.head[0], t[1] - fan.head[1]); if (L2 > 1e-4) add({ ...base, a: fan.head, h: fan.head, b: t, split: 0, arc1: 0, arc2: 0.004 + 0.02 * L2, vol: s.vol * w[j] / fan.near.length }); }
        });
      } else {
        const from = s.kind === KIND.deliver ? [s.from[0]] : s.from;
        const w = s.kind === KIND.deliver ? [1] : wts(from);
        from.forEach((f, j) => { const L1 = Math.hypot(hub[0] - f[0], hub[1] - f[1]); if (L1 > 1e-4) add({ ...base, a: f, h: hub, b: hub, split: 1, arc1: (low ? 0.008 : 0.014) + (low ? 0.025 : 0.05) * L1, arc2: 0, vol: s.vol * w[j] }); });
        if (!tiny(s)) for (const t of s.to) { const L2 = Math.hypot(t[0] - hub[0], t[1] - hub[1]); if (L2 > 1e-4) add({ ...base, a: hub, h: hub, b: t, split: 0, arc1: 0, arc2: 0.004 + 0.02 * L2, vol: s.vol / s.to.length }); }
      }
    }
    return [...segs.values()];
  }

  /** ribbon geometry for channels: two vertices per sample along each curve, offset across it on the screen */
  ribbonMesh(segs, total = 0) {
    let vmax = 0; for (const r of segs) vmax = Math.max(vmax, r.vol);
    const V = total > 0 ? total : vmax;
    let nv = 0;
    const steps = segs.map((r) => { const L = Math.hypot(r.b[0] - r.a[0], r.b[1] - r.a[1]) + Math.hypot(r.h[0] - r.a[0], r.h[1] - r.a[1]); const n = r.well ? 6 : Math.max(8, Math.min(40, Math.ceil(L * 10))); nv += 2 * (n + 1); return n; });
    const A = new Float32Array(nv * 4), Hb = new Float32Array(nv * 4), B = new Float32Array(nv * 4), C = new Float32Array(nv * 4), E = new Float32Array(nv * 4), Wd = new Float32Array(nv * 2), Col = new Float32Array(nv * 3);
    const idx = [];
    let v = 0;
    segs.forEach((r, si) => {
      const n = steps[si];
      const ha = this.hAt(r.a[0], r.a[1]), hh = this.hAt(r.h[0], r.h[1]), hb = this.hAt(r.b[0], r.b[1]);
      let c1 = 0, c2 = 0;
      if (!r.well) { if (r.split < 1) { c1 = this.clearance(r.a[0], r.a[1], ha, r.h[0], r.h[1], hh); c2 = this.clearance(r.h[0], r.h[1], hh, r.b[0], r.b[1], hb); } else c1 = this.clearance(r.a[0], r.a[1], ha, r.b[0], r.b[1], hb); }
      const f = Math.min(1, Math.sqrt(r.vol / (V || 1)));
      // one width scale for everything a place draws (the reading key shows it); small flows stay faint so the big
      // channels carry the picture, and returns and pipes to customers stay quieter than the water's sources
      const quiet = r.kind === KIND.ret ? 0.62 : r.kind === KIND.deliver ? 0.55 : 1;
      const width = 1.3 + 10 * f, alpha = (0.03 + 0.9 * Math.pow(f, 0.75)) * quiet;
      const len = Math.hypot(r.h[0] - r.a[0], r.h[1] - r.a[1]) + Math.hypot(r.b[0] - r.h[0], r.b[1] - r.h[1]);
      const v0 = v;
      for (let k = 0; k <= n; k++) {
        for (const side of [-1, 1]) {
          A.set([r.a[0], ha, r.a[1], r.depth], 4 * v); Hb.set([r.h[0], hh, r.h[1], r.split], 4 * v); B.set([r.b[0], hb, r.b[1], r.kind], 4 * v);
          C.set([r.arc1, r.arc2, len, 0], 4 * v); E.set([c1, c2, k / n, side], 4 * v); Wd.set([width, alpha], 2 * v); Col.set(r.col, 3 * v);
          v++;
        }
        if (k < n) { const q = v0 + 2 * k; idx.push(q, q + 1, q + 2, q + 1, q + 3, q + 2); }
      }
    });
    const g = new THREE.BufferGeometry();
    for (const [k, a, n] of [['aA', A, 4], ['aH', Hb, 4], ['aB', B, 4], ['aC', C, 4], ['aE', E, 4], ['aW', Wd, 2], ['aCol', Col, 3]]) g.setAttribute(k, new THREE.BufferAttribute(a, n));
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(nv * 3), 3));
    g.setIndex(idx);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(430, 0, 320), 2000);
    const mesh = new THREE.Mesh(g, this.ribbonMaterial());
    mesh.frustumCulled = false; mesh.renderOrder = 6.5;
    return mesh;
  }

  ribbonMaterial() {
    return new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, depthTest: true, side: THREE.DoubleSide,
      blending: THREE.NormalBlending, premultipliedAlpha: true,
      uniforms: { uExag: this.common.uExag, uAqMode: this.common.uAqMode, uAqDepth: this.common.uAqDepth, uCamDist: this.common.uCamDist, uModelScale: this.common.uModelScale,
        uViewport: this.common.uViewport, uNight: this.common.uNight, uTime: this.common.uTime, uRibbon: { value: 0 } },
      vertexShader: /* glsl */`
        uniform float uExag, uAqMode, uAqDepth, uCamDist, uModelScale, uRibbon;
        uniform vec2 uViewport;
        attribute vec4 aA, aH, aB, aC, aE; attribute vec2 aW; attribute vec3 aCol;
        varying vec3 vCol; varying float vA, vAcross, vT, vW, vKind, vLen;
        ${PATH_GLSL}
        void main() {
          float kind = aB.w, t = aE.z;
          vKind = kind; vLen = aC.z;
          vec3 p = pathAt(t, kind), pa = pathAt(max(0.0, t - 0.02), kind), pb = pathAt(min(1.0, t + 0.02), kind);
          vec4 mv = viewMatrix * vec4(p, 1.0); mv.xyz *= 0.998;   // a hair toward the camera, clear of the ground
          vec4 c = projectionMatrix * mv;
          vec4 ca = projectionMatrix * (viewMatrix * vec4(pa, 1.0)), cb = projectionMatrix * (viewMatrix * vec4(pb, 1.0));
          vec2 half_ = uViewport * 0.5;
          vec2 sa = ca.xy / ca.w * half_, sb = cb.xy / cb.w * half_, sc = c.xy / c.w * half_;
          vec2 dir = sb - sa; float len = length(dir);
          vec2 dn = len > 1e-4 ? dir / len : vec2(1.0, 0.0);
          vec2 nrm = vec2(-dn.y, dn.x);
          float w = aW.x + 4.0;   // room for a dark casing and a soft edge on each side
          vec2 sp = sc + nrm * aE.w * w * 0.5;
          gl_Position = vec4(sp / half_ * c.w, c.z, c.w);
          vAcross = aE.w * w * 0.5; vA = aW.y * uRibbon; vCol = aCol; vT = t; vW = aW.x;
        }`,
      fragmentShader: /* glsl */`
        uniform float uNight, uTime;
        varying vec3 vCol; varying float vA, vAcross, vT, vW, vKind, vLen;
        void main() {
          float r = vW * 0.5, d = abs(vAcross);
          float body = 1.0 - smoothstep(r - 0.6, r + 0.3, d);
          // a dark casing keeps the channel legible over bright city lights and pale daytime land
          float casing = 1.0 - smoothstep(r + 0.7, r + 1.8, d);
          // returns are dashed, the dashes running back toward the river
          if (vKind > 1.5 && vKind < 2.5) { float ph = fract(vT * vLen * 7.0 - uTime * 0.9); body *= smoothstep(0.0, 0.06, ph) * (1.0 - smoothstep(0.55, 0.61, ph)); }
          // a brighter core down the middle of wide channels
          float core = 1.0 - smoothstep(0.0, max(r * 0.55, 0.8), d);
          vec3 col = mix(vCol, vec3(1.0), 0.16 * core);
          float aBody = vA * body * (0.7 + 0.3 * core), aCase = vA * 0.55 * max(0.0, casing - body);
          gl_FragColor = vec4(col * aBody, aBody + aCase);
        }`,
    });
  }

  /** a dot at every source of a set of streams, in the colour of that kind of source, its area following the water drawn there */
  sourceMarkers(streams, total = 0) {
    const pts = new Map();
    const add = (p, k, v) => { const key = `${k}|${p[0].toFixed(3)},${p[1].toFixed(3)}`; const e = pts.get(key); if (e) e.v += v; else pts.set(key, { x: p[0], z: p[1], k, v }); };
    const wts = (list) => { const w = list.map((p) => (list[0] && list[0].length > 2 ? Math.sqrt(p[2] || 1) : 1)); const t = w.reduce((a, b) => a + b, 0) || 1; return w.map((x) => x / t); };
    for (const s of streams) {
      if (s.kind !== KIND.intake || !(s.vol > 0)) continue;
      const k = srcKey(s);
      if (s.well) for (const t of s.to) add(t, k, s.vol / s.to.length);
      else { const w = wts(s.from); s.from.forEach((f, j) => add(f, k, s.vol * w[j])); }
    }
    const list = [...pts.values()];
    if (!list.length) return null;
    let vmax = 0; for (const p of list) vmax = Math.max(vmax, p.v);
    const V = total > 0 ? total : vmax;
    const n = list.length, P = new Float32Array(n * 4), Cl = new Float32Array(n * 4);
    // a well is a ring, an intake a filled dot
    list.forEach((p, i) => { P.set([p.x, this.hAt(p.x, p.z), p.z, markerPx(p.v / (V || 1))], 4 * i); Cl.set([...SRC_LIN[p.k], p.k === 'gf' || p.k === 'gs' ? 1 : 0], 4 * i); });
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('aCorner', new THREE.Float32BufferAttribute([-1, -1, 1, -1, 1, 1, -1, 1], 2));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    g.setAttribute('aP', new THREE.InstancedBufferAttribute(P, 4));
    g.setAttribute('aCol', new THREE.InstancedBufferAttribute(Cl, 4));
    g.instanceCount = n;
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, depthTest: false, blending: THREE.NormalBlending, premultipliedAlpha: true,
      uniforms: { uExag: this.common.uExag, uViewport: this.common.uViewport, uA: { value: 0 } },
      vertexShader: /* glsl */`
        uniform float uExag; uniform vec2 uViewport;
        attribute vec2 aCorner; attribute vec4 aP; attribute vec4 aCol;
        varying vec2 vUv; varying vec3 vCol; varying float vR, vRing;
        void main() {
          vec4 c = projectionMatrix * (viewMatrix * vec4(aP.x, aP.y * uExag + 0.02, aP.z, 1.0));
          float r = aP.w * 0.5 + 1.5;
          c.xy += aCorner * r * 2.0 / uViewport * c.w;
          gl_Position = c; vUv = aCorner * r; vCol = aCol.rgb; vR = aP.w * 0.5; vRing = aCol.a;
        }`,
      fragmentShader: /* glsl */`
        uniform float uA;
        varying vec2 vUv; varying vec3 vCol; varying float vR, vRing;
        void main() {
          float d = length(vUv);
          float fill = 1.0 - smoothstep(vR - 1.2, vR - 0.4, d);
          // a well: a coloured ring around a small dark centre
          if (vRing > 0.5) fill *= smoothstep(vR * 0.32 - 0.6, vR * 0.32 + 0.4, d);
          float ring = 1.0 - smoothstep(vR + 0.4, vR + 1.3, d);
          if (ring < 0.01) discard;
          float a = uA * (fill * 0.95 + (ring - fill) * 0.8);
          gl_FragColor = vec4(vCol * fill * uA * 0.95 + vec3(0.02, 0.04, 0.035) * (ring - fill) * uA * 0.8, a);
        }`,
    });
    const mesh = new THREE.Mesh(g, mat);
    mesh.frustumCulled = false; mesh.renderOrder = 8;
    return mesh;
  }

  /** draw these streams on their own, as channels with particles riding them; every other flow steps back */
  setFocus(streams, hide = {}) {
    this.clearFocus(); this.clearPreview();
    const list = (streams || []).filter((s) => s.vol > 0);
    if (!list.length) return;
    const tot = list.reduce((a, s) => a + (s.kind === KIND.ret ? 0 : s.vol), 0);
    const unit = Math.max(0.0025, tot / 9000);
    const arr = this.generate(list, unit, mulberry32(7 + (list[0].county || 0)), false, true);
    const mesh = arr.N ? this.makeMesh(arr, 2) : null;
    const W = list.filter((s) => s.kind === KIND.intake).reduce((a, s) => a + s.vol, 0) || tot;
    const ribbons = this.ribbonMesh(this.channels(list, W), W);
    const markers = this.sourceMarkers(list, W);
    if (mesh) this.group.add(mesh);
    this.group.add(ribbons);
    if (markers) this.group.add(markers);
    this.focus = { mesh, ribbons, markers, N: arr.N, unit, t0: performance.now() };
    if (mesh) mesh.material.uniforms.uLayerAlpha.value = 0;
    const c = this.common;
    c.uHideCounty.value = hide.county ?? -1; c.uHideCat.value = hide.cat ?? -1; c.uHidePlant.value = hide.plant ?? -1;
    c.uFocusOn.value = 1;
  }
  /** a lighter look at a place under the pointer: its channels and source dots, no dimming of anything else */
  setPreview(streams) {
    this.clearPreview();
    const list = (streams || []).filter((s) => s.vol > 0);
    if (!list.length) return;
    const W = list.filter((s) => s.kind === KIND.intake).reduce((a, s) => a + s.vol, 0) || list.reduce((a, s) => a + s.vol, 0);
    const ribbons = this.ribbonMesh(this.channels(list, W), W);
    const markers = this.sourceMarkers(list, W);
    this.group.add(ribbons); if (markers) this.group.add(markers);
    this.preview = { ribbons, markers, t0: performance.now() };
  }
  clearPreview() {
    const f = this.preview;
    if (!f) return;
    for (const m of [f.ribbons, f.markers]) if (m) { this.group.remove(m); m.geometry.dispose(); m.material.dispose(); }
    this.preview = null;
  }
  clearFocus() {
    const f = this.focus;
    if (f) {
      for (const m of [f.mesh, f.ribbons, f.markers]) if (m) { this.group.remove(m); m.geometry.dispose(); m.material.dispose(); }
      this.focus = null;
    }
    this.common.uFocusOn.value = 0;
  }

  lineMaterial() {
    return new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending,
      uniforms: { ...this.common, uLineAlpha: { value: 0.0 } },
      vertexShader: /* glsl */`
        uniform float uExag, uSel, uFocusOn; uniform vec4 uHole;
        attribute vec3 aEnd, aCol; attribute vec4 aX;
        varying vec3 vCol; varying float vA;
        void main() {
          vec3 a = vec3(position.x, position.y * uExag, position.z), b = vec3(aEnd.x, aEnd.y * uExag, aEnd.z);
          vec3 m = (a + b) * 0.5; m.y = max(a.y, b.y) + aX.y + 2.0 * aX.z * uExag;
          float t = aX.x, u = 1.0 - t;
          vec3 p = u * u * a + 2.0 * u * t * m + t * t * b;
          vec4 mv = viewMatrix * vec4(p, 1.0); mv.xyz *= 0.998;
          gl_Position = projectionMatrix * mv;
          float dh = length(p.xz - uHole.xy);
          vA = 1.0 - smoothstep(uHole.z, uHole.w, dh);
          if (uFocusOn > 0.5) vA = 0.0;
          else if (uSel >= 0.0 && abs(aX.w - uSel) > 0.5) vA *= 0.25;
          vCol = aCol;
        }`,
      fragmentShader: /* glsl */`
        uniform float uLineAlpha;
        varying vec3 vCol; varying float vA;
        void main() { gl_FragColor = vec4(vCol * vA * uLineAlpha, 1.0); }`,
    });
  }

  material(mode) {
    // streaks are drawn over one another rather than adding light, so the busiest places keep the colour of their use
    // instead of washing out to white (white is kept for water consumed); at night they are drawn bright enough to glow
    return new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, depthTest: true, side: THREE.DoubleSide,
      blending: THREE.NormalBlending, premultipliedAlpha: true,
      uniforms: { ...this.common, uDetail: { value: mode }, uLayerAlpha: { value: 1 }, ...(mode === 2 ? { uFocusOn: { value: 0 } } : {}) },
      vertexShader: /* glsl */`
        uniform float uExag, uTime, uCamDist, uSize, uSpeed, uSel, uHov, uFocusSrc, uTrail, uVapor, uDetail, uModelScale, uAqMode, uAqDepth;
        uniform float uFocusOn, uHideCounty, uHideCat, uHidePlant;
        uniform vec2 uViewport; uniform vec4 uHole;
        uniform float uCat[${CAT_KEYS.length}]; uniform float uCatW[${CAT_KEYS.length}]; uniform float uKind[4];
        attribute vec2 aCorner;
        attribute vec4 aA, aH, aB, aC, aD, aE;
        attribute vec3 aCol0, aCol1;
        varying vec3 vCol; varying float vA, vAlong, vAcross, vLen, vW, vPuff;
        ${PATH_GLSL}
        void main() {
          float kind = aB.w;
          bool vapor = kind > 0.5 && kind < 1.5;
          float t = fract(uTime * uSpeed / aC.z + aC.w);
          float env = vapor ? smoothstep(0.0, 0.15, t) * (1.0 - smoothstep(0.30, 1.0, t)) : smoothstep(0.0, 0.05, t) * (1.0 - smoothstep(0.90, 1.0, t));
          float cat = aD.y;
          float vis = uCat[int(cat + 0.5)] * uKind[int(kind + 0.5)] * uCatW[int(cat + 0.5)] * (vapor ? uVapor : 1.0);
          if (uFocusOn > 0.5) {
            // a selected place's own water is drawn by the focus layer; everything else steps back
            bool mine = uHidePlant >= 0.0 ? abs(aD.w - 2.0 - uHidePlant) < 0.5
              : abs(aD.x - uHideCounty) < 0.5 && (uHideCat < 0.0 || abs(aD.y - uHideCat) < 0.5);
            vis *= mine ? 0.0 : 0.07;
          }
          else if (uSel >= 0.0 && abs(aD.x - uSel) > 0.5) vis *= 0.10;
          // the county under the pointer: its water a little brighter
          else if (uSel < 0.0 && uHov >= 0.0 && abs(aD.x - uHov) < 0.5) vis *= 1.7;
          // a source picked in the Sankey: only intakes from that kind of source stay bright
          if (uFocusSrc >= 0.0 && kind < 0.5) {
            float sc = aD.z;
            bool m = uFocusSrc < 0.5 ? (sc < 0.5 || abs(sc - 5.0) < 0.5) : uFocusSrc < 1.5 ? abs(sc - 1.0) < 0.5 : abs(sc - 2.0) < 0.5;
            if (!m) vis *= 0.05;
          }
          if (uAqMode > 0.001 && abs(aD.z - 1.0) > 0.5) vis *= 1.0 - uAqMode;   // underground view: groundwater only
          // the detail layer covers a disc around the view; the national layer gives way inside it
          float dh = length(aB.xz - uHole.xy);
          float inside = 1.0 - smoothstep(uHole.z, uHole.w, dh);
          if (uDetail < 1.5) vis *= uDetail > 0.5 ? inside : 1.0 - inside;
          // returns stay faint, so the colour of a place is the colour of the use its water went to
          vA = env * vis * (vapor ? 0.55 : kind > 1.5 && kind < 2.5 ? 0.4 : 1.0) * aE.z;
          if (vA < 0.003) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
          float trail = vapor ? 0.14 : (aD.w > 0.5 ? 0.16 : uTrail);
          vec3 pH = pathAt(t, kind), pT = pathAt(max(0.0, t - trail), kind);
          vec4 cH = projectionMatrix * viewMatrix * vec4(pH, 1.0), cT = projectionMatrix * viewMatrix * vec4(pT, 1.0);
          if (cH.w <= 0.0 || cT.w <= 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
          vec2 half_ = uViewport * 0.5;
          vec2 sH = cH.xy / cH.w * half_, sT = cT.xy / cT.w * half_;
          vec2 dir = sH - sT; float len = length(dir);
          vec2 dn = len > 0.001 ? dir / len : vec2(1.0, 0.0);
          // keep streaks short on screen: long paths would otherwise draw long beams
          float maxLen = vapor ? 10.0 : (uDetail > 1.5 ? 14.0 : 9.0);
          if (len > maxLen) { sT = sH - dn * maxLen; len = maxLen; }
          float len0 = len;
          // and never shorter than a few pixels, so even a short trip reads as a streak with a direction
          float minLen = vapor ? 0.0 : (uDetail > 1.5 ? 9.0 : uDetail > 0.5 ? 6.0 : 4.5);
          if (len < minLen && len > 0.001) { sT = sH - dn * minLen; len = minLen; }
          vec2 nrm = vec2(-dn.y, dn.x);
          float zoom = clamp(pow(1600.0 / uCamDist, 0.20), 1.0, 2.3);
          float w = uSize * zoom * (vapor ? 1.4 + 1.0 * t : (uDetail > 1.5 ? 2.6 : uDetail > 0.5 ? 1.6 : 1.8));
          if (uDetail < 1.5) vA *= clamp((len0 + w) / (len + w), 0.5, 1.0);
          vec2 sp = mix(sT, sH, aCorner.x) + dn * (aCorner.x * 2.0 - 1.0) * w * 0.5 + nrm * aCorner.y * w * 0.5;
          // screen-space quad with w = 1 so the shape varyings interpolate linearly across it (no perspective skew)
          float zN = mix(cT.z / cT.w, cH.z / cH.w, aCorner.x);
          gl_Position = vec4(sp / half_, zN, 1.0);
          vAlong = aCorner.x * len + (aCorner.x * 2.0 - 1.0) * w * 0.5; vAcross = aCorner.y * w * 0.5; vLen = len; vW = w;
          vPuff = vapor ? 1.0 : 0.0;
          vCol = mix(aCol0, aCol1, smoothstep(0.04, 0.32, t));   // the colour of the use, after a short start in the colour of the source
        }`,
      fragmentShader: /* glsl */`
        uniform float uAlpha, uLayerAlpha, uDetail, uDayLook;
        varying vec3 vCol; varying float vA, vAlong, vAcross, vLen, vW, vPuff;
        void main() {
          float r = vW * 0.5;
          float dAlong = max(0.0, max(-vAlong, vAlong - vLen));
          float d = length(vec2(dAlong, vAcross));
          float k = 1.0 - smoothstep(r - 0.7, r + 0.3, d);
          k *= mix(vPuff > 0.5 ? 0.0 : 0.15, 1.0, clamp(vAlong / max(vLen, 1.0), 0.0, 1.0));   // fade the tail
          if (vPuff > 0.5) k *= 0.30;
          if (k < 0.004) discard;
          float a = k * vA * uLayerAlpha;
          // (a selected place's particles stay close to the colour of their source)
          if (uDetail > 0.5) gl_FragColor = vec4(vCol * (uDetail > 1.5 ? 1.12 : 1.5) * a, a * 0.92);
          // by day the national layer is drawn over the land in the colour of each use
          else if (uDayLook > 0.5) gl_FragColor = vec4(vCol * 0.85 * a * 0.8, a * 0.8);
          // by night, the same colours bright enough to glow
          else { float an = min(0.9, a * uAlpha * 4.5); gl_FragColor = vec4(vCol * 1.2 * an, an); }
        }`,
    });
  }

  /** day: the national layer is drawn in the plain colour of each use; night: brighter, so it glows */
  setDayLook(day) {
    if (!this.mat || this._day === day) return;
    this._day = day;
    this.common.uDayLook.value = day ? 1 : 0;
  }
  /** per frame: brightness by zoom, and the detail layer around the view centre */
  update(camDist, cx, cz) {
    if (!this.mat) return;
    if (this.preview) {
      const f = this.preview, a = 0.6 * Math.min(1, (performance.now() - f.t0) / 300);
      f.ribbons.material.uniforms.uRibbon.value = a;
      if (f.markers) f.markers.material.uniforms.uA.value = a;
    }
    if (this.focus) {
      // the focus layer fades in over half a second
      const f = this.focus, a = Math.min(1, (performance.now() - f.t0) / 500);
      f.ribbons.material.uniforms.uRibbon.value = a;
      if (f.mesh) f.mesh.material.uniforms.uLayerAlpha.value = a;
      if (f.markers) f.markers.material.uniforms.uA.value = a;
    }
    const near = Math.min(1, Math.max(0, (900 - camDist) / 800));
    this.common.uAlpha.value = (0.10 + 0.32 * near) * (1 + 0.35 * this.shared.uNight.value);
    // the mist of water consumed stays faint from afar, so the busiest farmland keeps the colour of its use
    this.common.uVapor.value = 0.12 + 0.88 * near;
    const wantDetail = camDist < 260;
    if (wantDetail) {
      const R = Math.max(18, camDist * 1.25);
      const d = this.detail;
      const moved = d ? Math.hypot(cx - d.x, cz - d.z) : Infinity;
      if (!d || moved > d.radius * 0.35 || R < d.radius * 0.55 || R > d.radius * 1.6) {
        const now = performance.now();
        if (!this._lastBuild || now - this._lastBuild > 350) {
          this._lastBuild = now;
          this.buildDetail(cx, cz, R, this.maxCount * 0.45);
        }
      }
      if (this.detail) {
        const dd = this.detail;
        const fade = Math.min(1, Math.max(0, (260 - camDist) / 60));
        dd.mesh.material.uniforms.uLayerAlpha.value = fade;
        dd.lines.material.uniforms.uLineAlpha.value = 0.2 * fade;
        this.hole.set(dd.x, dd.z, dd.radius * 0.80 * fade, dd.radius * Math.max(fade, 0.01));
      }
    } else {
      this.hole.set(0, 0, -1, -1);
      if (this.detail) { this.detail.mesh.material.uniforms.uLayerAlpha.value = 0; this.detail.lines.material.uniforms.uLineAlpha.value = 0; }
    }
  }
}
