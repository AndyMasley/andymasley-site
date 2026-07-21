// Section, list, and visual pages that get a build-time OG card at
// /og/page/<id>.png. Titles must match each page's <Base title> verbatim.
// Pages with bespoke cards (visuals/water, visuals/ai-prompt-footprint) are
// intentionally absent.
export const ogPages: Record<string, string> = {
  writing: 'Writing',
  physics: 'IB physics',
  lists: 'Lists',
  visuals: 'Visuals',
  appearances: 'Appearances',
  contact: 'Contact',
  notes: 'Notes',
  tags: 'Tags',
  'favorite-things': 'Favorite things',
  'dc-vegan-dining': 'Great DC restaurants for vegans',
  'dc-vegan-restaurants': 'Good DC restaurants for vegans',
  'product-recommendations': 'Product recommendations',
  'carbon-footprint': 'Carbon Footprint Calculator',
  'factory-farmed-chickens': 'Factory-farmed chickens',
};
