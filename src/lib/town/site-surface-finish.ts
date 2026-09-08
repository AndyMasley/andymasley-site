import * as THREE from 'three';

type XY = readonly number[];
type Basin = { outline: readonly XY[]; innerOutline: readonly XY[]; base: number; water: number };
type Launch = { point: XY; angle?: number; waterHeight: number | null };
const prefix = 'Finished site | ';
const names = new Set(['launch concrete','basin concrete','court','field turf','infield earth']);
type FinishState={color:THREE.Color;roughness:number;metalness:number;envMapIntensity:number;compile:THREE.Material['onBeforeCompile'];key:THREE.Material['customProgramCacheKey'];onDispose:()=>void};
const installed = new WeakMap<THREE.MeshStandardMaterial,FinishState>();

function segmentDistance(p: XY, a: XY, b: XY): number {
  const dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy||1)));
  return Math.hypot(p[0]-a[0]-dx*t,p[1]-a[1]-dy*t);
}
function ringDistance(p: XY, ring: readonly XY[]): number {
  let result=Infinity;for(let i=0;i<ring.length;i++)result=Math.min(result,segmentDistance(p,ring[i],ring[(i+1)%ring.length]));return result;
}
function material(mesh: THREE.Mesh): THREE.MeshStandardMaterial | undefined {
  return !Array.isArray(mesh.material)&&mesh.material instanceof THREE.MeshStandardMaterial?mesh.material:undefined;
}
function annotate(m: THREE.MeshStandardMaterial, kind: string): void {
  m.name=prefix+kind;m.userData.townCrafted=true;
  m.userData.siteFinish={version:1,kind,basis:'Authored construction finish on the already registered form; no additional surveyed wear, traction rating, treatment process or maintenance claim.'};
}

/** Attribute-only finish for owned, non-indexed basin batches. Height references
 * are constant within each source triangle, so separate basins can share a draw. */
export function finishBasinSurfaces(group: THREE.Object3D, origin: XY, rows: readonly Basin[]): number {
  let bytes=0;
  group.traverse(o=>{
    if(!(o instanceof THREE.Mesh))return;const m=material(o);if(!m||m.userData.surfaceRole!=='foundation'||o.geometry.hasAttribute('townSiteData'))return;
    const p=o.geometry.getAttribute('position');if(!p||o.geometry.index||!rows.length)return;
    const values=new Float32Array(p.count*4);
    for(let i=0;i<p.count;i+=3){
      const center=[0,0];for(let j=0;j<3;j++){center[0]+=(p.getX(i+j)+origin[0])/3;center[1]+=(-p.getZ(i+j)-origin[2])/3;}
      let row=rows[0],distance=Infinity;
      for(const candidate of rows){const d=Math.min(ringDistance(center,candidate.outline),ringDistance(center,candidate.innerOutline));if(d<distance){row=candidate;distance=d;}}
      const inner=ringDistance(center,row.innerOutline)+.03<ringDistance(center,row.outline),height=inner?row.water:row.base;
      for(let j=0;j<3;j++)values.set([0,0,height,inner?1:0],(i+j)*4);
    }
    o.geometry.setAttribute('townSiteData',new THREE.BufferAttribute(values,4));bytes+=values.byteLength;annotate(m,'basin concrete');
  });return bytes;
}

/** Existing launch geometry supplies orientation; water darkening is omitted
 * when there is no supported retained water sample. No water level is guessed. */
export function finishLaunchSurfaces(group: THREE.Object3D, origin: XY, rows: readonly Launch[]): number {
  let bytes=0;
  group.traverse(o=>{
    if(!(o instanceof THREE.Mesh))return;const m=material(o);if(!m||m.userData.surfaceRole!=='paving'||m.color.getHexString()!=='aaa99a'||o.geometry.hasAttribute('townSiteData')||!rows.length)return;
    const p=o.geometry.getAttribute('position'),values=new Float32Array(p.count*4);
    for(let i=0;i<p.count;i++){
      const east=p.getX(i)+origin[0],north=-p.getZ(i)-origin[2];let row=rows[0],distance=Infinity;
      for(const candidate of rows){const d=Math.hypot(east-candidate.point[0],north-candidate.point[1]);if(d<distance){row=candidate;distance=d;}}
      const a=row.angle??0,c=Math.cos(a),s=Math.sin(a),dx=east-row.point[0],dn=north-row.point[1];
      values.set([dx*c+dn*s,dx*s-dn*c,row.waterHeight??-10000,row.waterHeight===null?0:1],i*4);
    }
    o.geometry.setAttribute('townSiteData',new THREE.BufferAttribute(values,4));bytes+=values.byteLength;annotate(m,'launch concrete');
  });return bytes;
}

/** Only existing court/infield batches are selected. Nets, paint, solar panels,
 * fences, aprons and piers retain their own materials and geometry. */
export function finishRecreationSurfaces(group: THREE.Object3D): void {
  group.traverse(o=>{
    if(!(o instanceof THREE.Mesh))return;const m=material(o);if(!m||m.userData.surfaceRole!=='paving')return;
    const color=m.color.getHexString();
    if(color==='4c665c'||color==='63736b')annotate(m,'court');
    else if(color==='687a65')annotate(m,'field turf');
    else if(color==='a68f6c')annotate(m,'infield earth');
  });
}

/** Called by the material pool. Texture ownership and all original shader hooks
 * remain with their existing owners; the finish creates no GPU resources. */
export function applySiteArtMaterial(m: THREE.MeshStandardMaterial): boolean {
  if(!m.name.startsWith(prefix))return false;const kind=m.name.slice(prefix.length);if(!names.has(kind))return false;
  if(installed.has(m))return true;
  const previous=m.onBeforeCompile,key=m.customProgramCacheKey();
  const onDispose=()=>{installed.delete(m);m.removeEventListener('dispose',onDispose);};
  installed.set(m,{color:m.color.clone(),roughness:m.roughness,metalness:m.metalness,envMapIntensity:m.envMapIntensity,compile:previous,key:m.customProgramCacheKey,onDispose});
  const contextual=kind==='basin concrete'||kind==='launch concrete';
  m.roughness=kind==='court'?.93:.97;m.metalness=0;m.envMapIntensity=.12;
  if(kind==='launch concrete')m.color.set('#989b91');
  m.onBeforeCompile=(shader,renderer)=>{
    previous.call(m,shader,renderer);
    if(!shader.vertexShader.includes('#include <project_vertex>')||!shader.fragmentShader.includes('#include <map_fragment>')||!shader.fragmentShader.includes('#include <normal_fragment_maps>'))throw new Error('Site surface shader anchors changed.');
    shader.vertexShader=`varying vec3 vTownSiteWorld;\n${contextual?'attribute vec4 townSiteData; varying vec4 vTownSiteData;\n':''}${shader.vertexShader}`.replace('#include <project_vertex>',`#include <project_vertex>\nvTownSiteWorld=(modelMatrix*vec4(transformed,1.0)).xyz;\n${contextual?'vTownSiteData=townSiteData;':''}`);
    const treatment=kind==='launch concrete'?`
float siteJointPosition=abs(fract((vTownSiteData.x+.031)/2.6)-.5)*2.6;
float siteJoint=1.0-smoothstep(.004,.008+fwidth(vTownSiteData.x),siteJointPosition);
float siteBroom=sin(vTownSiteData.x*628.3185+siteNoise(vTownSiteData.xy*4.0)*.75);
float siteBroomFade=1.0-smoothstep(.003,.02,siteFootprint);
float siteWet=vTownSiteData.w*(1.0-smoothstep(-.05,.24,vTownSiteWorld.y-vTownSiteData.z));
diffuseColor.rgb*=mix(.70,1.0,1.0-siteWet)*(1.0-.13*siteJoint*siteClose);
siteHeight+=(siteBroom*.00025*siteBroomFade-siteJoint*.0007)*siteClose;
`:kind==='basin concrete'?`
float siteContact=1.0-smoothstep(.015,.24,max(0.0,vTownSiteWorld.y-vTownSiteData.z));
float siteStreak=siteNoise(vec2(vTownSiteWorld.x+vTownSiteWorld.z,vTownSiteWorld.y*.035)*7.0);
diffuseColor.rgb*=1.0-siteContact*mix(.12,.22,vTownSiteData.w)*mix(.72,1.0,siteStreak);
`:kind==='field turf'?`
float siteCut=sin(dot(vTownSiteWorld.xz,vec2(.17,.113))+siteNoise(vTownSiteWorld.xz*.012)*.3);
diffuseColor.rgb*=1.0+siteCut*.022;
`:'';
    shader.fragmentShader=`
varying vec3 vTownSiteWorld;
${contextual?'varying vec4 vTownSiteData;':''}
float siteHash(vec2 p){vec3 q=fract(vec3(p.xyx)*.1031);q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);}
float siteNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(siteHash(i),siteHash(i+vec2(1,0)),f.x),mix(siteHash(i+vec2(0,1)),siteHash(i+vec2(1)),f.x),f.y);}
${shader.fragmentShader}`.replace('#include <map_fragment>',`
#include <map_fragment>
float siteFootprint=max(length(dFdx(vTownSiteWorld)),length(dFdy(vTownSiteWorld)));
float siteClose=1.0-smoothstep(.025,.09,siteFootprint);
float siteGrain=siteNoise(vTownSiteWorld.xz*${kind==='infield earth'?'65.0':'110.0'}+vec2(vTownSiteWorld.y*31.0));
float siteAge=siteNoise(vTownSiteWorld.xz*.32+vec2(vTownSiteWorld.y*.17));
float siteHeight=(siteGrain-.5)*${kind==='infield earth'?'.0008':'.0003'}*siteClose;
diffuseColor.rgb*=mix(.95,1.025,siteAge)*(1.0+(siteGrain-.5)*.13*siteClose);
${treatment}
`).replace('#include <normal_fragment_maps>',`
#include <normal_fragment_maps>
vec3 siteDx=dFdx(-vViewPosition),siteDy=dFdy(-vViewPosition),siteR1=cross(siteDy,normal),siteR2=cross(normal,siteDx);
float siteDet=dot(siteDx,siteR1);
if(abs(siteDet)>1e-10)normal=normalize(abs(siteDet)*normal-sign(siteDet)*(dFdx(siteHeight)*siteR1+dFdy(siteHeight)*siteR2));
`);
  };
  m.customProgramCacheKey=()=>`${key}|site-surface-v1:${kind}`;
  m.addEventListener('dispose',onDispose);m.needsUpdate=true;return true;
}

/** Restores only this finish's material state; no borrowed map is disposed. */
export function removeSiteArtMaterial(m:THREE.MeshStandardMaterial):void{
  const state=installed.get(m);if(!state)return;
  m.color.copy(state.color);m.roughness=state.roughness;m.metalness=state.metalness;m.envMapIntensity=state.envMapIntensity;m.onBeforeCompile=state.compile;m.customProgramCacheKey=state.key;m.removeEventListener('dispose',state.onDispose);installed.delete(m);m.needsUpdate=true;
}
