"""Cache an exact floating-point USGS 3DEP context elevation raster.
Inputs and metadata stay local; only derived non-drivable geometry is shipped.
"""
import argparse,hashlib,io,json,math,time,urllib.parse
from pathlib import Path
import numpy as np
from PIL import Image
from acquire import read_url
SERVICE='https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer'
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--out',type=Path,required=True);a=p.parse_args();a.out.mkdir(parents=True,exist_ok=True)
 origin=[171282.3328920724,867589.2761750807];local=[-5360,-5720,5360,5680];spacing=4
 bbox=[local[0]+origin[0],local[1]+origin[1],local[2]+origin[0],local[3]+origin[1]];size=[round((local[2]-local[0])/spacing),round((local[3]-local[1])/spacing)]
 meta=read_url(SERVICE+'?f=json');(a.out/'dem-service.json').write_bytes(meta)
 q={'bbox':','.join(map(str,bbox)),'bboxSR':6491,'imageSR':6491,'size':','.join(map(str,size)),'format':'tiff','pixelType':'F32','noDataInterpretation':'esriNoDataMatchAny','interpolation':'RSP_BilinearInterpolation','renderingRule':json.dumps({'rasterFunction':'None'}),'f':'json'}
 url=SERVICE+'/exportImage?'+urllib.parse.urlencode(q);export=json.loads(read_url(url));
 if 'error'in export:raise RuntimeError(export['error'])
 (a.out/'dem-export.json').write_text(json.dumps(export,indent=2)+'\n');raw=read_url(export['href']);image=Image.open(io.BytesIO(raw));heights=np.asarray(image,dtype=np.float32)
 if image.size!=tuple(size)or heights.ndim!=2 or not np.isfinite(heights).all()or heights.min()<50 or heights.max()>600:raise RuntimeError(f'Invalid bare-earth DEM: {image.size}, {heights.shape}, {heights.min()}, {heights.max()}')
 (a.out/'context-dem.tif').write_bytes(raw)
 np.savez_compressed(a.out/'context-dem.npz',heights=heights,local_bounds=np.array(local),origin=np.array(origin),spacing=np.array(spacing))
 report={'service':SERVICE,'query':url,'fetchedAt':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'sha256':hashlib.sha256(raw).hexdigest(),'bytes':len(raw),'size':size,'localBounds':local,'spacingM':spacing,'sourceMosaic':'USGS 3DEP current mosaic, raster function disabled; export spacing is not a claim about survey resolution.','rangeNAVD88M':[float(heights.min()),float(heights.max())],'crs':'EPSG:6491','verticalCheckRequired':'Compare fixed source in-town ground samples before context seam use.'}
 (a.out/'dem-provenance.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))
