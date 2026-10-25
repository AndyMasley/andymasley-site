import * as THREE from 'three';
import { fetchJSON, fetchPixels } from '../core/assets.js';

/**
 * Principal aquifers (USGS) and the groundwater pumped from each (Lovelace et al. 2020, county-level data for 2015).
 * The aquifer map is drawn under the land in the underground view; each county glows with the groundwater it pumps
 * per square mile.
 */
export const ROCK_COLORS = {
  'Unconsolidated sand and gravel': '#e7c25e', 'Semiconsolidated sand': '#ee9550', 'Sandstone': '#de6d5e',
  'Carbonate rock': '#4fb6e3', 'Sandstone and carbonate rock': '#7b8ef0', 'Igneous and metamorphic rock': '#bb7fe0', Other: '#9aa4a8',
};

export class Aquifers {
  async load(slabs, model, shared) {
    this.json = await fetchJSON('aquifers.json');
    this.list = this.json.aquifers;   // index i (1-based in the raster)
    this.byIndex = new Map(this.list.map((a) => [a.i, a]));
    // palette: rock-type colour, nudged per aquifer so neighbours of the same rock type stay apart
    const pal = new Uint8Array(64 * 4);
    for (const a of this.list) {
      if (a.i >= 64) continue;
      const c = new THREE.Color(ROCK_COLORS[a.rock] || ROCK_COLORS.Other);
      const hsl = {}; c.getHSL(hsl);
      const j = ((a.i * 0.618034) % 1) - 0.5;
      c.setHSL((hsl.h + j * 0.05 + 1) % 1, Math.min(1, hsl.s * (0.9 + 0.2 * Math.abs(j))), Math.min(0.75, Math.max(0.3, hsl.l + j * 0.12)));
      const lin = c.clone(); // THREE.Color stores linear values
      pal.set([Math.round(Math.min(1, lin.r) * 255), Math.round(Math.min(1, lin.g) * 255), Math.round(Math.min(1, lin.b) * 255), 255], a.i * 4);
    }
    const pt = new THREE.DataTexture(pal, 64, 1, THREE.RGBAFormat, THREE.UnsignedByteType);
    pt.minFilter = pt.magFilter = THREE.NearestFilter; pt.needsUpdate = true;
    shared.uAqPal.value = pt;
    // groundwater pumped per square mile, by county (log scale 2,000 .. 1,000,000 gallons a day per square mile)
    const gw = new Uint8Array(64 * 64 * 4);
    this.gwDensity = new Float32Array(model.n);
    for (let i = 0; i < model.n && i < 4096; i++) {
      const c = model.county(i), cd = model.cdata[i];
      let g = 0; for (const k in c.src) g += (c.src[k].gf || 0) + (c.src[k].gs || 0);
      const dens = cd && cd.area > 0 ? g * 1e6 / (cd.area / 2.58999) : 0;
      this.gwDensity[i] = dens;
      const v = dens > 0 ? Math.min(1, Math.max(0, Math.log(dens / 2000) / Math.log(1e6 / 2000))) : 0;
      gw[4 * i] = Math.round(v * 255); gw[4 * i + 3] = 255;
    }
    const gt = new THREE.DataTexture(gw, 64, 64, THREE.RGBAFormat, THREE.UnsignedByteType);
    gt.minFilter = gt.magFilter = THREE.NearestFilter; gt.needsUpdate = true;
    shared.uGwTex.value = gt;
    // rasters
    await Promise.all(slabs.map(async (s) => {
      try {
        const { w, h, px } = await fetchPixels(`${s.name}_aquifer.png`);
        const r = new Uint8Array(w * h);
        for (let i = 0, j = 0; i < w * h; i++, j += 4) r[i] = px[j];
        const t = new THREE.DataTexture(r, w, h, THREE.RedFormat, THREE.UnsignedByteType);
        t.minFilter = t.magFilter = THREE.NearestFilter; t.generateMipmaps = false; t.unpackAlignment = 1; t.needsUpdate = true;
        s.aquiferTex = t; s.aquiferIds = r; s.aquiferW = w; s.aquiferH = h;
        // centre, extent and area of each aquifer (for search, labels and the panel)
        this.extent = this.extent || new Map(); this.area = this.area || new Map();
        const km = (2 / s.ppu) * s.mpu / 1000, sqmi = (km * km) / 2.58999;
        for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
          const a = r[j * w + i]; if (!a) continue;
          this.area.set(a, (this.area.get(a) || 0) + sqmi);
          if ((i & 1) || (j & 1)) continue;
          let e = this.extent.get(a); if (!e) this.extent.set(a, (e = { n: 0, sx: 0, sz: 0, x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity, slab: s }));
          const x = s.x0 + (i * 2 + 1) / s.ppu, z = s.z0 + (j * 2 + 1) / s.ppu;
          e.n++; e.sx += x; e.sz += z; if (x < e.x0) e.x0 = x; if (x > e.x1) e.x1 = x; if (z < e.z0) e.z0 = z; if (z > e.z1) e.z1 = z;
        }
      } catch (e) { console.warn('aquifer raster', s.name, e); }
    }));
    this.county = this.json.county;   // FIPS -> [[aqIndex, name, total, irrigation, public supply], ...]
    // a label point for each aquifer: the point inside it nearest its centre
    this.anchor = new Map();
    for (const [a, e] of this.extent) {
      const s = e.slab, cx = e.sx / e.n, cz = e.sz / e.n;
      let best = null, bd = Infinity;
      const i0 = Math.max(0, Math.floor((e.x0 - s.x0) * s.ppu / 2)), i1 = Math.min(s.aquiferW - 1, Math.ceil((e.x1 - s.x0) * s.ppu / 2));
      const j0 = Math.max(0, Math.floor((e.z0 - s.z0) * s.ppu / 2)), j1 = Math.min(s.aquiferH - 1, Math.ceil((e.z1 - s.z0) * s.ppu / 2));
      const step = Math.max(1, Math.floor(Math.max(i1 - i0, j1 - j0) / 400));
      for (let j = j0; j <= j1; j += step) for (let i = i0; i <= i1; i += step) {
        if (s.aquiferIds[j * s.aquiferW + i] !== a) continue;
        // prefer points with the same aquifer around them, so the label sits inside rather than on an edge
        const x = s.x0 + (i * 2 + 1) / s.ppu, z = s.z0 + (j * 2 + 1) / s.ppu;
        let inside = 0;
        for (const [di, dj] of [[6, 0], [-6, 0], [0, 6], [0, -6]]) { const ii = i + di, jj = j + dj; if (ii >= 0 && jj >= 0 && ii < s.aquiferW && jj < s.aquiferH && s.aquiferIds[jj * s.aquiferW + ii] === a) inside++; }
        const d = Math.hypot(x - cx, z - cz) * (1 + (4 - inside) * 0.6);
        if (d < bd) { bd = d; best = { x, z, slab: s }; }
      }
      if (best) this.anchor.set(a, best);
    }
    return this;
  }
  /** aquifer under a world point (index, or 0) */
  at(slab, x, z) {
    if (!slab || !slab.aquiferIds) return 0;
    const i = Math.floor((x - slab.x0) * slab.ppu / 2), j = Math.floor((z - slab.z0) * slab.ppu / 2);
    if (i < 0 || j < 0 || i >= slab.aquiferW || j >= slab.aquiferH) return 0;
    return slab.aquiferIds[j * slab.aquiferW + i];
  }
}
