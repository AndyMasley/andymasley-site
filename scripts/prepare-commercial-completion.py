"""Register source-qualified commercial frontages without changing the scenery archive.
Run with WEBSTER_RESEARCH pointing at the supplied corpus. Facade bay positions are
inferred; the catalog retains documented traits, dated joins and source caveats.
"""
import hashlib, json, math, os, re
from pathlib import Path
from shapely.geometry import Polygon, LineString, shape
from shapely.ops import transform
from pyproj import Transformer
ROOT=Path(__file__).resolve().parents[1]
RESEARCH=Path(os.environ.get('WEBSTER_RESEARCH','/Users/andy/Documents/New project/webster-blender/research'))
QA=Path(os.environ.get('WEBSTER_COMMERCIAL_QA','/private/tmp/webster-final-details/commercial'));QA.mkdir(parents=True,exist_ok=True)
read=lambda p:json.loads(Path(p).read_bytes())
sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
ledger=read(RESEARCH/'implementation/landmark-evidence.json');catalog=read(ROOT/'data/derived/town/landmark-evidence.json')
release=read(ROOT/'data/derived/town/release.json');base=ROOT/'public/town-assets'/release['directory'];manifest=read(base/'manifest.json')
parcels=read(RESEARCH/'data/parcels-current.geojson')['features'];proj=Transformer.from_crs(4326,26986,always_xy=True);ox,oy=171282.3328920724,867589.2761750807
local=lambda x,y,z=None:(proj.transform(x,y)[0]-ox,proj.transform(x,y)[1]-oy)
parcel_shapes={p['properties']['SITE_ADDR']:(transform(local,shape(p['geometry'])),p['properties'])for p in parcels}
apps={r['id']:r for r in ledger['reviewedApplications']};records={r['evidenceId']:r for r in ledger['records']}
TARGETS=['IND-02','IND-03','IND-07','IND-08','IND-10','IND-13']+[f'MS-N-{n:03d}'for n in[9,10,11,16,17]]+[f'MS-S-{n:03d}'for n in[10,14,15,16,17,18,19,20]]+[f'CC-EMAIN-{n:03d}'for n in[1,3,4,5,7,9,10,20]]
# These resolutions require the exact MHC point/address parcel plus dated
# assessor year/story corroboration, not a nearest-building centroid.
extra={'MS-N-017':('168378_866662','293 MAIN ST'),'MS-S-015':('168341_866602','242 MAIN ST')}
styles={'IND-02':('market',1,None),'IND-03':('warehouse',1,None),'IND-07':('mill',2,None),'IND-08':('weave',1,'#935843'),'IND-10':('warehouse',1,None),'IND-13':('factory',2,None),'MS-N-009':('classical',2,'#915543'),'MS-N-010':('classical',3,'#b6a178'),'MS-N-016':('classical',3,'#995c48'),'MS-N-017':('plain',3,None),'MS-S-010':('apartments',2,None),'MS-S-015':('classical',2,'#975e4c'),'MS-S-016':('moderne',3,'#c8c6b8'),'MS-S-017':('classical',3,'#929486'),'MS-S-018':('classical',3,'#969488'),'MS-S-020':('colonial',1,None),'CC-EMAIN-001':('cafe',2,None),'CC-EMAIN-003':('bank',1,None),'CC-EMAIN-004':('drive-through',1,None),'CC-EMAIN-005':('parts',1,None),'CC-EMAIN-007':('garage',1,None),'CC-EMAIN-009':('restaurant',1,None),'CC-EMAIN-010':('drive-through',1,None),'CC-EMAIN-020':('parts',1,None)}
# Shared Main Street parcels are allocated by their actual intersection with
# the selected street wall, including the 242 Main house/storefront section.
allocations={'MS-N-009':'175 MAIN ST','MS-N-010':'181 MAIN ST','MS-N-016':'267-283 MAIN ST','MS-N-017':'293 MAIN ST','MS-S-015':'242 MAIN ST','MS-S-016':'248 MAIN ST','MS-S-017':'260 MAIN ST'}
rows=[];coverage=[]
def frange(frame,parcel):
 a=frame['start'];t=frame['tangent'];n=frame['outward'];w=frame['width']
 # Parcel edges and roofprints differ by small eave overhangs. Project the
 # intersection with a narrow wall strip; never allocate the whole footprint.
 poly=Polygon([[a[0]+t[0]*u+n[0]*v,a[1]+t[1]*u+n[1]*v]for u,v in[(0,-1.5),(w,-1.5),(w,.45),(0,.45)]])
 cut=poly.intersection(parcel)
 if cut.is_empty:return None
 coords=[]
 for p in ([cut]if cut.geom_type=='Polygon'else getattr(cut,'geoms',[])):
  if p.geom_type=='Polygon':coords+=list(p.exterior.coords)
 if not coords:return None
 vals=[(p[0]-a[0])*t[0]+(p[1]-a[1])*t[1]for p in coords];return[max(0,min(vals)),min(w,max(vals))]
for s in catalog['rows']:
 applications=[a for a in s['applicationIds']if a in styles]+[a for a,(sid,_)in extra.items()if sid==s['id']]
 if not applications:continue
 tile=next(t for t in manifest['tiles']if t['id']==s['tileId'])
 r={k:s[k]for k in['id','structId','name','tileId','outline','base','floor','eave','peak','footprintSource']};r['origin']=tile['origin'];r['lods']=[{k:l[k]for k in['level','sha256']}for l in tile['lods']];r['frames']=[];r['bodyParts']=[]
 faces=s['frames']
 # Main Street does not always equal the source nearest road (Brown Court is
 # closer to 248 Main). Select the street-facing long edge by actual side.
 direction=-1 if any(a.startswith('MS-N')for a in applications)else 1
 if any(a.startswith('MS-')for a in applications):
  candidates=[f for f in faces if f['outward'][1]*direction>.65]
  front=max(candidates,key=lambda f:f['width'])if candidates else next(f for f in faces if f['front'])
 else:front=next((f for f in faces if f['front']),max(faces,key=lambda f:f['width']))
 for aid in applications:
  app=apps[aid];recipe,stories,paint=styles[aid];f=dict(front);u0,u1=0,f['width'];join=None
  if aid in allocations:
   parcel,attrs=parcel_shapes[allocations[aid]];interval=frange(f,parcel)
   if not interval or interval[1]-interval[0]<2:
    coverage.append({'id':aid,'status':'unresolved-street-allocation','reason':'Exact address parcel did not reach a safe segment of the selected street wall.'});continue
   u0,u1=interval
   if aid=='MS-N-009':u0,u1=0,8.3
   if aid=='MS-N-010':u0,u1=8.3,front['width']
   join={'parcelAddress':attrs['SITE_ADDR'],'parcelObjectId':attrs['OBJECTID'],'assessorFY':attrs['FY'],'stories':attrs['STORIES'],'yearBuilt':attrs['YEAR_BUILT'],'facadeIntervalM':interval,'method':'Intersection of named FY2025 parcel with retained street wall; 1.5m inward tolerance for parcel/roofprint street-edge disagreement.'}
  f['start']=[front['start'][i]+front['tangent'][i]*u0 for i in[0,1]];f['width']=u1-u0
  top=s['eave'];floor=s['floor']
  if aid=='MS-N-009':top=43.55
  if aid=='MS-N-010':top=48.85
  # House front remains two stories within the current retained mass, no
  # assumed Italianate hip roof is created from an unstated roof form.
  if aid=='MS-S-015':top=min(top,floor+7.0)
  f.update({'id':aid,'recipe':recipe,'stories':stories,'paint':paint,'floor':floor,'top':top,'sourceJoin':join,'documented':app['renderHints'],'evidenceIds':app['sourceEvidenceIds'],'source':records[aid]['source'],'inference':'Door positions, window counts, trim sizes and unobserved colors are restrained game interpretations within the retained wall. No current business signs or logos.'})
  r['frames'].append(f)
  # A garage's documented long repair shed needs side bays; weave mills need
  # their long elevations, not just the closest short end. Limit nearby blocks.
  if recipe in ['weave','factory','garage','mill','warehouse']:
   for face in sorted(faces,key=lambda f:-f['width']):
    if face is front or face['width']<12:continue
    if recipe=='garage'and face['width']<30:continue
    if recipe=='weave'and face['width']<24:continue
    if len([x for x in r['frames']if x['id']==aid])>=(7 if recipe=='weave'else 3):break
    side={**f,**face,'id':aid,'recipe':recipe,'stories':stories,'paint':paint,'floor':floor,'top':top,'side':True};r['frames'].append(side)
  coverage.append({'id':aid,'name':app['name'],'structId':s['id'],'status':'implemented','sourceJoin':join,'traits':app['renderHints'],'limits':[app['caution'],f['inference']]})
 # Adjacent parcel tolerances can overlap by centimetres. Use one shared
 # boundary so coplanar skins never occupy the same strip of wall.
 shared=[f for f in r['frames']if f['id']in allocations]
 position=lambda f:sum((f['start'][i]-front['start'][i])*front['tangent'][i]for i in[0,1])
 shared.sort(key=position)
 for left,right in zip(shared,shared[1:]):
  end=position(left)+left['width'];start=position(right)
  if abs(end-start)<.10:
   boundary=(end+start)/2;rightEnd=start+right['width'];left['width']=boundary-position(left)
   right['start']=[front['start'][i]+front['tangent'][i]*boundary for i in[0,1]];right['width']=rightEnd-boundary
 if s['id']=='168247_866622':
  # Cached ASPRS class6 returns identify 43.4m front /39.8m rear Gilles roofs,
  # and48.6m Tiffany. The 8.3m party-wall break is independently evident in
  # the two FY2025 parcels; retain the full source footprint as the envelope.
  a=front['start'];t=front['tangent'];n=front['outward'];localpoly=Polygon([[(p[0]-a[0])*t[0]+(p[1]-a[1])*t[1],(p[0]-a[0])*n[0]+(p[1]-a[1])*n[1]]for p in s['outline']])
  for label,bounds,height,color in[('gilles-front',[-5,-10.5,8.3,2],43.55,'#915543'),('gilles-rear',[-5,-50,8.3,-10.5],39.95,'#915543'),('tiffany',[8.3,-50,40,2],48.85,'#b6a178')]:
   from shapely.geometry import box
   piece=localpoly.intersection(box(*bounds));coords=list(piece.exterior.coords)[:-1]
   r['bodyParts'].append({'id':label,'outline':[[a[0]+t[0]*u+n[0]*v,a[1]+t[1]*u+n[1]*v]for u,v in coords],'eave':height,'paint':color,'basis':'2021 classified roof-height clusters; simplified flat/parapet surfaces preserve the mapped plan.'})
  r['bodyEvidence']={'source':'downtown/lidar_points.npz','sourceSHA256':read(RESEARCH.parent/'downtown/lidar_metadata.json')['output_sha256'],'year':2021,'roofHeightsM':[43.55,39.95,48.85],'method':'Native classified building returns measured in local façade u/v bins; current parcel address/story split corroborates the roof-height discontinuities. Full retained source plan remains.'}
 rows.append(r)
# Broader corpus closure: ordinary mapped commercial premises have usable
# current program/story/outline evidence even when their logo and colors are
# unobserved. Apply bounded inferred entrances/window rhythms, never transfer a
# neighboring historic description or material to an ancillary building.
buildings={r['id']:r for r in read(RESEARCH/'data/building-register.json')}
architectures={r['struct_id']:r for r in read(RESEARCH.parent/'street-detail/building_architecture.json')}
known={r['id']for r in catalog['rows']}|{r['structId']for r in catalog['retainedProtected']}|{r['id']for r in rows}|{'171795_867169'}
excluded={'MS-N-001','MS-S-013','IND-04','IND-09','IND-15','IND-17','IND-18','IND-20','IND-21','IND-22','IND-23','IND-24','IND-25','IND-26','IND-34','CC-THOMP-010','CC-THOMP-011','CC-THOMP-012','CC-THOMP-025','CC-GORE-010'}
recipes={'STORE':'retail','CONVEN. STORE':'retail','PHARMACY':'retail','LOC. SHOP. CNTR':'retail','DEPARTMENT STOR':'market','DRY CLEAN/LAUND':'retail','FRANCHISE F. FD':'restaurant','RESTAURANT':'restaurant','NIGHT-CLUBSR':'restaurant','BOWLING ALLEY':'restaurant','CLUB/LODGE/HALL':'cafe','AUTO SALES REPR':'garage','CAR WASH':'garage','LIGHT MANUF.':'warehouse','WAREHOUSE':'warehouse','STORAGE':'warehouse','INDUSTRIAL':'factory','BANK':'bank','OFFICE BUILDING':'office','PROF. BUILDING':'office','DAY CARE':'office','SERVICE GARAGE':'garage'}
expanded=[]
for record in ledger['records']:
 aid=record['evidenceId']
 if not aid.startswith(('MS-','CC-','IND-'))or aid in excluded:continue
 # The original ledger treated short entries beginning directly with BLD as
 # context rather than a location table. Their first identifier is still an
 # explicit building reference. Accept it only for current commercial entries
 # whose heading address number matches the exact current parcel address.
 chapterIds=list(record['buildingIds'])
 if aid.startswith('CC-')and not chapterIds and record['facts']:
  match=re.match(r'(BLD-\d+_\d+)',record['facts'][0]['statement'])
  if match:
   candidate=buildings.get(match[1]);heading=record['title'].split('—',1)[-1].split(':',1)[0]
   numbers=re.findall(r'\d+',heading);address=(candidate or{}).get('parcelAddress')or''
   if address.split(' ',1)[0]in numbers:chapterIds.append(match[1])
 for bid in chapterIds:
  sid=bid.removeprefix('BLD-')
  if sid in known:continue
  building=buildings.get(bid);architecture=architectures.get(sid)
  path=Path(os.environ.get('WEBSTER_SOURCE_BUILDINGS','/private/tmp/webster-realism-v2-building/townwide-assets'))/(sid+'.report.json')
  if not building or not architecture or not path.exists():continue
  sourceReport=read(path);style=(building.get('assessorStyle')or'').upper()
  recipeOverride='cafe'if sid=='168608_866678'else None # House-scale openings for the listed office in an apartment conversion.
  if sourceReport['mode']!='nonresidential_or_complex'or not building.get('principalStructureInferred')or(style not in recipes and not recipeOverride):continue
  floor=sourceReport['floor_z'];top=sourceReport['eave_z']
  if top-floor<2.35:continue
  outline=architecture['outline_xy'];outline=outline[:-1]if outline[0]==outline[-1]else outline
  bounds=sourceReport['bounds'];cx=(bounds['min'][0]+bounds['max'][0])/2;cy=-(bounds['min'][2]+bounds['max'][2])/2
  tileId=f'{math.floor(cx/250)}_{math.floor(cy/250)}';tile=next((t for t in manifest['tiles']if t['id']==tileId),None)
  if not tile:continue
  signed=sum(a[0]*b[1]-b[0]*a[1]for a,b in zip(outline,outline[1:]+outline[:1]));faces=[]
  for a,b in zip(outline,outline[1:]+outline[:1]):
   dx,dy=b[0]-a[0],b[1]-a[1];w=math.hypot(dx,dy)
   if w<3:continue
   faces.append({'start':a,'tangent':[dx/w,dy/w],'outward':[-dy/w,dx/w]if signed<0 else[dy/w,-dx/w],'width':w})
  road=architecture.get('nearest_road_xy')
  if not faces or not road:continue
  def faceScore(f):
   middle=[f['start'][i]+f['tangent'][i]*f['width']/2 for i in[0,1]];delta=[road[i]-middle[i]for i in[0,1]];dist=math.hypot(*delta)
   return(sum(delta[i]*f['outward'][i]for i in[0,1])/max(dist,.01))*2+min(f['width'],45)/80-dist/150
  if aid.startswith('MS-')and architecture['road_name']=='MAIN STREET':
   direction=-1 if aid.startswith('MS-N')else 1;front=max(faces,key=lambda f:f['outward'][1]*direction*2+min(f['width'],45)/80)
  else:front=max(faces,key=faceScore)
  if front['width']<3:continue
  if (building.get('parcelOverlapFraction')or 0)<.85:
   parcel=parcel_shapes.get(building.get('parcelAddress'))
   interval=frange(front,parcel[0])if parcel else None
   if not interval or interval[1]-interval[0]<3:
    valid=[(candidate,frange(candidate,parcel[0]))for candidate in faces]if parcel else[]
    valid=[(candidate,span)for candidate,span in valid if span and span[1]-span[0]>=3]
    if valid:front,interval=max(valid,key=lambda pair:faceScore(pair[0]))
   if not interval or interval[1]-interval[0]<3:continue
   front={**front,'start':[front['start'][i]+front['tangent'][i]*interval[0]for i in[0,1]],'width':interval[1]-interval[0]}
  recipe=recipeOverride or recipes[style];stories=max(1,min(3,round(float(building.get('assessorStories')or'1'))));paint=None
  if aid=='MS-N-004':paint='#9b6952' # Documented1959brick construction/two units.
  f={**front,'id':aid,'recipe':recipe,'stories':stories,'paint':paint,'floor':floor,'top':top,'sourceJoin':{'parcelAddress':building.get('parcelAddress'),'parcelObjectId':building.get('parcelObjectId'),'assessorFY':building.get('assessorFY'),'stories':building.get('assessorStories'),'yearBuilt':building.get('assessorYearBuilt'),'method':'Explicit chapter building ID plus exact original/current parcel identity, principal structure and source nonresidential-mode gates.'},'documented':{'program':style,'stories':building.get('assessorStories'),'buildingId':bid},'evidenceIds':[aid],'source':record['source'],'inference':'Program-specific entry, frame spacing and unobserved muted paint are authored within the retained source wall; no current logos, signs, or claimed photo-matched bay counts.'}
  frames=[f]
  if recipe in['garage','warehouse']and (building.get('parcelOverlapFraction')or 0)>=.85:
   side=max((x for x in faces if x is not front),key=lambda x:x['width'],default=None)
   if side and side['width']>20 and side['width']>front['width']*1.4:frames.append({**f,**side,'side':True})
  rows.append({'id':sid,'structId':sid,'name':building.get('parcelAddress')or record['title'],'tileId':tileId,'outline':outline,'base':sourceReport['base_z'],'floor':floor,'eave':top,'peak':sourceReport['source_height_evidence']['roof_max'],'footprintSource':{'SOURCEDATE':building.get('footprintSourceDate'),'SOURCETYPE':building.get('footprintSourceType'),'SOURCEDATA':building.get('footprintSourceData')},'origin':tile['origin'],'lods':[{k:l[k]for k in['level','sha256']}for l in tile['lods']],'frames':frames,'bodyParts':[]})
  known.add(sid);expanded.append({'id':aid,'structId':sid,'name':building.get('parcelAddress'),'status':'implemented-program-inference','traits':f['documented'],'sourceJoin':f['sourceJoin'],'limits':[f['inference']]})
coverage+=expanded
# The dated visitor photograph is a genuine exterior reference. The address
# range and sole principal parcel footprint resolve170Gore to164–178Gore.
sid='171795_867169'
architecture=next(r for r in read(RESEARCH.parent/'street-detail/building_architecture.json')if r['struct_id']==sid)
report=read(Path(os.environ.get('WEBSTER_SOURCE_BUILDINGS','/private/tmp/webster-realism-v2-building/townwide-assets'))/(sid+'.report.json'))
outline=architecture['outline_xy'][:-1];area=Polygon(outline).area;cx,cy=architecture['centroid_xy'];tileId=f'{math.floor(cx/250)}_{math.floor(cy/250)}'
tile=next(t for t in manifest['tiles']if t['id']==tileId);faces=[]
signed=sum(a[0]*b[1]-b[0]*a[1]for a,b in zip(outline,outline[1:]+outline[:1]))
for a,b in zip(outline,outline[1:]+outline[:1]):
 dx,dy=b[0]-a[0],b[1]-a[1];w=math.hypot(dx,dy);faces.append({'start':a,'tangent':[dx/w,dy/w],'outward':[-dy/w,dx/w]if signed<0 else[dy/w,-dx/w],'width':w})
front=max((f for f in faces if f['width']>40),key=lambda f:f['outward'][0])
front.update({'id':'LK-006','recipe':'lake-plaza','stories':1,'paint':'#9e8768','floor':report['floor_z'],'top':report['eave_z'],'sourceJoin':{'parcelAddress':'164-178 GORE RD','parcelObjectId':2461909,'assessorFY':2025,'stories':'1','yearBuilt':1970,'method':'170 falls within exact named retail parcel address range; sole principal roofprint covers100%of its original parcel join. Photo shows matching long low retail frontage.'},'documented':{'wallMaterial':'buff/red brick piers','roofFascia':'sloped teal standing-seam fascia','glazing':'broad storefront glass','lettering':'raised yellow lake-name letters'},'evidenceIds':['LK-006','SGN-002'],'source':{'path':str(RESEARCH/'sections/lake-and-shoreline-detail.md'),'lineStart':120,'lineEnd':129,'urls':['https://www.roadsideamerica.com/tip/45879','https://www.roadsideamerica.com/attract/images/ma/MAWEBname_springer2.jpg'],'datesMentioned':['2017-03-27'],'researchCompiledDate':'2026-09-06'},'inference':'Viewed cited2017exterior. Exact tenant signs omitted. Original text and geometric standing-seam fascia fitted to current retained source footprint and LiDAR maximum, not a2026photographic survey.'})
rows.append({'id':sid,'structId':sid,'name':'Lake-name plaza,164–178GoreRoad','tileId':tileId,'outline':outline,'base':report['base_z'],'floor':report['floor_z'],'eave':report['eave_z'],'peak':report['source_height_evidence']['roof_max'],'footprintSource':{'SOURCE':'ROLTA','SOURCETYPE':'ROOFPRINT','SOURCEDATE':20110000,'SOURCEDATA':'DIGITALGLOBE2011 30CM ORTHO'},'origin':tile['origin'],'lods':[{k:l[k]for k in['level','sha256']}for l in tile['lods']],'frames':[front],'bodyParts':[]})
coverage.append({'id':'LK-006','name':'Lake-name plaza fascia','structId':sid,'status':'implemented-dated-photo','sourceJoin':front['sourceJoin'],'traits':front['documented'],'limits':[front['inference']]})
for aid in TARGETS:
 if any(c['id']==aid for c in coverage):continue
 reasons={'MS-N-011':'MHC WEB.90 point lies in exact 201–205 Main FY2025 commercial open parking parcel. No current Cook footprint; do not resurrect historical yellow block.','MS-S-014':'Exact 228–230 parcel is4 stories/year1892, but MHC point lies outside current footprint and the only intersecting BLD168303_866589 has a5m source wall/1950 one-story office interpretation. Cannot transfer four-story Columbia to that low building.','MS-S-019':'Exact272–274 parcel corroborates3 stories, but no retained roofprint intersects it; MHC point also outside all current outlines.'}
 coverage.append({'id':aid,'status':'uncertain-registration'if aid!='MS-N-011'else'inapplicable-current-parking','reason':reasons.get(aid,'No accepted footprint allocation.')})
out={'version':1,'sourceManifestSha256':sha(base/'manifest.json'),'sourceLedgerSha256':sha(RESEARCH/'implementation/landmark-evidence.json'),'coordinateSystem':'east,north,source-local height metres; Three X,height,-north; origin applied once','rules':['Only explicit source GLB SHA/LOD/origin match may render.','Source bodies retained except the documented Gilles/Tiffany height correction.','Shared footprints are allocated by actual address parcels; no blanket shared-footprint recolors.','Historical/current observations and authored detail assumptions remain separate; no business logo textures.'],'rows':rows}
# Actual guided lanes pass close to several retained source walls. The new
# skin/trim must not reduce that clearance. These conservative accepted ranges
# come from every legal connector sampled at0.25m with the padded touring-car
# envelope; a fresh native audit verifies the result against the current engine.
# Geometry and old building openings are untouched in the excluded portions.
clearance={('168341_866602',2):(0,8.50),('168531_868156',0):(10.50,None),('168644_867776',0):None,('169171_867455',0):(9.40,None)}
for r in rows:
 kept=[]
 for i,f in enumerate(r['frames']):
  key=(r['id'],i)
  if key not in clearance:kept.append(f);continue
  span=clearance[key]
  if span is None:continue
  lo,hi=span;hi=f['width']if hi is None else hi
  f={**f,'start':[f['start'][j]+f['tangent'][j]*lo for j in[0,1]],'width':hi-lo,'clearanceInference':'Only this portion of the original facade is detailed: padded actual guided vehicle envelopes excluded the remaining source wall. Current road and source body preserved.'}
  kept.append(f)
 r['frames']=kept
(ROOT/'data/derived/town/commercial-completion.json').write_text(json.dumps(out,indent=2)+'\n')
from collections import Counter
(QA/'coverage-ledger.json').write_text(json.dumps({'version':1,'applications':coverage,'counts':{'rows':len(rows),'frames':sum(len(r['frames'])for r in rows),'byStatus':dict(Counter(c['status']for c in coverage)),'targets':len(TARGETS)},'clearanceLimits':[{'structId':sid,'originalFrameIndex':i,'acceptedRangeM':span}for(sid,i),span in clearance.items()]},indent=2)+'\n')
print('Commercial buildings',len(rows),'facades',sum(len(r['frames'])for r in rows),'dispositions',dict(Counter(c['status']for c in coverage)))
