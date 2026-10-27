import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { WaterModel, parseAnchors } from '../water-map/flow/model.js';
import { DropModel } from '../water-map/flow/drop.js';
import { parseRivers } from '../water-map/net/rivers.js';
import { SLAB_MOVE } from '../water-map/core/config.js';
import { AQ_FLOWS, AQ_CITY, DROP_CONSUMED, DROP_DIVERSIONS, DROP_SOURCES } from '../water-map/core/flows_data.js';
import { projectLower48 } from '../water-map/core/proj.js';

// Follow a drop (flow/drop.js): the page's words about it against its constants, and the walk itself on the baked
// data, where a drop's fate is well known (the Hudson reaches the sea; the Arkansas in Colorado is used up by farms).

const ROOT = join(__dirname, '..', '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const json = (p: string) => JSON.parse(read(p));
const page = read('src/pages/visuals/water-map.astro').replace(/\s+/g, ' ');
const AF = 325851;

function grab(text: string, re: RegExp, what: string): string[] {
  const mt = text.match(re);
  if (!mt) throw new Error(`The text no longer says: ${what}. Update this check to the new sentence.`);
  return mt.slice(1);
}

describe('follow a drop: the page text agrees with its figures', () => {
  it('the shares consumed for public supply and industry', () => {
    const [ps, lo, hi, ind] = grab(page, /for public supply, (\d+) percent, USGS’s national figure for water years 2010 to 2020 \(Medalie and others, 2025\), which runs from (\d+) percent in the Gulf Coast, Atlantic Coast and Great Lakes regions to (\d+) percent in the Southwest Desert region; and for industry, (\d+) percent/, 'the public supply and industry shares');
    expect(Number(ps) / 100).toBe(DROP_CONSUMED.ps.share);
    expect([Number(lo) / 100, Number(hi) / 100]).toEqual(DROP_CONSUMED.ps.range);
    expect(Number(ind) / 100).toBe(DROP_CONSUMED.in.share);
  });
  it('the five measured diversions, and where their water goes', () => {
    grab(page, /(Five) big diversions are counted in counties far from the river/, 'five diversions');
    expect(DROP_DIVERSIONS.length).toBe(5);
    const feats = json('public/water-map/data/features.json');
    for (const d of DROP_DIVERSIONS) {
      expect(AQ_FLOWS[d.aq], d.aq).toBeTruthy();
      expect(feats.aqueducts.some((a: any) => a.name === d.aq), d.aq).toBe(true);
    }
    grab(page, /to the (six) counties the Metropolitan Water District serves/, 'the Metropolitan Water District’s six counties');
    const div = (aq: string) => DROP_DIVERSIONS.find((d) => d.aq === aq)!;
    expect(div('Colorado River Aqueduct').parts![0].to!.length).toBe(6);
    // the All-American Canal's two parts are Reclamation's figures, and add up to what the canal diverted
    expect(div('All-American Canal').parts!.reduce((a, p) => a + p.af!, 0)).toBe(AQ_FLOWS['All-American Canal'].af);
  });
  it('the Delta canals: what the State Water Project pumped, its contractors south of the Delta, and Reclamation’s deliveries', () => {
    const swp = DROP_DIVERSIONS.find((d) => d.aq === 'California Aqueduct')!;
    const [banks] = grab(page, /the State Water Project at the ([\d,]+) acre-feet it pumped at Banks Pumping Plant/, 'the Banks figure');
    expect(Number(banks.replace(/,/g, ''))).toBe(swp.af);
    expect(DROP_SOURCES.banks.src).toContain(swp.af!.toLocaleString('en-US'));
    // the weights are the maximum Table A amounts of every contractor but the Feather River's and the North Bay's
    const T = DROP_SOURCES.tableA;
    expect(swp.parts!.reduce((a, p) => a + p.w!, 0)).toBe(T.total - T.featherRiver - T.northBay);
    // the Delta-Mendota Canal's weights are Reclamation's deliveries in tables 24 and 25, less what is left out
    const dmc = DROP_DIVERSIONS.find((d) => d.aq === 'Delta-Mendota Canal')!, D = DROP_SOURCES.dmc;
    expect(dmc.parts!.reduce((a, p) => a + p.w!, 0)).toBe(D.table24 + D.table25 - D.left);
    const [left] = grab(page, /leaving out ([\d,]+) acre-feet/, 'what the Delta-Mendota Canal split leaves out');
    expect(Number(left.replace(/,/g, ''))).toBe(D.left);
  });
});

describe('follow a drop: the walk on the baked data', () => {
  let dm: any;
  const at = (lon: number, lat: number) => { const [x, z] = projectLower48(lon, lat); return dm.start(x, z); };
  const share = (o: any, pred: (e: any) => boolean) => [...o.ends.values()].filter(pred).reduce((a: number, e: any) => a + e.count, 0) / o.n;

  beforeAll(async () => {
    const sharp = (await import('sharp')).default;
    const D = join(ROOT, 'public/water-map/data');
    const px = async (f: string) => sharp(join(D, f)).raw().toBuffer({ resolveWithObject: true });
    // bytes packed into a PNG: a 4-byte length, then the data, three bytes a pixel (core/assets.js fetchPacked)
    const packed = async (f: string) => {
      const { data, info } = await px(f);
      const n = info.width * info.height, out = new Uint8Array(n * 3);
      for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) out[3 * i + c] = data[i * info.channels + c];
      const len = (out[0] | (out[1] << 8) | (out[2] << 16) | (out[3] << 24)) >>> 0;
      return out.buffer.slice(4, 4 + len);
    };
    // a slab, as far as the rivers and the drop need one
    const slab = async (name: string) => {
      const meta = json(`public/water-map/data/${name}_meta.json`), mv = (SLAB_MOVE as any)[name] || [0, 0];
      const s: any = { name, meta, rect: meta.rect, offset: [meta.offset[0] + mv[0], meta.offset[1] + mv[1]], hpu: meta.hpu, ppu: meta.ppu, mpu: meta.km_per_unit * 1000 };
      s.x0 = s.rect[0] + s.offset[0]; s.z0 = s.rect[1] + s.offset[1]; s.x1 = s.rect[2] + s.offset[0]; s.z1 = s.rect[3] + s.offset[1];
      const h = await px(`${name}_height.png`); s.W = h.info.width; s.H = h.info.height;
      s.masks = new Uint8Array(s.W * s.H); for (let i = 0; i < s.W * s.H; i++) s.masks[i] = Math.round(h.data[i * h.info.channels + 2] / 32);
      const c = await px(`${name}_county.png`); s.cw = c.info.width; s.ch = c.info.height;
      s.ids = new Int32Array(s.cw * s.ch); for (let i = 0; i < s.cw * s.ch; i++) s.ids[i] = ((c.data[i * c.info.channels] << 8) | c.data[i * c.info.channels + 1]) - 1;
      s.contains = (x: number, z: number, pad = 0) => x >= s.x0 - pad && x <= s.x1 + pad && z >= s.z0 - pad && z <= s.z1 + pad;
      s.maskAt = (x: number, z: number) => { const i = Math.max(0, Math.min(s.W - 1, Math.round((x - s.x0) * s.hpu - 0.5))), j = Math.max(0, Math.min(s.H - 1, Math.round((z - s.z0) * s.hpu - 0.5))); return s.masks[j * s.W + i]; };
      return s;
    };
    const slabs = await Promise.all(['conus', 'ak', 'hi', 'pr'].map(slab));
    const countyAt = (x: number, z: number) => {
      const s = slabs.find((q) => q.contains(x, z)); if (!s) return -1;
      const i = Math.floor((x - s.x0) * s.ppu), j = Math.floor((z - s.z0) * s.ppu);
      return i < 0 || j < 0 || i >= s.cw || j >= s.ch ? -1 : s.ids[j * s.cw + i];
    };
    // the model, as main.js builds it
    const m: any = new WaterModel();
    m.wu = json('public/water-map/data/wu.json'); m.features = json('public/water-map/data/features.json'); m.cdata = json('public/water-map/data/county_data.json');
    m.anchors = parseAnchors(await packed('anchors.dat.png'));
    m._move(); m.n = m.wu.id.length; m.plants = m.features.plants; m.placeholders = m.features.te_placeholders;
    m._derive();
    const pts = new Map(), farm = new Map();
    const add = (mm: Map<number, number[][]>, c: number, p: number[]) => { let a = mm.get(c); if (!a) mm.set(c, (a = [])); a.push(p); };
    for (const a of m.features.aqueducts) for (const sg of a.segs) for (let k = 0; k < sg.p.length; k += 2) {
      const x = sg.p[k], z = sg.p[k + 1], c = countyAt(x, z);
      if (c < 0 || m.wu.st[c] === 'NY') continue;
      add(pts, c, [x, z, 1]); if (!AQ_CITY.has(a.name)) add(farm, c, [x, z, 1]);
    }
    for (const mm of [pts, farm]) for (const [c, arr] of mm) if (arr.length > 12) mm.set(c, Array.from({ length: 12 }, (_, k) => arr[Math.floor((k + 0.5) * arr.length / 12)]));
    m.canals = pts; m.farmCanals = farm;
    const nets = await Promise.all(['conus', 'ak', 'pr'].map(async (n) => {
      const s = slabs.find((q) => q.name === n);
      return { slab: s, R: parseRivers(await packed(`rivers_${n}.dat.png`), s, json(`public/water-map/data/rivers_${n}_names.json`)) };
    }));
    dm = new DropModel(m, m.streams(), nets, { countyAt, lakes: m.features.lakes, slabMove: SLAB_MOVE }).prepare();
  }, 120000);

  it('places nearly all the surface water the map draws, and every measured diversion', () => {
    expect(dm.unplaced / dm.placed).toBeLessThan(0.01);
    expect(dm.diversions.map((d: any) => d.d.aq).sort()).toEqual(DROP_DIVERSIONS.filter((d) => !d.imp).map((d) => d.aq).sort());
    // each one where its water leaves the river, at the volume measured
    for (const d of dm.diversions) expect(Math.abs(d.mgd - (d.d.af ?? AQ_FLOWS[d.d.aq].af) * AF / 365e6)).toBeLessThan(0.1);
    // and all of it goes somewhere, along its canals
    for (const d of dm.diversions) {
      expect(Math.abs(d.to.reduce((a: number, t: any) => a + t.v, 0) - d.mgd)).toBeLessThan(0.1);
      for (const t of d.to) expect(t.s.route.length, `${d.d.aq} to ${t.i}`).toBeGreaterThan(2);
    }
  });
  it('the Hudson at Albany reaches the Atlantic', () => {
    const o = dm.odds(at(-73.75, 42.65), 1000, 7);
    expect(share(o, (e) => e.kind === 'sea' && e.name === 'the Atlantic')).toBeGreaterThan(0.95);
  });
  it('the Allegheny at Pittsburgh reaches the Gulf of Mexico', () => {
    const o = dm.odds(at(-79.95, 40.47), 1000, 7);
    expect(share(o, (e) => e.kind === 'sea' && e.name === 'the Gulf of Mexico')).toBeGreaterThan(0.95);
  });
  it('the Saint Louis River at Duluth runs through the Great Lakes into Canada', () => {
    const o = dm.odds(at(-92.35, 46.65), 1000, 7);
    expect(share(o, (e) => e.kind === 'border' && e.name === 'Canada')).toBeGreaterThan(0.95);
  });
  it('the Arkansas at Pueblo is taken, again and again, and mostly used up by crops', () => {
    const o = dm.odds(at(-104.6, 38.26), 1000, 7);
    expect(o.used / o.n).toBeGreaterThan(0.95);
    expect(share(o, (e) => e.kind === 'consumed' && e.cat === 'ir')).toBeGreaterThan(0.6);
  });
  it('the Colorado at Grand Junction is mostly used up by crops, and the panel flags it as heavily used', () => {
    const o = dm.odds(at(-108.55, 39.06), 1000, 7);
    expect(share(o, (e) => e.kind === 'consumed' && e.cat === 'ir')).toBeGreaterThan(0.5);
    expect(share(o, (e) => e.kind === 'border' && e.name === 'Mexico')).toBeLessThan(0.3);
    expect(o.dry).toBeGreaterThan(0.3);
  });
});
