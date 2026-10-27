import * as THREE from 'three';
import { fetchJSON, fetchPixels } from '../core/assets.js';

/**
 * NLCD land cover up close. The MRLC National Land Cover Database (2021 for the lower 48, 2016 Alaska, 2001 Hawaii and
 * Puerto Rico) was sampled at about 250 m and reprojected onto each slab at three times the colour texture's resolution
 * (~262 m on the lower 48), then cut into 512-pixel tiles packed 4x4 into lossless WebP sheets. Tiles near the view
 * are copied into one texture array; a small index texture per slab says which layer holds which tile.
 *
 * Classes (compact index): 0 none, 1 open water, 2 ice/snow, 3-6 developed (open, low, medium, high intensity),
 * 7 barren, 8 deciduous forest, 9 evergreen forest, 10 mixed forest, 11 dwarf scrub, 12 shrub/scrub, 13 grassland,
 * 14 sedge, 15 lichens, 16 moss, 17 pasture/hay, 18 cultivated crops, 19 woody wetlands, 20 emergent wetlands.
 *
 * On the lower 48 (the manifest says irr: 7) each byte also carries how much of the pixel LANID mapped as irrigated
 * in 2015, in eighths from 0 to 7, in its top three bits: byte = class + 32 * level.
 */
export const NLCD_CLASSES = ['No data', 'Open water', 'Perennial ice or snow', 'Developed, open space', 'Developed, low intensity', 'Developed, medium intensity',
  'Developed, high intensity', 'Barren land', 'Deciduous forest', 'Evergreen forest', 'Mixed forest', 'Dwarf scrub', 'Shrub and scrub', 'Grassland',
  'Sedge', 'Lichens', 'Moss', 'Pasture and hay', 'Cultivated crops', 'Woody wetlands', 'Emergent wetlands'];

const TILE = 512;
const ATLAS = 8;                  // 8 x 8 slots of 512 px: one 4096 px single-channel atlas (16 MB)
const MAX_LAYERS = ATLAS * ATLAS;

export class NlcdTiles {
  constructor(slabs, renderer) {
    this.slabs = slabs; this.renderer = renderer;
    const n = TILE * ATLAS;
    this.arr = new THREE.DataTexture(new Uint8Array(n * n), n, n, THREE.RedFormat, THREE.UnsignedByteType);
    this.arr.minFilter = this.arr.magFilter = THREE.NearestFilter; this.arr.generateMipmaps = false;
    this.arr.unpackAlignment = 1; this.arr.flipY = false;
    this.arr.needsUpdate = true;
    this.src = new THREE.DataTexture(new Uint8Array(TILE * TILE), TILE, TILE, THREE.RedFormat, THREE.UnsignedByteType);
    this.src.unpackAlignment = 1;
    this.cpu = [];                                     // CPU copy of each slot, for tooltips
    this.layers = new Array(MAX_LAYERS).fill(null);   // { slab, tx, ty, used }
    this.per = new Map();      // slab name -> { info, idx: DataTexture, grid: Vector4 }
    this.sheets = new Map();   // key -> Promise<Uint8Array (R channel, 2048^2)> or data
    this.loading = 0;
    this.ready = false;
    this.version = 0;
  }
  async load() {
    try { this.man = await fetchJSON('nlcd/manifest.json'); } catch (e) { console.warn('NLCD tiles unavailable', e); return this; }
    for (const s of this.slabs) {
      const info = this.man[s.name]; if (!info) continue;
      const tx = info.nsx * info.per, ty = info.nsy * info.per;
      const data = new Uint8Array(tx * ty * 4);
      const idx = new THREE.DataTexture(data, tx, ty, THREE.RGBAFormat, THREE.UnsignedByteType);
      idx.minFilter = idx.magFilter = THREE.NearestFilter; idx.generateMipmaps = false; idx.needsUpdate = true;
      const have = new Set();
      for (const sh of info.sheets) for (const t of sh.tiles) have.add(`${sh.sx * info.per + (t % info.per)},${sh.sy * info.per + Math.floor(t / info.per)}`);
      this.per.set(s.name, { info, idx, tx, ty, have, slab: s, grid: new THREE.Vector4(tx, ty, info.w3 / s.texW, TILE) });
    }
    this.ready = true;
    return this;
  }
  uniformsFor(slab) {
    const p = this.per.get(slab.name);
    return { uNlcdArr: { value: this.arr }, uNlcdIdx: { value: p ? p.idx : null }, uNlcdGrid: { value: p ? p.grid : new THREE.Vector4(0, 0, 3, TILE) }, uNlcdHas: { value: p ? 1 : 0 },
      uNlcdIrr: { value: p && p.info.irr ? 1 : 0 } };
  }
  _sheet(slabName, sx, sy) {
    const key = `${slabName}_${sx}_${sy}`;
    let s = this.sheets.get(key);
    if (!s) {
      s = { key, data: null, p: null, last: performance.now() };
      this.sheets.set(key, s);
      this.loading++;
      s.p = fetchPixels(`nlcd/${key}.webp`).then(({ w, h, px }) => {
        const r = new Uint8Array(w * h);
        for (let i = 0, j = 0; i < w * h; i++, j += 4) r[i] = px[j];
        s.data = r; s.w = w;
        this.loading--;
        // keep at most eight decoded sheets on the CPU
        if (this.sheets.size > 8) {
          const old = [...this.sheets.values()].filter((q) => q.data && q !== s).sort((a, b) => a.last - b.last);
          while (this.sheets.size > 8 && old.length) this.sheets.delete(old.shift().key);
        }
      }).catch((e) => { this.loading--; console.warn('NLCD sheet', key, e); s.failed = true; });
    }
    s.last = performance.now();
    return s;
  }
  /** load the tiles under a disc around (x, z) when the camera is close enough to see them */
  update(x, z, d) {
    if (!this.ready || d > 190) return;
    const R = Math.min(90, Math.max(14, d * 1.15));
    for (const [name, p] of this.per) {
      const s = p.slab;
      if (!s.contains(x, z, R)) continue;
      const k = (s.ppu * p.grid.z) / TILE;   // tiles per world unit
      const t0x = Math.floor((x - R - s.x0) * k), t1x = Math.floor((x + R - s.x0) * k);
      const t0y = Math.floor((z - R - s.z0) * k), t1y = Math.floor((z + R - s.z0) * k);
      const want = [];
      for (let ty = Math.max(0, t0y); ty <= Math.min(p.ty - 1, t1y); ty++) for (let tx = Math.max(0, t0x); tx <= Math.min(p.tx - 1, t1x); tx++) {
        if (!p.have.has(`${tx},${ty}`)) continue;
        const cx = s.x0 + (tx + 0.5) / k, cz = s.z0 + (ty + 0.5) / k;
        want.push([Math.hypot(cx - x, cz - z), tx, ty]);
      }
      want.sort((a, b) => a[0] - b[0]);
      let uploads = 0;
      for (const [dist, tx, ty] of want) {
        const li = this.layers.findIndex((l) => l && l.slab === name && l.tx === tx && l.ty === ty);
        if (li >= 0) { this.layers[li].used = performance.now(); this.layers[li].dist = dist; continue; }
        if (uploads >= 2) continue;   // spread the uploads over frames
        const sx = Math.floor(tx / p.info.per), sy = Math.floor(ty / p.info.per);
        const sh = this._sheet(name, sx, sy);
        if (!sh.data) continue;
        // a free layer, or the least useful one (farthest from the view, then oldest)
        let slot = this.layers.indexOf(null);
        if (slot < 0) {
          let best = -1, score = -Infinity;
          const now = performance.now();
          this.layers.forEach((l, i) => { const sc = (now - l.used) / 1000 + (l.slab === name ? Math.hypot(s.x0 + (l.tx + 0.5) / k - x, s.z0 + (l.ty + 0.5) / k - z) : 1e4); if (sc > score) { score = sc; best = i; } });
          if (best < 0) continue;
          const old = this.layers[best];
          const op = this.per.get(old.slab);
          op.idx.image.data[(old.ty * op.tx + old.tx) * 4] = 0; op.idx.needsUpdate = true;
          slot = best;
        }
        const lx = (tx % p.info.per) * TILE, ly = (ty % p.info.per) * TILE;
        const dst = this.src.image.data, W = sh.w;
        for (let j = 0; j < TILE; j++) dst.set(sh.data.subarray((ly + j) * W + lx, (ly + j) * W + lx + TILE), j * TILE);
        this.cpu[slot] = dst.slice();
        this.renderer.copyTextureToTexture(new THREE.Vector2((slot % ATLAS) * TILE, Math.floor(slot / ATLAS) * TILE), this.src, this.arr);
        this.layers[slot] = { slab: name, tx, ty, used: performance.now(), dist };
        p.idx.image.data[(ty * p.tx + tx) * 4] = slot + 1; p.idx.needsUpdate = true;
        uploads++;
        this.version++;
      }
    }
  }
  /** the byte under a world point, when its tile is loaded: class + 32 x LANID level on the lower 48 */
  _byteAt(slab, x, z) {
    const p = this.per.get(slab.name); if (!p) return -1;
    const px = (x - slab.x0) * slab.ppu * p.grid.z, pz = (z - slab.z0) * slab.ppu * p.grid.z;
    const tx = Math.floor(px / TILE), ty = Math.floor(pz / TILE);
    if (tx < 0 || ty < 0 || tx >= p.tx || ty >= p.ty) return -1;
    const li = p.idx.image.data[(ty * p.tx + tx) * 4] - 1;
    if (li < 0 || !this.cpu[li]) return -1;
    return this.cpu[li][(Math.floor(pz) - ty * TILE) * TILE + (Math.floor(px) - tx * TILE)];
  }
  /** land-cover class under a world point, when its tile is loaded (for tooltips) */
  classAt(slab, x, z) { const b = this._byteAt(slab, x, z); return b < 0 ? -1 : b & 31; }
  /** the share of the ~262 m pixel under a world point that LANID mapped as irrigated in 2015 (0 to 1), or -1 */
  irrAt(slab, x, z) {
    const p = this.per.get(slab.name); if (!p || !p.info.irr) return -1;
    const b = this._byteAt(slab, x, z); return b < 0 ? -1 : (b >> 5) / p.info.irr;
  }
}

/** GLSL: class lookup with an organic, noise-warped boundary, plus per-class colour and texture up close. */
export const NLCD_GLSL = /* glsl */`
uniform sampler2D uNlcdArr;   // atlas of 8 x 8 tiles
uniform sampler2D uNlcdIdx;
uniform vec4 uNlcdGrid;    // tiles x, tiles y, scale from colour texels, tile size
uniform float uNlcdHas;
uniform float uNlcdIrr;    // 1 where the bytes carry LANID's irrigated level in their top three bits (the lower 48)
uniform vec2 uTexSize;
// the byte at a close-up pixel (class + 32 x irrigated level), or -1 where no tile is loaded
float nlcdRawAt(vec2 t3) {
  vec2 tile = floor(t3 / uNlcdGrid.w);
  if (tile.x < 0.0 || tile.y < 0.0 || tile.x >= uNlcdGrid.x || tile.y >= uNlcdGrid.y) return -1.0;
  float layer = floor(texelFetch(uNlcdIdx, ivec2(tile), 0).r * 255.0 + 0.5) - 1.0;
  if (layer < 0.0) return -1.0;
  ivec2 lp = ivec2(clamp(t3 - tile * uNlcdGrid.w, vec2(0.0), vec2(uNlcdGrid.w - 1.0)));
  ivec2 slot = ivec2(int(mod(layer, 8.0)), int(floor(layer / 8.0))) * int(uNlcdGrid.w);
  return floor(texelFetch(uNlcdArr, slot + lp, 0).r * 255.0 + 0.5);
}
float nlcdClassOf(float v) { return v < 0.0 ? -1.0 : mod(v, 32.0); }
float nlcdIrrOf(float v) { return v < 0.0 ? -1.0 : floor(v / 32.0) / 7.0; }
float nlcdAt(vec2 t3) { return nlcdClassOf(nlcdRawAt(t3)); }
// LANID's irrigated share of the close-up pixel (0..1), or -1 where unknown
float nlcdIrrAt(vec2 t3) { return uNlcdIrr > 0.5 ? nlcdIrrOf(nlcdRawAt(t3)) : -1.0; }
// the class at a point, with smooth boundaries: of the four nearest class pixels, the one whose class has the most
// bilinear weight wins, and the weights are wobbled by noise so edges wander like real field and forest edges. irr is
// LANID's irrigated share there, blended over the same four pixels (-1 where unknown)
float nlcdSmooth(vec2 t3, vec2 wob, out float irr) {
  vec2 p = t3 - 0.5;
  vec2 i = floor(p), f = clamp(fract(p) + wob, 0.0, 1.0);
  float c00, c10, c01, c11;
  irr = -1.0;
  float T = uNlcdGrid.w;
  vec2 tile = floor(i / T), lp = i - tile * T;
  if (lp.x < T - 1.0 && lp.y < T - 1.0 && tile.x >= 0.0 && tile.y >= 0.0 && tile.x < uNlcdGrid.x && tile.y < uNlcdGrid.y) {
    // all four in one tile (the usual case): one index lookup
    float layer = floor(texelFetch(uNlcdIdx, ivec2(tile), 0).r * 255.0 + 0.5) - 1.0;
    if (layer < 0.0) return -1.0;
    ivec2 o = ivec2(int(mod(layer, 8.0)), int(floor(layer / 8.0))) * int(T) + ivec2(lp);
    c00 = floor(texelFetch(uNlcdArr, o, 0).r * 255.0 + 0.5);
    c10 = floor(texelFetch(uNlcdArr, o + ivec2(1, 0), 0).r * 255.0 + 0.5);
    c01 = floor(texelFetch(uNlcdArr, o + ivec2(0, 1), 0).r * 255.0 + 0.5);
    c11 = floor(texelFetch(uNlcdArr, o + ivec2(1, 1), 0).r * 255.0 + 0.5);
  } else {
    c00 = nlcdRawAt(i + vec2(0.5, 0.5)); c10 = nlcdRawAt(i + vec2(1.5, 0.5)); c01 = nlcdRawAt(i + vec2(0.5, 1.5)); c11 = nlcdRawAt(i + vec2(1.5, 1.5));
  }
  float w00 = (1.0 - f.x) * (1.0 - f.y), w10 = f.x * (1.0 - f.y), w01 = (1.0 - f.x) * f.y, w11 = f.x * f.y;
  if (uNlcdIrr > 0.5 && c00 >= 0.0 && c10 >= 0.0 && c01 >= 0.0 && c11 >= 0.0)
    irr = w00 * nlcdIrrOf(c00) + w10 * nlcdIrrOf(c10) + w01 * nlcdIrrOf(c01) + w11 * nlcdIrrOf(c11);
  c00 = nlcdClassOf(c00); c10 = nlcdClassOf(c10); c01 = nlcdClassOf(c01); c11 = nlcdClassOf(c11);
  float s00 = w00 + (c10 == c00 ? w10 : 0.0) + (c01 == c00 ? w01 : 0.0) + (c11 == c00 ? w11 : 0.0);
  float s10 = w10 + (c00 == c10 ? w00 : 0.0) + (c01 == c10 ? w01 : 0.0) + (c11 == c10 ? w11 : 0.0);
  float s01 = w01 + (c00 == c01 ? w00 : 0.0) + (c10 == c01 ? w10 : 0.0) + (c11 == c01 ? w11 : 0.0);
  float s11 = w11 + (c00 == c11 ? w00 : 0.0) + (c10 == c11 ? w10 : 0.0) + (c01 == c11 ? w01 : 0.0);
  float best = c00, bs = s00;
  if (s10 > bs) { bs = s10; best = c10; }
  if (s01 > bs) { bs = s01; best = c01; }
  if (s11 > bs) { bs = s11; best = c11; }
  return best;
}
// natural summer colours per class (linear), matching the far-view palette
vec3 nlcdAlbedo(float c) {
  int k = int(c);
  if (k == 1) return vec3(0.025, 0.045, 0.060);
  if (k == 2) return vec3(0.80, 0.84, 0.86);
  if (k == 3) return vec3(0.230, 0.235, 0.150);
  if (k == 4) return vec3(0.245, 0.225, 0.180);
  if (k == 5) return vec3(0.215, 0.200, 0.180);
  if (k == 6) return vec3(0.190, 0.180, 0.175);
  if (k == 7) return vec3(0.381, 0.323, 0.254);
  if (k == 8) return vec3(0.098, 0.172, 0.056);
  if (k == 9) return vec3(0.052, 0.100, 0.044);
  if (k == 10) return vec3(0.076, 0.134, 0.050);
  if (k == 11) return vec3(0.235, 0.198, 0.091);
  if (k == 12) return vec3(0.332, 0.258, 0.138);
  if (k == 13) return vec3(0.381, 0.309, 0.144);
  if (k == 14) return vec3(0.279, 0.266, 0.120);
  if (k == 15) return vec3(0.370, 0.360, 0.195);
  if (k == 16) return vec3(0.195, 0.220, 0.100);
  if (k == 17) return vec3(0.205, 0.285, 0.090);
  if (k == 18) return vec3(0.225, 0.255, 0.085);
  if (k == 19) return vec3(0.062, 0.112, 0.050);
  if (k == 20) return vec3(0.135, 0.190, 0.090);
  return vec3(-1.0);
}
// developed intensity for night lights
float nlcdDev(float c) { int k = int(c); return k == 3 ? 0.10 : k == 4 ? 0.42 : k == 5 ? 0.78 : k == 6 ? 1.0 : 0.0; }
`;
