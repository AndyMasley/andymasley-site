// Fetches posts from EA Forum GraphQL API
// Uses file-based caching to avoid rate limiting during builds

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { normalizeHeadings, requireContent } from './substack';
import { lintPostContent } from './content-lint';
import { normalizePlainText, smartenHtmlText, tidyInlineTagBoundaries } from './smarten';

// Cache configuration
const CACHE_DIR = join(process.cwd(), '.cache', 'eaforum');
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

export interface EAForumPost {
  title: string;
  slug: string;
  date: Date;
  url: string;
  postId: string;
  isEvent: boolean;
  source: 'eaforum';
}

interface GraphQLPost {
  _id: string;
  title: string;
  slug: string;
  postedAt: string;
  isEvent: boolean;
}

interface CachedPosts {
  timestamp: number;
  posts: EAForumPost[];
}

const USER_ID = 'bhod9XuEeXYvaRF8w'; // andy-masley's EA Forum user ID
const GRAPHQL_ENDPOINT = 'https://forum-bots.effectivealtruism.org/graphql';

// In-memory cache for current build
let memoryCache: EAForumPost[] | null = null;

// Titles pass through the shared normalizer on both the live path and the
// committed-cache fallback (same rule as substack.ts — CI always takes the
// fallback). The disk cache stays raw.
function restoreCachedPosts(cached: CachedPosts): EAForumPost[] {
  return cached.posts.map(post => ({
    ...post,
    date: new Date(post.date),
    title: normalizePlainText(post.title),
  }));
}

export async function fetchEAForumPosts(): Promise<EAForumPost[]> {
  // Return memory cache if available (same build)
  if (memoryCache !== null) {
    return memoryCache;
  }

  ensureCacheDir();

  // Load existing cache for freshness check and stale fallback
  let existingCache: CachedPosts | null = null;
  if (existsSync(POSTS_CACHE_FILE)) {
    try {
      existingCache = JSON.parse(readFileSync(POSTS_CACHE_FILE, 'utf-8'));
      const age = Date.now() - existingCache.timestamp;

      if (age < CACHE_TTL) {
        console.log(`Using cached EA Forum posts list (${Math.round(age / 1000)}s old)`);
        const posts = restoreCachedPosts(existingCache);
        memoryCache = posts;
        return posts;
      }
    } catch (e) {
      console.log('EA Forum cache read error, fetching fresh data');
    }
  }

  try {
    console.log('Fetching posts list from EA Forum API...');
    const eaForumPosts: EAForumPost[] = [];
    const limit = 50;
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const query = `{
        posts(input: {
          terms: {
            userId: "${USER_ID}",
            view: "userPosts",
            limit: ${limit},
            offset: ${offset}
          }
        }) {
          results {
            _id
            title
            slug
            postedAt
            isEvent
          }
        }
      }`;

      const response = await fetch(GRAPHQL_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query })
      });

      if (!response.ok) {
        // Throw instead of breaking with a partial list: a failure after the
        // first page would otherwise return (and cache) a truncated post
        // list. The catch below falls back to the stale cache when one
        // exists, and only hard-fails under REQUIRE_CONTENT when it doesn't.
        throw new Error(`EA Forum posts list fetch failed at offset ${offset}: ${response.status}`);
      }

      const data = await response.json();
      if (Array.isArray(data?.errors) && data.errors.length > 0) {
        throw new Error('EA Forum GraphQL returned errors');
      }

      const posts: GraphQLPost[] = data?.data?.posts?.results || [];
      if (!Array.isArray(posts) || posts.length === 0) {
        hasMore = false;
        break;
      }

      eaForumPosts.push(
        ...posts
          .filter(post => !post.isEvent)
          .filter(post => post.slug !== 'alcohol-is-so-bad-for-society-that-you-should-probably-stop')
          .map(post => ({
            title: normalizePlainText(post.title),
            slug: post.slug,
            date: new Date(post.postedAt),
            url: `https://forum.effectivealtruism.org/posts/${post._id}/${post.slug}`,
            postId: post._id,
            isEvent: post.isEvent,
            source: 'eaforum' as const,
          }))
      );

      offset += limit;
      if (posts.length < limit) {
        hasMore = false;
      }
    }

    eaForumPosts.sort((a, b) => b.date.getTime() - a.date.getTime());

    if (eaForumPosts.length === 0) {
      if (existingCache && existingCache.posts.length > 0) {
        console.warn('EA Forum API returned 0 posts, using stale cache');
        const posts = restoreCachedPosts(existingCache);
        memoryCache = posts;
        return posts;
      }
      console.error('EA Forum API returned 0 posts and no cache available');
      requireContent('EA Forum API returned 0 posts and no cache available');
      return [];
    }

    // Save to file cache
    const cacheData: CachedPosts = {
      timestamp: Date.now(),
      posts: eaForumPosts
    };
    writeFileSync(POSTS_CACHE_FILE, JSON.stringify(cacheData, null, 2));
    console.log(`Cached ${eaForumPosts.length} EA Forum posts to disk`);

    // Save to memory cache
    memoryCache = eaForumPosts;
    return eaForumPosts;
  } catch (error) {
    // Guard errors are intentional build failures, not fetch failures
    if (error instanceof Error && error.message.includes('REQUIRE_CONTENT')) throw error;
    console.error('Failed to fetch EA Forum posts:', error);

    if (existingCache && existingCache.posts.length > 0) {
      console.log(`Using stale EA Forum cache (${existingCache.posts.length} posts) after API failure`);
      const posts = restoreCachedPosts(existingCache);
      memoryCache = posts;
      return posts;
    }

    requireContent(`Failed to fetch EA Forum posts and no cache available: ${error}`);
    return [];
  }
}

// Fetch full HTML content for an EA Forum post
export async function fetchEAForumPostContent(postId: string): Promise<string> {
  ensureCacheDir();

  // Check file cache first
  const cacheFile = join(CONTENT_CACHE_DIR, `${postId}.html`);
  if (existsSync(cacheFile)) {
    return readFileSync(cacheFile, 'utf-8');
  }

  const query = `{
    post(input: { selector: { _id: "${postId}" } }) {
      result {
        htmlBody
      }
    }
  }`;

  try {
    const response = await fetch(GRAPHQL_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query })
    });

    if (!response.ok) {
      console.error(`EA Forum API error: ${response.status}`);
      requireContent(`EA Forum content fetch for ${postId} failed: ${response.status}`);
      return '';
    }

    const data = await response.json();
    const htmlBody = data?.data?.post?.result?.htmlBody || '';

    if (htmlBody) {
      // Cache to file
      writeFileSync(cacheFile, htmlBody);
    } else {
      requireContent(`EA Forum post ${postId} has no htmlBody`);
    }

    return htmlBody;
  } catch (error) {
    if (error instanceof Error && error.message.includes('REQUIRE_CONTENT')) throw error;
    console.error('Failed to fetch EA Forum post content:', error);
    requireContent(`Failed to fetch EA Forum content for ${postId}: ${error}`);
    return '';
  }
}

// Process EA Forum HTML content for display
// Fixes internal links to point to local pages where applicable
export function processEAForumContent(html: string, currentSlug?: string): string {
  // Same placeholder lint and body-h1 demotion + strong-in-heading cleanup
  // as Substack imports, so no post body carries an h1 regardless of source.
  lintPostContent(html, currentSlug || 'eaforum-post');
  let processed = normalizeHeadings(html, currentSlug || 'eaforum-post');

  // Normalize slug for comparison
  const normalizedSlug = currentSlug ? decodeURIComponent(currentSlug).toLowerCase() : '';

  const isSamePost = (slug: string): boolean => {
    if (!currentSlug) return false;
    const normalized = decodeURIComponent(slug).toLowerCase();
    return normalized === normalizedSlug;
  };

  // Handle EA Forum links with anchors to same post
  // href="https://forum.effectivealtruism.org/posts/ID/slug#heading" → href="#heading"
  processed = processed.replace(
    /href="https:\/\/forum\.effectivealtruism\.org\/posts\/[^/]+\/([^"#?]+)#([^"]+)"/gi,
    (match, slug, anchor) => {
      if (isSamePost(slug)) {
        return `href="#${anchor}"`;
      }
      // Different EA Forum post - keep as external for now since we may not have it locally
      return match;
    }
  );

  // Handle EA Forum links without anchors to same post
  processed = processed.replace(
    /href="https:\/\/forum\.effectivealtruism\.org\/posts\/[^/]+\/([^"#?]+)"/gi,
    (match, slug) => {
      if (isSamePost(slug)) {
        return 'href="#"';
      }
      return match;
    }
  );

  // Add ID attributes to headings so anchor links and TOC work
  const usedIds = new Set<string>();
  processed = processed.replace(
    /<(h[1-6])([^>]*)>([\s\S]*?)<\/\1>/gi,
    (match, tag, attrs, innerHtml) => {
      if (/\bid\s*=/i.test(attrs)) return match;
      const plainText = innerHtml.replace(/<[^>]*>/g, '').trim();
      let id = plainText.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
      if (!id) return match;
      let uniqueId = id;
      let counter = 1;
      while (usedIds.has(uniqueId)) { uniqueId = `${id}-${counter}`; counter++; }
      usedIds.add(uniqueId);
      return `<${tag}${attrs} id="${uniqueId}">${innerHtml}</${tag}>`;
    }
  );

  // Same compositor's pass as Substack imports (build-time only; the
  // committed cache stays raw): inline-tag whitespace tidied, empty
  // paragraphs dropped, quotes smartened, dashes normalized.
  processed = tidyInlineTagBoundaries(processed);
  processed = processed.replace(/<p>(?:\s|&nbsp;|<br\s*\/?>)*<\/p>/gi, '');
  processed = smartenHtmlText(processed);

  return processed;
}
