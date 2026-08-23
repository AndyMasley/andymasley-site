import { describe, it, expect } from 'vitest';
import { extractHeadingsFromHtml } from '../extract-headings';

describe('TOC heading extraction', () => {
  it('decodes entities in TOC labels without changing generated ids', () => {
    const html = '<h1 id="mindset-motivation">Mindset &amp; motivation</h1><p>x</p><h1>Q &amp; A</h1><p>y</p>';
    const { headings } = extractHeadingsFromHtml(html);
    expect(headings.map(h => h.text)).toEqual(['Mindset & motivation', 'Q & A']);
    expect(headings[0].id).toBe('mindset-motivation');
    expect(headings[1].id).toBe('q-amp-a');
  });
});
