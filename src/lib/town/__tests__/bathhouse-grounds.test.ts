// @vitest-environment node
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import catalog from '../../../../data/derived/town/bathhouse-grounds.json';
import { applyBathhouseGrounds } from '../bathhouse-grounds';
import { applyGroundedSiteFeatures } from '../arrival-grounds';
import type { V3 } from '../contracts';
const cross=(p:number[][])=>(p[1][0]-p[0][0])*(p[2][1]-p[0][1])-(p[1][1]-p[0][1])*(p[2][0]-p[0][0]);
function terrain(origin:V3,points:number[][]) {
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(points.flatMap(([x,n])=>[x-origin[0],48.2-origin[1],-n-origin[2]]),3));
 g.setAttribute('normal',new THREE.Float32BufferAttribute(points.flatMap(()=>[0,1,0]),3));const mesh=new THREE.Mesh(g,new THREE.MeshStandardMaterial());mesh.name='terrain';const group=new THREE.Group();group.add(mesh);return{group,mesh,g};
}
describe('Dated bathhouse approach',()=>{
 it('binds the compact trace to the retained building/source evidence and both correct tile origins',()=>{
  const hash=(p:string)=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
  expect(hash('scripts/art_finish/bathhouse-grounds/trace.json')).toBe(catalog.sourceTraceSha256);expect(hash('data/derived/town/bathhouse.json')).toBe(catalog.sourceBathhouseSha256);
  expect(Object.keys(catalog.tiles).sort()).toEqual(['-3_-2','-4_-2']);expect(catalog.features).toHaveLength(1);
  for(const f of catalog.features){expect(f.kind).toBe('walk');expect(f.indices.length%3).toBe(0);expect(f.indices.every(i=>Number.isInteger(i)&&i>=0&&i<f.points.length)).toBe(true);expect(f.points.flat().every(Number.isFinite)).toBe(true);}
  expect(catalog.policy).toContain('circular island');expect(catalog.policy).toContain('approximate');
 });
 it('leaves source geometry intact on wrong tile, origin, or source SHA',()=>{
  const origin:V3=[-1000,0,500],{group,mesh,g}=terrain(origin,[[-850,-500],[-700,-500],[-850,-350]]);
  expect(applyBathhouseGrounds(group,'wrong',origin,0,'a'.repeat(64))).toBeUndefined();
  expect(applyBathhouseGrounds(group,'-4_-2',origin,0,'a'.repeat(64))?.status).toBe('source-mismatch');expect(mesh.geometry).toBe(g);expect(group.children).toHaveLength(1);
 });
 it('corrects a real rounded fan inversion after final XY quantization, preserving its support and original source',()=>{
  const origin:V3=[-1000,0,500];
  // Derived from the actual forecourt failure: 14 extremely thin LOD0 fan
  // triangles changed winding after Float32 rounding, despite positive source
  // polygon winding. The small perturbation remains in the same Float32 cell.
  const shape=[[-755.2859191894531,-480],[-755.9950256347656,-485.58345794677734],[-755.9949881171875,-485.58317947387695]];
  const rounded=shape.map(([x,n])=>[Math.fround(x-origin[0])+origin[0],Math.fround(n+origin[2])-origin[2]]);
  expect(cross(shape)).toBeGreaterThan(0);expect(cross(rounded)).toBeLessThan(-1e-7);
  const{group,mesh,g}=terrain(origin,[[-760,-490],[-745,-490],[-760,-460]]);const before=g.getAttribute('position').array.slice();
  const result=applyGroundedSiteFeatures(group,'test',origin,0,'a',{origin,lods:[{level:0,sha256:'a'}],features:[{id:'actual-rounded-fan',sid:'170538_867098',site:'regression',kind:'walk',triangles:[shape],basis:'Actual native forecourt rounding failure',areaM2:Math.abs(cross(shape))/2}]},'testForecourt','test forecourt');
  expect(result?.triangles).toBe(1);expect(mesh.geometry).toBe(g);expect(g.getAttribute('position').array).toEqual(before);
  const added=(group.children.find(o=>o.name==='test forecourt') as THREE.Group).children[0] as THREE.Mesh,p=added.geometry.getAttribute('position'),n=added.geometry.getAttribute('normal');
  const a=new THREE.Vector3().fromBufferAttribute(p,0),b=new THREE.Vector3().fromBufferAttribute(p,1),c=new THREE.Vector3().fromBufferAttribute(p,2);expect(b.sub(a).cross(c.sub(a)).normalize().dot(new THREE.Vector3().fromBufferAttribute(n,0))).toBeGreaterThan(.99);
  for(let i=0;i<p.count;i++)expect(p.getY(i)).toBeCloseTo(48.212,4);
 });
});
