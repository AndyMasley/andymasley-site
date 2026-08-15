// Hand-curated corrections map: essay slug → ledger entries on
// /writing/errors-and-updates. Curated by hand so no essay is ever stamped
// falsely — add an entry here only when the post body was actually edited
// and the ledger documents it. The essay page renders the newest entry as
// a quiet meta-line stamp and emits dateModified in the Article schema.
// Anchors reference the dated ids on the errors page (#e-… errors, #u-…
// updates).

export interface CorrectionEntry {
  /** ISO date the post was corrected or updated (YYYY-MM-DD). */
  date: string;
  /** Anchor id of the entry on /writing/errors-and-updates. */
  anchor: string;
  kind: 'correction' | 'update';
  /** One plain sentence fragment; shown nowhere yet, kept for the record. */
  summary: string;
}

export const corrections: Record<string, CorrectionEntry[]> = {
  'alcohol-is-so-bad-for-society-that': [
    {
      date: '2026-04-03',
      anchor: 'e-2026-04-03-alcohol',
      kind: 'correction',
      summary:
        'replaced a missourced COVID disease-burden figure with the GBD 2021 number; the comparison flipped, the core claim stands',
    },
  ],
  'the-ai-water-issue-is-fake': [
    {
      date: '2026-04-04',
      anchor: 'u-2026-04-04-water-prices',
      kind: 'update',
      summary: 'added the Newton County, Georgia counterexample on water prices',
    },
  ],
  'more-perfect-union-is-deceptive': [
    {
      date: '2026-04-04',
      anchor: 'u-2026-04-04-water-prices',
      kind: 'update',
      summary: 'added the Newton County, Georgia counterexample on water prices',
    },
  ],
};

/** Newest entry for a slug, or undefined. */
export function latestCorrection(slug: string): CorrectionEntry | undefined {
  const entries = corrections[slug];
  if (!entries || entries.length === 0) return undefined;
  return [...entries].sort((a, b) => b.date.localeCompare(a.date))[0];
}
