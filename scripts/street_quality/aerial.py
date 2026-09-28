import argparse,json,gzip,math,urllib.request
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from pyproj import Transformer
from PIL import Image,ImageDraw
p=argparse.ArgumentParser();p.add_argument('--out',type=Path,required=True);p.add_argument('--buildings',type=Path,required=True);p.add_argument('--name',required=True);p.add_argument('--east',type=float,required=True);p.add_argument('--north',type=float,required=True);a=p.parse_args();a.out.mkdir(exist_ok=True,parents=True)
network=json.load(gzip.open('data/derived/town/engine-network.json.gz','rt'));origin=network['origin_projected_m'];project=Transformer.from_crs(6491,3857,always_xy=True);geo=Transformer.from_crs(4326,3857,always_xy=True)
x,y=project.transform(origin[0]+a.east,origin[1]+a.north);res=.14929107082380833;side=256*res;zero=20037508.342787;c=int((x+zero)/side);r=int((zero-y)/side)
service='https://tiles2.arcgis.com/tiles/hGdibHYSPO59RG1h/arcgis/rest/services/Massachusetts_Aerial_Imagery_2025/MapServer';jobs=[(row,col)for row in range(r-3,r+4)for col in range(c-3,c+4)]
def acquire(v):
 row,col=v;f=a.out/f'20-{row}-{col}.jpg'
 if not f.exists():f.write_bytes(urllib.request.urlopen(f'{service}/tile/20/{row}/{col}',timeout=60).read())
 return f
with ThreadPoolExecutor(max_workers=4) as pool:list(pool.map(acquire,jobs))
im=Image.new('RGB',(1792,1792))
for row,col in jobs:im.paste(Image.open(a.out/f'20-{row}-{col}.jpg'),((col-c+3)*256,(row-r+3)*256))
meta={'service':service,'date':'2025 aerial imagery','epsg':3857,'minx':(c-3)*side-zero,'maxy':zero-(r-3)*side,'resolution':res,'origin':origin}
(a.out/f'{a.name}.json').write_text(json.dumps(meta,indent=2));im.save(a.out/f'{a.name}.jpg');draw=ImageDraw.Draw(im)
def pix(v):return((v[0]-meta['minx'])/res,(meta['maxy']-v[1])/res)
for f in json.load(open(a.buildings))['features']:
 g=f['geometry'];polys=g['coordinates'] if g['type']=='MultiPolygon' else [g['coordinates']]
 for poly in polys:
  pts=[pix(geo.transform(*p[:2]))for p in poly[0]]
  if any(0<x<1792 and 0<y<1792 for x,y in pts):draw.line(pts+[pts[0]],fill='yellow',width=2)
seen=set()
for e in network['edges']:
 if e['physical_id'] in seen:continue
 seen.add(e['physical_id']);pts=[pix(project.transform(origin[0]+p[0],origin[1]+p[1]))for p in e['points']]
 if any(0<x<1792 and 0<y<1792 for x,y in pts):draw.line(pts,fill='cyan',width=3);draw.text(pts[len(pts)//2],str(e['id'])+' '+str(e.get('name','')),fill='black',stroke_width=1,stroke_fill='white')
im.save(a.out/f'{a.name}-overlay.jpg');print(a.name)
