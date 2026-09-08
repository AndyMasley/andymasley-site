// @vitest-environment node
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';import { createHash } from 'node:crypto';
import * as THREE from 'three';
import catalog from '../../../../data/derived/town/rail-crossings.json';
import { applyRailCrossingFinish, railCrossingRows } from '../rail-crossing-finish';
import type { V3 } from '../contracts';
const tileId='-11_3',tile=catalog.tiles[tileId],origin=tile.origin as V3,row=railCrossingRows(tileId)[0];
function scene() {
 const group=new THREE.Group(),geo=new THREE.PlaneGeometry(12,12).rotateX(-Math.PI/2).translate(row.center[0]-origin[0],row.height,-row.center[1]-origin[2]),material=new THREE.MeshStandardMaterial();material.name='Drive road | asphalt';const road=new THREE.Mesh(geo,material);road.name='roads';group.add(road);
 const paintGeo=new THREE.PlaneGeometry(12,.2).rotateX(-Math.PI/2).translate(row.center[0]-origin[0],row.height+.018,-row.center[1]-origin[2]),paintMat=new THREE.MeshStandardMaterial();paintMat.name='Drive road | warm yellow paint';const paint=new THREE.Mesh(paintGeo,paintMat);paint.name='paint';group.add(paint);
 const high=new THREE.Mesh(paintGeo.clone().translate(0,8,0),paintMat);high.name='upper-road-paint';group.add(high);return{group,road,paint,high};
}
describe('current source-qualified railway crossings',()=>{
 it('qualifies only four current standard-gauge alignments, retaining current FRA identity and exact source LOD gates',()=>{
  expect(catalog.crossings.map(r=>r.id).sort()).toEqual(['501836D','501837K','501838S','501841A']);expect(Object.keys(catalog.tiles)).toHaveLength(5);
  expect(createHash('sha256').update(fs.readFileSync('data/source/town/rail-crossings/active-railways.json')).digest('hex')).toBe(catalog.sourceRailwaySha256);
  for(const r of catalog.crossings){expect(r.railwayTags.railway).toBe('rail');expect(r.railwayTags.gauge).toBe('1435');expect(r.gauge).toBe(1.435);expect(Math.hypot(...r.tangent)).toBeCloseTo(1,12);expect(r.center.every(Number.isFinite)).toBe(true);}
  expect(catalog.policy).toContain('never abandoned/disused');expect(catalog.policy).toContain('authored inference');
 });
 it('does not mutate on wrong source, owner or origin',()=>{
  const{group,road,paint}=scene(),before=paint.geometry;
  expect(applyRailCrossingFinish(group,'unregistered',origin,0,'wrong')).toBeUndefined();expect(applyRailCrossingFinish(group,tileId,origin,0,'wrong')?.status).toBe('source-mismatch');expect(applyRailCrossingFinish(group,tileId,[origin[0]+1,origin[1],origin[2]],0,tile.lods[0].sha256)?.status).toBe('source-mismatch');expect(paint.geometry).toBe(before);expect(group.children).toHaveLength(3);expect(road.material).toBeDefined();
 });
 it('adds a supported repeatable finish, leaves asphalt and other-height paint exact, and trims only intersecting source paint',()=>{
  const{group,road,paint,high}=scene(),rg=road.geometry,pg=paint.geometry,hg=high.geometry,raw=pg.getAttribute('position').array.slice(),originalMaterial=paint.material;
  const result=applyRailCrossingFinish(group,tileId,origin,0,tile.lods[0].sha256);expect(result?.status).toBe('applied');expect(result?.paintMeshes).toBe(1);expect(result!.removedPaintAreaM2).toBeGreaterThan(.5);expect(result!.removedPaintAreaM2).toBeLessThan(1);expect(result!.geometryBytes).toBeLessThan(100000);
  expect(road.geometry).toBe(rg);expect(high.geometry).toBe(hg);expect(paint.material).toBe(originalMaterial);expect(paint.geometry.getAttribute('position').array.slice(0,raw.length)).toEqual(raw);
  expect(applyRailCrossingFinish(group,tileId,origin,0,tile.lods[0].sha256)).toBe(result);expect(group.children).toHaveLength(4);
  const built=group.children[3] as THREE.Group;built.traverse(o=>{if(!(o instanceof THREE.Mesh))return;const p=o.geometry.getAttribute('position'),n=o.geometry.getAttribute('normal');expect(o.userData.townCrafted).toBe(true);expect(p.array.every(Number.isFinite)).toBe(true);for(let i=0;i<p.count;i++){expect(p.getY(i)-row.height).toBeGreaterThan(.0029);expect(p.getY(i)-row.height).toBeLessThan(.0071);expect(n.getY(i)).toBeGreaterThan(.999);}});
 });
});
