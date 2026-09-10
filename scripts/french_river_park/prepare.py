"""Conservative venue ground extents; video observations are not survey data."""
from pathlib import Path
import gzip
import hashlib
import json
import os
import subprocess
import math
from shapely.geometry import Polygon, LineString, Point
from shapely.strtree import STRtree
from shapely.ops import unary_union
from pyproj import Transformer

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(os.environ.get('WEBSTER_FRENCH_PARK_OUT','/private/tmp/webster-french-river-park'))
NODE = os.environ.get('WEBSTER_NODE','node')
DATA = ROOT/'data/derived/town'
SOURCE = ROOT/'data/source/town/french-river-park-input.json'
def read(p): return json.loads(p.read_text())
def digest(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def pieces(p): return [p] if p.geom_type == 'Polygon' else [q for c in getattr(p,'geoms',[]) for q in pieces(c)]
def triangles(shape):
    result=[]
    for p in pieces(shape):
        if p.area < .002: continue
        rings=[list(r.coords)[:-1] for r in [p.exterior,*p.interiors]]
        run=subprocess.run([NODE,str(ROOT/'scripts/triangulate-ground.mjs')],input=json.dumps(rings),text=True,capture_output=True,check=True)
        result.extend(json.loads(run.stdout))
    return result
def stream_array(path):
    decoder=json.JSONDecoder()
    with gzip.open(path,'rt') as stream:
        buf='';pos=0;started=False
        while True:
            chunk=stream.read(262144);buf=buf[pos:]+chunk;pos=0
            while True:
                while pos<len(buf) and buf[pos] in ' \n\r\t,':pos+=1
                if not started and pos<len(buf):assert buf[pos]=='[';pos+=1;started=True
                if pos>=len(buf):break
                if buf[pos]==']':return
                try:item,end=decoder.raw_decode(buf,pos)
                except json.JSONDecodeError:break
                pos=end;yield item
            if not chunk:raise ValueError('Incomplete car-envelope array')

source=read(SOURCE);release=read(DATA/'release.json')
def smooth(points):
    # Three Chaikin corner-cutting passes preserve the traced endpoints.
    for _ in range(3):
        out=[points[0]]
        for a,b in zip(points[:-1],points[1:]):out.extend([[a[i]*.75+b[i]*.25 for i in range(2)],[a[i]*.25+b[i]*.75 for i in range(2)]])
        out.append(points[-1]);points=out
    return points
walk=unary_union([LineString(smooth(f['line'])).buffer(f['widthM']/2,cap_style=2,join_style=1) for f in source['walks']]).simplify(.02,preserve_topology=True)
raw_features=[{'id':'FRP-WALKS','sid':'FRP-WALKS','kind':'walk','surface':'gray-walk','color':'#858d87','inference':'Observed outer U walk and interior branches. Author-smoothed trace, with a maximum2cm edge simplification for rendering, neutral gray paving and finite widths preserve the observed layout; construction material and exact edges are not surveyed.'}]+source['features']
raw_features=[f for f in raw_features if f['surface']=='pale-pad']+[raw_features[0]]+[f for f in raw_features if f['surface']=='parking-asphalt']
raws={'FRP-WALKS':walk,**{f['id']:Polygon(f['ring'],f.get('holes',[]))for f in source['features']}}
extent=unary_union(list(raws.values())).buffer(.1);protected={};levels={};exports=[];native_paint=[]
for path in sorted(OUT.glob('*.source.json.gz')):
    with gzip.open(path)as stream:r=json.load(stream)
    assert r['tileId']=='-12_-4'and r['sourceManifestSha256']==release['manifestSha256']
    exports.append({'file':path.name,'sha256':digest(path),'sourceSha256':r['sourceSha256']})
    terrain=[];water=[];terrain_shapes=[]
    for row in r['faces']:
        q=Polygon([p[:2]for p in row['triangle']])
        if not q.is_valid or q.area<1e-8 or not q.intersects(extent):continue
        if row['mesh'].startswith('terrain'):terrain.append(row['triangle']);terrain_shapes.append(q)
        elif row['mesh'].startswith('water'):water.append(row['triangle'])
        else:
            protected.setdefault('building'if row['mesh'].startswith(('buildings','landmarks'))else'paving',[]).append(q)
            if row['mesh'].startswith('roads') and ('paint' in row['name'].lower() or 'marking' in row['name'].lower()):native_paint.append(q)
    levels[r['level']]={'terrain':terrain,'water':water,'support':unary_union(terrain_shapes),'sha256':r['sourceSha256'],'origin':r['origin']}
assert set(levels)=={0,1,2}
for r in source['registeredStructures'].values():
    q=Polygon(r['outline'])
    if q.intersects(extent):protected.setdefault('building',[]).append(q)
# Existing finished parking is an owned overlay, absent from the original GLB.
# Pin its packet and subtract its actual polygons as well as retained paving.
lot_index=read(DATA/'paved-surfaces-index.json');lot_asset=lot_index['lotAssets']['-12_-4'];lot_path=ROOT/'public'/lot_asset['url'].lstrip('/')
assert digest(lot_path)==lot_asset['sha256'] and lot_path.stat().st_size==lot_asset['bytes']
lot_ids=[]
for lot in read(lot_path)['lots']:
    for rings in lot['polygons']:
        q=Polygon(rings[0],rings[1:])
        if q.intersects(extent):protected.setdefault('finishedParking',[]).append(q);lot_ids.append(lot['id'])
carpath=Path(os.environ.get('WEBSTER_CAR_POSES','/private/tmp/webster-finished-game/roads/full-clearance/clearance-car-poses.json.gz'))
minx,miny,maxx,maxy=extent.bounds;count=near=0
for quad in stream_array(carpath):
    count+=1
    if max(p[0]for p in quad)<minx or min(p[0]for p in quad)>maxx or max(p[1]for p in quad)<miny or min(p[1]for p in quad)>maxy:continue
    q=Polygon(quad)
    if q.intersects(extent):protected.setdefault('guidedCar',[]).append(q);near+=1
protection=unary_union([unary_union(p).buffer(.05 if k=='building'else .03)for k,p in protected.items()])
# Paint and asphalt are disjoint coplanar domains, avoiding a second ground layer.
transform=Transformer.from_crs(4326,6491,always_xy=True)
def pixel_local(p):
    left,top,_,_=source['sourceAerial']['tileBounds'];n=2**source['sourceAerial']['zoom']
    x,y=transform.transform((p[0]/256+left)/n*360-180,math.degrees(math.atan(math.sinh(math.pi*(1-2*(p[1]/256+top)/n)))))
    return[x-171282.3328920724,y-867589.2761750807]
bay_lines=[]
for row in source.get('parkingBayRows',[]):
    for i in range(row['dividerCount']):
        t=i/(row['dividerCount']-1);p=[a+(b-a)*t for a,b in zip(row['startPixel'],row['endPixel'])];q=[a+b for a,b in zip(p,row['dividerPixelVector'])]
        bay_lines.append(LineString([pixel_local(p),pixel_local(q)]).buffer(row['widthM']/2,cap_style=2))
if bay_lines:
    raw_features.insert(-1,{'id':'FRP-PARKING-MARKINGS','sid':'FRP-PARKING-MARKINGS','kind':'walk','surface':'parking-markings','color':'#c9c9bd','inference':source['parkingBayPolicy']})
    raws['FRP-PARKING-MARKINGS']=unary_union(bay_lines).intersection(raws['FRP-PARKING'].buffer(-.25)).difference(protection)
features=[];finals=[]
clipped_areas={};discarded_parking_offcuts=0
for f in raw_features:
    q=raws[f['id']].difference(protection).difference(unary_union(finals));clipped_areas[f['id']]=raws[f['id']].intersection(protection).area
    if not f['id'].startswith('FRP-PARKING'):assert clipped_areas[f['id']]<.01,'Unexpected protected overlap'
    if f['id']=='FRP-PARKING':
        # Road subtraction can leave a thin disconnected fragment on the far
        # side of Davis Street. It is not part of this park arrival surface.
        components=pieces(q);largest=max(components,key=lambda p:p.area)
        discarded_parking_offcuts=sum(p.area for p in components)-largest.area;q=largest
    if f['id']=='FRP-WALKS':assert len(pieces(q))==1,'Disconnected park walk'
    finals.append(q);ts=triangles(q);points=[];lookup={};indices=[]
    for t in ts:
        for p in t:
            key=tuple(round(v,7)for v in p)
            if key not in lookup:lookup[key]=len(points);points.append(list(key))
            indices.append(lookup[key])
    assert abs(sum(Polygon(t).area for t in ts)-q.area)<1e-5
    features.append({k:f[k]for k in ['id','sid','kind','surface','color','inference']}|{'site':'French River Park','areaM2':q.area,'points':points,'indices':indices,'outline':list(q.exterior.coords)[:-1]if f['surface']=='pale-pad'and q.geom_type=='Polygon'else None})
final=unary_union(finals)
parking=unary_union([q for f,q in zip(raw_features,finals)if f['id'].startswith('FRP-PARKING')])
walk_ends=[source['walks'][0]['line'][i]for i in [0,-1]]
walk_connections=[{'point':p,'distanceToParkingM':parking.distance(Point(p))}for p in walk_ends]
assert all(r['distanceToParkingM']<.02 for r in walk_connections),f'A walk ends without the registered parking connection: {walk_connections}'
island=unary_union([Polygon(r)for f in source['features']if f['id']=='FRP-PARKING'for r in f.get('holes',[])])
assert final.intersection(island).area<1e-6
island_protected=unary_union([*protected.get('guidedCar',[]),*native_paint]).buffer(.03)
mulch=island.difference(island_protected)
assert mulch.area>island.area*.9,'Guided traffic or paint occupies the traced planting island'
island_triangles=triangles(mulch)
def height(t,p):
    a,b,c=t;d=(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);u=((p[0]-a[0])*(c[1]-a[1])-(p[1]-a[1])*(c[0]-a[0]))/d;v=((b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]))/d
    return a[2]+u*(b[2]-a[2])+v*(c[2]-a[2])
water_checks=[]
for level,r in sorted(levels.items()):
    assert final.difference(r['support']).area<1e-5,'Missing native terrain'
    ws=[Polygon([p[:2]for p in t])for t in r['water']];wt=STRtree(ws);minimum=1000;checks=0
    for t in r['terrain']:
        q=Polygon([p[:2]for p in t]).intersection(final)
        if q.is_empty:continue
        for i in wt.query(q):
            overlap=q.intersection(ws[int(i)])
            for poly in pieces(overlap):
                for p in poly.exterior.coords:
                    minimum=min(minimum,height(t,p)-height(r['water'][int(i)],p));checks+=1
    assert minimum>=source['minimumTerrainAboveWaterM']
    water_checks.append({'level':level,'intersectionVertices':checks,'minimumTerrainAboveWaterM':minimum})
tile={'origin':levels[0]['origin'],'lods':[{'level':level,'sha256':r['sha256']}for level,r in sorted(levels.items())],'features':[f['id']for f in features]}
island_record={'id':'FRP-PLANTING-ISLAND','tileId':'-12_-4','areaM2':mulch.area,'triangles':island_triangles,'color':'#735b43','heightOffsetM':.018,'inference':'The2025 aerial shows a narrow planted island along the south parking row. Its traced hole is retained; muted brown mulch is authored from the visible brown planting surface, not a surveyed material or curb height. Only the highest existing terrain/native asphalt or shoulder plane supports this optional overlay. Full guided-car envelopes and native paint retain3cm clearance; no original geometry or paint is moved.'}
catalog={'version':1,'walkSimplificationM':.02,'sourceManifestSha256':release['manifestSha256'],'sourceInputSha256':digest(SOURCE),'minimumTerrainAboveWaterM':source['minimumTerrainAboveWaterM'],'policy':source['policy'],'tiles':{'-12_-4':tile},'features':features,'island':island_record}
(DATA/'french-river-park.json').write_text(json.dumps(catalog,separators=(',',':'))+'\n')
proof={'sourceInputSha256':digest(SOURCE),'sourceExports':exports,'finishedParkingSource':lot_asset|{'ids':lot_ids},'clippedProtectedAreaM2':clipped_areas,'discardedDisconnectedParkingM2':discarded_parking_offcuts,'walkParkingConnections':walk_connections,'retainedPlantingIslandAreaM2':island.area,'sourceCarEnvelopeSha256':digest(carpath),'fullCarPoseCount':count,'nearbyCarPoseCount':near,'sourceStructureIds':list(source['registeredStructures']),'protectedTriangles':triangles(protection.intersection(extent)),'overlapM2':{k:final.intersection(unary_union(v)).area for k,v in protected.items()},'waterChecks':water_checks,'featureAreasM2':{f['id']:f['areaM2']for f in features},'policy':'Every triangle is terrain supported at all3nativeLODs. Projected water under land is permitted only when the complete clipped terrain/water overlap stays at least0.5m apart. The registered south lot joins both walks; its planted island and existing native/finished paving remain outside the addition. Disconnected offcuts beyond protected Davis paving are discarded. No source shoreline, native ground, roads, buildings or guided route changes.'}
proof['island']={'areaM2':mulch.area,'sourceHoleAreaM2':island.area,'guidedCarOverlapM2':mulch.intersection(unary_union(protected.get('guidedCar',[]))).area,'nativePaintOverlapM2':mulch.intersection(unary_union(native_paint)).area,'protectedTriangles':triangles(island_protected.intersection(island.buffer(.1))),'policy':island_record['inference']}
(ROOT/'data/source/town/french-river-park-proof.json').write_text(json.dumps(proof,separators=(',',':'))+'\n')
print(json.dumps({'bytes':(DATA/'french-river-park.json').stat().st_size,'areas':proof['featureAreasM2'],'water':water_checks,'carPoses':count,'nearby':near}))
