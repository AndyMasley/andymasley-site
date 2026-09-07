// @vitest-environment node
import{describe,it,expect,vi}from'vitest';
import*as THREE from'three';
import{readFileSync,readdirSync}from'node:fs';
import{createHash}from'node:crypto';
import{basename,resolve}from'node:path';
import index from '../../../../data/derived/town/additional-environment-index.json';
import{applyAdditionalEnvironment,validAdditionalEnvironmentPacket,type AdditionalEnvironmentPacket,type AdditionalEnvironmentObject}from'../additional-environment';
function fixture(kind:AdditionalEnvironmentObject['kind']='cemetery-stone'){
 const group=new THREE.Group(),geometry=new THREE.PlaneGeometry(20,20).rotateX(-Math.PI/2),material=new THREE.MeshStandardMaterial();geometry.translate(0,1,0);
 const mesh=new THREE.Mesh(geometry,material);mesh.name=kind==='dam-crest'||kind==='shore-lily'?'water':'terrain';group.add(mesh);
 const packet:AdditionalEnvironmentPacket={version:1,tileId:'test',sourceManifestSha256:index.sourceManifestSha256,objects:[{id:'test-1',tileId:'test',kind,point:[0,0],featureId:'source-ground',seed:.2,variant:'older',sourceHeight:1,sourceSha256:'a'.repeat(64),evidenceIds:['TER-019']}]};
 return{group,geometry,material,mesh,packet};
}
function values(group:THREE.Group){const rows:number[]=[];group.getObjectByName('Additional researched environment')?.traverse(o=>{if(o instanceof THREE.Mesh)rows.push(...o.geometry.getAttribute('position').array);});return rows;}
describe('additional researched environment',()=>{
 it('adds anonymous supported stone geometry once while retaining all source buffers and material ownership',()=>{
  const{group,geometry,material,mesh,packet}=fixture(),source=geometry.getAttribute('position').array.slice(),dispose=vi.spyOn(geometry,'dispose'),matDispose=vi.spyOn(material,'dispose');
  const report=applyAdditionalEnvironment(group,'test',[0,0,0],0,packet)!;
  expect(report.rejected).toBe(false);expect(report.ids).toEqual(['test-1']);expect(report.addedTriangles).toBeGreaterThan(12);expect(mesh.geometry).toBe(geometry);expect(mesh.material).toBe(material);expect(geometry.getAttribute('position').array).toEqual(source);expect(dispose).not.toHaveBeenCalled();expect(matDispose).not.toHaveBeenCalled();
  expect(applyAdditionalEnvironment(group,'test',[0,0,0],0,packet)).toBe(report);expect(group.children).toHaveLength(2);expect(values(group).every(Number.isFinite)).toBe(true);
 });
 it('cancels attached root transforms while using tile origin and exact source child transforms',()=>{
  const a=fixture(),b=fixture();b.group.position.set(1000,70,-300);b.group.rotation.y=.3;
  b.packet.objects[0].point=[250,750];applyAdditionalEnvironment(a.group,'test',[0,0,0],0,a.packet);applyAdditionalEnvironment(b.group,'test',[250,0,-750],0,b.packet);
  const left=values(a.group),right=values(b.group);expect(right).toHaveLength(left.length);for(let i=0;i<left.length;i++)expect(right[i]).toBeCloseTo(left[i],4);
 });
 it('keeps aquatic leaves on supported water, thins distant stones and never uses dry ground as water',()=>{
  const dry=fixture();dry.packet.objects[0].kind='shore-lily';expect(applyAdditionalEnvironment(dry.group,'test',[0,0,0],0,dry.packet)!.ids).toEqual([]);
  const water=fixture('shore-lily');expect(applyAdditionalEnvironment(water.group,'test',[0,0,0],0,water.packet)!.ids).toHaveLength(1);
  const heights=values(water.group).filter((_,i)=>i%3===1);expect(Math.min(...heights)).toBeGreaterThanOrEqual(1.01);expect(Math.max(...heights)).toBeLessThan(1.04);
  const far=fixture();far.packet.objects[0].seed=.9;expect(applyAdditionalEnvironment(far.group,'test',[0,0,0],2,far.packet)!.ids).toEqual([]);
 });
 it('keeps both concrete launch lanes continuous down a measured slope at every LOD, with a center gap',()=>{
  for(const level of[0,1,2]){
   const x=fixture('boat-ramp'),pos=x.geometry.getAttribute('position');
   for(let i=0;i<pos.count;i++)pos.setY(i,1-pos.getX(i)*.06);x.geometry.computeVertexNormals();
   x.packet.objects[0].angle=0;const source=pos.array.slice(),report=applyAdditionalEnvironment(x.group,'test',[0,0,0],level,x.packet)!;
   expect(report.launches).toEqual([{id:'test-1',lanes:2,slabs:26,requestedSlabs:26}]);expect(report.addedTriangles).toBeLessThan(2500);expect(pos.array).toEqual(source);
   const p=values(x.group);for(let i=0;i<p.length;i+=3){expect(Math.abs(p[i+2])).toBeGreaterThanOrEqual(.099);expect(Math.abs(p[i+2])).toBeLessThanOrEqual(3.201);const offset=p[i+1]-(1-p[i]*.06);expect(Math.min(Math.abs(offset-.045),Math.abs(offset+.075))).toBeLessThan(.0001);}
  }
 });
 it('renders a documented one-lane launch as one strip, never duplicates it into a double ramp',()=>{
  const x=fixture('boat-ramp');x.packet.objects[0].lanes=1;x.packet.objects[0].rampRange=[-7,8];
  const r=applyAdditionalEnvironment(x.group,'test',[0,0,0],0,x.packet)!;expect(r.launches).toEqual([{id:'test-1',lanes:1,slabs:15,requestedSlabs:15}]);expect(r.addedTriangles).toBeLessThan(2000);
  const p=values(x.group);expect(Math.min(...p.filter((_,i)=>i%3===0))).toBe(-7);expect(Math.max(...p.filter((_,i)=>i%3===0))).toBe(8);expect(Math.max(...p.filter((_,i)=>i%3===2).map(Math.abs))).toBeCloseTo(1.55,4);
 });
 it('covers an interior terrain ridge missed by the original slab corners without changing its source',()=>{
  const x=fixture('boat-ramp');x.packet.objects[0].lanes=1;x.packet.objects[0].rampRange=[-1,1];
  const ground=new THREE.PlaneGeometry(20,20,80,80).rotateX(-Math.PI/2),p=ground.getAttribute('position');
  for(let i=0;i<p.count;i++)p.setY(i,1+.18*Math.max(0,1-Math.abs(p.getX(i)-.25)/.25)*Math.max(0,1-Math.abs(p.getZ(i)-.25)/.25));ground.computeVertexNormals();x.mesh.geometry=ground;
  const source=p.array.slice(),report=applyAdditionalEnvironment(x.group,'test',[0,0,0],0,x.packet)!;expect(report.launches[0].slabs).toBe(2);expect(p.array).toEqual(source);x.group.updateMatrixWorld(true);
  const added=x.group.getObjectByName('Additional researched environment')!,ray=new THREE.Raycaster(new THREE.Vector3(),new THREE.Vector3(0,-1,0));
  for(let u=-.9;u<1;u+=.075)for(let v=-1.5;v<1.5;v+=.075){ray.ray.origin.set(u,5,v);const bottom=ray.intersectObject(x.mesh)[0]?.point.y,top=ray.intersectObject(added,true)[0]?.point.y;expect(bottom).toBeDefined();expect(top).toBeDefined();expect(top!-bottom!).toBeGreaterThan(.015);expect(top!-bottom!).toBeLessThan(.26);}
 });
 it('treats absent or invalid optional evidence as an unchanged source scene',()=>{
  const a=fixture();expect(applyAdditionalEnvironment(a.group,'test',[0,0,0],0)).toBeUndefined();expect(a.group.children).toHaveLength(1);
  for(const alter of[(p:AdditionalEnvironmentPacket)=>{p.objects.push({...p.objects[0]});},(p:AdditionalEnvironmentPacket)=>{p.sourceManifestSha256='b'.repeat(64);},(p:AdditionalEnvironmentPacket)=>{p.objects[0].point[0]=NaN;}]){const x=fixture();alter(x.packet);expect(validAdditionalEnvironmentPacket(x.packet,'test')).toBe(false);expect(applyAdditionalEnvironment(x.group,'test',[0,0,0],0,x.packet)!.rejected).toBe(true);expect(x.group.children).toHaveLength(1);}
 });
 it('validates every emitted hash, count, owner, finite recipe and no stale optional packet',()=>{
  const names:string[]=[],ids=new Set<string>();let count=0;
  for(const[tile,ref]of Object.entries(index.tiles)){const raw=readFileSync(resolve('public',ref.url.slice(1))),packet=JSON.parse(raw.toString('utf8')) as AdditionalEnvironmentPacket;
   expect(raw.length).toBe(ref.bytes);expect(createHash('sha256').update(raw).digest('hex')).toBe(ref.sha256);expect(validAdditionalEnvironmentPacket(packet,tile)).toBe(true);expect(packet.objects).toHaveLength(ref.count);names.push(basename(ref.url));
   for(const r of packet.objects){expect(ids.has(r.id)).toBe(false);ids.add(r.id);count++;}
  }
  expect(count).toBe(index.count);expect(readdirSync(resolve('public/town-evidence/v1/additional-environment')).filter(p=>p.endsWith('.json')).sort()).toEqual(names.sort());
 });
 it('uses one actual qualified wet-margin shrub anchor for flowers and never creates a new planting domain',()=>{
  const rows=Object.entries(index.tiles).flatMap(([tile,ref])=>(JSON.parse(readFileSync('public'+ref.url,'utf8')) as AdditionalEnvironmentPacket).objects.filter(r=>r.kind==='wetland-shrub'&&r.seed<.265));expect(rows).toHaveLength(1);expect(rows[0].featureId).toBe('cedar-swamp-margin');
  for(const level of[0,1]){const x=fixture('wetland-shrub');x.packet.objects[0].seed=rows[0].seed;const report=applyAdditionalEnvironment(x.group,'test',[0,0,0],level,x.packet)!;expect(report.flowers).toEqual(['test-1']);expect(report.addedTriangles).toBeLessThan(level?100:276);}
  const other=fixture('wetland-shrub');other.packet.objects[0].seed=.8;expect(applyAdditionalEnvironment(other.group,'test',[0,0,0],0,other.packet)!.flowers).toEqual([]);
 });

});
