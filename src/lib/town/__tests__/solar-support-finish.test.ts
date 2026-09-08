// @vitest-environment node
import {describe,it,expect,vi}from'vitest';
import*as THREE from'three';
import fs from'node:fs';
import index from'../../../../data/derived/town/environment-facilities-index.json';
import{Batch}from'../crafted-frontages';
import{applyEnvironmentFacilities,type EnvironmentFacilitiesPacket}from'../environment-facilities';

describe('retained solar support contact',()=>{
 it('ends both unequal support posts at the sloping panel underside without changing their plan or buried base',()=>{
  const packet:EnvironmentFacilitiesPacket={version:1,tileId:'0_0',sourceManifestSha256:index.sourceManifestSha256,objects:[{id:'slope',tileId:'0_0',kind:'solar',point:[0,0],angle:0,length:6.6,width:2.4,height:5,outline:[[-3.3,-1.2],[3.3,-1.2],[3.3,1.2],[-3.3,1.2]],grid:{rows:1,columns:1,heights:[5,5.4,5.6,6]},evidenceIds:['fixture']} ]};
  const boxes=vi.spyOn(Batch.prototype,'box');const group=new THREE.Group();applyEnvironmentFacilities(group,'0_0',[0,0,0],0,packet);
  const posts=boxes.mock.calls.filter(c=>c[8]==='#838982');expect(posts.length).toBeGreaterThan(0);
  const ground=(u:number,v:number)=>5+.6*(u/6.6+.5)+.4*(v/2.4+.5);
  for(const call of posts){const[,role,u,y,v,w,h,d]=call;expect(role).toBe('metal');expect(w).toBe(.055);expect(d).toBe(.055);expect(Math.abs(v)).toBeCloseTo(.78,8);expect(y-h/2).toBeCloseTo(ground(u,0)-1.01,8);expect(y+h/2).toBeCloseTo(ground(u,v)+1.05+(v/2.4+.5)*.72-.025,8);}
  boxes.mockRestore();group.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();}});
 });
 it('keeps every current registered solar row finite and upward without changing predecessor meshes at any display level',()=>{
  let rows=0,cases=0;const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),n=new THREE.Vector3();
  for(const[tid,ref]of Object.entries(index.tiles)){
   const packet:EnvironmentFacilitiesPacket=JSON.parse(fs.readFileSync('public'+ref.url,'utf8'));packet.objects=packet.objects.filter(r=>r.kind==='solar');if(!packet.objects.length)continue;rows+=packet.objects.length;
   for(const level of[0,1,2]){const source=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial()),g=new THREE.Group();g.add(source);const geometry=source.geometry,material=source.material,before=geometry.getAttribute('position').array.slice();const result=applyEnvironmentFacilities(g,tid,[0,0,0],level,packet)!;expect(result.rejected).toBe(false);expect(result.ids.length).toBe(packet.objects.length);expect(source.geometry).toBe(geometry);expect(source.material).toBe(material);expect(geometry.getAttribute('position').array).toEqual(before);
    g.getObjectByName('Registered environment facilities')!.traverse(o=>{if(!(o instanceof THREE.Mesh))return;const p=o.geometry.getAttribute('position'),normal=o.geometry.getAttribute('normal');for(let i=0;i<p.count;i+=3){a.fromBufferAttribute(p,i);b.fromBufferAttribute(p,i+1);c.fromBufferAttribute(p,i+2);n.fromBufferAttribute(normal,i);expect(Number.isFinite(a.x+a.y+a.z+b.x+b.y+b.z+c.x+c.y+c.z)).toBe(true);expect(n.length()).toBeCloseTo(1,5);expect(b.sub(a).cross(c.sub(a)).dot(n)).toBeGreaterThan(0);}});
    expect(applyEnvironmentFacilities(g,tid,[0,0,0],level,packet)).toBe(result);g.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();}});cases++;
   }
  }
  expect(rows).toBeGreaterThan(40);expect(cases).toBeGreaterThan(3);
 });
});
