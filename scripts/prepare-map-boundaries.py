"""Identify exact terminal municipal clips; nearby natural dead ends are excluded.

Usage: python3 scripts/prepare-map-boundaries.py /path/to/webster-local.geojson
The supplied polygon uses the same local east/north frame as the pinned network.
"""
import gzip, hashlib, json, sys
from pathlib import Path
from shapely.geometry import Point, shape
root=Path(__file__).resolve().parents[1]
raw=(root/'data/derived/town/engine-network.json.gz').read_bytes()
network=json.loads(gzip.decompress(raw)); source=Path(sys.argv[1]); boundary_raw=source.read_bytes();boundary=shape(json.loads(boundary_raw)).boundary
rows=[]
for edge in network['edges']:
    if any(other['from']==edge['to'] and other.get('physical_id',other['id'])!=edge.get('physical_id',edge['id']) for other in network['edges']):continue
    distance=boundary.distance(Point(edge['points'][-1][:2]))
    if distance>=.05:continue
    rows.append({'edgeId':edge['id'],'physicalId':edge['physical_id'],'endpoint':edge['points'][-1],'distanceToBoundaryM':distance})
result={'version':1,'networkSha256':hashlib.sha256(raw).hexdigest(),'boundarySha256':hashlib.sha256(boundary_raw).hexdigest(),'basis':'Municipal Webster polygon in the pinned local road frame; terminal source endpoint within 0.05 m. Does not classify nearby ordinary dead ends.','setbackM':3.2,'rows':rows}
(root/'data/derived/town/map-boundaries.json').write_text(json.dumps(result,separators=(',',':'))+'\n')
print(json.dumps({'qualifiedDirectedEdges':len(rows),'ids':[r['edgeId'] for r in rows]}))
