import * as THREE from 'three';
import data from '../../../data/derived/town/utility-site-details.json';
import {Batch,type Frame,type Role} from './crafted-frontages';
import {finishBasinSurfaces} from './site-surface-finish';

export const UTILITY_SITE_ROWS=data.rows;
type Row=typeof data.rows[number];
export type UtilitySiteReport={status:'applied'|'source-mismatch';ids:string[];triangles:number;geometryBytes:number;meshes:number;removedTriangles:0};
const CONCRETE='#97998b',METAL='#a7afa8';
function frame(r:Row):Frame{return{start:[0,0],tangent:[1,0],outward:[0,1],structId:r.id,tileId:r.tileId};}
function face(b:Batch,r:Row,role:Role,p:number[][],color:string,up=false):void{
 const normal=new THREE.Vector3().fromArray(p[1]).sub(new THREE.Vector3().fromArray(p[0])).cross(new THREE.Vector3().fromArray(p[2]).sub(new THREE.Vector3().fromArray(p[0])));
 if(up&&normal.y<0)p=[...p].reverse();b.polygon(frame(r),role,p,color);
}
function beam(b:Batch,r:Row,a:readonly number[],c:readonly number[],height:number,width:number,depth:number,role:Role='metal'):void{
 const dx=c[0]-a[0],dn=c[1]-a[1],length=Math.hypot(dx,dn);
 b.box(frame(r),role,(a[0]+c[0])/2,height,(a[1]+c[1])/2,length,depth,width,role==='metal'?METAL:CONCRETE,-Math.atan2(dn,dx));
}
function basin(b:Batch,r:Row):void{
 const f=frame(r),ring=r.outline,inner=r.innerOutline;
 for(let i=0;i<ring.length;i++){
  const a=ring[i],c=ring[(i+1)%ring.length],ia=inner[i],ic=inner[(i+1)%ring.length];
  face(b,r,'foundation',[[a[0],r.base,a[1]],[a[0],r.rim,a[1]],[c[0],r.rim,c[1]],[c[0],r.base,c[1]]],CONCRETE);
  face(b,r,'foundation',[[ia[0],r.water-.04,ia[1]],[ic[0],r.water-.04,ic[1]],[ic[0],r.rim,ic[1]],[ia[0],r.rim,ia[1]]],CONCRETE);
  face(b,r,'foundation',[[a[0],r.rim,a[1]],[c[0],r.rim,c[1]],[ic[0],r.rim,ic[1]],[ia[0],r.rim,ia[1]]],CONCRETE,true);
  const ra=[a[0]*.5+ia[0]*.5,a[1]*.5+ia[1]*.5],rc=[c[0]*.5+ic[0]*.5,c[1]*.5+ic[1]*.5];
  beam(b,r,ra,rc,r.rim+r.railHeightM,.055,.055);
  if(b.level<2)beam(b,r,ra,rc,r.rim+.52,.045,.045);
  const n=r.kind==='circular'?1:Math.ceil(Math.hypot(rc[0]-ra[0],rc[1]-ra[1])/2.7);
  if(r.kind!=='circular'||i%(b.level===2?4:2)===0)for(let j=0;j<n;j++){const t=j/n;b.box(f,'metal',ra[0]+(rc[0]-ra[0])*t,r.rim+r.railHeightM/2,ra[1]+(rc[1]-ra[1])*t,.055,r.railHeightM,.055,METAL);}
 }
 face(b,r,'glass',inner.map(p=>[p[0],r.water,p[1]]),r.liquidPaint,true);
 const[a,c]=r.bridge;
 beam(b,r,a,c,r.rim+.04,r.walkwayWidthM,.10,'foundation');
 const dx=c[0]-a[0],dn=c[1]-a[1],length=Math.hypot(dx,dn),nx=-dn/length,nn=dx/length;
 for(const side of[-1,1]){
  const x=[a[0]+nx*side*r.walkwayWidthM/2,a[1]+nn*side*r.walkwayWidthM/2],y=[c[0]+nx*side*r.walkwayWidthM/2,c[1]+nn*side*r.walkwayWidthM/2];
  beam(b,r,x,y,r.rim+r.railHeightM,.05,.05);
  if(b.level<2)beam(b,r,x,y,r.rim+.52,.04,.04);
  const count=Math.ceil(length/2.7);for(let j=0;j<=count;j++)b.box(f,'metal',x[0]+(y[0]-x[0])*j/count,r.rim+r.railHeightM/2,x[1]+(y[1]-x[1])*j/count,.055,r.railHeightM,.055,METAL);
 }
}

/** Appends photographed open-basin forms; the immutable source remains intact. */
export function applyUtilitySiteDetails(group:THREE.Group,tileId:string,origin:readonly number[],level:number,sourceSha256:string):UtilitySiteReport|undefined{
 const rows=data.rows.filter(r=>r.tileId===tileId);if(!rows.length)return undefined;
 const previous=group.userData.utilitySiteDetails as UtilitySiteReport|undefined;if(previous)return previous;
 if(!rows.every(r=>r.origin.every((v,i)=>Math.abs(v-origin[i])<1e-7)&&r.sourceLods.some(l=>l.level===level&&l.sha256===sourceSha256)))return{status:'source-mismatch',ids:[],triangles:0,geometryBytes:0,meshes:0,removedTriangles:0};
 const batch=new Batch(new THREE.Vector3(...origin as [number,number,number]),level);for(const row of rows)basin(batch,row);
 const built=batch.finish();built.group.name='Utility site | photographed WWTP basins';
 built.group.traverse(o=>{if(!(o instanceof THREE.Mesh))return;const m=o.material as THREE.MeshStandardMaterial;
  o.name=`Utility site | ${m.userData.surfaceRole}`;o.userData.category='utility-site';m.name=`Utility site | ${m.userData.surfaceRole} | ${m.color.getHexString()}`;m.userData.appearanceBasis='2025 aerial-registered open basins; fitted rim/liquid heights and authored concrete/rails. No operational or access claim.';
  if(m.userData.surfaceRole==='glass'){m.roughness=.39;m.metalness=.06;m.envMapIntensity=.14;o.castShadow=false;}
 });
 group.add(built.group);group.userData.environmentTreeExclusions=[...(group.userData.environmentTreeExclusions??[]),...rows.map(r=>r.outline)];group.userData.environmentGrassExclusions=[...(group.userData.environmentGrassExclusions??[]),...rows.map(r=>r.outline)];
 const surfaceBytes=finishBasinSurfaces(built.group,origin,rows);
 const report:UtilitySiteReport={status:'applied',ids:rows.map(r=>r.id),triangles:built.triangles,geometryBytes:built.bytes+surfaceBytes,meshes:built.group.children.length,removedTriangles:0};group.userData.utilitySiteDetails=report;return report;
}
