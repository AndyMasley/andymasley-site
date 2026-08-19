// Static replacements for third-party embeds that don't render on this
// site, keyed by slug + the embed's stable UUID from its data-attrs blob
// (same convention as alt-text.ts and figures.ts). The raw cache keeps
// Substack's original embed markup; the build swaps in the committed
// figure, so a cache refresh can never undo the fix.

export interface EmbedReplacement {
  /** Site-relative path of the committed image under public/. */
  src: string;
  /** Full description of the chart — this is an argument-bearing figure. */
  alt: string;
  /** Where the figure's Source link points (the original interactive). */
  href: string;
}

export const embedReplacements: Record<string, Record<string, EmbedReplacement>> = {
  'other-large-industries-show-how-impoverished': {
    // Substack code embed of the OWID chart fails to render off-platform.
    'f99af0a5-61ce-47eb-8b53-bfdb40b0aca1': {
      src: '/img/embeds/us-primary-energy-1965-2025.png',
      alt: 'Line chart of US primary energy use from 1965 to 2025, measured in terawatt-hours of total energy supply. Use climbs steadily from about 14,000 TWh in 1965 to a peak near 27,000 TWh in the mid-2000s, then stays roughly flat between 24,000 and 26,500 TWh through 2025.',
      href: 'https://ourworldindata.org/grapher/primary-energy-cons?tab=line&time=1965..2025&country=~USA',
    },
  },
};

/** Look up a committed replacement for an embed UUID within a post. */
export function replacementFor(slug: string, uuid: string): EmbedReplacement | undefined {
  return embedReplacements[slug]?.[uuid.toLowerCase()];
}
