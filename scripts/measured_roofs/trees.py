"""Which of the scenery's trees are evergreens, from the 2025 leaf-off aerial.

The scenery's tree anchors come from the 2021 LiDAR's vegetation returns
(one per 12 m block, with its height); whether each is drawn as a conifer or a
broadleaf was a random draw by habitat. The MassGIS 2025 aerial was flown
leaf-off: deciduous crowns show as grey-brown twigs and ground, evergreen
crowns (white pine, hemlock, spruce, arborvitae) as dark green. Each anchor's
crown is sampled on a disc about a fifth of its height across, shifted by the
building lean the tile's roof edges show in the mosaic (scaled to the crown's
height), and is an evergreen when most of the disc is dark green.

Per tile the flags ride in the measured packet as {"n": rows, "c": base64
bits in row order}; the game uses them in place of the habitat draw.
"""
import base64, glob, json, math
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent


def crown_disc(e, n, r):
    th = np.linspace(0, 2 * np.pi, 16, endpoint=False)
    return (np.concatenate([[e], e + r * .45 * np.cos(th[::2]), e + r * .85 * np.cos(th)]),
            np.concatenate([[n], n + r * .45 * np.sin(th[::2]), n + r * .85 * np.sin(th)]))


def evergreen(rgb):
    """Dark green: green above red and blue, neither sky-lit shadow nor lawn."""
    r, g, b = rgb[:, 0].astype(float), rgb[:, 1].astype(float), rgb[:, 2].astype(float)
    v = rgb.max(1)
    return (g > r + 4) & (g > b) & (v < 140) & (v > 22)


def scenery_rows(site):
    """{tile: (origin, rows)} of the scenery's tree rows, for every tile with trees."""
    manifest = Path(sorted(glob.glob(str(site / 'public/town-assets/*/manifest.json')))[-1])
    out = {}
    for tile in json.load(open(manifest))['tiles']:
        if not tile.get('treeFile'): continue
        data = json.load(open(manifest.parent / tile['treeFile']['url']))
        rows = data if isinstance(data, list) else data['rows']
        if rows: out[tile['id']] = (tile['origin'], rows)
    return out


def tree_families(site, aerial, tile_shift, tiles=None):
    """{tile: {'n': rows, 'c': base64 bitset of evergreens}} for every tile with
    trees: the scenery's rows, or those given ({tile: (origin, rows)})."""
    shifts, out = {}, {}
    for tid, (o, rows) in (tiles or scenery_rows(site)).items():
        bits = bytearray((len(rows) + 7) // 8)
        for i, (x, y, z, sx, sy, sz, yaw) in enumerate(rows):
            e, n, height = x + o[0], -(z + o[2]), sy / 0.30
            k = (math.floor(e / 250), math.floor(n / 250))
            if k not in shifts: shifts[k] = tile_shift(k[0] * 250.0, k[1] * 250.0)
            dx, dy, strength, _ = shifts[k]
            lean = min(4.0, 0.7 * height / 6.0) if strength > 0.02 else 0.0
            xs, ys = crown_disc(e + dx * lean, n + dy * lean, max(1.2, min(4.0, 0.22 * height)))
            if evergreen(aerial(xs, ys)).mean() >= 0.45: bits[i >> 3] |= 1 << (i & 7)
        out[tid] = {'n': len(rows), 'c': base64.b64encode(bytes(bits)).decode()}
    return out
