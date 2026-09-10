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
const out = path.resolve(process.env.TOWN_ASSEMBLY_OUT || '/private/tmp/webster-main-furniture-audit/native');
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
fs.writeFileSync(entry, `export { tileAssemblySteps } from ${JSON.stringify(path.join(site, 'src/lib/town/tile-assembly.ts'))}; export { validFoundationWallPacket } from ${JSON.stringify(path.join(site, 'src/lib/town/foundation-wall-finish.ts'))};`);
await build({ entryPoints: [entry], outfile: bundle, bundle: true, platform: 'node', format: 'esm', logLevel: 'silent', plugins: [{ name: 'same-three', setup(b) { b.onResolve({ filter: /^three$/ }, () => ({ path: fileURLToPath(import.meta.resolve('three')), external: true })); } }] });
const { tileAssemblySteps, validFoundationWallPacket } = await import(pathToFileURL(bundle).href);
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
loader.register(() => ({ name: 'NATIVE_TEXTURE_PLACEHOLDER', loadTexture() { return Promise.resolve(new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1)); } }));
const catalog=data('main-street-furniture'),tile=manifest.tiles.find(t=>t.id===catalog.tileId),report={sourceManifestSha256:release.manifestSha256,catalogSha256:hash(fs.readFileSync(path.join(site,'data/derived/town/main-street-furniture.json'))),assemblySha256:hash(fs.readFileSync(path.join(site,'src/lib/town/tile-assembly.ts'))),rows:[],failures:[]};
const digest=g=>hash(Buffer.concat([Buffer.from(JSON.stringify({groups:g.groups,drawRange:g.drawRange,attributes:Object.entries(g.attributes).map(([name,a])=>({name,itemSize:a.itemSize,normalized:a.normalized,count:a.count}))})),...Object.values(g.attributes).map(a=>Buffer.from(a.array.buffer,a.array.byteOffset,a.array.byteLength)),...(g.index?[Buffer.from(g.index.array.buffer,g.index.array.byteOffset,g.index.array.byteLength)]:[])]));
const snapshot=group=>{const result=[];group.traverse(o=>{if(o instanceof THREE.Mesh)result.push({o,g:o.geometry,m:o.material,hash:digest(o.geometry),matrix:o.matrix.toArray(),parent:o.parent});});return result;};
const unchanged=r=>r.o.geometry===r.g&&r.o.material===r.m&&digest(r.g)===r.hash&&JSON.stringify(r.o.matrix.toArray())===JSON.stringify(r.matrix)&&r.o.parent===r.parent;
for(const lod of tile.lods){
 const raw=fs.readFileSync(path.join(source,lod.url));if(hash(raw)!==lod.sha256)throw Error('Native source changed');
 const group=(await loader.parseAsync(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength),'')).scene,steps=tileAssemblySteps(group,tile,lod.level,details(tile.id,lod.level));
 let result,original,owned;const failures=[];const outputs={};
 for(const step of steps){
  if(step.name==='mainStreetFurniture')original=snapshot(group);
  outputs[step.name]=step.apply();
  if(step.name==='mainStreetFurniture'){
   result=outputs[step.name];if(!original.every(unchanged))failures.push('Furniture stage mutated retained source');
   const addition=group.getObjectByName('Main Street photo furniture');owned=addition?snapshot(addition):[];
  }
 }
 if(result?.status!=='applied'||result.ids.length!==8||result.omitted.length)failures.push('Some registered furniture missing');
 if(!owned?.length||!owned.every(unchanged))failures.push('Later stage changed owned furniture');
 if(result?.triangles>=10000||result?.meshes>4)failures.push('Budget exceeded');
 if(steps.find(s=>s.name==='mainStreetFurniture')?.apply()!==result)failures.push('Repeated stage changed identity');
 const inverse=group.matrixWorld.clone().invert(),exports=[];let minNormal=Infinity,maxNormal=0,degenerate=0,minFaceNormalDot=1;
 for(const r of owned??[]){const p=r.g.getAttribute('position'),n=r.g.getAttribute('normal'),ix=r.g.index,faces=[];
  for(let i=0;i<(ix?.count??p.count);i+=3){const ids=[0,1,2].map(k=>ix?.getX(i+k)??i+k),v=ids.map(k=>new THREE.Vector3().fromBufferAttribute(p,k));const face=v[1].clone().sub(v[0]).cross(v[2].clone().sub(v[0]));if(face.lengthSq()<1e-14)degenerate++;else{face.normalize();for(const k of ids){const normal=new THREE.Vector3().fromBufferAttribute(n,k);minNormal=Math.min(minNormal,normal.length());maxNormal=Math.max(maxNormal,normal.length());minFaceNormalDot=Math.min(minFaceNormalDot,face.dot(normal));}}faces.push(v.map(q=>[q.x+tile.origin[0],-q.z-tile.origin[2],q.y+tile.origin[1]]));}
  const ms=Array.isArray(r.m)?r.m:[r.m];if(!r.o.userData.townCrafted||ms.some(m=>!m.userData.townCrafted||m.map||m.transparent))failures.push('Unowned or textured material');exports.push({name:r.o.name,ids:r.o.userData.sourceIds,triangles:faces});
 }
 if(minNormal<.9999||maxNormal>1.0001||degenerate||minFaceNormalDot<-.1)failures.push('Invalid geometry or normals');
 const row={level:lod.level,sourceSha256:lod.sha256,sourceProtectedMeshes:original?.length??0,sourceGeometryHash:hash(JSON.stringify(original?.map(r=>r.hash))),stages:steps.map(s=>s.name),result,minNormal,maxNormal,minFaceNormalDot,degenerate,mainStreetCrossing:outputs.mainStreetCrossing,mainStreetSurfaces:outputs.mainStreetSurfaces,grassExclusionPresent:group.userData.environmentGrassExclusions?.some(r=>JSON.stringify(r)===JSON.stringify(catalog.hedge.ring)),failures};
 if(!row.grassExclusionPresent)failures.push('Missing hedge grass exclusion');report.rows.push(row);report.failures.push(...failures);
 fs.writeFileSync(path.join(out,`-12_-4-${lod.level}.furniture.json.gz`),gzipSync(JSON.stringify(exports)));console.log(JSON.stringify(row));
}
report.status=report.failures.length?'FAIL':'PASS';fs.writeFileSync(path.join(out,'native-audit.json'),JSON.stringify(report,null,2));console.log(report.status);if(report.failures.length)process.exitCode=1;
