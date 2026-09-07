"""Replace bounded residential flat fallbacks with complete inferred roof solids.

The legacy fallback treated important non-orthogonal footprint walls as a reason
to flatten the entire house. This transform preserves that exact plan, including
non-orthogonal walls, and intersects it with one conservative pitched volume.
Complex plans stay unchanged. No historic silhouette or paint is declared current.
"""
import base64
import collections
import hashlib
import json
import math
import os
from pathlib import Path
import sys

import numpy as np
from shapely.geometry import Polygon
from shapely.geometry.polygon import orient
from shapely import affinity

sys.path.insert(0, os.environ.get('WEBSTER_MANIFOLD_PATH', '/private/tmp/webster-realism-v2-building/python-deps'))
import manifold3d as mf

SITE=Path(__file__).resolve().parents[1]
SOURCE=Path(os.environ.get('WEBSTER_SOURCE','/Users/andy/Documents/New project/webster-blender'))
REPORTS=Path(os.environ.get('WEBSTER_BUILDING_REPORTS','/private/tmp/webster-realism-v2-building/townwide-assets'))
STYLES={'RANCH','RAISED RANCH','CAPE','COLONIAL','CONVENTIONAL','COTT/BUNGALOW','SPLIT LEVEL','NORTH VILLAGE'}


def solid(vertices,faces):
    vertices=np.asarray(vertices,dtype='f8');center=vertices.mean(axis=0);triangles=[]
    for face in faces:
        p=vertices[face]
        if np.dot(np.cross(p[1]-p[0],p[2]-p[0]),p.mean(axis=0)-center)<0:face=list(reversed(face))
        triangles.extend([[face[0],face[i],face[i+1]]for i in range(1,len(face)-1)])
    result=mf.Manifold(mf.Mesh64(vertices,np.asarray(triangles,dtype='u8')))
    assert result.status()==mf.Error.NoError
    return result


def gable(bounds,base,eave,peak):
    x0,d0,x1,d1=bounds;middle=(d0+d1)/2
    return solid([[x0,d0,base],[x1,d0,base],[x1,d1,base],[x0,d1,base],
                  [x0,d0,eave],[x1,d0,eave],[x1,d1,eave],[x0,d1,eave],
                  [x0,middle,peak],[x1,middle,peak]],
                 [[0,3,2,1],[0,1,5,4],[3,7,6,2],[0,4,8,7,3],[1,2,6,9,5],[4,5,9,8],[8,9,6,7]])


def hip(bounds,base,eave,peak):
    x0,d0,x1,d1=bounds;middle=(d0+d1)/2
    inset=min((d1-d0)*.5,(x1-x0)*.45)
    return solid([[x0,d0,base],[x1,d0,base],[x1,d1,base],[x0,d1,base],
                  [x0,d0,eave],[x1,d0,eave],[x1,d1,eave],[x0,d1,eave],
                  [x0+inset,middle,peak],[x1-inset,middle,peak]],
                 [[0,3,2,1],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7],
                  [4,5,9,8],[5,6,9],[6,7,8,9],[7,4,8]])


def mansard(bounds,base,eave,peak):
    x0,d0,x1,d1=bounds;inset=min((x1-x0)*.18,(d1-d0)*.18,1.45)
    # A steep four-sided lower roof and a quiet, shallow upper hip. The two
    # pitches are physically joined, not painted triangular roof fragments.
    knee=peak-.25
    vertices=[[x0,d0,base],[x1,d0,base],[x1,d1,base],[x0,d1,base],
              [x0,d0,eave],[x1,d0,eave],[x1,d1,eave],[x0,d1,eave],
              [x0+inset,d0+inset,knee],[x1-inset,d0+inset,knee],
              [x1-inset,d1-inset,knee],[x0+inset,d1-inset,knee]]
    lower=solid(vertices,[[0,3,2,1],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7],
                          [4,5,9,8],[5,6,10,9],[6,7,11,10],[7,4,8,11],[8,9,10,11]])
    upper=hip([x0+inset,d0+inset,x1-inset,d1-inset],base,knee,peak)
    return lower+upper


def gambrel(bounds,base,eave,peak):
    x0,d0,x1,d1=bounds;width=d1-d0;middle=(d0+d1)/2;knee=eave+(peak-eave)*.77
    section=[[d0,base],[d1,base],[d1,eave],[d1-width*.20,knee],[middle,peak],[d0+width*.20,knee],[d0,eave]]
    vertices=[[x,d,z]for x in [x0,x1]for d,z in section];size=len(section)
    faces=[list(range(size)),list(range(size,size*2))]
    faces.extend([[i,(i+1)%size,(i+1)%size+size,i+size]for i in range(size)])
    return solid(vertices,faces)


def body_for(a,report):
    polygon=Polygon(a['outline_xy'])
    if not polygon.is_valid:raise ValueError('invalid source plan')
    if polygon.interiors:raise ValueError('courtyard')
    rectangle=polygon.minimum_rotated_rectangle
    if not 42<polygon.area<600 or polygon.area/rectangle.area<.76:raise ValueError('complex or large plan')
    pts=np.asarray(rectangle.exterior.coords);vectors=np.diff(pts,axis=0);lengths=np.linalg.norm(vectors,axis=1)
    i=int(np.argmax(lengths));t=vectors[i]/lengths[i];n=np.array([-t[1],t[0]])
    center=np.asarray(polygon.centroid.coords[0]);rotation=np.array([t,n]);xy=(np.asarray(polygon.exterior.coords)-center)@rotation.T
    local=orient(Polygon(xy),sign=1);bounds=local.bounds;length=bounds[2]-bounds[0];width=bounds[3]-bounds[1]
    if not 4<width<19 or length/width>4:raise ValueError('unsupported proportions')
    style=a['assessor_style'];stories=float(report.get('source_stories')or 1)
    floor=report['floor_z'];base=report['base_z'];source=report['source_height_evidence']
    floors=max(1,min(3,math.floor(stories+.02)))
    if style in {'RANCH','COTT/BUNGALOW','SPLIT LEVEL','RAISED RANCH'}:floors=1
    eave=floor+floors*2.68
    pitch=.42 if 'RANCH'in style else .78 if style=='CAPE' else .65
    peak=min(source['roof_max'],source['roof_p95']+.12,eave+width*pitch/2)
    if peak-eave<.8:raise ValueError('insufficient measured roof allowance')
    section=mf.CrossSection([list(local.exterior.coords)],mf.FillRule.EvenOdd)
    prism=section.extrude(peak-base+1).translate([0,0,base])
    body=(gable(bounds,base,eave,peak)^prism).set_tolerance(.0005)
    if body.status()!=mf.Error.NoError or len(body.decompose())!=1 or body.volume()<=0:raise ValueError('invalid volume')
    return packet_for(polygon,report,body,center,rotation,base,floor,eave,peak,floors,
        'Assessor style plus dated mapped plan and own LiDAR roof envelope. Single gable, ridge direction and pitch are inferred; not a photographed roof.',
        {'kind':'bounded_flat_fallback','roofShape':'gable'})


def packet_for(polygon,report,body,center,rotation,base,floor,eave,peak,floors,basis,metadata):
    source=report['source_height_evidence'];rectangle=polygon.minimum_rotated_rectangle
    mesh=body.to_mesh64();v=np.asarray(mesh.vert_properties)[:,:3];f=np.asarray(mesh.tri_verts)
    # Coincident clipping corners can have distinct topological indices before
    # float export. Weld at sub-millimetre tolerance and reject a broken result.
    v,remap=np.unique(np.round(v,5),axis=0,return_inverse=True);f=remap[f]
    f=f[(f[:,0]!=f[:,1])&(f[:,1]!=f[:,2])&(f[:,2]!=f[:,0])]
    by_face=collections.defaultdict(list)
    for face in f:by_face[tuple(sorted(face))].append(face)
    f=np.asarray([faces[0]for faces in by_face.values()if len(faces)==1],dtype='u8')
    repaired=mf.Manifold(mf.Mesh64(v,np.asarray(f,dtype='u8')))
    if repaired.status()!=mf.Error.NoError or len(repaired.decompose())!=1:raise ValueError('float-export topology conflict')
    body=repaired
    tile=report.get('runtime_tile_id',f'{math.floor(center[0]/250)}_{math.floor(center[1]/250)}')
    failures=runtime_winding_failures(body,center,rotation,tile)
    if failures:
        # Boolean clipping can leave micron-wide slivers. Their winding can
        # flip only when the local packet is translated into tile Float32s.
        # Retriangulate the closed manifold, never discard individual faces.
        if max(failures)>.0001:raise ValueError('non-microscopic runtime winding failure')
        before_volume=body.volume();body=body.simplify(.0005)
        if body.status()!=mf.Error.NoError or len(body.decompose())!=1 or runtime_winding_failures(body,center,rotation,tile):raise ValueError('runtime sliver simplification failed')
        if abs(body.volume()-before_volume)>.002:raise ValueError('runtime sliver repair changed material volume')
        metadata={**metadata,'runtimeSliverRepair':{'toleranceM':.0005,'originalFailureCount':len(failures),'maximumOriginalDoubledAreaM2':max(failures),'volumeChangeM3':body.volume()-before_volume}}
    mesh=body.to_mesh64();v=np.asarray(mesh.vert_properties)[:,:3];f=np.asarray(mesh.tri_verts)
    edges=collections.Counter(tuple(sorted(e))for face in f for e in zip(face,np.roll(face,-1)))
    assert all(count==2 for count in edges.values())
    groups=collections.defaultdict(list)
    for face in f:
        p=v[face];normal=np.cross(p[1]-p[0],p[2]-p[0]);length_normal=np.linalg.norm(normal)
        if length_normal<1e-10:raise ValueError('zero-area export triangle')
        normal/=length_normal
        role='roof' if normal[2]>.15 else 'wall'
        world=p.copy();world[:,:2]=p[:,:2]@rotation
        runtime=world[:,[0,2,1]].copy();runtime[:,2]*=-1
        normxy=normal[:2]@rotation;norm=[normxy[0],normal[2],-normxy[1]]
        groups[role].append(np.concatenate([runtime,np.tile(norm,(3,1))],axis=1))
    def encode(a):return base64.b64encode(np.asarray(a,dtype='<f4').tobytes()).decode()
    chunks=[]
    for role,arrays in groups.items():
        a=np.concatenate(arrays);chunks.append({'role':role,'position':encode(a[:,:3]),'normal':encode(a[:,3:]),'vertices':len(a)})
    assert np.max(v[:,2])<=source['roof_max']+.001
    return {'id':a_id(report),'tileId':f'{math.floor(center[0]/250)}_{math.floor(center[1]/250)}','origin':[float(center[0]),0,float(-center[1])],'outline':np.round(np.asarray(polygon.exterior.coords),6).tolist(),
            'base':base,'floor':floor,'eave':eave,'peak':peak,'stories':floors,'body':chunks,
            'sourceMaximum':source['roof_max'],'sourcePlanSha256':report.get('source_footprint_sha256')or hashlib.sha256(json.dumps(list(polygon.exterior.coords)).encode()).hexdigest(),
            'basis':basis,**metadata,
            'qa':{'closed':True,'solidComponents':1,'triangles':len(f),'volumeM3':body.volume(),'planAreaM2':polygon.area,'rectangleFill':polygon.area/rectangle.area}}


def runtime_winding_failures(body,center,rotation,tile):
    """Reproduce packet Float32 then Batch's owner-tile Float32 translation."""
    mesh=body.to_mesh64();v=np.asarray(mesh.vert_properties)[:,:3];faces=np.asarray(mesh.tri_verts)
    world=v.copy();world[:,:2]=v[:,:2]@rotation
    runtime=world[:,[0,2,1]].copy();runtime[:,2]*=-1
    tile_x,tile_y=map(int,tile.split('_'))
    offset=np.array([center[0]-tile_x*250,0,-center[1]+tile_y*250])
    translated=(runtime.astype('f4').astype('f8')+offset).astype('f4').astype('f8')
    p=runtime[faces];q=translated[faces]
    expected=np.cross(p[:,1]-p[:,0],p[:,2]-p[:,0]);actual=np.cross(q[:,1]-q[:,0],q[:,2]-q[:,0])
    alignment=np.sum(expected*actual,axis=1)
    return np.linalg.norm(actual[alignment<=0],axis=1).tolist()


def frame_outsets(polygon,frames):
    """Exact linear extrema along source wall segments, not point sampling.

    Only nearby, outward-facing segments participate; another wing across an
    indentation is not mistaken for this facade's wall. Correct the frame only
    when the existing +.08 m glass plane can intersect the source wall.
    """
    points=list(orient(polygon,sign=1).exterior.coords);result=[];corrections=[]
    for index,frame in enumerate(frames):
        maximum=0
        for a,b in zip(points,points[1:]):
            dx=b[0]-a[0];dy=b[1]-a[1];length=math.hypot(dx,dy)
            if not length or (dy*frame['outward'][0]-dx*frame['outward'][1])/length<.7:continue
            u=[(p[0]-frame['start'][0])*frame['tangent'][0]+(p[1]-frame['start'][1])*frame['tangent'][1]for p in [a,b]]
            v=[(p[0]-frame['start'][0])*frame['outward'][0]+(p[1]-frame['start'][1])*frame['outward'][1]for p in [a,b]]
            if abs(u[1]-u[0])<1e-7:continue
            for x in [max(0,min(u)),min(frame['width'],max(u))]:
                if not 0<=x<=frame['width']or x<min(u)or x>max(u):continue
                height=v[0]+(v[1]-v[0])*(x-u[0])/(u[1]-u[0])
                if abs(height)<.5:maximum=max(maximum,height)
        offset=maximum+.03 if maximum>.08 else 0
        result.append(offset)
        if offset:corrections.append({'frameIndex':index,'maximumSourceWallDeparture':maximum,'outset':offset,'clearance':.03})
    return result,corrections


def roof_height_at(body,xy):
    """Highest upward surface at a local XY point, including compound wings."""
    mesh=body.to_mesh64();vertices=np.asarray(mesh.vert_properties)[:,:3]
    result=-math.inf
    for indices in np.asarray(mesh.tri_verts):
        a,b,c=vertices[indices];cross=np.cross(b-a,c-a)
        if cross[2]<1e-9:continue
        det=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1])
        if abs(det)<1e-9:continue
        u=((b[1]-c[1])*(xy[0]-c[0])+(c[0]-b[0])*(xy[1]-c[1]))/det
        v=((c[1]-a[1])*(xy[0]-c[0])+(a[0]-c[0])*(xy[1]-c[1]))/det
        if min(u,v,1-u-v)>=-1e-7:result=max(result,u*a[2]+v*b[2]+(1-u-v)*c[2])
    return result


def documented_dormers(body,local,center,rotation,peak,evidence,profile):
    """One documented house, with explicitly inferred count and dimensions.

    The body is unioned through the real roof surface: its base lies inside the
    mansard, and its tail disappears below the existing upper roof. This avoids
    a floating panel or a dormer that leaves an open hole in the roof solid.
    """
    from shapely.geometry import Point
    if evidence['structId']!='168731_867801':return body,[]
    sources=[fact for fact in evidence['evidence']if 'dormer' in fact['statement'].lower()]
    if not sources or evidence['roofShape']!='mansard':raise ValueError('documented dormer source missing')
    fronts=[(i,f)for i,f in enumerate(profile['frames'])if f.get('front')]
    if len(fronts)!=1:raise ValueError('documented dormer frontage ambiguous')
    frame_index,frame=fronts[0];width=frame['width']
    count=max(1,min(3,round(width/2.6)))
    tangent=np.asarray(frame['tangent'])@rotation.T
    outward=np.asarray(frame['outward'])@rotation.T
    start=(np.asarray(frame['start'])-center)@rotation.T
    dormer_width=min(1.18,width/count*.46);inset=.20;depth=2.2;metadata=[]
    original=body;plans=[]
    for index in range(count):
        u=(index+.5)*width/count;front=start+tangent*u-outward*inset
        front_points=[front+tangent*offset for offset in [-dormer_width/2,0,dormer_width/2]]
        rear=front-outward*depth
        footprint=[p for p in front_points]+[rear+tangent*offset for offset in [-dormer_width/2,dormer_width/2]]
        if any(not local.contains(Point(p))for p in footprint):raise ValueError('documented dormer exceeds mapped plan')
        roof_front=[roof_height_at(original,p)for p in front_points]
        roof_rear=roof_height_at(original,rear)
        if not all(math.isfinite(z)for z in roof_front+[roof_rear]):raise ValueError('documented dormer roof intersection missing')
        plans.append((u,front,roof_front,roof_rear))
    # A shared window/eave line gives the documented front a deliberate rhythm
    # even where intersecting source wings create different underlying slopes.
    window_bottom=max(z for _,_,heights,_ in plans for z in heights)+.14
    for u,front,roof_front,roof_rear in plans:
        bottom=min(roof_front)-.20
        dormer_eave=window_bottom+1.20;dormer_peak=dormer_eave+.34
        if dormer_peak>peak-.25 or roof_rear<dormer_peak+.05:raise ValueError(f'documented dormer cannot merge below measured ridge: front={roof_front}, rear={roof_rear}, peak={dormer_peak}, cap={peak}')
        part=gable([0,-dormer_width/2,depth,dormer_width/2],bottom,dormer_eave,dormer_peak)
        part=part.transform([[-outward[0],tangent[0],0,front[0]],[-outward[1],tangent[1],0,front[1]],[0,0,1,0]])
        intersection=(part^original).volume()
        if intersection<.25 or part.volume()-intersection<.15:raise ValueError('documented dormer does not intersect roof volume')
        body=body+part
        world_start=(front-tangent*dormer_width/2)@rotation+center
        metadata.append({'frameIndex':frame_index,'frame':{'start':world_start.tolist(),'tangent':frame['tangent'],'outward':frame['outward'],'width':dormer_width},
            'bottom':bottom,'eave':dormer_eave,'peak':dormer_peak,'depth':depth,'frontageU':u,'wallInset':inset,
            'window':{'u':dormer_width/2,'bottom':window_bottom,'width':.78,'height':1.05},
            'roofIntersection':{'frontHeights':roof_front,'rearHeight':roof_rear,'overlapVolumeM3':intersection},
            'sourceYear':evidence['sourceYear'],'evidenceIds':sorted({s['source']['evidenceId']for s in sources}),
            'sources':[s['source']for s in sources],'countBasis':f'{count} dormers inferred from {width:.3f}m mapped frontage at approximately 2.6m bay rhythm; the dated form documents dormers but not their count.',
            'currentExteriorObserved':False})
    if len(body.decompose())!=1:raise ValueError('documented dormer disconnected from house')
    return body,metadata


def historical_body_for(a,report,evidence,profile):
    from shapely.geometry import box
    from shapely.ops import unary_union
    polygon=Polygon(a['outline_xy']);shape=evidence['roofShape']
    if not polygon.is_valid or polygon.interiors:raise ValueError('historical invalid or courtyard plan')
    if not 42<polygon.area<650:raise ValueError('historical very small or large compound plan')
    if shape=='saltbox':raise ValueError('saltbox rear-eave position is not established')
    if shape=='flat':raise ValueError('historical flat roof retains current body pending local survey')
    if shape=='gable'and report.get('mode')=='principal_residential':raise ValueError('existing coherent gable already matches dated form')
    if shape not in {'gable','hip','mansard','gambrel'}:raise ValueError('unsupported historical roof')
    source=report.get('source_height_evidence',{});maximum=source.get('roof_max')
    if not maximum:raise ValueError('historical measured height missing')
    base=report['base_z'];floor=report['floor_z'];peak=min(maximum,source.get('roof_p95',maximum)+.12)
    stories=float(evidence.get('stories')or report.get('source_stories')or 1)
    floors=max(1,min(3,math.floor(stories+.02)))
    if shape=='mansard':floors=max(1,min(2,math.floor(stories-.2)))
    if shape=='gambrel':floors=1
    eave=min(floor+floors*2.68,peak-.9)
    if eave<floor+2.35 or peak-eave<.8:raise ValueError('historical insufficient measured roof allowance')
    masses=report.get('masses',[])
    if masses:
        if len(masses)>9:raise ValueError('historical too many compound wings')
        center=np.asarray(report['source_world_origin'][:2]);declared=np.asarray(report['local_rotation'])
        # Source generator stores the local/world rotation. Select its matrix
        # convention by checking the declared wing rectangles against the exact
        # mapped polygon; never estimate orientation from a nearby building.
        cover=unary_union([box(*m['rect'])for m in masses]);candidates=[]
        for rotation in [declared,declared.T]:
            local=Polygon((np.asarray(polygon.exterior.coords)-center)@rotation.T)
            candidates.append((local.intersection(cover).area/local.area,rotation,local))
        match,rotation,local=max(candidates,key=lambda x:x[0])
        if match<.975:raise ValueError('historical wing/source frame mismatch')
    else:
        rectangle=polygon.minimum_rotated_rectangle
        if polygon.area/rectangle.area<.76:raise ValueError('historical complex plan without coherent wings')
        pts=np.asarray(rectangle.exterior.coords);vectors=np.diff(pts,axis=0);lengths=np.linalg.norm(vectors,axis=1)
        t=vectors[int(np.argmax(lengths))]/max(lengths);n=np.array([-t[1],t[0]])
        center=np.asarray(polygon.centroid.coords[0]);rotation=np.array([t,n]);local=Polygon((np.asarray(polygon.exterior.coords)-center)@rotation.T)
        masses=[{'rect':list(local.bounds),'axis':0}]
    # Keep all of the source generator's coherent wings. Small wings receive a
    # restrained gable when a mansard/gambrel describes the principal block.
    principal=max(masses,key=lambda m:box(*m['rect']).area)
    largest=box(*principal['rect']).area;solids=[];wing_heights=[]
    reference_eave=principal.get('eave_z',eave);reference_peak=principal.get('ridge_z',peak)
    for wing_index,mass in enumerate(masses):
        # The source wing fit deliberately approximates irregular roofprints by
        # a few centimetres. Grow the construction volumes slightly, then clip
        # back to the exact mapped plan; this closes those sloping-wall corners.
        b=mass['rect'];bounds=[b[0]-.25,b[1]-.25,b[2]+.25,b[3]+.25];axis=mass.get('axis',0)
        if min(bounds[2]-bounds[0],bounds[3]-bounds[1])<2:continue
        local_bounds=[bounds[1],bounds[0],bounds[3],bounds[2]] if axis else bounds
        use=shape
        if shape in {'mansard','gambrel'}and box(*bounds).area<largest*.35:use='gable'
        old_eave=mass.get('eave_z',eave);old_peak=mass.get('ridge_z',peak)
        wing_eave=max(floor+2.15,eave+min(0,old_eave-reference_eave))
        if mass is principal:wing_peak=peak
        else:wing_peak=min(peak,old_peak,peak+min(0,old_peak-reference_peak))
        wing_eave=min(wing_eave,wing_peak-.55)
        if wing_eave<floor+.8:raise ValueError('historical lower wing has insufficient measured clearance')
        builder={'gable':gable,'hip':hip,'mansard':mansard,'gambrel':gambrel}[use]
        body=builder(local_bounds,base,wing_eave,wing_peak)
        if evidence.get('roofVariant')=='jerkinhead' and use in {'gambrel','gable'}:
            body=body^hip(local_bounds,base,wing_peak-.65,wing_peak)
        if axis:body=body.transform([[0,1,0,0],[1,0,0,0],[0,0,1,0]])
        solids.append(body)
        wing_heights.append({'index':wing_index,'bounds':bounds,'originalEave':old_eave,'originalPeak':old_peak,
            'eave':wing_eave,'peak':wing_peak,'principal':mass is principal,'roofShape':use,'sourceFloors':mass.get('floors')})
    if not solids:raise ValueError('historical no usable principal wing')
    body=solids[0]
    for part in solids[1:]:body=body+part
    section=mf.CrossSection([list(orient(local,sign=1).exterior.coords)],mf.FillRule.EvenOdd)
    prism=section.extrude(peak-base+1).translate([0,0,base])
    # Only a foundation-level closure may bridge tiny fitting gaps. A tall
    # blanket prism would silently raise low porch/garage wings to main height.
    wall_base=section.extrude(floor-base).translate([0,0,base])
    body=((body+wall_base)^prism).set_tolerance(.0005)
    if body.status()!=mf.Error.NoError or len(body.decompose())!=1 or body.volume()<=0:raise ValueError('historical invalid compound volume')
    if abs(body.slice(base+.1).area()-polygon.area)>.04:raise ValueError('historical source plan not fully covered')
    body,dormers=documented_dormers(body,local,center,rotation,peak,evidence,profile)
    frame_eaves=[]
    for edge in profile['frames']:
        xy=np.asarray(edge['start'])+np.asarray(edge['tangent'])*edge['width']*.5
        u,v=(xy-center)@rotation.T
        touching=[w for w in wing_heights if w['bounds'][0]-.03<=u<=w['bounds'][2]+.03 and w['bounds'][1]-.03<=v<=w['bounds'][3]+.03]
        frame_eaves.append(max((w['eave']for w in touching),default=floor+.1))
    outsets,corrections=frame_outsets(polygon,profile['frames'])
    return packet_for(polygon,report,body,center,rotation,base,floor,eave,peak,floors,
        'Explicit dated historical roof description joined by MHC point containment, current address and construction-year checks. Preserves mapped plan and coherent source wings; pitch, ridge and present survival are inferred, not a current exterior survey.',
        {'kind':'dated_historical_roof_inference','roofShape':shape,'roofVariant':evidence.get('roofVariant'),
         'mhcIds':evidence['mhcIds'],'sourceYear':evidence['sourceYear'],'evidenceIds':sorted({f['source']['evidenceId']for f in evidence['evidence']if f['field']=='roofShape'}),
         'sourceFramePreserved':bool(report.get('masses')),'sourceWingCount':len(masses),'currentExteriorObserved':False,
         'wingHeights':wing_heights,'frameEaves':frame_eaves,'frameOutsets':outsets,'frameOutsetCorrections':corrections,'dormers':dormers})


def a_id(report):return report['struct_id']


def main():
    records=json.loads((SOURCE/'street-detail/building_architecture.json').read_text())
    landmark=json.loads((SITE/'data/derived/town/landmark-evidence.json').read_text())
    exclude={r['id']for r in landmark['rows']}
    residential=json.loads((SITE/'data/derived/town/residential-evidence-index.json').read_text())
    eligible=set();ownership={};profiles={}
    for tile,asset in residential['tiles'].items():
        for row in json.loads((SITE/'public'/asset['url'].lstrip('/')).read_text())['buildings']:
            eligible.add(row['id']);ownership[row['id']]=tile;profiles[row['id']]=row
    rows=[];skipped=collections.Counter();candidates=0
    for a in records:
        sid=a['struct_id'];path=REPORTS/(sid+'.report.json')
        if not a.get('primary_structure_inferred')or a.get('assessor_style')not in STYLES or not path.exists()or sid in exclude:continue
        report=json.loads(path.read_text())
        if report.get('mode')!='nonresidential_or_complex':continue
        candidates+=1
        if sid not in eligible:skipped['nonresidential use or no eligible evidence profile']+=1;continue
        report['runtime_tile_id']=ownership[sid]
        try:rows.append(body_for(a,report))
        except ValueError as error:skipped[str(error)]+=1
    historical_path=SITE/'data/derived/town/historic-architecture-evidence.json'
    historical=json.loads(historical_path.read_text());architecture={r['struct_id']:r for r in records}
    historical_skipped=collections.Counter();historical_candidates=0;by_id={row['id']:row for row in rows}
    for evidence in historical['rows']:
        if not evidence['allowRoofFormInference']:continue
        sid=evidence['structId'];historical_candidates+=1
        if sid in exclude or sid not in eligible:historical_skipped['protected landmark/photo or no eligible residential profile']+=1;continue
        report=json.loads((REPORTS/(sid+'.report.json')).read_text())
        report['runtime_tile_id']=ownership[sid]
        try:by_id[sid]=historical_body_for(architecture[sid],report,evidence,profiles[sid])
        except ValueError as error:historical_skipped[str(error)]+=1
    rows=list(by_id.values())
    for row in rows:row['tileId']=ownership[row['id']]
    output=SITE/'public/town-evidence/v1/roofs';output.mkdir(parents=True,exist_ok=True)
    tiles=collections.defaultdict(list)
    for row in rows:tiles[row['tileId']].append(row)
    index={}
    for tile,items in sorted(tiles.items()):
        content=(json.dumps(items,separators=(',',':'))+'\n').encode();digest=hashlib.sha256(content).hexdigest()
        name=f'{tile}.{digest[:12]}.json';(output/name).write_bytes(content)
        index[tile]={'url':f'/town-evidence/v1/roofs/{name}','count':len(items),'bytes':len(content),'sha256':digest}
    metadata={'version':2,'count':len(rows),'candidates':candidates,'skipped':dict(skipped),'tiles':index,
              'historicalCandidates':historical_candidates,'historicalSkipped':dict(historical_skipped),'historicalCount':sum(r.get('kind')=='dated_historical_roof_inference'for r in rows),
              'historicalEvidenceSha256':hashlib.sha256(historical_path.read_bytes()).hexdigest(),
              'sourceRegisterSha256':hashlib.sha256((SOURCE/'research/data/building-register.json').read_bytes()).hexdigest(),
              'policy':'Bounded principal residential fallbacks plus explicitly dated roof descriptions joined by containment, address and year gates. Named/photo assets remain protected. Coherent source wings and full unchanged source polygons remain closed solids; no historical form is claimed to be a current photograph.'}
    (SITE/'data/derived/town/evidence-roofs-index.json').write_text(json.dumps(metadata,indent=2)+'\n')
    current={Path(asset['url']).name for asset in index.values()}
    for old in output.glob('*.json'):
        if old.name not in current:old.unlink()
    print(json.dumps({'count':len(rows),'candidates':candidates,'skipped':dict(skipped),'historicalCount':metadata['historicalCount'],'historicalSkipped':dict(historical_skipped),'tiles':len(tiles),'bytes':sum(r['bytes']for r in index.values())}))


if __name__=='__main__':main()
