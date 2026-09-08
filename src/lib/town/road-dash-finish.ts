import * as THREE from 'three';
import index from '../../../data/derived/town/road-dash-index.json';
import type { AssetRef, V3 } from './contracts';
import { terrainGeometryStamp } from './terrain-finish';

type Guard={name:string;parent:'roads';geometryStamp:string};
export type RoadDashPacket={version:1;tileId:string;level:number;sourceSha256:string;sourceManifestSha256:string;guards:Guard[];targets:(Guard&{remove:number[]})[];positions:number[][];material:string;edgeIds:number[];evidence:string};
export type RoadDashReport={applied:boolean;rejected:boolean;removedTriangles:number;addedTriangles:number;geometryBytes:number;tinyPaintTriangles:number};
export function roadDashAsset(tileId:string,level=0):AssetRef|undefined{return(index.tiles as Record<string,{levels:Record<string,AssetRef>}>)[tileId]?.levels[String(level)];}
export function validRoadDashPacket(value:unknown,tileId:string,level:number):value is RoadDashPacket{
 const p=value as RoadDashPacket|undefined,guard=(g:Guard)=>g&&typeof g.name==='string'&&g.parent==='roads'&&/^[a-f0-9]{8}$/.test(g.geometryStamp);
 const bounds=tileId.split('_').map(Number);
 return !!roadDashAsset(tileId,level)&&!!p&&p.version===1&&p.tileId===tileId&&p.level===level&&p.sourceManifestSha256===index.sourceManifestSha256&&/^[a-f0-9]{64}$/.test(p.sourceSha256)&&p.material==='Drive road | chalk white paint'&&Array.isArray(p.guards)&&p.guards.length>0&&p.guards.length<12&&p.guards.every(guard)&&new Set(p.guards.map(g=>g.name)).size===p.guards.length&&Array.isArray(p.targets)&&p.targets.length<8&&new Set(p.targets.map(g=>g.name)).size===p.targets.length&&p.targets.every(g=>guard(g)&&p.guards.some(r=>r.name===g.name&&r.geometryStamp===g.geometryStamp)&&Array.isArray(g.remove)&&g.remove.length<10000&&g.remove.every(n=>Number.isInteger(n)&&n>=0)&&new Set(g.remove).size===g.remove.length)&&Array.isArray(p.positions)&&p.positions.length>0&&p.positions.length<20000&&p.positions.length%3===0&&p.positions.every(v=>Array.isArray(v)&&v.length===3&&v.every(Number.isFinite)&&v[0]>=bounds[0]*250-15&&v[0]<=(bounds[0]+1)*250+15&&v[1]>=bounds[1]*250-15&&v[1]<=(bounds[1]+1)*250+15&&v[2]>-100&&v[2]<1000)&&Array.isArray(p.edgeIds)&&p.edgeIds.every(id=>index.chains.some(c=>c.edges.includes(id)));
}
/** Rephase only source center dashes; preserve every other source attribute and
 * material. All prerequisite road meshes must match before any replacement. */
export function applyRoadDashFinish(group:THREE.Group,tileId:string,origin:V3,level:number,sourceSha256:string,packet?:RoadDashPacket):RoadDashReport{
 const previous=group.userData.roadDashFinish as RoadDashReport|undefined;if(previous)return previous;
 const empty:RoadDashReport={applied:false,rejected:false,removedTriangles:0,addedTriangles:0,geometryBytes:0,tinyPaintTriangles:0};if(!packet)return empty;
 if(!validRoadDashPacket(packet,tileId,level)||packet.sourceSha256!==sourceSha256)return{...empty,rejected:true};
 const meshes:THREE.Mesh[]=[],materials=new Map<string,THREE.Material>();group.traverse(o=>{if(o instanceof THREE.Mesh){meshes.push(o);for(const m of Array.isArray(o.material)?o.material:[o.material])materials.set(m.name,m);}});
 const match=(g:Guard)=>meshes.filter(m=>m.name===g.name&&m.parent?.name===g.parent&&terrainGeometryStamp(m.geometry)===g.geometryStamp);
 if(packet.guards.some(g=>match(g).length!==1)||packet.targets.some(g=>match(g).length!==1)||!materials.has(packet.material))return{...empty,rejected:true};
 const replacements:{mesh:THREE.Mesh;geometry:THREE.BufferGeometry}[]=[],report={...empty},geometry=new THREE.BufferGeometry();
 try{
  for(const target of packet.targets){const mesh=match(target)[0],old=mesh.geometry,total=old.index?.count??old.getAttribute('position').count;if(total%3||old.drawRange.start!==0||old.drawRange.count!==Infinity||target.remove.some(n=>n*3+2>=total))throw Error('Unexpected source paint range');const next=new THREE.BufferGeometry(),ids:number[]=[],remove=new Set(target.remove);
   for(const[name,a]of Object.entries(old.attributes))next.setAttribute(name,a);
   for(const r of old.groups.length?old.groups:[{start:0,count:total,materialIndex:0}]){const start=ids.length;for(let i=r.start;i+2<Math.min(total,r.start+r.count);i+=3)if(!remove.has(i/3))ids.push(old.index?.getX(i)??i,old.index?.getX(i+1)??i+1,old.index?.getX(i+2)??i+2);if(ids.length>start)next.addGroup(start,ids.length-start,r.materialIndex??0);}
   next.setIndex(old.getAttribute('position').count>65535?new THREE.Uint32BufferAttribute(ids,1):new THREE.Uint16BufferAttribute(ids,1));next.boundingBox=old.boundingBox?.clone()??null;next.boundingSphere=old.boundingSphere?.clone()??null;next.userData={...old.userData};replacements.push({mesh,geometry:next});report.removedTriangles+=remove.size;report.geometryBytes+=next.index!.array.byteLength;
  }
  const p:number[]=[];for(let i=0;i<packet.positions.length;i+=3){const face=packet.positions.slice(i,i+3).map(v=>new THREE.Vector3(Math.fround(v[0]-origin[0]),Math.fround(v[2]-origin[1]),Math.fround(-v[1]-origin[2]))),normal=face[1].clone().sub(face[0]).cross(face[2].clone().sub(face[0])),longest=Math.max(...face.map((a,k)=>Math.hypot(a.x-face[(k+1)%3].x,a.z-face[(k+1)%3].z)));if(Math.abs(normal.y)<1e-9||Math.abs(normal.y)/longest<.00003){report.tinyPaintTriangles++;continue;}for(const k of normal.y>0?[0,1,2]:[0,2,1])p.push(...face[k].toArray());}
  if(!p.length)throw Error('No stable paint');geometry.setAttribute('position',new THREE.Float32BufferAttribute(p,3));geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();report.addedTriangles=p.length/9;report.geometryBytes+=p.length*8;
 }catch{for(const r of replacements)r.geometry.dispose();geometry.dispose();return{...empty,rejected:true};}
 const retired=new Set<THREE.BufferGeometry>();for(const r of replacements){retired.add(r.mesh.geometry);r.mesh.geometry=r.geometry;}const mesh=new THREE.Mesh(geometry,materials.get(packet.material));mesh.name='finished_continuous_center_dashes';mesh.receiveShadow=true;mesh.userData.roadDashFinish=true;mesh.userData.appearanceBasis=packet.evidence;group.add(mesh);
 group.traverse(o=>{if(o instanceof THREE.Mesh)retired.delete(o.geometry);});retired.forEach(g=>g.dispose());report.applied=true;group.userData.roadDashFinish=report;return report;
}
