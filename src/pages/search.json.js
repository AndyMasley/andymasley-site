import { getCollection } from 'astro:content';
import { fetchSubstackPosts, fetchPostContent } from '@/lib/substack';
import { fetchEAForumPosts, fetchEAForumPostContent } from '@/lib/eaforum';
import { getMetaPostSlugs } from '@/lib/meta-posts';
import { mapWithConcurrency } from '@/lib/map-with-concurrency';
import { getOptionalCollection } from '@/lib/optional-collection';
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
function extractText(html, maxLength = 20000) {
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
function extractMarkdownText(md, maxLength = 20000) {
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
  const writing = await getOptionalCollection('writing', ({ data }) => !data.draft);
  const notes = await getCollection('notes', ({ data }) => !data.draft);
  const physics = await getCollection('physics', ({ data }) => !data.draft);

  // Get local writing slugs to avoid duplicates
  const localWritingSlugSet = new Set(writing.map(w => w.slug));
  const metaSlugSet = new Set(getMetaPostSlugs());

  // Fetch external posts
  const [substackPosts, eaForumPosts] = await Promise.all([
    fetchSubstackPosts(),
    fetchEAForumPosts()
  ]);
  const substackSlugSet = new Set(substackPosts.map(post => post.slug));

  // Build search index with content
  const searchIndex = [];

  // Static pages
  searchIndex.push(
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
    {
      title: 'Visuals',
      description: 'Interactive data visualizations',
      content: 'visuals interactive data visualization carbon footprint factory farmed chickens',
      type: 'page',
      url: '/visuals',
      tags: [],
    },
    {
      title: 'Carbon Footprint Calculator',
      description: 'Interactive carbon footprint calculator with grid change comparisons',
      content: 'carbon footprint calculator emissions CO2 climate change personal cuts grid changes grid energy nuclear solar coal transport diet food electricity EV electric vehicle heat pump vegan vegetarian flights',
      type: 'visual',
      url: '/visuals/carbon-footprint',
      tags: ['climate', 'calculator'],
    },
    {
      title: 'Factory-Farmed Chickens',
      description: 'Visualizing the scale of factory farming in the United States',
      content: extractAstroContent('visuals/factory-farmed-chickens.astro', 10000),
      type: 'visual',
      url: '/visuals/factory-farmed-chickens',
      tags: ['animal welfare'],
    },
    {
      title: 'Lists',
      description: 'Curated lists of favorites and recommendations',
      content: 'lists favorites recommendations products books movies music restaurants',
      type: 'page',
      url: '/lists',
      tags: [],
    },
    {
      title: 'DC Vegan Dining',
      description: 'Vegan restaurant guide for Washington DC',
      content: extractAstroContent('lists/dc-vegan-dining.astro', 10000),
      type: 'list',
      url: '/lists/dc-vegan-dining',
      tags: ['vegan', 'food', 'DC'],
    },
    {
      title: 'DC Vegan Restaurants',
      description: 'Vegan restaurants in Washington DC',
      content: extractAstroContent('lists/dc-vegan-restaurants.astro', 10000),
      type: 'list',
      url: '/lists/dc-vegan-restaurants',
      tags: ['vegan', 'food', 'DC'],
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
  const substackCandidates = substackPosts.filter(
    item => !metaSlugSet.has(item.slug) && !localWritingSlugSet.has(item.slug)
  );
  const substackEntries = await mapWithConcurrency(substackCandidates, async item => {
    const htmlContent = await fetchPostContent(item.slug);
    return {
      title: item.title,
      description: item.description || '',
      headers: extractHeaders(htmlContent),
      content: extractText(htmlContent),
      type: 'article',
      url: `/writing/${item.slug}`,
      tags: [],
    };
  });
  searchIndex.push(...substackEntries);

  // EA Forum posts with cached content
  const eaForumCandidates = eaForumPosts.filter(
    item => !localWritingSlugSet.has(item.slug) && !substackSlugSet.has(item.slug)
  );
  const eaForumEntries = await mapWithConcurrency(eaForumCandidates, async item => {
    const htmlContent = await fetchEAForumPostContent(item.postId);
    return {
      title: item.title,
      description: '',
      headers: extractHeaders(htmlContent),
      content: extractText(htmlContent),
      type: 'article',
      url: `/writing/${item.slug}`,
      tags: [],
    };
  });
  searchIndex.push(...eaForumEntries);

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
