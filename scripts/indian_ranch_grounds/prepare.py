"""Conservative venue ground extents; video observations are not survey data."""
from pathlib import Path
import gzip
import hashlib
import json
import os
import subprocess
import math
from shapely.geometry import Polygon, LineString
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(os.environ.get('WEBSTER_RANCH_GROUND_OUT','/private/tmp/webster-indian-ranch-ground'))
NODE = os.environ.get('WEBSTER_NODE','node')
DATA = ROOT/'data/derived/town'
SOURCE = ROOT/'data/source/town/indian-ranch-ground-input.json'
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
raws={f['id']:Polygon(f['ring']) if 'ring' in f else LineString(f['line']).buffer(f['widthM']/2,cap_style=2,join_style=2) for f in source['features']}
extent=unary_union(list(raws.values())).buffer(.5)
protected={};supports={};supports_by_level={};tiles={};exports=[]
for path in sorted(OUT.glob('*.source.json.gz')):
    with gzip.open(path) as stream:record=json.load(stream)
    assert record['sourceManifestSha256']==release['manifestSha256']
    exports.append({'file':path.name,'sha256':digest(path),'sourceSha256':record['sourceSha256']})
    tile=tiles.setdefault(record['tileId'],{'origin':record['origin'],'lods':[],'features':[]})
    tile['lods'].append({'level':record['level'],'sha256':record['sourceSha256']})
    for row in record['faces']:
        q=Polygon([p[:2] for p in row['triangle']])
        if not q.is_valid or q.area<1e-8 or not q.intersects(extent):continue
        if row['mesh'].startswith('terrain'):
            supports.setdefault(record['tileId'],[]).append(q)
            supports_by_level.setdefault((record['tileId'],record['level']),[]).append(q);continue
        kind='building' if row['mesh'].startswith(('buildings','landmarks')) else 'water' if row['mesh'].startswith('water') else 'paving'
        protected.setdefault(kind,[]).append(q)
for row in source['registeredStructures'].values():
    q=Polygon(row['outline'])
    if q.intersects(extent):protected.setdefault('building',[]).append(q)
carpath=Path(os.environ.get('WEBSTER_CAR_POSES','/private/tmp/webster-finished-game/roads/full-clearance/clearance-car-poses.json.gz'))
minx,miny,maxx,maxy=extent.bounds;count=near=0
for quad in stream_array(carpath):
    count+=1
    if max(p[0] for p in quad)<minx or min(p[0] for p in quad)>maxx or max(p[1] for p in quad)<miny or min(p[1] for p in quad)>maxy:continue
    q=Polygon(quad)
    if q.intersects(extent):protected.setdefault('guidedCar',[]).append(q);near+=1
unions={key:unary_union(polys) for key,polys in protected.items()}
if 'paving' in unions:
    q=unions['paving'];unions['paving']=q.union(q.buffer(.025).buffer(-.025))
protection=unary_union([q.buffer(.03 if key=='guidedCar' else .05 if key in ['building','water'] else 0) for key,q in unions.items()])
features=[];finals=[]
for f in source['features']:
    final=raws[f['id']].difference(protection).difference(unary_union(finals))
    final=unary_union([p for p in pieces(final) if p.area>.05]);finals.append(final)
    ts=triangles(final);assert abs(sum(Polygon(t).area for t in ts)-final.area)<1e-5
    assert 35<final.area<400
    points=[];lookup={};indices=[]
    for t in ts:
        for p in t:
            key=tuple(round(v,7) for v in p)
            if key not in lookup:lookup[key]=len(points);points.append(list(key))
            indices.append(lookup[key])
    row={key:f[key] for key in ['id','sid','kind','surface','color','inference']}
    row.update({'site':'Indian Ranch venue floor','areaM2':final.area,'points':points,'indices':indices,'featherRing':f.get('ring',list(raws[f['id']].exterior.coords)[:-1]),'frameOrigin':[round(final.centroid.x,5),round(final.centroid.y,5)]})
    features.append(row)
    for tid,terrain in supports.items():
        if unary_union(terrain).intersection(final).area>.0001:tiles[tid]['features'].append(f['id'])
tiles={tid:t for tid,t in tiles.items() if t['features']}
for tile in tiles.values():tile['lods'].sort(key=lambda l:l['level']);assert [l['level'] for l in tile['lods']]==[0,1,2]
bench_policy=source['benches'];frame=bench_policy['frame'];o=frame['start'];u=frame['tangent'];v=frame['away']
def world(x,y):return [o[i]+u[i]*x+v[i]*y for i in range(2)]
common=unary_union(supports_by_level[('2_-3',0)])
for level in [1,2]:common=common.intersection(unary_union(supports_by_level[('2_-3',level)]))
seat_area=finals[0].buffer(-bench_policy['edgeInsetM']-.30,join_style=2).intersection(common.buffer(-.05))
benches=[]
for row in range(bench_policy['rows']):
    at=bench_policy['firstRowV']+row*bench_policy['rowPitchM'];line=LineString([world(0,at),world(60,at)]).intersection(seat_area)
    parts=[line] if line.geom_type=='LineString' else [p for p in getattr(line,'geoms',[]) if p.geom_type=='LineString']
    for span,p in enumerate(parts):
        if p.length<1.6:continue
        section_count=math.ceil(p.length/bench_policy['maximumSectionLengthM']);length=p.length/section_count
        for k in range(section_count):
            a=list(p.interpolate(k*length+bench_policy['sectionGapM']/2).coords[0]);b=list(p.interpolate((k+1)*length-bench_policy['sectionGapM']/2).coords[0])
            footprint=[ [q[i]+sign*v[i]*.30 for i in range(2)] for q,sign in [(a,-1),(b,-1),(b,1),(a,1)] ]
            assert finals[0].covers(Polygon(footprint))
            benches.append({'id':f'RANCH-EXTERIOR-BENCH-{row+1:02d}-{span}-{k}','row':row,'tileId':'2_-3','a':[round(x,7) for x in a],'b':[round(x,7) for x in b],'footprint':footprint})
assert len({b['row'] for b in benches})==10
catalog={'version':1,'sourceManifestSha256':release['manifestSha256'],'sourceInputSha256':digest(SOURCE),'sourceVideo':source['sourceVideo'],'sourceAerialSha256':source['sourceAerial']['sha256'],'sourceCarEnvelopeSha256':digest(carpath),'policy':source['policy'],'finishPolicy':'Fine pale hard-pad grain, restrained light gravel and sparse needle/soil coloration are authored finishes. No source image textures, surveyed bench layout, curbs, floor heights, tree placement, access or ground under the entire pine canopy are claimed. Geometry is draped onto final retained terrain.','tiles':tiles,'features':features,'benchPolicy':bench_policy,'benches':benches}
(DATA/'indian-ranch-grounds.json').write_text(json.dumps(catalog,separators=(',',':'))+'\n')
proof={'sourceInputSha256':digest(SOURCE),'sourceExports':exports,'fullCarPoseCount':count,'nearbyCarPoseCount':near,'protectedTriangles':triangles(protection.intersection(extent)),'sourceStructureIds':list(source['registeredStructures']),'overlapM2':{k:unary_union(finals).intersection(q).area for k,q in unions.items()},'featureAreasM2':{f['id']:f['areaM2'] for f in features},'benchRows':10,'benchSections':len(benches),'benchSupport':'Every authored bench footprint lies inside the pad; every row centerline has support from tile 2_-3 at all three native LODs. Final runtime drape resamples final terrain.'}
(ROOT/'data/source/town/indian-ranch-ground-proof.json').write_text(json.dumps(proof,separators=(',',':'))+'\n')
print(json.dumps({'tiles':list(tiles),'features':proof['featureAreasM2'],'overlap':proof['overlapM2'],'carPoses':count,'nearby':near,'bytes':(DATA/'indian-ranch-grounds.json').stat().st_size}))
