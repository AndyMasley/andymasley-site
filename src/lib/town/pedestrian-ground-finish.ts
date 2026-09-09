import * as THREE from 'three';
import catalog from '../../../data/derived/town/pedestrian-ground-finish.json';
import release from '../../../data/derived/town/release.json';
import type { GroundedSiteFeature } from './arrival-grounds';

type Finish = typeof catalog.records[number];
const records = new Map(catalog.records.map(record => [record.id, record]));
export const PEDESTRIAN_GROUND_PROVENANCE = catalog;

function install(material: THREE.MeshStandardMaterial, record: Finish): void {
  if (material.userData.pedestrianGroundFinish) return;
  const previous = material.onBeforeCompile, previousKey = material.customProgramCacheKey();
  const { center, tangent, outward } = record.frame;
  material.userData.pedestrianGroundFinish = { version: catalog.version, ...record };
  material.name += ` | pedestrian ${record.id}`;
  material.roughness = record.surface === 'brick-pavers' ? .95 : .94;
  material.onBeforeCompile = (shader, renderer) => {
    previous.call(material, shader, renderer);
    if (!shader.fragmentShader.includes('varying vec3 vCraftedWorld;') || !shader.fragmentShader.includes('#include <roughnessmap_fragment>')) throw new Error('Owned pedestrian ground shader anchors changed.');
    shader.uniforms.townPedestrianOrigin = { value: new THREE.Vector2(center[0], -center[1]) };
    shader.uniforms.townPedestrianFrame = { value: new THREE.Vector4(tangent[0], -tangent[1], outward[0], -outward[1]) };
    shader.uniforms.townPedestrianUnit = { value: new THREE.Vector2(...record.unitM as [number, number]) };
    const brick = record.surface === 'brick-pavers';
    shader.fragmentShader = `
uniform vec2 townPedestrianOrigin;
uniform vec4 townPedestrianFrame;
uniform vec2 townPedestrianUnit;
float pedestrianHash(vec2 p){vec3 q=fract(vec3(p.xyx)*.1031);q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);}
${shader.fragmentShader}`.replace('#include <roughnessmap_fragment>', `
vec2 pedestrianWorld=vCraftedWorld.xz-townPedestrianOrigin;
vec2 pedestrianLocal=vec2(dot(pedestrianWorld,townPedestrianFrame.xy),dot(pedestrianWorld,townPedestrianFrame.zw));
// Differentiate continuous metre coordinates before the staggered rows/fract.
vec2 pedestrianAA=max(fwidth(pedestrianLocal),vec2(.0001));
float pedestrianFootprint=max(pedestrianAA.x,pedestrianAA.y);
vec2 pedestrianGrid=pedestrianLocal/townPedestrianUnit;
${brick ? 'pedestrianGrid.x+=mod(floor(pedestrianGrid.y),2.0)*.5;' : ''}
vec2 pedestrianCell=floor(pedestrianGrid),pedestrianUV=fract(pedestrianGrid);
vec2 pedestrianEdge=min(pedestrianUV,1.0-pedestrianUV)*townPedestrianUnit;
vec2 pedestrianJoint=1.0-smoothstep(vec2(${brick ? '.0012' : '.0015'}),vec2(${brick ? '.0018' : '.0022'})+pedestrianAA*.7,pedestrianEdge);
float pedestrianJointResolved=1.0-smoothstep(${brick ? '.006,.026' : '.015,.065'},pedestrianFootprint);
float pedestrianPanelResolved=1.0-smoothstep(${brick ? '.04,.12' : '.15,.45'},pedestrianFootprint);
float pedestrianVariation=(pedestrianHash(pedestrianCell)-.5)*pedestrianPanelResolved;
diffuseColor.rgb*=1.0+pedestrianVariation*${brick ? '.13' : '.055'};
diffuseColor.rgb*=1.0-max(pedestrianJoint.x,pedestrianJoint.y)*pedestrianJointResolved*${brick ? '.25' : '.19'};
#include <roughnessmap_fragment>
`);
  };
  // Site identity prevents the material pool from merging distinct uniform frames.
  material.customProgramCacheKey = () => `${previousKey}|pedestrian-ground-v1:${record.id}:${record.surface}`;
  material.needsUpdate = true;
}

function ownedPaving(mesh: THREE.Object3D): mesh is THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial> {
  return mesh instanceof THREE.Mesh && !Array.isArray(mesh.material) && mesh.material instanceof THREE.MeshStandardMaterial && mesh.userData.townCrafted === true && mesh.material.userData.townCrafted === true && mesh.material.userData.surfaceRole === 'paving';
}

/** A color is only used to find the already owned batch. Every contributing
 * source feature must explicitly qualify; generic paving is never reclassified. */
export function finishGroundedPedestrianSurfaces(group: THREE.Group, features: readonly GroundedSiteFeature[]): number {
  if (catalog.sourceManifestSha256 !== release.manifestSha256) return 0;
  let count = 0;
  group.traverse(mesh => {
    if (!ownedPaving(mesh)) return;
    const sourceIds = mesh.userData.sourceIds as string[] | undefined;
    if (sourceIds?.length !== 1) return;
    const candidates = features.filter(feature => sourceIds?.includes(feature.sid) && (feature.color ?? (feature.kind === 'bed' ? '#625546' : '#aaa697')).slice(1) === mesh.material.color.getHexString());
    if (!candidates.length) return;
    const record = records.get(candidates[0].id);
    if (!record || record.surface !== 'concrete-panels' || !candidates.every(feature => feature.id === record.id && feature.sid === record.sourceId && feature.kind === record.sourceKind)) return;
    install(mesh.material, record); count++;
  });
  return count;
}

export function finishMemorialPedestrianSurfaces(group: THREE.Group): number {
  if (catalog.sourceManifestSha256 !== release.manifestSha256) return 0;
  const record = records.get('MON-004-court')!;
  let count = 0;
  group.traverse(mesh => {
    if (!ownedPaving(mesh)) return;
    const ids = mesh.userData.sourceIds as string[] | undefined;
    if (ids?.length !== 1 || ids[0] !== record.sourceId || mesh.material.color.getHexString() !== record.color.slice(1)) return;
    install(mesh.material, record); count++;
  });
  return count;
}
