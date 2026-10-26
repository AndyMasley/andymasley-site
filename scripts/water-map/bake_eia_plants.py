"""What each power plant's operator reported to the U.S. Energy Information Administration about its cooling water in
2015 (EIA's thermoelectric cooling water data, cooling_summary_2015.xlsx: monthly withdrawal and consumption by cooling
system, from Form EIA-923), added to the plants in features.json as eia_w and eia_c, in Mgal/d over the year.

The summary repeats a cooling system's month on a row for each generator and boiler it serves, so each plant's water is
summed over its cooling systems and months once. Plants with no report have no eia_w.

Usage: python bake_eia_plants.py cooling_summary_2015.xlsx features.json
"""
import json, os, sys
import openpyxl

xlsx, feats = sys.argv[1:3]
ws = openpyxl.load_workbook(xlsx, read_only=True).worksheets[0]
rows = ws.iter_rows(values_only=True)
for _ in range(2): next(rows)
hdr = [str(h).strip() for h in next(rows)]
ix = {h: i for i, h in enumerate(hdr)}
W, C, seen = {}, {}, set()
for r in rows:
    if r[ix['Plant Code']] is None: continue
    plant = int(r[ix['Plant Code']])
    key = (plant, str(r[ix['Cooling ID']]), r[ix['Month']])
    if key in seen: continue
    seen.add(key)
    for d, col in ((W, 'Water Withdrawal Volume (Million Gallons)'), (C, 'Water Consumption Volume (Million Gallons)')):
        v = r[ix[col]]
        if isinstance(v, (int, float)): d[plant] = d.get(plant, 0.0) + v
F = json.load(open(feats))
n = 0
for p in F['plants']:
    p.pop('eia_w', None); p.pop('eia_c', None)
    if p['eia'] in W:
        p['eia_w'] = round(W[p['eia']] / 365, 2); p['eia_c'] = round(C.get(p['eia'], 0.0) / 365, 2); n += 1
json.dump(F, open(feats, 'w'), separators=(',', ':'))
print('plants with an EIA report:', n, 'of', len(F['plants']), '; EIA total withdrawals', round(sum(W.values()) / 365), 'Mgal/d')
