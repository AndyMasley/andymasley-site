// @vitest-environment node
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import catalog from '../../../../data/derived/town/commercial-frontage-grounds.json';
import { applyCommercialFrontageGrounds } from '../commercial-frontage-grounds';
import type { V3 } from '../contracts';
const origin:V3=[-3250,0,1000], tile=catalog.tiles['-13_-4'];
function scene() {
 const group=new THREE.Group(),geometry=new THREE.PlaneGeometry(80,80).rotateX(-Math.PI/2).translate(220,35,-10);
 const mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial());mesh.name='terrain';group.add(mesh);return{group,geometry,mesh};
}
describe('Gilles/Tiffany registered hard frontage',()=>{
 it('binds one exact shared facade and all source LODs to a compact finite bounded trace',()=>{
  expect(Object.keys(catalog.tiles)).toEqual(['-13_-4']);expect(catalog.sourceBuildingId).toBe('168247_866622');expect(catalog.sourceAerialDate).toBe(2025);
  expect(createHash('sha256').update(fs.readFileSync('data/derived/town/commercial-completion.json')).digest('hex')).toBe(catalog.sourceFacadeSha256);
  expect(tile.lods.map(l=>l.level)).toEqual([0,1,2]);expect(catalog.features).toHaveLength(1);
  const f=catalog.features[0];expect(f.areaM2).toBeCloseTo(102.228727,5);expect(f.kind).toBe('walk');expect(f.points.flat().every(Number.isFinite)).toBe(true);
  expect(f.indices.every(i=>Number.isInteger(i)&&i>=0&&i<f.points.length)).toBe(true);expect(f.indices.length%3).toBe(0);
  let area=0;for(let i=0;i<f.indices.length;i+=3){const[a,b,c]=f.indices.slice(i,i+3).map(k=>f.points[k]);area+=Math.abs((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]))/2;}expect(area).toBeCloseTo(f.areaM2,4);
  expect(catalog.policy).toContain('authored inference');expect(catalog.policy).toContain('No source building');
 });
 it('rejects wrong tile, level, source hash and origin without mutation',()=>{
  const{group,mesh,geometry}=scene(),raw=geometry.getAttribute('position').array.slice();
  expect(applyCommercialFrontageGrounds(group,'wrong',origin,0,tile.lods[0].sha256)).toBeUndefined();
  for(const[level,sha,at]of [[3,tile.lods[0].sha256,origin],[0,'wrong',origin],[0,tile.lods[0].sha256,[-3250.01,0,1000]]] as [number,string,V3][]){expect(applyCommercialFrontageGrounds(group,'-13_-4',at,level,sha)?.status).toBe('source-mismatch');}
  expect(group.children).toEqual([mesh]);expect(mesh.geometry).toBe(geometry);expect(geometry.getAttribute('position').array).toEqual(raw);expect(group.userData.commercialFrontageGrounds).toBeUndefined();
 });
 it('drapes 12mm over retained terrain, preserves source and owns exactly one repeatable addition',()=>{
  const{group,mesh,geometry}=scene(),raw=geometry.getAttribute('position').array.slice(),material=mesh.material;
  const result=applyCommercialFrontageGrounds(group,'-13_-4',origin,0,tile.lods[0].sha256);expect(result?.status).toBe('applied');expect(result?.plantings).toBe(0);expect(result!.geometryBytes).toBeLessThan(20000);
  expect(applyCommercialFrontageGrounds(group,'-13_-4',origin,0,tile.lods[0].sha256)).toBe(result);expect(group.children).toHaveLength(2);expect(mesh.geometry).toBe(geometry);expect(mesh.material).toBe(material);expect(geometry.getAttribute('position').array).toEqual(raw);
  const added=group.children[1] as THREE.Group;let faces=0;added.traverse(o=>{if(!(o instanceof THREE.Mesh))return;expect(o.userData.townCrafted).toBe(true);const p=o.geometry.getAttribute('position'),n=o.geometry.getAttribute('normal');expect(p.array.every(Number.isFinite)).toBe(true);for(let i=0;i<p.count;i++){expect(p.getY(i)).toBeCloseTo(35.012,4);expect(n.getY(i)).toBeGreaterThan(.999);}faces+=p.count/3;});
  expect(faces).toBe(result!.triangles);expect(group.userData.environmentGrassExclusions).toHaveLength(faces);
 });
});
