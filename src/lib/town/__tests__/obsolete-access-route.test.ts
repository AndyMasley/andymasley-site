// @vitest-environment node
import {describe,it,expect} from 'vitest';
import * as THREE from 'three';
import islands from '../../../../data/derived/town/non-street-island-routes.json';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {RoadGraph,DriveEngine,type NetworkData} from '../engine';
import {OBSOLETE_ACCESS_ROUTE as route,OBSOLETE_ACCESS_ROUTES,OBSOLETE_PRIVATE_EDGE_IDS,terminateObsoleteAccessRoute,removeObsoleteAccessSurface} from '../obsolete-access-route';
const source=JSON.parse(gunzipSync(readFileSync('data/derived/town/engine-network.json.gz')).toString()) as NetworkData;
const area=(p:number[][])=>Math.abs(p.reduce((s,a,i)=>{const b=p[(i+1)%p.length];return s+a[0]*b[1]-b[0]*a[1];},0))/2;
const polygon=route.removalPolygons.slice().sort((a,b)=>area(b)-area(a))[0];
const center=polygon.reduce((s,p)=>[s[0]+p[0]/polygon.length,s[1]+p[1]/polygon.length],[0,0]);
const fixture=()=>{
 const group=new THREE.Group(),g=new THREE.BufferGeometry(),p=polygon.slice(0,3).map(p=>[(p[0]-center[0])*.1,0,-(p[1]-center[1])*.1]);
 g.setAttribute('position',new THREE.Float32BufferAttribute(p.flat(),3));g.setAttribute('uv',new THREE.Float32BufferAttribute([0,0,1,0,0,1],2));
 const road=new THREE.MeshStandardMaterial();road.name='Drive road | asphalt';const wall=new THREE.MeshStandardMaterial();wall.name='V2 inferred | brick';
 const pavement=new THREE.Mesh(g,road),building=new THREE.Mesh(g,wall);group.add(pavement,building);return {group,g,pavement,building};
};
describe('aerial-disproved Cudworth industrial through route',()=>{
 it('retains the actual loading-yard approach and the independent public junction',()=>{
  const before=JSON.stringify(source),network=terminateObsoleteAccessRoute(source),forward=network.edges.find(e=>e.id===249)!,reverse=network.edges.find(e=>e.id===250)!;
  expect(JSON.stringify(source)).toBe(before);expect(forward.from).toBe(184);expect(forward.to).toBe(1238);expect(reverse.from).toBe(1238);expect(reverse.to).toBe(184);
  expect(forward.points).toEqual(route.retainedPoints);expect(reverse.points).toEqual(route.retainedPoints.slice().reverse());expect(forward.blocked_spans).toEqual([]);expect(reverse.blocked_spans).toEqual([]);
  const sourceNodes=source.nodes as {id:number}[],nodes=network.nodes as {id:number}[];expect(nodes.find(n=>n.id===185)).toBe(sourceNodes.find(n=>n.id===185));expect(nodes.length).toBe(sourceNodes.length+1);
  for(const edge of source.edges.filter(e=>![249,250,199,200,...OBSOLETE_PRIVATE_EDGE_IDS].includes(e.id)))expect(network.edges.find(e=>e.id===edge.id)).toBe(edge);
  expect(terminateObsoleteAccessRoute(network)).toBe(network);
 });
 it('provides a continuous drivable return instead of a dangling or blocked route',()=>{
  const graph=new RoadGraph(terminateObsoleteAccessRoute(source)),engine=new DriveEngine(graph,249,190);
  expect(graph.choices(249).map(c=>[c.edgeId,c.label])).toEqual([[250,'U-turn']]);expect(graph.obstacleStops.has(249)).toBe(false);expect(graph.obstacleStops.has(250)).toBe(false);
  const connection=graph.connector(249,250);expect(connection.path.length).toBeGreaterThan(0);engine.advance(60);expect(engine.edgeId).toBe(250);expect(engine.phase).toBe('ROAD');expect(engine.endOfRoute).toBe(false);expect(engine.s).toBeGreaterThan(0);
  expect(graph.choices(250).some(c=>c.edgeId!==249)).toBe(true);
  for(const edge of graph.edges.values()){expect((graph.data.nodes as {id:number}[]).some(n=>n.id===edge.from)).toBe(true);expect((graph.data.nodes as {id:number}[]).some(n=>n.id===edge.to)).toBe(true);}
 });
 it('rejects unrelated or already changed topology',()=>{
  const other={...source,edges:source.edges.map(e=>e.id===249?{...e,to:999}:e)};expect(terminateObsoleteAccessRoute(other).edges.find(e=>e.id===249)).toBe(other.edges.find(e=>e.id===249));
 });
 it('clips only source-pinned road buffers while preserving source building geometry and UVs',()=>{
  for(const level of [0,1,2]){const {group,g,pavement,building}=fixture(),raw=g.getAttribute('position').array.slice(),uv=g.getAttribute('uv').array.slice();
   const report=removeObsoleteAccessSurface(group,route.tileId,[center[0],0,-center[1]],level,(route.sourceLods as Record<string,string>)[String(level)]);
   expect(report!.removedTriangles).toBe(1);expect(pavement.geometry.getAttribute('position').count).toBe(0);expect(building.geometry).toBe(g);expect(g.getAttribute('position').array).toEqual(raw);expect(g.getAttribute('uv').array).toEqual(uv);
   expect(removeObsoleteAccessSurface(group,route.tileId,[center[0],0,-center[1]],level,(route.sourceLods as Record<string,string>)[String(level)])).toBe(report);
  }
 });
 it('retains geometry when its tile or source hash does not match',()=>{
  const {group,g,pavement}=fixture();expect(removeObsoleteAccessSurface(group,route.tileId,[0,0,0],0,'wrong')).toBeUndefined();expect(pavement.geometry).toBe(g);expect(group.userData.obsoleteAccessRoute).toBeUndefined();
 });
});

it('retains both real approaches with navigable dead ends and unchanged source grades',()=>{
 const network=terminateObsoleteAccessRoute(source),graph=new RoadGraph(network);
 for(const route of OBSOLETE_ACCESS_ROUTES){
  const forward=network.edges.find(e=>e.id===route.forwardId)!,reverse=network.edges.find(e=>e.id===route.reverseId)!;
  expect(forward.points).toEqual(route.retainedPoints);expect(reverse.points).toEqual(route.retainedPoints.slice().reverse());expect(forward.lane_offset_m).toBe(route.laneOffset);
  expect(graph.choices(forward.id).map(c=>[c.edgeId,c.label])).toEqual([[reverse.id,'U-turn']]);
  const path=graph.paths.get(forward.id)!,engine=new DriveEngine(graph,forward.id,path.length-30),connection=graph.connector(forward.id,reverse.id);
  engine.advance(30-connection.fromTrim+connection.path.length+5);expect(engine.edgeId).toBe(reverse.id);expect(engine.phase).toBe('ROAD');expect(engine.endOfRoute).toBe(false);expect(engine.s).toBeCloseTo(connection.trim+5,5);
  expect(graph.choices(reverse.id).some(c=>c.edgeId!==forward.id)).toBe(true);
 }
});
it('removes only the disproved gas-station connector and loop, keeping the actual public/business access',()=>{
 const result=terminateObsoleteAccessRoute(source);expect(OBSOLETE_PRIVATE_EDGE_IDS).toEqual([145,146,147,148]);
 for(const id of OBSOLETE_PRIVATE_EDGE_IDS)expect(result.edges.some(e=>e.id===id)).toBe(false);
 for(const id of [149,150,1763,1764])expect(result.edges.find(e=>e.id===id)).toBe(source.edges.find(e=>e.id===id));
 const changed={...source,edges:source.edges.map(e=>e.id===147?{...e,route_id:'new source'}:e)};
 for(const id of OBSOLETE_PRIVATE_EDGE_IDS)expect(terminateObsoleteAccessRoute(changed).edges.some(e=>e.id===id)).toBe(true);
 const connected={...source,edges:[...source.edges,{id:99999,from:109,to:107,points:[[0,0,0],[1,1,1]]}]};
 for(const id of OBSOLETE_PRIVATE_EDGE_IDS)expect(terminateObsoleteAccessRoute(connected).edges.some(e=>e.id===id)).toBe(true);
});

it('clips the obsolete western Wakefield lawn ribbon in its neighboring source tile',()=>{
 const route=OBSOLETE_ACCESS_ROUTES.find(r=>r.physicalId===106)!,group=new THREE.Group(),g=new THREE.BufferGeometry(),position=[1735,48,2789,1735.2,48,2789,1735,48,2789.2];
 g.setAttribute('position',new THREE.Float32BufferAttribute(position,3));const m=new THREE.MeshStandardMaterial();m.name='Drive road | asphalt';const mesh=new THREE.Mesh(g,m);group.add(mesh);
 const pins=route.additionalSourceLods as Record<string,Record<string,string>>;
 const report=removeObsoleteAccessSurface(group,'6_-12',[0,0,0],0,pins['6_-12']['0']);expect(report!.removedTriangles).toBeGreaterThan(0);expect(mesh.geometry.getAttribute('position').count).toBe(0);
});

it('clips only the source-pinned Long Island phantom pavement and retains shared natural/body geometry',()=>{
 for(const level of [0,1,2]){
  const group=new THREE.Group(),g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute([-62,47,2695,-61.8,47,2695,-62,47,2694.8],3));
  const m=new THREE.MeshStandardMaterial();m.name='Drive road | asphalt';const wall=new THREE.MeshStandardMaterial();wall.name='V2 inferred | siding';const road=new THREE.Mesh(g,m),body=new THREE.Mesh(g,wall);group.add(road,body);
  expect(removeObsoleteAccessSurface(group,'-1_-11',[0,0,0],level,'wrong source')).toBeUndefined();
  const result=removeObsoleteAccessSurface(group,'-1_-11',[0,0,0],level,islands.surfaceRemoval.sourceLods[String(level) as '0']);expect(result?.removedTriangles).toBe(1);expect(road.geometry.getAttribute('position').count).toBe(0);expect(body.geometry).toBe(g);expect(body.geometry.getAttribute('position').count).toBe(3);
 }
});
