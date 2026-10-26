"""The strain lens: USGS's surface water supply and use index (SUI) averaged over each county's watersheds.

Inputs (raw downloads, not in the repo):
  sui_huc12_summary.csv   per-HUC12 summary of the National Water Availability Assessment's monthly SUI, water years
                          2010-2020 (sui_iwa-assessment-outputs-conus-2025_CONUS_200910-202009_wide.csv, 108,083,552
                          bytes, sha256 940adeb4...2409): the mean of all 132 months, and the mean of water year 2015
  wbd_huc12_generalized   HUC12 outlines from the Watershed Boundary Dataset map service (layer 6), generalized to
                          0.01 degree, as lines "huc12|areasqkm|rings", each ring x and y times 1e4, delta-encoded;
                          then, comma-separated, the HUC12s whose codes have changed since (most of the St. Lawrence
                          basin), from USGS's copy of the October 2020 WBD the assessment used (the wbd12_20201026
                          collection at api.water.usgs.gov/fabric/pygeoapi)
  conus_county.png        the map's own county raster (county index + 1 in red * 256 + green)

Each HUC12 is drawn onto the county raster's grid in the map's equal-area projection, largest first so a basin
enclosed by another stays on top; a county's index is the mean over its pixels that fall in a HUC12 with a value, so
watersheds count by the area they cover in the county.

Output: strain.json, {"id": [...fips], "sui": [...mean 2010-2020], "sui15": [...water year 2015], "cover": [...share of
the county's area with a value]}; -1 where a county has no value.
"""
import csv, json, sys
import numpy as np
from PIL import Image, ImageDraw
sys.path.insert(0, __import__('os').path.dirname(__file__))
from proj import LOWER48, SLABS

sui_path, wbd_path, county_png, wu_path, out_path = sys.argv[1:6]

sui = {}
for r in csv.reader(l for l in open(sui_path) if not l.startswith('#')):
    if r[0] == 'huc12' or r[1] == '': continue   # (131 HUC12s have no value in any month)
    sui[r[0]] = (float(r[1]), float(r[3]) if r[3] not in ('', 'NaN') else float('nan'))
print('SUI HUC12s', len(sui))

slab = SLABS['conus']
x0, y0, x1, y1 = slab['rect']; ppu = slab['ppu']
img = Image.open(county_png).convert('RGB')
W, H = img.size
rgb = np.asarray(img)
cid = rgb[..., 0].astype(np.int32) * 256 + rgb[..., 1].astype(np.int32) - 1
del rgb

polys = []
seen = set()
for line in (l for path in wbd_path.split(',') for l in open(path)):
    if line.startswith('#') or line.startswith('huc12|'): continue
    h, a, enc = line.rstrip('\n').split('|', 2)
    if h in seen or h not in sui: continue
    seen.add(h)
    rings = []
    for rg in enc.split(';'):
        if not rg: continue
        v = np.cumsum(np.array(rg.split(','), dtype=np.int64).reshape(-1, 2), axis=0) / 1e4
        X, Y = LOWER48.forward(v[:, 0], v[:, 1])
        rings.append(np.stack([(X - x0) * ppu, (Y - y0) * ppu], axis=1))
    polys.append((float(a), h, rings))
print('outlined', len(polys), 'of', len(sui), 'SUI HUC12s; missing', len(sui) - len(polys))

polys.sort(key=lambda p: -p[0])
lab = Image.new('I', (W, H), 0)
dr = ImageDraw.Draw(lab)
vals = [(float('nan'), float('nan'))]
for k, (a, h, rings) in enumerate(polys, start=1):
    for r in rings:
        if len(r) >= 3: dr.polygon([tuple(p) for p in r], fill=k)
    vals.append(sui[h])
L = np.asarray(lab, dtype=np.int32)
V = np.array(vals)
m10 = V[:, 0][L]; m15 = V[:, 1][L]

wu = json.load(open(wu_path))
n = len(wu['id'])
ok = (cid >= 0) & (cid < n)
cnt = np.bincount(cid[ok], minlength=n).astype(float)
def mean_of(m):
    good = ok & np.isfinite(m) & (L > 0)
    s = np.bincount(cid[good], weights=m[good], minlength=n)
    c = np.bincount(cid[good], minlength=n).astype(float)
    return np.where(c > 0, s / np.maximum(c, 1), -1), c
sui10, c10 = mean_of(m10)
sui15, _ = mean_of(m15)
cover = np.where(cnt > 0, c10 / np.maximum(cnt, 1), -1)
# counties too small to hold a pixel of the raster (Virginia's independent cities): the watershed at their centre
cdata = json.load(open(wu_path.replace('wu.json', 'county_data.json')))
for i in range(n):
    c = cdata[i] if i < len(cdata) else None
    if cnt[i] > 0 or not c or wu['st'][i] in ('AK', 'HI', 'PR', 'VI'): continue
    px, py = int((c['cx'] - x0) * ppu), int((c['cz'] - y0) * ppu)
    if 0 <= px < W and 0 <= py < H and L[py, px] > 0 and np.isfinite(m10[py, px]):
        sui10[i], sui15[i], cover[i] = m10[py, px], m15[py, px], 1.0
r3 = lambda a: [round(float(x), 3) if x >= 0 else -1 for x in a]
json.dump({'id': wu['id'], 'sui': r3(sui10), 'sui15': r3(sui15), 'cover': r3(cover)}, open(out_path, 'w'), separators=(',', ':'))
has = sum(1 for x in sui10 if x >= 0)
print('counties with a value', has, 'of', n)
