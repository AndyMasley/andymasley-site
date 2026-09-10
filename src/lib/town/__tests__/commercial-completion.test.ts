// @vitest-environment node
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { applyCommercialCompletion, COMMERCIAL_COMPLETION as data, storefrontDisplaySpans } from '../commercial-completion';
import { applyEvidenceBuildings } from '../evidence-buildings';
import { landmarkRows } from '../evidence-landmarks';

function source(tileId:string){
 const rows=data.rows.filter(r=>r.tileId===tileId),origin=rows[0].origin,group=new THREE.Group(),p:number[]=[];
 for(const r of rows)for(let i=0;i<r.outline.length;i++){
  const a=r.outline[i],c=r.outline[(i+1)%r.outline.length];
  for(const point of [[a[0],r.base,a[1]],[c[0],r.base,c[1]],[c[0],r.eave,c[1]],[a[0],r.base,a[1]],[c[0],r.eave,c[1]],[a[0],r.eave,a[1]]])p.push(point[0]-origin[0],point[1]-origin[1],-point[2]-origin[2]);
 }
 const geometry=new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(p,3));geometry.computeVertexNormals();
 const material=new THREE.MeshStandardMaterial();material.name='V2 inferred | siding';const mesh=new THREE.Mesh(geometry,material);group.add(mesh);return{group,origin,rows,mesh};
}
describe('commercial research completion',()=>{
 it('keeps display glazing out of real doorway openings, including doors at a bay edge',()=>{
  for(const [left,right,entry,width]of [[0,6,1.4,1.6],[0,6,3,1.6],[0,6,0,.95],[0,6,6,.95],[0,6,-3,1.2],[0,6,9,1.2]]){
   const spans=storefrontDisplaySpans(left,right,entry,width);
   for(const [a,c]of spans){expect(a).toBeGreaterThanOrEqual(left);expect(c).toBeLessThanOrEqual(right);expect(c-a).toBeGreaterThanOrEqual(.55);expect(c<=entry-width/2-.239999||a>=entry+width/2+.239999).toBe(true);}
   for(let i=1;i<spans.length;i++)expect(spans[i][0]).toBeGreaterThan(spans[i-1][1]);
  }
 });
 it('keeps shared Main Street identities on disjoint street segments',()=>{
  const row=data.rows.find(r=>r.id==='168341_866602')!,f=row.frames[0];
  const intervals=row.frames.map(g=>{const u=g.start.reduce((sum,v,i)=>sum+(v-f.start[i])*f.tangent[i],0);return[u,u+g.width,g.id] as const;}).sort((a,b)=>a[0]-b[0]);
  expect(intervals.map(r=>r[2])).toEqual(['MS-S-017','MS-S-016','MS-S-015']);
  for(let i=1;i<intervals.length;i++)expect(intervals[i][0]-intervals[i-1][1]).toBeGreaterThan(-1e-7);
  expect(row.frames.find(f=>f.id==='MS-S-016')!.recipe).toBe('moderne');expect(row.frames.find(f=>f.id==='MS-S-015')!.stories).toBe(2);
  expect(data.rows.find(r=>r.id==='168378_866662')!.frames.map(f=>f.id)).toContain('MS-N-017');
 });
 it('restores three measured roof levels without raising the lower Gilles rear wing',()=>{
  const r=data.rows.find(r=>r.id==='168247_866622')!;
  expect(r.bodyParts.map(p=>p.eave)).toEqual([43.55,39.95,48.85]);expect(r.bodyParts.every(p=>p.eave<r.peak)).toBe(true);
  const area=(p:number[][])=>Math.abs(p.reduce((s,a,i)=>{const b=p[(i+1)%p.length];return s+a[0]*b[1]-b[0]*a[1];},0))/2;
  expect(r.bodyParts.reduce((n,p)=>n+area(p.outline),0)).toBeCloseTo(area(r.outline),5);
  const ids=data.rows.flatMap(r=>r.frames.map(f=>f.id));expect(ids).not.toContain('MS-N-011');expect(ids).not.toContain('MS-S-014');expect(ids).not.toContain('MS-S-019');
 });
 it('fails closed for source hash, LOD, origin, and absent native geometry',()=>{
  const{group,origin,rows,mesh}=source('-12_-4'),g=mesh.geometry,count=group.children.length;
  for(const[l,sha,o]of[[0,'wrong',origin],[4,rows[0].lods[0].sha256,origin],[0,rows[0].lods[0].sha256,[0,0,0]],[0,rows[0].lods[0].sha256,[NaN,0,0]]]as const)expect(applyCommercialCompletion(group,'-12_-4',o,l,sha)!.status).toBe('source-mismatch');
  expect(group.children.length).toBe(count);expect(mesh.geometry).toBe(g);
  expect(applyCommercialCompletion(new THREE.Group(),'-12_-4',origin,0,rows[0].lods[0].sha256)!.status).toBe('source-mismatch');
  expect(applyCommercialCompletion(group,'50_50',origin,0,'wrong')).toBeUndefined();
 });
 it('keeps the lower shared block intact through subsequent general evidence processing',()=>{
  const{group,origin,rows}=source('-13_-4');
  const first=applyCommercialCompletion(group,'-13_-4',origin,0,rows[0].lods[0].sha256)!;
  expect(first.removedTriangles).toBeGreaterThan(0);
  const authored=group.getObjectByName('Commercial research completion')!,before=authored.children.map(o=>(o as THREE.Mesh).geometry);
  const target=landmarkRows('-13_-4').filter(r=>r.id==='168247_866622').map(r=>({...r,material:r.material??undefined,paint:r.paint??undefined}));
  applyEvidenceBuildings(group,'-13_-4',origin,0,[],target);
  expect(authored.children.map(o=>(o as THREE.Mesh).geometry)).toEqual(before);
  expect(group.userData.commercialCompletion).toBe(first);
 });
 it('presents the lake-name lettering left to right and upright from its actual frontage',()=>{
  const{group,origin,rows}=source('2_-2');applyCommercialCompletion(group,'2_-2',origin,0,rows[0].lods[0].sha256);
  const mesh=group.getObjectByName('Commercial research | lake-name letters') as THREE.Mesh,geo=mesh.geometry,p=geo.getAttribute('position'),uv=geo.getAttribute('uv');
  const f=rows.find(r=>r.id==='171795_867169')!.frames[0],right=new THREE.Vector3(-f.outward[1],0,-f.outward[0]);
  const samples=Array.from({length:p.count},(_,i)=>({x:new THREE.Vector3().fromBufferAttribute(p,i).dot(right),y:p.getY(i),u:uv.getX(i),v:uv.getY(i)}));
  const left=samples.filter(s=>s.u===0),rightSamples=samples.filter(s=>s.u===1),bottom=samples.filter(s=>s.v===0),top=samples.filter(s=>s.v===1);
  expect(Math.min(...rightSamples.map(s=>s.x))).toBeGreaterThan(Math.max(...left.map(s=>s.x)));
  expect(Math.min(...top.map(s=>s.y))).toBeGreaterThan(Math.max(...bottom.map(s=>s.y)));
 });
 it.each([0,1,2])('emits bounded outward geometry and is idempotent at LOD%s',level=>{
  for(const tile of new Set(data.rows.map(r=>r.tileId))){
   const{group,origin,rows,mesh}=source(tile),before=mesh.geometry,values=Array.from(before.getAttribute('position').array),material=mesh.material;
   const result=applyCommercialCompletion(group,tile,origin,level,rows[0].lods[level].sha256)!;
   expect(result.status).toBe('applied');expect(result.triangles).toBeLessThan(14000);expect(result.meshes).toBeLessThan(38);
   expect(applyCommercialCompletion(group,tile,origin,level,rows[0].lods[level].sha256)).toBe(result);
   if(tile!=='-13_-4'){expect(mesh.geometry).toBe(before);expect(mesh.material).toBe(material);expect(Array.from(before.getAttribute('position').array)).toEqual(values);}
   group.getObjectByName('Commercial research completion')!.traverse(o=>{
    if(!(o instanceof THREE.Mesh))return;const p=o.geometry.getAttribute('position'),n=o.geometry.getAttribute('normal');
    for(let i=0;i<p.count;i+=3){const a=new THREE.Vector3().fromBufferAttribute(p,i),b=new THREE.Vector3().fromBufferAttribute(p,i+1),c=new THREE.Vector3().fromBufferAttribute(p,i+2),normal=new THREE.Vector3().fromBufferAttribute(n,i),cross=b.sub(a).cross(c.sub(a));expect([...a,...b,...c,...normal].every(Number.isFinite)).toBe(true);expect(cross.length()).toBeGreaterThan(1e-9);expect(cross.dot(normal)).toBeGreaterThan(0);}
   });
  }
 // Full source-tile geometry census, not a five-second performance benchmark.
 // Preserve all winding, support and idempotence assertions on shared runners.
 },30000);
});
