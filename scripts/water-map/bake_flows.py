"""Per-county anchors for the water-flow particles, plus land-class textures for the terrain shader.

Anchors are scene points inside each county where flows start and end: river intakes (largest rivers in the county)
and their downstream return points, lake and sea shores, and land / cropland / urban points sampled from the land-cover
and urban rasters. Volumes come from the USGS 2015 county table (wu.json) at runtime; anchors only place them.

Outputs (proc/net):
  anchors.bin        per-county anchor sets (see layout below)
  <slab>_land.png    RGBA at half texture resolution: R urban, G cropland weight, B forest weight, A irrigated-land weight
  county_data.json   per-county area, centroid, irrigated fraction and method mix
"""
import json, struct, collections, numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage
from shapely.geometry import shape, Polygon, MultiPolygon
from netlib import *
sys.path.insert(0, os.path.dirname(__file__))

WU = json.load(open('/home/claude/build/wu.json'))
NC = len(WU['id'])
F = json.load(open(f'{NET}/features.json'))
rng = np.random.default_rng(20151)

def ss(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t)

def class_weights(lc8):
    """Same land-cover separation as export_terrain.remap_landcover: crop, forest weights (0..1)."""
    c = lc8.astype(np.float32) / 255.0
    r, g = c[..., 0], c[..., 1]
    dg = (g - r) * 255.0
    forest = ss(0.06, 0.26, 0.91 - r)
    crop = ss(-1.5, 2.5, dg) * (1 - forest)
    return crop, forest

def urban_mask(slab, t):
    d = json.load(open(f'{RAW}/ne/ne_10m_urban_areas.geojson'))
    img = Image.new('L', (t.W, t.H), 0); dr = ImageDraw.Draw(img)
    S = SLABS[slab]
    for f in d['features']:
        g = f['geometry']
        polys = g['coordinates'] if g['type'] == 'MultiPolygon' else [g['coordinates']]
        for poly in polys:
            ext = np.asarray(poly[0])
            lon, lat = ext[:, 0].mean(), ext[:, 1].mean()
            if slab == 'conus' and not (-128 < lon < -64 and 23 < lat < 50.5): continue
            if slab == 'ak' and not (lat > 51 and (lon < -129 or lon > 170)): continue
            if slab == 'hi' and not (-161 < lon < -154 and 18 < lat < 23): continue
            if slab == 'pr' and not (-68 < lon < -64 and 17 < lat < 19): continue
            for ri, ring in enumerate(poly):
                r = np.asarray(ring)
                x, z = to_scene(slab, r[:, 0], r[:, 1])
                px = (x - t.x0) * t.ppu; pz = (z - t.z0) * t.ppu
                if len(px) >= 3: dr.polygon(list(zip(px.tolist(), pz.tolist())), fill=255 if ri == 0 else 0)
    return np.asarray(img)

def pick(ix, w, k):
    """k indices from ix with probability proportional to w (without replacement when possible)."""
    if len(ix) == 0: return ix
    w = np.asarray(w, np.float64); w = np.maximum(w, 0)
    if w.sum() <= 0: w = np.ones(len(ix))
    k = min(k, len(ix))
    return rng.choice(ix, size=k, replace=False, p=w / w.sum())

def spread_pick(ix, w, k, W, min_px):
    """Like pick, but rejects points closer than min_px to an earlier pick (spreads anchors over the county)."""
    if len(ix) == 0: return ix
    cand = pick(ix, w, min(len(ix), k * 6))
    out = []
    for c in cand:
        cy, cx = divmod(int(c), W)
        if all((cy - oy) ** 2 + (cx - ox) ** 2 >= min_px ** 2 for oy, ox in out): out.append((cy, cx))
        if len(out) >= k: break
    if len(out) < k:
        for c in cand:
            cy, cx = divmod(int(c), W)
            if (cy, cx) not in out: out.append((cy, cx))
            if len(out) >= k: break
    return np.array([oy * W + ox for oy, ox in out], np.int64)

def downstream(r, vert, reach, dist_units):
    x, z = r['x'][vert], r['z'][vert]; acc = 0.0; k = vert; rr = reach
    while acc < dist_units:
        end = r['start'][rr] + r['nv'][rr] - 1
        if k < end:
            nx, nz = r['x'][k + 1], r['z'][k + 1]; acc += np.hypot(nx - x, nz - z); x, z = nx, nz; k += 1
        else:
            rr = r['next'][rr]
            if rr < 0: break
            k = r['start'][rr]
    return float(x), float(z)

TYPES = ['riv', 'ret', 'lake', 'sea', 'land', 'crop', 'urban', 'golf', 'wtp', 'wwtp']
NPTS = dict(land=14, crop=14, urban=10)
# OpenStreetMap points (bake_osm.py): golf courses, water treatment works, wastewater plants, by county
def osm_points():
    b = open(f'{NET}/osm_points.bin', 'rb').read()
    n = struct.unpack_from('<I', b, 4)[0]; o = 8
    x = np.frombuffer(b, '<f4', n, o); o += 4 * n
    z = np.frombuffer(b, '<f4', n, o); o += 4 * n
    kind = np.frombuffer(b, 'u1', n, o); o += n
    o += n  # slab
    county = np.frombuffer(b, '<i2', n, o)
    return x, z, kind, county
OSM_KIND = {'wtp': 1, 'wwtp': 2, 'golf': 3}
OSM_MAX = {'wtp': 6, 'wwtp': 8, 'golf': 24}

def save_land_webp(rgba, path):
    """Half resolution, 32 levels per channel, lossless: lossy WebP's 4:2:0 chroma would mix the data channels, and
    it rewrites colour under zero alpha unless told not to."""
    H, W = rgba.shape[:2]
    h = rgba[:H // 2 * 2, :W // 2 * 2].reshape(H // 2, 2, W // 2, 2, 4).mean(axis=(1, 3))
    q = (np.round(np.clip(h, 0, 1) * 31) * 255 / 31 + 0.5).astype(np.uint8)
    Image.fromarray(q, 'RGBA').save(path, 'WEBP', lossless=True, quality=100, method=5, exact=True)

def nlcd_fracs(slab, H, W):
    """NLCD fractions at texture resolution (bake_nlcd.py): developed intensity, cultivated crops, hay/pasture, tree
    cover (forest + woody wetland) and validity. Woody wetland is counted from the close-up grid."""
    p = f'/home/claude/w2/proc/nlcd/{slab}_agg.npz'
    if not os.path.exists(p): return None
    a = np.load(p)
    out = {k: a[k].astype(np.float32) for k in ('valid', 'dev', 'crop', 'hay', 'forest', 'water')}
    c3 = np.load(f'/home/claude/w2/proc/nlcd/{slab}_cls3.npy', mmap_mode='r')
    ww = np.zeros((H, W), np.float32)
    for j0 in range(0, H, 256):
        j1 = min(H, j0 + 256)
        blk = np.asarray(c3[j0 * 3:j1 * 3, :W * 3]).reshape(j1 - j0, 3, W, 3)
        ww[j0:j1] = (blk == 19).sum(axis=(1, 3)) / 9.0
    out['woodywet'] = ww
    return out

def main():
    global OX, OZ, OSM_BY
    OX, OZ, OK, OC = osm_points()
    OSM_BY = {kid: {} for kid in OSM_KIND.values()}
    for kid in OSM_KIND.values():
        idx = np.flatnonzero(OK == kid)
        for c in np.unique(OC[idx]):
            if c >= 0: OSM_BY[kid][int(c)] = idx[OC[idx] == c]
    anchors = [None] * NC
    cdata = [None] * NC
    irr_ac = np.array([(WU['ic_ac'][i] if WU['ic_ac'][i] is not None else (WU['ir_spr'][i] or 0) + (WU['ir_mic'][i] or 0) + (WU['ir_sur'][i] or 0)) or 0 for i in range(NC)], float)
    for slab in ['conus', 'ak', 'hi', 'pr']:
        t = Terrain(slab)
        W, H = t.W, t.H
        cmap = np.load(f'{NET}/{slab}_county.npy').astype(np.int32) - 1
        mask = np.asarray(t.mask)
        land = ((mask & 1) > 0) & ((mask & 2) == 0)
        lake = (mask & 2) > 0
        ocean = (mask & 1) == 0
        lc = np.load(f'{TER}/{slab}_lc.npy', mmap_mode='r')
        crop = np.zeros((H, W), np.float32); forest = np.zeros((H, W), np.float32)
        for r0 in range(0, H, 512):
            c_, f_ = class_weights(np.asarray(lc[r0:r0 + 512])); crop[r0:r0 + 512] = c_; forest[r0:r0 + 512] = f_
        crop *= land; forest *= land
        urb = urban_mask(slab, t).astype(np.float32) / 255.0 * land
        hay = np.zeros((H, W), np.float32)
        NL = nlcd_fracs(slab, H, W)
        if NL is not None:
            v = np.clip(NL['valid'], 0, 1)
            # NLCD where it covers the texel (all US land except the far western Aleutians), Natural Earth elsewhere
            crop = (NL['crop'] + crop * (1 - v)) * land
            hay = NL['hay'] * land
            forest = (NL['forest'] + NL['woodywet'] + forest * (1 - v)) * land
            urb = (NL['dev'] + urb * (1 - v)) * land
            print(slab, 'NLCD weights: cultivated km2', round(float(NL['crop'].sum()) * (t.km / t.ppu) ** 2), 'developed (weighted) km2', round(float(NL['dev'].sum()) * (t.km / t.ppu) ** 2), flush=True)
        # flatness (irrigated land is flat): slope from the texture-resolution DEM
        zz = np.asarray(t.z, np.float32)
        gy, gx = np.gradient(zz, t.km * 1000 / t.ppu)
        flat = 1 - ss(0.008, 0.045, np.hypot(gx, gy)); del gx, gy, zz
        px_km2 = (t.km / t.ppu) ** 2
        # pixel lists per county
        cflat = cmap.ravel()
        order = np.argsort(cflat, kind='stable')
        sorted_ids = cflat[order]
        lo = np.searchsorted(sorted_ids, np.arange(NC)); hi = np.searchsorted(sorted_ids, np.arange(NC), side='right')
        # coast & lake-shore pixels
        lab, nlab = ndimage.label(lake)
        sizes = ndimage.sum(np.ones_like(lab), lab, index=np.arange(nlab + 1)) * px_km2
        big_lake = np.isin(lab, np.flatnonzero(sizes >= 40.0)) & lake
        shore = land & ndimage.binary_dilation(big_lake, iterations=2)
        coast = land & ndimage.binary_dilation(ocean, iterations=2)
        # irrigated-land weight raster (per county irrigated acres spread over cropland, then over open land)
        irr = np.zeros((H, W), np.float32)
        r = read_rivers(slab) if slab != 'hi' else None
        if r is not None:
            fx, fy = t.px(r['x'], r['z'])
            vi = np.clip(np.round(fx).astype(int), 0, W - 1); vj = np.clip(np.round(fy).astype(int), 0, H - 1)
            vcounty = cmap[vj, vi]
            vreach = np.searchsorted(r['start'], np.arange(len(r['x'])), side='right') - 1
        for ci in range(NC):
            if lo[ci] == hi[ci]:
                continue
            pix = order[lo[ci]:hi[ci]]
            pl = pix[land.ravel()[pix]]
            if len(pl) == 0: pl = pix
            area = len(pix) * px_km2
            jj, ii = np.divmod(pix, W)
            cx = t.x0 + (ii.mean() + 0.5) / t.ppu; cz = t.z0 + (jj.mean() + 0.5) / t.ppu
            a = {k: [] for k in TYPES}
            def to_xy(ix):
                yy, xx = np.divmod(ix, W)
                return np.stack([t.x0 + (xx + rng.random(len(ix))) / t.ppu, t.z0 + (yy + rng.random(len(ix))) / t.ppu], 1)
            minpx = max(2, int(np.sqrt(len(pl)) / 5))
            a['land'] = to_xy(spread_pick(pl, np.ones(len(pl)), NPTS['land'], W, minpx))
            cw = (crop.ravel()[pl] + 0.5 * hay.ravel()[pl] + 0.1 * (1 - forest.ravel()[pl]) * (1 - urb.ravel()[pl])) * (0.2 + flat.ravel()[pl]) + 0.002
            a['crop'] = to_xy(spread_pick(pl, cw, NPTS['crop'], W, minpx))
            uw = urb.ravel()[pl]
            if uw.sum() * px_km2 > 2.0: a['urban'] = to_xy(spread_pick(pl, np.maximum(uw - 0.08, 0) ** 2 + 1e-6, NPTS['urban'], W, max(1, minpx // 2)))
            else:
                # no mapped urban area: settle near the county's largest city, or its centre
                cs = [c for c in F['cities'] if c['county'] == ci]
                if cs:
                    c0 = max(cs, key=lambda c: c['pop']); d2 = ((t.x0 + (pl % W + 0.5) / t.ppu - c0['x']) ** 2 + (t.z0 + (pl // W + 0.5) / t.ppu - c0['z']) ** 2)
                else:
                    d2 = ((t.x0 + (pl % W + 0.5) / t.ppu - cx) ** 2 + (t.z0 + (pl // W + 0.5) / t.ppu - cz) ** 2)
                near = pl[np.argsort(d2)[:max(6, len(pl) // 12)]]
                a['urban'] = to_xy(pick(near, np.ones(len(near)), 6))
            for kk, kid in OSM_KIND.items():
                sel = OSM_BY[kid].get(ci)
                if sel is not None and len(sel):
                    pts = np.stack([OX[sel], OZ[sel]], 1)
                    if len(pts) > OSM_MAX[kk]: pts = pts[rng.choice(len(pts), OSM_MAX[kk], replace=False)]
                    a[kk] = pts
            sh = pix[shore.ravel()[pix]]
            if len(sh): a['lake'] = to_xy(spread_pick(sh, np.ones(len(sh)), 3, W, minpx))
            co = pix[coast.ravel()[pix]]
            if len(co): a['sea'] = to_xy(spread_pick(co, np.ones(len(co)), 3, W, minpx))
            # rivers: the largest reaches in the county
            if r is not None:
                vs = np.flatnonzero(vcounty == ci)
                if len(vs):
                    reaches = collections.OrderedDict()
                    for v in vs[np.argsort(-r['q'][vreach[vs]], kind='stable')]:
                        rr = vreach[v]
                        if rr not in reaches: reaches[rr] = v
                        if len(reaches) >= 24: break
                    # keep up to 5, spread out, biggest first
                    chosen = []
                    for rr, v in reaches.items():
                        if any(np.hypot(r['x'][v] - r['x'][u], r['z'][v] - r['z'][u]) < 0.6 for _, u in chosen): continue
                        chosen.append((rr, v))
                        if len(chosen) >= 5: break
                    for rr, v in chosen:
                        q = float(r['q'][rr])
                        a['riv'].append([r['x'][v], r['z'][v], q])
                        a['ret'].append(list(downstream(r, v, rr, 0.8)))
            # irrigated land: spread acres over cropland first
            A_irr = irr_ac[ci] * 1000 * 0.00404686
            if A_irr > 0:
                # flat cropland first, then flat open land; never forest or city
                fl = flat.ravel()[pl]
                cl = (crop.ravel()[pl] + 0.6 * hay.ravel()[pl]) * fl; A_crop = cl.sum() * px_km2
                if A_crop > 0:
                    f1 = min(1.0, A_irr / A_crop); irr.ravel()[pl] += cl * f1
                    rest = A_irr - f1 * A_crop
                else: rest = A_irr
                if rest > 0:
                    open_ = np.clip(1 - forest.ravel()[pl] - urb.ravel()[pl] - crop.ravel()[pl] - hay.ravel()[pl], 0, 1) * (0.25 + 0.75 * fl)
                    A_open = open_.sum() * px_km2
                    if A_open > 0: irr.ravel()[pl] += open_ * min(1.0, rest / A_open)
            anchors[ci] = (slab, a)
            spr, mic, sur = (WU['ir_spr'][ci] or 0), (WU['ir_mic'][ci] or 0), (WU['ir_sur'][ci] or 0)
            tot = spr + mic + sur
            cdata[ci] = dict(slab=slab, cx=round(float(cx), 3), cz=round(float(cz), 3), area=round(area, 1),
                             irr_km2=round(A_irr, 2), mix=[round(spr / tot, 3), round(mic / tot, 3), round(sur / tot, 3)] if tot > 0 else [0, 0, 0])
        irr = np.clip(ndimage.gaussian_filter(irr, 2.0), 0, 1)
        # land texture at half resolution. Natural Earth's "greener than brown" class is cropland in the humid east but
        # mostly grassland in the arid west, where nearly all farmland is irrigated: keep it on flat land and fade it
        # west of about 102 W (the irrigated-land channel, from USGS acreage, carries the western farms).
        crop_vis = np.clip(crop + 0.45 * hay, 0, 1)
        rgba = np.clip(np.stack([urb, crop_vis, forest, irr], -1), 0, 1)
        im = Image.fromarray((rgba * 255 + 0.5).astype(np.uint8), 'RGBA')
        im.save(f'{NET}/{slab}_land.png', optimize=True)
        save_land_webp(rgba, f'{NET}/{slab}_land.webp')
        print(slab, 'land texture', rgba.shape, os.path.getsize(f'{NET}/{slab}_land.webp') // 1024, 'KB', flush=True)
    # tiny counties with no raster pixels: use the polygon's representative point for everything
    feats = {f['id']: f for f in county_features()}
    for ci in range(NC):
        if anchors[ci] is not None: continue
        f = feats[WU['id'][ci]]
        polys = [Polygon(p[0], p[1:]) for p in f['polys'] if len(p[0]) >= 3]
        g = MultiPolygon(polys) if len(polys) > 1 else polys[0]
        rp = g.representative_point()
        pts = np.array([[rp.x, rp.y]] * 4) + rng.normal(0, 0.05, (4, 2))
        anchors[ci] = (f['slab'], {k: (pts if k in ('land', 'crop', 'urban') else []) for k in TYPES})
        cdata[ci] = dict(slab=f['slab'], cx=round(rp.x, 3), cz=round(rp.y, 3), area=round(g.area * 26.37, 1), irr_km2=0, mix=[0, 0, 0])
        # rivers near the point
        r = read_rivers(f['slab']) if f['slab'] != 'hi' else None
    # nearest rivers for counties without river anchors but with surface withdrawals (within 30 km)
    from scipy.spatial import cKDTree
    RV = {s: read_rivers(s) for s in ['conus', 'ak', 'pr']}
    TR = {s: cKDTree(np.stack([RV[s]['x'], RV[s]['z']], 1)) for s in RV}
    filled = 0
    for ci in range(NC):
        slab, a = anchors[ci]
        if len(a['riv']) or slab not in RV: continue
        rr_ = RV[slab]; cx, cz = cdata[ci]['cx'], cdata[ci]['cz']
        d, k = TR[slab].query([cx, cz], k=200, distance_upper_bound=30 / Terrain(slab).km if False else 6.0)
        best = None
        for dd, kk in zip(d, k):
            if not np.isfinite(dd): break
            reach = int(np.searchsorted(rr_['start'], kk, side='right') - 1)
            score = dd - 0.8 * np.log10(rr_['q'][reach] + 1)
            if best is None or score < best[0]: best = (score, kk, reach)
        if best:
            _, kk, reach = best
            a['riv'] = [[rr_['x'][kk], rr_['z'][kk], float(rr_['q'][reach])]]
            a['ret'] = [list(downstream(rr_, kk, reach, 0.8))]
            filled += 1
    print('counties given a nearby river outside their borders:', filled)
    # ---- write anchors.bin: per county: uint8 slab, uint8 counts[7], then float32 pairs (riv has q as a third value)
    SL = {'conus': 0, 'ak': 1, 'hi': 2, 'pr': 3}
    buf = bytearray(struct.pack('<4sI', b'ANC2', NC))
    stats = collections.Counter()
    for ci in range(NC):
        slab, a = anchors[ci]
        counts = [len(a[k]) for k in TYPES]
        buf += struct.pack('<B%dB' % len(TYPES), SL[slab], *counts)
        for k in TYPES:
            for p in a[k]:
                if k == 'riv': buf += struct.pack('<fff', float(p[0]), float(p[1]), float(p[2]))
                else: buf += struct.pack('<ff', float(p[0]), float(p[1]))
            stats[k] += len(a[k])
    open(f'{NET}/anchors.bin', 'wb').write(bytes(buf))
    json.dump(cdata, open(f'{NET}/county_data.json', 'w'), separators=(',', ':'))
    print('anchors', dict(stats), len(buf) // 1024, 'KB')

main()
