import * as THREE from 'three';
import data from '../../../data/derived/town/commercial-completion.json';
import { Batch, type Frame, type Role } from './crafted-frontages';
import { filterEvidenceSources, planDistanceSquared } from './evidence-buildings';

type Row = typeof data.rows[number];
type Facade = Row['frames'][number];
export const COMMERCIAL_COMPLETION = data;
export type CommercialReport = {status:'applied'|'source-mismatch';ids:string[];buildingIds:string[];facades:number;triangles:number;meshes:number;geometryBytes:number;removedTriangles:number};
const PALE='#c9c2b0', DARK='#34423f', GLASS='#344c50';
const frame=(r:Row,f:Facade):Frame=>({...f,structId:f.id,tileId:r.tileId});
function panel(b:Batch,f:Frame,role:Role,u:number,y:number,v:number,w:number,h:number,color:string):void {
 if(w<=0||h<=0)return;
 b.polygon(f,role,[[u-w/2,y-h/2,v],[u+w/2,y-h/2,v],[u+w/2,y+h/2,v],[u-w/2,y+h/2,v]],color);
}
function pane(b:Batch,f:Frame,u:number,y:number,w:number,h:number,v=.34,industrial=false):void {
 panel(b,f,'recess',u,y+h/2,v,w+.12,h+.14,DARK);
 panel(b,f,'glass',u,y+h/2,v+.018,w,h,GLASS);
 const trim=industrial?'#6e766b':PALE;
 for(const x of[u-w/2-.045,u+w/2+.045])b.box(f,'trim',x,y+h/2,v+.035,.09,h+.12,.07,trim);
 for(const z of[y-.055,y+h+.055])b.box(f,'trim',u,z,v+.035,w+.18,.10,.07,trim);
 b.box(f,'metal',u,y+h*.50,v+.07,w,.04,.045,DARK);
 if(b.level<2){
  const columns=industrial?3:2,rows=industrial?4:2;
  for(let i=1;i<columns;i++)panel(b,f,'metal',u-w/2+w*i/columns,y+h/2,v+.095,.025,h,DARK);
  for(let i=1;i<rows;i++)panel(b,f,'metal',u,y+h*i/rows,v+.10,w,.025,DARK);
 }
 b.box(f,'stone',u,y-.11,v+.03,w+.26,.13,.22,PALE);
}
function segmental(b:Batch,f:Frame,u:number,y:number,w:number,h:number,infilled:boolean):void {
 const half=w/2,rise=w*.22,top=y+h,spring=top-rise,steps=b.level===2?6:10,v=.36;
 const points=[[u-half,y,v],[u+half,y,v],[u+half,spring,v]];
 for(let i=1;i<=steps;i++){const x=half-half*2*i/steps;points.push([u+x,spring+rise*Math.sqrt(Math.max(0,1-(x/half)**2)),v]);}
 b.polygon(f,infilled?'brick':'glass',points,infilled?'#9a7159':GLASS);
 for(let i=0;i<steps;i++){
  const x0=half-half*2*i/steps,x1=half-half*2*(i+1)/steps,y0=spring+rise*Math.sqrt(Math.max(0,1-(x0/half)**2)),y1=spring+rise*Math.sqrt(Math.max(0,1-(x1/half)**2));
  b.polygon(f,'brick',[[u+x1,y1,v+.02],[u+x0,y0,v+.02],[u+x0,y0+.20,v+.02],[u+x1,y1+.20,v+.02]],'#774638');
 }
 if(!infilled){
  for(const x of[u-half,u,u+half])b.box(f,'metal',x,(y+spring)/2,v+.035,.055,spring-y,.06,DARK);
  if(b.level<2){for(const x of[-.25,.25])b.box(f,'metal',u+x*w,(y+spring)/2,v+.06,.028,spring-y,.03,DARK);for(let i=1;i<5;i++)panel(b,f,'metal',u,y+(spring-y)*i/5,v+.07,w,.035,DARK);}
 }
 b.box(f,'stone',u,y-.08,v+.02,w+.20,.14,.24,PALE);
}
function entrance(b:Batch,f:Frame,u:number,y:number,w:number,h:number,canopy:boolean):void {
 panel(b,f,'door',u,y+h/2,.36,w,h,DARK);
 for(const x of[u-w/2,u,u+w/2])b.box(f,'metal',x,y+h/2,.395,.055,h,.06,'#90988c');
 panel(b,f,'glass',u,y+h*.61,.405,w-.14,h*.60,GLASS);
 b.box(f,'metal',u,y+.97,.445,w-.16,.032,.032,'#b3b1a0');
 b.box(f,'trim',u,y+h+.09,.40,w+.28,.15,.20,PALE);
 if(canopy){b.box(f,'roof',u,y+h+.24,.43,w+.70,.12,.85,'#535d56');b.box(f,'metal',u,y+h+.18,.87,w+.70,.16,.065,DARK);}
}
function garageDoor(b:Batch,f:Frame,u:number,y:number,w:number,h:number):void {
 panel(b,f,'recess',u,y+h/2,.32,w+.15,h+.14,DARK);panel(b,f,'door',u,y+h/2,.36,w,h,'#b4b7aa');
 for(let i=1;i<6;i++)panel(b,f,'metal',u,y+h*i/6,.39,w,.027,'#68716a');
 for(let i=0;i<3;i++)panel(b,f,'glass',u+(i-1)*w*.28,y+h*.69,.405,w*.24,Math.min(.40,h*.14),GLASS);
 for(const x of[u-w/2-.07,u+w/2+.07])b.box(f,'metal',x,y+h/2,.37,.12,h+.10,.10,DARK);
}
function cornice(b:Batch,f:Frame,w:number,top:number,ornate:boolean):void {
 b.box(f,'trim',w/2,top-.29,.28,w,.24,.18,PALE);
 b.box(f,'metal',w/2,top-.09,.34,w+.08,.12,.29,'#7e8376');
 if(ornate&&b.level<2)for(let u=.35;u<w-.2;u+=.58)b.box(f,'trim',u,top-.16,.40,.12,.16,.12,PALE);
}
function buildFacade(b:Batch,r:Row,s:Facade):void {
 const f=frame(r,s),w=s.width,h=s.top-s.floor,recipe=s.recipe,y=s.floor;
 if(w<2||h<2.2)return;
 if(recipe==='lake-plaza'){
  panel(b,f,'brick',w/2,y+h/2,.26,w,h,'#9e8768');
  const bays=Math.max(4,Math.round(w/6.3)),lower=s.top-1.05;
  for(let i=0;i<bays;i++){
   const u=(i+.5)*w/bays,ww=w/bays-.65;
   pane(b,f,u,y+.32,ww,Math.min(2.6,lower-y-.38),.34);
   if(i%2===0)entrance(b,f,u+ww*.28,y,.95,Math.min(2.35,lower-y-.22),false);
  }
  b.polygon(f,'metal',[[0,lower,.58],[w,lower,.58],[w,s.top,.13],[0,s.top,.13]],'#305955');
  b.box(f,'metal',w/2,s.top+.015,.12,w+.05,.09,.10,'#687b67');
  if(b.level<2)for(let u=.3;u<w;u+=.45)b.polygon(f,'metal',[[u,lower,.602],[u+.025,lower,.602],[u+.025,s.top,.151],[u,s.top,.151]],'#243f3d');
  return;
 }
 const ornate=recipe==='classical'||recipe==='colonial',industrial=['weave','mill','factory','warehouse','garage'].includes(recipe);
 const paint=s.paint??(industrial?'#a49c86':recipe==='cafe'?'#babba9':'#b9b6a4');
 const role:Role=s.paint&&recipe!=='moderne'?'brick':recipe==='moderne'?'stucco':recipe==='cafe'?'wall':'stucco';
 // Shallow facade skin covers the source's inferred generic window rhythm.
 // Every skin is limited to an accepted wall/parcel segment; side/rear bodies stay.
 panel(b,f,role,w/2,y+h/2,.26,w,h,paint);
 if(recipe==='moderne'){
  panel(b,f,'stone',w/2,y+.50,.28,w,1.0,'#424843');
  for(const u of[.16,w-.16])b.box(f,'stone',u,y+1.75,.32,.32,3.5,.16,'#4a504a');
  for(let i=1;i<3;i++)b.box(f,'trim',w/2,y+h*i/3,.32,w,.11,.12,PALE);
 }
 if(ornate||recipe==='plain'||recipe==='apartments'||recipe==='moderne')cornice(b,f,w,s.top,ornate);
 else b.box(f,'metal',w/2,s.top-.10,.29,w,.18,.18,industrial?'#7b7d70':'#747a70');
 if(recipe==='weave'){
  const bays=Math.max(2,Math.floor(w/3.35)),bh=Math.min(4.2,h*.61),bottom=y+Math.max(.8,h-bh-1.0);
  for(let i=0;i<bays;i++){const u=(i+.5)*w/bays,ww=Math.min(2.18,w/bays-.58);segmental(b,f,u,bottom,ww,bh,i%7===5);if(h>6.8)panel(b,f,'recess',u,y+.65,.34,ww*.75,.72,DARK);}
  return;
 }
 if(recipe==='garage'||recipe==='warehouse'){
  const doors=recipe==='garage'?Math.max(1,Math.floor(w/7)):Math.max(1,Math.min(3,Math.floor(w/15))),ww=Math.min(3.5,w/(doors+1)*.65),dh=Math.min(3.5,h-.5);
  for(let i=0;i<doors;i++)garageDoor(b,f,(i+1)*w/(doors+1),y+.05,ww,dh);
  if(recipe==='garage'&&w<20)entrance(b,f,w*.18,y,.98,Math.min(2.2,h-.35),false);
  return;
 }
 const stories=Math.max(1,Math.min(s.stories,Math.floor(h/2.35))),floorHeight=h/stories;
 if(industrial){
  const bays=Math.max(2,Math.floor(w/4.3)),wh=Math.min(2.15,floorHeight-.92);
  for(let level=0;level<stories;level++)for(let i=0;i<bays;i++)pane(b,f,(i+.5)*w/bays,y+level*floorHeight+.55,Math.min(2.4,w/bays*.58),wh,.34,true);
  return;
 }
 if(recipe==='office'){
  const bays=Math.max(2,Math.floor(w/3.7)),wh=Math.min(1.85,floorHeight-.82),door=Math.min(2.25,floorHeight-.28);
  for(let level=0;level<stories;level++)for(let i=0;i<bays;i++){
   const u=(i+.5)*w/bays;if(level===0&&Math.abs(u-w/2)<1.45)continue;
   pane(b,f,u,y+level*floorHeight+.44,Math.min(1.65,w/bays*.56),wh);
  }
  entrance(b,f,w/2,y,1.20,door,true);return;
 }
 const shop=['classical','moderne','plain','apartments','market','parts','restaurant','retail','drive-through','bank','colonial'].includes(recipe);
 if(shop){
  const spans=recipe==='market'?2:Math.max(1,Math.min(5,Math.floor(w/7))),pitch=w/spans,dh=Math.min(2.35,floorHeight-.40),uEntry=recipe==='colonial'?w/2:pitch*.31;
  for(let i=0;i<spans;i++){
   const center=(i+.5)*pitch,width=Math.min(pitch*.71,5.7),yy=y+.54,wh=Math.min(1.85,floorHeight-.98);
   if(recipe==='colonial'&&Math.abs(center-uEntry)<2.0)continue;
   pane(b,f,center,yy,width,wh,.34,false);
  }
  entrance(b,f,uEntry,y,Math.min(1.6,pitch*.25),dh,['bank','market','restaurant','parts','drive-through'].includes(recipe));
  b.box(f,'trim',w/2,y+floorHeight-.20,.31,w,.17,.15,PALE);
  if(recipe==='colonial'){
   const ew=Math.min(3.4,w*.35),top=y+dh+.26;
   for(const sign of[-1,1])b.box(f,'trim',uEntry+sign*ew/2,y+dh/2,.35,.22,dh,.23,PALE);
   b.polygon(f,'trim',[[uEntry-ew/2-.2,top,.49],[uEntry+ew/2+.2,top,.49],[uEntry,Math.min(s.top-.25,top+.48),.49]],PALE);
  }
 }else {
  const doorU=w*.38;
  entrance(b,f,doorU,y,1.0,Math.min(2.25,floorHeight-.3),true);
  const bays=Math.max(2,Math.floor(w/3.6));
  for(let i=0;i<bays;i++){const u=(i+.5)*w/bays;if(Math.abs(u-doorU)<1.45)continue;pane(b,f,u,y+.55,Math.min(1.35,w/bays*.46),Math.min(1.75,floorHeight-.90));}
 }
 for(let level=1;level<stories;level++){
  const bays=Math.max(2,Math.floor(w/(recipe==='cafe'?3.6:3.15))),wh=Math.min(2.20,floorHeight-.85);
  for(let i=0;i<bays;i++){const u=(i+.5)*w/bays;pane(b,f,u,y+level*floorHeight+.34,Math.min(1.48,w/bays*.48),wh);if(ornate)b.box(f,'stone',u,y+level*floorHeight+wh+.50,.37,Math.min(1.76,w/bays*.61),.17,.17,PALE);}
 }
 if(ornate)for(const u of[.19,w-.19]){b.box(f,'trim',u,y+h/2,.30,.24,h-.2,.14,PALE);b.box(f,'trim',u,s.top-.52,.35,.38,.18,.20,PALE);}
}

function lakeNameLetters(r:Row,origin:readonly number[]):THREE.Mesh {
 const s=r.frames[0],f=frame(r,s),w=s.width*.93,h=Math.min(.9,r.peak-s.top-.10),y=s.top+.08+h/2;
 let texture:THREE.Texture;
 if(typeof document==='undefined')texture=new THREE.DataTexture(new Uint8Array([216,183,83,255]),1,1);
 else{
  const canvas=document.createElement('canvas');canvas.width=4096;canvas.height=128;const ctx=canvas.getContext('2d');
  if(ctx){ctx.fillStyle='#d8b753';ctx.font='600 88px Georgia, serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('Lake CHARGOGGAGOGGMANCHAUGGAGOGGCHAUBUNAGUNGAMAUGG',2048,66,4060);}
  texture=ctx?new THREE.CanvasTexture(canvas):new THREE.DataTexture(new Uint8Array([216,183,83,255]),1,1);
 }
 texture.colorSpace=THREE.SRGBColorSpace;texture.userData.sourceUrl='town-generated:lake-name-plaza-lettering-v1';texture.needsUpdate=true;
 const material=new THREE.MeshStandardMaterial({map:texture,transparent:true,alphaTest:.35,roughness:.73,side:THREE.DoubleSide});material.name='Commercial research | lake-name original lettering';material.userData.townCrafted=true;
 const geometry=new THREE.PlaneGeometry(w,h),p=geometry.getAttribute('position'),n=geometry.getAttribute('normal'),uv=geometry.getAttribute('uv');
 // Facade tangent follows the polygon perimeter. From outside this northeast
 // wall it points screen-left, so the original lettering needs reversed U.
 const tangentPointsLeft=f.tangent[0]*f.outward[1]-f.tangent[1]*f.outward[0]>0;
 for(let i=0;i<p.count;i++){
  const u=s.width/2+p.getX(i),height=y+p.getY(i),v=.20;
  p.setXYZ(i,f.start[0]+f.tangent[0]*u+f.outward[0]*v-origin[0],height-origin[1],-f.start[1]-f.tangent[1]*u-f.outward[1]*v-origin[2]);n.setXYZ(i,f.outward[0],0,-f.outward[1]);
  if(tangentPointsLeft)uv.setX(i,1-uv.getX(i));
 }
 // PlaneGeometry's local facing flips for one east/north frame orientation.
 if(f.outward[0]*f.tangent[1]-f.tangent[0]*f.outward[1]<0){const ix=geometry.index!;for(let i=0;i<ix.count;i+=3){const a=ix.getX(i+1);ix.setX(i+1,ix.getX(i+2));ix.setX(i+2,a);}}
 const flat=geometry.toNonIndexed();geometry.dispose();flat.computeBoundingBox();flat.computeBoundingSphere();
 const mesh=new THREE.Mesh(flat,material);mesh.name='Commercial research | lake-name letters';mesh.userData.townCrafted=true;mesh.userData.sourceIds=['LK-006'];return mesh;
}
function buildSplitBody(b:Batch,r:Row):void {
 for(const part of r.bodyParts){
  const points=part.outline,area=points.reduce((s,a,i)=>{const c=points[(i+1)%points.length];return s+a[0]*c[1]-c[0]*a[1];},0);
  for(let i=0;i<points.length;i++){
   const a=points[i],c=points[(i+1)%points.length],dx=c[0]-a[0],dy=c[1]-a[1],width=Math.hypot(dx,dy);if(width<1e-6)continue;
   const f:Frame={start:a,tangent:[dx/width,dy/width],outward:area<0?[-dy/width,dx/width]:[dy/width,-dx/width],structId:r.id,tileId:r.tileId};
   b.box(f,'brick',width/2,(r.base+part.eave)/2,-.05,width,part.eave-r.base,.10,part.paint);
   b.box(f,'metal',width/2,part.eave+.04,.005,width,.11,.18,'#777a6c');
   // Secondary elevations follow each wing's own eave, never the tall neighbor.
   if(f.outward[1]>.5&&width>4){const bays=Math.max(1,Math.floor(width/3.6)),levels=part.id==='gilles-rear'?1:part.id==='tiffany'?3:2,fh=(part.eave-r.floor)/levels;
    for(let level=0;level<levels;level++)for(let j=0;j<bays;j++)pane(b,f,(j+.5)*width/bays,r.floor+level*fh+.45,Math.min(1.3,width/bays*.45),Math.min(1.85,fh-.85),.10);}
  }
  const f:Frame={start:[0,0],tangent:[1,0],outward:[0,1],structId:r.id,tileId:r.tileId};
  const tris=THREE.ShapeUtils.triangulateShape(points.map(p=>new THREE.Vector2(p[0],p[1])),[]);
  for(const tri of tris){const roof=tri.map(i=>[points[i][0],part.eave,points[i][1]]);const n=new THREE.Vector3().fromArray(roof[1]).sub(new THREE.Vector3().fromArray(roof[0])).cross(new THREE.Vector3().fromArray(roof[2]).sub(new THREE.Vector3().fromArray(roof[0])));if(n.y<0)roof.reverse();b.polygon(f,'roof',roof,'#62695f');}
 }
}
/** Before general building evidence (which recolors V2 walls), then pooling. */
export function applyCommercialCompletion(group:THREE.Group,tileId:string,origin:readonly number[],level:number,sourceSha256:string):CommercialReport|undefined {
 const rows=data.rows.filter(r=>r.tileId===tileId);if(!rows.length)return;
 if(group.userData.commercialCompletion)return group.userData.commercialCompletion;
 const reject=():CommercialReport=>({status:'source-mismatch',ids:[],buildingIds:[],facades:0,triangles:0,meshes:0,geometryBytes:0,removedTriangles:0});
 if(origin.length!==3||!origin.every(Number.isFinite)||rows.some(r=>r.lods.find(l=>l.level===level)?.sha256!==sourceSha256||r.origin.some((v,i)=>Math.abs(v-origin[i])>.001)))return reject();
 group.updateMatrixWorld(true);
 const matched=new Set<string>(),p=new THREE.Vector3();
 group.traverse(o=>{
  if(!(o instanceof THREE.Mesh)||o.userData.townCrafted)return;
  const materials=Array.isArray(o.material)?o.material:[o.material];if(!materials.some(m=>m.name.startsWith('V2 inferred | ')||m.name.startsWith('Crafted frontage | ')))return;
  const pos=o.geometry.getAttribute('position');if(!pos)return;
  for(const r of rows){if(matched.has(r.id))continue;for(let i=0;i<pos.count;i++){
   p.fromBufferAttribute(pos,i).applyMatrix4(o.matrixWorld);const east=p.x+origin[0],north=-p.z-origin[2],height=p.y+origin[1];
   if(height<r.base-.1||height>r.peak+.3)continue;
   if(planDistanceSquared(r.outline,east,north)<.05*.05){matched.add(r.id);break;}
  }}
 });
 const selected=rows.filter(r=>matched.has(r.id));if(!selected.length)return reject();
 const replacement=selected.filter(r=>r.bodyParts.length),vector=new THREE.Vector3(...origin);
 const filtered=replacement.length?filterEvidenceSources(group,vector,replacement.map(r=>({...r,replaceBody:true}))):{removedTriangles:0};
 const b=new Batch(vector,level);for(const r of selected){if(r.bodyParts.length)buildSplitBody(b,r);for(const f of r.frames)buildFacade(b,r,f);}
 const result=b.finish();result.group.name='Commercial research completion';result.group.userData.townCrafted=true;result.group.userData.evidenceVersion=data.version;
 let extraTriangles=0,extraBytes=0;for(const r of selected)if(r.frames.some(f=>f.recipe==='lake-plaza')){const letters=lakeNameLetters(r,origin);result.group.add(letters);extraTriangles+=2;for(const a of Object.values(letters.geometry.attributes)as THREE.BufferAttribute[])extraBytes+=a.array.byteLength;}
 result.group.traverse(o=>{if(!(o instanceof THREE.Mesh))return;o.name=o.name.replace('Crafted building frontage','Commercial research');o.userData.category='commercial-completion';o.userData.townCrafted=true;});
 group.add(result.group);
 const report:CommercialReport={status:'applied',ids:selected.flatMap(r=>r.frames.map(f=>f.id)).filter((id,i,all)=>all.indexOf(id)===i),buildingIds:selected.map(r=>r.id),facades:selected.reduce((n,r)=>n+r.frames.length,0),triangles:result.triangles+extraTriangles,meshes:result.group.children.length,geometryBytes:result.bytes+extraBytes,removedTriangles:filtered.removedTriangles};
 group.userData.commercialCompletion=report;return report;
}
