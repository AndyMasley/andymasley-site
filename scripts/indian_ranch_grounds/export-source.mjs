/** Bound the native venue ground audit; placeholders establish geometry only. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const out=process.env.WEBSTER_RANCH_GROUND_OUT||'/private/tmp/webster-indian-ranch-ground';
const hash=b=>createHash('sha256').update(b).digest('hex');
const release=JSON.parse(fs.readFileSync(path.join(root,'data/derived/town/release.json')));
const base=path.join(root,'public/town-assets',release.directory),rawManifest=fs.readFileSync(path.join(base,'manifest.json'));
if(hash(rawManifest)!==release.manifestSha256)throw Error('Manifest source changed');
const manifest=JSON.parse(rawManifest),bounds=[370,-800,555,-610];
const ids=new Set(['1_-3','2_-3','1_-4','2_-4']);
const loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
loader.register(()=>({name:'TOPOLOGY_PLACEHOLDER',loadTexture:async()=>new THREE.DataTexture(new Uint8Array([255,255,255,255]),1,1)}));
fs.mkdirSync(out,{recursive:true});
for(const tile of manifest.tiles.filter(t=>ids.has(t.id)))for(const lod of tile.lods){
 const raw=fs.readFileSync(path.join(base,lod.url));if(hash(raw)!==lod.sha256)throw Error('Tile source changed');
 const group=(await loader.parseAsync(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength),'')).scene;group.updateMatrixWorld(true);
 const faces=[];
 group.traverse(mesh=>{
  if(!(mesh instanceof THREE.Mesh)||! /^(terrain|roads|water|buildings|landmarks|streetscape)(?:\b|_)/i.test(mesh.name))return;
  const g=mesh.geometry,p=g.getAttribute('position'),materials=Array.isArray(mesh.material)?mesh.material:[mesh.material],count=g.index?.count??p.count;
  for(const part of g.groups.length?g.groups:[{start:0,count,materialIndex:0}]){
   const name=materials[part.materialIndex]?.name??'';
   for(let i=part.start;i<part.start+part.count;i+=3){
    const triangle=[0,1,2].map(k=>{const q=new THREE.Vector3().fromBufferAttribute(p,g.index?.getX(i+k)??i+k).applyMatrix4(mesh.matrixWorld);return[q.x+tile.origin[0],-q.z-tile.origin[2],q.y+tile.origin[1]];});
    if(Math.max(...triangle.map(p=>p[0]))<bounds[0]||Math.min(...triangle.map(p=>p[0]))>bounds[2]||Math.max(...triangle.map(p=>p[1]))<bounds[1]||Math.min(...triangle.map(p=>p[1]))>bounds[3])continue;
    const[a,b,c]=triangle;if(Math.abs((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]))<1e-8)continue;
    faces.push({mesh:mesh.name,name,triangle});
   }
  }
 });
 const record={sourceManifestSha256:release.manifestSha256,tileId:tile.id,origin:tile.origin,level:lod.level,sourceSha256:lod.sha256,inspectionBounds:bounds,faces};
 fs.writeFileSync(path.join(out,`${tile.id}-${lod.level}.source.json.gz`),gzipSync(JSON.stringify(record)));
 console.log(JSON.stringify({tile:tile.id,level:lod.level,faces:faces.length}));
}
