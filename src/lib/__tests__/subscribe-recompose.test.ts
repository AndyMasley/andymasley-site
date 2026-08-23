import { describe, it, expect } from 'vitest';
import { processPostContent, recomposeSubscribe } from '../substack';
import { stripContentsSection, extractHeadingsFromHtml } from '../extract-headings';

// Substack's in-post subscribe widgets and "Subscribe now" buttons become
// the site's own subscribe form in the same places; other buttons (share,
// comment) are still dropped.

const WIDGET = `<p>Before.</p><div class="subscription-widget-wrap-editor" data-attrs="{&quot;url&quot;:&quot;https://blog.andymasley.com/subscribe?&quot;,&quot;text&quot;:&quot;Subscribe&quot;,&quot;language&quot;:&quot;en&quot;}" data-component-name="SubscribeWidgetToDOM"><div class="subscription-widget show-subscribe"><div class="preamble"><p class="cta-caption">Subscribe for more!</p></div><form class="subscription-widget-subscribe"><input type="email" class="email-input" name="email" placeholder="Type your email…" tabindex="-1"><input type="submit" class="button primary" value="Subscribe"><div class="fake-input-wrapper"><div class="fake-input"></div><div class="fake-button"></div></div></form></div></div><p>After.</p>`;

const BUTTON = `<p>Before.</p><p class="button-wrapper" data-attrs="{&quot;url&quot;:&quot;https://blog.andymasley.com/subscribe?&quot;,&quot;text&quot;:&quot;Subscribe now&quot;,&quot;action&quot;:null,&quot;class&quot;:null}" data-component-name="ButtonCreateButton"><a class="button primary" href="https://blog.andymasley.com/subscribe?"><span>Subscribe now</span></a></p><p>After.</p>`;

const SHARE_BUTTON = `<p>Before.</p><p class="button-wrapper" data-attrs="{&quot;url&quot;:&quot;https://blog.andymasley.com/p/x?action=share&quot;,&quot;text&quot;:&quot;Share&quot;,&quot;action&quot;:null,&quot;class&quot;:null}" data-component-name="ButtonCreateButton"><a class="button primary" href="https://blog.andymasley.com/p/x?action=share"><span>Share</span></a></p><p>After.</p>`;

describe('in-post subscribe recomposition', () => {
  it('turns the email widget into the site form, keeping its caption', () => {
    const out = processPostContent(WIDGET, 'some-post');
    expect(out).toContain('<form class="post-subscribe"');
    expect(out).toContain('andymasley.substack.com/api/v1/free?nojs=true');
    expect(out).toContain('<p class="post-subscribe__caption">Subscribe for more!</p>');
    expect(out).toContain('value="Subscribe to my Substack"');
    expect(out).not.toContain('subscription-widget');
    expect(out).not.toContain('fake-input');
    expect(out).toContain('Before.');
    expect(out).toContain('After.');
  });

  it('turns a "Subscribe now" button into the site form, same label', () => {
    const out = processPostContent(BUTTON, 'some-post');
    expect(out).toContain('<form class="post-subscribe"');
    expect(out).toContain('value="Subscribe to my Substack"');
    expect(out).not.toContain('button-wrapper');
    expect(out).not.toContain('post-subscribe__caption');
  });

  it('still drops buttons that are not about subscribing', () => {
    const out = processPostContent(SHARE_BUTTON, 'some-post');
    expect(out).not.toContain('post-subscribe');
    expect(out).not.toContain('button-wrapper');
    expect(out).toContain('Before.');
    expect(out).toContain('After.');
  });

  it('leaves an empty-caption widget with no caption element', () => {
    const out = recomposeSubscribe(WIDGET.replace('Subscribe for more!', ''));
    expect(out).toContain('<form class="post-subscribe"');
    expect(out).not.toContain('post-subscribe__caption');
  });

  it('keeps a form placed inside the stripped Contents section', () => {
    // The fitness posts put a subscribe button right after the inline TOC;
    // the TOC is stripped (the site draws its own rail) but the form stays.
    const html =
      '<p>Intro.</p><h2>Contents</h2><ul><li><p><a href="#a">A</a></p></li></ul>' +
      '<form class="post-subscribe" action="x" method="post"><div class="post-subscribe__row"></div></form>' +
      '<h2>A</h2><p>Body.</p>';
    const out = stripContentsSection(html);
    expect(out).not.toContain('<h2>Contents</h2>');
    expect(out).not.toContain('href="#a"');
    expect(out).toContain('<form class="post-subscribe"');
    expect(out.indexOf('post-subscribe')).toBeLessThan(out.indexOf('<h2>A</h2>'));
  });

  it('decodes entities in TOC labels without changing generated ids', () => {
    const html = '<h1 id="mindset-motivation">Mindset &amp; motivation</h1><p>x</p><h1>Q &amp; A</h1><p>y</p>';
    const { headings } = extractHeadingsFromHtml(html);
    expect(headings.map(h => h.text)).toEqual(['Mindset & motivation', 'Q & A']);
    expect(headings[0].id).toBe('mindset-motivation');
    expect(headings[1].id).toBe('q-amp-a');
  });
});
