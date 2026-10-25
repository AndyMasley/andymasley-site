import { CATS, CAT, DC, riverLabel, lakeLabel } from '../core/config.js';
import { CAT_KEYS } from '../flow/model.js';
import { sankeySVG } from './sankey.js';
import { AQ_FLOWS, DATA_CENTERS, DEPLETION, AQ_STORAGE } from '../core/flows_data.js';
import { OSM_KINDS, OSM_LABEL } from '../net/infra.js';
import { NLCD_CLASSES } from '../world/nlcd.js';
import { esc, nf, vol, volShort, mgd, af, pct, ord, km3gal } from './fmt.js';

const SRC_ROWS = [
  { key: 'sf', name: 'Rivers, lakes', long: 'Fresh surface water', color: '#5aa9ff' },
  { key: 'ss', name: 'Seawater', long: 'Saline surface water', color: '#4fd0c8' },
  { key: 'gf', name: 'Groundwater', long: 'Fresh groundwater', color: '#7fe0b8' },
  { key: 'gs', name: 'Salty groundwater', long: 'Saline groundwater', color: '#a7c7b8' },
];
const CONSUMED_NOTE = 'USGS estimated consumption (water that evaporates, goes into crops or products, or is otherwise used up) only for crops, golf courses and power plants in 2015.';
const genName = (g) => ({ NGCC: 'Natural gas, combined cycle', COAL: 'Coal', 'GAS STEAM': 'Natural gas, steam', BIOMASS: 'Biomass', COMPLEX: 'Mixed fuels', NUCLEAR: 'Nuclear', OIL: 'Oil', 'OIL CC': 'Oil, combined cycle' }[g] || g);
const coolName = (c) => ({ 'RECIRCULATING TOWER': 'Cooling towers (recirculating)', 'ONCE-THROUGH FRESH': 'Once-through, fresh water', 'ONCE-THROUGH SALINE': 'Once-through, salt water', 'RECIRCULATING POND': 'Cooling pond (recirculating)', COMPLEX: 'Several cooling systems' }[c] || c);
const consumedOf = (agg, k) => (k === 'ir' ? Math.min(agg.cu.ir, agg.W.ir + agg.other.ir_rec) : k === 'go' ? Math.min(agg.cu.go, agg.W.go + agg.other.go_rec) : k === 'pt' ? Math.min(agg.cu.pt, agg.W.pt) : 0);
const HAZ = ['Not determined', 'Low', 'Significant', 'High'];
const sw = (c) => `<i class="wm-sw" style="background:${c}"></i>`;

/**
 * Everything drawn over the map: the use picker on the left, the reading key, the inspector on the right, the toolbar,
 * the tooltip, the tour caption and the compare sheet. Built into the stage element; every query is scoped to it.
 */
export class Hud {
  constructor(app, stage) {
    this.app = app; this.m = app.model; this.root = stage;
    this.$ = (s) => stage.querySelector(s);
    this.$$ = (s) => stage.querySelectorAll(s);
    this.layers = { rivers: true, flows: true, plants: true, labels: true, nid: true, infra: true, golf: true, dc: false };
    this.choro = 'none';
    this.pins = [];
    this.ac = new AbortController();
    this.build();
    this.showNational();
  }
  on(el, ev, fn, opts = {}) { if (el) el.addEventListener(ev, fn, { ...opts, signal: this.ac.signal }); }
  dispose() { this.ac.abort(); }

  // ------------------------------------------------------------ frame
  build() {
    const nat = this.m.national;
    const D = DATA_CENTERS;
    const wrap = document.createElement('div');
    wrap.className = 'wm-hud';
    wrap.innerHTML = `
      <section class="wm-panel wm-uses" data-uses aria-label="Choose a use of water to show">
        <button class="wm-uses-head" type="button" data-uses-head aria-expanded="true"><span class="wm-cap">Show the water for</span><i class="wm-caret" aria-hidden="true"></i></button>
        <div class="wm-uses-body">
          <div class="wm-rows" role="radiogroup" aria-label="Uses of water" data-rows></div>
          <p class="wm-note">Billion gallons a day withdrawn in 2015 (USGS). Data centers: consumed on site in ${D.year} (LBNL), for scale.</p>
        </div>
      </section>
      <section class="wm-panel wm-key" data-key aria-label="How to read the map">
        <button class="wm-key-head" type="button" data-key-head aria-expanded="true"><span class="wm-cap">How to read the map</span><i class="wm-caret" aria-hidden="true"></i></button>
        <div class="wm-key-body">
          <div class="wm-key-row"><svg viewBox="0 0 40 12" aria-hidden="true"><path d="M2 9 Q20 -3 38 9" fill="none" stroke="#5aa9ff" stroke-width="1.2" stroke-dasharray="3 3" opacity=".7"/><circle cx="31" cy="6.2" r="2" fill="#3cc483"/><circle cx="20" cy="3" r="2" fill="#7fc9a8"/><circle cx="9" cy="6" r="2" fill="#5aa9ff"/></svg><span>Moving light is water on its way from a river, lake, aquifer or the sea to where it is used. It takes the color of its use.</span></div>
          <div class="wm-key-row"><svg viewBox="0 0 40 12" aria-hidden="true"><path d="M14 11 C12 7 18 6 15 1 M24 11 C22 7 28 6 25 1" fill="none" stroke="#f4f1ea" stroke-width="1.4" stroke-linecap="round" opacity=".85"/></svg><span>White mist is water that was consumed, mostly by evaporating.</span></div>
          <div class="wm-key-row"><svg viewBox="0 0 40 12" aria-hidden="true"><path d="M4 4 Q20 12 36 6" fill="none" stroke="#3c7fe0" stroke-width="2.2" stroke-linecap="round"/></svg><span>Blue is water going back to a river after it was used.</span></div>
          <div class="wm-key-row"><svg viewBox="0 0 40 12" aria-hidden="true"><rect x="3" y="7" width="34" height="4" fill="#e7c25e" opacity=".55"/><path d="M20 7 V1" stroke="#7fe0b8" stroke-width="1.6"/></svg><span>Underground, wells lift groundwater out of the aquifers.</span></div>
          <p class="wm-note" data-scale></p>
        </div>
      </section>
      <aside class="wm-panel wm-insp" data-insp aria-live="polite" aria-label="Details"></aside>
      <div class="wm-bar" data-bar>
        <div class="wm-search">
          <input type="search" data-search placeholder="Find a place, river, plant, aquifer or dam" autocomplete="off" spellcheck="false" aria-label="Search the map">
          <div class="wm-panel wm-results" data-results role="listbox"></div>
        </div>
        <button class="wm-btn" type="button" data-a="home" title="Back to the whole country">Home</button>
        <button class="wm-btn" type="button" data-a="tour" title="A guided tour" aria-pressed="false">Tour</button>
        <button class="wm-btn" type="button" data-a="night" title="Switch between day and night"><span data-night-label>Day</span></button>
        <button class="wm-btn" type="button" data-a="under" title="Look underground at the aquifers" aria-pressed="false">Underground</button>
        <button class="wm-btn" type="button" data-a="layers" title="Layers and land color" aria-expanded="false">Layers</button>
        <button class="wm-btn wm-hide-s" type="button" data-a="compare" title="Compare uses on one scale">Compare<span data-cnt></span></button>
        <button class="wm-btn wm-hide-s" type="button" data-a="full" title="Fill the screen">Full screen</button>
      </div>
      <section class="wm-panel wm-layers" data-layers hidden aria-label="Layers">
        <p class="wm-cap">Color the land by</p>
        <div class="wm-choices" data-choro role="radiogroup"></div>
        <div data-choro-key></div>
        <p class="wm-cap" style="margin-top:var(--space-sm)">Show on the map</p>
        <div class="wm-toggles" data-toggles></div>
      </section>
      <section class="wm-panel wm-caption" data-caption hidden aria-live="polite"></section>
      <div class="wm-tip" data-tip hidden></div>
      <div class="wm-modal" data-compare hidden><div class="wm-panel wm-modal-box" data-compare-box role="dialog" aria-modal="true" aria-label="Compare"></div></div>`;
    this.root.appendChild(wrap);
    this.wrap = wrap;

    // use picker
    const max = Math.max(...CAT_KEYS.map((k) => nat.W[k]));
    const row = (k, name, value, color, bar, extra = '') => `<button type="button" class="wm-row" role="radio" aria-checked="false" data-k="${k}" title="${esc(extra)}">
        <span class="wm-row-l">${color ? sw(color) : '<i class="wm-sw wm-sw-all"></i>'}<span class="wm-row-n">${esc(name)}</span></span><span class="wm-row-v">${value}</span>
        <span class="wm-row-b"><i style="width:${bar.toFixed(1)}%;background:${color || 'var(--wm-dim)'}"></i></span></button>`;
    this.$('[data-rows]').innerHTML = row('all', 'Every use', nf(nat.total / 1000), null, 100, 'All water withdrawn in 2015') +
      CATS.map((c) => row(c.k, c.name, nf(nat.W[c.k] / 1000, nat.W[c.k] < 10000 ? 1 : 0), c.color, Math.max(0.6, (100 * nat.W[c.k]) / max), c.what)).join('') +
      row('dc', DC.name, nf(DATA_CENTERS.directMgd / 1000, 2), DC.color, 0.6, 'Water consumed on site by U.S. data centers in 2023, for scale');
    for (const el of this.$$('.wm-row')) {
      const k = el.dataset.k;
      this.on(el, 'click', () => { this.app.tour?.stop(); this.app.isolate(k === 'all' || this.app.iso === k ? null : k); });
      this.on(el, 'mouseenter', () => { if (!this.app.iso && k !== 'all' && k !== 'dc') this.app.focusCat(k); });
      this.on(el, 'mouseleave', () => { if (!this.app.iso) this.app.focusCat(null); });
    }
    this.syncUses();
    // panels fold away
    const fold = (head, panel, key) => {
      this.on(this.$(head), 'click', () => {
        const el = this.$(panel); const c = !el.classList.contains('collapsed');
        el.classList.toggle('collapsed', c); this.$(head).setAttribute('aria-expanded', String(!c));
        try { localStorage.setItem(key, c ? '1' : '0'); } catch { /* storage may be unavailable */ }
      });
      let saved = null; try { saved = localStorage.getItem(key); } catch { /* ignore */ }
      if (saved === '1') { this.$(panel).classList.add('collapsed'); this.$(head).setAttribute('aria-expanded', 'false'); }
    };
    fold('[data-uses-head]', '[data-uses]', 'wm-uses-folded');
    fold('[data-key-head]', '[data-key]', 'wm-key-folded');
    if (this.root.clientWidth < 760) { this.$('[data-key]').classList.add('collapsed'); this.$('[data-key-head]').setAttribute('aria-expanded', 'false'); }

    // layers sheet
    const ck = Object.entries(this.app.CHORO);
    this.$('[data-choro]').innerHTML = ck.map(([k, s]) => `<button type="button" class="wm-tg${k === 'none' ? ' on' : ''}" role="radio" aria-checked="${k === 'none'}" data-k="${k}"><i></i>${esc(s.name)}</button>`).join('');
    for (const el of this.$$('[data-choro] .wm-tg')) this.on(el, 'click', () => this.setChoro(el.dataset.k));
    this.choroKey(this.app.CHORO.none);
    const L = [['rivers', 'Rivers and canals'], ['flows', 'Moving water'], ['plants', 'Power plants'], ['labels', 'Names'],
      ['nid', 'Every dam'], ['infra', 'Water towers and treatment'], ['golf', 'Golf courses'], ['dc', 'Data centers']];
    this.$('[data-toggles]').innerHTML = L.map(([k, n]) => `<button type="button" class="wm-tg wm-check${this.layers[k] ? ' on' : ''}" role="checkbox" aria-checked="${this.layers[k]}" data-k="${k}"><i></i>${n}</button>`).join('');
    for (const el of this.$$('[data-toggles] .wm-tg')) this.on(el, 'click', () => { const k = el.dataset.k; this.setLayer(k, !this.layers[k]); });

    this.buildSearch();
    this.buildButtons();
    this.buildCompare();
  }
  setLayer(k, on) {
    this.layers[k] = on;
    const el = this.$(`[data-toggles] .wm-tg[data-k="${k}"]`); if (el) { el.classList.toggle('on', on); el.setAttribute('aria-checked', String(on)); }
    this.app.setLayer(k, on);
  }
  setChoro(k) {
    this.choro = k;
    for (const o of this.$$('[data-choro] .wm-tg')) { const on = o.dataset.k === k; o.classList.toggle('on', on); o.setAttribute('aria-checked', String(on)); }
    const spec = this.app.setChoro(k);
    this.choroKey(spec);
  }
  choroKey(spec) {
    const el = this.$('[data-choro-key]');
    if (spec.cat) { el.innerHTML = `<p class="wm-note">Each county in the color of the use that withdrew the most water there.</p>`; return; }
    if (!spec.f) { el.innerHTML = spec.note ? `<p class="wm-note">${esc(spec.note)}</p>` : ''; return; }
    const fmtv = (v) => (v >= 1e6 ? `${nf(v / 1e6, v >= 1e7 ? 0 : 1)}M` : v >= 1e3 ? `${nf(v / 1e3, v >= 1e4 ? 0 : 1)}k` : nf(v));
    const ticks = spec.log ? [0, 0.25, 0.5, 0.75, 1].map((t) => spec.log[0] * Math.pow(spec.log[1] / spec.log[0], t)) : [0, 25, 50, 75, 100];
    el.innerHTML = `<div class="wm-ramp"></div><div class="wm-ramp-t">${ticks.map((v) => `<span>${spec.log ? fmtv(v) : nf(v)}</span>`).join('')}</div><p class="wm-note">${esc(spec.unit)}${spec.log ? ' (log scale)' : ''}.</p>`;
  }
  syncUses() {
    const iso = this.app.iso || 'all';
    for (const el of this.$$('.wm-row')) { const on = el.dataset.k === iso; el.classList.toggle('on', on); el.setAttribute('aria-checked', String(on)); }
    this.root.classList.toggle('wm-isolating', !!this.app.iso);
  }
  syncButtons() {
    const nb = this.$('[data-a="night"]');
    this.$('[data-night-label]').textContent = this.app.night ? 'Day' : 'Night';
    nb.title = this.app.night ? 'Switch to daylight' : 'Switch to night';
    const ub = this.$('[data-a="under"]');
    ub.classList.toggle('on', !!this.app.underground); ub.setAttribute('aria-pressed', String(!!this.app.underground));
    const fb = this.$('[data-a="full"]');
    if (fb) fb.textContent = this.app.expanded ? 'Exit full screen' : 'Full screen';
  }

  // ------------------------------------------------------------ welcome
  welcome() {
    if (this.app.tour.i >= 0 || this._welcomed) return;
    this._welcomed = true;
    this.caption(`<p class="wm-cap">How to read this</p><h4>Every moving light is water</h4>
      <p>Each streak is water leaving a river, lake, aquifer or the sea on its way to a use, colored by that use. For crops, golf and power plants, the water consumed rises as white mist and the rest flows back to rivers in blue. ${this.root.clientWidth < 760 ? 'Tap a use above the map to see only its water, tap any place to trace its water, or go Underground to see the aquifers.' : 'Pick a use on the left to see only its water, click any place to trace where its water comes from, or look underground at the aquifers.'}</p>`,
      [['close', 'Explore on my own'], ['tour', 'Take the tour']], (a) => { if (a === 'tour') this.app.tour.go(0); });
    const off = () => { if (this.app.tour.i < 0 && this._capKind === 'welcome') this.hideCaption(); };
    setTimeout(() => this.on(this.app.canvas, 'wheel', off, { once: true }), 1500);
    this._capKind = 'welcome';
  }
  caption(html, buttons, onAction) {
    const el = this.$('[data-caption]');
    el.innerHTML = `${html}<div class="wm-cap-nav"><div></div><div class="wm-cap-bs">${buttons.map(([a, t]) => `<button type="button" class="wm-btn" data-a="${a}">${esc(t)}</button>`).join('')}</div></div>`;
    el.hidden = false;
    for (const b of el.querySelectorAll('[data-a]')) this.on(b, 'click', () => { this.hideCaption(); onAction?.(b.dataset.a); });
  }
  hideCaption() { this.$('[data-caption]').hidden = true; this._capKind = null; }

  // ------------------------------------------------------------ inspector
  sankeyFor(agg, scale = 1, fmt) {
    const sources = SRC_ROWS.map((s) => ({ ...s, value: agg.src[s.key] / scale }));
    const uses = CATS.map((c) => ({ key: c.k, name: c.short, color: c.color, value: agg.W[c.k] / scale, consumed: consumedOf(agg, c.k) / scale }));
    const links = [];
    for (const k of CAT_KEYS) for (const s of SRC_ROWS) links.push({ s: s.key, t: k, value: agg.bySrc[k][s.key] / scale });
    const w = Math.min(348, (this.$('[data-insp]').clientWidth || 360) - 28);
    return sankeySVG({ sources, uses, links, width: w, fmt });
  }
  setInspector(html, closable, kind = 'detail') {
    const el = this.$('[data-insp]');
    el.dataset.kind = kind;
    el.classList.toggle('wm-national', !closable);
    const tall = el.classList.contains('wm-tall');
    el.innerHTML = `<button type="button" class="wm-grip" aria-expanded="${tall}" aria-label="${tall ? 'Show less of this panel' : 'Show more of this panel'}"></button>` +
      (closable ? '<button type="button" class="wm-close" aria-label="Close">&times;</button>' : '') + html;
    el.scrollTop = 0;
    const grip = el.querySelector('.wm-grip');
    this.on(grip, 'click', () => {
      const t = el.classList.toggle('wm-tall');
      grip.setAttribute('aria-expanded', String(t));
      grip.setAttribute('aria-label', t ? 'Show less of this panel' : 'Show more of this panel');
      if (!t) el.scrollTop = 0;
    });
    if (closable) this.on(el.querySelector('.wm-close'), 'click', () => { if (kind === 'iso') this.app.isolate(null); else this.app.clearSelection(); });
    for (const a of el.querySelectorAll('[data-plant]')) this.on(a, 'click', () => this.app.selectPlant(+a.dataset.plant, true));
    for (const a of el.querySelectorAll('[data-county]')) this.on(a, 'click', () => this.app.selectCounty(+a.dataset.county, true));
    for (const a of el.querySelectorAll('[data-state]')) this.on(a, 'click', () => this.app.selectState(a.dataset.state, true));
    for (const a of el.querySelectorAll('[data-aq]')) this.on(a, 'click', () => this.app.selectAquifer(+a.dataset.aq, true));
    for (const a of el.querySelectorAll('[data-osm]')) this.on(a, 'click', () => this.app.selectOsm(+a.dataset.osm, true));
    for (const a of el.querySelectorAll('[data-iso]')) this.on(a, 'click', () => this.app.isolate(a.dataset.iso === 'all' ? null : a.dataset.iso));
    for (const a of el.querySelectorAll('[data-go]')) this.on(a, 'click', () => { const v = JSON.parse(a.dataset.go); this.app.flyTo(v, 1800); });
    for (const a of el.querySelectorAll('[data-pin]')) this.on(a, 'click', () => { this.pin(JSON.parse(a.dataset.pin)); a.textContent = 'Added to Compare'; });
    for (const a of el.querySelectorAll('[data-open-compare]')) this.on(a, 'click', () => this.openCompare());
    for (const a of el.querySelectorAll('[data-under]')) this.on(a, 'click', () => this.app.setUnderground(true));
    // the Sankey: hovering a band shows that water on the map
    for (const p of el.querySelectorAll('.wm-sankey [data-t]')) {
      this.on(p, 'mouseenter', () => this.app.focusFlow(p.dataset.t, p.dataset.s || null));
      this.on(p, 'mouseleave', () => this.app.focusFlow(null));
    }
  }
  pinButton(item) { return `<button type="button" class="wm-btn wm-sm" data-pin='${esc(JSON.stringify(item))}'>+ Compare</button>`; }
  forScale() {
    const n = this.m.national, D = DATA_CENTERS;
    const dcAll = (D.directGal + D.indirectGal) / 365 / 1e6;
    return `<h5>For scale</h5>
      <div class="wm-kv">
        <span>U.S. data centers, consumed on site (2023)</span><span>${nf(D.directMgd)} Mgal/d</span>
        <span>Adding the water consumed making their electricity</span><span>${nf(dcAll)} Mgal/d</span>
        <span>Golf courses where reported, consumed (2015)</span><span>${nf(n.cu.go)} Mgal/d</span>
        <span>Every use, withdrawn (2015)</span><span>${nf(n.total)} Mgal/d</span>
      </div>
      <p class="wm-note"><button type="button" class="wm-lnk" data-iso="dc">Show data centers on the map</button> · <button type="button" class="wm-lnk" data-open-compare="1">Compare more</button></p>`;
  }
  showNational() {
    const n = this.m.national;
    const perCap = n.total * 1e6 / (n.pop * 1000);
    const cuIr = n.cu.ir + n.cu.go, cuPt = n.cu.pt;
    this.setInspector(`<p class="wm-cap">The whole country, 2015</p>
      <div class="wm-big">${nf(n.total / 1000)} <small>billion gallons a day</small></div>
      <p class="wm-sub">withdrawn from rivers, lakes, aquifers and the sea, or about ${nf(perCap)} gallons for every resident (counting the water power plants borrow and give back).</p>
      ${this.sankeyFor(n, 1000, (v) => nf(v, v < 10 ? 1 : 0))}
      <p class="wm-note">Billion gallons a day. The white part of a bar is the share consumed. Hover a band to see that water on the map.</p>
      <p class="wm-sub">Most of it goes back. Crops and golf courses consumed ${nf(cuIr / 1000)} billion gallons a day of their ${nf((n.W.ir + n.W.go) / 1000)}; power plants consumed ${nf(cuPt / 1000, 1)} billion of their ${nf(n.W.pt / 1000)}. ${CONSUMED_NOTE}</p>
      <div class="wm-kv"><span>Pumped from groundwater</span><span>${nf(100 * (n.src.gf + n.src.gs) / n.total)}%</span><span>Salt water (mostly cooling)</span><span>${nf(100 * (n.src.ss + n.src.gs) / n.total)}%</span></div>
      ${this.forScale()}
      <p class="wm-note">Click any county, power plant, dam or marked facility to trace its water. Drag to move, scroll or pinch to zoom, right-drag or twist two fingers to turn.</p>`, false, 'national');
  }
  /** the panel for one use, shown while it is isolated */
  showCategory(k) {
    if (k === 'dc') return this.showDataCenters();
    const m = this.m, n = m.national, c = CAT[k];
    const W = n.W[k], bySrc = n.bySrc[k];
    const cu = consumedOf(n, k);
    const states = [...m.states.keys()].map((st) => [st, m.aggregate(m.states.get(st)).W[k]]).filter((r) => r[1] > 0).sort((a, b) => b[1] - a[1]).slice(0, 6);
    const counties = Array.from({ length: m.n }, (_, i) => i).filter((i) => m.byCat[c.i][i] > 0).sort((a, b) => m.byCat[c.i][b] - m.byCat[c.i][a]).slice(0, 8);
    const srcBar = SRC_ROWS.filter((s) => bySrc[s.key] > 0).map((s) => `<i style="width:${(100 * bySrc[s.key] / W).toFixed(2)}%;background:${s.color}" title="${esc(s.long)}: ${nf(100 * bySrc[s.key] / W)}%"></i>`).join('');
    const srcTxt = SRC_ROWS.filter((s) => bySrc[s.key] / W >= 0.005).map((s) => `${sw(s.color)}${esc(s.name)} ${nf(100 * bySrc[s.key] / W)}%`).join('<span class="wm-dotsep"> · </span>');
    let html = `<p class="wm-cap">Water for one use, 2015</p><h3>${sw(c.color)}${esc(c.name)}</h3>
      <div class="wm-big">${W >= 1000 ? nf(W / 1000, W >= 10000 ? 0 : 1) : mgd(W)} <small>${W >= 1000 ? 'billion' : 'million'} gallons a day withdrawn</small></div>
      <p class="wm-sub">${esc(c.what)} ${nf(100 * W / n.total, 1)}% of all U.S. withdrawals.</p>
      <h5>Where it comes from</h5><div class="wm-stack">${srcBar}</div><p class="wm-legend-line">${srcTxt}</p>`;
    if (cu > 0) html += `<h5>What happens to it</h5><div class="wm-kv"><span>Consumed, rising as white mist</span><span>${volShort(cu)} (${pct(cu, W + (k === 'ir' ? n.other.ir_rec : k === 'go' ? n.other.go_rec : 0))}%)</span><span>Returned to rivers and aquifers</span><span>${volShort(Math.max(0, W - cu))}</span></div>`;
    else html += `<p class="wm-note">USGS did not estimate how much of this water was consumed in 2015, so the map shows it arriving and stops there.</p>`;
    if (k === 'pt') html += `<p class="wm-note">Plants that pass water through once withdraw the most and return nearly all of it, warmer. Plants with cooling towers withdraw far less but evaporate most of what they take.</p>`;
    if (k === 'ir' || k === 'go') html += `<p class="wm-note">USGS counted golf courses on their own in the ${esc(m.splitWords)}. In ${esc(m.unsplitWords)} golf is inside crop irrigation.</p>`;
    html += `<h5>States that withdrew the most</h5><div class="wm-list">${states.map(([st, v]) => `<button type="button" class="wm-li" data-state="${esc(st)}"><span>${esc(this.app.stateName(st))}</span><span>${volShort(v)}</span></button>`).join('')}</div>
      <h5>Counties that withdrew the most</h5><div class="wm-list">${counties.map((i) => `<button type="button" class="wm-li" data-county="${i}"><span>${esc(m.wu.name[i])}, ${esc(m.wu.st[i])}</span><span>${volShort(m.byCat[c.i][i])}</span></button>`).join('')}</div>`;
    if (k === 'pt') {
      const top = m.plants.map((p, i) => [p, i]).filter(([p]) => p.w_env > 0).sort((a, b) => b[0].w_env - a[0].w_env).slice(0, 6);
      html += `<h5>Plants that withdrew the most</h5><div class="wm-list">${top.map(([p, i]) => `<button type="button" class="wm-li" data-plant="${i}"><span>${esc(p.name)}<small>${esc(genName(p.gen))} · ${esc(coolName(p.cooling))}</small></span><span>${volShort(p.w_env)}</span></button>`).join('')}</div>`;
    }
    html += `<p class="wm-note"><button type="button" class="wm-lnk" data-iso="all">Show every use again</button></p>`;
    this.setInspector(html, true, 'iso');
  }
  showDataCenters() {
    const D = DATA_CENTERS, n = this.m.national;
    const ind = D.indirectGal / 365 / 1e6;
    const osm = this.app.osm;
    const dcCount = osm ? osm.counts[4] : null;
    let top = [];
    if (osm) {
      const byC = [];
      for (const [ci, a] of osm.byCounty) if (a[4] > 0) byC.push([ci, a[4]]);
      top = byC.sort((a, b) => b[1] - a[1]).slice(0, 6);
    }
    const rep = (D.reported || []).slice().sort((a, b) => b.gal - a.gal);
    let html = `<p class="wm-cap">For scale, 2023</p><h3>${sw(DC.color)}Data centers</h3>
      <div class="wm-big">${nf(D.directMgd)} <small>million gallons a day</small></div>
      <p class="wm-sub">consumed on site by every U.S. data center in ${D.year}, about ${nf(D.directGal / 1e9, 1)} billion gallons over the year, by Lawrence Berkeley National Laboratory's estimate. Most of it evaporates in cooling systems.</p>
      <div class="wm-kv">
        <span>Consumed making their electricity, at power plants</span><span>${nf(ind)} Mgal/d</span>
        <span>On site and at power plants together</span><span>${nf(D.directMgd + ind)} Mgal/d</span>
        <span>Golf courses, consumed where reported (2015)</span><span>${nf(n.cu.go)} Mgal/d</span>
        <span>Crop irrigation, consumed (2015)</span><span>${volShort(n.cu.ir)}</span>
        <span>On-site use as a share of all U.S. withdrawals</span><span>${nf(100 * D.directMgd / n.total, 3)}%</span>
      </div>
      <p class="wm-note">Their ${D.electricityTWh} terawatt-hours of electricity are counted at ${D.galPerKWh} gallons per kilowatt-hour, the average water thermoelectric plants consume (<a href="${esc(D.factorUrl)}" target="_blank" rel="noopener">NREL</a>). LBNL’s own estimate, about ${nf(D.lbnlIndirectLiters / 1e9)} billion liters a year, also counts evaporation from hydroelectric reservoirs, which the USGS consumption figures on this map leave out.</p>
      <p class="wm-note">Data centers are not a USGS category. The water they use on site is counted inside public supply and industry, and the water for their electricity inside power plants, so the map draws no separate flows for them. The violet diamonds are data centers mapped in OpenStreetMap${dcCount ? ` (${nf(dcCount)} of them)` : ''}, which misses many.</p>`;
    if (rep.length) html += `<h5>Reported by the operator</h5><div class="wm-list">${rep.map((r) => `<button type="button" class="wm-li" data-go='${esc(JSON.stringify({ x: r.x, z: r.z, d: 30, tilt: 1.0 }))}'><span>${esc(r.name)}<small>${esc(r.op)}, ${esc(r.year)}</small></span><span>${nf(r.gal / 1e6)}M gal</span></button>`).join('')}</div><p class="wm-note">${esc(D.reportedSrc || '')}</p>`;
    if (top.length) html += `<h5>Counties with the most mapped data centers</h5><div class="wm-list">${top.map(([ci, cnt]) => `<button type="button" class="wm-li" data-county="${ci}"><span>${esc(this.m.wu.name[ci])}, ${esc(this.m.wu.st[ci])}</span><span>${nf(cnt)}</span></button>`).join('')}</div>`;
    html += `<p class="wm-note">Source: ${esc(D.src)}. <button type="button" class="wm-lnk" data-open-compare="1">Compare with other uses</button> · <button type="button" class="wm-lnk" data-iso="all">Show every use</button></p>`;
    this.setInspector(html, true, 'iso');
  }
  showGroundwater() {
    const A = this.app.aquifers; if (!A) return;
    const n = this.m.national, g = A.json.national;
    const mapped = A.list.reduce((s, a) => s + a.total, 0);
    const top = A.list.slice().sort((a, b) => b.total - a.total).slice(0, 8);
    const dep = DEPLETION.total;
    const hp = A.list.find((a) => a.name === 'High Plains aquifer');
    const st = hp ? AQ_STORAGE[hp.name] : null;
    let html = `<p class="wm-cap">Underground, 2015</p><h3>Groundwater</h3>
      <div class="wm-big">${nf(g / 1000, 1)} <small>billion gallons a day pumped</small></div>
      <p class="wm-sub">${nf(100 * (n.src.gf + n.src.gs) / n.total)}% of all withdrawals came from wells. Aquifers are layers of sand, gravel and rock that hold water in their pores and cracks. The colored bodies under the land are the principal aquifers the U.S. Geological Survey maps, glowing where counties pump the most.</p>
      <h5>Aquifers pumped the most</h5><div class="wm-list">${top.map((a) => `<button type="button" class="wm-li" data-aq="${a.i}"><span>${esc(a.name)}<small>${esc(a.rock)}</small></span><span>${volShort(a.total)}</span></button>`).join('')}</div>
      <div class="wm-kv">
        <span>From the mapped principal aquifers</span><span>${nf(100 * mapped / g)}%</span>
        <span>Drawn down, 1900–2008</span><span>${nf(dep)} km³</span>
      </div>
      <p class="wm-note">The rest came from glacial, alluvial and other aquifers the map does not outline. ${nf(dep)} cubic kilometers is about ${nf(km3gal(dep) / 1e12)} trillion gallons (Konikow, 2013).${st ? ` The High Plains aquifer alone had about ${nf(st.af / 1e9, 2)} billion acre-feet of recoverable water in storage in ${st.year} (${esc(st.src)}).` : ''} The shapes come from the USGS map; their depth and thickness are drawn the same everywhere, so they are not to scale.</p>`;
    this.setInspector(html, true, 'ground');
  }
  showState(st) {
    const m = this.m, ids = m.states.get(st) || [], agg = m.aggregate(ids);
    const name = this.app.stateName(st);
    const rows = [...m.states.keys()].map((s) => [s, m.aggregate(m.states.get(s)).total]).sort((a, b) => b[1] - a[1]);
    const rank = rows.findIndex((r) => r[0] === st) + 1;
    const top = ids.slice().sort((a, b) => m.total[b] - m.total[a]).slice(0, 6);
    const perCap = agg.pop > 0 ? agg.total * 1e6 / (agg.pop * 1000) : null;
    const big = agg.total >= 1000;
    const topUse = CAT_KEYS.slice().sort((a, b) => agg.W[b] - agg.W[a])[0];
    let html = `<p class="wm-cap">${st === 'PR' || st === 'VI' ? 'Territory' : st === 'DC' ? 'District' : 'State'} · ${ord(rank)} of ${rows.length} by water withdrawn</p><h3>${esc(name)}</h3>
      <div class="wm-big">${big ? nf(agg.total / 1000, 1) : mgd(agg.total)} <small>${big ? 'billion' : 'million'} gallons a day</small></div>
      <p class="wm-sub">${agg.total > 0 ? `${nf(100 * agg.W[topUse] / agg.total)}% for ${esc(CAT[topUse].name.toLowerCase())}. ` : ''}${perCap ? `${nf(agg.pop * 1000)} residents; ${nf(perCap)} gallons a day per resident, all uses.` : ''}</p>
      ${this.sankeyFor(agg, big ? 1000 : 1, big ? (v) => nf(v, v < 10 ? 1 : 0) : (v) => mgd(v))}
      <p class="wm-note">${big ? 'Billion' : 'Million'} gallons a day. The white part of a bar is the share consumed.</p>`;
    if (!agg.splitAll && (agg.W.ir > 0)) html += `<p class="wm-note">USGS reported ${esc(name)}'s crop and golf irrigation as one number, shown here as crops.</p>`;
    html += `<div class="wm-pins">${this.pinButton({ t: 'state', st })}</div>
      <h5>Counties withdrawing the most</h5><div class="wm-list">${top.map((i) => `<button type="button" class="wm-li" data-county="${i}"><span>${esc(m.wu.name[i])}<small>mostly ${esc(CAT[CAT_KEYS.slice().sort((a, b) => m.county(i).W[b] - m.county(i).W[a])[0]].short.toLowerCase())}</small></span><span>${mgd(m.total[i])}</span></button>`).join('')}</div>`;
    this.setInspector(html, true);
  }
  /** one sentence on where a place's water comes from and goes */
  storyOf(c, name) {
    if (!(c.total > 0)) return '';
    const top = CAT_KEYS.slice().sort((a, b) => c.W[b] - c.W[a]);
    const k = top[0], share = pct(c.W[k], c.total);
    const s = c.src[k], tot = Object.values(s).reduce((a, b) => a + b, 0);
    const gw = (s.gf || 0) + (s.gs || 0), sal = (s.ss || 0) + (s.gs || 0);
    const from = gw / tot > 0.6 ? 'pumped mostly from groundwater' : sal / tot > 0.6 ? 'drawn mostly from salt water' : gw / tot > 0.25 ? `drawn from rivers and lakes and pumped from wells (${pct(gw, tot)}% groundwater)` : 'drawn mostly from rivers and lakes';
    const second = top[1] && c.W[top[1]] / c.total > 0.08 ? ` ${CAT[top[1]].name} took ${pct(c.W[top[1]], c.total)}%.` : '';
    return `${share}% of ${esc(name)}'s water went to ${esc(CAT[k].name.toLowerCase())}, ${from}.${second}`;
  }
  showCounty(i, flowNotes = '') {
    const m = this.m, c = m.county(i), agg = m.aggregate([i]);
    const plants = (m.plantsByCounty.get(i) || []).slice().sort((a, b) => (b.w || 0) - (a.w || 0));
    const ph = m.placeholders.filter((h) => h.county === i);
    const perCap = c.pop > 0 ? c.total * 1e6 / (c.pop * 1000) : null;
    const stName = this.app.stateName(c.st);
    let html = `<p class="wm-cap"><button type="button" class="wm-lnk" data-state="${esc(c.st)}">${esc(stName)}</button> · county</p><h3>${esc(c.name)}</h3>
      <div class="wm-big">${mgd(c.total)} <small>million gallons a day</small></div>
      <p class="wm-sub">${this.storyOf(c, c.name)} ${c.total > 0 ? `${ord(m.rank[i])} of ${nf(m.n)} counties by water withdrawn.` : ''}${perCap ? ` ${nf(c.pop * 1000)} residents.` : ''}</p>`;
    if (c.total > 0) {
      html += this.sankeyFor(agg, 1, (v) => mgd(v));
      html += `<p class="wm-note">Million gallons a day. The white part of a bar is the share consumed. The labels on the map name where this county's water comes from.</p>`;
    }
    if (flowNotes) html += flowNotes;
    const kv = [];
    if (c.cu.ir > 0) kv.push([c.split ? 'Crop irrigation consumed' : 'Irrigation consumed', `${mgd(consumedOf(agg, 'ir'))} Mgal/d`]);
    if (c.cu.go > 0) kv.push(['Golf irrigation consumed', `${mgd(consumedOf(agg, 'go'))} Mgal/d`]);
    if (c.cu.pt > 0) kv.push(['Power plants consumed', `${mgd(c.cu.pt)} Mgal/d`]);
    const ptNote = c.cu.pt > c.W.pt + 0.01 ? '<p class="wm-note">The power plants here consumed more than they withdrew, because they also cool with reclaimed wastewater or water bought from utilities, which USGS does not count as their withdrawals.</p>' : '';
    if (c.other.do_del > 0) kv.push(['Delivered to homes by utilities', `${mgd(c.other.do_del)} Mgal/d`]);
    if (c.other.ir_rec + c.other.go_rec > 0) kv.push(['Reclaimed wastewater for irrigation', `${mgd(c.other.ir_rec + c.other.go_rec)} Mgal/d`]);
    if (c.acres.ir > 0) kv.push([c.split ? 'Irrigated cropland' : 'Irrigated land', `${nf(c.acres.ir * 1000)} acres`]);
    if (c.acres.go > 0) kv.push(['Irrigated golf courses', `${nf(c.acres.go * 1000)} acres`]);
    if (kv.length) html += `<div class="wm-kv">${kv.map(([a, b]) => `<span>${a}</span><span>${b}</span>`).join('')}</div>` + ptNote;
    if (!c.split && c.W.ir > 0) html += `<p class="wm-note">USGS reported ${esc(stName)}'s crop and golf irrigation as one number, shown here as crops.</p>`;
    const aq = this.app.aquifers && this.app.aquifers.county ? this.app.aquifers.county[c.id] : null;
    if (aq && aq.length) {
      const tot = aq.reduce((s, r) => s + r[2], 0);
      html += `<h5>Groundwater pumped, by aquifer</h5><div class="wm-bars">${aq.slice(0, 5).map((r) => `<div class="wm-cbar"><span>${r[0] > 0 ? `<button type="button" class="wm-lnk" data-aq="${r[0]}">${esc(r[1])}</button>` : esc(r[1])}</span><span class="wm-t"><i style="width:${(100 * r[2] / Math.max(1e-9, aq[0][2])).toFixed(1)}%"></i></span><span class="wm-v">${mgd(r[2])}</span></div>`).join('')}</div>
        <p class="wm-note">Million gallons a day, ${mgd(tot)} in all (Lovelace and others, 2020). <button type="button" class="wm-lnk" data-under="1">See the aquifers</button></p>`;
    }
    if (plants.length || ph.length) {
      html += `<h5>Water-cooled power plants</h5><div class="wm-list">` + plants.map((p) => `<button type="button" class="wm-li" data-plant="${m.plants.indexOf(p)}"><span>${esc(p.name)}<small>${esc(genName(p.gen))} · ${esc(coolName(p.cooling))}</small></span><span>${mgd(p.w || 0)}</span></button>`).join('') +
        ph.map((h) => `<div class="wm-li"><span>Plants not in the USGS plant model<small>the county total, placed near its towns</small></span><span>${mgd(h.w)}</span></div>`).join('') + `</div>`;
    }
    const osm = this.app.osm && this.app.osm.byCounty.get(i);
    const dams = this.app.damsByCounty && this.app.damsByCounty.get(i);
    if (osm || dams) {
      const rows = [];
      if (dams) rows.push(['Dams in the National Inventory', `${nf(dams.n)}${dams.stor > 0 ? ` · ${af(dams.stor)}` : ''}`]);
      if (osm) OSM_KINDS.forEach((k, j) => { if (osm[j]) rows.push([`${OSM_LABEL[k]}s mapped`, nf(osm[j])]); });
      html += `<h5>Mapped here</h5><div class="wm-kv">${rows.map(([a, b]) => `<span>${a}</span><span>${b}</span>`).join('')}</div>
        <p class="wm-note">Dams from the National Inventory of Dams; facilities from OpenStreetMap, which is incomplete.</p>`;
    }
    html += `<div class="wm-pins">${this.pinButton({ t: 'county', i })}</div>`;
    html += `<p class="wm-note">Volumes are USGS county estimates for 2015. The map places the intakes and use sites inside the county from river, land-cover and city data, so their exact spots are illustrative.</p>`;
    this.setInspector(html, true);
  }
  showPlant(pi) {
    const p = this.m.plants[pi];
    const c = p.county >= 0 ? this.m.county(p.county) : null;
    const wOther = (p.src.rec || 0) + (p.src.ps || 0);
    const intens = p.mwh > 0 && p.w_env > 0 ? (p.w_env * 1e6 * 365) / p.mwh : null;
    const html = `<p class="wm-cap">${esc(genName(p.gen))} power plant</p><h3>${esc(p.name)}</h3>
      <p class="wm-sub">${c ? `${esc(c.name)}, ${esc(this.app.stateName(c.st))}` : esc(p.st)} · cooling water from ${esc(p.src_name && p.src_name !== '-NR-' ? p.src_name : 'an unreported source')}</p>
      <div class="wm-big">${mgd(p.w_env)} <small>million gallons a day withdrawn</small></div>
      <div class="wm-kv">
        <span>Consumed (evaporated)</span><span>${mgd(p.c)} Mgal/d</span>
        <span>Returned</span><span>${mgd(Math.max(0, p.w_env + wOther - p.c))} Mgal/d</span>
        ${wOther > 0 ? `<span>Reclaimed or utility water used</span><span>${mgd(wOther)} Mgal/d</span>` : ''}
        <span>Net generation, 2015</span><span>${nf(p.mwh / 1e6, 2)} TWh</span>
        ${intens ? `<span>Withdrawn per MWh</span><span>${nf(intens)} gal</span>` : ''}
      </div>
      <p class="wm-sub">${esc(coolName(p.cooling))}.</p>
      <h5>USGS plant model</h5>
      <div class="wm-kv"><span>Withdrawal</span><span>${mgd(p.model_w)} Mgal/d</span><span>Range</span><span>${mgd(p.model_w_rng[0])}–${mgd(p.model_w_rng[1])}</span>
        <span>Consumption</span><span>${mgd(p.model_c)} Mgal/d</span><span>Range</span><span>${mgd(p.model_c_rng[0])}–${mgd(p.model_c_rng[1])}</span></div>
      <p class="wm-note">The headline numbers are the county's 2015 thermoelectric estimate (the source of the national total) shared among the county's plants in proportion to the plant model, so they can differ from the model's own figures.</p>
      <div class="wm-pins">${this.pinButton({ t: 'plant', pi })}</div>
      ${p.county >= 0 ? `<div class="wm-list"><button type="button" class="wm-li" data-county="${p.county}"><span>See all of ${esc(c.name)}</span><span>→</span></button></div>` : ''}`;
    this.setInspector(html, true);
  }
  damPurposes(mask) {
    const P = this.app.dams && this.app.dams.meta ? this.app.dams.meta.purposes : null;
    if (!P) return '';
    return P.filter((_, k) => mask & (1 << k)).join(', ');
  }
  showDam(i) {
    const L = this.app.dams; if (!L) return;
    const d = L.data, nm = L.names ? L.names[i] : null;
    const P = L.meta ? L.meta.purposes : [], T = L.meta ? L.meta.types : [], O = L.meta ? L.meta.owners : [];
    const ci = this.app.damCounty ? this.app.damCounty[i] : -1;
    const c = ci >= 0 ? this.m.county(ci) : null;
    const stor = d.stor[i];
    const html = `<p class="wm-cap">Dam · National Inventory of Dams</p><h3>${esc(nm ? nm[0] || 'Unnamed dam' : 'Dam')}</h3>
      <p class="wm-sub">${nm && nm[1] ? `${esc(nm[1])} · ` : ''}${c ? `${esc(c.name)}, ${esc(c.st)}` : ''}</p>
      ${stor > 0 ? `<div class="wm-big">${stor >= 1e6 ? nf(stor / 1e6, 1) : nf(stor)} <small>${stor >= 1e6 ? 'million ' : ''}acre-feet of storage</small></div>
      <p class="wm-sub">${stor > 1e8 ? 'The inventory gives this structure the volume of the natural lake it regulates' : `${nf(stor * 325851 / 1e9, stor * 325851 / 1e9 < 10 ? 2 : 0)} billion gallons at most${d.fl[i] ? '. The inventory gives this structure the storage of the larger project it belongs to' : ''}`}.</p>` : ''}
      <div class="wm-kv">
        <span>Primary purpose</span><span>${esc(P[d.pu[i]] || 'Not reported')}</span>
        ${d.pm[i] ? `<span>All purposes</span><span>${esc(this.damPurposes(d.pm[i]))}</span>` : ''}
        ${d.yr[i] ? `<span>Completed</span><span>${d.yr[i]}</span>` : ''}
        ${d.ht[i] ? `<span>Height</span><span>${nf(d.ht[i])} ft</span>` : ''}
        <span>Type</span><span>${esc(T[d.ty[i]] || '–')}</span>
        <span>Owner</span><span>${esc(O[d.ow[i]] || '–')}</span>
        <span>Hazard potential</span><span>${esc(HAZ[d.hz[i]] || '–')}</span>
      </div>
      <p class="wm-note">From the U.S. Army Corps of Engineers' National Inventory of Dams (data updated ${esc(L.meta ? String(L.meta.updated).replace(/^.*?,/, '') : '2026')}). Hazard potential rates how much harm a failure would do. It says nothing about the dam's condition.</p>
      ${ci >= 0 ? `<div class="wm-list"><button type="button" class="wm-li" data-county="${ci}"><span>See all of ${esc(c.name)}</span><span>→</span></button></div>` : ''}`;
    this.setInspector(html, true);
  }
  showOsm(i) {
    const L = this.app.osm; if (!L) return;
    const k = OSM_KINDS[L.data.kind[i]], nm = L.names ? L.names[i] : '', op = L.ops ? L.ops[i] : '';
    const ci = L.data.county[i];
    const c = ci >= 0 ? this.m.county(ci) : null;
    let body = '';
    if (k === 'data_center') {
      const D = DATA_CENTERS;
      const r = (D.reported || []).find((q) => Math.hypot(q.x - L.data.x[i], q.z - L.data.z[i]) < 1.5);
      body = r ? `<p class="wm-sub">${esc(r.op)} reported that its ${esc(r.name)} data center consumed ${nf(r.gal / 1e6)} million gallons of water in ${esc(r.year)}, about ${nf(r.gal / 365 / 1e6, 2)} million gallons a day.</p>` : '';
      body += `<p class="wm-sub">Most operators do not publish each site's water use. For scale, LBNL estimates all U.S. data centers consumed about ${nf(D.directGal / 1e9, 1)} billion gallons on site in ${D.year}, about ${nf(D.directMgd)} million gallons a day.${c ? ` All uses in ${esc(c.name)} withdrew ${mgd(c.total)} million gallons a day in 2015.` : ''}</p>`;
    } else if (k === 'golf_course') {
      body = c ? (c.split ? `<p class="wm-sub">USGS estimated that golf courses in ${esc(c.name)} withdrew ${mgd(c.W.go)} million gallons a day in 2015 and consumed ${mgd(c.cu.go)}.</p>` : `<p class="wm-sub">USGS did not report golf courses separately in ${esc(this.app.stateName(c.st))}; their water is counted with crop irrigation.</p>`) : '';
    } else if (k === 'wastewater_plant') {
      body = `<p class="wm-sub">The USGS estimates for 2015 do not include wastewater returns, so the map does not draw them. Reclaimed water from a county's wastewater plants is drawn where USGS counted it.</p>`;
    } else if (k === 'water_works') {
      body = c ? `<p class="wm-sub">Public water systems in ${esc(c.name)} withdrew ${mgd(c.W.ps)} million gallons a day in 2015. Where a county has a mapped treatment plant, the map routes its public supply through one.</p>` : '';
    } else {
      body = c ? `<p class="wm-sub">Water towers store treated water and keep the pipes pressurized. Public water systems in ${esc(c.name)} withdrew ${mgd(c.W.ps)} million gallons a day in 2015.</p>` : '';
    }
    const html = `<p class="wm-cap">${esc(OSM_LABEL[k])} · OpenStreetMap</p><h3>${esc(nm || OSM_LABEL[k])}</h3>
      <p class="wm-sub">${op ? `${esc(op)} · ` : ''}${c ? `${esc(c.name)}, ${esc(c.st)}` : ''}</p>${body}
      <p class="wm-note">Location from OpenStreetMap (© OpenStreetMap contributors, ODbL), which maps many but not all such places.</p>
      ${ci >= 0 ? `<div class="wm-list"><button type="button" class="wm-li" data-county="${ci}"><span>See all of ${esc(c.name)}</span><span>→</span></button></div>` : ''}`;
    this.setInspector(html, true);
  }
  showAqueduct(a) {
    const f = a.flow;
    const kind = a.kind === 'aqueduct' ? 'Aqueduct' : 'Canal';
    let html = `<p class="wm-cap">${kind}${a.op ? ` · ${esc(a.op)}` : ''}</p><h3>${esc(a.name)}</h3>`;
    if (f) {
      const when = f.when != null ? f.when : `in ${f.year}`;
      html += `<div class="wm-big">${f.mgd >= 1000 ? nf(f.mgd / 1000, 2) : nf(f.mgd)} <small>${f.mgd >= 1000 ? 'billion' : 'million'} gallons a day</small></div>
        <p class="wm-sub">${esc(f.what)}${when ? ` ${esc(when)}` : ''}${f.af ? `, or ${nf(f.af)} acre-feet over the year` : ''}.</p>
        ${f.note ? `<p class="wm-sub">${esc(f.note)}</p>` : ''}
        <p class="wm-note">Source: <a href="${esc(f.url)}" target="_blank" rel="noopener">${esc(f.src)}</a>.</p>`;
    } else {
      html += `<p class="wm-sub">${a.km ? `About ${nf(a.km)} kilometers of it are mapped. ` : ''}The map has no measured flow for it.</p>`;
    }
    html += `<p class="wm-note">Route from OpenStreetMap (© OpenStreetMap contributors, ODbL). Tunnels and buried pipe are often missing.</p>`;
    this.setInspector(html, true);
  }
  showAquifer(ai) {
    const A = this.app.aquifers; if (!A) return;
    const a = A.byIndex.get(ai); if (!a) return;
    const g = a.gw, tot = a.total;
    const rows = [['Crop irrigation', Math.max(0, (g.it || 0) - g.ig)], ['Golf courses', g.ig], ['Public supply', g.ps], ['Homes on private wells', g.do], ['Industry', g.in], ['Livestock', g.li], ['Fish farms', g.aq], ['Mining', g.mi], ['Power plants', g.pt]].filter((r) => r[1] > 0.05).sort((x, y) => y[1] - x[1]);
    const dep = DEPLETION.byAquifer[a.name], st = AQ_STORAGE[a.name];
    const area = A.area ? A.area.get(ai) : null;
    let html = `<p class="wm-cap">Principal aquifer · ${esc(a.rock)}</p><h3>${esc(a.name)}</h3>
      <div class="wm-big">${tot >= 1000 ? nf(tot / 1000, 1) : mgd(tot)} <small>${tot >= 1000 ? 'billion' : 'million'} gallons a day pumped, 2015</small></div>
      <p class="wm-sub">${nf(100 * tot / A.json.national, 1)}% of all U.S. groundwater withdrawals${rows.length ? `, ${pct(rows[0][1], tot)}% of it for ${esc(rows[0][0].toLowerCase())}` : ''}.${area ? ` Its outline on the map covers about ${nf(Math.round(area / 1000) * 1000)} square miles.` : ''}</p>
      <div class="wm-bars">${rows.map((r) => `<div class="wm-cbar"><span>${r[0]}</span><span class="wm-t"><i style="width:${(100 * r[1] / rows[0][1]).toFixed(1)}%"></i></span><span class="wm-v">${mgd(r[1])}</span></div>`).join('')}</div>`;
    if (st || dep) {
      html += `<div class="wm-kv">${st ? `<span>Recoverable water in storage, ${esc(st.year)}</span><span>${af(st.af)}</span>` : ''}${dep ? `<span>${dep.km3 >= 0 ? 'Drawn down' : 'Gained'}, 1900–2008</span><span>${nf(Math.abs(dep.km3), 1)} km³</span>` : ''}</div>`;
      html += `<p class="wm-note">${st ? `${esc(st.src)}. ` : ''}${dep ? `${esc(dep.note || '')} Konikow (2013), groundwater depletion in the United States.` : ''}</p>`;
    }
    html += `<p class="wm-note">Million gallons a day. Lovelace and others (2020), groundwater withdrawals from principal aquifers for 2015 (USGS), drawn on the USGS map of principal aquifers. The map shows the uppermost principal aquifer at each place.</p>`;
    this.setInspector(html, true);
  }

  // ------------------------------------------------------------ tooltip
  tip(x, y, html) {
    const el = this.$('[data-tip]');
    if (!html) { el.hidden = true; return; }
    el.innerHTML = html; el.hidden = false;
    const sr = this.root.getBoundingClientRect();
    const r = el.getBoundingClientRect(), W = sr.width, H = sr.height;
    let tx = x - sr.left + 14, ty = y - sr.top + 14;
    if (tx + r.width > W - 8) tx = x - sr.left - r.width - 14;
    if (ty + r.height > H - 8) ty = y - sr.top - r.height - 14;
    el.style.transform = `translate(${Math.max(8, tx).toFixed(0)}px, ${Math.max(8, ty).toFixed(0)}px)`;
  }
  countyTip(i, cls) {
    const c = this.m.county(i);
    const top = CAT_KEYS.slice().sort((a, b) => c.W[b] - c.W[a])[0];
    const iso = this.app.iso && CAT[this.app.iso] ? this.app.iso : null;
    const line = iso ? `${volShort(c.W[iso])} for ${esc(CAT[iso].name.toLowerCase())}` : `${volShort(c.total)} withdrawn${c.total > 0 ? ` · ${pct(c.W[top], c.total)}% ${esc(CAT[top].short.toLowerCase())}` : ''}`;
    return `<b>${esc(c.name)}, ${esc(c.st)}</b><span>${line}</span>${cls > 0 ? `<span class="wm-tip-lc">Land here: ${esc(NLCD_CLASSES[cls].toLowerCase())}</span>` : ''}<span class="wm-tip-hint">Click to trace its water</span>`;
  }
  riverTip(r) {
    const cfs = r.q * 35.3147;
    return `<b>${esc(riverLabel(r.name))}</b><span>about ${nf(r.q, r.q < 10 ? 1 : 0)} m³/s (${nf(cfs)} cfs) mean natural flow here, as modeled for 1971–2000</span>`;
  }
  damTip(d) {
    return `<b>${esc(d.name || 'Dam')}</b><span>${d.lake ? `Holds back ${esc(lakeLabel(d.lake))}` : 'Reservoir outlet'}${d.river ? ` on the ${esc(riverLabel(d.river))}` : ''}${d.ne_dam && d.year > 1800 ? ` · completed ${d.year}` : ''}</span>`;
  }
  nidTip(i) {
    const L = this.app.dams, d = L.data, nm = L.names ? L.names[i] : null, P = L.meta ? L.meta.purposes : [];
    const stor = d.stor[i];
    return `<b>${esc(nm ? nm[0] || 'Dam' : 'Dam')}</b><span>${nm && nm[1] ? `${esc(nm[1])} · ` : ''}${esc(P[d.pu[i]] || 'Dam')}${d.yr[i] ? ` · ${d.yr[i]}` : ''}${stor > 0 && !d.fl[i] ? ` · ${af(stor)}` : ''}</span>`;
  }
  osmTip(i) {
    const L = this.app.osm, k = OSM_KINDS[L.data.kind[i]], nm = L.names ? L.names[i] : '', op = L.ops ? L.ops[i] : '';
    return `<b>${esc(nm || OSM_LABEL[k])}</b><span>${esc(OSM_LABEL[k])}${op && op !== nm ? ` · ${esc(op)}` : ''}</span>`;
  }
  aqTip(a) {
    const f = a.flow;
    return `<b>${esc(a.name)}</b><span>${a.kind === 'aqueduct' ? 'Aqueduct' : 'Canal'}${a.op ? ` · ${esc(a.op)}` : ''}</span>${f ? `<span>${mgd(f.mgd)} Mgal/d ${esc(f.what)} (${esc(f.year)})</span><span class="wm-tip-hint">Click for the source</span>` : ''}`;
  }
  aquiferTip(ai) {
    const a = this.app.aquifers && this.app.aquifers.byIndex.get(ai); if (!a) return '';
    return `<b>${esc(a.name)}</b><span>${esc(a.rock)} · ${volShort(a.total)} pumped in 2015</span>`;
  }
  plantTip(pi) {
    const p = this.m.plants[pi];
    return `<b>${esc(p.name)}</b><span>${esc(genName(p.gen))} · ${mgd(p.w_env)} Mgal/d withdrawn, ${mgd(p.c)} consumed</span>`;
  }
  setScale(unit, detail) {
    const el = this.$('[data-scale]'); if (!el) return;
    el.textContent = `Each streak carries about ${unit >= 1 ? `${nf(unit, unit < 10 ? 1 : 0)} million` : nf(Math.round(unit * 1000) * 1000)} gallons a day${detail ? ' at this zoom' : ''}.`;
  }

  // ------------------------------------------------------------ compare
  pin(item) {
    const key = JSON.stringify(item);
    if (!this.pins.some((p) => JSON.stringify(p) === key)) this.pins.push(item);
    if (this.pins.length > 6) this.pins.shift();
    this.$('[data-a="compare"]').classList.add('on');
    this.$('[data-cnt]').textContent = this.pins.length ? ` (${this.pins.length})` : '';
  }
  itemRow(it) {
    const m = this.m;
    if (it.t === 'county') { const c = m.county(it.i); return { label: `${c.name}, ${c.st}`, w: c.total, c: c.cu.ir + c.cu.go + c.cu.pt, year: '2015', src: 'USGS' }; }
    if (it.t === 'state') { const a = m.aggregate(m.states.get(it.st) || []); return { label: this.app.stateName(it.st), w: a.total, c: a.cu.ir + a.cu.go + a.cu.pt, year: '2015', src: 'USGS' }; }
    if (it.t === 'plant') { const p = m.plants[it.pi]; return { label: p.name, w: p.w_env || 0, c: p.c || 0, year: '2015', src: 'USGS' }; }
    return null;
  }
  buildCompare() {
    const box = this.$('[data-compare]');
    this.on(box, 'click', (e) => { if (e.target === box) this.closeCompare(); });
    this.on(box, 'keydown', (e) => { if (e.key === 'Escape') this.closeCompare(); });
  }
  closeCompare() { this.$('[data-compare]').hidden = true; this.$('[data-a="compare"]').focus?.(); }
  openCompare() {
    const m = this.m, n = m.national, D = DATA_CENTERS;
    const dcAll = (D.directGal + D.indirectGal) / 365 / 1e6;
    const ref = [
      { label: 'U.S. data centers, on site', v: D.directMgd, kind: 'c', year: '2023', src: 'LBNL 2024' },
      { label: 'U.S. data centers, with their electricity', v: dcAll, kind: 'c', year: '2023', src: 'LBNL 2024' },
      { label: 'Golf courses where reported', v: n.cu.go, kind: 'c', year: '2015', src: 'USGS' },
      { label: 'Golf courses where reported', v: n.W.go, kind: 'w', year: '2015', src: 'USGS' },
      { label: 'Livestock', v: n.W.li, kind: 'w', year: '2015', src: 'USGS' },
      { label: 'Homes on private wells', v: n.W.do, kind: 'w', year: '2015', src: 'USGS' },
      { label: 'Power plants', v: n.cu.pt, kind: 'c', year: '2015', src: 'USGS' },
      { label: 'Public water systems', v: n.W.ps, kind: 'w', year: '2015', src: 'USGS' },
      { label: 'Crop irrigation', v: n.cu.ir, kind: 'c', year: '2015', src: 'USGS' },
      { label: 'Power plants', v: n.W.pt, kind: 'w', year: '2015', src: 'USGS' },
      { label: 'Every use', v: n.total, kind: 'w', year: '2015', src: 'USGS' },
    ];
    for (const [name, f] of Object.entries(AQ_FLOWS)) if (['Central Arizona Project Canal', 'California Aqueduct', 'Colorado River Aqueduct', 'Catskill Aqueduct'].includes(name)) ref.push({ label: name.replace(' Canal', ''), v: f.mgd, kind: 't', year: f.year, src: 'operator' });
    const picks = this.pins.map((p) => this.itemRow(p)).filter(Boolean);
    const rows = [...ref, ...picks.flatMap((p) => [{ label: p.label, v: p.w, kind: 'w', year: p.year, src: p.src, pick: true }, ...(p.c > 0 ? [{ label: p.label, v: p.c, kind: 'c', year: p.year, src: p.src, pick: true }] : [])])].filter((r) => r.v > 0).sort((a, b) => a.v - b.v);
    const lo = Math.log10(Math.min(...rows.map((r) => r.v)) / 2), hi = Math.log10(Math.max(...rows.map((r) => r.v)) * 1.5);
    const X = (v) => (100 * (Math.log10(v) - lo)) / (hi - lo);
    const KIND = { w: 'withdrawn', c: 'consumed', t: 'carried' };
    const ticks = []; for (let e = Math.ceil(lo); e <= Math.floor(hi); e++) ticks.push(e);
    const tl = (e) => { const v = Math.pow(10, e); return v >= 1000 ? `${nf(v / 1000)}B` : v >= 1 ? `${nf(v)}M` : `${nf(v * 1000)}k`; };
    this.$('[data-compare-box]').innerHTML = `<h3>Compare</h3>
      <p class="wm-sub">Million gallons a day on a log scale: each step to the right is ten times more water. Solid bars are water consumed (evaporated or otherwise used up); outlined bars are water withdrawn, most of which goes back to rivers and aquifers. Years differ, so read them as orders of magnitude.</p>
      <div class="wm-cmp">
        <div class="wm-cmp-ticks">${ticks.map((e) => `<span style="left:${X(Math.pow(10, e)).toFixed(2)}%">${tl(e)}</span>`).join('')}</div>
        ${rows.map((r) => `<div class="wm-cmp-row${r.pick ? ' pick' : ''}"><div class="wm-cmp-l">${esc(r.label)}<small>${KIND[r.kind]}, ${esc(r.year)}</small></div><div class="wm-cmp-t">${ticks.map((e) => `<i class="g" style="left:${X(Math.pow(10, e)).toFixed(2)}%"></i>`).join('')}<i class="b ${r.kind}" style="width:${X(r.v).toFixed(2)}%"></i></div><div class="wm-cmp-v">${mgd(r.v)}</div></div>`).join('')}
      </div>
      <p class="wm-note">${picks.length ? '' : 'Add counties, states or power plants with the + Compare button in their panels. '}Data centers: ${esc(D.src)}, on-site consumption of ${nf(D.directLiters / 1e9)} billion liters, plus their ${D.electricityTWh} TWh of electricity at ${D.galPerKWh} gallons per kilowatt-hour consumed by thermoelectric plants (NREL). Golf: USGS 2015 in the ${esc(m.splitWords)} that reported golf separately, so the national figure is higher. Aqueducts: the operators' and Bureau of Reclamation's reports (click an aqueduct on the map for each source).</p>
      <p class="wm-cmp-bs"><button type="button" class="wm-btn" data-a="clear">Clear my picks</button> <button type="button" class="wm-btn" data-a="close">Close</button></p>`;
    const box = this.$('[data-compare]');
    box.hidden = false;
    this.on(box.querySelector('[data-a="close"]'), 'click', () => this.closeCompare());
    this.on(box.querySelector('[data-a="clear"]'), 'click', () => { this.pins = []; this.$('[data-cnt]').textContent = ''; this.openCompare(); });
    box.querySelector('[data-a="close"]').focus();
  }

  // ------------------------------------------------------------ search
  buildSearch() {
    const input = this.$('[data-search]'), box = this.$('[data-results]');
    let items = [], act = 0;
    const render = () => {
      box.innerHTML = items.map((it, i) => `<div class="wm-r${i === act ? ' act' : ''}" role="option" aria-selected="${i === act}" data-i="${i}"><span>${esc(it.label)}</span><small>${esc(it.kind)}</small></div>`).join('');
      box.classList.toggle('show', items.length > 0);
      for (const el of box.querySelectorAll('.wm-r')) this.on(el, 'mousedown', (e) => { e.preventDefault(); choose(+el.dataset.i); });
    };
    const choose = (i) => { const it = items[i]; if (!it) return; input.value = it.label; box.classList.remove('show'); input.blur(); this.app.goSearch(it); };
    this.on(input, 'focus', () => this.app.loadNames?.());
    this.on(input, 'input', () => {
      const q = input.value.trim().toLowerCase();
      act = 0;
      if (q.length < 2) { items = []; render(); return; }
      const idx = this.app.searchIndex();
      const scored = [];
      for (const it of idx) {
        const p = it.key.indexOf(q);
        if (p < 0) continue;
        scored.push([(p === 0 ? 0 : p > 0 && it.key[p - 1] === ' ' ? 1 : 2) * 1e6 - it.weight, it]);
      }
      scored.sort((a, b) => a[0] - b[0]);
      items = scored.slice(0, 9).map((s) => s[1]);
      render();
    });
    this.on(input, 'keydown', (e) => {
      if (e.key === 'ArrowDown') { act = Math.min(items.length - 1, act + 1); render(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { act = Math.max(0, act - 1); render(); e.preventDefault(); }
      else if (e.key === 'Enter') { choose(act); e.preventDefault(); }
      else if (e.key === 'Escape') { box.classList.remove('show'); input.blur(); }
    });
    this.on(input, 'blur', () => setTimeout(() => box.classList.remove('show'), 150));
  }
  buildButtons() {
    if (this.root.clientWidth < 760) this.$('[data-search]').placeholder = 'Search';
    const act = {
      home: () => this.app.goHome(),
      tour: () => this.app.tour.toggle(),
      night: () => this.app.setNight(!this.app.night),
      under: () => this.app.setUnderground(!this.app.underground),
      compare: () => this.openCompare(),
      full: () => this.app.toggleExpanded(),
      layers: () => { const el = this.$('[data-layers]'); el.hidden = !el.hidden; this.$('[data-a="layers"]').setAttribute('aria-expanded', String(!el.hidden)); this.$('[data-a="layers"]').classList.toggle('on', !el.hidden); },
    };
    for (const b of this.$$('[data-bar] [data-a]')) this.on(b, 'click', () => act[b.dataset.a]?.());
    // the layers sheet closes when you click elsewhere
    this.on(document, 'pointerdown', (e) => {
      const el = this.$('[data-layers]');
      if (!el.hidden && !el.contains(e.target) && !this.$('[data-a="layers"]').contains(e.target)) { el.hidden = true; this.$('[data-a="layers"]').setAttribute('aria-expanded', 'false'); this.$('[data-a="layers"]').classList.remove('on'); }
    });
  }
}
