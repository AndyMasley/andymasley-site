import * as THREE from 'three';
import data from '../../../data/derived/town/dock-approaches.json';
import {Batch,type Frame}from'./crafted-frontages';
import{terrainGeometryStamp}from'./terrain-finish';
import type{V3}from'./contracts';
export type DockApproachReport={applied:boolean;rejected:boolean;ids:string[];triangles:number;geometryBytes:number};
export const DOCK_APPROACH_PROVENANCE=data;
function member(batch:Batch,frame:Frame,a:number[],b:number[],radius:number,color:string){const start=new THREE.Vector3(...a),end=new THREE.Vector3(...b),direction=end.clone().sub(start);if(direction.lengthSq()<1e-9)return;const geometry=new THREE.CylinderGeometry(radius,radius,direction.length(),batch.level===2?4:6);geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),direction.normalize()));geometry.translate(...start.add(end).multiplyScalar(.5).toArray()as V3);const flat=geometry.toNonIndexed();batch.geometry(frame,'metal',flat.getAttribute('position').array,flat.getAttribute('normal').array,color);flat.dispose();geometry.dispose();}
/** Restore only mapped on-land pier segments, which the old water-only gate
 * omitted. All source terrain and previously rendered dock buffers survive. */
export function applyDockApproaches(group:THREE.Group,tileId:string,origin:V3,level:number,sourceSha256:string):DockApproachReport{
 const old=group.userData.dockApproaches as DockApproachReport|undefined;if(old)return old;
 const empty:DockApproachReport={applied:false,rejected:false,ids:[],triangles:0,geometryBytes:0};const tile=(data.tiles as Record<string,typeof data.tiles['2_-3']>)[tileId];if(!tile)return empty;
 const lod=tile.levels.find(r=>r.level===level);if(!lod||lod.sourceSha256!==sourceSha256||origin.some((n,i)=>n!==tile.origin[i]))return{...empty,rejected:true};
 const meshes:THREE.Mesh[]=[];group.traverse(o=>{if(o instanceof THREE.Mesh)meshes.push(o);});if(lod.guards.some(g=>meshes.filter(m=>m.name===g.name&&terrainGeometryStamp(m.geometry)===g.geometryStamp).length!==1))return{...empty,rejected:true};
 const batch=new Batch(new THREE.Vector3(...origin),level),ids:string[]=[];
 for(const row of data.objects.filter(r=>r.tileId===tileId)){
  const frame:Frame={start:row.start,tangent:row.tangent,outward:row.outward,structId:row.id,tileId},height=(u:number)=>row.waterHeight+(row.shoreHeight-row.waterHeight)*u/row.length;
  const outline=row.outline.map(([x,n])=>[(x-row.start[0])*row.tangent[0]+(n-row.start[1])*row.tangent[1],(x-row.start[0])*row.outward[0]+(n-row.start[1])*row.outward[1]]);
  const top=outline.map(([u,v])=>[u,height(u),v]),bottom=outline.map(([u,v])=>[u,height(u)-.30,v]);
  const oriented=(points:number[][],direction:THREE.Vector3)=>{const a=new THREE.Vector3(...points[0]),normal=new THREE.Vector3(...points[1]).sub(a).cross(new THREE.Vector3(...points[2]).sub(a));return normal.dot(direction)>0?points:[...points].reverse();};
  const center=outline.reduce((sum,p)=>[sum[0]+p[0]/outline.length,sum[1]+p[1]/outline.length],[0,0]);
  const faces=THREE.ShapeUtils.triangulateShape(outline.map(p=>new THREE.Vector2(...p)),[]);
  for(const face of faces){batch.polygon(frame,'door',oriented(face.map(i=>top[i]),new THREE.Vector3(0,1,0)),'#c4bdab');batch.polygon(frame,'metal',oriented(face.map(i=>bottom[i]),new THREE.Vector3(0,-1,0)),'#8c9793');}
  for(let i=0;i<outline.length;i++){const j=(i+1)%outline.length,direction=new THREE.Vector3((outline[i][0]+outline[j][0])/2-center[0],0,(outline[i][1]+outline[j][1])/2-center[1]);batch.polygon(frame,'metal',oriented([top[i],bottom[i],bottom[j],top[j]],direction),'#9ca5a0');}
  const[tx,ty]=tileId.split('_').map(Number),owns=(u:number,v:number)=>{const x=row.start[0]+row.tangent[0]*u+row.outward[0]*v,n=row.start[1]+row.tangent[1]*u+row.outward[1]*v;return x>=tx*250&&x<(tx+1)*250&&n>=ty*250&&n<(ty+1)*250;};
  // Exact segment clipping to each source tile; post phase follows the complete
  // mapped approach so ownership does not restart the construction rhythm.
  for(const v of[-.75,.75]){
   let lo=0,hi=row.length;
   for(const[axis,min,max]of[[0,tx*250,(tx+1)*250],[1,ty*250,(ty+1)*250]]){const start=row.start[axis]+row.outward[axis]*v,d=row.tangent[axis];if(Math.abs(d)<1e-8){if(start<min||start>max)hi=-1;continue;}const a=(min-start)/d,b=(max-start)/d;lo=Math.max(lo,Math.min(a,b));hi=Math.min(hi,Math.max(a,b));}
   if(hi<=lo)continue;
   for(const h of[.09,1.02])member(batch,frame,[lo,height(lo)+h,v],[hi,height(hi)+h,v],.032,'#c5ccc5');
   const posts=[0,...Array.from({length:Math.ceil(row.length/1.6)-1},(_,i)=>(i+1)*1.6),row.length];
   for(const u of posts)if(owns(u,v))member(batch,frame,[u,height(u)+.03,v],[u,height(u)+1.06,v],.03,'#c5ccc5');
   if(level<2)for(let i=0;i<posts.length-1;i++){const start=posts[i],end=posts[i+1],a=Math.max(lo,start),b=Math.min(hi,end);if(b-a<.02)continue;const h=(u:number)=>.10+.9*(i%2?1-(u-start)/(end-start):(u-start)/(end-start));member(batch,frame,[a,height(a)+h(a),v],[b,height(b)+h(b),v],.022,'#b6c0b9');}
  }
  ids.push(row.id);
 }
 const built=batch.finish();built.group.name='Mapped dock shore approaches';built.group.userData.appearanceBasis=data.basis;group.add(built.group);const outlines=data.objects.filter(r=>r.tileId===tileId).map(r=>r.outline);group.userData.environmentGrassExclusions=[...(group.userData.environmentGrassExclusions??[]),...outlines];group.userData.environmentTreeExclusions=[...(group.userData.environmentTreeExclusions??[]),...outlines];
 const report={applied:true,rejected:false,ids,triangles:built.triangles,geometryBytes:built.bytes};group.userData.dockApproaches=report;return report;
}
