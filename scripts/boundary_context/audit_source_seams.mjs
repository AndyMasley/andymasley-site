/** Geometry audit of the complete current tile assembly. Textures alone are stubbed.
 * ROAD_AUDIT_CLEARANCE=1 compares the registered repair; otherwise the final
 * roadGroundClearance stage is omitted to reproduce the registration baseline.
 * ROAD_AUDIT_TILES and ROAD_AUDIT_LEVELS bound a run; separate ROAD_GROUND_OUT
 * directories preserve disjoint audit results for the catalog generator. */
/** Geometry/lifecycle evidence using the SAME ordered steps as the live world.
 * Native texture placeholders prove topology, never actual texture appearance,
 * browser frame rates, shader output or physical-device memory. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { gzipSync,gunzipSync } from 'node:zlib';
import { build } from 'esbuild';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

const site = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const baseline = process.env.BANK_BASELINE;
if (!baseline) throw new Error('BANK_BASELINE must identify the saved native street capture metadata directory');
const out = path.resolve(process.env.ROAD_GROUND_OUT ?? '/private/tmp/webster-road-ground-audit');
fs.mkdirSync(out, { recursive: true });
const read = p => JSON.parse(fs.readFileSync(p)), hash = b => createHash('sha256').update(b).digest('hex');
const data = name => read(path.join(site, 'data/derived/town', name + '.json'));
const release = data('release'), source = path.join(site, 'public/town-assets', release.directory);
const manifestBytes = fs.readFileSync(path.join(source, 'manifest.json'));
if (hash(manifestBytes) !== release.manifestSha256) throw new Error('Pinned source manifest changed');
const manifest = JSON.parse(manifestBytes);
const clearanceIndex=data('road-ground-clearance-index'), emitted={version:1,...clearanceIndex,tiles:process.env.ROAD_AUDIT_RESUME||process.env.ROAD_AUDIT_APPEND?{...clearanceIndex.tiles}:{}};
const indices = Object.fromEntries(['residential-evidence', 'evidence-roofs', 'road-finish', 'terrain-finish', 'paved-surfaces', 'additional-environment', 'roadside', 'environment-ground', 'environment-facilities', 'road-materials', 'street-corners', 'street-corner-ground', 'road-curve', 'road-dash', 'property-terrain', 'foundation-wall'].map(name => [name, data(name + '-index')]));
const packet = asset => {
  if (!asset) return;
  const bytes = fs.readFileSync(path.join(site, 'public', asset.url.slice(1)));
  if (bytes.length !== asset.bytes || asset.sha256 && hash(bytes) !== asset.sha256) throw new Error('Packet source mismatch: ' + asset.url);
  return JSON.parse(bytes);
};
const measured=JSON.parse(fs.readFileSync(site+'/data/derived/town/measured-roofs-index.json'));
function details(id, level) {
  const home = packet(indices['residential-evidence'].tiles[id]), roofs = packet(indices['evidence-roofs'].tiles[id]);
  const measuredFile=site+'/public'+measured.dir+'/'+id+'.json';
  return { roadGroundClearance: packet(clearanceIndex.tiles[id]?.levels[level]), foundationWalls: packet(indices['foundation-wall'].tiles[id]), measuredRoofs: fs.existsSync(measuredFile)?read(measuredFile):undefined, evidence: { buildings: home?.buildings ?? [], roofs: roofs ?? [], failures: 0 },
    road: packet(indices['road-finish'].tiles[id])?.rows,
    terrain: packet(indices['terrain-finish'].tiles[id]?.levels[level]),
    parking: packet(indices['paved-surfaces'].lotAssets[id]),
    additional: packet(indices['additional-environment'].tiles[id]), roadside: packet(indices.roadside.tiles[id]),
    environmentGround: packet(indices['environment-ground'].tiles[id]?.levels[level]),
    facilities: packet(indices['environment-facilities'].tiles[id]), roadMaterials: packet(indices['road-materials'].tiles[id]?.levels[level]), streetCorners: packet(indices['street-corners'].tiles[id]), streetCornerGround: packet(indices['street-corner-ground'].tiles[id]?.levels[level]), roadCurve: packet(indices['road-curve'].tiles[id]?.levels[level]), roadDash: packet(indices['road-dash'].tiles[id]?.levels[level]), propertyTerrain: packet(indices['property-terrain'].tiles[id]?.levels[level]),
  };
}
const entry = path.join(out, 'entry.ts'), bundle = path.join(out, 'assembly.mjs');
fs.writeFileSync(entry, `export { auditAssemblyReports } from ${JSON.stringify(path.join(site, 'src/lib/town/assembly-report.ts'))}; export { tileAssemblySteps } from ${JSON.stringify(path.join(site, 'src/lib/town/tile-assembly.ts'))}; export { deriveRoadGroundClearance } from ${JSON.stringify(path.join(site,'src/lib/town/road-ground-partition.ts'))}; export { applyRoadGroundClearance } from ${JSON.stringify(path.join(site,'src/lib/town/road-ground-clearance.ts'))}; export { applyTerrainFinish, terrainGeometryStamp } from ${JSON.stringify(path.join(site,'src/lib/town/terrain-finish.ts'))}; export { alignAerialRoadNetwork } from ${JSON.stringify(path.join(site,'src/lib/town/aerial-road-alignment.ts'))}; export { RoadGraph } from ${JSON.stringify(path.join(site, 'src/lib/town/engine.ts'))}; export { layoutParking } from ${JSON.stringify(path.join(site, 'src/lib/town/parking-finish.ts'))};`);
await build({ entryPoints: [entry], outfile: bundle, bundle: true, platform: 'node', format: 'esm', logLevel: 'silent', plugins: [{ name: 'same-three', setup(b) { b.onResolve({ filter: /^three$/ }, () => ({ path: fileURLToPath(import.meta.resolve('three')), external: true })); } }] });
const { tileAssemblySteps, layoutParking, auditAssemblyReports, RoadGraph, alignAerialRoadNetwork, applyRoadGroundClearance, deriveRoadGroundClearance, applyTerrainFinish, terrainGeometryStamp } = await import(pathToFileURL(bundle).href);
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
loader.register(() => ({ name: 'NATIVE_TEXTURE_PLACEHOLDER', loadTexture() { return Promise.resolve(new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1)); } }));
const graph=new RoadGraph(alignAerialRoadNetwork(JSON.parse(gunzipSync(fs.readFileSync(site+'/data/derived/town/engine-network.json.gz')))));

const pathJoin=path.join,pathDir=path.dirname;
const proofLevel=Number(process.env.BANK_PROOF_LEVEL??0);
const proofPixels=[...new Map([...([0.1,0.2,0.3,0.7,0.8,0.9].flatMap(x=>[.5,.55,.6,.65,.7,.75,.8,.85].map(y=>[x,y]))), ...JSON.parse(process.env.BANK_PIXELS??'[]')].map(p=>[p.join(','),p])).values()];
const context=data('boundary-context-index'),root=new THREE.Group(),results=[];
for(const serial of (process.env.BANK_VIEWS??"311,579,4674,5099,5261,5738,5754,5836,5880,5882").split(",").map(Number)){
 const record=read(pathJoin(baseline,'view-')+String(serial).padStart(5,'0')+'.json').record;
 const p=record.point,path=graph.paths.get(record.edgeId),[,t]=path.sample(path.length*record.fraction),camera=new THREE.PerspectiveCamera(70,16/9,.15,500);
 camera.position.set(p[0],p[2]+2.5,-p[1]);camera.lookAt(p[0]+t[0]*record.direction*70,p[2]+2.5+t[2]*record.direction*70,-p[1]-t[1]*record.direction*70);camera.updateMatrixWorld(true);
 const selected=manifest.tiles.filter(tile=>{const[x,n]=tile.id.split('_').map(Number);return Math.hypot(Math.max(x*250-p[0],0,p[0]-(x+1)*250),Math.max(n*250-p[1],0,p[1]-(n+1)*250))<90;});
 for(const tile of selected){const lod=tile.lods[proofLevel]??tile.lods.find(Boolean);if(!lod)continue;const raw=fs.readFileSync(pathJoin(source,lod.url)),group=(await loader.parseAsync(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength),pathToFileURL(pathJoin(source,pathDir(lod.url))+'/').href)).scene;for(const step of tileAssemblySteps(group,tile,proofLevel,details(tile.id,proofLevel)))step.apply();group.position.fromArray(tile.origin);root.add(group);}
 for(const[id,ref]of Object.entries(context.tiles)){const[x,n]=id.split('_').map(Number);if(Math.hypot(Math.max(x*512-p[0],0,p[0]-(x+1)*512),Math.max(n*512-p[1],0,p[1]-(n+1)*512))>180)continue;const packetValue=packet(ref);const group=new THREE.Group();group.position.fromArray(packetValue.origin);for(const b of packetValue.batches){if(!['ground','water','bank','road'].includes(b.role))continue;const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(b.positions,3));const m=new THREE.MeshBasicMaterial();m.name='Boundary context | '+b.role;const o=new THREE.Mesh(g,m);o.name=id+' | '+b.role;group.add(o);}root.add(group);}
 root.updateMatrixWorld(true);const rays=[];for(const [x,y] of proofPixels){const ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2(x*2-1,1-y*2),camera);const hits=ray.intersectObject(root,true).filter(h=>h.distance<150).slice(0,5).map(h=>({mesh:h.object.name,material:(Array.isArray(h.object.material)?h.object.material[h.face.materialIndex]:h.object.material).name,point:h.point.toArray(),distance:h.distance,face:h.faceIndex}));rays.push({pixel:[x,y],origin:ray.ray.origin.toArray(),direction:ray.ray.direction.toArray(),hits});}
 const surfaces=[];root.traverse(o=>{if(!o.isMesh||o.isInstancedMesh)return;const ms=Array.isArray(o.material)?o.material:[o.material];if(!/terrain|water|bank|ground|road/i.test(o.name+' '+o.parent?.name+' '+ms.map(m=>m.name).join(' ')))return;const g=o.geometry,position=g.getAttribute('position'),count=g.index?.count??position.count;for(const part of g.groups.length?g.groups:[{start:0,count,materialIndex:0}]){const material=ms[part.materialIndex??0];for(let i=part.start;i<part.start+part.count;i+=3){const points=[0,1,2].map(k=>new THREE.Vector3().fromBufferAttribute(position,g.index?.getX(i+k)??i+k).applyMatrix4(o.matrixWorld).toArray());if(points.every(q=>Math.hypot(q[0]-p[0],q[2]+p[1])>110))continue;surfaces.push({mesh:o.name,material:material.name,triangle:i/3,p:points});}}});
 fs.writeFileSync(out+'/surfaces-'+serial+'-lod'+proofLevel+'.json',JSON.stringify(surfaces));const rayRecord={serial,camera:camera.position.toArray(),tiles:selected.map(t=>t.id),rays};results.push(rayRecord);fs.writeFileSync(out+'/screen-rays-'+serial+'-lod'+proofLevel+'.json',JSON.stringify(rayRecord));fs.writeFileSync(out+'/screen-ray-proof-lod'+proofLevel+'.json',JSON.stringify(results,null,2));console.log('view',serial,'tiles',selected.length,'surfaceTriangles',surfaces.length);root.clear();
}
