import csv, json, sys, unicodedata, math
csv_path, geo_path, out_path = sys.argv[1:4]
rows = list(csv.reader(open(csv_path, encoding='utf-8')))
hdr = [h.strip() for h in rows[1]]
data = [dict(zip(hdr, [x.strip() for x in r])) for r in rows[2:] if len(r) > 5]
geo = json.load(open(geo_path))
cname = {f['properties']['GEOID']: f['properties']['NAME'] for f in geo['features']}

def num(v, nullable=False):
    if v in ('--', 'N/A', ''):
        return None if nullable else 0
    x = float(v)
    return int(x) if x == int(x) else round(x, 3)

def fold(s):
    return ''.join(c for c in unicodedata.normalize('NFKD', s) if not unicodedata.combining(c))

F = [  # (key, column, nullable)
 ('pop','TP-TotPop',0), ('ps_pop','PS-TOPop',0),
 ('ps_gf','PS-WGWFr',0),('ps_gs','PS-WGWSa',0),('ps_sf','PS-WSWFr',0),('ps_ss','PS-WSWSa',0),
 ('do_pop','DO-SSPop',0),('do_gf','DO-WGWFr',0),('do_sf','DO-WSWFr',0),('do_del','DO-PSDel',0),
 ('do_sspc','DO-SSPCp',1),('do_pspc','DO-PSPCp',1),
 ('in_gf','IN-WGWFr',0),('in_gs','IN-WGWSa',0),('in_sf','IN-WSWFr',0),('in_ss','IN-WSWSa',0),
 ('ir_gf','IR-WGWFr',0),('ir_sf','IR-WSWFr',0),('ir_rec','IR-RecWW',0),('ir_cu','IR-CUsFr',0),
 ('ir_spr','IR-IrSpr',0),('ir_mic','IR-IrMic',0),('ir_sur','IR-IrSur',0),
 ('ic_w','IC-WFrTo',1),('ic_rec','IC-RecWW',1),('ic_cu','IC-CUsFr',1),('ic_ac','IC-IrTot',1),
 ('ig_w','IG-WFrTo',1),('ig_rec','IG-RecWW',1),('ig_cu','IG-CUsFr',1),('ig_ac','IG-IrTot',1),
 ('ic_gf','IC-WGWFr',1),('ic_sf','IC-WSWFr',1),('ig_gf','IG-WGWFr',1),('ig_sf','IG-WSWFr',1),
 ('ic_spr','IC-IrSpr',1),('ic_mic','IC-IrMic',1),('ic_sur','IC-IrSur',1),
 ('ig_spr','IG-IrSpr',1),('ig_mic','IG-IrMic',1),('ig_sur','IG-IrSur',1),
 ('li_gf','LI-WGWFr',0),('li_sf','LI-WSWFr',0),
 ('aq_gf','AQ-WGWFr',0),('aq_gs','AQ-WGWSa',0),('aq_sf','AQ-WSWFr',0),('aq_ss','AQ-WSWSa',0),
 ('mi_gf','MI-WGWFr',0),('mi_gs','MI-WGWSa',0),('mi_sf','MI-WSWFr',0),('mi_ss','MI-WSWSa',0),
 ('po_gf','PO-WGWFr',0),('po_gs','PO-WGWSa',0),('po_sf','PO-WSWFr',0),('po_ss','PO-WSWSa',0),
 ('po_rec','PO-RecWW',0),('po_ps','PO-PSDel',0),('po_cuf','PO-CUsFr',0),('po_cus','PO-CUsSa',0),('po_pow','PO-Power',0),
 ('pc_gf','PC-WGWFr',0),('pc_gs','PC-WGWSa',0),('pc_sf','PC-WSWFr',0),('pc_ss','PC-WSWSa',0),
 ('pc_rec','PC-RecWW',0),('pc_ps','PC-PSDel',0),('pc_cuf','PC-CUsFr',0),('pc_cus','PC-CUsSa',0),('pc_pow','PC-Power',0),
]
out = {'fields': [k for k,_,_ in F], 'id': [], 'name': [], 'st': []}
cols = {k: [] for k,_,_ in F}
bad = []
for d in sorted(data, key=lambda d: d['FIPS']):
    fid = d['FIPS']
    u = d['COUNTY']; c = cname[fid]
    if fold(c) != c and u.startswith(fold(c)):
        u = c + u[len(fold(c)):]
    out['id'].append(fid); out['name'].append(u); out['st'].append(d['STATE'])
    for k, col, nl in F:
        cols[k].append(num(d[col], bool(nl)))
    # consistency checks (per county)
    g = lambda col: num(d[col]) or 0
    chk = [
      ('PS', g('PS-Wtotl'), g('PS-WGWFr')+g('PS-WGWSa')+g('PS-WSWFr')+g('PS-WSWSa')),
      ('IN', g('IN-Wtotl'), g('IN-WGWFr')+g('IN-WGWSa')+g('IN-WSWFr')+g('IN-WSWSa')),
      ('AQ', g('AQ-Wtotl'), g('AQ-WGWFr')+g('AQ-WGWSa')+g('AQ-WSWFr')+g('AQ-WSWSa')),
      ('MI', g('MI-Wtotl'), g('MI-WGWFr')+g('MI-WGWSa')+g('MI-WSWFr')+g('MI-WSWSa')),
      ('PT', g('PT-Wtotl'), g('PO-Wtotl')+g('PC-Wtotl')),
      ('PTcu', g('PT-CUTot'), g('PO-CUTot')+g('PC-CUTot')),
      ('PO', g('PO-Wtotl'), g('PO-WGWFr')+g('PO-WGWSa')+g('PO-WSWFr')+g('PO-WSWSa')),
      ('PC', g('PC-Wtotl'), g('PC-WGWFr')+g('PC-WGWSa')+g('PC-WSWFr')+g('PC-WSWSa')),
      ('DO', g('DO-WDelv'), g('DO-WFrTo')+g('DO-PSDel')),
      ('IRsplit', g('IR-WFrTo'), (g('IC-WFrTo')+g('IG-WFrTo')) if d['IC-WFrTo'] not in ('--',) else g('IR-WFrTo')),
      ('IRcu', g('IR-CUsFr'), (g('IC-CUsFr')+g('IG-CUsFr')) if d['IC-CUsFr'] not in ('--',) else g('IR-CUsFr')),
      ('TO', g('TO-Wtotl'), g('PS-Wtotl')+g('DO-WFrTo')+g('IN-Wtotl')+g('IR-WFrTo')+g('LI-WFrTo')+g('AQ-Wtotl')+g('MI-Wtotl')+g('PT-Wtotl')),
    ]
    for name, a, b in chk:
        if abs(a - b) > 0.015 + 1e-4 * abs(a):
            bad.append((fid, d['COUNTY'], d['STATE'], name, a, round(b, 3)))
out.update(cols)
json.dump(out, open(out_path, 'w'), separators=(',', ':'))
print('wrote', out_path, 'counties', len(out['id']))
print('consistency issues:', len(bad))
import collections
print(collections.Counter(b[3] for b in bad))
for b in bad[:25]: print(b)
