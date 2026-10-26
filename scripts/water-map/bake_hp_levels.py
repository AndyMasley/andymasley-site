"""Water-level change in the High Plains aquifer, predevelopment (about 1950) to 2015, on the map's aquifer grid.

Input: hp_wlcpd15a.zip from USGS ScienceBase item 58ff75a2e4b006455f2d6327 (McGuire, 2017, "(A1) Spatial data set of
mapped water-level changes in the High Plains aquifer, predevelopment (about 1950) to 2015"; 3,217,453 bytes, sha256
91cd95cc...981b): an ASCII grid of 500-meter cells in feet, Albers equal-area on NAD83 (29.5 and 45.5, -96, 23).

Output: conus_hpwl.png, one byte per cell of the conus aquifer grid (half the color texture's resolution):
0 where the grid has no value; else 128 + the change in feet, rounded, for changes from -100 feet up (a rise of 82 feet
is 210), and below that one step for each 5 feet more of decline (a decline of 234 feet is 1).
Also prints the figures the page quotes, worked out from the grid itself.
"""
import io, json, sys, zipfile
import numpy as np
from PIL import Image
from pyproj import Transformer
sys.path.insert(0, __import__('os').path.dirname(__file__))
from proj import LOWER48, SLABS

zip_path, meta_path, out_path = sys.argv[1:4]
z = zipfile.ZipFile(zip_path)
txt = z.read('hp_wlcpd15a/hp_wlcpd15a.txt').decode()
lines = txt.split('\n', 6)
hdr = {l.split()[0].lower(): float(l.split()[1]) for l in lines[:6]}
grid = np.loadtxt(io.StringIO(lines[6]), dtype=np.float32)
nc, nr, xll, yll, cs, nd = (int(hdr['ncols']), int(hdr['nrows']), hdr['xllcorner'], hdr['yllcorner'], hdr['cellsize'], hdr['nodata_value'])
assert grid.shape == (nr, nc)
valid = grid != nd
v = grid[valid]
sqmi = (cs / 1000) ** 2 / 2.58999
print('grid cells', v.size, 'square miles', round(v.size * sqmi))
print('change range', float(v.min()), float(v.max()), 'area-weighted mean', round(float(v.mean()), 1))
for t in (25, 50, 100, 150):
    print(f'declined more than {t} feet: {round(float((v < -t).sum()) * sqmi):,} square miles')
print('rose more than 10 feet:', f'{round(float((v > 10).sum()) * sqmi):,} square miles')

meta = json.load(open(meta_path))
s = SLABS['conus']
ppu = s['ppu'] / 2   # the aquifer grid
W, H = int(round((s['rect'][2] - s['rect'][0]) * ppu)), int(round((s['rect'][3] - s['rect'][1]) * ppu))
aq = Image.open(meta_path.replace('conus_meta.json', 'conus_aquifer.png'))
W, H = aq.size
print('aquifer grid', W, H)
# the map cells that can fall in the grid: the grid's corners, projected, bound them
to_ll = Transformer.from_crs('+proj=aea +lat_1=29.5 +lat_2=45.5 +lat_0=23 +lon_0=-96 +x_0=0 +y_0=0 +ellps=GRS80 +units=m +no_defs', 'EPSG:4269', always_xy=True)
to_aea = Transformer.from_crs('EPSG:4269', '+proj=aea +lat_1=29.5 +lat_2=45.5 +lat_0=23 +lon_0=-96 +x_0=0 +y_0=0 +ellps=GRS80 +units=m +no_defs', always_xy=True)
ex = np.array([[xll, yll], [xll + nc * cs, yll], [xll, yll + nr * cs], [xll + nc * cs, yll + nr * cs]])
lon, lat = to_ll.transform(ex[:, 0], ex[:, 1])
X, Y = LOWER48.forward(lon, lat)
i0 = max(0, int(np.floor((X.min() - s['rect'][0]) * ppu)) - 4); i1 = min(W, int(np.ceil((X.max() - s['rect'][0]) * ppu)) + 4)
j0 = max(0, int(np.floor((Y.min() - s['rect'][1]) * ppu)) - 4); j1 = min(H, int(np.ceil((Y.max() - s['rect'][1]) * ppu)) + 4)
ii, jj = np.meshgrid(np.arange(i0, i1), np.arange(j0, j1))
mx = s['rect'][0] + (ii + 0.5) / ppu
my = s['rect'][1] + (jj + 0.5) / ppu
lo, la = LOWER48.inverse(mx, my)
ax, ay = to_aea.transform(lo, la)
ci = np.floor((ax - xll) / cs).astype(int)
cj = np.floor((yll + nr * cs - ay) / cs).astype(int)
inside = (ci >= 0) & (ci < nc) & (cj >= 0) & (cj < nr)
val = np.full(ii.shape, nd, dtype=np.float32)
val[inside] = grid[cj[inside], ci[inside]]
out = np.zeros((H, W), dtype=np.uint8)
enc = np.where(val >= -100, np.round(128 + val), 28 - np.round((-val - 100) / 5))
blk = np.where(val != nd, np.clip(enc, 1, 255), 0).astype(np.uint8)
out[j0:j1, i0:i1] = blk
Image.fromarray(out, 'L').save(out_path, optimize=True)
print('map cells with a value', int((out > 0).sum()))
