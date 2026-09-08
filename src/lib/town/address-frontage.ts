import * as THREE from 'three';
import catalog from '../../../data/derived/town/historic-appearance.json';
import type {EvidenceBuilding} from './evidence-types';
import {Batch,type Frame} from './crafted-frontages';
import {GrassTerrain} from './grass';

type Correction={frameIndex:number;address:string;outline:number[][];formerEntry:NonNullable<EvidenceBuilding['entry']>;selectedFrame:Pick<EvidenceBuilding['frames'][number],'start'|'tangent'|'outward'|'width'>;clearance:{maximumWidthM:number;maximumProjectionM:number;neighborBuildingIntersections:number;roadEnvelopeClearanceM:number};basis:string};
export type EntryStepEnvelope={frame:Frame;u:number;floor:number};
export type AddressStoop={home:EvidenceBuilding;former:EntryStepEnvelope;blocks:{u:number;v:number;width:number;depth:number;bottom:number;top:number}[];basis:string};
const rows=new Map((catalog.rows as unknown as {id:string;addressFrontage?:Correction}[]).filter(r=>r.addressFrontage).map(r=>[r.id,r.addressFrontage!]));

export function prepareAddressFrontages(group:THREE.Object3D,origin:readonly number[],homes:readonly EvidenceBuilding[]):{homes:EvidenceBuilding[];stoops:AddressStoop[]}{
  const candidates=homes.filter(h=>rows.has(h.id));if(!candidates.length)return{homes:[...homes],stoops:[]};
  group.updateMatrixWorld(true);const inverse=group.matrixWorld.clone().invert(),meshes:THREE.Mesh[]=[];
  group.traverse(o=>{if(!(o instanceof THREE.Mesh)||!/^terrain(?:\b|_)/i.test(o.name))return;const proxy=new THREE.Mesh(o.geometry,o.material);proxy.matrixAutoUpdate=false;proxy.matrixWorld.copy(inverse).multiply(o.matrixWorld);meshes.push(proxy);});
  if(!meshes.length)return{homes:[...homes],stoops:[]};
  const terrain=new GrassTerrain(meshes),stoops:AddressStoop[]=[];
  const changed=homes.map(home=>{
    const row=rows.get(home.id);
    if(!row||home.documented||home.materialBasis!=='inferred'||home.paintBasis!=='inferred'||home.address!==row.address||JSON.stringify(home.outline)!==JSON.stringify(row.outline)||JSON.stringify(home.entry)!==JSON.stringify(row.formerEntry))return home;
    const edge=home.frames[row.frameIndex],old=home.frames[row.formerEntry.frameIndex];if(!edge||!old)return home;
    if(row.clearance.neighborBuildingIntersections!==0||row.clearance.roadEnvelopeClearanceM<=2||edge.width!==row.selectedFrame.width||['start','tangent','outward'].some(key=>(edge[key as 'start']as readonly number[]).some((v,i)=>Math.abs(v-row.selectedFrame[key as 'start'][i])>1e-4)))return home;
    const f:Frame={...edge,structId:home.id,tileId:home.tileId},u=edge.width/2;
    const sample=(x:number,v:number):number|undefined=>{const p=terrain.sample(edge.start[0]+edge.tangent[0]*x+edge.outward[0]*v-origin[0],-edge.start[1]-edge.tangent[1]*x-edge.outward[1]*v-origin[2]);return p?p.y+origin[1]:undefined;};
    const ground=(v:number,width:number,depth:number)=>[-1,0,1].flatMap(a=>[-1,0,1].map(b=>sample(u+a*width/2,v+b*depth/2)));
    const pad=ground(.48,1.45,.96);if(pad.some(y=>y===undefined))return home;
    const heights=pad as number[],floor=Math.max(home.floor,Math.max(...heights)+.15),eave=edge.eave??home.eave;
    if(floor+2.45>=eave||floor-Math.min(...heights)>1.15)return home;
    const blocks=[{u,v:.48,width:1.45,depth:.96,bottom:Math.min(...heights)-.045,top:floor-.025}];
    let joined=false;
    for(let i=1;i<=7;i++){
      const v=.96+(i-.5)*.29,values=ground(v,1.25,.30);if(values.some(y=>y===undefined))return home;
      const ys=values as number[],top=floor-.025-i*.16;
      if(top<=Math.max(...ys)+.08){joined=top>=Math.min(...ys)-.17;break;}
      blocks.push({u,v,width:1.25,depth:.30,bottom:Math.min(...ys)-.045,top});
    }
    if(!joined)return home;
    if(blocks.some(b=>b.width>row.clearance.maximumWidthM||b.v+b.depth/2>row.clearance.maximumProjectionM))return home;
    const corrected={...home,frames:home.frames.map((frame,i)=>({...frame,front:i===row.frameIndex})),entry:{frameIndex:row.frameIndex,u,floor}};
    stoops.push({home:corrected,former:{frame:{...old,structId:home.id,tileId:home.tileId},u:row.formerEntry.u,floor:row.formerEntry.floor},blocks,basis:row.basis});return corrected;
  });
  return{homes:changed,stoops};
}

export function insideFormerEntrySteps(point:THREE.Vector3,entry:EntryStepEnvelope):boolean{
  const f=entry.frame,x=point.x-f.start[0],n=-point.z-f.start[1],u=x*f.tangent[0]+n*f.tangent[1],v=x*f.outward[0]+n*f.outward[1];
  return Math.abs(u-entry.u)<=.72&&v>=.15&&v<=4.6&&point.y>=entry.floor-3.0&&point.y<=entry.floor+.02;
}

export function renderAddressStoop(batch:Batch,stoop:AddressStoop):void{
  const edge=stoop.home.frames[stoop.home.entry!.frameIndex],frame:Frame={...edge,structId:stoop.home.id,tileId:stoop.home.tileId};
  for(const block of stoop.blocks)batch.box(frame,'stone',block.u,(block.top+block.bottom)/2,block.v,block.width,block.top-block.bottom,block.depth,'#a3a297');
}
