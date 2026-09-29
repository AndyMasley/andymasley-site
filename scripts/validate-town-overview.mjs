#!/usr/bin/env node
/** Independent, read-only audit of the persistent whole-town overview packet. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const KINDS = ['terrain', 'water', 'roads', 'buildings', 'trees'];
const WIDTH = { uint16: 2, int8: 1, uint8: 1, uint32: 4 };
export const OVERVIEW_AUDIT_LIMITS = { triangles: 1250000, decodedBytes: 24.5 * 1048576, transferBytes: 12 * 1048576, vertices: 1800000 };
const hash = value => createHash('sha256').update(value).digest('hex');
const integer = value => Number.isSafeInteger(value) && value >= 0;
const vector = value => Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);
const same = (a, b, message) => assert.deepEqual(a, b, message);

/** This deliberately does not import the runtime decoder or builder. Coverage
 * is recomputed from the decoded triangle owners, not catalog claims alone. */
export function inspectTownOverview({ catalog, manifestBytes, compressedBytes }) {
  const manifest = JSON.parse(manifestBytes.toString());
  assert.equal(catalog.version, 1, 'unsupported overview version');
  assert.equal(catalog.format, 'town-overview-q16-v1', 'unsupported overview format');
  assert.equal(catalog.sourceManifestSha256, hash(manifestBytes), 'source manifest hash mismatch');
  assert(Array.isArray(catalog.tiles), 'missing overview tile inventory');
  same(catalog.tiles.map(tile => tile.id), manifest.tiles.map(tile => tile.id), 'overview must represent every source tile in manifest order');
  assert.equal(new Set(catalog.tiles.map(tile => tile.id)).size, catalog.tiles.length, 'duplicate tile owner');
  same(catalog.layers.map(layer => layer.kind), KINDS, 'overview must contain exactly the five category batches');
  assert(vector(catalog.quantization?.origin) && vector(catalog.quantization?.scale) && catalog.quantization.scale.every(n => n > 0), 'invalid world quantization');
  const asset = catalog.asset;
  assert.equal(asset.compression, 'gzip', 'unsupported overview compression');
  assert(compressedBytes.length <= OVERVIEW_AUDIT_LIMITS.transferBytes, 'overview exceeds compact transfer budget');
  assert.equal(asset.bytes, compressedBytes.length, 'compressed byte count mismatch');
  assert.equal(asset.sha256, hash(compressedBytes), 'compressed packet hash mismatch');
  assert(integer(asset.decodedBytes) && asset.decodedBytes <= OVERVIEW_AUDIT_LIMITS.decodedBytes, 'overview exceeds decoded memory budget');
  const raw = gunzipSync(compressedBytes, { maxOutputLength: OVERVIEW_AUDIT_LIMITS.decodedBytes });
  assert.equal(raw.length, asset.decodedBytes, 'decoded byte count mismatch');
  assert.equal(asset.decodedSha256, hash(raw), 'decoded packet hash mismatch');
  assert.equal(catalog.contentHash, asset.decodedSha256, 'overview content hash mismatch');
  const actual = catalog.tiles.map(() => Object.fromEntries(KINDS.map(kind => [kind, 0]))), ranges = [];
  let triangles = 0, vertices = 0;
  const descriptor = (value, count, itemSize, componentType, label) => {
    assert(value && integer(value.byteOffset) && value.byteOffset % 4 === 0, `${label}: misaligned offset`);
    assert.equal(value.count, count, `${label}: count mismatch`);
    assert.equal(value.itemSize, itemSize, `${label}: item size mismatch`);
    assert.equal(value.componentType, componentType, `${label}: component type mismatch`);
    const end = value.byteOffset + count * itemSize * WIDTH[componentType];
    assert(end <= raw.length, `${label}: packet range exceeds decoded bytes`);
    if (end > value.byteOffset) ranges.push({ start: value.byteOffset, end, label });
    return value.byteOffset;
  };
  for (const layer of catalog.layers) {
    assert(integer(layer.vertexCount) && integer(layer.triangles), `${layer.kind}: invalid geometry counts`);
    vertices += layer.vertexCount; triangles += layer.triangles;
    const position = descriptor(layer.attributes.position, layer.vertexCount, 3, 'uint16', `${layer.kind}.position`);
    descriptor(layer.attributes.normal, layer.vertexCount, 3, 'int8', `${layer.kind}.normal`);
    descriptor(layer.attributes.color, layer.vertexCount, 3, 'uint8', `${layer.kind}.color`);
    const owner = descriptor(layer.attributes.tileIndex, layer.vertexCount, 1, 'uint16', `${layer.kind}.tileIndex`);
    const index = descriptor(layer.index, layer.triangles * 3, 1, 'uint32', `${layer.kind}.index`);
    assert(vector(layer.bounds?.min) && vector(layer.bounds?.max), `${layer.kind}: missing bounds`);
    const owners = new Uint16Array(layer.vertexCount);
    for (let v = 0; v < layer.vertexCount; v++) {
      owners[v] = raw.readUInt16LE(owner + v * 2);
      assert(owners[v] < catalog.tiles.length, `${layer.kind}: vertex references unknown source owner`);
      for (let axis = 0; axis < 3; axis++) {
        const world = catalog.quantization.origin[axis] + raw.readUInt16LE(position + v * 6 + axis * 2) * catalog.quantization.scale[axis];
        const tolerance = catalog.quantization.scale[axis] * .501 + 1e-5;
        assert(world >= layer.bounds.min[axis] - tolerance && world <= layer.bounds.max[axis] + tolerance, `${layer.kind}: decoded world position outside recorded bounds`);
      }
    }
    for (let t = 0; t < layer.triangles; t++) {
      const indices = [0, 1, 2].map(corner => raw.readUInt32LE(index + (t * 3 + corner) * 4));
      assert(indices.every(v => v < layer.vertexCount), `${layer.kind}: triangle index out of bounds`);
      const tile = owners[indices[0]];
      assert(indices.every(v => owners[v] === tile), `${layer.kind}: triangle crosses source ownership`);
      actual[tile][layer.kind]++;
    }
  }
  assert(triangles <= OVERVIEW_AUDIT_LIMITS.triangles, 'overview exceeds triangle budget');
  assert(vertices <= OVERVIEW_AUDIT_LIMITS.vertices, 'overview exceeds vertex budget');
  ranges.sort((a, b) => a.start - b.start);
  for (let i = 1; i < ranges.length; i++) assert(ranges[i].start >= ranges[i - 1].end, `${ranges[i].label}: overlapping packet range`);
  assert(raw.length - (ranges.at(-1)?.end ?? 0) <= 3, 'unclaimed trailing packet data');
  let buildings = 0, trees = 0;
  catalog.tiles.forEach((tile, i) => {
    const source = manifest.tiles[i], lod = source.lods.find(lod => lod.level === 2);
    same(tile.origin, source.origin, `${tile.id}: changed source origin`);
    same(tile.bounds, source.bounds, `${tile.id}: changed source bounds`);
    same(tile.sourceIds, source.sourceIds ?? [], `${tile.id}: missing source building identities`);
    assert.equal(tile.treeAnchors, source.treeFile?.count ?? 0, `${tile.id}: tree anchor inventory mismatch`);
    assert.equal(tile.lod2Sha256, lod?.sha256, `${tile.id}: LOD2 source pin mismatch`);
    assert.equal(tile.treeSha256, source.treeFile?.sha256, `${tile.id}: tree source pin mismatch`);
    same(tile.triangles, actual[i], `${tile.id}: catalog triangle counts disagree with actual packet`);
    assert(Object.values(actual[i]).some(count => count > 0), `${tile.id}: source cell has no overview geometry`);
    if (tile.sourceIds.length) assert(actual[i].buildings > 0, `${tile.id}: populated source cell lost all buildings`);
    if (tile.treeAnchors) assert(actual[i].trees > 0, `${tile.id}: wooded source cell lost all canopy`);
    buildings += tile.sourceIds.length; trees += tile.treeAnchors;
  });
  return { tiles: catalog.tiles.length, buildings, sourceTreeAnchors: trees, triangles, vertices, draws: catalog.layers.length, transferBytes: compressedBytes.length, decodedBytes: raw.length, sourceManifestSha256: catalog.sourceManifestSha256 };
}

export async function auditTownOverview({ catalogPath, releaseRoot, publicRoot = path.join(ROOT, 'public') }) {
  const catalogBytes = await readFile(catalogPath), catalog = JSON.parse(catalogBytes.toString());
  assert.equal(catalog.sourceReleaseDirectory, path.basename(releaseRoot), 'overview source release directory mismatch');
  const assetPath = url => {
    assert(typeof url === 'string', 'invalid overview asset URL');
    const decoded = decodeURIComponent(url);
    assert(decoded.startsWith('/town-overview/') && !/[\\?#\x00-\x1f]/.test(decoded) && !decoded.split('/').includes('..'), 'invalid overview asset URL');
    const absolute = path.resolve(publicRoot, '.' + decoded);
    assert(absolute.startsWith(path.resolve(publicRoot) + path.sep), 'overview asset escapes public root');
    return absolute;
  };
  const publicCatalog = await readFile(path.join(publicRoot, 'town-overview/v1/overview.json'));
  assert(catalogBytes.equals(publicCatalog), 'public overview catalog differs from derived catalog');
  const raw = await readFile(assetPath(catalog.asset.rawUrl));
  assert.equal(raw.length, catalog.asset.decodedBytes, 'raw fallback byte count mismatch');
  assert.equal(hash(raw), catalog.asset.decodedSha256, 'raw fallback content hash mismatch');
  return inspectTownOverview({ catalog, manifestBytes: await readFile(path.join(releaseRoot, 'manifest.json')), compressedBytes: await readFile(assetPath(catalog.asset.url)) });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const catalogPath = process.argv[2] ?? path.join(ROOT, 'data/derived/town/overview.json');
  const release = JSON.parse(await readFile(path.join(ROOT, 'data/derived/town/release.json'), 'utf8'));
  const result = await auditTownOverview({ catalogPath: path.resolve(catalogPath), releaseRoot: process.argv[3] ? path.resolve(process.argv[3]) : path.join(ROOT, 'public/town-assets', release.directory) });
  console.log(JSON.stringify(result, null, 2));
}
