"""Inland water and coastline masks for the terrain, anti-aliased by 3x3 supersampling:
  - alpha channel of <slab>_color.webp: 1.0 land, ~0.5 sea, ~0 lake/reservoir (smooth shorelines)
  - the geometry heightmap is flattened under lakes to the lake's surface level (so water lies flat)
Lake polygons and levels come from features.json (Natural Earth lakes, levels = median DEM along the shore).
"""
import json, numpy as np
from PIL import Image, ImageDraw
from netlib import *
WEB = '/home/claude/w2/proc/web'
F = json.load(open(f'{NET}/features.json'))
SS = 3   # supersampling factor
LAND = json.load(open(f'{RAW}/ne/ne_10m_land.geojson'))['features'] + json.load(open(f'{RAW}/ne/ne_10m_minor_islands.geojson'))['features']

def land_rings(slab, t):
    """Natural Earth land polygons projected to this slab's pixel space (texture resolution)."""
    S = SLABS[slab]; out = []
    lon0, lon1 = {'conus': (-135, -55), 'ak': (-180.1, 180.1), 'hi': (-162, -153), 'pr': (-68.5, -64)}[slab]
    lat0, lat1 = {'conus': (18, 58), 'ak': (48, 75), 'hi': (17, 24), 'pr': (17, 19.2)}[slab]
    for f in LAND:
        g = f['geometry']
        polys = g['coordinates'] if g['type'] == 'MultiPolygon' else [g['coordinates']]
        for poly in polys:
            ext = np.asarray(poly[0])
            if ext[:, 0].max() < lon0 or ext[:, 0].min() > lon1 or ext[:, 1].max() < lat0 or ext[:, 1].min() > lat1: continue
            rr = []
            for ring in poly:
                r = np.asarray(ring)
                x, z = to_scene(slab, r[:, 0], r[:, 1])
                rr.append(np.stack([(x - t.x0) * t.ppu, (z - t.z0) * t.ppu], 1))
            out.append(rr)
    return out

def lake_rings(slab, t):
    out = []
    for l in F['lakes']:
        if l['slab'] != slab: continue
        level = max(l['level'], 0.0) if l['level'] < 3 else l['level']
        for rings in l['polys']:
            rr = [np.stack([(np.asarray(r).reshape(-1, 2)[:, 0] - t.x0) * t.ppu, (np.asarray(r).reshape(-1, 2)[:, 1] - t.z0) * t.ppu], 1) for r in rings]
            out.append((rr, level))
    return out

def coverage(polys, W, H, strip=200):
    """fraction of each texture pixel covered by the polygons (holes respected)"""
    cov = np.zeros((H, W), np.float32)
    for r0 in range(0, H, strip):
        h = min(strip, H - r0)
        img = Image.new('L', (W * SS, h * SS), 0); dr = ImageDraw.Draw(img)
        y0 = r0
        for rings in polys:
            ext = rings[0]
            if ext[:, 1].max() < y0 - 1 or ext[:, 1].min() > y0 + h + 1: continue
            for ri, ring in enumerate(rings):
                pts = list(zip((ring[:, 0] * SS).tolist(), ((ring[:, 1] - y0) * SS).tolist()))
                if len(pts) >= 3: dr.polygon(pts, fill=255 if ri == 0 else 0)
        a = np.asarray(img, np.float32).reshape(h, SS, W, SS).mean(axis=(1, 3)) / 255.0
        cov[r0:r0 + h] = a
    return cov

for slab in ['conus', 'ak', 'hi', 'pr']:
    t = Terrain(slab)
    W, H = t.W, t.H
    landc = coverage(land_rings(slab, t), W, H)
    lk = lake_rings(slab, t)
    lakec = coverage([rr for rr, _ in lk], W, H) if lk else np.zeros((H, W), np.float32)
    # lake levels at texture resolution (binary, for flattening)
    lev = Image.new('F', (W, H), np.nan); dl = ImageDraw.Draw(lev)
    for rr, level in lk:
        for ri, ring in enumerate(rr):
            pts = list(zip(ring[:, 0].tolist(), ring[:, 1].tolist()))
            if len(pts) >= 3: dl.polygon(pts, fill=float(level) if ri == 0 else float('nan'))
    level = np.asarray(lev, np.float32)
    sea = np.clip(1 - landc, 0, 1)
    a = np.clip(1.0 - 0.5 * sea - lakec, 0, 1)
    alpha = np.clip(np.round(2 + 253 * a), 2, 255).astype(np.uint8)
    src = f'{WEB}/{slab}_color_rgb.webp'
    if not os.path.exists(src): os.rename(f'{WEB}/{slab}_color.webp', src)
    col = Image.open(src).convert('RGB')
    rgba = np.dstack([np.asarray(col), alpha])
    Image.fromarray(rgba, 'RGBA').save(f'{WEB}/{slab}_color.webp', 'WEBP', quality=86, method=6, alpha_quality=100, exact=True)
    # flatten geometry heights under lakes (start from the unflattened bake each time)
    hp = np.asarray(Image.open(f'{TER}/{slab}_height.png').convert('RGB')).copy()
    m = json.load(open(f'{WEB}/{slab}_meta.json'))
    Wh, Hh = m['height']; f = int(round(m['ppu'] / m['hpu']))
    lkf = lakec[:Hh * f, :Wh * f].reshape(Hh, f, Wh, f).mean(axis=(1, 3))
    lv = level[:Hh * f, :Wh * f].reshape(Hh, f, Wh, f).transpose(0, 2, 1, 3).reshape(Hh, Wh, f * f)
    with np.errstate(all='ignore'):
        lvm = np.nanmedian(lv, axis=2) if np.isfinite(lv).any() else np.full((Hh, Wh), np.nan)
    sel = (lkf > 0.45) & np.isfinite(lvm)
    enc = ((hp[..., 0].astype(np.int32) << 8) | hp[..., 1]).astype(np.int32)
    z = enc / 2.0 - 11000
    z2 = np.where(sel, lvm, z)
    enc2 = np.clip(np.round((z2 + 11000) * 2), 0, 65535).astype(np.int32)
    hp[..., 0] = enc2 >> 8; hp[..., 1] = enc2 & 255
    hp[..., 2] = np.where(sel, hp[..., 2] | (2 * 32), hp[..., 2])
    Image.fromarray(hp, 'RGB').save(f'{WEB}/{slab}_height.png', optimize=True)
    print(slab, 'lakes', len(lk), 'flattened cells', int(sel.sum()), 'color KB', os.path.getsize(f'{WEB}/{slab}_color.webp') // 1024,
          'alpha levels', len(np.unique(alpha)), flush=True)
