import {describe,it,expect} from 'vitest';
import {readFileSync}from'node:fs';import{createHash}from'node:crypto';import{gunzipSync}from'node:zlib';
import * as THREE from 'three';
import index from '../../../../data/derived/town/road-dash-index.json';
import {applyRoadDashFinish,validRoadDashPacket}from'../road-dash-finish';
const packet=(url:string)=>JSON.parse(readFileSync(new URL('../../../..'+url.replace('/town-finish','/public/town-finish'),import.meta.url),'utf8'));
describe('source-qualified continuous one-way center dashes',()=>{
 it('joins only four same-name degree-two source-qualified chains and preserves the Cedar width change',()=>{
  const graph=JSON.parse(gunzipSync(readFileSync(process.cwd()+'/data/derived/town/engine-network.json.gz')).toString()),edges=new Map<number,any>(graph.edges.map((e:any)=>[e.id,e]));expect(index.chains).toHaveLength(4);
  for(const c of index.chains){const[a,b]=c.edges.map(id=>edges.get(id));expect(a.to).toBe(b.from);expect(a.name).toBe(b.name);expect(new Set(graph.edges.filter((e:any)=>e.from===a.to||e.to===a.to).map((e:any)=>e.physical_id)).size).toBe(2);for(const e of[a,b]){expect(e.width_m).toBeGreaterThanOrEqual(5.5);expect(e.road_type).toBeLessThanOrEqual(5);expect(graph.edges.filter((r:any)=>r.physical_id===e.physical_id)).toHaveLength(1);}expect(c).toMatchObject({dashLengthM:4,periodM:12,trueJunctionSetbackM:10});}
  expect(edges.get(1578).width_m).toBeLessThan(5.5);expect(index.chains.some(c=>c.edges.includes(1578))).toBe(false);
 });
 it('pins every small streamed packet and the same dash geometry at all three LODs',()=>{
  for(const[id,tile]of Object.entries(index.tiles)){let geometry:string|undefined;for(const[level,asset]of Object.entries(tile.levels)){const bytes=readFileSync(new URL('../../../..'+asset.url.replace('/town-finish','/public/town-finish'),import.meta.url)),p=JSON.parse(bytes.toString());expect(bytes.length).toBe(asset.bytes);expect(createHash('sha256').update(bytes).digest('hex')).toBe(asset.sha256);expect(validRoadDashPacket(p,id,Number(level))).toBe(true);const current=JSON.stringify(p.positions);geometry??=current;expect(current).toBe(geometry);expect(asset.bytes).toBeLessThan(30000);}}
 });
 it('fails closed for malformed packets, wrong source hashes, or missing source road guards',()=>{
  const[id,tile]=Object.entries(index.tiles)[0],p=packet(tile.levels[0].url),scene=new THREE.Group(),mesh=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial());scene.add(mesh);const g=mesh.geometry,m=mesh.material;
  expect(applyRoadDashFinish(scene,id,[0,0,0],0,'0'.repeat(64),p).rejected).toBe(true);expect(applyRoadDashFinish(scene,id,[0,0,0],0,p.sourceSha256,p).rejected).toBe(true);expect(scene.children).toEqual([mesh]);expect(mesh.geometry).toBe(g);expect(mesh.material).toBe(m);
  expect(validRoadDashPacket({...p,positions:[[NaN,0,0]]},id,0)).toBe(false);expect(validRoadDashPacket(p,id,2)).toBe(false);expect(validRoadDashPacket({...p,edgeIds:[1578]},id,0)).toBe(false);
  g.dispose();(m as THREE.Material).dispose();
 });
});
