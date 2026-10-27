"""Sewage treatment plants with an individual NPDES permit in effect (EPA ECHO npdes_outfalls_layer.csv, downloaded
2026-10-25): permits whose first SIC code is 4952 (sewerage systems), with no SIC code and NAICS 221320 (sewage
treatment facilities), or with a POTW (publicly owned treatment works) component. One record per permit: the plant's
location (its Facility row, or its first external outfall), its external outfalls with the water each discharges to,
the owner type, and the design flow as recorded (Mgal/d). Run on the downloading computer, then add the registry ids:

  python3 npdes_sewage.py npdes_outfalls_layer.csv sewage.json
  python3 npdes_join.py ECHO_EXPORTER.csv sewage.json npdes_sewage_2026-10.json
"""
import csv, sys, json, collections
src = sys.argv[1]; out = sys.argv[2]
def lines(path):
    for raw in open(path, 'rb'):
        yield raw.replace(b'\x00', b'').decode('utf-8', 'replace')
r = csv.reader(lines(src)); hdr = next(r); ix = {h: i for i, h in enumerate(hdr)}
P = {}
stat = collections.Counter()
for row in r:
    g = lambda k: row[ix[k]].strip()
    if g('PERMIT_TYPE_CODE') != 'NPD' or g('PERMIT_STATUS_CODE') not in ('EFF', 'ADC'): continue
    pid = g('EXTERNAL_PERMIT_NMBR')
    p = P.get(pid)
    if p is None:
        sics = g('SIC_CODES').split(); naics = g('NAICS_CODES').replace(',', ' ').split()
        comp = g('PERMIT_COMPONENTS')
        potw = 'POTW' in comp.split(', ') or 'POTW' in comp.split(',')
        why = '4952' if sics and sics[0] == '4952' else 'naics' if not sics and '221320' in naics else 'potw' if potw else None
        if why is None: P[pid] = False; continue
        stat[why] += 1
        try: flow = float(g('TOTAL_DESIGN_FLOW_NMBR')) if g('TOTAL_DESIGN_FLOW_NMBR') else None
        except ValueError: flow = None
        p = P[pid] = dict(id=pid, name=g('FACILITY_NAME'), city=g('CITY'), st=g('STATE_CODE'), county=g('FAC_COUNTY_NAME'),
                          own=g('FACILITY_TYPE_CODE'), potw=potw, why=why, sics=sics, flow=flow, major=g('MAJOR_MINOR_FLAG') == 'Major',
                          status=g('PERMIT_STATUS_CODE'), comp=comp, fac=None, outs=[], water=collections.Counter())
    if p is False: continue
    try: lat, lon = float(g('LATITUDE83')), float(g('LONGITUDE83'))
    except ValueError: lat = lon = None
    wb = g('STATE_WATER_BODY_NAME')
    if g('LATLONG_TYPE') == 'Facility':
        if lat is not None and p['fac'] is None: p['fac'] = (lat, lon)
    elif g('SUB_TYPE_DESC') in ('External Outfall', ''):
        if lat is not None: p['outs'].append((round(lat, 5), round(lon, 5), g('PERM_FEATURE_NMBR'), wb))
    if wb: p['water'][wb] += 1
recs = []; noloc = 0; facrow = 0
for p in P.values():
    if not p: continue
    loc = p['fac'] or (p['outs'][0][:2] if p['outs'] else None)
    if loc is None or not (17 < loc[0] < 72) or not (-180 < loc[1] < -64): noloc += 1; continue
    if p['fac']: facrow += 1
    # outfalls in the same place as the plant, or listed twice, add nothing to the map
    seen = set(); outs = []
    for o in p['outs']:
        k = (round(o[0], 4), round(o[1], 4))
        if k in seen or not (17 < o[0] < 72) or not (-180 < o[1] < -64): continue
        seen.add(k); outs.append(o)
    p.update(lat=round(loc[0], 5), lon=round(loc[1], 5), fac_row=bool(p['fac']), water=[w for w, _ in p['water'].most_common(2)], outs=outs)
    del p['fac']
    recs.append(p)
json.dump({'facilities': recs}, open(out, 'w'), separators=(',', ':'))
print(dict(stat), 'kept', len(recs), 'with a facility location', facrow, 'no location', noloc)
print('owners', collections.Counter(p['own'] for p in recs).most_common())
print('outfalls', sum(len(p['outs']) for p in recs), 'with design flow', sum(1 for p in recs if p['flow']), 'major', sum(1 for p in recs if p['major']))
