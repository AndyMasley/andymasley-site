from pathlib import Path
import json,hashlib
from PIL import Image
root=Path(__file__).parent;public=root/'output/public';index=json.loads((public/'town-surfaces/v2/index.json').read_text());rows={}
for tid,ref in index['masks'].items():
 im=Image.open(public/ref['url'].lstrip('/'));assert im.mode=='RGBA';rows[tid]={'rgbaSha256':hashlib.sha256(im.tobytes()).hexdigest(),'dimensions':list(im.size),'pngSha256':ref['sha256']}
out={'version':1,'sourceIndexSha256':hashlib.sha256((public/'town-surfaces/v2/index.json').read_bytes()).hexdigest(),'method':'Pillow direct RGBA8 decode; no premultiplication or color conversion. Alpha is soil coverage.','masks':rows};Path('/private/tmp/webster-release/data/derived/town/paved-mask-decoder-reference.json').write_text(json.dumps(out,separators=(',',':'))+'\n')
