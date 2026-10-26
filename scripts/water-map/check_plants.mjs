// Flags every power plant the map credits with more than ten times its own USGS plant-model estimate of water
// withdrawn (Harris and Diehl, 2019), the pattern that hid the Peach Bottom error (USGS counts its water in Lancaster
// County, across the Susquehanna). A flagged plant is not necessarily wrong: the county figures and the plant model
// are separate USGS estimates. Each one needs a look at why the county figure is so much larger.
//   node scripts/water-map/check_plants.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const { WaterModel } = await import(join(ROOT, 'src/lib/water-map/flow/model.js'));
const json = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));
const wu = json('public/water-map/data/wu.json'), feats = json('public/water-map/data/features.json');
const m = Object.create(WaterModel.prototype);
Object.assign(m, { wu, features: feats, cdata: [], anchors: [], n: wu.id.length, plants: feats.plants, placeholders: feats.te_placeholders });
m._derive();
const rows = m.plants.filter((p) => (p.w || 0) > 5 && (p.w || 0) > 10 * Math.max(p.model_w || 0, 0.01))
  .sort((a, b) => b.w - a.w)
  .map((p) => {
    const c = m.county(p.county), n = (m.plantsByCounty.get(p.county) || []).length;
    return `${p.name} (${p.st}, EIA ${p.eia}), ${p.gen.toLowerCase()}, ${p.cooling.toLowerCase()}: map ${p.w.toFixed(1)} Mgal/d, model ${p.model_w.toFixed(2)}; ${c.name} has ${c.W.pt.toFixed(1)} Mgal/d of power-plant water and ${n} plant${n === 1 ? '' : 's'}`;
  });
console.log(`${rows.length} plants credited with more than ten times their model estimate:\n${rows.join('\n')}`);
