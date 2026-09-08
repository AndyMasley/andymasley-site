// @vitest-environment node
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import catalog from '../../../../data/derived/town/mill-yard-grounds.json';
import { applyMillYardGrounds } from '../mill-yard-grounds';
import type { V3 } from '../contracts';
const sha=(p:string)=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
function source(){
 const group=new THREE.Group(),geometry=new THREE.PlaneGeometry(250,250).rotateX(-Math.PI/2).translate(125,34,-125),mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial());mesh.name='terrain';group.add(mesh);return{group,mesh,geometry};
}
describe('Dated mill-yard apron',()=>{
 it('preserves source identity and uncertainty in its bounded trace',()=>{
  expect(sha('scripts/art_finish/mill-yard/trace.json')).toBe(catalog.sourceTraceSha256);
  expect(Object.keys(catalog.tiles).sort()).toEqual(['-11_1','-12_1']);expect(catalog.features.length).toBeGreaterThan(0);
  expect(catalog.features.reduce((s,f)=>s+f.areaM2,0)).toBeGreaterThan(100);
  expect(catalog.policy).toContain('Asphalt versus compacted gravel cannot be resolved');
  for(const f of catalog.features){expect(f.sid).toBe('168466_867928');expect(f.indices.every(i=>Number.isInteger(i)&&i>=0&&i<f.points.length)).toBe(true);expect(f.points.flat().every(Number.isFinite)).toBe(true);}
 });
 it('gates source/LOD/origin without changing retained geometry',()=>{
  const{group,mesh,geometry}=source(),origin:V3=[-3000,0,-250];
  expect(applyMillYardGrounds(group,'-12_1',origin,0,'wrong')?.status).toBe('source-mismatch');
  expect(applyMillYardGrounds(group,'-12_1',[0,0,0],0,catalog.tiles['-12_1'].lods[0].sha256)?.status).toBe('source-mismatch');
  expect(applyMillYardGrounds(group,'other',origin,0,'wrong')).toBeUndefined();expect(group.children).toHaveLength(1);expect(mesh.geometry).toBe(geometry);
 });
 it('adds a single owned, repeat-safe ground batch and exact source remains',()=>{
  const{group,mesh,geometry}=source(),origin:V3=[-3000,0,-250],before=geometry.getAttribute('position').array.slice(),hash=catalog.tiles['-12_1'].lods.find(r=>r.level===0)!.sha256;
  const result=applyMillYardGrounds(group,'-12_1',origin,0,hash);expect(result?.status).toBe('applied');expect(result!.triangles).toBeGreaterThan(0);expect(result!.plantings).toBe(0);
  expect(applyMillYardGrounds(group,'-12_1',origin,0,hash)).toBe(result);expect(mesh.geometry).toBe(geometry);expect(geometry.getAttribute('position').array).toEqual(before);
  const owned=group.children.find(o=>o.name==='Mill Street industrial apron')!;expect(owned.children).toHaveLength(1);expect(group.userData.environmentGrassExclusions.length).toBeGreaterThan(0);
  for(const o of owned.children as THREE.Mesh[]){expect(o.userData.townCrafted).toBe(true);expect((o.material as THREE.Material).userData.townCrafted).toBe(true);}
 });
});
