import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, mkdir, mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { gunzipSync } from 'node:zlib';
import { collectTransferGlbs, prepareTownTransfer } from '../../scripts/prepare-town-transfer.mjs';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const directory = '2026-09-12345678';
function glb(text) {
  const json = Buffer.from(JSON.stringify({ asset: { version: '2.0' }, extras: { text } }));
  const chunk = Buffer.alloc(Math.ceil(json.length / 4) * 4, 32);
  json.copy(chunk);
  const bytes = Buffer.alloc(20 + chunk.length);
  bytes.writeUInt32LE(0x46546c67, 0);
  bytes.writeUInt32LE(2, 4);
  bytes.writeUInt32LE(bytes.length, 8);
  bytes.writeUInt32LE(chunk.length, 12);
  bytes.writeUInt32LE(0x4e4f534a, 16);
  chunk.copy(bytes, 20);
  return bytes;
}
async function fixture(t) {
  const project = await mkdtemp(join(tmpdir(), 'town-transfer-test-'));
  t.after(() => rm(project, { recursive: true, force: true }));
  const source = join(project, 'public/town-assets', directory);
  const target = join(project, 'public/town-transfer/gzip-v1', directory);
  const data = new Map([
    ['models/fallback.glb', glb('terrain '.repeat(1000))],
    ['models/tree.glb', glb('leaves '.repeat(1000))],
    ['models/car.glb', glb('wheels '.repeat(1000))],
    ['tiles/-12_-4-0.glb', glb('houses '.repeat(1000))],
  ]);
  for (const [path, bytes] of data) {
    await mkdir(dirname(join(source, path)), { recursive: true });
    await writeFile(join(source, path), bytes);
  }
  const refs = [...data].map(([url, bytes]) => ({ url, bytes: bytes.length, sha256: digest(bytes) }));
  const manifest = { fallback: refs[0], trees: { prototypes: [refs[1]] }, car: refs[2], tiles: [{ lods: [refs[3], refs[3]] }], network: { url: 'network.json' }, textures: [{ url: 'texture.png' }] };
  async function saveManifest() {
    const bytes = Buffer.from(JSON.stringify(manifest));
    await writeFile(join(source, 'manifest.json'), bytes);
    await mkdir(join(project, 'data/derived/town'), { recursive: true });
    await writeFile(join(project, 'data/derived/town/release.json'), JSON.stringify({ version: 1, directory, manifestSha256: digest(bytes) }));
  }
  await saveManifest();
  return { project, source, target, data, manifest, saveManifest };
}

test('generates only referenced GLBs, deduplicates references and preserves every source byte', async t => {
  const f = await fixture(t);
  const report = await prepareTownTransfer({ project: f.project, concurrency: 2 });
  assert.equal(report.files, 4);
  assert.equal(report.generated, 4);
  assert.equal(report.reused, 0);
  assert.equal(report.originalBytes, [...f.data.values()].reduce((sum, bytes) => sum + bytes.length, 0));
  assert.ok(report.gzipBytes < report.originalBytes / 4);
  for (const [path, bytes] of f.data) {
    const packed = await readFile(join(f.target, `${path}.gz`));
    assert.deepEqual(gunzipSync(packed), bytes);
    assert.deepEqual(await readFile(join(f.source, path)), bytes);
    assert.equal(packed.readUInt32LE(4), 0);
    assert.equal(packed[9], 255);
  }
  assert.deepEqual((await readdir(f.target, { recursive: true })).filter(path => path.endsWith('.gz')).sort(), [...f.data.keys()].map(path => `${path}.gz`).sort());
  assert.deepEqual((await readdir(f.source)).sort(), ['manifest.json', 'models', 'tiles']);
});

test('is byte-deterministic across fresh runs and reuses verified files without rewriting them', async t => {
  const f = await fixture(t);
  await prepareTownTransfer({ project: f.project });
  const path = join(f.target, 'tiles/-12_-4-0.glb.gz');
  const first = await readFile(path);
  const modified = (await stat(path)).mtimeMs;
  const reused = await prepareTownTransfer({ project: f.project });
  assert.equal(reused.generated, 0);
  assert.equal(reused.reused, 4);
  assert.equal((await stat(path)).mtimeMs, modified);
  await rm(f.target, { recursive: true });
  await prepareTownTransfer({ project: f.project, concurrency: 1 });
  assert.deepEqual(await readFile(path), first);
});

test('repairs corrupted gzip while retaining the complete lossless release', async t => {
  const f = await fixture(t);
  await prepareTownTransfer({ project: f.project });
  const path = join(f.target, 'models/tree.glb.gz');
  const packed = await readFile(path);
  packed[packed.length - 5] ^= 255;
  await writeFile(path, packed);
  const report = await prepareTownTransfer({ project: f.project });
  assert.equal(report.generated, 1);
  assert.equal(report.reused, 3);
  assert.deepEqual(gunzipSync(await readFile(path)), f.data.get('models/tree.glb'));
  assert.deepEqual(await readdir(dirname(f.target)), [directory]);
});

test('missing source fails before publishing any partial release and cleans staging files', async t => {
  const f = await fixture(t);
  await rm(join(f.source, 'tiles/-12_-4-0.glb'));
  await assert.rejects(prepareTownTransfer({ project: f.project }), { code: 'ENOENT' });
  await assert.rejects(access(f.target), { code: 'ENOENT' });
  assert.deepEqual(await readdir(dirname(f.target)), []);
});

test('failed source validation leaves an existing published transfer release intact', async t => {
  const f = await fixture(t);
  await prepareTownTransfer({ project: f.project });
  const path = join(f.target, 'models/fallback.glb.gz');
  const previous = await readFile(path);
  await writeFile(join(f.source, 'models/fallback.glb'), glb('changed source'));
  await assert.rejects(prepareTownTransfer({ project: f.project }), /source checksum mismatch/);
  assert.deepEqual(await readFile(path), previous);
  assert.deepEqual(await readdir(dirname(f.target)), [directory]);
});

test('rejects malformed, conflicting and unsafe manifest paths', async t => {
  const f = await fixture(t);
  for (const url of ['../escape.glb', '/escape.glb', 'models/../escape.glb', 'models//x.glb', 'https://a/x.glb', 'models/%2e%2e/x.glb', 'models/x.glb?x=1', 'models\\x.glb', 'models/x.png']) {
    const manifest = structuredClone(f.manifest);
    manifest.fallback.url = url;
    assert.throws(() => collectTransferGlbs(manifest), /Invalid town transfer GLB reference/);
  }
  const badSize = structuredClone(f.manifest);
  badSize.fallback.bytes = 0;
  assert.throws(() => collectTransferGlbs(badSize), /Invalid town transfer GLB reference/);
  const duplicate = structuredClone(f.manifest);
  duplicate.tiles[0].lods[1] = { ...duplicate.tiles[0].lods[1], sha256: '0'.repeat(64) };
  assert.throws(() => collectTransferGlbs(duplicate), /Conflicting town transfer reference/);
  assert.throws(() => collectTransferGlbs({}), /Invalid town transfer manifest/);
  f.manifest.tiles.push({ lods: [] });
  assert.equal(collectTransferGlbs(f.manifest).length, 4);
  f.manifest.tiles[0].lods = null;
  assert.throws(() => collectTransferGlbs(f.manifest), /Invalid town tile LODs/);
});

test('rejects a source symlink even if its bytes match the pinned manifest', async t => {
  const f = await fixture(t);
  const path = join(f.source, 'models/tree.glb');
  const external = join(f.project, 'external.glb');
  await writeFile(external, f.data.get('models/tree.glb'));
  await rm(path);
  await symlink(external, path);
  await assert.rejects(prepareTownTransfer({ project: f.project }), /not a regular file/);
});

test('rejects mismatched manifest hashes, malformed GLBs and invalid release/configuration', async t => {
  const f = await fixture(t);
  await writeFile(join(f.source, 'manifest.json'), '{}');
  await assert.rejects(prepareTownTransfer({ project: f.project }), /manifest checksum mismatch/);
  await f.saveManifest();
  const invalid = Buffer.from(f.data.get('models/tree.glb'));
  invalid.writeUInt32LE(0, 0);
  await writeFile(join(f.source, 'models/tree.glb'), invalid);
  f.manifest.trees.prototypes[0].sha256 = digest(invalid);
  await f.saveManifest();
  await assert.rejects(prepareTownTransfer({ project: f.project }), /Invalid town transfer GLB header/);
  await writeFile(join(f.project, 'data/derived/town/release.json'), JSON.stringify({ version: 1, directory: '../escape', manifestSha256: '0'.repeat(64) }));
  await assert.rejects(prepareTownTransfer({ project: f.project }), /Invalid town transfer release/);
  await assert.rejects(prepareTownTransfer({ project: f.project, concurrency: 9 }), /concurrency must be/);
});
