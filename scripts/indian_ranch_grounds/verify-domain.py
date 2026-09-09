"""Check final live-assembly geometry against the bounded source registration."""
from pathlib import Path
import gzip
import json
import os
from shapely.geometry import Point, Polygon
from shapely.ops import unary_union
from shapely.strtree import STRtree

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(os.environ.get('TOWN_ASSEMBLY_OUT', '/private/tmp/webster-indian-ranch-ground/native'))
catalog = json.loads((ROOT/'data/derived/town/indian-ranch-grounds.json').read_text())
source = json.loads((ROOT/'data/source/town/indian-ranch-ground-input.json').read_text())
proof = json.loads((ROOT/'data/source/town/indian-ranch-ground-proof.json').read_text())
native = json.loads((OUT/'native-audit.json').read_text())
assert native['status'] == 'PASS'
assert proof['fullCarPoseCount'] >= 600000
expected = {f['id']: unary_union([Polygon([f['points'][k] for k in f['indices'][i:i+3]]) for i in range(0,len(f['indices']),3)]) for f in catalog['features']}
structures = unary_union([Polygon(f['outline']).buffer(.05) for f in source['registeredStructures'].values()])
protected = unary_union([Polygon(t) for t in proof['protectedTriangles']]+[structures])
rows = []

def height(t, p):
    a, b, c = t
    denominator = (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])
    if abs(denominator) < 1e-12:
        return None
    u = ((p[0]-a[0])*(c[1]-a[1])-(p[1]-a[1])*(c[0]-a[0]))/denominator
    v = ((b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]))/denominator
    if min(u,v,1-u-v) < -1e-5:
        return None
    return a[2]+u*(b[2]-a[2])+v*(c[2]-a[2])

for level in [0,1,2]:
    with gzip.open(OUT/f'2_-3-{level}.domains.json.gz') as stream:
        domain = json.load(stream)
    terrain = domain['terrain']
    terrain_polys = [Polygon([p[:2] for p in t]) for t in terrain]
    tree = STRtree(terrain_polys)
    for fid, shape in expected.items():
        triangles = [t for m in domain['siteGrounds'] if m.get('id') == fid for t in m['triangles']]
        polys = [Polygon([p[:2] for p in t]) for t in triangles]
        actual = unary_union(polys)
        residuals, unsupported = [], 0
        for p in {tuple(p) for t in triangles for p in t}:
            heights = [height(terrain[int(i)],p) for i in tree.query(Point(p[:2]).buffer(.00005))]
            heights = [h for h in heights if h is not None]
            if not heights:
                unsupported += 1
            else:
                residuals.append(min(abs(p[2]-h-.012) for h in heights))
        rows.append({'level':level,'id':fid,'triangles':len(triangles),'actualAreaM2':actual.area,
            'extraBeyondFloat32BandM2':actual.difference(shape.buffer(.00005)).area,
            'missingBeyondFloat32BandM2':shape.difference(actual.buffer(.00005)).area,
            'duplicateTriangleAreaM2':sum(p.area for p in polys)-actual.area,
            'protectedOverlapM2':actual.intersection(protected.buffer(-.00005)).area,
            'unsupportedVertices':unsupported,'maxDrapeResidualM':max(residuals,default=0)})
    seating = native['rows'][level]['seating']
    assert len(seating['feet']) == len(catalog['benches'])*2
    assert not seating['unsupportedFeet'] and not seating['skipped']
    assert all(foot['bottom'] <= min(foot['cornerHeights']) for foot in seating['feet'])

failures = [r for r in rows if max(r[k] for k in ['extraBeyondFloat32BandM2','missingBeyondFloat32BandM2','protectedOverlapM2']) > 1e-5 or r['duplicateTriangleAreaM2'] > .005 or r['unsupportedVertices'] or r['maxDrapeResidualM'] > .00005]
report = {'status':'FAIL' if failures else 'PASS',
    'policy':'All final emitted ground triangles; 50 micrometre allowance for tile-local Float32. Source building outlines retain 5 cm clearance. Native road/water/car protections were audited across all three LODs and the full 690,528-pose guided-car domain; exact surface extents remain authored video/aerial registration. Ground follows final retained terrain plus 12 mm.',
    'rows':rows,'failures':failures}
(OUT/'domain-audit.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report,indent=2))
assert not failures
