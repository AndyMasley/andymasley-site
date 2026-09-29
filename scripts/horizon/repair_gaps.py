"""Fill only independently detected 3DEP gaps from a second official DEM product."""
from __future__ import annotations
import argparse,json,urllib.parse
from pathlib import Path
import numpy as np
import rasterio
from scipy.ndimage import map_coordinates,label,find_objects
from acquire import USGS,ORIGIN,read,sha,export

def main():
 p=argparse.ArgumentParser();p.add_argument('--out',type=Path,required=True);args=p.parse_args();out=args.out
 acquisition=json.loads((out/'acquisition.json').read_text());query=json.loads((out/'usgs-selected-products-query.json').read_text())['url'];params=dict(urllib.parse.parse_qsl(query.split('?',1)[1]));params['where']="URL LIKE '%/1/TIFF/%'";url=USGS+'/query?'+urllib.parse.urlencode(params);catalog=out/'usgs-fallback-products.json'
 if not catalog.exists():catalog.write_bytes(read(url))
 product=json.loads(catalog.read_text())
 if product.get('exceededTransferLimit')or not product.get('features'):raise ValueError('Incomplete fallback catalog')
 if any(r['attributes']['VerticalDatum']!='North American Vertical Datum of 1988 (NAVD 88)'for r in product['features']):raise ValueError('Unexpected fallback datum')
 with rasterio.open(out/'noaa-coast-300km.tif')as ds:noaa=ds.read(1)
 patches=[];audits=[]
 for i in range(4):
  with rasterio.open(out/f'usgs-locked-{i}.tif')as ds:height=ds.read(1)
  bad=np.zeros(height.shape,bool);positive=0
  for start in range(0,3000,100):
   yy,xx=np.where(np.abs(height[start:start+100])<.00001);yy+=start
   b=map_coordinates(noaa,[yy*.2-.4+(600 if i<2 else 0),xx*.2-.4+(600 if i%2 else 0)],order=1,mode='nearest')
   x=xx*100+50+(-300000 if i%2==0 else 0);y=(0 if i<2 else 300000)-yy*100-50
   suspect=(b>5)&(x*x+y*y<300000**2);positive+=int(suspect.sum());bad[yy[suspect],xx[suspect]]=True
  labels,count=label(bad);sizes=np.bincount(labels.ravel());rows=[]
  for ident,window in enumerate(find_objects(labels),1):
   pixels=int(sizes[ident]);rows.append(pixels)
   if pixels<=128:continue
   # Broader than the coarse NOAA coastline's isolated disagreements. These
   # source-data holes are explicit: a fallback raster must supply their land.
   yy,xx=window;left=xx.start*100+(-300000 if i%2==0 else 0);right=xx.stop*100+(-300000 if i%2==0 else 0);top=(0 if i<2 else 300000)-yy.start*100;bottom=(0 if i<2 else 300000)-yy.stop*100
   bounds=[left-100,bottom-100,right+100,top+100];tag=f'usgs-fallback-gap-{i}-{ident}';record=export(out,tag,USGS,bounds,100);patches.append({'file':tag+'.tif','quadrant':i,'suspectPixels':pixels,**record})
  audits.append({'quadrant':i,'zeroOnPositiveNOAAPixelsWithinRadius':positive,'componentPixelsDescending':sorted(rows,reverse=True),'repairThresholdPixels':128})
 acquisition['gapRepairs']={'policy':'Only original zero-height cells inside identified inland patches use separatelypinned USGS1arcsecond height. Unchanged valid terrain and NOAA-derived nominal sea.','selectedProducts':{'query':url,'sha256':sha(catalog.read_bytes()),'products':[r['attributes']for r in product['features']]},'patches':patches,'zeroAudit':audits}
 (out/'acquisition.json').write_text(json.dumps(acquisition,indent=2)+'\n');print(json.dumps({'patches':len(patches),'zeroAudit':audits},indent=2))
if __name__=='__main__':main()
