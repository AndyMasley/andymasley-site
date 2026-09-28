#!/usr/bin/env python3
"""Make the bounded Mill Street rail-underpass display-terrain correction.

The source railway is two dimensional. FRA crossing 501840T establishes that
rail passes UNDER Mill Street; retained approach ground provides the inferred
rail grade. This does not claim surveyed subgrade or change any road/bridge.
Input terrain is the fully assembled predecessor exported by export-corridor.mjs.
Every affected source face is partitioned in barycentric space, preserving all
unmodified surface and allowing applyTerrainFinish to retain every source UV.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TILE = '-11_2'
WAY = 1012657197
NORTH_RANGE = (502., 562.)
# Full ballast-width sampling requires longer flats than railhead probes: the
# former approach tapers left soil above ballast at N505..515 and N558..560.
# Both ends now transition where all three native LOD beds are already clear.
FULL_CUT_NORTH = (504., 560.)
HALF_BED = 1.55
HALF_DOMAIN = 2.6
BED_OFFSET = -.34
MAX_LOWER = 5.5
# At this rise the cap lies strictly above all retained source terrain along
# the patch edge; therefore the original surface is retained at every boundary.
BANK_RISE = 6.
EPS = 1e-10


def read(path):
    return json.loads(Path(path).read_text())


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def cross(a, b, c):
    return (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])


def interpolate(a, b, t):
    return [x+(y-x)*t for x, y in zip(a, b)]


def split(poly, value):
    """Partition a convex barycentric polygon without changing its footprint."""
    positive, negative = [], []
    for a, b in zip(poly, poly[1:]+poly[:1]):
        x, y = value(a), value(b)
        if x >= -EPS:
            positive.append(a)
        if x <= EPS:
            negative.append(a)
        if x > EPS and y < -EPS or x < -EPS and y > EPS:
            p = interpolate(a, b, x/(x-y))
            positive.append(p)
            negative.append(p)
    def clean(p):
        out = []
        for q in p:
            if not out or math.dist(q[:2], out[-1][:2]) > 1e-12:
                out.append(q)
        if len(out)>1 and math.dist(out[0][:2], out[-1][:2])<1e-12:
            out.pop()
        return out if len(out)>=3 else []
    return clean(positive), clean(negative)


def area(poly):
    return abs(sum(cross(poly[0], poly[k], poly[k+1]) for k in range(1,len(poly)-1)))/2


def world_positions(mesh):
    m = mesh['matrixWorld']
    p = mesh['positions']
    out = []
    for k in range(0,len(p),3):
        x,y,z=p[k:k+3]
        out.append([m[0]*x+m[4]*y+m[8]*z+m[12],
                    -(m[2]*x+m[6]*y+m[10]*z+m[14]),
                    m[1]*x+m[5]*y+m[9]*z+m[13]])
    return out


def fnv_geometry(mesh):
    # Preserve the authoritative runtime stamp from the complete predecessor;
    # applyTerrainFinish re-hashes position/index bytes before any mutation.
    assert len(mesh['geometryStamp'])==8
    assert all(c in '0123456789abcdef' for c in mesh['geometryStamp'])
    return mesh['geometryStamp']


def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--input',type=Path,required=True,help='Native full terrain export directory')
    ap.add_argument('--grade',type=Path,required=True,help='Global grade points or rail packet rows[].points [E,N,railZ,station,nE,nN]')
    ap.add_argument('--output',type=Path,default=ROOT/'data/derived/town/rail-underpass-terrain.json')
    args=ap.parse_args()
    release=read(ROOT/'data/derived/town/release.json')
    grade=read(args.grade)
    rows=grade.get('rows',grade.get('ways',[]))
    points=grade['points'] if 'points' in grade else next(r['points']for r in rows if r.get('wayId',r.get('id'))==WAY)
    assert len(points)>=2 and all(len(q)>=3 for q in points)
    points=sorted(points,key=lambda q:q[1])
    assert points[0][1]<=NORTH_RANGE[0] and points[-1][1]>=NORTH_RANGE[1], 'Grade must cover entire cut'
    # OSM way is straight over this one underpass. Pin that exact source line;
    # a bend requires new partition logic, not silently approximating it.
    before=max((q for q in points if q[1]<=NORTH_RANGE[0]),key=lambda q:q[1])
    after=min((q for q in points if q[1]>=NORTH_RANGE[1]),key=lambda q:q[1])
    length=math.hypot(after[0]-before[0],after[1]-before[1])
    tangent=[(after[0]-before[0])/length,(after[1]-before[1])/length]
    normal=[-tangent[1],tangent[0]]
    def east(n):return before[0]+(n-before[1])*tangent[0]/tangent[1]
    for q in points:
        if NORTH_RANGE[0]<=q[1]<=NORTH_RANGE[1]:
            assert abs(q[0]-east(q[1]))<.002, 'Unexpected centerline bend'
    def at(p):
        n=p[1]
        for a,b in zip(points,points[1:]):
            if a[1]-1e-8<=n<=b[1]+1e-8:
                return a[2]+(b[2]-a[2])*(n-a[1])/(b[1]-a[1])
        raise ValueError(('Missing grade at',n))
    def smooth(t):return t*t*(3-2*t)
    # Piecewise-linear approximation to smooth shoulders; every breakpoint is
    # imprinted into every intersected source triangle, avoiding T-junctions.
    shoulder=[(HALF_BED+(HALF_DOMAIN-HALF_BED)*t,BANK_RISE*smooth(t))for t in (0,.25,.5,.75,1)]
    lateral=[(-x,z)for x,z in reversed(shoulder)]+shoulder
    longitudinal=[]
    for t in (0,.25,.5,.75,1):
        longitudinal.append((NORTH_RANGE[0]+(FULL_CUT_NORTH[0]-NORTH_RANGE[0])*t,BANK_RISE*(1-smooth(t))))
    for t in (0,.25,.5,.75,1):
        longitudinal.append((FULL_CUT_NORTH[1]+(NORTH_RANGE[1]-FULL_CUT_NORTH[1])*t,BANK_RISE*smooth(t)))
    def linear(table,x):
        for a,b in zip(table,table[1:]):
            if a[0]-1e-8<=x<=b[0]+1e-8:
                return a[1]+(b[1]-a[1])*(x-a[0])/(b[0]-a[0])
        raise ValueError(('Outside profile',x))
    def lateral_at(p):return (p[0]-before[0])*normal[0]+(p[1]-before[1])*normal[1]
    def cap(p):return at(p)+BED_OFFSET+linear(lateral,lateral_at(p))+linear(longitudinal,p[1])
    north_knots=sorted(set([q[0]for q in longitudinal]+[q[1]for q in points if NORTH_RANGE[0]<q[1]<NORTH_RANGE[1]]))
    lateral_knots=[q[0]for q in lateral]
    levels=[];reports=[]
    for level in range(3):
        source=args.input/f'{TILE}-{level}-terrain.json'
        raw=read(source)
        assert raw['tileId']==TILE and raw['level']==level and raw['origin']==[-2750,0,-500]
        meshes=[];maximum_lower=0.;changed_area=0.;changed_faces=0;emitted=0;maximum_area_error=0.;boundary_delta=0.
        for mesh in raw['meshes']:
            assert mesh['name'].startswith('terrain')
            verts=world_positions(mesh)
            indices=mesh['indices'] or list(range(len(verts)))
            patches=[]
            for i in range(0,len(indices),3):
                tri=[verts[k]for k in indices[i:i+3]]
                if max(p[1]for p in tri)<NORTH_RANGE[0] or min(p[1]for p in tri)>NORTH_RANGE[1]:continue
                ts=[lateral_at(p)for p in tri]
                if max(ts)<-HALF_DOMAIN or min(ts)>HALF_DOMAIN:continue
                if abs(cross(*tri))<1e-9:continue
                def position(q):return [tri[0][j]+q[0]*(tri[1][j]-tri[0][j])+q[1]*(tri[2][j]-tri[0][j])for j in range(3)]
                inside=[[0.,0.],[1.,0.],[0.,1.]];outside=[]
                for f in (lambda q:position(q)[1]-NORTH_RANGE[0],lambda q:NORTH_RANGE[1]-position(q)[1],lambda q:lateral_at(position(q))+HALF_DOMAIN,lambda q:HALF_DOMAIN-lateral_at(position(q))):
                    inside,rest=split(inside,f)
                    if rest:outside.append(rest)
                    if not inside:break
                if not inside or area(inside)<1e-12:continue
                cells=[inside]
                for knot in north_knots[1:-1]:
                    cells=[p for cell in cells for p in split(cell,lambda q,k=knot:position(q)[1]-k)if p]
                for knot in lateral_knots[1:-1]:
                    cells=[p for cell in cells for p in split(cell,lambda q,k=knot:lateral_at(position(q))-k)if p]
                pieces=[(p,False)for p in outside]
                for cell in cells:
                    cut,keep=split(cell,lambda q:position(q)[2]-cap(position(q)))
                    if cut:pieces.append((cut,True))
                    if keep:pieces.append((keep,False))
                out=[];delta=[];face_changed_area=0.
                for poly,lower in pieces:
                    if area(poly)<1e-13:continue
                    if lower:face_changed_area+=area(poly)*abs(cross(*tri))
                    for k in range(1,len(poly)-1):
                        face=[poly[0],poly[k],poly[k+1]]
                        if abs(cross(*face))<1e-13:continue
                        for q in face:
                            p=position(q);z=min(p[2],cap(p))if lower else p[2]
                            d=p[2]-z;delta.append(d)
                            if abs(abs(lateral_at(p))-HALF_DOMAIN)<1e-6 or min(abs(p[1]-v)for v in NORTH_RANGE)<1e-6:boundary_delta=max(boundary_delta,d)
                            out.append([round(q[0],12),round(q[1],12),round(z,9)])
                if not delta or max(delta)<1e-6:continue
                coverage=sum(abs(cross(out[k],out[k+1],out[k+2]))for k in range(0,len(out),3))
                error=abs(coverage-1)*abs(cross(*tri))/2
                maximum_area_error=max(maximum_area_error,error)
                assert abs(coverage-1)<2e-7, ('Partition area changed',level,mesh['name'],i//3,coverage)
                assert min(delta)>-1e-8 and max(delta)<=MAX_LOWER, ('Outside height envelope',level,max(delta))
                assert len(out)<12000
                patches.append([i//3,out]);maximum_lower=max(maximum_lower,max(delta));changed_area+=face_changed_area;changed_faces+=1;emitted+=len(out)//3
            if patches:
                meshes.append({'mesh':mesh['name'],'geometryStamp':fnv_geometry(mesh),'positions':len(verts),'triangles':len(indices)//3,'patches':patches})
        assert meshes and boundary_delta<1e-6, ('No cut or changed domain boundary',level,boundary_delta)
        levels.append({'level':level,'sourceSha256':raw['sourceSha256'],'meshes':meshes})
        reports.append({'level':level,'sourceExportSha256':sha(source),'meshes':len(meshes),'sourceFaces':changed_faces,'outputTriangles':emitted,'addedTriangles':emitted-changed_faces,'modifiedSurfaceAreaM2':changed_area,'maximumLowerM':maximum_lower,'maximumRaiseM':0,'maximumPartitionAreaErrorM2':maximum_area_error,'maximumBoundaryHeightChangeM':boundary_delta})
    packet={'version':1,'tileId':TILE,'sourceManifestSha256':release['manifestSha256'],'levels':levels}
    provenance={'version':1,'policy':'Display-terrain cut only at the official Mill Street railroad-under crossing. Railway plan alignment is source-backed; running grade, subgrade and bank dimensions are inferred from retained approach elevations, not surveyed. Only terrain is lowered; existing road/bridge/water/building geometry is untouched. Exact source faces are partitioned with barycentric coordinates so outside geometry and UVs survive.','officialCrossing':{'id':'501840T','type':'RR Under','url':'https://services.arcgis.com/xOi1kZaI0eWDREZv/arcgis/rest/services/NTAD_Railroad_Grade_Crossings/FeatureServer/0'},'sourceRailwaySha256':sha(ROOT/'data/source/town/rail-crossings/active-railways.json'),'sourceManifestSha256':release['manifestSha256'],'sourceGradeSha256':sha(args.grade),'wayId':WAY,'tileId':TILE,'northRangeM':list(NORTH_RANGE),'fullCutNorthRangeM':list(FULL_CUT_NORTH),'maximumWidthM':HALF_DOMAIN*2,'flatBedWidthM':HALF_BED*2,'bedBelowRunningSurfaceM':-BED_OFFSET,'maximumPermittedLowerM':MAX_LOWER,'rows':reports}
    args.output.parent.mkdir(parents=True,exist_ok=True)
    args.output.write_text(json.dumps(packet,separators=(',',':'))+'\n')
    provenance['packetSha256']=sha(args.output)
    args.output.with_name(args.output.stem+'-provenance.json').write_text(json.dumps(provenance,indent=2)+'\n')
    report=args.input/'mill-underpass-terrain-generation.json'
    report.write_text(json.dumps(provenance,indent=2)+'\n')
    print(json.dumps(provenance,indent=2))


if __name__=='__main__':
    main()
