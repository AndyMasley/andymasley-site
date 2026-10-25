"""Every dam in the National Inventory of Dams (USACE, data last updated 2026-10-23) as scene points.

Output (proc/net):
  dams_nid.bin    'DAM1', u32 n, then column arrays (sorted by storage, largest first):
                  f32 x[n], f32 z[n], f32 storage_af[n], u16 height_ft[n], u16 year[n],
                  u8 purpose[n], u8 dtype[n], u8 hazard[n], u8 slab[n], u16 purposes_mask[n], u8 owner[n], u8 state_fips[n], u8 flags[n] (1 = shares the storage of a main dam)
  dams_nid.json   per dam [name, river]; lookup tables
"""
import csv, json, struct, sys, os, numpy as np
sys.path.insert(0, os.path.dirname(__file__))
from netlib import to_scene, in_rect, NET, RAW
from proj import SLABS

STATES = {'Alabama':'01','Alaska':'02','Arizona':'04','Arkansas':'05','California':'06','Colorado':'08','Connecticut':'09','Delaware':'10','District of Columbia':'11','Florida':'12','Georgia':'13','Hawaii':'15','Idaho':'16','Illinois':'17','Indiana':'18','Iowa':'19','Kansas':'20','Kentucky':'21','Louisiana':'22','Maine':'23','Maryland':'24','Massachusetts':'25','Michigan':'26','Minnesota':'27','Mississippi':'28','Missouri':'29','Montana':'30','Nebraska':'31','Nevada':'32','New Hampshire':'33','New Jersey':'34','New Mexico':'35','New York':'36','North Carolina':'37','North Dakota':'38','Ohio':'39','Oklahoma':'40','Oregon':'41','Pennsylvania':'42','Rhode Island':'44','South Carolina':'45','South Dakota':'46','Tennessee':'47','Texas':'48','Utah':'49','Vermont':'50','Virginia':'51','Washington':'53','West Virginia':'54','Wisconsin':'55','Wyoming':'56','Puerto Rico':'72','Virgin Islands':'78','U.S. Virgin Islands':'78'}
SLAB_OF = {'02': 'ak', '15': 'hi', '72': 'pr', '78': 'pr'}
SL = {'conus': 0, 'ak': 1, 'hi': 2, 'pr': 3}
PURPOSES = ['Other', 'Recreation', 'Flood Risk Reduction', 'Fire Protection, Stock, Or Small Fish Pond', 'Irrigation',
            'Water Supply', 'Fish and Wildlife Pond', 'Hydroelectric', 'Tailings', 'Grade Stabilization', 'Debris Control', 'Navigation']
TYPES = ['Other', 'Earth', 'Rockfill', 'Gravity', 'Concrete', 'Arch', 'Buttress', 'Masonry', 'Multi-Arch', 'Stone', 'Timber Crib', 'Roller-Compacted Concrete']
HAZ = {'Low': 1, 'Significant': 2, 'High': 3, 'Undetermined': 0}
OWNERS = ['Other', 'Private', 'Local Government', 'State', 'Federal', 'Public Utility', 'Tribal']

def num(s):
    try: return float(s)
    except Exception: return 0.0

def main():
    f = open(f'{RAW}/nid/nation.csv', encoding='utf-8', errors='replace')
    updated = next(f).strip()
    r = csv.reader(f); h = next(r); ix = {n: i for i, n in enumerate(h)}
    rows = []
    skipped = 0
    for row in r:
        if len(row) < len(h): skipped += 1; continue
        st = STATES.get(row[ix['State']])
        lat, lon = num(row[ix['Latitude']]), num(row[ix['Longitude']])
        if st is None or lat == 0 or lon == 0: skipped += 1; continue
        slab = SLAB_OF.get(st, 'conus')
        x, z = to_scene(slab, lon, lat)
        S = SLABS[slab]; X, Y = x - S['offset'][0], z - S['offset'][1]
        if not in_rect(slab, X, Y): skipped += 1; continue
        pp = row[ix['Primary Purpose']]
        dt = row[ix['Primary Dam Type']]
        stor = max(num(row[ix['NID Storage (Acre-Ft)']]), num(row[ix['Normal Storage (Acre-Ft)']]))
        assoc = row[ix['Is Associated Structure?']].strip() == 'Yes'
        rows.append(dict(x=float(x), z=float(z), stor=stor, assoc=assoc, key=(st, round(stor), row[ix['Dam Name']].split(' - ')[0].strip().lower()),
                         ht=int(min(65535, max(0, num(row[ix['NID Height (Ft)']])))),
                         yr=int(min(65535, max(0, num(row[ix['Year Completed']])))),
                         pu=PURPOSES.index(pp) if pp in PURPOSES else 0,
                         ty=TYPES.index(dt) if dt in TYPES else 0,
                         hz=HAZ.get(row[ix['Hazard Potential Classification']], 0), sl=SL[slab],
                         pm=sum(1 << PURPOSES.index(p.strip()) for p in row[ix['Purposes']].split(',') if p.strip() in PURPOSES),
                         ow=OWNERS.index(row[ix['Primary Owner Type']].strip()) if row[ix['Primary Owner Type']].strip() in OWNERS else 0,
                         fp=int(st),
                         meta=[row[ix['Dam Name']].strip().title() if row[ix['Dam Name']].isupper() else row[ix['Dam Name']].strip(),
                               row[ix['River or Stream Name']].strip()]))
    # associated structures (dikes, levees of a main dam) repeat the main dam's storage: count it once
    seen = set()
    for d in sorted(rows, key=lambda d: (d['assoc'], -d['stor'])):
        if d['stor'] > 0 and (d['assoc'] or d['key'] in seen): d['fl'] = 1; d['stor_sz'] = 0.0
        else: d['fl'] = 0; d['stor_sz'] = d['stor']; seen.add(d['key'])
    rows.sort(key=lambda d: -d['stor_sz'])
    n = len(rows)
    col = lambda k, dt: np.array([d[k] for d in rows], dt)
    buf = struct.pack('<4sI', b'DAM1', n)
    for k, dt in [('x', '<f4'), ('z', '<f4'), ('stor', '<f4'), ('ht', '<u2'), ('yr', '<u2'), ('pu', 'u1'), ('ty', 'u1'), ('hz', 'u1'), ('sl', 'u1'), ('pm', '<u2'), ('ow', 'u1'), ('fp', 'u1'), ('fl', 'u1')]:
        buf += col(k, dt).tobytes()
    open(f'{NET}/dams_nid.bin', 'wb').write(buf)
    json.dump(dict(updated=updated, purposes=PURPOSES, types=TYPES, owners=OWNERS, dams=[d['meta'] for d in rows]), open(f'{NET}/dams_nid.json', 'w'), separators=(',', ':'))
    st = np.array([d['stor_sz'] for d in rows])
    print('dams', n, 'skipped', skipped, 'storage MAF', round(st.sum() / 1e6, 1), '>=1e5 af', int((st >= 1e5).sum()), '>=1e6', int((st >= 1e6).sum()))
    print('sizes', os.path.getsize(f'{NET}/dams_nid.bin') // 1024, 'KB bin', os.path.getsize(f'{NET}/dams_nid.json') // 1024, 'KB json')

if __name__ == '__main__':
    main()
