#!/usr/bin/env node
/** Audit Morehouse finishes against all native LODs and the protected Shumway front.
 * TOWN_QUALITY_OUT=/absolute/output node scripts/art_finish/morehouse-completion.mjs
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
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'morehouse-completion-'));
const require = createRequire(path.join(site, 'package.json'));
const read = filename => JSON.parse(fs.readFileSync(filename, 'utf8'));
const data = name => read(path.join(site, 'data/derived/town', `${name}.json`));
const configPath = path.join(site, 'data/derived/town/morehouse-completion.json');
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
  fs.writeFileSync(entry, `export {tileAssemblySteps} from ${JSON.stringify(path.join(site, 'src/lib/town/tile-assembly.ts'))};\nexport {applyMorehouseCompletion} from ${JSON.stringify(path.join(site, 'src/lib/town/morehouse-completion.ts'))};\n`);
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

// Independent source outline, from street-detail/building_architecture.json.
// Its Shumway and Morehouse parts share one mapped 2011 roofprint. The original
// native exporter separated the painted landmark surfaces into meshes 4 and 5.
const sourceOutline = [[-3124.266304552846,-1016.9698605058948],[-3129.870803301368,-1048.1557638782542],[-3138.7206929787935,-1046.338694238686],[-3137.8828298672743,-1044.1210380040575],[-3146.5691490951576,-1042.7489836581517],[-3144.193057322729,-1029.8753754934296],[-3147.336341839662,-1029.3058323469013],[-3148.434588003991,-1034.1880359217757],[-3154.471805033012,-1032.8279263591394],[-3155.3121788141143,-1035.6009284005268],[-3161.0187611336005,-1034.3533774830867],[-3161.2766406441806,-1036.4625776838511],[-3170.043723715993,-1034.6458425068995],[-3162.8179860135715,-1011.1312451080885]];
const sourceFront = { start: [-3162.818, -1011.131], end: [-3124.266, -1016.970] };
const frontWidth = Math.hypot(sourceFront.end[0] - sourceFront.start[0], sourceFront.end[1] - sourceFront.start[1]);
const tangent = sourceFront.end.map((v, i) => (v - sourceFront.start[i]) / frontWidth), outward = [-tangent[1], tangent[0]];
function frontCoordinates(p) {
  const e = p[0] - sourceFront.start[0], n = -p[2] - sourceFront.start[1];
  return [e * tangent[0] + n * tangent[1], e * outward[0] + n * outward[1]];
}
function frameCoordinates(p, frame) {
  const e = p[0] - frame.start[0], n = -p[2] - frame.start[1];
  return [e * frame.tangent[0] + n * frame.tangent[1], e * frame.outward[0] + n * frame.outward[1]];
}
function insideSource(p) {
  const e = p[0], n = -p[2];
  let inside = false;
  for (let i = 0, j = sourceOutline.length - 1; i < sourceOutline.length; j = i++) {
    const a = sourceOutline[i], b = sourceOutline[j], dx = b[0] - a[0], dn = b[1] - a[1];
    const f = Math.max(0, Math.min(1, ((e - a[0]) * dx + (n - a[1]) * dn) / (dx * dx + dn * dn)));
    // Float32 GLB quantization is under 0.5 mm in this footprint.
    if (Math.hypot(e - a[0] - f * dx, n - a[1] - f * dn) < .002) return true;
    if ((a[1] > n) !== (b[1] > n) && e < (b[0] - a[0]) * (n - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}
function findMesh(group, name) {
  const matches = [];
  group.traverse(mesh => { if (mesh.isMesh && mesh.name === name && mesh.parent?.name === 'buildings') matches.push(mesh); });
  assert.equal(matches.length, 1, `Unique native buildings/${name}`);
  return matches[0];
}
function triangleCount(mesh) { return (mesh.geometry.index?.count ?? mesh.geometry.getAttribute('position').count) / 3; }
const expectedMaterials = {
  buildings_2: 'Estimated buildings | neutral walls',
  buildings_3: 'Downtown | 2025 aerial roof color, planimetrically projected',
  buildings_4: 'Reference | historic red brick',
  buildings_5: 'Reference | historic gray roof',
};
const started = performance.now();
try {
  const api = await runtime();
  assert.equal(config.structId, '168135_866568');
  assert.equal(config.tileId, '-13_-5');
  const tile = manifest.tiles.find(row => row.id === config.tileId);
  assert(tile);
  assert.deepEqual(tile.origin, [-3250, 0, 1250]);
  const report = { sourceId: config.structId, tileId: config.tileId, sourceManifestSha256: release.manifestSha256, coordinateConvention: 'Three arrays: east/elevation/-north. Façade offsets measured from the original Main Street front plane, positive outward.', levels: [] };
  for (const level of [0, 1, 2]) {
    const lod = tile.lods.find(row => row.level === level), raw = fs.readFileSync(path.join(source, lod.url));
    assert.equal(hash(raw), lod.sha256, `Native source SHA LOD ${level}`);
    const group = (await loader.parseAsync(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength), '')).scene;
    const steps = api.tileAssemblySteps(group, tile, level, details(tile.id, level));
    assert.equal(steps.filter(step => step.name === 'morehouseCompletion').length, 1, 'Exactly one production assembly hook');
    for (const step of steps) if (step.name !== 'morehouseCompletion') step.apply();
    group.position.fromArray(tile.origin); group.updateMatrixWorld(true);
    const before = snapshot(group), targetNames = ['buildings_2', 'buildings_3'];
    const targetMeshes = new Set(targetNames.map(name => findMesh(group, name)));
    const targets = [...targetMeshes].map(mesh => {
      assert.deepEqual(materials(mesh).map(m => m.name), [expectedMaterials[mesh.name]]);
      const count = triangleCount(mesh);
      for (let i = 0; i < count; i++) assert(points(mesh, i).every(insideSource), `${mesh.name}: every native triangle belongs to the registered merged footprint`);
      return { mesh, geometry: mesh.geometry, geometryHash: geometryHash(mesh.geometry), attributeHash: attributeHash(mesh.geometry), originalMaterial: mesh.material, triangles: count };
    });
    const protectedMeshes = ['buildings_4', 'buildings_5'].map(name => {
      const mesh = findMesh(group, name);
      assert.deepEqual(materials(mesh).map(m => m.name), [expectedMaterials[name]]);
      return { name, triangles: triangleCount(mesh), geometryHash: geometryHash(mesh.geometry) };
    });
    // A wrong source pin must fail before any material or geometry mutation.
    const childCount = group.children.length;
    assert.equal(api.applyMorehouseCompletion(group, tile.id, tile.origin, level, '0'.repeat(64))?.status, 'source-mismatch');
    stableMeshes(before); assert.equal(group.children.length, childCount);
    group.position.set(0, 0, 0); group.updateMatrixWorld(true);
    const result = api.applyMorehouseCompletion(group, tile.id, tile.origin, level, lod.sha256);
    assert.equal(result?.status, 'applied');
    group.position.fromArray(tile.origin); group.updateMatrixWorld(true);
    stableMeshes(before, targetMeshes);
    const proofs = targets.map(row => {
      const { mesh } = row;
      assert.equal(mesh.geometry, row.geometry, 'Same geometry object: native topology is untouched');
      assert.equal(geometryHash(mesh.geometry), row.geometryHash, 'All positions, normals, UVs, indices and groups unchanged');
      assert.notEqual(mesh.material, row.originalMaterial, 'A separate material finishes the formerly blank surface');
      assert.equal(materials(mesh).length, 1, 'No new native draw calls');
      assert.notEqual(materials(mesh)[0].name, expectedMaterials[mesh.name], 'Finish has distinct provenance');
      return { name: mesh.name, vertices: mesh.geometry.getAttribute('position').count, triangles: row.triangles, materialBefore: expectedMaterials[mesh.name], materialAfter: materials(mesh)[0].name, geometrySha256: row.geometryHash, attributesSha256: row.attributeHash };
    });
    assert.equal(result.walls, targets[0].triangles);
    assert.equal(result.roof, targets[1].triangles);
    const native = new Set(before.map(row => row.mesh)), added = [];
    group.traverse(mesh => { if (mesh.isMesh && !native.has(mesh)) added.push(mesh); });
    let addedTriangles = 0, minimumOffset = Infinity, maximumOffset = -Infinity, minimumU = Infinity, maximumU = -Infinity;
    let minimumSideOffset = Infinity, maximumSideOffset = -Infinity, glassFaces = 0, minimumGlassClearance = Infinity, maximumGlassClearance = -Infinity;
    const outwardThree = new THREE.Vector3(outward[0], 0, -outward[1]), ray = new THREE.Raycaster();
    for (const mesh of added) {
      addedTriangles += triangleCount(mesh);
      const position = mesh.geometry.getAttribute('position');
      for (let i = 0; i < position.count; i++) {
        const p = vector.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld).toArray();
        assert(p.every(Number.isFinite), 'Finite authored frontage vertices');
        const [u] = frontCoordinates(p);
        minimumU = Math.min(minimumU, u); maximumU = Math.max(maximumU, u);
        const [frontU, frontOffset] = frameCoordinates(p, config.frame), [sideU, sideOffset] = frameCoordinates(p, config.side);
        const onFront = frontU >= -.061 && frontU <= config.frame.width + .061 && frontOffset >= -.021 && frontOffset <= .321;
        const onSide = sideU >= -.011 && sideU <= config.side.width + .011 && sideOffset >= -.021 && sideOffset <= .151;
        assert(onFront || onSide, 'Added vertex remains within the bounded exterior front/side strips');
        if (onFront) { minimumOffset = Math.min(minimumOffset, frontOffset); maximumOffset = Math.max(maximumOffset, frontOffset); }
        else { minimumSideOffset = Math.min(minimumSideOffset, sideOffset); maximumSideOffset = Math.max(maximumSideOffset, sideOffset); }
      }
    }
    for (const mesh of added.filter(mesh => materials(mesh).some(material => material.userData.surfaceRole === 'glass'))) {
      for (let i = 0; i < triangleCount(mesh); i++) {
        const p = points(mesh, i), a = new THREE.Vector3(...p[0]), b = new THREE.Vector3(...p[1]), c = new THREE.Vector3(...p[2]);
        const normal = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
        if (normal.dot(outwardThree) < .95) continue;
        const center = a.add(b).add(c).multiplyScalar(1 / 3);
        ray.set(center, outwardThree.clone().negate());
        const hit = ray.intersectObject(targets[0].mesh, false)[0];
        assert(hit && hit.distance >= .045 && hit.distance <= .32, 'Every visible glass face stands immediately outside a native wall');
        glassFaces++; minimumGlassClearance = Math.min(minimumGlassClearance, hit.distance); maximumGlassClearance = Math.max(maximumGlassClearance, hit.distance);
      }
    }
    assert(glassFaces > 0, 'Visible front-facing glazing tested against the actual wall');
    assert.equal(addedTriangles, result.addedTriangles);
    assert(addedTriangles > 0, 'Observed frontage is present');
    assert(minimumU >= 22.14, 'No new frontage over the protected Shumway block');
    assert(maximumU <= frontWidth + .12, 'Frontage remains within the source eastern boundary');
    assert(minimumOffset >= -.021, 'Only shallow trim backs meet the native wall');
    assert(maximumOffset <= .321, 'New frontage has a bounded outset');
    const appliedSnapshot = snapshot(group), appliedChildren = group.children.length;
    assert.equal(api.applyMorehouseCompletion(group, tile.id, tile.origin, level, lod.sha256), result, 'Idempotent native application');
    stableMeshes(appliedSnapshot); assert.equal(group.children.length, appliedChildren);
    assert.equal(api.applyMorehouseCompletion(group, '-13_-4', tile.origin, level, lod.sha256), undefined, 'Other tile is a no-op');
    stableMeshes(appliedSnapshot); assert.equal(group.children.length, appliedChildren);
    report.levels.push({ level, sourceSha256: lod.sha256, result, targets: proofs, protectedMeshes, otherNativeMeshesUnchanged: before.length - targets.length, addedMeshes: added.length, frontageBounds: { u: [minimumU, maximumU], outwardOffset: [minimumOffset, maximumOffset], sideOutwardOffset: [minimumSideOffset, maximumSideOffset], glassFaces, glassClearance: [minimumGlassClearance, maximumGlassClearance] }, failClosedSourcePin: true, idempotent: true });
  }
  report.elapsedSeconds = Math.round((performance.now() - started) / 10) / 100;
  report.passed = true;
  const filename = path.join(out, 'morehouse-native-audit.json');
  fs.writeFileSync(filename, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ passed: true, report: filename, elapsedSeconds: report.elapsedSeconds, levels: report.levels.map(row => ({ level: row.level, ...row.result, unchangedMeshes: row.otherNativeMeshesUnchanged, frontageBounds: row.frontageBounds })) }));
} finally {
  fs.rmSync(scratch, { recursive: true, force: true });
}
