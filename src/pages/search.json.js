import { getCollection } from 'astro:content';
import { fetchSubstackPosts } from '@/lib/substack';
import { fetchEAForumPosts } from '@/lib/eaforum';
import { getMetaPostSlugs } from '@/lib/meta-posts';

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

  const searchIndex = [
    // Local writing
    ...writing.map(item => ({
      title: item.data.title,
      description: item.data.description || '',
      type: 'writing',
      url: `/writing/${item.slug}`,
      tags: item.data.tags || [],
    })),
    // Substack posts (exclude meta posts and duplicates)
    ...substackPosts
      .filter(p => !metaSlugs.includes(p.slug) && !localWritingSlugs.includes(p.slug))
      .map(item => ({
        title: item.title,
        description: item.description || '',
        type: 'writing',
        url: `/writing/${item.slug}`,
        tags: [],
      })),
    // EA Forum posts (exclude duplicates)
    ...eaForumPosts
      .filter(p => !localWritingSlugs.includes(p.slug) && !substackPosts.some(s => s.slug === p.slug))
      .map(item => ({
        title: item.title,
        description: '',
        type: 'writing',
        url: `/writing/${item.slug}`,
        tags: [],
      })),
    ...music.map(item => ({
      title: item.data.album || item.data.title,
      description: item.data.artist || '',
      type: 'music',
      url: `/music/${item.slug}`,
      tags: item.data.tags || [],
    })),
    ...film.map(item => ({
      title: item.data.title,
      description: item.data.director || '',
      type: 'film',
      url: `/film/${item.slug}`,
      tags: item.data.tags || [],
    })),
    ...books.map(item => ({
      title: item.data.title,
      description: item.data.author || '',
      type: 'books',
      url: `/books/${item.slug}`,
      tags: item.data.tags || [],
    })),
    ...notes.map(item => ({
      title: item.data.title,
      description: item.data.description || '',
      type: 'notes',
      url: `/notes/${item.slug}`,
      tags: item.data.tags || [],
    })),
    ...physics.map(item => ({
      title: item.data.title,
      description: item.data.topic || '',
      type: 'physics',
      url: `/physics/${item.slug}`,
      tags: item.data.tags || [],
    })),
  ];

  return new Response(JSON.stringify(searchIndex), {
    headers: {
      'Content-Type': 'application/json',
    },
  });
}
