"""Principal aquifers of the United States (USGS, us_aquifers.shp) rasterised onto each slab's texture grid, and
groundwater withdrawals by aquifer from Lovelace et al. (2020), Estimated groundwater withdrawals from principal
aquifers in the United States, county-level data for 2015 (USGS data release, doi:10.5066/P9EI0KMR).

Outputs (proc/net):
  <slab>_aquifer.png   R = aquifer index (0 none or "other rocks"), at half texture resolution
  aquifers.json        aquifers [{code, name, rock, gw: {category: Mgal/d}, total}], county breakdowns
"""
import csv, json, sys, os, re, collections, numpy as np
from PIL import Image, ImageDraw
import shapefile
sys.path.insert(0, os.path.dirname(__file__))
from netlib import to_scene, NET, RAW, Terrain

ROCK = {100: 'Unconsolidated sand and gravel', 200: 'Semiconsolidated sand', 300: 'Sandstone', 400: 'Carbonate rock',
        500: 'Sandstone and carbonate rock', 600: 'Igneous and metamorphic rock'}
CATS = {'PS': 'ps', 'DO': 'do', 'IN': 'in', 'PT': 'pt', 'MI': 'mi', 'LI': 'li', 'AQ': 'aq', 'IC': 'ic', 'IG': 'ig', 'IR': 'ir'}

def norm(s):
    s = s.lower().replace('hawaiian', 'hawaii').replace('(puerto rico)', 'puerto rico').replace('(virgin islands)', '')
    s = re.sub(r'aquifers?|systems?|\(.*?\)', ' ', s)
    return ' '.join(sorted(re.sub(r'[^a-z ]', ' ', s).split()))

def main():
    sf = shapefile.Reader(f'{RAW}/aq/us_aquifers')
    recs = sf.records(); shapes = sf.shapes()
    aq = {}
    for r in recs:
        if r['AQ_CODE'] == 999: continue
        aq.setdefault(r['AQ_CODE'], dict(code=r['AQ_CODE'], name=r['AQ_NAME'], rock=ROCK.get(r['ROCK_TYPE'], 'Other'), area=0.0))
        aq[r['AQ_CODE']]['area'] += r['Shape_Area']
    codes = sorted(aq, key=lambda c: -aq[c]['area'])
    index = {c: i + 1 for i, c in enumerate(codes)}
    # ---- groundwater withdrawals by county and aquifer (Mgal/d)
    rd = csv.reader(open(f'{RAW}/uscopa2015v1.0.csv', encoding='latin-1'))
    next(rd); h = next(rd); ix = {n: i for i, n in enumerate(h)}
    names = collections.defaultdict(collections.Counter)
    per = []
    for row in rd:
        if len(row) < len(h): continue
        code = row[ix['CountyAquifer']]
        fips = code[:2] + code[3:6]
        acode = code.split('-')[-1]
        full = row[ix['CountyAquifer Name']]
        names[acode][full] += 1
        def g(col):
            try: return float(row[ix[col]])
            except (ValueError, KeyError): return 0.0
        v = {'ps': g('PS-WGWTo'), 'do': g('DO-WGWFr'), 'in': g('IN-WGWTo'), 'pt': g('PT-WGWTo'), 'mi': g('MI-WGWTo'),
             'li': g('LI-WGWFr'), 'aq': g('AQ-WGWTo'), 'ic': g('IC-WGWFr'), 'ig': g('IG-WGWFr'), 'ir': g('IR-WGWFr'), 'it': g('IT-WGWFr')}
        v['total'] = g('TO-WGWTo')
        per.append((fips, acode, v))
    # aquifer name per uscopa code: the longest suffix shared by its rows ("ST-County Name-Aquifer name")
    usco_name = {}
    for acode, cnt in names.items():
        rows = list(cnt)
        cand = rows[0].split('-')
        best = None
        for k in range(1, len(cand)):
            suf = '-'.join(cand[k:])
            if all(r.endswith('-' + suf) or r == suf for r in rows): best = suf; break
        usco_name[acode] = best or rows[0].split('-')[-1]
    usco_name['N600SRNVDV'] = 'Southern Nevada volcanic-rock aquifers'
    # crosswalk to the map's aquifer codes by normalised name
    by_norm = {norm(aq[c]['name']): c for c in codes}
    manual = {'N100PCFNWV': 610, 'N600HIVLCC': 608, 'N100AKUNCD': None, 'N9999OTHER': None, 'N100GLCIAL': None, 'N100ALLUVL': None,
              'S500INTRMD': None, 'N300WYTRTR': None, 'N600SRNVDV': 601}
    xw = {}
    for acode, nm in usco_name.items():
        if acode in manual: xw[acode] = manual[acode]; continue
        xw[acode] = by_norm.get(norm(nm))
    unmatched = {a: usco_name[a] for a, c in xw.items() if c is None}
    tot = collections.defaultdict(lambda: collections.defaultdict(float))
    county = collections.defaultdict(list)
    unmapped_total = collections.defaultdict(float)
    for fips, acode, v in per:
        if v['total'] <= 0: continue
        c = xw.get(acode)
        key = c if c is not None else acode
        for k, x in v.items(): tot[key][k] += x
        county[fips].append([index.get(c, 0), usco_name[acode], round(v['total'], 3), round(v['it'], 3), round(v['ps'], 3)])
        if c is None: unmapped_total[usco_name[acode]] += v['total']
    out_aq = []
    for c in codes:
        t = tot.get(c, {})
        out_aq.append(dict(i=index[c], code=c, name=aq[c]['name'], rock=aq[c]['rock'],
                           gw={k: round(t.get(k, 0.0), 2) for k in ['ps', 'do', 'in', 'pt', 'mi', 'li', 'aq', 'ic', 'ig', 'ir', 'it']},
                           total=round(t.get('total', 0.0), 2)))
    other = [dict(name=n, total=round(v, 1)) for n, v in sorted(unmapped_total.items(), key=lambda kv: -kv[1])]
    nat = sum(v['total'] for _, _, v in per)
    print('aquifers', len(codes), 'national GW', round(nat, 1), 'mapped', round(sum(a['total'] for a in out_aq), 1), 'not on the principal-aquifer map', round(sum(o['total'] for o in other), 1))
    for o in other[:8]: print('   ', o)
    for a in sorted(out_aq, key=lambda a: -a['total'])[:12]: print('   ', a['i'], a['name'], a['total'])
    for c in county.values(): c.sort(key=lambda r: -r[2])
    json.dump(dict(aquifers=out_aq, other=other, national=round(nat, 1), county=county), open(f'{NET}/aquifers.json', 'w'), separators=(',', ':'))
    # ---- rasters (half texture resolution, nearest), largest aquifers first so smaller ones sit on top
    order = sorted(range(len(recs)), key=lambda k: -recs[k]['Shape_Area'])
    for slab in ['conus', 'ak', 'hi', 'pr']:
        t = Terrain(slab)
        W, H = t.W // 2, t.H // 2
        img = Image.new('L', (W, H), 0); dr = ImageDraw.Draw(img)
        for k in order:
            r = recs[k]
            if r['AQ_CODE'] == 999: continue
            shp = shapes[k]
            pts = np.asarray(shp.points)
            if len(pts) < 3: continue
            parts = list(shp.parts) + [len(pts)]
            for a0, a1 in zip(parts[:-1], parts[1:]):
                ring = pts[a0:a1]
                lon, lat = ring[:, 0], ring[:, 1]
                if slab == 'conus' and (lat.mean() > 50 or lon.mean() < -130 or lat.mean() < 23): continue
                if slab == 'hi' and not (lon.mean() < -150 and lat.mean() < 24): continue
                if slab == 'pr' and not (-68.5 < lon.mean() < -64 and lat.mean() < 19): continue
                if slab == 'ak' and lat.mean() < 50: continue
                x, z = to_scene(slab, lon, lat)
                px = (x - t.x0) * t.ppu / 2; pz = (z - t.z0) * t.ppu / 2
                # shapefile rings: clockwise = outer, counter-clockwise = hole
                area2 = np.sum(lon[:-1] * lat[1:] - lon[1:] * lat[:-1])
                dr.polygon(list(zip(px.tolist(), pz.tolist())), fill=index[r['AQ_CODE']] if area2 < 0 else 0)
        a = np.asarray(img)
        Image.fromarray(a, 'L').save(f'{NET}/{slab}_aquifer.png', optimize=True)
        print(slab, 'aquifer raster', a.shape, 'covered', round(float((a > 0).mean()), 3), os.path.getsize(f'{NET}/{slab}_aquifer.png') // 1024, 'KB')

if __name__ == '__main__':
    main()
