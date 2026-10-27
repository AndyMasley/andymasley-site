import * as THREE from 'three';
import { CAT, AP_STATE, SRC_DEF, RETURN_GRAY, PIPED_GRAY, riverLabel, lakeLabel, plantLabel, PHONE_MQ } from '../core/config.js';
import { TRANSFERS, IMPORTS } from '../core/transfers.js';
import { DROP_CONSUMED } from '../core/flows_data.js';
import { mulberry32 } from '../flow/particles.js';
import { esc, nf } from './fmt.js';
import { withThe } from './hud.js';

/**
 * Follow a drop: the reader drops a drop of water anywhere and the map follows it to the nearest river and down it,
 * taken or not by chance at every intake it passes, used up or sent back by chance at every use (flow/drop.js), until
 * it reaches the sea, a lake with no outlet or the border, or is used up. A trail draws where it has been, the camera
 * follows it, a caption says what happened at each place, and the panel keeps the whole journey and the odds for a
 * thousand drops from the same spot.
 */

const MI = 0.621371;
const SYS = new Map([...TRANSFERS, ...IMPORTS].map((s) => [s.id, s]));
const RIVER_COL = '#d9f1ff';
const AP = (st) => AP_STATE[st] || st;
/** a river's name for a sentence: "E.  Br.  Delaware" -> "East Branch Delaware" */
const proseName = (nm) => nm.replace(/\s+/g, ' ').replace(/\bFk\./g, 'Fork').replace(/\bBr\./g, 'Branch').replace(/\bR\. des\b/g, 'Rivière des')
  .replace(/\b([NSEWM])\.(?= [A-Z])/g, (_, c) => ({ N: 'North', S: 'South', E: 'East', W: 'West', M: 'Middle' }[c]));
/** a sentence ends with one period, even after "Ky." */
const end = (t) => (/[.!?]$/.test(t) ? t : `${t}.`);
/** "12 miles", "1 mile" */
const miles = (mi) => `${nf(mi)} ${nf(mi) === '1' ? 'mile' : 'miles'}`;
const lin = (hex) => new THREE.Color(hex).convertSRGBToLinear();
// what each kind of ending is called, and its color, in the odds
const ENDS = {
  sea: { color: SRC_DEF.sf.color },
  sink: { color: SRC_DEF.ss.color },
  border: { color: PIPED_GRAY },
  ground: { color: SRC_DEF.gf.color },
  edge: { color: RETURN_GRAY },
  lost: { color: RETURN_GRAY },
};
const USED_BY = { ir: 'crops', go: 'golf courses', pt: 'power plants', ps: 'public supply', in: 'industry' };
// water a measured diversion delivers to wildlife refuges, which is no USGS use (core/flows_data.js DROP_DIVERSIONS)
const XCAT = { wl: { k: 'wl', name: 'Wildlife refuges', color: '#9cc9b4' } };
const catOf = (k) => CAT[k] || XCAT[k];
const FOR_USE = { ps: 'public supply', ir: 'crops', wl: 'wildlife refuges' };

export class DropView {
  /** env: { dm (DropModel), scene, shared, labels, controls, hUnits, surfaceY, slabAt, countyAt, stage, reduceMotion } */
  constructor(app, env) {
    this.app = app; this.env = env; this.dm = env.dm;
    this.on = false; this.jr = null;
    this.group = new THREE.Group(); this.group.name = 'drop';
    env.scene.add(this.group);
    this.trailMat = this._trailMaterial();
    this.dot = this._dot();
    this.group.add(this.dot);
    this.dot.visible = false;
  }
  get hud() { return this.app.hud; }
  dispose() { this._clear(); this.trailMat.dispose(); this.dot.geometry.dispose(); this.dot.material.dispose(); }

  // ------------------------------------------------------------------ mode
  toggle() { if (this.on) this.close(); else this.open(); }
  open() {
    const app = this.app, hud = this.hud;
    if (app.tour && app.tour.i >= 0) app.tour.stop();
    hud.welcomeOff(); hud.hintDone();
    this.on = true;
    this.env.stage.classList.add('wm-dropping');
    hud.syncButtons();
    this._wait();
    this.app.writeHash?.();
    // the rivers' tables, built once (they take a moment)
    if (!this.dm.ready) setTimeout(() => { if (this.on) { this.dm.prepare(); if (!this.jr) this._wait(); } }, 30);
  }
  close(silent = false) {
    if (!this.on) return;
    this.on = false;
    this._clear();
    this.env.stage.classList.remove('wm-dropping');
    const el = this.hud.$('[data-caption]');
    if (this.hud._capKind === 'drop') { el.hidden = true; this.hud._capKind = null; }
    this.hud.syncButtons();
    this.app.writeHash?.();
    if (!silent && this.hud.$('[data-insp]').dataset.kind === 'drop') this.app.clearSelection(true);
  }
  _clear() {
    this.jr = null; this.play = null;
    this.env.labels.removeGroup('drop');
    if (this.trail) { this.group.remove(this.trail); this.trail.geometry.dispose(); this.trail = null; }
    this.dot.visible = false;
    this.app.dropDim?.(false);
  }
  /** the reader moved the map: a zoom sets how close the camera follows; a drag stops it following until asked */
  userMoved(kind) {
    const P = this.play; if (!P || P.done) return;
    if (kind === 'zoom') { P.userD = true; return; }
    if (P.follow) { P.follow = false; this._caption(); }
  }

  // ------------------------------------------------------------------ captions
  _capEl() { return this.hud.$('[data-caption]'); }
  _setCaption(kicker, title, text, buttons) {
    const el = this._capEl();
    el.innerHTML = `<p class="wm-cap">${esc(kicker)}</p>${title ? `<h4>${esc(title)}</h4>` : ''}${text ? `<p>${text}</p>` : ''}
      <div class="wm-cap-nav"><div></div><div class="wm-cap-bs">${buttons.map(([a, t]) => `<button type="button" class="wm-btn" data-d="${a}">${esc(t)}</button>`).join('')}</div></div>`;
    el.hidden = false; this.hud._capKind = 'drop';
    for (const b of el.querySelectorAll('[data-d]')) b.addEventListener('click', () => { this.app.sound?.tap(); this._act(b.dataset.d); });
  }
  _act(a) {
    if (a === 'close') this.close();
    else if (a === 'skip') this._skip();
    else if (a === 'follow') { if (this.play) { this.play.follow = true; this._caption(); } }
    else if (a === 'again' && this.jr) this.dropAt(this.jr.from[0], this.jr.from[1], true);
    else if (a === 'here') { const s = this.env.controls.state; this.dropAt(s.x, s.z, true); }
  }
  _wait() {
    const tap = matchMedia(PHONE_MQ).matches ? 'Tap' : 'Click';
    if (!this.dm.ready) { this._setCaption('Follow a drop', 'Getting the rivers ready', '', [['close', 'Cancel']]); return; }
    this._setCaption('Follow a drop', `${tap} anywhere on the map`,
      `A drop of rain will run to the nearest river and down it. Wherever water is taken out of the river, it may be taken too, by the odds the map’s figures give, and then used up or sent back. ${tap} again to drop another.`,
      [['here', 'Drop one in the middle'], ['close', 'Cancel']]);
  }
  /** the caption for where the journey has got to */
  _caption() {
    const P = this.play; if (!P) return;
    const e = P.shown >= 0 ? P.events[P.shown] : null;
    const btns = P.done ? [['again', 'Drop another here'], ['close', 'Done']] : [...(P.follow ? [] : [['follow', 'Follow the drop']]), ['skip', 'Skip to the end'], ['close', 'Stop']];
    if (!e) { this._setCaption('Follow a drop', '', '', btns); return; }
    // (at the end, what became of a thousand drops from the same spot)
    this._setCaption('Follow a drop', e.title, P.done ? `${esc(e.text)} ${esc(this.oddsLine())}` : esc(e.text), btns);
  }

  // ------------------------------------------------------------------ a journey
  /** a click that starts no journey: say why, and take the last journey's panel down */
  _none(title, text) {
    this.app.sound?.miss();
    if (this.hud.$('[data-insp]').dataset.kind === 'drop') this.hud.showDrop({ none: true, head: title, text });
    this._setCaption('Follow a drop', title, esc(text), [['close', 'Cancel']]);
  }
  /** a click on the map while dropping: a drop there */
  click(g) {
    if (!this.on || !g) return false;
    this.dropAt(g.x, g.z, true);
    return true;
  }
  dropAt(x, z, fresh = false) {
    if (!this.dm.ready) this.dm.prepare();
    const app = this.app, m = app.model;
    this._clear();
    const ci = this.env.countyAt(x, z), N0 = this.dm.netAt(x, z);
    if (!N0) { this._none('The map draws no rivers here', 'It draws the rivers of the lower 48, Alaska and Puerto Rico. Try a spot in one of them.'); return; }
    // (a drop may fall on a lake as well as on land: a named lake beyond the counties, like the Great Lakes, or one the
    // rivers run through, like Lake Tahoe)
    let L0 = -1, lake = -1;
    if (N0.slab.maskAt(x, z) & 2) {
      L0 = this.dm.lakeNear(N0, x, z, 0.5, true);
      if (L0 >= 0 && (ci < 0 || N0.lakeOut.has(L0))) lake = L0;
    }
    if (ci < 0 && L0 < 0) { this._none('Drop it on land in the United States', 'The map follows water from the counties USGS counts, and their lakes. Try again over the land.'); return; }
    const st = this.dm.start(x, z);
    if (st && L0 >= 0) {
      // (a lake the rivers end in, like Great Salt Lake: the drop stays there)
      const e = this.dm.endOf(st), lk = m.features.lakes[L0];
      if (e && e.kind === 'sink' && e.lake === lk.name) {
        const nm = withThe(lakeLabel(lk.name));
        this._none(`It stays in ${nm}`, `${nm.replace(/^the /, 'The ')} has no outlet to the sea, so water that falls on it leaves only by evaporating. Try a spot on land, or on a lake a river runs out of.`);
        return;
      }
    }
    if (st) st.lake = lake >= 0 ? m.features.lakes[lake] : null;
    if (!st) {
      this._none('No river nearby', 'None of the rivers the map draws comes within 40 miles of here. The map draws rivers whose natural flow averages at least 0.8 cubic meters a second. Try a spot nearer one.');
      return;
    }
    app.sound?.drop(Math.max(1, st.N.R.q[st.r] * 22.8));
    const seed = (fresh ? Math.floor(Math.random() * 2 ** 31) : 2015) >>> 0;
    const j = this.dm.walk(st, mulberry32(seed), true);
    const odds = this.dm.odds(st, 1000, seed ^ 0x5bd1e995);
    this.jr = { from: [x, z], st, j, odds, ci };
    this._build();
  }
  /** the journey as a timeline: legs the drop moves along, pauses, and an event (caption, label) at each place */
  _build() {
    const { st, j } = this.jr, N = st.N, kpu = N.slab.mpu / 1000;
    const legs = [], events = [];
    let t = 0;
    const len = (pts) => { let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return L; };
    const move = (pts, col, dur, dash = false, kmFrom = 0, kmTo = 0) => {
      const dense = densify(pts, 0.45);
      if (dense.length < 2) return;
      const L = len(dense) || 1, ts = [];
      let s = 0; ts.push(t);
      for (let i = 1; i < dense.length; i++) { s += Math.hypot(dense[i][0] - dense[i - 1][0], dense[i][1] - dense[i - 1][1]); ts.push(t + dur * s / L); }
      legs.push({ t0: t, t1: t + dur, pts: dense, ts, col, dash, kmFrom, kmTo, L });
      t += dur;
    };
    const hold = (dur) => { legs.push({ t0: t, t1: t + dur, hold: true }); t += dur; };
    const ev = (e) => { events.push({ ...e, t }); };
    const dur = (km, a, b, max) => Math.min(max, a + b * Math.log(1 + km / 40));
    let km = 0, trav = 0, at = [st.x, st.z];
    for (const step of j.steps) {
      if (step.type === 'fall') {
        ev({ ...this._say(step), color: RIVER_COL, at: step.at });
        hold(0.5);
        move(step.path, '#ffffff', step.km > 2 ? 1.0 : 0.5, true);
        at = step.to; trav += step.km;
      } else if (step.type === 'river') {
        const k0 = km; km += step.km; trav += step.km;
        ev({ ...this._sayRiver(step), color: RIVER_COL, quiet: true });
        move(step.path, RIVER_COL, dur(step.km, 1.0, 1.25, 10), false, k0, km);
        at = step.path[step.path.length - 1];
      } else if (step.type === 'take') {
        const s = step.s, col = catOf(s.cat).color;
        ev({ ...this._sayTake(step), color: col, at: step.at, km });
        // to the intake, then along the system's route or to the place the water is used
        const use = this._usePoint(s, step.at);
        const path = [at, step.at, ...(s.route ? s.route.slice(1) : [use])];
        const rk = len(path) * kpu; trav += rk;
        hold(1.4);
        move(path, col, dur(rk, 0.8, 0.9, 6), false);
        at = path[path.length - 1];
        step._use = at;
      } else if (step.type === 'use') {
        ev({ ...this._sayUse(step), color: catOf(step.s.cat).color, at, km, end: step.consumed });
        hold(step.consumed ? 0.4 : 2.0);
      } else if (step.type === 'back') {
        const to = step.to;
        if (to.x != null) { move([at, [to.x, to.z]], RETURN_GRAY, 0.9, true); trav += len([at, [to.x, to.z]]) * kpu; at = [to.x, to.z]; }
      }
    }
    const fin = j.end;
    if (fin.kind !== 'consumed') ev({ ...this._sayEnd(fin, trav, j), color: (ENDS[fin.kind] || ENDS.lost).color, at: fin.x != null ? [fin.x, fin.z] : at, km, end: true });
    else events[events.length - 1].end = true;
    this.play = { t: 0, T: t, legs, events, shown: -1, km: 0, follow: true, done: false, vapor: fin.kind === 'consumed', dGoal: null };
    this._trail(legs, N);
    this.dot.visible = true;
    this.dot.material.uniforms.uAlpha.value = 1;
    this.app.dropDim?.(true);
    this._panel(false);
    // reduced motion: the whole journey at once
    if (this.env.reduceMotion) this._skip();
  }

  // ------------------------------------------------------------------ the words
  /** a place: "Mesa County, Colo." */
  place(i) { const m = this.app.model; return i >= 0 ? `${m.wu.name[i]}, ${AP(m.wu.st[i])}` : ''; }
  river(nm) { return nm ? withThe(riverLabel(proseName(nm))) : null; }
  /** a city's state, the AP way (the map's cities carry the state's full name) */
  apState(name) {
    if (!this._ap) { this._ap = {}; for (const k of Object.keys(AP_STATE)) this._ap[this.app.stateName ? this.app.stateName(k) : k] = AP_STATE[k]; }
    return this._ap[name] || AP(name);
  }
  /** the river a reach is on, or the first named one downstream of it */
  riverAt(N, r) {
    const R = N.R;
    for (let k = r, g = 0; k >= 0 && g < 400; k = R.next[k], g++) if (R.name[k]) return { nm: R.names[R.name[k] - 1], here: k === r };
    return null;
  }
  /** a city near a point, or the county it is in */
  near(x, z) {
    const m = this.app.model, sl = this.env.slabAt(x, z), kpu = sl ? sl.mpu / 1000 : 5.135;
    let best = null, bd = 25 / kpu;
    for (const c of m.features.cities) { const d = Math.hypot(c.x - x, c.z - z); if (d < bd) { bd = d; best = c; } }
    const ci = this.env.countyAt(x, z);
    return best ? `near ${best.name}, ${this.apState(best.st)}` : ci >= 0 ? `in ${this.place(ci)}` : '';
  }
  _say(step) {
    const N = step.N, rv = this.riverAt(N, step.r), where = this.near(step.at[0], step.at[1]);
    const lk = this.jr && this.jr.st.lake;
    if (lk) return { title: `A drop falls on ${withThe(lakeLabel(lk.name))}`, text: 'It drifts with the water flowing through the lake toward its outlet.', log: true };
    const into = !rv ? 'a stream' : rv.here ? this.river(rv.nm) : `a stream that runs into ${this.river(rv.nm)}`;
    const mi = step.km * MI;
    const text = mi < 1.5 ? `It runs into ${into}.` : `It runs ${miles(mi)} to ${into}, the nearest river the map draws.`;
    return { title: `A drop falls ${where}`.trim(), text, log: true };
  }
  _sayRiver(step) {
    // the rivers and lakes passed: the first, and any other more than 25 km long (the many rivers the map has no name
    // for are "a stream", so the miles are not all put down to the named ones)
    const main = [];
    for (const q of step.names) {
      const nm = q.name ? (q.lake ? `across ${withThe(lakeLabel(q.name))}` : this.river(q.name)) : 'a stream';
      if (main[main.length - 1] === nm) continue;
      if (main.length ? q.km > 25 : q.name || q.km > 5) main.push(nm);
    }
    const mi = step.km * MI;
    const say = (x) => (x.startsWith('across') ? x : `down ${x}`);
    // (a long way, through many rivers and lakes: the first two and the last)
    const long = main.length > 4, parts = long ? [main[0], main[1], main[main.length - 1]] : main;
    const down = parts.length ? parts.map((x, i) => (long && i === parts.length - 1 ? `and on ${say(x)}` : say(x))).join(', then ').replace(', then and on', ', and on') : 'downstream';
    const first = main.find((x) => x !== 'a stream') || main[0];
    const title = first ? (first.startsWith('across') ? first.replace(/^across/, 'Across') : `Down ${first}`) : 'Downstream';
    return { title, text: parts.length > 1 ? `${miles(mi)} in all, ${down}.` : `${miles(mi)} ${down}.`, log: true, mi };
  }
  _odds(p) {
    if (p >= 0.995) return 'Intakes here take all the water left in the river, by the map’s figures.';
    if (p >= 0.05) return `Intakes here take ${Math.round(100 * p)} percent of the water flowing past, by the map’s figures.`;
    return `Intakes here take about 1 gallon in ${nf(sig(1 / p))} of the water flowing past, by the map’s figures.`;
  }
  _sayTake(step) {
    const s = step.s, where = this.place(s.county);
    const routed = s.route ? len(s.route) * (step.N.slab.mpu / 1000) * MI : 0;
    let title, how = '';
    const from = step.lake && !s.route ? ` from ${withThe(lakeLabel(step.lake.name))}` : '';
    if (s.div) {
      title = `Taken into ${withThe(s.div.aq)}`;
      how = `It carries the water ${miles(routed)}${s.who && s.who !== s.div.who ? ` for ${s.who}` : ''} to ${where}, for ${FOR_USE[s.cat] || 'crops'}.`;
    } else if (s.route) {
      const sys = SYS.get(s.xfer);
      title = `Taken into ${sys ? sys.name : 'a city’s water system'}`;
      how = end(`It is piped ${miles(routed)} to ${where}${s.imp ? `, for ${s.cat === 'ps' ? 'public supply' : 'crops'}` : ''}`);
    } else if (s.cat === 'pt' && s.plant) {
      const p = s.plant;
      title = `Taken${from} to cool ${p.name ? withThe(plantLabel(p)) : `a power plant in ${where}`}`;
      how = p.name ? end(`The plant is in ${this.place(p.loc_county ?? p.county)}`) : '';
    } else {
      const what = { ps: `for public supply in ${where}`, ir: `to water crops in ${where}`, go: `to water golf courses in ${where}`, in: `by industry in ${where}`, aq: `by a fish farm in ${where}`, mi: `for mining in ${where}`, li: `for livestock in ${where}`, do: `for homes in ${where}` }[s.cat];
      title = `Taken${from} ${what}`;
    }
    return { title, text: `${this._odds(step.p)} ${how}`.trim(), log: true };
  }
  _sayUse(step) {
    const s = step.s, where = this.place(s.county), pctTxt = `${Math.round(100 * step.share)} percent`;
    const back = this.jr && this._backName(step);
    if (s.cat === 'wl') return { title: `Back to ${back || 'the river'}`, text: 'The refuges flood wetlands for migrating birds. The map has no figure for how much of the water they use up, so it sends it back.', log: true };
    if (!step.est) {
      const who = { aq: 'fish farms', li: 'livestock', mi: 'mines', do: 'homes with their own intakes' }[s.cat] || 'this use';
      const note = s.cat === 'aq' ? ' USGS notes that much of the river water fish farms use runs through their raceways and back.' : '';
      return { title: `Back to ${back || 'the river'}`, text: `USGS has not estimated how much of the water ${who} take is used up, so the map sends it back.${note}`, log: true };
    }
    if (s.cat === 'pt') {
      const p = s.plant || {}, tower = /TOWER/.test(p.cooling || ''), pond = /POND/.test(p.cooling || '');
      const share = `The plant consumes ${pctTxt} of the water it withdraws, by the USGS plant model.`;
      if (step.consumed) return { title: tower ? 'It evaporates in the cooling towers' : pond ? 'It evaporates from the cooling pond' : 'The plant’s heat evaporates it', text: tower || pond ? share : `Water that passes through once goes back warmer, and some of it evaporates from the river. ${share}`, log: true };
      return { title: `Back to ${back || 'the river'}`, text: `After cooling the plant it goes back${tower || pond ? '' : ', warmer'}. ${share}`, log: true };
    }
    if (s.cat === 'ir' || s.cat === 'go') {
      const field = s.cat === 'ir' ? 'crops' : 'golf courses';
      const share = `${s.cat === 'ir' ? 'Crops' : 'Golf courses'} in ${where}, consumed ${pctTxt} of the water they got in 2015, by USGS’s estimate.`;
      if (step.consumed) return { title: s.cat === 'ir' ? 'It evaporates from the fields' : 'It evaporates from the course', text: `It evaporates or is transpired by the plants. ${share}`, log: true };
      return { title: `Back to ${back || 'the river'}`, text: `It soaks past the roots or runs off, and makes its way back. ${share}`, log: true };
    }
    const d = DROP_CONSUMED[s.cat];
    if (s.cat === 'ps') {
      const share = `USGS estimates that about ${Math.round(100 * d.share)} percent of public-supply water is used up, more in dry places, where more of it waters lawns and gardens.`;
      if (step.consumed) return { title: `Used up in ${where}`, text: `It never comes back down a drain. ${share}`, log: true };
      return { title: `Back to ${back || 'the river'}`, text: `It goes down a drain to a wastewater plant, which returns it. ${share}`, log: true };
    }
    const share = `Studies USGS gathered put the share industry uses up at about ${Math.round(100 * d.share)} percent.`;
    if (step.consumed) return { title: 'Used up by industry', text: `It evaporates or goes into a product. ${share}`, log: true };
    return { title: `Back to ${back || 'the river'}`, text: `It goes back after its use. ${share}`, log: true };
  }
  /** the river, or sea, a used drop goes back to */
  _backName(step) {
    const steps = this.jr.j.steps, i = steps.indexOf(step), b = steps[i + 1];
    if (!b || b.type !== 'back') return null;
    const to = b.to;
    if (to.sea) return to.sea;
    if (to.ground) return 'the ground';
    const rv = this.riverAt(to.N, to.r);
    return rv ? (rv.here ? this.river(rv.nm) : `a stream that runs into ${this.river(rv.nm)}`) : 'a stream';
  }
  _sayEnd(end, km, j) {
    const mi = miles(km * MI), used = j.uses ? ` It was taken out of a river ${j.uses === 1 ? 'once' : `${j.uses} times`} on the way.` : '';
    if (end.kind === 'sea') return { title: `It reaches ${end.name}`, text: `${end.viaUse ? 'Its last use sent it out to sea. ' : ''}It has come ${mi} from where it fell.${used}`, log: true };
    if (end.kind === 'sink') {
      const L = end.lake ? withThe(lakeLabel(end.lake)) : null;
      return L ? { title: `It reaches ${L}`, text: `${L.replace(/^the /, 'The ')} has no outlet to the sea, and water leaves it by evaporating. The drop has come ${mi}.${used}`, log: true }
        : { title: 'The river ends', text: `The rivers the map draws end here, short of the sea, in a basin with no outlet. The drop has come ${mi}.${used}`, log: true };
    }
    if (end.kind === 'border') return { title: `It crosses into ${end.country}`, text: `The map’s figures stop at the border. The drop has come ${mi}.${used}`, log: true };
    if (end.kind === 'ground') return { title: 'It soaks into the ground', text: `Its last use left it on land away from the rivers the map draws, and the map loses track of it.${used}`, log: true };
    if (end.kind === 'edge') return { title: 'It runs off the edge of the map', text: `The drop has come ${mi}.${used}`, log: true };
    return { title: 'The map loses track of it', text: '', log: true };
  }
  /** where a stream's water is used, for the drop to go to: a plant, a utility's works, the fields nearest the intake */
  _usePoint(s, from) {
    if (s.plant) return [s.plant.x, s.plant.z];
    const to = s.to || [];
    if (!to.length) return from;
    let best = to[0], bd = Infinity;
    for (const p of to) { const d = Math.hypot(p[0] - from[0], p[1] - from[1]); if (d < bd) { bd = d; best = p; } }
    return [best[0], best[1]];
  }

  // ------------------------------------------------------------------ the odds
  oddsRows() {
    const o = this.jr.odds, rows = [];
    for (const e of o.ends.values()) {
      let name, color;
      if (e.kind === 'consumed') { name = `Used up by ${USED_BY[e.cat] || CAT[e.cat].name.toLowerCase()}`; color = CAT[e.cat].color; }
      else if (e.kind === 'sea') { name = `Reached ${e.name}`; color = ENDS.sea.color; }
      else if (e.kind === 'sink') { name = e.name ? `Reached ${withThe(lakeLabel(e.name))}, which has no outlet` : 'Reached the end of a river with no outlet'; color = ENDS.sink.color; }
      else if (e.kind === 'border') { name = `Crossed into ${e.name}`; color = ENDS.border.color; }
      else if (e.kind === 'ground') { name = 'Soaked into the ground after a use'; color = ENDS.ground.color; }
      else { name = 'Ran off the map'; color = ENDS.edge.color; }
      rows.push({ name, color, v: e.count, round: e.kind !== 'consumed' });
    }
    return rows.sort((a, b) => b.v - a.v);
  }
  oddsLine() {
    const o = this.jr.odds, all = [...o.ends.values()].sort((a, b) => b.count - a.count);
    const rows = all.filter((e, i) => i === 0 || e.count / o.n >= 0.01).slice(0, 3), rest = o.n - rows.reduce((a, e) => a + e.count, 0);
    const p = (v) => { const f = (100 * v) / o.n; return f < 1 ? 'fewer than 1 percent' : f > 99 && v < o.n ? 'more than 99 percent' : `${Math.round(f)} percent`; };
    const say = (e) => {
      if (e.kind === 'consumed') return `${p(e.count)} were used up by ${USED_BY[e.cat] || CAT[e.cat].name.toLowerCase()}`;
      if (e.kind === 'sea') return `${p(e.count)} reached ${e.name}`;
      if (e.kind === 'sink') return `${p(e.count)} ${e.name ? `reached ${withThe(lakeLabel(e.name))}` : 'ended in a basin with no outlet'}`;
      if (e.kind === 'border') return `${p(e.count)} crossed into ${e.name}`;
      if (e.kind === 'ground') return `${p(e.count)} soaked into the ground after a use`;
      return `${p(e.count)} ran off the map`;
    };
    const parts = rows.map(say);
    if (rest > 0) parts.push(`${p(rest)} ended some other way`);
    const list = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts[0];
    return `Of ${nf(o.n)} drops from here, by the map’s figures, ${list}.`;
  }

  // ------------------------------------------------------------------ the panel
  _panel(done) {
    if (!this.jr) return;
    const P = this.play, shown = P ? P.events.slice(0, Math.max(0, P.shown + 1)).filter((e) => e.log) : [];
    const { st, odds } = this.jr, N = st.N, rv = this.riverAt(N, st.r);
    // (named for where the drop fell, as its first line is)
    const where = this.near(st.from[0], st.from[1]);
    const head = st.lake && st.lake.name ? `From ${withThe(lakeLabel(st.lake.name))}` : rv ? `From ${this.river(rv.nm)} ${where}` : `From a stream ${where}`;
    this.hud.showDrop({
      head, done, log: shown.map((e) => ({ title: e.title, text: e.text, color: e.color })),
      rows: this.oddsRows(), n: odds.n, used: odds.used, uses: odds.uses, dry: odds.dry,
      again: () => this._act('again'),
    });
  }

  // ------------------------------------------------------------------ drawing
  _trailMaterial() {
    const sh = this.env.shared;
    return new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, depthTest: false, side: THREE.DoubleSide, premultipliedAlpha: true,
      uniforms: { uExag: sh.uExag, uViewport: sh.uViewport, uMpu: { value: 5135 }, uHead: { value: 0 }, uWidth: { value: 3.5 } },
      vertexShader: /* glsl */`
        uniform float uExag, uMpu, uWidth;
        uniform vec2 uViewport;
        attribute vec2 aDir; attribute float aSide, aT, aDash; attribute vec3 aCol;
        varying float vT, vSide, vDash; varying vec3 vCol;
        void main() {
          vec3 P = vec3(position.x, max(position.y, 0.0) * uExag / uMpu, position.z);
          vec4 mv = viewMatrix * vec4(P, 1.0);
          mv.xyz *= 0.994;
          vec4 c0 = projectionMatrix * mv;
          vec3 dirV = (viewMatrix * vec4(aDir.x, 0.0, aDir.y, 0.0)).xyz;
          vec4 c1 = projectionMatrix * (mv + vec4(dirV * max(0.05, -mv.z * 0.01), 0.0));
          vec2 s0 = c0.xy / c0.w * uViewport, s1 = c1.xy / c1.w * uViewport;
          vec2 d = s1 - s0; float dl = length(d); d = dl > 1e-5 ? d / dl : vec2(1.0, 0.0);
          vec2 nrm = vec2(-d.y, d.x);
          c0.xy += nrm * aSide * (uWidth * 0.5 + 1.5) * 2.0 / uViewport * c0.w;
          gl_Position = c0;
          vT = aT; vSide = aSide; vDash = aDash; vCol = aCol;
        }`,
      fragmentShader: /* glsl */`
        uniform float uHead, uWidth;
        varying float vT, vSide, vDash; varying vec3 vCol;
        void main() {
          if (vT > uHead) discard;
          float px = abs(vSide) * (uWidth * 0.5 + 1.5);
          float body = 1.0 - smoothstep(uWidth * 0.5 - 0.5, uWidth * 0.5 + 0.5, px);
          float casing = 1.0 - smoothstep(uWidth * 0.5 + 0.6, uWidth * 0.5 + 1.5, px);
          // water piped or going back is dashed
          if (vDash > 0.5 && fract(vT * 4.0) > 0.55) body = 0.0;
          // the newest stretch is brightest
          float fresh = smoothstep(uHead - 2.0, uHead, vT);
          vec3 col = mix(vCol, vec3(1.0), 0.3 * fresh);
          float a = body * (0.8 + 0.2 * fresh), ac = max(0.0, casing - body) * 0.75;
          gl_FragColor = vec4(col * a, a + ac);
        }`,
    });
  }
  _trail(legs, N) {
    if (this.trail) { this.group.remove(this.trail); this.trail.geometry.dispose(); this.trail = null; }
    const slab = N.slab;
    let nv = 0; for (const lg of legs) if (!lg.hold) nv += 2 * lg.pts.length;
    if (!nv) return;
    const pos = new Float32Array(nv * 3), dir = new Float32Array(nv * 2), side = new Float32Array(nv), tt = new Float32Array(nv), dash = new Float32Array(nv), col = new Float32Array(nv * 3);
    const idx = [];
    let v = 0;
    for (const lg of legs) {
      if (lg.hold) continue;
      const c = lin(lg.col), n = lg.pts.length, base = v;
      for (let k = 0; k < n; k++) {
        const a = lg.pts[Math.max(0, k - 1)], b = lg.pts[Math.min(n - 1, k + 1)];
        let dx = b[0] - a[0], dz = b[1] - a[1]; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
        const [x, z] = lg.pts[k], h = slab.contains(x, z) ? Math.max(0, slab.sampleH(x, z)) : 0;
        for (const sd of [-1, 1]) {
          pos.set([x, h, z], 3 * v); dir.set([dx, dz], 2 * v); side[v] = sd; tt[v] = lg.ts[k]; dash[v] = lg.dash ? 1 : 0; col.set([c.r, c.g, c.b], 3 * v);
          v++;
        }
        if (k < n - 1) { const q = base + 2 * k; idx.push(q, q + 1, q + 2, q + 2, q + 1, q + 3); }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aDir', new THREE.BufferAttribute(dir, 2));
    g.setAttribute('aSide', new THREE.BufferAttribute(side, 1));
    g.setAttribute('aT', new THREE.BufferAttribute(tt, 1));
    g.setAttribute('aDash', new THREE.BufferAttribute(dash, 1));
    g.setAttribute('aCol', new THREE.BufferAttribute(col, 3));
    g.setIndex(v > 65000 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(430, 0, 320), 3000);
    this.trailMat.uniforms.uMpu.value = slab.mpu;
    this.trailMat.uniforms.uHead.value = 0;
    const mesh = new THREE.Mesh(g, this.trailMat);
    mesh.frustumCulled = false; mesh.renderOrder = 40;
    this.trail = mesh; this.group.add(mesh);
  }
  _dot() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3));
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, depthTest: false,
      uniforms: { uSize: { value: 18 }, uAlpha: { value: 1 } },
      vertexShader: /* glsl */`
        uniform float uSize;
        void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_PointSize = uSize; }`,
      fragmentShader: /* glsl */`
        uniform float uAlpha;
        void main() {
          vec2 q = gl_PointCoord * 2.0 - 1.0; float r = length(q);
          if (r > 1.0) discard;
          // a bright drop with a dark edge, so it reads over city lights and pale land alike
          float core = 1.0 - smoothstep(0.34, 0.44, r);
          float edge = (1.0 - smoothstep(0.50, 0.62, r)) * (1.0 - core);
          float glow = (1.0 - smoothstep(0.55, 1.0, r)) * 0.28;
          vec3 c = mix(vec3(0.55, 0.82, 1.0), vec3(1.0), smoothstep(0.30, 0.0, r));
          float a = core + glow * (1.0 - edge);
          vec3 col = c * core + vec3(0.55, 0.82, 1.0) * glow * (1.0 - edge);
          gl_FragColor = vec4(col * uAlpha, (a + edge * 0.85) * uAlpha);
        }`,
    });
    mat.premultipliedAlpha = true;
    const p = new THREE.Points(g, mat);
    p.frustumCulled = false; p.renderOrder = 41;
    return p;
  }
  /** the drop's place at time t: along the leg it is on, or where it stopped */
  _at(t) {
    const P = this.play; let last = null;
    for (const lg of P.legs) {
      if (lg.hold) continue;
      if (t < lg.t0) break;
      last = lg;
      if (t <= lg.t1) {
        const ts = lg.ts; let lo = 0, hi = ts.length - 1;
        while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (ts[mid] <= t) lo = mid; else hi = mid; }
        const f = ts[hi] > ts[lo] ? (t - ts[lo]) / (ts[hi] - ts[lo]) : 0;
        const a = lg.pts[lo], b = lg.pts[hi];
        return { x: a[0] + (b[0] - a[0]) * f, z: a[1] + (b[1] - a[1]) * f, lg, u: (t - lg.t0) / (lg.t1 - lg.t0 || 1) };
      }
    }
    if (last) { const p = last.pts[last.pts.length - 1]; return { x: p[0], z: p[1], lg: last, u: 1 }; }
    const p0 = this.jr.from; return { x: p0[0], z: p0[1], lg: null, u: 0 };
  }
  _skip() {
    const P = this.play; if (!P) return;
    P.t = P.T;
    this._advance(0, true);
    // the whole journey in view
    const xs = [], zs = [];
    for (const lg of P.legs) if (!lg.hold) for (const p of lg.pts) { xs.push(p[0]); zs.push(p[1]); }
    if (xs.length) this.app.fitBox(Math.min(...xs) - 1, Math.max(...xs) + 1, Math.min(...zs) - 1, Math.max(...zs) + 1, { minD: 30, maxD: 1400 });
  }
  /** move the journey on by dt seconds: the drop, its trail, the captions and the panel */
  update(dt) {
    const P = this.play; if (!P || P.done) return;
    P.t = Math.min(P.T, P.t + dt);
    this._advance(dt, false);
  }
  _advance(dt, jump) {
    const P = this.play, env = this.env;
    // events reached
    let changed = false;
    while (P.shown + 1 < P.events.length && P.events[P.shown + 1].t <= P.t + 1e-6) {
      P.shown++; changed = true;
      const e = P.events[P.shown];
      if (e.km != null) P.km = e.km;
      if (e.at && !e.quiet) this._label(e);
    }
    const pos = this._at(P.t);
    if (pos.lg && pos.lg.kmTo > pos.lg.kmFrom) P.km = pos.lg.kmFrom + (pos.lg.kmTo - pos.lg.kmFrom) * Math.min(1, pos.u);
    this.trailMat.uniforms.uHead.value = P.t;
    // the drop, a little above the ground; consumed water rises and fades at the end
    const y = env.surfaceY(pos.x, pos.z), lift = Math.max(0.02, env.controls.state.d * 0.004);
    let fade = 1, rise = 0;
    if (P.t >= P.T - 1e-6 && P.vapor) { P.fadeT = (P.fadeT || 0) + (jump ? 1 : dt); fade = Math.max(0, 1 - P.fadeT / 1.2); rise = P.fadeT * env.controls.state.d * 0.02; }
    const a = this.dot.geometry.attributes.position; a.setXYZ(0, pos.x, y + lift + rise, pos.z); a.needsUpdate = true;
    this.dot.material.uniforms.uAlpha.value = fade;
    this.dot.material.uniforms.uSize.value = 18 * Math.min(2, window.devicePixelRatio || 1);
    // the camera follows: closer at a place where something happens, further out on a long river
    if (P.follow && !jump) {
      const lg = pos.lg, g = env.controls.goal;
      const want = !lg || lg.L == null ? 60 : Math.min(900, Math.max(45, (lg.L || 1) * 0.5));
      const holding = P.legs.some((l) => l.hold && P.t >= l.t0 && P.t < l.t1);
      const goalD = holding ? Math.min(want, 70) : want;
      // (once the reader zooms, the camera keeps the distance they chose)
      if (P.userD) P.dGoal = g.d;
      else { P.dGoal = P.dGoal == null ? env.controls.state.d : P.dGoal + (goalD - P.dGoal) * (1 - Math.exp(-dt * 1.2)); g.d = P.dGoal; }
      g.x = pos.x; g.z = pos.z + P.dGoal * 0.06;
      if (g.tilt < 0.7) g.tilt += (0.75 - g.tilt) * (1 - Math.exp(-dt * 1.5));
    }
    if (P.t >= P.T - 1e-6 && !P.done && (!P.vapor || jump || (P.fadeT || 0) >= 1.2)) { P.done = true; changed = true; if (P.vapor) this.dot.visible = false; }
    if (changed) {
      const phone = matchMedia(PHONE_MQ).matches;
      if (phone && P.done) { const el = this._capEl(); el.hidden = true; this.hud._capKind = null; } else this._caption();
      if (!phone || P.done) this._panel(P.done);
    }
  }
  _label(e) {
    const html = `<i class="wm-sw" style="background:${e.color}"></i>${esc(e.title)}`;
    this.env.labels.add({ html, cls: 'trace use box drop', anchor: 'dot', color: e.color, x: e.at[0], z: e.at[1], h: this.env.hUnits(e.at[0], e.at[1]), group: 'drop', pri: 960 + this.play.shown, dmin: 0, dmax: 4000, must: e.end, lead: true, gap: 7, shift: 2 });
  }
}

function len(pts) { let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return L; }
function densify(pts, step) {
  const out = [pts[0]];
  for (let q = 1; q < pts.length; q++) {
    const a = out[out.length - 1], b = pts[q], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (L < 1e-6) continue;
    const n = Math.max(1, Math.ceil(L / step));
    for (let k = 1; k <= n; k++) out.push(k === n ? [b[0], b[1]] : [a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]);
  }
  return out;
}
/** two significant figures, for "1 gallon in 240" */
function sig(v) { if (!(v > 0)) return 0; const p = Math.pow(10, Math.max(0, Math.floor(Math.log10(v)) - 1)); return Math.round(v / p) * p; }
