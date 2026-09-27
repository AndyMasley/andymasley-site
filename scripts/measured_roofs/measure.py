"""Measure each house's roof from 0.5 m LiDAR roof returns.

A roof is modelled as the union of rectangular sections, each covered by a
convex roof (flat, shed, gable, hip, gambrel, mansard) written as the lower
envelope of a few planes. Sections come from the footprint's own grid lines
plus LiDAR height breaks, chosen greedily by how many returns they explain,
then refined: wings reach into their neighbours, raised parts (cross gables,
dormers) become overlays, and a lower part at a section's end (a wing, a
porch or a garage under its own lower roof) is split from the section
spanning it, each part fitted again. No shed is steeper than 45 degrees and
no gable side steeper than two to one (a steeper plane over a section is half
of a small gable or the top of a wall, and drew as a roof standing upright on
a front), and a section over a third of the plan leans toward the roof form
the street photograph shows. A plan with a wing set at an angle to the rest
is also fitted in two parts, each in its own frame (split_plan), and keeps
the parts where together they explain clearly more of the returns.
"""
import json, math, glob, collections, os
from pathlib import Path
import numpy as np
from shapely.geometry import Polygon, box, Point
from shapely import prepared
import shapely
from scipy.spatial import cKDTree

SITE = Path(__file__).resolve().parents[2]
SOURCE = Path(os.environ.get('WEBSTER_SOURCE', '/Users/andy/Documents/New project/webster-blender'))
INLIER = 0.22

_lidar = None
def lidar():
    """The highest class-6 return in each 0.5 m cell (USGS 2021, leaf-off),
    as local east/north/height, with a KD-tree over east/north."""
    global _lidar
    if _lidar is None:
        tiles = [np.load(f) for f in sorted(glob.glob(str(SOURCE / 'townwide/roof_tiles/*.npz')))]
        if not tiles: raise FileNotFoundError(f'no roof tiles under {SOURCE}/townwide/roof_tiles')
        x = np.concatenate([t['x'] for t in tiles]).astype('f8')
        y = np.concatenate([t['y'] for t in tiles]).astype('f8')
        z = np.concatenate([t['z'] for t in tiles]).astype('f8')
        _lidar = (x, y, z, cKDTree(np.c_[x, y]))
    return _lidar


def houses():
    idx = json.load(open(SITE / 'data/derived/town/residential-evidence-index.json'))
    rows = []
    for t, a in idx['tiles'].items():
        rows += json.load(open(str(SITE / 'public') + a['url']))['buildings']
    return rows


def orientation(outline):
    p = np.asarray(outline, dtype='f8')
    d = np.diff(np.vstack([p, p[:1]]), axis=0)
    L = np.hypot(d[:, 0], d[:, 1]); a = np.arctan2(d[:, 1], d[:, 0])
    s = np.sum(L * np.sin(4 * a)); c = np.sum(L * np.cos(4 * a))
    return math.atan2(s, c) / 4


def cluster_values(values, tol):
    values = np.sort(values); out = []; group = [values[0]]
    for v in values[1:]:
        if v - group[-1] <= tol: group.append(v)
        else: out.append(np.mean(group)); group = [v]
    out.append(np.mean(group))
    return np.asarray(out)


# ---------------------------------------------------------------- models
# Every model is a list of planes (a, b, c) with z <= a*s + b*t + c in the
# section frame (s along the section's first axis, t across). Height is the
# minimum over planes. Fitting solves the linear part for fixed shape params.

def planes_eval(planes, s, t):
    z = np.full(np.shape(s), np.inf)
    for a, b, c in planes:
        z = np.minimum(z, a * s + b * t + c)
    return z


def robust_lstsq(A, z, rounds=2, keep=0.85):
    w = np.ones(len(z), bool)
    coef = None
    for _ in range(rounds + 1):
        if w.sum() < A.shape[1] + 2: return None, np.inf, 0
        coef, *_ = np.linalg.lstsq(A[w], z[w], rcond=None)
        r = np.abs(z - A @ coef)
        cut = np.quantile(r, keep)
        w = r <= max(cut, 0.05)
    r = np.abs(z - A @ coef)
    trimmed = np.sort(r)[:max(3, int(len(r) * keep))]
    return coef, float(np.sqrt(np.mean(trimmed ** 2))), int(np.sum(r < INLIER))


def fit_models(s, t, z, A, B, quick=False):
    """s in [-A, A], t in [-B, B]. Returns dict name -> (planes, rmse, inliers, params)."""
    out = {}
    one = np.ones_like(z)
    def put(name, planes, rmse, inl, params):
        if planes is None or not np.isfinite(rmse): return
        if name not in out or inl > out[name][2] or (inl == out[name][2] and rmse < out[name][1]):
            out[name] = (planes, rmse, inl, params)
    # flat
    coef, e, n = robust_lstsq(np.c_[one], z)
    if coef is not None: put('flat', [(0.0, 0.0, coef[0])], e, n, {})
    # sheds (no steeper than 45 degrees: a steeper single plane over a
    # section is half of a small gable or the edge of a wall, not a roof)
    for axis, u in (('s', s), ('t', t)):
        coef, e, n = robust_lstsq(np.c_[one, u], z)
        if coef is not None and abs(coef[1]) <= 1.0:
            pl = [(coef[1], 0.0, coef[0])] if axis == 's' else [(0.0, coef[1], coef[0])]
            put('shed_' + axis, pl, e, n, {'slope': float(coef[1])})
    # gables (ridge along s: slopes in t) and (ridge along t: slopes in s)
    for axis, u, half in (('s', t, B), ('t', s, A)):
        for off in (np.linspace(-0.3, 0.3, 3) if quick else np.linspace(-0.35, 0.35, 8)) * half:
            d = u - off
            # asymmetric slopes: z = H - k1*max(d,0) - k2*max(-d,0)
            coef, e, n = robust_lstsq(np.c_[one, -np.maximum(d, 0), -np.maximum(-d, 0)], z)
            if coef is None: continue
            H, k1, k2 = coef
            if k1 <= 0.05 or k2 <= 0.05 or max(k1, k2) > 2.0: continue
            if axis == 's': pl = [(0.0, -k1, H + k1 * off), (0.0, k2, H - k2 * off)]
            else: pl = [(-k1, 0.0, H + k1 * off), (k2, 0.0, H - k2 * off)]
            put('gable_' + axis, pl, e, n, {'offset': float(off), 'k1': float(k1), 'k2': float(k2)})
    # hips: ridge along s (usual) or along t; end planes share the side pitch
    for axis in ('s', 't'):
        if axis == 't' and quick: continue
        su, tu, AA, BB = (s, t, A, B) if axis == 's' else (t, s, B, A)
        for off in (np.array([0.0]) if quick else np.linspace(-0.25, 0.25, 5)) * BB:
            d = tu - off
            for frac in ((0.4, 1.0) if quick else np.linspace(0.0, 1.0, 7)):
                L = max(0.0, AA - BB) * frac if AA > BB else 0.0
                L = max(0.0, min(L, AA - 0.6))
                m = np.maximum(np.abs(d), np.abs(su) - L)
                coef, e, n = robust_lstsq(np.c_[one, -m], z)
                if coef is None: continue
                H, k = coef
                if k <= 0.08: continue
                if axis == 's': pl = [(0.0, -k, H + k * off), (0.0, k, H - k * off), (-k, 0.0, H + k * L), (k, 0.0, H + k * L)]
                else: pl = [(-k, 0.0, H + k * off), (k, 0.0, H - k * off), (0.0, -k, H + k * L), (0.0, k, H + k * L)]
                put('hip' if axis == 's' else 'hip_t', pl, e, n, {'offset': float(off), 'L': float(L), 'k': float(k)})
    if quick: return out
    # hip ends on the best gables: end planes fitted to returns below the gable
    for gname, axis in (('gable_s', 's'), ('gable_t', 't')):
        if gname not in out: continue
        planes = out[gname][0]
        along = s if axis == 's' else t
        r = z - planes_eval(planes, s, t)
        ends = []
        for sign in (1.0, -1.0):
            m = (sign * along > 0.5) & (r < -0.12)
            if m.sum() < 10: continue
            coef, e, n = robust_lstsq(np.c_[np.ones(m.sum()), -(sign * along[m])], z[m])
            if coef is None or coef[1] < 0.2: continue
            c3, k3 = coef
            ends.append((-k3 * sign, 0.0, c3) if axis == 's' else (0.0, -k3 * sign, c3))
        if not ends: continue
        pl = list(planes) + ends
        pred = planes_eval(pl, s, t); res = np.abs(z - pred)
        trimmed = np.sort(res)[:max(3, int(len(res) * 0.85))]
        put('hip' if axis == 's' else 'hip_t', pl, float(np.sqrt(np.mean(trimmed ** 2))), int(np.sum(res < INLIER)), {'ends': len(ends), 'from': gname})
    # gambrel (ridge along s): steep lower, shallow upper; knee at |t|=w
    for w in np.linspace(0.35, 0.75, 5) * B:
        m1 = np.minimum(np.abs(t), w); m2 = np.maximum(np.abs(t) - w, 0)
        coef, e, n = robust_lstsq(np.c_[one, -m1, -m2], z)
        if coef is None: continue
        H, k1, k2 = coef
        if not (0.08 < k1 < k2 * 0.8 and k2 > 0.9): continue
        pl = [(0.0, -k1, H), (0.0, k1, H), (0.0, -k2, H - k1 * w + k2 * w), (0.0, k2, H - k1 * w + k2 * w)]
        put('gambrel', pl, e, n, {'w': float(w), 'k1': float(k1), 'k2': float(k2)})
    # mansard / flat-topped hip: flat top, steep sides on all four edges
    for mb in (0.9, 1.4, 2.0, 2.6):
        if mb > B * 0.8: continue
        m = np.maximum(np.maximum(np.abs(t) - (B - mb), np.abs(s) - (A - mb)), 0)
        coef, e, n = robust_lstsq(np.c_[one, -m], z)
        if coef is None: continue
        H, k = coef
        if k < 0.9: continue
        pl = [(0.0, 0.0, H), (0.0, -k, H + k * (B - mb)), (0.0, k, H + k * (B - mb)), (-k, 0.0, H + k * (A - mb)), (k, 0.0, H + k * (A - mb))]
        put('mansard', pl, e, n, {'m': float(mb), 'k': float(k)})
    return out


COMPLEXITY = {'flat': 1, 'shed_s': 2, 'shed_t': 2, 'gable_s': 4, 'gable_t': 4, 'hip': 5, 'hip_t': 5, 'gambrel': 5, 'mansard': 4}


# The roof the street photograph shows (layout-reads.json 'rf'), as the models it favours.
FORMS = {'gambrel': {'gambrel'}, 'hip': {'hip', 'hip_t'}, 'mansard': {'mansard'}, 'flat': {'flat'},
         'side': {'gable_s', 'gable_t'}, 'front': {'gable_s', 'gable_t'}, 'cross': {'gable_s', 'gable_t'}}


def choose(fits, n, form=None):
    """Prefer simpler roofs unless a richer one explains clearly more returns;
    a main roof leans toward the form its photograph shows, by as much as
    four in a hundred of its returns."""
    if not fits: return None
    best = None
    for name, (planes, rmse, inl, params) in fits.items():
        score = inl - COMPLEXITY[name] * max(2.0, 0.015 * n) - rmse * n * 0.25 + (0.04 * n if name in FORMS.get(form, ()) else 0.0)
        if best is None or score > best[0]: best = (score, name)
    name = best[1]
    # A pitched roof must actually pitch; nearly level fits are flat.
    planes = fits[name][0]
    slopes = [math.hypot(a, b) for a, b, c in planes]
    if name != 'flat' and 'flat' in fits and max(slopes) < 0.14:
        name = 'flat'
    return name


# ---------------------------------------------------------------- sections

def maximal_rectangles(avail):
    nu, nv = avail.shape
    P = np.zeros((nu + 1, nv + 1), int); P[1:, 1:] = np.cumsum(np.cumsum(avail, 0), 1)
    def full(i0, i1, j0, j1):
        return P[i1, j1] - P[i0, j1] - P[i1, j0] + P[i0, j0] == (i1 - i0) * (j1 - j0)
    rects = []
    for i0 in range(nu):
        for i1 in range(i0 + 1, nu + 1):
            for j0 in range(nv):
                if not avail[i0:i1, j0].all(): continue
                j1 = j0 + 1
                while j1 < nv and avail[i0:i1, j1].all(): j1 += 1
                # maximal in j by construction if j0 can't extend left
                if j0 > 0 and avail[i0:i1, j0 - 1].all(): continue
                if i0 > 0 and full(i0 - 1, i1, j0, j1): continue
                if i1 < nu and full(i0, i1 + 1, j0, j1): continue
                rects.append((i0, i1, j0, j1))
    return rects


def height_breaks(u, z, lo, hi, step=0.5, jump=1.1):
    """Positions along one axis where the upper roof profile jumps."""
    if len(u) < 20: return []
    bins = np.arange(lo, hi + step, step)
    idx = np.digitize(u, bins) - 1
    prof = np.full(len(bins), np.nan)
    for i in range(len(bins)):
        m = idx == i
        if m.sum() >= 3: prof[i] = np.quantile(z[m], 0.9)
    out = []
    for i in range(1, len(prof) - 1):
        a, b = prof[i - 1], prof[i + 1]
        if np.isfinite(a) and np.isfinite(b) and abs(a - b) >= jump:
            out.append(bins[i] + step / 2)
    # collapse neighbours
    merged = []
    for v in out:
        if merged and v - merged[-1] < 1.2: merged[-1] = (merged[-1] + v) / 2
        else: merged.append(v)
    return merged


def section_frame(rect):
    x0, y0, x1, y1 = rect
    cu = (x0 + x1) / 2; cv = (y0 + y1) / 2; wu = x1 - x0; wv = y1 - y0
    if wu >= wv: return [cu, cv, wu / 2, wv / 2, False]
    return [cu, cv, wv / 2, wu / 2, True]


def local_st(frame, P):
    cu, cv, A, B, swap = frame
    if swap: return P[:, 1] - cv, P[:, 0] - cu
    return P[:, 0] - cu, P[:, 1] - cv


def in_rect(rect, P, pad=1e-6):
    x0, y0, x1, y1 = rect
    return (P[:, 0] >= x0 - pad) & (P[:, 0] <= x1 + pad) & (P[:, 1] >= y0 - pad) & (P[:, 1] <= y1 + pad)


def to_section(sec, P):
    """Points of the house frame in a section's own axes: a wing set at an angle
    to the rest of the plan carries its turn from the house frame ('rot')."""
    phi = sec.get('rot', 0.0)
    if not phi: return P
    c, s = math.cos(phi), math.sin(phi)
    return np.c_[c * P[:, 0] + s * P[:, 1], -s * P[:, 0] + c * P[:, 1]]


def union_height(sections, P):
    z = np.full(len(P), -np.inf)
    for sec in sections:
        Q = to_section(sec, P)
        m = in_rect(sec['rect'], Q)
        if not m.any(): continue
        s, t = local_st(sec['frame'], Q[m])
        z[m] = np.maximum(z[m], planes_eval(sec['planes'], s, t))
    return z


def total_score(sections, P, Z, lam):
    f = union_height(sections, P)
    inl = np.sum(np.abs(Z - f) < INLIER)
    return inl - lam * sum(COMPLEXITY[s['model']] for s in sections)


def make_section(rect, P, Z, mask=None, quick=False, allowed=None, form=None):
    frame = section_frame(rect)
    m = in_rect(rect, P)
    if mask is not None: m &= mask
    if m.sum() < 8: return None
    s, t = local_st(frame, P[m])
    fits = fit_models(s, t, Z[m], frame[2], frame[3], quick=quick)
    if allowed: fits = {k: v for k, v in fits.items() if k in allowed}
    name = choose(fits, int(m.sum()), form)
    if not name: return None
    planes, rmse, inl, params = fits[name]
    return {'rect': [float(v) for v in rect], 'frame': [float(v) for v in frame[:4]] + [bool(frame[4])], 'model': name,
            'planes': [[float(a), float(b), float(c)] for a, b, c in planes], 'rmse': float(rmse), 'n': int(m.sum()),
            'inliers': int(inl), 'params': params}


def residual_clusters(P, r, thresh, cell=0.5):
    """Connected clusters (8-neighbour on the 0.5 m lattice) of points with r > thresh."""
    idx = np.nonzero(r > thresh)[0]
    if not len(idx): return []
    g = np.floor(P[idx] / cell).astype(int)
    key = {tuple(k): i for i, k in enumerate(g)}
    seen = np.zeros(len(idx), bool); out = []
    for i in range(len(idx)):
        if seen[i]: continue
        stack = [i]; seen[i] = True; comp = []
        while stack:
            j = stack.pop(); comp.append(j)
            gx, gy = g[j]
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    k = key.get((gx + dx, gy + dy))
                    if k is not None and not seen[k]: seen[k] = True; stack.append(k)
        out.append(idx[comp])
    return out


def measure(house, debug=False, shift=None, form=None, split=True):
    """The roof over a plan from the returns inside it; `shift` [east, north]
    is where the plan's returns lie from it (register.py), and moves them onto
    it; `form` is the roof its street photograph shows, which a section over
    at least a third of the plan leans toward (choose)."""
    x, y, z, tree = lidar()
    s = np.zeros(2) if shift is None else np.asarray(shift, dtype='f8')
    outline = np.asarray(house['outline'], dtype='f8')
    poly = Polygon(outline).buffer(0)
    if poly.is_empty or poly.area < 12: return None
    if poly.geom_type != 'Polygon': poly = max(poly.geoms, key=lambda g: g.area)
    theta = orientation(outline)
    c = np.asarray(poly.centroid.coords[0])
    U = np.array([math.cos(theta), math.sin(theta)]); V = np.array([-U[1], U[0]])
    R = np.vstack([U, V])
    loc = (outline - c) @ R.T
    lpoly = Polygon(loc).buffer(0)
    if lpoly.geom_type != 'Polygon': lpoly = max(lpoly.geoms, key=lambda g: g.area)
    rad = np.max(np.hypot(*(outline - c).T)) + 1
    ids = np.asarray(tree.query_ball_point(c + s, rad), dtype=int)
    if len(ids) < 12: return {'id': house['id'], 'status': 'no-lidar', 'n': int(len(ids))}
    P = np.c_[x[ids], y[ids]] - s; Z = z[ids]
    PL = (P - c) @ R.T
    inner = lpoly.buffer(-0.2)
    inside = shapely.contains_xy(inner if not inner.is_empty else lpoly, PL[:, 0], PL[:, 1])
    PL = PL[inside]; Z = Z[inside]
    base = house['base']
    keep = Z > base + 1.6
    PL = PL[keep]; Z = Z[keep]
    n = len(Z)
    cover = n * 0.25 / poly.area
    if n < 12 or cover < 0.25: return {'id': house['id'], 'status': 'sparse', 'n': int(n), 'cover': cover}
    lam = max(3.0, 0.012 * n)
    minx, miny, maxx, maxy = lpoly.bounds
    us = list(loc[:, 0]) + [minx, maxx]; vs = list(loc[:, 1]) + [miny, maxy]
    us += height_breaks(PL[:, 0], Z, minx, maxx, jump=0.9)
    vs += height_breaks(PL[:, 1], Z, miny, maxy, jump=0.9)
    us = cluster_values(np.asarray(us), 0.7); vs = cluster_values(np.asarray(vs), 0.7)
    us[0], us[-1] = minx, maxx; vs[0], vs[-1] = miny, maxy
    nu, nv = len(us) - 1, len(vs) - 1
    if nu * nv > 400: return {'id': house['id'], 'status': 'too-complex', 'cells': nu * nv}
    cells = [box(us[i], vs[j], us[i + 1], vs[j + 1]) for i in range(nu) for j in range(nv)]
    frac = (np.asarray(shapely.area(shapely.intersection(cells, lpoly))) / np.asarray(shapely.area(cells))).reshape(nu, nv)
    inside_cell = frac >= 0.5
    ci = np.clip(np.searchsorted(us, PL[:, 0]) - 1, 0, nu - 1)
    cj = np.clip(np.searchsorted(vs, PL[:, 1]) - 1, 0, nv - 1)
    covered = np.zeros((nu, nv), bool)
    sections = []
    total_area = lpoly.area
    cell_area = np.outer(np.diff(us), np.diff(vs)) * frac
    for it in range(8):
        avail = inside_cell & ~covered
        if not avail.any() or cell_area[avail].sum() < max(2.5, 0.025 * total_area): break
        # every grid-aligned rectangle of available cells (maximal ones when many)
        P2 = np.zeros((nu + 1, nv + 1), int); P2[1:, 1:] = np.cumsum(np.cumsum(avail, 0), 1)
        rects = []
        for i0 in range(nu):
            for i1 in range(i0 + 1, nu + 1):
                for j0 in range(nv):
                    for j1 in range(j0 + 1, nv + 1):
                        if P2[i1, j1] - P2[i0, j1] - P2[i1, j0] + P2[i0, j0] == (i1 - i0) * (j1 - j0): rects.append((i0, i1, j0, j1))
        if len(rects) > 220: rects = maximal_rectangles(avail)
        free = np.ones(n, bool)
        if sections:
            f = union_height(sections, PL); free = ~(np.abs(Z - f) < INLIER)
        best = None
        for (i0, i1, j0, j1) in rects:
            rect = (us[i0], vs[j0], us[i1], vs[j1])
            if (rect[2] - rect[0]) * (rect[3] - rect[1]) < 2.5 or min(rect[2] - rect[0], rect[3] - rect[1]) < 1.0: continue
            m = (ci >= i0) & (ci < i1) & (cj >= j0) & (cj < j1) & free
            if m.sum() < 8: continue
            sec = make_section(rect, PL, Z, mask=m, quick=True)
            if not sec: continue
            # inliers among still-unexplained returns, less the model's cost
            val = sec['inliers'] - lam * COMPLEXITY[sec['model']] * 0.5
            if best is None or val > best[0]: best = (val, (i0, i1, j0, j1), m)
        if best is None: break
        val, (i0, i1, j0, j1), m = best
        rect = (us[i0], vs[j0], us[i1], vs[j1])
        main = (rect[2] - rect[0]) * (rect[3] - rect[1]) >= total_area / 3
        sec = make_section(rect, PL, Z, mask=m, form=form if main else None)
        if not sec: break
        sections.append(sec)
        covered[i0:i1, j0:j1] = True
    if not sections: return {'id': house['id'], 'status': 'unfit', 'n': int(n)}
    # ---- refinement 1: wings reach into their neighbours (valleys, not steps)
    for k in range(len(sections)):
        sec = sections[k]
        base_score = total_score(sections, PL, Z, lam)
        best = None
        x0, y0, x1, y1 = sec['rect']
        for side in range(4):
            for d in (1.0, 2.0, 3.0, 4.5, 6.0):
                r2 = [x0 - d if side == 0 else x0, y0 - d if side == 1 else y0, x1 + d if side == 2 else x1, y1 + d if side == 3 else y1]
                r2 = [max(r2[0], minx), max(r2[1], miny), min(r2[2], maxx), min(r2[3], maxy)]
                if r2 == sec['rect']: continue
                trial = dict(sec); trial['rect'] = r2
                # keep the fitted roof; only its extent changes
                sc = total_score(sections[:k] + [trial] + sections[k + 1:], PL, Z, lam)
                if sc > base_score + 2 and (best is None or sc > best[0]): best = (sc, r2)
        if best: sections[k] = dict(sec, rect=best[1], extended=True)
    # ---- refinement 2: raised parts inside a section (cross gables, dormers)
    for it in range(4):
        f = union_height(sections, PL); r = Z - f
        clusters = [cl for cl in residual_clusters(PL, np.where(np.isfinite(r), r, 0), 0.30) if len(cl) * 0.25 >= 2.5]
        if not clusters: break
        base_score = total_score(sections, PL, Z, lam)
        best = None
        for cl in sorted(clusters, key=len, reverse=True)[:3]:
            bx0, by0 = PL[cl].min(0) - 0.4; bx1, by1 = PL[cl].max(0) + 0.4
            variants = [(bx0, by0, bx1, by1), (minx, by0, bx1, by1), (bx0, miny, bx1, by1), (bx0, by0, maxx, by1), (bx0, by0, bx1, maxy)]
            for rect in variants:
                rect = (max(rect[0], minx), max(rect[1], miny), min(rect[2], maxx), min(rect[3], maxy))
                if min(rect[2] - rect[0], rect[3] - rect[1]) < 1.0: continue
                above = r > 0.12
                sec = make_section(rect, PL, Z, mask=above | (np.abs(r) < 0.12), allowed={'gable_s', 'gable_t', 'hip', 'hip_t', 'shed_s', 'shed_t', 'flat'})
                if not sec: continue
                sc = total_score(sections + [dict(sec, overlay=True)], PL, Z, lam)
                if sc > base_score + max(6, 0.015 * n) and (best is None or sc > best[0]): best = (sc, dict(sec, overlay=True))
        if not best: break
        sections.append(best[1])
    # ---- refinement 3: lower parts at a section's end (a wing, a porch or a
    # garage under its own lower roof) split from the section spanning them
    def snap(x, grid):
        k = int(np.argmin(np.abs(grid - x)))
        return float(grid[k]) if abs(grid[k] - x) < 0.8 else float(x)
    for it in range(3):
        f = union_height(sections, PL); r = Z - np.where(np.isfinite(f), f, Z)
        low = [cl for cl in residual_clusters(PL, -r, 0.35) if len(cl) * 0.25 >= 3.0]
        if not low: break
        base_score = total_score(sections, PL, Z, lam)
        best = None
        for cl in sorted(low, key=len, reverse=True)[:3]:
            (bx0, by0), (bx1, by1) = PL[cl].min(0), PL[cl].max(0)
            # candidate cuts at the cluster's inner edge where it reaches a section's end
            cuts = set()
            for sec in sections:
                if sec.get('overlay') or not in_rect(sec['rect'], PL[cl]).any(): continue
                x0, y0, x1, y1 = sec['rect']
                for axis, lo, hi, c0, c1, grid in ((0, x0, x1, bx0, bx1, us), (1, y0, y1, by0, by1, vs)):
                    if c1 > hi - 1.0 and c0 > lo + 1.0: cuts.add((axis, round(snap(c0 - 0.25, grid), 3)))
                    if c0 < lo + 1.0 and c1 < hi - 1.0: cuts.add((axis, round(snap(c1 + 0.25, grid), 3)))
            for axis, cut in sorted(cuts):
                # every section the cut crosses beside the cluster splits there, each part refitted
                trial, ok = [], False
                for sec in sections:
                    x0, y0, x1, y1 = sec['rect']
                    lo, hi = (x0, x1) if axis == 0 else (y0, y1)
                    olo, ohi, c0, c1 = (y0, y1, by0, by1) if axis == 0 else (x0, x1, bx0, bx1)
                    if sec.get('overlay') or not (lo + 1.0 < cut < hi - 1.0) or ohi < c0 or olo > c1: trial.append(sec); continue
                    a, b = ((x0, y0, cut, y1), (cut, y0, x1, y1)) if axis == 0 else ((x0, y0, x1, cut), (x0, cut, x1, y1))
                    big = lambda q: form if (q[2] - q[0]) * (q[3] - q[1]) >= total_area / 3 else None
                    sa, sb = make_section(a, PL, Z, form=big(a)), make_section(b, PL, Z, form=big(b))
                    if not sa or not sb: trial.append(sec); continue
                    trial += [sa, sb]; ok = True
                if not ok: continue
                sc = total_score(trial, PL, Z, lam)
                if sc > base_score + max(6, 0.015 * n) and (best is None or sc > best[0]): best = (sc, trial)
        if not best: break
        sections = best[1]
    result = {'id': house['id'], 'status': 'ok', 'theta': theta, 'centre': c.tolist(), 'grid': [us.tolist(), vs.tolist()], 'n': int(n), 'cover': cover}
    result.update(finish(sections, PL, Z, lpoly))
    # ---- a wing set at an angle to the rest: each part fitted in its own
    # frame, where together they explain clearly more of the returns
    parts = split_plan(outline) if split else None
    if parts:
        combined = []
        for k, part in enumerate(parts):
            sub = measure({'id': f"{house['id']}#{k}", 'outline': part, 'base': base}, shift=shift, form=form, split=False)
            if not sub or sub.get('status') != 'ok': combined = None; break
            phi = sub['theta'] - theta; ck = np.asarray(sub['centre']); Rk = np.array([[math.cos(sub['theta']), math.sin(sub['theta'])], [-math.sin(sub['theta']), math.cos(sub['theta'])]])
            d = (ck - c) @ Rk.T
            for sec in sub['sections']:
                x0, y0, x1, y1 = sec['rect']; cu, cv, A, B, swap = sec['frame']
                combined.append(dict(sec, rect=[x0 + d[0], y0 + d[1], x1 + d[0], y1 + d[1]], frame=[cu + d[0], cv + d[1], A, B, swap], rot=float(phi)))
        if combined:
            alt = finish(combined, PL, Z, lpoly)
            if alt['inlierShare'] > result['inlierShare'] + 0.04:
                result.update(alt); result['parts'] = len(parts)
    result['debug'] = (PL, Z, lpoly, R, c) if debug else None
    return result


def finish(sections, PL, Z, lpoly):
    """A fitted roof's chimneys (small, sharp clusters well above it) and how
    well it explains the returns."""
    f = union_height(sections, PL); r = Z - np.where(np.isfinite(f), f, Z)
    chimneys = []
    edges = [section_outline(s).exterior for s in sections]
    for cl in residual_clusters(PL, r, 0.45):
        area = len(cl) * 0.25
        if area > 2.0: continue
        top = float(Z[cl].max()); lift = float(r[cl].max())
        if not (0.7 <= lift <= 2.8) or (len(cl) < 2 and lift < 1.0): continue
        cxy = PL[cl].mean(0)
        if lpoly.exterior.distance(Point(cxy)) < 0.5: continue
        # section seams carry fitting noise, not masonry
        if min(e.distance(Point(cxy)) for e in edges) < 0.6 and lift < 1.2: continue
        ext = PL[cl].max(0) - PL[cl].min(0) + 0.5
        roofz = float(union_height(sections, cxy[None])[0])
        chimneys.append({'at': [float(v) for v in cxy], 'top': top, 'roof': roofz, 'size': [float(min(1.4, max(0.55, ext[0]))), float(min(1.4, max(0.55, ext[1])))], 'lift': lift, 'n': int(len(cl))})
    chimneys = sorted(chimneys, key=lambda ch: -ch['lift'] * min(ch['n'], 4))[:2]
    return {'sections': sections, 'chimneys': chimneys, 'inlierShare': float(np.mean(np.abs(r) < INLIER)),
            'rmse': float(np.sqrt(np.mean(np.minimum(r, 2) ** 2)))}


def section_outline(sec):
    """A section's rectangle in the house frame, turned with its wing."""
    import shapely.affinity
    b = box(*sec['rect'])
    return shapely.affinity.rotate(b, sec['rot'], origin=(0, 0), use_radians=True) if sec.get('rot') else b


def split_plan(outline):
    """A plan whose outline turns through a second orientation for one stretch
    (a wing set at an angle to the rest): its two parts, cut along the line
    joining the corners where the outline passes from one orientation to the
    other; else None."""
    ol = np.asarray(outline, dtype='f8')
    n = len(ol)
    if n < 6: return None
    d = np.diff(np.vstack([ol, ol[:1]]), axis=0); L = np.hypot(*d.T)
    ang = np.arctan2(d[:, 1], d[:, 0])
    # the plan's main orientation: the direction (modulo a right angle) most of its outline runs in
    grid = np.radians(np.arange(0, 90, 1.0))
    near = np.abs((ang[None] - grid[:, None] + math.pi / 4) % (math.pi / 2) - math.pi / 4) < math.radians(4)
    th = float(grid[np.argmax((near * L[None]).sum(1))])
    dev = np.abs((ang - th + math.pi / 4) % (math.pi / 2) - math.pi / 4)
    off = dev > math.radians(10)
    # short stretches (under 1.5 m) between turned edges join the run around them
    for i in range(n):
        if off[i] or not off[i - 1]: continue
        j, run = i, 0.0
        while not off[j % n] and run < 1.5 and j - i < n: run += L[j % n]; j += 1
        if run < 1.5 and off[j % n]:
            for m in range(i, j): off[m % n] = True
    if L[off].sum() < 0.2 * L.sum() or L[~off].sum() < 0.3 * L.sum(): return None
    starts = [i for i in range(n) if off[i] and not off[i - 1]]
    if len(starts) != 1: return None
    i0 = starts[0]; j = i0
    while off[j % n] and j - i0 < n: j += 1
    k = j - i0
    wing = [ol[(i0 + m) % n] for m in range(k + 1)]
    main = [ol[(i0 + k + m) % n] for m in range(n - k + 1)]
    if len(wing) < 3 or len(main) < 3: return None
    plan = Polygon(ol).buffer(0)
    parts = []
    for ring in (main, wing):
        p = Polygon(ring)
        if not p.is_valid or p.area < 12 or p.area < 0.15 * plan.area: return None
        parts.append(ring)
    if abs(Polygon(main).area + Polygon(wing).area - plan.area) > 0.05 * plan.area: return None
    th2 = orientation(np.asarray(wing))
    if abs((th2 - th + math.pi / 4) % (math.pi / 2) - math.pi / 4) < math.radians(8): return None
    return [np.asarray(r).tolist() for r in parts]


def model_height(result, PL):
    return union_height(result['sections'], PL)
