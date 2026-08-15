import { fetchSubstackPosts, fetchPostContent } from '@/lib/substack';
import { fetchEAForumPosts, fetchEAForumPostContent } from '@/lib/eaforum';
import { getMetaPostSlugs } from '@/lib/meta-posts';
import { mapWithConcurrency } from '@/lib/map-with-concurrency';

// Build-time inversion of the internal link graph: for each essay, which
// other essays cite it. Both committed caches participate — Substack and
// EA Forum — so cross-source citations resolve to their local
// /writing/{slug} pages instead of silently dropping. Meta/hub posts are
// excluded as citers: a table of contents is not a citation, and without
// that exclusion every essay in the flagship series would render
// "Cited in: AI and the environment".
//
// The consumer caps the rendered list (five, most recent first) and omits
// it when empty; this module just reports the full graph.

export interface Citer {
  slug: string;
  title: string;
  date: Date;
}

// Absolute link shapes that resolve to a local /writing/{slug} page.
// Slug captures stop at quote, hash, question mark, and slash so anchors,
// query strings, and comment permalinks register under the bare slug —
// same convention as parseSubcategoriesFromHTML.
const SUBSTACK_LINK =
  /https:\/\/(?:(?:www\.)?andymasley\.substack\.com|blog\.andymasley\.com|open\.substack\.com\/pub\/andymasley)\/p\/([^"#?\/\s]+)/g;
const SITE_LINK = /https:\/\/(?:www\.)?andymasley\.com\/writing\/([^"#?\/\s]+)/g;
const EAFORUM_LINK =
  /https:\/\/forum\.effectivealtruism\.org\/posts\/([A-Za-z0-9]+)(?:\/[^"#?\s]*)?/g;

let cachedGraph: Map<string, Citer[]> | null = null;

export async function getCitedByGraph(): Promise<Map<string, Citer[]>> {
  if (cachedGraph) return cachedGraph;

  const [substackPosts, eaForumPosts] = await Promise.all([
    fetchSubstackPosts(),
    fetchEAForumPosts(),
  ]);

  const metaSlugs = new Set(getMetaPostSlugs());
  const knownSlugs = new Set<string>([
    ...substackPosts.map(p => p.slug),
    ...eaForumPosts.map(p => p.slug),
  ]);
  const eaForumIdToSlug = new Map(eaForumPosts.map(p => [p.postId, p.slug]));

  interface Source {
    slug: string;
    title: string;
    date: Date;
    html: () => Promise<string>;
  }

  const sources: Source[] = [
    ...substackPosts
      .filter(p => !metaSlugs.has(p.slug))
      .map(p => ({
        slug: p.slug,
        title: p.title,
        date: p.date,
        html: () => fetchPostContent(p.slug),
      })),
    ...eaForumPosts
      .filter(p => !substackPosts.some(s => s.slug === p.slug))
      .map(p => ({
        slug: p.slug,
        title: p.title,
        date: p.date,
        html: () => fetchEAForumPostContent(p.postId),
      })),
  ];

  const graph = new Map<string, Citer[]>();

  const results = await mapWithConcurrency(sources, async source => {
    let html = '';
    try {
      html = await source.html();
    } catch {
      return { source, targets: [] as string[] };
    }
    const targets = new Set<string>();
    for (const re of [SUBSTACK_LINK, SITE_LINK]) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(html)) !== null) {
        const slug = m[1];
        if (slug !== source.slug && knownSlugs.has(slug)) targets.add(slug);
      }
    }
    EAFORUM_LINK.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = EAFORUM_LINK.exec(html)) !== null) {
      const slug = eaForumIdToSlug.get(m[1]);
      if (slug && slug !== source.slug) targets.add(slug);
    }
    return { source, targets: [...targets] };
  });

  for (const { source, targets } of results) {
    for (const target of targets) {
      if (!graph.has(target)) graph.set(target, []);
      graph.get(target)!.push({ slug: source.slug, title: source.title, date: source.date });
    }
  }

  for (const citers of graph.values()) {
    citers.sort((a, b) => b.date.getTime() - a.date.getTime());
  }

  cachedGraph = graph;
  return graph;
}

/** Citers of one slug, most recent first (uncapped — caller caps). */
export async function getCitedBy(slug: string): Promise<Citer[]> {
  const graph = await getCitedByGraph();
  return graph.get(slug) || [];
}
