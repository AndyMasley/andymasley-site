/** Exact glTF image dependencies let immutable pixels transfer alongside mesh
 * bytes. This only reads the JSON chunk; source validation runs before prebuild. */
import { open, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const site = path.resolve(fileURLToPath(new URL('..', import.meta.url))), data = path.join(site, 'data/derived/town');
const release = JSON.parse(await readFile(path.join(data, 'release.json'), 'utf8'));
const base = path.join(site, 'public/town-assets', release.directory), raw = await readFile(path.join(base, 'manifest.json'));
if (createHash('sha256').update(raw).digest('hex') !== release.manifestSha256) throw Error('Source manifest changed');
const manifest = JSON.parse(raw), aliases = JSON.parse(await readFile(path.join(data, 'source-texture-aliases.json'), 'utf8'));
const leaf = JSON.parse(await readFile(path.join(data, 'leaf-atlas.json'), 'utf8'));
const alias = new Map(aliases.aliases.map(row => [row.from, row.to])), refs = new Map();
for (const ref of [manifest.fallback, manifest.car, ...manifest.trees.prototypes, ...manifest.tiles.flatMap(tile => tile.lods)]) refs.set(ref.url, ref);
const images = [], ids = new Map(), scenes = {};
for (const [url, ref] of refs) {
  const handle = await open(path.join(base, url), 'r'); let json;
  try {
    const header = Buffer.alloc(20); await handle.read(header, 0, 20, 0);
    if (header.readUInt32LE(0) !== 0x46546c67 || header.readUInt32LE(16) !== 0x4e4f534a) throw Error('Invalid source GLB header');
    const bytes = Buffer.alloc(header.readUInt32LE(12)); await handle.read(bytes, 0, bytes.length, 20); json = JSON.parse(bytes.toString());
  } finally { await handle.close(); }
  const indices = new Set();
  for (const image of json.images ?? []) {
    if (typeof image.uri !== 'string' || image.uri.startsWith('data:')) continue;
    let source = path.posix.normalize(path.posix.join(path.posix.dirname(url), image.uri));
    if (!source.startsWith('textures/')) continue;
    source = source === 'textures/leaf-cluster.png' ? leaf.url : `/town-assets/${release.directory}/${alias.get(source) ?? source}`;
    if (!ids.has(source)) { ids.set(source, images.length); images.push(source); }
    indices.add(ids.get(source));
  }
  if (indices.size) scenes[url] = [...indices];
}
const output = { version: 1, sourceManifestSha256: release.manifestSha256, directory: release.directory, images, scenes };
const bytes = JSON.stringify(output) + '\n'; await writeFile(path.join(data, 'source-image-hints.json'), bytes);
console.log(JSON.stringify({ sourceImageHints: Object.keys(scenes).length, uniqueImages: images.length, bytes: Buffer.byteLength(bytes) }));
