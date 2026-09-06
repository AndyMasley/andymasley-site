import { createHash } from 'node:crypto';
import { copyFile, lstat, mkdir, mkdtemp, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { gzip, gunzip } from 'node:zlib';

const compress = promisify(gzip);
const decompress = promisify(gunzip);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));

export function collectTransferGlbs(manifest) {
  if (!manifest || !Array.isArray(manifest.tiles) || !manifest.tiles.length ||
      !Array.isArray(manifest.trees?.prototypes) || !manifest.trees.prototypes.length || !manifest.fallback) {
    throw new Error('Invalid town transfer manifest');
  }
  const references = [manifest.fallback, ...manifest.trees.prototypes];
  if (manifest.car) references.push(manifest.car);
  for (const tile of manifest.tiles) {
    if (!Array.isArray(tile?.lods)) throw new Error('Invalid town tile LODs');
    references.push(...tile.lods);
  }
  const files = new Map();
  for (const file of references) {
    if (!file || typeof file.url !== 'string' ||
        !/^(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-][A-Za-z0-9_.-]*\.glb$/.test(file.url) ||
        file.url.split('/').some(part => part === '.' || part === '..') ||
        !Number.isSafeInteger(file.bytes) || file.bytes < 12 || !/^[a-f0-9]{64}$/.test(file.sha256 ?? '')) {
      throw new Error(`Invalid town transfer GLB reference: ${String(file?.url)}`);
    }
    const previous = files.get(file.url);
    if (previous && (previous.bytes !== file.bytes || previous.sha256 !== file.sha256)) {
      throw new Error(`Conflicting town transfer reference: ${file.url}`);
    }
    files.set(file.url, { url: file.url, bytes: file.bytes, sha256: file.sha256 });
  }
  return [...files.values()].sort((a, b) => a.url < b.url ? -1 : a.url > b.url ? 1 : 0);
}

async function regularFile(path, root) {
  const stat = await lstat(path);
  if (!stat.isFile() || !(await realpath(path)).startsWith(`${root}${sep}`)) {
    throw new Error(`Town transfer path is not a regular file within its root: ${path}`);
  }
  return readFile(path);
}

export async function prepareTownTransfer({ project = projectRoot, concurrency = 4 } = {}) {
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 8) throw new Error('Town transfer concurrency must be 1–8');
  const release = JSON.parse(await readFile(join(project, 'data/derived/town/release.json'), 'utf8'));
  if (release.version !== 1 || !/^2026-09-[a-f0-9]{8,64}$/.test(release.directory ?? '') ||
      !/^[a-f0-9]{64}$/.test(release.manifestSha256 ?? '')) throw new Error('Invalid town transfer release');
  const source = await realpath(join(project, 'public/town-assets', release.directory));
  const manifestBytes = await regularFile(join(source, 'manifest.json'), source);
  if (sha256(manifestBytes) !== release.manifestSha256) throw new Error('Town transfer manifest checksum mismatch');
  const files = collectTransferGlbs(JSON.parse(manifestBytes.toString('utf8')));
  const parent = join(project, 'public/town-transfer/gzip-v1');
  await mkdir(parent, { recursive: true });
  const parentRoot = await realpath(parent);
  const destination = join(parentRoot, release.directory);
  let existingRoot;
  try {
    const stat = await lstat(destination);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Town transfer destination must be a real directory');
    existingRoot = await realpath(destination);
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const stage = await mkdtemp(join(parentRoot, '.prepare-'));
  const report = { version: 1, directory: release.directory, files: files.length, originalBytes: 0, gzipBytes: 0, generated: 0, reused: 0 };
  let cursor = 0;
  let failure;
  try {
    const workers = Array.from({ length: Math.min(concurrency, files.length) }, async () => {
      while (!failure && cursor < files.length) {
        const file = files[cursor++];
        try {
          const raw = await regularFile(join(source, file.url), source);
          if (raw.length !== file.bytes || sha256(raw) !== file.sha256) throw new Error(`Town transfer source checksum mismatch: ${file.url}`);
          if (raw.readUInt32LE(0) !== 0x46546c67 || raw.readUInt32LE(4) !== 2 || raw.readUInt32LE(8) !== raw.length) {
            throw new Error(`Invalid town transfer GLB header: ${file.url}`);
          }
          const output = join(stage, `${file.url}.gz`);
          await mkdir(dirname(output), { recursive: true });
          let packed;
          if (existingRoot) {
            try {
              const previous = await regularFile(join(existingRoot, `${file.url}.gz`), existingRoot);
              const canonicalHeader = previous.length >= 18 && previous[3] === 0 && previous.readUInt32LE(4) === 0 && previous[8] === 2 && previous[9] === 255;
              if (canonicalHeader && (await decompress(previous, { maxOutputLength: raw.length })).equals(raw)) {
                packed = previous;
                await copyFile(join(existingRoot, `${file.url}.gz`), output);
                report.reused++;
              }
            } catch (error) {
              if (error.code !== 'ENOENT' && error.code !== 'Z_DATA_ERROR' && error.code !== 'Z_BUF_ERROR' && error.code !== 'ERR_BUFFER_TOO_LARGE') throw error;
            }
          }
          if (!packed) {
            packed = await compress(raw, { level: 9 });
            // A fixed zero timestamp and platform byte make the gzip envelope reproducible.
            packed.writeUInt32LE(0, 4);
            packed[9] = 255;
            if (!(await decompress(packed, { maxOutputLength: raw.length })).equals(raw)) throw new Error(`Town transfer round-trip mismatch: ${file.url}`);
            await writeFile(output, packed, { flag: 'wx' });
            report.generated++;
          }
          report.originalBytes += raw.length;
          report.gzipBytes += packed.length;
        } catch (error) { failure ??= error; }
      }
    });
    await Promise.all(workers);
    if (failure) throw failure;
    if (!report.generated && existingRoot) return report;
    // Only publish a complete, verified release; a failed build leaves the prior one intact.
    let backup;
    if (existingRoot) {
      backup = await mkdtemp(join(parentRoot, '.previous-'));
      await rm(backup, { recursive: true });
      await rename(destination, backup);
    }
    try { await rename(stage, destination); }
    catch (error) {
      if (backup) await rename(backup, destination);
      throw error;
    }
    if (backup) await rm(backup, { recursive: true, force: true });
    return report;
  } finally { await rm(stage, { recursive: true, force: true }); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = await prepareTownTransfer();
  const saved = (100 * (1 - report.gzipBytes / report.originalBytes)).toFixed(1);
  console.log(`Town transfer: ${report.files} lossless GLBs, ${report.originalBytes} → ${report.gzipBytes} bytes (${saved}% smaller); ${report.generated} generated, ${report.reused} verified and reused.`);
}
