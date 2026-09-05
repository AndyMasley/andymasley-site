import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { access, cp, mkdir, mkdtemp, readFile, rename, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const project = resolve(fileURLToPath(new URL('..', import.meta.url)));
const release = JSON.parse(await readFile(join(project, 'data/derived/town/release.json'), 'utf8'));
if (!/^2026-09-[a-f0-9]{8,64}$/.test(release.directory)) throw new Error('Invalid town release directory');
const destination = join(project, 'public/town-assets', release.directory);
const hash = async path => { const digest = createHash('sha256'); for await (const data of createReadStream(path)) digest.update(data); return digest.digest('hex'); };
let installed = false;
try { installed = await hash(join(destination, 'manifest.json')) === release.manifestSha256; } catch {}
if (!installed) {
  const scratch = await mkdtemp(join(tmpdir(), 'webster-assets-'));
  try {
    const archive = join(scratch, 'town.tar.gz');
    console.log('Downloading the fixed Webster scenery release…');
    const response = await fetch(release.archiveUrl, { signal: AbortSignal.timeout(300000) });
    if (!response.ok || !response.body) throw new Error(`Town asset download failed: HTTP ${response.status}`);
    await pipeline(Readable.fromWeb(response.body), createWriteStream(archive));
    if (await hash(archive) !== release.archiveSha256) throw new Error('Town archive checksum did not match the release');
    const paths = execFileSync('tar', ['-tzf', archive], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }).trim().split('\n');
    if (paths.some(path => !path.startsWith(`${release.directory}/`) || path.split('/').includes('..'))) throw new Error('Town archive contained an unexpected path');
    execFileSync('tar', ['-xzf', archive, '-C', scratch], { stdio: 'inherit' });
    const extracted = join(scratch, release.directory);
    if (await hash(join(extracted, 'manifest.json')) !== release.manifestSha256) throw new Error('Extracted town manifest did not match the release');
    await mkdir(dirname(destination), { recursive: true });
    try { await access(destination); throw new Error(`An incomplete town release already exists at ${destination}. Remove that generated directory and retry.`); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    try { await rename(extracted, destination); }
    catch (error) { if (error.code !== 'EXDEV') throw error; await cp(extracted, destination, { recursive: true, errorOnExist: true, force: false }); }
  } finally { await rm(scratch, { recursive: true, force: true }); }
}
execFileSync(process.execPath, [join(project, 'scripts/validate-town-assets.mjs'), '--root', destination], { stdio: 'inherit', cwd: project });
