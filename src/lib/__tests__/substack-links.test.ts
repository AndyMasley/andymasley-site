import { describe, it, expect } from 'vitest';
import { fixAnchorLinks } from '../substack';

const SLUG = 'empire-of-ai-is-wildly-misleading';

describe('fixAnchorLinks', () => {
  it('rewrites other posts to /writing/slug', () => {
    const html = '<a href="https://andymasley.substack.com/p/ai-and-the-environment">link</a>';
    expect(fixAnchorLinks(html, SLUG)).toContain('href="/writing/ai-and-the-environment"');
  });

  it('turns same-post anchors into local anchors', () => {
    const html = `<a href="https://andymasley.substack.com/p/${SLUG}#the-error">link</a>`;
    expect(fixAnchorLinks(html, SLUG)).toContain('href="#the-error"');
  });

  it('leaves comment permalinks pointing at Substack', () => {
    const url = `https://andymasley.substack.com/p/${SLUG}/comment/162811993`;
    const html = `<a href="${url}">Karen Hao's comment</a>`;
    expect(fixAnchorLinks(html, SLUG)).toContain(`href="${url}"`);
  });

  it('leaves comment permalinks with query strings and anchors alone', () => {
    const url = `https://andymasley.substack.com/p/${SLUG}/comment/162811993?utm_source=substack#comment-162811993`;
    const html = `<a href="${url}">comment</a>`;
    expect(fixAnchorLinks(html, SLUG)).toContain(`href="${url}"`);
  });

  it('leaves the comments index alone', () => {
    const url = `https://andymasley.substack.com/p/${SLUG}/comments`;
    expect(fixAnchorLinks(`<a href="${url}">comments</a>`, SLUG)).toContain(`href="${url}"`);
  });

  it('sends relative comment permalinks back to Substack', () => {
    const html = `<a href="/p/${SLUG}/comment/162811993">comment</a>`;
    expect(fixAnchorLinks(html, SLUG)).toContain(
      `href="https://andymasley.substack.com/p/${SLUG}/comment/162811993"`
    );
  });

  it('still handles relative post links', () => {
    const html = '<a href="/p/ai-and-the-environment">link</a>';
    expect(fixAnchorLinks(html, SLUG)).toContain('href="/writing/ai-and-the-environment"');
  });
});
