"""Factories, mines, fish farms and livestock operations with an individual EPA discharge (NPDES) permit, as scene points.

Input: npdes_facilities_2026-10.json, made on the downloading computer by npdes_extract.py and npdes_join.py from EPA
ECHO's npdes_outfalls_layer.csv and ECHO_EXPORTER.csv (both downloaded 2026-10-25): every permit of type NPD
(individual) with status Effective or Administratively Continued whose SIC code (or NAICS code where no SIC is given)
is manufacturing (SIC 20-39), mining including oil and gas (10-14), aquaculture (0273, 0921) or farming (01-02).

Each facility is put in the county its permit names when that county lies within 20 km of its mapped location (USGS
counts a plant's water where the plant is, and a point on a county line can fall on the wrong side), otherwise in the
county under the point. A permit's design flow (what the facility was built to discharge, which can be well above what it
uses) is kept as recorded, and flagged where it is more than ten times all the water USGS counted for the facility's
county in 2015, since those are probably in the wrong units (a trout hatchery is recorded at six million million gallons
a day); flagged flows are left out when ranking a county's facilities for the flows.

Outputs (proc/net):
  npdes.bin           'NPD1', u32 n, then f32 x[n], f32 z[n], u8 kind[n], u8 slab[n], i16 county[n], f32 flow[n]
                      (design flow, Mgal/d; -1 none recorded), u8 flags[n] (1 major permit, 2 flow over ten times the county's total)
  npdes.json          {kinds, counts, names, what, place, water, permit, reg, code}: one entry per point, for the panel
                      (code: the SIC code that set its kind, or N and the NAICS code)
  npdes_anchors.json  per county, up to eight points each for industry (factories), mining (mines) and aquaculture (fish
                      farms), largest design flow first, then major permits, then permit number (bake_flows.py)
"""
import json, re, struct, sys, os, collections, numpy as np
sys.path.insert(0, os.path.dirname(__file__))
from netlib import to_scene, in_rect, NET, RAW, Terrain
from proj import SLABS
from names import tidy, sentence

SRC = f'{RAW}/npdes/npdes_facilities_2026-10.json'
KINDS = ['factory', 'mine', 'fish', 'farm']
SL = {'conus': 0, 'ak': 1, 'hi': 2, 'pr': 3}
ANCHOR_OF = {'factory': 'ind', 'mine': 'mine', 'fish': 'fish'}
NANCHOR = 8

def slab_guess(lon, lat):
    if lat > 50 or lon < -165 or lon > 170: return 'ak'
    if lat < 23.5 and lon < -150: return 'hi'
    if lat < 19 and -68.5 < lon < -64: return 'pr'
    return 'conus'

def county_total(wu, i):
    """everything USGS counted as withdrawn in the county in 2015, all uses and sources (Mgal/d), as the map sums it"""
    v = lambda k: (wu[k][i] or 0) if k in wu else 0
    tot = lambda p, ks: sum(v(f'{p}_{k}') for k in ks)
    four = 'sf ss gf gs'.split()
    split = wu['ic_w'][i] is not None
    ir = (v('ic_sf') + v('ic_gf') + v('ig_sf') + v('ig_gf')) if split else (v('ir_sf') + v('ir_gf'))
    return (tot('ps', four) + tot('in', four) + tot('mi', four) + tot('aq', four) + tot('po', four) + tot('pc', four)
            + tot('li', ['sf', 'gf']) + tot('do', ['sf', 'gf']) + ir)

def name_key(s):
    """a county name reduced for matching: 'ST. JOHN THE BAPTIST' / 'St. John the Baptist Parish' -> 'STJOHNTHEBAPTIST'"""
    s = ' ' + s.upper().replace('.', ' ').replace("'", '') + ' '
    s = re.sub(r' SAINTE? ', ' ST ', s).replace(' STE ', ' ST ')
    s = re.sub(r' (CITY AND BOROUGH|CENSUS AREA|COUNTY|PARISH|BOROUGH|MUNICIPALITY|MUNICIPIO|CA|B) ', ' ', s + ' ')
    return re.sub(r'[^A-Z0-9]', '', s)

def main():
    D = json.load(open(SRC))
    F = D['facilities']; SICD = D['sic']
    wu = json.load(open('/home/claude/build/wu.json'))
    T = {s: Terrain(s) for s in SL}
    CM = {s: np.load(f'{NET}/{s}_county.npy') for s in SL}
    NAME = {}
    for i, (nm, st) in enumerate(zip(wu['name'], wu['st'])): NAME[(st, name_key(nm))] = i
    # each county's pixels, per slab, for the distance from a point to the county its permit names
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
    pts = []; drop = collections.Counter(); flagged = []; moved = 0
    for p in F:
        lat, lon = p['lat'], p['lon']
        slab = slab_guess(lon, lat)
        x, z = to_scene(slab, lon, lat)
        S = SLABS[slab]
        if not in_rect(slab, x - S['offset'][0], z - S['offset'][1]): drop['outside'] += 1; continue
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
        if cn is not None and cn != c and dist_px(slab, cn, i, j) * t.km / t.ppu <= 20: c = cn; moved += 1
        flow = p['flow'] if p['flow'] and p['flow'] > 0 else -1.0
        flag = 1 if p['major'] else 0
        if flow > 0 and flow > 10 * county_total(wu, c):
            flag |= 2; flagged.append((flow, round(county_total(wu, c), 1), p['name'], p['st'], wu['name'][c]))
        what = SICD.get(p['code'], '') if not p['code'].startswith('N') else ''
        place = ', '.join(q for q in [tidy(p['city']), p['st']] if q)
        pts.append(dict(kind=KINDS.index(p['kind']), x=float(x), z=float(z), slab=SL[slab], county=c, flow=flow, flags=flag,
                        name=tidy(p['name'], p['st']), what=sentence(what), naics=(p['naics'] or [''])[0] if p['code'].startswith('N') else '',
                        place=place, water=list({tidy(w).lower(): tidy(w) for w in reversed(p['water'])}.values())[::-1], permit=p['id'], reg=p.get('reg', ''), code=p['code']))
    pts.sort(key=lambda q: (q['kind'], q['county'], q['permit']))
    n = len(pts)
    buf = struct.pack('<4sI', b'NPD1', n)
    buf += np.array([q['x'] for q in pts], '<f4').tobytes() + np.array([q['z'] for q in pts], '<f4').tobytes()
    buf += np.array([q['kind'] for q in pts], 'u1').tobytes() + np.array([q['slab'] for q in pts], 'u1').tobytes()
    buf += np.array([q['county'] for q in pts], '<i2').tobytes() + np.array([q['flow'] for q in pts], '<f4').tobytes()
    buf += np.array([q['flags'] for q in pts], 'u1').tobytes()
    open(f'{NET}/npdes.bin', 'wb').write(buf)
    counts = [sum(1 for q in pts if q['kind'] == k) for k in range(len(KINDS))]
    json.dump(dict(kinds=KINDS, counts=counts, names=[q['name'] for q in pts], what=[q['what'] or (('NAICS ' + q['naics']) if q['naics'] else '') for q in pts],
                   place=[q['place'] for q in pts], water=[q['water'] for q in pts], permit=[q['permit'] for q in pts], reg=[q['reg'] for q in pts],
                   code=[q['code'] for q in pts]),
              open(f'{NET}/npdes.json', 'w'), separators=(',', ':'))
    # anchors for the flows: per county, the largest first
    anc = {}
    for q in pts:
        k = ANCHOR_OF.get(KINDS[q['kind']])
        if k: anc.setdefault(str(q['county']), {}).setdefault(k, []).append(q)
    out = {}
    for c, d in anc.items():
        out[c] = {}
        for k, lst in d.items():
            lst.sort(key=lambda q: (-(q['flow'] if q['flow'] > 0 and not q['flags'] & 2 else 0), -(q['flags'] & 1), q['permit']))
            out[c][k] = [[round(q['x'], 4), round(q['z'], 4)] for q in lst[:NANCHOR]]
    json.dump(out, open(f'{NET}/npdes_anchors.json', 'w'), separators=(',', ':'))
    print('facilities', n, dict(zip(KINDS, counts)), 'dropped', dict(drop), 'json', os.path.getsize(f'{NET}/npdes.json') // 1024, 'KB')
    print('moved to the county the permit names', moved, '; design flows', sum(1 for q in pts if q['flow'] > 0), 'flagged', len(flagged))
    for w in sorted(flagged, reverse=True): print('  flagged', w)
    print('counties with anchors: ind', sum(1 for d in out.values() if 'ind' in d), 'mine', sum(1 for d in out.values() if 'mine' in d), 'fish', sum(1 for d in out.values() if 'fish' in d))

if __name__ == '__main__':
    main()
