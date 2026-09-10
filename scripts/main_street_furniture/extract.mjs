/** Read pinned retained geometry. This exports geometry evidence, never textures. */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/examples/jsm/libs/meshopt_decoder.module.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),out=process.env.WEBSTER_MAIN_FURNITURE_OUT??'/private/tmp/webster-main-furniture-audit';fs.mkdirSync(out,{recursive:true});
const hash=b=>createHash('sha256').update(b).digest('hex'),read=p=>JSON.parse(fs.readFileSync(p));const release=read(root+'/data/derived/town/release.json'),dir=root+'/public/town-assets/'+release.directory,mb=fs.readFileSync(dir+'/manifest.json');if(hash(mb)!==release.manifestSha256)throw Error('Manifest mismatch');const tile=JSON.parse(mb).tiles.find(t=>t.id==='-12_-4');
const loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);loader.register(()=>({name:'GEOMETRY_ONLY_PLACEHOLDER',loadTexture(){return Promise.resolve(new THREE.DataTexture(new Uint8Array([255,255,255,255]),1,1));}}));
for(const lod of tile.lods){const bytes=fs.readFileSync(dir+'/'+lod.url);if(hash(bytes)!==lod.sha256)throw Error('LOD mismatch');const g=(await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene;g.updateMatrixWorld(true);const faces=[];
g.traverse(o=>{if(!(o instanceof THREE.Mesh))return;const p=o.geometry.getAttribute('position'),ix=o.geometry.index,mats=Array.isArray(o.material)?o.material:[o.material];const ps=Array.from({length:p.count},(_,i)=>{const v=new THREE.Vector3().fromBufferAttribute(p,i).applyMatrix4(o.matrixWorld);return[v.x+tile.origin[0],-v.z-tile.origin[2],v.y+tile.origin[1]];});for(let i=0;i<(ix?.count??p.count);i+=3){const t=[0,1,2].map(k=>ps[ix?ix.getX(i+k):i+k]);if(Math.max(...t.map(p=>p[0]))<-2930||Math.min(...t.map(p=>p[0]))>-2795||Math.max(...t.map(p=>p[1]))<-990||Math.min(...t.map(p=>p[1]))>-895)continue;const mat=mats[o.geometry.groups.find(r=>i>=r.start&&i<r.start+r.count)?.materialIndex??0];faces.push({mesh:o.name,material:mat.name,triangle:t});}});
fs.writeFileSync(out+'/'+tile.id+'-'+lod.level+'.source.json.gz',gzipSync(JSON.stringify({tileId:tile.id,origin:tile.origin,level:lod.level,sourceManifestSha256:release.manifestSha256,sourceSha256:lod.sha256,faces})));console.log(JSON.stringify({level:lod.level,faces:faces.length,sha256:lod.sha256}));
}
