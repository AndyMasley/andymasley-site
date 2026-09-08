"""Omit Boolean line remnants before Float32 can turn them into visible facets.
Only sub-ten-nanometre-wide triangles below 0.1 square millimetre are omitted;
the unrounded source partition is checked independently after this step.
"""
from pathlib import Path
import os,json,gzip,hashlib
import numpy as np
ROOT=Path(__file__).resolve().parents[3];OUT=Path(os.environ.get('WEBSTER_PROPERTY_TERRAIN','/private/tmp/webster-finished-game/art/property-terrain'))
p=ROOT/'data/derived/town/property-terrain-index.json';index=json.loads(p.read_text());rows=[]
for tid,tile in index['tiles'].items():
 for level,ref in tile['levels'].items():
  file=ROOT/'public'/ref['url'].lstrip('/');packet=json.loads(file.read_text());source=json.load(gzip.open(OUT/f'{tid}-{level}.source.json.gz'));ms={m['mesh']:m for m in source['terrain']};removed=0;loss=0;maximum=0
  for m in packet['levels'][0]['meshes']:
   for patch in m['patches']:
    t=np.array(ms[m['mesh']]['faces'][patch[0]]);output=[];patchloss=0
    for j in range(0,len(patch[1]),3):
     v=np.array(patch[1][j:j+3]);xy=t[0,:2]+v[:,0,None]*(t[1,:2]-t[0,:2])+v[:,1,None]*(t[2,:2]-t[0,:2]);a,b,c=xy;area=abs(np.cross(b-a,c-a))*.5;longest=max(np.linalg.norm(b-a),np.linalg.norm(c-a),np.linalg.norm(b-c))
     if area<1e-7 and (longest==0 or area*2/longest<1e-8):removed+=1;loss+=float(area);patchloss+=float(area)
     else:output.extend(patch[1][j:j+3])
    maximum=max(maximum,patchloss)
    if patchloss>1e-6:raise ValueError(('Excess original partition loss',tid,level,m['mesh'],patch[0],patchloss))
    patch[1]=output
  file.write_text(json.dumps(packet,separators=(',',':')));ref['bytes']=file.stat().st_size;ref['sha256']=hashlib.sha256(file.read_bytes()).hexdigest();rows.append({'tileId':tid,'level':int(level),'removedLineRemnants':removed,'omittedDoublePrecisionAreaM2':loss,'maximumPerSourceTriangleAreaM2':maximum})
p.write_text(json.dumps(index,indent=2)+'\n');(OUT/'precision-preparation.json').write_text(json.dumps({'policy':__doc__,'rows':rows},indent=2));print(rows)
