// @vitest-environment node
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import data from '../../../../data/derived/town/civic-details.json';
import { applyCivicDetails, CIVIC_DETAIL_FRAMES } from '../civic-details';
function fixture(level=0) {
 const group=new THREE.Group(),parent=new THREE.Group(),g=new THREE.BufferGeometry();
 parent.name=data.sourceParentName;
 g.setAttribute('position',new THREE.Float32BufferAttribute(new Float32Array(data.lods[level].totalTriangles*9),3));
 const material=new THREE.MeshStandardMaterial();material.name=data.sourceMaterial;
 const mesh=new THREE.Mesh(g,material);mesh.name=data.sourceMeshName;parent.add(mesh);group.add(parent);
 return{group,mesh,dispose(){const geos=new Set<THREE.BufferGeometry>(),mats=new Set<THREE.Material>();group.traverse(o=>{if(o instanceof THREE.Mesh){geos.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])mats.add(m);}});geos.forEach(g=>g.dispose());mats.forEach(m=>m.dispose());}};
}
describe('researched civic facade completion',()=>{
 it('retains original source meshes and front details, batches additions and reduces distant geometry',()=>{
  const triangles:number[]=[];
  for(let level=0;level<3;level++){
   const f=fixture(level),geometry=f.mesh.geometry,material=f.mesh.material;
   const r=applyCivicDetails(f.group,data.tileId,data.origin,level,data.lods[level].sha256)!;
   expect(r.status).toBe('applied');expect(r.frames).toBe(15);expect(r.windows).toBeGreaterThan(180);expect(r.entrances).toBe(5);
   expect(r.meshes).toBeLessThanOrEqual(10);expect(r.triangles).toBeLessThan(40000);
   expect(f.mesh.geometry).toBe(geometry);expect(f.mesh.material).toBe(material);expect(f.group.children).toHaveLength(2);
   expect(applyCivicDetails(f.group,data.tileId,data.origin,level,data.lods[level].sha256)).toBe(r);
   const added=f.group.children[1];
   added.traverse(o=>{if(o instanceof THREE.Mesh){
    expect(o.userData.townCrafted).toBe(true);expect(o.userData.sourceIds).toEqual([data.structId]);
    const p=o.geometry.getAttribute('position'),n=o.geometry.getAttribute('normal');
    let nonfinite=0,maxNormalError=0;
    // Check every vertex while avoiding hundreds of thousands of assertion objects.
    for(let i=0;i<p.count;i++){
     nonfinite+=Number(!Number.isFinite(p.getX(i)+p.getY(i)+p.getZ(i)));
     maxNormalError=Math.max(maxNormalError,Math.abs(Math.hypot(n.getX(i),n.getY(i),n.getZ(i))-1));
    }
    expect(nonfinite).toBe(0);expect(maxNormalError).toBeLessThan(5e-6);
   }});
   triangles.push(r.triangles);f.dispose();
  }
  expect(triangles[0]).toBeGreaterThan(triangles[1]);expect(triangles[1]).toBeGreaterThan(triangles[2]);
 });
 it('fails closed for unrelated or altered sources and origin',()=>{
  for(const bad of['tile','hash','origin','mesh','count']){
   const f=fixture();if(bad==='mesh')f.mesh.name='other';if(bad==='count')f.mesh.geometry.setDrawRange(0,0);
   if(bad==='count')f.mesh.geometry.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0],3));
   const r=applyCivicDetails(f.group,bad==='tile'?'0_0':data.tileId,bad==='origin'?[0,0,0]:data.origin,0,bad==='hash'?'bad':data.lods[0].sha256);
   expect(r?.status).toBe(bad==='tile'?undefined:'source-mismatch');expect(f.group.children).toHaveLength(1);f.dispose();
  }
 });
 it('adds upper stepwall windows only when the enclosing wall was successfully repaired',()=>{
  const run=(status:string,enclosureTriangles:number)=>{
   const f=fixture();f.group.userData.civicRoofFinish={status,enclosureTriangles};
   const r=applyCivicDetails(f.group,data.tileId,data.origin,0,data.lods[0].sha256)!;
   const basis=f.group.children[1].userData.roofStepBasis;
   f.dispose();return{...r,basis};
  };
  const rejected=run('source-mismatch',12),unclosed=run('applied',0),closed=run('applied',12);
  expect(rejected.frames).toBe(15);expect(unclosed.frames).toBe(15);
  expect(rejected.basis).toBeUndefined();expect(unclosed.basis).toBeUndefined();
  expect(closed.frames).toBe(16);expect(closed.windows).toBe(unclosed.windows+5);
  expect(closed.basis).toContain('not surveyed');
 });
 it('keeps the raised school entrance pediment opaque from both sides of the flat roof',()=>{
  const frame=CIVIC_DETAIL_FRAMES.find(f=>f.recipe==='school-entry')!;
  for(const level of[0,1,2]){
   const f=fixture(level);applyCivicDetails(f.group,data.tileId,data.origin,level,data.lods[level].sha256);
   f.group.position.fromArray(data.origin);f.group.updateMatrixWorld(true);
   for(const side of[-1,1]){
    const u=frame.width*.42,v=side*2;
    const origin=new THREE.Vector3(frame.start[0]+frame.tangent[0]*u+frame.outward[0]*v,60,-frame.start[1]-frame.tangent[1]*u-frame.outward[1]*v);
    const ray=new THREE.Raycaster(origin,new THREE.Vector3(-side*frame.outward[0],0,side*frame.outward[1]),0,4);
    expect(ray.intersectObject(f.group.children[1],true).length).toBeGreaterThan(0);
   }
   f.dispose();
  }
 });
 it('keeps the protected north front and short returns outside the new frame set',()=>{
  expect(new Set(CIVIC_DETAIL_FRAMES.map(f=>f.faceIndex)).size).toBe(15);
  expect(CIVIC_DETAIL_FRAMES.every(f=>f.faceIndex<21)).toBe(true);
  for(const f of CIVIC_DETAIL_FRAMES){expect(Math.hypot(...f.tangent)).toBeCloseTo(1,10);expect(Math.hypot(...f.outward)).toBeCloseTo(1,10);expect(f.tangent[0]*f.outward[0]+f.tangent[1]*f.outward[1]).toBeCloseTo(0,10);}
  expect(data.frames.every(f=>f.dimensionBasis.includes('not a facade survey'))).toBe(true);
 });
});
