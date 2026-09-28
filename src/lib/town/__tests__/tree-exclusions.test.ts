// @vitest-environment node
import {expect,it} from 'vitest';
import {excludedTreeAnchors} from '../tree-exclusions';

it('clears only mapped surfaces in world east/north, preserving source rows and indices across tile origins',()=>{
 const polygon=[[110,220],[120,220],[120,230],[110,230]],origin=[100,0,-200];
 const rows=[[15,50,-25],[25,50,-25],[15,50,25],[10,50,-20]],before=structuredClone(rows);
 expect([...excludedTreeAnchors(rows,origin,[polygon])]).toEqual([0,3]);
 expect([...excludedTreeAnchors(rows,origin,[[...polygon].reverse()])]).toEqual([0,3]);
 expect([...excludedTreeAnchors(rows.map(r=>[r[0]-250,r[1],r[2]+250]),[350,0,-450],[polygon])]).toEqual([0,3]);
 expect(excludedTreeAnchors(rows,origin,[]).size).toBe(0);expect(rows).toEqual(before);
});


it('clears only the reviewed Birch Island inferred crown, independent of tile datum and LOD height',()=>{
 const anchor=[-1189.6,42,1349,4,9.9*.3,4,1.2],neighbor=[-1189.5,42,1349,4,9.9*.3,4,1.2];
 for(const origin of [[-1250,0,1250],[-1250,20,1250],[0,0,0]]){
  const rows=[neighbor,anchor,[-1189.6,42,1349,4,18*.3,4,1.2]].map(r=>r.map((v,i)=>v-(i===0?origin[0]:i===1?origin[1]:i===2?origin[2]:0))),before=structuredClone(rows);
  expect([...excludedTreeAnchors(rows,origin,[])]).toEqual([1]);expect(rows).toEqual(before);
 }
});


it('clears the second reviewed crown over the bridge lane but retains neighboring source anchors',()=>{
 const anchor=[-1175,56.61155,1343.8,4,10.4*.3,4,2];
 for(const origin of [[-1250,0,1250],[-1250,20,1250],[0,0,0]]){
  const rows=[[-1174.9,...anchor.slice(1)],anchor,[-1175,56.61155,1343.8,4,15*.3,4,2],[-1175,56.61155,1343.9,4,10.4*.3,4,2]].map(r=>r.map((v,i)=>v-(i===0?origin[0]:i===1?origin[1]:i===2?origin[2]:0))),before=structuredClone(rows);
  expect([...excludedTreeAnchors(rows,origin,[])]).toEqual([1]);expect(rows).toEqual(before);
 }
});


it('clears the reviewed reverse-bridge crown without excluding nearby or differently measured trees',()=>{
 const anchor=[-1203.5,54.54871,1340.3,4,7.3*.3,4,2];
 for(const origin of [[-1250,0,1250],[-1250,20,1250],[0,0,0]]){
  const rows=[[-1203.4,...anchor.slice(1)],anchor,[-1203.5,54.54871,1340.3,4,12*.3,4,2],[-1203.5,54.54871,1340.4,4,7.3*.3,4,2]].map(r=>r.map((v,i)=>v-(i===0?origin[0]:i===1?origin[1]:i===2?origin[2]:0))),before=structuredClone(rows);
  expect([...excludedTreeAnchors(rows,origin,[])]).toEqual([1]);expect(rows).toEqual(before);
 }
});
