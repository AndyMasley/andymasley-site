import * as THREE from 'three';
import catalog from '../../../data/derived/town/camp-structures.json';
import {Batch,type Frame} from './crafted-frontages';
import {filterEvidenceSources} from './evidence-buildings';
type Row=typeof catalog.rows[number];
export const CAMP_STRUCTURES=catalog;
export type CampReport={status:'applied'|'source-mismatch'|'no-support';ids:string[];removedTriangles:number;triangles:number;meshes:number;geometryBytes:number;placements:{id:string;floor:number;base:number;peak:number;sourcePeak:number}[]};
function terrainSampler(group:THREE.Object3D,origin:THREE.Vector3,rows:Row[]){
 const triangles:number[][][]=[];group.updateMatrixWorld(true);const point=new THREE.Vector3();
 const minX=Math.min(...rows.flatMap(r=>r.outline.map(p=>p[0])))-1,maxX=Math.max(...rows.flatMap(r=>r.outline.map(p=>p[0])))+1,minN=Math.min(...rows.flatMap(r=>r.outline.map(p=>p[1])))-1,maxN=Math.max(...rows.flatMap(r=>r.outline.map(p=>p[1])))+1;
 group.traverse(o=>{if(!(o instanceof THREE.Mesh))return;const p=o.geometry.getAttribute('position'),ix=o.geometry.index;if(!p)return;const count=ix?.count??p.count,mats=Array.isArray(o.material)?o.material:[o.material];for(const part of o.geometry.groups.length?o.geometry.groups:[{start:0,count,materialIndex:0}]){if(!/^Realism aerial.*\| ground_/.test(mats[part.materialIndex??0]?.name??''))continue;for(let i=part.start;i<Math.min(count,part.start+part.count);i+=3){const t=[0,1,2].map(k=>{point.fromBufferAttribute(p,ix?ix.getX(i+k):i+k).applyMatrix4(o.matrixWorld).add(origin);return[point.x,point.y,-point.z];});if(Math.max(...t.map(p=>p[0]))<minX||Math.min(...t.map(p=>p[0]))>maxX||Math.max(...t.map(p=>p[2]))<minN||Math.min(...t.map(p=>p[2]))>maxN)continue;triangles.push(t);}}});
 return (x:number,north:number):number|undefined=>{for(const t of triangles){const[a,b,c]=t,d=(b[2]-c[2])*(a[0]-c[0])+(c[0]-b[0])*(a[2]-c[2]);if(Math.abs(d)<1e-9)continue;const u=((b[2]-c[2])*(x-c[0])+(c[0]-b[0])*(north-c[2]))/d,v=((c[2]-a[2])*(x-c[0])+(a[0]-c[0])*(north-c[2]))/d;if(u>=-1e-7&&v>=-1e-7&&u+v<=1+1e-7)return u*a[1]+v*b[1]+(1-u-v)*c[1];}return undefined;};
}
function horizontal(b:Batch,r:Row,ring:number[][],height:(p:number[])=>number,role:'roof'|'foundation',up:boolean){
 ring=ring.filter((p,i)=>{const a=ring[(i+ring.length-1)%ring.length],b=ring[(i+1)%ring.length];return Math.abs((p[0]-a[0])*(b[1]-a[1])-(p[1]-a[1])*(b[0]-a[0]))>1e-5;});
 if(ring.length<3)return;const f:Frame={structId:r.id,tileId:r.tileId,start:[0,0],tangent:[1,0],outward:[0,1]},xy=ring.map(p=>new THREE.Vector2(p[0],p[1]));
 for(const ids of THREE.ShapeUtils.triangulateShape(xy,[])){const p=ids.map(i=>[ring[i][0],height(ring[i]),ring[i][1]]);const a=new THREE.Vector3().fromArray(p[0]),cross=new THREE.Vector3().fromArray(p[1]).sub(a).cross(new THREE.Vector3().fromArray(p[2]).sub(a));if((cross.y>0)!==up)p.reverse();b.polygon(f,role,p,role==='roof'?'#b6beb7':'#777b70');}
}
function roofHalf(r:Row,sign:number){let points=r.outline.map(p=>[...p]);const across=(p:number[])=>(p[0]-r.center[0])*r.roofAcross[0]+(p[1]-r.center[1])*r.roofAcross[1];const result:number[][]=[];for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length],da=across(a)*sign,db=across(b)*sign;if(da>=-1e-9)result.push(a);if((da<0)!==(db<0)){const t=da/(da-db);result.push(a.map((v,j)=>v+(b[j]-v)*t));}}return result.filter((p,i)=>{const q=result[(i+1)%result.length];return Math.hypot(p[0]-q[0],p[1]-q[1])>1e-7;});}
function camp(b:Batch,r:Row,base:number,floor:number){
 const eave=floor+2.35,roof=(p:number[])=>eave+.18*(1-Math.min(1,Math.abs((p[0]-r.center[0])*r.roofAcross[0]+(p[1]-r.center[1])*r.roofAcross[1])/r.halfWidth)),paint=['#c6c9bf','#c5c1b2','#b7c4c0'][r.label%3];
 horizontal(b,r,r.outline,()=>base,'foundation',false);for(const sign of[-1,1])horizontal(b,r,roofHalf(r,sign),roof,'roof',true);
 for(const [j,s]of r.frames.entries()){
  const f:Frame={...s,structId:r.id,tileId:r.tileId},w=s.width,a=s.start,z=[a[0]+s.tangent[0]*w,a[1]+s.tangent[1]*w],ha=roof(a),hb=roof(z);
  b.polygon(f,'wall',[[0,base,0],[w,base,0],[w,hb,0],[0,ha,0]],paint);
  b.box(f,'foundation',w/2,(base+floor)/2,.015,w,Math.max(.03,floor-base),.03,'#7a7e73');
  b.box(f,'metal',w/2,floor+.04,.03,w,.075,.06,'#8b9186');
  b.box(f,'trim',w/2,eave-.035,.035,w,.08,.10,'#d0d3c8');
  if(w<2.2)continue;
  const door=j===r.entry,doorU=w*.29;
  if(door){b.box(f,'recess',doorU,floor+1.07,.021,.99,2.18,.04,'#384943');b.box(f,'door',doorU,floor+1.05,.049,.86,2.10,.035,'#b1b9ad');b.box(f,'glass',doorU,floor+1.59,.07,.56,.60,.018,'#405751');b.box(f,'metal',doorU+.27,floor+1.01,.082,.025,.11,.025,'#616b60');}
  const count=Math.max(1,Math.floor(w/2.8));for(let i=0;i<count;i++){
   const u=(i+.5)*w/count;if(door&&Math.abs(u-doorU)<1.05)continue;
   const ww=Math.min(w>5?1.20:.86,w/count-.7),h=.78,bottom=floor+1.02;
   b.box(f,'recess',u,bottom+h/2,.021,ww+.11,h+.11,.04,'#4b554e');b.box(f,'glass',u,bottom+h/2,.045,ww,h,.027,'#445e57');
   for(const sign of[-1,1])b.box(f,'metal',u+sign*(ww/2+.023),bottom+h/2,.065,.048,h+.10,.04,'#a4afa4');
   for(const y of[bottom-.025,bottom+h+.025])b.box(f,'metal',u,y,.065,ww+.09,.05,.04,'#a4afa4');
   if(b.level<2)b.box(f,'metal',u,bottom+h/2,.07,.025,h,.03,'#7e8d80');
  }
 }
}
export function applyCampStructures(group:THREE.Group,tileId:string,origin:readonly number[],level:number,sourceSha256:string):CampReport|undefined{
 if(group.userData.campStructures)return group.userData.campStructures as CampReport;
 const rows=catalog.rows.filter(r=>r.tileId===tileId);if(!rows.length)return;
 const empty=(status:CampReport['status']):CampReport=>({status,ids:[],removedTriangles:0,triangles:0,meshes:0,geometryBytes:0,placements:[]});
 if(rows.some(r=>r.lods.find(l=>l.level===level)?.sha256!==sourceSha256||r.origin.some((v,i)=>v!==origin[i])))return empty('source-mismatch');
 const at=new THREE.Vector3().fromArray(origin),sample=terrainSampler(group,at,rows),ready: {r:Row;base:number;floor:number}[]=[];
 for(const r of rows){const locations=r.outline.flatMap((p,i)=>{const q=r.outline[(i+1)%r.outline.length];return[p,[(p[0]+q[0])/2,(p[1]+q[1])/2]];}),heights=locations.map(p=>sample(p[0],p[1]));if(heights.some(y=>y===undefined))continue;const ys=(heights as number[]).sort((a,b)=>a-b);ready.push({r,base:ys[0]-.10,floor:ys[Math.floor((ys.length-1)*.70)]+.20});}
 if(!ready.length)return empty('no-support');
 const filtered=filterEvidenceSources(group,at,ready.map(({r})=>({id:r.id,tileId,outline:r.outline,base:r.sourceBase,peak:r.sourcePeak,replaceBody:true}))),batch=new Batch(at,level),placements:CampReport['placements']=[];
 for(const {r,base,floor}of ready)if(filtered.matched.has(r.id)){camp(batch,r,base,floor);placements.push({id:r.id,base,floor,peak:floor+2.53,sourcePeak:r.sourcePeak});}
 const built=batch.finish();built.group.name='Aerial-matched camp structures';built.group.traverse(o=>{if(o instanceof THREE.Mesh){o.name=`Camp structure | ${(o.material as THREE.Material).name}`;o.userData.category='camp-structures';}});if(built.triangles)group.add(built.group);
 const report:CampReport={status:'applied',ids:placements.map(r=>r.id),removedTriangles:filtered.removedTriangles,triangles:built.triangles,meshes:built.group.children.length,geometryBytes:built.bytes,placements};group.userData.campStructures=report;return report;
}
