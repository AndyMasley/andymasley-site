// Fetches posts from Substack API
// Uses file-based caching to avoid rate limiting during builds

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { getMetaPostSlugs } from '@/lib/meta-posts';
import { lintPostContent } from './content-lint';

// Cache configuration
const CACHE_DIR = join(process.cwd(), '.cache', 'substack');
const POSTS_CACHE_FILE = join(CACHE_DIR, 'posts.json');
const CONTENT_CACHE_DIR = join(CACHE_DIR, 'content');
const CACHE_TTL = 1000 * 60 * 60; // 1 hour TTL for posts list

// Ensure cache directories exist
function ensureCacheDir() {
  if (!existsSync(CACHE_DIR)) {
    mkdirSync(CACHE_DIR, { recursive: true });
  }
  if (!existsSync(CONTENT_CACHE_DIR)) {
    mkdirSync(CONTENT_CACHE_DIR, { recursive: true });
  }
}

// When REQUIRE_CONTENT is set (the deploy workflow sets it), a build that
// cannot get real content out of the APIs must fail loudly instead of
// silently producing a site with missing posts or empty pages.
export function requireContent(message: string): void {
  if (process.env.REQUIRE_CONTENT) {
    throw new Error(`${message} — REQUIRE_CONTENT is set, refusing to build an incomplete site`);
  }
}

// Rate limiting helper
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 500; // ms between requests

async function rateLimitedFetch(url: string, retries = 3): Promise<Response> {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;

  if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
    await new Promise(resolve => setTimeout(resolve, MIN_REQUEST_INTERVAL - timeSinceLastRequest));
  }

  lastRequestTime = Date.now();
  const response = await fetch(url);

  // Retry on rate limit with exponential backoff
  if (response.status === 429 && retries > 0) {
    const delay = (4 - retries) * 2000; // 2s, 4s, 6s
    console.log(`Rate limited, waiting ${delay}ms before retry...`);
    await new Promise(resolve => setTimeout(resolve, delay));
    return rateLimitedFetch(url, retries - 1);
  }

  return response;
}

export interface SubstackPost {
  title: string;
  slug: string;
  date: Date;
  description: string;
  url: string;
  category: string;
  source: 'substack';
  cover_image?: string;
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
  cover_image: string | null;
}

interface CachedPosts {
  timestamp: number;
  posts: SubstackPost[];
}

// In-memory cache for current build
let memoryCache: SubstackPost[] | null = null;

function hasRequiredMetaPosts(posts: Array<{ slug: string }>): boolean {
  const requiredMetaSlugs = getMetaPostSlugs();
  return requiredMetaSlugs.every(slug => posts.some(post => post.slug === slug));
}

export async function fetchSubstackPosts(): Promise<SubstackPost[]> {
  // Return memory cache if available (same build)
  if (memoryCache !== null) {
    return memoryCache;
  }

  ensureCacheDir();

  // Load existing cache (used as fallback and for freshness check)
  let existingCache: CachedPosts | null = null;
  if (existsSync(POSTS_CACHE_FILE)) {
    try {
      existingCache = JSON.parse(readFileSync(POSTS_CACHE_FILE, 'utf-8'));
    } catch (e) {
      console.log('Cache read error, will fetch fresh data');
    }
  }

  // If cache is fresh, use it
  if (existingCache && (Date.now() - existingCache.timestamp) < CACHE_TTL && hasRequiredMetaPosts(existingCache.posts)) {
    console.log(`Using cached posts list (${Math.round((Date.now() - existingCache.timestamp) / 1000)}s old)`);
    const posts = existingCache.posts.map(p => ({ ...p, date: new Date(p.date) }));
    memoryCache = posts;
    return posts;
  } else if (existingCache && !hasRequiredMetaPosts(existingCache.posts)) {
    console.log('Cached posts list is missing required guide slugs, fetching fresh data');
  }

  // Cache is stale or missing — try to fetch fresh data
  const BASE_URL = 'https://andymasley.substack.com/api/v1/posts';
  const allPosts: SubstackPost[] = [];

  try {
    console.log('Fetching posts list from Substack API...');

    // Fetch all posts with pagination (API limit is 50 per request)
    let offset = 0;
    const limit = 50;
    let hasMore = true;

    while (hasMore) {
      const response = await rateLimitedFetch(`${BASE_URL}?offset=${offset}&limit=${limit}`);

      if (!response.ok) {
        // Throw instead of breaking with a partial list: a failure after the
        // first page would otherwise return (and cache) a truncated post
        // list. The catch below falls back to the stale cache when one
        // exists, and only hard-fails under REQUIRE_CONTENT when it doesn't.
        throw new Error(`Substack posts list fetch failed at offset ${offset}: ${response.status}`);
      }

      const posts: SubstackAPIPost[] = await response.json();

      if (!Array.isArray(posts) || posts.length === 0) {
        hasMore = false;
        break;
      }

      for (const post of posts) {
        // Skip non-newsletter posts (like hub pages)
        if (post.type !== 'newsletter' || !post.is_published) continue;

        // Skip special utility pages that should never become writing posts
        if (post.slug === 'links') continue;

        // Skip unpublished-from-site posts
        if (post.slug === 'i-cant-find-any-instances-of-data') continue;
        if (post.slug === 'stories-of-ai-turning-users-delusional') continue;

        allPosts.push({
          title: post.title,
          slug: post.slug,
          date: new Date(post.post_date),
          description: post.subtitle || post.description || '',
          url: post.canonical_url,
          category: getSectionCategory(post.section_id),
          source: 'substack',
          cover_image: post.cover_image || undefined,
        });
      }

      offset += limit;
      if (posts.length < limit) {
        hasMore = false;
      }
    }

    // Sort by date descending
    allPosts.sort((a, b) => b.date.getTime() - a.date.getTime());

    // If API returned 0 posts, always fall back to cache — never cache empty results
    if (allPosts.length === 0) {
      if (existingCache && existingCache.posts.length > 0) {
        console.warn('Substack API returned 0 posts, using stale cache');
        const posts = existingCache.posts.map(p => ({ ...p, date: new Date(p.date) }));
        memoryCache = posts;
        return posts;
      }
      console.error('Substack API returned 0 posts and no cache available');
      requireContent('Substack API returned 0 posts and no cache available');
      return [];
    }

    // Save to file cache
    const cacheData: CachedPosts = {
      timestamp: Date.now(),
      posts: allPosts
    };
    writeFileSync(POSTS_CACHE_FILE, JSON.stringify(cacheData, null, 2));
    console.log(`Cached ${allPosts.length} posts to disk`);

    // Save to memory cache
    memoryCache = allPosts;
    return allPosts;
  } catch (error) {
    // Guard errors are intentional build failures, not fetch failures
    if (error instanceof Error && error.message.includes('REQUIRE_CONTENT')) throw error;
    console.error('Failed to fetch Substack posts:', error);

    // Always fall back to stale cache rather than returning nothing
    if (existingCache && existingCache.posts.length > 0) {
      console.log(`Using stale cache (${existingCache.posts.length} posts) after API failure`);
      const posts = existingCache.posts.map(p => ({ ...p, date: new Date(p.date) }));
      memoryCache = posts;
      return posts;
    }

    requireContent(`Failed to fetch Substack posts and no cache available: ${error}`);
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
  ensureCacheDir();

  // Check file cache first
  const cacheFile = join(CONTENT_CACHE_DIR, `${slug}.html`);
  if (existsSync(cacheFile)) {
    return readFileSync(cacheFile, 'utf-8');
  }

  const API_URL = `https://andymasley.substack.com/api/v1/posts/${slug}`;

  try {
    const response = await rateLimitedFetch(API_URL);
    if (!response.ok) {
      console.error(`Failed to fetch post ${slug}: ${response.status}`);
      requireContent(`Failed to fetch post ${slug}: ${response.status}`);
      return '';
    }

    const post = await response.json();

    // The API returns body_html with the full content
    if (post.body_html) {
      // Cache to file
      writeFileSync(cacheFile, post.body_html);
      return post.body_html;
    }

    requireContent(`Post ${slug} has no body_html`);
    return '';
  } catch (error) {
    if (error instanceof Error && error.message.includes('REQUIRE_CONTENT')) throw error;
    console.error(`Failed to fetch content for ${slug}:`, error);
    requireContent(`Failed to fetch content for ${slug}: ${error}`);
    return '';
  }
}

// Subcategory extracted from meta post
export interface Subcategory {
  name: string;
  slug: string;
  postSlugs: string[];
}

const subcategoryPostOverrides: Record<string, string[]> = {
  'Meta': ['a-call-for-more-specific-and-numerate'],
  'Data Centers': ['data-centers-heat-exhaust-is-not'],
};

// Parse subcategories from meta post HTML
// Expects structure: <h3>Category Name</h3> followed by <ul> with post links
export function parseSubcategoriesFromHTML(html: string): Subcategory[] {
  const subcategories: Subcategory[] = [];

  // Match h3 headers followed by ul lists
  // Regex to find h3 tags and capture their content
  // Capture stops at "/", "?" or "#" so query strings, anchors, and comment
  // permalinks still register under the bare post slug
  const linkRegex = /href="https:\/\/(?:(?:www\.)?andymasley\.substack\.com|blog\.andymasley\.com)\/p\/([^"#?\/]+)[^"]*"/g;

  // Split by h3 tags to process each section
  const sections = html.split(/<h3[^>]*>/i);

  for (let i = 1; i < sections.length; i++) {
    const section = sections[i];

    // Extract category name (text before closing </h3>)
    const nameMatch = section.match(/^([^<]+)<\/h3>/i);
    if (!nameMatch) continue;

    const name = nameMatch[1].trim();

    // Skip certain sections that aren't real categories
    if (['Misc', 'Podcast appearances'].includes(name)) continue;

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

    const overrides = subcategoryPostOverrides[name] || [];
    overrides.forEach(slug => {
      if (slug !== 'ai-and-the-environment' && !postSlugs.includes(slug)) {
        postSlugs.push(slug);
      }
    });

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
//
// Slug captures deliberately exclude "/" so that only bare post URLs are
// rewritten. Substack URLs with extra path segments (/p/slug/comment/123,
// /p/slug/comments, /p/slug/restacks) have no equivalent page on this site,
// so they are left pointing at Substack instead of being turned into
// /writing/slug/comment/123, which 404s.
export function fixAnchorLinks(html: string, currentSlug: string): string {
  let fixed = html;

  // Normalize the current slug for comparison (handle URL encoding)
  const normalizedSlug = decodeURIComponent(currentSlug).toLowerCase();

  // Helper to check if a slug matches the current post
  const isSamePost = (slug: string): boolean => {
    const normalized = decodeURIComponent(slug).toLowerCase();
    return normalized === normalizedSlug;
  };

  // Helper to clean up anchor - decode and remove section symbol prefix
  const cleanAnchor = (anchor: string): string => {
    let cleaned = decodeURIComponent(anchor);
    // Remove section symbol prefix (§ or %C2%A7)
    cleaned = cleaned.replace(/^§/, '');
    // Remove text fragment syntax (:~:text=...)
    if (cleaned.includes(':~:text=')) {
      return '';
    }
    return cleaned;
  };

  // 0. Handle Substack TOC links: /i/{post-id}/{section-slug}
  // href="https://andymasley.substack.com/i/162196004/this-post-in-a-nutshell" → href="#this-post-in-a-nutshell"
  // These are always same-post anchors (used for table of contents)
  fixed = fixed.replace(
    /href="https?:\/\/(?:(?:www\.)?andymasley\.substack\.com|blog\.andymasley\.com)\/i\/\d+\/([^"]+)"/gi,
    (match, sectionSlug) => {
      const cleanedSlug = decodeURIComponent(sectionSlug);
      return `href="#${cleanedSlug}"`;
    }
  );

  // 1. Handle URLs with query params AND anchors: ?open=false#anchor
  // href="https://andymasley.substack.com/p/slug?open=false#%C2%A7section" → href="#section"
  fixed = fixed.replace(
    /href="https?:\/\/(?:(?:www\.)?andymasley\.substack\.com|blog\.andymasley\.com)\/p\/([^"#?\/]+)\?[^"#]*#([^"]+)"/gi,
    (match, slug, anchor) => {
      const cleanedAnchor = cleanAnchor(anchor);
      if (isSamePost(slug)) {
        return cleanedAnchor ? `href="#${cleanedAnchor}"` : 'href="#"';
      }
      return cleanedAnchor ? `href="/writing/${slug}#${cleanedAnchor}"` : `href="/writing/${slug}"`;
    }
  );

  // 2. Handle full URLs with anchor (no query params)
  // href="https://andymasley.substack.com/p/current-post#heading" → href="#heading"
  fixed = fixed.replace(
    /href="https?:\/\/(?:(?:www\.)?andymasley\.substack\.com|blog\.andymasley\.com)\/p\/([^"#?\/]+)#([^"]+)"/gi,
    (match, slug, anchor) => {
      const cleanedAnchor = cleanAnchor(anchor);
      if (isSamePost(slug)) {
        return cleanedAnchor ? `href="#${cleanedAnchor}"` : 'href="#"';
      }
      return cleanedAnchor ? `href="/writing/${slug}#${cleanedAnchor}"` : `href="/writing/${slug}"`;
    }
  );

  // 3. Handle full URLs with query params but no anchor
  fixed = fixed.replace(
    /href="https?:\/\/(?:(?:www\.)?andymasley\.substack\.com|blog\.andymasley\.com)\/p\/([^"#?\/]+)\?[^"]*"/gi,
    (match, slug) => {
      if (isSamePost(slug)) {
        return 'href="#"';
      }
      return `href="/writing/${slug}"`;
    }
  );

  // 4. Handle full URLs without anchor or query params
  fixed = fixed.replace(
    /href="https?:\/\/(?:(?:www\.)?andymasley\.substack\.com|blog\.andymasley\.com)\/p\/([^"#?\/]+)"/gi,
    (match, slug) => {
      if (isSamePost(slug)) {
        return 'href="#"';
      }
      return `href="/writing/${slug}"`;
    }
  );

  // 5. Handle relative URLs: /p/slug#anchor
  fixed = fixed.replace(
    /href="\/p\/([^"#?\/]+)#([^"]+)"/gi,
    (match, slug, anchor) => {
      const cleanedAnchor = cleanAnchor(anchor);
      if (isSamePost(slug)) {
        return cleanedAnchor ? `href="#${cleanedAnchor}"` : 'href="#"';
      }
      return cleanedAnchor ? `href="/writing/${slug}#${cleanedAnchor}"` : `href="/writing/${slug}"`;
    }
  );

  // 6. Handle relative URLs without anchor: /p/slug
  fixed = fixed.replace(
    /href="\/p\/([^"#?\/]+)"/gi,
    (match, slug) => {
      if (isSamePost(slug)) {
        return 'href="#"';
      }
      return `href="/writing/${slug}"`;
    }
  );

  // 7. Any relative Substack URL left over (comment permalinks, /comments,
  // /restacks, query strings) has no page on this site, so point it back at
  // Substack rather than leaving a relative link that 404s here.
  fixed = fixed.replace(
    /href="\/p\/([^"]+)"/gi,
    (match, path) => `href="https://andymasley.substack.com/p/${path}"`
  );

  return fixed;
}

// Generate a slug from heading text for use as an ID
function generateHeadingId(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '') // Remove special characters
    .replace(/\s+/g, '-')          // Replace spaces with hyphens
    .replace(/-+/g, '-')           // Collapse multiple hyphens
    .replace(/^-|-$/g, '');        // Remove leading/trailing hyphens
}

// Normalize heading structure in imported bodies. Substack (and some EA
// Forum) posts use h1 for sections, but the layout's post title must stay the
// page's only h1 — so when body h1s exist, the whole ladder demotes one level
// (h1→h2 … h5→h6), preserving hierarchy. Also unwraps <strong>/<b> inside
// headings (Substack export artifact — headings are already bold).
// Idempotent: a normalized body has no h1s and no strong-in-heading, so a
// second pass is a no-op. Remaining level skips (e.g. h2→h4) are logged for
// manual review rather than auto-fixed — some skips are authorial.
export function normalizeHeadings(html: string, slug: string): string {
  let out = html.replace(
    /<(h[1-6])([^>]*)>([\s\S]*?)<\/\1>/gi,
    (_match, tag, attrs, inner) =>
      `<${tag}${attrs}>${inner.replace(/<\/?(?:strong|b)\b[^>]*>/gi, '')}</${tag}>`
  );

  if (/<h1[\s>]/i.test(out)) {
    out = out.replace(
      /(<\/?)h([1-6])\b/gi,
      (_m, bracket, n) => `${bracket}h${Math.min(6, Number(n) + 1)}`
    );
  }

  const levels: number[] = [];
  const headingRe = /<h([1-6])[\s>]/gi;
  let m: RegExpExecArray | null;
  while ((m = headingRe.exec(out)) !== null) levels.push(Number(m[1]));
  const skips: string[] = [];
  if (levels.length && levels[0] > 2) skips.push(`h1(title)→h${levels[0]}`);
  for (let i = 1; i < levels.length; i++) {
    if (levels[i] > levels[i - 1] + 1) skips.push(`h${levels[i - 1]}→h${levels[i]}`);
  }
  if (skips.length) {
    console.log(`[headings] ${slug}: level skip(s) left as-is: ${skips.join(', ')}`);
  }
  return out;
}

// Add ID attributes to headings so anchor links can target them
function addHeadingIds(html: string): string {
  // Track used IDs to avoid duplicates
  const usedIds = new Set<string>();

  // Match h1-h6 tags, allowing inner HTML tags (e.g. <strong>)
  return html.replace(
    /<(h[1-6])([^>]*)>([\s\S]*?)<\/\1>/gi,
    (match, tag, attrs, innerHtml) => {
      const level = tag.toLowerCase();
      let outAttrs = attrs;
      let id: string;

      const existing = attrs.match(/\bid="([^"]*)"/i);
      if (existing) {
        id = existing[1];
        usedIds.add(id);
      } else {
        // Strip inner HTML tags to get plain text for ID generation
        const plainText = innerHtml.replace(/<[^>]*>/g, '').trim();
        const base = generateHeadingId(plainText);
        if (!base) return match;

        // Handle duplicate IDs by appending numbers (deterministic per build)
        let uniqueId = base;
        let counter = 1;
        while (usedIds.has(uniqueId)) {
          uniqueId = `${base}-${counter}`;
          counter++;
        }
        usedIds.add(uniqueId);
        id = uniqueId;
        outAttrs = `${attrs} id="${uniqueId}"`;
      }

      // Section anchor (§) on real section headings only. The TOC extractor
      // strips .h-anchor so these never pollute sidebar labels. h4 is included
      // because normalizeHeadings demotes former h3 subsections to h4.
      const anchor = (level === 'h1' || level === 'h2' || level === 'h3' || level === 'h4')
        ? `<a class="h-anchor" href="#${id}" aria-label="Link to this section">§</a>`
        : '';

      return `<${tag}${outAttrs}>${innerHtml}${anchor}</${tag}>`;
    }
  );
}

// Inject Tufte-style sidenotes. For each bottom footnote whose content is
// inline-only, place a .sidenote span immediately after its in-text reference
// (inside the same paragraph, so the float lands near its line) and tag the
// bottom footnote block so wide-screen CSS can hide it. Footnotes containing
// block elements (lists, figures, etc.) can't live in an inline <span>, so
// they are left bottom-only and logged.
function injectSidenotes(html: string, slug: string): string {
  const noteRe = /<div class="footnote" data-component-name="FootnoteToDOM"><a[^>]*class="footnote-number"[^>]*>(\d+)<\/a><div class="footnote-content">([\s\S]*?)<\/div><\/div>/g;
  const skipped: string[] = [];
  let out = html;
  let m: RegExpExecArray | null;

  const notes: { n: string; content: string; raw: string }[] = [];
  while ((m = noteRe.exec(html)) !== null) {
    notes.push({ n: m[1], content: m[2], raw: m[0] });
  }

  for (const { n, content, raw } of notes) {
    // Block-level content can't be flattened into an inline span — leave bottom-only.
    if (/<(img|figure|blockquote|ul|ol|table|h[1-6]|hr|pre)\b/i.test(content)) {
      skipped.push(n);
      continue;
    }
    // Flatten to inline: merge multiple <p> with a space, drop the <p> wrappers.
    const inline = content
      .replace(/<\/p>\s*<p[^>]*>/gi, ' ')
      .replace(/<\/?p[^>]*>/gi, '')
      .trim();

    const sidenote = `<span class="sidenote" role="note"><span class="sidenote-number">${n}</span> ${inline}</span>`;

    // Place the sidenote right after the in-text reference. If no in-text
    // reference exists, leave the note bottom-only.
    const anchorRe = new RegExp(`(<a class="footnote-anchor"[^>]*id="footnote-anchor-${n}"[^>]*>${n}<\\/a>)`);
    if (!anchorRe.test(out)) continue;
    out = out.replace(anchorRe, `$1${sidenote}`);

    // Tag the bottom block so wide-screen CSS can hide just the converted notes.
    out = out.replace(raw, raw.replace('<div class="footnote" ', '<div class="footnote footnotes-list" '));
  }

  if (skipped.length) {
    console.log(`[sidenotes] ${slug}: left ${skipped.length} block-content footnote(s) bottom-only: ${skipped.join(', ')}`);
  }
  return out;
}

// Process HTML content for display
export function processPostContent(html: string, slug: string, opts: { sidenotes?: boolean } = {}): string {
  const { sidenotes = true } = opts;
  // Fail the build on TK/TKTK/TODO left in post content; warn on softer
  // placeholder phrases.
  lintPostContent(html, slug);

  // Demote body h1s and strip strong-in-heading before IDs are generated,
  // so ID slugs and § anchors see the final heading shape.
  let processed = normalizeHeadings(html, slug);

  // Fix anchor links
  processed = fixAnchorLinks(processed, slug);

  // Add IDs to headings so anchor links work
  processed = addHeadingIds(processed);

  // Remove Substack's subscription widgets and buttons
  processed = processed.replace(/<div class="subscription-widget[^>]*>[\s\S]*?<\/div>/gi, '');
  processed = processed.replace(/<div class="subscribe-widget[^>]*>[\s\S]*?<\/div>/gi, '');
  processed = processed.replace(/<a[^>]*class="[^"]*button[^"]*"[^>]*>Subscribe<\/a>/gi, '');

  // Remove "Subscribe now" button wrappers
  processed = processed.replace(/<p[^>]*class="button-wrapper"[^>]*>[\s\S]*?<\/p>/gi, '');

  // Remove any remaining subscribe links/buttons
  processed = processed.replace(/<a[^>]*href="[^"]*substack\.com\/subscribe[^"]*"[^>]*>[\s\S]*?<\/a>/gi, '');

  // Remove subscription widget wraps (nested divs)
  processed = processed.replace(/<div[^>]*class="[^"]*subscription-widget-wrap[^"]*"[^>]*>[\s\S]*?<\/div>\s*<\/div>/gi, '');

  // Scene breaks: bare <hr> inside post bodies become an asterism.
  processed = processed.replace(/<hr\b[^>]*>/gi, '<div class="asterism" role="separator">⁂</div>');

  // Contain embeds that would otherwise escape the column. Video embeds get
  // a 16/9 frame with the house hairline (fixed width/height attributes
  // stripped so CSS owns the box); everything else — e.g. the Spotify player,
  // which is natively ~152-352px tall — keeps its height and is only clamped
  // to the column width. A blanket 16/9 would letterbox those.
  processed = processed.replace(/<iframe\b[^>]*><\/iframe>|<iframe\b[^>]*\/>/gi, (frame) => {
    const src = frame.match(/src="([^"]*)"/i)?.[1] || '';
    const isVideo = /youtube(-nocookie)?\.com|youtu\.be|player\.vimeo\.com/i.test(src);
    if (isVideo) {
      const cleaned = frame.replace(/\s(?:width|height)="[^"]*"/gi, '');
      return `<div class="embed-frame embed-frame--video">${cleaned}</div>`;
    }
    return `<div class="embed-frame">${frame}</div>`;
  });

  // Tables get a horizontal-scroll wrapper so a wide ledger never forces the
  // whole page sideways on phones.
  processed = processed.replace(/<table\b/gi, '<div class="table-scroll"><table')
    .replace(/<\/table>/gi, '</table></div>');

  // Tufte sidenotes (inline-content footnotes only; block-content stays bottom-only).
  // Skipped for the RSS feed, where footnotes render at the bottom and inline
  // sidenotes would duplicate them.
  if (sidenotes) {
    processed = injectSidenotes(processed, slug);
  }

  // Accessible names on footnote links. Runs after injectSidenotes so the
  // regexes there see untouched markup; idempotent (skips labeled links).
  processed = processed.replace(
    /<a([^>]*class="footnote-anchor"[^>]*)>/gi,
    (match, attrs) => {
      if (/aria-label=/i.test(attrs)) return match;
      const n = attrs.match(/footnote-anchor-(\d+)/)?.[1];
      return `<a${attrs} aria-label="Footnote${n ? ` ${n}` : ''}">`;
    }
  );
  processed = processed.replace(
    /<a([^>]*class="footnote-number"[^>]*)>/gi,
    (match, attrs) => {
      if (/aria-label=/i.test(attrs)) return match;
      const n = attrs.match(/id="footnote-(\d+)"/)?.[1];
      return `<a${attrs} aria-label="Back to reference${n ? ` ${n}` : ''}">`;
    }
  );

  return processed;
}
