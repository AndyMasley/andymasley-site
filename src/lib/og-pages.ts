// Section, list, and visual pages that get a build-time OG card at
// /og/page/<id>.png. Each card shows the page title beside a panel that
// represents the page: a screenshot of it (src/assets/og/<id>.png, captured
// from the built site; see renderOgCard), or for the lists index, its entries.
// Titles match each page's <Base title> (or its h1 where the <Base title> is
// a longer tab title). The homepage card is its own layout (renderHomeOgCard).
// Pages with bespoke cards (visuals/ai-prompt-footprint) are intentionally
// absent.
import type { CardPanel } from './og-card';

export interface OgPage {
  title: string;
  panel?: CardPanel;
}

const shot = (id: string): CardPanel => ({ image: id });

export const ogPages: Record<string, OgPage> = {
  home: { title: 'Andy Masley' },
  writing: { title: 'Writing', panel: shot('writing') },
  'errors-and-updates': { title: 'Errors and updates', panel: shot('errors-and-updates') },
  physics: { title: 'IB physics', panel: shot('physics') },
  lists: {
    title: 'Lists',
    panel: { lines: ['Favorite things', 'Product recommendations', 'Great DC restaurants for vegans'] },
  },
  visuals: { title: 'Visuals', panel: shot('visuals') },
  appearances: { title: 'Appearances', panel: shot('appearances') },
  contact: { title: 'Contact', panel: shot('contact') },
  notes: { title: 'Notes', panel: shot('notes') },
  'favorite-things': { title: 'Favorite things', panel: shot('favorite-things') },
  'dc-vegan-dining': { title: 'Great DC restaurants for vegans', panel: shot('dc-vegan-dining') },
  'product-recommendations': { title: 'Product recommendations', panel: shot('product-recommendations') },
  'carbon-footprint': { title: 'Carbon Footprint Calculator', panel: shot('carbon-footprint') },
  'carbon-boundary-crosswalk': { title: 'Why carbon calculator numbers differ', panel: shot('carbon-boundary-crosswalk') },
  'factory-farmed-chickens': { title: 'Factory-farmed chickens', panel: shot('factory-farmed-chickens') },
  water: { title: 'How thirsty is AI?', panel: shot('water') },
  'pm25-county-exposure': { title: 'PM2.5 exposure by county', panel: shot('pm25-county-exposure') },
};
