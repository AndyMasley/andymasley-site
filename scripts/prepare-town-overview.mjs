/** Deterministic offline distant town geometry. Never fetched source tiles at runtime.
 * Geometry uses the pinned release's LOD2 meshes; appearance is sampled from
 * pinned source textures. Tree envelopes aggregate existing anchors only. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import * as THREE from 'three';
import sharp from 'sharp';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { clusterCanopy, roundedCanopy } from './town-overview-canopy.mjs';
import { createOverviewGroundBaker } from './town-overview-ground.mjs';
import { adjustTerrainForWater } from './town-overview-water.mjs';
// meshoptimizer0.18.1's JS wrapper accidentally passes float count as vertex
// count. Correct its two adapter calls in memory; the pinned WASM is unchanged.
const simplifierPath = fileURLToPath(import.meta.resolve('meshoptimizer/meshopt_simplifier.module.js'));
const simplifierAdapter = fs.readFileSync(simplifierPath, 'utf8');
const badVertexCount = 'vertex_positions.length, vertex_positions_stride * 4';
if (simplifierAdapter.split(badVertexCount).length !== 3) throw new Error('Meshoptimizer adapter changed; review vertex-count correction');
const fixedAdapter = simplifierAdapter.replaceAll(badVertexCount, 'vertex_positions.length / vertex_positions_stride, vertex_positions_stride * 4');
const { MeshoptSimplifier } = await import('data:text/javascript;base64,' + Buffer.from(fixedAdapter).toString('base64'));

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = p => JSON.parse(fs.readFileSync(p)), hash = b => createHash('sha256').update(b).digest('hex');
const release = read(path.join(root, 'data/derived/town/release.json'));
const source = path.join(root, 'public/town-assets', release.directory), manifestBytes = fs.readFileSync(path.join(source, 'manifest.json'));
if (hash(manifestBytes) !== release.manifestSha256) throw new Error('Pinned source manifest hash differs');
const manifest = JSON.parse(manifestBytes), output = path.join(root, 'public/town-overview/v1');
const ground = await createOverviewGroundBaker({ projectRoot: root, sourceRoot: source, manifest });
const quantization = { origin: [-4096, -64, -4096], scale: [.125, .0078125, .125] };
const kinds = ['terrain', 'water', 'roads', 'buildings', 'trees'];
const config = { terrain: { ratio: .06, errorM: 4, lock: true }, water: { ratio: .06, errorM: .08, lock: true }, roads: { ratio: .12, errorM: .15, lock: false }, buildings: { ratio: .05, errorM: 2, lock: false } };
const layers = Object.fromEntries(kinds.map(kind => [kind, { kind, positions: [], normals: [], colors: [], owners: [], indices: [], sourceTriangles: 0, geometricErrorM: 0, bounds: new THREE.Box3(), roadProtectedTriangles: 0 }]));
const textureCatalog = new Map((manifest.textures ?? []).map(row => [path.resolve(source, row.url), row]));
const textureCache = new Map(), textureSources = new Map();
const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
const linear = value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
const roadCellM = 4;
const point = new THREE.Vector3(), normalMatrix = new THREE.Matrix3(), normal = new THREE.Vector3();
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
loader.register(() => ({ name: 'OVERVIEW_TEXTURE_DESCRIPTOR', loadTexture(index) { const texture = new THREE.Texture(); texture.userData.overviewIndex = index; return Promise.resolve(texture); } }));
await MeshoptSimplifier.ready;
// A translated fixture catches the wrapper bug: uninitialized extra vertices
// silently include zero in the bounds when float count is mistaken for count.
const scaleFixture = new Float32Array([101,203,307,111,203,307,101,208,307]);
if (MeshoptSimplifier.getScale(scaleFixture, 3) !== 10) throw new Error('Simplifier vertex-count self-check failed');
const crownSource = manifest.trees.prototypes.find(p => p.id === 'crown-far');
const crownBytes = fs.readFileSync(path.join(source, crownSource.url));
if (hash(crownBytes) !== crownSource.sha256) throw new Error('Crown prototype source hash differs');
const crownGLTF = await loader.parseAsync(crownBytes.buffer.slice(crownBytes.byteOffset, crownBytes.byteOffset + crownBytes.byteLength), '');
const crownBounds = new THREE.Box3().setFromObject(crownGLTF.scene);
crownGLTF.scene.traverse(mesh => { if (mesh instanceof THREE.Mesh) { mesh.geometry.dispose(); for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) material.dispose(); } });

function category(mesh) {
  const material = mesh.material, name = material.name ?? '';
  let group = mesh.name;
  for (let p = mesh.parent; p; p = p.parent) group += ' ' + p.name;
  if (/\bwater\b/.test(group)) return 'water';
  if (/\bterrain\b/.test(group)) return 'terrain';
  if (/Drive road \| asphalt|Streetscape \| parking apron asphalt/.test(name)) return 'roads';
  if (/\bbuildings\b|\blandmarks\b/.test(group) && !/trim|glass|glazing|window|door|finial|clock|mullion|step|stair|reveal|frame|lamp|rubber/i.test(name)) return 'buildings';
  return null;
}
async function texturePixels(mesh, gltf, tilePath) {
  const map = mesh.material.map, textureIndex = map?.userData.overviewIndex;
  if (textureIndex === undefined) return null;
  const texture = gltf.parser.json.textures?.[textureIndex], image = gltf.parser.json.images?.[texture?.source];
  if (!image?.uri || image.uri.startsWith('data:')) return null;
  const filename = path.resolve(path.dirname(tilePath), image.uri);
  if (!filename.startsWith(source + path.sep)) throw new Error('Texture outside pinned source');
  if (!textureCache.has(filename)) {
    const bytes = fs.readFileSync(filename), expected = textureCatalog.get(filename);
    if (expected?.sha256 && hash(bytes) !== expected.sha256) throw new Error('Texture source hash differs: ' + filename);
    const { data, info } = await sharp(bytes).resize(64, 64, { fit: 'fill' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    textureCache.set(filename, { data, width: info.width, height: info.height, channels: info.channels });
    textureSources.set(path.relative(source, filename), hash(bytes));
  }
  return textureCache.get(filename);
}
function colorAt(mesh, index, pixels) {
  const material = mesh.material, c = material.color?.toArray() ?? [1, 1, 1], uv = mesh.geometry.attributes.uv, color = mesh.geometry.attributes.color;
  if (pixels && uv) {
    const u = ((uv.getX(index) % 1) + 1) % 1, v = ((uv.getY(index) % 1) + 1) % 1;
    const x = Math.min(pixels.width - 1, Math.floor(u * pixels.width)), y = Math.min(pixels.height - 1, Math.floor(v * pixels.height));
    const offset = (y * pixels.width + x) * pixels.channels;
    for (let k = 0; k < 3; k++) c[k] *= linear(pixels.data[offset + Math.min(k, pixels.channels - 1)] / 255);
  }
  if (color) { c[0] *= color.getX(index); c[1] *= color.getY(index); c[2] *= color.getZ(index); }
  return c.map(v => Math.round(clamp(v) * 255));
}
function roadCells(meshes) {
  const result = new Set();
  for (const mesh of meshes) {
    const p = mesh.geometry.attributes.position, indices = mesh.geometry.index;
    for (let i = 0; i < (indices?.count ?? p.count); i += 3) {
      const vertices = [0, 1, 2].map(k => new THREE.Vector3().fromBufferAttribute(p, indices?.getX(i + k) ?? i + k).applyMatrix4(mesh.matrixWorld));
      const xs = vertices.map(p => Math.floor(p.x / roadCellM)), zs = vertices.map(p => Math.floor(p.z / roadCellM));
      for (let x = Math.min(...xs); x <= Math.max(...xs); x++) for (let z = Math.min(...zs); z <= Math.max(...zs); z++) result.add(x + ',' + z);
    }
  }
  return result;
}
function isRoadAdjacent(index, positions, cells) {
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  for (const i of index) { minX = Math.min(minX, positions[i * 3]); maxX = Math.max(maxX, positions[i * 3]); minZ = Math.min(minZ, positions[i * 3 + 2]); maxZ = Math.max(maxZ, positions[i * 3 + 2]); }
  for (let x = Math.floor(minX / roadCellM); x <= Math.floor(maxX / roadCellM); x++) for (let z = Math.floor(minZ / roadCellM); z <= Math.floor(maxZ / roadCellM); z++) if (cells.has(x + ',' + z)) return true;
  return false;
}
function simplify(mesh, kind, cells) {
  const g = mesh.geometry, p = g.attributes.position, values = [], sourceIndices = [], welded = new Map(), canonical = new Uint32Array(p.count);
  for (let i = 0; i < p.count; i++) {
    point.fromBufferAttribute(p, i).applyMatrix4(mesh.matrixWorld);
    const xyz = point.toArray(), key = xyz.map(v => v.toFixed(4)).join(','); let dense = welded.get(key);
    if (dense === undefined) { dense = sourceIndices.length; welded.set(key,dense); values.push(...xyz); sourceIndices.push(i); }
    canonical[i] = dense;
  }
  // Unreferenced duplicate slots must be removed, not merely remapped. They
  // otherwise look like locked seams to the topology simplifier.
  const positions = Float32Array.from(values), indices = new Uint32Array(g.index?.count ?? p.count);
  for (let i = 0; i < indices.length; i++) indices[i] = canonical[g.index?.getX(i) ?? i];
  const keep = [], reduce = [];
  if (kind === 'terrain') {
    for (let i = 0; i < indices.length; i += 3) {
      const face = [indices[i], indices[i + 1], indices[i + 2]];
      (isRoadAdjacent(face, positions, cells) ? keep : reduce).push(...face);
    }
  } else reduce.push(...indices);
  const cfg = config[kind], input = Uint32Array.from(reduce), scale = MeshoptSimplifier.getScale(positions, 3);
  let chosen = input, error = 0;
  if (input.length >= 12 && scale > 0) [chosen, error] = MeshoptSimplifier.simplify(input, positions, 3, Math.max(3, Math.floor(input.length * cfg.ratio / 3) * 3), cfg.errorM / scale, cfg.lock ? ['LockBorder'] : []);
  if (chosen.length % 3 || chosen.some(index => index >= positions.length / 3) || !Number.isFinite(error)) throw new Error('Invalid simplified topology');
  return { positions, sourceIndices, indices: Uint32Array.from([...keep, ...chosen]), sourceTriangles: indices.length / 3, protectedTriangles: keep.length / 3, errorM: error * scale };
}
function emit(mesh, kind, reduced, pixels, owner, groundMask) {
  const layer = layers[kind], remap = new Map(), g = mesh.geometry, normals = g.attributes.normal;
  normalMatrix.getNormalMatrix(mesh.matrixWorld);
  layer.sourceTriangles += reduced.sourceTriangles; layer.geometricErrorM = Math.max(layer.geometricErrorM, reduced.errorM); layer.roadProtectedTriangles += reduced.protectedTriangles;
  for (const index of reduced.indices) {
    let next = remap.get(index);
    if (next === undefined) {
      next = layer.owners.length; remap.set(index, next);
      const xyz = reduced.positions.subarray(index * 3, index * 3 + 3); layer.positions.push(...xyz); layer.bounds.expandByPoint(point.fromArray(xyz));
      if (normals) normal.fromBufferAttribute(normals, reduced.sourceIndices[index]).applyMatrix3(normalMatrix).normalize(); else normal.set(0, 1, 0);
      layer.normals.push(...normal.toArray().map(v => Math.round(clamp(v, -1, 1) * 127)));
      const sourceColor = colorAt(mesh, reduced.sourceIndices[index], pixels);
      layer.colors.push(...(kind === 'terrain' ? ground.color(sourceColor, xyz[0], xyz[2], groundMask) : sourceColor)); layer.owners.push(owner);
    }
    layer.indices.push(next);
  }
}
function treeClusters(rows, origin, owner, barriers) {
  const layer=layers.trees, groups=clusterCanopy(rows,origin,crownBounds,{blocked:(x,z)=>barriers.has(Math.floor(x/roadCellM)+','+Math.floor(z/roadCellM))});
  for(const cluster of groups){
    const shape=roundedCanopy(cluster),base=layer.owners.length;
    layer.geometricErrorM=Math.max(layer.geometricErrorM,shape.errorM);
    layer.positions.push(...shape.positions);layer.normals.push(...shape.normals.map(v=>Math.round(v*127)));layer.colors.push(...shape.colors.map(v=>Math.round(clamp(v)*255)));
    for(let i=0;i<shape.positions.length;i+=3){layer.owners.push(owner);layer.bounds.expandByPoint(point.fromArray(shape.positions,i));}
    for(const index of shape.indices)layer.indices.push(base+index);
  }
  return groups.length;
}
const tiles = [], sourceIds = new Set(); let anchors = 0, clusters = 0;
const selected = process.env.TOWN_OVERVIEW_TILES?.split(',');
for (let owner = 0; owner < manifest.tiles.length; owner++) {
  const tile = manifest.tiles[owner], lod = tile.lods.find(l => l.level === 2), before = Object.fromEntries(kinds.map(kind => [kind, layers[kind].indices.length / 3]));
  if (selected && !selected.includes(tile.id)) continue;
  let canopyBarriers = new Set();
  const record = { id: tile.id, origin: tile.origin, bounds: tile.bounds, sourceIds: tile.sourceIds ?? [], treeAnchors: tile.treeFile?.count ?? 0, triangles: {} };
  record.sourceIds.forEach(id => sourceIds.add(id));
  if (lod) {
    const filename = path.join(source, lod.url), raw = fs.readFileSync(filename);
    if (hash(raw) !== lod.sha256) throw new Error('Source GLB differs: ' + lod.url); record.lod2Sha256 = lod.sha256;
    const gltf = await loader.parseAsync(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength), pathToFileURL(path.dirname(filename) + '/').href), group = gltf.scene;
    group.position.fromArray(tile.origin); group.updateMatrixWorld(true);
    const meshes = []; group.traverse(mesh => { if (mesh instanceof THREE.Mesh && !Array.isArray(mesh.material) && category(mesh)) meshes.push(mesh); });
    const groundMask = await ground.mask(tile.id);
    const cells = roadCells(meshes.filter(mesh => category(mesh) === 'roads'));
    canopyBarriers = roadCells(meshes.filter(mesh => ['roads','water'].includes(category(mesh))));
    for (const mesh of meshes) { const kind = category(mesh), reduced = simplify(mesh, kind, cells); emit(mesh, kind, reduced, await texturePixels(mesh, gltf, filename), owner, groundMask); }
    const geometries = new Set(), materials = new Set(), textures = new Set();
    group.traverse(mesh => { if (!(mesh instanceof THREE.Mesh)) return; geometries.add(mesh.geometry); for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) { materials.add(material); for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value); } });
    geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); textures.forEach(t => t.dispose()); group.clear();
  }
  if (tile.treeFile) {
    const raw = fs.readFileSync(path.join(source, tile.treeFile.url)); if (hash(raw) !== tile.treeFile.sha256) throw new Error('Tree source differs: ' + tile.id);
    const rows = JSON.parse(raw); if (rows.length !== tile.treeFile.count) throw new Error('Tree anchor count differs');
    record.treeSha256 = tile.treeFile.sha256; anchors += rows.length; clusters += treeClusters(rows, tile.origin, owner, canopyBarriers);
  }
  for (const kind of kinds) record.triangles[kind] = layers[kind].indices.length / 3 - before[kind];
  tiles.push(record);
  if (owner % 40 === 0) console.log(`Overview ${owner + 1}/${manifest.tiles.length}: ${kinds.map(k => k + '=' + layers[k].indices.length / 3).join(' ')}`);
}
const waterClearance = adjustTerrainForWater(layers.terrain, layers.water, { quantization, clearanceM: .12 });
layers.terrain.geometricErrorM += waterClearance.maximumLoweringM;
layers.terrain.bounds.makeEmpty();
for(let i=0;i<layers.terrain.positions.length;i+=3) layers.terrain.bounds.expandByPoint(point.fromArray(layers.terrain.positions,i));
const terrainOwnerCounts = new Uint32Array(manifest.tiles.length);
for(let i=0;i<layers.terrain.indices.length;i+=3) {
  const owner=layers.terrain.owners[layers.terrain.indices[i]];
  if(layers.terrain.owners[layers.terrain.indices[i+1]]!==owner || layers.terrain.owners[layers.terrain.indices[i+2]]!==owner) throw new Error('Water correction crossed source ownership');
  terrainOwnerCounts[owner]++;
}
for(const tile of tiles) tile.triangles.terrain=terrainOwnerCounts[manifest.tiles.findIndex(sourceTile=>sourceTile.id===tile.id)];
const parts = [], catalogLayers = []; let offset = 0;
function append(array, componentType, itemSize) {
  const padding = (4 - offset % 4) % 4; if (padding) { parts.push(Buffer.alloc(padding)); offset += padding; }
  const bytes = Buffer.from(array.buffer, array.byteOffset, array.byteLength), record = { byteOffset: offset, count: array.length / itemSize, itemSize, componentType };
  parts.push(bytes); offset += bytes.length; return record;
}
for (const kind of kinds) {
  const layer = layers[kind], positions = new Uint16Array(layer.positions.length);
  for (let i = 0; i < positions.length; i++) { const value = Math.round((layer.positions[i] - quantization.origin[i % 3]) / quantization.scale[i % 3]); if (value < 0 || value > 65535 || !Number.isFinite(value)) throw new Error(`Position exceeds quantization: ${layer.positions.slice(i-i%3,i-i%3+3)}`); positions[i] = value; }
  catalogLayers.push({ kind, vertexCount: layer.owners.length, triangles: layer.indices.length / 3,
    attributes: { position: append(positions, 'uint16', 3), normal: append(Int8Array.from(layer.normals), 'int8', 3), color: append(Uint8Array.from(layer.colors), 'uint8', 3), tileIndex: append(Uint16Array.from(layer.owners), 'uint16', 1) },
    index: append(Uint32Array.from(layer.indices), 'uint32', 1), bounds: { min: layer.bounds.min.toArray(), max: layer.bounds.max.toArray() }, sourceTriangles: layer.sourceTriangles, geometricErrorM: layer.geometricErrorM, roadProtectedTriangles: layer.roadProtectedTriangles });
}
const decoded = Buffer.concat(parts), contentHash = hash(decoded), compressed = gzipSync(decoded, { level: 9, mtime: 0 }), name = `overview.${contentHash.slice(0,12)}.bin.gz`;
const catalog = { version: 1, format: 'town-overview-q16-v1', sourceManifestSha256: release.manifestSha256, sourceReleaseDirectory: release.directory, quantization,
  asset: { url: '/town-overview/v1/' + name, rawUrl: '/town-overview/v1/' + name.slice(0,-3), compression: 'gzip', bytes: compressed.length, decodedBytes: decoded.length, sha256: hash(compressed), decodedSha256: contentHash },
  tiles, layers: catalogLayers,
  stats: { tiles: tiles.length, sourceBuildings: sourceIds.size, sourceTreeAnchors: anchors, treeClusters: clusters, triangles: catalogLayers.reduce((sum,l) => sum+l.triangles,0), vertices: catalogLayers.reduce((sum,l) => sum+l.vertexCount,0), drawBatches: kinds.length, gzipBytes: compressed.length, decodedBytes: decoded.length }, contentHash,
  provenance: { generator: 'scripts/prepare-town-overview.mjs', sourceLOD: 2, meshoptimizer: '0.18.1 (vertex-count adapter corrected; WASM unchanged)', settings: config, treeClusterRadiusM: 32, treeClusterHeightDifferenceM: 7, treeClusterFaces: 20,
    simplifierAdapterSha256: hash(simplifierAdapter), correctedSimplifierAdapterSha256: hash(fixedAdapter), simplifierSelfCheck: 'Translated three-vertex bounds fixture returns exactly 10m; output indices checked against dense vertex count for every primitive.',
    crownPrototype: { ...crownSource, bounds: { min: crownBounds.min.toArray(), max: crownBounds.max.toArray() } },
    treeGeometricError: 'Conservative maximum cluster half-diagonal; clustered envelopes are an authored distant approximation of exact transformed source crown bounds.',
    groundAppearance: ground.provenance(), waterClearance: { ...waterClearance, helperSha256: hash(fs.readFileSync(path.join(root,'scripts/town-overview-water.mjs'))), basis: 'Exact projected source-water triangles remove hidden overlapping display terrain and close exposed shoreline sides below water; dry terrain and lake surfaces/heights stay unchanged. This is a rendering correction, not measured bathymetry.' },
    canopyHelperSha256: hash(fs.readFileSync(path.join(root,'scripts/town-overview-canopy.mjs'))),
    textureHashes: Object.fromEntries([...textureSources].sort(([a],[b]) => a.localeCompare(b))),
    basis: 'Pinned source geometry and tree anchors in original world coordinates; reduced distant representation, not additional mapped structures. Decorative building trim/glass/doors omitted. Rounded tree envelopes aggregate nearby source crowns by stable source-anchor seeds, rejecting links across source road/water footprints; no regular cluster grid. Colors are linear RGB from source texture/material samples and existing authored summer surface/canopy palettes. Source owners remain explicit for runtime replacement.',
    roadClearance: 'Before water-clearance correction, source terrain faces whose projected bounds intersect 4m bins touched by road triangles remain unchanged; remaining terrain and water simplify with locked borders. Water-clearance correction retains dry terrain and the exact water surface. Height quantization maximum error is 0.00390625m.',
    quantizationMaxAxisErrorM: quantization.scale.map(s => s/2), noLODTiles: manifest.tiles.filter(t => !t.lods.length).map(t => t.id), fallback: 'Existing pinned 30,186-triangle coarse source terrain remains underneath the overview and covers no-LOD gaps.' } };
const totalBounds = new THREE.Box3(); for (const layer of Object.values(layers)) if (!layer.bounds.isEmpty()) totalBounds.union(layer.bounds); catalog.bounds = { min: totalBounds.min.toArray(), max: totalBounds.max.toArray() };
if (selected) { console.log(JSON.stringify({ partial: true, ...catalog.stats, layers: catalogLayers.map(l=>({kind:l.kind,triangles:l.triangles,source:l.sourceTriangles,error:l.geometricErrorM,protected:l.roadProtectedTriangles})) },null,2)); }
else {
  console.log(JSON.stringify({...catalog.stats,layers:catalogLayers.map(l=>({kind:l.kind,triangles:l.triangles,source:l.sourceTriangles,error:l.geometricErrorM,protected:l.roadProtectedTriangles}))}));
  if (catalog.stats.triangles > 1250000) throw new Error('Overview triangle budget exceeded: '+catalog.stats.triangles);
  if (decoded.length > 24.5*1048576 || compressed.length > 12*1048576) throw new Error('Overview transfer/memory budget exceeded: '+compressed.length+'/'+decoded.length);
  fs.mkdirSync(output,{recursive:true}); fs.writeFileSync(path.join(output,name),compressed); fs.writeFileSync(path.join(output,name.slice(0,-3)),decoded);
  const json = JSON.stringify(catalog)+'\n'; fs.writeFileSync(path.join(output,'overview.json'),json); fs.writeFileSync(path.join(root,'data/derived/town/overview.json'),json);
  console.log(JSON.stringify({...catalog.stats,contentHash,layers:catalogLayers.map(l=>({kind:l.kind,triangles:l.triangles,source:l.sourceTriangles,error:l.geometricErrorM,protected:l.roadProtectedTriangles}))},null,2));
}
