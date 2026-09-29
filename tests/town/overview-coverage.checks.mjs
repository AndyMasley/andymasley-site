import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { inspectTownOverview, auditTownOverview } from '../../scripts/validate-town-overview.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const kinds = ['terrain', 'water', 'roads', 'buildings', 'trees'];
function fixture() {
  const sourceTiles = [
    { id: 'first', origin: [0, 0, 250], bounds: { min: [0, 0, 0], max: [600, 20, 250] }, sourceIds: ['building'], lods: [{ level: 2, sha256: 'a'.repeat(64) }], treeFile: { count: 10, sha256: 'b'.repeat(64) } },
    { id: 'tree-only', origin: [500, 0, 250], bounds: { min: [500, 0, 0], max: [750, 20, 250] }, sourceIds: [], lods: [], treeFile: { count: 2, sha256: 'c'.repeat(64) } },
  ];
  const manifestBytes = Buffer.from(JSON.stringify({ tiles: sourceTiles })), raw = Buffer.alloc(1024), layers = [];
  let offset = 0;
  const descriptor = (count, itemSize, componentType) => {
    offset = Math.ceil(offset / 4) * 4;
    const result = { byteOffset: offset, count, itemSize, componentType };
    offset += count * itemSize * ({ uint16: 2, int8: 1, uint8: 1, uint32: 4 }[componentType]); return result;
  };
  for (const kind of kinds) {
    const triangles = kind === 'trees' ? 2 : 1, vertexCount = triangles * 3;
    const attributes = { position: descriptor(vertexCount, 3, 'uint16'), normal: descriptor(vertexCount, 3, 'int8'), color: descriptor(vertexCount, 3, 'uint8'), tileIndex: descriptor(vertexCount, 1, 'uint16') };
    const index = descriptor(vertexCount, 1, 'uint32');
    for (let v = 0; v < vertexCount; v++) {
      // The first source owner deliberately spills into the second X/Z cell.
      raw.writeUInt16LE(600 + v % 3, attributes.position.byteOffset + v * 6);
      raw.writeUInt16LE(kind === 'trees' && v >= 3 ? 1 : 0, attributes.tileIndex.byteOffset + v * 2);
      raw.writeUInt32LE(v, index.byteOffset + v * 4);
    }
    layers.push({ kind, vertexCount, triangles, attributes, index, bounds: { min: [600, 0, 0], max: [602, 0, 0] }, sourceTriangles: triangles, geometricErrorM: 0 });
  }
  const tiles = sourceTiles.map((source, i) => ({ ...source, lods: undefined, treeFile: undefined, lod2Sha256: source.lods[0]?.sha256, treeSha256: source.treeFile.sha256, treeAnchors: source.treeFile.count, triangles: Object.fromEntries(kinds.map(kind => [kind, i === 0 || kind === 'trees' ? 1 : 0])) }));
  const catalog = { version: 1, format: 'town-overview-q16-v1', sourceManifestSha256: hash(manifestBytes), sourceReleaseDirectory: 'fixture', quantization: { origin: [0, 0, 0], scale: [1, 1, 1] }, asset: { url: '/town-overview/v1/fixture.bin.gz', compression: 'gzip' }, tiles, layers };
  const result = { catalog, manifestBytes, raw: raw.subarray(0, offset), compressedBytes: undefined };
  return refresh(result);
}
function refresh(f) {
  f.compressedBytes = gzipSync(f.raw);
  Object.assign(f.catalog.asset, { bytes: f.compressedBytes.length, decodedBytes: f.raw.length, sha256: hash(f.compressedBytes), decodedSha256: hash(f.raw) });
  f.catalog.contentHash = hash(f.raw); return f;
}

test('audits decoded owner coverage including source spill and a tree-only cell', () => {
  const f = fixture(), result = inspectTownOverview(f);
  assert.deepEqual({ tiles: result.tiles, triangles: result.triangles, buildings: result.buildings, sourceTreeAnchors: result.sourceTreeAnchors, draws: result.draws }, { tiles: 2, triangles: 6, buildings: 1, sourceTreeAnchors: 12, draws: 5 });
});
test('rejects omitted or duplicated manifest cells even if the packet still has triangles', () => {
  const omitted = fixture(); omitted.catalog.tiles.pop(); assert.throws(() => inspectTownOverview(omitted), /every source tile/);
  const duplicated = fixture(); duplicated.catalog.tiles[1].id = 'first'; assert.throws(() => inspectTownOverview(duplicated), /every source tile/);
});
test('requires actual per-owner geometry rather than trusting coverage counters', () => {
  const f = fixture(), trees = f.catalog.layers.at(-1);
  for (let v = 3; v < 6; v++) f.raw.writeUInt16LE(0, trees.attributes.tileIndex.byteOffset + v * 2);
  refresh(f); assert.throws(() => inspectTownOverview(f), /triangle counts disagree/);
});
test('rejects triangles that span source owners, which would break exact detail replacement', () => {
  const f = fixture(), layer = f.catalog.layers[0];
  f.raw.writeUInt16LE(1, layer.attributes.tileIndex.byteOffset + 2); refresh(f);
  assert.throws(() => inspectTownOverview(f), /crosses source ownership/);
});
test('checks compressed and decoded integrity independently', () => {
  const f = fixture(); f.compressedBytes = Buffer.from(f.compressedBytes); f.compressedBytes[12] ^= 1;
  assert.throws(() => inspectTownOverview(f), /compressed packet hash/);
  const rawMismatch = fixture(); rawMismatch.catalog.asset.decodedSha256 = 'd'.repeat(64);
  assert.throws(() => inspectTownOverview(rawMismatch), /decoded packet hash/);
});
test('rejects invalid indices and aliased attribute ranges', () => {
  const f = fixture(), layer = f.catalog.layers[0]; f.raw.writeUInt32LE(999, layer.index.byteOffset); refresh(f);
  assert.throws(() => inspectTownOverview(f), /index out of bounds/);
  const alias = fixture(); alias.catalog.layers[0].attributes.normal.byteOffset = alias.catalog.layers[0].attributes.color.byteOffset;
  assert.throws(() => inspectTownOverview(alias), /overlapping packet range/);
});
test('checks source pins, building inventories and decoded memory limits', () => {
  const pin = fixture(); pin.catalog.tiles[0].lod2Sha256 = 'd'.repeat(64); assert.throws(() => inspectTownOverview(pin), /LOD2 source pin/);
  const source = fixture(); source.catalog.tiles[0].sourceIds = []; assert.throws(() => inspectTownOverview(source), /building identities/);
  const budget = fixture(); budget.catalog.asset.decodedBytes = 33 * 1048576; assert.throws(() => inspectTownOverview(budget), /memory budget/);
});

async function publishedFixture(check) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'town-overview-audit-'));
  try {
    const f = fixture(), publicRoot = path.join(root, 'public'), releaseRoot = path.join(root, 'fixture'), directory = path.join(publicRoot, 'town-overview/v1'), catalogPath = path.join(root, 'overview.json');
    f.catalog.asset.rawUrl = '/town-overview/v1/fixture.bin';
    const catalogBytes = JSON.stringify(f.catalog);
    await mkdir(directory, { recursive: true }); await mkdir(releaseRoot);
    await Promise.all([writeFile(catalogPath, catalogBytes), writeFile(path.join(directory, 'overview.json'), catalogBytes), writeFile(path.join(directory, 'fixture.bin'), f.raw), writeFile(path.join(directory, 'fixture.bin.gz'), f.compressedBytes), writeFile(path.join(releaseRoot, 'manifest.json'), f.manifestBytes)]);
    await check({ f, directory, options: { catalogPath, releaseRoot, publicRoot } });
  } finally { await rm(root, { recursive: true, force: true }); }
}
test('verifies that the served raw fallback matches the independently decoded gzip content', async () => publishedFixture(async ({ f, directory, options }) => {
  assert.equal((await auditTownOverview(options)).tiles, 2);
  const changed = Buffer.from(f.raw); changed[changed.length - 1] ^= 1;
  await writeFile(path.join(directory, 'fixture.bin'), changed);
  await assert.rejects(auditTownOverview(options), /raw fallback content hash/);
}));
test('rejects a stale public catalog even when the checked-in derived catalog is valid', async () => publishedFixture(async ({ f, directory, options }) => {
  f.catalog.stats = { stale: true };
  await writeFile(path.join(directory, 'overview.json'), JSON.stringify(f.catalog));
  await assert.rejects(auditTownOverview(options), /public overview catalog differs/);
}));
