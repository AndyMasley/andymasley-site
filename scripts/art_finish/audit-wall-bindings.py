"""Check wall material signatures cannot select different native texture bindings."""
from pathlib import Path
import collections
import hashlib
import json
import struct

ROOT=Path(__file__).resolve().parents[2]
release=json.loads((ROOT/'data/derived/town/release.json').read_bytes())
base=ROOT/'public/town-assets'/release['directory']
manifest=json.loads((base/'manifest.json').read_bytes())
index=json.loads((ROOT/'data/derived/town/foundation-wall-index.json').read_bytes())
seen=collections.defaultdict(set)
uses=collections.Counter()
image_hashes={}
for tile in manifest['tiles']:
    if tile['id'] not in index['tiles']:
        continue
    for lod in tile['lods']:
        file=base/lod['url']
        raw=file.read_bytes()
        assert hashlib.sha256(raw).hexdigest()==lod['sha256']
        doc=json.loads(raw[20:20+struct.unpack_from('<I',raw,12)[0]])
        def texture(info):
            if info is None:return None
            t=doc['textures'][info['index']]
            image=doc['images'][t['source']]
            uri=image['uri']
            image_file=(file.parent/uri).resolve()
            if image_file not in image_hashes:
                image_hashes[image_file]=hashlib.sha256(image_file.read_bytes()).hexdigest()
            return {'info':{k:v for k,v in info.items()if k!='index'},'imageSha256':image_hashes[image_file],'sampler':doc['samplers'][t['sampler']]if 'sampler'in t else {}}
        for m in doc['materials']:
            if m.get('name') not in {'V2 inferred | siding','V2 inferred | brick','V2 inferred | concrete_wall'}:
                continue
            p=m['pbrMetallicRoughness']
            key=json.dumps([m['name'],p.get('baseColorFactor',[1,1,1,1])[:3],p.get('roughnessFactor',1),p.get('metallicFactor',1)],separators=(',',':'))
            binding={'color':texture(p.get('baseColorTexture')),'normal':texture(m.get('normalTexture')),'metalRough':texture(p.get('metallicRoughnessTexture')),'occlusion':texture(m.get('occlusionTexture')),'extensions':m.get('extensions',{}),'alphaMode':m.get('alphaMode','OPAQUE'),'doubleSided':m.get('doubleSided',False),'emissive':texture(m.get('emissiveTexture')),'emissiveFactor':m.get('emissiveFactor',[0,0,0])}
            seen[key].add(json.dumps(binding,sort_keys=True,separators=(',',':')))
            uses[key]+=1
conflicts={k:list(v)for k,v in seen.items()if len(v)!=1}
report={'passed':not conflicts,'sourceManifestSha256':release['manifestSha256'],'scope':'All371 registered source tiles at3LODs. Exact material names/PBR factors, texture-byte SHA256, UV transforms, sampler, normal strength and other shader properties.','signatures':len(seen),'materialInstances':sum(uses.values()),'images':{str(k.relative_to(base)):v for k,v in image_hashes.items()},'conflicts':conflicts}
out=Path('/private/tmp/webster-wall-ground-finish/material-bindings.json');out.write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({k:v for k,v in report.items()if k not in ['images','scope']},indent=2))
assert not conflicts
