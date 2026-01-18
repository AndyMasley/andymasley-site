import { getCollection } from 'astro:content';
import { fetchSubstackPosts, fetchPostContent } from '@/lib/substack';
import { fetchEAForumPosts, fetchEAForumPostContent } from '@/lib/eaforum';
import { getMetaPostSlugs } from '@/lib/meta-posts';

// Strip HTML and truncate for search
function extractText(html, maxLength = 500) {
  if (!html) return '';
  // Remove HTML tags
  const text = html.replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.slice(0, maxLength);
}

export async function GET() {
  const writing = await getCollection('writing', ({ data }) => !data.draft);
  const music = await getCollection('music', ({ data }) => !data.draft);
  const film = await getCollection('film', ({ data }) => !data.draft);
  const books = await getCollection('books', ({ data }) => !data.draft);
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
      title: 'Now',
      description: 'What I\'m doing now',
      content: 'What Andy is currently working on and focused on',
      type: 'page',
      url: '/now',
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
      content: 'Favorite books movies music albums songs places restaurants quotes TV video games essays papers fiction non-fiction',
      type: 'list',
      url: '/lists/favorite-things',
      tags: [],
    },
    {
      title: 'Product Recommendations',
      description: 'Things I recommend',
      content: 'Product recommendations clothes electronics kitchen items apps hardware desk computer',
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
      title: 'Books',
      description: 'Book reviews and recommendations',
      content: 'Book reviews reading recommendations',
      type: 'page',
      url: '/books',
      tags: [],
    },
    {
      title: 'Film',
      description: 'Film reviews',
      content: 'Film movie reviews cinema',
      type: 'page',
      url: '/film',
      tags: [],
    },
    {
      title: 'Music',
      description: 'Music reviews',
      content: 'Music album reviews',
      type: 'page',
      url: '/music',
      tags: [],
    },
  );

  // Local writing with body content
  for (const item of writing) {
    searchIndex.push({
      title: item.data.title,
      description: item.data.description || '',
      content: item.body ? extractText(item.body) : '',
      type: 'writing',
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
      content: extractText(htmlContent),
      type: 'writing',
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
      content: extractText(htmlContent),
      type: 'writing',
      url: `/writing/${item.slug}`,
      tags: [],
    });
  }

  // Other collections with body content
  for (const item of music) {
    searchIndex.push({
      title: item.data.album || item.data.title,
      description: item.data.artist || '',
      content: item.body ? extractText(item.body) : '',
      type: 'music',
      url: `/music/${item.slug}`,
      tags: item.data.tags || [],
    });
  }

  for (const item of film) {
    searchIndex.push({
      title: item.data.title,
      description: item.data.director || '',
      content: item.body ? extractText(item.body) : '',
      type: 'film',
      url: `/film/${item.slug}`,
      tags: item.data.tags || [],
    });
  }

  for (const item of books) {
    searchIndex.push({
      title: item.data.title,
      description: item.data.author || '',
      content: item.body ? extractText(item.body) : '',
      type: 'books',
      url: `/books/${item.slug}`,
      tags: item.data.tags || [],
    });
  }

  for (const item of notes) {
    searchIndex.push({
      title: item.data.title,
      description: item.data.description || '',
      content: item.body ? extractText(item.body) : '',
      type: 'notes',
      url: `/notes/${item.slug}`,
      tags: item.data.tags || [],
    });
  }

  for (const item of physics) {
    searchIndex.push({
      title: item.data.title,
      description: item.data.topic || '',
      content: item.body ? extractText(item.body) : '',
      type: 'physics',
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
