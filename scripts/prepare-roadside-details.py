"""Register mapped roadside objects and restrained, explicitly inferred utility runs."""
import json, gzip, hashlib, math, os
from collections import Counter, defaultdict
from pathlib import Path
from pyproj import Transformer
from shapely.geometry import Point, LineString, Polygon, shape
from shapely.strtree import STRtree
from shapely.ops import unary_union

ROOT=Path(__file__).resolve().parents[1]
SOURCE=Path(os.environ.get('WEBSTER_SOURCE','/Users/andy/Documents/New project/webster-blender'))
read=lambda p:json.loads(p.read_bytes())
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
rel=read(ROOT/'data/derived/town/release.json');base=ROOT/'public/town-assets'/rel['directory'];manifest=read(base/'manifest.json')
network=read(SOURCE/'web-export/engine/network.json')
project=Transformer.from_crs(4326,6491,always_xy=True);origin=network['origin_projected_m']
def xy(lon,lat):
    a,b=project.transform(lon,lat);return[a-origin[0],b-origin[1]]
edges=[];seen=set()
for e in network['edges']:
    if e['physical_id']in seen:continue
    seen.add(e['physical_id']);edges.append(e)
lines=[LineString([p[:2]for p in e['points']])for e in edges];tree=STRtree(lines)
buildings=read(SOURCE/'street-detail/building_architecture.json')
built=unary_union([Polygon(r['outline_xy']).buffer(.6)for r in buildings if len(r['outline_xy'])>=3])
water=unary_union([shape(f['geometry']) for f in read(SOURCE/'townwide/landscape_water.geojson')['features']])
road=unary_union([g.buffer(e['width_m']/2+.65)for g,e in zip(lines,edges)])
tiles={t['id']:t for t in manifest['tiles'] if t['lods']};rows=[];skipped=[]
def tile_id(p):return f'{math.floor(p[0]/250)}_{math.floor(p[1]/250)}'
def nearest(p):
    k=tree.nearest(Point(p));g=lines[k];s=g.project(Point(p));q=g.interpolate(s);a=g.interpolate(max(0,s-.4));b=g.interpolate(min(g.length,s+.4));length=a.distance(b)
    return int(k),s,[q.x,q.y],[(b.x-a.x)/length,(b.y-a.y)/length]
def clear(p,radius=.35):return not(Point(p).buffer(radius).intersects(built)or Point(p).buffer(radius).intersects(road)or Point(p).buffer(radius+.5).intersects(water))
def place(id,kind,p,label='',facing=None,offset_limit=8):
    k,s,q,t=nearest(p);e=edges[k];delta=[p[i]-q[i]for i in [0,1]];side=1 if delta[0]*t[1]-delta[1]*t[0]>=0 else -1;n=[t[1]*side,-t[0]*side]
    # Preserve a mapped roadside point if safe, otherwise register to its own
    # roadside with a recorded bounded offset; never drop a pole on a centerline.
    candidates=[p]+[[q[i]+n[i]*d+t[i]*a for i in [0,1]]for a in [0,1.5,-1.5,3,-3]for d in [e['width_m']/2+1.25,e['width_m']/2+2.1]]
    candidate=next((v for v in candidates if math.dist(p,v)<=offset_limit and tile_id(v)in tiles and clear(v)),None)
    if candidate is None:skipped.append({'id':id,'reason':'No bounded road/building/water-clear placement','point':p});return None
    normal=facing or [-n[0],-n[1]]
    r={'id':id,'kind':kind,'point':[round(v,4)for v in candidate],'mappedPoint':[round(v,4)for v in p],'tileId':tile_id(candidate),'normal':normal,'label':label,'roadId':e['id'],'roadName':e['name'],'shiftM':round(math.dist(p,candidate),4)}
    rows.append(r);return r

osm=read(ROOT/'data/source/town/roadside/osm-furniture.json')
controls=read(ROOT/'data/source/town/roadside/control-ways.json');control_nodes={r['id']:r for r in controls['elements']if r['type']=='node'}
ways=[r for r in controls['elements']if r['type']=='way' and 'highway'in r.get('tags',{})]
for e in osm['elements']:
    p=xy(e['lon'],e['lat']);tag=e['tags']
    if tag.get('amenity')=='post_box':
        r=place('OSM-'+str(e['id']),'post-box',p)
        if r:r['evidence']='OSM node position; blue collection-box form/color inferred, operator not recorded.'
        continue
    connected=[w for w in ways if e['id']in w['nodes']];all_way=tag.get('stop')=='all';arms=[]
    for w in connected:
        at=w['nodes'].index(e['id']);direction=tag.get('direction');inference=False
        if not all_way and direction not in ['forward','backward']:
            start=control_nodes[w['nodes'][0]];end=control_nodes[w['nodes'][-1]];d0=math.dist(p,xy(start['lon'],start['lat']));d1=math.dist(p,xy(end['lon'],end['lat']))
            if min(d0,d1)>25 or max(d0,d1)<min(d0,d1)*3:continue
            direction='forward'if d1<d0 else'backward';inference=True
        for step in [-1,1]:
            if not 0<=at+step<len(w['nodes'])or not all_way and step!=(-1 if direction=='forward'else 1):continue
            n=control_nodes[w['nodes'][at+step]];before=xy(n['lon'],n['lat']);v=[p[i]-before[i]for i in [0,1]];length=math.hypot(*v)
            if length<.1:continue
            travel=[x/length for x in v]
            if any(sum(a[i]*travel[i]for i in [0,1])>.94 for a in arms):continue
            arms.append(travel);right=[travel[1],-travel[0]]
            candidates=[int(k)for k in tree.query(Point(p).buffer(30))if edges[k]['name'].upper()==w.get('tags',{}).get('name','').upper()]
            if not candidates:continue
            k=min(candidates,key=lambda k:lines[k].distance(Point(p)));e2=edges[k];center=lines[k].interpolate(lines[k].project(Point(p)))
            pos=[center.x+right[0]*(e2['width_m']/2+1.35),center.y+right[1]*(e2['width_m']/2+1.35)]
            r=place(f'OSM-{e["id"]}-{len(arms)}','stop',pos,'STOP',[-v for v in travel],7)
            if r:
                r.update(allWay=all_way,mappedPoint=p,shiftM=round(math.dist(p,r['point']),4),osmWay=w['id'],osmDirection=direction,approachDirectionInferred=inference)
                r['evidence']='OSM control node and connected road geometry; '+('approach direction inferred from uniquely adjacent way-end junction; 'if inference else'explicit direction/all-way approaches; ')+'standard octagon and roadside mounting authored with road clearance.'
    if not arms:skipped.append({'id':'OSM-'+str(e['id']),'reason':'Source road approach remains ambiguous'})

wrta=read(ROOT/'data/source/town/roadside/wrta-stops.json');bus=[]
for s in wrta['stops']:
    p=xy(float(s['stop_lon']),float(s['stop_lat']))
    duplicate=next((r for r in bus if math.dist(r['mappedPoint'],p)<5),None)
    if duplicate:
        duplicate['stopIds'].append(s['stop_id']);continue
    r=place('WRTA-'+s['stop_code'],'bus-stop',p,'WRTA\n'+' · '.join(s['routes']))
    if r:r.update(stopIds=[s['stop_id']],stopName=s['stop_name'],evidence='WRTA GTFS boarding-stop coordinates and served route numbers; flag dimensions/colors/post inferred. No timetable, shelter or service claim.');bus.append(r)

# Source photographs document overhead utility character on these corridors,
# not a pole-by-pole survey. Spacing, side, crossarms, neutral wires and LED
# heads are artistic infill with mapped pavement/water/building exclusion.
corridors={'SCHOOL STREET','LAKE STREET','THOMPSON ROAD','EAST MAIN STREET','WORCESTER ROAD','NORTH MAIN STREET','GORE ROAD','SUTTON ROAD','CUDWORTH ROAD'}
poles=[]
for e,g in zip(edges,lines):
    if e['name'].upper()not in corridors or e.get('bridge_event_ids') or g.length<55:continue
    previous=None
    for step in range(18,int(g.length)-15,46):
        q=g.interpolate(step);a=g.interpolate(step-.5);b=g.interpolate(step+.5);length=a.distance(b);t=[(b.x-a.x)/length,(b.y-a.y)/length];n=[t[1],-t[0]]
        sidewalk=2.4 if e['name'].upper()in {'SCHOOL STREET','EAST MAIN STREET','LAKE STREET','NORTH MAIN STREET'}else 1.7
        p=[q.x+n[0]*(e['width_m']/2+sidewalk),q.y+n[1]*(e['width_m']/2+sidewalk)]
        if not clear(p,.55)or any(math.dist(p,r['point'])<25 for r in poles):previous=None;continue
        r=place(f'UTILITY-{e["physical_id"]}-{step}','utility-pole',p,'',[-n[0],-n[1]],0)
        if not r:previous=None;continue
        r.update(height=9.5+(e['physical_id']%4)*.3,light=step%138==18,evidence='Inferred infill on research/photo-supported overhead corridors, 46 m spacing; not surveyed pole locations. Modern LED head family follows MAPC Webster conversion evidence.')
        # A complete span belongs to one tile. Its opposite support may sit in
        # the neighboring tile; saved absolute heights keep LOD changes stable.
        if previous and not LineString([r['point'],previous['point']]).buffer(.35).intersects(built):r['previousId']=previous['id']
        poles.append(r);previous=r

# Terrain footings are sampled against immutable decoded source terrain once.
# Runtime rechecks support at each LOD; no fabricated unsupported pole heights.
extract=Path(os.environ.get('TERRAIN_FINISH_WORK','/private/tmp/webster-finished-streets-audit'))/'extracted';surfaces={}
def ground(p):
    tile=tile_id(p)
    if tile not in surfaces:
        path=extract/(tile+'-0.json.gz')
        if not path.exists():return None
        j=json.loads(gzip.decompress(path.read_bytes()));assert j['sourceSha256']==tiles[tile]['lods'][0]['sha256']
        polys=[];heights=[]
        for m in j['meshes']:
            if m['category']!='terrain':continue
            v=m['positions'];ix=m['index']if m['index']is not None else list(range(len(v)))
            for at in range(0,len(ix),3):
                pts=[v[i]for i in ix[at:at+3]];poly=Polygon([(v[0],-v[2])for v in pts])
                if poly.area<1e-8:continue
                polys.append(poly);heights.append(pts)
        surfaces[tile]=(STRtree(polys),heights)
    tree0,heights=surfaces[tile];ys=[]
    for k in tree0.query(Point(p),predicate='intersects'):
        a,b,c=heights[k];x,z=p[0],-p[1];det=(b[0]-a[0])*(c[2]-a[2])-(c[0]-a[0])*(b[2]-a[2])
        u=((x-a[0])*(c[2]-a[2])-(c[0]-a[0])*(z-a[2]))/det;v=((b[0]-a[0])*(z-a[2])-(x-a[0])*(b[2]-a[2]))/det
        ys.append(a[1]+u*(b[1]-a[1])+v*(c[1]-a[1]))
    return max(ys)if ys else None
valid=[]
for r in rows:
    y=ground(r['point'])
    if y is None:skipped.append({'id':r['id'],'reason':'No native terrain footing'});continue
    r['base']=round(y,4);valid.append(r)
rows=valid;byid={r['id']:r for r in rows}
for r in rows:
    p=byid.get(r.pop('previousId',''))
    if p:
        # Existing road profiles bound wires even over side-street crossings.
        span=LineString([r['point'],p['point']]);ok=True
        for k in tree.query(span.buffer(2)):
            edge=edges[k]
            for point in edge['points']:
                if span.distance(Point(point[:2]))<edge['width_m']/2+1 and point[2]+6.0>min(r['base']+r['height'],p['base']+p['height'])-.55:ok=False;break
            if not ok:break
        if ok:r['wireEnd']=[*p['point'],p['base']+p['height']-.19]
groups=defaultdict(list)
for r in rows:groups[r['tileId']].append(r)
dest=ROOT/'public/town-roadside';dest.mkdir(exist_ok=True)
for old in dest.glob('*.json'):old.unlink()
index={'version':1,'sourceManifestSha256':rel['manifestSha256'],'count':len(rows),'tiles':{}}
for tile,objects in sorted(groups.items()):
    t=tiles[tile];packet={'version':1,'tileId':tile,'origin':t['origin'],'sourceLods':{str(l['level']):l['sha256']for l in t['lods']},'objects':objects}
    raw=json.dumps(packet,separators=(',',':')).encode();digest=hashlib.sha256(raw).hexdigest();name=f'{tile}.{digest[:12]}.json';(dest/name).write_bytes(raw)
    index['tiles'][tile]={'url':'/town-roadside/'+name,'bytes':len(raw),'sha256':digest}
(ROOT/'data/derived/town/roadside-index.json').write_text(json.dumps(index,indent=2)+'\n')
coverage=[]
for e in osm['elements']:
    prefix='OSM-'+str(e['id']);matches=[r['id']for r in rows if r['id']==prefix or r['id'].startswith(prefix+'-')];notes=[r['reason']for r in skipped if r['id']==prefix or r['id'].startswith(prefix+'-')]
    coverage.append({'sourceId':prefix,'kind':e['tags'].get('amenity',e['tags'].get('highway')),'renderIds':matches,'status':'applied'if matches else'not-applied','limitations':notes or ([]if matches else['No unambiguous connected approach matched the retained named driving-road segment.'])})
for stop in wrta['stops']:
    prefix='WRTA-'+stop['stop_code'];matches=[r['id']for r in rows if stop['stop_id']in r.get('stopIds',[])];notes=[r['reason']for r in skipped if r['id']==prefix]
    coverage.append({'sourceId':prefix,'kind':'bus-stop','renderIds':matches,'status':'applied'if matches else'not-applied','limitations':notes})
audit={'version':1,'sourceCoverage':coverage,'counts':dict(Counter(r['kind']for r in rows)),'wireSpans':sum('wireEnd'in r for r in rows),'tiles':len(groups),'rawBytes':sum(v['bytes']for v in index['tiles'].values()),'sources':{'manifest':rel['manifestSha256'],'network':sha(SOURCE/'web-export/engine/network.json'),'buildings':sha(SOURCE/'street-detail/building_architecture.json'),'osm':sha(ROOT/'data/source/town/roadside/osm-furniture.json'),'osmControlWays':sha(ROOT/'data/source/town/roadside/control-ways.json'),'wrta':sha(ROOT/'data/source/town/roadside/wrta-stops.json')},'appearanceBasis':'Mapped transit/post boxes/all-way control presence; explicit artistic roadside offsets and standard object forms. Corridor utility runs are inferred scene dressing, not measured utility inventory.','skipped':skipped,'objects':rows}
(ROOT/'data/derived/town/roadside-audit.json').write_text(json.dumps(audit,indent=2)+'\n');print({k:v for k,v in audit.items()if k not in ['objects','skipped','sources','sourceCoverage']});print('skipped',len(skipped))
