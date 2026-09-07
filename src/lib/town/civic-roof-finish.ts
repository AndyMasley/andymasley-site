import * as THREE from 'three';
import data from '../../../data/derived/town/civic-roof-finish.json';
import {frontageMaterial} from './crafted-frontages';
export type CivicRoofReport={status:'applied'|'source-mismatch';triangles:number};
/** A scoped roof finish, not a height repair: preserve every source vertex and
 * UV while suppressing white aerial smears on the photographed flat school roof. */
export function applyCivicRoofFinish(group:THREE.Group,tileId:string,level:number,sha256:string):CivicRoofReport|undefined{
 if(tileId!==data.tileId)return;if(group.userData.civicRoofFinish)return group.userData.civicRoofFinish as CivicRoofReport;
 const row=data.lods.find(r=>r.level===level),reject=():CivicRoofReport=>({status:'source-mismatch',triangles:0});if(!row||row.sha256!==sha256)return reject();
 const matches:THREE.Mesh[]=[];group.traverse(o=>{if(o instanceof THREE.Mesh&&o.name===data.meshName&&o.parent?.name===data.parentName)matches.push(o);});const mesh=matches[0];
 if(matches.length!==1||!mesh||Array.isArray(mesh.material)||mesh.material.name!==data.sourceMaterial||mesh.geometry.groups.length)return reject();
 const old=mesh.geometry,count=old.index?.count??old.getAttribute('position')?.count;if(count!==row.totalTriangles*3)return reject();
 const finish=frontageMaterial('roof','#48514e');finish.name='Civic school | restrained dark flat roof';finish.userData.appearanceBasis=data.basis;finish.userData.structId=data.structId;
 const geometry=new THREE.BufferGeometry();geometry.setIndex(old.index);for(const[name,a]of Object.entries(old.attributes))geometry.setAttribute(name,a);geometry.boundingBox=old.boundingBox?.clone()??null;geometry.boundingSphere=old.boundingSphere?.clone()??null;geometry.userData={...old.userData,civicSchoolRoofFinish:true};
 let offset=0;for(const[first,last]of row.ranges){const start=first*3,end=(last+1)*3;if(start>offset)geometry.addGroup(offset,start-offset,0);geometry.addGroup(start,end-start,1);offset=end;}if(offset<count)geometry.addGroup(offset,count-offset,0);
 mesh.geometry=geometry;mesh.material=[mesh.material,finish];let referenced=false;group.traverse(o=>{if(o instanceof THREE.Mesh&&o.geometry===old)referenced=true;});if(!referenced)old.dispose();
 const report:CivicRoofReport={status:'applied',triangles:row.triangles};group.userData.civicRoofFinish=report;return report;
}
