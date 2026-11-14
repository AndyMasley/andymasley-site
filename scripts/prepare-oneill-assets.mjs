// The O'Neill cylinder drive (public/games/oneill-massachusetts) keeps its biggest data folders out of git: the 1 m
// land cover packs (lcp, about 1.2 GB), the region files a building rebake rewrites (r2, b3, lights, a few hundred
// MB each time) and the aerial photographs at 5.75 m (aer, about 160 MB). Each folder lives in a fixed GitHub
// release (data/derived/oneill/release.json, written by the game repo's site/publish_packs.py); this puts each in
// place before a build and checks it.
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
const DIRECTORIES = ['lcp', 'r2', 'b3', 'lights', 'aer'];
const NAME = /^\d+_\d+\.(bin|png|webp)$/;
if (release.version !== 2 || !Array.isArray(release.packs)) throw new Error("Invalid O'Neill release list");
const hash = async (path) => { const digest = createHash('sha256'); for await (const data of createReadStream(path)) digest.update(data); return digest.digest('hex'); };

for (const pack of release.packs) {
  if (!DIRECTORIES.includes(pack.directory) || !/^[a-f0-9]{64}$/.test(pack.manifestSha256) || !/^[a-f0-9]{64}$/.test(pack.archiveSha256)
      || !pack.archiveUrl.startsWith('https://github.com/AndyMasley/andymasley-site/releases/download/')) {
    throw new Error(`Invalid O'Neill release entry ${pack.directory}`);
  }
  const destination = join(project, 'public/games/oneill-massachusetts/data', pack.directory);

  // The manifest is the release's, and every file it lists is there at its size.
  const installed = async (root) => {
    try {
      if (await hash(join(root, 'manifest.txt')) !== pack.manifestSha256) return false;
      const lines = (await readFile(join(root, 'manifest.txt'), 'utf8')).trim().split('\n');
      if (lines.length !== pack.files) return false;
      for (const line of lines) {
        const [name, bytes] = line.split(' ');
        if (!NAME.test(name) || (await stat(join(root, name))).size !== Number(bytes)) return false;
      }
      return true;
    } catch { return false; }
  };

  if (!(await installed(destination))) {
    const scratch = await mkdtemp(join(tmpdir(), `oneill-${pack.directory}-`));
    try {
      const archive = join(scratch, `${pack.directory}.tar`);
      console.log(`Downloading the O'Neill cylinder's ${pack.directory} release…`);
      const response = await fetch(pack.archiveUrl, { signal: AbortSignal.timeout(600000) });
      if (!response.ok || !response.body) throw new Error(`${pack.directory} download failed: HTTP ${response.status}`);
      await pipeline(Readable.fromWeb(response.body), createWriteStream(archive));
      if (await hash(archive) !== pack.archiveSha256) throw new Error(`${pack.directory} archive checksum did not match the release`);
      const paths = execFileSync('tar', ['-tf', archive], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }).trim().split('\n');
      if (paths.some((path) => !path.startsWith(`${pack.directory}/`) || path.split('/').includes('..'))) throw new Error(`${pack.directory} archive contained an unexpected path`);
      execFileSync('tar', ['-xf', archive, '-C', scratch], { stdio: 'inherit' });
      const extracted = join(scratch, pack.directory);
      if (!(await installed(extracted))) throw new Error(`Extracted ${pack.directory} did not match the release manifest`);
      await rm(destination, { recursive: true, force: true });
      try { await rename(extracted, destination); }
      catch (error) { if (error.code !== 'EXDEV') throw error; await cp(extracted, destination, { recursive: true }); }
    } finally { await rm(scratch, { recursive: true, force: true }); }
  }
  console.log(`O'Neill ${pack.directory}: ${pack.files} files in place`);
}
