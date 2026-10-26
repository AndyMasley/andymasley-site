/**
 * A compact two-stage Sankey for the inspector: where water comes from (left) and what it is used for (right). Each use
 * bar shows how much of it was consumed (white) where USGS estimated consumption. Labels are spread so they never
 * overlap, with a short leader line when a label has to move off its bar.
 */
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** push label centres apart (at least `gap`) while keeping them inside [lo, hi] */
function spread(ys, gap, lo, hi) {
  const o = ys.map((y, i) => ({ y, i })).sort((a, b) => a.y - b.y);
  for (let k = 1; k < o.length; k++) if (o[k].y < o[k - 1].y + gap) o[k].y = o[k - 1].y + gap;
  const over = o.length ? o[o.length - 1].y - hi : 0;
  if (over > 0) { o[o.length - 1].y -= over; for (let k = o.length - 2; k >= 0; k--) if (o[k].y > o[k + 1].y - gap) o[k].y = o[k + 1].y - gap; }
  if (o.length && o[0].y < lo) { const d = lo - o[0].y; for (const p of o) p.y += d; }
  const out = new Array(ys.length); for (const p of o) out[p.i] = p.y; return out;
}

const SNAME = { sf: 'Rivers and lakes', ss: 'Seawater', gf: 'Groundwater', gs: 'Salty groundwater' };

export function sankeySVG({ sources, uses, links, width = 330, unit = '', fmt = (v) => v.toFixed(0) }) {
  // label columns narrow with the panel (the labels may run into its padding: the SVG lets them overflow)
  const L = Math.min(106, Math.round(width * 0.31)), R = Math.min(116, Math.round(width * 0.36)), bar = 7, gap = width - L - R - 2 * bar;
  const srcs = sources.filter((s) => s.value > 0), us = uses.filter((u) => u.value > 0);
  const total = Math.max(1e-9, srcs.reduce((a, b) => a + b.value, 0));
  const nodePad = 5;
  const H = Math.max(140, Math.min(260, 60 + us.length * 22));
  const place = (list) => {
    const usable = H - nodePad * (list.length - 1);
    const k = usable / total;
    let y = 0; const out = [];
    for (const it of list) { const h = Math.max(2, it.value * k); out.push({ ...it, y, h }); y += h + nodePad; }
    // rescale if minimum heights pushed us past H
    const s = H / Math.max(H, y - nodePad);
    for (const o of out) { o.y *= s; o.h = Math.max(1.5, o.h * s); }
    return out;
  };
  const S = place(srcs), U = place(us);
  const SK = Object.fromEntries(S.map((a) => [a.key, a])), UK = Object.fromEntries(U.map((a) => [a.key, a]));
  const live = links.filter((l) => l.value > 0 && SK[l.s] && UK[l.t]);
  const ui = (k) => U.findIndex((u) => u.key === k), si = (k) => S.findIndex((s) => s.key === k);
  const pos = new Map();
  const sOff = Object.fromEntries(S.map((s) => [s.key, 0])), uOff = Object.fromEntries(U.map((u) => [u.key, 0]));
  for (const l of [...live].sort((a, b) => ui(a.t) - ui(b.t))) { const s = SK[l.s], t = UK[l.t]; const hs = s.h * (l.value / s.value); pos.set(l, { ys: s.y + sOff[l.s], hs, ht: t.h * (l.value / t.value) }); sOff[l.s] += hs; }
  for (const l of [...live].sort((a, b) => si(a.s) - si(b.s))) { const p = pos.get(l); p.yt = UK[l.t].y + uOff[l.t]; uOff[l.t] += p.ht; }
  const x0 = L + bar, x1 = L + bar + gap, xm = (x0 + x1) / 2;
  let paths = '';
  // each band in the colour of its source, so how much of each use came from each source reads at a glance (the map
  // draws a selected place's water in the same colours)
  for (const l of [...live].sort((a, b) => b.value - a.value)) {
    const p = pos.get(l), c = SK[l.s].color;
    paths += `<path data-s="${l.s}" data-t="${l.t}" d="M${x0},${p.ys.toFixed(1)} C${xm},${p.ys.toFixed(1)} ${xm},${p.yt.toFixed(1)} ${x1},${p.yt.toFixed(1)} L${x1},${(p.yt + p.ht).toFixed(1)} C${xm},${(p.yt + p.ht).toFixed(1)} ${xm},${(p.ys + p.hs).toFixed(1)} ${x0},${(p.ys + p.hs).toFixed(1)} Z" fill="${c}" fill-opacity="0.38"><title>${esc(SNAME[l.s] || l.s)} to ${esc(UK[l.t].name)}: ${esc(fmt(l.value))}</title></path>`;
  }
  let nodes = '';
  // a label moved off its bar is joined to it by a small bracket: out from the bar, along, and in to the label
  const elbow = (xa, ya, xb, yb) => `<path d="M${xa},${ya.toFixed(1)} H${((xa + xb) / 2).toFixed(1)} V${yb.toFixed(1)} H${xb}" stroke="rgba(255,247,232,.32)" fill="none"/>`;
  // sources: two-line labels on the left
  const sy = spread(S.map((s) => s.y + s.h / 2), 26, 10, H - 6);
  S.forEach((s, i) => {
    nodes += `<rect x="${L}" y="${s.y.toFixed(1)}" width="${bar}" height="${s.h.toFixed(1)}" fill="${s.color}"/>`;
    const cy = sy[i], c0 = s.y + s.h / 2;
    if (Math.abs(cy - c0) > 3) nodes += elbow(L - 1, c0, L - 5, cy);
    nodes += `<rect data-t="*" data-s="${s.key}" x="0" y="${(cy - 12).toFixed(1)}" width="${L + bar}" height="24" fill="transparent"/>`;
    nodes += `<text x="${L - 6}" y="${(cy - 1.5).toFixed(1)}" text-anchor="end">${esc(s.name)}</text><text class="v" x="${L - 6}" y="${(cy + 10).toFixed(1)}" text-anchor="end">${esc(fmt(s.value))}</text>`;
  });
  // uses: one line each ("name  value"), plus a second line for consumption when there is room
  const uy = spread(U.map((u) => u.y + u.h / 2), 14, 6, H - 2);
  U.forEach((u, i) => {
    const cf = Math.min(1, (u.consumed || 0) / u.value);
    nodes += `<rect data-t="${u.key}" x="${x1}" y="${u.y.toFixed(1)}" width="${bar + 90}" height="${Math.max(8, u.h).toFixed(1)}" fill="transparent"/><rect x="${x1}" y="${u.y.toFixed(1)}" width="${bar}" height="${u.h.toFixed(1)}" fill="${u.color}" fill-opacity="0.6"/>`;
    if (cf > 0) nodes += `<rect x="${x1}" y="${u.y.toFixed(1)}" width="${bar}" height="${Math.max(1, u.h * cf).toFixed(1)}" fill="#fff7e8" fill-opacity="0.92"/>`;
    const cy = uy[i], c0 = u.y + u.h / 2, tx = x1 + bar + 6;
    if (Math.abs(cy - c0) > 3) nodes += elbow(x1 + bar + 1, c0, tx - 1, cy);
    nodes += `<text x="${tx}" y="${(cy + 3.5).toFixed(1)}">${esc(u.name)} <tspan class="v">${esc(fmt(u.value))}</tspan></text>`;
    if (cf > 0 && u.h > 26) nodes += `<text class="v" x="${tx}" y="${(cy + 16).toFixed(1)}">${Math.round(cf * 100)}% consumed</text>`;
  });
  const top = 18;
  return `<svg class="wm-sankey" width="${width}" height="${H + top + 18}" viewBox="0 -${top} ${width} ${H + top + 18}" role="img" aria-label="Sources to uses${unit ? ', ' + esc(unit) : ''}">
    <text class="h" x="${L + bar}" y="-6" text-anchor="end">From</text><text class="h" x="${x1}" y="-6">To</text>
    ${paths}${nodes}</svg>`;
}

/**
 * All of a place's water in three steps: where it was drawn from, what it was used for, and what became of it
 * (consumed, returned, or, for the uses USGS did not estimate in 2015, not known). Bands from a source take the
 * source's colour, bands to a fate the use's, so each use can be followed from one end to the other.
 */
export function sankey3SVG({ sources, uses, fates, links1, links2, width = 330, fmt = (v) => v.toFixed(0) }) {
  const L = Math.round(Math.min(96, width * 0.27)), R = Math.round(Math.min(92, width * 0.26)), bar = 7;
  const span = width - L - R - 3 * bar, g1 = Math.round(span * 0.42), g2 = span - g1;
  const X0 = L, X1 = L + bar + g1, X2 = X1 + bar + g2;
  const S0 = sources.filter((s) => s.value > 0), U0 = uses.filter((u) => u.value > 0), F0 = fates.filter((f) => f.value > 0);
  const total = Math.max(1e-9, S0.reduce((a, b) => a + b.value, 0));
  const H = Math.max(180, Math.min(300, 80 + U0.length * 22)), pad = 5;
  const place = (list) => {
    const k = (H - pad * (list.length - 1)) / total;
    let y = 0; const out = [];
    for (const it of list) { const h = Math.max(1.5, it.value * k); out.push({ ...it, y, h }); y += h + pad; }
    const s = H / Math.max(H, y - pad);
    for (const o of out) { o.y *= s; o.h = Math.max(1.5, o.h * s); }
    return out;
  };
  const S = place(S0), U = place(U0), F = place(F0);
  const by = (list) => Object.fromEntries(list.map((a) => [a.key, a]));
  const SK = by(S), UK = by(U), FK = by(F);
  const ord = (list) => (k) => list.findIndex((a) => a.key === k);
  // stack each node's bands in the order of the node at their other end, so bands do not cross needlessly
  const stack = (links, A, B, oa, ob) => {
    const live = links.filter((l) => l.value > 0 && A[l.s] && B[l.t]);
    const pos = new Map(), offA = {}, offB = {};
    for (const l of [...live].sort((p, q) => ob(p.t) - ob(q.t))) { const a = A[l.s]; const h = a.h * (l.value / a.value); pos.set(l, { ya: a.y + (offA[l.s] || 0), ha: h }); offA[l.s] = (offA[l.s] || 0) + h; }
    for (const l of [...live].sort((p, q) => oa(p.s) - oa(q.s))) { const b = B[l.t], p = pos.get(l); p.hb = b.h * (l.value / b.value); p.yb = b.y + (offB[l.t] || 0); offB[l.t] = (offB[l.t] || 0) + p.hb; }
    return { live, pos };
  };
  const band = (xa, xb, p, color, op, title, ds, dt) => {
    const xm = (xa + xb) / 2;
    return `<path${ds ? ` data-s="${ds}"` : ''}${dt ? ` data-t="${dt}"` : ''} d="M${xa},${p.ya.toFixed(1)} C${xm},${p.ya.toFixed(1)} ${xm},${p.yb.toFixed(1)} ${xb},${p.yb.toFixed(1)} L${xb},${(p.yb + p.hb).toFixed(1)} C${xm},${(p.yb + p.hb).toFixed(1)} ${xm},${(p.ya + p.ha).toFixed(1)} ${xa},${(p.ya + p.ha).toFixed(1)} Z" fill="${color}" fill-opacity="${op}"><title>${esc(title)}</title></path>`;
  };
  let paths = '';
  const A1 = stack(links1, SK, UK, ord(S), ord(U));
  for (const l of [...A1.live].sort((a, b) => b.value - a.value)) paths += band(X0 + bar, X1, A1.pos.get(l), SK[l.s].color, 0.38, `${SK[l.s].name} to ${UK[l.t].name}: ${fmt(l.value)}`, l.s, l.t);
  const A2 = stack(links2, UK, FK, ord(U), ord(F));
  for (const l of [...A2.live].sort((a, b) => b.value - a.value)) paths += band(X1 + bar, X2, A2.pos.get(l), UK[l.s].color, 0.26, `${UK[l.s].name}, ${FK[l.t].name.toLowerCase()}: ${fmt(l.value)}`, null, l.s);
  let nodes = '';
  const elbow = (xa, ya, xb, yb) => `<path d="M${xa},${ya.toFixed(1)} H${((xa + xb) / 2).toFixed(1)} V${yb.toFixed(1)} H${xb}" stroke="rgba(255,247,232,.32)" fill="none"/>`;
  // sources and fates: two-line labels outside the bars
  const side = (list, x, anchorEnd) => {
    const ys = spread(list.map((a) => a.y + a.h / 2), 26, 10, H - 6);
    list.forEach((a, i) => {
      nodes += `<rect x="${x}" y="${a.y.toFixed(1)}" width="${bar}" height="${a.h.toFixed(1)}" fill="${a.color}"${a.key && anchorEnd ? ` data-t="*" data-s="${a.key}"` : ''}/>`;
      const cy = ys[i], c0 = a.y + a.h / 2, tx = anchorEnd ? x - 6 : x + bar + 6;
      if (Math.abs(cy - c0) > 3) nodes += anchorEnd ? elbow(x - 1, c0, x - 5, cy) : elbow(x + bar + 1, c0, x + bar + 5, cy);
      nodes += `<text x="${tx}" y="${(cy - 1.5).toFixed(1)}" text-anchor="${anchorEnd ? 'end' : 'start'}">${esc(a.name)}</text><text class="v" x="${tx}" y="${(cy + 10).toFixed(1)}" text-anchor="${anchorEnd ? 'end' : 'start'}">${esc(fmt(a.value))}</text>`;
    });
  };
  side(S, X0, true);
  side(F, X2, false);
  // uses: one line each, just right of their bars, over the bands to the fates (a halo keeps them legible)
  const uy = spread(U.map((u) => u.y + u.h / 2), 13, 6, H - 2);
  U.forEach((u, i) => {
    nodes += `<rect data-t="${u.key}" x="${X1}" y="${u.y.toFixed(1)}" width="${bar + 70}" height="${Math.max(8, u.h).toFixed(1)}" fill="transparent"/><rect x="${X1}" y="${u.y.toFixed(1)}" width="${bar}" height="${u.h.toFixed(1)}" fill="${u.color}"/>`;
    const cy = uy[i], c0 = u.y + u.h / 2, tx = X1 + bar + 5;
    if (Math.abs(cy - c0) > 3) nodes += elbow(X1 + bar + 1, c0, tx - 1, cy);
    nodes += `<text class="halo" x="${tx}" y="${(cy + 3.5).toFixed(1)}">${esc(u.name)} <tspan class="v">${esc(fmt(u.value))}</tspan></text>`;
  });
  const top = 18;
  return `<svg class="wm-sankey wm-sankey3" width="${width}" height="${H + top + 18}" viewBox="0 -${top} ${width} ${H + top + 18}" role="img" aria-label="Where the water came from, what it was used for and what became of it">
    <text class="h" x="${X0 + bar}" y="-6" text-anchor="end">From</text><text class="h" x="${X1 + bar / 2}" y="-6" text-anchor="middle">For</text><text class="h" x="${X2}" y="-6">Then</text>
    ${paths}${nodes}</svg>`;
}
