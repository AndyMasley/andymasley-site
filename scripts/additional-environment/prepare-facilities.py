"""Small source-supported facilities from mapped geometry and reviewed 2025 aerials.

Court colors, equipment, pier width/material and rack section are authored game
interpretations. Positions and solar row axes are registered, not random fills.
"""
import gzip,hashlib,json,math,os
from pathlib import Path
import numpy as np
from pyproj import Transformer
from shapely.geometry import Point,Polygon,LineString,box
from shapely.strtree import STRtree
from shapely.ops import unary_union,nearest_points
SITE=Path(__file__).resolve().parents[2];WORK=Path('/private/tmp/webster-final-details/environment');SRC=SITE/'data/derived/town/additional-environment-sources';EX=Path('/private/tmp/webster-finished-streets-audit/extracted');ORIGIN=np.array([171282.3328920724,867589.2761750807]);proj=Transformer.from_crs(4326,6491,always_xy=True)
def sha(b):return hashlib.sha256(b).hexdigest()
def xy(lon,lat):return np.array(proj.transform(lon,lat))-ORIGIN
def px(p,meta):
 x=(39361+(meta['mosaicCropPixels'][0]+p[0]/1.5)/256)/2**17;y=(48610+(meta['mosaicCropPixels'][1]+p[1]/1.5)/256)/2**17
 return xy(x*360-180,math.degrees(math.atan(math.sinh(math.pi*(1-2*y)))))
def dcrpx(p):
 x=(157537+p[0]/256)/2**19;y=(194568+p[1]/256)/2**19
 return xy(x*360-180,math.degrees(math.atan(math.sinh(math.pi*(1-2*y)))))
class Support:
 def __init__(self,manifest,candidates):
  self.shapes=[];self.rows=[];bounds=np.array([r['point']for r in candidates])
  for tile in manifest['tiles']:
   o=tile['origin'];b=tile['bounds'];near=((bounds[:,0]>b['min'][0]-160)&(bounds[:,0]<b['max'][0]+160)&(-bounds[:,1]>b['min'][2]-160)&(-bounds[:,1]<b['max'][2]+160)).any()
   if not near:continue
   for asset in tile['lods']:
    p=EX/f"{tile['id']}-{asset['level']}.json.gz"
    if not p.exists():continue
    j=json.loads(gzip.decompress(p.read_bytes()))
    if j['sourceSha256']!=asset['sha256']:raise ValueError('Stale source extraction')
    for m in j['meshes']:
     if m['category']not in['terrain','water','roads']:continue
     if m['category']=='roads'and m['materials']!=['Drive road | asphalt']:continue
     xyz=np.array(m['positions']);ids=np.array(m['index']if m['index']is not None else range(len(xyz))).reshape(-1,3)
     for ids in ids:
      a=xyz[ids];flat=a[:,[0,2]].copy();flat[:,1]*=-1;poly=Polygon(flat)
      if poly.area<1e-8:continue
      inv=np.linalg.inv(np.column_stack((flat[1]-flat[0],flat[2]-flat[0])));self.shapes.append(poly);self.rows.append((m['category'],flat[0],inv,a[:,1],tile['id'],asset['level']))
  self.tree=STRtree(self.shapes)
 def at(self,p,kind='terrain'):
  found=[]
  for k in self.tree.query(Point(p),predicate='intersects'):
   category,start,inv,h,owner,lod=self.rows[k]
   if category!=kind:continue
   u,v=inv@(np.array(p)-start);found.append((float(h[0]*(1-u-v)+h[1]*u+h[2]*v),owner,lod))
  return sorted(found,reverse=True)

def build():
 mapped=json.loads((SRC/'final-mapped-facilities.json').read_text());rows=mapped['response']['elements'];candidates=[];evidence=[];skipped=[]
 # Use only currently mapped court disciplines with visibly distinct construction.
 for r in rows:
  if r['tags'].get('sport')=='american_football':r={**r,'tags':{**r['tags'],'sport':'football'}}
  if r['tags'].get('sport')not in['basketball','tennis','futsal','football','baseball']:continue
  if r['id']==247622906:skipped.append({'id':r['id'],'reason':'May Street 2025 aerial does not show the old mapped basketball surface; reconstruction-era geometry remains unverified.'});continue
  p=Polygon([xy(q['lon'],q['lat'])for q in r['geometry']]);home=None
  if r['tags']['sport']=='baseball':
   picks={1028747524:[14,15],1028747525:[1,2],1125752883:[1,2],1469853334:[1,2],1469853335:[0]}.get(r['id'])
   if not picks:continue
   ring=np.array(p.exterior.coords[:-1]);home=np.mean(ring[picks],axis=0);direction=np.array(p.centroid.coords[0])-home;home+=direction/np.linalg.norm(direction)*5
  rect=p.minimum_rotated_rectangle;corners=np.array(rect.exterior.coords[:-1]);lengths=np.linalg.norm(np.roll(corners,-1,axis=0)-corners,axis=1);k=int(np.argmax(lengths));t=(corners[(k+1)%4]-corners[k])/lengths[k];center=np.array(rect.centroid.coords[0]);length=float(lengths[k]);width=float(lengths[(k+1)%4])
  if home is None and p.area/rect.area<.95:skipped.append({'id':r['id'],'reason':'Mapped court is not a coherent rectangle.'});continue
  candidates.append({'id':'court-'+str(r['id']),'kind':'court','sport':r['tags']['sport'],'point':center.tolist(),'angle':math.atan2(t[1],t[0]),'length':length,'width':width,'evidenceIds':['INF-REC','OSM-WAY-'+str(r['id'])],'outline':list(map(list,p.exterior.coords)),**({'home':[(home-center)@t,(home-center)@np.array([t[1],-t[0]])],'homeWorld':home.tolist(),'infieldAxis':math.atan2(p.centroid.y-home[1],p.centroid.x-home[0])-math.atan2(t[1],t[0])}if home is not None else{})})
 # Reviewed current rack axes: the plant polygon is not filled with invented rows.
 registrations=[]
 network=json.loads(gzip.decompress((SITE/'data/derived/town/engine-network.json.gz').read_bytes()))
 guided=unary_union([LineString([(p[0],p[1])for p in e['points']]).buffer(max(4.5,e.get('width_m',6)/2+2))for e in network['edges']if len(e.get('points',[]))>1])
 source_buildings=json.loads((Path('/Users/andy/Documents/New project/webster-blender/street-detail/building_architecture.json')).read_text())
 buildings=unary_union([Polygon(r['outline_xy']).buffer(1)for r in source_buildings if len(r['outline_xy'])>=3])
 for name,way,lines in[
  ('cudworth',675684788,[(156,58,282,58),(157,78,249,78),(157,98,251,98),(278,91,336,91),(254,103,345,103),(260,115,354,115)]+[(198+i*7,155+i*11,286+i*8,155+i*11)for i in range(15)]+[(299+i*8,127+i*11,362+i*7,127+i*11)for i in range(13)]+[(334+i*7,328+i*11,397+i*6,328+i*11)for i in range(8)]+[(381+i*4.1,421+i*11,448+i*3.5,421+i*11)for i in range(16)]+[(548+i*2.1,522+i*10.5,579+i*2.3,522+i*10.5)for i in range(10)]+[(508,659,598,659),(446,670,598,670),(446,681,598,681),(446,691,598,691)]),
  ('webster-solar',777873377,[(218,306,309,306),(218,326,528,326),(219,345,552,345),(219,365,559,365),(220,385,560,385),(220,404,561,404),(220,423,563,423),(220,442,594,442),(220,460,594,460)])]:
  lon,lat=(-71.860691,42.071072)if name=='cudworth'else(-71.858197,42.024724);cx=int(((lon+180)/360*2**17-39361)*256);cy=int(((1-math.asinh(math.tan(math.radians(lat)))/math.pi)/2*2**17-48610)*256);meta={'mosaicCropPixels':[cx-256,cy-256,cx+256,cy+256],'resizeScale':1.5,'center':[lon,lat]};plant=next(r for r in rows if r['id']==way);boundary=Polygon([xy(q['lon'],q['lat'])for q in plant['geometry']])
  for i,line in enumerate(lines):
   a=px(line[:2],meta);b=px(line[2:],meta);p=(a+b)/2;t=b-a;length=float(np.linalg.norm(t));t/=length;n=np.array([t[1],-t[0]]);width=2.4 if name=='cudworth' else 4.2;outline=[a-n*width/2,b-n*width/2,b+n*width/2,a+n*width/2]
   if not boundary.buffer(2).covers(Polygon(outline)):skipped.append({'id':f'{name}-{i}','reason':'Traced rack leaves mapped plant envelope.'});continue
   candidates.append({'id':f'solar-{name}-{i}','kind':'solar','point':p.tolist(),'angle':math.atan2(t[1],t[0]),'length':length,'width':width,'evidenceIds':['SITE-052'if name=='cudworth'else'SITE-SOLAR','OSM-WAY-'+str(way),'MASSGIS-AERIAL-2025'],'outline':[q.tolist()for q in outline]})
  # Cudworth's permit explicitly describes a fenced solar installation. Register
  # a conservative line just inside the mapped plant boundary; leave a real
  # access opening at the reviewed 2025 yard-to-array track. Construction remains
  # inferred. The second plant has no separately documented fence/access join.
  if name=='cudworth':
   fence_line=boundary.buffer(-.6).exterior
   access=px([455,315],meta);gate=fence_line.project(Point(access));opening=7
   for i,d in enumerate(np.arange(0,fence_line.length,4)):
    end=min(d+4,fence_line.length);mid=(d+end)/2;delta=min(abs(mid-gate),fence_line.length-abs(mid-gate))
    if delta<opening/2+2:continue
    a=np.array(fence_line.interpolate(d).coords[0]);b=np.array(fence_line.interpolate(end).coords[0]);line=LineString([a,b]);length=float(np.linalg.norm(b-a))
    if length<.3 or line.buffer(.2).intersects(guided)or line.buffer(.2).intersects(buildings):continue
    t=(b-a)/length;n=np.array([t[1],-t[0]]);out=[a-n*.15,b-n*.15,b+n*.15,a+n*.15]
    candidates.append({'id':f'fence-cudworth-{i}','kind':'fence','point':((a+b)/2).tolist(),'angle':math.atan2(t[1],t[0]),'length':length,'width':.3,'outline':[q.tolist()for q in out],'evidenceIds':['SITE-052','OSM-WAY-675684788','MASSGIS-AERIAL-2025'],'fenceBasis':'Dated permit supports perimeter fence; near-boundary line, 2m mesh and post construction inferred. Gap aligns to visible 2025 access track.'})
   # Open gate leaves run along the fence, never across the access gap or drive.
   for sign in[-1,1]:
    d=gate+sign*(opening/2+2.1);a=np.array(fence_line.interpolate(d).coords[0]);b=np.array(fence_line.interpolate(d+sign*2.6).coords[0]);line=LineString([a,b]);length=float(np.linalg.norm(b-a))
    if length<.3 or line.buffer(.3).intersects(guided)or line.buffer(.3).intersects(buildings):continue
    t=(b-a)/length;n=np.array([t[1],-t[0]]);out=[a-n*.15,b-n*.15,b+n*.15,a+n*.15]
    candidates.append({'id':f'gate-cudworth-{sign}','kind':'fence','gate':True,'point':((a+b)/2).tolist(),'angle':math.atan2(t[1],t[0]),'length':length,'width':.3,'outline':[q.tolist()for q in out],'evidenceIds':['SITE-052','OSM-WAY-675684788','MASSGIS-AERIAL-2025'],'fenceBasis':'Inferred open gate leaf beside the registered access opening, not a verified current operational state.'})
   registrations.append({'site':'cudworth-fence','plantWay':way,'sourceAccessPixel':[455,315],'accessLocal':access.tolist(),'gateProjectedLocal':list(fence_line.interpolate(gate).coords[0]),'openingM':opening,'basis':'Current plant boundary and aerial track register a bounded inferred fence, against explicit dated permit evidence; all guided roads and source buildings have protective clearance.'})
  registrations.append({'site':name,'way':way,'aerialCrop':meta,'rowPixels':lines,'basis':'Approximate axes of visible racks in spring 2025 aerial; nominal rack depth, panel segmentation, tilt and support construction inferred.'})
 # Existing mapped pier centerlines: support against actual lake is mandatory.
 for r in rows:
  if r['tags'].get('man_made')!='pier':continue
  points=[xy(q['lon'],q['lat'])for q in r['geometry']];line=LineString(points)
  for i,d in enumerate(np.arange(0,line.length,4)):
   a=np.array(line.interpolate(d).coords[0]);b=np.array(line.interpolate(min(d+4,line.length)).coords[0]);p=(a+b)/2;t=b-a;length=float(np.linalg.norm(t));
   if length<.4:continue
   t/=length;n=np.array([t[1],-t[0]]);width=1.6;outline=[a-n*width/2,b-n*width/2,b+n*width/2,a+n*width/2]
   candidates.append({'id':f'pier-{r["id"]}-{i}','kind':'pier','point':p.tolist(),'angle':math.atan2(t[1],t[0]),'length':length,'width':width,'evidenceIds':['LK-DOCKS','OSM-WAY-'+str(r['id'])],'outline':[q.tolist()for q in outline]})
 # Narrow gray access surface visible between the concrete launch and avenue.
 apron=[dcrpx(p)for p in[[528,478],[562,491],[558,518],[528,507]]];p=Polygon(apron);c=np.array(p.centroid.coords[0]);a=np.array(apron[1])-np.array(apron[0]);angle=math.atan2(a[1],a[0]);rect=p.minimum_rotated_rectangle;rr=np.array(rect.exterior.coords[:-1]);d=np.linalg.norm(np.roll(rr,-1,axis=0)-rr,axis=1);k=int(np.argmax(d));t=(rr[(k+1)%4]-rr[k])/d[k]
 candidates.append({'id':'dcr-launch-apron','kind':'apron','point':list(rect.centroid.coords[0]),'angle':math.atan2(t[1],t[0]),'length':float(d[k]),'width':float(d[(k+1)%4]),'evidenceIds':['LK-017','MASSGIS-AERIAL-2025'],'outline':list(map(list,rect.exterior.coords))})
 # The 2017 frontage photograph and 2025 aerial both show a paved forecourt.
 # This conservative 11.8m strip stops at the observed road-side edge; it does not
 # pave the source pines behind the shops or claim the whole parcel is parking.
 start=np.array([498.437518,-390.938438]);t=np.array([.615369,-.788239]);normal=np.array([.788239,.615369]);center=start+t*31.45+normal*6.1
 outline=[start+t*u+normal*v for u,v in[(0,.2),(62.9,.2),(62.9,12),(0,12)]]
 candidates.append({'id':'gore-170-plaza-apron','kind':'apron','parking':True,'point':center.tolist(),'angle':math.atan2(t[1],t[0]),'length':62.9,'width':11.8,'outline':[q.tolist()for q in outline],'evidenceIds':['BLD-171795_867169','MASSGIS-AERIAL-2025','ROAD-SIDE-PHOTO-2017']})
 release=json.loads((SITE/'data/derived/town/release.json').read_text());manifest=json.loads((SITE/'public/town-assets'/release['directory']/'manifest.json').read_text());support=Support(manifest,candidates);tiles={}
 for r in candidates:
  p=np.array(r['point']);t=np.array([math.cos(r['angle']),math.sin(r['angle'])]);n=np.array([t[1],-t[0]]);kind='water'if r['kind']=='pier'else'terrain';center=support.at(p,kind)
  if not center:skipped.append({'id':r['id'],'reason':'No exact source '+kind+' support.'});continue
  owner=next((a[1]for a in center if a[2]==0),center[0][1]);height=center[0][0]
  if r['kind']=='pier':r['height']=height+.48
  else:
   columns=max(1,math.ceil(r['width']/1));rowsN=max(1,math.ceil(r['length']/1));heights=[];missing=False;maxslope=0
   for i in range(rowsN+1):
    for j in range(columns+1):
     q=p+t*((i/rowsN-.5)*r['length'])+n*((j/columns-.5)*r['width']);values=support.at(q);asphalt=support.at(q,'roads')if r['kind']=='apron'else[]
     if not values:missing=True;break
     heights.append(max(values[0][0],asphalt[0][0]if asphalt else-1000)+(.045 if r['kind']=='apron'else.065))
    if missing:break
   if missing:skipped.append({'id':r['id'],'reason':'Full mapped extent lacks source terrain support.'});continue
   if r['kind']=='court'and r.get('sport')not in['baseball','football']and max(heights)-min(heights)>1.35:skipped.append({'id':r['id'],'reason':'Source terrain relief is too large for a coherent court without separate grading.'});continue
   # Dense center samples avoid triangle-interior terrain ridges, conservatively
   # sharing each cell's correction at the four common grid vertices.
   base=list(heights);lifts=[0.0]*len(base)
   for i in range(rowsN):
    for j in range(columns):
     ids=[i*(columns+1)+j,(i+1)*(columns+1)+j,(i+1)*(columns+1)+j+1,i*(columns+1)+j+1];a,b,c,d=[base[k]for k in ids];lift=0
     for x in[.25,.5,.75]:
      for z in[.25,.5,.75]:
       q=p+t*(((i+x)/rowsN-.5)*r['length'])+n*(((j+z)/columns-.5)*r['width']);values=support.at(q);road=support.at(q,'roads')if r['kind']=='apron'else[];h=max(values[0][0]if values else-1000,road[0][0]if road else-1000);top=a*(1-z)+d*(z-x)+c*x if z>=x else a*(1-x)+c*z+b*(x-z);lift=max(lift,h+.07-top)
     for k in ids:lifts[k]=max(lifts[k],lift)
   values=np.array([h+d for h,d in zip(base,lifts)]).reshape(rowsN+1,columns+1)
   if r.get('parking'):
    # Transition from the raised source asphalt to the actual forecourt over a
    # bounded gentle grade, rather than copying a sub-metre source edge step.
    old=values.copy();dx=r['length']/rowsN;dz=r['width']/columns;grade=.10;reach=int(math.ceil((old.max()-old.min())/grade/min(dx,dz)))
    for i in range(rowsN+1):
     for j in range(columns+1):
      for ii in range(max(0,i-reach),min(rowsN,i+reach)+1):
       for jj in range(max(0,j-reach),min(columns,j+reach)+1):values[i,j]=max(values[i,j],old[ii,jj]-grade*math.hypot((i-ii)*dx,(j-jj)*dz))
    r['surfaceGradeBasis']='Upper envelope with 0.10 per-axis grade transition from registered source asphalt; source ground and road are unchanged.';r['maximumAdditionalGradeLiftM']=float((values-old).max())
   r['grid']={'rows':rowsN,'columns':columns,'heights':[round(v,5)for v in values.ravel()]};r['height']=height
  r['tileId']=owner;r['sourceBasis']='Source terrain envelope across all three rendered LODs; source originals are immutable.';tiles.setdefault(owner,[]).append(r)
 exclusions={}
 for objects in list(tiles.values()):
  for r in objects:
   if r['kind']not in['court','apron']:continue
   p=Polygon(r['outline']);x0,y0,x1,y1=p.bounds
   for x in range(math.floor(x0/250),math.floor(x1/250)+1):
    for y in range(math.floor(y0/250),math.floor(y1/250)+1):
     if p.intersects(box(x*250,y*250,x*250+250,y*250+250)):
      tid=f'{x}_{y}';tiles.setdefault(tid,[]);exclusions.setdefault(tid,[]).append(r['outline'])
 out=SITE/'public/town-evidence/v1/environment-facilities';out.mkdir(parents=True,exist_ok=True);refs={};names=[]
 for tile,objects in sorted(tiles.items()):
  raw=json.dumps({'version':1,'tileId':tile,'sourceManifestSha256':release['manifestSha256'],'objects':objects,'grassExclusions':exclusions.get(tile,[])},separators=(',',':')).encode();h=sha(raw);name=f'{tile}.{h[:12]}.json';(out/name).write_bytes(raw);names.append(name);refs[tile]={'url':'/town-evidence/v1/environment-facilities/'+name,'sha256':h,'bytes':len(raw),'count':len(objects)}
 index={'version':1,'sourceManifestSha256':release['manifestSha256'],'tiles':refs};(SITE/'data/derived/town/environment-facilities-index.json').write_text(json.dumps(index,separators=(',',':'))+'\n')
 for p in out.glob('*.json'):
  if p.name not in names:p.unlink()
 audit={'version':1,'source':mapped['source'],'sourceSnapshotSha256':sha((SRC/'final-mapped-facilities.json').read_bytes()),'registrations':registrations,'count':sum(len(x)for x in tiles.values()),'byKind':{kind:sum(r['kind']==kind for rows in tiles.values()for r in rows)for kind in['court','solar','pier','apron','fence']},'skipped':skipped,'inference':'Sport equipment, lines and surface colors are regional authored forms. Solar row axes derive from reviewed 2025 imagery; panel construction is inferred. Pier alignment is mapped; 1.6 m width, boards, posts and deck height are inferred; no named access claim.'}
 (SITE/'data/derived/town/environment-facilities-audit.json').write_text(json.dumps(audit,indent=2)+'\n');print(json.dumps({k:v for k,v in audit.items()if k in['count','byKind']}));print('Skipped',len(skipped))
if __name__=='__main__':build()
