"""Apply source-pinned native-audit exceptions to existing terrain packets.

Normal full generation applies the same exceptions before emission. This command
avoids regenerating the whole town when reviewing a bounded native precision case.
It retains original triangles, never widens the runtime geometry safety gate.
"""
import gzip,hashlib,json,os
from pathlib import Path
SITE=Path(__file__).resolve().parents[1]
WORK=Path(os.environ.get('TERRAIN_FINISH_WORK','/private/tmp/webster-finished-streets-audit'))
def sha(raw):return hashlib.sha256(raw).hexdigest()
def main():
    target=SITE/'data/derived/town/terrain-finish-index.json';index=json.loads(target.read_text())
    source=SITE/'data/derived/town/terrain-finish-source-exclusions.json';excluded=json.loads(source.read_text())
    if excluded['sourceManifestSha256']!=index['sourceManifestSha256']:raise ValueError('Source manifest mismatch')
    report_file=WORK/'terrain-generation.json';report=json.loads(report_file.read_text());changed=set()
    for row in excluded['triangles']:
        tile=row['tileId'];level=str(row['level']);ref=index['tiles'][tile]['levels'][level]
        raw=(SITE/'public'/ref['url'].lstrip('/')).read_bytes()
        if len(raw)!=ref['bytes']or sha(raw)!=ref['sha256']:raise ValueError('Stale source packet')
        packet=json.loads(raw);layer=packet['levels'][0]
        if layer['sourceSha256']!=row['sourceSha256']or layer['level']!=row['level']:raise ValueError('Stale exception source')
        mesh=next(m for m in layer['meshes']if m['mesh']==row['mesh'])
        if mesh['geometryStamp']!=row['geometryStamp']:raise ValueError('Stale exception geometry')
        old=len(mesh['patches']);mesh['patches']=[p for p in mesh['patches']if p[0]!=row['triangle']]
        if len(mesh['patches'])==old:continue
        changed.add(tile)
        encoded=json.dumps(packet,separators=(',',':'),allow_nan=False).encode();digest=sha(encoded)
        name=f"{tile}-{level}.{digest[:16]}.json";out=SITE/'public/town-evidence/v1/terrain'/name;out.write_bytes(encoded)
        count=sum(len(m['patches'])for m in layer['meshes']);added=sum(len(v)//3-1 for m in layer['meshes']for _,v in m['patches'])
        ref.update(url='/town-evidence/v1/terrain/'+name,bytes=len(encoded),sha256=digest,replacedTriangles=count,addedTriangles=added)
        stats=next(t for t in report['tiles']if t['tileId']==tile);lod=next(l for l in stats['levels']if l['level']==row['level'])
        lod.update(bytes=len(encoded),gzipBytes=len(gzip.compress(encoded)),replacedTriangles=count,addedTriangles=added)
        record={k:v for k,v in row.items()if k not in ('tileId','sourceSha256','geometryStamp','quantizedDoubleArea','sourceDoubleArea')}
        if not any((r['level'],r['mesh'],r['triangle'])==(row['level'],row['mesh'],row['triangle'])for r in stats['retainedUncertain']):stats['retainedUncertain'].append(record)
        stats['retainedUncertainTriangles']=len(stats['retainedUncertain'])
    for stats in report['tiles']:
        if 'levels' not in stats:continue
        for key in ('bytes','gzipBytes','replacedTriangles','addedTriangles'):stats[key]=sum(l[key]for l in stats['levels'])
    for key,field in [('totalAddedTriangles','addedTriangles'),('totalReplacedTriangles','replacedTriangles'),('totalBytes','bytes'),('totalGzipBytes','gzipBytes'),('retainedUncertainTriangles','retainedUncertainTriangles')]:report[key]=sum(t.get(field,0)for t in report['tiles'])
    index['sourceExclusionsSha256']=sha(source.read_bytes());temporary=target.with_suffix('.json.tmp');temporary.write_text(json.dumps(index,separators=(',',':'))+'\n');temporary.replace(target)
    names={Path(a['url']).name for t in index['tiles'].values()for a in t['levels'].values()}
    for old in (SITE/'public/town-evidence/v1/terrain').glob('*.json'):
        if old.name not in names:old.unlink()
    report_file.write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({'filteredTiles':sorted(changed),'retainedTriangles':len(excluded['triangles']),'indexSha256':sha(target.read_bytes())}))
if __name__=='__main__':main()
