/** Native source audit. Requires the pinned town archive; no browser or texture pixels.
 * TERRAIN_FINISH_WORK controls report/bundle output. Never rewrites source assets.
 */
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/examples/jsm/libs/meshopt_decoder.module.js';
const site=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),work=process.env.TERRAIN_FINISH_WORK??'/private/tmp/webster-finished-streets-audit';fs.mkdirSync(work,{recursive:true});
const hash=bytes=>createHash('sha256').update(bytes).digest('hex'),release=JSON.parse(fs.readFileSync(site+'/data/derived/town/release.json')),base=site+'/public/town-assets/'+release.directory+'/',manifestRaw=fs.readFileSync(base+'manifest.json'),manifest=JSON.parse(manifestRaw),index=JSON.parse(fs.readFileSync(site+'/data/derived/town/terrain-finish-index.json'));
if(hash(manifestRaw)!==release.manifestSha256||index.sourceManifestSha256!==release.manifestSha256)throw new Error('Pinned source manifest mismatch');
const entry=work+'/terrain-audit-entry.ts',bundle=work+'/terrain-audit-bundle.mjs';fs.writeFileSync(entry,`export{applyTerrainFinish}from${JSON.stringify(site+'/src/lib/town/terrain-finish')};export{applyMeasuredBridgeSurface}from${JSON.stringify(site+'/src/lib/town/bridge-surface')};`);
await build({entryPoints:[entry],outfile:bundle,bundle:true,platform:'node',format:'esm',plugins:[{name:'shared-three',setup(b){b.onResolve({filter:/^three$/},()=>({path:fileURLToPath(import.meta.resolve('three')),external:true}));}}],logLevel:'silent'});
const{applyTerrainFinish,applyMeasuredBridgeSurface}=await import(pathToFileURL(bundle).href+'?'+Date.now());
const loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);loader.register(()=>({name:'TERRAIN_AUDIT_TEXTURE_STUB',loadTexture(){return Promise.resolve(new THREE.DataTexture(new Uint8Array([255,255,255,255]),1,1));}}));
const geometryBytes=geometry=>Object.values(geometry.attributes).reduce((sum,a)=>sum+a.array.byteLength,0)+(geometry.index?.array.byteLength??0),attributeHash=a=>hash(Buffer.from(a.array.buffer,a.array.byteOffset,a.array.byteLength));
const result={version:1,created:new Date().toISOString(),sourceManifestSha256:release.manifestSha256,indexSha256:hash(fs.readFileSync(site+'/data/derived/town/terrain-finish-index.json')),basis:'Native GLTFLoader/Meshopt source geometry, with one-pixel texture stubs only. Actual source attributes, triangle indices and node transforms; each source file hash verified. Independent of browser rendering/performance.',levels:[],failures:[]};
const selected=process.env.TERRAIN_AUDIT_TILES?new Set(process.env.TERRAIN_AUDIT_TILES.split(',')):null;
for(const tile of manifest.tiles){if(selected&&!selected.has(tile.id))continue;for(const asset of tile.lods){
 const ref=index.tiles[tile.id]?.levels[String(asset.level)];if(!ref)continue;
 const encoded=fs.readFileSync(site+'/public'+ref.url);if(encoded.length!==ref.bytes||hash(encoded)!==ref.sha256)throw new Error('Terrain packet hash mismatch '+ref.url);const packet=JSON.parse(encoded);
 const raw=fs.readFileSync(base+asset.url);if(hash(raw)!==asset.sha256)throw new Error('Source GLB hash mismatch '+asset.url);
 const begin=performance.now(),gltf=await loader.parseAsync(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength),pathToFileURL(path.dirname(base+asset.url)+'/').href),scene=gltf.scene;applyMeasuredBridgeSurface(scene,tile.id,tile.origin);scene.updateMatrixWorld(true);
 const snapshot=new Map();let before=0;scene.traverse(o=>{if(!(o instanceof THREE.Mesh))return;before+=geometryBytes(o.geometry);snapshot.set(o,{geometry:o.geometry,attributes:Object.fromEntries(Object.entries(o.geometry.attributes).map(([k,a])=>[k,{hash:attributeHash(a),length:a.array.length,values:a.array}])),index:o.geometry.index?{hash:attributeHash(o.geometry.index),values:o.geometry.index.array}:undefined});});
 const decodeMs=performance.now()-begin,applyStart=performance.now(),applied=applyTerrainFinish(scene,tile.id,tile.origin,asset.level,packet),applyMs=performance.now()-applyStart,bad=[];let after=0,newVertices=0,newFaces=0,zeroAreaFaces=0,backwards=0,maximumNormalError=0,maximumWorldDrop=0,maximumBackwardsArea=0,negativeUpFaces=0;
 if(applied.rejected)bad.push('Source-matched packet was rejected');
 const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),n=new THREE.Vector3(),cross=new THREE.Vector3();
 for(const[o,old]of snapshot){const g=o.geometry;after+=geometryBytes(g);if(g===old.geometry){for(const[name,source]of Object.entries(old.attributes))if(attributeHash(g.getAttribute(name))!==source.hash)bad.push('Protected source attribute changed: '+o.name+'/'+name);if(old.index&&attributeHash(g.index)!==old.index.hash)bad.push('Protected source indices changed: '+o.name);continue;}
  if(!/^terrain(?:\b|_)/i.test(o.name))bad.push('Non-terrain geometry replaced: '+o.name);
  const p=g.getAttribute('position'),normal=g.getAttribute('normal'),count=old.geometry.getAttribute('position').count;newVertices+=p.count-count;
  for(const[name,source]of Object.entries(old.attributes)){const out=g.getAttribute(name);if(out.array.slice(0,source.length).some((v,i)=>v!==source.values[i]))bad.push('Original source attribute prefix changed: '+o.name+'/'+name);if(!Array.from(out.array).every(Number.isFinite))bad.push('Nonfinite geometry: '+o.name+'/'+name);}
  for(let i=count;i<p.count;i++)if(normal)maximumNormalError=Math.max(maximumNormalError,Math.abs(Math.hypot(normal.getX(i),normal.getY(i),normal.getZ(i))-1));
  const packetMesh=packet.levels.find(l=>l.level===asset.level).meshes.find(m=>m.mesh===o.name),removed=new Set(packetMesh.patches.map(p=>p[0]));let sourceOffset=0;
  for(let i=0;i<g.index.count;i+=3){const ids=[0,1,2].map(k=>g.index.getX(i+k));if(ids.every(id=>id<count)){while(removed.has(sourceOffset))sourceOffset++;const expected=[0,1,2].map(k=>old.index?old.index.values[sourceOffset*3+k]:sourceOffset*3+k);if(ids.some((v,k)=>v!==expected[k]))bad.push('Unpatched source triangle changed: '+o.name+'/'+sourceOffset);sourceOffset++;continue;}
   newFaces++;a.fromBufferAttribute(p,ids[0]);b.fromBufferAttribute(p,ids[1]);c.fromBufferAttribute(p,ids[2]);cross.copy(b).sub(a).cross(c.clone().sub(a));const area=cross.length();if(area<1e-10){zeroAreaFaces++;continue;}if(normal){n.set(0,0,0);for(const id of ids)n.add(new THREE.Vector3().fromBufferAttribute(normal,id));if(cross.dot(n)<-1e-10){backwards++;maximumBackwardsArea=Math.max(maximumBackwardsArea,area/2);if(cross.y<0)negativeUpFaces++;if(bad.length<20)bad.push('New face normal opposes winding: '+o.name+'/'+i/3);}}
  }
 }
 if(maximumNormalError>1e-4)bad.push('New normals not normalized: '+maximumNormalError);
 const repeated=applyTerrainFinish(scene,tile.id,tile.origin,asset.level,packet);if(repeated.meshes)bad.push('Repair not idempotent');
 const row={tileId:tile.id,level:asset.level,sourceSha256:asset.sha256,packetBytes:encoded.length,decodeMs:Math.round(decodeMs*100)/100,applyMs:Math.round(applyMs*100)/100,geometryBytesAdded:after-before,newVertices,newFaces,zeroAreaFaces,backwards,maximumBackwardsArea,negativeUpFaces,maximumNormalError,...applied,failures:bad.slice(0,20)};result.levels.push(row);if(bad.length||zeroAreaFaces)result.failures.push({tileId:tile.id,level:asset.level,zeroAreaFaces,errors:bad.slice(0,20)});
 const geometries=new Set(),materials=new Set(),textures=new Set();scene.traverse(o=>{if(o instanceof THREE.Mesh){geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material]){materials.add(m);for(const x of Object.values(m))if(x instanceof THREE.Texture)textures.add(x);}}});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());
}}
const quantile=(values,q)=>{const sorted=[...values].sort((a,b)=>a-b);return sorted[Math.floor((sorted.length-1)*q)]??0;};result.summary={levels:result.levels.length,tiles:new Set(result.levels.map(r=>r.tileId)).size,failedLevels:result.failures.length,addedTriangles:result.levels.reduce((s,r)=>s+r.addedTriangles,0),maximumDropM:Math.max(0,...result.levels.map(r=>r.maximumDropM)),maximumAddedGeometryBytes:Math.max(0,...result.levels.map(r=>r.geometryBytesAdded)),medianAddedGeometryBytes:quantile(result.levels.map(r=>r.geometryBytesAdded),.5),medianApplyMs:quantile(result.levels.map(r=>r.applyMs),.5),p95ApplyMs:quantile(result.levels.map(r=>r.applyMs),.95),maximumApplyMs:Math.max(0,...result.levels.map(r=>r.applyMs)),zeroAreaFaces:result.levels.reduce((s,r)=>s+r.zeroAreaFaces,0),backwards:result.levels.reduce((s,r)=>s+r.backwards,0)};
fs.writeFileSync(work+'/terrain-native-audit.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result.summary));if(result.failures.length)process.exitCode=1;
