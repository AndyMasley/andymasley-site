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
const release = json('data/derived/town/release.json'), catalog = json('data/derived/town/horizon.json');
assert.equal(catalog.version, 1); assert.equal(catalog.format, 'town-horizon-f32-v1');
assert.equal(catalog.sourceManifestSha256, release.manifestSha256);
assert.deepEqual(json('public/town-horizon/v1/horizon.json'), catalog);
const { asset, mesh, model } = catalog;
assert.equal(model.earthRadiusM, 6371008.8); assert.equal(model.verticalOffsetM, 100); assert.equal(model.refraction, false);
assert.ok(model.radiusM >= 280000 && model.radiusM <= 300000);
for (const url of [asset.url, asset.rawUrl]) assert.match(url, /^\/town-horizon\/v1\/[a-zA-Z0-9.-]+$/);
const packed = read('public' + asset.url), raw = read('public' + asset.rawUrl);
assert.equal(packed.length, asset.bytes); assert.equal(raw.length, asset.decodedBytes);
assert.equal(hash(packed), asset.sha256); assert.equal(hash(raw), asset.decodedSha256);
assert.deepEqual(gunzipSync(packed), raw);
assert.ok(packed.length <= 8 * 1048576); assert.ok(raw.length <= 12 * 1048576);
assert.ok(mesh.vertexCount > 3 && mesh.vertexCount <= 200000); assert.ok(mesh.triangles > 0 && mesh.triangles <= 450000);
const ranges = [];
function attribute(description, type, count, size) {
  const width = { float32: 4, int8: 1, uint8: 1, uint32: 4 }[type];
  assert.equal(description.componentType, type); assert.equal(description.count, count); assert.equal(description.itemSize, size);
  assert.ok(Number.isSafeInteger(description.byteOffset) && description.byteOffset >= 0 && description.byteOffset % 4 === 0);
  const end = description.byteOffset + count * size * width; assert.ok(end <= raw.length);
  for (const range of ranges) assert.ok(end <= range[0] || description.byteOffset >= range[1], 'Attribute ranges overlap');
  ranges.push([description.byteOffset, end]); return description.byteOffset;
}
const pos = attribute(mesh.attributes.position, 'float32', mesh.vertexCount, 3);
attribute(mesh.attributes.normal, 'int8', mesh.vertexCount, 3); attribute(mesh.attributes.color, 'uint8', mesh.vertexCount, 3);
const indices = attribute(mesh.index, 'uint32', mesh.triangles * 3, 1);
const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
for (let i = 0; i < mesh.vertexCount; i++) {
  const point = [0, 1, 2].map(axis => raw.readFloatLE(pos + (i * 3 + axis) * 4));
  assert.ok(point.every(Number.isFinite)); assert.ok(Math.hypot(point[0], point[2]) <= model.radiusM + 5000);
  assert.ok(point[1] >= -200 && point[1] <= 3000);
  point.forEach((value, axis) => { min[axis] = Math.min(min[axis], value); max[axis] = Math.max(max[axis], value); });
}
for (let i = 0; i < mesh.triangles * 3; i++) assert.ok(raw.readUInt32LE(indices + i * 4) < mesh.vertexCount);
for (let axis = 0; axis < 3; axis++) {
  assert.ok(Math.abs(min[axis] - mesh.bounds.min[axis]) < .05); assert.ok(Math.abs(max[axis] - mesh.bounds.max[axis]) < .05);
}
console.log(JSON.stringify({ passed: true, radiusM: model.radiusM, vertices: mesh.vertexCount, triangles: mesh.triangles, transferBytes: packed.length, decodedBytes: raw.length, bounds: { min, max } }));
