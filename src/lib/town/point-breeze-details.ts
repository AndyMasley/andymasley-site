import * as THREE from 'three';
import catalog from '../../../data/derived/town/point-breeze-details.json';
import release from '../../../data/derived/town/release.json';
import {Batch,type Frame,type Role} from './crafted-frontages';

export const POINT_BREEZE_DETAILS=catalog;
type SurfaceFrame=typeof catalog.frame;
type Retirement={mesh:THREE.Mesh;remove:Set<number>};
type WindowBounds={left:number;right:number;bottom:number;top:number};
export type PointBreezeReport={status:'applied'|'source-mismatch'|'no-support'|'no-source';ids:string[];removedTriangles:number;formerEntryTriangles:number;notchWindowTriangles:number;triangles:number;meshes:number;geometryBytes:number;floor:number;postGround:number[];shutterPairs:number};
const palette=catalog.appearance,d=catalog.dimensions;
const frame:Frame={...catalog.frame,structId:catalog.id,tileId:catalog.tileId};
function worldPoint(f:SurfaceFrame,u:number,v:number):number[]{return[f.start[0]+f.tangent[0]*u+f.outward[0]*v,f.start[1]+f.tangent[1]*u+f.outward[1]*v];}
function polygon(b:Batch,role:Role,u:number,y:number,v:number,w:number,h:number,color:string){b.polygon(frame,role,[[u-w/2,y,v],[u+w/2,y,v],[u+w/2,y+h,v],[u-w/2,y+h,v]],color);}

/** Sample only retained terrain; no wall, road, or guessed constant floor can
 * become support. The assembly group is still detached from the visible world. */
function terrainHeights(group:THREE.Group,origin:THREE.Vector3,points:number[][]):(number|undefined)[]{
  const heights=points.map(()=>undefined as number|undefined),p=new THREE.Vector3();
  group.updateMatrixWorld(true);const inverse=group.matrixWorld.clone().invert();
  group.traverse(o=>{
    if(!(o instanceof THREE.Mesh)||o.userData.townCrafted||!/^terrain(?:\b|_)/i.test(o.name))return;
    const g=o.geometry,a=g.getAttribute('position'),ix=g.index;if(!a)return;
    const matrix=inverse.clone().multiply(o.matrixWorld),count=ix?.count??a.count;
    for(let i=0;i<count;i+=3){
      const t=[0,1,2].map(k=>{p.fromBufferAttribute(a,ix?ix.getX(i+k):i+k).applyMatrix4(matrix).add(origin);return[p.x,-p.z,p.y];});
      const[a0,b,c]=t,det=(b[1]-c[1])*(a0[0]-c[0])+(c[0]-b[0])*(a0[1]-c[1]);if(Math.abs(det)<1e-9)continue;
      for(let j=0;j<points.length;j++){
        if(heights[j]!==undefined)continue;const[x,n]=points[j];
        const u=((b[1]-c[1])*(x-c[0])+(c[0]-b[0])*(n-c[1]))/det,v=((c[1]-a0[1])*(x-c[0])+(a0[0]-c[0])*(n-c[1]))/det;
        if(u>=-1e-7&&v>=-1e-7&&u+v<=1+1e-7)heights[j]=u*a0[2]+v*b[2]+(1-u-v)*c[2];
      }
    }
  });return heights;
}

function retirementPlan(group:THREE.Group,origin:THREE.Vector3,floor:number){
  const changes:Retirement[]=[],point=new THREE.Vector3(),wingTriangles:WindowBounds[]=[];let former=0,notch=0,doors=0,windows=0;
  group.updateMatrixWorld(true);const inverse=group.matrixWorld.clone().invert();
  group.traverse(o=>{
    if(!(o instanceof THREE.Mesh)||o.userData.townCrafted)return;
    const g=o.geometry,p=g.getAttribute('position'),ix=g.index;if(!p)return;
    const materials=Array.isArray(o.material)?o.material:[o.material],count=ix?.count??p.count,matrix=inverse.clone().multiply(o.matrixWorld),remove=new Set<number>();
    const contains=(f:SurfaceFrame,uLimit:number,bottom:number,top:number,at:number)=>{
      point.fromBufferAttribute(p,ix?ix.getX(at):at).applyMatrix4(matrix).add(origin);
      const dx=point.x-f.start[0],dn=-point.z-f.start[1],u=dx*f.tangent[0]+dn*f.tangent[1],v=dx*f.outward[0]+dn*f.outward[1];
      return Math.abs(u)<=uLimit&&v>=-.06&&v<=.25&&point.y>=bottom&&point.y<=top;
    };
    for(const part of g.groups.length?g.groups:[{start:0,count,materialIndex:0}]){
      const role=materials[part.materialIndex??0]?.name;
      if(!/^V2 inferred \| (trim|glass|door)$/.test(role??''))continue;
      for(let i=part.start;i<Math.min(count,part.start+part.count);i+=3){
        if(role==='V2 inferred | glass'&&[0,1,2].every(k=>contains(catalog.southWing,catalog.southWing.width/2,catalog.southWing.floor,catalog.southWing.top,i+k))){
          const ps=[0,1,2].map(k=>{point.fromBufferAttribute(p,ix?ix.getX(i+k):i+k).applyMatrix4(matrix).add(origin);return[(point.x-catalog.southWing.start[0])*catalog.southWing.tangent[0]+(-point.z-catalog.southWing.start[1])*catalog.southWing.tangent[1],point.y];});
          wingTriangles.push({left:Math.min(...ps.map(p=>p[0])),right:Math.max(...ps.map(p=>p[0])),bottom:Math.min(...ps.map(p=>p[1])),top:Math.max(...ps.map(p=>p[1]))});
        }
        // Whole entry triangles only. No centroid clipping of native walls or
        // shared neighboring windows, and no retired foundation/step geometry.
        if([0,1,2].every(k=>contains(catalog.former,.66,catalog.former.floor-.061,catalog.former.floor+2.25,i+k))){remove.add(i);former++;if(role==='V2 inferred | door')doors++;}
        else if([0,1,2].every(k=>contains(catalog.frame,catalog.frame.width/2+.02,floor-.10,Math.min(catalog.sourceEave,floor+2.7),i+k))){remove.add(i);notch++;if(role==='V2 inferred | glass')windows++;}
      }
    }
    if(remove.size)changes.push({mesh:o,remove});
  });
  // Front/back glass triangles share the same projected rectangle. Merge only
  // touching panes; do not impose a new inferred window count on this wing.
  const wingWindows:WindowBounds[]=[];
  for(const t of wingTriangles){
    const connected=wingWindows.filter(w=>t.left<=w.right+.001&&t.right>=w.left-.001&&t.bottom<=w.top+.001&&t.top>=w.bottom-.001);
    if(!connected.length){wingWindows.push({...t});continue;}
    const merged={left:Math.min(t.left,...connected.map(w=>w.left)),right:Math.max(t.right,...connected.map(w=>w.right)),bottom:Math.min(t.bottom,...connected.map(w=>w.bottom)),top:Math.max(t.top,...connected.map(w=>w.top))};
    for(const w of connected)wingWindows.splice(wingWindows.indexOf(w),1);wingWindows.push(merged);
  }
  const layoutValid=changes.every(({mesh})=>Object.values(mesh.geometry.attributes).every(a=>a instanceof THREE.BufferAttribute&&a.array instanceof Float32Array&&!a.normalized));
  return{changes,former,notch,wingWindows:wingWindows.filter(w=>w.right-w.left>.5&&w.right-w.left<2.0&&w.top-w.bottom>.7&&w.top-w.bottom<2.3),layoutValid,qualified:doors>=2&&windows>=2};
}

/** Retire only the preflighted entry/window triangles; copy retained attribute
 * values before disposal so original source buffers and other materials survive. */
function retire(group:THREE.Group,changes:Retirement[]){
  const retired=new Set<THREE.BufferGeometry>(),oldMaterials=new Set<THREE.Material>();
  for(const{mesh,remove}of changes){
    const g=mesh.geometry,p=g.getAttribute('position'),ix=g.index,count=ix?.count??p.count,materials=Array.isArray(mesh.material)?mesh.material:[mesh.material];
    const parts=g.groups.length?g.groups:[{start:0,count,materialIndex:0}],kept:{material:number;ids:number[]}[]=[];
    for(const part of parts){const ids:number[]=[];for(let i=part.start;i<Math.min(count,part.start+part.count);i+=3)if(!remove.has(i))for(let k=0;k<3;k++)ids.push(ix?ix.getX(i+k):i+k);if(ids.length)kept.push({material:part.materialIndex??0,ids});}
    retired.add(g);materials.forEach(m=>oldMaterials.add(m));
    if(!kept.length){mesh.removeFromParent();continue;}
    const next=new THREE.BufferGeometry(),indices:number[]=[],sources:number[]=[],remap=new Map<number,number>(),used:THREE.Material[]=[];
    for(const part of kept){const start=indices.length;for(const old of part.ids){let id=remap.get(old);if(id===undefined){id=remap.size;remap.set(old,id);sources.push(old);}indices.push(id);}next.addGroup(start,indices.length-start,used.length);used.push(materials[part.material]);}
    for(const[name,a]of Object.entries(g.attributes)){
      const values=new Float32Array(sources.length*a.itemSize);
      for(let i=0;i<sources.length;i++)for(let k=0;k<a.itemSize;k++)values[i*a.itemSize+k]=(a as THREE.BufferAttribute).array[sources[i]*a.itemSize+k];
      next.setAttribute(name,new THREE.BufferAttribute(values,a.itemSize,a.normalized));
    }
    next.setIndex(indices);next.computeBoundingBox();next.computeBoundingSphere();next.userData={...g.userData,pointBreezeEntryRetirement:true};mesh.geometry=next;mesh.material=used;
  }
  const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>(),textures=new Set<THREE.Texture>();
  group.traverse(o=>{if(o instanceof THREE.Mesh){geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material]){materials.add(m);for(const v of Object.values(m))if(v instanceof THREE.Texture)textures.add(v);}}});
  for(const g of retired)if(!geometries.has(g))g.dispose();
  const discarded=new Set<THREE.Texture>();for(const m of oldMaterials)if(!materials.has(m)){for(const v of Object.values(m))if(v instanceof THREE.Texture&&!textures.has(v))discarded.add(v);m.dispose();}discarded.forEach(t=>t.dispose());
}

function lettering(origin:THREE.Vector3,y:number):THREE.Mesh{
  let texture:THREE.Texture;
  if(typeof document==='undefined')texture=new THREE.DataTexture(new Uint8Array([242,242,232,255]),1,1);
  else{
    const canvas=document.createElement('canvas');canvas.width=512;canvas.height=64;const ctx=canvas.getContext('2d');
    if(ctx){ctx.font='600 42px Georgia, serif';ctx.fillStyle='#f2f2e8';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('Point Breeze',256,34,490);}
    texture=ctx?new THREE.CanvasTexture(canvas):new THREE.DataTexture(new Uint8Array([242,242,232,255]),1,1);
  }
  texture.colorSpace=THREE.SRGBColorSpace;texture.userData.sourceUrl='town-generated:point-breeze-canopy-letters-v1';texture.needsUpdate=true;
  const material=new THREE.MeshStandardMaterial({map:texture,alphaTest:.45,roughness:.9});material.name='Point Breeze | original canopy lettering';material.userData.townCrafted=true;
  const g=new THREE.PlaneGeometry(1.47,.17),p=g.getAttribute('position'),n=g.getAttribute('normal'),uv=g.getAttribute('uv');
  const tangentPointsLeft=frame.tangent[0]*frame.outward[1]-frame.tangent[1]*frame.outward[0]>0;
  for(let i=0;i<p.count;i++){const q=worldPoint(catalog.frame,p.getX(i),d.canopyProjection+.006);p.setXYZ(i,q[0]-origin.x,y+p.getY(i)-origin.y,-q[1]-origin.z);n.setXYZ(i,frame.outward[0],0,-frame.outward[1]);if(tangentPointsLeft)uv.setX(i,1-uv.getX(i));}
  if(frame.outward[0]*frame.tangent[1]-frame.tangent[0]*frame.outward[1]<0){const ix=g.index!;for(let i=0;i<ix.count;i+=3){const a=ix.getX(i+1);ix.setX(i+1,ix.getX(i+2));ix.setX(i+2,a);}}
  g.computeBoundingBox();g.computeBoundingSphere();const mesh=new THREE.Mesh(g,material);mesh.name='Point Breeze canopy lettering';mesh.userData.townCrafted=true;mesh.userData.sourceIds=[catalog.id];return mesh;
}

function build(origin:THREE.Vector3,level:number,floor:number,thresholdBottom:number,postGround:number[],wingWindows:WindowBounds[]){
  const batch=new Batch(origin,level),half=d.canopyWidth/2,crown=catalog.sourceEave+d.canopyCrownOverEave,spring=crown-d.canopyRise,steps=level===2?10:18,front=d.canopyProjection,back=.08;
  polygon(batch,'wall',0,floor,.132,catalog.frame.width,catalog.sourceEave-floor,palette.wall);
  polygon(batch,'recess',0,floor,.151,d.doorWidth+.12,d.doorHeight+.08,palette.door);
  for(const side of[-1,1]){
    const u=side*d.doorWidth/4;
    polygon(batch,'door',u,floor,.165,d.doorWidth/2-.035,d.doorHeight,palette.door);
    polygon(batch,'glass',u,floor+.30,.186,d.doorWidth/2-.15,d.doorHeight-.42,palette.glass);
    batch.box(frame,'metal',side*.075,floor+1.03,.208,.025,.38,.027,palette.frame);
  }
  for(const u of[-d.doorWidth/2,0,d.doorWidth/2])batch.box(frame,'metal',u,floor+d.doorHeight/2,.20,.047,d.doorHeight,.045,palette.frame);
  batch.box(frame,'metal',0,floor+d.doorHeight+.027,.20,d.doorWidth+.1,.055,.065,palette.frame);
  batch.box(frame,'stone',0,(floor+thresholdBottom)/2,.125,d.thresholdWidth,floor-thresholdBottom,d.thresholdDepth,'#b9b8ad');
  const arc=(i:number,drop=0)=>{const a=i*Math.PI/steps;return[-half*Math.cos(a),spring+d.canopyRise*Math.sin(a)-drop];};
  for(let i=0;i<steps;i++){
    const[a,h]=arc(i),[c,k]=arc(i+1);
    batch.polygon(frame,'trim',[[a,h,front],[c,k,front],[c,k,back],[a,h,back]],palette.blue);
    batch.polygon(frame,'trim',[[a,h-.028,back],[c,k-.028,back],[c,k-.028,front],[a,h-.028,front]],palette.blue);
    batch.polygon(frame,'trim',[[a,spring-.07,front],[c,spring-.07,front],[c,k,front],[a,h,front]],palette.blue);
    batch.polygon(frame,'trim',[[a,h,back],[c,k,back],[c,k-.028,back],[a,h-.028,back]],palette.blue);
  }
  for(const side of[-1,1]){
    const u=side*d.postU,top=spring+d.canopyRise*Math.sqrt(1-(u/half)**2)-.03,bottom=postGround[side<0?0:1]-.008;
    batch.box(frame,'metal',u,(top+bottom)/2,d.postV,d.postWidth,top-bottom,d.postWidth,palette.frame);
    batch.box(frame,'trim',side*half,spring-.025,(front+back)/2,.035,.05,front-back,palette.blue);
  }
  if(wingWindows.length){
    const wing:Frame={...catalog.southWing,structId:catalog.id,tileId:catalog.tileId},halfWidth=catalog.southWing.width/2;
    // This shallow white skin remains behind every retained native window.
    batch.polygon(wing,'wall',[[-halfWidth,catalog.southWing.floor,.007],[halfWidth,catalog.southWing.floor,.007],[halfWidth,catalog.southWing.top,.007],[-halfWidth,catalog.southWing.top,.007]],palette.wall);
    for(const w of wingWindows){
      const u=(w.left+w.right)/2,h=w.top-w.bottom,y=(w.bottom+w.top)/2;
      for(const side of[-1,1])batch.box(wing,'trim',u+side*((w.right-w.left)/2+.205),y,.106,.30,h+.08,.045,'#233c60');
      for(const x of[w.left-.027,w.right+.027])batch.box(wing,'trim',x,y,.124,.055,h+.11,.033,palette.wall);
      for(const y of[w.bottom-.028,(w.bottom+w.top)/2,w.top+.028])batch.box(wing,'trim',u,y,.128,w.right-w.left+.11,.055,.031,palette.wall);
    }
  }
  const result=batch.finish();result.group.name='Point Breeze registered notch entrance';
  result.group.traverse(o=>{
    if(!(o instanceof THREE.Mesh))return;o.userData.category='point-breeze-details';
    const m=o.material as THREE.MeshStandardMaterial;
    if(m.color.getHexString()===palette.blue.slice(1)){m.metalness=0;m.roughness=.9;m.name='Point Breeze | authored blue canvas';m.userData.surfaceRole='canvas';}
    m.userData.appearanceBasis=catalog.inference;
  });
  const letters=lettering(origin,spring+.24);result.group.add(letters);
  const bytes=Object.values(letters.geometry.attributes).reduce((sum,a)=>sum+a.array.byteLength,letters.geometry.index?.array.byteLength??0);
  return{...result,triangles:result.triangles+2,bytes:result.bytes+bytes};
}

export function applyPointBreezeDetails(group:THREE.Group,tileId:string,origin:readonly number[],level:number,sourceSha256:string):PointBreezeReport|undefined{
  if(tileId!==catalog.tileId)return;
  const empty=(status:PointBreezeReport['status']):PointBreezeReport=>({status,ids:[],removedTriangles:0,formerEntryTriangles:0,notchWindowTriangles:0,triangles:0,meshes:0,geometryBytes:0,floor:0,postGround:[],shutterPairs:0});
  if(catalog.sourceManifestSha256!==release.manifestSha256||catalog.lods.find(l=>l.level===level)?.sha256!==sourceSha256||origin.length!==3||origin.some((v,i)=>!Number.isFinite(v)||Math.abs(v-catalog.origin[i])>1e-6))return empty('source-mismatch');
  if(group.userData.pointBreezeDetails)return group.userData.pointBreezeDetails;
  const at=new THREE.Vector3().fromArray(origin),samples:number[][]=[];
  for(const u of[-d.thresholdWidth/2,d.thresholdWidth/2])for(const v of[.005,.245])samples.push(worldPoint(catalog.frame,u,v));
  for(const side of[-1,1])for(const du of[-d.postWidth/2,d.postWidth/2])for(const dv of[-d.postWidth/2,d.postWidth/2])samples.push(worldPoint(catalog.frame,side*d.postU+du,d.postV+dv));
  const heights=terrainHeights(group,at,samples);
  if(heights.some(y=>y===undefined))return empty('no-support');
  const hs=heights as number[],floor=Math.max(...hs.slice(0,4))+.024,postGround=[Math.min(...hs.slice(4,8)),Math.min(...hs.slice(8,12))];
  if(Math.max(...hs)-Math.min(...hs)>.65||catalog.sourceEave-floor<2.65||catalog.sourceEave-floor>4.5)return empty('no-support');
  const planned=retirementPlan(group,at,floor);if(!planned.layoutValid)return empty('source-mismatch');if(!planned.qualified)return empty('no-source');
  const built=build(at,level,floor,Math.min(...hs.slice(0,4))-.008,postGround,planned.wingWindows);retire(group,planned.changes);group.add(built.group);
  const report:PointBreezeReport={status:'applied',ids:[catalog.id],removedTriangles:planned.former+planned.notch,notchWindowTriangles:planned.notch,formerEntryTriangles:planned.former,triangles:built.triangles,meshes:built.group.children.length,geometryBytes:built.bytes,floor,postGround,shutterPairs:planned.wingWindows.length};
  group.userData.pointBreezeDetails=report;return report;
}
