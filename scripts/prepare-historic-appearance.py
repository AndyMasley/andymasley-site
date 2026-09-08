"""Compact dated architectural guidance without shipping the research corpus."""
import hashlib
import json
import re
import sys
from pathlib import Path

SITE=Path(__file__).resolve().parents[1]
SOURCE=SITE/'data/derived/town/historic-architecture-evidence.json'
MATERIALS={'clapboard':'siding','vinyl_siding':'siding','aluminum_siding':'siding',
           'shingle':'shingle','asbestos_siding':'shingle','brick':'brick','granite':'stone','stucco':'stucco'}
REVIEWED_WINDOW_GROUPS={'168330_865062':{'mhcId':'WEB.373','sourceYear':2000,
    'count':3,'sash':'12-over-1',
    'sourceLine':959,'sourcePath':'research/sections/macris-forms-145-229.md'}}
SCHOOL_FRONTAGES={'168288_865127':{'frameIndex':2,'schoolEdge':2157,'schoolPoint':[-2958.4667634626203,-2437.3018177288623]},
    '168330_865062':{'frameIndex':5,'schoolEdge':2153,'schoolPoint':[-2914.275139782582,-2503.2109466376805]}}


def qualify_frontage(home, choice):
    sys.path.insert(0,'/private/tmp/webster-realism-v2-building/python-deps')
    from shapely.geometry import Polygon, LineString
    root=Path('/Users/andy/Documents/New project/webster-blender')
    architecture_path=root/'street-detail/building_architecture.json'
    roads_path=root/'driving/network.json'
    architecture=json.loads(architecture_path.read_text());roads=json.loads(roads_path.read_text())['edges']
    f=home['frames'][choice['frameIndex']];u=f['width']/2
    footprint=[[f['start'][i]+f['tangent'][i]*(u+a)+f['outward'][i]*b for i in range(2)] for a,b in [(-.75,0),(.75,0),(.75,3),(-.75,3)]]
    site=Polygon(footprint);own=site.intersection(Polygon(home['outline'])).area
    assert own<.00001
    neighbors=[];own_source_overlap=0
    for row in architecture:
        p=Polygon(row['outline_xy']).buffer(0)
        if not site.intersects(p):continue
        area=site.intersection(p).area
        if row['struct_id']==home['id']:own_source_overlap=area
        elif area>.00001:neighbors.append(row['struct_id'])
    clearance=min(site.distance(LineString([p[:2] for p in e['points']]).buffer(e['width_m']/2+abs(e['lane_offset_m'])+1.5)) for e in roads)
    assert not neighbors and clearance>2 and own_source_overlap<.03
    return {'maximumWidthM':1.5,'maximumProjectionM':3,'qualifiedFootprint':footprint,
        'ownRuntimePlanOverlapM2':own,'ownDatedRoofprintOverlapM2':own_source_overlap,
        'roofprintEdgeLimit':'At most 0.03 square meters of millimeter-scale original/cleaned roofprint rounding at the attached wall; no interior alcove occupation.',
        'neighborBuildingIntersections':0,'roadEnvelopeClearanceM':clearance,
        'architectureSha256':hashlib.sha256(architecture_path.read_bytes()).hexdigest(),
        'networkSha256':hashlib.sha256(roads_path.read_bytes()).hexdigest()}


def main():
    source=json.loads(SOURCE.read_text());index=json.loads((SITE/'data/derived/town/residential-evidence-index.json').read_text())
    homes={}
    for asset in index['tiles'].values():
        homes.update((r['id'],r)for r in json.loads((SITE/'public'/asset['url'].lstrip('/')).read_text())['buildings'])
    rows=[]
    for historic in source['rows']:
        sid=historic['structId'];home=homes.get(sid)
        if not home or historic['gates']['demolished']or historic['gates']['replacementAfterDescription']:continue
        materials=historic['wallMaterials']or[]
        material=MATERIALS.get(materials[0])if historic['allowMaterialInference']and len(materials)==1 else None
        # A later exterior listing takes priority over a historic inventory form.
        if home['materialBasis']=='dated-listing':material=None
        bays=historic.get('frontageBays')
        claims=' '.join(e['statement'] for e in historic['evidence'])
        eave=None
        if re.search(r'\bdentils?\b',claims,re.I):
            eave='brick-dentils' if re.search(r'corbel\w*\s+brick|brick\s+corbel|brick.*?dentils',claims,re.I) else 'dentils'
        elif re.search(r'bracketed eaves|eaves.*?brackets|roofs? (?:are )?supported on small brackets|roof on brackets',claims,re.I):
            eave='brackets'
        if material is None and bays is None and eave is None:continue
        row={'id':sid,'material':material,'frontageBays':bays,'sourceYear':historic['sourceYear'],
                     'eaveDetail':eave,
                     'evidenceIds':historic['mhcIds'],'currentObserved':False,
                     'urls':sorted({url for e in historic['evidence']for url in e['source']['urls']})}
        if material=='brick' and historic.get('wallColor')=='yellow pressed brick':
            row['masonryColor']='#b49b69'
            row['masonryColorBasis']='Dated intrinsic yellow pressed-brick fabric, represented by an authored buff family; not a current paint observation.'
        group=REVIEWED_WINDOW_GROUPS.get(sid)
        if group and group['mhcId'] in historic['mhcIds'] and historic['sourceYear']==group['sourceYear']:
            row['windowGroup']={'count':group['count'],'sash':group['sash']}
            row['windowGroupEvidence']={k:v for k,v in group.items() if k not in ['count','sash']}
            row['windowGroupBasis']='Dated grouped sash morphology on eligible retained wall bays. Width and spacing are inferred; narrow returns and source entrances remain clear.'
        if sid in SCHOOL_FRONTAGES and not home['documented'] and home['materialBasis']=='inferred' and home['paintBasis']=='inferred':
            choice=SCHOOL_FRONTAGES[sid];f=home['frames'][choice['frameIndex']]
            toward=[choice['schoolPoint'][i]-f['start'][i] for i in range(2)]
            assert sum(toward[i]*f['outward'][i] for i in range(2))>20
            row['addressFrontage']={**choice,'address':home['address'],'outline':home['outline'],'formerEntry':home['entry'],'selectedFrame':{k:f[k] for k in ['start','tangent','outward','width']},'clearance':qualify_frontage(home,choice),
                'basis':'Authored correction of the earlier nearest-side-street entrance heuristic. Exact address and MHC identity support School Street frontage; mapped School road direction and the existing projected wall select this facade. Center entry and short terrain-supported stoop are inferred, not photographed. No off-property walk is added.'}
        rows.append(row)
    output={'version':1,'sourceSha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),'count':len(rows),
            'materialCount':sum(r['material']is not None for r in rows),'bayCount':sum(r['frontageBays']is not None for r in rows),
            'eaveDetailCount':sum(r['eaveDetail']is not None for r in rows),
            'policy':'Dated architectural descriptions guide plausible retained-house materials and bay rhythms. Current listing cladding and color win; intrinsic masonry color may refine an inferred palette, while historic paint is never copied. Address-qualified window groups preserve mapped walls and entrances; their dimensions are inferred. Asbestos is represented only as a shingle-like historical visual pattern, not asserted as current building material.',
            'rows':rows}
    (SITE/'data/derived/town/historic-appearance.json').write_text(json.dumps(output,separators=(',',':'))+'\n')
    print(json.dumps({k:v for k,v in output.items()if k not in ['rows','policy']}))


if __name__=='__main__':main()
