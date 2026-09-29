"""Pin real regional DEM exports; raw rasters are external, never shipped.
Requires numpy, rasterio. No arbitrary no-data replacement is permitted.
"""
from __future__ import annotations
import argparse,hashlib,io,json,subprocess,time,urllib.parse
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import numpy as np
import rasterio
from rasterio.transform import from_origin
from rasterio.io import MemoryFile
from pyproj import Transformer
ORIGIN=[171282.3328920724,867589.2761750807]
USGS='https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer'
NOAA='https://gis.ngdc.noaa.gov/arcgis/rest/services/DEM_mosaics/DEM_global_mosaic/ImageServer'

def sha(raw):return hashlib.sha256(raw).hexdigest()
def read(url):
 p=subprocess.run(['curl','--fail','--location','--silent','--show-error','--retry','3','--retry-delay','1','--max-time','120',url],capture_output=True)
 if p.returncode:raise RuntimeError(p.stderr.decode())
 return p.stdout

def export(out,tag,service,local,spacing):
 target=out/(tag+'.tif');report=out/(tag+'.json')
 if target.exists()and report.exists():
  row=json.loads(report.read_text());raw=target.read_bytes()
  if sha(raw)!=row['sha256']:raise RuntimeError('Cached DEM hash mismatch: '+tag)
  # GDAL handles sparse TIFF zero-offset tiles correctly; Pillow does not.
  with MemoryFile(raw) as mem, mem.open() as dataset:a=dataset.read(1)
  valid=np.isfinite(a)&(a>-12000)&(a<9000)
  row.update(validCount=int(valid.sum()),noDataCount=int((~valid).sum()),rangeValidM=[float(a[valid].min()),float(a[valid].max())],reader='rasterio/GDAL; sparse TIFF supported')
  report.write_text(json.dumps(row,indent=2)+'\n')
  print('Cached',tag,flush=True);return row
 size=[round((local[2]-local[0])/spacing),round((local[3]-local[1])/spacing)]
 bbox=[local[0]+ORIGIN[0],local[1]+ORIGIN[1],local[2]+ORIGIN[0],local[3]+ORIGIN[1]]
 q={'bbox':','.join(map(str,bbox)),'bboxSR':6491,'imageSR':6491,'size':','.join(map(str,size)),'format':'tiff','pixelType':'F32','interpolation':'RSP_BilinearInterpolation','renderingRule':'{"rasterFunction":"None"}','f':'json','_request':int(time.time())}
 if service==USGS:
  product_file='usgs-fallback-products.json'if tag.startswith('usgs-fallback-')else'usgs-selected-products.json'
  ids=[r['attributes']['OBJECTID']for r in json.loads((out/product_file).read_text())['features']]
  q['mosaicRule']=json.dumps({'mosaicMethod':'esriMosaicLockRaster','lockRasterIds':ids,'mosaicOperation':'MT_FIRST'})
 url=service+'/exportImage?'+urllib.parse.urlencode(q);meta=json.loads(read(url))
 if 'error'in meta:raise RuntimeError(meta['error'])
 raw=read(meta['href'])
 with MemoryFile(raw) as mem, mem.open() as dataset:a=dataset.read(1)
 if a.shape!=tuple(reversed(size))or a.ndim!=2:raise RuntimeError('Wrong DEM shape')
 valid=np.isfinite(a)&(a>-12000)&(a<9000)
 if not valid.any():raise RuntimeError('Empty DEM')
 target.write_bytes(raw)
 row={'service':service,'query':url,'fetchedAt':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'export':meta,'sha256':sha(raw),'bytes':len(raw),'size':size,'localBounds':local,'spacingM':spacing,'crs':'EPSG:6491','validCount':int(valid.sum()),'noDataCount':int((~valid).sum()),'rangeValidM':[float(a[valid].min()),float(a[valid].max())]}
 report.write_text(json.dumps(row,indent=2)+'\n');print(tag,size,row['rangeValidM'],row['noDataCount'],flush=True);return row

def quadrant(out,tag,service,local,spacing):
 if service!=USGS or (out/(tag+'.tif')).exists():return export(out,tag,service,local,spacing)
 # Large explicitlylocked mosaics exceed the public service's processing
 # timeout. Smaller exports are stitched without resampling or height changes.
 size=round((local[2]-local[0])/spacing);canvas=np.empty((size,size),np.float32);parts=[]
 for row in range(3):
  for col in range(3):
   xmin=local[0]+col*100000;ymax=local[3]-row*100000;b=[xmin,ymax-100000,xmin+100000,ymax]
   name=f'{tag}-part-{row}-{col}';record=export(out,name,service,b,spacing);parts.append({'file':name+'.tif',**record})
   with rasterio.open(out/(name+'.tif'))as ds:canvas[row*1000:(row+1)*1000,col*1000:(col+1)*1000]=ds.read(1)
 target=out/(tag+'.tif')
 with rasterio.open(target,'w',driver='GTiff',width=size,height=size,count=1,dtype='float32',crs='EPSG:6491',transform=from_origin(local[0]+ORIGIN[0],local[3]+ORIGIN[1],spacing,spacing),tiled=True,compress='deflate')as ds:ds.write(canvas,1)
 raw=target.read_bytes();valid=np.isfinite(canvas)&(canvas>-12000)&(canvas<9000);record={'service':service,'method':'3x3exact pixelgrid assembly; no resampling','parts':parts,'sha256':sha(raw),'bytes':len(raw),'size':[size,size],'localBounds':local,'spacingM':spacing,'crs':'EPSG:6491','validCount':int(valid.sum()),'noDataCount':int((~valid).sum()),'rangeValidM':[float(canvas[valid].min()),float(canvas[valid].max())]}
 (out/(tag+'.json')).write_text(json.dumps(record,indent=2)+'\n');return record

def main():
 p=argparse.ArgumentParser();p.add_argument('--out',type=Path,required=True);args=p.parse_args();out=args.out;out.mkdir(parents=True,exist_ok=True)
 for name,service in [('usgs',USGS),('noaa',NOAA)]:
  target=out/(name+'-service.json')
  if not target.exists():target.write_bytes(read(service+'?f=pjson'))
 # Explicit raster locking bypasses each source product's display MaxPS, so
 # the requested100m export remains actual1/3arcsecond samples at all scales.
 tr=Transformer.from_crs(6491,4326,always_xy=True)
 corners=[tr.transform(ORIGIN[0]+x,ORIGIN[1]+y)for x in [-300000,300000]for y in [-300000,300000]]
 envelope=dict(xmin=min(x for x,y in corners),ymin=min(y for x,y in corners),xmax=max(x for x,y in corners),ymax=max(y for x,y in corners))
 query={'where':"URL LIKE '%/13/%'",'geometry':json.dumps(envelope),'geometryType':'esriGeometryEnvelope','inSR':4326,'spatialRel':'esriSpatialRelIntersects','outFields':'OBJECTID,Dataset_ID,DEM_Type,VerticalDatum,AcquisitionDate,Source,URL,pubdate,title,Resolution_X,Resolution_Y','returnGeometry':'false','resultRecordCount':2000,'f':'json'}
 url=USGS+'/query?'+urllib.parse.urlencode(query)
 product_file=out/'usgs-selected-products.json'
 if not product_file.exists():product_file.write_bytes(read(url));(out/'usgs-selected-products-query.json').write_text(json.dumps({'url':url}))
 products=json.loads(product_file.read_text())
 if products.get('error')or products.get('exceededTransferLimit')or not products.get('features'):raise RuntimeError('Incomplete source product inventory')
 if any(r['attributes']['VerticalDatum']!='North American Vertical Datum of 1988 (NAVD 88)'for r in products['features']):raise RuntimeError('Unexpected source vertical datum')
 bounds=[[-300000,-300000,0,0],[0,-300000,300000,0],[-300000,0,0,300000],[0,0,300000,300000]]
 jobs=[('usgs-locked-'+str(i),USGS,b,100)for i,b in enumerate(bounds)]
 # NOAA bathymetry only classifies coastal USGS no-data; it does not replace
 # the finer USGS land model or infer ocean solely from missing elevations.
 jobs.append(('noaa-coast-300km',NOAA,[-300000,-300000,300000,300000],500))
 with ThreadPoolExecutor(max_workers=2)as pool:rows=list(pool.map(lambda job:quadrant(out,*job),jobs))
 manifest={'version':1,'origin':ORIGIN,'radiusM':300000,'sources':rows,'metadata':{name:{'sha256':sha((out/(name+'-service.json')).read_bytes()),'url':service+'?f=pjson'}for name,service in [('usgs',USGS),('noaa',NOAA)]},'selectedProducts':{'file':product_file.name,'sha256':sha(product_file.read_bytes()),'query':url,'count':len(products['features']),'products':[r['attributes']for r in products['features']]},'documentation':['https://www.usgs.gov/faqs/what-projection-horizontal-datum-vertical-datum-and-resolution-a-usgs-digital-elevation-model','https://www.ncei.noaa.gov/products/etopo-global-relief-model'],'limitations':['The export spacing is not a claim about survey resolution or accuracy. USGS seamless 1/3 arcsecond mosaic contains different survey vintages. The product filter avoids holes in the multiresolution lidar mosaic.','NOAA bathymetry is used only to establish sea fill for offshore 3DEP no-data; any missing positive NOAA land is a hard error.','Raw USGS elevations use NAVD88 in CONUS; ocean is nominal mean sea level, not a tide simulation.']}
 (out/'acquisition.json').write_text(json.dumps(manifest,indent=2)+'\n')
if __name__=='__main__':main()
