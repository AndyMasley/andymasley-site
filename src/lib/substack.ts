// Fetches posts from Substack API
// Uses the undocumented /api/v1/posts endpoint which returns all posts with section IDs

export interface SubstackPost {
  title: string;
  slug: string;
  date: Date;
  description: string;
  url: string;
  category: string;
}

// Category definitions with editable overviews
export interface CategoryConfig {
  name: string;
  slug: string;
  overview: string;
  sectionIds: (number | null)[]; // Substack section IDs that map to this category
}

// Map Substack section IDs to categories
// To find section IDs: curl "https://andymasley.substack.com/api/v1/posts?limit=50" | jq '.[].section_id'
export const categoryConfigs: CategoryConfig[] = [
  {
    name: "AI & the Environment",
    slug: "ai-environment",
    overview: "Analysis of AI's environmental impact—water use, energy consumption, and data centers. I challenge misleading narratives with data and primary sources.",
    sectionIds: [234003]
  },
  {
    name: "Artificial Intelligence",
    slug: "artificial-intelligence",
    overview: "Broader thinking about AI capabilities, policy, governance, and societal implications beyond environmental concerns.",
    sectionIds: [207379]
  },
  {
    name: "Animal Welfare",
    slug: "animal-welfare",
    overview: "Essays on animal welfare, factory farming, and the moral consideration we owe to non-human animals.",
    sectionIds: [220462]
  },
  {
    name: "Charity",
    slug: "charity",
    overview: "Posts on charitable giving and effective altruism.",
    sectionIds: [260435]
  },
  {
    name: "Politics",
    slug: "politics",
    overview: "Political analysis, policy critiques, and commentary on current events.",
    sectionIds: [260436]
  },
  {
    name: "Recs & Advice",
    slug: "recs-advice",
    overview: "Recommendations, life advice, and miscellaneous thoughts.",
    sectionIds: [136593]
  },
  {
    name: "Misc",
    slug: "misc",
    overview: "Everything else—random thoughts, experiments, and posts that defy categorization.",
    sectionIds: [268168, null] // null = uncategorized posts
  }
];

function getSectionCategory(sectionId: number | null): string {
  for (const config of categoryConfigs) {
    if (config.sectionIds.includes(sectionId)) {
      return config.name;
    }
  }
  return "Misc";
}

interface SubstackAPIPost {
  title: string;
  slug: string;
  post_date: string;
  description: string | null;
  subtitle: string | null;
  canonical_url: string;
  section_id: number | null;
  is_published: boolean;
  type: string;
}

export async function fetchSubstackPosts(): Promise<SubstackPost[]> {
  const BASE_URL = 'https://andymasley.substack.com/api/v1/posts';
  const allPosts: SubstackPost[] = [];

  try {
    // Fetch all posts with pagination (API limit is 50 per request)
    let offset = 0;
    const limit = 50;
    let hasMore = true;

    while (hasMore) {
      const response = await fetch(`${BASE_URL}?offset=${offset}&limit=${limit}`);
      const posts: SubstackAPIPost[] = await response.json();

      if (!posts || posts.length === 0) {
        hasMore = false;
        break;
      }

      for (const post of posts) {
        // Skip non-newsletter posts (like hub pages)
        if (post.type !== 'newsletter' || !post.is_published) continue;

        // Skip special pages (links, hub pages, etc.)
        if (['links', 'ai-and-the-environment'].includes(post.slug)) continue;

        allPosts.push({
          title: post.title,
          slug: post.slug,
          date: new Date(post.post_date),
          description: post.subtitle || post.description || '',
          url: post.canonical_url,
          category: getSectionCategory(post.section_id),
        });
      }

      offset += limit;
      if (posts.length < limit) {
        hasMore = false;
      }
    }

    // Sort by date descending
    allPosts.sort((a, b) => b.date.getTime() - a.date.getTime());

    return allPosts;
  } catch (error) {
    console.error('Failed to fetch Substack posts:', error);
    return [];
  }
}

export function groupByCategory(posts: SubstackPost[]): Record<string, SubstackPost[]> {
  const grouped: Record<string, SubstackPost[]> = {};

  // Assign posts to categories
  for (const post of posts) {
    if (!grouped[post.category]) {
      grouped[post.category] = [];
    }
    grouped[post.category].push(post);
  }

  // Return in the order defined by categoryConfigs
  const sorted: Record<string, SubstackPost[]> = {};
  for (const config of categoryConfigs) {
    if (grouped[config.name] && grouped[config.name].length > 0) {
      sorted[config.name] = grouped[config.name];
    }
  }

  // Add any remaining categories not in config
  for (const cat of Object.keys(grouped)) {
    if (!sorted[cat] && grouped[cat].length > 0) {
      sorted[cat] = grouped[cat];
    }
  }

  return sorted;
}

export function getCategoryConfig(categoryName: string): CategoryConfig | undefined {
  return categoryConfigs.find(c => c.name === categoryName);
}

export function getCategoryPostCount(posts: SubstackPost[], categoryName: string): number {
  return posts.filter(p => p.category === categoryName).length;
}

// Fetch full HTML content for a specific post via RSS
export async function fetchPostContent(slug: string): Promise<string> {
  const RSS_URL = 'https://andymasley.substack.com/feed';

  try {
    const response = await fetch(RSS_URL);
    const xml = await response.text();

    // Parse RSS to find the post by slug
    // Look for the item with matching link
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;

    while ((match = itemRegex.exec(xml)) !== null) {
      const item = match[1];
      const linkMatch = item.match(/<link>([^<]+)<\/link>/);

      if (linkMatch && linkMatch[1].includes(`/p/${slug}`)) {
        // Extract content:encoded
        const contentMatch = item.match(/<content:encoded><!\[CDATA\[([\s\S]*?)\]\]><\/content:encoded>/);
        if (contentMatch) {
          return contentMatch[1];
        }
      }
    }

    return '';
  } catch (error) {
    console.error(`Failed to fetch content for ${slug}:`, error);
    return '';
  }
}
