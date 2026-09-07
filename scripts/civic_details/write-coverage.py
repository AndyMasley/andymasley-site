"""Reproduce the civic/landmark research-completion ledger without modifying research.
WEBSTER_RESEARCH and WEBSTER_CIVIC_QA override the persistent corpus/output paths.
"""
import json,hashlib,os
from pathlib import Path
from collections import Counter,defaultdict
R=Path(__file__).resolve().parents[2]
SOURCE=Path(os.environ.get('WEBSTER_RESEARCH','/Users/andy/Documents/New project/webster-blender/research'))
OUT=Path(os.environ.get('WEBSTER_CIVIC_QA','/private/tmp/webster-research-completion/landmarks'));OUT.mkdir(parents=True,exist_ok=True)
read=lambda p:json.loads(p.read_bytes())
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
ledger=read(SOURCE/'implementation/landmark-evidence.json');compiled=read(R/'data/derived/town/landmark-evidence.json');new=read(R/'data/derived/town/landmark-completion.json')
new_by={r['id']:r for r in new['rows']};old_by={r['id']:r for r in compiled['rows']};protected_by={r['applicationId']:r for r in compiled['retainedProtected']}
added={
'CIV-1':('implemented', 'Side and return windows, pale masonry accents, side arched entries and four tall auditorium fanlight bays per side. Existing detailed Main Street portico, clock and cupola remain.', 'Unseen complete rear elevations and exact stone sculpture are not claimed; source roof/HVAC shapes remain approximate.'),
'CIV-2':('implemented','Four-level school window rhythm including raised basement, central five bays with six pale pilasters, pale entry, pediment clock and horizontal belts; exact aerial-roof triangles receive a dark finish.', 'Rooftop lump geometry is retained, not declared a surveyed HVAC layout. Detail dimensions and bay spacing are inferred from the viewed renovation photo.'),
'CIV-7':('implemented','Ten large sectional apparatus doors with glazed strips, red brick piers, pale upper band and thin red fascia; restrained side windows and low roof.', 'The official ten-bay count does not prove their exact distribution along the modeled street elevation; no lettering, trucks or operational scene was invented.'),
'CIV-8':('implemented','Charcoal painted brick, high pale drill-hall volume, mixed glazed/blocked side openings and a white glazed north entrance vestibule.', 'The viewed institution image is in a December 2021 publication path, not a 2026 survey. The mural/portrait and unsurveyed access paths are omitted.'),
'CIV-30':('implemented','Twin west square brick towers, paired lancet louvers, dark octagonal spires, pale banding and masonry accents, large central traceried glazing, bronze doors, nave buttresses and separate green ridge fleche.', 'Detailed proportions are fitted to the source 24.841 m total height, which may understate the real spires. Simplified tracery/terracotta does not reproduce every relief.'),
'CIV-35':('implemented-historical-form','Separate church/parish-hall roof fields, board-and-batten rhythm, lancets, hooded east entrance, registered northeast front tower with tapered skirt, square louver belfry and pyramid cap.', 'The 52 ft height is documented by the parish but exceeds the sampled source roof maximum; the exception is explicit. The inspected photo is historical, and present paint and fine exterior details are not independently photographed. The 2025 aerial corroborates the tower position and presence.')}
existing={
'CIV-3':'Modern brick/glass library, two-story glazed front and projecting corner, roof lantern; original Corbin library is not resurrected.',
'CIV-31':'Low, broad 1971 brick church with modern rectangular openings and entry canopy; no demolished Gothic towers.',
'CIV-32':'Rock-faced stone nave, central tall octagonal spire, smaller flanking caps, pointed openings and portal.',
'CIV-33':'Stone Gothic nave, square corner tower, octagonal steeple, rose window and pointed portal.',
'CIV-34':'Protected brick church front, oculus, pale belfry, slender spire, fenestration and corrected roof.',
'IND-05':'Protected three-story brick mill, pale upper band and square capped tower.',
'IND-11':'Protected red mill facades, gridded industrial windows, stair tower and small hip cap.',
'MS-N-007':'Protected three-storefront Eddy Block with green frames and sandstone-colored accents.',
'MS-N-008':'Protected Spaulding brick facade, three levels, upper windows, parapet/gable and shallow canopy.',
'MS-N-012':'Protected four-story Racicot with seven top arched openings and two oriel stacks.',
'MS-N-015':'Protected Larchar three-story facade with four upper bays and bracketed cornice.',
'MS-S-006':'Protected Shumway front, three bays, nine upper windows, parapet and masonry trim.',
'CIV-17':'Existing photo-informed Thompson School facade/roof at STRUCT_ID168728_866785: classroom groups, pale trim, gabled dormers and four chimney-like stacks. Prior observed registration establishes this identity independently of the new nearest-MHC candidates.'}
remaining={
'CIV-5':'Police station civic entry, calibrated two-level window groupings and service-side transitions remain unsupported by the current material-only landmark row.',
'CIV-6':'Post office has a crafted frontage, but exact postal entry/roof/lettering are not proved complete by the landmark one-story hint.',
'CIV-10':'Bartlett High facade articulation and the ongoing 2024–27 renovation need dated registration; source outline/body is not a construction-progress model.',
'CIV-11':'Middle School institutional entry and wing-specific openings remain generic despite the two-story evidence.',
'CIV-12':'Park Avenue Elementary high-reflectance roof and one/three-story submass differences are not implemented by the hint-only row.',
'CIV-13':'All Saints brick material is represented; campus-specific entry and school bay rhythm remain modelable omissions.',
'CIV-15':'Former St Anne School English Revival trim/gables and three-level proportions remain finer than the material-only model.',
'IND-08':'North Village weave mills still need tall segmental-arched multi-pane windows and partial infill applied to the mapped low-roof blocks.',
'MS-N-009':'Gilles and Tiffany share one mapped outline. Their red/buff materials and two/three-story fronts require facade-level subdivision rather than recoloring the whole shared body.',
'MS-N-010':'Tiffany and Gilles share one mapped outline. The distinct buff three-story frontage must be segmented before applying this evidence.',
'MS-S-016':'248 Main Moderne stucco/polished-granite facade and the adjacent gray-brick double block share one outline; whole-body recoloring cannot express both.',
'MS-S-017':'256–262 Main requires a separate facade allocation within the shared source outline, including cast-stone/metal detail.',
'MS-S-018':'268 Main gray tapestry brick is represented; pressed-metal/cast-stone trim and rubber parapet-specific form remain incomplete.',
'MS-S-020':'Eastern Pearl/former bank Colonial Revival entrance and bank-specific fenestration are not encoded by the one-story hint.'}
apps=[]
for a in ledger['reviewedApplications']:
 ids=[s.removeprefix('BLD-')for s in a['targetBuildingIds']];status='';implemented='';gap=''
 if a['id'] in added:status,implemented,gap=added[a['id']]
 elif a['id'] in existing:status='already-present-partial';implemented=existing[a['id']];gap='Fine ornament, every secondary elevation, exact current glazing and current paint are not exhaustively established. Retention does not mean every sentence in the dossier is modeled.'
 elif not ids:status='uncertain-registration';gap='The structured ledger provides no accepted source-building join. Candidate proximity alone is insufficient for a site-specific replacement; resolve the registration, then implement the documented exterior traits.'
 else:
  rows=[old_by[i]for i in ids if i in old_by];material=any(r.get('material')and r.get('paint')for r in rows)
  status='remaining-supported';implemented='Mapped source body and generic openings/roof remain'+('; documented wall material/color hint applied.'if material else '; no dedicated signature geometry.')
  gap=remaining.get(a['id'],'The reviewed building program/material/height hint does not implement a dedicated entrance, window elevation or site-specific submass. These are remaining model work, not proof that the evidence is uncertain.')
  if a['id'].startswith('CC-'):gap+=' Current business signs and logos require dated exterior verification; listing a business is not a measured facade.'
 apps.append({'id':a['id'],'name':a['name'],'status':status,'buildingIds':ids or (['168728_866785']if a['id']=='CIV-17'else[]),'landmarkIds':a['targetLandmarkIds'],'evidenceIds':a['sourceEvidenceIds'],'implemented':implemented,'remaining':gap,'sourceHintFields':list(a['renderHints']),'sourceCaution':a['caution']})
app_by_evidence=defaultdict(list)
for a in apps:
 for i in a['evidenceIds']:app_by_evidence[i].append(a['id'])
app_by_id={a['id']:a for a in apps}
records=[]
for r in ledger['records']:
 applications=app_by_evidence.get(r['evidenceId'],[]);states=[app_by_id[i]['status']for i in applications]
 if r['presentState'] in ['historical_reference_only','demolished_or_removed']:status='inapplicable-as-current-identity';reason='Keep the historical identity in research; do not resurrect it or delete a replacement merely because it occupies the same site.'
 elif applications:status='application-reviewed';reason='See the linked application entries for implemented traits and explicit remaining details; this is not a claim of full dossier coverage.'
 elif r['buildingIds']:status='baseline-context-only';reason='A mapped identity exists, but no per-fact dedicated landmark completion is demonstrated. Generic residential/roof grammar may represent some broad traits; exact trim, frontage and openings remain unaudited here.'
 else:status='uncertain-registration';reason='No accepted building join in this extraction. Historical/current-status uncertainty and candidate-only matches are retained rather than treated as rendered facts.'
 records.append({'evidenceId':r['evidenceId'],'title':r['title'],'status':status,'reason':reason,'buildingIds':r['buildingIds'],'landmarkIds':r['landmarkIds'],'applicationIds':applications,'applicationStatuses':states,'presentState':r['presentState'],'factIds':[f['id']for f in r['facts']],'factCategories':sorted(set(c for f in r['facts']for c in f['categories'])),'source':r['source'],'currentExteriorObservedInPriorExtraction':r['currentExteriorObservedInThisExtraction']})
photos=[]
for p in read(SOURCE/'data/exterior-photo-observations.json'):
 photos.append({'id':p['id'],'address':p['address'],'structId':p.get('structId'),'photoDate':p.get('photoDate'),'sourceUrl':p['sourceUrl'],'status':'inapplicable-blank-photo'if not p.get('structId')else'already-present-photo-pilot','reason':'73 School property card has no usable photo; no appearance assignment.'if not p.get('structId')else'Existing eleven-property School Street pilot represents observed wall/roof/window/porch forms. Fine detail remains constrained by the 268x201 source photograph; present appearance not field-verified.','currentIdentityCaution':'116 School is the current brick civic structure, not the demolished historical house.'if p['id']=='PHOTO-SCHOOL-116'else None})
business=[]
for b in read(SOURCE/'data/businesses.json')['records']:
 business.append({'id':b['id'],'name':b['name'],'address':b['street_address'],'status':'remaining-appearance-unverified'if not b.get('appearance_observations')else'remaining-observed-traits-review','reason':'Organization/address evidence is retained as identity context, not rendered branding. No automatic business sign or logo is justified by a directory entry alone.','appearanceObservationsInAtlas':len(b.get('appearance_observations',[])),'onlineStatus':b['status']['classification'],'citations':b['citations'],'mappedBuildingClaim':False})
sources=[]
for p in [SOURCE/'implementation/landmark-evidence.json',SOURCE/'data/businesses.json',SOURCE/'data/exterior-photo-observations.json',R/'src/lib/town/evidence-landmarks.ts',R/'src/lib/town/evidence-buildings.ts',R/'src/lib/town/crafted-frontages.ts',R/'data/derived/town/residential-evidence-index.json',R/'data/derived/town/landmark-evidence.json',R/'data/derived/town/landmark-completion.json',R/'src/lib/town/civic-details.ts',R/'src/lib/town/civic-roof-finish.ts',R/'src/lib/town/landmark-completion.ts']:
 sources.append({'path':str(p),'sha256':sha(p),'bytes':p.stat().st_size})
report={'version':1,'scope':'Civic, religious, mill, Main Street, commercial-corridor, business, exterior-photo and historical-inventory evidence versus implemented source modules. This ledger deliberately does not equate research coverage with complete visual reproduction.','statusMeaning':{'implemented':'Specific listed traits coded and native all-LOD tested; limitations still apply.','implemented-historical-form':'Specific form/height follows dated evidence with an explicit current-verification gap.','already-present-partial':'Recognizable existing dedicated geometry retained; no claim that every dossier trait is complete.','remaining-supported':'Actual implementable omissions; not relabeled uncertain just because further modeling is needed.','uncertain-registration':'Identity or source-footprint allocation is unresolved, not a programming difficulty.','inapplicable-as-current-identity':'Historical/demolished identity must not be treated as a surviving present building.'},'counts':{'reviewedApplications':len(apps),'applicationStatuses':dict(Counter(a['status']for a in apps)),'evidenceRecords':len(records),'recordStatuses':dict(Counter(a['status']for a in records)),'historicFormIndexEntries':len(ledger['formIndex']),'demolitionSuppressionIdentities':len(ledger['demolitionSuppression']),'businessEntries':len(business),'exteriorPhotoRecords':len(photos)},'sources':sources,'applications':apps,'evidenceRecords':records,'exteriorPhotos':photos,'businesses':business,'criticalConflictsRetained':ledger['criticalConflicts'],'historicalIdentityPolicy':'A demolition suppression identity is not permission to delete an unrelated current structure. Dated MACRIS construction/style observations are not 2026 facade photos.','notInThisDomain':['Bridges, river walls, parks/lakes/cemeteries/dams handled by other active agents.','Road signs, memorial plaques and furniture handled by parent; no duplicate objects or unsupported signage added.']}
(OUT/'coverage-ledger.json').write_text(json.dumps(report,indent=2)+'\n')
lines=['# Civic and landmark completion coverage','',report['scope'],'','The current slice adds six application-level treatments on five source footprints: Town Hall and school share one footprint, plus St Joseph, Reconciliation, fire headquarters and the museum. It does not claim every research detail has been rendered.','',f"Reviewed {len(apps)} prepared applications, {len(records)} evidence records, {len(ledger['formIndex'])} historic-form index entries, {len(business)} business entries and {len(photos)} exterior-photo records.",'','## Actual additions and retained limits','']
for a in apps:
 if a['id']in added:lines.extend([f"- **{a['id']} — {a['name']}**: {a['implemented']} {a['remaining']}"])
lines.extend(['','## Remaining work is explicit','','The larger school campuses, North Village weave-mill window/roof treatment, shared Gilles/Tiffany and 248–262 Main frontages, and commercial entries remain useful modeling work. Business-directory identities do not authorize inferred current logos. Thompson already has a separately verified photo-model join; Rock Castle still needs an accepted building allocation in this extraction.','','## All prepared applications','','| ID | Place | Status | Existing or new treatment | Remaining work / limitation |','|---|---|---|---|---|'])
for a in apps:lines.append('| '+' | '.join(str(v).replace('|','/').replace('\n',' ') for v in[a['id'],a['name'],a['status'],a['implemented'],a['remaining']])+' |')
lines.extend(['','## Reproduction and native evidence','','Run `python3 scripts/civic_details/write-coverage.py` in the site checkout. Environment variables `WEBSTER_RESEARCH` and `WEBSTER_CIVIC_QA` select the immutable corpus and report output. The complete JSON provides every record ID, original source path/line/URL and category alongside the rendering disposition.','', '- `native-audit.json`: Town Hall side/school additions against all three original scene LODs.', '- `landmark-native-audit.json`: four replacements at all 12 tile/LOD combinations; unchanged source triangles are compared by exact attributes/material identity.', '- `civic-roof-native-audit.json`: exact original mesh arrays/transforms and pinned school-roof material assignment.', '- `landmark-unit.log` and `check-town-final.log`: focused tests and scoped TypeScript validation.','', 'The original immutable scenery archive and source atlas were not modified.'])
(OUT/'COVERAGE.md').write_text('\n'.join(lines)+'\n')
print(json.dumps(report['counts'],indent=2))
