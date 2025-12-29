// Fetches and parses Substack RSS feed
// Run at build time - Cloudflare scheduled builds will refresh daily

export interface SubstackPost {
  title: string;
  slug: string;
  date: Date;
  description: string;
  content: string;
  url: string;
  category: string;
}

// Category definitions with editable overviews
// Edit these descriptions to update what appears on the writing page
export interface CategoryConfig {
  name: string;
  slug: string;
  overview: string;
}

export const categoryConfigs: CategoryConfig[] = [
  {
    name: "AI & the Environment",
    slug: "ai-environment",
    overview: "Analysis of AI's environmental impact—water use, energy consumption, and data centers. I challenge misleading narratives with data and primary sources."
  },
  {
    name: "Artificial Intelligence",
    slug: "artificial-intelligence",
    overview: "Broader thinking about AI capabilities, policy, governance, and societal implications beyond environmental concerns."
  },
  {
    name: "Animal Welfare",
    slug: "animal-welfare",
    overview: "Essays on animal welfare, factory farming, and the moral consideration we owe to non-human animals."
  },
  {
    name: "Charity",
    slug: "charity",
    overview: "Effective altruism, philanthropy, and how to do the most good. Includes coverage of EA DC and the broader EA movement."
  },
  {
    name: "Politics",
    slug: "politics",
    overview: "Political analysis, policy critiques, and commentary on current events."
  },
  {
    name: "Recs & Advice",
    slug: "recs-advice",
    overview: "Recommendations, life advice, and miscellaneous thoughts that don't fit elsewhere."
  },
  {
    name: "Misc",
    slug: "misc",
    overview: "Everything else—random thoughts, experiments, and posts that defy categorization."
  }
];

// Manual category mapping - add your posts here as needed
// Key is the post slug (end of URL), value is the category name
const categoryMap: Record<string, string> = {
  // AI & the Environment
  "data-centers-dont-use-that-much-water": "AI & the Environment",
  "empire-of-ai-is-wildly-misleading": "AI & the Environment",
  "ai-water-use-in-context": "AI & the Environment",
  "the-ai-water-discourse": "AI & the Environment",

  // Artificial Intelligence (general)
  "ai-can-obviously-create-new-knowledge": "Artificial Intelligence",
  "on-compute-governance": "Artificial Intelligence",

  // Animal Welfare
  "factory-farming": "Animal Welfare",
  "animal-welfare": "Animal Welfare",

  // Charity / EA
  "what-open-philanthropy-gets-right": "Charity",
  "ea-dc-year-one": "Charity",
  "effective-altruism": "Charity",

  // Politics
  "labor-theory-value": "Politics",
  "the-labor-theory-of-value": "Politics",

  // Add more mappings as you publish
};

// Keywords to auto-categorize (fallback if not in manual map)
const categoryKeywords: Record<string, string[]> = {
  "AI & the Environment": [
    "water use", "data center water", "cooling", "environmental",
    "water consumption", "gallons", "thirsty", "empire of ai"
  ],
  "Artificial Intelligence": [
    "ai", "gpt", "claude", "llm", "model", "openai", "anthropic",
    "machine learning", "compute", "neural", "transformer"
  ],
  "Animal Welfare": [
    "animal", "factory farm", "chicken", "pig", "cow", "meat",
    "vegan", "vegetarian", "suffering", "sentience"
  ],
  "Charity": [
    "effective altruism", "ea", "philanthropy", "giving", "charity",
    "open philanthropy", "givewell", "impact", "donate"
  ],
  "Politics": [
    "policy", "regulation", "government", "law", "congress",
    "legislation", "political", "election", "vote", "democrat",
    "republican", "labor", "economy", "economics", "marxism"
  ],
  "Recs & Advice": [
    "recommend", "advice", "tip", "guide", "how to", "best",
    "favorite", "review", "rating"
  ],
};

function inferCategory(title: string, description: string, slug: string): string {
  // Check manual mapping first
  if (categoryMap[slug]) {
    return categoryMap[slug];
  }

  // Try keyword matching - check AI & Environment first since it's more specific
  const text = `${title} ${description}`.toLowerCase();

  // Check AI & Environment before general AI
  if (categoryKeywords["AI & the Environment"].some(kw => text.includes(kw.toLowerCase()))) {
    return "AI & the Environment";
  }

  // Check other categories
  for (const [category, keywords] of Object.entries(categoryKeywords)) {
    if (category === "AI & the Environment") continue; // Already checked
    if (keywords.some(kw => text.includes(kw.toLowerCase()))) {
      return category;
    }
  }

  return "Misc";
}

function extractSlug(url: string): string {
  const parts = url.split('/');
  return parts[parts.length - 1] || parts[parts.length - 2] || '';
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#8217;/g, "'")
    .replace(/&#8220;/g, '"')
    .replace(/&#8221;/g, '"')
    .replace(/&#8212;/g, '—')
    .trim();
}

function parseRssDate(dateStr: string): Date {
  return new Date(dateStr);
}

export async function fetchSubstackPosts(): Promise<SubstackPost[]> {
  const FEED_URL = 'https://andymasley.substack.com/feed';

  try {
    const response = await fetch(FEED_URL);
    const xml = await response.text();

    const posts: SubstackPost[] = [];

    // Parse XML manually (Astro build environment)
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;

    while ((match = itemRegex.exec(xml)) !== null) {
      const item = match[1];

      const getTag = (tag: string): string => {
        const regex = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>|<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`);
        const m = item.match(regex);
        return m ? (m[1] || m[2] || '').trim() : '';
      };

      const title = getTag('title');
      const link = getTag('link');
      const pubDate = getTag('pubDate');
      const description = stripHtml(getTag('description'));
      const content = getTag('content:encoded') || getTag('description');

      if (!title || !link) continue;

      const slug = extractSlug(link);

      posts.push({
        title,
        slug,
        date: parseRssDate(pubDate),
        description: description.slice(0, 300) + (description.length > 300 ? '...' : ''),
        content,
        url: link,
        category: inferCategory(title, description, slug),
      });
    }

    // Sort by date descending
    posts.sort((a, b) => b.date.getTime() - a.date.getTime());

    return posts;
  } catch (error) {
    console.error('Failed to fetch Substack feed:', error);
    return [];
  }
}

export function groupByCategory(posts: SubstackPost[]): Record<string, SubstackPost[]> {
  const grouped: Record<string, SubstackPost[]> = {};

  // Initialize all categories (even empty ones)
  for (const config of categoryConfigs) {
    grouped[config.name] = [];
  }

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
