#!/usr/bin/env python3
"""Prepare compact runtime landmark evidence from the supplied dated research."""
import argparse
import hashlib
import json
import math
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--research', type=Path, default=Path('/Users/andy/Documents/New project/webster-blender/research'))
parser.add_argument('--reports', type=Path, default=Path('/private/tmp/webster-realism-v2-building/townwide-assets'))
args = parser.parse_args()
repo = Path(__file__).resolve().parents[1]
ledger_path = args.research / 'implementation/landmark-evidence.json'
ledger = json.loads(ledger_path.read_text())
architecture_path = args.research.parent / 'street-detail/building_architecture.json'
architecture = {r['struct_id']:r for r in json.loads(architecture_path.read_text())}
footprints = {f['properties']['STRUCT_ID']: f['properties'] for f in json.loads((args.research/'data/buildings-current.geojson').read_text())['features']}
manifest = json.loads((repo/'public/town-assets/2026-09-37fbef34bc2a/manifest.json').read_text())
owner = {sid:t['id'] for t in manifest['tiles'] for sid in t['sourceIds']}
signatures = {'168813_867173':'sacred-heart','168700_866663':'saint-louis','168571_866677':'kelly-library','168919_867319':'first-baptist'}
palette = {'brick':'#946957','stone':'#85877f','stucco':'#c7c4b9','wall':'#c6c7bd'}
rows = {}
retained = []
for application in ledger['reviewedApplications']:
    for bid in application['targetBuildingIds']:
        sid = bid.removeprefix('BLD-')
        source = architecture.get(sid)
        report_path = args.reports/(sid+'.report.json')
        if not source or not report_path.exists() or sid not in owner:
            retained.append({'structId':sid,'applicationId':application['id'],'name':application['name'],'evidenceIds':application['sourceEvidenceIds'],
                'reason':'No inferred V2 replacement report; preserve the existing named/photo landmark geometry.','materialHints':application['renderHints']})
            continue
        if sid in rows:
            rows[sid]['evidenceIds'].extend(application['sourceEvidenceIds'])
            rows[sid]['applicationIds'].append(application['id'])
            rows[sid]['cautions'].append(application['caution'])
            rows[sid]['sharedOutline'] = True
            # One GIS polygon can contain distinct facades with incompatible materials.
            # Preserve the existing segmented asset until each facade is explicitly joined.
            rows[sid]['material'] = None
            rows[sid]['paint'] = None
            continue
        report = json.loads(report_path.read_text())
        outline = source['outline_xy']
        if outline[0] == outline[-1]: outline = outline[:-1]
        center = source['centroid_xy']
        toward = [source['nearest_road_xy'][i]-center[i] for i in range(2)]
        if sid == '168571_866677': toward = [-1, -.15] # Documented entrance now faces civic green, not Lake Street.
        magnitude = math.hypot(*toward) or 1
        toward = [v/magnitude for v in toward]
        frames = []
        for a,b in zip(outline,outline[1:]+outline[:1]):
            length = math.dist(a,b)
            if length < .1: continue
            t = [(b[i]-a[i])/length for i in range(2)]
            n = [t[1],-t[0]]
            if sum(n[i]*((a[i]+b[i])/2-center[i]) for i in range(2)) < 0: n = [-n[0],-n[1]]
            if t[0]*n[1]-t[1]*n[0] > 0: a,b=b,a; t=[-t[0],-t[1]]
            frames.append({'start':a,'tangent':t,'outward':n,'width':length,'front':False})
        best = max(frames, key=lambda f:sum(f['outward'][i]*toward[i] for i in range(2)) + .01*min(f['width'],20))
        best['front'] = True
        # A consistent rectangular design frame encloses the actual footprint;
        # generated walls/roofs use the polygon, not the rectangle as replacement geometry.
        n = best['outward']; t = [-n[1],n[0]]
        u = [sum(p[i]*t[i] for i in range(2)) for p in outline]
        v = [sum(p[i]*n[i] for i in range(2)) for p in outline]
        frame = {'start':[t[i]*min(u)+n[i]*max(v) for i in range(2)],'tangent':t,'outward':n,'width':max(u)-min(u),'depth':max(v)-min(v)}
        hints = application['renderHints']; text = (hints.get('wallMaterial') or hints.get('frontMaterial') or '').lower()
        material = 'stone' if 'granite' in text else 'stucco' if 'stucco' in text else 'brick' if 'brick' in text else 'wall' if 'wood' in text else None
        paint = palette.get(material)
        if material == 'brick':
            paint = '#b4a787' if 'buff' in text or 'yellow' in text else '#888880' if 'gray' in text else '#94624e' if 'red' in text else palette['brick']
        if material == 'stone' and 'light' in text: paint = '#a5a79b'
        evidence = report.get('source_height_evidence',{})
        peak = evidence.get('roof_max') or report['bounds']['max'][1]
        eave = report.get('eave_z', max((m['eave_z'] for m in report.get('masses', [])), default=report['floor_z']+3))
        signature = signatures.get(sid)
        if signature in ['sacred-heart','first-baptist']: eave = max(report['floor_z']+6, evidence.get('roof_p05',eave))
        ridge = min(peak-.6, max(eave+1, evidence.get('roof_p75',evidence.get('roof_p50',eave)+1)))
        rows[sid] = {'id':sid,'structId':sid,'name':application['name'],'tileId':owner[sid],
            'outline':outline,'frames':frames,'frame':frame,'base':report['base_z'],'floor':report['floor_z'],'eave':eave,'peak':peak,'ridge':ridge,
            'replaceBody':bool(signature),'signature':signature,'material':material,'paint':paint,'renderHints':hints,
            'evidenceIds':application['sourceEvidenceIds'],'applicationIds':[application['id']],'cautions':[application['caution']],
            'sharedOutline':False,'currentExteriorVerified':False,
            'sourceEnvelope':{'base':evidence.get('base_z'),'roofP05':evidence.get('roof_p05'),'roofP50':evidence.get('roof_p50'),'roofP95':evidence.get('roof_p95'),'maximum':peak,'source':evidence.get('source'),'status':evidence.get('height_status')},
            'geometryBasis':'Dated mapped polygon and LiDAR envelope; coherent roof, facade layout and signature detail dimensions inferred within that envelope. A current parcel use does not prove that an older footprint is current.',
            'footprintSource':{key:footprints.get(sid,{}).get(key) for key in ['SOURCE','SOURCETYPE','SOURCEDATE','SOURCEDATA','EDIT_DATE']},
            'protectedNamespaces':['landmark','photo'] if not signature else []}
        if signature == 'kelly-library':
            rows[sid]['cautions'].append('Footprint is derived from May 2017 construction-era WorldView imagery, edited December 2019. It is not the 2011 Corbin footprint; exact final 2018 porch and roof geometry remain unverified. OSM way 217049234 retains the demolished Corbin name and is not used as a current plan.')
output = {'version':1,'sourceLedgerSha256':hashlib.sha256(ledger_path.read_bytes()).hexdigest(),'sourceArchitectureSha256':hashlib.sha256(architecture_path.read_bytes()).hexdigest(),
    'rules':['Source historical descriptions are dated evidence, not a new exterior photo survey.','Only the four signature buildings replace inferred generic bodies. Other rows recolor documented wall materials; shared outlines require per-facade interpretation.','Peak heights never exceed the source LiDAR maximum. Unknown materials are null.','Known demolished identities are excluded; current replacement library is a distinct modern asset.'],
    'retainedProtected':retained,'rows':list(rows.values())}
path=repo/'data/derived/town/landmark-evidence.json'
path.write_text(json.dumps(output,separators=(',',':'),ensure_ascii=False)+'\n')
print(json.dumps({'rows':len(rows),'signatureBodies':sum(r['replaceBody'] for r in rows.values()),'bytes':path.stat().st_size,'output':str(path)}))
