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

const site = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
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
const samplesByTile=new Map(),seen=new Set();
for(const [id,edge]of graph.edges){if(seen.has(edge.physical_id??id))continue;seen.add(edge.physical_id??id);const p=graph.paths.get(id);for(let s=.25;s<p.length;s+=5){const[pos,tan]=p.sample(s);for(const lateral of[-1.5,0,1.5]){const x=pos[0]-tan[1]*lateral,n=pos[1]+tan[0]*lateral,key=Math.floor(x/250)+'_'+Math.floor(n/250),row={edge:id,road:edge.name,s,lateral,x,n,z:pos[2]};const bin=samplesByTile.get(key)??[];bin.push(row);samplesByTile.set(key,bin);}}}
const cross=(a,b,p)=>(b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]);
class TriIndex{
 constructor(tris){this.bins=new Map();for(const t of tris){const ps=t.p;for(let x=Math.floor(Math.min(...ps.map(p=>p[0]))/8);x<=Math.floor(Math.max(...ps.map(p=>p[0]))/8);x++)for(let y=Math.floor(Math.min(...ps.map(p=>p[1]))/8);y<=Math.floor(Math.max(...ps.map(p=>p[1]))/8);y++){const key=x+':'+y,b=this.bins.get(key)??[];b.push(t);this.bins.set(key,b);}}}
 hits(x,n){const r=[];for(const t of this.bins.get(Math.floor(x/8)+':'+Math.floor(n/8))??[]){const[a,b,c]=t.p,d=cross(a,b,c);if(Math.abs(d)<1e-9)continue;const u=cross(a,[x,n],c)/d,v=cross(a,b,[x,n])/d;if(u>=-1e-7&&v>=-1e-7&&u+v<=1+1e-7)r.push({z:a[2]+u*(b[2]-a[2])+v*(c[2]-a[2]),t});}return r;}
}
const selected=(process.env.ROAD_AUDIT_SELECTION_FILE?fs.readFileSync(process.env.ROAD_AUDIT_SELECTION_FILE,'utf8').split(','):process.env.ROAD_AUDIT_TILES?.split(',')),levels=(process.env.ROAD_AUDIT_LEVELS??'0,1,2').split(',').map(Number),report={version:1,sourceManifestSha256:release.manifestSha256,basis:'Actual source GLTFLoader geometry; all current runtime assembly packets including measured roofs and foundation walls; textures alone stubbed. Triangle sample and 5 m guided-route sample audit, not pixel proof.',rows:[]};
if(process.env.ROAD_AUDIT_RESUME){const prior=path.join(out,'clearance-surface-report-'+levels.join('-')+'.json');if(fs.existsSync(prior))report.rows=read(prior).rows;}
const completed=new Set(report.rows.map(r=>r.tileId+'@'+r.level));
const isTerrain=(o)=>{for(let p=o;p;p=p.parent)if(/^terrain(?:\b|_)/.test(p.name))return true;return false;};
const isPavement=(m)=>m.name.startsWith('Drive road | asphalt')||m.name.startsWith('Streetscape | parking apron asphalt')||!!m.userData.townRoadSurfaceType||m.name==='Finished street corner | asphalt apron';
const isPaint=(m)=>/Drive road \| (?:warm yellow|chalk white) paint|Finished road \| solid yellow centerline/.test(m.name);
const save=()=>fs.writeFileSync(out+(process.env.ROAD_AUDIT_CLEARANCE?'/clearance-surface-report-':'/full-surface-report-')+levels.join('-')+'.json',JSON.stringify(report,null,2));
for(const tile of manifest.tiles.filter(t=>(!selected||selected.includes(t.id))&&samplesByTile.has(t.id)))for(const lod of tile.lods.filter(l=>levels.includes(l.level))){
 if(completed.has(tile.id+'@'+lod.level))continue;
 const raw=fs.readFileSync(path.join(source,lod.url));if(hash(raw)!==lod.sha256)throw Error('source mismatch');let group=(await loader.parseAsync(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength),pathToFileURL(path.dirname(path.join(source,lod.url))+'/').href)).scene;
 const diagnostics=[],probe=process.env.ROAD_AUDIT_PROBE?JSON.parse(process.env.ROAD_AUDIT_PROBE):null;
 const supplied=details(tile.id,lod.level),start=performance.now(),stages={};for(const step of tileAssemblySteps(group,tile,lod.level,supplied)){const now=performance.now();if(step.name!=='roadGroundClearance')step.apply();stages[step.name]=performance.now()-now;if(probe&&['bridge','terrain','shoreline','streetCornerGround','roadCurve','propertyTerrain','propertyGrounds','roadside'].includes(step.name)){group.updateMatrixWorld(true);const meshes=[];group.traverse(o=>{if(o.isMesh&&isTerrain(o))meshes.push(o);});const ray=new THREE.Raycaster(new THREE.Vector3(probe[0]-tile.origin[0],500,-probe[1]-tile.origin[2]),new THREE.Vector3(0,-1,0));diagnostics.push({step:step.name,ground:ray.intersectObjects(meshes,false)[0]?.point.y});}}
 const beforeTerrain=[],probeBounds=[];if(process.env.ROAD_AUDIT_GROUNDING){const registrations=read(site+'/data/derived/town/road-ground-clearance.json').tiles[tile.id];const point=new THREE.Vector3();group.updateMatrixWorld(true);group.traverse(o=>{if(!o.isMesh||o.isInstancedMesh)return;const g=o.geometry,p=g.getAttribute('position'),count=g.index?.count??p.count;if(isTerrain(o))for(let i=0;i+2<count;i+=3)beforeTerrain.push({p:[0,1,2].map(k=>{point.fromBufferAttribute(p,g.index?.getX(i+k)??i+k).applyMatrix4(o.matrixWorld);return[point.x+tile.origin[0],-point.z-tile.origin[2],point.y+tile.origin[1]];})});for(const r of registrations?.meshes??[])if(r.name===o.name)for(const triangle of r.triangles){const points=[0,1,2].map(k=>{point.fromBufferAttribute(p,g.index?.getX(triangle*3+k)??triangle*3+k).applyMatrix4(o.matrixWorld);return[point.x+tile.origin[0],-point.z-tile.origin[2]];});probeBounds.push([Math.min(...points.map(p=>p[0]))-.75,Math.min(...points.map(p=>p[1]))-.75,Math.max(...points.map(p=>p[0]))+.75,Math.max(...points.map(p=>p[1]))+.75]);}});}
 let derivation;
 if(process.env.ROAD_AUDIT_EMIT){
   const original=group.clone(true),originalGeometry=new Set();original.traverse(o=>{if(o.isMesh)originalGeometry.add(o.geometry);});
   const derived=deriveRoadGroundClearance(group,tile.id,tile.origin,lod.level,lod.sha256);derivation=derived.report;
   group.traverse(o=>{if(o.isMesh&&!originalGeometry.has(o.geometry))o.geometry.dispose();});group=original;
   if(derived.report.rejected)throw Error('Registration rejected '+tile.id+'@'+lod.level);
   delete emitted.tiles[tile.id]?.levels[lod.level];
   supplied.roadGroundClearance=undefined;
   if(derived.packet.levels[0].meshes.length){
     const payload={...derived.packet,sourceRegistrationSha256:clearanceIndex.sourceRegistrationSha256},bytes=Buffer.from(JSON.stringify(payload)),sha256=hash(bytes),url='/town-evidence/v1/road-ground/'+tile.id+'-'+lod.level+'.'+sha256.slice(0,16)+'.json';
     fs.mkdirSync(path.dirname(site+'/public'+url),{recursive:true});fs.writeFileSync(site+'/public'+url,bytes);
     const registration=emitted.tiles[tile.id]??={origin:tile.origin,levels:{}};registration.levels[lod.level]={url,bytes:bytes.length,sha256};supplied.roadGroundClearance=payload;
   }
 }
 const clearanceStart=performance.now(),clearance=process.env.ROAD_AUDIT_EMIT?applyTerrainFinish(group,tile.id,tile.origin,lod.level,supplied.roadGroundClearance,'roadGroundClearance',{raise:0,lower:.8,footprintToleranceM2:.0001}):process.env.ROAD_AUDIT_CLEARANCE?applyRoadGroundClearance(group,tile.id,tile.origin,lod.level,lod.sha256,supplied.roadGroundClearance):undefined;const clearanceMs=performance.now()-clearanceStart;
 if(clearance?.rejected)throw Error('Clearance rejected '+tile.id+'@'+lod.level+': '+clearance.rejectionReason);
 group.updateMatrixWorld(true);const domain={road:[],paint:[],terrain:[]},v=new THREE.Vector3();
 group.traverse(o=>{if(!o.isMesh||o.isInstancedMesh)return;const g=o.geometry,p=g.getAttribute('position');if(!p)return;const count=g.index?.count??p.count,ms=Array.isArray(o.material)?o.material:[o.material];for(const r of g.groups.length?g.groups:[{start:0,count,materialIndex:0}]){const m=ms[r.materialIndex??0];if(!m)continue;const kind=isPavement(m)?'road':isPaint(m)?'paint':isTerrain(o)?'terrain':null;if(!kind)continue;for(let i=r.start;i+2<Math.min(count,r.start+r.count);i+=3){const points=[0,1,2].map(k=>{v.fromBufferAttribute(p,g.index?.getX(i+k)??i+k).applyMatrix4(o.matrixWorld);return[v.x+tile.origin[0],-v.z-tile.origin[2],v.y+tile.origin[1]];});domain[kind].push({p:points,mesh:o.name,material:m.name,triangle:i/3});}}});
 const grounding={checked:0,newlyFloating:[],transitionSamples:[],maximumFootprintDistanceM:0};if(beforeTerrain.length){const beforeIndex=new TriIndex(beforeTerrain),afterIndex=new TriIndex(domain.terrain),point=new THREE.Vector3(),seen=new Set();for(const bounds of probeBounds)for(let x=Math.ceil(bounds[0]*4)/4;x<=bounds[2];x+=.25)for(let n=Math.ceil(bounds[1]*4)/4;n<=bounds[3];n+=.25){const key=x+':'+n;if(seen.has(key))continue;seen.add(key);const before=beforeIndex.hits(x,n).sort((a,b)=>b.z-a.z)[0],after=afterIndex.hits(x,n).sort((a,b)=>b.z-a.z)[0];if(before&&after)grounding.transitionSamples.push({x,n,before:before.z,after:after.z});}group.traverse(o=>{if(!o.isMesh||o.isInstancedMesh||isTerrain(o))return;const materials=Array.isArray(o.material)?o.material:[o.material];if(materials.some(m=>/road|asphalt|sidewalk|curb|paint|water|paving|joint/i.test(m.name)))return;const p=o.geometry.getAttribute('position');if(!p)return;for(let i=0;i<p.count;i++){point.fromBufferAttribute(p,i).applyMatrix4(o.matrixWorld);const x=point.x+tile.origin[0],n=-point.z-tile.origin[2],z=point.y+tile.origin[1];if(!probeBounds.some(b=>x>=b[0]&&x<=b[2]&&n>=b[1]&&n<=b[3]))continue;const before=beforeIndex.hits(x,n).sort((a,b)=>b.z-a.z)[0];if(!before||z-before.z<-.075||z-before.z>.12)continue;const after=afterIndex.hits(x,n).sort((a,b)=>b.z-a.z)[0];if(!after)continue;grounding.checked++;if(z-after.z>.2&&before.z-after.z>.08)grounding.newlyFloating.push({mesh:o.name,x,n,z,before:before.z,after:after.z});}});}
 const activeRoads=new Map(),meshStamps={};group.traverse(o=>{if(o.isMesh&&domain.road.some(t=>t.mesh===o.name))meshStamps[o.name]=terrainGeometryStamp(o.geometry);});
 const roadIndex=new TriIndex(domain.road),groundIndex=new TriIndex(domain.terrain),issues={},counts={road:domain.road.length,paint:domain.paint.length,terrain:domain.terrain.length,routeSamples:0},add=(kind,row,severity=0)=>{counts[kind]=(counts[kind]??0)+1;const list=issues[kind]??=[];list.push({...row,severity});list.sort((a,b)=>b.severity-a.severity);if(list.length>12)list.length=12;issues[kind]=list;};
 for(const t of domain.road){const[a,b,c]=t.p,det=cross(a,b,c),dx=((b[2]-a[2])*(c[1]-a[1])-(c[2]-a[2])*(b[1]-a[1]))/det,dn=((b[0]-a[0])*(c[2]-a[2])-(c[0]-a[0])*(b[2]-a[2]))/det,slope=Math.hypot(dx,dn),area=Math.abs(det)/2,point=[0,1,2].map(k=>(a[k]+b[k]+c[k])/3);if(slope>1&&area>.005)add('steepRoad',{...t,area,slope,point},slope);for(const w of[[1/3,1/3,1/3],[.6,.2,.2],[.2,.6,.2],[.2,.2,.6]]){const[x,n,z]=[0,1,2].map(k=>t.p.reduce((sum,p,i)=>sum+p[k]*w[i],0)),ground=groundIndex.hits(x,n).sort((a,b)=>b.z-a.z)[0];if(ground&&ground.z-z>.01&&ground.z-z<.8)activeRoads.set(t.mesh+':'+t.triangle,t);if(ground&&ground.z-z>.025)add('buriedRoad',{x,n,z,ground:ground.z,mesh:t.mesh,triangle:t.triangle,area},ground.z-z);}}
 for(const t of domain.paint){const[x,n,z]=[0,1,2].map(k=>t.p.reduce((sum,p)=>sum+p[k]/3,0)),hits=roadIndex.hits(x,n).filter(h=>Math.abs(h.z-z)<.6).sort((a,b)=>b.z-a.z);if(!hits.length){add('unsupportedPaint',{...t,point:[x,n,z]},1);continue;}const gap=z-hits[0].z;if(gap<-.005)add('buriedPaint',{...t,point:[x,n,z],gap},-gap);if(gap>.07)add('floatingPaint',{...t,point:[x,n,z],gap},gap);}
 for(const s of samplesByTile.get(tile.id)??[]){counts.routeSamples++;const hits=roadIndex.hits(s.x,s.n);const closest=hits.sort((a,b)=>Math.abs(a.z-s.z)-Math.abs(b.z-s.z))[0];if(!closest){add('missingRoutePavement',s,1);continue;}const ground=groundIndex.hits(s.x,s.n).sort((a,b)=>b.z-a.z)[0];if(ground&&ground.z-closest.z>.01&&ground.z-closest.z<.8)activeRoads.set(closest.t.mesh+':'+closest.t.triangle,closest.t);if(ground&&ground.z-closest.z>.025)add('buriedRoute',{...s,roadHeight:closest.z,ground:ground.z},ground.z-closest.z);if(Math.abs(closest.z-s.z)>.5)add('routeHeightMismatch',{...s,roadHeight:closest.z},Math.abs(closest.z-s.z));}
 if(process.env.ROAD_AUDIT_MATERIALS){const mats={};group.traverse(o=>{if(o.isMesh)for(const m of Array.isArray(o.material)?o.material:[o.material]){if(/road|street|asphalt|pavement/i.test(m.name))mats[m.name]={userData:m.userData,mesh:o.name};}});console.log(JSON.stringify(mats));}
 if(probe)console.log(JSON.stringify({probe,diagnostics}));
 const row={derivation,grounding,clearanceMs,activeRoads:[...activeRoads.values()],meshStamps,sourceSha256:lod.sha256,clearance,tileId:tile.id,level:lod.level,ms:performance.now()-start,stages,counts,issues,optionalDetailMissing:group.userData.optionalDetailMissing??[]};report.rows.push(row);
 const gs=new Set(),ms=new Set(),ts=new Set();group.traverse(o=>{if(o.isMesh){gs.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material]){ms.add(m);for(const v of Object.values(m))if(v?.isTexture)ts.add(v);}}});gs.forEach(g=>g.dispose());ms.forEach(m=>m.dispose());ts.forEach(t=>t.dispose());group.clear();
 if(report.rows.length%5===0){save();if(process.env.ROAD_AUDIT_EMIT)fs.writeFileSync(site+'/data/derived/town/road-ground-clearance-index.json',JSON.stringify(emitted));console.log(JSON.stringify({checked:report.rows.length,last:tile.id,counts}));}
}
report.summary={tiles:report.rows.length,counts:{}};for(const r of report.rows)for(const[k,v]of Object.entries(r.counts))report.summary.counts[k]=(report.summary.counts[k]??0)+v;save();console.log(JSON.stringify(report.summary));

if(process.env.ROAD_AUDIT_EMIT){const bytes=Buffer.from(JSON.stringify(emitted));fs.writeFileSync(site+'/data/derived/town/road-ground-clearance-index.json',bytes);console.log(JSON.stringify({emittedTiles:Object.keys(emitted.tiles).length,indexBytes:bytes.length,indexGzip:gzipSync(bytes).length,packetBytes:Object.values(emitted.tiles).flatMap(t=>Object.values(t.levels)).reduce((n,p)=>n+p.bytes,0),packetGzip:Object.values(emitted.tiles).flatMap(t=>Object.values(t.levels)).reduce((n,p)=>n+gzipSync(fs.readFileSync(site+'/public'+p.url)).length,0)}));}
