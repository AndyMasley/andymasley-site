import rss from '@astrojs/rss';
import { fetchSubstackPosts, fetchPostContent, processPostContent } from '@/lib/substack';
import { fetchEAForumPosts, fetchEAForumPostContent, processEAForumContent } from '@/lib/eaforum';
import { getMetaPostSlugs } from '@/lib/meta-posts';
import { getOptionalCollection } from '@/lib/optional-collection';

// Prepare processed post HTML for the feed: drop the section-anchor (§) markers
// and rewrite root-relative URLs to absolute so links and images resolve in readers.
function finalizeContent(html, origin) {
  return html
    .replace(/<a class="h-anchor"[\s\S]*?<\/a>/gi, '')
    .replace(/(href|src)="\/(?!\/)/g, `$1="${origin}/`);
}

export async function GET(context) {
  const origin = context.site.origin;

  const [localWriting, substackPostsRaw, eaForumPostsRaw] = await Promise.all([
    getOptionalCollection('writing', ({ data }) => !data.draft),
    fetchSubstackPosts(),
    fetchEAForumPosts(),
  ]);
  const metaSlugs = new Set(getMetaPostSlugs());
  const localSlugs = new Set(localWriting.map((item) => item.slug));

  const substackPosts = substackPostsRaw.filter(
    (post) => !metaSlugs.has(post.slug) && !localSlugs.has(post.slug)
  );
  const substackSlugs = new Set(substackPosts.map((post) => post.slug));

  const eaForumPosts = eaForumPostsRaw.filter(
    (post) => !localSlugs.has(post.slug) && !substackSlugs.has(post.slug)
  );

  const metas = [
    ...localWriting.map((item) => ({
      source: 'local',
      slug: item.slug,
      title: item.data.title,
      pubDate: item.data.date,
      description: item.data.description || '',
    })),
    ...substackPosts.map((post) => ({
      source: 'substack',
      slug: post.slug,
      title: post.title,
      pubDate: post.date,
      description: post.description || '',
    })),
    ...eaForumPosts.map((post) => ({
      source: 'eaforum',
      slug: post.slug,
      postId: post.postId,
      title: post.title,
      pubDate: post.date,
      description: '',
    })),
  ]
    .sort((a, b) => b.pubDate.valueOf() - a.pubDate.valueOf())
    .slice(0, 50);

  // Full post content (content:encoded). Sidenotes are skipped so footnotes
  // aren't duplicated. Falls back to the short description on any error.
  const items = await Promise.all(
    metas.map(async (m) => {
      let content = m.description;
      try {
        if (m.source === 'substack') {
          content = finalizeContent(
            processPostContent(await fetchPostContent(m.slug), m.slug, { sidenotes: false }),
            origin
          );
        } else if (m.source === 'eaforum') {
          content = finalizeContent(
            processEAForumContent(await fetchEAForumPostContent(m.postId), m.slug),
            origin
          );
        }
      } catch {
        // keep the description fallback
      }
      return {
        title: m.title,
        pubDate: m.pubDate,
        description: m.description,
        link: `/writing/${m.slug}/`,
        content,
      };
    })
  );

  return rss({
    title: 'Andy Masley',
    description: 'Blog posts and essays',
    site: context.site,
    items,
    xmlns: { atom: 'http://www.w3.org/2005/Atom' },
    customData:
      `<language>en-us</language>` +
      `<atom:link href="${new URL('rss.xml', context.site).href}" rel="self" type="application/rss+xml"/>`,
  });
}
