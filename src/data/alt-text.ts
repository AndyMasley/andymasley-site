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

  // Every figure in the flagship water post, written against the rendered
  // images (Aug 2026). The two rebuilt comparison charts carry their alt in
  // src/data/figure-swaps.ts instead.
  'the-ai-water-issue-is-fake': {
    'a6f9ca94-41c4-4951-adbe-6f3b18ead783':
      'IFP chart by Brian Potter, source USGS: US thermal power plant water consumption by cooling system. Once-through plants use 1,430 Mgal/day consumptively and 126,570 non-consumptively; recirculating plants use 2,880 consumptively and 2,520 non-consumptively.',
    '35d98942-e2de-4a10-a877-f65df6517f4c':
      'Satellite map of Webster, Massachusetts, a town of about 16,000 people, with lakes and woods around a small street grid.',
    '1308685b-d4b0-4690-9e49-4dbb6a4d801c':
      'New York Times headline card over an aerial photo of a Meta data center campus: “Their Water Taps Ran Dry When Meta Built Next Door.”',
    '3a7215a4-09bc-4993-95db-27eda55ffed3':
      'Bar chart of water use in Maricopa County in billions of gallons per year: total county use about 777, golf courses about 29, data centers a thin sliver.',
    '33443c1f-1ecc-4d7b-9ef3-94171ba93c51':
      'Bar chart of tax revenue per gallon of water used in Maricopa County: data centers generate roughly 50 times more than golf courses.',
    'dd0e2a6b-7f40-4959-866a-d8854e902157':
      'Bar chart of annual tax revenue in millions of dollars: data centers about 860, golf courses about 520.',
    '6a14f7f9-a808-4062-a9b9-dc6b2960f425':
      'Illustrated park map of Six Flags Hurricane Harbor Phoenix, with dozens of labeled water rides, pools, and food stands.',
    '5784fbf4-69f1-475b-8590-9dda4ab5985b':
      'Grid of 800,000 tiny dots grouped into rectangles of 10,000. Each dot is one chatbot prompt’s worth of water; together they represent the average American’s daily water use.',
    'd1fed9ba-7cab-4dd2-b3bd-a422361b5ec9':
      'Ruler graphic with a pin at 0.2 inches, labeled “0.2 inches on a ruler.”',
    '198bd980-edbb-49ce-bd4b-dcda9d1ff792':
      'Product photo of a 10-liter stainless steel stock pot on a stove.',
    '68f54c15-4f7d-4ccb-88dd-b46dbcc45232':
      'Product photo of a hand holding a 2 mL dropper bottle about 4.2 cm tall.',
    '5b15d30c-5a61-4f2d-8f10-a48b6a061ec4':
      'Bloomberg map of the US with red dots for data centers built or planned in high water-stress areas since 2022, with state counts including Virginia 67, Arizona 26, Texas 26, Illinois 23, and California 17.',
    '1e0c7a2e-3800-48b6-bf15-434f4d6a7d08':
      'Crop of the Bloomberg map showing a dense cluster of red squares around Washington DC and Northern Virginia.',
    'b3fc6957-c8fa-43ab-9de3-97b1007022ae':
      'Bloomberg line chart, “Global data centers in areas with high water-stress,” rising from near zero in 1995 to 3,300 in 2025.',
    '91cea131-0f1d-411a-97cc-0e10203a5c19':
      'The same Bloomberg chart annotated: a box over 1995–2022 labeled “This is just the rise of the internet,” and a line marking that there were no AI data centers before that point.',
    '5d6eab68-4ef4-46a3-bd5b-4008b43c2804':
      'Goldman Sachs stacked area chart of data center power demand from 2014 to a 2030 estimate, splitting US AI, US ex-AI, and rest-of-world demand; AI is a growing but minority share. Source: Masanet et al. (2020), Cisco, IEA, Goldman Sachs Research.',
    '0cb8c75f-f07f-40d2-93fa-52c2e234d3a6':
      'Crop of the Bloomberg map over Arizona: “26 data centers built or planned in high water-stress areas since 2022.”',
    '648a412c-b6bb-40bd-83de-3a88a331e9c8':
      'Bar chart in liters per kWh for two hypothetical data centers: Enki onsite 0.1, Poseidon onsite 2, Enki onsite plus offsite 4.1, Poseidon onsite plus offsite 6.',
    'a0d3cbf7-d406-4ba4-8573-db81a44ff1a3':
      'Bar chart comparing Enki’s small onsite water use with its 41-times-larger “secret, real water cost they’re not telling you about.”',
    'd30e2afe-3905-44c7-965b-825e2798603a':
      'Bar chart comparing Poseidon’s onsite water use with its roughly 3-times-larger “secret, real water cost they’re not telling you about.”',
    'c60ddcf5-06ce-44fd-970c-bc5d94f44cc0':
      'Tweet from More Perfect Union: a $165 billion data center campus in New Mexico would use 10 million gallons to fill and 7.2 million gallons per year ongoing.',
    'bb4bc4be-66dc-4a3c-be94-5f0f6c7b4488':
      'Oberlo chart of the largest internet companies by market cap: Amazon $2.10 trillion, Alphabet $2.09 trillion, Meta $1.45 trillion, then Tencent, Netflix, Alibaba, ServiceNow, Pinduoduo, Booking Holdings, and Uber.',
  },
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
