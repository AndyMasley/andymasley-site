// The scenery's inferred buildings, per level-0 tile, for the outbuilding step
// of prepare.py: every triangle of the V2 building meshes as a role code and
// three east/north/height vertices (float32 x 10), written to <out>/<tile>.f32.
// Roles: 0 roof, 1 flat roof, 2 foundation, 3 wall, 4 glass, 5 door (trim is left out).
// Usage: node scripts/measured_roofs/v2-buildings.mjs <out dir>
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

const site = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const out = process.argv[2];
if (!out) throw new Error('usage: v2-buildings.mjs <out dir>');
const assets = resolve(site, 'public/town-assets');
const [release] = (await readdir(assets, { withFileTypes: true })).filter(d => d.isDirectory()).map(d => d.name).sort().reverse();
const dir = resolve(assets, release);
const manifest = JSON.parse(await readFile(resolve(dir, 'manifest.json'), 'utf8'));

// Node has no image decoder: drop textures before parsing; geometry is untouched.
function geometryOnly(buffer) {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const jsonLength = view.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(buffer.subarray(20, 20 + jsonLength)));
  delete json.images; delete json.textures; delete json.samplers;
  for (const m of json.materials ?? []) {
    for (const k of Object.keys(m)) if (/Texture$/.test(k)) delete m[k];
    if (m.pbrMetallicRoughness) for (const k of Object.keys(m.pbrMetallicRoughness)) if (/Texture$/.test(k)) delete m.pbrMetallicRoughness[k];
    delete m.extensions;
  }
  if (json.extensionsUsed) json.extensionsUsed = json.extensionsUsed.filter(e => e === 'EXT_meshopt_compression' || e === 'KHR_mesh_quantization');
  const text = new TextEncoder().encode(JSON.stringify(json)), pad = (4 - text.length % 4) % 4;
  const padded = new Uint8Array(text.length + pad); padded.set(text); padded.fill(32, text.length);
  const rest = buffer.subarray(20 + jsonLength), result = new Uint8Array(20 + padded.length + rest.length), header = new DataView(result.buffer);
  header.setUint32(0, 0x46546C67, true); header.setUint32(4, 2, true); header.setUint32(8, result.length, true);
  header.setUint32(12, padded.length, true); header.setUint32(16, 0x4E4F534A, true);
  result.set(padded, 20); result.set(rest, 20 + padded.length);
  return result.buffer;
}

const role = name => /\| glass/.test(name) ? 4 : /\| door/.test(name) ? 5 : /\| trim/.test(name) ? -1 : /\| roof$/.test(name) ? 0
  : /\| flat_roof/.test(name) ? 1 : /\| foundation/.test(name) ? 2 : /^V2 inferred \| /.test(name) ? 3 : -1;
const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
await mkdir(out, { recursive: true });
let triangles = 0, tiles = 0;
for (const tile of manifest.tiles) {
  const lod = tile.lods?.[0]; if (!lod) continue;
  const gltf = await new Promise((ok, fail) => readFile(resolve(dir, lod.url)).then(b => loader.parse(geometryOnly(b), '', ok, fail), fail));
  gltf.scene.updateMatrixWorld(true);
  const rows = [], v = new THREE.Vector3();
  gltf.scene.traverse(o => {
    if (!o.isMesh || o.parent?.name !== 'buildings') return;
    const materials = [o.material].flat(), g = o.geometry, position = g.getAttribute('position'), index = g.index;
    for (const part of g.groups.length ? g.groups : [{ start: 0, count: index ? index.count : position.count, materialIndex: 0 }]) {
      const code = role(materials[part.materialIndex ?? 0]?.name ?? ''); if (code < 0) continue;
      for (let i = part.start; i + 2 < part.start + part.count; i += 3) {
        rows.push(code);
        for (let k = 0; k < 3; k++) { v.fromBufferAttribute(position, index ? index.getX(i + k) : i + k).applyMatrix4(o.matrixWorld); rows.push(v.x + tile.origin[0], -(v.z + tile.origin[2]), v.y + tile.origin[1]); }
      }
    }
  });
  if (rows.length) { await writeFile(resolve(out, `${tile.id}.f32`), Buffer.from(new Float32Array(rows).buffer)); triangles += rows.length / 10; tiles++; }
}
console.log(JSON.stringify({ tiles, triangles }));
