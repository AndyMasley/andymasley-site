"""Outlines of the USGS public-supply water service areas (Buchwald and others 2022, doi:10.5066/P9I22Z24), simplified
for drawing: every ring of every polygon in WSA_v1.shp (EPSG:5070 metres), thinned by the Douglas-Peucker method to
within TOL metres of the original line, rings smaller than a TOL-wide square dropped. Run on the downloading computer
(Python 3 and numpy):

  python3 wsa_outlines.py ~/Downloads/WSA_v1 wsa_outlines.npz [TOL] [first,last+1]

Output: start[n + 1] (each service area's first ring, in record order, the order of wsa_samples.py), ring[r + 1] (each
ring's first point), x[p], y[p] (int32, tens of metres), area_m2[r] (signed: rings are clockwise outside, counter-
clockwise for holes, as the shapefile stores them).
"""
import struct, sys, numpy as np

def dp(P, tol):
    """indices of the points Douglas-Peucker keeps (first and last always)"""
    n = len(P)
    if n <= 2: return np.arange(n)
    keep = np.zeros(n, bool); keep[0] = keep[-1] = True
    stack = [(0, n - 1)]
    while stack:
        i0, i1 = stack.pop()
        if i1 - i0 < 2: continue
        a, b = P[i0], P[i1]
        seg = P[i0 + 1:i1]
        d = b - a; L = np.hypot(d[0], d[1])
        if L < 1e-9: dist = np.hypot(seg[:, 0] - a[0], seg[:, 1] - a[1])
        else: dist = np.abs((seg[:, 0] - a[0]) * d[1] - (seg[:, 1] - a[1]) * d[0]) / L
        k = int(np.argmax(dist))
        if dist[k] > tol:
            m = i0 + 1 + k; keep[m] = True
            stack.append((i0, m)); stack.append((m, i1))
    return np.flatnonzero(keep)

def simplify_ring(r, tol):
    """a closed ring (first point repeated last), thinned; split at its farthest point so both halves have ends"""
    if len(r) < 4: return None
    far = int(np.argmax(np.hypot(r[:, 0] - r[0, 0], r[:, 1] - r[0, 1])))
    if far == 0: return None
    a = r[:far + 1][dp(r[:far + 1], tol)]
    b = r[far:][dp(r[far:], tol)]
    out = np.vstack([a[:-1], b])     # ends where it began
    return out if len(out) >= 4 else None

def main(D, OUT, tol, rng=None):
    shx = open(f'{D}/WSA_v1.shx', 'rb').read()
    n = (len(shx) - 100) // 8
    offs = [struct.unpack('>II', shx[100 + 8 * i: 108 + 8 * i]) for i in range(n)]
    shp = open(f'{D}/WSA_v1.shp', 'rb')
    start, ring, xs, ys, area = [0], [0], [], [], []
    npts_in = 0
    i0, i1 = rng if rng else (0, n)
    for i in range(i0, min(i1, n)):
        off, ln = offs[i]
        shp.seek(off * 2 + 8); b = shp.read(ln * 2)
        st, = struct.unpack('<i', b[:4])
        if st != 0:
            npart, npt = struct.unpack('<ii', b[36:44])
            parts = list(struct.unpack('<%di' % npart, b[44:44 + 4 * npart])) + [npt]
            pts = np.frombuffer(b, '<f8', 2 * npt, 44 + 4 * npart).reshape(npt, 2)
            npts_in += npt
            for k in range(npart):
                r = pts[parts[k]:parts[k + 1]]
                s = simplify_ring(r, tol)
                if s is None: continue
                x, y = s[:, 0], s[:, 1]
                a = 0.5 * float(np.sum(x[:-1] * y[1:] - x[1:] * y[:-1]))
                if abs(a) < tol * tol: continue
                q = np.round(s / 10.0).astype(np.int64)
                xs.append(q[:, 0]); ys.append(q[:, 1]); area.append(a)
                ring.append(ring[-1] + len(s))
        start.append(len(ring) - 1)
        if i % 2000 == 0: print(i, n, 'points kept', ring[-1], 'of', npts_in, flush=True)
    x = np.concatenate(xs).astype(np.int32); y = np.concatenate(ys).astype(np.int32)
    np.savez_compressed(OUT, start=np.array(start, np.int32), ring=np.array(ring, np.int64), x=x, y=y, area_m2=np.array(area), first=i0, n=n)
    print('done: service areas', i0, 'to', min(i1, n), 'of', n, 'rings', len(ring) - 1, 'points', len(x), 'of', npts_in, 'tolerance', tol, 'm')

if __name__ == '__main__':
    # (a fourth argument a,b does only records a to b-1, for running the job in pieces; bake_wsa_outlines.py joins them)
    main(sys.argv[1], sys.argv[2], float(sys.argv[3]) if len(sys.argv) > 3 else 40.0,
         tuple(int(v) for v in sys.argv[4].split(',')) if len(sys.argv) > 4 else None)
