"""Derive conservative, explicitly authored furniture from retained park pads.

Uses only vendored inputs; no network, native asset regeneration, or imagery.
The photograph establishes furniture families, not a pad-by-pad inventory.
"""
from pathlib import Path
import hashlib
import json
import math

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'data/source/town/french-river-park-input.json'
PARK = ROOT / 'data/derived/town/french-river-park.json'
OUTPUT = ROOT / 'data/derived/town/french-river-park-furniture.json'
source = json.loads(SOURCE.read_text())
park = json.loads(PARK.read_text())
source_hash = hashlib.sha256(SOURCE.read_bytes()).hexdigest()
assert source_hash == park['sourceInputSha256'], 'Regenerate park ground first'

def inside(point, ring, margin=0.1):
    sides = []
    for a, b in zip(ring, ring[1:] + ring[:1]):
        cross = (b[0]-a[0])*(point[1]-a[1])-(b[1]-a[1])*(point[0]-a[0])
        sides.append(cross / math.dist(a, b))
    return min(sides) >= margin or max(sides) <= -margin

rows = []
for pad in source['features']:
    if not pad['id'].startswith('FRP-PAD-'):
        continue
    ring = pad['ring']
    retained = next(f for f in park['features'] if f['id'] == pad['id'])
    assert len(ring) == 4 and len(retained['outline']) == 4
    kind = 'backed-bench' if pad['id'] in ['FRP-PAD-05', 'FRP-PAD-06'] else 'picnic-table'
    # Pad alignment is an authoring rule, not an observed furniture azimuth.
    a, b = max(zip(ring, ring[1:] + ring[:1]), key=lambda ab: math.dist(*ab))
    tangent = [(b[i]-a[i])/math.dist(a, b) for i in range(2)]
    outward = [-tangent[1], tangent[0]]
    if outward[1] < 0:
        tangent = [-v for v in tangent]
        outward = [-v for v in outward]
    center = [sum(p[i] for p in ring)/len(ring) for i in range(2)]
    width, depth = (1.70, 1.52) if kind == 'picnic-table' else (1.48, .66)
    corners = [[center[i] + tangent[i]*u + outward[i]*v for i in range(2)]
               for u, v in [(-width/2,-depth/2),(width/2,-depth/2),(width/2,depth/2),(-width/2,depth/2)]]
    assert all(inside(p, ring) for p in corners), f'{pad["id"]} furniture does not fit'
    rows.append({'id': pad['id']+'-FURNITURE', 'padId': pad['id'], 'kind': kind,
                 'center': center, 'tangent': tangent, 'outward': outward,
                 'widthM': width, 'depthM': depth, 'ring': ring})

assert len(rows) == 9
tile_id, tile = next(iter(park['tiles'].items()))
result = {
    'version': 1,
    'sourceManifestSha256': park['sourceManifestSha256'],
    'sourceInputSha256': source_hash,
    'sourcePhoto': source['sourcePhoto'],
    'policy': 'Official municipal photo 175 shows green rectangular picnic tables with attached benches and dark legs, plus a green backed bench. Seven tables on larger pads 01-04 and 07-09 and two benches on smaller pads 05-06 are authored interpretation of the registered 2025 aerial pad sizes, not a measured furniture inventory. Dimensions, green/dark-metal palette, construction and orientation are authored. Every complete piece requires support from the actual added pale-pad mesh and containment in its own retained pad ring; no original-terrain fallback.',
    'tileId': tile_id, 'origin': tile['origin'], 'lods': tile['lods'],
    'limits': {'maximumPieceGroundRangeM': .25, 'maximumFootGroundRangeM': .05,
               'footEmbedM': .008, 'coverageToleranceM2': .00005},
    'colors': {'green': '#50705d', 'metal': '#384841'},
    'pieces': rows,
}
OUTPUT.write_text(json.dumps(result, separators=(',', ':'))+'\n')
print(f'Wrote {len(rows)} authored furniture placements to {OUTPUT.relative_to(ROOT)}')
