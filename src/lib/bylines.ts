// The one bylines registry: writing published in other outlets. An entry
// here is dated into the /writing cover grid (tagged with its publication,
// filterable under Source), the homepage Recent list, and the site search,
// each linking out to the publisher — the site never mirrors the text.

export interface Byline {
  title: string;
  publication: string;
  /** Calendar date as published, "YYYY-MM-DD" (Eastern). */
  date: string;
  url: string;
  /** Topic filter category, by the names in categoryConfigs. */
  category: string;
  /** The publisher's art for the piece, hotlinked like the Substack covers. */
  cover?: string;
}

export const bylines: Byline[] = [
  {
    title: 'The data-center debate is divorced from the facts',
    publication: 'The Atlantic',
    date: '2026-09-19',
    url: 'https://www.theatlantic.com/ideas/2026/09/data-center-facts-effects/688670/',
    category: 'AI & the Environment',
    cover: 'https://cdn.theatlantic.com/thumbor/s5oOqPmkG5mSe2GkuMoROmN6F9Q=/0x0:2880x1620/1600x900/media/img/mt/2026/09/2026_09_15_AI_data_center_debate/original.jpg',
  },
];

/**
 * A byline's date as a Date, for sorting against post dates. Eastern noon
 * on the calendar day — `new Date("2026-09-19")` would be UTC midnight,
 * the previous evening in Eastern time.
 */
export function bylineDate(byline: Byline): Date {
  const [y, m, d] = byline.date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 16));
}

/** Filter value for a publication, e.g. "The Atlantic" -> "the-atlantic". */
export function getPublicationSlug(publication: string): string {
  return publication.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
