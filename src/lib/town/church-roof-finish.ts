import * as THREE from 'three';
import data from '../../../data/derived/town/church-roof-finish.json';
type MeshSpec={kind:string;name:string;parent:string;material:string;vertices:number;triangles:number;selected?:number[];flip?:number[];drop?:number[]};
const skins=data.skinTiles as Record<string,{origin:number[];lods:{level:number;sha256:string;meshes:MeshSpec[]}[]}>;
export type ChurchRoofReport={status:'applied'|'source-mismatch';wallVertices:number;removedTriangles:number;flippedRoofTriangles:number;droppedRoofTriangles:number};
/** Fix the sanctuary's source attic wedges beneath an already authored hip.
 * No new material or texture and no change to the steeple or authored facade. */
export function applyChurchRoofFinish(group:THREE.Group,tileId:string,level:number,sha256:string):ChurchRoofReport|undefined{
 if(tileId!==data.tileId&&!skins[tileId])return;const prior=group.userData.churchRoofFinish as ChurchRoofReport|undefined;if(prior)return prior;
 const row=tileId===data.tileId?data.lods.find(r=>r.level===level):undefined,skin=skins[tileId]?.lods.find(r=>r.level===level),reject=():ChurchRoofReport=>({status:'source-mismatch',wallVertices:0,removedTriangles:0,flippedRoofTriangles:0,droppedRoofTriangles:0});if((tileId===data.tileId&&!row)||!skin||skin.sha256!==sha256||(row&&row.sha256!==sha256))return reject();
 const selected:Array<{mesh:THREE.Mesh,row:MeshSpec}>=[];
 for(const spec of [...(row?.meshes??[]),...skin.meshes]){const matches:THREE.Mesh[]=[];group.traverse(o=>{if(o instanceof THREE.Mesh&&o.name===spec.name&&o.parent?.name===spec.parent)matches.push(o);});const mesh=matches[0];if(matches.length!==1||Array.isArray(mesh.material)||mesh.material.name!==spec.material||mesh.geometry.groups.length||mesh.geometry.getAttribute('position')?.count!==spec.vertices||(mesh.geometry.index?.count??spec.vertices)!==spec.triangles*3)return reject();selected.push({mesh,row:spec});}
 group.updateMatrixWorld(true);let wallVertices=0,removedTriangles=0,flippedRoofTriangles=0,droppedRoofTriangles=0;
 for(const{mesh,row:spec}of selected){const old=mesh.geometry;let g=old.clone();if(spec.kind==='walls'){
  if(g.index){const expanded=g.toNonIndexed();g.dispose();g=expanded;}const p=g.getAttribute('position'),n=g.getAttribute('normal'),pins=new Set(spec.selected??[]),inverse=mesh.matrixWorld.clone().invert(),v=new THREE.Vector3();
  for(let face=0;face<spec.triangles;face++){let changed=false;for(let j=0;j<3;j++){const i=face*3+j,source=old.index?old.index.getX(i):i;if(!pins.has(source))continue;v.fromBufferAttribute(p,i).applyMatrix4(mesh.matrixWorld);v.y=data.wallTop-data.origin[1];v.applyMatrix4(inverse);p.setXYZ(i,v.x,v.y,v.z);changed=true;}
   if(changed){const points=[0,1,2].map(j=>new THREE.Vector3().fromBufferAttribute(p,face*3+j)),normal=points[1].clone().sub(points[0]).cross(points[2].clone().sub(points[0])).normalize();for(let j=0;j<3;j++)n.setXYZ(face*3+j,normal.x,normal.y,normal.z);}
  }wallVertices+=pins.size;p.needsUpdate=true;n.needsUpdate=true;
 }else if(spec.kind==='skin'){
  g.dispose();g=new THREE.BufferGeometry();const flip=new Set(spec.flip),drop=new Set(spec.drop);for(const[name,a]of Object.entries(old.attributes)){const values:number[]=[];for(let face=0;face<spec.triangles;face++){if(drop.has(face))continue;for(const j of flip.has(face)?[0,2,1]:[0,1,2]){const k=old.index?old.index.getX(face*3+j):face*3+j;for(let c=0;c<a.itemSize;c++)values.push((c===0?a.getX(k):c===1?a.getY(k):c===2?a.getZ(k):a.getW(k))*(name==='normal'&&flip.has(face)?-1:1));}}g.setAttribute(name,new THREE.BufferAttribute(new Float32Array(values),a.itemSize,a.normalized));}flippedRoofTriangles+=flip.size;droppedRoofTriangles+=drop.size;
 }else{const removed=new Set(spec.selected??[]),indices:number[]=[];for(let face=0;face<spec.triangles;face++)if(!removed.has(face))for(let j=0;j<3;j++)indices.push(old.index?old.index.getX(face*3+j):face*3+j);g.setIndex(indices);removedTriangles+=removed.size;}
  g.computeBoundingBox();g.computeBoundingSphere();mesh.geometry=g;let used=false;group.traverse(o=>{if(o instanceof THREE.Mesh&&o.geometry===old)used=true;});if(!used)old.dispose();
 }
 const report:ChurchRoofReport={status:'applied',wallVertices,removedTriangles,flippedRoofTriangles,droppedRoofTriangles};group.userData.churchRoofFinish=report;return report;
}
