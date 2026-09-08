/** Deterministic transfer regression limits. This does not predict a browser's
 * ready time, decoded heap, GPU allocation, frame interval or device thermals. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const site = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = p => JSON.parse(fs.readFileSync(p));
const release = read(path.join(site, 'data/derived/town/release.json'));
const root = path.join(site, 'public'), source = path.join(root, 'town-assets', release.directory);
const manifest = read(path.join(source, 'manifest.json')), startup = read(path.join(site, 'data/derived/town/startup.json'));
const aliases = read(path.join(site,'data/derived/town/source-texture-aliases.json')), atlas = read(path.join(site,'data/derived/town/leaf-atlas.json'));
const networkTransfer = read(path.join(site, 'data/derived/town/network-transfer.json')), groundPreviews = read(path.join(site, 'data/derived/town/ground-preview.json'));
const textureAliases = new Map(aliases.aliases.map(row=>[path.join(source,row.from),path.join(source,row.to)]));
const tile = manifest.tiles.find(tile => tile.id === startup.locations.DOWNTOWN.tileId);
const sources = new Set([path.join(source, 'manifest.json'), path.join(source, manifest.network.url)]);
const glbs = [manifest.fallback, ...manifest.trees.prototypes, tile.lods.find(lod => lod.level === 0)];
for (const ref of glbs) {
  const file = path.join(source, ref.url); sources.add(file);
  const bytes = fs.readFileSync(file), json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
  for (const image of json.images ?? []) if (image.uri && !image.uri.startsWith('data:')) sources.add(path.resolve(path.dirname(file), image.uri));
}
if (tile.treeFile) sources.add(path.join(source, tile.treeFile.url));
for (const group of Object.values(manifest.surfaces ?? {})) {
  for (const value of Object.values(group)) if (value?.url) sources.add(path.join(source, value.url));
}
// Ground masks for distant cells are streamed later, never startup payload.
for (const mask of Object.values(manifest.surfaces?.masks ?? {})) sources.delete(path.join(source, mask.url));
const mask = manifest.surfaces?.masks[tile.id]; if (mask) sources.add(path.join(source, mask.url));
// Source request aliases are byte-identical; the authored atlas has its own
// asset identity. Fallback copies remain available but are not both healthy initial requests.
const delivered = new Set([...sources].map(file => file === path.join(source,'textures/leaf-cluster.png') ? path.join(root,atlas.url.slice(1)) : textureAliases.get(file) ?? file));
const initialAssets = new Map([...delivered].map(file => [file, file]));
if (networkTransfer.sourceManifestSha256 !== release.manifestSha256 || groundPreviews.sourceManifestSha256 !== release.manifestSha256) throw Error('Initial transport source identity changed');
initialAssets.set(path.join(source, manifest.network.url), path.join(root, networkTransfer.url));
for (const [url, preview] of Object.entries(groundPreviews.rows)) {
  const original = path.join(source, url);
  if (initialAssets.has(original)) initialAssets.set(original, path.join(root, preview.url));
}
const rows = [...initialAssets.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([original, file]) => {
  const sourcePath = path.relative(root, file), rawBytes = fs.statSync(file).size;
  const alternate = file.endsWith('.glb') ? path.join(root, 'town-transfer/gzip-v1', release.directory, path.relative(source, file) + '.gz')
    : file.endsWith('.json') ? path.join(root, 'town-transfer/json-gzip-v1', sourcePath + '.gz') : file;
  return { url: '/' + sourcePath, originalUrl: '/' + path.relative(root, original), rawBytes, losslessTransferBytes: fs.statSync(alternate).size, deferredFullMap: original !== file && file.includes('/ground-preview/') };
});
const astro = path.join(site, 'dist/_astro');
const bundles = fs.readdirSync(astro).filter(name => /^main\..+\.js$/.test(name)).map(name => {
  const raw = fs.readFileSync(path.join(astro, name)); return { name, rawBytes: raw.length, gzipBytes: gzipSync(raw, { level: 9 }).length };
});
if (bundles.length !== 1) throw new Error('Expected exactly one built town main bundle');
const main = bundles[0], criticalAssetsBytes = rows.reduce((sum, row) => sum + row.losslessTransferBytes, 0);
// The current healthy core is 7.68 MB; allow bounded content growth but catch
// regressions to the older full-map/network startup. This byte guard does not
// assert the separate eight-second wall-clock target. Optional packets and
// unrelated page assets remain itemized by the browser ledger.
const budgets = { mainGzipBytes: 1258291, coreSceneTransferBytes: 8388608 };
const report = { version: 2, scope: 'Healthy core default-start assets, exact network encoding, first-frame ground previews and main script; full ground maps upgrade after readiness, optional detail/host HTTP compression measured separately', main, criticalAssetsBytes, deferredFullGroundBytes: Object.keys(groundPreviews.rows).reduce((sum, url) => sum + fs.statSync(path.join(source, url)).size, 0), budgets, assets: rows,
  passed: main.gzipBytes <= budgets.mainGzipBytes && criticalAssetsBytes <= budgets.coreSceneTransferBytes };
const output = process.env.TOWN_BUDGET_REPORT;
if (output) { fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n'); }
console.log(JSON.stringify({ passed: report.passed, main, criticalAssetsBytes, budgets }));
if (!report.passed) process.exitCode = 1;
