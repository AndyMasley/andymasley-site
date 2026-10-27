// The one games registry. The hub (/games), the search index (search.json)
// and the sitemap all read this list. A game is either a self-contained page
// under public/games/<slug>/, built in its own project and copied in, or a
// page of the site itself (astro names its source, for the search index).

export interface GameEntry {
  title: string;
  href: string;
  /** One line for search results and descriptions. */
  description: string;
  /** Extra search terms beyond title + description. */
  searchTerms?: string;
  /** The page's .astro source under src/pages, when it is one of the site's own pages. */
  astro?: string;
}

export const games: GameEntry[] = [
  {
    title: 'Out of True',
    href: '/games/out-of-true/',
    description:
      'A walk through a watercolor valley of brutalist monuments and small solarpunk towns, piecing together what happened on Survey Night.',
    searchTerms:
      'game walking exploration mystery puzzles valley monuments brutalist spomenik concrete survey watercolor forest towns lake play browser',
  },
  {
    title: 'Second Summer',
    href: '/games/second-summer/',
    description:
      'A gentle city-builder in a valley in the pines, where goods float down water channels and the town grows over seven chapters.',
    searchTerms:
      'game city builder town valley hexes channels flumes river mountains seasons chapters arcology sky ship play browser phone',
  },
  {
    title: 'Drive through Webster',
    href: '/town',
    description: 'A late-summer drive through a reconstruction of Webster, Massachusetts.',
    searchTerms: 'town game driving car hometown roads Main Street lake New England',
    astro: 'town.astro',
  },
];
