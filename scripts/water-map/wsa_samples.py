"""USGS aggregated public-supply water service areas (Buchwald and others 2022, doi:10.5066/P9I22Z24): for each
service area, its attributes and up to 64 points spread evenly over its polygon (EPSG:5070 metres), so the counties it
covers can be found from the county raster without shipping the 316 MB of boundaries. Each polygon is rasterized on a
grid of 256 cells along the longer side of its bounding box (holes and parts by the even-odd rule), and the points are
taken evenly from the filled cells in raster order, so each stands for about the same area. Run on the downloading
computer (Python 3, numpy and Pillow):

  python3 wsa_samples.py ~/Downloads/WSA_v1 wsa_samples.npz
"""
import struct, sys, json, numpy as np
from PIL import Image, ImageDraw
D = sys.argv[1]; OUT = sys.argv[2]
shx = open(f'{D}/WSA_v1.shx', 'rb').read()
n = (len(shx) - 100) // 8
offs = [struct.unpack('>II', shx[100 + 8 * i: 108 + 8 * i]) for i in range(n)]
dbf = open(f'{D}/WSA_v1.dbf', 'rb').read()
nrec, hlen, rlen = struct.unpack('<IHH', dbf[4:12])
fields = []; o = 32
while dbf[o] != 0x0D:
    fields.append((dbf[o:o + 11].split(b'\x00')[0].decode(), dbf[o + 16])); o += 32
def rec(i):
    b = dbf[hlen + i * rlen + 1: hlen + (i + 1) * rlen]; out = {}; p = 0
    for nm, ln in fields: out[nm] = b[p:p + ln].decode('utf-8', 'replace').strip(); p += ln
    return out
shp = open(f'{D}/WSA_v1.shp', 'rb')
G = 256; K = 64
ids, names, states, pop, tpop, sqkm, cx, cy, start, sx, sy = [], [], [], [], [], [], [], [], [], [], []
for i in range(n):
    off, ln = offs[i]
    shp.seek(off * 2 + 8); b = shp.read(ln * 2)
    st, = struct.unpack('<i', b[:4])
    a = rec(i)
    ids.append(a['WSA_AGIDF']); names.append(a['WSA_NAME']); states.append(a['STATE_NAME'])
    pop.append(int(a['TPOPSRV'] or 0)); tpop.append(int(a['TPOLYPOP'] or 0)); sqkm.append(float(a['WSA_SQKM'] or 0))
    start.append(len(sx))
    if st == 0: cx.append(np.nan); cy.append(np.nan); continue
    x0, y0, x1, y1 = struct.unpack('<4d', b[4:36]); npart, npt = struct.unpack('<ii', b[36:44])
    parts = list(struct.unpack('<%di' % npart, b[44:44 + 4 * npart])) + [npt]
    pts = np.frombuffer(b, '<f8', 2 * npt, 44 + 4 * npart).reshape(npt, 2)
    w, h = max(x1 - x0, 1.0), max(y1 - y0, 1.0)
    sc = G / max(w, h); W_, H_ = max(1, int(np.ceil(w * sc))), max(1, int(np.ceil(h * sc)))
    m = np.zeros((H_, W_), bool)
    for k in range(npart):
        r = pts[parts[k]:parts[k + 1]]
        if len(r) < 3: continue
        im = Image.new('1', (W_, H_), 0)
        ImageDraw.Draw(im).polygon([((px - x0) * sc, (y1 - py) * sc) for px, py in r], fill=1, outline=1)
        m ^= np.asarray(im, bool)
    jj, ii = np.nonzero(m)
    if len(jj) == 0:
        jj = np.array([H_ // 2]); ii = np.array([W_ // 2])
    sel = np.linspace(0, len(jj) - 1, min(K, len(jj))).round().astype(int)
    px = x0 + (ii[sel] + 0.5) / sc; py = y1 - (jj[sel] + 0.5) / sc
    sx.extend(px.tolist()); sy.extend(py.tolist())
    cx.append(float(np.mean(x0 + (ii + 0.5) / sc))); cy.append(float(np.mean(y1 - (jj + 0.5) / sc)))
    if i % 3000 == 0: print(i, n, flush=True)
start.append(len(sx))
np.savez_compressed(OUT, pop=np.array(pop, np.int64), tpop=np.array(tpop, np.int64), sqkm=np.array(sqkm), cx=np.array(cx), cy=np.array(cy),
                    start=np.array(start, np.int64), sx=np.array(sx, np.float32), sy=np.array(sy, np.float32))
json.dump({'id': ids, 'name': names, 'state': states}, open(OUT.replace('.npz', '_names.json'), 'w'), separators=(',', ':'))
print('done', n, 'samples', len(sx))
