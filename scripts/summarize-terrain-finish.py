"""Write the reviewable terrain audit summary after generation and native audits."""
import hashlib,json,os
from datetime import datetime,timezone
from pathlib import Path
SITE=Path(__file__).resolve().parents[1];WORK=Path(os.environ.get('TERRAIN_FINISH_WORK','/private/tmp/webster-finished-streets-audit'))
def read(name):return json.loads((WORK/name).read_text())
def quantile(rows,key,q):
    values=sorted(r[key]for r in rows);return values[int((len(values)-1)*q)]if values else 0

def main():
    index_file=SITE/'data/derived/town/terrain-finish-index.json';index_raw=index_file.read_bytes();index=json.loads(index_raw);digest=hashlib.sha256(index_raw).hexdigest()
    generated,native,clearance=read('terrain-generation.json'),read('terrain-native-audit.json'),read('terrain-clearance-audit.json')
    if any(r['sourceManifestSha256']!=index['sourceManifestSha256']for r in [generated,native,clearance]):raise ValueError('Mixed source audit')
    if any(r['indexSha256']!=digest for r in [native,clearance]):raise ValueError('Audit is stale relative to final index')
    if native['failures']:raise ValueError('Native geometry audit failed')
    lods=[dict(tileId=t['tileId'],**r)for t in generated['tiles']for r in t.get('levels',[])]
    retained=[dict(tileId=t['tileId'],**r)for t in generated['tiles']for r in t.get('retainedUncertain',[])]
    residual=[{'name':r['name'],'edgeId':r['edgeId'],**{k:v for k,v in x.items()if k not in ['applied','rows']}}for r in clearance['routes']for x in r['results']if x['buriedAfter']]
    per_lod=[]
    for level in [0,1,2]:
        rows=[r for r in lods if r['level']==level]
        per_lod.append({'level':level,'packets':len(rows),'bytes':sum(r['bytes']for r in rows),'gzipBytes':sum(r['gzipBytes']for r in rows),'medianGzipBytes':quantile(rows,'gzipBytes',.5),'p95GzipBytes':quantile(rows,'gzipBytes',.95),'maximumGzipBytes':max(r['gzipBytes']for r in rows)})
    result={'version':1,'created':datetime.now(timezone.utc).isoformat(),'sourceManifestSha256':index['sourceManifestSha256'],'indexSha256':digest,'sourceExclusionsSha256':index['sourceExclusionsSha256'],
      'scope':'Optional lowering-only cosmetic grade repair against actual decoded neighboring shoulder triangles; original source archives, road geometry, water, buildings, source attributes and UV coordinates remain intact. These are inferred road-edge finishes, not measured new elevation data.',
      'generation':{**{k:v for k,v in generated.items()if k not in ['tiles','sourceManifestSha256']},'sourceTiles':len(generated['tiles']),'repairedTiles':len(index['tiles']),'packets':len(lods),'perLod':per_lod,'largestPackets':sorted(lods,key=lambda r:r['gzipBytes'],reverse=True)[:5]},
      'runtime':{'strategy':'One packet per tile and LOD; optional deferred streaming with source fallback. No per-frame terrain work. Source positions and attribute prefixes retained byte-for-byte; appended attributes interpolated from original source triangles.',
        'timingBasis':native['basis'],'nativeSummary':native['summary'],'collapsedMicroscopicFaces':sum(r['collapsedTriangles']for r in native['levels']),'windingRepairs':sum(r['windingRepairs']for r in native['levels']),'normalRepairs':sum(r['normalRepairs']for r in native['levels']),
        'performanceCaveat':'Native Node timings are not browser FPS, mobile memory limits, or network benchmarks. Gzip is calculated encoded transfer size; actual server negotiation may differ. Total town bytes are not initial load bytes.'},
      'roadClearance':{'summary':clearance['summary'],'northMain':next(r for r in clearance['routes']if r['name']=='north-main-camera'),'remainingSamples':residual,
        'limitation':'Two Lake Parkway outer-edge sample points remain 0.9–4.9 cm above asphalt in coarse LOD2 and the same mixed-LOD configuration. Near LOD0 and medium LOD1 are clear at these points. Sampled clearance is not an every-pixel guarantee.'},
      'retainedOriginalTriangles':{'count':len(retained),'originalDomainAreaM2':sum(r['areaM2']for r in retained),'meaning':'The full original triangle remains intact. Areas are original domain areas, not missing surfaces or necessarily attempted repair areas. Seventeen polygon partition uncertainty cases plus seven precisely source-pinned Float32 guard cases. No holes are introduced.','records':retained},
      'verification':{'nativeActualSourceLevels':len(native['levels']),'sourceHashAndGeometryFailures':len(native['failures']),'zeroAreaFaces':native['summary']['zeroAreaFaces'],'backwardFaces':native['summary']['backwards'],'finiteAndSourceAttributes':'All changed geometry and every protected source geometry in indexed tiles checked against native source snapshots. Original source vertex/normal/UV prefixes and unpatched triangle indices remain byte-exact.',
        'automatedTests':['terrain-finish.test.ts: 7 runtime geometry/transform/Float32/fallback tests','terrain-assets.test.ts: every emitted payload, hash, bytes, finite/barycentric validator, count, LOD/source ownership, source fallback and no stale payloads','scripts/test_terrain_finish.py: 4 pure partition/protected polygon/bridge/shared-edge tests']},
      'reproduction':['node scripts/extract-terrain-finish.mjs','python3 scripts/prepare-terrain-finish.py','node scripts/audit-terrain-finish.mjs','node scripts/audit-terrain-clearance.mjs','python3 scripts/summarize-terrain-finish.py']}
    target=SITE/'data/derived/town/terrain-finish-audit.json';target.write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({'written':str(target),'indexSha256':digest,'native':native['summary'],'clearance':clearance['summary'],'retained':len(retained)}))
if __name__=='__main__':main()
