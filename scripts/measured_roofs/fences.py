"""Front fences, walls and hedges along each lot's street frontage.

The assessor's street photograph says what stands along the front of a lot;
the parcel map says where the lot meets the street. A frontage is the run of
parcel edges near the house's address street and roughly parallel to it,
inset 0.25 m into the lot. Openings are left where the 2025 aerial shows a
paved drive crossing the frontage and in line with the front door.
"""
import json, math, re
import numpy as np
import shapely
from shapely.geometry import shape, LineString, Point
from shapely.ops import transform as reproject
from pyproj import Transformer

OX, OY = 171282.3328920724, 867589.2761750807
SUF = {'ST': 'STREET', 'ST.': 'STREET', 'RD': 'ROAD', 'AVE': 'AVENUE', 'DR': 'DRIVE', 'LN': 'LANE', 'CT': 'COURT', 'TER': 'TERRACE',
       'PKWY': 'PARKWAY', 'CIR': 'CIRCLE', 'PL': 'PLACE', 'HWY': 'HIGHWAY', 'SQ': 'SQUARE'}


def street_name(addr, names):
    parts = (addr or '').upper().replace(',', ' ').split()
    while parts and re.match(r'^[0-9][0-9A-Z\-/]*$', parts[0]): parts.pop(0)
    if not parts: return None
    ext = parts[-1] in ('EXT', 'EXTENSION')
    if ext: parts = parts[:-1]
    if parts and parts[-1] in SUF: parts[-1] = SUF[parts[-1]]
    cand = ' '.join(parts)
    for c in ([cand + ' EXTENSION'] if ext else []) + [cand]:
        if c in names: return c
    return None


class Frontages:
    def __init__(self, parcels_path, network, aerial):
        T = Transformer.from_crs(4326, 6491, always_xy=True)
        to_local = lambda x, y, z=None: (np.asarray(T.transform(x, y)[0]) - OX, np.asarray(T.transform(x, y)[1]) - OY)
        feats = json.load(open(parcels_path))['features']
        self.parcels = [reproject(to_local, shape(f['geometry'])) for f in feats if f.get('geometry')]
        self.tree = shapely.STRtree(self.parcels)
        self.streets = {}
        for e in network['edges']:
            if len(e['points']) >= 2: self.streets.setdefault(e['name'], []).append(LineString([p[:2] for p in e['points']]))
        self.names = set(self.streets)
        self.widths = {}
        for e in network['edges']: self.widths[e['name']] = max(self.widths.get(e['name'], 0), float(e.get('width_m') or 7))
        self.aerial = aerial

    def half_width(self, name):
        return self.widths.get(name, 7.0) / 2

    def address_point(self, address, xy):
        """The nearest point on the street an address names, or None."""
        name = street_name(address, self.names)
        if not name: return None
        p = shapely.Point(*xy)
        best = min(self.streets[name], key=lambda l: l.distance(p))
        q = best.interpolate(best.project(p))
        return np.array([q.x, q.y]) if q.distance(p) < 120 else None

    def nearest_road(self, xy):
        """The nearest point on any mapped street centreline, or None."""
        if not hasattr(self, '_lines'):
            self._lines = [l for ls in self.streets.values() for l in ls]
            self._line_tree = shapely.STRtree(self._lines)
        p = shapely.Point(*xy)
        i = self._line_tree.nearest(p)
        if i is None: return None
        q = self._lines[i].interpolate(self._lines[i].project(p))
        return np.array([q.x, q.y])

    def paved(self, xy):
        """Aerial pixels that read as pavement: grey (asphalt or concrete), not lawn, bark or shade-blue."""
        rgb = self.aerial(xy[:, 0], xy[:, 1]).astype(float)
        r, g, b = rgb[:, 0], rgb[:, 1], rgb[:, 2]
        mx, mn = rgb.max(1), rgb.min(1); v = mx; s = (mx - mn) / np.maximum(mx, 1)
        return (s < 0.14) & (v > 70) & (v < 235) & ~(g > r + 8)

    def frontage(self, house, address):
        """Polylines [[e, n], ...] of the lot's street frontage, openings removed, or []."""
        xs = [p[0] for p in house['outline']]; ns = [p[1] for p in house['outline']]
        c = Point(sum(xs) / len(xs), sum(ns) / len(ns))
        lot = next((self.parcels[i] for i in self.tree.query(c, predicate='within')), None)
        name = street_name(address, self.names)
        if lot is None or lot.geom_type != 'Polygon' or not name: return []
        road = shapely.union_all(self.streets[name])
        ring = np.asarray(lot.exterior.coords)
        keep = []
        for a, b in zip(ring[:-1], ring[1:]):
            seg = LineString([a, b]); L = seg.length
            if L < 1.5: continue
            mid = seg.interpolate(0.5, normalized=True)
            if road.distance(mid) > 22: continue
            p = shapely.ops.nearest_points(road, mid)[0]
            q = road.interpolate(road.project(p) + 1.0); t = np.array([q.x - p.x, q.y - p.y]); tl = np.hypot(*t)
            if tl < 1e-6: continue
            d = (b - a) / L
            if abs(d @ (t / tl)) < 0.85: continue
            # the frontage faces the street: the road lies outside the lot beyond this edge
            if lot.contains(Point(mid.x + (p.x - mid.x) * 0.2, mid.y + (p.y - mid.y) * 0.2)): continue
            keep.append((a, b))
        if not keep: return []
        body = shapely.Polygon(house['outline']).buffer(1.0)
        # inset 0.25 m into the lot and cut the openings
        out = []
        door = None
        e = house.get('entry')
        if e:
            fr = house['frames'][e['frameIndex']]
            door = np.array(fr['start']) + np.array(fr['tangent']) * e['u']
        for a, b in keep:
            L = float(np.hypot(*(b - a))); d = (b - a) / L; nrm = np.array([-d[1], d[0]])
            if not lot.contains(Point(*((a + b) / 2 + nrm * 0.5))): nrm = -nrm
            a2, b2 = a + nrm * 0.25, b + nrm * 0.25
            us = np.arange(0.0, L + 1e-6, 0.25)
            pts = a2[None] + d[None] * us[:, None]
            # Parcel lines are approximate: keep the fence off the road and the sidewalk
            # (at least 1.8 m beyond the pavement edge) and clear of the house itself.
            dist = shapely.distance(road, shapely.points(pts[:, 0], pts[:, 1]))
            back = np.clip(self.half_width(name) + 1.8 - dist, 0, 4)
            pts = pts + nrm[None] * back[:, None]
            open_ = self.paved(pts) & self.paved(pts + nrm[None] * 3.0)   # a drive runs in toward the house
            open_ |= shapely.contains_xy(body, pts[:, 0], pts[:, 1])
            if door is not None:
                ud = (door - a2) @ d
                if -1 < ud < L + 1: open_ |= np.abs(us - ud) < 0.7
            # openings only where at least 2.2 m of drive (or the walk) runs together
            runs, start = [], None
            for k, o in enumerate(list(open_) + [False]):
                if o and start is None: start = k
                if not o and start is not None:
                    if (k - start) * 0.25 >= 2.2 or (door is not None and np.any(np.abs(us[start:k] - (door - a2) @ d) < 0.7)): runs.append((start, k))
                    start = None
            solid = np.ones(len(us), bool)
            for s0, s1 in runs: solid[s0:s1] = False
            k = 0
            while k < len(us):
                if not solid[k]: k += 1; continue
                j = k
                while j + 1 < len(us) and solid[j + 1]: j += 1
                if us[j] - us[k] >= 1.0: out.append([pts[k].tolist(), pts[j].tolist()])
                k = j + 1
        return out
