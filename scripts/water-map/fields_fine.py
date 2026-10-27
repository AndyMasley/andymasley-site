"""Irrigated fields up close: LANID 2015 (Xie, Gibbs and Lark 2021; 30 m, EPSG:5070) resampled onto the lower-48
slab's texture grid at F = 12 times the colour texture's resolution (about 65 m), so a center pivot (about 800 m across)
is a disc a dozen pixels wide. With the USDA Cropland Data Layer for 2015 (also 30 m, EPSG:5070), each pixel also
carries what the irrigated land under it grew.

Each output pixel takes the 30 m pixels under its footprint (a box 65 m wide around its centre, projected into
EPSG:5070), weighted by how much of each the box covers:
  level = round(7 x the irrigated share of the mapped area), in eighths 0..7;
  crop  = the crop group (CROPS, 1..31) with the most irrigated weight, 0 where nothing under it was irrigated (or,
          with --all, the group with the most weight of any kind, so fields that were not irrigated keep their crop).
Byte = crop + 32 x level. Sheets of 2048 x 2048 pixels (4 x 4 tiles of 512), written only where some pixel is non-zero,
as 8-bit PNG: fields_<sx>_<sy>.png, with fields_manifest.json (sheets and the tiles in each that hold anything).

Run on the computer the rasters were downloaded to (Python 3, numpy and Pillow only):

  python3 fields_fine.py lanid2015.tif lanid2015_irr240m.npz outdir [2015_30m_cdls.tif] [--all] [--sheets sx,sy;...] [--part k,n]

(--part k,n: only every n-th sheet from the k-th, for n processes at once; each writes fields_manifest_<k>.json.
--budget s: start no sheet after s seconds; each finished sheet is listed in done_<k>.txt and skipped by the next run,
so a long job can run as a series of short ones. bake_fields.py reads the sheets themselves, not the manifests.)

The GeoTIFFs are read tile by tile (classic or BigTIFF, LZW, Deflate or PackBits, as Pillow decodes them), so neither
is ever loaded whole.
"""
import io, json, math, os, struct, sys, time, collections, numpy as np
from PIL import Image
Image.MAX_IMAGE_PIXELS = None

# ---- the lower-48 slab (scripts/water-map/proj.py LOWER48; conus_meta.json)
K = 1240.583314171773
TX, TY = 528.2480705172319, 315.4452552440835
D2R = np.pi / 180.0
class ConicEA:
    """spherical conic equal-area, as d3-geo (the map's own projection; copied from proj.py so this runs alone)"""
    def __init__(self, rotate_lon, center, parallels, scale, translate):
        self.l0 = -rotate_lon
        p1, p2 = parallels[0] * D2R, parallels[1] * D2R
        sy0 = np.sin(p1)
        self.n = (sy0 + np.sin(p2)) / 2.0
        self.c = 1 + sy0 * (2 * self.n - sy0)
        self.r0 = np.sqrt(self.c) / self.n
        self.k = scale
        cx, cy = self._raw(center[0] * D2R, center[1] * D2R)
        self.tx = translate[0] - self.k * cx
        self.ty = translate[1] + self.k * cy
    def _raw(self, lam, phi):
        r = np.sqrt(self.c - 2 * self.n * np.sin(phi)) / self.n
        return r * np.sin(lam * self.n), self.r0 - r * np.cos(lam * self.n)
    def inverse(self, X, Y):
        x = (np.asarray(X) - self.tx) / self.k
        y = -(np.asarray(Y) - self.ty) / self.k
        r0y = self.r0 - y
        lam = np.arctan2(x, np.abs(r0y)) * np.sign(r0y)
        rr = np.hypot(x, r0y)
        phi = np.arcsin(np.clip((self.c - rr * rr * self.n * self.n) / (2 * self.n), -1, 1))
        lon = (lam / self.n) / D2R + self.l0
        return (lon + 180.0) % 360.0 - 180.0, phi / D2R
LOWER48 = ConicEA(96, (-0.6, 38.7), (29.5, 45.5), K, (TX, TY))
X0S, Z0S, PPU, TEXW, TEXH = 58.7, 14.8, 6.535, 6144, 3989
F = 12
TILE, PER = 512, 4
SHEET = TILE * PER
WF, HF = TEXW * F, TEXH * F

# ---- EPSG:5070, NAD83 / Conus Albers (GRS80): Snyder (1987), equations 14-3 to 14-6
A_ = 6378137.0; FL = 1 / 298.257222101; E2 = FL * (2 - FL); E_ = math.sqrt(E2)
def _q(s): return (1 - E2) * (s / (1 - E2 * s * s) - (1 / (2 * E_)) * np.log((1 - E_ * s) / (1 + E_ * s)))
def _m(phi): s = np.sin(phi); return np.cos(phi) / np.sqrt(1 - E2 * s * s)
_P1, _P2, _P0, _L0 = 29.5 * D2R, 45.5 * D2R, 23.0 * D2R, -96.0 * D2R
_M1, _M2 = _m(_P1), _m(_P2)
_Q1, _Q2, _Q0 = _q(math.sin(_P1)), _q(math.sin(_P2)), _q(math.sin(_P0))
_N = (_M1 ** 2 - _M2 ** 2) / (_Q2 - _Q1); _C = _M1 ** 2 + _N * _Q1; _RHO0 = A_ * math.sqrt(_C - _N * _Q0) / _N
def albers(lon, lat):
    rho = A_ * np.sqrt(_C - _N * _q(np.sin(np.asarray(lat) * D2R))) / _N
    th = _N * (np.asarray(lon) * D2R - _L0)
    return rho * np.sin(th), _RHO0 - rho * np.cos(th)

# ---- crop groups from Cropland Data Layer codes (NASS CDL legend); double crops go with their first crop
CROPS = ['', 'Corn', 'Soybeans', 'Cotton', 'Rice', 'Sorghum', 'Wheat', 'Alfalfa', 'Other hay', 'Barley, oats and other grains',
         'Sugar beets', 'Potatoes', 'Dry beans and peas', 'Peanuts', 'Sunflowers, canola and other oilseeds', 'Vegetables and melons',
         'Almonds', 'Walnuts, pecans and pistachios', 'Citrus', 'Grapes', 'Other orchards', 'Berries', 'Sugarcane', 'Tobacco',
         'Other crops', 'Fallow or idle', 'Grass and pasture', 'Developed land', 'Woods, wetland or other natural cover', 'Open water']
G = {c: i for i, c in enumerate(CROPS)}
CDL_GROUP = np.zeros(256, np.uint8)
def _set(group, codes):
    for c in codes: CDL_GROUP[c] = G[group]
_set('Corn', [1, 12, 13, 225, 226, 237, 241])
_set('Soybeans', [5, 239, 240, 254])
_set('Cotton', [2, 232, 238])
_set('Rice', [3])
_set('Sorghum', [4, 234])
_set('Wheat', [22, 23, 24, 26, 230, 236])
_set('Alfalfa', [36])
_set('Other hay', [37, 58])
_set('Barley, oats and other grains', [21, 25, 27, 28, 29, 30, 39, 205, 233, 235])
_set('Sugar beets', [41])
_set('Potatoes', [43])
_set('Dry beans and peas', [42, 51, 52, 53])
_set('Peanuts', [10])
_set('Sunflowers, canola and other oilseeds', [6, 31, 32, 33, 34, 35, 38])
_set('Vegetables and melons', [46, 47, 48, 49, 50, 54, 206, 207, 208, 209, 213, 214, 216, 219, 222, 224, 227, 229, 231, 243, 244, 245, 246, 247, 248, 249])
_set('Almonds', [75])
_set('Walnuts, pecans and pistachios', [74, 76, 204])
_set('Citrus', [72, 212])
_set('Grapes', [69])
_set('Other orchards', [66, 67, 68, 70, 71, 77, 210, 211, 215, 217, 218, 220, 223])
_set('Berries', [55, 221, 242, 250])
_set('Sugarcane', [45])
_set('Tobacco', [11])
_set('Other crops', [14, 44, 56, 57, 60])
_set('Fallow or idle', [61])
_set('Grass and pasture', [59, 62, 176])
_set('Developed land', [82, 121, 122, 123, 124])
_set('Woods, wetland or other natural cover', [63, 64, 65, 81, 87, 88, 92, 112, 131, 141, 142, 143, 152, 190, 195])
_set('Open water', [83, 111])

# ---- a GeoTIFF read tile by tile
TYPES = {1: ('B', 1), 2: ('B', 1), 3: ('H', 2), 4: ('I', 4), 5: ('I', 8), 6: ('b', 1), 7: ('B', 1), 8: ('h', 2), 9: ('i', 4), 10: ('i', 8),
         11: ('f', 4), 12: ('d', 8), 16: ('Q', 8), 17: ('q', 8), 18: ('Q', 8)}
class TiledTiff:
    def __init__(self, fn, fill=0):
        self.fn = fn; self.f = open(fn, 'rb'); self.fill = fill
        h = self.f.read(16)
        self.bo = '<' if h[:2] == b'II' else '>'
        self.big = struct.unpack(self.bo + 'H', h[2:4])[0] == 43
        off = struct.unpack(self.bo + 'Q', h[8:16])[0] if self.big else struct.unpack(self.bo + 'I', h[4:8])[0]
        t = self.tags = self._ifd(off)
        self.W, self.H = int(t[256][0]), int(t[257][0])
        self.comp = int(t.get(259, [1])[0]); self.pred = int(t.get(317, [1])[0]); self.bps = int(t.get(258, [8])[0])
        if self.bps != 8: raise SystemExit(f'{fn}: {self.bps}-bit samples are not supported here')
        if 322 in t:
            self.strips = False
            self.tw, self.th = int(t[322][0]), int(t[323][0])
            self.offs = np.asarray(t[324], np.int64); self.cnts = np.asarray(t[325], np.int64)
        else:
            # a striped TIFF: each strip is a tile as wide as the image
            self.strips = True
            self.tw, self.th = self.W, int(t.get(278, [self.H])[0])
            self.offs = np.asarray(t[273], np.int64); self.cnts = np.asarray(t[279], np.int64)
        sc, tie = t[33550], t[33922]
        self.res = float(sc[0])
        self.x0 = float(tie[3]) - float(tie[0]) * self.res; self.y0 = float(tie[4]) + float(tie[1]) * float(sc[1])
        self.ntx = (self.W + self.tw - 1) // self.tw; self.nty = (self.H + self.th - 1) // self.th
        self.cache = collections.OrderedDict(); self.same = {}; self.cached = 0
    def _ifd(self, off):
        f, bo = self.f, self.bo
        f.seek(off)
        n = struct.unpack(bo + ('Q' if self.big else 'H'), f.read(8 if self.big else 2))[0]
        esz = 20 if self.big else 12
        raw = f.read(n * esz); tags = {}
        for k in range(n):
            e = raw[k * esz:(k + 1) * esz]
            if self.big: tag, typ, cnt = struct.unpack(bo + 'HHQ', e[:12]); val = e[12:20]; inline = 8
            else: tag, typ, cnt = struct.unpack(bo + 'HHI', e[:8]); val = e[8:12]; inline = 4
            fmt, sz = TYPES.get(typ, ('B', 1))
            nb = sz * cnt
            if nb <= inline: data = val[:nb]
            else:
                ptr = struct.unpack(bo + ('Q' if self.big else 'I'), val)[0]
                cur = f.tell(); f.seek(ptr); data = f.read(nb); f.seek(cur)
            if typ in (5, 10): a = np.frombuffer(data, bo + fmt).reshape(-1, 2); tags[tag] = (a[:, 0] / a[:, 1]).tolist()
            else: tags[tag] = np.frombuffer(data, bo + fmt) if cnt > 64 else list(struct.unpack(bo + fmt * cnt, data))
        return tags
    def _wrap(self, data):
        """a one-tile (or one-strip) classic TIFF around compressed bytes, for Pillow to decode"""
        T = (self.tw, self.th)
        if self.strips:
            entries = [(256, 4, 1, T[0]), (257, 4, 1, T[1]), (258, 3, 1, 8), (259, 3, 1, self.comp), (262, 3, 1, 1), (273, 4, 1, 0),
                       (277, 3, 1, 1), (278, 4, 1, T[1]), (279, 4, 1, len(data)), (284, 3, 1, 1), (317, 3, 1, self.pred), (339, 3, 1, 1)]
        else:
            entries = [(256, 4, 1, T[0]), (257, 4, 1, T[1]), (258, 3, 1, 8), (259, 3, 1, self.comp), (262, 3, 1, 1), (277, 3, 1, 1),
                       (284, 3, 1, 1), (317, 3, 1, self.pred), (322, 4, 1, T[0]), (323, 4, 1, T[1]), (324, 4, 1, 0), (325, 4, 1, len(data)), (339, 3, 1, 1)]
        n = len(entries); data_off = 8 + 2 + 12 * n + 4
        b = bytearray(b'II*\x00' + struct.pack('<I', 8) + struct.pack('<H', n))
        for tag, typ, cnt, val in entries:
            if tag in (273, 324): val = data_off
            b += struct.pack('<HHIHH', tag, typ, cnt, val, 0) if typ == 3 else struct.pack('<HHII', tag, typ, cnt, val)
        return bytes(b + struct.pack('<I', 0) + data)
    def tile(self, tx, ty):
        t = ty * self.ntx + tx
        a = self.cache.get(t)
        if a is not None: self.cache.move_to_end(t); return a
        if self.cnts[t] == 0: a = np.full((self.th, self.tw), self.fill, np.uint8)
        else:
            self.f.seek(int(self.offs[t])); data = self.f.read(int(self.cnts[t]))
            a = self.same.get(data) if len(data) < 1024 else None
            if a is None:
                if self.comp == 1: a = np.frombuffer(data, np.uint8, self.tw * self.th).reshape(self.th, self.tw)
                else: a = np.asarray(Image.open(io.BytesIO(self._wrap(data))))
                if len(data) < 1024: self.same[data] = a
        self.cache[t] = a; self.cached += a.nbytes
        # (at most about 160 MB of decoded tiles or strips)
        while self.cached > 160e6 and len(self.cache) > 1: self.cached -= self.cache.popitem(last=False)[1].nbytes
        return a
    def window(self, r0, r1, c0, c1):
        """rows r0..r1-1, columns c0..c1-1 (anything outside the raster is the fill value)"""
        out = np.full((r1 - r0, c1 - c0), self.fill, np.uint8)
        for ty in range(max(0, r0 // self.th), min(self.nty - 1, (r1 - 1) // self.th) + 1):
            for tx in range(max(0, c0 // self.tw), min(self.ntx - 1, (c1 - 1) // self.tw) + 1):
                a = self.tile(tx, ty)
                R0, C0 = ty * self.th, tx * self.tw
                rr0, rr1 = max(r0, R0), min(r1, R0 + self.th, self.H); cc0, cc1 = max(c0, C0), min(c1, C0 + self.tw, self.W)
                if rr1 > rr0 and cc1 > cc0: out[rr0 - r0:rr1 - r0, cc0 - c0:cc1 - c0] = a[rr0 - R0:rr1 - R0, cc0 - C0:cc1 - C0]
        return out

# ---- one sheet
HALF = 0.5 * (5.135487417266569e3 / (PPU * F))    # half the output pixel, metres (the slab's km per world unit)
def sheet_coords(sx, sy, step=32):
    """EPSG:5070 metres of every pixel centre of a sheet, from an exact grid every `step` pixels, bilinear between"""
    js = np.arange(0, SHEET + step, step); is_ = np.arange(0, SHEET + step, step)
    I, J = np.meshgrid(sx * SHEET + is_ + 0.5, sy * SHEET + js + 0.5)
    lon, lat = LOWER48.inverse(X0S + I / (PPU * F), Z0S + J / (PPU * F))
    ax, ay = albers(lon, lat)
    return ax, ay, step

def interp(grid, step, j0, j1):
    """rows j0..j1-1 of a sheet, every column, bilinear from the coarse grid"""
    jj = (np.arange(j0, j1) + 0.0) / step; ii = np.arange(SHEET) / step
    ja = np.floor(jj).astype(int); fa = (jj - ja)[:, None]
    ia = np.floor(ii).astype(int); fb = (ii - ia)[None, :]
    g00 = grid[ja][:, ia]; g01 = grid[ja][:, ia + 1]; g10 = grid[ja + 1][:, ia]; g11 = grid[ja + 1][:, ia + 1]
    return (g00 * (1 - fb) + g01 * fb) * (1 - fa) + (g10 * (1 - fb) + g11 * fb) * fa

def box_weights(f, h):
    """weights of the pixels at offsets -2..2 under a box of half-width h (pixels) centred f (|f| <= 0.5) from the nearest"""
    return [np.clip(np.minimum(f + h, k + 0.5) - np.maximum(f - h, k - 0.5), 0, None).astype(np.float32) for k in (-2, -1, 0, 1, 2)]

def do_sheet(sx, sy, lanid, cnt240, cdl=None, all_crops=False):
    ax, ay, step = sheet_coords(sx, sy)
    res = lanid.res
    c0 = int(math.floor((ax.min() - lanid.x0) / res)) - 4; c1 = int(math.ceil((ax.max() - lanid.x0) / res)) + 4
    r0 = int(math.floor((lanid.y0 - ay.max()) / res)) - 4; r1 = int(math.ceil((lanid.y0 - ay.min()) / res)) + 4
    if c1 <= 0 or r1 <= 0 or c0 >= lanid.W or r0 >= lanid.H: return None
    if cnt240 is not None:
        k = cnt240['block']
        if cnt240['counts'][max(0, r0 // k):max(0, r1 // k + 1), max(0, c0 // k):max(0, c1 // k + 1)].sum() == 0 and not all_crops: return None
    L = lanid.window(r0, r1, c0, c1)
    if not (L == 1).any() and not all_crops: return None
    if cdl is not None:
        dc = int(round((lanid.x0 - cdl.x0) / res)); dr = int(round((cdl.y0 - lanid.y0) / res))
        Cg = CDL_GROUP[cdl.window(r0 + dr, r1 + dr, c0 + dc, c1 + dc)]
    out = np.zeros((SHEET, SHEET), np.uint8)
    h = HALF / res
    for j0 in range(0, SHEET, 256):
        j1 = j0 + 256
        u = (interp(ax, step, j0, j1) - lanid.x0) / res - 0.5 - c0
        v = (lanid.y0 - interp(ay, step, j0, j1)) / res - 0.5 - r0
        cu = np.rint(u).astype(np.int64); cv = np.rint(v).astype(np.int64)
        wu = box_weights(u - cu, h); wv = box_weights(v - cv, h)
        irr = np.zeros(u.shape, np.float32); val = np.zeros(u.shape, np.float32)
        score = np.zeros(u.shape + (len(CROPS),), np.float32) if cdl is not None else None
        if score is not None: flat = score.reshape(-1, len(CROPS)); idx = np.arange(flat.shape[0])
        for a, dv in enumerate((-2, -1, 0, 1, 2)):
            rr = np.clip(cv + dv, 0, L.shape[0] - 1)
            for b, du in enumerate((-2, -1, 0, 1, 2)):
                w = wv[a] * wu[b]
                if not w.any(): continue
                cc = np.clip(cu + du, 0, L.shape[1] - 1)
                Lv = L[rr, cc]
                ok = Lv != 255
                val += w * ok; isirr = Lv == 1; irr += w * isirr
                if score is not None:
                    # (one candidate per pixel per offset, so plain fancy-index addition is exact)
                    flat[idx, Cg[rr, cc].ravel()] += (w * (isirr if not all_crops else ok)).ravel()
        lvl = np.where(val > 0.5 * (2 * h) ** 2, np.rint(7 * irr / np.maximum(val, 1e-6)), 0).astype(np.uint8)
        crop = np.zeros(u.shape, np.uint8)
        if score is not None:
            score[..., 0] = 0
            best = score.argmax(-1).astype(np.uint8); has = score.max(-1) > 0
            crop = np.where(has & ((lvl > 0) | all_crops), best, 0).astype(np.uint8)
        out[j0:j1] = crop | (lvl << 5)
    return out if out.any() else None

def main(argv):
    all_crops = '--all' in argv
    only = None; part = (0, 1)
    if '--sheets' in argv:
        k = argv.index('--sheets'); only = {tuple(int(v) for v in s.split(',')) for s in argv[k + 1].split(';')}; argv = argv[:k] + argv[k + 2:]
    if '--part' in argv:
        # (several processes at once: this one does every n-th sheet, from the k-th)
        k = argv.index('--part'); part = tuple(int(v) for v in argv[k + 1].split(',')); argv = argv[:k] + argv[k + 2:]
    budget = None
    if '--budget' in argv:
        # (stop starting sheets after this many seconds; run again to go on: sheets already done are skipped)
        k = argv.index('--budget'); budget = float(argv[k + 1]); argv = argv[:k] + argv[k + 2:]
    argv = [a for a in argv if a != '--all']
    lanid_fn, cnt_fn, outdir = argv[0], argv[1], argv[2]
    cdl_fn = argv[3] if len(argv) > 3 else None
    os.makedirs(outdir, exist_ok=True)
    lanid = TiledTiff(lanid_fn, fill=255)
    cdl = TiledTiff(cdl_fn, fill=0) if cdl_fn else None
    if cdl is not None:
        off = ((lanid.x0 - cdl.x0) / lanid.res, (cdl.y0 - lanid.y0) / lanid.res)
        assert abs(cdl.res - lanid.res) < 1e-6 and all(abs(o - round(o)) < 1e-6 for o in off), ('grids differ', cdl.res, off)
    z = np.load(cnt_fn) if cnt_fn and cnt_fn != '-' else None
    cnt240 = dict(counts=z['counts'], block=int(z['block'])) if z is not None else None
    nsx, nsy = (WF + SHEET - 1) // SHEET, (HF + SHEET - 1) // SHEET
    sheets = []; t0 = time.time(); total = np.zeros(8, np.int64)
    donef = f'{outdir}/done_{part[0]}.txt'
    done = set(open(donef).read().split()) if os.path.exists(donef) else set()
    left = 0
    for sy in range(nsy):
        for sx in range(nsx):
            if only and (sx, sy) not in only: continue
            if (sy * nsx + sx) % part[1] != part[0]: continue
            if f'{sx},{sy}' in done: continue
            if budget is not None and time.time() - t0 > budget: left += 1; continue
            a = do_sheet(sx, sy, lanid, cnt240, cdl, all_crops)
            if a is not None:
                a[:, max(0, WF - sx * SHEET):] = 0; a[max(0, HF - sy * SHEET):, :] = 0
            open(donef, 'a').write(f'{sx},{sy}\n')
            if a is None or not a.any(): continue
            total += np.bincount((a >> 5).ravel(), minlength=8)
            tiles = [ty * PER + tx for ty in range(PER) for tx in range(PER) if a[ty * TILE:(ty + 1) * TILE, tx * TILE:(tx + 1) * TILE].any()]
            Image.fromarray(a, 'L').save(f'{outdir}/fields_{sx}_{sy}.png', optimize=True)
            sheets.append(dict(sx=sx, sy=sy, tiles=tiles))
            print(f'sheet {sx},{sy}: {len(tiles)} tiles, {os.path.getsize(f"{outdir}/fields_{sx}_{sy}.png") // 1024} KB, {time.time() - t0:.0f} s', flush=True)
    px_km2 = (5.135487417266569 / (PPU * F)) ** 2
    man = dict(f=F, w=WF, h=HF, tile=TILE, per=PER, nsx=nsx, nsy=nsy, irr=7, crops=CROPS if cdl else None, all=all_crops, sheets=sheets,
               irrigated_km2=float((total * np.arange(8)).sum() / 7 * px_km2))
    json.dump(man, open(f'{outdir}/fields_manifest{"" if part[1] == 1 else f"_{part[0]}"}.json', 'w'))
    print('sheets', len(sheets), 'irrigated km2 (from levels)', round(man['irrigated_km2']), 'in', round(time.time() - t0), 's;', 'left', left)

if __name__ == '__main__':
    main(sys.argv[1:])
