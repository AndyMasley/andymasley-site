import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

const root = path.resolve(import.meta.dirname, '..');
const output = process.argv[2];
if (!output) throw new Error('Usage: node scripts/extract-navigation-water.mjs /tmp/navigation-water-source.json');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const release = JSON.parse(fs.readFileSync(path.join(root, 'data/derived/town/release.json')));
const base = path.join(root, 'public/town-assets', release.directory);
const manifestBytes = fs.readFileSync(path.join(base, 'manifest.json'));
if (sha(manifestBytes) !== release.manifestSha256) throw new Error('Source manifest hash mismatch');
const manifest = JSON.parse(manifestBytes);
await MeshoptDecoder.ready;
const tiles = [];
for (const tile of manifest.tiles) {
  const lod = tile.lods.find(item => item.level === 0);
  if (!lod) continue;
  const bytes = fs.readFileSync(path.join(base, lod.url));
  if (sha(bytes) !== lod.sha256) throw new Error(`Source tile hash mismatch: ${tile.id}`);
  const jsonLength = bytes.readUInt32LE(12);
  const gltf = JSON.parse(bytes.subarray(20, 20 + jsonLength));
  const water = new Set(gltf.materials?.flatMap((material, i) => material.name === 'Mapped water | inferred level and appearance' ? [i] : []) ?? []);
  if (!water.size) continue;
  const bin = bytes.subarray(28 + jsonLength);
  const views = new Map();
  const accessor = id => {
    const a = gltf.accessors[id], view = gltf.bufferViews[a.bufferView];
    if (a.sparse || a.normalized) throw new Error('Unexpected normalized/sparse water accessor');
    let data = views.get(a.bufferView);
    if (!data) {
      const extension = view.extensions?.EXT_meshopt_compression;
      if (extension) {
        data = new Uint8Array(extension.count * extension.byteStride);
        MeshoptDecoder.decodeGltfBuffer(data, extension.count, extension.byteStride, bin.subarray(extension.byteOffset, extension.byteOffset + extension.byteLength), extension.mode, extension.filter);
      } else data = bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);
      views.set(a.bufferView, data);
    }
    const componentBytes = { 5123: 2, 5125: 4, 5126: 4 }[a.componentType];
    const components = { SCALAR: 1, VEC3: 3 }[a.type];
    if (!componentBytes || !components) throw new Error('Unexpected water accessor component');
    const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const stride = view.byteStride ?? componentBytes * components;
    const read = a.componentType === 5126 ? 'getFloat32' : a.componentType === 5125 ? 'getUint32' : 'getUint16';
    return { count: a.count, get: (i, k = 0) => dv[read]((a.byteOffset ?? 0) + i * stride + k * componentBytes, true) };
  };
  const triangles = [];
  for (const node of gltf.nodes ?? []) {
    if (node.mesh === undefined) continue;
    for (const primitive of gltf.meshes[node.mesh].primitives) {
      if (!water.has(primitive.material)) continue;
      if (['matrix', 'translation', 'rotation', 'scale', 'children'].some(key => key in node) || (gltf.nodes ?? []).some(parent => parent.children?.includes(gltf.nodes.indexOf(node)))) throw new Error('Water node transform requires an explicit extraction update');
      if (primitive.mode !== undefined && primitive.mode !== 4) throw new Error('Water must use triangles');
      const positions = accessor(primitive.attributes.POSITION);
      const indices = primitive.indices === undefined ? null : accessor(primitive.indices);
      for (let i = 0; i < (indices?.count ?? positions.count); i += 3) {
        const triangle = [0, 1, 2].map(k => {
          const index = indices?.get(i + k) ?? i + k;
          return [positions.get(index, 0) + tile.origin[0], -positions.get(index, 2) - tile.origin[2]];
        });
        triangles.push(triangle);
      }
    }
  }
  tiles.push({ id: tile.id, sha256: lod.sha256, triangles });
}
fs.writeFileSync(output, JSON.stringify({ version: 1, sourceManifestSha256: release.manifestSha256, sourceAssetRelease: release.directory, coordinates: 'Source mesh transformed from x,y,-north to local east,north metres. EPSG:6491 minus horizontalOrigin.', horizontalOrigin: manifest.coordinates.horizontalOrigin, tiles }));
console.log(JSON.stringify({ tiles: tiles.length, triangles: tiles.reduce((n, tile) => n + tile.triangles.length, 0), output, sha256: sha(fs.readFileSync(output)) }));
