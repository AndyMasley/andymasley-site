// Placeholder lint for imported post content. Hard placeholders fail the
// build; soft phrases only warn. Lives in the transform layer so every build
// path that renders post content (post pages, RSS) is covered — including CI.
// The site carries a standing error bounty, so a TK escaping to production
// is real money.

const HARD_PLACEHOLDERS = [/\bTKTK\b/, /\bTK\b/, /\bTODO\b/];
const SOFT_PLACEHOLDERS = [/circle back/i, /will add later/i, /later today/i];

// Posts where a flagged phrase is legitimate content (e.g. quoting someone).
// Key by slug, value is the exact pattern source to allow.
const ALLOWLIST: Record<string, string[]> = {};

const warnedOnce = new Set<string>();

export function lintPostContent(html: string, slug: string): void {
  const text = html.replace(/<[^>]*>/g, ' ');
  const allowed = new Set(ALLOWLIST[slug] || []);

  for (const re of HARD_PLACEHOLDERS) {
    if (allowed.has(re.source)) continue;
    const match = text.match(re);
    if (match) {
      const i = text.search(re);
      const context = text.slice(Math.max(0, i - 70), i + 70).replace(/\s+/g, ' ').trim();
      throw new Error(
        `[content-lint] ${slug}: placeholder "${match[0]}" in post content ` +
        `(…${context}…). Fix the post on Substack, or allowlist the pattern ` +
        `for this slug in src/lib/content-lint.ts.`
      );
    }
  }

  for (const re of SOFT_PLACEHOLDERS) {
    if (allowed.has(re.source)) continue;
    const match = text.match(re);
    const key = `${slug}:${re.source}`;
    if (match && !warnedOnce.has(key)) {
      warnedOnce.add(key);
      const i = text.search(re);
      const context = text.slice(Math.max(0, i - 70), i + 70).replace(/\s+/g, ' ').trim();
      console.warn(`[content-lint] warn ${slug}: "${match[0]}" (…${context}…)`);
    }
  }
}
