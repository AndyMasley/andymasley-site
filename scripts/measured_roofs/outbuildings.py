"""Garages, sheds, barns and the town's other plainly modelled buildings.

The scenery gives every mapped building that is not a house of the evidence
set, and that no crafted model replaces, an inferred box: a gable or flat roof
at an estimated height and, on sheds and garages, one dark door floating on a
wall. This step treats them like the houses:

- Roof and walls. Where the 2021 LiDAR has building returns on the roofprint,
  the roof is fitted and closed into a solid with eaves exactly as for houses
  (measure.py, solid.py); a flat roof keeps only a coping lip. The base is the
  scenery's own building base there, so the building stands on the same
  ground. Where the survey has no building returns (small sheds under trees,
  and roofs it classed as ground or vegetation), the scenery's box stays and
  only its doors and paint change.
- Kind. The principal building of a shop, office, works or public lot is a
  building; otherwise a garage or shed is under 200 m2 and under 6.2 m tall,
  or any building under 30 m2. Buildings (these, second houses on a lot,
  barns, apartment blocks) take storeys of windows and a door toward the
  street; unmeasured, they keep the scenery's windows.
- Doors. A garage's vehicle doors stand in the wall that a paved drive runs up
  to in the scenery's land cover (MassGIS 2016 impervious surface, 1 m), as
  many as the wall holds; any other outbuilding gets one hinged door in the
  wall facing the lot's house, or the street when the lot has none.
- Colour. Roofs from the aerial, as for houses. Walls from the assessor
  photograph where it shows the garage itself, else the lot's house as
  photographed (outbuildings here are most often sided and trimmed to match),
  else the scenery's colour.
- Photographs. outbuilding-reads.json holds, per house photograph that shows
  a detached garage, where it stands (left, right, behind), its siding and
  trim, and its vehicle doors (how many, their colour, whether they face the
  street): the garage is the lot's largest outbuilding on that side, and doors
  seen facing the street go in its street wall. building-reads.json holds, per
  commercial, industrial, civic and mixed-use photograph, the building's
  material and colours, storeys, shopfront and awning, window pattern and
  overhead doors; never names, signs or brand colours.

Called by prepare.py; the V2 building meshes come from v2-buildings.mjs.
"""
import glob, gzip, json, math, os, re, subprocess, sys
from pathlib import Path
from multiprocessing import Pool

import numpy as np
import shapely
from shapely.geometry import shape, Polygon
from shapely.geometry.polygon import orient
from shapely.ops import transform as reproject

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import measure as M
import solid as S

SITE, SOURCE = M.SITE, M.SOURCE
OX, OY = 171282.3328920724, 867589.2761750807
INSET, SLAB, LIP = 0.32, 0.22, 0.08
# Files that name structures without modelling them.
SOFT = {'engine-network.json.gz', 'place-directory.json'}
ID = re.compile(r'\b\d{6}_\d{6}\b')


def structures():
    """Every mapped building (MassGIS 2-D structures) as a counter-clockwise
    local polygon, with its row of the building register."""
    from pyproj import Transformer
    T = Transformer.from_crs(4326, 6491, always_xy=True)
    to_local = lambda x, y, z=None: (np.asarray(T.transform(x, y)[0]) - OX, np.asarray(T.transform(x, y)[1]) - OY)
    reg = {b['structId']: b for b in json.load(open(SOURCE / 'research/data/building-register.json'))}
    out = {}
    for f in json.load(open(SOURCE / 'research/data/buildings-current.geojson'))['features']:
        g = reproject(to_local, shape(f['geometry'])).buffer(0)
        if g.is_empty: continue
        if g.geom_type != 'Polygon': g = max(g.geoms, key=lambda q: q.area)
        sid = f['properties']['STRUCT_ID']
        out[sid] = (orient(Polygon(g.exterior), 1), reg.get(sid, {}))
    return out


def crafted(ids):
    """Structures that a crafted or researched model already stands for."""
    found = set()
    for f in sorted(glob.glob(str(SITE / 'data/derived/town/*.json*')) + glob.glob(str(SITE / 'data/source/town/*.json'))):
        if os.path.basename(f) in SOFT: continue
        text = gzip.open(f, 'rt').read() if f.endswith('.gz') else open(f).read()
        found.update(m for m in ID.findall(text) if m in ids)
    return found


def v2_meshes(out):
    """The scenery's inferred building triangles per tile (v2-buildings.mjs)."""
    target = out / 'v2'
    if not target.exists() or not any(target.iterdir()):
        subprocess.run(['node', str(HERE / 'v2-buildings.mjs'), str(target)], check=True, cwd=SITE)
    return {Path(f).stem: np.fromfile(f, dtype='<f4').reshape(-1, 10) for f in glob.glob(str(target / '*.f32'))}


def v2_stats(polys, tile_of, meshes):
    """Per structure, the scenery's box: base (its lowest foundation, which is
    also how the house evidence sets a base), eave, top, windows and doors."""
    by_tile = {}
    for sid, t in tile_of.items(): by_tile.setdefault(t, []).append(sid)
    stats = {}
    for t, sids in by_tile.items():
        a = meshes.get(t)
        if a is None: continue
        cen = (a[:, [1, 2]] + a[:, [4, 5]] + a[:, [7, 8]]) / 3
        for sid in sids:
            sel = a[shapely.contains_xy(polys[sid].buffer(0.6), cen[:, 0], cen[:, 1])]
            if not len(sel): continue
            code = sel[:, 0].astype(int); h = sel[:, [3, 6, 9]]
            found = h[code == 2]; roof = h[(code == 0) | (code == 1)]
            stats[sid] = {'base': float(found.min() if len(found) else h.min()),
                          'eave': float(roof.min() if len(roof) else h.max()), 'top': float(roof.max() if len(roof) else h.max()),
                          'glass': int((code == 4).sum()), 'door': int((code == 5).sum())}
    return stats


def simplified(poly):
    """The roofprint with near-collinear corners and slivers merged."""
    g = poly.simplify(0.12, preserve_topology=True)
    if g.is_empty or g.geom_type != 'Polygon' or abs(g.area - poly.area) > 0.03 * poly.area: g = poly
    return orient(Polygon(g.exterior), 1)


def quantized(poly, origin):
    """The ring in decimetres from the origin, as the packet stores it, without repeated corners."""
    ring = []
    for x, y in poly.exterior.coords[:-1]:
        q = [round((x - origin[0]) * 10), round((y - origin[1]) * 10)]
        if not ring or q != ring[-1]: ring.append(q)
    if len(ring) > 1 and ring[0] == ring[-1]: ring.pop()
    return ring


def ring_frames(ring, origin):
    """Walls around a counter-clockwise ring (decimetres from the origin), as
    the game derives them: start, tangent, outward and width, in metres."""
    pts = np.asarray(ring, float) / 10 + np.asarray(origin)
    out = []
    for a, b in zip(pts, np.roll(pts, -1, axis=0)):
        d = b - a; L = float(np.hypot(*d)); t = d / L
        out.append({'start': a.tolist(), 'tangent': t.tolist(), 'outward': [float(t[1]), float(-t[0])], 'width': L})
    return out


def measure_one(item):
    """Roof and walls for one building, as prepare.measure_house does for a house."""
    import manifold3d as mf
    import prepare as P
    sid, outline, base = item
    rec = {'id': sid}
    try:
        res = M.measure({'id': sid, 'outline': outline, 'base': base}, debug=True)
        if not res or res.get('status') != 'ok':
            rec['status'] = (res or {}).get('status', 'none'); return rec
        PL, Z, lpoly, R, c = res['debug']
        full, fillers = S.house_solid(res, lpoly, base, (PL, Z))
        if full is None or full.is_empty(): rec['status'] = 'no-solid'; return rec
        flat = all(s['model'] == 'flat' for s in res['sections'])
        inset = LIP if flat else INSET
        grown = S.grown_union(res, fillers, lpoly, base, 0.02)
        body = S.eaved_solid(full, grown, lpoly, base, inset=inset, thickness=SLAB)
        pieces = [p for p in body.decompose() if p.volume() > 0.5]
        if not pieces: raise ValueError('empty body')
        if len(pieces) != len(body.decompose()): body = mf.Manifold.batch_boolean(pieces, mf.OpType.Add) if len(pieces) > 1 else pieces[0]
        v, f = S.mesh_arrays(body)
        uq, roof, wall, trim = P.encode(v, f, R, c, base, lpoly)
        fz = M.union_height(res['sections'], PL)
        inl = np.abs(Z - fz) < M.INLIER
        edge = shapely.distance(lpoly.exterior, shapely.points(PL[:, 0], PL[:, 1]))
        pick = inl & (np.asarray(edge) > 0.5)
        if pick.sum() < 8: pick = inl
        en = PL[pick] @ R + c
        sel = np.linspace(0, len(en) - 1, min(len(en), 300)).astype(int)
        rec.update({'status': 'ok', 'origin': [round(float(c[0]), 3), round(float(c[1]), 3)], 'base': base, 'inset': inset,
                    'peak': round(float(v[:, 2].max()), 3), 'v': P.b64(uq), 'roof': P.b64(roof), 'wall': P.b64(wall), 'trim': P.b64(trim), 'nv': int(len(uq)),
                    'gutters': [] if flat else P.gutters(v, f, lpoly, R, c),
                    'fit': {'inlierShare': round(res['inlierShare'], 3), 'rmse': round(res['rmse'], 3), 'n': res['n'], 'cover': round(res['cover'], 3),
                            'models': [s['model'] for s in res['sections']]},
                    'colourPts': [[round(float(a), 2), round(float(b), 2)] for a, b in en[sel]]})
    except Exception as e:
        rec['status'] = 'error'; rec['error'] = repr(e)[:200]
    return rec


def measure_all(items, jobs, path):
    with open(path, 'w') as f, Pool(jobs, initializer=M.lidar) as pool:
        out = {}
        for rec in pool.imap(measure_one, items, chunksize=8):
            f.write(json.dumps(rec) + '\n'); out[rec['id']] = rec
    return out


class Paving:
    """The scenery's land cover (surfaces/masks/<tile>.png, about 1 m): blue
    carries paved ground (streets, drives, lots, walks); buildings are empty."""
    def __init__(self, manifest, root):
        self.masks, self.root, self.images = manifest['surfaces']['masks'], root, {}

    def __call__(self, xy):
        from PIL import Image
        out = np.zeros(len(xy), bool)
        for k, (e, n) in enumerate(xy):
            tile = f'{math.floor(e / 250)}_{math.floor(n / 250)}'
            m = self.masks.get(tile)
            if not m: continue
            if tile not in self.images: self.images[tile] = np.asarray(Image.open(self.root / m['url']))
            im = self.images[tile]; x0, z0, x1, z1 = m['bounds']; h, w = im.shape[:2]
            px, pz = int((e - x0) * w / (x1 - x0)), int((-n - z0) * h / (z1 - z0))
            if 0 <= px < w and 0 <= pz < h: out[k] = im[pz, px, 2] > 150 and im[pz, px, 0] < 100
        return out


def facing(frames, centre, point):
    """The wall (at least 1.4 m long) that faces a point, favouring longer walls."""
    d = np.asarray(point, float) - centre; d = d / (np.hypot(*d) or 1)
    score = [(float(np.dot(f['outward'], d)) * min(f['width'], 4.0), i) for i, f in enumerate(frames) if f['width'] >= 1.4]
    return max(score)[1] if score else None


def garage_wall(frames, paved):
    """The wall a drive runs up to: paving along at least 2.4 m of it, 1.6 m
    out, and still under the drive 5-8 m out in front of its middle (a drive
    that only passes alongside does not count). Returns (wall, doors), the
    doors by the paved width: one per 3.6 m or so, up to three."""
    best = None
    for i, f in enumerate(frames):
        w = f['width']
        if w < 2.8: continue
        s, t, o = np.asarray(f['start']), np.asarray(f['tangent']), np.asarray(f['outward'])
        us = np.arange(0.3, w - 0.3 + 1e-6, 0.5)
        near = paved(s[None] + t[None] * us[:, None] + o[None] * 1.6)
        run = k = 0
        for p in near: k = k + 1 if p else 0; run = max(run, k)
        run *= 0.5
        deep = paved(np.asarray([s + t * (w / 2) + o * d for d in (5.0, 6.5, 8.0)])).sum()
        if run >= 2.4 and deep >= 2 and (best is None or run > best[1]): best = (i, run)
    if not best: return None
    i, run = best
    return i, max(1, min(3, round(run / 3.6), int((frames[i]['width'] - 0.5) // 2.5)))


HOMELY = re.compile(r'Residential|Family|Houses|Condominium|Apartment|Mobile Home|Accessory|Housing Authority', re.I)


def kind(poly, height, reg):
    """A garage or shed ('o'), or a building with storeys of windows ('b')."""
    if reg.get('principalStructureInferred') and reg.get('assessorUse') and not HOMELY.search(reg['assessorUse']): return 'b'
    return 'o' if poly.area < 30 or (poly.area < 200 and height < 6.2) else 'b'


def prepare_others(out, jobs, reuse, houses, facades, paint, lots):
    """Packet rows for everything else: measured outbuildings ('o') and
    buildings ('b'), and scenery boxes that keep their shape but take doors and
    paint ('v'). Returns [(tile, row, measured record or None)]."""
    import prepare as P
    polys = structures()
    homes = {h['id'] for h in houses}
    manifest = Path(sorted(glob.glob(str(SITE / 'public/town-assets/*/manifest.json')))[-1])
    man = json.load(open(manifest))
    paved = Paving(man, manifest.parent)
    tile_of = {s: t['id'] for t in man['tiles'] for s in t.get('sourceIds', [])}
    skip = crafted(set(polys))
    others = sorted(s for s in polys if s not in homes and s not in skip and s in tile_of)
    stats = v2_stats({s: polys[s][0] for s in others}, {s: tile_of[s] for s in others}, v2_meshes(out))
    ids = sorted(polys); tree = shapely.STRtree([polys[i][0] for i in ids])
    todo = []
    for sid in others:
        st = stats.get(sid)
        if not st or st['top'] - st['base'] < 1.5: continue
        poly = polys[sid][0]
        near = [ids[j] for j in tree.query(poly.buffer(1.5)) if ids[j] != sid]
        # a building touching another reads as one: leave both to the scenery
        if any(poly.distance(polys[o][0]) < (0.5 if o in homes else 1.5 if o in skip else 0.3) for o in near): continue
        todo.append(sid)
    path = out / 'others.jsonl'
    if reuse and path.exists(): measured = {r['id']: r for r in map(json.loads, open(path))}
    else: measured = measure_all([(s, [list(p) for p in simplified(polys[s][0]).exterior.coords[:-1]], stats[s]['base']) for s in todo], jobs, path)
    parcel = {}
    for sid, (poly, reg) in polys.items():
        if reg.get('parcelId'): parcel.setdefault(reg['parcelId'], []).append(sid)
    fronts = {h['id']: next((np.asarray(f['outward'], float) for f in h['frames'] if f.get('front')), None) for h in houses}
    garage_reads = photographed_garages(json.load(open(HERE / 'outbuilding-reads.json')), polys, parcel, set(todo), fronts)
    building_reads = json.load(open(HERE / 'building-reads.json'))
    rows = []
    for sid in todo:
        poly, reg = polys[sid]; st = stats[sid]; rec = measured.get(sid, {})
        ok = rec.get('status') == 'ok' and rec['fit']['inlierShare'] >= 0.6 and rec['fit']['cover'] >= 0.3
        k = kind(poly, (rec['peak'] if ok else st['top']) - st['base'], reg)
        if not ok and (k == 'b' or st['glass']): continue   # unmeasured, a larger building keeps the scenery's own windows
        origin = rec['origin'] if ok else [round(float(poly.centroid.x), 3), round(float(poly.centroid.y), 3)]
        ring = quantized(simplified(poly), origin)
        if len(ring) < 3: continue
        frames = ring_frames(ring, origin)
        centre = np.asarray(poly.centroid.coords[0])
        lot = [s for s in parcel.get(reg.get('parcelId'), []) if s in homes]
        house = max(lot, key=lambda s: polys[s][0].area) if lot else None
        road = lots.nearest_road(centre)
        row = {'id': sid, 'k': k if ok else 'v', 'o': origin, 'b': round(st['base'], 3), 'ol': ring}
        if ok:
            row.update({'p': rec['peak'], 'v': rec['v'], 'r': P.small_indices(rec['roof'], rec['nv']), 'w': P.small_indices(rec['wall'], rec['nv']),
                        't': P.small_indices(rec['trim'], rec['nv']), 'q': rec['fit']['inlierShare'], 'in': rec['inset'],
                        'g': [g for g in rec['gutters'] if all(math.isfinite(x) for x in g)],
                        'ep': [None if pr is None else pr[0][1] if all(abs(q[1] - pr[0][1]) < 0.015 for q in pr) else pr
                               for pr in P.wall_profiles(rec, {'frames': frames}, rec['inset'])]})
        else:
            row['h'] = round(st['eave'] - st['base'], 2)
        seen, hr, face = garage_reads.get(sid), (facades.get(house) if house else None), building_reads.get(sid)
        if k == 'o':
            garage = garage_wall(frames, paved)
            street = fronts.get(house) if house else None
            if seen and seen.get('gd') and seen.get('face') == 'street' and street is not None:
                # the photograph shows its vehicle doors facing the street
                wall = facing(frames, centre, centre + street * 20)
                if wall is not None and frames[wall]['width'] >= 2.8:
                    garage = (wall, max(1, min(3, seen['gd'] * seen.get('bays', 1), int((frames[wall]['width'] - 0.5) // 2.5))))
            elif garage and seen and seen.get('gd'): garage = (garage[0], max(1, min(3, seen['gd'], garage[1] + 1)))
            if garage: row['gw'], row['gn'] = garage
            else:
                target = np.asarray(polys[house][0].centroid.coords[0]) if house else road
                door = facing(frames, centre, target) if target is not None else None
                if door is not None: row['dw'] = door
        else:
            # a building's entrance faces the street of its address
            front = lots.address_point(reg.get('parcelAddress'), centre) if reg.get('principalStructureInferred') else None
            target = front if front is not None else road
            door = facing(frames, centre, target) if target is not None else None
            if door is not None: row['dw'] = door
        if seen:
            if P.hexok(seen.get('wall')): row['wc'] = paint(seen['wall'])
            if P.hexok(seen.get('trim')): row['tc'] = paint(seen['trim'])
            if P.hexok(seen.get('gc')): row['gc'] = seen['gc']
            if seen.get('mat') in MATERIALS: row['m'] = seen['mat']
        elif face and ok and k == 'b':
            if P.hexok(face.get('wall')): row['wc'] = paint(face['wall'])
            if P.hexok(face.get('trim')): row['tc'] = paint(face['trim'])
            if face.get('mat') in MATERIALS: row['m'] = face['mat']
            fb = {'fl': face.get('fl'), 'st': face.get('store'), 'aw': face.get('awn') if P.hexok(face.get('awn')) else None, 'wn': face.get('win'),
                  'bays': face.get('bays'), 'od': face.get('od'), 'oc': face.get('odc') if P.hexok(face.get('odc')) else None,
                  'dc': face.get('door') if face.get('door') == 'glass' or P.hexok(face.get('door')) else None}
            row['fb'] = {key: v for key, v in fb.items() if v not in (None, 0, '')}
        if k == 'o' and hr and 'wc' not in row and P.hexok(hr.get('wall')): row['wc'] = paint(hr['wall'])
        if k == 'o' and hr and 'tc' not in row and P.hexok(hr.get('trim')): row['tc'] = paint(hr['trim'])
        rows.append((tile_of[sid], row, rec if ok else None))
    return rows


MATERIALS = ('siding', 'shingle', 'wood', 'brick', 'block', 'concrete', 'metal', 'stucco', 'stone')


def photographed_garages(reads, polys, parcel, todo, fronts):
    """Which outbuilding each photographed detached garage is: of the lot's
    outbuildings on the photographed side of the house as seen from the street,
    the largest. {structure: read}."""
    out = {}
    for house, read in reads.items():
        if house not in polys or fronts.get(house) is None: continue
        reg = polys[house][1]
        lot = [s for s in parcel.get(reg.get('parcelId'), []) if s in todo]
        if not lot: continue
        o = fronts[house]; right = np.array([-o[1], o[0]])
        c = np.asarray(polys[house][0].centroid.coords[0])
        side = read.get('side', '')
        def fits(s):
            d = np.asarray(polys[s][0].centroid.coords[0]) - c; lateral, depth = float(d @ right), float(-(d @ o))
            if side.endswith('left'): return lateral < -1
            if side.endswith('right'): return lateral > 1
            return depth > 0
        match = [s for s in lot if fits(s)]
        if match: out[max(match, key=lambda s: polys[s][0].area)] = read
    return out
