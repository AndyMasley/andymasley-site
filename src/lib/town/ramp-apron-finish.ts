import * as THREE from 'three';
import data from '../../../data/derived/town/ramp-apron.json';
import type {V3} from './contracts';
import {terrainGeometryStamp} from './terrain-finish';

export type RampApronReport={applied:boolean;rejected:boolean;triangles:number;geometryBytes:number};
/** One small road-ribbon gap, sharing its source pavement material and texture.
 * Apply before exterior-shoulder clipping. No source buffers are modified. */
export function applyRampApronFinish(group:THREE.Group,tileId:string,origin:V3,level:number,sourceSha256:string):RampApronReport{
 const previous=group.userData.rampApronFinish as RampApronReport|undefined;if(previous)return previous;
 const empty:RampApronReport={applied:false,rejected:false,triangles:0,geometryBytes:0};if(tileId!==data.tileId)return empty;
 const row=data.levels.find(r=>r.level===level);if(!row||row.sourceSha256!==sourceSha256||origin.some((n,i)=>n!==data.origin[i]))return{...empty,rejected:true};
 const meshes:THREE.Mesh[]=[];group.traverse(o=>{if(o instanceof THREE.Mesh)meshes.push(o);});
 const matches=row.guards.map(g=>meshes.filter(m=>m.name===g.name&&m.parent?.name===g.parent&&terrainGeometryStamp(m.geometry)===g.geometryStamp));if(matches.some(a=>a.length!==1))return{...empty,rejected:true};
 const material=matches.flat().flatMap(m=>Array.isArray(m.material)?m.material:[m.material]).find(m=>m.name===data.material);if(!material)return{...empty,rejected:true};
 const positions:number[]=[],uv:number[]=[];
 for(let i=0;i<row.positions.length;i+=3){const p=row.positions.slice(i,i+3).map(v=>new THREE.Vector3(Math.fround(v[0]-origin[0]),Math.fround(v[2]-origin[1]),Math.fround(-v[1]-origin[2]))),normal=p[1].clone().sub(p[0]).cross(p[2].clone().sub(p[0]));if(!Number.isFinite(normal.lengthSq())||Math.abs(normal.y)<1e-9)return{...empty,rejected:true};for(const k of normal.y>0?[0,1,2]:[0,2,1]){positions.push(...p[k].toArray());if(row.uv)uv.push(...row.uv[i+k]);}}
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));if(uv.length)geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();
 const mesh=new THREE.Mesh(geometry,material);mesh.name='finished_ramp_2431_135_apron';mesh.receiveShadow=true;mesh.userData.appearanceBasis=data.evidence;group.add(mesh);group.userData.environmentGrassExclusions=[...(group.userData.environmentGrassExclusions??[]),data.outline];
 const report={applied:true,rejected:false,triangles:positions.length/9,geometryBytes:(positions.length*2+uv.length)*4};group.userData.rampApronFinish=report;return report;
}
