// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import release from '../../../../data/derived/town/release.json';
import catalog from '../../../../data/derived/town/main-street-surfaces.json';
import { applyMainStreetSurfaces } from '../main-street-surfaces';
import { applyRoadMaterialFinish } from '../road-material-finish';
import { applyStreetCorners } from '../street-corners';
import { applyArtMaterial } from '../art-materials';
import { tileAssemblySteps, type TileDetails } from '../tile-assembly';
import type { TownTile, V3 } from '../contracts';

const dir=`public/town-assets/${release.directory}`,manifestRaw=fs.readFileSync(`${dir}/manifest.json`),manifest=JSON.parse(manifestRaw.toString());
const tile:TownTile=manifest.tiles.find((t:TownTile)=>t.id===catalog.tileId),origin=catalog.origin as V3;
const hash=(b:Buffer|string)=>createHash('sha256').update(b).digest('hex');
const read=(p:string)=>JSON.parse(fs.readFileSync(p,'utf8'));
const packet=(r:{url:string;sha256?:string}|undefined)=>{if(!r)return;const bytes=fs.readFileSync('public'+r.url);if(r.sha256)expect(hash(bytes)).toBe(r.sha256);return JSON.parse(bytes.toString());};
function details(level:number):TileDetails{
  const index=(name:string)=>read(`data/derived/town/${name}-index.json`),direct=(name:string)=>packet(index(name).tiles[tile.id]),perLevel=(name:string)=>packet(index(name).tiles[tile.id]?.levels[level]);
  const homes=direct('residential-evidence'),roofs=direct('evidence-roofs');
  return{foundationWalls:direct('foundation-wall'),evidence:{buildings:homes?.buildings??[],roofs:roofs??[],failures:0},road:direct('road-finish')?.rows,terrain:perLevel('terrain-finish'),parking:packet(index('paved-surfaces').lotAssets[tile.id]),additional:direct('additional-environment'),roadside:direct('roadside'),environmentGround:perLevel('environment-ground'),facilities:direct('environment-facilities'),roadMaterials:perLevel('road-materials'),streetCorners:direct('street-corners'),streetCornerGround:perLevel('street-corner-ground'),roadCurve:perLevel('road-curve'),roadDash:perLevel('road-dash'),propertyTerrain:perLevel('property-terrain')};
}
async function native(level:number){
  expect(hash(manifestRaw)).toBe(catalog.sourceManifestSha256);const lod=tile.lods.find(l=>l.level===level)!,raw=fs.readFileSync(`${dir}/${lod.url}`);expect(hash(raw)).toBe(catalog.levels[level].sourceSha256);
  const loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);loader.register(()=>({name:'TOPOLOGY_ONLY',loadTexture:async()=>new THREE.DataTexture(new Uint8Array([255,255,255,255]),1,1)})as never);
  return(await loader.parseAsync(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength),'')).scene;
}
function resources(group:THREE.Group){const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>(),textures=new Set<THREE.Texture>();group.traverse(o=>{if(o instanceof THREE.Mesh){geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material]){materials.add(m);for(const v of Object.values(m))if(v instanceof THREE.Texture)textures.add(v);}}});return{geometries,materials,textures};}
function dispose(group:THREE.Group){const r=resources(group);r.geometries.forEach(g=>g.dispose());r.materials.forEach(m=>m.dispose());r.textures.forEach(t=>t.dispose());}
const attributeHash=(a:THREE.BufferAttribute|THREE.InterleavedBufferAttribute)=>hash(Buffer.from(a.array.buffer,a.array.byteOffset,a.array.byteLength));
function faces(g:THREE.BufferGeometry){const out:string[]=[];for(let i=0;i<(g.index?.count??g.getAttribute('position').count);i+=3)out.push([0,1,2].map(k=>g.index?.getX(i+k)??i+k).join(','));return out.sort();}
function compile(m:THREE.MeshStandardMaterial){const standard=THREE.ShaderLib.standard,s={vertexShader:standard.vertexShader,fragmentShader:standard.fragmentShader,uniforms:THREE.UniformsUtils.clone(standard.uniforms)};m.onBeforeCompile(s as Parameters<THREE.Material['onBeforeCompile']>[0],{}as THREE.WebGLRenderer);return s;}

describe('Photo-informed civic Main Street surfaces',()=>{
  it.each([0,1,2])('preserves all native geometry, paint and unrelated materials through full assembly at LOD%i',async level=>{
    const group=await native(level),steps=tileAssemblySteps(group,tile,level,details(level));let applied=false;
    expect(steps.some(s=>s.name==='mainStreetSurfaces')).toBe(true);
    try{
      for(const step of steps){
        if(step.name!=='mainStreetSurfaces'){step.apply();continue;}
        const before=new Map<THREE.Mesh,{g:THREE.BufferGeometry;m:THREE.Material|THREE.Material[];attrs:Record<string,THREE.BufferAttribute|THREE.InterleavedBufferAttribute>;hashes:Record<string,string>;faces:string[]}>();
        group.traverse(o=>{if(o instanceof THREE.Mesh)before.set(o,{g:o.geometry,m:o.material,attrs:{...o.geometry.attributes},hashes:Object.fromEntries((Object.entries(o.geometry.attributes) as [string,THREE.BufferAttribute|THREE.InterleavedBufferAttribute][]).map(([n,a])=>[n,attributeHash(a)])),faces:faces(o.geometry)});});
        const beforeResources=resources(group),start=performance.now(),report=step.apply() as NonNullable<ReturnType<typeof applyMainStreetSurfaces>>,applyMs=performance.now()-start;
        expect(report).toMatchObject({applied:true,rejected:false,meshes:6,asphaltTriangles:901,sidewalkTriangles:238,materialVariants:6,addedDraws:6});expect(report.geometryBytes).toBeLessThan(150000);applied=true;
        const selected=new Map(catalog.meshes.map(r=>[r.name,r]));let unchanged=0,topFaces=0,minimumTopNormal=1,junctionFaces=0,farJunctionVertices=0,cornerFaces=0,retainedCornerFaces=0;
        for(const[mesh,snapshot]of before){
          for(const[name,a]of Object.entries(snapshot.attrs)){expect(mesh.geometry.getAttribute(name)).toBe(a);expect(attributeHash(a)).toBe(snapshot.hashes[name]);}
          if(mesh.geometry===snapshot.g){expect(mesh.material).toBe(snapshot.m);unchanged++;continue;}
          expect(selected.has(mesh.name)).toBe(true);expect(faces(mesh.geometry)).toEqual(snapshot.faces);expect(faces(snapshot.g)).toEqual(snapshot.faces);
          const coords=mesh.geometry.getAttribute('townMainCoord'),mats=Array.isArray(mesh.material)?mesh.material:[mesh.material];expect([...coords.array].every(Number.isFinite)).toBe(true);
          for(const part of mesh.geometry.groups){const material=mats[part.materialIndex??0] as THREE.MeshStandardMaterial;if(!material.userData.mainStreetSurface){
              if(mesh.name==='finished_street_corner_apron'){
                expect(material).toBe(snapshot.m);retainedCornerFaces+=part.count/3;
                // The later node-370 features retain their exact source material
                // and face IDs; only the four node-67 apron features qualify.
                for(let i=part.start;i<part.start+part.count;i++)expect(mesh.geometry.index!.getX(i)).toBeGreaterThanOrEqual(catalog.expectedCornerTriangles*3);
              }
              continue;
            }
            const oldMaterials=Array.isArray(snapshot.m)?snapshot.m:[snapshot.m],source=oldMaterials.find(m=>material.name.startsWith(m.name+' | photo-informed')) as THREE.MeshStandardMaterial;
            expect(source).toBeDefined();expect(material.map).toBe(source.map);expect(material.normalMap).toBe(source.normalMap);expect(material.roughnessMap).toBe(source.roughnessMap);expect(material.opacity).toBe(source.opacity);expect(material.transparent).toBe(source.transparent);
            const key=material.customProgramCacheKey(),color=material.color.clone(),hook=material.onBeforeCompile;applyArtMaterial(material);expect(material.color).toEqual(color);expect(material.onBeforeCompile).toBe(hook);expect(material.customProgramCacheKey()).toBe(key);
            const shader=compile(material);expect(shader.vertexShader).toContain('vTownMainCoord=townMainCoord');expect(shader.fragmentShader).not.toMatch(/discard|texture2D\(townMain/);
            if(material.userData.mainStreetSurface.kind==='pavers'){
              expect(shader.fragmentShader).toContain('fwidth(vTownMainCoord)');expect(shader.fragmentShader).not.toMatch(/fwidth\(mainPaver(?:Grid|Cell|Edge)/);
              for(let i=part.start;i<part.start+part.count;i+=3){const ids=[0,1,2].map(k=>mesh.geometry.index!.getX(i+k)),p=mesh.geometry.getAttribute('position'),[a,b,c]=ids.map(id=>new THREE.Vector3().fromBufferAttribute(p,id)),normal=b.sub(a).cross(c.sub(a)).normalize();minimumTopNormal=Math.min(minimumTopNormal,normal.y);expect(normal.y).toBeGreaterThan(.95);topFaces++;for(const id of ids)expect(Math.min(Math.abs(coords.getY(id)),Math.abs(coords.getY(id)-2.4384))).toBeLessThan(.0001);}
            }else{
              expect(shader.fragmentShader).toContain('mainWeatheredGray');expect(shader.fragmentShader.indexOf('mainWeatheredGray')).toBeLessThan(shader.fragmentShader.indexOf('float townStoneGrain'));
              expect(shader.fragmentShader).toContain('mainAsphaltFade*=1.0-smoothstep(7.7,12.0,vTownMainCoord.y)');
              for(let i=part.start;i<part.start+part.count;i+=3){
                const ids=[0,1,2].map(k=>mesh.geometry.index!.getX(i+k));
                if(!ids.some(id=>coords.getY(id)>0))continue;
                if(mesh.name==='finished_street_corner_apron'){
                  cornerFaces++;for(const id of ids)expect(id).toBeLessThan(catalog.expectedCornerTriangles*3);
                }else{expect(mesh.name).toBe('roads_1');junctionFaces++;}
                for(const id of ids){const p=mesh.geometry.getAttribute('position');expect(Math.hypot(p.getX(id)+origin[0]+2853.2581,-p.getZ(id)-origin[2]+939.8221)).toBeLessThan(20);if(mesh.name==='roads_1'&&coords.getY(id)>=catalog.junctionFadeM[1])farJunctionVertices++;}
              }
            }
          }
        }
        expect(topFaces).toBe(238);expect(junctionFaces).toBe(26);expect(cornerFaces).toBe(411);expect(retainedCornerFaces).toBe(211);expect(farJunctionVertices).toBeGreaterThan(0);expect(unchanged).toBe(before.size-report.meshes);expect(resources(group).textures).toEqual(beforeResources.textures);
        expect(applyMainStreetSurfaces(group,tile.id,origin,level,catalog.levels[level].sourceSha256)).toBe(report);
        console.log('Main Street native',JSON.stringify({level,...report,minimumTopNormal,unchangedMeshes:unchanged,applyMs:+applyMs.toFixed(2)}));
      }
      expect(applied).toBe(true);expect(group.userData.optionalDetailMissing??[]).toEqual([]);
    }finally{dispose(group);}
  },20_000);

  it('rejects stale or ambiguous inputs without partially changing any source mesh',async()=>{
    const group=await native(0),sha=catalog.levels[0].sourceSha256,materials=read('data/derived/town/road-materials-index.json');
    applyRoadMaterialFinish(group,tile.id,origin,0,sha,packet(materials.tiles[tile.id].levels[0]));
    expect(applyStreetCorners(group,tile.id,origin,0,sha,packet(catalog.sourceCorners)).rejected).toBe(false);
    const snapshot=new Map<THREE.Mesh,{g:THREE.BufferGeometry;m:THREE.Material|THREE.Material[]}>();group.traverse(o=>{if(o instanceof THREE.Mesh)snapshot.set(o,{g:o.geometry,m:o.material});});
    const unchanged=()=>{for(const[m,s]of snapshot){expect(m.geometry).toBe(s.g);expect(m.material).toBe(s.m);}expect(group.userData.mainStreetSurfaces).toBeUndefined();};
    try{
      expect(applyMainStreetSurfaces(group,'-11_-4',origin,0,sha)).toBeUndefined();
      for(const[o,l,s]of[[origin,0,'stale'],[[0,0,0],0,sha],[origin,4,sha]]as const){expect(applyMainStreetSurfaces(group,tile.id,[...o] as V3,l,s)?.rejected).toBe(true);unchanged();}
      const last=group.getObjectByName('streetscape_8')as THREE.Mesh,old=last.material;last.material=new THREE.MeshStandardMaterial();last.material.name='Protected actual paving';expect(applyMainStreetSurfaces(group,tile.id,origin,0,sha)?.rejected).toBe(true);last.material.dispose();last.material=old;unchanged();
      const duplicate=new THREE.Mesh(last.geometry,last.material);duplicate.name=last.name;last.parent!.add(duplicate);expect(applyMainStreetSurfaces(group,tile.id,origin,0,sha)?.rejected).toBe(true);duplicate.removeFromParent();unchanged();
      const source=group.getObjectByName('roads_1')as THREE.Mesh,clone=source.geometry.clone();source.geometry=clone;clone.getAttribute('position').setX(0,1);expect(applyMainStreetSurfaces(group,tile.id,origin,0,sha)?.rejected).toBe(true);source.geometry=snapshot.get(source)!.g;clone.dispose();unchanged();
      const corner=group.getObjectByName('finished_street_corner_apron')as THREE.Mesh;
      corner.userData.category='unrelated';expect(applyMainStreetSurfaces(group,tile.id,origin,0,sha)?.rejected).toBe(true);corner.userData.category='roads';unchanged();
      corner.userData.townCrafted=false;expect(applyMainStreetSurfaces(group,tile.id,origin,0,sha)?.rejected).toBe(true);corner.userData.townCrafted=true;unchanged();
      const cornerMaterial=corner.material as THREE.Material;cornerMaterial.userData.townRoadSurfaceType=2;expect(applyMainStreetSurfaces(group,tile.id,origin,0,sha)?.rejected).toBe(true);cornerMaterial.userData.townRoadSurfaceType=6;unchanged();
      const cornerGeometry=corner.geometry.clone();corner.geometry=cornerGeometry;cornerGeometry.getAttribute('position').setX(0,1);expect(applyMainStreetSurfaces(group,tile.id,origin,0,sha)?.rejected).toBe(true);corner.geometry=snapshot.get(corner)!.g;cornerGeometry.dispose();unchanged();
      const cornerReport=group.userData.streetCorners;delete group.userData.streetCorners;expect(applyMainStreetSurfaces(group,tile.id,origin,0,sha)?.rejected).toBe(true);group.userData.streetCorners=cornerReport;unchanged();
      const borrowed=snapshot.get(last)!.g,borrowedDispose=vi.spyOn(borrowed,'dispose'),sibling=new THREE.Mesh(borrowed,last.material);sibling.name='protected sibling';group.add(sibling);
      expect(applyMainStreetSurfaces(group,tile.id,origin,0,sha)?.applied).toBe(true);expect(sibling.geometry).toBe(borrowed);expect(borrowedDispose).not.toHaveBeenCalled();
      const own=[...resources(group).materials].filter(m=>m.userData.mainStreetSurface),spies=own.map(m=>vi.spyOn(m,'dispose'));dispose(group);spies.forEach(s=>expect(s).toHaveBeenCalledOnce());
    }catch(error){dispose(group);throw error;}
  });

  it('keeps the catalog compact and declares the photographic observations separately from authored dimensions',()=>{
    const raw=fs.readFileSync('data/derived/town/main-street-surfaces.json');expect(gzipSync(raw).length).toBeLessThan(16000);expect(raw.length).toBeLessThan(75000);expect(raw.toString()).not.toContain('/Users/');
    expect(catalog.physicalIds).toEqual([1475,1356]);expect(catalog.reference.captureDate).toMatch(/Unknown/);expect(catalog.reference.sha256).toMatch(/^[a-f0-9]{64}$/);expect(catalog.paverBandM[1]-catalog.paverBandM[0]).toBeCloseTo(.42);
    expect(catalog.inference).toMatch(/Only retained non-ramp sidewalk tops/);expect(catalog.inference).toMatch(/248 Main forecourt remain intact/);expect(catalog.expectedRoadTriangles).toBe(194);expect(catalog.panelCount).toBe(119);
    expect(catalog.sourceCorners.featureIds).toEqual(['junction-67-apron-23','junction-67-apron-24','junction-67-apron-25','junction-67-apron-26']);expect(catalog.expectedCornerTriangles).toBe(411);packet(catalog.sourceCorners);
    expect(catalog.junctionPhysicalIds).toEqual([44,243]);expect(catalog.junctionNode).toBe(67);expect(catalog.expectedJunctionTriangles).toBe(26);expect(catalog.junctionFadeM).toEqual([7.7,12]);
  });
});
