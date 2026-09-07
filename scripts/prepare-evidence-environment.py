"""Produce the small, explicitly qualified environment recipe from atlas IDs.

Required local inputs: frozen scene inspection and the public, identified OSM
footbridge geometry. Nothing in the atlas, terrain, road graph or GLBs is edited.
"""
import hashlib,json,math,os
from shapely.geometry import LineString, Point
from pathlib import Path
from pyproj import Transformer
SITE=Path(__file__).resolve().parents[1]
SOURCE=Path(os.environ.get('WEBSTER_SOURCE','/Users/andy/Documents/New project/webster-blender'))
WORK=Path(os.environ.get('WEBSTER_ENVIRONMENT_QA','/private/tmp/webster-environment-evidence'))
def read(p):return json.loads(p.read_text())
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
ledger=SOURCE/'research/implementation/environment-evidence.json';evidence=read(ledger);records={r['id']:r for r in evidence['entries']}
network=SOURCE/'web-export/engine/network.json';graph=read(network);origin=graph['origin_projected_m'];transform=Transformer.from_crs(4326,6491,always_xy=True)
def local(lon,lat):
 p=transform.transform(lon,lat);return [round(p[i]-origin[i],6) for i in [0,1]]
def obj(id,kind,lon,lat,parameters):
 xy=local(lon,lat);t=f'{math.floor(xy[0]/250)}_{math.floor(xy[1]/250)}';r=records[id]
 return {'id':id,'kind':kind,'tileId':t,'center':xy,'coordinatesWGS84':[lon,lat],'parameters':parameters,'sourceSectionIds':r['sourceSectionIds'],'sources':r.get('curatedSources',r['sourceBlocks']),'correctionIds':r.get('correctionIds',[]),'inference':'Point location comes from the named atlas identity. Unmeasured minor dimensions, finish, concealed construction and sculpture pose are restrained authored interpretations; no exact current photo replication is claimed. Ground is sampled from rendered terrain at load time.'}
raw=WORK/'bridge-osm-full.json';osm=read(raw);nodes={r['id']:r for r in osm['elements'] if r['type']=='node'};way=next(r for r in osm['elements'] if r['type']=='way');ends=[local(nodes[i]['lon'],nodes[i]['lat'])for i in way['nodes']]
length=math.dist(*ends);assert 30<length<40
objects=[obj('ENV-INF-BR-AC9','pony_bridge',-71.858855,42.055446,{'span':20.7264,'width':4.05,'rise':2.8956,'panels':9,'approachEndpoints':ends,'mappedCrossingLength':length,'sidewalkWidth':1.6129}),obj('ENV-MON-001','soldiers_monument',-71.880209,42.049818,{'height':12.192,'baseWidth':5.4864,'fenceRadius':4.6}),obj('ENV-MON-006','gazebo',-71.879975,42.049464,{'sides':11,'radius':3.05,'height':5.45}),obj('ENV-MON-007','trough',-71.881033,42.049331,{'width':1.6764,'depth':.9144,'height':.65}),obj('ENV-MON-003','korean_tablet',-71.880024,42.049793,{'width':1.25,'depth':.28,'height':1.55}),obj('ENV-MON-004','vietnam_rhombus',-71.879981,42.049813,{'width':1.55,'depth':.28,'height':1.35}),obj('ENV-MON-022','beach_flagpole',-71.856123,42.053878,{'height':19.812})]
# The bridge event line provides actual mapped crossing orientation and extent.
# Agency inventory points can be several metres from that line's midpoint.
bridge_path=SOURCE/'driving/network_current_bridge.json'; bridge_source=read(bridge_path)
bridge_events={f['attributes']['OBJECTID']:f for f in bridge_source['features']}
infrastructure=read(SOURCE/'research/data/infrastructure-landscape.json')
bridge_facts={r['id']:r for r in infrastructure['bridges']}
for bin_id,event_id,edge_id,inferred_width in [('AJT',5170,2178,12.8),('1FG',3032,1294,6.10)]:
 event=bridge_events[event_id]; facts=bridge_facts['INF-BR-'+bin_id]; attr=event['attributes']
 xyline=[[v[0]-origin[0],v[1]-origin[1]] for v in event['geometry']['paths'][0]]
 line=LineString(xyline); center=list(line.interpolate(line.length/2).coords)[0]
 structure_length=facts['structure_length_m']; nbi=facts.get('nbi_2025') or {}; width=nbi.get('deck_width_m',inferred_width)
 edge=next(e for e in graph['edges'] if e['id']==edge_id)
 r=obj('ENV-INF-BR-'+bin_id,'girder_bridge',facts['location']['longitude'],facts['location']['latitude'],
       {'span':structure_length,'width':width,'roadwayWidth':edge['width_m'],'sidewalkWidth':nbi.get('left_curb_or_sidewalk_width_m',0),
        'beamDepth':.70 if bin_id=='AJT' else .58,'railHeight':1.10,'mappedCrossingLength':line.length})
 r['agencyPointLocal']=r['center']; r['agencyPointWGS84']=r['coordinatesWGS84']; r['center']=[round(v,6)for v in center]
 r['coordinatesWGS84']=list(Transformer.from_crs(6491,4326,always_xy=True).transform(center[0]+origin[0],center[1]+origin[1]))
 r['locationBasis']='Rendered center is the mapped road-event midpoint. The separate agency inventory point is retained as an identity reference, not treated as a surveyed bridge center.'
 r['tileId']=f'{math.floor(center[0]/250)}_{math.floor(center[1]/250)}'
 dx,dy=xyline[-1][0]-xyline[0][0],xyline[-1][1]-xyline[0][1]; norm=math.hypot(dx,dy); tangent=[dx/norm,dy/norm]
 r['frame']={'start':r['center'],'tangent':tangent,'outward':[tangent[1],-tangent[0]]}
 r['roadBridgeSource']={'eventId':event_id,'BIN':bin_id,'sourceSha256':sha(bridge_path),'sourcePath':'driving/network_current_bridge.json',
  'sourceValidFromUtc':'2023-01-01','mappedEventLineLocalEastNorth':xyline,'nearestGuidedEdgeId':edge_id,'guidedLaneOffsetM':edge['lane_offset_m'],
  'serviceType':attr.get('TypeOfService'),'publishedStructureLengthM':structure_length,'publishedDeckWidthM':nbi.get('deck_width_m'),
  'publishedSidewalksM':([nbi.get('left_curb_or_sidewalk_width_m'),nbi.get('right_curb_or_sidewalk_width_m')]if nbi else None),
  'preservation':'No source road/terrain/water triangle or guided graph point is replaced. The deck/beam body lies below the retained road surface.',
  'uncertainty':'The mapped bridge crosses the town boundary and extends past the clipped road geometry. A plane fitted only to valid source-road samples continues the support structure over that short unmapped part; no new guided road is added.',
  'authoredDimensions':['Beam depth, flange/web size, slab thickness, abutment depth/finish, railing layout, and rail height are inferred. Support slab top is0.18m below the source wearing surface to retain clearance under existing turn connectors.']+(['Total deck width6.10m is inferred from the4.572m road width with narrow edge strips; no current NBI deck width was secured.']if not nbi else []),
  'serviceConflict':('The cached road event says Pedestrian-bicycle, while the existing game graph allows cars on the street stub. Retain this discrepancy for route review; do not claim confirmed present vehicle access.'if bin_id=='1FG'else None)}
 r['inference']='Mapped steel girder bridge identity, length and event alignment; AJT deck/sidewalk widths are published. Girder sections, concrete abutments and restrained rail details are authored. No exact present railing appearance or unverified dedication sign is asserted.'
 objects.append(r)
deck_path=SITE/'data/derived/town/great-bridge-deck-evidence.json'; deck=read(deck_path)
ag=deck['agencyStructure']; frame=deck['coordinateSystem']; plane=deck['deckPlane']
great=obj('ENV-INF-BR-1YR','masonry_bridge',-71.8874408,42.0492648,
 {'span':ag['structureLengthM'],'archSpan':ag['mainSpanM'],'width':ag['deckWidthM'],'roadwayWidth':ag['roadwayWidthM'],
  'leftSidewalkWidth':ag['leftSidewalkM'],'rightSidewalkWidth':ag['rightSidewalkM'],'railHeight':1.08,'expectedDeckHeight':plane['constant']})
great['frame']={'start':frame['eastNorthCenter'],'tangent':frame['alongUnit'],'outward':[-v for v in frame['acrossUnit']]}
great['measuredDeckEvidence']={'path':'data/derived/town/great-bridge-deck-evidence.json','sha256':sha(deck_path),'sourceYear':deck['sourceYear'],
 'fitConstant':plane['constant'],'fitAlongSlope':plane['alongSlope'],'fitAcrossSlopeInSourceFrame':plane['acrossSlope'],'inliers':plane['inliers'],
 'sourceSupportedAlongM':plane['supportedAlongExtentM'],'sourceSupportedAcrossM':plane['supportedAcrossExtentM'],
 'interpretation':'Road deck level is constrained by classified lidar bridge-deck returns. Inventory establishes masonry arch, main span12.8m and widened deck16.8m. Arch rise, ring geometry, abutment details and rail appearance are authored; 1956 widening concealed construction is not established.',
 'boundary':'Preserve the existing navigable town-boundary endpoint. The inventory-length structural envelope is visual river context; no new guided road or west-bank terrain is created.',
 'deckCenterOffsetRightM':(ag['rightSidewalkM']-ag['leftSidewalkM'])/2,
 'centerBasis':'Mapped road line centers the12.4m carriageway. Unequal sidewalk widths place the structural deck center0.7m left of that line.',
 'sideAllocation':'Left/right sidewalk widths follow the authored eastbound frame; exact inventory direction convention is not independently verified.'}
great['inference']='Measured corrected road supports an inferred granite arch and 1956-width deck envelope. Current source sidewalks are retained where ray samples find them. The present railing and concealed widening construction are not photographed or verified.'
objects.append(great)
for x in objects:
 xy=x['center'];near=[]
 for e in graph['edges']:
  if e.get('direction')=='reverse':continue
  for a,b in zip(e['points'],e['points'][1:]):
   dx,dy=b[0]-a[0],b[1]-a[1];l=dx*dx+dy*dy
   f=max(0,min(1,((xy[0]-a[0])*dx+(xy[1]-a[1])*dy)/l))if l else 0
   p=[a[0]+f*dx,a[1]+f*dy];near.append((math.dist(p,xy),e['id'],p,e['name']))
 nearest=min(near);x['roadContext']={'nearestCenterlineDistanceM':nearest[0],'edgeId':nearest[1],'road':nearest[3],'basis':'Context/clearance screening only; does not establish an entrance.'}
 if x['kind'] in ['girder_bridge','masonry_bridge']:continue
 # Frames have a positive determinant after source north is converted to Three -Z.
 x['frame']={'start':xy,'tangent':[1,0],'outward':[0,-1]}
 if x['kind']=='pony_bridge':
  tangent=[(ends[1][i]-ends[0][i])/length for i in [0,1]];x['frame']={'start':ends[0],'tangent':tangent,'outward':[tangent[1],-tangent[0]]}
 else:
  v=[nearest[2][i]-xy[i] for i in [0,1]];l=math.hypot(*v);v=[z/l for z in v];x['frame']={'start':xy,'tangent':[-v[1],v[0]],'outward':v}
next(r for r in objects if r['id']=='ENV-MON-022')['heightBasis']='MHC WEB.920 records65feet steel pole;65*0.3048=19.812metres. Corrects earlier10m approximation.'
for record in objects:
 f=record['frame']; t,n=f['tangent'],f['outward']
 assert abs(math.hypot(*t)-1)<1e-10 and abs(math.hypot(*n)-1)<1e-10
 assert abs(-t[0]*n[1]+t[1]*n[0]-1)<1e-10
manifest=SITE/'public/town-assets/2026-09-37fbef34bc2a/manifest.json'
data={'version':3,'sourceLedgerSha256':sha(ledger),'sourceManifestSha256':sha(manifest),'sourceNetworkSha256':sha(network),'sourceOriginProjectedM':origin,'coordinates':'Source local EPSG:6491 metres, east/north; runtime X,Y,Z=(east,absolute local height,-north).','sourceInspectionSha256':sha(WORK/'source-tile-inspection.json'),'additionalBridgeInspectionSha256':sha(WORK/'bridge-source-tile-inspection.json'),'osmBridge':{'url':'https://www.openstreetmap.org/api/0.6/way/1125752800/full.json','sha256':sha(raw),'wayId':1125752800,'version':way['version'],'timestamp':way['timestamp'],'retrievedUtcDate':'2026-09-06','nodeIds':way['nodes'],'attribution':'OpenStreetMap contributors, ODbL','mappedLengthM':length,'limitation':'Community footway endpoints include approaches; the historic iron span remains20.7264m. Contributor account metadata is not retained.'},'nonDuplication':'Frozen LOD0 categories within these local areas contain terrain/roads/building details but no matching truss, memorial or gazebo geometry. The helper adds named missing objects and never edits original meshes. Existing state is additionally checked by stable feature IDs at runtime.','objects':objects,'deferred':[],'resolvedElsewhere':[{'id':'ENV-MON-002','module':'memorial-details.ts'},{'id':'ENV-LK-007','module':'additional-environment.ts'}]}
output=SITE/'data/derived/town/evidence-environment.json';output.write_text(json.dumps(data,ensure_ascii=False,separators=(',',':'))+'\n');print(output,len(objects),output.stat().st_size,sha(output))
# Separate road grade finding, without modifying the graph.
p=local(-71.8874408,42.0492648);segments=[]
for e in graph['edges']:
 if e['name']=='MAIN STREET' and min(math.dist(v[:2],p)for v in e['points'])<30:segments.append({k:e[k]for k in ['id','physical_id','from','to','points','name','elevation_status','bridge_event_ids','source_objectid','source_range_m']})
(WORK/'great-bridge-grade-finding.json').write_text(json.dumps({'source':str(network),'sourceSha256':sha(network),'bridgeId':'INF-BR-1YR','agencyCenterLocal':p,'sourceSpanM':12.8,'sourceStructureLengthM':17.7,'finding':'Main Street source boundary node is27.6676m while points farther east rise to about30m over less than20m. Bare-earth draping appears to descend toward the river. A masonry arch alone cannot repair its guided road surface. No graph mutation performed.','segments':segments},indent=2)+'\n')
