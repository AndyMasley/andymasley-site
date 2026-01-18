import { getCollection } from 'astro:content';
import { fetchSubstackPosts, fetchPostContent } from '@/lib/substack';
import { fetchEAForumPosts, fetchEAForumPostContent } from '@/lib/eaforum';
import { getMetaPostSlugs } from '@/lib/meta-posts';
import fs from 'node:fs';
import path from 'node:path';

// Extract headers from HTML
function extractHeaders(html) {
  if (!html) return '';
  const headerMatches = html.match(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi) || [];
  return headerMatches
    .map(h => h.replace(/<[^>]*>/g, '').trim())
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Strip HTML and truncate for search (excluding headers)
function extractText(html, maxLength = 500) {
  if (!html) return '';
  // Remove headers first, then other HTML tags
  const text = html
    .replace(/<h[1-6][^>]*>[\s\S]*?<\/h[1-6]>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.slice(0, maxLength);
}

// Extract headers from markdown
function extractMarkdownHeaders(md) {
  if (!md) return '';
  const lines = md.split('\n');
  const headers = lines
    .filter(line => /^#{1,6}\s+/.test(line))
    .map(line => line.replace(/^#{1,6}\s+/, '').trim());
  return headers.join(' ');
}

// Extract text from markdown (excluding headers)
function extractMarkdownText(md, maxLength = 500) {
  if (!md) return '';
  const text = md
    .replace(/^#{1,6}\s+.*$/gm, '') // Remove headers
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Links to text
    .replace(/[*_~`]/g, '') // Remove formatting
    .replace(/\s+/g, ' ')
    .trim();
  return text.slice(0, maxLength);
}

// Extract text content from an Astro file (for static pages)
function extractAstroContent(filePath, maxLength = 2000) {
  try {
    const fullPath = path.join(process.cwd(), 'src/pages', filePath);
    const content = fs.readFileSync(fullPath, 'utf-8');
    // Extract just the HTML template part (after the frontmatter ---)
    const templateMatch = content.match(/---[\s\S]*?---\s*([\s\S]*)/);
    if (!templateMatch) return '';
    const template = templateMatch[1];
    // Remove Astro/JSX expressions and extract text
    const text = template
      .replace(/<script[\s\S]*?<\/script>/gi, '') // Remove scripts
      .replace(/<style[\s\S]*?<\/style>/gi, '') // Remove styles
      .replace(/\{[\s\S]*?\}/g, ' ') // Remove JSX expressions
      .replace(/<[^>]*>/g, ' ') // Remove HTML tags
      .replace(/\s+/g, ' ')
      .trim();
    return text.slice(0, maxLength);
  } catch (e) {
    return '';
  }
}

export async function GET() {
  const writing = await getCollection('writing', ({ data }) => !data.draft);
  const notes = await getCollection('notes', ({ data }) => !data.draft);
  const physics = await getCollection('physics', ({ data }) => !data.draft);

  // Get local writing slugs to avoid duplicates
  const localWritingSlugs = writing.map(w => w.slug);
  const metaSlugs = getMetaPostSlugs();

  // Fetch external posts
  const substackPosts = await fetchSubstackPosts();
  const eaForumPosts = await fetchEAForumPosts();

  // Build search index with content
  const searchIndex = [];

  // Static pages
  searchIndex.push(
    {
      title: 'About',
      description: 'About Andy Masley',
      content: 'I run Effective Altruism DC, funded by the Centre for Effective Altruism. Before this I taught high school physics for 7 years. I made a full animated video lecture series for the IB SL curriculum.',
      type: 'page',
      url: '/about',
      tags: [],
    },
    {
      title: 'Contact',
      description: 'Get in touch',
      content: 'Contact Andy Masley email',
      type: 'page',
      url: '/contact',
      tags: [],
    },
    {
      title: 'Appearances',
      description: 'Podcasts and other appearances',
      content: 'Podcasts Conspicuous Cognition Chain of Thought Hard Fork The Cognitive Revolution AI environment',
      type: 'page',
      url: '/appearances',
      tags: [],
    },
    {
      title: 'Favorite Things',
      description: 'Books, movies, music, and more',
      content: extractAstroContent('lists/favorite-things.astro', 10000),
      type: 'list',
      url: '/lists/favorite-things',
      tags: [],
    },
    {
      title: 'Product Recommendations',
      description: 'Things I recommend',
      content: extractAstroContent('lists/product-recommendations.astro', 10000),
      type: 'list',
      url: '/lists/product-recommendations',
      tags: [],
    },
    {
      title: 'IB Physics Videos',
      description: 'Video lecture series for IB Physics SL',
      content: 'IB Physics SL curriculum video lectures thermal concepts measurements uncertainties mechanics waves electricity magnetism',
      type: 'page',
      url: '/physics',
      tags: [],
    },
    {
      title: 'Writing',
      description: 'Blog posts and essays',
      content: 'Blog writing essays AI environment data centers animal welfare effective altruism philosophy politics',
      type: 'page',
      url: '/writing',
      tags: [],
    },
  );

  // Local writing with body content
  for (const item of writing) {
    searchIndex.push({
      title: item.data.title,
      description: item.data.description || '',
      headers: item.body ? extractMarkdownHeaders(item.body) : '',
      content: item.body ? extractMarkdownText(item.body) : '',
      type: 'article',
      url: `/writing/${item.slug}`,
      tags: item.data.tags || [],
    });
  }

  // Substack posts with cached content
  for (const item of substackPosts) {
    if (metaSlugs.includes(item.slug) || localWritingSlugs.includes(item.slug)) continue;

    const htmlContent = await fetchPostContent(item.slug);
    searchIndex.push({
      title: item.title,
      description: item.description || '',
      headers: extractHeaders(htmlContent),
      content: extractText(htmlContent),
      type: 'article',
      url: `/writing/${item.slug}`,
      tags: [],
    });
  }

  // EA Forum posts with cached content
  for (const item of eaForumPosts) {
    if (localWritingSlugs.includes(item.slug) || substackPosts.some(s => s.slug === item.slug)) continue;

    const htmlContent = await fetchEAForumPostContent(item.postId);
    searchIndex.push({
      title: item.title,
      description: '',
      headers: extractHeaders(htmlContent),
      content: extractText(htmlContent),
      type: 'article',
      url: `/writing/${item.slug}`,
      tags: [],
    });
  }

  // Other collections with body content
  for (const item of notes) {
    searchIndex.push({
      title: item.data.title,
      description: item.data.description || '',
      headers: item.body ? extractMarkdownHeaders(item.body) : '',
      content: item.body ? extractMarkdownText(item.body) : '',
      type: 'article',
      url: `/notes/${item.slug}`,
      tags: item.data.tags || [],
    });
  }

  for (const item of physics) {
    searchIndex.push({
      title: item.data.title,
      description: item.data.topic || '',
      headers: item.body ? extractMarkdownHeaders(item.body) : '',
      content: item.body ? extractMarkdownText(item.body) : '',
      type: 'article',
      url: `/physics/${item.slug}`,
      tags: item.data.tags || [],
    });
  }

  return new Response(JSON.stringify(searchIndex), {
    headers: {
      'Content-Type': 'application/json',
    },
  });
}
