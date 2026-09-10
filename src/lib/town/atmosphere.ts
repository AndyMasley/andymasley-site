import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';

export const SUMMER_LIGHT = {
  sun: '#fff1db',
  skyFill: '#c5ddf2',
  groundFill: '#aea58c',
  haze: '#cbd7db',
  sunIntensity: 2.65,
  fillIntensity: 1.30,
  exposure: 1.03,
} as const;

/** Keep the directional shadow's light-space texels fixed as the car moves.
 * Snapping in world X/Z would still crawl along an oblique sun's image plane. */
export function createShadowAnchor(direction:THREE.Vector3,span:number,resolution:number):(focus:THREE.Vector3,target:THREE.Vector3)=>THREE.Vector3 {
  const forward=direction.clone().normalize(),right=new THREE.Vector3(0,1,0).cross(forward).normalize();
  if(right.lengthSq()<.5||!Number.isFinite(span/resolution)||span<=0||resolution<=0)throw new Error('Invalid directional shadow frame');
  const up=forward.clone().cross(right).normalize(),step=span/resolution;
  return(focus,target)=>{
    const x=focus.dot(right),y=focus.dot(up);
    return target.copy(focus).addScaledVector(right,Math.round(x/step)*step-x).addScaledVector(up,Math.round(y/step)*step-y);
  };
}

export function createSummerSky(sunDirection: THREE.Vector3): Sky {
  const sky = new Sky();
  sky.name = 'Late summer sky';
  sky.material.toneMapped = false;
  sky.renderOrder = 1000;
  sky.scale.setScalar(450000);
  sky.material.uniforms.sunPosition.value.copy(sunDirection).normalize();
  Object.assign(sky.material.uniforms, {
    summerZenith: { value: new THREE.Color('#4c91c4') },
    summerHorizon: { value: new THREE.Color(SUMMER_LIGHT.haze) },
    summerCloud: { value: new THREE.Color('#fff6e9') },
    summerGround: { value: new THREE.Color('#626a51') },
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
      // Broad, separated fair-weather cloud masses keep a blue sky between
      // them. A second nearby field shades the sun-facing lobes without a
      // texture download, ray march, or moving noise in the player's view.
      vec2 cloudUV = direction.xz / max(0.10, elevation) * 0.46 + vec2(3.1,8.7);
      float field = cloudField(cloudUV);
      float cloud = smoothstep(0.49,0.64,field) * smoothstep(0.025,0.15,elevation);
      vec2 lightStep = normalize(vSunDirection.xz) * 0.16;
      float lightField = cloudField(cloudUV + lightStep);
      float cloudLight = clamp(0.63+(field-lightField)*3.6,0.25,1.0);
      vec3 cloudColor = mix(summerHorizon * 0.87, summerCloud, cloudLight);
      color = mix(color, cloudColor, cloud * 0.94);
      float sunFacing = max(0.0,dot(direction,normalize(vSunDirection)));
      // A broad warm scatter and a small bright disc supply readable reflection
      // structure as well as the visible sky. These are art-directed, not weather data.
      color += vec3(0.13,0.075,0.025) * pow(sunFacing,8.0);
      color += vec3(0.50,0.34,0.15) * pow(sunFacing,128.0);
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
