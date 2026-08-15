// Hand-curated series map for real multi-part sequences — posts whose
// titles carry "Part N". Seeded from the title strings themselves and kept
// deliberately conservative: a sequence joins this map only once more than
// one part exists (a lone "part 1" would render a series line pointing
// nowhere). hubSlug links the series name to an overview essay when one
// exists; otherwise the line is plain text.

export interface SeriesEntry {
  series: string;
  part: number;
  of: number;
  hubSlug?: string;
}

export const series: Record<string, SeriesEntry> = {
  'ai-and-folk-cartesianism-part-1-defining': {
    series: 'AI and folk Cartesianism',
    part: 1,
    of: 2,
  },
  'ai-and-folk-cartesianism-part-2-problems': {
    series: 'AI and folk Cartesianism',
    part: 2,
    of: 2,
  },
  'all-my-vegan-fitness-advice-part': {
    series: 'All my (vegan) fitness advice',
    part: 1,
    of: 3,
  },
  'all-my-vegan-fitness-advice-part-acf': {
    series: 'All my (vegan) fitness advice',
    part: 2,
    of: 3,
  },
  'all-my-vegan-fitness-advice-part-b55': {
    series: 'All my (vegan) fitness advice',
    part: 3,
    of: 3,
  },
};

export function getSeriesEntry(slug: string): SeriesEntry | undefined {
  return series[slug];
}

/** Slugs of the other parts of a series, in part order (excluding self). */
export function getSeriesSiblings(slug: string): { slug: string; part: number }[] {
  const entry = series[slug];
  if (!entry) return [];
  return Object.entries(series)
    .filter(([s, e]) => s !== slug && e.series === entry.series)
    .map(([s, e]) => ({ slug: s, part: e.part }))
    .sort((a, b) => a.part - b.part);
}
