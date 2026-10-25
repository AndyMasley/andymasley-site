"""Water infrastructure mapped in OpenStreetMap (Overpass API query, 2026-10-25): water towers, water treatment works,
wastewater treatment plants, golf courses and data centers, as scene points with their county.

Outputs (proc/net):
  osm_points.bin   'OSM1', u32 n, then f32 x[n], f32 z[n], u8 kind[n], u8 slab[n], i16 county[n] (sorted by kind)
  osm_points.json  {kinds, counts, names: [name or "", ...], ops: [operator or "", ...]}
"""
import csv, json, struct, sys, os, numpy as np
sys.path.insert(0, os.path.dirname(__file__))
from netlib import to_scene, in_rect, NET, RAW, Terrain
from proj import SLABS

KINDS = ['water_tower', 'water_works', 'wastewater_plant', 'golf_course', 'data_center']
SL = {'conus': 0, 'ak': 1, 'hi': 2, 'pr': 3}

def slab_guess(lon, lat):
    if lat > 50 or lon < -165 or lon > 170: return 'ak'
    if lat < 23.5 and lon < -150: return 'hi'
    if lat < 19 and -68.5 < lon < -64: return 'pr'
    return 'conus'

def main():
    r = csv.reader(open(f'{RAW}/osm/osm_water_infra.tsv', encoding='utf-8'), delimiter='\t')
    h = next(r)
    T = {s: Terrain(s) for s in SL}
    CM = {s: np.load(f'{NET}/{s}_county.npy') for s in SL}
    pts = []
    seen = set()
    for row in r:
        if len(row) < 10: continue
        typ, oid, lat, lon, mm, le, tc, bd, name, op = row[:10]
        try: lat, lon = float(lat), float(lon)
        except ValueError: continue
        if tc == 'data_center' or bd == 'data_center': kind = 'data_center'
        elif le == 'golf_course': kind = 'golf_course'
        elif mm in KINDS: kind = mm
        else: continue
        key = (typ, oid, kind)
        if key in seen: continue
        seen.add(key)
        slab = slab_guess(lon, lat)
        x, z = to_scene(slab, lon, lat)
        S = SLABS[slab]
        if not in_rect(slab, x - S['offset'][0], z - S['offset'][1]): continue
        t = T[slab]
        fx, fy = t.px(x, z)
        i, j = int(round(float(fx))), int(round(float(fy)))
        if not (0 <= i < t.W and 0 <= j < t.H): continue
        cm = CM[slab]
        c = int(cm[j, i]) - 1
        if c < 0:
            # just off a county edge (coast, lake shore): nearest county pixel within 3 texels
            win = cm[max(0, j - 3):j + 4, max(0, i - 3):i + 4].astype(int) - 1
            ys, xs = np.nonzero(win >= 0)
            if len(ys) == 0: continue
            k = np.argmin((ys - 3) ** 2 + (xs - 3) ** 2); c = int(win[ys[k], xs[k]])
        pts.append((KINDS.index(kind), float(x), float(z), SL[slab], c, name.strip(), op.strip()))
    # one golf course mapped twice (a node and an area) would double up: drop same-name courses within ~300 m
    pts.sort(key=lambda p: (p[0], p[4], p[5]))
    out = []; last = {}
    for p in pts:
        k = (p[0], p[4], p[5].lower())
        if p[5] and k in last and abs(last[k][1] - p[1]) < 0.06 and abs(last[k][2] - p[2]) < 0.06: continue
        last[k] = p; out.append(p)
    n = len(out)
    buf = struct.pack('<4sI', b'OSM1', n)
    buf += np.array([p[1] for p in out], '<f4').tobytes() + np.array([p[2] for p in out], '<f4').tobytes()
    buf += np.array([p[0] for p in out], 'u1').tobytes() + np.array([p[3] for p in out], 'u1').tobytes()
    buf += np.array([p[4] for p in out], '<i2').tobytes()
    open(f'{NET}/osm_points.bin', 'wb').write(buf)
    counts = [sum(1 for p in out if p[0] == k) for k in range(len(KINDS))]
    json.dump(dict(kinds=KINDS, counts=counts, names=[p[5] for p in out], ops=[p[6] for p in out]), open(f'{NET}/osm_points.json', 'w'), separators=(',', ':'))
    print('osm points', n, dict(zip(KINDS, counts)), os.path.getsize(f'{NET}/osm_points.json') // 1024, 'KB names')

if __name__ == '__main__':
    main()
