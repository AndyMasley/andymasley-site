import * as THREE from 'three';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/**
 * Map-style camera: drag to pan, wheel/pinch to zoom toward the cursor, right-drag (or Ctrl/Alt-drag,
 * or a two-finger twist) to rotate and tilt. State is a ground target, a distance, an azimuth and a tilt.
 */
export class MapControls {
  constructor(camera, dom, opts = {}) {
    this.camera = camera; this.dom = dom;
    this.bounds = opts.bounds || { x0: -300, x1: 1150, z0: -50, z1: 700 };
    this.minDist = opts.minDist ?? 2.2; this.maxDist = opts.maxDist ?? 1900;
    this.groundAt = opts.groundAt || (() => 0);
    this.state = { x: 480, z: 320, y: 0, d: 1000, az: 0, tilt: 0.55 };
    this.goal = { ...this.state };
    this.fly = null;
    this.enabled = true;
    this.onStart = null; this.onChange = null; this.onClick = null; this.onHover = null; this.onDblClick = null;
    this._ptrs = new Map(); this._drag = null; this._plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this._ray = new THREE.Raycaster(); this._v = new THREE.Vector3(); this._ndc = new THREE.Vector2();
    this._moved = 0; this._lastTap = 0;
    this.wheelGate = opts.wheelGate || null;   // (event) => true when the wheel should zoom the map, not scroll the page
    this.keyTarget = opts.keyTarget || dom;
    this._ac = new AbortController();
    this._bind();
  }
  maxTilt(d) { return d > 600 ? 1.05 : d > 120 ? 1.18 : 1.30; }
  set(s, instant = false) {
    Object.assign(this.goal, s);
    this._clampGoal();
    if (instant) Object.assign(this.state, this.goal);
  }
  _clampGoal() {
    const g = this.goal, b = this.bounds;
    g.d = clamp(g.d, this.minDist, this.maxDist);
    g.tilt = clamp(g.tilt, 0.02, this.maxTilt(g.d));
    g.x = clamp(g.x, b.x0, b.x1); g.z = clamp(g.z, b.z0, b.z1);
  }
  /** animate to a view; long hops zoom out and back in */
  flyTo(to, ms = 1600) {
    const from = { ...this.state };
    const tgt = { ...from, ...to };
    tgt.d = clamp(tgt.d, this.minDist, this.maxDist);
    tgt.tilt = clamp(tgt.tilt, 0.02, this.maxTilt(tgt.d));
    let daz = ((tgt.az - from.az + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
    tgt.az = from.az + daz;
    const hop = Math.hypot(tgt.x - from.x, tgt.z - from.z);
    const peak = Math.max(from.d, tgt.d, Math.min(this.maxDist * 0.7, hop * 1.25));
    const bump = Math.max(0, Math.log(peak) - Math.max(Math.log(from.d), Math.log(tgt.d)));
    this.fly = { from, tgt, t0: performance.now(), ms: ms * (0.65 + 0.35 * Math.min(1, bump / 2)), bump };
  }
  cancelFly() { if (this.fly) { this.fly = null; Object.assign(this.goal, this.state); } }
  update(dt) {
    const s = this.state, g = this.goal;
    if (this.fly) {
      const f = this.fly, t = clamp((performance.now() - f.t0) / f.ms, 0, 1), e = ease(t);
      for (const k of ['x', 'z', 'az', 'tilt']) s[k] = f.from[k] + (f.tgt[k] - f.from[k]) * e;
      s.d = Math.exp(Math.log(f.from.d) + (Math.log(f.tgt.d) - Math.log(f.from.d)) * e + f.bump * Math.sin(Math.PI * e));
      Object.assign(g, s);
      if (t >= 1) this.fly = null;
    } else {
      const k = 1 - Math.exp(-dt * 14);
      s.x += (g.x - s.x) * k; s.z += (g.z - s.z) * k;
      s.d = Math.exp(Math.log(s.d) + (Math.log(g.d) - Math.log(s.d)) * k);
      s.az += (g.az - s.az) * k; s.tilt += (g.tilt - s.tilt) * k;
    }
    const gy = this.groundAt(s.x, s.z);
    s.y += (gy - s.y) * (1 - Math.exp(-dt * 6));
    this.apply();
  }
  apply() {
    const s = this.state, c = this.camera;
    const sp = Math.sin(s.tilt), cp = Math.cos(s.tilt);
    c.position.set(s.x + s.d * sp * Math.sin(s.az), s.y + s.d * cp, s.z + s.d * sp * Math.cos(s.az));
    c.up.set(-Math.sin(s.az) * cp, sp, -Math.cos(s.az) * cp).normalize();
    c.up.set(0, 1, 0);
    if (s.tilt < 0.06) c.up.set(-Math.sin(s.az), 0, -Math.cos(s.az));
    c.lookAt(s.x, s.y, s.z);
    c.near = Math.max(0.02, s.d * 0.01);
    c.far = s.d * 6 + 2600;
    c.updateProjectionMatrix();
    this.onChange?.(s);
  }
  /** ground point under a client pixel, intersecting the horizontal plane through the target */
  groundPoint(cx, cy, y = this.state.y) {
    const r = this.dom.getBoundingClientRect();
    this._ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    this._ray.setFromCamera(this._ndc, this.camera);
    this._plane.constant = -y;
    const hit = this._ray.ray.intersectPlane(this._plane, this._v);
    return hit ? hit.clone() : null;
  }
  ray(cx, cy) {
    const r = this.dom.getBoundingClientRect();
    this._ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    this._ray.setFromCamera(this._ndc, this.camera);
    return this._ray.ray;
  }
  zoomAt(factor, cx, cy) {
    this.cancelFly();
    const p = cx != null ? this.groundPoint(cx, cy) : null;
    const g = this.goal, d0 = g.d;
    g.d = clamp(g.d * factor, this.minDist, this.maxDist);
    if (p) { const k = g.d / d0; g.x = p.x + (g.x - p.x) * k; g.z = p.z + (g.z - p.z) * k; }
    if (g.tilt > this.maxTilt(g.d)) g.tilt = this.maxTilt(g.d);
    this._clampGoal();
  }
  dispose() { this._ac.abort(); }
  _bind() {
    const el = this.dom, o = { signal: this._ac.signal };
    el.addEventListener('contextmenu', (e) => e.preventDefault(), o);
    el.addEventListener('wheel', (e) => {
      if (!this.enabled) return;
      if (this.wheelGate && !this.wheelGate(e)) return;
      e.preventDefault();
      const dy = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
      this.zoomAt(Math.exp(clamp(dy, -400, 400) * (e.ctrlKey ? 0.006 : 0.0016)), e.clientX, e.clientY);
      this.onStart?.('zoom');
    }, { passive: false, signal: this._ac.signal });
    el.addEventListener('pointerdown', (e) => {
      if (!this.enabled) return;
      el.setPointerCapture(e.pointerId);
      this._ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this.cancelFly();
      this._moved = 0;
      const rotate = e.button === 2 || e.ctrlKey || e.altKey || e.metaKey || e.shiftKey;
      if (this._ptrs.size === 1) {
        this._drag = { mode: rotate ? 'rotate' : 'pan', x: e.clientX, y: e.clientY, start: this.groundPoint(e.clientX, e.clientY), goal: { ...this.goal } };
      } else if (this._ptrs.size === 2) {
        const [a, b] = [...this._ptrs.values()];
        this._drag = { mode: 'pinch', dist: Math.hypot(a.x - b.x, a.y - b.y), ang: Math.atan2(b.y - a.y, b.x - a.x), mid: [(a.x + b.x) / 2, (a.y + b.y) / 2], goal: { ...this.goal } };
      }
      this.onStart?.('drag');
    }, o);
    el.addEventListener('pointermove', (e) => {
      const p = this._ptrs.get(e.pointerId);
      if (!p) { if (e.pointerType === 'mouse') this.onHover?.(e.clientX, e.clientY); return; }
      this._moved += Math.abs(e.clientX - p.x) + Math.abs(e.clientY - p.y);
      p.x = e.clientX; p.y = e.clientY;
      const d = this._drag; if (!d) return;
      const g = this.goal;
      if (d.mode === 'pan' && d.start) {
        const cur = this.groundPoint(e.clientX, e.clientY, d.start.y);
        if (cur) { g.x += d.start.x - cur.x; g.z += d.start.z - cur.z; this.state.x = g.x; this.state.z = g.z; this.apply(); }
      } else if (d.mode === 'rotate') {
        g.az = d.goal.az - (e.clientX - d.x) * 0.006;
        g.tilt = clamp(d.goal.tilt + (e.clientY - d.y) * 0.005, 0.02, this.maxTilt(g.d));
      } else if (d.mode === 'pinch' && this._ptrs.size >= 2) {
        const [a, b] = [...this._ptrs.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y), ang = Math.atan2(b.y - a.y, b.x - a.x);
        const mid = [(a.x + b.x) / 2, (a.y + b.y) / 2];
        g.d = clamp(d.goal.d * d.dist / Math.max(10, dist), this.minDist, this.maxDist);
        g.az = d.goal.az + (ang - d.ang);
        g.tilt = clamp(d.goal.tilt + (mid[1] - d.mid[1]) * 0.004, 0.02, this.maxTilt(g.d));
        const p0 = this.groundPoint(d.mid[0], d.mid[1]), p1 = this.groundPoint(mid[0], mid[1]);
        if (p0 && p1) { g.x += (p0.x - p1.x) * 0.5; g.z += (p0.z - p1.z) * 0.5; }
        d.mid = mid;
      }
      this._clampGoal();
    }, o);
    const end = (e) => {
      const had = this._ptrs.has(e.pointerId);
      this._ptrs.delete(e.pointerId);
      if (!had) return;
      if (this._ptrs.size === 0) {
        if (this._moved < 6 && e.type === 'pointerup') {
          const now = performance.now();
          if (now - this._lastTap < 320) this.onDblClick?.(e.clientX, e.clientY, e);
          else this.onClick?.(e.clientX, e.clientY, e);
          this._lastTap = now;
        }
        this._drag = null;
      } else if (this._ptrs.size === 1) {
        const [q] = [...this._ptrs.values()];
        this._drag = { mode: 'pan', x: q.x, y: q.y, start: this.groundPoint(q.x, q.y), goal: { ...this.goal } };
      }
    };
    el.addEventListener('pointerup', end, o); el.addEventListener('pointercancel', end, o);
    el.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') this.onHover?.(null); }, o);
    // keys move the map only while the map itself has focus, so the page keeps its own keyboard scrolling
    this.keyTarget.addEventListener('keydown', (e) => {
      if (!this.enabled || e.target.closest?.('input, textarea, select, button, a')) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const g = this.goal, step = g.d * 0.12;
      const fx = -Math.sin(g.az), fz = -Math.cos(g.az), rx = Math.cos(g.az), rz = -Math.sin(g.az);
      let used = true;
      switch (e.key) {
        case 'ArrowUp': case 'w': g.x += fx * step; g.z += fz * step; break;
        case 'ArrowDown': case 's': g.x -= fx * step; g.z -= fz * step; break;
        case 'ArrowLeft': case 'a': g.x -= rx * step; g.z -= rz * step; break;
        case 'ArrowRight': case 'd': g.x += rx * step; g.z += rz * step; break;
        case '+': case '=': this.zoomAt(0.7); break;
        case '-': case '_': this.zoomAt(1.4); break;
        case 'q': g.az += 0.12; break;
        case 'e': g.az -= 0.12; break;
        case 'r': g.tilt = clamp(g.tilt + 0.08, 0.02, this.maxTilt(g.d)); break;
        case 'f': g.tilt = clamp(g.tilt - 0.08, 0.02, this.maxTilt(g.d)); break;
        default: used = false;
      }
      if (used) { this.cancelFly(); this._clampGoal(); this.onStart?.('key'); e.preventDefault(); }
    }, o);
  }
}
