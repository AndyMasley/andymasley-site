#!/usr/bin/env node
/** Export source-pinned final terrain and pavement before adding the rail corridor.
 * TOWN_QUALITY_OUT=/absolute/output node scripts/rail_crossings/export-corridor.mjs
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const site = fileURLToPath(new URL('../../', import.meta.url));
const out = path.resolve(process.env.TOWN_QUALITY_OUT ?? path.join(os.tmpdir(), 'rail-corridor'));
const args = process.argv.slice(2);
assert(args.every(a=>a.startsWith('--tiles=')||a==='--all-lods'),'Use --tiles=id,id and/or --all-lods');
const selectedTiles=args.find(a=>a.startsWith('--tiles='))?.slice(8).split(',');
fs.mkdirSync(out, { recursive: true });
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'rail-corridor-'));
const require = createRequire(path.join(site, 'package.json'));
const read = filename => JSON.parse(fs.readFileSync(filename, 'utf8'));
const data = name => read(path.join(site, 'data/derived/town', `${name}.json`));
const release = data('release');
const source = path.join(site, 'public/town-assets', release.directory);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const manifestBytes = fs.readFileSync(path.join(source, 'manifest.json'));
assert.equal(hash(manifestBytes), release.manifestSha256, 'Release manifest source pin');
const manifest = JSON.parse(manifestBytes);
const { build } = require('esbuild');
const threePath = require.resolve('three').replace('three.cjs', 'three.module.js');
const THREE = await import(pathToFileURL(threePath).href);
const { GLTFLoader } = await import(pathToFileURL(require.resolve('three/examples/jsm/loaders/GLTFLoader.js')).href);
const { MeshoptDecoder } = await import(pathToFileURL(require.resolve('three/examples/jsm/libs/meshopt_decoder.module.js')).href);
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
loader.register(() => ({ name: 'NATIVE_TEXTURE_PLACEHOLDER', loadTexture() {
  return Promise.resolve(new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1));
} }));
let bundleSerial = 0;
async function runtime() {
  const entry = path.join(scratch, 'entry.ts'), bundle = path.join(scratch, `runtime-${bundleSerial++}.mjs`);
  fs.writeFileSync(entry, `export {tileAssemblySteps} from ${JSON.stringify(path.join(site, 'src/lib/town/tile-assembly.ts'))};\nexport {terrainGeometryStamp} from ${JSON.stringify(path.join(site, 'src/lib/town/terrain-finish.ts'))};\n`);
  await build({ entryPoints: [entry], outfile: bundle, bundle: true, platform: 'node', format: 'esm', logLevel: 'silent', plugins: [{ name: 'same-three', setup(b) {
    b.onResolve({ filter: /^three$/ }, () => ({ path: threePath, external: true }));
  } }] });
  return import(pathToFileURL(bundle).href);
}
const families = ['residential-evidence', 'evidence-roofs', 'road-finish', 'terrain-finish', 'paved-surfaces', 'additional-environment', 'roadside', 'environment-ground', 'environment-facilities', 'road-materials', 'street-corners', 'street-corner-ground', 'road-curve', 'road-dash', 'property-terrain', 'foundation-wall', 'measured-roofs', 'road-ground-clearance'];
const indices = Object.fromEntries(families.map(name => [name, data(`${name}-index`)]));
const measured = new Set(indices['measured-roofs'].tiles.split(','));
const packet = ref => ref ? read(path.join(site, 'public', ref.url)) : undefined;
function details(id, level) {
  const home = packet(indices['residential-evidence'].tiles[id]);
  return {
    evidence: { buildings: home?.buildings ?? [], roofs: packet(indices['evidence-roofs'].tiles[id]) ?? [], failures: 0 },
    foundationWalls: packet(indices['foundation-wall'].tiles[id]),
    measuredRoofs: measured.has(id) ? read(path.join(site, 'public', indices['measured-roofs'].dir, `${id}.json`)) : undefined,
    road: packet(indices['road-finish'].tiles[id])?.rows,
    terrain: packet(indices['terrain-finish'].tiles[id]?.levels[level]),
    parking: packet(indices['paved-surfaces'].lotAssets[id]),
    additional: packet(indices['additional-environment'].tiles[id]),
    roadside: packet(indices.roadside.tiles[id]),
    environmentGround: packet(indices['environment-ground'].tiles[id]?.levels[level]),
    facilities: packet(indices['environment-facilities'].tiles[id]),
    roadMaterials: packet(indices['road-materials'].tiles[id]?.levels[level]),
    streetCorners: packet(indices['street-corners'].tiles[id]),
    streetCornerGround: packet(indices['street-corner-ground'].tiles[id]?.levels[level]),
    roadCurve: packet(indices['road-curve'].tiles[id]?.levels[level]),
    roadDash: packet(indices['road-dash'].tiles[id]?.levels[level]),
    propertyTerrain: packet(indices['property-terrain'].tiles[id]?.levels[level]),
    roadGroundClearance: packet(indices['road-ground-clearance'].tiles[id]?.levels[level]),
  };
}
const materials = mesh => Array.isArray(mesh.material) ? mesh.material : [mesh.material];
const vector = new THREE.Vector3();
function points(mesh, triangle) {
  const g = mesh.geometry, p = g.getAttribute('position');
  return [0, 1, 2].map(k => vector.fromBufferAttribute(p, g.index?.getX(triangle * 3 + k) ?? triangle * 3 + k).applyMatrix4(mesh.matrixWorld).toArray());
}



const plan=read(path.join(out,'plan.json')),ways=new Map(plan.ways.map(w=>[w.id,w]));
const wanted=manifest.tiles.filter(t=>selectedTiles?selectedTiles.includes(t.id):plan.tiles[t.id]).sort((a,b)=>((a.id==='-13_-4'||a.id==='-13_-5')?-1:0)-((b.id==='-13_-4'||b.id==='-13_-5')?-1:0));
const api=await runtime(),summary=[];
for(const tile of wanted){for(const level of(args.includes('--all-lods')||tile.id==='-13_-4'||tile.id==='-13_-5'?[0,1,2]:[0])){
 const lod=tile.lods.find(l=>l.level===level),raw=fs.readFileSync(path.join(source,lod.url));assert.equal(hash(raw),lod.sha256);
 const group=(await loader.parseAsync(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength),'')).scene;
 const inventory=[];group.traverse(o=>{if(o.isMesh&&/rail|track|ballast|sleeper/i.test(o.name+' '+o.parent?.name+' '+materials(o).map(m=>m.name).join(' ')))inventory.push({name:o.name,parent:o.parent?.name,materials:materials(o).map(m=>m.name),triangles:(o.geometry.index?.count??o.geometry.attributes.position.count)/3});});
 for(const step of api.tileAssemblySteps(group,tile,level,details(tile.id,level)))if(!['railCorridor','railTerrain'].includes(step.name))step.apply();group.position.fromArray(tile.origin);group.updateMatrixWorld(true);
 const bounds=plan.tiles[tile.id].flatMap(id=>{const p=ways.get(id).points;return p.slice(1).map((b,i)=>{const a=p[i];return[Math.min(a[0],b[0])-8,Math.max(a[0],b[0])+8,Math.min(a[1],b[1])-8,Math.max(a[1],b[1])+8];});});
 const faces={terrain:[],road:[],walk:[],curb:[],water:[],rail:[]},names={};
 group.traverse(mesh=>{if(!mesh.isMesh)return;const g=mesh.geometry,p=g.getAttribute('position');if(!p)return;const total=g.index?.count??p.count,ms=materials(mesh);
 for(const part of g.groups.length?g.groups:[{start:0,count:total,materialIndex:0}]){const m=ms[part.materialIndex??0],label=mesh.name+' '+mesh.parent?.name+' '+m.name;let role;
 if(/^terrain(?:\b|_)/i.test(mesh.name))role='terrain';else if(m.name==='Drive road | asphalt'||m.userData.townRoadSurfaceType===5)role='road';else if(/curb/i.test(label))role='curb';else if(/sidewalk/i.test(label))role='walk';else if(/water|river|lake/i.test(label))role='water';else if(/rail|track|ballast|sleeper/i.test(label))role='rail';else continue;
 for(let i=part.start;i<Math.min(total,part.start+part.count);i+=3){const q=[0,1,2].map(k=>vector.fromBufferAttribute(p,g.index?.getX(i+k)??i+k).applyMatrix4(mesh.matrixWorld).toArray()).map(v=>[v[0],-v[2],v[1]]);const minX=Math.min(...q.map(v=>v[0])),maxX=Math.max(...q.map(v=>v[0])),minY=Math.min(...q.map(v=>v[1])),maxY=Math.max(...q.map(v=>v[1]));if(!bounds.some(b=>minX<=b[1]&&maxX>=b[0]&&minY<=b[3]&&maxY>=b[2]))continue;
 let key=mesh.name+'|'+mesh.parent?.name+'|'+m.name;names[key]=(names[key]??0)+1;faces[role].push(q.flat());}
 }});
 const terrainMeshes=[];group.traverse(mesh=>{if(!mesh.isMesh||!/^terrain(?:\b|_)/i.test(mesh.name))return;const g=mesh.geometry;terrainMeshes.push({name:mesh.name,parent:mesh.parent?.name,geometryStamp:api.terrainGeometryStamp(g),positions:Array.from(g.getAttribute('position').array),indices:g.index?Array.from(g.index.array):null,attributes:Object.fromEntries(Object.entries(g.attributes).map(([k,a])=>[k,{itemSize:a.itemSize,normalized:a.normalized,array:Array.from(a.array)}])),matrixWorld:mesh.matrixWorld.toArray()});});
 fs.writeFileSync(path.join(out,`${tile.id}-${level}-terrain.json`),JSON.stringify({tileId:tile.id,origin:tile.origin,level,sourceSha256:lod.sha256,meshes:terrainMeshes}));
 const row={tileId:tile.id,level,sourceSha256:lod.sha256,faces,names,inventory};fs.writeFileSync(path.join(out,`${tile.id}-${level}-domains.json`),JSON.stringify(row));const stats={tileId:tile.id,level,counts:Object.fromEntries(Object.entries(faces).map(([k,v])=>[k,v.length])),inventory};summary.push(stats);console.log(JSON.stringify(stats));
 const gs=new Set(),ms=new Set(),ts=new Set();group.traverse(o=>{if(o.isMesh){gs.add(o.geometry);for(const m of materials(o)){ms.add(m);for(const t of Object.values(m))if(t?.isTexture)ts.add(t);}}});gs.forEach(g=>g.dispose());ms.forEach(m=>m.dispose());ts.forEach(t=>t.dispose());
 }}
fs.writeFileSync(path.join(out,'native-domain-summary.json'),JSON.stringify(summary,null,2));fs.rmSync(scratch,{recursive:true,force:true});
