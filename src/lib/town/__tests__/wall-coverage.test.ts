// @vitest-environment node
import {describe,it,expect} from 'vitest';
import {wallCoverage} from '../wall-coverage';
import {readFileSync} from 'node:fs';
import roofIndex from '../../../../data/derived/town/measured-roofs-index.json';
import homeIndex from '../../../../data/derived/town/residential-evidence-index.json';
import {setbackWalls, type MeasuredRoof} from '../measured-roofs';
import type {EvidenceBuilding} from '../evidence-types';
const rect=(x0:number,x1:number,y0:number,y1:number)=>[x0,y0,x1,y0,x1,y1,x0,y0,x1,y1,x0,y1];
describe('measured wall coverage',()=>{
  it('covers a rectangle across triangles, independent of winding and overlap',()=>{
    const tris=rect(0,4,0,3),back=Array.from({length:2},(_,i)=>[...tris.slice(i*6+4,i*6+6),...tris.slice(i*6+2,i*6+4),...tris.slice(i*6,i*6+2)]).flat();
    for(const o of[tris,back,[...tris,...tris]]){const fits=wallCoverage(o,0);expect(fits(.1,3.9,.1,2.9)).toBe(true);expect(fits(-.1,3.9,.1,2.9)).toBe(false);}
  });
  it('rejects a narrow notch missed by nine point sampling',()=>{
    const fits=wallCoverage([...rect(0,1.2,0,3),...rect(1.3,4,0,3),...rect(1.2,1.3,0,1)],0);
    expect(fits(.5,3.5,.5,2.5)).toBe(false);
    expect(fits(.5,3.5,.1,.9)).toBe(true);
  });
  it('rejects enclosed holes and disconnected wall pieces',()=>{
    const fits=wallCoverage([...rect(0,4,0,1),...rect(0,4,2,3),...rect(0,1,1,2),...rect(2,4,1,2)],0);
    expect(fits(.5,3.5,.5,2.5)).toBe(false);
    expect(wallCoverage([...rect(0,1,0,3),...rect(2,3,0,3)])(.5,2.5,1,2)).toBe(false);
  });
  it('closes centimetre rounding seams without expanding acute tips unboundedly',()=>{
    expect(wallCoverage([...rect(0,1,0,3),...rect(1.019,3,0,3)])(.5,2.5,.5,2.5)).toBe(true);
    expect(wallCoverage([...rect(0,1,0,3),...rect(1.021,3,0,3)])(.5,2.5,.5,2.5)).toBe(false);
    const fits=wallCoverage([0,0,10,.01,0,.02]);
    expect(fits(10.02,10.03,.005,.015)).toBe(false);
  });
  it('does not treat degenerate or nonfinite triangles as walls',()=>{
    const fits=wallCoverage([0,0,1,0,2,0,NaN,0,1,2,2,3]);
    expect(fits(.2,.4,.1,.2)).toBe(false);
    const valid=wallCoverage(rect(0,3,0,3));
    expect(valid(1,1,1,2)).toBe(false);expect(valid(2,1,1,2)).toBe(false);expect(valid(0,NaN,1,2)).toBe(false);
  });
});

describe('retained source wall counterexamples',()=>{
  const native=(tile:string,id:string,wi:number)=>{
    const roof=JSON.parse(readFileSync(`public${roofIndex.dir}/${tile}.json`,'utf8')).rows.find((r:MeasuredRoof)=>r.id===id) as MeasuredRoof;
    const asset=(homeIndex.tiles as Record<string,{url:string}>)[tile];
    const home=JSON.parse(readFileSync('public'+asset.url,'utf8')).buildings.find((h:EvidenceBuilding)=>h.id===id) as EvidenceBuilding;
    const plan=home.frames.map(f=>({...f,start:[f.start[0]+f.tangent[0]*.32-f.outward[0]*.32,f.start[1]+f.tangent[1]*.32-f.outward[1]*.32]}));
    return wallCoverage(setbackWalls(roof,plan)[wi].outline);
  };
  it('rejects the 29 cm unsupported opening at 40 West Wind',()=>{
    const fits=native('4_-8','172501_865719',7),u=6.233017149,bottom=51.07971109072087;
    expect(fits(u-.525-.15,u+.525+.15,bottom-.14,bottom+1.45+.26)).toBe(false);
  });
  it('fits the shorter Crown Street and lifted Poland Street windows',()=>{
    const crown=native('-13_-6','168203_866197',0),u=3.461443398;
    expect(crown(u-.475-.12,u+.475+.12,59.855-.12,59.855+1.2+.2)).toBe(false);
    expect(crown(u-.475-.12,u+.475+.12,59.655-.12,59.655+.8+.2)).toBe(true);
    const poland=native('-9_-7','169122_865992',0),v=1.912118649;
    expect(poland(v-.475-.12,v+.475+.12,62.318-.12,62.318+1.2+.2)).toBe(false);
    expect(poland(v-.475-.12,v+.475+.12,62.518-.12,62.518+1+.2)).toBe(true);
  });
});
