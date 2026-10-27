import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { getMetaPostSlugs } from '../meta-posts';

// A blog post crossposted to the EA Forum is listed once, as the blog copy.
// Each test runs from a fresh temp cwd holding fresh caches (so nothing is
// fetched), and re-imports the modules so the per-build memory caches start
// empty, as in content-guards.test.ts.

const originalCwd = process.cwd();

function writePostsCache(source: 'substack' | 'eaforum', posts: object[]) {
  mkdirSync(join('.cache', source), { recursive: true });
  writeFileSync(
    join('.cache', source, 'posts.json'),
    JSON.stringify({ timestamp: Date.now(), posts }),
  );
}

function substackPost(slug: string, title: string, date: string) {
  return {
    title,
    slug,
    date,
    description: '',
    url: `https://blog.andymasley.com/p/${slug}`,
    category: 'Charity',
    source: 'substack',
  };
}

function forumPost(postId: string, slug: string, title: string, date: string) {
  return {
    title,
    slug,
    date,
    url: `https://forum.effectivealtruism.org/posts/${postId}/${slug}`,
    postId,
    isEvent: false,
    source: 'eaforum',
  };
}

beforeEach(() => {
  process.chdir(mkdtempSync(join(tmpdir(), 'eaforum-crossposts-')));
  vi.resetModules();
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
    ok: false,
    status: 403,
    json: () => Promise.resolve({}),
  } as Response)));
});

afterEach(() => {
  vi.unstubAllGlobals();
  process.chdir(originalCwd);
});

describe('EA Forum crossposts', () => {
  it('drops a Forum post whose title matches a Substack post, whatever its slug', async () => {
    writePostsCache('substack', [
      ...getMetaPostSlugs().map(slug => substackPost(slug, slug, '2025-01-01T00:00:00.000Z')),
      substackPost('the-direction-id-like-for-effective', 'The direction I’d like for effective altruism', '2026-10-14T19:16:57.385Z'),
      substackPost('alcohol-is-so-bad-for-society-that', 'Alcohol is so bad for society that you should probably stop drinking', '2025-06-01T00:00:00.000Z'),
    ]);
    writePostsCache('eaforum', [
      forumPost('FjtwFbvxgxcgxFqJx', 'the-direction-i-d-like-for-effective-altruism', "The direction I'd like for effective altruism", '2026-10-21T00:00:00.000Z'),
      forumPost('qLDrntnGpwgMj5wLD', 'a-playbook-for-new-ea-groups', 'A Playbook for New EA Groups', '2025-11-28T23:22:21.449Z'),
      forumPost('dnbpKkjnw3v6JkaDa', 'alcohol-is-so-bad-for-society-that-you-should-probably-stop', 'Alcohol is so bad for society that you should probably stop drinking', '2025-06-02T00:00:00.000Z'),
    ]);

    const { fetchEAForumPosts } = await import('../eaforum');
    const posts = await fetchEAForumPosts();

    expect(posts.map(post => post.slug)).toEqual(['a-playbook-for-new-ea-groups']);
  });
});
