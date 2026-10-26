"""County water withdrawals every five years, 1985 to 2015, from the USGS county files, on the map's 2015 counties.

Inputs (raw downloads, not in the repo; water.usgs.gov/watuse/data/<year>/): us85co.txt, us90co.txt, us95co.txt,
usco2000.txt, usco2005.txt, usco2010.txt (tab-delimited), and the map's wu.json for 2015 and the county order.

Output: history.json, {"years": [...], "id": [...fips], "t": [[total withdrawals per year]], "pt": [[power plants]],
"ir": [[irrigation, crops and golf courses together]], "ps": [[public supply]]}, million gallons a day, one decimal;
null where USGS has no figure for the county that year (it did not yet exist, or its area was counted in another).

Where USGS changed its categories or its counties:
  - 1985-1995 totals include self-supplied commercial water, which USGS stopped estimating in 2000;
  - the 2000 county file's TO-WTotl leaves out part of the water it lists (its parts add up to the national 408 billion
    gallons a day, its TO-WTotl to 330), so 2000 totals are the sum of the parts;
  - counties are matched by FIPS code, with renames carried to the 2015 code (Dade to Miami-Dade, Shannon to Oglala
    Lakota) and cities folded into their counties later added to the county (Clifton Forge, South Boston, Bedford).
"""
import csv, json, sys, os

src_dir, wu_path, out_path = sys.argv[1:4]
wu = json.load(open(wu_path))
F = wu['fields']; ix = {f: i for i, f in enumerate(wu['id'])}
col = lambda k: wu[k] if k in wu else [r[F.index(k)] for r in wu['data']]
YEARS = [1985, 1990, 1995, 2000, 2005, 2010, 2015]
RENAME = {'12025': '12086', '46113': '46102', '51560': '51005', '51780': '51083', '51515': '51019', '29193': '29186'}

def num(v):
    try: return float(v)
    except (TypeError, ValueError): return 0.0

def read(name):
    rows = list(csv.reader(open(os.path.join(src_dir, name), encoding='latin-1'), delimiter='\t'))
    hdr = [h.strip() for h in rows[0]]
    return [dict(zip(hdr, r)) for r in rows[1:] if len(r) > 4]

def fips(d):
    if d.get('FIPS', '').strip(): return d['FIPS'].strip().zfill(5)
    if d.get('STATEFIPS', '').strip(): return d['STATEFIPS'].strip().zfill(2) + d['COUNTYFIPS'].strip().zfill(3)
    if 'scode' in d: return d['scode'].strip().zfill(2) + d['area'].strip().zfill(3)
    if 'StateCode' in d: return d['StateCode'].strip().zfill(2) + d['CountyCode'].strip().zfill(3)
    return None

def year_values(y):
    out = {}
    if y in (1985, 1990):
        rows = read('us85co.txt' if y == 1985 else 'us90co.txt')
        g = lambda d: (num(d['to-total']), num(d['pt-wtotl']), num(d['ir-frtot']), num(d['ps-total']))
    elif y == 1995:
        rows = read('us95co.txt')
        g = lambda d: (num(d['TO-WTotl']), num(d['PT-WTotl']), num(d['IR-WTotl']), num(d['PS-WTotl']))
    elif y == 2000:
        rows = read('usco2000.txt')
        parts = ['PS-WFrTo', 'DO-WFrTo', 'IN-Wtotl', 'IT-WFrTo', 'LA-WFrTo', 'LS-WFrTo', 'MI-Wtotl', 'PT-Wtotl']
        g = lambda d: (sum(num(d[p]) for p in parts), num(d['PT-Wtotl']), num(d['IT-WFrTo']), num(d['PS-WFrTo']))
    else:
        rows = read('usco2005.txt' if y == 2005 else 'usco2010.txt')
        g = lambda d: (num(d['TO-WTotl']), num(d['PT-Wtotl']), num(d['IR-WFrTo']), num(d['PS-Wtotl']))
    for d in rows:
        f = fips(d)
        if not f or f.endswith('000'): continue
        f = RENAME.get(f, f)
        v = g(d)
        if f in out: out[f] = tuple(a + b for a, b in zip(out[f], v))
        else: out[f] = v
    return out

n = len(wu['id'])
T = [[None] * len(YEARS) for _ in range(n)]; PT = [[None] * len(YEARS) for _ in range(n)]
IR = [[None] * len(YEARS) for _ in range(n)]; PS = [[None] * len(YEARS) for _ in range(n)]
for k, y in enumerate(YEARS[:-1]):
    vals = year_values(y)
    nat = [0, 0, 0, 0]; miss = []
    for f, v in vals.items():
        for j in range(4): nat[j] += v[j]
        i = ix.get(f)
        if i is None: miss.append(f); continue
        T[i][k], PT[i][k], IR[i][k], PS[i][k] = (round(x, 1) for x in v)
    print(y, 'national total, power, irrigation, public supply (Bgal/d):', [round(x / 1000, 1) for x in nat], 'not on the 2015 map:', sorted(miss))
# 2015: the map's own figures (wu.json)
g = lambda k: col(k)
for i in range(n):
    s = lambda *ks: sum(num(g(k)[i]) for k in ks)
    ps = s('ps_gf', 'ps_gs', 'ps_sf', 'ps_ss'); pt = s('po_gf', 'po_gs', 'po_sf', 'po_ss', 'pc_gf', 'pc_gs', 'pc_sf', 'pc_ss')
    ir = s('ir_gf', 'ir_sf')
    tot = ps + pt + ir + s('do_gf', 'do_sf', 'in_gf', 'in_gs', 'in_sf', 'in_ss', 'li_gf', 'li_sf', 'aq_gf', 'aq_gs', 'aq_sf', 'aq_ss', 'mi_gf', 'mi_gs', 'mi_sf', 'mi_ss')
    T[i][-1], PT[i][-1], IR[i][-1], PS[i][-1] = round(tot, 1), round(pt, 1), round(ir, 1), round(ps, 1)
print(2015, 'national total, power, irrigation, public supply (Bgal/d):', [round(sum(a[-1] for a in A) / 1000, 1) for A in (T, PT, IR, PS)])
json.dump({'years': YEARS, 'id': wu['id'], 't': T, 'pt': PT, 'ir': IR, 'ps': PS}, open(out_path, 'w'), separators=(',', ':'))
print('wrote', out_path, os.path.getsize(out_path), 'bytes')
