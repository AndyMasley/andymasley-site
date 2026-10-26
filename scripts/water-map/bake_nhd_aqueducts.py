"""Aqueducts OpenStreetMap maps only in pieces, redrawn from the USGS National Hydrography Dataset.

Input: one JSON file per aqueduct from the NHD map service's large-scale flowlines (hydro.nationalmap.gov, nhd
MapServer layer 6), queried by GNIS name over tiles along the aqueduct's corridor, in lon/lat (outSR 4326). The first
line of each file is a '# source: ...' comment and the rest a list of {fc: NHD FCode, km: lengthkm, paths: [[[lon, lat],
...], ...]}. Pipelines (FCodes 428xx) are drawn dashed like the tunnels and pipelines from OpenStreetMap; canal reaches
and the paths through reservoirs on the line (33xxx, 558xx) are drawn solid.

Usage: python bake_nhd_aqueducts.py features.json 'Colorado River Aqueduct=nhd_colorado_river_aqueduct.json' ...
replaces each named aqueduct's segments in features.json (bake_features.py calls nhd_override for the same result).
"""
import json, os, sys
import numpy as np
from shapely.geometry import LineString, MultiLineString
from shapely.ops import linemerge
sys.path.insert(0, os.path.dirname(__file__))
from proj import SLABS

KM_PER_UNIT = 5.135487417266569   # conus_meta.json km_per_unit, the scale bake_features.py measures aqueducts with

def read_nhd(path):
    with open(path) as f:
        head = f.readline()
        assert head.startswith('# source:'), path
        return json.load(f)

def nhd_segments(feats):
    """scene segments (u = drawn dashed) and the mapped length in km; flowlines of one kind that meet end to end are
    joined into one line"""
    P = SLABS['conus']['proj']
    lines = {True: [], False: []}
    for ft in feats:
        under = str(ft['fc']).startswith('428')
        for path in ft['paths']:
            a = np.asarray(path, float)
            if len(a) < 2: continue
            X, Y = P.forward(a[:, 0], a[:, 1])
            lines[under].append(LineString(np.stack([X, Y], 1)))
    segs, total = [], 0.0
    for under, ls in lines.items():
        if not ls: continue
        m = linemerge(MultiLineString(ls))
        for g in (m.geoms if hasattr(m, 'geoms') else [m]):
            s = g.simplify(0.02)
            c = np.asarray(s.coords)
            if len(c) < 2: continue
            total += s.length * KM_PER_UNIT
            segs.append(dict(u=bool(under), p=np.round(c, 3).ravel().tolist()))
    return segs, total

def nhd_override(aqueducts, files):
    """files: {aqueduct name: NHD json path}; replaces (or adds) those aqueducts' segments"""
    byname = {a['name']: a for a in aqueducts}
    for name, path in files.items():
        feats = read_nhd(path)
        segs, km = nhd_segments(feats)
        a = byname.get(name)
        if a is None:
            raise SystemExit(f'{name} is not among the aqueducts; add it to AQ_KEEP in bake_features.py first')
        a['segs'] = segs; a['km'] = round(km); a['geom'] = 'nhd'
        nkm = sum(f.get('km') or 0 for f in feats)
        print(f'{name}: {len(feats)} NHD flowlines, {nkm:.1f} km by NHD lengthkm, {km:.1f} km as drawn, {len(segs)} segments,'
              f' {sum(1 for s in segs if s["u"])} dashed')
    return aqueducts

if __name__ == '__main__':
    out = sys.argv[1]
    files = dict(arg.split('=', 1) for arg in sys.argv[2:])
    F = json.load(open(out))
    nhd_override(F['aqueducts'], files)
    json.dump(F, open(out, 'w'), separators=(',', ':'))
    print('wrote', out, os.path.getsize(out))
