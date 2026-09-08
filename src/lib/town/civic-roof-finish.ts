import * as THREE from 'three';
import data from '../../../data/derived/town/civic-roof-finish.json';
import {frontageMaterial} from './crafted-frontages';
export type CivicRoofReport={status:'applied'|'source-mismatch';triangles:number;removedTriangles?:number;boundaryFragments?:number;roofHeight?:number};
/** A photo-constrained flat roof. Only pinned source roof faces inside the school
 * footprint are replaced; outside fragments interpolate the exact source plane. */
export function applyCivicRoofFinish(group:THREE.Group,tileId:string,level:number,sha256:string):CivicRoofReport|undefined{
 if(tileId!==data.tileId)return;if(group.userData.civicRoofFinish)return group.userData.civicRoofFinish as CivicRoofReport;
 const row=data.lods.find(r=>r.level===level),reject=():CivicRoofReport=>({status:'source-mismatch',triangles:0});if(!row||row.sha256!==sha256)return reject();
 const matches:THREE.Mesh[]=[];group.traverse(o=>{if(o instanceof THREE.Mesh&&o.name===data.meshName&&o.parent?.name===data.parentName)matches.push(o);});const mesh=matches[0];
 if(matches.length!==1||!mesh||Array.isArray(mesh.material)||mesh.material.name!==data.sourceMaterial||mesh.geometry.groups.length)return reject();
 const old=mesh.geometry,p=old.getAttribute('position'),count=old.index?.count??p?.count;if(count!==row.totalTriangles*3||!p||!old.getAttribute('normal')||!old.getAttribute('uv'))return reject();
 // Preserve original arrays for any shared source reference. Build a new unindexed
 // surface from unchanged faces, then boundary fragments, then the flat cap.
 group.updateMatrixWorld(true);const inverse=mesh.matrixWorld.clone().invert();
 const output:Record<string,number[]>={};for(const name of Object.keys(old.attributes))output[name]=[];
 const removed=new Uint8Array(row.totalTriangles);for(const[a,b]of row.ranges)removed.fill(1,a,b+1);
 const index=(i:number)=>old.index?old.index.getX(i):i;
 const component=(a:THREE.BufferAttribute|THREE.InterleavedBufferAttribute,i:number,k:number)=>k===0?a.getX(i):k===1?a.getY(i):k===2?a.getZ(i):a.getW(i);
 const emit=(face:number,weights:readonly number[])=>{for(const[name,a]of Object.entries(old.attributes)){const values=output[name];for(let k=0;k<a.itemSize;k++){let value=0;for(let j=0;j<3;j++)value+=component(a,index(face*3+j),k)*weights[j];values.push(value);}if(name==='normal'){const offset=values.length-3,length=Math.hypot(values[offset],values[offset+1],values[offset+2]);if(length>0){values[offset]/=length;values[offset+1]/=length;values[offset+2]/=length;}}}};
 // Do not renormalize unchanged source normals: their exact bytes remain evidence.
 for(let face=0;face<row.totalTriangles;face++)if(!removed[face])for(let j=0;j<3;j++)for(const[name,a]of Object.entries(old.attributes))for(let k=0;k<a.itemSize;k++)output[name].push(component(a,index(face*3+j),k));
 for(const f of row.fragments)for(const w of f.weights)emit(f.face,w);
 const retainedCount=output.position.length/3,contour=data.polygon.map(([x,n])=>new THREE.Vector2(x,n)),triangles=THREE.ShapeUtils.triangulateShape(contour,[]);
 const localNormal=new THREE.Vector3(0,1,0).applyMatrix3(new THREE.Matrix3().getNormalMatrix(inverse)).normalize();
 for(const tri of triangles){const points=tri.map(i=>new THREE.Vector3(data.polygon[i][0]-data.origin[0],data.roofHeight-data.origin[1],-data.polygon[i][1]-data.origin[2]).applyMatrix4(inverse));
  const normal=points[1].clone().sub(points[0]).cross(points[2].clone().sub(points[0]));if(normal.dot(localNormal)<0){points.reverse();tri.reverse();}
  for(let j=0;j<3;j++){for(const[name,a]of Object.entries(old.attributes)){const values=output[name];if(name==='position')values.push(...points[j].toArray());else if(name==='normal')values.push(...localNormal.toArray());else if(name==='uv')values.push((data.polygon[tri[j]][0]-data.polygon[0][0])*.5,(data.polygon[tri[j]][1]-data.polygon[0][1])*.5);else for(let k=0;k<a.itemSize;k++)values.push(0);}}
 }
 const geometry=new THREE.BufferGeometry();for(const[name,a]of Object.entries(old.attributes))geometry.setAttribute(name,new THREE.Float32BufferAttribute(output[name],a.itemSize));
 geometry.addGroup(0,retainedCount,0);geometry.addGroup(retainedCount,triangles.length*3,1);geometry.computeBoundingBox();geometry.computeBoundingSphere();geometry.userData={...old.userData,civicSchoolRoofFinish:true};
 const finish=frontageMaterial('roof','#48514e');finish.name='Civic school | restrained dark flat roof';finish.userData.appearanceBasis=data.basis;finish.userData.structId=data.structId;
 mesh.geometry=geometry;mesh.material=[mesh.material,finish];let referenced=false;group.traverse(o=>{if(o instanceof THREE.Mesh&&o.geometry===old)referenced=true;});if(!referenced)old.dispose();
 const report:CivicRoofReport={status:'applied',triangles:triangles.length,removedTriangles:row.triangles,boundaryFragments:row.fragments.length,roofHeight:data.roofHeight};group.userData.civicRoofFinish=report;return report;
}
