/**
 * Interface sounds, made with the Web Audio API as they play (there are no audio files). Picking a place lets a drop
 * of water fall, pitched by how much water it withdrew, deeper for more; picking a use pours a short run of drops;
 * buttons tap; switches rise or fall a fourth; camera flights breathe; going underground gulps and coming up bubbles;
 * each story scene rings a note of a pentatonic scale; saving an image clicks a shutter.
 *
 * A browser lets a page make sound only after the reader has touched it, so nothing plays until then. Sounds play
 * only in answer to the reader (within moments of a click, key, touch or scroll), never for the map's own motions. The
 * Sound button mutes them, and the choice is kept in this browser.
 */
const KEY = 'wm-sound';
const PENTA = [523.25, 587.33, 659.26, 783.99, 880.0, 1046.5, 1174.66, 1318.51];

function stored() {
  try { const v = window.localStorage.getItem(KEY); return v == null ? true : v === '1'; } catch { return true; }
}

export class Sound {
  constructor(root) {
    this.root = root;
    this.on = stored();
    this.ctx = null;
    this.lastGesture = -1e9;
    this.last = { t: -1e9, pri: -1 };
    this.voices = 0;
    this._ac = new AbortController();
    const opt = { capture: true, passive: true, signal: this._ac.signal };
    const gesture = () => { this.lastGesture = performance.now(); this.unlock(); };
    for (const ev of ['pointerdown', 'keydown', 'touchend', 'wheel']) window.addEventListener(ev, gesture, opt);
    // a reader scrolling the story with a finger or the wheel counts as answering it
    window.addEventListener('touchmove', () => { this.lastGesture = performance.now(); }, opt);
  }
  /** start the audio graph on the first touch, click or key (browsers allow it only then) */
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {}); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try { this.ctx = new AC({ latencyHint: 'interactive' }); } catch { return; }
    this._graph(this.ctx);
  }
  /** the shared chain: a gentle compressor at the end, and a short room for the drops to ring in */
  _graph(ctx) {
    this.master = ctx.createGain(); this.master.gain.value = 1.0;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 12; comp.ratio.value = 3; comp.attack.value = 0.003; comp.release.value = 0.15;
    this.master.connect(comp); comp.connect(ctx.destination);
    this.wet = ctx.createGain(); this.wet.gain.value = 0.22;
    const verb = ctx.createConvolver(); verb.buffer = this._room(ctx, 1.7);
    this.wet.connect(verb); verb.connect(this.master);
    const n = Math.floor(ctx.sampleRate * 1.0), nb = ctx.createBuffer(1, n, ctx.sampleRate), d = nb.getChannelData(0);
    // pinkish noise (Paul Kellet's filter): softer than white for the breaths and splashes
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < n; i++) { const w = Math.random() * 2 - 1; b0 = 0.99765 * b0 + w * 0.099046; b1 = 0.963 * b1 + w * 0.2965164; b2 = 0.57 * b2 + w * 1.0526913; d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2; }
    this.noise = nb;
  }
  _room(ctx, secs) {
    const n = Math.floor(ctx.sampleRate * secs), buf = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      let lp = 0;
      for (let i = 0; i < n; i++) { const t = i / n; lp += 0.35 * ((Math.random() * 2 - 1) - lp); d[i] = lp * Math.pow(1 - t, 3.2); }
    }
    return buf;
  }
  setOn(on) {
    this.on = !!on;
    try { window.localStorage.setItem(KEY, this.on ? '1' : '0'); } catch { /* not kept here */ }
    if (this.on) { this.lastGesture = performance.now(); this.unlock(); this.drop(60, { pri: 9 }); }
  }
  /** sound is on, the audio graph is up (or starting: what is scheduled plays as it resumes), and the page is in view */
  _live() {
    if (!this.on || !this.ctx || this.ctx.state === 'closed' || document.hidden) return false;
    if (this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
    return true;
  }
  /** may this sound play now: live, in answer to the reader, and not stepping on a more important one */
  _ok(pri, answer = true) {
    if (!this._live()) return false;
    const now = performance.now();
    if (answer && now - this.lastGesture > 1600) return false;
    if (now - this.last.t < 110 && pri <= this.last.pri) return false;
    if (this.voices > 14) return false;
    this.last = { t: now, pri };
    return true;
  }
  _out(pan = 0, dry = 1, wet = 1) {
    const ctx = this.ctx, g = ctx.createGain();
    let node = g;
    if (pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); node = p; }
    const d = ctx.createGain(); d.gain.value = dry; node.connect(d); d.connect(this.master);
    if (wet > 0) { const w = ctx.createGain(); w.gain.value = wet; node.connect(w); w.connect(this.wet); }
    return g;
  }
  _track(node, end) {
    this.voices++;
    node.onended = () => { this.voices = Math.max(0, this.voices - 1); };
    node.stop(end);
  }
  /** one sine voice: frequency glide and an attack-decay envelope */
  _tone(t, f0, f1, glide, peak, attack, decay, { type = 'sine', pan = 0, wet = 1 } = {}) {
    const ctx = this.ctx, o = ctx.createOscillator(), g = this._out(pan, 1, wet);
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + glide);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    o.connect(g); o.start(t); this._track(o, t + attack + decay + 0.05);
  }
  /** filtered noise: splashes, clicks and breaths */
  _hiss(t, dur, peak, { type = 'bandpass', f0 = 1000, f1 = f0, q = 1, attack = 0.005, pan = 0, wet = 0.6 } = {}) {
    const ctx = this.ctx, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = this._out(pan, 1, wet);
    s.buffer = this.noise; s.loop = true;
    f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); s.start(t, Math.random() * 0.5); this._track(s, t + dur + 0.05);
  }
  /** how deep a drop sounds for v Mgal/d: 0 for a tenth of a million gallons a day or less, 1 for 10 billion or more */
  depth(v) { return Math.min(1, Math.max(0, Math.log10(Math.max(0.1, v) * 10) / 5)); }
  /** a drop of water: a rising chirp (the bubble the drop pulls under) over a tiny splash; deeper for more water */
  _plink(t, v, peak = 0.2, pan = 0, up = 1) {
    const k = this.depth(v);
    const f0 = 1250 * Math.pow(0.22, k) * up, rise = 2.1 - 0.5 * k, decay = 0.09 + 0.28 * k;
    this._tone(t, f0, f0 * rise, 0.035 + 0.05 * k, peak, 0.003, decay, { pan });
    this._tone(t + 0.004, f0 * 1.5, f0 * 1.5 * rise, 0.03, peak * 0.18, 0.003, decay * 0.5, { pan, wet: 0.5 });
    this._hiss(t, 0.035, peak * 0.12, { f0: 3800, q: 1.4, pan });
  }
  /** a place picked (a county, a plant, a canal): one drop pitched by its water, in Mgal/d */
  drop(v, { pri = 3 } = {}) {
    if (!this._ok(pri)) return;
    this._plink(this.ctx.currentTime + 0.005, v, 0.22, (Math.random() - 0.5) * 0.3);
  }
  /** a use picked: a run of four drops falling by fourths, the last pitched by the use's water */
  pour(v) {
    if (!this._ok(4)) return;
    const t = this.ctx.currentTime + 0.005, n = 4;
    for (let i = 0; i < n; i++) {
      const dt = i * (0.055 + 0.018 * Math.random());
      this._plink(t + dt, v, 0.15 - 0.015 * i, (i % 2 ? 1 : -1) * 0.2, Math.pow(4 / 3, n - 1 - i));
    }
  }
  /** back out: a soft pop, falling */
  close() {
    if (!this._ok(2)) return;
    const t = this.ctx.currentTime + 0.005;
    this._tone(t, 760, 420, 0.07, 0.11, 0.004, 0.11, { wet: 0.4 });
  }
  /** a button: a short wooden tick */
  tap() {
    if (!this._ok(1)) return;
    const t = this.ctx.currentTime + 0.003;
    this._tone(t, 1480, 1180, 0.02, 0.1, 0.002, 0.035, { type: 'triangle', wet: 0.15 });
    this._hiss(t, 0.012, 0.06, { f0: 2600, q: 2.5, wet: 0.1 });
  }
  /** a switch: two notes a fourth apart, up for on and down for off */
  toggle(on) {
    if (!this._ok(2)) return;
    const t = this.ctx.currentTime + 0.005, a = 987.77, b = 1318.51;
    const [x, y] = on ? [a, b] : [b, a];
    this._tone(t, x, x, 0, 0.05, 0.003, 0.08, { wet: 0.5 });
    this._tone(t + 0.065, y, y, 0, 0.05, 0.003, 0.12, { wet: 0.5 });
  }
  /** night falls with a low open fifth; daylight comes back an octave up */
  night(on) {
    if (!this._ok(3)) return;
    const t = this.ctx.currentTime + 0.005, r = on ? 196 : 392;
    this._tone(t, r, r, 0, 0.06, 0.04, 0.9, { wet: 1 });
    this._tone(t + 0.05, r * 1.5, r * 1.5, 0, 0.045, 0.04, 0.8, { wet: 1 });
    this._tone(t + 0.1, r * 2, r * 2, 0, 0.03, 0.04, 0.7, { wet: 1 });
  }
  /** under the ground: a muffled gulp; back up: bubbles rising */
  under(on) {
    if (!this._ok(3)) return;
    const t = this.ctx.currentTime + 0.005;
    if (on) {
      this._hiss(t, 0.5, 0.09, { type: 'lowpass', f0: 1800, f1: 140, q: 0.7, attack: 0.02, wet: 0.8 });
      this._tone(t + 0.02, 150, 62, 0.28, 0.16, 0.01, 0.34, { wet: 0.6 });
    } else {
      for (let i = 0; i < 5; i++) this._plink(t + i * 0.055 + Math.random() * 0.02, 400, 0.09 + 0.01 * i, (Math.random() - 0.5) * 0.5, Math.pow(1.26, i));
    }
  }
  /** a camera flight: air moving, as long as the flight */
  fly(ms) {
    if (!this._live() || ms < 800 || performance.now() - this.lastGesture > 1600) return;
    // (one breath per move: a second flight begun at once, to refine the first, stays silent)
    if (performance.now() - (this._flyAt || -1e9) < 400) return;
    this._flyAt = performance.now();
    const t = this.ctx.currentTime + 0.01, dur = Math.min(2.6, ms / 1000);
    const ctx = this.ctx, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = this._out(0, 1, 0.5);
    s.buffer = this.noise; s.loop = true;
    f.type = 'bandpass'; f.Q.value = 0.9;
    f.frequency.setValueAtTime(320, t); f.frequency.exponentialRampToValueAtTime(950, t + dur * 0.45); f.frequency.exponentialRampToValueAtTime(380, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.05, t + dur * 0.4); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); s.start(t, Math.random() * 0.5); this._track(s, t + dur + 0.05);
  }
  /** a story scene: one note of a pentatonic scale, struck like glass */
  scene(i) {
    if (!this._ok(3)) return;
    const t = this.ctx.currentTime + 0.005, f = PENTA[((i % PENTA.length) + PENTA.length) % PENTA.length];
    this._tone(t, f, f, 0, 0.06, 0.004, 1.1, { wet: 1 });
    this._tone(t, f * 2.756, f * 2.756, 0, 0.012, 0.002, 0.35, { wet: 1 });
    this._tone(t + 0.09, f * 1.5, f * 1.5, 0, 0.025, 0.004, 0.8, { wet: 1 });
  }
  /** a saved image: a shutter, then a drop when the file is ready */
  shutter() {
    if (!this._ok(4)) return;
    const t = this.ctx.currentTime + 0.005;
    this._hiss(t, 0.02, 0.12, { type: 'highpass', f0: 3500, q: 0.7, wet: 0.2 });
    this._tone(t, 180, 120, 0.03, 0.12, 0.002, 0.05, { wet: 0.1 });
    this._hiss(t + 0.075, 0.025, 0.09, { type: 'highpass', f0: 3000, q: 0.7, wet: 0.2 });
  }
  saved() { if (this._ok(5)) this._plink(this.ctx.currentTime + 0.005, 3, 0.16); }
  /** nothing found: a soft low knock */
  miss() {
    if (!this._ok(2)) return;
    const t = this.ctx.currentTime + 0.005;
    this._tone(t, 240, 190, 0.08, 0.1, 0.004, 0.12, { type: 'triangle', wet: 0.2 });
  }
  /** the pointer finds something new to read: the faintest tick */
  hover() {
    if (!this._ok(0, false)) return;
    const t = this.ctx.currentTime + 0.002;
    this._tone(t, 2600, 2400, 0.01, 0.025, 0.002, 0.02, { wet: 0.1 });
  }
  dispose() {
    this._ac.abort();
    if (this.ctx) this.ctx.close().catch(() => {});
    this.ctx = null;
  }
}
