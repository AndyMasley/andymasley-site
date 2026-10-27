// The one games registry. The hub (/games), the search index (search.json)
// and the sitemap all read this list. Each game is a self-contained page
// under public/games/<slug>/, built in its own project and copied in.

export interface GameEntry {
  title: string;
  href: string;
  /** One line for the hub, search results and descriptions. */
  description: string;
  /** Extra search terms beyond title + description. */
  searchTerms?: string;
}

export const games: GameEntry[] = [
  {
    title: 'Second Summer',
    href: '/games/second-summer/',
    description:
      'A gentle city-builder in a valley in the pines, where goods float down water channels and the town grows over seven chapters.',
    searchTerms:
      'game city builder town valley hexes channels flumes river mountains seasons chapters arcology sky ship play browser phone',
  },
];
