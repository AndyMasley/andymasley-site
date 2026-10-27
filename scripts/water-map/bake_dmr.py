"""Each permit's measured flow in 2015, from the discharge monitoring reports (dmr_flow_2015.csv.gz, written on the
downloading computer by npdes_dmr_flows.py from EPA ECHO's fiscal 2015 and 2016 DMR downloads).

A permit's flow in a month is the sum, over its external outfalls, of each outfall's reported monthly average of
parameter 50050 (flow, in conduit or through treatment plant) for its effluent; its 2015 flow is the mean over the
months it reported. Where an outfall reported more than one monthly average for a month (several limit sets), the
largest is taken. Values reported as no data (a NODI code) are left out.

Output (proc/net): dmr_flows.json {permit: [mean Mgal/d, months reported]}
"""
import csv, gzip, io, json, os, sys, collections, statistics
sys.path.insert(0, os.path.dirname(__file__))
from netlib import NET, RAW

SRC = f'{RAW}/npdes/dmr_flow_2015.csv.gz'
# (filled in from npdes_dmr_flows.py's tallies of the data: which codes mean a monthly average of the effluent)
AVG_STAT = None
EFFLUENT_LOC = None
EXTERNAL = None
UNITS = {'MGD': 1.0, 'Mgal/d': 1.0, 'gal/d': 1e-6, 'GPD': 1e-6}

def main():
    if AVG_STAT is None: raise SystemExit('set AVG_STAT, EFFLUENT_LOC and EXTERNAL from the tallies first')
    r = csv.DictReader(io.TextIOWrapper(gzip.open(SRC), encoding='utf-8'))
    V = collections.defaultdict(lambda: collections.defaultdict(float))   # (permit, month) -> outfall -> value
    skipped = collections.Counter()
    for row in r:
        if row['stat'] not in AVG_STAT: skipped['stat'] += 1; continue
        if EFFLUENT_LOC and row['loc'] not in EFFLUENT_LOC: skipped['loc'] += 1; continue
        if EXTERNAL and row['ftype'] not in EXTERNAL: skipped['ftype'] += 1; continue
        if row['nodi']: skipped['nodi'] += 1; continue
        k = UNITS.get(row['unit'])
        if k is None: skipped['unit ' + row['unit']] += 1; continue
        try: v = float(row['value']) * k
        except ValueError: skipped['value'] += 1; continue
        if v < 0: skipped['negative'] += 1; continue
        cell = V[(row['permit'], int(row['month']))]
        cell[row['outfall']] = max(cell[row['outfall']], v)
    per = collections.defaultdict(list)
    for (p, m), outs in V.items(): per[p].append(sum(outs.values()))
    out = {p: [round(statistics.fmean(vs), 4), len(vs)] for p, vs in per.items()}
    json.dump(out, open(f'{NET}/dmr_flows.json', 'w'), separators=(',', ':'))
    print('permits with a measured flow in 2015', len(out), 'skipped', dict(skipped))

if __name__ == '__main__':
    main()
