"""Bake terrain rasters for each slab of the scene.

For every slab: resample ETOPO 2022 elevation/bathymetry and Natural Earth I land-cover colour into the
scene's projection, rasterise land / lake / US masks, and write
  <slab>_height.png  16-bit heights (R = high byte, G = low byte, B = masks) at the geometry resolution
  <slab>_albedo.png  land-cover colour at texture resolution (pre-grade)
  <slab>_shade.png   relief shading (multi-directional hillshade + local occlusion) at texture resolution
  <slab>_meta.json   grid sizes and transforms
"""
import json, sys, os, numpy as np, netCDF4
from scipy import ndimage
from PIL import Image, ImageDraw
import tifffile
sys.path.insert(0, os.path.dirname(__file__))
from proj import SLABS, LOWER48, ALASKA, HAWAII, PUERTORICO

RAW = '/home/claude/w2/raw'
OUT = '/home/claude/w2/proc/terrain'
os.makedirs(OUT, exist_ok=True)
KM_PER_UNIT = 6371.0 / 1240.583314171773

# ---------------------------------------------------------------- inputs
def load_dem(fname):
    d = netCDF4.Dataset(os.path.join(RAW, fname))
    lat = np.array(d.variables['latitude'][:], dtype=np.float64)
    lon = np.array(d.variables['longitude'][:], dtype=np.float64)
    z = np.array(d.variables['z'][:], dtype=np.float32)
    return dict(lat=lat, lon=lon, z=z)

DEMS = {
    'conus': [load_dem('etopo_conus.nc')],
    'ak': [load_dem('ETOPO_2022_v1_15s_4c64_6cf6_42c8.nc'), load_dem('etopo_ak_canada.nc'), load_dem('etopo_ak_russia.nc'), load_dem('ETOPO_2022_v1_15s_0ded_4d66_b4e6.nc')],
    'hi': [load_dem('ETOPO_2022_v1_15s_c9a5_5278_6a90.nc')],
    'pr': [load_dem('ETOPO_2022_v1_15s_69ac_92c4_0f64.nc')],
}

def sample_grid(dem, lon, lat):
    """Bilinear sample of a regular lat/lon grid; NaN outside."""
    la, lo, z = dem['lat'], dem['lon'], dem['z']
    fy = (lat - la[0]) / (la[1] - la[0])
    fx = (lon - lo[0]) / (lo[1] - lo[0])
    ok = (fy >= 0) & (fy <= len(la) - 1) & (fx >= 0) & (fx <= len(lo) - 1)
    out = np.full(lat.shape, np.nan, np.float32)
    out[ok] = ndimage.map_coordinates(z, [fy[ok], fx[ok]], order=1, mode='nearest')
    return out

print('loading land cover raster...', flush=True)
LC = tifffile.imread(os.path.join(RAW, 'ne1/NE1_HR_LC.tif'))  # 10800 x 21600 x 3
def sample_lc(lon, lat):
    fy = (89.99166666666667 - lat) / 0.01666666666667
    fx = (lon + 179.99166666666667) / 0.01666666666667
    fx = np.mod(fx, 21600)
    out = np.zeros(lat.shape + (3,), np.float32)
    for c in range(3):
        out[..., c] = ndimage.map_coordinates(LC[..., c], [fy, fx], order=1, mode='wrap')
    return out

def load_geojson(name):
    return json.load(open(os.path.join(RAW, 'ne', name + '.geojson')))

LAND = load_geojson('ne_10m_land')
MINOR = load_geojson('ne_10m_minor_islands')
LAKES = load_geojson('ne_10m_lakes')
LAKES_NA = load_geojson('ne_10m_lakes_north_america')
COUNTIES = json.load(open('/home/claude/build/counties_proj.json'))  # composite-projected

def polys(geom):
    if geom is None: return []
    if geom['type'] == 'Polygon': return [geom['coordinates']]
    if geom['type'] == 'MultiPolygon': return geom['coordinates']
    return []

def rasterize_lonlat(features, proj, slab, W, H, ppu, lon_window, lat_window, filt=None):
    """Rasterise lon/lat polygons (holes respected) into a W x H mask in slab pixel space."""
    x0, y0 = slab['rect'][0], slab['rect'][1]
    img = Image.new('L', (W, H), 0)
    dr = ImageDraw.Draw(img)
    for f in features:
        if filt and not filt(f): continue
        for poly in polys(f['geometry']):
            ext = np.asarray(poly[0])
            if ext[:, 0].max() < lon_window[0] or ext[:, 0].min() > lon_window[1]: continue
            if ext[:, 1].max() < lat_window[0] or ext[:, 1].min() > lat_window[1]: continue
            for ri, ring in enumerate(poly):
                r = np.asarray(ring)
                X, Y = proj.forward(r[:, 0], r[:, 1])
                pts = list(zip(((X - x0) * ppu).tolist(), ((Y - y0) * ppu).tolist()))
                if len(pts) >= 3:
                    dr.polygon(pts, fill=255 if ri == 0 else 0)
    return np.asarray(img) > 127

def rasterize_counties(slab, W, H, ppu):
    x0, y0 = slab['rect'][0], slab['rect'][1]
    img = Image.new('L', (W, H), 0)
    dr = ImageDraw.Draw(img)
    for f in COUNTIES['features']:
        st = f['properties']['STATEFP']
        if slab['states'] is None:
            if st in ('02', '15', '72', '78'): continue
        elif st not in slab['states']: continue
        g = f['geometry']
        for poly in polys(g):
            for ri, ring in enumerate(poly):
                r = np.asarray(ring)
                pts = list(zip(((r[:, 0] - x0) * ppu).tolist(), ((r[:, 1] - y0) * ppu).tolist()))
                if len(pts) >= 3: dr.polygon(pts, fill=255 if ri == 0 else 0)
    return np.asarray(img) > 127

# ---------------------------------------------------------------- shading
def hillshade(h, px_m, zf, az, alt):
    gy, gx = np.gradient(h * zf, px_m)
    # image rows go south (down); gradient gy is d/d(row) i.e. southward
    slope = np.pi / 2 - np.arctan(np.hypot(gx, gy))
    aspect = np.arctan2(-gx, gy)  # aspect measured so that az matches compass with north up
    azr, altr = np.radians(az), np.radians(alt)
    return np.clip(np.sin(altr) * np.sin(slope) + np.cos(altr) * np.cos(slope) * np.cos(azr - np.pi / 2 - aspect), 0, 1)

def relief_shade(h, px_m):
    hs = (0.50 * hillshade(h, px_m, 2.2, 315, 42) + 0.20 * hillshade(h, px_m, 2.2, 270, 45)
          + 0.15 * hillshade(h, px_m, 2.2, 0, 50) + 0.15 * hillshade(h, px_m, 2.2, 225, 55))
    flat = np.sin(np.radians(45)) * 1.0  # shade value of flat ground (approx, weighted)
    # local occlusion: valleys darker, ridges lighter (difference from a broad blur)
    occl = np.zeros_like(h)
    for s, w in ((3, 0.5), (10, 0.35), (30, 0.15)):
        occl += w * np.tanh((h - ndimage.gaussian_filter(h, s)) / (60.0 + 6 * s))
    shade = hs / max(flat, 1e-3)
    shade = shade * (1.0 + 0.18 * occl)
    return shade.astype(np.float32)

# ---------------------------------------------------------------- per slab
def bake(name):
    s = SLABS[name]
    x0, y0, x1, y1 = s['rect']
    ppu, hpu = s['ppu'], s['hpu']
    W, H = int(round((x1 - x0) * ppu)), int(round((y1 - y0) * ppu))
    print(f'[{name}] texture {W}x{H}', flush=True)
    proj = s['proj']
    jj, ii = np.mgrid[0:H, 0:W]
    X = x0 + (ii + 0.5) / ppu
    Y = y0 + (jj + 0.5) / ppu
    lon, lat = proj.inverse(X, Y)
    del X, Y, ii, jj
    # elevation
    z = np.full(lon.shape, np.nan, np.float32)
    for dem in DEMS[name]:
        zz = sample_grid(dem, lon, lat)
        z = np.where(np.isnan(z), zz, z)
    if np.isnan(z).any():
        nanm = np.isnan(z)
        print('  nan fraction', float(nanm.mean()))
        # fill gaps (e.g. the antimeridian seam between DEM pieces) from the nearest sample
        idx = ndimage.distance_transform_edt(nanm, return_distances=False, return_indices=True)
        z = z[tuple(idx)]
    # masks
    lw = (float(np.nanmin(lon)) - 1, float(np.nanmax(lon)) + 1)
    if name == 'ak': lw = (-180.5, 180.5)
    lt = (float(np.nanmin(lat)) - 1, float(np.nanmax(lat)) + 1)
    land = rasterize_lonlat(LAND['features'] + MINOR['features'], proj, s, W, H, ppu, lw, lt)
    lakes = rasterize_lonlat(LAKES['features'] + LAKES_NA['features'], proj, s, W, H, ppu, lw, lt)
    us = rasterize_counties(s, W, H, ppu)
    # Antimeridian: Natural Earth splits polygons at 180, both halves rasterise separately (fine).
    # colour
    col = sample_lc(lon, lat)
    # geometry scale
    km_per_unit = KM_PER_UNIT / (0.35 if name == 'ak' else 1.0)
    px_m = km_per_unit * 1000.0 / ppu
    shade = relief_shade(z.astype(np.float64), px_m)
    meta = dict(name=name, rect=s['rect'], offset=s['offset'], ppu=ppu, hpu=hpu, tex=[W, H], km_per_unit=km_per_unit)
    # heightmap (geometry resolution): area-average the texture-resolution heights
    f = int(round(ppu / hpu))
    Hh, Wh = H // f, W // f
    zc = z[:Hh * f, :Wh * f].reshape(Hh, f, Wh, f).mean(axis=(1, 3))
    # keep coastal land from sinking under the sea by averaging: max over block where land dominates
    landc = land[:Hh * f, :Wh * f].reshape(Hh, f, Wh, f).mean(axis=(1, 3))
    zmax = z[:Hh * f, :Wh * f].reshape(Hh, f, Wh, f).max(axis=(1, 3))
    zc = np.where((landc > 0.5) & (zc < 1.0) & (zmax > 0), np.maximum(zc, 1.0), zc)
    lakec = lakes[:Hh * f, :Wh * f].reshape(Hh, f, Wh, f).mean(axis=(1, 3)) > 0.5
    usc = us[:Hh * f, :Wh * f].reshape(Hh, f, Wh, f).mean(axis=(1, 3)) > 0.5
    meta['height'] = [Wh, Hh]
    enc = np.clip(np.round((zc + 11000.0) * 2.0), 0, 65535).astype(np.uint32)
    masks = (landc > 0.5).astype(np.uint8) * 1 + lakec.astype(np.uint8) * 2 + usc.astype(np.uint8) * 4
    rgb = np.stack([(enc >> 8).astype(np.uint8), (enc & 255).astype(np.uint8), (masks * 32).astype(np.uint8)], axis=-1)
    Image.fromarray(rgb, 'RGB').save(os.path.join(OUT, f'{name}_height.png'), optimize=True)
    # full-resolution products
    np.save(os.path.join(OUT, f'{name}_z.npy'), z.astype(np.float32))
    np.save(os.path.join(OUT, f'{name}_masks.npy'), (land.astype(np.uint8) | (lakes.astype(np.uint8) << 1) | (us.astype(np.uint8) << 2)))
    np.save(os.path.join(OUT, f'{name}_lc.npy'), col.astype(np.uint8))
    np.save(os.path.join(OUT, f'{name}_shade.npy'), shade.astype(np.float16))
    json.dump(meta, open(os.path.join(OUT, f'{name}_meta.json'), 'w'))
    print(f'  done: z {float(z.min()):.0f}..{float(z.max()):.0f} m, land {land.mean():.3f}, us {us.mean():.3f}, lakes {lakes.mean():.4f}', flush=True)

if __name__ == '__main__':
    for n in (sys.argv[1:] or ['pr', 'hi', 'ak', 'conus']):
        bake(n)
