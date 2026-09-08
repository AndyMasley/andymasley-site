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
const out = path.resolve(process.env.TOWN_ASSEMBLY_OUT || '/private/tmp/webster-finished-game/art/property-terrain');
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
fs.writeFileSync(entry, `export { tileAssemblySteps } from ${JSON.stringify(path.join(site, 'src/lib/town/tile-assembly.ts'))}; export { terrainGeometryStamp } from ${JSON.stringify(path.join(site, 'src/lib/town/terrain-finish.ts'))}; export {applyPropertyTerrainFinish,validPropertyTerrainPacket} from ${JSON.stringify(path.join(site,'src/lib/town/property-terrain-finish.ts'))};`);
await build({ entryPoints: [entry], outfile: bundle, bundle: true, platform: 'node', format: 'esm', logLevel: 'silent', plugins: [{ name: 'same-three', setup(b) { b.onResolve({ filter: /^three$/ }, () => ({ path: fileURLToPath(import.meta.resolve('three')), external: true })); } }] });
const { tileAssemblySteps, terrainGeometryStamp, applyPropertyTerrainFinish, validPropertyTerrainPacket } = await import(pathToFileURL(bundle).href);
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
loader.register(() => ({ name: 'NATIVE_TEXTURE_PLACEHOLDER', loadTexture() { return Promise.resolve(new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1)); } }));



const tiles=new Set(Object.keys(data('property-grounds').tiles)),index=data('property-terrain-index');
const digestGeometry=g=>hash(Buffer.concat([...Object.values(g.attributes).map(a=>Buffer.from(a.array.buffer,a.array.byteOffset,a.array.byteLength)),...(g.index?[Buffer.from(g.index.array.buffer,g.index.array.byteOffset,g.index.array.byteLength)]:[])]));
const report={scope:'Actual source GLTFLoader, authoritative runtime predecessors, explicitly bracketed property terrain mutation, every affected tile and every LOD. All nonterrain objects, exact source attribute prefixes and interpolated UVs are checked independently.',sourceManifestSha256:release.manifestSha256,indexSha256:hash(fs.readFileSync(path.join(site,'data/derived/town/property-terrain-index.json'))),runtimeSha256:hash(fs.readFileSync(path.join(site,'src/lib/town/property-terrain-finish.ts'))),rows:[],failures:[]};
for(const tile of manifest.tiles.filter(t=>tiles.has(t.id)))for(const lod of tile.lods){
 const raw=fs.readFileSync(path.join(source,lod.url));if(hash(raw)!==lod.sha256)throw Error('Source SHA');
 const group=(await loader.parseAsync(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength),'')).scene;
 const steps=tileAssemblySteps(group,tile,lod.level,details(tile.id,lod.level));for(const step of steps){if(step.name==='propertyGrounds'||step.name==='propertyTerrain')break;step.apply();}
 const protectedMeshes=[],oldTerrain=new Map();group.traverse(o=>{if(!(o instanceof THREE.Mesh))return;if(/^terrain(?:\b|_)/i.test(o.name))oldTerrain.set(o.name,{o,g:o.geometry,attributes:Object.fromEntries(Object.entries(o.geometry.attributes).map(([n,a])=>[n,Array.from(a.array)])),hash:digestGeometry(o.geometry)});else protectedMeshes.push({o,g:o.geometry,m:o.material,hash:digestGeometry(o.geometry),matrix:o.matrix.toArray()});});
 const ref=index.tiles[tile.id]?.levels[lod.level],patch=packet(ref);if(patch&&!validPropertyTerrainPacket(patch,tile.id))throw Error('Invalid packet');
 const start=performance.now(),result=applyPropertyTerrainFinish(group,tile.id,tile.origin,lod.level,lod.sha256,patch),ms=performance.now()-start,failures=[];
 if(result?.rejected)failures.push(result.rejectionReason);if(patch&&!result?.meshes)failures.push('No mutation');
 for(const r of protectedMeshes)if(r.o.geometry!==r.g||r.o.material!==r.m||digestGeometry(r.g)!==r.hash||JSON.stringify(r.o.matrix.toArray())!==JSON.stringify(r.matrix))failures.push('Protected source changed');
 let maxUVError=0,minNormal=1,maxNormal=1,degenerate=0,minUp=1,prefixBytes=0;
 for(const r of oldTerrain.values()){
  for(const[n,a]of Object.entries(r.attributes)){const output=r.o.geometry.getAttribute(n);prefixBytes+=a.length*4;for(let i=0;i<a.length;i++)if(output.array[i]!==a[i]){failures.push('Source prefix changed');break;}}
  const p=r.o.geometry.getAttribute('position'),n=r.o.geometry.getAttribute('normal'),ix=r.o.geometry.index;for(let i=r.g.getAttribute('position').count;i<p.count;i++){const l=Math.hypot(n.getX(i),n.getY(i),n.getZ(i));minNormal=Math.min(minNormal,l);maxNormal=Math.max(maxNormal,l);}
  for(let i=0;i<(ix?.count??p.count);i+=3){const ids=[0,1,2].map(k=>ix?ix.getX(i+k):i+k);if(ids.every(v=>v<r.g.getAttribute('position').count))continue;const[a,b,c]=ids.map(v=>new THREE.Vector3().fromBufferAttribute(p,v)),cross=b.sub(a).cross(c.sub(a));if(cross.length()<1e-10)degenerate++;else minUp=Math.min(minUp,cross.normalize().y);}
  const row=patch?.levels[0].meshes.find(m=>m.mesh===r.o.name);if(row){const uv=r.o.geometry.getAttribute('uv'),oldUV=r.g.getAttribute('uv');let offset=r.g.getAttribute('position').count;for(const[num,vertices]of row.patches){const ids=[0,1,2].map(k=>r.g.index?r.g.index.getX(num*3+k):num*3+k);for(const[u,v]of vertices){for(let c=0;c<oldUV.itemSize;c++){const expected=oldUV.array[ids[0]*oldUV.itemSize+c]*(1-u-v)+oldUV.array[ids[1]*oldUV.itemSize+c]*u+oldUV.array[ids[2]*oldUV.itemSize+c]*v;maxUVError=Math.max(maxUVError,Math.abs(uv.array[offset*uv.itemSize+c]-expected));}offset++;}}}
 }
 if(minNormal<.99999||maxNormal>1.00001||minUp<=0||degenerate||maxUVError>1e-6)failures.push('Appended geometry/UV invalid');
 const after=Array.from(oldTerrain.values()).map(r=>digestGeometry(r.o.geometry));if(patch&&applyPropertyTerrainFinish(group,tile.id,tile.origin,lod.level,lod.sha256,patch)!==result)failures.push('Idempotence report mismatch');if(JSON.stringify(after)!==JSON.stringify(Array.from(oldTerrain.values()).map(r=>digestGeometry(r.o.geometry))))failures.push('Repeat mutation');
 let started=false;for(const step of steps){if(step.name==='propertyGrounds')started=true;if(started)step.apply();}
 group.updateMatrixWorld(true);const inv=group.matrixWorld.clone().invert(),terrain=[],siteGrounds=[];group.traverse(o=>{if(!(o instanceof THREE.Mesh)||!/^terrain(?:\b|_)/i.test(o.name)&&o.parent?.name!=='Residential entrances and paving')return;const g=o.geometry,p=g.getAttribute('position'),ix=g.index,m=inv.clone().multiply(o.matrixWorld),v=new THREE.Vector3();const faces=[];for(let i=0;i<(ix?.count??p.count);i+=3)faces.push([0,1,2].map(k=>{v.fromBufferAttribute(p,ix?ix.getX(i+k):i+k).applyMatrix4(m);return[v.x+tile.origin[0],-v.z-tile.origin[2],v.y+tile.origin[1]];}));if(/^terrain(?:\b|_)/i.test(o.name))terrain.push(...faces);else siteGrounds.push({name:o.name,role:o.material.userData.surfaceRole,triangles:faces});});
 fs.writeFileSync(path.join(out,`${tile.id}-${lod.level}.domains.json.gz`),gzipSync(JSON.stringify({tileId:tile.id,level:lod.level,sourceSha256:lod.sha256,terrain,siteGrounds})));
 const row={tileId:tile.id,level:lod.level,sourceSha256:lod.sha256,ms,result,protectedMeshes:protectedMeshes.length,protectedHash:hash(JSON.stringify(protectedMeshes.map(r=>r.hash))),sourcePrefixBytes:prefixBytes,maxUVError,minNormal,maxNormal,degenerate,minUp,failures};report.rows.push(row);report.failures.push(...failures);console.log(JSON.stringify(row));
 const gs=new Set(),ms0=new Set(),ts=new Set();group.traverse(o=>{if(o instanceof THREE.Mesh){gs.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material]){ms0.add(m);for(const t of Object.values(m))if(t instanceof THREE.Texture)ts.add(t);}}});gs.forEach(g=>g.dispose());ms0.forEach(m=>m.dispose());ts.forEach(t=>t.dispose());
}
report.status=report.failures.length?'FAIL':'PASS';fs.writeFileSync(path.join(out,'native-audit.json'),JSON.stringify(report,null,2));console.log(report.status);if(report.failures.length)process.exitCode=1;
