import index from '../../../data/derived/town/paved-surfaces-index.json';
import type { AssetRef } from './contracts';

type MaskRef=AssetRef & {bounds:[number,number,number,number]};
type PavedMask=MaskRef & {sourceSha256:string;dimensions:number[]};
export function pavedMaskReference(id:string,source:MaskRef):PavedMask|undefined {
  const row=(index.masks as Record<string,AssetRef & {sourceSha256:string;dimensions:number[];bounds:number[]}>)[id];
  return row&&row.sourceSha256===source.sha256&&row.dimensions[0]===272&&row.dimensions[1]===272&&row.bounds.length===4&&row.bounds.every((v,i)=>v===source.bounds[i])?{...row,bounds:[row.bounds[0],row.bounds[1],row.bounds[2],row.bounds[3]]}:undefined;
}
export function parkingFinishAsset(id:string):AssetRef|undefined {return(index.lotAssets as Record<string,AssetRef>)[id];}
export const PAVED_SURFACE_COVERAGE=index.stats;
