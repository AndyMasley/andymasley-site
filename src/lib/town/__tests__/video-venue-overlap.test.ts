// @vitest-environment node
import {describe,it,expect} from 'vitest';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import release from '../../../../data/derived/town/release.json';
import {applyCraftedFrontages,Batch} from '../crafted-frontages';
import {applyCommercialCompletion} from '../commercial-completion';
import {VIDEO_VENUE_DETAILS,retireSupersededVideoFrontages} from '../video-venue-details';
const row=VIDEO_VENUE_DETAILS.venues[0],origin=new THREE.Vector3(...row.origin),frame={...row.frame,structId:row.id,tileId:row.tileId};
const input={nativeId:row.id,facadeId:row.facadeId,frame,width:row.frame.width,floor:row.frame.floor,top:row.frame.top};
const hash=(v:Uint8Array|string)=>createHash('sha256').update(v).digest('hex');
function inside(p:THREE.Vector3){
  const dx=p.x+origin.x-frame.start[0],dn=-p.z-origin.z-frame.start[1],u=dx*frame.tangent[0]+dn*frame.tangent[1],v=dx*frame.outward[0]+dn*frame.outward[1];
  return u>=-.5&&u<=frame.width+.5&&v>=-.26&&v<=.65&&p.y>=frame.floor-.5&&p.y<=frame.top+.65;
}
function signatures(group:THREE.Group){
  const outside:string[]=[];let oldBank=0;
  group.traverse(o=>{
    if(!(o instanceof THREE.Mesh)||o.userData.category!=='crafted-frontages')return;
    const p=o.geometry.getAttribute('position'),n=o.geometry.getAttribute('normal');
    for(let i=0;i<p.count;i+=3){
      const ps=[0,1,2].map(k=>new THREE.Vector3().fromBufferAttribute(p,i+k));
      if(o.userData.sourceIds?.includes(row.id)&&ps.every(inside))oldBank++;
      else outside.push(hash(JSON.stringify([o.name,(o.material as THREE.Material).name,...ps.map(p=>p.toArray()),...[0,1,2].map(k=>[n.getX(i+k),n.getY(i+k),n.getZ(i+k)])])));
    }
  });return{oldBank,outside:hash(JSON.stringify(outside.sort()))};
}
function dispose(group:THREE.Group){const gs=new Set<THREE.BufferGeometry>(),ms=new Set<THREE.Material>();group.traverse(o=>{if(o instanceof THREE.Mesh){gs.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])ms.add(m);}});gs.forEach(g=>g.dispose());ms.forEach(m=>m.dispose());}
describe('Eastern Pearl replaces its earlier authored generic frontage',()=>{
  it.each([0,1,2])('removes residual shop frames/fascia while retaining native shell and neighboring crafted fronts at native LOD%i',async level=>{
    const dir=`public/town-assets/${release.directory}`,manifest=JSON.parse(fs.readFileSync(`${dir}/manifest.json`,'utf8')),tile=manifest.tiles.find((t:{id:string})=>t.id===row.tileId),lod=tile.lods.find((l:{level:number})=>l.level===level),bytes=fs.readFileSync(`${dir}/${lod.url}`);
    expect(hash(bytes)).toBe(row.lods[level].sha256);
    const loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);loader.register(()=>({name:'GEOMETRY_ONLY_TEXTURE_STUB',loadTexture:async()=>new THREE.DataTexture(new Uint8Array([255,255,255,255]),1,1)})as never);
    const group=(await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene;
    try{
      applyCraftedFrontages(group,tile.id,tile.origin,level);
      const before=signatures(group),native:{mesh:THREE.Mesh;geometry:THREE.BufferGeometry;material:THREE.Material|THREE.Material[];data:string}[]=[];
      group.traverse(o=>{if(o instanceof THREE.Mesh&&!o.userData.townCrafted)native.push({mesh:o,geometry:o.geometry,material:o.material,data:hash(JSON.stringify(Array.from(o.geometry.getAttribute('position').array)))});});
      expect(before.oldBank).toBeGreaterThan(100);
      const report=applyCommercialCompletion(group,tile.id,tile.origin,level,lod.sha256)!;
      expect(report.status).toBe('applied');expect(report.removedTriangles).toBe(before.oldBank);
      expect(signatures(group)).toEqual({oldBank:0,outside:before.outside});
      for(const o of native){expect(o.mesh.geometry).toBe(o.geometry);expect(o.mesh.material).toBe(o.material);expect(hash(JSON.stringify(Array.from(o.geometry.getAttribute('position').array)))).toBe(o.data);}
      const newFront=group.getObjectByName('Commercial research completion')!;
      expect(newFront.children.some(o=>o.userData.sourceIds?.includes(row.facadeId))).toBe(true);
      expect(applyCommercialCompletion(group,tile.id,tile.origin,level,lod.sha256)).toBe(report);
    }finally{dispose(group);}
  });
  it('requires exact source identity/frame and the prior authored namespace, leaving native and specialized entries intact',()=>{
    const b=new Batch(origin,0);b.box(frame,'trim',2,frame.floor+1,.3,.2,1,.2);
    const group=b.finish().group,old=group.children[0]as THREE.Mesh;
    expect(retireSupersededVideoFrontages(group,origin,[{...input,width:input.width+.01}])).toBe(0);
    old.userData.sourceIds=['neighbor'];expect(retireSupersededVideoFrontages(group,origin,[input])).toBe(0);
    old.userData.sourceIds=[row.id];old.userData.townCrafted=false;expect(retireSupersededVideoFrontages(group,origin,[input])).toBe(0);
    old.userData.townCrafted=true;old.userData.category='commercial-completion';expect(retireSupersededVideoFrontages(group,origin,[input])).toBe(0);
    expect(group.children).toHaveLength(1);dispose(group);
  });
});
