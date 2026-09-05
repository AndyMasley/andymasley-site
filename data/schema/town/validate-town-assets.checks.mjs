import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm, symlink } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { auditTownAssets, inspectGlb, inspectNetwork, resolveAssetUrl } from '../../../scripts/validate-town-assets.mjs';

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const wheels = ['Drive wheel | front left', 'Drive wheel | front right', 'Drive wheel | rear left', 'Drive wheel | rear right'];
const coordinates = { sourceCRS: 'EPSG:6491', horizontalOrigin: [171282.3328920724, 867589.2761750807], sourceVerticalOffsetM: 100, axes: 'Y_UP', conversion: '(x,z,-y)', units: 'metres' };
const glbPolicy = { allowedExtensions: ['EXT_meshopt_compression'], requiredExtensions: ['EXT_meshopt_compression'] };

function glb({ car = false, mutate = () => {} } = {}) {
  const nodes = (car ? wheels : ['test mesh']).map((name) => ({ name, mesh: 0 }));
  const data = {
    asset: { version: '2.0' }, extensionsUsed: ['EXT_meshopt_compression'], extensionsRequired: ['EXT_meshopt_compression'],
    buffers: [{ byteLength: 8 }, { byteLength: 42, extensions: { EXT_meshopt_compression: { fallback: true } } }],
    bufferViews: [
      { buffer: 1, byteLength: 36, byteStride: 12, extensions: { EXT_meshopt_compression: { buffer: 0, byteOffset: 0, byteLength: 4, byteStride: 12, count: 3, mode: 'ATTRIBUTES' } } },
      { buffer: 1, byteOffset: 36, byteLength: 6, extensions: { EXT_meshopt_compression: { buffer: 0, byteOffset: 4, byteLength: 4, byteStride: 2, count: 3, mode: 'TRIANGLES' } } },
    ],
    accessors: [{ bufferView: 0, componentType: 5126, type: 'VEC3', count: 3, min: [0, 0, 0], max: [1, 0, 1] }, { bufferView: 1, componentType: 5123, type: 'SCALAR', count: 3 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
    nodes, scenes: [{ nodes: nodes.map((_, i) => i) }], scene: 0,
    images: [{ uri: '../textures/surface.jpg' }], textures: [{ source: 0 }],
  };
  mutate(data);
  const json = Buffer.from(JSON.stringify(data)), padding = (4 - json.length % 4) % 4;
  const padded = Buffer.concat([json, Buffer.alloc(padding, 32)]), header = Buffer.alloc(20), binHeader = Buffer.alloc(8);
  header.write('glTF'); header.writeUInt32LE(2, 4); header.writeUInt32LE(20 + padded.length + 8 + 8, 8); header.writeUInt32LE(padded.length, 12); header.writeUInt32LE(0x4e4f534a, 16);
  binHeader.writeUInt32LE(8); binHeader.writeUInt32LE(0x004e4942, 4);
  // Deliberately tiny synthetic streams: unit tests exercise container audit, not Meshopt source equivalence.
  return Buffer.concat([header, padded, binHeader, Buffer.alloc(8)]);
}

function tinyNetwork() {
  const forward = { id: 0, physical_id: 0, from: 0, to: 1, points: [[0, 0, 0], [10, 0, 0]], length_m: 10, speed_kph: 24, lane_offset_m: 0, blocked_spans: [{ from_m: 8, to_m: 9, lane_from_m: 8, lane_to_m: 9 }] };
  return { schema_version: 1, origin_projected_m: coordinates.horizontalOrigin, nodes: [{ id: 0, x: 0, y: 0, z: 0 }, { id: 1, x: 10, y: 0, z: 0 }], edges: [forward, { ...forward, id: 1, from: 1, to: 0, points: [[10, 0, 0], [0, 0, 0]], blocked_spans: [] }], blocked_turns: [], landmarks: { HOME: { edge_id: 0, xy: [1, 0], s: 1 } } };
}

async function fixture(fn) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'town-asset-audit-'));
  try {
    async function put(url, bytes) {
      const file = path.join(root, url); await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, bytes);
      return { url, bytes: bytes.length, sha256: hash(bytes) };
    }
    const network = tinyNetwork(), networkBytes = Buffer.from(JSON.stringify(network));
    const policy = { version: 1, maximumAssetBytes: 26214400, sourceSha256: 'a'.repeat(64), coordinates, fullRelease: { buildings: 1, trees: 2 }, network: { url: 'network.json', bytes: networkBytes.length, sha256: hash(networkBytes), nodes: 2, edges: 2, points: 4, physicalRoads: 1, blockedEdges: 1, blockedTurns: 0, landmarks: ['HOME'] }, glb: glbPolicy, wheelNodes: wheels };
    const manifest = {
      version: 1, coordinates, source: { name: 'synthetic unit test', sha256: policy.sourceSha256 }, stats: { pilot: false, buildings: 1 },
      tiles: [{ id: '0_0', origin: [0, 0, 0], bounds: { min: [0, 0, 0], max: [10, 10, 10] }, sourceIds: ['1_2'], lods: [] }],
      trees: { sourceAnchors: 2, sourceAnchorsAndScalesSha256: 'b'.repeat(64), prototypes: [] }, textures: [],
    };
    for (const level of [0, 1, 2]) manifest.tiles[0].lods.push({ ...await put(`tiles/0_0-${level}.glb`, glb()), level, geometricErrorM: level * 0.1, triangles: 1 });
    manifest.tiles[0].treeFile = { ...await put('tiles/0_0.trees.json', Buffer.from(JSON.stringify([[1, 2, 3, 1, 1, 1, 0], [2, 3, 4, 2, 3, 2, 1]]))), count: 2 };
    for (const [role, level, id] of [['crown', 0, 'crown-near'], ['crown', 1, 'crown-far'], ['trunk', 0, 'trunk']]) manifest.trees.prototypes.push({ ...await put(`models/${id}.glb`, glb()), id, role, level, triangles: 1 });
    manifest.car = { ...await put('models/car.glb', glb({ car: true })), forward: '-Z', wheelNodes: [...wheels] };
    manifest.fallback = { ...await put('models/fallback.glb', glb()), triangles: 1 };
    manifest.textures.push(await put('textures/surface.jpg', Buffer.from([255, 216, 255, 224, 0, 0, 255, 217])));
    manifest.network = await put('network.json', networkBytes);
    const save = () => writeFile(path.join(root, 'manifest.json'), JSON.stringify(manifest));
    await save();
    await fn({ root, policy, manifest, save, put, network });
  } finally { await rm(root, { recursive: true, force: true }); }
}

async function failsWith(ctx, pattern) {
  const result = await auditTownAssets({ root: ctx.root, policy: ctx.policy });
  assert.equal(result.passed, false, JSON.stringify(result));
  assert.match(result.failures.map((f) => f.message).join('\n'), pattern);
}

test('complete synthetic release passes with independently derived counts', async () => fixture(async (ctx) => {
  const before = await readFile(path.join(ctx.root, 'manifest.json'));
  const result = await auditTownAssets({ root: ctx.root, policy: ctx.policy });
  assert.equal(result.passed, true, JSON.stringify(result.failures));
  assert.equal(result.counts.files, 12); assert.equal(result.counts.buildings, 1); assert.equal(result.counts.trees, 2); assert.equal(result.counts.network.directedEdges, 2);
  assert.equal(result.assets.find((x) => x.role === 'car').wheelNodes.length, 4);
  assert.deepEqual(await readFile(path.join(ctx.root, 'manifest.json')), before);
}));

test('pilot release needs explicit development flag', async () => fixture(async (ctx) => {
  ctx.manifest.stats.pilot = true; await ctx.save(); await failsWith(ctx, /Pilot manifest/);
  assert.equal((await auditTownAssets({ root: ctx.root, policy: ctx.policy, allowPilot: true })).passed, true);
}));

test('optional source-detail crown at level -1 is accepted', async () => fixture(async (ctx) => {
  ctx.manifest.trees.prototypes.push({ ...await ctx.put('models/crown-leaves.glb', glb()), id: 'crown-leaves', role: 'crown', level: -1, triangles: 1 });
  await ctx.save();
  assert.equal((await auditTownAssets({ root: ctx.root, policy: ctx.policy })).passed, true);
}));
test('negative prototype level is restricted to the source-detail crown', async () => fixture(async (ctx) => {
  ctx.manifest.trees.prototypes.find((p) => p.role === 'trunk').level = -1;
  await ctx.save(); await failsWith(ctx, /Invalid\/duplicate tree prototype/);
}));

async function addSurfaces(ctx) {
  const image = Buffer.from([255, 216, 255, 224, 0, 0, 255, 217]);
  const grass = { repeatM: 1.4 };
  for (const slot of ['color','normal','roughness']) grass[slot] = await ctx.put(`surfaces/textures/${slot}.jpg`, image);
  const png = Buffer.alloc(33); Buffer.from([137,80,78,71,13,10,26,10]).copy(png);
  png.writeUInt32BE(272,16); png.writeUInt32BE(272,20); png[24]=8; png[25]=6;
  ctx.manifest.surfaces = { grass, masks: { '0_0': { ...await ctx.put('surfaces/masks/0_0.png',png), bounds:[-8,-258,258,8] } } };
}
test('ground masks and shared materials are hash-checked release assets', async () => fixture(async ctx => {
  await addSurfaces(ctx); await ctx.save();
  const result=await auditTownAssets({root:ctx.root,policy:ctx.policy});
  assert.equal(result.passed,true,JSON.stringify(result.failures));
  assert.equal(result.counts.files,16);
  assert.equal(result.assets.filter(a=>a.role==='surface-mask').length,1);
}));
for (const [name,mutate,pattern] of [
  ['zero ground repeat',m=>m.surfaces.grass.repeatM=0,/metric texture repeat/],
  ['ground mask misses its cell',m=>m.surfaces.masks['0_0'].bounds=[0,0,250,250],/mask does not cover/],
  ['ground mask unknown cell',m=>{m.surfaces.masks.nope=m.surfaces.masks['0_0'];delete m.surfaces.masks['0_0'];},/no scenery tile/],
  ['ground image missing hash',m=>m.surfaces.grass.normal.sha256='',/SHA256/],
]) test(name,async()=>fixture(async ctx=>{await addSurfaces(ctx);mutate(ctx.manifest);await ctx.save();await failsWith(ctx,pattern);}));
test('ground classification requires all four byte channels',async()=>fixture(async ctx=>{
  await addSurfaces(ctx);
  const file=path.join(ctx.root,'surfaces/masks/0_0.png'),bytes=await readFile(file);bytes[25]=2;
  Object.assign(ctx.manifest.surfaces.masks['0_0'],await ctx.put('surfaces/masks/0_0.png',bytes));
  await ctx.save();await failsWith(ctx,/8-bit RGBA mask/);
}));

for (const [name, mutate, pattern] of [
  ['duplicate tile IDs', (m) => m.tiles.push(structuredClone(m.tiles[0])), /duplicate tile ID/],
  ['duplicate source IDs', (m) => m.tiles[0].sourceIds.push('1_2'), /building source ID/],
  ['missing LOD', (m) => m.tiles[0].lods.pop(), /LOD0\/1\/2/],
  ['bad bounds', (m) => m.tiles[0].bounds.min[0] = 20, /origin\/bounds/],
  ['bad origin arity', (m) => m.tiles[0].origin.pop(), /origin\/bounds/],
  ['hash tamper', (m) => m.fallback.sha256 = '0'.repeat(64), /SHA256 mismatch/],
  ['size tamper', (m) => m.fallback.bytes++, /byte count/],
  ['oversized file declaration', (m) => m.fallback.bytes = 26214401, /exceeds 25 MiB/],
  ['unhashed image', (m) => m.textures[0].sha256 = '', /SHA256/],
  ['missing texture ref', (m) => m.textures = [], /texture integrity ref/],
  ['wrong scene identity', (m) => m.source.sha256 = '0'.repeat(64), /source SHA/],
  ['wrong network identity', (m) => m.network.sha256 = '0'.repeat(64), /network identity/],
  ['missing fourth wheel', (m) => m.car.wheelNodes.pop(), /wheel-node contract/],
  ['tree count tamper', (m) => m.tiles[0].treeFile.count++, /coverage mismatch/],
]) test(name, async () => fixture(async (ctx) => { mutate(ctx.manifest); await ctx.save(); await failsWith(ctx, pattern); }));

test('changed texture bytes fail independent recorded hash', async () => fixture(async (ctx) => {
  await writeFile(path.join(ctx.root, 'textures/surface.jpg'), Buffer.from([255, 216, 255, 224, 0, 1, 255, 217])); await failsWith(ctx, /SHA256 mismatch/);
}));
test('finite tree rows and positive scales are required after hash verification', async () => fixture(async (ctx) => {
  const replacement = await ctx.put('tiles/0_0.trees.json', Buffer.from('[[1,2,3,1e999,1,1,0],[1,2,3,1,1,1,0]]'));
  Object.assign(ctx.manifest.tiles[0].treeFile, replacement); await ctx.save(); await failsWith(ctx, /non-finite\/invalid tree/);
}));
test('actual car scene needs four reachable mesh wheels', async () => fixture(async (ctx) => {
  Object.assign(ctx.manifest.car, await ctx.put('models/car.glb', glb({ car: true, mutate: (j) => j.scenes[0].nodes.pop() })));
  await ctx.save(); await failsWith(ctx, /outside active scene/);
}));
test('external image cannot escape release root', async () => fixture(async (ctx) => {
  Object.assign(ctx.manifest.fallback, await ctx.put('models/fallback.glb', glb({ mutate: (j) => j.images[0].uri = '../../private.jpg' })));
  await ctx.save(); await failsWith(ctx, /escapes release root/);
}));
test('symlink aliases are rejected even when bytes match', async () => fixture(async (ctx) => {
  await rm(path.join(ctx.root, 'models/car.glb')); await symlink('fallback.glb', path.join(ctx.root, 'models/car.glb')); await failsWith(ctx, /symlink/);
}));
for (const file of ['tiles/leftover.raw.glb', 'manifest.raw.json', 'originals/photo.jpg', 'master.blend', 'textures/unreferenced.jpg']) test(`reject publish leftover ${file}`, async () => fixture(async (ctx) => {
  await ctx.put(file, Buffer.from('unpublished input')); await failsWith(ctx, /Source\/original|Unreferenced publish file/);
}));
test('missing on-disk asset fails without rewriting the release', async () => fixture(async (ctx) => {
  await rm(path.join(ctx.root, 'textures/surface.jpg')); await failsWith(ctx, /ENOENT/);
}));

for (const uri of ['../../secret', '%2e%2e/%2e%2e/secret', 'https://example.test/a.png', '//host/a.png', '/tmp/a.png', '..\\secret', '%5csecret', 'data:image/png;base64,AA', 'a.png?x=1', 'a.png#frag']) test(`unsafe URI ${uri}`, () => {
  assert.throws(() => resolveAssetUrl('/release', '/release/models', uri), /Unsafe|escapes/);
});
test('shared sibling texture URI remains valid', () => assert.equal(resolveAssetUrl('/release', '/release/models', '../textures/a.png').relative, 'textures/a.png'));
test('binary header corruption detected', () => { const bytes = glb(); bytes.writeUInt32LE(1, 4); assert.throws(() => inspectGlb(bytes, 'test', glbPolicy), /version/); });
test('binary truncation detected', () => assert.throws(() => inspectGlb(glb().subarray(0, 50), 'test', glbPolicy), /byte length/));
for (const [name, mutate, pattern] of [
  ['unsupported required compression', (j) => j.extensionsUsed.push('KHR_draco_mesh_compression'), /unsupported extension/],
  ['invalid decoded stream size', (j) => j.bufferViews[0].extensions.EXT_meshopt_compression.count++, /decoded size/],
  ['compressed stream out of bounds', (j) => j.bufferViews[0].extensions.EXT_meshopt_compression.byteLength = 100, /exceeds embedded/],
  ['accessor overrun', (j) => j.accessors[0].count++, /accessor 0 exceeds/],
  ['quantized position', (j) => j.accessors[0].componentType = 5123, /float32 XYZ/],
  ['missing accessor', (j) => j.meshes[0].primitives[0].indices = 90, /missing index/],
  ['cyclic scene nodes', (j) => { j.nodes.push({ children: [0] }); j.nodes[0].children = [1]; }, /cyclic/],
]) test(name, () => assert.throws(() => inspectGlb(glb({ mutate }), 'test', glbPolicy), pattern));

test('network endpoints, IDs and safeguards independently checked', async () => fixture(async ({ network, policy }) => {
  assert.equal(inspectNetwork(network, policy.network, coordinates).blockedEdges, 1);
  const duplicate = structuredClone(network); duplicate.nodes[1].id = 0;
  assert.throws(() => inspectNetwork(duplicate, policy.network, coordinates), /duplicate network node/);
  const endpoint = structuredClone(network); endpoint.edges[0].to = 100;
  assert.throws(() => inspectNetwork(endpoint, policy.network, coordinates), /endpoints/);
  const point = structuredClone(network); point.edges[0].points[1][0] = 9;
  assert.throws(() => inspectNetwork(point, policy.network, coordinates), /does not meet/);
  const obstacle = structuredClone(network); obstacle.edges[0].blocked_spans[0].lane_from_m = 11;
  assert.throws(() => inspectNetwork(obstacle, policy.network, coordinates), /obstacle bounds/);
}));
