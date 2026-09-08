/** Geometry/lifecycle evidence using the SAME ordered steps as the live world.
 * Native texture placeholders prove topology, never actual texture appearance,
 * browser frame rates, shader output or physical-device memory. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { build } from 'esbuild';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

const site = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.resolve(process.env.TOWN_ASSEMBLY_OUT || path.join(site, 'data/derived/town/assembly-audit'));
fs.mkdirSync(out, { recursive: true });
const read = p => JSON.parse(fs.readFileSync(p)), hash = b => createHash('sha256').update(b).digest('hex');
const data = name => read(path.join(site, 'data/derived/town', name + '.json'));
const release = data('release'), source = path.join(site, 'public/town-assets', release.directory);
const manifestBytes = fs.readFileSync(path.join(source, 'manifest.json'));
if (hash(manifestBytes) !== release.manifestSha256) throw new Error('Pinned source manifest changed');
const manifest = JSON.parse(manifestBytes);
const indices = Object.fromEntries(['residential-evidence', 'evidence-roofs', 'road-finish', 'terrain-finish', 'paved-surfaces', 'additional-environment', 'roadside', 'environment-ground', 'environment-facilities', 'road-materials', 'street-corners', 'street-corner-ground', 'road-curve', 'road-dash', 'property-terrain'].map(name => [name, data(name + '-index')]));
const packet = asset => {
  if (!asset) return;
  const bytes = fs.readFileSync(path.join(site, 'public', asset.url.slice(1)));
  if (bytes.length !== asset.bytes || asset.sha256 && hash(bytes) !== asset.sha256) throw new Error('Packet source mismatch: ' + asset.url);
  return JSON.parse(bytes);
};
function details(id, level) {
  const home = packet(indices['residential-evidence'].tiles[id]), roofs = packet(indices['evidence-roofs'].tiles[id]);
  return { evidence: { buildings: home?.buildings ?? [], roofs: roofs ?? [], failures: 0 },
    road: packet(indices['road-finish'].tiles[id])?.rows,
    terrain: packet(indices['terrain-finish'].tiles[id]?.levels[level]),
    parking: packet(indices['paved-surfaces'].lotAssets[id]),
    additional: packet(indices['additional-environment'].tiles[id]), roadside: packet(indices.roadside.tiles[id]),
    environmentGround: packet(indices['environment-ground'].tiles[id]?.levels[level]),
    facilities: packet(indices['environment-facilities'].tiles[id]), roadMaterials: packet(indices['road-materials'].tiles[id]?.levels[level]), streetCorners: packet(indices['street-corners'].tiles[id]), streetCornerGround: packet(indices['street-corner-ground'].tiles[id]?.levels[level]), roadCurve: packet(indices['road-curve'].tiles[id]?.levels[level]), roadDash: packet(indices['road-dash'].tiles[id]?.levels[level]), propertyTerrain: packet(indices['property-terrain'].tiles[id]?.levels[level]),
  };
}
const entry = path.join(out, 'entry.ts'), bundle = path.join(out, 'assembly.mjs');
fs.writeFileSync(entry, `export { auditAssemblyReports } from ${JSON.stringify(path.join(site, 'src/lib/town/assembly-report.ts'))}; export { tileAssemblySteps } from ${JSON.stringify(path.join(site, 'src/lib/town/tile-assembly.ts'))}; export { layoutParking } from ${JSON.stringify(path.join(site, 'src/lib/town/parking-finish.ts'))};`);
await build({ entryPoints: [entry], outfile: bundle, bundle: true, platform: 'node', format: 'esm', logLevel: 'silent', plugins: [{ name: 'same-three', setup(b) { b.onResolve({ filter: /^three$/ }, () => ({ path: fileURLToPath(import.meta.resolve('three')), external: true })); } }] });
const { tileAssemblySteps, layoutParking, auditAssemblyReports } = await import(pathToFileURL(bundle).href);
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
loader.register(() => ({ name: 'NATIVE_TEXTURE_PLACEHOLDER', loadTexture() { return Promise.resolve(new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1)); } }));
const selected = process.env.TOWN_ASSEMBLY_TILES?.split(',');
const defaults = new Set(['-12_-4', '-13_-5', '-11_-4', '-11_-3', '-10_1', '-10_2', '2_-2', '4_-3', '-14_-10', '-14_-11', '6_-5', '1_-8']);
const exportCorners = process.env.TOWN_ASSEMBLY_CORNER_DOMAINS === '1';
const exportSites = process.env.TOWN_ASSEMBLY_SITE_GROUNDS === '1';
const tiles = manifest.tiles.filter(tile => selected ? selected.includes(tile.id) : process.env.TOWN_ASSEMBLY_PARKING === '1' ? !!indices['paved-surfaces'].lotAssets[tile.id] : exportCorners ? !!(indices['street-corners'].tiles[tile.id] || indices['street-corner-ground'].tiles[tile.id]) : process.argv.includes('--all') || defaults.has(tile.id));
const report = { sourceManifestSha256: release.manifestSha256, scope: 'Actual source GLTF geometry with native texture placeholders; same runtime assembly order', stages: [], rows: [], failures: [] };
function geometrySignature(group) {
  const digest = createHash('sha256');
  group.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    digest.update(object.name); digest.update(JSON.stringify(object.matrix.toArray())); digest.update(JSON.stringify(object.geometry.groups));
    for (const [name, attribute] of Object.entries(object.geometry.attributes)) {
      const array = attribute.isInterleavedBufferAttribute ? attribute.data.array : attribute.array;
      digest.update(name); digest.update(Buffer.from(array.buffer, array.byteOffset, array.byteLength));
    }
    const array = object.geometry.index?.array; if (array) digest.update(Buffer.from(array.buffer, array.byteOffset, array.byteLength));
  }); return digest.digest('hex');
}
for (const tile of tiles) for (const lod of tile.lods) {
  const raw = fs.readFileSync(path.join(source, lod.url)); if (hash(raw) !== lod.sha256) throw new Error('Source GLB changed: ' + lod.url);
  const gltf = await loader.parseAsync(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength), pathToFileURL(path.dirname(path.join(source, lod.url)) + '/').href);
  const group = gltf.scene, baseline = new Set(); group.traverse(o => { if (o instanceof THREE.Mesh) baseline.add(o.geometry); });
  const supplied = details(tile.id, lod.level);
  const stageMs = {}, signatures = {}, steps = tileAssemblySteps(group, tile, lod.level, supplied);
  report.stages = steps.map(step => step.name);
  for (const step of steps) {
    const start = performance.now(); step.apply(); stageMs[step.name] = performance.now() - start;
    if (process.env.TOWN_ASSEMBLY_SIGNATURES === '1' && ['craftedFrontages', 'memorials'].includes(step.name)) signatures[step.name] = geometrySignature(group);
  }
  if (exportCorners || exportSites) {
    const domain = { tileId: tile.id, level: lod.level, sourceSha256: lod.sha256, axes: '[sourceEast,sourceNorth,sourceHeight]', terrain: [], sidewalk: [], apron: [], siteGrounds: [] };
    group.updateMatrixWorld(true); const point = new THREE.Vector3();
    group.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      const kind = object.name === 'finished_street_corner_sidewalk' ? 'sidewalk' : object.name === 'finished_street_corner_apron' ? 'apron' : /^terrain(?:\b|_)/i.test(object.name) ? 'terrain' : undefined;
      if (exportSites && object.parent?.name === 'Residential entrances and paving') {
        const g=object.geometry,p=g.getAttribute('position'),count=g.index?.count??p.count,triangles=[];
        for(let i=0;i<count;i+=3)triangles.push([0,1,2].map(k=>{point.fromBufferAttribute(p,g.index?.getX(i+k)??i+k).applyMatrix4(object.matrixWorld);return[point.x+tile.origin[0],-point.z-tile.origin[2],point.y+tile.origin[1]];}));
        domain.siteGrounds.push({role:object.material.userData.surfaceRole,triangles});
      }
      if (!kind) return;
      const geometry = object.geometry, position = geometry.getAttribute('position'), count = geometry.index?.count ?? position.count;
      for (let i = 0; i + 2 < count; i += 3) domain[kind].push([0, 1, 2].map(k => {
        point.fromBufferAttribute(position, geometry.index?.getX(i + k) ?? i + k).applyMatrix4(object.matrixWorld);
        return [point.x + tile.origin[0], -point.z - tile.origin[2], point.y + tile.origin[1]];
      }));
    });
    fs.writeFileSync(path.join(out, `${tile.id}-${lod.level}.domains.json.gz`), gzipSync(JSON.stringify(domain)));
  }
  let triangles = 0, submittedTriangles = 0, meshes = 0, addedMeshes = 0, geometryBytes = 0;
  const instances = new Set();
  const buffers = new Set(), geometries = new Set(), materials = new Set(), textures = new Set(), errors = [];
  group.traverse(o => {
    if (!(o instanceof THREE.Mesh)) return;
    meshes++; if (!baseline.has(o.geometry)) addedMeshes++;
    const g = o.geometry, count = g.index?.count ?? g.getAttribute('position')?.count ?? 0;
    triangles += count / 3; submittedTriangles += count / 3 * (o instanceof THREE.InstancedMesh ? o.count : 1); geometries.add(g);
    if (o instanceof THREE.InstancedMesh) {
      instances.add(o);
      for (const attribute of [o.instanceMatrix, o.instanceColor].filter(Boolean)) { buffers.add(attribute.array.buffer); if (!attribute.array.every(Number.isFinite)) errors.push(`${o.name}: non-finite instance buffer`); }
    }
    for (const [name, attribute] of Object.entries(g.attributes)) {
      const array = attribute.isInterleavedBufferAttribute ? attribute.data.array : attribute.array; buffers.add(array.buffer);
      if (!array.every(Number.isFinite)) errors.push(`${o.name}: non-finite ${name}`);
    }
    if (g.index) { buffers.add(g.index.array.buffer); if ([...g.index.array].some(n => n >= g.getAttribute('position').count)) errors.push(`${o.name}: invalid index`); }
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) { materials.add(m); for (const value of Object.values(m)) if (value instanceof THREE.Texture) textures.add(value); }
  });
  geometryBytes = [...buffers].reduce((sum, buffer) => sum + buffer.byteLength, 0);
  const assembly = auditAssemblyReports(group.userData, supplied);
  errors.push(...assembly.errors);
  const row = { assemblyReports: assembly.reports, optionalDetailMissing: assembly.optionalDetailMissing, tileId: tile.id, level: lod.level, sourceSha256: lod.sha256, triangles, emittedTriangles: triangles, submittedTriangles, meshes, addedMeshes, geometryBytes, materials: materials.size, stageMs, signatures, errors, parkedLife: group.userData.parkedLife ?? null };
  if (process.env.TOWN_ASSEMBLY_PARKING_BAYS === '1') row.parkingBays = supplied.parking?.lots.filter(lot => group.userData.parkingFinish?.lots.includes(lot.id)).flatMap(layoutParking) ?? [];
  report.rows.push(row); if (errors.length) report.failures.push({ tileId: tile.id, level: lod.level, errors });
  instances.forEach(mesh => mesh.dispose()); geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); textures.forEach(t => t.dispose()); group.clear();
}
report.summary = { tiles: tiles.length, levels: report.rows.length, failures: report.failures.length, maximumTileGeometryBytes: Math.max(0, ...report.rows.map(row => row.geometryBytes)),
  maxStageMs: Object.fromEntries(report.stages.map(name => [name, Math.max(0, ...report.rows.map(row => row.stageMs[name]))])) };
fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report.summary)); if (report.failures.length) process.exitCode = 1;
