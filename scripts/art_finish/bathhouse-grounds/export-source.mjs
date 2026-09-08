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

const site = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const out = path.resolve(process.env.TOWN_ASSEMBLY_OUT || '/private/tmp/webster-finished-game/art/bathhouse-grounds');
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
fs.writeFileSync(entry, `export { tileAssemblySteps } from ${JSON.stringify(path.join(site, 'src/lib/town/tile-assembly.ts'))}; export { terrainGeometryStamp } from ${JSON.stringify(path.join(site, 'src/lib/town/terrain-finish.ts'))};`);
await build({ entryPoints: [entry], outfile: bundle, bundle: true, platform: 'node', format: 'esm', logLevel: 'silent', plugins: [{ name: 'same-three', setup(b) { b.onResolve({ filter: /^three$/ }, () => ({ path: fileURLToPath(import.meta.resolve('three')), external: true })); } }] });
const { tileAssemblySteps, terrainGeometryStamp } = await import(pathToFileURL(bundle).href);
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
loader.register(() => ({ name: 'NATIVE_TEXTURE_PLACEHOLDER', loadTexture() { return Promise.resolve(new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1)); } }));


const tiles=new Set(['-4_-2','-3_-2']);
for(const tile of manifest.tiles.filter(t=>tiles.has(t.id)))for(const lod of tile.lods){
 const raw=fs.readFileSync(path.join(source,lod.url));if(hash(raw)!==lod.sha256)throw Error('Source SHA');
 const group=(await loader.parseAsync(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength),'')).scene;
 for(const step of tileAssemblySteps(group,tile,lod.level,details(tile.id,lod.level))){if(step.name!=='bathhouseGrounds')step.apply();}
 group.updateMatrixWorld(true);const inv=group.matrixWorld.clone().invert(), terrain=[],protectedFaces=[],protectedRecords=[];
 group.traverse(o=>{if(!(o instanceof THREE.Mesh))return;const g=o.geometry,p=g.getAttribute('position'),ix=g.index,m=inv.clone().multiply(o.matrixWorld),v=new THREE.Vector3();
  const faces=[];for(let i=0;i<(ix?.count??p.count);i+=3){faces.push([0,1,2].map(k=>{v.fromBufferAttribute(p,ix?ix.getX(i+k):i+k).applyMatrix4(m);return[v.x+tile.origin[0],-v.z-tile.origin[2],v.y+tile.origin[1]];}));}
  if(/^terrain(?:\b|_)/i.test(o.name))terrain.push({mesh:o.name,geometryStamp:terrainGeometryStamp(g),positions:p.count,triangles:faces.length,faces});
  else if(/^(roads|water)(?:\b|_)/i.test(o.name)||/road|water|sidewalk|parking|apron/i.test(o.name)||(Array.isArray(o.material)?o.material:[o.material]).some(m=>m.userData.surfaceRole==='paving')){const selected=faces.filter(t=>Math.abs((t[1][0]-t[0][0])*(t[2][1]-t[0][1])-(t[1][1]-t[0][1])*(t[2][0]-t[0][0]))>1e-7);protectedFaces.push(...selected);protectedRecords.push({name:o.name,parent:o.parent?.name,materials:(Array.isArray(o.material)?o.material:[o.material]).map(m=>m.name),faces:selected});}
 });
 const record={tileId:tile.id,level:lod.level,origin:tile.origin,sourceSha256:lod.sha256,terrain,protectedFaces,protectedRecords,assemblySha256:hash(fs.readFileSync(path.join(site,'src/lib/town/tile-assembly.ts')))};
 fs.writeFileSync(path.join(out,`${tile.id}-${lod.level}.source.json.gz`),gzipSync(JSON.stringify(record)));console.log(tile.id,lod.level,terrain.reduce((n,m)=>n+m.triangles,0));
 const gs=new Set(),ms=new Set(),ts=new Set();group.traverse(o=>{if(o instanceof THREE.Mesh){gs.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material]){ms.add(m);for(const t of Object.values(m))if(t instanceof THREE.Texture)ts.add(t);}}});gs.forEach(g=>g.dispose());ms.forEach(m=>m.dispose());ts.forEach(t=>t.dispose());
}
