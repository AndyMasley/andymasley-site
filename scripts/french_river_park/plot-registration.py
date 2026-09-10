"""Recreate the ground registration view from hash-pinned public source tiles."""
from pathlib import Path
import hashlib,json,math,os,urllib.request
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import Polygon
from PIL import Image
from pyproj import Transformer
ROOT=Path(__file__).resolve().parents[2];OUT=Path(os.environ.get('WEBSTER_FRENCH_PARK_OUT','/private/tmp/webster-french-river-park'));OUT.mkdir(parents=True,exist_ok=True)
s=json.loads((ROOT/'data/source/town/french-river-park-input.json').read_text());c=json.loads((ROOT/'data/derived/town/french-river-park.json').read_text());a=s['sourceAerial'];left,top,right,bottom=a['tileBounds'];im=Image.new('RGB',((right-left+1)*256,(bottom-top+1)*256));toLL=Transformer.from_crs(6491,4326,always_xy=True)
for row in a['sourceRows']:
    original=Path(row['file']);path=original if original.exists()else OUT/Path(row['file']).name
    if not path.exists():path.write_bytes(urllib.request.urlopen(row['url'],timeout=20).read())
    assert hashlib.sha256(path.read_bytes()).hexdigest()==row['sha256'];im.paste(Image.open(path),((row['x']-left)*256,(row['y']-top)*256))
def px(p):
    lon,lat=toLL.transform(p[0]+171282.3328920724,p[1]+867589.2761750807);return[((lon+180)/360*2**19-left)*256,((1-math.asinh(math.tan(math.radians(lat)))/math.pi)/2*2**19-top)*256]
fig,ax=plt.subplots(figsize=(10,12),dpi=140);ax.imshow(im)
for f in c['features']:
    color={'pale-pad':'#ffffab','parking-asphalt':'#df8251','parking-markings':'#ffffff'}.get(f['surface'],'#26b5d1')
    for i in range(0,len(f['indices']),3):ax.add_patch(Polygon([px(f['points'][k])for k in f['indices'][i:i+3]],facecolor=color,edgecolor='none',alpha=.50))
    if f['surface']=='pale-pad':
        x,y=px([sum(p[k]for p in f['points'])/len(f['points'])for k in range(2)]);ax.text(x+7,y,f['id'].replace('FRP-','')+' '+str(round(f['areaM2'],1))+'m²',fontsize=6,color='black',bbox={'facecolor':'white','alpha':.8,'pad':1,'edgecolor':'none'})
ax.set_xlim(382,650);ax.set_ylim(840,392);ax.set_title('French River Park | registered 2025 paths, pads and south lot\nBlue: gray walk; yellow: pale pads; orange: asphalt; white: authored bay dividers.\nNative paving and planted island retained. Width/material and interpolation authored.',fontsize=10);ax.set_xlabel('Source pixels (~0.22m each)');ax.set_ylabel('Source pixels');fig.tight_layout();fig.savefig(OUT/'registration-overlay.png');print(OUT/'registration-overlay.png')
