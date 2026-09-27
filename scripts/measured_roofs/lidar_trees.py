"""Trees where the survey found them, along the streets and around the houses.

The scenery's trees stand one to a 12 m block wherever the 2021 LiDAR's
vegetation returns cover a fifth of it: right for woods, but a yard's maple
or a street's row of oaks lands wherever its block's highest cell was. Near
the streets and houses (within 25 m of a road centreline or of a
building), each tree is instead found in the survey itself: the highest
vegetation return in each 2 m cell, less the ground there, is a canopy height
model; its peaks (lightly smoothed, at least 4 m apart and 4 m high) are the
treetops, each crown the canopy nearest its top; a trunk over a road steps off
its edge, and one inside a building goes. The block trees in that zone give
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


def clear_of(tops, network, outlines):
    """Trunks off the pavement and out of the buildings: a treetop over a road
    (within its half-width and 0.8 m) stands its trunk just off the edge when
    that is within 3 m, else goes; one inside a building's outline goes."""
    import shapely
    from shapely.geometry import LineString, Polygon
    lines, half = [], []
    for e in network['edges']:
        if len(e['points']) >= 2:
            lines.append(LineString([q[:2] for q in e['points']])); half.append(float(e.get('width_m') or 7) / 2)
    tree = shapely.STRtree(lines)
    rings = [Polygon(r).buffer(.5) for r in outlines if len(r) >= 3]
    bodies = shapely.STRtree(rings)
    keep = np.ones(len(tops), bool); out = tops.copy()
    for k, (e, n, h, r) in enumerate(tops):
        p = shapely.Point(e, n)
        if len(bodies.query(p, predicate='intersects')): keep[k] = False; continue
        i = tree.nearest(p)
        if i is None: continue
        q = lines[i].interpolate(lines[i].project(p)); d = p.distance(q); need = half[i] + .8
        if d >= need: continue
        if need - d > 3 or d < 1e-6: keep[k] = False; continue
        out[k, 0] = q.x + (e - q.x) / d * need; out[k, 1] = q.y + (n - q.y) / d * need
    return out[keep]


def lidar_tiles(site, source, houses, others_outlines, tile_rows):
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
    tops = clear_of(treetops(max_z, count, origin, cell, zone, ground, grid), network, [h['outline'] for h in houses] + list(others_outlines))
    ti = np.floor(tops[:, 0] / 250).astype(int); tj = np.floor(tops[:, 1] / 250).astype(int)
    inzone = lambda e, n: zone[min(zone.shape[0] - 1, max(0, int((n - origin[1]) / cell))), min(zone.shape[1] - 1, max(0, int((e - origin[0]) / cell)))]
    out, combined = {}, {}
    for tid, (o, rows) in tile_rows.items():
        x0, y0 = map(int, tid.split('_'))
        mine = tops[(ti == x0) & (tj == y0)]
        keep = [not inzone(x + o[0], -(z + o[2])) for x, y, z, *_ in rows]
        if not len(mine) and all(keep): continue
        bits = bytearray((len(rows) + 7) // 8)
        for i, k in enumerate(keep):
            if k: bits[i >> 3] |= 1 << (i & 7)
        q = np.round(np.c_[(mine[:, 0] - o[0]) * 10, (-mine[:, 1] - o[2]) * 10, mine[:, 2] * 10, mine[:, 3] * 10]).astype('<i2')
        out[tid] = {'n': len(rows), 'k': base64.b64encode(bytes(bits)).decode(), 't': base64.b64encode(q.tobytes()).decode()}
        yaw = lambda e, n: (math.sin(e * 12.9898 + n * 78.233) * 43758.5453) % 1 * 2 * math.pi
        combined[tid] = [r for r, k in zip(rows, keep) if k] + [[(e - o[0]), 0.0, (-n - o[2]), r, .30 * h, r, yaw(e, n)] for e, n, h, r in mine]
    return out, combined, {'trees': int(len(tops)), 'zoneCells': int(zone.sum())}
