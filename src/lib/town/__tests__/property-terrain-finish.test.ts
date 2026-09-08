// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import index from '../../../../data/derived/town/property-terrain-index.json';
import { applyPropertyTerrainFinish, propertyTerrainAsset, validPropertyTerrainPacket, type PropertyTerrainPacket } from '../property-terrain-finish';
import { terrainGeometryStamp, terrainFinishAsset } from '../terrain-finish';
import { environmentGroundAsset } from '../environment-ground';
import { streetCornerGroundAsset } from '../street-corner-ground';
import type { V3 } from '../contracts';

const tileId = Object.keys(index.tiles)[0];
const row = (index.tiles as Record<string, { origin: number[]; levels: Record<string, {url:string;sha256:string;bytes:number}> }>)[tileId];
const level = Number(Object.keys(row.levels)[0]), origin = row.origin as V3;
function fixture() {
 const geometry = new THREE.BufferGeometry();
 geometry.setAttribute('position',new THREE.Float32BufferAttribute([0,1,0,0,1,4,4,1,0],3));
 geometry.setAttribute('normal',new THREE.Float32BufferAttribute([0,1,0,0,1,0,0,1,0],3));
 geometry.setAttribute('uv',new THREE.Float32BufferAttribute([0,0,0,1,1,0],2));
 const mesh = new THREE.Mesh(geometry,new THREE.MeshStandardMaterial());mesh.name='terrain_1';
 const group = new THREE.Group(); group.add(mesh);
 const height=origin[1]+1;
 const packet:PropertyTerrainPacket={version:1,tileId,sourceManifestSha256:index.sourceManifestSha256,sourcePropertySha256:index.sourcePropertySha256,
  predecessors:{'terrain-finish':terrainFinishAsset(tileId,level)?.sha256??null,'environment-ground':environmentGroundAsset(tileId,level)?.sha256??null,'street-corner-ground':streetCornerGroundAsset(tileId,level)?.sha256??null},
  levels:[{level,sourceSha256:'a'.repeat(64),meshes:[{mesh:mesh.name,geometryStamp:terrainGeometryStamp(geometry),positions:3,triangles:1,patches:[[0,[[0,0,height],[.5,0,height+.5],[0,1,height],[.5,0,height+.5],[1,0,height],[0,1,height]]]]}]}]};
 return {group,mesh,geometry,packet};
}
describe('Bounded property terrain stitching',()=>{
 it('registers a detailed edge knot while retaining exact source attributes and protected objects',()=>{
  const {group,mesh,geometry,packet}=fixture();const before=Object.fromEntries(Object.entries(geometry.attributes).map(([n,a])=>[n,a.array.slice()]));
  const road=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial());road.name='roads_1';group.add(road);const protectedGeometry=road.geometry,dispose=vi.spyOn(geometry,'dispose');
  const result=applyPropertyTerrainFinish(group,tileId,origin,level,'a'.repeat(64),packet);
  expect(result).toMatchObject({meshes:1,replacedTriangles:1,rejected:false});expect(dispose).toHaveBeenCalledOnce();
  for(const[n,a]of Object.entries(before))expect(mesh.geometry.getAttribute(n).array.slice(0,a.length)).toEqual(a);
  expect(mesh.geometry.getAttribute('position').getY(4)).toBeCloseTo(1.5,5);expect(mesh.geometry.getAttribute('uv').getY(4)).toBeCloseTo(.5,5);expect(road.geometry).toBe(protectedGeometry);
  const after=mesh.geometry;expect(applyPropertyTerrainFinish(group,tileId,origin,level,'a'.repeat(64),packet)).toBe(result);expect(mesh.geometry).toBe(after);expect(dispose).toHaveBeenCalledOnce();
 });
 it('rejects wrong source, predecessor, property layout, or origin without changing geometry',()=>{
  const edits=[(p:PropertyTerrainPacket)=>{p.sourcePropertySha256='0'.repeat(64);},(p:PropertyTerrainPacket)=>{p.predecessors['terrain-finish']='0'.repeat(64);},(p:PropertyTerrainPacket)=>{p.levels[0].sourceSha256='0'.repeat(64);},(p:PropertyTerrainPacket)=>{p.levels[0].meshes[0].geometryStamp='deadbeef';}];
  for(const edit of edits){const{group,mesh,geometry,packet}=fixture();edit(packet);expect(applyPropertyTerrainFinish(group,tileId,origin,level,'a'.repeat(64),packet)?.rejected).toBe(true);expect(mesh.geometry).toBe(geometry);}
  const f=fixture();expect(applyPropertyTerrainFinish(f.group,tileId,[origin[0]+1,origin[1],origin[2]],level,'a'.repeat(64),f.packet)?.rejected).toBe(true);expect(f.mesh.geometry).toBe(f.geometry);
 });
 it('retains the source on missing optional data or an out-of-envelope packet',()=>{
  const f=fixture();expect(applyPropertyTerrainFinish(f.group,tileId,origin,level,'a'.repeat(64))).toBeUndefined();expect(f.mesh.geometry).toBe(f.geometry);
  f.packet.levels[0].meshes[0].patches[0][1][0][2]+=2;expect(applyPropertyTerrainFinish(f.group,tileId,origin,level,'a'.repeat(64),f.packet)?.rejected).toBe(true);expect(f.mesh.geometry).toBe(f.geometry);
 });
 it('binds every streamed packet to the exact current property catalog and packet bytes',()=>{
  const hash=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
  expect(hash(fs.readFileSync(path.resolve('data/derived/town/property-grounds.json')))).toBe(index.sourcePropertySha256);
  let count=0;
  for(const[id,tile]of Object.entries(index.tiles))for(const[l,asset]of Object.entries(tile.levels)){
   const b=fs.readFileSync(path.resolve('public',asset.url.slice(1))),p=JSON.parse(b.toString());expect(b.length).toBe(asset.bytes);expect(hash(b)).toBe(asset.sha256);expect(validPropertyTerrainPacket(p,id)).toBe(true);expect(propertyTerrainAsset(id,Number(l))).toEqual(asset);expect(p.levels[0].level).toBe(Number(l));count++;
  }
  expect(count).toBeGreaterThan(5);expect(count).toBeLessThanOrEqual(15);
 });
});
