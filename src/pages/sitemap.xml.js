import { getCollection } from 'astro:content';
import { fetchSubstackPosts } from '@/lib/substack';
import { fetchEAForumPosts } from '@/lib/eaforum';
import { getMetaPostSlugs } from '@/lib/meta-posts';
import { getOptionalCollection } from '@/lib/optional-collection';
import { corrections } from '@/data/corrections';

const SITE_URL = 'https://andymasley.com';

// Static routes come from the filesystem, so the sitemap can never claim a
// page that doesn't exist (the old hand-kept list submitted a 404 for two
// months). Excluded on purpose:
//   /hexagon, /room — easter eggs; they earn discovery by play
//   the two tombstones — noindex withdrawal notices, for people not crawlers
//   /og/* — image endpoints, not pages
const EXCLUDED_ROUTES = new Set([
  '/hexagon',
  '/room',
  '/404',
  '/writing/i-cant-find-any-instances-of-data',
  '/writing/stories-of-ai-turning-users-delusional',
  // Redirected in _redirects — a URL that 301s doesn't belong in the map.
  '/visuals/carbon-footprint-v1',
  // Embed-only frame for other sites; not a destination page.
  '/visuals/ai-prompt-footprint/embed',
]);

function staticRoutesFromFilesystem() {
  const pages = import.meta.glob('./**/*.astro', { eager: false });
  const routes = [];
  for (const file of Object.keys(pages)) {
    // './lists/index.astro' → '/lists'; './contact.astro' → '/contact'
    let route = file.replace(/^\.\//, '/').replace(/\.astro$/, '');
    if (route.endsWith('/index')) route = route.slice(0, -'/index'.length) || '/';
    // Dynamic routes are added from data below, not from the filesystem.
    if (route.includes('[')) continue;
    if (route.startsWith('/og/')) continue;
    if (EXCLUDED_ROUTES.has(route)) continue;
    routes.push(route);
  }
  return routes;
}

function toAbsoluteUrl(path) {
  return new URL(path, SITE_URL).href;
}

function xmlEscape(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function lastmodFor(slug, date) {
  // A post's lastmod is its publication date unless the corrections ledger
  // records a later edit.
  const entries = corrections[slug] || [];
  const newest = entries.map(e => e.date).sort().at(-1);
  const published = date && date.getTime() !== 0 ? date.toISOString().slice(0, 10) : null;
  if (newest && (!published || newest > published)) return newest;
  return published;
}

export async function GET() {
  const [writing, notes, physics, substackPostsRaw, eaForumPostsRaw] = await Promise.all([
    getOptionalCollection('writing', ({ data }) => !data.draft),
    getCollection('notes', ({ data }) => !data.draft),
    getCollection('physics', ({ data }) => !data.draft),
    fetchSubstackPosts(),
    fetchEAForumPosts(),
  ]);

  const metaSlugs = new Set(getMetaPostSlugs());
  const localWritingSlugs = new Set(writing.map((item) => item.slug));
  const substackPosts = substackPostsRaw.filter(
    (post) => !localWritingSlugs.has(post.slug),
  );
  const substackSlugs = new Set(substackPosts.map((post) => post.slug));
  const eaForumPosts = eaForumPostsRaw.filter(
    (post) => !localWritingSlugs.has(post.slug) && !substackSlugs.has(post.slug),
  );

  const entries = new Map();
  const add = (path, lastmod = null) => {
    if (!entries.has(path)) entries.set(path, lastmod);
  };

  for (const route of staticRoutesFromFilesystem()) add(route);

  // The meta/hub posts render as pages too (date-less); include without lastmod.
  for (const item of writing) add(`/writing/${item.slug}`, lastmodFor(item.slug, item.data.date));
  for (const post of substackPosts) {
    add(`/writing/${post.slug}`, metaSlugs.has(post.slug) ? null : lastmodFor(post.slug, post.date));
  }
  for (const post of eaForumPosts) add(`/writing/${post.slug}`, lastmodFor(post.slug, post.date));
  for (const item of notes) add(`/notes/${item.slug}`, lastmodFor(item.slug, item.data.date));
  for (const item of physics) add(`/physics/${item.slug}`);

  const body = Array.from(entries.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([path, lastmod]) => {
      const loc = `<loc>${xmlEscape(toAbsoluteUrl(path))}</loc>`;
      const mod = lastmod ? `<lastmod>${lastmod}</lastmod>` : '';
      return `  <url>${loc}${mod}</url>`;
    })
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    `${body}\n` +
    `</urlset>\n`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
    },
  });
}
