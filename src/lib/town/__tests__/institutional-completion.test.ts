// @vitest-environment node
import {describe,expect,it} from 'vitest';
import * as THREE from 'three';
import {applyInstitutionalCompletion,INSTITUTIONAL_COMPLETION_ROWS} from '../institutional-completion';
import {planDistanceSquared} from '../evidence-buildings';
import {applyCraftedFrontages} from '../crafted-frontages';
function fixture(row:typeof INSTITUTIONAL_COMPLETION_ROWS[number],inferred=true){
 const group=new THREE.Group(),mat=new THREE.MeshStandardMaterial();mat.name=inferred?'V2 inferred | roof':'Observed source roof';
 const p=row.outline[0],g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute([p[0]-row.origin[0],row.eave-row.origin[1],-p[1]-row.origin[2],p[0]+.01-row.origin[0],row.eave-row.origin[1],-p[1]-row.origin[2],p[0]-row.origin[0],row.eave+.01-row.origin[1],-p[1]-row.origin[2]],3));g.computeVertexNormals();group.add(new THREE.Mesh(g,mat));return group;
}
function dispose(group:THREE.Object3D){const gs=new Set<THREE.BufferGeometry>(),ms=new Set<THREE.Material>();group.traverse(o=>{if(o instanceof THREE.Mesh){gs.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])ms.add(m);}});gs.forEach(g=>g.dispose());ms.forEach(m=>m.dispose());}
describe('institutional source-constrained reconstruction',()=>{
 it('builds each matched institution at every LOD without touching an observed source mesh',()=>{
  for(const row of INSTITUTIONAL_COMPLETION_ROWS)for(let level=0;level<3;level++){
   const group=fixture(row),protectedMesh=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial());protectedMesh.userData.townCrafted=true;group.add(protectedMesh);const geometry=protectedMesh.geometry;
   const result=applyInstitutionalCompletion(group,row.tileId,row.origin,level,row.lods[level].sha256)!;
   expect(result.ids).toEqual([row.id]);expect(result.removedTriangles).toBe(1);expect(result.triangles).toBeGreaterThan(250);expect(result.triangles).toBeLessThan(26000);expect(result.meshes).toBeLessThanOrEqual(13);expect(protectedMesh.geometry).toBe(geometry);expect(protectedMesh.parent).toBe(group);
   expect(applyInstitutionalCompletion(group,row.tileId,row.origin,level,row.lods[level].sha256)).toBe(result);dispose(group);
  }
 });
 it('fails closed on wrong SHA/origin and does not claim an unmatched observed body',()=>{
  const row=INSTITUTIONAL_COMPLETION_ROWS[0];for(const bad of['sha','origin']){const group=fixture(row),before=[...group.children];const result=applyInstitutionalCompletion(group,row.tileId,bad==='origin'?[0,0,0]:row.origin,0,bad==='sha'?'wrong':row.lods[0].sha256);expect(result?.ids).toEqual([]);expect(result?.status).toBe('source-mismatch');expect(group.children).toEqual(before);dispose(group);}
  const group=fixture(row,false),before=[...group.children];expect(applyInstitutionalCompletion(group,row.tileId,row.origin,0,row.lods[0].sha256)?.ids).toEqual([]);expect(group.children).toEqual(before);dispose(group);
 });
 it('keeps entrances facing the exterior and all roof zones inside their source height ceiling',()=>{
  expect(INSTITUTIONAL_COMPLETION_ROWS).toHaveLength(16);
  for(const r of INSTITUTIONAL_COMPLETION_ROWS){const f=r.frame,u=f.width/2,x=f.start[0]+f.tangent[0]*u,n=f.start[1]+f.tangent[1]*u;
   expect(planDistanceSquared(r.outline,x+f.outward[0]*.35,n+f.outward[1]*.35)).toBeGreaterThan(.08);expect(planDistanceSquared(r.outline,x-f.outward[0]*.35,n-f.outward[1]*.35)).toBe(0);
   for(const part of r.parts){expect(part.peak).toBeLessThanOrEqual(r.sourcePeak);expect(part.eave).toBeGreaterThan(r.floor+3);}
   expect(r.observed.length).toBeGreaterThan(0);expect(r.inferred.length).toBeGreaterThan(0);
  }
 });
 it('excludes only successfully replaced commercial fronts without changing default calls',()=>{
  const r=INSTITUTIONAL_COMPLETION_ROWS.find(r=>r.recipe==='post')!;
  const unchanged=fixture(r,false);expect(applyCraftedFrontages(unchanged,r.tileId,r.origin,0)?.commercialIds).toContain(r.id);dispose(unchanged);
  const replaced=fixture(r);const institutional=applyInstitutionalCompletion(replaced,r.tileId,r.origin,0,r.lods[0].sha256)!;const crafted=applyCraftedFrontages(replaced,r.tileId,r.origin,0,institutional.ids);expect(crafted?.commercialIds).not.toContain(r.id);expect(crafted?.commercialIds.length).toBeGreaterThan(0);dispose(replaced);
 });
});
