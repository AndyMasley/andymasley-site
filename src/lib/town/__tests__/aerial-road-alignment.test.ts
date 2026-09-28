// @vitest-environment node
import {describe,it,expect} from 'vitest';
import * as THREE from 'three';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {AERIAL_ROAD_ALIGNMENT as catalog,aerialRoadPoint,alignAerialRoadNetwork,applyAerialRoadAlignment} from '../aerial-road-alignment';
import {OBSOLETE_PRIVATE_EDGE_IDS} from '../obsolete-access-route';
import {NON_STREET_ISLAND_ROUTES} from '../non-street-island-routes';
import {RoadGraph,type NetworkData} from '../engine';
const source=JSON.parse(gunzipSync(readFileSync('data/derived/town/engine-network.json.gz')).toString()) as NetworkData;
const at=(c:typeof catalog.corridors[number],s:number,v=0):[number,number]=>[c.start[0]+c.tangent[0]*s-c.tangent[1]*v,c.start[1]+c.tangent[1]*s+c.tangent[0]*v];

describe('aerial-qualified road alignment',()=>{
 it('translates and narrows Brown carriageway together, without moving remote roads',()=>{
  const c=catalog.corridors[0],p=at(c,20),q=aerialRoadPoint(...p);expect(Math.hypot(q[0]-p[0],q[1]-p[1])).toBeCloseTo(5.5,8);
  const a=aerialRoadPoint(...at(c,20,-c.sourceWidth/2)),b=aerialRoadPoint(...at(c,20,c.sourceWidth/2));expect(Math.hypot(a[0]-b[0],a[1]-b[1])).toBeCloseTo(5,8);
  expect(aerialRoadPoint(0,0)).toEqual([0,0]);expect(aerialRoadPoint(...at(c,-19))).toEqual(at(c,-19));
 });
 it('narrows only the evidenced local span at School and Maynard, retaining remote widths',()=>{
  const network=alignAerialRoadNetwork(source);
  for(const id of ['high-school-116','maynard-lake-36']){
   const c=catalog.corridors.find(c=>c.id===id)!,a=aerialRoadPoint(...at(c,0,-c.sourceWidth/2)),b=aerialRoadPoint(...at(c,0,c.sourceWidth/2));
   expect(Math.hypot(a[0]-b[0],a[1]-b[1])).toBeCloseTo(c.width,6);
   expect(aerialRoadPoint(...at(c,c.along[0]-1))).toEqual(at(c,c.along[0]-1));
   for(const edge of network.edges.filter(e=>e.physical_id===c.physicalId)){expect(edge.width_m).toBe(c.sourceWidth);expect(edge.lane_offset_m).toBe(c.laneOffset);}
  }
 });
 it('fails closed on an unrelated network or an unpinned source tile',()=>{
  const other={...source,edges:source.edges.filter(e=>e.id!==858)};expect(alignAerialRoadNetwork(other)).toBe(other);
  const group=new THREE.Group();expect(applyAerialRoadAlignment(group,'-12_-4',[0,0,0],0,'changed source')).toBeUndefined();expect(group.userData.aerialRoadAlignment).toBeUndefined();
 });
 it('keeps all original graph identities and node endpoints joined without mutating source',()=>{
  const before=JSON.stringify(source),network=alignAerialRoadNetwork(source);expect(JSON.stringify(source)).toBe(before);expect(network.edges.map(e=>[e.id,e.from,e.to])).toEqual(source.edges.filter(e=>!OBSOLETE_PRIVATE_EDGE_IDS.includes(e.id)&&!NON_STREET_ISLAND_ROUTES.routes.some(r=>r.edges.some(row=>row.id===e.id))).map(e=>[e.id,e.id===250?1238:e.id===199?1239:e.from,e.id===249?1238:e.id===200?1239:e.to]));
  const nodes=new Map((network.nodes as {id:number;x:number;y:number}[]).map(n=>[n.id,n]));
  for(const e of network.edges){const original=source.edges.find(o=>o.id===e.id)!;if(e===original)continue;for(const [id,p]of [[e.from,e.points[0]],[e.to,e.points[e.points.length-1]]] as const){const n=nodes.get(id)!;expect(Math.hypot(p[0]-n.x,p[1]-n.y)).toBeLessThan(.001);}}
  expect(alignAerialRoadNetwork(network)).toBe(network);
 });
 it('changes only demonstrated blockages and retains the centered one-way Tracy lane',()=>{
  const network=alignAerialRoadNetwork(source),brown=network.edges.find(e=>e.id===858)!,tracy=network.edges.find(e=>e.id===1295)!;
  expect(brown.width_m).toBe(5);expect(brown.lane_offset_m).toBe(1.25);expect(brown.blocked_spans).toEqual([]);expect(tracy.width_m).toBe(4.572);expect(tracy.lane_offset_m).toBe(0);expect(tracy.blocked_spans).toEqual([]);
  const untouched=source.edges.find(e=>e.blocked_spans?.length&&network.edges.find(n=>n.id===e.id)===e)!;expect(untouched).toBeDefined();expect(network.edges.find(e=>e.id===untouched.id)!.blocked_spans).toEqual(untouched.blocked_spans);
  const graph=new RoadGraph(network);expect(graph.obstacleStops.has(858)).toBe(false);expect(graph.obstacleStops.has(1295)).toBe(false);expect(graph.obstacleStops.has(untouched.id)).toBe(true);expect(graph.obstacleStops.has(1281)).toBe(false);
  const north=network.edges.find(e=>e.id===1294)!;expect(north.bridge_event_ids).toEqual([3032]);expect(north.points.map(p=>p[2])).toEqual(source.edges.find(e=>e.id===1294)!.points.map(p=>p[2]));
 });
 it('blends neighboring junction influences without doubling displacement or tearing the mapping',()=>{
  for(let e=-2990;e<-2920;e+=.5)for(let n=-995;n<-945;n+=.5){const a=aerialRoadPoint(e,n),b=aerialRoadPoint(e+.01,n);expect(Math.hypot(a[0]-e,a[1]-n)).toBeLessThan(6.8);expect(Math.hypot(a[0]-b[0],a[1]-b[1])).toBeLessThan(.08);}
 });
 it('moves only qualified road display buffers, retaining bodies and source data at all LODs',()=>{
  const c=catalog.corridors[0],p=at(c,20),raw=new Float32Array([p[0]-.2,35,-p[1],p[0]+.2,35,-p[1],p[0],35,-p[1]-.3]);
  for(const level of [0,1,2]){const group=new THREE.Group(),g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(raw.slice(),3));const road=new THREE.MeshStandardMaterial();road.name='Drive road | asphalt';const wall=new THREE.MeshStandardMaterial();wall.name='V2 inferred | brick';const pavement=new THREE.Mesh(g,road),building=new THREE.Mesh(g,wall);group.add(pavement,building);
   const result=applyAerialRoadAlignment(group,'-12_-4',[0,0,0],level,catalog.tiles['-12_-4'][String(level) as '0']);expect(result!.vertices).toBe(3);expect(building.geometry.getAttribute('position').array).toEqual(raw);expect(pavement.geometry).not.toBe(g);expect(applyAerialRoadAlignment(group,'-12_-4',[0,0,0],level,catalog.tiles['-12_-4'][String(level) as '0'])).toBe(result);
   pavement.geometry.dispose();g.dispose();road.dispose();wall.dispose();}
 });
});

it('registers both sides of the Reid Smith tile seam to the same pavement mapping',()=>{
 const c=catalog.corridors.find(c=>c.id==='reid-smith-cove-10')!,s=(-1000-c.start[1])/c.tangent[1],center=at(c,s),world:[number,number]=[center[0]+2,-1000],outputs:number[][]=[];
 for(const [tile,origin]of [['3_-5',[750,0,1250]],['3_-4',[750,0,1000]]]as const){
  const group=new THREE.Group(),g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute([world[0]-origin[0],50,-world[1]-origin[2],world[0]+.2-origin[0],50,-world[1]-origin[2],world[0]-origin[0],50,-world[1]+.2-origin[2]],3));
  const m=new THREE.MeshStandardMaterial();m.name='Drive road | asphalt';const mesh=new THREE.Mesh(g,m);group.add(mesh);
  expect(applyAerialRoadAlignment(group,tile,[...origin],0,catalog.tiles[tile]['0'])!.vertices).toBeGreaterThan(0);
  const p=mesh.geometry.getAttribute('position');outputs.push([p.getX(0)+origin[0],-p.getZ(0)-origin[2]]);
 }
 expect(outputs[0][0]).toBeCloseTo(outputs[1][0],4);expect(outputs[0][1]).toBeCloseTo(outputs[1][1],4);expect(Math.abs(outputs[0][0]-world[0])).toBeGreaterThan(.1);
});

it('keeps both new service-aisle fits bounded, graded and joined at their public approaches',()=>{
 const network=alignAerialRoadNetwork(source);
 for(const id of ['gore-11-service-lane','thompson-310-apartment-aisle']){
  const c=catalog.corridors.find(c=>c.id===id)!,p=at(c,0),q=aerialRoadPoint(...p);
  expect(Math.hypot(q[0]-p[0],q[1]-p[1])).toBeCloseTo(c.lateralShift,6);
  const left=aerialRoadPoint(...at(c,0,-3)),right=aerialRoadPoint(...at(c,0,3));expect(Math.hypot(left[0]-right[0],left[1]-right[1])).toBeCloseTo(c.width,6);
  for(const edgeId of c.directedIds){const original=source.edges.find(e=>e.id===edgeId)!,edge=network.edges.find(e=>e.id===edgeId)!;
   expect(edge.points.map(p=>p[2])).toEqual(original.points.map(p=>p[2]));expect(edge.points[0]).toEqual(original.points[0]);expect(edge.points.at(-1)).toEqual(original.points.at(-1));expect(edge.lane_offset_m).toBe(c.laneOffset);
  }
 }
 expect(network.edges.find(e=>e.id===43)!.blocked_spans).toEqual([]);
 const graph=new RoadGraph(network);expect(graph.obstacleStops.has(43)).toBe(false);
});
