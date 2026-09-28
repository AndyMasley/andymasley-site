#!/usr/bin/env node
/** Reproduce the source-registered annex mask and audit the complete native assembly.
 * TOWN_QUALITY_OUT=/absolute/output node scripts/art_finish/racicot-annex.mjs
 * --write-data rebuilds only the registered LOD masks, preserving photo annotations.
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
assert(args.every(arg => arg === '--write-data'), 'Only --write-data is supported');
const writeData = args.includes('--write-data');
fs.mkdirSync(out, { recursive: true });
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'racicot-annex-'));
const require = createRequire(path.join(site, 'package.json'));
const read = filename => JSON.parse(fs.readFileSync(filename, 'utf8'));
const data = name => read(path.join(site, 'data/derived/town', `${name}.json`));
const configPath = path.join(site, 'data/derived/town/racicot-annex.json');
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
  fs.writeFileSync(entry, `export {tileAssemblySteps} from ${JSON.stringify(path.join(site, 'src/lib/town/tile-assembly.ts'))};\nexport {applyRacicotAnnex} from ${JSON.stringify(path.join(site, 'src/lib/town/racicot-annex.ts'))};\n`);
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
// Source frame from landmark-outlines.json, vertices 9 -> 8. The upstream
// landmark repair explicitly protects the high historic portion at u < 15 m.
const frame = {
  start: [-3000.6280821615073, -971.3204489289783],
  tangent: [.9712699889273769, .23798026936914982],
  outward: [.23798026936914982, -.9712699889273769],
};
assert.deepEqual(config.selection.start, frame.start);
assert.deepEqual(config.selection.tangent, frame.tangent);
assert.deepEqual(config.selection.outward, frame.outward);
function uv(p) {
  const e = p[0] - frame.start[0], n = -p[2] - frame.start[1];
  return [e * frame.tangent[0] + n * frame.tangent[1], -e * frame.outward[0] - n * frame.outward[1]];
}
function selectedTriangle(mesh, triangle, role) {
  const p = points(mesh, triangle), q = p.map(uv);
  const center = p[0].map((_, axis) => p.reduce((sum, v) => sum + v[axis], 0) / 3), [u, d] = uv(center);
  const normal = new THREE.Vector3(...p[1]).sub(new THREE.Vector3(...p[0])).cross(new THREE.Vector3(...p[2]).sub(new THREE.Vector3(...p[0]))).normalize();
  return u > 15.001 && d >= -.01 && d <= 31.08 && q.every(([s, depth]) => s >= 14.999 && s <= 48.13 && depth >= -.01 && depth <= 31.08) && center[1] > 30.17 && (role === 'brick' ? Math.abs(normal.y) < .1 : normal.y > .001);
}
function ranges(ids) {
  const result = [];
  for (const id of ids) {
    const last = result.at(-1);
    if (last?.[1] === id) last[1]++; else result.push([id, id + 1]);
  }
  return result;
}
function triangleKeys(g, materialOverride) {
  const count = (g.index?.count ?? g.getAttribute('position').count) / 3;
  const keys = new Array(count), cover = new Uint8Array(count);
  const groups = g.groups.length ? g.groups : [{ start: 0, count: count * 3, materialIndex: 0 }];
  for (const part of groups) {
    assert.equal(part.start % 3, 0); assert.equal(part.count % 3, 0);
    for (let offset = part.start; offset < part.start + part.count; offset += 3) {
      const i = offset / 3;
      assert(i < count && !cover[i]++, 'Groups must partition all triangles exactly once');
      const material = materialOverride?.(i, part.materialIndex ?? 0) ?? part.materialIndex ?? 0;
      keys[i] = `${material}:${[0, 1, 2].map(k => g.index?.getX(offset + k) ?? offset + k).join(',')}`;
    }
  }
  assert(cover.every(v => v === 1), 'No omitted native triangles');
  return keys;
}
const multisetHash = keys => hash(keys.slice().sort().join('\n'));
function findMesh(group, name, parent) {
  const found = [];
  group.traverse(o => { if (o.isMesh && o.name === name && o.parent?.name === parent) found.push(o); });
  assert.equal(found.length, 1, `Unique source mesh ${parent}/${name}`);
  return found[0];
}
const started = performance.now();
try {
  let api = await runtime();
  const assembled = [], generatedLods = [];
  for (const level of [0, 1, 2]) {
    const tile = manifest.tiles.find(row => row.id === config.tileId);
    assert(tile, 'Source tile present');
    assert.deepEqual(tile.origin, config.origin);
    const lod = tile.lods.find(row => row.level === level), raw = fs.readFileSync(path.join(source, lod.url));
    assert.equal(hash(raw), lod.sha256, `Native source SHA LOD ${level}`);
    const group = (await loader.parseAsync(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength), '')).scene;
    const steps = api.tileAssemblySteps(group, tile, level, details(tile.id, level));
    assert.equal(steps.filter(step => step.name === 'racicotAnnex').length, 1);
    for (const step of steps) if (step.name !== 'racicotAnnex') step.apply();
    group.position.fromArray(tile.origin); group.updateMatrixWorld(true);
    const derived = { level, sha256: lod.sha256, meshes: [] }, targets = [];
    for (const [name, role] of [['buildings_1', 'brick'], ['buildings_9', 'roof']]) {
      const mesh = findMesh(group, name, 'buildings'), g = mesh.geometry;
      const triangles = (g.index?.count ?? g.getAttribute('position').count) / 3;
      const selected = Array.from({ length: triangles }, (_, i) => i).filter(i => selectedTriangle(mesh, i, role));
      assert(selected.length > 0, 'Native annex selection must be nonempty');
      const spec = { name, parent: 'buildings', materials: materials(mesh).map(m => m.name), triangles, groups: g.groups.map(g => ({ ...g })), role, ranges: ranges(selected) };
      derived.meshes.push(spec); targets.push({ mesh, spec, selected });
    }
    generatedLods.push(derived); assembled.push({ group, tile, level, lod, targets });
  }
  const generated = { ...config, lods: generatedLods };
  fs.writeFileSync(path.join(out, 'racicot-annex-generated.json'), JSON.stringify(generated, null, 2) + '\n');
  if (writeData) {
    fs.writeFileSync(configPath, JSON.stringify(generated, null, 2) + '\n');
    api = await runtime();
  } else {
    assert.deepEqual(config.lods, generatedLods, 'Registered face ranges/material groups must equal independently derived native geometry; inspect generated JSON before using --write-data');
  }
  const report = { sourceId: config.structId, tileId: config.tileId, release: release.directory, manifestSha256: release.manifestSha256, coordinateConvention: 'Three arrays: east/elevation/-north. Face ranges: [start,endExclusive] triangle ordinals after all prior assembly steps.', generatedRegistration: 'racicot-annex-generated.json', levels: [], adjacentTileNoOps: [] };
  for (const { group, tile, level, lod, targets } of assembled) {
    const before = snapshot(group), expected = [];
    for (const { mesh, spec, selected } of targets) {
      const mask = new Set(selected), original = triangleKeys(mesh.geometry), newMaterialIndex = materials(mesh).length;
      const all = triangleKeys(mesh.geometry, (i, material) => mask.has(i) ? newMaterialIndex : material);
      assert(selected.every(i => original[i].startsWith('0:')), 'Only original pale wall/aerial material selected');
      const protectedWest = original.filter((_, i) => {
        const q = points(mesh, i).map(uv), u = q.reduce((s, p) => s + p[0], 0) / 3, d = q.reduce((s, p) => s + p[1], 0) / 3;
        return u < 15 && u >= -.01 && d >= -.01 && d < 75;
      });
      const selectedBounds = new THREE.Box3();
      for (const i of selected) for (const p of points(mesh, i)) selectedBounds.expandByPoint(new THREE.Vector3(...p));
      expected.push({ mesh, spec, attributes: attributeHash(mesh.geometry), materials: materials(mesh).slice(), materialState: materialHash(mesh), expected: multisetHash(all), retained: multisetHash(original.filter((_, i) => !mask.has(i))), selected: multisetHash(all.filter((_, i) => mask.has(i))), protectedWest, newMaterialIndex, selectedBounds: { min: selectedBounds.min.toArray(), max: selectedBounds.max.toArray() } });
    }
    // The live assembler applies details before the containing tile is translated.
    group.position.set(0, 0, 0); group.updateMatrixWorld(true);
    const result = api.applyRacicotAnnex(group, tile.id, tile.origin, level, lod.sha256);
    assert.equal(result?.status, 'applied', `Runtime acceptance LOD ${level}`);
    group.position.fromArray(tile.origin); group.updateMatrixWorld(true);
    stableMeshes(before, new Set(targets.map(row => row.mesh)));
    const proofs = [];
    for (const row of expected) {
      const { mesh, spec, newMaterialIndex } = row, actual = triangleKeys(mesh.geometry);
      assert.equal(attributeHash(mesh.geometry), row.attributes, `${mesh.name}: vertex/normal/UV attributes preserved`);
      assert.equal(multisetHash(actual), row.expected, `${mesh.name}: triangle winding, multiplicity and material assignment`);
      const retained = actual.filter(key => !key.startsWith(`${newMaterialIndex}:`)), selected = actual.filter(key => key.startsWith(`${newMaterialIndex}:`));
      assert.equal(multisetHash(retained), row.retained, `${mesh.name}: all unselected native triangles retain their material`);
      assert.equal(multisetHash(selected), row.selected, `${mesh.name}: only registered triangles receive annex finish`);
      for (let i = 0; i < row.materials.length; i++) assert.equal(materials(mesh)[i], row.materials[i], 'Original material object retained');
      assert.equal(materialListHash(materials(mesh).slice(0, row.materials.length)), row.materialState, 'Original material properties unchanged');
      const retainedCounts = new Map();
      for (const key of retained) retainedCounts.set(key, (retainedCounts.get(key) ?? 0) + 1);
      for (const key of row.protectedWest) { assert((retainedCounts.get(key) ?? 0) > 0, 'Historic west face untouched'); retainedCounts.set(key, retainedCounts.get(key) - 1); }
      assert(mesh.geometry.groups.length <= row.materials.length + 1, 'Bounded material draw calls');
      proofs.push({ name: spec.name, triangles: spec.triangles, selected: selected.length, retained: retained.length, protectedWest: row.protectedWest.length, ranges: spec.ranges.length, materialGroups: mesh.geometry.groups.length, attributesSha256: row.attributes, retainedTrianglesAndMaterialsSha256: row.retained, selectedBoundsThree: row.selectedBounds });
    }
    const native = new Set(before.map(row => row.mesh)), added = [];
    group.traverse(mesh => { if (mesh.isMesh && !native.has(mesh)) added.push(mesh); });
    let addedTriangles = 0, minimumAddedU = Infinity;
    for (const mesh of added) {
      const g = mesh.geometry; addedTriangles += (g.index?.count ?? g.getAttribute('position').count) / 3;
      for (let i = 0; i < g.getAttribute('position').count; i++) {
        const p = vector.fromBufferAttribute(g.getAttribute('position'), i).applyMatrix4(mesh.matrixWorld).toArray();
        assert(p.every(Number.isFinite), 'Finite authored facade geometry'); minimumAddedU = Math.min(minimumAddedU, uv(p)[0]);
      }
    }
    assert(minimumAddedU >= 14.999, 'Added facade must not enter historic western block');
    assert.equal(addedTriangles, result.addedTriangles);
    const unchanged = snapshot(group);
    assert.equal(api.applyRacicotAnnex(group, tile.id, tile.origin, level, lod.sha256), result, 'Idempotent native application');
    stableMeshes(unchanged);
    report.levels.push({ level, sourceSha256: lod.sha256, result, meshes: proofs, unrelatedMeshesUnchanged: before.length - targets.length, addedMeshes: added.length, minimumAddedU });
  }
  // The neighboring west tile must remain a complete no-op at every detail level.
  const neighbor = manifest.tiles.find(tile => tile.id === '-13_-4');
  assert(neighbor);
  for (const lod of neighbor.lods) {
    const raw = fs.readFileSync(path.join(source, lod.url));
    assert.equal(hash(raw), lod.sha256);
    const group = (await loader.parseAsync(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength), '')).scene;
    group.position.fromArray(neighbor.origin); group.updateMatrixWorld(true);
    const before = snapshot(group), childCount = group.children.length;
    assert.equal(api.applyRacicotAnnex(group, neighbor.id, neighbor.origin, lod.level, lod.sha256), undefined);
    stableMeshes(before); assert.equal(group.children.length, childCount);
    report.adjacentTileNoOps.push({ tileId: neighbor.id, level: lod.level, meshes: before.length, sourceSha256: lod.sha256 });
  }
  report.elapsedSeconds = Math.round((performance.now() - started) / 10) / 100;
  report.passed = true;
  const reportPath = path.join(out, 'racicot-annex-native-audit.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ passed: true, report: reportPath, elapsedSeconds: report.elapsedSeconds, levels: report.levels.map(row => ({ level: row.level, ...row.result, unchangedMeshes: row.unrelatedMeshesUnchanged, protectedWest: row.meshes.reduce((sum, mesh) => sum + mesh.protectedWest, 0) })), adjacentTileNoOps: report.adjacentTileNoOps.length }));
} finally {
  fs.rmSync(scratch, { recursive: true, force: true });
}
