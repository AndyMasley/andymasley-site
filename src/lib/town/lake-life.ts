import * as THREE from 'three';
import data from '../../../data/derived/town/lake-life.json';
import { Batch, type Frame, type Role } from './crafted-frontages';

export const LAKE_LIFE_PROVENANCE = data;
export type LakeLifeReport = { ids: string[]; triangles: number; meshes: number; geometryBytes: number; rejected: boolean };
type V3 = [number,number,number];
const white='#e3dfcd',red='#a13d34',dark='#303c40',blue='#506d89';
function emit(b:Batch,f:Frame,role:Role,g:THREE.BufferGeometry,color:string):void {
  const flat=g.index?g.toNonIndexed():g;b.geometry(f,role,flat.getAttribute('position').array,flat.getAttribute('normal').array,color);if(flat!==g)flat.dispose();g.dispose();
}
function beam(b:Batch,f:Frame,a:V3,c:V3,r:number,color=white):void {
  const start=new THREE.Vector3(...a),end=new THREE.Vector3(...c),d=end.clone().sub(start);if(d.lengthSq()<1e-9)return;
  const g=new THREE.CylinderGeometry(r,r,d.length(),b.level===2?4:6);g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize()));g.translate(...start.add(end).multiplyScalar(.5).toArray() as V3);emit(b,f,'metal',g,color);
}
function prism(b:Batch,f:Frame,ring:number[][],bottom:number,top:number,color:string):void {
  b.polygon(f,'metal',ring.map(([u,v])=>[u,bottom,v]),color);
  b.polygon(f,'metal',[...ring].reverse().map(([u,v])=>[u,top,v]),color);
  for(let i=0;i<ring.length;i++){const a=ring[i],c=ring[(i+1)%ring.length];b.polygon(f,'metal',[[a[0],bottom,a[1]],[a[0],top,a[1]],[c[0],top,c[1]],[c[0],bottom,c[1]]],color);}
}
function arch(b:Batch,f:Frame,u:number,y:number,z:number,w:number,h:number,side:number):void {
  const p=[[u-w/2,y,z],[u+w/2,y,z]];
  for(let i=0;i<=8;i++){const a=i*Math.PI/8;p.push([u+Math.cos(a)*w/2,y+h-w/2+Math.sin(a)*w/2,z]);}
  b.polygon(f,'glass',side>0?p:[...p].reverse(),'#334c59');
  if(b.level<2){b.box(f,'metal',u,y+h*.48,z+side*.025,.038,h*.96,.035,white);b.box(f,'metal',u,y+h*.48,z+side*.025,w,.035,.035,white);}
}
function lettering(origin:readonly number[]):THREE.Group {
  let texture:THREE.Texture;
  if(typeof document==='undefined')texture=new THREE.DataTexture(new Uint8Array([35,43,44,255]),1,1);
  else {const c=document.createElement('canvas');c.width=1024;c.height=128;const x=c.getContext('2d');if(x){x.fillStyle='#273435';x.textAlign='center';x.textBaseline='middle';x.font='700 76px Georgia, serif';x.fillText('INDIAN PRINCESS',512,68,990);}texture=x?new THREE.CanvasTexture(c):new THREE.DataTexture(new Uint8Array([35,43,44,255]),1,1);}
  texture.colorSpace=THREE.SRGBColorSpace;texture.userData.sourceUrl='town-generated:indian-princess-lettering-v1';texture.needsUpdate=true;
  const m=new THREE.MeshStandardMaterial({map:texture,alphaTest:.4,roughness:.7});m.name='Indian Princess | original lettering';m.userData.townCrafted=true;
  const group=new THREE.Group();group.name='Indian Princess | name';
  for(const side of[-1,1]){const g=new THREE.PlaneGeometry(5.8,.725);if(side<0)g.rotateY(Math.PI);g.translate(-1,data.height+3.13,side*2.666);g.rotateY(data.angle);g.translate(data.point[0]-origin[0],-origin[1],-data.point[1]-origin[2]);const mesh=new THREE.Mesh(g,m);mesh.userData.townCrafted=true;group.add(mesh);}return group;
}
export function applyLakeLife(group:THREE.Group,tileId:string,origin:readonly number[],level:number,sourceSha256:string):LakeLifeReport|undefined {
  if(tileId!==data.tileId)return;
  if(group.userData.lakeLife)return group.userData.lakeLife as LakeLifeReport;
  const report:LakeLifeReport={ids:[],triangles:0,meshes:0,geometryBytes:0,rejected:false};
  if((data.sourceLods as Record<string,string>)[String(level)]!==sourceSha256||origin.length!==3||origin.some((v,i)=>Math.abs(v-data.origin[i])>1e-6)){report.rejected=true;return report;}
  const b=new Batch(new THREE.Vector3(...origin),level),f:Frame={start:data.point,tangent:[Math.cos(data.angle),Math.sin(data.angle)],outward:[Math.sin(data.angle),-Math.cos(data.angle)],structId:data.id,tileId},y=data.height;
  const ring=[[-10.9,-3.1],[8.3,-3.1],[10.8,-2.4],[12.15,0],[10.8,2.4],[8.3,3.1],[-10.9,3.1]];
  prism(b,f,ring,y-.40,y+.34,dark);prism(b,f,ring,y+.34,y+.88,white);prism(b,f,ring,y+.88,y+.99,red);
  b.box(f,'metal',-1,y+2.06,0,17.3,2.14,5.3,white);
  for(const side of[-1,1]){for(let i=0;i<12;i++)arch(b,f,-8.6+i*1.39,y+1.34,side*2.661,1.04,1.37,side);b.box(f,'metal',-1,y+3.55,side*2.81,19.8,.18,.14,red);}
  b.box(f,'metal',-1,y+3.44,0,19.8,.17,5.65,white);
  const rail=(a:V3,c:V3)=>{beam(b,f,[a[0],a[1]+.98,a[2]],[c[0],c[1]+.98,c[2]],.043);beam(b,f,[a[0],a[1]+.18,a[2]],[c[0],c[1]+.18,c[2]],.03);const n=Math.ceil(Math.hypot(c[0]-a[0],c[2]-a[2])/(level===0?.46:level===1?.85:1.6));for(let i=0;i<=n;i++){const u=a[0]+(c[0]-a[0])*i/n,v=a[2]+(c[2]-a[2])*i/n;beam(b,f,[u,a[1]+.06,v],[u,a[1]+.98,v],.021);}};
  for(const side of[-1,1]){rail([-10.6,y+1,side*2.96],[8.3,y+1,side*2.96]);rail([-10.6,y+3.54,side*2.71],[8.6,y+3.54,side*2.71]);rail([8.3,y+1,side*2.96],[11.8,y+1,0]);}
  rail([-10.6,y+3.54,-2.71],[-10.6,y+3.54,2.71]);
  b.box(f,'metal',-2.7,y+5.74,0,12.8,.18,5.75,blue);
  for(const u of[-8.7,-4.7,-.7,3.3])for(const v of[-2.63,2.63])beam(b,f,[u,y+3.55,v],[u,y+5.69,v],.065);
  b.box(f,'metal',7.05,y+4.7,0,3.3,2.25,3.65,white);b.box(f,'metal',7.05,y+5.91,0,3.7,.18,4.0,white);
  for(const side of[-1,1]){for(const u of[6.15,7.35])arch(b,f,u,y+4.1,side*1.835,.87,1.34,side);}
  for(const z of[-1.14,0,1.14])b.box(f,'glass',8.711,y+4.82,z,.026,1.35,.89,'#334c59');
  for(const v of[-1.7,1.7]){
    emit(b,f,'metal',new THREE.CylinderGeometry(.22,.28,2.4,level===2?8:12).translate(4.35,y+6.04,v),dark);
    emit(b,f,'metal',new THREE.CylinderGeometry(.235,.235,.14,12).translate(4.35,y+6.91,v),red);
    emit(b,f,'metal',new THREE.CylinderGeometry(.31,.25,.2,12).translate(4.35,y+7.30,v),'#b9a56b');
    if(level<2)for(let i=0;i<6;i++){const a=i*Math.PI/3;beam(b,f,[4.35+Math.cos(a)*.27,y+7.35,v+Math.sin(a)*.27],[4.35+Math.cos(a)*.30,y+7.56,v+Math.sin(a)*.30],.027,'#b9a56b');}
  }
  for(const v of[-1.62,1.62]){
    const radius=1.46,segments=level===2?8:12;
    for(const edge of[-.58,.58]){emit(b,f,'metal',new THREE.TorusGeometry(radius,.048,4,segments).translate(-10.75,y+.63,v+edge),white);for(let i=0;i<segments;i++){const a=i*Math.PI*2/segments;beam(b,f,[-10.75,y+.63,v+edge],[-10.75+Math.cos(a)*radius,y+.63+Math.sin(a)*radius,v+edge],.035);}}
    for(let i=0;i<segments;i++){const a=i*Math.PI*2/segments,g=new THREE.BoxGeometry(.35,.065,1.3);g.rotateZ(a);g.translate(-10.75+Math.cos(a)*radius,y+.63+Math.sin(a)*radius,v);emit(b,f,'metal',g,red);}
  }
  if(level<2)for(let i=0;i<11;i++)b.box(f,'metal',3.7+i*.22,y+1.13+i*.215,2.28,.27,.095,.68,white);
  const built=b.finish();built.group.name='Indian Princess | dated berth interpretation';const names=lettering(origin);built.group.add(names);report.ids=[data.id];report.triangles=built.triangles+4;report.geometryBytes=built.bytes;
  names.traverse(o=>{if(o instanceof THREE.Mesh){report.geometryBytes+=o.geometry.index?.array.byteLength??0;for(const key of Object.keys(o.geometry.attributes))report.geometryBytes+=o.geometry.getAttribute(key).array.byteLength;}});report.meshes=built.group.children.length-1+names.children.length;built.group.userData.appearanceBasis=data.basis;group.add(built.group);group.userData.lakeLife=report;return report;
}
