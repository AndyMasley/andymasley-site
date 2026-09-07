import * as THREE from 'three';
import catalog from '../../../data/derived/town/road-materials-index.json';
import type {AssetRef}from'./contracts';
import {applyArtMaterial}from'./art-materials';
import {applyInventoryRoadAppearance}from'./road-inventory-material';
import {removeUnpavedRoadPaint}from'./road-unpaved-paint';
type SurfaceType=1|2|5;
type MeshAssignment={name:string;parent?:string;geometryStamp:string;assignments:[number,SurfaceType][]};
export type RoadMaterialPacket={version:1;tileId:string;level:number;sourceManifestSha256:string;sourceSha256:string;meshes:MeshAssignment[]};
export type RoadMaterialReport={triangles:number;meshes:number;rejectedMeshes:number;materialVariants:number;indexBytes:number;byType:Record<number,number>;paint?:ReturnType<typeof removeUnpavedRoadPaint>};
export const ROAD_MATERIAL_EVIDENCE=catalog.evidence;
export function roadMaterialAsset(tileId:string,level=0):AssetRef|undefined{return(catalog.tiles as Record<string,{levels:Record<string,AssetRef>}>)[tileId]?.levels[String(level)];}
export function validRoadMaterialPacket(value:unknown,tileId:string,level:number):value is RoadMaterialPacket{
 const p=value as RoadMaterialPacket|undefined;if(!p||p.version!==1||p.tileId!==tileId||p.level!==level||p.sourceManifestSha256!==catalog.sourceManifestSha256||!/^[a-f0-9]{64}$/.test(p.sourceSha256)||!Array.isArray(p.meshes)||p.meshes.length>100)return false;
 return p.meshes.every(m=>typeof m.name==='string'&&(m.parent===undefined||typeof m.parent==='string')&&/^[a-f0-9]{8}$/.test(m.geometryStamp)&&Array.isArray(m.assignments)&&m.assignments.length>0&&m.assignments.length<100000&&m.assignments.every(a=>Array.isArray(a))&&new Set(m.assignments.map(a=>a[0])).size===m.assignments.length&&m.assignments.every(a=>Array.isArray(a)&&a.length===2&&Number.isInteger(a[0])&&a[0]>=0&&[1,2,5].includes(a[1])));
}
function stamp(g:THREE.BufferGeometry):string{let h=2166136261;for(const a of[g.getAttribute('position'),g.index])if(a){const bytes=new Uint8Array(a.array.buffer,a.array.byteOffset,a.array.byteLength);for(const value of bytes)h=Math.imul(h^value,16777619)>>>0;}return h.toString(16).padStart(8,'0');}
const finish:Record<SurfaceType,{name:string;color:number[];roughness:number}>={
 1:{name:'earth',color:[1.62,1.37,1.11],roughness:1},
 2:{name:'gravel',color:[1.47,1.39,1.21],roughness:1},
 5:{name:'surface-treated',color:[1.15,1.15,1.10],roughness:.98},
};
/** Per-triangle material grouping only. All vertex attributes, triangle winding,
 * road elevations and spatial coverage are retained exactly. Call after all
 * pavement/paint geometry transactions and before shared material pooling. */
export function applyRoadMaterialFinish(group:THREE.Group,tileId:string,_origin:readonly number[],level:number,sourceSha256:string,packet?:RoadMaterialPacket):RoadMaterialReport|undefined{
 if(!packet)return;const previous=group.userData.roadMaterialFinish as RoadMaterialReport|undefined;if(previous)return previous;
 const report:RoadMaterialReport={triangles:0,meshes:0,rejectedMeshes:0,materialVariants:0,indexBytes:0,byType:{}};
 if(!validRoadMaterialPacket(packet,tileId,level)||packet.sourceSha256!==sourceSha256){report.rejectedMeshes=packet.meshes?.length??1;return report;}
 const retired=new Set<THREE.BufferGeometry>(),retiredMaterials=new Set<THREE.Material>(),variants=new Map<THREE.Material,Map<number,THREE.MeshStandardMaterial>>();
 for(const record of packet.meshes){const candidates:THREE.Mesh[]=[];group.traverse(o=>{if(o instanceof THREE.Mesh&&o.name===record.name&&(record.parent===undefined||o.parent?.name===record.parent)&&!o.userData.townCrafted)candidates.push(o);});const mesh=candidates.find(o=>stamp(o.geometry)===record.geometryStamp);if(!mesh){report.rejectedMeshes++;continue;}
  const old=mesh.geometry,position=old.getAttribute('position'),index=old.index,total=index?.count??position.count,materials=Array.isArray(mesh.material)?mesh.material:[mesh.material],parts=old.groups.length?old.groups:[{start:0,count:total,materialIndex:0}],assignments=new Map(record.assignments);
  const sourceMaterial=(i:number)=>parts.find(p=>i>=p.start&&i<p.start+p.count)?.materialIndex??-1;
  if(record.assignments.some(([triangle])=>triangle*3+2>=total||(materials[sourceMaterial(triangle*3)]?.name!=='Drive road | asphalt'||!(materials[sourceMaterial(triangle*3)]instanceof THREE.MeshStandardMaterial)))||total%3!==0||Array.from({length:total/3},(_,i)=>i*3).some(i=>!materials[sourceMaterial(i)])||old.drawRange.start!==0||old.drawRange.count!==Infinity){report.rejectedMeshes++;continue;}
  const buckets=new Map<THREE.Material,number[]>();for(let i=0;i+2<total;i+=3){let material=materials[sourceMaterial(i)];if(!material)continue;const code=assignments.get(i/3);
   if(code){if(!(material instanceof THREE.MeshStandardMaterial)){report.rejectedMeshes++;continue;}let map=variants.get(material);if(!map){map=new Map();variants.set(material,map);}let clone=map.get(code);if(!clone){const spec=finish[code];clone=material.clone();applyArtMaterial(clone);applyInventoryRoadAppearance(clone,code);clone.name=`Drive road | asphalt | ${spec.name} inventory surface`;clone.color.multiply(new THREE.Color().setRGB(...spec.color as [number,number,number]));clone.roughness=spec.roughness;clone.userData={...clone.userData,townRoadSurfaceType:code,appearanceBasis:catalog.evidence.policy};map.set(code,clone);report.materialVariants++;}material=clone;report.triangles++;report.byType[code]=(report.byType[code]??0)+1;}
   const bucket=buckets.get(material)??[];bucket.push(index?index.getX(i):i,index?index.getX(i+1):i+1,index?index.getX(i+2):i+2);buckets.set(material,bucket);
  }
  const geometry=new THREE.BufferGeometry();for(const[name,a]of Object.entries(old.attributes))geometry.setAttribute(name,a);geometry.morphAttributes=old.morphAttributes;geometry.morphTargetsRelative=old.morphTargetsRelative;geometry.boundingBox=old.boundingBox?.clone()??null;geometry.boundingSphere=old.boundingSphere?.clone()??null;geometry.userData={...old.userData};const indices:number[]=[],next:THREE.Material[]=[];for(const[material,bucket]of buckets){geometry.addGroup(indices.length,bucket.length,next.length);for(const value of bucket)indices.push(value);next.push(material);}geometry.setIndex(position.count>65535?new THREE.Uint32BufferAttribute(indices,1):new THREE.Uint16BufferAttribute(indices,1));mesh.geometry=geometry;mesh.material=next.length===1?next[0]:next;retired.add(old);materials.forEach(m=>retiredMaterials.add(m));report.meshes++;report.indexBytes+=geometry.index!.array.byteLength;
 }
 // No original shared resource is disposed while another source mesh uses it.
 group.traverse(o=>{if(o instanceof THREE.Mesh){retired.delete(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])retiredMaterials.delete(m);}});retired.forEach(g=>g.dispose());retiredMaterials.forEach(m=>m.dispose());
 report.paint=removeUnpavedRoadPaint(group);
 group.userData.roadMaterialFinish=report;return report;
}
