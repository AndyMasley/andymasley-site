import * as THREE from 'three';

/**
 * HTML labels pinned to the model: states, cities, rivers, lakes, power plants, aqueducts, and the callouts the map
 * adds for a selected place or an isolated use. Each label has a world anchor, a priority and a zoom range; every
 * frame the visible ones are projected and placed greedily, highest priority first, so none overlap.
 *
 * anchor 'center' centres the label on its point; 'dot' puts a small marker on the point with the text to its right.
 * A label with `lead` sits `gap` pixels from its point (clear of the dot the map draws there) and, when it has to
 * move away to find room (up to `shift` lines), is joined to its point by a leader line. A label with `must` is never dropped: if nowhere
 * near its point is free, it takes the nearest free spot further out, and if there is none, its own spot.
 */
const SVGNS = 'http://www.w3.org/2000/svg';

export class Labels {
  constructor(root, camera) {
    this.root = root; this.camera = camera;
    this.items = []; this.enabled = true;
    this.v = new THREE.Vector3();
    this.hidden = new Set();   // groups switched off
    this.dirty = true;
    this.svg = document.createElementNS(SVGNS, 'svg');
    this.svg.setAttribute('class', 'wm-leads');
    this.svg.setAttribute('aria-hidden', 'true');
    this.path = document.createElementNS(SVGNS, 'path');
    this.svg.appendChild(this.path);
    root.appendChild(this.svg);
  }
  add({ text, html, cls = '', x, z, h = 0, y = null, pri = 0, dmin = 0, dmax = Infinity, group = 'base', anchor = 'center', title = null, color = null, must = false, lead = false, gap = 5, shift = 3 }) {
    const el = document.createElement('div');
    el.className = `wm-lbl ${cls}${anchor === 'dot' ? ' dot' : ''}${lead ? ' lead' : ''}`;
    if (color) el.style.setProperty('--wm-c', color);
    if (html != null) el.innerHTML = html; else el.textContent = text;
    if (title) el.title = title;
    el.style.opacity = '0';
    this.root.appendChild(el);
    const it = { cls, x, z, h, y, pri, dmin, dmax, el, w: 0, hgt: 0, shown: false, group, anchor, must, lead, gap, shift, key: text != null ? text : null };
    this.items.push(it);
    this.dirty = true;
    return it;
  }
  removeGroup(group) {
    const keep = [];
    for (const it of this.items) { if (it.group === group) it.el.remove(); else keep.push(it); }
    this.items = keep;
  }
  setGroup(group, on) { if (on) this.hidden.delete(group); else this.hidden.add(group); }
  measure() {
    for (const it of this.items) if (!it.w) { const r = it.el.getBoundingClientRect(); it.w = r.width; it.hgt = r.height; }
    this.dirty = false;
  }
  hideAll() { for (const it of this.items) if (it.shown) { it.el.style.opacity = '0'; it.shown = false; } this.path.setAttribute('d', ''); }
  /** screen rectangles (stage pixels) that labels must stay out of: the panels over the map */
  setAvoid(rects) { this.avoid = rects; }
  /** marks on the map that labels must not cover (world points with a radius in pixels), or null */
  setMarks(list) { this.marks = list; }
  update(camDist, exag, rect, yOffset = 0) {
    if (!this.enabled) { if (this._wasOn) { this.hideAll(); this._wasOn = false; } return; }
    this._wasOn = true;
    if (this.dirty) this.measure();
    const W = rect.width, H = rect.height;
    const cand = [];
    for (const it of this.items) {
      const off = this.hidden.has(it.group) || camDist < it.dmin || camDist > it.dmax;
      if (!off) {
        const y = it.y != null ? (typeof it.y === 'function' ? it.y(exag) : it.y) : it.h * exag + yOffset;
        this.v.set(it.x, y, it.z).project(this.camera);
        if (!(this.v.z > 1 || Math.abs(this.v.x) > 1.1 || Math.abs(this.v.y) > 1.1)) {
          it.sx = (this.v.x * 0.5 + 0.5) * W; it.sy = (-this.v.y * 0.5 + 0.5) * H;
          cand.push(it);
          continue;
        }
      }
      if (it.shown) { it.el.style.opacity = '0'; it.shown = false; }
    }
    cand.sort((a, b) => b.pri - a.pri);
    const placed = this.avoid ? this.avoid.map((r) => [r[0], r[1], r[2], r[3]]) : [];
    if (this.marks) for (const k of this.marks) {
      this.v.set(k.x, k.h * exag + yOffset, k.z).project(this.camera);
      if (this.v.z > 1 || Math.abs(this.v.x) > 1.05 || Math.abs(this.v.y) > 1.05) continue;
      const sx = (this.v.x * 0.5 + 0.5) * W, sy = (-this.v.y * 0.5 + 0.5) * H;
      placed.push([sx - k.r - 1, sy - k.r - 1, sx + k.r + 1, sy + k.r + 1]);
    }
    const pad = 3;
    const inStage = (x0, y0, x1, y1) => x0 > 4 && x1 < W - 4 && y0 > 4 && y1 < H - 4;
    const fits = (x0, y0, x1, y1) => {
      if (!inStage(x0, y0, x1, y1)) return false;
      for (const p of placed) if (x0 < p[2] && x1 > p[0] && y0 < p[3] && y1 > p[1]) return false;
      return true;
    };
    // the sources of a selected place go first, then the dots (the map's marks) count as taken
    for (const it of cand) if (it.lead && it.gap > 5) placed.push([it.sx - it.gap + 3, it.sy - it.gap + 3, it.sx + it.gap - 3, it.sy + it.gap - 3]);
    let d = '';
    const show = (it, left, top, t, flip) => {
      placed.push([left - pad, top - pad, left + it.w + pad, top + it.hgt + pad]);
      it.el.style.transform = `translate(${left.toFixed(1)}px, ${top.toFixed(1)}px)`;
      it.el.classList.toggle('lift', !it.lead && t !== 0);
      it.el.classList.toggle('flip', flip);
      if (!it.lead) it.el.style.setProperty('--wm-lead', `${(-t * (it.hgt + 4)).toFixed(0)}px`);
      if (!it.shown) { it.el.style.opacity = '1'; it.shown = true; }
      if (it.lead) {
        // a leader from the edge of the dot to the nearest point of the label, when the label has moved away
        const nx = Math.max(left, Math.min(it.sx, left + it.w)), ny = Math.max(top, Math.min(it.sy, top + it.hgt));
        const dx = nx - it.sx, dy = ny - it.sy, L = Math.hypot(dx, dy), r0 = Math.max(2, it.gap - 4);
        if (L > it.gap + 3) d += `M${(it.sx + dx / L * r0).toFixed(1)},${(it.sy + dy / L * r0).toFixed(1)}L${nx.toFixed(1)},${ny.toFixed(1)}`;
      }
    };
    // a name already on screen nearby is not repeated (a long river is labelled at two places along it)
    const named = new Map();
    const repeat = (it) => { const a = it.key && named.get(it.key); return !!a && a.some(([x, y]) => Math.hypot(x - it.sx, y - it.sy) < 340); };
    for (const it of cand) {
      if (repeat(it)) { if (it.shown) { it.el.style.opacity = '0'; it.shown = false; } continue; }
      const dot = it.anchor === 'dot';
      // a dotted label may also sit a line above or below its point (with a short leader) when its own spot is taken,
      // and may turn to the left of its point when the right side is blocked (by a panel or the edge of the stage)
      // (up to `shift` lines: a label far from its point reads as another place's)
      const tries = dot && it.group !== 'base' ? [0, -1, 1, -2, 2, -3, 3].filter((t) => Math.abs(t) <= it.shift) : [0];
      const sides = dot && it.group !== 'base' ? [false, true] : [false];
      const g = it.lead ? it.gap : 5;
      let done = false;
      for (const flip of sides) {
        for (const t of tries) {
          const left = dot ? (flip ? it.sx + (it.lead ? -g - it.w : 5 - it.w) : it.sx + (it.lead ? g : -5)) : it.sx - it.w / 2;
          const top = it.sy - it.hgt / 2 + t * (it.hgt + 4);
          if (!fits(left - pad, top - pad, left + it.w + pad, top + it.hgt + pad)) continue;
          show(it, left, top, t, flip);
          done = true;
          break;
        }
        if (done) break;
      }
      if (!done && it.must) {
        // further out, in eight directions, with a leader back to the point
        outer: for (const D of [26, 48, 76, 110, 150]) {
          for (const ang of [0, 180, -35, 35, 145, 215, -90, 90]) {
            const a = (ang * Math.PI) / 180, cx = it.sx + Math.cos(a) * (D + it.w / 2), cy = it.sy + Math.sin(a) * (D + it.hgt / 2);
            const left = cx - it.w / 2, top = cy - it.hgt / 2;
            if (!fits(left - pad, top - pad, left + it.w + pad, top + it.hgt + pad)) continue;
            show(it, left, top, 1, ang > 90 && ang < 270);
            done = true;
            break outer;
          }
        }
        if (!done) {
          // nowhere free: its own spot, inside the stage
          const left = Math.max(6, Math.min(W - 6 - it.w, it.sx + it.gap)), top = Math.max(6, Math.min(H - 6 - it.hgt, it.sy - it.hgt / 2));
          show(it, left, top, 0, false);
          done = true;
        }
      }
      if (!done && it.shown) { it.el.style.opacity = '0'; it.shown = false; }
      if (done && it.key) { const a = named.get(it.key); if (a) a.push([it.sx, it.sy]); else named.set(it.key, [[it.sx, it.sy]]); }
    }
    if (d !== this._d) { this.path.setAttribute('d', d); this._d = d; }
  }
  dispose() { for (const it of this.items) it.el.remove(); this.items = []; this.svg.remove(); }
}
