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
