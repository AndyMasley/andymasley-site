// @vitest-environment node
import {describe,it,expect} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import {applyIndianRanchCanopy,buildIndianRanchCanopy,INDIAN_RANCH_CANOPY as row} from '../indian-ranch-canopy';
import {planDistanceSquared} from '../evidence-buildings';
import {tileAssemblySteps,type TileDetails} from '../tile-assembly';
import {excludeGrassPolygons,grassAllowed,type GrassMask} from '../grass';
import pinnedRelease from '../../../../data/derived/town/release.json';

const root=process.cwd(),release=JSON.parse(fs.readFileSync(path.join(root,'data/derived/town/release.json'),'utf8'));
const assets=path.join(root,'public/town-assets',release.directory),manifestBytes=fs.readFileSync(path.join(assets,'manifest.json'));
const hash=(b:Buffer|string)=>createHash('sha256').update(b).digest('hex');
const manifest=JSON.parse(manifestBytes.toString()),tile=manifest.tiles.find((t:{id:string})=>t.id===row.tileId);
function details(level:number):TileDetails{
  const index=(name:string)=>JSON.parse(fs.readFileSync(path.join(root,`data/derived/town/${name}-index.json`),'utf8'));
  const packet=(asset:{url:string;sha256?:string;bytes?:number}|undefined)=>{
    if(!asset)return undefined;const raw=fs.readFileSync(path.join(root,'public',asset.url));
    if(asset.sha256)expect(hash(raw)).toBe(asset.sha256);if(asset.bytes)expect(raw.length).toBe(asset.bytes);return JSON.parse(raw.toString());
  };
  const direct=(name:string)=>packet(index(name).tiles[row.tileId]);
  const perLevel=(name:string)=>packet(index(name).tiles[row.tileId]?.levels[level]);
  const homes=direct('residential-evidence'),roofs=direct('evidence-roofs');
  return{foundationWalls:direct('foundation-wall'),evidence:{buildings:homes?.buildings??[],roofs:roofs??[],failures:0},
    road:direct('road-finish')?.rows,terrain:perLevel('terrain-finish'),parking:packet(index('paved-surfaces').lotAssets[row.tileId]),
    additional:direct('additional-environment'),roadside:direct('roadside'),environmentGround:perLevel('environment-ground'),
    facilities:direct('environment-facilities'),roadMaterials:perLevel('road-materials'),streetCorners:direct('street-corners'),
    streetCornerGround:perLevel('street-corner-ground'),roadCurve:perLevel('road-curve'),roadDash:perLevel('road-dash'),propertyTerrain:perLevel('property-terrain')};
}
async function native(level:number){
  expect(hash(manifestBytes)).toBe(row.sourceManifestSha256);
  const lod=tile.lods.find((l:{level:number})=>l.level===level),raw=fs.readFileSync(path.join(assets,lod.url));
  expect(hash(raw)).toBe(row.levels[level].sha256);
  const loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  loader.register(()=>({name:'TEST_GEOMETRY_TEXTURE_PLACEHOLDER',loadTexture:async()=>new THREE.DataTexture(new Uint8Array([255,255,255,255]),1,1)}) as never);
  return(await loader.parseAsync(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength),'')).scene;
}
function dispose(group:THREE.Group){
  const gs=new Set<THREE.BufferGeometry>(),ms=new Set<THREE.Material>(),ts=new Set<THREE.Texture>();
  group.traverse(o=>{if(o instanceof THREE.Mesh){gs.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material]){ms.add(m);for(const v of Object.values(m))if(v instanceof THREE.Texture)ts.add(v);}}});
  gs.forEach(g=>g.dispose());ms.forEach(m=>m.dispose());ts.forEach(t=>t.dispose());
}
function signatures(group:THREE.Group){
  const selected:string[]=[],unselected:string[]=[];group.updateMatrixWorld(true);
  group.traverse(o=>{
    if(!(o instanceof THREE.Mesh))return;const g=o.geometry,p=g.getAttribute('position'),ix=g.index,count=ix?.count??p.count,mats=Array.isArray(o.material)?o.material:[o.material];
    for(const part of g.groups.length?g.groups:[{start:0,count,materialIndex:0}]){
      const m=mats[part.materialIndex??0];if(!m.name.startsWith('V2 inferred | '))continue;
      for(let i=part.start;i<Math.min(count,part.start+part.count);i+=3){
        const ids=[0,1,2].map(k=>ix?ix.getX(i+k):i+k),points=ids.map(id=>new THREE.Vector3().fromBufferAttribute(p,id).applyMatrix4(o.matrixWorld).add(new THREE.Vector3().fromArray(row.origin)));
        const center=points.reduce((a,b)=>a.add(b),new THREE.Vector3()).multiplyScalar(1/3);
        const output=center.y>=row.sourceBase-1&&center.y<=row.sourcePeak+12&&planDistanceSquared(row.outline,center.x,-center.z)<.85**2?selected:unselected;
        const values:unknown[]=[m.name];for(const[name,a]of Object.entries(g.attributes) as [string,THREE.BufferAttribute|THREE.InterleavedBufferAttribute][]){values.push(name);const getters=[a.getX,a.getY,a.getZ,a.getW];for(const id of ids)for(let k=0;k<a.itemSize;k++)values.push(getters[k].call(a,id));}
        output.push(hash(JSON.stringify(values)));
      }
    }
  });return{selected:selected.length,unselected:hash(JSON.stringify(unselected.sort()))};
}

describe('Indian Ranch source-registered open seating canopy',()=>{
  for(const level of[0,1,2])it(`replaces only the supported native canopy at LOD${level}`,async()=>{
    const group=await native(level),before=signatures(group),kept:{mesh:THREE.Mesh;geometry:THREE.BufferGeometry;material:THREE.Material|THREE.Material[]}[]=[];
    group.traverse(o=>{if(o instanceof THREE.Mesh&&!(Array.isArray(o.material)?o.material:[o.material]).some(m=>m.name.startsWith('V2 inferred | ')))kept.push({mesh:o,geometry:o.geometry,material:o.material});});
    expect(before.selected).toBeGreaterThan(0);
    const result=applyIndianRanchCanopy(group,row.tileId,row.origin,level,row.levels[level].sha256)!;
    expect(result.status).toBe('applied');expect(result.ids).toEqual([row.id]);expect(result.removedTriangles).toBe(before.selected);
    expect(signatures(group)).toEqual({selected:0,unselected:before.unselected});
    for(const k of kept){expect(k.mesh.geometry).toBe(k.geometry);expect(k.mesh.material).toBe(k.material);expect(k.mesh.parent).not.toBeNull();}
    expect(result.posts).toBe(27);expect(result.benchSegments).toBe(36);expect(result.triangles).toBeLessThan(3500);expect(result.meshes).toBeLessThan(9);
    expect(result.eave-result.groundRange[1]).toBeCloseTo(3.2,6);expect(applyIndianRanchCanopy(group,row.tileId,row.origin,level,row.levels[level].sha256)).toBe(result);
    const bounds=[480,665,525,712],size=180,data=new Uint8Array(size*size*4);for(let i=0;i<data.length;i+=4)data[i]=255;
    const mask:GrassMask={data,width:size,height:size,bounds,core:bounds};
    const excluded=excludeGrassPolygons(mask,group.userData.environmentGrassExclusions),checks=row.levels[level].benches.map(b=>b.center);
    for(const[x,n]of checks){expect(grassAllowed(mask,x,-n)).toBe(true);expect(grassAllowed(excluded,x,-n)).toBe(false);}
    expect(group.userData.environmentGrassExclusions).toHaveLength(row.levels[level].pad.length);
    dispose(group);
  });
  for(const level of[0,1,2])it(`also accepts native LOD${level} in current authoritative assembly order`,async()=>{
    const group=await native(level),results:Record<string,unknown>={};let before:ReturnType<typeof signatures>|undefined;
    for(const step of tileAssemblySteps(group,tile,level,details(level))){
      if(step.name==='indianRanchCanopy')before=signatures(group);
      results[step.name]=step.apply();
      if(step.name==='indianRanchCanopy'){
        expect((results[step.name] as {status:string}).status).toBe('applied');
        expect(signatures(group)).toEqual({selected:0,unselected:before!.unselected});
      }
    }
    expect(before?.selected).toBeGreaterThan(0);expect(group.userData.indianRanchCanopy.status).toBe('applied');
    expect(group.userData.optionalDetailMissing??[]).toEqual([]);dispose(group);
  });
  it('fails closed on stale source, wrong origin, unsupported LOD, absent ground or absent inferred body',async()=>{
    const group=await native(0),before=signatures(group);
    expect(applyIndianRanchCanopy(group,row.tileId,row.origin,0,'stale')?.status).toBe('source-mismatch');
    expect(applyIndianRanchCanopy(group,row.tileId,[0,0,0],0,row.levels[0].sha256)?.status).toBe('source-mismatch');
    expect(applyIndianRanchCanopy(group,row.tileId,row.origin,9,row.levels[0].sha256)?.status).toBe('source-mismatch');
    expect(signatures(group)).toEqual(before);
    const terrain:THREE.Mesh[]=[];group.traverse(o=>{if(o instanceof THREE.Mesh&&(Array.isArray(o.material)?o.material:[o.material]).some(m=>m.name.startsWith('Realism aerial')))terrain.push(o);});
    terrain.forEach(o=>o.visible=false); // Visibility alone must not erase physical support.
    expect(terrain.length).toBeGreaterThan(0);
    const detached=terrain.map(o=>({o,parent:o.parent!}));detached.forEach(({o})=>o.removeFromParent());
    expect(applyIndianRanchCanopy(group,row.tileId,row.origin,0,row.levels[0].sha256)?.status).toBe('no-support');expect(signatures(group)).toEqual(before);
    detached.forEach(({o,parent})=>parent.add(o));
    group.traverse(o=>{if(o instanceof THREE.Mesh)for(const m of Array.isArray(o.material)?o.material:[o.material])if(m.name.startsWith('V2 inferred | '))m.name='Protected reference';});
    expect(applyIndianRanchCanopy(group,row.tileId,row.origin,0,row.levels[0].sha256)?.status).toBe('no-source');dispose(group);
  });
  it('rejects neighbour-only release drift even when the owner tile SHA is unchanged',async()=>{
    const group=await native(0),before=signatures(group),saved=pinnedRelease.manifestSha256;
    try{
      pinnedRelease.manifestSha256='neighbour-terrain-changed';
      expect(applyIndianRanchCanopy(group,row.tileId,row.origin,0,row.levels[0].sha256)?.status).toBe('source-mismatch');
      expect(signatures(group)).toEqual(before);expect(group.userData.indianRanchCanopy).toBeUndefined();
    }finally{pinnedRelease.manifestSha256=saved;dispose(group);}
  });
  it('has one continuous upward roof over the concave outline and an open, finite interior at all LODs',()=>{
    expect(row.proof.carConflicts).toBe(0);expect(row.proof.roofCoverageErrorM2).toBeLessThan(.00001);
    for(const level of[0,1,2]){
      const built=buildIndianRanchCanopy(new THREE.Vector3(),level);built.group.updateMatrixWorld(true);
      const roofs=built.group.children.filter(o=>((o as THREE.Mesh).material as THREE.Material).userData.surfaceRole==='roof');
      for(const t of row.roof){const c=t.reduce((s,p)=>s.map((v,i)=>v+p[i]/3),[0,0,0]),hits=new THREE.Raycaster(new THREE.Vector3(c[0],80,-c[2]),new THREE.Vector3(0,-1,0)).intersectObjects(roofs);expect(hits.length).toBeGreaterThan(0);expect(hits[0].point.y).toBeCloseTo(row.levels[level].eave+c[1],3);}
      built.group.traverse(o=>{if(o instanceof THREE.Mesh){const m=o.material as THREE.MeshStandardMaterial;expect(['wall','glass','door','foundation']).not.toContain(m.userData.surfaceRole);expect(m.map).toBeNull();expect(o.geometry.getAttribute('position').array.every(Number.isFinite)).toBe(true);}});
      dispose(built.group);
    }
  });
});
