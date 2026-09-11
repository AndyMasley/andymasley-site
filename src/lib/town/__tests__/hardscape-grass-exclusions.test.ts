// @vitest-environment node
import {describe,it,expect,vi} from 'vitest';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import {Batch,applyCraftedFrontages,type Frame} from '../crafted-frontages';
import {applyParkingFinish,type ParkingLot} from '../parking-finish';
import {TownGrass,excludeGrassPolygons,grassAllowed,type GrassMask} from '../grass';
import {TownSurfaces} from '../surfaces';
import {registerHardscapeGrassExclusions,releaseHardscapeGrassExclusions} from '../hardscape-grass-exclusions';
import type {GroundSurfaces} from '../contracts';
import {tileAssemblySteps,type TileDetails} from '../tile-assembly';
import release from '../../../../data/derived/town/release.json';

type Ring=number[][];
const hash=(data:Buffer)=>createHash('sha256').update(data).digest('hex');
const geometryHash=(g:THREE.BufferGeometry)=>{const h=createHash('sha256');for(const a of Object.values(g.attributes))h.update(Buffer.from(a.array.buffer,a.array.byteOffset,a.array.byteLength));if(g.index)h.update(Buffer.from(g.index.array.buffer,g.index.array.byteOffset,g.index.array.byteLength));return h.digest('hex');};
function lawn(bounds:number[],size=256):GrassMask {const data=new Uint8Array(size*size*4);for(let i=0;i<data.length;i+=4)data[i]=255;return{data,width:size,height:size,bounds,core:bounds};}
const ringKey=(ring:Ring)=>ring.map(p=>p.join(',')).sort().join('|');
function meshRings(mesh:THREE.Mesh,origin:readonly number[]):Ring[]{const p=mesh.geometry.getAttribute('position'),ix=mesh.geometry.index,result:Ring[]=[];for(let i=0;i<(ix?.count??p.count);i+=3)result.push([0,1,2].map(k=>{const at=ix?.getX(i+k)??i+k;return[p.getX(at)+origin[0],-p.getZ(at)-origin[2]];}));return result;}
function dispose(group:THREE.Object3D){const gs=new Set<THREE.BufferGeometry>(),ms=new Set<THREE.Material>(),ts=new Set<THREE.Texture>();group.traverse(o=>{if(o instanceof THREE.Mesh){gs.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material]){ms.add(m);for(const v of Object.values(m))if(v instanceof THREE.Texture)ts.add(v);}}});gs.forEach(g=>g.dispose());ms.forEach(m=>m.dispose());ts.forEach(t=>t.dispose());}

describe('grass follows only accepted emitted hardscape',()=>{
 it('releases only its temporary triangles after successful raster registration and preserves the mask across quality changes',async()=>{
  const g=new THREE.Group(),terrain=new THREE.Mesh(new THREE.PlaneGeometry(20,20).rotateX(-Math.PI/2).translate(10,0,-10),new THREE.MeshStandardMaterial());terrain.name='terrain';g.add(terrain);g.updateMatrixWorld(true);
  const other=[[[16,16],[19,16],[16,19]]],owned=[[[3,3],[12,3],[3,12]],[[12,3],[12,12],[3,12]]];g.userData.environmentGrassExclusions=other;
  registerHardscapeGrassExclusions(g,owned);
  const mask=lawn([0,-20,20,0]),source=mask.data.slice(),definition:GroundSurfaces={grass:{color:{url:'g',bytes:1},normal:{url:'n',bytes:1},roughness:{url:'r',bytes:1},repeatM:1},masks:{t:{url:'mask',bytes:1,bounds:[0,-20,20,0]}}};
  let attempts=0;const surfaces=new TownSurfaces(definition,async()=>{if(!attempts++)throw Error('temporary mask load failure');const texture=new THREE.DataTexture(new Uint8Array(mask.data),mask.width,mask.height);texture.flipY=false;return texture;});
  const registration=vi.spyOn(TownGrass.prototype,'register'),signal=new AbortController().signal;
  try{
   await expect(surfaces.apply(g,'t',signal)).rejects.toThrow(/temporary/);expect(g.userData.environmentGrassExclusions).toEqual([...other,...owned]);expect(g.userData.hardscapeGrassExclusions.pendingTriangles).toBe(2);expect(registration).not.toHaveBeenCalled();
   await surfaces.apply(g,'t',signal);expect(registration).toHaveBeenCalledTimes(1);const passed=registration.mock.calls[0][2];
   expect(grassAllowed(passed,6,-6)).toBe(false);expect(grassAllowed(passed,15,-5)).toBe(true);expect(mask.data).toEqual(source);
   expect(g.userData.environmentGrassExclusions).toEqual(other);expect(g.userData.environmentGrassExclusions[0]).toBe(other[0]);expect(g.userData.hardscapeGrassExclusions).toEqual({pendingTriangles:0,numericBytes:0,releasedTriangles:2});
   const saved=passed.data.slice();for(const low of[false,true,false])surfaces.update([6,0,-6],low,0);expect(passed.data).toEqual(saved);expect(registration).toHaveBeenCalledTimes(1);
   const remaining=g.userData.environmentGrassExclusions;releaseHardscapeGrassExclusions(g);expect(g.userData.environmentGrassExclusions).toBe(remaining);
   await surfaces.apply(g,'t',signal);expect(registration).toHaveBeenCalledTimes(1);
  }finally{registration.mockRestore();surfaces.dispose();dispose(g);}
 });
 it('keeps temporary triangles when no readable grass mask has been registered',async()=>{
  const g=new THREE.Group(),terrain=new THREE.Mesh(new THREE.PlaneGeometry(2,2),new THREE.MeshStandardMaterial());terrain.name='terrain';g.add(terrain);
  const owned=[[[0,0],[1,0],[0,1]]];registerHardscapeGrassExclusions(g,owned);
  const definition:GroundSurfaces={grass:{color:{url:'g',bytes:1},normal:{url:'n',bytes:1},roughness:{url:'r',bytes:1},repeatM:1},masks:{t:{url:'mask',bytes:1,bounds:[0,0,2,2]}}};
  const surfaces=new TownSurfaces(definition,async()=>new THREE.Texture());
  await surfaces.apply(g,'t',new AbortController().signal);expect(g.userData.environmentGrassExclusions).toEqual(owned);expect(g.userData.hardscapeGrassExclusions.pendingTriangles).toBe(1);surfaces.dispose();dispose(g);
 });
 it.each([1,-1])('retains GPU geometry and captures only explicit ground polygons in reflected frame %i',sign=>{
  const origin=new THREE.Vector3(1024,12,-2048),f:Frame={structId:'owned',tileId:'t',start:[1029.231,2053.177],tangent:[.8,.6],outward:[-.6*sign,.8*sign]};
  const a=new Batch(origin,0),b=new Batch(origin,0),points=[[0,13,0],[0,13.7,5],[6,14.1,5],[6,13.3,0]];
  a.groundPolygon(f,'paving',points);b.polygon(f,'paving',points);
  // An unrelated paving face (e.g. an elevated deck) is not an exclusion.
  a.polygon(f,'paving',[[10,20,0],[10,20,2],[12,20,2]]);b.polygon(f,'paving',[[10,20,0],[10,20,2],[12,20,2]]);
  a.groundPolygon(f,'paving',[]);a.groundPolygon(f,'stone',points);b.polygon(f,'stone',points);
  const aa=a.finish(),bb=b.finish();expect(aa.triangles).toBe(bb.triangles);expect(aa.bytes).toBe(bb.bytes);expect(aa.group.children.length).toBe(bb.group.children.length);
  aa.group.children.forEach((m,i)=>expect(geometryHash((m as THREE.Mesh).geometry)).toBe(geometryHash((bb.group.children[i]as THREE.Mesh).geometry)));
  const paving=aa.group.children.find(o=>(o as THREE.Mesh<THREE.BufferGeometry,THREE.MeshStandardMaterial>).material.userData.surfaceRole==='paving')as THREE.Mesh;
  expect(a.groundExclusions.map(ringKey)).toEqual(meshRings(paving,origin.toArray()).slice(0,2).map(ringKey));
  expect(a.groundExclusions).toHaveLength(2);dispose(aa.group);dispose(bb.group);
 });
 it('does not publish exclusions when the exclusive source namespace is rejected',()=>{
  const g=new THREE.Group(),old=[[[1,1],[2,1],[1,2]]];g.userData.environmentGrassExclusions=old;
  expect(()=>applyCraftedFrontages(g,'-13_-5',[-3250,0,1250])).toThrow(/namespace missing/);
  expect(g.userData.environmentGrassExclusions).toBe(old);expect(g.children).toEqual([]);
 });
 it('clips parking exclusions to indexed transformed support and preserves real holes, unpaved ground, and paint',()=>{
  const origin:[number,number,number]=[100,10,-200],g=new THREE.Group();g.position.fromArray(origin);
  const geo=new THREE.PlaneGeometry(20,20,2,2).rotateX(-Math.PI/2),ground=new THREE.Mesh(geo,new THREE.MeshStandardMaterial());ground.name='terrain';ground.position.set(10,1,-10);g.add(ground);
  const outer:[number,number][]=[[100,200],[130,200],[130,230],[100,230],[100,200]],hole:[number,number][]=[[107,207],[113,207],[113,213],[107,213],[107,207]];
  const lot:ParkingLot={id:'registered',tileId:'t',center:[115,215],material:'asphalt',sourcePolygons:[[outer,hole]],polygons:[[outer,hole]],markingPolygons:[[outer,hole]],striping:'observed-present'};
  const old=[[[90,190],[91,190],[90,191]]],before=geometryHash(geo);g.userData.environmentGrassExclusions=old;
  const packet={version:1,tileId:'t',lots:[lot]},r=applyParkingFinish(g,'t',origin,packet),paving=g.getObjectByName('Finished parking | asphalt')as THREE.Mesh;
  expect(r.pavingTriangles).toBeGreaterThan(0);expect(r.bays).toBeGreaterThan(0);expect(geometryHash(geo)).toBe(before);expect(geo.index).not.toBeNull();
  const exclusions=g.userData.environmentGrassExclusions as Ring[];expect(exclusions.slice(1).map(ringKey)).toEqual(meshRings(paving,origin).map(ringKey));expect(exclusions[0]).toBe(old[0]);
  const mask=lawn([95,-235,135,-195]),data=mask.data.slice(),finished=excludeGrassPolygons(mask,exclusions);
  expect(grassAllowed(finished,104,-204)).toBe(false);expect(grassAllowed(finished,110,-210)).toBe(true); // actual polygon hole
  expect(grassAllowed(finished,125,-225)).toBe(true); // requested lot, but no rendered support
  expect(grassAllowed(finished,97,-198)).toBe(true);expect(mask.data).toEqual(data);
  const paint=g.getObjectByName('Finished parking | authored bays')as THREE.Mesh,paintHash=geometryHash(paint.geometry),children=g.children.slice();
  expect(applyParkingFinish(g,'t',origin,packet)).toBe(r);expect(g.children).toEqual(children);expect(g.userData.environmentGrassExclusions).toBe(exclusions);expect(geometryHash(paint.geometry)).toBe(paintHash);
  dispose(g);
 });
 it.each(['paved-unspecified','gravel'])('does not infer a full asphalt exclusion for %s or unsupported source packets',material=>{
  const g=new THREE.Group(),ground=new THREE.Mesh(new THREE.PlaneGeometry(20,20).rotateX(-Math.PI/2).translate(10,0,-10),new THREE.MeshStandardMaterial());ground.name='terrain';g.add(ground);
  const outer:[number,number][]=[[0,0],[20,0],[20,20],[0,20],[0,0]],lot:ParkingLot={id:'limited',tileId:'t',center:[10,10],material,sourcePolygons:[[outer]],polygons:[[outer]],markingPolygons:[[outer]],striping:'observed-present'};
  const packet={version:1,tileId:'t',lots:[lot]};expect(applyParkingFinish(g,'wrong',[0,0,0],packet).pavingTriangles).toBe(0);expect(g.userData.environmentGrassExclusions).toBeUndefined();
  expect(applyParkingFinish(g,'t',[0,0,0],packet).pavingTriangles).toBe(0);expect(g.userData.environmentGrassExclusions).toBeUndefined();dispose(g);
 });
});

const root=process.cwd(),base=`${root}/public/town-assets/${release.directory}`,manifestBytes=fs.readFileSync(`${base}/manifest.json`),manifest=JSON.parse(manifestBytes.toString()),tile=manifest.tiles.find((t:{id:string})=>t.id==='-13_-5');
function details(level:number):TileDetails{
 const index=(name:string)=>JSON.parse(fs.readFileSync(`${root}/data/derived/town/${name}-index.json`,'utf8'));
 const packet=(a:{url:string;sha256?:string}|undefined)=>{if(!a)return;const bytes=fs.readFileSync(`${root}/public/${a.url}`);if(a.sha256)expect(hash(bytes)).toBe(a.sha256);return JSON.parse(bytes.toString());};
 const direct=(name:string)=>packet(index(name).tiles[tile.id]),perLevel=(name:string)=>packet(index(name).tiles[tile.id]?.levels[level]);
 const homes=direct('residential-evidence'),roofs=direct('evidence-roofs');
 return{foundationWalls:direct('foundation-wall'),evidence:{buildings:homes?.buildings??[],roofs:roofs??[],failures:0},road:direct('road-finish')?.rows,terrain:perLevel('terrain-finish'),parking:packet(index('paved-surfaces').lotAssets[tile.id]),additional:direct('additional-environment'),roadside:direct('roadside'),environmentGround:perLevel('environment-ground'),facilities:direct('environment-facilities'),roadMaterials:perLevel('road-materials'),streetCorners:direct('street-corners'),streetCornerGround:perLevel('street-corner-ground'),roadCurve:perLevel('road-curve'),roadDash:perLevel('road-dash'),propertyTerrain:perLevel('property-terrain')};
}
it.each([0,1,2])('native School116 apron suppresses eligible lawn on exact emitted triangles at LOD%i',async level=>{
 expect(hash(manifestBytes)).toBe(release.manifestSha256);const lod=tile.lods.find((l:{level:number})=>l.level===level),bytes=fs.readFileSync(`${base}/${lod.url}`);expect(hash(bytes)).toBe(lod.sha256);
 const loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);loader.register(()=>({name:'NATIVE_GEOMETRY_TEXTURE_STUB',loadTexture:async()=>new THREE.DataTexture(new Uint8Array([255,255,255,255]),1,1)})as never);
 const group=(await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene;
 try{
  let countBefore=0,parkingBefore=0,added:Ring[]=[],parkingAdded:Ring[]=[],source:Map<THREE.BufferGeometry,string>|undefined,ownedIds:string[]=[];
  for(const step of tileAssemblySteps(group,tile,level,details(level))){
   if(step.name==='parking')parkingBefore=(group.userData.environmentGrassExclusions??[]).length;
   if(step.name==='craftedFrontages'){countBefore=(group.userData.environmentGrassExclusions??[]).length;source=new Map();group.traverse(o=>{if(o instanceof THREE.Mesh)source!.set(o.geometry,geometryHash(o.geometry));});}
   const report=step.apply();
   if(step.name==='parking')parkingAdded=(group.userData.environmentGrassExclusions??[]).slice(parkingBefore);
   if(step.name==='craftedFrontages'){
    added=(group.userData.environmentGrassExclusions as Ring[]).slice(countBefore);expect(added.length).toBeGreaterThan(0);
    for(const[g,h]of source!)expect(geometryHash(g)).toBe(h);
    const own=group.getObjectByName('Crafted buildings and frontages')!;const rendered=new Set<string>();
    own.traverse(o=>{if(o instanceof THREE.Mesh&&!Array.isArray(o.material)&&o.material.userData.surfaceRole==='paving'){meshRings(o,tile.origin).forEach(r=>rendered.add(ringKey(r)));ownedIds.push(...o.userData.sourceIds);}});
    for(const ring of added)expect(rendered.has(ringKey(ring))).toBe(true);
    expect(ownedIds).toContain('168151_866421');
    const mask=lawn([-3130,1150,-3080,1200]),finished=excludeGrassPolygons(mask,added);
    expect(grassAllowed(mask,-3098,1168)).toBe(true);expect(grassAllowed(finished,-3098,1168)).toBe(false);
    expect(grassAllowed(finished,-3085,1154)).toBe(true); // outside every emitted approach, remains lawn
    const old=group.userData.environmentGrassExclusions;expect(applyCraftedFrontages(group,tile.id,tile.origin,level)).toBe(report);expect(group.userData.environmentGrassExclusions).toBe(old);
   }
  }
  console.info(JSON.stringify({hardscapeGrassCensus:{tileId:tile.id,level,craftedGroundTriangles:added.length,craftedSources:[...new Set(ownedIds)],parkingLots:group.userData.parkingFinish.lots,parkingGroundTriangles:group.userData.parkingFinish.pavingTriangles,exclusionTriangles:group.userData.environmentGrassExclusions.length}}));
  if(process.env.WEBSTER_HARDSCAPE_PROFILE&&level===0){
   const mask=lawn([-3257.8125,992.1875,-2992.1875,1257.8125],272),all=group.userData.environmentGrassExclusions as Ring[],fresh=[...added,...parkingAdded],set=new Set(fresh),old=all.filter(t=>!set.has(t));
   const sample=(polygons:Ring[])=>{const times:number[]=[];excludeGrassPolygons(mask,polygons);for(let i=0;i<7;i++){const start=performance.now();excludeGrassPolygons(mask,polygons);times.push(performance.now()-start);}return{minMs:Math.min(...times),medianMs:times.sort((a,b)=>a-b)[3],maxMs:Math.max(...times)};};
   console.info(JSON.stringify({hardscapeGrassRaster:{tileId:tile.id,level,maskPixels:272*272,oldTriangles:old.length,newTriangles:fresh.length,numericBytes:fresh.length*6*8,old:sample(old),newOnly:sample(fresh),combined:sample(all)}}));
  }
 }finally{dispose(group);}
},20_000);
