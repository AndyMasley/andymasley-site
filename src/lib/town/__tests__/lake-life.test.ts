// @vitest-environment node
import {describe,expect,it} from 'vitest';
import * as THREE from 'three';
import {applyLakeLife,LAKE_LIFE_PROVENANCE as d} from '../lake-life';
describe('dated Indian Princess berth interpretation',()=>{
 it('rejects an unregistered tile, changed source or displaced origin',()=>{
  const g=new THREE.Group();expect(applyLakeLife(g,'other',d.origin,0,d.sourceLods[0])).toBeUndefined();
  expect(applyLakeLife(g,d.tileId,d.origin,1,d.sourceLods[0])?.rejected).toBe(true);
  expect(applyLakeLife(g,d.tileId,[0,0,0],0,d.sourceLods[0])?.rejected).toBe(true);expect(g.children).toHaveLength(0);
 });
 it('adds a bounded hull and detailed vessel with valid finite outward geometry at each LOD, preserving source objects',()=>{
  for(let level=0;level<3;level++){
   const g=new THREE.Group(),source=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial());g.add(source);const original=source.geometry,raw=original.getAttribute('position').array.slice();
   const result=applyLakeLife(g,d.tileId,d.origin,level,(d.sourceLods as Record<string,string>)[String(level)])!;
   expect(result.rejected).toBe(false);expect(result.ids).toEqual(['indian-princess']);expect(result.triangles).toBeLessThan(15000);expect(result.meshes).toBeLessThanOrEqual(12);
   expect(source.geometry).toBe(original);expect(original.getAttribute('position').array).toEqual(raw);expect(applyLakeLife(g,d.tileId,d.origin,level,(d.sourceLods as Record<string,string>)[String(level)])).toBe(result);
   g.children[1].traverse(o=>{if(!(o instanceof THREE.Mesh))return;const p=o.geometry.getAttribute('position'),n=o.geometry.getAttribute('normal'),ix=o.geometry.index;for(let i=0;i<p.count;i++){expect([p.getX(i),p.getY(i),p.getZ(i)].every(Number.isFinite)).toBe(true);expect(Math.hypot(n.getX(i),n.getY(i),n.getZ(i))).toBeCloseTo(1,5);}for(let i=0;i<(ix?.count??p.count);i+=3){const ids=[0,1,2].map(k=>ix?ix.getX(i+k):i+k),a=new THREE.Vector3().fromBufferAttribute(p,ids[0]),b=new THREE.Vector3().fromBufferAttribute(p,ids[1]).sub(a),c=new THREE.Vector3().fromBufferAttribute(p,ids[2]).sub(a),cross=b.cross(c);if(cross.length()>1e-7)expect(cross.normalize().dot(new THREE.Vector3().fromBufferAttribute(n,ids[0]))).toBeGreaterThan(.45);}});
  }
 });
 it('keeps the aerial date and all unsurveyed dimensions explicit',()=>{expect(d.source.aerialYear).toBe(2025);expect(d.mappedWaterFraction).toBeGreaterThan(.99999);expect(d.basis).toContain('authored');expect(d.basis).toContain('not live');});
});
