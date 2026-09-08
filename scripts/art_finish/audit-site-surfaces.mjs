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
const out = path.resolve(process.env.TOWN_ASSEMBLY_OUT || '/private/tmp/webster-finished-game/art/site-surfaces');
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
const entry=path.join(out,'entry.ts');fs.writeFileSync(entry,`export{tileAssemblySteps}from${JSON.stringify(path.join(site,'src/lib/town/tile-assembly.ts'))};`);
const compilers=[];
for(const baseline of[true,false]){
 const bundle=path.join(out,baseline?'before.mjs':'after.mjs');
 await build({entryPoints:[entry],outfile:bundle,bundle:true,platform:'node',format:'esm',logLevel:'silent',plugins:[{name:'same-three',setup(b){b.onResolve({filter:/^three$/},()=>({path:fileURLToPath(import.meta.resolve('three')),external:true}));if(baseline)b.onLoad({filter:/site-surface-finish\.ts$/},()=>({contents:'export function finishBasinSurfaces(){return 0} export function finishLaunchSurfaces(){return 0} export function finishRecreationSurfaces(){} export function applySiteArtMaterial(){return false} export function removeSiteArtMaterial(){}',loader:'ts'}));}}]});
 compilers.push((await import(pathToFileURL(bundle).href)).tileAssemblySteps);
}
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
loader.register(() => ({ name: 'NATIVE_TEXTURE_PLACEHOLDER', loadTexture() { return Promise.resolve(new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1)); } }));

const wanted=new Set(data('utility-site-details').rows.map(r=>r.tileId));
for(const[id,ref]of Object.entries(indices['environment-facilities'].tiles))if(packet(ref).objects.some(r=>r.kind==='court'))wanted.add(id);
for(const[id,ref]of Object.entries(indices['additional-environment'].tiles))if(packet(ref).objects.some(r=>r.kind==='boat-ramp'))wanted.add(id);
const buf=a=>Buffer.from(a.array.buffer,a.array.byteOffset,a.array.byteLength);
function inventory(group){const rows=[];group.traverse(o=>{if(!(o instanceof THREE.Mesh))return;rows.push({name:o.name,matrix:o.matrix.toArray(),attributes:Object.fromEntries(Object.entries(o.geometry.attributes).filter(([n])=>n!=='townSiteData').map(([n,a])=>[n,hash(buf(a))])),index:o.geometry.index?hash(buf(o.geometry.index)):null,groups:o.geometry.groups,range:o.geometry.drawRange});});return rows;}
function dispose(group){const gs=new Set(),ms=new Set(),ts=new Set();group.traverse(o=>{if(o instanceof THREE.Mesh){gs.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material]){ms.add(m);for(const t of Object.values(m))if(t instanceof THREE.Texture)ts.add(t);}}});gs.forEach(g=>g.dispose());ms.forEach(m=>m.dispose());ts.forEach(t=>t.dispose());}
const result={sourceManifestSha256:release.manifestSha256,sourceFiles:Object.fromEntries(['site-surface-finish','utility-site-details','additional-environment','environment-facilities'].map(n=>[n,hash(fs.readFileSync(path.join(site,'src/lib/town',n+'.ts')))])),assemblySha256:hash(fs.readFileSync(path.join(site,'src/lib/town/tile-assembly.ts'))),frontageSha256:hash(fs.readFileSync(path.join(site,'src/lib/town/crafted-frontages.ts'))),scope:'All 13 affected original source tiles at every LOD, parsed with native GLTFLoader and processed through current authoritative tileAssemblySteps. Before is the exact same working source with only the three new attribute/material finish functions replaced by no-ops. Every generated/source XYZ, normal, UV, index, group, draw range and object transform must remain byte-identical; only the new site attribute and selected material names may differ. This is geometry/resource evidence, not a GPU appearance test.',rows:[],failures:[]};
for(const tile of manifest.tiles.filter(t=>wanted.has(t.id)))for(const lod of tile.lods){
 const raw=fs.readFileSync(path.join(source,lod.url));if(hash(raw)!==lod.sha256)throw Error('GLB source mismatch');const groups=[];
 for(const compiler of compilers){const g=(await loader.parseAsync(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength),'')).scene;for(const step of compiler(g,tile,lod.level,details(tile.id,lod.level)))step.apply();groups.push(g);}
 const a=inventory(groups[0]),b=inventory(groups[1]),failures=[];if(JSON.stringify(a)!==JSON.stringify(b))failures.push('Geometry/source ordering changed');
 let attributeBytes=0,attributeVertices=0,nonfinite=0,invalidContext=0;const materials={},sourcePreservationSha256=hash(JSON.stringify(a));
 groups[1].traverse(o=>{if(!(o instanceof THREE.Mesh))return;const m=Array.isArray(o.material)?undefined:o.material;
  if(m?.name.startsWith('Finished site | ')){materials[m.name]=(materials[m.name]??0)+1;const p=o.geometry.getAttribute('position'),attr=o.geometry.getAttribute('townSiteData');
   if(/basin concrete|launch concrete/.test(m.name)&&(!attr||attr.count!==p.count||attr.itemSize!==4))failures.push('Missing surface context');
   if(attr){attributeBytes+=attr.array.byteLength;attributeVertices+=attr.count;for(const v of attr.array)if(!Number.isFinite(v))nonfinite++;for(let i=0;i<attr.count;i++)if(![0,1].includes(attr.getW(i)))invalidContext++;}
  }else if(o.geometry.hasAttribute('townSiteData'))failures.push('Attribute escaped selected surfaces');
 });if(nonfinite||invalidContext)failures.push('Invalid surface context');
 const row={tileId:tile.id,level:lod.level,sourceSha256:lod.sha256,meshes:a.length,sourcePreservationSha256,materials,attributeBytes,attributeVertices,nonfinite,invalidContext,failures};result.rows.push(row);result.failures.push(...failures);console.log(tile.id,lod.level,failures.length?'FAIL':'PASS',attributeBytes);groups.forEach(dispose);
}
result.summary={tiles:wanted.size,levels:result.rows.length,attributeBytes:result.rows.reduce((n,r)=>n+r.attributeBytes,0),sourceAndGeometryUnchanged:!result.failures.length};result.status=result.failures.length?'FAIL':'PASS';fs.writeFileSync(path.join(out,'native-audit.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({status:result.status,...result.summary}));if(result.failures.length)process.exitCode=1;
