import { describe, it, expect } from 'vitest';
import { processPostContent } from '../substack';

// Substack's in-post subscribe widgets and buttons never reach the site:
// the subscribe box at the end of each essay is the one subscription ask.
// (An in-post form shipped briefly in Aug 2026 and came back out.)

const WIDGET = `<p>Before.</p><div class="subscription-widget-wrap-editor" data-attrs="{&quot;url&quot;:&quot;https://blog.andymasley.com/subscribe?&quot;,&quot;text&quot;:&quot;Subscribe&quot;,&quot;language&quot;:&quot;en&quot;}" data-component-name="SubscribeWidgetToDOM"><div class="subscription-widget show-subscribe"><div class="preamble"><p class="cta-caption">Subscribe for more!</p></div><form class="subscription-widget-subscribe"><input type="email" class="email-input" name="email" placeholder="Type your email…" tabindex="-1"><input type="submit" class="button primary" value="Subscribe"><div class="fake-input-wrapper"><div class="fake-input"></div><div class="fake-button"></div></div></form></div></div><p>After.</p>`;

const BUTTON = `<p>Before.</p><p class="button-wrapper" data-attrs="{&quot;url&quot;:&quot;https://blog.andymasley.com/subscribe?&quot;,&quot;text&quot;:&quot;Subscribe now&quot;,&quot;action&quot;:null,&quot;class&quot;:null}" data-component-name="ButtonCreateButton"><a class="button primary" href="https://blog.andymasley.com/subscribe?"><span>Subscribe now</span></a></p><p>After.</p>`;

const SHARE_BUTTON = `<p>Before.</p><p class="button-wrapper" data-attrs="{&quot;url&quot;:&quot;https://blog.andymasley.com/p/x?action=share&quot;,&quot;text&quot;:&quot;Share&quot;,&quot;action&quot;:null,&quot;class&quot;:null}" data-component-name="ButtonCreateButton"><a class="button primary" href="https://blog.andymasley.com/p/x?action=share"><span>Share</span></a></p><p>After.</p>`;

describe('in-post subscribe stripping', () => {
  it('drops the email widget whole, keeping the prose around it', () => {
    const out = processPostContent(WIDGET, 'some-post');
    expect(out).not.toContain('subscription-widget');
    expect(out).not.toContain('Subscribe for more!');
    expect(out).not.toContain('fake-input');
    expect(out).not.toContain('post-subscribe');
    expect(out).toContain('Before.');
    expect(out).toContain('After.');
  });

  it('drops a "Subscribe now" button', () => {
    const out = processPostContent(BUTTON, 'some-post');
    expect(out).not.toContain('button-wrapper');
    expect(out).not.toContain('Subscribe now');
    expect(out).not.toContain('post-subscribe');
    expect(out).toContain('Before.');
    expect(out).toContain('After.');
  });

  it('drops share and other buttons too', () => {
    const out = processPostContent(SHARE_BUTTON, 'some-post');
    expect(out).not.toContain('button-wrapper');
    expect(out).toContain('Before.');
    expect(out).toContain('After.');
  });
});
