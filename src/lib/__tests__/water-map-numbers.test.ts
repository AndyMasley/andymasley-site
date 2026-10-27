import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { WaterModel } from '../water-map/flow/model.js';
import { CATS, EXAG_KEYS } from '../water-map/core/config.js';
import { TRANSFERS, IMPORTS } from '../water-map/core/transfers.js';
import { AQ_FLOWS, DATA_CENTERS, DEPLETION, NID, COUNTY_NOTES, HP_LEVELS } from '../water-map/core/flows_data.js';
import { TRENDS } from '../water-map/core/trends.js';

// The water map's own words against its data. Every number the page text, the panels and the tour state as a fixed
// figure is checked here against the baked data or the source table it was taken from, so a figure that drifts from
// its data, or data that change under a figure, fail the build. (Numbers the panels compute from the data need no
// check: they cannot disagree with it.) When a check fails, fix the text or the data, never the check, unless the
// sentence itself has been rewritten.

const ROOT = join(__dirname, '..', '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const json = (p: string) => JSON.parse(read(p));
const AF = 325851;   // gallons in an acre-foot

const wu = json('public/water-map/data/wu.json');
const feats = json('public/water-map/data/features.json');
const aquifers = json('public/water-map/data/aquifers.json');
const dams = json('public/water-map/data/dams_nid.json');

// the model, without the anchors and terrain it needs only to draw
const m: any = Object.create(WaterModel.prototype);
Object.assign(m, { wu, features: feats, cdata: [], anchors: [], n: wu.id.length, plants: feats.plants, placeholders: feats.te_placeholders });
m._derive();
const nat = m.national;

const page = read('src/pages/visuals/water-map.astro').replace(/\s+/g, ' ');
const hud = read('src/lib/water-map/ui/hud.js').replace(/\s+/g, ' ');
const tour = read('src/lib/water-map/ui/tour.js').replace(/\s+/g, ' ');
const mainJs = read('src/lib/water-map/main.js');
const trendsAstro = read('src/components/water-map/WaterTrends.astro').replace(/\s+/g, ' ');

/** the numbers a sentence states, or a failure naming the sentence when it is gone */
function grab(text: string, re: RegExp, what: string): string[] {
  const mt = text.match(re);
  if (!mt) throw new Error(`The text no longer says: ${what}. Update this check to the new sentence.`);
  return mt.slice(1);
}
const num = (s: string) => Number(s.replace(/,/g, ''));
const WORDS: Record<string, number> = { sixty: 60, 'sixty-five': 65, seventy: 70, 'seventy-five': 75, fifty: 50, 'fifty-five': 55 };

describe('water map: the page text agrees with the data', () => {
  it('the national total in the lede', () => {
    const [b] = grab(page, /withdrew about (\d+) billion gallons of water a day/, 'the national total');
    expect(num(b)).toBe(Math.round(nat.total / 1000));
  });
  it('crops, golf courses and power plants withdrew more than three quarters', () => {
    grab(page, /which together withdrew (more than three quarters) of it/, 'the share of crops, golf and power');
    const f = (nat.W.ir + nat.W.go + nat.W.pt) / nat.total;
    expect(f).toBeGreaterThan(0.75);
    expect(f).toBeLessThan(0.8);
  });
  it('eight USGS uses, nine on the map, and the states that split golf from crops', () => {
    grab(page, /USGS reports (eight) uses\. The map shows (nine)/, 'eight uses and nine');
    expect(CATS.length).toBe(9);
    const [n] = grab(page, /as USGS did in (\d+) states and the District of Columbia/, 'the states that split golf');
    const split = m.splitStates.filter((s: string) => !['DC', 'PR', 'VI'].includes(s));
    expect(split.length).toBe(num(n));
    expect(m.splitStates).toContain('DC');
  });
  it('the plants in the USGS plant model', () => {
    const [n] = grab(page, /The ([\d,]+) plants in the USGS model of thermoelectric water use/, 'the number of plants');
    expect(feats.plants.length).toBe(num(n));
  });
  it('the West\'s imported water fits inside each county\'s own surface water for the use', () => {
    const by = new Map<string, number>();
    for (const y of IMPORTS as any[]) for (const t of y.to) { const k = `${t.fips}|${t.cat || 'ps'}`; by.set(k, (by.get(k) || 0) + t.mgd); }
    for (const [k, v] of by) {
      const [f, cat] = k.split('|'), i = wu.id.indexOf(f);
      expect(i, f).toBeGreaterThanOrEqual(0);
      expect(v, k).toBeLessThanOrEqual(m.county(i).src[cat].sf + 1e-6);
    }
    expect((IMPORTS as any[]).find((y) => y.id === 'laa').to[0].mgd).toBe(AQ_FLOWS['Los Angeles Aqueduct'].mgd);
  });
  it('the Central Arizona Project\'s deliveries by county and use, as the page and the methods give them', () => {
    const cap = (IMPORTS as any[]).find((y) => y.id === 'cap'), K = AF / 365 / 1e6;
    const [la, placed, all] = grab(page, /The Los Angeles Aqueduct supplied ([\d,]+) acre-feet to Los Angeles.*? ([\d,]+) of the ([\d,]+) acre-feet it delivered/, 'the imports');
    expect(num(la)).toBe(AQ_FLOWS['Los Angeles Aqueduct'].af);
    expect(num(placed)).toBe(cap.af);
    expect(num(all)).toBe(cap.afAll);
    expect(AQ_FLOWS['Central Arizona Project Canal'].note).toContain(`delivered ${num(all).toLocaleString('en-US')} acre-feet`);
    // each county's figure is its acre-feet in Mgal/d, and where it is drawn to more than one place, the parts add up to it
    const af: Record<string, number> = { '04013|ps': 323176, '04013|ir': 86060, '04021|ir': 414411, '04021|ps': 6911, '04019|ir': 26570 };
    let sum = 0;
    for (const t of cap.to) {
      const k = `${t.fips}|${t.cat}`;
      expect(t.mgd, k).toBeCloseTo(af[k] * K, 1);
      if (t.at && t.at.length > 1) expect(t.at.reduce((q: number, x: any[]) => q + x[1], 0), k).toBe(af[k]);
      sum += af[k];
    }
    expect(sum).toBe(cap.af);
    expect(cap.conf).toContain(`${cap.af.toLocaleString('en-US')} of the ${cap.afAll.toLocaleString('en-US')} acre-feet`);
  });
  it('the operators\' 2015 reports to EIA, as the methods quote them', () => {
    const by = (name: string) => feats.plants.find((p: any) => p.name === name);
    expect(feats.plants.filter((p: any) => p.eia_w != null).length).toBe(734);
    expect(by('Gerald Gentleman').eia_w).toBeCloseTo(544.0, 1);
    expect(by('Gerald Gentleman').w).toBeCloseTo(544.0, 1);
    expect(by('Ray Olinger').eia_w).toBeCloseTo(160.2, 1);
    expect(Math.round(by('W A Parish').eia_w)).toBe(1446);
    expect(Math.round(by('W A Parish').w)).toBe(702);
    expect(by('Brazos Valley Generating Facility').eia_w).toBeCloseTo(2.7, 1);
    expect(by('FirstEnergy Ashtabula').eia_w).toBeUndefined();
    expect(Math.round(by('Braidwood Generation Station').eia_w)).toBe(2419);
  });
  it('the groundwater from aquifers the map does not outline', () => {
    const [b] = grab(page, /About (\d+) billion gallons a day was pumped from glacial, alluvial and other aquifers/, 'the unmapped aquifers');
    const mapped = aquifers.aquifers.reduce((a: number, x: any) => a + x.total, 0);
    expect(Math.round((aquifers.national - mapped) / 1000)).toBe(num(b));
  });
  it('the data centers paragraph', () => {
    const D = DATA_CENTERS, T = D.y2023;
    const [l0, l1, g0, g1, y] = grab(page, /will consume about (\d+) to (\d+) billion liters \((\d+) to (\d+) billion gallons\) of water on site in (\d+)/, 'data centers on site');
    expect(D.directLiters.map((v: number) => v / 1e9)).toEqual([num(l0), num(l1)]);
    expect(D.directGal.map((v: number) => Math.round(v / 1e9))).toEqual([num(g0), num(g1)]);
    expect(D.year).toBe(num(y));
    const [t0, t1] = grab(page, /use about (\d+) to (\d+) terawatt-hours of electricity/, 'data center electricity');
    expect(D.electricityTWh).toEqual([num(t0), num(t1)]);
    const [h0, h1] = grab(page, /whose hyperscale parts are the (\d+) and (\d+) billion liters its text gives/, 'the hyperscale parts');
    expect(D.hyperscaleLiters.map((v: number) => v / 1e9)).toEqual([num(h0), num(h1)]);
    const [l23, g23, t23] = grab(page, /For 2023 it estimates (\d+) billion liters \(([\d.]+) billion gallons\) and (\d+) terawatt-hours/, 'the 2023 estimate');
    expect(T.directLiters / 1e9).toBe(num(l23));
    expect(T.directGal / 1e9).toBe(num(g23));
    expect(Math.round(T.directLiters / 3.785411784 / 1e8) / 10).toBe(num(g23));
    expect(T.electricityTWh).toBe(num(t23));
    expect(T.year).toBe(2023);
    const [k] = grab(page, /at ([\d.]+) gallons per kilowatt-hour/, 'the water factor');
    expect(D.galPerKWh).toBe(num(k));
    const [a0, a1] = grab(page, /which adds about (\d+) to (\d+) billion gallons a year in 2028/, 'the water for their electricity');
    expect(D.electricityTWh.map((t: number) => Math.round(t * D.galPerKWh))).toEqual([num(a0), num(a1)]);
    const [lb] = grab(page, /about (\d+) billion liters, also counts evaporation/, "LBNL's own estimate");
    expect(T.lbnlIndirectLiters / 1e9).toBe(num(lb));
  });
  it('the dams', () => {
    const [n, c] = grab(page, /It lists ([\d,]+) dams, and the map can draw all of them except (\d+) without coordinates and one in Guam/, 'the dams');
    expect(NID.listed).toBe(num(n));
    expect(dams.dams.length).toBe(num(n) - num(c) - 1);
  });
  it('the vertical exaggeration', () => {
    const [far, near] = grab(page, /exaggerated vertically: (\d+) times for the whole country and about (\d+) times up close/, 'the exaggeration');
    expect(EXAG_KEYS[EXAG_KEYS.length - 1][1]).toBe(num(far));
    expect(EXAG_KEYS[0][1]).toBe(num(near));
  });
  it('the systems that move water between counties', () => {
    const [n] = grab(page, /For (\d+) systems that withdraw in one county and deliver in others/, 'the number of systems');
    expect(TRANSFERS.length).toBe(num(n));
    for (const id of ['nyc']) expect(TRANSFERS.some((t: any) => t.id === id)).toBe(true);
  });
  it("New York City's reservoir counties and its boroughs", () => {
    grab(page, /the counties holding its reservoirs withdraw (a billion gallons) a day/, "New York City's reservoir counties");
    const nyc: any = TRANSFERS.find((t: any) => t.id === 'nyc');
    const ex = nyc.from.reduce((a: number, f: any) => { const i = m.ix.get(f.fips); return a + (i == null ? 0 : m.county(i).W.ps * (f.share ?? 1)); }, 0);
    expect(ex).toBeGreaterThan(900);
    expect(ex).toBeLessThan(1300);
    const boros = ['36047', '36081', '36061', '36005', '36085'].map((f) => m.ix.get(f)).reduce((a: number, i: number) => a + m.county(i).W.ps, 0);
    expect(boros).toBeLessThan(1);
  });
  it("California's irrigation split in one proportion, and Imperial County", () => {
    const [n, p] = grab(page, /In (\d+) California counties, including Imperial, the USGS figures divide irrigation between groundwater and surface water in the same proportion, about (\d+) percent groundwater/, 'the California proportion');
    expect(m.propIr.size).toBe(num(n));
    expect(m.propIr.has(m.ix.get('06025'))).toBe(true);
    const imp = m.county(m.ix.get('06025'));
    expect(Math.round(100 * imp.src.ir.gf / (imp.src.ir.gf + imp.src.ir.sf))).toBe(num(p));
    const [iid, usgs] = grab(page, /Reclamation counted ([\d.]+) million acre-feet of Colorado River water diverted for the Imperial Irrigation District in 2015, more than all the irrigation water USGS estimated for the county \(([\d.]+) million acre-feet\)/, 'Imperial County against Reclamation');
    expect(AQ_FLOWS['All-American Canal'].note).toContain('2,455,649 acre-feet for the Imperial Irrigation District');
    expect(Math.round(2455649 / 1e4) / 100).toBe(num(iid));
    expect(Math.round(imp.W.ir * 1e6 * 365 / AF / 1e4) / 100).toBe(num(usgs));
    // the panel note on Imperial County says the same
    const note = COUNTY_NOTES['06025'];
    expect(note).toContain(`about ${p} percent groundwater`);
    expect(note).toContain(`${iid} million acre-feet`);
    expect(note).toContain(`(${usgs} million acre-feet)`);
    const [n2] = grab(note, /same proportion as (\d+) other California counties/, 'the panel note on Imperial County');
    expect(num(n2)).toBe(m.propIr.size - 1);
  });
});

describe('water map: the common questions', () => {
  const cu = (k: string) => (k === 'ir' ? Math.min(nat.cu.ir, nat.W.ir + nat.other.ir_rec) : k === 'go' ? Math.min(nat.cu.go, nat.W.go + nat.other.go_rec) : Math.min(nat.cu.pt, nat.W.pt));
  it('power plants and farms', () => {
    const [p, f, c, pc, x] = grab(page, /They withdraw more: (\d+) billion gallons a day in 2015, against (\d+) billion for crops and golf courses\..*?Crops and golf courses consumed about (\d+) billion gallons a day, some (\d+) times the ([\d.]+) billion consumed by power plants/, 'power plants and farms');
    expect(Math.round(nat.W.pt / 1000)).toBe(num(p));
    expect(Math.round((nat.W.ir + nat.W.go) / 1000)).toBe(num(f));
    expect(Math.round((cu('ir') + cu('go')) / 1000)).toBe(num(c));
    expect(Math.round((cu('ir') + cu('go')) / cu('pt'))).toBe(num(pc));
    expect(Math.round(cu('pt') / 100) / 10).toBe(num(x));
    expect(cu('ir') / nat.W.ir).toBeGreaterThan(0.5);   // (farms keep most of theirs)
  });
  it("Brooklyn and the other systems", () => {
    grab(page, /the five boroughs withdraw no water for public supply/, 'the boroughs');
    for (const f of ['36047', '36081', '36061', '36005', '36085']) expect(m.county(m.ix.get(f)).W.ps).toBe(0);
    const [n] = grab(page, /does the same for (\d+) other systems/, 'the other systems');
    expect(TRANSFERS.length - 1).toBe(num(n));
  });
  it('data centers against the rest', () => {
    const D = DATA_CENTERS;
    const [g0, g1, d0, d1, e0, e1, all0, all1, x0, x1] = grab(page, /will consume about (\d+) to (\d+) billion gallons of water on site in 2028, in its low and high scenarios, about (\d+) to (\d+) million gallons a day\. Generating their electricity would consume about (\d+) to (\d+) billion gallons more.*?Together that is about (\d+) to (\d+) million gallons a day\. Crops, golf courses and power plants consumed about 77 billion gallons a day in 2015, some (\d+) to (\d+) times as much/, 'data centers');
    expect(D.directGal.map((v: number) => Math.round(v / 1e9))).toEqual([num(g0), num(g1)]);
    expect(D.directMgd.map((v: number) => Math.round(v / 5) * 5)).toEqual([num(d0), num(d1)]);
    expect(D.indirectGal.map((v: number) => Math.round(v / 1e9))).toEqual([num(e0), num(e1)]);
    const perDay = D.directGal.map((g: number, i: number) => (g + D.indirectGal[i]) / 365 / 1e6);
    expect(perDay.map((v: number) => Math.round(v / 5) * 5)).toEqual([num(all0), num(all1)]);
    const C = cu('ir') + cu('go') + cu('pt');
    expect(Math.round(C / 1000)).toBe(77);
    // (the high projection gives the smaller multiple)
    expect([Math.round(C / perDay[1] / 10) * 10, Math.round(C / perDay[0] / 10) * 10]).toEqual([num(x0), num(x1)]);
  });
});

describe('water map: the figures taken from reports are converted right', () => {
  it('every measured canal flow: acre-feet a year to Mgal/d', () => {
    for (const [name, f] of Object.entries(AQ_FLOWS) as [string, any][]) {
      if (!f.af) continue;
      // (the Mgal/d figures are kept to a tenth)
      expect(Math.round(f.af * AF / 365 / 1e5) / 10, name).toBe(f.mgd);
    }
  });
  it('the Colorado River Aqueduct: its length and the share of it underground, as drawn from the NHD', () => {
    const a = feats.aqueducts.find((q: any) => q.name === 'Colorado River Aqueduct');
    expect(a.geom).toBe('nhd');
    const [mi, share] = grab(AQ_FLOWS['Colorado River Aqueduct'].note, /runs (\d+) miles to Lake Mathews, near Riverside, (nearly three-quarters) of the way through tunnels/, 'the aqueduct\'s length and tunnels');
    expect(Math.abs(a.km / 1.609344 - num(mi))).toBeLessThan(3);
    const len = (s: any) => { let L = 0; for (let k = 2; k < s.p.length; k += 2) L += Math.hypot(s.p[k] - s.p[k - 2], s.p[k + 1] - s.p[k - 1]); return L; };
    const under = a.segs.filter((s: any) => s.u).reduce((t: number, s: any) => t + len(s), 0), all = a.segs.reduce((t: number, s: any) => t + len(s), 0);
    expect(share).toBe('nearly three-quarters');
    expect(under / all).toBeGreaterThan(0.68);
    expect(under / all).toBeLessThan(0.75);
  });
  it('the data centers: liters to gallons, and the water for their electricity', () => {
    const D = DATA_CENTERS;
    for (let i = 0; i < 2; i++) {
      expect(Math.abs(D.directLiters[i] / 3.785411784 - D.directGal[i]) / D.directGal[i]).toBeLessThan(1e-9);
      expect(D.directMgd[i]).toBeCloseTo(D.directGal[i] / 365 / 1e6, 6);
      expect(D.indirectGal[i]).toBeCloseTo(D.electricityTWh[i] * 1e9 * D.galPerKWh, -6);
    }
    expect(Math.abs(D.y2023.directLiters / 3.785411784 - D.y2023.directGal) / D.y2023.directGal).toBeLessThan(0.005);
    expect(D.y2023.directMgd).toBeCloseTo(D.y2023.directGal / 365 / 1e6, 6);
  });
});

describe('water map: the panels, the key and the tour', () => {
  it('the discs for the places that withdrew the most', () => {
    const [n] = grab(mainJs, /flows\.buildTop\((\d+)\)/, 'the number of discs in main.js');
    const said = [...hud.matchAll(/the (\d+) places that withdrew the most/g)].map((x) => num(x[1]));
    expect(said.length).toBeGreaterThan(0);
    for (const s of said) expect(s).toBe(num(n));
  });
  it("Konikow's High Plains depletion in the tour", () => {
    const [k] = grab(tour, /High Plains aquifer lost about (\d+) cubic kilometers of water between 1900 and 2008/, 'the High Plains depletion');
    expect(Math.round(DEPLETION.byAquifer['High Plains aquifer'].km3)).toBe(num(k));
  });
  it('the trends chart title spans the years it draws', () => {
    const [w] = grab(trendsAstro, /([A-Z][a-z]+(?:-[a-z]+)?) years of water use/, 'the trends chart title');
    expect(WORDS[w.toLowerCase()]).toBe(TRENDS.years[TRENDS.years.length - 1] - TRENDS.years[0]);
  });
  it("the High Plains water levels agree with the grid the map draws", async () => {
    const sharp = (await import('sharp')).default;
    const { data, info } = await sharp(join(ROOT, 'public/water-map/data/conus_hpwl.png')).raw().toBuffer({ resolveWithObject: true });
    const meta = json('public/water-map/data/conus_meta.json');
    // (the aquifer grid is half the color texture's resolution; the projection is equal-area)
    const cellSqmi = ((meta.km_per_unit / (meta.ppu / 2)) ** 2) / 2.58999;
    // (the map keeps whole feet, so the areas the panel quotes, counted on the USGS grid, fall between the map's
    // counts on either side of the threshold; resampling moves them by a percent or two)
    let fellOver = 0, fellAt = 0, roseOver = 0, roseAt = 0, lo = 255;
    for (let i = 0; i < info.width * info.height; i++) {
      const b = data[i * info.channels]; if (!b) continue;
      // (128 + feet from -100 feet up; below that, one step for each 5 feet more of decline)
      const ft = b >= 28 ? b - 128 : -100 - (28 - b) * 5;
      if (ft < -100) fellOver++;
      if (ft <= -100) fellAt++;
      if (ft > 10) roseOver++;
      if (ft >= 10) roseAt++;
      if (b < lo) lo = b;
    }
    expect(HP_LEVELS.fell100Sqmi).toBeGreaterThan(0.98 * fellOver * cellSqmi);
    expect(HP_LEVELS.fell100Sqmi).toBeLessThan(1.02 * fellAt * cellSqmi);
    expect(HP_LEVELS.rose10Sqmi).toBeGreaterThan(0.98 * roseOver * cellSqmi);
    expect(HP_LEVELS.rose10Sqmi).toBeLessThan(1.02 * roseAt * cellSqmi);
    expect(Math.abs(-100 - (28 - lo) * 5 + HP_LEVELS.maxFallFt)).toBeLessThanOrEqual(5);
  });
  it('the strain index: near 15 percent where little water is used', () => {
    const s = json('public/water-map/data/strain.json');
    expect(s.id).toEqual(wu.id);
    // (the land coloring's note: Maine's counties use little water)
    const me = wu.id.map((f: string, i: number) => [f, i]).filter(([f]: [string]) => f.startsWith('23')).map(([, i]: [string, number]) => s.sui[i]);
    for (const v of me) { expect(v).toBeGreaterThan(0.1); expect(v).toBeLessThan(0.22); }
    // every county in the lower 48 has a value
    wu.id.forEach((f: string, i: number) => { if (!['02', '15', '72', '78'].includes(f.slice(0, 2))) expect(s.sui[i], f).toBeGreaterThanOrEqual(0); });
  });
  it('the change since 2005: power plants then and now', () => {
    const h = json('public/water-map/data/history.json');
    expect(h.id).toEqual(wu.id);
    const k5 = h.years.indexOf(2005), k15 = h.years.indexOf(2015);
    const sum = (a: (number | null)[][], k: number) => a.reduce((s, r) => s + (r[k] || 0), 0) / 1000;
    const main = read('src/lib/water-map/main.js');
    const [a, b] = grab(main, /Power plants withdrew (\d+) billion gallons a day in 2005 and (\d+) billion in 2015/, 'power plants in 2005 and 2015');
    expect(Math.round(sum(h.pt, k5))).toBe(num(a));
    expect(Math.round(sum(h.pt, k15))).toBe(num(b));
    // 2015 is the map's own year: the history's last column is the county data the map draws
    expect(Math.round(sum(h.t, k15))).toBe(Math.round(nat.total / 1000));
    // and every year's national total comes within 2 percent of the trends table (which carries USGS's later revisions)
    h.years.forEach((y: number, k: number) => {
      const j = TRENDS.years.indexOf(y);
      expect(Math.abs(sum(h.t, k) - TRENDS.total[j]) / TRENDS.total[j], String(y)).toBeLessThan(0.02);
      expect(Math.abs(sum(h.pt, k) - TRENDS.pt[j]) / TRENDS.pt[j], `${y} power`).toBeLessThan(0.02);
    });
  });
  it('ZIP codes find their counties', () => {
    const z = json('public/water-map/data/zips.json');
    const zips: number[] = []; let a = 0; for (const d of z.z) { a += d; zips.push(a); }
    for (let k = 1; k < zips.length; k++) expect(zips[k]).toBeGreaterThan(zips[k - 1]);
    const at = (q: number) => wu.id[z.c[zips.indexOf(q)]];
    expect(at(10001)).toBe('36061');   // Manhattan
    expect(at(60601)).toBe('17031');   // Chicago's Loop
    expect(at(90012)).toBe('06037');   // downtown Los Angeles
    expect(at(99686)).toBe('02261');   // Valdez, counted by USGS in the Valdez-Cordova census area
  });
  it('the trends table adds up the way USGS prints it', () => {
    // (rounded as USGS rounds them, the parts of each year come within a few percent of its total)
    TRENDS.years.forEach((y: number, i: number) => {
      const parts = ['ps', 'dom', 'li', 'ir', 'pt', 'ind', 'mi', 'com', 'aq'].reduce((a, k) => a + ((TRENDS as any)[k][i] || 0), 0);
      expect(Math.abs(parts - TRENDS.total[i]) / TRENDS.total[i], String(y)).toBeLessThan(0.05);
      const src = TRENDS.gwf[i] + (TRENDS.gws[i] || 0) + TRENDS.swf[i] + TRENDS.sws[i];
      expect(Math.abs(src - TRENDS.total[i]) / TRENDS.total[i], `${y} by source`).toBeLessThan(0.05);
    });
    // and its 2015 column matches the county data the map draws
    const last = TRENDS.years.length - 1;
    expect(Math.round(nat.total / 1000)).toBe(TRENDS.total[last]);
    expect(Math.round(nat.W.pt / 1000)).toBe(TRENDS.pt[last]);
  });
});

describe('water map: permitted facilities, water systems and irrigated land', () => {
  const fac = json('public/water-map/data/npdes.json');
  const sys = json('public/water-map/data/water_systems.json');
  it('the permitted facilities the page counts, and how many each county\'s water ends at', () => {
    const [n] = grab(page, /Factories, mines, fish farms and livestock farms are the ([\d,]+) that held an individual EPA discharge permit/, 'the number of permitted facilities');
    expect(fac.counts.reduce((a: number, b: number) => a + b, 0)).toBe(num(n));
    expect(fac.names.length).toBe(num(n));
    grab(page, /ends at up to (eight) of its permitted facilities of that kind/, 'up to eight facilities');
    expect(read('scripts/water-map/bake_npdes.py')).toMatch(/^NANCHOR = 8$/m);
  });
  it('the water systems the page counts, and the Metropolitan Water District\'s population', () => {
    const [n] = grab(page, /the areas served by ([\d,]+) community water systems/, 'the number of water systems');
    expect(sys.n).toBe(num(n));
    const [p] = grab(page, /Metropolitan Water District of Southern California serves ([\d.]+) million people/, 'the Metropolitan Water District\'s population');
    const mwd = sys.sys.find((r: any[]) => /^Metropolitan Water Dist/.test(r[0]));
    expect(mwd).toBeTruthy();
    expect(Number((mwd[2] / 1e6).toFixed(1))).toBe(Number(p));
  });
  it('the sewage plants the page counts, and the OpenStreetMap plants it leaves out as the same', () => {
    const sew = json('public/water-map/data/sewage.json');
    const [n] = grab(page, /Sewage plants are the ([\d,]+) that held an individual EPA discharge permit/, 'the number of sewage plants');
    expect(sew.names.length).toBe(num(n));
    expect(sew.counts.reduce((a: number, b: number) => a + b, 0)).toBe(num(n));
    grab(page, /wastewater plants within (750) meters of one of them are the same plant/, 'the 750 meters');
    expect(read('scripts/water-map/bake_sewage.py')).toMatch(/T\['conus'\]\.km < 0\.75\]/);
  });
  it('the county panels\' irrigated acreage from LANID is on the lower 48 only', () => {
    const cd = json('public/water-map/data/county_data.json');
    cd.forEach((c: any, i: number) => { if (c && c.lanid_km2 != null) expect(['AK', 'HI', 'PR', 'VI'], wu.id[i]).not.toContain(wu.st[i]); });
    // 274,138,269 irrigated 30 m pixels in 2015, nearly all of them on a county
    const tot = cd.reduce((a: number, c: any) => a + ((c && c.lanid_km2) || 0), 0);
    expect(Math.abs(tot - 274138269 * 900 / 1e6) / tot).toBeLessThan(0.001);
  });
});
