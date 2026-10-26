import { DATA_CENTERS, AQ_FLOWS, NID } from '../core/flows_data.js';
import { CAT } from '../core/config.js';
import { esc, nf, pct } from './fmt.js';

/**
 * A guided tour: places and uses where the national pattern shows clearly. Every number in the captions is computed
 * from the same data the map draws, or taken from the source named in the caption.
 */
export class Tour {
  constructor(app) { this.app = app; this.m = app.model; this.i = -1; this.timers = new Set(); this.stops = this.build(); }
  later(fn, ms) { const t = setTimeout(() => { this.timers.delete(t); fn(); }, ms); this.timers.add(t); }
  dispose() { for (const t of this.timers) clearTimeout(t); this.timers.clear(); }
  ix(fips) { return this.m.wu.id.indexOf(fips); }
  at(fips, d, tilt = 0.95, az = 0) { const c = this.m.cdata[this.ix(fips)]; return c ? { x: c.cx, z: c.cz, d, tilt, az } : null; }
  stateAgg(st) { return this.m.aggregate(this.m.states.get(st) || []); }
  stateRank(fn) { return [...this.m.states.keys()].map((st) => [st, fn(this.stateAgg(st), st)]).sort((a, b) => b[1] - a[1]); }
  build() {
    const m = this.m, n = m.national, B = (v) => nf(v / 1000, v >= 10000 ? 0 : 1);
    const W = (k, i) => m.v(k, i);
    let po = 0, pc = 0, pocu = 0, pccu = 0;
    for (let i = 0; i < m.n; i++) {
      po += W('po_gf', i) + W('po_gs', i) + W('po_sf', i) + W('po_ss', i); pc += W('pc_gf', i) + W('pc_gs', i) + W('pc_sf', i) + W('pc_ss', i);
      pocu += W('po_cuf', i) + W('po_cus', i); pccu += W('pc_cuf', i) + W('pc_cus', i);
    }
    const ptShare = pct(n.W.pt + n.W.ir + n.W.go, n.total);
    const cuAll = n.cu.ir + n.cu.go + n.cu.pt;
    const irShareOfCu = pct(n.cu.ir + n.cu.go, cuAll);
    const ca = this.stateAgg('CA');
    const fresno = this.ix('06019'), fresC = fresno >= 0 ? m.county(fresno) : null;
    const cook = this.ix('17031'), cookC = cook >= 0 ? m.county(cook) : null;
    const imp = this.ix('06025'), impC = imp >= 0 ? m.county(imp) : null;
    const il = this.stateAgg('IL');
    const lakeIN = this.ix('18089');
    const lakeINsf = lakeIN >= 0 ? m.county(lakeIN).src.in.sf : 0;
    const A = this.app.aquifers;
    const hp = A ? A.list.find((a) => a.name === 'High Plains aquifer') : null;
    const mrva = A ? A.list.find((a) => a.name === 'Mississippi River Valley alluvial aquifer') : null;
    const mar = this.ix('04013'), marC = mar >= 0 ? m.county(mar) : null;
    const D = DATA_CENTERS;
    const aac = AQ_FLOWS['All-American Canal'];
    const gwShare = pct(n.src.gf + n.src.gs, n.total);
    const fresGw = fresC ? pct(fresC.src.ir.gf, fresC.W.ir) : 0;
    const topOf = (c) => Object.keys(c.W).sort((p, q) => c.W[q] - c.W[p])[0];
    const jef = this.ix('21111'), jefC = jef >= 0 ? m.county(jef) : null;
    // New York City's water, which USGS counts in the counties that hold its reservoirs (core/transfers.js)
    const kings = this.ix('36047');
    const nycMoved = [...m.xOut.values()].flat().filter((x) => x.sys.id === 'nyc').reduce((q, x) => q + x.vol, 0);
    const boros = ['36047', '36081', '36061', '36005', '36085'].map((f) => this.ix(f)).filter((i) => i >= 0);
    const boroPs = boros.reduce((q, i) => q + m.county(i).W.ps, 0);
    const kIn = kings >= 0 ? (m.xIn.get(kings) || []).reduce((q, x) => q + x.vol, 0) : 0;
    const kUsed = kings >= 0 ? m.county(kings).total + kIn : 0;
    return [
      { kicker: 'The whole country', title: `${B(n.total)} billion gallons a day`, view: 'home', night: true,
        text: `That is how much water the United States withdrew in 2015, by the U.S. Geological Survey's county-by-county estimate. Each streak of light is some of it, moving from the river, lake, aquifer or sea it came from to the place it was used, in the color of that use. Power plants, farms and golf courses took ${ptShare}% of it.` },
      { kicker: 'One use at a time', title: 'Power plants borrow the most', view: 'home', iso: 'pt', night: true,
        text: `Thermoelectric plants withdrew ${B(n.W.pt)} billion gallons a day, more than any other use, nearly all of it to carry away heat. Plants that pass water through once and return it warmer withdrew ${B(po)} billion and consumed ${nf(100 * pocu / po, 1)}% of it. Plants with cooling towers or ponds withdrew ${B(pc)} billion but consumed ${pct(pccu, pc)}%, mostly as evaporation. Each orange dot is a plant, sized by its water.` },
      { kicker: 'One use at a time', title: 'Crops consume the most', view: 'home', iso: 'ir', night: true,
        text: `Crop irrigation withdrew ${B(n.W.ir)} billion gallons a day, and unlike power plants it used most of it up: crops and golf courses accounted for ${irShareOfCu}% of the water USGS estimated was consumed in 2015. The counties glow green where irrigation is heaviest per square mile, along the Mississippi, across the Great Plains and in the irrigated valleys of the West.` },
      ...(jefC && topOf(jefC) === 'pt' ? [{ kicker: 'Up close', title: 'The channels', view: this.at('21111', 120, 1.0, 0.0), night: true,
        text: `Zoom in and the channels appear. Each carries one use's water from where it was drawn, a dot for an intake on a river or lake and a ring for a well, to where it was used, and the wider the channel, the more water. Here on the Ohio at Louisville the widest feed power plants, which took ${pct(jefC.W.pt, jefC.total)}% of the ${nf(jefC.total)} million gallons a day Jefferson County, Kentucky, withdrew.` }] : []),
      ...(kings >= 0 && nycMoved > 0 ? [{ kicker: 'Across county lines', title: 'New York City’s water', view: this.at('36047', 230, 0.85, 0.0), select: kings, night: true,
        text: `USGS counts public water where it is withdrawn, so on its figures New York City's five boroughs ${boroPs < 0.5 ? 'withdraw none of their own' : `withdraw only ${nf(boroPs)} million gallons a day of their own`}: the city's supply is counted in the counties that hold its Catskill, Delaware and Croton reservoirs. The map carries the ${nf(nycMoved)} million gallons a day back along the aqueducts to the counties the city serves. In Brooklyn, ${pct(kIn, kUsed)}% of the water its uses drew was piped in.` }] : []),
      ...(fresC ? [{ kicker: 'Tracing one county', title: 'Fresno County, California', view: this.at('06019', 70, 1.0, 0.25), select: fresno, night: false,
        text: `Clicking a county draws its water in the color of each source, with the share from each in a box. Fresno County withdrew ${B(fresC.total)} billion gallons a day, ${pct(fresC.W.ir, fresC.total)}% of it for crops, and ${fresGw}% of the crop water came from wells. 2015 was the fourth year of a severe drought, when surface deliveries were cut. California as a whole irrigated with ${B(ca.W.ir + ca.W.go)} billion gallons a day.` }] : []),
      ...(hp ? [{ kicker: 'Underground', title: 'The High Plains aquifer', view: this.at('31079', 560, 1.0, 0.0), aq: true, sel: { aquifer: hp.i }, night: true,
        text: `Under the land are aquifers: sand, gravel and rock holding water in their pores. Wells drew ${nf(hp.total / 1000, 1)} billion gallons a day from the High Plains aquifer in 2015, ${pct(hp.gw.it, hp.total)}% of it for irrigation${mrva ? `, and ${nf(mrva.total / 1000, 1)} billion from the Mississippi River Valley alluvial aquifer` : ''}. Konikow (2013) estimates the High Plains aquifer lost about 341 cubic kilometers of water between 1900 and 2008. Groundwater supplied ${gwShare}% of all withdrawals.` }] : []),
      ...(cookC ? [{ kicker: 'Public supply', title: 'Chicago and Lake Michigan', view: this.at('17031', 70, 0.95, 0.0), select: cook, night: true,
        text: `Cook County's utilities withdrew ${nf(cookC.W.ps)} million gallons a day, ${pct(cookC.src.ps.sf, cookC.W.ps)}% of it surface water, which here means Lake Michigan. Just east, in Lake County, Indiana, the steel mills and refinery on the shore drew ${lakeINsf >= 1000 ? B(lakeINsf) + ' billion' : nf(lakeINsf) + ' million'} gallons a day of surface water for industry.` }] : []),
      ...(impC ? [{ kicker: 'The Colorado River', title: 'Imperial Valley', view: this.at('06025', 110, 0.95, 0.2), select: imp,
        text: `In 2015 the Bureau of Reclamation counted ${nf(aac.af / 1e6, 2)} million acre-feet diverted from the Colorado River at Imperial Dam into the All-American Canal for the Imperial and Coachella valleys, about ${B(aac.mgd)} billion gallons a day. Imperial County withdrew ${B(impC.total)} billion gallons a day, ${pct(impC.W.ir, impC.total)}% of it for irrigation. ${impC.total > il.W.ps ? `That is more than every public water system in Illinois combined (${B(il.W.ps)} billion).` : ''}` }] : []),
      ...(marC && marC.split ? [{ kicker: 'For scale', title: 'Golf courses and data centers', view: this.at('04013', 900, 0.62, 0.0), iso: 'dc', night: true,
        text: `Lawrence Berkeley National Laboratory projects that every data center in the country together will consume about ${nf(D.directMgd[0])} to ${nf(D.directMgd[1])} million gallons a day on site in ${D.year}, or about ${nf((D.directGal[0] + D.indirectGal[0]) / 365e6)} to ${nf((D.directGal[1] + D.indirectGal[1]) / 365e6)} million counting the water power plants will consume generating their electricity. USGS estimated that golf courses in Maricopa County alone, around Phoenix, consumed ${nf(marC.cu.go)} million gallons a day in 2015. The violet diamonds are data centers mapped in OpenStreetMap.` }] : []),
      { kicker: 'Storage', title: `${nf(NID.listed)} dams`, view: { x: 515.1, z: 421.0, d: 210, tilt: 0.95, az: 0.15 }, layers: { nid: true }, damBoost: 11,
        text: () => {
          const d = this.app.dams ? this.app.dams.data : null;
          let priv = 0, small = 0;
          if (d) for (let k = 0; k < d.n; k++) { if (d.ow[k] === 1) priv++; if (d.stor[k] < 1000) small++; }
          return `That is how many the National Inventory of Dams lists, from farm ponds to Hoover Dam, which can hold back about 30 million acre-feet of the Colorado River in Lake Mead. Each mark is one dam, sized by how much it can store; this is Oklahoma and its neighbors.${d ? ` Of the ${nf(d.n)} with coordinates, ${pct(priv, d.n)}% are privately owned and ${pct(small, d.n)}% store less than 1,000 acre-feet.` : ''}`;
        } },
      { kicker: 'Your turn', title: 'Explore', view: 'home',
        text: 'Pick a use to see only its water. Click any county, power plant, dam, canal or facility to see where its water comes from. Search for a place, river, aquifer or dam by name, switch between day and night, or look underground.' },
    ];
  }
  toggle() { if (this.i >= 0) this.stop(); else this.go(0); }
  go(i) {
    const app = this.app, hud = app.hud;
    if (this.i < 0) this.saved = { night: app.night, aq: app.underground, iso: app.iso, layers: { ...hud.layers } };
    this.i = i;
    const s = this.stops[i];
    hud.$('[data-a="tour"]').classList.add('on'); hud.$('[data-a="tour"]').setAttribute('aria-pressed', 'true');
    const el = hud.$('[data-caption]');
    const title = typeof s.title === 'function' ? s.title() : s.title, text = typeof s.text === 'function' ? s.text() : s.text;
    el.innerHTML = `<p class="wm-cap">${i + 1} of ${this.stops.length} · ${esc(s.kicker)}</p><h4>${esc(title)}</h4><p>${esc(text)}</p>
      <div class="wm-cap-nav"><div class="wm-dots">${this.stops.map((_, j) => `<i class="${j === i ? 'on' : ''}"></i>`).join('')}</div>
      <div class="wm-cap-bs"><button type="button" class="wm-btn" data-t="close">Close</button>${i > 0 ? '<button type="button" class="wm-btn" data-t="prev">Back</button>' : ''}${i < this.stops.length - 1 ? '<button type="button" class="wm-btn" data-t="next">Next</button>' : '<button type="button" class="wm-btn" data-t="close">Done</button>'}</div></div>`;
    el.hidden = false; hud._capKind = 'tour';
    for (const b of el.querySelectorAll('[data-t]')) b.addEventListener('click', () => { const a = b.dataset.t; if (a === 'next') this.go(this.i + 1); else if (a === 'prev') this.go(this.i - 1); else this.stop(); });
    this.busy = true;
    app.clearSelection(true);
    app.isolate(s.iso || null, true);
    app.setNight(s.night !== false && s.night !== undefined ? true : s.night === false ? false : app.night);
    app.setUnderground(!!s.aq);
    const L = this.saved.layers;
    for (const k of ['nid', 'golf', 'dc']) hud.setLayer(k, s.layers && s.layers[k] != null ? s.layers[k] : L[k]);
    if (app.dams) app.dams.kindBoost.fill(s.damBoost || 1);
    this.busy = false;
    if (s.iso) hud.showCategory(s.iso);
    else if (s.aq) hud.showGroundwater();
    else hud.showNational();
    if (s.view === 'home') app.flyTo({ ...app._home() }, 2400, false); else if (s.view) app.flyTo(s.view, 2600);
    if (s.select != null) this.later(() => { if (this.i === i) app.selectCounty(s.select, false); }, 1300);
    if (s.sel && s.sel.aquifer) this.later(() => { if (this.i === i) app.selectAquifer(s.sel.aquifer, false); }, 1300);
  }
  stop() {
    if (this.i < 0) return;
    const app = this.app, hud = app.hud;
    this.i = -1;
    this.dispose();
    hud.hideCaption();
    hud.$('[data-a="tour"]').classList.remove('on'); hud.$('[data-a="tour"]').setAttribute('aria-pressed', 'false');
    if (app.dams) app.dams.kindBoost.fill(1);
    if (this.saved) {
      app.setNight(this.saved.night); app.setUnderground(this.saved.aq);
      for (const k of ['nid', 'golf', 'dc']) hud.setLayer(k, this.saved.layers[k]);
      app.isolate(this.saved.iso || null);
    }
  }
}
