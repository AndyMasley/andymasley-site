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
const out = process.env.WEBSTER_STREET_AUDIT ?? '/private/tmp/webster-finished-game/roads';
fs.mkdirSync(out, { recursive: true });
const read = p => JSON.parse(fs.readFileSync(p));
const release = read(site + '/data/derived/town/release.json'), base = site + '/public/town-assets/' + release.directory + '/';
const manifest = read(base + 'manifest.json');
const source = out + '/street-entry.ts', compiled = out + '/street-native.mjs';
fs.writeFileSync(source, `export { applyStreetGeometry } from ${JSON.stringify(site + '/src/lib/town/street-geometry')};\nexport { applyMeasuredBridgeSurface } from ${JSON.stringify(site + '/src/lib/town/bridge-surface')};\nexport { applyStreetCorners } from ${JSON.stringify(site + '/src/lib/town/street-corners')};`);
await build({ entryPoints: [source], outfile: compiled, bundle: true, format: 'esm', platform: 'node', logLevel: 'silent', plugins: [{ name: 'shared-three', setup(b) { b.onResolve({ filter: /^three$/ }, () => ({ path: fileURLToPath(import.meta.resolve('three')), external: true })); } }] });
const api = await import(pathToFileURL(compiled).href);
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
loader.register(() => ({ name: 'NATIVE_TEXTURE_STUB', loadTexture() { return Promise.resolve(new THREE.DataTexture(new Uint8Array([255,255,255,255]), 1, 1)); } }));
const selection = process.env.WEBSTER_STREET_TILES?.split(',');
const corners = read(site + '/data/derived/town/street-corners-index.json');
const result = { sourceManifest: release.manifestSha256, rows: [], failures: [] };
for (const tile of manifest.tiles.filter(t => !selection || selection.includes(t.id))) for (const lod of tile.lods) {
  const raw = fs.readFileSync(base + lod.url);
  if (createHash('sha256').update(raw).digest('hex') !== lod.sha256) throw Error('Source hash mismatch');
  const scene = (await loader.parseAsync(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength), pathToFileURL(path.dirname(base + lod.url) + '/').href)).scene;
  api.applyMeasuredBridgeSurface(scene, tile.id, tile.origin);
  const cornerAsset = corners.tiles[tile.id];
  const cornerReport = api.applyStreetCorners(scene, tile.id, tile.origin, lod.level, lod.sha256, cornerAsset ? read(site + '/public' + cornerAsset.url) : undefined);
  if (cornerReport.rejected) result.failures.push({ id: tile.id, level: lod.level, error: 'Corner packet rejected' });
  const protectedGeometry = [];
  scene.traverse(o => { if (o.isMesh && !(Array.isArray(o.material) ? o.material : [o.material]).some(m => m.name === 'Drive road | weathered shoulder')) protectedGeometry.push([o, o.geometry]); });
  const start = performance.now(), report = api.applyStreetGeometry(scene), ms = performance.now() - start;
  if (protectedGeometry.some(([o, g]) => o.geometry !== g)) result.failures.push({ id: tile.id, level: lod.level, error: 'Non-shoulder geometry changed' });
  const domain = { tileId: tile.id, level: lod.level, pavement: [], shoulder: [], corners: [] }, point = new THREE.Vector3();
  scene.updateMatrixWorld(true); const inverse = scene.matrixWorld.clone().invert();
  scene.traverse(o => {
    if (!o.isMesh) return;
    const g = o.geometry, p = g.getAttribute('position'); if (!p) return;
    const count = g.index?.count ?? p.count, materials = Array.isArray(o.material) ? o.material : [o.material], matrix = inverse.clone().multiply(o.matrixWorld);
    for (const range of g.groups.length ? g.groups : [{ start: 0, count, materialIndex: 0 }]) {
      const name = materials[range.materialIndex ?? 0].name;
      const target = name === 'Drive road | weathered shoulder' ? domain.shoulder : ['Drive road | asphalt','Streetscape | parking apron asphalt','Finished street corner | asphalt apron'].includes(name) ? domain.pavement : o.name === 'finished_street_corner_sidewalk' ? domain.corners : null;
      if (!target) continue;
      for (let i = range.start; i + 2 < Math.min(count, range.start + range.count); i += 3) {
        const triangle = [0,1,2].map(k => { point.fromBufferAttribute(p, g.index?.getX(i + k) ?? i + k).applyMatrix4(matrix); return [point.x,-point.z,point.y]; });
        if (triangle.some(p => p.some(v => !Number.isFinite(v)))) result.failures.push({ id: tile.id, error: 'Non-finite output' });
        target.push(triangle);
      }
    }
  });
  if (domain.shoulder.length) fs.writeFileSync(out + '/' + tile.id + '-' + lod.level + '.json.gz', gzipSync(JSON.stringify(domain)));
  result.rows.push({ id: tile.id, level: lod.level, ms, corners: cornerReport, ...report });
  const geometry = new Set(), materials = new Set();
  scene.traverse(o => { if (o.isMesh) { geometry.add(o.geometry); for (const m of Array.isArray(o.material) ? o.material : [o.material]) materials.add(m); } });
  geometry.forEach(g => g.dispose()); materials.forEach(m => { for (const value of Object.values(m)) if (value?.isTexture) value.dispose(); m.dispose(); });
  if (result.rows.length % 100 === 0) console.log('Checked', result.rows.length, 'tile levels');
}
const times = result.rows.map(r => r.ms).sort((a,b) => a-b);
result.summary = { tileLevels: result.rows.length, failures: result.failures.length, medianMs: times[Math.floor(times.length / 2)], p95Ms: times[Math.floor(times.length * .95)], maxMs: times.at(-1), removedInteriorAreaM2: result.rows.reduce((n,r) => n + r.removedAreaM2, 0), exteriorAreaM2: result.rows.reduce((n,r) => n + r.exteriorAreaM2, 0) };
fs.writeFileSync(out + '/native-report.json', JSON.stringify(result, null, 2));
console.log(JSON.stringify(result.summary));
if (result.failures.length) process.exitCode = 1;
