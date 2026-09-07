// @vitest-environment node
import {describe,it,expect,vi}from'vitest';import*as THREE from'three';import fs from'node:fs';import{createHash}from'node:crypto';
import index from'../../../../data/derived/town/environment-facilities-index.json';import groundIndex from'../../../../data/derived/town/environment-ground-index.json';
import{applyEnvironmentFacilities,validEnvironmentFacilitiesPacket,type EnvironmentFacilitiesPacket}from'../environment-facilities';import{validEnvironmentGroundPacket}from'../environment-ground';
function fixture():EnvironmentFacilitiesPacket{return{version:1,tileId:'1_1',sourceManifestSha256:index.sourceManifestSha256,objects:[{id:'court',tileId:'1_1',kind:'court',sport:'basketball',point:[252,254],angle:.24,length:26,width:14,height:5,outline:[[239,247],[265,247],[265,261],[239,261]],grid:{rows:2,columns:2,heights:[5,5,5,5,5.1,5,5,5,5]},evidenceIds:['mapped-court']}]};}
describe('Registered environment facilities',()=>{
 it('validates all emitted files, hashes, sizes, tile identities and bounded profiles without source archive dependencies',()=>{
  const names:string[]=[];for(const[tile,ref]of Object.entries(index.tiles)){names.push(ref.url.split('/').pop()!);const raw=fs.readFileSync('public'+ref.url);expect(raw.length).toBe(ref.bytes);expect(createHash('sha256').update(raw).digest('hex')).toBe(ref.sha256);const p=JSON.parse(raw.toString());expect(p.objects.length).toBe(ref.count);expect(validEnvironmentFacilitiesPacket(p,tile)).toBe(true);}
  expect(fs.readdirSync('public/town-evidence/v1/environment-facilities').filter(x=>x.endsWith('.json')).sort()).toEqual(names.sort());const groundNames:string[]=[];for(const[tile,row]of Object.entries(groundIndex.tiles))for(const[level,ref]of Object.entries(row.levels)){groundNames.push(ref.url.split('/').pop()!);const raw=fs.readFileSync('public'+ref.url);expect(raw.length).toBe(ref.bytes);expect(createHash('sha256').update(raw).digest('hex')).toBe(ref.sha256);const p=JSON.parse(raw.toString());expect(p.levels[0].level).toBe(Number(level));expect(validEnvironmentGroundPacket(p,tile)).toBe(true);}
  expect(fs.readdirSync('public/town-evidence/v1/environment-ground').filter(x=>x.endsWith('.json')).sort()).toEqual(groundNames.sort());
 });
 it('adds finite upward court/line surfaces and coherent equipment without mutating source geometry or materials',()=>{
  const group=new THREE.Group(),source=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial());source.name='Protected source';group.add(source);const positions=source.geometry.getAttribute('position').array.slice(),geometry=source.geometry,material=source.material,dispose=vi.spyOn(geometry,'dispose');const report=applyEnvironmentFacilities(group,'1_1',[250,0,-250],0,fixture())!;expect(report.ids).toEqual(['court']);expect(report.triangles).toBeGreaterThan(200);expect(source.geometry).toBe(geometry);expect(source.material).toBe(material);expect(source.geometry.getAttribute('position').array).toEqual(positions);expect(dispose).not.toHaveBeenCalled();expect(group.userData.environmentGrassExclusions).toHaveLength(1);expect(group.userData.environmentTreeExclusions).toEqual(group.userData.environmentGrassExclusions);
  const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),n=new THREE.Vector3();group.getObjectByName('Registered environment facilities')!.traverse(o=>{if(!(o instanceof THREE.Mesh))return;const p=o.geometry.getAttribute('position'),normal=o.geometry.getAttribute('normal');for(const attr of Object.values(o.geometry.attributes))expect(Array.from((attr as THREE.BufferAttribute).array).every(Number.isFinite)).toBe(true);for(let i=0;i<p.count;i+=3){a.fromBufferAttribute(p,i);b.fromBufferAttribute(p,i+1);c.fromBufferAttribute(p,i+2);const cross=b.sub(a).cross(c.sub(a));expect(cross.length()).toBeGreaterThan(1e-9);n.fromBufferAttribute(normal,i);expect(cross.dot(n)).toBeGreaterThan(0);}});
  expect(applyEnvironmentFacilities(group,'1_1',[250,0,-250],0,fixture())).toBe(report);
 });
 it('rejects malformed or stale packets before adding geometry or exclusions',()=>{
  for(const mutate of[(p:EnvironmentFacilitiesPacket)=>p.sourceManifestSha256='x',(p:EnvironmentFacilitiesPacket)=>p.objects[0].grid!.heights.pop(),(p:EnvironmentFacilitiesPacket)=>p.objects[0].point[0]=NaN]){const p=fixture();mutate(p);const group=new THREE.Group();expect(applyEnvironmentFacilities(group,'1_1',[0,0,0],0,p)?.rejected).toBe(true);expect(group.children).toHaveLength(0);expect(group.userData.environmentGrassExclusions).toBeUndefined();}
 });
 it('adds field equipment only within registered space, keeps the field surface fixed and retains low-LOD silhouettes',()=>{
  const p=fixture(),f=p.objects[0];Object.assign(f,{sport:'baseball',point:[0,0],angle:0,length:100,width:90,home:[-40,0],infieldAxis:0,outline:[[-50,-45],[50,-45],[50,45],[-50,45]],grid:{rows:1,columns:1,heights:[5,5,5,5]}});
  const outputs=[];for(const level of[0,1,2]){const group=new THREE.Group(),r=applyEnvironmentFacilities(group,'1_1',[0,0,0],level,p)!;expect(r.equipment).toMatchObject({backstops:1,benches:2,footballGoals:0});outputs.push(r.triangles);}
  expect(outputs[0]).toBeGreaterThan(outputs[2]);
  f.home=[-49,0];const clipped=applyEnvironmentFacilities(new THREE.Group(),'1_1',[0,0,0],0,p)!;expect(clipped.equipment.backstops).toBe(0);
  f.sport='football';delete f.home;for(const level of[0,1,2])expect(applyEnvironmentFacilities(new THREE.Group(),'1_1',[0,0,0],level,p)!.equipment.footballGoals).toBe(2);
 });
 it('keeps a registered fence narrow and grounded on a slope without changing the source or adding grass exclusions',()=>{
  const p=fixture(),f=p.objects[0];Object.assign(f,{kind:'fence',gate:true,point:[0,0],angle:0,length:4,width:.3,outline:[[-2,-.15],[2,-.15],[2,.15],[-2,.15]],grid:{rows:1,columns:1,heights:[5,5,5.7,5.7]}});delete f.sport;
  const group=new THREE.Group(),r=applyEnvironmentFacilities(group,'1_1',[0,0,0],0,p)!;expect(r.equipment).toMatchObject({gates:1,fenceMeters:4});expect(group.userData.environmentGrassExclusions).toHaveLength(0);
  group.getObjectByName('Registered environment facilities')!.traverse(o=>{if(!(o instanceof THREE.Mesh))return;const a=o.geometry.getAttribute('position');for(let i=0;i<a.count;i++){expect(Math.abs(a.getZ(i))).toBeLessThan(.18);expect(a.getY(i)).toBeGreaterThan(4.7);expect(a.getY(i)).toBeLessThan(7.6);}});
 });

});
