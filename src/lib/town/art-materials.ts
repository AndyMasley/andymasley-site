import * as THREE from 'three';
import { BARK_FINISH_GLSL } from './vegetation-finish';
import { applySiteArtMaterial, removeSiteArtMaterial } from './site-surface-finish';
import { mineralFragment, MINERAL_ROUGHNESS } from './mineral-finish';

type ArtKind = 'siding' | 'roof' | 'brick' | 'trim' | 'glass' | 'foundation' | 'concrete' | 'granite' | 'asphalt' | 'shoulder' | 'road-paint' | 'leaf' | 'far-leaf' | 'bark' | 'car-paint' | 'car-glass' | 'rubber' | 'water';
type Registration = {
  kind: ArtKind;
  color: THREE.Color;
  roughness: number;
  metalness: number;
  envMapIntensity: number;
  flatShading: boolean;
  vertexColors: boolean;
  normalScale: THREE.Vector2;
  compile: THREE.Material['onBeforeCompile'];
  key: THREE.Material['customProgramCacheKey'];
  previousTag: unknown;
};
const registrations = new WeakMap<THREE.MeshStandardMaterial, Registration>();

// Only inferred surfaces and modeled transport/vegetation are recolored.
// Photo, Town Hall and Reference materials retain their authored colors/maps.
const kinds: Record<string, ArtKind> = {
  'V2 inferred | siding': 'siding', 'V2 inferred | roof': 'roof', 'V2 inferred | flat_roof': 'roof',
  'V2 inferred | brick': 'brick', 'V2 inferred | trim': 'trim', 'V2 inferred | glass': 'glass',
  'V2 inferred | foundation': 'foundation', 'V2 inferred | concrete_wall': 'foundation',
  'Streetscape | warm sidewalk concrete': 'concrete', 'Streetscape | cool sidewalk concrete': 'concrete',
  'Streetscape | repaired sidewalk concrete': 'concrete', 'Streetscape | granite curb': 'granite',
  'Drive road | asphalt': 'asphalt', 'Drive road | weathered shoulder': 'shoulder',
  'Streetscape | parking apron asphalt': 'asphalt', 'Streetscape | asphalt utility repair': 'asphalt',
  'Finished parking | asphalt': 'asphalt', 'Finished street corner | asphalt apron': 'asphalt',
  'Drive road | warm yellow paint': 'road-paint', 'Drive road | chalk white paint': 'road-paint',
  'Streetscape | inferred crossing paint': 'road-paint', 'Finished road | solid yellow centerline': 'road-paint',
  'Inferred deciduous leaf clusters': 'leaf', 'Canopy | subdued summer green': 'far-leaf',
  'Canopy trunks | schematic bark': 'bark', 'Drive car | deep teal pearl': 'car-paint',
  'Drive car | smoked reflective glass': 'car-glass', 'Drive car | rubber': 'rubber',
  'Parked | spruce': 'car-paint', 'Parked | graphite': 'car-paint', 'Parked | silver': 'car-paint',
  'Parked | warm white': 'car-paint',
  'Mapped water | inferred level and appearance': 'water',
  'Boundary context | water': 'water',
};

// The GLB factors are linear RGB. Palette hexes are intentionally sRGB paint
// choices, converted once by Three rather than interpreted as linear reflectance.
const sidingPalette = [
  { source: [0.4, 0.48, 0.49], paint: '#758c98' },
  { source: [0.53, 0.61, 0.61], paint: '#97a9b2' },
  { source: [0.57, 0.57, 0.49], paint: '#adae96' },
  { source: [0.59, 0.58, 0.53], paint: '#bab5a4' },
  { source: [0.66, 0.68, 0.64], paint: '#a0ad96' },
  { source: [0.67, 0.65, 0.59], paint: '#c9bea4' },
  { source: [0.67, 0.65, 0.6], paint: '#d3cab6' },
];

function sidingColor(source: THREE.Color): string {
  let nearest = sidingPalette[0], distance = Infinity;
  for (const choice of sidingPalette) {
    const d = (source.r - choice.source[0]) ** 2 + (source.g - choice.source[1]) ** 2 + (source.b - choice.source[2]) ** 2;
    if (d < distance) { nearest = choice; distance = d; }
  }
  return nearest.paint;
}

const functions = `
varying vec3 vTownArtWorld;
uniform float townArtTime;
float townArtHash(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}
float townArtNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(townArtHash(i),townArtHash(i+vec2(1.0,0.0)),f.x),
             mix(townArtHash(i+vec2(0.0,1.0)),townArtHash(i+vec2(1.0)),f.x),f.y);
}
`;

function mapTreatment(kind: ArtKind): string {
  const start = `
#include <map_fragment>
float townArtHeight = 0.0;
float townArtDistance = length(cameraPosition - vTownArtWorld);
float townArtFootprint = max(length(dFdx(vTownArtWorld)),length(dFdy(vTownArtWorld)));
float townArtClose = (1.0-smoothstep(35.0,100.0,townArtDistance)) * (1.0-smoothstep(0.02,0.10,townArtFootprint));
`;
  if (kind === 'water') return start + `
// Small wind ripples perturb shading only: the mapped shoreline and water level
// remain intact. World coordinates keep the phase continuous across tile edges.
vec2 townWaterP = vTownArtWorld.xz;
float townWaterFine = 1.0-smoothstep(0.035,0.12,townArtFootprint);
float townWaterMid = 1.0-smoothstep(0.12,0.50,townArtFootprint);
// Slowly varying wind domains break the former three perfectly periodic bands.
// Lower slopes and pixel-footprint fading avoid a standing moiré pattern.
vec2 townWaterWind = townWaterP + 2.8*vec2(townArtNoise(townWaterP*.071),townArtNoise(townWaterP*.067+vec2(17.3,41.7)));
float townWaterStrength = mix(.72,1.08,townArtNoise(townWaterP*.11+vec2(3.1,9.7)));
townArtHeight = (sin(dot(townWaterWind,vec2(1.71,2.23))-townArtTime*.71)*.006
 +sin(dot(townWaterWind,vec2(-2.63,1.43))+townArtTime*.83)*.0035
 +(sin(dot(townWaterWind,vec2(7.31,2.17))-townArtTime*1.17)*.0013
 +sin(dot(townWaterWind,vec2(-3.97,8.73))+townArtTime*1.41)*.0008)*townWaterMid
 +sin(dot(townWaterWind,vec2(19.73,11.31))-townArtTime*1.83)*.00025*townWaterFine)*townWaterStrength;
diffuseColor.rgb *= mix(0.96,1.04,townArtNoise(townWaterP*0.06));
`;
  if (kind === 'siding') return start + `
float townPaintAge = townArtNoise(vTownArtWorld.xz*0.16 + vec2(vTownArtWorld.y*0.08));
diffuseColor.rgb *= mix(0.95,1.035,townPaintAge);
// Painted clapboard is a sequence of lapped boards, not a large flat paint chip.
// Height is in world metres, so adjacent primitives and tile LODs keep the same scale.
float townBoard = fract(vTownArtWorld.y / 0.145);
float townBoardAA = max(fwidth(vTownArtWorld.y / 0.145),0.015);
float townBoardSeam = 1.0-smoothstep(0.03,0.03+townBoardAA,townBoard);
float townBoardDetail = 1.0-smoothstep(0.03,0.16,townArtFootprint);
diffuseColor.rgb *= 1.0-townBoardSeam*0.17*townBoardDetail;
townArtHeight = townBoard*0.0035*townBoardDetail;
`;
  if (kind === 'roof') return start + `
float townRoofChoice = townArtNoise(vTownArtWorld.xz*0.035);
// Roof UV families differ across reconstructed and retained sources.
// Continuous world-space weathering avoids assuming a common local origin.
diffuseColor.rgb *= mix(vec3(0.83,0.85,0.84),vec3(1.12,1.09,1.035),townRoofChoice);
diffuseColor.rgb *= mix(0.96,1.04,townArtNoise(vTownArtWorld.xz*0.70));
`;
  if (kind === 'road-paint') return start + `
// At most nine percent reflectance loss: retain every white/yellow source
// polygon and its opacity. This is material wear, never a missing dash or sign.
float townPaintWear=townArtNoise(vTownArtWorld.xz*1.7);
float townPaintGrain=townArtNoise(vTownArtWorld.xz*61.0);
diffuseColor.rgb*=mix(.92,1.0,townPaintWear)*(1.0-.01*townPaintGrain*townArtClose);
`;
  if (kind === 'asphalt' || kind === 'concrete' || kind === 'granite' || kind === 'foundation' || kind === 'shoulder') return start + (kind === 'asphalt' ? `
// map_fragment already supplies linear reflectance. Keep its aggregate luminance,
// remove the brown source cast, and give asphalt a restrained cool mineral tone.
float townAsphaltValue = dot(diffuseColor.rgb,vec3(0.2126,0.7152,0.0722));
diffuseColor.rgb = mix(diffuseColor.rgb,vec3(townAsphaltValue)*vec3(0.94,1.0,1.07),0.96);
` : '') + mineralFragment(kind);
  if (kind === 'bark') return start + BARK_FINISH_GLSL;
  if (kind === 'far-leaf') return start + `
// Sparse distant hulls represent groups of leaves, not polished green solids.
// Both fields live in metres, remain still, and filter out before subpixel size.
vec2 townCrownP = vTownArtWorld.xz + vec2(vTownArtWorld.y*.71,vTownArtWorld.y*.39);
float townCrownCoarse = townArtNoise(townCrownP*.77);
float townCrownFine = townArtNoise(townCrownP*2.6+vec2(23.7,8.1));
float townCrownResolved = 1.0-smoothstep(.12,.48,townArtFootprint);
float townCrownMass = mix(townCrownCoarse,townCrownFine,.32*townCrownResolved);
diffuseColor.rgb *= mix(vec3(.82,.88,.78),vec3(1.14,1.11,1.03),townCrownMass);
townArtHeight = (townCrownCoarse-.5)*.075*(1.0-smoothstep(.3,.9,townArtFootprint))
  +(townCrownFine-.5)*.032*townCrownResolved;
`;
  if (kind === 'brick') return start + `
diffuseColor.rgb *= mix(0.96,1.04,townArtNoise(vTownArtWorld.xz*0.31+vec2(vTownArtWorld.y*0.29)));
`;
  return start;
}

const mineralNormal = `
#include <normal_fragment_maps>
// Small height perturbations use metre-scale derivatives and fade before aliasing.
vec3 townArtDx = dFdx(-vViewPosition), townArtDy = dFdy(-vViewPosition);
vec3 townArtR1 = cross(townArtDy,normal), townArtR2 = cross(normal,townArtDx);
float townArtDet = dot(townArtDx,townArtR1);
vec2 townArtHeightGradient = vec2(dFdx(townArtHeight),dFdy(townArtHeight));
if (abs(townArtDet)>0.0000000001) {
  vec3 townArtGradient = sign(townArtDet)*(townArtHeightGradient.x*townArtR1+townArtHeightGradient.y*townArtR2);
  normal = normalize(abs(townArtDet)*normal-townArtGradient);
}
`;

function finishTreatment(kind: ArtKind): string {
  if (kind === 'far-leaf') return `
// A few stable openings on the outer rim soften the solid hull silhouette.
// No screen-space dither: unresolved foliage keeps an opaque, steady outline.
float townCrownRim = abs(dot(nonPerturbedNormal,normalize(vViewPosition)));
float townCrownFringe = 1.0-smoothstep(.045,.20,townArtFootprint);
if(townCrownRim<.22 && townCrownFine<.27*townCrownFringe) discard;
#include <opaque_fragment>
`;
  if (kind === 'glass') return `
// Darken the room-facing diffuse contribution, retaining the actual sky's
// dielectric reflection instead of adding a uniform cyan light to every pane.
float townWindowInterior = townArtNoise(floor(vTownArtWorld.xz*0.4)+floor(vTownArtWorld.y/2.8));
outgoingLight -= totalDiffuse * (1.0-mix(0.48,0.68,townWindowInterior));
#include <opaque_fragment>
`;
  if (kind === 'leaf') return `
// A restrained forward-scattering response restores thin-leaf readability.
// Alpha testing, the original leaf atlas, vertex color and shadow rules remain.
#if NUM_DIR_LIGHTS > 0
float townLeafBacklight = pow(max(0.0,dot(normalize(vViewPosition),-directionalLights[0].direction)),2.0);
float townLeafSun = min(2.5,max(directionalLights[0].color.r,max(directionalLights[0].color.g,directionalLights[0].color.b)));
outgoingLight += diffuseColor.rgb * townLeafSun * (0.012+0.070*townLeafBacklight);
#endif
#include <opaque_fragment>
`;
  return '#include <opaque_fragment>';
}

/** Modify one newly pooled material; repeated registration is a no-op. */
export function applyArtMaterial(material: THREE.MeshStandardMaterial, clock: { value: number } = { value: 0 }): void {
  if (!material.isMeshStandardMaterial || registrations.has(material)) return;
  if (applySiteArtMaterial(material)) return;
  const kind = kinds[material.name];
  if (!kind) return;
  const state: Registration = {
    kind, color: material.color.clone(), roughness: material.roughness, metalness: material.metalness,
    envMapIntensity: material.envMapIntensity, flatShading: material.flatShading, vertexColors: material.vertexColors, normalScale: material.normalScale.clone(),
    compile: material.onBeforeCompile, key: material.customProgramCacheKey, previousTag: material.userData.townArt,
  };
  const previousKey = state.key.call(material);
  registrations.set(material, state);
  if (kind === 'siding') { material.color.set(sidingColor(state.color)); material.roughness = 0.84; }
  if (kind === 'roof') { material.color.set('#606469'); material.roughness = 0.90; }
  if (kind === 'trim') { material.color.set('#e2ded0'); material.roughness = 0.78; }
  if (kind === 'foundation') { material.color.set('#97968a'); material.roughness = 0.94; }
  if (kind === 'brick') { material.roughness = 0.9; material.normalScale.multiplyScalar(0.55); }
  if (kind === 'concrete' || kind === 'granite') {
    material.color.set(kind === 'granite' ? '#98988f' : material.name.includes('repaired') ? '#b1afa5' : material.name.includes('cool') ? '#a6a79d' : '#aba89c');
    material.roughness = 0.97;
    material.flatShading = true;
    material.normalScale.multiplyScalar(0.22);
  }
  if (kind === 'asphalt') {
    if (material.name === 'Finished parking | asphalt') material.color.set('#4c4f49');
    else if (material.name === 'Finished street corner | asphalt apron') material.color.set('#30332f');
    else if (material.map) material.color.setRGB(0.50,0.50,0.50);
    else material.color.set(material.name.includes('repair') ? '#484b48' : '#50534e');
    material.roughness = 0.94;
    material.normalScale.multiplyScalar(0.38);
  }
  if (kind === 'shoulder') { material.color.set('#868174'); material.roughness = 0.98; }
  if (kind === 'road-paint') { material.roughness=Math.max(.94,material.roughness); }
  if (kind === 'glass') { material.color.set('#34464b'); material.roughness = 0.14; material.metalness = 0; material.envMapIntensity = 0.85; }
  if (kind === 'leaf') { material.roughness = 0.88; material.envMapIntensity = 0.12; }
  if (kind === 'far-leaf') { material.color.set('#576d43'); material.roughness = 0.95; material.vertexColors = true; }
  if (kind === 'bark') {
    // The pinned trunk already has a bark atlas. Retain its source factor so
    // the gray-brown interpretation does not darken its reflectance twice.
    if (!material.map) material.color.set('#776f61');
    material.roughness = 0.96;
  }
  if (kind === 'car-paint') { material.roughness = 0.22; material.metalness = 0.38; material.envMapIntensity = 0.35; }
  if (kind === 'car-glass') { material.roughness = 0.11; material.metalness = 0.35; material.envMapIntensity = 0.40; }
  if (kind === 'rubber') { material.roughness = 0.93; material.metalness = 0; }
  if (kind === 'water') {
    // VC-0382–0393: blue open water and broken sky reflection. This is an
    // absorption/roughness interpretation, not a depth or water-quality map.
    // Lower diffuse reflectance keeps the bright summer fill from making the
    // lake an opaque pale-gray sheet; dielectric sky reflection stays intact.
    material.color.set('#153f50'); material.roughness = 0.22;
    material.metalness = 0; material.envMapIntensity = 0.85;
  }
  material.userData.townArt = { version: 2, kind, sourceColor: state.color.toArray(), appearance: 'Inferred late-summer material treatment; geometry, original maps and UVs retained.' };
  material.onBeforeCompile = (shader, renderer) => {
    state.compile.call(material, shader, renderer);
    shader.uniforms.townArtTime = clock;
    if (!shader.vertexShader.includes('#include <project_vertex>') || !shader.fragmentShader.includes('#include <map_fragment>') || !shader.fragmentShader.includes('#include <opaque_fragment>')) throw new Error('Town art material shader anchors changed.');
    shader.vertexShader = `varying vec3 vTownArtWorld;\n${shader.vertexShader}`.replace('#include <project_vertex>', `
#include <project_vertex>
vec4 townArtPosition = vec4(transformed,1.0);
#ifdef USE_INSTANCING
townArtPosition = instanceMatrix * townArtPosition;
#endif
vTownArtWorld = (modelMatrix * townArtPosition).xyz;
`);
    shader.fragmentShader = functions + shader.fragmentShader.replace('#include <map_fragment>', mapTreatment(kind)).replace('#include <opaque_fragment>', finishTreatment(kind));
    if (['siding','asphalt','concrete','granite','foundation','shoulder','water','bark','far-leaf'].includes(kind)) shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>', mineralNormal);
    if (['asphalt','concrete','granite','foundation','shoulder'].includes(kind)) {
      if (!shader.fragmentShader.includes('#include <roughnessmap_fragment>')) throw new Error('Town mineral roughness shader anchor changed.');
      shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', MINERAL_ROUGHNESS);
    }
    if (kind === 'water') {
      if (!shader.fragmentShader.includes('#include <roughnessmap_fragment>')) throw new Error('Town water roughness shader anchor changed.');
      // Reuse the already evaluated wind field. Changing roughness gently
      // breaks the broad sky highlight without another sample, texture, render
      // pass or an invented reflection of a particular shoreline building.
      shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', `
#include <roughnessmap_fragment>
roughnessFactor = clamp(roughnessFactor + (townWaterStrength - .90)*.12, .18, .27);
`);
    }
    if (kind === 'asphalt') {
      if (!shader.vertexShader.includes('#include <uv_vertex>')) throw new Error('Town pavement UV shader anchor changed.');
      // Native asphalt repeats at 2.08 m; display its existing atlas at 1.30 m.
      // Shared texture transforms and source UV attributes stay untouched.
      shader.vertexShader = shader.vertexShader.replace('#include <uv_vertex>', `#include <uv_vertex>
#ifdef USE_MAP
vMapUv *= 1.6;
#endif
#ifdef USE_NORMALMAP
vNormalMapUv *= 1.6;
#endif`);
    }
  };
  material.customProgramCacheKey = () => `${previousKey}|webster-art-material-v2:${kind}${kind==='water'?'|summer-water-optics-v2':kind==='bark'?'|regional-bark-v1':kind==='glass'?'|dielectric-glass-v1':kind==='far-leaf'?'|layered-far-foliage-v1':''}${['asphalt','concrete','granite','foundation','shoulder'].includes(kind)?'|mineral-families-v2':''}`;
  material.addEventListener('dispose', onMaterialDispose);
  material.needsUpdate = true;
}

function onMaterialDispose(event: THREE.Event<'dispose', THREE.MeshStandardMaterial>): void {
  const material = event.target;
  if (material) { registrations.delete(material); material.removeEventListener('dispose', onMaterialDispose); }
}

/** Restore this module's changes without disposing shared maps or materials. */
export function removeArtMaterial(material: THREE.MeshStandardMaterial): void {
  removeSiteArtMaterial(material);
  const state = registrations.get(material);
  if (!state) return;
  material.color.copy(state.color); material.roughness = state.roughness; material.metalness = state.metalness;
  material.envMapIntensity = state.envMapIntensity; material.flatShading = state.flatShading; material.normalScale.copy(state.normalScale);
  material.vertexColors = state.vertexColors;
  material.onBeforeCompile = state.compile; material.customProgramCacheKey = state.key;
  if (state.previousTag === undefined) delete material.userData.townArt; else material.userData.townArt = state.previousTag;
  material.removeEventListener('dispose', onMaterialDispose); registrations.delete(material); material.needsUpdate = true;
}

const treePalette = [[1.04,1.03,0.92],[0.93,1.035,0.99],[1.015,0.97,1.035],[1.065,1.025,0.87]];

/** Linear multiplicative crown color, stable across tile loads and near/far LODs. */
export function treeArtColor(x: number, z: number, target: THREE.Color): THREE.Color {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return target.setRGB(1,1,1);
  let seed = (Math.imul(Math.round(x*10)^0x45d9f3b,0x27d4eb2d)^Math.imul(Math.round(z*10)^0x119de1f3,0x85ebca6b))>>>0;
  seed = Math.imul(seed^(seed>>>16),0x45d9f3b)>>>0;
  const color = treePalette[seed%treePalette.length], light = 0.96+((seed>>>8)/0xffffff)*0.08;
  return target.setRGB(color[0]*light,color[1]*light,color[2]*light);
}
