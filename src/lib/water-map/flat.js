import { CATS, CAT, AP_STATE } from './core/config.js';
import { fetchJSON, fetchPixels, setDataBase } from './core/assets.js';
import { WaterModel, CAT_KEYS } from './flow/model.js';
import { IMPORTS } from './core/transfers.js';
import { COUNTY_NOTES, propIrNote } from './core/flows_data.js';
import { esc, nf, mgd, mgdLabel, pct, ord } from './ui/fmt.js';

/**
 * The flat map: the same 2015 county figures on a plain county map, for browsers without WebGL, for screen readers and
 * keyboards, and for print. The counties are the 3D map's own county rasters, laid out as the 3D map lays them out
 * (flat_county.png, from scripts/water-map/bake_flat.py). Arrow keys move from county to county, Enter opens one, and
 * the summary of the county in focus is read out.
 */
const STATES = { AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', DC: 'District of Columbia', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming', PR: 'Puerto Rico', VI: 'U.S. Virgin Islands' };
const SEQ = ['#173847', '#1f6e86', '#3a9e8c', '#a9cf7f', '#f3e08a'];
const DIV = ['#2f78b5', '#93c4dd', '#8c918e', '#e4a3cf', '#b24a9a'];
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const ramp = (stops, t) => { const s = stops.map(hex), x = Math.min(1, Math.max(0, t)) * (s.length - 1), k = Math.min(s.length - 2, Math.floor(x)), f = x - k; return s[k].map((v, j) => Math.round(v + (s[k + 1][j] - v) * f)); };

const LENSES = {
  use: { name: 'Biggest use', note: 'Each county in the color of the use that withdrew the most water there, brighter where it withdrew more per square mile.' },
  density: { name: 'Water per square mile', note: 'Gallons a day withdrawn per square mile, all uses, from 2,000 to 2 million (log scale).', ticks: ['2k', '20k', '200k', '2M'] },
  strain: { name: 'Strain on rivers and streams', note: 'USGS’s surface water supply and use index, averaged over each county’s watersheds: the share of the usual streamflow missing because of dry spells or because it was consumed, 0 to 100 percent, water years 2010 to 2020. Lower 48 only.', ticks: ['0', '25', '50', '75', '100'] },
  change: { name: 'Change since 2005', note: 'Withdrawals in 2015 against 2005, from halved (blue) to doubled (magenta), by the USGS county estimates. A single county’s change can come from a new way of estimating it as much as from new use.', ticks: ['halved', 'the same', 'doubled'], div: true },
};

export async function startFlatMap(root, { dataBase = '/water-map/data/', reason = '' } = {}) {
  setDataBase(dataBase);
  const stage = root.querySelector('[data-wm-stage]');
  const [wu, feats, cdata, meta, pix] = await Promise.all([fetchJSON('wu.json'), fetchJSON('features.json'), fetchJSON('county_data.json'), fetchJSON('flat_meta.json'), fetchPixels('flat_county.png')]);
  const m = Object.create(WaterModel.prototype);
  Object.assign(m, { wu, features: feats, cdata, anchors: [], n: wu.id.length, plants: feats.plants, placeholders: feats.te_placeholders });
  m._derive();
  const n = m.n, W = pix.w, H = pix.h;
  const ids = new Int32Array(W * H);
  for (let i = 0, j = 0; i < W * H; i++, j += 4) ids[i] = pix.px[j] * 256 + pix.px[j + 1] - 1;
  // each county's middle on the raster, for the keyboard
  const cx = new Float32Array(n), cz = new Float32Array(n), cn = new Float32Array(n);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const c = ids[y * W + x]; if (c >= 0 && c < n) { cx[c] += x; cz[c] += y; cn[c]++; } }
  for (let c = 0; c < n; c++) if (cn[c]) { cx[c] /= cn[c]; cz[c] /= cn[c]; }
  const area = (i) => (cdata[i] && cdata[i].area > 0 ? cdata[i].area / 2.58999 : 0);   // square miles
  let strain = null, history = null;

  // ---- the page: a map, a panel beside it, a lens picker and a search box
  for (const el of stage.children) el.hidden = true;
  const wrap = document.createElement('div');
  wrap.className = 'wm-flat';
  wrap.innerHTML = `
    <div class="wm-flat-bar">
      <label class="wm-flat-lens">Color by <select data-lens>${Object.entries(LENSES).map(([k, l]) => `<option value="${k}">${esc(l.name)}</option>`).join('')}</select></label>
      <div class="wm-search"><input type="search" data-q placeholder="Search a county or ZIP code" autocomplete="off" aria-label="Search for a county or ZIP code"><div class="wm-panel wm-results" data-res role="listbox"></div></div>
    </div>
    <div class="wm-flat-body">
      <div class="wm-flat-map"><canvas data-map tabindex="0" role="img" aria-label="Map of the counties of the United States, colored by water use. Use the arrow keys to move between counties and Enter to open one."></canvas><div class="wm-tip" data-tip hidden></div></div>
      <aside class="wm-panel wm-flat-panel" data-panel aria-live="polite"></aside>
    </div>
    <div class="wm-flat-key" data-key></div>
    <p class="wm-note-line" data-why>${esc(reason || 'The flat version of the map: the same county figures, without the 3D view.')}</p>
    <p class="sr-only" data-say aria-live="assertive"></p>`;
  stage.appendChild(wrap);
  stage.classList.add('wm-stage-flat');
  const $ = (s) => wrap.querySelector(s);
  const canvas = $('[data-map]'), tip = $('[data-tip]'), panel = $('[data-panel]');
  const img = new ImageData(W, H);
  let lens = 'use', sel = -1, focus = -1;

  const colorOf = (i) => {
    const c = m.county(i);
    if (lens === 'use') {
      if (!(c.total > 0)) return [60, 66, 63];
      const top = CAT_KEYS.slice().sort((a, b) => c.W[b] - c.W[a])[0];
      const a = area(i), d = a > 0 ? c.total * 1e6 / a : 0;
      const t = d > 0 ? Math.min(1, Math.max(0, Math.log(d / 2e3) / Math.log(1e3))) : 0;
      return hex(CAT[top].color).map((v) => Math.round(v * (0.35 + 0.65 * t)));
    }
    if (lens === 'density') { const a = area(i), d = a > 0 ? c.total * 1e6 / a : 0; return d > 0 ? ramp(SEQ, Math.log(d / 2e3) / Math.log(1e3)) : [40, 46, 44]; }
    if (lens === 'strain') { const v = strain ? strain.sui[i] : -1; return v >= 0 ? ramp(SEQ, v) : [40, 46, 44]; }
    const h = history; if (!h) return [40, 46, 44];
    const a = h.t[i][4], b = h.t[i][6];
    return a > 0.05 && b != null ? ramp(DIV, (Math.max(-1, Math.min(1, Math.log2(Math.max(b, 0.001) / a))) + 1) / 2) : [40, 46, 44];
  };
  const paint = () => {
    const pal = new Uint8Array(n * 3);
    for (let i = 0; i < n; i++) pal.set(colorOf(i), i * 3);
    const st = m.wu.st, d = img.data;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const k = y * W + x, c = ids[k], o = k * 4;
      if (c < 0 || c >= n) { d[o] = 11; d[o + 1] = 18; d[o + 2] = 16; d[o + 3] = 255; continue; }
      const r = x + 1 < W ? ids[k + 1] : c, b = y + 1 < H ? ids[k + W] : c;
      let R = pal[c * 3], G = pal[c * 3 + 1], B = pal[c * 3 + 2];
      // county lines dark, state lines pale
      if ((r >= 0 && st[r] !== st[c]) || (b >= 0 && st[b] !== st[c])) { R = 230; G = 226; B = 214; }
      else if (r !== c || b !== c) { R *= 0.55; G *= 0.55; B *= 0.55; }
      if (c === sel) { R = Math.min(255, R * 1.25 + 30); G = Math.min(255, G * 1.25 + 30); B = Math.min(255, B * 1.25 + 30); }
      d[o] = R; d[o + 1] = G; d[o + 2] = B; d[o + 3] = 255;
    }
    draw();
  };
  const off = document.createElement('canvas'); off.width = W; off.height = H;
  const draw = () => {
    off.getContext('2d').putImageData(img, 0, 0);
    const box = canvas.parentElement.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    // (as wide as its column, and no taller than most of the window)
    const s = Math.max(0.1, Math.min(box.width / W, (window.innerHeight * 0.82) / H));
    canvas.style.width = `${Math.round(W * s)}px`; canvas.style.height = `${Math.round(H * s)}px`;
    canvas.width = Math.round(W * s * dpr); canvas.height = Math.round(H * s * dpr);
    const g = canvas.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.drawImage(off, 0, 0, canvas.width, canvas.height);
    if (focus >= 0 && focus !== sel && cn[focus]) {
      g.strokeStyle = '#f2ede3'; g.lineWidth = 2 * dpr;
      g.beginPath(); g.arc(cx[focus] * canvas.width / W, cz[focus] * canvas.height / H, 7 * dpr, 0, Math.PI * 2); g.stroke();
    }
  };
  const key = () => {
    const L = LENSES[lens];
    const bar = lens === 'use'
      ? `<p class="wm-legend-line">${CATS.map((c) => `<span><i class="wm-sw" style="background:${c.color}"></i>${esc(c.name)}</span>`).join('')}</p>`
      : `<div class="wm-ramp${L.div ? ' wm-ramp-div' : ''}"></div><div class="wm-ramp-t">${L.ticks.map((t) => `<span>${esc(t)}</span>`).join('')}</div>`;
    $('[data-key]').innerHTML = `${bar}<p class="wm-note">${esc(L.note)}</p>`;
  };

  // ---- the panel
  const ap = (i) => `${m.wu.name[i]}, ${AP_STATE[m.wu.st[i]] || m.wu.st[i]}`;
  const sentence = (i) => {
    const c = m.county(i);
    if (!(c.total > 0)) return `${ap(i)}: USGS estimated no water withdrawn in 2015.`;
    const top = CAT_KEYS.slice().sort((a, b) => c.W[b] - c.W[a])[0];
    const gw = Object.values(c.src).reduce((s, o) => s + (o.gf || 0) + (o.gs || 0), 0);
    return `${ap(i)}: ${mgd(c.total)} million gallons a day withdrawn in 2015, ${pct(c.W[top], c.total)} percent of it for ${CAT[top].name.toLowerCase()}, ${pct(gw, c.total)} percent from wells. ${ord(m.rank[i])} of ${nf(n)} counties.`;
  };
  const bars = (rows, max) => `<div class="wm-bars">${rows.map(([name, v, col]) => `<div class="wm-cbar"><span>${esc(name)}</span><span class="wm-t"><i style="width:${(100 * v / Math.max(1e-9, max)).toFixed(1)}%;background:${col}"></i></span><span class="wm-v">${mgd(v)}</span></div>`).join('')}</div>`;
  const showNational = () => {
    const N = m.national, rows = CATS.map((c) => [c.name, N.W[c.k], c.color]).sort((a, b) => b[1] - a[1]);
    panel.innerHTML = `<p class="wm-cap">The whole country, 2015</p><h3>${nf(N.total / 1000)} billion gallons a day</h3>
      <p class="wm-sub">withdrawn by every use, by the U.S. Geological Survey’s county estimates. Pick a county on the map, or search for one.</p>
      ${bars(rows, rows[0][1])}<p class="wm-note">Million gallons a day.</p>`;
  };
  const showCounty = (i) => {
    const c = m.county(i), rows = CATS.map((k) => [k.name, c.W[k.k], k.color]).filter((r) => r[1] > 0.005).sort((a, b) => b[1] - a[1]);
    const S = c.src, sum = (k) => Object.values(S).reduce((s, o) => s + (o[k] || 0), 0);
    const srcRows = [['Rivers and lakes', sum('sf'), '#4a9fe0'], ['Groundwater', sum('gf'), '#8fd6a8'], ['Salty surface water', sum('ss'), '#3fb8b0'], ['Salty groundwater', sum('gs'), '#bfe3cf']].filter((r) => r[1] > 0.005);
    const cu = Math.min(c.cu.ir, c.W.ir + c.other.ir_rec) + Math.min(c.cu.go, c.W.go + c.other.go_rec) + Math.min(c.cu.pt, c.W.pt);
    let html = `<p class="wm-cap">County · ${esc(STATES[c.st] || c.st)}</p><h3>${esc(c.name)}</h3>
      <div class="wm-big">${mgd(c.total)} <small>million gallons a day withdrawn</small></div>
      <p class="wm-sub">${esc(sentence(i))}</p>`;
    if (rows.length) html += `<h5>What it was used for</h5>${bars(rows, rows[0][1])}`;
    if (srcRows.length) html += `<h5>Where it came from</h5>${bars(srcRows, Math.max(...srcRows.map((r) => r[1])))}`;
    // the West's imported water, which USGS counts in this county's own surface withdrawals (as the 3D map draws it)
    const brought = IMPORTS.flatMap((y) => y.to.filter((t) => t.fips === c.id).map((t) => [y, Math.min(t.mgd, (c.src[t.cat || 'ps'] || {}).sf || 0), t]));
    for (const [y, v, t] of brought) if (v > 0.05) html += `<p class="wm-note">Of its water from rivers and lakes${t.cat && t.cat !== 'ps' ? ` for ${esc(CAT[t.cat].name.toLowerCase())}` : ''}, ${mgd(v)} million gallons a day was brought in through ${esc(y.name)} from ${esc(t.what || y.from)}.</p>`;
    if (cu > 0) html += `<p class="wm-note">Crops, golf courses and power plants here consumed ${mgd(cu)} million gallons a day, the uses USGS estimated consumption for.</p>`;
    if (COUNTY_NOTES[c.id]) html += `<p class="wm-note">${esc(COUNTY_NOTES[c.id])}</p>`;
    else if (m.propIr.has(i)) html += `<p class="wm-note">${esc(propIrNote(m.propIr.size - 1))}</p>`;
    if (strain && strain.sui[i] >= 0) html += `<h5>Strain on its rivers and streams</h5><p class="wm-sub">In an average month of water years 2010 to 2020, ${Math.round(100 * strain.sui[i])} percent of the usual streamflow in its watersheds was missing, because of dry spells or because it was consumed (USGS surface water supply and use index).</p>`;
    if (history && history.t[i][4] > 0.05 && history.t[i][6] != null) html += `<h5>Since 2005</h5><p class="wm-sub">It withdrew ${mgd(history.t[i][4])} Mgal/d in 2005 and ${mgd(history.t[i][6])} in 2015 (USGS county estimates).</p>`;
    html += `<p class="wm-note">Million gallons a day, USGS county estimates for 2015.</p>`;
    panel.innerHTML = html;
  };
  const select = (i, announce = true) => {
    sel = i; focus = i;
    if (i >= 0) showCounty(i); else showNational();
    if (announce) $('[data-say]').textContent = i >= 0 ? sentence(i) : '';
    paint();
  };

  // ---- pointer, keyboard and search
  const at = (e) => {
    const r = canvas.getBoundingClientRect();
    const x = Math.floor((e.clientX - r.left) / r.width * W), y = Math.floor((e.clientY - r.top) / r.height * H);
    return x >= 0 && y >= 0 && x < W && y < H ? ids[y * W + x] : -1;
  };
  canvas.addEventListener('pointermove', (e) => {
    const i = at(e);
    if (i < 0 || i >= n) { tip.hidden = true; return; }
    const c = m.county(i), r = wrap.querySelector('.wm-flat-map').getBoundingClientRect();
    tip.innerHTML = `<b>${esc(ap(i))}</b><span>${mgdLabel(c.total)} withdrawn</span>`;
    tip.hidden = false;
    tip.style.transform = `translate(${Math.round(e.clientX - r.left + 14)}px, ${Math.round(e.clientY - r.top + 14)}px)`;
  });
  canvas.addEventListener('pointerleave', () => { tip.hidden = true; });
  canvas.addEventListener('click', (e) => { const i = at(e); select(i >= 0 && i < n ? i : -1); });
  canvas.addEventListener('keydown', (e) => {
    const dirs = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (dirs[e.key]) {
      e.preventDefault();
      const [dx, dy] = dirs[e.key];
      let from = focus >= 0 ? focus : m.ix.get('20169') ?? 0;   // (starting in the middle of the country)
      let best = -1, bd = Infinity;
      for (let c = 0; c < n; c++) {
        if (!cn[c] || c === from) continue;
        const vx = cx[c] - cx[from], vy = cz[c] - cz[from], along = vx * dx + vy * dy;
        if (along <= 0.5) continue;
        const d = along + 2.5 * Math.abs(vx * dy - vy * dx);
        if (d < bd) { bd = d; best = c; }
      }
      if (best >= 0) { focus = best; $('[data-say]').textContent = sentence(best); draw(); }
    } else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (focus >= 0) select(focus); }
    else if (e.key === 'Escape') select(-1);
  });
  $('[data-lens]').addEventListener('change', async (e) => {
    lens = e.target.value;
    if (lens === 'strain' && !strain) strain = await fetchJSON('strain.json').catch(() => null);
    if (lens === 'change' && !history) history = await fetchJSON('history.json').catch(() => null);
    key(); paint();
  });
  const q = $('[data-q]'), res = $('[data-res]');
  let zips = null, items = [];
  const zipCounty = async (z) => {
    if (!zips) { const j = await fetchJSON('zips.json'); let a = 0; zips = { z: j.z.map((d) => (a += d)), c: j.c }; }
    const k = zips.z.indexOf(+z); return k >= 0 ? zips.c[k] : -1;
  };
  const choose = (i) => { res.classList.remove('show'); q.value = ap(i); select(i); canvas.focus(); };
  q.addEventListener('input', async () => {
    const t = q.value.trim().toLowerCase();
    items = [];
    if (/^\d{5}$/.test(t)) { const i = await zipCounty(t); if (i >= 0) items = [i]; }
    else if (t.length >= 2) for (let i = 0; i < n && items.length < 8; i++) if (`${m.wu.name[i]}, ${m.wu.st[i]}`.toLowerCase().includes(t)) items.push(i);
    res.innerHTML = items.map((i) => `<div class="wm-r" role="option" data-i="${i}"><span>${esc(ap(i))}</span></div>`).join('');
    res.classList.toggle('show', items.length > 0);
    for (const el of res.querySelectorAll('.wm-r')) el.addEventListener('mousedown', (ev) => { ev.preventDefault(); choose(+el.dataset.i); });
  });
  q.addEventListener('keydown', (e) => { if (e.key === 'Enter' && items.length) { e.preventDefault(); choose(items[0]); } });
  const ro = new ResizeObserver(() => draw());
  ro.observe(canvas.parentElement);
  // (the county figures load with the panel; the strain index and the history only when asked for)
  fetchJSON('strain.json').then((s) => { strain = s; if (sel >= 0) showCounty(sel); }).catch(() => {});
  fetchJSON('history.json').then((h) => { history = h; if (sel >= 0) showCounty(sel); }).catch(() => {});
  key(); select(-1, false);
  root.dataset.ready = 'true';
  return { dispose() { ro.disconnect(); wrap.remove(); for (const el of stage.children) el.hidden = false; stage.classList.remove('wm-stage-flat'); } };
}
