import * as THREE from 'three';
import { Batch, frontageMaterial, type Frame, type Role } from './crafted-frontages';
import type { EvidenceBuilding, EvidenceReport, EvidenceRoof } from './evidence-types';
import { historicAppearance } from './historic-appearance';

export type EvidenceTarget = {
  id: string; tileId: string; outline: readonly (readonly number[])[];
  base: number; peak: number; material?: Role; paint?: string;
  replaceBody?: boolean; replaceOpenings?: boolean;
  preserveEntry?: Pick<Frame,'start'|'tangent'|'outward'> & {u:number;floor:number};
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

function homeWindows(batch:Batch,home:EvidenceBuilding):void {
  const style=home.style.toUpperCase(),ranch=/RANCH|SPLIT LEVEL/.test(style),cape=/CAPE/.test(style);
  const colonial=/COLONIAL|FEDERAL|GEORGIAN/.test(style),multi=/FLATS|APARTMENT|CONVERSION|DUPLEX/.test(style);
  for(const [frameIndex,edge]of home.frames.entries()){
    const f:Frame={...edge,structId:home.id,tileId:home.tileId},w=edge.width,eave=edge.eave??home.eave;
    if(w<1.4||eave-home.floor<.7)continue;
    const floorHeight=home.floorHeight??(multi?2.85:2.70),levels=Math.max(1,Math.min(4,Math.ceil(home.stories)));
    const floor=home.floor,ground=edge.groundMaximum??floor-.12;
    const front=edge.front&&w>=3.2;
    const entry=home.entry?.frameIndex===frameIndex?home.entry:undefined;
    const doorU=entry?.u??-100;
    let bays=Math.max(1,Math.floor(w/(ranch?3.6:3.15)));
    if(front&&colonial&&w>8)bays=Math.min(5,Math.max(3,bays%2?bays:bays+1));
    if(front&&home.frontageBays&&home.frontageBays>=2&&w/home.frontageBays>1.65)bays=Math.min(12,home.frontageBays);
    const windowHeight=ranch?1.25:cape?1.34:multi?1.52:1.45;
    for(let level=0;level<levels;level++){
      const bottom=floor+.72+level*floorHeight;
      if(bottom+windowHeight>eave-.26||bottom<ground+.16)continue;
      for(let i=0;i<bays;i++){
        const u=(i+.5)*w/bays;
        if(entry&&Math.abs(u-doorU)<1.15&&bottom<entry.floor+2.2&&bottom+windowHeight>entry.floor)continue;
        const width=Math.min(ranch&&front&&bays<4?1.72:1.05,w/bays-.65);
        if(width<.55)continue;
        batch.window(f,u,bottom,width,windowHeight,.01,ranch&&width>1.4,front&&colonial&&home.material!=='brick'&&w/bays>2.7);
        if(home.year>0&&home.year<1940&&batch.level===0){
          // Six-over-six sash is a period interpretation. Contemporary and
          // modern ranch windows retain their broad, quieter glass panes.
          for(const sign of [-1,1])batch.box(f,'trim',u+sign*width/6,bottom+windowHeight/2,.16,.022,windowHeight,.027);
          for(const fraction of [.25,.75])batch.box(f,'trim',u,bottom+windowHeight*fraction,.16,width,.022,.027);
        }
      }
    }
    if(entry&&entry.floor+2.3<eave){
      // Keep the existing generated doorway aligned with its retained steps.
      // The source checked grade at the doorway, not at the uphill wall corner.
      batch.door(f,doorU,entry.floor,.025,multi?1.08:.96,home.documented?'#45574d':'#465356');
      if(home.porch!=='none'&&home.porchPlacement==='front')homePorch(batch,{...home,floor:entry.floor},f,w,doorU,ground,eave,edge);
    }
    batch.box(f,'trim',w/2,eave-.09,.11,w+.04,.16,.24);
    if(batch.level===0&&home.eaveDetail){
      // The presence and material family come from a dated description. The
      // spacing is an architectural interpretation within the measured wall.
      const bracket=home.eaveDetail==='brackets',brick=home.eaveDetail==='brick-dentils';
      const count=Math.max(2,Math.min(100,Math.floor(w/(bracket?1.35:.32))));
      for(let i=0;i<count;i++){
        const u=(i+.5)*w/count;
        batch.box(f,brick?'brick':'trim',u,eave-(bracket?.33:.22),.13,bracket?.09:.12,bracket?.34:.14,bracket?.26:.21,brick?'#8b6552':undefined);
        if(bracket)batch.box(f,'trim',u,eave-.22,.22,.13,.13,.19);
      }
    }
    for(const u of [.04,w-.04])batch.box(f,'trim',u,(floor+eave)/2,.06,.11,eave-floor,.12);
    if(batch.level===0&&w>4){
      batch.box(f,'metal',w/2,eave-.02,.20,w,.08,.085,'#aaa99e');
      // Downspout ends above grade; all sides use their sampled local ground.
      const h=eave-Math.max(ground+.16,home.base+.15);
      if(h>1)batch.box(f,'metal',w-.15,eave-h/2,.15,.065,h,.065,'#b6b5aa');
    }
  }
}

function homePorch(batch:Batch,home:EvidenceBuilding,f:Frame,w:number,door:number,ground:number,eave:number,edge:EvidenceBuilding['frames'][number]):void {
  const clearance=(edge as typeof edge&{clearanceM?:number}).clearanceM??0;
  if(clearance<1.25||home.floor-ground>1.5||eave<home.floor+2.65)return;
  const broad=['open','enclosed','wraparound'].includes(home.porch),width=Math.min(w-.7,broad?w*.72:2.15),depth=Math.min(broad?1.7:1.15,clearance-.25);
  if(width<1.6||depth<.8)return;
  const u=Math.max(width/2+.25,Math.min(w-width/2-.25,door)),top=home.floor+2.58;
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
  // A visible foundation band follows the preserved floor datum. Below-grade
  // portions remain occluded by the same terrain used to build the source.
  for(const edge of home.frames){
    if(home.floor<=home.base+.15)continue;
    const f={...edge,structId:home.id,tileId:home.tileId};
    batch.box(f,'foundation',edge.width/2,(home.floor+home.base)/2,.022,edge.width,home.floor-home.base,.08,'#858579');
  }
}

export function applyEvidenceBuildings(group:THREE.Object3D,tileId:string,tileOrigin:readonly number[],level:number,rows:readonly EvidenceBuilding[],extras:readonly EvidenceTarget[]=[],buildExtra?:(batch:Batch,matched:ReadonlySet<string>)=>void,roofs:readonly EvidenceRoof[]=[]):EvidenceReport|undefined {
  if(group.userData.evidenceBuildings)return group.userData.evidenceBuildings as EvidenceReport;
  if(!rows.length&&!extras.length)return undefined;
  const repairs=new Map(roofs.map(r=>[r.id,r]));
  const extraIds=new Set(extras.map(r=>r.id)),homes=rows.filter(r=>!extraIds.has(r.id)).map(historicAppearance).map(home=>{
    const roof=repairs.get(home.id);return roof?{...home,base:roof.base,floor:roof.floor,eave:roof.eave,peak:roof.peak,stories:roof.stories,frames:home.frames.map((f,i)=>({...f,eave:roof.frameEaves?.[i]??roof.eave,start:[f.start[0]+f.outward[0]*(roof.frameOutsets?.[i]??0),f.start[1]+f.outward[1]*(roof.frameOutsets?.[i]??0)] as const}))}:home;
  });
  const targets:EvidenceTarget[]=[...homes.map(r=>({...r,material:buildingMaterial(r),replaceOpenings:true,replaceBody:repairs.has(r.id),preserveEntry:shortEntryEnvelope(r)})),...extras];
  const origin=new THREE.Vector3().fromArray(tileOrigin),filtered=filterEvidenceSources(group,origin,targets),batch=new Batch(origin,level);
  for(const row of homes)if(filtered.matched.has(row.id)){
    const roof=repairs.get(row.id);if(roof)roofGeometry(batch,row,roof);
    homeWindows(batch,row);
  }
  buildExtra?.(batch,filtered.matched);
  const built=batch.finish();built.group.name='Evidence-informed Webster buildings';group.add(built.group);
  const report:EvidenceReport={version:1,tileId,buildingIds:[...filtered.matched].sort(),documentedIds:homes.filter(r=>r.documented&&filtered.matched.has(r.id)).map(r=>r.id),removedTriangles:filtered.removedTriangles,recoloredTriangles:filtered.recoloredTriangles,addedTriangles:built.triangles,addedMeshes:built.group.children.length,geometryBytes:built.bytes};
  group.userData.evidenceBuildings=report;return report;
}
