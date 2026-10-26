"""Vector features for the scene: lakes & reservoirs (with surface levels), dams at reservoir outlets, power plants
(with water intakes and county-allocated water use), cities, and major canals & aqueducts."""
import json, csv, collections, numpy as np, shapely
from shapely.geometry import shape, Polygon, MultiPolygon, box, LineString, Point
from scipy.spatial import cKDTree
from scipy import ndimage
from netlib import *

OUT = f'{NET}/features.json'
WU = json.load(open('/home/claude/build/wu.json'))
CIDX = {fid: i for i, fid in enumerate(WU['id'])}

def slab_of_lonlat(lon, lat):
    if lat > 50 and lon < -129: return 'ak'
    if lon < -150 and lat < 30: return 'hi'
    if -68.5 < lon < -64 and 17 < lat < 19: return 'pr'
    if lon < -170 and lat > 50: return 'ak'
    return 'conus'

def proj_geom(slab, geom):
    """Project a lon/lat shapely geometry into scene coordinates for a slab."""
    def f(coords):
        a = np.asarray(coords)
        x, z = to_scene(slab, a[:, 0], a[:, 1]); return np.stack([x, z], 1)
    return shapely.transform(geom, f)

def slab_box(slab):
    S = SLABS[slab]; x0, y0, x1, y1 = S['rect']; ox, oy = S['offset']
    return box(x0 + ox, y0 + oy, x1 + ox, y1 + oy)

TER = {s: Terrain(s) for s in ['conus', 'ak', 'hi', 'pr']}
RIV = {s: read_rivers(s) for s in ['conus', 'ak', 'pr']}
COUNTY = {s: np.load(f'{NET}/{s}_county.npy', mmap_mode='r') for s in ['conus', 'ak', 'hi', 'pr']}

def county_at(slab, x, z):
    t = TER[slab]; fx, fy = t.px(x, z)
    i = int(np.clip(round(float(fx)), 0, t.W - 1)); j = int(np.clip(round(float(fy)), 0, t.H - 1))
    c = int(COUNTY[slab][j, i]) - 1
    if c >= 0: return c
    # nearest county pixel within ~5 px (plants on a shoreline)
    a = np.asarray(COUNTY[slab][max(0, j - 6):j + 7, max(0, i - 6):i + 7]).astype(int) - 1
    ys, xs = np.nonzero(a >= 0)
    if len(ys) == 0: return -1
    k = np.argmin((ys - min(j, 6)) ** 2 + (xs - min(i, 6)) ** 2)
    return int(a[ys[k], xs[k]])

# ------------------------------------------------------------------ lakes & reservoirs
def lakes():
    out = []
    feats = json.load(open(f'{RAW}/ne/ne_10m_lakes.geojson'))['features']
    na = json.load(open(f'{RAW}/ne/ne_10m_lakes_north_america.geojson'))['features']
    glob_geoms = [shape(f['geometry']) for f in feats]
    tree = shapely.STRtree(glob_geoms)
    allf = [(f, g, 'g') for f, g in zip(feats, glob_geoms)]
    for f in na:
        g = shape(f['geometry'])
        hits = tree.query(g)
        if any(glob_geoms[h].intersection(g).area > 0.5 * g.area for h in hits): continue
        allf.append((f, g, 'na'))
    for f, g, src in allf:
        p = f['properties']
        c = g.representative_point()
        slab = slab_of_lonlat(c.x, c.y)
        if slab == 'conus' and not (20 < c.y < 56 and -132 < c.x < -58): continue
        if slab == 'ak' and not (51 < c.y < 72): continue
        pg = shapely.make_valid(proj_geom(slab, g)).intersection(slab_box(slab))
        if pg.is_empty: continue
        pg = pg.simplify(0.03)
        if pg.area < 0.12: continue
        t = TER[slab]
        bnd = np.concatenate([np.asarray(r.coords) for poly in getattr(pg, 'geoms', [pg]) if isinstance(poly, Polygon) for r in [poly.exterior]])
        zb = t.sample(bnd[:, 0], bnd[:, 1])
        level = float(np.median(zb))
        # inside: lowest sampled point (lake beds are in ETOPO for the Great Lakes; others are flat at the surface)
        pts = []
        polys = [q for q in getattr(pg, 'geoms', [pg]) if isinstance(q, Polygon)]
        rings = []
        for q in polys:
            rings.append([np.round(np.asarray(q.exterior.coords)[:-1], 3).ravel().tolist()] + [np.round(np.asarray(h.coords)[:-1], 3).ravel().tolist() for h in q.interiors])
        name = p.get('name_en') or p.get('name') or ''
        out.append(dict(name=name, kind=p.get('featurecla', 'Lake'), dam=p.get('dam_name') or '', year=p.get('year') or 0, slab=slab,
                        level=round(level, 1), area_km2=round(pg.area * t.km ** 2, 1), rank=p.get('scalerank', 9), polys=rings,
                        cx=round(pg.representative_point().x, 3), cz=round(pg.representative_point().y, 3)))
    print('lakes', len(out), collections.Counter(l['kind'] for l in out))
    return out

# ------------------------------------------------------------------ dams at reservoir outlets
DAM_NAMES = {'Oahe': 'Oahe Dam', 'Sakakawea': 'Garrison Dam', 'Fort Peck': 'Fort Peck Dam', 'Powell': 'Glen Canyon Dam', 'Mead': 'Hoover Dam',
    'Kentucky': 'Kentucky Dam', 'Sam Rayburn': 'Sam Rayburn Dam', 'Strom Thurmond': 'J. Strom Thurmond Dam', 'Truman': 'Harry S. Truman Dam',
    'Kerr': 'John H. Kerr Dam', 'Marion': 'Santee Dam', 'Hartwell': 'Hartwell Dam', 'American Falls Reservoir': 'American Falls Dam',
    'Moultrie': 'Pinopolis Dam', 'Koocanusa': 'Libby Dam', 'Chelan': 'Lake Chelan Dam', 'Gaston': 'Gaston Dam', 'Robert S. Kerr': 'Robert S. Kerr Lock and Dam',
    'Flaming Gorge': 'Flaming Gorge Dam', 'Smith Mountain': 'Smith Mountain Dam', 'Murray': 'Saluda Dam', 'Owyhee': 'Owyhee Dam', 'Seminoe Reservoir': 'Seminoe Dam',
    'Shasta': 'Shasta Dam', 'McConaughy': 'Kingsley Dam', 'Oroville': 'Oroville Dam', 'Quabbin': 'Winsor Dam', 'Pathfinder': 'Pathfinder Dam',
    'Trinity': 'Trinity Dam', 'Boysen': 'Boysen Dam', 'Strawberry': 'Soldier Creek Dam', 'Dworshak Reservoir': 'Dworshak Dam', 'Hungry Horse': 'Hungry Horse Dam',
    'Palisades Reservoir': 'Palisades Dam', 'Navajo': 'Navajo Dam', 'Allegheny': 'Kinzua Dam', 'San Luis': 'B. F. Sisk Dam', 'Millerton': 'Friant Dam',
    'Blue Mesa': 'Blue Mesa Dam', 'Glendo Reservoir': 'Glendo Dam', 'San Carlos': 'Coolidge Dam', 'Buffalo Bill Reservoir': 'Buffalo Bill Dam',
    'Falcon International': 'Falcon Dam', 'Amistad': 'Amistad Dam', 'Walter F. George': 'Walter F. George Lock and Dam', 'Mohave': 'Davis Dam', 'Havasu': 'Parker Dam'}
def dams(lks):
    out = []
    for l in lks:
        if l['kind'] != 'Reservoir' or l['slab'] not in RIV: continue
        r = RIV[l['slab']]
        polys = [Polygon(np.array(rr[0]).reshape(-1, 2), [np.array(h).reshape(-1, 2) for h in rr[1:]]) for rr in l['polys']]
        P = MultiPolygon(polys) if len(polys) > 1 else polys[0]
        minx, minz, maxx, maxz = P.bounds
        sel = np.flatnonzero((r['x'] > minx - 1) & (r['x'] < maxx + 1) & (r['z'] > minz - 1) & (r['z'] < maxz + 1))
        if len(sel) == 0: continue
        inside = shapely.contains_xy(P, r['x'][sel], r['z'][sel])
        ins = set(sel[inside].tolist())
        best = None
        # reaches with any vertex inside; find where the main reach leaves the polygon
        owner = np.searchsorted(r['start'], sel, side='right') - 1
        cand = np.unique(owner[inside])
        for k in cand:
            s0, nv = r['start'][k], r['nv'][k]
            idx = np.arange(s0, s0 + nv)
            flag = np.array([i in ins for i in idx])
            if flag.all():
                # leaves at the start of the next reach?
                nk = r['next'][k]
                if nk < 0: continue
                j = r['start'][nk] + 1
                if j in ins: continue
                a, b = idx[-1], j
            else:
                ex = np.flatnonzero(flag[:-1] & ~flag[1:])
                if len(ex) == 0: continue
                a, b = idx[ex[-1]], idx[ex[-1] + 1]
            q = r['q'][k]
            if best is None or q > best[0]: best = (q, a, b, k)
        if best is None: continue
        q, a, b, k = best
        seg = LineString([(r['x'][a], r['z'][a]), (r['x'][b], r['z'][b])])
        hit = seg.intersection(P.boundary)
        pt = hit.centroid if not hit.is_empty else Point((r['x'][a] + r['x'][b]) / 2, (r['z'][a] + r['z'][b]) / 2)
        ang = float(np.arctan2(r['z'][b] - r['z'][a], r['x'][b] - r['x'][a]))
        nm = r['names'][r['name'][k] - 1] if r['name'][k] else ''
        dn = DAM_NAMES.get(l['name']) or l['dam']
        out.append(dict(name=dn or '', lake=l['name'], river=nm, year=l['year'], slab=l['slab'], x=round(pt.x, 3), z=round(pt.y, 3),
                        flow_dir=round(ang, 3), q=round(float(q), 1), named=bool(dn), ne_dam=bool(l['dam'])))
    print('dams', len(out), sum(d['named'] for d in out))
    return out

# ------------------------------------------------------------------ water-body distance fields for intakes
def nearest_fields(slab):
    """Indices of the nearest ocean pixel and nearest lake pixel (half resolution)."""
    t = TER[slab]
    m = np.asarray(t.mask)[::2, ::2]
    ocean = (m & 1) == 0
    lake = (m & 2) > 0
    io = ndimage.distance_transform_edt(~ocean, return_distances=False, return_indices=True) if ocean.any() else None
    il = ndimage.distance_transform_edt(~lake, return_distances=False, return_indices=True) if lake.any() else None
    return io, il

FIELDS = {}
def nearest_water(slab, x, z, kind):
    if slab not in FIELDS: FIELDS[slab] = nearest_fields(slab)
    io, il = FIELDS[slab]
    idx = io if kind == 'sea' else il
    if idx is None: return None
    t = TER[slab]; fx, fy = t.px(x, z)
    i = int(np.clip(round(float(fx) / 2), 0, idx.shape[2] - 1)); j = int(np.clip(round(float(fy) / 2), 0, idx.shape[1] - 1))
    jj, ii = idx[0][j, i], idx[1][j, i]
    wx = t.x0 + (ii * 2 + 0.5) / t.ppu; wz = t.z0 + (jj * 2 + 0.5) / t.ppu
    return float(wx), float(wz), float(np.hypot(wx - x, wz - z) * t.km)

RTREE = {}
def nearest_river(slab, x, z, qmin, maxkm=12.0):
    if slab not in RIV: return None
    r = RIV[slab]
    if slab not in RTREE: RTREE[slab] = cKDTree(np.stack([r['x'], r['z']], 1))
    owner_q = None
    t = TER[slab]
    d, k = RTREE[slab].query([x, z], k=64, distance_upper_bound=maxkm / t.km)
    best = None
    for dd, kk in zip(d, k):
        if not np.isfinite(dd): break
        reach = int(np.searchsorted(r['start'], kk, side='right') - 1)
        q = float(r['q'][reach])
        if q < qmin: continue
        # prefer close, but a much larger river slightly farther away wins
        score = dd * t.km - 2.0 * np.log10(q + 1)
        if best is None or score < best[0]: best = (score, int(kk), reach, q, dd * t.km)
    if best is None: return None
    _, kk, reach, q, km = best
    nm = r['names'][r['name'][reach] - 1] if r['name'][reach] else ''
    return dict(x=float(r['x'][kk]), z=float(r['z'][kk]), reach=reach, vert=kk, q=q, km=km, name=nm)

def downstream_point(slab, vert, reach, steps_km=4.0):
    """A point a few km downstream of a river vertex (for outfalls)."""
    r = RIV[slab]; t = TER[slab]
    x, z = r['x'][vert], r['z'][vert]; acc = 0.0; k = vert; rr = reach
    while acc < steps_km / t.km:
        end = r['start'][rr] + r['nv'][rr] - 1
        if k < end:
            nx, nz = r['x'][k + 1], r['z'][k + 1]; acc += np.hypot(nx - x, nz - z); x, z = nx, nz; k += 1
        else:
            rr = r['next'][rr]
            if rr < 0: break
            k = r['start'][rr]
    return float(x), float(z)

# ------------------------------------------------------------------ power plants
def plants():
    rows = list(csv.reader(open(f'{RAW}/Version_1.2_2015_TE_Model_Estimates.csv', encoding='latin-1')))
    hdr = rows[2]
    data = [dict(zip(hdr, r)) for r in rows[3:] if len(r) > 5 and r[0].strip()]
    num = lambda v: float(str(v).replace(',', '')) if str(v).strip() not in ('', '-nr-', '--', 'NA') else 0.0
    import unicodedata, re
    def norm(n):
        n = ''.join(c for c in unicodedata.normalize('NFKD', n) if not unicodedata.combining(c)).lower()
        n = re.sub(r'\b(county|parish|borough|census area|municipality|city and borough|municipio)\b', '', n)
        n = n.replace('saint ', 'st ').replace('st. ', 'st ').replace('.', '').replace("'", '').replace('-', ' ')
        return re.sub(r'\s+', '', n)
    byname = {}
    for i, (fid, nm, st) in enumerate(zip(WU['id'], WU['name'], WU['st'])):
        byname.setdefault((st, norm(nm)), []).append(i)
    P = []
    nm_hits = 0
    # USGS counts the water of the two big plants on the Susquehanna at Brunner Island and Peach Bottom, which stand on
    # its York County bank, in Lancaster County across the river: the 2015 county data give York County 2.1 Mgal/d for
    # power plants (all recirculating) and Lancaster County 2,525 Mgal/d (all once-through), and the only plant the model
    # places in Lancaster County is a waste-to-energy plant it estimates at 0.8 Mgal/d. Their water is divided with
    # Lancaster County's, where USGS counts it; loc_county keeps the county they stand in.
    fips_ix = {f: i for i, f in enumerate(WU['id'])}
    COUNTED_IN = {3140: '42071', 3166: '42071'}
    for d in data:
        lat, lon = num(d['LATITUDE']), num(d['LONGITUDE'])
        slab = slab_for_state(FIPS_OF.get(d['STATE'], '00'))
        x, z = to_scene(slab, lon, lat)
        c = county_at(slab, x, z)
        cands = byname.get((d['STATE'], norm(d['COUNTY'])), [])
        if len(cands) == 1:
            if cands[0] != c: nm_hits += 1
            c = cands[0]
        P.append(dict(eia=int(d['EIA_PLANT_ID']), name=d['PLANT_NAME'], st=d['STATE'], county_name=d['COUNTY'], src_name=d['NAME_OF_WATER_SOURCE'],
                      lat=lat, lon=lon, slab=slab, x=float(x), z=float(z), county=c, cooling=d['COOLING_TYPE'], gen=d['GENERATION_TYPE'],
                      wsrc=d['WATER_SOURCE_CODE'].strip(), wtype=d['WATER_TYPE_CODE'].strip(),
                      model_w=num(d['WITHDRAWAL']), model_c=num(d['CONSUMPTION']), model_w_rng=[num(d['MIN_WITHDRAWAL']), num(d['MAX_WITHDRAWAL'])],
                      model_c_rng=[num(d['MIN_CONSUMPTION']), num(d['MAX_CONSUMPTION'])], mwh=num(d['NET_GENERATION'])))
        if P[-1]['eia'] in COUNTED_IN: P[-1]['loc_county'] = c; P[-1]['county'] = fips_ix[COUNTED_IN[P[-1]['eia']]]
    print('plants re-assigned to their named county:', nm_hits)
    # county compilation totals (Mgal/d) by source, once-through (po) and recirculating (pc) combined
    F = WU['fields']; col = {k: WU[k] for k in F}
    by_county = collections.defaultdict(list)
    for p in P: by_county[p['county']].append(p)
    def srcclass(p):
        s, w = p['wsrc'], p['wtype']
        if s.startswith('GW'): return 'gs' if w in ('SA', 'BR') else 'gf'
        if s.startswith('PD'): return 'ps'
        if s == 'SW': return 'ss' if w in ('SA', 'BE', 'BR') else 'sf'
        return None
    placeholders = []
    for ci in range(len(WU['id'])):
        v = lambda k: (col[k][ci] or 0)
        src = {s: v('po_' + s) + v('pc_' + s) for s in ['gf', 'gs', 'sf', 'ss', 'rec', 'ps']}
        cu = v('po_cuf') + v('po_cus') + v('pc_cuf') + v('pc_cus')
        W = sum(src.values())   # includes reclaimed wastewater and public-supply deliveries (not withdrawals; tracked separately)
        ps = by_county.get(ci, [])
        if W <= 0:
            for p in ps: p['w'] = 0.0; p['c'] = 0.0; p['src'] = {}
            continue
        if not ps:
            placeholders.append(dict(county=ci, w=W, c=cu, src={k: round(x, 3) for k, x in src.items() if x > 0}))
            continue
        tot_model = sum(p['model_w'] for p in ps) or len(ps)
        for p in ps: p['w'] = 0.0; p['src'] = {}
        for s, vol in src.items():
            if vol <= 0: continue
            match = [p for p in ps if srcclass(p) == s] or ps
            tm = sum(p['model_w'] for p in match)
            for p in match:
                share = (p['model_w'] / tm) if tm > 0 else 1 / len(match)
                p['w'] += vol * share; p['src'][s] = p['src'].get(s, 0) + vol * share
        tc = sum(p['model_c'] for p in ps)
        for p in ps: p['c'] = cu * ((p['model_c'] / tc) if tc > 0 else (p['w'] / W))
    # intakes and outfalls
    for p in P:
        slab = p['slab']; w = p.get('w', 0) or p['model_w']
        qneed = max(0.3, 0.0438 * w * 0.5)
        p['intake'] = None; p['outfall'] = None
        sal = p['wtype'] in ('SA', 'BE', 'BR') or 'OCEAN' in p['src_name'].upper() or 'BAY' in p['src_name'].upper() or 'GULF' in p['src_name'].upper() or 'SOUND' in p['src_name'].upper()
        lake_name = any(k in p['src_name'].upper() for k in ('LAKE', 'RESERVOIR', 'POND'))
        if p['wsrc'].startswith('GW') or p['wsrc'].startswith('PD'):
            continue
        cands = []
        if sal:
            s = nearest_water(slab, p['x'], p['z'], 'sea')
            if s and s[2] < 25: cands.append(('sea', s[0], s[1], s[2]))
        lk = nearest_water(slab, p['x'], p['z'], 'lake')
        if lk and lk[2] < 10: cands.append(('lake', lk[0], lk[1], lk[2] - (6 if lake_name else 0)))
        rv = nearest_river(slab, p['x'], p['z'], qneed)
        if rv: cands.append(('river', rv['x'], rv['z'], rv['km'] - (4 if 'RIVER' in p['src_name'].upper() else 0), rv))
        if not sal:
            s = nearest_water(slab, p['x'], p['z'], 'sea')
            if s and s[2] < 4: cands.append(('sea', s[0], s[1], s[2] + 3))
        if not cands:
            rv = nearest_river(slab, p['x'], p['z'], 0.0, maxkm=8.0)
            if rv: cands.append(('river', rv['x'], rv['z'], rv['km'], rv))
        if not cands:
            p['intake'] = dict(kind='local', x=round(p['x'] + 0.25, 3), z=round(p['z'] + 0.12, 3))
            p['outfall'] = dict(kind='local', x=round(p['x'] + 0.3, 3), z=round(p['z'] - 0.1, 3))
            continue
        best = min(cands, key=lambda c: c[3])
        p['intake'] = dict(kind=best[0], x=round(best[1], 3), z=round(best[2], 3))
        # the map draws plants larger than life, so the drawn intake and outfall sit a little way up and down the
        # river (or out in the water) from the true ones, clear of the plant's symbol
        CLEAR = 0.6
        if best[0] == 'river':
            rv = best[4]
            p['intake']['river'] = rv['name']; p['intake']['q'] = round(rv['q'], 1)
            r = RIV[slab]
            if slab not in RTREE: RTREE[slab] = cKDTree(np.stack([r['x'], r['z']], 1))
            cand = RTREE[slab].query_ball_point([p['x'], p['z']], 1.4)
            def ddv_of(k):
                reach = int(np.searchsorted(r['start'], k, side='right') - 1)
                frac = (k - r['start'][reach]) / max(1, r['nv'][reach] - 1)
                return reach, r['dd'][reach] + (1 - frac) * r['lk'][reach]   # km to the outlet
            _, dd0 = ddv_of(rv['vert'])
            up, dn = None, None
            for k in cand:
                reach, ddv = ddv_of(k)
                if r['q'][reach] < 0.5 * rv['q']: continue
                d = float(np.hypot(r['x'][k] - p['x'], r['z'][k] - p['z']))
                if d < CLEAR: continue
                if ddv > dd0 and (up is None or d < up[0]): up = (d, k)
                if ddv < dd0 and (dn is None or d < dn[0]): dn = (d, k)
            if up: p['intake'].update(x=round(float(r['x'][up[1]]), 3), z=round(float(r['z'][up[1]]), 3))
            if dn: p['outfall'] = dict(kind='river', x=round(float(r['x'][dn[1]]), 3), z=round(float(r['z'][dn[1]]), 3))
            else:
                ox, oz = downstream_point(slab, rv['vert'], rv['reach'], 6.0)
                p['outfall'] = dict(kind='river', x=round(ox, 3), z=round(oz, 3))
        else:
            # push out along the line from the plant to the water while it stays over water
            t = TER[slab]
            dx, dz = best[1] - p['x'], best[2] - p['z']; L = float(np.hypot(dx, dz)) or 1.0
            ux, uz = dx / L, dz / L
            ix, iz = best[1], best[2]
            for step in np.arange(L, CLEAR + 0.6, 0.05):
                qx, qz = p['x'] + ux * step, p['z'] + uz * step
                m = int(t.mask_at(qx, qz))
                water = (m & 1) == 0 if best[0] == 'sea' else (m & 2) > 0
                if not water: break
                ix, iz = qx, qz
                if step >= CLEAR: break
            p['intake'].update(x=round(float(ix), 3), z=round(float(iz), 3))
            # outfall: the same distance out, turned 40 degrees
            ca, sa = np.cos(0.7), np.sin(0.7)
            vx, vz = ux * ca - uz * sa, ux * sa + uz * ca
            d0 = float(np.hypot(ix - p['x'], iz - p['z']))
            p['outfall'] = dict(kind=best[0], x=round(float(p['x'] + vx * d0), 3), z=round(float(p['z'] + vz * d0), 3))
    for p in P:
        sr = p.get('src') or {}
        p['w_env'] = sum(sr.get(k, 0) for k in ('gf', 'gs', 'sf', 'ss'))
    for h in placeholders: h['w_env'] = sum(h['src'].get(k, 0) for k in ('gf', 'gs', 'sf', 'ss'))
    print('environmental withdrawals allocated to plants', round(sum(p['w_env'] for p in P)), '+ placeholders', round(sum(h['w_env'] for h in placeholders)))
    tw = sum(p.get('w', 0) for p in P) + sum(h['w'] for h in placeholders)
    print('plants', len(P), 'allocated W', round(tw), 'placeholders', len(placeholders), round(sum(h['w'] for h in placeholders)),
          'no intake (SW)', sum(1 for p in P if p['intake'] is None and p['wsrc'].startswith('SW')))
    return P, placeholders

# ------------------------------------------------------------------ cities
def cities():
    d = json.load(open(f'{RAW}/ne/ne_10m_populated_places_simple.geojson'))
    out = []
    for f in d['features']:
        p = f['properties']
        if p.get('adm0_a3') not in ('USA', 'PRI', 'VIR'): continue
        lon, lat = p['longitude'], p['latitude']
        slab = slab_of_lonlat(lon, lat)
        x, z = to_scene(slab, lon, lat)
        out.append(dict(name=p['name'], st=p.get('adm1name', ''), pop=int(p.get('pop_max') or 0), rank=int(p.get('scalerank') or 9), slab=slab,
                        x=round(float(x), 3), z=round(float(z), 3), county=county_at(slab, float(x), float(z)), cap=bool(p.get('adm1cap') if 'adm1cap' in p else False)))
    print('cities', len(out))
    return out

# ------------------------------------------------------------------ canals & aqueducts (OSM), curated by region
AQ_KEEP = {  # name: (lon0, lat0, lon1, lat1, kind, operator/project)
    'California Aqueduct': (-122, 33.5, -117, 38, 'aqueduct', 'State Water Project'),
    'San Luis Canal': (-121.5, 36, -120, 37.5, 'aqueduct', 'State Water Project / Central Valley Project'),
    'East Branch': (-118.4, 33.8, -117.0, 34.8, 'aqueduct', 'State Water Project'),
    'West Branch': (-119.0, 34.3, -118.4, 35.0, 'aqueduct', 'State Water Project'),
    'South Bay Aqueduct': (-122, 37.4, -121.5, 37.9, 'aqueduct', 'State Water Project'),
    'Delta-Mendota Canal': (-121.7, 36.5, -120.0, 37.9, 'canal', 'Central Valley Project'),
    'Friant-Kern Canal': (-120, 35, -118.8, 37.2, 'canal', 'Central Valley Project'),
    'Madera Canal': (-120.4, 36.8, -119.6, 37.3, 'canal', 'Central Valley Project'),
    'Contra Costa Canal': (-122.3, 37.8, -121.5, 38.1, 'canal', 'Central Valley Project'),
    'Folsom South Canal': (-121.5, 38.2, -121.0, 38.8, 'canal', 'Central Valley Project'),
    'Corning Canal': (-122.4, 39.7, -122.0, 40.3, 'canal', 'Central Valley Project'),
    'Putah South Canal': (-122.3, 38.1, -121.8, 38.5, 'canal', 'Solano Project'),
    'Cross Valley Canal': (-119.5, 35.2, -119.0, 35.5, 'canal', 'Kern County Water Agency'),
    'Kern River Canal': (-119.5, 35.2, -119.0, 35.5, 'canal', 'Kern River'),
    'Mokelumne Aqueduct': (-122.4, 37.7, -120.6, 38.4, 'aqueduct', 'East Bay Municipal Utility District'),
    'Los Angeles Aqueduct': (-119, 34.2, -117.6, 37.6, 'aqueduct', 'Los Angeles Department of Water and Power'),
    'Second Los Angeles Aqueduct': (-119, 34.2, -117.6, 37.6, 'aqueduct', 'Los Angeles Department of Water and Power'),
    'San Diego Aqueduct': (-117.5, 32.6, -116.8, 34.0, 'aqueduct', 'San Diego County Water Authority'),
    'Colorado River Aqueduct': (-118, 33.5, -114, 34.5, 'aqueduct', 'Metropolitan Water District of Southern California'),
    'Coachella Canal': (-116.5, 32.5, -114.7, 34, 'canal', 'Coachella Valley Water District'),
    'All-American Canal': (-116, 32.5, -114.3, 33, 'canal', 'Imperial Irrigation District'),
    'All American Canal': (-116, 32.5, -114.3, 33, 'canal', 'Imperial Irrigation District'),
    'East Highline Canal': (-116, 32.5, -115, 33.5, 'canal', 'Imperial Irrigation District'),
    'Westside Main Canal': (-116, 32.5, -115, 33.5, 'canal', 'Imperial Irrigation District'),
    'Central Arizona Project Canal': (-114.5, 31.5, -110.5, 34.5, 'aqueduct', 'Central Arizona Project'),
    'Gila Gravity Main Canal': (-114.8, 32.4, -114.2, 32.9, 'canal', 'Gila Project'),
    'Yuma Main Canal': (-114.8, 32.4, -114.4, 32.9, 'canal', 'Yuma Project'),
    'Arizona Canal': (-112.4, 33.3, -111.5, 33.8, 'canal', 'Salt River Project'),
    'Grand Canal': (-112.4, 33.3, -111.5, 33.8, 'canal', 'Salt River Project'),
    'Consolidated Canal': (-112.0, 33.0, -111.5, 33.6, 'canal', 'Salt River Project'),
    'Western Canal': (-112.4, 33.2, -111.6, 33.5, 'canal', 'Salt River Project'),
    'Highline Canal': (-112.4, 33.2, -111.6, 33.5, 'canal', 'Salt River Project'),
    'Roza Canal': (-120.8, 46.1, -119.4, 46.9, 'canal', 'Yakima Project'),
    'Sunnyside Canal': (-120.8, 46.1, -119.4, 46.9, 'canal', 'Yakima Project'),
    'East Low Canal': (-119.6, 46.6, -118.7, 47.6, 'canal', 'Columbia Basin Project'),
    'Main Canal': (-119.6, 46.6, -118.7, 47.9, 'canal', 'Columbia Basin Project'),
    'West Canal': (-119.9, 46.6, -118.9, 47.6, 'canal', 'Columbia Basin Project'),
    'Twin Falls Main Canal': (-115.2, 42.2, -113.8, 42.8, 'canal', 'Twin Falls Canal Company'),
    'Truckee Canal': (-119.7, 39.3, -118.8, 39.8, 'canal', 'Newlands Project'),
    'Tri-County Supply Canal': (-101.2, 40.4, -99.5, 41.3, 'canal', 'Central Nebraska Public Power and Irrigation District'),
    'Sutherland Supply Canal': (-101.6, 40.9, -100.9, 41.3, 'canal', 'Nebraska Public Power District'),
    'Franklin Canal': (-106.7, 31.4, -106.0, 32.0, 'canal', 'El Paso County Water Improvement District No. 1'),
    'Riverside Canal': (-106.7, 31.3, -105.8, 32.0, 'canal', 'El Paso County Water Improvement District No. 1'),
    'American Canal': (-106.6, 31.6, -106.3, 31.9, 'canal', 'International Boundary and Water Commission'),
    'Rio Grande Canal': (-106.6, 37.5, -106.0, 38.0, 'canal', 'Rio Grande Water Users'),
    'Catskill Aqueduct': (-74.5, 40.8, -73.6, 42.1, 'aqueduct', 'New York City DEP'),
    'Delaware Aqueduct': (-75.0, 40.8, -73.6, 42.0, 'aqueduct', 'New York City DEP'),
    'New Croton Aqueduct': (-74.1, 40.7, -73.7, 41.3, 'aqueduct', 'New York City DEP'),
}
def aqueducts():
    o = json.load(open(f'{RAW}/osm_aqueducts_canals.json'))['elements']
    groups = collections.defaultdict(list)
    for e in o:
        t = e.get('tags') or {}
        nm = t.get('name')
        if nm not in AQ_KEEP or not e.get('geometry'): continue
        lon0, lat0, lon1, lat1, kind, op = AQ_KEEP[nm]
        pts = np.array([[p['lon'], p['lat']] for p in e['geometry']])
        inb = (pts[:, 0] >= lon0) & (pts[:, 0] <= lon1) & (pts[:, 1] >= lat0) & (pts[:, 1] <= lat1)
        if inb.mean() < 0.5: continue
        if t.get('waterway') in ('stream', 'river', 'drain'): continue
        under = t.get('location') == 'underground' or t.get('tunnel') in ('yes', 'culvert', 'flooded') or t.get('waterway') == 'pressurised'
        nm2 = 'All-American Canal' if nm == 'All American Canal' else nm
        groups[nm2].append((pts, under))
    out = []
    for nm, ws in groups.items():
        lon0, lat0, lon1, lat1, kind, op = AQ_KEEP[nm]
        segs = []
        total = 0.0
        for pts, under in ws:
            slab = slab_of_lonlat(pts[0, 0], pts[0, 1])
            x, z = to_scene(slab, pts[:, 0], pts[:, 1])
            ls = LineString(np.stack([x, z], 1)).simplify(0.02)
            c = np.asarray(ls.coords)
            if len(c) < 2: continue
            total += ls.length * TER[slab].km
            segs.append(dict(u=bool(under), p=np.round(c, 3).ravel().tolist()))
        out.append(dict(name=nm, kind=kind, op=op, km=round(total), segs=segs, slab='conus'))
    # aqueducts OpenStreetMap maps only in pieces come from the National Hydrography Dataset (bake_nhd_aqueducts.py)
    from bake_nhd_aqueducts import nhd_override
    nhd = {'Colorado River Aqueduct': f'{RAW}/nhd_colorado_river_aqueduct.json', 'Los Angeles Aqueduct': f'{RAW}/nhd_los_angeles_aqueduct.json',
           'Delta-Mendota Canal': f'{RAW}/nhd_delta_mendota_canal.json'}
    nhd_override(out, {k: v for k, v in nhd.items() if os.path.exists(v)})
    print('aqueducts', len(out), sorted((a['name'], a['km'], len(a['segs'])) for a in out))
    return out

def main():
    L = lakes(); D = dams(L); P, PH = plants(); C = cities(); A = aqueducts()
    # county centroids (scene) for placeholders
    feats = county_features()
    cent = {}
    for f in feats:
        ci = CIDX.get(f['id'])
        if ci is None: continue
        polys = [Polygon(p[0], p[1:]) for p in f['polys'] if len(p[0]) >= 3]
        g = MultiPolygon(polys) if len(polys) > 1 else polys[0]
        rp = g.representative_point(); cent[ci] = (round(rp.x, 3), round(rp.y, 3), f['slab'])
    for h in PH:
        x, z, s = cent.get(h['county'], (0, 0, 'conus')); h.update(x=x, z=z, slab=s)
    for p in P:
        for k in ('w', 'c', 'w_env'): p[k] = round(p.get(k, 0.0), 3)
        p['src'] = {k: round(v, 3) for k, v in (p.get('src') or {}).items()}
        p['x'] = round(p['x'], 3); p['z'] = round(p['z'], 3)
    json.dump(dict(lakes=L, dams=D, plants=P, te_placeholders=PH, cities=C, aqueducts=A), open(OUT, 'w'), separators=(',', ':'))
    print('wrote', OUT, os.path.getsize(OUT))

main()
