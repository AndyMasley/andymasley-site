/** First-frame mip previews only. All six full original maps remain the final
 * material assets and are restored asynchronously after first readiness. */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
export async function prepareGroundPreviews(site = path.resolve(fileURLToPath(new URL('..', import.meta.url)))) {
const data = path.join(site, 'data/derived/town');
const release = JSON.parse(await readFile(path.join(data, 'release.json'))), base = path.join(site, 'public/town-assets', release.directory);
const sha = bytes => createHash('sha256').update(bytes).digest('hex'), manifestBytes = await readFile(path.join(base, 'manifest.json'));
if (sha(manifestBytes) !== release.manifestSha256) throw Error('Source manifest changed');
const s = JSON.parse(manifestBytes).surfaces, refs = [s.grass.color, s.grass.normal, s.grass.roughness, s.soil.color, s.forest.color, s.impervious.color], rows = {};
let previous;
try { previous = JSON.parse(await readFile(path.join(data, 'ground-preview.json'))); } catch (error) { if (error.code !== 'ENOENT') throw error; }
await mkdir(path.join(site, 'public/town-finish/v1/ground-preview'), { recursive: true });
for (const ref of refs) {
  const raw = await readFile(path.join(base, ref.url)); if (sha(raw) !== ref.sha256) throw Error('Full ground map changed');
  // A true low-resolution transport level: retain all channels as lossless PNG.
  // Texture colorSpace still comes from the original map's color/data role.
  // The reviewed preview is a versioned asset, not a platform-specific build
  // output. Reuse it after byte/source/dimension checks; Sharp is needed only
  // when authoring previews for a genuinely different source release.
  const prior = previous?.version === 1 && previous.sourceManifestSha256 === release.manifestSha256 && previous.previewSize === 128 && previous.rows?.[ref.url];
  let bytes;
  if (prior?.sourceSha256 === ref.sha256) {
    if (!/^\/town-finish\/v1\/ground-preview\/[a-zA-Z0-9_.-]+\.[a-f0-9]{16}\.png$/.test(prior.url)) throw Error('Invalid existing preview URL');
    bytes = await readFile(path.join(site, 'public', prior.url));
    if (bytes.length !== prior.bytes || sha(bytes) !== prior.sha256 || !bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) || bytes.readUInt32BE(16) !== 128 || bytes.readUInt32BE(20) !== 128) throw Error('Existing ground preview changed');
  } else {
    const { default: sharp } = await import('sharp');
    bytes = await sharp(raw).resize(128, 128, { kernel: 'lanczos3', fit: 'fill' }).png({ compressionLevel: 9 }).toBuffer();
  }
  const hash = sha(bytes), url = `/town-finish/v1/ground-preview/${path.basename(ref.url, '.jpg')}.${hash.slice(0, 16)}.png`;
  await writeFile(path.join(site, 'public', url), bytes); rows[ref.url] = { sourceSha256: ref.sha256, url, bytes: bytes.length, sha256: hash };
}
await writeFile(path.join(data, 'ground-preview.json'), JSON.stringify({ version: 1, sourceManifestSha256: release.manifestSha256, directory: release.directory, finalMapsUnchanged: true, previewSize: 128, rows }, null, 2) + '\n');
return { groundPreviewMaps: refs.length, previewBytes: Object.values(rows).reduce((sum, row) => sum + row.bytes, 0), finalOriginalBytes: refs.reduce((sum, row) => sum + row.bytes, 0) };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) console.log(JSON.stringify(await prepareGroundPreviews()));
