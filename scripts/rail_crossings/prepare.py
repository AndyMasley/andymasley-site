from pathlib import Path
import json,gzip,hashlib,shutil
import numpy as np
from shapely.geometry import Point,Polygon,LineString,box
R=Path(__file__).resolve().parents[2];O=Path('/private/tmp/webster-finished-game/rail-crossings');src=R/'data/source/town/rail-crossings';src.mkdir(parents=True,exist_ok=True)
for name in ['active-railways.json','query.overpass']:shutil.copyfile(O/'sources'/name,src/name)
q=json.loads((O/'source-qualification.json').read_text());release=json.loads((R/'data/derived/town/release.json').read_text());manifest=json.loads((R/'public/town-assets'/release['directory']/'manifest.json').read_text());net=json.loads(gzip.decompress((R/'data/derived/town/engine-network.json.gz').read_bytes()));edges={e['id']:e for e in net['edges']};rows=[];tiles={}
for row in q['rows']:
 c=np.array(row['mappedIntersection']);t=np.array(row['railTangent']);v=np.array([-t[1],t[0]]);poly=Polygon([c+t*x+v*y for x,y in[(-14,-1.6),(14,-1.6),(14,1.6),(-14,1.6)]]);edge=edges[row['edgeId']];line=LineString([p[:2]for p in edge['points']]);s=line.project(Point(c));walk=0;height=edge['points'][0][2]
 for a,b in zip(edge['points'],edge['points'][1:]):
  length=np.linalg.norm(np.array(a[:2])-b[:2])
  if walk+length>=s:height=a[2]+(b[2]-a[2])*max(0,min(1,(s-walk)/length));break
  walk+=length
 item={k:row[k]for k in ['id','road','edgeId','railwayWayId','railwayTags','distanceInventoryToMappedIntersectionM']}
 item.update({'center':c.tolist(),'tangent':t.tolist(),'height':height,'halfLength':14,'halfWidth':1.6,'gauge':1.435,'railHeadWidth':.065,'flangeWidth':.060,'sourceBasis':'Current active OSM Norwich Branch alignment intersects the retained road and agrees with registered 2025 MassGIS aerial. FRA point retains crossing identity; pin is not substituted for track bearing. Neutral panel construction, railhead/flange widths and flush offsets are authored inference.'});rows.append(item)
 for tile in manifest['tiles']:
  ox,_,oz=tile['origin'];bound=box(ox,-oz,ox+250,-oz+250)
  if poly.intersection(bound).area>1e-5:
   tiles.setdefault(tile['id'],{'origin':tile['origin'],'lods':[{'level':l['level'],'sha256':l['sha256']}for l in tile['lods']],'crossings':[]})['crossings'].append(row['id'])
result={'version':1,'sourceManifestSha256':release['manifestSha256'],'sourceRailwaySha256':q['sourceOsmSha256'],'sourceOsmTimestamp':q['osmTimestamp'],'sourceAerialDate':2025,'sourceAerialSha256':'b14f7338f5c04544ebb35fd124450eb2b88a96843646cca423ee3601fead69ff','policy':'Four current FRA crossing identities; only active mapped railway alignments, never abandoned/disused lines. Standard gauge is tagged1435mm. Construction details are authored inference. Runtime clips to final same-height asphalt; no road/terrain/mast/graph movement. Railheads sit7mm, panels4mm and flangeways3mm above the actual pavement to avoid z-fighting; these are visual surface finishes, not a collision bump. Paint only within these crossing panels is trimmed at the same road layer.','tiles':tiles,'crossings':rows}
(R/'data/derived/town/rail-crossings.json').write_text(json.dumps(result,separators=(',',':'))+'\n');print('tiles',list(tiles),'rows',len(rows),'bytes',len(json.dumps(result)))
