// A conservative smartener: build-time only, never mutates the committed
// cache. Rules by enumeration, not cleverness:
//   - straight apostrophes → U+2019
//   - paired straight doubles within one text node → “ ”
//   - opening straight single after whitespace/open punctuation → U+2018
//   - dashes normalized to the house convention (see normalizeDashesText)
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

// House dash convention (the audit's call, Aug 2026): the unspaced em dash
// for a dash in prose, everywhere — the corpus mixed " — ", "—", " – ", and
// " - " post to post and sometimes inside one post. Rules by enumeration:
//   - a spaced em dash between words tightens: "year — enough" → "year—enough"
//   - a spaced en dash between words was a dash, not a range: → "—"
//   - a spaced hyphen between LETTERS was a dash: "issue - and" → "issue—and";
//     digit neighbors are left alone (minus signs, scores, ranges)
// All three require visible ink on both sides within the same text node, so a
// node-initial " — " (the term–description separator placed after a closing
// tag, below) is never re-tightened — the pass stays idempotent.
const DASH_BEFORE = '[A-Za-zÀ-ÖØ-öø-ÿ”’"\')\\]%]';
const DASH_AFTER = '[A-Za-zÀ-ÖØ-öø-ÿ“‘"\'(\\[]';
const SPACED_EM = /(?<=\S) +— +(?=\S)/g;
const SPACED_EN = /(?<=\S) +– +(?=\S)/g;
const SPACED_HYPHEN = new RegExp(`(?<=${DASH_BEFORE}) +- +(?=${DASH_AFTER})`, 'g');

export function normalizeDashesText(text: string): string {
  if (!/[—–-]/.test(text)) return text;
  let out = text;
  out = out.replace(SPACED_EM, '—');
  out = out.replace(SPACED_EN, '—');
  out = out.replace(SPACED_HYPHEN, '—');
  return out;
}

const SKIP_TAGS = new Set(['code', 'pre', 'kbd', 'samp', 'script', 'style', 'textarea']);

// Whitespace (and stranded separator dashes) that leaked inside inline tags
// during import move back outside the tag: a link's underline starts on its
// first letter instead of a leading space; "<strong>Chest - </strong>" and
// "<strong><a>Tsehay</a> -</strong>" become "<strong>…</strong> - " so the
// separator pass below can see the dash. Whitespace-only formatting tags
// (Substack's "<strong> </strong>" fragments) unwrap to their whitespace.
// Anchors are handled most conservatively: only whitespace moves, never a
// dash, and a whitespace-only anchor is left alone.
export function tidyInlineTagBoundaries(html: string): string {
  let out = html;
  for (const tag of ['a', 'strong', 'b', 'em', 'i']) {
    const re = new RegExp(`<${tag}\\b([^>]*)>([\\s\\S]*?)<\\/${tag}>`, 'gi');
    out = out.replace(re, (whole, attrs, inner) => {
      if (!inner.trim()) {
        return tag === 'a' ? whole : inner;
      }
      const lead = inner.match(/^\s+/)?.[0] ?? '';
      let core = inner.slice(lead.length);
      let suffix = '';
      const dashTrail = tag !== 'a' ? core.match(/ +[-–] *$/) : null;
      if (dashTrail) {
        core = core.slice(0, core.length - dashTrail[0].length);
        suffix = ' - ';
      } else {
        const trail = core.match(/\s+$/)?.[0] ?? '';
        core = core.slice(0, core.length - trail.length);
        suffix = trail;
      }
      if (!lead && !suffix) return whole;
      return `${lead}<${tag}${attrs}>${core}</${tag}>${suffix}`;
    });
  }
  return out;
}

// The "**Term** - description" bullet separator: a text node that opens with
// a spaced hyphen/en dash right after a closing inline tag. That hyphen is a
// dash by construction (Substack's list idiom), set as a SPACED em dash —
// "**Term** — description" — which reads better after a bold term than the
// tight prose dash. Already-converted nodes start " — " and don't match.
const CLOSING_INLINE = /^<\/?(strong|b|em|i|a|s|u|span)\b/i;
const LEADING_SEPARATOR = /^ ?[-–] +/;

/** Smarten quotes and normalize dashes in the text nodes of an HTML string,
    skipping code-like tags. */
export function smartenHtmlText(html: string): string {
  const parts = html.split(/(<[^>]+>)/);
  let skipDepth = 0;
  let lastTag = '';
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (!part) continue;
    if (part.startsWith('<')) {
      const m = part.match(/^<(\/?)([a-zA-Z][a-zA-Z0-9-]*)/);
      if (m && SKIP_TAGS.has(m[2].toLowerCase()) && !part.endsWith('/>')) {
        skipDepth += m[1] === '/' ? -1 : 1;
        if (skipDepth < 0) skipDepth = 0;
      }
      lastTag = part;
      continue;
    }
    if (skipDepth > 0) continue;
    let text = part;
    if (CLOSING_INLINE.test(lastTag)) {
      text = text.replace(LEADING_SEPARATOR, ' — ');
    }
    parts[i] = normalizeDashesText(smartenText(text));
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
  return normalizeDashesText(smartenText(text.replace(/\s+/g, ' ').trim()));
}
