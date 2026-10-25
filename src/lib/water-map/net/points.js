import * as THREE from 'three';

/**
 * Instanced map markers that stay a constant size on screen: every dam in the National Inventory of Dams, and water
 * towers, treatment works, wastewater plants, golf courses and data centers mapped in OpenStreetMap. Each marker
 * carries the camera distance below which it shows, so the map fills in as you zoom.
 */
const hexLin = (h) => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; };

export class PointLayer {
  /**
   * items: { x: Float32Array, z: Float32Array, n, kind: Uint8Array, size: Float32Array (0..1), dmax: Float32Array }
   * kinds: [{ color, shape (0 disc, 1 square, 2 diamond, 3 ring, 4 bar), px }]
   */
  constructor(shared, items, kinds, slabAt, name) {
    this.shared = shared; this.items = items; this.kinds = kinds; this.name = name;
    this.group = new THREE.Group(); this.group.name = name;
    const n = items.n;
    const pos = new Float32Array(n * 3), att = new Float32Array(n * 4), col = new Float32Array(n * 3);
    this.h = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = items.x[i], z = items.z[i];
      const s = slabAt(x, z);
      const h = s ? Math.max(0, s.sampleH(x, z)) / s.mpu : 0;
      this.h[i] = h;
      pos[3 * i] = x; pos[3 * i + 1] = h; pos[3 * i + 2] = z;
      const k = kinds[items.kind[i]] || kinds[0];
      att[4 * i] = items.size[i]; att[4 * i + 1] = items.dmax[i]; att[4 * i + 2] = k.shape; att[4 * i + 3] = items.kind[i];
      col.set(hexLin(k.color), 3 * i);
    }
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('aCorner', new THREE.Float32BufferAttribute([-1, -1, 1, -1, 1, 1, -1, 1], 2));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    g.setAttribute('aPos', new THREE.InstancedBufferAttribute(pos, 3));
    g.setAttribute('aAtt', new THREE.InstancedBufferAttribute(att, 4));
    g.setAttribute('aCol', new THREE.InstancedBufferAttribute(col, 3));
    g.instanceCount = n;
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(430, 0, 320), 3000);
    this.kindVis = new Float32Array(8).fill(1);
    this.kindBoost = new Float32Array(8).fill(1);   // multiplies dmax (e.g. data centers shown nationally)
    this.uniforms = {
      uExag: shared.uExag, uCamDist: shared.uCamDist, uViewport: shared.uViewport, uNight: shared.uNight,
      uKindVis: { value: this.kindVis }, uKindBoost: { value: this.kindBoost }, uHover: { value: -1 }, uSel: { value: -1 }, uPx: { value: 1 }, uFade: { value: 1 },
    };
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, depthTest: true,
      uniforms: this.uniforms,
      vertexShader: /* glsl */`
        uniform float uExag, uCamDist, uPx, uNight;
        uniform vec2 uViewport;
        uniform float uKindVis[8], uKindBoost[8], uHover, uSel;
        attribute vec2 aCorner; attribute vec3 aPos, aCol; attribute vec4 aAtt;
        varying vec2 vUv; varying vec3 vCol; varying float vShape, vA, vHi;
        void main() {
          int k = int(aAtt.w + 0.5);
          float dmax = aAtt.y * uKindBoost[k];
          float vis = uKindVis[k] * (1.0 - smoothstep(dmax * 0.75, dmax, uCamDist));
          float hi = (abs(float(gl_InstanceID) - uHover) < 0.5 || abs(float(gl_InstanceID) - uSel) < 0.5) ? 1.0 : 0.0;
          vis = max(vis, hi);
          if (vis < 0.01) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
          vec4 c = projectionMatrix * viewMatrix * vec4(aPos.x, aPos.y * uExag + 0.02, aPos.z, 1.0);
          float px = uPx * (2.2 + 6.0 * aAtt.x) * (1.0 + 0.6 * hi) * (aAtt.z > 3.5 ? 0.8 : 1.0);
          vec2 off = aCorner * px / uViewport * 2.0;
          if (aAtt.z > 3.5) off.x *= 0.55;   // dams: an upright bar
          c.xy += off * c.w;
          c.z -= 0.0004 * c.w;
          gl_Position = c;
          vUv = aCorner; vCol = aCol; vShape = aAtt.z; vA = vis; vHi = hi;
        }`,
      fragmentShader: /* glsl */`
        uniform float uNight, uFade;
        varying vec2 vUv; varying vec3 vCol; varying float vShape, vA, vHi;
        void main() {
          float d;
          if (vShape < 0.5) d = length(vUv);                                   // disc
          else if (vShape < 1.5) d = max(abs(vUv.x), abs(vUv.y)) * 1.08;        // square
          else if (vShape < 2.5) d = (abs(vUv.x) + abs(vUv.y)) * 0.86;         // diamond
          else if (vShape < 3.5) d = length(vUv);                              // ring
          else d = max(abs(vUv.x), abs(vUv.y));                                // bar
          float aa = fwidth(d) * 1.2;
          float body = 1.0 - smoothstep(0.78 - aa, 0.78 + aa, d);
          float rim = 1.0 - smoothstep(1.0 - aa, 1.0, d);
          vec3 c = vCol;
          if (vShape > 2.5 && vShape < 3.5) body *= smoothstep(0.30, 0.42, d);  // ring: hollow centre
          float a = max(body, rim * 0.85);
          if (a < 0.01) discard;
          vec3 col = mix(vec3(0.03, 0.04, 0.05), c * mix(0.9, 1.1, uNight) * (1.0 + 0.6 * vHi), body);
          // dams are many and small: quieter than the facilities unless picked out
          float quiet = vShape > 3.5 ? mix(0.62, 1.0, vHi) : 1.0;
          gl_FragColor = vec4(col, a * vA * uFade * quiet);
        }`,
    });
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 7;
    this.group.add(this.mesh);
    // spatial grid for picking
    this.cell = 2;
    this.grid = new Map();
    for (let i = 0; i < n; i++) {
      const key = `${Math.floor(items.x[i] / this.cell)},${Math.floor(items.z[i] / this.cell)}`;
      let a = this.grid.get(key); if (!a) this.grid.set(key, (a = [])); a.push(i);
    }
    this._v = new THREE.Vector3();
  }
  setPx(px) { this.uniforms.uPx.value = px; }
  dispose() { this.mesh.geometry.dispose(); this.mesh.material.dispose(); }
  visibleAt(i, d) {
    const k = this.items.kind[i];
    return this.kindVis[k] > 0.5 && d < this.items.dmax[i] * this.kindBoost[k] * 0.9;
  }
  /** nearest visible marker to a screen point (within radius px) */
  pick(camera, cx, cy, rect, ground, d, radiusPx = 9) {
    if (!this.group.visible || !ground) return -1;
    const exag = this.shared.uExag.value;
    const worldPerPx = d * 2 * Math.tan((camera.fov * Math.PI) / 360) / rect.height;
    const R = Math.max(0.05, worldPerPx * radiusPx * 3);
    const i0 = Math.floor((ground.x - R) / this.cell), i1 = Math.floor((ground.x + R) / this.cell);
    const j0 = Math.floor((ground.z - R) / this.cell), j1 = Math.floor((ground.z + R) / this.cell);
    let best = -1, bd = radiusPx;
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const a = this.grid.get(`${i},${j}`); if (!a) continue;
      for (const k of a) {
        if (!this.visibleAt(k, d)) continue;
        this._v.set(this.items.x[k], this.h[k] * exag + 0.02, this.items.z[k]).project(camera);
        const sx = (this._v.x * 0.5 + 0.5) * rect.width + rect.left, sy = (-this._v.y * 0.5 + 0.5) * rect.height + rect.top;
        const dd = Math.hypot(sx - cx, sy - cy) - 2.5 * this.items.size[k];
        if (dd < bd) { bd = dd; best = k; }
      }
    }
    return best;
  }
}
