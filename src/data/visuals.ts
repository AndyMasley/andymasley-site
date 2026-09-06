// The one visuals registry. The hub (/visuals), the search index
// (search.json), and the sitemap all import this list, so the three
// surfaces cannot drift — a visual absent here is absent everywhere,
// which is a visible bug rather than a silent one.

export interface VisualEntry {
  title: string;
  href: string;
  /** One line for search results and descriptions. */
  description: string;
  /** Extra search terms beyond title + description. */
  searchTerms?: string;
  /** Listed on the /visuals hub (default true). */
  onHub?: boolean;
}

export const visuals: VisualEntry[] = [
  {
    title: 'Traffic deaths & injuries',
    href: '/visuals/traffic-deaths',
    description: 'Human driving and autonomous vehicles: the 2026 US road toll, including animals and gaps in the data.',
    searchTerms: 'AV ADS Waymo robotaxi autonomous self driving cars traffic deaths injuries animals roadkill safety',
  },
  {
    title: 'Factory-farmed chickens',
    href: '/visuals/factory-farmed-chickens',
    description: 'Visualizing the scale of factory farming in the United States.',
    searchTerms: 'animal welfare broilers scale',
  },
  {
    title: 'Carbon footprint calculator',
    href: '/visuals/carbon-footprint',
    description: 'Interactive carbon footprint calculator with grid change comparisons.',
    searchTerms:
      'emissions CO2 climate change personal cuts grid energy nuclear solar coal transport diet food electricity EV electric vehicle heat pump vegan vegetarian flights',
  },
  {
    title: 'How thirsty is AI?',
    href: '/visuals/water',
    description: 'Every claim about AI and water use, drawn to scale.',
    searchTerms:
      'water use data centers gallons ChatGPT prompt evaporative cooling thermoelectric agriculture golf lawns comparison',
  },
  {
    title: 'What does your AI use cost?',
    href: '/visuals/ai-prompt-footprint',
    description: 'The energy and water footprint of AI prompts, in context.',
    searchTerms: 'prompt energy footprint electricity ChatGPT emissions',
  },
  {
    title: 'PM2.5 exposure by county',
    href: '/visuals/pm25-county-exposure',
    description: 'Fine-particle air pollution exposure across US counties.',
    searchTerms: 'air pollution particulate matter map counties exposure',
  },
  {
    title: 'Drive through Webster',
    href: '/town',
    description: 'A late-summer drive through a reconstruction of Webster, Massachusetts.',
    searchTerms: 'town game driving car hometown roads Main Street lake New England',
  },
  {
    title: 'US emissions vs. planetary boundaries',
    href: '/visuals/carbon-boundary-crosswalk',
    description: 'Crosswalk between US carbon emissions categories and planetary boundaries.',
    searchTerms: 'carbon emissions planetary boundaries crosswalk climate',
    onHub: false,
  },
  {
    title: 'Massachusetts in 3D',
    href: '/massachusetts-3d',
    description:
      'A navigable, to-scale 3D flythrough of Massachusetts — every building and hill, at real elevation.',
    searchTerms: 'map terrain satellite flythrough Webster',
    onHub: false,
  },
];

export const hubVisuals = visuals.filter(v => v.onHub !== false);
