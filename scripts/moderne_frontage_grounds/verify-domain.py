"""Verify every final draped triangle against the pinned bounded footprint."""
from pathlib import Path
import gzip
import json
import os
from shapely.geometry import Polygon
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(os.environ.get('TOWN_ASSEMBLY_OUT', '/private/tmp/webster-paver-band/native'))
catalog = json.loads((ROOT/'data/derived/town/moderne-frontage-grounds.json').read_text())
proof = json.loads((ROOT/'data/source/town/moderne-frontage-ground-proof.json').read_text())
f = catalog['features'][0]
expected = unary_union([Polygon([f['points'][k] for k in f['indices'][i:i+3]]) for i in range(0,len(f['indices']),3)])
protected = unary_union([Polygon(t) for t in proof['protectedTriangles']])
rows = []
for level in [0,1,2]:
    with gzip.open(OUT/f'-12_-4-{level}.domains.json.gz') as stream: domain = json.load(stream)
    triangles = [t for m in domain['siteGrounds'] for t in m['triangles']]
    polys = [Polygon([p[:2] for p in t]) for t in triangles]
    actual = unary_union(polys)
    rows.append({'level':level,'triangles':len(triangles),'actualAreaM2':actual.area,'extraBeyondFloat32BandM2':actual.difference(expected.buffer(.00005)).area,'missingBeyondFloat32BandM2':expected.difference(actual.buffer(.00005)).area,'duplicateTriangleAreaM2':sum(p.area for p in polys)-actual.area,'protectedOverlapM2':actual.intersection(protected.buffer(-.00005)).area,'minHeight':min(p[2] for t in triangles for p in t),'maxHeight':max(p[2] for t in triangles for p in t)})
failures = [r for r in rows if max(r[k] for k in ['extraBeyondFloat32BandM2','missingBeyondFloat32BandM2','protectedOverlapM2']) > 1e-5 or r['duplicateTriangleAreaM2'] > .005]
report = {'status':'FAIL' if failures else 'PASS','policy':'Full emitted geometry; 50 micrometre allowance for tile-local Float32 registration. No overlap with protected source or padded guided-car domain.','rows':rows,'failures':failures}
(OUT/'domain-audit.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report,indent=2))
assert not failures
