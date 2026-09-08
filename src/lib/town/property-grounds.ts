import * as THREE from 'three';
import catalog from '../../../data/derived/town/property-grounds.json';
import {applyGroundedSiteFeatures,type GroundedSiteRecord} from './arrival-grounds';
import type {V3} from './contracts';

const tiles=catalog.tiles as Record<string,{origin:number[];lods:{level:number;sha256:string}[];features:string[]}>;
const records=new Map<string,GroundedSiteRecord>();
/** Registered paving remains a dated observation; door connections and modest
 * planting are authored interpretations. Shared indexed coordinates are exact. */
export function propertyGroundRecord(tileId:string):GroundedSiteRecord|undefined {
 const tile=tiles[tileId];if(!tile)return;
 if(records.has(tileId))return records.get(tileId);
 const ids=new Set(tile.features);
 const record={...tile,features:catalog.features.filter(f=>ids.has(f.id)).map(f=>({...f,basis:catalog.policy,triangles:Array.from({length:f.indices.length/3},(_,i)=>f.indices.slice(i*3,i*3+3).map(k=>f.points[k]))}))};
 records.set(tileId,record);return record;
}
export function applyPropertyGrounds(group:THREE.Group,tileId:string,origin:V3,level:number,sha256:string){
 const report=applyGroundedSiteFeatures(group,tileId,origin,level,sha256,propertyGroundRecord(tileId),'propertyGrounds','Residential entrances and paving');
 if(report?.status==='applied'&&!group.userData.propertyTreeExclusions){
  // Only observed clear paved footprints suppress source tree anchors.
  const paths=propertyGroundRecord(tileId)!.features.filter(f=>f.kind==='driveway').flatMap(f=>f.triangles);
  group.userData.environmentTreeExclusions=[...(group.userData.environmentTreeExclusions??[]),...paths];
  group.userData.propertyTreeExclusions=true;
 }
 return report;
}
