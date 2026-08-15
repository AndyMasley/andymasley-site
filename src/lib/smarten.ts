// A conservative smartener: build-time only, never mutates the committed
// cache. Rules by enumeration, not cleverness:
//   - straight apostrophes → U+2019
//   - paired straight doubles within one text node → “ ”
//   - opening straight single after whitespace/open punctuation → U+2018
// Anything not provably safe stays straight. Code, pre, kbd, samp, script,
// style, and textarea contents are never touched.

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
