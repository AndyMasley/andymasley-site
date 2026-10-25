import * as THREE from 'three';
import { SLAB_BASE } from '../core/config.js';
import { EFF_HEIGHT_GLSL } from './slab.js';

/** The cut faces around each slab: earth strata below the surface, a glassy water column over the sea floor. */
export function createSlabSides(slab, shared) {
  const W = slab.W, H = slab.H, x0 = slab.x0, z0 = slab.z0, du = 1 / slab.hpu;
  const earth = { pos: [], h: [], top: [], nrm: [], idx: [] };
  const water = { pos: [], h: [], top: [], nrm: [], idx: [] };
  const edge = (pts, n) => {
    // pts: list of [x, z, hMetres]
    const be = earth.pos.length / 3, bw = water.pos.length / 3;
    for (const [x, z, h] of pts) {
      earth.pos.push(x, 0, z, x, 0, z); earth.h.push(h, h); earth.top.push(1, 0); earth.nrm.push(...n, ...n);
      water.pos.push(x, 0, z, x, 0, z); water.h.push(h, h); water.top.push(2, 3); water.nrm.push(...n, ...n);
    }
    for (let k = 0; k < pts.length - 1; k++) {
      const a = 2 * k, b = 2 * k + 2;
      earth.idx.push(be + a, be + a + 1, be + b, be + b, be + a + 1, be + b + 1);
      water.idx.push(bw + a, bw + a + 1, bw + b, bw + b, bw + a + 1, bw + b + 1);
    }
  };
  const step = 2;
  const hAt = (i, j) => slab.heights[Math.min(H - 1, j) * W + Math.min(W - 1, i)];
  const north = [], south = [], west = [], east = [];
  for (let i = 0; i < W; i += step) { north.push([x0 + (i + 0.5) * du, z0 + 0.5 * du, hAt(i, 0)]); south.push([x0 + (i + 0.5) * du, z0 + (H - 0.5) * du, hAt(i, H - 1)]); }
  for (let j = 0; j < H; j += step) { west.push([x0 + 0.5 * du, z0 + (j + 0.5) * du, hAt(0, j)]); east.push([x0 + (W - 0.5) * du, z0 + (j + 0.5) * du, hAt(W - 1, j)]); }
  edge(north.reverse(), [0, 0, -1]); edge(south, [0, 0, 1]); edge(west, [-1, 0, 0]); edge(east.reverse(), [1, 0, 0]);
  const build = (b) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
    g.setAttribute('aH', new THREE.Float32BufferAttribute(b.h, 1));
    g.setAttribute('aTop', new THREE.Float32BufferAttribute(b.top, 1));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(b.nrm, 3));
    g.setIndex(b.idx);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3((slab.x0 + slab.x1) / 2, 0, (slab.z0 + slab.z1) / 2), Math.hypot(slab.x1 - slab.x0, slab.z1 - slab.z0));
    return g;
  };
  const common = {
    vertexShader: /* glsl */`
      #include <fog_pars_vertex>
      uniform float uExag, uMpu, uBase;
      attribute float aH; attribute float aTop;
      varying float vDepth; varying vec3 vN; varying vec3 vWorld; varying float vWet;
      ${EFF_HEIGHT_GLSL}
      void main() {
        float ground = effHeight(aH) * uExag / uMpu;
        float y;
        if (aTop < 0.5) y = uBase;               // earth bottom
        else if (aTop < 1.5) y = ground;          // earth top: ground or sea floor
        else if (aTop < 2.5) y = aH < 0.0 ? 0.0 : ground; // water top: sea level over water
        else y = ground;                                   // water bottom: sea floor (degenerate on land)
        vec3 p = vec3(position.x, y, position.z);
        vDepth = ground - y; vWet = aH < 0.0 ? 1.0 : 0.0;
        vN = normal; vWorld = p;
        vec4 mvPosition = viewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
  };
  const earthMat = new THREE.ShaderMaterial({
    fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uMpu: { value: slab.mpu }, uBase: { value: SLAB_BASE } }]),
    ...common,
    fragmentShader: /* glsl */`
      #include <fog_pars_fragment>
      uniform vec3 uSunDir;
      uniform float uNight, uAqMode;
      varying float vDepth; varying vec3 vN; varying vec3 vWorld; varying float vWet;
      float h1(float x) { return fract(sin(x * 91.17) * 43758.5); }
      float n1(float x) { float i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f); return mix(h1(i), h1(i + 1.0), f); }
      void main() {
        float along = vWorld.x * abs(vN.z) + vWorld.z * abs(vN.x);
        float d = vDepth + 0.35 * n1(along * 0.08) + 0.15 * n1(along * 0.6);
        vec3 soil = vec3(0.17, 0.12, 0.08), sand = vec3(0.47, 0.38, 0.26), clay = vec3(0.36, 0.25, 0.17), rock = vec3(0.22, 0.22, 0.23), deep = vec3(0.10, 0.10, 0.11);
        vec3 c = mix(soil, sand, smoothstep(0.05, 0.35, d));
        float band = n1(d * 2.3 + 3.7);
        c = mix(c, clay, smoothstep(0.55, 0.8, band) * smoothstep(0.4, 1.0, d));
        // a groundwater-bearing layer: a cool, wet band a few units down
        float aq = smoothstep(1.2, 1.8, d) * (1.0 - smoothstep(3.0, 4.2, d));
        c = mix(c, vec3(0.20, 0.30, 0.34), aq * 0.55 * (1.0 - vWet));
        c = mix(c, rock, smoothstep(3.0, 6.0, d));
        c = mix(c, deep, smoothstep(7.0, 14.0, d));
        if (vWet > 0.5) c = mix(c, vec3(0.13, 0.13, 0.14), 0.45);
        float lam = 0.55 + 0.45 * max(dot(normalize(vN), normalize(vec3(uSunDir.x, 0.2, uSunDir.z))), 0.0);
        c *= lam * mix(1.0, 0.16, uNight);
        // the groundwater band glows when the underground view is on
        c += vec3(0.10, 0.45, 0.55) * aq * (1.0 - vWet) * uAqMode * mix(0.5, 1.2, uNight);
        gl_FragColor = vec4(c, 1.0);
        #include <fog_fragment>
      }`,
  });
  const waterMat = new THREE.ShaderMaterial({
    fog: true, transparent: true, depthWrite: false,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uMpu: { value: slab.mpu }, uBase: { value: SLAB_BASE } }]),
    ...common,
    fragmentShader: /* glsl */`
      #include <fog_pars_fragment>
      uniform vec3 uDeep;
      uniform float uNight;
      varying float vDepth; varying vec3 vN; varying vec3 vWorld; varying float vWet;
      void main() {
        float d = -vWorld.y;
        vec3 c = mix(vec3(0.18, 0.42, 0.48), uDeep * 0.9, smoothstep(0.0, 3.0, d)) * mix(1.0, 0.22, uNight);
        float a = 0.78 + 0.18 * smoothstep(0.0, 4.0, d);
        gl_FragColor = vec4(c, a);
        #include <fog_fragment>
      }`,
  });
  for (const m of [earthMat, waterMat]) { m.uniforms.uExag = shared.uExag; m.uniforms.uSunDir = shared.uSunDir; m.uniforms.uDeep = shared.uDeep; m.uniforms.uNight = shared.uNight; m.uniforms.uAqMode = shared.uAqMode; }
  const g = new THREE.Group();
  const em = new THREE.Mesh(build(earth), earthMat); em.name = `sides-earth-${slab.name}`;
  const wm = new THREE.Mesh(build(water), waterMat); wm.name = `sides-water-${slab.name}`; wm.renderOrder = 3;
  g.add(em, wm);
  return g;
}
