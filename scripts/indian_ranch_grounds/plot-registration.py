"""Georegister the authored ground extents over the unchanged pinned aerial."""
from pathlib import Path
import json
import math
import os
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import Polygon
from PIL import Image
from pyproj import Transformer

ROOT=Path(__file__).resolve().parents[2]
OUT=Path(os.environ.get('WEBSTER_RANCH_GROUND_OUT','/private/tmp/webster-indian-ranch-ground'))
source=json.loads((ROOT/'data/source/town/indian-ranch-ground-input.json').read_text())
catalog=json.loads((ROOT/'data/derived/town/indian-ranch-grounds.json').read_text())
image=Image.open('/private/tmp/webster-finished-game/art/grounds/ranch-aerial.png')
m=source['sourceAerial'];proj=Transformer.from_crs(6491,4326,always_xy=True)
def pixel(p):
    lon,lat=proj.transform(p[0]+171282.3328920724,p[1]+867589.2761750807)
    x=(lon+180)/360*2**17;y=(1-math.asinh(math.tan(math.radians(lat)))/math.pi)/2*2**17
    return [(x-39361)*256-m['mosaicCropPixels'][0],(y-48610)*256-m['mosaicCropPixels'][1]]
def px(p):return [q*m['resizeScale'] for q in pixel(p)]
fig,axes=plt.subplots(1,2,figsize=(15,8),dpi=140)
colors=['#14b8df','#df9936','#f5e965']
for ax in axes:
    ax.imshow(image)
    for f,color in zip(catalog['features'],colors):
        for i in range(0,len(f['indices']),3):
            ring=[px(f['points'][k]) for k in f['indices'][i:i+3]]
            ax.add_patch(Polygon(ring,facecolor=color,edgecolor='none',alpha=.25))
        cx,cy=px(f['frameOrigin']);ax.text(cx,cy,f['id'].replace('RANCH-','')+'\n'+str(round(f['areaM2'],1))+' m²',fontsize=8,color='white',ha='center',bbox={'facecolor':'#17252b','alpha':.8,'pad':2,'edgecolor':'none'})
    for row in source['registeredStructures'].values():
        ax.add_patch(Polygon([px(p) for p in row['outline']],fill=False,edgecolor='#fafafa',linewidth=.7))
        if ax is axes[1]:
            cx,cy=px(row['center']);ax.text(cx,cy,row['id'],fontsize=6,color='white',ha='center',bbox={'facecolor':'#000000','alpha':.7,'pad':1,'edgecolor':'none'})
    ax.set_aspect('equal');ax.set_xlabel('Registered crop x (pixels)');ax.set_ylabel('Registered crop y (pixels)')
axes[0].set_xlim(350,660);axes[0].set_ylim(940,690);axes[0].set_title('Ground extents in the venue context')
axes[1].set_xlim(460,610);axes[1].set_ylim(885,760);axes[1].set_title('Tight seating wing; separate pine floor and margin')
fig.suptitle('Indian Ranch: source photograph informs material; exact extents are authored\n2025 aerial, unchanged source pixels; all source structures/roads/water protected',fontsize=12)
fig.tight_layout();OUT.mkdir(parents=True,exist_ok=True);fig.savefig(OUT/'registration-overlay.png')
print(OUT/'registration-overlay.png')
