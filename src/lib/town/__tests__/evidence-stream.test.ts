// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import homeIndex from '../../../../data/derived/town/residential-evidence-index.json';
import roofIndex from '../../../../data/derived/town/evidence-roofs-index.json';
import { EvidenceStream } from '../evidence-stream';
import type { EvidenceBuilding, EvidenceRoof } from '../evidence-types';

type Asset={url:string;count:number};
const homes:Record<string,Asset>=homeIndex.tiles,roofs:Record<string,Asset>=roofIndex.tiles;
const both=Object.keys(roofs).find(id=>homes[id])!;
const onlyHome=Object.keys(homes).find(id=>!roofs[id])!;
const encoded=(values:number[])=>Buffer.from(new Float32Array(values).buffer).toString('base64');
function building(tileId:string,id:string):EvidenceBuilding{return{id,tileId,address:'Fixture',outline:[[0,0],[10,0],[10,10],[0,10],[0,0]],
  frames:[{start:[0,0],tangent:[1,0],outward:[0,-1],width:10,front:true,eave:8,groundMaximum:1}],
  base:1,floor:1.3,eave:8,peak:11,stories:2,style:'COLONIAL',year:1920,material:'siding',paint:'#d9d5c8',
  roof:'gable',porch:'none',documented:false,evidenceIds:[],colorsDated:false};}
function roof(tileId:string,id:string):EvidenceRoof{return{id,tileId,outline:[[0,0],[10,0],[10,10],[0,10],[0,0]],base:1,
  origin:[0,0,0],floor:1.3,eave:8,peak:11,stories:2,sourceMaximum:11,
  body:[{role:'roof',position:encoded([0,8,0,10,8,0,0,11,-5]),normal:encoded([0,1,0,0,1,0,0,1,0]),vertices:3}]};}
function payload(url:string):unknown {
  for(const[id,a]of Object.entries(homes))if(a.url===url)return{version:1,tileId:id,buildings:Array.from({length:a.count},(_,i)=>building(id,`home-${i}`))};
  for(const[id,a]of Object.entries(roofs))if(a.url===url)return Array.from({length:a.count},(_,i)=>roof(id,`roof-${i}`));
  throw new Error('Unexpected fixture URL: '+url);
}
const signal=()=>new AbortController().signal;
const streamWith=(read:(url:string,signal:AbortSignal)=>Promise<unknown>,budgetMs?:number)=>new EvidenceStream(<T>(url:string,s:AbortSignal)=>read(url,s) as Promise<T>,budgetMs);
const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
afterEach(()=>vi.useRealTimers());

describe('optional per-tile building evidence streaming',()=>{
  it('accepts every generated tile and keeps boundary-crossing homes with their immutable source mesh',async()=>{
    const stream=streamWith(async url=>JSON.parse(readFileSync(resolve('public',url.slice(1)),'utf8')));
    const loaded=new Map<string,EvidenceBuilding>();let repairCount=0;
    for(const id of new Set([...Object.keys(homes),...Object.keys(roofs)])){
      const result=await stream.tile(id,signal());expect(result.failures,id).toBe(0);
      expect(result.buildings,id).toHaveLength(homes[id]?.count??0);expect(result.roofs,id).toHaveLength(roofs[id]?.count??0);
      for(const row of result.buildings){expect(loaded.has(row.id),row.id).toBe(false);loaded.set(row.id,row);}
      repairCount+=result.roofs.length;
    }
    expect(loaded.size).toBe(homeIndex.count);expect(repairCount).toBe(roofIndex.count);
    // Whole meshes use the original export registration. These seven later
    // roofprint centroids are across a cell edge from that immutable ownership.
    const sourceOwnership:Record<string,string>={'168503_865839':'-12_-7','168026_866480':'-13_-5','170790_866339':'-2_-5',
      '170658_864838':'-3_-11','169533_870046':'-8_9','169532_869320':'-7_6','169125_867839':'-9_1'};
    for(const[id,tile]of Object.entries(sourceOwnership))expect(loaded.get(id)?.tileId,id).toBe(tile);
    expect(stream.failures).toBe(0);stream.dispose();
  });
  it('does not fetch absent tiles and starts both known payloads concurrently',async()=>{
    const finishes=new Map<string,(value:unknown)=>void>();
    const read=vi.fn((url:string)=>new Promise<unknown>(resolve=>finishes.set(url,resolve)));
    const stream=streamWith(read);
    expect(await stream.tile('no-such-tile',signal())).toEqual({buildings:[],roofs:[],failures:0});expect(read).not.toHaveBeenCalled();
    const pending=stream.tile(both,signal());expect(read).toHaveBeenCalledTimes(2);
    for(const[url,finish]of finishes)finish(payload(url));
    const result=await pending;expect(result.buildings).toHaveLength(homes[both].count);expect(result.roofs).toHaveLength(roofs[both].count);
    expect(result.failures).toBe(0);
  });
  it('keeps successful homes usable when roof detail fails and retries the missing detail later',async()=>{
    let fail=true;const read=vi.fn(async(url:string)=>{if(fail&&url===roofs[both].url)throw new Error('optional detail unavailable');return payload(url);});
    const stream=streamWith(read),first=await stream.tile(both,signal());
    expect(first.buildings).toHaveLength(homes[both].count);expect(first.roofs).toEqual([]);expect(first.failures).toBe(1);
    fail=false;const retry=await stream.tile(both,signal());expect(retry.roofs).toHaveLength(roofs[both].count);
    const afterRetry=read.mock.calls.length;expect(await stream.tile(both,signal())).toBe(retry);expect(read).toHaveBeenCalledTimes(afterRetry);
  });
  it('does not cache an aborted response that finishes after cancellation',async()=>{
    const finishes:((value:unknown)=>void)[]=[];const read=vi.fn((url:string)=>new Promise<unknown>(resolve=>finishes.push(value=>resolve(value??payload(url)))));
    const stream=streamWith(read),controller=new AbortController(),first=stream.tile(onlyHome,controller.signal);
    const rejection=expect(first).rejects.toMatchObject({name:'AbortError'});controller.abort();finishes[0](undefined);await rejection;
    const retry=stream.tile(onlyHome,signal());expect(read).toHaveBeenCalledTimes(2);finishes[1](undefined);expect((await retry).failures).toBe(0);
  });
  it('rejects an already-aborted request even when the tile is cached',async()=>{
    const read=vi.fn(async(url:string)=>payload(url)),stream=streamWith(read);await stream.tile(onlyHome,signal());
    const controller=new AbortController();controller.abort();await expect(stream.tile(onlyHome,controller.signal)).rejects.toMatchObject({name:'AbortError'});
    expect(read).toHaveBeenCalledTimes(1);
  });
  it('rejects wrong envelopes, counts and invalid building rows without poisoning retries',async()=>{
    const corruptions=[
      (p:any)=>({...p,tileId:'another-tile'}),
      (p:any)=>({...p,version:99}),
      (p:any)=>({...p,buildings:[]}),
      (p:any)=>({...p,buildings:p.buildings.map(()=>null)}),
      (p:any)=>({...p,buildings:p.buildings.map((r:any)=>({...r,frames:null}))}),
      (p:any)=>({...p,buildings:p.buildings.map((r:any)=>({...r,floor:NaN}))}),
    ];
    for(const corrupt of corruptions){let broken=true;const read=vi.fn(async(url:string)=>broken?corrupt(payload(url)):payload(url));
      const stream=streamWith(read),result=await stream.tile(onlyHome,signal());expect(result.buildings).toEqual([]);expect(result.failures).toBe(1);
      broken=false;expect((await stream.tile(onlyHome,signal())).buildings).toHaveLength(homes[onlyHome].count);expect(read).toHaveBeenCalledTimes(2);
    }
  });
  it('rejects malformed roof rows while preserving the valid home payload',async()=>{
    const read=vi.fn(async(url:string)=>url===roofs[both].url?Array.from({length:roofs[both].count},()=>null):payload(url));
    const result=await streamWith(read).tile(both,signal());expect(result.buildings).toHaveLength(homes[both].count);expect(result.roofs).toEqual([]);expect(result.failures).toBe(1);
  });
  it('bounds optional network stalls so the source scenery can proceed',async()=>{
    vi.useFakeTimers();const read=vi.fn((_url:string,_signal:AbortSignal)=>new Promise<unknown>(()=>{}));
    const stream=streamWith(read);let result:Awaited<ReturnType<EvidenceStream['tile']>>|undefined;
    const pending=stream.tile(onlyHome,signal()).then(value=>{result=value;});await flush();
    await vi.advanceTimersByTimeAsync(10_000);expect(result).toEqual({buildings:[],roofs:[],failures:1});await pending;
    expect(read.mock.calls[0][1].aborted).toBe(true);
  });
  it('preserves completed homes when only the roof sibling exceeds its optional deadline',async()=>{
    vi.useFakeTimers();const read=vi.fn((url:string)=>url===roofs[both].url?new Promise<unknown>(()=>{}):Promise.resolve(payload(url)));
    const stream=streamWith(read,20),pending=stream.tile(both,signal());await flush();await vi.advanceTimersByTimeAsync(25);
    const result=await pending;expect(result.buildings).toHaveLength(homes[both].count);expect(result.roofs).toEqual([]);expect(result.failures).toBe(1);
  });
  it('starts its evidence grace only after base scenery arrives and never revives after disposal',async()=>{
    vi.useFakeTimers();let baseDone!:()=>void,homeDone!:(value:unknown)=>void;
    const base=new Promise<void>(resolve=>{baseDone=resolve;});
    const stream=streamWith(url=>new Promise(resolve=>{homeDone=()=>resolve(payload(url));}),100);
    const result=stream.tile(onlyHome,signal(),base);
    await vi.advanceTimersByTimeAsync(9000);baseDone();await vi.advanceTimersByTimeAsync(80);homeDone(undefined);
    expect((await result).failures).toBe(0);
    const stalled=streamWith(()=>new Promise(()=>{}),10000),pending=stalled.tile(onlyHome,signal());
    const rejected=expect(pending).rejects.toMatchObject({name:'AbortError'});stalled.dispose();await rejected;
    expect(stalled.resources().entries).toBe(0);
  });
  it('evicts least-recently-used successful payloads and clears its cache on dispose',async()=>{
    const read=vi.fn(async(url:string)=>payload(url)),stream=streamWith(read),ids=Object.keys(homes).slice(0,65);
    for(const id of ids.slice(0,64))await stream.tile(id,signal());const before=read.mock.calls.length;
    await stream.tile(ids[0],signal());expect(read).toHaveBeenCalledTimes(before);
    await stream.tile(ids[64],signal());const afterNew=read.mock.calls.length;
    await stream.tile(ids[0],signal());expect(read).toHaveBeenCalledTimes(afterNew);
    await stream.tile(ids[1],signal());expect(read.mock.calls.length).toBeGreaterThan(afterNew);
    stream.dispose();const afterDispose=read.mock.calls.length;await expect(stream.tile(ids[0],signal())).rejects.toMatchObject({name:'AbortError'});expect(read).toHaveBeenCalledTimes(afterDispose);
  });
});
