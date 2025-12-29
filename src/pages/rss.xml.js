import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';

export async function GET(context) {
  const writing = await getCollection('writing', ({ data }) => !data.draft);
  const notes = await getCollection('notes', ({ data }) => !data.draft);
  
  const items = [...writing, ...notes]
    .sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf())
    .slice(0, 50);
  
  return rss({
    title: 'Andy Masley',
    description: 'Essays, notes, and miscellany',
    site: context.site,
    items: items.map(item => {
      const collection = 'body' in item && item.collection === 'writing' ? 'writing' : 'notes';
      return {
        title: item.data.title,
        pubDate: item.data.date,
        description: item.data.description || '',
        link: `/${collection}/${item.slug}/`,
      };
    }),
    customData: `<language>en-us</language>`,
  });
}
