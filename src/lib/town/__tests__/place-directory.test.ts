import {describe,it,expect,vi}from'vitest';
import directory from '../../../../data/derived/town/place-directory.json';
import landmarks from '../../../../data/derived/town/landmark-evidence.json';
import environment from '../../../../data/derived/town/evidence-environment.json';
import memorials from '../../../../data/derived/town/memorial-details.json';
import townHall from '../../../../data/derived/town/town-hall-materials.json';
import boat from '../../../../data/derived/town/lake-life.json';
import {drawTownOverview}from'../explore-map';
import type{DriveEngine}from'../engine';
describe('researched scenery directory',()=>{
 it('adds sixteen existing rendered places without new driving starts or demolished identities',()=>{
  expect(directory.places).toHaveLength(16);expect(new Set(directory.places.map(p=>p.id)).size).toBe(16);
  for(const p of directory.places){expect(p.point).toHaveLength(2);expect(p.point.every(Number.isFinite)).toBe(true);expect(p.nearRoad.length).toBeGreaterThan(0);expect(p.evidenceIds.length).toBeGreaterThan(0);expect(p.nearRoadEdgeId).toBeGreaterThanOrEqual(0);expect(p.title).not.toMatch(/Corbin/);
   if(p.source==='landmark-evidence.json')expect(landmarks.rows.some(r=>r.id===p.id)).toBe(true);
   else if(p.source==='evidence-environment.json')expect(environment.objects.some(r=>r.id===p.id)).toBe(true);
   else if(p.source==='memorial-details.json')expect(memorials.objects.some(r=>r.id===p.id)).toBe(true);
   else if(p.source==='lake-life.json')expect(p.id).toBe(boat.id);
   else expect(p.source).toBe('town-hall-materials.json');
  }
  expect(townHall.structId).toBe('168510_866616');
 });
 it('focuses the selected marker while leaving the guided engine state untouched',()=>{
  const calls:unknown[][]=[],context=new Proxy({},{get:(_t,k)=> (...args:unknown[])=>calls.push([k,...args]),set:()=>true}),canvas={width:800,height:520,getContext:()=>context}as unknown as HTMLCanvasElement;
  const engine={graph:{edges:new Map([[1,{id:1,physical_id:1,name:'Main Street',points:[[-4000,-4000,0],[1000,2000,0]]}]])},pose:vi.fn(()=>[[0,0,0]])}as unknown as DriveEngine;
  drawTownOverview(canvas,engine,directory.places[0].id);const marker=calls.find(c=>c[0]==='rect'&&c[3]===18)!;expect(marker[1]).toBeCloseTo(391);expect(marker[2]).toBeCloseTo(251);expect(calls.some(c=>c[0]==='fillText'&&c[1]===directory.places[0].title)).toBe(true);expect(Object.keys(engine)).toEqual(['graph','pose']);
 });
});
