import * as THREE from 'three';
import { SHELF_M, DEEP_SCALE, SLAB_MOVE } from '../core/config.js';

/** Effective height (metres) after compressing the ocean below the continental shelf. */
export function effHeight(h) {
  if (h >= 0) return h;
  const d = -h;
  return -(Math.min(d, SHELF_M) + Math.max(0, d - SHELF_M) * DEEP_SCALE);
}
export const EFF_HEIGHT_GLSL = /* glsl */`
float effHeight(float h) {
  if (h >= 0.0) return h;
  float d = -h;
  return -(min(d, ${SHELF_M.toFixed(1)}) + max(0.0, d - ${SHELF_M.toFixed(1)}) * ${DEEP_SCALE.toFixed(4)});
}`;

/** One physical piece of the model: the lower 48, Alaska, Hawaii, or Puerto Rico + USVI. */
export class Slab {
  constructor(d) {
    this.name = d.name;
    const m = d.meta;
    this.meta = m;
    this.rect = m.rect;                     // source (composite-projection) rectangle
    const mv = SLAB_MOVE[d.name] || [0, 0];
    this.move = mv;
    this.offset = [m.offset[0] + mv[0], m.offset[1] + mv[1]];   // where the slab sits in the scene
    this.hpu = m.hpu; this.ppu = m.ppu;
    this.mpu = m.km_per_unit * 1000;        // metres per world unit, horizontally
    this.W = d.w; this.H = d.h;             // height grid
    this.heights = d.heights; this.masks = d.masks;
    this.colorTex = d.color;
    this.texW = m.tex[0]; this.texH = m.tex[1];
    this.x0 = this.rect[0] + this.offset[0];
    this.z0 = this.rect[1] + this.offset[1];
    this.x1 = this.rect[2] + this.offset[0];
    this.z1 = this.rect[3] + this.offset[1];
    // GPU copies
    this.heightTex = new THREE.DataTexture(this.heights, this.W, this.H, THREE.RedFormat, THREE.FloatType);
    this.heightTex.minFilter = this.heightTex.magFilter = THREE.NearestFilter;
    this.heightTex.needsUpdate = true;
    const aux = new Uint8Array(this.W * this.H * 4);
    let minH = Infinity, maxH = -Infinity;
    for (let i = 0; i < this.W * this.H; i++) {
      const h = this.heights[i], mk = this.masks[i];
      const e = effHeight(h);
      if (e < minH) minH = e; if (e > maxH) maxH = e;
      aux[i * 4] = Math.max(0, Math.min(255, Math.round(Math.sqrt(Math.max(0, -e)) * 4.5)));  // depth, sqrt-encoded
      aux[i * 4 + 1] = (mk & 1) ? 255 : 0;
      aux[i * 4 + 2] = (mk & 2) ? 255 : 0;
      aux[i * 4 + 3] = (mk & 4) ? 255 : 0;
    }
    this.minEff = minH; this.maxEff = maxH;
    this.auxTex = new THREE.DataTexture(aux, this.W, this.H, THREE.RGBAFormat, THREE.UnsignedByteType);
    this.auxTex.minFilter = THREE.LinearFilter; this.auxTex.magFilter = THREE.LinearFilter;
    this.auxTex.needsUpdate = true;
  }
  /** world (x,z) -> fractional height-grid pixel */
  toPx(x, z) { return [(x - this.x0) * this.hpu - 0.5, (z - this.z0) * this.hpu - 0.5]; }
  contains(x, z, pad = 0) { return x >= this.x0 - pad && x <= this.x1 + pad && z >= this.z0 - pad && z <= this.z1 + pad; }
  /** true for a point baked where the slab used to sit, before the move */
  containsBaked(x, z, pad = 2) { const [dx, dz] = this.move; return this.contains(x + dx, z + dz, pad); }
  /** bilinear height in metres (raw, not compressed) */
  sampleH(x, z) {
    let [fx, fy] = this.toPx(x, z);
    fx = Math.max(0, Math.min(this.W - 1.001, fx)); fy = Math.max(0, Math.min(this.H - 1.001, fy));
    const i = fx | 0, j = fy | 0, tx = fx - i, ty = fy - j, W = this.W, h = this.heights;
    const a = h[j * W + i], b = h[j * W + i + 1], c = h[(j + 1) * W + i], d = h[(j + 1) * W + i + 1];
    return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
  }
  maskAt(x, z) {
    const [fx, fy] = this.toPx(x, z);
    const i = Math.max(0, Math.min(this.W - 1, Math.round(fx))), j = Math.max(0, Math.min(this.H - 1, Math.round(fy)));
    return this.masks[j * this.W + i];
  }
  /** world y of the ground (or sea floor) at (x,z) for a given exaggeration */
  groundY(x, z, exag) { return effHeight(this.sampleH(x, z)) * exag / this.mpu; }
  /** world y of the visible surface: ground, or sea level over water */
  surfaceY(x, z, exag) {
    const h = this.sampleH(x, z);
    return Math.max(0, effHeight(h)) * exag / this.mpu;
  }
}
