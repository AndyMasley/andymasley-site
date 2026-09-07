from pathlib import Path
import json,hashlib,math,collections,time
import numpy as np
from PIL import Image,ImageDraw
from pyproj import Transformer
from shapely.geometry import shape,Polygon,LineString,box,mapping
from shapely.ops import unary_union
from shapely.strtree import STRtree
from rasterio.features import rasterize
from rasterio.transform import from_origin
from geometry_context import Context,rings,parts,ORIGIN,PIXEL,ASSETS
ROOT=Path(__file__).parent;OUT=ROOT/'output';PUBLIC=OUT/'public/town-surfaces/v2';PUBLIC.mkdir(parents=True,exist_ok=True)
ctx=Context();reviews=json.loads((ROOT/'sources/parking-visual-review.json').read_text());audit=json.loads((ROOT/'qa/mapped-parking-mask-audit.json').read_text());mapped={r['osmId']:r for r in audit['lots']};georef=json.loads((ROOT/'qa/site-crop-georeference.json').read_text());merc=Transformer.from_crs(3857,6491,always_xy=True);wgs=Transformer.from_crs(4326,6491,always_xy=True)
sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
def dump(p,obj):p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(obj,separators=(',',':'),ensure_ascii=False)+'\n')
def entry(poly,r):
 safe=unary_union(parts(ctx.exclude(poly)));mark=ctx.marking(safe)if r['striping']!='none'and r['material']=='asphalt'else Polygon();c=poly.centroid
 return {'id':r['id'],'tileId':f'{math.floor(c.x/250)}_{math.floor(c.y/250)}','center':[round(c.x,3),round(c.y,3)],'sourceIds':r['sourceIds'],'material':r['material'],'materialBasis':r['materialBasis'],'confidence':r['confidence'],'sourcePolygons':rings(poly),'polygons':rings(safe),'markingPolygons':rings(mark),'striping':r['striping'],'notes':[r['observation']],'sourceAreaM2':round(poly.area,3),'safeAreaM2':round(safe.area,3),'markingAreaM2':round(mark.area,3),'provenance':r['provenance']},safe
lots=[];surfaces=[];rejected=[];manual=[]
for r in reviews['mappedReviews']:
 if not r['accepted']:rejected.append({'id':r['id'],'reason':r['observation']});continue
 r={**r,'sourceIds':[f"OSM-way-{r['osmId']}"],'provenance':{'sourceUrl':r['sourceUrl'],'osmSnapshotUtc':'2026-09-07T02:55:21Z','appearanceDate':'Spring 2025','reviewFile':'sources/parking-visual-review.json'}}
 row,p=entry(shape(mapped[r['osmId']]['geometry']),r);lots.append(row);surfaces.append(p)
for r in reviews['manualPolygons']:
 g=georef[r['site']];west,south,east,north=g['boundsMercator'];width,height=g['size'];coords=[]
 for ring in r['pixelRings']:
  a=[]
  for x,y in ring:
   xx,yy=merc.transform(west+x/width*(east-west),north-y/height*(north-south));a.append((xx-ORIGIN[0],yy-ORIGIN[1]))
  coords.append(a)
 poly=Polygon(coords[0],coords[1:]);assert poly.is_valid,r['id']
 row,p=entry(poly,{**r,'sourceIds':[f"MassGIS-2025-aerial-{r['site']}"],'materialBasis':'Visible 2025 hard-surface outline; asphalt is a plausible finish, not a measured binder classification.','confidence':'medium','provenance':{'appearanceDate':'Spring 2025','sourceUrl':'https://tiles.arcgis.com/tiles/hGdibHYSPO59RG1h/arcgis/rest/services/Massachusetts_Aerial_Imagery_2025/MapServer','reviewFile':'sources/parking-visual-review.json','cropGeoreference':'qa/site-crop-georeference.json','digitizationUncertaintyM':.6}});lots.append(row);
 if r['material']=='asphalt':surfaces.append(p)
 else:row['notes'].append('Mask repainting is withheld because this pale surface may be aggregate; the existing source classification is retained.')
 manual.append((r,row))
# Visual source overlay of the actual transformed and clipped outlines.
for site in ['beach','downtown']:
 ip=ROOT/f'qa/site-{site}-z19.jpg'
 if not ip.exists():ip=ROOT/f'qa/site-{site}-plain.jpg'
 if not ip.exists():continue # Optional visual QA crops are retained in the source handoff archive.
 im=Image.open(ip).convert('RGB');draw=ImageDraw.Draw(im)
 for r,row in manual:
  if r['site']!=site:continue
  for ring in r['pixelRings']:draw.line([tuple(x)for x in ring],fill='#ffdc44',width=3)
  x,y=r['pixelRings'][0][0];draw.text((x,y-15),r['id'].split('-')[-1],fill='#ffdc44')
 im.save(ROOT/f'qa/manual-{site}-source-overlay.jpg',quality=94)
# Source-gated service corridors: no inferred paving from an untagged centerline alone.
def support(poly):
 bb=poly.bounds;total=valid=0;bweight=0
 for x in range(math.floor(bb[0]/250),math.floor(bb[2]/250)+1):
  for y in range(math.floor(bb[1]/250),math.floor(bb[3]/250)+1):
   tid=f'{x}_{y}'
   if tid not in ctx.refs:continue
   sel=rasterize([(mapping(poly),1)],out_shape=(256,256),transform=from_origin(x*250,(y+1)*250,PIXEL,PIXEL),fill=0,dtype='uint8')>0
   v=ctx.readmask(tid)[8:264,8:264][sel];total+=len(v);valid+=int((v.sum(axis=1)>0).sum());bweight+=v[:,2].sum()/255
 return float(bweight/max(1,valid)),valid,total
service=[];counts=collections.Counter();raw=json.loads((ROOT/'sources/osm-paved-geometry.json').read_text())
for e in raw['elements']:
 t=e.get('tags',{})
 if e['type']!='way'or t.get('highway')!='service':continue
 if t.get('bridge')not in [None,'no']or t.get('tunnel')not in [None,'no']or t.get('layer','0')!='0':counts['elevatedOrTunnel']+=1;continue
 if t.get('surface')in ['unpaved','gravel','ground','dirt','sand','grass','compacted','fine_gravel']:counts['explicitUnpaved']+=1;continue
 xy=[]
 for p in e.get('geometry',[]):
  x,y=wgs.transform(p['lon'],p['lat']);xy.append((x-ORIGIN[0],y-ORIGIN[1]))
 if len(xy)<2:continue
 line=LineString(xy)
 if not line.intersects(ctx.boundary):counts['outsideTown']+=1;continue
 typ=t.get('service','service');width=3.2 if typ=='driveway'else 4.8;widthBasis='Authored conservative default; not surveyed.'
 try:
  v=float(t.get('width',''))
  if 2<=v<=14:width=v;widthBasis='OSM width tag in meters.'
 except ValueError:pass
 poly=line.buffer(width/2,cap_style=2,join_style=2).intersection(ctx.boundary);ratio,valid,total=support(poly);explicit=t.get('surface')in ['asphalt','paved','concrete','paving_stones'];center,_,_=support(line.buffer(.65,cap_style=2))
 if not explicit and not(ratio>=.90 and center>=.95 and valid>=4):counts['insufficientPavedEvidence']+=1;continue
 safe=unary_union(parts(ctx.exclude(poly)))
 if safe.area<3:counts['noSafeArea']+=1;continue
 row={'id':f"PAVE-SERVICE-{e['id']}",'sourceId':f"OSM-way-{e['id']}",'sourceUrl':f"https://www.openstreetmap.org/way/{e['id']}",'service':typ,'surfaceTag':t.get('surface'),'widthM':width,'widthBasis':widthBasis,'basis':'Explicit OSM paved surface tag.'if explicit else'At least 90% original impervious weight across the corridor and 95% along its center.','originalImperviousWeight':round(ratio,4),'centerImperviousWeight':round(center,4),'areaM2':round(safe.area,3),'polygons':rings(safe)};service.append(row);surfaces.append(safe);counts['explicitPaved'if explicit else'supportedExistingPaved']+=1
print('LOTS_READY',len(lots),'SERVICE',len(service),dict(counts),flush=True)
# Export per-owner-tile small packets. Full source geometry and notes stay in the audit index.
packets=collections.defaultdict(list)
for r in lots:
 packetRow={k:r[k]for k in ['id','tileId','center','sourceIds','material','confidence','polygons','markingPolygons','striping','sourcePolygons']}
 geo=unary_union([Polygon(p[0],p[1:])for p in r['polygons']]);bb=geo.bounds
 if geo.is_empty:continue
 for tx in range(math.floor(bb[0]/250),math.floor(bb[2]/250)+1):
  for ty in range(math.floor(bb[1]/250),math.floor(bb[3]/250)+1):
   tid=f'{tx}_{ty}'
   if tid in ctx.refs and geo.intersection(box(tx*250,ty*250,(tx+1)*250,(ty+1)*250)).area>.001:packets[tid].append(packetRow)
lotrefs={}
for oldPacket in (PUBLIC/'lots').glob('*.json'):oldPacket.unlink()
for tid,rows in sorted(packets.items()):
 data={'version':1,'tileId':tid,'coordinateSystem':'Local EPSG:6491 east/north meters; runtime Z = -north.','lots':rows};p=PUBLIC/f'lots/{tid}.json';dump(p,data);h=sha(p);target=p.with_name(f'{tid}.{h[:12]}.json');p.rename(target);lotrefs[tid]={'url':'/town-surfaces/v2/lots/'+target.name,'bytes':target.stat().st_size,'sha256':h,'lotCount':len(rows)}
dump(OUT/'lots-audit.json',{'version':1,'lots':lots,'rejected':rejected,'serviceCorridors':service,'serviceCounts':dict(counts),'sourceManifestSha256':sha(ASSETS/'manifest.json')})
# Rasterization uses one global subpixel lattice for byte-identical shared gutters.
# Four-by-four area samples. All original zero data pixels are untouched.
tree=STRtree(surfaces);changed={};tileStats=[];SS=4
for oldMask in (PUBLIC/'masks').glob('*.png'):oldMask.unlink()
for i,(tid,ref)in enumerate(sorted(ctx.refs.items())):
 x,y=map(int,tid.split('_'));g=8*PIXEL;bounds=box(x*250-g,y*250-g,(x+1)*250+g,(y+1)*250+g);ids=tree.query(bounds,predicate='intersects')
 if not len(ids):continue
 geoms=[surfaces[int(j)] for j in ids];coverage=rasterize([(mapping(p),1)for p in geoms],out_shape=(272*SS,272*SS),transform=from_origin(x*250-g,(y+1)*250+g,PIXEL/SS,PIXEL/SS),fill=0,dtype='uint8').reshape(272,SS,272,SS).sum(axis=(1,3)).astype('uint16')
 old=ctx.readmask(tid);coverage[old.sum(axis=2)==0]=0;a=old.astype('uint16');inv=16-coverage
 new=((a*inv[:,:,None]+8)//16).astype('uint8');new[:,:,2]=((a[:,:,2]*inv+255*coverage+8)//16).astype('uint8');delta=np.any(new!=old,axis=2)
 if not delta.any():continue
 assert np.array_equal(new[old.sum(axis=2)==0],old[old.sum(axis=2)==0]);assert np.array_equal(new[coverage==0],old[coverage==0]);p=PUBLIC/f'masks/{tid}.png';p.parent.mkdir(parents=True,exist_ok=True);Image.fromarray(new).save(p,optimize=True);h=sha(p);target=p.with_name(f'{tid}.{h[:12]}.png');p.rename(target);changed[tid]=new
 tileStats.append({'tileId':tid,'changedPixels':int(delta.sum()),'changedCorePixels':int(delta[8:264,8:264].sum()),'imperviousCoreEquivalentM2Added':round(float((new[8:264,8:264,2].astype(float)-old[8:264,8:264,2]).sum()/255*PIXEL**2),3),'url':'/town-surfaces/v2/masks/'+target.name,'bytes':target.stat().st_size,'sha256':h,'bounds':ref['bounds'],'dimensions':[272,272],'sourceSha256':ref['sha256']})
 print('MASK',tid,len(changed),flush=True)if len(changed)%30==0 else None
# Check every original/overridden neighboring pair. Same sixteen-pixel overlap.
pairs=pixels=0
for tid in ctx.refs:
 x,y=map(int,tid.split('_'));a=changed.get(tid)
 if a is None:a=ctx.readmask(tid)
 for other,aa,bb in [(f'{x+1}_{y}',(slice(None),slice(256,272)),(slice(None),slice(0,16))),(f'{x}_{y+1}',(slice(0,16),slice(None)),(slice(256,272),slice(None)))]:
  if other not in ctx.refs:continue
  b=changed.get(other)
  if b is None:b=ctx.readmask(other)
  assert np.array_equal(a[aa],b[bb]),f'Gutter mismatch {tid}/{other}'
  pairs+=1;pixels+=a[aa].shape[0]*a[aa].shape[1]
index={'version':1,'sourceManifestSha256':sha(ASSETS/'manifest.json'),'coordinateSystem':'Lot polygons use local source east/north meters; mask bounds use runtime X/Z meters.','masks':{r['tileId']:{k:r[k]for k in ['url','bytes','sha256','bounds','dimensions','sourceSha256']}for r in tileStats},'lotAssets':lotrefs,'stats':{'lots':len(lots),'lotPackets':len(lotrefs),'changedMasks':len(changed),'maskBytes':sum(r['bytes']for r in tileStats),'lotPacketBytes':sum(r['bytes']for r in lotrefs.values())},'attribution':'OpenStreetMap contributors (ODbL), MassGIS/MassDOT/State 911/EOTSS 2025 aerial imagery. Visual pavement interpretation and safe finishing geometry are authored, not a current parking inventory.'}
dump(PUBLIC/'index.json',index);dump(OUT/'mask-audit.json',{'version':1,'sourceManifestSha256':index['sourceManifestSha256'],'indexSha256':sha(PUBLIC/'index.json'),'allOriginalMaskHashesVerified':len(ctx.masks),'neighborOverlapPairs':pairs,'neighborPixelsCompared':pixels,'gutterMismatchCount':0,'zeroExclusionsChanged':0,'outsideCorrectionPixelsChanged':0,'sourceArchiveFilesChanged':0,'stats':index['stats'],'imperviousCoreEquivalentM2Added':round(sum(r['imperviousCoreEquivalentM2Added']for r in tileStats),3),'tiles':tileStats})
print('DONE',index['stats'],'GUTTERS',pairs,pixels,flush=True)
