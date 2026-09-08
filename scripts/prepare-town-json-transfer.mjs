import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile, mkdir, lstat, realpath, rename } from 'node:fs/promises';
import { dirname, join, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { gzip, gunzip } from 'node:zlib';

const compress = promisify(gzip), decompress = promisify(gunzip);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

/** Build alternate encodings only. Every decoded byte must match its current
 * authoritative file. Never rewrite or prune the source asset families. */
export async function prepareTownJsonTransfer(project = resolve(fileURLToPath(new URL('..', import.meta.url)))) {
  const release = JSON.parse(await readFile(join(project, 'data/derived/town/release.json')));
  if (!/^2026-09-[a-f0-9]{8,64}$/.test(release.directory)) throw new Error('Invalid pinned release');
  const root = await realpath(join(project, 'public'));
  const manifest = await readFile(join(root, 'town-assets', release.directory, 'manifest.json'));
  if (sha(manifest) !== release.manifestSha256) throw new Error('Source manifest changed');
  const sourceRefs = new Map([['manifest.json', { bytes: manifest.length, sha256: release.manifestSha256 }]]);
  function collectRefs(value) {
    if (!value || typeof value !== 'object') return;
    if (typeof value.url === 'string' && value.url.endsWith('.json')) sourceRefs.set(value.url, value);
    for (const child of Object.values(value)) collectRefs(child);
  }
  collectRefs(JSON.parse(manifest));
  const directories = [`town-assets/${release.directory}`, 'town-evidence/v1', 'town-finish/v1', 'town-surfaces/v2', 'town-roadside'];
  const rows = [];
  async function walk(directory, pinned) {
    let entries; try { entries = await readdir(directory, { withFileTypes: true }); } catch (error) { if (error.code === 'ENOENT') return; throw error; }
    for (const entry of entries) {
      const path = join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error('Unexpected symlink in town assets');
      if (entry.isDirectory()) await walk(path, pinned);
      else if (entry.isFile() && (pinned ? sourceRefs.has(relative(join(root, 'town-assets', release.directory), path)) : /[.-][0-9a-f]{8,64}\.json$/.test(entry.name))) rows.push(path);
    }
  }
  for (const directory of directories) await walk(join(root, directory), directory.startsWith('town-assets'));
  rows.sort();
  const outputRoot = join(root, 'town-transfer/json-gzip-v1');
  await mkdir(outputRoot, { recursive: true });
  if (!(await lstat(outputRoot)).isDirectory() || !(await realpath(outputRoot)).startsWith(root + sep)) throw new Error('Unsafe transfer destination');
  const report = { version: 1, sourceManifestSha256: release.manifestSha256, files: rows.length, originalBytes: 0, gzipBytes: 0, generated: 0, reused: 0 };
  let cursor = 0;
  await Promise.all(Array.from({ length: 4 }, async () => {
    for (;;) {
      const path = rows[cursor++]; if (!path) return;
      const raw = await readFile(path), output = join(outputRoot, relative(root, path) + '.gz');
      const sourcePath = relative(join(root, 'town-assets', release.directory), path);
      const expected = sourceRefs.get(sourcePath);
      const digest = sha(raw);
      if (expected ? raw.length !== expected.bytes || digest !== expected.sha256 : !digest.startsWith(path.match(/[.-]([0-9a-f]{8,64})\.json$/)?.[1] ?? '!')) throw new Error('Source JSON checksum mismatch: ' + relative(root, path));
      let packed;
      try {
        const previous = await readFile(output);
        if ((await decompress(previous, { maxOutputLength: raw.length })).equals(raw)) { packed = previous; report.reused++; }
      } catch (error) { if (!['ENOENT', 'Z_DATA_ERROR', 'Z_BUF_ERROR', 'ERR_BUFFER_TOO_LARGE'].includes(error.code)) throw error; }
      if (!packed) {
        packed = await compress(raw, { level: 9 }); packed.writeUInt32LE(0, 4); packed[9] = 255;
        if (!(await decompress(packed, { maxOutputLength: raw.length })).equals(raw)) throw new Error('JSON transfer round trip failed');
        await mkdir(dirname(output), { recursive: true }); await writeFile(output + '.pending', packed); await rename(output + '.pending', output); report.generated++;
      }
      report.originalBytes += raw.length; report.gzipBytes += packed.length;
    }
  }));
  return report;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = await prepareTownJsonTransfer();
  console.log(`Town JSON transfer: ${report.files} exact payloads, ${report.originalBytes} → ${report.gzipBytes} bytes; ${report.generated} generated, ${report.reused} verified.`);
}
