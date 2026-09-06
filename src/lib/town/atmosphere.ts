import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';

export const SUMMER_LIGHT = {
  sun: '#fff1de',
  skyFill: '#c4def3',
  groundFill: '#827b63',
  haze: '#d7d8cb',
  sunIntensity: 2.7,
  fillIntensity: 1.1,
  exposure: 1.02,
} as const;

export function createSummerSky(sunDirection: THREE.Vector3): Sky {
  const sky = new Sky();
  sky.name = 'Late summer sky';
  sky.material.toneMapped = false;
  sky.renderOrder = 1000;
  sky.scale.setScalar(450000);
  sky.material.uniforms.sunPosition.value.copy(sunDirection).normalize();
  Object.assign(sky.material.uniforms, {
    summerZenith: { value: new THREE.Color('#679fc7') },
    summerHorizon: { value: new THREE.Color(SUMMER_LIGHT.haze) },
    summerCloud: { value: new THREE.Color('#fff1de') },
    summerGround: { value: new THREE.Color('#56604b') },
  });
  sky.material.fragmentShader = `
    varying vec3 vWorldPosition;
    varying vec3 vSunDirection;
    uniform vec3 summerZenith, summerHorizon, summerCloud, summerGround;
    float cloudHash(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
    float cloudNoise(vec2 p) {
      vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
      return mix(mix(cloudHash(i), cloudHash(i+vec2(1,0)), f.x),
                 mix(cloudHash(i+vec2(0,1)), cloudHash(i+vec2(1,1)), f.x), f.y);
    }
    float cloudField(vec2 p) {
      float n = 0.0, weight = 0.55;
      for (int i = 0; i < 5; i++) {
        n += cloudNoise(p) * weight;
        p = mat2(1.6,-1.2,1.2,1.6) * p + 7.13;
        weight *= 0.48;
      }
      return n;
    }
    void main() {
      vec3 direction = normalize(vWorldPosition - cameraPosition);
      float elevation = max(0.0, direction.y);
      vec3 color = mix(summerHorizon, summerZenith, pow(smoothstep(0.0,0.72,elevation),0.65));
      vec2 cloudUV = direction.xz / max(0.12, elevation) * 0.58 + vec2(3.1,8.7);
      float field = cloudField(cloudUV);
      float cloud = smoothstep(0.53,0.75,field) * smoothstep(0.025,0.17,elevation);
      vec3 cloudColor = mix(summerHorizon * 1.01, summerCloud, smoothstep(0.49,0.76,field));
      color = mix(color, cloudColor, cloud * 0.82);
      float sunFacing = max(0.0,dot(direction,normalize(vSunDirection)));
      // A broad warm scatter and a small bright disc supply readable reflection
      // structure as well as the visible sky. These are art-directed, not weather data.
      color += vec3(0.19,0.10,0.035) * pow(sunFacing,8.0);
      color += vec3(0.65,0.43,0.19) * pow(sunFacing,128.0);
      color += vec3(5.0,3.6,1.8) * smoothstep(0.9997,0.99995,sunFacing);
      // The reflected lower hemisphere is landscape, not a second bright sky.
      // This gives glass and metallic bodywork a grounded reflection gradient.
      color = mix(color,summerGround,smoothstep(0.01,0.36,-direction.y));
      gl_FragColor = vec4(color,1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }
  `;
  return sky;
}
