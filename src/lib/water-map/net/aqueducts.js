import * as THREE from 'three';
import { AQ_FLOWS } from '../core/flows_data.js';

/**
 * Major canals and aqueducts from OpenStreetMap: the plumbing that moves water between basins (the California
 * Aqueduct, the Central Arizona Project, the Colorado River Aqueduct, the All-American Canal, New York's Catskill and
 * Delaware aqueducts and others). Drawn as channels wider for more measured flow; tunnels and pipelines are dashed. OpenStreetMap's mapping of some systems is incomplete, so the hover card gives the mapped length;
 * the Colorado River Aqueduct, mostly tunnels and barely in OpenStreetMap, is drawn from the USGS National
 * Hydrography Dataset instead (scripts/water-map/bake_nhd_aqueducts.py, `geom: 'nhd'`).
 */

// approximate source of each system (lon, lat): only used to point the animation downstream
const SOURCES = {
  'California Aqueduct': [-121.56, 37.80], 'San Luis Canal': [-121.0, 37.3], 'East Branch': [-118.8, 34.95], 'West Branch': [-118.8, 34.95],
  'South Bay Aqueduct': [-121.60, 37.78], 'Delta-Mendota Canal': [-121.58, 37.80], 'Friant-Kern Canal': [-119.71, 37.00], 'Madera Canal': [-119.71, 37.00],
  'Contra Costa Canal': [-121.64, 37.97], 'Folsom South Canal': [-121.22, 38.63], 'Corning Canal': [-122.20, 40.15], 'Putah South Canal': [-122.10, 38.51],
  'Cross Valley Canal': [-119.15, 35.33], 'Kern River Canal': [-119.15, 35.33], 'Mokelumne Aqueduct': [-120.85, 38.25],
  'Los Angeles Aqueduct': [-118.2, 37.0], 'Second Los Angeles Aqueduct': [-118.2, 37.0], 'San Diego Aqueduct': [-117.05, 33.79],
  'Colorado River Aqueduct': [-114.15, 34.31], 'Coachella Canal': [-114.98, 32.73], 'All-American Canal': [-114.46, 32.88],
  'East Highline Canal': [-115.3, 32.70], 'Westside Main Canal': [-115.6, 32.66], 'Central Arizona Project Canal': [-114.15, 34.30],
  'Gila Gravity Main Canal': [-114.46, 32.88], 'Yuma Main Canal': [-114.62, 32.73], 'Arizona Canal': [-111.69, 33.51], 'Grand Canal': [-111.69, 33.51],
  'Consolidated Canal': [-111.69, 33.51], 'Western Canal': [-111.69, 33.51], 'Highline Canal': [-111.69, 33.51], 'Roza Canal': [-120.47, 46.75],
  'Sunnyside Canal': [-120.43, 46.50], 'East Low Canal': [-119.3, 47.6], 'Main Canal': [-119.3, 47.6], 'West Canal': [-119.3, 47.6],
  'Twin Falls Main Canal': [-114.03, 42.53], 'Truckee Canal': [-119.44, 39.59], 'Tri-County Supply Canal': [-100.9, 41.1], 'Sutherland Supply Canal': [-101.6, 41.2],
  'Franklin Canal': [-106.53, 31.80], 'Riverside Canal': [-106.53, 31.80], 'American Canal': [-106.53, 31.80], 'Rio Grande Canal': [-106.4, 37.7],
  'Catskill Aqueduct': [-74.2, 41.95], 'Delaware Aqueduct': [-74.45, 41.83], 'New Croton Aqueduct': [-73.86, 41.22],
};

export class Aqueducts {
  constructor(shared, features, slabAt, project) {
    this.shared = shared; this.slabAt = slabAt;
    this.group = new THREE.Group(); this.group.name = 'aqueducts';
    this.items = [];
    const pos = [], dir = [], side = [], dist = [], under = [], vol = [], idx = [];
    let vc = 0;
    const grid = new Map(), cell = 2;
    for (const [ai, a] of features.aqueducts.entries()) {
      const src = SOURCES[a.name] ? project(SOURCES[a.name][0], SOURCES[a.name][1]) : null;
      const fl = AQ_FLOWS[a.name] || null;
      this.items.push({ name: a.name, kind: a.kind, op: a.op, km: a.km, flow: fl, geom: a.geom });
      const v = fl ? fl.mgd * (fl.share || 1) : 0;
      for (const sg of a.segs) {
        let pts = [];
        for (let i = 0; i < sg.p.length; i += 2) pts.push([sg.p[i], sg.p[i + 1]]);
        if (pts.length < 2) continue;
        // point the segment away from the system's source
        if (src) {
          const d0 = Math.hypot(pts[0][0] - src[0], pts[0][1] - src[1]), d1 = Math.hypot(pts[pts.length - 1][0] - src[0], pts[pts.length - 1][1] - src[1]);
          if (d1 < d0) pts = pts.reverse();
        }
        // densify so the ribbon follows the terrain
        const dense = [pts[0]];
        for (let k = 1; k < pts.length; k++) {
          const [x0, z0] = dense[dense.length - 1], [x1, z1] = pts[k];
          const L = Math.hypot(x1 - x0, z1 - z0), m = Math.ceil(L / 0.3);
          for (let j = 1; j <= m; j++) dense.push([x0 + (x1 - x0) * j / m, z0 + (z1 - z0) * j / m]);
        }
        const d0 = src ? Math.hypot(dense[0][0] - src[0], dense[0][1] - src[1]) : 0;
        let acc = d0;
        const base = vc;
        for (let k = 0; k < dense.length; k++) {
          const a0 = dense[Math.max(0, k - 1)], a1 = dense[Math.min(dense.length - 1, k + 1)];
          let dx = a1[0] - a0[0], dz = a1[1] - a0[1]; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
          if (k > 0) acc += Math.hypot(dense[k][0] - dense[k - 1][0], dense[k][1] - dense[k - 1][1]);
          const s = slabAt(dense[k][0], dense[k][1]);
          const h = s ? Math.max(0, s.sampleH(dense[k][0], dense[k][1])) / s.mpu : 0;
          for (const sd of [-1, 1]) { pos.push(dense[k][0], h, dense[k][1]); dir.push(dx, dz); side.push(sd); dist.push(acc); under.push(sg.u ? 1 : 0); vol.push(v); }
          if (k < dense.length - 1) { const v = base + 2 * k; idx.push(v, v + 1, v + 2, v + 2, v + 1, v + 3); }
          vc += 2;
          const key = `${Math.floor(dense[k][0] / cell)},${Math.floor(dense[k][1] / cell)}`;
          let arr = grid.get(key); if (!arr) grid.set(key, (arr = [])); arr.push([dense[k][0], dense[k][1], ai]);
        }
      }
    }
    this.grid = grid; this.cell = cell;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aDir', new THREE.Float32BufferAttribute(dir, 2));
    g.setAttribute('aSide', new THREE.Float32BufferAttribute(side, 1));
    g.setAttribute('aDist', new THREE.Float32BufferAttribute(dist, 1));
    g.setAttribute('aUnder', new THREE.Float32BufferAttribute(under, 1));
    g.setAttribute('aVol', new THREE.Float32BufferAttribute(vol, 1));
    g.setIndex(vc > 65000 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(430, 0, 320), 2000);
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, depthTest: true, side: THREE.DoubleSide,
      uniforms: { uExag: shared.uExag, uTime: shared.uTime, uViewport: shared.uViewport, uCamDist: shared.uCamDist, uHi: { value: -1 }, uFade: { value: 1 }, uNight: shared.uNight },
      vertexShader: /* glsl */`
        uniform float uExag, uCamDist; uniform vec2 uViewport;
        attribute vec2 aDir; attribute float aSide, aDist, aUnder, aVol;
        varying float vSide, vDist, vUnder, vW, vVol;
        void main() {
          vec3 P = vec3(position.x, position.y * uExag, position.z);
          vec4 mv = viewMatrix * vec4(P, 1.0); mv.xyz *= 0.995;
          vec4 c0 = projectionMatrix * mv;
          vec3 dv = (viewMatrix * vec4(aDir.x, 0.0, aDir.y, 0.0)).xyz;
          vec4 c1 = projectionMatrix * (mv + vec4(dv * max(0.05, -mv.z * 0.01), 0.0));
          vec2 s0 = c0.xy / c0.w * uViewport, s1 = c1.xy / c1.w * uViewport;
          vec2 d = s1 - s0; float dl = length(d); d = dl > 1e-5 ? d / dl : vec2(1.0, 0.0);
          // wider for more water: a measured flow sets the width on the channels' own scale (chanPx in
          // flow/particles.js: ten times the water, about four times as wide); unmeasured canals stay thin
          float w = aVol > 0.0 ? max(1.6, 0.1585 * pow(aVol, 0.6)) : clamp(1.4 * pow(900.0 / uCamDist, 0.25), 1.2, 2.0);
          c0.xy += vec2(-d.y, d.x) * aSide * (w * 0.5 + 1.0) * 2.0 / uViewport * c0.w;
          gl_Position = c0;
          vSide = aSide; vDist = aDist; vUnder = aUnder; vW = w; vVol = aVol;
        }`,
      fragmentShader: /* glsl */`
        uniform float uTime, uCamDist, uFade, uNight;
        varying float vSide, vDist, vUnder, vW, vVol;
        void main() {
          float px = abs(vSide) * (vW * 0.5 + 1.0);
          float a = 1.0 - smoothstep(vW * 0.5 - 0.6, vW * 0.5 + 0.6, px);
          // tunnels and pipelines: dashed
          float period = max(0.6, uCamDist * 0.012);
          if (vUnder > 0.5) a *= step(0.45, fract(vDist / period));
          if (a < 0.01) discard;
          // a canal: river-blue water between pale concrete banks, still like the rivers (the moving light on the map
          // is the water people withdraw)
          vec3 wall = mix(vec3(0.55, 0.60, 0.62), vec3(0.16, 0.20, 0.24), uNight);
          vec3 water = mix(vec3(0.10, 0.36, 0.66), vec3(0.025, 0.14, 0.36), uNight);
          vec3 c = mix(water, wall, smoothstep(0.35, 0.95, abs(vSide)));
          gl_FragColor = vec4(c, a * 0.95 * uFade);
        }`,
    });
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 4;
    this.group.add(this.mesh);
    this.mat = mat;
  }
  update(camDist) { this.mat.uniforms.uFade.value = Math.min(1, Math.max(0, (1400 - camDist) / 500)); this.group.visible = camDist < 1400 && this.enabled !== false; }
  pick(x, z, radius) {
    let best = null;
    const i0 = Math.floor((x - radius) / this.cell), i1 = Math.floor((x + radius) / this.cell), j0 = Math.floor((z - radius) / this.cell), j1 = Math.floor((z + radius) / this.cell);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const a = this.grid.get(`${i},${j}`); if (!a) continue;
      for (const [px, pz, ai] of a) { const d = Math.hypot(px - x, pz - z); if (d < radius && (!best || d < best.d)) best = { d, ai }; }
    }
    return best ? this.items[best.ai] : null;
  }
}
