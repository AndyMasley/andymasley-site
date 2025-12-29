import { getCollection } from 'astro:content';

export async function GET() {
  const writing = await getCollection('writing', ({ data }) => !data.draft);
  const music = await getCollection('music', ({ data }) => !data.draft);
  const film = await getCollection('film', ({ data }) => !data.draft);
  const books = await getCollection('books', ({ data }) => !data.draft);
  const notes = await getCollection('notes', ({ data }) => !data.draft);
  const physics = await getCollection('physics', ({ data }) => !data.draft);

  const searchIndex = [
    ...writing.map(item => ({
      title: item.data.title,
      description: item.data.description || '',
      type: 'writing',
      url: `/writing/${item.slug}`,
      tags: item.data.tags,
    })),
    ...music.map(item => ({
      title: item.data.album || item.data.title,
      description: item.data.artist || '',
      type: 'music',
      url: `/music/${item.slug}`,
      tags: item.data.tags,
    })),
    ...film.map(item => ({
      title: item.data.title,
      description: item.data.director || '',
      type: 'film',
      url: `/film/${item.slug}`,
      tags: item.data.tags,
    })),
    ...books.map(item => ({
      title: item.data.title,
      description: item.data.author || '',
      type: 'books',
      url: `/books/${item.slug}`,
      tags: item.data.tags,
    })),
    ...notes.map(item => ({
      title: item.data.title,
      description: item.data.description || '',
      type: 'notes',
      url: `/notes/${item.slug}`,
      tags: item.data.tags,
    })),
    ...physics.map(item => ({
      title: item.data.title,
      description: item.data.topic || '',
      type: 'physics',
      url: `/physics/${item.slug}`,
      tags: item.data.tags,
    })),
  ];

  return new Response(JSON.stringify(searchIndex), {
    headers: {
      'Content-Type': 'application/json',
    },
  });
}
