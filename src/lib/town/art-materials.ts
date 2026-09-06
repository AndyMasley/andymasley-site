import * as THREE from 'three';

type ArtKind = 'siding' | 'roof' | 'brick' | 'trim' | 'glass' | 'foundation' | 'concrete' | 'asphalt' | 'shoulder' | 'leaf' | 'far-leaf' | 'bark' | 'car-paint' | 'car-glass' | 'rubber';
type Registration = {
  kind: ArtKind;
  color: THREE.Color;
  roughness: number;
  metalness: number;
  envMapIntensity: number;
  flatShading: boolean;
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
  'Streetscape | repaired sidewalk concrete': 'concrete', 'Streetscape | granite curb': 'concrete',
  'Drive road | asphalt': 'asphalt', 'Drive road | weathered shoulder': 'shoulder',
  'Streetscape | parking apron asphalt': 'asphalt', 'Streetscape | asphalt utility repair': 'asphalt',
  'Inferred deciduous leaf clusters': 'leaf', 'Canopy | subdued summer green': 'far-leaf',
  'Canopy trunks | schematic bark': 'bark', 'Drive car | deep teal pearl': 'car-paint',
  'Drive car | smoked reflective glass': 'car-glass', 'Drive car | rubber': 'rubber',
  'Parked | spruce': 'car-paint', 'Parked | graphite': 'car-paint', 'Parked | silver': 'car-paint',
  'Parked | warm white': 'car-paint',
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
  if (kind === 'siding') return start + `
float townPaintAge = townArtNoise(vTownArtWorld.xz*0.16 + vec2(vTownArtWorld.y*0.08));
diffuseColor.rgb *= mix(0.95,1.035,townPaintAge);
`;
  if (kind === 'roof') return start + `
float townRoofChoice = townArtNoise(vTownArtWorld.xz*0.035);
// Roof UV families differ across reconstructed and retained sources.
// Continuous world-space weathering avoids assuming a common local origin.
diffuseColor.rgb *= mix(vec3(0.83,0.85,0.84),vec3(1.12,1.09,1.035),townRoofChoice);
diffuseColor.rgb *= mix(0.96,1.04,townArtNoise(vTownArtWorld.xz*0.70));
`;
  if (kind === 'asphalt' || kind === 'concrete' || kind === 'foundation' || kind === 'shoulder') return start + (kind === 'asphalt' ? `
// map_fragment already supplies linear reflectance. Keep its aggregate luminance,
// remove the brown source cast, and give asphalt a restrained cool mineral tone.
float townAsphaltValue = dot(diffuseColor.rgb,vec3(0.2126,0.7152,0.0722));
diffuseColor.rgb = mix(diffuseColor.rgb,vec3(townAsphaltValue)*vec3(0.94,1.0,1.07),0.96);
` : '') + `
float townStoneGrain = townArtNoise(vTownArtWorld.xz*37.0 + vec2(vTownArtWorld.y*9.0));
float townStoneAge = townArtNoise(vTownArtWorld.xz*0.24 + vec2(vTownArtWorld.y*0.17));
diffuseColor.rgb *= mix(0.94,1.04,townStoneAge) * (1.0+(townStoneGrain-0.5)*${kind === 'asphalt' ? '0.14' : '0.10'}*townArtClose);
townArtHeight = (townStoneGrain-0.5)*${kind === 'asphalt' ? '0.00055' : '0.00035'}*townArtClose;
`;
  if (kind === 'brick' || kind === 'bark') return start + `
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
if (abs(townArtDet)>0.0000000001) {
  vec3 townArtGradient = sign(townArtDet)*(dFdx(townArtHeight)*townArtR1+dFdy(townArtHeight)*townArtR2);
  normal = normalize(abs(townArtDet)*normal-townArtGradient);
}
`;

function finishTreatment(kind: ArtKind): string {
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
export function applyArtMaterial(material: THREE.MeshStandardMaterial): void {
  if (!material.isMeshStandardMaterial || registrations.has(material)) return;
  const kind = kinds[material.name];
  if (!kind) return;
  const state: Registration = {
    kind, color: material.color.clone(), roughness: material.roughness, metalness: material.metalness,
    envMapIntensity: material.envMapIntensity, flatShading: material.flatShading, normalScale: material.normalScale.clone(),
    compile: material.onBeforeCompile, key: material.customProgramCacheKey, previousTag: material.userData.townArt,
  };
  const previousKey = state.key.call(material);
  registrations.set(material, state);
  if (kind === 'siding') { material.color.set(sidingColor(state.color)); material.roughness = 0.84; }
  if (kind === 'roof') { material.color.set('#545a5c'); material.roughness = 0.94; }
  if (kind === 'trim') { material.color.set('#d3cdbb'); material.roughness = 0.78; }
  if (kind === 'foundation') { material.color.set('#97968a'); material.roughness = 0.94; }
  if (kind === 'brick') { material.roughness = 0.9; material.normalScale.multiplyScalar(0.55); }
  if (kind === 'concrete') {
    material.color.set(material.name.includes('granite') ? '#96998f' : material.name.includes('repaired') ? '#b1afa5' : material.name.includes('cool') ? '#a6a79d' : '#aba89c');
    material.roughness = 0.97;
    material.flatShading = true;
    material.normalScale.multiplyScalar(0.22);
  }
  if (kind === 'asphalt') {
    if (material.map) material.color.setRGB(0.50,0.50,0.50);
    else material.color.set(material.name.includes('repair') ? '#484b48' : '#50534e');
    material.roughness = 0.96;
    material.normalScale.multiplyScalar(0.38);
  }
  if (kind === 'shoulder') { material.color.set('#77796a'); material.roughness = 0.98; }
  if (kind === 'glass') { material.color.set('#426574'); material.roughness = 0.16; material.metalness = 0.23; material.envMapIntensity = 0.32; }
  if (kind === 'leaf') { material.roughness = 0.88; material.envMapIntensity = 0.12; }
  if (kind === 'far-leaf') { material.color.set('#657c48'); material.roughness = 0.95; }
  if (kind === 'bark') { material.roughness = 0.93; }
  if (kind === 'car-paint') { material.roughness = 0.22; material.metalness = 0.38; material.envMapIntensity = 0.35; }
  if (kind === 'car-glass') { material.roughness = 0.11; material.metalness = 0.35; material.envMapIntensity = 0.40; }
  if (kind === 'rubber') { material.roughness = 0.93; material.metalness = 0; }
  material.userData.townArt = { version: 1, kind, sourceColor: state.color.toArray(), appearance: 'Inferred late-summer material treatment; geometry, original maps and UVs retained.' };
  material.onBeforeCompile = (shader, renderer) => {
    state.compile.call(material, shader, renderer);
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
    if (['asphalt','concrete','foundation','shoulder'].includes(kind)) shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>', mineralNormal);
  };
  material.customProgramCacheKey = () => `${previousKey}|webster-art-material-v1:${kind}`;
  material.addEventListener('dispose', onMaterialDispose);
  material.needsUpdate = true;
}

function onMaterialDispose(event: THREE.Event<'dispose', THREE.MeshStandardMaterial>): void {
  const material = event.target;
  if (material) { registrations.delete(material); material.removeEventListener('dispose', onMaterialDispose); }
}

/** Restore this module's changes without disposing shared maps or materials. */
export function removeArtMaterial(material: THREE.MeshStandardMaterial): void {
  const state = registrations.get(material);
  if (!state) return;
  material.color.copy(state.color); material.roughness = state.roughness; material.metalness = state.metalness;
  material.envMapIntensity = state.envMapIntensity; material.flatShading = state.flatShading; material.normalScale.copy(state.normalScale);
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
