// Committed editorial patches to imported post bodies, keyed by slug and
// applied at the top of the transform layer (before heading normalization,
// so an inserted <h1> section would ride the same demotion ladder as
// Substack's native sections). The upstream copy on Substack is the source
// of truth; a patch here changes only how this site renders it.
//
// Empty by standing decision (Andy, Aug 2026): the typography audit's
// editorial patches — inserted section headings, promoted pseudo-headings,
// retitled "Intro"/"Conclusion" scaffolds, a reworded footnote — were
// reverted; posts render with exactly the structure and words they carry
// on Substack. The mechanism stays for one-off fixes that can't happen
// upstream. Each patch is an exact-string find → replace against the RAW
// cached HTML. A patch that no longer matches (the post was edited
// upstream) is a console.warn at build time, never an error.

export interface ContentPatch {
  find: string;
  replace: string;
  note: string;
}

export const contentPatches: Record<string, ContentPatch[]> = {};

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
