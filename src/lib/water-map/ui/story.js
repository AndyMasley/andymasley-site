import { esc } from './fmt.js';

/**
 * The tour as a scrolling essay: its stops become scenes in a column beside the map, the map stays pinned, and the
 * scene in the middle of the window drives it (Tour.go). Each scene has its own link (#story=<slug>), which opens
 * the page in story mode at that scene.
 */
const slug = (s) => String(s).toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export class Story {
  constructor(app, section) { this.app = app; this.section = section; this.on = false; this.cur = -1; }
  get stops() { return this.app.tour.stops; }
  title(s) { return typeof s.title === 'function' ? s.title() : s.title; }
  /** a name for each scene's link: its title, or its kicker where the title is a number */
  slugs() { return this.stops.map((s) => { const t = this.title(s); return /^\d/.test(t) ? slug(s.kicker) : slug(t); }); }
  indexOf(name) { const k = this.slugs().indexOf(name); return k >= 0 ? k : 0; }
  open(at = 0) {
    if (this.on) { this.scrollTo(at); return; }
    this.on = true;
    const n = this.stops.length, slugs = this.slugs();
    const col = document.createElement('div');
    col.className = 'wm-storycol';
    col.setAttribute('aria-label', 'The map as a story, scene by scene');
    col.innerHTML = `<div class="wm-story-head"><p class="wm-scene-cap">The story, scene by scene</p><button type="button" class="wm-story-x" data-story-close>Back to exploring the map</button></div>`
      + this.stops.map((s, i) => {
        const text = typeof s.text === 'function' ? s.text() : s.text;
        return `<section class="wm-scene" id="scene-${slugs[i]}" data-i="${i}">
          <p class="wm-scene-cap">${i + 1} of ${n} · ${esc(s.kicker)}</p><h2>${esc(this.title(s))}</h2><p>${esc(text)}</p>
          <p class="wm-scene-link"><a href="#story=${slugs[i]}">Link to this scene</a></p></section>`;
      }).join('')
      + `<div class="wm-story-end"><button type="button" class="wm-story-x" data-story-close>Explore the map on your own</button></div>`;
    this.section.prepend(col);
    this.section.classList.add('wm-story-on');
    this.col = col;
    // the scene crossing the middle of the window is the one the map shows
    this.io = new IntersectionObserver((ents) => { for (const e of ents) if (e.isIntersecting) this.show(+e.target.dataset.i); }, { rootMargin: '-45% 0px -50% 0px' });
    for (const el of col.querySelectorAll('.wm-scene')) this.io.observe(el);
    for (const b of col.querySelectorAll('[data-story-close]')) b.addEventListener('click', () => this.close());
    requestAnimationFrame(() => { this.scrollTo(at); this.show(at); });
  }
  show(i) {
    if (!this.on || i === this.cur || i < 0 || i >= this.stops.length) return;
    this.cur = i;
    this.app.sound?.scene(i);
    this.app.tour.go(i);
    try { history.replaceState(history.state, '', `${location.pathname}${location.search}#story=${this.slugs()[i]}`); } catch { /* not allowed here */ }
  }
  scrollTo(i) { const el = this.col && this.col.querySelectorAll('.wm-scene')[i]; if (el) el.scrollIntoView({ block: 'center' }); }
  close() {
    if (!this.on) return;
    this.on = false; this.cur = -1;
    this.io.disconnect(); this.col.remove(); this.col = null;
    this.section.classList.remove('wm-story-on');
    this.app.tour.stop();
    try { history.replaceState(history.state, '', `${location.pathname}${location.search}`); } catch { /* not allowed here */ }
    this.section.scrollIntoView({ block: 'start' });
  }
}
