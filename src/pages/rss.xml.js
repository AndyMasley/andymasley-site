import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';

export async function GET(context) {
  const writing = await getCollection('writing', ({ data }) => !data.draft);

  const items = writing
    .sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf())
    .slice(0, 50);

  return rss({
    title: 'Andy Masley',
    description: 'Blog posts and essays',
    site: context.site,
    items: items.map(item => ({
      title: item.data.title,
      pubDate: item.data.date,
      description: item.data.description || '',
      link: `/writing/${item.slug}/`,
    })),
    customData: `<language>en-us</language>`,
  });
}
