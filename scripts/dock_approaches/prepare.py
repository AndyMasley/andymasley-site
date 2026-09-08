"""Complete two mapped dock lines between retained floating decks and source land.
Run export.mjs first; exact source terrain over all LODs bounds each inferred deck.
"""
import json,gzip,math,hashlib,os
from pathlib import Path
import numpy as np
from shapely.geometry import Polygon,LineString,box
from shapely.ops import unary_union
from pyproj import Transformer
root=Path(__file__).resolve().parents[2];work=Path(os.environ.get('DOCK_APPROACH_WORK','/private/tmp/webster-finished-game/dock-approaches'));source=root/'data/derived/town/additional-environment-sources/final-mapped-facilities.json';raw=source.read_bytes();ways={r['id']:r for r in json.loads(raw)['response']['elements']};project=Transformer.from_crs(4326,6491,always_xy=True);origin=np.array([171282.3328920724,867589.2761750807]);inputs={};tiles={};objects=[];proof=[]
for tile in ['2_-3','2_-4']:
 inputs[tile]=[json.load(gzip.open(work/f'{tile}-{l}.json.gz'))for l in range(3)];tiles[tile]={'origin':inputs[tile][0]['origin'],'levels':[{'level':l,'sourceSha256':d['sourceSha256'],'guards':d['guards']}for l,d in enumerate(inputs[tile])]}
for way,lo,hi,reverse in [(1094899385,4,None,False),(1094899388,0,8,True)]:
 line=LineString([np.array(project.transform(p['lon'],p['lat']))-origin for p in ways[way]['geometry']]);hi=hi or line.length;a=np.array(line.interpolate(lo).coords[0]);b=np.array(line.interpolate(hi).coords[0]);
 if reverse:a,b=b,a
 length=float(np.linalg.norm(b-a));t=(b-a)/length;n=np.array([t[1],-t[0]]);outline=Polygon([a-n*.8,b-n*.8,b+n*.8,a+n*.8]);water=45.56000183105469;shore=water;samples=[]
 for levels in inputs.values():
  for row in levels:
   for triangle in row['terrain']:
    p=np.array(triangle);poly=Polygon(p[:,:2]);hit=poly.intersection(outline)
    if hit.area<1e-9 or poly.area<1e-9:continue
    coefficients=np.linalg.solve(np.column_stack([p[:,:2]-p[0,:2],np.ones(3)]),p[:,2]);parts=[hit]if hit.geom_type=='Polygon'else[g for g in getattr(hit,'geoms',[])if g.geom_type=='Polygon']
    for part in parts:
     for q in part.exterior.coords:
      fraction=float((np.array(q)-a)@t/length);height=float((np.array(q)-p[0,:2])@coefficients[:2]+coefficients[2]);samples.append((fraction,height,row['level']))
      if fraction>.02:shore=max(shore,(height+.065-water*(1-fraction))/fraction)
 slope=(shore-water)/length;assert slope<.12,(way,slope)
 for tile in inputs:
  ix,iy=map(int,tile.split('_'));piece=outline.intersection(box(ix*250,iy*250,(ix+1)*250,(iy+1)*250))
  if piece.area<.001:continue
  objects.append({'id':f'dock-approach-{way}-{tile}','wayId':way,'tileId':tile,'start':a.tolist(),'tangent':t.tolist(),'outward':n.tolist(),'length':length,'width':1.6,'waterHeight':water,'shoreHeight':shore,'outline':[list(p)for p in piece.exterior.coords[:-1]],'sourceRangeM':[lo,hi]})
 proof.append({'wayId':way,'lengthM':length,'riseM':shore-water,'grade':slope,'terrainIntersectionVertices':len(samples),'minimumTerrainClearanceM':min(water+(shore-water)*f-h for f,h,l in samples),'shoreEndMaximumStepM':max(shore-h for f,h,l in samples if f>.999),'structuralDepthM':.30})
result={'version':1,'sourceSnapshotSha256':hashlib.sha256(raw).hexdigest(),'basis':'Two source OSM pier centerlines lost their on-land approach segments to a water-only generation gate. Existing dock width and water height retained; planar deck, truss rails and longitudinal profile inferred over exact current source terrain at all LODs. No public accessibility certification, current berth operation, surveyed gangway material or new dock location is claimed.','tiles':tiles,'objects':objects};(root/'data/derived/town/dock-approaches.json').write_text(json.dumps(result,separators=(',',':'))+'\n');(work/'preparation-report.json').write_text(json.dumps({'objects':len(objects),'proof':proof},indent=2)+'\n');print(json.dumps(proof,indent=2))
