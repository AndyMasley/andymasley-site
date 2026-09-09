import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/examples/jsm/libs/meshopt_decoder.module.js';
const repo=process.cwd(),read=p=>JSON.parse(fs.readFileSync(p)),sha=b=>createHash('sha256').update(b).digest('hex');
const release=read('data/derived/town/release.json'),base=path.join(repo,'public/town-assets',release.directory),manifest=read(path.join(base,'manifest.json')),tile=manifest.tiles.find(t=>t.id==='-11_-4'),index=read('data/derived/town/foundation-wall-index.json'),packet=read(path.join(repo,'public',index.tiles[tile.id].url)),row=packet.rows.find(r=>r[0]==='168564_866718');
const loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);loader.register(()=>({name:'WALL_FIXTURE_TEXTURE_STUB',loadTexture(){return Promise.resolve(new THREE.DataTexture(new Uint8Array([255,255,255,255]),1,1));}}));
function distance(point){let result=Infinity;const s=row[5];for(let i=0;i<s.length;i+=4){const ax=s[i]/1000,az=s[i+1]/1000,bx=s[i+2]/1000,bz=s[i+3]/1000,dx=bx-ax,dz=bz-az,t=Math.max(0,Math.min(1,((point.x-ax)*dx+(point.z-az)*dz)/(dx*dx+dz*dz||1)));result=Math.min(result,Math.hypot(point.x-ax-t*dx,point.z-az-t*dz));}return result;}
const fixture={version:1,sourceManifestSha256:release.manifestSha256,id:row[0],tileId:tile.id,origin:tile.origin,note:'Actual Meshopt-decoded source wall triangles at AAA, 400 South Main Street. Texture pixels excluded; native positions, normals, UVs and PBR factors retained. Registered source wall supports select the fixture; no synthetic replacement faces.',levels:[]};
for(const lod of tile.lods){
 const raw=fs.readFileSync(path.join(base,lod.url));if(sha(raw)!==lod.sha256)throw Error('Wrong source GLB');const scene=(await loader.parseAsync(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength),'')).scene;scene.updateMatrixWorld(true);const parts=[];
 scene.traverse(o=>{if(!(o instanceof THREE.Mesh))return;const materials=Array.isArray(o.material)?o.material:[o.material],g=o.geometry,p=g.getAttribute('position'),n=g.getAttribute('normal'),uv=g.getAttribute('uv'),ix=g.index;if(!uv)return;const normalMatrix=new THREE.Matrix3().getNormalMatrix(o.matrixWorld);
 for(const part of g.groups.length?g.groups:[{start:0,count:ix?.count??p.count,materialIndex:0}]){const m=materials[part.materialIndex??0];if(!['V2 inferred | foundation','V2 inferred | brick'].includes(m.name))continue;const positions=[],normals=[],uvs=[];
 for(let i=part.start;i<part.start+part.count;i+=3){const ids=[0,1,2].map(k=>ix?ix.getX(i+k):i+k),points=ids.map(k=>new THREE.Vector3().fromBufferAttribute(p,k).applyMatrix4(o.matrixWorld));if(!points.every(v=>distance(v)<.003&&v.y>=row[2]-.01&&v.y<=row[3]+.01))continue;for(let k=0;k<3;k++){positions.push(...points[k].toArray());normals.push(...new THREE.Vector3().fromBufferAttribute(n,ids[k]).applyNormalMatrix(normalMatrix).toArray());uvs.push(uv.getX(ids[k]),uv.getY(ids[k]));}}
 if(positions.length)parts.push({sourceMesh:o.name,material:{name:m.name,color:m.color.toArray(),roughness:m.roughness,metalness:m.metalness},positions,normals,uvs});
 }});fixture.levels.push({level:lod.level,sourceSha256:lod.sha256,parts});
}
const out='src/lib/town/__tests__/fixtures/aaa-foundation-native.json';fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(fixture)+'\n');console.log(out,fs.statSync(out).size,fixture.levels.map(l=>({level:l.level,triangles:l.parts.reduce((n,p)=>n+p.positions.length/9,0)})));
