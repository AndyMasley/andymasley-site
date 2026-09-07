import * as THREE from 'three';
import index from '../../../data/derived/town/roadside-index.json';
import { Batch, type Frame, type Role } from './crafted-frontages';
import { GrassTerrain } from './grass';
import type { AssetRef } from './contracts';

type V3=[number,number,number];
export type RoadsideObject={id:string;kind:'post-box'|'bus-stop'|'stop'|'utility-pole';point:number[];base:number;normal:number[];label:string;height?:number;light?:boolean;allWay?:boolean;wireEnd?:number[];evidence:string};
export type RoadsidePacket={version:1;tileId:string;origin:number[];sourceLods:Record<string,string>;objects:RoadsideObject[]};
export type RoadsideReport={tileId:string;ids:string[];skipped:{id:string;reason:string}[];addedTriangles:number;addedMeshes:number;geometryBytes:number;wireSpans:number;rejected:boolean};
const labels=['STOP','ALL WAY','WRTA\n42','WRTA\n51','WRTA\n42 · 51'];
export const roadsideAsset=(tileId:string):AssetRef|undefined=>(index.tiles as Record<string,AssetRef>)[tileId];
const finite=(v:unknown,size:number):v is number[]=>Array.isArray(v)&&v.length===size&&v.every(Number.isFinite);
export function validRoadsidePacket(value:unknown,tileId:string):value is RoadsidePacket {
  const p=value as RoadsidePacket,[x,n]=tileId.split('_').map(Number);
  return !!p&&p.version===1&&p.tileId===tileId&&finite(p.origin,3)&&!!p.sourceLods&&Object.values(p.sourceLods).every(h=>/^[a-f0-9]{64}$/.test(h))&&
    Array.isArray(p.objects)&&p.objects.length<100&&new Set(p.objects.map(r=>r.id)).size===p.objects.length&&p.objects.every(r=>
      typeof r.id==='string'&&['post-box','bus-stop','stop','utility-pole'].includes(r.kind)&&finite(r.point,2)&&r.point[0]>=x*250&&r.point[0]<(x+1)*250&&r.point[1]>=n*250&&r.point[1]<(n+1)*250&&
      finite(r.normal,2)&&Math.abs(Math.hypot(...r.normal)-1)<.0001&&Number.isFinite(r.base)&&typeof r.evidence==='string'&&typeof r.label==='string'&&
      (r.height===undefined||Number.isFinite(r.height)&&r.height>=8&&r.height<=12)&&
      (r.kind!=='utility-pole'||r.height!==undefined)&&
      (r.wireEnd===undefined||finite(r.wireEnd,3)&&Math.hypot(r.wireEnd[0]-r.point[0],r.wireEnd[1]-r.point[1])<70));
}
function emit(b:Batch,f:Frame,role:Role,g:THREE.BufferGeometry,color:string):void {
  const flat=g.index?g.toNonIndexed():g;b.geometry(f,role,flat.getAttribute('position').array,flat.getAttribute('normal').array,color);if(flat!==g)flat.dispose();g.dispose();
}
function beam(b:Batch,f:Frame,a:V3,c:V3,r:number,color:string,role:Role='metal',sides=6):void {
  const start=new THREE.Vector3(...a),end=new THREE.Vector3(...c),direction=end.clone().sub(start);if(direction.lengthSq()<1e-10)return;
  const g=new THREE.CylinderGeometry(r,r,direction.length(),sides);g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),direction.normalize()));g.translate(...start.add(end).multiplyScalar(.5).toArray() as V3);emit(b,f,role,g,color);
}
function material():THREE.MeshStandardMaterial {
  let texture:THREE.Texture;
  if(typeof document==='undefined')texture=new THREE.DataTexture(new Uint8Array([245,243,227,255]),1,1);
  else {
    const canvas=document.createElement('canvas');canvas.width=512;canvas.height=1024;const c=canvas.getContext('2d');
    if(c)labels.forEach((text,i)=>{
      const bus=text.startsWith('WRTA');
      c.fillStyle=bus?'#255070':i===0?'#fffaf0':'#363a35';c.textBaseline='middle';c.textAlign='center';c.font=`700 ${bus?28:i===0?148:90}px Arial, sans-serif`;
      text.split('\n').forEach((line,j,lines)=>c.fillText(line,256,i*128+64+(j-(lines.length-1)/2)*53,bus?72:470));
    });texture=c?new THREE.CanvasTexture(canvas):new THREE.DataTexture(new Uint8Array([245,243,227,255]),1,1);
  }
  texture.colorSpace=THREE.SRGBColorSpace;texture.userData.sourceUrl='town-generated:roadside-lettering-v2';texture.needsUpdate=true;
  const m=new THREE.MeshStandardMaterial({map:texture,roughness:.74,alphaTest:.4,side:THREE.DoubleSide});m.name='Research roadside | original lettering';m.userData.townCrafted=true;return m;
}
class Lettering {
  p:number[]=[];n:number[]=[];uv:number[]=[];
  constructor(readonly origin:readonly number[]){}
  panel(f:Frame,label:string,y:number,width:number,height:number,z=.031):void {
    const row=labels.indexOf(label);if(row<0)return;
    const t=f.tangent,n=f.outward,corners=[[-width/2,-height/2],[width/2,-height/2],[width/2,height/2],[-width/2,height/2]],order=n[0]*t[1]-t[0]*n[1]<0?[0,2,1,0,3,2]:[0,1,2,0,2,3];
    for(const i of order){const[u,v]=corners[i];this.p.push(f.start[0]+t[0]*u+n[0]*z-this.origin[0],y+v-this.origin[1],-f.start[1]-t[1]*u-n[1]*z-this.origin[2]);this.n.push(n[0],0,-n[1]);const half=label.startsWith('WRTA')?36:label==='STOP'?228:192;this.uv.push((256+(i===0||i===3?-half:half))/512,1-(row*128+(i<2?126:2))/1024);}
  }
  finish():THREE.Mesh|undefined {
    if(!this.p.length)return;const g=new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(this.p,3)).setAttribute('normal',new THREE.Float32BufferAttribute(this.n,3)).setAttribute('uv',new THREE.Float32BufferAttribute(this.uv,2));g.computeBoundingBox();g.computeBoundingSphere();const m=new THREE.Mesh(g,material());m.name='Research roadside | lettering';m.userData.townCrafted=true;return m;
  }
}
function postBox(b:Batch,f:Frame,y:number):void {
  const blue='#315b75';
  for(const x of[-.23,.23])for(const z of[-.18,.18])b.box(f,'metal',x,y+.16,z,.065,.32,.065,blue);
  b.box(f,'metal',0,y+.63,0,.60,.95,.50,blue);
  emit(b,f,'metal',new THREE.CylinderGeometry(.30,.30,.50,12,1,false,Math.PI/2,Math.PI).rotateX(Math.PI/2).translate(0,y+1.10,0),blue);
  b.box(f,'recess',0,y+.97,.256,.46,.12,.012,'#23333b');b.box(f,'metal',0,y+.905,.285,.47,.025,.08,blue);
  b.box(f,'trim',0,y+.56,.258,.22,.28,.008,'#d6d6c5');b.box(f,'metal',0,y+.28,.257,.44,.015,.015,'#315b75');
}
function stopSign(b:Batch,f:Frame,y:number,l:Lettering,allWay=false):void {
  b.box(f,'metal',0,y+1.65,-.018,.055,3.3,.045,'#959c92');
  for(const[r,color,z]of [[.445,'#e7e4d5',.0],[.420,'#ac332c',.013]] as [number,string,number][]){
    const points=Array.from({length:8},(_,i)=>{const a=Math.PI/8+i*Math.PI/4;return[Math.cos(a)*r,y+2.83+Math.sin(a)*r,z];});b.polygon(f,'metal',points,color);b.polygon(f,'metal',[...points].reverse().map(p=>[p[0],p[1],p[2]-.008]),'#959c92');
  }
  l.panel(f,'STOP',y+2.83,.64,.18,.018);if(!allWay)return;b.box(f,'metal',0,y+2.15,0,.45,.20,.025,'#e7e4d5');l.panel(f,'ALL WAY',y+2.15,.40,.13);
}
function pole(b:Batch,f:Frame,r:RoadsideObject,y:number):void {
  const top=r.base+r.height!,wood='#75664d',wire='#444b42';
  emit(b,f,'foundation',new THREE.CylinderGeometry(.115,.19,top-y+.20,b.level?6:9).translate(0,(top+y-.20)/2,0),wood);
  b.box(f,'foundation',0,top-.52,0,.14,.15,1.75,wood);
  for(const z of[-.73,0,.73]){beam(b,f,[0,top-.5,z],[0,top-.19,z],.030,'#959c92');b.box(f,'trim',0,top-.31,z,.12,.055,.12,'#d6d6c5');}
  if(r.light){
    beam(b,f,[0,top-1.65,0],[0,top-1.35,1.4],.038,'#959c92');beam(b,f,[0,top-1.35,1.4],[0,top-1.32,2.0],.038,'#959c92');
    b.box(f,'metal',0,top-1.34,2.01,.30,.13,.65,'#959c92');b.box(f,'trim',0,top-1.412,2.05,.22,.018,.48,'#d6d6c5');
  }
  if(r.wireEnd){
    const dx=r.wireEnd[0]-f.start[0],dn=r.wireEnd[1]-f.start[1],u=dx*f.tangent[0]+dn*f.tangent[1],v=dx*f.outward[0]+dn*f.outward[1],segments=b.level?4:8;
    for(const lateral of b.level===2?[0]:[-.73,0,.73])for(let i=0;i<segments;i++){
      const at=(t:number):V3=>[u*t,(top-.19)*(1-t)+r.wireEnd![2]*t-.45*4*t*(1-t),v*t+lateral];
      beam(b,f,at(i/segments),at((i+1)/segments),b.level===2?.016:.012,wire,'metal',4);
    }
  }
}
export function applyRoadsideDetails(group:THREE.Group,tileId:string,origin:readonly number[],level:number,sourceSha256:string,packet?:RoadsidePacket):RoadsideReport|undefined {
  if(!packet)return;
  const previous=group.userData.roadsideDetails as RoadsideReport|undefined;if(previous)return previous;
  const report:RoadsideReport={tileId,ids:[],skipped:[],addedTriangles:0,addedMeshes:0,geometryBytes:0,wireSpans:0,rejected:false};
  if(!validRoadsidePacket(packet,tileId)||packet.sourceLods[String(level)]!==sourceSha256||origin.some((v,i)=>Math.abs(v-packet.origin[i])>1e-6)){report.rejected=true;return report;}
  group.updateMatrixWorld(true);const inverse=group.matrixWorld.clone().invert(),meshes:THREE.Mesh[]=[];
  group.traverse(o=>{if(!(o instanceof THREE.Mesh)||o.userData.townCrafted)return;for(let p:THREE.Object3D|null=o;p&&p!==group;p=p.parent)if(p.name==='terrain'||p.name.startsWith('terrain_')){const proxy=new THREE.Mesh(o.geometry,o.material);proxy.matrixAutoUpdate=false;proxy.matrixWorld.copy(inverse).multiply(o.matrixWorld);meshes.push(proxy);break;}});
  const ground=new GrassTerrain(meshes),batch=new Batch(new THREE.Vector3(...origin),level),letters=new Lettering(origin);
  for(const r of packet.objects){
    const p=ground.sample(r.point[0]-origin[0],-r.point[1]-origin[2]);if(!p||Math.abs(p.y+origin[1]-r.base)>1.5){report.skipped.push({id:r.id,reason:'Missing or materially changed source terrain support'});continue;}
    const y=p.y+origin[1]+.01,f:Frame={start:r.point,tangent:[-r.normal[1],r.normal[0]],outward:r.normal,structId:r.id,tileId};
    if(r.kind==='post-box')postBox(batch,f,y);
    else if(r.kind==='utility-pole'){pole(batch,f,r,y);report.wireSpans+=Number(!!r.wireEnd);}
    else if(r.kind==='stop')stopSign(batch,f,y,letters,r.allWay);
    else {
      batch.box(f,'metal',0,y+1.64,-.018,.05,3.28,.045,'#959c92');batch.box(f,'metal',0,y+2.9,0,.36,.60,.034,'#e7e4d5');letters.panel(f,r.label,y+2.9,.32,.56);
    }
    report.ids.push(r.id);
  }
  const built=batch.finish();built.group.name='Research roadside details';const text=letters.finish();if(text){built.group.add(text);built.triangles+=text.geometry.getAttribute('position').count/3;built.bytes+=Object.values(text.geometry.attributes).reduce((s,a)=>s+a.array.byteLength,0);}
  report.addedTriangles=built.triangles;report.geometryBytes=built.bytes;report.addedMeshes=built.group.children.length;if(report.ids.length)group.add(built.group);group.userData.roadsideDetails=report;return report;
}
