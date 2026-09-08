/** Geometry/lifecycle evidence using the SAME ordered steps as the live world.
 * Native texture placeholders prove topology, never actual texture appearance,
 * browser frame rates, shader output or physical-device memory. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { build } from 'esbuild';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

const site = '/private/tmp/webster-release';
const out = path.resolve(process.env.TOWN_ASSEMBLY_OUT || '/private/tmp/webster-finished-game/main-frontage/native');
fs.mkdirSync(out, { recursive: true });
const read = p => JSON.parse(fs.readFileSync(p)), hash = b => createHash('sha256').update(b).digest('hex');
const data = name => read(path.join(site, 'data/derived/town', name + '.json'));
const release = data('release'), source = path.join(site, 'public/town-assets', release.directory);
const manifestBytes = fs.readFileSync(path.join(source, 'manifest.json'));
if (hash(manifestBytes) !== release.manifestSha256) throw new Error('Pinned source manifest changed');
const manifest = JSON.parse(manifestBytes);
const indices = Object.fromEntries(['residential-evidence', 'evidence-roofs', 'road-finish', 'terrain-finish', 'paved-surfaces', 'additional-environment', 'roadside', 'environment-ground', 'environment-facilities', 'road-materials', 'street-corners', 'street-corner-ground', 'road-curve', 'road-dash', 'property-terrain'].map(name => [name, data(name + '-index')]));
const packet = asset => {
  if (!asset) return;
  const bytes = fs.readFileSync(path.join(site, 'public', asset.url.slice(1)));
  if (bytes.length !== asset.bytes || asset.sha256 && hash(bytes) !== asset.sha256) throw new Error('Packet source mismatch: ' + asset.url);
  return JSON.parse(bytes);
};
function details(id, level) {
  const home = packet(indices['residential-evidence'].tiles[id]), roofs = packet(indices['evidence-roofs'].tiles[id]);
  return { evidence: { buildings: home?.buildings ?? [], roofs: roofs ?? [], failures: 0 },
    road: packet(indices['road-finish'].tiles[id])?.rows,
    terrain: packet(indices['terrain-finish'].tiles[id]?.levels[level]),
    parking: packet(indices['paved-surfaces'].lotAssets[id]),
    additional: packet(indices['additional-environment'].tiles[id]), roadside: packet(indices.roadside.tiles[id]),
    environmentGround: packet(indices['environment-ground'].tiles[id]?.levels[level]),
    facilities: packet(indices['environment-facilities'].tiles[id]), roadMaterials: packet(indices['road-materials'].tiles[id]?.levels[level]), streetCorners: packet(indices['street-corners'].tiles[id]), streetCornerGround: packet(indices['street-corner-ground'].tiles[id]?.levels[level]), roadCurve: packet(indices['road-curve'].tiles[id]?.levels[level]), roadDash: packet(indices['road-dash'].tiles[id]?.levels[level]), propertyTerrain: packet(indices['property-terrain'].tiles[id]?.levels[level]),
  };
}
const entry = path.join(out, 'entry.ts'), bundle = path.join(out, 'assembly.mjs');
fs.writeFileSync(entry, `export { tileAssemblySteps } from ${JSON.stringify(path.join(site, 'src/lib/town/tile-assembly.ts'))}; export { applyCommercialFrontageGrounds } from ${JSON.stringify(path.join(site, 'src/lib/town/commercial-frontage-grounds.ts'))};`);
await build({ entryPoints: [entry], outfile: bundle, bundle: true, platform: 'node', format: 'esm', logLevel: 'silent', plugins: [{ name: 'same-three', setup(b) { b.onResolve({ filter: /^three$/ }, () => ({ path: fileURLToPath(import.meta.resolve('three')), external: true })); } }] });
const { tileAssemblySteps, applyCommercialFrontageGrounds } = await import(pathToFileURL(bundle).href);
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
loader.register(() => ({ name: 'NATIVE_TEXTURE_PLACEHOLDER', loadTexture() { return Promise.resolve(new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1)); } }));



const catalog=data('commercial-frontage-grounds'),report={sourceManifestSha256:release.manifestSha256,catalogSha256:hash(fs.readFileSync(path.join(site,'data/derived/town/commercial-frontage-grounds.json'))),rows:[],failures:[]};
const digest=g=>hash(Buffer.concat([...Object.values(g.attributes).map(a=>Buffer.from(a.array.buffer,a.array.byteOffset,a.array.byteLength)),...(g.index?[Buffer.from(g.index.array.buffer,g.index.array.byteOffset,g.index.array.byteLength)]:[])]));
for(const tile of manifest.tiles.filter(t=>catalog.tiles[t.id]))for(const lod of tile.lods){
 const raw=fs.readFileSync(path.join(source,lod.url));if(hash(raw)!==lod.sha256)throw Error('Source SHA');
 const group=(await loader.parseAsync(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength),'')).scene;
 for(const step of tileAssemblySteps(group,tile,lod.level,details(tile.id,lod.level)))if(step.name!=='commercialFrontageGrounds')step.apply();
 const original=[];group.traverse(o=>{if(o instanceof THREE.Mesh)original.push({o,g:o.geometry,m:o.material,hash:digest(o.geometry),matrix:o.matrix.toArray()});});
 const start=performance.now(),result=applyCommercialFrontageGrounds(group,tile.id,tile.origin,lod.level,lod.sha256),ms=performance.now()-start,failures=[];
 if(result?.status!=='applied'||!result.triangles)failures.push('No supported forecourt');for(const r of original)if(r.o.geometry!==r.g||r.o.material!==r.m||digest(r.g)!==r.hash||JSON.stringify(r.o.matrix.toArray())!==JSON.stringify(r.matrix))failures.push('Retained source changed');
 if(applyCommercialFrontageGrounds(group,tile.id,tile.origin,lod.level,lod.sha256)!==result)failures.push('Repeated assembly');
 group.updateMatrixWorld(true);const inverse=group.matrixWorld.clone().invert(),terrain=[],siteGrounds=[];let minNormal=1,maxNormal=1,minNormalDot=1,degenerate=0;
 group.traverse(o=>{if(!(o instanceof THREE.Mesh))return;const isTerrain=/^terrain(?:\b|_)/i.test(o.name),isNew=o.parent?.name==='Main Street commercial forecourt';if(!isTerrain&&!isNew)return;const p=o.geometry.getAttribute('position'),n=o.geometry.getAttribute('normal'),ix=o.geometry.index,m=inverse.clone().multiply(o.matrixWorld),faces=[];
  for(let i=0;i<(ix?.count??p.count);i+=3){const ids=[0,1,2].map(k=>ix?ix.getX(i+k):i+k),v=ids.map(k=>new THREE.Vector3().fromBufferAttribute(p,k));if(isNew){const cross=v[1].clone().sub(v[0]).cross(v[2].clone().sub(v[0]));if(cross.length()<1e-9)degenerate++;else{cross.normalize();for(const id of ids){const normal=new THREE.Vector3().fromBufferAttribute(n,id);minNormal=Math.min(minNormal,normal.length());maxNormal=Math.max(maxNormal,normal.length());minNormalDot=Math.min(minNormalDot,cross.dot(normal));}}}faces.push(v.map(q=>{q.applyMatrix4(m);return[q.x+tile.origin[0],-q.z-tile.origin[2],q.y+tile.origin[1]];}));}
  if(isTerrain)terrain.push(...faces);else{if(!o.userData.townCrafted||!o.material.userData.townCrafted)failures.push('Missing owned resource flags');siteGrounds.push({role:o.material.userData.surfaceRole,triangles:faces});}
 });
 if(minNormal<.99999||maxNormal>1.00001||minNormalDot<0||degenerate)failures.push('Invalid geometry');
 fs.writeFileSync(path.join(out,`${tile.id}-${lod.level}.domains.json.gz`),gzipSync(JSON.stringify({tileId:tile.id,level:lod.level,sourceSha256:lod.sha256,terrain,siteGrounds})));
 const row={tileId:tile.id,level:lod.level,sourceSha256:lod.sha256,ms,...result,protectedMeshes:original.length,protectedHash:hash(JSON.stringify(original.map(r=>r.hash))),minNormal,maxNormal,minNormalDot,degenerate,failures};report.rows.push(row);report.failures.push(...failures);console.log(JSON.stringify(row));
 const gs=new Set(),ms0=new Set(),ts=new Set();group.traverse(o=>{if(o instanceof THREE.Mesh){gs.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material]){ms0.add(m);for(const t of Object.values(m))if(t instanceof THREE.Texture)ts.add(t);}}});gs.forEach(g=>g.dispose());ms0.forEach(m=>m.dispose());ts.forEach(t=>t.dispose());
}
report.status=report.failures.length?'FAIL':'PASS';fs.writeFileSync(path.join(out,'native-audit.json'),JSON.stringify(report,null,2));console.log(report.status);if(report.failures.length)process.exitCode=1;
