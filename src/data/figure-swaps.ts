// First-party re-renders of imported figures, keyed slug + the original
// image's S3 UUID — the same keying as alt-text.ts and embeds.ts. A swap
// replaces only the <img> source (the original URL is preserved as
// data-origin); the figure's caption, position, and every word around it
// are untouched, and the content-integrity suite holds that line.
//
// Current entries (Andy's call, Aug 2026): the water post's two comparison
// charts, re-rendered from Andy's own source sheet by
// scripts/gen-water-charts.mjs — the originals were Substack-era PNG
// screenshots with a stale watermark and axis text illegible at column
// width. Delete an entry to fall back to the original image.

export interface FigureSwap {
  /** Site-local replacement, e.g. /img/charts/foo.svg */
  src: string;
  alt: string;
  width: number;
  height: number;
}

const swaps: Record<string, Record<string, FigureSwap>> = {
  'the-ai-water-issue-is-fake': {
    '6e4896d1-bd3d-416e-8ae3-46c8f8809cb9': {
      src: '/img/charts/us-water-use-by-sector.svg',
      alt: 'Bar chart of daily US water use by sector in millions of gallons per day. Thermoelectric power, mining, and forest products each use around 4,000; data centers (onsite + offsite) use 250, and AI in data centers 11 — small slivers next to the other sectors and far below the 1,320 that is 1% of America’s daily consumptive freshwater withdrawals.',
      width: 720,
      height: 446,
    },
    'da86b8b3-7c28-48c2-83fa-6df503f252f2': {
      src: '/img/charts/us-irrigation-water-by-crop.svg',
      alt: 'Bar chart of daily US irrigation water use by crop in millions of gallons per day. Alfalfa, orchards, and corn each use around 10,000–11,000; dozens of individual crops use more than all data centers combined (250), and AI in data centers (11) is barely visible at this scale.',
      width: 720,
      height: 758,
    },
  },
};

export function figureSwapFor(slug: string, uuid: string): FigureSwap | undefined {
  return swaps[slug]?.[uuid.toLowerCase()];
}

/** UUID keys for a slug, for the vanished-figure build warning. */
export function figureSwapUuids(slug: string): string[] {
  return Object.keys(swaps[slug] || {});
}
