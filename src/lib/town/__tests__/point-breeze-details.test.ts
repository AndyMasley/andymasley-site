// @vitest-environment node
import {describe,it,expect,vi} from 'vitest';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import release from '../../../../data/derived/town/release.json';
import {applyPointBreezeDetails,POINT_BREEZE_DETAILS as row} from '../point-breeze-details';
const dir=`public/town-assets/${release.directory}`,rawManifest=fs.readFileSync(`${dir}/manifest.json`),manifest=JSON.parse(rawManifest.toString()),tile=manifest.tiles.find((t:{id:string})=>t.id===row.tileId);
const hash=(s:Buffer|string)=>createHash('sha256').update(s).digest('hex');
async function native(level:number){
  expect(hash(rawManifest)).toBe(row.sourceManifestSha256);
  expect(hash(fs.readFileSync('data/source/town/point-breeze-details-input.json'))).toBe(row.sourceInputSha256);
  const lod=tile.lods.find((l:{level:number})=>l.level===level),raw=fs.readFileSync(`${dir}/${lod.url}`);expect(hash(raw)).toBe(row.lods[level].sha256);
  const loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);loader.register(()=>({name:'GEOMETRY_TEXTURE_PLACEHOLDER',loadTexture:async()=>new THREE.DataTexture(new Uint8Array([255,255,255,255]),1,1)})as never);
  return(await loader.parseAsync(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength),'')).scene;
}
function resources(group:THREE.Group){
  const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>(),textures=new Set<THREE.Texture>();
  group.traverse(o=>{if(o instanceof THREE.Mesh){geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material]){materials.add(m);for(const v of Object.values(m))if(v instanceof THREE.Texture)textures.add(v);}}});return{geometries,materials,textures};
}
function dispose(group:THREE.Group){const r=resources(group);r.geometries.forEach(g=>g.dispose());r.materials.forEach(m=>m.dispose());r.textures.forEach(t=>t.dispose());}
function nativeTriangles(group:THREE.Group){
  const triangles:{key:string;material:THREE.Material;points:THREE.Vector3[]}[]=[];
  group.updateMatrixWorld(true);const inverse=group.matrixWorld.clone().invert();
  group.traverse(o=>{if(!(o instanceof THREE.Mesh)||o.userData.townCrafted)return;
    const g=o.geometry,p=g.getAttribute('position'),ix=g.index,count=ix?.count??p.count,mats=Array.isArray(o.material)?o.material:[o.material],matrix=inverse.clone().multiply(o.matrixWorld);
    for(const part of g.groups.length?g.groups:[{start:0,count,materialIndex:0}])for(let i=part.start;i<Math.min(count,part.start+part.count);i+=3){
      const ids=[0,1,2].map(k=>ix?ix.getX(i+k):i+k),m=mats[part.materialIndex??0],values:unknown[]=[m.uuid];
      for(const[name,a]of Object.entries(g.attributes) as [string,THREE.BufferAttribute|THREE.InterleavedBufferAttribute][]){values.push(name,a.itemSize,a.normalized);const getters=[a.getX,a.getY,a.getZ,a.getW];for(const id of ids)for(let k=0;k<a.itemSize;k++)values.push(getters[k].call(a,id));}
      triangles.push({key:hash(JSON.stringify(values)),material:m,points:ids.map(id=>new THREE.Vector3().fromBufferAttribute(p,id).applyMatrix4(matrix).add(new THREE.Vector3(...row.origin)))});
    }
  });return triangles;
}
function inFrame(ps:THREE.Vector3[],f:typeof row.frame,half:number,bottom:number,top:number){return ps.every(p=>{const dx=p.x-f.start[0],dn=-p.z-f.start[1],u=dx*f.tangent[0]+dn*f.tangent[1],v=dx*f.outward[0]+dn*f.outward[1];return Math.abs(u)<=half&&v>=-.06&&v<=.25&&p.y>=bottom&&p.y<=top;});}
function bytes(g:THREE.BufferGeometry){return Object.entries(g.attributes).map(([name,a])=>[name,a.itemSize,a.normalized,hash(Buffer.from(a.array.buffer,a.array.byteOffset,a.array.byteLength))]);}
function projected(p:THREE.Vector3){const dx=p.x+row.origin[0]-row.frame.start[0],dn=-p.z-row.origin[2]-row.frame.start[1];return[u(dx,dn),dx*row.frame.outward[0]+dn*row.frame.outward[1],p.y+row.origin[1]];}
function u(dx:number,dn:number){return dx*row.frame.tangent[0]+dn*row.frame.tangent[1];}

describe('Point Breeze registered notch entrance',()=>{
  it.each([0,1,2])('replaces only its obsolete entry and notch window, with exact remaining native attributes/materials at LOD%i',async level=>{
    const group=await native(level),before=nativeTriangles(group),original:{g:THREE.BufferGeometry;data:unknown}[]=[];
    group.traverse(o=>{if(o instanceof THREE.Mesh)original.push({g:o.geometry,data:bytes(o.geometry)});});
    const r=applyPointBreezeDetails(group,row.tileId,row.origin,level,row.lods[level].sha256)!;
    expect(r.status).toBe('applied');expect(r.ids).toEqual([row.id]);expect(r.formerEntryTriangles).toBe(24);expect(r.notchWindowTriangles).toBe(48);
    const removed=before.filter(t=>/^V2 inferred \| (trim|glass|door)$/.test(t.material.name)&&(inFrame(t.points,row.former,.66,row.former.floor-.061,row.former.floor+2.25)||inFrame(t.points,row.frame,row.frame.width/2+.02,r.floor-.1,Math.min(row.sourceEave,r.floor+2.7))));
    expect(removed).toHaveLength(r.removedTriangles);
    const removedKeys=new Set(removed.map(t=>t.key)),retained=before.filter(t=>!removedKeys.has(t.key));
    expect(nativeTriangles(group).map(t=>t.key).sort()).toEqual(retained.map(t=>t.key).sort());
    // Original GLB buffers are never rewritten, including buffers retired after
    // compaction. Hashes include normals/UVs, not merely position counts.
    for(const o of original)expect(bytes(o.g)).toEqual(o.data);
    const currentResources=resources(group);for(const t of retained)expect(currentResources.materials.has(t.material)).toBe(true);
    expect(removed.every(t=>!/(wall|roof|foundation)/.test(t.material.name))).toBe(true);
    expect(r.floor).toBeGreaterThan(row.former.floor+.45);expect(r.floor).toBeLessThan(row.former.floor+.60);
    expect(Math.max(...r.postGround)-Math.min(...r.postGround)).toBeLessThan(.07);expect(r.shutterPairs).toBeGreaterThan(5);
    expect(r.triangles).toBeLessThan(2200);expect(r.meshes).toBeLessThan(14);expect(r.geometryBytes).toBeLessThan(180000);
    const crafted=group.getObjectByName('Point Breeze registered notch entrance')as THREE.Group;
    crafted.traverse(o=>{if(!(o instanceof THREE.Mesh))return;const p=o.geometry.getAttribute('position'),ix=o.geometry.index,count=ix?.count??p.count;
      for(const a of Object.values(o.geometry.attributes) as (THREE.BufferAttribute|THREE.InterleavedBufferAttribute)[])expect(Array.from(a.array).every(Number.isFinite)).toBe(true);
      for(let i=0;i<count;i+=3){const[a,b,c]=[0,1,2].map(k=>new THREE.Vector3().fromBufferAttribute(p,ix?ix.getX(i+k):i+k));expect(b.sub(a).cross(c.sub(a)).lengthSq()).toBeGreaterThan(1e-12);}
    });
    // Both pale uprights reach their own sampled support; the wide threshold
    // is registered to local terrain rather than the distant generated floor.
    const pale=crafted.children.find(o=>o instanceof THREE.Mesh&&(o.material as THREE.MeshStandardMaterial).color.getHexString()===row.appearance.frame.slice(1))as THREE.Mesh;
    const ps=Array.from({length:pale.geometry.getAttribute('position').count},(_,i)=>projected(new THREE.Vector3().fromBufferAttribute(pale.geometry.getAttribute('position'),i)));
    for(const[side,index]of[[-1,0],[1,1]]){const foot=ps.filter(p=>Math.abs(p[0]-side*row.dimensions.postU)<.04&&Math.abs(p[1]-row.dimensions.postV)<.04);expect(foot.length).toBeGreaterThan(0);expect(Math.min(...foot.map(p=>p[2]))).toBeCloseTo(r.postGround[index]-.008,4);}
    const terrain:THREE.Mesh[]=[];group.traverse(o=>{if(o instanceof THREE.Mesh&&!o.userData.townCrafted&&/^terrain(?:\b|_)/i.test(o.name))terrain.push(o);});
    const thresholdGround:number[]=[];
    for(const u of[-row.dimensions.thresholdWidth/2,row.dimensions.thresholdWidth/2])for(const v of[.005,.245]){
      const x=row.frame.start[0]+row.frame.tangent[0]*u+row.frame.outward[0]*v-row.origin[0],z=-row.frame.start[1]-row.frame.tangent[1]*u-row.frame.outward[1]*v-row.origin[2];
      const hit=new THREE.Raycaster(new THREE.Vector3(x,100,z),new THREE.Vector3(0,-1,0)).intersectObjects(terrain,false)[0];expect(hit).toBeDefined();thresholdGround.push(hit.point.y+row.origin[1]);
    }
    const sill=crafted.children.find(o=>o instanceof THREE.Mesh&&(o.material as THREE.MeshStandardMaterial).color.getHexString()==='b9b8ad')as THREE.Mesh;
    expect(sill.geometry.boundingBox!.min.y+row.origin[1]).toBeCloseTo(Math.min(...thresholdGround)-.008,4);
    expect(sill.geometry.boundingBox!.max.y+row.origin[1]).toBeCloseTo(Math.max(...thresholdGround)+.024,4);
    const own=resources(crafted);expect(own.textures.size).toBe(1);const texture=[...own.textures][0];expect(texture.userData.sourceUrl).toBe('town-generated:point-breeze-canopy-letters-v1');
    const letters=group.getObjectByName('Point Breeze canopy lettering')as THREE.Mesh,lp=letters.geometry.getAttribute('position'),uv=letters.geometry.getAttribute('uv');
    // Positive u points left when facing this south facade, so lettering must
    // run from max u (texture x0) to min u (texture x1), never mirrored.
    const left=Array.from({length:lp.count},(_,i)=>({u:projected(new THREE.Vector3().fromBufferAttribute(lp,i))[0],x:uv.getX(i)})).sort((a,b)=>b.u-a.u);
    expect(left[0].x).toBe(0);expect(left[left.length-1].x).toBe(1);
    expect(applyPointBreezeDetails(group,row.tileId,row.origin,level,row.lods[level].sha256)).toBe(r);
    const textureDisposed=vi.fn();texture.addEventListener('dispose',textureDisposed);dispose(group);expect(textureDisposed).toHaveBeenCalledOnce();
    console.log('Point Breeze native',JSON.stringify({level,...r}));
  });
  it('rejects changed source fields and missing support before mutating native geometry',async()=>{
    const group=await native(0),before=nativeTriangles(group).map(t=>t.key),saved=release.manifestSha256;
    try{
      expect(applyPointBreezeDetails(group,'other',row.origin,0,row.lods[0].sha256)).toBeUndefined();
      for(const[origin,level,sha]of[[row.origin,0,'stale'],[[0,0,0],0,row.lods[0].sha256],[row.origin,9,row.lods[0].sha256],[[NaN,0,2750],0,row.lods[0].sha256]]as const)expect(applyPointBreezeDetails(group,row.tileId,origin,level,sha)?.status).toBe('source-mismatch');
      release.manifestSha256='new-release';expect(applyPointBreezeDetails(group,row.tileId,row.origin,0,row.lods[0].sha256)?.status).toBe('source-mismatch');release.manifestSha256=saved;
      expect(nativeTriangles(group).map(t=>t.key)).toEqual(before);expect(group.getObjectByName('Point Breeze registered notch entrance')).toBeUndefined();
      const terrain:THREE.Mesh[]=[];group.traverse(o=>{if(o instanceof THREE.Mesh&&/^terrain(?:\b|_)/i.test(o.name))terrain.push(o);});expect(terrain.length).toBeGreaterThan(0);terrain.forEach(o=>o.removeFromParent());
      const remaining=nativeTriangles(group).map(t=>t.key);expect(applyPointBreezeDetails(group,row.tileId,row.origin,0,row.lods[0].sha256)?.status).toBe('no-support');expect(nativeTriangles(group).map(t=>t.key)).toEqual(remaining);terrain.forEach(o=>group.add(o));
      group.traverse(o=>{if(o instanceof THREE.Mesh)for(const m of Array.isArray(o.material)?o.material:[o.material])if(m.name==='V2 inferred | door')m.name='Protected observed door';});
      expect(applyPointBreezeDetails(group,row.tileId,row.origin,0,row.lods[0].sha256)?.status).toBe('no-source');
    }finally{release.manifestSha256=saved;dispose(group);}
  });
  it.each(['integer','normalized','interleaved'])('rejects unsupported %s attributes before any geometry replacement',async layout=>{
    const group=await native(0);let target:THREE.Mesh|undefined;
    group.traverse(o=>{if(o instanceof THREE.Mesh&&(Array.isArray(o.material)?o.material:[o.material]).some(m=>m.name==='V2 inferred | door'))target=o;});expect(target).toBeDefined();
    const g=target!.geometry,n=g.getAttribute('position').count;
    if(layout==='integer')g.setAttribute('testAttribute',new THREE.BufferAttribute(new Uint8Array(n),1));
    if(layout==='normalized')g.setAttribute('testAttribute',new THREE.BufferAttribute(new Float32Array(n),1,true));
    if(layout==='interleaved')g.setAttribute('testAttribute',new THREE.InterleavedBufferAttribute(new THREE.InterleavedBuffer(new Float32Array(n),1),1,0));
    const before=nativeTriangles(group).map(t=>t.key),res=resources(group);
    expect(applyPointBreezeDetails(group,row.tileId,row.origin,0,row.lods[0].sha256)?.status).toBe('source-mismatch');expect(nativeTriangles(group).map(t=>t.key)).toEqual(before);expect([...resources(group).geometries]).toEqual([...res.geometries]);dispose(group);
  });
});
