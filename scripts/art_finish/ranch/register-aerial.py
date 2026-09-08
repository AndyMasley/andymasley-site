import json,math,os
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw,ImageFont
from pyproj import Transformer
from shapely.geometry import Polygon
P=Path(os.environ.get('WEBSTER_PROJECT','/Users/andy/Documents/New project/webster-blender'));A=Path(os.environ.get('WEBSTER_ART_QA','/private/tmp/webster-finished-game/art'));(A/'ranch').mkdir(parents=True,exist_ok=True);m=json.load(open(A/'grounds/ranch-aerial.json'));origin=np.array([171282.3328920724,867589.2761750807]);proj=Transformer.from_crs(6491,4326,always_xy=True)
register=json.load(open(P/'research/data/building-register.json'));ids={r['structId']for r in register if r['parcelAddress']=='200 GORE RD'};rows=[r for r in json.load(open(P/'street-detail/building_architecture.json'))if r['struct_id']in ids]
def pixel(p):
 lon,lat=proj.transform(p[0]+origin[0],p[1]+origin[1]);x=(lon+180)/360*2**17;y=(1-math.asinh(math.tan(math.radians(lat)))/math.pi)/2*2**17;return[(x-39361)*256-m['mosaicCropPixels'][0],(y-48610)*256-m['mosaicCropPixels'][1]]
im=Image.open(A/'grounds/ranch-aerial.png').convert('RGB');d=ImageDraw.Draw(im);lookup=[]
for i,r in enumerate(sorted(rows,key=lambda r:(-r['centroid_xy'][1],r['centroid_xy'][0]))):
 pp=[tuple(v*2 for v in pixel(p))for p in r['outline_xy']];c=tuple(v*2 for v in pixel(r['centroid_xy']));d.line(pp,fill='#ffff00',width=2);d.text(c,str(i+1),fill='#ffffff',stroke_width=1,stroke_fill='#000000');report=json.load(open(str(Path(os.environ.get('WEBSTER_BUILDING_MODELS','/private/tmp/webster-realism-v2-building/townwide-assets'))/(r['struct_id']+'.report.json'))));lookup.append({'label':i+1,'id':r['struct_id'],'area':r['area_m2'],'center':r['centroid_xy'],'pixel':c,'outline':r['outline_xy'],'floor':report.get('floor_z'),'eave':report.get('eave_z'),'sourcePeak':report['bounds']['max'][1],'ground':report.get('ground_min_max_m'),'base':report.get('base_z'),'report':report})
im.save(A/'ranch/registered-aerial.png');(A/'ranch/source-rows.json').write_text(json.dumps(lookup,indent=2))
