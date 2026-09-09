"""One source-qualified pedestrian connection at the 248 Main Moderne facade.
The official photograph proves pale walking pavement, not a surveyed width.
Use the retained road/shoulder boundary; never fabricate a curb or brick edge.
"""
from pathlib import Path
import gzip
import hashlib
import json
import os
import subprocess
from shapely.geometry import Polygon
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(os.environ.get('WEBSTER_MODERNE_OUT', '/private/tmp/webster-paver-band'))
NODE = os.environ.get('WEBSTER_NODE', 'node')
DATA = ROOT / 'data/derived/town'
def read(path): return json.loads(path.read_text())
def digest(path): return hashlib.sha256(path.read_bytes()).hexdigest()
def pieces(p): return [p] if p.geom_type == 'Polygon' else [q for c in getattr(p, 'geoms', []) for q in pieces(c)]
def tris(p):
    result = []
    for q in pieces(p):
        if q.area < 1e-8: continue
        rings = [list(r.coords)[:-1] for r in [q.exterior, *q.interiors]]
        run = subprocess.run([NODE, str(ROOT / 'scripts/triangulate-ground.mjs')], input=json.dumps(rings), capture_output=True, text=True, check=True)
        result.extend(json.loads(run.stdout))
    return result

def stream_array(path):
    """Read the full guided-car audit without retaining millions of poses."""
    decoder = json.JSONDecoder()
    with gzip.open(path, 'rt') as stream:
        buf = ''; pos = 0; started = False
        while True:
            chunk = stream.read(262144)
            buf = buf[pos:] + chunk; pos = 0
            while True:
                while pos < len(buf) and buf[pos] in ' \n\r\t,': pos += 1
                if not started and pos < len(buf):
                    assert buf[pos] == '['; pos += 1; started = True
                if pos >= len(buf): break
                if buf[pos] == ']': return
                try: item, end = decoder.raw_decode(buf, pos)
                except json.JSONDecodeError: break
                pos = end; yield item
            if not chunk: raise ValueError('Incomplete car-envelope array')

source = DATA / 'commercial-completion.json'
building = next(r for r in read(source)['rows'] if r['id'] == '168341_866602')
f = next(f for f in building['frames'] if f['id'] == 'MS-S-016')
assert f['sourceJoin']['parcelAddress'] == '248 MAIN ST'
def point(u, v): return [f['start'][i] + f['tangent'][i]*u + f['outward'][i]*v for i in range(2)]
# Whole registered parcel front, 12 mm outside its wall. The six-metre search
# ends at the actual retained shoulder (~4.3m); it is not a claimed walk width.
raw = Polygon([point(0,.012), point(f['width'],.012), point(f['width'],6), point(0,6)])
extent = raw.buffer(.25)
native_path = OUT / 'native-source.json'
native = read(native_path)
assert native['frame'] == f and native['origin'] == building['origin']
protection = {}; lods = []
for lod in native['lods']:
    assert next(l for l in building['lods'] if l['level'] == lod['level'])['sha256'] == lod['sha256']
    lods.append({key:lod[key] for key in ['level','sha256']})
    for row in lod['triangles']:
        q = Polygon([p[:2] for p in row['triangle']])
        if not q.is_valid or q.area < 1e-8 or not q.intersects(extent): continue
        kind = 'building' if row['mesh'].startswith(('buildings','landmarks')) else 'water' if row['mesh'].startswith('water') else 'paving'
        protection.setdefault(kind, []).append(q)
protection.setdefault('building', []).append(Polygon(building['outline']))
added_refs = []
for name in ['arrival-grounds','property-grounds','commercial-frontage-grounds','mill-yard-grounds','bathhouse-grounds']:
    path = DATA / (name + '.json'); catalog = read(path)
    added_refs.append({'path':str(path.relative_to(ROOT)),'sha256':digest(path)})
    tile = catalog.get('tiles',{}).get(building['tileId'])
    if not tile: continue
    for value in tile['features']:
        feature = value if isinstance(value,dict) else next(v for v in catalog['features'] if v['id'] == value)
        triangles = feature.get('triangles') or [[feature['points'][i] for i in feature['indices'][j:j+3]] for j in range(0,len(feature.get('indices',[])),3)]
        for t in triangles:
            q = Polygon([p[:2] for p in t])
            if q.area > 1e-8 and q.intersects(extent): protection.setdefault('existingAddition',[]).append(q)
carpath = Path(os.environ.get('WEBSTER_CAR_POSES', '/private/tmp/webster-finished-game/roads/full-clearance/clearance-car-poses.json.gz'))
minx,miny,maxx,maxy = extent.bounds
count = near = 0
for quad in stream_array(carpath):
    count += 1
    if max(p[0] for p in quad) < minx or min(p[0] for p in quad) > maxx or max(p[1] for p in quad) < miny or min(p[1] for p in quad) > maxy: continue
    q = Polygon(quad)
    if q.intersects(extent): protection.setdefault('guidedCar',[]).append(q); near += 1
unions = {key:unary_union(values) for key,values in protection.items()}
# Centimetre seams between retained road triangles must never become narrow
# concrete fingers. Fill only such holes in the exclusion, retaining all of
# the original protected pavement; this cannot add paving to a driving lane.
if 'paving' in unions:
    q = unions['paving']
    unions['paving'] = q.union(q.buffer(.025).buffer(-.025))
protected = unary_union([q.buffer(.03 if key == 'guidedCar' else .005 if key == 'building' else .05 if key == 'water' else 0) for key,q in unions.items()])
final = raw.difference(protected)
assert len([p for p in pieces(final) if p.area > .05]) == 1
shape = next(p for p in pieces(final) if p.area > .05)
triangles = tris(shape)
assert abs(sum(Polygon(t).area for t in triangles)-shape.area) < 1e-6
assert 45 < shape.area < 90
points = []; lookup = {}; indices = []
for t in triangles:
    for p in t:
        key = tuple(round(v,7) for v in p)
        if key not in lookup: lookup[key]=len(points); points.append(list(key))
        indices.append(lookup[key])
photo = OUT / 'official-downtown-168.jpg'
policy = 'Official Webster downtown photo 168 shows pale scored concrete and a narrow reddish curbside paver band at 248 Main; capture date is unknown. Only the exact FY2025 parcel-qualified MS-S-016 facade receives this connection. Wall-to-retained-shoulder extent and 1.8m panel spacing are authored inference, not surveyed construction or accessibility dimensions. The native source has no sidewalk or curb in this interval: no brick band is added because its actual outer-walk edge cannot be registered. No source building, road, shoulder, water, curb or existing paving is moved.'
catalog = {'version':1,'sourceManifestSha256':native['sourceManifestSha256'],'sourceBuildingId':building['id'],'sourceFacadeSha256':digest(source),'sourceFrame':f,'sourcePhoto':{'url':'https://www.webster-ma.gov/ImageRepository/Document?documentID=168','sha256':digest(photo),'captureDate':None,'observation':'Pale scored concrete walk with narrow reddish paver band outside the 248 Main cream Moderne facade.'},'sourceCarEnvelopeSha256':digest(carpath),'policy':policy,'tiles':{building['tileId']:{'origin':building['origin'],'lods':lods,'features':['MODERNE-248-FORECOURT']}},'features':[{'id':'MODERNE-248-FORECOURT','sid':building['id'],'site':'248 Main Street','kind':'concrete','color':'#aaa697','areaM2':shape.area,'points':points,'indices':indices}]}
(DATA/'moderne-frontage-grounds.json').write_text(json.dumps(catalog,separators=(',',':'))+'\n')
proof = {'sourceExportsSha256':digest(native_path),'addedCatalogs':added_refs,'sourceManifestSha256':native['sourceManifestSha256'],'sourceLods':lods,'policy':policy,'searchEnvelope':[list(p) for p in raw.exterior.coords][:-1],'protectedTriangles':tris(protected.intersection(extent)),'fullCarPoseCount':count,'nearbyCarPoseCount':near,'overlapM2':{k:shape.intersection(q).area for k,q in unions.items()},'finalAreaM2':shape.area,'nativeSidewalkAreaM2':sum(Polygon([p[:2] for p in row['triangle']]).intersection(raw).area for row in native['lods'][0]['triangles'] if 'sidewalk concrete' in row['name'])}
(ROOT/'data/source/town/moderne-frontage-ground-proof.json').write_text(json.dumps(proof,separators=(',',':'))+'\n')
print(json.dumps({k:proof[k] for k in ['fullCarPoseCount','nearbyCarPoseCount','overlapM2','finalAreaM2','nativeSidewalkAreaM2']}))
