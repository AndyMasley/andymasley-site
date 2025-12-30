// Fetches posts from Substack API
// Uses the undocumented /api/v1/posts endpoint which returns all posts with section IDs

export interface SubstackPost {
  title: string;
  slug: string;
  date: Date;
  description: string;
  url: string;
  category: string;
  source: 'substack';
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
          source: 'substack',
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

// Fetch full HTML content for a specific post via Substack API
export async function fetchPostContent(slug: string): Promise<string> {
  const API_URL = `https://andymasley.substack.com/api/v1/posts/${slug}`;

  try {
    const response = await fetch(API_URL);
    if (!response.ok) {
      console.error(`Failed to fetch post ${slug}: ${response.status}`);
      return '';
    }

    const post = await response.json();

    // The API returns body_html with the full content
    if (post.body_html) {
      return post.body_html;
    }

    return '';
  } catch (error) {
    console.error(`Failed to fetch content for ${slug}:`, error);
    return '';
  }
}

// Subcategory extracted from meta post
export interface Subcategory {
  name: string;
  slug: string;
  postSlugs: string[];
}

// Parse subcategories from meta post HTML
// Expects structure: <h3>Category Name</h3> followed by <ul> with post links
export function parseSubcategoriesFromHTML(html: string): Subcategory[] {
  const subcategories: Subcategory[] = [];

  // Match h3 headers followed by ul lists
  // Regex to find h3 tags and capture their content
  const h3Regex = /<h3[^>]*>([^<]+)<\/h3>/gi;
  const linkRegex = /href="https:\/\/andymasley\.substack\.com\/p\/([^"]+)"/g;

  // Split by h3 tags to process each section
  const sections = html.split(/<h3[^>]*>/i);

  for (let i = 1; i < sections.length; i++) {
    const section = sections[i];

    // Extract category name (text before closing </h3>)
    const nameMatch = section.match(/^([^<]+)<\/h3>/i);
    if (!nameMatch) continue;

    const name = nameMatch[1].trim();

    // Skip certain sections that aren't real categories
    if (['Start here', 'Misc', 'Podcast appearances'].includes(name)) continue;

    // Find all post slugs in this section (until next h3 or end)
    const postSlugs: string[] = [];
    let match;
    const sectionContent = section.substring(nameMatch[0].length);

    // Reset regex
    linkRegex.lastIndex = 0;
    while ((match = linkRegex.exec(sectionContent)) !== null) {
      const slug = match[1];
      // Don't include the meta post itself or duplicates
      if (slug !== 'ai-and-the-environment' && !postSlugs.includes(slug)) {
        postSlugs.push(slug);
      }
    }

    if (postSlugs.length > 0) {
      subcategories.push({
        name,
        slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, ''),
        postSlugs
      });
    }
  }

  return subcategories;
}

// Fix internal anchor links in Substack HTML
// Converts all internal links to the appropriate format:
// - Same-post anchors become href="#heading"
// - Other Substack posts become href="/writing/slug"
// - Other Substack posts with anchors become href="/writing/slug#heading"
export function fixAnchorLinks(html: string, currentSlug: string): string {
  let fixed = html;

  // Normalize the current slug for comparison (handle URL encoding)
  const normalizedSlug = decodeURIComponent(currentSlug).toLowerCase();

  // Helper to check if a slug matches the current post
  const isSamePost = (slug: string): boolean => {
    const normalized = decodeURIComponent(slug).toLowerCase();
    return normalized === normalizedSlug;
  };

  // 1. Handle full URLs to same post with anchor → local anchor
  // href="https://andymasley.substack.com/p/current-post#heading" → href="#heading"
  fixed = fixed.replace(
    /href="https:\/\/andymasley\.substack\.com\/p\/([^"#?]+)#([^"]+)"/gi,
    (match, slug, anchor) => {
      if (isSamePost(slug)) {
        return `href="#${anchor}"`;
      }
      // Different post - convert to local URL with anchor
      return `href="/writing/${slug}#${anchor}"`;
    }
  );

  // 2. Handle full URLs to same post without anchor → stay on page (remove link or make #top)
  // This handles links like "Read more" that point to the same post
  fixed = fixed.replace(
    /href="https:\/\/andymasley\.substack\.com\/p\/([^"#?]+)"/gi,
    (match, slug) => {
      if (isSamePost(slug)) {
        return 'href="#"';
      }
      // Different post - convert to local URL
      return `href="/writing/${slug}"`;
    }
  );

  // 3. Handle relative URLs: /p/slug#anchor
  fixed = fixed.replace(
    /href="\/p\/([^"#?]+)#([^"]+)"/gi,
    (match, slug, anchor) => {
      if (isSamePost(slug)) {
        return `href="#${anchor}"`;
      }
      return `href="/writing/${slug}#${anchor}"`;
    }
  );

  // 4. Handle relative URLs without anchor: /p/slug
  fixed = fixed.replace(
    /href="\/p\/([^"#?]+)"/gi,
    (match, slug) => {
      if (isSamePost(slug)) {
        return 'href="#"';
      }
      return `href="/writing/${slug}"`;
    }
  );

  // 5. Handle any remaining substack.com/p/ links (with www, etc.)
  fixed = fixed.replace(
    /href="https?:\/\/(?:www\.)?andymasley\.substack\.com\/p\/([^"#?]+)(?:#([^"]+))?"/gi,
    (match, slug, anchor) => {
      if (isSamePost(slug)) {
        return anchor ? `href="#${anchor}"` : 'href="#"';
      }
      return anchor ? `href="/writing/${slug}#${anchor}"` : `href="/writing/${slug}"`;
    }
  );

  return fixed;
}

// Process HTML content for display
export function processPostContent(html: string, slug: string): string {
  // Fix anchor links
  let processed = fixAnchorLinks(html, slug);

  // Remove Substack's subscription widgets and buttons
  processed = processed.replace(/<div class="subscription-widget[^>]*>[\s\S]*?<\/div>/gi, '');
  processed = processed.replace(/<div class="subscribe-widget[^>]*>[\s\S]*?<\/div>/gi, '');
  processed = processed.replace(/<a[^>]*class="[^"]*button[^"]*"[^>]*>Subscribe<\/a>/gi, '');

  return processed;
}
