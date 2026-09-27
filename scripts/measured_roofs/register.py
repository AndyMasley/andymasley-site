"""Registration of the LiDAR to the building plans.

The plans (the MassGIS building footprints, and with them every house's
walls, the land cover's building gaps, the doors and windows read from each
street photograph) stand one to three metres from where the 2021 LiDAR finds
the same roofs, most often to their north-north-west, by an amount that drifts
smoothly across the town: the footprints were traced from aerial photographs.
A roof measured only from the returns inside its plan loses a strip along one
side, where its eave, extrapolated, falls too low, and finds nothing of its
overhang on the other.

For every house this finds the shift that best lays its plan over its roof
returns: the intersection over union of the plan and the 0.25 m cells holding
a return 1.5 m above its foot, searched 4 m each way. The local shift at any
place is the median of the houses' shifts within 200 m (the nearest twelve
where fewer stand there). A house takes its own shift where that agrees with
the local shift within 0.6 m, else the local shift; every other building and
every survey tree takes the local shift at its place. The measurements then
move the returns by the shift, onto the plans.

Writes registration.json: per house its shift [east, north] in metres and
its plan's centre, from which `shift_at` gives the local shift anywhere.
Usage: WEBSTER_SOURCE=... python3 scripts/measured_roofs/register.py
"""
import json, sys
from pathlib import Path

import numpy as np
from matplotlib.path import Path as MPath
from scipy.spatial import cKDTree

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
CELL, REACH, NEAR, AGREE = 0.25, 4.0, 200.0, 0.6


def best_shift(outline, base, lidar):
    """The shift [east, north] laying `outline` best over the roof returns, and its intersection over union."""
    x, y, z, tree = lidar
    ol = np.asarray(outline, float); c = ol.mean(0)
    idx = np.asarray(tree.query_ball_point(c, np.max(np.hypot(*(ol - c).T)) + REACH + 1), int)
    if len(idx) < 30: return None
    P = np.c_[x[idx], y[idx]][z[idx] > base + 1.5]
    if len(P) < 30: return None
    pad = REACH + 1.5
    lo = np.floor((ol.min(0) - pad) / CELL) * CELL; n = np.ceil((ol.max(0) + pad - lo) / CELL).astype(int)
    # the returns' cells (each return covers its 0.5 m survey cell)
    occ = np.zeros((n[1], n[0]), bool)
    for dx in (-CELL / 2, CELL / 2):
        for dy in (-CELL / 2, CELL / 2):
            ij = np.floor((P + [dx, dy] - lo) / CELL).astype(int)
            ok = (ij >= 0).all(1) & (ij[:, 0] < n[0]) & (ij[:, 1] < n[1])
            occ[ij[ok, 1], ij[ok, 0]] = True
    gy, gx = np.mgrid[0:n[1], 0:n[0]]
    plan = MPath(ol).contains_points(np.c_[lo[0] + (gx.ravel() + .5) * CELL, lo[1] + (gy.ravel() + .5) * CELL]).reshape(n[1], n[0])
    k = int(round(REACH / CELL)); area = plan.sum()
    if area < 40: return None
    best = (-1, 0, 0, 0.0)
    core = plan[k:n[1] - k, k:n[0] - k]
    for sy in range(-k, k + 1):
        for sx in range(-k, k + 1):
            window = occ[k - sy:n[1] - k - sy, k - sx:n[0] - k - sx]
            inter = np.count_nonzero(core & window)
            # the most of the plan over returns; of equals, the smaller shift
            if inter > best[0] or inter == best[0] and sx * sx + sy * sy < best[1] ** 2 + best[2] ** 2:
                best = (inter, sx, sy, inter / (area + np.count_nonzero(window) - inter))
    # returns found at p - s lie over the plan at p: the plan shifted by -s lies over its returns
    return [-best[1] * CELL, -best[2] * CELL], best[3]


def main():
    import measure as M
    lidar = M.lidar()
    houses = M.houses()
    shifts, centres, quality = {}, {}, {}
    for h in houses:
        ol = np.asarray(h['outline'], float); centres[h['id']] = ol.mean(0)
        found = best_shift(h['outline'], h['base'], lidar)
        if found: shifts[h['id']], quality[h['id']] = found
    ids = sorted(shifts); S = np.asarray([shifts[i] for i in ids]); C = np.asarray([centres[i] for i in ids])
    tree = cKDTree(C)
    def local(p):
        near = tree.query_ball_point(p, NEAR)
        if len(near) < 12: near = tree.query(p, 12)[1]
        return np.median(S[near], 0)
    out = {}
    for h in houses:
        c = centres[h['id']]; here = local(c); own = shifts.get(h['id'])
        s = own if own is not None and np.hypot(*(np.asarray(own) - here)) <= AGREE else here
        out[h['id']] = [round(float(s[0]), 2), round(float(s[1]), 2), round(float(c[0]), 1), round(float(c[1]), 1)]
    (HERE / 'registration.json').write_text(json.dumps({'version': 1, 'near': NEAR, 'houses': out}, separators=(',', ':'), sort_keys=True) + '\n')
    mag = np.hypot(*np.asarray([v[:2] for v in out.values()]).T)
    print(f'registration: {len(out)} houses, {len(shifts)} with their own shift; median shift {np.median(mag):.2f} m, 90% under {np.quantile(mag, .9):.2f} m')


_field = None
def shift_at(east, north):
    """The local shift [east, north] at a place: the median of the houses' shifts within 200 m (the nearest twelve where fewer)."""
    global _field
    if _field is None:
        reg = json.load(open(HERE / 'registration.json'))['houses']
        S = np.asarray([v[:2] for v in reg.values()], float); C = np.asarray([v[2:] for v in reg.values()], float)
        _field = (S, cKDTree(C))
    S, tree = _field
    near = tree.query_ball_point([east, north], NEAR)
    if len(near) < 12: near = tree.query([east, north], 12)[1]
    return np.median(S[near], 0)


def house_shift(hid, east, north):
    """A house's own registered shift, else the local shift at its place."""
    global _houses
    try: _houses
    except NameError: _houses = json.load(open(HERE / 'registration.json'))['houses']
    v = _houses.get(hid)
    return np.asarray(v[:2], float) if v else shift_at(east, north)


if __name__ == '__main__':
    main()
