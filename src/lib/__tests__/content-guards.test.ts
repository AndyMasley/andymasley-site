import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

// These tests exercise the REQUIRE_CONTENT guard: builds with the flag set
// (the deploy workflow) must fail when the APIs return nothing, while local
// builds without the flag keep the old return-empty behavior.
//
// Each test runs from a fresh temp cwd so the on-disk .cache fallback in the
// real repo can never satisfy the fetchers, and re-imports the module so the
// per-build memory cache starts empty.

const originalCwd = process.cwd();

function failingFetch() {
  return Promise.resolve({
    ok: false,
    status: 403,
    json: () => Promise.resolve({}),
  } as Response);
}

beforeEach(() => {
  process.chdir(mkdtempSync(join(tmpdir(), 'content-guards-')));
  vi.resetModules();
  vi.stubGlobal('fetch', vi.fn(failingFetch));
});

afterEach(() => {
  delete process.env.REQUIRE_CONTENT;
  vi.unstubAllGlobals();
  process.chdir(originalCwd);
});

describe('REQUIRE_CONTENT guard, Substack', () => {
  it('fails the build when the posts API is down and there is no cache', async () => {
    process.env.REQUIRE_CONTENT = '1';
    const { fetchSubstackPosts } = await import('../substack');
    await expect(fetchSubstackPosts()).rejects.toThrow(/REQUIRE_CONTENT/);
  });

  it('fails the build when a post content fetch fails', async () => {
    process.env.REQUIRE_CONTENT = '1';
    const { fetchPostContent } = await import('../substack');
    await expect(fetchPostContent('some-post')).rejects.toThrow(/REQUIRE_CONTENT/);
  });

  it('returns empty results without the flag (local builds keep working)', async () => {
    const { fetchSubstackPosts, fetchPostContent } = await import('../substack');
    await expect(fetchSubstackPosts()).resolves.toEqual([]);
    await expect(fetchPostContent('some-post')).resolves.toBe('');
  });

  it('fails the build on a partial posts list (page 2 fetch fails)', async () => {
    const page = Array.from({ length: 50 }, (_, i) => ({
      title: `Post ${i}`,
      slug: `post-${i}`,
      post_date: '2026-01-01',
      description: '',
      subtitle: '',
      canonical_url: `https://andymasley.substack.com/p/post-${i}`,
      section_id: null,
      is_published: true,
      type: 'newsletter',
    }));
    let call = 0;
    vi.stubGlobal('fetch', vi.fn(() => {
      call += 1;
      return Promise.resolve({
        ok: call === 1,
        status: call === 1 ? 200 : 500,
        json: () => Promise.resolve(page),
      } as Response);
    }));

    process.env.REQUIRE_CONTENT = '1';
    vi.resetModules();
    const { fetchSubstackPosts } = await import('../substack');
    await expect(fetchSubstackPosts()).rejects.toThrow(/offset 50/);
  });

  it('prefers a stale cache over failing when the fetch breaks mid-pagination', async () => {
    mkdirSync(join(process.cwd(), '.cache', 'substack'), { recursive: true });
    writeFileSync(join(process.cwd(), '.cache', 'substack', 'posts.json'), JSON.stringify({
      timestamp: Date.now() - 2 * 60 * 60 * 1000,
      posts: [{
        title: 'Cached post',
        slug: 'cached-post',
        date: '2026-01-01T00:00:00.000Z',
        description: '',
        url: 'https://andymasley.substack.com/p/cached-post',
        category: 'Misc',
        source: 'substack',
      }],
    }));

    process.env.REQUIRE_CONTENT = '1';
    vi.resetModules();
    const { fetchSubstackPosts } = await import('../substack');
    const posts = await fetchSubstackPosts();
    expect(posts.map(p => p.slug)).toEqual(['cached-post']);
  });
});

describe('REQUIRE_CONTENT guard, EA Forum', () => {
  it('fails the build when the posts API is down and there is no cache', async () => {
    process.env.REQUIRE_CONTENT = '1';
    const { fetchEAForumPosts } = await import('../eaforum');
    await expect(fetchEAForumPosts()).rejects.toThrow(/REQUIRE_CONTENT/);
  });

  it('fails the build when a post content fetch fails', async () => {
    process.env.REQUIRE_CONTENT = '1';
    const { fetchEAForumPostContent } = await import('../eaforum');
    await expect(fetchEAForumPostContent('abc123')).rejects.toThrow(/REQUIRE_CONTENT/);
  });

  it('returns empty results without the flag (local builds keep working)', async () => {
    const { fetchEAForumPosts, fetchEAForumPostContent } = await import('../eaforum');
    await expect(fetchEAForumPosts()).resolves.toEqual([]);
    await expect(fetchEAForumPostContent('abc123')).resolves.toBe('');
  });

  it('fails the build when GraphQL responds with errors', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ errors: [{ message: 'rate limited' }] }),
    } as Response)));

    process.env.REQUIRE_CONTENT = '1';
    vi.resetModules();
    const { fetchEAForumPosts } = await import('../eaforum');
    await expect(fetchEAForumPosts()).rejects.toThrow(/REQUIRE_CONTENT/);
  });
});
