/** Extract the exact road-stage inputs, then generate the bounded Lake packet. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { build } from 'esbuild';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

const site=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const out=process.env.ROAD_CURVE_WORK??'/private/tmp/webster-finished-game/road-curves';fs.mkdirSync(out,{recursive:true});
const read=p=>JSON.parse(fs.readFileSync(p));
const release=read(site+'/data/derived/town/release.json'),base=site+'/public/town-assets/'+release.directory+'/';
const manifest=read(base+'manifest.json'),tile=manifest.tiles.find(t=>t.id==='6_-14');
const imports=['road-finish','road-material-finish','terrain-finish','environment-ground','road-curve-finish','street-geometry'];
const results=[];
fs.writeFileSync(out+'/entry.ts',imports.map(p=>`export * from '${site}/src/lib/town/${p}';`).join('\n'));
await build({entryPoints:[out+'/entry.ts'],outfile:out+'/api.mjs',bundle:true,format:'esm',platform:'node',logLevel:'silent',plugins:[{name:'shared-three',setup(b){b.onResolve({filter:/^three$/},()=>({path:fileURLToPath(import.meta.resolve('three')),external:true}))}}]});
const api=await import(pathToFileURL(out+'/api.mjs'));
const loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
loader.register(()=>({name:'LOCAL_TEXTURE_STUB',loadTexture(){return Promise.resolve(new THREE.DataTexture(new Uint8Array([255,255,255,255]),1,1))}}));
const paintIndex=read(site+'/data/derived/town/road-finish-index.json');
const asset=p=>p?read(site+'/public'+p.url):undefined;
for(const lod of tile.lods){
 const b=fs.readFileSync(base+lod.url),scene=(await loader.parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),pathToFileURL(path.dirname(base+lod.url)+'/').href)).scene;
 api.applyTerrainFinish(scene,tile.id,tile.origin,lod.level,asset(api.terrainFinishAsset(tile.id,lod.level)));
 api.applyEnvironmentGround(scene,tile.id,tile.origin,lod.level,asset(api.environmentGroundAsset(tile.id,lod.level)));
 api.applyRoadFinish(scene,tile.id,tile.origin,lod.level,asset(paintIndex.tiles[tile.id])?.rows??[]);
 api.applyRoadMaterialFinish(scene,tile.id,tile.origin,lod.level,lod.sha256,asset(api.roadMaterialAsset(tile.id,lod.level)));
 const packet=asset(api.roadCurveAsset(tile.id,lod.level));
 assert.ok(api.validRoadCurvePacket(packet,tile.id,lod.level));
 const sourceMeshes=[];scene.traverse(o=>{if(o.isMesh)sourceMeshes.push([o,o.geometry,o.material]);});
 assert.equal(api.applyRoadCurveFinish(scene,tile.id,tile.origin,lod.level,'0'.repeat(64),packet).rejected,true);
 assert.ok(sourceMeshes.every(([o,g,m])=>o.geometry===g&&o.material===m));
 const wrong=structuredClone(packet);wrong.targets[0].geometryStamp='00000000';assert.equal(api.applyRoadCurveFinish(scene,tile.id,tile.origin,lod.level,lod.sha256,wrong).rejected,true);
 assert.ok(sourceMeshes.every(([o,g,m])=>o.geometry===g&&o.material===m));
 const beforeRoad=packet.targets.map(t=>{const mesh=sourceMeshes.find(([o])=>o.name===t.name&&o.parent?.name===t.parent)[0],g=mesh.geometry,n=g.index?.count??g.getAttribute('position').count,removed=new Set(t.remove);return{mesh,attributes:{...g.attributes},material:mesh.material,expected:Array.from({length:n},(_,i)=>i).filter(i=>!removed.has(Math.floor(i/3))).map(i=>g.index?.getX(i)??i)};});
 const began=performance.now(),result=api.applyRoadCurveFinish(scene,tile.id,tile.origin,lod.level,lod.sha256,packet);assert.equal(result.applied,true,JSON.stringify(result));
 const ms=performance.now()-began,children=scene.children.length;
 assert.equal(api.applyRoadCurveFinish(scene,tile.id,tile.origin,lod.level,lod.sha256,packet),result);assert.equal(scene.children.length,children);
 for(const {mesh,attributes,material,expected}of beforeRoad){assert.equal(mesh.material,material);for(const[name,a]of Object.entries(attributes))assert.equal(mesh.geometry.getAttribute(name),a);assert.deepEqual(Array.from(mesh.geometry.index.array),expected);}
 let tested=0;scene.traverse(o=>{if(!o.isMesh||!o.userData.roadCurveKind)return;const p=o.geometry.getAttribute('position'),n=o.geometry.getAttribute('normal');for(let i=0;i<p.count;i+=3){const a=new THREE.Vector3().fromBufferAttribute(p,i),b=new THREE.Vector3().fromBufferAttribute(p,i+1),c=new THREE.Vector3().fromBufferAttribute(p,i+2),cross=b.sub(a).cross(c.sub(a));assert.ok(cross.length()>1e-9);assert.ok(cross.y>0);cross.normalize();for(let k=0;k<3;k++)assert.ok(cross.dot(new THREE.Vector3().fromBufferAttribute(n,i+k))>.99999);tested++;}});
 results.push({level:lod.level,ms,tested,...result});
 api.applyStreetGeometry(scene);
 const meshes=[],point=new THREE.Vector3();scene.updateMatrixWorld(true);
 scene.traverse(o=>{
  if(!o.isMesh)return;const g=o.geometry,a=g.getAttribute('position');if(!a)return;
  const category=o.userData.roadCurveKind?'curve_'+o.userData.roadCurveKind:o.name==='roads'||o.parent?.name==='roads'?'roads':/^terrain(?:\b|_)/.test(o.name)?'terrain':o.name==='water'?'water':o.name.startsWith('streetscape')||o.parent?.name==='streetscape'?'streetscape':null;if(!category)return;
  const positions=Array.from({length:a.count},(_,i)=>{point.fromBufferAttribute(a,i).applyMatrix4(o.matrixWorld);return[point.x+tile.origin[0],point.y+tile.origin[1],point.z+tile.origin[2]]});
  const materials=(Array.isArray(o.material)?o.material:[o.material]).map(m=>m.name),uv=g.getAttribute('uv');
  meshes.push({name:o.name,parent:o.parent?.name??'',category,geometryStamp:api.terrainGeometryStamp(g),positions,index:g.index?Array.from(g.index.array):null,groups:g.groups,materials,uv:uv?Array.from({length:uv.count},(_,i)=>[uv.getX(i),uv.getY(i)]):null});
 });
 fs.writeFileSync(`${out}/output-${lod.level}.json.gz`,gzipSync(JSON.stringify({tileId:tile.id,origin:tile.origin,sourceManifestSha256:release.manifestSha256,sourceSha256:lod.sha256,level:lod.level,meshes})));
 const geometries=new Set(),materials=new Set();scene.traverse(o=>{if(o.isMesh){geometries.add(o.geometry);(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>materials.add(m))}});geometries.forEach(g=>g.dispose());materials.forEach(m=>{for(const v of Object.values(m))if(v?.isTexture)v.dispose();m.dispose()});
}
fs.writeFileSync(out+'/native-report.json',JSON.stringify({passed:true,results},null,2));console.log(JSON.stringify(results,null,2));
