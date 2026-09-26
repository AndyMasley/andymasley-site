import * as THREE from 'three';
import { Batch, frontageMaterial, type Frame, type Role } from './crafted-frontages';
import type { EvidenceBuilding, EvidenceReport, EvidenceRoof, PhotoLayout, SetbackWall } from './evidence-types';
import { historicAppearance } from './historic-appearance';
import {prepareAddressFrontages,insideFormerEntrySteps,renderAddressStoop,tileGround,type EntryStepEnvelope} from './address-frontage';
import { measuredBody, setbackWalls, roofHeight, isMeasuredOther, isPhotographedHouse, type FrontLayout, type MeasuredRoof, type MeasuredOther, type PhotographedHouse } from './measured-roofs';

/** Measured walls stand this far inside the roofprint, under the eaves. */
export const MEASURED_WALL_INSET = .32;

/** A measured house keeps its mapped plan, entry and paint; frames move in
 * under the eaves and take the measured wall-top heights for their windows. */
function measuredHome(home:EvidenceBuilding,roof:MeasuredRoof):EvidenceBuilding{
  const d=MEASURED_WALL_INSET,valid=roof.e.filter((e):e is number=>e!==null&&e>home.floor+.5);
  let frames=home.frames.map((f,i)=>{
    const width=Math.max(.1,f.width-2*d),top=roof.ep?.[i];
    const profile=top==null?undefined:typeof top==='number'?[[0,roof.b+top],[width,roof.b+top]] as const:top.map(([u,h])=>[u,roof.b+h] as const);
    const eave=profile?Math.min(...profile.map(p=>p[1])):roof.e[i]??f.eave??home.eave;
    return{...f,width,eave,...(profile?{profile}:{}),
      start:[f.start[0]+f.tangent[0]*d-f.outward[0]*d,f.start[1]+f.tangent[1]*d-f.outward[1]*d] as const};
  });
  let entry=home.entry?{...home.entry,u:Math.max(0,Math.min(frames[home.entry.frameIndex].width,home.entry.u-d))}:home.entry;
  let openPorch:EvidenceBuilding['openPorch'];
  if(roof.pp&&roof.pp.f<frames.length){
    // The open porch cut from the body: along each strip the house wall behind
    // it takes the porch front's place, beside what is left of that front.
    const at=roof.pp.f,front=frames[at],w=front.width;
    const piece=(a:number,b:number,back:number,profile:readonly (readonly [number,number])[]|undefined)=>({...front,width:b-a,groundAt:undefined,
      start:[front.start[0]+front.tangent[0]*a-front.outward[0]*back,front.start[1]+front.tangent[1]*a-front.outward[1]*back] as const,
      ...(profile?{profile,eave:Math.min(...profile.map(p=>p[1]))}:{})});
    const slice=(a:number,b:number)=>front.profile?[[0,wallTop(front.profile,a)],...front.profile.filter(([u])=>u>a&&u<b).map(([u,h])=>[u-a,h] as const),[b-a,wallTop(front.profile,b)]] as const:undefined;
    const pieces:{frame:typeof front;a:number;b:number;depth?:number}[]=[];let cursor=0;
    for(const [u0,u1,depth,t]of roof.pp.s){
      if(u0-cursor>.3)pieces.push({frame:piece(cursor,u0,0,slice(cursor,u0)),a:cursor,b:u0});
      pieces.push({frame:piece(u0,u1,depth,t.map(([u,h])=>[u,roof.b+h] as const)),a:u0,b:u1,depth});cursor=u1;
    }
    if(w-cursor>.3)pieces.push({frame:piece(cursor,w,0,slice(cursor,w)),a:cursor,b:w});
    frames=[...frames.slice(0,at),...pieces.map(p=>p.frame),...frames.slice(at+1)];
    if(entry){
      if(entry.frameIndex===at){
        const k=Math.max(0,pieces.findIndex(p=>entry!.u<p.b+.01)),p=pieces[k];
        entry={...entry,frameIndex:at+k,u:Math.max(.6,Math.min(p.b-p.a-.6,entry.u-p.a))};
      }else if(entry.frameIndex>at)entry={...entry,frameIndex:entry.frameIndex+pieces.length-1};
    }
    const strips=pieces.flatMap((p,k)=>p.depth===undefined?[]:[{frameIndex:at+k,depth:p.depth}]);
    openPorch={front:{start:front.start,tangent:front.tangent,outward:front.outward,u0:roof.pp.s[0][0],u1:roof.pp.s[roof.pp.s.length-1][1]},strips,ceiling:roof.b+roof.pp.c};
  }
  const eave=valid.length?Math.max(home.floor+.7,Math.min(...valid)):home.eave;
  // Storeys follow the tallest measured wall, so an upper floor the assessor
  // record omits still gets its windows (each is kept under its wall top).
  const tops=[...valid,...frames.flatMap(f=>f.profile?.map(p=>p[1])??[])];
  const stories=Math.max(home.stories,tops.length?Math.min(4,Math.floor((Math.max(...tops)-home.floor+.35)/2.7)):0);
  const setbacks=setbackWalls(roof,frames);
  // A photographed enclosed porch the plan holds as its whole front: the entry
  // wall a storey tall on a taller house, the house wall rising behind it from
  // the porch roof. Its walls take a sunporch's band of windows.
  let enclosed=false;
  if(roof.f?.porch==='enclosed'&&entry&&!openPorch){
    const front=frames[entry.frameIndex],top=(f:typeof front)=>f.profile?Math.max(...f.profile.map(p=>p[1])):f.eave??home.eave,low=top(front);
    const tallest=Math.max(...frames.map(top));
    enclosed=low-home.floor>=2.1&&low-home.floor<=3.6&&tallest-home.floor>=4.5&&setbacks.some(s=>{
      if(s.outward[0]*front.outward[0]+s.outward[1]*front.outward[1]<.99)return false;
      const back=(front.start[0]-s.start[0])*front.outward[0]+(front.start[1]-s.start[1])*front.outward[1];
      let bottom=Infinity;for(let i=1;i<s.outline.length;i+=2)bottom=Math.min(bottom,s.outline[i]);
      return back>.8&&back<3.8&&bottom>=low-.3&&bottom<=low+1.8;
    });
  }
  return{...photographedHome(home,roof),frames,entry,eave,stories,peak:Math.max(roof.p,eave+.1),measured:true,setbacks,
    roofSurface:{o:roof.o,b:roof.b,v:roof.v,r:roof.r,...(roof.rc?{color:roof.rc}:{})},...(openPorch?{openPorch}:{}),...(enclosed?{porchInPlan:true}:{})};
}

/** What a house's street photograph shows: siding and trim colours, door,
 * shutters, wall material, window bays, front porch and garage doors. */
function photographedHome(home:EvidenceBuilding,photo:Pick<MeasuredRoof,'wc'|'tc'|'f'>):EvidenceBuilding{
  const seen=photo.f,front=home.entry&&home.frames[home.entry.frameIndex];
  // An entry bay standing 1-3.5 m proud of a parallel front wall is itself the
  // porch when the photograph shows it enclosed.
  const bay=!!front&&home.frames.some(g=>g!==front&&g.outward[0]*front.outward[0]+g.outward[1]*front.outward[1]>.996&&
    (()=>{const off=(g.start[0]-front.start[0])*front.outward[0]+(g.start[1]-front.start[1])*front.outward[1];return off<-1&&off>-3.5;})());
  const porchInPlan=bay&&(seen?.porch==='enclosed'||(seen?.porch==='stacked'&&seen.upper==='enclosed'));
  return{...home,...(porchInPlan?{porchInPlan}:{}),paint:photo.wc??home.paint,
    ...(photo.tc?{trim:photo.tc}:{}),...(seen?.door?{door:seen.door}:{}),...(seen?{shutters:!!seen.shutters,...(seen.shutters?{shutterColor:seen.shutters}:{})}:{}),
    ...(seen?.material?{material:seen.material}:{}),...(seen?.bays?{frontageBays:seen.bays}:{}),
    ...(seen?.porch&&seen.porch!=='none'&&home.entry?{porch:seen.porch,porchPlacement:'front' as const}:{}),
    ...(seen?.porch==='stacked'?{porchSide:seen.side,porchGround:seen.ground,porchUpper:seen.upper,porchLevels:seen.levels}:{}),
    ...(seen?.gd&&seen.gs?{garage:{doors:seen.gd,side:seen.gs,...(seen.gc?{color:seen.gc}:{})}}:{})};
}

/** The street front a photograph shows: the frames facing the same way as the
 * front, from 3 m before its wall to 6 m behind, and their span along it (the
 * photograph's left end is the low end). `at` finds the frontmost of them
 * holding a stretch `half` either side of a point along the span. */
export function streetFront(home:EvidenceBuilding):{frames:number[];a0:number;a1:number;at:(a:number,half:number)=>{frameIndex:number;u:number}|undefined}|undefined{
  const front=home.frames.find(f=>f.front)??(home.entry?home.frames[home.entry.frameIndex]:undefined);if(!front)return undefined;
  const o=front.outward,t=front.tangent,depth=(f:typeof front)=>(f.start[0]-front.start[0])*o[0]+(f.start[1]-front.start[1])*o[1];
  const frames=home.frames.flatMap((f,i)=>f.width>=.4&&f.outward[0]*o[0]+f.outward[1]*o[1]>.95&&depth(f)>-6&&depth(f)<3?[i]:[]);
  if(!frames.length)return undefined;
  const span=(i:number)=>{const f=home.frames[i],a=f.start[0]*t[0]+f.start[1]*t[1];return[a,a+f.width] as const;};
  const a0=Math.min(...frames.map(i=>span(i)[0])),a1=Math.max(...frames.map(i=>span(i)[1]));
  const at=(a:number,half:number)=>{
    let best:{frameIndex:number;u:number;score:number}|undefined;
    for(const i of frames){
      const [s,e]=span(i),f=home.frames[i];
      if(a<s-.15||a>e+.15||f.width<2*half+.2)continue;
      // Whole on the wall beats clipped at a corner; nearer the street beats set back.
      const whole=a-half>=s-.15&&a+half<=e+.15,score=(whole?100:0)+depth(f);
      if(!best||score>best.score)best={frameIndex:i,u:Math.max(half+.1,Math.min(f.width-half-.1,a-s)),score};
    }
    return best&&{frameIndex:best.frameIndex,u:best.u};
  };
  return{frames,a0,a1,at};
}

/** The photographed layout of a street front on its frames: positions read in
 * percent of the front's width become points along the span of its street
 * walls. Windows a hand's breadth apart are one wider window; the rest take
 * their widths from their neighbours' spacing. */
export function photoLayout(home:EvidenceBuilding,lo:FrontLayout):PhotoLayout|undefined{
  const front=streetFront(home);if(!front||front.a1-front.a0<3)return undefined;
  // Plan frames run either way round; the photograph's left end is the one on the viewer's left.
  const f=home.frames[front.frames[0]],toRight=f.tangent[0]*-f.outward[1]+f.tangent[1]*f.outward[0]>0;
  const {a0,a1}=front,at=(x:number)=>toRight?a0+x/100*(a1-a0):a1-x/100*(a1-a0);
  const raised=/RAISED RANCH|SPLIT LEVEL/i.test(home.style);
  const floors=[lo.w1,lo.w2,lo.w3],full=floors.reduce((n,list,i)=>list?.length?i+1:n,0);
  const windows:PhotoLayout['windows']=[];
  for(const [list,level]of [...floors.map((list,i)=>[list,raised?i-1:i] as const),[lo.wa,raised?full-1:Math.max(1,full)] as const]){
    if(!list?.length)continue;
    const groups:number[][]=[];
    for(const a of list.map(at).sort((x,y)=>x-y)){const g=groups[groups.length-1];if(g&&a-g[g.length-1]<.7)g.push(a);else groups.push([a]);}
    const centres=groups.map(g=>(g[0]+g[g.length-1])/2);
    for(const [k,g]of groups.entries()){
      const gap=Math.min(k?centres[k]-centres[k-1]:Infinity,k<groups.length-1?centres[k+1]-centres[k]:Infinity);
      const width=g.length>1?Math.min(2.1,g[g.length-1]-g[0]+.9):gap<1.35?Math.max(.55,gap-.14):Math.max(.6,Math.min(1.05,gap-.45));
      const place=front.at(centres[k],width/2+.12);
      if(place)windows.push({...place,width,level});
    }
  }
  const points=(list:number[]|undefined,half:number)=>(list??[]).flatMap(x=>{const p=front.at(at(x),half);return p?[p]:[];});
  const doors=points(lo.d,.6),garage=points(lo.gx,1.25);
  let porch:PhotoLayout['porch'];
  if(lo.pw){
    const p=front.at((at(lo.pw[0])+at(lo.pw[1]))/2,0),[b0,b1]=[at(lo.pw[0]),at(lo.pw[1])].sort((x,y)=>x-y);
    if(p){const g=home.frames[p.frameIndex],s=g.start[0]*g.tangent[0]+g.start[1]*g.tangent[1];porch={frameIndex:p.frameIndex,u0:Math.max(0,b0-s),u1:Math.min(g.width,b1-s)};}
  }
  const dormers=(lo.dm??[]).flatMap(([x,kind])=>{
    const width=kind==='s'?Math.max(2.4,Math.min(.6*(a1-a0),6.5)):kind==='h'?2:1.7,p=front.at(at(x),Math.min(width/2+.3,1.2));
    return p?[{...p,kind,width}]:[];
  });
  return{frames:front.frames,doors,windows,garage,...(porch&&porch.u1-porch.u0>=1.2?{porch}:{}),dormers,...(lo.rf?{roof:lo.rf}:{})};
}

export type EvidenceTarget = {
  id: string; tileId: string; outline: readonly (readonly number[])[];
  base: number; floor?: number; peak: number; material?: Role; paint?: string;
  replaceBody?: boolean; replaceOpenings?: boolean;
  preserveEntry?: Pick<Frame,'start'|'tangent'|'outward'> & {u:number;floor:number};
  retireEntrySteps?:EntryStepEnvelope;
};
type PreparedTarget = EvidenceTarget & { bounds: number[] };

export function buildingMaterial(building: EvidenceBuilding): Role {
  return building.material === 'siding' ? 'wall' : building.material;
}

function shortEntryEnvelope(home:EvidenceBuilding):EvidenceTarget['preserveEntry']{
  const entry=home.entry,frame=entry&&home.frames[entry.frameIndex];if(!entry||!frame)return undefined;
  const eave=frame.eave??home.eave;
  if(frame.width>=1.4&&eave-home.floor>=.7&&entry.floor+2.3<eave)return undefined;
  return{start:frame.start,tangent:frame.tangent,outward:frame.outward,u:entry.u,floor:entry.floor};
}

function insideEntry(point:THREE.Vector3,entry:NonNullable<EvidenceTarget['preserveEntry']>):boolean{
  const x=point.x-entry.start[0],y=-point.z-entry.start[1],u=x*entry.tangent[0]+y*entry.tangent[1],v=x*entry.outward[0]+y*entry.outward[1];
  return Math.abs(u-entry.u)<=.72&&v>=-.06&&v<=.35&&point.y>=entry.floor-.08&&point.y<=entry.floor+2.22;
}

/** Distance outside a plan, with zero inside. Heights and all plan coordinates
 * remain in the saved source system; this never moves a mapped building. */
export function planDistanceSquared(outline: readonly (readonly number[])[], x: number, y: number): number {
  let inside=false, distance=Infinity;
  for(let i=0,j=outline.length-1;i<outline.length;j=i++){
    const a=outline[j],b=outline[i];
    if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])inside=!inside;
    const dx=b[0]-a[0],dy=b[1]-a[1],length=dx*dx+dy*dy;
    const t=length?Math.max(0,Math.min(1,((x-a[0])*dx+(y-a[1])*dy)/length)):0;
    distance=Math.min(distance,(x-a[0]-t*dx)**2+(y-a[1]-t*dy)**2);
  }
  return inside?0:distance;
}

function targetIndex(rows: readonly EvidenceTarget[]) {
  const cells=new Map<string,PreparedTarget[]>();
  for(const row of rows){
    if(row.outline.length<3)continue;
    const xs=row.outline.map(p=>p[0]),ys=row.outline.map(p=>p[1]);
    const bounds=[Math.min(...xs)-.85,Math.min(...ys)-.85,Math.max(...xs)+.85,Math.max(...ys)+.85];
    const prepared={...row,bounds};
    for(let x=Math.floor(bounds[0]/16);x<=Math.floor(bounds[2]/16);x++)for(let y=Math.floor(bounds[1]/16);y<=Math.floor(bounds[3]/16);y++){
      const key=`${x},${y}`,list=cells.get(key)??[];list.push(prepared);cells.set(key,list);
    }
  }
  return (x:number,y:number,z:number):EvidenceTarget|undefined=>{
    let nearest:EvidenceTarget|undefined,distance=.85*.85;
    for(const row of cells.get(`${Math.floor(x/16)},${Math.floor(y/16)}`)??[]){
      if(x<row.bounds[0]||x>row.bounds[2]||y<row.bounds[1]||y>row.bounds[3]||z<row.base-1||z>row.peak+12)continue;
      const d=planDistanceSquared(row.outline,x,y);
      if(d<distance){distance=d;nearest=row;}
    }
    return nearest;
  };
}

/** Only V2 inferred surfaces participate. Photo/reference, roads, terrain,
 * street furniture, and the earlier crafted buildings remain protected. */
export function filterEvidenceSources(group:THREE.Object3D,origin:THREE.Vector3,rows:readonly EvidenceTarget[]) {
  const locate=targetIndex(rows),matched=new Set<string>(),retired=new Set<THREE.BufferGeometry>();
  const formerSteps=rows.flatMap(r=>r.retireEntrySteps?[r.retireEntrySteps]:[]);
  const replacements=new Map<string,THREE.Material>(),oldMaterials=new Set<THREE.Material>();
  const world=new THREE.Vector3(),point=new THREE.Vector3();let removedTriangles=0,recoloredTriangles=0;
  group.updateMatrixWorld(true);
  const meshes:THREE.Mesh[]=[];group.traverse(o=>{if(o instanceof THREE.Mesh&&!o.userData.townCrafted)meshes.push(o);});
  for(const mesh of meshes){
    const geometry=mesh.geometry,position=geometry.getAttribute('position');if(!position)continue;
    const materials=Array.isArray(mesh.material)?[...mesh.material]:[mesh.material];materials.forEach(m=>oldMaterials.add(m));
    if(!materials.some(m=>m.name.startsWith('V2 inferred | ')))continue;
    const index=geometry.index,count=index?.count??position.count;
    const parts=geometry.groups.length?geometry.groups:[{start:0,count,materialIndex:0}];
    const buckets=new Map<number,number[]>();let changed=false;
    for(const part of parts){
      const matIndex=part.materialIndex??0,material=materials[matIndex];
      const inferred=material.name.startsWith('V2 inferred | '),role=material.name.slice('V2 inferred | '.length);
      for(let i=part.start;i<Math.min(count,part.start+part.count);i+=3){
        const ids=[index?index.getX(i):i,index?index.getX(i+1):i+1,index?index.getX(i+2):i+2];
        let output=matIndex,remove=false;
        if(inferred){
          world.set(0,0,0);for(const id of ids)world.add(point.fromBufferAttribute(position,id));
          world.multiplyScalar(1/3).applyMatrix4(mesh.matrixWorld).add(origin);
          const row=locate(world.x,-world.z,world.y);
          if(row){
            if(['siding','brick','concrete_wall','roof','flat_roof'].includes(role))matched.add(row.id);
            remove=!!row.replaceBody||(!!row.replaceOpenings&&['trim','glass','door'].includes(role));
            // A low source eave may fit its existing 2.06 m doorway but not
            // the authored door and surround. Retain only complete entrance
            // triangles, including when a separate roof body is replaced.
            if(remove&&row.preserveEntry&&['trim','glass','door'].includes(role)&&ids.every(id=>insideEntry(point.fromBufferAttribute(position,id).applyMatrix4(mesh.matrixWorld).add(origin),row.preserveEntry!)))remove=false;
            if(!remove&&row.material&&row.paint&&['siding','brick','concrete_wall'].includes(role)){
              const key=`${row.material}:${row.paint}`;
              let replacement=replacements.get(key);
              if(!replacement){replacement=frontageMaterial(row.material,row.paint);replacements.set(key,replacement);}
              output=materials.indexOf(replacement);if(output<0){output=materials.length;materials.push(replacement);}
              changed=true;recoloredTriangles++;
            }
          }
          if(!remove&&role==='foundation'&&formerSteps.some(entry=>ids.every(id=>insideFormerEntrySteps(point.fromBufferAttribute(position,id).applyMatrix4(mesh.matrixWorld).add(origin),entry))))remove=true;
        }
        if(remove){changed=true;removedTriangles++;continue;}
        const bucket=buckets.get(output)??[];bucket.push(...ids);buckets.set(output,bucket);
      }
    }
    if(!changed)continue;
    retired.add(geometry);
    if(!buckets.size){mesh.removeFromParent();continue;}
    // Compact the retained vertices: replacing openings must not leave their
    // large, unreachable source buffers resident on the GPU.
    const remap=new Map<number,number>(),sourceIds:number[]=[],indices:number[]=[];
    const next=new THREE.BufferGeometry(),usedMaterials:THREE.Material[]=[];
    for(const [materialIndex,bucket]of buckets){
      const start=indices.length;
      for(const old of bucket){let id=remap.get(old);if(id===undefined){id=sourceIds.length;sourceIds.push(old);remap.set(old,id);}indices.push(id);}
      next.addGroup(start,indices.length-start,usedMaterials.length);usedMaterials.push(materials[materialIndex]);
    }
    for(const [name,attribute]of Object.entries(geometry.attributes)){
      const values=new Float32Array(sourceIds.length*attribute.itemSize);
      const get=[attribute.getX,attribute.getY,attribute.getZ,attribute.getW];
      for(let i=0;i<sourceIds.length;i++)for(let k=0;k<attribute.itemSize;k++)values[i*attribute.itemSize+k]=get[k].call(attribute,sourceIds[i]);
      next.setAttribute(name,new THREE.BufferAttribute(values,attribute.itemSize));
    }
    next.setIndex(indices);next.computeBoundingBox();next.computeBoundingSphere();
    next.userData={...geometry.userData,evidenceFilter:true};mesh.geometry=next;mesh.material=usedMaterials;
  }
  const retainedGeometry=new Set<THREE.BufferGeometry>(),retainedMaterials=new Set<THREE.Material>(),textures=new Set<THREE.Texture>();
  group.traverse(o=>{if(o instanceof THREE.Mesh){retainedGeometry.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material]){retainedMaterials.add(m);for(const v of Object.values(m))if(v instanceof THREE.Texture)textures.add(v);}}});
  for(const g of retired)if(!retainedGeometry.has(g))g.dispose();
  for(const m of [...oldMaterials,...replacements.values()])if(!retainedMaterials.has(m)){for(const v of Object.values(m))if(v instanceof THREE.Texture&&!textures.has(v))v.dispose();m.dispose();}
  return{matched,removedTriangles,recoloredTriangles};
}

/** Shutter colours read from Webster's street photographs, by share: black,
 * burgundy, navy, grey, green. A house without a photographed colour takes
 * one from its id, the same on every wall. */
const SHUTTERS:[number,string][]=[[.55,'#1f2123'],[.76,'#4a2427'],[.86,'#252d3b'],[.96,'#4a4e50'],[1,'#26332b']];
function shutterFor(id:string):string{
  let h=2166136261;for(let i=0;i<id.length;i++)h=Math.imul(h^id.charCodeAt(i),16777619);
  const x=(h>>>0)/4294967296;return SHUTTERS.find(([share])=>x<share)![1];
}

function homeWindows(batch:Batch,home:EvidenceBuilding):void {
  batch.trimColor=home.trim;batch.shutterColor=home.shutterColor??shutterFor(home.id);
  try{houseOpenings(batch,home);}finally{batch.trimColor=undefined;batch.shutterColor=undefined;}
}

/** The street wall that holds the photographed garage doors: of the walls
 * facing the same way as the front, the one on the photographed side as seen
 * from the street (a garage wing), or the widest for a centred garage. */
export function garageFrame(home:EvidenceBuilding):number{
  const g=home.garage,front=home.frames.findIndex(f=>f.front);if(!g||front<0)return -1;
  const o=home.frames[front].outward,right=[-o[1],o[0]];
  const along=(f:EvidenceBuilding['frames'][number])=>(f.start[0]+f.tangent[0]*f.width/2)*right[0]+(f.start[1]+f.tangent[1]*f.width/2)*right[1];
  let best=-1;
  for(const [i,f]of home.frames.entries()){
    if(f.outward[0]*o[0]+f.outward[1]*o[1]<=.8||f.width<2.6)continue;
    const b=home.frames[best];
    if(!b||(g.side==='center'?f.width>b.width:g.side==='left'?along(f)<along(b)-.5:along(f)>along(b)+.5))best=i;
  }
  return best;
}

/** A house's photographed layout, on the wall the photograph shows (the plan's front, or the wall facing its address street where the roof read says so). */
const withLayout=(home:EvidenceBuilding,lo:FrontLayout|undefined):EvidenceBuilding=>{
  if(!lo)return home;
  const shown=lo.sf!==undefined&&lo.sf<home.frames.length&&!home.openPorch?{...home,frames:home.frames.map((f,i)=>({...f,front:i===lo.sf}))}:home;
  const layout=photoLayout(shown,lo);if(!layout)return home;
  // Under an open porch the photographed door stands on the house wall, reached by the porch's steps.
  const porch=home.openPorch,door=porch?layout.doors.find(d=>porch.strips.some(s=>s.frameIndex===d.frameIndex)):undefined;
  return{...shown,layout,...(door&&home.entry?{entry:{...home.entry,frameIndex:door.frameIndex,u:door.u}}:{})};
};

/** The photographed front door nearest the planned entry, where the two
 * differ; where the wall there is too low for a door (a Cape's recessed
 * entry under its eaves), the nearest stretch of a street wall within 2.5 m
 * that takes one. */
function photoDoorMove(home:EvidenceBuilding):{frameIndex:number;u:number;basis:string;alternatives:{frameIndex:number;u:number}[]}|undefined{
  const read=home.layout,doors=read?.doors,entry=home.entry;if(!doors?.length||!entry||home.openPorch)return undefined;
  const at=(i:number,u:number)=>{const f=home.frames[i];return[f.start[0]+f.tangent[0]*u,f.start[1]+f.tangent[1]*u];};
  const [e,n]=at(entry.frameIndex,entry.u);
  const [best]=doors.map(d=>{const [x,y]=at(d.frameIndex,d.u);return{d,far:Math.hypot(x-e,y-n)};}).sort((a,b)=>a.far-b.far);
  const fits=(i:number,u:number)=>{const f=home.frames[i],top=(x:number)=>f.profile?wallTop(f.profile,x):f.eave??home.eave;return Math.min(top(u-.6),top(u),top(u+.6))-home.floor>=2.32;};
  // Places along the street walls within 2.5 m of the photographed door, nearest
  // first, where the wall stands tall enough; the stoop takes the first the ground allows.
  const [x0,y0]=at(best.d.frameIndex,best.d.u),places:{frameIndex:number;u:number;far:number}[]=[];
  for(const i of read!.frames){
    const f=home.frames[i];if(f.width<1.5)continue;
    const near=(x0-f.start[0])*f.tangent[0]+(y0-f.start[1])*f.tangent[1];
    for(const step of [0,-.5,.5,-1,1,-1.5,1.5,-2,2]){
      const u=Math.max(.7,Math.min(f.width-.7,near+step)),[x,y]=at(i,u),far=Math.hypot(x-x0,y-y0);
      if(far<2.5&&fits(i,u)&&!places.some(p=>p.frameIndex===i&&Math.abs(p.u-u)<.2))places.push({frameIndex:i,u,far});
    }
  }
  places.sort((a,b)=>a.far-b.far);
  if(!places.length)return undefined;
  const [x,y]=at(places[0].frameIndex,places[0].u);
  if(Math.hypot(x-e,y-n)<.3)return undefined;
  return{frameIndex:places[0].frameIndex,u:places[0].u,basis:'Placed where the street photograph shows the front door.',alternatives:places.slice(1,8).map(({frameIndex,u})=>({frameIndex,u}))};
}

/** Where the plan's entry shares the garage's wall and leaves no room for the
 * photographed doors, the door moves to the widest other street wall. */
function garageEntryMove(home:EvidenceBuilding):{frameIndex:number;u:number}|undefined{
  const at=garageFrame(home),entry=home.entry;
  if(at<0||!entry||entry.frameIndex!==at)return undefined;
  const edge=home.frames[at];
  if(garageDoors(home,edge,entry.u)||!garageDoors(home,edge))return undefined;
  let best=-1;
  for(const [i,f]of home.frames.entries())if(i!==at&&f.outward[0]*edge.outward[0]+f.outward[1]*edge.outward[1]>.8&&f.width>=2.4&&(best<0||f.width>home.frames[best].width))best=i;
  return best<0?undefined:{frameIndex:best,u:home.frames[best].width/2};
}

/** Where photographed garage doors sit on a street wall: up to the photographed
 * count, each 2.2-2.6 m wide with 0.4 m piers, on the side seen in the
 * photograph (left or right as viewed from the street, or centred; centred on
 * a wall of their own), kept 0.4 m from the corner and clear of the front door. */
function garageDoors(home:EvidenceBuilding,edge:EvidenceBuilding['frames'][number],doorU?:number,own=false):{u0:number;u1:number;doors:number[];width:number}|undefined{
  const g=home.garage;if(!g)return undefined;
  const w=edge.width,toRight=edge.tangent[0]*-edge.outward[1]+edge.tangent[1]*edge.outward[0]>0;
  const high=own?undefined:g.side==='right'?toRight:g.side==='left'?!toRight:undefined;
  // The free stretch of wall on the photographed side of the door; a narrow
  // garage wing takes a 7 ft door between slimmer corners.
  for(let n=g.doors;n>0;n--)for(const [pier,least]of [[.4,2.2],[.25,2.1]]){
    let lo=pier,hi=w-pier;
    if(doorU!==undefined&&doorU>0){
      const side=high??(doorU<w/2);
      if(side)lo=Math.max(lo,doorU+1.0);else hi=Math.min(hi,doorU-1.0);
    }
    const avail=hi-lo,width=Math.min(2.6,(avail-(n-1)*.4)/n);
    if(width<least)continue;
    const span=n*width+(n-1)*.4;
    const u0=high===undefined?Math.max(lo,Math.min(hi-span,(w-span)/2)):high?hi-span:lo;
    return{u0,u1:u0+span,width,doors:Array.from({length:n},(_,k)=>u0+width/2+k*(width+.4))};
  }
  return undefined;
}

/** Photographed garage doors at their centres along a wall: up to 2.6 m wide
 * with 0.4 m piers between them, kept on the wall and clear of the front door. */
function photoGarage(centres:readonly number[],w:number,doorU?:number):{u0:number;u1:number;doors:number[];width:number}|undefined{
  const kept:number[]=[];
  for(const u of [...centres].sort((a,b)=>a-b))if((doorU===undefined||Math.abs(u-doorU)>1.9)&&(!kept.length||u-kept[kept.length-1]>=2.5))kept.push(u);
  let width=2.6;for(let k=1;k<kept.length;k++)width=Math.min(width,kept[k]-kept[k-1]-.4);
  if(!kept.length||w<width+.5)return undefined;
  const doors=kept.map(u=>Math.max(width/2+.25,Math.min(w-width/2-.25,u)));
  return{u0:doors[0]-width/2,u1:doors[doors.length-1]+width/2,doors,width};
}

/** Adds the vehicle doors built during assembly to the tile's gathered
 * openings (once): the same doors, with their facing and width. */
export function mergeVehicleDoors(group:THREE.Object3D):void{
  const openings=group.userData.openings as {doors?:number[][];garageDoors?:number[][]}|undefined,vehicle=group.userData.vehicleDoors as number[][]|undefined;
  if(!openings||!vehicle?.length)return;
  const garages=openings.garageDoors??(openings.garageDoors=[]),doors=openings.doors??(openings.doors=[]);
  for(const door of vehicle){
    // The gathered copy of the same door (its centre, without facing) gives way to this one.
    const same=garages.findIndex(g=>g.length<6&&Math.hypot(g[0]-door[0],g[2]-door[2])<1.2);
    if(same>=0)garages.splice(same,1);
    if(!garages.includes(door))garages.push(door);
    if(!doors.some(d=>Math.hypot(d[0]-door[0],d[2]-door[2])<1.2))doors.push(door);
  }
}

/** A sectional vehicle door in its recess, with jambs and a header; yard
 * dressing keeps clear of it. */
function vehicleDoor(batch:Batch,f:Frame,u:number,g:number,width:number,h:number,color:string):void{
  const dw=width-.16;
  batch.box(f,'recess',u,g+h/2+.035,.04,dw+.18,h+.07,.1);
  batch.keepOpeningColor=true;
  try{batch.box(f,'door',u,g+h/2,.1,dw,h,.05,color);}finally{batch.keepOpeningColor=false;}
  for(const sign of [-1,1])batch.box(f,'trim',u+sign*(dw/2+.1),g+h/2+.035,.12,.12,h+.11,.1);
  batch.box(f,'trim',u,g+h+.12,.12,dw+.32,.14,.12);
  const e=f.start[0]+f.tangent[0]*u+f.outward[0]*.3,n=f.start[1]+f.tangent[1]*u+f.outward[1]*.3;
  // Tile-local position 0.3 m out, the wall's outward direction and the door's width.
  batch.garageDoors.push([e-batch.origin.x,g+1,-n-batch.origin.z,f.outward[0],-f.outward[1],width]);
}

/** Surface roles for photographed wall materials. */
const OTHER_ROLE:Record<NonNullable<MeasuredOther['m']>,Role>={siding:'wall',wood:'wall',shingle:'shingle',brick:'brick',block:'stucco',concrete:'stucco',metal:'metal',stucco:'stucco',stone:'stone'};
export const otherRole=(row:MeasuredOther):Role=>row.m?OTHER_ROLE[row.m]:'wall';

/** A garage, shed or other building: its measured body (or the scenery's own
 * box, kept), vehicle doors in the wall the drive runs up to, a hinged door
 * toward the lot's house or the street, and on a building storeys of windows;
 * a photographed building's street face follows its photograph (shopfront,
 * awning, window pattern and columns, overhead doors, entrance). */
function otherBuilding(batch:Batch,row:MeasuredOther,tileId:string,groundAt:(e:number,n:number)=>number|undefined):void{
  const measured=row.k!=='v',inset=measured?row.in??MEASURED_WALL_INSET:0,face=row.fb;
  const paint=row.wc??(row.k==='b'?'#cbc6b8':'#d9d4c6'),trim=row.tc??'#e4e2da';
  if(measured)measuredBody(batch,row.id,tileId,{...row,p:row.p!,v:row.v!,r:row.r!,w:row.w!,q:row.q!,e:[],c:[],tc:trim},otherRole(row),paint,'#55585a');
  const ring=row.ol.map(([x,y])=>[row.o[0]+x/10,row.o[1]+y/10]);
  for(const [i,a]of ring.entries()){
    const b=ring[(i+1)%ring.length],dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);
    const t=[dx/length,dy/length] as const,o=[t[1],-t[0]] as const,w=length-2*inset;
    if(!(w>=1))continue;
    const start=[a[0]+t[0]*inset-o[0]*inset,a[1]+t[1]*inset-o[1]*inset] as const;
    const f:Frame={start,tangent:t,outward:o,structId:row.id,tileId};
    const ground=(u:number)=>groundAt(start[0]+t[0]*u+o[0]*.7,start[1]+t[1]*u+o[1]*.7)??row.b;
    const wallTopAt=((): ((u:number)=>number)=>{
      if(!measured)return()=>row.b+row.h!;
      const p=row.ep?.[i];if(p==null)return()=>-Infinity;
      if(typeof p==='number')return()=>row.b+p;
      const profile=p.map(([u,h])=>[u,row.b+h] as [number,number]);return(u:number)=>wallTop(profile,u);
    })();
    const clear=(u:number,half:number)=>Math.min(wallTopAt(u-half),wallTopAt(u),wallTopAt(u+half));
    // A poured slab edge shows a hand's breadth above grade under measured walls
    // (smooth concrete, so house yard dressing does not take it for a house).
    if(measured&&batch.level<2){const g=Math.max(ground(0),ground(w/2),ground(w))+.14;if(g>row.b+.05)batch.box(f,'stucco',w/2,(row.b+g)/2,.02,w,g-row.b,.06,'#8b897f');}
    let doorU=-100;
    const street=i===row.dw,floor=Math.max(ground(0),ground(w))+.3,busy:[number,number][]=[];
    // Overhead doors on a photographed building's street face, as many as fit.
    if(street&&face?.od)for(let n=face.od;n>0;n--){
      const each=Math.min(3.6,(w-.8-(n-1)*.6)/n);if(each<2.4)continue;
      const span=n*each+(n-1)*.6,u0=(w-span)/2;
      for(let k=0;k<n;k++){
        const u=u0+each/2+k*(each+.6),g=ground(u),h=Math.min(3.66,clear(u,each/2)-g-.45);
        if(h>=2.2){vehicleDoor(batch,f,u,g-.03,each,h,face.oc??'#dcdcd6');busy.push([u-each/2-.3,u+each/2+.3]);}
      }
      break;
    }
    // A shopfront: plate glass in bays across the ground floor, the entrance in the middle.
    if(street&&face?.st&&w>=4){
      const top=floor+2.9,bays=Math.max(2,Math.round((w-1.2)/1.9)),span=(w-1.2)/bays;
      if(clear(w/2,w/2-.6)>top+.5){
        for(let k=0;k<bays;k++){const u=.6+(k+.5)*span;if(busy.some(([a,b])=>u>a&&u<b))continue;batch.window(f,u,floor+.45,span-.12,2.4,.01,false,false);}
        busy.push([.3,w-.3]);
        if(face.aw)batch.box(f,'metal',w/2,top+.2,.55,w-.9,.36,1.1,face.aw);
      }
    }
    if(i===row.gw&&row.gn){
      for(let n=row.gn;n>0;n--){
        const each=Math.min(2.6,(w-.8-(n-1)*.4)/n);if(each<2.2)continue;
        const span=n*each+(n-1)*.4,u0=(w-span)/2;
        for(let k=0;k<n;k++){
          const u=u0+each/2+k*(each+.4),g=ground(u),h=Math.min(2.13,clear(u,each/2)-g-.37);
          if(h>=1.9)vehicleDoor(batch,f,u,g-.03,each,h,row.gc??'#ecebe6');
        }
        break;
      }
    }
    else if(street&&!(face?.st&&busy.length)){
      // The entrance: in a free stretch nearest the middle of the street face.
      const free=(u:number)=>!busy.some(([a,b])=>u+.7>a&&u-.7<b);
      const u=[w/2,w/2-1.8,w/2+1.8,w/4,3*w/4].find(x=>x>.8&&x<w-.8&&free(x));
      if(u!==undefined){
        const g=ground(u);
        if(clear(u,.6)>=g+2.35){
          if(face?.dc==='glass'){batch.window(f,u,g+.06,1.05,2.1,.01,true,false);}
          else batch.door(f,u,g+.04,.025,row.k==='b'?1.1:.9,face?.dc??(row.k==='b'?'#3f4749':trim),!!face?.dc);
          doorU=u;busy.push([u-.9,u+.9]);
        }
      }
    }
    // A building's storeys of windows, in the photographed pattern (plain sash when unphotographed).
    const pattern=face?.wn??'rows';
    if(row.k==='b'&&w>=3&&pattern!=='none'&&(pattern!=='few'||street)){
      const levels=Math.max(1,Math.min(6,face?.fl??6)),bays=street&&face?.bays?Math.min(20,face.bays):Math.max(1,Math.floor(w/3.2));
      const storey=face?.fl?Math.max(2.7,Math.min(3.8,(clear(w/2,w/2-.5)-floor-.2)/face.fl)):2.9;
      for(let level=0;level<(pattern==='few'?1:levels);level++){
        const bottom=floor+.8+level*storey;
        if(pattern==='band'){
          const width=w-1.4;if(width>1&&bottom+1.2<=clear(w/2,width/2)-.3&&!(level===0&&busy.length))batch.window(f,w/2,bottom,width,1.2,.01,true,false);
          continue;
        }
        for(let k=0;k<bays;k++){
          const u=(k+.5)*w/bays,width=Math.min(1.0,w/bays-.4);
          if(width<.5||bottom+1.45>clear(u,width/2+.12)-.3)continue;
          if(level===0&&busy.some(([a,b])=>u+width/2>a&&u-width/2<b))continue;
          if(Math.abs(u-doorU)<1.3&&bottom<floor+2.4)continue;
          batch.window(f,u,bottom,width,1.45,.01,false,false);
        }
      }
    }
  }
}

/** Height of a wall-top polyline at u, held level past its ends. */
function wallTop(profile:readonly (readonly [number,number])[],u:number):number{
  if(u<=profile[0][0])return profile[0][1];
  for(let k=1;k<profile.length;k++){
    const [a,ha]=profile[k-1],[b,hb]=profile[k];
    if(u<=b)return b-a>1e-6?ha+(hb-ha)*(u-a)/(b-a):Math.min(ha,hb);
  }
  return profile[profile.length-1][1];
}

type FacadeLayout={centres:number[];pitch:number;count:number;front:boolean};

/** Walls that read as one facade: frames facing the same way within 2.5 m of
 * each other in depth, whose spans along the wall meet across short jogs. The
 * facade's bays are laid out across its whole width and each window kept on
 * the frame it falls on, clear of the jog corners. Per grouped frame: its
 * window centres, the bays' pitch and count, and whether it faces the street. */
export function facadeLayouts(home:EvidenceBuilding,bayCount:(width:number,front:boolean)=>number,skip=-1):Map<number,FacadeLayout>{
  const frames=home.frames,parent=frames.map((_,i)=>i),out=new Map<number,FacadeLayout>();
  const find=(i:number):number=>parent[i]===i?i:(parent[i]=find(parent[i]));
  const along=(i:number,t:readonly number[])=>frames[i].start[0]*t[0]+frames[i].start[1]*t[1];
  for(let i=0;i<frames.length;i++)for(let j=i+1;j<frames.length;j++){
    const a=frames[i],b=frames[j];
    if(i===skip||j===skip||a.width<.8||b.width<.8||a.outward[0]*b.outward[0]+a.outward[1]*b.outward[1]<.996)continue;
    const depth=Math.abs((b.start[0]-a.start[0])*a.outward[0]+(b.start[1]-a.start[1])*a.outward[1]);
    const a0=along(i,a.tangent),b0=along(j,a.tangent),gap=Math.max(a0,b0)-Math.min(a0+a.width,b0+b.width);
    // Spans that overlap are a wall behind another, not a jog.
    if(depth<=2.5&&gap<=1.6&&gap>-.5)parent[find(i)]=find(j);
  }
  const groups=new Map<number,number[]>();
  for(let i=0;i<frames.length;i++){const r=find(i),g=groups.get(r);if(g)g.push(i);else groups.set(r,[i]);}
  for(const g of groups.values()){
    if(g.length<2)continue;
    const t=frames[g[0]].tangent,spans=g.map(i=>{const a=along(i,t);return[i,a,a+frames[i].width] as const;});
    const a0=Math.min(...spans.map(s=>s[1])),a1=Math.max(...spans.map(s=>s[2])),front=g.some(i=>frames[i].front);
    const count=bayCount(a1-a0,front),pitch=(a1-a0)/count;
    for(const i of g)out.set(i,{centres:[],pitch,count,front});
    const half=Math.min(1.05,pitch-.65)/2+.3;
    for(let k=0;k<count;k++){
      const c=a0+(k+.5)*pitch;
      let best=spans[0],overlap=-Infinity;
      for(const s of spans){const o=Math.min(s[2],c+half)-Math.max(s[1],c-half);if(o>overlap){overlap=o;best=s;}}
      const [i,a,b]=best;
      if(b-a>=2*half)out.get(i)!.centres.push(Math.max(a+half,Math.min(b-half,c))-a);
    }
  }
  return out;
}

function houseOpenings(batch:Batch,home:EvidenceBuilding):void {
  const style=home.style.toUpperCase(),ranch=/RANCH|SPLIT LEVEL/.test(style),cape=/CAPE/.test(style),raised=/RAISED RANCH|SPLIT LEVEL/.test(style);
  const colonial=/COLONIAL|FEDERAL|GEORGIAN/.test(style),multi=/FLATS|APARTMENT|CONVERSION|DUPLEX/.test(style);
  const garageAt=garageFrame(home);
  const bayCount=(w:number,front:boolean)=>{
    let bays=Math.max(1,Math.floor(w/(ranch?3.6:3.15)));
    if(front&&colonial&&w>8)bays=Math.min(5,Math.max(3,bays%2?bays:bays+1));
    if(front&&home.frontageBays&&home.frontageBays>=2&&w/home.frontageBays>1.65)bays=Math.min(12,home.frontageBays);
    return bays;
  };
  const layouts=facadeLayouts(home,bayCount,home.porchInPlan&&home.entry?home.entry.frameIndex:-1);
  for(const [frameIndex,edge]of home.frames.entries()){
    const f:Frame={...edge,structId:home.id,tileId:home.tileId},w=edge.width,low=edge.eave??home.eave;
    // A measured wall top follows its roof: level under an eave, rising and
    // falling under a gable, stepping where a lower wing meets the frame.
    const profile=edge.profile??[[0,low],[w,low]] as const,eave=Math.max(...profile.map(p=>p[1]));
    const top=(u:number)=>wallTop(profile,u),clear=(u:number,half:number)=>Math.min(top(u-half),top(u),top(u+half));
    if(w<1.4||eave-home.floor<.7)continue;
    const floorHeight=home.floorHeight??(multi?2.85:2.70),levels=Math.max(1,Math.min(4,Math.ceil(home.stories)));
    const ground=edge.groundMaximum??home.floor-.12;
    // A raised ranch's entry is a landing between its storeys: the main floor
    // stands a storey-height under the measured wall top, the lower level
    // (garage, family room) half out of the ground below it.
    const floor=raised?Math.max(home.floor,low-2.45):home.floor;
    const layout=layouts.get(frameIndex),front=layout?layout.front:edge.front&&w>=3.2;
    const entry=home.entry?.frameIndex===frameIndex?home.entry:undefined;
    const doorU=entry?.u??-100;
    // Photographed garage doors stand where the photograph shows them, else on the side it names.
    const read=home.layout,readGarage=read?.garage.filter(g=>g.frameIndex===frameIndex)??[];
    const garage=readGarage.length?photoGarage(readGarage.map(g=>g.u),w,entry?.u):!read?.garage.length&&frameIndex===garageAt?garageDoors(home,edge,entry?.u,!entry&&!edge.front):undefined;
    const groundAtU=(u:number)=>{const g=edge.groundAt;if(!g||g.length<2)return ground;const x=Math.max(0,Math.min(1,u/w))*(g.length-1),k=Math.min(g.length-2,Math.floor(x));return g[k]+(g[k+1]-g[k])*(x-k);};
    // A photographed sunporch that the mapped plan already holds (the entry
    // bay projects from the front) takes a band of windows on each storey.
    const sunporch=!!entry&&home.porchInPlan===true;
    // A 7 ft sectional door, or a 6 ft 6 in one where a raised ranch's upper windows sit low over it.
    const garageGround=garage?Math.max(...garage.doors.map(groundAtU)):ground,room=floor+.72-garageGround-.24;
    const doorHeight=room>=1.98&&room<2.13?room:2.13;
    // Bays: across the whole facade where jogs split it, else across this wall.
    const bays=sunporch?Math.max(2,Math.round(w/1.15)):layout?layout.count:bayCount(w,front);
    const pitch=layout&&!sunporch?layout.pitch:w/bays,centres=layout&&!sunporch?layout.centres:Array.from({length:bays},(_,i)=>(i+.5)*w/bays);
    const windowHeight=sunporch?1.3:ranch?1.25:cape?1.34:multi?1.52:1.45;
    // Under a low measured eave (a Cape's or a ranch's front) ground-floor
    // windows drop their sills and shorten, heads tight under the frieze;
    // under one barely two metres over the floor, to low sash on low sills.
    const squat=eave-floor<2.2,shortest=sunporch?windowHeight:Math.min(windowHeight,squat?.85:1.12);
    // A street wall of a photographed front takes the windows the photograph
    // shows, storey by storey; other walls their bays.
    // (A street wall the photograph shows as porch, with no windows of its own read,
    // is a porch the plan holds as walls; it keeps windows in its bays.)
    const porchWall=!!read?.porch&&read.frames.includes(frameIndex)&&!read.windows.some(x=>x.frameIndex===frameIndex)&&(()=>{
      const g=home.frames[read.porch!.frameIndex],t=g.tangent,a=(edge.start[0]-g.start[0])*t[0]+(edge.start[1]-g.start[1])*t[1];
      return a>=read.porch!.u0-.5&&a+w<=read.porch!.u1+.5;
    })();
    const photographed=!sunporch&&!porchWall&&!!read?.windows.length&&read.frames.includes(frameIndex);
    const extraDoors=(read?.doors??[]).filter(d=>d.frameIndex===frameIndex&&!(entry&&Math.abs(d.u-doorU)<1.2)).map(d=>d.u);
    const bayed=Array.from({length:levels},(_,level)=>centres.map(u=>({u,level,spacing:pitch,street:front,
      width:sunporch?Math.min(1,pitch-.22):Math.min(ranch&&front&&bays<4?1.72:1.05,pitch-.65)}))).flat();
    const specs=photographed?read!.windows.filter(x=>x.frameIndex===frameIndex&&x.level>=0).map(x=>({u:x.u,width:x.width,level:x.level,spacing:x.width+1.05,street:true})):bayed;
    // A photographed dormer where this wall itself rises into the roof (a wall
    // dormer, or the gable the survey made of one) is a window high in the wall.
    if(read)for(const d of read.dormers)if(d.frameIndex===frameIndex&&highWall(home,edge,d.u))specs.push({u:d.u,width:.8,level:atticLevel(home),spacing:1.85,street:true});
    const placeAll=(list:typeof specs,photographed:boolean):number=>{
    let placed=0;
    const storeys=Math.max(levels,...list.map(x=>x.level+1));
    for(let level=0;level<storeys;level++){
      // An upper storey under a low measured eave keeps its windows by
      // sitting them closer to that floor (a lower storey, a shorter sill).
      const standard=floor+(sunporch?.85:.72)+level*floorHeight,lowest=level?floor+level*2.45+.5:sunporch?standard:floor+(squat?.35:.55);
      if(lowest+shortest>eave-.26||standard<ground+.16)continue;
      for(const spec of list.filter(x=>x.level===level)){
        const {width,spacing,street}=spec;let u=spec.u;
        // A photographed window a door has displaced steps aside from it, up to half a metre.
        if(photographed&&level===0&&entry&&Math.abs(u-doorU)<.68+width/2){
          const aside=doorU+Math.sign(u-doorU||1)*(.7+width/2);
          if(Math.abs(aside-u)<=.55&&aside>width/2+.15&&aside<w-width/2-.15)u=aside;
        }
        const groupedWidth=home.historicalWindowGroup&&!photographed?Math.min(2.65,pitch-.5):0;
        // Upper windows stand in a gable only where its rakes clear them.
        const room=clear(u,Math.max(0,groupedWidth>=1.7?groupedWidth:width)/2+.12)-.26,bottom=Math.max(lowest,Math.min(standard,room-windowHeight));
        const height=Math.min(windowHeight,room-bottom);
        if(height<shortest)continue;
        if(entry&&Math.abs(u-doorU)<(sunporch?.75:.68+width/2)&&bottom<entry.floor+2.2&&bottom+height>entry.floor)continue;
        if(extraDoors.some(d=>Math.abs(u-d)<.68+width/2)&&bottom<floor+2.2)continue;
        if(garage&&u+width/2>garage.u0-.3&&u-width/2<garage.u1+.3&&bottom<groundAtU(u)+doorHeight+.22)continue;
        if(groupedWidth>=1.7&&!sunporch){
          if(entry&&Math.abs(u-doorU)<groupedWidth/2+.70&&bottom<entry.floor+2.3&&bottom+height>entry.floor)continue;
          groupedHistoricWindow(batch,f,u,bottom,groupedWidth,height);
          continue;
        }
        if(width<(sunporch?.45:.55))continue;
        batch.window(f,u,bottom,width,height,.01,(ranch||photographed)&&width>1.4,!sunporch&&(home.shutters!==undefined?street&&home.shutters&&spacing>1.9:street&&colonial&&home.material!=='brick'&&spacing>2.7));
        placed++;
        if(home.year>0&&home.year<1940&&batch.level===0&&!sunporch){
          // Six-over-six sash is a period interpretation. Contemporary and
          // modern ranch windows retain their broad, quieter glass panes.
          for(const sign of [-1,1])batch.box(f,'trim',u+sign*width/6,bottom+height/2,.16,.022,height,.027);
          for(const fraction of [.25,.75])batch.box(f,'trim',u,bottom+height*fraction,.16,width,.022,.027);
        }
      }
    }
    return placed;
    };
    // Photographed windows this wall cannot hold at all (the storeys read stand
    // above its measured top, or doors fill it) give way to its bays.
    if(!placeAll(specs,photographed)&&photographed&&specs.length)placeAll(bayed,false);
    // The raised ranch's lower level: shorter windows under the main ones,
    // where the ground falls far enough below the main floor.
    const lower=photographed?read!.windows.filter(x=>x.frameIndex===frameIndex&&x.level<0):centres.map(u=>({u,width:Math.min(1.05,pitch-.65)}));
    if(raised&&!sunporch)for(const {u,width:across}of lower){
      const width=Math.min(1.05,across),bottom=groundAtU(u)+.42,height=Math.min(1.05,floor-.16-bottom);
      if(width<.55||height<.6)continue;
      if(entry&&Math.abs(u-doorU)<1.25)continue;
      if(garage&&u+width/2>garage.u0-.3&&u-width/2<garage.u1+.3)continue;
      batch.window(f,u,bottom,width,height,.01,false,false);
    }
    // Sectional vehicle doors in their photographed colour (white when unrecorded).
    if(garage)for(const u of garage.doors){
      const g=groundAtU(u);
      if(clear(u,garage.width/2)<g+doorHeight+.37)continue;
      vehicleDoor(batch,f,u,g,garage.width,doorHeight,home.garage?.color??'#ecebe6');
    }
    if(entry&&entry.floor+2.3<clear(doorU,.6)){
      // Keep the existing generated doorway aligned with its retained steps.
      // The source checked grade at the doorway, not at the uphill wall corner.
      batch.door(f,doorU,entry.floor,.025,multi?1.08:.96,home.door??(home.documented?'#45574d':'#465356'),home.door!==undefined);
      const span=read?.porch?.frameIndex===frameIndex?read.porch:undefined;
      if(home.porch!=='none'&&home.porchPlacement==='front'&&!home.porchInPlan&&!home.openPorch)homePorch(batch,{...home,floor:entry.floor},f,w,doorU,ground,top,edge,span);
    }
    // Another photographed entrance (a two-family's second door), with its steps.
    for(const u of extraDoors){
      const g=groundAtU(u),sill=Math.max(floor,g+.15);
      if(sill+2.3>=clear(u,.6)||sill-g>1.4)continue;
      batch.door(f,u,sill,.025,multi?1.08:.96,home.door??'#465356',home.door!==undefined);
      const rise=sill-g,steps=Math.min(8,Math.ceil(rise/.18));
      if(rise>.2)for(let i=0;i<steps;i++){const h=rise*(steps-i)/steps;batch.box(f,'foundation',u,g+h/2-.02,.3+i*.28,1.1,h,.3,'#a19f93');}
    }
    // A frieze board runs under each level stretch of wall top; rakes carry the roof's own trim.
    for(let k=1;k<profile.length;k++){
      const [a,ha]=profile[k-1],[b,hb]=profile[k];
      if(b-a>.05&&Math.abs(hb-ha)<.03)batch.box(f,'trim',(a+b)/2,Math.min(ha,hb)-.09,.11,b-a+.04,.16,.24);
    }
    if(batch.level===0&&home.eaveDetail){
      // The presence and material family come from a dated description. The
      // spacing is an architectural interpretation within the measured wall.
      const bracket=home.eaveDetail==='brackets',brick=home.eaveDetail==='brick-dentils';
      const count=Math.max(2,Math.min(100,Math.floor(w/(bracket?1.35:.32))));
      for(let i=0;i<count;i++){
        const u=(i+.5)*w/count;
        batch.box(f,brick?'brick':'trim',u,top(u)-(bracket?.33:.22),.13,bracket?.09:.12,bracket?.34:.14,bracket?.26:.21,brick?'#8b6552':undefined);
        if(bracket)batch.box(f,'trim',u,top(u)-.22,.22,.13,.13,.19);
      }
    }
    const boards=raised?Math.min(floor,ground+.3):floor;
    for(const u of [.04,w-.04])batch.box(f,'trim',u,(boards+top(u))/2,.06,.11,top(u)-boards,.12);
    if(batch.level===0&&w>4&&!home.measured){
      batch.box(f,'metal',w/2,eave-.02,.20,w,.08,.085,'#aaa99e');
      // Downspout ends above grade; all sides use their sampled local ground.
      const h=eave-Math.max(ground+.16,home.base+.15);
      if(h>1)batch.box(f,'metal',w-.15,eave-h/2,.15,.065,h,.065,'#b6b5aa');
    }
  }
  if(home.setbacks?.length)setbackOpenings(batch,home,home.setbacks);
  if(home.layout?.dormers.length&&home.roofSurface)photoDormers(batch,home);
  if(home.openPorch)openPorch(batch,home);
}

/** An open porch cut from a measured body: a deck at the floor from the house
 * wall to the porch front, posts along the front under a beam at the ceiling,
 * railings between them where the deck stands off the ground (open at the
 * steps), and steps down from the door's bay. */
function openPorch(batch:Batch,home:EvidenceBuilding):void{
  const porch=home.openPorch!,line=porch.front,u0=line.u0,width=line.u1-line.u0;
  const f:Frame={start:[line.start[0]+line.tangent[0]*u0,line.start[1]+line.tangent[1]*u0],tangent:line.tangent,outward:line.outward,structId:home.id,tileId:home.tileId};
  const first=home.frames[porch.strips[0].frameIndex],floor=home.entry?.floor??home.floor,ground=Math.min(floor-.05,first.groundMaximum??floor-.3),ceiling=porch.ceiling;
  if(ceiling-floor<2.1||width<1.5)return;
  // The door's place along the porch front, where it stands on the house wall behind.
  const along=(i:number,u:number)=>{const g=home.frames[i];return(g.start[0]-f.start[0])*f.tangent[0]+(g.start[1]-f.start[1])*f.tangent[1]+u;};
  const entry=home.entry,door=Math.max(.7,Math.min(width-.7,entry&&porch.strips.some(s=>s.frameIndex===entry.frameIndex)?along(entry.frameIndex,entry.u):width/2)),rise=floor-ground;
  for(const {frameIndex,depth}of porch.strips){
    const g=home.frames[frameIndex],a=along(frameIndex,0);
    batch.box(f,'foundation',a+g.width/2,(ground+floor)/2-.04,-depth/2,g.width,Math.max(.1,rise-.08),depth,'#838479');
    batch.box(f,'trim',a+g.width/2,floor-.04,-depth/2+.02,g.width+.04,.08,depth+.04,'#8a8c85');
  }
  const posts=Math.max(2,Math.round(width/2.4)+1),at=(i:number)=>.12+i*(width-.24)/(posts-1);
  for(let i=0;i<posts;i++){batch.box(f,'trim',at(i),(floor+ceiling)/2,-.14,.17,ceiling-floor,.17);batch.box(f,'trim',at(i),floor+.14,-.14,.25,.28,.25);}
  batch.box(f,'trim',width/2,ceiling-.11,-.14,width,.22,.22);
  if(rise>.3)for(let i=0;i<posts-1;i++){
    const a=at(i)+.09,b=at(i+1)-.09;
    if(door>a-.5&&door<b+.5)continue;
    batch.box(f,'trim',(a+b)/2,floor+.86,-.14,b-a,.06,.09);
    batch.box(f,'trim',(a+b)/2,floor+.1,-.14,b-a,.05,.07);
    if(batch.level<2)for(let x=a+.1;x<b-.05;x+=.19)batch.box(f,'trim',x,floor+.48,-.14,.035,.76,.035);
  }
  if(rise>.15){const steps=Math.min(8,Math.ceil(rise/.18));for(let i=0;i<steps;i++){const h=rise*(steps-i)/steps;batch.box(f,'foundation',door,ground+h/2-.03,.15+i*.28,1.3,h,.3,'#a19f93');}}
}

/** The storey above the top full one the photograph shows (or the record gives). */
function atticLevel(home:EvidenceBuilding):number{
  const levels=Math.max(1,Math.min(4,Math.ceil(home.stories)));
  return Math.max(levels,...(home.layout?.windows??[]).map(x=>x.level+1));
}
/** Whether a wall's own top at u leaves room for a window on the attic storey:
 * a wall dormer or a gable the survey made of one, not an eave wall. */
function highWall(home:EvidenceBuilding,edge:EvidenceBuilding['frames'][number],u:number):boolean{
  const multi=/FLATS|APARTMENT|CONVERSION|DUPLEX/i.test(home.style),storey=home.floorHeight??(multi?2.85:2.70);
  return !!edge.profile&&Math.min(wallTop(edge.profile,u-.52),wallTop(edge.profile,u+.52))>=home.floor+atticLevel(home)*storey+.72+1.0+.26;
}

/** Dormers the photograph shows on the street slope of a measured roof where
 * the body has none of its own: a gabled (or hipped, or eyebrow) dormer with
 * one window, or a long shed dormer with a row of them. Each stands a little
 * up the slope from the eave, its face a storey-height window tall, its roof
 * running back into the main roof; nothing rises past the ridge. */
function photoDormers(batch:Batch,home:EvidenceBuilding):void{
  const surface=home.roofSurface!,height=roofHeight(surface),wall=buildingMaterial(home),roofColor=surface.color??'#50544e';
  for(const dormer of home.layout!.dormers){
    const edge=home.frames[dormer.frameIndex],f:Frame={...edge,structId:home.id,tileId:home.tileId};
    if(highWall(home,edge,dormer.u))continue;
    const width=Math.min(dormer.width,edge.width-.6);if(width<1.2)continue;
    const u=Math.max(width/2+.3,Math.min(edge.width-width/2-.3,dormer.u));
    const z=(depth:number)=>height(edge.start[0]+edge.tangent[0]*u-edge.outward[0]*depth,edge.start[1]+edge.tangent[1]*u-edge.outward[1]*depth);
    // The roof's rise inward from the wall to its ridge.
    const rise:[number,number][]=[];
    for(let k=0;k<=120;k++){const depth=k*.1,h=z(depth);if(h!==undefined)rise.push([depth,h]);else if(rise.length)break;}
    if(rise.length<10)continue;
    const ridge=rise.reduce((a,b)=>b[1]>a[1]?b:a);
    // The main slope starts past any wall rising from a lower roof in front (a porch's, a wing's).
    let k0=0;for(let k=1;k<rise.length&&rise[k][0]<ridge[0];k++)if(rise[k][1]-rise[k-1][1]>.8)k0=k;
    const slope=rise.slice(k0),eave=slope[0][1],from=slope[0][0];
    if(ridge[1]-eave<1.8||ridge[0]-from<1.2)continue;
    const reach=(level:number,after:number)=>slope.find(([depth,h])=>depth>after&&h>=level)?.[0]??ridge[0];
    // The body's own raised wall there (the survey's dormer, or a gable it made
    // of one) takes the photographed dormer's window, high in its face.
    const measured=home.setbacks?.find(s=>{
      if(s.outward[0]*edge.outward[0]+s.outward[1]*edge.outward[1]<.99)return false;
      const back=(edge.start[0]-s.start[0])*edge.outward[0]+(edge.start[1]-s.start[1])*edge.outward[1];
      const a=(s.start[0]-edge.start[0])*edge.tangent[0]+(s.start[1]-edge.start[1])*edge.tangent[1];
      let top=-Infinity;for(let i=1;i<s.outline.length;i+=2)top=Math.max(top,s.outline[i]);
      return back>from-.2&&back<from+6&&top>=eave+1.2&&u>a-.3&&u<a+s.width+.3;
    });
    if(measured){
      const fits=wallFits(measured),g:Frame={start:measured.start,tangent:measured.tangent,outward:measured.outward,structId:home.id,tileId:home.tileId};
      const at=Math.max(.6,Math.min(measured.width-.6,(edge.start[0]+edge.tangent[0]*u-measured.start[0])*measured.tangent[0]+(edge.start[1]+edge.tangent[1]*u-measured.start[1])*measured.tangent[1]));
      const across=Math.min(.8,measured.width-.7);
      search:for(const tall of [1.1,.9])for(let bottom=eave+.3;bottom<eave+4;bottom+=.1)
        if(across>=.5&&fits(at-across/2-.12,at+across/2+.12,bottom-.12,bottom+tall+.2)){batch.window(g,at,bottom,across,tall,.01);break search;}
      continue;
    }
    const d0=Math.max(from+.4,reach(eave+.4,from)),bottom=(z(d0)??eave)-.05,pitch=.75,overhang=width/2+.15,shed=dormer.kind==='s';
    let top=bottom+1.55;
    const peak=(t:number)=>shed?t:t+overhang*pitch;
    if(peak(top)>ridge[1]-.15)top-=peak(top)-(ridge[1]-.15);
    if(top-bottom<1.1)continue;
    const d1=Math.max(d0+.3,reach(top+.05,d0));
    batch.box(f,wall,u,(bottom+top)/2,-d0+.06,width,top-bottom,.12,home.paint);
    for(const sign of [-1,1])batch.box(f,wall,u+sign*(width/2-.06),(bottom+top)/2,-(d0+d1)/2,.12,top-bottom,d1-d0,home.paint);
    const front=-d0+.25;
    if(shed){
      // A shed roof rising gently back into the main roof.
      const back=reach(top+.02,d0),rear=Math.max(top+.02,(z(back)??top)+.03),e=width/2+.12;
      batch.polygon(f,'roof',[[u-e,top+.02,front],[u+e,top+.02,front],[u+e,rear,-back],[u-e,rear,-back]],roofColor);
      batch.box(f,'trim',u,top-.04,front+.02,width+.26,.14,.06);
    }else{
      const ridgeLine=peak(top),back=Math.max(d1,reach(ridgeLine+.05,d0));
      batch.polygon(f,'roof',[[u-overhang,top-.05,front],[u,ridgeLine,front],[u,ridgeLine,-back],[u-overhang,top-.05,-back]],roofColor);
      batch.polygon(f,'roof',[[u,ridgeLine,front],[u+overhang,top-.05,front],[u+overhang,top-.05,-back],[u,ridgeLine,-back]],roofColor);
      batch.polygon(f,wall,[[u-width/2,top-.01,-d0+.12],[u+width/2,top-.01,-d0+.12],[u,ridgeLine-.08,-d0+.12]],home.paint);
    }
    const tall=Math.min(1.1,top-bottom-.45),n=shed?Math.max(1,Math.floor(width/1.5)):1;
    for(let i=0;i<n;i++)batch.window(f,u-width/2+(i+.5)*width/n,bottom+.25,Math.min(shed?.85:.8,width/n-.5),tall,-d0+.12);
  }
}

/** Whether a rectangle [u0, u1] by [z0, z1] lies inside a setback wall's outline (sampled at its corners, edge middles and centre). */
function wallFits(wall:SetbackWall):(u0:number,u1:number,z0:number,z1:number)=>boolean{
  const o=wall.outline;
  const inside=(u:number,z:number)=>{
    for(let i=0;i<o.length;i+=6){
      const d1=(u-o[i+2])*(o[i+1]-o[i+3])-(o[i]-o[i+2])*(z-o[i+3]),d2=(u-o[i+4])*(o[i+3]-o[i+5])-(o[i+2]-o[i+4])*(z-o[i+5]),d3=(u-o[i])*(o[i+5]-o[i+1])-(o[i+4]-o[i])*(z-o[i+1]);
      if(!((d1<-1e-6||d2<-1e-6||d3<-1e-6)&&(d1>1e-6||d2>1e-6||d3>1e-6)))return true;
    }
    return false;
  };
  return(u0,u1,z0,z1)=>[u0,(u0+u1)/2,u1].every(u=>[z0,(z0+z1)/2,z1].every(z=>inside(u,z)));
}

/** Windows in the measured body's setback walls: each storey's windows where
 * a window and its trim fit inside the wall (lifted a little to clear a roof
 * below), else one shorter window centred in a dormer-sized face. The wall
 * facing the street takes the photographed bays and shutters. */
function setbackOpenings(batch:Batch,home:EvidenceBuilding,walls:readonly SetbackWall[]):void{
  const style=home.style.toUpperCase(),ranch=/RANCH|SPLIT LEVEL/.test(style),multi=/FLATS|APARTMENT|CONVERSION|DUPLEX/.test(style),cape=/CAPE/.test(style);
  const floorHeight=home.floorHeight??(multi?2.85:2.70),levels=Math.max(1,Math.min(4,Math.ceil(home.stories)))+1;
  const windowHeight=ranch?1.25:cape?1.34:multi?1.52:1.45,street=home.frames.find(f=>f.front);
  for(const wall of walls){
    const f:Frame={start:wall.start,tangent:wall.tangent,outward:wall.outward,structId:home.id,tileId:home.tileId},o=wall.outline;
    let low=Infinity;for(let i=1;i<o.length;i+=2)low=Math.min(low,o[i]);
    // A wall down to the ground is the plan's own, where the body's fit strays from it.
    if(low<home.floor+1.2)continue;
    const fits=wallFits(wall);
    const facing=!!street&&street.outward[0]*wall.outward[0]+street.outward[1]*wall.outward[1]>.99;
    const bays=facing&&home.frontageBays&&wall.width/home.frontageBays>1.65?Math.min(12,home.frontageBays):Math.max(1,Math.floor(wall.width/(ranch?3.6:3.15)));
    const pitch=wall.width/bays,even=Math.min(1.05,pitch-.65);
    // A street wall of a photographed front takes the photographed upper windows
    // that fall along it (over a porch or wing roof); others their bays.
    const read=facing&&home.layout?.windows.some(x=>x.level>0)?home.layout.windows.filter(x=>x.level>0).flatMap(x=>{
      const g=home.frames[x.frameIndex],u=(g.start[0]+g.tangent[0]*x.u-wall.start[0])*wall.tangent[0]+(g.start[1]+g.tangent[1]*x.u-wall.start[1])*wall.tangent[1];
      return u>x.width/2&&u<wall.width-x.width/2?[{u,width:x.width,level:x.level,spacing:x.width+1.05}]:[];
    }):undefined;
    const specs=read??(even>=.55?Array.from({length:levels},(_,level)=>Array.from({length:bays},(_,i)=>({u:(i+.5)*pitch,width:even,level,spacing:pitch}))).flat():[]);
    let placed=0;
    for(const {u,width,level,spacing}of specs){
      const standard=home.floor+.72+level*floorHeight;
      for(const lift of [0,.15,.3,.45]){
        const bottom=standard+lift;
        if(!fits(u-width/2-.15,u+width/2+.15,bottom-.14,bottom+windowHeight+.26))continue;
        const shutters=facing&&!!home.shutters&&spacing>1.9&&fits(u-width/2-.5,u+width/2+.5,bottom,bottom+windowHeight);
        batch.window(f,u,bottom,width,windowHeight,.01,width>1.4,shutters);placed++;break;
      }
    }
    if(read)continue;
    if(placed)continue;
    // A dormer or a small gable: one window as tall as the face allows.
    const u=wall.width/2,narrow=Math.min(.95,wall.width-.7);
    if(narrow<.55)continue;
    search:for(const height of [1.2,1.0,.8])for(let bottom=low+.25;bottom<low+2.2;bottom+=.1){
      if(bottom<home.floor+2)continue;
      if(fits(u-narrow/2-.12,u+narrow/2+.12,bottom-.12,bottom+height+.2)){batch.window(f,u,bottom,narrow,height,.01);break search;}
    }
  }
}

function groupedHistoricWindow(batch:Batch,f:Frame,u:number,bottom:number,width:number,height:number):void {
  batch.window(f,u,bottom,width,height,.01);
  const unit=width/3;
  for(const sign of[-1,1])batch.box(f,'trim',u+sign*unit/2,bottom+height/2,.16,.065,height,.07);
  if(batch.level>0)return;
  for(let pane=0;pane<3;pane++){
    const left=u-width/2+unit*pane;
    for(let column=1;column<4;column++)batch.box(f,'trim',left+unit*column/4,bottom+height*.75,.165,.022,height*.5,.027);
    for(let row=1;row<3;row++)batch.box(f,'trim',left+unit/2,bottom+height*(.5+row/6),.165,unit,.022,.027);
  }
}

function homePorch(batch:Batch,home:EvidenceBuilding,f:Frame,w:number,door:number,ground:number,wall:(u:number)=>number,edge:EvidenceBuilding['frames'][number],span?:{u0:number;u1:number}):void {
  const clearance=(edge as typeof edge&{clearanceM?:number}).clearanceM??0;
  if(clearance<1.25||home.floor-ground>1.5)return;
  const stacked=home.porch==='stacked',side=stacked?home.porchSide:undefined;
  const broad=['open','enclosed','wraparound','stacked'].includes(home.porch),depth=Math.min(broad?1.7:1.15,clearance-.25);
  // The photographed extent sets a porch's width and place; else its side or door.
  const full=Math.min(w-.7,span?Math.max(1.6,span.u1-span.u0):side==='full'?w*.86:side?w*.5:broad?w*.72:2.15);
  if(full<1.6||depth<.8)return;
  // A photographed side (as seen from the street) places a stacked porch;
  // otherwise a porch centres on its door.
  const toRight=f.tangent[0]*-f.outward[1]+f.tangent[1]*f.outward[0]>0;
  const place=(width:number,centred:boolean)=>{
    const lo=width/2+.25,hi=w-width/2-.25;
    if(span&&!centred)return Math.max(lo,Math.min(hi,(span.u0+span.u1)/2));
    return centred?w/2:side==='left'?(toRight?lo:hi):side==='right'?(toRight?hi:lo):side?w/2:Math.max(lo,Math.min(hi,door));
  };
  const fits=(u:number,width:number,levels:number)=>Math.min(wall(u-width/2),wall(u),wall(u+width/2))>=home.floor+(levels-1)*2.8+2.65;
  if(stacked){
    // Keep the photographed number of levels where the wall top allows it,
    // narrowing the stack or drawing it in toward a gable's middle first.
    for(let levels=Math.max(1,Math.min(3,home.porchLevels??3));levels>=1;levels--)for(const centred of [false,true])
      for(let width=full;width>=1.6;width-=.4){const u=place(width,centred);if(fits(u,width,levels)){stackedPorch(batch,home,f,ground,u,width,depth,levels);return;}}
    return;
  }
  const width=full,u=place(width,false);
  if(!fits(u,width,1))return;
  const top=home.floor+2.58;
  batch.box(f,'foundation',u,(ground+home.floor)/2,depth/2,width,Math.max(.10,home.floor-ground),depth,'#838479');
  batch.box(f,'trim',u,home.floor-.025,depth/2,width+.1,.14,depth+.12);
  batch.box(f,'roof',u,top,depth/2,width+.4,.14,depth+.32);
  batch.box(f,'trim',u,top-.14,depth+.08,width+.24,.2,.13);
  if(home.porch==='enclosed'){
    const wallHeight=2.38,left=u-width/2,right=u+width/2;
    batch.box(f,buildingMaterial(home),u,home.floor+wallHeight/2,depth,width,wallHeight,.13,home.paint);
    batch.door(f,door,home.floor,depth+.07,.90);
    for(const [a,b]of [[left+.18,door-.68],[door+.68,right-.18]]){
      if(b-a>.62)batch.window(f,(a+b)/2,home.floor+.90,Math.min(1.20,b-a-.10),1.20,depth+.04);
    }
    for(const [at,startV,direction]of [[left,0,1],[right,depth,-1]]){
      const side:Frame={structId:home.id,tileId:home.tileId,
        start:[f.start[0]+f.tangent[0]*at+f.outward[0]*startV,f.start[1]+f.tangent[1]*at+f.outward[1]*startV],
        tangent:[f.outward[0]*direction,f.outward[1]*direction],outward:[-f.tangent[0]*direction,-f.tangent[1]*direction]};
      batch.box(side,buildingMaterial(home),depth/2,home.floor+wallHeight/2,0,depth,wallHeight,.13,home.paint);
      if(depth>1.25)batch.window(side,depth/2,home.floor+.9,Math.min(.9,depth-.5),1.2,.04);
    }
    const rise=home.floor-ground,steps=Math.ceil(rise/.18),available=clearance-depth-.25;
    if(rise>.20&&steps*.24<available){
      for(let i=0;i<steps;i++){
        const h=rise*(steps-i)/steps;
        batch.box(f,'foundation',door,ground+h/2,depth+(i+.5)*.24,1.14,h,.25,'#a19f93');
      }
    }
    return;
  }
  const posts=broad?Math.max(3,Math.ceil(width/3)+1):2;
  for(let i=0;i<posts;i++){
    const x=u-width/2+.14+i*(width-.28)/(posts-1);
    batch.box(f,'trim',x,home.floor+1.24,depth-.1,.15,2.48,.15);
    batch.box(f,'trim',x,home.floor+.14,depth-.1,.23,.28,.23);
  }
  if(broad&&home.floor-ground>.4){
    for(const sign of [-1,1]){
      const a=sign<0?u-width/2:door+.7,b=sign<0?door-.7:u+width/2;
      if(b-a<.3)continue;
      batch.box(f,'trim',(a+b)/2,home.floor+.87,depth-.1,b-a,.065,.10);
      if(batch.level<2)for(let x=a+.13;x<b-.08;x+=.19)batch.box(f,'trim',x,home.floor+.46,depth-.1,.035,.78,.035);
    }
  }
}

/** Porches on every storey of a triple-decker or two-family, each level open
 * (posts and railings) or enclosed as a sunporch, as photographed. */
function stackedPorch(batch:Batch,home:EvidenceBuilding,f:Frame,ground:number,u:number,width:number,depth:number,levels:number):void {
  const storey=2.8,floor=home.floor,a=u-width/2,b=u+width/2,material=buildingMaterial(home),top=floor+(levels-1)*storey+2.58;
  batch.box(f,'foundation',u,(ground+floor)/2,depth/2,width,Math.max(.10,floor-ground),depth,'#838479');
  batch.box(f,'trim',u,floor-.025,depth/2,width+.1,.14,depth+.12);
  batch.box(f,'roof',u,top,depth/2,width+.4,.14,depth+.32);
  batch.box(f,'trim',u,top-.14,depth+.08,width+.24,.2,.13);
  for(let k=0;k<levels;k++){
    const y=floor+k*storey,h=(k<levels-1?storey:2.58)-.1;
    if(k>0)batch.box(f,'trim',u,y-.09,depth/2,width+.1,.18,depth+.12);
    if((k?home.porchUpper:home.porchGround)==='enclosed'){
      // A sunporch: walls under a band of windows, with a door at ground level.
      batch.box(f,material,u,y+h/2,depth,width,h,.13,home.paint);
      const n=Math.max(2,Math.round(width/1.15)),pane=Math.min(1,width/n-.22);
      for(let i=0;i<n;i++){
        const x=a+(i+.5)*width/n;
        if((k===0&&Math.abs(x-u)<.75)||pane<.45)continue;
        batch.window(f,x,y+.85,pane,1.3,depth+.04);
      }
      if(k===0)batch.door(f,u,y,depth+.07,.9);
      for(const [at,startV,direction]of [[a,0,1],[b,depth,-1]]){
        const flank:Frame={structId:home.id,tileId:home.tileId,
          start:[f.start[0]+f.tangent[0]*at+f.outward[0]*startV,f.start[1]+f.tangent[1]*at+f.outward[1]*startV],
          tangent:[f.outward[0]*direction,f.outward[1]*direction],outward:[-f.tangent[0]*direction,-f.tangent[1]*direction]};
        batch.box(flank,material,depth/2,y+h/2,0,depth,h,.13,home.paint);
        if(depth>1.25)batch.window(flank,depth/2,y+.85,Math.min(.9,depth-.5),1.3,.04);
      }
      continue;
    }
    const posts=Math.max(3,Math.ceil(width/3)+1);
    for(let i=0;i<posts;i++){
      const x=a+.14+i*(width-.28)/(posts-1);
      batch.box(f,'trim',x,y+h/2,depth-.1,.15,h,.15);
      if(k===0)batch.box(f,'trim',x,y+.14,depth-.1,.23,.28,.23);
    }
    if(k===0&&floor-ground<=.4)continue;
    // Upper rails run the full width; the ground rail leaves the steps open.
    for(const [s0,s1]of k?[[a,b]]:[[a,u-.7],[u+.7,b]]){
      if(s1-s0<.3)continue;
      batch.box(f,'trim',(s0+s1)/2,y+.87,depth-.1,s1-s0,.065,.10);
      if(batch.level<2)for(let x=s0+.13;x<s1-.08;x+=.19)batch.box(f,'trim',x,y+.46,depth-.1,.035,.78,.035);
    }
  }
}

function roofGeometry(batch:Batch,home:EvidenceBuilding,roof:EvidenceRoof):void {
  const f:Frame={start:[roof.origin[0],-roof.origin[2]],tangent:[1,0],outward:[0,-1],structId:home.id,tileId:home.tileId};
  const decode=(s:string)=>{const bytes=Uint8Array.from(atob(s),c=>c.charCodeAt(0));return new Float32Array(bytes.buffer);};
  for(const chunk of roof.body){
    const role=chunk.role==='wall'?buildingMaterial(home):chunk.role as Role;
    batch.geometry(f,role,decode(chunk.position),decode(chunk.normal),chunk.role==='wall'?home.paint:undefined);
  }
  for(const dormer of roof.dormers??[]){
    const face:Frame={...dormer.frame,structId:home.id,tileId:home.tileId},window=dormer.window,w=dormer.frame.width;
    batch.window(face,window.u,window.bottom,window.width,window.height,0);
    batch.box(face,'trim',w/2,dormer.eave-.04,.12,w+.10,.09,.19);
    for(const side of [0,w]){
      const band=[[side,dormer.eave,.16],[w/2,dormer.peak+.01,.16],
        [w/2,dormer.peak-.075,.16],[side,dormer.eave-.085,.16]];
      batch.polygon(face,'trim',side===0?band.reverse():band);
    }
    if(batch.level===0){
      for(const sign of [-1,1])batch.box(face,'trim',window.u+sign*window.width/6,window.bottom+window.height/2,.15,.025,window.height,.025);
      batch.box(face,'trim',w/2,dormer.eave+.11,.15,.12,.15,.10);
    }
  }
  foundationBand(batch,home);
}

/** A visible foundation band follows the preserved floor datum. Below-grade
 * portions remain occluded by the same terrain used to build the source. */
function foundationBand(batch:Batch,home:EvidenceBuilding):void {
  // A raised ranch's lower level is sided down to a low concrete strip.
  const raised=/RAISED RANCH|SPLIT LEVEL/.test(home.style.toUpperCase());
  for(const edge of home.frames){
    const top=raised?Math.min(home.floor,(edge.groundMaximum??home.floor)+.3):home.floor;
    if(top<=home.base+.15)continue;
    const f={...edge,structId:home.id,tileId:home.tileId};
    batch.box(f,'foundation',edge.width/2,(top+home.base)/2,.022,edge.width,top-home.base,.08,'#858579');
  }
}

export function applyEvidenceBuildings(group:THREE.Object3D,tileId:string,tileOrigin:readonly number[],level:number,rows:readonly EvidenceBuilding[],extras:readonly EvidenceTarget[]=[],buildExtra?:(batch:Batch,matched:ReadonlySet<string>)=>void,roofs:readonly EvidenceRoof[]=[],packetRows:readonly (MeasuredRoof|MeasuredOther|PhotographedHouse)[]=[]):EvidenceReport|undefined {
  if(group.userData.evidenceBuildings)return group.userData.evidenceBuildings as EvidenceReport;
  const measured=packetRows.filter((r):r is MeasuredRoof=>!isMeasuredOther(r)&&!isPhotographedHouse(r)),others=packetRows.filter(isMeasuredOther);
  const photos=new Map(packetRows.filter(isPhotographedHouse).map(r=>[r.id,r]));
  if(!rows.length&&!extras.length&&!others.length)return undefined;
  // A curated roof yields only to a measurement that explains most returns.
  const curated=new Map(roofs.map(r=>[r.id,r]));
  const surveyed=new Map(measured.filter(m=>!curated.has(m.id)||m.q>=.8).map(m=>[m.id,m]));
  const repairs=new Map(roofs.filter(r=>!surveyed.has(r.id)).map(r=>[r.id,r]));
  const extraIds=new Set(extras.map(r=>r.id)),originalHomes=rows.filter(r=>!extraIds.has(r.id)).map(historicAppearance).map(home=>{
    const survey=surveyed.get(home.id);if(survey)return withLayout(measuredHome(home,survey),survey.f?.lo);
    const photo=photos.get(home.id);if(photo)home=photographedHome(home,photo);
    const roof=repairs.get(home.id);
    return withLayout(roof?{...home,base:roof.base,floor:roof.floor,eave:roof.eave,peak:roof.peak,stories:roof.stories,frames:home.frames.map((f,i)=>({...f,eave:roof.frameEaves?.[i]??roof.eave,start:[f.start[0]+f.outward[0]*(roof.frameOutsets?.[i]??0),f.start[1]+f.outward[1]*(roof.frameOutsets?.[i]??0)] as const}))}:home,photo?.f?.lo);
  });
  const moves=new Map(originalHomes.flatMap(home=>{const move=photoDoorMove(home)??garageEntryMove(home);return move?[[home.id,move] as const]:[];}));
  const {homes,stoops}=prepareAddressFrontages(group,tileOrigin,originalHomes,moves),stoopById=new Map(stoops.map(s=>[s.home.id,s]));
  const targets:EvidenceTarget[]=[...homes.map(r=>({...r,material:buildingMaterial(r),replaceOpenings:true,replaceBody:repairs.has(r.id)||surveyed.has(r.id),preserveEntry:shortEntryEnvelope(r),retireEntrySteps:stoopById.get(r.id)?.former})),...extras,
    ...others.map(r=>({id:r.id,tileId,outline:r.ol.map(([x,y])=>[r.o[0]+x/10,r.o[1]+y/10]),base:r.b,peak:r.p??r.b+(r.h??3)+4,replaceBody:r.k!=='v',replaceOpenings:true,
      ...(r.k==='v'&&r.wc?{material:otherRole(r),paint:r.wc}:{})}))];
  const origin=new THREE.Vector3().fromArray(tileOrigin);
  const filtered=filterEvidenceSources(group,origin,targets),batch=new Batch(origin,level);
  for(const row of homes)if(filtered.matched.has(row.id)){
    const survey=surveyed.get(row.id),roof=repairs.get(row.id);
    if(survey){measuredBody(batch,row.id,row.tileId,survey,buildingMaterial(row),row.paint,'#50544e');foundationBand(batch,row);}
    else if(roof)roofGeometry(batch,row,roof);
    homeWindows(batch,row);
    const stoop=stoopById.get(row.id);if(stoop)renderAddressStoop(batch,stoop);
  }
  buildExtra?.(batch,filtered.matched);
  const builtOthers=others.filter(r=>filtered.matched.has(r.id));
  if(builtOthers.length){const ground=tileGround(group,tileOrigin);for(const row of builtOthers)otherBuilding(batch,row,tileId,ground);}
  const built=batch.finish();built.group.name='Evidence-informed Webster buildings';group.add(built.group);
  // Yard dressing keeps clear of added vehicle doors (paving a drive to them)
  // and follows what each house's photograph shows. The tile's openings are
  // gathered after assembly; the doors join them then (mergeVehicleDoors).
  if(batch.garageDoors.length){group.userData.vehicleDoors=[...(group.userData.vehicleDoors??[]),...batch.garageDoors];mergeVehicleDoors(group);}
  const observed=[...measured,...photos.values()].filter(m=>m.f&&filtered.matched.has(m.id)).map(m=>({e:m.o[0],n:m.o[1],b:m.b,mb:m.f!.mb,sh:m.f!.sh,dw:m.f!.dw,
    ...(m.f!.fe&&m.f!.fl?{fe:m.f!.fe,fc:m.f!.fc,fl:m.f!.fl.map(([a,b,c,d])=>[m.o[0]+a/10,m.o[1]+b/10,m.o[0]+c/10,m.o[1]+d/10])}:{})}));
  if(observed.length)group.userData.houseObservations=observed;
  if(stoops.length)group.userData.addressFrontages=stoops.filter(s=>filtered.matched.has(s.home.id)).map(s=>({id:s.home.id,frameIndex:s.home.entry!.frameIndex,entry:s.home.entry,blocks:s.blocks,basis:s.basis}));
  const otherIds=new Set(builtOthers.map(r=>r.id));
  const report:EvidenceReport={version:1,tileId,buildingIds:[...filtered.matched].filter(id=>!otherIds.has(id)).sort(),...(otherIds.size?{otherIds:[...otherIds].sort()}:{}),documentedIds:homes.filter(r=>r.documented&&filtered.matched.has(r.id)).map(r=>r.id),removedTriangles:filtered.removedTriangles,recoloredTriangles:filtered.recoloredTriangles,addedTriangles:built.triangles,addedMeshes:built.group.children.length,geometryBytes:built.bytes};
  group.userData.evidenceBuildings=report;return report;
}
