// Dry-run diff for the build-time smartener: runs the real smarten
// functions (transpiled from src/lib/smarten.ts, not re-implemented) over
// every cached post body and title in both committed caches, and prints
// every changed run of text with context. The hard gate the plan requires:
// review this output before shipping the smartener.
//
// Usage: node scripts/smarten-dryrun.mjs [--verbose]

import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { transformSync } from 'esbuild';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const verbose = process.argv.includes('--verbose');

// Load the real implementation.
const ts = readFileSync(join(root, 'src/lib/smarten.ts'), 'utf8');
const js = transformSync(ts, { loader: 'ts', format: 'esm' }).code;
const mod = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
const { smartenHtmlText, normalizePlainText } = mod;

function* changedRuns(before, after) {
  // Align by character; report runs where they differ (lengths are equal —
  // every rule is 1:1 char replacement).
  if (before.length !== after.length) {
    yield { kind: 'LENGTH-CHANGE', before: `${before.length}`, after: `${after.length}` };
    return;
  }
  for (let i = 0; i < before.length; i++) {
    if (before[i] !== after[i]) {
      const start = Math.max(0, i - 40);
      const end = Math.min(before.length, i + 40);
      yield {
        kind: `${JSON.stringify(before[i])}→${JSON.stringify(after[i])}`,
        before: before.slice(start, end).replace(/\s+/g, ' '),
        after: after.slice(start, end).replace(/\s+/g, ' '),
      };
    }
  }
}

let totalPosts = 0, changedPosts = 0, totalChars = 0;
const charCounts = new Map();

for (const cache of ['substack', 'eaforum']) {
  const dir = join(root, '.cache', cache, 'content');
  for (const file of readdirSync(dir).sort()) {
    if (!file.endsWith('.html')) continue;
    totalPosts++;
    const html = readFileSync(join(dir, file), 'utf8');
    const out = smartenHtmlText(html);
    if (out === html) continue;
    changedPosts++;
    let n = 0;
    const samples = [];
    for (const run of changedRuns(html, out)) {
      n++;
      const key = run.kind;
      charCounts.set(key, (charCounts.get(key) || 0) + 1);
      if (samples.length < (verbose ? 1000 : 3)) samples.push(run);
    }
    totalChars += n;
    console.log(`\n== ${cache}/${file}: ${n} character(s) changed`);
    for (const s of samples) {
      console.log(`   ${s.kind}`);
      console.log(`   - …${s.before}…`);
      console.log(`   + …${s.after}…`);
    }
    if (n > samples.length) console.log(`   … and ${n - samples.length} more`);
  }
}

// Titles + standfirsts from posts.json
console.log('\n===== TITLES / STANDFIRSTS =====');
for (const cache of ['substack', 'eaforum']) {
  const raw = JSON.parse(readFileSync(join(root, '.cache', cache, 'posts.json'), 'utf8'));
  const posts = Array.isArray(raw) ? raw : raw.posts;
  for (const p of posts) {
    for (const field of ['title', 'description']) {
      const val = p[field];
      if (!val) continue;
      const norm = normalizePlainText(val);
      if (norm !== val) {
        console.log(`  ${cache}/${p.slug} ${field}:`);
        console.log(`  - ${val}`);
        console.log(`  + ${norm}`);
      }
    }
  }
}

console.log(`\n===== SUMMARY =====`);
console.log(`${changedPosts}/${totalPosts} posts change; ${totalChars} characters total`);
for (const [k, v] of [...charCounts.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k}: ${v}`);
}
