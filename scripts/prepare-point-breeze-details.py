"""Pin the observed Point Breeze notch canopy to its native roofprint.

Source images inform original geometry/material choices and are never shipped.
The distant old entrance was generated inference, not a surveyed entrance.
Compile the committed observation packet; temporary review media is not required.
"""
from pathlib import Path
import hashlib,json,math
ROOT=Path(__file__).resolve().parents[1]
read=lambda p:json.loads(p.read_bytes())
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
source_input=ROOT/'data/source/town/point-breeze-details-input.json'
source=read(source_input)
native=source['nativeArchitecture'];report={k+'_z':v for k,v in source['originalGeneratedHeight'].items() if k in ['base','floor','eave']}
release=read(ROOT/'data/derived/town/release.json')
base=ROOT/'public/town-assets'/release['directory']
assert sha(base/'manifest.json')==release['manifestSha256']
tile=next(t for t in read(base/'manifest.json')['tiles'] if t['id']=='2_-11')
for lod in tile['lods']:assert sha(base/lod['url'])==lod['sha256']
candidate=source['registration']
def frame(edge):
 a,b=native['outline_xy'][edge:edge+2];dx,dn=b[0]-a[0],b[1]-a[1];w=math.hypot(dx,dn)
 return {'edge':edge,'start':[(x+y)/2 for x,y in zip(a,b)],'tangent':[dx/w,dn/w],'outward':[-dn/w,dx/w],'width':w}
new=frame(13);old=frame(10);wing=frame(17)
project=lambda p,f:[sum((p[i]-f['start'][i])*f[k][i] for i in range(2)) for k in ['tangent','outward']]
observed=project(candidate['observedCanopyCenterLocal'],new)
assert abs(observed[0])<.45 and .5<observed[1]<1.2
target=ROOT/'data/source/town/point-breeze-details-input.json';target.write_text(json.dumps(source,indent=2)+'\n')
catalog={'version':1,'id':native['struct_id'],'tileId':tile['id'],'origin':tile['origin'],'sourceManifestSha256':release['manifestSha256'],
 'sourceInputSha256':sha(target),'lods':[{k:l[k]for k in ['level','sha256']}for l in tile['lods']],
 'frame':new,'former':{**old,'floor':report['floor_z']},'sourceEave':report['eave_z'],
 'southWing':{**wing,'floor':report['floor_z'],'top':report['eave_z'],'basis':'Root V02 playback71.4/76.4s confirms the long south wing: white horizontal siding, white double-hung windows and dark navy shutter pairs. Existing native window positions/sizes are retained inferred rhythms, not measured from the video. Other wings and roof geometry remain unchanged.'},
 'canopyCenter':candidate['observedCanopyCenterLocal'],'projectedCanopyCenter':observed,
 'appearance':{'wall':'#e2e2d8','blue':'#214d85','frame':'#bfc4c0','glass':'#2b3a40','door':'#303a3a'},
 'dimensions':{'canopyWidth':2.18,'canopyProjection':1.72,'canopyRise':.58,'canopyCrownOverEave':.12,'doorWidth':1.58,'doorHeight':2.18,'postWidth':.065,'postU':1.00,'postV':1.59,'thresholdWidth':1.75,'thresholdDepth':.24},
 'observed':source['video'],'inference':source['inference']}
out=ROOT/'data/derived/town/point-breeze-details.json';out.write_text(json.dumps(catalog,separators=(',',':'))+'\n');print(out,len(out.read_bytes()))
