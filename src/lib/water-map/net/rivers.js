import * as THREE from 'three';
import { fetchPacked, fetchJSON } from '../core/assets.js';
import { EFF_HEIGHT_GLSL } from '../world/slab.js';

/**
 * Rivers from HydroRIVERS (Lehner & Grill 2013): every reach with a modelled long-term mean natural discharge of at
 * least 0.8 m3/s in the lower 48 (2 m3/s in Alaska). Drawn as screen-space ribbons on the terrain, wider for more
 * discharge, with light pulses travelling downstream. Small rivers fade in as you zoom.
 */

const SUBDIV = 0.4;   // max world units between ribbon vertices (keeps ribbons on the terrain)

export function parseRivers(buf, slab, names) {
  const dv = new DataView(buf);
  const magic = String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3));
  if (magic !== 'RIV2') throw new Error('bad river file');
  const n = dv.getUint32(4, true), nv = dv.getUint32(8, true);
  let o = 16;
  const take = (T, cnt) => { const a = new T(buf, o, cnt); o += a.byteLength; return a; };
  const next = take(Int32Array, n), basin = take(Int32Array, n), q = take(Float32Array, n), dd = take(Float32Array, n), lk = take(Float32Array, n);
  const nvs = take(Uint16Array, n), name = take(Uint16Array, n), order = take(Uint8Array, n);
  o += (4 - (o % 4)) % 4;
  const xzq = take(Uint16Array, nv * 2);
  const [rx0, ry0, rx1, ry1] = slab.rect, [ox, oy] = slab.offset;
  const x = new Float32Array(nv), z = new Float32Array(nv);
  for (let i = 0; i < nv; i++) {
    x[i] = rx0 + ox + (xzq[2 * i] / 65535) * (rx1 - rx0);
    z[i] = ry0 + oy + (xzq[2 * i + 1] / 65535) * (ry1 - ry0);
  }
  const start = new Uint32Array(n);
  for (let i = 1; i < n; i++) start[i] = start[i - 1] + nvs[i - 1];
  return { slab, n, nv, next, basin, q, dd, lk, nvs, name, order, x, z, start, names };
}

/** World width (units) of a river with mean discharge q (m3/s): hydraulic geometry w ~ 7 q^0.5 metres. */
const worldWidth = (q, mpu) => (7 * Math.sqrt(q)) / mpu;

function buildTier(R, slabObj, filter) {
  let bx0 = Infinity, bx1 = -Infinity, bz0 = Infinity, bz1 = -Infinity;
  const pos = [], dir = [], side = [], qa = [], dist = [], us = [], idx = [], reachId = [];
  const mpu = slabObj.mpu;
  let vcount = 0;
  for (let r = 0; r < R.n; r++) {
    const q = R.q[r];
    if (!filter(r)) continue;
    const s0 = R.start[r], cnt = R.nvs[r];
    // densify
    const px = [], pz = [];
    for (let k = 0; k < cnt; k++) {
      const x = R.x[s0 + k], z = R.z[s0 + k];
      if (k > 0) {
        const x0 = px[px.length - 1], z0 = pz[pz.length - 1];
        const L = Math.hypot(x - x0, z - z0), m = Math.ceil(L / SUBDIV);
        for (let j = 1; j < m; j++) { px.push(x0 + ((x - x0) * j) / m); pz.push(z0 + ((z - z0) * j) / m); }
      }
      px.push(x); pz.push(z);
    }
    const m = px.length;
    if (m < 2) continue;
    // cumulative length from the downstream end (km)
    const seg = new Float32Array(m); let tot = 0;
    for (let k = m - 2; k >= 0; k--) { tot += Math.hypot(px[k + 1] - px[k], pz[k + 1] - pz[k]); seg[k] = tot; }
    const kmPerUnit = tot > 0 ? R.lk[r] / tot : 0;
    const base = vcount;
    for (let k = 0; k < m; k++) {
      const a = Math.max(0, k - 1), b = Math.min(m - 1, k + 1);
      let dx = px[b] - px[a], dz = pz[b] - pz[a]; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      const h = Math.max(slabObj.sampleH(px[k], pz[k]), 0);
      const isUS = (slabObj.maskAt(px[k], pz[k]) & 4) ? 1 : 0;
      const dkm = R.dd[r] + seg[k] * kmPerUnit;
      for (const sd of [-1, 1]) {
        pos.push(px[k], h, pz[k]); dir.push(dx, dz); side.push(sd); qa.push(q); dist.push(dkm); us.push(isUS); reachId.push(r);
        if (px[k] < bx0) bx0 = px[k]; if (px[k] > bx1) bx1 = px[k]; if (pz[k] < bz0) bz0 = pz[k]; if (pz[k] > bz1) bz1 = pz[k];
      }
      if (k < m - 1) { const v = base + 2 * k; idx.push(v, v + 1, v + 2, v + 2, v + 1, v + 3); }
      vcount += 2;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aDir', new THREE.Float32BufferAttribute(dir, 2));
  g.setAttribute('aSide', new THREE.Float32BufferAttribute(side, 1));
  g.setAttribute('aQ', new THREE.Float32BufferAttribute(qa, 1));
  g.setAttribute('aDist', new THREE.Float32BufferAttribute(dist, 1));
  g.setAttribute('aUS', new THREE.Float32BufferAttribute(us, 1));
  g.setIndex(vcount > 65000 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
  // heights are stored in metres; bound the mesh in world units (up to ~5 km of relief at the strongest exaggeration)
  if (vcount) {
    const box = new THREE.Box3(new THREE.Vector3(bx0 - 1, -1, bz0 - 1), new THREE.Vector3(bx1 + 1, 25, bz1 + 1));
    g.boundingBox = box; g.boundingSphere = box.getBoundingSphere(new THREE.Sphere());
  }
  return { g, verts: vcount };
}

export function createRiverMaterial(slabObj, shared) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, depthTest: true, fog: true, side: THREE.DoubleSide,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uMpu: { value: slabObj.mpu }, uColorTex: { value: slabObj.colorTex },
      uColorMap: { value: new THREE.Vector4(slabObj.x0, slabObj.z0, slabObj.ppu / slabObj.texW, slabObj.ppu / slabObj.texH) },
      uQCut: { value: 10 }, uZoomW: { value: 1 }, uBright: { value: 1 }, uSelBasin: { value: -1 },
    }]),
    vertexShader: /* glsl */`
      #include <fog_pars_vertex>
      uniform float uExag, uMpu, uQCut, uZoomW, uFocalPx;
      uniform vec2 uViewport;
      attribute vec2 aDir; attribute float aSide, aQ, aDist, aUS;
      varying float vSide, vQ, vDist, vVis, vW, vUS;
      varying vec2 vColorUv;
      uniform vec4 uColorMap;
      ${EFF_HEIGHT_GLSL}
      void main() {
        float y = max(position.y, 0.0) * uExag / uMpu;
        vec3 P = vec3(position.x, y, position.z);
        vec4 mv = viewMatrix * vec4(P, 1.0);
        mv.xyz *= 0.996;   // pull slightly towards the camera so the ribbon stays on top of coarser terrain LODs
        vec4 c0 = projectionMatrix * mv;
        vec3 dirV = (viewMatrix * vec4(aDir.x, 0.0, aDir.y, 0.0)).xyz;
        vec4 c1 = projectionMatrix * (mv + vec4(dirV * max(0.05, -mv.z * 0.01), 0.0));
        vec2 s0 = c0.xy / c0.w * uViewport, s1 = c1.xy / c1.w * uViewport;
        vec2 d = s1 - s0; float dl = length(d); d = dl > 1e-5 ? d / dl : vec2(1.0, 0.0);
        vec2 nrm = vec2(-d.y, d.x);
        // width in pixels: a minimum that grows with discharge, or the real channel width when that is larger
        float minPx = (0.35 + 0.85 * max(0.0, log(aQ) / 2.302585 - 0.45)) * uZoomW;
        float realPx = 7.0 * sqrt(aQ) / uMpu * uFocalPx / max(1e-3, -mv.z);
        float w = max(minPx, realPx);
        vVis = smoothstep(uQCut * 0.45, uQCut * 1.4, aQ);
        float wq = w * mix(0.35, 1.0, vVis);
        vW = wq; vSide = aSide; vQ = aQ; vDist = aDist; vUS = aUS;
        c0.xy += nrm * aSide * (wq * 0.5 + 1.0) * 2.0 / uViewport * c0.w;
        gl_Position = c0;
        vColorUv = vec2((P.x - uColorMap.x) * uColorMap.z, (P.z - uColorMap.y) * uColorMap.w);
        vec4 mvPosition = mv;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      #include <fog_pars_fragment>
      uniform float uTime, uBright, uNight;
      uniform float uCamDist;
      uniform sampler2D uColorTex;
      varying float vSide, vQ, vDist, vVis, vW, vUS;
      varying vec2 vColorUv;
      void main() {
        float px = abs(vSide) * (vW * 0.5 + 1.0);
        float edge = 1.0 - smoothstep(vW * 0.5 - 0.6, vW * 0.5 + 0.6, px);
        float a = edge * vVis;
        // fade inside lakes and reservoirs (the water surface is drawn by the terrain)
        float lake = 1.0 - smoothstep(0.12, 0.38, texture2D(uColorTex, vColorUv).a);
        a *= 1.0 - lake;
        if (a < 0.01) discard;
        float lq = log(vQ) / 2.302585;   // log10 of discharge
        float big = clamp(0.1 + 0.22 * lq, 0.0, 1.0);
        vec3 deep = vec3(0.010, 0.060, 0.150), light = vec3(0.050, 0.230, 0.500);
        vec3 c = mix(deep, light, big);
        // a brighter core: moving water catching the sky
        c += vec3(0.04, 0.10, 0.17) * (1.0 - smoothstep(0.0, 0.75, abs(vSide))) * big;
        // water moving downstream: streaks in two or three lanes, more of them on bigger rivers; spacing and speed
        // scale with the view so they read at every zoom
        float period = max(5.0, uCamDist * 0.30) / (0.7 + 0.5 * big);
        float lane = floor((vSide * 0.5 + 0.5) * (vW > 5.0 ? 2.999 : 0.999));
        float ph = fract((vDist + uTime * period * 0.25) / period + lane * 0.43);
        float pulse = smoothstep(0.0, 0.05, ph) * (1.0 - smoothstep(0.05, 0.35, ph));
        c += vec3(0.10, 0.22, 0.32) * pulse * big;
        // night: the rivers glow, brightest where the most water flows
        vec3 night = vec3(0.012, 0.090, 0.260) * (0.22 + 1.05 * big) + vec3(0.30, 0.72, 1.0) * pulse * (0.12 + 1.6 * big * big);
        c = mix(c, night, uNight);
        c *= uBright * mix(0.6, 1.0, vUS);
        gl_FragColor = vec4(c, a * mix(mix(0.45, 0.95, big), mix(0.35, 1.0, big), uNight) * mix(0.55, 1.0, vUS));
        #include <fog_fragment>
      }`,
  });
}

export class RiverNet {
  constructor(shared) {
    this.shared = shared;
    this.group = new THREE.Group(); this.group.name = 'rivers';
    this.slabs = [];   // { R, slab, tiers: [{mesh, qlo, qhi}], mat }
  }
  async load(slabByName) {
    const names = ['conus', 'ak', 'pr'];
    await Promise.all(names.map(async (n) => {
      const slab = slabByName[n];
      const [buf, nm] = await Promise.all([fetchPacked(`rivers_${n}.dat.png`), fetchJSON(`rivers_${n}_names.json`)]);
      const R = parseRivers(buf, slab, nm);
      this._build(R, slab);
    }));
    return this;
  }
  _build(R, slab) {
    const mat = createRiverMaterial(slab, this.shared);
    for (const k of ['uExag', 'uTime', 'uViewport', 'uFocalPx', 'uCamDist', 'uNight']) mat.uniforms[k] = this.shared[k];
    // three discharge tiers; the smaller two split into map tiles so close views draw only what is on screen
    const tiers = [];
    const spec = [{ qlo: 25, qhi: Infinity, tile: 0 }, { qlo: 4, qhi: 25, tile: 240 }, { qlo: 0, qhi: 4, tile: 110 }];
    const first = (r) => R.start[r];
    for (const t of spec) {
      const buckets = new Map();
      for (let r = 0; r < R.n; r++) {
        const q = R.q[r];
        if (q < t.qlo || q >= t.qhi) continue;
        const key = t.tile ? `${Math.floor(R.x[first(r)] / t.tile)},${Math.floor(R.z[first(r)] / t.tile)}` : 'all';
        let b = buckets.get(key); if (!b) buckets.set(key, (b = new Set())); b.add(r);
      }
      for (const [key, set] of buckets) {
        const { g, verts } = buildTier(R, slab, (r) => set.has(r));
        if (!verts) continue;
        const mesh = new THREE.Mesh(g, mat);
        mesh.frustumCulled = true; mesh.renderOrder = 4; mesh.name = `rivers-${slab.name}-${t.qlo}-${key}`;
        this.group.add(mesh);
        tiers.push({ qlo: t.qlo, qhi: t.qhi, mesh, verts });
      }
    }
    // spatial index of vertices for hover picking
    const cell = 2.0, grid = new Map();
    for (let r = 0; r < R.n; r++) {
      for (let k = 0; k < R.nvs[r]; k++) {
        const v = R.start[r] + k, key = `${Math.floor(R.x[v] / cell)},${Math.floor(R.z[v] / cell)}`;
        let a = grid.get(key); if (!a) grid.set(key, (a = [])); a.push(v);
      }
    }
    const reachOf = new Uint32Array(R.nv);
    for (let r = 0; r < R.n; r++) for (let k = 0; k < R.nvs[r]; k++) reachOf[R.start[r] + k] = r;
    this.slabs.push({ R, slab, tiers, mat, grid, cell, reachOf });
  }
  /** per-frame: which tiers to draw and the discharge cut-off for the zoom */
  update(camDist) {
    const qcut = 40 * Math.pow(camDist / 1600, 1.2);
    const zoomW = Math.min(2.4, Math.max(1, Math.pow(1600 / camDist, 0.25)));
    for (const s of this.slabs) {
      s.mat.uniforms.uQCut.value = qcut; s.mat.uniforms.uZoomW.value = zoomW;
      for (const t of s.tiers) t.mesh.visible = t.qhi > qcut * 0.45;
    }
    this.qcut = qcut;
  }
  /** nearest visible river reach to a ground point; prefers bigger rivers among near ties */
  pick(x, z, radius) {
    let best = null;
    for (const s of this.slabs) {
      if (!s.slab.contains(x, z, radius)) continue;
      const { R, grid, cell, reachOf } = s;
      const i0 = Math.floor((x - radius) / cell), i1 = Math.floor((x + radius) / cell), j0 = Math.floor((z - radius) / cell), j1 = Math.floor((z + radius) / cell);
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
        const a = grid.get(`${i},${j}`); if (!a) continue;
        for (const v of a) {
          const r = reachOf[v], q = R.q[r];
          if (q < this.qcut * 0.6) continue;
          const d = Math.hypot(R.x[v] - x, R.z[v] - z);
          if (d > radius) continue;
          const score = d / radius - 0.08 * Math.log10(q);
          if (!best || score < best.score) best = { score, s, r, v, d };
        }
      }
    }
    if (!best) return null;
    const { s, r, v } = best, R = s.R;
    return { slab: s.slab.name, reach: r, x: R.x[v], z: R.z[v], q: R.q[r], name: R.name[r] ? R.names[R.name[r] - 1] : null, distKm: R.dd[r], order: R.order[r], R };
  }
}
