"""Add the ECHO facility registry id (for the EPA Detailed Facility Report link) from ECHO_EXPORTER.csv (downloaded
2026-10-25) to each permit in the output of npdes_extract.py, matched by NPDES id. Run on the downloading computer:

  python3 npdes_extract.py npdes_outfalls_layer.csv fac.json
  python3 npdes_join.py ECHO_EXPORTER.csv fac.json npdes_facilities_2026-10.json
"""
import csv, sys, json
D = json.load(open(sys.argv[2])); fac = D["facilities"]
want = {p['id']: p for p in fac}
def lines(path):
    for raw in open(path, 'rb'):
        yield raw.replace(b'\x00', b'').decode('utf-8', 'replace')
csv.field_size_limit(10**8)
r = csv.reader(lines(sys.argv[1]))
hdr = next(r); ix = {h: i for i, h in enumerate(hdr)}
iR, iN, iLa, iLo, iA, iDFR, iAcc = ix['REGISTRY_ID'], ix['NPDES_IDS'], ix['FAC_LAT'], ix['FAC_LONG'], ix['FAC_ACTIVE_FLAG'], ix['DFR_URL'], ix['FAC_ACCURACY_METERS']
hit = 0; n = 0; ex = None
for row in r:
    n += 1
    if len(row) <= iN: continue
    ids = row[iN]
    if not ids: continue
    for pid in ids.replace(',', ' ').split():
        p = want.get(pid)
        if p is None or 'reg' in p: continue
        p['reg'] = row[iR]; hit += 1
        if ex is None: ex = row[iDFR]
print('rows', n, 'matched', hit, 'of', len(fac), 'example DFR', ex)
json.dump(D, open(sys.argv[3], "w"), separators=(",", ":"))
