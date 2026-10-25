import * as THREE from 'three';
import { EFF_HEIGHT_GLSL } from './slab.js';
import { CHUNK, STRIDES, chunkGeometry } from './terrain.js';

/**
 * The underground view: every principal aquifer on the USGS map as a solid body under the land, which turns to glass
 * above it. The bodies are built on the terrain's own chunked grid: vertices inside an aquifer sit a fixed depth below
 * the surface, vertices just outside drop to the body's floor (so the outer edges become walls), and everything
 * farther out is discarded. The outlines and the colours come from the aquifer map; the depth (uAqDepth) and the
 * thickness (uAqThick) are drawn the same everywhere and scale with the view, so they say nothing about real depths.
 * The tops glow with the groundwater each county pumped per square mile in 2015.
 */
export class SubsurfaceSlab {
  constructor(slab, shared) {
    this.slab = slab;
    this.group = new THREE.Group(); this.group.name = `aquifers-${slab.name}`;
    const base = {
      uHeight: { value: slab.heightTex },
      uSize: { value: new THREE.Vector2(slab.W, slab.H) },
      uRect: { value: new THREE.Vector4(slab.x0, slab.z0, 1 / slab.hpu, slab.mpu) },
      uColorMap: { value: new THREE.Vector4(slab.x0, slab.z0, slab.ppu / slab.texW, slab.ppu / slab.texH) },
      uAqTex: { value: slab.aquiferTex }, uCounty: { value: slab.countyTex },
      uAqPal: shared.uAqPal, uGwTex: shared.uGwTex, uExag: shared.uExag, uAqDepth: shared.uAqDepth, uAqThick: shared.uAqThick,
      uAqMode: shared.uAqMode, uNight: shared.uNight, uSunDir: shared.uSunDir, uAqHover: shared.uAqHover, uAqSel: shared.uAqSel,
    };
    // conservative height bounds per chunk, as the terrain keeps them
    this.chunks = [];
    this.cx = Math.ceil((slab.W - 1) / CHUNK); this.cz = Math.ceil((slab.H - 1) / CHUNK);
    for (let j = 0; j < this.cz; j++) for (let i = 0; i < this.cx; i++) {
      let hi = -Infinity, any = false;
      for (let y = j * CHUNK; y <= Math.min(slab.H - 1, (j + 1) * CHUNK); y += 4) for (let x = i * CHUNK; x <= Math.min(slab.W - 1, (i + 1) * CHUNK); x += 4) {
        const h = slab.heights[y * slab.W + x]; if (h > hi) hi = h;
        if (!any && slab.aquiferIds) {
          const ax = Math.floor(((x + 0.5) / slab.hpu) * slab.ppu / 2), ay = Math.floor(((y + 0.5) / slab.hpu) * slab.ppu / 2);
          if (ax < slab.aquiferW && ay < slab.aquiferH && slab.aquiferIds[ay * slab.aquiferW + ax] > 0) any = true;
        }
      }
      if (!any) continue;   // no aquifer in this chunk: never drawn
      this.chunks.push({ i, j, hi,
        x0: slab.x0 + (i * CHUNK) / slab.hpu, x1: slab.x0 + Math.min(slab.W, (i + 1) * CHUNK + 1) / slab.hpu,
        z0: slab.z0 + (j * CHUNK) / slab.hpu, z1: slab.z0 + Math.min(slab.H, (j + 1) * CHUNK + 1) / slab.hpu });
    }
    this.lods = STRIDES.map((s) => {
      const g = chunkGeometry(s);
      const origins = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, this.chunks.length) * 2), 2);
      origins.setUsage(THREE.DynamicDrawUsage);
      g.setAttribute('aOrigin', origins);
      g.instanceCount = 0;
      const mat = this.material({ ...base, uStride: { value: s } });
      const mesh = new THREE.Mesh(g, mat);
      mesh.frustumCulled = false; mesh.renderOrder = 1; mesh.name = `aquifers-${slab.name}-s${s}`;
      this.group.add(mesh);
      return { s, g, origins, mesh, mat };
    });
    this._box = new THREE.Box3(); this._v = new THREE.Vector3();
  }
  material(uniforms) {
    return new THREE.ShaderMaterial({
      uniforms,
      vertexShader: /* glsl */`
        uniform sampler2D uHeight, uAqTex, uAqPal;
        uniform vec2 uSize; uniform vec4 uRect, uColorMap;
        uniform float uExag, uAqDepth, uAqThick, uStride;
        attribute vec2 aCell; attribute float aSkirt; attribute vec2 aOrigin;
        varying vec3 vWorld; varying vec2 vUv; varying float vFlag, vUnder; varying vec3 vPal;
        ${EFF_HEIGHT_GLSL}
        float hAt(vec2 px) { px = clamp(px, vec2(0.0), uSize - 1.0); return texelFetch(uHeight, ivec2(px), 0).r; }
        float yAt(vec2 px) { return max(effHeight(hAt(px)), 0.0) * uExag / uRect.w; }
        vec2 uvAt(vec2 px) { vec2 w = uRect.xy + (px + 0.5) * uRect.z; return vec2((w.x - uColorMap.x) * uColorMap.z, (w.y - uColorMap.y) * uColorMap.w); }
        float aqAt(vec2 px) { return floor(texture2D(uAqTex, uvAt(clamp(px, vec2(0.0), uSize - 1.0))).r * 255.0 + 0.5); }
        void main() {
          vec2 px = clamp(aOrigin + aCell, vec2(0.0), uSize - 1.0);
          float a = aqAt(px), an = a, flag = -1.0;
          if (a > 0.5) flag = 1.0;
          else {
            float s = uStride;
            float m = max(max(aqAt(px + vec2(s, 0.0)), aqAt(px - vec2(s, 0.0))), max(aqAt(px + vec2(0.0, s)), aqAt(px - vec2(0.0, s))));
            if (m > 0.5) { flag = 0.0; an = m; }
          }
          float top = yAt(px) - uAqDepth;
          float y = (flag > 0.5 && aSkirt < 0.5) ? top : top - uAqThick;
          vec3 P = vec3(uRect.x + (px.x + 0.5) * uRect.z, y, uRect.y + (px.y + 0.5) * uRect.z);
          vWorld = P; vUv = uvAt(px); vFlag = flag; vUnder = (top - y) / max(uAqThick, 1e-4);
          vPal = texture2D(uAqPal, vec2((an + 0.5) / 64.0, 0.5)).rgb;
          gl_Position = projectionMatrix * viewMatrix * vec4(P, 1.0);
        }`,
      fragmentShader: /* glsl */`
        uniform sampler2D uAqTex, uAqPal, uGwTex, uCounty;
        uniform vec3 uSunDir;
        uniform float uNight, uAqMode, uAqHover, uAqSel;
        varying vec3 vWorld; varying vec2 vUv; varying float vFlag, vUnder; varying vec3 vPal;
        float countyAt(vec2 uv) { vec4 c = texture2D(uCounty, uv); return floor(c.r * 255.0 + 0.5) * 256.0 + floor(c.g * 255.0 + 0.5) - 1.0; }
        float aqAt(vec2 uv) { return floor(texture2D(uAqTex, uv).r * 255.0 + 0.5); }
        void main() {
          if (vFlag < 0.0) discard;
          vec3 N = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
          if (dot(N, cameraPosition - vWorld) < 0.0) N = -N;
          vec3 L = normalize(vec3(uSunDir.x, max(uSunDir.y, 0.35), uSunDir.z));
          float lam = 0.42 + 0.58 * max(dot(N, L), 0.0);
          vec3 col;
          float ai = aqAt(vUv);
          float hi = 0.0;
          if (N.y > 0.72) {
            // the top: the aquifer's colour, brighter where counties pump more
            vec3 pal = ai > 0.5 ? texture2D(uAqPal, vec2((ai + 0.5) / 64.0, 0.5)).rgb : vPal;
            float cid = countyAt(vUv);
            float gw = cid >= 0.0 ? texture2D(uGwTex, (vec2(mod(cid, 64.0), floor(cid / 64.0)) + 0.5) / 64.0).r : 0.0;
            col = pal * (0.32 + 1.15 * gw) * lam;
            // outlines between aquifers
            vec2 tq = fwidth(vUv) * 1.1;
            float e = (ai > 0.5 && (aqAt(vUv + vec2(tq.x, 0.0)) != ai || aqAt(vUv + vec2(0.0, tq.y)) != ai)) ? 1.0 : 0.0;
            col = mix(col, vec3(0.80, 0.92, 1.0) * 0.55, e * 0.45);
            col += pal * gw * gw * mix(0.05, 0.55, uNight);
            hi = (ai > 0.5 && (abs(ai - uAqHover) < 0.5 || abs(ai - uAqSel) < 0.5)) ? 1.0 : 0.0;
          } else {
            // the walls: the same rock, darker, in faint layers
            float band = 0.88 + 0.12 * sin(vUnder * 31.0) * sin(vUnder * 7.0 + vWorld.x * 0.7);
            col = vPal * (0.30 + 0.30 * lam) * band;
            col *= mix(1.0, 0.65, vUnder);
            hi = (abs(ai - uAqHover) < 0.5 || abs(ai - uAqSel) < 0.5) ? 0.6 : 0.0;
          }
          col *= 1.0 + 0.7 * hi;
          col *= mix(1.0, 0.75, uNight);
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
  }
  setVisible(on) { this.group.visible = on && this.chunks.length > 0; }
  update(camera, frustum, exag, viewportH, depth, thick) {
    if (!this.group.visible) return;
    const counts = this.lods.map(() => 0);
    const k = 2 * (camera.userData.tanHalf || Math.tan((camera.fov * Math.PI) / 360)) / viewportH;
    const vs = exag / this.slab.mpu;
    for (const c of this.chunks) {
      const yhi = Math.max(0, c.hi) * vs - depth + 0.5, ylo = -depth - thick - 1;
      this._box.min.set(c.x0, ylo, c.z0); this._box.max.set(c.x1, yhi, c.z1);
      if (!frustum.intersectsBox(this._box)) continue;
      this._box.clampPoint(camera.position, this._v);
      const d = Math.max(0.5, this._v.distanceTo(camera.position));
      const cellPx = (1 / this.slab.hpu) / (d * k);
      // one step finer than the terrain: the outlines are made from these cells
      let li = 0;
      while (li < STRIDES.length - 1 && cellPx * STRIDES[li + 1] < 3.0) li++;
      const Lm = this.lods[li];
      Lm.origins.array[counts[li] * 2] = c.i * CHUNK;
      Lm.origins.array[counts[li] * 2 + 1] = c.j * CHUNK;
      counts[li]++;
    }
    this.lods.forEach((Lm, li) => { Lm.g.instanceCount = counts[li]; Lm.origins.needsUpdate = true; });
  }
  dispose() { for (const L of this.lods) { L.g.dispose(); L.mat.dispose(); } }
}
