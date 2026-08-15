// Hand-written alt text for essay figures, keyed by slug + the stable S3
// UUID embedded in every Substack CDN URL (e.g. "a6f9ca94-41c4-4951-…").
// UUID keys survive upstream edits: if a post is reordered or a figure is
// swapped on Substack and the cache refreshes, an index-keyed description
// would silently attach to the wrong chart; a UUID key either matches its
// exact image or is reported by the build lint as vanished.
//
// The writing itself is content work scoped to argument-bearing figures,
// done with Andy approving each chart description for accuracy — this file
// is the scaffold that makes that work durable.

export const altText: Record<string, Record<string, string>> = {
  // '<slug>': {
  //   '<s3-uuid>': 'One-sentence description of what the chart shows.',
  // },
};

/** Look up alt text for an image URL within a post. */
export function altFor(slug: string, imageUrl: string): string | undefined {
  const bySlug = altText[slug];
  if (!bySlug) return undefined;
  const uuid = imageUrl.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i)?.[1];
  return uuid ? bySlug[uuid.toLowerCase()] : undefined;
}

/** UUIDs keyed for a slug that no longer appear in its HTML (for the lint). */
export function vanishedUuids(slug: string, html: string): string[] {
  const bySlug = altText[slug];
  if (!bySlug) return [];
  const lower = html.toLowerCase();
  return Object.keys(bySlug).filter(uuid => !lower.includes(uuid.toLowerCase()));
}
