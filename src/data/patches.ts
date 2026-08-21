// Committed editorial patches to imported post bodies, keyed by slug and
// applied at the top of the transform layer (before heading normalization,
// so an inserted <h1> section rides the same demotion ladder as Substack's
// native sections). The upstream copy on Substack is the source of truth;
// these are the site's own editorial pass from the Aug 2026 typography
// audit — real section headings for the long headerless essays, scaffold
// headings ("Intro", "Conclusion") retired, bold-paragraph pseudo-headings
// promoted, one cryptic footnote spelled out.
//
// Each patch is an exact-string find → replace against the RAW cached HTML.
// A patch that no longer matches (the post was edited upstream) is a
// console.warn at build time, never an error: the post ships unpatched and
// the warning names what to re-anchor.

export interface ContentPatch {
  find: string;
  replace: string;
  note: string;
}

export const contentPatches: Record<string, ContentPatch[]> = {
  // 21-minute essay with no section breaks: four <h1> sections at the
  // essay's own seams (demoted to h2 with the rest of the ladder).
  'toward-environmental-liberalism': [
    {
      find: '<p>Underlying wild comparisons like these',
      replace: '<h1>Illiberal environmentalism</h1><p>Underlying wild comparisons like these',
      note: 'section heading: naming the philosophy',
    },
    {
      find: '<p>I always start with religious freedom',
      replace: '<h1>What climate claims should leave alone</h1><p>I always start with religious freedom',
      note: 'section heading: religion, contested ethics, rival tastes',
    },
    {
      find: '<p>How then should we make moral claims about the climate?',
      replace: '<h1>How to make moral claims about the climate</h1><p>How then should we make moral claims about the climate?',
      note: 'section heading: the positive program',
    },
    {
      find: '<p>My simple application of liberal environmentalism to AI',
      replace: '<h1>Applying this to AI</h1><p>My simple application of liberal environmentalism to AI',
      note: 'section heading: the AI application',
    },
  ],

  // 12-minute essay, also headerless: three sections.
  'other-large-industries-show-how-impoverished': [
    {
      find: '<p>I’m worried that if we reported on and thought about Gwangyang',
      replace: '<h1>If we covered steel the way we cover data centers</h1><p>I’m worried that if we reported on and thought about Gwangyang',
      note: 'section heading: the thought experiment',
    },
    {
      find: '<p>A lot of writing about data centers seems to imply',
      replace: '<h1>What this says about the data center debate</h1><p>A lot of writing about data centers seems to imply',
      note: 'section heading: the lesson',
    },
    {
      find: '<p>If I tried to write rules for which new industries',
      replace: '<h1>Rules for new industries in the energy transition</h1><p>If I tried to write rules for which new industries',
      note: 'section heading: the rules',
    },
  ],

  // Bold-paragraph pseudo-headings promoted to real (sub-scale) headings:
  // they gain anchors, TOC entries, and the heading ladder's spacing.
  'ai-art-as-curation': [
    {
      find: '<p><strong>Some Massachusetts triple decker art:</strong></p>',
      replace: '<h3>Some Massachusetts triple decker art</h3>',
      note: 'pseudo-heading → h3',
    },
    {
      find: '<p><strong>Nostalgic photographs:</strong></p>',
      replace: '<h3>Nostalgic photographs</h3>',
      note: 'pseudo-heading → h3',
    },
    {
      find: '<p><strong>Geodesic domes:</strong></p>',
      replace: '<h3>Geodesic domes</h3>',
      note: 'pseudo-heading → h3',
    },
  ],

  // Scaffold headings: "Intro" above the first paragraph says nothing;
  // "Conclusion" gets a title with content in it.
  'empire-of-ai-is-wildly-misleading': [
    {
      find: '<h1>Intro</h1>',
      replace: '',
      note: 'drop the redundant Intro heading',
    },
    {
      find: '<h1>Conclusion</h1>',
      replace: '<h1>Where this leaves the book</h1>',
      note: 'Conclusion → substantive title',
    },
  ],

  'im-very-skeptical-that-china-has': [
    {
      find: '<h1>Conclusion</h1>',
      replace: '<h1>Where the evidence leaves me</h1>',
      note: 'Conclusion → substantive title',
    },
  ],

  // Footnote 2 read, in full, "Top of page 3" — an import remnant.
  'the-ai-water-issue-is-fake': [
    {
      find: '<div class="footnote-content"><p>Top of page 3</p></div>',
      replace: '<div class="footnote-content"><p>See the top of page 3 of the linked paper.</p></div>',
      note: 'spell out the cryptic footnote',
    },
  ],
};

/** Apply the committed patches for a slug; warn (never throw) on drift. */
export function applyContentPatches(html: string, slug: string): string {
  const patches = contentPatches[slug];
  if (!patches) return html;
  let out = html;
  for (const patch of patches) {
    if (out.includes(patch.find)) {
      out = out.replace(patch.find, patch.replace);
    } else if (patch.replace && out.includes(patch.replace)) {
      // Already applied upstream (or the post now carries the fix itself).
      continue;
    } else {
      console.warn(`[patches] ${slug}: no match for "${patch.note}" — post edited upstream? Re-anchor in src/data/patches.ts`);
    }
  }
  return out;
}
