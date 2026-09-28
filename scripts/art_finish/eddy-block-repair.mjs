#!/usr/bin/env node
/** Audit Eddy shell repair against all native LODs and the protected historic facade.
 * TOWN_QUALITY_OUT=/absolute/output node scripts/art_finish/eddy-block-repair.mjs
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const site = fileURLToPath(new URL('../../', import.meta.url));
const out = path.resolve(process.env.TOWN_QUALITY_OUT ?? path.join(os.tmpdir(), 'town-quality'));
const args = process.argv.slice(2);
assert.equal(args.length, 0, 'This native audit takes no positional arguments');
fs.mkdirSync(out, { recursive: true });
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'eddy-block-repair-'));
const require = createRequire(path.join(site, 'package.json'));
const read = filename => JSON.parse(fs.readFileSync(filename, 'utf8'));
const data = name => read(path.join(site, 'data/derived/town', `${name}.json`));
const configPath = path.join(site, 'data/derived/town/eddy-block-repair.json');
const config = read(configPath), release = data('release');
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
  fs.writeFileSync(entry, `export {tileAssemblySteps} from ${JSON.stringify(path.join(site, 'src/lib/town/tile-assembly.ts'))};\nexport {tileGround} from ${JSON.stringify(path.join(site, 'src/lib/town/address-frontage.ts'))};\nexport {applyEddyBlockRepair} from ${JSON.stringify(path.join(site, 'src/lib/town/eddy-block-repair.ts'))};\n`);
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
function bytes(array) { return Buffer.from(array.buffer, array.byteOffset, array.byteLength); }
function attributeHash(g) {
  const h = createHash('sha256');
  for (const [name, a] of Object.entries(g.attributes).sort(([a], [b]) => a.localeCompare(b))) {
    assert(!a.isInterleavedBufferAttribute, `Unexpected interleaved attribute ${name}`);
    h.update(`${name}:${a.itemSize}:${a.normalized}:${a.array.constructor.name}:`);
    h.update(bytes(a.array));
  }
  return h.digest('hex');
}
function geometryHash(g) {
  return hash(`${attributeHash(g)}:${g.index ? hash(bytes(g.index.array)) : 'non-indexed'}:${JSON.stringify(g.groups)}:${JSON.stringify(g.drawRange)}`);
}
const materials = mesh => Array.isArray(mesh.material) ? mesh.material : [mesh.material];
function materialListHash(list) {
  return hash(JSON.stringify(list.map(m => ({ uuid: m.uuid, name: m.name, color: m.color?.getHex(), map: m.map?.uuid, opacity: m.opacity, transparent: m.transparent, side: m.side }))));
}
const materialHash = mesh => materialListHash(materials(mesh));
function snapshot(group) {
  const rows = [];
  group.traverse(mesh => { if (mesh.isMesh) rows.push({ mesh, geometry: geometryHash(mesh.geometry), material: materialHash(mesh), transform: mesh.matrixWorld.toArray() }); });
  return rows;
}
function stableMeshes(rows, exempt = new Set()) {
  for (const row of rows) {
    if (exempt.has(row.mesh)) continue;
    assert.equal(geometryHash(row.mesh.geometry), row.geometry, `Unrelated geometry changed: ${row.mesh.name}`);
    assert.equal(materialHash(row.mesh), row.material, `Unrelated material changed: ${row.mesh.name}`);
    assert.deepEqual(row.mesh.matrixWorld.toArray(), row.transform, `Unrelated transform changed: ${row.mesh.name}`);
  }
}
const vector = new THREE.Vector3();
function points(mesh, triangle) {
  const g = mesh.geometry, p = g.getAttribute('position');
  return [0, 1, 2].map(k => vector.fromBufferAttribute(p, g.index?.getX(triangle * 3 + k) ?? triangle * 3 + k).applyMatrix4(mesh.matrixWorld).toArray());
}


// Independent mapped 2011 footprint, copied from building_architecture.json.
// These source facts are intentionally separate from the repair's authored roof.
const sourceOutline = [[-3104.258226827398,-967.6331005146494],[-3105.9487441381207,-993.7273584902287],[-3127.385172808834,-992.6310680188471],[-3126.750588429364,-980.4160300752847],[-3120.5625175254536,-966.6710291568888]];
const wholeNames = ['buildings_3', 'buildings_4', 'buildings_5'];
const sourceMaterials = {
  buildings_3: 'Architecture | warm masonry',
  buildings_4: 'Reference | mill weathered red brick',
  buildings_5: 'Reference | mill dark roofing',
  buildings_20: 'Downtown | 2025 aerial roof color, planimetrically projected',
};
const expectedCounts = [[2864,908,2314,1787],[1574,744,1812,1131],[716,744,1802,911]];
const expectedRoofRemoval = [444,442,442];
function triangleCount(mesh) { return (mesh.geometry.index?.count ?? mesh.geometry.getAttribute('position').count) / 3; }
function findMesh(group, name) {
  const found = [];
  group.traverse(mesh => { if (mesh.isMesh && mesh.name === name && mesh.parent?.name === 'buildings') found.push(mesh); });
  assert.equal(found.length, 1, `Unique native buildings/${name}`);
  return found[0];
}
function distanceFromOutline(p) {
  const e = p[0], n = -p[2]; let inside = false, distance = Infinity;
  for (let i = 0, j = sourceOutline.length - 1; i < sourceOutline.length; j = i++) {
    const a = sourceOutline[i], b = sourceOutline[j], de = b[0] - a[0], dn = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((e-a[0])*de+(n-a[1])*dn)/(de*de+dn*dn)));
    distance = Math.min(distance, Math.hypot(e-a[0]-t*de,n-a[1]-t*dn));
    if ((a[1] > n) !== (b[1] > n) && e < (b[0]-a[0])*(n-a[1])/(b[1]-a[1])+a[0]) inside = !inside;
  }
  return inside ? 0 : distance;
}
function derivedSelection(mesh) {
  const selected = [];
  for (let i = 0; i < triangleCount(mesh); i++) {
    if (points(mesh, i).every(p => distanceFromOutline(p) < .003)) selected.push(i);
  }
  return selected;
}
function ranges(indices) {
  const result = [];
  for (const i of indices) {
    const last = result.at(-1);
    if (last?.[1] === i) last[1]++; else result.push([i, i+1]);
  }
  return result;
}
const started = performance.now(), api = await runtime();
try {
  assert.equal(config.structId, '168167_866609');
  assert.equal(config.tileId, '-13_-4');
  const tile = manifest.tiles.find(row => row.id === config.tileId);
  assert(tile); assert.deepEqual(tile.origin, [-3250,0,1000]);
  const report = { structId: config.structId, tileId: tile.id, manifestSha256: release.manifestSha256, sourceOutline, coordinateConvention: 'Three: east/elevation/-north', levels: [] };
  const registration = { structId: config.structId, tileId: tile.id, origin: tile.origin, sourceOutline, levels: [] };
  for (const level of [0,1,2]) {
    const lod = tile.lods.find(row => row.level === level), raw = fs.readFileSync(path.join(source, lod.url));
    assert.equal(hash(raw), lod.sha256, `Native source SHA LOD${level}`);
    const group = (await loader.parseAsync(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength), '')).scene;
    const steps = api.tileAssemblySteps(group,tile,level,details(tile.id,level));
    assert.equal(steps.filter(step => step.name === 'eddyBlockRepair').length, 1, 'Exactly one production hook');
    for (const step of steps) if (step.name !== 'eddyBlockRepair') step.apply();
    group.position.fromArray(tile.origin); group.updateMatrixWorld(true);
    const before = snapshot(group), native = new Set(before.map(row => row.mesh));
    const names = [...wholeNames,'buildings_20'], selected = names.map(name => findMesh(group,name));
    const maskRows = selected.map((mesh, index) => {
      assert.deepEqual(materials(mesh).map(m => m.name), [sourceMaterials[mesh.name]]);
      assert.equal(triangleCount(mesh), expectedCounts[level][index]);
      assert.deepEqual(mesh.geometry.groups, []);
      const selection = derivedSelection(mesh), expected = index === 3 ? expectedRoofRemoval[level] : triangleCount(mesh);
      assert.equal(selection.length, expected, `Exact Eddy ownership ${mesh.name}`);
      assert.deepEqual(ranges(selection), [[0,expected]], 'Native source ownership is a contiguous initial range');
      return { name:mesh.name,parent:mesh.parent.name,materials:materials(mesh).map(m=>m.name),vertices:mesh.geometry.getAttribute('position').count,triangles:triangleCount(mesh),groups:mesh.geometry.groups,geometrySha256:geometryHash(mesh.geometry),selectedRanges:ranges(selection) };
    });
    const specLevel=config.levels.find(row=>row.level===level);
    assert.equal(specLevel?.sourceSha256,lod.sha256,'Runtime catalog source pin agrees with native release');
    assert.equal(specLevel.meshes.length,maskRows.length,'Runtime catalog contains only the four exact source meshes');
    for(const row of maskRows){
      const spec=specLevel.meshes.find(item=>item.name===row.name);
      assert(spec,`Catalog names registered mesh ${row.name}`);
      assert.equal(spec.parent,row.parent);assert.equal(spec.vertices,row.vertices);assert.equal(spec.totalTriangles,row.triangles);
      assert.deepEqual(spec.materials,row.materials);assert.deepEqual(spec.groups,row.groups);assert.deepEqual(spec.selectedRanges,row.selectedRanges);
    }
    registration.levels.push({level,sha256:lod.sha256,meshes:maskRows});
    const roof = selected.at(-1), roofAttributeHash = attributeHash(roof.geometry), roofMaterialHash = materialHash(roof);
    const expectedRetainedIndex = Array.from(roof.geometry.index.array).slice(expectedRoofRemoval[level]*3);
    const protectedLandmarks = before.filter(row => row.mesh.parent?.name === 'landmarks');
    assert(protectedLandmarks.length > 0, 'Protected historic facade exists');
    const childrenBefore = group.children.length;
    assert.equal(api.applyEddyBlockRepair(group,tile.id,tile.origin,level,'0'.repeat(64))?.status,'source-mismatch');
    stableMeshes(before); assert.equal(group.children.length,childrenBefore,'Bad source pin adds no children');
    group.position.set(0,0,0); group.updateMatrixWorld(true);
    const applied = api.applyEddyBlockRepair(group,tile.id,tile.origin,level,lod.sha256);
    assert.equal(applied?.status,'applied');
    group.position.fromArray(tile.origin); group.updateMatrixWorld(true);
    stableMeshes(before,new Set(selected));
    // The repaired shell is replaced; source facade and all unrelated meshes
    // must survive byte-for-byte, including all materials and transforms.
    const present = new Set(); group.traverse(object=>present.add(object));
    for (const row of before) if (!selected.includes(row.mesh)) assert(present.has(row.mesh), `Unrelated mesh retained ${row.mesh.name}`);
    for (const mesh of selected.slice(0,3)) assert(!present.has(mesh) || triangleCount(mesh) === 0, `Old Eddy body removed ${mesh.name}`);
    assert(present.has(roof), 'Shared neighboring roof mesh retained');
    assert.equal(attributeHash(roof.geometry),roofAttributeHash,'All shared roof attributes retained');
    assert.equal(materialHash(roof),roofMaterialHash,'Neighbor roof material unchanged');
    assert.deepEqual(Array.from(roof.geometry.index.array),expectedRetainedIndex,'Every complement triangle retained in order with exact original indices');
    let addedTriangles=0,maximumFootprintOutset=0;
    const added=[]; group.traverse(mesh=>{if(mesh.isMesh&&!native.has(mesh))added.push(mesh);});
    assert(added.length>0,'Reconstructed shell exists');
    const addedBounds=new THREE.Box3();
    for(const mesh of added){
      addedTriangles+=triangleCount(mesh);
      const p=mesh.geometry.getAttribute('position');
      for(let i=0;i<p.count;i++){
        const q=vector.fromBufferAttribute(p,i).applyMatrix4(mesh.matrixWorld).toArray();
        assert(q.every(Number.isFinite),'Finite reconstructed geometry');
        addedBounds.expandByPoint(new THREE.Vector3(...q));
        maximumFootprintOutset=Math.max(maximumFootprintOutset,distanceFromOutline(q));
      }
    }
    assert(maximumFootprintOutset<1.01,'Reconstruction stays in source footprint plus observed shallow facade and 1m shop awning');
    assert(addedBounds.min.y>=32.30&&addedBounds.max.y<=48.9,'Source base and existing maximum height preserved within trim tolerance');
    // Independent vertical probes prove a genuinely closed roof at both levels
    // instead of hiding the curtain under a new finish material.
    const roofMeshes=added.filter(mesh=>materials(mesh).some(m=>['roof','paving'].includes(m.userData.surfaceRole)));
    assert(roofMeshes.length>0,'Reconstructed roof material exists');
    const ray=new THREE.Raycaster(), roofProbes=[];
    for(const [name,e,n,min,max]of[['low shop',-3125.5,-989,37.4,38.1],['southern flat',-3115,-989,45.7,46.0],['northern truncated hip',-3116,-974,46.0,48.9]]){
      ray.set(new THREE.Vector3(e,60,-n),new THREE.Vector3(0,-1,0));
      const hits=ray.intersectObjects(roofMeshes,false),hit=hits[0];
      assert(hit,`${name} has a roof surface`); assert(hit.point.y>=min&&hit.point.y<=max,`${name} has the expected source-supported roof height`);
      roofProbes.push({name,e,n,elevation:hit.point.y});
    }
    const brickMeshes=added.filter(mesh=>materials(mesh).some(m=>m.userData.surfaceRole==='brick'));
    let outwardWallChecks=0;
    for(const ring of [config.core,[...config.shop].reverse()])for(let i=0;i<ring.length;i++){
      const a=ring[i],b=ring[(i+1)%ring.length],width=Math.hypot(b[0]-a[0],b[1]-a[1]),outward=new THREE.Vector3(-(b[1]-a[1])/width,0,-(b[0]-a[0])/width);
      const height=ring===config.core?44.9:36.2,center=new THREE.Vector3((a[0]+b[0])/2,height,-(a[1]+b[1])/2);
      ray.set(center.clone().addScaledVector(outward,1),outward.clone().negate());
      const hit=ray.intersectObjects(brickMeshes,false)[0];
      assert(hit&&hit.distance>.8&&hit.distance<1.01,'Every reconstructed wall faces its exterior and closes on the source-registered plane');
      outwardWallChecks++;
    }
    const openingFrames=[...config.westFrames];
    for(const [a,b,flip]of [[config.shop[0],config.shop[1],true],[config.shop[0],config.shop.at(-1),false]]){
      const w=Math.hypot(b[0]-a[0],b[1]-a[1]),t=[(b[0]-a[0])/w,(b[1]-a[1])/w];
      openingFrames.push({start:a,tangent:t,outward:flip?[t[1],-t[0]]:[-t[1],t[0]],width:w});
    }
    let supportedGlazingFaces=0;
    for(const mesh of added.filter(mesh=>materials(mesh).some(m=>m.userData.surfaceRole==='glass')))for(let face=0;face<triangleCount(mesh);face++){
      const ps=points(mesh,face).map(p=>new THREE.Vector3(...p)),normal=ps[1].clone().sub(ps[0]).cross(ps[2].clone().sub(ps[0])).normalize(),center=ps[0].clone().add(ps[1]).add(ps[2]).multiplyScalar(1/3);
      const frame=openingFrames.find(f=>{
        const u=(center.x-f.start[0])*f.tangent[0]+(-center.z-f.start[1])*f.tangent[1];
        const v=(center.x-f.start[0])*f.outward[0]+(-center.z-f.start[1])*f.outward[1];
        return u>0&&u<f.width&&v>0&&v<.25&&normal.dot(new THREE.Vector3(f.outward[0],0,-f.outward[1]))>.99;
      });
      if(!frame)continue;
      ray.set(center,normal.clone().negate());const hit=ray.intersectObjects(brickMeshes,false)[0];
      assert(hit&&hit.distance>.015&&hit.distance<.2,'Observed glazing remains immediately outside a reconstructed wall');
      supportedGlazingFaces++;
    }
    assert.equal(supportedGlazingFaces,38,'Every added west window and storefront face has a wall directly behind it');
    let interiorRoofSamples=0;
    for(let e=-3127.25;e<-3104.25;e+=.5)for(let n=-993.5;n<-966.5;n+=.5){
      if(distanceFromOutline([e,0,-n])>0)continue;
      ray.set(new THREE.Vector3(e,60,-n),new THREE.Vector3(0,-1,0));
      const hit=ray.intersectObjects(roofMeshes,false)[0];
      assert(hit&&hit.point.y>=37.4&&hit.point.y<=48.9,`Continuous closed roof over mapped interior ${e},${n}`);
      interiorRoofSamples++;
    }
    assert(interiorRoofSamples>1000,'Dense whole-footprint roof coverage tested');
    const stable=snapshot(group),children=group.children.length;
    assert.equal(api.applyEddyBlockRepair(group,tile.id,tile.origin,level,lod.sha256),applied,'Repeated application returns recorded result');
    stableMeshes(stable);assert.equal(group.children.length,children,'Repeated application adds no geometry');
    report.levels.push({level,sourceSha256:lod.sha256,result:applied,removedTriangles:maskRows.reduce((s,r)=>s+r.selectedRanges.reduce((n,[a,b])=>n+b-a,0),0),retainedSharedRoofTriangles:expectedRetainedIndex.length/3,protectedLandmarkMeshes:protectedLandmarks.length,allUnrelatedMeshesUnchanged:true,addedMeshes:added.length,addedTriangles,maximumFootprintOutset,addedBoundsThree:{min:addedBounds.min.toArray(),max:addedBounds.max.toArray()},roofProbes,interiorRoofSamples,outwardWallChecks,supportedGlazingFaces});
  }
  report.elapsedSeconds=(performance.now()-started)/1000;
  fs.writeFileSync(path.join(out,'eddy-block-native-registration.json'),JSON.stringify(registration,null,2));
  fs.writeFileSync(path.join(out,'eddy-block-native-audit.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
} finally { fs.rmSync(scratch,{recursive:true,force:true}); }
