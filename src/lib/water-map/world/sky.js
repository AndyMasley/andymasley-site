import * as THREE from 'three';
import { SLAB_BASE } from '../core/config.js';

export const SKY = {
  zenith: new THREE.Color().setRGB(0.045, 0.12, 0.30, THREE.LinearSRGBColorSpace),
  horizon: new THREE.Color().setRGB(0.36, 0.48, 0.62, THREE.LinearSRGBColorSpace),
  floor: new THREE.Color().setRGB(0.020, 0.032, 0.030, THREE.LinearSRGBColorSpace),
};

/** A gradient dome with a warm glow toward the sun; the model sits under it on a dark plinth. */
export function createSky(shared) {
  const geo = new THREE.SphereGeometry(1, 48, 24);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, depthTest: false,
    uniforms: { uZenith: { value: SKY.zenith.clone() }, uHorizon: { value: SKY.horizon.clone() }, uSunDir: shared.uSunDir, uNight: shared.uNight },
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main() { vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`,
    fragmentShader: /* glsl */`
      uniform vec3 uZenith, uHorizon, uSunDir;
      uniform float uNight;
      varying vec3 vDir;
      float sh(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
      void main() {
        vec3 d = normalize(vDir);
        float e = max(d.y, 0.0);
        vec3 c = mix(uHorizon, uZenith, pow(smoothstep(0.0, 0.85, e), 0.7));
        float s = max(dot(d, normalize(uSunDir)), 0.0);
        // the sun by day; at night a pale moon glow in the same quarter
        c += mix(vec3(0.30, 0.20, 0.10) * pow(s, 7.0) + vec3(0.9, 0.7, 0.45) * pow(s, 90.0), vec3(0.020, 0.028, 0.045) * pow(s, 6.0) + vec3(0.5, 0.55, 0.62) * pow(s, 900.0), uNight);
        // dusk: a warm band low in the sky between day and night
        float dusk = uNight * (1.0 - uNight) * 4.0;
        c += vec3(0.30, 0.12, 0.04) * dusk * (1.0 - smoothstep(0.0, 0.35, e)) * (0.4 + 0.6 * pow(max(dot(normalize(d.xz + 1e-4), normalize(uSunDir.xz + 1e-4)), 0.0), 2.0));
        // stars
        if (uNight > 0.01) {
          vec3 g = floor(d * 420.0);
          float st = step(0.9965, sh(g)) * smoothstep(0.02, 0.25, e);
          c += vec3(0.9, 0.92, 1.0) * st * (0.35 + 0.65 * sh(g + 3.0)) * uNight * 1.4;
        }
        c = mix(c, uHorizon * 0.7, smoothstep(0.0, -0.25, d.y));
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const sky = new THREE.Mesh(geo, mat);
  sky.name = 'sky'; sky.renderOrder = -10; sky.frustumCulled = false;
  sky.onBeforeRender = (r, s, cam) => { sky.position.copy(cam.position); sky.scale.setScalar(cam.far * 0.9); };
  sky.userData.uniforms = mat.uniforms;
  return sky;
}

export function createFloor() {
  const geo = new THREE.PlaneGeometry(40000, 40000, 1, 1);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.ShaderMaterial({
    fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uCol: { value: SKY.floor.clone() } }]),
    vertexShader: /* glsl */`
      #include <fog_pars_vertex>
      varying vec3 vWorld;
      void main() { vec4 wp = modelMatrix * vec4(position, 1.0); vWorld = wp.xyz; vec4 mvPosition = viewMatrix * wp; gl_Position = projectionMatrix * mvPosition;
      #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      #include <fog_pars_fragment>
      uniform vec3 uCol;
      varying vec3 vWorld;
      void main() {
        // faint radial pool of light under the model
        float r = length((vWorld.xz - vec2(528.0, 404.0)) / vec2(720.0, 580.0));
        vec3 c = uCol * (1.0 + 0.9 * (1.0 - smoothstep(0.2, 1.4, r)));
        gl_FragColor = vec4(c, 1.0);
        #include <fog_fragment>
      }`,
  });
  const m = new THREE.Mesh(geo, mat);
  m.position.y = SLAB_BASE - 0.4;
  m.name = 'floor';
  m.userData.uniforms = mat.uniforms;
  return m;
}
