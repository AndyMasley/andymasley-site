#!/usr/bin/env node
/** Audit the complete runtime railway transaction on native town scenes.
 * TOWN_QUALITY_OUT=/absolute/output node scripts/rail_crossings/audit-corridor.mjs
 * Defaults: every registered tile at LOD0; crossings and rail bridges at all LODs.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const site = fileURLToPath(new URL('../../', import.meta.url));
const out = path.resolve(process.env.TOWN_QUALITY_OUT ?? path.join(os.tmpdir(), 'rail-corridor-audit'));
const args = process.argv.slice(2);
assert(args.every(a=>a.startsWith('--tiles=')||a==='--all-lods'),'Use --tiles=id,id and/or --all-lods');
const selectedTiles=args.find(a=>a.startsWith('--tiles='))?.slice(8).split(',');
fs.mkdirSync(out, { recursive: true });
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'rail-corridor-audit-'));
const require = createRequire(path.join(site, 'package.json'));
const read = filename => JSON.parse(fs.readFileSync(filename, 'utf8'));
const data = name => read(path.join(site, 'data/derived/town', `${name}.json`));
const release = data('release'), railIndex = data('rail-corridor-index');
const source = path.join(site, 'public/town-assets', release.directory);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const manifestBytes = fs.readFileSync(path.join(source, 'manifest.json'));
assert.equal(hash(manifestBytes), release.manifestSha256, 'Release manifest source pin');
const manifest = JSON.parse(manifestBytes);
const { build } = require('esbuild');
const threePath = require.resolve('three').replace('three.cjs', 'three.module.js');
const THREE = await import(pathToFileURL(threePath).href);
const { GLTFLoader } = await import(pathToFileURL(require.resolve('three/examples/jsm/loaders/GLTFLoader.js')).href);
const { MeshoptDecoder } = await import(pathToFileURL(require.resolve('three/examples/jsm/libs/meshopt_decoder.module.js')).href);
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
loader.register(() => ({ name: 'NATIVE_TEXTURE_PLACEHOLDER', loadTexture() {
  return Promise.resolve(new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1));
} }));
let bundleSerial = 0;
async function runtime() {
  const entry = path.join(scratch, 'entry.ts'), bundle = path.join(scratch, `runtime-${bundleSerial++}.mjs`);
  fs.writeFileSync(entry, `export {tileAssemblySteps} from ${JSON.stringify(path.join(site, 'src/lib/town/tile-assembly.ts'))};\nexport {terrainGeometryStamp} from ${JSON.stringify(path.join(site, 'src/lib/town/terrain-finish.ts'))};\nexport {tileGround} from ${JSON.stringify(path.join(site, 'src/lib/town/address-frontage.ts'))};\nexport {validRailCorridorPacket} from ${JSON.stringify(path.join(site, 'src/lib/town/rail-corridor.ts'))};\nexport {PavementIndex,roadPaintHeightAt} from ${JSON.stringify(path.join(site, 'src/lib/town/road-finish.ts'))};\n`);
  await build({ entryPoints: [entry], outfile: bundle, bundle: true, platform: 'node', format: 'esm', logLevel: 'silent', plugins: [{ name: 'same-three', setup(b) {
    b.onResolve({ filter: /^three$/ }, () => ({ path: threePath, external: true }));
  } }] });
  return import(pathToFileURL(bundle).href);
}
const families = ['residential-evidence', 'evidence-roofs', 'road-finish', 'terrain-finish', 'paved-surfaces', 'additional-environment', 'roadside', 'environment-ground', 'environment-facilities', 'road-materials', 'street-corners', 'street-corner-ground', 'road-curve', 'road-dash', 'property-terrain', 'foundation-wall', 'measured-roofs', 'road-ground-clearance'];
const indices = Object.fromEntries(families.map(name => [name, data(`${name}-index`)]));
const measured = new Set(indices['measured-roofs'].tiles.split(','));
const packet = ref => ref ? read(path.join(site, 'public', ref.url)) : undefined;
function details(id, level) {
  const home = packet(indices['residential-evidence'].tiles[id]);
  return {
    railCorridor: packet(railIndex.tiles[id]),
    evidence: { buildings: home?.buildings ?? [], roofs: packet(indices['evidence-roofs'].tiles[id]) ?? [], failures: 0 },
    foundationWalls: packet(indices['foundation-wall'].tiles[id]),
    measuredRoofs: measured.has(id) ? read(path.join(site, 'public', indices['measured-roofs'].dir, `${id}.json`)) : undefined,
    road: packet(indices['road-finish'].tiles[id])?.rows,
    terrain: packet(indices['terrain-finish'].tiles[id]?.levels[level]),
    parking: packet(indices['paved-surfaces'].lotAssets[id]),
    additional: packet(indices['additional-environment'].tiles[id]),
    roadside: packet(indices.roadside.tiles[id]),
    environmentGround: packet(indices['environment-ground'].tiles[id]?.levels[level]),
    facilities: packet(indices['environment-facilities'].tiles[id]),
    roadMaterials: packet(indices['road-materials'].tiles[id]?.levels[level]),
    streetCorners: packet(indices['street-corners'].tiles[id]),
    streetCornerGround: packet(indices['street-corner-ground'].tiles[id]?.levels[level]),
    roadCurve: packet(indices['road-curve'].tiles[id]?.levels[level]),
    roadDash: packet(indices['road-dash'].tiles[id]?.levels[level]),
    propertyTerrain: packet(indices['property-terrain'].tiles[id]?.levels[level]),
    roadGroundClearance: packet(indices['road-ground-clearance'].tiles[id]?.levels[level]),
  };
}

const materials = mesh => Array.isArray(mesh.material) ? mesh.material : [mesh.material];
const bytes = array => Buffer.from(array.buffer, array.byteOffset, array.byteLength);
const walkName = name => /^Streetscape \| (?:warm|cool|repaired) sidewalk concrete$/.test(name) || name === 'Streetscape | granite curb';
function geometryHash(g) {
  const digest = createHash('sha256');
  for (const [name, attribute] of Object.entries(g.attributes).sort(([a], [b]) => a.localeCompare(b))) {
    digest.update(`${name}:${attribute.itemSize}:${attribute.normalized}:`); digest.update(bytes(attribute.array));
  }
  if (g.index) digest.update(bytes(g.index.array));
  digest.update(JSON.stringify([g.groups, g.drawRange])); return digest.digest('hex');
}
function snapshot(group) {
  const rows = [];
  group.traverse(mesh => { if (mesh.isMesh) rows.push({ mesh, geometry: geometryHash(mesh.geometry), geometryObject: mesh.geometry,
    attributes: Object.fromEntries(Object.entries(mesh.geometry.attributes).map(([name, attribute]) => [name, { length: attribute.array.length, hash: hash(bytes(attribute.array)) }])),
    material: mesh.material, matrix: mesh.matrix.toArray(), parent: mesh.parent }); });
  return rows;
}
const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
function contains(q, tri) {
  const a = cross(tri[0], tri[1], q), b = cross(tri[1], tri[2], q), c = cross(tri[2], tri[0], q);
  return Math.min(a, b, c) >= -1e-7 || Math.max(a, b, c) <= 1e-7;
}
const within = (p, bounds, margin = 0) => bounds.some(b => p[0] >= b[0] + margin && p[0] <= b[2] - margin && p[1] >= b[1] + margin && p[1] <= b[3] - margin);
const api = await runtime();
function heights(index, q) { return index.candidates([q]).filter(s => contains(q, s.triangle)).map(s => api.roadPaintHeightAt(s.triangle, q)); }
function collect(group, tile) {
  group.updateMatrixWorld(true);
  const inverse = group.matrixWorld.clone().invert(), v = new THREE.Vector3(), heads = [], terrain = [], roads = [], ties = [], allRails = [], seams = {}, seamEdges = {};
  group.traverse(mesh => {
    if (!mesh.isMesh) return;
    const g = mesh.geometry, p = g.getAttribute('position'); if (!p) return;
    const ms = materials(mesh), total = g.index?.count ?? p.count, matrix = inverse.clone().multiply(mesh.matrixWorld);
    const world = i => { v.fromBufferAttribute(p, i).applyMatrix4(matrix); return [v.x + tile.origin[0], -v.z - tile.origin[2], v.y + tile.origin[1]]; };
    for (const part of g.groups.length ? g.groups : [{ start: 0, count: total, materialIndex: 0 }]) {
      const material = ms[part.materialIndex ?? 0], name = material?.name ?? '', railway = name.startsWith('Rail corridor |');
      const role = name.slice('Rail corridor | '.length);
      const railHeads = railway && role === 'running surface', ground = /^terrain(?:\b|_)/i.test(mesh.name);
      const road = name === 'Drive road | asphalt' || material?.userData.townRoadSurfaceType === 5 || role === 'crossing panels';
      if (!railway && !ground && !road) continue;
      for (let i = part.start; i + 2 < Math.min(total, part.start + part.count); i += 3) {
        const ids = [0, 1, 2].map(k => g.index?.getX(i + k) ?? i + k), tri = ids.map(world);
        const a = new THREE.Vector3(tri[0][0], tri[0][2], -tri[0][1]), b = new THREE.Vector3(tri[1][0], tri[1][2], -tri[1][1]), c = new THREE.Vector3(tri[2][0], tri[2][2], -tri[2][1]);
        const normal = b.sub(a).cross(c.sub(a));
        if (railway) {
          const normals = g.getAttribute('normal'), stored = normals ? new THREE.Vector3().fromBufferAttribute(normals, ids[0]).applyMatrix3(new THREE.Matrix3().getNormalMatrix(matrix)) : new THREE.Vector3();
          allRails.push({ tri, normal: normal.toArray(), storedNormal: stored.toArray(), role });
        }
        if (normal.y <= 1e-8) continue;
        if (railHeads) heads.push(tri); if (ground) terrain.push(tri); if (road) roads.push(tri); if (railway && role === 'timber ties') ties.push(tri);
      }
    }
  });
  for (const { tri, role } of allRails) {
    if (!['running surface', 'rusted steel', 'timber ties', 'ballast'].includes(role)) continue;
    for (const point of tri) for (const axis of [0, 1]) {
      const at = Math.round(point[axis] / 250) * 250;
      if (Math.abs(point[axis] - at) > .00002) continue;
      const key = `${axis}:${at}:${role}`, values = seams[key] ??= new Set();
      values.add([point[1 - axis], point[2]].map(v => Math.round(v * 10000) / 10000).join(','));
    }
    for (const axis of [0, 1]) for (let i = 0; i < 3; i++) {
      const a = tri[i], b = tri[(i + 1) % 3], at = Math.round(a[axis] / 250) * 250;
      if (Math.abs(a[axis] - at) > .00002 || Math.abs(b[axis] - at) > .00002) continue;
      const edge = [[a[1 - axis], a[2]], [b[1 - axis], b[2]]];
      if (Math.hypot(edge[1][0] - edge[0][0], edge[1][1] - edge[0][1]) > 1e-8) (seamEdges[`${axis}:${at}:${role}`] ??= []).push(edge);
    }
  }
  const ballast = allRails.filter(face => face.role === 'ballast' && face.normal[1] > 1e-8).map(face => face.tri);
  return { heads: new api.PavementIndex(heads), ground: new api.PavementIndex(terrain), road: new api.PavementIndex(roads), ties: new api.PavementIndex(ties), ballast: new api.PavementIndex(ballast), allRails, seams, seamEdges };
}
function dispose(group) {
  const gs = new Set(), ms = new Set(), ts = new Set();
  group.traverse(o => { if (o.isMesh) { gs.add(o.geometry); for (const m of materials(o)) { ms.add(m); for (const t of Object.values(m)) if (t?.isTexture) ts.add(t); } } });
  gs.forEach(g => g.dispose()); ms.forEach(m => m.dispose()); ts.forEach(t => t.dispose());
}
const critical = new Set(Object.keys(data('rail-crossings').tiles));
const packets = new Map();
for (const [id, asset] of Object.entries(railIndex.tiles)) {
  const raw = fs.readFileSync(path.join(site, 'public', asset.url));
  assert.equal(hash(raw), asset.sha256, `${id} packet content hash`); assert.equal(raw.byteLength, asset.bytes);
  const p = JSON.parse(raw); assert(api.validRailCorridorPacket(p, id), `${id} packet schema and source pins`); packets.set(id, p);
  if (p.rows.some(r => r.bridge) || p.terrain || p.extraBounds?.length) critical.add(id);
}
assert(packets.size, 'Rail packet index must not be empty');
assert.equal(railIndex.sourceManifestSha256, release.manifestSha256);
assert.equal(railIndex.sourceRailwaySha256, hash(fs.readFileSync(path.join(site, 'data/source/town/rail-crossings/active-railways.json'))));
const report = { sourceManifestSha256: release.manifestSha256, sourceRailwaySha256: railIndex.sourceRailwaySha256, indexSha256: hash(fs.readFileSync(path.join(site, 'data/derived/town/rail-corridor-index.json'))), scope: 'Full native runtime tile assembly, placeholder textures; profile elevation is authored from source terrain and crossing roads, not a surveyed rail measurement', criticalTiles: [...critical], tiles: [], failures: [], seams: [] };
const seamRecords = [];
const failure = (row, kind, context) => {
  row.failures[kind] = (row.failures[kind] ?? 0) + 1;
  const examples = (row.examples ??= {})[kind] ??= []; if (examples.length < 8) examples.push(context);
  if (report.failures.length < 150) report.failures.push({ tileId: row.tileId, level: row.level, kind, ...context });
};
const selected = manifest.tiles.filter(t => packets.has(t.id) && (!selectedTiles || selectedTiles.includes(t.id)));
for (const tile of selected) for (const level of args.includes('--all-lods') || critical.has(tile.id) ? [0, 1, 2] : [0]) {
  const p = packets.get(tile.id), lod = tile.lods.find(l => l.level === level), raw = fs.readFileSync(path.join(source, lod.url));
  assert.equal(hash(raw), lod.sha256); assert.equal(p.sourceLods[String(level)], lod.sha256);
  const group = (await loader.parseAsync(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength), '')).scene;
  const row = { tileId: tile.id, level, failures: {}, protectedMeshes: 0, walkMeshes: 0, terrainMeshes: 0, samples: 0, pavementSamples: 0, maximumTerrainAboveHeadM: 0, maximumHeadErrorM: 0, maximumPavementMismatchM: 0 };
  const started = performance.now(), steps = api.tileAssemblySteps(group, tile, level, details(tile.id, level));
  for (const step of steps) if (step.name !== 'railCorridor') step.apply();
  group.updateMatrixWorld(true); const before = snapshot(group), railStep = steps.find(s => s.name === 'railCorridor'); assert(railStep);
  const railStarted = performance.now(), result = railStep.apply(); row.railMs = performance.now() - railStarted; row.result = result;
  if (!result || result.rejected || result.status !== 'applied' || result.triangles === 0) failure(row, 'transaction rejected', { result });
  for (const old of before) {
    const mesh = old.mesh, mutableWalk = materials(mesh).some(m => walkName(m.name)), mutableTerrain = !!p.terrain && /^terrain(?:\b|_)/i.test(mesh.name);
    if (mesh.material !== old.material || mesh.parent !== old.parent || JSON.stringify(mesh.matrix.toArray()) !== JSON.stringify(old.matrix)) failure(row, 'source material/object changed', { mesh: mesh.name });
    if (mutableTerrain && mesh.geometry !== old.geometryObject) { row.terrainMeshes++; continue; }
    if (mutableWalk && mesh.geometry !== old.geometryObject) {
      row.walkMeshes++;
      for (const [name, attribute] of Object.entries(old.attributes)) {
        const after = mesh.geometry.getAttribute(name)?.array;
        if (!after || hash(bytes(after.slice(0, attribute.length))) !== attribute.hash) failure(row, 'walk source prefix changed', { mesh: mesh.name, attribute: name });
      }
    } else { row.protectedMeshes++; if (geometryHash(mesh.geometry) !== old.geometry) failure(row, 'protected source geometry changed', { mesh: mesh.name }); }
  }
  const bounds = [[tile.origin[0], -tile.origin[2], tile.origin[0] + 250, -tile.origin[2] + 250], ...(p.extraBounds ?? [])], geometry = collect(group, tile);
  for (const { tri, normal, storedNormal, role } of geometry.allRails) {
    if (!tri.flat().every(Number.isFinite) || !normal.every(Number.isFinite) || Math.hypot(...normal) < 1e-9) failure(row, 'invalid rail triangle', { role, tri });
    const length = Math.hypot(...normal), storedLength = Math.hypot(...storedNormal), dot = normal.reduce((sum, value, i) => sum + value * storedNormal[i], 0) / length / storedLength;
    if (!Number.isFinite(dot) || Math.abs(storedLength - 1) > .0001 || dot < .999) failure(row, 'rail winding or stored normal', { role, tri, dot });
    if (!tri.every(q => within(q, bounds, -.0001))) failure(row, 'rail outside registered core', { role, tri });
  }
  for (const way of p.rows) for (let i = 1; i < way.points.length; i++) {
    const a = way.points[i - 1], b = way.points[i], length = b[3] - a[3], count = Math.max(1, Math.ceil(length));
    for (let sample = 0; sample < count; sample++) {
      const t = (sample + .5) / count, center = a.map((v, k) => v + (b[k] - v) * t);
      if (!within(center, bounds, .005)) continue;
      for (const side of [-1, 1]) {
        const q = [center[0] + center[4] * .75 * side, center[1] + center[5] * .75 * side]; if (!within(q, bounds, .005)) continue;
        row.samples++;
        const heads = heights(geometry.heads, q).filter(h => Math.abs(h - center[2]) < 1.5), top = heads.length ? Math.max(...heads) : undefined;
        if (top === undefined) { failure(row, 'missing running surface', { wayId: way.wayId, q, expected: center[2] }); continue; }
        const roads = heights(geometry.road, q).filter(h => Math.abs(h - center[2]) < 1.2);
        const expected = way.bridge ? center[2] : center.length === 10 ? center[side > 0 ? 8 : 9] : roads.length ? Math.max(...roads) + .007 : center[2];
        const error = Math.abs(top - expected); row.maximumHeadErrorM = Math.max(row.maximumHeadErrorM, error);
        if (error > .04) failure(row, 'rail profile or paving mismatch', { wayId: way.wayId, q, expected, top });
        if (!way.bridge) {
          const ground = heights(geometry.ground, q), penetration = ground.length ? Math.max(...ground) - top : 0;
          row.maximumTerrainAboveHeadM = Math.max(row.maximumTerrainAboveHeadM, penetration);
          if (penetration > .025) failure(row, 'terrain above running surface', { wayId: way.wayId, q, penetration, top });
          if (roads.length) {
            const difference = Math.abs(top - Math.max(...roads) - .007);
            row.pavementSamples++; row.maximumPavementMismatchM = Math.max(row.maximumPavementMismatchM, difference);
            if (difference > .04) failure(row, 'rail crossing pavement mismatch', { wayId: way.wayId, q, top, pavement: Math.max(...roads), difference });
          }
        }
      }
    }
  }
  if (tile.id === '-11_2') {
    // Mill's visually qualified underpass approaches need a clear lower bed,
    // not merely exposed rail heads. Stay inside the flat 1.45 m half-width;
    // natural shoulder/toe intersections and actual paving are outside scope.
    const bed = row.millBed = { north: [500, 565], halfWidth: 1.4, spacing: .5, ballastSamples: 0, tieSamples: 0, maximumTerrainAboveBallastM: 0, maximumTerrainAboveTieM: 0 };
    for (let north = 500; north <= 565; north += .5) for (const way of p.rows) {
      if (way.bridge) continue;
      const i = way.points.findIndex((q, i) => i > 0 && north >= Math.min(q[1], way.points[i - 1][1]) && north < Math.max(q[1], way.points[i - 1][1]));
      if (i < 1) continue;
      const a = way.points[i - 1], b = way.points[i], t = (north - a[1]) / (b[1] - a[1]), center = a.map((v, k) => v + (b[k] - v) * t);
      for (const lateral of [-1.4, -1.3, -.75, 0, .75, 1.3, 1.4]) {
        const q = [center[0] + center[4] * lateral, center[1] + center[5] * lateral]; if (!within(q, bounds, .005)) continue;
        const ground = heights(geometry.ground, q), ballast = heights(geometry.ballast, q), ties = heights(geometry.ties, q);
        if (!ground.length || !ballast.length) continue;
        const terrain = Math.max(...ground), bedTop = Math.max(...ballast);
        if (heights(geometry.road, q).some(h => h >= bedTop - .05 && h <= bedTop + .3)) continue;
        const overlap = terrain - bedTop; bed.ballastSamples++; bed.maximumTerrainAboveBallastM = Math.max(bed.maximumTerrainAboveBallastM, overlap);
        if (overlap > .005) failure(row, 'Mill terrain above ballast bed', { q, lateral, terrain, ballast: bedTop, overlap });
        if (ties.length) {
          const top = Math.max(...ties), overlap = terrain - top; bed.tieSamples++; bed.maximumTerrainAboveTieM = Math.max(bed.maximumTerrainAboveTieM, overlap);
          if (overlap > .005) failure(row, 'Mill terrain above sleeper top', { q, lateral, terrain, tie: top, overlap });
        }
      }
    }
    if (bed.ballastSamples < 700) failure(row, 'Mill bed audit missing coverage', { samples: bed.ballastSamples });
  }
  const children = [...group.children], prior = group.userData.railCorridor;
  assert.equal(railStep.apply(), prior, 'Native idempotence report'); assert.deepEqual(group.children, children, 'Native idempotence children');
  seamRecords.push({ id: tile.id, level, bounds, seams: geometry.seams, edges: geometry.seamEdges, road: geometry.road });
  row.elapsedMs = performance.now() - started; report.tiles.push(row); console.log(JSON.stringify(row)); dispose(group);
}
const segmentDistance = (p, [a, b]) => {
  const dx = b[0] - a[0], dy = b[1] - a[1], t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
};
// Compare continuous boundary edge coverage, allowing alternate triangulation.
// Subsurface ballast/web faces may stop where the neighbor's paving covers them.
for (let i = 0; i < seamRecords.length; i++) for (let j = i + 1; j < seamRecords.length; j++) {
  const a = seamRecords[i], b = seamRecords[j];
  if (a.id === b.id) continue;
  for (const key of Object.keys(a.seams)) {
    if (!b.seams[key]) continue;
    const [axisText, atText, role] = key.split(':'), axis = Number(axisText), at = Number(atText);
    // Rail heads and ballast must join across LOD changes too. LOD2 omits
    // steel webs and changes sleepers from solid blocks to top surfaces.
    if (a.level !== b.level && role !== 'running surface' && role !== 'ballast') continue;
    const overlapping = a.bounds.some(x => b.bounds.some(y => (x[axis + 2] === at && y[axis] === at || y[axis + 2] === at && x[axis] === at) && Math.min(x[3 - axis], y[3 - axis]) > Math.max(x[1 - axis], y[1 - axis])));
    if (!overlapping) continue;
    const samples = edges => edges.flatMap(([x, y]) => [x, y, [(x[0] + y[0]) / 2, (x[1] + y[1]) / 2]]);
    const av = samples(a.edges[key] ?? []), bv = samples(b.edges[key] ?? []);
    const exposed = p => {
      if (role === 'running surface') return true;
      const q = axis === 0 ? [at, p[0]] : [p[0], at];
      return ![...heights(a.road, q), ...heights(b.road, q)].some(h => h >= p[1] - .01 && h <= p[1] + 1.2);
    };
    const differences = [...av.filter(exposed).map(v => Math.min(...(b.edges[key] ?? []).map(edge => segmentDistance(v, edge)))), ...bv.filter(exposed).map(v => Math.min(...(a.edges[key] ?? []).map(edge => segmentDistance(v, edge))))];
    const missing = differences.filter(d => d > .001).length, maximumMismatchM = Math.max(0, ...differences);
    const seam = { tiles: [a.id, b.id], levels: [a.level, b.level], axis, at, role, a: av.length, b: bv.length, unmatchedVertices: missing, maximumMismatchM,
      ...(missing ? { westOrSouth: av, eastOrNorth: bv } : {}) }; report.seams.push(seam);
    if (missing && report.failures.length < 150) report.failures.push({ kind: 'shared tile seam mismatch', ...seam });
  }
}
report.summary = { assemblies: report.tiles.length, nativeTiles: selected.length, triangles: report.tiles.reduce((s, r) => s + (r.result?.triangles ?? 0), 0), samples: report.tiles.reduce((s, r) => s + r.samples, 0), matchedSeams: report.seams.filter(s => !s.unmatchedVertices).length, failedAssemblies: report.tiles.filter(r => Object.keys(r.failures).length).length, failures: report.tiles.reduce((sum, r) => sum + Object.values(r.failures).reduce((a, b) => a + b, 0), 0) + report.seams.filter(s => s.unmatchedVertices).length };
fs.writeFileSync(path.join(out, 'native-corridor-audit.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report.summary)); fs.rmSync(scratch, { recursive: true, force: true });
if (report.failures.length) process.exitCode = 1;
