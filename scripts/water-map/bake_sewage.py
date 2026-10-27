"""Sewage treatment plants with an individual EPA discharge (NPDES) permit, as scene points with their outfalls.

Input: npdes_sewage_2026-10.json, made on the downloading computer by npdes_sewage.py and npdes_join.py from EPA ECHO's
npdes_outfalls_layer.csv and ECHO_EXPORTER.csv (both downloaded 2026-10-25): every permit of type NPD (individual) with
status Effective or Administratively Continued whose first SIC code is 4952 (sewerage systems), that has no SIC code
and NAICS 221320 (sewage treatment facilities), or that has a POTW (publicly owned treatment works) component. The 47
permits with a POTW component that are already on the map as factories (bake_npdes.py) stay factories.

Each plant goes in the county its permit names when that county lies within 20 km of its mapped location, as in
bake_npdes.py. Its location is the plant's own (the permit's Facility row) where EPA has one, otherwise its first
outfall. Its outfalls are the external outfalls on the permit, at most eight, with the water each discharges to.

Outputs (proc/net):
  sewage.bin    'SEW1', u32 n, then f32 x[n], f32 z[n], u8 own[n] (0 public, 1 private or other), u8 slab[n],
                i16 county[n], f32 flow[n] (design flow, Mgal/d; -1 none recorded), u8 flags[n] (1 major permit, 2 flow
                over 3,000 gallons a day for everyone in its county, or over 1 Mgal/d where it has fewer than 333
                people: probably recorded in the wrong units, 4 placed at its first outfall, 8 over 20 km from the county
                its permit names), u8 nout[n],
                then f32 ox[sum nout], f32 oz[sum nout]: each plant's outfalls in order; then u32 ndup, u32 dup[ndup]:
                the OpenStreetMap wastewater plants (osm_points indices, bake_osm.py) within 750 m of one of these
                plants or its outfalls, which the map leaves out as the same plant
  sewage.json   {counts, names, place, water, permit, reg, owner, named}: one entry per point, for the panel (named:
                the county the permit names, by point, where it is over 20 km from where EPA's coordinates put it)
"""
import json, re, struct, sys, os, collections, numpy as np
sys.path.insert(0, os.path.dirname(__file__))
from netlib import to_scene, in_rect, NET, RAW, Terrain
from proj import SLABS
from names import tidy
from bake_npdes import slab_guess, name_key

SRC = f'{RAW}/npdes/npdes_sewage_2026-10.json'
FAC = f'{RAW}/npdes/npdes_facilities_2026-10.json'
SL = {'conus': 0, 'ak': 1, 'hi': 2, 'pr': 3}
PUBLIC = {'MWD', 'CTG', 'CNG', 'STF', 'FDF', 'TRB', 'SDT'}
OWNER = {'MWD': 'a municipality or water district', 'CTG': 'a municipality', 'CNG': 'a county', 'STF': 'a state government',
         'FDF': 'the federal government', 'TRB': 'a tribal government', 'SDT': 'a school district', 'POF': 'a private owner',
         'COR': 'a corporation', 'NON': 'a non-government owner', 'MXO': 'mixed public and private owners'}
NOUT = 8
UNIT = r'(WWTP|WWTF|STP|WPCP|WPCF|POTW|WRF|WTF|WWTF|LAGOON|LAGOONS)'
GOV = r'(CITY|TOWN|VILLAGE|BOROUGH|TOWNSHIP|COUNTY|MUNICIPALITY|PARISH)'

def plant_name(s, st):
    """'CHEROKEE, CITY OF (WWTP)' -> 'Cherokee WWTP'; 'GLEN FLORA VILLAGE OF' -> 'Village of Glen Flora';
    'CHRISMAN STP, CITY OF' -> 'Chrisman STP'; anything else as tidy() writes it"""
    s = re.sub(r'\s+', ' ', (s or '').strip())
    if any(c.islower() for c in s): return s
    m = re.match(rf'^(.*?),?\s+{GOV} OF\s*\(?{UNIT}\)?$', s)
    if m and m.group(1): return tidy(f'{m.group(1)} {m.group(3)}', st)
    m = re.match(rf'^(.*?)\s+{UNIT},?\s+{GOV} OF$', s)
    if m and m.group(1): return tidy(f'{m.group(1)} {m.group(2)}', st)
    m = re.match(rf'^(.*?),?\s+{GOV} OF$', s)
    if m and m.group(1):
        t = tidy(f'{m.group(2)} OF {m.group(1)}', st); return t[:1].upper() + t[1:]
    m = re.match(rf'^(.*?)\s*\({UNIT}\)$', s)
    if m and m.group(1): return tidy(f'{m.group(1)} {m.group(2)}', st)
    return tidy(s, st)

def water_name(w):
    """a receiving water as the permit names it, without the state's segment codes: 'Wolf Cr (1107020533)' -> 'Wolf Cr',
    '5B6, JEMEZ RIVER' -> 'Jemez River'"""
    w = re.sub(r'\s*\(\s*[0-9A-Z.-]*\d[0-9A-Z.-]*\s*\)\s*', ' ', w or '').strip()
    w = re.sub(r'^[0-9][0-9A-Z.-]*,\s*', '', w).strip(' ,;')
    return tidy(w)

def main():
    D = json.load(open(SRC)); S = D['facilities']
    fac_ids = {p['id'] for p in json.load(open(FAC))['facilities']}
    wu = json.load(open('/home/claude/build/wu.json'))
    T = {s: Terrain(s) for s in SL}
    CM = {s: np.load(f'{NET}/{s}_county.npy') for s in SL}
    NAME = {}
    for i, (nm, st) in enumerate(zip(wu['name'], wu['st'])): NAME[(st, name_key(nm))] = i
    PIX = {}
    for s_, cm in CM.items():
        flat = cm.ravel().astype(np.int64) - 1
        order = np.argsort(flat, kind='stable'); ids = flat[order]
        PIX[s_] = (order, np.searchsorted(ids, np.arange(len(wu['id']))), np.searchsorted(ids, np.arange(len(wu['id'])), side='right'), cm.shape[1])
    def dist_px(s_, c, i, j):
        order, lo, hi, W = PIX[s_]
        if lo[c] == hi[c]: return 1e9
        jj, ii = np.divmod(order[lo[c]:hi[c]], W)
        return float(np.sqrt(((ii - i) ** 2 + (jj - j) ** 2).min()))
    pts = []; drop = collections.Counter(); flagged = []; moved = 0; outs_far = 0
    for p in S:
        if p['id'] in fac_ids: drop['already a factory'] += 1; continue
        lat, lon = p['lat'], p['lon']
        slab = slab_guess(lon, lat)
        x, z = to_scene(slab, lon, lat)
        Sb = SLABS[slab]
        if not in_rect(slab, x - Sb['offset'][0], z - Sb['offset'][1]): drop['outside'] += 1; continue
        t = T[slab]; fx, fy = t.px(x, z)
        i, j = int(round(float(fx))), int(round(float(fy)))
        if not (0 <= i < t.W and 0 <= j < t.H): drop['outside'] += 1; continue
        cm = CM[slab]; c = int(cm[j, i]) - 1
        if c < 0:
            win = cm[max(0, j - 3):j + 4, max(0, i - 3):i + 4].astype(int) - 1
            ys, xs = np.nonzero(win >= 0)
            if len(ys) == 0: drop['no county'] += 1; continue
            k = np.argmin((ys - min(j, 3)) ** 2 + (xs - min(i, 3)) ** 2); c = int(win[ys[k], xs[k]])
        cn = NAME.get((p['st'], name_key(p['county']))) if p['county'] else None
        if cn is None and p['county']: cn = NAME.get((p['st'], name_key(p['county']) + 'CITY'))
        named = -1
        if cn is not None and cn != c:
            if dist_px(slab, cn, i, j) * t.km / t.ppu <= 20: c = cn; moved += 1
            else: named = cn
        flow = p['flow'] if p['flow'] and p['flow'] > 0 else -1.0
        flag = (1 if p['major'] else 0) | (0 if p['fac_row'] else 4) | (8 if named >= 0 else 0)
        # (a city's sewage plant can treat far more than its county withdraws, when the water is piped in, so the test is
        # people: more than 3,000 gallons a day for everyone in the county, many times what a city sends to its sewers)
        if flow > 0 and flow > max(1.0, 3.0 * (wu['pop'][c] or 0)):
            flag |= 2; flagged.append((flow, round(wu['pop'][c] or 0, 1), p['name'], p['st'], wu['name'][c]))
        # outfalls: in scene coordinates, those within 30 km of the plant (a farther one is a mistyped coordinate)
        ox = []
        for o in p['outs']:
            if len(ox) >= NOUT: break
            if slab_guess(o[1], o[0]) != slab: continue
            qx, qz = to_scene(slab, o[1], o[0])
            if np.hypot(qx - x, qz - z) * t.km > 30: outs_far += 1; continue
            ox.append((float(qx), float(qz)))
        waters = []
        for w in p['water']:
            nm = water_name(w)
            if nm and nm.lower() not in {q.lower() for q in waters}: waters.append(nm)
        pts.append(dict(x=float(x), z=float(z), own=0 if p['own'] in PUBLIC else 1, slab=SL[slab], county=c, flow=flow, flags=flag, outs=ox,
                        name=plant_name(p['name'], p['st']), place=', '.join(q for q in [tidy(p['city']), p['st']] if q), water=waters[:2],
                        permit=p['id'], reg=p.get('reg', ''), owner=p['own'], named=named))
    pts.sort(key=lambda q: (q['county'], q['permit']))
    n = len(pts)
    buf = struct.pack('<4sI', b'SEW1', n)
    buf += np.array([q['x'] for q in pts], '<f4').tobytes() + np.array([q['z'] for q in pts], '<f4').tobytes()
    buf += np.array([q['own'] for q in pts], 'u1').tobytes() + np.array([q['slab'] for q in pts], 'u1').tobytes()
    buf += np.array([q['county'] for q in pts], '<i2').tobytes() + np.array([q['flow'] for q in pts], '<f4').tobytes()
    buf += np.array([q['flags'] for q in pts], 'u1').tobytes() + np.array([len(q['outs']) for q in pts], 'u1').tobytes()
    allo = [o for q in pts for o in q['outs']]
    buf += np.array([o[0] for o in allo], '<f4').tobytes() + np.array([o[1] for o in allo], '<f4').tobytes()
    open(f'{NET}/sewage.bin', 'wb').write(buf)
    allo = np.array(allo, np.float64).reshape(-1, 2)
    # OpenStreetMap's wastewater plants (bake_osm.py) within 750 m of one of these plants or its outfalls are the same plant
    # mapped twice: the map shows EPA's
    osm = open(f'{NET}/osm_points.bin', 'rb').read(); m = struct.unpack('<I', osm[4:8])[0]
    OX = np.frombuffer(osm, '<f4', m, 8).astype(np.float64); OZ = np.frombuffer(osm, '<f4', m, 8 + 4 * m).astype(np.float64)
    OK = np.frombuffer(osm, 'u1', m, 8 + 8 * m)
    from scipy.spatial import cKDTree
    tree = cKDTree(np.r_[np.c_[[q['x'] for q in pts], [q['z'] for q in pts]], allo])
    ww = np.flatnonzero(OK == 2)
    d, _ = tree.query(np.c_[OX[ww], OZ[ww]])
    dup = ww[d * T['conus'].km < 0.75].tolist()
    open(f'{NET}/sewage.bin', 'ab').write(struct.pack('<I', len(dup)) + np.array(dup, '<u4').tobytes())
    json.dump(dict(counts=[sum(1 for q in pts if q['own'] == k) for k in (0, 1)], names=[q['name'] for q in pts], place=[q['place'] for q in pts],
                   water=[q['water'] for q in pts], permit=[q['permit'] for q in pts], reg=[q['reg'] for q in pts], owner=[q['owner'] for q in pts],
                   named={str(k): q['named'] for k, q in enumerate(pts) if q['named'] >= 0}),
              open(f'{NET}/sewage.json', 'w'), separators=(',', ':'))
    print('OpenStreetMap wastewater plants that are these plants', len(dup), 'of', len(ww))
    print('sewage plants', n, 'public', sum(1 for q in pts if q['own'] == 0), 'dropped', dict(drop), 'json', os.path.getsize(f'{NET}/sewage.json') // 1024, 'KB')
    print('moved to the county the permit names', moved, '; design flows', sum(1 for q in pts if q['flow'] > 0), 'flagged', len(flagged),
          '; outfalls', len(allo), 'left out as over 30 km away', outs_far, '; placed at an outfall', sum(1 for q in pts if q['flags'] & 4))
    for w in sorted(flagged, reverse=True): print('  flagged', w)
    nm = [q for q in pts if q['named'] >= 0]
    print('placed over 20 km from the county the permit names', len(nm))
    for q in nm[:12]: print('  ', q['name'], q['place'], '| named', wu['name'][q['named']], '| mapped in', wu['name'][q['county']])

if __name__ == '__main__':
    main()
