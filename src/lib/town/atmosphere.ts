import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';

export const SUMMER_LIGHT = {
  sun: '#fff2dc',
  skyFill: '#b4cfee',
  groundFill: '#9d9a7d',
  // Clear-day key/fill balance. The dated Main Street, St. Joseph and
  // Sitkowski photographs show roughly four-to-one sunlit/shaded ground, crisp
  // cool shade under trees and cars, and differently lit wall orientations.
  sunIntensity: 3.3,
  fillIntensity: 1.3,
  exposure: 1.03,
} as const;

/**
 * Sky colors are scene-referred linear RGB and pass through the same filmic
 * curve as the town, so the sky, its reflections and the distant haze stay in
 * one exposure. Values above 1 are intentional: after the curve they display
 * as a deep summer zenith (about #3d7cc9), a pale horizon (#b7d0e8) and
 * near-white fair-weather cloud, matching the clear-sky reference photographs.
 */
export const SUMMER_SKY = {
  zenith: [0.048, 0.167, 0.55],
  horizon: [0.31, 0.6, 1.22],
  cloud: [2.45, 2.34, 1.9],
  ground: [0.095, 0.113, 0.077],
  treeline: [0.05, 0.066, 0.045],
} as const;

export const linearColor = (rgb: readonly number[]): THREE.Color => new THREE.Color().setRGB(rgb[0], rgb[1], rgb[2], THREE.LinearSRGBColorSpace);

/** Distance haze that converges on the horizon sky rather than a separate grey. */
export function createSummerHaze(): THREE.Fog {
  return new THREE.Fog(linearColor(SUMMER_SKY.horizon), 380, 2400);
}

/**
 * Aerial perspective: summer boundary-layer haze thickens with distance and
 * thins with height (optical depth integrated along each view ray), and it is
 * brighter and warmer toward the sun. Roughly a quarter of the way to the
 * horizon colour at 1 km and half by 2 km, so ridges and tree lines recede in
 * layers as in the late-afternoon reference photographs. The haze colour is
 * the sky's own horizon, so terrain meets the sky without a seam. Installed on
 * the shared shader chunks for the session and restored on disposal.
 */
export const AERIAL_PERSPECTIVE = { density: 0.00032, scaleHeightM: 900, baseY: 40, sunTint: [1.55, 1.25, 0.92], sunGlow: 0.6 } as const;

export function installAerialPerspective(sunDirection: THREE.Vector3): () => void {
  const chunks = THREE.ShaderChunk as unknown as Record<string, string>;
  const names = ['fog_pars_vertex', 'fog_vertex', 'fog_pars_fragment', 'fog_fragment'];
  const previous = Object.fromEntries(names.map(name => [name, chunks[name]]));
  const sun = sunDirection.clone().normalize(), f = (v: number) => v.toFixed(6);
  const { density, scaleHeightM, baseY, sunTint, sunGlow } = AERIAL_PERSPECTIVE;
  chunks.fog_pars_vertex = `#ifdef USE_FOG\nvarying float vFogDepth;\nvarying vec3 vTownFogRay;\n#endif`;
  chunks.fog_vertex = `#ifdef USE_FOG\nvFogDepth = - mvPosition.z;\nvTownFogRay = (vec4(mvPosition.xyz, 0.0) * viewMatrix).xyz;\n#endif`;
  chunks.fog_pars_fragment = `#ifdef USE_FOG\nuniform vec3 fogColor;\nvarying float vFogDepth;\nvarying vec3 vTownFogRay;\n#ifdef FOG_EXP2\nuniform float fogDensity;\n#else\nuniform float fogNear;\nuniform float fogFar;\n#endif\n#endif`;
  chunks.fog_fragment = `#ifdef USE_FOG
float townFogDistance = length(vTownFogRay);
vec3 townFogDir = vTownFogRay / max(townFogDistance, 1e-3);
float townFogStart = ${f(density)} * exp(-(cameraPosition.y - ${f(baseY)}) / ${f(scaleHeightM)});
float townFogRise = townFogDir.y * townFogDistance / ${f(scaleHeightM)};
float townFogOptical = townFogStart * townFogDistance * (abs(townFogRise) > 1e-3 ? (1.0 - exp(-townFogRise)) / townFogRise : 1.0);
float fogFactor = 1.0 - exp(-max(townFogOptical, 0.0));
float townFogSun = pow(max(dot(townFogDir, vec3(${f(sun.x)}, ${f(sun.y)}, ${f(sun.z)})), 0.0), 6.0);
vec3 townFogColor = fogColor * mix(vec3(1.0), vec3(${sunTint.map(f).join(', ')}), townFogSun * ${f(sunGlow)});
#ifdef TONE_MAPPING
townFogColor = toneMapping(townFogColor);
#endif
townFogColor = linearToOutputTexel(vec4(townFogColor, 1.0)).rgb;
gl_FragColor.rgb = mix(gl_FragColor.rgb, townFogColor, fogFactor);
#endif`;
  return () => { for (const name of names) chunks[name] = previous[name]; };
}

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

/**
 * The visible sky, or with `surroundings` the source for reflections and image
 * lighting. Street-level glass, paint and water in the reference photographs
 * mirror trees and buildings just above the horizon rather than open sky, so the
 * reflection source replaces that band with a dark, broken treeline tone.
 */
export function createSummerSky(sunDirection: THREE.Vector3, { surroundings = false } = {}): Sky {
  const sky = new Sky();
  sky.name = surroundings ? 'Late summer reflection surroundings' : 'Late summer sky';
  sky.material.toneMapped = true;
  sky.renderOrder = 1000;
  sky.scale.setScalar(450000);
  sky.material.uniforms.sunPosition.value.copy(sunDirection).normalize();
  Object.assign(sky.material.uniforms, {
    summerZenith: { value: linearColor(SUMMER_SKY.zenith) },
    summerHorizon: { value: linearColor(SUMMER_SKY.horizon) },
    summerCloud: { value: linearColor(SUMMER_SKY.cloud) },
    summerGround: { value: linearColor(SUMMER_SKY.ground) },
    summerTreeline: { value: linearColor(SUMMER_SKY.treeline) },
    summerSurroundings: { value: surroundings ? 1 : 0 },
  });
  sky.material.fragmentShader = `
    varying vec3 vWorldPosition;
    varying vec3 vSunDirection;
    uniform vec3 summerZenith, summerHorizon, summerCloud, summerGround, summerTreeline;
    uniform float summerSurroundings;
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
      vec2 cloudUV = direction.xz / max(0.10, elevation) * 0.62 + vec2(3.1,8.7);
      float field = cloudField(cloudUV);
      // The civic photograph's open blue sky is the baseline. Keep a few
      // separated fair-weather clouds, with the same bounded five-octave cost.
      float cloud = smoothstep(0.55,0.70,field) * smoothstep(0.025,0.15,elevation);
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
      // Reflection source only: the low sky seen in windows, paint and water is
      // greyed by haze, screens and street clutter, then an irregular band of
      // trees and roofs replaces the horizon itself.
      color = mix(color, vec3(dot(color, vec3(0.2126, 0.7152, 0.0722))) * vec3(0.94, 0.98, 1.06), summerSurroundings * 0.45 * (1.0 - smoothstep(0.06, 0.26, direction.y)));
      float treelineTop = 0.045 + 0.05 * cloudNoise(vec2(atan(direction.z, direction.x) * 7.0, 2.7));
      color = mix(color, summerTreeline, summerSurroundings * (1.0 - smoothstep(treelineTop - 0.03, treelineTop, direction.y)) * smoothstep(-0.2, -0.02, direction.y));
      gl_FragColor = vec4(color,1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }
  `;
  return sky;
}
