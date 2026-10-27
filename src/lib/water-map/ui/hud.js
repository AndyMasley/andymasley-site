import { CATS, CAT, DC, riverLabel, lakeLabel, PHONE_MQ, SRC_DEF, RETURN_GRAY, AP_STATE } from '../core/config.js';
import { CAT_KEYS } from '../flow/model.js';
import { chanPx } from '../flow/particles.js';
import { sankeySVG, sankey3SVG } from './sankey.js';
import { AQ_FLOWS, DATA_CENTERS, DEPLETION, AQ_STORAGE, COUNTY_NOTES, HP_LEVELS, propIrNote } from '../core/flows_data.js';
import { OSM_KINDS, OSM_LABEL, FAC_KINDS, facCat, facLabel } from '../net/infra.js';
import { NLCD_CLASSES } from '../world/nlcd.js';
import { ROCK_COLORS } from '../world/aquifers.js';
import { esc, nf, vol, volShort, mgd, mgdLabel, af, pct, ord, km3gal, shareTxt, sig2 } from './fmt.js';

export { SRC_DEF };
const SRC_ROWS = ['sf', 'ss', 'gf', 'gs'].map((key) => ({ key, name: SRC_DEF[key].name, color: SRC_DEF[key].color }));
const CONSUMED_NOTE = 'USGS estimated consumption (water that evaporates, goes into crops or products, or is otherwise used up) only for crops, golf courses and power plants in 2015.';
const genName = (g) => ({ NGCC: 'Natural gas, combined cycle', COAL: 'Coal', 'GAS STEAM': 'Natural gas, steam', BIOMASS: 'Biomass', COMPLEX: 'Mixed fuels', NUCLEAR: 'Nuclear', OIL: 'Oil', 'OIL CC': 'Oil, combined cycle' }[g] || g);
const coolName = (c) => ({ 'RECIRCULATING TOWER': 'Cooling towers (recirculating)', 'ONCE-THROUGH FRESH': 'Once-through, fresh water', 'ONCE-THROUGH SALINE': 'Once-through, salt water', 'RECIRCULATING POND': 'Cooling pond (recirculating)', COMPLEX: 'Several cooling systems' }[c] || c);
const consumedOf = (agg, k) => (k === 'ir' ? Math.min(agg.cu.ir, agg.W.ir + agg.other.ir_rec) : k === 'go' ? Math.min(agg.cu.go, agg.W.go + agg.other.go_rec) : k === 'pt' ? Math.min(agg.cu.pt, agg.W.pt) : 0);
const HAZ = ['Not determined', 'Low', 'Significant', 'High'];
const sw = (c) => `<i class="wm-sw" style="background:${c}"></i>`;
const CONSUMED_WHITE = '#f4f1ea';
/** "mostly from the High Plains aquifer", from a county's [[index, name, Mgal/d], ...] list (Lovelace and others, 2020) */
function aquiferWords(aq) {
  if (!aq || !aq.length) return '';
  const tot = aq.reduce((a, r) => a + r[2], 0);
  if (!(tot > 0)) return '';
  const nm = (r) => (r[0] > 0 ? `the ${r[1]}` : r[1].replace(/\s*\(.*\)$/, '').toLowerCase());
  if (aq[0][2] / tot >= 0.6) return `mostly from ${nm(aq[0])}`;
  if (aq[1] && (aq[0][2] + aq[1][2]) / tot >= 0.6) return `from ${nm(aq[0])} and ${nm(aq[1])}`;
  return `from ${nm(aq[0])} and others`;
}
/** the kind of water a plant reports in the USGS plant model, in the same classes as the county figures */
export function plantClass(p) {
  const s = p.wsrc || '', w = p.wtype || '';
  if (s.startsWith('GW')) return /SA|BR/.test(w) ? 'gs' : 'gf';
  if (s.startsWith('PD')) return /BE/.test(w) ? 'rec' : 'ps';
  if (s.startsWith('SW')) return /SA|BE|BR/.test(w) ? 'ss' : 'sf';
  return null;
}
const GENERIC_SRC = /^(wells?|well water|groundwater|municipal(ity)?( water)?|city water|potable.*|-?nr-?)$/i;
/** a plant's water source as the plant model spells it, tidied: no shouting capitals, "the" only where it belongs */
// (the plant model's names, where they are cut short, misspelled, or name the river a plant's intake lake was made from)
const SRC_FIX = {
  'Swauano Creek Reserv': 'Swauano Creek Reservoir', 'Chicago Sanitary and Ship': 'Chicago Sanitary and Ship Canal',
  'The Inner Costal Water Way': 'Intracoastal Waterway', 'Lake Dardenelle': 'Lake Dardanelle', 'Lacygne Lake': 'La Cygne Lake',
  'Clinch And Emory Rivers': 'Clinch and Emory rivers', 'Desplaines River': 'Des Plaines River', 'Hyco Lake (Hyco River)': 'Hyco Lake',
  'Keowee River': 'Lake Keowee', 'Missouri River, Wells': 'Missouri River and wells',
};
export function srcName(raw) {
  let n = (raw || '').trim();
  if (!n || GENERIC_SRC.test(n)) return null;
  if (n === n.toUpperCase() && /[A-Z]{3}/.test(n)) n = n.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase());
  n = SRC_FIX[n] || n;
  return n.replace(/\bSt\s/g, 'St. ').replace(/\bMt\.?\s/g, 'Mount ');
}
// (rivers, bays and reservoirs take "the"; lakes, creeks, sounds and ponds go without: Lake Norman, Belews Lake, Squaw Creek)
export const withThe = (n) => (/^(lake|lakes|mount|fort|port)\b/i.test(n) || /[\/,&]/.test(n)
  || /\b(lake|creek|sound|pond|brook|run|branch|harbor|springs?|slough|bayou)$/i.test(n.replace(/\s*\(.*\)\s*$/, '')) ? n : `the ${n}`);
/**
 * a stacked bar and one line per part: name (with a note under it), share, volume (none when `fmtV` is null).
 * Sources have round swatches, like the dots the map draws at them; uses and fates have square ones.
 */
function mixBlock(rows, fmtV = (v) => `${mgd(v)} Mgal/d`) {
  const parts = rows.filter((r) => r.v > 0);
  const tot = parts.reduce((a, r) => a + r.v, 0);
  if (!(tot > 0)) return '';
  const bar = parts.map((r) => `<i style="width:${(100 * r.v / tot).toFixed(2)}%;background:${r.color}"></i>`).join('');
  const list = parts.map((r) => `<div class="wm-mix-r${fmtV ? '' : ' wm-mix-r2'}"><span class="wm-mix-n">${r.round ? `<i class="wm-sw wm-sw-src" style="background:${r.color}"></i>` : sw(r.color)}<span>${esc(r.name)}${r.sub ? `<small>${esc(r.sub)}</small>` : ''}</span></span><span class="wm-mix-p">${shareTxt(r.v / tot)}</span>${fmtV ? `<span class="wm-mix-v">${fmtV(r.v)}</span>` : ''}</div>`).join('');
  return `<div class="wm-mix"><div class="wm-stack">${bar}</div>${list}</div>`;
}
/** the source-colored line that stands for one width of channel in the reading key */
const keyChannel = (w, c) => `<svg width="28" height="16" viewBox="0 0 28 16" aria-hidden="true"><path d="M1 8 H27" stroke="#0a1310" stroke-width="${(w + 3).toFixed(1)}"/><path d="M1 8 H27" stroke="${c}" stroke-width="${w.toFixed(1)}"/></svg>`;

/**
 * Everything drawn over the map: the use picker on the left, the reading key, the inspector on the right, the toolbar,
 * the tooltip and the tour caption. Built into the stage element; every query is scoped to it.
 */
export class Hud {
  constructor(app, stage) {
    this.app = app; this.m = app.model; this.root = stage;
    this.$ = (s) => stage.querySelector(s);
    this.$$ = (s) => stage.querySelectorAll(s);
    // (the National Inventory's 92,000 dams are a layer to turn on: as marks everywhere they read as noise)
    this.layers = { rivers: true, flows: true, plants: true, labels: true, nid: false, infra: true, towers: false, golf: false, dc: false, fac: true };
    this.choro = 'none';
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
      <div class="wm-left" data-left>
      <section class="wm-panel wm-uses" data-uses aria-label="Where the water goes: choose a use or a source to show">
        <button class="wm-uses-head" type="button" data-uses-head aria-expanded="true"><span class="wm-cap" data-uses-cap>Show the water for</span><i class="wm-caret" aria-hidden="true"></i></button>
        <div class="wm-uses-body">
          <div class="wm-seg" role="radiogroup" aria-label="Water withdrawn or consumed" data-measure>
            <button type="button" role="radio" aria-checked="true" class="on" data-m="w">Withdrawn</button><button type="button" role="radio" aria-checked="false" data-m="c">Consumed</button>
          </div>
          <div class="wm-usesk" data-usesk></div>
          <p class="wm-sk-cap" data-sk-cap hidden></p>
          <div class="wm-rows" role="radiogroup" aria-label="Uses of water" data-rows></div>
          <p class="wm-note" data-rows-note></p>
        </div>
      </section>
      <section class="wm-panel wm-key" data-key aria-label="How to read the map">
        <button class="wm-key-head" type="button" data-key-head aria-expanded="true"><span class="wm-cap">How to read the map</span><i class="wm-caret" aria-hidden="true"></i></button>
        <div class="wm-key-body">
          <div class="wm-key-row"><svg viewBox="0 0 40 12" aria-hidden="true"><path d="M2 3 H11" stroke="#ee7a3a" stroke-width="1.6" opacity=".35"/><circle cx="12.5" cy="3" r="1.7" fill="#ee7a3a"/><path d="M9 9 H20" stroke="#3cc483" stroke-width="1.6" opacity=".35"/><circle cx="21.5" cy="9" r="1.7" fill="#3cc483"/><path d="M22 4.5 H32" stroke="#f2cf63" stroke-width="1.6" opacity=".35"/><circle cx="33.5" cy="4.5" r="1.7" fill="#f2cf63"/></svg><span>Streaks are water moving from where it was drawn to where it was used, in the color of that use.</span></div>
          <div class="wm-key-row"><svg viewBox="0 0 40 12" aria-hidden="true"><circle cx="9" cy="6" r="5" fill="#ee7a3a" stroke="#0a1310" stroke-width="1"/><path d="M9 6 V1 A5 5 0 0 1 13.3 3.5 Z" fill="${CONSUMED_WHITE}"/><circle cx="27" cy="6" r="4" fill="#3cc483" stroke="#0a1310" stroke-width="1"/><path d="M27 6 V2 A4 4 0 1 1 23.2 7.2 Z" fill="${CONSUMED_WHITE}"/></svg><span>From afar, a disc marks each of the 40 places that withdrew the most: a power plant, or a county’s water for one use. It is in the color of the use and a little wider than a channel carrying that much water; its white slice is the share consumed.</span></div>
          <div class="wm-key-row"><svg viewBox="0 0 40 12" aria-hidden="true"><defs><linearGradient id="wm-kg" x1="0" x2="1"><stop offset="0.1" stop-color="${SRC_DEF.sf.color}"/><stop offset="0.7" stop-color="#f2cf63"/></linearGradient></defs><path d="M5 6 C14 6 22 6 33 6" fill="none" stroke="#0a1310" stroke-width="6"/><path d="M5 6 C14 6 22 6 33 6" fill="none" stroke="url(#wm-kg)" stroke-width="3.6"/><circle cx="5" cy="6" r="3.2" fill="${SRC_DEF.sf.color}" stroke="#0a1310" stroke-width="1"/><rect x="31" y="2.5" width="7" height="7" fill="#f2cf63" stroke="#0a1310" stroke-width="1"/></svg><span>Zoom in and the channels appear, the biggest first, wider for more water. Each starts in the color of its source and turns to the color of its use, with a chevron pointing the way it goes. A dot is an intake on a river or lake, a ring a well, a square where a utility, factory or fish farm gathers its water.</span></div>
          <div class="wm-key-row"><svg viewBox="0 0 40 12" aria-hidden="true"><path d="M2 9 C12 9 20 3 38 3" fill="none" stroke="#0a1310" stroke-width="6.5"/><path d="M2 9 C12 9 20 3 38 3" fill="none" stroke="#f2cf63" stroke-width="4.5"/><circle cx="2.5" cy="9" r="2.6" fill="${SRC_DEF.sf.color}" stroke="#0a1310" stroke-width="1"/></svg><span>The long ones carry a city’s water from reservoirs in other counties, such as New York’s from the Catskills.</span></div>
          <div class="wm-key-widths"><span class="wm-key-wl">Channel width</span>${[10, 100, 1000].map((v) => `<span>${keyChannel(chanPx(v), '#d8d2c2')}${esc(nf(v))} Mgal/d</span>`).join('')}</div>
          <div class="wm-key-row"><svg viewBox="0 0 40 12" aria-hidden="true"><path d="M5 7 C13 7 16 6 22 6" fill="none" stroke="#0a1310" stroke-width="5.5"/><path d="M5 7 C13 7 16 6 22 6" fill="none" stroke="#7fe0b8" stroke-width="3.5"/><path d="M22 6 C28 6 31 2.5 38 2.5 M22 6 C28 6 31 9.5 38 9.5" fill="none" stroke="#7fe0b8" stroke-width="1.4"/><circle cx="5" cy="7" r="3" fill="none" stroke="#7fe0b8" stroke-width="1.6"/></svg><span>Click a place to draw its water in the color of each source, with the share from each in a box. Its channels are then sized by share of its water.</span></div>
          <p class="wm-key-src">${['sf', 'gf', 'ss', 'rec', 'ps'].map((k) => `<span><i class="wm-sw wm-sw-src" style="background:${SRC_DEF[k].color}"></i>${esc(SRC_DEF[k].name)}</span>`).join('')}</p>
          <div class="wm-key-row"><svg viewBox="0 0 40 12" aria-hidden="true"><path d="M14 11 C12 7 18 6 15 1 M24 11 C22 7 28 6 25 1" fill="none" stroke="#f4f1ea" stroke-width="1.4" stroke-linecap="round" opacity=".85"/></svg><span>White mist is water consumed, which USGS estimated only for crops, golf courses and power plants.</span></div>
          <div class="wm-key-row"><svg viewBox="0 0 40 12" aria-hidden="true"><path d="M4 4 Q20 12 36 6" fill="none" stroke="${RETURN_GRAY}" stroke-width="2" stroke-dasharray="5 3"/></svg><span>Gray dashes are water going back to rivers after it was used.</span></div>
          <div class="wm-key-row"><svg viewBox="0 0 40 12" aria-hidden="true"><circle cx="12" cy="6" r="4.5" fill="${RETURN_GRAY}"/><path d="M12 6 V1.5 A4.5 4.5 0 0 1 15.9 8.25 Z" fill="${CONSUMED_WHITE}"/><circle cx="12" cy="6" r="4.6" fill="none" stroke="${CAT.pt.color}" stroke-width="1.6"/><circle cx="28" cy="6" r="4.5" fill="${RETURN_GRAY}"/><path d="M28 6 V1.5 A4.5 4.5 0 1 1 23.7 4.6 Z" fill="${CONSUMED_WHITE}"/><circle cx="28" cy="6" r="4.6" fill="none" stroke="${CAT.ir.color}" stroke-width="1.6"/></svg><span>Closer in, a disc at each power plant and in each county’s fields and golf courses, ringed in the color of the use, shows what became of the water: white for the share consumed, gray for the share returned.</span></div>
          <div class="wm-key-row"><svg viewBox="0 0 40 12" aria-hidden="true"><rect x="3" y="3" width="6" height="6" fill="#f2cf63" stroke="#0a1310"/><circle cx="20" cy="6" r="3" fill="none" stroke="#e8dcb4" stroke-width="1.6"/><circle cx="32" cy="6" r="3" fill="${CAT.go.color}" stroke="#0a1310"/></svg><span>Water treatment plants, as OpenStreetMap maps them. Water towers, wastewater plants and golf courses are under Layers.</span></div>
          <div class="wm-key-row"><svg viewBox="0 0 40 12" aria-hidden="true"><rect x="3" y="3" width="6" height="6" fill="${CAT.in.color}" stroke="#0a1310"/><path d="M20 2 L24 6 L20 10 L16 6 Z" fill="${CAT.mi.color}" stroke="#0a1310"/><circle cx="32" cy="6" r="3" fill="${CAT.aq.color}" stroke="#0a1310"/></svg><span>Up close, factories, mines and fish farms with an EPA discharge permit, in the color of their use. Their county’s water for that use ends at its largest ones.</span></div>
          <div class="wm-key-row"><svg viewBox="0 0 40 12" aria-hidden="true"><rect x="3" y="7" width="34" height="4" fill="#e7c25e" opacity=".55"/><path d="M20 7 V1" stroke="#7fe0b8" stroke-width="1.6"/></svg><span>Underground, wells lift groundwater out of the aquifers.</span></div>
          <p class="wm-note" data-scale></p>
        </div>
      </section>
      </div>
      <aside class="wm-panel wm-insp" data-insp aria-live="polite" aria-label="Details"></aside>
      <div class="wm-bar" data-bar>
        <div class="wm-search">
          <input type="search" data-search placeholder="Search a place or ZIP code" autocomplete="off" spellcheck="false" aria-label="Search for a place, ZIP code, river, plant, aquifer or dam">
          <div class="wm-panel wm-results" data-results role="listbox"></div>
        </div>
        <button class="wm-btn" type="button" data-a="home" title="Back to the whole country">Reset view</button>
        <button class="wm-btn" type="button" data-a="tour" title="A guided tour" aria-pressed="false">Tour</button>
        <button class="wm-btn" type="button" data-a="drop" title="Drop a drop of water anywhere and follow it downstream" aria-pressed="false">Follow a drop</button>
        <button class="wm-btn" type="button" data-a="night" title="The map at night" aria-pressed="false">Night</button>
        <button class="wm-btn" type="button" data-a="under" title="Look underground at the aquifers" aria-pressed="false">Underground</button>
        <button class="wm-btn" type="button" data-a="layers" title="Layers and land color" aria-expanded="false">Layers</button>
        <button class="wm-btn" type="button" data-a="save" title="Save this view as an image, with a title, a key and the sources">Save image</button>
        <button class="wm-btn" type="button" data-a="sound" title="Sounds" aria-pressed="true">Sound</button>
        <button class="wm-btn wm-hide-s" type="button" data-a="full" title="Fill the screen">Full screen</button>
        <button class="wm-btn wm-more-btn" type="button" data-a="more" aria-expanded="false">More</button>
      </div>
      <section class="wm-panel wm-layers" data-layers hidden aria-label="Layers">
        <p class="wm-cap">Color the land by</p>
        <div class="wm-choices" data-choro role="radiogroup"></div>
        <div data-choro-key></div>
        <p class="wm-cap" style="margin-top:var(--space-sm)">Show on the map</p>
        <div class="wm-toggles" data-toggles></div>
      </section>
      <section class="wm-panel wm-caption" data-caption hidden aria-live="polite"></section>
      <p class="wm-hint" data-hint hidden>${window.matchMedia(PHONE_MQ).matches ? 'Tap' : 'Click'} any county, power plant or water treatment plant to see where its water comes from</p>
      <p class="wm-hint wm-legend" data-legend hidden></p>
      <div class="wm-tip" data-tip hidden></div>`;
    this.root.appendChild(wrap);
    this.wrap = wrap;

    this.measure = 'w';
    this.renderRows();
    for (const b of this.$$('[data-measure] button')) this.on(b, 'click', () => this.setMeasure(b.dataset.m));
    // panels fold away
    const fold = (head, panel, key) => {
      this.on(this.$(head), 'click', () => {
        if (panel === '[data-key]') this._keyTouched = true;
        const el = this.$(panel); const c = !el.classList.contains('collapsed');
        el.classList.toggle('collapsed', c); this.$(head).setAttribute('aria-expanded', String(!c));
        try { localStorage.setItem(key, c ? '1' : '0'); } catch { /* storage may be unavailable */ }
      });
      let saved = null; try { saved = localStorage.getItem(key); } catch { /* ignore */ }
      if (saved === '1') { this.$(panel).classList.add('collapsed'); this.$(head).setAttribute('aria-expanded', 'false'); }
      if (saved != null && panel === '[data-key]') this._keyTouched = true;
    };
    fold('[data-uses-head]', '[data-uses]', 'wm-uses-folded');
    fold('[data-key-head]', '[data-key]', 'wm-key-folded');
    if (window.matchMedia(PHONE_MQ).matches) { this.$('[data-key]').classList.add('collapsed'); this.$('[data-key-head]').setAttribute('aria-expanded', 'false'); }

    // layers sheet
    const ck = Object.entries(this.app.CHORO);
    this.$('[data-choro]').innerHTML = ck.map(([k, s]) => `<button type="button" class="wm-tg${k === 'none' ? ' on' : ''}" role="radio" aria-checked="${k === 'none'}" data-k="${k}"><i></i>${esc(s.name)}</button>`).join('');
    for (const el of this.$$('[data-choro] .wm-tg')) this.on(el, 'click', () => { this.app.sound?.tap(); this.setChoro(el.dataset.k); });
    this.choroKey(this.app.CHORO.none);
    const L = [['rivers', 'Rivers and canals'], ['flows', 'Moving water'], ['plants', 'Power plants'], ['labels', 'Names'],
      ['nid', 'Every dam'], ['infra', 'Water treatment plants'], ['towers', 'Water towers and wastewater plants'], ['golf', 'Golf courses'], ['dc', 'Data centers'],
      ['fac', 'Factories, mines and farms with EPA permits']];
    this.$('[data-toggles]').innerHTML = L.map(([k, n]) => `<button type="button" class="wm-tg wm-check${this.layers[k] ? ' on' : ''}" role="checkbox" aria-checked="${this.layers[k]}" data-k="${k}"><i></i>${n}</button>`).join('');
    for (const el of this.$$('[data-toggles] .wm-tg')) this.on(el, 'click', () => { const k = el.dataset.k; this.setLayer(k, !this.layers[k]); });

    // (links in the panel that color the land, also in parts of it filled in later)
    this.on(this.$('[data-insp]'), 'click', (e) => {
      const a = e.target.closest && e.target.closest('[data-choro-go]'); if (!a) return;
      this.setChoro(a.dataset.choroGo);
      // (with its key, in the layers sheet)
      if (this.$('[data-layers]').hidden) this.$('[data-a="layers"]').click();
    });
    this.buildSearch();
    this.buildButtons();
    requestAnimationFrame(() => this.fitLeft());
  }
  /**
   * The reading key sits under the use picker and folds itself away when the stage is too short for both; the toolbar
   * is centred between the panels, or runs from the left edge when it would not fit there.
   */
  fitLeft() {
    this.renderUseSankey();
    const u = this.$('[data-uses]'), k = this.$('[data-key]');
    if (u && k && !this._keyTouched && !window.matchMedia(PHONE_MQ).matches) {
      k.classList.remove('collapsed');
      // the column ends above the toolbar (as in the stylesheet); the use list gets all of it before the key does
      const avail = this.root.clientHeight - 2 * 16 - 44;
      const over = u.scrollHeight + 8 + k.scrollHeight > avail;
      k.classList.toggle('collapsed', over);
      this.$('[data-key-head]').setAttribute('aria-expanded', String(!over));
    }
    this.fitBar();
  }
  fitBar() {
    const bar = this.$('[data-bar]'); if (!bar) return;
    this.root.classList.remove('wm-wide-bar');
    if (window.matchMedia(PHONE_MQ).matches) return;
    if (bar.scrollWidth > bar.clientWidth + 1) this.root.classList.add('wm-wide-bar');
    // the search box's prompt, as long as its width allows
    const input = this.$('[data-search]');
    if (input) { const w = input.clientWidth; input.placeholder = w >= 205 ? 'Search a place or ZIP code' : w >= 150 ? 'Place or ZIP code' : 'Search'; }
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
    // (the lens the land is colored by, for the line of key over the map)
    this.lensSpec = spec;
    const el = this.$('[data-choro-key]');
    if (spec.cat) { el.innerHTML = `<p class="wm-note">Each county in the color of the use that withdrew the most water there.</p>`; return; }
    if (!spec.f) { el.innerHTML = spec.note ? `<p class="wm-note">${esc(spec.note)}</p>` : ''; return; }
    const fmtv = (v) => (v >= 1e6 ? `${nf(v / 1e6, v >= 1e7 ? 0 : 1)}M` : v >= 1e3 ? `${nf(v / 1e3, v >= 1e4 ? 0 : 1)}k` : nf(v));
    const ticks = spec.ticks || (spec.log ? [0, 0.25, 0.5, 0.75, 1].map((t) => spec.log[0] * Math.pow(spec.log[1] / spec.log[0], t)) : [0, 25, 50, 75, 100]);
    el.innerHTML = `<div class="wm-ramp${spec.div ? ' wm-ramp-div' : ''}"></div><div class="wm-ramp-t">${ticks.map((v) => `<span>${typeof v === 'string' ? esc(v) : spec.log ? fmtv(v) : nf(v)}</span>`).join('')}</div><p class="wm-note">${esc(spec.unit)}${spec.log ? ' (log scale)' : ''}.</p>${spec.note ? `<p class="wm-note">${esc(spec.note)}</p>` : ''}`;
  }
  /**
   * The use picker: each bar is that use's share of every use (the top row's full bar), of the water withdrawn or of
   * the water consumed. USGS estimated consumption in 2015 only for crops, golf courses and power plants, so the other
   * uses have no figure in that view. Data centers, which are not a USGS use and are counted inside the others, sit
   * apart for comparison.
   */
  renderRows() {
    const nat = this.m.national, D = DATA_CENTERS, cons = this.measure === 'c';
    const val = (k) => (cons ? (k === 'ir' || k === 'go' || k === 'pt' ? consumedOf(nat, k) : null) : nat.W[k]);
    const total = cons ? ['ir', 'go', 'pt'].reduce((a, k) => a + consumedOf(nat, k), 0) : nat.total;
    const row = (k, name, value, color, bar, extra = '') => `<button type="button" class="wm-row${value == null ? ' wm-row-na' : ''}" role="radio" aria-checked="false" data-k="${k}" title="${esc(extra)}">
        <span class="wm-row-l">${color ? sw(color) : '<i class="wm-sw wm-sw-all"></i>'}<span class="wm-row-n">${esc(name)}</span></span><span class="wm-row-v">${value == null ? 'not estimated' : value}</span>
        <span class="wm-row-b"><i style="width:${bar.toFixed(1)}%;background:${color || 'var(--wm-dim)'}"></i></span></button>`;
    const fig = (v) => (v == null ? null : nf(v / 1000, v < 10000 ? (v < 1000 ? 2 : 1) : 0));
    this.$('[data-rows]').innerHTML = row('all', 'Every use', fig(total), null, 100, cons ? 'All water consumed in 2015, as far as USGS estimated it' : 'All water withdrawn in 2015') +
      CATS.map((c) => { const v = val(c.k); return row(c.k, c.name, fig(v), c.color, v == null ? 0 : Math.max(0.4, (100 * v) / total), c.what); }).join('') +
      `<p class="wm-rows-sep" aria-hidden="true">For comparison</p>` +
      row('dc', DC.name, `${nf(D.directMgd[0] / 1000, 2)}–${nf(D.directMgd[1] / 1000, 2)}`, DC.color, Math.max(0.4, (100 * D.directMgd[1]) / total), `Water U.S. data centers are projected to consume on site in ${D.year}, LBNL's low and high scenarios, for scale`);
    this.rowsNote();
    for (const el of this.$$('.wm-row')) {
      const k = el.dataset.k;
      this.on(el, 'click', () => { this.app.tour?.stop(); this.app.isolate(k === 'all' || this.app.iso === k ? null : k); });
      this.on(el, 'mouseenter', () => { if (!this.app.iso && k !== 'all' && k !== 'dc') this.app.focusCat(k); });
      this.on(el, 'mouseleave', () => { if (!this.app.iso) this.app.focusCat(null); });
    }
    this.syncUses();
  }
  setMeasure(m) {
    if (m === this.measure) return;
    this.measure = m;
    for (const b of this.$$('[data-measure] button')) { const on = b.dataset.m === m; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); }
    this.app.setMeasure(m);
    this.renderRows();
    const kind = this.$('[data-insp]').dataset.kind;
    if (kind === 'national') this.showNational();
    else if (kind === 'view') { this._viewSig = null; this.app.viewDirty = true; }
    requestAnimationFrame(() => this.fitLeft());
  }
  syncUses() {
    const iso = this.app.iso || 'all';
    for (const el of this.$$('.wm-row')) { const on = el.dataset.k === iso; el.classList.toggle('on', on); el.setAttribute('aria-checked', String(on)); }
    this.root.classList.toggle('wm-isolating', !!this.app.iso);
    if (this.app.iso && this._pin) this._pin = null;
    this.renderUseSankey();
  }
  /**
   * The use picker, where the panel is wide enough: the whole country's water from source to use to fate, the
   * diagram the map is a picture of. A use isolates that use's water (again: every use); a band or a source shows
   * that water on the map while pointed at, and holds it there when clicked, with a line saying how much it is.
   * On phones and narrow screens the uses stay a list.
   */
  renderUseSankey() {
    const el = this.$('[data-usesk]'), panel = this.$('[data-uses]'); if (!el || !panel) return;
    const w = Math.round((panel.clientWidth || 0) - 2 * 8);
    const on = !window.matchMedia(PHONE_MQ).matches && w >= 286;
    if (panel.classList.contains('wm-uses-sk') !== on) { panel.classList.toggle('wm-uses-sk', on); this.rowsNote(); }
    const cap = this.$('[data-uses-cap]'); if (cap) cap.textContent = on ? 'Where the water goes' : 'Show the water for';
    if (!on) { el.innerHTML = ''; this.$('[data-sk-cap]').hidden = true; return; }
    const n = this.m.national, cons = this.measure === 'c', iso = this.app.iso && this.app.iso !== 'dc' ? this.app.iso : null;
    const sig = `${w}|${cons}|${this.app.iso}|${this._pin ? `${this._pin.t}/${this._pin.s}` : ''}`;
    if (sig === this._skSig && el.firstChild) return;
    this._skSig = sig;
    el.innerHTML = this.sankey3For(n, 1000, (v) => nf(v, v < 10 ? 1 : 0), { width: w, pick: true, hi: iso, pin: this._pin, cons });
    this.pinCaption();
    const hold = () => { const p = this._pin; this.app.focusFlow(p ? p.t : null, p ? p.s : null); };
    for (const g of el.querySelectorAll('[data-u]')) {
      const k = g.dataset.u;
      const go = () => { this.app.tour?.stop(); this._pin = null; this.app.isolate(this.app.iso === k ? null : k); };
      this.on(g, 'click', go);
      this.on(g, 'keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
      this.on(g, 'mouseenter', () => { if (!this.app.iso) this.app.focusCat(k); });
      this.on(g, 'mouseleave', () => { if (!this.app.iso) this.app.focusCat(null); });
    }
    const pinTo = (t, s) => {
      const same = this._pin && this._pin.t === t && (this._pin.s || null) === (s || null);
      this.app.sound?.tap();
      this._pin = same ? null : { t, s: s || null };
      if (this.app.iso && !same && t !== '*' && t !== this.app.iso) this.app.isolate(null, true);
      hold(); this.renderUseSankey();
    };
    for (const p of el.querySelectorAll('path[data-t], .wm-sk-src')) {
      const t = p.dataset.t, s2 = p.dataset.s || null;
      this.on(p, 'mouseenter', () => this.app.focusFlow(t, s2));
      this.on(p, 'mouseleave', hold);
      this.on(p, 'click', () => pinTo(t, s2));
      if (p.classList.contains('wm-sk-src')) this.on(p, 'keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pinTo(t, s2); } });
    }
  }
  /** the note under the uses, for the list or for the diagram */
  rowsNote() {
    const el = this.$('[data-rows-note]'); if (!el) return;
    const D = DATA_CENTERS, cons = this.measure === 'c', sk = this.$('[data-uses]')?.classList.contains('wm-uses-sk');
    el.textContent = sk
      ? `Billion gallons a day in 2015 (USGS). ${cons ? 'Consumed water evaporated or went into crops; USGS estimated it only for crops, golf courses and power plants. ' : ''}Click a use to see only its water, or a source or band to hold that water on the map. Data centers: water LBNL projects they will consume on site in ${D.year}, low to high.`
      : cons
        ? `Billion gallons a day consumed in 2015: evaporated, taken up by crops or otherwise not returned (USGS). USGS estimated it only for crops, golf courses and power plants. Data centers: projected to consume on site in ${D.year}, low to high (LBNL).`
        : `Billion gallons a day withdrawn in 2015 (USGS), with each bar its share of the total. Data centers: water LBNL projects they will consume on site in ${D.year}, low to high.`;
  }
  /** a line under the picker for the water held on the map: how much, and its share */
  pinCaption() {
    const el = this.$('[data-sk-cap]'); if (!el) return;
    const p = this._pin, n = this.m.national, iso = this.app.iso;
    if (!p && iso) {
      el.innerHTML = `${esc(iso === 'dc' ? 'Only data centers are on the map.' : `Only the water for ${CAT[iso].name.toLowerCase()} is on the map.`)} <button type="button" class="wm-lnk" data-every>Show every use</button>`;
      el.hidden = false;
      this.on(el.querySelector('[data-every]'), 'click', () => this.app.isolate(null));
      return;
    }
    if (!p) { el.hidden = true; return; }
    const SN = Object.fromEntries(SRC_ROWS.map((r) => [r.key, r.name]));
    const B = (v) => `${nf(v / 1000, v < 10000 ? 1 : 0)} billion gallons a day`;
    let t = '';
    if (p.t === '*') { const v = n.src[p.s] || 0; t = `${SN[p.s]}: ${B(v)}, ${pct(v, n.total)}% of all water withdrawn.`; }
    else if (p.s) { const v = (n.bySrc[p.t] && n.bySrc[p.t][p.s]) || 0; t = `${SN[p.s]} for ${CAT[p.t].name.toLowerCase()}: ${B(v)}, ${pct(v, n.W[p.t])}% of that use's water.`; }
    else { const cu = consumedOf(n, p.t); t = `${CAT[p.t].name}: ${B(n.W[p.t])}${p.t === 'ir' || p.t === 'go' || p.t === 'pt' ? `, ${pct(cu, n.W[p.t])}% of it consumed` : ''}.`; }
    el.innerHTML = `${esc(t)} <button type="button" class="wm-lnk" data-unpin>Clear</button>`;
    el.hidden = false;
    this.on(el.querySelector('[data-unpin]'), 'click', () => { this._pin = null; this.app.focusFlow(null); this.renderUseSankey(); });
  }
  syncButtons() {
    // Night and Underground are switches: lit while on
    const nb = this.$('[data-a="night"]');
    nb.classList.toggle('on', !!this.app.night); nb.setAttribute('aria-pressed', String(!!this.app.night));
    nb.title = this.app.night ? 'Night is on: switch to daylight' : 'Switch to the map at night';
    const ub = this.$('[data-a="under"]');
    ub.classList.toggle('on', !!this.app.underground); ub.setAttribute('aria-pressed', String(!!this.app.underground));
    const fb = this.$('[data-a="full"]');
    if (fb) fb.textContent = this.app.expanded ? 'Exit full screen' : 'Full screen';
    const db = this.$('[data-a="drop"]'), don = !!(this.app.drop && this.app.drop.on);
    if (db) { db.classList.toggle('on', don); db.setAttribute('aria-pressed', String(don)); }
    const sb = this.$('[data-a="sound"]'), son = !!(this.app.sound && this.app.sound.on);
    if (sb) { sb.classList.toggle('on', son); sb.setAttribute('aria-pressed', String(son)); sb.title = son ? 'Sounds are on: mute them' : 'Turn the sounds on'; }
  }

  // ------------------------------------------------------------ welcome
  welcome() {
    if (this.app.tour.i >= 0 || this._welcomed) return;
    this._welcomed = true;
    this.caption(`<p class="wm-cap">How to read this</p><h4>Every moving light is water</h4>
      <p>Each streak is water on its way from a river, lake, aquifer or the sea to a use, in the color of that use. The discs mark the 40 places that withdrew the most, with a white slice for the share consumed. Zoom in to see the channels the water runs through, wider for more water. ${window.matchMedia(PHONE_MQ).matches ? 'Tap a use above the map to see only its water, or a county, power plant or water treatment plant to see where its own water comes from, with the share from each source.' : 'Pick a use on the left to see only its water, or click a county, power plant or water treatment plant to see where its own water comes from, with the share from each source.'}</p>`,
      [['zip', 'Find my county'], ['close', 'Explore on my own'], ['drop', 'Follow a drop'], ['tour', 'Take the tour']], (a) => {
        if (a === 'tour') this.app.tour.go(0);
        if (a === 'drop') this.app.drop?.open();
        // (where a reader's own water comes from: their ZIP code finds their county)
        if (a === 'zip') { const s = this.$('[data-search]'); s.placeholder = 'Your ZIP code'; s.focus(); }
      });
    // (it steps aside once the reader starts exploring: zooming, dragging or clicking the map, or picking anything)
    const off = () => this.welcomeOff();
    setTimeout(() => { for (const ev of ['wheel', 'pointerdown']) this.on(this.app.canvas, ev, off, { once: true }); }, 1500);
    this._capKind = 'welcome';
  }
  welcomeOff() { if (this.app.tour.i < 0 && this._capKind === 'welcome') this.hideCaption(); }
  caption(html, buttons, onAction) {
    const el = this.$('[data-caption]');
    el.innerHTML = `${html}<div class="wm-cap-nav"><div></div><div class="wm-cap-bs">${buttons.map(([a, t]) => `<button type="button" class="wm-btn" data-a="${a}">${esc(t)}</button>`).join('')}</div></div>`;
    el.hidden = false;
    for (const b of el.querySelectorAll('[data-a]')) this.on(b, 'click', () => { this.hideCaption(); onAction?.(b.dataset.a); });
  }
  hideCaption() { const was = this._capKind; this.$('[data-caption]').hidden = true; this._capKind = null; if (was === 'welcome') this.showHint(); }
  /** a one-line prompt over the map until the reader first selects something */
  showHint() {
    if (this._hintDone || this.app.tour.i >= 0) return;
    // while the one-line key holds the spot, the prompt waits for it to go
    if (this._legendOn) { this._hintWas = true; return; }
    const el = this.$('[data-hint]'); if (el) el.hidden = false;
  }
  hintDone() { this._hintDone = true; const el = this.$('[data-hint]'); if (el) el.hidden = true; }
  /**
   * A one-line key over the map, in place of the prompt: from afar, to the discs at the places that withdrew the most
   * ('top'); closer in, to the channels ('chan'); or none.
   */
  setLegend(mode, lens = null) {
    const el = this.$('[data-legend]'), h = this.$('[data-hint]');
    mode = mode || '';
    if (!el || (mode === (this._legend || '') && lens === (this._lgLens || null))) return;
    this._legend = mode; this._lgLens = lens;
    const g = (svg, t) => `<span class="wm-lg"><svg viewBox="0 0 14 14" width="14" height="14" aria-hidden="true">${svg}</svg>${t}</span>`;
    // the land's colors, on a line of their own above the rest
    let lensHtml = '';
    if (lens && lens.cat) lensHtml = `<span class="wm-lg wm-lg-lens"><b>${esc(lens.name)}:</b> ${esc(lens.short || '')}</span>`;
    else if (lens && lens.f) {
      const fmtv = (v) => (v >= 1e6 ? `${nf(v / 1e6, v >= 1e7 ? 0 : 1)} million` : v >= 1e3 ? nf(v) : nf(v));
      const ends = lens.ticks ? [lens.ticks[0], lens.ticks[lens.ticks.length - 1]] : lens.log ? lens.log.map(fmtv) : lens.lin.map((v) => nf(v));
      lensHtml = `<span class="wm-lg wm-lg-lens"><b>${esc(lens.name)}</b><span>${esc(ends[0])}</span><i class="wm-ramp${lens.div ? ' wm-ramp-div' : ''}"></i><span>${esc(ends[1])}${lens.short && !lens.ticks ? ` ${esc(lens.short)}` : ''}${lens.log ? ' (log scale)' : ''}</span></span>`;
    }
    if (mode === 'chan') {
      el.innerHTML = lensHtml + g(`<circle cx="7" cy="7" r="4" fill="${SRC_DEF.sf.color}" stroke="#0a1310" stroke-width="1"/>`, 'intake')
        + g(`<circle cx="7" cy="7" r="4" fill="none" stroke="${SRC_DEF.gf.color}" stroke-width="2"/>`, 'well')
        + g(`<rect x="2.5" y="2.5" width="9" height="9" fill="#f2cf63" stroke="#0a1310" stroke-width="1"/>`, 'a county’s water for its towns, industry or fish farms')
        + `<span class="wm-lg">${[10, 100, 1000].map((v) => keyChannel(chanPx(v), '#d8d2c2')).join('')}10, 100, 1,000 Mgal/d</span>`
        + g(`<circle cx="7" cy="7" r="5" fill="${RETURN_GRAY}"/><path d="M7 7 V2 A5 5 0 0 1 11.33 9.5 Z" fill="${CONSUMED_WHITE}"/><circle cx="7" cy="7" r="5.2" fill="none" stroke="${CAT.ir.color}" stroke-width="1.6"/>`, 'consumed and returned')
        + g(`<path d="M1 7 H13" stroke="${RETURN_GRAY}" stroke-width="2" stroke-dasharray="3 2"/>`, 'back to a river');
    } else if (mode === 'top') {
      el.innerHTML = lensHtml + g(`<circle cx="7" cy="7" r="6" fill="${CAT.pt.color}" stroke="#0a1310" stroke-width="1"/><path d="M7 7 V1 A6 6 0 0 1 12.2 4 Z" fill="${CONSUMED_WHITE}"/>`, 'the 40 places that withdrew the most, in the color of their use, sized by their water')
        + g(`<circle cx="7" cy="7" r="6" fill="${CONSUMED_WHITE}" stroke="#0a1310" stroke-width="1"/>`, 'white: the share consumed');
    } else el.innerHTML = lensHtml;
    const on = !!(mode || lensHtml);
    if (on) { if (!this._legendOn) this._hintWas = !!h && !h.hidden; if (h) h.hidden = true; }
    else if (h && this._hintWas && !this._hintDone) h.hidden = false;
    this._legendOn = on;
    el.hidden = !on;
  }

  // ------------------------------------------------------------ inspector
  sankeyFor(agg, scale = 1, fmt) {
    const sources = SRC_ROWS.map((s) => ({ ...s, value: agg.src[s.key] / scale }));
    const uses = CATS.map((c) => ({ key: c.k, name: c.short, color: c.color, value: agg.W[c.k] / scale, consumed: consumedOf(agg, c.k) / scale }));
    const links = [];
    for (const k of CAT_KEYS) for (const s of SRC_ROWS) links.push({ s: s.key, t: k, value: agg.bySrc[k][s.key] / scale });
    const w = Math.min(348, (this.$('[data-insp]').clientWidth || 360) - 28);
    return sankeySVG({ sources, uses, links, width: w, fmt });
  }
  /** the three-step Sankey: sources, uses, and what became of the water */
  sankey3For(agg, scale = 1, fmt, opts = {}) {
    const sources = SRC_ROWS.map((s) => ({ ...s, value: agg.src[s.key] / scale }));
    const uses = CATS.map((c) => ({ key: c.k, name: c.short, color: c.color, value: agg.W[c.k] / scale }));
    const links1 = [], links2 = [];
    for (const k of CAT_KEYS) for (const s of SRC_ROWS) links1.push({ s: s.key, t: k, value: agg.bySrc[k][s.key] / scale });
    const fv = { ret: 0, cu: 0, na: 0 };
    for (const k of CAT_KEYS) {
      const W = agg.W[k] / scale;
      if (k === 'ir' || k === 'go' || k === 'pt') {
        const cu = Math.min(k === 'ir' ? agg.cu.ir : k === 'go' ? agg.cu.go : agg.cu.pt, agg.W[k]) / scale;
        links2.push({ s: k, t: 'cu', value: cu }, { s: k, t: 'ret', value: W - cu }); fv.cu += cu; fv.ret += W - cu;
      } else { links2.push({ s: k, t: 'na', value: W }); fv.na += W; }
    }
    const fates = [{ key: 'ret', name: 'Returned', color: RETURN_GRAY, value: fv.ret }, { key: 'cu', name: 'Consumed', color: CONSUMED_WHITE, value: fv.cu }, { key: 'na', name: 'Not estimated', color: '#56625d', value: fv.na }];
    const w = opts.width || Math.min(348, (this.$('[data-insp]').clientWidth || 360) - 28);
    return sankey3SVG({ sources, uses, fates, links1, links2, width: w, fmt, ...opts });
  }
  setInspector(html, closable, kind = 'detail') {
    const el = this.$('[data-insp]');
    if (kind !== 'drop' && this.app.drop && this.app.drop.on) this.app.drop.close(true);
    const keep = kind === 'view' && el.dataset.kind === 'view' ? el.scrollTop : 0;
    el.dataset.kind = kind;
    el.classList.toggle('wm-national', !closable);
    const rail = (kind === 'national' || kind === 'view') && this.railWanted();
    const wasRail = el.classList.contains('wm-rail');
    el.classList.toggle('wm-rail', rail);
    const tall = el.classList.contains('wm-tall');
    el.innerHTML = `<button type="button" class="wm-grip" aria-expanded="${tall}" aria-label="${tall ? 'Show less of this panel' : 'Show more of this panel'}"></button>` +
      (closable ? '<button type="button" class="wm-close" aria-label="Close">&times;</button>' : '') + html + '<div class="wm-fade" aria-hidden="true"></div>';
    el.scrollTop = keep;
    // the slim card opens for good; the map makes room for the panel
    const open = el.querySelector('[data-rail]');
    if (open) this.on(open, 'click', () => { this._railOpen = true; el.classList.remove('wm-rail'); this.app.refit?.(); });
    if (rail !== wasRail) this.app.refit?.();
    // a fade at the bottom while there is more to scroll to
    const more = () => el.classList.toggle('wm-more', el.scrollHeight - el.scrollTop - el.clientHeight > 6);
    if (!this._moreBound) { this._moreBound = true; this.on(el, 'scroll', more, { passive: true }); }
    requestAnimationFrame(more); clearTimeout(this._moreT); this._moreT = setTimeout(more, 450);
    const grip = el.querySelector('.wm-grip');
    this.on(grip, 'click', () => {
      const t = el.classList.toggle('wm-tall');
      grip.setAttribute('aria-expanded', String(t));
      grip.setAttribute('aria-label', t ? 'Show less of this panel' : 'Show more of this panel');
      if (!t) el.scrollTop = 0;
    });
    if (closable) this.on(el.querySelector('.wm-close'), 'click', () => { if (kind === 'drop') this.app.drop?.close(); else if (kind === 'iso') this.app.isolate(null); else this.app.clearSelection(); });
    for (const a of el.querySelectorAll('[data-plant]')) this.on(a, 'click', () => this.app.selectPlant(+a.dataset.plant, true));
    for (const a of el.querySelectorAll('[data-county]')) this.on(a, 'click', () => this.app.selectCounty(+a.dataset.county, true));
    for (const a of el.querySelectorAll('[data-state]')) this.on(a, 'click', () => this.app.selectState(a.dataset.state, true));
    for (const a of el.querySelectorAll('[data-aq]')) this.on(a, 'click', () => this.app.selectAquifer(+a.dataset.aq, true));
    for (const a of el.querySelectorAll('[data-osm]')) this.on(a, 'click', () => this.app.selectOsm(+a.dataset.osm, true));
    for (const a of el.querySelectorAll('[data-fac]')) this.on(a, 'click', () => this.app.selectFac(+a.dataset.fac, true));
    for (const a of el.querySelectorAll('[data-iso]')) this.on(a, 'click', () => this.app.isolate(a.dataset.iso === 'all' ? null : a.dataset.iso));
    for (const a of el.querySelectorAll('[data-go]')) this.on(a, 'click', () => { const v = JSON.parse(a.dataset.go); this.app.flyTo(v, 1800); });
    for (const a of el.querySelectorAll('[data-under]')) this.on(a, 'click', () => this.app.setUnderground(true));
    for (const a of el.querySelectorAll('[data-levels]')) this.on(a, 'click', () => this.app.setLevels(!this.app.levels));
    // the Sankey: hovering a band shows that water on the map
    for (const p of el.querySelectorAll('.wm-sankey [data-t]')) {
      this.on(p, 'mouseenter', () => this.app.focusFlow(p.dataset.t, p.dataset.s || null));
      this.on(p, 'mouseleave', () => this.app.focusFlow(null));
    }
  }
  forScale() {
    const n = this.m.national, D = DATA_CENTERS;
    const dcAll = D.directGal.map((g, i) => (g + D.indirectGal[i]) / 365 / 1e6);
    return `<h5>For scale</h5>
      <div class="wm-kv">
        <span>U.S. data centers, consumed on site (projected for ${D.year})</span><span>${nf(D.directMgd[0])}–${nf(D.directMgd[1])} Mgal/d</span>
        <span>With the water for their electricity</span><span>${nf(dcAll[0])}–${nf(dcAll[1])} Mgal/d</span>
        <span>Golf courses, consumed (2015, where reported)</span><span>${nf(n.cu.go)} Mgal/d</span>
      </div>
      <p class="wm-note"><button type="button" class="wm-lnk" data-iso="dc">Show data centers on the map</button></p>`;
  }
  /**
   * Where the panel would crowd the map (a laptop-sized stage), the whole-country panel and the panel for the view
   * start as a slim card with just the headline; the reader opens the rest, and it then stays open.
   */
  railWanted() { return !this._railOpen && !window.matchMedia(PHONE_MQ).matches && this.root.clientWidth < 1500; }
  /** a panel that can be a slim card: its caption, the card's short headline, then the full headline and the rest */
  railWrap(cap, railHead, head, body) {
    return `${cap}<div class="wm-rail-only">${railHead}<p class="wm-rail-more"><button type="button" class="wm-lnk" data-rail>Where it comes from, and where it goes</button></p></div><div class="wm-rail-body">${head}${body}</div>`;
  }
  showNational() {
    const n = this.m.national;
    const perCap = n.total * 1e6 / (n.pop * 1000);
    const cu = consumedOf(n, 'ir') + consumedOf(n, 'go') + consumedOf(n, 'pt');
    const est = (n.W.ir + n.W.go + n.W.pt) / n.total;
    const B = (v) => `${nf(v / 1000, v < 10000 ? 1 : 0)} Bgal/d`;
    // (the flow from source to use to fate first: it is the whole picture in one figure)
    const head = this.measure === 'c'
      ? `<div class="wm-big">${nf(cu / 1000)} <small>billion gallons a day consumed</small></div>
      <p class="wm-sub">evaporated, taken up by crops or otherwise not returned, out of the ${nf(n.total / 1000)} billion withdrawn. USGS estimated it only for crops, golf courses and power plants, which withdrew ${Math.round(100 * est)}% of the water; for the other uses it is not known, so the map draws none for them.</p>`
      : `<div class="wm-big">${nf(n.total / 1000)} <small>billion gallons a day</small></div>
      <p class="wm-sub">withdrawn from rivers, lakes, aquifers and the sea, about ${nf(perCap)} gallons a day for every resident (counting the water power plants borrow and return). Crops, golf courses and power plants consumed ${nf(cu / 1000)} billion of it.</p>`;
    const railHead = this.measure === 'c'
      ? `<div class="wm-big">${nf(cu / 1000)} <small>billion gallons a day consumed</small></div><p class="wm-sub">by crops, golf courses and power plants, out of ${nf(n.total / 1000)} billion withdrawn.</p>`
      : `<div class="wm-big">${nf(n.total / 1000)} <small>billion gallons a day</small></div><p class="wm-sub">withdrawn. Crops, golf courses and power plants consumed ${nf(cu / 1000)} billion of it.</p>`;
    this.setInspector(this.railWrap('<p class="wm-cap">The whole country, 2015</p>', railHead, head, `<h5>Where it comes from, and where it goes</h5>
      ${this.sankey3For(n, 1000, (v) => nf(v, v < 10 ? 1 : 0))}
      <p class="wm-note">Billion gallons a day. Consumed water evaporated or went into crops; returned water went back to rivers and aquifers. USGS estimated what became of the water only for crops, golf courses and power plants (${Math.round(100 * est)}% of all withdrawals). Hover a band to see that water on the map.</p>
      <h5>The sources</h5>${mixBlock(this.srcRows(n.src), B)}
      ${this.forScale()}
      <p class="wm-note">Click any county, power plant or water treatment plant to see where its water comes from, drawn in the color of each source with the share from each. Drag to move, scroll or pinch to zoom, right-drag or twist two fingers to turn.</p>`), false, 'national');
  }
  /**
   * Zoomed in with nothing selected, the panel sums up the counties in view (their middles inside the part of the map
   * the panels leave free), with the same diagram as the whole country's, and follows the view as it moves.
   */
  showView(ids) {
    const m = this.m, agg = m.aggregate(ids);
    if (!(agg.total > 0)) { this.showNational(); return; }
    const cu = consumedOf(agg, 'ir') + consumedOf(agg, 'go') + consumedOf(agg, 'pt');
    const big = agg.total >= 1000, sc = big ? 1000 : 1, unitW = big ? 'billion' : 'million';
    const fmt = big ? (v) => nf(v, v < 10 ? 1 : 0) : (v) => mgd(v);
    const shown = (v) => (big ? nf(v / 1000, v < 10000 ? 1 : 0) : mgd(v));
    const top = CAT_KEYS.slice().sort((a, b) => agg.W[b] - agg.W[a])[0];
    const est = (agg.W.ir + agg.W.go + agg.W.pt) / agg.total;
    const states = [...new Set(ids.map((i) => m.wu.st[i]))];
    const where = states.length <= 3 ? states.map((s) => this.app.stateName(s)).join(', ') : `${states.length} states and territories`;
    const head = this.measure === 'c'
      ? `<div class="wm-big">${shown(cu)} <small>${unitW} gallons a day consumed</small></div>
        <p class="wm-sub">by crops, golf courses and power plants in the ${nf(ids.length)} ${ids.length === 1 ? 'county' : 'counties'} in view, out of ${shown(agg.total)} ${unitW} withdrawn.</p>`
      : `<div class="wm-big">${shown(agg.total)} <small>${unitW} gallons a day withdrawn</small></div>
        <p class="wm-sub">in the ${nf(ids.length)} ${ids.length === 1 ? 'county' : 'counties'} in view (${esc(where)}), ${pct(agg.W[top], agg.total)}% of it for ${esc(CAT[top].name.toLowerCase())}. ${nf(100 * agg.total / m.national.total, agg.total / m.national.total < 0.01 ? 2 : 1)}% of the country's water.</p>`;
    const sig = `${ids.length}|${Math.round(agg.total)}|${this.measure}`;
    if (this._viewSig === sig && this.$('[data-insp]').dataset.kind === 'view') return;
    this._viewSig = sig;
    const railHead = `<div class="wm-big">${shown(this.measure === 'c' ? cu : agg.total)} <small>${unitW} gallons a day ${this.measure === 'c' ? 'consumed' : 'withdrawn'}</small></div><p class="wm-sub">in the ${nf(ids.length)} ${ids.length === 1 ? 'county' : 'counties'} in view, ${this.measure === 'c' ? `out of ${shown(agg.total)} withdrawn` : `${pct(agg.W[top], agg.total)}% of it for ${esc(CAT[top].name.toLowerCase())}`}.</p>`;
    this.setInspector(this.railWrap('<p class="wm-cap">In view, 2015</p>', railHead, head, `<h5>Where it comes from, and where it goes</h5>
      ${this.sankey3For(agg, sc, fmt)}
      <p class="wm-note">${big ? 'Billion' : 'Million'} gallons a day withdrawn by the counties whose middles are in view${cu > 0 ? `; ${shown(cu)} consumed` : ''}. USGS estimated what became of the water only for crops, golf courses and power plants (${Math.round(100 * est)}% of the water here). The figures follow the view as it moves. Zoom out for the whole country.</p>
      <h5>The sources</h5>${mixBlock(this.srcRows(agg.src), (v) => volShort(v))}`), false, 'view');
  }
  /**
   * A drop followed down the rivers (ui/dropview.js): its journey so far, and what became of a thousand drops entering
   * the river at the same spot, by the same chances.
   */
  showDrop(d) {
    if (d.none) { this.setInspector(`<p class="wm-cap">Follow a drop</p><h3>${esc(d.head)}</h3><p class="wm-sub">${esc(d.text)}</p>`, true, 'drop'); return; }
    const log = d.log.map((e) => `<li><i class="wm-sw" style="background:${e.color}"></i><span><b>${esc(e.title)}</b>${e.text ? `<small>${esc(e.text)}</small>` : ''}</span></li>`).join('');
    const used = Math.round((100 * d.used) / d.n);
    const caveat = d.dry > 0.3 ? `<p class="wm-note">Along the way, uses upstream consume ${d.dry >= 0.95 ? 'nearly all of some rivers’ natural flow' : `as much as ${Math.round(100 * d.dry)} percent of a river’s natural flow`}, by the map’s figures. The map leaves out evaporation from reservoirs and water taken outside the United States, so in rivers this heavily used the drops get further than the rivers’ water does.</p>` : '';
    this.setInspector(`<p class="wm-cap">Follow a drop</p><h3>${esc(d.head)}</h3>
      ${d.log.length ? `<h5>Its journey</h5><ol class="wm-drop-log">${log}</ol>` : ''}
      <h5>The odds from here</h5>
      <p class="wm-sub">What became of ${nf(d.n)} drops entering the river here, by the map’s figures. ${used}% were taken out of a river at least once${d.uses > d.used ? `, some of them several times` : ''}.</p>
      ${mixBlock(d.rows, null)}
      ${caveat}
      <p class="wm-note">At each place, a drop is taken with the chance that the intakes there take water out of the river: what they withdraw over the river’s natural flow, less what uses upstream consumed or piped away. It is then used up with the chance that its use consumes water, or goes back to a river nearby. <a href="#drop-method">How the odds are worked out</a></p>
      <p class="wm-note"><button type="button" class="wm-lnk" data-drop-again>Drop another here</button></p>`, true, 'drop');
    const b = this.$('[data-drop-again]'); if (b) this.on(b, 'click', () => d.again());
  }
  /** the panel for one use, shown while it is isolated */
  showCategory(k) {
    if (k === 'dc') return this.showDataCenters();
    const m = this.m, n = m.national, c = CAT[k];
    const W = n.W[k], bySrc = n.bySrc[k];
    const cu = consumedOf(n, k);
    const states = [...m.states.keys()].map((st) => [st, m.aggregate(m.states.get(st)).W[k]]).filter((r) => r[1] > 0).sort((a, b) => b[1] - a[1]).slice(0, 6);
    const counties = Array.from({ length: m.n }, (_, i) => i).filter((i) => m.byCat[c.i][i] > 0).sort((a, b) => m.byCat[c.i][b] - m.byCat[c.i][a]).slice(0, 8);
    const srcRows = this.srcRows(bySrc);
    if (k === 'ir' || k === 'go') { const rec = k === 'ir' ? n.other.ir_rec : n.other.go_rec; if (rec > 0) srcRows.push({ v: rec, color: SRC_DEF.rec.color, round: true, name: SRC_DEF.rec.name, sub: 'reused; not counted as a withdrawal' }); }
    if (k === 'pt') { if (n.other.pt_rec > 0) srcRows.push({ v: n.other.pt_rec, color: SRC_DEF.rec.color, round: true, name: SRC_DEF.rec.name, sub: 'reused; not counted as a withdrawal' }); if (n.other.pt_ps > 0) srcRows.push({ v: n.other.pt_ps, color: SRC_DEF.ps.color, round: true, name: SRC_DEF.ps.name, sub: 'bought from utilities; counted in their withdrawals' }); }
    const fmtB = (v) => volShort(v);
    let html = `<p class="wm-cap">Water for one use, 2015</p><h3>${sw(c.color)}${esc(c.name)}</h3>
      <div class="wm-big">${W >= 1000 ? nf(W / 1000, W >= 10000 ? 0 : 1) : mgd(W)} <small>${W >= 1000 ? 'billion' : 'million'} gallons a day withdrawn</small></div>
      <p class="wm-sub">${esc(c.what)} ${nf(100 * W / n.total, 1)}% of all U.S. withdrawals.</p>
      <h5>Where it comes from</h5>${mixBlock(srcRows, fmtB)}`;
    if (cu > 0) html += `<h5>What happens to it</h5><div class="wm-kv"><span>Consumed, rising as white mist</span><span>${volShort(cu)} (${pct(cu, W + (k === 'ir' ? n.other.ir_rec : k === 'go' ? n.other.go_rec : 0))}%)</span><span>Returned to rivers and aquifers</span><span>${volShort(Math.max(0, W - cu))}</span></div>`;
    else html += `<p class="wm-note">USGS did not estimate how much of this water was consumed in 2015, so the map shows it arriving and stops there.</p>`;
    if (k === 'pt') html += `<p class="wm-note">Plants that pass water through once withdraw the most and return nearly all of it, warmer. Plants with cooling towers withdraw far less but evaporate most of what they take.</p>`;
    if (k === 'ir' || k === 'go') html += `<p class="wm-note">USGS counted golf courses on their own in the ${esc(m.splitWords)}. In ${esc(m.unsplitWords)} golf is inside crop irrigation.</p>`;
    html += `<h5>States that withdrew the most<span class="wm-h-u">Mgal/d</span></h5><div class="wm-list">${states.map(([st, v]) => `<button type="button" class="wm-li" data-state="${esc(st)}"><span>${esc(this.app.stateName(st))}</span><span>${mgd(v)}</span></button>`).join('')}</div>
      <h5>Counties that withdrew the most<span class="wm-h-u">Mgal/d</span></h5><div class="wm-list">${counties.map((i) => `<button type="button" class="wm-li" data-county="${i}"><span>${esc(m.wu.name[i])}, ${esc(AP_STATE[m.wu.st[i]] || m.wu.st[i])}</span><span>${mgd(m.byCat[c.i][i])}</span></button>`).join('')}</div>`;
    if (k === 'pt') {
      const top = m.plants.map((p, i) => [p, i]).filter(([p]) => p.w_env > 0).sort((a, b) => b[0].w_env - a[0].w_env).slice(0, 6);
      html += `<h5>Plants that withdrew the most<span class="wm-h-u">Mgal/d</span></h5><div class="wm-list">${top.map(([p, i]) => `<button type="button" class="wm-li" data-plant="${i}"><span>${esc(p.name)}<small>${esc(genName(p.gen))} · ${esc(coolName(p.cooling))}</small></span><span>${mgd(p.w_env)}</span></button>`).join('')}</div>`;
    }
    html += `<p class="wm-note">Million gallons a day.</p>`;
    html += `<p class="wm-note"><button type="button" class="wm-lnk" data-iso="all">Show every use again</button></p>`;
    this.setInspector(html, true, 'iso');
  }
  showDataCenters() {
    const D = DATA_CENTERS, n = this.m.national, T = D.y2023;
    const ind = D.indirectGal.map((g) => g / 365 / 1e6), both = D.directMgd.map((v, i) => v + ind[i]);
    const to = (a, f = (v) => nf(v)) => `${f(a[0])} to ${f(a[1])}`, dash = (a, f = (v) => nf(v)) => `${f(a[0])}–${f(a[1])}`;
    const osm = this.app.osm;
    const dcCount = osm ? osm.counts[4] : null;
    let top = [];
    if (osm) {
      const byC = [];
      for (const [ci, a] of osm.byCounty) if (a[4] > 0) byC.push([ci, a[4]]);
      top = byC.sort((a, b) => b[1] - a[1]).slice(0, 6);
    }
    const rep = (D.reported || []).slice().sort((a, b) => b.gal - a.gal);
    let html = `<p class="wm-cap">For scale, projected for ${D.year}</p><h3>${sw(DC.color)}Data centers</h3>
      <div class="wm-big">${to(D.directMgd)} <small>million gallons a day</small></div>
      <p class="wm-sub">that Lawrence Berkeley National Laboratory projects every U.S. data center together will consume on site in ${D.year}, in its low and high scenarios, about ${to(D.directGal, (v) => nf(v / 1e9))} billion gallons over the year. Most of it evaporates in cooling systems. Its estimate for ${T.year} is ${nf(T.directGal / 1e9, 1)} billion gallons, about ${nf(T.directMgd)} million gallons a day.</p>
      <div class="wm-kv">
        <span>Consumed making their electricity, at power plants</span><span>${dash(ind)} Mgal/d</span>
        <span>On site and at power plants together</span><span>${dash(both)} Mgal/d</span>
        <span>Golf courses, consumed where reported (2015)</span><span>${nf(n.cu.go)} Mgal/d</span>
        <span>Crop irrigation, consumed (2015)</span><span>${volShort(n.cu.ir)}</span>
        <span>On-site use as a share of all U.S. withdrawals in 2015</span><span>${dash(D.directMgd, (v) => nf(100 * v / n.total, 3))}%</span>
      </div>
      <p class="wm-note">Their ${to(D.electricityTWh)} terawatt-hours of electricity are counted at ${D.galPerKWh} gallons per kilowatt-hour, the average water thermoelectric plants consume (<a href="${esc(D.factorUrl)}" target="_blank" rel="noopener">NREL</a>). LBNL’s own estimate for ${T.year}, about ${nf(T.lbnlIndirectLiters / 1e9)} billion liters, also counts evaporation from hydroelectric reservoirs, which the USGS consumption figures on this map leave out.</p>
      <p class="wm-note">Data centers are not a USGS category. The water they use on site is counted inside public supply and industry, and the water for their electricity inside power plants, so the map draws no separate flows for them. The violet diamonds are data centers mapped in OpenStreetMap${dcCount ? ` (${nf(dcCount)} of them)` : ''}, which misses many.</p>`;
    if (rep.length) html += `<h5>Reported by the operator</h5><div class="wm-list">${rep.map((r) => `<button type="button" class="wm-li" data-go='${esc(JSON.stringify({ x: r.x, z: r.z, d: 30, tilt: 1.0 }))}'><span>${esc(r.name)}<small>${esc(r.op)}, ${esc(r.year)}</small></span><span>${nf(r.gal / 1e6)}M gal</span></button>`).join('')}</div><p class="wm-note">${esc(D.reportedSrc || '')}</p>`;
    if (top.length) html += `<h5>Counties with the most mapped data centers</h5><div class="wm-list">${top.map(([ci, cnt]) => `<button type="button" class="wm-li" data-county="${ci}"><span>${esc(this.m.wu.name[ci])}, ${esc(this.m.wu.st[ci])}</span><span>${nf(cnt)}</span></button>`).join('')}</div>`;
    html += `<p class="wm-note">Source: ${esc(D.src)}. <button type="button" class="wm-lnk" data-iso="all">Show every use</button></p>`;
    this.setInspector(html, true, 'iso');
  }
  /**
   * The High Plains aquifer's water levels, about 1950 to 2015 (McGuire, 2017, USGS ScienceBase): the figures are
   * worked out from the USGS grid by scripts/water-map/bake_hp_levels.py.
   */
  levelsBlock() {
    const on = this.app.levels, R = ['#e9c46a', '#c0392b', '#8c918e', '#7fb3e6', '#2f6fc4'], L = HP_LEVELS;
    const sq = (v) => nf(Math.round(v / 100) * 100);
    return `<h5>Water levels in the High Plains aquifer</h5>
      <p class="wm-sub">USGS mapped how far the water table moved between about 1950, before heavy pumping began, and 2015, from ${nf(L.wells)} wells measured in both years. It fell more than 100 feet under about ${sq(L.fell100Sqmi)} square miles, nearly all of them in ${esc(L.fell100States)}, and by as much as ${nf(L.maxFallFt)} feet. It rose more than 10 feet under about ${sq(L.rose10Sqmi)} square miles, most of them in ${esc(L.rose10States)}.</p>
      <p><button type="button" class="wm-lnk" data-levels>${on ? 'Hide the change in water levels' : 'Show the change in water levels on the aquifer'}</button></p>
      <p class="wm-legend-line" data-levels-key${on ? '' : ' hidden'}><span><i class="wm-sw" style="background:linear-gradient(90deg,${R[0]},${R[1]})"></i>fell 10 to 150 feet or more</span><span>${sw(R[2])}within 10 feet</span><span><i class="wm-sw" style="background:linear-gradient(90deg,${R[3]},${R[4]})"></i>rose 10 to 50 feet</span></p>
      <p class="wm-note"><a href="${esc(L.url)}">${esc(L.src)}</a>.</p>`;
  }
  syncLevels() {
    const on = this.app.levels;
    for (const b of this.$$('[data-levels]')) b.textContent = on ? 'Hide the change in water levels' : 'Show the change in water levels on the aquifer';
    for (const k of this.$$('[data-levels-key]')) k.hidden = !on;
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
      <h5>Aquifers pumped the most<span class="wm-h-u">Mgal/d</span></h5><div class="wm-list">${top.map((a) => `<button type="button" class="wm-li" data-aq="${a.i}"><span>${sw(ROCK_COLORS[a.rock] || ROCK_COLORS.Other)}${esc(a.name)}<small>${esc(a.rock)}</small></span><span>${mgd(a.total)}</span></button>`).join('')}</div>
      <p class="wm-note">Million gallons a day. Each aquifer under the land is colored by the rock that holds its water:</p>
      <p class="wm-legend-line wm-rocks">${Object.entries(ROCK_COLORS).filter(([r]) => r !== 'Other' && A.list.some((a) => a.rock === r)).map(([r, c]) => `<span>${sw(c)}${esc(r.charAt(0) + r.slice(1).toLowerCase())}</span>`).join('')}</p>
      <div class="wm-kv">
        <span>From the mapped principal aquifers</span><span>${nf(100 * mapped / g)}%</span>
        <span>Drawn down, 1900–2008</span><span>${nf(dep)} km³</span>
      </div>
      <p class="wm-note">The rest came from glacial, alluvial and other aquifers the map does not outline. ${nf(dep)} cubic kilometers is about ${nf(km3gal(dep) / 1e12)} trillion gallons (Konikow, 2013).${st ? ` The High Plains aquifer alone had about ${nf(st.af / 1e9, 2)} billion acre-feet of recoverable water in storage in ${st.year} (${esc(st.src)}).` : ''} The shapes come from the USGS map; their depth and thickness are drawn the same everywhere, so they are not to scale.</p>`;
    if (hp) html += this.levelsBlock();
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
      <h5>Where its water comes from</h5>${mixBlock(this.srcRows(agg.src), (v) => volShort(v))}
      <h5>What each source was used for</h5>
      ${this.sankeyFor(agg, big ? 1000 : 1, big ? (v) => nf(v, v < 10 ? 1 : 0) : (v) => mgd(v))}
      <p class="wm-note">${big ? 'Billion' : 'Million'} gallons a day. The white part of a bar is the share consumed.</p>`;
    if (!agg.splitAll && (agg.W.ir > 0)) html += `<p class="wm-note">USGS reported ${esc(name)}'s crop and golf irrigation as one number, shown here as crops.</p>`;
    html += `<h5>Counties withdrawing the most<span class="wm-h-u">Mgal/d</span></h5><div class="wm-list">${top.map((i) => `<button type="button" class="wm-li" data-county="${i}"><span>${esc(m.wu.name[i])}<small>mostly ${esc(CAT[CAT_KEYS.slice().sort((a, b) => m.county(i).W[b] - m.county(i).W[a])[0]].short.toLowerCase())}</small></span><span>${mgd(m.total[i])}</span></button>`).join('')}</div>`;
    this.setInspector(html, true);
  }
  /** one sentence on where a place's water comes from and goes */
  storyOf(c, name, i = -1) {
    if (!(c.total > 0)) return '';
    const top = CAT_KEYS.slice().sort((a, b) => c.W[b] - c.W[a]);
    const k = top[0], share = pct(c.W[k], c.total);
    // (California counties whose crop water USGS split in one statewide proportion: the split says nothing about them)
    if (k === 'ir' && i >= 0 && this.m.propIr.has(i)) {
      const second = top[1] && c.W[top[1]] / c.total > 0.08 ? ` ${CAT[top[1]].name} took ${pct(c.W[top[1]], c.total)}%.` : '';
      return `${share}% of ${esc(name)}'s water went to ${esc(CAT[k].name.toLowerCase())}.${second}`;
    }
    const s = c.src[k], tot = Object.values(s).reduce((a, b) => a + b, 0);
    const gw = (s.gf || 0) + (s.gs || 0), sal = (s.ss || 0) + (s.gs || 0);
    const piped = k === 'ps' ? c.pipedIn || 0 : 0, brought = (c.broughtIn && c.broughtIn[k]) || 0;
    const from = piped / tot > 0.6 ? 'mostly piped in from other counties' : brought / tot > 0.6 ? 'mostly brought in by aqueduct' : brought / tot > 0.25 ? `${pct(brought, tot)}% of it brought in by aqueduct` : gw / tot > 0.6 ? 'mostly pumped from wells' : sal / tot > 0.6 ? 'mostly drawn from salt water' : gw / tot > 0.25 ? `${pct(gw, tot)}% of it pumped from wells and the rest drawn from rivers and lakes` : 'mostly drawn from rivers and lakes';
    const second = top[1] && c.W[top[1]] / c.total > 0.08 ? ` ${CAT[top[1]].name} took ${pct(c.W[top[1]], c.total)}%.` : '';
    return `${share}% of ${esc(name)}'s water went to ${esc(CAT[k].name.toLowerCase())}, ${from}.${second}`;
  }
  /** withdrawals by source (fresh and saline, surface and ground) as mix rows; groundwater names its main aquifers */
  srcRows(src, aq = null) {
    return ['sf', 'gf', 'ss', 'gs'].map((k) => ({ v: src[k] || 0, color: SRC_DEF[k].color, round: true, name: SRC_DEF[k].name, sub: k === 'gf' && aq && aq.length ? aquiferWords(aq) : SRC_DEF[k].sub }))
      .filter((r) => r.v > 0).sort((a, b) => b.v - a.v);
  }
  /**
   * a county's water as its uses drew it: what it withdrew and kept, plus what the big public systems piped in
   * (core/transfers.js), with what they piped away taken from surface water first, as the map draws it. The same
   * shape as model.county() and model.aggregate(), for the story and the Sankey.
   */
  usedBy(i, c, agg) {
    const m = this.m, taken = m.xTaken.get(i), xin = m.xIn.get(i) || [];
    // (the West's imported water is already in the county's own figures: it only changes what the story says)
    const impl = m.imp ? m.imp.get(i) || [] : [];
    if (impl.length) { const b = {}; for (const x of impl) b[x.cat] = (b[x.cat] || 0) + x.vol; c = { ...c, broughtIn: b }; }
    if (!taken && !xin.length) return { c, agg, moved: false };
    const c2 = { ...c, W: { ...c.W }, src: { ...c.src, ps: { ...c.src.ps } } };
    const a2 = { ...agg, W: { ...agg.W }, src: { ...agg.src }, bySrc: { ...agg.bySrc, ps: { ...agg.bySrc.ps } } };
    const add = (k, v) => { c2.src.ps[k] = Math.max(0, (c2.src.ps[k] || 0) + v); a2.bySrc.ps[k] = Math.max(0, (a2.bySrc.ps[k] || 0) + v); a2.src[k] = Math.max(0, (a2.src[k] || 0) + v); c2.W.ps = Math.max(0, c2.W.ps + v); a2.W.ps = Math.max(0, a2.W.ps + v); c2.total += v; a2.total += v; };
    if (taken) { add('sf', -taken.sf); add('gf', -taken.gw); }
    for (const x of xin) add(x.sys.gw ? 'gf' : 'sf', x.vol);
    c2.pipedIn = xin.reduce((q, x) => q + x.vol, 0);
    return { c: c2, agg: a2, moved: true };
  }
  /** the county's withdrawals every five years since 1985, stacked by use (history.json, from the USGS county files) */
  historyBlock(i) {
    const H = this.app.history; if (!H) return '';
    const Y = H.years, t = H.t[i];
    if (!t || t.filter((v) => v != null).length < 4) return '';
    const max = Math.max(...t.map((v) => v || 0)); if (!(max > 0.05)) return '';
    const parts = [['pt', H.pt[i]], ['ir', H.ir[i]], ['ps', H.ps[i]]];
    const W = 280, Hh = 96, bw = 26, gap = (W - Y.length * bw) / (Y.length - 1), base = Hh - 16, sc = (base - 12) / max;
    let bars = '';
    Y.forEach((y, k) => {
      const x = k * (bw + gap);
      if (y === 1985 || y === 2000 || y === 2015) bars += `<text x="${(x + bw / 2).toFixed(1)}" y="${Hh - 3}">${y}</text>`;
      if (t[k] == null) return;
      const known = parts.reduce((s, [, a]) => s + (a[k] || 0), 0);
      let y0 = base;
      for (const [col, v] of [...parts.map(([c, a]) => [CAT[c].color, a[k] || 0]), ['#8c918e', Math.max(0, t[k] - known)]]) {
        const h = v * sc; if (h < 0.05) continue;
        y0 -= h; bars += `<rect x="${x.toFixed(1)}" y="${y0.toFixed(2)}" width="${bw}" height="${h.toFixed(2)}" fill="${col}"><title>${y}: ${mgd(v)} Mgal/d</title></rect>`;
      }
      if (k === Y.length - 1 || t[k] === max) bars += `<text x="${(x + bw / 2).toFixed(1)}" y="${(y0 - 3).toFixed(1)}">${mgd(t[k])}</text>`;
    });
    // the change since 2005, and the use that moved the most
    let line = '';
    const a = t[4], b = t[6];
    if (a != null && b != null && a > 0.05) {
      const d = [['power plants', parts[0][1]], ['crops and golf courses', parts[1][1]], ['public supply', parts[2][1]]]
        .map(([n, arr]) => [n, (arr[6] || 0) - (arr[4] || 0)]).sort((p, q) => Math.abs(q[1]) - Math.abs(p[1]))[0];
      const ch = (b - a) / a;
      line = `It withdrew ${mgd(a)} Mgal/d in 2005 and ${mgd(b)} in 2015${Math.abs(ch) >= 0.05 ? `, ${ch < 0 ? 'down' : 'up'} ${nf(Math.abs(100 * ch))} percent` : ', about the same'}${Math.abs(ch) >= 0.05 && Math.abs(d[1]) >= 0.5 * Math.abs(b - a) ? `, mostly ${d[1] < 0 ? 'less' : 'more'} for ${d[0]}` : ''}.`;
    }
    return `<h5>Since 1985</h5>
      <svg class="wm-hist" viewBox="0 0 ${W} ${Hh}" width="100%" role="img" aria-label="Water withdrawn every five years, 1985 to 2015">${bars}</svg>
      <p class="wm-legend-line">${[['pt', 'Power plants'], ['ir', 'Crops and golf'], ['ps', 'Public supply']].map(([c, n]) => `<span>${sw(CAT[c].color)}${n}</span>`).join('')}<span>${sw('#8c918e')}Everything else</span></p>
      ${line ? `<p class="wm-sub">${line}</p>` : ''}
      <p class="wm-note">Million gallons a day withdrawn, from the USGS county estimates made every five years. Before 2000 they also counted self-supplied commercial water, which USGS stopped estimating; the 2000 totals here are the sum of the uses USGS listed.</p>`;
  }
  /** how strained the county's rivers and streams are, against the water they usually carry (USGS's SUI) */
  strainBlock(i) {
    const s = this.app.strain;
    if (!s || !(s.sui[i] >= 0)) return '';
    const v = Math.round(100 * s.sui[i]), v15 = s.sui15[i] >= 0 ? Math.round(100 * s.sui15[i]) : null, p = s.pct[i];
    const rel = p >= 0.5 ? `more than in ${nf(Math.floor(100 * p))} percent of counties` : `less than in ${nf(Math.floor(100 * (1 - p)))} percent of counties`;
    return `<h5>Strain on its rivers and streams</h5>
      <p class="wm-sub">In an average month of water years 2010 to 2020, ${v} percent of the streamflow its watersheds usually carry was missing, because of dry spells or because it was consumed${v15 != null && Math.abs(v15 - v) >= 3 ? ` (${v15} percent in water year 2015)` : ''}. That is ${rel}${v > 60 ? '. USGS calls watersheds above 60 percent chronically imbalanced.' : `, where the median is ${Math.round(100 * s.median)} percent.`}</p>
      <p class="wm-note">USGS surface water supply and use index, averaged over the county’s watersheds; it leaves out water piped in from other basins. <button type="button" class="wm-lnk" data-choro-go="strain">Color the map by it</button></p>`;
  }
  showCounty(i, flowNotes = '') {
    const m = this.m, c = m.county(i), agg = m.aggregate([i]);
    const plants = (m.plantsByCounty.get(i) || []).slice().sort((a, b) => (b.w || 0) - (a.w || 0));
    const ph = m.placeholders.filter((h) => h.county === i);
    const perCap = c.pop > 0 ? c.total * 1e6 / (c.pop * 1000) : null;
    const stName = this.app.stateName(c.st);
    const aq = this.app.aquifers && this.app.aquifers.county ? this.app.aquifers.county[c.id] : null;
    // water the big public systems moved to or from it (core/transfers.js)
    const xin = m.xIn.get(i) || [], xout = m.xOut.get(i) || [];
    const imp = xin.reduce((a, x) => a + x.vol, 0), exp = xout.reduce((a, x) => a + x.vol, 0);
    const ap = (j) => `${m.wu.name[j]}, ${AP_STATE[m.wu.st[j]] || m.wu.st[j]}`;
    // (where a big system pipes water in, the headline is all the water its uses drew, as the map's shares are)
    let html = `<p class="wm-cap">County · <button type="button" class="wm-lnk" data-state="${esc(c.st)}">${esc(stName)}</button></p><h3>${esc(c.name)}</h3>
      <div class="wm-big">${imp > 0.05 ? `${mgd(c.total - exp + imp)} <small>million gallons a day for its uses</small>` : `${mgd(c.total)} <small>million gallons a day withdrawn</small>`}</div>`;
    if (imp > 0.05) html += `<p class="wm-sub">${mgd(c.total)} Mgal/d withdrawn here${exp > 0.05 ? ` (${mgd(exp)} of it piped to other counties)` : ''} and ${mgd(imp)} piped in for its public water systems from reservoirs in other counties, where USGS counts it.</p>`;
    else if (exp > 0.05) html += `<p class="wm-sub">${mgd(exp)} Mgal/d of it was piped to other counties: ${esc([...new Set(xout.map((x) => x.sys.short))].join(', '))}. Its own uses drew the other ${mgd(c.total - exp)}.</p>`;
    // (the sources block is put together apart, so it can follow the diagram on wide screens and lead on phones)
    let srcHtml = '';
    if (c.total + imp > 0) {
      // reclaimed wastewater is not a withdrawal, but it is water the county's uses drew, so it is one of the shares
      // (as on the map); water bought from utilities is already in the utilities' withdrawals. Water piped in counts,
      // water piped away does not (taken from surface water first, as the map draws it)
      const src = { ...agg.src }, taken = m.xTaken.get(i);
      if (taken) { src.sf = Math.max(0, (src.sf || 0) - taken.sf); src.gf = Math.max(0, (src.gf || 0) - taken.gw); }
      // the West's imported water is part of the county's own surface withdrawals, so it comes out of rivers and lakes
      const impl = m.imp ? m.imp.get(i) || [] : [];
      for (const x of impl) src.sf = Math.max(0, (src.sf || 0) - x.vol);
      const rows = this.srcRows(src, aq).filter((r) => r.v > 0.0005);
      // (one row for each system, as the map boxes it at the intake, naming the uses it brought water for)
      const impBy = new Map();
      for (const x of impl) { const e = impBy.get(x.sys.id) || { sys: x.sys, what: x.what, vol: 0, cats: [] }; e.vol += x.vol; e.cats.push(x.cat); impBy.set(x.sys.id, e); }
      const and = (a) => (a.length > 1 ? `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}` : a[0]);
      for (const e of impBy.values()) rows.push({ v: e.vol, color: SRC_DEF.sf.color, round: true, name: e.sys.short, sub: `brought in from ${e.what}${e.cats.some((k) => k !== 'ps') ? `, for ${and(e.cats.map((k) => CAT[k].name.toLowerCase()))}` : ''}` });
      for (const gw of [false, true]) {
        const part = xin.filter((x) => !!x.sys.gw === gw), v = part.reduce((a, x) => a + x.vol, 0);
        if (v > 0.005) rows.push({ v, color: gw ? SRC_DEF.gf.color : SRC_DEF.sf.color, round: true, name: gw ? 'Groundwater, piped in' : 'Rivers and lakes, piped in', sub: `from ${[...new Set(part.map((x) => x.what))].join('; ')}` });
      }
      const rec = c.other.ir_rec + c.other.go_rec + c.other.pt_rec;
      const recFor = [['crops', c.other.ir_rec], ['golf courses', c.other.go_rec], ['power plants', c.other.pt_rec]].filter((r) => r[1] > 0.005).map((r) => r[0]);
      if (rec > 0.005) rows.push({ v: rec, color: SRC_DEF.rec.color, round: true, name: SRC_DEF.rec.name, sub: `reused${recFor.length ? ` by ${recFor.length > 1 ? `${recFor.slice(0, -1).join(', ')} and ${recFor[recFor.length - 1]}` : recFor[0]}` : ''}; not counted as a withdrawal` });
      rows.sort((a, b) => b.v - a.v);
      srcHtml += `<h5>Where its water comes from</h5>${mixBlock(rows)}`;
      const parts = [`the ${mgd(c.total - exp)} Mgal/d ${exp > 0.05 ? 'it withdrew and kept' : 'withdrawn'}`];
      if (imp > 0.05) parts.push(`${mgd(imp)} Mgal/d piped in`);
      if (rec > 0.005) parts.push(`${mgd(rec)} Mgal/d of reclaimed wastewater`);
      if (parts.length > 1 || exp > 0.05) srcHtml += `<p class="wm-note">Shares of all the water its uses drew: ${parts.length > 2 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts.join(' and ')}.</p>`;
      if (COUNTY_NOTES[c.id]) srcHtml += `<p class="wm-note">${esc(COUNTY_NOTES[c.id])}</p>`;
      else if (m.propIr.has(i)) srcHtml += `<p class="wm-note">${esc(propIrNote(m.propIr.size - 1))}</p>`;
    }
    // (where water was piped in or away, the story and the Sankey are of the water its uses drew, like the shares above)
    const used = this.usedBy(i, c, agg);
    const story = `<p class="wm-sub wm-story">${this.storyOf(used.c, c.name, i)} ${c.total > 0 ? `${ord(m.rank[i])} of ${nf(m.n)} counties by water withdrawn.` : ''}${perCap ? ` ${nf(c.pop * 1000)} residents.` : ''}</p>`;
    const more2 = `<div data-strain="${i}">${this.strainBlock(i)}</div><div data-hist="${i}">${this.historyBlock(i)}</div>`;
    const sk = used.agg.total > 0.0005 ? `<h5>Where its water goes</h5>${this.sankeyFor(used.agg, 1, (v) => mgd(v))}
        <p class="wm-note">Million gallons a day ${used.moved ? `its uses drew, ${imp > 0.05 && exp > 0.05 ? 'counting water piped in and not water piped away' : imp > 0.05 ? 'counting water piped in' : 'not counting water piped away'}` : 'withdrawn'}, from each source to each use. The white part of a bar is the share consumed.</p>` : '';
    // where its water goes leads on wide screens, right under the headline; on phones the folded sheet shows the sources
    html += window.matchMedia(PHONE_MQ).matches ? srcHtml + story + more2 + sk : story + sk + srcHtml + more2;
    if (flowNotes) html += flowNotes;
    // (a system's other sources, for the figures its note gives)
    const more = (y) => (y.more || []).map((r) => `; <a href="${esc(r.url)}">${esc(r.src)}</a>`).join('');
    const pipeNote = (list) => [...new Map(list.map((x) => [x.sys.id, x.sys])).values()].map((y) => `${esc(y.name.charAt(0).toUpperCase() + y.name.slice(1))} (${esc(y.operator)}) carries it through ${esc(y.via)}. ${y.mgdSys ? `The operator reports ${esc(nf(y.mgdSys, y.mgdSys < 100 ? 1 : 0))} Mgal/d ${esc(y.what)} (<a href="${esc(y.url)}">${esc(y.src)}</a>${more(y)}). ` : ''}${esc(y.conf || '')}`).join(' ');
    if (imp > 0.05) {
      const rows = [...xin].sort((a, b) => b.vol - a.vol);
      html += `<h5>Piped in</h5><div class="wm-kv">${rows.map((x) => `<span>From ${esc(ap(x.from))}<small>${esc(x.what)}</small></span><span>${mgd(x.vol)} Mgal/d</span>`).join('')}</div>
        <p class="wm-note">${pipeNote(rows)} The volumes are the USGS withdrawals in those counties, divided as described in the notes below the map.</p>`;
    }
    const impl = m.imp ? m.imp.get(i) || [] : [];
    if (impl.length) {
      const rows = [...impl].sort((a, b) => b.vol - a.vol);
      const sysNote = [...new Map(rows.map((x) => [x.sys.id, x.sys])).values()].map((y) => `The ${esc(y.operator)} brings it through ${esc(y.via)}. ${y.figNote ? esc(y.figNote) : `The figure is what the operator reports ${esc(y.what)} in ${esc(y.year)}`} (<a href="${esc(y.url)}">${esc(y.src)}</a>${more(y)}). ${esc(y.conf || '')}`).join(' ');
      html += `<h5>Brought in by aqueduct</h5><div class="wm-kv">${rows.map((x) => `<span>${esc(x.sys.short)}<small>from ${esc(x.what)}${x.cat !== 'ps' || rows.length > 1 ? `, for ${esc(CAT[x.cat].name.toLowerCase())}` : ''}</small></span><span>${mgd(x.vol)} Mgal/d</span>`).join('')}</div>
        <p class="wm-note">${sysNote} USGS counts this water in ${esc(c.name)}, as surface water withdrawn there, and the map draws it from the aqueduct's intake.</p>`;
    }
    if (exp > 0.05) {
      const rows = [...xout].sort((a, b) => b.vol - a.vol);
      html += `<h5>Piped to other counties</h5><div class="wm-kv">${rows.map((x) => `<span>${esc(ap(x.to))}<small>${esc(x.sys.short)}</small></span><span>${mgd(x.vol)} Mgal/d</span>`).join('')}</div>
        <p class="wm-note">${pipeNote(rows)}</p>`;
    }
    const kv = [];
    if (c.cu.ir > 0) kv.push([c.split ? 'Crop irrigation consumed' : 'Irrigation consumed', `${mgd(consumedOf(agg, 'ir'))} Mgal/d`]);
    if (c.cu.go > 0) kv.push(['Golf irrigation consumed', `${mgd(consumedOf(agg, 'go'))} Mgal/d`]);
    if (c.cu.pt > 0) kv.push(['Power plants consumed', `${mgd(c.cu.pt)} Mgal/d`]);
    const ptNote = c.cu.pt > c.W.pt + 0.01 ? '<p class="wm-note">The power plants here consumed more than they withdrew, because they also cool with reclaimed wastewater or water bought from utilities, which USGS does not count as their withdrawals.</p>' : '';
    if (c.other.do_del > 0) kv.push(['Delivered to homes by utilities', `${mgd(c.other.do_del)} Mgal/d`]);
    if (c.acres.ir > 0) kv.push([c.split ? 'Irrigated cropland' : 'Irrigated land', `${nf(c.acres.ir * 1000)} acres`]);
    // (the satellite map of irrigated land, beside the USGS acreage)
    const lk = m.cdata[i] && m.cdata[i].lanid_km2;
    if (lk >= 0.5) kv.push(['Irrigated land seen from space', `${nf(Math.round(lk * 247.105 / 100) * 100)} acres`]);
    if (c.acres.go > 0) kv.push(['Irrigated golf courses', `${nf(c.acres.go * 1000)} acres`]);
    if (kv.length) html += `<h5>Consumed, delivered and irrigated</h5><div class="wm-kv">${kv.map(([a, b]) => `<span>${a}</span><span>${b}</span>`).join('')}</div>` + ptNote;
    if (lk >= 0.5) html += `<p class="wm-note">The acreage seen from space comes from LANID, a map of the land irrigated in 2015 made from Landsat images (Xie, Gibbs and Lark, 2021). Its fields are the ones tinted green on the map${lk >= 1 ? ', and the county’s crop water ends on them' : ''}.</p>`;
    if (!c.split && c.W.ir > 0) html += `<p class="wm-note">USGS reported ${esc(stName)}'s crop and golf irrigation as one number, shown here as crops.</p>`;
    if (aq && aq.length) {
      const tot = aq.reduce((s, r) => s + r[2], 0);
      html += `<h5>Groundwater, by aquifer</h5><div class="wm-bars">${aq.slice(0, 5).map((r) => `<div class="wm-cbar"><span>${r[0] > 0 ? `<button type="button" class="wm-lnk" data-aq="${r[0]}">${esc(r[1])}</button>` : esc(r[1])}</span><span class="wm-t"><i style="width:${(100 * r[2] / Math.max(1e-9, aq[0][2])).toFixed(1)}%"></i></span><span class="wm-v">${mgd(r[2])}</span></div>`).join('')}</div>
        <p class="wm-note">Million gallons a day, ${mgd(tot)} in all (Lovelace and others, 2020). <button type="button" class="wm-lnk" data-under="1">See the aquifers</button></p>`;
    }
    if (plants.length || ph.length) {
      html += `<h5>Water-cooled power plants</h5><div class="wm-list">` + plants.map((p) => `<button type="button" class="wm-li" data-plant="${m.plants.indexOf(p)}"><span>${esc(p.name)}<small>${esc(genName(p.gen))} · ${esc(coolName(p.cooling))}</small></span><span>${mgd(p.w || 0)}</span></button>`).join('') +
        ph.map((h) => `<div class="wm-li"><span>Plants not in the USGS plant model<small>the county total, placed near its towns</small></span><span>${mgd(h.w)}</span></div>`).join('') + `</div>`;
    }
    html += `<div data-facs="${i}">${this.facBlock(i)}</div><div data-sys="${i}">${this.sysBlock(i)}</div>`;
    const osm = this.app.osm && this.app.osm.byCounty.get(i);
    const dams = this.app.damsByCounty && this.app.damsByCounty.get(i);
    if (osm || dams) {
      const rows = [];
      if (dams) rows.push(['Dams in the National Inventory', `${nf(dams.n)}${dams.stor > 0 ? ` · ${af(dams.stor)}` : ''}`]);
      if (osm) OSM_KINDS.forEach((k, j) => { if (osm[j]) rows.push([`${OSM_LABEL[k]}s mapped`, nf(osm[j])]); });
      html += `<h5>Mapped here</h5><div class="wm-kv">${rows.map(([a, b]) => `<span>${a}</span><span>${b}</span>`).join('')}</div>
        <p class="wm-note">Dams from the National Inventory of Dams; facilities from OpenStreetMap, which is incomplete.</p>`;
    }
    html += `<p class="wm-note">Volumes are USGS county estimates for 2015. USGS reports how much came from surface water and from wells, but not from which river; the map draws the intakes on the county's largest rivers and lakes, so their exact spots are illustrative.</p>`;
    this.setInspector(html, true);
    // (the history and the strain index arrive after the first click: fill them in when they do)
    if (!this.app.history) this.app.loadHistory().then(() => { const el = this.$(`[data-insp] [data-hist="${i}"]`); if (el) el.innerHTML = this.historyBlock(i); });
    if (!this.app.strain) this.app.loadStrain().then(() => { const el = this.$(`[data-insp] [data-strain="${i}"]`); if (el) el.innerHTML = this.strainBlock(i); });
    if (!this.app.systems) this.app.loadSystems?.().then(() => { const el = this.$(`[data-insp] [data-sys="${i}"]`); if (el) el.innerHTML = this.sysBlock(i); });
    if (this.app.fac && !this.app.fac.names) this.app.fac.loadNames().then(() => {
      const el = this.$(`[data-insp] [data-facs="${i}"]`); if (!el) return;
      el.innerHTML = this.facBlock(i);
      for (const a of el.querySelectorAll('[data-fac]')) this.on(a, 'click', () => this.app.selectFac(+a.dataset.fac, true));
    });
  }
  /** a county's factories, mines, fish farms and livestock farms with EPA permits, the largest by design flow first */
  facBlock(i) {
    const L = this.app.fac, ids = L && L.byCounty.get(i);
    if (!ids || !ids.length) return '';
    const F = L.data, M = L.meta, f = (j) => (F.flow[j] > 0 && !(F.flags[j] & 2) ? F.flow[j] : 0);
    const top = ids.slice().sort((a, b) => f(b) - f(a) || (F.flags[b] & 1) - (F.flags[a] & 1)).slice(0, 6);
    const cnt = FAC_KINDS.map((_, k) => ids.filter((j) => F.kind[j] === k).length);
    const words = [['factory', 'factories'], ['mining site', 'mining sites'], ['fish farm', 'fish farms'], ['farm', 'farms']].map(([a, b], k) => (cnt[k] ? `${nf(cnt[k])} ${cnt[k] === 1 ? a : b}` : null)).filter(Boolean);
    const list = L.names ? top.map((j) => `<button type="button" class="wm-li" data-fac="${j}"><span>${esc(L.names[j])}<small>${esc(facLabel(FAC_KINDS[F.kind[j]], M.code[j]))}${M.what[j] ? ` · ${esc(M.what[j].toLowerCase())}` : ''}</small></span><span>${f(j) ? mgd(f(j)) : ''}</span></button>`).join('') : '';
    return `<h5>Factories, mines and farms with EPA permits</h5>${list ? `<div class="wm-list">${list}</div>` : ''}
      <p class="wm-note">${words.length > 1 ? `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}` : words[0]} here ${ids.length === 1 ? 'holds' : 'hold'} an individual EPA discharge permit.${list && top.some((j) => f(j)) ? ' The figures are design flows, the most each was built to discharge, in million gallons a day.' : ''}</p>`;
  }
  /** the public water systems that serve a county (USGS service areas), the most people served there first */
  sysBlock(i) {
    const S = this.app.systems; if (!S) return '';
    const rows = S.by[i]; if (!rows || !rows.length) return '';
    const big = (v) => (v >= 1e6 ? `${nf(v / 1e6, 1)} million` : nf(v));
    return `<h5>Public water systems</h5><div class="wm-kv">${rows.map(([k, sh]) => { const [nm, , pop] = S.sys[k]; return `<span>${esc(nm)}${sh < 0.9 ? `<small>${sh >= 0.5 ? 'Also serves other counties' : 'Mostly serves other counties'}</small>` : ''}</span><span>${big(pop)} people</span>`; }).join('')}</div>
      <p class="wm-note">These are the systems that serve the most people in the county, from the USGS map of water service areas (Buchwald and others, 2022). Each figure is everyone the system serves, here and beyond. A wholesaler’s area includes the towns it sells water to.</p>`;
  }
  showPlant(pi) {
    const p = this.m.plants[pi];
    const c = p.county >= 0 ? this.m.county(p.county) : null;
    // the county it stands in (USGS counts a few plants' water in the county across the river: p.loc_county)
    const at = p.loc_county != null && p.loc_county >= 0 ? this.m.county(p.loc_county) : c;
    const src = p.src || {};
    const own = plantClass(p);
    const named = srcName(p.src_name);
    const rows = ['sf', 'ss', 'gf', 'gs', 'rec', 'ps'].map((k) => {
      const d = SRC_DEF[k], useName = named && own === k;
      return { k, v: src[k] || 0, color: d.color, round: true, name: useName ? named : d.name, sub: useName ? d.sub : d.sub };
    }).filter((r) => r.v > 0).sort((a, b) => b.v - a.v);
    const W = rows.reduce((a, r) => a + r.v, 0);
    const cu = Math.min(p.c || 0, W), ret = Math.max(0, W - cu);
    const once = /ONCE-THROUGH/.test(p.cooling || '');
    const fates = [
      { name: 'Returned', sub: once ? 'discharged back to surface water, warmer' : 'discharged back to surface water', v: ret, color: RETURN_GRAY },
      { name: 'Consumed', sub: /POND/.test(p.cooling || '') ? 'mostly evaporated from its cooling pond' : /TOWER|COMPLEX/.test(p.cooling || '') ? 'mostly evaporated in its cooling towers' : 'mostly evaporated', v: cu, color: '#f4f1ea' },
    ];
    const perMWh = (v) => (p.mwh > 0 && v > 0 ? (v * 1e6 * 365) / p.mwh : null);
    const wI = perMWh(W), cI = perMWh(cu);
    // the plant model names a source the county figures do not count for this plant
    const ownMissing = own && !(src[own] > 0) && W > 0;
    let html = `<p class="wm-cap">Power plant · ${esc(genName(p.gen).toLowerCase())}</p><h3>${esc(p.name)}</h3>
      <p class="wm-sub">${at ? `${esc(at.name)}, ${esc(this.app.stateName(at.st))}` : esc(p.st)} · ${esc(coolName(p.cooling).toLowerCase())}</p>`;
    if (at && c && at !== c && at.id !== c.id) html += `<p class="wm-note">USGS counts this plant's water in ${esc(c.name)}, across the ${esc(srcName(p.src_name) || 'river')} from it, and the map does too.</p>`;
    if (W > 0) {
      html += `<div class="wm-big">${mgd(W)} <small>million gallons a day, nearly all to carry away heat</small></div>
        <h5>Where its water comes from</h5>${mixBlock(rows)}
        ${(src.rec || 0) + (src.ps || 0) > 0 && p.w_env > 0 ? `<p class="wm-note">${mgd(p.w_env)} Mgal/d of it was withdrawn from rivers, lakes or wells; the rest was reclaimed or bought.</p>` : ''}
        ${ownMissing && named ? `<p class="wm-note">The USGS plant model names ${esc(withThe(named))} as this plant's source, but the USGS county figures the map follows count its county's power-plant water as ${esc(rows.map((r) => r.name.toLowerCase()).join(' and '))}.</p>` : ''}
        <h5>What happens to it</h5>${mixBlock(fates)}`;
    } else {
      const cw = c ? c.W.pt + c.other.pt_rec + c.other.pt_ps : 0;
      html += cw > 0
        ? `<p class="wm-sub">The map divides ${esc(c.name)}'s ${mgd(cw)} Mgal/d of power-plant water among its plants in proportion to the USGS plant model and by the kind of water each draws, and none of it falls to this plant. The model estimated ${mgd(p.model_w)} million gallons a day for it.</p>`
        : `<p class="wm-sub">The USGS county figures record no power-plant water in this county in 2015, so the map draws none for this plant. The USGS plant model estimated ${mgd(p.model_w)} million gallons a day.</p>`;
    }
    const kv = [];
    if (p.mwh > 0) kv.push(['Electricity generated, 2015', `${nf(p.mwh / 1e6, p.mwh < 1e6 ? 2 : 1)} TWh`]);
    // (to two figures: the water and the electricity are each estimates)
    if (wI) kv.push(['Water used per MWh', `about ${nf(sig2(wI))} gal`]);
    if (cI) kv.push(['Water consumed per MWh', `about ${nf(sig2(cI))} gal`]);
    if (kv.length) html += `<h5>Per unit of electricity</h5><div class="wm-kv">${kv.map(([a, b]) => `<span>${a}</span><span>${b}</span>`).join('')}</div>`;
    // the plant model's own estimate, in words, and where the county figures fall against it
    const rw = p.model_w_rng || [], rc = p.model_c_rng || [];
    const wRange = rw[0] > 0 && rw[1] / rw[0] < 20 ? ` (plausible range ${mgd(rw[0])} to ${mgd(rw[1])})` : '';
    const cRange = rc[0] > 0 ? ` (plausible range ${mgd(rc[0])} to ${mgd(rc[1])})` : '';
    const off = (W > 0 && cu > 0 && rc[0] > 0 && (cu < rc[0] * 0.98 || cu > rc[1] * 1.02) ? ` For this plant the county figures put consumption ${cu < rc[0] ? 'below' : 'above'} the model's range.` : '')
      // (scripts/water-map/check_plants.mjs lists the plants where the two disagree this much)
      + (W > 5 && p.model_w > 0 && W > 10 * p.model_w ? ` They put its withdrawals at ${nf(Math.round(W / p.model_w))} times the model's estimate.` : '');
    // what the plant's operator reported to EIA for the year (scripts/water-map/bake_eia_plants.py)
    const rep = p.eia_w == null ? (W > 5 && p.model_w > 0 && W > 10 * p.model_w ? ' Its operator filed no cooling-water report with the Energy Information Administration for 2015, so nothing settles the difference.' : '')
      : ` Its operator reported ${mgd(p.eia_w)} Mgal/d withdrawn${p.eia_c >= 0.05 ? ` and ${mgd(p.eia_c)} consumed` : ''} to the U.S. Energy Information Administration for 2015${W > 0 && p.eia_w > 0 ? (W / p.eia_w > 0.8 && W / p.eia_w < 1.25 ? ', close to the county figure above' : `, ${nf(Math.round(100 * p.eia_w / W))} percent of the county figure above`) : ''}.`;
    html += `<h5>Other estimates</h5>
      <p class="wm-note">USGS also estimated every plant's water from its heat budget (Harris and Diehl, 2019). For ${esc(p.name)} that model gives ${mgd(p.model_w)} Mgal/d withdrawn${wRange} and ${mgd(p.model_c)} Mgal/d consumed${cRange}. The figures above follow the USGS county data instead: the county's 2015 power-plant water by source, divided among its plants in proportion to the model.${off}${rep}</p>
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
    const html = `<p class="wm-cap">Dam</p><h3>${esc(nm ? nm[0] || 'Unnamed dam' : 'Dam')}</h3>
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
    const aq = c && this.app.aquifers && this.app.aquifers.county ? this.app.aquifers.county[c.id] : null;
    const psRows = c ? this.srcRows(c.src.ps, aq) : [];
    let body = '';
    if (k === 'data_center') {
      const D = DATA_CENTERS;
      const r = (D.reported || []).find((q) => Math.hypot(q.x - L.data.x[i], q.z - L.data.z[i]) < 1.5);
      body = r ? `<p class="wm-sub">${esc(r.op)} reported that its ${esc(r.name)} data center consumed ${nf(r.gal / 1e6)} million gallons of water in ${esc(r.year)}, about ${nf(r.gal / 365 / 1e6, 2)} million gallons a day.</p>` : `<p class="wm-sub">Its operator does not publish how much water it uses or where the water comes from.</p>`;
      if (c && psRows.length) body += `<h5>Public supply in ${esc(c.name)}</h5>${mixBlock(psRows, null)}<p class="wm-note">For context: where the county's utilities got their water in 2015 (USGS). Many data centers buy water from the local utility, but this one's source is not reported.</p>`;
      body += `<p class="wm-note">For scale, LBNL projects that all U.S. data centers together will consume about ${nf(D.directGal[0] / 1e9)} to ${nf(D.directGal[1] / 1e9)} billion gallons on site in ${D.year}, about ${nf(D.directMgd[0])} to ${nf(D.directMgd[1])} million gallons a day.</p>`;
    } else if (k === 'golf_course') {
      if (c && c.split && c.W.go + c.other.go_rec > 0) {
        const rows = this.srcRows(c.src.go, aq);
        if (c.other.go_rec > 0) rows.push({ v: c.other.go_rec, color: SRC_DEF.rec.color, round: true, name: SRC_DEF.rec.name, sub: SRC_DEF.rec.sub });
        body = `<p class="wm-sub">USGS does not report single courses. Golf courses in ${esc(c.name)} used ${mgd(c.W.go + c.other.go_rec)} million gallons a day in 2015 and consumed ${mgd(c.cu.go)}.</p>
          <h5>Where the county's golf water comes from</h5>${mixBlock(rows.sort((a, b) => b.v - a.v), null)}<p class="wm-note">Shares of the county's golf water (USGS county figures for 2015).</p>`;
      } else if (c && !c.split) body = `<p class="wm-sub">USGS did not report golf courses separately in ${esc(this.app.stateName(c.st))}; their water is counted with crop irrigation.</p>`;
      else body = `<p class="wm-sub">USGS counted no golf-course water in ${c ? esc(c.name) : 'this county'} in 2015.</p>`;
    } else if (k === 'wastewater_plant') {
      const reuse = c ? [{ name: 'Crops', v: c.other.ir_rec, color: CAT.ir.color }, { name: 'Golf courses', v: c.other.go_rec, color: CAT.go.color }, { name: 'Power plants', v: c.other.pt_rec, color: CAT.pt.color }].filter((r) => r.v > 0) : [];
      body = `<p class="wm-sub">Wastewater plants treat sewage and return it to rivers or the sea. The USGS figures for 2015 do not include those returns, so the map does not draw them.</p>`;
      body += reuse.length ? `<h5>Reclaimed water reused in ${esc(c.name)}</h5>${mixBlock(reuse)}<p class="wm-note">USGS county figures; they do not say which plant supplied it.</p>` : '';
    } else if (k === 'water_works') {
      const hub = c ? this.app.psHub && this.app.psHub(ci) : null;
      const isHub = hub && Math.hypot(hub[0] - L.data.x[i], hub[1] - L.data.z[i]) < 0.06;
      body = c && psRows.length ? `<p class="wm-sub">USGS reports public supply for each county, not plant by plant: utilities in ${esc(c.name)} withdrew ${mgd(c.W.ps)} million gallons a day in 2015.</p>
        <h5>Where the county's public supply comes from</h5>${mixBlock(psRows, null)}
        <p class="wm-note">${isHub ? 'The map routes the county’s public supply through this plant.' : 'The map routes the county’s public supply through one mapped plant near the middle of its towns.'} USGS reports how much came from surface water and from wells, not from which river, so the map draws the intakes on the county’s largest rivers and lakes.</p>` : '<p class="wm-sub">USGS counted no public-supply withdrawals in this county in 2015.</p>';
    } else {
      body = c && psRows.length ? `<p class="wm-sub">Water towers hold treated water from the public water system and keep the pipes pressurized.</p>
        <h5>Where the county's public supply comes from</h5>${mixBlock(psRows, null)}<p class="wm-note">Shares of the ${mgd(c.W.ps)} million gallons a day that utilities in ${esc(c.name)} withdrew in 2015 (USGS county figures).</p>` : '<p class="wm-sub">Water towers hold treated water from the public water system and keep the pipes pressurized.</p>';
    }
    // a place OpenStreetMap leaves unnamed is called by its operator, or by its county
    const title = nm || (op ? `${op} ${OSM_LABEL[k].toLowerCase()}` : c ? `${OSM_LABEL[k]} in ${c.name}` : OSM_LABEL[k]);
    const html = `<p class="wm-cap">${esc(OSM_LABEL[k])}</p><h3>${esc(title)}</h3>
      <p class="wm-sub">${op && op !== nm && !title.startsWith(op) ? `${esc(op)} · ` : ''}${c ? `${esc(c.name)}, ${esc(this.app.stateName(c.st))}` : ''}</p>${body}
      <p class="wm-note">Location from OpenStreetMap (© OpenStreetMap contributors, ODbL), which maps many but not all such places.</p>
      ${ci >= 0 ? `<div class="wm-list"><button type="button" class="wm-li" data-county="${ci}"><span>See all of ${esc(c.name)}</span><span>→</span></button></div>` : ''}`;
    this.setInspector(html, true);
  }
  /** a factory, mine, fish farm or livestock farm with an EPA discharge permit (net/infra.js loadFacilities) */
  showFac(i) {
    const L = this.app.fac; if (!L) return;
    const F = L.data, M = L.meta || {}, k = FAC_KINDS[F.kind[i]], code = M.code ? M.code[i] : '', cat = facCat(k, code), ci = F.county[i];
    const c = ci >= 0 ? this.m.county(ci) : null, lab = facLabel(k, code);
    const nm = (L.names && L.names[i]) || lab, what = M.what ? M.what[i] : '', place = M.place ? M.place[i] : '';
    const water = M.water ? M.water[i] : [], permit = M.permit ? M.permit[i] : '', reg = M.reg ? M.reg[i] : '';
    const major = F.flags[i] & 1, bad = F.flags[i] & 2, flow = F.flow[i];
    const useName = { in: 'industry', mi: 'mining', aq: 'fish farms', li: 'livestock', ir: 'crops' }[cat];
    let html = `<p class="wm-cap">${esc(lab)} · EPA discharge permit</p><h3>${esc(nm)}</h3>
      <p class="wm-sub">${what ? `${esc(what)} · ` : ''}${esc(place)}${c && !place.includes(c.name) ? ` · ${esc(c.name)}` : ''}</p>`;
    const kv = [['Permit', `${esc(permit)}${major ? ' (major)' : ''}`]];
    if (water.length) kv.push(['Discharges to', esc(water.join('; '))]);
    if (flow > 0 && !bad) kv.push(['Design flow', `${mgd(flow)} Mgal/d`]);
    html += `<div class="wm-kv">${kv.map(([a, b]) => `<span>${a}</span><span>${b}</span>`).join('')}</div>`;
    if (flow > 0 && !bad) html += `<p class="wm-note">The design flow is what the permit says the facility was built to discharge, which can be well above what it uses.</p>`;
    if (bad && c) html += `<p class="wm-note">EPA's record gives a design flow of ${esc(nf(flow))} million gallons a day, more than ten times all the water USGS counted for ${esc(c.name)} in 2015, so the figure or the facility's location is probably wrong in the record.</p>`;
    // its county's water for the use: USGS has no figure for one facility
    if (c) {
      const W = c.W[cat] || 0;
      const aq = this.app.aquifers && this.app.aquifers.county ? this.app.aquifers.county[c.id] : null;
      if (W > 0) {
        const drawn = this.app.facDrawn ? this.app.facDrawn(i) : false;
        const how = cat === 'li' || cat === 'ir' ? ` The map spreads it over the county’s ${cat === 'ir' ? 'irrigated fields' : 'farmland'}.`
          : ` The map draws it to the county’s largest permitted ${k === 'factory' ? 'factories' : k === 'mine' ? 'mining sites' : 'fish farms'} by design flow${drawn ? ', this one among them' : ', and this one is not among them'}.`;
        html += `<h5>Where ${esc(c.name)}'s water for ${esc(useName)} comes from</h5>${mixBlock(this.srcRows(c.src[cat], aq).filter((r) => r.v > 0.0005), null)}
          <p class="wm-note">USGS reports water for ${esc(useName)} by county and has no figure for any one facility. ${esc(useName.charAt(0).toUpperCase() + useName.slice(1))} in ${esc(c.name)} withdrew ${mgd(W)} million gallons a day${cat === 'in' || cat === 'mi' ? ' of its own water' : cat === 'aq' ? ' of their own water' : ''} in 2015.${how}</p>`;
      } else html += `<p class="wm-note">USGS counted no water withdrawn for ${esc(useName)} in ${esc(c.name)} in 2015${cat === 'in' ? '; a factory there may buy its water from the local utility' : ''}.</p>`;
    }
    html += `<p class="wm-note">From EPA's Enforcement and Compliance History Online, which lists the facilities holding an individual discharge permit as of October 2026. Those covered by general permits, or that send their wastewater only to a city sewer, are not on the map.${reg ? ` <a href="https://echo.epa.gov/detailed-facility-report?fid=${esc(reg)}">EPA's report on this facility</a>.` : ''}</p>
      ${ci >= 0 ? `<div class="wm-list"><button type="button" class="wm-li" data-county="${ci}"><span>See all of ${esc(c.name)}</span><span>→</span></button></div>` : ''}`;
    this.setInspector(html, true);
  }
  showAqueduct(a) {
    const f = a.flow;
    const kind = a.kind === 'aqueduct' ? 'Aqueduct' : 'Canal';
    let html = `<p class="wm-cap">${kind}${a.op ? ` · ${esc(a.op)}` : ''}</p><h3>${esc(a.name)}</h3>`;
    if (f) {
      const when = f.when != null ? f.when : `in ${f.year}`;
      // (billions to one decimal, as the map labels them)
      html += `<div class="wm-big">${f.mgd >= 1000 ? nf(f.mgd / 1000, 1) : nf(f.mgd)} <small>${f.mgd >= 1000 ? 'billion' : 'million'} gallons a day</small></div>
        <p class="wm-sub">${esc(f.what)}${when ? ` ${esc(when)}` : ''}${f.af ? `, or ${nf(f.af)} acre-feet over the year` : ''}.</p>
        ${f.note ? `<p class="wm-sub">${esc(f.note)}</p>` : ''}
        <p class="wm-note">${f.more ? 'Sources' : 'Source'}: <a href="${esc(f.url)}" target="_blank" rel="noopener">${esc(f.src)}</a>${(f.more || []).map((r) => `; <a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.src)}</a>`).join('')}.</p>`;
    } else {
      html += `<p class="wm-sub">${a.km ? `About ${nf(a.km * 0.621371)} miles of it are mapped. ` : ''}The map has no measured flow for it.</p>`;
    }
    html += a.geom === 'nhd'
      ? '<p class="wm-note">Route from the USGS National Hydrography Dataset. Its tunnels, conduits and siphons are dashed.</p>'
      : '<p class="wm-note">Route from OpenStreetMap (© OpenStreetMap contributors, ODbL). Tunnels and buried pipe are often missing.</p>';
    this.setInspector(html, true);
  }
  showAquifer(ai) {
    const A = this.app.aquifers; if (!A) return;
    const a = A.byIndex.get(ai); if (!a) return;
    const g = a.gw, tot = a.total;
    const rows = [['ir', Math.max(0, (g.it || 0) - g.ig)], ['go', g.ig], ['ps', g.ps], ['do', g.do], ['in', g.in], ['li', g.li], ['aq', g.aq], ['mi', g.mi], ['pt', g.pt]].map(([k, v]) => [CAT[k].name, v]).filter((r) => r[1] > 0.05).sort((x, y) => y[1] - x[1]);
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
    if (a.name === 'High Plains aquifer') html += this.levelsBlock();
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
  countyTip(i, cls, irr = -1) {
    const c = this.m.county(i);
    const top = CAT_KEYS.slice().sort((a, b) => c.W[b] - c.W[a])[0];
    const iso = this.app.iso && CAT[this.app.iso] ? this.app.iso : null;
    const line = iso ? `${mgdLabel(c.W[iso])} for ${esc(CAT[iso].name.toLowerCase())}` : `${mgdLabel(c.total)} withdrawn${c.total > 0 ? ` · ${pct(c.W[top], c.total)}% ${esc(CAT[top].name.toLowerCase())}` : ''}`;
    // (LANID's share of the ~262 m pixel irrigated in 2015, in eighths)
    const irrTxt = irr >= 0.5 ? ', irrigated in 2015' : irr > 0.1 ? ', partly irrigated in 2015' : '';
    return `<b>${esc(c.name)}, ${esc(AP_STATE[c.st] || c.st)}</b><span>${line}</span>${cls > 0 ? `<span class="wm-tip-lc">Land here: ${esc(NLCD_CLASSES[cls].toLowerCase())}${irrTxt}</span>` : ''}<span class="wm-tip-hint">Click to see where its water comes from</span>`;
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
    const hint = k === 'water_works' || k === 'water_tower' || k === 'golf_course' ? '<span class="wm-tip-hint">Click to see where its water comes from</span>' : '';
    return `<b>${esc(nm || OSM_LABEL[k])}</b><span>${esc(OSM_LABEL[k])}${op && op !== nm ? ` · ${esc(op)}` : ''}</span>${hint}`;
  }
  facTip(i) {
    const L = this.app.fac, F = L.data, M = L.meta, k = FAC_KINDS[F.kind[i]];
    const nm = L.names ? L.names[i] : '', lab = facLabel(k, M ? M.code[i] : '');
    const f = F.flow[i] > 0 && !(F.flags[i] & 2) ? F.flow[i] : 0;
    return `<b>${esc(nm || lab)}</b><span>${esc(lab)}${M && M.what[i] ? ` · ${esc(M.what[i].toLowerCase())}` : ''}${f ? ` · designed for ${mgd(f)} Mgal/d` : ''}</span><span class="wm-tip-hint">Click for its permit and its county's water</span>`;
  }
  aqTip(a) {
    const f = a.flow;
    return `<b>${esc(a.name)}</b><span>${a.kind === 'aqueduct' ? 'Aqueduct' : 'Canal'}${a.op ? ` · ${esc(a.op)}` : ''}</span>${f ? `<span>${mgd(f.mgd)} Mgal/d ${esc(f.what)} (${esc(f.year)})</span><span class="wm-tip-hint">Click for the source</span>` : ''}`;
  }
  aquiferTip(ai) {
    const a = this.app.aquifers && this.app.aquifers.byIndex.get(ai); if (!a) return '';
    return `<b>${esc(a.name)}</b><span>${esc(a.rock)} · ${volShort(a.total)} pumped in 2015</span>`;
  }
  /** one of the biggest places (FlowParticles.buildTop), from afar */
  discTip(e) {
    const m = this.m, p = e.plant && e.plant.name ? e.plant : null;
    const who = p ? esc(p.name) : `${esc(CAT[e.cat].name)} in ${esc(m.wu.name[e.county])}, ${esc(AP_STATE[m.wu.st[e.county]] || m.wu.st[e.county])}`;
    const parts = Object.entries(e.by).filter(([, v]) => v > 0.005 * e.vol).sort((a, b) => b[1] - a[1]);
    const SRCW = { w: 'wells', s: 'the sea', f: 'rivers and lakes', r: 'reclaimed water' };
    // (a plant's water is named as on its label: the river, lake or bay the plant model gives, unless it is mostly wells)
    const named = p ? srcName(p.src_name) : null;
    const from = e.cat === 'ir' && m.propIr.has(e.county) ? ''
      : p && named && parts.length && parts[0][0] !== 'w' && parts[0][1] >= 0.8 * e.vol ? ` from ${withThe(named)}`
      : parts.length === 1 ? ` from ${SRCW[parts[0][0]]}` : ` (${parts.map(([k, v]) => `${shareTxt(v / e.vol)} from ${SRCW[k]}`).join(', ')})`;
    const fate = e.consumed >= 0 ? `<span>${shareTxt(e.consumed)} of ${p ? 'its' : 'that'} water consumed, the rest returned</span>` : `<span>USGS did not estimate how much of it was consumed</span>`;
    return `<b>${who}</b><span>${mgdLabel(e.vol)} withdrawn${esc(from)}</span>${fate}<span class="wm-tip-hint">Click to see where its water comes from</span>`;
  }
  /** a channel drawn on the fixed scale */
  chanTip(r) {
    const m = this.m, c = m.county(r.county), st = AP_STATE[c.st] || c.st;
    if (r.xfer) {
      const im = (m.imp ? m.imp.get(r.county) || [] : []).find((x) => x.sys.id === r.xfer);
      if (im) {
        // (where the counties' water shares a leg, all of them)
        const all = [r.county, ...(r.also || [])], sts = [...new Set(all.map((j) => m.wu.st[j]))];
        const and = (a) => (a.length > 1 ? `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}` : a[0]);
        const to = all.length < 2 ? `${c.name}, ${st}` : sts.length === 1 && all.every((j) => / County$/.test(m.wu.name[j]))
          ? `${and(all.map((j) => m.wu.name[j].replace(/ County$/, '')))} counties, ${AP_STATE[sts[0]] || sts[0]}` : and(all.map((j) => `${m.wu.name[j]}, ${AP_STATE[m.wu.st[j]] || m.wu.st[j]}`));
        return `<b>${esc(im.sys.short)}</b><span>${mgdLabel(r.vol)} brought this way to ${esc(to)}, from ${esc(im.what)}</span><span class="wm-tip-hint">Click to see ${esc(c.name)}'s water</span>`;
      }
      const sys = (m.xIn.get(r.county) || []).find((x) => x.sys.id === r.xfer)?.sys;
      return `<b>${esc(sys ? sys.short : 'Water piped between counties')}</b><span>${mgdLabel(r.vol)} piped this way to ${esc(c.name)}, ${esc(st)}${sys ? ` and on to its other counties` : ''}</span><span class="wm-tip-hint">Click to see ${esc(c.name)}'s water</span>`;
    }
    const plant = r.pl >= 2 ? m.plants[r.pl - 2] : null;
    const who = plant ? esc(plant.name) : `${esc(CAT[r.cat].name)} in ${esc(c.name)}, ${esc(st)}`;
    if (r.kind === 2) return `<b>${who}</b><span>${mgdLabel(r.vol)} returned this way to the river</span>`;
    const src = (SRC_DEF[r.sk] || SRC_DEF.sf).name.toLowerCase();
    const all = plant ? Object.values(plant.src || {}).reduce((a, v) => a + v, 0) : c.W[r.cat] + (r.cat === 'ir' ? c.other.ir_rec : r.cat === 'go' ? c.other.go_rec : 0);
    return `<b>${who}</b><span>${mgdLabel(r.vol)} from ${esc(src)} through this channel</span>${all > r.vol * 1.05 ? `<span>${mgdLabel(all)} for ${plant ? 'the plant' : esc(CAT[r.cat].name.toLowerCase())} in all</span>` : ''}<span class="wm-tip-hint">Click to see where its water comes from</span>`;
  }
  plantTip(pi) {
    const p = this.m.plants[pi];
    const W = Object.values(p.src || {}).reduce((a, v) => a + v, 0);
    const named = srcName(p.src_name);
    return `<b>${esc(p.name)}</b><span>${esc(genName(p.gen))} power plant · ${mgd(W)} Mgal/d${named ? ` from ${esc(withThe(named))}` : ''}</span><span class="wm-tip-hint">Click to see where its water comes from</span>`;
  }
  setScale(unit, detail) {
    const el = this.$('[data-scale]'); if (!el) return;
    // one figure for a sub-million amount, two above: the streak is a symbol, not a measurement
    const g = unit * 1e6, r = g >= 1e6 ? sig2(g) : Number(g.toPrecision(1));
    el.textContent = `Each streak stands for about ${r >= 1e6 ? `${nf(r / 1e6, r < 1e7 && r % 1e6 ? 1 : 0)} million` : nf(r)} gallons a day${detail ? ' at this zoom' : ''}.`;
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
    const choose = (i) => { const it = items[i]; if (!it || it.hint) { this.app.sound?.miss(); return; } input.value = it.label; box.classList.remove('show'); input.blur(); this.app.goSearch(it); };
    this.on(input, 'focus', () => this.app.loadNames?.());
    const ap = (j) => `${this.m.wu.name[j]}, ${AP_STATE[this.m.wu.st[j]] || this.m.wu.st[j]}`;
    // a ZIP code: the county that holds most of its land (looked up in the browser; nothing is sent anywhere)
    const zipItems = (q) => {
      if (q.length < 5) return [{ label: 'Type all five digits of a ZIP code', kind: 'ZIP code', hint: true }];
      const r = this.app.zipLookup(q);
      if (!this.app.zips) { this.app.loadZips().then(() => { if (input.value.trim() === q) input.dispatchEvent(new Event('input')); }); return [{ label: 'Looking up the ZIP code…', kind: 'ZIP code', hint: true }]; }
      if (!r) return [{ label: `No ZIP code area ${q} in the 2020 census`, kind: 'ZIP code', hint: true }];
      const out = [{ label: `${q}: ${ap(r.county)}`, kind: r.also >= 0 ? `ZIP code, ${r.share}% of its land` : 'ZIP code', county: r.county }];
      if (r.also >= 0) out.push({ label: `${q}: ${ap(r.also)}`, kind: 'ZIP code, part of it', county: r.also });
      return out;
    };
    this.on(input, 'input', () => {
      const q = input.value.trim().toLowerCase();
      act = 0;
      if (/^\d{3,5}$/.test(q)) { items = zipItems(q); render(); return; }
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
    if (window.matchMedia(PHONE_MQ).matches) this.$('[data-search]').placeholder = 'Search';
    requestAnimationFrame(() => this.fitBar());
    const act = {
      home: () => this.app.goHome(),
      tour: () => this.app.tour.toggle(),
      drop: () => this.app.drop?.toggle(),
      night: () => this.app.setNight(!this.app.night),
      under: () => this.app.setUnderground(!this.app.underground),
      full: () => this.app.toggleExpanded(),
      save: () => this.app.saveImage(),
      sound: () => { this.app.sound.setOn(!this.app.sound.on); this.syncButtons(); },
      // phones: the buttons fold behind one, so the map keeps the height
      more: () => { const open = !this.root.classList.contains('wm-menu-open'); this.root.classList.toggle('wm-menu-open', open); const b = this.$('[data-a="more"]'); b.setAttribute('aria-expanded', String(open)); b.textContent = open ? 'Less' : 'More'; },
      layers: () => { const el = this.$('[data-layers]'); el.hidden = !el.hidden; this.$('[data-a="layers"]').setAttribute('aria-expanded', String(!el.hidden)); this.$('[data-a="layers"]').classList.toggle('on', !el.hidden); },
    };
    const quiet = { home: 1, night: 1, under: 1, save: 1, sound: 1 };   // (these make sounds of their own)
    for (const b of this.$$('[data-bar] [data-a]')) this.on(b, 'click', () => { if (!quiet[b.dataset.a]) this.app.sound?.tap(); act[b.dataset.a]?.(); });
    // the layers sheet closes when you click elsewhere
    this.on(document, 'pointerdown', (e) => {
      const el = this.$('[data-layers]');
      if (!el.hidden && !el.contains(e.target) && !this.$('[data-a="layers"]').contains(e.target)) { el.hidden = true; this.$('[data-a="layers"]').setAttribute('aria-expanded', 'false'); this.$('[data-a="layers"]').classList.remove('on'); }
    });
  }
}
