import homes from '../../../data/derived/town/residential-evidence-index.json';
import roofs from '../../../data/derived/town/evidence-roofs-index.json';
import type { EvidenceBuilding, EvidenceRoof } from './evidence-types';

type Asset={url:string;count:number;bytes:number};
export type TileEvidence={buildings:EvidenceBuilding[];roofs:EvidenceRoof[];failures:number};
const homeAssets:Record<string,Asset>=homes.tiles,roofAssets:Record<string,Asset>=roofs.tiles;
export const BUILDING_EVIDENCE_COVERAGE={homes:homes.count,documented:homes.documentedCount,roofs:roofs.count};

const numbers=(v:unknown,size?:number):v is number[]=>Array.isArray(v)&&(size===undefined||v.length===size)&&v.every(x=>typeof x==='number'&&Number.isFinite(x));
function validBuilding(value:unknown,id:string):value is EvidenceBuilding{
  if(!value||typeof value!=='object')return false;
  const r=value as EvidenceBuilding;
  return typeof r.id==='string'&&r.tileId===id&&typeof r.style==='string'&&typeof r.address==='string'&&
    numbers([r.base,r.floor,r.eave,r.peak,r.stories,r.year])&&r.eave>r.floor&&r.peak>=r.eave&&
    Array.isArray(r.outline)&&r.outline.length>=3&&r.outline.every(p=>numbers(p,2))&&
    Array.isArray(r.frames)&&r.frames.length>0&&r.frames.every(f=>f&&numbers(f.start,2)&&numbers(f.tangent,2)&&numbers(f.outward,2)&&Number.isFinite(f.width)&&f.width>0&&typeof f.front==='boolean'&&(f.eave===undefined||Number.isFinite(f.eave))&&(f.groundMaximum===undefined||Number.isFinite(f.groundMaximum)))&&
    (r.entry==null||Number.isInteger(r.entry.frameIndex)&&r.entry.frameIndex>=0&&r.entry.frameIndex<r.frames.length&&numbers([r.entry.u,r.entry.floor])&&r.entry.u>=0&&r.entry.u<=r.frames[r.entry.frameIndex].width+.001)&&
    ['siding','brick','stone','stucco','shingle'].includes(r.material)&&/^#[0-9a-f]{6}$/i.test(r.paint)&&
    Array.isArray(r.evidenceIds)&&r.evidenceIds.every(x=>typeof x==='string');
}
function validRoof(value:unknown,id:string):value is EvidenceRoof{
  if(!value||typeof value!=='object')return false;
  const r=value as EvidenceRoof;
  return typeof r.id==='string'&&r.tileId===id&&numbers([r.base,r.floor,r.eave,r.peak,r.stories,r.sourceMaximum])&&
    r.peak<=r.sourceMaximum+.001&&r.peak>r.eave&&numbers(r.origin,3)&&
    (r.frameEaves===undefined||numbers(r.frameEaves))&&
    (r.frameOutsets===undefined||numbers(r.frameOutsets)&&r.frameOutsets.every(v=>v>=0&&v<.5))&&
    (r.dormers===undefined||Array.isArray(r.dormers)&&r.dormers.every(d=>d&&d.frame&&numbers(d.frame.start,2)&&numbers(d.frame.tangent,2)&&numbers(d.frame.outward,2)&&d.window&&numbers([d.frame.width,d.bottom,d.eave,d.peak,d.window.u,d.window.bottom,d.window.width,d.window.height])&&d.frame.width>0&&d.window.width>0&&d.window.height>0&&d.peak<=r.peak+.001&&d.window.bottom+d.window.height<d.eave&&d.window.u-d.window.width/2>0&&d.window.u+d.window.width/2<d.frame.width))&&
    Array.isArray(r.outline)&&r.outline.length>=3&&r.outline.every(p=>numbers(p,2))&&
    Array.isArray(r.body)&&r.body.length>0&&r.body.every(c=>{
      if(!c||!['wall','roof','foundation'].includes(c.role)||!Number.isInteger(c.vertices)||c.vertices<=0||c.vertices%3||typeof c.position!=='string'||typeof c.normal!=='string')return false;
      try{return [c.position,c.normal].every(s=>{
        const bytes=Uint8Array.from(atob(s),c=>c.charCodeAt(0));
        return bytes.length===c.vertices*12&&new Float32Array(bytes.buffer).every(Number.isFinite);
      });}catch{return false;}
    });
}

/** Optional detail payloads download beside the street tile. A missing supplement
 * leaves its original scenery usable. Aborted requests never enter the cache. */
export class EvidenceStream {
  private cache=new Map<string,TileEvidence>();
  failures=0;
  constructor(private readonly read:<T>(url:string,signal:AbortSignal)=>Promise<T>,private readonly budgetMs=1500){}
  async tile(id:string,signal:AbortSignal):Promise<TileEvidence>{
    if(signal.aborted)throw new DOMException('Loading cancelled','AbortError');
    const cached=this.cache.get(id);
    if(cached){this.cache.delete(id);this.cache.set(id,cached);return cached;}
    const houseAsset=homeAssets[id],roofAsset=roofAssets[id];
    if(!houseAsset&&!roofAsset)return{buildings:[],roofs:[],failures:0};
    const controller=new AbortController();let release!:()=>void;
    const deadline=new Promise<undefined>(resolve=>{release=()=>resolve(undefined);});
    const cancel=()=>{controller.abort();release();};
    signal.addEventListener('abort',cancel,{once:true});const timer=setTimeout(cancel,this.budgetMs);
    type Homes={version:number;tileId:string;buildings:EvidenceBuilding[]}|undefined;
    let completedHomes:PromiseSettledResult<Homes>|undefined,completedRoofs:PromiseSettledResult<EvidenceRoof[]|undefined>|undefined;
    const observe=<T>(request:Promise<T>,settled:(value:PromiseSettledResult<T>)=>void)=>request.then(value=>{settled({status:'fulfilled',value});return value;},reason=>{settled({status:'rejected',reason});throw reason;});
    const request=<T>(start:()=>Promise<T>|T):Promise<T>=>{try{return Promise.resolve(start());}catch(error){return Promise.reject(error);}};
    const pending=Promise.allSettled([
      observe(request(()=>houseAsset?this.read<Exclude<Homes,undefined>>(houseAsset.url,controller.signal):undefined),v=>{completedHomes=v;}),
      observe(request(()=>roofAsset?this.read<EvidenceRoof[]>(roofAsset.url,controller.signal):undefined),v=>{completedRoofs=v;}),
    ]);
    const raced=await Promise.race([pending,deadline]);
    clearTimeout(timer);signal.removeEventListener('abort',cancel);
    if(signal.aborted)throw new DOMException('Loading cancelled','AbortError');
    const results=raced??[completedHomes??{status:'rejected',reason:'Optional detail deadline'},completedRoofs??{status:'rejected',reason:'Optional detail deadline'}] as const;
    const a=results[0],b=results[1];
    const buildings=a.status==='fulfilled'&&a.value?.version===1&&a.value.tileId===id&&Array.isArray(a.value.buildings)&&a.value.buildings.length===houseAsset?.count&&a.value.buildings.every(r=>validBuilding(r,id))&&new Set(a.value.buildings.map(r=>r.id)).size===a.value.buildings.length?a.value.buildings:[];
    const roofRows=b.status==='fulfilled'&&Array.isArray(b.value)&&b.value.length===roofAsset?.count&&b.value.every(r=>validRoof(r,id))&&new Set(b.value.map(r=>r.id)).size===b.value.length?b.value:[];
    const failures=Number(!!houseAsset&&!buildings.length)+Number(!!roofAsset&&!roofRows.length);
    this.failures+=failures;
    const value={buildings,roofs:roofRows,failures};
    // Failed optional requests are retried on a later tile load.
    if(!failures){this.cache.set(id,value);if(this.cache.size>64)this.cache.delete(this.cache.keys().next().value!);}
    return value;
  }
  dispose():void{this.cache.clear();}
}
