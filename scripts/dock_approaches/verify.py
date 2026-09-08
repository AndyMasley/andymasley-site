"""Independent planar/height checks of the actual emitted dock decks."""
import gzip,json,math
from pathlib import Path
import numpy as np
from shapely.geometry import Polygon,LineString
from shapely.ops import unary_union
root=Path(__file__).resolve().parents[2];work=Path('/private/tmp/webster-finished-game/dock-approaches');data=json.loads((root/'data/derived/town/dock-approaches.json').read_text());rows=[]
def model(t):
 t=np.array(t);return t[0,:2],np.linalg.solve(np.column_stack([t[:,:2]-t[0,:2],np.ones(3)]),t[:,2])
def at(m,p):return (np.array(p)-m[0])@m[1][:2]+m[1][2]
expected=unary_union([Polygon(o['outline'])for o in data['objects']]);network=json.loads(gzip.decompress((root/'data/derived/town/engine-network.json.gz').read_bytes()));roadClearance=min(expected.distance(LineString([p[:2]for p in e['points']]))-e.get('width_m',6)/2 for e in network['edges']);assert roadClearance>3
for level in range(3):
 decks=[];minimum=1000;samples=0
 for tile in data['tiles']:
  output=json.load(gzip.open(work/f'emitted-{tile}-{level}.json.gz'));triangles=[r['triangle']for r in output if'| door |'in r['material']];decks+=triangles
  terrain=json.load(gzip.open(work/f'{tile}-{level}.json.gz'))['terrain']
  for tri in triangles:
   deck=Polygon(np.array(tri)[:,:2]);dm=model(tri)
   for t in terrain:
    p=Polygon(np.array(t)[:,:2]);overlap=p.intersection(deck)
    if overlap.area<1e-9 or p.area<1e-9:continue
    parts=[overlap]if overlap.geom_type=='Polygon'else[g for g in getattr(overlap,'geoms',[])if g.geom_type=='Polygon'];tm=model(t)
    for part in parts:
     for q in part.exterior.coords:minimum=min(minimum,float(at(dm,q)-at(tm,q)));samples+=1
 actual=unary_union([Polygon(np.array(t)[:,:2])for t in decks]);missing=expected.difference(actual.buffer(.0001)).area;extra=actual.difference(expected.buffer(.0001)).area;assert missing<1e-7 and extra<1e-7;assert minimum>.064
 rows.append({'level':level,'triangles':len(decks),'supportIntersectionVertices':samples,'minimumTerrainClearanceM':minimum,'missingAreaBeyond01mmM2':missing,'extraAreaBeyond01mmM2':extra,'deckAreaM2':actual.area,'minimumMappedRoadEdgeClearanceM':roadClearance})
result={'passed':True,'rows':rows};(work/'surface-proof.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result,indent=2))
