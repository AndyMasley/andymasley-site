/** Independent checks for the shipped regional cover texture and canopy packet. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = name => readFileSync(path.join(root, name));
const json = name => JSON.parse(read(name));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const release = json('data/derived/town/release.json');
const landcover = json('data/derived/town/landcover.json');
const canopy = json('data/derived/town/regional-canopy.json');
const horizon = json('data/derived/town/horizon.json');
const MiB = 1048576;

function packet(catalog, format, publicName, maxRaw, maxGzip) {
  assert.equal(catalog.version, 1); assert.equal(catalog.format, format);
  assert.equal(catalog.sourceManifestSha256, release.manifestSha256);
  assert.deepEqual(json(`public/town-landcover/v1/${publicName}.json`), catalog);
  const provenance = catalog.provenance;
  assert.ok(provenance, 'Source provenance is required');
  assert.equal(provenance.builderSha256, hash(read('scripts/horizon/prepare_landcover.py')), 'Rebake after changing the builder');
  assert.equal(provenance.groundMeshSha256, horizon.asset.decodedSha256, 'Canopy must use the shipped terrain');
  assert.equal(provenance.sourceTerrainCoverageSha256, horizon.provenance.sourceTerrainCoverageSha256);
  assert.match(provenance.sourceWaterSha256, /^[a-f0-9]{64}$/);
  const acquisition = provenance.acquisition;
  assert.equal(acquisition.referenceYear, 2025); assert.equal(acquisition.crs, 'EPSG:6491');
  assert.equal(acquisition.spacingM, 30); assert.deepEqual(acquisition.localBounds, [-40020, -40020, 40020, 40020]);
  assert.deepEqual(acquisition.shape, [2668, 2668]); assert.equal(acquisition.rowOrder, 'north-up; row0atmaximumcanonicalnorth');
  assert.match(acquisition.archive.sha256, /^[a-f0-9]{64}$/);
  for (const role of ['canopy', 'landcover', 'impervious_descriptor', 'impervious_fraction']) {
    const source = acquisition.records[role], derived = acquisition.derived[role];
    assert.equal(source.year, 2025); assert.equal(source.sourceCRS, 'EPSG:5070');
    assert.match(source.sha256, /^[a-f0-9]{64}$/); assert.match(derived.sha256, /^[a-f0-9]{64}$/);
    assert.equal(derived.sourceSha256, source.sha256);
    assert.equal(new URL(source.query).searchParams.get('TIME'), '2025-01-01T00:00:00Z');
    assert.equal(Object.values(derived.counts).reduce((sum, count) => sum + count, 0), 2668 * 2668);
  }
  const { asset } = catalog;
  assert.equal(asset.compression, 'gzip');
  for (const url of [asset.url, asset.rawUrl]) assert.match(url, /^\/town-landcover\/v1\/[a-zA-Z0-9.-]+$/);
  assert.notEqual(asset.url, asset.rawUrl);
  const compressed = read('public' + asset.url), raw = read('public' + asset.rawUrl);
  assert.equal(compressed.length, asset.bytes); assert.equal(raw.length, asset.decodedBytes);
  assert.equal(hash(compressed), asset.sha256); assert.equal(hash(raw), asset.decodedSha256);
  assert.deepEqual(gunzipSync(compressed, { maxOutputLength: maxRaw }), raw);
  assert.ok(raw.length <= maxRaw, `${publicName} exceeds decoded budget`);
  assert.ok(compressed.length <= maxGzip, `${publicName} exceeds transfer budget`);
  return raw;
}

const textureBytes = packet(landcover, 'town-landcover-rgba-v1', 'landcover', 16 * MiB, 8 * MiB);
const { texture } = landcover;
assert.equal(texture.width, 2048); assert.equal(texture.height, 2048);
assert.deepEqual(texture.bounds, [-40020, -40020, 40020, 40020]);
assert.equal(texture.colorSpace, 'linear'); assert.equal(texture.rowOrder, 'north-to-south');
assert.equal(textureBytes.length, texture.width * texture.height * 4);
let fullyCovered = 0, transition = 0, outside = 0;
for (let row = 0; row < texture.height; row++) for (let col = 0; col < texture.width; col++) {
  const x = texture.bounds[0] + (col + .5) * (texture.bounds[2] - texture.bounds[0]) / texture.width;
  const north = texture.bounds[3] - (row + .5) * (texture.bounds[3] - texture.bounds[1]) / texture.height;
  const radius = Math.hypot(x, north), alpha = textureBytes[(row * texture.width + col) * 4 + 3];
  if (radius >= 40000) { assert.equal(alpha, 0, 'Cover must not bleed beyond its surveyed radius'); outside++; }
  else if (radius < 33000 && alpha === 255) fullyCovered++;
  else if (radius > 34000 && alpha > 0 && alpha < 255) transition++;
}
assert.ok(fullyCovered > texture.width * texture.height * .1, 'Interior mapped cover is missing');
assert.ok(transition > 10000, 'A broad coverage fade is required');
assert.ok(outside > 0);

const raw = packet(canopy, 'town-regional-canopy-f32-v1', 'canopy', 2 * MiB, MiB);
const { instances, model } = canopy;
assert.ok(Number.isSafeInteger(instances.count) && instances.count > 0 && instances.count <= 25000);
assert.equal(raw.length, instances.count * 32);
assert.ok(instances.count * 20 <= 500000, 'Canopy exceeds its 20-face envelope budget');
assert.equal(model.earthRadiusM, 6371008.8); assert.equal(model.verticalOffsetM, 100); assert.equal(model.outerDistanceM, 6000);
const ranges = [];
function attribute(name, size) {
  const description = instances.attributes[name];
  assert.ok(description, `${name} is missing`);
  assert.equal(description.componentType, 'float32'); assert.equal(description.count, instances.count); assert.equal(description.itemSize, size);
  const offset = description.byteOffset, end = offset + instances.count * size * 4;
  assert.ok(Number.isSafeInteger(offset) && offset >= 0 && offset % 4 === 0);
  assert.ok(end <= raw.length, `${name} extends beyond the packet`);
  for (const [start, stop] of ranges) assert.ok(end <= start || offset >= stop, 'Attributes must not overlap');
  ranges.push([offset, end]);
  return (index, axis = 0) => raw.readFloatLE(offset + (index * size + axis) * 4);
}
const anchor = attribute('anchor', 3), size = attribute('size', 3), seed = attribute('seed', 1), edge = attribute('edgeDistance', 1);
const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
let near = 0, far = 0;
for (let i = 0; i < instances.count; i++) {
  const point = [0, 1, 2].map(axis => anchor(i, axis)), scale = [0, 1, 2].map(axis => size(i, axis));
  assert.ok([...point, ...scale, seed(i), edge(i)].every(Number.isFinite), `Instance ${i} has a nonfinite attribute`);
  assert.ok(Math.hypot(point[0], point[2]) <= 20000); assert.ok(point[1] >= -150 && point[1] <= 1500);
  assert.ok(scale[0] >= 2 && scale[0] <= 150 && scale[2] >= 2 && scale[2] <= 150);
  assert.ok(scale[1] >= 3 && scale[1] <= 45);
  assert.ok(seed(i) >= 0 && seed(i) <= 1); assert.ok(edge(i) >= 0 && edge(i) <= 6000);
  if (edge(i) < 500) near++; if (edge(i) > 3000) far++;
  point.forEach((value, axis) => { min[axis] = Math.min(min[axis], value); max[axis] = Math.max(max[axis], value); });
}
assert.ok(near > 0 && far > 0, 'Canopy must cover both the town edge and its coarser exterior band');
console.log(JSON.stringify({ passed: true, texture: { width: texture.width, height: texture.height, decodedBytes: textureBytes.length, transferBytes: landcover.asset.bytes, fullyCovered, transition, outside }, canopy: { count: instances.count, triangles: instances.count * 20, decodedBytes: raw.length, transferBytes: canopy.asset.bytes, near, far, anchorBounds: { min, max } } }));
