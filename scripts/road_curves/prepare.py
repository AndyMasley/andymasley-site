"""One measured render-only Lake curve; preserve source graph and junctions."""
import gzip, hashlib, importlib.util, json, math, os
from pathlib import Path
import numpy as np
from shapely.geometry import LineString, Point, Polygon
from shapely.ops import unary_union

SITE=Path(__file__).resolve().parents[2]
WORK=Path(os.environ.get('ROAD_CURVE_WORK','/private/tmp/webster-finished-game/road-curves'))
SOURCE=Path(os.environ.get('WEBSTER_SOURCE','/Users/andy/Documents/New project/webster-blender'))
spec=importlib.util.spec_from_file_location('terrain_support',SITE/'scripts/prepare-terrain-finish.py')
terrain=importlib.util.module_from_spec(spec);spec.loader.exec_module(terrain)
terrain.BLEND=.75;terrain.MAX_FULL_DROP=.35;terrain.MAX_DROP=.5

def read(p):return json.loads(gzip.decompress(p.read_bytes()))if str(p).endswith('.gz')else json.loads(p.read_text())
def unit(v):return v/np.linalg.norm(v)
def cross(a,b):return a[0]*b[1]-a[1]*b[0]
def parts(p):return [p]if isinstance(p,Polygon)else [q for q in getattr(p,'geoms',[])if isinstance(q,Polygon)]
def triangles(p):
    from shapely.geometry.polygon import orient
    for q in parts(p):
        if q.area<1e-9:continue
        q=orient(q,1);rings=[np.array(q.exterior.coords[:-1])]+[np.array(r.coords[:-1])for r in q.interiors]
        vertices=np.concatenate(rings);reference=vertices[0]
        for ids in terrain.mf.triangulate([r-reference for r in rings],epsilon=1e-9):
            face=vertices[ids]
            if abs(cross(face[1]-face[0],face[2]-face[0]))>1e-9:yield face

graph=read(SITE/'data/derived/town/engine-network.json.gz')
edge=next(e for e in graph['edges']if e['id']==2783)
source=np.asarray(edge['points'],float);line=LineString(source[:,:2]);lengths=np.r_[0,np.cumsum(np.linalg.norm(np.diff(source[:,:2],axis=0),axis=1))]
start,end=12,104
original=source[start:end+1];old_line=LineString(original[:,:2]);width=edge['width_m'];half=width/2
simple=np.asarray(old_line.simplify(.002,preserve_topology=False).coords)
profile=[simple[0]];radii=[]
def append_line(p):
    a=profile[-1].copy();n=max(1,math.ceil(np.linalg.norm(p-a)/.5))
    profile.extend(a+(p-a)*(i/n)for i in range(1,n+1))
for i,b in enumerate(simple[1:-1],1):
    u=unit(b-simple[i-1]);v=unit(simple[i+1]-b);angle=math.atan2(cross(u,v),float(u@v))
    if abs(angle)<.01:append_line(b);continue
    trim=min(3.5,.45*np.linalg.norm(b-simple[i-1]),.45*np.linalg.norm(simple[i+1]-b));radius=trim/math.tan(abs(angle)/2)
    if radius<half+.25:raise ValueError('A Lake bend cannot support an unfolded full-width fillet')
    p=b-u*trim;q=b+v*trim;center=p+np.array([-u[1],u[0]])*math.copysign(radius,angle)
    append_line(p);theta=math.atan2(p[1]-center[1],p[0]-center[0]);n=max(2,math.ceil(abs(angle)*radius/.4))
    profile.extend(center+radius*np.array([math.cos(theta+angle*k/n),math.sin(theta+angle*k/n)])for k in range(1,n+1))
    profile[-1]=q;radii.append(radius)
append_line(simple[-1]);profile=np.asarray(profile)
stations=np.asarray([line.project(Point(p))for p in profile]);z=np.interp(stations,lengths,source[:,2]);xyz=np.column_stack((profile,z))
tangent=np.gradient(profile,axis=0);tangent/=np.linalg.norm(tangent,axis=1)[:,None];normals=np.column_stack((-tangent[:,1],tangent[:,0]))
old_t=np.gradient(source[:,:2],axis=0);old_t/=np.linalg.norm(old_t,axis=1)[:,None];old_n=np.column_stack((-old_t[:,1],old_t[:,0]))
normals[0]=old_n[start];normals[-1]=old_n[end]
deviation=max(old_line.distance(Point(p))for p in profile)
if deviation>.55:raise ValueError('Render curve exceeded its .55m centerline envelope')

def ribbon(points,normals,lo,hi,raise_z=0):
    output=[]
    for i in range(len(points)-1):
        a,b=points[i:i+2];na,nb=normals[i:i+2]
        lower=[lo,lo]if np.isscalar(lo)else lo[i:i+2];upper=[hi,hi]if np.isscalar(hi)else hi[i:i+2]
        quad=[np.r_[p[:2]+n*k,p[2]+raise_z]for p,n,k in[(a,na,lower[0]),(b,nb,lower[1]),(b,nb,upper[1]),(a,na,upper[0])]]
        for indices in[[0,1,2],[0,2,3]]:
            face=np.asarray([quad[j]for j in indices]);area=cross(face[1,:2]-face[0,:2],face[2,:2]-face[0,:2])
            if abs(area)<1e-8:continue
            if area<0:face=face[[0,2,1]]
            output.append(face)
    return output
old_asphalt=ribbon(original,old_n[start:end+1],-half,half)
old_shoulder=ribbon(original,old_n[start:end+1],-half-.35,half+.35,-.04)
old_shapes={'asphalt':unary_union([Polygon(t[:,:2])for t in old_asphalt]),'shoulder':unary_union([Polygon(t[:,:2])for t in old_shoulder]),'yellow':old_line.buffer(.19,cap_style=2,join_style=2)}
# Preserve the actual 5.2 x 2.4m guided body at interior bends. The original
# short-link sweep omitted these locations. Taper only the outward pavement
# edge, bounded by the already paved/shoulder source corridor, never the graph.
pose_path=WORK/'guided-poses.json.gz'
car_union=unary_union([Polygon(row['quad'])for row in read(pose_path)])
needed=np.zeros((len(xyz),2))
for i,(p,n)in enumerate(zip(profile,normals)):
    contact=LineString([p-6*n,p+6*n]).intersection(car_union)
    lines=[contact]if contact.geom_type=='LineString'else getattr(contact,'geoms',[])
    values=[float((np.asarray(v)-p)@n)for q in lines if q.geom_type=='LineString'for v in q.coords]
    if values:needed[i]=[max(0,-min(values)+.07-half),max(0,max(values)+.07-half)]
arc=np.r_[0,np.cumsum(np.linalg.norm(np.diff(profile,axis=0),axis=1))]
extra=np.zeros_like(needed)
for i in range(len(xyz)):
    distance=np.abs(arc-arc[i]);kernel=np.where(distance<2.5,(1+np.cos(np.pi*np.minimum(distance,2.5)/2.5))/2,0)
    extra[i]=np.max(needed*kernel[:,None],axis=0)
lo=-half-extra[:,0];hi=half+extra[:,1]
if max(extra[0].max(),extra[-1].max())>0:raise ValueError('Car taper would modify a retained endpoint')
if extra.max()>.5:raise ValueError('Car clearance requires an excessive local pavement taper')
# Cross-sections alone can miss a vehicle corner between stations. Feed the
# exact residual union back into neighboring cross-sections until every body
# is covered; this alters only the edge taper, not centerline or paint.
interior_cars=unary_union([Polygon(row['quad'])for row in read(pose_path)if 4<old_line.project(Polygon(row['quad']).centroid)<old_line.length-4])
clearance_iterations=0
for attempt in range(5):
    new_asphalt=ribbon(xyz,normals,lo,hi)
    residual=interior_cars.difference(unary_union([Polygon(t[:,:2])for t in new_asphalt]).buffer(.001))
    if residual.area<.00001:break
    clearance_iterations+=1
    for piece in parts(residual):
        for value in piece.exterior.coords:
            point=np.asarray(value);i=int(np.argmin(np.linalg.norm(profile-point,axis=1)));across=float((point-profile[i])@normals[i]);side=0 if across<0 else 1
            required=max(0,abs(across)+.04-half)
            distance=np.abs(arc-arc[i]);kernel=np.where(distance<2.5,(1+np.cos(np.pi*np.minimum(distance,2.5)/2.5))/2,0)
            extra[:,side]=np.maximum(extra[:,side],required*kernel)
    lo=-half-extra[:,0];hi=half+extra[:,1]
else:raise ValueError('Car edge taper did not converge to complete coverage')
if extra.max()>.5:raise ValueError('Exact car clearance requires excessive pavement widening')
new_shoulder=ribbon(xyz,normals,lo-.35,lo,-.04)+ribbon(xyz,normals,hi,hi+.35,-.04)
new_shape=unary_union([Polygon(t[:,:2])for t in new_asphalt]);new_outline=unary_union([Polygon(t[:,:2])for t in new_asphalt+new_shoulder])
if abs(sum(Polygon(t[:,:2]).area for t in new_asphalt)-new_shape.area)>.001:raise ValueError('Reconstructed pavement overlaps itself')
source_extension=new_shape.difference(old_shapes['shoulder']);maximum_extension=max((old_shapes['shoulder'].distance(Point(p))for part in parts(source_extension)for p in part.exterior.coords),default=0)
if source_extension.area>.075 or maximum_extension>.075:raise ValueError('Asphalt leaves the explicitly permitted 7.5cm source-shoulder allowance')
new_yellow=[]
for i in range(len(xyz)-1):
    road=ribbon(xyz[i:i+2],normals[i:i+2],lo[i:i+2],hi[i:i+2])
    for k in[-.11,.11]:
        paint=ribbon(xyz[i:i+2],normals[i:i+2],k-.05,k+.05)
        paint_shape=unary_union([Polygon(t[:,:2])for t in paint])
        for road_triangle in road:
            p=Polygon(road_triangle[:,:2]);co=np.linalg.solve(np.column_stack((road_triangle[:,:2]-road_triangle[0,:2],np.ones(3))),road_triangle[:,2])
            for face in triangles(p.intersection(paint_shape)):
                y=(face-road_triangle[0,:2])@co[:2]+co[2]+.018
                new_yellow.append(np.column_stack((face,y)))

architecture_path=SOURCE/'street-detail/building_architecture.json';architecture=read(architecture_path)
buildings=[]
for row in architecture:
    p=Polygon(row['outline_xy'])
    if p.is_valid and p.distance(new_outline)<10:buildings.append((row['struct_id'],p))
intersections=[{'id':id,'area':p.intersection(new_outline).area}for id,p in buildings if p.intersection(new_outline).area>.001]
if intersections:raise ValueError(f'Curve overlaps a mapped building: {intersections}')

report={'physicalId':1463,'edgeIds':[2782,2783],'tileId':'6_-14','sourceRangeM':[float(lengths[start]),float(lengths[end])],'sourceIndices':[start,end],'oldStations':len(original),'collinearSimplifiedStations':len(simple),'newStations':len(xyz),'centerlineMaxDeviationM':deviation,'minimumRadiusM':min(radii),'widthM':width,'maximumLocalClearanceTaperM':float(extra.max()),'clearanceRefinementIterations':clearance_iterations,'clearanceTaperStations':int(np.sum(np.max(extra,axis=1)>1e-8)),'sourceEndpoints':original[[0,-1]].tolist(),'newEndpoints':xyz[[0,-1]].tolist(),'nearestBuildingM':min((p.distance(new_outline)for _,p in buildings),default=None),'buildingIntersections':intersections,'oldAsphaltAreaM2':old_shapes['asphalt'].area,'newAsphaltAreaM2':new_shape.area,'newAsphaltOutsideOldShoulderM2':source_extension.area,'maximumAsphaltExtensionBeyondOldShoulderM':maximum_extension,'newShoulderOutsideOldShoulderM2':unary_union([Polygon(t[:,:2])for t in new_shoulder]).difference(old_shapes['shoulder']).area,'levels':[]}
(WORK/'plan.json').write_text(json.dumps({**report,'profile':xyz.tolist(),'old':original.tolist(),'newAsphalt':[t.tolist()for t in new_asphalt],'newShoulder':[t.tolist()for t in new_shoulder],'newYellow':[t.tolist()for t in new_yellow]},separators=(',',':'))+'\n')

def mesh_faces(mesh):
    p=np.asarray(mesh['positions']);ids=np.asarray(mesh['index']if mesh['index']is not None else range(len(p))).reshape((-1,3))
    return p,ids
def material_at(mesh,i):
    if not mesh['groups']:return mesh['materials'][0]
    return next(mesh['materials'][p['materialIndex']]for p in mesh['groups']if p['start']<=i*3<p['start']+p['count'])
def kind(name):
    return 'asphalt'if name.startswith('Drive road | asphalt')else 'shoulder'if name=='Drive road | weathered shoulder'else 'yellow'if name=='Drive road | warm yellow paint'else None

assets={};directory=SITE/'public/town-finish/v1/curves';directory.mkdir(parents=True,exist_ok=True)
for level in[0,1,2]:
    data=read(WORK/f'input-{level}.json.gz');targets=[];material_names={};uv_fit=None;counts={}
    for mesh in data['meshes']:
        if mesh['category']!='roads':continue
        positions,ids=mesh_faces(mesh);removed=[]
        for i,face_ids in enumerate(ids):
            name=material_at(mesh,i);k=kind(name)
            if not k:continue
            face=positions[face_ids][:,[0,2]]*np.array([1,-1]);p=Polygon(face)
            if p.area<1e-10 or not old_shapes[k].buffer(.002).covers(p):continue
            removed.append(i);counts[k]=counts.get(k,0)+1;material_names[k]=name
        if removed:
            targets.append({'name':mesh['name'],'parent':mesh['parent'],'geometryStamp':mesh['geometryStamp'],'remove':removed})
            if any(kind(material_at(mesh,i))=='asphalt'for i in removed)and mesh['uv'] is not None:
                indices=np.unique(ids[removed].ravel());p=positions[indices];features=np.column_stack((p[:,0]-data['origin'][0],-p[:,2]+data['origin'][2],np.ones(len(p))))
                uv=np.asarray(mesh['uv'])[indices];uv_fit=np.linalg.lstsq(features,uv,rcond=None)[0]
                if np.max(abs(features@uv_fit-uv))>.002:raise ValueError('Source asphalt UV cannot be preserved by world projection')
    if set(material_names)!={'asphalt','shoulder','yellow'}:raise ValueError('Incomplete source road selection')
    # Reuse the existing exact barycentric lowering pipeline against actual new
    # asphalt/shoulder planes, with a smaller .75m blend and .5m hard bound.
    roads=[]
    for t in new_asphalt+new_shoulder:
        three=t[:,[0,2,1]]*np.array([1,1,-1]);xy,co=terrain.height_plane(three);roads.append((Polygon(xy),co,xy[0]))
    protected=[Polygon([(x,-y)for x,y in p.exterior.coords]).buffer(.25)for _,p in buildings]
    for mesh in data['meshes']:
        if mesh['category']=='water':
            p,ids=mesh_faces(mesh)
            protected.extend(Polygon(p[ids[i]][:,[0,2]])for i in range(len(ids))if Polygon(p[ids[i]][:,[0,2]]).distance(Polygon([(x,-y)for x,y in new_outline.exterior.coords]))<2)
    support=terrain.Support(roads,protected);patches=[];maximum_drop=0
    region=Polygon([(x,-y)for x,y in new_outline.exterior.coords]).buffer(terrain.BLEND)
    for mesh in data['meshes']:
        if mesh['category']!='terrain':continue
        positions,ids=mesh_faces(mesh);changes=[]
        for i,face_ids in enumerate(ids):
            face=positions[face_ids]
            if not Polygon(face[:,[0,2]]).intersects(region):continue
            result=support.repair(face)
            if result:
                vertices,drop=result;maximum_drop=max(maximum_drop,drop);changes.append([i,vertices])
        if changes:patches.append({'mesh':mesh['name'],'geometryStamp':mesh['geometryStamp'],'positions':len(positions),'triangles':len(ids),'patches':changes})
    if maximum_drop>.35:raise ValueError(f'Curve would need an excessive terrain correction: {maximum_drop}')
    origin=data['origin'];geometries=[]
    for k,faces in [('asphalt',new_asphalt),('shoulder',new_shoulder),('yellow',new_yellow)]:
        vertices=np.asarray(faces).reshape((-1,3));uv=None
        if k=='asphalt'and uv_fit is not None:
            features=np.column_stack((vertices[:,0]-origin[0],vertices[:,1]+origin[2],np.ones(len(vertices))))
            # Explicit sums avoid spurious BLAS status flags on this host and
            # retain the source's planar UV field to subpixel precision.
            mapped=sum(features[:,i,None]*uv_fit[i]for i in range(3))
            if not np.isfinite(mapped).all():raise ValueError('Non-finite curve UV')
            uv=np.round(mapped,6).tolist()
        geometries.append({'kind':k,'material':material_names[k],'positions':np.round(vertices,6).tolist(),'uv':uv})
    terrain_packet={'version':1,'tileId':data['tileId'],'sourceManifestSha256':data['sourceManifestSha256'],'levels':[{'level':level,'sourceSha256':data['sourceSha256'],'meshes':patches}]}
    packet={'version':1,'tileId':data['tileId'],'level':level,'sourceSha256':data['sourceSha256'],'sourceManifestSha256':data['sourceManifestSha256'],'targets':targets,'geometries':geometries,'terrain':terrain_packet,'outline':list(new_outline.exterior.coords),'bounds':list(new_outline.bounds),'evidence':'Render-only circular fillets of the retained MassDOT corridor; source junctions, lane graph, nominal width and grades retained; bounded edge taper clears the actual guided body at interior bends. Nearby ground only lowered to clear the revised pavement.'}
    content=(json.dumps(packet,separators=(',',':'))+'\n').encode();sha=hashlib.sha256(content).hexdigest();name=f'6_-14-{level}.{sha[:16]}.json';(directory/name).write_bytes(content)
    assets[str(level)]={'url':'/town-finish/v1/curves/'+name,'bytes':len(content),'sha256':sha}
    report['levels'].append({'level':level,'removed':counts,'maximumTerrainDropM':maximum_drop,'terrainTrianglesReplaced':sum(len(m['patches'])for m in patches),'terrainTrianglesAdded':sum(len(p[1])//3-1 for m in patches for p in m['patches']),'bytes':len(content),'gzipBytes':len(gzip.compress(content))})
catalog={'version':1,'sourceManifestSha256':data['sourceManifestSha256'],'physicalId':1463,'edgeIds':[2782,2783],'maximumCenterlineDeviationM':round(deviation,6),'nominalWidthM':width,'maximumLocalClearanceTaperM':round(float(extra.max()),6),'asphaltOutsideOriginalShoulderM2':round(source_extension.area,6),'maximumAsphaltExtensionBeyondOriginalShoulderM':round(maximum_extension,6),'sourceGuidedPosesSha256':hashlib.sha256(pose_path.read_bytes()).hexdigest(),'sourceBuildingOutlinesSha256':hashlib.sha256(architecture_path.read_bytes()).hexdigest(),'tiles':{'6_-14':{'levels':assets}}}
(SITE/'data/derived/town/road-curve-index.json').write_text(json.dumps(catalog,separators=(',',':'))+'\n')
keep={Path(a['url']).name for a in assets.values()}
for p in directory.glob('*.json'):
    if p.name not in keep:p.unlink()
(WORK/'preparation-report.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
