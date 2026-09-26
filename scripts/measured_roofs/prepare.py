"""Measured houses: each house's roof from the LiDAR, its roof colour from the
aerial, and its siding, trim, door, shutters and porch from the assessor's
street photograph.

1. Roofs. The USGS 2021 leaf-off survey's highest roof return in each 0.5 m
   cell (townwide/roof_tiles) is fitted inside each mapped residential plan as
   a union of rectangular sections, each roofed flat, shed, gable, hip,
   gambrel or mansard (measure.py). The sections become one closed solid whose
   walls stand 0.32 m inside the roofprint under a 0.22 m roof slab, so eaves
   and rakes overhang (solid.py, manifold3d 3.5.4). Chimneys are where the
   returns rise sharply above the fitted roof; gutters run along level eaves.
2. Roof colour. The MassGIS 2025 aerial is registered to the LiDAR per 250 m
   tile (building lean differs across the mosaic) and sampled on each roof's
   inlier returns.
3. Facades. facade-reads.json holds what the assessor's street photograph of
   each house shows: siding colour and family, trim, door and shutter colours,
   wall material, front porch and window bays, and for stacked porches their
   side and whether each level is open or enclosed. Each photo was read by eye
   (a second, careful pass after a quick first one), and the siding colour
   took the photo's own hue where the reader's sample point landed on siding
   of the named family. Only these reads enter the repository; no photograph,
   owner or sale detail does.
4. Wall tops. Each frame's inset wall top is traced from the solid itself, so
   windows can stand in a gable under its rakes.
5. Everything else. Garages, sheds, barns and the other plainly modelled
   buildings join the same packets (outbuildings.py), and each photographed
   house's front fence gets its line along the parcel's street frontage
   (fences.py). Each tile's packet also says which of its scenery trees are
   evergreens in the leaf-off aerial (trees.py).

Usage: python3 scripts/measured_roofs/prepare.py [--jobs N] [--limit N] [--reuse]
  --reuse skips the LiDAR fits when $OUT/records.jsonl (houses) and
  $OUT/others.jsonl (everything else) exist.
Environment: WEBSTER_SOURCE (research folder), WEBSTER_MEASURED_OUT (work dir).
Writes public/town-evidence/v1/measured/<digest>/<tile>.json and
data/derived/town/measured-roofs-index.json.
"""
import argparse, base64, collections, functools, hashlib, json, math, os, re, shutil, sys, time
from multiprocessing import Pool
from pathlib import Path

import numpy as np
import shapely
from scipy import ndimage
from scipy.signal import fftconvolve

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import measure as M
import solid as S

SITE = M.SITE
SOURCE = M.SOURCE
OUT = Path(os.environ.get('WEBSTER_MEASURED_OUT', '/private/tmp/webster-measured-roofs'))
INSET, SLAB = 0.32, 0.22
OX, OY = 171282.3328920724, 867589.2761750807


# ---- 1. roofs -------------------------------------------------------------

def b64(a): return base64.b64encode(np.ascontiguousarray(a).tobytes()).decode()


def encode(v, f, R, c, base, lpoly):
    """Centimetre vertices east/north of the centre and above the base, and
    triangles split into roof, wall and trim (fascia, rakes and soffits)."""
    en = v[:, :2] @ R
    q = np.round(np.c_[en, v[:, 2] - base] * 100).astype(np.int64)
    if np.abs(q).max() >= 32767: raise ValueError('vertex range')
    q = q.astype('<i2')
    uq, inv = np.unique(q, axis=0, return_inverse=True)
    f2 = inv.reshape(-1)[f]
    keep = (f2[:, 0] != f2[:, 1]) & (f2[:, 1] != f2[:, 2]) & (f2[:, 0] != f2[:, 2])
    f2 = f2[keep]
    p = uq[f2].astype(float) / 100
    n = np.cross(p[:, 1] - p[:, 0], p[:, 2] - p[:, 0]); ln = np.linalg.norm(n, axis=1)
    good = ln > 1e-6
    f2 = f2[good]; p = p[good]; nz = n[good, 2] / ln[good]
    zmean = p[:, :, 2].mean(1)
    # faces standing on the roofprint line: fascia and rake boards (walls stand inset)
    ring = lpoly.exterior
    loc = (p[:, :, :2].reshape(-1, 2) @ R.T)
    on_ring = (np.asarray(shapely.distance(ring, shapely.points(loc[:, 0], loc[:, 1]))).reshape(-1, 3) < 0.06).all(1)
    roof = nz > 0.15
    bottom = (nz < -0.9) & (zmean < 0.5)
    soffit = (nz < -0.9) & ~bottom
    vertical = ~roof & (nz >= -0.9)
    trim = soffit | (vertical & on_ring)
    wall = vertical & ~on_ring
    if len(uq) >= 65535: raise ValueError('too many vertices')
    return uq, f2[roof].astype('<u2'), f2[wall].astype('<u2'), f2[trim].astype('<u2')


def frame_eaves(house, res, lpoly, fillers, R, c):
    """Per frame: the soffit line where the inset wall meets the roof slab, as
    [minimum, [[u, height], ...]] with a new run wherever the wall top steps."""
    out = []
    for fr in house['frames']:
        st = np.asarray(fr['start']); tg = np.asarray(fr['tangent']); ow = np.asarray(fr['outward']); w = fr['width']
        k = max(3, int(w / 0.25))
        us = np.linspace(min(INSET + 0.05, w / 2), max(w - INSET - 0.05, w / 2), k)
        pts = st[None] + tg[None] * us[:, None] - ow[None] * (INSET + 0.05)
        loc = (pts - c) @ R.T
        h = M.union_height(res['sections'], loc)
        for fl in fillers:
            m = shapely.contains_xy(fl['poly'].buffer(0.25), loc[:, 0], loc[:, 1])
            h = np.where(m, np.maximum(h, fl['height']), h)
        ok = np.isfinite(h)
        if not ok.any(): out.append(None); continue
        h = np.where(ok, h, np.nanmin(np.where(ok, h, np.nan)))
        runs = [[0, 1]]
        for i in range(1, len(h)):
            if abs(h[i] - h[runs[-1][0]:i].min()) > 0.8 and abs(h[i] - h[i - 1]) > 0.5: runs.append([i, i + 1])
            else: runs[-1][1] = i + 1
        segs = [[round(float(us[a]) if j else 0.0, 2), round(float(h[a:b].min()) - SLAB, 3)] for j, (a, b) in enumerate(runs)]
        out.append([round(float(h.min()) - SLAB, 3), segs if len(segs) > 1 else []])
    return out


def gutters(v, f, lpoly, R, c):
    """Level roof edges on the roofprint: the fascia lines that carry gutters."""
    p = v[f]; n = np.cross(p[:, 1] - p[:, 0], p[:, 2] - p[:, 0]); ln = np.linalg.norm(n, axis=1)
    nz = np.where(ln > 0, n[:, 2] / np.maximum(ln, 1e-12), 0)
    ring = lpoly.exterior
    out = []
    for tri in f[nz > 0.15]:
        for a, b in ((tri[0], tri[1]), (tri[1], tri[2]), (tri[2], tri[0])):
            A, B = v[a], v[b]
            if abs(A[2] - B[2]) > 0.03 or np.hypot(*(A[:2] - B[:2])) < 0.8: continue
            mid = (A[:2] + B[:2]) / 2
            if ring.distance(shapely.points(mid[0], mid[1])) > 0.05: continue
            ea, na = A[:2] @ R + c; eb, nb = B[:2] @ R + c
            out.append([round(float(ea - c[0]), 2), round(float(na - c[1]), 2), round(float(eb - c[0]), 2), round(float(nb - c[1]), 2), round(float((A[2] + B[2]) / 2 - SLAB), 2)])
    return out


def measure_house(house):
    import manifold3d as mf
    rec = {'id': house['id'], 'tileId': house['tileId']}
    try:
        res = M.measure(house, debug=True)
        if not res or res.get('status') != 'ok':
            rec['status'] = (res or {}).get('status', 'none'); return rec
        PL, Z, lpoly, R, c = res['debug']
        full, fillers = S.house_solid(res, lpoly, house['base'], (PL, Z))
        if full is None or full.is_empty():
            rec['status'] = 'no-solid'; return rec
        grown = S.grown_union(res, fillers, lpoly, house['base'], 0.02)
        body = S.eaved_solid(full, grown, lpoly, house['base'], inset=INSET, thickness=SLAB)
        pieces = [p for p in body.decompose() if p.volume() > 1.0]
        comps = len(pieces)
        if not pieces: raise ValueError('empty body')
        if comps != len(body.decompose()): body = mf.Manifold.batch_boolean(pieces, mf.OpType.Add) if comps > 1 else pieces[0]
        v, f = S.mesh_arrays(body)
        uq, roof, wall, trim = encode(v, f, R, c, house['base'], lpoly)
        eaves = frame_eaves(house, res, lpoly, fillers, R, c)
        # inlier roof returns (east/north) for colour sampling, clear of the plan edge
        fz = M.union_height(res['sections'], PL)
        inl = np.abs(Z - fz) < M.INLIER
        edge = shapely.distance(lpoly.exterior, shapely.points(PL[:, 0], PL[:, 1]))
        pick = inl & (np.asarray(edge) > 0.7)
        if pick.sum() < 12: pick = inl
        en = PL[pick] @ R + c
        sel = np.linspace(0, len(en) - 1, min(len(en), 400)).astype(int)
        chim = []
        for ch in res['chimneys']:
            e, n = np.asarray(ch['at']) @ R + c
            chim.append([round(float(e - c[0]), 2), round(float(n - c[1]), 2), round(ch['top'], 2), round(ch['size'][0], 2), round(ch['size'][1], 2), round(float(res['theta']), 4), round(ch['roof'], 2)])
        rec.update({'status': 'ok', 'origin': [round(float(c[0]), 3), round(float(c[1]), 3)], 'base': house['base'],
                    'peak': round(float(v[:, 2].max()), 3), 'theta': res['theta'],
                    'v': b64(uq), 'roof': b64(roof), 'wall': b64(wall), 'trim': b64(trim), 'nv': int(len(uq)),
                    'frameEaves': eaves, 'chimneys': chim, 'gutters': gutters(v, f, lpoly, R, c), 'components': comps,
                    'fit': {'inlierShare': round(res['inlierShare'], 3), 'rmse': round(res['rmse'], 3), 'n': res['n'], 'cover': round(res['cover'], 3),
                            'models': [s['model'] for s in res['sections']], 'overlays': sum(bool(s.get('overlay')) for s in res['sections']),
                            'fillers': len(fillers)},
                    'colourPts': [[round(float(a), 2), round(float(b), 2)] for a, b in en[sel]]})
    except Exception as e:
        rec['status'] = 'error'; rec['error'] = repr(e)[:200]
    return rec


def measure_all(jobs, limit):
    rows = sorted(M.houses(), key=lambda h: h['id'])
    if limit: rows = rows[:limit]
    OUT.mkdir(parents=True, exist_ok=True)
    t0 = time.time(); done = 0
    with open(OUT / 'records.jsonl', 'w') as out, Pool(jobs, initializer=M.lidar) as pool:
        for rec in pool.imap(measure_house, rows, chunksize=4):
            out.write(json.dumps(rec) + '\n'); done += 1
            if done % 250 == 0: print(f'measured {done}/{len(rows)} in {time.time() - t0:.0f}s', flush=True)
    return [json.loads(l) for l in open(OUT / 'records.jsonl')]


# ---- 2. roof colour -------------------------------------------------------

RES = 0.5
_aerial = None


def aerial(east, north):
    """The townwide 2025 aerial, bilinearly sampled at local east/north."""
    global _aerial
    if _aerial is None:
        from PIL import Image
        from pyproj import Transformer
        Image.MAX_IMAGE_PIXELS = None
        meta = json.load(open(SOURCE / 'townwide/imagery_aerial_metadata.json'))
        _aerial = (np.asarray(Image.open(SOURCE / 'townwide/imagery_aerial.jpg').convert('RGB')), meta['bounds_web_mercator_m'],
                   Transformer.from_crs(6491, 3857, always_xy=True))
    img, (W, S_, E, N), to_merc = _aerial
    h, w = img.shape[:2]
    mx, my = to_merc.transform(np.asarray(east) + OX, np.asarray(north) + OY)
    x = (mx - W) / (E - W) * w - .5; y = (1 - (my - S_) / (N - S_)) * h - .5
    x0 = np.clip(np.floor(x).astype(int), 0, w - 2); y0 = np.clip(np.floor(y).astype(int), 0, h - 2)
    fx = np.clip(x - x0, 0, 1)[..., None]; fy = np.clip(y - y0, 0, 1)[..., None]
    a = img[y0, x0].astype(float); b = img[y0, x0 + 1].astype(float); c = img[y0 + 1, x0].astype(float); d = img[y0 + 1, x0 + 1].astype(float)
    return (a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy).astype(np.uint8)


@functools.lru_cache(maxsize=None)
def tile_shift(e0, n0, size=250.0, pad=10.0, maxs=5.0):
    """Where the LiDAR's roof edges appear in the aerial: the building lean
    of this part of the mosaic, from edge cross-correlation."""
    x, y, z, tree = M.lidar()
    E0, N0 = e0 - pad, n0 - pad; Sz = size + 2 * pad
    m = (x >= E0) & (x < E0 + Sz) & (y >= N0) & (y < N0 + Sz)
    if m.sum() < 400: return 0.0, 0.0, 0.0, int(m.sum())
    nx = int(Sz / RES)
    occ = np.zeros((nx, nx), float)
    gi = np.clip(((x[m] - E0) / RES).astype(int), 0, nx - 1); gj = np.clip(((y[m] - N0) / RES).astype(int), 0, nx - 1)
    occ[gj, gi] = 1
    occ = ndimage.binary_closing(occ, iterations=1).astype(float)
    eb = np.hypot(ndimage.sobel(occ, 0), ndimage.sobel(occ, 1))
    xs = E0 + (np.arange(nx) + .5) * RES; ys = N0 + (np.arange(nx) + .5) * RES
    X, Y = np.meshgrid(xs, ys)
    img = aerial(X, Y).astype(float).mean(-1)
    ei = np.hypot(ndimage.sobel(img, 0), ndimage.sobel(img, 1))
    ei = ndimage.gaussian_filter(ei, 1.0); eb = ndimage.gaussian_filter(eb, 1.0)
    ei = (ei - ei.mean()) / (ei.std() + 1e-9); eb = (eb - eb.mean()) / (eb.std() + 1e-9)
    corr = fftconvolve(ei, eb[::-1, ::-1], mode='same')
    c0 = np.array(corr.shape) // 2
    k = int(maxs / RES)
    win = corr[c0[0] - k:c0[0] + k + 1, c0[1] - k:c0[1] + k + 1]
    j, i = np.unravel_index(np.argmax(win), win.shape)
    peak = win[j, i] / ei.size; base = win[k, k] / ei.size
    # LiDAR at q appears in the image at q + (dx, dy)
    return (i - k) * RES, (j - k) * RES, float(peak - base), int(m.sum())


def robust_colour(rgb):
    rgb = rgb.astype(float)
    r, g, b = rgb[:, 0], rgb[:, 1], rgb[:, 2]
    mx = rgb.max(1); mn = rgb.min(1)
    leafy = (g > r + 6) & (g > b + 4) & (mx - mn > 18)
    keep = ~leafy
    if keep.sum() < max(8, 0.25 * len(rgb)): keep = np.ones(len(rgb), bool)
    x = rgb[keep]
    med = np.median(x, 0); mad = np.median(np.abs(x - med), 0) + 3
    ok = np.all(np.abs(x - med) <= 2.5 * mad, 1)
    if ok.sum() >= 5: x = x[ok]
    return x.mean(0)


def roof_colours(records):
    by_tile = collections.defaultdict(list)
    for r in records:
        if r.get('status') != 'ok': continue
        e, n = r['origin']
        by_tile[(math.floor(e / 250), math.floor(n / 250))].append(r)
    shifts = {key: tile_shift(key[0] * 250.0, key[1] * 250.0) for key in sorted(by_tile)}
    out = {}
    for key, items in by_tile.items():
        dx, dy, strength, _ = shifts[key]
        if strength <= 0.02:   # a weak correlation borrows its neighbours' shift
            near = [shifts[(key[0] + a, key[1] + b)] for a in (-1, 0, 1) for b in (-1, 0, 1)
                    if (key[0] + a, key[1] + b) in shifts and shifts[(key[0] + a, key[1] + b)][2] > 0.02]
            dx, dy = (float(np.median([s[0] for s in near])), float(np.median([s[1] for s in near]))) if near else (0.0, 0.0)
        for r in items:
            pts = np.asarray(r['colourPts'], float)
            if len(pts) < 5: continue
            out[r['id']] = [round(float(v), 1) for v in robust_colour(aerial(pts[:, 0] + dx, pts[:, 1] + dy))]
    return out


# ---- 3. packets -----------------------------------------------------------

HEX = re.compile(r'^#[0-9a-f]{6}$')


def hexok(h): return isinstance(h, str) and bool(HEX.match(h))


def hexcol(rgb): return '#' + ''.join(f'{max(0, min(255, round(float(v)))):02x}' for v in rgb)


def roof_colour(rgb):
    """Aerial roof colour mapped to roofing albedo: the leaf-off imagery is
    bright and hazy, so remove its slight blue-green cast, map luminance with a
    toe (black shingle ~#26, weathered grey ~#50, light grey ~#87), and restore
    some of the chroma the haze took."""
    r, g, b = rgb[0] + 6.0, rgb[1], rgb[2] - 2.5
    lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
    t = min(1.0, max(0.02, (lum - 60.0) / 195.0))
    target = min(190.0, max(34.0, 255.0 * t ** 1.4))
    k = target / max(lum, 1.0)
    c = [r * k, g * k, b * k]
    m = sum(c) / 3
    return hexcol([m + (v - m) * 1.35 for v in c])


def paint(h):
    """A photographed paint in the game's range: the town's lighting was
    tuned for whites near #deded2, so the top of the lightness scale is
    compressed a little and everything darker is left alone."""
    import cv2
    lab = cv2.cvtColor(np.uint8([[[int(h[i:i + 2], 16) for i in (1, 3, 5)]]]), cv2.COLOR_RGB2LAB)[0, 0].astype(float)
    L = lab[0] * 100 / 255
    if L > 70: L = 70 + (L - 70) * 0.78
    lab[0] = L * 255 / 100
    return hexcol(cv2.cvtColor(np.uint8([[np.clip(lab, 0, 255)]]), cv2.COLOR_LAB2RGB)[0, 0])


def facade(fc):
    """Photo fields: material, porch, shutter colour, window bays, door colour."""
    f = {}
    if fc.get('material') in ('siding', 'shingle', 'brick', 'stone', 'stucco'): f['material'] = fc['material']
    if fc.get('porch') in ('none', 'open', 'enclosed', 'stacked'): f['porch'] = fc['porch']
    if hexok(fc.get('shutters')): f['shutters'] = fc['shutters']
    if isinstance(fc.get('bays'), int) and 1 <= fc['bays'] <= 12: f['bays'] = fc['bays']
    if hexok(fc.get('door')): f['door'] = fc['door']
    if f.get('porch') == 'stacked':   # a second read of stacked porches: position and enclosure
        if fc.get('side') in ('left', 'right', 'center', 'full'): f['side'] = fc['side']
        for k in ('ground', 'upper'):
            if fc.get(k) in ('open', 'enclosed'): f[k] = fc[k]
        if fc.get('levels') in (2, 3): f['levels'] = fc['levels']
    # the street-context read: mailbox, foundation shrubs, driveway surface, street-facing garage doors, front fence
    if fc.get('mb') in ('curb', 'house', 'none'): f['mb'] = fc['mb']
    if fc.get('sh') in ('none', 'some', 'many'): f['sh'] = fc['sh']
    if fc.get('dw') in ('asphalt', 'gravel', 'concrete', 'pavers', 'none'): f['dw'] = fc['dw']
    if fc.get('g') == 'attached' and fc.get('gd') in (1, 2, 3) and fc.get('gs') in ('left', 'right', 'center'):
        f['gd'] = fc['gd']; f['gs'] = fc['gs']
        if hexok(fc.get('gc')): f['gc'] = fc['gc']
    if fc.get('fe') in ('picket', 'chain', 'stone', 'retaining', 'rail', 'privacy', 'iron', 'hedge'):
        f['fe'] = fc['fe']
        if hexok(fc.get('fc')): f['fc'] = fc['fc']
    return f


def simplify(points, tol):
    """Douglas-Peucker on a (u, h) polyline."""
    if len(points) < 3: return points
    a, b = np.asarray(points[0]), np.asarray(points[-1])
    d = b - a; n = np.hypot(*d) or 1.0
    dist = [abs(d[0] * (p[1] - a[1]) - d[1] * (p[0] - a[0])) / n for p in points[1:-1]]
    i = int(np.argmax(dist)) + 1
    if dist[i - 1] <= tol: return [points[0], points[-1]]
    return simplify(points[:i + 1], tol)[:-1] + simplify(points[i:], tol)


def wall_profiles(r, house, inset=INSET):
    """Per frame, the measured wall's top as a polyline [[u, height above
    base], ...] along the inset wall: level along an eave, rising and falling
    under a gable, stepping where a wing meets the frame."""
    v = np.frombuffer(base64.b64decode(r['v']), dtype='<i2').reshape(-1, 3).astype(float) / 100
    tri = np.frombuffer(base64.b64decode(r['wall']), dtype='<u2').reshape(-1, 3)
    en = v[:, :2] + np.asarray(r['origin'])
    out = []
    for fr in house['frames']:
        t = np.asarray(fr['tangent'], float); o = np.asarray(fr['outward'], float)
        s = np.asarray(fr['start'], float) + t * inset - o * inset
        w = fr['width'] - 2 * inset
        rel = en - s; u = rel @ t; off = rel @ o
        on = (np.abs(off[tri]) < 0.06).all(1) & (u[tri].max(1) > 0.05) & (u[tri].min(1) < w - 0.05)
        if w < 0.5 or not on.any(): out.append(None); continue
        T = tri[on]; tu = u[T]; tz = v[T, 2]
        us = np.linspace(0, w, max(3, int(round(w / 0.1)) + 1))
        top = np.full(len(us), np.nan)
        for k in range(3):   # each triangle edge, where it spans a sample
            u0, u1 = tu[:, k], tu[:, (k + 1) % 3]; z0, z1 = tz[:, k], tz[:, (k + 1) % 3]
            lo, hi = np.minimum(u0, u1), np.maximum(u0, u1)
            span = hi - lo > 1e-6
            inside = (us[None] >= lo[:, None] - 1e-6) & (us[None] <= hi[:, None] + 1e-6) & span[:, None]
            f = np.clip((us[None] - u0[:, None]) / np.where(span, u1 - u0, 1)[:, None], 0, 1)
            z = np.where(inside, z0[:, None] + f * (z1 - z0)[:, None], np.nan)
            top = np.fmax(top, np.nanmax(np.where(np.isnan(z), -np.inf, z), 0))
        top[~np.isfinite(top)] = np.nan
        if np.isnan(top).all(): out.append(None); continue
        good = ~np.isnan(top)
        top = np.interp(us, us[good], top[good])
        pts = simplify([[float(a), float(b)] for a, b in zip(us, top)], 0.08)
        out.append([[round(a, 2), round(b, 2)] for a, b in pts])
    return out


def small_indices(b64s, nv):
    """Indices fit a byte when a body has at most 255 vertices."""
    a = np.frombuffer(base64.b64decode(b64s), dtype='<u2')
    return base64.b64encode(a.astype('u1').tobytes()).decode() if nv <= 255 else b64s


def tile_grid(tiles):
    """The tiles with packets as a bitmap the game can carry cheaply: the
    first tile column and row, the width, and base64 bits (row by row, least
    significant bit first)."""
    xy = [tuple(map(int, t.split('_'))) for t in tiles]
    x0, y0 = min(x for x, _ in xy), min(y for _, y in xy)
    w = max(x for x, _ in xy) - x0 + 1; h = max(y for _, y in xy) - y0 + 1
    bits = bytearray((w * h + 7) // 8)
    for x, y in xy: k = (y - y0) * w + (x - x0); bits[k >> 3] |= 1 << (k & 7)
    return [x0, y0, w, base64.b64encode(bytes(bits)).decode()]


def packets(records, colours, lots, others=()):
    facades = json.load(open(HERE / 'facade-reads.json'))
    homes = {h['id']: h for h in M.houses()}
    tiles = collections.defaultdict(list); skipped = collections.Counter()
    for r in records:
        if r.get('status') != 'ok': skipped[r.get('status')] += 1; continue
        q = r['fit']['inlierShare']
        if q < 0.6 or r['fit']['cover'] < 0.35: skipped['weak fit'] += 1; continue
        row = {'id': r['id'], 'o': r['origin'], 'b': round(r['base'], 3), 'p': r['peak'], 'v': r['v'], 'r': small_indices(r['roof'], r['nv']),
               'w': small_indices(r['wall'], r['nv']), 't': small_indices(r['trim'], r['nv']),
               'e': [None if e is None or not math.isfinite(e[0]) else round(e[0], 3) for e in r['frameEaves']],
               # a level wall top is one height; a gable or a stepped wall, its polyline
               'ep': [None if pr is None else pr[0][1] if all(abs(q[1] - pr[0][1]) < 0.015 for q in pr) else pr
                      for pr in wall_profiles(r, homes[r['id']])],
               'c': [c for c in r['chimneys'] if all(math.isfinite(x) for x in c)],
               'g': [g for g in r.get('gutters', []) if all(math.isfinite(x) for x in g)], 'q': q}
        if r['id'] in colours: row['rc'] = roof_colour(colours[r['id']])
        fc = facades.get(r['id'])
        if fc:
            if hexok(fc.get('wall')): row['wc'] = paint(fc['wall'])
            if hexok(fc.get('trim')): row['tc'] = paint(fc['trim'])
            row['f'] = facade(fc)
            if row['f'].get('fe'):
                # the fence's line along the lot's street frontage, decimetres from the house centre
                lines = lots.frontage(homes[r['id']], homes[r['id']].get('address'))
                if lines: row['f']['fl'] = [[round((a[0] - r['origin'][0]) * 10), round((a[1] - r['origin'][1]) * 10), round((b[0] - r['origin'][0]) * 10), round((b[1] - r['origin'][1]) * 10)] for a, b in lines]
                else: row['f'].pop('fe', None); row['f'].pop('fc', None)
        tiles[r['tileId']].append(row)
    # houses the LiDAR could not fit keep their bodies but take their photograph's facade
    done = {row['id'] for rows in tiles.values() for row in rows}
    for hid, house in sorted(homes.items()):
        fc = facades.get(hid)
        if hid in done or not fc: continue
        xs = [p[0] for p in house['outline']]; ns = [p[1] for p in house['outline']]
        o = [round(sum(xs) / len(xs), 3), round(sum(ns) / len(ns), 3)]
        row = {'id': hid, 'k': 'h', 'o': o, 'b': round(house['base'], 3)}
        if hexok(fc.get('wall')): row['wc'] = paint(fc['wall'])
        if hexok(fc.get('trim')): row['tc'] = paint(fc['trim'])
        row['f'] = facade(fc)
        if row['f'].get('fe'):
            lines = lots.frontage(house, house.get('address'))
            if lines: row['f']['fl'] = [[round((a[0] - o[0]) * 10), round((a[1] - o[1]) * 10), round((b[0] - o[0]) * 10), round((b[1] - o[1]) * 10)] for a, b in lines]
            else: row['f'].pop('fe', None); row['f'].pop('fc', None)
        tiles[house['tileId']].append(row)
    # garages, sheds and other buildings (outbuildings.py)
    other_colours = roof_colours([rec for _, _, rec in others if rec])
    for tile, row, rec in others:
        if rec and rec['id'] in other_colours: row['rc'] = roof_colour(other_colours[rec['id']])
        tiles[tile].append(row)
    # which of each tile's scenery trees are evergreens (trees.py)
    from trees import tree_families
    families = tree_families(SITE, aerial, tile_shift)
    for t in families: tiles.setdefault(t, [])
    payloads = {t: json.dumps({'version': 1, 'tileId': t, 'rows': sorted(items, key=lambda x: x['id']), **({'trees': families[t]} if t in families else {})},
                              separators=(',', ':'), allow_nan=False) + '\n'
                for t, items in sorted(tiles.items())}
    digest = hashlib.sha256(''.join(payloads[t] for t in sorted(payloads)).encode()).hexdigest()[:12]
    root = SITE / 'public/town-evidence/v1/measured'
    if root.exists(): shutil.rmtree(root)
    out = root / digest; out.mkdir(parents=True)
    for t, text in payloads.items(): (out / f'{t}.json').write_text(text)
    index = {'version': 1, 'dir': f'/town-evidence/v1/measured/{digest}', 'count': sum('k' not in x for v in tiles.values() for x in v),
             'photographed': sum(x.get('k') == 'h' for v in tiles.values() for x in v),
             'others': sum(x.get('k') in ('o', 'b') for v in tiles.values() for x in v), 'kept': sum(x.get('k') == 'v' for v in tiles.values() for x in v),
             'photoReads': sum('f' in x and x.get('k') in (None, 'h') for v in tiles.values() for x in v),
             'evergreens': sum(bin(b).count('1') for f in families.values() for b in base64.b64decode(f['c'])),
             'trees': sum(f['n'] for f in families.values()),
             'tiles': ','.join(sorted(tiles)), 'grid': tile_grid(tiles), 'bytes': sum(len(t) for t in payloads.values())}
    (SITE / 'data/derived/town/measured-roofs-index.json').write_text(json.dumps(index, separators=(',', ':')) + '\n')
    print(json.dumps({'houses': index['count'], 'others': index['others'], 'kept': index['kept'], 'tiles': len(tiles), 'bytes': index['bytes'], 'skipped': dict(skipped),
                      'roofColours': sum('rc' in x for v in tiles.values() for x in v), 'photoReads': index['photoReads']}))


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--jobs', type=int, default=min(4, os.cpu_count() or 1))
    ap.add_argument('--limit', type=int, default=0)
    ap.add_argument('--reuse', action='store_true')
    a = ap.parse_args()
    if a.reuse and (OUT / 'records.jsonl').exists(): records = [json.loads(l) for l in open(OUT / 'records.jsonl')]
    else: records = measure_all(a.jobs, a.limit)
    import gzip
    from fences import Frontages
    from outbuildings import prepare_others
    lots = Frontages(SOURCE / 'research/data/parcels-current.geojson', json.load(gzip.open(SITE / 'data/derived/town/engine-network.json.gz')), aerial)
    others = prepare_others(OUT, a.jobs, a.reuse, M.houses(), json.load(open(HERE / 'facade-reads.json')), paint, lots)
    packets(records, roof_colours(records), lots, others)
