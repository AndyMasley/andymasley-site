"""Accept streamed road/terrain overlays only after all-LOD native proof.

Run audit-road-ground-clearance.mjs with ROAD_AUDIT_EMIT=1,
ROAD_AUDIT_CLEARANCE=1 and ROAD_AUDIT_GROUNDING=1, then pass its report here.
Whole tiles are retained unchanged if a source face cannot be partitioned or
if the repair increases a sampled LOD mismatch by more than 0.1 mm. This avoids
shipping a partial correction with a new seam beside a retained source face.
"""
import argparse, collections, hashlib, itertools, json, gzip
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def encoded(value):return json.dumps(value,separators=(',',':')).encode()
def sha(raw):return hashlib.sha256(raw).hexdigest()
def main():
 p=argparse.ArgumentParser();p.add_argument('audit');p.add_argument('--allow-aligned',action='store_true');p.add_argument('--report',required=True);args=p.parse_args()
 audit=json.loads(Path(args.audit).read_text());catalog_path=ROOT/'data/derived/town/road-ground-clearance.json';catalog=json.loads(catalog_path.read_text());index_path=ROOT/'data/derived/town/road-ground-clearance-index.json';index=json.loads(index_path.read_text());excluded=collections.defaultdict(set);samples={};comparisons=0
 if audit['sourceManifestSha256']!=catalog['sourceManifestSha256']:raise ValueError('Native proof source changed')
 if not args.allow_aligned:
  for tile in json.loads((ROOT/'data/derived/town/aerial-road-alignment.json').read_text())['tiles']:excluded[tile].add('separate current aerial road alignment')
 for row in audit['rows']:
  tile=row['tileId'];ground=row['grounding'];samples.setdefault(tile,{})[row['level']]={(p['x'],p['n']):p for p in ground['transitionSamples']}
  if row.get('derivation',{}).get('retainedUncertainTriangles'):excluded[tile].add('source partition retained an uncertain face')
  if row.get('clearance',{}).get('rejected'):excluded[tile].add('terrain packet rejected')
  if ground['newlyFloating']:excluded[tile].add('newly floating authored detail')
  expected={(m['name'],i) for m in catalog['tiles'].get(tile,{}).get('meshes',[]) for i in m['triangles']}
  if any((r['mesh'],r['triangle']) in expected for r in row['activeRoads']):excluded[tile].add('registered road probe remained occluded')
 for tile,levels in samples.items():
  if set(levels)!={0,1,2}:excluded[tile].add('incomplete all-LOD native proof');continue
  for a,b in itertools.combinations(levels,2):
   for key in levels[a].keys()&levels[b].keys():
    x,y=levels[a][key],levels[b][key];comparisons+=1
    if abs(x['after']-y['after'])-abs(x['before']-y['before'])>.0001:excluded[tile].add('increased sampled LOD transition mismatch')
 for tile in index['tiles']:
  if tile not in samples:excluded[tile].add('missing native proof')
 for tile in excluded:catalog['tiles'].pop(tile,None);index['tiles'].pop(tile,None)
 catalog_path.write_bytes(encoded(catalog)+b'\n');registration_sha=sha(catalog_path.read_bytes());index['sourceRegistrationSha256']=registration_sha
 old_files=list((ROOT/'public/town-evidence/v1/road-ground').glob('*.json'));retained=[];total_bytes=0;total_gzip=0
 for tile,value in index['tiles'].items():
  for level,asset in value['levels'].items():
   payload=json.loads((ROOT/'public'/asset['url'].lstrip('/')).read_text());payload['sourceRegistrationSha256']=registration_sha;raw=encoded(payload);digest=sha(raw);url=f'/town-evidence/v1/road-ground/{tile}-{level}.{digest[:16]}.json';target=ROOT/'public'/url.lstrip('/');target.write_bytes(raw);retained.append(target);value['levels'][level]={'url':url,'bytes':len(raw),'sha256':digest};total_bytes+=len(raw);total_gzip+=len(gzip.compress(raw))
 raw=encoded(index);index_path.write_bytes(raw)
 for file in set(old_files)-set(retained):file.unlink()
 result={'sourceManifestSha256':index['sourceManifestSha256'],'sourceRegistrationSha256':registration_sha,'nativeAuditSha256':sha(Path(args.audit).read_bytes()),'tiles':len(index['tiles']),'packets':len(retained),'indexBytes':len(raw),'indexGzipBytes':len(gzip.compress(raw)),'packetBytes':total_bytes,'packetGzipBytes':total_gzip,'lodPairSamples':comparisons,'excluded':{t:sorted(v)for t,v in sorted(excluded.items())}}
 Path(args.report).write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result))
if __name__=='__main__':main()
