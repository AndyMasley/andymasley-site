"""Pin a bounded regional canopy/landcover window from official MRLC WCS.
2025 NLCD/USFS canopy percentages; not individually surveyed trees or heights.
Raw native30m exports and exact nearest-neighbor reprojections stay external.
"""
from __future__ import annotations
import argparse,hashlib,json,math,time,urllib.parse,urllib.request,xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import numpy as np
import rasterio
from rasterio.transform import from_origin
from rasterio.warp import transform_bounds,reproject,Resampling
ORIGIN=[171282.3328920724,867589.2761750807]
BOUNDS=[-40020.,-40020.,40020.,40020.]
SPACING=30
YEAR=2025
LAYERS={
 'canopy':'NLCD-Tree-Canopy-Native_conus_year_data',
 'landcover':'Land-Cover-Native_conus_year_data',
 'impervious_descriptor':'Impervious-Descriptor-Native_conus_year_data',
 'impervious_fraction':'Fractional-Impervious-Surface-Native_conus_year_data',
}
LEGEND={11:'Open water',12:'Perennial ice/snow',21:'Developed open space',22:'Developed low intensity',23:'Developed medium intensity',24:'Developed high intensity',31:'Barren land',41:'Deciduous forest',42:'Evergreen forest',43:'Mixed forest',52:'Shrub/scrub',71:'Grassland/herbaceous',81:'Pasture/hay',82:'Cultivated crops',90:'Woody wetlands',95:'Emergent herbaceous wetlands'}
DOCUMENTATION=[
 'https://www.mrlc.gov/data-services-page',
 'https://www.mrlc.gov/data/legends/annual-nlcd-land-cover-legend',
 'https://www.mrlc.gov/data/type/impervious-descriptor',
 'https://www.usgs.gov/data/annual-national-land-cover-database-nlcd-collection-1-products',
 'https://www.mrlc.gov/data',
]
def sha(raw):return hashlib.sha256(raw).hexdigest()
def read(url):
 error=None
 for attempt in range(3):
  try:
   req=urllib.request.Request(url,headers={'User-Agent':'Webster-Regional-Canopy-Source-Acquisition/1.0'})
   with urllib.request.urlopen(req,timeout=90)as response:return response.read()
  except Exception as exc:error=exc;time.sleep(attempt+1)
 raise error

def acquire(out,role,layer,extent):
 tag=f'{role}-{YEAR}';rawfile=out/(tag+'-native5070.tif');recordfile=out/(tag+'-source.json');workspace='mrlc_'+layer;service=f'https://dmsdata.cr.usgs.gov/geoserver/{workspace}/ows'
 if rawfile.exists()and recordfile.exists():
  record=json.loads(recordfile.read_text())
  if sha(rawfile.read_bytes())!=record['sha256']:raise ValueError('Cached source changed: '+tag)
  return role,record
 metadata={}
 for kind,query in [('capabilities',{'service':'WMS','request':'GetCapabilities','version':'1.3.0'}),('description',{'service':'WCS','request':'DescribeCoverage','version':'2.0.1','coverageId':workspace+'__'+layer})]:
  url=service+'?'+urllib.parse.urlencode(query);content=read(url);ET.fromstring(content)
  if b'2025-01-01'not in content:raise ValueError('Requested2025time absent from service metadata')
  name=tag+'-'+kind+'.xml';(out/name).write_bytes(content);metadata[kind]={'file':name,'sha256':sha(content),'url':url}
 # WCS2 temporal subsets currently fail server-side. WCS1.0 TIME works and
 # returns raw class/percent values, not colored WMS pixels.
 params={'service':'WCS','version':'1.0.0','request':'GetCoverage','coverage':layer,'CRS':'EPSG:5070','BBOX':','.join(map(str,extent)),'FORMAT':'GeoTIFF','RESX':30,'RESY':30,'TIME':'2025-01-01T00:00:00Z'}
 url=service+'?'+urllib.parse.urlencode(params);raw=read(url)
 if raw[:2]not in [b'II',b'MM']:raise ValueError('WCS returned non-raster: '+raw[:1000].decode(errors='replace'))
 rawfile.write_bytes(raw)
 with rasterio.open(rawfile)as src:
  a=src.read(1)
  if src.count!=1 or src.crs.to_epsg()!=5070 or src.dtypes[0]!='uint8' or abs(src.res[0]-30)>.001 or abs(src.res[1]-30)>.001:raise ValueError('Unexpected native raster layout')
  unique,counts=np.unique(a,return_counts=True);hist={int(k):int(v)for k,v in zip(unique,counts)}
  if role=='landcover'and not set(hist).issubset(set(LEGEND)|{0}):raise ValueError('Unknown landcover classes')
  if role=='impervious_descriptor'and not set(hist).issubset({0,1,2,255}):raise ValueError('Unknown impervious descriptor classes')
  if role in ['canopy','impervious_fraction']and any(k>100 and k!=255 for k in hist):raise ValueError('Unexpected percent/nodata code')
  record={'year':YEAR,'role':role,'service':service,'query':url,'time':'2025-01-01T00:00:00Z','fetchedAt':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'file':rawfile.name,'bytes':len(raw),'sha256':sha(raw),'sourceCRS':'EPSG:5070','sourceBounds':list(src.bounds),'transform':list(src.transform)[:6],'shape':list(a.shape),'resolutionM':list(src.res),'dtype':'uint8','nodata':src.nodata,'counts':hist,'metadata':metadata}
 recordfile.write_text(json.dumps(record,indent=2)+'\n');print(role,'native',record['shape'],len(raw),'bytes',flush=True);return role,record

def main():
 p=argparse.ArgumentParser();p.add_argument('--out',type=Path,required=True);args=p.parse_args();out=args.out;out.mkdir(parents=True,exist_ok=True)
 projected=[BOUNDS[0]+ORIGIN[0],BOUNDS[1]+ORIGIN[1],BOUNDS[2]+ORIGIN[0],BOUNDS[3]+ORIGIN[1]];extent=transform_bounds('EPSG:6491','EPSG:5070',*projected,densify_pts=41)
 # All four products share a30m lattice whose pixel edges are15mod30.
 extent=[math.floor((extent[0]-15)/30)*30+15-60,math.floor((extent[1]-15)/30)*30+15-60,math.ceil((extent[2]-15)/30)*30+15+60,math.ceil((extent[3]-15)/30)*30+15+60]
 if (extent[2]-extent[0])*(extent[3]-extent[1])/900>16000000:raise ValueError('Bounded source request exceeds pixel budget')
 with ThreadPoolExecutor(max_workers=2)as pool:records=dict(pool.map(lambda row:acquire(out,row[0],row[1],extent),LAYERS.items()))
 transform=from_origin(projected[0],projected[3],SPACING,SPACING);size=round((BOUNDS[2]-BOUNDS[0])/SPACING);arrays={};derived={}
 for role,record in records.items():
  with rasterio.open(out/record['file'])as source:
   fill=0 if role in ['landcover','impervious_descriptor'] else 255;a=np.full((size,size),fill,np.uint8)
   reproject(source=rasterio.band(source,1),destination=a,src_transform=source.transform,src_crs=source.crs,dst_transform=transform,dst_crs='EPSG:6491',resampling=Resampling.nearest,src_nodata=source.nodata,dst_nodata=fill,num_threads=1)
  if role=='landcover'and np.any(a==0):raise ValueError('Regional source window has unclassified landcover pixels')
  name=f'{role}-{YEAR}-epsg6491.tif';file=out/name
  with rasterio.open(file,'w',driver='GTiff',width=size,height=size,count=1,dtype='uint8',crs='EPSG:6491',transform=transform,nodata=fill if role!='impervious_descriptor'else None,tiled=True,compress='deflate',predictor=2)as target:target.write(a,1)
  arrays[role]=a;unique,counts=np.unique(a,return_counts=True);derived[role]={'file':name,'bytes':file.stat().st_size,'sha256':sha(file.read_bytes()),'sourceSha256':record['sha256'],'counts':{int(k):int(v)for k,v in zip(unique,counts)},'resampling':'nearest-neighbor; preserves categorical/percentage source values'}
 archive=out/'regional-landcover.npz';np.savez_compressed(archive,**arrays,local_bounds=np.array(BOUNDS),origin=np.array(ORIGIN),spacing=np.array(SPACING))
 forest=np.isin(arrays['landcover'],[41,42,43]);wetland=arrays['landcover']==90;known=arrays['canopy']<=100;potential=(forest|wetland)&known&(arrays['canopy']>=20)&(arrays['impervious_descriptor']==0)&(arrays['impervious_fraction']<=5)
 report={'version':1,'referenceYear':YEAR,'referenceYearMeaning':'2025 is the modeled annual map reference year, not a claim that every pixel was photographed or surveyed in 2025. The producer combines satellite imagery and interpreted/model training data across dates.','source':'USDA Forest Service National Tree Canopy Cover and USGS Annual NLCD Collection1.2 via officialMRLC WCS','origin':ORIGIN,'crs':'EPSG:6491','sourceCRS':'EPSG:5070','localBounds':BOUNDS,'projectedBounds':projected,'spacingM':SPACING,'shape':[size,size],'rowOrder':'north-up; row0atmaximumcanonicalnorth','worldCoordinates':'worldX=canonicaleast;worldZ=-canonicalnorth; pixelcenter=[xmin+(col+.5)*30,ymax-(row+.5)*30]','records':records,'derived':derived,'archive':{'file':archive.name,'bytes':archive.stat().st_size,'sha256':sha(archive.read_bytes()),'keys':list(arrays)+['local_bounds','origin','spacing']},'legends':{'landcover':LEGEND,'canopy':'0..100 estimated tree-canopy percent;255nodata','impervious_descriptor':{0:'Not labeled road/urban (source legend calls NoData); pair with valid landcover before interpreting',1:'Roads',2:'Urban'},'impervious_fraction':'0..100 estimated impervious percent;255nodata'},'summary':{'pixels':size*size,'areaKm2':size*size*SPACING**2/1e6,'forestClassPercent':float(forest.mean()*100),'woodyWetlandClassPercent':float(wetland.mean()*100),'meanTreeCanopyPercentValid':float(arrays['canopy'][known].mean()),'waterClassPercent':float((arrays['landcover']==11).mean()*100),'roadClassPercent':float((arrays['impervious_descriptor']==1).mean()*100),'potentialCanopyPercent':float(potential.mean()*100),'potentialCanopyRule':'Illustrative eligibility only:forest41/42/43orwoodywetland90;TCC>=20%;descriptor0;impervious<=5%. Geometrybaker must apply actualwater/roadfootprintandboundaryclearance.'},'documentation':DOCUMENTATION,'license':'USGS Annual NLCD has no restrictions on use; source-agency acknowledgments retained.','citation':'U.S. Geological Survey(USGS),2024,Annual NLCD Collection1 ScienceProducts,version1.2June2026,doi:10.5066/P94UXNTS; USDAForestService NationalTreeCanopyCover1985–2025 releaseAugust4,2026.','limitations':['Canopy is modeled area percentage at 30 m, not surveyed individual tree centers, species, heights, or a pixel-specific imagery acquisition date.','The modeled 2025 annual classification may differ from the 2021 LiDAR survey used for town trees and from current vegetation; annual reference years are not individual-pixel survey dates.','Thirty-meter roads/water/openland masks may miss narrow roads, shorelines or smallclearings; preserve exact near-field mappedexclusions.','Woodywetlands are not openwater, but must still respect actualsourcewaterfootprints and anydry-land rule.','Nearest-neighbor reprojection shifts sourcepixelboundaries; no source resolution or accuracy improvement is claimed.'],'acquisitionScriptSha256':sha(Path(__file__).read_bytes())}
 (out/'landcover-provenance.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report['summary'],indent=2),flush=True)
if __name__=='__main__':main()
