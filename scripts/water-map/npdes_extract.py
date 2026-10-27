"""Facilities with an individual NPDES permit in effect (EPA ECHO npdes_outfalls_layer.csv, downloaded 2026-10-25),
kept when one of their SIC codes (or, with none, their NAICS code) is manufacturing, mining, aquaculture or farming.
One record per permit: the facility's location (its Facility row, or its first external outfall), the receiving
waters named on its rows, and the permit's design flow as recorded (Mgal/d)."""
import csv, sys, json, collections
src = sys.argv[1]; out = sys.argv[2]
def lines(path):
    for raw in open(path, 'rb'):
        yield raw.replace(b'\x00', b'').decode('utf-8', 'replace')
def rows():
    r = csv.reader(lines(src)); hdr = next(r); ix = {h: i for i, h in enumerate(hdr)}
    for row in r: yield (lambda k, row=row: row[ix[k]].strip())
# SIC code -> description, from rows that list a single code (multi-code rows list descriptions alphabetically)
SICD = {}
for g in rows():
    s = g('SIC_CODES').split()
    if len(s) == 1 and g('SIC_DESCRIPTIONS'): SICD.setdefault(s[0], g('SIC_DESCRIPTIONS'))
def kind_of_sic(c):
    v = int(c) if c.isdigit() else -1
    if 2000 <= v <= 3999: return 'factory'
    if 1000 <= v <= 1499: return 'mine'
    if v in (921, 273): return 'fish'
    if 100 <= v <= 299: return 'farm'
    return None
def kind_of_naics(c):
    if c[:2] in ('31', '32', '33'): return 'factory'
    if c[:2] == '21': return 'mine'
    if c[:4] == '1125' or c[:3] == '114': return 'fish'
    if c[:3] in ('111', '112'): return 'farm'
    return None
P = {}
stat = collections.Counter(); nodesc = collections.Counter()
for g in rows():
    if g('PERMIT_TYPE_CODE') != 'NPD' or g('PERMIT_STATUS_CODE') not in ('EFF', 'ADC'): continue
    pid = g('EXTERNAL_PERMIT_NMBR')
    p = P.get(pid)
    if p is None:
        sics = g('SIC_CODES').split(); naics = g('NAICS_CODES').replace(',', ' ').split()
        k = code = None
        for c in sics:   # the lowest-numbered code that is one of the four kinds (codes are listed in order)
            k = kind_of_sic(c)
            if k: code = c; break
        if not k and not sics:
            for c in naics:
                k = kind_of_naics(c)
                if k: code = 'N' + c; break
        if not k: stat['other'] += 1; P[pid] = False; continue
        if code[0] != 'N' and code not in SICD: nodesc[code] += 1
        try: flow = float(g('TOTAL_DESIGN_FLOW_NMBR')) if g('TOTAL_DESIGN_FLOW_NMBR') else None
        except ValueError: flow = None
        p = P[pid] = dict(id=pid, name=g('FACILITY_NAME'), city=g('CITY'), st=g('STATE_CODE'), county=g('FAC_COUNTY_NAME'), kind=k, code=code,
                          sicd=SICD.get(code, '') if code[0] != 'N' else '', sics=sics, naics=naics, flow=flow, major=g('MAJOR_MINOR_FLAG') == 'Major',
                          status=g('PERMIT_STATUS_CODE'), own=g('FACILITY_TYPE_CODE'), comp=g('PERMIT_COMPONENTS'), fac=None, outs=[], water=collections.Counter())
        stat[k] += 1
    if p is False: continue
    try: lat, lon = float(g('LATITUDE83')), float(g('LONGITUDE83'))
    except ValueError: lat = lon = None
    wb = g('STATE_WATER_BODY_NAME')
    if g('LATLONG_TYPE') == 'Facility':
        if lat is not None and p['fac'] is None: p['fac'] = (lat, lon)
    elif lat is not None and g('SUB_TYPE_DESC') in ('External Outfall', ''): p['outs'].append((lat, lon))
    if wb: p['water'][wb] += 1
recs = []; noloc = 0
for p in P.values():
    if not p: continue
    loc = p['fac'] or (p['outs'][0] if p['outs'] else None)
    if loc is None or not (17 < loc[0] < 72) or not (-180 < loc[1] < -64): noloc += 1; continue
    p.update(lat=round(loc[0], 5), lon=round(loc[1], 5), water=[w for w, _ in p['water'].most_common(2)], nout=len(p['outs']))
    del p['fac'], p['outs']
    recs.append(p)
json.dump({'sic': SICD, 'facilities': recs}, open(out, 'w'), separators=(',', ':'))
print(dict(stat), 'kept', len(recs), 'no location', noloc, 'codes without description', nodesc.most_common(10))
print(collections.Counter(p['kind'] for p in recs))
