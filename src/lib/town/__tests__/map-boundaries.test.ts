import {beforeAll,describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';import {gunzipSync} from 'node:zlib';import {createHash} from 'node:crypto';
import data from '../../../../data/derived/town/map-boundaries.json';
import {DriveEngine,RoadGraph,MPH} from '../engine';
import {isMappedBoundaryEdge,MAP_BOUNDARY_MESSAGE} from '../map-boundaries';

describe('explicit mapped-town boundaries',()=>{
 let graph:RoadGraph;
 beforeAll(()=>{graph=new RoadGraph(JSON.parse(gunzipSync(readFileSync(process.cwd()+'/data/derived/town/engine-network.json.gz')).toString()));});
 it('qualifies all 34 exact municipal clips and excludes nearby natural dead ends',()=>{
  expect(data.rows).toHaveLength(34);expect(createHash('sha256').update(readFileSync(process.cwd()+'/data/derived/town/engine-network.json.gz')).digest('hex')).toBe(data.networkSha256);
  for(const r of data.rows){const edge=graph.edges.get(r.edgeId)!;expect(isMappedBoundaryEdge(edge)).toBe(true);expect(r.distanceToBoundaryM).toBeLessThan(.05);expect(graph.boundaryStops.has(r.edgeId)).toBe(true);expect(isMappedBoundaryEdge({...edge,points:edge.points.map((p,i)=>i===edge.points.length-1?[p[0]+1,...p.slice(1)]:p)})).toBe(false);}
  for(const id of[22,290,490,1428])expect(graph.boundaryStops.has(id)).toBe(false);
 });
 it.each([2294,589,1390,2392,2365,2177,1294,2575,1,11,2430])('stops before the clipped endpoint of %i, even while Up stays held',id=>{
  const path=graph.paths.get(id)!,engine=new DriveEngine(graph,id,Math.max(0,path.length-100));engine.speed=Math.min(20*MPH,engine.roadLimit());
  expect(engine.nextJunction()).toMatchObject({edgeId:id,boundary:true,choices:[],selected:null});expect(engine.plan()).toBeNull();
  for(let frame=0;frame<90*60;frame++)engine.step(1/60,true);
  expect(engine.endOfRoute).toBe(true);expect(engine.speed).toBe(0);expect(engine.s).toBeLessThanOrEqual(path.length-3.2+1e-8);expect(engine.lastMessage).toBe(MAP_BOUNDARY_MESSAGE);expect(engine.phase).toBe('ROAD');expect(engine.history).toEqual([]);
  const s=engine.s;engine.advance(1000);expect(engine.s).toBe(s);expect(engine.queueChoice(graph.choices(id)[0]?.edgeId??-1)).toBe(false);
 });
 it('stops the three short clipped stubs on their sole incoming road',()=>{
  for(const[from,to]of[[2514,2488],[265,461],[2635,2597]]){const e=new DriveEngine(graph,from);expect(e.nextJunction()?.boundary).toBe(true);expect(e.plan()).toBeNull();e.advance(10000);expect(e.edgeId).toBe(from);expect(e.endOfRoute).toBe(true);expect(e.s).toBeLessThan(graph.paths.get(from)!.length-graph.connector(from,to).fromTrim);}
 });
 it('can instantly turn around at the retained Great Bridge road and resume safely',()=>{
  const engine=new DriveEngine(graph,2575);engine.advance(1000);expect(engine.endOfRoute).toBe(true);expect(engine.flipDirection()).toBe(true);expect(engine.edgeId).toBe(2574);expect(engine.endOfRoute).toBe(false);engine.step(1/60,true);expect(engine.cruiseAtLimit).toBe(true);expect(engine.speedLimit()).toBeGreaterThan(0);
 });
 it('leaves an ordinary dead-end U-turn and all legal source connections available',()=>{
  const ordinary=new RoadGraph({edges:[{id:1,from:0,to:1,physical_id:7,points:[[0,0,0],[100,0,0]]},{id:2,from:1,to:0,physical_id:7,points:[[100,0,0],[0,0,0]]}]});expect(new DriveEngine(ordinary,1).plan()?.choice.label).toBe('U-turn');expect(ordinary.boundaryStops.size).toBe(0);expect(graph.choices(2575).map(c=>c.edgeId)).toEqual([2574]);
 });
});
