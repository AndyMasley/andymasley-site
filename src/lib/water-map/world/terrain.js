import * as THREE from 'three';
import { EFF_HEIGHT_GLSL } from './slab.js';
import { WATER_GLSL } from './water.js';
import { DETAIL_GLSL } from './detail.js';
import { NLCD_GLSL } from './nlcd.js';

export const CHUNK = 64;              // height-grid cells per chunk side
export const STRIDES = [1, 2, 4, 8];  // level-of-detail steps

/** One shared geometry per LOD: a (CHUNK/s+1)^2 grid of cell coordinates plus edge skirts. */
export function chunkGeometry(s) {
  const n = CHUNK / s, cells = [], skirt = [], idx = [];
  for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) { cells.push(i * s, j * s); skirt.push(0); }
  const at = (i, j) => j * (n + 1) + i;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const a = at(i, j), b = at(i + 1, j), c = at(i, j + 1), d = at(i + 1, j + 1);
    // alternate the diagonal for a less directional mesh
    if ((i + j) & 1) idx.push(a, c, b, b, c, d); else idx.push(a, c, d, a, d, b);
  }
  // skirts: duplicate each border vertex and drop it in the shader
  const edge = (list) => {
    const base = cells.length / 2;
    for (const [i, j] of list) { cells.push(i * s, j * s); skirt.push(1); }
    for (let k = 0; k < list.length - 1; k++) {
      const a = at(list[k][0], list[k][1]), b = at(list[k + 1][0], list[k + 1][1]);
      const a2 = base + k, b2 = base + k + 1;
      idx.push(a, a2, b, b, a2, b2, a, b, a2, b, b2, a2);
    }
  };
  const row = (j) => Array.from({ length: n + 1 }, (_, i) => [i, j]);
  const col = (i) => Array.from({ length: n + 1 }, (_, j) => [i, j]);
  edge(row(0)); edge(row(n)); edge(col(0)); edge(col(n));
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(skirt.length * 3), 3));
  g.setAttribute('aCell', new THREE.Float32BufferAttribute(cells, 2));
  g.setAttribute('aSkirt', new THREE.Float32BufferAttribute(skirt, 1));
  g.setIndex(idx);
  return g;
}

const VERT_HEAD = /* glsl */`
uniform sampler2D uHeight;
uniform vec2 uSize;
uniform vec4 uRect;      // world x0, z0, 1/hpu, mpu
uniform vec4 uColorMap;  // world -> colour uv: x0, z0, ppu/texW, ppu/texH
uniform float uExag;
uniform float uSkirt;
attribute vec2 aCell;
attribute float aSkirt;
attribute vec2 aOrigin;
varying vec2 vColorUv;
varying vec3 vWorldPos;
varying float vHeightM;
varying float vSkirt;
${EFF_HEIGHT_GLSL}
float hAt(vec2 px) { px = clamp(px, vec2(0.0), uSize - 1.0); return texelFetch(uHeight, ivec2(px), 0).r; }
float yAt(vec2 px) { return effHeight(hAt(px)) * uExag / uRect.w; }
`;

export function createTerrainMaterial(slab, shared, nlcd) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.96, metalness: 0.0 });
  // the underground view draws the land as glass over the aquifers: the same shader, blended, writing no depth
  const glass = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.96, metalness: 0.0, transparent: true, depthWrite: false });
  const uniforms = {
    uHeight: { value: slab.heightTex },
    uSize: { value: new THREE.Vector2(slab.W, slab.H) },
    uRect: { value: new THREE.Vector4(slab.x0, slab.z0, 1 / slab.hpu, slab.mpu) },
    uColorMap: { value: new THREE.Vector4(slab.x0, slab.z0, slab.ppu / slab.texW, slab.ppu / slab.texH) },
    uTexSize: { value: new THREE.Vector2(slab.texW, slab.texH) },
    uColorTex: { value: slab.colorTex },
    uExag: shared.uExag,
    uSkirt: { value: 0.6 },
    uLitMix: shared.uTerrainLitMix,
    uFlat: shared.uTerrainFlat,
    uFocus: shared.uFocus,
    uDim: shared.uDim,
    uSunDir: shared.uSunDir, uSkyCol: shared.uSkyCol, uSunCol: shared.uSunCol, uTime: shared.uTime, uRipple: shared.uRipple,
    uLakeDeep: { value: new THREE.Color().setRGB(0.012, 0.062, 0.115, THREE.LinearSRGBColorSpace) },
    uCounty: { value: slab.countyTex || null }, uHover: shared.uHoverCounty, uSel: shared.uSelCounty, uHasCounty: { value: slab.countyTex ? 1 : 0 },
    uCountyData: shared.uCountyData, uChoro: shared.uChoro,
    uChoroTex: shared.uChoroTex, uChoroMode: shared.uChoroMode, uRamp: shared.uRamp, uCatCols: shared.uCatCols, uSelState: shared.uSelState,
    uLand: { value: slab.landTex || null }, uApex: { value: new THREE.Vector2(538.289, -1275.091) }, uGrid: { value: slab.name === 'conus' ? 1 : 0 },
    uDetailAmt: shared.uDetailAmt, uTime2: shared.uTime,
    uNight: shared.uNight, uCamDist: shared.uCamDist,
    uAqMode: shared.uAqMode, uAqAlpha: shared.uAqAlpha, uIsoCol: shared.uIsoCol, uIsoAmt: shared.uIsoAmt, uStateLines: shared.uStateLines,
    ...(nlcd ? nlcd.uniformsFor(slab) : { uNlcdArr: { value: null }, uNlcdIdx: { value: null }, uNlcdGrid: { value: new THREE.Vector4() }, uNlcdHas: { value: 0 } }),
  };
  const compile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = VERT_HEAD + sh.vertexShader
      .replace('#include <beginnormal_vertex>', /* glsl */`
        vec2 px = aOrigin + aCell;
        float dx = uRect.z;
        float yl = yAt(px + vec2(-1.0, 0.0)), yr = yAt(px + vec2(1.0, 0.0));
        float yu = yAt(px + vec2(0.0, -1.0)), yd = yAt(px + vec2(0.0, 1.0));
        vec3 objectNormal = normalize(vec3(-(yr - yl) / (2.0 * dx), 1.0, -(yd - yu) / (2.0 * dx)));`)
      .replace('#include <begin_vertex>', /* glsl */`
        vec2 pc = clamp(px, vec2(0.0), uSize - 1.0);
        vHeightM = hAt(pc);
        vec3 transformed = vec3(uRect.x + (pc.x + 0.5) * uRect.z, yAt(pc) - aSkirt * uSkirt, uRect.y + (pc.y + 0.5) * uRect.z);
        vColorUv = vec2((transformed.x - uColorMap.x) * uColorMap.z, (transformed.z - uColorMap.y) * uColorMap.w);
        vWorldPos = transformed; vSkirt = aSkirt;`);
    sh.fragmentShader = /* glsl */`
uniform sampler2D uColorTex;
uniform vec4 uColorMap;
uniform float uLitMix;
uniform float uFlat;
uniform vec4 uFocus;   // x, z, radius, strength: brightens a selected region
uniform float uDim;
uniform vec3 uSunDir, uSkyCol, uSunCol, uLakeDeep;
uniform float uTime, uRipple, uNight, uCamDist;
uniform sampler2D uCounty;
uniform float uHover, uSel, uHasCounty, uChoro;
uniform sampler2D uChoroTex; uniform float uChoroMode, uSelState; uniform vec3 uRamp[5]; uniform vec3 uCatCols[9];
uniform float uAqMode, uAqAlpha, uStateLines, uIsoAmt; uniform vec3 uIsoCol;
varying float vSkirt;
vec3 rampAt(float v) {
  v = clamp(v, 0.0, 1.0) * 4.0;
  if (v < 1.0) return mix(uRamp[0], uRamp[1], v);
  if (v < 2.0) return mix(uRamp[1], uRamp[2], v - 1.0);
  if (v < 3.0) return mix(uRamp[2], uRamp[3], v - 2.0);
  return mix(uRamp[3], uRamp[4], v - 3.0);
}
vec4 choroAt(float cid) { return texture2D(uChoroTex, (vec2(mod(cid, 64.0), floor(cid / 64.0)) + 0.5) / 64.0); }
varying vec2 vColorUv;
varying vec3 vWorldPos;
varying float vHeightM;
${WATER_GLSL}
${NLCD_GLSL}
${DETAIL_GLSL}
float countyAt(vec2 uv) {
  vec4 c = texture2D(uCounty, uv);
  return floor(c.r * 255.0 + 0.5) * 256.0 + floor(c.g * 255.0 + 0.5) - 1.0;
}
` + sh.fragmentShader
      .replace('#include <map_fragment>', /* glsl */`
        vec4 ctex = texture2D(uColorTex, vColorUv);
        float lakeW = 1.0 - smoothstep(0.12, 0.38, ctex.a);
        vec3 alb = ctex.rgb;
        float devI = 0.0, clsC = -1.0, isoV = -1.0, stLine = 0.0;
        float pxw = length(fwidth(vWorldPos.xz));
        if (uHasCounty > 0.5 && ctex.a > 0.62) {
          vec4 land = texture2D(uLand, vColorUv);
          devI = land.r;
          float cidD = countyAt(vColorUv);
          vec4 cdat = countyDataAt(cidD);
          // NLCD land cover up close, with boundaries warped so the 262 m pixels read as natural patches
          if (uDetailAmt > 0.001 && uNlcdHas > 0.5) {
            vec2 t3 = vColorUv * uTexSize * uNlcdGrid.z;
            vec2 wq = vWorldPos.xz * 31.0;
            vec2 wob = (vec2(dnoise(wq), dnoise(wq + 17.3)) - 0.5) * 0.55 + (vec2(dnoise(wq * 3.1 + 3.1), dnoise(wq * 3.1 + 9.4)) - 0.5) * 0.30;
            clsC = nlcdSmooth(t3, wob);
            if (clsC > 0.5) {
              devI = mix(devI, nlcdDev(clsC), uDetailAmt);
              if (int(clsC) == 1) lakeW = max(lakeW, uDetailAmt);
              if (int(clsC) == 20) lakeW = max(lakeW, uDetailAmt * 0.8 * smoothstep(0.58, 0.72, dnoise(vWorldPos.xz * 190.0)));
            }
          }
          alb = groundDetail(alb, vWorldPos.xz, land, cdat, uDetailAmt, pxw, clsC);
          if (cidD >= 0.0) {
            vec4 cv = choroAt(cidD);
            if (uChoroMode > 2.5) {
              // one use isolated: the land goes quiet and each county is tinted by how much of that use it has
              float l = dot(alb, vec3(0.2126, 0.7152, 0.0722));
              vec3 quiet = mix(vec3(l), alb, 0.3) * 0.62;
              isoV = cv.a > 0.5 ? cv.r : 0.0;
              float k = smoothstep(0.0, 0.06, isoV) * (0.30 + 0.62 * isoV);
              alb = mix(alb, mix(quiet, uIsoCol * (0.30 + 0.75 * isoV) * clamp(l / 0.16, 0.55, 1.35), k), uIsoAmt);
              isoV *= uIsoAmt;
            } else if (uChoroMode > 0.5 && cv.a > 0.5) {
              vec3 rc = uChoroMode < 1.5 ? rampAt(cv.r) : uCatCols[int(cv.g * 255.0 + 0.5)];
              float l = dot(alb, vec3(0.2126, 0.7152, 0.0722));
              alb = rc * clamp(l / 0.17, 0.4, 1.5);
            }
            if (uSelState >= 0.0 && abs(cv.b * 255.0 - uSelState) > 0.5) alb *= 0.55;
            // state lines, from the state of the neighbouring county samples
            if (uStateLines > 0.001) {
              vec2 tq = fwidth(vColorUv) * 1.05;
              float s0 = floor(cv.b * 255.0 + 0.5);
              float ca = countyAt(vColorUv + vec2(tq.x, 0.0)), cb = countyAt(vColorUv + vec2(0.0, tq.y));
              float sa = ca >= 0.0 ? floor(choroAt(ca).b * 255.0 + 0.5) : s0, sb = cb >= 0.0 ? floor(choroAt(cb).b * 255.0 + 0.5) : s0;
              stLine = (sa != s0 || sb != s0) ? 1.0 : 0.0;
            }
          }
          // underground: the land loses its colour so the aquifers below read through it
          if (uAqMode > 0.001) {
            float l = dot(alb, vec3(0.2126, 0.7152, 0.0722));
            alb = mix(alb, vec3(l) * vec3(0.62, 0.66, 0.70), 0.7 * uAqMode);
          }
        }
        diffuseColor.rgb *= alb;`)
      .replace('#include <opaque_fragment>', /* glsl */`
        // the relief shading is baked into the colour; real-time light adds broad 3D form. At night the baked part
        // dims to moonlight (the scene lights dim with it)
        vec3 flatPart = diffuseColor.rgb * uFlat * mix(vec3(1.0), vec3(0.085, 0.102, 0.150), uNight);
        outgoingLight = mix(flatPart, outgoingLight, uLitMix);
        // counties: hover and selection
        if (uHasCounty > 0.5) {
          float cid = countyAt(vColorUv);
          // county edges from neighbouring samples (one texel apart)
          vec2 tx = fwidth(vColorUv) * 0.9;
          float e = 0.0;
          if (uSel >= 0.0 || uHover >= 0.0) {
            float a = countyAt(vColorUv + vec2(tx.x, 0.0)), b = countyAt(vColorUv - vec2(tx.x, 0.0));
            float c = countyAt(vColorUv + vec2(0.0, tx.y)), d = countyAt(vColorUv - vec2(0.0, tx.y));
            if (cid == uSel && (a != uSel || b != uSel || c != uSel || d != uSel)) e = 1.0;
            if (cid == uHover && (a != uHover || b != uHover || c != uHover || d != uHover)) e = max(e, 0.6);
          }
          if (cid == uHover && uHover >= 0.0) outgoingLight = outgoingLight * 1.18 + vec3(0.012, 0.010, 0.006) * (1.0 - 0.7 * uNight);
          if (uSel >= 0.0 && cid != uSel) { outgoingLight *= 0.62; devI *= 0.4; }
          outgoingLight = mix(outgoingLight, vec3(1.0, 0.86, 0.55) * 1.4, e * 0.85);
        }
        // lakes & reservoirs: still water over the baked lake-floor colour
        if (lakeW > 0.01) {
          vec3 base = mix(uLakeDeep, diffuseColor.rgb * 0.35, 0.15) * mix(1.0, 0.25, uNight);
          vec3 wcol = waterShade2(base, vWorldPos, cameraPosition, normalize(uSunDir), uSkyCol * vec3(0.38, 0.52, 0.75), uSunCol, uRipple * 1.6, uTime, 0.40, 0.26);
          outgoingLight = mix(outgoingLight, wcol, lakeW);
          devI *= 1.0 - lakeW;
        }
        // city lights
        if (uNight > 0.001) outgoingLight += cityLights(devI, vWorldPos.xz, pxw) * uNight * (1.0 - 0.6 * uAqMode) * (isoV >= 0.0 ? mix(1.0, 0.35, uIsoAmt) : 1.0);
        // an isolated use glows faintly at night where it is heaviest
        if (isoV > 0.0) outgoingLight += uIsoCol * isoV * isoV * (0.004 + 0.05 * uNight);
        // state lines: ink by day, a pale hairline at night
        outgoingLight = mix(outgoingLight, mix(vec3(0.035, 0.035, 0.03), vec3(0.62, 0.66, 0.72) * 0.55, uNight), stLine * uStateLines * (1.0 - lakeW) * mix(0.42, 0.30, uNight));
        outgoingLight *= 1.0 - uDim;
        // glass: the land seen from above the aquifers
        diffuseColor.a = mix(1.0, uAqAlpha, uAqMode);
        if (uAqMode > 0.5 && vSkirt > 0.5) discard;
        #include <opaque_fragment>`);
  };
  mat.onBeforeCompile = compile; glass.onBeforeCompile = compile;
  mat.customProgramCacheKey = () => 'terrain-v6';
  glass.customProgramCacheKey = () => 'terrain-v6-glass';
  return { mat, glass, uniforms };
}

/** Chunked, instanced, distance-LOD terrain for one slab. */
export class TerrainSlab {
  constructor(slab, shared, nlcd) {
    this.slab = slab;
    this.group = new THREE.Group();
    this.group.name = `terrain-${slab.name}`;
    const { mat, glass, uniforms } = createTerrainMaterial(slab, shared, nlcd);
    this.material = mat; this.glassMaterial = glass; this.uniforms = uniforms; this.glass = false;
    this.cx = Math.ceil((slab.W - 1) / CHUNK); this.cz = Math.ceil((slab.H - 1) / CHUNK);
    this.chunks = [];
    for (let j = 0; j < this.cz; j++) for (let i = 0; i < this.cx; i++) {
      // conservative height bounds per chunk (metres)
      let lo = Infinity, hi = -Infinity;
      for (let y = j * CHUNK; y <= Math.min(slab.H - 1, (j + 1) * CHUNK); y += 2) for (let x = i * CHUNK; x <= Math.min(slab.W - 1, (i + 1) * CHUNK); x += 2) {
        const h = slab.heights[y * slab.W + x]; if (h < lo) lo = h; if (h > hi) hi = h;
      }
      this.chunks.push({ i, j, lo, hi,
        x0: slab.x0 + (i * CHUNK) / slab.hpu, x1: slab.x0 + Math.min(slab.W, (i + 1) * CHUNK + 1) / slab.hpu,
        z0: slab.z0 + (j * CHUNK) / slab.hpu, z1: slab.z0 + Math.min(slab.H, (j + 1) * CHUNK + 1) / slab.hpu });
    }
    this.lods = STRIDES.map((s) => {
      const g = chunkGeometry(s);
      const origins = new THREE.InstancedBufferAttribute(new Float32Array(this.chunks.length * 2), 2);
      origins.setUsage(THREE.DynamicDrawUsage);
      g.setAttribute('aOrigin', origins);
      g.instanceCount = 0;
      const mesh = new THREE.Mesh(g, mat);
      mesh.frustumCulled = false;
      mesh.receiveShadow = true;
      mesh.name = `terrain-${slab.name}-s${s}`;
      this.group.add(mesh);
      return { s, g, origins, mesh };
    });
    this._box = new THREE.Box3(); this._v = new THREE.Vector3();
  }
  /** the land as glass (underground view) or solid */
  setGlass(on) {
    if (this.glass === on) return;
    this.glass = on;
    for (const L of this.lods) { L.mesh.material = on ? this.glassMaterial : this.material; L.mesh.renderOrder = on ? 2 : 0; }
  }
  dispose() { for (const L of this.lods) L.g.dispose(); this.material.dispose(); this.glassMaterial.dispose(); }
  /** choose a level of detail for every chunk in view */
  update(camera, frustum, exag, viewportH) {
    const counts = this.lods.map(() => 0);
    const k = 2 * Math.tan((camera.fov * Math.PI) / 360) / viewportH; // world size of a pixel at distance 1
    const vs = exag / this.slab.mpu;
    for (const c of this.chunks) {
      const ylo = Math.min(0, (c.lo >= 0 ? c.lo : -200) * vs) - 1, yhi = Math.max(0, c.hi) * vs + 0.5;
      this._box.min.set(c.x0, ylo, c.z0); this._box.max.set(c.x1, yhi, c.z1);
      if (!frustum.intersectsBox(this._box)) continue;
      this._box.clampPoint(camera.position, this._v);
      const d = Math.max(0.5, this._v.distanceTo(camera.position));
      const cellPx = (1 / this.slab.hpu) / (d * k);  // screen pixels per height cell
      let li = 0;
      while (li < STRIDES.length - 1 && cellPx * STRIDES[li + 1] < 5.5) li++;
      const L = this.lods[li];
      L.origins.array[counts[li] * 2] = c.i * CHUNK;
      L.origins.array[counts[li] * 2 + 1] = c.j * CHUNK;
      counts[li]++;
    }
    this.lods.forEach((L, li) => { L.g.instanceCount = counts[li]; L.origins.needsUpdate = true; });
    return counts;
  }
}
