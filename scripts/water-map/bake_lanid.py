"""LANID 2015 irrigated land (Xie, Gibbs and Lark 2021, Earth System Science Data 13: 5689-5710; data version 3, Zenodo
10.5281/zenodo.5548555) on the lower-48 slab.

LANID maps every 30 m pixel of the lower 48 as irrigated (1) or not (0) for each year, in USGS Albers (EPSG:5070). The
2015 map (lanid2015.tif, 153,710 x 95,127 pixels) was first reduced to counts of irrigated pixels in 8 x 8 blocks
(240 m cells, 0 to 64) on the computer it was downloaded to, since the raster is 15 billion pixels; that file is the
input here (lanid2015_irr240m.npz: counts, x0, y0 = the raster's upper-left corner, cell = 240).

Outputs (proc/lanid):
  conus_irr3.npy    irrigated fraction of each close-up pixel (3x the colour texture, ~262 m), uint8 0..255
  conus_irr.npy     irrigated fraction at colour-texture resolution (~786 m), float32 0..1
  county_irr.json   irrigated km2 per county (USGS county order), summed from the 240 m counts
"""
import json, os, sys, time, numpy as np
from pyproj import Transformer
sys.path.insert(0, os.path.dirname(__file__))
from proj import LOWER48

SRC = '/home/claude/w2/raw/lanid/lanid2015_irr240m.npz'
TER = '/home/claude/w2/proc/terrain'
NET = '/home/claude/w2/proc/net'
OUT = '/home/claude/w2/proc/lanid'
os.makedirs(OUT, exist_ok=True)
F3 = 3

def main():
    t0 = time.time()
    z = np.load(SRC)
    C = z['counts']; x0 = float(z['x0']); y0 = float(z['y0']); cell = float(z['cell'])
    nb = float(z['block']) ** 2
    frac = C.astype(np.float32) / nb
    HR, WR = frac.shape
    print('LANID irrigated km2 (all cells):', round(float(C.sum(dtype=np.int64)) * 900 / 1e6))
    m = json.load(open(f'{TER}/conus_meta.json'))
    W, H = m['tex']; ppu = m['ppu']; X0, Z0 = m['rect'][0], m['rect'][1]
    W3, H3 = W * F3, H * F3
    to_alb = Transformer.from_crs(4269, 5070, always_xy=True)
    out3 = np.zeros((H3, W3), np.uint8)
    # inverse mapping with 2 x 2 supersampling and bilinear interpolation of the 240 m fraction
    subs = [(-0.25, -0.25), (0.25, -0.25), (-0.25, 0.25), (0.25, 0.25)]
    xs = X0 + (np.arange(W3) + 0.5) / (ppu * F3)
    BAND = 96
    for j0 in range(0, H3, BAND):
        j1 = min(H3, j0 + BAND)
        acc = np.zeros((j1 - j0, W3), np.float32)
        for dx, dz in subs:
            X = xs + dx / (ppu * F3)
            Zs = Z0 + (np.arange(j0, j1) + 0.5 + dz) / (ppu * F3)
            XX, ZZ = np.meshgrid(X, Zs)
            lon, lat = LOWER48.inverse(XX, ZZ)
            ax, ay = to_alb.transform(lon, lat)
            fc = (ax - x0) / cell - 0.5; fr = (y0 - ay) / cell - 0.5
            c0 = np.floor(fc).astype(np.int64); r0 = np.floor(fr).astype(np.int64)
            tc = (fc - c0).astype(np.float32); tr = (fr - r0).astype(np.float32)
            ok = (c0 >= 0) & (r0 >= 0) & (c0 < WR - 1) & (r0 < HR - 1)
            v = np.zeros(XX.shape, np.float32)
            c0o, r0o, tco, tro = c0[ok], r0[ok], tc[ok], tr[ok]
            v[ok] = (frac[r0o, c0o] * (1 - tco) * (1 - tro) + frac[r0o, c0o + 1] * tco * (1 - tro)
                     + frac[r0o + 1, c0o] * (1 - tco) * tro + frac[r0o + 1, c0o + 1] * tco * tro)
            acc += v
        out3[j0:j1] = np.clip(np.round(acc / len(subs) * 255), 0, 255).astype(np.uint8)
        if j0 % (BAND * 20) == 0: print('  rows', j0, 'of', H3, round(time.time() - t0), 's', flush=True)
    np.save(f'{OUT}/conus_irr3.npy', out3)
    tex = out3[:H * F3, :W * F3].reshape(H, F3, W, F3).astype(np.float32).mean(axis=(1, 3)) / 255.0
    np.save(f'{OUT}/conus_irr.npy', tex.astype(np.float32))
    px3_km2 = (m['km_per_unit'] / (ppu * F3)) ** 2
    print('close-up grid irrigated km2 (scene area):', round(float(out3.sum(dtype=np.int64)) / 255 * px3_km2))
    # irrigated area by county: each 240 m cell's count, at the county under the cell's centre
    WU = json.load(open('/home/claude/build/wu.json')); NC = len(WU['id'])
    cmap = np.load(f'{NET}/conus_county.npy').astype(np.int32) - 1
    rr, cc = np.nonzero(C)
    cnt = C[rr, cc].astype(np.int64)
    ax = x0 + (cc + 0.5) * cell; ay = y0 - (rr + 0.5) * cell
    lon, lat = Transformer.from_crs(5070, 4269, always_xy=True).transform(ax, ay)
    X, Z = LOWER48.forward(lon, lat)
    i = np.floor((X - X0) * ppu).astype(np.int64); j = np.floor((Z - Z0) * ppu).astype(np.int64)
    ok = (i >= 0) & (j >= 0) & (i < W) & (j < H)
    cid = np.full(len(cnt), -1, np.int64); cid[ok] = cmap[j[ok], i[ok]]
    # cells that fall on no county pixel (coast, lakes, borders): the nearest county pixel within 3 texels
    miss = np.flatnonzero(cid < 0)
    if len(miss):
        from scipy import ndimage
        valid = cmap >= 0
        dist, (nj, ni) = ndimage.distance_transform_edt(~valid, return_indices=True)
        mi = np.clip(i[miss], 0, W - 1); mj = np.clip(j[miss], 0, H - 1)
        near = dist[mj, mi] <= 3
        cid[miss[near]] = cmap[nj[mj[near], mi[near]], ni[mj[near], mi[near]]]
    km2 = np.bincount(cid[cid >= 0], weights=cnt[cid >= 0] * 900 / 1e6, minlength=NC)
    lost = float(cnt[cid < 0].sum()) * 900 / 1e6
    print('irrigated km2 on counties', round(float(km2.sum())), 'off any county', round(lost, 1))
    json.dump({'src': 'LANID 2015 (Xie, Gibbs and Lark 2021), data version 3', 'km2': [round(float(v), 3) for v in km2]}, open(f'{OUT}/county_irr.json', 'w'), separators=(',', ':'))
    print('done', round(time.time() - t0), 's')

main()
