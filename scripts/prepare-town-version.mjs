import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const site = resolve(fileURLToPath(new URL('..', import.meta.url)));
const paths = new Set([join(site, 'src/pages/town.astro')]);
async function collect(directory) {
  for (const row of await readdir(directory, { withFileTypes: true })) {
    if (row.isDirectory()) { if (row.name !== '__tests__') await collect(join(directory, row.name)); }
    else if (row.name.endsWith('.ts') && !row.name.endsWith('.test.ts')) paths.add(join(directory, row.name));
  }
}
await collect(join(site, 'src/lib/town'));
// Include only JSON actually imported by the runtime, not unrelated research or
// a timestamp. Exclude the generated identity itself to avoid a circular hash.
for (const source of [...paths]) {
  const text = await readFile(source, 'utf8');
  for (const match of text.matchAll(/from\s+['"]([^'"]+\.json)['"]/g)) {
    const path = resolve(dirname(source), match[1]);
    if (path.endsWith('/runtime-version.json')) continue;
    paths.add(path);
  }
}
const hash = createHash('sha256');
for (const path of [...paths].sort()) { hash.update(relative(site, path)); hash.update('\0'); hash.update(await readFile(path)); hash.update('\0'); }
const metadata = { version: 1, runtimeSha256: hash.digest('hex') };
const encoded = JSON.stringify(metadata, null, 2) + '\n';
await writeFile(join(site, 'data/derived/town/runtime-version.json'), encoded);
await writeFile(join(site, 'public/town-version.json'), encoded);
console.log(`Town runtime identity: ${metadata.runtimeSha256}`);
