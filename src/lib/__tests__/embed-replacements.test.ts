import { describe, it, expect } from 'vitest';
import { processPostContent } from '../substack';

// The committed embed replacement (src/data/embeds.ts) swaps Substack code
// embeds that don't render off-platform for static figures at build time,
// keyed slug + embed UUID, leaving the raw cache untouched.

const SLUG = 'other-large-industries-show-how-impoverished';
const UUID = 'f99af0a5-61ce-47eb-8b53-bfdb40b0aca1';

function codeEmbedHtml(uuid: string): string {
  return `<p>Before.</p><div class="code-embed" data-attrs="{&quot;uuid&quot;:&quot;${uuid}&quot;,&quot;content_hash&quot;:&quot;abc&quot;,&quot;post_id&quot;:1,&quot;width&quot;:&quot;normal&quot;,&quot;caption&quot;:null,&quot;alt&quot;:null}" data-component-name="CodeEmbedToDOM"><iframe src="https://${uuid}.substackcode.com/api/v1/code-embeds/render/abc/def" sandbox="allow-scripts allow-same-origin" loading="lazy" frameborder="0" class="code-embed-iframe" style="width: 100%;"></iframe></div><p>After.</p>`;
}

describe('embed replacements', () => {
  it('replaces a keyed code embed with the committed static figure', () => {
    const out = processPostContent(codeEmbedHtml(UUID), SLUG);
    expect(out).not.toContain('substackcode.com');
    expect(out).not.toContain('code-embed');
    expect(out).toContain('/img/embeds/us-primary-energy-1965-2025.png');
    expect(out).toContain('captioned-image-container');
    expect(out).toContain('ourworldindata.org/grapher/primary-energy-cons');
    // Surrounding content survives the swap.
    expect(out).toContain('Before.');
    expect(out).toContain('After.');
  });

  it('leaves unkeyed code embeds untouched (still contained as embeds)', () => {
    const otherUuid = '00000000-1111-2222-3333-444444444444';
    const out = processPostContent(codeEmbedHtml(otherUuid), SLUG);
    expect(out).toContain('substackcode.com');
    expect(out).toContain('code-embed');
  });

  it('does not fire for the same UUID under a different slug', () => {
    const out = processPostContent(codeEmbedHtml(UUID), 'some-other-post');
    expect(out).toContain('substackcode.com');
  });
});
