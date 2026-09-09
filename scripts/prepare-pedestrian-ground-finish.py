"""Four bounded pedestrian finishes from individually qualified source records."""
import hashlib
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'data/derived/town'

def read(name):
    path = DATA / name
    raw = path.read_bytes()
    return json.loads(raw), {'path': 'data/derived/town/' + name, 'sha256': hashlib.sha256(raw).hexdigest()}


def frame(triangles):
    unique = {tuple(sorted(tuple(p[:2]) for p in triangle)): triangle for triangle in triangles}
    area = sx = sy = sxx = syy = sxy = 0.
    for t in unique.values():
        x, y = [p[0] for p in t], [p[1] for p in t]
        a = abs((x[1]-x[0])*(y[2]-y[0])-(x[2]-x[0])*(y[1]-y[0])) / 2
        area += a
        sx += a*sum(x)/3; sy += a*sum(y)/3
        sxx += a*(sum(v*v for v in x)+x[0]*x[1]+x[0]*x[2]+x[1]*x[2])/6
        syy += a*(sum(v*v for v in y)+y[0]*y[1]+y[0]*y[2]+y[1]*y[2])/6
        sxy += a*(sum(x)*sum(y)+sum(x[i]*y[i] for i in range(3)))/12
    if area <= 0:
        raise ValueError('Missing supported pedestrian footprint')
    center = [sx/area, sy/area]
    xx, yy, xy = sxx/area-center[0]**2, syy/area-center[1]**2, sxy/area-center[0]*center[1]
    angle = math.atan2(2*xy, xx-yy)/2
    tangent = [math.cos(angle), math.sin(angle)]
    return {'center': [round(v, 6) for v in center], 'tangent': [round(v, 9) for v in tangent], 'outward': [round(-tangent[1], 9), round(tangent[0], 9)]}


arrivals, arrivals_ref = read('arrival-grounds.json')
memorials, memorials_ref = read('memorial-details.json')
release, _ = read('release.json')
rows = []
for feature_id in ['ARR-MIDDLE-FORECOURT', 'ARR-SITKOWSKI-ENTRY']:
    f = next(f for f in arrivals['features'] if f['id'] == feature_id)
    assert f['kind'] == 'concrete'
    triangles = [t for tile in arrivals['tiles'].values() for r in tile['features'] if r['id'] == feature_id for t in r['triangles']]
    rows.append({'id': feature_id, 'sourceKind': f['kind'], 'sourceId': f['sid'], 'surface': 'concrete-panels', 'frame': frame(triangles), 'unitM': [1.8, 1.8], 'color': '#aaa697', 'source': arrivals_ref, 'sourceUrls': [f['sourceUrl']], 'sourceObservation': f['basis'], 'materialCertainty': 'Pale paved pedestrian footprint observed; concrete finish is an existing authored interpretation, not a material survey.', 'patternCertainty': 'Authored 1.8m scored panels aligned to the whole source footprint principal axis; no surveyed joint layout, condition, traction or accessibility claim.'})
court = next(r for r in memorials['objects'] if r['id'] == 'MON-004-court')
rows.append({'id': court['id'], 'sourceKind': court['kind'], 'sourceId': court['id'], 'surface': 'brick-pavers', 'frame': {'center': court['frame']['start'], 'tangent': court['frame']['tangent'], 'outward': court['frame']['outward']}, 'unitM': [.2032, .1016], 'color': '#98684e', 'source': memorials_ref, 'sourceUrls': court['source'], 'sourceObservation': 'The 2012 NRHP nomination documents brick memorial pavers and a southern semicircular half-wall. Existing registered court footprint and terrain supports are retained.', 'materialCertainty': 'Brick paving documented in research/sections/signs-monuments-markers.md, MON-004 (lines 97-110).', 'patternCertainty': 'Authored nominal eight-by-four-inch running bond and restrained fired-brick variation. Actual bond, individual paver sizes and commemorative inscriptions are not reconstructed; no personal names are invented.'})
moderne, moderne_ref = read('moderne-frontage-grounds.json')
f = moderne['features'][0]
sf = moderne['sourceFrame']
rows.append({'id': f['id'], 'sourceKind': f['kind'], 'sourceId': f['sid'], 'surface': 'concrete-panels', 'frame': {'center': sf['start'], 'tangent': sf['tangent'], 'outward': sf['outward']}, 'unitM': [1.8, 1.8], 'color': f['color'], 'source': moderne_ref, 'sourceUrls': [moderne['sourcePhoto']['url']], 'sourceObservation': moderne['sourcePhoto']['observation'], 'materialCertainty': 'Pale scored concrete is visible in official downtown photo 168; capture date unknown. The bounded forecourt connection is an authored interpretation of its extent.', 'patternCertainty': 'Authored 1.8m scored panels aligned to the registered facade. The photographed reddish outer band is omitted because its actual curb boundary is not registered; no surveyed joint layout or accessibility claim.'})
output = {'version': 1, 'sourceManifestSha256': release['manifestSha256'], 'coordinates': 'Local east,north metres; the rendering frame converts north to negative Three Z.', 'policy': 'Only four named, individually registered pedestrian surfaces. This material layer adds no paving footprint, driveway classification, marking, height, curb, plant, access or building geometry. Pattern and construction detail are authored. Uniform frames are identical across LODs and tile seams.', 'sourceChapters': memorials['sourceChapters'], 'records': rows}
path = DATA / 'pedestrian-ground-finish.json'
path.write_text(json.dumps(output, separators=(',', ':')) + '\n')
print(json.dumps({'records': len(rows), 'bytes': path.stat().st_size, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()}))
