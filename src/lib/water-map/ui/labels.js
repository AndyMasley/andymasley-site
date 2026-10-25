import * as THREE from 'three';

/**
 * HTML labels pinned to the model: states, cities, rivers, lakes, power plants, aqueducts, and the callouts the map
 * adds for a selected place or an isolated use. Each label has a world anchor, a priority and a zoom range; every
 * frame the visible ones are projected and placed greedily, highest priority first, so none overlap.
 *
 * anchor 'center' centres the label on its point; 'dot' puts a small marker on the point with the text to its right.
 */
export class Labels {
  constructor(root, camera) {
    this.root = root; this.camera = camera;
    this.items = []; this.enabled = true;
    this.v = new THREE.Vector3();
    this.hidden = new Set();   // groups switched off
    this.dirty = true;
  }
  add({ text, html, cls = '', x, z, h = 0, y = null, pri = 0, dmin = 0, dmax = Infinity, group = 'base', anchor = 'center', title = null, color = null }) {
    const el = document.createElement('div');
    el.className = `wm-lbl ${cls}${anchor === 'dot' ? ' dot' : ''}`;
    if (color) el.style.setProperty('--wm-c', color);
    if (html != null) el.innerHTML = html; else el.textContent = text;
    if (title) el.title = title;
    el.style.opacity = '0';
    this.root.appendChild(el);
    const it = { cls, x, z, h, y, pri, dmin, dmax, el, w: 0, hgt: 0, shown: false, group, anchor };
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
  hideAll() { for (const it of this.items) if (it.shown) { it.el.style.opacity = '0'; it.shown = false; } }
  /** screen rectangles (stage pixels) that labels must stay out of: the panels over the map */
  setAvoid(rects) { this.avoid = rects; }
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
    const pad = 3;
    const fits = (x0, y0, x1, y1) => {
      if (!(x0 > 4 && x1 < W - 4 && y0 > 4 && y1 < H - 4)) return false;
      for (const p of placed) if (x0 < p[2] && x1 > p[0] && y0 < p[3] && y1 > p[1]) return false;
      return true;
    };
    for (const it of cand) {
      const dot = it.anchor === 'dot';
      // a dotted label may also sit a line above or below its point (with a short leader) when its own spot is taken,
      // and may turn to the left of its point when the right side is blocked (by a panel or the edge of the stage)
      const tries = dot && it.group !== 'base' ? [0, -1, 1, -2, 2, -3, 3] : [0];
      const sides = dot && it.group !== 'base' ? [false, true] : [false];
      let done = false;
      for (const flip of sides) {
        for (const t of tries) {
          const left = dot ? (flip ? it.sx + 5 - it.w : it.sx - 5) : it.sx - it.w / 2;
          const top = it.sy - it.hgt / 2 + t * (it.hgt + 4);
          const x0 = left - pad, x1 = left + it.w + pad, y0 = top - pad, y1 = top + it.hgt + pad;
          if (!fits(x0, y0, x1, y1)) continue;
          placed.push([x0, y0, x1, y1]);
          it.el.style.transform = `translate(${left.toFixed(1)}px, ${top.toFixed(1)}px)`;
          it.el.classList.toggle('lift', t !== 0);
          it.el.classList.toggle('flip', flip);
          it.el.style.setProperty('--wm-lead', `${(-t * (it.hgt + 4)).toFixed(0)}px`);
          if (!it.shown) { it.el.style.opacity = '1'; it.shown = true; }
          done = true;
          break;
        }
        if (done) break;
      }
      if (!done && it.shown) { it.el.style.opacity = '0'; it.shown = false; }
    }
  }
  dispose() { for (const it of this.items) it.el.remove(); this.items = []; }
}
