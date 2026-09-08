import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { prepareNetworkTransfer } from '../../scripts/prepare-network-transfer.mjs';
import { prepareGroundPreviews } from '../../scripts/prepare-ground-previews.mjs';
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

test('network generation preserves a verified alternate zlib encoding and refuses source or artifact corruption', async () => {
  const site = await mkdtemp(join(tmpdir(), 'town-network-generation-'));
  try {
    const data = join(site, 'data/derived/town'), directory = 'fixture-release', base = join(site, 'public/town-assets', directory);
    await mkdir(data, { recursive: true }); await mkdir(base, { recursive: true });
    const points = [[1.1234, -2.0001, 0], [2.1, -2.0002, 3]], original = Buffer.from(JSON.stringify({ nodes: [{ id: 7 }], edges: [{ id: 1, points, speed: 65 }, { id: 2, points: [...points].reverse(), speed: 65 }] }));
    const sourceSha256 = digest(original), manifestSha256 = 'a'.repeat(64);
    await writeFile(join(base, 'network.json'), original);
    await writeFile(join(data, 'release.json'), JSON.stringify({ directory, manifestSha256 }));
    await writeFile(join(data, 'startup.json'), JSON.stringify({ manifestSha256, networkSha256: sourceSha256 }));
    assert.equal((await prepareNetworkTransfer(site)).exactDecodedEquality, true);
    const indexPath = join(data, 'network-transfer.json'), first = JSON.parse(await readFile(indexPath)), firstBytes = await readFile(join(site, 'public', first.url));
    const alternate = gzipSync(gunzipSync(firstBytes), { level: 1 }), sha256 = digest(alternate), url = `/town-finish/v1/network/network.${sha256.slice(0, 16)}.json.gz`;
    const updated = { ...first, url, sha256, bytes: alternate.length };
    await writeFile(join(site, 'public', url), alternate); await writeFile(indexPath, JSON.stringify(updated));
    await prepareNetworkTransfer(site);
    assert.deepEqual(JSON.parse(await readFile(indexPath)), updated); assert.deepEqual(await readFile(join(site, 'public', url)), alternate); assert.deepEqual(await readFile(join(base, 'network.json')), original);
    await writeFile(join(site, 'public', url), 'corrupt'); await assert.rejects(prepareNetworkTransfer(site), /Existing network transport changed/);
    await writeFile(join(base, 'network.json'), '{}'); await assert.rejects(prepareNetworkTransfer(site), /Immutable network changed/);
  } finally { await rm(site, { recursive: true, force: true }); }
});

test('ground preview generation reuses verified source-pinned PNGs without a platform image re-encode', async () => {
  const site = await mkdtemp(join(tmpdir(), 'town-ground-generation-'));
  try {
    const current = JSON.parse(await readFile(new URL('../../data/derived/town/ground-preview.json', import.meta.url))), rows = Object.entries(current.rows);
    const data = join(site, 'data/derived/town'), directory = 'fixture-release', base = join(site, 'public/town-assets', directory);
    await mkdir(data, { recursive: true }); await mkdir(base, { recursive: true }); await mkdir(join(site, 'public/town-finish/v1/ground-preview'), { recursive: true });
    const refs = [], registered = {};
    for (const [i, [, row]] of rows.entries()) {
      const source = Buffer.from(`source map ${i}`), url = `map${i}.jpg`, sourceSha256 = digest(source);
      await writeFile(join(base, url), source); refs.push({ url, bytes: source.length, sha256: sourceSha256 });
      const preview = await readFile(new URL('../../public' + row.url, import.meta.url));
      const previewURL = `/town-finish/v1/ground-preview/map${i}.${row.sha256.slice(0, 16)}.png`;
      await writeFile(join(site, 'public', previewURL), preview); registered[url] = { ...row, sourceSha256, url: previewURL };
    }
    const manifest = Buffer.from(JSON.stringify({ surfaces: { grass: { color: refs[0], normal: refs[1], roughness: refs[2] }, soil: { color: refs[3] }, forest: { color: refs[4] }, impervious: { color: refs[5] } } })), manifestSha256 = digest(manifest);
    await writeFile(join(base, 'manifest.json'), manifest); await writeFile(join(data, 'release.json'), JSON.stringify({ directory, manifestSha256 }));
    const expected = { ...current, directory, sourceManifestSha256: manifestSha256, rows: registered }, indexPath = join(data, 'ground-preview.json');
    await writeFile(indexPath, JSON.stringify(expected));
    assert.equal((await prepareGroundPreviews(site)).groundPreviewMaps, 6); assert.deepEqual(JSON.parse(await readFile(indexPath)), expected);
    await writeFile(join(site, 'public', registered[refs[0].url].url), 'corrupt');
    await assert.rejects(prepareGroundPreviews(site), /Existing ground preview changed/);
  } finally { await rm(site, { recursive: true, force: true }); }
});
