// Flat list of every writing post the site renders, in the same source +
// dedup order as src/pages/writing/[slug].astro, reduced to the fields the OG
// generator needs. Keep the ordering in sync with that page so /og/<slug>.png
// exists for exactly the slugs that have post pages.
import { getOptionalCollection } from '@/lib/optional-collection';
import { fetchSubstackPosts } from '@/lib/substack';
import { fetchEAForumPosts } from '@/lib/eaforum';
import { metaPosts } from '@/lib/meta-posts';

export interface PostMeta {
  slug: string;
  title: string;
  date: Date;
}

export async function getAllWritingPostMetas(): Promise<PostMeta[]> {
  const [localPosts, substackPosts, eaForumPosts] = await Promise.all([
    getOptionalCollection('writing'),
    fetchSubstackPosts(),
    fetchEAForumPosts(),
  ]);

  const seen = new Set<string>();
  const out: PostMeta[] = [];
  const add = (slug: string, title: string, date: Date) => {
    if (seen.has(slug)) return;
    seen.add(slug);
    out.push({ slug, title, date });
  };

  for (const p of localPosts) add(p.slug, p.data.title, p.data.date);
  for (const p of substackPosts) add(p.slug, p.title, p.date);
  for (const p of metaPosts) add(p.slug, p.title, new Date(0));
  for (const p of eaForumPosts) add(p.slug, p.title, p.date);

  return out;
}
