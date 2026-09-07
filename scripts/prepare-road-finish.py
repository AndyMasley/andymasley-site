"""Fill inferred solid-centerline omissions without changing archived scenery.

The original ribbon builder trims every physical link by ten metres, including
survey segmentation points. This preserves its solid/dashed policy and geometry,
and emits only the omitted solid-yellow parts supported by decoded pavement.
"""
import collections
import gzip
import hashlib
import json
import math
import os
from pathlib import Path

SITE=Path(__file__).resolve().parents[1]
SOURCE=Path(os.environ.get('WEBSTER_SOURCE','/Users/andy/Documents/New project/webster-blender'))


def xy_distance(a,b):return math.hypot(a[0]-b[0],a[1]-b[1])
def unit(v):
    n=math.hypot(*v)
    return [v[0]/n,v[1]/n] if n else [0,0]
def mix(a,b,t):return [x+(y-x)*t for x,y in zip(a,b)]
def cross(a,b,c):return (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])
def area(poly):return abs(sum(a[0]*b[1]-a[1]*b[0] for a,b in zip(poly,poly[1:]+poly[:1])))/2


def clip(poly,triangle):
    sign=1 if cross(*triangle)>0 else -1
    for a,b in zip(triangle,triangle[1:]+triangle[:1]):
        old=poly;poly=[]
        if not old:break
        for p,q in zip(old,old[1:]+old[:1]):
            x=sign*cross(a,b,p);y=sign*cross(a,b,q)
            if x>=-1e-8:poly.append(p)
            if (x>1e-8 and y< -1e-8)or(x< -1e-8 and y>1e-8):poly.append(mix(p,q,x/(x-y)))
    return poly


def subtract_convex(poly,zone):
    """Convex fragments outside an observed crossing's protected rectangle."""
    sign=1 if cross(zone[0],zone[1],zone[2])>0 else -1;remaining=poly;result=[]
    for a,b in zip(zone,zone[1:]+zone[:1]):
        inside=[];outside=[]
        for p,q in zip(remaining,remaining[1:]+remaining[:1]):
            x=sign*cross(a,b,p);y=sign*cross(a,b,q)
            if x>=-1e-8:inside.append(p)
            if x<=1e-8:outside.append(p)
            if (x>1e-8 and y< -1e-8)or(x< -1e-8 and y>1e-8):
                point=mix(p,q,x/(x-y));inside.append(point);outside.append(point)
        if len(outside)>=3 and area(outside)>.00002:result.append(outside)
        remaining=inside
        if len(remaining)<3:break
    return result


def main():
    path=SITE/'data/derived/town/engine-network.json.gz';raw=gzip.decompress(path.read_bytes());graph=json.loads(raw)
    by_id={e['id']:e for e in graph['edges']};physical={};directions=collections.defaultdict(list);nodes=collections.defaultdict(list)
    for edge in graph['edges']:
        physical.setdefault(edge['physical_id'],edge);directions[edge['physical_id']].append(edge)
    for edge in physical.values():
        nodes[edge['from']].append(edge);nodes[edge['to']].append(edge)
    blocked={tuple(sorted((by_id[t['from_edge']]['physical_id'],by_id[t['to_edge']]['physical_id']))) for t in graph['blocked_turns']}
    boundary_path=SOURCE/'navigation/webster_boundary.geojson';boundary=json.loads(boundary_path.read_text())
    assert boundary['coordinate_space']=='local EPSG:6491 metres; origin subtracted'
    rings=[ring for feature in boundary['features']for ring in feature['geometry']['coordinates']]
    crossing_path=SOURCE/'realism/observed_crosswalks.json';crossings=json.loads(crossing_path.read_text());protected=[]
    for crossing in crossings['crossings']:
        a,b=crossing['endpoints_local_xy'];direction=unit([b[0]-a[0],b[1]-a[1]]);normal=[-direction[1],direction[0]]
        radius=crossing['bar_length_m']/2+crossings['positional_uncertainty_m']
        rectangle=[[p[0]+normal[0]*side*radius,p[1]+normal[1]*side*radius]for p,side in [(a,-1),(b,-1),(b,1),(a,1)]]
        protected.append({'id':crossing['id'],'polygon':rectangle})
    def boundary_distance(point):
        result=math.inf
        for ring in rings:
            for a,b in zip(ring,ring[1:]):
                dx=b[0]-a[0];dy=b[1]-a[1];den=dx*dx+dy*dy
                t=max(0,min(1,((point[0]-a[0])*dx+(point[1]-a[1])*dy)/den)) if den else 0
                result=min(result,math.hypot(point[0]-a[0]-t*dx,point[1]-a[1]-t*dy))
        return result
    def eligible(edge):return len(directions[edge['physical_id']])==2 and edge['width_m']>=5.5 and 2<edge['road_type']<=5
    def away(edge,node):
        p=edge['points'] if edge['from']==node else edge['points'][::-1]
        target=next((x for x in p[1:] if xy_distance(p[0],x)>=1),p[-1])
        return unit([target[0]-p[0][0],target[1]-p[0][1]])
    def same_road(a,b):return (a['name']==b['name'] and a['name']!='Unnamed road')or bool(a.get('route_id') and a['route_id']==b.get('route_id'))
    trims={};join_normals={};decisions=[];continuations=collections.defaultdict(set)
    for edge in physical.values():
        if not eligible(edge):continue
        for node in [edge['from'],edge['to']]:
            es=nodes[node];p=edge['points'][0 if edge['from']==node else -1];heading=away(edge,node)
            others=[e for e in es if e is not edge];through=[]
            for other in others:
                h=away(other,node);dot=sum(a*b for a,b in zip(heading,h))
                endpoint=other['points'][0 if other['from']==node else -1]
                if eligible(other) and same_road(edge,other) and dot< -math.cos(math.radians(35)) and abs(endpoint[2]-p[2])<.35 and tuple(sorted((edge['physical_id'],other['physical_id'])))not in blocked:through.append(other)
            reason='existing_terminal_setback';trim=10.0
            if len(through)==1:
                continuations[edge['physical_id']].add(through[0]['physical_id'])
            if len(through)==1 and (len(others)==1 or all(o is through[0]or(o['road_type']>=6 and o['name']=='Unnamed road' and o['width_m']<=6.1)for o in others)):
                reason='survey_segmentation_continuation' if len(others)==1 else 'minor_access_continuation';trim=0
                other_heading=away(through[0],node);joined=unit([heading[0]-other_heading[0],heading[1]-other_heading[1]])
                # Match the two stripe positions at the shared survey node.
                if edge['to']==node:joined=[-x for x in joined]
                join_normals[(edge['physical_id'],node)]=[-joined[1],joined[0]]
            elif not others and boundary_distance(p)<2:
                reason='mapped_town_boundary';trim=0
            elif others:
                crossing=[o for o in others if o not in through]
                if crossing:
                    requirements=[]
                    for other in crossing:
                        h=away(other,node);sine=abs(heading[0]*h[1]-heading[1]*h[0])
                        requirements.append(other['width_m']/2/max(.25,sine)+1.5)
                    trim=min(10,max(4.5,*requirements));reason='width_based_real_junction'
            trims[(edge['physical_id'],node)]=trim
            decisions.append({'edgeId':edge['id'],'physicalId':edge['physical_id'],'node':node,'name':edge['name'],'trim':round(trim,4),'reason':reason,'incidentEdges':[e['id']for e in es]})
    # A short isolated road with no original painted interval does not acquire
    # a new marking merely because a smaller junction opening could fit one.
    # Short survey fragments may inherit the intent of a connected, same-road
    # corridor that already has yellow paint in the source.
    intended=set()
    for edge in physical.values():
        if not eligible(edge):continue
        s=[0.0]
        for a,b in zip(edge['points'],edge['points'][1:]):s.append(s[-1]+xy_distance(a,b))
        if any(a>10 and b<s[-1]-10 for a,b in zip(s,s[1:])):intended.add(edge['physical_id'])
    pending=list(intended)
    while pending:
        for other in continuations[pending.pop()]:
            if other not in intended:intended.add(other);pending.append(other)
    tiles=collections.defaultdict(list);surfaces=0;polygons=0;new_area=0;changed=set();intervals=0
    for edge in physical.values():
        if not eligible(edge)or edge['physical_id']not in intended:continue
        points=edge['points'];dist=[0.0]
        for a,b in zip(points,points[1:]):dist.append(dist[-1]+xy_distance(a,b))
        normals=[]
        for i,p in enumerate(points):
            a=points[max(0,i-1)];b=points[min(len(points)-1,i+1)];t=unit([b[0]-a[0],b[1]-a[1]]);normals.append([-t[1],t[0]])
        paint_normals=[n[:]for n in normals]
        for i,node in [(0,edge['from']),(-1,edge['to'])]:
            if (edge['physical_id'],node)in join_normals:paint_normals[i]=join_normals[(edge['physical_id'],node)]
        lo=trims[(edge['physical_id'],edge['from'])];hi=dist[-1]-trims[(edge['physical_id'],edge['to'])]
        if hi<=lo:continue
        width=edge['width_m']
        for i,(a,b)in enumerate(zip(points,points[1:])):
            if dist[i]>10 and dist[i+1]<dist[-1]-10:continue  # already painted in immutable source
            start=max(lo,dist[i]);end=min(hi,dist[i+1])
            if end-start<.002:continue
            length=dist[i+1]-dist[i];fa=(start-dist[i])/length;fb=(end-dist[i])/length
            paint=[]
            for k in [-.11,.11]:
                left=[[p[0]+n[0]*(k-.05),p[1]+n[1]*(k-.05)]for p,n in [(a,paint_normals[i]),(b,paint_normals[i+1])]]
                right=[[p[0]+n[0]*(k+.05),p[1]+n[1]*(k+.05)]for p,n in [(a,paint_normals[i]),(b,paint_normals[i+1])]]
                paint.append([mix(left[0],left[1],fa),mix(left[0],left[1],fb),mix(right[0],right[1],fb),mix(right[0],right[1],fa)])
            road=[]
            for p,n in [(a,normals[i]),(b,normals[i+1])]:
                road.extend([[p[0]+n[0]*side*width/2,p[1]+n[1]*side*width/2,p[2]]for side in [-1,1]])
            for face,ids in enumerate([[0,2,3],[0,3,1]]):
                triangle=[road[j]for j in ids]
                if abs(cross(*triangle))<1e-8:continue
                fragments=[clip(poly,triangle)for poly in paint];fragments=[p for p in fragments if len(p)>=3 and area(p)>.00002]
                for crossing in protected:fragments=[piece for poly in fragments for piece in subtract_convex(poly,crossing['polygon'])]
                if not fragments:continue
                center=[sum(p[k]for p in triangle)/3 for k in range(2)]
                # Exporter owns road triangles by centroid. Preserve that owner,
                # including triangles whose painted fragment crosses a tile edge.
                owners={(math.floor((center[0]+dx)/250),math.floor((center[1]+dy)/250))for dx in [-.002,.002]for dy in [-.002,.002]}
                row={'id':f'{edge["physical_id"]}:{i}:{face}','edgeId':edge['id'],'physicalId':edge['physical_id'],
                    'surface':[[round(x,6)for x in p]for p in triangle],'paint':[[[round(x,6)for x in p]for p in poly]for poly in fragments]}
                for x,y in owners:tiles[f'{x}_{y}'].append(row)
                surfaces+=1;polygons+=len(fragments);new_area+=sum(area(p)for p in fragments);changed.add(edge['id'])
            intervals+=1
    common={'version':1,'sourceNetworkSha256':hashlib.sha256(raw).hexdigest(),'sourceBoundarySha256':hashlib.sha256(boundary_path.read_bytes()).hexdigest(),'sourceCrosswalksSha256':hashlib.sha256(crossing_path.read_bytes()).hexdigest(),
        'sourceGenerator':'webster-blender/driving/prepare_surfaces.py:34-39','sourceRule':'Original solid paint omitted every interval unless s[i]>10 and s[i+1]<length-10, regardless of actual junction topology.',
        'inference':'Finished solid-yellow continuity inferred from the existing mapped two-way road and junction geometry. No surveyed lane-marking claim. Existing white/dashed paint, one-way roads, motorways and graph are unchanged.',
        'policy':{'paintOffsetM':.018,'sourceTriangleMatchToleranceM':.002,'minimumRealJunctionSetbackM':4.5,'maximumRealJunctionSetbackM':10,'maximumContinuationDeflectionDegrees':35,'observedCrosswalkSetbackM':crossings['positional_uncertainty_m']},
        'counts':{'changedEdges':len(changed),'intervals':intervals,'sourceSurfaces':surfaces,'polygons':polygons,'paintAreaM2':round(new_area,3),'tiles':len(tiles)}}
    directory=SITE/'public/town-finish/v1/markings';directory.mkdir(parents=True,exist_ok=True);assets={}
    for tile,rows in sorted(tiles.items()):
        content=(json.dumps({'version':1,'tileId':tile,'rows':rows},separators=(',',':'))+'\n').encode();digest=hashlib.sha256(content).hexdigest();name=f'{tile}.{digest[:12]}.json'
        (directory/name).write_bytes(content);assets[tile]={'url':f'/town-finish/v1/markings/{name}','count':len(rows),'bytes':len(content),'sha256':digest}
    index={**common,'tiles':assets};destination=SITE/'data/derived/town/road-finish-index.json';destination.write_text(json.dumps(index,separators=(',',':'))+'\n')
    (SITE/'data/derived/town/road-finish-audit.json').write_text(json.dumps({**common,'decisions':decisions,'changedEdges':sorted(changed),'sourceYellowIntentPhysicalIds':sorted(intended),'protectedCrosswalks':protected},separators=(',',':'))+'\n')
    current={Path(asset['url']).name for asset in assets.values()}
    for old in directory.glob('*.json'):
        if old.name not in current:old.unlink()
    old=SITE/'data/derived/town/road-finish.json'
    if old.exists():old.unlink()
    print(json.dumps({**common['counts'],'indexBytes':destination.stat().st_size,'payloadBytes':sum(a['bytes']for a in assets.values()),'nodeReasons':dict(collections.Counter(r['reason']for r in decisions))},indent=2))


if __name__=='__main__':main()
