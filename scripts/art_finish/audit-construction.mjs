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

const site = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const out = path.resolve(process.env.TOWN_ASSEMBLY_OUT || '/private/tmp/webster-finished-game/art/construction');
fs.mkdirSync(out, { recursive: true });
const read = p => JSON.parse(fs.readFileSync(p)), hash = b => createHash('sha256').update(b).digest('hex');
const data = name => read(path.join(site, 'data/derived/town', name + '.json'));
const release = data('release'), source = path.join(site, 'public/town-assets', release.directory);
const manifestBytes = fs.readFileSync(path.join(source, 'manifest.json'));
if (hash(manifestBytes) !== release.manifestSha256) throw new Error('Pinned source manifest changed');
const manifest = JSON.parse(manifestBytes);
const indices = Object.fromEntries(['residential-evidence', 'evidence-roofs', 'road-finish', 'terrain-finish', 'paved-surfaces', 'additional-environment', 'roadside', 'environment-ground', 'environment-facilities', 'road-materials', 'street-corners', 'street-corner-ground', 'road-curve'].map(name => [name, data(name + '-index')]));
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
    facilities: packet(indices['environment-facilities'].tiles[id]), roadMaterials: packet(indices['road-materials'].tiles[id]?.levels[level]), streetCorners: packet(indices['street-corners'].tiles[id]), streetCornerGround: packet(indices['street-corner-ground'].tiles[id]?.levels[level]), roadCurve: packet(indices['road-curve'].tiles[id]?.levels[level]),
  };
}
const entry = path.join(out, 'entry.ts'), bundle = path.join(out, 'assembly.mjs');
fs.writeFileSync(entry, `export { tileAssemblySteps } from ${JSON.stringify(path.join(site, 'src/lib/town/tile-assembly.ts'))}; export { layoutParking } from ${JSON.stringify(path.join(site, 'src/lib/town/parking-finish.ts'))};`);
await build({ entryPoints: [entry], outfile: bundle, bundle: true, platform: 'node', format: 'esm', logLevel: 'silent', plugins: [{ name: 'same-three', setup(b) { b.onResolve({ filter: /^three$/ }, () => ({ path: fileURLToPath(import.meta.resolve('three')), external: true })); } }] });
const { tileAssemblySteps, layoutParking } = await import(pathToFileURL(bundle).href);
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
loader.register(() => ({ name: 'NATIVE_TEXTURE_PLACEHOLDER', loadTexture() { return Promise.resolve(new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1)); } }));

const report={sourceManifestSha256:release.manifestSha256,runtimeSha256:hash(fs.readFileSync(path.join(site,'src/lib/town/crafted-frontages.ts'))),scope:'Only the new LOD0 seven-eave/four-soffit construction kit, after actual source predecessors. Exact source-ID ranges, outward unit normals and bounded source envelope; detailed triangle export for guided-car clearance.',rows:[],failures:[]},exports=[];
for(const tile of manifest.tiles.filter(t=>t.id==='-13_-5'))for(const lod of tile.lods){
 const raw=fs.readFileSync(path.join(source,lod.url));if(hash(raw)!==lod.sha256)throw Error('sourceSHA');const group=(await loader.parseAsync(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength),'')).scene;
 for(const step of tileAssemblySteps(group,tile,lod.level,details(tile.id,lod.level))){step.apply();if(step.name==='craftedFrontages')break;}
 const result=group.userData.craftedFrontages,failures=[],geometry=[];let minNormalDot=1,degenerate=0,triangles=0,bytes=0;const meshes=[];group.traverse(o=>{if(o instanceof THREE.Mesh&&o.userData.townCrafted&&o.name.startsWith('Crafted building frontage'))meshes.push(o);});
 for(const row of result.constructionDetails)for(const range of row.geometryRanges){const o=meshes.find(m=>m.material.name===`Crafted frontage | ${range.key.replace(':',' | ')}`);if(!o){failures.push('Range material missing');continue;}const p=o.geometry.getAttribute('position'),n=o.geometry.getAttribute('normal'),positions=[],normals=[];for(let i=range.start;i<range.start+range.count;i+=3){const a=new THREE.Vector3().fromBufferAttribute(p,i),b=new THREE.Vector3().fromBufferAttribute(p,i+1),c=new THREE.Vector3().fromBufferAttribute(p,i+2),cross=b.sub(a).cross(c.sub(a));if(cross.length()<1e-9)degenerate++;cross.normalize();for(let k=0;k<3;k++){const normal=new THREE.Vector3().fromBufferAttribute(n,i+k);minNormalDot=Math.min(minNormalDot,cross.dot(normal));positions.push(p.getX(i+k),p.getY(i+k),p.getZ(i+k));normals.push(normal.x,normal.y,normal.z);}triangles++;}bytes+=(positions.length+normals.length)*4;geometry.push({name:o.name,sourceIds:[row.structId],position:positions,normal:normals});}
 if(degenerate||minNormalDot<.9999)failures.push('Invalid construction geometry');if(result.constructionDetails.length!==(lod.level===0?7:0))failures.push('LOD detail scope changed');const row={tileId:tile.id,level:lod.level,sourceSha256:lod.sha256,details:result.constructionDetails,triangles,geometryBytes:bytes,degenerate,minNormalDot,failures};report.rows.push(row);report.failures.push(...failures);exports.push({tileId:tile.id,level:lod.level,origin:tile.origin,geometry});console.log(tile.id,lod.level,triangles,failures);
 const gs=new Set(),ms=new Set(),ts=new Set();group.traverse(o=>{if(o instanceof THREE.Mesh){gs.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material]){ms.add(m);for(const v of Object.values(m))if(v instanceof THREE.Texture)ts.add(v);}}});gs.forEach(g=>g.dispose());ms.forEach(m=>m.dispose());ts.forEach(t=>t.dispose());
}
report.status=report.failures.length?'FAIL':'PASS';fs.writeFileSync(path.join(out,'native-audit.json'),JSON.stringify(report,null,2));fs.writeFileSync(path.join(out,'geometry.json.gz'),gzipSync(JSON.stringify(exports)));console.log(report.status);if(report.failures.length)process.exitCode=1;
