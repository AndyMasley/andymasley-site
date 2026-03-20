import rss from '@astrojs/rss';
import { fetchSubstackPosts } from '@/lib/substack';
import { fetchEAForumPosts } from '@/lib/eaforum';
import { getMetaPostSlugs } from '@/lib/meta-posts';
import { getOptionalCollection } from '@/lib/optional-collection';

export async function GET(context) {
  const [localWriting, substackPostsRaw, eaForumPostsRaw] = await Promise.all([
    getOptionalCollection('writing', ({ data }) => !data.draft),
    fetchSubstackPosts(),
    fetchEAForumPosts()
  ]);
  const metaSlugs = new Set(getMetaPostSlugs());
  const localSlugs = new Set(localWriting.map(item => item.slug));

  const substackPosts = substackPostsRaw
    .filter(post => !metaSlugs.has(post.slug) && !localSlugs.has(post.slug));
  const substackSlugs = new Set(substackPosts.map(post => post.slug));

  const eaForumPosts = eaForumPostsRaw
    .filter(post => !localSlugs.has(post.slug) && !substackSlugs.has(post.slug));

  const items = [
    ...localWriting.map(item => ({
      title: item.data.title,
      pubDate: item.data.date,
      description: item.data.description || '',
      link: `/writing/${item.slug}/`,
    })),
    ...substackPosts.map(post => ({
      title: post.title,
      pubDate: post.date,
      description: post.description || '',
      link: `/writing/${post.slug}/`,
    })),
    ...eaForumPosts.map(post => ({
      title: post.title,
      pubDate: post.date,
      description: '',
      link: `/writing/${post.slug}/`,
    })),
  ]
    .sort((a, b) => b.pubDate.valueOf() - a.pubDate.valueOf())
    .slice(0, 50);

  return rss({
    title: 'Andy Masley',
    description: 'Blog posts and essays',
    site: context.site,
    items,
    customData: `<language>en-us</language>`,
  });
}
