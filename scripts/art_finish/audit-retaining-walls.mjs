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
const out = path.resolve(process.env.TOWN_ASSEMBLY_OUT || '/private/tmp/webster-finished-game/art/retaining-walls');
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

const report={scope:'Actual source GLTFs with current ordered runtime predecessors and all three LODs; source sidewalk property-edge constraint and terrain-supported retaining walls',rows:[],failures:[]};
for(const tile of manifest.tiles.filter(t=>t.id==='-13_-5'))for(const lod of tile.lods){
 const raw=fs.readFileSync(path.join(source,lod.url));if(hash(raw)!==lod.sha256)throw Error('sourceSHA');
 const group=(await loader.parseAsync(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength),'')).scene;
 const supplied=details(tile.id,lod.level),steps=tileAssemblySteps(group,tile,lod.level,supplied);
 for(const step of steps){step.apply();if(step.name==='craftedFrontages')break;}
 const result=group.userData.craftedFrontages;const failures=[];let minNormalDot=1,degenerate=0,wallTriangles=0;
 const geometries=[];group.traverse(o=>{if(!(o instanceof THREE.Mesh)||!o.userData.townCrafted||!o.name.startsWith('Crafted building frontage'))return;const p=o.geometry.getAttribute('position'),n=o.geometry.getAttribute('normal'),ix=o.geometry.index;const ranges=result.retainingWalls.flatMap(w=>w.geometryRanges??[]).filter(r=>o.material.name===`Crafted frontage | ${r.key.replace(':',' | ')}`);for(const range of ranges)for(let i=range.start;i<range.start+range.count;i+=3){const ids=[0,1,2].map(k=>ix?ix.getX(i+k):i+k),v=ids.map(k=>new THREE.Vector3().fromBufferAttribute(p,k)),cross=v[1].clone().sub(v[0]).cross(v[2].clone().sub(v[0]));if(cross.length()<1e-9){degenerate++;continue;}cross.normalize();for(const id of ids)minNormalDot=Math.min(minNormalDot,cross.dot(new THREE.Vector3().fromBufferAttribute(n,id)));}geometries.push({name:o.name,material:o.material.name,sourceIds:o.userData.sourceIds,position:Array.from(p.array)});});
 for(const wall of result.retainingWalls){if(wall.status==='placed'){if(wall.sidewalkV-wall.wallV-.18<.119999)failures.push('Sidewalk obstruction');wallTriangles+=wall.segments.length*24;if(!wall.segments.flat().every(Number.isFinite))failures.push('Nonfinite wall');}}
 if(result.retainingWalls.length!==6||degenerate||minNormalDot<.99)failures.push('Geometry invalid');
 const row={tileId:tile.id,level:lod.level,sourceSha256:lod.sha256,retainingWalls:result.retainingWalls,wallTriangles,minNormalDot,degenerate,failures};report.rows.push(row);report.failures.push(...failures);fs.writeFileSync(path.join(out,`geometry-${lod.level}.json.gz`),gzipSync(JSON.stringify({tileId:tile.id,level:lod.level,origin:tile.origin,geometry:geometries})));console.log(JSON.stringify(row));
 const gs=new Set(),ms=new Set(),ts=new Set();group.traverse(o=>{if(o instanceof THREE.Mesh){gs.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material]){ms.add(m);for(const v of Object.values(m))if(v instanceof THREE.Texture)ts.add(v);}}});gs.forEach(g=>g.dispose());ms.forEach(m=>m.dispose());ts.forEach(t=>t.dispose());}
report.status=report.failures.length?'FAIL':'PASS';report.runtimeSha256=hash(fs.readFileSync(path.join(site,'src/lib/town/crafted-frontages.ts')));fs.writeFileSync(path.join(out,'native-audit.json'),JSON.stringify(report,null,2));console.log(report.status);if(report.failures.length)process.exitCode=1;
