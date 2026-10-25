import * as THREE from 'three';
import { CATS } from '../core/config.js';
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
const RET_COL = [0.20, 0.50, 1.0];
const hexLin = (h) => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; };   // three converts hex sRGB -> linear

// small deterministic RNG so the layout is stable between loads
export function mulberry32(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

const CAT_IDX = Object.fromEntries(CAT_KEYS.map((k, i) => [k, i]));
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
    this.catVis = new Float32Array(CAT_KEYS.length).fill(1);
    this.catW = new Float32Array(CAT_KEYS.length).fill(1);   // emphasis by use: isolation, hover, a Sankey band
    this.kindVis = new Float32Array(4).fill(1);
    this.hole = new THREE.Vector4(0, 0, -1, -1);   // detail region: x, z, inner, outer radius
    this.common = {
      uExag: shared.uExag, uTime: shared.uTime, uCamDist: shared.uCamDist, uViewport: shared.uViewport, uSel: shared.uSelCounty, uHov: shared.uHoverCounty,
      uCat: { value: this.catVis }, uKind: { value: this.kindVis }, uHole: { value: this.hole },
      uSize: { value: 1 }, uAlpha: { value: 1 }, uSpeed: { value: 1 }, uTrail: { value: 0.06 }, uCatW: { value: this.catW }, uFocusSrc: { value: -1 }, uVapor: { value: 1 },
      uAqDepth: shared.uAqDepth,
      uModelScale: { value: 0.1 }, uAqMode: shared.uAqMode, uNight: shared.uNight,
    };
    this.detail = null;
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

  /** turn streams into particle arrays (and, optionally, channel lines) at `unit` Mgal/d per particle */
  generate(streams, unit, rnd, withPaths = false) {
    const cnt = streams.map((s) => { const x = s.vol / unit; let n = Math.floor(x); if (rnd() < x - n) n++; return n; });
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
          bx = t[0] + (rnd() - 0.5) * 0.12; bz = t[1] + (rnd() - 0.5) * 0.12;
          ax = bx + (rnd() - 0.5) * 0.22; az = bz + (rnd() - 0.5) * 0.22; depth = 0.10 + rnd() * 0.18;
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
          } else { bx += (rnd() - 0.5) * 0.25; bz += (rnd() - 0.5) * 0.25; }
          hx = bx; hz = bz;
        } else if (s.kind === KIND.ret) {
          // back to the nearest river point downstream: from the plant's outfall, or (irrigation) from the fields themselves
          const o = s.spread ? s.from[Math.floor(rnd() * s.from.length)] : hub;
          const r = s.plant ? s.to[0] : nearest(s.to, o[0], o[1]);
          ax = o[0] + (rnd() - 0.5) * (s.spread ? 0.12 : 0.05); az = o[1] + (rnd() - 0.5) * (s.spread ? 0.12 : 0.05);
          bx = r[0] + (rnd() - 0.5) * 0.04; bz = r[1] + (rnd() - 0.5) * 0.04;
          hx = bx; hz = bz;
          L = Math.hypot(bx - ax, bz - az); arc1 = 0.008 + 0.025 * L;
          if (!s.spread) addLine([hub[0], hub[1]], [r[0], r[1]], RET_COL, unit, s.county, s.kind);
        } else if (s.local && s.kind === KIND.intake) {
          // diffuse uses (fields, ranches, rural homes, mines): each intake serves the land near it, like a canal
          const f = s.from[pickWeighted(s.from, rnd)];
          let near = s.to.filter((q) => (q[0] - f[0]) ** 2 + (q[1] - f[1]) ** 2 < 20);
          if (!near.length) near = s.to.slice().sort((p1, p2) => ((p1[0] - f[0]) ** 2 + (p1[1] - f[1]) ** 2) - ((p2[0] - f[0]) ** 2 + (p2[1] - f[1]) ** 2)).slice(0, 3);
          const tt = near[Math.floor(rnd() * near.length)];
          ax = f[0] + (rnd() - 0.5) * 0.05; az = f[1] + (rnd() - 0.5) * 0.05;
          bx = tt[0] + (rnd() - 0.5) * 0.14; bz = tt[1] + (rnd() - 0.5) * 0.14;
          hx = ax; hz = az; split = 0;
          L = Math.hypot(bx - ax, bz - az);
          arc2 = 0.006 + 0.025 * L;
        } else {
          // intake or delivery: source -> hub (trunk) -> use site (branch)
          const f = s.kind === KIND.deliver ? s.from[0] : s.from[pickWeighted(s.from, rnd)];
          const spread = s.plant ? 0.05 + 0.12 * big : 0.05;
          ax = f[0] + (rnd() - 0.5) * spread; az = f[1] + (rnd() - 0.5) * spread;
          hx = hub[0]; hz = hub[1];
          const jt = s.plant ? 0.03 + 0.04 * big : 0.10;
          bx = t[0] + (rnd() - 0.5) * jt; bz = t[1] + (rnd() - 0.5) * jt;
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
        D[4 * p] = s.county; D[4 * p + 1] = ci; D[4 * p + 2] = s.src; D[4 * p + 3] = s.plant ? 1 : 0;
        E[4 * p] = c1; E[4 * p + 1] = c2; E[4 * p + 2] = alphaK;
        // colours: intake turns from the colour of its source to the colour of its use; vapour is white; returns go back to river blue
        let k0 = SRC_COL[s.src] || SRC_COL[SRC.river], k1 = cc;
        if (s.kind === KIND.vapor) { k0 = [0.95, 0.95, 0.93]; k1 = [0.80, 0.84, 0.90]; }
        else if (s.kind === KIND.ret) { k0 = cc; k1 = RET_COL; }
        else if (s.kind === KIND.deliver) { k0 = cc; k1 = [Math.min(1, cc[0] * 1.1 + 0.08), Math.min(1, cc[1] * 1.1 + 0.08), Math.min(1, cc[2] * 1.1 + 0.08)]; }
        col0.set(k0, 3 * p); col1.set(k1, 3 * p);
      }
    }
    return { N, A, Hb, B, C, D, E, col0, col1, lines };
  }

  makeMesh(arr, isDetail) {
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('aCorner', new THREE.Float32BufferAttribute([0, -1, 1, -1, 1, 1, 0, 1], 2));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    for (const [k, a, n] of [['aA', arr.A, 4], ['aH', arr.Hb, 4], ['aB', arr.B, 4], ['aC', arr.C, 4], ['aD', arr.D, 4], ['aE', arr.E, 4], ['aCol0', arr.col0, 3], ['aCol1', arr.col1, 3]]) g.setAttribute(k, new THREE.InstancedBufferAttribute(a, n));
    g.instanceCount = arr.N;
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(430, 0, 320), 2000);
    const mesh = new THREE.Mesh(g, this.material(isDetail));
    mesh.frustumCulled = false; mesh.renderOrder = 6;
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
    this.national = this.makeMesh(arr, false);
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
    const mesh = this.makeMesh(arr, true);
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

  lineMaterial() {
    return new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending,
      uniforms: { ...this.common, uLineAlpha: { value: 0.0 } },
      vertexShader: /* glsl */`
        uniform float uExag, uSel; uniform vec4 uHole;
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
          if (uSel >= 0.0 && abs(aX.w - uSel) > 0.5) vA *= 0.25;
          vCol = aCol;
        }`,
      fragmentShader: /* glsl */`
        uniform float uLineAlpha;
        varying vec3 vCol; varying float vA;
        void main() { gl_FragColor = vec4(vCol * vA * uLineAlpha, 1.0); }`,
    });
  }

  material(isDetail) {
    // the national layer glows (additive: density reads as brightness); up close, streaks are drawn over one another
    // so a busy channel keeps the colour of its use instead of washing out to white
    return new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, depthTest: true, side: THREE.DoubleSide,
      blending: isDetail ? THREE.NormalBlending : THREE.AdditiveBlending, premultipliedAlpha: isDetail,
      uniforms: { ...this.common, uDetail: { value: isDetail ? 1 : 0 }, uLayerAlpha: { value: 1 } },
      vertexShader: /* glsl */`
        uniform float uExag, uTime, uCamDist, uSize, uSpeed, uSel, uHov, uFocusSrc, uTrail, uVapor, uDetail, uModelScale, uAqMode, uAqDepth;
        uniform vec2 uViewport; uniform vec4 uHole;
        uniform float uCat[${CAT_KEYS.length}]; uniform float uCatW[${CAT_KEYS.length}]; uniform float uKind[4];
        attribute vec2 aCorner;
        attribute vec4 aA, aH, aB, aC, aD, aE;
        attribute vec3 aCol0, aCol1;
        varying vec3 vCol; varying float vA, vAlong, vAcross, vLen, vW, vPuff;
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
        }
        void main() {
          float kind = aB.w;
          bool vapor = kind > 0.5 && kind < 1.5;
          float t = fract(uTime * uSpeed / aC.z + aC.w);
          float env = vapor ? smoothstep(0.0, 0.15, t) * (1.0 - smoothstep(0.30, 1.0, t)) : smoothstep(0.0, 0.05, t) * (1.0 - smoothstep(0.90, 1.0, t));
          float cat = aD.y;
          float vis = uCat[int(cat + 0.5)] * uKind[int(kind + 0.5)] * uCatW[int(cat + 0.5)] * (vapor ? uVapor : 1.0);
          if (uSel >= 0.0 && abs(aD.x - uSel) > 0.5) vis *= 0.10;
          // the county under the pointer: its water a little brighter
          else if (uSel < 0.0 && uHov >= 0.0 && abs(aD.x - uHov) < 0.5) vis *= 1.7;
          // a source picked in the Sankey: only intakes from that kind of source stay bright
          if (uFocusSrc >= 0.0 && kind < 0.5) {
            float sc = aD.z;
            bool m = uFocusSrc < 0.5 ? (sc < 0.5 || abs(sc - 5.0) < 0.5) : uFocusSrc < 1.5 ? abs(sc - 1.0) < 0.5 : abs(sc - 2.0) < 0.5;
            if (!m) vis *= 0.05;
          }
          if (uAqMode > 0.001 && abs(aD.z - 1.0) > 0.5) vis *= 1.0 - 0.85 * uAqMode;   // underground view: groundwater only
          // the detail layer covers a disc around the view; the national layer gives way inside it
          float dh = length(aB.xz - uHole.xy);
          float inside = 1.0 - smoothstep(uHole.z, uHole.w, dh);
          vis *= uDetail > 0.5 ? inside : 1.0 - inside;
          vA = env * vis * (vapor ? 0.55 : 1.0) * aE.z;
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
          float maxLen = vapor ? 10.0 : 9.0;
          if (len > maxLen) { sT = sH - dn * maxLen; len = maxLen; }
          vec2 nrm = vec2(-dn.y, dn.x);
          float zoom = clamp(pow(1600.0 / uCamDist, 0.20), 1.0, 2.3);
          float w = uSize * zoom * (vapor ? 1.4 + 1.0 * t : (uDetail > 0.5 ? 1.6 : 1.8));
          vec2 sp = mix(sT, sH, aCorner.x) + dn * (aCorner.x * 2.0 - 1.0) * w * 0.5 + nrm * aCorner.y * w * 0.5;
          // screen-space quad with w = 1 so the shape varyings interpolate linearly across it (no perspective skew)
          float zN = mix(cT.z / cT.w, cH.z / cH.w, aCorner.x);
          gl_Position = vec4(sp / half_, zN, 1.0);
          vAlong = aCorner.x * len + (aCorner.x * 2.0 - 1.0) * w * 0.5; vAcross = aCorner.y * w * 0.5; vLen = len; vW = w;
          vPuff = vapor ? 1.0 : 0.0;
          vCol = mix(aCol0, aCol1, smoothstep(0.04, 0.32, t));   // the colour of the use, after a short start in the colour of the source
        }`,
      fragmentShader: /* glsl */`
        uniform float uAlpha, uLayerAlpha, uDetail;
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
          if (uDetail > 0.5) gl_FragColor = vec4(vCol * 1.5 * a, a * 0.92);
          else gl_FragColor = vec4(vCol * a * uAlpha, 1.0);
        }`,
    });
  }

  /** per frame: brightness by zoom, and the detail layer around the view centre */
  update(camDist, cx, cz) {
    if (!this.mat) return;
    const near = Math.min(1, Math.max(0, (900 - camDist) / 800));
    this.common.uAlpha.value = (0.16 + 0.42 * near) * (1 + 0.5 * this.shared.uNight.value);
    this.common.uVapor.value = 0.35 + 0.65 * near;
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
        dd.lines.material.uniforms.uLineAlpha.value = 0.30 * fade;
        this.hole.set(dd.x, dd.z, dd.radius * 0.80 * fade, dd.radius * Math.max(fade, 0.01));
      }
    } else {
      this.hole.set(0, 0, -1, -1);
      if (this.detail) { this.detail.mesh.material.uniforms.uLayerAlpha.value = 0; this.detail.lines.material.uniforms.uLineAlpha.value = 0; }
    }
  }
}
