import * as THREE from 'three';
import catalog from '../../../data/derived/town/historic-appearance.json';
import type {EvidenceBuilding} from './evidence-types';
import {Batch,type Frame} from './crafted-frontages';
import {GrassTerrain} from './grass';

/** The wall a door needs over its sill: a Cape's low eave (its frieze meeting the door's head) is enough. */
export const DOOR_ROOM=2.2;
/** A split foyer: a raised ranch or split level by its record, or one its
 * photograph shows (evidence-buildings.ts). Its entrance opens on a landing a
 * step or two over the ground, half a storey under its main floor. */
export function splitFoyer(home:EvidenceBuilding):boolean{
  return home.splitFoyer===true||/RAISED RANCH|SPLIT LEVEL/i.test(home.style);
}
/** A split foyer's landing over the ground in front of its door. */
export const LANDING=.35;

type Correction={frameIndex:number;address:string;outline:number[][];formerEntry:NonNullable<EvidenceBuilding['entry']>;selectedFrame:Pick<EvidenceBuilding['frames'][number],'start'|'tangent'|'outward'|'width'>;clearance:{maximumWidthM:number;maximumProjectionM:number;neighborBuildingIntersections:number;roadEnvelopeClearanceM:number};basis:string};
export type EntryStepEnvelope={frame:Frame;u:number;floor:number};
export type AddressStoop={home:EvidenceBuilding;former:EntryStepEnvelope;blocks:{u:number;v:number;width:number;depth:number;bottom:number;top:number}[];basis:string};
const rows=new Map((catalog.rows as unknown as {id:string;addressFrontage?:Correction}[]).filter(r=>r.addressFrontage).map(r=>[r.id,r.addressFrontage!]));

/** Entries moved to another wall: by the reviewed address catalog, or, in
 * `moves`, where photographed garage doors take the wall the plan gave the
 * door. Each moved door gets a stoop fitted to the sampled ground and retires
 * the steps of the former entry. */
export function prepareAddressFrontages(group:THREE.Object3D,origin:readonly number[],homes:readonly EvidenceBuilding[],moves:ReadonlyMap<string,{frameIndex:number;u:number;basis?:string;alternatives?:readonly {frameIndex:number;u:number}[]}>=new Map(),fitRoad?:(frame:Frame,blocks:AddressStoop['blocks'])=>AddressStoop['blocks']|undefined):{homes:EvidenceBuilding[];stoops:AddressStoop[]}{
  const candidates=homes.filter(h=>rows.has(h.id)||moves.has(h.id));if(!candidates.length)return{homes:[...homes],stoops:[]};
  group.updateMatrixWorld(true);const inverse=group.matrixWorld.clone().invert(),meshes:THREE.Mesh[]=[];
  group.traverse(o=>{if(!(o instanceof THREE.Mesh)||!/^terrain(?:\b|_)/i.test(o.name))return;const proxy=new THREE.Mesh(o.geometry,o.material);proxy.matrixAutoUpdate=false;proxy.matrixWorld.copy(inverse).multiply(o.matrixWorld);meshes.push(proxy);});
  if(!meshes.length)return{homes:[...homes],stoops:[]};
  const terrain=new GrassTerrain(meshes),stoops:AddressStoop[]=[];
  /** A landing and steps down to the sampled ground in front of a door at u. */
  const stoopAt=(home:EvidenceBuilding,edge:EvidenceBuilding['frames'][number],u:number):{floor:number;blocks:AddressStoop['blocks']}|undefined=>{
    const sample=(x:number,v:number):number|undefined=>{const p=terrain.sample(edge.start[0]+edge.tangent[0]*x+edge.outward[0]*v-origin[0],-edge.start[1]-edge.tangent[1]*x-edge.outward[1]*v-origin[2]);return p?p.y+origin[1]:undefined;};
    const ground=(v:number,width:number,depth:number)=>[-1,0,1].flatMap(a=>[-1,0,1].map(b=>sample(u+a*width/2,v+b*depth/2)));
    const pad=ground(.48,1.45,.96);if(pad.some(y=>y===undefined))return undefined;
    // The wall must stand a door's height over the landing where the door goes
    // (a measured wall top may step down to a wing elsewhere on the same wall).
    const profile=edge.profile,top=(x:number)=>{
      if(!profile)return edge.eave??home.eave;
      let h=profile[0][1];for(let k=1;k<profile.length;k++)if(x>=profile[k-1][0])h=profile[k][0]-profile[k-1][0]>1e-6?profile[k-1][1]+(profile[k][1]-profile[k-1][1])*Math.min(1,(x-profile[k-1][0])/(profile[k][0]-profile[k-1][0])):Math.min(profile[k-1][1],profile[k][1]);
      return h;
    };
    // A split foyer's door opens on its landing, a step or two up from the ground.
    const heights=pad as number[],floor=Math.max(splitFoyer(home)?Math.min(home.floor,Math.max(...heights)+LANDING):home.floor,Math.max(...heights)+.15),eave=Math.min(top(u-.6),top(u),top(u+.6));
    if(floor+DOOR_ROOM>=eave||floor-Math.min(...heights)>1.15)return undefined;
    const blocks=[{u,v:.48,width:1.45,depth:.96,bottom:Math.min(...heights)-.045,top:floor-.025}];
    for(let i=1;i<=7;i++){
      const v=.96+(i-.5)*.29,values=ground(v,1.25,.30);if(values.some(y=>y===undefined))return undefined;
      const ys=values as number[],top=floor-.025-i*.16;
      if(top<=Math.max(...ys)+.08){
        if(top<Math.min(...ys)-.17)return undefined;
        const fitted=fitRoad?fitRoad({...edge,structId:home.id,tileId:home.tileId},blocks):blocks;
        return fitted?{floor,blocks:fitted}:undefined;
      }
      blocks.push({u,v,width:1.25,depth:.30,bottom:Math.min(...ys)-.045,top});
    }
    return undefined;
  };
  const changed=homes.map(home=>{
    const row=rows.get(home.id),move=moves.get(home.id);
    if(!row&&move&&home.entry){
      const old=home.frames[home.entry.frameIndex];if(!old)return home;
      // The first of the move's places (in order) where a stoop fits the ground.
      let place:{frameIndex:number;u:number}|undefined,stoop:ReturnType<typeof stoopAt>;
      for(const p of [move,...(move.alternatives??[])]){const edge=home.frames[p.frameIndex];if(edge&&(stoop=stoopAt(home,edge,p.u))){place=p;break;}}
      if(!place||!stoop)return home;
      const corrected={...home,frames:home.frames.map((frame,i)=>({...frame,front:i===place!.frameIndex})),entry:{frameIndex:place.frameIndex,u:place.u,floor:stoop.floor}};
      stoops.push({home:corrected,former:{frame:{...old,structId:home.id,tileId:home.tileId},u:home.entry.u,floor:home.entry.floor},blocks:stoop.blocks,
        basis:move.basis??'Photographed garage doors fill the planned entry wall.'});
      return corrected;
    }
    if(!row||home.documented||home.materialBasis!=='inferred'||home.paintBasis!=='inferred'||home.address!==row.address||JSON.stringify(home.outline)!==JSON.stringify(row.outline)||JSON.stringify(home.entry)!==JSON.stringify(row.formerEntry))return home;
    const edge=home.frames[row.frameIndex],old=home.frames[row.formerEntry.frameIndex];if(!edge||!old)return home;
    if(row.clearance.neighborBuildingIntersections!==0||row.clearance.roadEnvelopeClearanceM<=2||edge.width!==row.selectedFrame.width||['start','tangent','outward'].some(key=>(edge[key as 'start']as readonly number[]).some((v,i)=>Math.abs(v-row.selectedFrame[key as 'start'][i])>1e-4)))return home;
    const u=edge.width/2,stoop=stoopAt(home,edge,u);if(!stoop)return home;
    const {floor,blocks}=stoop;
    if(blocks.some(b=>b.width>row.clearance.maximumWidthM||b.v+b.depth/2>row.clearance.maximumProjectionM))return home;
    const corrected={...home,frames:home.frames.map((frame,i)=>({...frame,front:i===row.frameIndex})),entry:{frameIndex:row.frameIndex,u,floor}};
    stoops.push({home:corrected,former:{frame:{...old,structId:home.id,tileId:home.tileId},u:row.formerEntry.u,floor:row.formerEntry.floor},blocks,basis:row.basis});return corrected;
  });
  return{homes:changed,stoops};
}

/** The tile's terrain height at east/north points; the index is built on first use. */
export function tileGround(group:THREE.Object3D,origin:readonly number[],minimumNormalY=.78):(e:number,n:number)=>number|undefined{
  let terrain:GrassTerrain|null|undefined;
  return (e,n)=>{
    if(terrain===undefined){
      group.updateMatrixWorld(true);const inverse=group.matrixWorld.clone().invert(),meshes:THREE.Mesh[]=[];
      group.traverse(o=>{if(!(o instanceof THREE.Mesh)||!/^terrain(?:\b|_)/i.test(o.name))return;const proxy=new THREE.Mesh(o.geometry,o.material);proxy.matrixAutoUpdate=false;proxy.matrixWorld.copy(inverse).multiply(o.matrixWorld);meshes.push(proxy);});
      terrain=meshes.length?new GrassTerrain(meshes,minimumNormalY):null;
    }
    const p=terrain?.sample(e-origin[0],-n-origin[2]);return p?p.y+origin[1]:undefined;
  };
}

export function insideFormerEntrySteps(point:THREE.Vector3,entry:EntryStepEnvelope):boolean{
  const f=entry.frame,x=point.x-f.start[0],n=-point.z-f.start[1],u=x*f.tangent[0]+n*f.tangent[1],v=x*f.outward[0]+n*f.outward[1];
  return Math.abs(u-entry.u)<=.72&&v>=.15&&v<=4.6&&point.y>=entry.floor-3.0&&point.y<=entry.floor+.02;
}

export function renderAddressStoop(batch:Batch,stoop:AddressStoop):void{
  const edge=stoop.home.frames[stoop.home.entry!.frameIndex],frame:Frame={...edge,structId:stoop.home.id,tileId:stoop.home.tileId};
  for(const block of stoop.blocks)batch.box(frame,'stone',block.u,(block.top+block.bottom)/2,block.v,block.width,block.top-block.bottom,block.depth,'#a3a297');
}
