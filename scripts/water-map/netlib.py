"""Shared helpers for baking the water network: slab geometry, projections into scene coordinates,
county polygons and rasters, and terrain sampling."""
import sys, os, json, numpy as np
sys.path.insert(0, os.path.dirname(__file__))
from proj import SLABS, LOWER48, ALASKA, HAWAII, PUERTORICO, slab_of_state

TER = '/home/claude/w2/proc/terrain'
NET = '/home/claude/w2/proc/net'
RAW = '/home/claude/w2/raw'
os.makedirs(NET, exist_ok=True)
STATE_SLAB = {'02': 'ak', '15': 'hi', '72': 'pr', '78': 'pr'}
ABBR = {'01':'AL','02':'AK','04':'AZ','05':'AR','06':'CA','08':'CO','09':'CT','10':'DE','11':'DC','12':'FL','13':'GA','15':'HI','16':'ID','17':'IL','18':'IN','19':'IA','20':'KS','21':'KY','22':'LA','23':'ME','24':'MD','25':'MA','26':'MI','27':'MN','28':'MS','29':'MO','30':'MT','31':'NE','32':'NV','33':'NH','34':'NJ','35':'NM','36':'NY','37':'NC','38':'ND','39':'OH','40':'OK','41':'OR','42':'PA','44':'RI','45':'SC','46':'SD','47':'TN','48':'TX','49':'UT','50':'VT','51':'VA','53':'WA','54':'WV','55':'WI','56':'WY','72':'PR','78':'VI'}
FIPS_OF = {v: k for k, v in ABBR.items()}

def slab_for_state(st):
    return STATE_SLAB.get(st, 'conus')

def meta(slab):
    return json.load(open(f'{TER}/{slab}_meta.json'))

def to_scene(slab, lon, lat):
    """lon/lat -> scene (x, z) for a slab; also returns composite-projection coords."""
    S = SLABS[slab]
    X, Y = S['proj'].forward(np.asarray(lon, float), np.asarray(lat, float))
    return X + S['offset'][0], Y + S['offset'][1]

def in_rect(slab, X, Y):
    x0, y0, x1, y1 = SLABS[slab]['rect']
    return (X >= x0) & (X <= x1) & (Y >= y0) & (Y <= y1)

class Terrain:
    """Texture-resolution elevation (m) and masks for one slab, addressed in scene coordinates."""
    def __init__(self, slab):
        self.slab = slab
        m = meta(slab)
        self.m = m
        self.ppu = m['ppu']
        x0, y0, x1, y1 = m['rect']
        ox, oy = m['offset']
        self.x0, self.z0 = x0 + ox, y0 + oy
        self.x1, self.z1 = x1 + ox, y1 + oy
        self.z = np.load(f'{TER}/{slab}_z.npy', mmap_mode='r')
        self.mask = np.load(f'{TER}/{slab}_masks.npy', mmap_mode='r')
        self.H, self.W = self.z.shape
        self.km = m['km_per_unit']
    def px(self, x, z):
        return (np.asarray(x) - self.x0) * self.ppu - 0.5, (np.asarray(z) - self.z0) * self.ppu - 0.5
    def sample(self, x, z):
        from scipy import ndimage
        fx, fy = self.px(x, z)
        fx = np.clip(fx, 0, self.W - 1); fy = np.clip(fy, 0, self.H - 1)
        return ndimage.map_coordinates(np.asarray(self.z), [np.atleast_1d(fy), np.atleast_1d(fx)], order=1, mode='nearest')
    def mask_at(self, x, z):
        fx, fy = self.px(x, z)
        i = np.clip(np.round(fx).astype(int), 0, self.W - 1); j = np.clip(np.round(fy).astype(int), 0, self.H - 1)
        return np.asarray(self.mask)[j, i]

def county_features():
    """County polygons in scene coordinates: list of dict(id, name, st, slab, polys=[ [ring(np.array Nx2), ...], ...])."""
    d = json.load(open('/home/claude/build/counties_proj.json'))
    out = []
    for f in d['features']:
        p = f['properties']; st = p['STATEFP']; slab = slab_for_state(st)
        ox, oy = SLABS[slab]['offset']
        g = f['geometry']
        polys = g['coordinates'] if g['type'] == 'MultiPolygon' else [g['coordinates']]
        pp = [[np.asarray(r, float) + [ox, oy] for r in poly] for poly in polys]
        out.append(dict(id=p['GEOID'], name=p['NAME'], st=st, slab=slab, polys=pp))
    return out

def read_rivers(slab):
    """Read rivers_<slab>.bin.gz (RIV2) -> dict of arrays; verts in scene coordinates."""
    import gzip, struct
    b = gzip.open(f'{NET}/rivers_{slab}.bin.gz').read()
    magic, n, nv, nn = struct.unpack_from('<4sIII', b, 0)
    o = 16
    def take(dt, cnt):
        nonlocal o
        a = np.frombuffer(b, dt, cnt, o); o += a.nbytes; return a
    nxt = take('<i4', n); basin = take('<i4', n); q = take('<f4', n); dd = take('<f4', n); lk = take('<f4', n)
    nvs = take('<u2', n); name = take('<u2', n); order = take('<u1', n)
    o += (-o) % 4
    xz = take('<u2', nv * 2).reshape(-1, 2).astype(np.float64)
    S = SLABS[slab]; rx0, ry0, rx1, ry1 = S['rect']; ox, oy = S['offset']
    x = rx0 + ox + xz[:, 0] / 65535 * (rx1 - rx0); z = ry0 + oy + xz[:, 1] / 65535 * (ry1 - ry0)
    start = np.concatenate([[0], np.cumsum(nvs.astype(np.int64))[:-1]])
    names = json.load(open(f'{NET}/rivers_{slab}_names.json'))
    return dict(n=n, next=nxt, basin=basin, q=q, dd=dd, lk=lk, nv=nvs, name=name, order=order, x=x, z=z, start=start, names=names)
