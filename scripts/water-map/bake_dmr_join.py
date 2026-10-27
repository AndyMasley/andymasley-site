"""The measured 2015 flows (proc/net/dmr_flows.json, bake_dmr.py) joined, by permit, onto the facilities and sewage
plants already baked into public/water-map/data (npdes.json and npdes.dat.png from bake_npdes.py, sewage.json and
sewage.dat.png from bake_sewage.py). Run it after either of those.

Each point gets dmr[i] = [Mgal/d, months reported, outfalls, flags] or 0 where its permit reported no flow in 2015.
flags, when the reported flow is probably in the wrong units (1, 2 and 4 are the tests it failed):
  1 for a facility, more than ten times everything USGS counted as withdrawn in its county in 2015 (the design flows'
    test in bake_npdes.py); for a sewage plant, more than 3,000 gallons a day for everyone in its county, or 1 Mgal/d
    where fewer than 333 live (the design flows' test in bake_sewage.py);
  2 more than a thousand times a facility's own recorded design flow (a factory's design flow often covers only its
    process water, so smaller multiples are no sign of error), or more than ten times a sewage plant's (what it was
    built to treat on an average day);
  4 a sewage plant on a minor permit reporting more than 10 Mgal/d with no design flow of 10 or more, since EPA counts
    as major every sewage plant built for 1 Mgal/d or serving 10,000 people. Combined-sewer overflow and retention
    basin facilities (CSO, RTB in the name), which treat only storm flows, are not held to this test.

  python3 bake_dmr_join.py
"""
import json, os, re, struct, sys, collections, numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(__file__))
from netlib import NET
from bake_npdes import county_total

WEB = os.path.join(os.path.dirname(__file__), '../../public/water-map/data')

def packed(fn):
    """the bytes packed into a lossless RGB PNG (4-byte little-endian length, then the data), as assets.js reads them"""
    a = np.asarray(Image.open(fn).convert('RGB')).reshape(-1)
    n = int(a[0]) | int(a[1]) << 8 | int(a[2]) << 16 | int(a[3]) << 24
    return a[4:4 + n].tobytes()

def points(fn, magic):
    """county, design flow and flags of every point in a baked npdes.dat.png or sewage.dat.png"""
    b = packed(fn)
    assert b[:4] == magic, (fn, b[:4])
    n = struct.unpack('<I', b[4:8])[0]; o = 8 + 8 * n + 2 * n      # x, z (f32) then two u8 arrays
    county = np.frombuffer(b, '<i2', n, o); o += 2 * n
    flow = np.frombuffer(b, '<f4', n, o); o += 4 * n
    flags = np.frombuffer(b, 'u1', n, o)
    return n, county, flow, flags

def main():
    D = json.load(open(f'{NET}/dmr_flows.json'))
    wu = json.load(open(f'{WEB}/wu.json'))
    report = {}
    storm = re.compile(r'\b(CSO|RTB)\b|retention treatment', re.I)
    for name, magic, too_big, over_design in [('npdes', b'NPD1', lambda c: 10 * county_total(wu, c), 1000),
                                              ('sewage', b'SEW1', lambda c: max(1.0, 3.0 * (wu['pop'][c] or 0)), 10)]:
        meta = json.load(open(f'{WEB}/{name}.json'))
        n, county, flow, flags = points(f'{WEB}/{name}.dat.png', magic)
        assert n == len(meta['permit']), (name, n, len(meta['permit']))
        out = []; st = collections.Counter(); ratio = []
        for i, p in enumerate(meta['permit']):
            d = D.get(p)
            if not d: out.append(0); continue
            m, months, outs = d
            design = float(flow[i]) if flow[i] > 0 and not flags[i] & 2 else 0.0
            c = int(county[i])
            bad = (1 if c >= 0 and m > too_big(c) else 0) | (2 if design > 0 and m > over_design * design else 0)
            if name == 'sewage' and not flags[i] & 1 and m > 10 and design < 10 and not storm.search(meta['names'][i]): bad |= 4
            out.append([m, months, outs, bad])
            st['reported'] += 1; st['flagged'] += bad > 0; st['no discharge all year'] += m == 0
            for b in (1, 2, 4): st[f'flag {b}'] += (bad & b) > 0
            if design > 0 and m > 0 and not bad: ratio.append(m / design)
        meta['dmr'] = out
        json.dump(meta, open(f'{WEB}/{name}.json', 'w'), separators=(',', ':'))
        tot = sum(v[0] for v in out if v and not v[3])
        r = np.array(ratio)
        report[name] = dict(points=n, **st, total_mgd=round(tot, 1),
                            ratio_to_design=dict(n=len(r), median=round(float(np.median(r)), 3) if len(r) else None,
                                                 over_1=int((r > 1).sum()), over_10=int((r > 10).sum())))
        print(name, json.dumps(report[name]))
        big = sorted(((v[0], meta['names'][i], meta['place'][i], float(flow[i])) for i, v in enumerate(out) if v and v[3]), reverse=True)
        for b in big[:12]: print('   flagged', b)
    return report

if __name__ == '__main__':
    main()
