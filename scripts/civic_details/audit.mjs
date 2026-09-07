import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath,pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
const here=path.dirname(fileURLToPath(import.meta.url)),repo=path.resolve(here,'../..');
const work=process.env.WEBSTER_CIVIC_QA||'/private/tmp/webster-research-completion/landmarks';fs.mkdirSync(work,{recursive:true});
if(!fs.existsSync(path.join(work,'node_modules')))fs.symlinkSync(path.join(repo,'node_modules'),path.join(work,'node_modules'));
const compiled=path.join(work,'compiled.mjs');
await build({entryPoints:[path.join(here,'entry.ts')],outfile:compiled,bundle:true,platform:'node',format:'esm',external:['three'],logLevel:'silent'});
const {applyCivicDetails,applyTownHallMaterials}=await import(pathToFileURL(compiled).href);
const read=p=>JSON.parse(fs.readFileSync(p)),sha=b=>createHash('sha256').update(b).digest('hex');
const data=read(path.join(repo,'data/derived/town/civic-details.json')),release=read(path.join(repo,'data/derived/town/release.json')),base=path.join(repo,'public/town-assets',release.directory),manifest=read(path.join(base,'manifest.json')),tile=manifest.tiles.find(t=>t.id===data.tileId);
const source=read(path.join(work,'town-hall-source-geometry.json'));
const loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);loader.register(()=>({name:'AUDIT_TEXTURE_STUB',loadTexture(){return Promise.resolve(new THREE.DataTexture(new Uint8Array([255,255,255,255]),1,1));}}));
function hashMesh(o){const g=o.geometry,parts=[];for(const [name,a]of Object.entries(g.attributes)){parts.push(Buffer.from(name));const v=[];for(let i=0;i<a.count;i++)for(let k=0;k<a.itemSize;k++)v.push(a.getComponent(i,k));parts.push(Buffer.from(new Float32Array(v).buffer));}if(g.index)parts.push(Buffer.from(g.index.array.buffer,g.index.array.byteOffset,g.index.array.byteLength));parts.push(Buffer.from(JSON.stringify([g.groups,o.matrix.toArray(),(Array.isArray(o.material)?o.material:[o.material]).map(m=>m.uuid)])));return sha(Buffer.concat(parts));}
function closest(p){let best={distance:Infinity};for(let i=0;i<data.outline.length;i++){const a=data.outline[i],b=data.outline[(i+1)%data.outline.length],dx=b[0]-a[0],dy=b[1]-a[1],w=Math.hypot(dx,dy),u=(p[0]-a[0])*dx/w+(p[1]-a[1])*dy/w,clamp=Math.max(0,Math.min(w,u)),distance=Math.hypot(p[0]-a[0]-dx/w*clamp,p[1]-a[1]-dy/w*clamp);if(distance<best.distance)best={distance,face:i,u,width:w};}return best;}
const report={version:1,sourceManifestSha256:sha(fs.readFileSync(path.join(base,'manifest.json'))),runtimeSha256:sha(fs.readFileSync(path.join(repo,'src/lib/town/civic-details.ts'))),dataSha256:sha(fs.readFileSync(path.join(repo,'data/derived/town/civic-details.json'))),scope:'Actual GLTFLoader at all3LODs, Town Hall material repair applied first; every incoming source mesh attribute/index/transform/material binding preserved. New facade geometry finite, outward winding, unit normals, bounded by source perimeter/height; texture pixels stubbed.',lods:[],failures:[]};
for(const lod of tile.lods){
 const raw=fs.readFileSync(path.join(base,lod.url));if(sha(raw)!==lod.sha256)throw Error('Source hash mismatch');
 const scene=(await loader.parseAsync(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength),'')).scene;
 const correction=applyTownHallMaterials(scene,tile.id,lod.level,lod.sha256);if(correction.status!=='applied')throw Error('Preceding correction rejected');
 const before=new Map();scene.traverse(o=>{if(o instanceof THREE.Mesh)before.set(o,hashMesh(o));});
 const result=applyCivicDetails(scene,tile.id,tile.origin,lod.level,lod.sha256),failures=[];
 if(result.status!=='applied')failures.push('Rejected actual source');
 for(const[o,h]of before)if(hashMesh(o)!==h)failures.push('Source changed '+o.name);
 const added=scene.children.find(o=>o.name==='Civic details | Town Hall and Sitkowski School');let maxDistance=0,maxNormalError=0,minWinding=1,degenerate=0,minZ=Infinity,maxZ=-Infinity,frontIntrusions=0;
 const va=new THREE.Vector3(),vb=new THREE.Vector3(),vc=new THREE.Vector3(),normal=new THREE.Vector3();
 added.traverse(o=>{if(!(o instanceof THREE.Mesh))return;const p=o.geometry.getAttribute('position'),n=o.geometry.getAttribute('normal');for(let i=0;i<p.count;i++){
  const point=[p.getX(i)+tile.origin[0],-p.getZ(i)-tile.origin[2],p.getY(i)+tile.origin[1]],near=closest(point);maxDistance=Math.max(maxDistance,near.distance);minZ=Math.min(minZ,point[2]);maxZ=Math.max(maxZ,point[2]);
  if(!point.every(Number.isFinite))failures.push('Nonfinite');if(near.face>=21&&near.distance>.004)frontIntrusions++;
  maxNormalError=Math.max(maxNormalError,Math.abs(Math.hypot(n.getX(i),n.getY(i),n.getZ(i))-1));
 }
 for(let i=0;i<p.count;i+=3){va.fromBufferAttribute(p,i);vb.fromBufferAttribute(p,i+1).sub(va);vc.fromBufferAttribute(p,i+2).sub(va);normal.crossVectors(vb,vc);if(normal.length()<1e-8){degenerate++;continue;}normal.normalize();minWinding=Math.min(minWinding,normal.dot(va.fromBufferAttribute(n,i)));}
 });
 if(maxDistance>.65)failures.push('Facade exceeds permitted shallow outset '+maxDistance);if(minZ<38.34-.01||maxZ>61.44+.01)failures.push('Vertical source envelope exceeded');if(maxNormalError>1e-5)failures.push('Nonunit normal');if(minWinding<.995)failures.push('Normal/winding mismatch '+minWinding);if(degenerate)failures.push('Degenerate faces '+degenerate);
 if(applyCivicDetails(scene,tile.id,tile.origin,lod.level,lod.sha256)!==result)failures.push('Not idempotent');
 const row={level:lod.level,sourceSha256:lod.sha256,...result,sourceMeshesPreserved:before.size,maxOutsetM:maxDistance,minZ,maxZ,maxNormalError,minWinding,degenerate,frontNearestVertices:frontIntrusions,failures};report.lods.push(row);if(failures.length)report.failures.push(row);console.log(JSON.stringify(row));
 const gs=new Set(),ms=new Set(),ts=new Set();scene.traverse(o=>{if(o instanceof THREE.Mesh){gs.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material]){ms.add(m);for(const v of Object.values(m))if(v instanceof THREE.Texture)ts.add(v);}}});gs.forEach(g=>g.dispose());ms.forEach(m=>m.dispose());ts.forEach(t=>t.dispose());
}
report.status=report.failures.length?'FAIL':'PASS';fs.writeFileSync(path.join(work,'native-audit.json'),JSON.stringify(report,null,2));console.log('FINAL',report.status);if(report.failures.length)process.exitCode=1;
