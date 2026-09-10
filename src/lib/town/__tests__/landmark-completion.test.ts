// @vitest-environment node
import {describe,expect,it} from 'vitest';
import * as THREE from 'three';
import {planDistanceSquared} from '../evidence-buildings';
import {applyLandmarkCompletion,LANDMARK_COMPLETION_ROWS} from '../landmark-completion';
function fixture(row:typeof LANDMARK_COMPLETION_ROWS[number]){
 const group=new THREE.Group();const roof=new THREE.MeshStandardMaterial();roof.name='V2 inferred | roof';
 const p=row.outline[0],g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute([p[0]-row.origin[0],row.eave-row.origin[1],-p[1]-row.origin[2],p[0]+.01-row.origin[0],row.eave-row.origin[1],-p[1]-row.origin[2],p[0]-row.origin[0],row.eave+.01-row.origin[1],-p[1]-row.origin[2]],3));g.computeVertexNormals();const mesh=new THREE.Mesh(g,roof);group.add(mesh);
 const protectedMesh=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial());protectedMesh.name='Existing observed landmark';group.add(protectedMesh);return{group,protectedMesh};
}
function dispose(root:THREE.Object3D){const gs=new Set<THREE.BufferGeometry>(),ms=new Set<THREE.Material>();root.traverse(o=>{if(o instanceof THREE.Mesh){gs.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])ms.add(m);}});gs.forEach(g=>g.dispose());ms.forEach(m=>m.dispose());}
describe('registered civic landmark signatures',()=>{
 it('replaces only selected inferred source, preserves protected source and stays batched at all LODs',()=>{
  for(const row of LANDMARK_COMPLETION_ROWS){let first=0;for(let level=0;level<3;level++){
   const {group,protectedMesh}=fixture(row),g=protectedMesh.geometry,m=protectedMesh.material;
   const result=applyLandmarkCompletion(group,row.tileId,row.origin,level,row.lods[level].sha256)!;
   expect(result.ids).toEqual([row.id]);expect(result.removedTriangles).toBe(1);expect(result.triangles).toBeGreaterThan(2000);expect(result.triangles).toBeLessThan(18000);expect(result.meshes).toBeLessThanOrEqual(15);
   if(!level)first=result.triangles;else if(level===2)expect(result.triangles).toBeLessThan(first);
   expect(protectedMesh.geometry).toBe(g);expect(protectedMesh.material).toBe(m);expect(protectedMesh.parent).toBe(group);expect(applyLandmarkCompletion(group,row.tileId,row.origin,level,row.lods[level].sha256)).toBe(result);
   group.traverse(o=>{if(o instanceof THREE.Mesh&&o.userData.townCrafted){expect(o.userData.sourceIds).toEqual([row.id]);const p=o.geometry.getAttribute('position'),n=o.geometry.getAttribute('normal');for(let i=0;i<p.count;i++){expect(Number.isFinite(p.getX(i)+p.getY(i)+p.getZ(i))).toBe(true);expect(Math.hypot(n.getX(i),n.getY(i),n.getZ(i))).toBeCloseTo(1,5);}}});dispose(group);
  }}
 // Exhaustively visits every vertex across four landmarks and three LODs.
 // Keep every assertion; shared runners need more than the default five seconds.
 },30000);
 it('rejects a wrong source hash or tile origin without changing the scene',()=>{
  const row=LANDMARK_COMPLETION_ROWS[0];for(const bad of['hash','origin']){const{group}=fixture(row),children=[...group.children];expect(applyLandmarkCompletion(group,row.tileId,bad==='origin'?[0,0,0]:row.origin,0,bad==='hash'?'wrong':row.lods[0].sha256)?.status).toBe('source-mismatch');expect(group.children).toEqual(children);dispose(group);}
 });
 it('points the fire apparatus facade outside the west footprint, with outward-facing door panes',()=>{
  const row=LANDMARK_COMPLETION_ROWS.find(r=>r.recipe==='fire')!,frame=row.frame;
  expect(frame.outward[0]).toBeLessThan(-.9);
  const step=(frame.width-1.4)/10;
  for(let i=0;i<10;i++){const u=.7+(i+.5)*step,x=frame.start[0]+frame.tangent[0]*u,y=frame.start[1]+frame.tangent[1]*u;
   expect(planDistanceSquared(row.outline,x+frame.outward[0]*.3,y+frame.outward[1]*.3)).toBeGreaterThan(.05);
   expect(planDistanceSquared(row.outline,x-frame.outward[0]*.3,y-frame.outward[1]*.3)).toBe(0);
  }
  const {group}=fixture(row);applyLandmarkCompletion(group,row.tileId,row.origin,0,row.lods[0].sha256);let doorVertices=0;
  group.traverse(o=>{if(!(o instanceof THREE.Mesh)||!o.userData.townCrafted||!(o.material as THREE.Material).name.endsWith('door | #b1b3a4'))return;const p=o.geometry.getAttribute('position'),n=o.geometry.getAttribute('normal');doorVertices+=p.count;for(let i=0;i<p.count;i++){const x=p.getX(i)+row.origin[0],y=-p.getZ(i)-row.origin[2];expect(planDistanceSquared(row.outline,x,y)).toBeGreaterThan(.01);expect(n.getX(i)*frame.outward[0]-n.getZ(i)*frame.outward[1]).toBeGreaterThan(.999);}});
  expect(doorVertices).toBe(60);dispose(group);
 });
 it('distinguishes inspected dates, historical height evidence and authored dimensions',()=>{
  expect(LANDMARK_COMPLETION_ROWS).toHaveLength(4);
  const church=LANDMARK_COMPLETION_ROWS.find(r=>r.recipe==='reconciliation')!;expect(church.heightException?.heightM).toBeCloseTo(15.8496,6);expect(church.peak).toBeGreaterThan(church.sourcePeak);expect(church.heightException?.basis).toContain('Historical');
  const basilica=LANDMARK_COMPLETION_ROWS.find(r=>r.recipe==='joseph')!;expect(basilica.peak).toBe(basilica.sourcePeak);expect(basilica.frame.outward[0]).toBeLessThan(-.9);expect(basilica.sources[0].photoDate).toBe('2025-06-19');expect(LANDMARK_COMPLETION_ROWS.every(r=>r.inferred.length&&r.observed.length)).toBe(true);
 });
});
