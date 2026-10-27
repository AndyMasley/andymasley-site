import * as THREE from 'three';
import { fetchJSON, fetchPixels } from '../core/assets.js';

/**
 * Irrigated fields up close, on the lower 48 (scripts/water-map/fields_fine.py): LANID 2015 resampled onto the slab's
 * texture grid at twelve times the colour texture's resolution (about 65 m a pixel), so a center pivot is a disc a dozen
 * pixels across, in 512-pixel tiles packed 4 x 4 into lossless WebP sheets. Each byte is crop + 32 x level: level is the
 * share of the pixel LANID mapped as irrigated in 2015, in eighths; crop the group the USDA Cropland Data Layer says the
 * irrigated land grew in 2015 (0 where not known). Tiles near the view are copied into one texture atlas, with a small
 * index texture saying which slot holds which tile, as world/nlcd.js does for land cover.
 */
const TILE = 512;
const ATLAS = 8;                   // 8 x 8 slots of 512 px: one 4096 px single-channel atlas (16 MB)
export const FIELDS_DMAX = 24;     // camera distance below which the tiles load (world units)

export class FieldTiles {
  constructor(slab, renderer) {
    this.slab = slab; this.renderer = renderer;
    const n = TILE * ATLAS;
    this.arr = new THREE.DataTexture(new Uint8Array(n * n), n, n, THREE.RedFormat, THREE.UnsignedByteType);
    this.arr.minFilter = this.arr.magFilter = THREE.NearestFilter; this.arr.generateMipmaps = false;
    this.arr.unpackAlignment = 1; this.arr.flipY = false; this.arr.needsUpdate = true;
    this.src = new THREE.DataTexture(new Uint8Array(TILE * TILE), TILE, TILE, THREE.RedFormat, THREE.UnsignedByteType);
    this.src.unpackAlignment = 1;
    this.cpu = [];
    this.layers = new Array(ATLAS * ATLAS).fill(null);
    this.sheets = new Map();
    this.ready = false;
    this.grid = new THREE.Vector4(0, 0, 12, TILE);
    this.idx = new THREE.DataTexture(new Uint8Array(4), 1, 1, THREE.RGBAFormat, THREE.UnsignedByteType);
    this.uniforms = { uFieldArr: { value: this.arr }, uFieldIdx: { value: this.idx }, uFieldGrid: { value: this.grid }, uFieldHas: { value: 0 } };
  }
  async load() {
    try { this.man = await fetchJSON('fields/manifest.json'); } catch (e) { return this; }
    const m = this.man, tx = m.nsx * m.per, ty = m.nsy * m.per;
    this.tx = tx; this.ty = ty;
    this.idx.image = { data: new Uint8Array(tx * ty * 4), width: tx, height: ty };
    this.idx.minFilter = this.idx.magFilter = THREE.NearestFilter; this.idx.generateMipmaps = false; this.idx.needsUpdate = true;
    this.have = new Set();
    for (const sh of m.sheets) for (const t of sh.tiles) this.have.add(`${sh.sx * m.per + (t % m.per)},${sh.sy * m.per + Math.floor(t / m.per)}`);
    this.grid.set(tx, ty, m.f, TILE);
    this.crops = m.crops || null;
    this.ready = true;
    return this;
  }
  _sheet(sx, sy) {
    const key = `fields_${sx}_${sy}`;
    let s = this.sheets.get(key);
    if (!s) {
      s = { key, data: null, last: performance.now() };
      this.sheets.set(key, s);
      fetchPixels(`fields/${key}.webp`).then(({ w, h, px }) => {
        const r = new Uint8Array(w * h);
        for (let i = 0, j = 0; i < w * h; i++, j += 4) r[i] = px[j];
        s.data = r; s.w = w;
        if (this.sheets.size > 10) {
          const old = [...this.sheets.values()].filter((q) => q.data && q !== s).sort((a, b) => a.last - b.last);
          while (this.sheets.size > 10 && old.length) this.sheets.delete(old.shift().key);
        }
      }).catch(() => { s.failed = true; });
    }
    s.last = performance.now();
    return s;
  }
  /** load the tiles under a disc around (x, z) when the camera is close enough to see single fields */
  update(x, z, d) {
    // (farther out the shader skips the fields altogether)
    this.uniforms.uFieldHas.value = this.ready && d < FIELDS_DMAX * 1.25 ? 1 : 0;
    if (!this.ready || d > FIELDS_DMAX) return;
    const s = this.slab, m = this.man;
    const R = Math.min(26, Math.max(4, d * 1.1));
    if (!s.contains(x, z, R)) return;
    const k = (s.ppu * m.f) / TILE;   // tiles per world unit
    const t0x = Math.floor((x - R - s.x0) * k), t1x = Math.floor((x + R - s.x0) * k);
    const t0y = Math.floor((z - R - s.z0) * k), t1y = Math.floor((z + R - s.z0) * k);
    const want = [];
    for (let ty = Math.max(0, t0y); ty <= Math.min(this.ty - 1, t1y); ty++) for (let tx = Math.max(0, t0x); tx <= Math.min(this.tx - 1, t1x); tx++) {
      if (!this.have.has(`${tx},${ty}`)) continue;
      want.push([Math.hypot(s.x0 + (tx + 0.5) / k - x, s.z0 + (ty + 0.5) / k - z), tx, ty]);
    }
    want.sort((a, b) => a[0] - b[0]);
    let uploads = 0;
    const now = performance.now();
    for (const [dist, tx, ty] of want) {
      const li = this.layers.findIndex((l) => l && l.tx === tx && l.ty === ty);
      if (li >= 0) { this.layers[li].used = now; continue; }
      if (uploads >= 2) continue;
      const sh = this._sheet(Math.floor(tx / m.per), Math.floor(ty / m.per));
      if (!sh.data) continue;
      let slot = this.layers.indexOf(null);
      if (slot < 0) {
        // the least useful slot: farthest from the view, then oldest; never one nearer than the tile it would hold
        let best = -1, score = -Infinity;
        this.layers.forEach((l, i) => { const dd = Math.hypot(s.x0 + (l.tx + 0.5) / k - x, s.z0 + (l.ty + 0.5) / k - z); const sc = dd + (now - l.used) / 4000; if (dd > dist && sc > score) { score = sc; best = i; } });
        if (best < 0) break;
        const old = this.layers[best];
        this.idx.image.data[(old.ty * this.tx + old.tx) * 4] = 0; this.idx.needsUpdate = true;
        slot = best;
      }
      const lx = (tx % m.per) * TILE, ly = (ty % m.per) * TILE;
      const dst = this.src.image.data, W = sh.w;
      for (let j = 0; j < TILE; j++) dst.set(sh.data.subarray((ly + j) * W + lx, (ly + j) * W + lx + TILE), j * TILE);
      this.cpu[slot] = dst.slice();
      this.renderer.copyTextureToTexture(new THREE.Vector2((slot % ATLAS) * TILE, Math.floor(slot / ATLAS) * TILE), this.src, this.arr);
      this.layers[slot] = { tx, ty, used: now };
      this.idx.image.data[(ty * this.tx + tx) * 4] = slot + 1; this.idx.needsUpdate = true;
      uploads++;
    }
  }
  /** what LANID and the Cropland Data Layer say about the ground under a world point: { irr 0..1, crop name } or null */
  at(x, z) {
    if (!this.ready) return null;
    const s = this.slab, m = this.man;
    if (!s.contains(x, z, 0)) return null;
    const px = (x - s.x0) * s.ppu * m.f, pz = (z - s.z0) * s.ppu * m.f;
    const tx = Math.floor(px / TILE), ty = Math.floor(pz / TILE);
    if (tx < 0 || ty < 0 || tx >= this.tx || ty >= this.ty) return null;
    if (!this.have.has(`${tx},${ty}`)) return { irr: 0, crop: null };
    const li = this.idx.image.data[(ty * this.tx + tx) * 4] - 1;
    if (li < 0 || !this.cpu[li]) return null;
    const b = this.cpu[li][(Math.floor(pz) - ty * TILE) * TILE + (Math.floor(px) - tx * TILE)];
    const c = b & 31;
    return { irr: (b >> 5) / 7, crop: c && this.crops ? this.crops[c] : null };
  }
  dispose() { this.arr.dispose(); this.src.dispose(); this.idx.dispose(); }
}

/** GLSL: the irrigated share and crop under a point, with field edges drawn smooth between the 65 m pixels */
export const FIELDS_GLSL = /* glsl */`
uniform sampler2D uFieldArr;
uniform sampler2D uFieldIdx;
uniform vec4 uFieldGrid;    // tiles x, tiles y, scale from colour texels, tile size
uniform float uFieldHas;
float fieldRaw(vec2 i) {
  vec2 tile = floor(i / uFieldGrid.w);
  if (tile.x < 0.0 || tile.y < 0.0 || tile.x >= uFieldGrid.x || tile.y >= uFieldGrid.y) return -1.0;
  float layer = floor(texelFetch(uFieldIdx, ivec2(tile), 0).r * 255.0 + 0.5) - 1.0;
  if (layer < 0.0) return -1.0;
  ivec2 lp = ivec2(i - tile * uFieldGrid.w);
  ivec2 slot = ivec2(int(mod(layer, 8.0)), int(floor(layer / 8.0))) * int(uFieldGrid.w);
  return floor(texelFetch(uFieldArr, slot + lp, 0).r * 255.0 + 0.5);
}
// the irrigated share at a point (0..1, bilinear between pixel centres), or -1 where no tile is loaded; crop is the
// group of the most irrigated of the four pixels around it (0 unknown)
float fieldAt(vec2 tf, out float crop) {
  crop = 0.0;
  if (uFieldHas < 0.5) return -1.0;
  vec2 p = tf - 0.5, i = floor(p), f = fract(p);
  float b00 = fieldRaw(i), b10 = fieldRaw(i + vec2(1.0, 0.0)), b01 = fieldRaw(i + vec2(0.0, 1.0)), b11 = fieldRaw(i + vec2(1.0, 1.0));
  if (b00 < 0.0 && b10 < 0.0 && b01 < 0.0 && b11 < 0.0) {
    // a pixel in no loaded tile: nothing irrigated there if the tile is simply empty, unknown if it is not loaded yet;
    // the index texture cannot tell, so the four corners decide together
    return -1.0;
  }
  b00 = max(b00, 0.0); b10 = max(b10, 0.0); b01 = max(b01, 0.0); b11 = max(b11, 0.0);
  float l00 = floor(b00 / 32.0), l10 = floor(b10 / 32.0), l01 = floor(b01 / 32.0), l11 = floor(b11 / 32.0);
  float best = l00, bc = mod(b00, 32.0);
  if (l10 > best) { best = l10; bc = mod(b10, 32.0); }
  if (l01 > best) { best = l01; bc = mod(b01, 32.0); }
  if (l11 > best) { best = l11; bc = mod(b11, 32.0); }
  crop = bc;
  return mix(mix(l00, l10, f.x), mix(l01, l11, f.x), f.y) / 7.0;
}
// a crop's summer colour from above (linear), and how its field reads up close: 0 rows of a field crop, 1 orchard,
// 2 vineyard, 3 flooded (rice), 4 bare (fallow), 5 grass
vec3 cropAlbedo(float c, out float kind) {
  int k = int(c + 0.5);
  kind = 0.0;
  if (k == 1) return vec3(0.090, 0.230, 0.045);        // corn
  if (k == 2) return vec3(0.120, 0.250, 0.060);        // soybeans
  if (k == 3) return vec3(0.170, 0.235, 0.080);        // cotton
  if (k == 4) { kind = 3.0; return vec3(0.085, 0.240, 0.090); }   // rice
  if (k == 5) return vec3(0.190, 0.220, 0.070);        // sorghum
  if (k == 6) return vec3(0.400, 0.315, 0.140);        // wheat, harvested by summer
  if (k == 7) return vec3(0.110, 0.300, 0.055);        // alfalfa
  if (k == 8) return vec3(0.190, 0.290, 0.095);        // other hay
  if (k == 9) return vec3(0.360, 0.300, 0.145);        // barley, oats, other grains
  if (k == 10) return vec3(0.075, 0.215, 0.050);       // sugar beets
  if (k == 11) return vec3(0.110, 0.230, 0.060);       // potatoes
  if (k == 12) return vec3(0.170, 0.255, 0.075);       // dry beans and peas
  if (k == 13) return vec3(0.135, 0.245, 0.065);       // peanuts
  if (k == 14) return vec3(0.300, 0.290, 0.075);       // sunflowers, canola, oilseeds
  if (k == 15) return vec3(0.140, 0.240, 0.080);       // vegetables and melons
  if (k == 16) { kind = 1.0; return vec3(0.075, 0.165, 0.045); }  // almonds
  if (k == 17) { kind = 1.0; return vec3(0.060, 0.150, 0.040); }  // walnuts, pecans, pistachios
  if (k == 18) { kind = 1.0; return vec3(0.045, 0.140, 0.040); }  // citrus
  if (k == 19) { kind = 2.0; return vec3(0.110, 0.200, 0.055); }  // grapes
  if (k == 20) { kind = 1.0; return vec3(0.070, 0.160, 0.045); }  // other orchards
  if (k == 21) return vec3(0.110, 0.215, 0.065);       // berries
  if (k == 22) return vec3(0.140, 0.290, 0.075);       // sugarcane
  if (k == 23) return vec3(0.130, 0.255, 0.075);       // tobacco
  if (k == 24) return vec3(0.150, 0.245, 0.075);       // other crops
  if (k == 25) { kind = 4.0; return vec3(0.320, 0.255, 0.165); }  // fallow or idle
  if (k == 26) { kind = 5.0; return vec3(0.180, 0.275, 0.090); }  // grass and pasture
  if (k == 27) { kind = 5.0; return vec3(0.130, 0.235, 0.080); }  // developed land: lawns and parks
  if (k == 28) { kind = 5.0; return vec3(0.090, 0.170, 0.065); }  // woods, wetland, natural cover
  if (k == 29) { kind = 3.0; return vec3(0.035, 0.060, 0.065); }  // open water
  return vec3(0.115, 0.290, 0.060);                     // irrigated, crop not known
}
`;
