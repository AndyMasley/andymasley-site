import * as THREE from 'three';

/** Shared water look: depth-tinted, wind-rippled, sun-glinting; used by the ocean and lakes. */
export const WATER_GLSL = /* glsl */`
float wHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float wNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(wHash(i), wHash(i + vec2(1, 0)), f.x), mix(wHash(i + vec2(0, 1)), wHash(i + vec2(1, 1)), f.x), f.y);
}
vec2 wGrad(vec2 p, float t) {
  // two drifting octaves of ripples -> a perturbed normal
  float e = 0.15;
  float a = wNoise(p + vec2(t * 0.6, t * 0.35)) + 0.5 * wNoise(p * 2.3 - vec2(t * 0.4, t * 0.8));
  float bx = wNoise(p + vec2(e, 0.0) + vec2(t * 0.6, t * 0.35)) + 0.5 * wNoise((p + vec2(e, 0.0)) * 2.3 - vec2(t * 0.4, t * 0.8));
  float by = wNoise(p + vec2(0.0, e) + vec2(t * 0.6, t * 0.35)) + 0.5 * wNoise((p + vec2(0.0, e)) * 2.3 - vec2(t * 0.4, t * 0.8));
  return vec2(bx - a, by - a) / e;
}
vec3 waterShade2(vec3 base, vec3 worldPos, vec3 camPos, vec3 sunDir, vec3 skyCol, vec3 sunCol, float rippleScale, float time, float glint, float refl);
vec3 waterShade(vec3 base, vec3 worldPos, vec3 camPos, vec3 sunDir, vec3 skyCol, vec3 sunCol, float rippleScale, float time, float glint) {
  return waterShade2(base, worldPos, camPos, sunDir, skyCol, sunCol, rippleScale, time, glint, 0.85);
}
vec3 waterShade2(vec3 base, vec3 worldPos, vec3 camPos, vec3 sunDir, vec3 skyCol, vec3 sunCol, float rippleScale, float time, float glint, float refl) {
  vec3 V = normalize(camPos - worldPos);
  // ripples finer than a pixel are averaged away: flatten them and widen the sun's highlight instead
  float fp = length(fwidth(worldPos.xz)) * rippleScale;
  float keep = 1.0 - smoothstep(0.12, 0.7, fp);
  vec2 g = wGrad(worldPos.xz * rippleScale, time) * 0.08 * keep;
  vec3 N = normalize(vec3(-g.x, 1.0, -g.y));
  float fres = 0.02 + 0.98 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
  vec3 R = reflect(-V, N);
  float shin = mix(28.0, 220.0, keep);
  float spec = pow(max(dot(R, sunDir), 0.0), shin) * glint * mix(0.18, 1.0, keep);
  vec3 col = mix(base, skyCol, fres * refl);
  col += sunCol * spec * 2.4;
  return col;
}`;

export function createOceanMesh(slab, shared) {
  const w = slab.x1 - slab.x0, d = slab.z1 - slab.z0;
  const geo = new THREE.PlaneGeometry(w, d, 1, 1);
  geo.rotateX(-Math.PI / 2);
  geo.translate(slab.x0 + w / 2, 0, slab.z0 + d / 2);
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uAux: { value: null }, uColorTex: { value: null },
      uRect: { value: new THREE.Vector4() }, uColorMap: { value: new THREE.Vector4() },
    }]),
    vertexShader: /* glsl */`
      #include <fog_pars_vertex>
      varying vec3 vWorld;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      #include <fog_pars_fragment>
      uniform sampler2D uAux;
      uniform sampler2D uColorTex;
      uniform vec4 uRect;      // x0, z0, hpu, (unused)
      uniform vec2 uSize;
      uniform vec4 uColorMap;
      uniform vec3 uSunDir, uSkyCol, uSunCol, uDeep, uShallow;
      uniform float uTime, uRipple;
      varying vec3 vWorld;
      ${WATER_GLSL}
      void main() {
        vec2 px = (vWorld.xz - uRect.xy) * uRect.z;
        vec4 aux = texture2D(uAux, px / uSize);
        vec2 cuv = vec2((vWorld.x - uColorMap.x) * uColorMap.z, (vWorld.z - uColorMap.y) * uColorMap.w);
        vec4 ctex = texture2D(uColorTex, cuv);
        // colour alpha: 1 land, 0.5 sea, 0 lake (lakes are drawn by the terrain); anti-aliased at the shore
        float sea = smoothstep(0.12, 0.38, ctex.a) * (1.0 - smoothstep(0.62, 0.90, ctex.a));
        float land = 1.0 - sea;
        if (land > 0.62) discard;
        float depth = (aux.r * 255.0 / 4.5); depth *= depth;          // metres (compressed scale)
        vec3 floorCol = ctex.rgb;
        float t = 1.0 - exp(-depth / 55.0);
        vec3 base = mix(floorCol * uShallow, uDeep, clamp(t, 0.0, 1.0));
        base = mix(base, uDeep * 0.82, smoothstep(300.0, 1700.0, depth));
        vec3 col = waterShade(base, vWorld, cameraPosition, uSunDir, uSkyCol, uSunCol, uRipple, uTime, 1.0);
        float a = 1.0 - smoothstep(0.38, 0.62, land);
        gl_FragColor = vec4(col, a);
        #include <fog_fragment>
      }`,
  });
  Object.assign(mat.uniforms, {
    uSize: { value: new THREE.Vector2(slab.W, slab.H) },
    uSunDir: shared.uSunDir, uSkyCol: shared.uSkyCol, uSunCol: shared.uSunCol,
    uDeep: shared.uDeep, uShallow: shared.uShallow, uTime: shared.uTime, uRipple: shared.uRipple,
  });
  mat.uniforms.uAux.value = slab.auxTex;
  mat.uniforms.uColorTex.value = slab.colorTex;
  mat.uniforms.uRect.value.set(slab.x0, slab.z0, slab.hpu, 0);
  mat.uniforms.uColorMap.value.set(slab.x0, slab.z0, slab.ppu / slab.texW, slab.ppu / slab.texH);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = `ocean-${slab.name}`;
  mesh.renderOrder = 2;
  return mesh;
}
