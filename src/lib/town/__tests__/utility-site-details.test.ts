// @vitest-environment node
import {describe,expect,it,vi}from'vitest';
import * as THREE from 'three';
import {applyUtilitySiteDetails,UTILITY_SITE_ROWS}from'../utility-site-details';

function dispose(group:THREE.Object3D){group.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();}});}
describe('registered utility basin additions',()=>{
 it('retains all source objects and adds open forms exactly once at every LOD',()=>{
  const r=UTILITY_SITE_ROWS[0];
  for(let level=0;level<3;level++){
   const group=new THREE.Group(),original=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial());original.name='V2 inferred real plant building';group.add(original);const geometry=original.geometry,material=original.material,positions=geometry.getAttribute('position').array.slice(),destroy=vi.spyOn(geometry,'dispose');
   const result=applyUtilitySiteDetails(group,r.tileId,r.origin,level,r.sourceLods[level].sha256)!;
   expect(result.status).toBe('applied');expect(result.ids).toHaveLength(9);expect(result.removedTriangles).toBe(0);expect(result.meshes).toBeLessThanOrEqual(4);expect(result.triangles).toBeLessThan(12000);
   expect(original.geometry).toBe(geometry);expect(original.material).toBe(material);expect(geometry.getAttribute('position').array).toEqual(positions);expect(destroy).not.toHaveBeenCalled();
   expect(applyUtilitySiteDetails(group,r.tileId,r.origin,level,r.sourceLods[level].sha256)).toBe(result);expect(group.userData.environmentTreeExclusions).toHaveLength(9);expect(group.userData.environmentGrassExclusions).toHaveLength(9);dispose(group);
  }
 });
 it('fails closed before adding geometry or vegetation exclusions on any source mismatch',()=>{
  const r=UTILITY_SITE_ROWS[0];for(const [origin,sha,level]of[[r.origin,'wrong',0],[[0,0,0],r.sourceLods[0].sha256,0],[r.origin,r.sourceLods[0].sha256,2]]as const){const group=new THREE.Group();expect(applyUtilitySiteDetails(group,r.tileId,origin,level,sha)?.status).toBe('source-mismatch');expect(group.children).toHaveLength(0);expect(group.userData.environmentTreeExclusions).toBeUndefined();}
  expect(applyUtilitySiteDetails(new THREE.Group(),'absent',[0,0,0],0,'')).toBeUndefined();
 });
 it('keeps every liquid plane above the exact all-LOD terrain maxima and every basin clear of real buildings',()=>{
  for(const r of UTILITY_SITE_ROWS){expect(r.protectedBuildingDistanceM).toBeGreaterThan(.12);for(const s of r.terrainSupport){expect(r.water-s.max).toBeGreaterThanOrEqual(.0999);expect(Math.abs(s.coveredAreaM2-s.requestedAreaM2)).toBeLessThan(.001);}expect(r.appearanceBasis.inferred).toContain('No treatment process');}
  expect(UTILITY_SITE_ROWS.flatMap(r=>r.sourceTreeAnchorsInside)).toHaveLength(1);
 });
});
