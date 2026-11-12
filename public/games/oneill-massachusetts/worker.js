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
  var WCELL = 32;
  var WPAD = 14;
  var DECK_T = 0.95;
  var ROAD_RANK = [0, 5, 1, 6, 2, 7, 3, 8, 4, 9, 10, 11, 12, 13, 22, 23, 20, 21, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37];
  var VERSIONS = null;
  function setVersions(v) {
    VERSIONS = v || null;
  }
  function vurl(path) {
    const h = VERSIONS && VERSIONS[path];
    return h ? path + "?h=" + h : path;
  }
  var WALL_GAP = 0.9;
  var TUN_H = 5.6;
  var DECKS = false;
  function setDecks(on) {
    DECKS = !!on;
  }
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
    const rEnd = reg.rEnd = new Uint8Array(nR);
    let nDeck = 0;
    for (let i = 0; i < nR; i++) {
      if (!DECKS || !(reg.rFlags[i] & 2) || reg.rCls[i] > 15 || rCount[i] < 2) continue;
      rEnd[i] = 4;
      nDeck++;
    }
    reg.nDeck = nDeck;
    const rTun = reg.rTun = new Uint8Array(nR);
    let nTun = 0;
    for (let i = 0; i < nR; i++) if (reg.rFlags[i] & 4 && !rEnd[i] && reg.rCls[i] < 14 && rCount[i] >= 2) {
      rTun[i] = 1;
      nTun++;
    }
    reg.nTun = nTun;
    const nc = cells * cells + 1;
    reg.bCell = new Uint32Array(buf.slice(p, p + nc * 4));
    p += nc * 4;
    reg.b = new Uint8Array(buf.slice(p, p + nB * 12));
    reg.roof = dv.getUint32(20, true) & 1 ? new Uint16Array(buf.slice(p + nB * 12, p + nB * 14)) : null;
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
    for (let i = 0; i < nR; i++) {
      if (!rEnd[i]) continue;
      const a = rStart[i], b = a + rCount[i] - 1;
      if (!onOtherWay(reg, px[a], py[a], pz[a], i, true)) rEnd[i] |= 1;
      if (!onOtherWay(reg, px[b], py[b], pz[b], i, true)) rEnd[i] |= 2;
    }
    return reg;
  }
  function onOtherWay(reg, lx, ly, z, ri, deckOnly) {
    const gw = reg.gw, cx = Math.floor((lx + RM) / RCELL), cy = Math.floor((ly + RM) / RCELL);
    if (cx < 0 || cy < 0 || cx >= gw || cy >= gw) return false;
    const c = cy * gw + cx, e = reg.gstart[c + 1], px = reg.px, py = reg.py, pz = reg.pz, items = reg.gitems, segR = reg.segR, rHw = reg.rHw, rEnd = reg.rEnd, rCls = reg.rCls;
    for (let q = reg.gstart[c]; q < e; q++) {
      const pi = items[q], rj = segR[pi];
      if (rj === ri || rCls[rj] > 15 || deckOnly && !rEnd[rj]) continue;
      const ax = px[pi], ay = py[pi], dx = px[pi + 1] - ax, dy = py[pi + 1] - ay, l2 = dx * dx + dy * dy;
      if (l2 < 1e-6) continue;
      const ux = lx - ax, uy = ly - ay, t = (ux * dx + uy * dy) / l2, tol = 0.3 / Math.sqrt(l2);
      if (t < -tol || t > 1 + tol) continue;
      const tc = t < 0 ? 0 : t > 1 ? 1 : t, ex = ux - dx * tc, ey = uy - dy * tc, w = rHw[rj] - 0.05;
      if (ex * ex + ey * ey >= w * w) continue;
      if (Math.abs(pz[pi] + (pz[pi + 1] - pz[pi]) * tc - z) < 1) return true;
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
        const walk = !unp && (fl & 128) !== 0;
        k[i] = style | Math.min(nl, 7) << 2 | (unp ? 32 : 0) | (walk ? 64 : 0);
      }
    }
    return k[ri];
  }
  var GSEG = 1472;
  var GS = RS / GSEG;
  function parseGround(u8) {
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    if (dv.getUint32(0, true) !== 860114503) throw new Error("bad ground file");
    const n = dv.getUint32(4, true), m = dv.getUint32(8, true), seg = dv.getUint32(12, true), steps = dv.getUint32(16, true), off = dv.getUint32(20, true);
    if (seg !== GSEG || u8.length < 32 + 2 * n * n) throw new Error("bad ground file");
    const d = new Uint16Array(n * n), hi = n * n;
    const b = u8.subarray(32);
    for (let j = 0, o = 0; j < n; j++) {
      let acc = 0;
      for (let i = 0; i < n; i++, o++) {
        const zz = b[o] | b[hi + o] << 8;
        acc = acc + (zz >>> 1 ^ -(zz & 1)) & 65535;
        d[o] = j ? acc + d[o - n] & 65535 : acc;
      }
    }
    return { n, m, d, inv: 1 / steps, off };
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
      this._nr = { d: 1e9, road: -1, reg: null, z: 0, s: 0, hw: 0, tx: 1, ty: 0, side: 1, u: 1e9 };
      this._nd = { d: 1e9, road: -1, reg: null, z: 0, s: 0, hw: 0, tx: 1, ty: 0, side: 1 };
      this._nt = { d: 1e9, road: -1, reg: null, z: 0, s: 0, hw: 0, tx: 1, ty: 0, side: 1 };
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
    // The LiDAR's ground at (mx, my) from a region's tile; NaN where the tile has nothing to say.
    fineH(reg, mx, my) {
      const g = reg.ground;
      if (!g) return NaN;
      const n = g.n, fx = (mx - reg.x0) / GS + g.m, fy = (my - reg.y0) / GS + g.m;
      if (!(fx >= 0 && fy >= 0 && fx < n - 1 && fy < n - 1)) return NaN;
      const i = fx | 0, j = fy | 0, tx = fx - i, ty = fy - j, o = j * n + i, d = g.d;
      const a = d[o], b = d[o + 1], c = d[o + n], e = d[o + n + 1];
      if (!a || !b || !c || !e) return NaN;
      return (a + (b - a) * tx + (c - a) * ty + (a - b - c + e) * tx * ty) * g.inv - g.off;
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
    // Nearest road on the ground to (mx,my) within ~60 m (bridge decks are not counted: see nearestDeck).  Result in
    // this._nr; returns edge distance (centre distance - half width).
    nearestRoad(mx, my) {
      return this._near(mx, my, false, this._nr);
    }
    // Nearest bridge deck over (mx,my): the same, in this._nd.  Past a rim (where the deck meets the ground) there is
    // no deck, so the approach is not taken for part of the bridge.
    // zmax: only decks at or below this height here.  Of the decks the point is on, the highest is taken (the one a car
    // coming down to zmax would land on); if it is on none, the nearest.
    nearestDeck(mx, my, zmax = 1e9) {
      return this._near(mx, my, true, this._nd, zmax);
    }
    // Nearest tunnel floor under (mx, my), in this._nt, by the rule of nearestDeck (the highest at or below zmax that the
    // point is on, else the nearest).  A tunnel's floor runs the full width between its walls (half width + WALL_GAP).
    nearestTunnel(mx, my, zmax = 1e9) {
      return this._near(mx, my, true, this._nt, zmax, true);
    }
    _near(mx, my, deck, o, zmax = 1e9, tun = false) {
      o.road = -1;
      o.d = 1e9;
      o.reg = null;
      o.u = 1e9;
      const reg = this.regionAt(mx, my);
      if (!reg || !reg.nRoads || deck && !(tun ? reg.nTun : reg.nDeck)) return 1e9;
      const lx = mx - reg.x0, ly = my - reg.y0, gw = reg.gw;
      const cx = Math.floor((lx + RM) / RCELL), cy = Math.floor((ly + RM) / RCELL);
      if (cx < 0 || cy < 0 || cx >= gw || cy >= gw) return 1e9;
      const c = cy * gw + cx, e = reg.gstart[c + 1], px = reg.px, py = reg.py, items = reg.gitems, segR = reg.segR, rHw = reg.rHw, rEnd = reg.rEnd, rTun = reg.rTun;
      let best = 1e9, bi = -1, bt = 0, bd = 0, bside = 1, bon = false, bz = -1e9, bpr = 99, umin = 1e9;
      const rCls = reg.rCls;
      for (let q = reg.gstart[c]; q < e; q++) {
        const pi = items[q], ri2 = segR[pi], en = rEnd[ri2];
        if (rTun[ri2] ? !tun : tun || en !== 0 !== deck) continue;
        const ax = px[pi], ay = py[pi], dx2 = px[pi + 1] - ax, dy2 = py[pi + 1] - ay, l2 = dx2 * dx2 + dy2 * dy2;
        const ux = lx - ax, uy = ly - ay;
        let t = l2 > 0 ? (ux * dx2 + uy * dy2) / l2 : 0;
        if (deck && !tun && (t < 0 && en & 1 && pi === reg.rStart[ri2] || t > 1 && en & 2 && pi + 2 === reg.rStart[ri2] + reg.rCount[ri2])) continue;
        if (tun && (t < 0 && pi === reg.rStart[ri2] || t > 1 && pi + 2 === reg.rStart[ri2] + reg.rCount[ri2])) continue;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const ex = ux - dx2 * t, ey = uy - dy2 * t;
        const d = Math.sqrt(ex * ex + ey * ey), edge = d - rHw[ri2] - (tun ? WALL_GAP : 0);
        if (!deck && edge < umin && rCls[ri2] < 14) umin = edge;
        if (deck) {
          const zz = reg.pz[pi] + (reg.pz[pi + 1] - reg.pz[pi]) * t;
          if (zz > zmax) continue;
          const on = edge < 0.35;
          if (on ? bon && (zz < bz - 1 || zz <= bz + 1 && edge >= best) : bon || edge >= best) continue;
          bon = on;
          bz = zz;
        } else {
          const pr = edge < 0 ? ROAD_RANK[rCls[ri2]] : 99;
          if (pr > bpr || pr === bpr && edge >= best) continue;
          bpr = pr;
        }
        best = edge;
        bi = pi;
        bt = t;
        bd = d;
        bside = ux * dy2 - uy * dx2 >= 0 ? 1 : -1;
      }
      o.u = umin;
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
    // ---- buildings open beneath (bake/c27_lifted.py -> data/lifted.json).  Each entry names its building by its region
    // (r: ry * RNX + rx) and its record's x and y in 0.2 m steps (b), and says where it is open: c, corridors [x0, y0, x1,
    // y1, half width] in metres from the region's corner where a street or a railway runs under it, up to the soffit s
    // (a height, like the roads'); or, with no c, all of it: up to h over its ground, or to t under its top.
    setLifted(doc) {
      const m = /* @__PURE__ */ new Map();
      for (const e of doc && doc.b || []) m.set(e.r * 4294967296 + e.b[1] * 65536 + e.b[0], e);
      this.lifted = m;
    }
    // the entry for building record id of region reg, or null
    liftOf(reg, id) {
      const L2 = this.lifted;
      if (!L2 || !L2.size || !reg || !reg.b) return null;
      const o = id * 12, b = reg.b;
      return L2.get(regionKey(reg.rx, reg.ry) * 4294967296 + (b[o + 2] | b[o + 3] << 8) * 65536 + (b[o] | b[o + 1] << 8)) || null;
    }
    // ---- retaining walls (bake/c21_walls.py -> data/walls.json): OpenStreetMap's walls, each a run of points [x, y, foot,
    // top] with s (1: the high side is left of the way's direction, -1: right of it, 0: a freestanding wall) and m (0
    // concrete, 1 stone, 2 brick).  ws holds five numbers a wall: first point, points, s, m, and the ends that run on into
    // another wall (1 its start, 2 its end).
    setWalls(list) {
      let n = 0;
      for (const w of list) n += w.p.length;
      const X = new Float64Array(n), Y = new Float64Array(n), F = new Float32Array(n), T = new Float32Array(n), Wi = new Int32Array(n);
      const ws = [];
      let k = 0;
      for (const w of list) {
        const wi = ws.length / 5;
        ws.push(k, w.p.length, w.s, w.m, 0);
        for (const q of w.p) {
          X[k] = q[0];
          Y[k] = q[1];
          F[k] = q[2];
          T[k] = q[3];
          Wi[k] = wi;
          k++;
        }
      }
      const ends = /* @__PURE__ */ new Map(), ekey = (x, y) => Math.round(x * 2) * 1e7 + Math.round(y * 2);
      for (let wi = 0; wi < ws.length / 5; wi++) {
        const a = ws[wi * 5], b = a + ws[wi * 5 + 1] - 1;
        for (const p of [a, b]) {
          const key2 = ekey(X[p], Y[p]);
          ends.set(key2, (ends.get(key2) || 0) + 1);
        }
      }
      for (let wi = 0; wi < ws.length / 5; wi++) {
        const a = ws[wi * 5], b = a + ws[wi * 5 + 1] - 1;
        ws[wi * 5 + 4] = (ends.get(ekey(X[a], Y[a])) > 1 ? 1 : 0) + (ends.get(ekey(X[b], Y[b])) > 1 ? 2 : 0);
      }
      const cells = /* @__PURE__ */ new Map();
      for (let wi = 0; wi < ws.length / 5; wi++) {
        const a = ws[wi * 5], c = ws[wi * 5 + 1];
        for (let i = a; i < a + c - 1; i++) {
          const cx0 = Math.floor((Math.min(X[i], X[i + 1]) - WPAD) / WCELL), cx1 = Math.floor((Math.max(X[i], X[i + 1]) + WPAD) / WCELL);
          const cy0 = Math.floor((Math.min(Y[i], Y[i + 1]) - WPAD) / WCELL), cy1 = Math.floor((Math.max(Y[i], Y[i + 1]) + WPAD) / WCELL);
          for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
            const key2 = cy * 65536 + cx;
            let l = cells.get(key2);
            if (!l) cells.set(key2, l = []);
            l.push(i);
          }
        }
      }
      this.walls = { X, Y, F, T, Wi, ws, cells, n: ws.length / 5 };
      this._wl = { d: 0, sd: 0, foot: 0, top: 0, t: 0, i: -1, w: -1, s: 0, m: 0, ux: 1, uy: 0, nx: 0, ny: 1, end: false };
    }
    // The wall segment nearest (mx, my) within WPAD, in this._wl: d (the distance), sd (signed, from the segment's line:
    // + on the high side, or on the left of a freestanding wall), foot and top there, t along the segment, i its first
    // point, w its wall, s and m the wall's, ux, uy its direction, nx, ny toward the high side, and end (the point is
    // past an end of the wall); null if there is none.  stepped: only walls between two levels.
    _wallNear(mx, my, stepped) {
      const W = this.walls;
      if (!W) return null;
      const l = W.cells.get(Math.floor(my / WCELL) * 65536 + Math.floor(mx / WCELL));
      if (!l) return null;
      let best = 1e9, bi = -1, bt = 0;
      for (let q = 0; q < l.length; q++) {
        const i2 = l[q];
        if (stepped && !W.ws[W.Wi[i2] * 5 + 2]) continue;
        const ax = W.X[i2], ay = W.Y[i2], dx2 = W.X[i2 + 1] - ax, dy2 = W.Y[i2 + 1] - ay, l2 = dx2 * dx2 + dy2 * dy2;
        let t = l2 > 0 ? ((mx - ax) * dx2 + (my - ay) * dy2) / l2 : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const ex = mx - ax - dx2 * t, ey = my - ay - dy2 * t, d = Math.sqrt(ex * ex + ey * ey);
        if (d < best) {
          best = d;
          bi = i2;
          bt = t;
        }
      }
      if (bi < 0 || best > WPAD) return null;
      const o = this._wl, i = bi, wi = W.Wi[i], s = W.ws[wi * 5 + 2], a = W.ws[wi * 5], c = W.ws[wi * 5 + 1], jn = W.ws[wi * 5 + 4];
      const dx = W.X[i + 1] - W.X[i], dy = W.Y[i + 1] - W.Y[i], len = Math.hypot(dx, dy) || 1;
      o.ux = dx / len;
      o.uy = dy / len;
      const sg = s || 1;
      o.nx = -o.uy * sg;
      o.ny = o.ux * sg;
      o.sd = (mx - W.X[i]) * o.nx + (my - W.Y[i]) * o.ny;
      o.d = best;
      o.t = bt;
      o.i = i;
      o.w = wi;
      o.s = s;
      o.m = W.ws[wi * 5 + 3];
      o.foot = W.F[i] + (W.F[i + 1] - W.F[i]) * bt;
      o.top = W.T[i] + (W.T[i + 1] - W.T[i]) * bt;
      o.end = bt <= 0 && i === a && !(jn & 1) || bt >= 1 && i + 1 === a + c - 1 && !(jn & 2);
      return o;
    }
    // After nearestRoad(mx, my): the edge distance from (mx, my) of the nearest roadway on the ground that outranks the one
    // found there (the highway a ramp joins, the main road at the end of a side street); 1e9 where there is none.
    outrankedBy(mx, my) {
      const nr = this._nr, reg = nr.reg;
      if (!reg || nr.road < 0) return 1e9;
      const lx = mx - reg.x0, ly = my - reg.y0, gw = reg.gw;
      const cx = Math.floor((lx + RM) / RCELL), cy = Math.floor((ly + RM) / RCELL);
      if (cx < 0 || cy < 0 || cx >= gw || cy >= gw) return 1e9;
      const c = cy * gw + cx, e = reg.gstart[c + 1], px = reg.px, py = reg.py, items = reg.gitems, segR = reg.segR, rHw = reg.rHw, rCls = reg.rCls;
      const mine = ROAD_RANK[rCls[nr.road]];
      let best = 1e9;
      for (let q = reg.gstart[c]; q < e; q++) {
        const pi = items[q], ri = segR[pi];
        if (ri === nr.road || reg.rEnd[ri] || reg.rTun[ri] || ROAD_RANK[rCls[ri]] >= mine) continue;
        const ax = px[pi], ay = py[pi], dx = px[pi + 1] - ax, dy = py[pi + 1] - ay, l2 = dx * dx + dy * dy;
        let t = l2 > 0 ? ((lx - ax) * dx + (ly - ay) * dy) / l2 : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const edge = Math.hypot(lx - ax - dx * t, ly - ay - dy * t) - rHw[ri];
        if (edge < best) best = edge;
      }
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
      const gi = this.g || (this.g = { water: false, road: -1, reg: null, edge: 1e9, sdf: 0, web: 0, glass: false, fine: false, deck: -1e9, deckRoad: -1, deckReg: null, onDeck: false, onTunnel: false });
      mx = clamp(mx, 0, L);
      my = wrapY(my);
      const s = this.sdfAt(mx, my), lev = this.levelAt(mx, my);
      gi.sdf = s;
      gi.road = -1;
      gi.reg = null;
      gi.edge = 1e9;
      gi.web = 0;
      gi.fine = false;
      gi.deck = -1e9;
      gi.deckRoad = -1;
      gi.deckReg = null;
      gi.onDeck = false;
      let h, water = s <= 0;
      gi.glass = false;
      if (water) {
        h = lev;
        if (this.zone && s < -400 && this.zoneAt(mx, my) > -70) {
          water = false;
          gi.glass = true;
        }
      } else {
        let terr = NaN, rg = this.pinned;
        if (!rg) {
          const rx = Math.floor(mx / RS);
          if (rx < RNX) rg = this.regions.get(Math.floor(my / RS) * RNX + rx);
        }
        if (rg && rg.ground) {
          terr = this.fineH(rg, mx, my);
          rg.used = this.tick;
        }
        gi.fine = terr === terr;
        if (!gi.fine) {
          terr = this.baseH(mx, my);
          terr += ((vnoise(mx / 140, my / 140) - 0.5) * 2.4 + (vnoise(mx / 47 + 13.1, my / 47 + 7.7) - 0.5) * 0.9) * smoothstep(0, 60, s);
        }
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
        const wl = this.walls ? this._wallNear(mx, my, true) : null;
        const edge = this.nearestRoad(mx, my);
        if (edge < 40) {
          const nr = this._nr, cls = nr.reg.rCls[nr.road], brook = cls === 19;
          const shoulder = brook ? Math.max(1.5, Math.min(h - nr.z, 6)) : Math.max(nr.hw < 5 ? 3 : 4 + nr.hw * 0.5, Math.min(h - nr.z, 14));
          let wgt = 1 - smoothstep(brook ? 0.4 : 0.6, (brook ? 0.4 : 0.6) + shoulder, edge);
          if (wgt > 0 && wl && wl.sd > 0 && !wl.end && edge > 0.5) {
            const qx = mx - nr.side * nr.d * nr.ty, qy = my + nr.side * nr.d * nr.tx;
            if ((qx - this.walls.X[wl.i]) * wl.nx + (qy - this.walls.Y[wl.i]) * wl.ny < 0) wgt = 0;
          }
          if (wgt > 0 && brook) {
            if (!water) {
              const zb = nr.z - 0.45;
              if (zb < h) h += (zb - h) * wgt;
              if (edge < 0) water = true;
            }
          } else if (wgt > 0 && cls === 18) {
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
        if (wl && wl.d < 4 && !wl.end && !(edge < 0.5) && !water) {
          const k = 1 - smoothstep(2.5, 4, wl.d);
          h = wl.sd > 0 ? h + (Math.max(h, wl.top) - h) * k : h + (Math.min(h, wl.foot) - h) * k;
        }
        const dreg = this.regionAt(mx, my);
        if (dreg && dreg.nDeck) h = this._underDecks(dreg, mx, my, h, water, gi);
      }
      gi.water = water;
      return h;
    }
    // Every deck within 2.6 m of the point: the ground keeps under the lowest of them, and gi.deck is the highest one
    // the point lies under.  Just inside a rim the ground only has to keep under the road surface (it is the abutment,
    // inside the slab); the full depth comes over the next metres, so the terrain mesh never has to step down at the joint.
    _underDecks(reg, mx, my, h, water, gi) {
      const lx = mx - reg.x0, ly = my - reg.y0, gw = reg.gw;
      const cx = Math.floor((lx + RM) / RCELL), cy = Math.floor((ly + RM) / RCELL);
      if (cx < 0 || cy < 0 || cx >= gw || cy >= gw) return h;
      const c = cy * gw + cx, e = reg.gstart[c + 1], px = reg.px, py = reg.py, pz = reg.pz, items = reg.gitems, segR = reg.segR, rHw = reg.rHw, rEnd = reg.rEnd, cum = reg.cum;
      for (let q = reg.gstart[c]; q < e; q++) {
        const pi = items[q], ri = segR[pi], en = rEnd[ri];
        if (!en) continue;
        const ax = px[pi], ay = py[pi], dx = px[pi + 1] - ax, dy = py[pi + 1] - ay, l2 = dx * dx + dy * dy;
        const ux = lx - ax, uy = ly - ay;
        let t = l2 > 0 ? (ux * dx + uy * dy) / l2 : 0;
        const a0 = reg.rStart[ri], b0 = a0 + reg.rCount[ri] - 1;
        if (t < 0 && en & 1 && pi === a0 || t > 1 && en & 2 && pi + 1 === b0) continue;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const ex = ux - dx * t, ey = uy - dy * t, ed = Math.sqrt(ex * ex + ey * ey) - rHw[ri];
        if (ed >= 2.6) continue;
        const z = pz[pi] + (pz[pi + 1] - pz[pi]) * t;
        if (ed < 0.35 && z > gi.deck) {
          gi.deck = z;
          gi.deckRoad = ri;
          gi.deckReg = reg;
        }
        const sAt = cum[pi] + Math.sqrt(l2) * t;
        let along2 = 1e9;
        if (en & 1) along2 = sAt - cum[a0];
        if (en & 2) along2 = Math.min(along2, cum[b0] - sAt);
        const lim = z - 0.15 - (DECK_T - 0.03) * smoothstep(6, 14, along2) + smoothstep(0.9, 2.6, ed) * 3;
        if (!water && h > lim) h = lim;
      }
      return h;
    }
    // What a car that is at height href stands on at (mx, my): the ground, or a bridge deck when it is up at the deck's
    // level (it came onto it from the road at a rim) and not passing underneath: the highest deck here that is not out
    // of its reach above.  this.g.onDeck says which, and this._nd is then that deck.
    // A car down at a tunnel's floor (from 1.2 m above it to 1.7 m below) is in the tunnel, whatever the ground overhead:
    // g.onTunnel, and this._nt is the tunnel.
    // from: what the car is on now ('deck', 'tunnel' or 'ground').  A car on a deck follows it up its grade (a deck up
    // to 1.7 m over it); one on the ground or in a tunnel gets onto a deck only where the deck meets its own level (a rim,
    // within 0.45 m), so a road passing under a bridge never jumps up onto it.
    driveH(mx, my, href, from) {
      const h = this.groundH(mx, my), g = this.g;
      g.onTunnel = false;
      const reach = from === void 0 || from === "deck" ? 1.7 : 0.45;
      if (g.deck > -1e8 && this.nearestDeck(mx, my, href + reach) < 0.35) {
        const nd = this._nd;
        if (nd.z > h) {
          g.onDeck = true;
          g.water = false;
          g.deck = nd.z;
          g.deckRoad = nd.road;
          g.deckReg = nd.reg;
          return nd.z;
        }
      }
      if (this.nearestTunnel(mx, my, href + 1.7) < 0) {
        const nt = this._nt;
        if (nt.z > href - 1.2) {
          g.onTunnel = true;
          g.water = false;
          g.road = nt.road;
          g.reg = nt.reg;
          g.edge = nt.d - nt.hw;
          return nt.z;
        }
      }
      return h;
    }
    // Every surface a car could stand on at (mx, my), highest first: the decks the point is on, the ground, and the
    // floors of the tunnels under it.  Each is { z, kind: 'deck' | 'ground' | 'tunnel' }.
    surfaces(mx, my) {
      const out = [];
      const h = this.groundH(mx, my), water = this.g.water;
      let zmax = 1e9;
      for (let t = 0; t < 6 && this.nearestDeck(mx, my, zmax) < 0.35; t++) {
        const z = this._nd.z;
        if (z > h + 0.2) out.push({ z, kind: "deck" });
        zmax = z - 0.8;
      }
      out.push({ z: h, kind: "ground", water });
      zmax = h - 1.5;
      for (let t = 0; t < 4 && this.nearestTunnel(mx, my, zmax) < 0; t++) {
        const z = this._nt.z;
        out.push({ z, kind: "tunnel" });
        zmax = z - 3;
      }
      return out;
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
      const k1 = (k + 1) % RN, A = G[i][k], B = G[i][k1], C2 = G[i + 1][k1], D2 = G[i + 1][k];
      const ux = C2[0] - A[0], uy = C2[1] - A[1], uz = C2[2] - A[2], vx = D2[0] - B[0], vy = D2[1] - B[1], vz = D2[2] - B[2];
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
  var MAT = { WALL: 0, ROOF: 1, TRIM: 2, FLATROOF: 3, BRICK: 4, CONCRETE: 5, DECK: 6, RAIL: 7, METAL: 8, GLASSBOX: 9, ASPHALT: 10, CAR: 11, CARDARK: 12, CARGLASS: 13, CARPALE: 14, CARTAIL: 15, ROADWAY: 16, TRACK: 17, TUNROAD: 18, TUNWALL: 19 };
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
      out[k + 15] = reg.roof ? reg.roof[a + i] : 0;
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
      this.k = new Uint8Array(this.cap * 4);
      this.idx = new Uint32Array(this.icap);
      this.W = [0, 0, 0, -1];
      this.M = [0, 0, 0, 0];
      this.C = [0, 0, 0];
      this.K = [0, 0, 0, 0];
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
      this.k = g(this.k, 4);
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
      this.k.set(this.K, i * 4);
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
    let LF = cls === CLS.CANOPY ? null : env.lift;
    if (LF) {
      LF.soff = liftSoffit(LF, He);
      if (!(LF.soff === LF.soff)) LF = null;
    }
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
      const c = M.v(p1u, top, p1v, nu, 0, nv, len, top - y0), e = M.v(p0u, top, p0v, nu, 0, nv, 0, top - y0);
      if (!LF) {
        const a = M.v(p0u, yb, p0v, nu, 0, nv, 0, yb - y0), b = M.v(p1u, yb, p1v, nu, 0, nv, len, yb - y0);
        M.quad(a, b, c, e);
      } else {
        const ts = [0, 1];
        corrCuts(LF, p0u, p0v, p1u, p1v, ts);
        ts.sort((x, y) => x - y);
        for (let q = 0; q + 1 < ts.length; q++) {
          const ta = ts[q], tb = ts[q + 1];
          if (tb - ta < 1e-4) continue;
          const tm = (ta + tb) / 2, foot = inCorr(LF, p0u + (p1u - p0u) * tm, p0v + (p1v - p0v) * tm, 0.02) ? LF.soff : yb;
          const ua = p0u + (p1u - p0u) * ta, va = p0v + (p1v - p0v) * ta, ub = p0u + (p1u - p0u) * tb, vb = p0v + (p1v - p0v) * tb;
          const a = M.v(ua, foot, va, nu, 0, nv, len * ta, foot - y0), b = M.v(ub, foot, vb, nu, 0, nv, len * tb, foot - y0);
          const c2 = M.v(ub, top, vb, nu, 0, nv, len * tb, top - y0), e2 = M.v(ua, top, va, nu, 0, nv, len * ta, top - y0);
          M.quad(a, b, c2, e2);
        }
      }
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
    if (LF) {
      const P2 = [-w / 2, -d / 2, 0, w / 2, -d / 2, 0, w / 2, d / 2, 0, -w / 2, d / 2, 0];
      if (!LF.R) underside(M, setM, P2, null, [], LF.soff);
      else {
        for (const r of LF.R) underside(M, setM, P2, null, r.K, LF.soff);
        abutments(M, setM, LF, P2, [], yb, LF.soff);
      }
      M.W[0] = 0;
      M.W[1] = 0;
      M.W[2] = 0;
      M.W[3] = -1;
    }
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
    if (!LF) site(M, setM, W4[side], side === 0 || side === 2 ? w : d, cls, levels, seed, porch, found, y0, yb, r1, r2, r3, env);
  }
  function site(M, setM, wall, depth, cls, levels, seed, porch, found, y0, yb, r1, r2, r3, env) {
    if (!(cls <= CLS.TRIPLE || cls === CLS.ROW || cls === CLS.MULTI)) return;
    const [p0u, p0v, p1u, p1v, nu, nv, len] = wall;
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
          const back = Math.min(6.5, Math.max(3, depth * 0.6));
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
  function parseReal(buf) {
    const dv = new DataView(buf);
    if (dv.getUint32(0, true) !== 860113986) throw new Error("bad building file");
    const n = dv.getUint32(4, true);
    return { n, off: new Uint32Array(buf.slice(8, 8 + (n + 1) * 4)), dv, base: 8 + (n + 1) * 4 };
  }
  var CUT = 2;
  function clipPoly(P2, a, b, c, out) {
    out.length = 0;
    const n = P2.length / 3;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const su = P2[i * 3], sv = P2[i * 3 + 1], eu = P2[j * 3], ev = P2[j * 3 + 1];
      const ds = a * su + b * sv + c, de = a * eu + b * ev + c;
      if (de >= 0) {
        if (ds < 0) {
          const t = ds / (ds - de);
          out.push(su + (eu - su) * t, sv + (ev - sv) * t, P2[i * 3 + 2]);
        }
        out.push(eu, ev, P2[j * 3 + 2]);
      } else if (ds >= 0) {
        const t = ds / (ds - de);
        out.push(su + (eu - su) * t, sv + (ev - sv) * t, CUT);
      }
    }
    return out;
  }
  function polyArea(P2) {
    let s = 0;
    const n = P2.length / 3;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      s += P2[i * 3] * P2[j * 3 + 1] - P2[j * 3] * P2[i * 3 + 1];
    }
    return s / 2;
  }
  function ears(P2, tri) {
    const n0 = P2.length / 3;
    if (n0 < 3) return;
    let area = 0;
    for (let i = 0; i < n0; i++) {
      const j = (i + 1) % n0;
      area += P2[i * 3] * P2[j * 3 + 1] - P2[j * 3] * P2[i * 3 + 1];
    }
    const sg = area >= 0 ? 1 : -1;
    const idx = [];
    for (let i = 0; i < n0; i++) {
      const j = idx.length ? idx[idx.length - 1] : -1;
      if (j >= 0 && Math.abs(P2[i * 3] - P2[j * 3]) < 1e-6 && Math.abs(P2[i * 3 + 1] - P2[j * 3 + 1]) < 1e-6) continue;
      idx.push(i);
    }
    while (idx.length > 3 && Math.abs(P2[idx[0] * 3] - P2[idx[idx.length - 1] * 3]) < 1e-6 && Math.abs(P2[idx[0] * 3 + 1] - P2[idx[idx.length - 1] * 3 + 1]) < 1e-6) idx.pop();
    const X = (i) => P2[i * 3], Y = (i) => P2[i * 3 + 1];
    const cross = (a, b, c) => sg * ((X(b) - X(a)) * (Y(c) - Y(a)) - (Y(b) - Y(a)) * (X(c) - X(a)));
    const same = (a, b) => Math.abs(X(a) - X(b)) < 1e-6 && Math.abs(Y(a) - Y(b)) < 1e-6;
    const inside = (x, y) => {
      let c = false;
      for (let i = 0, j = n0 - 1; i < n0; j = i++) {
        const xi = P2[i * 3], yi = P2[i * 3 + 1], xj = P2[j * 3], yj = P2[j * 3 + 1];
        if (yi > y !== yj > y && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
      }
      return c;
    };
    const eps = 1e-7;
    let guard = 0;
    while (idx.length > 3 && guard++ < 4 * n0 + 50) {
      let cut = false;
      for (let k = 0; k < idx.length; k++) {
        const i0 = idx[(k + idx.length - 1) % idx.length], i1 = idx[k], i2 = idx[(k + 1) % idx.length];
        const cr = cross(i0, i1, i2);
        if (Math.abs(cr) <= 1e-9) {
          idx.splice(k, 1);
          cut = true;
          break;
        }
        if (cr < 0) continue;
        let ok = true;
        for (const q of idx) {
          if (q === i0 || q === i1 || q === i2 || same(q, i0) || same(q, i1) || same(q, i2)) continue;
          const d0 = cross(i0, i1, q), d1 = cross(i1, i2, q), d2 = cross(i2, i0, q);
          if (d0 >= -eps && d1 >= -eps && d2 >= -eps) {
            ok = false;
            break;
          }
        }
        if (!ok) continue;
        tri(i0, i1, i2);
        idx.splice(k, 1);
        cut = true;
        break;
      }
      if (!cut) break;
    }
    if (idx.length === 3) {
      if (cross(idx[0], idx[1], idx[2]) > 1e-9) tri(idx[0], idx[1], idx[2]);
      return;
    }
    for (let k = 1; k + 1 < idx.length; k++) {
      const a = idx[0], b = idx[k], c = idx[k + 1];
      if (cross(a, b, c) <= 1e-9) continue;
      if (inside((X(a) + X(b) + X(c)) / 3, (Y(a) + Y(b) + Y(c)) / 3)) tri(a, b, c);
    }
  }
  var _A = [];
  var _B = [];
  var _F = [];
  var _G = [];
  function roofOf(M, setM, P2, pl, lift) {
    const np = pl.length;
    for (let q = 0; q < np; q++) {
      let F = P2;
      if (np > 1) {
        F = _F;
        F.length = 0;
        for (let i = 0; i < P2.length; i++) F.push(P2[i]);
        for (let r = 0; r < np && F.length >= 9; r++) {
          if (r === q) continue;
          const a2 = pl[r][0] - pl[q][0], b2 = pl[r][1] - pl[q][1], c2 = pl[r][2] - pl[q][2];
          if (Math.abs(a2) < 1e-6 && Math.abs(b2) < 1e-6) {
            if (c2 < 0 || c2 === 0 && r < q) F.length = 0;
            continue;
          }
          clipPoly(F, a2, b2, c2, _G);
          F.length = 0;
          for (let i = 0; i < _G.length; i++) F.push(_G[i]);
        }
      }
      if (F.length < 9 || polyArea(F) < 0.02) continue;
      const a = pl[q][0], b = pl[q][1], c = pl[q][2] + lift, gl = Math.hypot(a, b), sl = Math.hypot(1, gl);
      const flat = gl < 0.14;
      setM(flat ? MAT.FLATROOF : MAT.ROOF);
      const ids = [];
      for (let i = 0; i < F.length / 3; i++) {
        const u = F[i * 3], v = F[i * 3 + 1];
        const tu = flat ? u : (-b * u + a * v) / gl, tv = flat ? v : (a * u + b * v) / gl * sl;
        ids.push(M.v(u, a * u + b * v + c, v, -a / sl, 1 / sl, -b / sl, tu, tv));
      }
      ears(F, (i0, i1, i2) => M.tri(ids[i0], ids[i1], ids[i2]));
    }
  }
  function inRing(R2, x, y) {
    let c = false;
    for (let i = 0, n = R2.length / 3, j = n - 1; i < n; j = i++) {
      const xi = R2[i * 3], yi = R2[i * 3 + 1], xj = R2[j * 3], yj = R2[j * 3 + 1];
      if (yi > y !== yj > y && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
    }
    return c;
  }
  var orient = (ax, ay, bx, by, cx, cy) => (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  function onOpen(px, py, ax, ay, bx, by) {
    if (Math.abs(orient(ax, ay, bx, by, px, py)) > 1e-9) return false;
    const d = (px - ax) * (bx - ax) + (py - ay) * (by - ay), l2 = (bx - ax) * (bx - ax) + (by - ay) * (by - ay);
    return d > 1e-12 && d < l2 - 1e-12;
  }
  function stops(ax, ay, bx, by, cx, cy, dx, dy) {
    const ca = cx === ax && cy === ay || cx === bx && cy === by, da = dx === ax && dy === ay || dx === bx && dy === by;
    if (ca && da) return true;
    if (ca) return onOpen(dx, dy, ax, ay, bx, by);
    if (da) return onOpen(cx, cy, ax, ay, bx, by);
    const E = 1e-9, d1 = orient(ax, ay, bx, by, cx, cy), d2 = orient(ax, ay, bx, by, dx, dy), d3 = orient(cx, cy, dx, dy, ax, ay), d4 = orient(cx, cy, dx, dy, bx, by);
    if ((d1 > E && d2 < -E || d1 < -E && d2 > E) && (d3 > E && d4 < -E || d3 < -E && d4 > E)) return true;
    const on = (px, py, qx, qy, rx, ry) => Math.min(qx, rx) - 1e-9 <= px && px <= Math.max(qx, rx) + 1e-9 && Math.min(qy, ry) - 1e-9 <= py && py <= Math.max(qy, ry) + 1e-9;
    return Math.abs(d1) <= E && on(cx, cy, ax, ay, bx, by) || Math.abs(d2) <= E && on(dx, dy, ax, ay, bx, by) || Math.abs(d3) <= E && on(ax, ay, cx, cy, dx, dy) || Math.abs(d4) <= E && on(bx, by, cx, cy, dx, dy);
  }
  function clearCut(ax, ay, bx, by, rings) {
    for (const R2 of rings) {
      const n = R2.length / 3;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        if (stops(ax, ay, bx, by, R2[i * 3], R2[i * 3 + 1], R2[j * 3], R2[j * 3 + 1])) return false;
      }
    }
    return true;
  }
  function planTriangles(P2, holes) {
    let Q = P2.slice(), ends = new Uint8Array(Q.length / 3);
    const kept = [], left = holes.slice();
    while (left.length) {
      const H = left.shift(), nh = H.length / 3, nq = Q.length / 3;
      const D2 = [];
      for (let i2 = 0; i2 < nh; i2++) for (let j2 = 0; j2 < nq; j2++) {
        if (ends[j2]) continue;
        const du = H[i2 * 3] - Q[j2 * 3], dv = H[i2 * 3 + 1] - Q[j2 * 3 + 1];
        D2.push([du * du + dv * dv, i2, j2]);
      }
      D2.sort((x, y) => x[0] - y[0]);
      let hit = null;
      for (let k = 0; k < D2.length && k < 600; k++) {
        const [, i2, j2] = D2[k];
        if (clearCut(H[i2 * 3], H[i2 * 3 + 1], Q[j2 * 3], Q[j2 * 3 + 1], [Q, H, ...left])) {
          hit = D2[k];
          break;
        }
      }
      if (!hit) continue;
      const [, i, j] = hit, ins = [];
      for (let t = 0; t <= nh; t++) {
        const q = (i + t) % nh;
        ins.push(H[q * 3], H[q * 3 + 1], 0);
      }
      ins.push(Q[j * 3], Q[j * 3 + 1], Q[j * 3 + 2]);
      Q = Q.slice(0, (j + 1) * 3).concat(ins, Q.slice((j + 1) * 3));
      const e2 = new Uint8Array(Q.length / 3);
      e2.set(ends.subarray(0, j + 1), 0);
      e2.set(ends.subarray(j + 1), j + nh + 3);
      e2[j] = 1;
      e2[j + 1] = 1;
      e2[j + 1 + nh] = 1;
      e2[j + 2 + nh] = 1;
      ends = e2;
      kept.push(H);
    }
    holes.length = 0;
    if (!kept.length) return null;
    const T = [];
    let sum = 0;
    ears(Q, (a, b, c) => {
      T.push(Q[a * 3], Q[a * 3 + 1], Q[b * 3], Q[b * 3 + 1], Q[c * 3], Q[c * 3 + 1]);
      sum += orient(Q[a * 3], Q[a * 3 + 1], Q[b * 3], Q[b * 3 + 1], Q[c * 3], Q[c * 3 + 1]) / 2;
    });
    let want = polyArea(P2);
    for (const H of kept) want += polyArea(H);
    if (!(want > 0) || Math.abs(sum - want) > 0.01 * want + 0.05) return null;
    for (const H of kept) holes.push(H);
    return T;
  }
  var _K = [];
  function roofOfTris(M, setM, T, K, pl, lift) {
    const np = pl.length;
    for (let q = 0; q < np; q++) {
      _K.length = 0;
      for (const h of K) _K.push(h);
      let empty = false;
      for (let r = 0; r < np; r++) {
        if (r === q) continue;
        const a2 = pl[r][0] - pl[q][0], b2 = pl[r][1] - pl[q][1], c2 = pl[r][2] - pl[q][2];
        if (Math.abs(a2) < 1e-6 && Math.abs(b2) < 1e-6) {
          if (c2 < 0 || c2 === 0 && r < q) {
            empty = true;
            break;
          }
          continue;
        }
        _K.push([a2, b2, c2]);
      }
      if (empty) continue;
      const a = pl[q][0], b = pl[q][1], c = pl[q][2] + lift, gl = Math.hypot(a, b), sl = Math.hypot(1, gl);
      const flat = gl < 0.14;
      setM(flat ? MAT.FLATROOF : MAT.ROOF);
      for (let t = 0; t < T.length; t += 6) {
        const F = _F;
        F.length = 0;
        F.push(T[t], T[t + 1], 0, T[t + 2], T[t + 3], 0, T[t + 4], T[t + 5], 0);
        for (const h of _K) {
          clipPoly(F, h[0], h[1], h[2], _G);
          F.length = 0;
          for (let i = 0; i < _G.length; i++) F.push(_G[i]);
          if (F.length < 9) break;
        }
        if (F.length < 9 || polyArea(F) < 1e-4) continue;
        const ids = [];
        for (let i = 0; i < F.length / 3; i++) {
          const u = F[i * 3], v = F[i * 3 + 1];
          const tu = flat ? u : (-b * u + a * v) / gl, tv = flat ? v : (a * u + b * v) / gl * sl;
          ids.push(M.v(u, a * u + b * v + c, v, -a / sl, 1 / sl, -b / sl, tu, tv));
        }
        for (let i = 1; i + 1 < F.length / 3; i++) {
          if (orient(F[0], F[1], F[i * 3], F[i * 3 + 1], F[i * 3 + 3], F[i * 3 + 4]) > 1e-9) M.tri(ids[0], ids[i], ids[i + 1]);
        }
      }
    }
  }
  function outsideHoles(u0, v0, u1, v1, holes) {
    const ts = [0, 1], ex = u1 - u0, ey = v1 - v0;
    for (const H of holes) {
      const n = H.length / 3;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n, cu = H[i * 3], cv = H[i * 3 + 1], du = H[j * 3] - cu, dv = H[j * 3 + 1] - cv, den = ex * dv - ey * du;
        if (Math.abs(den) < 1e-12) continue;
        const t = ((cu - u0) * dv - (cv - v0) * du) / den, s = ((cu - u0) * ey - (cv - v0) * ex) / den;
        if (t > 0 && t < 1 && s >= 0 && s <= 1) ts.push(t);
      }
    }
    ts.sort((x, y) => x - y);
    const out = [];
    for (let k = 0; k + 1 < ts.length; k++) {
      const ta = ts[k], tb = ts[k + 1];
      if (tb - ta < 1e-4) continue;
      const tm = (ta + tb) / 2, um = u0 + ex * tm, vm = v0 + ey * tm;
      let open = false;
      for (const H of holes) if (inRing(H, um, vm)) {
        open = true;
        break;
      }
      if (open) continue;
      if (out.length && out[out.length - 1][1] >= ta - 1e-4) out[out.length - 1][1] = tb;
      else out.push([ta, tb]);
    }
    return out;
  }
  var _T = [];
  function wallOf(M, u0, v0, u1, v1, ta, tb, over, yb, lift, len, info) {
    const nu = (v1 - v0) / len, nv = -(u1 - u0) / len;
    const all = [];
    for (const pl of over) for (const q of pl) all.push(q);
    const ts = _T;
    ts.length = 0;
    ts.push(ta, tb);
    for (let q = 0; q < all.length; q++) for (let r = q + 1; r < all.length; r++) {
      const da = all[q][0] - all[r][0], db = all[q][1] - all[r][1], dc = all[q][2] - all[r][2];
      const d0 = da * u0 + db * v0 + dc, d1 = da * u1 + db * v1 + dc;
      if (d0 < 0 !== d1 < 0 && d0 !== d1) {
        const t = d0 / (d0 - d1);
        if (t > ta + 4e-3 && t < tb - 4e-3) ts.push(t);
      }
    }
    ts.sort((x, y) => x - y);
    const H = (t) => {
      const u = u0 + (u1 - u0) * t, v = v0 + (v1 - v0) * t;
      let top = -Infinity;
      for (const pl of over) {
        let h = Infinity;
        for (const q of pl) {
          const z = q[0] * u + q[1] * v + q[2];
          if (z < h) h = z;
        }
        if (h > top) top = h;
      }
      return top + lift;
    };
    let lo = Infinity, hi = -Infinity;
    const hs = [];
    for (let k = 0; k < ts.length; k++) {
      const h = H(ts[k]);
      hs.push(h);
      if (h < lo) lo = h;
      if (h > hi) hi = h;
    }
    if (hi <= yb + 0.05) return;
    const wi = info ? info(lo, hi - lo > 0.6, (tb - ta) * len) : null;
    M.W[0] = len;
    M.W[1] = wi ? wi[0] : 0;
    M.W[2] = wi ? wi[1] : 1;
    M.W[3] = wi ? wi[2] : -1;
    const y0 = wi ? wi[3] : 0;
    for (let k = 0; k + 1 < ts.length; k++) {
      const t0 = ts[k], t1 = ts[k + 1];
      if (t1 - t0 < 1e-4) continue;
      const ua = u0 + (u1 - u0) * t0, va = v0 + (v1 - v0) * t0, ub = u0 + (u1 - u0) * t1, vb = v0 + (v1 - v0) * t1;
      const a = M.v(ua, yb, va, nu, 0, nv, len * t0, yb - y0), b = M.v(ub, yb, vb, nu, 0, nv, len * t1, yb - y0);
      const c = M.v(ub, hs[k + 1], vb, nu, 0, nv, len * t1, hs[k + 1] - y0), e = M.v(ua, hs[k], va, nu, 0, nv, len * t0, hs[k] - y0);
      M.quad(a, b, c, e);
    }
  }
  function liftFrame(L2, reg, mx, my, ca, sa, g) {
    if (!L2) return null;
    const F = { s: L2.s != null ? L2.s - g : L2.h != null ? L2.h : NaN, t: L2.t || 0, R: null, soff: NaN };
    if (L2.c) {
      F.R = [];
      for (const c of L2.c) {
        const dx0 = reg.x0 + c[0] - mx, dy0 = reg.y0 + c[1] - my, dx1 = reg.x0 + c[2] - mx, dy1 = reg.y0 + c[3] - my, hw = c[4];
        const u0 = ca * dx0 + sa * dy0, v0 = -sa * dx0 + ca * dy0, u1 = ca * dx1 + sa * dy1, v1 = -sa * dx1 + ca * dy1;
        const len = Math.hypot(u1 - u0, v1 - v0);
        if (len < 0.1) continue;
        const tu = (u1 - u0) / len, tv = (v1 - v0) / len, nu = -tv, nv = tu, o = nu * u0 + nv * v0;
        F.R.push({
          K: [[-nu, -nv, o + hw], [nu, nv, hw - o], [tu, tv, -(tu * u0 + tv * v0)], [-tu, -tv, tu * u1 + tv * v1]],
          C: [u0 + nu * hw, v0 + nv * hw, u1 + nu * hw, v1 + nv * hw, u1 - nu * hw, v1 - nv * hw, u0 - nu * hw, v0 - nv * hw]
        });
      }
      if (!F.R.length) return null;
    }
    return F;
  }
  function liftSoffit(F, top) {
    let s = F.t ? Math.max(top - F.t, Math.min(4.5, top - 1.2)) : F.s;
    s = Math.min(s, top - 1);
    return s >= 2.4 ? s : NaN;
  }
  function inCorr(F, u, v, e) {
    if (!F.R) return true;
    for (const r of F.R) {
      let ok = true;
      for (const h of r.K) if (h[0] * u + h[1] * v + h[2] < -e) {
        ok = false;
        break;
      }
      if (ok) return true;
    }
    return false;
  }
  function corrCuts(F, u0, v0, u1, v1, ts) {
    if (!F.R) return;
    for (const r of F.R) for (const h of r.K) {
      const d0 = h[0] * u0 + h[1] * v0 + h[2], d1 = h[0] * u1 + h[1] * v1 + h[2];
      if (d0 < 0 !== d1 < 0 && d0 !== d1) {
        const t = d0 / (d0 - d1);
        if (t > 0.01 && t < 0.99) ts.push(t);
      }
    }
  }
  function underside(M, setM, P2, T, K, y) {
    setM(MAT.CONCRETE);
    M.W[0] = 0;
    M.W[1] = 0;
    M.W[2] = 0;
    M.W[3] = -1;
    const emit = (F) => {
      const ids = [];
      for (let i = 0; i < F.length / 3; i++) ids.push(M.v(F[i * 3], y, F[i * 3 + 1], 0, -1, 0, F[i * 3], F[i * 3 + 1]));
      ears(F, (a, b, c) => M.tri(ids[a], ids[b], ids[c]));
    };
    const cut = (F) => {
      for (const h of K) {
        F = clipPoly(F, h[0], h[1], h[2], []);
        if (F.length < 9) return null;
      }
      return Math.abs(polyArea(F)) > 1e-3 ? F : null;
    };
    if (T) for (let t = 0; t < T.length; t += 6) {
      const F = cut([T[t], T[t + 1], 0, T[t + 2], T[t + 3], 0, T[t + 4], T[t + 5], 0]);
      if (F) emit(F);
    }
    else {
      const F = cut(P2.slice());
      if (F) emit(F);
    }
  }
  function abutments(M, setM, F, P2, holes, yb, soff) {
    setM(MAT.CONCRETE);
    M.W[0] = 0;
    M.W[1] = 0;
    M.W[2] = 0;
    M.W[3] = -1;
    const rings = [P2, ...holes];
    for (const r of F.R) {
      const C2 = r.C;
      for (const [s, a, b] of [[0, 0, 1], [1, 2, 3], [2, 3, 0], [3, 1, 2]]) {
        const ua = C2[a * 2], va = C2[a * 2 + 1], ub = C2[b * 2], vb = C2[b * 2 + 1], ex = ub - ua, ey = vb - va, len = Math.hypot(ex, ey);
        if (len < 0.05) continue;
        const ts = [0, 1];
        for (const R2 of rings) {
          const n = R2.length / 3;
          for (let i = 0; i < n; i++) {
            const j = (i + 1) % n, cu = R2[i * 3], cv = R2[i * 3 + 1], du = R2[j * 3] - cu, dv = R2[j * 3 + 1] - cv, den = ex * dv - ey * du;
            if (Math.abs(den) < 1e-12) continue;
            const t = ((cu - ua) * dv - (cv - va) * du) / den, q = ((cu - ua) * ey - (cv - va) * ex) / den;
            if (t > 0 && t < 1 && q >= 0 && q <= 1) ts.push(t);
          }
        }
        for (const o of F.R) if (o !== r) for (const h2 of o.K) {
          const d0 = h2[0] * ua + h2[1] * va + h2[2], d1 = h2[0] * ub + h2[1] * vb + h2[2];
          if (d0 < 0 !== d1 < 0 && d0 !== d1) {
            const t = d0 / (d0 - d1);
            if (t > 0 && t < 1) ts.push(t);
          }
        }
        ts.sort((x, y) => x - y);
        const h = r.K[s], nl = Math.hypot(h[0], h[1]), nu = h[0] / nl, nv = h[1] / nl;
        for (let k = 0; k + 1 < ts.length; k++) {
          const ta = ts[k], tb = ts[k + 1];
          if (tb - ta < 1e-3) continue;
          const tm = (ta + tb) / 2, um = ua + ex * tm, vm = va + ey * tm;
          if (!inRing(P2, um, vm)) continue;
          let skip = false;
          for (const H of holes) if (inRing(H, um, vm)) {
            skip = true;
            break;
          }
          if (!skip) for (const o of F.R) {
            if (o === r) continue;
            let inside = true;
            for (const q of o.K) if (q[0] * um + q[1] * vm + q[2] < 1e-3) {
              inside = false;
              break;
            }
            if (inside) {
              skip = true;
              break;
            }
          }
          if (skip) continue;
          const pa = [ua + ex * ta, yb, va + ey * ta], pb = [ua + ex * tb, yb, va + ey * tb];
          M.face(pa, pb, [pb[0], soff, pb[2]], [pa[0], soff, pa[2]], [nu, 0, nv], [-nv, 0, nu], [0, 1, 0]);
        }
      }
    }
  }
  function inSec(sc, u, v, e) {
    const qu = sc[5] * u + sc[6] * v, qv = -sc[6] * u + sc[5] * v;
    return qu > sc[0] - e && qu < sc[2] + e && qv > sc[1] - e && qv < sc[3] + e;
  }
  function secK(sc) {
    const c = sc[5], s = sc[6];
    return [[c, s, -sc[0]], [-c, -s, sc[2]], [-s, c, -sc[1]], [s, -c, sc[3]]];
  }
  function realBuilding(M, real, id, B, k, g, gmin, gmax, env, theta) {
    const dv = real.dv, o = real.base + real.off[id];
    const nv = dv.getUint8(o), ns = dv.getUint8(o + 1);
    if (!ns || nv < 3) return false;
    const cls = B[k + 6], side = B[k + 8], mat = B[k + 12], seed = B[k + 13], yawOld = B[k + 4];
    const r1 = h1(id, seed * 7 + 1), r2 = h1(id * 3 + 5, seed + 11), r3 = h1(id + 77, seed * 3 + 2);
    const y0 = clamp(gmax - g, 0, 2.5), yb = Math.min(gmin - g, 0) - 0.6, lift = Math.min(gmin - g, 0), found = FOUND[cls];
    M.C[1] = M.oy;
    const setM = (m) => {
      M.M[0] = m;
      M.M[1] = mat;
      M.M[2] = cls;
      M.M[3] = seed;
    };
    let p = o + 16;
    const P2 = _A;
    P2.length = 0;
    let minu = Infinity, maxu = -Infinity, minv = Infinity, maxv = -Infinity;
    for (let i = 0; i < nv; i++, p += 4) {
      const u = dv.getInt16(p, true) * 0.025, v = dv.getInt16(p + 2, true) * 0.025;
      P2.push(u, v, 0);
      if (u < minu) minu = u;
      if (u > maxu) maxu = u;
      if (v < minv) minv = v;
      if (v > maxv) maxv = v;
    }
    const ver = dv.getUint8(o + 2), nch = dv.getUint16(o + 14, true);
    const secs = [];
    let low = Infinity;
    for (let s = 0; s < ns; s++) {
      const x0 = dv.getInt16(p, true) * 0.025, yy0 = dv.getInt16(p + 2, true) * 0.025, x1 = dv.getInt16(p + 4, true) * 0.025, yy1 = dv.getInt16(p + 6, true) * 0.025;
      const mod = dv.getUint8(p + 8), npl = dv.getUint8(p + 9);
      p += 10;
      const pl = [];
      for (let q = 0; q < npl; q++, p += 6) pl.push([dv.getInt16(p, true) / 8192, dv.getInt16(p + 2, true) / 8192, dv.getInt16(p + 4, true) * 0.02]);
      let rc = 1, rs = 0;
      if (mod & 64) {
        const r = dv.getInt16(p, true) / 1e4;
        p += 2;
        rc = Math.cos(r);
        rs = Math.sin(r);
      }
      secs.push([x0, yy0, x1, yy1, pl, rc, rs]);
      for (const [qu, qv] of [[x0, yy0], [x1, yy0], [x1, yy1], [x0, yy1]]) {
        const u = rc * qu - rs * qv, v = rs * qu + rc * qv;
        let h = Infinity;
        for (const q of pl) h = Math.min(h, q[0] * u + q[1] * v + q[2]);
        if (h < low) low = h;
      }
    }
    const holes = [];
    for (let h = 0, nh = dv.getUint8(o + 3); h < nh; h++) {
      const n = dv.getUint8(p);
      p += 1;
      const H = [];
      for (let i = 0; i < n; i++, p += 4) H.push(dv.getInt16(p, true) * 0.025, dv.getInt16(p + 2, true) * 0.025, 0);
      if (n < 3 || Math.abs(polyArea(H)) < 1) continue;
      if (polyArea(H) > 0) for (let a = 0, b = n - 1; a < b; a++, b--) for (let c = 0; c < 3; c++) {
        const t = H[a * 3 + c];
        H[a * 3 + c] = H[b * 3 + c];
        H[b * 3 + c] = t;
      }
      holes.push(H);
    }
    const T = holes.length ? planTriangles(P2, holes) : null;
    const basePl = [[0, 0, clamp(low - 0.15, 2.2, 400)]];
    let LF = env.lift;
    if (LF) {
      LF.soff = liftSoffit(LF, low + lift);
      if (!(LF.soff === LF.soff)) LF = null;
    }
    const fa = yawOld + side * Math.PI / 2 - theta, fu = Math.cos(fa), fv = Math.sin(fa);
    let front = -1, fl = 2.5;
    for (let i = 0; i < nv; i++) {
      const j = (i + 1) % nv, du = P2[j * 3] - P2[i * 3], dw = P2[j * 3 + 1] - P2[i * 3 + 1], len = Math.hypot(du, dw);
      if (len > fl && (dw * fu - du * fv) / len > 0.7) {
        fl = len;
        front = i;
      }
    }
    const cuts = [];
    let frontWall = null;
    const ringWalls = (R2, front2) => {
      const nr = R2.length / 3;
      for (let i = 0; i < nr; i++) {
        const j = (i + 1) % nr, u0 = R2[i * 3], v0 = R2[i * 3 + 1], u1 = R2[j * 3], v1 = R2[j * 3 + 1], len = Math.hypot(u1 - u0, v1 - v0);
        if (len < 0.05) continue;
        cuts.length = 0;
        cuts.push(0, 1);
        for (const sc of secs) {
          const rc = sc[5], rs = sc[6];
          const qu0 = rc * u0 + rs * v0, dqu = rc * (u1 - u0) + rs * (v1 - v0), qv0 = -rs * u0 + rc * v0, dqv = -rs * (u1 - u0) + rc * (v1 - v0);
          if (Math.abs(dqu) > 1e-6) for (const x of [sc[0], sc[2]]) {
            const t = (x - qu0) / dqu;
            if (t > 0.01 && t < 0.99) cuts.push(t);
          }
          if (Math.abs(dqv) > 1e-6) for (const y of [sc[1], sc[3]]) {
            const t = (y - qv0) / dqv;
            if (t > 0.01 && t < 0.99) cuts.push(t);
          }
        }
        if (LF) corrCuts(LF, u0, v0, u1, v1, cuts);
        cuts.sort((x, y) => x - y);
        const isFront = i === front2, door = isFront ? doorAt(len, cls, seed) : -1;
        if (isFront) frontWall = [u0, v0, u1, v1, (v1 - v0) / len, -(u1 - u0) / len, len];
        setM(MAT.WALL);
        for (let c = 0; c + 1 < cuts.length; c++) {
          const ta = cuts[c], tb = cuts[c + 1];
          if (tb - ta < 1e-4) continue;
          const tm = (ta + tb) / 2, um = u0 + (u1 - u0) * tm, vm = v0 + (v1 - v0) * tm;
          const over = [];
          for (const sc of secs) if (inSec(sc, um, vm, 0.03)) over.push(sc[4]);
          if (!over.length) over.push(basePl);
          const foot = LF && inCorr(LF, um, vm, 0.02) ? LF.soff : yb;
          wallOf(M, u0, v0, u1, v1, ta, tb, over, foot, lift, len, (lo, varies, plen) => {
            if (plen < 1.2) return null;
            const eave = Math.max(lo - y0, 0.3);
            let flags = varies && plen > 3 ? 1 : 0;
            if (isFront) {
              flags |= 2;
              if (cls === CLS.GARAGE || cls === CLS.BARN) flags |= 4;
              if ((cls === CLS.COMM || cls === CLS.RETAIL) && len > 5) flags |= 8;
            }
            return [eave, clamp(Math.round((eave - found - 0.3) / FLOOR[cls]), 1, 60) + 64 * flags, door, y0];
          });
        }
      }
    };
    ringWalls(P2, front);
    for (const H of holes) ringWalls(H, -1);
    M.W[0] = 0;
    M.W[1] = 0;
    M.W[2] = 0;
    M.W[3] = -1;
    if (LF) {
      if (!LF.R) underside(M, setM, P2, T, [], LF.soff);
      else {
        for (const r of LF.R) underside(M, setM, P2, T, r.K, LF.soff);
        abutments(M, setM, LF, P2, holes, yb, LF.soff);
      }
      M.W[0] = 0;
      M.W[1] = 0;
      M.W[2] = 0;
      M.W[3] = -1;
    }
    const clipped = [];
    for (const sc of secs) {
      const pl = sc[4], K = secK(sc);
      let Q = P2;
      for (const k2 of K) Q = clipPoly(Q, k2[0], k2[1], k2[2], _B).slice();
      if (Q.length < 9 || polyArea(Q) < 0.5) continue;
      if (T) roofOfTris(M, setM, T, K, pl, lift);
      else roofOf(M, setM, Q, pl, lift);
      clipped.push([Q, pl]);
    }
    if (T) roofOfTris(M, setM, T, [], basePl, lift);
    else roofOf(M, setM, P2, basePl, lift);
    setM(MAT.WALL);
    for (const [Q, pl] of clipped) {
      const n = Q.length / 3;
      for (let i = 0; i < n; i++) {
        if (Q[i * 3 + 2] !== CUT) continue;
        const j = (i + 1) % n, len = Math.hypot(Q[j * 3] - Q[i * 3], Q[j * 3 + 1] - Q[i * 3 + 1]);
        if (len <= 0.05) continue;
        if (!holes.length) wallOf(M, Q[i * 3], Q[i * 3 + 1], Q[j * 3], Q[j * 3 + 1], 0, 1, [pl], basePl[0][2] + lift - 0.05, lift, len, null);
        else for (const [ta, tb] of outsideHoles(Q[i * 3], Q[i * 3 + 1], Q[j * 3], Q[j * 3 + 1], holes)) wallOf(M, Q[i * 3], Q[i * 3 + 1], Q[j * 3], Q[j * 3 + 1], ta, tb, [pl], basePl[0][2] + lift - 0.05, lift, len, null);
      }
    }
    M.W[0] = 0;
    M.W[1] = 0;
    M.W[2] = 0;
    M.W[3] = -1;
    if (ver >= 2) {
      for (let c = 0; c < nch; c++, p += 8) {
        const cu = dv.getInt16(p, true) * 0.025, cv = dv.getInt16(p + 2, true) * 0.025, su = dv.getUint8(p + 4) * 0.01, sv = dv.getUint8(p + 5) * 0.01, top = dv.getInt16(p + 6, true) * 0.02;
        let hr = -Infinity;
        for (const sc of secs) {
          if (!inSec(sc, cu, cv, 0)) continue;
          let h = Infinity;
          for (const q of sc[4]) h = Math.min(h, q[0] * cu + q[1] * cv + q[2]);
          if (h > hr) hr = h;
        }
        if (hr === -Infinity) hr = basePl[0][2];
        if (top < hr + 0.3) continue;
        setM(cls <= CLS.TRIPLE || cls >= CLS.ROW ? MAT.BRICK : MAT.CONCRETE);
        M.box(cu - su / 2, cu + su / 2, hr - 0.6 + lift, top + lift, cv - sv / 2, cv + sv / 2, 55);
      }
      M.W[0] = 0;
      M.W[1] = 0;
      M.W[2] = 0;
      M.W[3] = -1;
    }
    if (ver < 2 && B[k + 11] > 0 && (cls <= CLS.TRIPLE || cls >= CLS.ROW)) {
      let best = null, ba = 0;
      for (const sc of secs) {
        const a = (sc[2] - sc[0]) * (sc[3] - sc[1]);
        if (sc[4].length >= 2 && a > ba) {
          ba = a;
          best = sc;
        }
      }
      if (best) {
        const [x0, yy0, x1, yy1, pl] = best;
        const env2 = (u, v) => {
          let h = Infinity;
          for (const q of pl) h = Math.min(h, q[0] * u + q[1] * v + q[2]);
          return h;
        };
        const along2 = x1 - x0 >= yy1 - yy0, t = 0.5 + (r2 - 0.5) * 0.5;
        let ru = 0, rv = 0, rh = -Infinity;
        for (let i = 1; i < 16; i++) {
          const u = along2 ? x0 + (x1 - x0) * t : x0 + (x1 - x0) * i / 16, v = along2 ? yy0 + (yy1 - yy0) * i / 16 : yy0 + (yy1 - yy0) * t;
          const h = env2(u, v);
          if (h > rh) {
            rh = h;
            ru = u;
            rv = v;
          }
        }
        const off = (r3 < 0.5 ? -1 : 1) * 0.55, cu = along2 ? ru : ru + off, cv = along2 ? rv + off : rv;
        let inside = false;
        for (let i = 0, j = nv - 1; i < nv; j = i++) {
          const ui = P2[i * 3], vi = P2[i * 3 + 1], uj = P2[j * 3], vj = P2[j * 3 + 1];
          if (vi > cv !== vj > cv && cu < (uj - ui) * (cv - vi) / (vj - vi) + ui) inside = !inside;
        }
        for (const H of holes) if (inRing(H, cu, cv)) inside = false;
        if (inside && rh > 2.5) {
          setM(MAT.BRICK);
          M.box(cu - 0.32, cu + 0.32, env2(cu, cv) - 0.8 + lift, rh + 0.8 + lift, cv - 0.42, cv + 0.42, 55);
        }
      }
    }
    M.W[0] = 0;
    M.W[1] = 0;
    M.W[2] = 0;
    M.W[3] = -1;
    const rD = h1(id * 5 + 3, seed + 29);
    if (ver < 2 && (cls === CLS.CAPE && rD < 0.6 || cls === CLS.HOUSE && rD < 0.15)) {
      let best = null, ba = 0;
      for (const sc of secs) {
        const a = (sc[2] - sc[0]) * (sc[3] - sc[1]);
        if (sc[4].length >= 2 && a > ba) {
          ba = a;
          best = sc;
        }
      }
      if (best) dormers(M, setM, best, P2, nv, fu, fv, found, lift);
      M.W[0] = 0;
      M.W[1] = 0;
      M.W[2] = 0;
      M.W[3] = -1;
    }
    if (frontWall && !LF) site(M, setM, frontWall, Math.min(maxu - minu, maxv - minv), cls, 1, seed, false, found, y0, yb, r1, r2, r3, env);
    return true;
  }
  var D_HE = 1.6;
  var D_W = 1.6;
  var D_PITCH = 0.6;
  var D_BACK = 0.9;
  function dormers(M, setM, sc, P2, nv, fu, fv, found, lift) {
    const [x0, yy0, x1, yy1, pl] = sc;
    let q = -1, facing = 0.5;
    for (let i = 0; i < pl.length; i++) {
      const m2 = Math.hypot(pl[i][0], pl[i][1]);
      if (m2 < 0.5 || m2 > 1.35) continue;
      const f = -(pl[i][0] * fu + pl[i][1] * fv) / m2;
      if (f > facing) {
        facing = f;
        q = i;
      }
    }
    if (q < 0) return;
    const a = pl[q][0], b = pl[q][1], c = pl[q][2], m = Math.hypot(a, b);
    const tu = a / m, tv = b / m, su = -tv, sv = tu;
    const on = (u, v) => {
      let h = Infinity;
      for (const p of pl) h = Math.min(h, p[0] * u + p[1] * v + p[2]);
      return Math.abs(h - (a * u + b * v + c)) < 0.02;
    };
    const inside = (u, v) => {
      let k2 = false;
      for (let i = 0, j = nv - 1; i < nv; j = i++) {
        const ui = P2[i * 3], vi = P2[i * 3 + 1], uj = P2[j * 3], vj = P2[j * 3 + 1];
        if (vi > v !== vj > v && u < (uj - ui) * (v - vi) / (vj - vi) + ui) k2 = !k2;
      }
      return k2;
    };
    let s0 = Infinity, s1 = -Infinity, t0 = Infinity;
    for (const [u, v] of [[x0, yy0], [x1, yy0], [x1, yy1], [x0, yy1]]) {
      const s = u * su + v * sv, t = u * tu + v * tv;
      if (s < s0) s0 = s;
      if (s > s1) s1 = s;
      if (t < t0) t0 = t;
    }
    const Ls = s1 - s0;
    if (Ls < 4.6) return;
    const n = Ls >= 8.2 ? 2 : 1, hw = D_W / 2, peakUp = D_HE + hw * D_PITCH, k = Math.hypot(1, D_PITCH), OV = 0.12, OF = 0.15;
    for (let d = 0; d < n; d++) {
      const sm = s0 + Ls * (n === 2 ? d ? 0.72 : 0.28 : 0.5), ta = t0 + D_BACK, tb = ta + D_HE / m, tc = ta + peakUp / m;
      let ok = true;
      for (const [s, t] of [[sm - hw, ta - 0.05], [sm + hw, ta - 0.05], [sm - hw, tb], [sm + hw, tb], [sm, tc + 0.15]]) {
        const u = su * s + tu * t, v = sv * s + tv * t;
        if (!on(u, v) || !inside(u, v)) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      const hb = c + m * ta + lift, top = hb + D_HE, peak = hb + peakUp;
      const V = (s, t, y, nu, ny, nw, xu, xv) => M.v(su * s + tu * t, y, sv * s + tv * t, nu, ny, nw, xu, xv);
      setM(MAT.WALL);
      M.W[0] = D_W;
      M.W[1] = found + 0.72 + D_HE;
      M.W[2] = 1 + 64 * 2;
      M.W[3] = -1;
      const f0 = found + 0.72;
      const A = V(sm - hw, ta, hb, -tu, 0, -tv, 0, f0), B = V(sm + hw, ta, hb, -tu, 0, -tv, D_W, f0), C2 = V(sm + hw, ta, top, -tu, 0, -tv, D_W, f0 + D_HE);
      const D2 = V(sm, ta, peak, -tu, 0, -tv, hw, f0 + peakUp), E = V(sm - hw, ta, top, -tu, 0, -tv, 0, f0 + D_HE);
      M.tri(A, B, C2);
      M.tri(A, C2, E);
      M.tri(E, C2, D2);
      M.W[0] = D_HE / m;
      M.W[1] = 12;
      M.W[2] = 1;
      M.W[3] = -1;
      for (const sg of [-1, 1]) {
        const s = sm + sg * hw, c0 = found + 2.4;
        const i0 = V(s, ta, hb, sg * su, 0, sg * sv, 0, c0), i1 = V(s, ta, top, sg * su, 0, sg * sv, 0, c0 + D_HE), i2 = V(s, tb, top, sg * su, 0, sg * sv, D_HE / m, c0 + D_HE);
        M.tri(i0, i1, i2);
      }
      setM(MAT.ROOF);
      M.W[0] = 0;
      M.W[1] = 0;
      M.W[2] = 0;
      M.W[3] = -1;
      const eave = top - OV * D_PITCH, te = ta + (D_HE - OV * D_PITCH) / m;
      for (const sg of [-1, 1]) {
        const se = sm + sg * (hw + OV), nu = sg * D_PITCH * su / k, nw = sg * D_PITCH * sv / k;
        const i0 = V(se, ta - OF, eave, nu, 1 / k, nw, 0, 0), i1 = V(sm, ta - OF, peak, nu, 1 / k, nw, 0, (hw + OV) * k);
        const i2 = V(sm, tc, peak, nu, 1 / k, nw, tc - ta + OF, (hw + OV) * k), i3 = V(se, te, eave, nu, 1 / k, nw, te - ta + OF, 0);
        M.quad(i0, i1, i2, i3);
      }
    }
  }
  var _sec = [];
  function farBoxes(world2, list, k, reg, cx, cy, cz, out, minSize = 0) {
    const real = reg && reg.real ? reg.real : null;
    let mx = list[k], my = list[k + 1], a = list[k + 4];
    const w = list[k + 2], d = list[k + 3], id = list[k + 14], cls = list[k + 6], seed = list[k + 13], mat = list[k + 12], rc = list[k + 15];
    let measured2 = false;
    if (real && id < real.n && real.off[id + 1] > real.off[id]) {
      const o = real.base + real.off[id];
      mx = reg.x0 + real.dv.getInt32(o + 4, true) * 0.01;
      my = reg.y0 + real.dv.getInt32(o + 8, true) * 0.01;
      a = real.dv.getInt16(o + 12, true) / 1e4;
      measured2 = true;
    }
    const g = world2.groundH(mx, my, true), wg = world2.g;
    if (wg.water && !measured2) return 0;
    let cap = 1e9;
    if (wg.deck > -1e8) {
      cap = wg.deck - DECK_T - 0.8 - g;
      if (cap < 2.6) return 0;
    }
    const ca = Math.cos(a), sa = Math.sin(a);
    let gmin = g, gmax = g;
    for (const [su, sv] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const hh = world2.groundH(mx + (ca * su * w - sa * sv * d) / 2, my + (sa * su * w + ca * sv * d) / 2, false);
      if (hh < gmin) gmin = hh;
      if (hh > gmax) gmax = hh;
    }
    gmax = Math.min(gmax, g + 2.5);
    gmin = Math.max(gmin, g - 12);
    const yb = Math.min(gmin - g, 0) - 0.6, y0 = clamp(gmax - g, 0, 2.5);
    const boxes = _sec;
    boxes.length = 0;
    let parsed = false;
    if (measured2 && cap > 1e8) {
      const dv = real.dv, o = real.base + real.off[id];
      const nv = dv.getUint8(o), ns = dv.getUint8(o + 1);
      if (ns && nv >= 3) {
        let p = o + 16 + nv * 4;
        for (let s = 0; s < ns; s++) {
          const x0 = dv.getInt16(p, true) * 0.025, v0 = dv.getInt16(p + 2, true) * 0.025, x1 = dv.getInt16(p + 4, true) * 0.025, v1 = dv.getInt16(p + 6, true) * 0.025;
          const mod = dv.getUint8(p + 8), npl = dv.getUint8(p + 9);
          p += 10;
          const pl = [];
          for (let q = 0; q < npl; q++, p += 6) pl.push(dv.getInt16(p, true) / 8192, dv.getInt16(p + 2, true) / 8192, dv.getInt16(p + 4, true) * 0.02);
          let rot = 0;
          if (mod & 64) {
            rot = dv.getInt16(p, true) / 1e4;
            p += 2;
          }
          if (x1 - x0 < 0.8 || v1 - v0 < 0.8 || !npl) continue;
          const rc2 = Math.cos(rot), rs = Math.sin(rot);
          const z = (qu, qv) => {
            const u = rc2 * qu - rs * qv, v = rs * qu + rc2 * qv;
            let h = Infinity;
            for (let q = 0; q < pl.length; q += 3) h = Math.min(h, pl[q] * u + pl[q + 1] * v + pl[q + 2]);
            return h;
          };
          const qm = (x0 + x1) / 2, vq = (v0 + v1) / 2, um = rc2 * qm - rs * vq, vm = rs * qm + rc2 * vq;
          const zc = z(qm, vq), zu0 = z(x0, vq), zu1 = z(x1, vq), zv0 = z(qm, v0), zv1 = z(qm, v1);
          const corners = [z(x0, v0), z(x1, v0), z(x1, v1), z(x0, v1)];
          const eave = Math.max(Math.min(...corners), 2);
          const top = Math.max(zc, zu0, zu1, zv0, zv1, ...corners);
          let rise = top - eave, along2 = 1;
          if (rise < 1) {
            boxes.push([um, vm, x1 - x0, v1 - v0, top, 0, 0, yb, rot]);
            continue;
          }
          along2 = Math.abs(zc - (zu0 + zu1) / 2) >= Math.abs(zc - (zv0 + zv1) / 2) ? 1 : 0;
          boxes.push([um, vm, x1 - x0, v1 - v0, eave, rise, along2 ? 0 : 1, yb, rot]);
        }
        parsed = boxes.length > 0;
      }
    }
    if (!parsed) {
      const roof = cap < 1e8 ? ROOF.FLAT : list[k + 7], wallH = cap < 1e8 ? Math.min(list[k + 5], cap - 0.6) : list[k + 5];
      const r1 = h1(id, seed * 7 + 1);
      const flat = roof === ROOF.FLAT;
      const pitch = PITCH[cls] * (0.9 + 0.25 * r1) * (roof === ROOF.HIP ? 0.8 : 1);
      const He = y0 + wallH;
      if (cls === CLS.CANOPY) boxes.push([0, 0, w, d, He, 0, 0, He - 0.45]);
      else boxes.push([0, 0, w, d, He, flat ? 0 : w / 2 * pitch, 0]);
    }
    const L2 = world2.liftOf ? world2.liftOf(reg, id) : null;
    if (L2 && cls !== CLS.CANOPY) {
      const F = liftFrame(L2, reg, mx, my, ca, sa, g);
      let top = Infinity;
      for (const b of boxes) top = Math.min(top, b[4]);
      const s = F ? liftSoffit(F, top) : NaN;
      let open = 1;
      if (F && F.R) {
        const ra = list[k + 4], rca = Math.cos(ra), rsa = Math.sin(ra), G = liftFrame(L2, reg, list[k], list[k + 1], rca, rsa, g);
        const Pr = [-w / 2, -d / 2, 0, w / 2, -d / 2, 0, w / 2, d / 2, 0, -w / 2, d / 2, 0];
        open = 0;
        if (G) for (const r of G.R) {
          let F2 = Pr.slice();
          for (const h of r.K) {
            F2 = clipPoly(F2, h[0], h[1], h[2], []);
            if (F2.length < 9) break;
          }
          if (F2.length >= 9) open += Math.abs(polyArea(F2));
        }
        open /= Math.max(w * d, 1);
      }
      if (s === s && open >= 0.3) for (const b of boxes) {
        b[7] = Math.max(b.length > 7 && b[7] !== void 0 ? b[7] : yb, s);
        if (b.length < 9) b[8] = 0;
      }
    }
    let big = 0;
    for (const b of boxes) big = Math.max(big, b[2], b[3], b[4] + b[5]);
    if (minSize > 0 && big < minSize) return 0;
    const mul = clamp(0.3 + big * 0.025, 0.45, 1);
    const P2 = _p3a, B = _p3b;
    cyl(mx, my, g, B);
    for (const b of boxes) {
      const [u, v, bw, bd, eave, rise, turn] = b;
      const foot = b.length > 7 ? b[7] : yb;
      const fx = mx + ca * u - sa * v, fy = my + sa * u + ca * v;
      cyl(fx, fy, g + foot, P2);
      const a2 = a + (b.length > 8 ? b[8] : 0);
      const yaw = turn ? a2 + Math.PI / 2 : a2, W = turn ? bd : bw, D2 = turn ? bw : bd;
      out.push(P2[0] - cx, P2[1] - cy, P2[2] - cz, yaw, W, D2, Math.min(eave, cap) - foot, cap < 1e8 ? 0 : rise, seed, cls, mat, rc, B[0] - cx, B[1] - cy, B[2] - cz, mul);
    }
    return boxes.length;
  }
  var _p3a = new Float64Array(3);
  var _p3b = new Float64Array(3);
  function buildHouseTile(world2, list, sel, cx, cy, cz, th, reg) {
    const real = reg && reg.real ? reg.real : null;
    const M = new Mesh();
    const c = Math.cos(th), s = Math.sin(th);
    const p32 = new Float64Array(3);
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
      let mx = list[k], my = list[k + 1], a = list[k + 4];
      const w = list[k + 2], d = list[k + 3], id = list[k + 14];
      let measured2 = false;
      if (real && id < real.n && real.off[id + 1] > real.off[id]) {
        const o = real.base + real.off[id];
        mx = reg.x0 + real.dv.getInt32(o + 4, true) * 0.01;
        my = reg.y0 + real.dv.getInt32(o + 8, true) * 0.01;
        a = real.dv.getInt16(o + 12, true) / 1e4;
        measured2 = true;
      }
      const g = world2.groundH(mx, my, true);
      if (world2.g.water && !measured2) continue;
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
      if (reg && reg.nDeck) {
        let cap = 1e9;
        for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) {
          const px = mx + (ca * i * w - sa * j * d) / 4, py = my + (sa * i * w + ca * j * d) / 4;
          let zmax = 1e9;
          for (let t = 0; t < 4 && world2.nearestDeck(px, py, zmax) < 0.35; t++) {
            const zd = world2._nd.z;
            if (zd > g + 1.5) cap = Math.min(cap, zd - DECK_T - 0.8 - g);
            zmax = zd - 0.5;
          }
        }
        if (cap < 2.6) continue;
        if (cap < 1e8) {
          measured2 = false;
          list[k + 5] = Math.min(list[k + 5], cap - 0.6);
          list[k + 7] = ROOF.FLAT;
          list[k + 11] = 0;
          list[k + 9] = clamp(Math.floor(list[k + 5] / 3), 1, Math.max(1, list[k + 9]));
        }
      }
      cyl(mx, my, g, p32);
      const dx = p32[0] - cx, dy = p32[1] - cy, dz = p32[2] - cz;
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
      env.lift = liftFrame(world2.liftOf ? world2.liftOf(reg, id) : null, reg, mx, my, ca, sa, g);
      const rc = list[k + 15];
      if (rc > 0) {
        M.K[0] = (rc >> 11 & 31) * 255 / 31;
        M.K[1] = (rc >> 5 & 63) * 255 / 63;
        M.K[2] = (rc & 31) * 255 / 31;
        M.K[3] = 255;
      } else M.K[0] = M.K[1] = M.K[2] = M.K[3] = 0;
      if (!(measured2 && realBuilding(M, real, id, list, k, g, gmin, gmax, env, a))) building(M, list, k, g, gmin, gmax, env);
      count++;
    }
    return { n: M.n, count, pos: M.pos.slice(0, M.n * 3), nor: M.nor.slice(0, M.n * 4), uv: M.uv.slice(0, M.n * 2), w: M.w.slice(0, M.n * 4), m: M.m.slice(0, M.n * 4), c: M.c.slice(0, M.n * 3), k: M.k.slice(0, M.n * 4), idx: M.idx.slice(0, M.ni) };
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
    if (world2.g.deck > -1e8 && world2.g.deck < out.h + 12) return false;
    return !world2.g.water;
  }
  function streetItems(world2, reg, kind, mx0, my0, s, cx, cy, cz) {
    const out = [];
    if (!reg || !reg.nRoads) return new Float32Array(0);
    const box = roadBoxes(reg), p32 = new Float64Array(3);
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
            cyl(A.mx, A.my, A.h, p32);
            out.push(p32[0] - cx, p32[1] - cy, p32[2] - cz, A.yaw, hash2(k * 7 + 3, reg.rName[ri] + 11));
          } else if (poleAt(world2, reg, ri, k + 1, B)) {
            const span = Math.hypot(B.mx - A.mx, B.my - A.my);
            if (span > POLE_GAP * 1.6) continue;
            let clear = true;
            for (let j = 1; j < 6 && clear; j++) {
              world2.groundH(A.mx + (B.mx - A.mx) * j / 6, A.my + (B.my - A.my) * j / 6, true);
              if (world2.g.deck > -1e8 && world2.g.deck < A.h + 12) clear = false;
            }
            if (!clear) continue;
            for (const [lat, hgt, sag] of [[-1.05, 8.66, 0.75], [0, 10.12, 0.7], [1.05, 8.66, 0.75], [0.16, 6.4, 0.95]]) {
              let px0 = 0, py0 = 0, pz0 = 0;
              for (let j = 0; j <= 6; j++) {
                const u = j / 6, lx = lat, mx = A.mx + (B.mx - A.mx) * u + (A.ty + (B.ty - A.ty) * u) * lx, my = A.my + (B.my - A.my) * u - (A.tx + (B.tx - A.tx) * u) * lx;
                cyl(mx, my, A.h + (B.h - A.h) * u + hgt - 4 * sag * u * (1 - u), p32);
                if (j > 0) out.push(px0, py0, pz0, p32[0] - cx, p32[1] - cy, p32[2] - cz);
                px0 = p32[0] - cx;
                py0 = p32[1] - cy;
                pz0 = p32[2] - cz;
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
          cyl(mx, my, h + 0.02, p32);
          out.push(p32[0] - cx, p32[1] - cy, p32[2] - cz, Math.atan2(-tx * side, ty * side), hash2(k + 31, reg.rName[ri] + k * 13));
        }
      }
    }
    return new Float32Array(out);
  }

  // src/spans.js
  var D = { SLAB: 1, GIRDER: 2, DECK_TRUSS: 3, TRUSS: 4, DECK_ARCH: 5, ARCH: 6, SUSPENSION: 7, STAYED: 8, LIFT: 9, BASCULE: 10, SWING: 11, FRAME: 12 };
  var STEEL = (mat) => mat === 2 || mat === 6;
  var _e1 = [0, 0, 0];
  var _e2 = [0, 0, 0];
  function beam(M, a, b, w, h, up) {
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], L2 = Math.hypot(dx, dy, dz);
    if (L2 < 0.05) return;
    const d0 = dx / L2, d1 = dy / L2, d2 = dz / L2;
    let x = d1 * up[2] - d2 * up[1], y = d2 * up[0] - d0 * up[2], z = d0 * up[1] - d1 * up[0];
    let l = Math.hypot(x, y, z);
    if (l < 0.15) {
      x = 0;
      y = -d2;
      z = d1;
      l = Math.hypot(x, y, z);
      if (l < 0.15) {
        x = d2;
        y = 0;
        z = -d0;
        l = Math.hypot(x, y, z);
      }
    }
    _e1[0] = x / l;
    _e1[1] = y / l;
    _e1[2] = z / l;
    _e2[0] = _e1[1] * d2 - _e1[2] * d1;
    _e2[1] = _e1[2] * d0 - _e1[0] * d2;
    _e2[2] = _e1[0] * d1 - _e1[1] * d0;
    const side = (s1, s2, n) => {
      const c = (p, t1, t2) => M.v(
        p[0] + _e1[0] * w * t1 + _e2[0] * h * t2,
        p[1] + _e1[1] * w * t1 + _e2[1] * h * t2,
        p[2] + _e1[2] * w * t1 + _e2[2] * h * t2,
        n[0],
        n[1],
        n[2],
        p === a ? 0 : L2,
        (t1 + t2) * 0.5 + 0.5
      );
      let i0, i1, i2, i3;
      if (s1 !== 0) {
        i0 = c(a, s1, -1);
        i1 = c(b, s1, -1);
        i2 = c(b, s1, 1);
        i3 = c(a, s1, 1);
      } else {
        i0 = c(a, -1, s2);
        i1 = c(b, -1, s2);
        i2 = c(b, 1, s2);
        i3 = c(a, 1, s2);
      }
      M.quad(i0, i1, i2, i3);
    };
    side(1, 0, _e1);
    side(-1, 0, [-_e1[0], -_e1[1], -_e1[2]]);
    side(0, 1, _e2);
    side(0, -1, [-_e2[0], -_e2[1], -_e2[2]]);
  }
  function along(reg, ri, s, out) {
    const a = reg.rStart[ri], n = reg.rCount[ri], cum = reg.cum, base = cum[a];
    let lo = a, hi = a + n - 1;
    const t = base + s;
    if (t <= cum[lo]) hi = lo + 1;
    else if (t >= cum[hi]) lo = hi - 1;
    else while (hi - lo > 1) {
      const mid = lo + hi >> 1;
      if (cum[mid] <= t) lo = mid;
      else hi = mid;
    }
    const L2 = Math.max(cum[hi] - cum[lo], 1e-6), f = clamp((t - cum[lo]) / L2, 0, 1);
    const px = reg.px, py = reg.py, pz = reg.pz;
    const dx = px[hi] - px[lo], dy = py[hi] - py[lo], dl = Math.hypot(dx, dy) || 1;
    out[0] = reg.x0 + px[lo] + dx * f;
    out[1] = reg.y0 + py[lo] + dy * f;
    out[2] = pz[lo] + (pz[hi] - pz[lo]) * f;
    out[3] = dx / dl;
    out[4] = dy / dl;
    return out;
  }
  function spanLayout(len, rec, rim0, rim1, panel) {
    const spans = rec[3] || 1, longest = (rec[4] || 0) / 10;
    let cuts;
    if (rim0 && rim1 && spans > 1) {
      const n = Math.max(1, Math.min(spans, Math.round(len / Math.max(longest * 0.6, 12))));
      cuts = Array.from({ length: n + 1 }, (_, k) => len * k / n);
    } else cuts = [0, len];
    return cuts.slice(0, -1).map((c, k) => {
      const L2 = cuts[k + 1] - c;
      return [c, cuts[k + 1], Math.max(2, Math.round(L2 / panel))];
    });
  }
  function wayStructure(M, P2, world2, reg, ri, rec, segs, setM, cls, PW, DT) {
    const des = rec[1], mat = rec[2];
    const a0 = reg.rStart[ri], n = reg.rCount[ri], len = reg.cum[a0 + n - 1] - reg.cum[a0];
    if (len < 4) return;
    const hw = reg.rHw[ri], en = reg.rEnd[ri], rim0 = (en & 1) > 0, rim1 = (en & 2) > 0;
    const mine = (s) => segs.some(([u, v]) => s >= u - 1e-6 && s < v);
    const g = [0, 0, 0, 0, 0], q = [0, 0, 0];
    const at = (s, o, y) => {
      along(reg, ri, clamp(s, 0, len), g);
      const r = P2(g[0] + g[4] * o, g[1] - g[3] * o, g[2] + y);
      return [r[0], r[1], r[2]];
    };
    const upAt = (s) => {
      const p0 = at(s, 0, 0), p1 = at(s, 0, 10);
      q[0] = (p1[0] - p0[0]) / 10;
      q[1] = (p1[1] - p0[1]) / 10;
      q[2] = (p1[2] - p0[2]) / 10;
      return q;
    };
    const longest = clamp((rec[4] || 0) / 10 || len, 8, 400);
    const rail = cls >= 14;
    if (des === D.GIRDER || des === D.FRAME || des === D.SLAB && STEEL(mat)) {
      const gd = STEEL(mat) ? clamp(longest / 20, 0.8, 3.2) : clamp(longest / 18, 0.7, 2.8);
      setM(STEEL(mat) ? MAT.METAL : MAT.CONCRETE);
      const step = 6;
      for (let s = 0; s < len; s += step) {
        if (!mine(s)) continue;
        const s1 = Math.min(s + step, len), up = upAt((s + s1) / 2);
        for (const side of [-1, 1]) {
          const o = side * (hw + PW - 0.25);
          beam(M, at(s, o, -DT - gd / 2), at(s1, o, -DT - gd / 2), 0.22, gd / 2, up);
        }
      }
      return;
    }
    if (des === D.TRUSS || des === D.DECK_TRUSS || des === D.SWING) {
      const deck = des === D.DECK_TRUSS;
      const H = deck ? clamp(longest * 0.12, 3.5, 14) : clamp(longest * 0.14, 5, 16);
      const P0 = clamp(H * 0.85, 4, 8.5);
      const off = deck ? hw * 0.8 : hw + PW + 0.4;
      const y0 = deck ? -DT : -0.25, y1 = deck ? -DT - H : H;
      const cw = rail ? 0.32 : 0.28, ch = rail ? 0.42 : 0.36;
      setM(MAT.METAL);
      for (const [S0, S1, np] of spanLayout(len, rec, rim0, rim1, P0)) {
        const pl = (S1 - S0) / np, pt = (j) => S0 + j * pl;
        const end0 = S0 > 0.5 || rim0, end1 = S1 < len - 0.5 || rim1;
        for (let j = 0; j < np; j++) {
          const s = pt(j), sN = pt(j + 1);
          if (!mine(s)) continue;
          const up = upAt((s + sN) / 2);
          for (const side of [-1, 1]) {
            const o = side * off;
            beam(M, at(s, o, y0), at(sN, o, y0), cw, ch, up);
            const first = j === 0 && end0, last = j === np - 1 && end1;
            if (first) beam(M, at(s, o, y0), at(sN, o, y1), cw, ch, up);
            else if (last) beam(M, at(s, o, y1), at(sN, o, y0), cw, ch, up);
            else beam(M, at(s, o, y1), at(sN, o, y1), cw, ch, up);
            if (j > 0) beam(M, at(s, o, y0), at(s, o, y1), cw * 0.7, ch * 0.7, up);
            if (!first && !last) {
              if (s + pl / 2 < (S0 + S1) / 2) beam(M, at(s, o, y1), at(sN, o, y0), cw * 0.6, ch * 0.6, up);
              else beam(M, at(s, o, y0), at(sN, o, y1), cw * 0.6, ch * 0.6, up);
            }
          }
          if (j > 0) beam(M, at(s, -off, y1), at(s, off, y1), 0.18, 0.25, up);
          if (!deck && j === 0 && end0) beam(M, at(sN, -off, y1 - 1), at(sN, off, y1 - 1), 0.22, 0.45, up);
          if (!deck && j === np - 1 && end1) beam(M, at(s, -off, y1 - 1), at(s, off, y1 - 1), 0.22, 0.45, up);
        }
      }
      return;
    }
    if (des === D.DECK_ARCH) {
      const stone = mat === 5;
      setM(MAT.CONCRETE);
      for (const [S0, S1] of spanLayout(len, rec, rim0, rim1, 6)) {
        const L2 = S1 - S0, mid = (S0 + S1) / 2;
        along(reg, ri, mid, g);
        const ground = world2.groundH(g[0], g[1], false);
        const clear = g[2] - DT - ground;
        if (clear < 3 || L2 < 6) continue;
        const f = Math.min(clamp(L2 * 0.28, 2, 30), clear - 0.5);
        const N = clamp(Math.round(L2 / 4), 6, 24);
        const yAt = (u) => -DT - 0.3 - f * (2 * (u - mid) / L2) ** 2;
        for (let k = 0; k < N; k++) {
          const u0 = S0 + L2 * k / N, u1 = S0 + L2 * (k + 1) / N;
          if (!mine(u0)) continue;
          const up = upAt((u0 + u1) / 2);
          if (stone) {
            const w2 = hw + PW;
            beam(M, at(u0, 0, yAt(u0) - 0.5), at(u1, 0, yAt(u1) - 0.5), w2, 0.5, up);
            for (const side of [-1, 1]) {
              const ym0 = (yAt(u0) - DT) / 2, ym1 = (yAt(u1) - DT) / 2;
              const hh = Math.max(0.2, (-DT - yAt((u0 + u1) / 2)) / 2);
              beam(M, at(u0, side * (w2 - 0.3), ym0), at(u1, side * (w2 - 0.3), ym1), 0.3, hh, up);
            }
          } else {
            for (const side of [-1, 1]) {
              const o = side * hw * 0.7;
              beam(M, at(u0, o, yAt(u0)), at(u1, o, yAt(u1)), 0.45, 0.55, up);
              if (k > 0 && yAt(u0) < -DT - 1) beam(M, at(u0, o, yAt(u0)), at(u0, o, -DT), 0.3, 0.3, up);
            }
          }
        }
      }
    }
  }
  function bigStructure(M, P2, world2, st, setM, PW) {
    const des = st[0], Ls = clamp(st[3] / 10, 12, 400), W = Math.max(st[6] / 10, 7), cx = st[7] / 10, cy = st[8] / 10;
    let tx = st[9] / 1e3, ty = st[10] / 1e3;
    const tl = Math.hypot(tx, ty) || 1;
    tx /= tl;
    ty /= tl;
    const nx = ty, ny = -tx;
    const z0 = world2.nearestDeck(cx, cy) < 30 ? world2._nd.z : world2.groundH(cx, cy, true);
    const zAt = (s) => {
      const x = cx + tx * s, y = cy + ty * s;
      return world2.nearestDeck(x, y) < 12 ? world2._nd.z : z0;
    };
    const at = (s, o, y, z) => {
      const r = P2(cx + tx * s + nx * o, cy + ty * s + ny * o, (z === void 0 ? zAt(s) : z) + y);
      return [r[0], r[1], r[2]];
    };
    const up = (() => {
      const a = at(0, 0, 0, z0), b = at(0, 0, 10, z0);
      return [(b[0] - a[0]) / 10, (b[1] - a[1]) / 10, (b[2] - a[2]) / 10];
    })();
    const hw = W / 2;
    setM(MAT.METAL);
    if (des === D.ARCH) {
      const f = clamp(Ls * 0.22, 8, 48), N = clamp(Math.round(Ls / 6), 10, 40), off = hw + 0.6;
      const yR = (s) => f * (1 - (2 * s / Ls) ** 2) - 3;
      const depth = clamp(Ls * 0.012, 0.8, 2.6);
      for (let k = 0; k < N; k++) {
        const s0 = -Ls / 2 + Ls * k / N, s1 = -Ls / 2 + Ls * (k + 1) / N;
        for (const side of [-1, 1]) {
          const o = side * off;
          beam(M, at(s0, o, yR(s0)), at(s1, o, yR(s1)), 0.55, depth, up);
          if (k > 0 && yR(s0) > 1.5) beam(M, at(s0, o, yR(s0)), at(s0, o, 0), 0.08, 0.08, up);
        }
        if (k % 2 === 0 && yR(s0) > 6.5) beam(M, at(s0, -off, yR(s0) + depth * 0.5), at(s0, off, yR(s0) + depth * 0.5), 0.25, 0.4, up);
      }
      return;
    }
    if (des === D.STAYED) {
      const Ht = clamp(Ls * 0.28, 25, 75), fork = Ht * 0.62, legs = hw + 1.2;
      for (const st0 of [-Ls / 2, Ls / 2]) {
        const zt = zAt(st0);
        for (const side of [-1, 1]) beam(M, at(st0, side * legs, -8, zt), at(st0, side * 1.6, fork, zt), 1.1, 1.4, up);
        beam(M, at(st0, 0, fork - 2, zt), at(st0, 0, Ht, zt), 1.4, 1.6, up);
        beam(M, at(st0, -legs * 0.8, -0.5, zt), at(st0, legs * 0.8, -0.5, zt), 0.8, 0.9, up);
        const toward = st0 < 0 ? 1 : -1, back = Math.min(Ls * 0.45, 140);
        const nC = clamp(Math.round((Ls / 2 - 12) / 9), 4, 16);
        for (let k = 1; k <= nC; k++) {
          const yk = fork + 2 + (Ht - fork - 4) * (k / nC);
          for (const dir of [toward, -toward]) {
            const reach = dir === toward ? 12 + (Ls / 2 - 14) * (k / nC) : 12 + (back - 14) * (k / nC);
            const sd = st0 + dir * reach;
            for (const side of [-1, 1]) beam(M, at(st0, 0, yk, zt), at(sd, side * (hw - 0.6), 0.6), 0.09, 0.09, up);
          }
        }
      }
      return;
    }
    if (des === D.SUSPENSION) {
      const Ht = clamp(Ls * 0.16 + 6, 10, 60), sag = Ht * 0.85, off = hw + 0.4;
      for (const st0 of [-Ls / 2, Ls / 2]) for (const side of [-1, 1]) beam(M, at(st0, side * off, -2), at(st0, side * off, Ht), 0.7, 0.7, up);
      for (const st0 of [-Ls / 2, Ls / 2]) beam(M, at(st0, -off, Ht - 1), at(st0, off, Ht - 1), 0.5, 0.6, up);
      const N = clamp(Math.round(Ls / 5), 8, 60), yC = (s) => Ht - sag * (1 - (2 * s / Ls) ** 2);
      for (let k = 0; k < N; k++) {
        const s0 = -Ls / 2 + Ls * k / N, s1 = -Ls / 2 + Ls * (k + 1) / N;
        for (const side of [-1, 1]) {
          const o = side * off;
          beam(M, at(s0, o, yC(s0)), at(s1, o, yC(s1)), 0.18, 0.18, up);
          if (k > 0) beam(M, at(s0, o, yC(s0)), at(s0, o, 0.8), 0.04, 0.04, up);
        }
      }
      return;
    }
    if (des === D.LIFT) {
      const Hl = clamp(Ls * 0.33, 25, 55), off = hw + 1;
      for (const st0 of [-Ls / 2, Ls / 2]) {
        const zt = zAt(st0);
        for (const ds of [-1.8, 1.8]) for (const side of [-1, 1]) beam(M, at(st0 + ds, side * off, -6, zt), at(st0 + ds, side * off, Hl, zt), 0.6, 0.6, up);
        for (const yb of [Hl * 0.35, Hl * 0.7]) for (const side of [-1, 1]) beam(M, at(st0 - 1.8, side * off, yb, zt), at(st0 + 1.8, side * off, yb, zt), 0.3, 0.3, up);
        setM(MAT.CONCRETE);
        beam(M, at(st0, -off - 0.8, Hl + 1.6, zt), at(st0, off + 0.8, Hl + 1.6, zt), 2.4, 1.6, up);
        beam(M, at(st0, -off + 1, Hl * 0.78, zt), at(st0, off - 1, Hl * 0.78, zt), 1.4, 1.8, up);
        setM(MAT.METAL);
      }
      const H = 6, N = clamp(Math.round(Ls / 7), 6, 30);
      for (let k = 0; k < N; k++) {
        const s0 = -Ls / 2 + Ls * k / N, s1 = -Ls / 2 + Ls * (k + 1) / N;
        for (const side of [-1, 1]) {
          const o = side * (hw + 0.3);
          beam(M, at(s0, o, H), at(s1, o, H), 0.25, 0.3, up);
          beam(M, at(s0, o, 0), at(s0, o, H), 0.2, 0.2, up);
          beam(M, at(s0, o, k % 2 ? H : 0), at(s1, o, k % 2 ? 0 : H), 0.15, 0.15, up);
        }
      }
      return;
    }
    if (des === D.BASCULE) {
      setM(MAT.CONCRETE);
      const s0 = Ls / 2 + 4, o = hw + 3.2;
      beam(M, at(s0, o, -0.5), at(s0, o, 4.2), 2.2, 2.6, up);
      setM(MAT.ROOF || MAT.CONCRETE);
      beam(M, at(s0, o, 4.2), at(s0, o, 4.8), 2.6, 3, up);
    }
  }

  // src/tunnels.js
  var SHELL = 0.6;
  var KERB = 0.22;
  var STEP = 1.5;
  function onTube(reg, lx, ly, z, ri) {
    const gw = reg.gw, cx = Math.floor((lx + RM) / RCELL), cy = Math.floor((ly + RM) / RCELL);
    if (cx < 0 || cy < 0 || cx >= gw || cy >= gw) return false;
    const c = cy * gw + cx, e = reg.gstart[c + 1], px = reg.px, py = reg.py, pz = reg.pz, items = reg.gitems, segR = reg.segR, rHw = reg.rHw, rTun = reg.rTun;
    for (let q = reg.gstart[c]; q < e; q++) {
      const pi = items[q], rj = segR[pi];
      if (rj === ri || !rTun[rj]) continue;
      const ax = px[pi], ay = py[pi], dx = px[pi + 1] - ax, dy = py[pi + 1] - ay, l2 = dx * dx + dy * dy;
      if (l2 < 1e-6) continue;
      const ux = lx - ax, uy = ly - ay, t = clamp((ux * dx + uy * dy) / l2, 0, 1), ex = ux - dx * t, ey = uy - dy * t, w = rHw[rj] + WALL_GAP - 0.05;
      if (ex * ex + ey * ey >= w * w) continue;
      if (Math.abs(pz[pi] + (pz[pi + 1] - pz[pi]) * t - z) < 1.6) return true;
    }
    return false;
  }
  function tunnelInfo(reg) {
    if (reg.tunInfo) return reg.tunInfo;
    const nR = reg.nRoads, end = new Uint8Array(nR), d = new Float32Array(reg.px.length).fill(1e9);
    const px = reg.px, py = reg.py, pz = reg.pz, cum = reg.cum, rTun = reg.rTun, rHw = reg.rHw;
    const gw = reg.gw;
    const onKind = (lx, ly, z, ri, wantTun) => {
      const cx = Math.floor((lx + RM) / RCELL), cy = Math.floor((ly + RM) / RCELL);
      if (cx < 0 || cy < 0 || cx >= gw || cy >= gw) return null;
      const c = cy * gw + cx, e = reg.gstart[c + 1];
      let best = null, bd = 1e9;
      for (let q = reg.gstart[c]; q < e; q++) {
        const pi = reg.gitems[q], rj = reg.segR[pi];
        if (rj === ri || reg.rCls[rj] >= 14 || !!rTun[rj] !== wantTun) continue;
        const ax = px[pi], ay = py[pi], dx = px[pi + 1] - ax, dy = py[pi + 1] - ay, l2 = dx * dx + dy * dy;
        if (l2 < 1e-6) continue;
        const t = clamp(((lx - ax) * dx + (ly - ay) * dy) / l2, 0, 1), ex = lx - ax - dx * t, ey = ly - ay - dy * t, dd = Math.hypot(ex, ey);
        if (dd > rHw[rj] + 0.3 || Math.abs(pz[pi] + (pz[pi + 1] - pz[pi]) * t - z) > 1.2 || dd >= bd) continue;
        bd = dd;
        best = [pi, t];
      }
      return best;
    };
    const joins = [];
    for (let ri = 0; ri < nR; ri++) {
      if (!rTun[ri]) continue;
      const a = reg.rStart[ri], b = a + reg.rCount[ri] - 1;
      for (const [q, bit] of [[a, 1], [b, 2]]) {
        if (onKind(px[q], py[q], pz[q], ri, false)) {
          end[ri] |= bit;
          d[q] = 0;
          continue;
        }
        const j = onKind(px[q], py[q], pz[q], ri, true);
        if (j) joins.push(q, j[0], j[1]);
      }
    }
    for (let it = 0; it < 12; it++) {
      let moved = false;
      for (let ri = 0; ri < nR; ri++) {
        if (!rTun[ri]) continue;
        const a = reg.rStart[ri], b = a + reg.rCount[ri] - 1;
        for (let q = a; q < b; q++) {
          const v = d[q] + cum[q + 1] - cum[q];
          if (v < d[q + 1] - 0.01) {
            d[q + 1] = v;
            moved = true;
          }
        }
        for (let q = b; q > a; q--) {
          const v = d[q] + cum[q] - cum[q - 1];
          if (v < d[q - 1] - 0.01) {
            d[q - 1] = v;
            moved = true;
          }
        }
      }
      for (let k = 0; k < joins.length; k += 3) {
        const q = joins[k], s0 = joins[k + 1], t = joins[k + 2], len = cum[s0 + 1] - cum[s0];
        const at = Math.min(d[s0] + t * len, d[s0 + 1] + (1 - t) * len);
        if (at < d[q] - 0.01) {
          d[q] = at;
          moved = true;
        }
        if (d[q] + t * len < d[s0] - 0.01) {
          d[s0] = d[q] + t * len;
          moved = true;
        }
        if (d[q] + (1 - t) * len < d[s0 + 1] - 0.01) {
          d[s0 + 1] = d[q] + (1 - t) * len;
          moved = true;
        }
      }
      if (!moved) break;
    }
    return reg.tunInfo = { end, d };
  }
  function index(reg, s) {
    if (reg.tunIdx && reg.tunIdxS === s) return reg.tunIdx;
    const m = reg.tunIdx = /* @__PURE__ */ new Map();
    reg.tunIdxS = s;
    for (let ri = 0; ri < reg.nRoads; ri++) {
      if (!reg.rTun[ri]) continue;
      const a = reg.rStart[ri], n = reg.rCount[ri];
      for (let q = a; q < a + n - 1; q++) {
        const key2 = Math.floor((reg.y0 + (reg.py[q] + reg.py[q + 1]) / 2) / s) * 65536 + Math.floor((reg.x0 + (reg.px[q] + reg.px[q + 1]) / 2) / s);
        let l = m.get(key2);
        if (!l) m.set(key2, l = []);
        l.push(q);
      }
    }
    return m;
  }
  function addTunnels(M, world2, reg, ix, iy, s, P2) {
    if (!reg || !reg.nTun) return 0;
    const list = index(reg, s).get(iy * 65536 + ix);
    if (!list) return 0;
    const info = tunnelInfo(reg), D2 = info.d;
    const px = reg.px, py = reg.py, pz = reg.pz, segR = reg.segR;
    const cross = (ri, q, out) => {
      const a = reg.rStart[ri], b = a + reg.rCount[ri] - 1;
      let tx = 0, ty = 0;
      if (q > a) {
        const dx = px[q] - px[q - 1], dy = py[q] - py[q - 1], l2 = Math.hypot(dx, dy) || 1;
        tx += dx / l2;
        ty += dy / l2;
      }
      if (q < b) {
        const dx = px[q + 1] - px[q], dy = py[q + 1] - py[q], l2 = Math.hypot(dx, dy) || 1;
        tx += dx / l2;
        ty += dy / l2;
      }
      const l = Math.hypot(tx, ty) || 1;
      tx /= l;
      ty /= l;
      let k = 1;
      if (q > a && q < b) {
        const dx = px[q + 1] - px[q], dy = py[q + 1] - py[q], l2 = Math.hypot(dx, dy) || 1;
        k = 1 / Math.max(0.75, (tx * dx + ty * dy) / l2);
      }
      out[0] = ty * k;
      out[1] = -tx * k;
    };
    const n0 = [0, 0], n1 = [0, 0];
    let count = 0;
    for (const q of list) {
      const ri = segR[q], hw = reg.rHw[ri], Wl = hw + WALL_GAP, Wo = Wl + SHELL, cls = reg.rCls[ri];
      const ax = reg.x0 + px[q], ay = reg.y0 + py[q], bx = reg.x0 + px[q + 1], by = reg.y0 + py[q + 1], az = pz[q], bz = pz[q + 1];
      const len = Math.hypot(bx - ax, by - ay);
      if (len < 0.05) continue;
      const tx = (bx - ax) / len, ty = (by - ay) / len;
      cross(ri, q, n0);
      cross(ri, q + 1, n1);
      const dA = Math.min(D2[q], 999), dB = Math.min(D2[q + 1], 999);
      const mid = P2((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
      M.C[0] = mid[0];
      M.C[1] = mid[1];
      M.C[2] = mid[2];
      const seed = ri * 37 + 11 & 255;
      const setM = (m) => {
        M.M[0] = m;
        M.M[1] = 0;
        M.M[2] = cls;
        M.M[3] = seed;
      };
      const strip = (f0, f1, o0, y0, o1, y1, nl, nu, tv0, tv1) => {
        const cxA = n0[0] + (n1[0] - n0[0]) * f0, cyA = n0[1] + (n1[1] - n0[1]) * f0, cxB = n0[0] + (n1[0] - n0[0]) * f1, cyB = n0[1] + (n1[1] - n0[1]) * f1;
        const xA = ax + (bx - ax) * f0, yA = ay + (by - ay) * f0, zA = az + (bz - az) * f0, xB = ax + (bx - ax) * f1, yB = ay + (by - ay) * f1, zB = az + (bz - az) * f1;
        const uA = dA + (dB - dA) * f0, uB = dA + (dB - dA) * f1;
        let t = P2(xA + cxA * o0, yA + cyA * o0, zA + y0);
        const i0 = M.v(t[0], t[1], t[2], cxA * nl, nu, -cyA * nl, uA, tv0);
        t = P2(xA + cxA * o1, yA + cyA * o1, zA + y1);
        const i1 = M.v(t[0], t[1], t[2], cxA * nl, nu, -cyA * nl, uA, tv1);
        t = P2(xB + cxB * o1, yB + cyB * o1, zB + y1);
        const i2 = M.v(t[0], t[1], t[2], cxB * nl, nu, -cyB * nl, uB, tv1);
        t = P2(xB + cxB * o0, yB + cyB * o0, zB + y0);
        const i3 = M.v(t[0], t[1], t[2], cxB * nl, nu, -cyB * nl, uB, tv0);
        M.quad(i0, i1, i2, i3);
      };
      const n = Math.max(1, Math.ceil(len / STEP));
      const open = (sg) => {
        const out = [];
        let start = -1;
        for (let k = 0; k < n; k++) {
          const f = (k + 0.5) / n, cx = n0[0] + (n1[0] - n0[0]) * f, cy = n0[1] + (n1[1] - n0[1]) * f, o = sg * (Wl + 0.3);
          const covered = onTube(reg, px[q] + (px[q + 1] - px[q]) * f + cx * o, py[q] + (py[q + 1] - py[q]) * f + cy * o, az + (bz - az) * f, ri);
          if (!covered && start < 0) start = k;
          if ((covered || k === n - 1) && start >= 0) {
            out.push(start / n, covered ? k / n : 1);
            start = -1;
          }
        }
        return out;
      };
      const runL = open(-1), runR = open(1);
      setM(MAT.TUNROAD);
      M.W[0] = hw;
      M.W[1] = roadKind(reg, ri);
      M.W[2] = (runL.length ? 0 : 1) + (runR.length ? 0 : 2);
      M.W[3] = -1;
      strip(0, 1, -hw, 0, hw, 0, 0, 1, -hw, hw);
      setM(MAT.TUNWALL);
      M.W[1] = Wl;
      M.W[2] = 0;
      M.W[3] = -1;
      for (const [sg, runs] of [[-1, runL], [1, runR]]) {
        for (let i = 0; i < runs.length; i += 2) {
          const f0 = runs[i], f1 = runs[i + 1];
          M.W[0] = 0;
          strip(f0, f1, sg * hw, 0, sg * hw, KERB, -sg, 0, 0, KERB);
          strip(f0, f1, sg * hw, KERB, sg * Wl, KERB, 0, 1, hw, Wl);
          M.W[0] = 1;
          strip(f0, f1, sg * Wl, KERB, sg * Wl, TUN_H, -sg, 0, KERB, TUN_H);
        }
      }
      M.W[0] = 2;
      strip(0, 1, -Wl, TUN_H, Wl, TUN_H, 0, -1, -Wl, Wl);
      {
        setM(MAT.CONCRETE);
        M.W[0] = 0;
        M.W[1] = 0;
        M.W[2] = 0;
        M.W[3] = -1;
        for (const [sg, runs] of [[-1, runL], [1, runR]]) {
          for (let i = 0; i < runs.length; i += 2) strip(runs[i], runs[i + 1], sg * Wo, -0.8, sg * Wo, TUN_H + SHELL, sg, 0, -0.8, TUN_H + SHELL);
        }
        strip(0, 1, -Wo, TUN_H + SHELL, Wo, TUN_H + SHELL, 0, 1, -Wo, Wo);
      }
      const en = info.end[ri], a0 = reg.rStart[ri], b0 = a0 + reg.rCount[ri] - 1;
      for (const [atEnd, X, Y, Z, nn, dir] of [[q === a0 && en & 1, ax, ay, az, n0, -1], [q + 1 === b0 && en & 2, bx, by, bz, n1, 1]]) {
        if (!atEnd) continue;
        setM(MAT.CONCRETE);
        const base = P2(X, Y, 0);
        M.ox = base[0];
        M.oy = base[1];
        M.oz = base[2];
        M.ux = tx * dir;
        M.uz = -ty * dir;
        M.vx = nn[0];
        M.vz = -nn[1];
        const u0 = -0.9, u1 = 0.25, top = Z + TUN_H + SHELL + 1.2, wide = Wo + 1.6;
        M.box(u0, u1, Z - 0.8, top, Wl, wide, 63);
        M.box(u0, u1, Z - 0.8, top, -wide, -Wl, 63);
        M.box(u0, u1, Z + TUN_H, top, -Wl, Wl, 1 | 2 | 4 | 8);
        M.ox = 0;
        M.oy = 0;
        M.oz = 0;
        M.ux = 1;
        M.uz = 0;
        M.vx = 0;
        M.vz = 1;
      }
      count++;
    }
    return count;
  }

  // src/decks.js
  var PIER_GAP = 30;
  var EDGE_STEP = 1.5;
  var p3 = new Float64Array(3);
  var runsL = [];
  var runsR = [];
  function openRuns(reg, ri, ax, ay, az, bx, by, bz, n0, n1, off, out) {
    const len = Math.hypot(bx - ax, by - ay), n = Math.max(1, Math.ceil(len / EDGE_STEP));
    const cov = (f) => onOtherWay(reg, ax + (bx - ax) * f + (n0[0] + (n1[0] - n0[0]) * f) * off, ay + (by - ay) * f + (n0[1] + (n1[1] - n0[1]) * f) * off, az + (bz - az) * f, ri, false);
    out.length = 0;
    let prev = cov(0), start = 0, open = 0;
    for (let k = 1; k <= n; k++) {
      const f = k / n, c = cov(f);
      if (c === prev) continue;
      let lo = (k - 1) / n, hi = f;
      for (let it = 0; it < 6; it++) {
        const mid = (lo + hi) / 2;
        if (cov(mid) === prev) lo = mid;
        else hi = mid;
      }
      const x = (lo + hi) / 2;
      if (prev) start = x;
      else {
        out.push(start, x);
        open += x - start;
      }
      prev = c;
    }
    if (!prev) {
      out.push(start, 1);
      open += 1 - start;
    }
    return 1 - open;
  }
  function index2(reg, s) {
    if (reg.deckIdx && reg.deckIdxS === s) return reg.deckIdx;
    const m = reg.deckIdx = /* @__PURE__ */ new Map();
    reg.deckIdxS = s;
    for (let ri = 0; ri < reg.nRoads; ri++) {
      if (!reg.rEnd[ri]) continue;
      const a = reg.rStart[ri], n = reg.rCount[ri];
      for (let q = a; q < a + n - 1; q++) {
        const key2 = Math.floor((reg.y0 + (reg.py[q] + reg.py[q + 1]) / 2) / s) * 65536 + Math.floor((reg.x0 + (reg.px[q] + reg.px[q + 1]) / 2) / s);
        let l = m.get(key2);
        if (!l) m.set(key2, l = []);
        l.push(q);
      }
    }
    return m;
  }
  function buildDeckTile(world2, reg, ix, iy, s, cx, cy, cz, th, nbi) {
    const walls = !!reg && wallsIn(world2, ix, iy, s);
    if (!reg || !(reg.nDeck || reg.nTun || walls)) return null;
    const list = reg.nDeck && index2(reg, s).get(iy * 65536 + ix) || [];
    if (!list.length && !reg.nTun && !walls) return null;
    const M = new Mesh();
    const c = Math.cos(th), sn = Math.sin(th);
    const px = reg.px, py = reg.py, pz = reg.pz, cum = reg.cum, segR = reg.segR;
    const T = [0, 0, 0];
    const P2 = (mx, my, h) => {
      cyl(mx, my, h, p3);
      const dx = p3[0] - cx, dy = p3[1] - cy, dz = p3[2] - cz;
      T[0] = dx;
      T[1] = c * dy + sn * dz;
      T[2] = -sn * dy + c * dz;
      return T;
    };
    const cross = (ri, q, out) => {
      const a = reg.rStart[ri], b = a + reg.rCount[ri] - 1;
      let tx = 0, ty = 0;
      if (q > a) {
        const dx = px[q] - px[q - 1], dy = py[q] - py[q - 1], l2 = Math.hypot(dx, dy) || 1;
        tx += dx / l2;
        ty += dy / l2;
      }
      if (q < b) {
        const dx = px[q + 1] - px[q], dy = py[q + 1] - py[q], l2 = Math.hypot(dx, dy) || 1;
        tx += dx / l2;
        ty += dy / l2;
      }
      const l = Math.hypot(tx, ty) || 1;
      tx /= l;
      ty /= l;
      let k = 1;
      if (q > a && q < b) {
        const dx = px[q + 1] - px[q], dy = py[q + 1] - py[q], l2 = Math.hypot(dx, dy) || 1;
        k = 1 / Math.max(0.75, (tx * dx + ty * dy) / l2);
      }
      out[0] = ty * k;
      out[1] = -tx * k;
    };
    const n0 = [0, 0], n1 = [0, 0];
    let count = 0;
    const spanSts = nbi ? nbi.structures.get(reg.ry * 28 + reg.rx) : null;
    const underMainSpan = (X, Y) => {
      for (const st of spanSts) {
        const Ls = clamp(st[3] / 10, 12, 400), W = Math.max(st[6] / 10, 7), dx = X - st[7] / 10, dy = Y - st[8] / 10;
        let tx = st[9] / 1e3, ty = st[10] / 1e3;
        const tl = Math.hypot(tx, ty) || 1;
        tx /= tl;
        ty /= tl;
        if (Math.abs(dx * tx + dy * ty) < Ls / 2 - 4 && Math.abs(dx * ty - dy * tx) < W / 2 + 20) return true;
      }
      return false;
    };
    for (const q of list) {
      const ri = segR[q], cls = reg.rCls[ri], rail = cls >= 14, hw = reg.rHw[ri];
      const ax = reg.x0 + px[q], ay = reg.y0 + py[q], bx = reg.x0 + px[q + 1], by = reg.y0 + py[q + 1], az = pz[q], bz = pz[q + 1];
      const len = Math.hypot(bx - ax, by - ay);
      if (len < 0.05) continue;
      const tx = (bx - ax) / len, ty = (by - ay) / len;
      cross(ri, q, n0);
      cross(ri, q + 1, n1);
      const PW = rail ? 0.34 : 0.42, PH = rail ? 0.55 : 0.86, DT = rail ? 1.5 : DECK_T - 0.05;
      const s0 = cum[q], s1 = cum[q + 1];
      const mid = P2((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
      M.C[0] = mid[0];
      M.C[1] = mid[1];
      M.C[2] = mid[2];
      const seed = ri * 37 + 11 & 255;
      const setM = (m) => {
        M.M[0] = m;
        M.M[1] = 0;
        M.M[2] = cls;
        M.M[3] = seed;
      };
      const lx = px[q], ly = py[q], lbx = px[q + 1], lby = py[q + 1];
      const strip = (f0, f1, o0, y0, o1, y1, nl, nu, tv0, tv1) => {
        const cxA = n0[0] + (n1[0] - n0[0]) * f0, cyA = n0[1] + (n1[1] - n0[1]) * f0, cxB = n0[0] + (n1[0] - n0[0]) * f1, cyB = n0[1] + (n1[1] - n0[1]) * f1;
        const xA = ax + (bx - ax) * f0, yA = ay + (by - ay) * f0, zA = az + (bz - az) * f0, xB = ax + (bx - ax) * f1, yB = ay + (by - ay) * f1, zB = az + (bz - az) * f1;
        const sA = s0 + (s1 - s0) * f0, sB = s0 + (s1 - s0) * f1;
        let t = P2(xA + cxA * o0, yA + cyA * o0, zA + y0);
        const i0 = M.v(t[0], t[1], t[2], cxA * nl, nu, -cyA * nl, sA, tv0);
        t = P2(xA + cxA * o1, yA + cyA * o1, zA + y1);
        const i1 = M.v(t[0], t[1], t[2], cxA * nl, nu, -cyA * nl, sA, tv1);
        t = P2(xB + cxB * o1, yB + cyB * o1, zB + y1);
        const i2 = M.v(t[0], t[1], t[2], cxB * nl, nu, -cyB * nl, sB, tv1);
        t = P2(xB + cxB * o0, yB + cyB * o0, zB + y0);
        const i3 = M.v(t[0], t[1], t[2], cxB * nl, nu, -cyB * nl, sB, tv0);
        M.quad(i0, i1, i2, i3);
      };
      const stub = (f, sg, dir) => {
        const cx2 = n0[0] + (n1[0] - n0[0]) * f, cy2 = n0[1] + (n1[1] - n0[1]) * f, X = ax + (bx - ax) * f, Y = ay + (by - ay) * f, Z = az + (bz - az) * f;
        const oa = sg * hw, ob = sg * (hw + PW);
        let t = P2(X + cx2 * oa, Y + cy2 * oa, Z);
        const i0 = M.v(t[0], t[1], t[2], tx * dir, 0, -ty * dir, 0, 0);
        t = P2(X + cx2 * ob, Y + cy2 * ob, Z);
        const i1 = M.v(t[0], t[1], t[2], tx * dir, 0, -ty * dir, PW, 0);
        t = P2(X + cx2 * ob, Y + cy2 * ob, Z + PH);
        const i2 = M.v(t[0], t[1], t[2], tx * dir, 0, -ty * dir, PW, PH);
        t = P2(X + cx2 * oa, Y + cy2 * oa, Z + PH);
        const i3 = M.v(t[0], t[1], t[2], tx * dir, 0, -ty * dir, 0, PH);
        M.quad(i0, i1, i2, i3);
      };
      const covL = openRuns(reg, ri, lx, ly, az, lbx, lby, bz, n0, n1, -(hw + 0.05), runsL);
      const covR = openRuns(reg, ri, lx, ly, az, lbx, lby, bz, n0, n1, hw + 0.05, runsR);
      setM(rail ? MAT.TRACK : MAT.ROADWAY);
      M.W[0] = hw;
      M.W[1] = rail ? cls === 14 ? 1 : 2 : roadKind(reg, ri);
      M.W[2] = (covL > 0.3 ? 1 : 0) + (covR > 0.3 ? 2 : 0);
      M.W[3] = -1;
      const lift = rail ? 0 : (13 - Math.min(cls, 13)) * 3e-3 + (reg.rName[ri] & 7) * 4e-4;
      strip(0, 1, -hw, lift, hw, lift, 0, 1, -hw, hw);
      setM(rail ? MAT.METAL : MAT.CONCRETE);
      M.W[0] = 0;
      M.W[1] = 0;
      M.W[2] = 0;
      M.W[3] = -1;
      for (let i = 0; i < runsL.length; i += 2) {
        const f0 = runsL[i], f1 = runsL[i + 1];
        if ((f1 - f0) * len < 0.1) continue;
        strip(f0, f1, -hw - PW, PH, -hw, PH, 0, 1, 0, PW);
        strip(f0, f1, -hw, PH, -hw, 0, 1, 0, PH, 0);
        strip(f0, f1, -hw - PW, -DT, -hw - PW, PH, -1, 0, 0, PH + DT);
        if (f0 > 1e-3) stub(f0, -1, -1);
        if (f1 < 1 - 1e-3) stub(f1, -1, 1);
      }
      for (let i = 0; i < runsR.length; i += 2) {
        const f0 = runsR[i], f1 = runsR[i + 1];
        if ((f1 - f0) * len < 0.1) continue;
        strip(f0, f1, hw, 0, hw, PH, -1, 0, 0, PH);
        strip(f0, f1, hw, PH, hw + PW, PH, 0, 1, 0, PW);
        strip(f0, f1, hw + PW, PH, hw + PW, -DT, 1, 0, PH + DT, 0);
        if (f0 > 1e-3) stub(f0, 1, -1);
        if (f1 < 1 - 1e-3) stub(f1, 1, 1);
      }
      strip(0, 1, hw + PW, -DT, -hw - PW, -DT, 0, -1, 0, 2 * (hw + PW));
      const en = reg.rEnd[ri], a0 = reg.rStart[ri], b0 = a0 + reg.rCount[ri] - 1;
      const cap = (X, Y, Z, nn, dir) => {
        const w2 = hw + PW;
        let t = P2(X - nn[0] * w2, Y - nn[1] * w2, Z - DT);
        const i0 = M.v(t[0], t[1], t[2], tx * dir, 0, -ty * dir, 0, 0);
        t = P2(X + nn[0] * w2, Y + nn[1] * w2, Z - DT);
        const i1 = M.v(t[0], t[1], t[2], tx * dir, 0, -ty * dir, 2 * w2, 0);
        t = P2(X + nn[0] * w2, Y + nn[1] * w2, Z + PH);
        const i2 = M.v(t[0], t[1], t[2], tx * dir, 0, -ty * dir, 2 * w2, DT + PH);
        t = P2(X - nn[0] * w2, Y - nn[1] * w2, Z + PH);
        const i3 = M.v(t[0], t[1], t[2], tx * dir, 0, -ty * dir, 0, DT + PH);
        t = P2(X - nn[0] * w2, Y - nn[1] * w2, Z);
        const j0 = M.v(t[0], t[1], t[2], tx * dir, 0, -ty * dir, 0, DT);
        t = P2(X + nn[0] * w2, Y + nn[1] * w2, Z);
        const j1 = M.v(t[0], t[1], t[2], tx * dir, 0, -ty * dir, 2 * w2, DT);
        M.quad(i0, i1, j1, j0);
        t = P2(X - nn[0] * hw, Y - nn[1] * hw, Z);
        const k0 = M.v(t[0], t[1], t[2], tx * dir, 0, -ty * dir, PW, DT);
        t = P2(X - nn[0] * hw, Y - nn[1] * hw, Z + PH);
        const k1 = M.v(t[0], t[1], t[2], tx * dir, 0, -ty * dir, PW, DT + PH);
        M.quad(j0, k0, k1, i3);
        t = P2(X + nn[0] * hw, Y + nn[1] * hw, Z);
        const k2 = M.v(t[0], t[1], t[2], tx * dir, 0, -ty * dir, 2 * w2 - PW, DT);
        t = P2(X + nn[0] * hw, Y + nn[1] * hw, Z + PH);
        const k3 = M.v(t[0], t[1], t[2], tx * dir, 0, -ty * dir, 2 * w2 - PW, DT + PH);
        M.quad(k2, j1, i2, k3);
      };
      if (q === a0 && en & 1) cap(ax, ay, az, n0, -1);
      if (q + 1 === b0 && en & 2) cap(bx, by, bz, n1, 1);
      setM(MAT.CONCRETE);
      for (let k = Math.ceil(s0 / PIER_GAP); k * PIER_GAP < s1; k++) {
        const f = (k * PIER_GAP - s0) / (s1 - s0), X = ax + (bx - ax) * f, Y = ay + (by - ay) * f, Z = az + (bz - az) * f;
        if (spanSts && underMainSpan(X, Y)) continue;
        const half = clamp(hw * 0.62, 0.6, 5), nx = ty, ny = -tx;
        let low = 1e9, ok = true;
        for (const o of [-half, 0, half]) {
          const gx = X + nx * o, gy = Y + ny * o;
          const g = world2.groundH(gx, gy, true);
          if (world2.g.road >= 0 && world2.g.edge < 2) {
            ok = false;
            break;
          }
          if (world2.nearestDeck(gx, gy, Z - 2.5) < 0.5 && world2._nd.road !== ri) {
            ok = false;
            break;
          }
          if (g < low) low = g;
        }
        const clear = Z - DT - low;
        if (!ok || clear < 3) continue;
        const every = clear < 12 ? 1 : clear < 25 ? 2 : clear < 40 ? 3 : 4;
        if (k % every) continue;
        const base = P2(X, Y, 0);
        const ox = base[0], oy = base[1], oz = base[2];
        M.ox = ox;
        M.oy = oy;
        M.oz = oz;
        M.ux = tx;
        M.uz = -ty;
        M.vx = nx;
        M.vz = -ny;
        const top = Z - DT, th2 = 0.55 + Math.max(0, clear - 8) * 0.04, cap2 = 0.9 + Math.max(0, clear - 8) * 0.03;
        const wide = clear < 12 ? half : Math.max(half, hw * 0.8);
        M.box(-th2, th2, low - 1.5, top - cap2, -wide, wide, 1 | 2 | 16 | 32);
        M.box(-th2 - 0.25, th2 + 0.25, top - cap2, top, -(hw + PW * 0.5), hw + PW * 0.5, 1 | 2 | 8 | 16 | 32);
        M.ox = 0;
        M.oy = 0;
        M.oz = 0;
        M.ux = 1;
        M.uz = 0;
        M.vx = 0;
        M.vz = 1;
      }
      count++;
    }
    if (nbi) {
      const key2 = reg.ry * 28 + reg.rx;
      const recs = nbi.ways.get(key2), sts = nbi.structures.get(key2);
      const setW = (cls, seed) => (m) => {
        M.M[0] = m;
        M.M[1] = 0;
        M.M[2] = cls;
        M.M[3] = seed;
      };
      M.W[0] = 0;
      M.W[1] = 0;
      M.W[2] = 0;
      M.W[3] = -1;
      if (recs) {
        const segs = /* @__PURE__ */ new Map();
        for (const q of list) {
          const ri = segR[q];
          if (!recs.has(ri)) continue;
          const a = cum[reg.rStart[ri]];
          let l = segs.get(ri);
          if (!l) segs.set(ri, l = []);
          l.push([cum[q] - a, cum[q + 1] - a]);
        }
        for (const [ri, l] of segs) {
          const cls = reg.rCls[ri], rail = cls >= 14;
          const a = reg.rStart[ri], mid = P2(reg.x0 + px[a], reg.y0 + py[a], pz[a]);
          M.C[0] = mid[0];
          M.C[1] = mid[1];
          M.C[2] = mid[2];
          wayStructure(M, P2, world2, reg, ri, recs.get(ri), l, setW(cls, ri * 37 + 11 & 255), cls, rail ? 0.34 : 0.42, rail ? 1.5 : DECK_T - 0.05);
        }
      }
      if (sts) for (const st of sts) {
        const sx = st[7] / 10, sy = st[8] / 10;
        if (Math.floor(sx / s) !== ix || Math.floor(sy / s) !== iy) continue;
        const mid = P2(sx, sy, world2.groundH(sx, sy, true));
        M.C[0] = mid[0];
        M.C[1] = mid[1];
        M.C[2] = mid[2];
        bigStructure(M, P2, world2, st, setW(0, 7), 0.42);
      }
    }
    if (reg.nTun) count += addTunnels(M, world2, reg, ix, iy, s, P2);
    if (walls) count += addWalls(M, world2, ix, iy, s, P2);
    if (!M.n) return null;
    return { n: M.n, count, pos: M.pos.slice(0, M.n * 3), nor: M.nor.slice(0, M.n * 4), uv: M.uv.slice(0, M.n * 2), w: M.w.slice(0, M.n * 4), m: M.m.slice(0, M.n * 4), c: M.c.slice(0, M.n * 3), k: M.k.slice(0, M.n * 4), idx: M.idx.slice(0, M.ni) };
  }
  var WALL_FACE = -0.12;
  var WALL_BACK = 0.35;
  var WALL_CAP = 0.35;
  var WALL_SINK = 0.5;
  function wallsIn(world2, ix, iy, s) {
    const W = world2.walls;
    if (!W) return false;
    for (let cy = Math.floor(iy * s / WCELL); cy <= Math.floor((iy + 1) * s / WCELL); cy++)
      for (let cx = Math.floor(ix * s / WCELL); cx <= Math.floor((ix + 1) * s / WCELL); cx++) if (W.cells.has(cy * 65536 + cx)) return true;
    return false;
  }
  function wallNormal(W, i, a, c, sg, out) {
    let tx = 0, ty = 0;
    if (i > a) {
      const dx = W.X[i] - W.X[i - 1], dy = W.Y[i] - W.Y[i - 1], l2 = Math.hypot(dx, dy) || 1;
      tx += dx / l2;
      ty += dy / l2;
    }
    if (i < a + c - 1) {
      const dx = W.X[i + 1] - W.X[i], dy = W.Y[i + 1] - W.Y[i], l2 = Math.hypot(dx, dy) || 1;
      tx += dx / l2;
      ty += dy / l2;
    }
    const l = Math.hypot(tx, ty) || 1;
    tx /= l;
    ty /= l;
    let k = 1;
    if (i > a && i < a + c - 1) {
      const dx = W.X[i + 1] - W.X[i], dy = W.Y[i + 1] - W.Y[i], l2 = Math.hypot(dx, dy) || 1;
      k = 1 / Math.max(0.6, (tx * dx + ty * dy) / l2);
    }
    out[0] = -ty * sg * k;
    out[1] = tx * sg * k;
  }
  var wnA = [0, 0];
  var wnB = [0, 0];
  function addWalls(M, world2, ix, iy, s, P2) {
    const W = world2.walls, seen = /* @__PURE__ */ new Set();
    let count = 0;
    for (let cy = Math.floor(iy * s / WCELL); cy <= Math.floor((iy + 1) * s / WCELL); cy++)
      for (let cx = Math.floor(ix * s / WCELL); cx <= Math.floor((ix + 1) * s / WCELL); cx++) {
        const l = W.cells.get(cy * 65536 + cx);
        if (!l) continue;
        for (const i of l) {
          if (seen.has(i)) continue;
          seen.add(i);
          const xm = (W.X[i] + W.X[i + 1]) / 2, ym = (W.Y[i] + W.Y[i + 1]) / 2;
          if (Math.floor(xm / s) !== ix || Math.floor(ym / s) !== iy) continue;
          if (world2.nearestRoad(W.X[i], W.Y[i]) < 0.3 || world2.nearestRoad(xm, ym) < 0.3 || world2.nearestRoad(W.X[i + 1], W.Y[i + 1]) < 0.3) continue;
          if (wallSegment(M, W, i, P2)) count++;
        }
      }
    return count;
  }
  function wallSegment(M, W, i, P2) {
    const wi = W.Wi[i], a = W.ws[wi * 5], c = W.ws[wi * 5 + 1], sw = W.ws[wi * 5 + 2], mat = W.ws[wi * 5 + 3], jn = W.ws[wi * 5 + 4];
    const xA = W.X[i], yA = W.Y[i], xB = W.X[i + 1], yB = W.Y[i + 1], len = Math.hypot(xB - xA, yB - yA);
    if (len < 0.05) return false;
    const ux = (xB - xA) / len, uy = (yB - yA) / len;
    wallNormal(W, i, a, c, sw || 1, wnA);
    wallNormal(W, i + 1, a, c, sw || 1, wnB);
    let s0 = 0;
    for (let k = a; k < i; k++) s0 += Math.hypot(W.X[k + 1] - W.X[k], W.Y[k + 1] - W.Y[k]);
    const s1 = s0 + len;
    const fA = W.F[i], tA = W.T[i], fB = W.F[i + 1], tB = W.T[i + 1];
    let e0, e1, botA, botB, capA, capB, backA, backB;
    if (sw) {
      e0 = WALL_FACE;
      e1 = WALL_BACK;
      botA = fA - WALL_SINK;
      botB = fB - WALL_SINK;
      capA = tA + WALL_CAP;
      capB = tB + WALL_CAP;
      backA = tA - WALL_SINK;
      backB = tB - WALL_SINK;
    } else {
      e0 = -0.2;
      e1 = 0.2;
      botA = fA - 0.3;
      botB = fB - 0.3;
      capA = tA;
      capB = tB;
      backA = botA;
      backB = botB;
    }
    M.M[0] = mat === 2 ? MAT.BRICK : MAT.CONCRETE;
    M.M[1] = 0;
    M.M[2] = 0;
    M.M[3] = wi * 37 + 11 & 255;
    M.W[0] = 0;
    M.W[1] = 0;
    M.W[2] = 0;
    M.W[3] = -1;
    let t = P2(xA + wnA[0] * e0, yA + wnA[1] * e0, (capA + botA) / 2);
    M.C[0] = t[0];
    M.C[1] = t[1];
    M.C[2] = t[2];
    const nA = Math.hypot(wnA[0], wnA[1]) || 1, nB = Math.hypot(wnB[0], wnB[1]) || 1;
    const v = (x, y, e, h, wn, nx, ny, nz, tu, tv) => {
      const q = P2(x + wn[0] * e, y + wn[1] * e, h);
      return M.v(q[0], q[1], q[2], nx, nz, -ny, tu, tv);
    };
    {
      const fx = -(wnA[0] / nA + wnB[0] / nB) / 2, fy = -(wnA[1] / nA + wnB[1] / nB) / 2, fl = Math.hypot(fx, fy) || 1;
      const i0 = v(xA, yA, e0, botA, wnA, fx / fl, fy / fl, 0, s0, botA), i1 = v(xB, yB, e0, botB, wnB, fx / fl, fy / fl, 0, s1, botB);
      const i2 = v(xB, yB, e0, capB, wnB, fx / fl, fy / fl, 0, s1, capB), i3 = v(xA, yA, e0, capA, wnA, fx / fl, fy / fl, 0, s0, capA);
      M.quad(i0, i1, i2, i3);
    }
    {
      const i0 = v(xA, yA, e0, capA, wnA, 0, 0, 1, s0, 0), i1 = v(xB, yB, e0, capB, wnB, 0, 0, 1, s1, 0);
      const i2 = v(xB, yB, e1, capB, wnB, 0, 0, 1, s1, e1 - e0), i3 = v(xA, yA, e1, capA, wnA, 0, 0, 1, s0, e1 - e0);
      M.quad(i0, i1, i2, i3);
    }
    {
      const bx = (wnA[0] / nA + wnB[0] / nB) / 2, by = (wnA[1] / nA + wnB[1] / nB) / 2, bl = Math.hypot(bx, by) || 1;
      const i0 = v(xA, yA, e1, capA, wnA, bx / bl, by / bl, 0, s0, capA), i1 = v(xB, yB, e1, capB, wnB, bx / bl, by / bl, 0, s1, capB);
      const i2 = v(xB, yB, e1, backB, wnB, bx / bl, by / bl, 0, s1, backB), i3 = v(xA, yA, e1, backA, wnA, bx / bl, by / bl, 0, s0, backA);
      M.quad(i0, i1, i2, i3);
    }
    const endCap = (x, y, wn, bot, cap, back, dir) => {
      const i0 = v(x, y, e0, bot, wn, ux * dir, uy * dir, 0, 0, bot), i1 = v(x, y, e1, back, wn, ux * dir, uy * dir, 0, e1 - e0, back);
      const i2 = v(x, y, e1, cap, wn, ux * dir, uy * dir, 0, e1 - e0, cap), i3 = v(x, y, e0, cap, wn, ux * dir, uy * dir, 0, 0, cap);
      M.quad(i0, i1, i2, i3);
    };
    if (i === a && !(jn & 1)) endCap(xA, yA, wnA, botA, capA, backA, -1);
    if (i + 1 === a + c - 1 && !(jn & 2)) endCap(xB, yB, wnB, botB, capB, backB, 1);
    return true;
  }

  // src/worker.js
  var TUN_SHELL = 0.6;
  var TREE_H = [12.8, 14.4];
  var world = null;
  var towers = [];
  var realBuildings = false;
  var measured = /* @__PURE__ */ new Set();
  var treeFiles = /* @__PURE__ */ new Set();
  var groundFiles = /* @__PURE__ */ new Set();
  var lcPacks = /* @__PURE__ */ new Set();
  var LCP = 8192;
  var LCQ = 2048;
  var packCache = /* @__PURE__ */ new Map();
  var packPending = /* @__PURE__ */ new Map();
  var quadCache = [/* @__PURE__ */ new Map(), /* @__PURE__ */ new Map()];
  var quadPending = /* @__PURE__ */ new Map();
  var PACK_KEEP = 6;
  var QUAD_KEEP = [8, 5];
  var tmp = new Float64Array(3);
  var DASH = 12.192;
  var pending = /* @__PURE__ */ new Map();
  var regionFails = /* @__PURE__ */ new Map();
  var jobDegraded = false;
  var postMessage = (m, t) => {
    if (jobDegraded && m && (m.type === "chunk" || m.type === "scatter")) m.degraded = true;
    self.postMessage(m, t || []);
  };
  var NBI = null;
  var nbiReady = null;
  var wallsReady = null;
  var liftedReady = null;
  function init(m) {
    const meta = m.meta;
    const parts = { sdf: new Uint8Array(m.sdf), sdfW: m.sdfW, sdfH: m.sdfH, cover: new Uint8Array(m.cover), aux: new Uint8Array(m.aux) };
    if (m.cover2) parts.cover2 = new Uint8Array(m.cover2);
    Object.assign(parts, { base: new Uint16Array(m.base), bw: m.bw, bh: m.bh, bScale: m.bScale, level: new Uint16Array(m.level), lw: m.lw, lh: m.lh });
    Object.assign(parts, { webH: new Float32Array(m.webH), webW: new Uint8Array(m.webW), webWater: new Uint8Array(m.webWater), webFoot: new Uint8Array(m.webFoot) });
    if (m.zone) Object.assign(parts, { zone: new Uint8Array(m.zone), zoneW: m.zoneW, zoneH: m.zoneH, zoneRange: m.zoneRange });
    setVersions(meta.versions);
    world = new World(meta, parts);
    realBuildings = !!(meta.tiles && meta.tiles.buildings);
    measured = new Set(meta.tiles && meta.tiles.measured ? meta.tiles.measured : []);
    treeFiles = new Set(meta.tiles && meta.tiles.trees ? meta.tiles.trees : []);
    groundFiles = new Set(meta.tiles && meta.tiles.ground ? meta.tiles.ground : []);
    setDecks(meta.tiles && meta.tiles.decks);
    lcPacks = new Set(meta.tiles && meta.tiles.lcp ? meta.tiles.lcp : []);
    LCP = meta.lcPack || 8192;
    towers = realBuildings ? [] : meta.landmarks.filter((l) => l.k === "tower");
    const wf = meta.files && meta.files.walls;
    wallsReady = wf ? fetch(vurl("data/" + wf.file)).then((r) => r.ok ? r.json() : null).then((j) => {
      if (j) world.setWalls(j);
    }).catch(() => {
    }) : null;
    const lf = meta.files && meta.files.lifted;
    liftedReady = lf ? fetch(vurl("data/" + lf.file)).then((r) => r.ok ? r.json() : null).then((j) => {
      if (j) world.setLifted(j);
    }).catch(() => {
    }) : null;
    const empty = () => ({ ways: /* @__PURE__ */ new Map(), structures: /* @__PURE__ */ new Map() });
    const bf = meta.files && meta.files.bridges;
    nbiReady = bf ? fetch(vurl("data/" + bf.file)).then((r) => r.ok ? r.json() : null).then((j) => {
      NBI = empty();
      if (!j) return;
      for (const [k, v] of Object.entries(j.ways || {})) NBI.ways.set(+k, new Map(v.map((r) => [r[0], r])));
      for (const [k, v] of Object.entries(j.structures || {})) NBI.structures.set(+k, v);
    }).catch(() => {
      NBI = empty();
    }) : Promise.resolve().then(() => {
      NBI = empty();
    });
  }
  function trim(map, keep) {
    if (map.size <= keep) return;
    const old = [...map.entries()].sort((a, b) => a[1].last - b[1].last);
    for (let n = 0; n < old.length - keep; n++) map.delete(old[n][0]);
  }
  function ensurePack(I, J) {
    const k = J * 1024 + I;
    const c = packCache.get(k);
    if (c) {
      c.last = world.tick;
      return Promise.resolve(c);
    }
    let pr = packPending.get(k);
    if (!pr) {
      pr = fetch(vurl("data/lcp/" + I + "_" + J + ".bin")).then((r) => {
        if (!r.ok) throw new Error("lcp " + I + "_" + J + " " + r.status);
        return r.arrayBuffer();
      }).then((buf) => {
        const dv = new DataView(buf);
        if (dv.getUint32(0, true) !== 827343692 || dv.getUint32(4, true) !== 2 || dv.getUint32(8, true) !== LCQ) throw new Error("lcp " + I + "_" + J + " is not a land cover pack");
        const n = dv.getUint32(12, true), off = new Uint32Array(n), len = new Uint32Array(n);
        for (let q = 0; q < n; q++) {
          off[q] = dv.getUint32(16 + q * 8, true);
          len[q] = dv.getUint32(20 + q * 8, true);
        }
        const p = { buf, off, len, last: world.tick };
        packCache.set(k, p);
        trim(packCache, PACK_KEEP);
        return p;
      }).finally(() => packPending.delete(k));
      packPending.set(k, pr);
    }
    return pr;
  }
  function ensureQuad(t, I, J, q) {
    const k = (J * 1024 + I) * 32 + q;
    const c = quadCache[t].get(k);
    if (c) {
      c.last = world.tick;
      return null;
    }
    let pr = quadPending.get(k);
    if (!pr) {
      pr = ensurePack(I, J).then((p) => p.len[q] ? decodePNG(p.buf.slice(p.off[q], p.off[q] + p.len[q])).then((img) => img.data) : null).then((data) => {
        quadCache[t].set(k, { data, last: world.tick });
      }).catch((err) => {
        quadCache[t].set(k, { data: null, last: world.tick });
        postMessage({ type: "warn", message: "land cover: " + String(err && err.message || err) });
      }).finally(() => {
        quadPending.delete(k);
        trim(quadCache[t], QUAD_KEEP[t]);
      });
      quadPending.set(k, pr);
    }
    return pr;
  }
  function quadKey(mx, my, t) {
    const side = t ? 4096 : 2048, per = LCP / side;
    const gx = Math.floor(mx / side), gy = Math.floor(my / side), I = Math.floor(gx / per), J = Math.floor(gy / per);
    if (!lcPacks.has(J * 1024 + I)) return -1;
    const qx = gx - I * per, qy = gy - J * per;
    return (J * 1024 + I) * 32 + (t ? 16 + qx + 2 * qy : qx + 4 * qy);
  }
  function lcAt(mx, my, t = 0) {
    const k = quadKey(mx, my, t);
    if (k < 0) return -1;
    const c = quadCache[t].get(k);
    if (!c || !c.data) return -1;
    const side = t ? 4096 : 2048, res = side / LCQ;
    const x0 = Math.floor(mx / side) * side, y0 = Math.floor(my / side) * side;
    return c.data[Math.floor((my - y0) / res) * LCQ + Math.floor((mx - x0) / res)];
  }
  function lcPromises(mx0, my0, s, t) {
    const out = [], side = t ? 4096 : 2048, per = LCP / side;
    for (let gy = Math.floor(my0 / side); gy <= Math.floor((my0 + s - 1e-6) / side); gy++) for (let gx = Math.floor(mx0 / side); gx <= Math.floor((mx0 + s - 1e-6) / side); gx++) {
      const I = Math.floor(gx / per), J = Math.floor(gy / per);
      if (!lcPacks.has(J * 1024 + I)) continue;
      const qx = gx - I * per, qy = gy - J * per;
      const pr = ensureQuad(t, I, J, t ? 16 + qx + 2 * qy : qx + 4 * qy);
      if (pr) out.push(pr);
    }
    return out;
  }
  var fetchPart = (dir, rx, ry) => fetch(vurl("data/" + dir + "/" + rx + "_" + ry + ".png")).then((r) => {
    if (!r.ok) throw new Error(dir + " " + rx + "_" + ry + " " + r.status);
    return r.arrayBuffer();
  }).then(decodePNG).then((p) => p.data);
  async function readParts(reg, rx, ry, which) {
    const missing = [];
    for (const dir of which) {
      try {
        const e = await fetchPart(dir, rx, ry);
        if (dir === "b3") reg.real = parseReal(e.buffer.slice(e.byteOffset, e.byteOffset + e.byteLength));
        else if (dir === "g3") reg.ground = parseGround(e);
        else if (dir === "t3") {
          const dv = new DataView(e.buffer, e.byteOffset, e.byteLength);
          const magic = dv.getUint32(0, true);
          if (magic !== 860181076 && magic !== 876958292) throw new Error("bad tree file");
          const T = dv.getUint32(4, true), n = dv.getUint32(8, true), cn = dv.getUint32(12, true), o1 = 16 + (T * T + 1) * 4, o2 = o1 + T * T + 3 & ~3, o3 = o2 + n * 4;
          reg.trees = { T, off: new Uint32Array(e.buffer.slice(e.byteOffset + 16, e.byteOffset + o1)), mode: e.subarray(o1, o1 + T * T), rec: e.subarray(o2, o3), kinds: magic === 876958292 };
          if (cn && e.length >= o3 + 2 * cn * cn) {
            reg.trees.cn = cn;
            reg.trees.cov = e.subarray(o3, o3 + cn * cn);
            reg.trees.ch = e.subarray(o3 + cn * cn, o3 + 2 * cn * cn);
          }
        }
      } catch (err) {
        missing.push(dir);
        postMessage({ type: "warn", message: dir + " " + rx + "_" + ry + ": " + String(err && err.message || err) });
      }
    }
    if (missing.length) {
      const n = reg.partial ? reg.partial.n + 1 : 1;
      reg.partial = n >= 6 ? null : { which: missing, n, next: Date.now() + 1e3 * Math.min(60, 2 ** n) };
    } else reg.partial = null;
  }
  function ensureRegion(rx, ry) {
    const k = regionKey(rx, ry);
    if (world.regions.has(k) || !world.have.has(k)) return null;
    const f = regionFails.get(k);
    if (f && Date.now() < f.next) return null;
    let pr = pending.get(k);
    if (!pr) {
      pr = (async () => {
        try {
          const d = await fetchPart("r2", rx, ry);
          const reg = parseRegion(d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength), rx, ry);
          const parts = [];
          if (measured.has(k)) parts.push("b3");
          if (treeFiles.has(k)) parts.push("t3");
          if (groundFiles.has(k)) parts.push("g3");
          await readParts(reg, rx, ry, parts);
          world.addRegion(rx, ry, reg);
          regionFails.delete(k);
        } catch (err) {
          const n = (f ? f.n : 0) + 1;
          if (n >= 6) world.addRegion(rx, ry, EMPTY_REGION);
          else regionFails.set(k, { n, next: Date.now() + 1e3 * Math.min(60, 2 ** n) });
          postMessage({ type: "warn", message: String(err && err.message || err) });
        }
        pending.delete(k);
        world.tick++;
        world.trimRegions(8);
      })();
      pending.set(k, pr);
    }
    return pr;
  }
  function overMouth(reg, mx, my, h) {
    return !!(reg && reg.nTun && world.nearestTunnel(mx, my) < 3 + TUN_SHELL && world._nt.z + TUN_H + TUN_SHELL + 1.5 > h);
  }
  function tunnelsNear(reg, mx0, my0, s) {
    if (!reg.tunBox) {
      const out = [];
      for (let ri = 0; ri < reg.nRoads; ri++) {
        if (!reg.rTun[ri]) continue;
        const a = reg.rStart[ri], n = reg.rCount[ri];
        let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
        for (let q = a; q < a + n; q++) {
          x0 = Math.min(x0, reg.px[q]);
          x1 = Math.max(x1, reg.px[q]);
          y0 = Math.min(y0, reg.py[q]);
          y1 = Math.max(y1, reg.py[q]);
        }
        const m = reg.rHw[ri] + 20;
        out.push(reg.x0 + x0 - m, reg.y0 + y0 - m, reg.x0 + x1 + m, reg.y0 + y1 + m);
      }
      reg.tunBox = out;
    }
    const b = reg.tunBox;
    for (let i = 0; i < b.length; i += 4) if (b[i] < mx0 + s && b[i + 2] > mx0 && b[i + 1] < my0 + s && b[i + 3] > my0) return true;
    return false;
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
  function crossesWall(w, o, p, dx, dy) {
    const sd = w[o * 4], sdp = sd + dx * w[o * 4 + 1] + dy * w[o * 4 + 2];
    return sd > 0 !== sdp > 0;
  }
  function wallsNear(x0, y0, size) {
    const W = world.walls;
    if (!W) return false;
    for (let cy = Math.floor(y0 / WCELL); cy <= Math.floor((y0 + size) / WCELL); cy++)
      for (let cx = Math.floor(x0 / WCELL); cx <= Math.floor((x0 + size) / WCELL); cx++) if (W.cells.has(cy * 65536 + cx)) return true;
    return false;
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
    const walls = !sea && cell <= 50 && wallsNear(mx0 - cell, my0 - cell, s + 2 * cell);
    const carve = cell <= 50 && (hasRoads || walls);
    let off = null, wside = null;
    if (walls && cell <= 12) {
      off = new Float32Array(G * G * 2);
      wside = new Float32Array(G * G * 4);
      for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
        const mx = mx0 + (i - 1) * cell, my = my0 + (j - 1) * cell;
        const wl = world._wallNear(mx, my, true);
        if (!wl || wl.end || wl.d > 2 * cell || wl.top - wl.foot < 0.4) continue;
        const o = (j * G + i) * 4;
        wside[o] = wl.sd || -1e-3;
        wside[o + 1] = wl.nx;
        wside[o + 2] = wl.ny;
        wside[o + 3] = 1;
      }
      for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
        const o = j * G + i;
        if (!wside[o * 4 + 3]) continue;
        let across2 = false;
        for (let b = -1; b <= 1 && !across2; b++) for (let a = -1; a <= 1; a++) {
          const jj = j + b, ii = i + a;
          if ((a || b) && jj >= 0 && jj < G && ii >= 0 && ii < G && crossesWall(wside, o, jj * G + ii, a * cell, b * cell)) {
            across2 = true;
            break;
          }
        }
        if (!across2) continue;
        const sd = wside[o * 4], mv = (sd > 0 ? 0.08 : -0.08) - sd;
        off[o * 2] = wside[o * 4 + 1] * mv;
        off[o * 2 + 1] = wside[o * 4 + 2] * mv;
      }
    }
    const hs = new Float32Array(G * G);
    let hmin = 1e9, hmax = -1e9;
    for (let j = 0; j < G; j++) {
      const my = my0 + (j - 1) * cell;
      for (let i = 0; i < G; i++) {
        const o = j * G + i;
        const h = sea ? 0 : off ? world.groundH(mx0 + (i - 1) * cell + off[o * 2], my + off[o * 2 + 1], carve, !realBuildings) : world.groundH(mx0 + (i - 1) * cell, my, carve, !realBuildings);
        hs[o] = h;
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
    const across = (o, p) => wside && wside[o * 4 + 3] && crossesWall(wside, o, p, (p % G - o % G) * cell, (Math.floor(p / G) - Math.floor(o / G)) * cell);
    for (let j = 0; j <= N; j++) {
      const my = my0 + j * cell;
      for (let i = 0; i <= N; i++) {
        const o = (j + 1) * G + i + 1;
        let dx, dy;
        if (!wside) {
          dx = (hs[o + 1] - hs[o - 1]) / (2 * cell);
          dy = (hs[o + G] - hs[o - G]) / (2 * cell);
        } else {
          const l = across(o, o - 1), r = across(o, o + 1), d = across(o, o - G), u = across(o, o + G);
          dx = l && r ? 0 : l ? (hs[o + 1] - hs[o]) / cell : r ? (hs[o] - hs[o - 1]) / cell : (hs[o + 1] - hs[o - 1]) / (2 * cell);
          dy = d && u ? 0 : d ? (hs[o + G] - hs[o]) / cell : u ? (hs[o] - hs[o - G]) / cell : (hs[o + G] - hs[o - G]) / (2 * cell);
        }
        const il = 1 / Math.hypot(dx, dy, 1);
        const k = (j * N1 + i) * 3;
        nrm[k] = -dx * il;
        nrm[k + 1] = -dy * il;
        nrm[k + 2] = il;
        const ox = off ? off[o * 2] : 0, oy = off ? off[o * 2 + 1] : 0;
        put(v++, mx0 + i * cell + ox, my + oy, hs[o], nrm[k], nrm[k + 1], nrm[k + 2], i * cell + ox, j * cell + oy);
      }
    }
    const edge = (i, j) => {
      const o = (j + 1) * G + i + 1, k = (j * N1 + i) * 3;
      const ox = off ? off[o * 2] : 0, oy = off ? off[o * 2 + 1] : 0;
      put(v++, mx0 + i * cell + ox, my0 + j * cell + oy, hs[o] - skirt, nrm[k], nrm[k + 1], nrm[k + 2], i * cell + ox, j * cell + oy);
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
      const data = new Uint16Array(T * T * 4), kind = new Uint8Array(T * T * 2);
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
            kind[(b * T + a) * 2] = roadKind(nr.reg, nr.road);
            kind[(b * T + a) * 2 + 1] = Math.round(clamp((nr.u + 1.5) / 6, 0, 1) * 255);
            if (nr.d < nr.hw + 0.5 && world.outrankedBy(mx, my) < 1.6) kind[(b * T + a) * 2] |= 128;
            any = true;
          } else {
            data[k] = far;
            data[k + 1] = zero;
            data[k + 2] = one;
            data[k + 3] = zero;
            kind[(b * T + a) * 2 + 1] = 255;
          }
        }
      }
      if (any) {
        road = data;
        roadK = kind;
      }
    }
    let tun = null;
    if (reg && reg.nTun && level >= 6 && tunnelsNear(reg, mx0, my0, s)) {
      const data = new Uint16Array(T * T * 2);
      let any = false;
      const far = toHalf(30), none = toHalf(-1e3);
      for (let b = 0; b < T; b++) {
        const my = my0 + b / (T - 1) * s;
        for (let a = 0; a < T; a++) {
          const mx = mx0 + a / (T - 1) * s, k = (b * T + a) * 2;
          const e = world.nearestTunnel(mx, my);
          if (e < 12) {
            data[k] = toHalf(e - TUN_SHELL);
            data[k + 1] = toHalf(world._nt.z + TUN_H + TUN_SHELL);
            any = true;
          } else {
            data[k] = far;
            data[k + 1] = none;
          }
        }
      }
      if (any) tun = data;
    }
    let lc = null, lcN = 0;
    if (lcPacks.size && level >= 6 && !sea) {
      const t = level >= 7 ? 0 : 1, side = t ? 4096 : 2048, res2 = side / LCQ;
      lcN = level >= 7 ? Math.min(368, Math.round(s)) : 368;
      const px = s / lcN;
      lc = new Uint8Array(lcN * lcN);
      let any = false, tk = -2, td = null, x0 = 0, y0 = 0;
      for (let b = 0; b < lcN; b++) {
        const my = my0 + (b + 0.5) * px;
        for (let a = 0; a < lcN; a++) {
          const mx = mx0 + (a + 0.5) * px, k = quadKey(mx, my, t);
          if (k !== tk) {
            tk = k;
            const c = k >= 0 ? quadCache[t].get(k) : null;
            td = c ? c.data : null;
            x0 = Math.floor(mx / side) * side;
            y0 = Math.floor(my / side) * side;
          }
          if (!td) continue;
          const v2 = td[Math.floor((my - y0) / res2) * LCQ + Math.floor((mx - x0) / res2)];
          if (v2) {
            lc[b * lcN + a] = v2;
            any = true;
          }
        }
      }
      if (!any) {
        lc = null;
        lcN = 0;
      }
    }
    const res = { type: "chunk", id: q.id, key: q.key, level, ix, iy, n: N, sea, pos, nor, loc, center: [cx, cy, cz], sphere: [bcx, bcy, bcz, brad], hmin, hmax, road, roadK, roadT: T, tun, lc, lcN, size: s, mx0, my0 };
    const tr = [pos.buffer, nor.buffer, loc.buffer];
    if (road) tr.push(road.buffer, roadK.buffer);
    if (tun) tr.push(tun.buffer);
    if (lc) tr.push(lc.buffer);
    postMessage(res, tr);
  }
  function genScatter(q) {
    const { kind, level, ix, iy } = q;
    const s = ROOT / (1 << level), mx0 = ix * s, my0 = iy * s;
    cyl(mx0 + s / 2, my0 + s / 2, 0, tmp);
    const cx = tmp[0], cy = tmp[1], cz = tmp[2];
    const out = [];
    const p32 = new Float64Array(3);
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
      const tr = kind === "trees" && reg && reg.trees ? reg.trees : null;
      let tI = -1;
      if (tr) {
        const tx = Math.floor((mx0 + s / 2 - reg.x0) / s), ty = Math.floor((my0 + s / 2 - reg.y0) / s);
        if (tx >= 0 && ty >= 0 && tx < tr.T && ty < tr.T && tr.mode[ty * tr.T + tx] === 1) tI = ty * tr.T + tx;
      }
      const cg = reg && reg.trees && reg.trees.cn ? reg.trees : null, can = [0, 0];
      const canopy = (mx, my) => {
        if (!cg) return false;
        const lx = mx - reg.x0, ly = my - reg.y0, ts = RS / cg.T;
        const tx = Math.floor(lx / ts), ty = Math.floor(ly / ts);
        if (tx < 0 || ty < 0 || tx >= cg.T || ty >= cg.T || cg.mode[ty * cg.T + tx] !== 1) return false;
        const k = Math.min(cg.cn - 1, Math.floor(ly / RS * cg.cn)) * cg.cn + Math.min(cg.cn - 1, Math.floor(lx / RS * cg.cn));
        can[0] = cg.cov[k] / 255;
        can[1] = cg.ch[k] * 0.25;
        return true;
      };
      const byBridge = (mx, my, h, d) => reg && reg.nDeck > 0 && world.nearestDeck(mx, my) < d && world._nd.z - h > 5;
      for (let j = 0; j < n2; j++) for (let i = 0; i < n2; i++) {
        const gi = Math.round(mx0 / cell2) + i, gj = Math.round(my0 / cell2) + j;
        const r1 = hash2(gi * 3 + 1, gj * 3 + 7), r2 = hash2(gi * 5 + 11, gj * 5 + 3), r3 = hash2(gi * 7 + 5, gj * 7 + 13), r4 = hash2(gi + 91, gj + 17);
        const mx = mx0 + (i + 0.15 + 0.7 * r1) * cell2, my = my0 + (j + 0.15 + 0.7 * r2) * cell2;
        let forest = world.coverBilinear(mx, my, 1), tall = 0;
        const dev = world.coverBilinear(mx, my, 0), seen = canopy(mx, my);
        if (seen) {
          forest = can[0];
          tall = can[1];
        }
        let p;
        if (kind === "trees") p = world.cover2 || seen ? forest * 0.95 : forest * 0.9 + (1 - forest) * (0.03 + 0.1 * dev);
        else p = smoothstep(0.35, 0.8, forest);
        const lcv = kind === "trees" ? lcAt(mx, my) : -1;
        if (lcv >= 0) {
          p = lcv >= 6 && lcv <= 8 || lcv === 10 ? 0.92 : lcv === 9 || lcv === 11 || lcv === 16 || lcv === 17 ? 0.45 : 0;
        }
        if (r3 > p) continue;
        if (seen && tall < 2.5) continue;
        if (world.sdfAt(mx, my) < (kind === "trees" ? 5 : 22)) continue;
        const h = world.groundH(mx, my, true);
        const g = world.g;
        if (g.water || g.edge < (kind === "trees" ? 2.5 : 16) || g.deck > -1e8) continue;
        if (seen && byBridge(mx, my, h, kind === "trees" ? 7 : 14)) continue;
        if (overMouth(reg, mx, my, h)) continue;
        const sand = world.coverBilinear(mx, my, 2);
        if (sand > 0.5) continue;
        if (tI >= 0 && world.nearestRoad(mx, my) < 28 && world._nr.reg.rCls[world._nr.road] < 14) continue;
        if (near) {
          let hit = false;
          for (let k = 0; k < near.length; k += 16) {
            const dx = mx - near[k], dy = my - near[k + 1], rr = tI >= 0 ? Math.max(near[k + 2], near[k + 3]) * 0.5 + 38 : Math.max(near[k + 2], near[k + 3]) * 0.6 + 3;
            if (dx * dx + dy * dy < rr * rr) {
              hit = true;
              break;
            }
          }
          if (hit) continue;
        }
        let pc = world.cover2 ? 0.04 + 0.92 * world.coverBilinear(mx, my, 1, true) : 0.22 + 0.4 * smoothstep(380, 850, h) + 0.45 * sand;
        if (lcv >= 0) pc = lcv === 7 || lcv === 17 ? 0.97 : lcv === 8 ? 0.5 : lcv === 10 ? 0.35 : lcv === 6 || lcv === 16 ? 0.03 : pc;
        const conifer = r4 < pc ? 1 : 0;
        cyl(mx, my, h, p32);
        const sc = seen && kind === "trees" ? clamp(tall * 1.15 * (0.82 + 0.36 * hash2(gi + 3, gj + 29)) / TREE_H[conifer], 0.25, 2.9) : 0.75 + 0.65 * hash2(gi + 3, gj + 29);
        out.push(p32[0] - cx, p32[1] - cy, p32[2] - cz, sc, r1 * 6.2832, conifer, hash2(gi + 57, gj + 5));
        order.push(hash2(gi * 13 + 1, gj * 17 + 5));
      }
      if (tI >= 0) {
        for (let q2 = tr.off[tI]; q2 < tr.off[tI + 1]; q2++) {
          let mx = mx0 + (tr.rec[q2 * 4] + 0.5) * s / 256, my = my0 + (tr.rec[q2 * 4 + 1] + 0.5) * s / 256;
          const tall = tr.rec[q2 * 4 + 2] * 0.25;
          const e = world.nearestRoad(mx, my);
          if (e < 1 && world._nr.reg.rCls[world._nr.road] < 14) {
            const nr = world._nr, k = (1.3 - e) * nr.side;
            mx += nr.ty * k;
            my -= nr.tx * k;
          }
          const h = world.groundH(mx, my, true);
          if (world.g.water || world.g.deck > -1e8 || byBridge(mx, my, h, 7) || overMouth(reg, mx, my, h)) continue;
          const gi = Math.round(mx * 2), gj = Math.round(my * 2);
          const sand = world.coverBilinear(mx, my, 2);
          const pc = world.cover2 ? 0.04 + 0.92 * world.coverBilinear(mx, my, 1, true) : 0.22 + 0.4 * smoothstep(380, 850, h) + 0.45 * sand;
          const conifer = tr.kinds ? tr.rec[q2 * 4 + 3] >> 7 : hash2(gi + 91, gj + 17) < pc ? 1 : 0;
          cyl(mx, my, h, p32);
          out.push(p32[0] - cx, p32[1] - cy, p32[2] - cz, clamp(tall / (conifer ? TREE_H[1] : TREE_H[0]), 0.22, 2.9), hash2(gi * 3 + 1, gj * 3 + 7) * 6.2832, conifer, hash2(gi + 57, gj + 5));
          order.push(hash2(gi * 13 + 1, gj * 17 + 5));
        }
      }
      const nT = order.length, perm = Array.from({ length: nT }, (_, i) => i).sort((a, b) => order[a] - order[b]);
      const arr2 = new Float32Array(nT * 7);
      for (let i = 0; i < nT; i++) for (let k = 0; k < 7; k++) arr2[i * 7 + k] = out[perm[i] * 7 + k];
      postMessage({ type: "scatter", id: q.id, key: q.key, kind, center: [cx, cy, cz], my: my0 + s / 2, data: arr2, stride: 7 }, [arr2.buffer]);
      return;
    }
    if (kind === "decks") {
      const t = buildDeckTile(world, reg, ix, iy, s, cx, cy, cz, (my0 + s / 2) / R, NBI);
      const msg = { type: "scatter", id: q.id, key: q.key, kind, center: [cx, cy, cz], my: my0 + s / 2, house: t, data: new Float32Array(0), stride: 1 };
      postMessage(msg, t ? [t.pos.buffer, t.nor.buffer, t.uv.buffer, t.w.buffer, t.m.buffer, t.c.buffer, t.k.buffer, t.idx.buffer] : []);
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
      const t = sel.length ? buildHouseTile(world, list, sel, cx, cy, cz, (my0 + s / 2) / R, reg) : null;
      const msg = { type: "scatter", id: q.id, key: q.key, kind, center: [cx, cy, cz], my: my0 + s / 2, house: t, data: new Float32Array(0), stride: 1 };
      postMessage(msg, t ? [t.pos.buffer, t.nor.buffer, t.uv.buffer, t.w.buffer, t.m.buffer, t.c.buffer, t.k.buffer, t.idx.buffer] : []);
      return;
    }
    if (realBuildings) {
      const cs = RS / 32;
      const list = reg ? cellBuildings(reg, Math.round((mx0 - reg.x0) / cs), Math.round((my0 - reg.y0) / cs)) : null;
      if (list) for (let k = 0; k < list.length; k += 16) farBoxes(world, list, k, reg, cx, cy, cz, out);
      const arr2 = new Float32Array(out);
      postMessage({ type: "scatter", id: q.id, key: q.key, kind, center: [cx, cy, cz], my: my0 + s / 2, data: arr2, stride: 16 }, [arr2.buffer]);
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
      cyl(mx, my, h - 0.4, p32);
      out.push(p32[0] - cx, p32[1] - cy, p32[2] - cz, yaw, w, d, ht, roof, Math.floor(r3 * 255), roof ? 0 : 7, roof ? 0 : 1);
    }
    const arr = new Float32Array(out);
    postMessage({ type: "scatter", id: q.id, key: q.key, kind, center: [cx, cy, cz], my: my0 + s / 2, data: arr, stride: 11 }, [arr.buffer]);
  }
  function genWebster(m) {
    const raw = m.raw, meta = m.meta, wb = world.meta.webster;
    const q = meta.quantization, ox = wb.ox, oy = wb.oy;
    cyl(ox, oy, 100, tmp);
    const cx = tmp[0], cy = tmp[1], cz = tmp[2];
    const p32 = new Float64Array(3);
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
        cyl(ox + x, my, y + 100, p32);
        const px = p32[0] - cx, py = p32[1] - cy, pz = p32[2] - cz;
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
      jobDegraded = false;
      if (m.type === "scatter" || m.level >= 5) {
        const s2 = ROOT / (1 << m.level);
        const rx = Math.floor((m.ix + 0.5) * s2 / RS), ry = Math.floor((m.iy + 0.5) * s2 / RS), k = regionKey(rx, ry);
        const pr = ensureRegion(rx, ry);
        if (pr) await pr;
        const reg = world.regions.get(k);
        if (reg && reg.partial && Date.now() >= reg.partial.next) await readParts(reg, rx, ry, reg.partial.which);
        jobDegraded = world.have.has(k) && (!reg || !!reg.partial);
      }
      const s = ROOT / (1 << m.level);
      if (m.type === "chunk" && m.level >= 6 && lcPacks.size) {
        for (let tries = 0; tries < 4; tries++) {
          const prs = lcPromises(m.ix * s, m.iy * s, s, m.level >= 7 ? 0 : 1);
          if (!prs.length) break;
          await Promise.all(prs);
        }
      }
      if (m.type === "scatter" && m.kind === "decks" && nbiReady) await nbiReady;
      if (wallsReady) await wallsReady;
      if (liftedReady) await liftedReady;
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
