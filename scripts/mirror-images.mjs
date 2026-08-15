// Mirror Substack-hosted images to first-party storage — run LOCALLY on a
// machine whose IP Substack serves (never in CI; Substack blocks CI IPs,
// which is exactly why the committed cache exists). The build then rewrites
// URLs from the committed manifest with zero network.
//
//   node scripts/mirror-images.mjs           # phase one: cover art
//   node scripts/mirror-images.mjs --report  # dry-run: list + size estimate
//
// Phase one mirrors cover art (~86 images, the /writing LCP) re-encoded by
// the CDN itself (w_1200, f_webp) into public/img/substack/ under a stated
// ~15MB repo budget. Inline essay figures (~794 images) are a separate
// go/no-go after measuring re-encoded sizes — git-LFS or R2 if the budget
// can't hold them. After running: commit public/img/substack/ AND
// .cache/**, then push; CI rewrites cover/body URLs from the manifest.

import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(root, 'public', 'img', 'substack');
const MANIFEST = join(OUT_DIR, 'manifest.json');
const BUDGET_BYTES = 15 * 1024 * 1024;
const MAX_EDGE = 1200;
const report = process.argv.includes('--report');

const S3_PREFIX = 'https://substack-post-media.s3.amazonaws.com/public/images/';

function cdnWebp(rawUrl, width) {
  return `https://substackcdn.com/image/fetch/w_${width},c_limit,f_webp,q_auto:good/${encodeURIComponent(rawUrl)}`;
}

function parseUuidAndDims(url) {
  const m = url.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:_(\d+)x(\d+))?/i);
  if (!m) return null;
  return { uuid: m[1].toLowerCase(), width: m[2] ? Number(m[2]) : null, height: m[3] ? Number(m[3]) : null };
}

// Phase one: cover art from the committed posts list.
const postsFile = JSON.parse(readFileSync(join(root, '.cache', 'substack', 'posts.json'), 'utf8'));
const posts = Array.isArray(postsFile) ? postsFile : postsFile.posts;
const covers = new Map();
for (const post of posts) {
  const cover = post.cover_image;
  if (!cover || !cover.includes('substack')) continue;
  const raw = cover.startsWith(S3_PREFIX)
    ? cover
    : decodeURIComponent(cover.match(/\/(https?%3A[^"]+)$/)?.[1] || '') || cover;
  const parsed = parseUuidAndDims(raw);
  if (!parsed) { console.warn(`skip (no uuid): ${cover.slice(0, 90)}`); continue; }
  covers.set(parsed.uuid, { raw, parsed, slug: post.slug });
}

console.log(`${covers.size} unique covers to mirror`);
if (report) {
  for (const [uuid, { slug }] of covers) console.log(`  ${uuid}  ${slug}`);
  process.exit(0);
}

mkdirSync(OUT_DIR, { recursive: true });
const manifest = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf8')) : {};

let downloaded = 0, skipped = 0, failed = 0, totalBytes = 0;
for (const [uuid, { raw, parsed }] of covers) {
  const file = `${uuid}.webp`;
  const outPath = join(OUT_DIR, file);
  if (manifest[uuid] && existsSync(outPath)) {
    skipped++;
    totalBytes += statSync(outPath).size;
    continue;
  }
  const scale = parsed.width ? Math.min(1, MAX_EDGE / Math.max(parsed.width, parsed.height)) : 1;
  const w = parsed.width ? Math.round(parsed.width * scale) : MAX_EDGE;
  const h = parsed.height ? Math.round(parsed.height * scale) : 0;
  try {
    const res = await fetch(cdnWebp(raw, Math.min(parsed.width || MAX_EDGE, MAX_EDGE)));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    writeFileSync(outPath, buf);
    manifest[uuid] = { file, width: w, height: h };
    totalBytes += buf.length;
    downloaded++;
    console.log(`  ok ${uuid} (${(buf.length / 1024).toFixed(0)}KB)`);
    await new Promise(r => setTimeout(r, 400)); // be polite
  } catch (e) {
    failed++;
    console.warn(`  FAIL ${uuid}: ${e.message}`);
  }
}

writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');
console.log(`\n${downloaded} downloaded, ${skipped} already mirrored, ${failed} failed`);
console.log(`total mirrored size: ${(totalBytes / 1024 / 1024).toFixed(1)}MB (budget ${(BUDGET_BYTES / 1024 / 1024).toFixed(0)}MB)`);
if (totalBytes > BUDGET_BYTES) {
  console.warn('OVER BUDGET — consider git-LFS or an R2 bucket before committing.');
}
console.log('Next: git add public/img/substack && commit && push.');
