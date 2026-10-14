// Opt-in list of essays that read on the site's wide measure
// (--max-width-wide, 1120px) instead of the standard 640px column. The whole
// page column widens with it (header, essay, footer), and the TOC rail is not
// hung at that width. Andy's call (Oct 2026): the six principles in "The
// direction I'd like for effective altruism" should fit in one screenshot.
// Remove a slug to put its essay back on the standard column.

export const wideMeasurePosts: string[] = [
  'the-direction-id-like-for-effective',
];

export function isWideMeasurePost(slug: string): boolean {
  return wideMeasurePosts.includes(slug);
}
