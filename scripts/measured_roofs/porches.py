"""Open front porches, and stacked porches, the plan holds.

Many of the town's older houses have their front porch inside the mapped
outline: the survey's roof over it is a low one along the front, and the
house's own wall rises behind it. Where the street photograph shows an open
porch (or an open lowest level of stacked porches) and the measured body has
that shape -- a front wall no taller than a storey on a taller house, and a
wall of the body 1.2-3.8 m behind it standing on the porch roof, within the
photographed porch's extent -- the porch
is cut out of the body under its roof: the front wall and the strip's ends
go, the house wall behind is laid open from the ground, and the porch roof
keeps a flat ceiling. The game builds the deck, posts, railings and steps
(evidence-buildings.ts); the door and ground-floor windows move back onto
the house wall. A triple-decker's stacked porches that the plan holds as a box
standing proud of the house front, where the photograph puts them, are cut
out the same way above an enclosed ground level; the house wall behind them
takes its windows and the game builds each level's deck, posts and railings.
"""
import base64

import numpy as np

INSET = 0.32


def _mesh(rec):
    v = np.frombuffer(base64.b64decode(rec['v']), dtype='<i2').reshape(-1, 3).astype(float) / 100
    tri = np.frombuffer(base64.b64decode(rec['wall']), dtype='<u2').reshape(-1, 3)
    return v[:, :2] + np.asarray(rec['origin']), v[:, 2], tri


def _top(p):
    if p is None: return None
    return float(p) if isinstance(p, (int, float)) else max(h for _, h in p)


def _low(p):
    return float(p) if isinstance(p, (int, float)) else min(h for _, h in p)


def open_porch(house, rec, ep, f):
    """The porch of a house whose photograph shows an open porch, as {'f':
    frame, 'c': ceiling above the base, 's': strips}, each strip {'u': [u0, u1]
    along the frame's inset wall, 'd': depth of the house wall behind it,
    'ends': [cut past u0, cut past u1]} (the house wall behind a porch may
    step), or None."""
    if not f or not (f.get('porch') == 'open' or (f.get('porch') == 'stacked' and f.get('ground') == 'open')): return None
    frames = house['frames']
    e = house.get('entry')
    front = next((i for i, fr in enumerate(frames) if fr.get('front')), None)
    F = e['frameIndex'] if e else front
    if F is None or ep[F] is None: return None
    fr = frames[F]; w = fr['width'] - 2 * INSET
    # the porch fronts the street: its wall faces the way the house's front does
    if w < 2.0 or (front is not None and np.dot(fr['outward'], frames[front]['outward']) < .95): return None
    base = rec['base']; floor = house['floor'] - base
    hF = _low(ep[F])
    tops = [_top(p) for p in ep if p is not None]
    if hF - floor > 3.6 or hF - floor < 2.1 or max(tops) - floor < 4.5: return None
    t = np.asarray(fr['tangent'], float); o = np.asarray(fr['outward'], float)
    s = np.asarray(fr['start'], float) + t * INSET - o * INSET
    en, z, tri = _mesh(rec)
    rel = en - s; u = rel @ t; off = rel @ o
    # wall triangles facing the street behind the front wall, by depth
    p = np.c_[en, z][tri]
    n = np.cross(p[:, 1] - p[:, 0], p[:, 2] - p[:, 0])
    h = np.hypot(n[:, 0], n[:, 1])
    facing = (h > 1e-4) & ((n[:, 0] * o[0] + n[:, 1] * o[1]) > .998 * np.maximum(h, 1e-9))
    depth = -off[tri].mean(1)
    strips = []
    for d in np.unique(np.round(depth[facing & (depth > 1.2) & (depth < 3.8)], 1)):
        m = facing & (np.abs(depth - d) < .08)
        lo = float(z[tri[m]].min()); u0 = float(max(0.0, u[tri[m]].min())); u1 = float(min(w, u[tri[m]].max()))
        # the house wall behind stands on the porch roof
        if u1 - u0 < 1.2 or not (hF - .3 <= lo <= hF + 1.8): continue
        if any(min(u1, q['u'][1]) - max(u0, q['u'][0]) > .2 for q in strips): continue
        strips.append({'u': [round(u0, 2), round(u1, 2)], 'd': round(float(depth[m].mean()), 3)})
    strips.sort(key=lambda q: q['u'][0])
    # where the photograph gives the porch's extent along the front, the strips lie within it
    pw = (f.get('lo') or {}).get('pw')
    if pw:
        street = [i for i, g in enumerate(frames) if np.dot(g['outward'], o) > .95 and g['width'] >= .4]
        a = [float(np.dot(frames[i]['start'], t)) for i in street]; b = [a[k] + frames[i]['width'] for k, i in enumerate(street)]
        a0, a1 = min(a), max(b); right = t[0] * -o[1] + t[1] * o[0] > 0
        at = lambda x: a0 + x / 100 * (a1 - a0) if right else a1 - x / 100 * (a1 - a0)
        lo_, hi_ = sorted((at(pw[0]), at(pw[1])))
        base_a = float(np.dot(fr['start'], t)) + INSET
        strips = [q for q in strips if min(hi_, base_a + q['u'][1]) - max(lo_, base_a + q['u'][0]) >= .4 * (q['u'][1] - q['u'][0])]
    if sum(q['u'][1] - q['u'][0] for q in strips) < max(1.8, .5 * w): return None
    # the strips' outer ends: past a corner of the house its side walls go too
    k = len(frames)
    prev, nxt = frames[(F - 1) % k], frames[(F + 1) % k]
    for i, q in enumerate(strips):
        q['ends'] = [bool(i == 0 and q['u'][0] < .3 and np.dot(prev['outward'], t) < -.9),
                     bool(i == len(strips) - 1 and q['u'][1] > w - .3 and np.dot(nxt['outward'], t) > .9)]
    return {'f': F, 'c': round(hF, 3), 's': strips}


STOREY = 2.8


def stacked_porch(house, rec, ep, f):
    """The stacked porches of a triple-decker (or two-family) that the plan
    holds as a box standing 1.1-3.2 m proud of the house front where the
    photograph puts them, cut out above an enclosed ground level (or from the
    ground when that is open too), up to the box's roof: as open_porch's, with
    'z0' the cut's floor above the base (absent from the ground) and 'n' levels."""
    if not f or f.get('porch') != 'stacked' or f.get('upper') == 'enclosed': return None
    pw = (f.get('lo') or {}).get('pw')
    if not pw: return None
    frames = house['frames']
    F = next((i for i, fr in enumerate(frames) if fr.get('front')), None)
    if F is None: return None
    o = np.asarray(frames[F]['outward'], float); t = np.asarray(frames[F]['tangent'], float)
    street = [i for i, fr in enumerate(frames) if np.dot(fr['outward'], o) > .95 and fr['width'] >= .4]
    depth = lambda i: float(np.dot(frames[i]['start'], o))
    span = lambda i: (float(np.dot(frames[i]['start'], t)), float(np.dot(frames[i]['start'], t)) + frames[i]['width'])
    a0 = min(span(i)[0] for i in street); a1 = max(span(i)[1] for i in street)
    right = t[0] * -o[1] + t[1] * o[0] > 0
    at = lambda x: a0 + x / 100 * (a1 - a0) if right else a1 - x / 100 * (a1 - a0)
    c = (at(pw[0]) + at(pw[1])) / 2
    hold = [i for i in street if span(i)[0] - .1 <= c <= span(i)[1] + .1]
    if not hold: return None
    P = max(hold, key=depth)
    behind = [depth(j) for j in street if j != P and frames[j]['width'] > 1.5]
    if not behind or ep[P] is None: return None
    d = depth(P) - max(behind); w = frames[P]['width'] - 2 * INSET
    base = rec['base']; floor = house['floor'] - base; top = _low(ep[P])
    if not (1.1 <= d <= 3.2) or w < 2.4 or top - floor < 2 * STOREY - .3: return None
    n = int(max(2, min(3, round((top - floor) / STOREY))))
    k = len(frames)
    porch = {'f': P, 'c': round(top, 3), 'n': n, 's': [{'u': [0.0, round(w, 2)], 'd': round(d, 3),
             'ends': [bool(np.dot(frames[(P - 1) % k]['outward'], t) < -.9), bool(np.dot(frames[(P + 1) % k]['outward'], t) > .9)]}]}
    if f.get('ground') != 'open': porch['z0'] = round(floor + STOREY - .1, 3)
    return porch


def carve_rings(house, porch):
    """The prisms to cut, one per strip: from 2 cm outside the front wall back
    to the house wall, 2 cm past a corner's side wall, as east/north corners."""
    fr = house['frames'][porch['f']]
    t = np.asarray(fr['tangent'], float); o = np.asarray(fr['outward'], float)
    s = np.asarray(fr['start'], float) + t * INSET - o * INSET
    rings = []
    for q in porch['s']:
        u0 = q['u'][0] - (.02 if q['ends'][0] else 0.0); u1 = q['u'][1] + (.02 if q['ends'][1] else 0.0); d = q['d'] - .005
        rings.append([(s + t * u0 + o * .02).tolist(), (s + t * u1 + o * .02).tolist(), (s + t * u1 - o * d).tolist(), (s + t * u0 - o * d).tolist()])
    return rings
