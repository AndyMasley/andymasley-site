"""Build the bounded, photo-informed School Street geometry and frontage data.

Reads frozen atlas/source geometry and writes only the named derived JSON and a
temporary QA receipt. No Blender, source imagery, owner data or game scene writes.
Dimensions and concealed elevations are explicit authored interpretations.
"""
from pathlib import Path
import base64
import collections
import hashlib
import json
import math
import sys
import os

import numpy as np
from shapely.geometry import Polygon, Point, box, LineString
from shapely.geometry.polygon import orient

sys.path.insert(0, os.environ.get('WEBSTER_MANIFOLD_PATH', '/private/tmp/webster-realism-v2-building/python-deps'))
import manifold3d as mf

SITE = Path(__file__).resolve().parents[1]
SOURCE = Path(os.environ.get('WEBSTER_SOURCE', '/Users/andy/Documents/New project/webster-blender'))
ATLAS = SOURCE / 'research'
WORK = Path(os.environ.get('WEBSTER_FRONTAGE_QA', '/private/tmp/webster-crafted-frontages'))
REPORTS = Path(os.environ.get('WEBSTER_BUILDING_REPORTS', '/private/tmp/webster-realism-v2-building/townwide-assets'))
OUTPUT = SITE / 'data/derived/town/crafted-frontages.json'


def read(path):
    return json.loads(path.read_bytes())


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def solid(vertices, faces):
    vertices = np.asarray(vertices, dtype='f8')
    center = vertices.mean(axis=0)
    triangles = []
    for face in faces:
        points = vertices[face]
        normal = np.cross(points[1]-points[0], points[2]-points[0])
        if np.dot(normal, points.mean(axis=0)-center) < 0:
            face = list(reversed(face))
        triangles.extend([[face[0], face[i], face[i+1]] for i in range(1, len(face)-1)])
    result = mf.Manifold(mf.Mesh64(vertices, np.asarray(triangles, dtype='u8')))
    assert result.status() == mf.Error.NoError, result.status()
    return result


def section(poly):
    p = orient(poly, sign=1)
    return mf.CrossSection([list(p.exterior.coords)] + [list(r.coords) for r in p.interiors], mf.FillRule.EvenOdd)


def prism(poly, bottom, top):
    return section(poly).extrude(top-bottom).translate([0, 0, bottom])


def gable(rect, bottom, eave, peak, ridge):
    x0, d0, x1, d1 = rect
    if ridge == 'across':
        return gable((d0, x0, d1, x1), bottom, eave, peak, 'depth').transform([[0, 1, 0, 0], [1, 0, 0, 0], [0, 0, 1, 0]])
    mid = (x0+x1)/2
    return solid([[x0,d0,bottom],[x1,d0,bottom],[x1,d1,bottom],[x0,d1,bottom],
                  [x0,d0,eave],[x1,d0,eave],[x1,d1,eave],[x0,d1,eave],[mid,d0,peak],[mid,d1,peak]],
                 [[0,3,2,1],[0,1,5,8,4],[3,7,9,6,2],[0,4,7,3],[1,2,6,5],[4,8,9,7],[8,5,6,9]])


def hip(rect, bottom, eave, peak, inset=None):
    x0,d0,x1,d1 = rect
    inset = min((x1-x0)/2-.03, (d1-d0)/2-.03) if inset is None else inset
    return solid([[x0,d0,bottom],[x1,d0,bottom],[x1,d1,bottom],[x0,d1,bottom],
                  [x0,d0,eave],[x1,d0,eave],[x1,d1,eave],[x0,d1,eave],
                  [x0+inset,d0+inset,peak],[x1-inset,d0+inset,peak],
                  [x1-inset,d1-inset,peak],[x0+inset,d1-inset,peak]],
                 [[0,3,2,1],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7],
                  [4,5,9,8],[5,6,10,9],[6,7,11,10],[7,4,8,11],[8,9,10,11]])


# These dimensional choices are inferred from the photographed form and the
# registered source envelope. They are not measurements from 268x201 photographs.
# Each mass is (bounds in the observed-front frame, eave, peak, roof family).
MASS = {
 '57': [( [0,0,6.9,22.2],44.15,46.2,'hip'), ([0,15.2,24,33],44.0,45.5,'hip')],
 '60': [( [0,0,8.25,13.5],45.08,47.8,'mansard')],
 '79': [( [-.1,0,11.8,21.1],48.92,48.92,'flat')],
 '107': [([0,0,7.1,3.1],42.55,42.55,'flat'),([0,3,9.7,12.6],44.45,47.25,'depth'),([1.4,10.4,15.9,17.2],43.4,45.7,'across'),([9.5,8,17.6,15.9],43.0,45.0,'across')],
 '116': [([-2.5,0,20.9,18.8],47.20,47.20,'flat')],
 '121': [([-1.2,1.65,16.3,9.4],45.3,48.15,'across'),([-1.2,8.8,8,16.5],44.5,47.3,'depth')],
 '130': [([0,0,11.7,9.4],48.15,51.10,'across'),([0,9.25,5,14.1],45.5,47.1,'depth')],
 '135': [([0,0,10.7,11.7],47.5,51.5,'depth'),([8.8,4.6,15,13.6],47.0,49.6,'depth'),([-1.8,10.3,5.9,24.2],44.6,47.2,'depth')],
 '140': [([0,1.7,8.75,17.9],47.9,50.65,'depth'),([-1.8,3.5,1,17.9],45.2,45.8,'depth'),([8.2,4.1,10,9.7],45.2,45.8,'depth')],
 '151': [([-.1,1.6,14.6,15.5],47.6,50.45,'across'),([12.4,7.5,17.2,13.9],45.5,47.0,'depth')],
 '156': [([-.2,1.7,8.7,14],48.6,51.55,'depth')],
}
FLOOR = {'57':38.20,'60':38.55,'79':39.00,'107':39.57,'116':42.88,'121':40.98,'130':42.49,'135':41.21,'140':41.98,'151':41.71,'156':42.19}
PAINT = {'57':'#7f8d88','60':'#969d98','79':'#ded6bf','107':'#74776c','116':'#945d48','121':'#ddd9b8','130':'#deded3','135':'#bac7c4','140':'#d7d8c7','151':'#9ca6a1','156':'#d6d9d0'}
PORCH = {'121':1.65,'140':1.7,'151':1.6,'156':1.7}
DOWNTOWN = ['168461_866703','168378_866662','168400_866616','168369_866612','168341_866602']


class Ground:
    def __init__(self, polygons):
        grade=np.load(SOURCE/'driving/roadbed_grading.npz')
        triangles=[]
        for path,prefix in [('townwide/terrain.npz','town'),('downtown/downtown_terrain.npz','downtown')]:
            data=np.load(SOURCE/path);v=data['vertices'].copy();v[grade[prefix+'_indices'],2]=grade[prefix+'_z']
            t=v[data['faces']];lo=t[:,:,:2].min(axis=1);hi=t[:,:,:2].max(axis=1);keep=np.zeros(len(t),bool)
            for polygon in polygons:
                x0,y0,x1,y1=polygon.buffer(55).bounds
                keep|=(lo[:,0]<=x1)&(hi[:,0]>=x0)&(lo[:,1]<=y1)&(hi[:,1]>=y0)
            triangles.append(t[keep].astype('f8'))
        self.t=np.concatenate(triangles);self.lo=self.t[:,:,:2].min(axis=1);self.hi=self.t[:,:,:2].max(axis=1)

    def height(self, point):
        x,y=point;t=self.t[(self.lo[:,0]<=x+1e-6)&(self.hi[:,0]>=x-1e-6)&(self.lo[:,1]<=y+1e-6)&(self.hi[:,1]>=y-1e-6)]
        a=t[:,0,:2];u=t[:,1,:2]-a;v=t[:,2,:2]-a;q=np.asarray(point)-a
        den=u[:,0]*v[:,1]-u[:,1]*v[:,0];valid=abs(den)>1e-12
        t=t[valid];u=u[valid];v=v[valid];q=q[valid];den=den[valid]
        wb=(q[:,0]*v[:,1]-q[:,1]*v[:,0])/den;wc=(u[:,0]*q[:,1]-u[:,1]*q[:,0])/den;wa=1-wb-wc
        valid=(wa>=-1e-6)&(wb>=-1e-6)&(wc>=-1e-6)
        heights=np.sum(t[:,:,2]*np.stack([wa,wb,wc],axis=1),axis=1)[valid]
        assert len(heights), ('Missing terrain support',point)
        return float(heights.max())


def b64(array):
    return base64.b64encode(np.asarray(array,dtype='<f4').tobytes()).decode()


def body_geometry(number, polygon, bottom, floor):
    # The floor slab preserves the complete original plan; porches occupy the
    # front zone in their own right instead of a flat dark facade on solid walls.
    body=prism(polygon,bottom,floor)
    clip=prism(polygon,bottom-1,65)
    masses=[]
    for rect,eave,peak,kind in MASS[number]:
        region=polygon.intersection(box(*rect))
        if region.area < .001:continue
        if kind=='flat':part=prism(region,floor,eave)
        elif kind in ['hip','mansard']:part=hip(rect,floor,eave,peak,1.10 if kind=='mansard' else None)^clip
        else:part=gable(rect,floor,eave,peak,kind)^clip
        body=body+part;masses.append({'bounds':rect,'eave':eave,'peak':peak,'roof':kind})
    mesh=body.simplify(.00001).to_mesh64();v=np.asarray(mesh.vert_properties)[:,:3];f=np.asarray(mesh.tri_verts)
    edge=collections.Counter(tuple(sorted(e)) for tri in f for e in zip(tri,np.roll(tri,-1)))
    assert all(n==2 for n in edge.values()), number
    assert body.volume()>0 and len(body.decompose())==1, number
    pieces=collections.defaultdict(list)
    for tri in f:
        p=v[tri];normal=np.cross(p[1]-p[0],p[2]-p[0]);normal/=np.linalg.norm(normal)
        role='foundation' if p[:,2].max()<=floor+.001 else 'roof' if normal[2]>.15 else 'wall'
        # Runtime local axes are front tangent, up, outward: swapping D/Z and
        # negating depth is a proper rotation, so triangle winding is retained.
        q=p[:,[0,2,1]].copy();q[:,2]*=-1;n=normal[[0,2,1]].copy();n[2]*=-1
        pieces[role].append(np.concatenate([q,np.tile(n,(3,1))],axis=1))
    chunks=[]
    for role,arrays in pieces.items():
        a=np.concatenate(arrays).astype('f4');assert np.isfinite(a).all()
        chunks.append({'role':role,'position':b64(a[:,:3]),'normal':b64(a[:,3:]),'vertices':len(a)})
    return chunks,{'triangles':len(f),'volumeM3':body.volume(),'closedOrientedBody':True,'masses':masses,'planAreaM2':polygon.area,'maximumHeight':float(v[:,2].max())}


def main():
    placement=read(SOURCE/'realism/references/property-photos/school-facade-placement.json')
    matches=read(SOURCE/'realism/references/property-photos/school-source-matches.json')
    photos={r['structId']:r for r in read(ATLAS/'data/exterior-photo-observations.json') if r.get('structId')}
    atlas={r['structId']:r for r in read(ATLAS/'data/building-register.json')}
    architecture={r['struct_id']:r for r in read(SOURCE/'street-detail/building_architecture.json')}
    shapes=[Polygon(matches[n]['candidates'][0]['xy']) for n in MASS]+[Polygon(architecture[s]['outline_xy']) for s in DOWNTOWN]
    ground=Ground(shapes)
    network=read(SOURCE/'driving/network.json')
    roads=[LineString([p[:2] for p in edge['points']]) for edge in network['edges']]
    school_roads=[LineString([p[:2] for p in edge['points']]) for edge in network['edges'] if edge['name']=='SCHOOL STREET']
    main_roads=[LineString([p[:2] for p in edge['points']]) for edge in network['edges'] if edge['name']=='MAIN STREET']
    records=[];qa=[]
    for num,p in sorted(placement.items(),key=lambda item:int(item[0])):
        sid=p['struct_id'];photo=photos[sid];start=np.asarray(p['start']);t=np.asarray(p['tangent']);n=np.asarray(p['outward'])
        xy=np.asarray(matches[num]['candidates'][0]['xy']);uv=(xy-start)@np.array([t,-n]).T
        polygon=Polygon(uv).buffer(0);floor=FLOOR[num]
        geometry,checks=body_geometry(num,polygon,p['source_min_z'],floor)
        def sample(u,d):return ground.height(start+t*u-n*d)
        # Sample a local support field used only for visual walks/planting. The
        # exact samples are source-terrain values; interpolation is explicit.
        xmin=math.floor(polygon.bounds[0])-5;xmax=math.ceil(polygon.bounds[2])+6
        dmin=-46 if num=='116' else -14;dmax=math.ceil(polygon.bounds[3])+3;step=2
        xs=[float(x) for x in np.arange(xmin,xmax+step,step)];ds=[float(x) for x in np.arange(dmin,dmax+step,step)]
        heights=[round(sample(float(u),float(d)),5) for d in ds for u in xs]
        center=start+t*p['width']/2
        nearest=min(school_roads,key=lambda r:r.distance(Point(center)))
        point=nearest.interpolate(nearest.project(Point(center)));delta=np.array(point.coords[0])-center
        road_out=float(delta@n)
        # Remain short of the guided lane; this is a visual approach proposal,
        # not a claim to a surveyed sidewalk or curb cut.
        approach=min(38.0 if num=='116' else 8.0,max(.6,road_out-3.7))
        records.append({'number':num,'structId':sid,'tileId':'-13_-5','start':[round(x,7)for x in start],
          'tangent':[round(x,10)for x in t],'outward':[round(x,10)for x in n],'width':p['width'],
          'outline':np.round(uv,6).tolist(),'sourceMaximum':p['source_max_z'],'floor':floor,'paint':PAINT[num],
          'porchDepth':PORCH.get(num,0),'approachM':round(approach,3),'body':geometry,'roofMasses':checks['masses'],
          'support':{'x':xs,'depth':ds,'heights':heights,'method':'Bilinear interpolation of exact saved terrain plus road-grading samples; two-metre local grid.'},
          'source':{'photoId':photo['id'],'photoDate':photo['photoDate'],'photoUrl':photo['sourceUrl'],'photoSha256':photo['photoSha256'],
                    'matchConfidence':photo['matchConfidence'],'atlasId':atlas[sid]['id'],'outlineType':atlas[sid]['footprintSourceType'],'outlineDateRaw':atlas[sid]['footprintSourceDate']},
          'inference':'Photo-constrained massing, opening groups and frontage character. Exact dimensions, roof pitch, hidden elevations, planting species and approach alignments are inferred. Photographs are dated 2015–2025; no current-2026 exterior claim. Photo pixels are not textures.'})
        checks.update(number=num,structId=sid,sourceMaximum=p['source_max_z'])
        assert checks['maximumHeight']<=p['source_max_z']+.01,checks
        qa.append(checks)
    commercial=[]
    for sid in DOWNTOWN:
        a=architecture[sid];polygon=orient(Polygon(a['outline_xy']),sign=1);coords=list(polygon.exterior.coords)
        report=read(REPORTS/(sid+'.report.json'))
        main_road=min(main_roads,key=lambda r:r.distance(polygon.centroid))
        road=np.asarray(main_road.interpolate(main_road.project(polygon.centroid)).coords[0]);edges=[]
        for first,last in zip(coords,coords[1:]):
            first=np.asarray(first);last=np.asarray(last);length=np.linalg.norm(last-first)
            if length<4:continue
            t=(last-first)/length;n=np.array([t[1],-t[0]]);score=float(n@(road-(first+last)/2))
            edges.append((score,length,first,t,n))
        # Restrict the inference to the mapped main-road-facing long boundary;
        # do not assert a verified public entrance or current retail tenant.
        score,width,start,t,n=max(edges,key=lambda e:e[0]+min(e[1],40)*.1)
        floor=report['floor_z'];eave=report.get('eave_z') or max(r['eave_z']for r in report['masses'])
        commercial.append({'structId':sid,'tileId':'-12_-4','start':start.tolist(),'tangent':t.tolist(),'outward':n.tolist(),
            'width':float(width),'floor':float(floor),'eave':float(eave),'levels':max(1,min(3,round((eave-floor)/3.25))),
            'source':{'atlasId':atlas[sid]['id'],'address':atlas[sid]['parcelAddress'],'assessorStyle':atlas[sid]['assessorStyle']},
            'inference':'Authored Main Street commercial/office frontage on the retained generated body. Bay rhythm, larger glazing, entry, cornice and materials are plausible interpretations; no actual tenant, signage or photographed facade accuracy is claimed.'})
    result={'version':1,'sourceAtlasSha256':digest(ATLAS/'WEBSTER_MASSACHUSETTS_REFERENCE_ATLAS.md'),'sourceBuildingRegisterSha256':digest(ATLAS/'data/building-register.json'),'sourcePhotosSha256':digest(ATLAS/'data/exterior-photo-observations.json'),
            'coordinateContract':'Source local X east/Y north/Z up. Each record maps front tangent U, inward depth D and absolute source-local height to runtime X/upY/-northZ; the tile origin is subtracted once.',
            'school':records,'commercial':commercial,'excludedPhoto':{'id':'PHOTO-SCHOOL-73','reason':'Blank image and ambiguous building match; no facade assignment.'}}
    OUTPUT.parent.mkdir(parents=True,exist_ok=True);OUTPUT.write_text(json.dumps(result,separators=(',',':'))+'\n')
    WORK.mkdir(exist_ok=True);(WORK/'body-validation.json').write_text(json.dumps({'passed':True,'school':qa,'commercialCount':len(commercial),'dataSha256':digest(OUTPUT)},indent=2)+'\n')
    print('CRAFTED FRONTAGES',len(records),'School bodies,',len(commercial),'commercial fronts,',OUTPUT.stat().st_size,'bytes',flush=True)


if __name__=='__main__':main()
