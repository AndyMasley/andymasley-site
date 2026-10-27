"""Each permit's measured flow in 2015, from the discharge monitoring reports (dmr_flow_2015.csv.gz, written on the
downloading computer by npdes_dmr_flows.py from EPA ECHO's fiscal 2015 and 2016 DMR downloads).

A permit's flow in a month is the sum, over its external outfalls, of each outfall's reported monthly average of
parameter 50050 (flow, in conduit or through treatment plant) for its effluent; its 2015 flow is the mean over the
months it reported. Where an outfall reported more than one monthly average for a month (several limit sets), the
largest is taken. A month reported as "no discharge" (NODI code C) counts as no flow from that outfall; values reported
as missing for any other reason (the other NODI codes) are left out.

Which codes are which, from npdes_dmr_flows.py's tallies of the data and ECHO's reference tables:
  - monthly averages: the statistical base codes ECHO flags as monthly averages (STATISTICAL_BASE_MONTHLY_AVG = A in
    REF_STATISTICAL_BASE.csv, 8,218 bytes, sha256 c5fbb9b2031606770953ed579382a99cdd815d327a5ca18eb97cf8eaddd6fcc3,
    last modified October 24, 2026): monthly, 30-day and daily averages, arithmetic or geometric;
  - effluent: monitoring locations 1 and EG (effluent gross) and Y (effluent gross, supplementary);
  - external outfalls: permitted feature type EXO (internal outfalls, influent, sums and land application are left out).
Every 2015 flow value in the two files is in MGD.

Output (proc/net): dmr_flows.json {permit: [mean Mgal/d, months reported, outfalls]}

  python3 bake_dmr.py [dmr_flow_2015.csv.gz] [outdir]
"""
import csv, gzip, io, json, os, sys, collections, statistics
sys.path.insert(0, os.path.dirname(__file__))
from netlib import NET, RAW

SRC = f'{RAW}/npdes/dmr_flow_2015.csv.gz'
AVG_STAT = {'DA', 'DB', 'MK', 'ML', 'MM', 'M4', '3A', '3B', '3C', '3D', '3F', '3H'}
EFFLUENT_LOC = {'1', 'EG', 'Y'}
EXTERNAL = {'EXO'}
NO_DISCHARGE = 'C'
UNITS = {'MGD': 1.0, 'Mgal/d': 1.0, 'gal/d': 1e-6, 'GPD': 1e-6}

def main(src=SRC, outdir=NET):
    r = csv.DictReader(io.TextIOWrapper(gzip.open(src), encoding='utf-8'))
    V = collections.defaultdict(lambda: collections.defaultdict(float))   # (permit, month) -> outfall -> value
    skipped = collections.Counter(); zeros = 0
    for row in r:
        if row['stat'] not in AVG_STAT: skipped['stat'] += 1; continue
        if row['loc'] not in EFFLUENT_LOC: skipped['loc'] += 1; continue
        if row['ftype'] not in EXTERNAL: skipped['ftype'] += 1; continue
        if row['nodi'] == NO_DISCHARGE: v = 0.0; zeros += 1
        elif row['nodi']: skipped['nodi ' + row['nodi']] += 1; continue
        else:
            k = UNITS.get(row['unit'])
            if k is None: skipped['unit ' + row['unit']] += 1; continue
            try: v = float(row['value']) * k
            except ValueError: skipped['value'] += 1; continue
            if v < 0: skipped['negative'] += 1; continue
        cell = V[(row['permit'], int(row['month']))]
        cell[row['outfall']] = max(cell[row['outfall']], v)
    per = collections.defaultdict(list); outs_of = collections.defaultdict(set)
    for (p, m), outs in V.items():
        per[p].append(sum(outs.values())); outs_of[p].update(outs)
    out = {p: [round(statistics.fmean(vs), 4), len(vs), len(outs_of[p])] for p, vs in sorted(per.items())}
    json.dump(out, open(f'{outdir}/dmr_flows.json', 'w'), separators=(',', ':'))
    total = sum(v[0] for v in out.values())
    print('permits with a measured flow in 2015', len(out), 'total Mgal/d', round(total, 1), 'no-discharge values', zeros,
          'months', collections.Counter(v[1] for v in out.values()).most_common(13), 'skipped', dict(skipped.most_common(20)))

if __name__ == '__main__':
    main(*sys.argv[1:3])
