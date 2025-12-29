// Fetches and parses Substack RSS feed
// Run at build time - Netlify scheduled builds will refresh daily

export interface SubstackPost {
  title: string;
  slug: string;
  date: Date;
  description: string;
  content: string;
  url: string;
  category: string;
}

// Manual category mapping - add your posts here as needed
// Posts not listed will go to "Miscellaneous"
const categoryMap: Record<string, string> = {
  // AI & Technology
  "data-centers-dont-use-that-much-water": "AI & Technology",
  "on-compute-governance": "AI & Technology",
  
  // Economics
  "the-labor-theory-of-value": "Economics",
  
  // Effective Altruism
  "what-open-philanthropy-gets-right": "Effective Altruism",
  "ea-dc-year-one": "Effective Altruism",
  
  // Add more mappings as you publish
};

// Keywords to auto-categorize (fallback if not in manual map)
const categoryKeywords: Record<string, string[]> = {
  "AI & Technology": ["ai", "data center", "compute", "model", "openai", "anthropic", "tech", "gpu"],
  "Economics": ["economy", "labor", "value", "market", "gdp", "inflation", "trade"],
  "Effective Altruism": ["ea", "altruism", "philanthropy", "giving", "impact", "cause", "charity"],
  "Policy": ["policy", "regulation", "government", "law", "congress", "legislation"],
};

function inferCategory(title: string, description: string, slug: string): string {
  // Check manual mapping first
  if (categoryMap[slug]) {
    return categoryMap[slug];
  }
  
  // Try keyword matching
  const text = `${title} ${description}`.toLowerCase();
  for (const [category, keywords] of Object.entries(categoryKeywords)) {
    if (keywords.some(kw => text.includes(kw))) {
      return category;
    }
  }
  
  return "Miscellaneous";
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
  
  for (const post of posts) {
    if (!grouped[post.category]) {
      grouped[post.category] = [];
    }
    grouped[post.category].push(post);
  }
  
  // Sort categories with preferred order
  const order = ["AI & Technology", "Policy", "Economics", "Effective Altruism", "Miscellaneous"];
  const sorted: Record<string, SubstackPost[]> = {};
  
  for (const cat of order) {
    if (grouped[cat]) {
      sorted[cat] = grouped[cat];
    }
  }
  
  // Add any remaining categories
  for (const cat of Object.keys(grouped)) {
    if (!sorted[cat]) {
      sorted[cat] = grouped[cat];
    }
  }
  
  return sorted;
}
