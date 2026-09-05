#!/usr/bin/env node
/** Read-only publish audit. No Blender, network requests, asset rewrites, or source reconstruction. */
import { createHash } from 'node:crypto';
import { readFile, readdir, realpath, lstat, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const POLICY = path.join(REPO, 'data/schema/town/release-policy.json');
const HASH = /^[a-f0-9]{64}$/;
const COMPONENT_BYTES = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const integer = (n, minimum = 0) => Number.isSafeInteger(n) && n >= minimum;
const vector = (v, size = 3) => Array.isArray(v) && v.length === size && v.every(Number.isFinite);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function assert(ok, message) { if (!ok) throw new Error(message); }
function finiteNumbers(value, label) {
  if (typeof value === 'number') assert(Number.isFinite(value), `${label}: non-finite number`);
  else if (value && typeof value === 'object') for (const [key, item] of Object.entries(value)) finiteNumbers(item, `${label}.${key}`);
}

/** URL decoding precedes containment checks; symlinks are checked separately against real paths. */
export function resolveAssetUrl(root, baseDirectory, uri) {
  assert(typeof uri === 'string' && uri.length > 0, 'Asset URI is missing');
  assert(!/[\\\u0000-\u001f?#]/.test(uri) && !/^[a-z][a-z0-9+.-]*:/i.test(uri) && !uri.startsWith('/'), `Unsafe asset URI: ${uri}`);
  let decoded;
  try { decoded = decodeURIComponent(uri); } catch { throw new Error(`Malformed asset URI: ${uri}`); }
  assert(!/[\\\u0000-\u001f?#]/.test(decoded) && !/^[a-z][a-z0-9+.-]*:/i.test(decoded) && !decoded.startsWith('/'), `Unsafe decoded URI: ${uri}`);
  const absolute = path.resolve(baseDirectory, decoded);
  const relative = path.relative(root, absolute);
  assert(relative && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative), `Asset URI escapes release root: ${uri}`);
  return { absolute, relative: relative.split(path.sep).join('/') };
}

/** Parse the actual binary container, not the filename. Compressed streams are independently decoded by the exporter QA. */
export function inspectGlb(bytes, label, policy) {
  assert(bytes.length >= 20 && bytes.toString('ascii', 0, 4) === 'glTF', `${label}: invalid GLB magic`);
  assert(bytes.readUInt32LE(4) === 2, `${label}: GLB version must be 2`);
  assert(bytes.readUInt32LE(8) === bytes.length, `${label}: GLB byte length mismatch`);
  let offset = 12, json = null, binaryLength = 0, chunks = 0;
  while (offset < bytes.length) {
    assert(offset + 8 <= bytes.length, `${label}: truncated GLB chunk header`);
    const size = bytes.readUInt32LE(offset), type = bytes.readUInt32LE(offset + 4);
    assert(size % 4 === 0 && offset + 8 + size <= bytes.length, `${label}: invalid GLB chunk length/alignment`);
    if (chunks === 0) {
      assert(type === 0x4e4f534a, `${label}: first GLB chunk must be JSON`);
      json = JSON.parse(bytes.toString('utf8', offset + 8, offset + 8 + size));
    } else {
      assert(chunks === 1 && type === 0x004e4942, `${label}: unsupported or duplicate GLB chunk`);
      binaryLength = size;
    }
    offset += size + 8; chunks++;
  }
  assert(json?.asset?.version === '2.0', `${label}: unsupported glTF asset version`);
  finiteNumbers(json, label);
  const used = json.extensionsUsed ?? [], required = json.extensionsRequired ?? [];
  assert(Array.isArray(used) && new Set(used).size === used.length && Array.isArray(required) && new Set(required).size === required.length, `${label}: duplicate/invalid extension declarations`);
  for (const ext of used) assert(policy.allowedExtensions.includes(ext), `${label}: unsupported extension ${ext}`);
  for (const ext of required) assert(used.includes(ext), `${label}: required extension not declared used: ${ext}`);
  for (const ext of policy.requiredExtensions) assert(required.includes(ext), `${label}: missing required extension ${ext}`);
  const buffers = json.buffers ?? [], views = json.bufferViews ?? [], accessors = json.accessors ?? [];
  assert(buffers.length > 0, `${label}: missing GLB buffer`);
  buffers.forEach((buffer, i) => {
    assert(integer(buffer.byteLength, 1) && !buffer.uri, `${label}: buffer ${i} must be an embedded or Meshopt fallback buffer`);
    if (i === 0) assert(buffer.byteLength <= binaryLength && binaryLength - buffer.byteLength <= 3, `${label}: embedded buffer length mismatch`);
    else assert(buffer.extensions?.EXT_meshopt_compression?.fallback === true, `${label}: buffer ${i} has no embedded data or declared fallback`);
  });
  views.forEach((view, i) => {
    const buffer = buffers[view.buffer], start = view.byteOffset ?? 0;
    assert(integer(view.buffer) && buffer && integer(start) && integer(view.byteLength, 1) && start + view.byteLength <= buffer.byteLength, `${label}: bufferView ${i} exceeds buffer bounds`);
    const comp = view.extensions?.EXT_meshopt_compression;
    if (comp) {
      assert(comp.buffer === 0 && integer(comp.byteOffset ?? 0) && integer(comp.byteLength, 1) && (comp.byteOffset ?? 0) + comp.byteLength <= buffers[0].byteLength, `${label}: Meshopt stream ${i} exceeds embedded buffer`);
      assert(integer(comp.count, 1) && integer(comp.byteStride, 1) && comp.count * comp.byteStride === view.byteLength, `${label}: Meshopt stream ${i} decoded size mismatch`);
      assert(['ATTRIBUTES', 'TRIANGLES', 'INDICES'].includes(comp.mode) && [undefined, 'NONE', 'OCTAHEDRAL', 'QUATERNION', 'EXPONENTIAL'].includes(comp.filter), `${label}: unsupported Meshopt mode/filter`);
    }
  });
  accessors.forEach((accessor, i) => {
    const view = views[accessor.bufferView], components = COMPONENTS[accessor.type], width = COMPONENT_BYTES[accessor.componentType];
    assert(view && components && width && integer(accessor.count, 1) && !accessor.sparse, `${label}: invalid/unsupported accessor ${i}`);
    const element = components * width, stride = view.byteStride ?? element, start = accessor.byteOffset ?? 0;
    assert(integer(start) && start % width === 0 && integer(stride, element) && start + (accessor.count - 1) * stride + element <= view.byteLength, `${label}: accessor ${i} exceeds decoded view bounds`);
    if (accessor.min || accessor.max) assert(vector(accessor.min, components) && vector(accessor.max, components) && accessor.min.every((v, k) => v <= accessor.max[k]), `${label}: invalid accessor ${i} bounds`);
  });
  let triangles = 0;
  for (const mesh of json.meshes ?? []) for (const primitive of mesh.primitives ?? []) {
    assert((primitive.mode ?? 4) === 4, `${label}: only triangle primitives supported`);
    const position = accessors[primitive.attributes?.POSITION], indices = accessors[primitive.indices];
    assert(position?.type === 'VEC3' && position.componentType === 5126, `${label}: position accessor must preserve float32 XYZ`);
    if (primitive.indices !== undefined) assert(integer(primitive.indices) && indices, `${label}: missing index accessor`);
    const count = indices?.count ?? position.count;
    assert(integer(count, 1) && count % 3 === 0, `${label}: invalid triangle count`);
    if (indices) assert(indices.type === 'SCALAR' && [5121, 5123, 5125].includes(indices.componentType), `${label}: invalid index accessor`);
    for (const index of Object.values(primitive.attributes)) assert(integer(index) && accessors[index]?.count === position.count, `${label}: mismatched vertex attribute counts`);
    if (primitive.material !== undefined) assert(integer(primitive.material) && json.materials?.[primitive.material], `${label}: missing material`);
    triangles += count / 3;
  }
  assert(triangles > 0, `${label}: GLB has no triangles`);
  const nodes = json.nodes ?? [];
  const parentCount = new Map();
  nodes.forEach((node, i) => {
    if (node.mesh !== undefined) assert(integer(node.mesh) && json.meshes?.[node.mesh], `${label}: node ${i} references missing mesh`);
    for (const [key, size] of [['translation', 3], ['rotation', 4], ['scale', 3], ['matrix', 16]]) if (node[key]) assert(vector(node[key], size), `${label}: invalid node ${i} ${key}`);
    for (const child of node.children ?? []) {
      assert(integer(child) && nodes[child] && child !== i && !parentCount.has(child), `${label}: invalid/duplicate node parent`); parentCount.set(child, i);
    }
  });
  for (let i = 0; i < nodes.length; i++) {
    const ancestors = new Set([i]); let p = parentCount.get(i);
    while (p !== undefined) { assert(!ancestors.has(p), `${label}: cyclic scene hierarchy`); ancestors.add(p); p = parentCount.get(p); }
  }
  assert(integer(json.scene ?? 0) && json.scenes?.[json.scene ?? 0], `${label}: missing default scene`);
  for (const scene of json.scenes) for (const node of scene.nodes ?? []) assert(integer(node) && nodes[node] && !parentCount.has(node), `${label}: invalid scene root`);
  for (const texture of json.textures ?? []) assert(integer(texture.source) && json.images?.[texture.source], `${label}: missing texture image`);
  const imageUris = [];
  for (const image of json.images ?? []) {
    if (image.uri !== undefined) { assert(typeof image.uri === 'string', `${label}: invalid image URI`); imageUris.push(image.uri); }
    else assert(integer(image.bufferView) && views[image.bufferView] && ['image/jpeg', 'image/png'].includes(image.mimeType), `${label}: invalid embedded image`);
  }
  return { json, triangles, imageUris, extensions: used };
}

export function inspectNetwork(network, expected, coordinates) {
  assert(network.schema_version === 1, 'Network schema version mismatch');
  assert(same(network.origin_projected_m, coordinates.horizontalOrigin), 'Network coordinate origin mismatch');
  assert(Array.isArray(network.nodes) && network.nodes.length === expected.nodes, 'Network node count mismatch');
  assert(Array.isArray(network.edges) && network.edges.length === expected.edges, 'Network edge count mismatch');
  const nodes = new Map(), edges = new Map(), physical = new Set(); let points = 0, blocked = 0;
  for (const node of network.nodes) {
    assert(integer(node.id) && !nodes.has(node.id) && vector([node.x, node.y, node.z]), 'Invalid/duplicate network node'); nodes.set(node.id, node);
  }
  for (const edge of network.edges) {
    assert(integer(edge.id) && !edges.has(edge.id) && nodes.has(edge.from) && nodes.has(edge.to), 'Invalid network edge ID/endpoints');
    assert(integer(edge.physical_id) && Array.isArray(edge.points) && edge.points.length >= 2 && edge.points.every((p) => vector(p)), `Network edge ${edge.id} has invalid path`);
    assert(Number.isFinite(edge.length_m) && edge.length_m > 0 && Number.isFinite(edge.speed_kph) && edge.speed_kph > 0 && Number.isFinite(edge.lane_offset_m), `Network edge ${edge.id} has invalid driving values`);
    for (const [endpoint, point] of [[edge.from, edge.points[0]], [edge.to, edge.points.at(-1)]]) {
      const node = nodes.get(endpoint);
      assert(Math.hypot(node.x - point[0], node.y - point[1]) < 0.05, `Network edge ${edge.id} path does not meet its node`);
    }
    if (edge.blocked_spans?.length) {
      blocked++;
      for (const span of edge.blocked_spans) assert([span.from_m, span.to_m, span.lane_from_m, span.lane_to_m].every(Number.isFinite) && span.from_m <= span.to_m && span.lane_from_m <= span.lane_to_m, `Network edge ${edge.id} has invalid obstacle bounds`);
    }
    edges.set(edge.id, edge); physical.add(edge.physical_id); points += edge.points.length;
  }
  assert(points === expected.points && physical.size === expected.physicalRoads && blocked === expected.blockedEdges, 'Network point/physical-road/obstacle count mismatch');
  assert(Array.isArray(network.blocked_turns) && network.blocked_turns.length === expected.blockedTurns, 'Network blocked-turn count mismatch');
  const blockedTurns = new Set();
  for (const turn of network.blocked_turns) {
    const a = edges.get(turn.from_edge), b = edges.get(turn.to_edge), key = `${turn.from_edge}:${turn.to_edge}`;
    assert(a && b && a.to === b.from && !blockedTurns.has(key), 'Invalid/duplicate blocked turn'); blockedTurns.add(key);
  }
  assert(same(Object.keys(network.landmarks ?? {}).sort(), [...expected.landmarks].sort()), 'Network landmark set mismatch');
  for (const [key, landmark] of Object.entries(network.landmarks)) assert(edges.has(landmark.edge_id) && vector(landmark.xy, 2) && Number.isFinite(landmark.s) && landmark.s >= 0 && landmark.s <= edges.get(landmark.edge_id).length_m, `Invalid landmark ${key}`);
  return { nodes: nodes.size, directedEdges: edges.size, physicalRoads: physical.size, points, blockedEdges: blocked, blockedTurns: blockedTurns.size, landmarks: expected.landmarks.length };
}

async function listFiles(root) {
  const result = [];
  async function walk(directory) {
    for (const item of await readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, item.name);
      assert(!item.isSymbolicLink(), `Publish symlink is not allowed: ${path.relative(root, absolute)}`);
      if (item.isDirectory()) await walk(absolute);
      else { assert(item.isFile(), `Unsupported publish entry: ${absolute}`); result.push(path.relative(root, absolute).split(path.sep).join('/')); }
    }
  }
  await walk(root); return result.sort();
}

export async function auditTownAssets({ root, policy, allowPilot = false } = {}) {
  const started = Date.now();
  const report = { version: 1, passed: false, root: path.resolve(root), generatedAt: new Date().toISOString(), allowPilot, checks: 0, failures: [], counts: {}, assets: [], limitations: ['Container/dependency audit; exact decoded source geometry is checked by the separate exporter audit.', 'Generic architecture, surface treatments and inferred trees remain visual reconstruction; they are not a survey of every home.'] };
  const check = (ok, label) => { report.checks++; assert(ok, label); };
  const attempt = async (label, fn) => { try { return await fn(); } catch (error) { report.failures.push({ check: label, message: error.message }); return null; } };
  await attempt('release structure', async () => {
    policy ??= JSON.parse(await readFile(POLICY, 'utf8'));
    report.policySha256 = sha256(Buffer.from(JSON.stringify(policy)));
    root = await realpath(path.resolve(root)); report.root = root;
    const manifestPath = path.join(root, 'manifest.json'), manifestBytes = await readFile(manifestPath), manifest = JSON.parse(manifestBytes);
    report.manifestSha256 = sha256(manifestBytes); report.sourceSha256 = manifest.source?.sha256;
    check(manifest.version === 1 && manifest.source?.sha256 === policy.sourceSha256, 'Manifest version/source SHA mismatch');
    finiteNumbers(manifest, 'manifest'); report.checks++;
    check(manifest.coordinates && Object.entries(policy.coordinates).every(([key, value]) => same(manifest.coordinates[key], value)), 'Manifest coordinate contract mismatch');
    check(typeof manifest.stats?.pilot === 'boolean' && integer(manifest.stats?.buildings), 'Invalid release scope/count metadata');
    check(!manifest.stats.pilot || allowPilot, 'Pilot manifest cannot pass a production audit; use --allow-pilot only for pilot development');
    report.pilot = manifest.stats.pilot;
    check(Array.isArray(manifest.tiles) && manifest.tiles.length > 0, 'Manifest has no tiles');
    check(Array.isArray(manifest.textures) && manifest.network, 'Manifest must include integrity refs for textures and network');
    const refs = new Map(), tileIds = new Set(), sourceIds = new Set(), treeRefs = [];
    function addRef(asset, role) {
      check(asset && integer(asset.bytes, 1) && asset.bytes <= policy.maximumAssetBytes && HASH.test(asset.sha256), `${role}: missing/invalid bytes or SHA256, or exceeds 25 MiB`);
      const resolved = resolveAssetUrl(root, root, asset.url);
      check(!refs.has(resolved.relative), `Duplicate manifest asset URL: ${asset.url}`);
      const entry = { ...asset, role, ...resolved }; refs.set(resolved.relative, entry); return entry;
    }
    let sourceCount = 0, declaredTrees = 0;
    for (const tile of manifest.tiles) {
      check(typeof tile.id === 'string' && tile.id && !tileIds.has(tile.id), `Invalid/duplicate tile ID: ${tile.id}`); tileIds.add(tile.id);
      check(vector(tile.origin) && vector(tile.bounds?.min) && vector(tile.bounds?.max) && tile.bounds.min.every((n, i) => n <= tile.bounds.max[i]), `Tile ${tile.id}: invalid origin/bounds`);
      check(Array.isArray(tile.sourceIds) && Array.isArray(tile.lods) && (tile.lods.length > 0 || tile.treeFile), `Tile ${tile.id}: missing source IDs/content`);
      for (const id of tile.sourceIds) { check(typeof id === 'string' && /^\d+_\d+$/.test(id) && !sourceIds.has(id), `Duplicate/invalid building source ID: ${id}`); sourceIds.add(id); sourceCount++; }
      const levels = new Set();
      for (const lod of tile.lods) {
        check(integer(lod.level) && lod.level <= 2 && !levels.has(lod.level) && Number.isFinite(lod.geometricErrorM) && lod.geometricErrorM >= 0 && integer(lod.triangles), `Tile ${tile.id}: invalid LOD`);
        levels.add(lod.level); addRef(lod, 'tile');
      }
      check(!tile.lods.length || same([...levels].sort(), [0, 1, 2]), `Tile ${tile.id}: must provide LOD0/1/2`);
      check(!tile.sourceIds.length || tile.lods.length > 0, `Tile ${tile.id}: building IDs have no geometry`);
      if (tile.treeFile) { check(integer(tile.treeFile.count), `Tile ${tile.id}: invalid tree count`); treeRefs.push(addRef(tile.treeFile, 'trees')); declaredTrees += tile.treeFile.count; }
    }
    check(sourceCount === manifest.stats.buildings, 'Manifest building count does not match unique source IDs');
    check(integer(manifest.trees?.sourceAnchors) && HASH.test(manifest.trees?.sourceAnchorsAndScalesSha256), 'Invalid source canopy metadata');
    if (!manifest.stats.pilot) check(sourceCount === policy.fullRelease.buildings && declaredTrees === policy.fullRelease.trees && declaredTrees === manifest.trees.sourceAnchors, 'Full-town building/tree coverage mismatch');
    else check(sourceCount <= policy.fullRelease.buildings && declaredTrees <= manifest.trees.sourceAnchors, 'Pilot exceeds source coverage');
    const prototypeIds = new Set(), prototypeRoles = new Set();
    check(Array.isArray(manifest.trees?.prototypes), 'Missing tree prototypes');
    for (const prototype of manifest.trees.prototypes) {
      check(typeof prototype.id === 'string' && prototype.id && !prototypeIds.has(prototype.id) && ['crown', 'trunk'].includes(prototype.role) && (integer(prototype.level) || (prototype.role === 'crown' && prototype.level === -1)) && integer(prototype.triangles, 1), 'Invalid/duplicate tree prototype');
      const role = `${prototype.role}:${prototype.level}`;
      check(!prototypeRoles.has(role), 'Duplicate tree prototype role/LOD'); prototypeRoles.add(role); prototypeIds.add(prototype.id); addRef(prototype, 'prototype');
    }
    check(['crown:0', 'crown:1', 'trunk:0'].every((r) => prototypeRoles.has(r)), 'Missing near/far crown or trunk prototype');
    const car = addRef(manifest.car, 'car'); addRef(manifest.fallback, 'fallback');
    check(manifest.car.forward === '-Z' && same(manifest.car.wheelNodes, policy.wheelNodes), 'Car forward/wheel-node contract mismatch');
    const texturePaths = new Set();
    for (const texture of manifest.textures) { const ref = addRef(texture, 'texture'); check(/^textures\/.+\.(png|jpg|jpeg)$/i.test(ref.relative), 'Texture must be a portable image in textures/'); texturePaths.add(ref.relative); }
    if (manifest.surfaces) {
      const surfaces = manifest.surfaces;
      check(surfaces.grass && surfaces.masks && typeof surfaces.masks === 'object', 'Missing ground material/mask definitions');
      for (const [name, surface] of Object.entries(surfaces).filter(([name]) => ['grass','soil','forest','impervious'].includes(name))) {
        check(Number.isFinite(surface.repeatM) && surface.repeatM > 0 && surface.repeatM <= 20, `Ground ${name}: invalid metric texture repeat`);
        for (const slot of name === 'grass' ? ['color','normal','roughness'] : ['color']) {
          const ref = addRef(surface[slot], 'surface-image');
          check(/^surfaces\/textures\/.+\.(png|jpg|jpeg)$/i.test(ref.relative), 'Ground material image must be in surfaces/textures/');
        }
      }
      for (const [id, mask] of Object.entries(surfaces.masks)) {
        const tile = manifest.tiles.find(tile => tile.id === id);
        check(tile && tile.lods.length, `Ground mask has no scenery tile: ${id}`);
        check(vector(mask.bounds, 4) && mask.bounds[0] < mask.bounds[2] && mask.bounds[1] < mask.bounds[3], `Ground ${id}: invalid mask bounds`);
        const size = manifest.tileSizeM ?? 250;
        check(mask.bounds[0] <= tile.origin[0] && mask.bounds[2] >= tile.origin[0] + size && mask.bounds[1] <= tile.origin[2] - size && mask.bounds[3] >= tile.origin[2], `Ground ${id}: mask does not cover its tile`);
        const ref = addRef(mask, 'surface-mask');
        check(/^surfaces\/masks\/.+\.png$/i.test(ref.relative), 'Ground mask must be a PNG in surfaces/masks/');
      }
    }
    const networkRef = addRef(manifest.network, 'network');
    check(networkRef.relative === policy.network.url && networkRef.bytes === policy.network.bytes && networkRef.sha256 === policy.network.sha256, 'Canonical network identity mismatch');
    const referenced = new Set(['manifest.json', ...refs.keys()]), usedTextures = new Set();
    let actualTrees = 0, lod0Triangles = 0, maximumAssetBytes = manifestBytes.length, totalBytes = manifestBytes.length;
    check(manifestBytes.length <= policy.maximumAssetBytes, 'Manifest exceeds 25 MiB');
    for (const ref of refs.values()) await attempt(ref.relative, async () => {
      const actualPath = await realpath(ref.absolute), relativeReal = path.relative(root, actualPath);
      check(relativeReal && !relativeReal.startsWith(`..${path.sep}`) && relativeReal !== '..' && !path.isAbsolute(relativeReal) && !(await lstat(ref.absolute)).isSymbolicLink(), `${ref.relative}: symlink escapes/aliases release`);
      const bytes = await readFile(actualPath), digest = sha256(bytes);
      check(bytes.length === ref.bytes && digest === ref.sha256, `${ref.relative}: byte count/SHA256 mismatch`);
      check(bytes.length <= policy.maximumAssetBytes, `${ref.relative}: exceeds 25 MiB`);
      totalBytes += bytes.length; maximumAssetBytes = Math.max(maximumAssetBytes, bytes.length);
      const row = { url: ref.relative, role: ref.role, bytes: bytes.length, sha256: digest };
      if (['tile', 'prototype', 'car', 'fallback'].includes(ref.role)) {
        check(ref.relative.endsWith('.glb'), `${ref.relative}: expected .glb`);
        const glb = inspectGlb(bytes, ref.relative, policy.glb); report.checks++;
        row.triangles = glb.triangles; row.extensions = glb.extensions;
        if (ref.triangles !== undefined) check(glb.triangles === ref.triangles, `${ref.relative}: triangle count mismatch`);
        if (ref.role === 'tile' && ref.level === 0) lod0Triangles += glb.triangles;
        for (const uri of glb.imageUris) {
          const image = resolveAssetUrl(root, path.dirname(ref.absolute), uri);
          check(texturePaths.has(image.relative), `${ref.relative}: image ${uri} has no manifest texture integrity ref`); usedTextures.add(image.relative);
        }
        if (ref === car) {
          const wheelNodes = glb.json.nodes.filter((n) => /Drive wheel/.test(n.name ?? ''));
          check(wheelNodes.length === 4 && policy.wheelNodes.every((name) => wheelNodes.filter((n) => n.name === name && integer(n.mesh)).length === 1), 'Car must contain exactly four named wheel mesh nodes');
          const reachable = new Set();
          function visit(i) { if (reachable.has(i)) return; reachable.add(i); for (const child of glb.json.nodes[i].children ?? []) visit(child); }
          for (const i of glb.json.scenes[glb.json.scene ?? 0].nodes ?? []) visit(i);
          check(wheelNodes.every((n) => reachable.has(glb.json.nodes.indexOf(n))), 'Car wheel mesh is outside active scene');
          row.wheelNodes = wheelNodes.map((n) => n.name);
        }
      } else if (ref.role === 'trees') {
        check(ref.relative.endsWith('.trees.json'), 'Unexpected tree array filename');
        const rows = JSON.parse(bytes);
        check(Array.isArray(rows) && rows.length === ref.count, `${ref.relative}: tree row count mismatch`);
        check(rows.every((row) => vector(row, 7) && row.slice(3, 6).every((n) => n > 0)), `${ref.relative}: non-finite/invalid tree position, scale or yaw`);
        actualTrees += rows.length; row.count = rows.length;
      } else if (ref.role === 'network') {
        report.counts.network = inspectNetwork(JSON.parse(bytes), policy.network, policy.coordinates); report.checks++;
      } else if (['texture','surface-image','surface-mask'].includes(ref.role)) {
        const png = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
        check(ref.relative.endsWith('.png') ? png : jpeg, `${ref.relative}: image header does not match extension`);
        if (ref.role === 'surface-mask') check(bytes.length >= 33 && bytes.readUInt32BE(16) > 0 && bytes.readUInt32BE(16) <= 1024 && bytes.readUInt32BE(20) > 0 && bytes.readUInt32BE(20) <= 1024 && bytes[24] === 8 && bytes[25] === 6, `${ref.relative}: expected bounded 8-bit RGBA mask`);
      }
      report.assets.push(row);
    });
    check(actualTrees === declaredTrees, 'Validated tree rows do not match declared total');
    check(usedTextures.size === texturePaths.size && [...texturePaths].every((p) => usedTextures.has(p)), 'Manifest includes unused texture derivatives');
    const files = await listFiles(root);
    for (const file of files) {
      check(!/\.raw\.glb$|(^|\/)manifest\.raw(?:\.|$)|\.(?:blend\d*|las|laz|tif|tiff|psd|exr|zip|tar|gz)$/i.test(file) && !/(^|\/)(?:originals?|source|raw)(\/|$)/i.test(file), `Source/original/export intermediate in publish tree: ${file}`);
      check(referenced.has(file), `Unreferenced publish file: ${file}`);
    }
    check(files.length === referenced.size, 'Missing referenced publish file');
    report.counts = { ...report.counts, tiles: tileIds.size, buildings: sourceCount, trees: actualTrees, prototypes: prototypeIds.size, textures: texturePaths.size, files: files.length, totalBytes, maximumAssetBytes, lod0Triangles };
    report.releaseIdentitySha256 = sha256(Buffer.from([...report.assets].sort((a, b) => a.url.localeCompare(b.url)).map((a) => `${a.url}\0${a.bytes}\0${a.sha256}\n`).join('') + report.manifestSha256));
  });
  report.passed = report.failures.length === 0;
  report.elapsedSeconds = (Date.now() - started) / 1000;
  return report;
}

async function defaultRoot() {
  const base = path.join(REPO, 'public/town-assets');
  const candidates = [];
  for (const item of await readdir(base, { withFileTypes: true })) if (item.isDirectory()) {
    try { await lstat(path.join(base, item.name, 'manifest.json')); candidates.push(path.join(base, item.name)); } catch { /* Not a release directory. */ }
  }
  assert(candidates.length === 1, `Expected one town asset release, found ${candidates.length}; pass --root explicitly`);
  return candidates[0];
}

async function main() {
  let root, output = path.join(REPO, 'data/derived/town/asset-validation.json'), allowPilot = false;
  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if (arg === '--root' || arg === '--report') { const value = process.argv[++i]; assert(value && !value.startsWith('--'), `Missing value for ${arg}`); if (arg === '--root') root = path.resolve(value); else output = path.resolve(value); }
    else if (arg === '--allow-pilot') allowPilot = true;
    else if (arg === '--help') { console.log('Usage: node scripts/validate-town-assets.mjs [--root RELEASE_DIRECTORY] [--report REPORT_JSON] [--allow-pilot]\nDefaults to the sole public/town-assets/*/manifest.json release. Pilot mode is explicitly excluded from production validation.'); return; }
    else throw new Error(`Unknown argument: ${arg}`);
  }
  root ??= await defaultRoot();
  const outputRelative = path.relative(root, output);
  assert(outputRelative === '..' || outputRelative.startsWith(`..${path.sep}`) || path.isAbsolute(outputRelative), 'Audit report must be outside the immutable published release');
  const report = await auditTownAssets({ root, allowPilot });
  await mkdir(path.dirname(output), { recursive: true }); await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Town assets ${report.passed ? 'PASS' : 'FAIL'}: ${report.checks} checks, ${report.counts.files ?? 0} files, ${report.counts.buildings ?? 0} buildings, ${report.counts.trees ?? 0} trees; report ${output}`);
  for (const failure of report.failures) console.error(`${failure.check}: ${failure.message}`);
  if (!report.passed) process.exitCode = 1;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((error) => { console.error(`Town assets FAIL: ${error.message}`); process.exitCode = 1; });
