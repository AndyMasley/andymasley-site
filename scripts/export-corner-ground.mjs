/** Export the exact terrain immediately after the existing ground repairs. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
const site = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = process.env.WEBSTER_CORNER_GROUND || '/private/tmp/webster-finished-game/roads/corner-ground';
fs.mkdirSync(out, { recursive: true });
const read = p => JSON.parse(fs.readFileSync(p)), hash = b => createHash('sha256').update(b).digest('hex');
const data = n => read(`${site}/data/derived/town/${n}.json`);
const release = data('release'), base = `${site}/public/town-assets/${release.directory}/`, manifest = read(base + 'manifest.json');
const corners = data('street-corners-index'), terrain = data('terrain-finish-index'), environment = data('environment-ground-index');
const packet = a => a ? read(site + '/public' + a.url) : undefined;
const selection = new Set();
for (const asset of Object.values(corners.tiles)) for (const f of packet(asset).features) if (f.kind === 'sidewalk') for (const tri of f.triangles) for (const p of tri) {
  for (let x = Math.floor((p[0] - 3.1) / 250); x <= Math.floor((p[0] + 3.1) / 250); x++) for (let y = Math.floor((p[1] - 3.1) / 250); y <= Math.floor((p[1] + 3.1) / 250); y++) selection.add(`${x}_${y}`);
}
fs.writeFileSync(out + '/entry.ts', `export {applyTerrainFinish,terrainGeometryStamp} from ${JSON.stringify(site + '/src/lib/town/terrain-finish')}; export {applyEnvironmentGround} from ${JSON.stringify(site + '/src/lib/town/environment-ground')};`);
await build({ entryPoints: [out + '/entry.ts'], outfile: out + '/export.mjs', bundle: true, platform: 'node', format: 'esm', logLevel: 'silent', plugins: [{ name: 'three', setup(b) { b.onResolve({ filter: /^three$/ }, () => ({ path: fileURLToPath(import.meta.resolve('three')), external: true })); } }] });
const api = await import(pathToFileURL(out + '/export.mjs').href), loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
loader.register(() => ({ name: 'NATIVE_TEXTURE_PLACEHOLDER', loadTexture() { return Promise.resolve(new THREE.DataTexture(new Uint8Array([255,255,255,255]), 1, 1)); } }));
let rows = 0;
for (const tile of manifest.tiles.filter(t => selection.has(t.id))) for (const lod of tile.lods) {
  const raw = fs.readFileSync(base + lod.url); if (hash(raw) !== lod.sha256) throw Error('Source changed');
  const group = (await loader.parseAsync(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength), pathToFileURL(path.dirname(base + lod.url) + '/').href)).scene;
  const tr = api.applyTerrainFinish(group, tile.id, tile.origin, lod.level, packet(terrain.tiles[tile.id]?.levels[lod.level]));
  const en = api.applyEnvironmentGround(group, tile.id, tile.origin, lod.level, packet(environment.tiles[tile.id]?.levels[lod.level]));
  if (tr?.rejected || en?.rejected) throw Error('Existing ground rejected');
  group.updateMatrixWorld(true); const inverse = group.matrixWorld.clone().invert(), point = new THREE.Vector3();
  const row = { tileId: tile.id, level: lod.level, sourceSha256: lod.sha256, terrain: [], paved: [] };
  group.traverse(o => {
    if (!o.isMesh) return;
    const g = o.geometry, p = g.getAttribute('position'), count = g.index?.count ?? p.count, matrix = inverse.clone().multiply(o.matrixWorld), materials = Array.isArray(o.material) ? o.material : [o.material];
    const triangles = [];
    for (let i = 0; i < count; i += 3) triangles.push([0,1,2].map(k => { point.fromBufferAttribute(p, g.index?.getX(i+k) ?? i+k).applyMatrix4(matrix); return [point.x + tile.origin[0], -point.z - tile.origin[2], point.y + tile.origin[1]]; }));
    if (/^terrain(?:\b|_)/i.test(o.name)) row.terrain.push({ mesh: o.name, geometryStamp: api.terrainGeometryStamp(g), positions: p.count, triangles: count/3, faces: triangles });
    else for (const range of g.groups.length ? g.groups : [{start:0,count,materialIndex:0}]) {
      const name = materials[range.materialIndex ?? 0].name;
      if (/^(Drive road \| asphalt|Streetscape \| .*concrete|Streetscape \| parking apron asphalt)$/.test(name)) row.paved.push(...triangles.slice(range.start/3, (range.start+range.count)/3));
    }
  });
  fs.writeFileSync(`${out}/${tile.id}-${lod.level}.source.json.gz`, gzipSync(JSON.stringify(row)));
  const gs = new Set(), ms = new Set(); group.traverse(o => { if(o.isMesh) {gs.add(o.geometry); for(const m of Array.isArray(o.material)?o.material:[o.material]) ms.add(m);} });
  gs.forEach(g => g.dispose()); ms.forEach(m => {for(const v of Object.values(m)) if(v?.isTexture) v.dispose();m.dispose();});
  if (++rows % 30 === 0) console.log('Exported', rows);
}
console.log('Exported levels', rows);
