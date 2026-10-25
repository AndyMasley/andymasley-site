import * as THREE from 'three';

/**
 * The outline of a selected county: traced from the county raster the map already loads (one pixel is about 0.8 km in
 * the lower 48), smoothed, and drawn as a thin line of constant width over the terrain. Dark ink by day, pale at night,
 * with a casing so it reads over any land.
 */
export class CountyOutline {
  constructor(shared) {
    this.shared = shared;
    this.group = new THREE.Group(); this.group.name = 'county-outline';
    this.mesh = null; this.boxes = null;
    this.uA = { value: 0 };
  }
  /** pixel bounding boxes of every county, by slab: one pass over each raster, the first time one is needed */
  _boxes(slabs) {
    if (this.boxes) return this.boxes;
    const N = 4096, sl = new Int8Array(N).fill(-1), bx = new Int32Array(N * 4);
    slabs.forEach((s, si) => {
      const ids = s.countyIds; if (!ids) return;
      const W = s.countyW, H = s.countyH;
      for (let j = 0; j < H; j++) {
        const row = j * W;
        for (let i = 0; i < W; i++) {
          const id = ids[row + i];
          if (id < 0 || id >= N) continue;
          const o = 4 * id;
          if (sl[id] < 0) { sl[id] = si; bx[o] = i; bx[o + 1] = j; bx[o + 2] = i; bx[o + 3] = j; continue; }
          if (i < bx[o]) bx[o] = i; else if (i > bx[o + 2]) bx[o + 2] = i;
          bx[o + 3] = j;
        }
      }
    });
    this.boxes = { sl, bx };
    return this.boxes;
  }
  /** [slab index, i0, j0, i1, j1] in raster pixels, or null */
  box(slabs, id) {
    const { sl, bx } = this._boxes(slabs);
    if (!(id >= 0 && id < sl.length) || sl[id] < 0) return null;
    return [sl[id], bx[4 * id], bx[4 * id + 1], bx[4 * id + 2], bx[4 * id + 3]];
  }
  /** world-space box of a county: [x0, x1, z0, z1], or null */
  worldBox(slabs, id) {
    const b = this.box(slabs, id); if (!b) return null;
    const s = slabs[b[0]];
    return [s.x0 + b[1] / s.ppu, s.x0 + (b[3] + 1) / s.ppu, s.z0 + b[2] / s.ppu, s.z0 + (b[4] + 1) / s.ppu];
  }
  clear() {
    if (this.mesh) { this.group.remove(this.mesh); this.mesh.geometry.dispose(); this.mesh.material.dispose(); this.mesh = null; }
  }
  set(slabs, id) {
    this.clear();
    if (id < 0) return;
    const b = this.box(slabs, id); if (!b) return;
    const s = slabs[b[0]], ids = s.countyIds, W = s.countyW, H = s.countyH;
    const [, i0, j0, i1, j1] = b;
    const inside = (i, j) => i >= 0 && j >= 0 && i < W && j < H && ids[j * W + i] === id;
    // directed pixel edges with the county on their right, keyed by start corner
    const next = new Map();
    const key = (x, y) => y * (W + 1) + x;
    const edge = (x0, y0, x1, y1) => { const k = key(x0, y0); const e = next.get(k); const v = [x1, y1]; if (e) e.push(v); else next.set(k, [v]); };
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      if (!inside(i, j)) continue;
      if (!inside(i, j - 1)) edge(i, j, i + 1, j);
      if (!inside(i + 1, j)) edge(i + 1, j, i + 1, j + 1);
      if (!inside(i, j + 1)) edge(i + 1, j + 1, i, j + 1);
      if (!inside(i - 1, j)) edge(i, j + 1, i, j);
    }
    // chain the edges into closed loops (every pixel corner kept, so the smoothing below only rounds off the
    // staircase, about a pixel, and never the county's real corners)
    const loops = [];
    for (const [k0, list] of next) {
      while (list.length) {
        const start = [k0 % (W + 1), Math.floor(k0 / (W + 1))];
        const pts = [start];
        let cur = list.pop(), guard = 0;
        while (guard++ < 200000) {
          pts.push(cur);
          const nl = next.get(key(cur[0], cur[1]));
          if (!nl || !nl.length) break;
          cur = nl.pop();
          if (cur[0] === start[0] && cur[1] === start[1]) break;
        }
        if (pts.length >= 4) loops.push(pts);
      }
    }
    if (!loops.length) return;
    // straighten the pixel staircase (Douglas-Peucker within 0.75 px, which leaves real corners alone), cut the
    // result into short pieces, then round it off (Chaikin): diagonal edges come out straight, corners crisp
    const dp = (P, eps) => {
      const keep = new Uint8Array(P.length); keep[0] = keep[P.length - 1] = 1;
      const st = [[0, P.length - 1]];
      while (st.length) {
        const [i0, i1] = st.pop();
        const ax = P[i0][0], ay = P[i0][1], bx = P[i1][0] - ax, by = P[i1][1] - ay, L = Math.hypot(bx, by) || 1;
        let md = 0, mi = -1;
        for (let i = i0 + 1; i < i1; i++) { const d = Math.abs((P[i][0] - ax) * by - (P[i][1] - ay) * bx) / L; if (d > md) { md = d; mi = i; } }
        if (md > eps) { keep[mi] = 1; st.push([i0, mi], [mi, i1]); }
      }
      return P.filter((_, i) => keep[i]);
    };
    const straighten = (loop) => {
      // a closed loop, split at the point furthest from its first
      let far = 0, fd = -1;
      for (let i = 1; i < loop.length; i++) { const d = Math.hypot(loop[i][0] - loop[0][0], loop[i][1] - loop[0][1]); if (d > fd) { fd = d; far = i; } }
      const a = dp(loop.slice(0, far + 1), 0.75), b = dp(loop.slice(far).concat([loop[0]]), 0.75);
      const out = a.slice(0, -1).concat(b.slice(0, -1));
      const fine = [];
      for (let q = 0; q < out.length; q++) {
        const u = out[q], v = out[(q + 1) % out.length], n = Math.max(1, Math.ceil(Math.hypot(v[0] - u[0], v[1] - u[1]) / 1.5));
        for (let k = 0; k < n; k++) fine.push([u[0] + (v[0] - u[0]) * k / n, u[1] + (v[1] - u[1]) * k / n]);
      }
      return fine;
    };
    for (let i = 0; i < loops.length; i++) loops[i] = straighten(loops[i]);
    const smooth = (p) => {
      let a = p;
      for (let it = 0; it < 2; it++) {
        const o = [];
        for (let q = 0; q < a.length; q++) {
          const u = a[q], v = a[(q + 1) % a.length];
          o.push([0.75 * u[0] + 0.25 * v[0], 0.75 * u[1] + 0.25 * v[1]], [0.25 * u[0] + 0.75 * v[0], 0.25 * u[1] + 0.75 * v[1]]);
        }
        a = o;
      }
      return a;
    };
    const pos = [], dir = [], side = [], idx = [];
    let v = 0;
    for (const loop of loops) {
      const P = smooth(loop).map(([x, y]) => [s.x0 + x / s.ppu, s.z0 + y / s.ppu]);
      const n = P.length, base = v;
      for (let q = 0; q < n; q++) {
        const a = P[(q + n - 1) % n], c = P[(q + 1) % n];
        let dx = c[0] - a[0], dz = c[1] - a[1]; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
        const h = Math.max(0, s.sampleH(P[q][0], P[q][1]));
        for (const sd of [-1, 1]) { pos.push(P[q][0], h, P[q][1]); dir.push(dx, dz); side.push(sd); }
        const i = base + 2 * q, j = base + 2 * ((q + 1) % n);
        idx.push(i, i + 1, j, j, i + 1, j + 1);
        v += 2;
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aDir', new THREE.Float32BufferAttribute(dir, 2));
    g.setAttribute('aSide', new THREE.Float32BufferAttribute(side, 1));
    g.setIndex(v > 65000 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(430, 0, 320), 2000);
    const sh = this.shared;
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, depthTest: true, side: THREE.DoubleSide,
      uniforms: { uExag: sh.uExag, uViewport: sh.uViewport, uNight: sh.uNight, uMpu: { value: s.mpu }, uA: this.uA },
      vertexShader: /* glsl */`
        uniform float uExag, uMpu; uniform vec2 uViewport;
        attribute vec2 aDir; attribute float aSide;
        varying float vAcross;
        void main() {
          vec3 P = vec3(position.x, max(position.y, 0.0) * uExag / uMpu, position.z);
          vec4 mv = viewMatrix * vec4(P, 1.0); mv.xyz *= 0.995;
          vec4 c0 = projectionMatrix * mv;
          vec3 dv = (viewMatrix * vec4(aDir.x, 0.0, aDir.y, 0.0)).xyz;
          vec4 c1 = projectionMatrix * (mv + vec4(dv * max(0.05, -mv.z * 0.01), 0.0));
          vec2 s0 = c0.xy / c0.w * uViewport, s1 = c1.xy / c1.w * uViewport;
          vec2 d = s1 - s0; float dl = length(d); d = dl > 1e-5 ? d / dl : vec2(1.0, 0.0);
          float half_ = 2.6;   // a 1.6 px line inside a casing, with room to smooth the edges
          c0.xy += vec2(-d.y, d.x) * aSide * half_ * 2.0 / uViewport * c0.w;
          gl_Position = c0;
          vAcross = aSide * half_;
        }`,
      fragmentShader: /* glsl */`
        uniform float uNight, uA;
        varying float vAcross;
        void main() {
          float d = abs(vAcross);
          float core = 1.0 - smoothstep(0.5, 1.15, d);
          float casing = 1.0 - smoothstep(1.6, 2.5, d);
          vec3 ink = mix(vec3(0.07, 0.07, 0.065), vec3(0.80, 0.79, 0.76), uNight);
          vec3 halo = mix(vec3(0.93, 0.92, 0.88), vec3(0.02, 0.03, 0.03), uNight);
          float a = max(core, casing * 0.55) * uA;
          if (a < 0.01) discard;
          vec3 c = mix(halo, ink, core / max(core + casing * 0.55 * (1.0 - core), 1e-4));
          gl_FragColor = vec4(c * a, a);
        }`,
      blending: THREE.NormalBlending, premultipliedAlpha: true,
    });
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 5;
    this.group.add(this.mesh);
    this.t0 = performance.now();
  }
  update() { this.uA.value = this.mesh ? Math.min(1, (performance.now() - (this.t0 || 0)) / 300) : 0; }
}
