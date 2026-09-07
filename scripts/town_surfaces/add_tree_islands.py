from pathlib import Path
import json,hashlib,math
from shapely.geometry import Polygon,Point
from shapely.ops import unary_union
from shapely.strtree import STRtree
ROOT=Path(__file__).parent;ASSETS=Path('/private/tmp/webster-release/public/town-assets/2026-09-37fbef34bc2a');PUBLIC=ROOT/'output/public/town-surfaces/v2';manifest=json.loads((ASSETS/'manifest.json').read_text());audit=json.loads((ROOT/'output/lots-audit.json').read_text());points=[];sourceRows=[];refs=[]
for tile in manifest['tiles']:
 ref=tile.get('treeFile')
 if not ref:continue
 raw=(ASSETS/ref['url']).read_bytes();assert hashlib.sha256(raw).hexdigest()==ref['sha256'];rows=json.loads(raw);rows=rows if isinstance(rows,list)else rows['rows'];origin=tile['origin'];refs.append({'tileId':tile['id'],**ref})
 for i,r in enumerate(rows):
  center=[round(r[0]+origin[0],6),round(-(r[2]+origin[2]),6)];points.append(Point(center));sourceRows.append({'id':f"TREE-{tile['id']}-{i}",'center':center,'sourceTileId':tile['id'],'sourceSha256':ref['sha256']})
tree=STRtree(points);islandRows=[]
for lot in audit['lots']:
 safe=unary_union([Polygon(p[0],p[1:])for p in lot['polygons']]);hits=tree.query(safe.buffer(1.4),predicate='intersects');unique={}
 for idx in hits:
  point=points[int(idx)];row=sourceRows[int(idx)];radius=1.15 if safe.contains(point)and safe.boundary.distance(point)>=1.155 else 0
  unique[tuple(row['center'])]={'center':row['center'],'radiusM':radius}
  islandRows.append({'lotId':lot['id'],**row,'radiusM':radius})
 lot['treeIslands']=sorted(unique.values(),key=lambda r:tuple(r['center']))
audit['treeIslandPolicy']={'source':'Unchanged frozen scene treeFile anchors. These are retained geometric tree positions, not a verified current species or tree survey.','selection':'All anchors within 1.4 m of the safe lot polygon.','disk':'1.15 m radius only when the full circle plus 5 mm clearance fits within the building/water/zero-protected lot; otherwise radius0 is avoidance-only.','paintClearance':'Runtime minimum1.4 m, or radius plus0.35 m.','maskChanges':'None; root adds terrain-following authored mulch at positive-radius anchors.','originalTreesChanged':0,'originalMasksChanged':0};audit['treeAnchorProvenance']=islandRows
(ROOT/'output/lots-audit.json').write_text(json.dumps(audit,separators=(',',':'))+'\n');lotMap={r['id']:r for r in audit['lots']};index=json.loads((PUBLIC/'index.json').read_text())
for tid,ref in index['lotAssets'].items():
 old=PUBLIC/'lots'/Path(ref['url']).name;packet=json.loads(old.read_text())
 for r in packet['lots']:r['treeIslands']=lotMap[r['id']]['treeIslands']
 data=(json.dumps(packet,separators=(',',':'))+'\n').encode();h=hashlib.sha256(data).hexdigest();target=old.with_name(f'{tid}.{h[:12]}.json');target.write_bytes(data);old.unlink();ref.update(url='/town-surfaces/v2/lots/'+target.name,bytes=len(data),sha256=h)
index['stats'].update(lotPacketBytes=sum(r['bytes']for r in index['lotAssets'].values()),treeIslandAnchors=sum(len(r['treeIslands'])for r in audit['lots']),mulchDisks=sum(sum(t['radiusM']>0 for t in r['treeIslands'])for r in audit['lots']));bb=(json.dumps(index,separators=(',',':'))+'\n').encode();(PUBLIC/'index.json').write_bytes(bb);p=ROOT/'output/mask-audit.json';d=json.loads(p.read_text());d.update(indexSha256=hashlib.sha256(bb).hexdigest(),stats=index['stats']);p.write_text(json.dumps(d,separators=(',',':'))+'\n');(ROOT/'qa/tree-islands.json').write_text(json.dumps({'policy':audit['treeIslandPolicy'],'verifiedSourceTreeFiles':len(refs),'sourceTreeAnchors':len(points),'selectedAnchors':len(islandRows),'rows':islandRows},indent=2)+'\n');print(index['stats']);print('INDEX',hashlib.sha256(bb).hexdigest())
