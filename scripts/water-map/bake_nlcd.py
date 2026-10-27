"""NLCD land cover (MRLC WMS, sampled at 0.0025 deg for the lower 48, HI and PR; 0.01 deg for Alaska) reprojected
onto each slab's texture grid.

Outputs (proc/nlcd, proc/web):
  <slab>_cls3.npy      compact class index (see CODES) at 3x the colour-texture resolution (~262 m on the lower 48)
  <slab>_agg.npz       fractions per texel at colour-texture resolution: dev (weighted intensity), crop, hay,
                       forest, water, wet, valid
  <slab>_color.webp    colour texture re-graded with NLCD albedo on US land (relief shading kept); NLCD open
                       water joins the lake channel (alpha)
  nlcd/<slab>_<sx>_<sy>.png + nlcd/manifest.json   3x class sheets (2048 px = 4x4 tiles of 512) for close-up views.
                       On the lower 48 each byte also carries LANID's irrigated fraction of the pixel in 2015
                       (bake_lanid.py) in its top three bits: class + 32 * round(7 * fraction); the manifest says irr: 7
"""
import json, os, sys, numpy as np
from PIL import Image
from scipy import ndimage
sys.path.insert(0, os.path.dirname(__file__))
from proj import SLABS

RAW = '/home/claude/w2/raw/nlcd'
TER = '/home/claude/w2/proc/terrain'
OUT = '/home/claude/w2/proc/nlcd'
WEB = '/home/claude/w2/proc/web'
SHEETS = f'{WEB}/nlcd'
os.makedirs(OUT, exist_ok=True); os.makedirs(SHEETS, exist_ok=True)
F3 = 3            # close-up grid is 3x the colour texture
TILE, PER = 512, 4  # tile size, tiles per sheet side

CODES = [0, 11, 12, 21, 22, 23, 24, 31, 41, 42, 43, 51, 52, 71, 72, 73, 74, 81, 82, 90, 95]
HDR = json.load(open(f'{RAW}/header.json'))
PAL = {p[3]: p[:3] for p in HDR['palette']}
LUT = np.zeros(256, np.uint8)
for i, c in enumerate(CODES): LUT[c] = i
for r, g, b, code, reg in HDR['extra']:
    # the Alaska 2016 and Puerto Rico 2001 layers are drawn with a palette about 10 levels lighter than the legend
    q = (r - 10, g - 9, b - 9) if reg in ('ak', 'pr') else (r, g, b)
    best = min(PAL.items(), key=lambda kv: sum((a - b_) ** 2 for a, b_ in zip(kv[1], q)))
    d = sum((a - b_) ** 2 for a, b_ in zip(best[1], q)) ** 0.5
    LUT[code] = CODES.index(best[0])
    print(f'  extra colour {r},{g},{b} ({reg}) -> NLCD {best[0]}  (distance {d:.1f})')
LUT[255] = 0

def s2l(c): return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
def l2s(c): c = np.clip(c, 0, 1); return np.where(c <= 0.0031308, c * 12.92, 1.055 * c ** (1 / 2.4) - 0.055)
def hexlin(h): h = h.lstrip('#'); return s2l(np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], np.float32) / 255.0)
def ss(a, b, x): t = np.clip((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t)

# natural late-summer albedo per compact class (matches the palette of export_terrain.py)
ALB = np.array([hexlin(h) for h in [
    '#000000', '#2c3b45', '#e8ecef', '#8b8a6e', '#8a8273', '#7e776e', '#706b67', '#a69a8a', '#58743f', '#3f5a38',
    '#4d6740', '#857b55', '#9c8b68', '#a6976a', '#908d61', '#a4a27a', '#7a8259', '#7e9253', '#828b50', '#46603f',
    '#687a55']], np.float32)
DEVW = np.zeros(len(CODES), np.float32); DEVW[3:7] = [0.12, 0.45, 0.80, 1.0]

def region_for(slab):
    return {'conus': 'conus', 'ak': 'ak', 'hi': 'hi', 'pr': 'pr'}[slab]

def bake(slab, color_only=False):
    S = SLABS[slab]; m = json.load(open(f'{TER}/{slab}_meta.json'))
    W, H = m['tex']; ppu = m['ppu']; x0, y0 = m['rect'][0], m['rect'][1]
    R = next(r for r in HDR['regions'] if r['name'] == region_for(slab))
    src = np.load(f'{RAW}/{R["name"]}.npy', mmap_mode='r')
    W3, H3 = W * F3, H * F3
    if color_only: return bake_color(slab, np.load(f'{OUT}/{slab}_cls3.npy'), W, H)
    cls3 = np.zeros((H3, W3), np.uint8)
    xs = x0 + (np.arange(W3) + 0.5) / (ppu * F3)
    for j0 in range(0, H3, 384):
        j1 = min(H3, j0 + 384)
        ys = y0 + (np.arange(j0, j1) + 0.5) / (ppu * F3)
        X, Y = np.meshgrid(xs, ys)
        lon, lat = S['proj'].inverse(X, Y)
        c = np.floor((lon - R['lon0']) / R['res']).astype(np.int64)
        r = np.floor((R['lat1'] - lat) / R['res']).astype(np.int64)
        ok = (c >= 0) & (c < R['w']) & (r >= 0) & (r < R['h'])
        v = np.zeros(X.shape, np.uint8)
        v[ok] = LUT[np.asarray(src[r[ok], c[ok]])]
        cls3[j0:j1] = v
    np.save(f'{OUT}/{slab}_cls3.npy', cls3)
    bake_color(slab, cls3, W, H)
    return write_sheets(slab, cls3)

def bake_color(slab, cls3, W, H):
    # ---- fractions at colour-texture resolution
    blk = cls3[:H * F3, :W * F3].reshape(H, F3, W, F3)
    n = float(F3 * F3)
    agg = {}
    def frac(ids): return np.isin(blk, ids).sum(axis=(1, 3), dtype=np.float32) / n
    counts = np.zeros((len(CODES), H, W), np.float16)
    for k in range(1, len(CODES)):
        counts[k] = (blk == k).sum(axis=(1, 3), dtype=np.float32) / n
    valid = counts[1:].astype(np.float32).sum(0)
    agg['valid'] = valid
    agg['dev'] = np.tensordot(DEVW, counts.astype(np.float32), 1)
    agg['crop'] = counts[18].astype(np.float32)
    agg['hay'] = counts[17].astype(np.float32)
    agg['forest'] = counts[8:11].astype(np.float32).sum(0)
    agg['wet'] = counts[19].astype(np.float32) + counts[20].astype(np.float32)
    agg['water'] = counts[1].astype(np.float32)
    agg['ice'] = counts[2].astype(np.float32)
    np.savez_compressed(f'{OUT}/{slab}_agg.npz', **{k: v.astype(np.float16) for k, v in agg.items()})
    # ---- colour texture: NLCD albedo where NLCD covers the texel, existing (Natural Earth based) colour elsewhere
    old = Image.open(f'{WEB}/{slab}_color.webp').convert('RGBA')
    if not os.path.exists(f'{WEB}/{slab}_color_ne.webp'): old.save(f'{WEB}/{slab}_color_ne.webp', 'WEBP', lossless=True)
    old = np.asarray(Image.open(f'{WEB}/{slab}_color_ne.webp').convert('RGBA'))
    sh = np.load(f'{TER}/{slab}_shade.npy', mmap_mode='r'); mk = np.load(f'{TER}/{slab}_masks.npy', mmap_mode='r')
    out = old.copy()
    for j0 in range(0, H, 256):
        j1 = min(H, j0 + 256)
        cs = counts[:, j0:j1].astype(np.float32)
        v = valid[j0:j1]
        alb = np.tensordot(cs.transpose(1, 2, 0), ALB, 1)                    # sum frac * albedo
        oldc = s2l(old[j0:j1, :, :3].astype(np.float32) / 255.0)
        s = np.clip(np.asarray(sh[j0:j1], np.float32), 0, 2.2)
        s = np.clip(1.0 + (s - 1.0) * 1.35, 0.18, 1.9)
        new = alb * s[..., None] + oldc * (1 - v)[..., None]
        land = (np.asarray(mk[j0:j1]) & 1) > 0
        use = land & (v > 0.01)
        col = np.where(use[..., None], l2s(new), old[j0:j1, :, :3] / 255.0)
        out[j0:j1, :, :3] = (col * 255 + 0.5).astype(np.uint8)
        # open water from NLCD joins the lake channel (alpha ~0 for lakes, 1 land, ~0.5 sea)
        a = old[j0:j1, :, 3].astype(np.float32)
        lakeN = ss(0.40, 0.85, cs[1]) * land
        lake_old = np.clip((255.0 - a) / 253.0, 0, 1) * ((np.asarray(mk[j0:j1]) & 2) > 0)
        a_new = np.where(lakeN > lake_old, 2 + 253 * (1 - lakeN), a)
        out[j0:j1, :, 3] = np.clip(a_new + 0.5, 2, 255).astype(np.uint8)
    im = Image.fromarray(out, 'RGBA')
    im.save(f'{WEB}/{slab}_color.webp', 'WEBP', quality=88, alpha_quality=100, method=6, exact=True)
    pv = im.convert('RGB'); pv.thumbnail((2400, 2400)); pv.save(f'/home/claude/w2/preview/{slab}_nlcd_pv.jpg', quality=88)
    print(slab, 'colour texture', os.path.getsize(f'{WEB}/{slab}_color.webp') // 1024, 'KB', flush=True)


def mode3(a):
    """3x3 majority filter (ties keep the centre class; no-data stays no-data). Each 262 m pixel of the WMS sample is
    a single 30 m NLCD cell, so the raw grid is speckled; the majority of a 3x3 block estimates the dominant cover."""
    best_k = np.zeros(a.shape, np.uint8); best_c = np.zeros(a.shape, np.float32)
    for k in range(1, len(CODES)):
        m = (a == k)
        if not m.any(): continue
        ck = ndimage.uniform_filter(m.astype(np.float32), 3, mode='nearest')
        sel = (ck > best_c + 1e-4) | ((np.abs(ck - best_c) <= 1e-4) & m)
        best_k[sel] = k; best_c[sel] = ck[sel]
    best_k[a == 0] = 0
    return best_k

LANID3 = '/home/claude/w2/proc/lanid/conus_irr3.npy'

def write_sheets(slab, cls3=None):
    if cls3 is None: cls3 = np.load(f'{OUT}/{slab}_cls3.npy')
    H3, W3 = cls3.shape
    irr3 = np.load(LANID3, mmap_mode='r') if slab == 'conus' and os.path.exists(LANID3) else None
    if irr3 is not None: assert irr3.shape == cls3.shape
    filt = np.zeros_like(cls3)
    for j0 in range(0, H3, 2048):
        a0, a1 = max(0, j0 - 1), min(H3, j0 + 2049)
        f = mode3(np.asarray(cls3[a0:a1]))
        filt[j0:min(H3, j0 + 2048)] = f[j0 - a0: j0 - a0 + min(2048, H3 - j0)]
    for fn in os.listdir(SHEETS):
        if fn.startswith(slab + '_'): os.remove(f'{SHEETS}/{fn}')
    sheets = []
    T = TILE * PER
    nsx, nsy = (W3 + T - 1) // T, (H3 + T - 1) // T
    for sy in range(nsy):
        for sx in range(nsx):
            a = np.zeros((T, T), np.uint8)
            part = filt[sy * T:(sy + 1) * T, sx * T:(sx + 1) * T]
            if irr3 is not None:
                lv = np.round(np.asarray(irr3[sy * T:(sy + 1) * T, sx * T:(sx + 1) * T], np.float32) * (7 / 255)).astype(np.uint8)
                part = np.where(part > 0, part | (lv << 5), 0).astype(np.uint8)
            a[:part.shape[0], :part.shape[1]] = part
            if not a.any(): continue
            flags = [ty * PER + tx for ty in range(PER) for tx in range(PER) if a[ty * TILE:(ty + 1) * TILE, tx * TILE:(tx + 1) * TILE].any()]
            Image.fromarray(a, 'L').convert('RGB').save(f'{SHEETS}/{slab}_{sx}_{sy}.webp', 'WEBP', lossless=True, quality=100, method=6)
            sheets.append(dict(sx=sx, sy=sy, tiles=flags))
    size = sum(os.path.getsize(f'{SHEETS}/{slab}_{q["sx"]}_{q["sy"]}.webp') for q in sheets)
    print(slab, 'sheets', len(sheets), 'of', nsx * nsy, 'size', size // 1024, 'KB', flush=True)
    out = dict(w3=W3, h3=H3, tile=TILE, per=PER, nsx=nsx, nsy=nsy, sheets=sheets)
    if irr3 is not None: out['irr'] = 7
    return out

if __name__ == '__main__':
    man = {'codes': CODES, 'f3': F3}
    mp = f'{SHEETS}/manifest.json'
    if os.path.exists(mp): man.update(json.load(open(mp)))
    args = sys.argv[1:]
    only_sheets = 'sheets' in args; only_color = 'color' in args
    for slab in ([a for a in args if a not in ('sheets', 'color')] or ['pr', 'hi', 'ak', 'conus']):
        if only_color: bake(slab, color_only=True); continue
        man[slab] = write_sheets(slab) if only_sheets else bake(slab)
        json.dump(man, open(mp, 'w'))
