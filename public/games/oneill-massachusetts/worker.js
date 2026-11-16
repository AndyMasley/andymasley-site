(() => {
  // src/streets_data.js
  var RS = 2 * Math.PI * 3e4 / 16;
  var MARGIN = 64;
  var SPAN = RS + 2 * MARGIN;
  var clamp = (x, a, b) => x < a ? a : x > b ? b : x;
  function parseStreets(e) {
    const dv = new DataView(e.buffer, e.byteOffset, e.byteLength);
    if (dv.getUint32(0, true) !== 861099091) throw new Error("bad streets file");
    const covW = dv.getUint32(4, true), covCell = dv.getUint32(8, true) / 100;
    const nPR = dv.getUint32(12, true), nPV = dv.getUint32(16, true), nWR = dv.getUint32(20, true), nWV = dv.getUint32(24, true), nT = dv.getUint32(28, true);
    const flags = dv.getUint32(36, true);
    let p = 64;
    const rowB = covW + 7 >> 3;
    const cov = e.slice(p, p + covW * rowB);
    p += covW * rowB;
    p = p + 3 & ~3;
    let paint = null;
    if (flags & 1) {
      paint = e.slice(p, p + covW * rowB);
      p += covW * rowB;
      p = p + 3 & ~3;
    }
    const ringSet = (nR, nV) => {
      const rings = new Uint32Array(e.buffer.slice(e.byteOffset + p, e.byteOffset + p + nR * 8));
      p += nR * 8;
      const q = new Uint16Array(e.buffer.slice(e.byteOffset + p, e.byteOffset + p + nV * 4));
      p += nV * 4;
      p = p + 3 & ~3;
      const pv = new Float32Array(nV * 2);
      for (let i = 0; i < nV * 2; i++) pv[i] = q[i] / 65535 * SPAN - MARGIN;
      return { nR, nV, rings, pv, grid: null };
    };
    const pave = ringSet(nPR, nPV), water = ringSet(nWR, nWV);
    const tab = /* @__PURE__ */ new Map(), t0 = p + nT * 12;
    for (let i = 0; i < nT; i++) tab.set(dv.getUint32(p + i * 12, true), [t0 + dv.getUint32(p + i * 12 + 4, true), dv.getUint32(p + i * 12 + 8, true)]);
    let kerbs = null;
    const kN = dv.getUint32(44, true);
    if (kN) {
      kerbs = /* @__PURE__ */ new Map();
      let q = dv.getUint32(40, true);
      for (let i = 0; i < kN; i++) {
        const ri = dv.getUint32(q, true), n = dv.getUint32(q + 4, true);
        q += 8;
        const P2 = new Array(n);
        for (let j = 0; j < n; j++, q += 8) P2[j] = [dv.getInt32(q, true) / 100, dv.getInt16(q + 4, true) / 100, dv.getInt16(q + 6, true) / 100];
        kerbs.set(ri, P2);
      }
    }
    let ramps = null;
    const rN = dv.getUint32(52, true);
    if (rN) {
      ramps = { list: [], byTile: /* @__PURE__ */ new Map() };
      const TSl = RS / 64;
      let q = dv.getUint32(48, true);
      for (let i = 0; i < rN; i++) {
        const fx = dv.getFloat32(q, true), fy = dv.getFloat32(q + 4, true);
        const W = dv.getUint16(q + 8, true) / 100, F = dv.getUint16(q + 10, true) / 100, D2 = dv.getUint16(q + 12, true) / 100;
        const mat = dv.getUint8(q + 14), fl = dv.getUint8(q + 15), n = dv.getUint16(q + 16, true), sB = dv.getUint16(q + 18, true) / 100;
        q += 20;
        const P2 = new Float64Array(n * 2), cum = new Float64Array(n);
        let bx0 = 1e9, by0 = 1e9, bx1 = -1e9, by1 = -1e9;
        for (let j = 0; j < n; j++, q += 4) {
          const x = fx + dv.getInt16(q, true) / 100, y = fy + dv.getInt16(q + 2, true) / 100;
          P2[j * 2] = x;
          P2[j * 2 + 1] = y;
          if (j) cum[j] = cum[j - 1] + Math.hypot(x - P2[j * 2 - 2], y - P2[j * 2 - 1]);
          bx0 = Math.min(bx0, x);
          by0 = Math.min(by0, y);
          bx1 = Math.max(bx1, x);
          by1 = Math.max(by1, y);
        }
        const m = D2 + 0.4;
        const r = { fx, fy, W, F, D: D2, mat, fl, P: P2, cum, sB, bx0: bx0 - m, by0: by0 - m, bx1: bx1 + m, by1: by1 + m };
        ramps.list.push(r);
        const i0 = clamp(Math.floor(r.bx0 / TSl), 0, 63), i1 = clamp(Math.floor(r.bx1 / TSl), 0, 63);
        const j0 = clamp(Math.floor(r.by0 / TSl), 0, 63), j1 = clamp(Math.floor(r.by1 / TSl), 0, 63);
        for (let tj = j0; tj <= j1; tj++) for (let ti = i0; ti <= i1; ti++) {
          const k = tj * 64 + ti;
          if (!ramps.byTile.has(k)) ramps.byTile.set(k, []);
          ramps.byTile.get(k).push(r);
        }
      }
    }
    let poles = null;
    const pN = dv.getUint32(60, true);
    if (pN) {
      poles = { list: [], byTile: /* @__PURE__ */ new Map() };
      const TSl = RS / 64;
      let q = dv.getUint32(56, true);
      for (let i = 0; i < pN; i++, q += 16) {
        const x = dv.getFloat32(q, true), y = dv.getFloat32(q + 4, true), a = dv.getUint16(q + 8, true) / 65536 * 2 * Math.PI;
        const p2 = { x, y, tx: Math.cos(a), ty: Math.sin(a), side: dv.getInt8(q + 10), carries: dv.getUint8(q + 11), next: dv.getInt32(q + 12, true) };
        poles.list.push(p2);
        const k = clamp(Math.floor(y / TSl), 0, 63) * 64 + clamp(Math.floor(x / TSl), 0, 63);
        if (!poles.byTile.has(k)) poles.byTile.set(k, []);
        poles.byTile.get(k).push(i);
      }
    }
    return { e, dv, covW, covCell, rowB, cov, paint, pave, water, tab, kerbs, ramps, poles };
  }
  function streetsPainted(st2, lx, ly) {
    const cx = Math.floor(lx / st2.covCell), cy = Math.floor(ly / st2.covCell);
    if (cx < 0 || cy < 0 || cx >= st2.covW || cy >= st2.covW) return false;
    const bm = st2.paint || st2.cov;
    return (bm[cy * st2.rowB + (cx >> 3)] >> (cx & 7) & 1) === 1;
  }
  function streetsCovered(st2, lx, ly) {
    const cx = Math.floor(lx / st2.covCell), cy = Math.floor(ly / st2.covCell);
    if (cx < 0 || cy < 0 || cx >= st2.covW || cy >= st2.covW) return false;
    return (st2.cov[cy * st2.rowB + (cx >> 3)] >> (cx & 7) & 1) === 1;
  }
  var PAVE = { GC: 8, GR: 6.5, R: 4.5 };
  var WATER = { GC: 32, GR: 50, R: 48 };
  var IC = 4;
  function buildGrid(rs, P2) {
    const { rings, pv, nR, nV } = rs, { GC: GC2, GR } = P2;
    const next = new Int32Array(nV), prev = new Int32Array(nV), kind = new Uint8Array(nV);
    for (let r = 0; r < nR; r++) {
      const f = rings[r * 2], n = rings[r * 2 + 1] & 16777215, k = rings[r * 2 + 1] >>> 24;
      for (let i = 0; i < n; i++) {
        next[f + i] = f + (i + 1) % n;
        prev[f + i] = f + (i + n - 1) % n;
        kind[f + i] = k;
      }
    }
    let bx0 = 1e9, by0 = 1e9, bx1 = -1e9, by1 = -1e9;
    for (let i = 0; i < nV; i++) {
      const x = pv[i * 2], y = pv[i * 2 + 1];
      if (x < bx0) bx0 = x;
      if (x > bx1) bx1 = x;
      if (y < by0) by0 = y;
      if (y > by1) by1 = y;
    }
    if (!nV) {
      bx0 = by0 = 0;
      bx1 = by1 = 1;
    }
    const ox = bx0 - GR, oy = by0 - GR;
    const NX2 = Math.max(1, Math.ceil((bx1 - bx0 + 2 * GR) / GC2)), NY2 = Math.max(1, Math.ceil((by1 - by0 + 2 * GR) / GC2));
    const cnt = new Uint32Array(NX2 * NY2 + 1);
    const each = (fn) => {
      for (let i = 0; i < nV; i++) {
        const j = next[i], ax = pv[i * 2], ay = pv[i * 2 + 1], bx = pv[j * 2], by = pv[j * 2 + 1];
        const x0 = Math.max(0, Math.floor((Math.min(ax, bx) - GR - ox) / GC2)), x1 = Math.min(NX2 - 1, Math.floor((Math.max(ax, bx) + GR - ox) / GC2));
        const y0 = Math.max(0, Math.floor((Math.min(ay, by) - GR - oy) / GC2)), y1 = Math.min(NY2 - 1, Math.floor((Math.max(ay, by) + GR - oy) / GC2));
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) fn(y * NX2 + x, i);
      }
    };
    each((c) => cnt[c + 1]++);
    for (let c = 0; c < NX2 * NY2; c++) cnt[c + 1] += cnt[c];
    const items = new Uint32Array(cnt[NX2 * NY2]), fill = cnt.slice(0, NX2 * NY2);
    each((c, i) => {
      items[fill[c]++] = i;
    });
    const MX = Math.max(1, Math.ceil((bx1 - bx0) / IC) + 1), MY = Math.max(1, Math.ceil((by1 - by0) / IC) + 1), rowB = MX + 7 >> 3;
    const all = new Uint8Array(MY * rowB), sub = new Uint8Array(MY * rowB);
    const band = [];
    for (let r = 0; r < MY; r++) band.push([]);
    for (let i = 0; i < nV; i++) {
      const j = next[i], ay = pv[i * 2 + 1], by = pv[j * 2 + 1];
      const r0 = Math.max(0, Math.floor((Math.min(ay, by) - by0) / IC - 0.5)), r1 = Math.min(MY - 1, Math.ceil((Math.max(ay, by) - by0) / IC - 0.5));
      for (let r = r0; r <= r1; r++) band[r].push(i);
    }
    const xs = [], xu = [];
    for (let r = 0; r < MY; r++) {
      const y = by0 + (r + 0.5) * IC;
      xs.length = 0;
      xu.length = 0;
      for (const i of band[r]) {
        const j = next[i], ax = pv[i * 2], ay = pv[i * 2 + 1], bx = pv[j * 2], by = pv[j * 2 + 1];
        if (ay <= y === by <= y) continue;
        const x = ax + (y - ay) / (by - ay) * (bx - ax);
        xs.push(x);
        if (kind[i] & 1) xu.push(x);
      }
      for (const [list, ras] of [[xs, all], [xu, sub]]) {
        if (list.length < 2) continue;
        list.sort((a, b) => a - b);
        for (let k = 0; k + 1 < list.length; k += 2) {
          const c0 = Math.max(0, Math.ceil((list[k] - bx0) / IC - 0.5)), c1 = Math.min(MX - 1, Math.floor((list[k + 1] - bx0) / IC - 0.5));
          for (let c = c0; c <= c1; c++) ras[r * rowB + (c >> 3)] |= 1 << (c & 7);
        }
      }
    }
    rs.grid = { GC: GC2, ox, oy, NX: NX2, NY: NY2, start: cnt, items, next, prev, kind, bx0, by0, MX, MY, rowB, all, sub };
    return rs.grid;
  }
  var _d = { sub: false, far: false };
  function ringDist(rs, P2, lx, ly) {
    const g = rs.grid || buildGrid(rs, P2), pv = rs.pv, R2 = P2.R;
    const gx = Math.floor((lx - g.ox) / g.GC), gy = Math.floor((ly - g.oy) / g.GC);
    let best = 1e18, bi = -1, bt = 0;
    if (gx >= 0 && gy >= 0 && gx < g.NX && gy < g.NY) {
      const c = gy * g.NX + gx;
      for (let k = g.start[c], e = g.start[c + 1]; k < e; k++) {
        const i = g.items[k], j = g.next[i];
        const ax = pv[i * 2], ay = pv[i * 2 + 1], dx = pv[j * 2] - ax, dy = pv[j * 2 + 1] - ay, l2 = dx * dx + dy * dy;
        const t = l2 > 1e-9 ? clamp(((lx - ax) * dx + (ly - ay) * dy) / l2, 0, 1) : 0;
        const ex = lx - ax - dx * t, ey = ly - ay - dy * t, d2 = ex * ex + ey * ey;
        if (d2 < best) {
          best = d2;
          bi = i;
          bt = t;
        }
      }
    }
    if (bi < 0 || best > R2 * R2) {
      _d.far = true;
      const r = Math.floor((ly - g.by0) / IC), c = Math.floor((lx - g.bx0) / IC);
      if (r < 0 || c < 0 || r >= g.MY || c >= g.MX) {
        _d.sub = false;
        return R2;
      }
      const on = g.all[r * g.rowB + (c >> 3)] >> (c & 7) & 1;
      _d.sub = on === 1 && (g.sub[r * g.rowB + (c >> 3)] >> (c & 7) & 1) === 1;
      return on ? -R2 : R2;
    }
    _d.far = false;
    const nrm = (i) => {
      const j = g.next[i], dx = pv[j * 2] - pv[i * 2], dy = pv[j * 2 + 1] - pv[i * 2 + 1], l = Math.hypot(dx, dy) || 1;
      return [-dy / l, dx / l];
    };
    let inside;
    if (bt > 0 && bt < 1) {
      const [nx, ny] = nrm(bi);
      inside = (lx - pv[bi * 2]) * nx + (ly - pv[bi * 2 + 1]) * ny > 0;
    } else {
      const v = bt <= 0 ? bi : g.next[bi], n1 = nrm(g.prev[v]), n2 = nrm(v);
      inside = (lx - pv[v * 2]) * (n1[0] + n2[0]) + (ly - pv[v * 2 + 1]) * (n1[1] + n2[1]) > 0;
    }
    _d.sub = (g.kind[bi] & 1) === 1;
    const d = Math.sqrt(best);
    return inside ? -d : d;
  }
  var _pave = { unpaved: false };
  function streetsPaving(st2, lx, ly) {
    const d = ringDist(st2.pave, PAVE, lx, ly);
    _pave.unpaved = _d.sub;
    return clamp(d, -1.5, 4.5);
  }
  var SHORE_R = WATER.R;
  var _water = { far: false };
  function streetsWater(st2, lx, ly) {
    if (!st2.water.nR) {
      _water.far = true;
      return WATER.R;
    }
    const d = ringDist(st2.water, WATER, lx, ly);
    _water.far = _d.far;
    return d;
  }

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
  var clamp2 = (x, a, b) => x < a ? a : x > b ? b : x;
  var smoothstep = (a, b, x) => {
    const t = clamp2((x - a) / (b - a), 0, 1);
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
  var RS2 = ROOT / 4;
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
    const reg = { rx, ry, x0: rx * RS2, y0: ry * RS2, nRoads: nR, nPts: nP, nBld: nB, cells, used: 0 };
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
    const bflags = dv.getUint32(20, true);
    reg.roof = bflags & 1 ? new Uint16Array(buf.slice(p + nB * 12, p + nB * 14)) : null;
    const wo = p + nB * 12 + (bflags & 1 ? nB * 2 : 0);
    reg.wall = bflags & 2 ? new Uint16Array(buf.slice(wo, wo + nB * 2)) : null;
    const fo = wo + (bflags & 2 ? nB * 2 : 0);
    reg.fac = bflags & 4 ? new Uint16Array(buf.slice(fo, fo + nB * 8)) : null;
    const gw = reg.gw = Math.ceil((RS2 + 2 * RM) / RCELL);
    const counts = new Int32Array(gw * gw + 1);
    const visit = (fill) => {
      for (let i = 0; i < nR; i++) {
        const s0 = rStart[i], n = rCount[i];
        for (let k = 0; k < n - 1; k++) {
          const q = s0 + k, ax = px[q], ay = py[q], bx = px[q + 1], by = py[q + 1];
          const x0 = clamp2(Math.floor((Math.min(ax, bx) - RREG + RM) / RCELL), 0, gw - 1), x1 = clamp2(Math.floor((Math.max(ax, bx) + RREG + RM) / RCELL), 0, gw - 1);
          const y0 = clamp2(Math.floor((Math.min(ay, by) - RREG + RM) / RCELL), 0, gw - 1), y1 = clamp2(Math.floor((Math.max(ay, by) + RREG + RM) / RCELL), 0, gw - 1);
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
    if (nDeck) {
      easeRims(reg);
      snapMerges(reg);
    }
    return reg;
  }
  var RIM_EASE = 15;
  function easeRims(reg) {
    const { px, py, pz, rStart, rCount, rEnd, rCls, rTun, cum, segR } = reg;
    const gw = reg.gw;
    let eased = 0;
    for (let i = 0; i < reg.nRoads; i++) {
      const en = rEnd[i];
      if (!(en & 3)) continue;
      const a = rStart[i], n = rCount[i], b = a + n - 1;
      for (const [bit, q, q2] of [[1, a, a + 1], [2, b, b - 1]]) {
        if (!(en & bit)) continue;
        const x = px[q], y = py[q], ox = px[q] - px[q2], oy = py[q] - py[q2], ol = Math.hypot(ox, oy) || 1;
        const cx = Math.floor((x + RM) / RCELL), cy = Math.floor((y + RM) / RCELL);
        if (cx < 0 || cy < 0 || cx >= gw || cy >= gw) continue;
        const c = cy * gw + cx;
        let bd = 0.5, dz = 0;
        for (let k = reg.gstart[c]; k < reg.gstart[c + 1]; k++) {
          const pi = reg.gitems[k], rj = segR[pi];
          if (rj === i || rEnd[rj] || rTun[rj] || rCls[rj] > 15 || rCls[rj] >= 14 !== rCls[i] >= 14) continue;
          const sx = px[pi + 1] - px[pi], sy = py[pi + 1] - py[pi], l2 = sx * sx + sy * sy;
          if (l2 < 1e-6) continue;
          const l = Math.sqrt(l2);
          if (Math.abs(sx * ox + sy * oy) / (l * ol) < 0.8) continue;
          const t = Math.max(0, Math.min(1, ((x - px[pi]) * sx + (y - py[pi]) * sy) / l2));
          const d = Math.hypot(x - px[pi] - sx * t, y - py[pi] - sy * t);
          if (d >= bd) continue;
          const step = pz[pi] + (pz[pi + 1] - pz[pi]) * t - pz[q];
          if (Math.abs(step) < 0.1 || Math.abs(step) >= 2) continue;
          bd = d;
          dz = step;
        }
        if (!dz) continue;
        for (let k = a; k <= b; k++) {
          const d = Math.abs(cum[k] - cum[q]);
          if (d >= RIM_EASE) continue;
          const f = 1 - d / RIM_EASE;
          pz[k] += dz * f * f * (3 - 2 * f);
        }
        eased++;
        (reg.easedRims || (reg.easedRims = [])).push(q);
      }
    }
    reg.nRimsEased = eased;
  }
  var deckSegDir = (dx, dy) => {
    let t = Math.atan2(dy, dx);
    if (t < 0) t += Math.PI;
    return t >= Math.PI ? 0 : t;
  };
  function deckOutranks(reg, rj, ri, thj, oj, thi, oi) {
    const cj = reg.rCls[rj], ci = reg.rCls[ri];
    if (cj !== ci) return cj < ci;
    const hj = reg.rHw[rj], hi = reg.rHw[ri];
    if (Math.abs(hj - hi) > 0.01) return hj > hi;
    if (Math.abs(thj - thi) > 1e-3) return thj < thi;
    if (Math.abs(oj - oi) > 0.05) return oj < oi;
    return false;
  }
  var _own = { z: 0 };
  var XS = null;
  var XK = null;
  function setXS(m, k) {
    XS = m;
    XK = k || null;
  }
  function xsOf(reg, ri) {
    const m = XS && reg ? XS.get(reg.ry * RNX + reg.rx) : null;
    return m ? m.get(ri) : void 0;
  }
  function walkW(reg, ri, s, side) {
    const xs = xsOf(reg, ri);
    if (!xs) return 0;
    const pr = side > 0 ? xs[9] : xs[10], base = side > 0 ? xs[7] : xs[8];
    if (!pr || !pr.length) return base >= 10 ? base / 10 : 0;
    const a = reg.rStart[ri], n = reg.rCount[ri], cum = reg.cum;
    let k = 0;
    while (k < n - 2 && cum[a + k + 1] - cum[a] < s) k++;
    const L2 = cum[a + k + 1] - cum[a + k], f = L2 > 0 ? clamp2((s - (cum[a + k] - cum[a])) / L2, 0, 1) : 0;
    return (pr[k] + (pr[k + 1] - pr[k]) * f) / 10;
  }
  var _kerbs = { left: 0, right: 0, mid: 0, hw: 0 };
  function kerbsAt(reg, ri, s) {
    const st2 = reg && reg.streets, m = !st2 && XK && reg ? XK.get(reg.ry * RNX + reg.rx) : null;
    const P2 = st2 ? st2.kerbs ? st2.kerbs.get(ri) : null : m ? m.get(ri) : null;
    if (!P2 || !P2.length || s < P2[0][0] - 6 || s > P2[P2.length - 1][0] + 6) return null;
    if (P2.hwMed === void 0) {
      const w = [];
      for (let i2 = 0; i2 + 1 < P2.length; i2++) w.push([(P2[i2][2] - P2[i2][1] + P2[i2 + 1][2] - P2[i2 + 1][1]) / 4, P2[i2 + 1][0] - P2[i2][0]]);
      if (!w.length) w.push([(P2[0][2] - P2[0][1]) / 2, 1]);
      w.sort((x, y) => x[0] - y[0]);
      let tot = 0, run = 0;
      for (const q of w) tot += q[1];
      P2.hwMed = w[w.length - 1][0];
      for (const q of w) {
        run += q[1];
        if (run >= tot / 2) {
          P2.hwMed = q[0];
          break;
        }
      }
    }
    let i = 0;
    while (i < P2.length - 2 && P2[i + 1][0] < s) i++;
    const a = P2[i], b = P2[Math.min(i + 1, P2.length - 1)], t = b[0] > a[0] ? clamp2((s - a[0]) / (b[0] - a[0]), 0, 1) : 0;
    _kerbs.left = a[1] + (b[1] - a[1]) * t;
    _kerbs.right = a[2] + (b[2] - a[2]) * t;
    _kerbs.mid = (_kerbs.left + _kerbs.right) / 2;
    _kerbs.hw = P2.hwMed;
    return _kerbs;
  }
  function bikeByte(type, bikeDm, bufDm) {
    if (!type) return 0;
    return type & 3 | clamp2(Math.round(bikeDm - 10), 0, 15) << 2 | clamp2(Math.round(bufDm / 3), 0, 3) << 6;
  }
  function redone(xs) {
    return !!xs && Math.max(xs[1], xs[4]) >= 2;
  }
  function roadKindXS(reg, ri, xs) {
    let k = roadKind(reg, ri);
    if (xs && xs[0] > 0 && k & 3 && (k & 3) !== 3) k = k & ~28 | Math.min((k & 3) === 1 ? Math.max(1, xs[0] >> 1) : xs[0], 7) << 2;
    return k;
  }
  function deckOwnerAt(reg, lx, ly, z, ri, thi, oi, dz, inset) {
    const gw = reg.gw, cx = Math.floor((lx + RM) / RCELL), cy = Math.floor((ly + RM) / RCELL);
    if (cx < 0 || cy < 0 || cx >= gw || cy >= gw) return -1;
    const c = cy * gw + cx, e = reg.gstart[c + 1], px = reg.px, py = reg.py, pz = reg.pz, items = reg.gitems, segR = reg.segR, rHw = reg.rHw, rEnd = reg.rEnd, rCls = reg.rCls;
    const rail = rCls[ri] >= 14;
    let best = -1, bth = 0, bo = 0, bz = 0;
    for (let q = reg.gstart[c]; q < e; q++) {
      const pi = items[q], rj = segR[pi];
      if (rj === ri || !rEnd[rj] || rCls[rj] > 15 || rCls[rj] >= 14 !== rail) continue;
      const ax = px[pi], ay = py[pi], dx = px[pi + 1] - ax, dy = py[pi + 1] - ay, l2 = dx * dx + dy * dy;
      if (l2 < 1e-6) continue;
      const t = ((lx - ax) * dx + (ly - ay) * dy) / l2;
      if (t < 0 || t > 1) continue;
      const ex = lx - ax - dx * t, ey = ly - ay - dy * t, w = rHw[rj] - inset;
      if (w <= 0 || ex * ex + ey * ey >= w * w) continue;
      const zj = pz[pi] + (pz[pi + 1] - pz[pi]) * t;
      if (Math.abs(zj - z) >= dz) continue;
      const thj = deckSegDir(dx, dy), oj = -(reg.x0 + ax) * Math.sin(thj) + (reg.y0 + ay) * Math.cos(thj);
      if (best >= 0 && (best === rj || !deckOutranks(reg, rj, best, thj, oj, bth, bo))) continue;
      best = rj;
      bth = thj;
      bo = oj;
      bz = zj;
    }
    if (best < 0 || !deckOutranks(reg, best, ri, bth, bo, thi, oi)) return -1;
    _own.z = bz;
    return best;
  }
  var MERGE_DZ = 0.8;
  var MERGE_EASE = 20;
  function snapMerges(reg) {
    const { px, py, pz, rStart, rCount, rEnd, rCls, rHw, cum } = reg;
    const order = [];
    for (let i = 0; i < reg.nRoads; i++) if (rEnd[i]) order.push(i);
    order.sort((a, b) => rCls[a] - rCls[b] || rHw[b] - rHw[a]);
    let moved = 0;
    for (const i of order) {
      const a = rStart[i], n = rCount[i];
      let any = false;
      const dz = new Float32Array(n), snap = new Uint8Array(n);
      for (let k = 0; k < n; k++) {
        const q = a + k, q0 = k < n - 1 ? q : q - 1;
        const th = deckSegDir(px[q0 + 1] - px[q0], py[q0 + 1] - py[q0]), o = -(reg.x0 + px[q0]) * Math.sin(th) + (reg.y0 + py[q0]) * Math.cos(th);
        if (deckOwnerAt(reg, px[q], py[q], pz[q], i, th, o, MERGE_DZ, 0.05) >= 0) {
          dz[k] = _own.z - pz[q];
          snap[k] = 1;
          any = true;
        }
      }
      if (!any) continue;
      for (let k = 0; k < n; k++) {
        if (snap[k]) continue;
        let bd = MERGE_EASE, bk = -1;
        for (let j = 0; j < n; j++) if (snap[j]) {
          const d = Math.abs(cum[a + j] - cum[a + k]);
          if (d < bd) {
            bd = d;
            bk = j;
          }
        }
        if (bk >= 0) {
          const f = 1 - bd / MERGE_EASE;
          dz[k] = dz[bk] * f * f * (3 - 2 * f);
        }
      }
      let ch = false;
      for (let k = 0; k < n; k++) if (dz[k]) {
        pz[a + k] += dz[k];
        moved++;
        if (Math.abs(dz[k]) > 0.01) ch = true;
      }
      if (ch) (reg.mergedWays || (reg.mergedWays = [])).push(i);
    }
    reg.nMerged = moved;
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
  var GS = RS2 / GSEG;
  function parseGround(u8) {
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    if (dv.getUint32(0, true) !== 860114503) throw new Error("bad ground file");
    const n = dv.getUint32(4, true), m = dv.getUint32(8, true), seg = dv.getUint32(12, true), steps = dv.getUint32(16, true), off2 = dv.getUint32(20, true);
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
    return { n, m, d, inv: 1 / steps, off: off2 };
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
      const fx = clamp2(mx / g, 0, W - 1.0001), fy = my / g;
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
      const fx = clamp2(mx / g, 0, W - 1.0001), fy = my / g;
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
      const fx = clamp2(mx / this.zpx - 0.5, 0, W - 1.0001), fy = my / this.zpx - 0.5;
      const i = Math.floor(fx), j0 = Math.floor(fy), tx = fx - i, ty = fy - j0;
      let j = j0 % H;
      if (j < 0) j += H;
      const j1 = (j + 1) % H;
      const a = d[j * W + i], c = d[j * W + i + 1], e = d[j1 * W + i], f = d[j1 * W + i + 1];
      const t = (a + (c - a) * tx + (e - a) * ty + (a - c - e + f) * tx * ty - 127.5) / 127.5;
      return (t < 0 ? -1 : 1) * t * t * this.zRange;
    }
    // signed distance to the nearest shore, metres (+ on land), saturating at +-sdfRange.  Inside a city's survey
    // (streets.js) the shore is the survey's: its own distance within 32 m of it, easing by 48 m to the water map's (held
    // on the survey's side of the shore), so the drawn water, the ground and the car all keep to the surveyed edge
    sdfAt(mx, my) {
      const c = this.sdfCoarseAt(mx, my);
      const wy = wrapY(my), rx = Math.floor(mx / RS2);
      if (rx < 0 || rx >= RNX) return c;
      const rg = this.regions.get(Math.floor(wy / RS2) * RNX + rx);
      if (!rg || !rg.streets || !streetsCovered(rg.streets, mx - rg.x0, wy - rg.y0)) return c;
      const f = streetsWater(rg.streets, mx - rg.x0, wy - rg.y0), a = Math.abs(f);
      if (a <= SHORE_R - 16) return f;
      const far = f > 0 === c > 0 ? f > 0 ? Math.max(a, c) : -Math.max(a, -c) : f;
      return f + (far - f) * smoothstep(SHORE_R - 16, SHORE_R, a);
    }
    // the water map's own distance (46 m cells)
    sdfCoarseAt(mx, my) {
      const W = this.sw, H = this.sh, d = this.sdf;
      const fx = clamp2(mx / this.spx - 0.5, 0, W - 1.0001), fy = my / this.spx - 0.5;
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
      const i = clamp2(Math.floor(mx / this.cpx), 0, this.cw - 1);
      let j = Math.floor(my / this.cpx) % this.ch;
      if (j < 0) j += this.ch;
      return this.cover[(j * this.cw + i) * 4 + chn] / 255;
    }
    coverBilinear(mx, my, chn, second) {
      const d = second ? this.cover2 : this.cover;
      if (!d) return 0;
      const W = this.cw, H = this.ch;
      const fx = clamp2(mx / this.cpx - 0.5, 0, W - 1.0001), fy = my / this.cpx - 0.5;
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
      const i = clamp2(Math.floor(mx / this.cpx), 0, this.cw - 1);
      let j = Math.floor(my / this.cpx) % this.ch;
      if (j < 0) j += this.ch;
      return this.aux[(j * this.cw + i) * 3 + 2] / 255;
    }
    townAt(mx, my) {
      if (!this.townId) return 0;
      const i = clamp2(Math.floor(mx / this.cpx), 0, this.cw - 1);
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
      const rx = Math.floor(mx / RS2), ry = Math.floor(my / RS2);
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
    // Nearest deck of a road (not a railway's), in this._nd.
    nearestRoadDeck(mx, my) {
      return this._near(mx, my, true, this._nd, 1e9, false, 13);
    }
    _near(mx, my, deck, o, zmax = 1e9, tun = false, maxCls = 99) {
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
        if (rCls[ri2] > maxCls) continue;
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
    // building records drawn by something else instead (data/stations.json "hide": [region, x, y] as lifted.json names
    // them): the houses and far boxes leave them out; a car still meets their walls
    setHidden(list) {
      const m = /* @__PURE__ */ new Set();
      for (const e of list || []) m.add(e[0] * 4294967296 + e[2] * 65536 + e[1]);
      this.hidden = m;
    }
    isHidden(reg, id) {
      const H = this.hidden;
      if (!H || !H.size || !reg || !reg.b) return false;
      const o = id * 12, b = reg.b;
      return H.has(regionKey(reg.rx, reg.ry) * 4294967296 + (b[o + 2] | b[o + 3] << 8) * 65536 + (b[o] | b[o + 1] << 8));
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
      const cap = Float32Array.from(list, (w) => w.c > 0 ? w.c : 0.35);
      const cut = Uint8Array.from(list, (w) => w.src === "cut" ? 1 : 0);
      const mouth = Float32Array.from(list, (w) => w.o > 0 ? w.o : 0);
      const mouthB = Float32Array.from(list, (w) => w.ob > 0 ? w.ob : 0);
      this.walls = { X, Y, F, T, Wi, ws, cells, cap, cut, mouth, mouthB, n: ws.length / 5 };
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
      mx = clamp2(mx, 0, L);
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
          const rx = Math.floor(mx / RS2);
          if (rx < RNX) rg = this.regions.get(Math.floor(my / RS2) * RNX + rx);
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
        const bank = clamp2(30 + 0.6 * (terr - lev), 30, 400);
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
            let zr = nr.z;
            if (water) {
              const z0 = Math.max(nr.z, lev + 0.3);
              zr = z0 + Math.max(0, lev + 3.5 - z0) * smoothstep(4, 30, -s);
            }
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
    // keep ({ reg, road }): the deck the car is on.  While that deck is under it within reach, the car stays on it, so
    // where two decks overlap at a merge (one up to 1.7 m over the other) it is not lifted onto the one it is not on.
    driveH(mx, my, href, from, keep) {
      const h = this.groundH(mx, my), g = this.g;
      g.onTunnel = false;
      const reach = from === void 0 || from === "deck" ? 1.7 : 0.45;
      if (keep && from === "deck" && keep.reg && keep.road >= 0) {
        const z = this.onWayZ(keep.reg, keep.road, mx, my);
        if (z !== null && Math.abs(z - href) < reach && z > h) {
          g.onDeck = true;
          g.water = false;
          g.deck = z;
          g.deckRoad = keep.road;
          g.deckReg = keep.reg;
          return z;
        }
      }
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
    // The height of deck way ri of region reg under (mx, my), or null where the point is off its roadway (more than
    // 0.35 m past its edge) or past one of its rims.
    onWayZ(reg, ri, mx, my) {
      const lx = mx - reg.x0, ly = my - reg.y0, a = reg.rStart[ri], n = reg.rCount[ri], px = reg.px, py = reg.py, pz = reg.pz, en = reg.rEnd[ri];
      let best = 1e18, z = null;
      for (let q = a; q < a + n - 1; q++) {
        const dx = px[q + 1] - px[q], dy = py[q + 1] - py[q], l2 = dx * dx + dy * dy;
        if (l2 < 1e-6) continue;
        let t = ((lx - px[q]) * dx + (ly - py[q]) * dy) / l2;
        const tol = en & 1 && q === a || en & 2 && q === a + n - 2 ? 0 : 0.3 / Math.sqrt(l2);
        if (t < -tol && q === a || t > 1 + tol && q === a + n - 2) continue;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const ex = lx - px[q] - dx * t, ey = ly - py[q] - dy * t, d2 = ex * ex + ey * ey;
        if (d2 < best) {
          best = d2;
          z = pz[q] + (pz[q + 1] - pz[q]) * t;
        }
      }
      return z !== null && Math.sqrt(best) - reg.rHw[ri] < 0.35 ? z : null;
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
    const flat2 = (pts, want, m) => {
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
      flat2([[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]], [1, 0, 0], m);
      flat2([[x0, y0, z0], [x0, y1, z0], [x0, y1, z1], [x0, y0, z1]], [-1, 0, 0], m);
      flat2([[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], [0, 1, 0], m);
      flat2([[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], [0, -1, 0], m);
      flat2([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [0, 0, 1], m);
      flat2([[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]], [0, 0, -1], m);
    };
    let zs = [];
    for (const K of [S.top, S.belt, S.hw, S.under]) for (const k of K) zs.push(k[0]);
    const arcs = detail ? [-1, -0.9, -0.71, -0.4, 0, 0.4, 0.71, 0.9, 1] : [-1, -0.66, 0, 0.66, 1];
    for (const zc of [W.zf, W.zr]) for (const t of arcs) zs.push(zc + t * W.arch);
    for (const zp of S.pillars) zs.push(zp - 0.045, zp + 0.045);
    zs.sort((a, b) => a - b);
    let st2 = [];
    for (const z of zs) if (!st2.length || z - st2[st2.length - 1] > 0.025) st2.push(z);
    if (detail) {
      const o = [];
      for (let i = 0; i < st2.length; i++) {
        if (i) {
          const d = st2[i] - st2[i - 1], k = Math.ceil(d / 0.36);
          for (let j = 1; j < k; j++) o.push(st2[i - 1] + d * j / k);
        }
        o.push(st2[i]);
      }
      st2 = o;
    }
    for (const zc of [S.a0, S.c1]) {
      let b = 0;
      for (let i = 1; i < st2.length; i++) if (Math.abs(st2[i] - zc) < Math.abs(st2[b] - zc)) b = i;
      st2.splice(b, 0, st2[b]);
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
    const G = st2.map(ring), ns = st2.length;
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
    const live = (i, k) => st2[i + 1] - st2[i] > 1e-6 && k !== 5 && k !== 12;
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
      const k1 = (k + 1) % RN, m = bandMat(k, (st2[i] + st2[i + 1]) / 2);
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
        flat2([c, r[k], r[k1]], [0, 0, dir], CM.PAINT);
      }
    };
    cap(G[0], -1);
    cap(G[ns - 1], 1);
    const zF = st2[0] - 6e-3, zB = st2[ns - 1] + 6e-3;
    const wF = key(S.hw, st2[0]), bF = key(S.belt, st2[0]), uF = key(S.under, st2[0]);
    const wB = key(S.hw, st2[ns - 1]), bB = key(S.belt, st2[ns - 1]), uB = key(S.under, st2[ns - 1]);
    const panel = (x0, x1, y0, y1, z, dir, m) => flat2([[x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z]], [0, 0, dir], m);
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
        flat2([o0, o1, h12, h0], [sx, 0, 0], CM.TYRE);
        flat2([[xh, yc, zc], [xh, yc + rh * s0, zc + rh * c0], [xh, yc + rh * s1, zc + rh * c1]], [sx, 0, 0], CM.HUB);
        flat2([[xi, yc, zc], i0, i1], [-sx, 0, 0], CM.TYRE);
      }
    }
    return { pos: new Float32Array(P2), nor: new Float32Array(N), mat: new Uint8Array(M), n: M.length, len: st2[ns - 1] - st2[0], wheel: W };
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
      this.j = new Uint8Array(this.cap * 4);
      this.t = new Uint16Array(this.cap * 4);
      this.idx = new Uint32Array(this.icap);
      this.W = [0, 0, 0, -1];
      this.M = [0, 0, 0, 0];
      this.C = [0, 0, 0];
      this.K = [0, 0, 0, 0];
      this.J = [0, 0, 0, 0];
      this.T = [0, 0, 0, 0];
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
      this.j = g(this.j, 4);
      this.t = g(this.t, 4);
      this.cap *= 2;
    }
    // a vertex given in the building's frame (u along the footprint's yaw, y up, v across), with its normal there.  The
    // normal is stored as three signed bytes, so it is brought to unit length first: a longer one (a mitred offset passed
    // by mistake) would wrap past 127 and point somewhere else, and tri() winds the triangles by it
    v(pu, py, pv, nu, ny, nv, tu, tv) {
      if (this.n === this.cap) this.grow();
      const i = this.n++, p = this.pos, q = this.nor;
      p[i * 3] = this.ox + this.ux * pu + this.vx * pv;
      p[i * 3 + 1] = this.oy + py;
      p[i * 3 + 2] = this.oz + this.uz * pu + this.vz * pv;
      const wx = this.ux * nu + this.vx * nv, wz = this.uz * nu + this.vz * nv, nl = 127 / (Math.hypot(wx, ny, wz) || 1);
      q[i * 4] = Math.round(wx * nl);
      q[i * 4 + 1] = Math.round(ny * nl);
      q[i * 4 + 2] = Math.round(wz * nl);
      this.uv[i * 2] = tu;
      this.uv[i * 2 + 1] = tv;
      this.w.set(this.W, i * 4);
      this.m.set(this.M, i * 4);
      this.c.set(this.C, i * 3);
      this.k.set(this.K, i * 4);
      this.j.set(this.J, i * 4);
      this.t.set(this.T, i * 4);
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
  function doorAt(len, cls, seed, tb) {
    const bp = ((tb | 0) >> 4 & 255) * 0.1;
    const nb = bp > 0 ? Math.max(1, Math.round(len / bp)) : Math.max(1, Math.floor((len - 0.6) / bayWidth(cls)));
    let bi = nb >> 1;
    if (nb >= 2 && (cls === CLS.TRIPLE || cls === CLS.MULTI || cls === CLS.ROW)) bi = seed & 1 ? 0 : nb - 1;
    return (bi + 0.5) * len / nb;
  }
  function building(M, B, k, g, gmin, gmax, env) {
    const w = B[k + 2], d = B[k + 3], wallH = B[k + 5], cls = B[k + 6], roof = B[k + 7], side = B[k + 8], levels = Math.max(1, B[k + 9]);
    const porch = B[k + 10] > 0, chimney = B[k + 11] > 0, mat = B[k + 12], seed = B[k + 13], id = B[k + 14];
    const r1 = h1(id, seed * 7 + 1), r2 = h1(id * 3 + 5, seed + 11), r3 = h1(id + 77, seed * 3 + 2);
    const y0 = clamp2(gmax - g, 0, 2.5);
    const yb = Math.min(gmin - g, 0) - 0.6;
    const found = FOUND[cls];
    const flat2 = roof === ROOF.FLAT;
    const pitch = PITCH[cls] * (0.9 + 0.25 * r1) * (roof === ROOF.HIP ? 0.8 : 1);
    const par = flat2 ? cls === CLS.TRIPLE || cls === CLS.ROW ? 0 : cls === CLS.CANOPY ? 0 : 0.5 + 0.5 * r2 : 0;
    const He = y0 + wallH, top = He + par;
    const rise = flat2 ? 0 : w / 2 * pitch;
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
      const gableEnd = !flat2 && roof !== ROOF.HIP && (s === 1 || s === 3);
      const front = s === side;
      let flags = (gableEnd ? 1 : 0) | (front ? 2 : 0);
      let door = -1;
      if (front) {
        door = doorAt(len, cls, seed, M.T[3]);
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
      if (flat2 && par > 0) {
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
    if (flat2) {
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
    if (chimney && !flat2) {
      setM(MAT.BRICK);
      const cv = (r2 - 0.5) * 0.55 * d, cu = roof === ROOF.HIP ? 0 : (r3 - 0.5) * 0.3 * w;
      const yc = Hr - Math.abs(cu) * pitch;
      M.box(cu - 0.32, cu + 0.32, yc - 0.9, yc + 0.95, cv - 0.42, cv + 0.42, 55);
    } else if (chimney && flat2) {
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
  function site(M, setM, wall2, depth, cls, levels, seed, porch, found, y0, yb, r1, r2, r3, env) {
    if (!(cls <= CLS.TRIPLE || cls === CLS.ROW || cls === CLS.MULTI)) return;
    const [p0u, p0v, p1u, p1v, nu, nv, len] = wall2;
    const tu = (p1u - p0u) / len, tv = (p1v - p0v) / len;
    const du = doorAt(len, cls, seed, M.T[3]);
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
      const a0 = full ? 0 : clamp2(du - pw / 2, 0, len - pw), a1 = a0 + pw, dep = cls === CLS.TRIPLE ? 2.1 : 1.9;
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
        const gap0 = lv === 0 ? clamp2(du - 0.75, a0, a1) : -1, gap1 = lv === 0 ? clamp2(du + 0.75, a0, a1) : -1;
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
      const st2 = Math.max(1, Math.ceil((floorY - yb - 0.6) / 0.19));
      wbox(clamp2(du - 0.7, a0, a1 - 1.4), clamp2(du + 0.7, a0 + 1.4, a1), dep, dep + Math.min(st2, 6) * 0.28, yb, floorY - 0.19, 55);
      walkFrom = dep + Math.min(st2, 6) * 0.28;
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
      const flat2 = gl < 0.14;
      setM(flat2 ? MAT.FLATROOF : MAT.ROOF);
      const ids = [];
      for (let i = 0; i < F.length / 3; i++) {
        const u = F[i * 3], v = F[i * 3 + 1];
        const tu = flat2 ? u : (-b * u + a * v) / gl, tv = flat2 ? v : (a * u + b * v) / gl * sl;
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
      const flat2 = gl < 0.14;
      setM(flat2 ? MAT.FLATROOF : MAT.ROOF);
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
          const tu = flat2 ? u : (-b * u + a * v) / gl, tv = flat2 ? v : (a * u + b * v) / gl * sl;
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
    const y0 = clamp2(gmax - g, 0, 2.5), yb = Math.min(gmin - g, 0) - 0.6, lift = Math.min(gmin - g, 0), found = FOUND[cls];
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
    const basePl = [[0, 0, clamp2(low - 0.15, 2.2, 400)]];
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
        const isFront = i === front2, door = isFront ? doorAt(len, cls, seed, M.T[3]) : -1;
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
            return [eave, clamp2(Math.round((eave - found - 0.3) / FLOOR[cls]), 1, 60) + 64 * flags, door, y0];
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
        const off2 = (r3 < 0.5 ? -1 : 1) * 0.55, cu = along2 ? ru : ru + off2, cv = along2 ? rv + off2 : rv;
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
      const V2 = (s, t, y, nu, ny, nw, xu, xv) => M.v(su * s + tu * t, y, sv * s + tv * t, nu, ny, nw, xu, xv);
      setM(MAT.WALL);
      M.W[0] = D_W;
      M.W[1] = found + 0.72 + D_HE;
      M.W[2] = 1 + 64 * 2;
      M.W[3] = -1;
      const f0 = found + 0.72;
      const A = V2(sm - hw, ta, hb, -tu, 0, -tv, 0, f0), B = V2(sm + hw, ta, hb, -tu, 0, -tv, D_W, f0), C2 = V2(sm + hw, ta, top, -tu, 0, -tv, D_W, f0 + D_HE);
      const D2 = V2(sm, ta, peak, -tu, 0, -tv, hw, f0 + peakUp), E = V2(sm - hw, ta, top, -tu, 0, -tv, 0, f0 + D_HE);
      M.tri(A, B, C2);
      M.tri(A, C2, E);
      M.tri(E, C2, D2);
      M.W[0] = D_HE / m;
      M.W[1] = 12;
      M.W[2] = 1;
      M.W[3] = -1;
      for (const sg of [-1, 1]) {
        const s = sm + sg * hw, c0 = found + 2.4;
        const i0 = V2(s, ta, hb, sg * su, 0, sg * sv, 0, c0), i1 = V2(s, ta, top, sg * su, 0, sg * sv, 0, c0 + D_HE), i2 = V2(s, tb, top, sg * su, 0, sg * sv, D_HE / m, c0 + D_HE);
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
        const i0 = V2(se, ta - OF, eave, nu, 1 / k, nw, 0, 0), i1 = V2(sm, ta - OF, peak, nu, 1 / k, nw, 0, (hw + OV) * k);
        const i2 = V2(sm, tc, peak, nu, 1 / k, nw, tc - ta + OF, (hw + OV) * k), i3 = V2(se, te, eave, nu, 1 / k, nw, te - ta + OF, 0);
        M.quad(i0, i1, i2, i3);
      }
    }
  }
  var _sec = [];
  function farBoxes(world2, list, k, reg, cx, cy, cz, out, minSize = 0) {
    const real = reg && reg.real ? reg.real : null;
    let mx = list[k], my = list[k + 1], a = list[k + 4];
    const w = list[k + 2], d = list[k + 3], id = list[k + 14], cls = list[k + 6], seed = list[k + 13], mat = list[k + 12], rc = list[k + 15];
    if (world2.isHidden && world2.isHidden(reg, id)) return;
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
    const yb = Math.min(gmin - g, 0) - 0.6, y0 = clamp2(gmax - g, 0, 2.5);
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
      const flat2 = roof === ROOF.FLAT;
      const pitch = PITCH[cls] * (0.9 + 0.25 * r1) * (roof === ROOF.HIP ? 0.8 : 1);
      const He = y0 + wallH;
      if (cls === CLS.CANOPY) boxes.push([0, 0, w, d, He, 0, 0, He - 0.45]);
      else boxes.push([0, 0, w, d, He, flat2 ? 0 : w / 2 * pitch, 0]);
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
    const mul = clamp2(0.3 + big * 0.025, 0.45, 1);
    const wc = reg && reg.wall ? reg.wall[id] : 0;
    const P2 = _p3a, B = _p3b;
    cyl(mx, my, g, B);
    for (const b of boxes) {
      const [u, v, bw, bd, eave, rise, turn] = b;
      const foot = b.length > 7 ? b[7] : yb;
      const fx = mx + ca * u - sa * v, fy = my + sa * u + ca * v;
      cyl(fx, fy, g + foot, P2);
      const a2 = a + (b.length > 8 ? b[8] : 0);
      const yaw = turn ? a2 + Math.PI / 2 : a2, W = turn ? bd : bw, D2 = turn ? bw : bd;
      out.push(P2[0] - cx, P2[1] - cy, P2[2] - cz, yaw, W, D2, Math.min(eave, cap) - foot, cap < 1e8 ? 0 : rise, seed, cls, mat, rc, B[0] - cx, B[1] - cy, B[2] - cz, mul, wc);
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
      if (world2.isHidden && world2.isHidden(reg, id)) continue;
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
          list[k + 9] = clamp2(Math.floor(list[k + 5] / 3), 1, Math.max(1, list[k + 9]));
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
      const wc = reg && reg.wall ? reg.wall[id] : 0;
      if (wc > 0) {
        M.J[0] = (wc >> 11 & 31) * 255 / 31;
        M.J[1] = (wc >> 5 & 63) * 255 / 63;
        M.J[2] = (wc & 31) * 255 / 31;
        M.J[3] = 255;
      } else M.J[0] = M.J[1] = M.J[2] = M.J[3] = 0;
      if (reg && reg.fac && reg.fac[id * 4 + 3]) for (let q = 0; q < 4; q++) M.T[q] = reg.fac[id * 4 + q];
      else M.T[0] = M.T[1] = M.T[2] = M.T[3] = 0;
      if (!(measured2 && realBuilding(M, real, id, list, k, g, gmin, gmax, env, a))) building(M, list, k, g, gmin, gmax, env);
      count++;
    }
    return { n: M.n, count, pos: M.pos.slice(0, M.n * 3), nor: M.nor.slice(0, M.n * 4), uv: M.uv.slice(0, M.n * 2), w: M.w.slice(0, M.n * 4), m: M.m.slice(0, M.n * 4), c: M.c.slice(0, M.n * 3), k: M.k.slice(0, M.n * 4), j: M.j.slice(0, M.n * 4), t: M.t.slice(0, M.n * 4), idx: M.idx.slice(0, M.ni) };
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
    const len = cum[hi] - cum[lo], t = len > 0 ? clamp2((s - cum[lo]) / len, 0, 1) : 0;
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
    const p = pointAt(reg, ri, s), side = poleSide(reg, ri), off2 = (reg.rHw[ri] + 0.9) * side;
    out.mx = reg.x0 + p.x + p.ty * off2;
    out.my = reg.y0 + p.y - p.tx * off2;
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
          if (!poleAt(world2, reg, ri, k, A) || !inTile(A.mx, A.my) || cityPoles(reg, A.mx, A.my)) continue;
          if (kind === "poles") {
            cyl(A.mx, A.my, A.h, p32);
            out.push(p32[0] - cx, p32[1] - cy, p32[2] - cz, A.yaw, hash2(k * 7 + 3, reg.rName[ri] + 11));
          } else if (poleAt(world2, reg, ri, k + 1, B) && !cityPoles(reg, B.mx, B.my)) {
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
          const p = pointAt(reg, ri, k * SLOT), off2 = (hw - 0.55) * side;
          const mx = reg.x0 + p.x + p.ty * off2, my = reg.y0 + p.y - p.tx * off2;
          if (!inTile(mx, my)) continue;
          const dev = world2.coverBilinear(mx, my, 0);
          const want = clamp2(dev * 0.62 - (cls >= 10 ? 0.1 : 0.26), 0, 0.42);
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
    const cp = reg.streets && reg.streets.poles;
    if (cp && (kind === "poles" || kind === "wires")) {
      const TS2 = RS2 / 64, ti = Math.round(lx0 / TS2), tj = Math.round(ly0 / TS2);
      const at = (p, o) => {
        o.mx = reg.x0 + p.x;
        o.my = reg.y0 + p.y;
        o.tx = p.tx;
        o.ty = p.ty;
        o.yaw = Math.atan2(-p.tx, p.ty) + (p.side < 0 ? Math.PI : 0);
        o.h = world2.groundH(o.mx, o.my, true);
        if (world2.g.water || world2.g.deck > -1e8 && world2.g.deck < o.h + 12) return false;
        return true;
      };
      for (const i of cp.byTile.get(tj * 64 + ti) || []) {
        const p = cp.list[i];
        if (!at(p, A) || !inTile(A.mx, A.my)) continue;
        if (kind === "poles") {
          cyl(A.mx, A.my, A.h, p32);
          out.push(p32[0] - cx, p32[1] - cy, p32[2] - cz, A.yaw, p.carries === 1 ? 0.3 : p.carries === 2 ? 0.05 : 0.9);
        } else if (p.next >= 0 && at(cp.list[p.next], B)) {
          wireSpan(world2, A, B, cx, cy, cz, p32, out);
        }
      }
    }
    return new Float32Array(out);
  }
  function wireSpan(world2, A, B, cx, cy, cz, p32, out) {
    for (let j = 1; j < 6; j++) {
      world2.groundH(A.mx + (B.mx - A.mx) * j / 6, A.my + (B.my - A.my) * j / 6, true);
      if (world2.g.deck > -1e8 && world2.g.deck < A.h + 12) return;
    }
    for (const [lat, hgt, sag] of [[-1.05, 8.66, 0.75], [0, 10.12, 0.7], [1.05, 8.66, 0.75], [0.16, 6.4, 0.95]]) {
      let px0 = 0, py0 = 0, pz0 = 0;
      for (let j = 0; j <= 6; j++) {
        const u = j / 6, mx = A.mx + (B.mx - A.mx) * u + (A.ty + (B.ty - A.ty) * u) * lat, my = A.my + (B.my - A.my) * u - (A.tx + (B.tx - A.tx) * u) * lat;
        cyl(mx, my, A.h + (B.h - A.h) * u + hgt - 4 * sag * u * (1 - u), p32);
        if (j > 0) out.push(px0, py0, pz0, p32[0] - cx, p32[1] - cy, p32[2] - cz);
        px0 = p32[0] - cx;
        py0 = p32[1] - cy;
        pz0 = p32[2] - cz;
      }
    }
  }
  function cityPoles(reg, mx, my) {
    const st2 = reg.streets;
    return !!(st2 && st2.poles && streetsPainted(st2, mx - reg.x0, my - reg.y0));
  }

  // src/feat.js
  var MAGIC = 827606342;
  var SIGNAL = 0;
  var STOP = 1;
  var GIVEWAY = 2;
  var CROSSING = 3;
  var LEVEL = 4;
  var FLAGPOLE = 11;
  var HYDRANT = 12;
  var BUSSTOP = 13;
  var LAMP = 14;
  var BENCH = 16;
  var BOLLARD = 17;
  var BIKEPARK = 18;
  var BIKESHARE = 19;
  var PART = {
    STOP: 0,
    YIELD: 1,
    SIGNAL: 2,
    SIGNAL_LONG: 3,
    CROSSBUCK: 4,
    HYDRANT: 5,
    BUS: 6,
    SHELTER: 7,
    FLAGPOLE: 8,
    LAMP: 9,
    FLEXPOST: 10,
    LANTERN_BLACK: 11,
    LANTERN_BRONZE: 12,
    LANTERN_GREEN: 13,
    POSTTOP: 14,
    CROOK: 15,
    BENCH: 16,
    BENCH_BARE: 17,
    BENCH_METAL: 18,
    BENCH_METAL_BARE: 19,
    BENCH_STONE: 20,
    BOLLARD: 21,
    BOLLARD_STEEL: 22,
    BIKE_HOOP: 23,
    BIKE_POST: 24,
    DOCK: 25,
    KIOSK: 26
  };
  function lampPart(sub) {
    const mount = sub & 3, lantern = sub >> 2 & 1, colour = sub >> 3 & 3;
    if (mount === 3) return -1;
    const fancy = lantern || colour;
    if (mount === 1 || mount === 0 && lantern) {
      if (!fancy) return PART.POSTTOP;
      return colour === 2 ? PART.LANTERN_BRONZE : colour === 3 ? PART.LANTERN_GREEN : PART.LANTERN_BLACK;
    }
    return mount === 2 && fancy ? PART.CROOK : PART.LAMP;
  }
  var TOWER = { LATTICE: 0, HFRAME: 1, POLE: 2, LATTICE2: 3 };
  var HANG = [
    [[-7.5, 24], [0, 24], [7.5, 24], [-4.5, 31.2], [4.5, 31.2]],
    [[-4.2, 14.4], [0, 14.4], [4.2, 14.4], [-2.4, 17.6], [2.4, 17.6]],
    [[-1, 10.2], [0, 11.3], [1, 10.2]],
    [[-6.2, 20], [-6.2, 25.6], [-6.2, 31.2], [6.2, 20], [6.2, 25.6], [6.2, 31.2], [0, 36.6]]
  ];
  function parseFeat(e) {
    const dv = new DataView(e.buffer, e.byteOffset, e.byteLength);
    if (dv.getUint32(0, true) !== MAGIC) throw new Error("bad feature file");
    const nP = dv.getUint32(4, true), nAp = dv.getUint32(8, true), nL = dv.getUint32(12, true), nLV = dv.getUint32(16, true);
    const nA = dv.getUint32(20, true), nR = dv.getUint32(24, true), nAV = dv.getUint32(28, true);
    let o = 32;
    const f = { nP, nL, nA };
    f.px = new Float32Array(nP);
    f.py = new Float32Array(nP);
    f.kind = new Uint8Array(nP);
    f.sub = new Uint8Array(nP);
    f.h = new Float32Array(nP);
    f.napp = new Uint8Array(nP);
    f.first = new Uint32Array(nP);
    for (let i = 0; i < nP; i++, o += 16) {
      f.px[i] = dv.getInt32(o, true) / 10;
      f.py[i] = dv.getInt32(o + 4, true) / 10;
      f.kind[i] = dv.getUint8(o + 8);
      f.sub[i] = dv.getUint8(o + 9);
      f.h[i] = dv.getUint8(o + 10) / 2;
      f.napp[i] = dv.getUint8(o + 11);
      f.first[i] = dv.getUint32(o + 12, true);
    }
    f.apH = new Float32Array(nAp);
    f.apCls = new Uint8Array(nAp);
    f.apFoot = new Uint8Array(nAp);
    f.apOne = new Uint8Array(nAp);
    f.apFace = new Uint8Array(nAp);
    for (let j = 0; j < nAp; j++, o += 4) {
      f.apH[j] = dv.getUint16(o, true) / 65536 * 2 * Math.PI;
      const c = dv.getUint8(o + 2);
      f.apCls[j] = c & 15;
      f.apFoot[j] = c >> 4 & 1;
      f.apOne[j] = c >> 5 & 1;
      f.apFace[j] = dv.getUint8(o + 3);
    }
    f.lStart = new Uint32Array(nL);
    f.lCount = new Uint32Array(nL);
    f.lKv = new Float32Array(nL);
    f.lKind = new Uint8Array(nL);
    f.lCab = new Uint8Array(nL);
    for (let i = 0; i < nL; i++, o += 12) {
      f.lStart[i] = dv.getUint32(o, true);
      f.lCount[i] = dv.getUint32(o + 4, true);
      f.lKv[i] = dv.getUint16(o + 8, true) / 10;
      f.lKind[i] = dv.getUint8(o + 10);
      f.lCab[i] = dv.getUint8(o + 11);
    }
    f.lx = new Float32Array(nLV);
    f.ly = new Float32Array(nLV);
    for (let i = 0; i < nLV; i++) f.lx[i] = dv.getInt32(o + i * 4, true) / 10;
    o += nLV * 4;
    for (let i = 0; i < nLV; i++) f.ly[i] = dv.getInt32(o + i * 4, true) / 10;
    o += nLV * 4;
    f.lk = new Uint8Array(e.buffer.slice(e.byteOffset + o, e.byteOffset + o + nLV));
    o += nLV;
    o = o + 3 & ~3;
    f.aRing = new Uint32Array(nA);
    f.aRings = new Uint16Array(nA);
    f.aKind = new Uint8Array(nA);
    f.aSub = new Uint8Array(nA);
    for (let i = 0; i < nA; i++, o += 8) {
      f.aRing[i] = dv.getUint32(o, true);
      f.aRings[i] = dv.getUint16(o + 4, true);
      f.aKind[i] = dv.getUint8(o + 6);
      f.aSub[i] = dv.getUint8(o + 7);
    }
    f.rStart = new Uint32Array(nR);
    f.rCount = new Uint32Array(nR);
    f.rOuter = new Uint8Array(nR);
    for (let i = 0; i < nR; i++, o += 12) {
      f.rStart[i] = dv.getUint32(o, true);
      f.rCount[i] = dv.getUint32(o + 4, true);
      f.rOuter[i] = dv.getUint8(o + 8);
    }
    f.ax = new Float32Array(nAV);
    f.ay = new Float32Array(nAV);
    for (let i = 0; i < nAV; i++) f.ax[i] = dv.getInt32(o + i * 4, true) / 10;
    o += nAV * 4;
    for (let i = 0; i < nAV; i++) f.ay[i] = dv.getInt32(o + i * 4, true) / 10;
    o += nAV * 4;
    f.nG = 0;
    if (o + 16 <= e.byteLength && dv.getUint32(o, true) === 1279869266) {
      const nG = dv.getUint32(o + 4, true), nGV = dv.getUint32(o + 8, true);
      o += 16;
      f.nG = nG;
      f.gStart = new Uint32Array(nG);
      f.gCount = new Uint32Array(nG);
      f.gKind = new Uint8Array(nG);
      f.gLayer = new Int8Array(nG);
      for (let i = 0; i < nG; i++, o += 12) {
        f.gStart[i] = dv.getUint32(o, true);
        f.gCount[i] = dv.getUint32(o + 4, true);
        f.gKind[i] = dv.getUint8(o + 8);
        f.gLayer[i] = dv.getInt8(o + 9);
      }
      f.gx = new Float32Array(nGV);
      f.gy = new Float32Array(nGV);
      for (let i = 0; i < nGV; i++) f.gx[i] = dv.getInt32(o + i * 4, true) / 10;
      o += nGV * 4;
      for (let i = 0; i < nGV; i++) f.gy[i] = dv.getInt32(o + i * 4, true) / 10;
    }
    f.aBox = new Float32Array(nA * 4);
    for (let a = 0; a < nA; a++) {
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      for (let r = f.aRing[a], re = r + f.aRings[a]; r < re; r++) for (let v = f.rStart[r], ve = v + f.rCount[r]; v < ve; v++) {
        const x = f.ax[v], y = f.ay[v];
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
      f.aBox[a * 4] = x0;
      f.aBox[a * 4 + 1] = y0;
      f.aBox[a * 4 + 2] = x1;
      f.aBox[a * 4 + 3] = y1;
    }
    return f;
  }
  function hwAt(world2, x, y, zD = null) {
    if (zD !== null) {
      const d2 = world2.nearestDeck(x, y, zD + 0.6);
      return d2 < 14 ? world2._nd.hw : 0;
    }
    const d = world2.nearestRoad(x, y);
    return d < 14 ? world2._nr.hw : 0;
  }
  function deckOwner(world2, mx, my) {
    const dd = world2.nearestDeck(mx, my);
    if (dd >= 0.35) return null;
    const z = world2._nd.z, cd = dd + world2._nd.hw;
    const dg = world2.nearestRoad(mx, my), cg = dg + world2._nr.hw;
    if (dg < 1e8 && cg <= cd + 0.5) return null;
    if (z <= world2.groundH(mx, my, true) + 0.5) return null;
    return z;
  }
  function surfaceH(world2, x, y, zD) {
    if (zD !== null && world2.nearestDeck(x, y, zD + 0.6) < 0.35) return world2._nd.z + 0.03;
    return world2.groundH(x, y, true);
  }
  function junctionBack(world2, f, i, mx, my, j, zD = null) {
    let w = 0;
    for (let q = f.first[i], e = q + f.napp[i]; q < e; q++) {
      if (q === j || f.apFoot[q]) continue;
      const t = f.apH[q];
      w = Math.max(w, hwAt(world2, mx - Math.cos(t) * 10, my - Math.sin(t) * 10, zD));
    }
    return w;
  }
  function roadCount(f, i) {
    let n = 0;
    for (let q = f.first[i], e = q + f.napp[i]; q < e; q++) if (!f.apFoot[q]) n++;
    return n;
  }
  var FLEX_GAP = 6.096;
  function flexPosts(world2, reg, lx0, ly0, s, put) {
    if (!reg || !reg.nRoads) return;
    const px = reg.px, py = reg.py, pz = reg.pz, cum = reg.cum;
    for (let ri = 0; ri < reg.nRoads; ri++) {
      const xs = xsOf(reg, ri);
      if (!xs || xs[1] !== 3 && xs[4] !== 3) continue;
      const a = reg.rStart[ri], b = a + reg.rCount[ri] - 1, hw = reg.rHw[ri], deck = (reg.rFlags[ri] & 2) !== 0;
      let inside = false;
      for (let q = a; q <= b && !inside; q++) if (px[q] > lx0 - 10 && px[q] < lx0 + s + 10 && py[q] > ly0 - 10 && py[q] < ly0 + s + 10) inside = true;
      if (!inside) continue;
      for (const side of [1, -1]) {
        const t = side > 0 ? xs[1] : xs[4];
        if (t !== 3) continue;
        const bw = (side > 0 ? xs[2] : xs[5]) / 10, buf = (side > 0 ? xs[3] : xs[6]) / 10;
        const off2 = side * (hw - bw - Math.max(buf, 0.4) / 2);
        let q = a;
        for (let k = Math.ceil((cum[a] + 8) / FLEX_GAP); k * FLEX_GAP < cum[b] - 8; k++) {
          const sk = k * FLEX_GAP;
          while (q < b - 1 && cum[q + 1] < sk) q++;
          const L2 = cum[q + 1] - cum[q];
          if (L2 < 0.01) continue;
          const f = (sk - cum[q]) / L2, tx = (px[q + 1] - px[q]) / L2, ty = (py[q + 1] - py[q]) / L2;
          const lx = px[q] + (px[q + 1] - px[q]) * f + ty * off2, ly = py[q] + (py[q + 1] - py[q]) * f - tx * off2;
          let mx = reg.x0 + lx, my = reg.y0 + ly;
          const surv = surveyed(reg, lx, ly);
          if (surv) {
            const kb = kerbsAt(reg, ri, sk - cum[a]);
            if (!kb && surveyPainted(reg, lx, ly)) continue;
            if (kb) {
              const o2 = kb.mid + side * (kb.hw - bw - Math.max(buf, 0.4) / 2);
              mx += ty * (o2 - off2);
              my -= tx * (o2 - off2);
            }
          }
          if (mx < reg.x0 + lx0 || mx >= reg.x0 + lx0 + s || my < reg.y0 + ly0 || my >= reg.y0 + ly0 + s) continue;
          let h;
          if (deck) {
            if (world2.nearestDeck(mx, my, pz[q] + 0.6) > -0.1 || world2._nd.road !== ri || world2._nd.reg !== reg) continue;
            h = world2._nd.z + 0.03;
          } else {
            const e2 = world2.nearestRoad(mx, my);
            if (surv ? e2 < 0 && (world2._nr.road !== ri || world2._nr.reg !== reg) : e2 > -0.1 || world2._nr.road !== ri || world2._nr.reg !== reg) continue;
            h = world2.groundH(mx, my, true);
            if (world2.g.water) continue;
          }
          put(mx, my, h, Math.atan2(tx, ty));
        }
      }
    }
  }
  function lampOnDeck(world2, mx, my, place) {
    const dd = world2.nearestRoadDeck(mx, my);
    if (dd > 12) return false;
    const nd = world2._nd, R2 = nd.reg, ri = nd.road, hw = nd.hw, side = nd.side, d = nd.d, z = nd.z, tx = nd.tx, ty = nd.ty, sAt = nd.s;
    const gz = world2.groundH(mx, my, true), water = world2.g.water;
    if (!water && z < gz + 2.5) return false;
    const wS = walkW(R2, ri, sAt - R2.cum[R2.rStart[ri]], side), walk = wS >= 1 ? wS : 0;
    if (!water && dd > walk + 0.42 && world2.nearestRoad(mx, my) < 3) return false;
    const par = hw + walk + 0.21;
    let d2 = d;
    if (d < hw + 0.7) d2 = walk ? hw + 0.7 : par;
    else if (d > par + 4.5) return true;
    else if (d > par) d2 = par;
    const sh = side * (d2 - d);
    place(mx + ty * sh, my - tx * sh, z + (walk && d2 > hw ? 0.18 : 0), Math.atan2(side * tx, -side * ty) + Math.PI / 2);
    return true;
  }
  function kerbSide(world2, mx, my, back, o) {
    if (world2.nearestRoad(mx, my) > 30) return false;
    const nr = world2._nr, R2 = nr.reg, ri = nr.road, lat = nr.side * nr.d, tx = nr.tx, ty = nr.ty;
    let left = -nr.hw, right = nr.hw;
    const kb = R2.streets ? kerbsAt(R2, ri, nr.s - R2.cum[R2.rStart[ri]]) : null;
    if (kb) {
      left = kb.left;
      right = kb.right;
    }
    const mid = (left + right) / 2, nl = lat >= mid ? Math.max(lat, right + back) : Math.min(lat, left - back);
    o.x = mx + ty * (nl - lat);
    o.y = my - tx * (nl - lat);
    const tw = mid > nl ? 1 : -1;
    o.yaw = Math.atan2(-tw * tx, tw * ty) + Math.PI / 2;
    return true;
  }
  var ks = { x: 0, y: 0, yaw: 0 };
  function signItems(world2, reg, mx0, my0, s, cx, cy, cz) {
    const f = reg.feat;
    const out = [], p32 = new Float64Array(3);
    const lx0 = mx0 - reg.x0, ly0 = my0 - reg.y0;
    flexPosts(world2, reg, lx0, ly0, s, (mx, my, h, yaw) => {
      cyl(mx, my, h, p32);
      out.push(p32[0] - cx, p32[1] - cy, p32[2] - cz, yaw, PART.FLEXPOST, 0, 0);
    });
    if (!f || !f.nP) return new Float32Array(out);
    let zD = null;
    const put = (mx, my, yaw, part, phase, arm, lift) => {
      let h;
      if (zD !== null) {
        if (world2.nearestDeck(mx, my, zD + 0.6) > 1.2) return;
        h = world2._nd.z + 0.86;
      } else {
        h = world2.groundH(mx, my, true);
        if (world2.g.water) return;
        if (world2.g.deck > -1e8 && world2.g.deck < h + 8 && world2.g.deck > h + 0.5) return;
      }
      cyl(mx, my, h + (lift || 0), p32);
      out.push(p32[0] - cx, p32[1] - cy, p32[2] - cz, yaw, part, phase, arm);
    };
    for (let i = 0; i < f.nP; i++) {
      const x = f.px[i], y = f.py[i];
      if (x < lx0 || x >= lx0 + s || y < ly0 || y >= ly0 + s) continue;
      const k = f.kind[i], mx = reg.x0 + x, my = reg.y0 + y;
      zD = deckOwner(world2, mx, my);
      if (k === SIGNAL || k === STOP || k === GIVEWAY || k === LEVEL) {
        const nroad = roadCount(f, i), junction = nroad >= 3;
        const cyc = hash2(i * 7 + 3, reg.x0 * 0.013 + reg.y0 * 7e-3);
        for (let j = f.first[i], e = j + f.napp[i]; j < e; j++) {
          if (f.apFoot[j] || !f.apFace[j]) continue;
          const t = f.apH[j], dx = Math.cos(t), dy = Math.sin(t);
          const hw = hwAt(world2, mx - dx * 10, my - dy * 10, zD) || 4;
          let back = junction ? junctionBack(world2, f, i, mx, my, j, zD) + (k === SIGNAL ? 2.6 : 1.6) : 0;
          if (k === LEVEL) back = 4.5;
          const side = hw + (k === SIGNAL ? 1 : 0.7);
          const ox = mx - dx * back + dy * side, oy = my - dy * back - dx * side;
          if (k === SIGNAL) {
            const tm = (t % Math.PI + Math.PI) % Math.PI;
            const phase = (cyc + (tm > Math.PI / 4 && tm < 3 * Math.PI / 4 ? 0.5 : 0)) % 1;
            const reach = f.apOne[j] ? 2 * hw : hw;
            put(ox, oy, t - Math.PI / 2, reach > 7.5 ? PART.SIGNAL_LONG : PART.SIGNAL, phase, reach);
          } else put(ox, oy, t - Math.PI / 2, k === STOP ? PART.STOP : k === GIVEWAY ? PART.YIELD : PART.CROSSBUCK, 0, 0);
        }
      } else if (k === HYDRANT) {
        if (zD === null && kerbSide(world2, mx, my, 0.6, ks)) put(ks.x, ks.y, ks.yaw, PART.HYDRANT, 0, 0);
        else put(mx, my, hash2(i, 5) * 6.28, PART.HYDRANT, 0, 0);
      } else if (k === BUSSTOP || k === LAMP) {
        const part = k === LAMP ? lampPart(f.sub[i]) : f.sub[i] ? PART.SHELTER : PART.BUS;
        if (part < 0) continue;
        const ht = k === LAMP ? f.h[i] : 0;
        if (k === LAMP && lampOnDeck(world2, mx, my, (x2, y2, h, yaw) => {
          cyl(x2, y2, h, p32);
          out.push(p32[0] - cx, p32[1] - cy, p32[2] - cz, yaw, part, 0, ht);
        })) continue;
        if (!kerbSide(world2, mx, my, k === BUSSTOP ? 1.3 : 0.7, ks)) {
          put(mx, my, hash2(i, 3) * 6.28, part, 0, ht);
          continue;
        }
        put(ks.x, ks.y, ks.yaw, part, 0, ht);
      } else if (k === FLAGPOLE) {
        put(mx, my, hash2(i, 9) * 6.28, PART.FLAGPOLE, f.h[i] || 0, 0);
      } else if (k === BENCH) {
        const sb = f.sub[i], back = sb & 1, mat = sb >> 1 & 3;
        const part = mat === 2 ? PART.BENCH_STONE : mat === 1 ? back ? PART.BENCH_METAL : PART.BENCH_METAL_BARE : back ? PART.BENCH : PART.BENCH_BARE;
        if (sb & 8) put(mx, my, (sb >> 4 & 15) * Math.PI / 8 + Math.PI / 2, part, 0, 0);
        else if (zD === null && world2.nearestRoad(mx, my) < 12 && kerbSide(world2, mx, my, 0.6, ks)) put(ks.x, ks.y, ks.yaw, part, 0, 0);
        else put(mx, my, hash2(i, 7) * 6.28, part, 0, 0);
      } else if (k === BIKEPARK || k === BIKESHARE) {
        const t = f.sub[i], cap = Math.round(f.h[i] * 2), share = k === BIKESHARE;
        if (!share && t === 3) continue;
        const n = share ? clamp2(cap || 15, 4, 40) : t === 2 ? clamp2(cap || 2, 1, 12) : clamp2(Math.ceil((cap || 4) / 2), 1, 12);
        const gap = share ? 0.75 : t === 2 ? 1.2 : 0.9, part = share ? PART.DOCK : t === 2 ? PART.BIKE_POST : PART.BIKE_HOOP;
        let x2 = mx, y2 = my, yaw = hash2(i, 13) * 6.28, tx = Math.cos(yaw), ty = Math.sin(yaw);
        if (zD === null && world2.nearestRoad(mx, my) < 15 && kerbSide(world2, mx, my, share ? -100 : 0.6, ks)) {
          x2 = ks.x;
          y2 = ks.y;
          yaw = ks.yaw;
          tx = world2._nr.tx;
          ty = world2._nr.ty;
        }
        for (let j = 0; j < n; j++) {
          const o = (j - (n - 1) / 2) * gap;
          put(x2 + tx * o, y2 + ty * o, yaw, part, 0, 0);
        }
        if (share) {
          const o = ((n - 1) / 2 + 1.1) * gap;
          put(x2 + tx * o, y2 + ty * o, yaw, PART.KIOSK, 0, 0);
        }
      } else if (k === BOLLARD) {
        const t = f.sub[i];
        put(mx, my, hash2(i, 11) * 6.28, t === 3 ? PART.FLEXPOST : t ? PART.BOLLARD_STEEL : PART.BOLLARD, 0, 0);
      }
    }
    return new Float32Array(out);
  }
  function surveyed(reg, lx, ly) {
    const st2 = reg.streets;
    if (!st2) return false;
    const cx = Math.floor(lx / st2.covCell), cy = Math.floor(ly / st2.covCell);
    return cx >= 0 && cy >= 0 && cx < st2.covW && cy < st2.covW && (st2.cov[cy * st2.rowB + (cx >> 3)] >> (cx & 7) & 1) === 1;
  }
  function surveyPainted(reg, lx, ly) {
    const st2 = reg.streets;
    if (!st2) return false;
    const cx = Math.floor(lx / st2.covCell), cy = Math.floor(ly / st2.covCell);
    const bm = st2.paint || st2.cov;
    return cx >= 0 && cy >= 0 && cx < st2.covW && cy < st2.covW && (bm[cy * st2.rowB + (cx >> 3)] >> (cx & 7) & 1) === 1;
  }
  function paintTris(world2, reg, mx0, my0, s, cx, cy, cz) {
    const f = reg.feat;
    if (!f || !f.nP) return new Float32Array(0);
    const out = [], p32 = new Float64Array(3), u3 = new Float64Array(3);
    const lx0 = mx0 - reg.x0, ly0 = my0 - reg.y0;
    const WHITE = [0.78, 0.78, 0.74];
    let zD = null;
    const quad = (ox, oy, dx, dy, a0, a1, c0, c1, col) => {
      const n = Math.max(1, Math.ceil((c1 - c0) / 2));
      const P2 = [];
      for (let q = 0; q <= n; q++) {
        const c = c0 + (c1 - c0) * q / n;
        for (const a of [a0, a1]) {
          const x = ox + dx * a + dy * c, y = oy + dy * a - dx * c;
          const h = surfaceH(world2, x, y, zD);
          cyl(x, y, h + 0.03, p32);
          cyl(x, y, h + 1.03, u3);
          P2.push([p32[0] - cx, p32[1] - cy, p32[2] - cz, u3[0] - p32[0], u3[1] - p32[1], u3[2] - p32[2]]);
        }
      }
      const v = (p) => out.push(p[0], p[1], p[2], p[3], p[4], p[5], col[0], col[1], col[2]);
      for (let q = 0; q < n; q++) {
        const A = P2[q * 2], B = P2[q * 2 + 1], C2 = P2[q * 2 + 2], D2 = P2[q * 2 + 3];
        v(A);
        v(D2);
        v(B);
        v(A);
        v(C2);
        v(D2);
      }
    };
    for (let i = 0; i < f.nP; i++) {
      const x = f.px[i], y = f.py[i];
      if (x < lx0 || x >= lx0 + s || y < ly0 || y >= ly0 + s) continue;
      if (surveyPainted(reg, x, y)) continue;
      const k = f.kind[i], mx = reg.x0 + x, my = reg.y0 + y;
      zD = deckOwner(world2, mx, my);
      if (k === CROSSING) {
        let hw;
        if (zD !== null) {
          world2.nearestDeck(mx, my, zD + 0.6);
          hw = world2._nd.hw;
        } else {
          const d = world2.nearestRoad(mx, my);
          if (d > 2.5) continue;
          hw = world2._nr.hw;
        }
        if (hw < 2.2) continue;
        let t = null;
        for (let j = f.first[i], e = j + f.napp[i]; j < e; j++) if (!f.apFoot[j]) {
          t = f.apH[j];
          break;
        }
        if (t === null) continue;
        const dx = Math.cos(t), dy = Math.sin(t);
        world2.groundH(mx, my, true);
        if (zD === null && world2.g.water) continue;
        const sub = f.sub[i], lines = sub === 3 || sub === 5 || sub === 4, bars = sub === 2 || sub === 1 || sub === 7;
        if (lines || sub === 1 || sub === 7) {
          for (const a of [-1.65, 1.35]) {
            if (sub !== 4) {
              quad(mx, my, dx, dy, a, a + 0.3, -hw, hw, WHITE);
              continue;
            }
            for (let c = -hw; c < hw - 0.2; c += 1.2) quad(mx, my, dx, dy, a, a + 0.3, c, Math.min(c + 0.6, hw), WHITE);
          }
        }
        if (bars) {
          const nb = Math.max(2, Math.floor((2 * hw - 0.3) / 1.2));
          const c0 = -nb * 0.6 + 0.3, a0 = sub === 2 ? -1.5 : -1.3, a1 = sub === 2 ? 1.5 : 1.3;
          for (let b = 0; b < nb; b++) quad(mx, my, dx, dy, a0, a1, c0 + b * 1.2 - 0.3, c0 + b * 1.2 + 0.3, WHITE);
        }
      } else if (k === STOP || k === SIGNAL) {
        const junction = roadCount(f, i) >= 3;
        for (let j = f.first[i], e = j + f.napp[i]; j < e; j++) {
          if (f.apFoot[j] || !f.apFace[j]) continue;
          const t = f.apH[j], dx = Math.cos(t), dy = Math.sin(t);
          const hw = hwAt(world2, mx - dx * 10, my - dy * 10, zD);
          if (hw < 2.5) continue;
          const back = (junction ? junctionBack(world2, f, i, mx, my, j, zD) + (k === SIGNAL ? 2.6 : 1.6) : 0) + 0.6;
          quad(mx, my, dx, dy, -back - 0.45, -back, f.apOne[j] ? -hw + 0.3 : 0.15, hw - 0.3, WHITE);
        }
      }
    }
    return new Float32Array(out);
  }
  function towerKind(f, l, v) {
    const vk = f.lk[v], kv = f.lKv[l];
    if (f.lKind[l] === 1) return TOWER.POLE;
    if (vk === 1) return f.lCab[l] >= 6 ? TOWER.LATTICE2 : kv >= 100 || kv === 0 ? TOWER.LATTICE : TOWER.HFRAME;
    if (vk === 2) return kv >= 60 ? TOWER.HFRAME : TOWER.POLE;
    return kv >= 100 ? f.lCab[l] >= 6 ? TOWER.LATTICE2 : TOWER.LATTICE : kv >= 60 ? TOWER.HFRAME : TOWER.POLE;
  }
  function across(f, l, v) {
    const a = f.lStart[l], e = a + f.lCount[l] - 1;
    const p = Math.max(a, v - 1), n = Math.min(e, v + 1);
    let dx = f.lx[n] - f.lx[p], dy = f.ly[n] - f.ly[p];
    const L2 = Math.hypot(dx, dy) || 1;
    dx /= L2;
    dy /= L2;
    return [dy, -dx];
  }
  function powerItems(world2, reg, mx0, my0, s, cx, cy, cz) {
    const f = reg.feat;
    if (!f || !f.nL) return new Float32Array(0);
    const out = [], p32 = new Float64Array(3);
    for (let l = 0; l < f.nL; l++) {
      const a = f.lStart[l], e = a + f.lCount[l];
      for (let v = a; v < e; v++) {
        const mx = reg.x0 + f.lx[v], my = reg.y0 + f.ly[v];
        if (mx < mx0 || mx >= mx0 + s || my < my0 || my >= my0 + s) continue;
        if (f.lk[v] === 3) continue;
        const h = world2.groundH(mx, my, true);
        if (world2.g.water && f.lk[v] === 0) continue;
        const [ax, ay] = across(f, l, v);
        cyl(mx, my, h, p32);
        out.push(p32[0] - cx, p32[1] - cy, p32[2] - cz, Math.atan2(ay, ax), towerKind(f, l, v));
      }
    }
    return new Float32Array(out);
  }
  function powerWires(world2, reg, mx0, my0, s, cx, cy, cz) {
    const f = reg.feat;
    if (!f || !f.nL) return new Float32Array(0);
    const out = [], p32 = new Float64Array(3);
    for (let l = 0; l < f.nL; l++) {
      const a = f.lStart[l], e = a + f.lCount[l];
      for (let v = a; v < e - 1; v++) {
        const mx = reg.x0 + f.lx[v], my = reg.y0 + f.ly[v];
        if (mx < mx0 || mx >= mx0 + s || my < my0 || my >= my0 + s) continue;
        const nx = reg.x0 + f.lx[v + 1], ny = reg.y0 + f.ly[v + 1];
        const span = Math.hypot(nx - mx, ny - my);
        if (span < 1 || span > 1500) continue;
        const kA = towerKind(f, l, v), kB = towerKind(f, l, v + 1);
        const hA = world2.groundH(mx, my, true), hB = world2.groundH(nx, ny, true);
        const [aax, aay] = across(f, l, v), [bax, bay] = across(f, l, v + 1);
        const HA = HANG[kA], HB = HANG[kB];
        const lowA = f.lk[v] === 3 ? 0.55 : 1, lowB = f.lk[v + 1] === 3 ? 0.55 : 1;
        const nw = Math.min(HA.length, HB.length);
        const sag = clamp2(span * span * 11e-5, 0.25, 16);
        const segs = span > 260 ? 12 : span > 90 ? 8 : 5;
        for (let w = 0; w < nw; w++) {
          const [cA, uA] = HA[w], [cB, uB] = HB[w];
          let x0 = 0, y0 = 0, z0 = 0;
          for (let q = 0; q <= segs; q++) {
            const u = q / segs;
            const x = mx + (nx - mx) * u + (aax * cA * (1 - u) + bax * cB * u), y = my + (ny - my) * u + (aay * cA * (1 - u) + bay * cB * u);
            const z = (hA + uA * lowA) * (1 - u) + (hB + uB * lowB) * u - 4 * sag * u * (1 - u);
            cyl(x, y, z, p32);
            const X = p32[0] - cx, Y = p32[1] - cy, Z = p32[2] - cz;
            if (q > 0) out.push(x0, y0, z0, X, Y, Z);
            x0 = X;
            y0 = Y;
            z0 = Z;
          }
        }
      }
    }
    return new Float32Array(out);
  }
  var A_PITCH = 0;
  var A_TRACK = 1;
  var A_POOL = 2;
  var A_GOLF = 4;
  var A_PLAYGROUND = 5;
  var A_SPACE = 6;
  var S_BASEBALL = 1;
  var S_SOCCER = 2;
  var S_FOOTBALL = 3;
  var S_TENNIS = 4;
  var S_BASKETBALL = 5;
  var S_RUNNING = 6;
  var S_PICKLEBALL = 8;
  var S_VOLLEYBALL = 9;
  var S_GOLF = 10;
  var S_SKATE = 11;
  var S_HOCKEY = 13;
  var LC_GROUND = { TURF: 20, ARTIFICIAL: 21, COURT: 22, ASPHALT: 23, CLAY: 24, TRACK: 25, POOL: 26, GREEN: 27, FAIRWAY: 28, ROUGH: 29, PLAY: 30, INFIELD: 31 };
  function areaCode(kind, sub) {
    const sp = sub & 15, sf = sub >> 4, G = LC_GROUND;
    if (kind === A_PITCH || kind === A_TRACK) {
      const court = kind === A_PITCH && (sp === S_TENNIS || sp === S_PICKLEBALL);
      if (sf === 1) return G.TURF;
      if (sf === 2) return G.ARTIFICIAL;
      if (sf === 3) return court ? G.COURT : G.ASPHALT;
      if (sf === 4) return G.COURT;
      if (sf === 5) return kind === A_TRACK ? 14 : G.CLAY;
      if (sf === 6) return 13;
      if (sf === 7) return 14;
      if (sf === 8) return G.TRACK;
      if (kind === A_TRACK) return sp === 0 ? G.TRACK : 14;
      if (court) return G.COURT;
      if (sp === S_BASKETBALL || sp === S_SKATE || sp === S_HOCKEY) return G.ASPHALT;
      if (sp === S_VOLLEYBALL) return 13;
      if (sp === S_GOLF) return G.GREEN;
      if (sp === S_RUNNING) return G.TRACK;
      return G.TURF;
    }
    if (kind === A_POOL) return G.POOL;
    if (kind === A_GOLF) return [0, G.GREEN, G.FAIRWAY, 13, G.FAIRWAY, G.ROUGH, 15, G.FAIRWAY][sub] || 0;
    if (kind === A_PLAYGROUND) return G.PLAY;
    return 0;
  }
  function paintAreas(reg, lc, lcN, mx0, my0, s) {
    const f = reg && reg.feat;
    if (!f || !f.nA) return [lc, lcN];
    const lx0 = mx0 - reg.x0, ly0 = my0 - reg.y0;
    const list = [];
    for (let a = 0; a < f.nA; a++) {
      const b = a * 4;
      if (f.aBox[b + 2] < lx0 || f.aBox[b] > lx0 + s || f.aBox[b + 3] < ly0 || f.aBox[b + 1] > ly0 + s) continue;
      const code = areaCode(f.aKind[a], f.aSub[a]);
      if (code) list.push([(f.aBox[b + 2] - f.aBox[b]) * (f.aBox[b + 3] - f.aBox[b + 1]), a, code, f.aKind[a] === A_PITCH && (f.aSub[a] & 15) === S_BASEBALL]);
    }
    if (!list.length) return [lc, lcN];
    list.sort((p, q) => q[0] - p[0]);
    if (!lc) {
      lcN = Math.min(368, Math.round(s));
      lc = new Uint8Array(lcN * lcN);
    }
    const px = s / lcN, xs = [];
    for (const [, a, code, ball] of list) {
      const soft = code === LC_GROUND.TURF;
      const b = a * 4;
      const j0 = Math.max(0, Math.floor((f.aBox[b + 1] - ly0) / px)), j1 = Math.min(lcN - 1, Math.floor((f.aBox[b + 3] - ly0) / px));
      for (let j = j0; j <= j1; j++) {
        const y = ly0 + (j + 0.5) * px;
        xs.length = 0;
        for (let r = f.aRing[a], re = r + f.aRings[a]; r < re; r++) {
          const v0 = f.rStart[r], n = f.rCount[r];
          for (let k = 0; k < n; k++) {
            const p = v0 + k, q = v0 + (k + 1) % n;
            const ya = f.ay[p], yb = f.ay[q];
            if (ya > y === yb > y) continue;
            xs.push(f.ax[p] + (y - ya) / (yb - ya) * (f.ax[q] - f.ax[p]));
          }
        }
        if (xs.length < 2) continue;
        xs.sort((p, q) => p - q);
        for (let k = 0; k + 1 < xs.length; k += 2) {
          const i0 = Math.max(0, Math.ceil((xs[k] - lx0) / px - 0.5)), i1 = Math.min(lcN - 1, Math.floor((xs[k + 1] - lx0) / px - 0.5));
          if (!soft) {
            for (let i = i0; i <= i1; i++) lc[j * lcN + i] = code;
            continue;
          }
          for (let i = i0; i <= i1; i++) {
            const c = lc[j * lcN + i];
            lc[j * lcN + i] = c === 14 ? ball ? LC_GROUND.INFIELD : 14 : c === 1 ? 1 : code;
          }
        }
      }
    }
    return [lc, lcN];
  }
  function obb(f, a) {
    const r = f.aRing[a], v0 = f.rStart[r], n = f.rCount[r];
    if (n < 3) return null;
    const P2 = [];
    for (let k = 0; k < n; k++) P2.push([f.ax[v0 + k], f.ay[v0 + k]]);
    P2.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
    const cr = (o, p, q) => (p[0] - o[0]) * (q[1] - o[1]) - (p[1] - o[1]) * (q[0] - o[0]);
    const lo = [], hi = [];
    for (const p of P2) {
      while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop();
      lo.push(p);
    }
    for (let k = P2.length - 1; k >= 0; k--) {
      const p = P2[k];
      while (hi.length >= 2 && cr(hi[hi.length - 2], hi[hi.length - 1], p) <= 0) hi.pop();
      hi.push(p);
    }
    const H = lo.slice(0, -1).concat(hi.slice(0, -1));
    if (H.length < 3) return null;
    let best = null;
    for (let k = 0; k < H.length; k++) {
      const p = H[k], q = H[(k + 1) % H.length];
      let ux2 = q[0] - p[0], uy2 = q[1] - p[1];
      const l = Math.hypot(ux2, uy2);
      if (l < 1e-6) continue;
      ux2 /= l;
      uy2 /= l;
      let a02 = 1e9, a12 = -1e9, b02 = 1e9, b12 = -1e9;
      for (const h of H) {
        const s = h[0] * ux2 + h[1] * uy2, t = -h[0] * uy2 + h[1] * ux2;
        a02 = Math.min(a02, s);
        a12 = Math.max(a12, s);
        b02 = Math.min(b02, t);
        b12 = Math.max(b12, t);
      }
      const area = (a12 - a02) * (b12 - b02);
      if (!best || area < best[0]) best = [area, ux2, uy2, a02, a12, b02, b12];
    }
    if (!best) return null;
    let [, ux, uy, a0, a1, b0, b1] = best;
    const sa = (a0 + a1) / 2, sb = (b0 + b1) / 2;
    const cx = sa * ux - sb * uy, cy = sa * uy + sb * ux;
    let L2 = a1 - a0, W = b1 - b0;
    if (W > L2) {
      [L2, W] = [W, L2];
      [ux, uy] = [-uy, ux];
    }
    return [cx, cy, ux, uy, L2, W];
  }
  function groundPaint(world2, reg, mx0, my0, s, cx, cy, cz) {
    const f = reg.feat;
    if (!f || !f.nA) return new Float32Array(0);
    const out = [], p32 = new Float64Array(3), u3 = new Float64Array(3), WHITE = [0.78, 0.78, 0.74];
    const lx0 = mx0 - reg.x0, ly0 = my0 - reg.y0;
    const vtx = (x, y) => {
      const h = world2.groundH(x, y, true);
      cyl(x, y, h + 0.03, p32);
      cyl(x, y, h + 1.03, u3);
      return [p32[0] - cx, p32[1] - cy, p32[2] - cz, u3[0] - p32[0], u3[1] - p32[1], u3[2] - p32[2]];
    };
    const push = (p, col) => out.push(p[0], p[1], p[2], p[3], p[4], p[5], col[0], col[1], col[2]);
    const strip = (x0, y0, x1, y1, w, col = WHITE) => {
      const L2 = Math.hypot(x1 - x0, y1 - y0);
      if (L2 < 0.05) return;
      const ux = (x1 - x0) / L2, uy = (y1 - y0) / L2, nx = -uy * w / 2, ny = ux * w / 2;
      const n = Math.max(1, Math.ceil(L2 / 2));
      let A = vtx(x0 - nx, y0 - ny), B = vtx(x0 + nx, y0 + ny);
      for (let k = 1; k <= n; k++) {
        const t = k / n, x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
        const C2 = vtx(x - nx, y - ny), D2 = vtx(x + nx, y + ny);
        push(A, col);
        push(C2, col);
        push(D2, col);
        push(A, col);
        push(D2, col);
        push(B, col);
        A = C2;
        B = D2;
      }
    };
    for (let a = 0; a < f.nA; a++) {
      const kind = f.aKind[a], sp = f.aSub[a] & 15;
      const field = kind === A_PITCH && (sp === S_TENNIS || sp === S_PICKLEBALL || sp === S_SOCCER || sp === S_FOOTBALL || sp === S_BASKETBALL);
      if (!field && kind !== A_SPACE) continue;
      const b = a * 4;
      if (f.aBox[b + 2] < lx0 || f.aBox[b] > lx0 + s || f.aBox[b + 3] < ly0 || f.aBox[b + 1] > ly0 + s) continue;
      if (f.aBox[b + 2] - f.aBox[b] > 250 || f.aBox[b + 3] - f.aBox[b + 1] > 250) continue;
      if (kind === A_SPACE && surveyPainted(reg, (f.aBox[b] + f.aBox[b + 2]) / 2, (f.aBox[b + 1] + f.aBox[b + 3]) / 2)) continue;
      const o = obb(f, a);
      if (!o) continue;
      const [ocx, ocy, ux, uy, L2, W] = o;
      if (ocx < lx0 || ocx >= lx0 + s || ocy < ly0 || ocy >= ly0 + s) continue;
      const X = reg.x0 + ocx, Y = reg.y0 + ocy, vx = -uy, vy = ux;
      const at = (p, q) => [X + ux * p + vx * q, Y + uy * p + vy * q];
      const seg = (p0, q0, p1, q1, w) => {
        const A = at(p0, q0), B = at(p1, q1);
        strip(A[0], A[1], B[0], B[1], w);
      };
      const rect = (p0, q0, p1, q1, w) => {
        seg(p0, q0, p1, q0, w);
        seg(p1, q0, p1, q1, w);
        seg(p1, q1, p0, q1, w);
        seg(p0, q1, p0, q0, w);
      };
      const arc = (pc, qc, r, t0, t1, w) => {
        const n = Math.max(6, Math.ceil(Math.abs(t1 - t0) * r / 1.5));
        for (let k = 0; k < n; k++) {
          const ta = t0 + (t1 - t0) * k / n, tb = t0 + (t1 - t0) * (k + 1) / n;
          seg(pc + r * Math.cos(ta), qc + r * Math.sin(ta), pc + r * Math.cos(tb), qc + r * Math.sin(tb), w);
        }
      };
      if (kind === A_SPACE) {
        if (L2 > 9 || W > 5 || L2 < 3.5) continue;
        seg(-L2 / 2, -W / 2, L2 / 2, -W / 2, 0.1);
        seg(-L2 / 2, W / 2, L2 / 2, W / 2, 0.1);
        continue;
      }
      if (sp === S_TENNIS || sp === S_PICKLEBALL) {
        const tn = sp === S_TENNIS, cl = tn ? 23.77 : 13.41, cw = tn ? 10.97 : 6.1, pitchL = tn ? 34 : 18.3, pitchW = tn ? 16.8 : 9.1;
        const fit = (A, B) => {
          const nl = Math.max(1, Math.round(A / pitchL)), nw = Math.max(1, Math.round(B / pitchW));
          return [nl, nw, Math.abs(A / nl - pitchL) / pitchL + Math.abs(B / nw - pitchW) / pitchW + 0.05 * (nl - 1)];
        };
        const fa = fit(L2, W), fb = fit(W, L2), turn = fb[2] < fa[2];
        const AL = turn ? W : L2, AW = turn ? L2 : W, nL = turn ? fb[0] : fa[0], nW = turn ? fb[1] : fa[1];
        const sl = AL / nL, sw = AW / nW, k = Math.min(1, (sl - 0.4) / cl, (sw - 0.4) / cw);
        if (k < 0.6) continue;
        const hl = cl * k / 2, hw = cw * k / 2;
        const seg0 = seg;
        const sg = turn ? (p0, q0, p1, q1, w) => seg0(q0, p0, q1, p1, w) : seg0;
        const rc = (p0, q0, p1, q1, w) => {
          sg(p0, q0, p1, q0, w);
          sg(p1, q0, p1, q1, w);
          sg(p1, q1, p0, q1, w);
          sg(p0, q1, p0, q0, w);
        };
        for (let i = 0; i < nL; i++) for (let j = 0; j < nW; j++) {
          const pc = -AL / 2 + (i + 0.5) * sl, qc = -AW / 2 + (j + 0.5) * sw;
          const seg2 = sg;
          rc(pc - hl, qc - hw, pc + hl, qc + hw, 0.07);
          if (tn) {
            const hs = 8.23 * k / 2, sv = 6.4 * k;
            seg2(pc - hl, qc - hs, pc + hl, qc - hs, 0.05);
            seg2(pc - hl, qc + hs, pc + hl, qc + hs, 0.05);
            seg2(pc - sv, qc - hs, pc - sv, qc + hs, 0.05);
            seg2(pc + sv, qc - hs, pc + sv, qc + hs, 0.05);
            seg2(pc - sv, qc, pc + sv, qc, 0.05);
            seg2(pc - hl, qc, pc - hl + 0.1, qc, 0.05);
            seg2(pc + hl - 0.1, qc, pc + hl, qc, 0.05);
          } else {
            const kz = 2.13 * k;
            seg2(pc - kz, qc - hw, pc - kz, qc + hw, 0.05);
            seg2(pc + kz, qc - hw, pc + kz, qc + hw, 0.05);
            seg2(pc - hl, qc, pc - kz, qc, 0.05);
            seg2(pc + kz, qc, pc + hl, qc, 0.05);
          }
        }
      } else if (sp === S_BASKETBALL) {
        const full = L2 > 19;
        const k = Math.min(1, (L2 - 0.6) / (full ? 28.65 : 14.3), (W - 0.6) / 15.24);
        if (k < 0.45) continue;
        const hl = (full ? 28.65 : 14.3) * k / 2, hw = 15.24 * k / 2;
        rect(-hl, -hw, hl, hw, 0.05);
        const ends = full ? [-1, 1] : [-1];
        if (full) {
          seg(0, -hw, 0, hw, 0.05);
          arc(0, 0, 1.83 * k, 0, 2 * Math.PI, 0.05);
        } else seg(hl, -hw, hl, hw, 0.05);
        for (const e of ends) {
          const base = e * hl, inw = -e;
          const key2 = 5.79 * k, kw = 4.88 * k / 2;
          seg(base, -kw, base + inw * key2, -kw, 0.05);
          seg(base, kw, base + inw * key2, kw, 0.05);
          seg(base + inw * key2, -kw, base + inw * key2, kw, 0.05);
          arc(base + inw * key2, 0, 1.83 * k, inw > 0 ? -Math.PI / 2 : Math.PI / 2, inw > 0 ? Math.PI / 2 : 3 * Math.PI / 2, 0.05);
          const hoop = base + inw * 1.6 * k, r3 = Math.min(7.24 * k, hw - 0.3), qs = Math.min(6.7 * k, hw - 0.3);
          const tc = Math.asin(Math.min(1, qs / r3)), pend = hoop + inw * r3 * Math.cos(tc);
          seg(base, -qs, pend, -qs, 0.05);
          seg(base, qs, pend, qs, 0.05);
          if (inw > 0) arc(hoop, 0, r3, -tc, tc, 0.05);
          else arc(hoop, 0, r3, Math.PI - tc, Math.PI + tc, 0.05);
        }
      } else if (sp === S_SOCCER) {
        const k = Math.min(1, L2 / 105, W / 68), hl = L2 / 2 - 0.5, hw = W / 2 - 0.5;
        if (L2 < 30) continue;
        rect(-hl, -hw, hl, hw, 0.12);
        seg(0, -hw, 0, hw, 0.12);
        arc(0, 0, 9.15 * k, 0, 2 * Math.PI, 0.12);
        for (const e of [-1, 1]) {
          const g = e * hl, inw = -e, pa = 16.5 * k, pw = Math.min(hw, 20.16 * k), ga = 5.5 * k, gw = Math.min(hw, 9.16 * k);
          seg(g + inw * pa, -pw, g + inw * pa, pw, 0.12);
          seg(g, -pw, g + inw * pa, -pw, 0.12);
          seg(g, pw, g + inw * pa, pw, 0.12);
          seg(g + inw * ga, -gw, g + inw * ga, gw, 0.12);
          seg(g, -gw, g + inw * ga, -gw, 0.12);
          seg(g, gw, g + inw * ga, gw, 0.12);
          const spot = g + inw * 11 * k, r = 9.15 * k, t = Math.acos(Math.min(1, (pa - 11 * k) / r));
          if (inw > 0) arc(spot, 0, r, -t, t, 0.12);
          else arc(spot, 0, r, Math.PI - t, Math.PI + t, 0.12);
          seg(spot - 0.11, 0, spot + 0.11, 0, 0.22);
        }
      } else if (sp === S_FOOTBALL) {
        if (L2 < 60) continue;
        const k = Math.min(1, (L2 - 1) / 109.73), hl = 109.73 * k / 2, hw = Math.min(W / 2 - 0.5, 24.38);
        rect(-hl, -hw, hl, hw, 0.12);
        const gl = 45.72 * k;
        for (let yd = -50; yd <= 50; yd += 5) seg(yd / 50 * gl, -hw, yd / 50 * gl, hw, 0.12);
        for (let yd = -49; yd <= 49; yd++) {
          if (yd % 5 === 0) continue;
          const p = yd / 50 * gl;
          for (const q of [-hw + 0.6, -8.13 * k, 8.13 * k, hw - 0.6]) seg(p, q - 0.3, p, q + 0.3, 0.1);
        }
      }
    }
    return new Float32Array(out);
  }
  var RAIL_STEP = 2;
  var C_BEAM = [0.4, 0.42, 0.42];
  var C_POST = [0.28, 0.29, 0.3];
  var C_BLOCK = [0.12, 0.09, 0.065];
  var C_CONC = [0.34, 0.33, 0.31];
  var C_TUBE = [0.4, 0.43, 0.45];
  var HEX = [0, 1, 2, 3, 4, 5].map((k) => [-0.15 + 0.075 * Math.cos(k * Math.PI / 3), 0.92 + 0.075 * Math.sin(k * Math.PI / 3)]);
  var RAIL = [
    {
      // 0: a steel W-beam guard rail on the ground
      polys: [{ pts: [[0, 0.48], [0.083, 0.54], [0.02, 0.635], [0.083, 0.73], [0, 0.79]], col: C_BEAM }],
      out: 0.3,
      gap: 1.905,
      posts: [{ a: [-0.35, -0.2], b: [-0.05, 0.74], hl: 0.075, col: C_POST }, { a: [-0.2, 0], b: [0.46, 0.8], hl: 0.075, col: C_BLOCK }]
    },
    {
      // 1: a New Jersey concrete barrier
      polys: [{ pts: [[-0.61, 0], [0, 0], [0, 0.076], [-0.178, 0.33], [-0.228, 0.81], [-0.382, 0.81], [-0.432, 0.33], [-0.61, 0.076]], col: C_CONC, cap: true }],
      out: 0.05,
      gap: 0,
      posts: []
    },
    {
      // 2: on a bridge, along the kerb: a concrete curb and a steel rail on posts over it
      polys: [{ pts: [[-0.3, 0], [0, 0], [0, 0.48], [-0.3, 0.48]], col: C_CONC, cap: true }, { pts: HEX, col: C_TUBE }],
      out: 0,
      gap: 2.4,
      posts: [{ a: [-0.19, -0.11], b: [0.48, 0.92], hl: 0.04, col: C_TUBE }]
    }
  ];
  function railPoint(world2, mx, my, layer, kind, o) {
    o.look = -1;
    o.rdx = 0;
    o.rdy = 0;
    o.x = mx;
    o.y = my;
    if (layer < 0 && world2.nearestTunnel(mx, my) < 3) return o;
    const dd = world2.nearestDeck(mx, my);
    if (dd < 8) {
      const nd = world2._nd, R2 = nd.reg, ri = nd.road, hw = nd.hw, side = nd.side, lat = side * nd.d, z = nd.z, tx = nd.tx, ty = nd.ty, sAt = nd.s;
      const gz = world2.groundH(mx, my, true), high = world2.g.water || z > gz + 2;
      let onDeck = high && layer >= 1;
      if (high && !onDeck && dd < 2.5) onDeck = world2.nearestRoad(mx, my) > 8;
      if (onDeck) {
        if (R2.rCls[ri] >= 14) return o;
        const wS = walkW(R2, ri, sAt - R2.cum[R2.rStart[ri]], side);
        o.z = z;
        if (Math.abs(lat) < hw - 1) {
          o.look = kind;
          return o;
        }
        if (wS < 1) return o;
        const sh = side * hw - lat;
        o.x = mx + ty * sh;
        o.y = my - tx * sh;
        o.rdx = -side * ty;
        o.rdy = side * tx;
        o.look = kind === 1 ? 1 : 2;
        return o;
      }
    }
    const look = kind === 1 ? 1 : 0, e = world2.nearestRoad(mx, my);
    if (e < 15) {
      const nr = world2._nr, R2 = nr.reg, ri = nr.road, lat = nr.side * nr.d, tx = nr.tx, ty = nr.ty;
      let left = -nr.hw, right = nr.hw;
      const kb = R2.streets ? kerbsAt(R2, ri, nr.s - R2.cum[R2.rStart[ri]]) : null;
      if (kb) {
        left = kb.left;
        right = kb.right;
      }
      const mid = (left + right) / 2, half = (right - left) / 2, out = RAIL[look].out;
      let nl = lat;
      if (Math.abs(lat - mid) >= half - 1.5) {
        if (lat >= mid && lat < right + out) nl = right + out;
        else if (lat < mid && lat > left - out) nl = left - out;
      }
      if (nl !== lat) {
        o.x = mx + ty * (nl - lat);
        o.y = my - tx * (nl - lat);
        if (world2.nearestRoad(o.x, o.y) < -0.05 && (world2._nr.road !== ri || world2._nr.reg !== R2)) {
          o.x = mx;
          o.y = my;
          nl = lat;
        }
      }
      const tw = mid > nl ? 1 : -1;
      o.rdx = tw * ty;
      o.rdy = -tw * tx;
    }
    o.z = world2.groundH(o.x, o.y, true);
    if (world2.g.water) return o;
    o.look = look;
    return o;
  }
  function railTris(world2, reg, mx0, my0, s, cx, cy, cz) {
    const f = reg.feat;
    if (!f || !f.nG) return new Float32Array(0);
    const out = [], WIN = 40;
    const lx0 = mx0 - reg.x0, ly0 = my0 - reg.y0;
    const A = new Float64Array(3), Bq = new Float64Array(3), tmp2 = { x: 0, y: 0, z: 0, look: -1, rdx: 0, rdy: 0 };
    const at = (x, y, z, r) => {
      cyl(x, y, z, A);
      r[0] = A[0] - cx;
      r[1] = A[1] - cy;
      r[2] = A[2] - cz;
      return r;
    };
    const dir = (x, y, z, dx, dy, dz, r) => {
      cyl(x, y, z, A);
      cyl(x + dx, y + dy, z + dz, Bq);
      const ex = Bq[0] - A[0], ey = Bq[1] - A[1], ez = Bq[2] - A[2], l = Math.hypot(ex, ey, ez) || 1;
      r[0] = ex / l;
      r[1] = ey / l;
      r[2] = ez / l;
      return r;
    };
    const push = (p, n, col) => out.push(p[0], p[1], p[2], n[0], n[1], n[2], col[0], col[1], col[2]);
    const quad = (P0, P1, P2, P3, n0, n1, col) => {
      const ux = P1[0] - P0[0], uy = P1[1] - P0[1], uz = P1[2] - P0[2], wx = P2[0] - P0[0], wy = P2[1] - P0[1], wz = P2[2] - P0[2];
      const fx = uy * wz - uz * wy, fy = uz * wx - ux * wz, fz = ux * wy - uy * wx;
      if (fx * (n0[0] + n1[0]) + fy * (n0[1] + n1[1]) + fz * (n0[2] + n1[2]) >= 0) {
        push(P0, n0, col);
        push(P1, n0, col);
        push(P2, n1, col);
        push(P0, n0, col);
        push(P2, n1, col);
        push(P3, n1, col);
      } else {
        push(P0, n0, col);
        push(P2, n1, col);
        push(P1, n0, col);
        push(P0, n0, col);
        push(P3, n1, col);
        push(P2, n1, col);
      }
    };
    const tri = (P0, P1, P2, n, col) => {
      const ux = P1[0] - P0[0], uy = P1[1] - P0[1], uz = P1[2] - P0[2], wx = P2[0] - P0[0], wy = P2[1] - P0[1], wz = P2[2] - P0[2];
      if ((uy * wz - uz * wy) * n[0] + (uz * wx - ux * wz) * n[1] + (ux * wy - uy * wx) * n[2] >= 0) {
        push(P0, n, col);
        push(P1, n, col);
        push(P2, n, col);
      } else {
        push(P0, n, col);
        push(P2, n, col);
        push(P1, n, col);
      }
    };
    for (let g = 0; g < f.nG; g++) {
      const a0 = f.gStart[g], n = f.gCount[g], layer = f.gLayer[g], kind = f.gKind[g];
      if (n < 2) continue;
      let bx0 = 1e9, by0 = 1e9, bx1 = -1e9, by1 = -1e9;
      for (let v = a0; v < a0 + n; v++) {
        const x = f.gx[v], y = f.gy[v];
        if (x < bx0) bx0 = x;
        if (x > bx1) bx1 = x;
        if (y < by0) by0 = y;
        if (y > by1) by1 = y;
      }
      if (bx1 < lx0 - WIN || bx0 > lx0 + s + WIN || by1 < ly0 - WIN || by0 > ly0 + s + WIN) continue;
      const cum = new Float64Array(n);
      for (let v = 1; v < n; v++) cum[v] = cum[v - 1] + Math.hypot(f.gx[a0 + v] - f.gx[a0 + v - 1], f.gy[a0 + v] - f.gy[a0 + v - 1]);
      const L2 = cum[n - 1];
      if (L2 < 1) continue;
      const K = Math.ceil(L2 / RAIL_STEP - 1e-6);
      const P2 = /* @__PURE__ */ new Map();
      for (let v = 0; v < n - 1; v++) {
        const xa = f.gx[a0 + v], ya = f.gy[a0 + v], xb = f.gx[a0 + v + 1], yb = f.gy[a0 + v + 1];
        if (Math.max(xa, xb) < lx0 - WIN || Math.min(xa, xb) > lx0 + s + WIN || Math.max(ya, yb) < ly0 - WIN || Math.min(ya, yb) > ly0 + s + WIN) continue;
        const sl = cum[v + 1] - cum[v];
        for (let k = Math.ceil(cum[v] / RAIL_STEP - 1e-9); k <= K; k++) {
          const sk = Math.min(k * RAIL_STEP, L2);
          if (sk > cum[v + 1] + 1e-9) break;
          if (P2.has(k)) continue;
          const t = sl > 1e-9 ? (sk - cum[v]) / sl : 0, ox = xa + (xb - xa) * t, oy = ya + (yb - ya) * t;
          if (ox < lx0 - WIN || ox > lx0 + s + WIN || oy < ly0 - WIN || oy > ly0 + s + WIN) continue;
          railPoint(world2, reg.x0 + ox, reg.y0 + oy, layer, kind, tmp2);
          P2.set(k, [ox, oy, tmp2.x, tmp2.y, tmp2.z, tmp2.look, tmp2.rdx, tmp2.rdy, sk]);
        }
      }
      if (P2.size < 2) continue;
      const F = /* @__PURE__ */ new Map();
      for (const [k, p] of P2) {
        if (p[5] < 0) continue;
        const pa = P2.get(k - 1), pb = P2.get(k + 1);
        const qa = pa && pa[5] >= 0 ? pa : p, qb = pb && pb[5] >= 0 ? pb : p;
        let tx = qb[2] - qa[2], ty = qb[3] - qa[3], tl = Math.hypot(tx, ty);
        if (tl < 0.05) {
          const oa = pa || p, ob = pb || p;
          tx = ob[0] - oa[0];
          ty = ob[1] - oa[1];
          tl = Math.hypot(tx, ty);
        }
        if (tl < 1e-6) continue;
        tx /= tl;
        ty /= tl;
        let vote = 0;
        for (let j = k - 10; j <= k + 10; j++) {
          const q = P2.get(j);
          if (q && (q[6] || q[7])) vote += q[6] * ty - q[7] * tx >= 0 ? 1 : -1;
        }
        const sg = vote >= 0 ? 1 : -1, ax = sg * ty, ay = -sg * tx;
        F.set(k, { B: at(p[2], p[3], p[4], [0, 0, 0]), U: dir(p[2], p[3], p[4], 0, 0, 1, [0, 0, 0]), Ac: dir(p[2], p[3], p[4], ax, ay, 0, [0, 0, 0]), T: dir(p[2], p[3], p[4], tx, ty, 0, [0, 0, 0]), look: p[5] });
      }
      const pt = (Fr, a, b, r) => {
        r[0] = Fr.B[0] + Fr.Ac[0] * a + Fr.U[0] * b;
        r[1] = Fr.B[1] + Fr.Ac[1] * a + Fr.U[1] * b;
        r[2] = Fr.B[2] + Fr.Ac[2] * a + Fr.U[2] * b;
        return r;
      };
      const nrm = (Fr, na, nb, r) => {
        r[0] = Fr.Ac[0] * na + Fr.U[0] * nb;
        r[1] = Fr.Ac[1] * na + Fr.U[1] * nb;
        r[2] = Fr.Ac[2] * na + Fr.U[2] * nb;
        const l = Math.hypot(r[0], r[1], r[2]) || 1;
        r[0] /= l;
        r[1] /= l;
        r[2] /= l;
        return r;
      };
      const inTile = (p) => p[0] >= lx0 && p[0] < lx0 + s && p[1] >= ly0 && p[1] < ly0 + s;
      const drawn = (k) => {
        const A_ = F.get(k), B_ = F.get(k + 1);
        return !!A_ && !!B_ && A_.look === B_.look;
      };
      const P0 = [0, 0, 0], P1 = [0, 0, 0], P22 = [0, 0, 0], P3 = [0, 0, 0], N0 = [0, 0, 0], N1 = [0, 0, 0];
      for (const [k, Fa] of F) {
        if (!drawn(k)) continue;
        const Fb = F.get(k + 1), pa = P2.get(k), pb = P2.get(k + 1), R2 = RAIL[Fa.look];
        if (inTile([(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2])) {
          for (const poly of R2.polys) {
            const Q = poly.pts;
            for (let i = 0; i < Q.length; i++) {
              const [qa, qb] = Q[i], [ra, rb] = Q[(i + 1) % Q.length];
              if (qb === 0 && rb === 0) continue;
              const na = rb - qb, nb = -(ra - qa);
              pt(Fa, qa, qb, P0);
              pt(Fa, ra, rb, P1);
              pt(Fb, ra, rb, P22);
              pt(Fb, qa, qb, P3);
              quad(P0, P1, P22, P3, nrm(Fa, na, nb, N0), nrm(Fb, na, nb, N1), poly.col);
            }
          }
          if (R2.gap) {
            const s0 = pa[8], s1 = pb[8];
            for (let m = Math.ceil(s0 / R2.gap - 1e-9); m * R2.gap < s1 - 1e-9; m++) {
              const t = (m * R2.gap - s0) / (s1 - s0);
              const B = [Fa.B[0] + (Fb.B[0] - Fa.B[0]) * t, Fa.B[1] + (Fb.B[1] - Fa.B[1]) * t, Fa.B[2] + (Fb.B[2] - Fa.B[2]) * t];
              const Fr = { B, U: Fa.U, Ac: Fa.Ac, T: Fa.T };
              for (const ps of R2.posts) {
                const c = (ia, ib, it, r) => {
                  pt(Fr, ps.a[ia], ps.b[ib], r);
                  const h = it ? ps.hl : -ps.hl;
                  r[0] += Fr.T[0] * h;
                  r[1] += Fr.T[1] * h;
                  r[2] += Fr.T[2] * h;
                  return r;
                };
                const nA = Fa.Ac, nU = Fa.U, nT = Fa.T, mA = [-nA[0], -nA[1], -nA[2]], mT = [-nT[0], -nT[1], -nT[2]];
                quad(c(1, 0, 0, P0), c(1, 1, 0, P1), c(1, 1, 1, P22), c(1, 0, 1, P3), nA, nA, ps.col);
                quad(c(0, 0, 0, P0), c(0, 1, 0, P1), c(0, 1, 1, P22), c(0, 0, 1, P3), mA, mA, ps.col);
                quad(c(0, 0, 1, P0), c(1, 0, 1, P1), c(1, 1, 1, P22), c(0, 1, 1, P3), nT, nT, ps.col);
                quad(c(0, 0, 0, P0), c(1, 0, 0, P1), c(1, 1, 0, P22), c(0, 1, 0, P3), mT, mT, ps.col);
                quad(c(0, 1, 0, P0), c(1, 1, 0, P1), c(1, 1, 1, P22), c(0, 1, 1, P3), nU, nU, ps.col);
              }
            }
          }
        }
        for (const [Fe, pe, sgn, other] of [[Fa, pa, -1, k - 1], [Fb, pb, 1, k + 1]]) {
          if (!inTile(pe)) continue;
          if (sgn < 0 ? drawn(other) : drawn(k + 1)) continue;
          const nT = [Fe.T[0] * sgn, Fe.T[1] * sgn, Fe.T[2] * sgn];
          for (const poly of R2.polys) {
            if (!poly.cap) continue;
            const Q = poly.pts;
            pt(Fe, Q[0][0], Q[0][1], P0);
            for (let i = 1; i + 1 < Q.length; i++) tri(P0, pt(Fe, Q[i][0], Q[i][1], P1), pt(Fe, Q[i + 1][0], Q[i + 1][1], P22), nT, poly.col);
          }
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
    const L2 = Math.max(cum[hi] - cum[lo], 1e-6), f = clamp2((t - cum[lo]) / L2, 0, 1);
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
      along(reg, ri, clamp2(s, 0, len), g);
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
    const longest = clamp2((rec[4] || 0) / 10 || len, 8, 400);
    const rail = cls >= 14;
    if (des === D.GIRDER || des === D.FRAME || des === D.SLAB && STEEL(mat)) {
      const gd = STEEL(mat) ? clamp2(longest / 20, 0.8, 3.2) : clamp2(longest / 18, 0.7, 2.8);
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
      const H = deck ? clamp2(longest * 0.12, 3.5, 14) : clamp2(longest * 0.14, 5, 16);
      const P0 = clamp2(H * 0.85, 4, 8.5);
      const off2 = deck ? hw * 0.8 : hw + PW + 0.4;
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
            const o = side * off2;
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
          if (j > 0) beam(M, at(s, -off2, y1), at(s, off2, y1), 0.18, 0.25, up);
          if (!deck && j === 0 && end0) beam(M, at(sN, -off2, y1 - 1), at(sN, off2, y1 - 1), 0.22, 0.45, up);
          if (!deck && j === np - 1 && end1) beam(M, at(s, -off2, y1 - 1), at(s, off2, y1 - 1), 0.22, 0.45, up);
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
        const f = Math.min(clamp2(L2 * 0.28, 2, 30), clear - 0.5);
        const N = clamp2(Math.round(L2 / 4), 6, 24);
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
  function wayZ(reg, ri, X, Y, out) {
    const a = reg.rStart[ri], n = reg.rCount[ri], px = reg.px, py = reg.py, pz = reg.pz;
    const x = X - reg.x0, y = Y - reg.y0;
    let best = 1e18;
    for (let q = a; q < a + n - 1; q++) {
      const dx = px[q + 1] - px[q], dy = py[q + 1] - py[q], L2 = dx * dx + dy * dy || 1e-9;
      const f = clamp2(((x - px[q]) * dx + (y - py[q]) * dy) / L2, 0, 1), ex = px[q] + dx * f - x, ey = py[q] + dy * f - y, d2 = ex * ex + ey * ey;
      if (d2 < best) {
        best = d2;
        out[0] = pz[q] + (pz[q + 1] - pz[q]) * f;
      }
    }
    out[1] = Math.sqrt(best);
    return out;
  }
  var _wz = [0, 0];
  function bigStructure(M, P2, world2, st2, setM, PW, reg) {
    const des = st2[0], Ls = clamp2(st2[3] / 10, 12, 400), W = Math.max(st2[6] / 10, 7), cx = st2[7] / 10, cy = st2[8] / 10;
    let tx = st2[9] / 1e3, ty = st2[10] / 1e3;
    const tl = Math.hypot(tx, ty) || 1;
    tx /= tl;
    ty /= tl;
    const nx = ty, ny = -tx;
    const ri = reg && st2[11] >= 0 && st2[11] < reg.nRoads && reg.rEnd[st2[11]] ? st2[11] : -1;
    const z0 = ri >= 0 ? wayZ(reg, ri, cx, cy, _wz)[0] : world2.nearestDeck(cx, cy) < 30 ? world2._nd.z : world2.groundH(cx, cy, true);
    const zAt = ri >= 0 ? (s) => {
      wayZ(reg, ri, cx + tx * s, cy + ty * s, _wz);
      return _wz[1] < Math.max(30, W) ? _wz[0] : z0;
    } : (s) => {
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
      const f = clamp2(Ls * 0.22, 8, 48), N = clamp2(Math.round(Ls / 6), 10, 40), off2 = hw + 0.6;
      const yR = (s) => f * (1 - (2 * s / Ls) ** 2) - 3;
      const depth = clamp2(Ls * 0.012, 0.8, 2.6);
      for (let k = 0; k < N; k++) {
        const s0 = -Ls / 2 + Ls * k / N, s1 = -Ls / 2 + Ls * (k + 1) / N;
        for (const side of [-1, 1]) {
          const o = side * off2;
          beam(M, at(s0, o, yR(s0)), at(s1, o, yR(s1)), 0.55, depth, up);
          if (k > 0 && yR(s0) > 1.5) beam(M, at(s0, o, yR(s0)), at(s0, o, 0), 0.08, 0.08, up);
        }
        if (k % 2 === 0 && yR(s0) > 6.5) beam(M, at(s0, -off2, yR(s0) + depth * 0.5), at(s0, off2, yR(s0) + depth * 0.5), 0.25, 0.4, up);
      }
      return;
    }
    if (des === D.STAYED) {
      const Ht = clamp2(Ls * 0.28, 25, 75), fork = Ht * 0.62, legs = hw + 1.2;
      for (const st0 of [-Ls / 2, Ls / 2]) {
        const zt = zAt(st0);
        for (const side of [-1, 1]) beam(M, at(st0, side * legs, -8, zt), at(st0, side * 1.6, fork, zt), 1.1, 1.4, up);
        beam(M, at(st0, 0, fork - 2, zt), at(st0, 0, Ht, zt), 1.4, 1.6, up);
        beam(M, at(st0, -legs * 0.8, -0.5, zt), at(st0, legs * 0.8, -0.5, zt), 0.8, 0.9, up);
        const toward = st0 < 0 ? 1 : -1, back = Math.min(Ls * 0.45, 140);
        const nC = clamp2(Math.round((Ls / 2 - 12) / 9), 4, 16);
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
      const Ht = clamp2(Ls * 0.16 + 6, 10, 60), sag = Ht * 0.85, off2 = hw + 0.4;
      for (const st0 of [-Ls / 2, Ls / 2]) for (const side of [-1, 1]) beam(M, at(st0, side * off2, -2), at(st0, side * off2, Ht), 0.7, 0.7, up);
      for (const st0 of [-Ls / 2, Ls / 2]) beam(M, at(st0, -off2, Ht - 1), at(st0, off2, Ht - 1), 0.5, 0.6, up);
      const N = clamp2(Math.round(Ls / 5), 8, 60), yC = (s) => Ht - sag * (1 - (2 * s / Ls) ** 2);
      for (let k = 0; k < N; k++) {
        const s0 = -Ls / 2 + Ls * k / N, s1 = -Ls / 2 + Ls * (k + 1) / N;
        for (const side of [-1, 1]) {
          const o = side * off2;
          beam(M, at(s0, o, yC(s0)), at(s1, o, yC(s1)), 0.18, 0.18, up);
          if (k > 0) beam(M, at(s0, o, yC(s0)), at(s0, o, 0.8), 0.04, 0.04, up);
        }
      }
      return;
    }
    if (des === D.LIFT) {
      const Hl = clamp2(Ls * 0.33, 25, 55), off2 = hw + 1;
      for (const st0 of [-Ls / 2, Ls / 2]) {
        const zt = zAt(st0);
        for (const ds of [-1.8, 1.8]) for (const side of [-1, 1]) beam(M, at(st0 + ds, side * off2, -6, zt), at(st0 + ds, side * off2, Hl, zt), 0.6, 0.6, up);
        for (const yb of [Hl * 0.35, Hl * 0.7]) for (const side of [-1, 1]) beam(M, at(st0 - 1.8, side * off2, yb, zt), at(st0 + 1.8, side * off2, yb, zt), 0.3, 0.3, up);
        setM(MAT.CONCRETE);
        beam(M, at(st0, -off2 - 0.8, Hl + 1.6, zt), at(st0, off2 + 0.8, Hl + 1.6, zt), 2.4, 1.6, up);
        beam(M, at(st0, -off2 + 1, Hl * 0.78, zt), at(st0, off2 - 1, Hl * 0.78, zt), 1.4, 1.8, up);
        setM(MAT.METAL);
      }
      const H = 6, N = clamp2(Math.round(Ls / 7), 6, 30);
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
      const ux = lx - ax, uy = ly - ay, t = clamp2((ux * dx + uy * dy) / l2, 0, 1), ex = ux - dx * t, ey = uy - dy * t, w = rHw[rj] + WALL_GAP - 0.05;
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
        const t = clamp2(((lx - ax) * dx + (ly - ay) * dy) / l2, 0, 1), ex = lx - ax - dx * t, ey = ly - ay - dy * t, dd = Math.hypot(ex, ey);
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

  // src/stations.js
  var TILE = RS2 / 32;
  var GC = 64;
  var COPPER = [134, 188, 162, 255];
  var COPPER_ROOF = [104, 150, 128, 255];
  var STEEL_ROOF = [84, 86, 88, 255];
  var TACTILE = [222, 182, 38, 255];
  var GLASS_TINT = [96, 150, 140, 255];
  var GLASS_ROOF = [168, 170, 166, 255];
  var st = { tiles: /* @__PURE__ */ new Map(), grid: /* @__PURE__ */ new Map() };
  function setStations(doc) {
    st.tiles = /* @__PURE__ */ new Map();
    st.grid = /* @__PURE__ */ new Map();
    if (!doc) return;
    const add = (it, ring) => {
      let cx = 0, cy = 0, x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const q of ring) {
        cx += q[0];
        cy += q[1];
        x0 = Math.min(x0, q[0]);
        x1 = Math.max(x1, q[0]);
        y0 = Math.min(y0, q[1]);
        y1 = Math.max(y1, q[1]);
      }
      cx /= ring.length;
      cy /= ring.length;
      it.cx = cx;
      it.cy = cy;
      it.bb = [x0, y0, x1, y1];
      const key2 = Math.floor(cy / TILE) * 65536 + Math.floor(cx / TILE);
      let l = st.tiles.get(key2);
      if (!l) st.tiles.set(key2, l = []);
      l.push(it);
      return it;
    };
    for (const p of doc.p || []) {
      const it = add({ k: "plat", p: p.p, e: p.e, f: p.f, c: p.c, m: p.m || 0 }, p.p);
      if (p.f & 1) {
        for (let gx = Math.floor(it.bb[0] / GC); gx <= Math.floor(it.bb[2] / GC); gx++) for (let gy = Math.floor(it.bb[1] / GC); gy <= Math.floor(it.bb[3] / GC); gy++) {
          const k = gy * 65536 + gx;
          let l = st.grid.get(k);
          if (!l) st.grid.set(k, l = []);
          l.push(it);
        }
      }
    }
    for (const g of doc.x || []) add({ k: g.k, p: g.p, b: g.b, t: g.t }, g.p);
  }
  function stationsIn(ix, iy) {
    return st.tiles.get(iy * 65536 + ix) || null;
  }
  function inRing2(ring, x, y) {
    let c = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
      if (yi > y !== yj > y && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
    }
    return c;
  }
  function onPlatform(x, y, z) {
    const l = st.grid.get(Math.floor(y / GC) * 65536 + Math.floor(x / GC));
    if (!l) return false;
    for (const it of l) {
      if (x < it.bb[0] - 0.1 || x > it.bb[2] + 0.1 || y < it.bb[1] - 0.1 || y > it.bb[3] + 0.1) continue;
      if (Math.abs(it.p[0][2] - z) > 3) continue;
      if (inRing2(it.p, x, y)) return true;
      for (let i = 0; i < it.p.length; i++) {
        if (!it.e[i]) continue;
        const a = it.p[i], b = it.p[(i + 1) % it.p.length], dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy;
        if (L2 < 0.01) continue;
        const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / L2));
        if (Math.hypot(a[0] + dx * t - x, a[1] + dy * t - y) < 0.8) return true;
      }
    }
    return false;
  }
  function V(M, P2, x, y, h, nx, ny, up, tu, tv) {
    const t = P2(x, y, h);
    return M.v(t[0], t[1], t[2], nx, up, -ny, tu, tv);
  }
  function flat(M, P2, ring, hs, up) {
    const x0 = ring[0][0], y0 = ring[0][1], L2 = [];
    for (const q of ring) L2.push(q[0] - x0, q[1] - y0, 0);
    const ids = ring.map((q, i) => V(M, P2, q[0], q[1], hs[i], 0, 0, up, q[0] - x0, q[1] - y0));
    ears(L2, (a, b, c) => M.tri(ids[a], ids[b], ids[c]));
  }
  function wall(M, P2, xa, ya, xb, yb, ba, ta, bb, tb, nx, ny, u0, u1, v0) {
    const i0 = V(M, P2, xa, ya, ba, nx, ny, 0, u0, ba - v0), i1 = V(M, P2, xb, yb, bb, nx, ny, 0, u1, bb - v0);
    const i2 = V(M, P2, xb, yb, tb, nx, ny, 0, u1, tb - v0), i3 = V(M, P2, xa, ya, ta, nx, ny, 0, u0, ta - v0);
    M.quad(i0, i1, i2, i3);
  }
  function post(M, P2, x, y, h0, h12, r, ux, uy) {
    const c = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => [x + (ux * a - uy * b) * r, y + (uy * a + ux * b) * r]);
    for (let i = 0; i < 4; i++) {
      const A = c[i], B = c[(i + 1) % 4], dx = B[0] - A[0], dy = B[1] - A[1], l = Math.hypot(dx, dy) || 1;
      wall(M, P2, A[0], A[1], B[0], B[1], h0, h12, h0, h12, dy / l, -dx / l, 0, l, h0);
    }
    flat(M, P2, c, [h12, h12, h12, h12], 1);
  }
  function column(M, P2, x, y, h0, h12, r) {
    const c = [];
    for (let i = 0; i < 8; i++) {
      const a = (i + 0.5) * Math.PI / 4;
      c.push([x + Math.cos(a) * r, y + Math.sin(a) * r]);
    }
    for (let i = 0; i < 8; i++) {
      const A = c[i], B = c[(i + 1) % 8], mx = (A[0] + B[0]) / 2 - x, my = (A[1] + B[1]) / 2 - y, ml = Math.hypot(mx, my) || 1;
      wall(M, P2, A[0], A[1], B[0], B[1], h0, h12, h0, h12, mx / ml, my / ml, i * 0.35, (i + 1) * 0.35, h0);
    }
  }
  var edgeOf = (ring, i) => {
    const a = ring[i], b = ring[(i + 1) % ring.length], dx = b[0] - a[0], dy = b[1] - a[1], L2 = Math.hypot(dx, dy);
    return { a, b, dx, dy, L: L2, nx: L2 > 0 ? dy / L2 : 0, ny: L2 > 0 ? -dx / L2 : 0 };
  };
  function platform(world2, M, it, P2) {
    const ring = it.p, n = ring.length, elev = (it.f & 1) !== 0;
    let cz = 0;
    for (const q of ring) cz += q[2];
    cz /= n;
    const c0 = P2(it.cx, it.cy, cz);
    M.C[0] = c0[0];
    M.C[1] = c0[1];
    M.C[2] = c0[2];
    const set = (mat, clad = 0, cls = 7) => {
      M.M[0] = mat;
      M.M[1] = clad;
      M.M[2] = cls;
      M.M[3] = 211;
    };
    const plain = () => {
      M.W[0] = 0;
      M.W[1] = 0;
      M.W[2] = 0;
      M.W[3] = -1;
      M.K[0] = M.K[1] = M.K[2] = M.K[3] = 0;
      M.J[0] = M.J[1] = M.J[2] = M.J[3] = 0;
      M.T[0] = M.T[1] = M.T[2] = M.T[3] = 0;
    };
    plain();
    const tops = ring.map((q) => q[2]);
    set(MAT.CONCRETE);
    flat(M, P2, ring, tops, 1);
    const bot = [];
    for (let i = 0; i < n; i++) {
      const g = world2.groundH(ring[i][0], ring[i][1]);
      bot.push(elev ? tops[i] - 0.9 : Math.min(g - 0.3, tops[i] - 0.15));
    }
    for (let i = 0; i < n; i++) {
      const E = edgeOf(ring, i), j = (i + 1) % n;
      if (E.L < 0.05) continue;
      wall(M, P2, E.a[0], E.a[1], E.b[0], E.b[1], bot[i], tops[i], bot[j], tops[j], E.nx, E.ny, 0, E.L, bot[i]);
    }
    if (elev) flat(M, P2, ring, bot, -1);
    M.K[0] = TACTILE[0];
    M.K[1] = TACTILE[1];
    M.K[2] = TACTILE[2];
    M.K[3] = 255;
    set(MAT.FLATROOF);
    for (let i = 0; i < n; i++) {
      if (!it.e[i]) continue;
      const E = edgeOf(ring, i), j = (i + 1) % n;
      if (E.L < 0.5) continue;
      const ix = -E.nx * 0.61, iy = -E.ny * 0.61, ha = tops[i] + 0.012, hb = tops[j] + 0.012;
      flat(M, P2, [[E.a[0], E.a[1]], [E.b[0], E.b[1]], [E.b[0] + ix, E.b[1] + iy], [E.a[0] + ix, E.a[1] + iy]], [ha, hb, hb, ha], 1);
    }
    plain();
    const back = [];
    for (let i = 0; i < n; i++) if (!it.e[i] && edgeOf(ring, i).L >= 0.5) back.push(i);
    if (elev) {
      set(MAT.METAL, 0, 14);
      for (const i of back) {
        const E = edgeOf(ring, i), j = (i + 1) % n;
        for (let s = 2; s < E.L - 1; s += 9) {
          const f = s / E.L, x = E.a[0] + E.dx * f - E.nx * 0.5, y = E.a[1] + E.dy * f - E.ny * 0.5;
          const h = bot[i] + (bot[j] - bot[i]) * f, g = world2.groundH(x, y);
          if (h - g > 2.2) post(M, P2, x, y, g - 0.2, h, 0.22, E.dx / E.L, E.dy / E.L);
        }
      }
    }
    const copper = it.m === 1;
    if (it.f & 2) {
      const ch = it.c > 2.2 ? it.c : 3.4;
      const under = tops.map((t) => t + ch), over = tops.map((t) => t + ch + 0.35);
      set(MAT.CONCRETE);
      flat(M, P2, ring, under, -1);
      const R2 = copper ? COPPER_ROOF : STEEL_ROOF;
      M.K[0] = R2[0];
      M.K[1] = R2[1];
      M.K[2] = R2[2];
      M.K[3] = 255;
      set(MAT.FLATROOF);
      flat(M, P2, ring, over, 1);
      for (let i = 0; i < n; i++) {
        const E = edgeOf(ring, i), j = (i + 1) % n;
        if (E.L < 0.05) continue;
        wall(M, P2, E.a[0], E.a[1], E.b[0], E.b[1], under[i], over[i], under[j], over[j], E.nx, E.ny, 0, E.L, under[i]);
      }
      plain();
      if (it.f & 8) {
        M.J[0] = COPPER[0];
        M.J[1] = COPPER[1];
        M.J[2] = COPPER[2];
        M.J[3] = 255;
        set(MAT.WALL, 4, 7);
        for (const i of back) {
          const E = edgeOf(ring, i), j = (i + 1) % n;
          M.W[0] = E.L;
          M.W[1] = ch;
          M.W[2] = 1;
          M.W[3] = -1;
          wall(M, P2, E.a[0], E.a[1], E.b[0], E.b[1], tops[i], under[i], tops[j], under[j], E.nx, E.ny, 0, E.L, tops[i]);
        }
        plain();
      } else {
        set(MAT.METAL, 0, 7);
        if (back.length) {
          for (const i of back) {
            const E = edgeOf(ring, i), j = (i + 1) % n;
            for (let s = 1.5; s < E.L - 0.5; s += 8) {
              const f = s / E.L, x = E.a[0] + E.dx * f - E.nx * 0.45, y = E.a[1] + E.dy * f - E.ny * 0.45, h = tops[i] + (tops[j] - tops[i]) * f;
              post(M, P2, x, y, h, h + ch, 0.1, E.dx / E.L, E.dy / E.L);
            }
          }
        } else spine(ring, (x, y, ux, uy, h) => post(M, P2, x, y, h, h + ch, 0.1, ux, uy), 8);
      }
    } else if (it.f & 4) {
      spine(ring, (x, y, ux, uy, h) => shelter(M, P2, x, y, ux, uy, h), 1e9);
    }
    if (elev && !(it.f & 8)) {
      set(MAT.RAIL, 255, 7);
      for (const i of back) {
        const E = edgeOf(ring, i), j = (i + 1) % n;
        const xa = E.a[0] - E.nx * 0.05, ya = E.a[1] - E.ny * 0.05, xb = E.b[0] - E.nx * 0.05, yb = E.b[1] - E.ny * 0.05;
        const i0 = V(M, P2, xa, ya, tops[i], E.nx, E.ny, 0, 0, 0), i1 = V(M, P2, xb, yb, tops[j], E.nx, E.ny, 0, E.L, 0);
        const i2 = V(M, P2, xb, yb, tops[j] + 1.07, E.nx, E.ny, 0, E.L, 1), i3 = V(M, P2, xa, ya, tops[i] + 1.07, E.nx, E.ny, 0, 0, 1);
        M.quad(i0, i1, i2, i3);
      }
    }
    plain();
  }
  function spine(ring, fn, step) {
    let best = null;
    for (let i = 0; i < ring.length; i++) {
      const E = edgeOf(ring, i);
      if (!best || E.L > best.L) best = E;
    }
    if (!best || best.L < 1) return;
    const ux = best.dx / best.L, uy = best.dy / best.L;
    let cx = 0, cy = 0, cz = 0, lo = Infinity, hi = -Infinity;
    for (const q of ring) {
      cx += q[0];
      cy += q[1];
      cz += q[2];
    }
    cx /= ring.length;
    cy /= ring.length;
    cz /= ring.length;
    for (const q of ring) {
      const s = (q[0] - cx) * ux + (q[1] - cy) * uy;
      lo = Math.min(lo, s);
      hi = Math.max(hi, s);
    }
    if (step > 1e8) {
      fn(cx, cy, ux, uy, cz);
      return;
    }
    for (let s = lo + 1.5; s < hi - 1; s += step) {
      const x = cx + ux * s, y = cy + uy * s;
      if (!inRing2(ring, x, y)) continue;
      let h = cz, d = Infinity;
      for (const q of ring) {
        const e = Math.hypot(q[0] - x, q[1] - y);
        if (e < d) {
          d = e;
          h = q[2];
        }
      }
      fn(x, y, ux, uy, h);
    }
  }
  function shelter(M, P2, x, y, ux, uy, h) {
    const a = 2, b = 0.75, H = 2.4;
    const c = [[-a, -b], [a, -b], [a, b], [-a, b]].map(([s, t]) => [x + ux * s - uy * t, y + uy * s + ux * t]);
    M.M[0] = MAT.CARGLASS;
    M.M[1] = 0;
    M.M[2] = 7;
    M.M[3] = 211;
    for (let i = 0; i < 3; i++) {
      const A = c[i], B = c[(i + 1) % 4], dx = B[0] - A[0], dy = B[1] - A[1], l = Math.hypot(dx, dy) || 1;
      wall(M, P2, A[0], A[1], B[0], B[1], h + 0.1, h + H, h + 0.1, h + H, dy / l, -dx / l, 0, l, h);
    }
    M.M[0] = MAT.METAL;
    flat(M, P2, c.map(([px, py]) => [px + 0, py + 0]), [h + H, h + H, h + H, h + H], -1);
    flat(M, P2, c, [h + H + 0.12, h + H + 0.12, h + H + 0.12, h + H + 0.12], 1);
  }
  function glassPiece(world2, M, it, P2) {
    const ring = it.p, n = ring.length;
    let base = it.b;
    const gs = ring.map((q) => world2.groundH(q[0], q[1]));
    const raised = base !== null && base !== void 0;
    if (!raised) base = Math.min(...gs) - 0.3;
    const top = it.t;
    if (top - base < 1) return;
    const c0 = P2(it.cx, it.cy, (base + top) / 2);
    M.C[0] = c0[0];
    M.C[1] = c0[1];
    M.C[2] = c0[2];
    M.K[0] = M.K[1] = M.K[2] = M.K[3] = 0;
    M.T[0] = M.T[1] = M.T[2] = M.T[3] = 0;
    M.J[0] = GLASS_TINT[0];
    M.J[1] = GLASS_TINT[1];
    M.J[2] = GLASS_TINT[2];
    M.J[3] = 255;
    M.M[0] = MAT.WALL;
    M.M[1] = 7;
    M.M[2] = 11;
    M.M[3] = 177;
    const storeys = 1;
    for (let i = 0; i < n; i++) {
      const E = edgeOf(ring, i);
      if (E.L < 0.05) continue;
      M.W[0] = E.L;
      M.W[1] = top - base;
      M.W[2] = storeys;
      M.W[3] = -1;
      wall(M, P2, E.a[0], E.a[1], E.b[0], E.b[1], base, top, base, top, E.nx, E.ny, 0, E.L, base);
    }
    M.J[0] = M.J[1] = M.J[2] = M.J[3] = 0;
    M.W[0] = 0;
    M.W[1] = 0;
    M.W[2] = 0;
    M.W[3] = -1;
    M.K[0] = GLASS_ROOF[0];
    M.K[1] = GLASS_ROOF[1];
    M.K[2] = GLASS_ROOF[2];
    M.K[3] = 255;
    M.M[0] = MAT.FLATROOF;
    M.M[1] = 0;
    M.M[2] = 10;
    flat(M, P2, ring, ring.map(() => top), 1);
    M.K[0] = M.K[1] = M.K[2] = M.K[3] = 0;
    if (raised) {
      M.M[0] = MAT.CONCRETE;
      flat(M, P2, ring, ring.map(() => base), -1);
      M.M[0] = MAT.METAL;
      M.M[2] = 10;
      let next = 4.5;
      for (let i = 0; i < n; i++) {
        const E = edgeOf(ring, i);
        let s = next;
        for (; s < E.L; s += 9) {
          const f = s / E.L, x = E.a[0] + E.dx * f - E.nx * 1, y = E.a[1] + E.dy * f - E.ny * 1;
          if (!inRing2(ring, x, y)) continue;
          const g = world2.groundH(x, y);
          if (base - g > 2.4) column(M, P2, x, y, g - 0.2, base, 0.45);
        }
        next = s - E.L;
      }
    }
  }
  function addStations(world2, M, items, P2) {
    let k = 0;
    for (const it of items) {
      if (it.k === "plat") platform(world2, M, it, P2);
      else if (it.k === "glass") glassPiece(world2, M, it, P2);
      else continue;
      k++;
    }
    return k;
  }

  // src/decks.js
  var PIER_GAP = 30;
  var EDGE_STEP = 1.5;
  var p3 = new Float64Array(3);
  var runsL = [];
  var runsR = [];
  var lin = (o, f) => typeof o === "number" ? o : o[0] + (o[1] - o[0]) * f;
  var off = (o, d, s = 1) => typeof o === "number" ? s * o + d : [s * o[0] + d, s * o[1] + d];
  function openRuns(reg, ri, ax, ay, az, bx, by, bz, n0, n1, off2, out) {
    const len = Math.hypot(bx - ax, by - ay), n = Math.max(1, Math.ceil(len / EDGE_STEP));
    const cov = (f) => {
      const x = ax + (bx - ax) * f + (n0[0] + (n1[0] - n0[0]) * f) * off2, y = ay + (by - ay) * f + (n0[1] + (n1[1] - n0[1]) * f) * off2, z = az + (bz - az) * f;
      return onOtherWay(reg, x, y, z, ri, false) || reg.rCls[ri] >= 14 && onPlatform(reg.x0 + x, reg.y0 + y, z);
    };
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
    const stn = reg ? stationsIn(ix, iy) : null;
    if (!reg || !(reg.nDeck || reg.nTun || walls || stn)) return null;
    const list = reg.nDeck && index2(reg, s).get(iy * 65536 + ix) || [];
    if (!list.length && !reg.nTun && !walls && !stn) return null;
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
    const cross = (ri, q, out, unit) => {
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
      unit[0] = ty;
      unit[1] = -tx;
    };
    const n0 = [0, 0], n1 = [0, 0], u0 = [0, 0], u1 = [0, 0];
    let count = 0;
    const spanSts = nbi ? nbi.structures.get(reg.ry * 28 + reg.rx) : null;
    const underMainSpan = (X, Y) => {
      for (const st2 of spanSts) {
        const Ls = clamp2(st2[3] / 10, 12, 400), W = Math.max(st2[6] / 10, 7), dx = X - st2[7] / 10, dy = Y - st2[8] / 10;
        let tx = st2[9] / 1e3, ty = st2[10] / 1e3;
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
      cross(ri, q, n0, u0);
      cross(ri, q + 1, n1, u1);
      const PW = rail ? 0.34 : 0.42, PH = rail ? 0.55 : 0.86, DT = rail ? 1.5 : DECK_T - 0.05;
      const xs = rail ? void 0 : xsOf(reg, ri), qi = q - reg.rStart[ri];
      const prR = xs && xs[9] && xs[9].length ? xs[9] : null, prL = xs && xs[10] && xs[10].length ? xs[10] : null;
      const wR0 = prR ? prR[qi] / 10 : xs && xs[7] >= 10 ? xs[7] / 10 : 0, wR1 = prR ? prR[qi + 1] / 10 : wR0;
      const wL0 = prL ? prL[qi] / 10 : xs && xs[8] >= 10 ? xs[8] / 10 : 0, wL1 = prL ? prL[qi + 1] / 10 : wL0;
      const wL = (wL0 + wL1) / 2, wR = (wR0 + wR1) / 2, CH = 0.18, PB = 0.15;
      const pL = wL0 === wL1 ? hw + wL : [hw + wL0, hw + wL1], pR = wR0 === wR1 ? hw + wR : [hw + wR0, hw + wR1];
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
        let uxA = u0[0] + (u1[0] - u0[0]) * f0, uyA = u0[1] + (u1[1] - u0[1]) * f0, uxB = u0[0] + (u1[0] - u0[0]) * f1, uyB = u0[1] + (u1[1] - u0[1]) * f1;
        const lA = Math.hypot(uxA, uyA) || 1, lB = Math.hypot(uxB, uyB) || 1;
        uxA /= lA;
        uyA /= lA;
        uxB /= lB;
        uyB /= lB;
        const xA = ax + (bx - ax) * f0, yA = ay + (by - ay) * f0, zA = az + (bz - az) * f0, xB = ax + (bx - ax) * f1, yB = ay + (by - ay) * f1, zB = az + (bz - az) * f1;
        const sA = s0 + (s1 - s0) * f0, sB = s0 + (s1 - s0) * f1;
        const oA0 = lin(o0, f0), oA1 = lin(o1, f0), oB0 = lin(o0, f1), oB1 = lin(o1, f1);
        let t = P2(xA + cxA * oA0, yA + cyA * oA0, zA + y0);
        const i0 = M.v(t[0], t[1], t[2], uxA * nl, nu, -uyA * nl, sA, tv0);
        t = P2(xA + cxA * oA1, yA + cyA * oA1, zA + y1);
        const i1 = M.v(t[0], t[1], t[2], uxA * nl, nu, -uyA * nl, sA, tv1);
        t = P2(xB + cxB * oB1, yB + cyB * oB1, zB + y1);
        const i2 = M.v(t[0], t[1], t[2], uxB * nl, nu, -uyB * nl, sB, tv1);
        t = P2(xB + cxB * oB0, yB + cyB * oB0, zB + y0);
        const i3 = M.v(t[0], t[1], t[2], uxB * nl, nu, -uyB * nl, sB, tv0);
        M.quad(i0, i1, i2, i3);
      };
      const stub = (f, sg, dir, a = hw, b = hw + PW, h = PH) => {
        const cx2 = n0[0] + (n1[0] - n0[0]) * f, cy2 = n0[1] + (n1[1] - n0[1]) * f, X = ax + (bx - ax) * f, Y = ay + (by - ay) * f, Z = az + (bz - az) * f;
        a = lin(a, f);
        b = lin(b, f);
        const oa = sg * a, ob = sg * b;
        let t = P2(X + cx2 * oa, Y + cy2 * oa, Z);
        const i0 = M.v(t[0], t[1], t[2], tx * dir, 0, -ty * dir, 0, 0);
        t = P2(X + cx2 * ob, Y + cy2 * ob, Z);
        const i1 = M.v(t[0], t[1], t[2], tx * dir, 0, -ty * dir, b - a, 0);
        t = P2(X + cx2 * ob, Y + cy2 * ob, Z + h);
        const i2 = M.v(t[0], t[1], t[2], tx * dir, 0, -ty * dir, b - a, h);
        t = P2(X + cx2 * oa, Y + cy2 * oa, Z + h);
        const i3 = M.v(t[0], t[1], t[2], tx * dir, 0, -ty * dir, 0, h);
        M.quad(i0, i1, i2, i3);
      };
      const covL = openRuns(reg, ri, lx, ly, az, lbx, lby, bz, n0, n1, -(hw + 0.05), runsL);
      const covR = openRuns(reg, ri, lx, ly, az, lbx, lby, bz, n0, n1, hw + 0.05, runsR);
      setM(rail ? MAT.TRACK : MAT.ROADWAY);
      M.W[0] = hw;
      M.W[1] = rail ? cls === 14 ? 1 : 2 : roadKindXS(reg, ri, xs);
      M.W[2] = (covL > 0.3 ? 1 : 0) + (covR > 0.3 ? 2 : 0);
      M.W[3] = xs ? bikeByte(xs[1], xs[2], xs[3]) + 256 * bikeByte(xs[4], xs[5], xs[6]) : -1;
      const lift = rail ? 0 : (13 - Math.min(cls, 13)) * 3e-3 + (reg.rName[ri] & 7) * 4e-4;
      const NA = Math.max(1, Math.ceil(len / 1.5)), NC = Math.max(2, Math.ceil(2 * hw / 1.5));
      const thi = deckSegDir(tx, ty), oi = -ax * Math.sin(thi) + ay * Math.cos(thi);
      let any = false;
      const own = rail || covL < 0.01 && covR < 0.01 && deckOwnerAt(reg, (lx + lbx) / 2, (ly + lby) / 2, (az + bz) / 2, ri, thi, oi, 0.25, 0.02) < 0 ? null : new Int32Array((NA + 1) * (NC + 1));
      if (own) {
        for (let ia = 0; ia <= NA; ia++) for (let ic = 0; ic <= NC; ic++) {
          const f = ia / NA, o = -hw + 2 * hw * ic / NC;
          const cxA = n0[0] + (n1[0] - n0[0]) * f, cyA = n0[1] + (n1[1] - n0[1]) * f;
          const rj = deckOwnerAt(reg, lx + (lbx - lx) * f + cxA * o, ly + (lby - ly) * f + cyA * o, az + (bz - az) * f, ri, thi, oi, 0.25, 0.02);
          if (rj >= 0) {
            own[ia * (NC + 1) + ic] = rj + 1;
            any = true;
          }
        }
      }
      if (!any) strip(0, 1, -hw, lift, hw, lift, 0, 1, -hw, hw);
      else {
        for (let ia = 0; ia < NA; ia++) {
          let c0 = -1;
          for (let ic = 0; ic <= NC; ic++) {
            const o0 = ic < NC ? own[ia * (NC + 1) + ic] : 0;
            const gone = o0 > 0 && own[ia * (NC + 1) + ic + 1] === o0 && own[(ia + 1) * (NC + 1) + ic] === o0 && own[(ia + 1) * (NC + 1) + ic + 1] === o0;
            if (ic < NC && !gone) {
              if (c0 < 0) c0 = ic;
              continue;
            }
            if (c0 >= 0) {
              const oA = -hw + 2 * hw * c0 / NC, oB = -hw + 2 * hw * ic / NC;
              strip(ia / NA, (ia + 1) / NA, oA, lift, oB, lift, 0, 1, oA, oB);
              c0 = -1;
            }
          }
        }
      }
      setM(rail ? MAT.METAL : MAT.CONCRETE);
      M.W[0] = 0;
      M.W[1] = 0;
      M.W[2] = 0;
      M.W[3] = -1;
      const rails = [];
      for (let i = 0; i < runsL.length; i += 2) {
        const f0 = runsL[i], f1 = runsL[i + 1];
        if ((f1 - f0) * len < 0.1) continue;
        const b = wL ? CH : 0, ph = wL ? PB : PH;
        if (wL) {
          strip(f0, f1, -hw, CH, -hw, 0, 1, 0, CH, 0);
          strip(f0, f1, off(pL, 0, -1), CH, -hw, CH, 0, 1, 0, wL);
          if (f0 > 1e-3) stub(f0, -1, -1, hw, pL, CH);
          if (f1 < 1 - 1e-3) stub(f1, -1, 1, hw, pL, CH);
          rails.push(f0, f1, off(pL, -PW / 2, -1), b + ph, 1);
        }
        strip(f0, f1, off(pL, -PW, -1), b + ph, off(pL, 0, -1), b + ph, 0, 1, 0, PW);
        strip(f0, f1, off(pL, 0, -1), b + ph, off(pL, 0, -1), b, 1, 0, ph, 0);
        strip(f0, f1, off(pL, -PW, -1), -DT, off(pL, -PW, -1), b + ph, -1, 0, 0, b + ph + DT);
        if (f0 > 1e-3) stub(f0, -1, -1, pL, off(pL, PW), b + ph);
        if (f1 < 1 - 1e-3) stub(f1, -1, 1, pL, off(pL, PW), b + ph);
      }
      for (let i = 0; i < runsR.length; i += 2) {
        const f0 = runsR[i], f1 = runsR[i + 1];
        if ((f1 - f0) * len < 0.1) continue;
        const b = wR ? CH : 0, ph = wR ? PB : PH;
        if (wR) {
          strip(f0, f1, hw, 0, hw, CH, -1, 0, 0, CH);
          strip(f0, f1, hw, CH, pR, CH, 0, 1, 0, wR);
          if (f0 > 1e-3) stub(f0, 1, -1, hw, pR, CH);
          if (f1 < 1 - 1e-3) stub(f1, 1, 1, hw, pR, CH);
          rails.push(f0, f1, off(pR, PW / 2), b + ph, -1);
        }
        strip(f0, f1, pR, b, pR, b + ph, -1, 0, 0, ph);
        strip(f0, f1, pR, b + ph, off(pR, PW), b + ph, 0, 1, 0, PW);
        strip(f0, f1, off(pR, PW), b + ph, off(pR, PW), -DT, 1, 0, b + ph + DT, 0);
        if (f0 > 1e-3) stub(f0, 1, -1, pR, off(pR, PW), b + ph);
        if (f1 < 1 - 1e-3) stub(f1, 1, 1, pR, off(pR, PW), b + ph);
      }
      strip(0, 1, off(pR, PW), -DT, off(pL, -PW, -1), -DT, 0, -1, 0, lin(pR, 0.5) + lin(pL, 0.5) + 2 * PW);
      if (rails.length) {
        setM(MAT.RAIL);
        M.M[1] = 255;
        for (let i = 0; i < rails.length; i += 5) strip(rails[i], rails[i + 1], rails[i + 2], rails[i + 3], rails[i + 2], rails[i + 3] + 0.95, rails[i + 4], 0, 0, 0.95);
        setM(MAT.CONCRETE);
      }
      const en = reg.rEnd[ri], a0 = reg.rStart[ri], b0 = a0 + reg.rCount[ri] - 1, pLs = pL, pRs = pR;
      const cap = (X, Y, Z, nn, dir, f) => {
        const pL2 = lin(pLs, f), pR2 = lin(pRs, f), eL = pL2 + PW, eR = pR2 + PW;
        const face = (o0, o1, h0, h12) => {
          let t = P2(X + nn[0] * o0, Y + nn[1] * o0, Z + h0);
          const i0 = M.v(t[0], t[1], t[2], tx * dir, 0, -ty * dir, o0 + eL, h0 + DT);
          t = P2(X + nn[0] * o1, Y + nn[1] * o1, Z + h0);
          const i1 = M.v(t[0], t[1], t[2], tx * dir, 0, -ty * dir, o1 + eL, h0 + DT);
          t = P2(X + nn[0] * o1, Y + nn[1] * o1, Z + h12);
          const i2 = M.v(t[0], t[1], t[2], tx * dir, 0, -ty * dir, o1 + eL, h12 + DT);
          t = P2(X + nn[0] * o0, Y + nn[1] * o0, Z + h12);
          const i3 = M.v(t[0], t[1], t[2], tx * dir, 0, -ty * dir, o0 + eL, h12 + DT);
          M.quad(i0, i1, i2, i3);
        };
        face(-eL, eR, -DT, 0);
        if (wL) {
          face(-pL2, -hw, 0, CH);
          face(-eL, -pL2, 0, CH + PB);
        } else face(-eL, -hw, 0, PH);
        if (wR) {
          face(hw, pR2, 0, CH);
          face(pR2, eR, 0, CH + PB);
        } else face(hw, eR, 0, PH);
      };
      if (q === a0 && en & 1) cap(ax, ay, az, n0, -1, 0);
      if (q + 1 === b0 && en & 2) cap(bx, by, bz, n1, 1, 1);
      setM(MAT.CONCRETE);
      for (let k = Math.ceil(s0 / PIER_GAP); k * PIER_GAP < s1; k++) {
        const f = (k * PIER_GAP - s0) / (s1 - s0), X = ax + (bx - ax) * f, Y = ay + (by - ay) * f, Z = az + (bz - az) * f;
        if (spanSts && underMainSpan(X, Y)) continue;
        const half = clamp2(hw * 0.62, 0.6, 5), nx = ty, ny = -tx;
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
      if (sts) for (const st2 of sts) {
        const sx = st2[7] / 10, sy = st2[8] / 10;
        if (Math.floor(sx / s) !== ix || Math.floor(sy / s) !== iy) continue;
        const mid = P2(sx, sy, world2.groundH(sx, sy, true));
        M.C[0] = mid[0];
        M.C[1] = mid[1];
        M.C[2] = mid[2];
        bigStructure(M, P2, world2, st2, setW(0, 7), 0.42, reg);
      }
    }
    if (reg.nTun) count += addTunnels(M, world2, reg, ix, iy, s, P2);
    if (walls) count += addWalls(M, world2, ix, iy, s, P2);
    if (stn) count += addStations(world2, M, stn, P2);
    if (!M.n) return null;
    return { n: M.n, count, pos: M.pos.slice(0, M.n * 3), nor: M.nor.slice(0, M.n * 4), uv: M.uv.slice(0, M.n * 2), w: M.w.slice(0, M.n * 4), m: M.m.slice(0, M.n * 4), c: M.c.slice(0, M.n * 3), k: M.k.slice(0, M.n * 4), j: M.j.slice(0, M.n * 4), t: M.t.slice(0, M.n * 4), idx: M.idx.slice(0, M.ni) };
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
          if (!(W.cut && W.cut[W.Wi[i]]) && (world2.nearestRoad(W.X[i], W.Y[i]) < 0.3 || world2.nearestRoad(xm, ym) < 0.3 || world2.nearestRoad(W.X[i + 1], W.Y[i + 1]) < 0.3)) continue;
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
    const wcap = W.cap ? W.cap[wi] : WALL_CAP;
    if (sw) {
      e0 = WALL_FACE;
      e1 = WALL_BACK;
      botA = fA - WALL_SINK;
      botB = fB - WALL_SINK;
      capA = tA + wcap;
      capB = tB + wcap;
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
    if (W.mouth && W.mouth[wi] > 0 && len > 1) {
      const mh = W.mouth[wi], mb = W.mouthB ? W.mouthB[wi] : 0, m0 = i === a ? 0.3 : 0, m1 = i + 1 === a + c - 1 ? len - 0.3 : len;
      const fx = -(wnA[0] / nA + wnB[0] / nB) / 2, fy = -(wnA[1] / nA + wnB[1] / nB) / 2, fl = Math.hypot(fx, fy) || 1;
      const e = WALL_FACE - 0.03;
      M.M[0] = MAT.CARDARK;
      const xa = xA + ux * m0, ya = yA + uy * m0, xb = xA + ux * m1, yb = yA + uy * m1, fa = fA + (fB - fA) * m0 / len + mb, fb = fA + (fB - fA) * m1 / len + mb;
      const i0 = v(xa, ya, e, fa, wnA, fx / fl, fy / fl, 0, 0, 0), i1 = v(xb, yb, e, fb, wnB, fx / fl, fy / fl, 0, m1 - m0, 0);
      const i2 = v(xb, yb, e, fb + mh, wnB, fx / fl, fy / fl, 0, m1 - m0, mh), i3 = v(xa, ya, e, fa + mh, wnA, fx / fl, fy / fl, 0, 0, mh);
      M.quad(i0, i1, i2, i3);
      M.M[0] = mat === 2 ? MAT.BRICK : MAT.CONCRETE;
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

  // src/streets.js
  var TS = RS2 / 64;
  var CURB = 0.15;
  var COL = {
    1: [0.27, 0.262, 0.248],
    2: [0.105, 0.052, 0.04],
    3: [0.1, 0.099, 0.101],
    4: [0.06, 0.042, 0.026],
    5: [0.24, 0.233, 0.22],
    6: [0.3, 0.27, 0.22],
    grass: [0.05, 0.095, 0.024],
    kerb: [0.25, 0.245, 0.24],
    face: [0.22, 0.213, 0.205],
    basin: [0.03, 0.03, 0.03],
    64: [0.78, 0.78, 0.74],
    65: [0.78, 0.55, 0.06],
    66: [0.1, 0.33, 0.12],
    67: [0.05, 0.12, 0.45]
  };
  var GRASSY = /* @__PURE__ */ new Set([2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 16, 17, 20]);
  var LIP = 0.05;
  var RAMP_COL = { 0: [0.32, 0.312, 0.296], 1: COL[2], 2: COL[3], 3: [0.2, 0.198, 0.19] };
  var PANEL = [0.17, 0.04, 0.03];
  var RAMP_STEP = 0.3;
  var UV = new Float64Array(3);
  function rampUV(r, x, y, o) {
    const P2 = r.P, n = P2.length / 2;
    let best = 1e18;
    for (let j = 0; j + 1 < n; j++) {
      const ax = P2[j * 2], ay = P2[j * 2 + 1], dx = P2[j * 2 + 2] - ax, dy = P2[j * 2 + 3] - ay;
      const L2 = dx * dx + dy * dy;
      if (L2 < 1e-10) continue;
      const t = clamp2(((x - ax) * dx + (y - ay) * dy) / L2, 0, 1);
      const px = ax + dx * t - x, py = ay + dy * t - y, d2 = px * px + py * py;
      if (d2 < best) {
        best = d2;
        const L3 = Math.sqrt(L2);
        o[0] = r.cum[j] + t * L3 - r.sB;
        o[1] = (dx * (y - ay) - dy * (x - ax)) / L3;
        o[2] = j;
      }
    }
  }
  function rampF(R2, x, y) {
    let f = 1;
    for (let i = 0; i < R2.length; i++) {
      const r = R2[i];
      if (x < r.bx0 || x > r.bx1 || y < r.by0 || y > r.by1) continue;
      rampUV(r, x, y, UV);
      const v = Math.max(UV[1], 0);
      if (v >= r.D) continue;
      const a = Math.abs(UV[0]) - r.W / 2;
      const g = v / r.D + (a > 0 ? a / r.F : 0);
      if (g < f) f = g;
    }
    return f < LIP ? LIP : f;
  }
  function rampAt(r, u, v, out) {
    const P2 = r.P, n = P2.length / 2, cum = r.cum;
    const s = clamp2(r.sB + u, 0, cum[n - 1]);
    let j = 0;
    while (j + 2 < n && cum[j + 1] < s) j++;
    const L2 = cum[j + 1] - cum[j] || 1, w = (s - cum[j]) / L2;
    const nrm = (k) => {
      let nx2 = 0, ny2 = 0;
      for (const m of [k - 1, k]) {
        if (m < 0 || m + 1 >= n) continue;
        const dx = P2[m * 2 + 2] - P2[m * 2], dy = P2[m * 2 + 3] - P2[m * 2 + 1], l3 = Math.hypot(dx, dy) || 1;
        nx2 += -dy / l3;
        ny2 += dx / l3;
      }
      const l2 = Math.hypot(nx2, ny2) || 1;
      return [nx2 / l2, ny2 / l2];
    };
    const [ax, ay] = nrm(j), [bx, by] = nrm(j + 1);
    let nx = ax + (bx - ax) * w, ny = ay + (by - ay) * w;
    const l = Math.hypot(nx, ny) || 1;
    out[0] = P2[j * 2] + (P2[j * 2 + 2] - P2[j * 2]) * w + nx / l * v;
    out[1] = P2[j * 2 + 1] + (P2[j * 2 + 3] - P2[j * 2 + 1]) * w + ny / l * v;
  }
  function decodeTile(st2, t) {
    const ent = st2.tab.get(t);
    if (!ent) return null;
    const [off2, len] = ent, dv = st2.dv, base = st2.e.byteOffset + off2, buf = st2.e.buffer;
    let q = off2;
    const u16 = (o, n) => new Uint16Array(buf.slice(base + (o - off2), base + (o - off2) + n * 2));
    const nv = dv.getUint32(q, true), nt = dv.getUint32(q + 4, true);
    q += 8;
    const V2 = u16(q, nv * 2);
    q += nv * 4;
    const T = u16(q, nt * 3);
    q += nt * 6;
    const C2 = st2.e.slice(q, q + nt);
    q += nt;
    q = q + 3 & ~3;
    const lines = [];
    const nl = dv.getUint32(q, true);
    q += 4;
    for (let i = 0; i < nl; i++) {
      const n = dv.getUint16(q, true), col = dv.getUint8(q + 2), w = dv.getUint8(q + 3) / 100;
      q += 4;
      lines.push({ xy: u16(q, n * 2), col, w });
      q += n * 4;
    }
    const rings = [];
    const nr = dv.getUint32(q, true);
    q += 4;
    for (let i = 0; i < nr; i++) {
      const n = dv.getUint16(q, true);
      q += 4;
      const xy = u16(q, n * 2);
      q += n * 4;
      const fl = st2.e.slice(q, q + n);
      q += n;
      q = q + 3 & ~3;
      rings.push({ xy, fl });
    }
    const pts = [];
    const np = dv.getUint32(q, true);
    q += 4;
    for (let i = 0; i < np; i++) {
      pts.push([dv.getUint16(q, true), dv.getUint16(q + 2, true), dv.getUint8(q + 4)]);
      q += 8;
    }
    return { V: V2, T, C: C2, lines, rings, pts };
  }
  function streetTris(world2, reg, mx0, my0, s, cx, cy, cz, lc) {
    const st2 = reg && reg.streets;
    if (!st2) return new Float32Array(0);
    const ti = Math.round((mx0 - reg.x0) / TS), tj = Math.round((my0 - reg.y0) / TS);
    const d = decodeTile(st2, tj * 64 + ti);
    if (!d) return new Float32Array(0);
    const out = [], p32 = new Float64Array(3), u3 = new Float64Array(3), A = new Float64Array(3);
    const k = TS / 65535;
    const hc = /* @__PURE__ */ new Map();
    const ground = (x, y) => {
      const key2 = Math.round(x * 20) * 1e7 + Math.round(y * 20);
      let h = hc.get(key2);
      if (h === void 0) {
        h = world2.groundH(x, y, true);
        hc.set(key2, h);
      }
      return h;
    };
    const tri = (a, b, c, col, want) => {
      const P2 = [a, b, c].map(([x, y, h]) => {
        cyl(x, y, h, p32);
        return [p32[0] - cx, p32[1] - cy, p32[2] - cz];
      });
      let nx, ny, nz;
      if (want) [nx, ny, nz] = want;
      else {
        const [x, y, h] = a;
        cyl(x, y, h, p32);
        cyl(x, y, h + 1, u3);
        nx = u3[0] - p32[0];
        ny = u3[1] - p32[1];
        nz = u3[2] - p32[2];
      }
      const e1 = [P2[1][0] - P2[0][0], P2[1][1] - P2[0][1], P2[1][2] - P2[0][2]], e2 = [P2[2][0] - P2[0][0], P2[2][1] - P2[0][1], P2[2][2] - P2[0][2]];
      const fx = e1[1] * e2[2] - e1[2] * e2[1], fy = e1[2] * e2[0] - e1[0] * e2[2], fz = e1[0] * e2[1] - e1[1] * e2[0];
      const order = fx * nx + fy * ny + fz * nz >= 0 ? [0, 1, 2] : [0, 2, 1];
      for (const i of order) out.push(P2[i][0], P2[i][1], P2[i][2], nx, ny, nz, col[0], col[1], col[2]);
    };
    const flat2 = (a, b, c, col, h, depth = 0) => {
      const lab = Math.hypot(a[0] - b[0], a[1] - b[1]), lbc = Math.hypot(b[0] - c[0], b[1] - c[1]), lca = Math.hypot(c[0] - a[0], c[1] - a[1]);
      const l = Math.max(lab, lbc, lca);
      if (l > 3 && depth < 12) {
        const m = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
        if (l === lab) {
          const ab = m(a, b);
          flat2(a, ab, c, col, h, depth + 1);
          flat2(ab, b, c, col, h, depth + 1);
        } else if (l === lbc) {
          const bc = m(b, c);
          flat2(a, b, bc, col, h, depth + 1);
          flat2(a, bc, c, col, h, depth + 1);
        } else {
          const ca = m(c, a);
          flat2(a, b, ca, col, h, depth + 1);
          flat2(ca, b, c, col, h, depth + 1);
        }
        return;
      }
      tri([a[0], a[1], h(a[0], a[1])], [b[0], b[1], h(b[0], b[1])], [c[0], c[1], h(c[0], c[1])], col);
    };
    const ox = mx0, oy = my0;
    const raisedH = (x, y) => ground(x, y) + CURB;
    const { V: V2, T, C: C2 } = d;
    for (let t = 0; t < C2.length; t++) {
      const cls = C2[t], ia = T[t * 3], ib = T[t * 3 + 1], ic = T[t * 3 + 2];
      const a = [ox + V2[ia * 2] * k, oy + V2[ia * 2 + 1] * k], b = [ox + V2[ib * 2] * k, oy + V2[ib * 2 + 1] * k], c = [ox + V2[ic * 2] * k, oy + V2[ic * 2 + 1] * k];
      if (cls < 64) {
        let col = COL[cls];
        if (cls === 5) {
          const v = lc((a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3);
          if (GRASSY.has(v)) col = COL.grass;
        }
        flat2(a, b, c, col, raisedH);
      } else {
        const zD = deckOwner(world2, (a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3);
        if (zD === null) {
          world2.groundH((a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, true);
          if (world2.g.water) continue;
        }
        flat2(a, b, c, COL[cls] || COL[64], (x, y) => surfaceH(world2, x, y, zD) + 0.015);
      }
    }
    for (const ln of d.lines) {
      const n = ln.xy.length / 2, hw = ln.w / 2, col = COL[64 + ln.col] || COL[64];
      if (n < 2) continue;
      const P2 = [];
      for (let i = 0; i < n; i++) P2.push([ox + ln.xy[i * 2] * k, oy + ln.xy[i * 2 + 1] * k]);
      const mid = P2[n >> 1], zD = deckOwner(world2, mid[0], mid[1]);
      if (zD === null) {
        world2.groundH(mid[0], mid[1], true);
        if (world2.g.water) continue;
      }
      const h = (x, y) => surfaceH(world2, x, y, zD) + 0.017;
      const N = [];
      for (let i = 0; i < n; i++) {
        const p = P2[Math.max(0, i - 1)], q = P2[Math.min(n - 1, i + 1)];
        let tx = q[0] - p[0], ty = q[1] - p[1];
        const l = Math.hypot(tx, ty) || 1;
        tx /= l;
        ty /= l;
        let m = 1;
        if (i > 0 && i < n - 1) {
          const ux = P2[i][0] - P2[i - 1][0], uy = P2[i][1] - P2[i - 1][1], ul = Math.hypot(ux, uy) || 1;
          m = 1 / Math.max(0.5, Math.abs(ux / ul * tx + uy / ul * ty));
        }
        N.push([ty * hw * m, -tx * hw * m]);
      }
      for (let i = 0; i + 1 < n; i++) {
        const a = P2[i], b = P2[i + 1], na = N[i], nb = N[i + 1];
        const L2 = [a[0] + na[0], a[1] + na[1]], R3 = [a[0] - na[0], a[1] - na[1]], L22 = [b[0] + nb[0], b[1] + nb[1]], R22 = [b[0] - nb[0], b[1] - nb[1]];
        flat2(L2, R3, R22, col, h);
        flat2(L2, R22, L22, col, h);
      }
    }
    for (const rg of d.rings) {
      const n = rg.xy.length / 2;
      for (let i = 0; i < n; i++) {
        if (rg.fl[i] === 2) continue;
        const j = (i + 1) % n;
        const ax = ox + rg.xy[i * 2] * k, ay = oy + rg.xy[i * 2 + 1] * k, bx = ox + rg.xy[j * 2] * k, by = oy + rg.xy[j * 2 + 1] * k;
        const L2 = Math.hypot(bx - ax, by - ay);
        if (L2 < 0.01) continue;
        const wx = (by - ay) / L2, wy = -(bx - ax) / L2, col = rg.fl[i] === 1 ? COL.kerb : COL.face;
        const m = Math.max(1, Math.ceil(L2 / 3));
        for (let s2 = 0; s2 < m; s2++) {
          const f0 = s2 / m, f1 = (s2 + 1) / m;
          const x0 = ax + (bx - ax) * f0, y0 = ay + (by - ay) * f0, x1 = ax + (bx - ax) * f1, y1 = ay + (by - ay) * f1;
          const g0 = ground(x0, y0), g1 = ground(x1, y1);
          cyl((x0 + x1) / 2, (y0 + y1) / 2, (g0 + g1) / 2, p32);
          cyl((x0 + x1) / 2 + wx, (y0 + y1) / 2 + wy, (g0 + g1) / 2, A);
          const want = [A[0] - p32[0], A[1] - p32[1], A[2] - p32[2]];
          tri([x0, y0, g0 + CURB], [x1, y1, g1 - 0.03], [x1, y1, g1 + CURB], col, want);
          tri([x0, y0, g0 + CURB], [x0, y0, g0 - 0.03], [x1, y1, g1 - 0.03], col, want);
        }
      }
    }
    const RX = reg.x0, RY = reg.y0;
    const R2 = st2.ramps && st2.ramps.byTile.get(tj * 64 + ti) || [];
    const tl0x = ti * TS, tl0y = tj * TS, Q = [0, 0];
    for (const r of R2) {
      if (r.fx < tl0x || r.fx >= tl0x + TS || r.fy < tl0y || r.fy >= tl0y + TS) continue;
      const on = (u, v, lift) => {
        rampAt(r, u, v, Q);
        const x = Q[0] + RX, y = Q[1] + RY;
        return [x, y, ground(x, y) + CURB * rampF(R2, Q[0], Q[1]) + lift];
      };
      const grid = (rows, cols, uv, col, lift) => {
        const G = [];
        for (let a = 0; a <= rows; a++) for (let b = 0; b <= cols; b++) G.push(on(...uv(a / rows, b / cols), lift));
        for (let a = 0; a < rows; a++) for (let b = 0; b < cols; b++) {
          const p = G[a * (cols + 1) + b], q = G[a * (cols + 1) + b + 1], s3 = G[(a + 1) * (cols + 1) + b], t = G[(a + 1) * (cols + 1) + b + 1];
          tri(p, q, t, col);
          tri(p, t, s3, col);
        }
        return G;
      };
      const rc = RAMP_COL[r.mat] || RAMP_COL[0], hw = r.W / 2, nm = Math.max(1, Math.ceil(r.W / RAMP_STEP)), nf = Math.max(1, Math.ceil(r.F / RAMP_STEP));
      const M = grid(3, nm, (fv, fu) => [(fu * 2 - 1) * hw, fv * r.D], rc, 0);
      const Rf = grid(3, nf, (fv, fu) => [hw + fu * r.F * (1 - fv), fv * r.D], rc, 0);
      const Lf = grid(3, nf, (fv, fu) => [-hw - (1 - fu) * r.F * (1 - fv), fv * r.D], rc, 0);
      const foot = [...Lf.slice(0, nf), ...M.slice(0, nm), ...Rf.slice(0, nf + 1)];
      for (let i = 0; i + 1 < foot.length; i++) {
        const [x0, y0, h0] = foot[i], [x1, y1, h12] = foot[i + 1];
        const g0 = ground(x0, y0), g1 = ground(x1, y1);
        const ex = x1 - x0, ey = y1 - y0, el = Math.hypot(ex, ey);
        if (el < 1e-4) continue;
        const wx = ey / el, wy = -ex / el;
        cyl((x0 + x1) / 2, (y0 + y1) / 2, (g0 + g1) / 2, p32);
        cyl((x0 + x1) / 2 + wx, (y0 + y1) / 2 + wy, (g0 + g1) / 2, A);
        const want = [A[0] - p32[0], A[1] - p32[1], A[2] - p32[2]];
        tri([x0, y0, h0], [x1, y1, g1 - 0.03], [x1, y1, h12], COL.kerb, want);
        tri([x0, y0, h0], [x0, y0, g0 - 0.03], [x1, y1, g1 - 0.03], COL.kerb, want);
      }
      if (r.fl & 1) {
        const pv0 = 0.05, pv1 = Math.max(pv0 + 0.2, Math.min(0.66, r.D - 0.05)), pw = Math.max(0.3, hw - 0.05);
        grid(1, Math.max(1, Math.ceil(2 * pw / RAMP_STEP)), (fv, fu) => [(fu * 2 - 1) * pw, pv0 + (pv1 - pv0) * fv], PANEL, 8e-3);
      }
    }
    for (const [px, py, kind] of d.pts) {
      if (kind !== 1) continue;
      const x = ox + px * k, y = oy + py * k;
      if (world2.nearestRoad(x, y) > 6) continue;
      const tx = world2._nr.tx, ty = world2._nr.ty;
      const a = 0.45, c = 0.3;
      const Q2 = [[-a, -c], [a, -c], [a, c], [-a, c]].map(([u, v]) => [x + tx * u + ty * v, y + ty * u - tx * v]);
      const h = (xx, yy) => ground(xx, yy) + 0.012;
      flat2(Q2[0], Q2[1], Q2[2], COL.basin, h);
      flat2(Q2[0], Q2[2], Q2[3], COL.basin, h);
    }
    return new Float32Array(out);
  }

  // src/worker.js
  var TUN_SHELL = 0.6;
  var _kbOwn = { left: 0, right: 0, mid: 0, hw: 0 };
  var TREE_H = [12.8, 14.4];
  var TREE_R = [3.9, 2.9];
  var world = null;
  var towers = [];
  var realBuildings = false;
  var measured = /* @__PURE__ */ new Set();
  var treeFiles = /* @__PURE__ */ new Set();
  var groundFiles = /* @__PURE__ */ new Set();
  var featFiles = /* @__PURE__ */ new Set();
  var streetFiles = /* @__PURE__ */ new Set();
  var lcPacks = /* @__PURE__ */ new Set();
  var LCP = 8192;
  var LCQ = 2048;
  var packCache = /* @__PURE__ */ new Map();
  var packPending = /* @__PURE__ */ new Map();
  var quadCache = [/* @__PURE__ */ new Map(), /* @__PURE__ */ new Map()];
  var quadPending = /* @__PURE__ */ new Map();
  var PACK_KEEP = 6;
  var QUAD_KEEP = [12, 5];
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
  var xsReady = null;
  var wallsReady = null;
  var liftedReady = null;
  var stationsReady = null;
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
    featFiles = new Set(meta.tiles && meta.tiles.feat ? meta.tiles.feat : []);
    streetFiles = new Set(meta.tiles && meta.tiles.streets ? meta.tiles.streets : []);
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
    const sf = meta.files && meta.files.stations;
    stationsReady = sf ? fetch(vurl("data/" + sf.file)).then((r) => r.ok ? r.json() : null).then((j) => {
      if (j) {
        setStations(j);
        world.setHidden(j.hide);
      }
    }).catch(() => {
    }) : null;
    const xf = meta.files && meta.files.xs;
    xsReady = xf ? fetch(vurl("data/" + xf.file)).then((r) => r.ok ? r.json() : null).then((j) => {
      if (!j || !j.r) return;
      const X = /* @__PURE__ */ new Map(), K = /* @__PURE__ */ new Map();
      for (const [k, v] of Object.entries(j.r)) X.set(+k, new Map(Object.entries(v).map(([ri, rec]) => [+ri, rec])));
      for (const [k, v] of Object.entries(j.k || {})) K.set(+k, new Map(Object.entries(v).map(([ri, rec]) => [+ri, rec])));
      setXS(X, K);
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
        const n = dv.getUint32(12, true), off2 = new Uint32Array(n), len = new Uint32Array(n);
        for (let q = 0; q < n; q++) {
          off2[q] = dv.getUint32(16 + q * 8, true);
          len[q] = dv.getUint32(20 + q * 8, true);
        }
        const p = { buf, off: off2, len, last: world.tick };
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
  async function readParts(reg, rx, ry, which, got) {
    const missing = [];
    const all = which.map((dir) => got && got[dir] || fetchPart(dir, rx, ry).then((e) => ({ e }), (err) => ({ err })));
    for (let i = 0; i < which.length; i++) {
      const dir = which[i];
      try {
        const r = await all[i];
        if (r.err) throw r.err;
        const e = r.e;
        if (dir === "b3") reg.real = parseReal(e.buffer.slice(e.byteOffset, e.byteOffset + e.byteLength));
        else if (dir === "g3") reg.ground = parseGround(e);
        else if (dir === "f1") reg.feat = parseFeat(e);
        else if (dir === "s1") reg.streets = parseStreets(e);
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
          const parts = [];
          if (measured.has(k)) parts.push("b3");
          if (treeFiles.has(k)) parts.push("t3");
          if (groundFiles.has(k)) parts.push("g3");
          if (featFiles.has(k)) parts.push("f1");
          if (streetFiles.has(k)) parts.push("s1");
          const got = {};
          for (const dir of parts) got[dir] = fetchPart(dir, rx, ry).then((e) => ({ e }), (err) => ({ err }));
          const d = await fetchPart("r2", rx, ry);
          const reg = parseRegion(d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength), rx, ry);
          await readParts(reg, rx, ry, parts, got);
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
        world.trimRegions(10);
      })();
      pending.set(k, pr);
    }
    return pr;
  }
  function inRightOfWay(reg, mx, my) {
    const f = reg && reg.feat;
    if (!f || !f.nL) return false;
    if (!reg.row) {
      const G = /* @__PURE__ */ new Map();
      for (let l = 0; l < f.nL; l++) {
        if (f.lKind[l] === 1) continue;
        const kv = f.lKv[l], a = f.lStart[l], e = a + f.lCount[l];
        let tower = false;
        for (let v = a; v < e; v++) if (f.lk[v] === 1) {
          tower = true;
          break;
        }
        const hw = kv >= 300 ? 30 : kv >= 100 || kv === 0 && tower ? 17 : kv >= 60 ? 12 : 0;
        if (!hw) continue;
        for (let v = a; v + 1 < e; v++) {
          const x0 = f.lx[v], y0 = f.ly[v], x1 = f.lx[v + 1], y1 = f.ly[v + 1];
          for (let cy = Math.floor((Math.min(y0, y1) - hw) / 64); cy <= Math.floor((Math.max(y0, y1) + hw) / 64); cy++)
            for (let cx = Math.floor((Math.min(x0, x1) - hw) / 64); cx <= Math.floor((Math.max(x0, x1) + hw) / 64); cx++) {
              const k = cy * 4096 + cx;
              if (!G.has(k)) G.set(k, []);
              G.get(k).push(x0, y0, x1, y1, hw);
            }
        }
      }
      reg.row = G;
    }
    const lx = mx - reg.x0, ly = my - reg.y0, L2 = reg.row.get(Math.floor(ly / 64) * 4096 + Math.floor(lx / 64));
    if (!L2) return false;
    for (let i = 0; i < L2.length; i += 5) {
      const ax = L2[i], ay = L2[i + 1], dx = L2[i + 2] - ax, dy = L2[i + 3] - ay, l2 = dx * dx + dy * dy;
      const t = l2 > 0 ? Math.max(0, Math.min(1, ((lx - ax) * dx + (ly - ay) * dy) / l2)) : 0;
      if (Math.hypot(lx - ax - dx * t, ly - ay - dy * t) < L2[i + 4]) return true;
    }
    return false;
  }
  function overMouth(reg, mx, my, h) {
    return !!(reg && reg.nTun && world.nearestTunnel(mx, my) < 3 + TUN_SHELL && world._nt.z + TUN_H + TUN_SHELL + 1.5 > h);
  }
  function surveyedAt(mx, my) {
    const rx = Math.floor(mx / RS2), wy = wrapY(my);
    if (rx < 0 || rx >= RNX) return false;
    const rg = world.regions.get(Math.floor(wy / RS2) * RNX + rx);
    return !!(rg && rg.streets && streetsCovered(rg.streets, mx - rg.x0, wy - rg.y0));
  }
  function shoreNear(mx0, my0, s) {
    for (let j = 0; j <= 8; j++) for (let i = 0; i <= 8; i++) {
      const mx = mx0 + i / 8 * s, my = my0 + j / 8 * s;
      if (surveyedAt(mx, my) && (Math.abs(world.sdfAt(mx, my)) < 200 || Math.abs(world.sdfCoarseAt(mx, my)) < 200)) return true;
    }
    return false;
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
    const gw = reg.gw, f = (v) => clamp2(Math.floor((v + 160) / 128), 0, gw - 1);
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
    let off2 = null, wside = null;
    if (walls && cell <= 12) {
      off2 = new Float32Array(G * G * 2);
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
        let across3 = false;
        for (let b = -1; b <= 1 && !across3; b++) for (let a = -1; a <= 1; a++) {
          const jj = j + b, ii = i + a;
          if ((a || b) && jj >= 0 && jj < G && ii >= 0 && ii < G && crossesWall(wside, o, jj * G + ii, a * cell, b * cell)) {
            across3 = true;
            break;
          }
        }
        if (!across3) continue;
        const sd = wside[o * 4], mv = (sd > 0 ? 0.08 : -0.08) - sd;
        off2[o * 2] = wside[o * 4 + 1] * mv;
        off2[o * 2 + 1] = wside[o * 4 + 2] * mv;
      }
    }
    const hs = new Float32Array(G * G);
    let hmin = 1e9, hmax = -1e9;
    for (let j = 0; j < G; j++) {
      const my = my0 + (j - 1) * cell;
      for (let i = 0; i < G; i++) {
        const o = j * G + i;
        const h = sea ? 0 : off2 ? world.groundH(mx0 + (i - 1) * cell + off2[o * 2], my + off2[o * 2 + 1], carve, !realBuildings) : world.groundH(mx0 + (i - 1) * cell, my, carve, !realBuildings);
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
    const across2 = (o, p) => wside && wside[o * 4 + 3] && crossesWall(wside, o, p, (p % G - o % G) * cell, (Math.floor(p / G) - Math.floor(o / G)) * cell);
    for (let j = 0; j <= N; j++) {
      const my = my0 + j * cell;
      for (let i = 0; i <= N; i++) {
        const o = (j + 1) * G + i + 1;
        let dx, dy;
        if (!wside) {
          dx = (hs[o + 1] - hs[o - 1]) / (2 * cell);
          dy = (hs[o + G] - hs[o - G]) / (2 * cell);
        } else {
          const l = across2(o, o - 1), r = across2(o, o + 1), d = across2(o, o - G), u = across2(o, o + G);
          dx = l && r ? 0 : l ? (hs[o + 1] - hs[o]) / cell : r ? (hs[o] - hs[o - 1]) / cell : (hs[o + 1] - hs[o - 1]) / (2 * cell);
          dy = d && u ? 0 : d ? (hs[o + G] - hs[o]) / cell : u ? (hs[o] - hs[o - G]) / cell : (hs[o + G] - hs[o - G]) / (2 * cell);
        }
        const il = 1 / Math.hypot(dx, dy, 1);
        const k = (j * N1 + i) * 3;
        nrm[k] = -dx * il;
        nrm[k + 1] = -dy * il;
        nrm[k + 2] = il;
        const ox = off2 ? off2[o * 2] : 0, oy = off2 ? off2[o * 2 + 1] : 0;
        put(v++, mx0 + i * cell + ox, my + oy, hs[o], nrm[k], nrm[k + 1], nrm[k + 2], i * cell + ox, j * cell + oy);
      }
    }
    const edge = (i, j) => {
      const o = (j + 1) * G + i + 1, k = (j * N1 + i) * 3;
      const ox = off2 ? off2[o * 2] : 0, oy = off2 ? off2[o * 2 + 1] : 0;
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
      const data = new Uint16Array(T * T * 4), kind = new Uint8Array(T * T * 4);
      let any = false;
      const far = toHalf(60), one = toHalf(1), zero = toHalf(0);
      for (let b = 0; b < T; b++) {
        const my = my0 + b / (T - 1) * s;
        for (let a = 0; a < T; a++) {
          const mx = mx0 + a / (T - 1) * s, k = (b * T + a) * 4;
          const e = world.nearestRoad(mx, my);
          const sr = world.regionAt(mx, my);
          if (sr && sr.streets && streetsCovered(sr.streets, mx - sr.x0, my - sr.y0) && !(e < 3 && world._nr.reg.rCls[world._nr.road] >= 14)) {
            const dd = streetsPaving(sr.streets, mx - sr.x0, my - sr.y0);
            const nr0 = world._nr;
            const onStreet = e < 4 && dd < 0.5 && nr0.reg.rCls[nr0.road] < 14 && !(nr0.reg.rFlags[nr0.road] & 6);
            const xs0 = onStreet ? xsOf(nr0.reg, nr0.road) : void 0;
            const painted = streetsPainted(sr.streets, mx - sr.x0, my - sr.y0);
            let kb = null;
            if (onStreet && (redone(xs0) || !painted && (roadKindXS(nr0.reg, nr0.road, xs0) & 3 || xs0 && (xs0[1] || xs0[4])))) {
              kb = kerbsAt(nr0.reg, nr0.road, nr0.s - nr0.reg.cum[nr0.reg.rStart[nr0.road]]);
              if (!kb && !painted) {
                _kbOwn.left = -nr0.hw;
                _kbOwn.right = nr0.hw;
                _kbOwn.mid = 0;
                _kbOwn.hw = nr0.hw;
                kb = _kbOwn;
              }
            }
            const tsr = Math.min(nr0.d, 60) * nr0.side;
            if (kb && tsr > kb.left - 0.6 && tsr < kb.right + 0.6) {
              const ph = nr0.s / DASH * 2 * Math.PI, kk = (b * T + a) * 4;
              data[k] = toHalf(tsr - kb.mid);
              data[k + 1] = toHalf(kb.hw);
              data[k + 2] = toHalf(Math.cos(ph));
              data[k + 3] = toHalf(Math.sin(ph));
              let kd = roadKindXS(nr0.reg, nr0.road, xs0) & ~(64 | 32 | 128);
              if (!(kd & 3)) kd = kd & ~31 | (nr0.reg.rFlags[nr0.road] & 1 ? 2 : 1) | 1 << 2;
              kind[kk] = kd | 32;
              kind[kk + 1] = Math.round(clamp2((dd + 1.5) / 6, 0, 1) * 255);
              kind[kk + 2] = xs0 ? bikeByte(xs0[1], xs0[2], xs0[3]) : 0;
              kind[kk + 3] = xs0 ? bikeByte(xs0[4], xs0[5], xs0[6]) : 0;
              any = true;
              continue;
            }
            if (dd < 4.5) {
              data[k] = zero;
              data[k + 1] = one;
              data[k + 2] = one;
              data[k + 3] = zero;
              kind[(b * T + a) * 4] = 3 | 7 << 2 | (_pave.unpaved ? 32 : 0);
              kind[(b * T + a) * 4 + 1] = Math.round(clamp2((dd + 1.5) / 6, 0, 1) * 255);
              any = true;
            } else {
              data[k] = far;
              data[k + 1] = zero;
              data[k + 2] = one;
              data[k + 3] = zero;
              kind[(b * T + a) * 4 + 1] = 255;
            }
            continue;
          }
          if (e < 56) {
            const nr = world._nr, ph = nr.s / DASH * 2 * Math.PI;
            const notSt = nr.reg.rCls[nr.road] >= 14;
            const canon = notSt && (nr.tx < -1e-3 || nr.tx <= 1e-3 && nr.ty < 0) ? -1 : 1;
            data[k] = toHalf(Math.min(nr.d, 60) * nr.side * canon);
            data[k + 1] = toHalf(nr.hw + (notSt ? 8e-3 * (nr.road & 7) : 0));
            data[k + 2] = toHalf(Math.cos(ph));
            data[k + 3] = toHalf(Math.sin(ph));
            const kk = (b * T + a) * 4;
            kind[kk] = roadKind(nr.reg, nr.road);
            kind[kk + 1] = Math.round(clamp2((nr.u + 1.5) / 6, 0, 1) * 255);
            if (nr.d < nr.hw + 0.5 && world.outrankedBy(mx, my) < 1.6) kind[kk] |= 128;
            const xs = (kind[kk] & 3) !== 3 ? xsOf(nr.reg, nr.road) : void 0;
            if (xs) {
              kind[kk] = kind[kk] & 128 | roadKindXS(nr.reg, nr.road, xs);
              kind[kk + 2] = bikeByte(xs[1], xs[2], xs[3]);
              kind[kk + 3] = bikeByte(xs[4], xs[5], xs[6]);
            }
            any = true;
          } else {
            data[k] = far;
            data[k + 1] = zero;
            data[k + 2] = one;
            data[k + 3] = zero;
            kind[(b * T + a) * 4 + 1] = 255;
          }
        }
      }
      if (any) {
        road = data;
        roadK = kind;
      }
    }
    let tun = null, shore = false;
    const wantTun = reg && reg.nTun && level >= 6 && tunnelsNear(reg, mx0, my0, s), wantShore = level >= 6 && shoreNear(mx0, my0, s);
    if (wantTun || wantShore) {
      const nc = wantShore ? 4 : 2, data = new Uint16Array(T * T * nc);
      let any = false;
      const far = toHalf(30), none = toHalf(-1e3), zero = toHalf(0), one = toHalf(1);
      for (let b = 0; b < T; b++) {
        const my = my0 + b / (T - 1) * s;
        for (let a = 0; a < T; a++) {
          const mx = mx0 + a / (T - 1) * s, k = (b * T + a) * nc;
          const e = wantTun ? world.nearestTunnel(mx, my) : 1e9;
          if (e < 12) {
            data[k] = toHalf(e - TUN_SHELL);
            data[k + 1] = toHalf(world._nt.z + TUN_H + TUN_SHELL);
            any = true;
          } else {
            data[k] = far;
            data[k + 1] = none;
          }
          if (wantShore) {
            if (surveyedAt(mx, my)) {
              data[k + 2] = toHalf(world.sdfAt(mx, my));
              data[k + 3] = one;
              any = true;
            } else {
              data[k + 2] = zero;
              data[k + 3] = zero;
            }
          }
        }
      }
      if (any) {
        tun = data;
        shore = wantShore;
      }
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
    if (level >= 6 && !sea) {
      const reg2 = world.regionAt(mx0 + s / 2, my0 + s / 2);
      if (reg2 && reg2.feat && reg2.feat.nA) [lc, lcN] = paintAreas(reg2, lc, lcN, mx0, my0, s);
    }
    const res = { type: "chunk", id: q.id, key: q.key, level, ix, iy, n: N, sea, pos, nor, loc, center: [cx, cy, cz], sphere: [bcx, bcy, bcz, brad], hmin, hmax, road, roadK, roadT: T, roadsChecked: level >= 6 && !!reg, tun, shore, lc, lcN, size: s, mx0, my0 };
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
    if (kind === "streets") {
      const arr2 = reg && reg.streets ? streetTris(world, reg, mx0, my0, s, cx, cy, cz, lcAt) : new Float32Array(0);
      postMessage({ type: "scatter", id: q.id, key: q.key, kind, center: [cx, cy, cz], my: my0 + s / 2, data: arr2, stride: 9 }, [arr2.buffer]);
      return;
    }
    if (kind === "signs" || kind === "paint" || kind === "gpaint" || kind === "rails" || kind === "power" || kind === "pwires") {
      const fn = kind === "signs" ? signItems : kind === "paint" ? paintTris : kind === "gpaint" ? groundPaint : kind === "rails" ? railTris : kind === "power" ? powerItems : powerWires;
      const arr2 = reg ? fn(world, reg, mx0, my0, s, cx, cy, cz) : new Float32Array(0);
      const stride = kind === "signs" ? 7 : kind === "paint" || kind === "gpaint" || kind === "rails" ? 9 : kind === "power" ? 5 : 6;
      postMessage({ type: "scatter", id: q.id, key: q.key, kind, center: [cx, cy, cz], my: my0 + s / 2, data: arr2, stride }, [arr2.buffer]);
      return;
    }
    if (kind === "trees" || kind === "clumps") {
      const sp2 = kind === "trees" ? 8.5 : 30, order = [];
      const n2 = Math.round(s / sp2), cell2 = s / n2;
      const cs = RS2 / 32;
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
        const lx = mx - reg.x0, ly = my - reg.y0, ts = RS2 / cg.T;
        const tx = Math.floor(lx / ts), ty = Math.floor(ly / ts);
        if (tx < 0 || ty < 0 || tx >= cg.T || ty >= cg.T || cg.mode[ty * cg.T + tx] !== 1) return false;
        const k = Math.min(cg.cn - 1, Math.floor(ly / RS2 * cg.cn)) * cg.cn + Math.min(cg.cn - 1, Math.floor(lx / RS2 * cg.cn));
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
        if (inRightOfWay(reg, mx, my)) continue;
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
        const wide = 0.75 + 0.65 * hash2(gi + 3, gj + 29), measuredClump = seen && kind === "clumps";
        const sc = measuredClump ? tall / 16 : seen && kind === "trees" ? clamp2(tall * 1.15 * (0.82 + 0.36 * hash2(gi + 3, gj + 29)) / TREE_H[conifer], 0.25, 2.9) : wide;
        out.push(p32[0] - cx, p32[1] - cy, p32[2] - cz, sc, r1 * 6.2832, conifer, hash2(gi + 57, gj + 5), measuredClump ? wide : 0);
        order.push(hash2(gi * 13 + 1, gj * 17 + 5));
      }
      if (tI >= 0) {
        const q0 = tr.off[tI], q1 = tr.off[tI + 1], nn = new Float32Array(q1 - q0).fill(99), cell3 = 8, gw = Math.ceil(s / cell3) + 1, grid = /* @__PURE__ */ new Map();
        for (let q2 = q0; q2 < q1; q2++) {
          const k = Math.floor((tr.rec[q2 * 4 + 1] + 0.5) * s / 256 / cell3) * gw + Math.floor((tr.rec[q2 * 4] + 0.5) * s / 256 / cell3);
          if (!grid.has(k)) grid.set(k, []);
          grid.get(k).push(q2);
        }
        for (let q2 = q0; q2 < q1; q2++) {
          const x = (tr.rec[q2 * 4] + 0.5) * s / 256, y = (tr.rec[q2 * 4 + 1] + 0.5) * s / 256, ci = Math.floor(x / cell3), cj = Math.floor(y / cell3);
          let best = 99;
          for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
            const L2 = grid.get((cj + dj) * gw + ci + di);
            if (L2) {
              for (const p of L2) if (p !== q2) best = Math.min(best, Math.hypot((tr.rec[p * 4] + 0.5) * s / 256 - x, (tr.rec[p * 4 + 1] + 0.5) * s / 256 - y));
            }
          }
          nn[q2 - q0] = best;
        }
        for (let q2 = tr.off[tI]; q2 < tr.off[tI + 1]; q2++) {
          let mx = mx0 + (tr.rec[q2 * 4] + 0.5) * s / 256, my = my0 + (tr.rec[q2 * 4 + 1] + 0.5) * s / 256;
          const tall = tr.rec[q2 * 4 + 2] * 0.25;
          const e = world.nearestRoad(mx, my);
          if (e < 1.5 && world._nr.reg.rCls[world._nr.road] >= 14 && world._nr.reg.rCls[world._nr.road] <= 15) continue;
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
          const rad = (tr.kinds ? tr.rec[q2 * 4 + 3] & 127 : tr.rec[q2 * 4 + 3]) * 0.1;
          const crown = clamp2(Math.min(rad || 3, Math.max(1, 0.6 * nn[q2 - tr.off[tI]])), 0.8, 12.7);
          out.push(
            p32[0] - cx,
            p32[1] - cy,
            p32[2] - cz,
            clamp2(tall / (conifer ? TREE_H[1] : TREE_H[0]), 0.22, 2.9),
            hash2(gi * 3 + 1, gj * 3 + 7) * 6.2832,
            conifer,
            hash2(gi + 57, gj + 5),
            crown / (conifer ? TREE_R[1] : TREE_R[0])
          );
          order.push(hash2(gi * 13 + 1, gj * 17 + 5));
        }
      }
      const nT = order.length, perm = Array.from({ length: nT }, (_, i) => i).sort((a, b) => order[a] - order[b]);
      const arr2 = new Float32Array(nT * 8);
      for (let i = 0; i < nT; i++) for (let k = 0; k < 8; k++) arr2[i * 8 + k] = out[perm[i] * 8 + k];
      postMessage({ type: "scatter", id: q.id, key: q.key, kind, center: [cx, cy, cz], my: my0 + s / 2, data: arr2, stride: 8 }, [arr2.buffer]);
      return;
    }
    if (kind === "decks") {
      const t = buildDeckTile(world, reg, ix, iy, s, cx, cy, cz, (my0 + s / 2) / R, NBI);
      const msg = { type: "scatter", id: q.id, key: q.key, kind, center: [cx, cy, cz], my: my0 + s / 2, house: t, data: new Float32Array(0), stride: 1 };
      postMessage(msg, t ? [t.pos.buffer, t.nor.buffer, t.uv.buffer, t.w.buffer, t.m.buffer, t.c.buffer, t.k.buffer, t.idx.buffer].concat(t.j ? [t.j.buffer] : [], t.t ? [t.t.buffer] : []) : []);
      return;
    }
    if (kind === "houses") {
      const cs = RS2 / 32;
      const list = reg ? cellBuildings(reg, Math.floor((mx0 + s / 2 - reg.x0) / cs), Math.floor((my0 + s / 2 - reg.y0) / cs)) : null;
      const sel = [];
      if (list) for (let k = 0; k < list.length; k += 16) {
        const mx = list[k], my = list[k + 1];
        if (mx >= mx0 && mx < mx0 + s && my >= my0 && my < my0 + s) sel.push(k);
      }
      const t = sel.length ? buildHouseTile(world, list, sel, cx, cy, cz, (my0 + s / 2) / R, reg) : null;
      const msg = { type: "scatter", id: q.id, key: q.key, kind, center: [cx, cy, cz], my: my0 + s / 2, house: t, data: new Float32Array(0), stride: 1 };
      postMessage(msg, t ? [t.pos.buffer, t.nor.buffer, t.uv.buffer, t.w.buffer, t.m.buffer, t.c.buffer, t.k.buffer, t.idx.buffer].concat(t.j ? [t.j.buffer] : [], t.t ? [t.t.buffer] : []) : []);
      return;
    }
    if (realBuildings) {
      const cs = RS2 / 32;
      const list = reg ? cellBuildings(reg, Math.round((mx0 - reg.x0) / cs), Math.round((my0 - reg.y0) / cs)) : null;
      if (list) for (let k = 0; k < list.length; k += 16) farBoxes(world, list, k, reg, cx, cy, cz, out);
      const arr2 = new Float32Array(out);
      postMessage({ type: "scatter", id: q.id, key: q.key, kind, center: [cx, cy, cz], my: my0 + s / 2, data: arr2, stride: 17 }, [arr2.buffer]);
      return;
    }
    const sp = 27, n = Math.round(s / sp), cell = s / n;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const gi = Math.round(mx0 / cell) + i, gj = Math.round(my0 / cell) + j;
      const r1 = hash2(gi * 3 + 2, gj * 3 + 9), r2 = hash2(gi * 5 + 4, gj * 5 + 1), r3 = hash2(gi * 7 + 8, gj * 7 + 3), r4 = hash2(gi + 41, gj + 77), r5 = hash2(gi + 5, gj + 141);
      const mx = mx0 + (i + 0.25 + 0.5 * r1) * cell, my = my0 + (j + 0.25 + 0.5 * r2) * cell;
      const dev = world.coverBilinear(mx, my, 0);
      const p = clamp2((dev - 0.1) * 1.2, 0, 0.9);
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
        nor[i * 3 + 1] = clamp2(Math.round(nn * s + nu * c), -127, 127);
        nor[i * 3 + 2] = clamp2(Math.round(-nn * c + nu * s), -127, 127);
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
      if (m.type === "prefetch") {
        for (const [rx, ry] of m.regions) {
          const r = world.regions.get(regionKey(rx, ry));
          if (r) r.used = world.tick;
          else ensureRegion(rx, ry);
        }
        if (lcPacks.size) for (const [x, y] of (m.points || []).slice(1, 4)) lcPromises(x - 250, y - 250, 500, 0);
        return;
      }
      world.tick++;
      jobDegraded = false;
      if (m.type === "scatter" || m.level >= 5) {
        const s2 = ROOT / (1 << m.level);
        const rx = Math.floor((m.ix + 0.5) * s2 / RS2), ry = Math.floor((m.iy + 0.5) * s2 / RS2), k = regionKey(rx, ry);
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
      if (stationsReady) await stationsReady;
      if (xsReady) await xsReady;
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
