"""Roadside commerce: fuel canopies measured from the 2021 lidar, and generic
category signs for the town's listed businesses.

Every canopy outline and deck height comes from the USGS 2021 class-6 upper
returns (0.5 m cells) that the building footprints never captured; each one
was checked against the 2025 MassGIS aerial. Pump-island layout, price-sign
position, prices, palettes and all sign placement are authored.

Signs carry only a generic word for what a business sells or does ("PIZZA",
"AUTO PARTS"), chosen per business ID below. No business name, brand, logo,
wordmark or house colour scheme is reproduced, and a test rejects any sign
text containing a listed name or brand.

Run from the repository root with WEBSTER_SOURCE pointing at the webster-blender
project (research/ and townwide/ are read; nothing there is written).
"""
import gzip, hashlib, json, math, os, re
from pathlib import Path
import numpy as np
from PIL import Image
from pyproj import Transformer
from scipy import ndimage
from shapely.geometry import LineString, MultiPoint, Point, Polygon, shape
from shapely.ops import transform as reproject
from shapely.prepared import prep
from shapely.strtree import STRtree

ROOT = Path(__file__).resolve().parents[1]
SOURCE = Path(os.environ.get('WEBSTER_SOURCE', '/Users/andy/Documents/New project/webster-blender'))
OUT = ROOT / 'data/derived/town/roadside-commerce.json'
read = lambda p: json.loads(Path(p).read_bytes())
sha = lambda p: hashlib.sha256(Path(p).read_bytes()).hexdigest()
ORIGIN = (171282.3328920724, 867589.2761750807)
TILE = 250.0
_to6491 = Transformer.from_crs(4326, 6491, always_xy=True)

def local(geom):
    def f(x, y, z=None):
        e, n = _to6491.transform(x, y)
        return np.asarray(e) - ORIGIN[0], np.asarray(n) - ORIGIN[1]
    return reproject(f, geom)

def tile_of(e, n):
    return f'{math.floor(e / TILE)}_{math.floor(n / TILE)}'

r2 = lambda v: round(float(v), 2)
r3 = lambda v: round(float(v), 3)

# ---------------------------------------------------------------- inputs
research = SOURCE / 'research/data'
businesses = read(research / 'businesses.json')['records']
parcels = []
for f in read(research / 'parcels-current.geojson')['features']:
    try: parcels.append((local(shape(f['geometry'])), f['properties']))
    except Exception: pass
parcel_tree = STRtree([p for p, _ in parcels])
buildings = []
for f in read(research / 'buildings-current.geojson')['features']:
    try: buildings.append(local(shape(f['geometry'])))
    except Exception: pass
building_tree = STRtree(buildings)
network = json.load(gzip.open(ROOT / 'data/derived/town/engine-network.json.gz'))
commercial = read(ROOT / 'data/derived/town/commercial-completion.json')
release = read(ROOT / 'data/derived/town/release.json')
assets = ROOT / 'public/town-assets' / release['directory']
manifest = read(assets / 'manifest.json')
roof_index = read(SOURCE / 'townwide/roof_index.json')

def normalize(address):
    a = address.upper().replace('’', "'").replace('–', '-').split(',')[0]
    for word, short in (('STREET', 'ST'), ('ROAD', 'RD'), ('AVENUE', 'AVE'), ('PARKWAY', 'PKWY'), ('DRIVE', 'DR')):
        a = re.sub(rf'\b{word}\b', short, a)
    return re.sub(r'\s+', ' ', a).strip()

def address_keys(address):
    m = re.match(r'^(\d+)([A-Z]?)(?:-(\d+))?(?:\s*R)?\s+(.*)$', address)
    if not m: return {address}
    lo, hi = int(m.group(1)), int(m.group(3) or m.group(1))
    return {f'{n} {m.group(4)}' for n in range(lo, hi + 1)}

parcels_by_address = {}
for p, props in parcels:
    if props.get('SITE_ADDR'):
        for k in address_keys(normalize(props['SITE_ADDR'])): parcels_by_address.setdefault(k, []).append(p)

# Streets by name; directed edges share one centreline.
streets = {}
seen = set()
for e in network['edges']:
    pid = e.get('physical_id', e['id'])
    if pid in seen or len(e['points']) < 2: continue
    seen.add(pid)
    streets.setdefault(e.get('name') or '', []).append((LineString([p[:3] for p in e['points']]), float(e.get('width_m') or 7), e))

street_lines = [(line, width) for name in streets for line, width, _ in streets[name]]
street_tree = STRtree([line for line, _ in street_lines])

STREET_NAMES = {'EAST MAIN ST': 'EAST MAIN STREET', 'MAIN ST': 'MAIN STREET', 'THOMPSON RD': 'THOMPSON ROAD', 'WORCESTER RD': 'WORCESTER ROAD',
                'GORE RD': 'GORE ROAD', 'SOUTH MAIN ST': 'SOUTH MAIN STREET', 'LAKE ST': 'LAKE STREET', 'SUTTON RD': 'SUTTON ROAD',
                'SCHOOL ST': 'SCHOOL STREET', 'PARK AVE': 'PARK AVENUE', 'LINCOLN ST': 'EAST MAIN STREET', 'TOWN FOREST RD': 'TOWN FOREST ROAD'}

# ------------------------------------------------------- land-cover masks
paved_index = read(ROOT / 'data/derived/town/paved-surfaces-index.json')
_masks = {}
def cover_share(e, n, channel):
    """Share of one land-cover class (0 lawn, 1 canopy, 2 paved, 3 soil) at a
    point, from the finished paved-surface mask where one exists, or None."""
    tile = tile_of(e, n)
    m = paved_index['masks'].get(tile) or manifest['surfaces']['masks'].get(tile)
    if not m: return None
    if tile not in _masks:
        path = ROOT / 'public' / m['url'].lstrip('/') if m['url'].startswith('/') else assets / m['url']
        _masks[tile] = np.asarray(Image.open(path))
    im = _masks[tile]; minx, minz, maxx, maxz = m['bounds']; h, w = im.shape[:2]
    x = int((e - minx) / (maxx - minx) * w); y = int((-n - minz) / (maxz - minz) * h)
    if not (0 <= x < w and 0 <= y < h): return None
    px = im[y, x].astype(float)
    total = px[:4].sum()
    return px[channel] / total if total > 0 else None

lawn_share = lambda e, n: cover_share(e, n, 0)
paved_share = lambda e, n: cover_share(e, n, 2)

# ------------------------------------------------------ canopies (lidar)
lidar_x, lidar_y, lidar_z = [], [], []
for t in roof_index['tiles']:
    path = SOURCE / 'townwide' / t['file']
    if path.exists():
        z = np.load(path); lidar_x.append(z['x']); lidar_y.append(z['y']); lidar_z.append(z['z'])
LX, LY, LZ = (np.concatenate(v) for v in (lidar_x, lidar_y, lidar_z))

def measured_canopy(e0, n0, half, band=0.6, cell=0.5):
    """Minimum rectangle of the flat top of the class-6 structure at a seed."""
    m = (np.abs(LX - e0) < half) & (np.abs(LY - n0) < half)
    x, y, z = LX[m], LY[m], LZ[m]
    if len(x) < 40: raise SystemExit(f'No lidar returns at canopy seed {e0},{n0}; stage its roof tile.')
    size = int(2 * half / cell) + 1
    ix = ((x - (e0 - half)) / cell).astype(int); iy = ((y - (n0 - half)) / cell).astype(int)
    occupied = np.zeros((size, size), bool); occupied[iy, ix] = True
    labels, _ = ndimage.label(ndimage.binary_closing(occupied, iterations=1))
    li = labels[iy, ix]; own = li == li[np.argmin(np.hypot(x - e0, y - n0))]
    top = np.percentile(z[own], 90); deck = own & (z > top - band)
    rect = MultiPoint(np.c_[x[deck], y[deck]]).minimum_rotated_rectangle
    corners = np.array(rect.exterior.coords)[:4]
    sides = [corners[1] - corners[0], corners[2] - corners[1]]
    long_side = max(sides, key=np.linalg.norm); short_side = min(sides, key=np.linalg.norm)
    axis = long_side / np.linalg.norm(long_side)
    if axis[0] < 0 or (abs(axis[0]) < 1e-6 and axis[1] < 0): axis = -axis
    return dict(centre=corners.mean(0), axis=axis, length=float(np.linalg.norm(long_side)), width=float(np.linalg.norm(short_side)),
                top=float(np.percentile(z[deck], 90)), returns=int(deck.sum()))

# Seeds are the canopy structures the lidar detector found beside the six
# fuel parcels (assessor fuel/gasoline service use); each outline agrees with
# the white canopy roof in the 2025 aerial. 65 East Main keeps its 1949
# garage without pumps: it is used for auto sales and no pumps are mapped.
# Stripe palettes (0 navy, 1 maroon, 2 green, 3 slate) are chosen so that no
# station wears its operator's brand colours.
STATIONS = [
    # id, address, seed east/north, search half-size, price-sign street, store building (row id), store words, palette
    ('FUEL-137-EAST-MAIN', '137 East Main Street', (-1437, 233), 20, 'EAST MAIN STREET', '169828_867842', ['FOOD MART'], 3),
    ('FUEL-74-EAST-MAIN', '74 East Main Street', (-1935, -118), 15, 'EAST MAIN STREET', '169349_867467', ['FOOD MART'], 1),
    ('FUEL-88-EAST-MAIN', '88 East Main Street', (-1800, -42), 8, 'EAST MAIN STREET', '169492_867542', ['AUTO SERVICE'], 0),
    ('FUEL-144-THOMPSON', '144 Thompson Road', (-1357, -1418), 12, 'THOMPSON ROAD', '169912_866162', ['FOOD MART', 'COFFEE'], 2),
    ('FUEL-188-GORE', '188 Gore Road', (573, -485), 20, 'GORE ROAD', '171836_867085', ['COFFEE', 'SUBS'], 1),
    ('FUEL-80-MAIN', '80 Main Street', (-3206, -1017), 15, 'MAIN STREET', '168068_866552', ['CAR WASH'], 0),
]

# ------------------------------------------------------------ sign copy
# Generic words only, reviewed by hand for each listed business. Styles index
# SIGN_STYLES in src/lib/town/roadside-commerce.ts. Businesses left out are
# institutions with their own landmark treatment, unconfirmed categories, or
# depots with no public frontage.
COPY = {
    'BIZ-0001': ('CAFE', 5), 'BIZ-0002': ('BOOKS & CAFE', 5), 'BIZ-0003': ('INSURANCE', 2), 'BIZ-0004': ('PRINTING & SIGNS', 7),
    'BIZ-0005': ('STAFFING', 2), 'BIZ-0006': ('COMPUTER REPAIR', 9), 'BIZ-0008': ('MASSAGE', 9), 'BIZ-0009': ('RESTAURANT', 8),
    'BIZ-0010': ('FITNESS', 9), 'BIZ-0012': ('DANCE STUDIO', 9), 'BIZ-0014': ('FLORIST', 3), 'BIZ-0016': ('HOME DECOR', 5),
    'BIZ-0017': ('ITALIAN RESTAURANT', 8), 'BIZ-0018': ('CHIROPRACTIC', 2), 'BIZ-0019': ('SALON & SPA', 9), 'BIZ-0020': ('PHYSICAL THERAPY', 2),
    'BIZ-0022': ('CABINETS', 3), 'BIZ-0023': ('GIFTS', 5), 'BIZ-0025': ('NEW & USED CARS', 2), 'BIZ-0026': ('BANK', 2),
    'BIZ-0027': ('CREDIT UNION', 2), 'BIZ-0028': ('SUPERMARKET', 3), 'BIZ-0029': ('COFFEE & DONUTS', 6), 'BIZ-0031': ('COFFEE & DONUTS', 6),
    'BIZ-0032': ('TACOS & CHICKEN', 0), 'BIZ-0033': ('PHARMACY', 1), 'BIZ-0034': ('PHARMACY', 1), 'BIZ-0035': ('BANK', 2),
    'BIZ-0039': ('PIZZA', 0), 'BIZ-0040': ('CAFE', 5), 'BIZ-0041': ('VARIETY STORE', 7), 'BIZ-0042': ('BOWLING', 0),
    'BIZ-0043': ('AUTO PARTS', 4), 'BIZ-0044': ('AUTO PARTS', 4), 'BIZ-0045': ('PIZZA & SUBS', 1), 'BIZ-0046': ('PIZZA', 0),
    'BIZ-0051': ('ANIMAL SHELTER', 9), 'BIZ-0052': ('COLLISION REPAIR', 4), 'BIZ-0053': ('PRINTING', 7), 'BIZ-0054': ('FUNERAL HOME', 8),
    'BIZ-0055': ('PEST CONTROL', 7), 'BIZ-0064': ('BURGERS', 3), 'BIZ-0065': ('THAI & SUSHI', 8), 'BIZ-0066': ('BREAKFAST', 5),
    'BIZ-0067': ('TIRES', 4), 'BIZ-0068': ('RENT TO OWN', 2), 'BIZ-0069': ('HARDWARE', 3), 'BIZ-0070': ('DISCOUNT STORE', 7),
    'BIZ-0071': ('USED CARS', 4), 'BIZ-0072': ('PAINTBALL', 4), 'BIZ-0073': ('AUTO PARTS', 4), 'BIZ-0074': ('BANK', 2),
    'BIZ-0075': ('INSURANCE', 2), 'BIZ-0084': ('DENTAL', 2), 'BIZ-0085': ('ORTHODONTICS', 9), 'BIZ-0086': ('DENTAL', 2),
    'BIZ-0087': ('SHAKES & SMOOTHIES', 9), 'BIZ-0088': ('RESTAURANT & PIZZA', 8), 'BIZ-0089': ('CHINESE FOOD', 0), 'BIZ-0090': ('COFFEE & DONUTS', 6),
    'BIZ-0092': ('MEXICAN GRILL', 0), 'BIZ-0093': ('CHINESE FOOD', 0), 'BIZ-0094': ('PIZZA', 0), 'BIZ-0095': ('PET SUPPLY', 9),
    'BIZ-0096': ('DRIVING SCHOOL', 7), 'BIZ-0100': ('FUNERAL HOME', 8), 'BIZ-0101': ('FUNERAL HOME', 8), 'BIZ-0102': ('RESTAURANT', 8),
    'BIZ-0103': ('DISPENSARY', 3), 'BIZ-0104': ('DISPENSARY', 3), 'BIZ-0105': ('BANK', 2), 'BIZ-0106': ('CONVENIENCE', 7),
    'BIZ-0107': ('TRAVEL & INSURANCE', 2), 'BIZ-0108': ('PIZZA', 1), 'BIZ-0109': ('USED CARS', 4), 'BIZ-0110': ('INSURANCE', 2),
    'BIZ-0111': ('ANIMAL HOSPITAL', 9), 'BIZ-0113': ('VETERINARY', 9), 'BIZ-0114': ('BAR & GRILL', 8), 'BIZ-0115': ('SALON', 9),
    'BIZ-0116': ('MARTIAL ARTS', 7), 'BIZ-0117': ('CARS & TRUCKS', 2), 'BIZ-0119': ('BURGERS', 0), 'BIZ-0120': ('GIFTS', 5),
    'BIZ-0121': ('PET GROOMING', 9), 'BIZ-0129': ('FUNERAL HOME', 8), 'BIZ-0130': ('TAQUERIA', 0), 'BIZ-0131': ('BAKERY', 5),
    'BIZ-0132': ('JEWELRY', 8), 'BIZ-0133': ('DINER', 5), 'BIZ-0134': ('LIQUORS', 3), 'BIZ-0135': ('LIQUORS', 3),
    'BIZ-0136': ('WINE & LIQUORS', 3), 'BIZ-0137': ('LIQUORS', 3), 'BIZ-0138': ('CONVENIENCE', 7), 'BIZ-0139': ('AUTO REPAIR', 4),
    'BIZ-0140': ('CONVENIENCE', 7), 'BIZ-0141': ('BARBER', 7), 'BIZ-0142': ('BAKERY CAFE', 5), 'BIZ-0143': ('NUTRITION', 9),
}
# Street-facing drive-through lanes named in each business's own listing.
DRIVE_THROUGH = {'BIZ-0026', 'BIZ-0027', 'BIZ-0031', 'BIZ-0032', 'BIZ-0033', 'BIZ-0064', 'BIZ-0074', 'BIZ-0087', 'BIZ-0119'}
MONUMENT = {'BIZ-0003', 'BIZ-0018', 'BIZ-0026', 'BIZ-0027', 'BIZ-0035', 'BIZ-0054', 'BIZ-0074', 'BIZ-0075', 'BIZ-0084', 'BIZ-0085',
            'BIZ-0086', 'BIZ-0100', 'BIZ-0101', 'BIZ-0105', 'BIZ-0110', 'BIZ-0111', 'BIZ-0113', 'BIZ-0129'}
# Parcel records file some plaza tenants under the plaza's own number.
ADDRESS_ALIAS = {'116 EAST MAIN ST': '114 EAST MAIN ST', '118 EAST MAIN ST': '114 EAST MAIN ST'}
# Listed on the road the pylon faces, where the parcel fronts two streets.
FRONTAGE_STREET = {'BIZ-0101': 'EAST MAIN STREET'}

# ----------------------------------------------------- buildings & frames
rows = commercial['rows']
row_polygons = [(r, Polygon(r['outline'])) for r in rows]
rows_by_id = {r['id']: r for r in rows}

def outline_walls(r, min_width=5.0):
    """Accepted facade frames (with their shallow skin), then plain outline edges."""
    walls = [dict(start=f['start'], tangent=f['tangent'], outward=f['outward'], width=f['width'], floor=f['floor'], top=f['top'], recipe=f['recipe'],
                  stories=f.get('stories', 1), frame=f['id'], row=r['id'], skin=True) for f in r['frames']]
    pts = r['outline']; area = sum(pts[i][0] * pts[(i + 1) % len(pts)][1] - pts[(i + 1) % len(pts)][0] * pts[i][1] for i in range(len(pts)))
    for i in range(len(pts)):
        a, c2 = np.array(pts[i]), np.array(pts[(i + 1) % len(pts)]); d = c2 - a; w = np.linalg.norm(d)
        if w < min_width: continue
        t = d / w; out = np.array([t[1], -t[0]]) if area > 0 else np.array([-t[1], t[0]])
        if any(abs(np.dot(np.array(x['start']) - a, out)) < 1 and abs(np.dot(x['tangent'], t)) > 0.95 for x in walls): continue
        walls.append(dict(start=a.tolist(), tangent=t.tolist(), outward=out.tolist(), width=float(w), floor=r['floor'], top=r['eave'], recipe='plaza',
                          stories=1, frame=None, row=r['id'], skin=False))
    return walls

def facing_wall(r, toward):
    """The storefront wall that faces a point (a station's pumps)."""
    def score(w):
        mid = np.array(w['start']) + np.array(w['tangent']) * w['width'] / 2
        d = np.array(toward) - mid; d /= np.linalg.norm(d) + 1e-9
        return float(np.dot(w['outward'], d)) * min(w['width'], 12)
    return max(outline_walls(r), key=score)

def business_sites(b):
    """Parcel polygons and game commercial rows for one business."""
    address = normalize(b['street_address'])
    address = ADDRESS_ALIAS.get(address, address)
    keys = address_keys(address)
    found = [p for k in keys for p in parcels_by_address.get(k, [])]
    # A mapped community point (name + address corroborated) locates tenants
    # the assessor files under another number.
    for ref in b.get('community_map_references') or []:
        pt = local(Point(ref['longitude'], ref['latitude']))
        for i in parcel_tree.query(pt):
            if parcels[i][0].contains(pt): found.append(parcels[i][0])
    matched = []
    for p in found:
        for r, poly in row_polygons:
            if p.intersection(poly).area > 0.3 * poly.area and r not in matched: matched.append(r)
    return found, matched

def street_for(b):
    if b['id'] in FRONTAGE_STREET: return FRONTAGE_STREET[b['id']]
    a = normalize(b['street_address']); m = re.match(r'^[\dA-Z-]+(?:\s*R)?\s+(.*)$', a)
    return STREET_NAMES.get(m.group(1) if m else '', None)

def nearest_on(street, point, within=90):
    best = None
    for line, width, edge in streets.get(street, []):
        d = line.distance(point)
        if d < within and (best is None or d < best[0]): best = (d, line, width)
    return best

avoid = []

def frontage_point(street, target, parcel_union, placed, clear=2.6, setback=3.4, reach=26):
    """A roadside spot inside the lot, clear of buildings and of other signs.
    Prefers the verge's lawn, then a spot level with the building."""
    hit = nearest_on(street, target)
    if not hit: return None
    _, line, width = hit
    s0 = line.project(target); p = line.interpolate(s0)
    a, c = line.interpolate(max(0, s0 - 2)), line.interpolate(min(line.length, s0 + 2))
    t = np.array([c.x - a.x, c.y - a.y]); t /= np.linalg.norm(t)
    toward = np.array([target.x - p.x, target.y - p.y])
    side = 1.0 if toward @ np.array([-t[1], t[0]]) > 0 else -1.0
    normal = side * np.array([-t[1], t[0]])
    candidates = []
    for s in np.arange(-reach, reach + 0.1, 1.0):
        for off in (setback, setback + 1.5, setback + 3, setback + 5, setback + 7.5):
            q = np.array([p.x, p.y]) + t * s + normal * (width / 2 + off)
            pt = Point(q)
            if parcel_union is not None and not parcel_union.buffer(-0.6).contains(pt): continue
            if any(buildings[i].distance(pt) < clear for i in building_tree.query(pt.buffer(clear))): continue
            if any(np.hypot(*(q - np.array(o))) < 9 for o in placed): continue
            if any(a.distance(pt) < 1.5 for a in avoid): continue
            if any(street_lines[i][0].distance(pt) < street_lines[i][1] / 2 + 1.8 for i in street_tree.query(pt.buffer(12))): continue
            lawn = lawn_share(*q) or 0
            candidates.append((lawn > 0.5, -abs(s) - 0.4 * off, q))
    if not candidates: return None
    candidates.sort(key=lambda c: (c[0], c[1]), reverse=True)
    q = candidates[0][2]
    road = line.interpolate(line.project(Point(q)))
    return [r2(q[0]), r2(q[1])], [r3(t[0]), r3(t[1])], r2(road.z)

# ------------------------------------------------------------ stations
stations, signs, placed = [], [], []
fuel_parcels = set()
measured = {}
for sid, address, seed, half, street, store_row, store_words, palette in STATIONS:
    c = measured_canopy(*seed, half); measured[sid] = c
    a, b = c['axis'], np.array([-c['axis'][1], c['axis'][0]])
    avoid.append(Polygon([c['centre'] + a * c['length'] / 2 * i + b * c['width'] / 2 * j for i, j in ((-1, -1), (1, -1), (1, 1), (-1, 1))]))
for sid, address, seed, half, street, store_row, store_words, palette in STATIONS:
    c = measured[sid]
    L, W = c['length'], c['width']
    rows_, cols = max(1, int((W + 2) // 8)), max(1, int((L + 1) // 7.2))
    target = Point(*c['centre'])
    parcel = next((p for p, props in parcels if p.contains(target)), None)
    if parcel is not None: fuel_parcels.add(id(parcel))
    at = frontage_point(street, target, parcel, placed, clear=2.2)
    if not at: raise SystemExit(f'No price-sign position for {sid}')
    placed.append(at[0])
    seed_value = int(hashlib.sha256(sid.encode()).hexdigest()[:8], 16)
    regular = 3.09 + (seed_value % 5) * 0.04
    prices = [regular, regular + 0.60, regular + 0.50] if rows_ * cols >= 3 else [regular, regular + 0.60]
    station = dict(id=sid, address=address, tileId=tile_of(*c['centre']), centre=[r2(v) for v in c['centre']], axis=[r3(v) for v in c['axis']],
                   length=r2(L), width=r2(W), top=r2(c['top']), rows=rows_, cols=cols, palette=palette,
                   prices=[f'{p:.2f}' for p in prices], priceSign=dict(at=at[0], along=at[1], z=at[2], tileId=tile_of(*at[0])),
                   lidarReturns=c['returns'])
    # Where the building footprint was traced over the canopy as well, the
    # game's body for that building is rebuilt without the canopy's part.
    store = rows_by_id[store_row]; outline = Polygon(store['outline'])
    a_, b_ = np.array(c['axis']), np.array([-c['axis'][1], c['axis'][0]])
    deck = Polygon([c['centre'] + a_ * L / 2 * i + b_ * W / 2 * j for i, j in ((-1, -1), (1, -1), (1, 1), (-1, 1))])
    if outline.intersection(deck).area > 0.4 * deck.area:
        body = outline.difference(deck.buffer(0.3, join_style=2))
        if body.geom_type != 'Polygon': body = max(body.geoms, key=lambda g: g.area)
        body = body.simplify(0.05)
        station['carve'] = dict(id=store['id'], outline=[[r2(x), r2(y)] for x, y in store['outline']], base=r2(store['base']), peak=r2(store['peak']),
                                eave=r2(store['eave']), body=[[r2(x), r2(y)] for x, y in list(body.exterior.coords)[:-1]])
    stations.append(station)
    wall = facing_wall(rows_by_id[store_row], c['centre'])
    signs.append(dict(kind='wall', wall=wall, words=store_words, style=7, businesses=[], station=sid))

# ------------------------------------------------------- business signs
by_site = {}
for b in businesses:
    if b['id'] not in COPY: continue
    found, matched = business_sites(b)
    key = tuple(sorted(r['id'] for r in matched)) or tuple(sorted({round(p.centroid.x) * 100000 + round(p.centroid.y) for p in found})) or (b['id'],)
    site = by_site.setdefault(key, dict(businesses=[], parcels=[], rows=matched, street=street_for(b)))
    site['businesses'].append(b); site['parcels'] += found

def wall_placements(site):
    """Street-facing storefront walls: accepted facade frames first, then long
    outline edges facing the same street (plaza fronts)."""
    walls = []
    for r in site['rows']:
        candidates = outline_walls(r, 14)
        walls += [w for w in candidates if w['skin']]
        if len(site['businesses']) > 1 and site['street']:
            hit = nearest_on(site['street'], Polygon(r['outline']).centroid, 160)
            for w in candidates:
                if w['skin']: continue
                mid = Point(*(np.array(w['start']) + np.array(w['tangent']) * w['width'] / 2))
                if hit:
                    q = hit[1].interpolate(hit[1].project(mid)); toward = np.array([q.x - mid.x, q.y - mid.y]); toward /= np.linalg.norm(toward) + 1e-9
                    if np.dot(w['outward'], toward) < 0.35: continue
                walls.append(w)
    return walls

for key, site in sorted(by_site.items(), key=lambda kv: kv[1]['businesses'][0]['id']):
    words = []
    for b in site['businesses']:
        w, style = COPY[b['id']]
        if (w, style) not in words: words.append((w, style))
    ids = [b['id'] for b in site['businesses']]
    fuel = any(id(p) in fuel_parcels for p in site['parcels'])
    # Wall signs over storefront bays.
    walls = wall_placements(site)
    if walls:
        remaining = list(site['businesses'])
        for wall in sorted(walls, key=lambda w: -w['width']):
            if not remaining: break
            bays = max(1, min(len(remaining), int(wall['width'] // 7)))
            chunk, remaining = remaining[:bays], remaining[bays:]
            signs.append(dict(kind='wall', wall=wall, words=[COPY[b['id']][0] for b in chunk], style=[COPY[b['id']][1] for b in chunk], businesses=[b['id'] for b in chunk]))
    # One roadside sign per site on the listed street (station sites carry the price sign instead).
    if fuel or not site['street']: continue
    targets = [Polygon(r['outline']).centroid for r in site['rows']] or [p.centroid for p in site['parcels']]
    if not targets: continue
    union = None
    for p in site['parcels']: union = p if union is None else union.union(p)
    at = frontage_point(site['street'], targets[0], union, placed)
    if not at: continue
    placed.append(at[0])
    monument = all(b in MONUMENT for b in ids)
    panels = [dict(text=w, style=s) for w, s in words[:4]]
    if any(b in DRIVE_THROUGH for b in ids) and len(panels) < 4: panels.append(dict(text='DRIVE-THRU', style=7))
    signs.append(dict(kind='monument' if monument else 'pylon', at=at[0], along=at[1], z=at[2], panels=panels, businesses=ids))

# --------------------------------------------------- storefront parking
# Head-in stall rows in front of each storefront: a walk, the first row, a
# two-way aisle, then a double row where the lot runs that deep. Every stall
# must lie on mapped paving inside the lot, clear of buildings, canopies,
# streets and the lots that already have finished parking.
lot_polygons = []
for asset in paved_index['lotAssets'].values():
    for lot in read(ROOT / 'public' / asset['url'].lstrip('/'))['lots']:
        for poly in lot['polygons']: lot_polygons.append(Polygon(poly[0], poly[1:]))
lot_tree = STRtree(lot_polygons)
STALL_W, STALL_D, WALK, AISLE = 2.75, 5.5, 2.2, 7.2

_placed_cells = {}
_canopy_zones = [prep(a.buffer(1.0)) for a in avoid]

def stall_ok(poly, union_zone):
    """`union_zone` is the lot (parcels grown 0.5 m) prepared for tests."""
    points = list(poly.exterior.coords)[:4] + [poly.centroid.coords[0]]
    if not all((paved_share(*q) or 0) > 0.55 for q in points): return False
    if union_zone is not None and not union_zone.contains(poly): return False
    grown = poly.buffer(0.4)
    if len(building_tree.query(grown, predicate='intersects')): return False
    if any(z.intersects(poly) for z in _canopy_zones): return False
    if any(street_lines[i][0].distance(poly) < street_lines[i][1] / 2 + 2.2 for i in street_tree.query(poly, predicate='dwithin', distance=10)): return False
    if len(lot_tree.query(poly, predicate='intersects')): return False
    cx, cy = poly.centroid.coords[0]; inner = poly.buffer(-0.05)
    for gx in (int(cx // 10) - 1, int(cx // 10), int(cx // 10) + 1):
        for gy in (int(cy // 10) - 1, int(cy // 10), int(cy // 10) + 1):
            if any(q.intersects(inner) for q in _placed_cells.get((gx, gy), ())): return False
    return True

def remember(q):
    cx, cy = q.centroid.coords[0]
    _placed_cells.setdefault((int(cx // 10), int(cy // 10)), []).append(q)

parking = []
def bands(max_depth=48):
    """Stall rows out from a wall: a single row, an aisle, then double rows
    between aisles. Noses point toward the wall, then away from each aisle."""
    v, out = WALK, [(WALK, -1)]
    v += STALL_D + AISLE
    while v + STALL_D <= max_depth:
        out += [(v, 1), (v + STALL_D, -1)]
        v += 2 * STALL_D + AISLE
    return out

def lay_rows(wall, union, site_id, base, occupancy, reach=0.0):
    t, o, a0 = np.array(wall['tangent']), np.array(wall['outward']), np.array(wall['start'])
    count = int((wall['width'] - 1.0) // STALL_W)
    if count < 2: return 0
    u0 = (wall['width'] - count * STALL_W) / 2
    # The grid keeps the wall's own stall phase and may run past its ends
    # across the lot (`reach` metres each way).
    extra = int(reach // STALL_W)
    laid, empty = 0, 0
    for band, (v0, facing) in enumerate(bands() if reach else bands()[:3]):
        ok = []
        for i in range(-extra, count + extra):
            c = a0 + t * (u0 + i * STALL_W) + o * v0
            poly = Polygon([c, c + t * STALL_W, c + t * STALL_W + o * STALL_D, c + o * STALL_D])
            ok.append((i, poly if stall_ok(poly, union) else None))
        run, found = [], 0
        for i, poly in ok + [(None, None)]:
            if poly is not None: run.append((i, poly)); continue
            if len(run) >= 3:
                by_tile = {}
                for j, q in run: by_tile.setdefault(tile_of(*q.centroid.coords[0]), []).append((j, q))
                for tile, stalls in by_tile.items():
                    first = stalls[0][0]; start = a0 + t * (u0 + first * STALL_W) + o * v0
                    parking.append(dict(tileId=tile, a=[r2(start[0]), r2(start[1])], t=[r3(t[0]), r3(t[1])], o=[r3(o[0]), r3(o[1])],
                                        count=len(stalls), facing=facing, z=r2(base), occupancy=occupancy, site=site_id, band=band))
                    for _, q in stalls: remember(q)
                found += len(run)
            run = []
        laid += found
        empty = empty + 1 if not found else 0
        if empty >= 2: break
    return laid

for key, site in sorted(by_site.items(), key=lambda kv: kv[1]['businesses'][0]['id']):
    if any(id(p) in fuel_parcels for p in site['parcels']): continue
    union = None
    for p in site['parcels']: union = p if union is None else union.union(p)
    if union is None: continue
    # Storefronts first, then every other long wall, so each lot fills from
    # the building that faces it.
    walls = wall_placements(site)
    for r in site['rows']: walls += [w for w in outline_walls(r, 8) if not any(w['start'] == x['start'] and w['tangent'] == x['tangent'] for x in walls)]
    zone = prep(union.buffer(0.5))
    for w in walls: lay_rows(w, zone, site['businesses'][0]['id'], rows_by_id[w['row']]['base'], 0.45, reach=30)
for sid, address, seed, half, street, store_row, store_words, palette in STATIONS:
    r = rows_by_id[store_row]; c = measured[sid]
    parcel = next((p for p, props in parcels if p.contains(Point(*c['centre']))), None)
    lay_rows(facing_wall(r, c['centre']), prep(parcel.buffer(0.5)) if parcel is not None else None, sid, r['base'], 0.3)

# Pole lights stand on the line where two rows meet nose to nose, about
# every ten stalls, as in most plaza lots; the poles themselves are authored.
lights = []
rows_by_site = {}
for r in parking: rows_by_site.setdefault((r['site'], tuple(r['t']), tuple(r['o'])), []).append(r)
for (site, t, o), rows_ in rows_by_site.items():
    t, o = np.array(t), np.array(o)
    for r in rows_:
        if r['band'] != 1: continue
        a = np.array(r['a'])
        for i in range(0, r['count'] + 1, 10):
            q = a + t * (i * STALL_W) + o * STALL_D
            if any(np.hypot(*(q - np.array(l['at']))) < 12 for l in lights): continue
            lights.append(dict(tileId=tile_of(*q), at=[r2(q[0]), r2(q[1])], dir=[r3(t[0]), r3(t[1])], z=r['z']))

# --------------------------------------------------------------- output
def wall_sign(s):
    wall = s['wall']
    words = s['words']; styles = s['style'] if isinstance(s['style'], list) else [s['style']] * len(words)
    h = wall['top'] - wall['floor']; stories = max(1, min(int(wall['stories'] or 1), int(h // 2.35) or 1)); floor_h = h / stories
    # Above the storefront heads (see commercial-completion display windows):
    # the band from head + 0.12 m to the first-floor top or the parapet.
    head = wall['floor'] + min(3.05, floor_h - 0.5)
    if wall['recipe'] in ('garage', 'warehouse'): head = wall['floor'] + min(3.5, h - 0.5)
    band_top = wall['floor'] + floor_h - 0.22 if stories > 1 else wall['top'] - 0.18
    if wall['recipe'] == 'plaza': head = wall['floor'] + 2.6
    sign_h = min(1.15, band_top - head - 0.12)
    if sign_h < 0.42: head = wall['top'] - 1.0; sign_h = 0.7; band_top = wall['top'] - 0.15
    y = (head + 0.06 + band_top) / 2
    out = []
    n = len(words); pitch = wall['width'] / n
    for i, (word, style) in enumerate(zip(words, styles)):
        u = pitch * (i + 0.5)
        chars = len(word)
        w = min(pitch * 0.82, max(1.6, chars * sign_h * 0.62 + 0.5), 9.0)
        a = np.array(wall['start']) + np.array(wall['tangent']) * u + np.array(wall['outward']) * (0.36 if wall['skin'] else 0.1)
        out.append(dict(kind='wall', tileId=tile_of(*a), at=[r2(a[0]), r2(a[1])], normal=[r3(wall['outward'][0]), r3(wall['outward'][1])], y=r2(y),
                        panels=[dict(text=word, style=style, w=r2(w), h=r2(sign_h))], frame=wall['frame'], businesses=s['businesses'][i:i + 1] if s['businesses'] else [], station=s.get('station')))
    return out

final = []
for s in signs:
    if s['kind'] == 'wall': final += wall_sign(s)
    else: final.append(dict(kind=s['kind'], tileId=tile_of(*s['at']), at=s['at'], along=s['along'], z=s['z'], panels=s['panels'], businesses=s['businesses']))
for i, s in enumerate(final): s['id'] = f'SIGN-{i + 1:03d}'

sources = [
    dict(path='research/data/businesses.json', sha256=sha(research / 'businesses.json'), use='Current listings: which businesses exist, their addresses and categories; names are never rendered.'),
    dict(path='research/data/parcels-current.geojson', sha256=sha(research / 'parcels-current.geojson'), use='Lot lines for sign setbacks; assessor fuel-service use.'),
    dict(path='research/data/buildings-current.geojson', sha256=sha(research / 'buildings-current.geojson'), use='Building clearance for roadside signs.'),
    dict(path='townwide/roof_index.json', sha256=sha(SOURCE / 'townwide/roof_index.json'), use='USGS MA_CentralEastern_1_2021 class-6 upper returns; canopy outlines and deck heights.'),
    dict(path='data/derived/town/commercial-completion.json', sha256=sha(ROOT / 'data/derived/town/commercial-completion.json'), use='Storefront frames for wall signs and parking rows.'),
    dict(path='data/derived/town/paved-surfaces-index.json', sha256=sha(ROOT / 'data/derived/town/paved-surfaces-index.json'), use='Finished paving masks (stalls must lie on paving) and the lots that already have striping.'),
]
result = dict(
    version=1,
    basis='Fuel canopies: outline and deck height measured from 2021 lidar class-6 upper returns and checked against the 2025 MassGIS aerial; island count follows canopy size. Signs: one generic word per listed business, placed on its storefront band and at its street frontage. Positions, palettes, fonts, prices and sign forms are authored. No business names, brands, logos or house colours are shown.',
    sourceManifestSha256=release['manifestSha256'],
    sources=sources,
    stations=stations,
    signs=final,
    parking=parking,
    lights=lights,
)
OUT.write_text(json.dumps(result, separators=(',', ':')) + '\n')
print(json.dumps(dict(stations=len(stations), signs=len(final), parkingRows=len(parking), stalls=sum(r['count'] for r in parking), lights=len(lights), pylons=sum(s['kind'] == 'pylon' for s in final), monuments=sum(s['kind'] == 'monument' for s in final), walls=sum(s['kind'] == 'wall' for s in final), bytes=OUT.stat().st_size)))
