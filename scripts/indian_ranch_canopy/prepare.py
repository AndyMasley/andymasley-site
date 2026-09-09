"""One observed open canopy: pinned roofprint, authored hips, native terrain support.

Run export-source.mjs in indian_ranch_grounds first. No source imagery is shipped.
The two source terrain tiles are needed because the roof crosses x=500.
"""
import gzip, hashlib, json, math, os, subprocess
from pathlib import Path
import numpy as np
from shapely.geometry import Polygon, Point, LineString
from shapely.ops import split, unary_union, triangulate

ROOT = Path(__file__).resolve().parents[2]
WORK = Path(os.environ.get('WEBSTER_RANCH_GROUND_OUT', '/private/tmp/webster-indian-ranch-ground'))
read = lambda p: json.loads(Path(p).read_text())
sha = lambda p: hashlib.sha256(Path(p).read_bytes()).hexdigest()
source_path = ROOT / 'data/source/town/indian-ranch-canopy-input.json'
source_input = read(source_path)
source = source_input['record']
assert source['id'] == '171785_866902'
assert hashlib.sha256(json.dumps(source,separators=(',',':'),sort_keys=True).encode()).hexdigest() == source_input['recordSha256']
proof_path = ROOT / 'data/source/town/indian-ranch-ground-input.json'
proof = read(proof_path)
assert proof['registeredStructures'][source['id']]['outline'] == source['outline']
outline = Polygon(source['outline'])
p = np.array(source['outline'][:-1])
release = read(ROOT / 'data/derived/town/release.json')
base = ROOT / 'public/town-assets' / release['directory']
assert sha(base / 'manifest.json') == release['manifestSha256']
manifest = read(base / 'manifest.json')
owner = next(t for t in manifest['tiles'] if t['id'] == '2_-3')

def parts(g):
    if g.is_empty: return []
    if g.geom_type == 'Polygon': return [g]
    return [p for child in getattr(g, 'geoms', []) for p in parts(child)]

def triangles(g):
    result=[]
    for q in parts(g):
        ts=[list(t.exterior.coords)[:3]for t in triangulate(q)if q.buffer(1e-8).covers(t)]
        if abs(sum(Polygon(t).area for t in ts)-q.area)>1e-7:
            rings=[list(r.coords)[:-1]for r in [q.exterior,*q.interiors]]
            node=os.environ.get('WEBSTER_NODE') or os.environ.get('NODE') or 'node'
            r=subprocess.run([node,str(ROOT/'scripts/triangulate-ground.mjs')],input=json.dumps(rings),text=True,capture_output=True,check=True)
            ts=json.loads(r.stdout)
        result.extend(t for t in ts if Polygon(t).area>1e-10)
    return result

def clip_half(poly, plane):
    a,b,c = plane
    if math.hypot(a,b) < 1e-11: return poly if c <= 1e-9 else Polygon()
    center = -c * np.array([a,b]) / (a*a+b*b)
    d = np.array([-b,a]) / math.hypot(a,b) * 1000
    try: regions = split(poly, LineString([center-d,center+d]))
    except ValueError: regions = poly
    return unary_union([q for q in parts(regions) if a*q.representative_point().x+b*q.representative_point().y+c <= 1e-8])

# Two low hip volumes meet in a valley. Their upper envelope is clipped to the
# original concave roofprint, including the little NW wing; no filled-in bite.
pieces=[]
for ids in ([1,2,3,4,5,6],[6,7,8,0,1]):
    hull=Polygon(p[list(ids)]).convex_hull
    corners=np.array(hull.exterior.coords)[:-1]
    center=np.array(hull.centroid.coords[0]); planes=[]
    for a,b in zip(corners,np.roll(corners,-1,axis=0)):
        d=b-a; n=np.array([-d[1],d[0]])/np.linalg.norm(d)
        if (center-a)@n < 0: n=-n
        planes.append(np.array([n[0]*.105,n[1]*.105,-a@n*.105]))
    for plane in planes:
        region=hull.intersection(outline)
        for other in planes: region=clip_half(region,plane-other)
        if region.area > 1e-8: pieces.append((region,plane))
roof=[]
for region,plane in pieces:
    for other,other_plane in pieces:
        if np.linalg.norm(plane-other_plane)<1e-9: continue
        region=region.difference(clip_half(other,plane-other_plane))
    for t in triangles(region):
        roof.append([[x,float(plane@[x,n,1]),n] for x,n in t])
roof_polys=[Polygon([[q[0],q[2]]for q in t]) for t in roof]
coverage=unary_union(roof_polys)
assert coverage.symmetric_difference(outline).area < 1e-5
assert abs(sum(t.area for t in roof_polys)-outline.area)<1e-5

def roof_height(x,n):
    return max(float(plane@[x,n,1]) for region,plane in pieces if region.distance(Point(x,n))<1e-6)

# Roof boundary profiles include ridge/valley crossings, so the fascia is sewn
# to the same envelope. Inside seams have no hanging wall or duplicate roof.
fascia=[]
for a,b in zip(p,np.roll(p,-1,axis=0)):
    line=LineString([a,b]); d=b-a; length=np.linalg.norm(d); cuts=[0.,1.]
    for region,_ in pieces:
        inter=line.intersection(region.boundary)
        for q in getattr(inter,'geoms',[inter]):
            if q.geom_type=='Point': cuts.append(float((np.array(q.coords[0])-a)@d/(length*length)))
    cuts=sorted(set(round(max(0,min(1,t)),9)for t in cuts))
    for u,v in zip(cuts,cuts[1:]):
        if v-u<1e-8: continue
        q=a+d*u; r=a+d*v
        fascia.append([[float(q[0]),roof_height(*q),float(q[1])],[float(r[0]),roof_height(*r),float(r[1])]])

inner=outline.buffer(-.36,join_style=2)
assert inner.geom_type=='Polygon'
posts=[]
ring=np.array(inner.exterior.coords)[:-1]
for a,b in zip(ring,np.roll(ring,-1,axis=0)):
    steps=max(1,math.ceil(np.linalg.norm(b-a)/6.2))
    for i in range(steps):
        q=a+(b-a)*i/steps
        if all(np.linalg.norm(q-r)>.65 for r in posts): posts.append(q)

start=p[5]; tangent=(p[4]-p[5])/np.linalg.norm(p[4]-p[5]); away=np.array([-tangent[1],tangent[0]])
benches=[]
for row in range(9):
    v=2.0+row*2.6
    for u in [3.55,7.75,14.25,18.45]:
        width=3.55; q=start+tangent*u+away*v
        corners=[q+tangent*dx+away*dy for dx,dy in [(-width/2,-.28),(width/2,-.28),(width/2,.28),(-width/2,.28)]]
        if all(inner.contains(Point(a))for a in corners) and all(np.linalg.norm(q-a)>width/2+.65 for a in posts):
            benches.append({'row':row,'center':q.tolist(),'width':width,'corners':[a.tolist()for a in corners]})

levels=[]
for lod in owner['lods']:
    level=lod['level']; ground=[]; support_sources=[]
    for tile_id in ['1_-3','2_-3']:
        tile=next(t for t in manifest['tiles']if t['id']==tile_id)
        tile_lod=next(l for l in tile['lods']if l['level']==level)
        assert sha(base/tile_lod['url']) == tile_lod['sha256']
        path=WORK/f'{tile_id}-{level}.source.json.gz'
        d=json.load(gzip.open(path,'rt'))
        assert d['sourceSha256']==tile_lod['sha256'] and d['sourceManifestSha256']==release['manifestSha256']
        support_sources.append({'tileId':tile_id,'sha256':tile_lod['sha256'],'exportSha256':sha(path)})
        for face in d['faces']:
            if not(face['name'].startswith('Realism aerial') and '| ground_' in face['name']): continue
            t=np.array(face['triangle']); poly=Polygon(t[:,:2])
            if not poly.intersects(outline): continue
            a,b,c=t; d0=b-a; d1=c-a; det=d0[0]*d1[1]-d0[1]*d1[0]
            if abs(det)<1e-8:continue
            ground.append((poly,t,tile_id))
    def height(q):
        for poly,t,_ in ground:
            if poly.distance(Point(q))>1e-6:continue
            a,b,c=t; v=b-a; w=c-a; delta=q-a[:2]; det=v[0]*w[1]-v[1]*w[0]
            u=(delta[0]*w[1]-delta[1]*w[0])/det; z=(v[0]*delta[1]-v[1]*delta[0])/det
            return float(a[2]+u*v[2]+z*w[2])
        raise ValueError(f'Uncovered terrain support {level} {q}')
    pad=[]
    for poly,t,_ in ground:
        for triangle in triangles(poly.intersection(outline)):
            pad.append([[x,height(np.array([x,n]))+.034,n]for x,n in triangle])
    pad_area=unary_union([Polygon([[q[0],q[2]]for q in t])for t in pad])
    assert pad_area.symmetric_difference(outline).area<1e-5
    assert abs(sum(Polygon([[q[0],q[2]]for q in t]).area for t in pad)-outline.area)<1e-5
    post_rows=[{'point':q.tolist(),'ground':height(q),'roofRise':roof_height(*q)}for q in posts]
    bench_rows=[]
    for b in benches:
        heights=[height(np.array(q))for q in b['corners']]
        assert max(heights)-min(heights)<.60
        bench_rows.append({**b,'ground':heights,'seat':max(heights)+.45})
    checks=[]
    for q in [*posts,*p]:
        if q[0]>500.2:checks.append([*q.tolist(),height(q)])
    maximum=max(q[1]-.034 for t in pad for q in t)
    levels.append({'level':level,'sha256':lod['sha256'],'terrainSources':support_sources,
                   'groundRange':[min(q[1]-.034 for t in pad for q in t),maximum],
                   'eave':maximum+3.20,'pad':pad,'posts':post_rows,'benches':bench_rows,'ownTerrainChecks':checks})

# The guided car envelope must remain disjoint from the retained canopy, pad,
# and every authored post/seat. This is an authored scene, never a new route.
cars_path=Path('/private/tmp/webster-finished-game/roads/clearance-car-poses.json.gz')
cars=json.load(gzip.open(cars_path,'rt'));car_conflicts=0
for ring in cars:
    if Polygon(ring).intersects(outline.buffer(.05)):car_conflicts+=1
assert car_conflicts==0,car_conflicts

catalog={'version':1,'id':source['id'],'tileId':owner['id'],'origin':owner['origin'],
 'sourceManifestSha256':release['manifestSha256'],'sourceRowsSha256':source_input['originalInventory']['sha256'],
 'sourceInputSha256':sha(source_path),
 'sourceGroundProofSha256':sha(proof_path),'sourceCarEnvelopeSha256':sha(cars_path),
 'sourceFootprintSha256':source['report']['source_footprint_sha256'],
 'sourceBase':source['base'],'sourcePeak':source['sourcePeak'],'sourceFloor':source['floor'],
 'outline':source['outline'],'roof':roof,'fascia':fascia,'seatTangent':tangent.tolist(),'seatAway':away.tolist(),
 'levels':levels,'sourceVideo':proof['sourceVideo'],'sourceAerial':proof['sourceAerial'],
 'observed':'V01 37.5774s: white shallow hip/open seating canopy, dark slender posts, green bench seating; coordinating agent registered this source roofprint against2025aerial.',
 'inferred':'Two joined hip volumes at0.105slope; eave3.2m above highest supported native terrain;0.14m posts, nine approximate rows, muted mint benches, shallow draped pale hardstanding. Exact dimensions, seating count, construction material and captured-date condition are not measured.',
 'proof':{'roofAreaM2':outline.area,'roofCoverageErrorM2':coverage.symmetric_difference(outline).area,'carConflicts':car_conflicts}}
target=ROOT/'data/derived/town/indian-ranch-canopy.json'
target.write_text(json.dumps(catalog,separators=(',',':'))+'\n')
print(json.dumps({'catalogBytes':target.stat().st_size,'roofTriangles':len(roof),'posts':len(posts),'benchSegments':len(benches),'levels':[{'level':r['level'],'eave':r['eave'],'ground':r['groundRange'],'padTriangles':len(r['pad'])}for r in levels]}))
