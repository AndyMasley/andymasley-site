import * as THREE from 'three';
import index from '../../../data/derived/town/environment-ground-index.json';
import {applyTerrainFinish, validTerrainFinishPacket, type TerrainFinishPacket, type TerrainFinishReport} from './terrain-finish';
import {terrainFinishAsset} from './terrain-finish';
import type {AssetRef,V3} from './contracts';
type V2=[number,number];
export type EnvironmentGroundPacket=TerrainFinishPacket & {sourceTerrainSha256:string|null;registrationBasis?:string;waterHeight:number;waterTriangles:V2[];grassExclusions:V2[][]};
export type EnvironmentGroundReport=TerrainFinishReport & {waterTriangles:number};
export function environmentGroundAsset(tileId:string,level=0):AssetRef|undefined{return(index.tiles as unknown as Record<string,{levels:Record<string,AssetRef>}>)[tileId]?.levels[String(level)];}
export function validEnvironmentGroundPacket(value:unknown,tileId:string):value is EnvironmentGroundPacket{
 if(!validTerrainFinishPacket(value,tileId))return false;const p=value as EnvironmentGroundPacket;
 return(p.sourceTerrainSha256===null||/^[a-f0-9]{64}$/.test(p.sourceTerrainSha256))&&Number.isFinite(p.waterHeight)&&p.waterHeight>0&&p.waterHeight<1000&&Array.isArray(p.waterTriangles)&&p.waterTriangles.length<3000&&p.waterTriangles.length%3===0&&p.waterTriangles.every(v=>Array.isArray(v)&&v.length===2&&v.every(Number.isFinite))&&Array.isArray(p.grassExclusions)&&p.grassExclusions.length<12&&p.grassExclusions.every(r=>Array.isArray(r)&&r.length>=3&&r.length<150&&r.every(v=>v.length===2&&v.every(Number.isFinite)));
}
/** A separate source-guarded transaction after road terrain conformance. */
export function applyEnvironmentGround(group:THREE.Object3D,tileId:string,origin:V3,level:number,packet?:EnvironmentGroundPacket):EnvironmentGroundReport|undefined{
 if(!packet)return; if(group.userData.environmentGround)return group.userData.environmentGround;
 const empty={meshes:0,replacedTriangles:0,addedTriangles:0,maximumDropM:0,collapsedTriangles:0,windingRepairs:0,normalRepairs:0,waterTriangles:0,rejected:true};
 if(!validEnvironmentGroundPacket(packet,tileId)||(terrainFinishAsset(tileId,level)?.sha256??null)!==packet.sourceTerrainSha256)return empty;
 let source:THREE.Mesh|undefined;group.traverse(o=>{if(o instanceof THREE.Mesh&&!o.userData.townCrafted&&(o.name==='water'||o.parent?.name==='water'))source??=o;});
 if(!source&&packet.waterTriangles.length)return empty;
 const report=applyTerrainFinish(group,tileId,origin,level,packet,'environmentGround');
 if(report.rejected)return{...report,waterTriangles:0};
 if(!packet.waterTriangles.length){const result={...report,waterTriangles:0};group.userData.environmentGround=result;group.userData.environmentGrassExclusions=[...(group.userData.environmentGrassExclusions??[]),...packet.grassExclusions];return result;}
 const geometry=new THREE.BufferGeometry(),positions:number[]=[],normals:number[]=[];
 for(const[x,n]of packet.waterTriangles){positions.push(x-origin[0],packet.waterHeight-origin[1],-n-origin[2]);normals.push(0,1,0);}
 geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));geometry.computeBoundingBox();geometry.computeBoundingSphere();
 // Own the new material; source materials, textures and lake geometry stay intact.
 const original=Array.isArray(source!.material)?source!.material[0]:source!.material,material=original.clone(),mesh=new THREE.Mesh(geometry,material);mesh.name='water_registered_environment_bank';mesh.userData.townCrafted=true;mesh.userData.category='water';mesh.userData.appearanceBasis=packet.registrationBasis??index.registration.basis;group.add(mesh);
 const result={...report,waterTriangles:positions.length/9};group.userData.environmentGround=result;
 group.userData.environmentGrassExclusions=[...(group.userData.environmentGrassExclusions??[]),...packet.grassExclusions];return result;
}
