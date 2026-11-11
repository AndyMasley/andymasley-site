// The O'Neill cylinder drive (public/games/oneill-massachusetts) colours its ground from NOAA's 1 m land cover, packed
// into a few hundred files of about 900 MB: too much to keep in git with every new bake. The packs live in a fixed
// GitHub release (data/derived/oneill/release.json); this puts them in place before a build and checks them.
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { cp, mkdtemp, readFile, rename, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const project = resolve(fileURLToPath(new URL('..', import.meta.url)));
const release = JSON.parse(await readFile(join(project, 'data/derived/oneill/release.json'), 'utf8'));
if (release.directory !== 'lcp' || !/^[a-f0-9]{64}$/.test(release.manifestSha256) || !/^[a-f0-9]{64}$/.test(release.archiveSha256)) {
  throw new Error("Invalid O'Neill land cover release");
}
const destination = join(project, 'public/games/oneill-massachusetts/data', release.directory);
const hash = async (path) => { const digest = createHash('sha256'); for await (const data of createReadStream(path)) digest.update(data); return digest.digest('hex'); };

// The manifest is the release's, and every pack it lists is there at its size.
async function installed(root) {
  try {
    if (await hash(join(root, 'manifest.txt')) !== release.manifestSha256) return false;
    const lines = (await readFile(join(root, 'manifest.txt'), 'utf8')).trim().split('\n');
    if (lines.length !== release.files) return false;
    for (const line of lines) {
      const [name, bytes] = line.split(' ');
      if (!/^\d+_\d+\.bin$/.test(name) || (await stat(join(root, name))).size !== Number(bytes)) return false;
    }
    return true;
  } catch { return false; }
}

if (!(await installed(destination))) {
  const scratch = await mkdtemp(join(tmpdir(), 'oneill-lcp-'));
  try {
    const archive = join(scratch, 'lcp.tar');
    console.log("Downloading the O'Neill cylinder's land cover release…");
    const response = await fetch(release.archiveUrl, { signal: AbortSignal.timeout(600000) });
    if (!response.ok || !response.body) throw new Error(`Land cover download failed: HTTP ${response.status}`);
    await pipeline(Readable.fromWeb(response.body), createWriteStream(archive));
    if (await hash(archive) !== release.archiveSha256) throw new Error('Land cover archive checksum did not match the release');
    const paths = execFileSync('tar', ['-tf', archive], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }).trim().split('\n');
    if (paths.some((path) => !path.startsWith(`${release.directory}/`) || path.split('/').includes('..'))) throw new Error('Land cover archive contained an unexpected path');
    execFileSync('tar', ['-xf', archive, '-C', scratch], { stdio: 'inherit' });
    const extracted = join(scratch, release.directory);
    if (!(await installed(extracted))) throw new Error('Extracted land cover did not match the release manifest');
    await rm(destination, { recursive: true, force: true });
    try { await rename(extracted, destination); }
    catch (error) { if (error.code !== 'EXDEV') throw error; await cp(extracted, destination, { recursive: true }); }
  } finally { await rm(scratch, { recursive: true, force: true }); }
}
console.log(`O'Neill land cover: ${release.files} packs in place`);
