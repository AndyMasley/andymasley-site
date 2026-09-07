"""Reproduce bounded bridge appearance recipes from cached official bridge events.
Road geometry, deck elevations, original GLBs and the navigable boundary stay immutable.
"""
from pathlib import Path
import hashlib, json, math, os
from shapely.geometry import LineString, Point, Polygon
from pyproj import Transformer
ROOT=Path(__file__).resolve().parents[1]
SOURCE=Path(os.environ.get('WEBSTER_SOURCE','/Users/andy/Documents/New project/webster-blender'))
read=lambda p:json.loads(p.read_text())
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
gp=SOURCE/'web-export/engine/network.json'; ep=SOURCE/'driving/network_current_bridge.json'; ip=SOURCE/'research/data/infrastructure-landscape.json'
g=read(gp); origin=g['origin_projected_m']; events={f['attributes']['BIN']:f for f in read(ep)['features']}; facts={r['massdot_bin']:r for r in read(ip)['bridges']}
edges=[(e,LineString([p[:2]for p in e['points']])) for e in g['edges'] if e['direction']!='reverse']
# Only published bridge types. Concealed culverts with unknown outlet alignment,
# removed historical spans and unlocated railway structures are not fabricated.
selected=['22R','1LW','6XC','1QG','1QH','1QJ','1QK','1QL','1QM','1KG','1PW','1FF','1BE','1BG','92C']
source_log={r['id']:r for r in read(SOURCE/'research/sources/infrastructure-source-log.json')['curated_sources']}
rows=[]
transform=Transformer.from_crs(4326,6491,always_xy=True)
for bin_id in selected:
 r=facts[bin_id]; event=events[bin_id]; attr=event['attributes']; xy=[[p[0]-origin[0],p[1]-origin[1]]for p in event['geometry']['paths'][0]]; line=LineString(xy);center=list(line.interpolate(line.length/2).coords)[0]
 agency=transform.transform(r['location']['longitude'],r['location']['latitude']); agency=[agency[i]-origin[i]for i in[0,1]];event_error=Point(agency).distance(line)
 if event_error>25:
  # Sutton's event arc is1.5km from its own inventory lat/lon. Reject that arc,
  # then join the agency point to the independently named SUTTON ROAD geometry.
  assert bin_id=='6XC', (bin_id,event_error)
  matched=[(e,l)for e,l in edges if e['name']=='SUTTON ROAD'];closest,cl=min(matched,key=lambda q:q[1].distance(Point(agency)));at=cl.project(Point(agency));assert cl.distance(Point(agency))<3
  center=list(cl.interpolate(at).coords)[0];xy=[list(cl.interpolate(at+offset).coords)[0]for offset in[-r['structure_length_m']/2,r['structure_length_m']/2]];line=LineString(xy)
 d=[xy[-1][i]-xy[0][i]for i in[0,1]];norm=math.hypot(*d);t=[v/norm for v in d];v=[t[1],-t[0]]
 candidates=[(e,l)for e,l in edges if attr['OBJECTID']in e['bridge_event_ids']]
 if event_error>25:candidates=matched
 if not candidates: candidates=edges
 edge,el=min(candidates,key=lambda q:q[1].distance(Point(center)))
 event_center=list(center); source_at=el.project(Point(center)); alignment_offset=el.distance(Point(center))
 if .01<source_at<el.length-.01 and alignment_offset<3:
  center=list(el.interpolate(source_at).coords)[0]
  # Source roads sometimes sit about a metre off the inventory event. Keep the
  # narrow parapets centered on the actual wearing surface, not that offset arc.
  ends=[el.interpolate(max(0,min(el.length,source_at+k))).coords[0]for k in[-1,1]]
  d=[ends[1][i]-ends[0][i]for i in[0,1]];norm=math.hypot(*d);t=[v/norm for v in d];v=[t[1],-t[0]]
 nbi=r.get('nbi_2025')or{}; width=nbi.get('deck_width_m')or(edge['width_m']+1.2)
 shape='highway_girder'if bin_id in['1QG','1QH','1QJ','1QK','1QL','1QM']else'road_girder'
 if bin_id in['22R','1LW','6XC']:shape='concrete_slab'
 if bin_id=='1BG':shape='concrete_tee'
 if bin_id=='92C':shape='concrete_box'
 rail='safety_barrier'if shape=='highway_girder'else'tube_rail'
 if bin_id=='6XC':rail='t101'
 if bin_id in['1LW','1BE']:rail='concrete_post_pipe'
 if bin_id=='1BG':rail='none'
 span=r['structure_length_m'];walkL=nbi.get('left_curb_or_sidewalk_width_m')or 0;walkR=nbi.get('right_curb_or_sidewalk_width_m')or 0
 # NBI includes curbs in these fields; do not turn 0.2/0.3m strips into sidewalks.
 walkL=walkL if walkL>.65 else 0;walkR=walkR if walkR>.65 else 0
 # The source event direction defines this authored side convention. Its relation
 # to inventory left/right is unverified and preserved as a data limitation.
 roadWidth=edge['width_m']; width=max(width,roadWidth+.75+walkL+walkR)
 centerV=(walkR-walkL)/2
 params={'span':span,'allowSupportedFragment':bin_id in['1FF','92C','1PW'],'width':width,'roadwayWidth':roadWidth,'leftWalk':walkL,'rightWalk':walkR,'centerV':centerV,'rail':rail,'beamDepth':.65 if 'girder'in shape else .4,'supportDepth':1.5,'expectedDeckM':LineString(edge['points']).interpolate(el.project(Point(center))).coords[0][2]+.04,'supportEnds':[],'medianPier':False,'approachLength':6.0 if bin_id=='6XC'else 3.5}
 # Gate supports against the actual lower guided lanes. Their horizontal boxes
 # may not overlap any road beneath the crossing (3m half-width car corridor).
 def world(u,z):return[center[i]+u*t[i]+z*v[i]for i in[0,1]]
 def blocked(u,length,breadth):
  poly=Polygon([world(u+a,centerV+b)for a,b in[(-length/2,-breadth/2),(length/2,-breadth/2),(length/2,breadth/2),(-length/2,breadth/2)]])
  return [e['id']for e,l in edges if attr['OBJECTID']not in e['bridge_event_ids'] and l.distance(poly)<e['width_m']/2+1]
 guards=[]
 for side in[-1,1]:
  at=side*(span/2-.48);hits=blocked(at,.96,width)
  guards.append({'end':side,'blockedByEdges':hits})
  if not hits:params['supportEnds'].append(side)
 if bin_id in['1KG','1PW']:
  # Published two spans, but median pier can only appear in clear source space.
  hits=blocked(0,.7,width*.75);params['medianPier']=not hits;guards.append({'medianPierBlockedByEdges':hits})
 rows.append({'id':'BRIDGE-'+bin_id,'sourceId':'INF-BR-'+bin_id,'tileId':f'{math.floor(center[0]/250)}_{math.floor(center[1]/250)}','kind':shape,'frame':{'start':center,'tangent':t,'outward':v},'parameters':params,'sourceYear':2023 if bin_id=='6XC'else int(r['year_built']), 'sourceEvidence':{'inventoryMaterial':r['material'],'inventoryStructureType':r['structure_type'],'eventId':attr['OBJECTID'],'guidedEdgeId':edge['id'],'eventLengthM':line.length,'eventAgencyDistanceM':event_error,'eventCenterEastNorth':event_center,'sourceRoadAlignmentOffsetM':alignment_offset,'alignmentBasis':'Named source road at verified agency point; misplaced source bridge arc rejected.'if event_error>25 else'Mapped bridge event line','agencyDeckWidthM':nbi.get('deck_width_m'),'publishedMainSpanM':nbi.get('maximum_span_length_m'),'supportCollisionGuards':guards,'sourcePath':'research/sections/bridges-crossings-detail.md','sourceAccessDate':'2026-09-06','sourceURLs':[source_log['INF-S001']['url'],source_log['INF-S002']['url']]+(['https://theengineeringcorp.com/wp-content/uploads/2023/02/Sutton-Road-Project-Manual_Feb-2023.pdf','https://gis.dot.nh.gov/bridge_plan/115-126-Stoddard.pdf']if bin_id=='6XC'else[])},'appearanceBasis':('Concrete T-beam body only. The clipped source boundary creates a U-turn through the narrow above-deck parapet envelope, so that unresolved rail is omitted; no false wider bridge or route change.'if bin_id=='1BG'else'Documented2023 T101 steel bridge rail, granite curbs, concrete headwalls, and approach guardrail. Detailed rail cross-section is a restrained T101-family interpretation, not an as-built survey.'if bin_id=='6XC'else'Published material, structural type, structure length and mapped event alignment; railing family, concealed members, colors and minor dimensions are authored interpretations, not current image observations.'),'limitations':['All surface heights are fitted to the retained rendered asphalt; no road, water, terrain or graph geometry is changed.','The bridge event may cross the clipped town boundary. Supports may continue structurally beyond source road coverage, without inventing a drivable road.','Inventory left/right orientation is not independently resolved; sidewalk allocation follows the event direction.']+(['Only the coherent source-supported fragment can be drawn inside the town clip. No full-span height extrapolation or off-map road is created. Perryville omits the curb/rail because the artificial boundary U-turn occupies that narrow strip.']if bin_id in['1FF','92C','1PW']else[])})
data={'version':1,'sources':[{'path':str(p.relative_to(SOURCE)),'sha256':sha(p)}for p in[gp,ep,ip]],'coordinates':'Local source east/north metres, world=(east,height,-north); source origin unchanged.','objects':rows,'pony':{'sourcePath':'research/sections/macris-area-forms-north-south-village.md','sourceLines':[814,857],'sourceYear':1990,'sourceURLs':['https://tile.loc.gov/storage-services/master/pnp/habshaer/ma/ma1400/ma1417/data/ma1417data.pdf','https://mhc-macris.net/Documents/WEB/PDFs/WEB_902.pdf'],'spanNorth':63*.3048,'spanSouth':(67+8/12)*.3048,'width':(13+3.5/12)*.3048,'sidewalkWidth':(5+3.5/12)*.3048,'rise':9.5*.3048,'camberAboveHip':4*.3048,'panels':9,'sideAllocation':'The shorter truss remains on the existing sidewalk side. Relocation orientation is not independently surveyed.','hipConflict':'The transcription records hip lengths that do not algebraically reconcile with the recorded rise, camber and60degree angle. Use measured rise/camber and approximate panel rhythm; do not assert an exact60degree construction drawing.','appearance':'Straight built-up polygonal top-chord members, paired lower chords, I-section floorbeams, Pratt rods and raised-panel cast-iron sidewalk posts. No maker-name bollards; historical source says these were absent. Paint and1996 abutments inferred.'}}
out=ROOT/'data/derived/town/bridge-details.json';out.write_text(json.dumps(data,separators=(',',':'))+'\n');print(out,len(rows),out.stat().st_size)
