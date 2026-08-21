import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { processPostContent } from '../substack';
import { processEAForumContent } from '../eaforum';

// THE HARD RULE (see CLAUDE.md, "Post content is inviolable"): the transform
// layer may change markup, never what a post says. This suite pins the rule
// mechanically: for every cached post, the words of the processed output
// must appear, in order, in the words of the raw upstream copy. The
// grandfathered quote smartener doesn't move words; deletions are allowed
// (subscription widgets and similar chrome are stripped by design); but any
// transform or per-post patch that ADDS or REWRITES a word of body text
// fails here, and with it the build workflow.
//
// Do not weaken, exempt, or delete this test to make a change pass. If Andy
// himself dictates a specific wording fix (the only sanctioned exception),
// record it in ALLOWED_INSERTIONS below with his words, keyed by slug.

const ALLOWED_INSERTIONS: Record<string, string[]> = {};

const ROOT = join(__dirname, '..', '..', '..');
const SUBSTACK_DIR = join(ROOT, '.cache', 'substack', 'content');
const EAFORUM_DIR = join(ROOT, '.cache', 'eaforum', 'content');

// Words of the rendered text: figcaptions are excluded (the embed
// replacement pass inserts a "Source" caption by design), then tags are
// stripped and alphanumeric runs compared. Case-sensitive on purpose —
// recasing a word is rewriting it.
function words(html: string): string[] {
  const text = html
    .replace(/<figcaption[\s\S]*?<\/figcaption>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');
  return text.match(/[A-Za-z0-9À-ɏ]+/g) || [];
}

// First output word that cannot be matched, in order, against the input —
// i.e. the first inserted or rewritten word. Deletions never trip this.
function firstInsertion(
  input: string[],
  output: string[],
  allowed: Set<string>
): { word: string; context: string } | null {
  let i = 0;
  for (let o = 0; o < output.length; o++) {
    if (allowed.has(output[o])) continue;
    let j = i;
    while (j < input.length && input[j] !== output[o]) j++;
    if (j === input.length) {
      const context = output.slice(Math.max(0, o - 10), o + 10).join(' ');
      return { word: output[o], context };
    }
    i = j + 1;
  }
  return null;
}

function checkDir(
  dir: string,
  process_: (html: string, slug: string) => string
): string[] {
  const failures: string[] = [];
  if (!existsSync(dir)) return failures;
  for (const file of readdirSync(dir).filter(f => f.endsWith('.html'))) {
    const slug = basename(file, '.html');
    const raw = readFileSync(join(dir, file), 'utf-8');
    const out = process_(raw, slug);
    const hit = firstInsertion(
      words(raw),
      words(out),
      new Set(ALLOWED_INSERTIONS[slug] || [])
    );
    if (hit) {
      failures.push(`${slug}: inserted/rewritten word "${hit.word}" (…${hit.context}…)`);
    }
  }
  return failures;
}

describe('post content is inviolable', () => {
  it('the Substack pipeline never adds or rewrites a word of any post', () => {
    const failures = checkDir(SUBSTACK_DIR, (html, slug) =>
      processPostContent(html, slug, { sidenotes: false })
    );
    expect(failures, failures.join('\n')).toEqual([]);
  });

  it('the EA Forum pipeline never adds or rewrites a word of any post', () => {
    const failures = checkDir(EAFORUM_DIR, (html, slug) =>
      processEAForumContent(html, slug)
    );
    expect(failures, failures.join('\n')).toEqual([]);
  });
});
