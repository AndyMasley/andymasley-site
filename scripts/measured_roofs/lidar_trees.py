"""Trees where the survey found them, along the streets and around the houses.

The scenery's trees stand one to a 12 m block wherever the 2021 LiDAR's
vegetation returns cover a fifth of it: right for woods, but a yard's maple
or a street's row of oaks lands wherever its block's highest cell was. Near
the streets and houses (within 25 m of a road centreline or of a
building), each tree is instead found in the survey itself: the highest
vegetation return in each 2 m cell, less the ground there, is a canopy height
model; its peaks (lightly smoothed, at least 4 m apart and 4 m high) are the
treetops, each crown the canopy nearest its top; a trunk over a road steps off
its edge, one inside any building goes (a steeple's or a tower's returns read
as a tree go with it), one on a drive, a lot, a walk or in the water steps to
open ground within 3 m, and no crown reaches more than 2 m over the nearest
building. Each treetop is first moved onto
the plans by the local shift the houses' roofs need (register.py), so a yard
tree keeps its place beside its house. The block trees in that zone give
way to these; farther out the blocks stay.

The ground is the survey's own (townwide/ground_grid.npz: the mean ground
return in each 2 m cell, gaps under dense canopy filled from the nearest
surveyed cell); without that file it is interpolated from the road network's
surveyed centrelines, the sampled ground along every house wall and the block
trees' own feet. A tree ships as its place, height and crown radius; the game
stands it on its terrain.
"""
import base64, gzip, json, math
from pathlib import Path

import numpy as np
from scipy import ndimage
from scipy.interpolate import LinearNDInterpolator
from scipy.spatial import cKDTree

ROAD_REACH, BUILDING_REACH = 25.0, 25.0
MIN_HEIGHT, MIN_GAP = 4.0, 2   # metres; cells either side of a peak


def load_grid(source):
    d = np.load(Path(source) / 'townwide/vegetation_grid.npz')
    return d['max_z'].astype(float), d['count'], np.asarray(d['origin_xy'], float), float(d['cell_size_m'])


def zone_mask(shape, origin, cell, network, outlines):
    """Cells within reach of a road centreline or a building."""
    h, w = shape
    near = np.zeros(shape, bool)
    def mark(xy, mask):
        ix = np.floor((xy[:, 0] - origin[0]) / cell).astype(int); iy = np.floor((xy[:, 1] - origin[1]) / cell).astype(int)
        ok = (ix >= 0) & (ix < w) & (iy >= 0) & (iy < h)
        mask[iy[ok], ix[ok]] = True
    roads = np.zeros(shape, bool)
    for e in network['edges']:
        p = np.asarray([q[:2] for q in e['points']], float)
        if len(p) < 2: continue
        seg = np.concatenate([np.linspace(p[k], p[k + 1], max(2, int(np.hypot(*(p[k + 1] - p[k])) / 1.0) + 1)) for k in range(len(p) - 1)])
        mark(seg, roads)
    buildings = np.zeros(shape, bool)
    for ring in outlines:
        r = np.asarray(ring, float)
        if len(r) < 3: continue
        seg = np.concatenate([np.linspace(r[k], r[(k + 1) % len(r)], max(2, int(np.hypot(*(r[(k + 1) % len(r)] - r[k])) / 1.0) + 1)) for k in range(len(r))])
        mark(seg, buildings)
    near |= ndimage.distance_transform_edt(~roads) * cell <= ROAD_REACH
    near |= ndimage.distance_transform_edt(~buildings) * cell <= BUILDING_REACH
    return near


def ground_model(network, houses, block_feet):
    """Ground elevation at any point, from surveyed road centrelines, house wall ground samples and block trees' feet."""
    pts = []
    for e in network['edges']:
        for q in e['points']:
            if len(q) >= 3 and math.isfinite(q[2]): pts.append(q[:3])
    for h in houses:
        for f in h['frames']:
            g = f.get('groundAt') or []
            for k, z in enumerate(g):
                if z is None: continue
                u = f['width'] * k / max(1, len(g) - 1)
                pts.append([f['start'][0] + f['tangent'][0] * u + f['outward'][0] * .5, f['start'][1] + f['tangent'][1] * u + f['outward'][1] * .5, z])
    pts += block_feet
    pts = np.asarray(pts, float)
    pts = pts[np.isfinite(pts).all(1)]
    # one point per 2 m cell keeps the triangulation lean
    _, keep = np.unique(np.floor(pts[:, :2] / 2.0).astype(np.int64), axis=0, return_index=True)
    pts = pts[keep]
    lin = LinearNDInterpolator(pts[:, :2], pts[:, 2])
    tree = cKDTree(pts[:, :2])
    def ground(xy):
        z = lin(xy)
        bad = ~np.isfinite(z)
        if bad.any(): z[bad] = pts[tree.query(xy[bad])[1], 2]
        return z
    return ground


def ground_grid(source, shape):
    """The survey's own ground (mean class-2 return per 2 m cell, on the vegetation
    grid's cells), gaps under dense canopy filled from the nearest surveyed cell;
    None when the research folder does not hold it."""
    path = Path(source) / 'townwide/ground_grid.npz'
    if not path.exists(): return None
    g = np.load(path)['mean_z'].astype(float)
    if g.shape != shape: return None
    bad = ~np.isfinite(g)
    if bad.any():
        _, (iy, ix) = ndimage.distance_transform_edt(bad, return_indices=True)
        g = g[iy, ix]
    return g


def treetops(max_z, count, origin, cell, zone, ground, grid=None):
    """Treetops in the zone: (east, north, height, crown radius) per tree."""
    rows, cols = np.nonzero(zone & (count > 0))
    chm = np.zeros(max_z.shape, float)
    xy = np.c_[origin[0] + (cols + .5) * cell, origin[1] + (rows + .5) * cell]
    chm[rows, cols] = max_z[rows, cols] - (grid[rows, cols] if grid is not None else ground(xy))
    chm[~np.isfinite(chm)] = 0; chm = np.clip(chm, 0, 45)
    smooth = ndimage.gaussian_filter(chm, 1.0)
    peak = (smooth == ndimage.maximum_filter(smooth, size=2 * MIN_GAP + 1)) & (ndimage.maximum_filter(chm, size=3) >= MIN_HEIGHT) & zone
    iy, ix = np.nonzero(peak)
    # each crown: the canopy (over 2.5 m) nearest its top
    markers = np.zeros(chm.shape, np.int32); markers[iy, ix] = np.arange(1, len(iy) + 1)
    _, (ny, nx) = ndimage.distance_transform_edt(markers == 0, return_indices=True)
    owner = markers[ny, nx]
    canopy = (chm >= 2.5) & zone & (np.hypot(ny - np.arange(chm.shape[0])[:, None], nx - np.arange(chm.shape[1])[None]) * cell <= 9)
    area = np.bincount(owner[canopy], minlength=len(iy) + 1)[1:] * cell * cell
    height = ndimage.maximum_filter(chm, size=3)[iy, ix]
    radius = np.clip(np.sqrt(area / math.pi), 1.5, 8.0)
    east = origin[0] + (ix + .5) * cell; north = origin[1] + (iy + .5) * cell
    return np.c_[east, north, height, radius]


class Cover:
    """The scenery's land cover (surfaces/masks/<tile>.png, about 1 m) at
    east/north points: whether each is paved (drives, lots, walks, streets)
    and whether it has no cover at all (a building or water)."""
    def __init__(self, site):
        import glob
        manifest = Path(sorted(glob.glob(str(Path(site) / 'public/town-assets/*/manifest.json')))[-1])
        self.masks, self.root, self.images = json.load(open(manifest))['surfaces']['masks'], manifest.parent, {}

    def __call__(self, e, n):
        from PIL import Image
        tile = f'{math.floor(e / 250)}_{math.floor(n / 250)}'
        m = self.masks.get(tile)
        if not m: return False, False
        if tile not in self.images: self.images[tile] = np.asarray(Image.open(self.root / m['url'])).astype(int)
        im = self.images[tile]; x0, z0, x1, z1 = m['bounds']; h, w = im.shape[:2]
        px, pz = int((e - x0) * w / (x1 - x0)), int((-n - z0) * h / (z1 - z0))
        if not (0 <= px < w and 0 <= pz < h): return False, False
        c = im[pz, px]; total = int(c.sum())
        return total >= 24 and c[2] * 2 > total, total < 24


def clear_of(tops, network, outlines, cover=None, water=()):
    """Trunks off the pavement and out of the buildings: a treetop over a road
    (within its half-width and 0.8 m) stands its trunk just off the edge when
    that is within 3 m, else goes; one inside any building's outline (or within
    half a metre of it) goes, which also drops the returns of steeples and
    towers read as trees. A trunk on a drive, a lot or a walk, or in the water,
    steps to the nearest open ground within 3 m, else goes; and a crown reaches
    at most 2 m over the nearest building."""
    import shapely
    from shapely.geometry import LineString, Polygon
    lines, half = [], []
    for e in network['edges']:
        if len(e['points']) >= 2:
            lines.append(LineString([q[:2] for q in e['points']])); half.append(float(e.get('width_m') or 7) / 2)
    tree = shapely.STRtree(lines)
    walls = [Polygon(r) for r in outlines if len(r) >= 3]
    walls = [w if w.is_valid else w.buffer(0) for w in walls]
    rings = [w.buffer(.5) for w in walls]
    bodies, near = shapely.STRtree(rings), shapely.STRtree(walls)
    wet = shapely.STRtree([Polygon(r[0], r[1:]).buffer(0) for r in water]) if len(water) else None
    def blocked(e, n):
        p = shapely.Point(e, n)
        if len(bodies.query(p, predicate='intersects')): return True
        i = tree.nearest(p)
        if i is not None and p.distance(lines[i]) < half[i] + .8: return True
        if wet is not None and len(wet.query(p, predicate='intersects')): return True
        if cover is not None:
            paved, bare = cover(e, n)
            if paved or bare: return True
        return False
    rings_out = [(dx, dy) for rad in (.5, 1.0, 1.5, 2.0, 2.5, 3.0) for a in np.linspace(0, 2 * math.pi, int(8 * rad) + 4, endpoint=False)
                 for dx, dy in [(rad * math.cos(a), rad * math.sin(a))]]
    keep = np.ones(len(tops), bool); out = tops.copy(); stats = {'building': 0, 'road': 0, 'stepped': 0, 'open': 0, 'lost': 0, 'crowns': 0}
    for k, (e, n, h, r) in enumerate(tops):
        p = shapely.Point(e, n)
        if len(bodies.query(p, predicate='intersects')): keep[k] = False; stats['building'] += 1; continue
        i = tree.nearest(p)
        if i is not None:
            q = lines[i].interpolate(lines[i].project(p)); d = p.distance(q); need = half[i] + .8
            if d < need:
                if need - d > 3 or d < 1e-6: keep[k] = False; stats['road'] += 1; continue
                e, n = q.x + (e - q.x) / d * need, q.y + (n - q.y) / d * need; stats['stepped'] += 1
        if blocked(e, n):
            # the nearest open ground within 3 m, else the tree goes
            found = next(((e + dx, n + dy) for dx, dy in rings_out if not blocked(e + dx, n + dy)), None)
            if found is None: keep[k] = False; stats['lost'] += 1; continue
            e, n = found; stats['open'] += 1
        out[k, 0], out[k, 1] = e, n
        # a crown reaches at most 2 m over the nearest building
        j = near.nearest(shapely.Point(e, n))
        if j is not None:
            room = shapely.Point(e, n).distance(walls[j]) + 2.0
            if room < out[k, 3]: out[k, 3] = max(1.5, room); stats['crowns'] += 1
    print('survey trees:', {**stats, 'kept': int(keep.sum()), 'of': len(tops)}, flush=True)
    return out[keep], tops[keep]


def lidar_tiles(site, source, houses, others_outlines, tile_rows, buildings=()):
    """Per tile: {'n': scenery rows, 'k': base64 bits of the rows kept, 't': base64 int16
    [x, z, height, radius] decimetres per survey tree (tile-local x, z)} and the combined
    rows (kept scenery rows, then survey trees) for the evergreen read."""
    site = Path(site)
    network = json.load(gzip.open(site / 'data/derived/town/engine-network.json.gz'))
    max_z, count, origin, cell = load_grid(source)
    zone = zone_mask(max_z.shape, origin, cell, network, [h['outline'] for h in houses] + list(others_outlines))
    feet = []
    for tid, (o, rows) in tile_rows.items():
        for x, y, z, sx, sy, sz, yaw in rows: feet.append([x + o[0], -(z + o[2]), y + o[1] - .71 * sy / .30])
    grid = ground_grid(source, max_z.shape)
    ground = None if grid is not None else ground_model(network, houses, feet)
    # the survey's places, moved onto the plans as the houses' returns are (register.py)
    from register import shift_at
    tops = treetops(max_z, count, origin, cell, zone, ground, grid)
    moved = np.asarray([shift_at(e, n) for e, n in tops[:, :2]], float).reshape(-1, 2)
    tops[:, :2] -= moved
    water = [p['rings'] for p in json.load(open(site / 'data/derived/town/navigation-water.json'))['polygons']]
    tops, found = clear_of(tops, network, [h['outline'] for h in houses] + list(others_outlines) + list(buildings), Cover(site), water)
    ti = np.floor(tops[:, 0] / 250).astype(int); tj = np.floor(tops[:, 1] / 250).astype(int)
    inzone = lambda e, n: zone[min(zone.shape[0] - 1, max(0, int((n - origin[1]) / cell))), min(zone.shape[1] - 1, max(0, int((e - origin[0]) / cell)))]
    out, combined = {}, {}
    for tid, (o, rows) in tile_rows.items():
        x0, y0 = map(int, tid.split('_'))
        mine = tops[(ti == x0) & (tj == y0)]; crowns = found[(ti == x0) & (tj == y0)]
        keep = [not inzone(x + o[0], -(z + o[2])) for x, y, z, *_ in rows]
        if not len(mine) and all(keep): continue
        bits = bytearray((len(rows) + 7) // 8)
        for i, k in enumerate(keep):
            if k: bits[i >> 3] |= 1 << (i & 7)
        q = np.round(np.c_[(mine[:, 0] - o[0]) * 10, (-mine[:, 1] - o[2]) * 10, mine[:, 2] * 10, mine[:, 3] * 10]).astype('<i2')
        out[tid] = {'n': len(rows), 'k': base64.b64encode(bytes(bits)).decode(), 't': base64.b64encode(q.tobytes()).decode()}
        yaw = lambda e, n: (math.sin(e * 12.9898 + n * 78.233) * 43758.5453) % 1 * 2 * math.pi
        # the evergreen read samples the aerial where the survey found each crown
        seen = crowns[:, :2] + np.asarray([shift_at(e, n) for e, n in crowns[:, :2]], float).reshape(-1, 2)
        combined[tid] = [r for r, k in zip(rows, keep) if k] + [[(e - o[0]), 0.0, (-n - o[2]), r, .30 * h, r, yaw(e, n)] for (e, n), (_, _, h, r) in zip(seen, mine)]
    return out, combined, {'trees': int(len(tops)), 'zoneCells': int(zone.sum())}
