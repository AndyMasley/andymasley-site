(() => {
  // src/common.js
  var R = 3e4;
  var C = 2 * Math.PI * R;
  var ROOT = C / 4;
  var NX = 7;
  var NY = 4;
  var L = NX * ROOT;
  var G0 = 9.81;
  var OMEGA = Math.sqrt(G0 / R);
  async function decodePNG(buf) {
    const u8 = new Uint8Array(buf), dv = new DataView(buf);
    let p = 8, w = 0, h = 0, bits = 0, ct = 0;
    const idat = [];
    while (p < u8.length) {
      const len = dv.getUint32(p);
      const type = String.fromCharCode(u8[p + 4], u8[p + 5], u8[p + 6], u8[p + 7]);
      if (type === "IHDR") {
        w = dv.getUint32(p + 8);
        h = dv.getUint32(p + 12);
        bits = u8[p + 16];
        ct = u8[p + 17];
        if (u8[p + 20]) throw new Error("interlaced PNG not supported");
      } else if (type === "IDAT") idat.push(u8.subarray(p + 8, p + 8 + len));
      else if (type === "IEND") break;
      p += 12 + len;
    }
    const ch = ct === 0 ? 1 : ct === 2 ? 3 : ct === 4 ? 2 : ct === 6 ? 4 : 0;
    if (!ch || bits !== 8 && bits !== 16) throw new Error("unsupported PNG layout");
    const bpp = ch * bits / 8, stride = w * bpp;
    const stream = new Blob(idat).stream().pipeThrough(new DecompressionStream("deflate"));
    const raw = new Uint8Array(await new Response(stream).arrayBuffer());
    if (raw.length < (stride + 1) * h) throw new Error("truncated PNG data");
    const out = new Uint8Array(stride * h);
    for (let y = 0; y < h; y++) {
      const f = raw[y * (stride + 1)], ri = y * (stride + 1) + 1, oi = y * stride, pi = oi - stride;
      if (f === 0) out.set(raw.subarray(ri, ri + stride), oi);
      else if (f === 1) {
        for (let x = 0; x < bpp; x++) out[oi + x] = raw[ri + x];
        for (let x = bpp; x < stride; x++) out[oi + x] = raw[ri + x] + out[oi + x - bpp] & 255;
      } else if (f === 2) {
        if (y === 0) out.set(raw.subarray(ri, ri + stride), oi);
        else for (let x = 0; x < stride; x++) out[oi + x] = raw[ri + x] + out[pi + x] & 255;
      } else if (f === 3) {
        for (let x = 0; x < stride; x++) {
          const a = x >= bpp ? out[oi + x - bpp] : 0, b = y > 0 ? out[pi + x] : 0;
          out[oi + x] = raw[ri + x] + (a + b >> 1) & 255;
        }
      } else if (f === 4) {
        for (let x = 0; x < stride; x++) {
          const a = x >= bpp ? out[oi + x - bpp] : 0, b = y > 0 ? out[pi + x] : 0, c = x >= bpp && y > 0 ? out[pi + x - bpp] : 0;
          const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c);
          out[oi + x] = raw[ri + x] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c) & 255;
        }
      } else throw new Error("bad PNG filter");
    }
    if (bits === 16) {
      const o16 = new Uint16Array(w * h * ch);
      for (let i = 0, j = 0; i < o16.length; i++, j += 2) o16[i] = out[j] << 8 | out[j + 1];
      return { w, h, ch, bits, data: o16 };
    }
    return { w, h, ch, bits, data: out };
  }
  var clamp = (x, a, b) => x < a ? a : x > b ? b : x;
  var smoothstep = (a, b, x) => {
    const t = clamp((x - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  };
  var wrapY = (my) => {
    my %= C;
    return my < 0 ? my + C : my;
  };
  function hash2(i, j) {
    let h = Math.imul(i | 0, 374761393) + Math.imul(j | 0, 668265263) | 0;
    h = Math.imul(h ^ h >>> 13, 1274126177);
    return ((h ^ h >>> 16) >>> 0) / 4294967296;
  }
  function vnoise(x, y) {
    const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
    const u = fx * fx * fx * (fx * (fx * 6 - 15) + 10), v = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
    const a = hash2(i, j), b = hash2(i + 1, j), c = hash2(i, j + 1), d = hash2(i + 1, j + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function cyl(mx, my, h, out) {
    const th = my / R, r = R - h;
    out[0] = mx - L / 2;
    out[1] = -r * Math.cos(th);
    out[2] = -r * Math.sin(th);
    return out;
  }
  var RS = ROOT / 4;
  var RNX = NX * 4;
  var RNY = NY * 4;
  var RM = 160;
  var RCELL = 128;
  var RREG = 72;
  var regionKey = (rx, ry) => ry * RNX + rx;
  var EMPTY_REGION = { nRoads: 0, nBld: 0, empty: true };
  function parseRegion(buf, rx, ry) {
    const dv = new DataView(buf);
    if (dv.getUint32(0, true) !== 844254799) throw new Error("bad region file");
    const nR = dv.getUint32(4, true), nP = dv.getUint32(8, true), nB = dv.getUint32(12, true), cells = dv.getUint32(16, true);
    const reg = { rx, ry, x0: rx * RS, y0: ry * RS, nRoads: nR, nPts: nP, nBld: nB, cells, used: 0 };
    const rStart = reg.rStart = new Int32Array(nR), rCount = reg.rCount = new Int32Array(nR);
    reg.rCls = new Uint8Array(nR);
    reg.rLanes = new Uint8Array(nR);
    reg.rFlags = new Uint8Array(nR);
    reg.rMph = new Uint8Array(nR);
    reg.rHw = new Float32Array(nR);
    reg.rName = new Int32Array(nR);
    const rS0 = new Float32Array(nR);
    let p = 32;
    for (let i = 0; i < nR; i++, p += 20) {
      rStart[i] = dv.getUint32(p, true);
      rCount[i] = dv.getUint16(p + 4, true);
      reg.rCls[i] = dv.getUint8(p + 6);
      reg.rLanes[i] = dv.getUint8(p + 7);
      reg.rFlags[i] = dv.getUint8(p + 8);
      reg.rMph[i] = dv.getUint8(p + 9);
      reg.rHw[i] = dv.getUint16(p + 10, true) / 200;
      reg.rName[i] = dv.getUint32(p + 12, true);
      rS0[i] = dv.getFloat32(p + 16, true);
    }
    const xs = new Int32Array(buf.slice(p, p + nP * 4));
    p += nP * 4;
    const ys = new Int32Array(buf.slice(p, p + nP * 4));
    p += nP * 4;
    const zs = new Int16Array(buf.slice(p, p + nP * 2));
    p += nP * 2;
    p = p + 3 & ~3;
    const px = reg.px = new Float32Array(nP), py = reg.py = new Float32Array(nP), pz = reg.pz = new Float32Array(nP);
    const cum = reg.cum = new Float32Array(nP), segR = reg.segR = new Int32Array(nP);
    let nSeg = 0;
    for (let i = 0; i < nR; i++) {
      let x = 0, y = 0, z = 0, acc = rS0[i];
      const s0 = rStart[i], n = rCount[i];
      for (let k = 0; k < n; k++) {
        const q = s0 + k;
        x += xs[q];
        y += ys[q];
        z += zs[q];
        px[q] = x * 0.01;
        py[q] = y * 0.01;
        pz[q] = z * 0.05;
        segR[q] = i;
        if (k > 0) acc += Math.hypot(px[q] - px[q - 1], py[q] - py[q - 1]);
        cum[q] = acc;
      }
      nSeg += Math.max(0, n - 1);
    }
    const nc = cells * cells + 1;
    reg.bCell = new Uint32Array(buf.slice(p, p + nc * 4));
    p += nc * 4;
    reg.b = new Uint8Array(buf.slice(p, p + nB * 12));
    const gw = reg.gw = Math.ceil((RS + 2 * RM) / RCELL);
    const counts = new Int32Array(gw * gw + 1);
    const visit = (fill) => {
      for (let i = 0; i < nR; i++) {
        const s0 = rStart[i], n = rCount[i];
        for (let k = 0; k < n - 1; k++) {
          const q = s0 + k, ax = px[q], ay = py[q], bx = px[q + 1], by = py[q + 1];
          const x0 = clamp(Math.floor((Math.min(ax, bx) - RREG + RM) / RCELL), 0, gw - 1), x1 = clamp(Math.floor((Math.max(ax, bx) + RREG + RM) / RCELL), 0, gw - 1);
          const y0 = clamp(Math.floor((Math.min(ay, by) - RREG + RM) / RCELL), 0, gw - 1), y1 = clamp(Math.floor((Math.max(ay, by) + RREG + RM) / RCELL), 0, gw - 1);
          for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) fill(y * gw + x, q);
        }
      }
    };
    visit((c) => {
      counts[c + 1]++;
    });
    for (let i = 0; i < gw * gw; i++) counts[i + 1] += counts[i];
    const items = new Int32Array(counts[gw * gw]);
    const cursor = counts.slice(0, gw * gw);
    visit((c, q) => {
      items[cursor[c]++] = q;
    });
    reg.gstart = counts;
    reg.gitems = items;
    return reg;
  }
  var World = class {
    // parts: decoded arrays (see loader).  Regions arrive later through addRegion().
    constructor(meta, parts) {
      this.meta = meta;
      this.hScale = 1 / meta.height.scale;
      this.hOff = meta.height.offset;
      this.bScale = 1 / (parts.bScale || meta.height.scale);
      this.base = parts.base;
      this.bw = parts.bw;
      this.bh = parts.bh;
      this.bg = L / (parts.bw - 1);
      this.level = parts.level;
      this.lw = parts.lw;
      this.lh = parts.lh;
      this.lg = L / (parts.lw - 1);
      this.sdf = parts.sdf;
      this.sw = parts.sdfW;
      this.sh = parts.sdfH;
      this.spx = L / parts.sdfW;
      this.sdfRange = meta.mask.sdfRange;
      this.cover = parts.cover || null;
      this.cw = meta.mask.cw;
      this.ch = meta.mask.ch;
      this.cpx = meta.mask.cpx;
      this.cover2 = parts.cover2 || null;
      this.aux = parts.aux || null;
      const wb = meta.webster;
      this.wn = wb.n;
      this.wg = wb.g;
      this.wx0 = wb.mx0;
      this.wy0 = wb.my0;
      this.webH = parts.webH;
      this.webW = parts.webW;
      this.webWater = parts.webWater;
      this.webFoot = parts.webFoot;
      this.townId = parts.townId || null;
      this.zone = parts.zone || null;
      this.zw = parts.zoneW || 0;
      this.zh = parts.zoneH || 0;
      this.zRange = parts.zoneRange || 0;
      this.zpx = this.zw ? L / this.zw : 1;
      this.regions = /* @__PURE__ */ new Map();
      this.have = new Set(meta.tiles ? meta.tiles.have : []);
      this.onMissingRegion = null;
      this.pinned = null;
      this.tick = 0;
      this._nr = { d: 1e9, road: -1, reg: null, z: 0, s: 0, hw: 0, tx: 1, ty: 0, side: 1 };
    }
    baseH(mx, my) {
      const g = this.bg, W = this.bw, H = this.bh, b = this.base;
      const fx = clamp(mx / g, 0, W - 1.0001), fy = my / g;
      const i = Math.floor(fx), j = Math.floor(fy), tx = fx - i, ty = fy - j;
      const wx0 = ((-tx + 2) * tx - 1) * tx * 0.5, wx1 = ((3 * tx - 5) * tx * tx + 2) * 0.5, wx2 = ((-3 * tx + 4) * tx + 1) * tx * 0.5, wx3 = (tx - 1) * tx * tx * 0.5;
      const wy0 = ((-ty + 2) * ty - 1) * ty * 0.5, wy1 = ((3 * ty - 5) * ty * ty + 2) * 0.5, wy2 = ((-3 * ty + 4) * ty + 1) * ty * 0.5, wy3 = (ty - 1) * ty * ty * 0.5;
      const i0 = i > 0 ? i - 1 : 0, i2 = i + 1 < W ? i + 1 : W - 1, i3 = i + 2 < W ? i + 2 : W - 1;
      let acc = 0;
      for (let k = -1; k <= 2; k++) {
        let jj = (j + k) % H;
        if (jj < 0) jj += H;
        const o = jj * W;
        const row = b[o + i0] * wx0 + b[o + i] * wx1 + b[o + i2] * wx2 + b[o + i3] * wx3;
        acc += row * (k === -1 ? wy0 : k === 0 ? wy1 : k === 1 ? wy2 : wy3);
      }
      return acc * this.bScale - this.hOff;
    }
    levelAt(mx, my) {
      const g = this.lg, W = this.lw, H = this.lh, b = this.level;
      const fx = clamp(mx / g, 0, W - 1.0001), fy = my / g;
      const i = Math.floor(fx), j0 = Math.floor(fy), tx = fx - i, ty = fy - j0;
      let j = j0 % H;
      if (j < 0) j += H;
      const j1 = (j + 1) % H;
      const a = b[j * W + i], c = b[j * W + i + 1], d = b[j1 * W + i], e = b[j1 * W + i + 1];
      return (a + (c - a) * tx + (d - a) * ty + (a - c - d + e) * tx * ty) * this.hScale - this.hOff;
    }
    // metres into the hull's glass (+ inside the window, - outside), saturating at +-zRange
    zoneAt(mx, my) {
      const d = this.zone;
      if (!d) return -1e9;
      const W = this.zw, H = this.zh;
      const fx = clamp(mx / this.zpx - 0.5, 0, W - 1.0001), fy = my / this.zpx - 0.5;
      const i = Math.floor(fx), j0 = Math.floor(fy), tx = fx - i, ty = fy - j0;
      let j = j0 % H;
      if (j < 0) j += H;
      const j1 = (j + 1) % H;
      const a = d[j * W + i], c = d[j * W + i + 1], e = d[j1 * W + i], f = d[j1 * W + i + 1];
      const t = (a + (c - a) * tx + (e - a) * ty + (a - c - e + f) * tx * ty - 127.5) / 127.5;
      return (t < 0 ? -1 : 1) * t * t * this.zRange;
    }
    // signed distance to the nearest shore, metres (+ on land), saturating at +-sdfRange
    sdfAt(mx, my) {
      const W = this.sw, H = this.sh, d = this.sdf;
      const fx = clamp(mx / this.spx - 0.5, 0, W - 1.0001), fy = my / this.spx - 0.5;
      const i = Math.floor(fx), j0 = Math.floor(fy), tx = fx - i, ty = fy - j0;
      let j = j0 % H;
      if (j < 0) j += H;
      const j1 = (j + 1) % H;
      const a = d[j * W + i], c = d[j * W + i + 1], e = d[j1 * W + i], f = d[j1 * W + i + 1];
      const v = a + (c - a) * tx + (e - a) * ty + (a - c - e + f) * tx * ty;
      return (v - 127.5) / 127.5 * this.sdfRange;
    }
    // land cover channel (0 developed, 1 tree canopy, 2 sand and bare ground, 3 marsh), 0..1, nearest texel
    coverAt(mx, my, chn) {
      if (!this.cover) return 0;
      const i = clamp(Math.floor(mx / this.cpx), 0, this.cw - 1);
      let j = Math.floor(my / this.cpx) % this.ch;
      if (j < 0) j += this.ch;
      return this.cover[(j * this.cw + i) * 4 + chn] / 255;
    }
    coverBilinear(mx, my, chn, second) {
      const d = second ? this.cover2 : this.cover;
      if (!d) return 0;
      const W = this.cw, H = this.ch;
      const fx = clamp(mx / this.cpx - 0.5, 0, W - 1.0001), fy = my / this.cpx - 0.5;
      const i = Math.floor(fx), j0 = Math.floor(fy), tx = fx - i, ty = fy - j0;
      let j = j0 % H;
      if (j < 0) j += H;
      const j1 = (j + 1) % H;
      const a = d[(j * W + i) * 4 + chn], c = d[(j * W + i + 1) * 4 + chn], e = d[(j1 * W + i) * 4 + chn], f = d[(j1 * W + i + 1) * 4 + chn];
      return (a + (c - a) * tx + (e - a) * ty + (a - c - e + f) * tx * ty) / 255;
    }
    // 'urban core' 0..1: built-up land averaged over about a kilometre
    coreAt(mx, my) {
      if (!this.aux) return 0;
      const i = clamp(Math.floor(mx / this.cpx), 0, this.cw - 1);
      let j = Math.floor(my / this.cpx) % this.ch;
      if (j < 0) j += this.ch;
      return this.aux[(j * this.cw + i) * 3 + 2] / 255;
    }
    townAt(mx, my) {
      if (!this.townId) return 0;
      const i = clamp(Math.floor(mx / this.cpx), 0, this.cw - 1);
      let j = Math.floor(my / this.cpx) % this.ch;
      if (j < 0) j += this.ch;
      return this.townId[j * this.cw + i];
    }
    // Webster inset: weight 0..1 (1 = the sim's own terrain), and its height
    webWeight(mx, my) {
      const fx = (mx - this.wx0) / this.wg, fy = (my - this.wy0) / this.wg, n = this.wn;
      if (fx < 0 || fy < 0 || fx > n - 1.001 || fy > n - 1.001) return 0;
      const i = Math.floor(fx), j = Math.floor(fy), tx = fx - i, ty = fy - j, d = this.webW;
      const a = d[j * n + i], c = d[j * n + i + 1], e = d[(j + 1) * n + i], f = d[(j + 1) * n + i + 1];
      return (a + (c - a) * tx + (e - a) * ty + (a - c - e + f) * tx * ty) / 255;
    }
    webHeight(mx, my) {
      const fx = (mx - this.wx0) / this.wg, fy = (my - this.wy0) / this.wg, n = this.wn;
      const i = Math.floor(fx), j = Math.floor(fy), tx = fx - i, ty = fy - j, d = this.webH;
      const a = d[j * n + i], c = d[j * n + i + 1], e = d[(j + 1) * n + i], f = d[(j + 1) * n + i + 1];
      return a + (c - a) * tx + (e - a) * ty + (a - c - e + f) * tx * ty;
    }
    webIsWater(mx, my) {
      const i = Math.round((mx - this.wx0) / this.wg), j = Math.round((my - this.wy0) / this.wg), n = this.wn;
      if (i < 0 || j < 0 || i >= n || j >= n) return false;
      return this.webWater[j * n + i] > 127;
    }
    webInFoot(mx, my) {
      const i = Math.round((mx - this.wx0) / this.wg), j = Math.round((my - this.wy0) / this.wg), n = this.wn;
      if (i < 0 || j < 0 || i >= n || j >= n) return false;
      return this.webFoot[j * n + i] > 127;
    }
    // -------------------------------------------------------------- regions
    addRegion(rx, ry, reg) {
      reg.used = this.tick;
      this.regions.set(regionKey(rx, ry), reg);
    }
    hasRegionFile(rx, ry) {
      return this.have.has(regionKey(rx, ry));
    }
    // The region holding (mx, my): loaded data, EMPTY_REGION where there is nothing, or null while it is still on its way.
    regionAt(mx, my) {
      if (this.pinned) return this.pinned;
      const rx = Math.floor(mx / RS), ry = Math.floor(my / RS);
      if (rx < 0 || ry < 0 || rx >= RNX || ry >= RNY) return EMPTY_REGION;
      const k = ry * RNX + rx, r = this.regions.get(k);
      if (r !== void 0) {
        r.used = this.tick;
        return r;
      }
      if (!this.have.has(k)) return EMPTY_REGION;
      if (this.onMissingRegion) this.onMissingRegion(rx, ry);
      return null;
    }
    // drop the regions used longest ago
    trimRegions(keep) {
      if (this.regions.size <= keep) return;
      const all = [...this.regions.entries()].sort((a, b) => a[1].used - b[1].used);
      for (let i = 0; i < all.length - keep; i++) this.regions.delete(all[i][0]);
    }
    // Nearest road to (mx,my) within ~60 m.  Result in this._nr; returns edge distance (centre distance - half width).
    nearestRoad(mx, my) {
      const o = this._nr;
      o.road = -1;
      o.d = 1e9;
      o.reg = null;
      const reg = this.regionAt(mx, my);
      if (!reg || !reg.nRoads) return 1e9;
      const lx = mx - reg.x0, ly = my - reg.y0, gw = reg.gw;
      const cx = Math.floor((lx + RM) / RCELL), cy = Math.floor((ly + RM) / RCELL);
      if (cx < 0 || cy < 0 || cx >= gw || cy >= gw) return 1e9;
      const c = cy * gw + cx, e = reg.gstart[c + 1], px = reg.px, py = reg.py, items = reg.gitems, segR = reg.segR, rHw = reg.rHw;
      let best = 1e9, bi = -1, bt = 0, bd = 0, bside = 1;
      for (let q = reg.gstart[c]; q < e; q++) {
        const pi = items[q];
        const ax = px[pi], ay = py[pi], dx2 = px[pi + 1] - ax, dy2 = py[pi + 1] - ay, l2 = dx2 * dx2 + dy2 * dy2;
        const ux = lx - ax, uy = ly - ay;
        let t = l2 > 0 ? (ux * dx2 + uy * dy2) / l2 : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const ex = ux - dx2 * t, ey = uy - dy2 * t;
        const d = Math.sqrt(ex * ex + ey * ey), edge = d - rHw[segR[pi]];
        if (edge < best) {
          best = edge;
          bi = pi;
          bt = t;
          bd = d;
          bside = ux * dy2 - uy * dx2 >= 0 ? 1 : -1;
        }
      }
      if (bi < 0) return 1e9;
      const dx = px[bi + 1] - px[bi], dy = py[bi + 1] - py[bi], len = Math.hypot(dx, dy), il = len > 0 ? 1 / len : 0, ri = segR[bi];
      o.d = bd;
      o.road = ri;
      o.reg = reg;
      o.hw = rHw[ri];
      o.side = bside;
      o.z = reg.pz[bi] + (reg.pz[bi + 1] - reg.pz[bi]) * bt;
      o.s = reg.cum[bi] + len * bt;
      o.tx = dx * il;
      o.ty = dy * il;
      return best;
    }
    // Every road passing within rad of (mx,my), from that point's region: out gets [road, distance along it, tx, ty, d]
    // for the nearest point of each.  Returns the region, or null if it is not loaded.
    roadsNear(mx, my, rad, out) {
      out.length = 0;
      const reg = this.regionAt(mx, my);
      if (!reg || !reg.nRoads) return null;
      const lx = mx - reg.x0, ly = my - reg.y0, gw = reg.gw;
      const cx = Math.floor((lx + RM) / RCELL), cy = Math.floor((ly + RM) / RCELL);
      if (cx < 0 || cy < 0 || cx >= gw || cy >= gw) return reg;
      const c = cy * gw + cx, e = reg.gstart[c + 1], px = reg.px, py = reg.py, items = reg.gitems, segR = reg.segR;
      for (let q = reg.gstart[c]; q < e; q++) {
        const pi = items[q], ax = px[pi], ay = py[pi], dx = px[pi + 1] - ax, dy = py[pi + 1] - ay, l2 = dx * dx + dy * dy;
        let t = l2 > 0 ? ((lx - ax) * dx + (ly - ay) * dy) / l2 : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const d = Math.hypot(lx - ax - dx * t, ly - ay - dy * t);
        if (d > rad) continue;
        const ri = segR[pi], len = Math.sqrt(l2);
        let k = 0;
        for (; k < out.length; k++) if (out[k][0] === ri) break;
        if (k < out.length && out[k][4] <= d) continue;
        out[k] = [ri, reg.cum[pi] + len * t, len > 0 ? dx / len : 1, len > 0 ? dy / len : 0, d];
      }
      return reg;
    }
    // -------------------------------------------------------------- the height function
    // Returns ground (or water surface) height; details in this.g
    // sink: render-only, drops the surface under the Webster sim's own terrain mesh
    groundH(mx, my, carve = true, sink = false) {
      const gi = this.g || (this.g = { water: false, road: -1, reg: null, edge: 1e9, sdf: 0, web: 0, glass: false });
      mx = clamp(mx, 0, L);
      my = wrapY(my);
      const s = this.sdfAt(mx, my), lev = this.levelAt(mx, my);
      gi.sdf = s;
      gi.road = -1;
      gi.reg = null;
      gi.edge = 1e9;
      gi.web = 0;
      let h, water = s <= 0;
      gi.glass = false;
      if (water) {
        h = lev;
        if (this.zone && s < -400 && this.zoneAt(mx, my) > -70) {
          water = false;
          gi.glass = true;
        }
      } else {
        let terr = this.baseH(mx, my);
        terr += ((vnoise(mx / 140, my / 140) - 0.5) * 2.4 + (vnoise(mx / 47 + 13.1, my / 47 + 7.7) - 0.5) * 0.9) * smoothstep(0, 60, s);
        const bank = clamp(30 + 0.6 * (terr - lev), 30, 400);
        const A = lev + 0.3 + Math.max(terr - lev - 0.3, 0) * smoothstep(0, bank, s);
        h = s < bank ? A : A + (terr - A) * smoothstep(bank, 2 * bank, s);
      }
      const ww = this.webWeight(mx, my);
      if (ww > 0) {
        const wh = this.webHeight(mx, my);
        h = h + (wh - h) * ww;
        gi.web = ww;
        if (ww > 0.5) water = this.webIsWater(mx, my);
        if (sink && ww > 0.98 && this.webInFoot(mx, my)) h -= 0.8;
      }
      if (carve) {
        const edge = this.nearestRoad(mx, my);
        if (edge < 40) {
          const nr = this._nr;
          const shoulder = nr.hw < 5 ? 3 : 4 + nr.hw * 0.5;
          const wgt = 1 - smoothstep(0.6, 0.6 + shoulder, edge);
          if (wgt > 0 && nr.reg.rCls[nr.road] === 18) {
            if (!water) {
              h = h + (nr.z - 0.7 - h) * wgt;
              if (edge < 0) water = true;
            }
          } else if (wgt > 0) {
            const zr = water ? Math.max(nr.z, lev + 3.5) : nr.z;
            h = h + (zr - h) * wgt;
            if (wgt > 0.5) water = false;
            gi.road = nr.road;
            gi.reg = nr.reg;
            gi.edge = edge;
          }
        }
      }
      gi.water = water;
      return h;
    }
    // surface normal in local (east, north, up) from central differences
    groundNormal(mx, my, d, out) {
      const hx = this.groundH(mx + d, my) - this.groundH(mx - d, my), hy = this.groundH(mx, my + d) - this.groundH(mx, my - d);
      const nx = -hx / (2 * d), ny = -hy / (2 * d), il = 1 / Math.hypot(nx, ny, 1);
      out[0] = nx * il;
      out[1] = ny * il;
      out[2] = il;
      return out;
    }
  };
  var _f32 = new Float32Array(1);
  var _u32 = new Uint32Array(_f32.buffer);
  function toHalf(v) {
    _f32[0] = v;
    const x = _u32[0], sign = x >> 16 & 32768;
    let m = x >> 12 & 2047;
    const e = x >> 23 & 255;
    if (e < 103) return sign;
    if (e > 142) return sign | 31744;
    if (e < 113) {
      m |= 2048;
      return sign | (m >> 114 - e) + (m >> 113 - e & 1);
    }
    return (sign | e - 112 << 10 | m >> 1) + (m & 1);
  }

  // src/cars.js
  var CM = { PAINT: 0, GLASS: 1, DARK: 2, TYRE: 3, HUB: 4, HEAD: 5, TAIL: 6, PLATE: 7, CLAD: 8 };
  var SPEC = [
    {
      // a mid-size sedan
      top: [[-2.31, 0.73], [-2.2, 0.8], [-1.95, 0.86], [-0.92, 0.955], [-0.12, 1.4], [0.28, 1.44], [0.85, 1.42], [1.58, 1.04], [2.18, 1], [2.31, 0.9]],
      belt: [[-2.31, 0.69], [-2.2, 0.76], [-1.95, 0.82], [-0.92, 0.92], [0.28, 0.955], [1.58, 1], [2.18, 0.965], [2.31, 0.87]],
      hw: [[-2.31, 0.72], [-2.2, 0.84], [-1.95, 0.895], [-0.92, 0.91], [1.58, 0.91], [2.18, 0.85], [2.31, 0.74]],
      under: [[-2.31, 0.34], [-2.2, 0.27], [-1.95, 0.2], [1.95, 0.2], [2.18, 0.29], [2.31, 0.4]],
      wheel: { zf: -1.4, zr: 1.36, r: 0.33, x: 0.775, w: 0.23, arch: 0.42 },
      a0: -0.92,
      a1: -0.12,
      c0: 0.85,
      c1: 1.58,
      pillars: [0.4],
      clad: 0
    },
    {
      // a crossover
      top: [[-2.29, 0.8], [-2.19, 0.9], [-1.92, 0.99], [-0.98, 1.09], [-0.24, 1.6], [0.3, 1.665], [1.72, 1.63], [2.13, 1.14], [2.24, 1.06], [2.29, 0.96]],
      belt: [[-2.29, 0.76], [-2.19, 0.86], [-1.92, 0.95], [-0.98, 1.05], [0.3, 1.09], [1.72, 1.13], [2.13, 1.11], [2.24, 1.03], [2.29, 0.93]],
      hw: [[-2.29, 0.75], [-2.19, 0.87], [-1.92, 0.925], [-0.98, 0.935], [1.72, 0.935], [2.13, 0.915], [2.24, 0.86], [2.29, 0.78]],
      under: [[-2.29, 0.42], [-2.19, 0.35], [-1.92, 0.27], [1.92, 0.27], [2.13, 0.33], [2.29, 0.46]],
      wheel: { zf: -1.38, zr: 1.36, r: 0.36, x: 0.8, w: 0.24, arch: 0.455 },
      a0: -0.98,
      a1: -0.24,
      c0: 1.72,
      c1: 2.13,
      pillars: [0.26, 1.06],
      clad: 1
    }
  ];
  var key = (K, z) => {
    if (z <= K[0][0]) return K[0][1];
    for (let i = 1; i < K.length; i++) if (z <= K[i][0]) {
      const a = K[i - 1], b = K[i];
      return a[1] + (b[1] - a[1]) * (z - a[0]) / (b[0] - a[0]);
    }
    return K[K.length - 1][1];
  };
  var mix = (a, b, t) => a + (b - a) * t;
  function carMesh(variant = 0, detail = 0) {
    const S = SPEC[variant], W = S.wheel;
    const P2 = [], N = [], M = [];
    const tri = (a, b, c, na, nb, nc, m) => {
      P2.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
      N.push(na[0], na[1], na[2], nb[0], nb[1], nb[2], nc[0], nc[1], nc[2]);
      M.push(m, m, m);
    };
    const flat = (pts, want, m) => {
      const a = pts[0], b = pts[1], c = pts[2];
      let nx = (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]), ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]), nz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
      const l = Math.hypot(nx, ny, nz) || 1;
      nx /= l;
      ny /= l;
      nz /= l;
      const back = nx * want[0] + ny * want[1] + nz * want[2] < 0;
      const n = back ? [-nx, -ny, -nz] : [nx, ny, nz];
      for (let i = 1; i < pts.length - 1; i++) back ? tri(a, pts[i + 1], pts[i], n, n, n, m) : tri(a, pts[i], pts[i + 1], n, n, n, m);
    };
    const box = (x0, x1, y0, y1, z0, z1, m) => {
      flat([[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]], [1, 0, 0], m);
      flat([[x0, y0, z0], [x0, y1, z0], [x0, y1, z1], [x0, y0, z1]], [-1, 0, 0], m);
      flat([[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], [0, 1, 0], m);
      flat([[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], [0, -1, 0], m);
      flat([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [0, 0, 1], m);
      flat([[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]], [0, 0, -1], m);
    };
    let zs = [];
    for (const K of [S.top, S.belt, S.hw, S.under]) for (const k of K) zs.push(k[0]);
    const arcs = detail ? [-1, -0.9, -0.71, -0.4, 0, 0.4, 0.71, 0.9, 1] : [-1, -0.66, 0, 0.66, 1];
    for (const zc of [W.zf, W.zr]) for (const t of arcs) zs.push(zc + t * W.arch);
    for (const zp of S.pillars) zs.push(zp - 0.045, zp + 0.045);
    zs.sort((a, b) => a - b);
    let st = [];
    for (const z of zs) if (!st.length || z - st[st.length - 1] > 0.025) st.push(z);
    if (detail) {
      const o = [];
      for (let i = 0; i < st.length; i++) {
        if (i) {
          const d = st[i] - st[i - 1], k = Math.ceil(d / 0.36);
          for (let j = 1; j < k; j++) o.push(st[i - 1] + d * j / k);
        }
        o.push(st[i]);
      }
      st = o;
    }
    for (const zc of [S.a0, S.c1]) {
      let b = 0;
      for (let i = 1; i < st.length; i++) if (Math.abs(st[i] - zc) < Math.abs(st[b] - zc)) b = i;
      st.splice(b, 0, st[b]);
    }
    const cabin = (z) => z <= S.a0 ? 0 : z < S.a1 ? (z - S.a0) / (S.a1 - S.a0) : z <= S.c0 ? 1 : z < S.c1 ? (S.c1 - z) / (S.c1 - S.c0) : 0;
    const KR = 10, RN = 2 * KR - 2;
    const ring = (z) => {
      const w = key(S.hw, z), yb = key(S.belt, z), yt = Math.max(key(S.top, z), yb + 0.012), yu = key(S.under, z), g = cabin(z);
      let ya = 0;
      for (const zc of [W.zf, W.zr]) {
        const d = Math.abs(z - zc);
        if (d < W.arch + 1e-6) ya = Math.max(ya, W.r * 0.93 + Math.sqrt(Math.max(W.arch * W.arch - d * d, 0)));
      }
      const ys0 = yu + 0.1, ys = Math.max(ys0, ya), yw = Math.max(yu, ya);
      const ym = Math.max(ys0 + (yb - ys0) * (S.clad ? 0.3 : 0.42), ys + 0.035);
      const x6 = w - mix(0.15, 0.2, g), y6 = yb + (yt - yb) * mix(0.5, 0.87, g);
      const x7 = x6 - mix(0.14, 0.11, g), y7 = yb + (yt - yb) * mix(0.8, 0.976, g);
      const h = [[0, yu], [w - 0.27, yw], [w - 0.012, ys], [w + 0.01, ym], [w, yb - 0.055], [w - 0.045, yb], [w - 0.045, yb], [x6, y6], [x7, y7], [0, yt]];
      const out = [];
      for (let j = 0; j < KR; j++) out.push([h[j][0], h[j][1], z]);
      for (let j = KR - 2; j >= 1; j--) out.push([-h[j][0], h[j][1], z]);
      return out;
    };
    const G = st.map(ring), ns = st.length;
    const bandMat = (b, zm) => {
      if (b > 8) b = 17 - b;
      if (b <= 1) return CM.DARK;
      if (b === 2) return S.clad ? CM.CLAD : CM.PAINT;
      if (b === 6) {
        if (zm < S.a0 || zm > S.c0) return CM.PAINT;
        for (const zp of S.pillars) if (Math.abs(zm - zp) < 0.045) return CM.DARK;
        return CM.GLASS;
      }
      if (b === 8) return zm > S.a0 && zm < S.a1 || zm > S.c0 && zm < S.c1 ? CM.GLASS : CM.PAINT;
      return CM.PAINT;
    };
    const nrm = G.map((r) => r.map(() => [0, 0, 0]));
    const live = (i, k) => st[i + 1] - st[i] > 1e-6 && k !== 5 && k !== 12;
    for (let i = 0; i < ns - 1; i++) for (let k = 0; k < RN; k++) {
      if (!live(i, k)) continue;
      const k1 = (k + 1) % RN, A = G[i][k], B = G[i][k1], C2 = G[i + 1][k1], D = G[i + 1][k];
      const ux = C2[0] - A[0], uy = C2[1] - A[1], uz = C2[2] - A[2], vx = D[0] - B[0], vy = D[1] - B[1], vz = D[2] - B[2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      for (const q of [nrm[i][k], nrm[i][k1], nrm[i + 1][k1], nrm[i + 1][k]]) {
        q[0] += nx;
        q[1] += ny;
        q[2] += nz;
      }
    }
    for (const r of nrm) for (const q of r) {
      const l = Math.hypot(q[0], q[1], q[2]) || 1;
      q[0] /= l;
      q[1] /= l;
      q[2] /= l;
    }
    for (let i = 0; i < ns; i++) for (const k of [0, KR - 1]) {
      const q = nrm[i][k];
      q[0] = 0;
      const l = Math.hypot(q[1], q[2]) || 1;
      q[1] /= l;
      q[2] /= l;
    }
    for (let i = 0; i < ns - 1; i++) for (let k = 0; k < RN; k++) {
      if (!live(i, k)) continue;
      const k1 = (k + 1) % RN, m = bandMat(k, (st[i] + st[i + 1]) / 2);
      tri(G[i][k], G[i][k1], G[i + 1][k1], nrm[i][k], nrm[i][k1], nrm[i + 1][k1], m);
      tri(G[i][k], G[i + 1][k1], G[i + 1][k], nrm[i][k], nrm[i + 1][k1], nrm[i + 1][k], m);
    }
    const cap = (r, dir) => {
      let cy = 0;
      for (const p of r) cy += p[1];
      cy /= r.length;
      const c = [0, cy, r[0][2]];
      for (let k = 0; k < RN; k++) {
        const k1 = (k + 1) % RN;
        if (k === 5 || k === 12) continue;
        flat([c, r[k], r[k1]], [0, 0, dir], CM.PAINT);
      }
    };
    cap(G[0], -1);
    cap(G[ns - 1], 1);
    const zF = st[0] - 6e-3, zB = st[ns - 1] + 6e-3;
    const wF = key(S.hw, st[0]), bF = key(S.belt, st[0]), uF = key(S.under, st[0]);
    const wB = key(S.hw, st[ns - 1]), bB = key(S.belt, st[ns - 1]), uB = key(S.under, st[ns - 1]);
    const panel = (x0, x1, y0, y1, z, dir, m) => flat([[x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z]], [0, 0, dir], m);
    for (const sx of [-1, 1]) panel(sx * 0.5 * wF, sx * (0.95 * wF - 0.02), bF - 0.125, bF - 0.02, zF, -1, CM.HEAD);
    panel(-0.44 * wF, 0.44 * wF, bF - 0.135, bF - 0.035, zF, -1, CM.DARK);
    panel(-0.64 * wF, 0.64 * wF, uF + 0.035, uF + 0.115, zF, -1, CM.DARK);
    for (const sx of [-1, 1]) panel(sx * 0.48 * wB, sx * (0.95 * wB - 0.02), bB - 0.15, bB - 0.03, zB, 1, CM.TAIL);
    panel(-0.17, 0.17, bB - 0.29, bB - 0.17, zB, 1, CM.PLATE);
    panel(-0.66 * wB, 0.66 * wB, uB + 0.03, uB + 0.1, zB, 1, CM.DARK);
    {
      const zm = S.a0 + 0.3, wm = key(S.hw, zm), ym = key(S.belt, zm) + 0.03;
      for (const sx of [-1, 1]) {
        const xa = sx * (wm - 0.06), xb = sx * (wm + 0.15);
        box(Math.min(xa, xb), Math.max(xa, xb), ym, ym + 0.105, zm - 0.04, zm + 0.045, CM.PAINT);
      }
    }
    const seg = detail ? 20 : 10, rh = W.r * 0.6;
    for (const sx of [-1, 1]) for (const zc of [W.zf, W.zr]) {
      const xo = sx * (W.x + W.w / 2), xi = sx * (W.x - W.w / 2), xh = xo - sx * 0.014, yc = W.r;
      for (let k = 0; k < seg; k++) {
        const a0 = k / seg * 2 * Math.PI, a1 = (k + 1) / seg * 2 * Math.PI, c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
        const o0 = [xo, yc + W.r * s0, zc + W.r * c0], o1 = [xo, yc + W.r * s1, zc + W.r * c1], i0 = [xi, yc + W.r * s0, zc + W.r * c0], i1 = [xi, yc + W.r * s1, zc + W.r * c1];
        const n0 = [0, s0, c0], n1 = [0, s1, c1];
        if (sx > 0) {
          tri(i0, o0, o1, n0, n0, n1, CM.TYRE);
          tri(i0, o1, i1, n0, n1, n1, CM.TYRE);
        } else {
          tri(i0, o1, o0, n0, n1, n0, CM.TYRE);
          tri(i0, i1, o1, n0, n1, n1, CM.TYRE);
        }
        const h0 = [xo, yc + rh * s0, zc + rh * c0], h12 = [xo, yc + rh * s1, zc + rh * c1];
        flat([o0, o1, h12, h0], [sx, 0, 0], CM.TYRE);
        flat([[xh, yc, zc], [xh, yc + rh * s0, zc + rh * c0], [xh, yc + rh * s1, zc + rh * c1]], [sx, 0, 0], CM.HUB);
        flat([[xi, yc, zc], i0, i1], [-sx, 0, 0], CM.TYRE);
      }
    }
    return { pos: new Float32Array(P2), nor: new Float32Array(N), mat: new Uint8Array(M), n: M.length, len: st[ns - 1] - st[0], wheel: W };
  }

  // src/houses.js
  var CLS = { HOUSE: 0, CAPE: 1, RANCH: 2, TRIPLE: 3, GARAGE: 4, BARN: 5, APART: 6, COMM: 7, INDUS: 8, CHURCH: 9, CIVIC: 10, TOWER: 11, CANOPY: 12, RETAIL: 13, ROW: 14, MULTI: 15 };
  var ROOF = { FLAT: 0, GABLE: 1, HIP: 2, GAMBREL: 3 };
  var MAT = { WALL: 0, ROOF: 1, TRIM: 2, FLATROOF: 3, BRICK: 4, CONCRETE: 5, DECK: 6, RAIL: 7, METAL: 8, GLASSBOX: 9, ASPHALT: 10, CAR: 11, CARDARK: 12, CARGLASS: 13, CARPALE: 14, CARTAIL: 15 };
  var FLOOR = [2.75, 2.6, 2.7, 3, 2.6, 5, 3, 3.7, 7, 8, 3.9, 3.9, 4.6, 6, 3.1, 2.8];
  var FOUND = [0.5, 0.45, 0.35, 0.6, 0.1, 0.2, 0.4, 0.2, 0.15, 0.6, 0.5, 0.3, 0, 0.15, 0.7, 0.6];
  var PITCH = [0.62, 0.95, 0.38, 0.22, 0.5, 0.75, 0, 0.55, 0.25, 1.15, 0.45, 0, 0, 0, 0.5, 0.68];
  var BREC = 12;
  var h1 = (a, b) => {
    let h = Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) | 0;
    h = Math.imul(h ^ h >>> 13, 1274126177);
    return ((h ^ h >>> 16) >>> 0) / 4294967296;
  };
  function cellBuildings(reg, cx, cy) {
    if (!reg || !reg.nBld || cx < 0 || cy < 0 || cx >= reg.cells || cy >= reg.cells) return null;
    const c = cy * reg.cells + cx, a = reg.bCell[c], n = reg.bCell[c + 1] - a;
    if (n <= 0) return null;
    const out = new Float32Array(n * 16), b = reg.b;
    for (let i = 0; i < n; i++) {
      const o = (a + i) * BREC, k = i * 16;
      out[k] = reg.x0 + (b[o] | b[o + 1] << 8) * 0.2;
      out[k + 1] = reg.y0 + (b[o + 2] | b[o + 3] << 8) * 0.2;
      const wq = b[o + 4] / 16, dq = b[o + 5] / 16, hq = b[o + 7] / 16;
      out[k + 2] = wq * wq;
      out[k + 3] = dq * dq;
      out[k + 4] = b[o + 6] / 256 * Math.PI;
      out[k + 5] = hq * hq;
      const cb = b[o + 8], lb = b[o + 9];
      out[k + 6] = cb & 15;
      out[k + 7] = cb >> 4 & 3;
      out[k + 8] = cb >> 6 & 3;
      out[k + 9] = lb & 63;
      out[k + 10] = lb >> 6 & 1;
      out[k + 11] = lb >> 7 & 1;
      out[k + 12] = b[o + 10] & 7;
      out[k + 13] = b[o + 11];
      out[k + 14] = a + i;
    }
    return out;
  }
  var Mesh = class {
    constructor() {
      this.n = 0;
      this.cap = 8192;
      this.ni = 0;
      this.icap = 16384;
      this.pos = new Float32Array(this.cap * 3);
      this.nor = new Int8Array(this.cap * 4);
      this.uv = new Float32Array(this.cap * 2);
      this.w = new Float32Array(this.cap * 4);
      this.m = new Uint8Array(this.cap * 4);
      this.c = new Float32Array(this.cap * 3);
      this.idx = new Uint32Array(this.icap);
      this.W = [0, 0, 0, -1];
      this.M = [0, 0, 0, 0];
      this.C = [0, 0, 0];
      this.ox = 0;
      this.oy = 0;
      this.oz = 0;
      this.ux = 1;
      this.uz = 0;
      this.vx = 0;
      this.vz = 1;
    }
    grow() {
      const g = (a, k) => {
        const b = new a.constructor(this.cap * 2 * k);
        b.set(a);
        return b;
      };
      this.pos = g(this.pos, 3);
      this.nor = g(this.nor, 4);
      this.uv = g(this.uv, 2);
      this.w = g(this.w, 4);
      this.m = g(this.m, 4);
      this.c = g(this.c, 3);
      this.cap *= 2;
    }
    // a vertex given in the building's frame (u along the footprint's yaw, y up, v across), with its normal there
    v(pu, py, pv, nu, ny, nv, tu, tv) {
      if (this.n === this.cap) this.grow();
      const i = this.n++, p = this.pos, q = this.nor;
      p[i * 3] = this.ox + this.ux * pu + this.vx * pv;
      p[i * 3 + 1] = this.oy + py;
      p[i * 3 + 2] = this.oz + this.uz * pu + this.vz * pv;
      q[i * 4] = Math.round((this.ux * nu + this.vx * nv) * 127);
      q[i * 4 + 1] = Math.round(ny * 127);
      q[i * 4 + 2] = Math.round((this.uz * nu + this.vz * nv) * 127);
      this.uv[i * 2] = tu;
      this.uv[i * 2 + 1] = tv;
      this.w.set(this.W, i * 4);
      this.m.set(this.M, i * 4);
      this.c.set(this.C, i * 3);
      return i;
    }
    tri(a, b, c) {
      if (this.ni + 3 > this.icap) {
        const t = new Uint32Array(this.icap * 2);
        t.set(this.idx);
        this.idx = t;
        this.icap *= 2;
      }
      const p = this.pos, q = this.nor;
      const ax = p[a * 3], ay = p[a * 3 + 1], az = p[a * 3 + 2];
      const e1x = p[b * 3] - ax, e1y = p[b * 3 + 1] - ay, e1z = p[b * 3 + 2] - az, e2x = p[c * 3] - ax, e2y = p[c * 3 + 1] - ay, e2z = p[c * 3 + 2] - az;
      const gx = e1y * e2z - e1z * e2y, gy = e1z * e2x - e1x * e2z, gz = e1x * e2y - e1y * e2x;
      const flip = gx * q[a * 4] + gy * q[a * 4 + 1] + gz * q[a * 4 + 2] < 0;
      this.idx[this.ni++] = a;
      this.idx[this.ni++] = flip ? c : b;
      this.idx[this.ni++] = flip ? b : c;
    }
    quad(a, b, c, d) {
      this.tri(a, b, c);
      this.tri(a, c, d);
    }
    // a planar quad from four corners [u, y, v], normal given, texture coordinates from two axes in the plane
    face(P0, P1, P2, P3, n, ta, tb) {
      const f = (P4) => this.v(P4[0], P4[1], P4[2], n[0], n[1], n[2], P4[0] * ta[0] + P4[1] * ta[1] + P4[2] * ta[2], P4[0] * tb[0] + P4[1] * tb[1] + P4[2] * tb[2]);
      this.quad(f(P0), f(P1), f(P2), f(P3));
    }
    // an axis-aligned box in the building frame (u0..u1, y0..y1, v0..v1); which = faces to emit: bits +u,-u,+y,-y,+v,-v
    box(u0, u1, y0, y1, v0, v1, which = 63) {
      const X = [1, 0, 0], Y = [0, 1, 0], Z = [0, 0, 1];
      if (which & 1) this.face([u1, y0, v0], [u1, y0, v1], [u1, y1, v1], [u1, y1, v0], [1, 0, 0], Z, Y);
      if (which & 2) this.face([u0, y0, v0], [u0, y0, v1], [u0, y1, v1], [u0, y1, v0], [-1, 0, 0], Z, Y);
      if (which & 4) this.face([u0, y1, v0], [u1, y1, v0], [u1, y1, v1], [u0, y1, v1], [0, 1, 0], X, Z);
      if (which & 8) this.face([u0, y0, v0], [u1, y0, v0], [u1, y0, v1], [u0, y0, v1], [0, -1, 0], X, Z);
      if (which & 16) this.face([u0, y0, v1], [u1, y0, v1], [u1, y1, v1], [u0, y1, v1], [0, 0, 1], X, Y);
      if (which & 32) this.face([u0, y0, v0], [u1, y0, v0], [u1, y1, v0], [u0, y1, v0], [0, 0, -1], X, Y);
    }
  };
  var CARS = null;
  var CAR_MAT = [MAT.CAR, MAT.CARGLASS, MAT.CARDARK, MAT.CARDARK, MAT.CARPALE, MAT.CARPALE, MAT.CARTAIL, MAT.CARPALE, MAT.CARDARK];
  function putCar(M, setM, variant, cu, cy, cv, fu, fv) {
    if (!CARS) CARS = [carMesh(0, 0), carMesh(1, 0)];
    const m = CARS[variant], P2 = m.pos, N = m.nor, ru = fv, rv = -fu, ix = [0, 0, 0];
    let last = -1;
    for (let i = 0; i < m.n; i += 3) {
      const mm = CAR_MAT[m.mat[i]];
      if (mm !== last) {
        setM(mm);
        last = mm;
      }
      for (let j = 0; j < 3; j++) {
        const q = (i + j) * 3, x = P2[q], z = P2[q + 2], nx = N[q], nz = N[q + 2];
        ix[j] = M.v(cu + x * ru - z * fu, cy + P2[q + 1], cv + x * rv - z * fv, nx * ru - nz * fu, N[q + 1], nx * rv - nz * fv, 0, 0);
      }
      M.tri(ix[0], ix[1], ix[2]);
    }
  }
  function wallsOf(w, d) {
    const a = w / 2, b = d / 2;
    return [[a, -b, a, b, 1, 0, d], [a, b, -a, b, 0, 1, w], [-a, b, -a, -b, -1, 0, d], [-a, -b, a, -b, 0, -1, w]];
  }
  function bayWidth(cls) {
    return cls === CLS.TRIPLE || cls === CLS.MULTI || cls === CLS.ROW ? 2.5 : cls >= CLS.APART && cls !== CLS.CHURCH && cls !== CLS.ROW ? 3.4 : 2.9;
  }
  function doorAt(len, cls, seed) {
    const nb = Math.max(1, Math.floor((len - 0.6) / bayWidth(cls)));
    let bi = nb >> 1;
    if (nb >= 2 && (cls === CLS.TRIPLE || cls === CLS.MULTI || cls === CLS.ROW)) bi = seed & 1 ? 0 : nb - 1;
    return (bi + 0.5) * len / nb;
  }
  function building(M, B, k, g, gmin, gmax, env) {
    const w = B[k + 2], d = B[k + 3], wallH = B[k + 5], cls = B[k + 6], roof = B[k + 7], side = B[k + 8], levels = Math.max(1, B[k + 9]);
    const porch = B[k + 10] > 0, chimney = B[k + 11] > 0, mat = B[k + 12], seed = B[k + 13], id = B[k + 14];
    const r1 = h1(id, seed * 7 + 1), r2 = h1(id * 3 + 5, seed + 11), r3 = h1(id + 77, seed * 3 + 2);
    const y0 = clamp(gmax - g, 0, 2.5);
    const yb = Math.min(gmin - g, 0) - 0.6;
    const found = FOUND[cls];
    const flat = roof === ROOF.FLAT;
    const pitch = PITCH[cls] * (0.9 + 0.25 * r1) * (roof === ROOF.HIP ? 0.8 : 1);
    const par = flat ? cls === CLS.TRIPLE || cls === CLS.ROW ? 0 : cls === CLS.CANOPY ? 0 : 0.5 + 0.5 * r2 : 0;
    const He = y0 + wallH, top = He + par;
    const rise = flat ? 0 : w / 2 * pitch;
    const Hr = He + rise;
    const W4 = wallsOf(w, d);
    M.C[1] = M.oy;
    const setM = (m) => {
      M.M[0] = m;
      M.M[1] = mat;
      M.M[2] = cls;
      M.M[3] = seed;
    };
    if (cls === CLS.CANOPY) {
      setM(MAT.METAL);
      M.W[0] = 0;
      M.W[1] = 0;
      M.W[2] = 0;
      M.W[3] = -1;
      M.box(-w / 2, w / 2, He - 0.45, He, -d / 2, d / 2);
      const px = Math.max(w / 2 - 0.6, 0.2), pv = Math.max(d / 2 - 0.6, 0.2);
      for (const su of [-1, 1]) for (const sv of [-1, 1]) M.box(su * px - 0.14, su * px + 0.14, yb, He - 0.45, sv * pv - 0.14, sv * pv + 0.14, 51);
      return;
    }
    setM(MAT.WALL);
    for (let s = 0; s < 4; s++) {
      const [p0u, p0v, p1u, p1v, nu, nv, len] = W4[s];
      const gableEnd = !flat && roof !== ROOF.HIP && (s === 1 || s === 3);
      const front = s === side;
      let flags = (gableEnd ? 1 : 0) | (front ? 2 : 0);
      let door = -1;
      if (front) {
        door = doorAt(len, cls, seed);
        if (cls === CLS.GARAGE || cls === CLS.BARN) flags |= 4;
        if ((cls === CLS.COMM || cls === CLS.RETAIL) && len > 5) flags |= 8;
      } else if (cls === CLS.INDUS && s === (side + 2) % 4) {
        door = len * (0.3 + 0.4 * r2);
        flags |= 4;
      }
      M.W[0] = len;
      M.W[1] = He - y0;
      M.W[2] = levels + 64 * flags;
      M.W[3] = door;
      const a = M.v(p0u, yb, p0v, nu, 0, nv, 0, yb - y0), b = M.v(p1u, yb, p1v, nu, 0, nv, len, yb - y0);
      const c = M.v(p1u, top, p1v, nu, 0, nv, len, top - y0), e = M.v(p0u, top, p0v, nu, 0, nv, 0, top - y0);
      M.quad(a, b, c, e);
      if (gableEnd) {
        const t = M.v((p0u + p1u) / 2, Hr, (p0v + p1v) / 2, nu, 0, nv, len / 2, Hr - y0);
        if (roof === ROOF.GAMBREL) {
          const ku = len * 0.22, ky = He + rise * 0.72;
          const k0 = M.v(p0u + (p1u - p0u) * 0.22, ky, p0v + (p1v - p0v) * 0.22, nu, 0, nv, ku, ky - y0);
          const k1 = M.v(p0u + (p1u - p0u) * 0.78, ky, p0v + (p1v - p0v) * 0.78, nu, 0, nv, len - ku, ky - y0);
          M.tri(e, c, k1);
          M.tri(e, k1, k0);
          M.tri(k0, k1, t);
        } else M.tri(e, c, t);
      }
      if (flat && par > 0) {
        setM(MAT.CONCRETE);
        M.W[3] = -1;
        const i0 = M.v(p0u, He, p0v, -nu, 0, -nv, 0, 0), i1 = M.v(p1u, He, p1v, -nu, 0, -nv, len, 0), i2 = M.v(p1u, top, p1v, -nu, 0, -nv, len, par), i3 = M.v(p0u, top, p0v, -nu, 0, -nv, 0, par);
        M.quad(i0, i1, i2, i3);
        setM(MAT.WALL);
      }
    }
    M.W[3] = -1;
    M.W[2] = 0;
    const ov = cls === CLS.GARAGE ? 0.2 : cls === CLS.RANCH ? 0.5 : 0.36, rk = cls === CLS.GARAGE ? 0.15 : 0.26, th = 0.17;
    if (flat) {
      setM(MAT.FLATROOF);
      M.face([-w / 2, He, -d / 2], [w / 2, He, -d / 2], [w / 2, He, d / 2], [-w / 2, He, d / 2], [0, 1, 0], [1, 0, 0], [0, 0, 1]);
      if (cls === CLS.TRIPLE || cls === CLS.ROW) {
        setM(MAT.TRIM);
        const o = 0.38, a = w / 2 + o, b = d / 2 + o;
        M.box(-a, a, He - 0.42, He + 0.12, -b, b, 51 | 8);
        setM(MAT.FLATROOF);
        M.face([-a, He + 0.12, -b], [a, He + 0.12, -b], [a, He + 0.12, b], [-a, He + 0.12, b], [0, 1, 0], [1, 0, 0], [0, 0, 1]);
      } else if (w * d > 380) {
        setM(MAT.METAL);
        const nU = Math.min(5, 1 + Math.floor(w * d / 900));
        for (let i = 0; i < nU; i++) {
          const a = h1(id + i * 13, 5), b = h1(id + i * 29, 9), sz = 1.4 + 2.2 * h1(id + i, 21);
          const cu = (a - 0.5) * (w - sz - 3), cv = (b - 0.5) * (d - sz - 3);
          M.box(cu - sz / 2, cu + sz / 2, He, He + 0.9 + 0.9 * a, cv - sz * 0.4, cv + sz * 0.4, 55);
        }
      }
    } else if (roof === ROOF.HIP) {
      const a = w / 2 + ov, b = d / 2 + ov, ye = He - ov * pitch, rl = Math.max(d / 2 - w / 2, 0);
      const sl = Math.hypot(1, pitch), nu = pitch / sl, ny = 1 / sl;
      setM(MAT.ROOF);
      for (const s of [1, -1]) {
        const e0 = M.v(s * a, ye, -b, s * nu, ny, 0, -b, 0), e1 = M.v(s * a, ye, b, s * nu, ny, 0, b, 0);
        const r1v = M.v(0, Hr, rl, s * nu, ny, 0, rl, a * sl), r0v = M.v(0, Hr, -rl, s * nu, ny, 0, -rl, a * sl);
        M.quad(e0, e1, r1v, r0v);
      }
      for (const s of [1, -1]) {
        const e0 = M.v(-a, ye, s * b, 0, ny, s * nu, -a, 0), e1 = M.v(a, ye, s * b, 0, ny, s * nu, a, 0), rr = M.v(0, Hr, s * rl, 0, ny, s * nu, 0, a * sl);
        M.tri(e0, e1, rr);
      }
      setM(MAT.TRIM);
      M.box(-a, a, ye - th, ye, -b, b, 51 | 8);
    } else {
      const a = w / 2 + ov, b = d / 2 + rk;
      const prof = roof === ROOF.GAMBREL ? [[a, He - ov * pitch * 1.6], [w * 0.28, He + rise * 0.72], [0, Hr]] : [[a, He - ov * pitch], [0, Hr]];
      for (const s of [1, -1]) {
        for (let i = 0; i + 1 < prof.length; i++) {
          const [u0, ya] = prof[i], [u1, yb2] = prof[i + 1];
          const run = u0 - u1, rs = yb2 - ya, sl = Math.hypot(run, rs), nu = rs / sl, ny = run / sl;
          const base = i === 0 ? 0 : Math.hypot(prof[0][0] - prof[1][0], prof[1][1] - prof[0][1]);
          setM(MAT.ROOF);
          const e0 = M.v(s * u0, ya, -b, s * nu, ny, 0, -b, base), e1 = M.v(s * u0, ya, b, s * nu, ny, 0, b, base);
          const q1 = M.v(s * u1, yb2, b, s * nu, ny, 0, b, base + sl), q0 = M.v(s * u1, yb2, -b, s * nu, ny, 0, -b, base + sl);
          M.quad(e0, e1, q1, q0);
          setM(MAT.TRIM);
          for (const sv of [1, -1]) {
            M.face([s * u0, ya - th, sv * b], [s * u0, ya, sv * b], [s * u1, yb2, sv * b], [s * u1, yb2 - th, sv * b], [0, 0, sv], [1, 0, 0], [0, 1, 0]);
            M.face([s * u0, ya - th, sv * b], [s * u1, yb2 - th, sv * b], [s * u1, yb2 - th, sv * d / 2], [s * u0, ya - th, sv * d / 2], [-s * nu, -ny, 0], [0, 0, 1], [1, 0, 0]);
          }
        }
        setM(MAT.TRIM);
        const ye = prof[0][1];
        M.face([s * a, ye - th, -b], [s * a, ye - th, b], [s * a, ye, b], [s * a, ye, -b], [s, 0, 0], [0, 0, 1], [0, 1, 0]);
        M.face([s * w / 2, ye - th, -b], [s * a, ye - th, -b], [s * a, ye - th, b], [s * w / 2, ye - th, b], [0, -1, 0], [1, 0, 0], [0, 0, 1]);
      }
    }
    if (chimney && !flat) {
      setM(MAT.BRICK);
      const cv = (r2 - 0.5) * 0.55 * d, cu = roof === ROOF.HIP ? 0 : (r3 - 0.5) * 0.3 * w;
      const yc = Hr - Math.abs(cu) * pitch;
      M.box(cu - 0.32, cu + 0.32, yc - 0.9, yc + 0.95, cv - 0.42, cv + 0.42, 55);
    } else if (chimney && flat) {
      setM(MAT.BRICK);
      const cv = (r2 - 0.5) * 0.6 * d;
      M.box(w / 2 - 0.75, w / 2 - 0.1, He - 0.2, He + 1.25, cv - 0.4, cv + 0.4, 55);
    }
    if (cls === CLS.CHURCH) {
      const [p0u, p0v, p1u, p1v, nu, nv, len] = W4[side];
      const mu = (p0u + p1u) / 2 - nu * 1.2, mv = (p0v + p1v) / 2 - nv * 1.2, hw = Math.min(2.1, len * 0.28);
      const tw = Hr + 3.5 + 2.5 * r1;
      setM(MAT.TRIM);
      M.box(mu - hw, mu + hw, He - 0.5, tw, mv - hw, mv + hw, 51);
      setM(MAT.ROOF);
      const sp = tw + 6 + 5 * r2, sl = Math.hypot(hw, sp - tw), ny = hw / sl, nn = (sp - tw) / sl;
      const apex = [mu, sp, mv];
      for (const [du, dv] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const c0 = [mu + du * hw - dv * hw, tw, mv + dv * hw - du * hw], c1 = [mu + du * hw + dv * hw, tw, mv + dv * hw + du * hw];
        const i0 = M.v(c0[0], c0[1], c0[2], du * nn, ny, dv * nn, 0, 0), i1 = M.v(c1[0], c1[1], c1[2], du * nn, ny, dv * nn, hw * 2, 0), i2 = M.v(apex[0], apex[1], apex[2], du * nn, ny, dv * nn, hw, sl);
        M.tri(i0, i1, i2);
      }
    }
    if (cls <= CLS.TRIPLE || cls === CLS.ROW || cls === CLS.MULTI) {
      const [p0u, p0v, p1u, p1v, nu, nv, len] = W4[side];
      const tu = (p1u - p0u) / len, tv = (p1v - p0v) / len;
      const du = doorAt(len, cls, seed);
      const floorY = y0 + found;
      let walkFrom = 0.25;
      const wbox = (a0, a1, o0, o1, ya, yb2, which) => {
        const us = [p0u + tu * a0 + nu * o0, p0u + tu * a1 + nu * o0, p0u + tu * a0 + nu * o1, p0u + tu * a1 + nu * o1];
        const vs = [p0v + tv * a0 + nv * o0, p0v + tv * a1 + nv * o0, p0v + tv * a0 + nv * o1, p0v + tv * a1 + nv * o1];
        M.box(Math.min(...us), Math.max(...us), ya, yb2, Math.min(...vs), Math.max(...vs), which);
      };
      if (porch && len > 4.2) {
        const full = cls !== CLS.TRIPLE || (seed & 2) > 0;
        const pw = full ? len : Math.max(3, len * 0.55);
        const a0 = full ? 0 : clamp(du - pw / 2, 0, len - pw), a1 = a0 + pw, dep = cls === CLS.TRIPLE ? 2.1 : 1.9;
        const decks = cls === CLS.TRIPLE ? Math.min(levels, 3) : cls === CLS.MULTI && seed & 4 ? 2 : 1;
        const fh = FLOOR[cls];
        const roofY = floorY + decks * fh - 0.25;
        for (let lv = 0; lv < decks; lv++) {
          const fy = floorY + lv * fh;
          setM(MAT.DECK);
          M.W[0] = pw;
          M.W[1] = 0;
          M.W[2] = 0;
          M.W[3] = -1;
          wbox(a0, a1, 0, dep, lv === 0 ? yb : fy - 0.22, fy, 63);
          setM(MAT.RAIL);
          const rail = (q0, q1, n2) => {
            const ln = Math.hypot(q1[0] - q0[0], q1[1] - q0[1]);
            const i0 = M.v(q0[0], fy, q0[1], n2[0], 0, n2[1], 0, 0), i1 = M.v(q1[0], fy, q1[1], n2[0], 0, n2[1], ln, 0);
            const i2 = M.v(q1[0], fy + 0.95, q1[1], n2[0], 0, n2[1], ln, 0.95), i3 = M.v(q0[0], fy + 0.95, q0[1], n2[0], 0, n2[1], 0, 0.95);
            M.quad(i0, i1, i2, i3);
          };
          const P2 = (al, o) => [p0u + tu * al + nu * o, p0v + tv * al + nv * o];
          const gap0 = lv === 0 ? clamp(du - 0.75, a0, a1) : -1, gap1 = lv === 0 ? clamp(du + 0.75, a0, a1) : -1;
          if (lv === 0 && gap1 > gap0) {
            if (gap0 - a0 > 0.4) rail(P2(a0, dep), P2(gap0, dep), [nu, nv]);
            if (a1 - gap1 > 0.4) rail(P2(gap1, dep), P2(a1, dep), [nu, nv]);
          } else rail(P2(a0, dep), P2(a1, dep), [nu, nv]);
          rail(P2(a0, 0), P2(a0, dep), [-tu, -tv]);
          rail(P2(a1, 0), P2(a1, dep), [tu, tv]);
        }
        setM(MAT.TRIM);
        const np = Math.max(2, Math.round(pw / 2.6) + 1);
        for (let i = 0; i < np; i++) {
          const al = a0 + 0.09 + (pw - 0.18) * i / (np - 1);
          wbox(al - 0.08, al + 0.08, dep - 0.18, dep - 0.02, floorY, roofY, 51);
        }
        setM(MAT.ROOF);
        const o1 = dep + 0.28;
        const q = (al, o, y) => [p0u + tu * al + nu * o, y, p0v + tv * al + nv * o];
        const sl = Math.hypot(o1, 0.3), n = [nu * 0.3 / sl, o1 / sl, nv * 0.3 / sl];
        M.face(q(a0 - 0.2, 0, roofY + 0.42), q(a1 + 0.2, 0, roofY + 0.42), q(a1 + 0.2, o1, roofY + 0.12), q(a0 - 0.2, o1, roofY + 0.12), n, [tu, 0, tv], [nu, 0, nv]);
        setM(MAT.TRIM);
        M.face(q(a0 - 0.2, o1, roofY - 0.08), q(a1 + 0.2, o1, roofY - 0.08), q(a1 + 0.2, o1, roofY + 0.12), q(a0 - 0.2, o1, roofY + 0.12), [nu, 0, nv], [tu, 0, tv], [0, 1, 0]);
        M.face(q(a0 - 0.2, 0, roofY - 0.08), q(a1 + 0.2, 0, roofY - 0.08), q(a1 + 0.2, o1, roofY - 0.08), q(a0 - 0.2, o1, roofY - 0.08), [0, -1, 0], [tu, 0, tv], [nu, 0, nv]);
        setM(MAT.CONCRETE);
        const st = Math.max(1, Math.ceil((floorY - yb - 0.6) / 0.19));
        wbox(clamp(du - 0.7, a0, a1 - 1.4), clamp(du + 0.7, a0 + 1.4, a1), dep, dep + Math.min(st, 6) * 0.28, yb, floorY - 0.19, 55);
        walkFrom = dep + Math.min(st, 6) * 0.28;
      } else if (found > 0.2 && len > 2.5) {
        walkFrom = floorY - y0 > 0.45 ? 1.64 : 1.32;
        setM(MAT.CONCRETE);
        M.W[0] = 1.6;
        M.W[1] = 0;
        M.W[2] = 0;
        M.W[3] = -1;
        wbox(du - 0.8, du + 0.8, 0, 1, yb, floorY, 55);
        wbox(du - 0.8, du + 0.8, 1, 1.32, yb, floorY - 0.2, 55);
        if (floorY - y0 > 0.45) wbox(du - 0.8, du + 0.8, 1.32, 1.64, yb, floorY - 0.4, 55);
      }
      if (env && cls !== CLS.GARAGE && cls !== CLS.BARN) {
        const at = (al, o) => [p0u + tu * al + nu * o, p0v + tv * al + nv * o];
        const strip = (al, wid, o0, o1) => {
          const n = Math.max(1, Math.ceil((o1 - o0) / 2.2));
          let pl = -1, pr = -1;
          for (let i = 0; i <= n; i++) {
            const o = o0 + (o1 - o0) * i / n, L2 = at(al - wid / 2, o), Rr = at(al + wid / 2, o);
            const il = M.v(L2[0], env.groundAt(L2[0], L2[1]) + 0.07, L2[1], 0, 1, 0, 0, o), ir = M.v(Rr[0], env.groundAt(Rr[0], Rr[1]) + 0.07, Rr[1], 0, 1, 0, wid, o);
            if (i > 0) M.quad(pl, pr, ir, il);
            pl = il;
            pr = ir;
          }
        };
        M.W[0] = 0;
        M.W[1] = 0;
        M.W[2] = 0;
        M.W[3] = -1;
        const P2 = at(du, walkFrom + 0.3);
        const reach = env.roadEdge(P2[0], P2[1], nu, nv, 30);
        if (reach > 0.5) {
          setM(MAT.CONCRETE);
          strip(du, 1.15, walkFrom - 0.05, walkFrom + 0.3 + reach + 0.25);
        }
        if (cls !== CLS.ROW && r3 < 0.74 && len > 4) {
          const al = seed & 8 ? -1.85 : len + 1.85;
          const Q = at(al, 0.4);
          const run = env.roadEdge(Q[0], Q[1], nu, nv, 32);
          if (run > 2.5) {
            const back = Math.min(6.5, Math.max(3, (side === 0 || side === 2 ? w : d) * 0.6));
            setM(MAT.ASPHALT);
            strip(al, 2.7, -back, 0.4 + run + 0.3);
            if (r2 < 0.55) {
              const oc = -back + 2.6 + r1 * Math.min(run + back - 6, 6), Cc = at(al, oc), gy = env.groundAt(Cc[0], Cc[1]) + 0.07;
              putCar(M, setM, r3 * 7.3 % 1 > 0.55 ? 1 : 0, Cc[0], gy, Cc[1], seed & 16 ? nu : -nu, seed & 16 ? nv : -nv);
            }
          }
        }
      }
    }
  }
  function buildHouseTile(world2, list, sel, cx, cy, cz, th) {
    const M = new Mesh();
    const c = Math.cos(th), s = Math.sin(th);
    const p3 = new Float64Array(3);
    let count = 0;
    const env = {
      mx: 0,
      my: 0,
      ca: 1,
      sa: 0,
      g: 0,
      groundAt(u, v) {
        return world2.groundH(this.mx + this.ca * u - this.sa * v, this.my + this.sa * u + this.ca * v, true) - this.g;
      },
      // how far from (u, v) along (nu, nv) the nearest street's edge is, or -1 if none within `max` metres
      roadEdge(u, v, nu, nv, max) {
        let o = 0;
        for (let i = 0; i < 14 && o <= max; i++) {
          const pu = u + nu * o, pv = v + nv * o;
          const e = world2.nearestRoad(this.mx + this.ca * pu - this.sa * pv, this.my + this.sa * pu + this.ca * pv);
          if (e < 0.25) return world2._nr.reg.rCls[world2._nr.road] < 14 ? o : -1;
          o += Math.max(Math.min(e, 40), 0.8);
        }
        return -1;
      }
    };
    for (const k of sel) {
      const mx = list[k], my = list[k + 1], w = list[k + 2], d = list[k + 3], a = list[k + 4];
      const g = world2.groundH(mx, my, true);
      if (world2.g.water) continue;
      const ca = Math.cos(a), sa = Math.sin(a);
      let gmin = g, gmax = g;
      for (const [su, sv] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        const hx = mx + (ca * su * w - sa * sv * d) / 2, hy = my + (sa * su * w + ca * sv * d) / 2;
        const hh = world2.groundH(hx, hy, false);
        if (hh < gmin) gmin = hh;
        if (hh > gmax) gmax = hh;
      }
      gmax = Math.min(gmax, g + 2.5);
      gmin = Math.max(gmin, g - 12);
      cyl(mx, my, g, p3);
      const dx = p3[0] - cx, dy = p3[1] - cy, dz = p3[2] - cz;
      M.ox = dx;
      M.oy = c * dy + s * dz;
      M.oz = -s * dy + c * dz;
      M.ux = ca;
      M.uz = -sa;
      M.vx = -sa;
      M.vz = -ca;
      M.C[0] = M.ox;
      M.C[1] = M.oy;
      M.C[2] = M.oz;
      env.mx = mx;
      env.my = my;
      env.ca = ca;
      env.sa = sa;
      env.g = g;
      building(M, list, k, g, gmin, gmax, env);
      count++;
    }
    return { n: M.n, count, pos: M.pos.slice(0, M.n * 3), nor: M.nor.slice(0, M.n * 4), uv: M.uv.slice(0, M.n * 2), w: M.w.slice(0, M.n * 4), m: M.m.slice(0, M.n * 4), c: M.c.slice(0, M.n * 3), idx: M.idx.slice(0, M.ni) };
  }

  // src/street.js
  var POLE_GAP = 42;
  var SLOT = 6.4;
  var P = { x: 0, y: 0, z: 0, tx: 1, ty: 0 };
  function roadBoxes(reg) {
    if (reg.rBox) return reg.rBox;
    const b = reg.rBox = new Float32Array(reg.nRoads * 4);
    for (let i = 0; i < reg.nRoads; i++) {
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      for (let q = reg.rStart[i], e = q + reg.rCount[i]; q < e; q++) {
        const x = reg.px[q], y = reg.py[q];
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
      b[i * 4] = x0;
      b[i * 4 + 1] = y0;
      b[i * 4 + 2] = x1;
      b[i * 4 + 3] = y1;
    }
    return b;
  }
  function pointAt(reg, ri, s) {
    const cum = reg.cum, px = reg.px, py = reg.py;
    let lo = reg.rStart[ri], hi = lo + reg.rCount[ri] - 1;
    while (hi - lo > 1) {
      const mid = lo + hi >> 1;
      if (cum[mid] <= s) lo = mid;
      else hi = mid;
    }
    const len = cum[hi] - cum[lo], t = len > 0 ? clamp((s - cum[lo]) / len, 0, 1) : 0;
    const dx = px[hi] - px[lo], dy = py[hi] - py[lo], l2 = Math.hypot(dx, dy) || 1;
    P.x = px[lo] + dx * t;
    P.y = py[lo] + dy * t;
    P.z = reg.pz[lo] + (reg.pz[hi] - reg.pz[lo]) * t;
    P.tx = dx / l2;
    P.ty = dy / l2;
    return P;
  }
  var poleSide = (reg, ri) => reg.rName[ri] & 1 ? 1 : -1;
  var polesOn = (reg, ri) => {
    const c = reg.rCls[ri], f = reg.rFlags[ri];
    return c >= 4 && c < 14 && c !== 5 && c !== 7 && c !== 9 && !(f & 6);
  };
  function poleAt(world2, reg, ri, k, out) {
    const s0 = reg.cum[reg.rStart[ri]], s1 = reg.cum[reg.rStart[ri] + reg.rCount[ri] - 1], s = k * POLE_GAP;
    if (s < s0 + 4 || s > s1 - 4) return false;
    const p = pointAt(reg, ri, s), side = poleSide(reg, ri), off = (reg.rHw[ri] + 0.9) * side;
    out.mx = reg.x0 + p.x + p.ty * off;
    out.my = reg.y0 + p.y - p.tx * off;
    out.yaw = Math.atan2(-p.tx, p.ty) + (side < 0 ? Math.PI : 0);
    out.tx = p.tx;
    out.ty = p.ty;
    if (world2.sdfAt(out.mx, out.my) < 3) return false;
    if (world2.nearestRoad(out.mx, out.my) < 0.3) return false;
    out.h = world2.groundH(out.mx, out.my, true);
    return !world2.g.water;
  }
  function streetItems(world2, reg, kind, mx0, my0, s, cx, cy, cz) {
    const out = [];
    if (!reg || !reg.nRoads) return new Float32Array(0);
    const box = roadBoxes(reg), p3 = new Float64Array(3);
    const lx0 = mx0 - reg.x0, ly0 = my0 - reg.y0, pad = 60;
    const A = { mx: 0, my: 0, h: 0, yaw: 0, tx: 0, ty: 0 }, B = { mx: 0, my: 0, h: 0, yaw: 0, tx: 0, ty: 0 };
    const inTile = (mx, my) => mx >= mx0 && mx < mx0 + s && my >= my0 && my < my0 + s;
    for (let ri = 0; ri < reg.nRoads; ri++) {
      if (box[ri * 4] > lx0 + s + pad || box[ri * 4 + 2] < lx0 - pad || box[ri * 4 + 1] > ly0 + s + pad || box[ri * 4 + 3] < ly0 - pad) continue;
      const q0 = reg.rStart[ri], sA = reg.cum[q0], sB = reg.cum[q0 + reg.rCount[ri] - 1], hw = reg.rHw[ri], cls = reg.rCls[ri];
      if (kind === "poles" || kind === "wires") {
        if (!polesOn(reg, ri)) continue;
        for (let k = Math.ceil(sA / POLE_GAP); k * POLE_GAP <= sB; k++) {
          if (!poleAt(world2, reg, ri, k, A) || !inTile(A.mx, A.my)) continue;
          if (kind === "poles") {
            cyl(A.mx, A.my, A.h, p3);
            out.push(p3[0] - cx, p3[1] - cy, p3[2] - cz, A.yaw, hash2(k * 7 + 3, reg.rName[ri] + 11));
          } else if (poleAt(world2, reg, ri, k + 1, B)) {
            const span = Math.hypot(B.mx - A.mx, B.my - A.my);
            if (span > POLE_GAP * 1.6) continue;
            for (const [lat, hgt, sag] of [[-1.05, 8.66, 0.75], [0, 10.12, 0.7], [1.05, 8.66, 0.75], [0.16, 6.4, 0.95]]) {
              let px0 = 0, py0 = 0, pz0 = 0;
              for (let j = 0; j <= 6; j++) {
                const u = j / 6, lx = lat, mx = A.mx + (B.mx - A.mx) * u + (A.ty + (B.ty - A.ty) * u) * lx, my = A.my + (B.my - A.my) * u - (A.tx + (B.tx - A.tx) * u) * lx;
                cyl(mx, my, A.h + (B.h - A.h) * u + hgt - 4 * sag * u * (1 - u), p3);
                if (j > 0) out.push(px0, py0, pz0, p3[0] - cx, p3[1] - cy, p3[2] - cz);
                px0 = p3[0] - cx;
                py0 = p3[1] - cy;
                pz0 = p3[2] - cz;
              }
            }
          }
        }
      } else if (kind === "cars") {
        if (!(cls >= 10 && cls <= 12) && !(cls === 6 || cls === 8)) continue;
        if (hw < 3.4 || reg.rFlags[ri] & 14) continue;
        const side = -poleSide(reg, ri);
        for (let k = Math.ceil((sA + 11) / SLOT); k * SLOT <= sB - 11; k++) {
          const p = pointAt(reg, ri, k * SLOT), off = (hw - 0.55) * side;
          const mx = reg.x0 + p.x + p.ty * off, my = reg.y0 + p.y - p.tx * off;
          if (!inTile(mx, my)) continue;
          const dev = world2.coverBilinear(mx, my, 0);
          const want = clamp(dev * 0.62 - (cls >= 10 ? 0.1 : 0.26), 0, 0.42);
          if (hash2(k * 3 + 1, reg.rName[ri] * 5 + 7) > want) continue;
          const tx = p.tx, ty = p.ty, pz = p.z;
          const far = (hw + 5) * side;
          if (world2.nearestRoad(reg.x0 + p.x + ty * far, reg.y0 + p.y - tx * far) < 2.5) continue;
          const h = world2.groundH(mx, my, true);
          if (world2.g.water) continue;
          cyl(mx, my, h + 0.02, p3);
          out.push(p3[0] - cx, p3[1] - cy, p3[2] - cz, Math.atan2(-tx * side, ty * side), hash2(k + 31, reg.rName[ri] + k * 13));
        }
      }
    }
    return new Float32Array(out);
  }

  // src/worker.js
  var world = null;
  var towers = [];
  var realBuildings = false;
  var tmp = new Float64Array(3);
  var DASH = 12.192;
  var pending = /* @__PURE__ */ new Map();
  function init(m) {
    const meta = m.meta;
    const parts = { sdf: new Uint8Array(m.sdf), sdfW: m.sdfW, sdfH: m.sdfH, cover: new Uint8Array(m.cover), aux: new Uint8Array(m.aux) };
    if (m.cover2) parts.cover2 = new Uint8Array(m.cover2);
    Object.assign(parts, { base: new Uint16Array(m.base), bw: m.bw, bh: m.bh, bScale: m.bScale, level: new Uint16Array(m.level), lw: m.lw, lh: m.lh });
    Object.assign(parts, { webH: new Float32Array(m.webH), webW: new Uint8Array(m.webW), webWater: new Uint8Array(m.webWater), webFoot: new Uint8Array(m.webFoot) });
    if (m.zone) Object.assign(parts, { zone: new Uint8Array(m.zone), zoneW: m.zoneW, zoneH: m.zoneH, zoneRange: m.zoneRange });
    world = new World(meta, parts);
    realBuildings = !!(meta.tiles && meta.tiles.buildings);
    towers = realBuildings ? [] : meta.landmarks.filter((l) => l.k === "tower");
  }
  function ensureRegion(rx, ry) {
    const k = regionKey(rx, ry);
    if (world.regions.has(k) || !world.have.has(k)) return null;
    let pr = pending.get(k);
    if (!pr) {
      pr = (async () => {
        try {
          const res = await fetch("data/r2/" + rx + "_" + ry + ".png");
          if (!res.ok) throw new Error("region " + rx + "_" + ry + " " + res.status);
          const png = await decodePNG(await res.arrayBuffer());
          const d = png.data;
          world.addRegion(rx, ry, parseRegion(d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength), rx, ry));
        } catch (err) {
          world.addRegion(rx, ry, EMPTY_REGION);
          postMessage({ type: "warn", message: String(err && err.message || err) });
        }
        pending.delete(k);
        world.tick++;
        world.trimRegions(12);
      })();
      pending.set(k, pr);
    }
    return pr;
  }
  function roadsNear(reg, lx0, ly0, lx1, ly1) {
    if (!reg || !reg.nRoads) return false;
    const gw = reg.gw, f = (v) => clamp(Math.floor((v + 160) / 128), 0, gw - 1);
    const x0 = f(lx0), x1 = f(lx1), y0 = f(ly0), y1 = f(ly1);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const c = y * gw + x;
      if (reg.gstart[c + 1] > reg.gstart[c]) return true;
    }
    return false;
  }
  function roadKind(reg, ri) {
    let k = reg.rKind;
    if (!k) {
      k = reg.rKind = new Uint8Array(reg.nRoads);
      for (let i = 0; i < reg.nRoads; i++) {
        const cls = reg.rCls[i], fl = reg.rFlags[i], one = fl & 1, unp = fl & 8, lanes = reg.rLanes[i];
        if (cls >= 14) {
          k[i] = 3 | cls - 13 << 2;
          continue;
        }
        let style = 0, nl = 1;
        if (!unp && cls <= 9) {
          if (one) {
            style = 2;
            nl = lanes || (cls === 0 ? 3 : cls === 2 || cls === 4 ? 2 : 1);
          } else {
            style = 1;
            nl = Math.max(1, (lanes || 2) >> 1);
          }
        }
        const walk = !unp && (cls === 4 || cls === 6 || cls === 8 || cls >= 10 && cls <= 12);
        k[i] = style | Math.min(nl, 7) << 2 | (unp ? 32 : 0) | (walk ? 64 : 0);
      }
    }
    return k[ri];
  }
  function genChunk(q) {
    const { level, ix, iy } = q;
    const s = ROOT / (1 << level), mx0 = ix * s, my0 = iy * s;
    let N = q.n;
    const reg = level >= 5 ? world.regionAt(mx0 + s / 2, my0 + s / 2) : null;
    const hasRoads = !!reg && roadsNear(reg, mx0 - 48 - reg.x0, my0 - 48 - reg.y0, mx0 + s + 48 - reg.x0, my0 + s + 48 - reg.y0);
    let sea = !hasRoads;
    if (sea) {
      for (let b = 0; b <= 4 && sea; b++) for (let a = 0; a <= 4; a++) {
        if (world.sdfAt(mx0 + a * s / 4, my0 + b * s / 4) > -world.sdfRange * 0.93) {
          sea = false;
          break;
        }
      }
      if (sea && level < 3) {
        for (let b = 0; b <= 32 && sea; b++) for (let a = 0; a <= 32; a++) {
          if (world.sdfAt(mx0 + a * s / 32, my0 + b * s / 32) > -world.sdfRange * 0.93) {
            sea = false;
            break;
          }
        }
      }
    }
    if (sea) N = Math.max(4, Math.min(N, Math.ceil(s / 190)));
    const cell = s / N, G = N + 3;
    const carve = cell <= 50 && hasRoads;
    const hs = new Float32Array(G * G);
    let hmin = 1e9, hmax = -1e9;
    for (let j = 0; j < G; j++) {
      const my = my0 + (j - 1) * cell;
      for (let i = 0; i < G; i++) {
        const h = sea ? 0 : world.groundH(mx0 + (i - 1) * cell, my, carve, !realBuildings);
        hs[j * G + i] = h;
        if (h < hmin) hmin = h;
        if (h > hmax) hmax = h;
      }
    }
    const nv = (N + 1) * (N + 1) + 4 * (N + 1);
    const pos = new Float32Array(nv * 3), nor = new Int8Array(nv * 3), loc = new Float32Array(nv * 2);
    cyl(mx0 + s / 2, my0 + s / 2, 0, tmp);
    const cx = tmp[0], cy = tmp[1], cz = tmp[2];
    let bx0 = 1e9, by0 = 1e9, bz0 = 1e9, bx1 = -1e9, by1 = -1e9, bz1 = -1e9;
    const put = (v2, mx, my, h, nx, ny, nz, lx, ly) => {
      const th = my / R, c = Math.cos(th), sn = Math.sin(th), r = R - h;
      const px = mx - L / 2 - cx, py = -r * c - cy, pz = -r * sn - cz;
      pos[v2 * 3] = px;
      pos[v2 * 3 + 1] = py;
      pos[v2 * 3 + 2] = pz;
      nor[v2 * 3] = Math.round(nx * 127);
      nor[v2 * 3 + 1] = Math.round((ny * sn + nz * c) * 127);
      nor[v2 * 3 + 2] = Math.round((-ny * c + nz * sn) * 127);
      loc[v2 * 2] = lx;
      loc[v2 * 2 + 1] = ly;
      if (px < bx0) bx0 = px;
      if (px > bx1) bx1 = px;
      if (py < by0) by0 = py;
      if (py > by1) by1 = py;
      if (pz < bz0) bz0 = pz;
      if (pz > bz1) bz1 = pz;
    };
    const skirt = cell * 0.4 + 1.5;
    let v = 0;
    const N1 = N + 1;
    const nrm = new Float32Array(N1 * N1 * 3);
    for (let j = 0; j <= N; j++) {
      const my = my0 + j * cell;
      for (let i = 0; i <= N; i++) {
        const o = (j + 1) * G + i + 1;
        const dx = (hs[o + 1] - hs[o - 1]) / (2 * cell), dy = (hs[o + G] - hs[o - G]) / (2 * cell);
        const il = 1 / Math.hypot(dx, dy, 1);
        const k = (j * N1 + i) * 3;
        nrm[k] = -dx * il;
        nrm[k + 1] = -dy * il;
        nrm[k + 2] = il;
        put(v++, mx0 + i * cell, my, hs[o], nrm[k], nrm[k + 1], nrm[k + 2], i * cell, j * cell);
      }
    }
    const edge = (i, j) => {
      const o = (j + 1) * G + i + 1, k = (j * N1 + i) * 3;
      put(v++, mx0 + i * cell, my0 + j * cell, hs[o] - skirt, nrm[k], nrm[k + 1], nrm[k + 2], i * cell, j * cell);
    };
    for (let i = 0; i <= N; i++) edge(i, 0);
    for (let i = 0; i <= N; i++) edge(i, N);
    for (let j = 0; j <= N; j++) edge(0, j);
    for (let j = 0; j <= N; j++) edge(N, j);
    const bcx = (bx0 + bx1) / 2, bcy = (by0 + by1) / 2, bcz = (bz0 + bz1) / 2;
    const brad = Math.hypot(bx1 - bx0, by1 - by0, bz1 - bz0) / 2;
    let road = null, roadK = null;
    const T = level >= 8 ? 96 : 192;
    if (hasRoads && level >= 6) {
      const data = new Uint16Array(T * T * 4), kind = new Uint8Array(T * T);
      let any = false;
      const far = toHalf(60), one = toHalf(1), zero = toHalf(0);
      for (let b = 0; b < T; b++) {
        const my = my0 + b / (T - 1) * s;
        for (let a = 0; a < T; a++) {
          const mx = mx0 + a / (T - 1) * s, k = (b * T + a) * 4;
          const e = world.nearestRoad(mx, my);
          if (e < 56) {
            const nr = world._nr, ph = nr.s / DASH * 2 * Math.PI;
            data[k] = toHalf(Math.min(nr.d, 60) * nr.side);
            data[k + 1] = toHalf(nr.hw);
            data[k + 2] = toHalf(Math.cos(ph));
            data[k + 3] = toHalf(Math.sin(ph));
            kind[b * T + a] = roadKind(nr.reg, nr.road);
            any = true;
          } else {
            data[k] = far;
            data[k + 1] = zero;
            data[k + 2] = one;
            data[k + 3] = zero;
          }
        }
      }
      if (any) {
        road = data;
        roadK = kind;
      }
    }
    const res = { type: "chunk", id: q.id, key: q.key, level, ix, iy, n: N, sea, pos, nor, loc, center: [cx, cy, cz], sphere: [bcx, bcy, bcz, brad], hmin, hmax, road, roadK, roadT: T, size: s, mx0, my0 };
    const tr = [pos.buffer, nor.buffer, loc.buffer];
    if (road) tr.push(road.buffer, roadK.buffer);
    postMessage(res, tr);
  }
  function genScatter(q) {
    const { kind, level, ix, iy } = q;
    const s = ROOT / (1 << level), mx0 = ix * s, my0 = iy * s;
    cyl(mx0 + s / 2, my0 + s / 2, 0, tmp);
    const cx = tmp[0], cy = tmp[1], cz = tmp[2];
    const out = [];
    const p3 = new Float64Array(3);
    const reg = world.regionAt(mx0 + s / 2, my0 + s / 2);
    if (kind === "poles" || kind === "wires" || kind === "cars") {
      const arr2 = streetItems(world, reg, kind, mx0, my0, s, cx, cy, cz);
      postMessage({ type: "scatter", id: q.id, key: q.key, kind, center: [cx, cy, cz], my: my0 + s / 2, data: arr2, stride: kind === "wires" ? 6 : 5 }, [arr2.buffer]);
      return;
    }
    if (kind === "trees" || kind === "clumps") {
      const sp2 = kind === "trees" ? 8.5 : 30, order = [];
      const n2 = Math.round(s / sp2), cell2 = s / n2;
      const cs = RS / 32;
      const near = kind === "trees" && realBuildings && reg && reg.nBld ? cellBuildings(reg, Math.floor((mx0 + s / 2 - reg.x0) / cs), Math.floor((my0 + s / 2 - reg.y0) / cs)) : null;
      for (let j = 0; j < n2; j++) for (let i = 0; i < n2; i++) {
        const gi = Math.round(mx0 / cell2) + i, gj = Math.round(my0 / cell2) + j;
        const r1 = hash2(gi * 3 + 1, gj * 3 + 7), r2 = hash2(gi * 5 + 11, gj * 5 + 3), r3 = hash2(gi * 7 + 5, gj * 7 + 13), r4 = hash2(gi + 91, gj + 17);
        const mx = mx0 + (i + 0.15 + 0.7 * r1) * cell2, my = my0 + (j + 0.15 + 0.7 * r2) * cell2;
        const forest = world.coverBilinear(mx, my, 1), dev = world.coverBilinear(mx, my, 0);
        let p;
        if (kind === "trees") p = world.cover2 ? forest * 0.95 : forest * 0.9 + (1 - forest) * (0.03 + 0.1 * dev);
        else p = smoothstep(0.35, 0.8, forest);
        if (r3 > p) continue;
        if (world.sdfAt(mx, my) < (kind === "trees" ? 5 : 22)) continue;
        const h = world.groundH(mx, my, true);
        const g = world.g;
        if (g.water || g.edge < (kind === "trees" ? 2.5 : 16)) continue;
        const sand = world.coverBilinear(mx, my, 2);
        if (sand > 0.5) continue;
        if (near) {
          let hit = false;
          for (let k = 0; k < near.length; k += 16) {
            const dx = mx - near[k], dy = my - near[k + 1], rr = Math.max(near[k + 2], near[k + 3]) * 0.6 + 3;
            if (dx * dx + dy * dy < rr * rr) {
              hit = true;
              break;
            }
          }
          if (hit) continue;
        }
        const pc = world.cover2 ? 0.04 + 0.92 * world.coverBilinear(mx, my, 1, true) : 0.22 + 0.4 * smoothstep(380, 850, h) + 0.45 * sand;
        const conifer = r4 < pc ? 1 : 0;
        cyl(mx, my, h, p3);
        out.push(p3[0] - cx, p3[1] - cy, p3[2] - cz, 0.75 + 0.65 * hash2(gi + 3, gj + 29), r1 * 6.2832, conifer, hash2(gi + 57, gj + 5));
        order.push(hash2(gi * 13 + 1, gj * 17 + 5));
      }
      const nT = order.length, perm = Array.from({ length: nT }, (_, i) => i).sort((a, b) => order[a] - order[b]);
      const arr2 = new Float32Array(nT * 7);
      for (let i = 0; i < nT; i++) for (let k = 0; k < 7; k++) arr2[i * 7 + k] = out[perm[i] * 7 + k];
      postMessage({ type: "scatter", id: q.id, key: q.key, kind, center: [cx, cy, cz], my: my0 + s / 2, data: arr2, stride: 7 }, [arr2.buffer]);
      return;
    }
    if (kind === "houses") {
      const cs = RS / 32;
      const list = reg ? cellBuildings(reg, Math.floor((mx0 + s / 2 - reg.x0) / cs), Math.floor((my0 + s / 2 - reg.y0) / cs)) : null;
      const sel = [];
      if (list) for (let k = 0; k < list.length; k += 16) {
        const mx = list[k], my = list[k + 1];
        if (mx >= mx0 && mx < mx0 + s && my >= my0 && my < my0 + s) sel.push(k);
      }
      const t = sel.length ? buildHouseTile(world, list, sel, cx, cy, cz, (my0 + s / 2) / R) : null;
      const msg = { type: "scatter", id: q.id, key: q.key, kind, center: [cx, cy, cz], my: my0 + s / 2, house: t, data: new Float32Array(0), stride: 1 };
      postMessage(msg, t ? [t.pos.buffer, t.nor.buffer, t.uv.buffer, t.w.buffer, t.m.buffer, t.c.buffer, t.idx.buffer] : []);
      return;
    }
    if (realBuildings) {
      const cs = RS / 32;
      const list = reg ? cellBuildings(reg, Math.round((mx0 - reg.x0) / cs), Math.round((my0 - reg.y0) / cs)) : null;
      if (list) for (let k = 0; k < list.length; k += 16) {
        const mx = list[k], my = list[k + 1];
        const h = world.groundH(mx, my, true), g = world.g;
        if (g.water) continue;
        cyl(mx, my, h - 0.5, p3);
        out.push(p3[0] - cx, p3[1] - cy, p3[2] - cz, list[k + 4], list[k + 2], list[k + 3], list[k + 5] + 0.5, list[k + 7] > 0 ? 1 : 0, list[k + 13], list[k + 6], list[k + 12]);
      }
      const arr2 = new Float32Array(out);
      postMessage({ type: "scatter", id: q.id, key: q.key, kind, center: [cx, cy, cz], my: my0 + s / 2, data: arr2, stride: 11 }, [arr2.buffer]);
      return;
    }
    const sp = 27, n = Math.round(s / sp), cell = s / n;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const gi = Math.round(mx0 / cell) + i, gj = Math.round(my0 / cell) + j;
      const r1 = hash2(gi * 3 + 2, gj * 3 + 9), r2 = hash2(gi * 5 + 4, gj * 5 + 1), r3 = hash2(gi * 7 + 8, gj * 7 + 3), r4 = hash2(gi + 41, gj + 77), r5 = hash2(gi + 5, gj + 141);
      const mx = mx0 + (i + 0.25 + 0.5 * r1) * cell, my = my0 + (j + 0.25 + 0.5 * r2) * cell;
      const dev = world.coverBilinear(mx, my, 0);
      const p = clamp((dev - 0.1) * 1.2, 0, 0.9);
      if (r3 > p) continue;
      if (world.sdfAt(mx, my) < 14) continue;
      const e = world.nearestRoad(mx, my);
      if (e < 7) continue;
      let yaw = r2 * 3.1416;
      if (e < 50) yaw = Math.atan2(world._nr.ty, world._nr.tx);
      const h = world.groundH(mx, my, true), g = world.g;
      if (g.water) continue;
      const core = world.coreAt(mx, my);
      let w, d, ht, roof;
      if (core < 0.1) {
        w = 8 + 5 * r4;
        d = 7 + 4 * r5;
        ht = 5.2 + 2.6 * r1;
        roof = 1;
      } else if (core < 0.35) {
        w = 9 + 8 * r4;
        d = 8 + 7 * r5;
        ht = 7 + 6 * r1 * r1;
        roof = r2 < 0.5 ? 1 : 0;
      } else if (core < 0.7) {
        w = 10 + 9 * r4;
        d = 9 + 9 * r5;
        ht = 9 + 8 * r1;
        roof = r2 < 0.2 ? 1 : 0;
      } else {
        w = 11 + 9 * r4;
        d = 10 + 9 * r5;
        ht = 12 + 14 * r1;
        roof = 0;
      }
      let nearT = 1e9;
      for (const t of towers) {
        const dd = Math.hypot(t.x - mx, t.y - my);
        if (dd < nearT) nearT = dd;
      }
      if (nearT < 750) {
        const b = 1 - nearT / 750;
        ht += b * (18 + 95 * r5 * r5 * r1);
        roof = 0;
        if (nearT < 30) continue;
      }
      cyl(mx, my, h - 0.4, p3);
      out.push(p3[0] - cx, p3[1] - cy, p3[2] - cz, yaw, w, d, ht, roof, Math.floor(r3 * 255), roof ? 0 : 7, roof ? 0 : 1);
    }
    const arr = new Float32Array(out);
    postMessage({ type: "scatter", id: q.id, key: q.key, kind, center: [cx, cy, cz], my: my0 + s / 2, data: arr, stride: 11 }, [arr.buffer]);
  }
  function genWebster(m) {
    const raw = m.raw, meta = m.meta, wb = world.meta.webster;
    const q = meta.quantization, ox = wb.ox, oy = wb.oy;
    cyl(ox, oy, 100, tmp);
    const cx = tmp[0], cy = tmp[1], cz = tmp[2];
    const p3 = new Float64Array(3);
    const layers = [], tr = [];
    for (const Lr of meta.layers) {
      const nv = Lr.vertexCount, a = Lr.attributes;
      const src = new Uint16Array(raw, a.position.byteOffset, nv * 3);
      const sn = new Int8Array(raw, a.normal.byteOffset, nv * 3);
      const col = new Uint8Array(raw.slice(a.color.byteOffset, a.color.byteOffset + nv * 3));
      const idx = new Uint32Array(raw.slice(Lr.index.byteOffset, Lr.index.byteOffset + Lr.index.count * 4));
      const pos = new Float32Array(nv * 3), nor = new Int8Array(nv * 3);
      let bx0 = 1e9, by0 = 1e9, bz0 = 1e9, bx1 = -1e9, by1 = -1e9, bz1 = -1e9;
      for (let i = 0; i < nv; i++) {
        const x = q.origin[0] + src[i * 3] * q.scale[0], y = q.origin[1] + src[i * 3 + 1] * q.scale[1], z = q.origin[2] + src[i * 3 + 2] * q.scale[2];
        const my = oy - z;
        cyl(ox + x, my, y + 100, p3);
        const px = p3[0] - cx, py = p3[1] - cy, pz = p3[2] - cz;
        pos[i * 3] = px;
        pos[i * 3 + 1] = py;
        pos[i * 3 + 2] = pz;
        const th = my / R, c = Math.cos(th), s = Math.sin(th);
        const ne = sn[i * 3], nu = sn[i * 3 + 1], nn = -sn[i * 3 + 2];
        nor[i * 3] = ne;
        nor[i * 3 + 1] = clamp(Math.round(nn * s + nu * c), -127, 127);
        nor[i * 3 + 2] = clamp(Math.round(-nn * c + nu * s), -127, 127);
        if (px < bx0) bx0 = px;
        if (px > bx1) bx1 = px;
        if (py < by0) by0 = py;
        if (py > by1) by1 = py;
        if (pz < bz0) bz0 = pz;
        if (pz > bz1) bz1 = pz;
      }
      layers.push({ kind: Lr.kind, pos, nor, col, idx, sphere: [(bx0 + bx1) / 2, (by0 + by1) / 2, (bz0 + bz1) / 2, Math.hypot(bx1 - bx0, by1 - by0, bz1 - bz0) / 2] });
      tr.push(pos.buffer, nor.buffer, col.buffer, idx.buffer);
    }
    postMessage({ type: "webster", center: [cx, cy, cz], layers }, tr);
  }
  onmessage = async (ev) => {
    const m = ev.data;
    try {
      if (m.type === "init") {
        init(m);
        postMessage({ type: "ready" });
        return;
      }
      if (m.type === "webster") {
        genWebster(m);
        return;
      }
      world.tick++;
      if (m.type === "scatter" || m.level >= 5) {
        const s2 = ROOT / (1 << m.level);
        const pr = ensureRegion(Math.floor((m.ix + 0.5) * s2 / RS), Math.floor((m.iy + 0.5) * s2 / RS));
        if (pr) await pr;
      }
      const s = ROOT / (1 << m.level);
      world.pinned = m.type === "scatter" || m.level >= 5 ? world.regionAt((m.ix + 0.5) * s, (m.iy + 0.5) * s) || EMPTY_REGION : EMPTY_REGION;
      if (m.type === "chunk") genChunk(m);
      else if (m.type === "scatter") genScatter(m);
      world.pinned = null;
    } catch (err) {
      world.pinned = null;
      postMessage({ type: "error", id: m.id, key: m.key, what: m.type, message: String(err && err.stack || err) });
    }
  };
})();
