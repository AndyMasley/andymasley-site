import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
const site=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const release=JSON.parse(fs.readFileSync(site+'/data/derived/town/release.json'));
const raw=fs.readFileSync(site+'/public/town-assets/'+release.directory+'/models/car.glb');
const scene=(await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength),'')).scene;
scene.updateMatrixWorld(true);const groups=new Map(),point=new THREE.Vector3(),normal=new THREE.Vector3();
scene.traverse(o=>{
 if(!o.isMesh)return;const material=o.material,name=material.name,g=o.geometry,p=g.getAttribute('position'),n=g.getAttribute('normal');
 const row=groups.get(name)??{name,color:material.color.getHex(),roughness:material.roughness,metalness:material.metalness,positions:[],normals:[],indices:[]};
 const base=row.positions.length/3,nm=new THREE.Matrix3().getNormalMatrix(o.matrixWorld);
 for(let i=0;i<p.count;i++){
  point.fromBufferAttribute(p,i).applyMatrix4(o.matrixWorld);normal.fromBufferAttribute(n,i).applyNormalMatrix(nm);
  row.positions.push(...point.toArray().map(v=>Math.round(v*10000)));row.normals.push(...normal.toArray().map(v=>Math.round(v*127)));
 }
 for(let i=0;i<(g.index?.count??p.count);i++)row.indices.push(base+(g.index?.getX(i)??i));groups.set(name,row);
});
const bytes=array=>Buffer.from(array.buffer,array.byteOffset,array.byteLength).toString('base64');
const parts=[...groups.values()].map(row=>{
 if(row.positions.some(v=>v< -32768||v>32767)||Math.max(...row.indices)>65535)throw Error('Packed vehicle exceeds coordinate/index range');
 return{name:row.name,color:row.color,roughness:row.roughness,metalness:row.metalness,positions:bytes(Int16Array.from(row.positions)),normals:bytes(Int8Array.from(row.normals)),indices:bytes(Uint16Array.from(row.indices))};
});
const out={version:1,sourceSha256:createHash('sha256').update(raw).digest('hex'),positionScale:10000,normalScale:127,basis:'The existing authored unbranded source car, packed at 0.1mm position precision for shared static parking instances. Parked occupancy and colors are modeled, not observations of real vehicles.',parts};
fs.writeFileSync(site+'/data/derived/town/parked-vehicle-template.json',JSON.stringify(out));console.log({parts:parts.length,bytes:JSON.stringify(out).length});
