import * as THREE from 'three';
import index from '../../../data/derived/town/environment-facilities-index.json';
import {Batch,type Frame,type Role} from './crafted-frontages';
import type{AssetRef}from'./contracts';
type V2=[number,number];
type Facility={id:string;tileId:string;kind:'court'|'solar'|'pier'|'apron'|'fence';gate?:boolean;sport?:'basketball'|'tennis'|'futsal'|'football'|'baseball';home?:V2;infieldAxis?:number;parking?:boolean;point:V2;angle:number;length:number;width:number;height:number;outline:V2[];grid?:{rows:number;columns:number;heights:number[]};evidenceIds:string[]};
export type EnvironmentFacilitiesPacket={version:1;tileId:string;sourceManifestSha256:string;objects:Facility[];grassExclusions?:V2[][]};
export type EnvironmentFacilitiesReport={ids:string[];triangles:number;bytes:number;meshes:number;rejected:boolean;equipment:{backstops:number;benches:number;footballGoals:number;fenceMeters:number;gates:number}};
export function environmentFacilitiesAsset(tileId:string):AssetRef|undefined{return(index.tiles as Record<string,AssetRef>)[tileId];}
export function validEnvironmentFacilitiesPacket(value:unknown,tileId:string):value is EnvironmentFacilitiesPacket{
 const p=value as EnvironmentFacilitiesPacket|undefined;if(!p||p.version!==1||p.tileId!==tileId||p.sourceManifestSha256!==index.sourceManifestSha256||!Array.isArray(p.objects)||p.objects.length>1000)return false;const ids=new Set<string>();
 return p.objects.every(r=>{if(!r||typeof r.id!=='string'||ids.has(r.id)||r.tileId!==tileId||!['court','solar','pier','apron','fence'].includes(r.kind)||!Array.isArray(r.point)||r.point.length!==2||!r.point.every(Number.isFinite)||![r.angle,r.length,r.width,r.height].every(Number.isFinite)||r.width<=0||r.width>150||r.length<=0||r.length>250||!Array.isArray(r.outline)||r.outline.length<3||r.outline.length>150||!r.outline.every(v=>v.length===2&&v.every(Number.isFinite))||!Array.isArray(r.evidenceIds)||!r.evidenceIds.length)return false;ids.add(r.id);if(r.home&&(!Array.isArray(r.home)||r.home.length!==2||!r.home.every(Number.isFinite))||r.infieldAxis!==undefined&&!Number.isFinite(r.infieldAxis))return false;if(r.gate!==undefined&&typeof r.gate!=='boolean')return false;const g=r.grid;return r.kind==='pier'||!!g&&Number.isInteger(g.rows)&&g.rows>0&&g.rows<300&&Number.isInteger(g.columns)&&g.columns>0&&g.columns<170&&g.heights.length===(g.rows+1)*(g.columns+1)&&g.heights.every(v=>Number.isFinite(v)&&v>-100&&v<1000);})&&(!p.grassExclusions||p.grassExclusions.length<100&&p.grassExclusions.every(r=>r.length>=3&&r.length<150&&r.every(v=>v.length===2&&v.every(Number.isFinite))));
}
function frame(r:Facility):Frame{const t:V2=[Math.cos(r.angle),Math.sin(r.angle)];return{start:r.point,tangent:t,outward:[t[1],-t[0]],structId:r.id,tileId:r.tileId};}
function height(r:Facility,u:number,v:number):number{
 const g=r.grid;if(!g)return r.height;const x=Math.max(0,Math.min(g.rows,(u/r.length+.5)*g.rows)),z=Math.max(0,Math.min(g.columns,(v/r.width+.5)*g.columns)),i=Math.min(g.rows-1,Math.floor(x)),j=Math.min(g.columns-1,Math.floor(z)),a=x-i,b=z-j,k=i*(g.columns+1)+j;
 const A=g.heights[k],B=g.heights[k+g.columns+1],C=g.heights[k+g.columns+2],D=g.heights[k+1];return b>=a?A*(1-b)+D*(b-a)+C*a:A*(1-a)+C*b+B*(a-b);
}
function top(batch:Batch,f:Frame,r:Facility,color:string){const g=r.grid!;for(let i=0;i<g.rows;i++)for(let j=0;j<g.columns;j++){
 const a=(u:number,v:number)=>[(u/g.rows-.5)*r.length,g.heights[u*(g.columns+1)+v],(v/g.columns-.5)*r.width];batch.polygon(f,'paving',[a(i,j),a(i,j+1),a(i+1,j+1)],color);batch.polygon(f,'paving',[a(i,j),a(i+1,j+1),a(i+1,j)],color);
}}
function line(batch:Batch,f:Frame,r:Facility,a:V2,b:V2,width=.065,color='#e3e0cf'){
 const dx=b[0]-a[0],dv=b[1]-a[1],length=Math.hypot(dx,dv);if(length<.01)return;const n:V2=[-dv/length*width/2,dx/length*width/2],segments=Math.ceil(length/.6);
 for(let i=0;i<segments;i++){const p:V2=[a[0]+dx*i/segments,a[1]+dv*i/segments],q:V2=[a[0]+dx*(i+1)/segments,a[1]+dv*(i+1)/segments];const pt=(a:V2,s:number)=>[a[0]+n[0]*s,height(r,a[0]+n[0]*s,a[1]+n[1]*s)+.017,a[1]+n[1]*s];batch.polygon(f,'trim',[pt(p,-1),pt(p,1),pt(q,1),pt(q,-1)],color);}
}
function circle(batch:Batch,f:Frame,r:Facility,u:number,v:number,radius:number,start=0,end=Math.PI*2){const steps=24;for(let i=0;i<steps;i++){const a=start+(end-start)*i/steps,b=start+(end-start)*(i+1)/steps;line(batch,f,r,[u+Math.cos(a)*radius,v+Math.sin(a)*radius],[u+Math.cos(b)*radius,v+Math.sin(b)*radius]);}}
function emit(batch:Batch,f:Frame,role:Role,g:THREE.BufferGeometry,color:string){const flat=g.index?g.toNonIndexed():g;batch.geometry(f,role,flat.getAttribute('position').array,flat.getAttribute('normal').array,color);if(flat!==g)flat.dispose();g.dispose();}

function rod(batch:Batch,f:Frame,a:number[],b:number[],radius=.022,color='#747d78'){
 const direction=new THREE.Vector3(b[0]-a[0],b[1]-a[1],b[2]-a[2]),length=direction.length();if(length<.001)return;
 const geometry=new THREE.CylinderGeometry(radius,radius,length,5,1).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),direction.normalize())).translate((a[0]+b[0])/2,(a[1]+b[1])/2,(a[2]+b[2])/2);emit(batch,f,'metal',geometry,color);
}
function contains(r:Facility,u:number,v:number,margin=.18):boolean{
 const t=[Math.cos(r.angle),Math.sin(r.angle)],n=[t[1],-t[0]],test=(u:number,v:number)=>{const x=r.point[0]+t[0]*u+n[0]*v,y=r.point[1]+t[1]*u+n[1]*v;let inside=false;for(let i=0,j=r.outline.length-1;i<r.outline.length;j=i++){const a=r.outline[i],b=r.outline[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])inside=!inside;}return inside;};
 return [[u-margin,v-margin],[u+margin,v-margin],[u+margin,v+margin],[u-margin,v+margin]].every(p=>test(p[0],p[1]));
}
function meshPanel(batch:Batch,f:Frame,r:Facility,a:V2,b:V2,rise:number){
 const y0=height(r,...a)-.10,y1=height(r,...b)-.10,L=Math.hypot(b[0]-a[0],b[1]-a[1]),at=(u:number,h:number)=>[a[0]+(b[0]-a[0])*u,y0+(y1-y0)*u+h,a[1]+(b[1]-a[1])*u];
 rod(batch,f,at(0,-.12),at(0,rise),.033);rod(batch,f,at(1,-.12),at(1,rise),.033);for(const h of[.13,rise-.08])rod(batch,f,at(0,h),at(1,h),.022);
 if(batch.level===2)return;
 const pitch=batch.level?.72:.42;for(const sign of[-1,1])for(let offset=-rise;offset<L+rise;offset+=pitch){const lo=Math.max(0,offset),hi=Math.min(L,offset+rise);if(hi-lo<.04)continue;const u0=lo/L,u1=hi/L;const h0=sign>0?lo-offset:rise-(lo-offset),h1=sign>0?hi-offset:rise-(hi-offset);rod(batch,f,at(u0,.08+h0*.94),at(u1,.08+h1*.94),.0065,'#828b85');}
}
function fieldEquipment(batch:Batch,f:Frame,r:Facility,report:EnvironmentFacilitiesReport['equipment']){
 if(r.sport==='football'){
  for(const sign of[-1,1]){const u=sign*(r.length/2-1.4),y=height(r,u,0);if(!contains(r,u,0))continue;rod(batch,f,[u,y-.16,0],[u,y+3.05,0],.075,'#dac569');rod(batch,f,[u,y+3.05,-2.82],[u,y+3.05,2.82],.055,'#dac569');for(const v of[-2.82,2.82])rod(batch,f,[u,y+3.05,v],[u,y+6.6,v],.052,'#dac569');report.footballGoals++;}return;
 }
 if(r.sport!=='baseball'||!r.home)return;
 const angle=-(r.infieldAxis??0),t=[Math.cos(angle),Math.sin(angle)],n=[-t[1],t[0]],local=(u:number,v:number):V2=>[r.home![0]+t[0]*u+n[0]*v,r.home![1]+t[1]*u+n[1]*v];
 const back=[local(-.8,-3.6),local(-2.3,-1.6),local(-2.3,1.6),local(-.8,3.6)];if(back.every(p=>contains(r,...p))){for(let i=1;i<back.length;i++)meshPanel(batch,f,r,back[i-1],back[i],2.8);report.backstops++;}
 for(const sign of[-1,1]){const q=local(5,sign*8);if(!contains(r,...q,1.2))continue;const y=height(r,...q);batch.box(f,'door',q[0],y+.43,q[1],2.1,.09,.42,'#969b91',angle);batch.box(f,'metal',q[0],y+.25,q[1],1.7,.36,.30,'#69736c',angle);report.benches++;}
}
function court(batch:Batch,f:Frame,r:Facility){
 if(r.sport==='baseball'){baseball(batch,f,r);return;}
 top(batch,f,r,r.sport==='tennis'?'#4c665c':r.sport==='futsal'||r.sport==='football'?'#687a65':'#63736b');const x=r.length/2-.35,z=r.width/2-.35;
 for(const[a,b]of[[[-x,-z],[x,-z]],[[x,-z],[x,z]],[[x,z],[-x,z]],[[-x,z],[-x,-z]],[[0,-z],[0,z]]]as[V2,V2][])line(batch,f,r,a,b);
 if(r.sport==='basketball'){
  circle(batch,f,r,0,0,Math.min(1.8,z*.35));for(const sign of[-1,1]){
   const end=sign*(x-.8),free=sign*(x-4.7);for(const[a,b]of[[[sign*x,-1.8],[free,-1.8]],[[free,-1.8],[free,1.8]],[[free,1.8],[sign*x,1.8]]]as[V2,V2][])line(batch,f,r,a,b);circle(batch,f,r,free,0,1.8);
   const y=height(r,end,0);batch.box(f,'metal',end,y+1.55,0,.12,3.1,.12,'#4d514c');batch.box(f,'trim',end-sign*.25,y+3.12,0,.065,1.03,1.8,'#d8d8cc');
   emit(batch,f,'metal',new THREE.TorusGeometry(.225,.021,5,16).rotateX(Math.PI/2).translate(end-sign*.55,y+2.99,0),'#bb602d');
  }
 }else if(r.sport==='tennis'){
  const inner=z*.77,service=Math.min(6.4,x*.57);for(const[a,b]of[[[-x,-inner],[x,-inner]],[[-x,inner],[x,inner]],[[-service,-inner],[-service,inner]],[[service,-inner],[service,inner]],[[-service,0],[service,0]]]as[V2,V2][])line(batch,f,r,a,b);
  const base=height(r,0,0);for(const side of[-1,1])batch.box(f,'metal',0,base+.53,side*z,.065,1.06,.065,'#525a51');for(let i=0;i<7;i++)batch.box(f,'metal',0,base+.14+i*.12,0,.018,.012,z*2,'#777c73');for(let v=-z;v<=z;v+=.45)batch.box(f,'metal',0,base+.48,v,.018,.75,.012,'#777c73');batch.box(f,'trim',0,base+.96,0,.035,.045,z*2,'#d6d6c7');
 }else if(r.sport==='football'){for(let i=1;i<12;i++){const u=-x+2*x*i/12;line(batch,f,r,[u,-z],[u,z]);if(batch.level===0)for(const v of[-z*.28,z*.28])line(batch,f,r,[u-.25,v],[u+.25,v],.10);}
 }else{
  circle(batch,f,r,0,0,3);for(const sign of[-1,1]){const end=sign*x,y=height(r,end,0);for(const z of[-1.5,1.5])batch.box(f,'trim',end,y+1,z,.07,2,.07,'#e3e0cf');batch.box(f,'trim',end,y+2,0,.07,.07,3,'#e3e0cf');}
 }
}
function baseball(batch:Batch,f:Frame,r:Facility){
 const home=r.home??[0,0],angle=-(r.infieldAxis??0),t:V2=[Math.cos(angle),Math.sin(angle)],n:V2=[-t[1],t[0]],radius=30;
 const local=(u:number,v:number):V2=>[home[0]+t[0]*u+n[0]*v,home[1]+t[1]*u+n[1]*v],pt=(d:number,a:number)=>{const q=local(Math.cos(a)*d,Math.sin(a)*d);return[q[0],height(r,q[0],q[1])+.009,q[1]];};
 for(let ring=0;ring<12;ring++)for(let j=0;j<24;j++){const a=-Math.PI/4+j*Math.PI/48,b=-Math.PI/4+(j+1)*Math.PI/48,lo=ring*radius/12,hi=(ring+1)*radius/12;if(ring===0)batch.polygon(f,'paving',[pt(0,0),pt(hi,b),pt(hi,a)],'#a68f6c');else{batch.polygon(f,'paving',[pt(lo,a),pt(lo,b),pt(hi,b)],'#a68f6c');batch.polygon(f,'paving',[pt(lo,a),pt(hi,b),pt(hi,a)],'#a68f6c');}}
 const side=18.3,root=Math.SQRT1_2,first=local(side*root,side*root),third=local(side*root,-side*root),second=local(side*Math.SQRT2,0);
 for(const q of[home,first,second,third])batch.box(f,'trim',q[0],height(r,q[0],q[1])+.04,q[1],.32,.06,.32,'#e1dec9');
 for(const[a,b]of[[home,first],[first,second],[second,third],[third,home]]as[V2,V2][])line(batch,f,r,a,b,.055);for(const sign of[-1,1])line(batch,f,r,home,local(34*root,sign*34*root),.075);
 const mound=local(12.8,0);circle(batch,f,r,mound[0],mound[1],1.25);
}
function solar(batch:Batch,f:Frame,r:Facility){
 const count=Math.ceil(r.length/2.2),half=r.width/2;for(let i=0;i<count;i++){
  const u0=(i/count-.5)*r.length+.012,u1=((i+1)/count-.5)*r.length-.012;const vertex=(u:number,v:number,offset=0)=>[u,height(r,u,v)+1.05+(v/r.width+.5)*.72+offset,v];const p=[vertex(u0,-half),vertex(u0,half),vertex(u1,half),vertex(u1,-half)];batch.polygon(f,'glass',p,'#263a48');batch.polygon(f,'metal',[...p].reverse(),'#626b6b');
  if(batch.level===0)for(const v of[-half,0,half]){const a=vertex(u0,v,.012),b=vertex(u1,v,.012);batch.polygon(f,'metal',[[a[0],a[1],v-.018],[a[0],a[1],v+.018],[b[0],b[1],v+.018],[b[0],b[1],v-.018]],'#adb4ad');}
  if(i%3===0){const u=(u0+u1)/2,y=height(r,u,0);for(const v of[-half*.65,half*.65])batch.box(f,'metal',u,y+.14,v,.055,2.3,.055,'#838982');}
 }
}
function pier(batch:Batch,f:Frame,r:Facility){
 const y=r.height;batch.box(f,'door',0,y-.11,0,r.length,.22,r.width,'#968976');
 for(const u of[-r.length/2+.2,r.length/2-.2])for(const v of[-r.width/2+.14,r.width/2-.14])batch.box(f,'metal',u,y-.7,v,.095,1.4,.095,'#888a80');
 if(batch.level<2)for(let u=-r.length/2+.23;u<r.length/2;u+=batch.level?.46:.23)batch.polygon(f,'recess',[[u-.005,y+.004,-r.width/2],[u-.005,y+.004,r.width/2],[u+.005,y+.004,r.width/2],[u+.005,y+.004,-r.width/2]],'#6f675a');
}
export function applyEnvironmentFacilities(group:THREE.Object3D,tileId:string,origin:readonly number[],level=0,packet?:EnvironmentFacilitiesPacket):EnvironmentFacilitiesReport|undefined{
 if(!packet)return;if(group.userData.environmentFacilities)return group.userData.environmentFacilities;const report={ids:[]as string[],triangles:0,bytes:0,meshes:0,rejected:false,equipment:{backstops:0,benches:0,footballGoals:0,fenceMeters:0,gates:0}};if(!validEnvironmentFacilitiesPacket(packet,tileId))return{...report,rejected:true};
 const batch=new Batch(new THREE.Vector3(...origin),level);for(const r of packet.objects){const f=frame(r);if(r.kind==='court'){court(batch,f,r);fieldEquipment(batch,f,r,report.equipment);}else if(r.kind==='fence'){meshPanel(batch,f,r,[-r.length/2,r.gate?.12:0],[r.length/2,r.gate?.12:0],r.gate?1.85:2);report.equipment.fenceMeters+=r.length;if(r.gate)report.equipment.gates++;}else if(r.kind==='solar')solar(batch,f,r);else if(r.kind==='pier')pier(batch,f,r);else{top(batch,f,r,r.parking?'#74776f':'#827f73');if(r.parking)for(let u=-r.length/2+3;u<r.length/2-3;u+=2.8)line(batch,f,r,[u,.4],[u,r.width/2-.65],.085);}report.ids.push(r.id);}
 const result=batch.finish();result.group.name='Registered environment facilities';result.group.userData.townCrafted=true;result.group.traverse(o=>{if(o instanceof THREE.Mesh){o.userData.townCrafted=true;o.userData.category='environment-facilities';if(level)o.castShadow=false;}});if(result.triangles)group.add(result.group);report.triangles=result.triangles;report.bytes=result.bytes;report.meshes=result.group.children.length;
 group.userData.environmentFacilities=report;group.userData.environmentTreeExclusions=[...(group.userData.environmentTreeExclusions??[]),...(packet.grassExclusions??packet.objects.filter(r=>r.kind==='court'||r.kind==='apron').map(r=>r.outline))];group.userData.environmentGrassExclusions=[...(group.userData.environmentGrassExclusions??[]),...(packet.grassExclusions??packet.objects.filter(r=>r.kind==='court'||r.kind==='apron').map(r=>r.outline))];return report;
}
