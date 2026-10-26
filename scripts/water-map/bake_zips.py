"""ZIP code lookup: each 2020 ZIP Code Tabulation Area matched to the county holding most of its land.

Input: the Census Bureau's 2020 ZCTA-to-county relationship file, tab20_zcta520_county20_natl.txt (pipe-delimited,
6,821,287 bytes, sha256 3ed41278...aaaf), and the map's wu.json for the county order.

Output: zips.json, {"z": [ZCTA numbers as deltas from the one before, in ascending order], "c": [index of the county
with the most land in it], "c2": [index of a second county holding at least 10 percent of its land, or -1],
"s": [the first county's share of the ZCTA's land, in percent]}.
"""
import csv, json, sys
from collections import defaultdict

rel_path, wu_path, out_path = sys.argv[1:4]
wu = json.load(open(wu_path))
ix = {f: i for i, f in enumerate(wu['id'])}
# Connecticut's 2020 relationship file uses the old counties, as wu.json (USGS 2015) does. Alaska's Chugach and Copper
# River census areas were split from Valdez-Cordova in 2019; USGS counted them as Valdez-Cordova.
REMAP = {'02063': '02261', '02066': '02261'}
parts = defaultdict(list)
miss = defaultdict(float)
with open(rel_path, encoding='utf-8-sig') as f:
    r = csv.DictReader(f, delimiter='|')
    for row in r:
        z = row['GEOID_ZCTA5_20']
        if not z: continue
        c = REMAP.get(row['GEOID_COUNTY_20'], row['GEOID_COUNTY_20'])
        land = float(row['AREALAND_PART'] or 0)
        if c in ix: parts[z].append((land, ix[c]))
        else: miss[c] += land
zs, cs, c2s, ss = [], [], [], []
for z in sorted(parts, key=int):
    p = sorted(parts[z], reverse=True)
    tot = sum(a for a, _ in p)
    if tot <= 0:
        p = [(1, p[0][1])]; tot = 1
    zs.append(int(z)); cs.append(p[0][1]); ss.append(round(100 * p[0][0] / tot))
    c2s.append(p[1][1] if len(p) > 1 and p[1][0] / tot >= 0.10 else -1)
dz = [zs[0]] + [b - a for a, b in zip(zs, zs[1:])]
json.dump({'z': dz, 'c': cs, 'c2': c2s, 's': ss}, open(out_path, 'w'), separators=(',', ':'))
print('ZCTAs', len(zs), 'split (second county >=10%)', sum(1 for x in c2s if x >= 0))
print('counties in the file but not on the map', sorted(miss)[:20], len(miss))
