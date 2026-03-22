import { getCollection } from 'astro:content';
import { fetchSubstackPosts } from '@/lib/substack';
import { fetchEAForumPosts } from '@/lib/eaforum';
import { getMetaPostSlugs } from '@/lib/meta-posts';
import { getOptionalCollection } from '@/lib/optional-collection';

const SITE_URL = 'https://andymasley.com';

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
    (post) => !metaSlugs.has(post.slug) && !localWritingSlugs.has(post.slug),
  );
  const substackSlugs = new Set(substackPosts.map((post) => post.slug));
  const eaForumPosts = eaForumPostsRaw.filter(
    (post) => !localWritingSlugs.has(post.slug) && !substackSlugs.has(post.slug),
  );

  const urls = new Set([
    '/',
    '/appearances',
    '/contact',
    '/hexagon',
    '/lists',
    '/lists/ai-music',
    '/lists/dc-vegan-dining',
    '/lists/dc-vegan-restaurants',
    '/lists/favorite-things',
    '/lists/product-recommendations',
    '/notes',
    '/physics',
    '/room',
    '/tags',
    '/visuals',
    '/visuals/carbon-boundary-crosswalk',
    '/visuals/carbon-footprint',
    '/visuals/factory-farmed-chickens',
    '/visuals/national-carbon-footprint',
    '/visuals/water',
    '/writing',
    ...writing.map((item) => `/writing/${item.slug}`),
    ...substackPosts.map((post) => `/writing/${post.slug}`),
    ...eaForumPosts.map((post) => `/writing/${post.slug}`),
    ...notes.map((item) => `/notes/${item.slug}`),
    ...physics.map((item) => `/physics/${item.slug}`),
  ]);

  const body = Array.from(urls)
    .sort((a, b) => a.localeCompare(b))
    .map((path) => `  <url><loc>${xmlEscape(toAbsoluteUrl(path))}</loc></url>`)
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
