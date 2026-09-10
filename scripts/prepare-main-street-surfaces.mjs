/** Compile a bounded material derivative; retained positions are never moved. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { gunzipSync, gzipSync } from 'node:zlib';
import { build } from 'esbuild';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const work = process.env.WEBSTER_MAIN_STREET_WORK || '/private/tmp/webster-civic-corridor-diagnosis';
fs.mkdirSync(work, { recursive: true });
const read = p => JSON.parse(fs.readFileSync(p)), hash = b => createHash('sha256').update(b).digest('hex');
const sourcePath = process.env.WEBSTER_STREETSCAPE_FEATURES || '/Users/andy/Documents/New project/webster-blender/realism/streetscape_features.json.gz';
const sourceRaw = fs.readFileSync(sourcePath), features = JSON.parse(gunzipSync(sourceRaw));
const networkPath = 'public/town-finish/v1/network/network.0d0d1de4c3bae697.json.gz';
const networkRaw = fs.readFileSync(path.join(root, networkPath)), network = JSON.parse(gunzipSync(networkRaw)).network;
const release = read(path.join(root, 'data/derived/town/release.json'));
const base = path.join(root, 'public/town-assets', release.directory), manifestRaw = fs.readFileSync(path.join(base, 'manifest.json'));
if (hash(manifestRaw) !== release.manifestSha256) throw Error('Source manifest differs');
const manifest = JSON.parse(manifestRaw), tile = manifest.tiles.find(t => t.id === '-12_-4');
const physicalIds = [1475, 1356], roadIndex = read(path.join(root, 'data/derived/town/road-materials-index.json'));
const cornerIndex=read(path.join(root,'data/derived/town/street-corners-index.json')),cornerRef=cornerIndex.tiles[tile.id];
const cornerRaw=fs.readFileSync(path.join(root,'public'+cornerRef.url)),cornerPacket=JSON.parse(cornerRaw);
if(hash(cornerRaw)!==cornerRef.sha256)throw Error('Corner packet differs');
const cornerFeatureIds=['junction-67-apron-23','junction-67-apron-24','junction-67-apron-25','junction-67-apron-26'];
const cornerFaces=new Set();let cornerFaceCount=0;
for(const feature of cornerPacket.features.filter(f=>f.kind==='apron')){
  if(cornerFeatureIds.includes(feature.id))for(let i=0;i<feature.triangles.length;i++)cornerFaces.add(cornerFaceCount+i);
  cornerFaceCount+=feature.triangles.length;
}
if(cornerFaces.size!==411||cornerPacket.features.filter(f=>cornerFeatureIds.includes(f.id)).length!==4)throw Error('Corner feature source changed');
const bundle = path.join(work, 'main-source-predecessors.mjs');
await build({ stdin: { contents: `export {applyRoadMaterialFinish} from ${JSON.stringify(root+'/src/lib/town/road-material-finish.ts')}; export {applyStreetCorners} from ${JSON.stringify(root+'/src/lib/town/street-corners.ts')}; export {terrainGeometryStamp} from ${JSON.stringify(root+'/src/lib/town/terrain-finish.ts')};`, resolveDir: root }, outfile: bundle, bundle: true, platform: 'node', format: 'esm', plugins: [{ name: 'shared-three', setup(b) { b.onResolve({filter:/^three$/}, () => ({path:fileURLToPath(import.meta.resolve('three')),external:true})); } }], logLevel: 'silent' });
const api = await import(pathToFileURL(bundle).href);
const decode = packed => { const p = [0,0,0], out=[]; for(let i=0;i<packed.length;i+=3){for(let k=0;k<3;k++)p[k]+=packed[i+k];out.push(p.map(v=>v/10000));}return out; };
let station = 0;
const paths = physicalIds.map(id => {
  const edge = network.edges.find(e => e.physical_id === id), points = decode(edge.points), at=[station];
  for(let i=1;i<points.length;i++)at.push(at[i-1]+Math.hypot(points[i][0]-points[i-1][0],points[i][1]-points[i-1][1]));
  station=at.at(-1);return {id,edge,points,at};
});
function project(p, route) {
  let best={distance:Infinity,station:0};
  for(const row of route) for(let i=0;i+1<row.points.length;i++){
    const a=row.points[i],b=row.points[i+1],x=b[0]-a[0],y=b[1]-a[1],d=x*x+y*y,t=Math.max(0,Math.min(1,((p[0]-a[0])*x+(p[1]-a[1])*y)/d));
    const distance=Math.hypot(p[0]-a[0]-x*t,p[1]-a[1]-y*t);
    if(distance<best.distance)best={distance,station:row.at[i]+Math.sqrt(d)*t};
  }return best;
}
function ribbonTriangles(row) {
  const vertices=row.points.map((p,i)=>{
    const a=row.points[Math.max(0,i-1)],b=row.points[Math.min(row.points.length-1,i+1)],dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy),n=[-dy/length,dx/length];
    return [-1,1].map(s=>[p[0]+s*n[0]*row.edge.width_m/2,p[1]+s*n[1]*row.edge.width_m/2,p[2]]);
  });
  return vertices.slice(1).flatMap((_,i)=>[[vertices[i][0],vertices[i+1][0],vertices[i+1][1]],[vertices[i][0],vertices[i+1][1],vertices[i][1]]]);
}
const expected = paths.flatMap(ribbonTriangles);
const junctionPhysicalIds=[44,243],junctionFadeM=[7.7,12];
const junctionPaths=junctionPhysicalIds.map(id=>{const edge=network.edges.find(e=>e.physical_id===id);if(edge.from!==67&&edge.to!==67)throw Error('Junction source changed');return{edge,points:decode(edge.points)};});
// Side-road ribbons can sit above Main in the junction. Qualify those exact
// source triangles too, with a bounded lateral reflectance fade at the mouth.
const junctionExpected=junctionPaths.flatMap(ribbonTriangles).filter(t=>Math.min(...t.map(p=>project(p,paths).distance))<junctionFadeM[1]);
const close = (a,b) => Math.hypot(...a.map((v,k)=>v-b[k])) < .001;
const sameTriangle = (a,b) => a.every(p=>b.some(q=>close(p,q)));
const allPanels = features.map((f,i)=>({...f,row:i})).filter(f=>f.kind==='sidewalk'&&physicalIds.includes(f.physical_id));
const panels = allPanels.filter(f=>f.curb_inventory&&!f.lowered_access_inferred);
function panelCoordinates(p, panel) {
  const ring=panel.footprint, right=panel.side==='right_along_edge',a=ring[right?3:0],b=ring[right?2:1],outer=ring[right?0:3];
  const dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy),nx=(outer[0]-a[0])/panel.inventory_width_m,ny=(outer[1]-a[1])/panel.inventory_width_m;
  const near=ring.slice(0,4).findIndex(q=>Math.hypot(q[0]-p[0],q[1]-p[1])<.001);
  const across=near<0?(p[0]-a[0])*nx+(p[1]-a[1])*ny:(right?near<2:near>1)?panel.inventory_width_m:0;
  return [project(p,paths).station,across,(p[0]-a[0])*dx/length+(p[1]-a[1])*dy/length,length];
}
const inPanel = (p,f) => f.footprint.some(q=>Math.hypot(q[0]-p[0],q[1]-p[1])<.001)&&p[2]>=f.min_z-.001&&p[2]<=f.max_z+.001;
const aprons=allPanels.filter(f=>f.aerial_informed_parking_offset_m>0).map(f=>{
  const r=f.footprint,right=f.side==='right_along_edge',a=r[right?3:0],b=r[right?2:1],oa=r[right?0:3],ob=r[right?1:2],dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy),forward=[dx/length,dy/length];
  const da=[oa[0]-a[0],oa[1]-a[1]],db=[ob[0]-b[0],ob[1]-b[1]],la=Math.hypot(...da),lb=Math.hypot(...db),width=f.aerial_informed_parking_offset_m+.31;
  const q=[a.map((v,k)=>v-da[k]*width/la),b.map((v,k)=>v-db[k]*width/lb),[...b],[...a]];
  return q.map((p,i)=>p.map((v,k)=>v+forward[k]*([0,3].includes(i)?-.002:.002)));
});
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
loader.register(()=>({name:'TOPOLOGY_ONLY',loadTexture:async()=>new THREE.DataTexture(new Uint8Array([255,255,255,255]),1,1)}));
const levels=[];
for(const lod of tile.lods){
  const raw=fs.readFileSync(path.join(base,lod.url));if(hash(raw)!==lod.sha256)throw Error('Source tile differs');
  const scene=(await loader.parseAsync(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength),'')).scene;
  const ref=roadIndex.tiles[tile.id].levels[lod.level],packet=read(path.join(root,'public'+ref.url));
  if(api.applyRoadMaterialFinish(scene,tile.id,tile.origin,lod.level,lod.sha256,packet)?.rejectedMeshes)throw Error('Road predecessor rejected');
  const cornerReport=api.applyStreetCorners(scene,tile.id,tile.origin,lod.level,lod.sha256,cornerPacket);if(cornerReport.rejected)throw Error('Corner predecessor rejected');
  scene.updateMatrixWorld(true);const meshes=[],matched=new Set(),matchedJunction=new Set(),matchedPanels=new Set();
  scene.traverse(mesh=>{
    if(!(mesh instanceof THREE.Mesh))return;
    const ownedCorner=mesh.name==='finished_street_corner_apron'&&mesh.userData.townCrafted===true&&mesh.userData.category==='roads';
    if(!ownedCorner&&!['roads','streetscape'].includes(mesh.parent?.name))return;
    const g=mesh.geometry,p=g.getAttribute('position'),count=g.index?.count??p.count,materials=Array.isArray(mesh.material)?mesh.material:[mesh.material],assignments=[];
    for(const part of g.groups.length?g.groups:[{start:0,count,materialIndex:0}]){
      const material=materials[part.materialIndex??0],name=material.name,isRoad=name==='Drive road | asphalt',isWalk=/^Streetscape \| (warm|cool|repaired) sidewalk concrete$/.test(name),isApron=name==='Streetscape | parking apron asphalt',isCorner=ownedCorner&&name==='Finished street corner | asphalt apron'&&material.userData.townRoadSurfaceType===6;
      if(!isRoad&&!isWalk&&!isApron&&!isCorner)continue;
      for(let i=part.start;i<part.start+part.count;i+=3){
        const ids=[0,1,2].map(k=>g.index?.getX(i+k)??i+k),points=ids.map(id=>{const v=new THREE.Vector3().fromBufferAttribute(p,id).applyMatrix4(mesh.matrixWorld);return[v.x+tile.origin[0],-v.z-tile.origin[2],v.y+tile.origin[1]];});
        if(isCorner){if(cornerFaces.has(i/3))assignments.push([i/3,'asphalt',...points.flatMap(v=>{const q=project(v,paths);return[+q.station.toFixed(5),+q.distance.toFixed(5)];})]);continue;}
        const [a,b,c]=points,cross=(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
        if(Math.abs(cross)<1e-6)continue;
        if(isRoad){
          const hit=expected.findIndex(t=>sameTriangle(points,t));
          if(hit>=0){matched.add(hit);assignments.push([i/3,'asphalt',...points.flatMap(v=>[+project(v,paths).station.toFixed(5),0])]);}
          else{const crossing=junctionExpected.findIndex(t=>sameTriangle(points,t));if(crossing>=0){matchedJunction.add(crossing);assignments.push([i/3,'asphalt',...points.flatMap(v=>{const q=project(v,paths);return[+q.station.toFixed(5),+q.distance.toFixed(5)];})]);}}
        }
        else if(isWalk&&cross>0){
          const f=panels.find(f=>points.every(p=>inPanel(p,f)));if(f){matchedPanels.add(f.row);assignments.push([i/3,'pavers',...points.flatMap(v=>panelCoordinates(v,f).slice(0,2).map(x=>+x.toFixed(5)))]);}
        }else if(isApron){
          // Only the parallel apron attached to a retained qualifying panel.
          if(aprons.some(r=>points.every(p=>r.some(q=>Math.hypot(p[0]-q[0],p[1]-q[1])<.001))))assignments.push([i/3,'asphalt',...points.flatMap(v=>[+project(v,paths).station.toFixed(5),0])]);
        }
      }
    }
    if(assignments.length)meshes.push({name:mesh.name,parent:mesh.parent.name,...(ownedCorner?{ownership:'street-corner-apron'}:{}),geometryStamp:api.terrainGeometryStamp(g),positions:p.count,triangles:count/3,materials:materials.map(m=>m.name),assignments});
  });
  if(meshes.find(m=>m.ownership==='street-corner-apron')?.assignments.length!==cornerFaces.size)throw Error('Incomplete corner match');
  if(matched.size!==expected.length)throw Error(`Incomplete road match ${matched.size}/${expected.length}`);
  if(matchedJunction.size!==junctionExpected.length)throw Error(`Incomplete junction match ${matchedJunction.size}/${junctionExpected.length}`);
  if(matchedPanels.size!==panels.length){fs.writeFileSync(work+'/unmatched-panels.json',JSON.stringify(panels.filter(f=>!matchedPanels.has(f.row))));throw Error(`Incomplete sidewalk match ${matchedPanels.size}/${panels.length}`);}
  levels.push({level:lod.level,sourceSha256:lod.sha256,meshes});
}
if(levels.some(l=>JSON.stringify(l.meshes)!==JSON.stringify(levels[0].meshes)))throw Error('LOD selectors diverged; retain separate qualified records');
const photoPath='/Users/andy/Desktop/Screenshot 2026-09-09 at 11.59.59 PM.png';
const photo={filename:path.basename(photoPath),sha256:hash(fs.readFileSync(photoPath)),label:'User-supplied Main Street reference',received:'2026-09-10',captureDate:'Unknown underlying Street View capture date'};
const catalog={version:1,reference:photo,sourceManifestSha256:release.manifestSha256,tileId:tile.id,origin:tile.origin,sourceNetwork:{path:networkPath,sha256:hash(networkRaw)},sourcePanels:{path:'realism/streetscape_features.json.gz',sha256:hash(sourceRaw)},sourceCorners:{url:cornerRef.url,sha256:hash(cornerRaw),featureIds:cornerFeatureIds},expectedCornerTriangles:cornerFaces.size,physicalIds,junctionNode:67,junctionPhysicalIds,junctionFadeM,expectedJunctionTriangles:junctionExpected.length,edgeIds:paths.map(p=>p.edge.id),lengthM:station,paverBandM:[.17,.59],sourceObservation:'Photo-matched Main Street approach through the civic block: lighter weathered gray asphalt, narrow red curbside paver bands and pale concrete walking centers. The screenshot is supplied by the user; capture date is unverified.',inference:'Authored gray reflectance and .42m fired-red paver band; nominal .2032 by .1016m running bond. Only retained non-ramp sidewalk tops and exact corridor road triangles qualify. Only the junction 67 Church/Davis ribbon overlap and four registered asphalt corner aprons share gray, fading back to original side-street asphalt between 7.7 and 12m from Main. Native granite curbs, paint, corner geometry and the unregistered 248 Main forecourt remain intact.',panelCount:panels.length,expectedRoadTriangles:expected.length,meshes:levels[0].meshes,levels:levels.map(({level,sourceSha256})=>({level,sourceSha256}))};
const output=path.join(root,'data/derived/town/main-street-surfaces.json'),raw=JSON.stringify(catalog)+'\n';fs.writeFileSync(output,raw);
console.log(JSON.stringify({bytes:Buffer.byteLength(raw),gzipBytes:gzipSync(raw).length,panels:panels.length,expectedRoadTriangles:expected.length,levels:levels.map(l=>({level:l.level,meshes:l.meshes.map(m=>[m.name,m.assignments.length])}))}));
