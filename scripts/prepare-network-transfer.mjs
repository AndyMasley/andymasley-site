import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { isDeepStrictEqual } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
export async function prepareNetworkTransfer(site = path.resolve(fileURLToPath(new URL('..', import.meta.url)))) {
const data = path.join(site, 'data/derived/town');
const release = JSON.parse(await readFile(path.join(data, 'release.json'))), startup = JSON.parse(await readFile(path.join(data, 'startup.json')));
const raw = await readFile(path.join(site, 'public/town-assets', release.directory, 'network.json')), sha = value => createHash('sha256').update(value).digest('hex');
if (sha(raw) !== startup.networkSha256 || startup.manifestSha256 !== release.manifestSha256) throw Error('Immutable network changed');
const source = JSON.parse(raw), known = new Map(); let reversals = 0, coordinates = 0;
const edges = source.edges.map(edge => {
  const reverse = known.get(JSON.stringify([...edge.points].reverse()));
  if (reverse !== undefined) { reversals++; return { ...edge, points: { reverse } }; }
  known.set(JSON.stringify(edge.points), edge.id);
  const previous = [0, 0, 0], points = [];
  for (const point of edge.points) for (let axis = 0; axis < 3; axis++) {
    const integer = Math.round(point[axis] * 10000); coordinates++;
    if (!Number.isSafeInteger(integer) || !Object.is(integer / 10000, point[axis])) throw Error('Network coordinate cannot round-trip exactly');
    points.push(integer - previous[axis]); previous[axis] = integer;
  }
  return { ...edge, points };
});
const packed = { format: 'webster-network-delta-v1', sourceSha256: startup.networkSha256, network: { ...source, edges } };
// Execute the production decoder for the exhaustive generation gate.
const built = await build({ entryPoints: [fileURLToPath(new URL('../src/lib/town/network-codec.ts', import.meta.url))], bundle: true, platform: 'node', format: 'esm', write: false, logLevel: 'silent' });
const { unpackNetwork } = await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64'));
const encoded = Buffer.from(JSON.stringify(packed));
// Preserve reviewed transport bytes across zlib/platform versions. Source and
// decoded bytes are still exhaustively re-derived above; an existing artifact
// is reusable only when every catalog identity and both checksums agree.
let compressed, previous;
try { previous = JSON.parse(await readFile(path.join(data, 'network-transfer.json'))); } catch (error) { if (error.code !== 'ENOENT') throw error; }
if (previous?.sourceSha256 === startup.networkSha256 && previous.sourceManifestSha256 === release.manifestSha256 && previous.decodedSha256 === sha(encoded)) {
  if (!/^\/town-finish\/v1\/network\/network\.[a-f0-9]{16}\.json\.gz$/.test(previous.url)) throw Error('Invalid existing network transport URL');
  compressed = await readFile(path.join(site, 'public', previous.url));
  if (compressed.length !== previous.bytes || sha(compressed) !== previous.sha256 || !gunzipSync(compressed).equals(encoded)) throw Error('Existing network transport changed');
} else {
  compressed = gzipSync(encoded, { level: 9 }); compressed.writeUInt32LE(0, 4); compressed[9] = 255;
}
if (!isDeepStrictEqual(unpackNetwork(JSON.parse(gunzipSync(compressed)), startup.networkSha256), source)) throw Error('Decoded network differs from immutable source');
const hash = sha(compressed), url = `/town-finish/v1/network/network.${hash.slice(0, 16)}.json.gz`;
await mkdir(path.dirname(path.join(site, 'public', url)), { recursive: true }); await writeFile(path.join(site, 'public', url), compressed);
await writeFile(path.join(data, 'network-transfer.json'), JSON.stringify({ version: 1, directory: release.directory, sourceManifestSha256: release.manifestSha256, sourceSha256: startup.networkSha256, url, bytes: compressed.length, sha256: hash, decodedSha256: sha(encoded), edges: edges.length, storedCoordinates: coordinates, exactReversedPaths: reversals }, null, 2) + '\n');
return { networkSourceBytes: raw.length, compactGzipBytes: compressed.length, edges: edges.length, storedCoordinates: coordinates, exactReversedPaths: reversals, exactDecodedEquality: true };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) console.log(JSON.stringify(await prepareNetworkTransfer()));
