"""Measured flows in 2015, from EPA ECHO's ICIS-NPDES discharge monitoring report (DMR) downloads for fiscal 2015 and
fiscal 2016 (npdes_dmrs_fy2015.zip, npdes_dmrs_fy2016.zip; a fiscal year runs October to September, so the two hold
calendar 2015 between them). Keeps every reported value of parameter 50050 (flow, in conduit or through treatment
plant) whose monitoring period ended in 2015, and writes them, one row per value, as a gzipped CSV for the bake:

  permit, outfall, outfall type, monitoring location, statistical base, value type, month (1-12), value in standard
  units, standard unit, no-data code, statistical base type

It also prints how the values divide among those fields, so the rule that picks each outfall's monthly average can be
checked against the data. Run on the downloading computer (Python 3 only); the zips are read as streams, never unpacked:

  python3 npdes_dmr_flows.py npdes_dmrs_fy2015.zip npdes_dmrs_fy2016.zip dmr_flow_2015.csv.gz

The inputs can also be the zips' CSVs cut down to the flow rows first, which is much faster, as long as the header
line is kept (any row with ',"50050",' in it is a superset of the flow rows; the parameter code is checked again here):

  unzip -p npdes_dmrs_fy2015.zip | grep -F -e '"ACTIVITY_ID"' -e ',"50050",' | gzip -1 > fy2015_50050.csv.gz
"""
import csv, gzip, io, sys, zipfile, collections, time

def members(zf):
    return [n for n in zf.namelist() if n.lower().endswith('.csv')]

def sources(fn):
    """(name, binary stream) for each CSV in a DMR zip, or the one CSV in a plain or gzipped file."""
    if fn.lower().endswith('.zip'):
        zf = zipfile.ZipFile(fn)
        return [(m, zf.open(m)) for m in members(zf)]
    return [(fn, gzip.open(fn) if fn.lower().endswith('.gz') else open(fn, 'rb'))]

def main(argv):
    out = argv[-1]; srcs = argv[:-1]
    csv.field_size_limit(10 ** 8)
    fo = io.TextIOWrapper(gzip.open(out, 'wb'), encoding='utf-8', newline='')
    W = csv.writer(fo)
    W.writerow(['permit', 'outfall', 'ftype', 'loc', 'stat', 'vtype', 'month', 'value', 'unit', 'nodi', 'stype'])
    C = collections.defaultdict(collections.Counter)
    n = kept = 0; t0 = time.time()
    for fn in srcs:
        for m, stream in sources(fn):
            print('reading', fn, m, flush=True)
            with stream as raw:
                r = csv.reader(io.TextIOWrapper(raw, encoding='utf-8', errors='replace', newline=''))
                hdr = next(r); ix = {h: i for i, h in enumerate(hdr)}
                need = ['EXTERNAL_PERMIT_NMBR', 'PERM_FEATURE_NMBR', 'PARAMETER_CODE', 'MONITORING_PERIOD_END_DATE', 'STATISTICAL_BASE_CODE', 'VALUE_TYPE_CODE']
                miss = [k for k in need if k not in ix]
                if miss: print('missing columns', miss, 'have', hdr); return
                g = lambda row, k: row[ix[k]] if k in ix and ix[k] < len(row) else ''
                iP = ix['PARAMETER_CODE']
                for row in r:
                    n += 1
                    if n % 5_000_000 == 0: print(n, 'rows', kept, 'kept', round(time.time() - t0), 's', flush=True)
                    if len(row) <= iP or row[iP].strip() != '50050': continue
                    d = g(row, 'MONITORING_PERIOD_END_DATE').strip()
                    # MM/DD/YYYY
                    if len(d) < 10 or d[6:10] != '2015': continue
                    try: month = int(d[0:2])
                    except ValueError: continue
                    ft, loc, stat, vt = g(row, 'PERM_FEATURE_TYPE_CODE'), g(row, 'MONITORING_LOCATION_CODE'), g(row, 'STATISTICAL_BASE_CODE'), g(row, 'VALUE_TYPE_CODE')
                    unit = g(row, 'STANDARD_UNIT_DESC') or g(row, 'DMR_UNIT_DESC')
                    val = g(row, 'DMR_VALUE_STANDARD_UNITS') or g(row, 'DMR_VALUE_NMBR')
                    nodi = g(row, 'NODI_CODE'); stype = g(row, 'STATISTICAL_BASE_TYPE_CODE')
                    W.writerow([g(row, 'EXTERNAL_PERMIT_NMBR'), g(row, 'PERM_FEATURE_NMBR'), ft, loc, stat, vt, month, val, unit, nodi, stype]); kept += 1
                    C['ftype'][ft] += 1; C['loc'][loc] += 1; C['stat'][(stat, stype, g(row, 'STATISTICAL_BASE_SHORT_DESC') or g(row, 'STATISTICAL_BASE_DESC'))] += 1
                    C['vtype'][vt] += 1; C['unit'][unit] += 1; C['nodi'][nodi] += 1
                    C['stat x vtype'][(stat, vt)] += 1; C['loc x ftype'][(loc, ft)] += 1
    fo.close()
    print('rows', n, 'flow values in 2015', kept, round(time.time() - t0), 's')
    for k, c in C.items(): print(k, c.most_common(25))

if __name__ == '__main__':
    main(sys.argv[1:])
