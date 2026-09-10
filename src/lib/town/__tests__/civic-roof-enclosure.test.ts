// @vitest-environment node
import {describe,it,expect} from 'vitest';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import data from '../../../../data/derived/town/civic-roof-finish.json';
import release from '../../../../data/derived/town/release.json';
import {tileAssemblySteps,type TileDetails} from '../tile-assembly';
import {applyCivicRoofFinish} from '../civic-roof-finish';

const root=process.cwd(),base=`${root}/public/town-assets/${release.directory}`,manifestBytes=fs.readFileSync(`${base}/manifest.json`),manifest=JSON.parse(manifestBytes.toString()),tile=manifest.tiles.find((t:{id:string})=>t.id===data.tileId);
const hash=(s:Buffer|string)=>createHash('sha256').update(s).digest('hex');
function details(level:number):TileDetails{
 const index=(name:string)=>JSON.parse(fs.readFileSync(`${root}/data/derived/town/${name}-index.json`,'utf8'));
 const packet=(a:{url:string;sha256?:string}|undefined)=>{if(!a)return;const bytes=fs.readFileSync(`${root}/public/${a.url}`);if(a.sha256)expect(hash(bytes)).toBe(a.sha256);return JSON.parse(bytes.toString());};
 const direct=(name:string)=>packet(index(name).tiles[tile.id]),perLevel=(name:string)=>packet(index(name).tiles[tile.id]?.levels[level]);
 const homes=direct('residential-evidence'),roofs=direct('evidence-roofs');
 return{foundationWalls:direct('foundation-wall'),evidence:{buildings:homes?.buildings??[],roofs:roofs??[],failures:0},road:direct('road-finish')?.rows,terrain:perLevel('terrain-finish'),parking:packet(index('paved-surfaces').lotAssets[tile.id]),additional:direct('additional-environment'),roadside:direct('roadside'),environmentGround:perLevel('environment-ground'),facilities:direct('environment-facilities'),roadMaterials:perLevel('road-materials'),streetCorners:direct('street-corners'),streetCornerGround:perLevel('street-corner-ground'),roadCurve:perLevel('road-curve'),roadDash:perLevel('road-dash'),propertyTerrain:perLevel('property-terrain')};
}
async function native(level:number){
 expect(hash(manifestBytes)).toBe(data.sourceManifestSha256);const lod=tile.lods.find((l:{level:number})=>l.level===level),bytes=fs.readFileSync(`${base}/${lod.url}`);expect(hash(bytes)).toBe(data.lods[level].sha256);
 const loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);loader.register(()=>({name:'NATIVE_GEOMETRY_TEXTURE_STUB',loadTexture:async()=>new THREE.DataTexture(new Uint8Array([255,255,255,255]),1,1)})as never);
 return(await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene;
}
function dispose(group:THREE.Group){const gs=new Set<THREE.BufferGeometry>(),ms=new Set<THREE.Material>(),ts=new Set<THREE.Texture>();group.traverse(o=>{if(o instanceof THREE.Mesh){gs.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material]){ms.add(m);for(const v of Object.values(m))if(v instanceof THREE.Texture)ts.add(v);}}});gs.forEach(g=>g.dispose());ms.forEach(m=>m.dispose());ts.forEach(t=>t.dispose());}
function geometryHash(g:THREE.BufferGeometry){const h=createHash('sha256');for(const[name,a]of Object.entries(g.attributes)){h.update(JSON.stringify([name,a.itemSize,a.normalized]));h.update(Buffer.from(a.array.buffer,a.array.byteOffset,a.array.byteLength));}if(g.index)h.update(Buffer.from(g.index.array.buffer,g.index.array.byteOffset,g.index.array.byteLength));return h.digest('hex');}
function wallRays(group:THREE.Group){
 group.position.fromArray(tile.origin);group.updateMatrixWorld(true);const native:THREE.Mesh[]=[];group.traverse(o=>{if(o instanceof THREE.Mesh&&!o.userData.townCrafted&&o.parent?.name==='buildings')native.push(o);});
 const rows=data.enclosure.edges.map(edge=>{const dx=edge.b[0]-edge.a[0],dn=edge.b[1]-edge.a[1],width=Math.hypot(dx,dn),t=[dx/width,dn/width],n=[-dn/width,dx/width],hits:number[][]=[];
  for(const y of[52,53,55,57,58]){const distances:number[]=[];for(let i=0;i<13;i++){const u=(i+.5)*width/13,at=new THREE.Vector3(edge.a[0]+t[0]*u+n[0]*2,y,-edge.a[1]-t[1]*u-n[1]*2);const hit=new THREE.Raycaster(at,new THREE.Vector3(-n[0],0,n[1]),0,6).intersectObjects(native,false)[0];distances.push(hit?.distance??Infinity);}hits.push(distances);}return{id:edge.id,hits};});
 group.position.set(0,0,0);group.updateMatrixWorld(true);return rows;
}

describe('native school/auditorium roof-step enclosure',()=>{
 it.each([0,1,2])('seals the source height transition at LOD%i without changing protected source geometry or materials',async level=>{
  const group=await native(level),row=data.lods[level];let before:Map<THREE.Mesh,{geometry:THREE.BufferGeometry;material:THREE.Material|THREE.Material[];hash:string}>|undefined,sourceRoof:THREE.Mesh|undefined,oldRoof:THREE.BufferGeometry|undefined,originalBrick:THREE.Material|undefined;
  try{
   for(const step of tileAssemblySteps(group,tile,level,details(level))){
    if(step.name==='civicRoof'){
     sourceRoof=group.getObjectByName(data.meshName)as THREE.Mesh;oldRoof=sourceRoof.geometry;
     const wall=group.getObjectByName(data.enclosure.wallMeshName)as THREE.Mesh;originalBrick=(wall.material as THREE.Material[]).find(m=>m.name===data.enclosure.brickMaterial)!;expect(originalBrick).toBeDefined();
     before=new Map();group.traverse(o=>{if(o instanceof THREE.Mesh)before!.set(o,{geometry:o.geometry,material:o.material,hash:geometryHash(o.geometry)});});
    }
    const report=step.apply();
    if(step.name==='civicRoof'){
     expect((report as {status:string}).status).toBe('applied');expect((report as {enclosureTriangles:number}).enclosureTriangles).toBe(row.enclosure.triangles.length);
     for(const[mesh,snapshot]of before!){expect(geometryHash(snapshot.geometry)).toBe(snapshot.hash);if(mesh!==sourceRoof){expect(mesh.geometry).toBe(snapshot.geometry);expect(mesh.material).toBe(snapshot.material);}}
     const g=sourceRoof!.geometry,m=sourceRoof!.material as THREE.MeshStandardMaterial[];
     expect(m[2]).toBe(originalBrick);expect(m[2].vertexColors).toBe(false);expect(m[2].map).toBeNull();
     // Compare every unchanged source attribute value in source face order.
     // Source roof UVs/normals remain exact even though the target is unindexed.
     const removed=new Set<number>();for(const[a,b]of row.ranges)for(let f=a;f<=b;f++)removed.add(f);
     for(const[name,a]of Object.entries(oldRoof!.attributes)){
      const expected:number[]=[],getters=[a.getX,a.getY,a.getZ,a.getW];for(let face=0;face<row.totalTriangles;face++)if(!removed.has(face))for(let k=0;k<3;k++){const id=oldRoof!.index?oldRoof!.index.getX(face*3+k):face*3+k;for(let c=0;c<a.itemSize;c++)expected.push(getters[c].call(a,id));}
      const values=new Float32Array(expected),actual=g.getAttribute(name).array;
      expect(hash(Buffer.from(actual.buffer,actual.byteOffset,values.byteLength))).toBe(hash(Buffer.from(values.buffer)));
     }
     const closure=g.groups.find(p=>p.materialIndex===2)!,p=g.getAttribute('position'),n=g.getAttribute('normal');let area=0,minWinding=1;
     for(let i=closure.start;i<closure.start+closure.count;i+=3){const[a,b,c]=[0,1,2].map(k=>new THREE.Vector3().fromBufferAttribute(p,i+k)),cross=b.sub(a).cross(c.sub(a));expect(cross.lengthSq()).toBeGreaterThan(1e-16);area+=cross.length()/2;minWinding=Math.min(minWinding,cross.normalize().dot(new THREE.Vector3().fromBufferAttribute(n,i)));}
     expect(minWinding).toBeGreaterThan(.99);expect(area).toBeCloseTo(row.enclosure.area,2);expect(closure.count/3).toBeLessThan(200);
     expect(wallRays(group).every(r=>r.hits.every(h=>h.every(d=>Math.abs(d-2)<.004)))).toBe(true);
    }
   }
   expect(group.userData.civicRoofFinish.enclosureTriangles).toBeGreaterThan(0);
   expect(group.userData.civicDetails.windows).toBe(221);expect(group.userData.civicDetails.frames).toBe(16);
   expect(wallRays(group).every(r=>r.hits.every(h=>h.every(Number.isFinite)))).toBe(true);
   expect(group.userData.optionalDetailMissing??[]).toEqual([]);
   expect(applyCivicRoofFinish(group,data.tileId,level,row.sha256)).toBe(group.userData.civicRoofFinish);
   expect(applyCivicRoofFinish(group,data.tileId,level,'stale')?.status).toBe('source-mismatch');
  }finally{dispose(group);}
 });
});
