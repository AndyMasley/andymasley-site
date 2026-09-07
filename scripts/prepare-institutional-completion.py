"""Fit researched institutional forms to immutable Webster roofprints.
Only new derived data is written. Appearance dimensions are interpretations,
not surveyed elevations; current photographs and design renderings stay distinct.
"""
import hashlib,json,math
from pathlib import Path
from shapely.geometry import Polygon,box,LineString
from shapely.ops import split,triangulate
R=Path(__file__).resolve().parents[1]
read=lambda p:json.loads(p.read_bytes());sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
source=read(R/'data/derived/town/landmark-evidence.json');release=read(R/'data/derived/town/release.json');assets=R/'public/town-assets'/release['directory'];manifest=read(assets/'manifest.json')
inputs=read(R/'data/source/town/institutional-source-input.json')['records']
sourceRows={r['id']:r for r in source['rows']}
recipes={'168497_866749':'police','168461_866703':'post','169324_865813':'bartlett','169384_866010':'middle','169602_867006':'park','168695_866564':'saints','168786_867366':'anne','168716_867059':'rock','169092_866519':'holy','168389_865834':'emanuel','168232_865530':'legion','168088_866284':'lodge','168115_866387':'siegel','169081_867095':'zion','168842_867203':'rectory','168654_867234':'parish'}
metadata={
'police':('CIV-5','Webster Police Station',['Architect documents a steel-framed brick station; town dates occupancy to 2014.','Saved 2025 aerial shows a compact hip/low roof group, front parking and a lower rear projection.'],['https://www.draws.com/portfolio/webster-police-station/','https://webster-ma.gov/197/Police-Station'],'No ground-level exterior image could be retrieved in this pass. Brick palette, paired two-level windows, entrance spacing and shallow canopy are explicit civic-building interpretations.'),
'post':('CIV-6','Webster Post Office',['Current address and one-story 1964 assessor use; historical account distinguishes the modern replacement from the former 1912 post office.','Viewed 2025 aerial confirms a flat main roof, lower west service strip and south Main Street frontage.'],['https://oldewebster.wordpress.com/2021/04/05/webster-post-office-1921/'],'Large single-level lobby glazing and service-side rhythm are inferred. No exact present signage, mailbox inventory or door count is claimed. Replaces the previous two-story authored storefront.'),
'bartlett':('CIV-10','Bartlett High School',['MSBA documents retained brick veneer and replacement windows.','Viewed Flansburgh DESIGN rendering shows dark red-brown brick, broad charcoal-framed glazing, contrasting soldier-course bands and a pale entry canopy; it is not a photograph of completed construction.'],['https://www.massschoolbuildings.org/programs/story_of_a_building/Webster_Bartlett_School','https://www.flansburgh.com/portfolio/bartlett-high-school/','https://www.webster-schools.org/our-district/bhs-building-committee/bhs-project-update'],'Three connected height zones and entry placement are fitted interpretations within the dated footprint. September 2026 construction status remains phased; future courtyard cuts and completed-renovation claims are excluded.'),
'middle':('CIV-11','Webster Middle School',['Viewed district exterior photograph: warm orange-brown brick, blue-teal frames/fascia, dark hip roofs; two-story classroom wing and lower entrance wing.','Entry wing has a small raised glazed hip-roof volume and a shallow curved entry hood.'],['https://wms.webster-schools.org/our-school','https://resources.finalsite.net/images/f_auto,q_auto/v1682008749/websterschoolsorg/xywpfioyb0mcmcqwkugh/wms.png'],'District photograph date is undetermined (host publication identifier 2023 is not a capture date). Wing dimensions and window grouping are fitted; the original 73 m source maximum is an unmeasured mass ceiling, not a LiDAR measurement.'),
'park':('CIV-12','Park Avenue Elementary School',['Viewed district image named PAE8_31_15 shows red brick, three visible classroom levels, paired tall windows, gray/silver gabled roofs and a lower gabled entry.','Contractor/project documentation specifies three stories and a high-reflectance roof; the roof is not uniformly flat.'],['https://pae.webster-schools.org/our-school','https://resources.finalsite.net/images/f_auto,q_auto,t_image_size_3/v1687531552/websterschoolsorg/ujghxpvtvvoo6myddlnl/PAE8_31_15.png','https://pmc-ma.com/portfolio/webster_park_avenue_elementary/'],'Image filename implies 2015-08-31; no newer exposure verified. Three mass zones, roof ridge dimensions and exact grouping are fitted. The 2014 PM&C image is a design rendering and is not used as proof of completed color.'),
'saints':('CIV-13','All Saints Academy / former St Louis School',['Historical source documents the replacement brick school opening in September 1930.','Viewed 2025 aerial confirms a long flat-roofed school, wider north head and lower-looking southern extension.'],['https://oldewebster.wordpress.com/2021/04/05/original-st-louis-school-1920/','https://schools.worcesterdiocese.org/people/all-saints-academy'],'Ground-level color and exact bay counts remain inferred. The diocese image is only a school logo, not exterior evidence. A restrained two-level school rhythm replaces generic residential windows.'),
'anne':('CIV-15','Former St Anne School',['MHC Form B recorded 2000-06-30: three stories on high basement, flat roof, shallow four-bay end pavilions and seven-bay central block with central stair entry.','Materials documented as brick, granite and concrete. Parish source in May 2023 announced apartment conversion after school closure.'],['https://mhc-macris.net/Documents/WEB/PDFs/WEB_269.pdf','https://catholicfreepress.org/news/st-anne-school-building-sold-parish-erects-tribute'],'The 2000 architectural form is dated evidence. Current conversion completion and current window units remain unverified; no new balconies or school sign is invented.'),
'rock':('CIV-18','Rock Castle School apartments',['NRHP description: two-story light random granite ashlar with red-brick quoins, arched upper windows, hip roof and shallow gabled east/west pavilions.','Viewed 2025 aerial identifies the hip-roofed historic southern body and flat northern extension at 41 Prospect St. Current GIS polygon and parcel match both; MHC point lies within this footprint.'],['https://npgallery.nps.gov/GetAsset/7445b5e1-ad7a-429c-b01d-7d6af2b9ed84','https://www.mass.gov/info-details/massgis-data-2025-aerial-imagery'],'The MHC point, current apartment parcel, source outline projections and roof pattern jointly resolve registration to 168716_867059. Exact entry widths/colors and north extension height/material are fitted; no claim of a new ground-level photo survey.')}
metadata.update({
'rectory':('CIV-32-RECTORY','Sacred Heart Rectory',['MHC form dated 1978-09-20 records brick and granite, a three-story Second Empire composition, mansard roof/dormers and bracketed eaves.','The veranda spans the front and west side, with a projecting upper portico; source evidence independently joins the MHC point inside the current principal footprint.','Viewed 2025 aerial registers the main front on the NORTH edge toward East Main Street and its centered approach walk. The small southern parking-area structure is separate and is retained, not mistaken for the veranda.'],['https://mhc-macris.net/Documents/WEB/PDFs/WEB_176.pdf'],'Two full wall levels plus the mansard room level interpret the documented three stories. Current paint, exact dormer count, roof slope and portico dimensions are inferred. Porch projection is restrained within 0.8 m of the source roofprint and does not assert a measured full-depth veranda.'),
'parish':('CIV-35-PARISH','James Howe Slater Parish House',['MHC form dated 1978-05-12 describes clapboard, brick foundation, Gothic/Victorian projections, dormers and varied windows.','Historic evidence independently joins the MHC point to the current principal source footprint; a cloister connection to the church is documented.'],['https://mhc-macris.net/Documents/WEB/PDFs/WEB_39.pdf'],'Existing source projections remain. Dormer count, hip/gable slope and current paint are inferred inside the measured source ceiling; no invented trace of the unregistered cloister is added between source footprints. The 1898 historic date and assessor 1930 date remain distinct.'),
'siegel':('CIV-40','Former Siegel Hall / Congregation Sons of Israel',['MHC 1978 and NR 1995 descriptions record a 2.5-story frame hall with side gable/deep returns, shingled walls and fieldstone foundation.','Six-bay front has entries in bays one and four with bracketed Italianate hoods; five upper arched windows contain Star of David tracery.'],['https://mhc-macris.net/Documents/WEB/PDFs/WEB_115.pdf'],'Dated surviving synagogue ornament is architectural evidence, not a claim of a current congregation. Current siding color, hood dimensions and roof shape are fitted. No unreadable Hebrew inscription is fabricated; the historic plaque is a plain pale marker.'),
'zion':('CIV-37','Former Zion Lutheran Church',['MHC form dated 1978-05-22 documents a wooden clapboard church with bracketed eaves, arched windows and battlements.','Source roofprint has a rectangular nave and rounded east-end projections.'],['https://mhc-macris.net/Documents/WEB/PDFs/WEB_183.pdf'],'Clapboard, arched openings and bracket rhythm are represented. The form does not locate or dimension the battlements; an invented tower is excluded. Source-constrained gabled nave and current neutral paint are inference. Present Life Church identity is directory-only, not a new sign.') ,
'holy':('CIV-36','Holy Trinity Polish National Catholic Church',['MHC form dated 1978-07-24 describes clapboard, lancet windows and an arched front entry; re-sided and painted in 1978.','Current retained roofprint and LiDAR source ceiling support the nave; the small front projection is registered from its actual outline.'],['https://mhc-macris.net/Documents/WEB/PDFs/WEB_171.pdf'],'Current paint, exact bay count, and roof slope are inferred within the source envelope. A tower whose present form is not described is not fabricated; the source maximum is a ceiling, not a surveyed ridge.'),
'emanuel':('CIV-38','Former Emanuel Lutheran Church',['MHC form dated 1978-08-22 records clapboard and pointed arched windows with tracery, and a possibly altered porch.','MHC construction date 1926 conflicts with assessor 1900; the architectural form takes precedence for the historical date.'],['https://mhc-macris.net/Documents/WEB/PDFs/WEB_173.pdf'],'Current congregation identity and present paint are unverified. Narrow chapel gable, restrained entry and lancet spacing are fitted interpretations, with no invented steeple.'),
'legion':('CIV-50','Former Turnverein Hall / American Legion Post 184',['MHC dated 1978-09-05 and later NR description records a high hipped roof, bracketed eaves, lower rear/side hips, shingled walls and high brick foundations.','Houghton front is five bays with a central entry; long School Street face is nine bays, with altered/blocked openings; upper windows have cornice lintels.'],['https://mhc-macris.net/Documents/WEB/PDFs/WEB_170.pdf'],'Former asbestos-shingle cladding is represented only by a muted neutral siding appearance, not a material-hazard survey. Current paint, altered porch dimensions, which side openings remain blocked, and subsidiary roof elevations are inferred.'),
'lodge':('CIV-41b / CIV-53a','Former Sons of Italy Association Lodge',['MHC form dated 2000-06-15 records brick, an elaborate four-step corbie front-gable parapet and three segmental front openings: windows around the central door.','One street-level story becomes two at the rear with falling grade. Four side segmental windows were blocked or removed by 2000.'],['https://mhc-macris.net/Documents/WEB/PDFs/WEB_280.pdf'],'Present occupant and reopening of any blocked window are not established. Blocked side bays remain masonry recesses; dated front openings, parapet and brick envelope are shown with fitted dimensions. No current business or church sign is asserted.')})

def frames(poly):
 points=list(poly.exterior.coords)[:-1];area=poly.exterior.is_ccw;out=[]
 for a,b in zip(points,points[1:]+points[:1]):
  w=math.dist(a,b)
  if w<1e-5:continue
  t=[(b[i]-a[i])/w for i in range(2)];n=[t[1],-t[0]] if area else [-t[1],t[0]]
  out.append({'start':list(a),'tangent':t,'outward':n,'width':w})
 return out
def design_frame(poly,a,b):
 t=[(b[i]-a[i])/math.dist(a,b) for i in range(2)];n=[-t[1],t[0]];mid=[(a[i]+b[i])/2+n[i]*.2 for i in range(2)]
 from shapely.geometry import Point
 if poly.contains(Point(mid)):n=[-x for x in n]
 return {'start':list(a),'tangent':t,'outward':n,'width':math.dist(a,b)}
def crop(poly,axis,lo,hi):return poly.intersection(box(lo,-1e5,hi,1e5) if axis==0 else box(-1e5,lo,1e5,hi))
def polygons(g):return [g] if g.geom_type=='Polygon' else [x for x in g.geoms if x.geom_type=='Polygon' and x.area>.02]
def clipped(points,aa,bb,cc):
 out=[]
 for a,b in zip(points,points[1:]+points[:1]):
  da=aa*a[0]+bb*a[1]+cc;db=aa*b[0]+bb*b[1]+cc
  if da>=-1e-9:out.append(a)
  if (da<0)!=(db<0):
   t=da/(da-db);out.append([a[i]+t*(b[i]-a[i]) for i in range(2)])
 return [p for i,p in enumerate(out) if math.dist(p,out[(i+1)%len(out)])>1e-7]
def ears(poly):
 points=[list(p) for p in list(poly.exterior.coords)[:-1]]
 if not poly.exterior.is_ccw:points.reverse()
 out=[]
 while len(points)>3:
  found=False
  for i,b in enumerate(points):
   a=points[i-1];c=points[(i+1)%len(points)];cross=(b[0]-a[0])*(c[1]-b[1])-(b[1]-a[1])*(c[0]-b[0])
   if abs(cross)<1e-7:points.pop(i);found=True;break
   if cross<0:continue
   tri=Polygon([a,b,c])
   if not poly.buffer(1e-7).covers(tri):continue
   if any(tri.buffer(-1e-7).contains(__import__('shapely').geometry.Point(q)) for j,q in enumerate(points) if j not in [(i-1)%len(points),i,(i+1)%len(points)]):continue
   out.append([a,b,c]);points.pop(i);found=True;break
  if not found:raise ValueError('Untriangulated source polygon')
 if len(points)==3:out.append(points)
 return out

def part(poly,eave,peak,form,angle,floor):
 u=[math.cos(angle),math.sin(angle)];v=[-u[1],u[0]];p=[list(x) for x in list(poly.exterior.coords)[:-1]];uu=[sum(a*b for a,b in zip(q,u)) for q in p];vv=[sum(a*b for a,b in zip(q,v)) for q in p];bounds=[min(uu),min(vv),max(uu),max(vv)];planes=[[0,0,eave]]
 if form=='mansard':
  # A roofprint-offset skirt makes every external edge a real eave, including
  # re-entrant corners; fitting four planes to a bounding box made those
  # recessed edges into spurious tall brick walls.
  inner=poly.buffer(-1.55,join_style=2);assert not inner.is_empty and inner.geom_type=='Polygon'
  ring=poly.difference(inner);roofs=[]
  for tri in triangulate(ring):
   shape=tri.intersection(ring)
   if shape.is_empty:continue
   for q in polygons(shape):
    if q.area<1e-7:continue
    for triangle in ears(q):roofs.append([[x,eave+(peak-eave)*min(1,poly.boundary.distance(__import__('shapely').geometry.Point(x,y))/1.55),y]for x,y in triangle])
  roofs += [[[x,peak,y]for x,y in triangle]for triangle in ears(inner)]
  fs=frames(poly)
  for ff in fs:ff['roofEdge']=[[0,eave],[ff['width'],eave]]
  return {'outline':p,'frames':fs,'eave':eave,'peak':peak,'floor':floor,'roofForm':form,'roofPolygons':roofs}
 if form!='flat':
  slope=(peak-eave)/(1.55 if form=='mansard' else max(1,(bounds[3]-bounds[1])/2));planes=[[v[0]*slope,v[1]*slope,eave-bounds[1]*slope],[-v[0]*slope,-v[1]*slope,eave+bounds[3]*slope]]
  if form in ['hip','mansard']:planes += [[u[0]*slope,u[1]*slope,eave-bounds[0]*slope],[-u[0]*slope,-u[1]*slope,eave+bounds[2]*slope]]
 if form=='mansard':planes.append([0,0,peak])
 roofs=[]
 for original in ears(poly):
  for i,a in enumerate(planes):
   ps=original
   for j,b in enumerate(planes):
    if i!=j:ps=clipped(ps,b[0]-a[0],b[1]-a[1],b[2]-a[2]) if ps else []
   if len(ps)>2 and Polygon(ps).area>1e-6:roofs.append([[x,a[0]*x+a[1]*y+a[2],y] for x,y in ps])
 fs=frames(poly)
 for f in fs:
  a=f['start'];t=f['tangent'];end=[a[i]+t[i]*f['width'] for i in range(2)];cuts=[0,f['width']]
  for i,c in enumerate(planes):
   for d in planes[i+1:]:
    den=(c[0]-d[0])*t[0]+(c[1]-d[1])*t[1]
    if abs(den)>1e-9:
     at=-((c[0]-d[0])*a[0]+(c[1]-d[1])*a[1]+c[2]-d[2])/den
     if 1e-7<at<f['width']-1e-7:cuts.append(at)
  f['roofEdge']=[[q,min(c[0]*(a[0]+t[0]*q)+c[1]*(a[1]+t[1]*q)+c[2] for c in planes)] for q in sorted(set(cuts))]
 return {'outline':p,'frames':fs,'eave':eave,'peak':peak,'floor':floor,'roofForm':form,'roofPolygons':roofs}
rows=[]
for sid,recipe in recipes.items():
 if sid in sourceRows:r={k:sourceRows[sid][k] for k in ['id','structId','name','tileId','outline','base','floor','eave','peak','sourceEnvelope','footprintSource']}
 else:
  report=inputs[sid];env=report['source_height_evidence'];outline=report['outline_xy'];outline=outline[:-1] if outline[0]==outline[-1] else outline
  tile=next(t for t in manifest['tiles'] if sid in t['sourceIds']);r={'id':sid,'structId':sid,'name':metadata[recipe][1],'tileId':tile['id'],'outline':outline,'base':report['base_z'],'floor':report['floor_z'],'eave':report['eave_z'],'peak':env['roof_max'],'sourceEnvelope':env,'footprintSource':{'source':'MassGIS retained 2011 roofprint','url':'https://www.mass.gov/info-details/massgis-data-building-structures-2-d'}}
 poly=Polygon(r['outline']);assert poly.is_valid
 tile=next(t for t in manifest['tiles'] if t['id']==r['tileId']);r.update(recipe=recipe,origin=tile['origin'],lods=[{'level':l['level'],'sha256':l['sha256']}for l in tile['lods']],sourcePeak=r['peak'],frames=frames(poly))
 pts=r['outline'];f=r['floor'];e=r['eave'];spec=[]
 if recipe=='police':r['frame']=design_frame(poly,pts[2],pts[1]);spec=[(poly,e,min(r['peak']-.15,e+1.05),'hip',math.radians(53),f)]
 elif recipe=='post':r['frame']=design_frame(poly,pts[1],pts[0]);spec=[(poly,e,e,'flat',0,f)]
 elif recipe=='bartlett':
  r['frame']=design_frame(poly,pts[13],pts[12]);spec=[(crop(poly,1,-1e5,-1800),f+4.35,f+4.35,'flat',0,f),(crop(poly,1,-1800,-1768),f+7.70,f+7.70,'flat',0,f),(crop(poly,1,-1768,1e5),f+7.35,f+7.35,'flat',0,f)]
 elif recipe=='middle':
  r['frame']=design_frame(poly,pts[34],pts[33]);spec=[(crop(poly,0,-1e5,-1916),f+7.65,f+10.35,'hip',math.radians(63),f),(crop(poly,0,-1916,1e5),f+3.95,f+6.15,'hip',math.radians(-28),f)]
 elif recipe=='park':
  r['frame']=design_frame(poly,pts[11],pts[12])
  # Connected roofprint wings, cut between actual re-entrant source vertices.
  # The prior global-X cuts produced disconnected, spuriously tall roof slivers.
  northwest=Polygon(pts[17:28]);central=Polygon(pts[8:18]+[pts[27],pts[28]]);southeast=Polygon(pts[:9]+pts[28:])
  spec=[(northwest,f+6.8,f+8.75,'hip',math.radians(105),f),(central,f+8.95,f+8.95,'flat',0,f),(southeast,f+6.85,f+6.85,'flat',0,f)]
  # Broad front-gabled pavilions are observed, but their dimensions are fitted.
  r['pavilions']=[]
  for ia,ib,base in [(13,14,f+8.95),(15,16,f+8.95),(7,6,f+6.85)]:
   pf=design_frame(poly,pts[ia],pts[ib]);w=min(14.2,pf['width']-.7);u0=(pf['width']-w)/2
   pf['start']=[pf['start'][i]+pf['tangent'][i]*u0 for i in range(2)];pf['width']=w
   # The front outline supports this short inward roof volume. Roofs are
   # combined below; no second coplanar roof or duplicate exterior wall.
   depth=7.0;foot=Polygon([pf['start'],[pf['start'][i]+pf['tangent'][i]*w for i in range(2)],[pf['start'][i]+pf['tangent'][i]*w-pf['outward'][i]*depth for i in range(2)],[pf['start'][i]-pf['outward'][i]*depth for i in range(2)]])
   r['pavilions'].append({'frame':pf,'eave':base,'peak':base+2.6,'depth':depth,'outline':[list(x)for x in list(poly.intersection(foot).exterior.coords)[:-1]]})
 elif recipe=='saints':r['frame']=design_frame(poly,pts[18],pts[17]);spec=[(crop(poly,1,-1e5,-1037),e-3.5,e-3.5,'flat',0,f),(crop(poly,1,-1037,1e5),e,e,'flat',0,f)]
 elif recipe=='anne':r['frame']=design_frame(poly,pts[7],pts[6]);spec=[(poly,e,e,'flat',0,f)]
 elif recipe=='rock':r['frame']=design_frame(poly,pts[3],pts[2]);spec=[(crop(poly,1,-1e5,-524.6),e,r['peak']-.12,'hip',math.radians(79),f),(crop(poly,1,-524.6,1e5),e-.6,e-.6,'flat',0,f)]
 if recipe=='holy':
  r['frame']=design_frame(poly,pts[2],pts[3]);e=f+6.45;r['eave']=e;spec=[(poly,e,min(r['peak']-.15,e+5.0),'gable',math.radians(-117),f)]
 elif recipe=='emanuel':
  r['frame']=design_frame(poly,pts[3],pts[0]);e=f+4.9;r['eave']=e;spec=[(poly,e,r['peak']-.12,'gable',math.radians(-90),f)]
 elif recipe=='legion':
  r['frame']=design_frame(poly,pts[9],pts[0]);e=f+7.8;r['eave']=e;spec=[(crop(poly,1,-2056.57,1e5),e,r['peak']-.12,'hip',math.radians(-87),f),(crop(poly,1,-1e5,-2056.57),e-1.8,e+.6,'hip',math.radians(-87),f)]
 elif recipe=='lodge':
  r['frame']=design_frame(poly,pts[0],pts[1]);e=f+4.2;r['eave']=e;spec=[(poly,e,r['peak']-.35,'gable',math.radians(-189),f)]
 if recipe=='siegel':
  r['frame']=design_frame(poly,pts[0],pts[1]);e=f+6.6;r['eave']=e;spec=[(poly,e,r['peak']-.15,'gable',math.radians(-98),f)]
 elif recipe=='zion':
  r['frame']=design_frame(poly,pts[41],pts[42]);e=f+6.3;r['eave']=e;spec=[(poly,e,r['peak']-.15,'gable',math.radians(11),f)]
 if recipe=='rectory':
  r['frame']=design_frame(poly,pts[5],pts[6]);e=f+6.8;r['eave']=e;spec=[(poly,e,min(r['peak']-.2,e+4.0),'mansard',math.radians(109),f)]
 elif recipe=='parish':
  r['frame']=design_frame(poly,pts[2],pts[1]);e=f+5.55;r['eave']=e;spec=[(poly,e,r['peak']-.15,'hip',math.radians(86),f)]
 r['parts']=[part(q,*values) for shape,*values in spec for q in polygons(shape) if q.area>.05]
 for p in r['parts']:
  for s in p['frames']:s['exterior']=poly.boundary.distance(LineString([s['start'],[s['start'][i]+s['tangent'][i]*s['width'] for i in range(2)]]).interpolate(.5,normalized=True))<.02
 assert abs(sum(Polygon(p['outline']).area for p in r['parts'])-poly.area)<.001
 if recipe=='park':
  # Each gable cap is raised above its local main roof and clips to the plan.
  # Union uses cap as replacement in its footprint (not intersecting planes).
  for cap in r['pavilions']:
   pf=cap['frame'];shape=Polygon(cap['outline']);angle=math.atan2(-pf['outward'][1],-pf['outward'][0]);cp=part(shape,cap['eave'],cap['peak'],'gable',angle,f)
   cap['roofPolygons']=cp['roofPolygons'];cap['roofEdge']=cp['frames']
   for pp in r['parts']:
    kept=[]
    for roof in pp['roofPolygons']:
     tri=Polygon([[v[0],v[2]]for v in roof]);difference=tri.difference(shape)
     # Original cap crossing heights are interpolated from the planar polygon.
     a,b,c=roof[:3];den=(b[0]-a[0])*(c[2]-a[2])-(c[0]-a[0])*(b[2]-a[2])
     aa=((b[1]-a[1])*(c[2]-a[2])-(c[1]-a[1])*(b[2]-a[2]))/den;bb=((b[0]-a[0])*(c[1]-a[1])-(c[0]-a[0])*(b[1]-a[1]))/den
     if not difference.is_empty:
      for piece in polygons(difference):
       for triangle in ears(piece):kept.append([[x,a[1]+aa*(x-a[0])+bb*(y-a[2]),y]for x,y in triangle])
    pp['roofPolygons']=kept

 civ,name,obs,urls,caution=metadata[recipe];r['name']=name;r['evidenceId']=civ;r['observed']=obs;r['inferred']=[caution,'All dimensions are source-constrained authored geometry; exact window counts are only asserted for the dated St Anne form. Existing roads, terrain, parking and public movement remain unchanged.'];r['sources']=[{'url':u,'referencedOn':'2026-09-07','accessBasis':'Existing archived research text; actual viewed image downloads are recorded separately.'}for u in urls];r['sourceSection']={'path':'research/sections/landmark-dossiers-civic-religious.md','researchDate':'2026-09-06'};rows.append(r)
out={'version':1,'sourceManifestSha256':sha(assets/'manifest.json'),'sourceInstitutionalInputSha256':sha(R/'data/source/town/institutional-source-input.json'),'sourceLandmarkEvidenceSha256':sha(R/'data/derived/town/landmark-evidence.json'),'rules':['Exact tile SHA and origin gate, before crafted fronts and evidence recoloring. Only matched V2 inferred body triangles are replaced.','Original roofprint plan union and source base preserved; exterior detail outsets are bounded. Roof and wing subdivision dimensions are explicit interpretations.','Source photographs are research references, never texture payloads; historical, current, and design views are distinguished.'],'rows':rows}
(R/'data/derived/town/institutional-completion.json').write_text(json.dumps(out,separators=(',',':'))+'\n');print('Registered',len(rows),'institutions;',sum(len(r['parts']) for r in rows),'roof/body zones')
