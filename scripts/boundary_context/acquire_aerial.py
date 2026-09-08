"""Cache public 2025 MassGIS aerial samples for neighboring scenery registration."""
import argparse,hashlib,json,math,time
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from pyproj import Transformer
from shapely.geometry import box,shape
from acquire import read_url
SERVICE='https://tiles.arcgis.com/tiles/hGdibHYSPO59RG1h/arcgis/rest/services/Massachusetts_Aerial_Imagery_2025/MapServer'
p=argparse.ArgumentParser();p.add_argument('--work',type=Path,required=True);a=p.parse_args();out=a.work/'sources/aerial';out.mkdir(exist_ok=True)
bounds=shape(json.loads((a.work/'webster-local.geojson').read_text())).buffer(1100).bounds
tr=Transformer.from_crs(6491,3857,always_xy=True);origin=[171282.3328920724,867589.2761750807];extent=[tr.transform(x+origin[0],y+origin[1])for x,y in[(bounds[0],bounds[1]),(bounds[2],bounds[3])]]
span=40075016.68557849/32768;half=20037508.342789244
xs=range(math.floor((extent[0][0]+half)/span),math.floor((extent[1][0]+half)/span)+1);ys=range(math.floor((half-extent[1][1])/span),math.floor((half-extent[0][1])/span)+1)
def fetch(row):
 x,y=row;dest=out/f'{x}_{y}.jpg';url=f'{SERVICE}/tile/15/{y}/{x}'
 old=Path('/Users/andy/Documents/New project/webster-blender/imagery-cache/15')/dest.name
 try:
  raw=dest.read_bytes()if dest.exists()else old.read_bytes()if old.exists()else read_url(url)
  if not raw.startswith(b'\xff\xd8'):raise ValueError('No photographic JPEG coverage')
  dest.write_bytes(raw);return{'x':x,'y':y,'url':url,'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest()}
 except Exception as e:return{'x':x,'y':y,'url':url,'unavailable':str(e)}
with ThreadPoolExecutor(max_workers=4)as pool:rows=list(pool.map(fetch,[(x,y)for x in xs for y in ys]))
(a.work/'sources/aerial-provenance.json').write_text(json.dumps({'service':SERVICE,'source':'MassGIS Massachusetts Aerial Imagery 2025, public government imagery; unavailable tiles are not replaced with claimed observation.','fetchedAt':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'rows':rows},indent=2)+'\n')
print(json.dumps({'tiles':len(rows),'available':sum('unavailable'not in r for r in rows)}))
