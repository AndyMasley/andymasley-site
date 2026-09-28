/** Geometry/lifecycle evidence using the SAME ordered steps as the live world.
 * Native texture placeholders prove topology, never actual texture appearance,
 * browser frame rates, shader output or physical-device memory. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { build } from 'esbuild';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

const site = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const out = process.env.TOWN_QUALITY_OUT;
if (!out) throw new Error('Set TOWN_QUALITY_OUT to a directory outside the repository');
// Reuse is for an explicitly controlled incremental audit only. A normal run
// rebuilds every domain, so changed geometry can never silently reuse old data.
const reuse = process.argv.includes('--reuse-domain-cache');
fs.mkdirSync(out, { recursive: true });
const read = p => JSON.parse(fs.readFileSync(p)), hash = b => createHash('sha256').update(b).digest('hex');
const data = name => read(path.join(site, 'data/derived/town', name + '.json'));
const release = data('release'), source = path.join(site, 'public/town-assets', release.directory);
const manifestBytes = fs.readFileSync(path.join(source, 'manifest.json'));
if (hash(manifestBytes) !== release.manifestSha256) throw new Error('Pinned source manifest changed');
const manifest = JSON.parse(manifestBytes);
const sourceInputs = Object.fromEntries(['aerial-road-alignment','obsolete-access-route','obsolete-private-component','obsolete-private-driveway','non-street-island-routes','road-ground-clearance-index'].map(name => [name,hash(fs.readFileSync(path.join(site,'data/derived/town',name+'.json')))]));
const indices = Object.fromEntries(['residential-evidence', 'evidence-roofs', 'road-finish', 'terrain-finish', 'paved-surfaces', 'additional-environment', 'roadside', 'environment-ground', 'environment-facilities', 'road-materials', 'street-corners', 'street-corner-ground', 'road-curve', 'road-dash', 'property-terrain','foundation-wall','measured-roofs','road-ground-clearance'].map(name => [name, data(name + '-index')]));
const packet = asset => {
  if (!asset) return;
  const bytes = fs.readFileSync(path.join(site, 'public', asset.url.slice(1)));
  if (bytes.length !== asset.bytes || asset.sha256 && hash(bytes) !== asset.sha256) throw new Error('Packet source mismatch: ' + asset.url);
  return JSON.parse(bytes);
};
function details(id, level) {
  const home = packet(indices['residential-evidence'].tiles[id]), roofs = packet(indices['evidence-roofs'].tiles[id]);
  const measuredPath=path.join(site,'public',indices['measured-roofs'].dir.slice(1),id+'.json');
  return { roadGroundClearance:packet(indices['road-ground-clearance'].tiles[id]?.levels[level]), foundationWalls:packet(indices['foundation-wall'].tiles[id]), measuredRoofs:fs.existsSync(measuredPath)?read(measuredPath):undefined, evidence: { buildings: home?.buildings ?? [], roofs: roofs ?? [], failures: 0 },
    road: packet(indices['road-finish'].tiles[id])?.rows,
    terrain: packet(indices['terrain-finish'].tiles[id]?.levels[level]),
    parking: packet(indices['paved-surfaces'].lotAssets[id]),
    additional: packet(indices['additional-environment'].tiles[id]), roadside: packet(indices.roadside.tiles[id]),
    environmentGround: packet(indices['environment-ground'].tiles[id]?.levels[level]),
    facilities: packet(indices['environment-facilities'].tiles[id]), roadMaterials: packet(indices['road-materials'].tiles[id]?.levels[level]), streetCorners: packet(indices['street-corners'].tiles[id]), streetCornerGround: packet(indices['street-corner-ground'].tiles[id]?.levels[level]), roadCurve: packet(indices['road-curve'].tiles[id]?.levels[level]), roadDash: packet(indices['road-dash'].tiles[id]?.levels[level]), propertyTerrain: packet(indices['property-terrain'].tiles[id]?.levels[level]),
  };
}
const entry = path.join(out, 'prop-entry.ts'), bundle = path.join(out, 'prop-assembly.mjs');
fs.writeFileSync(entry, [
 ['tileAssemblySteps','tile-assembly'],['findSignPlacements','street-signs'],
 ['alignAerialRoadNetwork','aerial-road-alignment'],['StreetDressing','street-dressing']
].map(([names,file])=>`export { ${names} } from ${JSON.stringify(path.join(site,'src/lib/town',file+'.ts'))};`).join('\n'));
await build({entryPoints:[entry],outfile:bundle,bundle:true,platform:'node',format:'esm',logLevel:'silent',plugins:[{name:'same-three',setup(b){b.onResolve({filter:/^three$/},()=>({path:path.join(site,'node_modules/three/build/three.module.js'),external:true}));}}]});
const {findSignPlacements,tileAssemblySteps,alignAerialRoadNetwork,StreetDressing}=await import(pathToFileURL(bundle).href);

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
loader.register(() => ({ name: 'NATIVE_TEXTURE_PLACEHOLDER', loadTexture() { return Promise.resolve(new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1)); } }));
const network=alignAerialRoadNetwork(JSON.parse(gunzipSync(fs.readFileSync(path.join(site,'data/derived/town/engine-network.json.gz')))));
const roads=new StreetDressing(network,data('street-context'),{});

// Exact original anchors are exported with the runtime clearance registry disabled.
const props=[...roads.poles.map((p,i)=>({...p,kind:'pole',id:i})),...roads.hydrants.map((p,i)=>({...p,kind:'hydrant',id:i})),...findSignPlacements(network).map((p,i)=>({...p,kind:'sign',id:i}))];
for(const asset of Object.values(indices.roadside.tiles))for(const r of packet(asset).objects)if(r.kind==='utility-pole'&&r.evidence.startsWith('Inferred infill'))props.push({kind:'utility',id:r.id,x:r.point[0],n:r.point[1],z:r.base,ox:r.normal[0],on:r.normal[1]});
fs.writeFileSync(path.join(out,'generated-prop-positions.json'),JSON.stringify(props));
const tileKeys=new Set();for(const p of props)for(let dx=-8;dx<=8;dx+=8)for(let dn=-8;dn<=8;dn+=8)tileKeys.add(Math.floor((p.x+dx)/250)+'_'+Math.floor((p.n+dn)/250));
const domainsDir=path.join(out,'prop-domains');fs.mkdirSync(domainsDir,{recursive:true});let done=0;
for(const tile of manifest.tiles){
 if(!tileKeys.has(tile.id)||!tile.lods.length)continue;
 const target=path.join(domainsDir,tile.id+'.json');if(reuse&&fs.existsSync(target))continue;
 const lod=tile.lods.find(l=>l.level===0)??tile.lods[0],raw=fs.readFileSync(path.join(source,lod.url));
 if(hash(raw)!==lod.sha256)throw new Error('Source GLB mismatch '+tile.id);
 const group=(await loader.parseAsync(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength),'')).scene,supplied=details(tile.id,lod.level);
 for(const step of tileAssemblySteps(group,tile,lod.level,supplied))if(!['evidenceBuildings','craftedFrontages','foundationWalls','institutions','landmarkCompletion','commercial','campStructures','pointBreezeDetails','indianRanchCanopy','bathhouse','frenchRiverParkFurniture','mainStreetFurniture','evidenceEnvironment','townHallMaterials','civicRoof','churchRoof','civicDetails','memorials','additionalEnvironment','facilities','dockApproaches','utilities','lakeLife','roadside'].includes(step.name))step.apply();group.updateMatrixWorld(true);
 const domain={roads:[],terrain:[],buildings:supplied.evidence.buildings.map(b=>({id:b.id,outline:b.outline})),mappedPoles:(supplied.roadside?.objects??[]).filter(p=>p.kind==='utility-pole').map(p=>p.point)},v=new THREE.Vector3();
 group.traverse(o=>{if(!o.isMesh||o.isInstancedMesh)return;let terrain=false;for(let q=o;q;q=q.parent)if(q.name==='terrain'||q.name.startsWith('terrain_'))terrain=true;const g=o.geometry,p=g.getAttribute('position');if(!p)return;const count=g.index?.count??p.count,ms=Array.isArray(o.material)?o.material:[o.material];for(const part of g.groups.length?g.groups:[{start:0,count,materialIndex:0}]){const m=ms[part.materialIndex??0],kind=m.name==='Drive road | asphalt'||m.userData.townRoadSurfaceType?'roads':terrain?'terrain':null;if(!kind)continue;for(let i=part.start;i+2<Math.min(count,part.start+part.count);i+=3)domain[kind].push([0,1,2].map(k=>{v.fromBufferAttribute(p,g.index?.getX(i+k)??i+k).applyMatrix4(o.matrixWorld);return[v.x+tile.origin[0],-v.z-tile.origin[2],v.y+tile.origin[1]];}));}});
 fs.writeFileSync(target,JSON.stringify(domain));
 const gs=new Set(),ms=new Set();group.traverse(o=>{if(o.isMesh){gs.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])ms.add(m);}});gs.forEach(g=>g.dispose());ms.forEach(m=>m.dispose());group.clear();
 if(++done%20===0)console.log(JSON.stringify({done,tile:tile.id}));
}
fs.writeFileSync(path.join(out,'prop-domain-provenance.json'),JSON.stringify({version:1,manifestSha256:release.manifestSha256,sourceInputs,generatedAt:new Date().toISOString(),incrementalCacheReuse:reuse,props:props.length,requestedTiles:tileKeys.size,nativeTextures:'placeholders; geometry proof only'},null,2));
console.log(JSON.stringify({complete:true,props:props.length,tiles:tileKeys.size}));
