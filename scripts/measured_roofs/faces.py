"""Which wall of a house its street photograph shows.

The plan marks one wall as the house's front. A photograph read as a gable
end facing the camera ('front') of a house whose marked front is a level eave
wall, or read as eaves facing the camera ('side') of one whose marked front
rises to a gable, shows another wall. Of the walls matching the read, the one
facing the house's address street best is taken, when it faces that street
clearly better than the marked front; when the photograph shows garage doors,
paving in front of a wall (a drive, in the game's land-cover mask) counts for
it as much as facing the street.
"""
import json, math
from pathlib import Path

import numpy as np
from PIL import Image


class Cover:
    """The game's land-cover masks (public/town-surfaces): paving is blue over 150 with red under 100."""

    def __init__(self, site):
        self.site = Path(site); self.masks = json.load(open(self.site / 'public/town-surfaces/v2/index.json'))['masks']; self.cache = {}

    def paved(self, e, n):
        t = f'{math.floor(e / 250)}_{math.floor(n / 250)}'; m = self.masks.get(t)
        if not m: return False
        if t not in self.cache: self.cache[t] = np.asarray(Image.open(self.site / ('public' + m['url'])).convert('RGB'))
        a = self.cache[t]; b = m['bounds']; h, w = a.shape[:2]
        x = int((e - b[0]) / (b[2] - b[0]) * w); y = int((-n - b[1]) / (b[3] - b[1]) * h)
        r, _, bl = a[min(h - 1, max(0, y)), min(w - 1, max(0, x))]
        return bl > 150 and r < 100


def peaked(p):
    """A measured wall top rising more than a metre above both its ends: a gable end."""
    if p is None or isinstance(p, (int, float)): return False
    return max(h for _, h in p) - max(p[0][1], p[-1][1]) > 1.0


def level(p):
    return p is not None and not peaked(p)


def street_face(house, ep, lo, lots, cover):
    """The index of the frame the photograph shows, when it is not the marked front; else None."""
    rf = (lo or {}).get('rf')
    if rf not in ('front', 'side'): return None
    frames = house['frames']
    F = next((i for i, f in enumerate(frames) if f.get('front')), None)
    if F is None: return None
    match = peaked if rf == 'front' else level
    o = np.asarray(frames[F]['outward'], float)
    street = [i for i, f in enumerate(frames) if np.dot(f['outward'], o) > .95 and f['width'] > 2]
    if not street: return None
    widest = max(street, key=lambda i: frames[i]['width'])
    if match(ep[widest]): return None
    xs = [p[0] for p in house['outline']]; ns = [p[1] for p in house['outline']]
    c = np.array([sum(xs) / len(xs), sum(ns) / len(ns)])
    ap = lots.address_point(house.get('address'), c)
    if ap is None: return None
    d = ap - c; n = np.hypot(*d)
    if n < 1: return None
    d = d / n

    def paved(i):
        f = frames[i]; st = np.asarray(f['start'], float); t = np.asarray(f['tangent'], float); ow = np.asarray(f['outward'], float)
        pts = np.array([st + t * u + ow * v for u in np.linspace(f['width'] * .25, f['width'] * .75, 5) for v in (1.5, 3.0, 4.5)])
        return float(np.mean([cover.paved(e, n) for e, n in pts]))

    def score(i):
        s = float(np.dot(frames[i]['outward'], d))
        return s + paved(i) if lo.get('gx') else s

    cands = [i for i, f in enumerate(frames) if f['width'] > 3 and match(ep[i]) and np.dot(f['outward'], o) < .5]
    if not cands: return None
    best = max(cands, key=score)
    return best if score(best) > .45 and score(best) > score(widest) + .2 else None
