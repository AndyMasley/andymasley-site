/** Geometry/lifecycle evidence using the SAME ordered steps as the live world.
 * Native texture placeholders prove topology, never actual texture appearance,
 * browser frame rates, shader output or physical-device memory. */
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { build } from 'esbuild';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

const site = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const out = path.resolve(process.env.TOWN_ASSEMBLY_OUT || '/private/tmp/webster-indian-ranch-ground/native');
fs.mkdirSync(out, { recursive: true });
const read = p => JSON.parse(fs.readFileSync(p)), hash = b => createHash('sha256').update(b).digest('hex');
const data = name => read(path.join(site, 'data/derived/town', name + '.json'));
const release = data('release'), source = path.join(site, 'public/town-assets', release.directory);
const manifestBytes = fs.readFileSync(path.join(source, 'manifest.json'));
if (hash(manifestBytes) !== release.manifestSha256) throw new Error('Pinned source manifest changed');
const manifest = JSON.parse(manifestBytes);
const indices = Object.fromEntries(['residential-evidence', 'evidence-roofs', 'road-finish', 'terrain-finish', 'paved-surfaces', 'additional-environment', 'roadside', 'environment-ground', 'environment-facilities', 'road-materials', 'street-corners', 'street-corner-ground', 'road-curve', 'road-dash', 'property-terrain', 'foundation-wall'].map(name => [name, data(name + '-index')]));
if (indices['foundation-wall'].sourceManifestSha256 !== release.manifestSha256) throw new Error('Foundation index source mismatch');
const packet = asset => {
  if (!asset) return;
  const bytes = fs.readFileSync(path.join(site, 'public', asset.url.slice(1)));
  if (bytes.length !== asset.bytes || asset.sha256 && hash(bytes) !== asset.sha256) throw new Error('Packet source mismatch: ' + asset.url);
  return JSON.parse(bytes);
};
function details(id, level) {
  const home = packet(indices['residential-evidence'].tiles[id]), roofs = packet(indices['evidence-roofs'].tiles[id]);
  const foundationWalls = packet(indices['foundation-wall'].tiles[id]);
  if (indices['foundation-wall'].tiles[id] && !validFoundationWallPacket(foundationWalls,id)) throw new Error('Invalid foundation-wall packet: '+id);
  return { foundationWalls, evidence: { buildings: home?.buildings ?? [], roofs: roofs ?? [], failures: 0 },
    road: packet(indices['road-finish'].tiles[id])?.rows,
    terrain: packet(indices['terrain-finish'].tiles[id]?.levels[level]),
    parking: packet(indices['paved-surfaces'].lotAssets[id]),
    additional: packet(indices['additional-environment'].tiles[id]), roadside: packet(indices.roadside.tiles[id]),
    environmentGround: packet(indices['environment-ground'].tiles[id]?.levels[level]),
    facilities: packet(indices['environment-facilities'].tiles[id]), roadMaterials: packet(indices['road-materials'].tiles[id]?.levels[level]), streetCorners: packet(indices['street-corners'].tiles[id]), streetCornerGround: packet(indices['street-corner-ground'].tiles[id]?.levels[level]), roadCurve: packet(indices['road-curve'].tiles[id]?.levels[level]), roadDash: packet(indices['road-dash'].tiles[id]?.levels[level]), propertyTerrain: packet(indices['property-terrain'].tiles[id]?.levels[level]),
  };
}
const entry = path.join(out, 'entry.ts'), bundle = path.join(out, 'assembly.mjs');
fs.writeFileSync(entry, `export { tileAssemblySteps } from ${JSON.stringify(path.join(site, 'src/lib/town/tile-assembly.ts'))}; export { validFoundationWallPacket } from ${JSON.stringify(path.join(site, 'src/lib/town/foundation-wall-finish.ts'))}; export { excludeGrassPolygons, grassAllowed, grassSite } from ${JSON.stringify(path.join(site, 'src/lib/town/grass.ts'))};`);
await build({ entryPoints: [entry], outfile: bundle, bundle: true, platform: 'node', format: 'esm', logLevel: 'silent', plugins: [{ name: 'same-three', setup(b) { b.onResolve({ filter: /^three$/ }, () => ({ path: fileURLToPath(import.meta.resolve('three')), external: true })); } }] });
const { tileAssemblySteps, validFoundationWallPacket, excludeGrassPolygons, grassAllowed, grassSite } = await import(pathToFileURL(bundle).href);
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
loader.register(() => ({ name: 'NATIVE_TEXTURE_PLACEHOLDER', loadTexture() { return Promise.resolve(new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1)); } }));



const catalog=data('indian-ranch-grounds'),report={sourceManifestSha256:release.manifestSha256,catalogSha256:hash(fs.readFileSync(path.join(site,'data/derived/town/indian-ranch-grounds.json'))),assemblySha256:hash(fs.readFileSync(path.join(site,'src/lib/town/tile-assembly.ts'))),foundationIndexSha256:hash(fs.readFileSync(path.join(site,'data/derived/town/foundation-wall-index.json'))),policy:'Execute the live stage order with hashed optional packets. Compare immediately before/after the ground stage; after all later stages compare its retained inputs with an otherwise identical full-sequence control, and require the emitted venue ground/seating to remain attached and unchanged.',rows:[],failures:[]};
const digest=g=>hash(Buffer.concat([Buffer.from(JSON.stringify({groups:g.groups,drawRange:g.drawRange,attributes:Object.entries(g.attributes).map(([name,a])=>({name,itemSize:a.itemSize,normalized:a.normalized,count:a.count}))})),...Object.values(g.attributes).map(a=>Buffer.from(a.array.buffer,a.array.byteOffset,a.array.byteLength)),...(g.index?[Buffer.from(g.index.array.buffer,g.index.array.byteOffset,g.index.array.byteLength)]:[])]));
const snapshot=group=>{const result=[];group.traverse(o=>{if(o instanceof THREE.Mesh)result.push({o,g:o.geometry,m:o.material,hash:digest(o.geometry),matrix:o.matrix.toArray(),parent:o.parent});});return result;};
const unchanged=r=>r.o.geometry===r.g&&r.o.material===r.m&&digest(r.g)===r.hash&&JSON.stringify(r.o.matrix.toArray())===JSON.stringify(r.matrix)&&r.o.parent===r.parent;
const attached=(o,root)=>{for(let p=o;p;p=p.parent)if(p===root)return true;return false;};
const materialStamp=m=>({name:m.name,type:m.type,color:m.color?.getHexString(),roughness:m.roughness,metalness:m.metalness,side:m.side,transparent:m.transparent,opacity:m.opacity,vertexColors:m.vertexColors,program:m.customProgramCacheKey()});
const finalStamp=(r,root)=>({name:r.o.name,attached:attached(r.o,root),parent:r.o.parent?.name,geometry:digest(r.o.geometry),matrix:r.o.matrix.toArray(),materials:(Array.isArray(r.o.material)?r.o.material:[r.o.material]).map(materialStamp)});
function maskAudit(group,tile,failures){
 const asset=manifest.surfaces.masks[tile.id],bytes=fs.readFileSync(path.join(source,asset.url));
 if(hash(bytes)!==asset.sha256||bytes.length!==asset.bytes)throw Error('Source class-mask SHA mismatch');
 const decoded=execFileSync(process.env.TOWN_PYTHON||'/Library/Developer/CommandLineTools/usr/bin/python3',['-c','from PIL import Image; import sys; im=Image.open(sys.argv[1]).convert("RGBA"); assert im.size==(272,272); sys.stdout.buffer.write(im.tobytes())',path.join(source,asset.url)],{maxBuffer:1000000});
 const mask={data:new Uint8Array(decoded),width:272,height:272,bounds:asset.bounds,core:[500,500,750,750]};
 const before=hash(mask.data),finished=excludeGrassPolygons(mask,group.userData.environmentGrassExclusions??[]);
 const inside=(p,t)=>{const side=t.map((a,i)=>{const b=t[(i+1)%3];return(b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]);});return side.every(v=>v>=-1e-7)||side.every(v=>v<=1e-7);};
 const features=[];
 for(const f of catalog.features){
  const ts=Array.from({length:f.indices.length/3},(_,i)=>f.indices.slice(i*3,i*3+3).map(k=>f.points[k]));let seeds=0,eligibleBefore=0,eligibleAfter=0;
  for(let x=1100;x<1220;x++)for(let z=1530;z<1640;z++){const p=grassSite(x,z);if(!ts.some(t=>inside([p.x,-p.z],t)))continue;seeds++;eligibleBefore+=+grassAllowed(mask,p.x,p.z);eligibleAfter+=+grassAllowed(finished,p.x,p.z);}
  if(seeds<250||eligibleAfter)failures.push('Grass coverage failed for '+f.id);
  features.push({id:f.id,seeds,eligibleBefore,eligibleAfter});
 }
 if(before!==hash(mask.data))failures.push('Source grass mask mutated');
 const lawn={point:[530,739],eligibleBefore:grassAllowed(mask,530,739),eligibleAfter:grassAllowed(finished,530,739)};
 if(lawn.eligibleBefore!==lawn.eligibleAfter)failures.push('Downhill retained lawn class changed');
 return{sourceSha256:asset.sha256,decodedSha256:before,exclusionTriangles:(group.userData.environmentGrassExclusions??[]).length,features,downhillLawn:lawn};
}
for(const tile of manifest.tiles.filter(t=>catalog.tiles[t.id]))for(const lod of tile.lods){
 const raw=fs.readFileSync(path.join(source,lod.url));if(hash(raw)!==lod.sha256)throw Error('Source SHA');
 const group=(await loader.parseAsync(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength),'')).scene;
 const steps=tileAssemblySteps(group,tile,lod.level,details(tile.id,lod.level)),stageNames=steps.map(s=>s.name),stageIndex=stageNames.indexOf('indianRanchGrounds');
 if(stageIndex<0||stageNames.filter(n=>n==='indianRanchGrounds').length!==1)throw Error('Missing or repeated live ground stage');
 const failures=[];let original=[],owned=[],result,ms=0;
 for(const [i,step]of steps.entries()){
  if(i===stageIndex)original=snapshot(group);
  const start=performance.now(),value=step.apply();
  if(i===stageIndex){
   ms=performance.now()-start;result=value;
   if(result?.status!=='applied'||!result.triangles)failures.push('No supported venue ground/seating');
   if(original.some(r=>!unchanged(r)))failures.push('Ground stage mutated a retained input');
   const additions=group.children.filter(o=>['Indian Ranch venue ground','Indian Ranch exterior seating'].includes(o.name));
   if(additions.length!==2)failures.push('Ground stage did not attach both owned groups');else owned=additions.flatMap(snapshot);
  }
 }
 if(owned.some(r=>!unchanged(r)||!attached(r.o,group)))failures.push('A later live stage changed or detached the venue ground/seating');
 // Later building/environment stages may legitimately change their own inputs.
 // A control executes every one of those stages, omitting only this addition.
 const control=(await loader.parseAsync(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength),'')).scene;
 let controlOriginal=[];
 for(const step of tileAssemblySteps(control,tile,lod.level,details(tile.id,lod.level))){if(step.name==='indianRanchGrounds')controlOriginal=snapshot(control);else step.apply();}
 if(original.length!==controlOriginal.length)failures.push('Control source ownership mismatch');
 const finalActual=original.map(r=>finalStamp(r,group)),finalControl=controlOriginal.map(r=>finalStamp(r,control));
 if(JSON.stringify(finalActual)!==JSON.stringify(finalControl))failures.push('Final retained inputs differ from the full-sequence control');
 const finalBeforeRepeat=snapshot(group);
 if(steps[stageIndex].apply()!==result||finalBeforeRepeat.some(r=>!unchanged(r))||snapshot(group).length!==finalBeforeRepeat.length)failures.push('Repeated live stage changed final resources');
 const foundationReport=group.userData.assemblyReports?.foundationWalls;
 if(indices['foundation-wall'].tiles[tile.id]&&(!foundationReport||foundationReport.rejected))failures.push('Hashed foundation-wall stage did not apply');
 group.updateMatrixWorld(true);const inverse=group.matrixWorld.clone().invert(),terrain=[],siteGrounds=[];let minNormal=1,maxNormal=1,minNormalDot=1,degenerate=0;
 group.traverse(o=>{if(!(o instanceof THREE.Mesh))return;const isTerrain=/^terrain(?:\b|_)/i.test(o.name),isNew=['Indian Ranch venue ground','Indian Ranch exterior seating'].includes(o.parent?.name);if(!isTerrain&&!isNew)return;const p=o.geometry.getAttribute('position'),n=o.geometry.getAttribute('normal'),ix=o.geometry.index,m=inverse.clone().multiply(o.matrixWorld),faces=[];
  for(let i=0;i<(ix?.count??p.count);i+=3){const ids=[0,1,2].map(k=>ix?ix.getX(i+k):i+k),v=ids.map(k=>new THREE.Vector3().fromBufferAttribute(p,k));if(isNew){const cross=v[1].clone().sub(v[0]).cross(v[2].clone().sub(v[0]));if(cross.length()<1e-9)degenerate++;else{cross.normalize();for(const id of ids){const normal=new THREE.Vector3().fromBufferAttribute(n,id);minNormal=Math.min(minNormal,normal.length());maxNormal=Math.max(maxNormal,normal.length());minNormalDot=Math.min(minNormalDot,cross.dot(normal));}}}faces.push(v.map(q=>{q.applyMatrix4(m);return[q.x+tile.origin[0],-q.z-tile.origin[2],q.y+tile.origin[1]];}));}
  if(isTerrain)terrain.push(...faces);else{if(!o.userData.townCrafted||!o.material.userData.townCrafted)failures.push('Missing owned resource flags');siteGrounds.push({role:o.material.userData.surfaceRole,id:o.material.userData.indianRanchGround?.id,seating:o.material.userData.indianRanchBench===true,triangles:faces});}
 });
 if(minNormal<.99999||maxNormal>1.00001||minNormalDot<0||degenerate)failures.push('Invalid geometry');
 const cover=maskAudit(group,tile,failures);
 if(result.seating.skipped.length||result.seating.unsupportedFeet.length||result.seating.ids.length!==catalog.benches.length||result.seating.feet.length!==catalog.benches.length*2)failures.push('Incomplete supported exterior seating');
 for(const foot of result.seating.feet)if(foot.bottom>Math.min(...foot.cornerHeights)+1e-6||foot.top<Math.max(...foot.cornerHeights))failures.push('Invalid final foot support');
 fs.writeFileSync(path.join(out,`${tile.id}-${lod.level}.domains.json.gz`),gzipSync(JSON.stringify({tileId:tile.id,level:lod.level,sourceSha256:lod.sha256,terrain,siteGrounds})));
 const row={cover,tileId:tile.id,level:lod.level,sourceSha256:lod.sha256,stageIndex,stageNames,laterStages:stageNames.slice(stageIndex+1),foundationPacket:indices['foundation-wall'].tiles[tile.id],foundationReport,ms,...result,protectedMeshes:original.length,protectedHash:hash(JSON.stringify(original.map(r=>r.hash))),finalRetainedHash:hash(JSON.stringify(finalActual)),controlRetainedHash:hash(JSON.stringify(finalControl)),ownedFinalMeshes:owned.length,minNormal,maxNormal,minNormalDot,degenerate,failures};report.rows.push(row);report.failures.push(...failures);console.log(JSON.stringify({level:lod.level,status:failures.length?'FAIL':'PASS',triangles:result.triangles,benches:result.seating.ids.length,benchTriangles:result.seating.triangles,cover,ms,failures}));
 const gs=new Set(),ms0=new Set(),ts=new Set();for(const scene of[group,control])scene.traverse(o=>{if(o instanceof THREE.Mesh){gs.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material]){ms0.add(m);for(const t of Object.values(m))if(t instanceof THREE.Texture)ts.add(t);}}});gs.forEach(g=>g.dispose());ms0.forEach(m=>m.dispose());ts.forEach(t=>t.dispose());
}
report.status=report.failures.length?'FAIL':'PASS';fs.writeFileSync(path.join(out,'native-audit.json'),JSON.stringify(report,null,2));console.log(report.status);if(report.failures.length)process.exitCode=1;
