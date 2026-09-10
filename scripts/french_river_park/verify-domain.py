"""Check final live-assembly geometry against the bounded source registration."""
from pathlib import Path
import gzip
import json
import os
from shapely.geometry import Point, Polygon
from shapely.ops import unary_union
from shapely.strtree import STRtree

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(os.environ.get('TOWN_ASSEMBLY_OUT', '/private/tmp/webster-french-river-park/native'))
catalog = json.loads((ROOT/'data/derived/town/french-river-park.json').read_text())
source = json.loads((ROOT/'data/source/town/french-river-park-input.json').read_text())
proof = json.loads((ROOT/'data/source/town/french-river-park-proof.json').read_text())
native = json.loads((OUT/'native-audit.json').read_text())
assert native['status'] == 'PASS'
assert proof['fullCarPoseCount'] >= 600000
expected = {f['id']: unary_union([Polygon([f['points'][k] for k in f['indices'][i:i+3]]) for i in range(0,len(f['indices']),3)]) for f in catalog['features']}
expected[catalog['island']['id']]=unary_union([Polygon(t)for t in catalog['island']['triangles']])
structures = unary_union([Polygon(f['outline']).buffer(.05) for f in source['registeredStructures'].values()])
protected = unary_union([Polygon(t) for t in proof['protectedTriangles']]+[structures])
rows = []

def height(t, p, permit_boundary=False):
    a, b, c = t
    denominator = (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])
    if abs(denominator) < 1e-12:
        return None
    u = ((p[0]-a[0])*(c[1]-a[1])-(p[1]-a[1])*(c[0]-a[0]))/denominator
    v = ((b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]))/denominator
    if not permit_boundary and min(u,v,1-u-v) < -1e-5:
        return None
    return a[2]+u*(b[2]-a[2])+v*(c[2]-a[2])

for level in [0,1,2]:
    with gzip.open(OUT/f'-12_-4-{level}.domains.json.gz') as stream:
        domain = json.load(stream)
    terrain = domain['terrain']
    terrain_polys = [Polygon([p[:2] for p in t]) for t in terrain]
    tree = STRtree(terrain_polys)
    for fid, shape in expected.items():
        is_island=fid==catalog['island']['id']
        support=terrain+domain['roadSupports']if is_island else terrain
        support_polys=[Polygon([p[:2]for p in t])for t in support]
        support_tree=STRtree(support_polys)
        triangles = [t for m in domain['siteGrounds'] if fid in m.get('featureIds',[]) for t in m['triangles'] if Polygon([p[:2] for p in t]).intersection(shape).area > 1e-8]
        polys = [Polygon([p[:2] for p in t]) for t in triangles]
        actual = unary_union(polys)
        residuals, unsupported = [], 0
        maximum_interior_burial=0
        for p in {tuple(p) for t in triangles for p in t}:
            point=Point(p[:2])
            heights = [height(support[int(i)],p,permit_boundary=is_island) for i in support_tree.query(point.buffer(.00005)) if not is_island or support_polys[int(i)].distance(point)<=.00005]
            heights = [h for h in heights if h is not None]
            if not heights:
                unsupported += 1
            else:
                residuals.append(min(abs(p[2]-h-(catalog['island']['heightOffsetM']if is_island else .012))for h in heights))
        if is_island:
            # A raised shoulder is discontinuous at its edge: lower and upper
            # boundary vertices may each follow their own retained plane.
            # Independently require every finite interior intersection to be
            # at least as high as every competing retained surface. The50um
            # band is exactly the existing Float32 domain tolerance.
            for t,q in zip(triangles,polys):
                for j in support_tree.query(q):
                    other=support[int(j)];inside=q.intersection(Polygon([p[:2]for p in other]).buffer(-.00005))
                    for region in ([inside]if inside.geom_type=='Polygon'else getattr(inside,'geoms',[])):
                        if region.area<1e-9:continue
                        for p in region.exterior.coords:
                            top=height(other,p);actual_height=height(t,p)
                            if top is not None and actual_height is not None:maximum_interior_burial=max(maximum_interior_burial,top+catalog['island']['heightOffsetM']-actual_height)
        rows.append({'level':level,'id':fid,'triangles':len(triangles),'actualAreaM2':actual.area,
            'extraBeyondFloat32BandM2':actual.difference(shape.buffer(.00005)).area,
            'missingBeyondFloat32BandM2':shape.difference(actual.buffer(.00005)).area,
            'duplicateTriangleAreaM2':sum(p.area for p in polys)-actual.area,
            'protectedOverlapM2':actual.intersection((unary_union([Polygon(t)for t in proof['island']['protectedTriangles']]+[Polygon([p[:2]for p in t])for t in domain['nativePaint']])if is_island else protected).buffer(-.00005)).area,
            'unsupportedVertices':unsupported,'maxDrapeResidualM':max(residuals,default=0),'maxInteriorBurialM':maximum_interior_burial})

failures = [r for r in rows if max(r[k] for k in ['extraBeyondFloat32BandM2','missingBeyondFloat32BandM2','protectedOverlapM2']) > 1e-5 or r['duplicateTriangleAreaM2'] > .005 or r['unsupportedVertices'] or r['maxDrapeResidualM'] > .00005 or r['maxInteriorBurialM']>.00005]
report = {'status':'FAIL' if failures else 'PASS',
    'policy':'All final emitted ground triangles; 50 micrometre allowance for tile-local Float32. Source building outlines retain 5 cm clearance. Native road/water/car protections were audited across all three LODs and the full 690,528-pose guided-car domain; exact surface extents remain authored video/aerial registration. Paving follows final retained terrain plus12mm; the bounded island follows the highest retained terrain/native paving plane plus18mm, protecting guided traffic and final native paint.',
    'rows':rows,'failures':failures}
(OUT/'domain-audit.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report,indent=2))
assert not failures
