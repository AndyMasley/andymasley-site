"""Match exact archived road triangles to retained MassDOT surface classes.

No geometric nearest-road recoloring: each complete source triangle must match
one reconstructed physical ribbon and an unambiguous published surface code.
"""
import gzip,json,hashlib,math,os,itertools,collections
from pathlib import Path
import numpy as np
SITE=Path(__file__).resolve().parents[2];WORK=Path(os.environ.get('WEBSTER_ENVIRONMENT_WORK','/private/tmp/webster-final-details/environment'));EX=Path(os.environ.get('TERRAIN_FINISH_WORK','/private/tmp/webster-finished-streets-audit'))/'extracted'
def sha(b):return hashlib.sha256(b).hexdigest()
def build():
 release=json.loads((SITE/'data/derived/town/release.json').read_text());base=SITE/'public/town-assets'/release['directory'];raw=(base/'manifest.json').read_bytes();assert sha(raw)==release['manifestSha256'];manifest=json.loads(raw)
 raw_network=gzip.decompress((SITE/'data/derived/town/engine-network.json.gz').read_bytes());edges=json.loads(raw_network)['edges'];physical={};by_physical=collections.defaultdict(set)
 for e in edges:physical.setdefault(e['physical_id'],e);by_physical[e['physical_id']].add(e.get('surface_type',0))
 expected=collections.defaultdict(list);expected_tiles=set();total=0
 for pid,e in physical.items():
  typ=e.get('surface_type');
  if typ not in[1,2,5]or len(by_physical[pid])!=1:continue
  xyz=np.array(e['points']);delta=np.gradient(xyz[:,:2],axis=0);delta/=np.maximum(np.linalg.norm(delta,axis=1)[:,None],1e-9);normal=np.column_stack([-delta[:,1],delta[:,0]]);width=max(2.438,e['width_m']);a=xyz.copy();b=xyz.copy();a[:,:2]-=normal*width/2;b[:,:2]+=normal*width/2;points=np.stack([a,b],axis=1).reshape(-1,3)
  for i in range(len(xyz)-1):
   for ids in[[2*i,2*i+2,2*i+3],[2*i,2*i+3,2*i+1]]:
    tri=points[ids];center=tri[:,:2].mean(axis=0);key=tuple(np.floor(center).astype(int));expected[key].append((tri,typ,e['id'],pid));total+=1
    for dx in[-.002,.002]:
     for dy in[-.002,.002]:expected_tiles.add(f'{math.floor((center[0]+dx)/250)}_{math.floor((center[1]+dy)/250)}')
 directory=SITE/'public/town-evidence/v1/road-materials';directory.mkdir(parents=True,exist_ok=True);assets={};audit=[];perms=list(itertools.permutations(range(3)))
 for tile in manifest['tiles']:
  if tile['id']not in expected_tiles:continue
  levels={}
  for asset in tile['lods']:
   path=EX/f"{tile['id']}-{asset['level']}.json.gz";source=json.loads(gzip.decompress(path.read_bytes()));assert source['sourceSha256']==asset['sha256'];records=[];matched=collections.Counter();ambiguous=0;examined=0
   for m in source['meshes']:
    if m['category']!='roads':continue
    pos=np.array(m['positions']);index=np.array(m['index']if m['index']is not None else range(len(pos)));groups=m['groups']or[{'start':0,'count':len(index),'materialIndex':0}];assign=[]
    for part in groups:
     if m['materials'][part.get('materialIndex',0)]!='Drive road | asphalt':continue
     for k in range(part['start'],min(len(index),part['start']+part['count']),3):
      tri=pos[index[k:k+3]][:,[0,2,1]].copy();tri[:,1]*=-1;center=tri[:,:2].mean(axis=0);x,y=np.floor(center).astype(int);found=[];examined+=1
      for dx in[-1,0,1]:
       for dy in[-1,0,1]:
        for ref,typ,edge,pid in expected.get((x+dx,y+dy),[]):
         if any(np.max(np.linalg.norm(tri[:,:2]-ref[list(p),:2],axis=1))<=.002 and np.max(np.abs(tri[:,2]-ref[list(p),2]))<.04 for p in perms):found.append((typ,edge,pid))
      classes={f[0]for f in found}
      if len(classes)==1:typ=next(iter(classes));assign.append([k//3,typ]);matched[typ]+=1
      elif len(classes)>1:ambiguous+=1
    if assign:records.append({'name':m['name'],'parent':m.get('parent'),'geometryStamp':m['geometryStamp'],'assignments':assign})
   if not records:continue
   packet={'version':1,'tileId':tile['id'],'level':asset['level'],'sourceManifestSha256':release['manifestSha256'],'sourceSha256':asset['sha256'],'meshes':records};content=(json.dumps(packet,separators=(',',':'))+'\n').encode();digest=sha(content);name=f"{tile['id']}.l{asset['level']}.{digest[:12]}.json";(directory/name).write_bytes(content);levels[str(asset['level'])]={'url':'/town-evidence/v1/road-materials/'+name,'bytes':len(content),'gzipBytes':len(gzip.compress(content)),'sha256':digest,'count':sum(matched.values())};audit.append({'tileId':tile['id'],'level':asset['level'],'matched':dict(matched),'ambiguous':ambiguous,'examined':examined})
  if levels:assets[tile['id']]={'levels':levels}
 evidence={'source':'https://www.mass.gov/doc/road-inventory-data-dictionary/download','verified':'2026-09-07','codes':{'1':'Unimproved/graded earth or soil','2':'Gravel or stone','5':'Surface-treated','6':'Bituminous concrete'},'sourceNetworkSha256':sha(raw_network),'originalRibbonGenerator':'webster-blender/driving/prepare_surfaces.py:27-34','policy':'Match all three decoded triangle vertices within 2mm XY /4cm elevation and preserve source geometry. Unknown/conflicting codes, bridges with an unmatched corrected elevation, and unmatched surfaces retain original material. Regional subtle palette/roughness is inferred, not measured current pavement color.'}
 result={'version':1,'sourceManifestSha256':release['manifestSha256'],'evidence':evidence,'tiles':assets};(SITE/'data/derived/town/road-materials-index.json').write_text(json.dumps(result,separators=(',',':'))+'\n');current={Path(ref['url']).name for t in assets.values()for ref in t['levels'].values()}
 for p in directory.glob('*.json'):
  if p.name not in current:p.unlink()
 report={'evidence':evidence,'expectedTriangles':total,'tiles':len(assets),'rows':audit,'payloadBytes':sum(ref['bytes']for t in assets.values()for ref in t['levels'].values()),'gzipBytes':sum(ref['gzipBytes']for t in assets.values()for ref in t['levels'].values())};(SITE/'data/derived/town/road-materials-audit.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({k:v for k,v in report.items()if k not in['rows','evidence']}))
if __name__=='__main__':build()
