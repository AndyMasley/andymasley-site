// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { applyEvidenceBuildings, photoLayout, MEASURED_WALL_INSET } from '../evidence-buildings';
import type { EvidenceBuilding, PhotoLayout } from '../evidence-types';
import type { MeasuredRoof } from '../measured-roofs';
import { Batch } from '../crafted-frontages';
import index from '../../../../data/derived/town/residential-evidence-index.json';
import measured from '../../../../data/derived/town/measured-roofs-index.json';

const home:EvidenceBuilding={id:'openings',tileId:'t',address:'Fixture',outline:[[0,0],[10,0],[10,8],[0,8]],
  frames:[{start:[0,0],tangent:[1,0],outward:[0,-1],width:10,front:true,groundMaximum:0,clearanceM:4}],
  base:0,floor:.4,eave:6,peak:9,stories:2,style:'COLONIAL',year:1950,material:'siding',paint:'#d8d5c8',roof:'retained',porch:'none',entry:null,documented:false,evidenceIds:[],colorsDated:true};
function source(h:EvidenceBuilding):THREE.Group{
  const f=h.frames.find(f=>f.front)??h.frames[0],x=f.start[0]+f.tangent[0]*f.width/2-f.outward[0]*.05,n=f.start[1]+f.tangent[1]*f.width/2-f.outward[1]*.05;
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute([x,h.floor+1,-n,x+f.tangent[0]*.1,h.floor+1,-n-f.tangent[1]*.1,x,h.floor+1.1,-n],3));
  const material=new THREE.MeshStandardMaterial();material.name='V2 inferred | siding';const group=new THREE.Group();group.add(new THREE.Mesh(geometry,material));return group;
}
function dispose(group:THREE.Object3D){group.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();for(const m of [o.material].flat())m.dispose();}});}
function actual(id:string):{home:EvidenceBuilding;roof:MeasuredRoof}{
  for(const asset of Object.values(index.tiles)){
    const h=(JSON.parse(readFileSync(`public${asset.url}`,'utf8')).buildings as EvidenceBuilding[]).find(h=>h.id===id);
    if(h)return{home:h,roof:JSON.parse(readFileSync(`public${measured.dir}/${h.tileId}.json`,'utf8')).rows.find((r:MeasuredRoof)=>r.id===id)};
  }
  throw new Error(`Missing retained fixture ${id}`);
}
function separated(windows:PhotoLayout['windows'],h:EvidenceBuilding){
  for(const w of windows){expect(w.u-w.width/2).toBeGreaterThanOrEqual(.12-1e-6);expect(w.u+w.width/2).toBeLessThanOrEqual(h.frames[w.frameIndex].width-.12+1e-6);}
  for(const a of windows)for(const b of windows)if(a!==b&&a.frameIndex===b.frameIndex&&a.level===b.level)expect(Math.abs(a.u-b.u)).toBeGreaterThanOrEqual((a.width+b.width)/2+.24-1e-6);
}

describe('photographed opening fidelity',()=>{
  it.each([false,true])('fits observed openings to a narrow wing without collisions, reversed=%s',reversed=>{
    const h:EvidenceBuilding={...home,frames:[{...home.frames[0],width:2.3},{...home.frames[0],start:[2.3,0],width:7.7}]};
    if(reversed)h.frames=h.frames.map(f=>({...f,start:[f.start[0]+f.width,0],tangent:[-1,0]}));
    const ws=photoLayout(h,{w1:[8,18,65],w2:[8,18,65]})!.windows;expect(ws).toHaveLength(6);separated(ws,h);
  });
  it('does not move already separated observed centers',()=>expect(photoLayout(home,{w1:[20,50,80]})!.windows.map(w=>w.u)).toEqual([2,5,8]));
  it('retains individual pane counts when a narrow wall requires a combined aperture',()=>{
    const h:EvidenceBuilding={...home,frames:[{...home.frames[0],width:1.5},{...home.frames[0],start:[1.5,.5],width:8.5}]};
    const ws=photoLayout(h,{w1:[3,12,70]})!.windows;expect(ws.some(w=>w.panes===2)).toBe(true);expect(ws.reduce((n,w)=>n+(w.panes??1),0)).toBe(3);separated(ws,h);
  });
  it('does not move a window beside the entry into the next observed window',()=>{
    const h:EvidenceBuilding={...home,outline:[[0,0],[12,0],[12,8],[0,8]],frames:[{...home.frames[0],width:12}],entry:{frameIndex:0,u:4,floor:.4}};
    h.layout=photoLayout(h,{w1:[5/12*100,6.15/12*100]});const group=source(h),spy=vi.spyOn(Batch.prototype,'window');
    try{applyEvidenceBuildings(group,'t',[0,0,0],0,[h]);const ws=spy.mock.calls.filter(c=>c[2]<2);expect(ws.length).toBeGreaterThan(0);for(let i=1;i<ws.length;i++)expect(Math.abs(ws[i][1]-ws[i-1][1])).toBeGreaterThanOrEqual((ws[i][3]+ws[i-1][3])/2+.2);}
    finally{spy.mockRestore();dispose(group);}
  });
  it.each(['168873_866919','168648_865999'])('keeps native measured openings apart at every LOD: %s',id=>{
    const {home:h,roof}=actual(id);
    for(const level of [0,1,2]){const group=source(h),spy=vi.spyOn(Batch.prototype,'window');try{
      applyEvidenceBuildings(group,h.tileId,[0,0,0],level,[h],[],undefined,[],[roof]);
      const ws=spy.mock.calls.filter(c=>Math.abs(c[5]??0)<.1);expect(ws.length).toBeGreaterThan(0);
      for(let i=0;i<ws.length;i++)for(let j=i+1;j<ws.length;j++){const a=ws[i],b=ws[j];if(a[0]===b[0]&&Math.min(a[2]+a[4],b[2]+b[4])-Math.max(a[2],b[2])>.2)expect(Math.abs(a[1]-b[1])-(a[3]+b[3])/2).toBeGreaterThanOrEqual(.2-1e-6);}
    }finally{spy.mockRestore();dispose(group);}}
  });
  it.each([0,1,2])('builds the sloped front of an observed hipped dormer at LOD %s',level=>{
    const points=[[-500,-400,300],[500,-400,300],[500,0,600],[-500,0,600],[-500,400,300],[500,400,300]],triangles=[0,1,2,0,2,3,3,2,5,3,5,4];
    const h:EvidenceBuilding={...home,stories:1.5,eave:3,peak:6,style:'CAPE',roofSurface:{o:[5,4],b:0,v:Buffer.from(new Int16Array(points.flat()).buffer).toString('base64'),r:Buffer.from(Uint8Array.from(triangles)).toString('base64'),color:'#3c3d3f'}};
    h.layout=photoLayout(h,{dm:[[50,'h']],st:1.5});const group=source(h);applyEvidenceBuildings(group,'t',[0,0,0],level,[h]);let hip=false,roofTop=-Infinity;
    try{group.traverse(o=>{if(o instanceof THREE.Mesh&&[o.material].flat().some(m=>m.name==='Crafted frontage | roof | #3c3d3f')){const p=o.geometry.getAttribute('position'),n=o.geometry.getAttribute('normal');for(let i=0;i<p.count;i++){roofTop=Math.max(roofTop,p.getY(i));if(n.getY(i)>.2&&n.getZ(i)>.2)hip=true;}}});expect(hip).toBe(true);expect(roofTop).toBeLessThan(6);expect(roofTop).toBeGreaterThan(4);}
    finally{dispose(group);}
  });
  it('counts the observed attic once when a wall already represents its dormer',()=>{
    const h:EvidenceBuilding={...home,stories:1.5,frames:[{...home.frames[0],profile:[[0,3],[4,6],[6,6],[10,3]]}]};
    h.layout=photoLayout(h,{w1:[20,80],wa:[50],dm:[[50,'g']],st:1.5});const group=source(h),spy=vi.spyOn(Batch.prototype,'window');
    try{applyEvidenceBuildings(group,'t',[0,0,0],0,[h]);expect(spy.mock.calls.filter(c=>c[2]>h.floor+2.5)).toHaveLength(1);}
    finally{spy.mockRestore();dispose(group);}
  });
  it('checks every roof-profile break under an opening, including narrow dips between samples',()=>{
    const h:EvidenceBuilding={...home,frames:[{...home.frames[0],profile:[[0,6],[4.7,6],[4.75,2.2],[4.85,2.2],[4.9,6],[10,6]]}]};
    h.layout=photoLayout(h,{w1:[50],w2:[50]});const group=source(h),spy=vi.spyOn(Batch.prototype,'window');
    try{applyEvidenceBuildings(group,'t',[0,0,0],0,[h]);for(const c of spy.mock.calls)if(c[1]-c[3]/2<4.85&&c[1]+c[3]/2>4.75)expect(c[2]+c[4]).toBeLessThan(2.2);}
    finally{spy.mockRestore();dispose(group);}
  });
  it.each([0,1])('retains three observed panes on a measured setback at LOD %s',level=>{
    const h:EvidenceBuilding={...home,setbacks:[{start:[0,1],tangent:[1,0],outward:[0,-1],width:10,outline:[0,3,10,3,10,6,0,3,10,6,0,6]}],layout:{frames:[0],doors:[],garage:[],dormers:[],windows:[{frameIndex:0,u:5,width:1.8,level:1,panes:3}]}};
    const group=source(h),windows=vi.spyOn(Batch.prototype,'window'),boxes=vi.spyOn(Batch.prototype,'box');
    try{applyEvidenceBuildings(group,'t',[0,0,0],level,[h]);const call=windows.mock.calls.find(c=>c[0].start[1]===1)!;expect(call).toBeDefined();expect(call[6]).toBe(false);
      const mullions=boxes.mock.calls.filter(c=>c[0].start[1]===1&&c[1]==='trim'&&c[4]===.155&&c[5]===.085);expect(mullions).toHaveLength(2);expect(mullions[0][2]).toBeCloseTo(4.7,9);expect(mullions[1][2]).toBeCloseTo(5.3,9);}
    finally{windows.mockRestore();boxes.mockRestore();dispose(group);}
  });
  it('keeps the two retained Lower Gore wing dormers separate',()=>{
    const {home:h,roof}=actual('172454_866668'),d=MEASURED_WALL_INSET;
    const inset:EvidenceBuilding={...h,frames:h.frames.map((f,i)=>({...f,width:f.width-2*d,front:i===roof.f!.lo!.sf,start:[f.start[0]+f.tangent[0]*d-f.outward[0]*d,f.start[1]+f.tangent[1]*d-f.outward[1]*d]}))};
    const ds=photoLayout(inset,roof.f!.lo!)!.dormers;expect(ds).toHaveLength(3);const pair=ds.filter(d=>d.frameIndex===7).sort((a,b)=>a.u-b.u);expect(pair).toHaveLength(2);expect(pair[1].u-pair[0].u).toBeGreaterThanOrEqual((pair[0].width+pair[1].width)/2+.3-1e-6);expect(pair.every(d=>d.width>=1.2)).toBe(true);
  });
});
