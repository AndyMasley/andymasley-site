// A conservative smartener: build-time only, never mutates the committed
// cache. Rules by enumeration, not cleverness:
//   - straight apostrophes → U+2019
//   - paired straight doubles within one text node → “ ”
//   - opening straight single after whitespace/open punctuation → U+2018
// Anything not provably safe stays straight. Code, pre, kbd, samp, script,
// style, and textarea contents are never touched.
//
// Nothing here rewrites punctuation beyond the quote/apostrophe glyphs
// above — dashes and everything else render exactly as typed (Andy's call,
// Aug 2026; see CLAUDE.md "Post content is inviolable").

const OPENERS = '([{—–"“‘';

export function smartenText(text: string): string {
  if (!/['"]/.test(text)) return text;
  let out = text;
  // Paired doubles first, while the pairing is still visible.
  out = out.replace(/"([^"]*)"/g, '“$1”');
  // Opening single: after start/whitespace/open punctuation, before a
  // non-space character.
  out = out.replace(
    new RegExp(`(^|[\\s${OPENERS.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}])'(?=\\S)`, 'g'),
    (_, before) => `${before}‘`
  );
  // Everything left is an apostrophe or a closing single.
  out = out.replace(/'/g, '’');
  return out;
}

const SKIP_TAGS = new Set(['code', 'pre', 'kbd', 'samp', 'script', 'style', 'textarea']);

// Whitespace that leaked inside inline tags during import moves back
// outside the tag, so a link's underline starts on its first letter instead
// of a leading space ("spend␣half their waking lives online"). Markup-only:
// the rendered characters are identical before and after — no punctuation
// or text is ever changed. Whitespace-only formatting tags (Substack's
// "<strong> </strong>" fragments) unwrap to their whitespace; a
// whitespace-only anchor is left alone.
export function tidyInlineTagBoundaries(html: string): string {
  let out = html;
  for (const tag of ['a', 'strong', 'b', 'em', 'i']) {
    const re = new RegExp(`<${tag}\\b([^>]*)>([\\s\\S]*?)<\\/${tag}>`, 'gi');
    out = out.replace(re, (whole, attrs, inner) => {
      if (!inner.trim()) {
        return tag === 'a' ? whole : inner;
      }
      const lead = inner.match(/^\s+/)?.[0] ?? '';
      const trail = inner.slice(lead.length).match(/\s+$/)?.[0] ?? '';
      if (!lead && !trail) return whole;
      const core = inner.slice(lead.length, inner.length - trail.length);
      return `${lead}<${tag}${attrs}>${core}</${tag}>${trail}`;
    });
  }
  return out;
}

/** Smarten only the text nodes of an HTML string, skipping code-like tags. */
export function smartenHtmlText(html: string): string {
  const parts = html.split(/(<[^>]+>)/);
  let skipDepth = 0;
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (!part) continue;
    if (part.startsWith('<')) {
      const m = part.match(/^<(\/?)([a-zA-Z][a-zA-Z0-9-]*)/);
      if (m && SKIP_TAGS.has(m[2].toLowerCase()) && !part.endsWith('/>')) {
        skipDepth += m[1] === '/' ? -1 : 1;
        if (skipDepth < 0) skipDepth = 0;
      }
      continue;
    }
    if (skipDepth > 0) continue;
    parts[i] = smartenText(part);
  }
  return parts.join('');
}

/**
 * Title/standfirst normalizer: collapse stray whitespace, then smarten.
 * Called at cache-read on BOTH paths — the live Substack fetch and the
 * committed posts.json fallback — because CI always takes the fallback
 * (Substack blocks CI IPs) and titles would otherwise pass through raw.
 */
export function normalizePlainText(text: string): string {
  return smartenText(text.replace(/\s+/g, ' ').trim());
}
