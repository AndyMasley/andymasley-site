"""Outlines of the public water systems' service areas, for the map (from wsa_outlines_p<k>.npz, made by wsa_outlines.py
on the downloading computer from WSA_v1.shp, Buchwald and others 2022, in four runs of records).

Each point goes from EPSG:5070 to the lower-48 slab and is stored as the texel position times ten (about 79 m steps),
two unsigned 16-bit numbers. Rings shorter than three distinct points after that are dropped.

Output (proc/net): wsa_outlines.bin
  'WSO2', u32 nsys (in WSA_v1 record order, the order of wsa_samples.py), u32 nring, u32 npts,
  u16 rings[nsys] (each system's number of rings), u16 pts[nring] (each ring's number of points),
  u16 u0[nring], u16 v0[nring] (each ring's first point), then each point's step from the point before it (0 for a
  ring's first), int16, as byte planes: u8 du_low[npts], u8 dv_low[npts], u8 du_high[npts], u8 dv_high[npts]
Also adds `rec` to water_systems.json: each listed system's record index, to find its outline.
"""
import json, os, struct, sys, numpy as np
from pyproj import Transformer
sys.path.insert(0, os.path.dirname(__file__))
from netlib import NET, RAW, to_scene, Terrain

SRC = f'{RAW}/wsa'
Q = 10.0

def load():
    """the pieces wsa_outlines.py wrote (wsa_outlines_p<k>.npz, each a run of records), joined in record order"""
    parts = sorted((np.load(f'{SRC}/{f}') for f in os.listdir(SRC) if f.startswith('wsa_outlines_p') and f.endswith('.npz')), key=lambda z: int(z['first']))
    start, ring, xs, ys = [0], [0], [], []
    nxt = 0
    for z in parts:
        assert int(z['first']) == nxt, ('pieces do not join', int(z['first']), nxt)
        st, rg = z['start'], z['ring']
        start.extend((st[1:] + start[-1]).tolist())
        ring.extend((rg[1:] + ring[-1]).tolist())
        xs.append(z['x']); ys.append(z['y'])
        nxt += len(st) - 1
    assert nxt == int(parts[0]['n']), ('records missing', nxt, int(parts[0]['n']))
    return np.array(start), np.array(ring), np.concatenate(xs).astype(np.float64) * 10.0, np.concatenate(ys).astype(np.float64) * 10.0

def main():
    start, ring, X, Y = load()
    lon, lat = Transformer.from_crs(5070, 4269, always_xy=True).transform(X, Y)
    sx, sz = to_scene('conus', lon, lat)
    t = Terrain('conus')
    u = np.clip(np.round((sx - t.x0) * t.ppu * Q), 0, 65535).astype(np.uint16)
    v = np.clip(np.round((sz - t.z0) * t.ppu * Q), 0, 65535).astype(np.uint16)
    nsys = len(start) - 1
    sys_ring = [0]; ring_pt = [0]; U = []; V = []
    for s in range(nsys):
        for r in range(start[s], start[s + 1]):
            a, b = ring[r], ring[r + 1]
            uu, vv = u[a:b], v[a:b]
            keep = np.ones(len(uu), bool); keep[1:] = (uu[1:] != uu[:-1]) | (vv[1:] != vv[:-1])
            uu, vv = uu[keep], vv[keep]
            if len(uu) < 4: continue
            U.append(uu); V.append(vv); ring_pt.append(ring_pt[-1] + len(uu))
        sys_ring.append(len(ring_pt) - 1)
    U = np.concatenate(U).astype(np.int32); V = np.concatenate(V).astype(np.int32)
    rp = np.array(ring_pt, np.int64); first = rp[:-1]
    # each ring's first point as it is, the rest as steps from the point before, in byte planes (low bytes, then high):
    # nearly every step is under 128, so the high bytes are almost all 0 or 255 and the file packs to a third
    du = np.diff(U, prepend=0); dv = np.diff(V, prepend=0); du[first] = 0; dv[first] = 0
    lu = du.astype('<i2').view(np.uint8).reshape(-1, 2); lv = dv.astype('<i2').view(np.uint8).reshape(-1, 2)
    buf = struct.pack('<4sIII', b'WSO2', nsys, len(ring_pt) - 1, len(U))
    buf += np.diff(np.array(sys_ring)).astype('<u2').tobytes() + np.diff(rp).astype('<u2').tobytes()
    buf += U[first].astype('<u2').tobytes() + V[first].astype('<u2').tobytes()
    buf += lu[:, 0].tobytes() + lv[:, 0].tobytes() + lu[:, 1].tobytes() + lv[:, 1].tobytes()
    open(f'{NET}/wsa_outlines.bin', 'wb').write(buf)
    print('systems', nsys, 'rings', len(ring_pt) - 1, 'points', len(U), 'bytes', len(buf), 'largest ring', int(np.diff(rp).max()), 'most rings', int(np.diff(np.array(sys_ring)).max()))
    # each listed system's record index (bake_wsa.py keeps them in sys order)
    ws = json.load(open(f'{NET}/water_systems.json'))
    names = json.load(open(f'{RAW}/wsa/wsa_samples_names.json'))
    rec_of = {pid: k for k, pid in enumerate(names['id'])}
    ws['rec'] = [rec_of[r[1]] for r in ws['sys']]
    json.dump(ws, open(f'{NET}/water_systems.json', 'w'), separators=(',', ':'), ensure_ascii=False)
    print('listed systems with an outline', sum(1 for r in ws['rec'] if sys_ring[r + 1] > sys_ring[r]), 'of', len(ws['rec']))

if __name__ == '__main__':
    main()
