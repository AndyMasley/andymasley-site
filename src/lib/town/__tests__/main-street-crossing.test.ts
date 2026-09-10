// @vitest-environment node
import {describe,it,expect,vi} from 'vitest';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import catalog from '../../../../data/derived/town/main-street-crossing.json';
import release from '../../../../data/derived/town/release.json';
import {applyMainStreetCrossing,churchCrossingStripes} from '../main-street-crossing';
import {tileAssemblySteps,type TileDetails} from '../tile-assembly';
import type {V3} from '../contracts';

const origin=catalog.origin as V3,hash=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
const height=(p:number[])=>catalog.baseHeight+(p[0]-catalog.center[0])*.006+(p[1]-catalog.center[1])*.008;
function scene(missing=false){
 const group=new THREE.Group(),roads=new THREE.Group();roads.name='roads';group.add(roads);
 const p:number[]=[];for(const [i,ring] of churchCrossingStripes().entries()){
  if(missing&&i===7)continue;
  for(const k of [0,1,2,0,2,3]){const q=ring[k];p.push(q[0]-origin[0],height(q),-q[1]-origin[2]);}
 }
 const geometry=new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(p,3));geometry.computeVertexNormals();
 const material=new THREE.MeshStandardMaterial();material.name='Drive road | asphalt';const mesh=new THREE.Mesh(geometry,material);roads.add(mesh);
 const paint=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.MeshStandardMaterial());paint.name='Existing Main crossing E';group.add(paint);
 return{group,mesh,geometry,material,paint};
}
const apply=(g:THREE.Group,level=0)=>applyMainStreetCrossing(g,catalog.tileId,origin,level,catalog.lods[level]?.sha256??catalog.lods[0].sha256)!;
function inspect(g:THREE.Group){
 const mesh=g.getObjectByName('Main Street Church mouth crossing') as THREE.Mesh<THREE.BufferGeometry,THREE.MeshStandardMaterial>;
 expect(mesh.userData.townCrafted).toBe(true);expect(mesh.material.map).toBeNull();
 const p=mesh.geometry.getAttribute('position'),n=mesh.geometry.getAttribute('normal');
 for(let i=0;i<p.count;i+=3){const a=new THREE.Vector3().fromBufferAttribute(p,i),b=new THREE.Vector3().fromBufferAttribute(p,i+1).sub(a),c=new THREE.Vector3().fromBufferAttribute(p,i+2).sub(a),face=b.cross(c);expect(face.lengthSq()).toBeGreaterThan(1e-15);expect(face.y).toBeGreaterThan(0);for(let k=0;k<3;k++)expect(new THREE.Vector3().fromBufferAttribute(n,i+k).length()).toBeCloseTo(1,5);}
 return mesh;
}
describe('photo-supported Church Street mouth crossing',()=>{
 it('drapes all stripes on a slope while preserving source buffers and crossing E',()=>{
  const f=scene(),before=f.geometry.getAttribute('position').array.slice(),paintGeometry=f.paint.geometry,paintMaterial=f.paint.material;
  const r=apply(f.group);expect(r.status).toBe('applied');expect(r.stripes).toBe(15);expect(r.supportedAreaM2).toBeCloseTo(16.17,3);
  const mesh=inspect(f.group),p=mesh.geometry.getAttribute('position');for(let i=0;i<p.count;i++)expect(p.getY(i)).toBeCloseTo(height([p.getX(i)+origin[0],-p.getZ(i)-origin[2]])+catalog.offsetM,4);
  expect(f.mesh.geometry).toBe(f.geometry);expect(f.mesh.material).toBe(f.material);expect(f.geometry.getAttribute('position').array).toEqual(before);expect(f.paint.geometry).toBe(paintGeometry);expect(f.paint.material).toBe(paintMaterial);
  expect(apply(f.group)).toBe(r);expect(f.group.children.filter(o=>o.name===mesh.name)).toHaveLength(1);
  const sd=vi.spyOn(f.material,'dispose'),gd=vi.spyOn(f.geometry,'dispose');mesh.material.dispose();mesh.geometry.dispose();expect(sd).not.toHaveBeenCalled();expect(gd).not.toHaveBeenCalled();
 });
 it('rejects missing asphalt support without publishing partial stripes, and rejects stale sources',()=>{
  const f=scene(true),before=f.group.children.slice();expect(apply(f.group).status).toBe('no-support');expect(f.group.children).toEqual(before);expect(f.group.userData.mainStreetCrossing).toBeUndefined();
  expect(applyMainStreetCrossing(f.group,'wrong',origin,0,catalog.lods[0].sha256)).toBeUndefined();
  expect(applyMainStreetCrossing(f.group,catalog.tileId,origin,0,'old')?.status).toBe('source-mismatch');expect(applyMainStreetCrossing(f.group,catalog.tileId,[-2999,0,1000],0,catalog.lods[0].sha256)?.status).toBe('source-mismatch');expect(apply(f.group,3).status).toBe('source-mismatch');
  const h=release.manifestSha256;try{release.manifestSha256='old';expect(apply(f.group).status).toBe('source-mismatch');}finally{release.manifestSha256=h;}
 });
 it('uses the same local pavement when the tile has been placed in the world',()=>{
  const a=scene(),b=scene();b.group.position.fromArray(origin);b.group.updateMatrixWorld(true);apply(a.group);apply(b.group);
  expect(inspect(a.group).geometry.getAttribute('position').array).toEqual(inspect(b.group).geometry.getAttribute('position').array);
 });
 it.each([0,1,2])('adds one complete crossing at native LOD%i in the authoritative order',async level=>{
  const root=process.cwd(),base=`${root}/public/town-assets/${release.directory}`,rawManifest=fs.readFileSync(`${base}/manifest.json`);expect(hash(rawManifest)).toBe(catalog.sourceManifestSha256);const manifest=JSON.parse(rawManifest.toString()),tile=manifest.tiles.find((t:{id:string})=>t.id===catalog.tileId),lod=tile.lods[level],bytes=fs.readFileSync(`${base}/${lod.url}`);expect(hash(bytes)).toBe(catalog.lods[level].sha256);
  const loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);loader.register(()=>({name:'NATIVE_TEXTURE_STUB',loadTexture:async()=>new THREE.DataTexture(new Uint8Array([255,255,255,255]),1,1)})as never);const group=(await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene;
  const index=(name:string)=>JSON.parse(fs.readFileSync(`${root}/data/derived/town/${name}-index.json`,'utf8'));
  const packet=(a:{url:string}|undefined)=>a?JSON.parse(fs.readFileSync(`${root}/public${a.url}`,'utf8')):undefined;
  const direct=(name:string)=>packet(index(name).tiles[tile.id]),perLevel=(name:string)=>packet(index(name).tiles[tile.id]?.levels[level]);
  const details:TileDetails={road:direct('road-finish')?.rows,terrain:perLevel('terrain-finish'),environmentGround:perLevel('environment-ground'),roadMaterials:perLevel('road-materials'),streetCornerGround:perLevel('street-corner-ground'),streetCorners:direct('street-corners'),roadCurve:perLevel('road-curve'),roadDash:perLevel('road-dash'),parking:packet(index('paved-surfaces').lotAssets[tile.id])};
  const stamp=(g:THREE.BufferGeometry)=>{const h=createHash('sha256');for(const a of Object.values(g.attributes))h.update(Buffer.from(a.array.buffer,a.array.byteOffset,a.array.byteLength));if(g.index)h.update(Buffer.from(g.index.array.buffer,g.index.array.byteOffset,g.index.array.byteLength));return h.digest('hex');};
  try{for(const step of tileAssemblySteps(group,tile,level,details)){
   if(step.name!=='mainStreetCrossing'){step.apply();continue;}
   const before=new Map<THREE.Mesh,{g:THREE.BufferGeometry;m:THREE.Material|THREE.Material[];hash:string}>();group.traverse(o=>{if(o instanceof THREE.Mesh)before.set(o,{g:o.geometry,m:o.material,hash:stamp(o.geometry)});});const childCount=group.children.length;
   const r=step.apply() as ReturnType<typeof applyMainStreetCrossing>;expect(r?.status).toBe('applied');expect(r?.stripes).toBe(15);expect(r?.triangles).toBe(98);expect(r?.supportedAreaM2).toBeCloseTo(16.17,4);expect(group.children).toHaveLength(childCount+1);inspect(group);
   for(const[o,b]of before){expect(o.geometry).toBe(b.g);expect(o.material).toBe(b.m);expect(stamp(o.geometry)).toBe(b.hash);}break;
  }expect(group.userData.mainStreetCrossing.status).toBe('applied');}
  finally{const gs=new Set<THREE.BufferGeometry>(),ms=new Set<THREE.Material>(),ts=new Set<THREE.Texture>();group.traverse(o=>{if(o instanceof THREE.Mesh){gs.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material]){ms.add(m);for(const v of Object.values(m))if(v instanceof THREE.Texture)ts.add(v);}}});gs.forEach(g=>g.dispose());ms.forEach(m=>m.dispose());ts.forEach(t=>t.dispose());}
 },20_000);
});
