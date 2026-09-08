import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { prepareTownJsonTransfer } from '../../scripts/prepare-town-json-transfer.mjs';

test('JSON encodings round-trip, preserve sources, reuse unchanged data and repair corrupt alternate transport', async () => {
  const project = await mkdtemp(join(tmpdir(), 'town-json-check-'));
  try {
    const directory = '2026-09-abcdef123456', source = join(project, 'public/town-assets', directory), supplemental = join(project, 'public/town-evidence/v1/terrain');
    await mkdir(source, { recursive: true }); await mkdir(supplemental, { recursive: true }); await mkdir(join(project, 'data/derived/town'), { recursive: true });
    const digest = bytes => createHash('sha256').update(bytes).digest('hex');
    const network = Buffer.from(JSON.stringify({ points: Array.from({length:100},(_,i)=>[i,i+1,i+2]) }));
    const manifest = Buffer.from(JSON.stringify({ source: 'immutable', network: { url: 'network.json', bytes: network.length, sha256: digest(network) } }));
    await writeFile(join(source, 'manifest.json'), manifest); await writeFile(join(source, 'network.json'), network);
    const body = '{"tile":"a"}';
    await writeFile(join(supplemental, `a.${digest(body).slice(0,12)}.json`), body); await writeFile(join(supplemental, 'unhashed.json'), '{}');
    await writeFile(join(project, 'data/derived/town/release.json'), JSON.stringify({ directory, manifestSha256: createHash('sha256').update(manifest).digest('hex') }));
    const first = await prepareTownJsonTransfer(project); assert.equal(first.files, 3); assert.equal(first.generated, 3);
    const packedPath = join(project, 'public/town-transfer/json-gzip-v1/town-assets', directory, 'network.json.gz');
    const packed = await readFile(packedPath); assert.deepEqual(gunzipSync(packed), network); assert.deepEqual(await readFile(join(source, 'network.json')), network);
    const second = await prepareTownJsonTransfer(project); assert.equal(second.generated, 0); assert.equal(second.reused, 3);
    await writeFile(packedPath, 'corrupt'); const repaired = await prepareTownJsonTransfer(project); assert.equal(repaired.generated, 1); assert.deepEqual(await readFile(packedPath), packed);
    await writeFile(join(source, 'network.json'), '{}'); await assert.rejects(prepareTownJsonTransfer(project), /Source JSON checksum mismatch/); await writeFile(join(source, 'network.json'), network);
    await writeFile(join(source, 'manifest.json'), '{}'); await assert.rejects(prepareTownJsonTransfer(project), /Source manifest changed/);
  } finally { await rm(project, { recursive: true, force: true }); }
});
