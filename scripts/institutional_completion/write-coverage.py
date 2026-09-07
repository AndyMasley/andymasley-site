"""Coverage dispositions for the supplied civic chapter; does not mutate research."""
from pathlib import Path
import json,re,hashlib,os
repo=Path(__file__).resolve().parents[2];research=Path(os.environ.get('WEBSTER_RESEARCH','/Users/andy/Documents/New project/webster-blender/research'));work=Path(os.environ.get('WEBSTER_INSTITUTION_QA','/private/tmp/webster-final-details/institutions'));work.mkdir(parents=True,exist_ok=True)
source=research/'sections/landmark-dossiers-civic-religious.md';lines=source.read_text().splitlines();data=json.loads((repo/'data/derived/town/institutional-completion.json').read_bytes());records={}
for n,line in enumerate(lines,1):
 m=re.match(r'#### (CIV-\d+) — (.*)',line)
 if m:records[m[1]]={'id':m[1],'name':m[2].split(' (existing')[0],'sourceLine':n}
 m=re.match(r'\| (CIV-\d+[a-z]?) \| ([^|]+)\|',line)
 if m:records[m[1]]={'id':m[1],'name':re.sub(r'`[^`]+`','',m[2]).strip(' ,'),'sourceLine':n}
for r in data['rows']:
 for key in r['evidenceId'].split(' / '):
  records.setdefault(key,{'id':key,'name':r['name'],'sourceLine':next((n for n,line in enumerate(lines,1)if key.split('-RECTORY')[0].split('-PARISH')[0]+' 'in line),1)})
  records[key].update(status='implemented_in_this_module',sourceIds=[r['id']],details=r['observed'],limitations=r['inferred'],urls=[s['url']for s in r['sources']])
existing={'CIV-1':'Exact protected Town Hall plus civic rear/side window and masonry corrections remain active.','CIV-2':'Protected Sitkowski school plus pale entrance, roof material and facade detail layers remain active.','CIV-3':'Existing Kelly Library modern landmark treatment remains; fine current glazing survey not claimed.','CIV-7':'Existing exact-source guarded headquarters apparatus-door row; annex/secondary station exteriors remain source bodies without a separate verified facade survey.','CIV-8':'Existing guarded museum front/head-house treatment; retained tall original drill-hall silhouette remains.','CIV-17':'Protected photographed Thompson School with gables, grouped windows, dormer and stacks remains.','CIV-24':'Protected photographed District Five red schoolhouse/vestibule remains; no historic interior recreated.','CIV-30':'Existing St Joseph Basilica twin copper-spire/terracotta signature remains; school/gym/convent are separately assessed below.','CIV-31':'Existing current St Louis low church/source-constrained treatment remains.','CIV-32':'Existing Sacred Heart stone church signature remains; rectory is added separately in this module.','CIV-33':'Existing First Baptist stone Gothic signature remains; associated residential house is not re-labelled as a church.','CIV-34':'Protected photo-informed Federated brick church, steeple and facade remain.','CIV-35':'Existing guarded Reconciliation tower and entry remain; parish house added separately in this module.','CIV-54':'Duplicate institutional identity of CIV-2, not another building to add.','CIV-9d':'The current brick civic building at 116 School is the existing documented photo target. The demolished Burnham house is not resurrected.','CIV-9f':'Duplicate of protected District Five schoolhouse CIV-24.'}
for key,detail in existing.items():
 if key in records:records[key].update(status='already_specific_or_protected',details=[detail])
historical={'CIV-16':'Filmer school address is now a retained modern bank footprint; do not put a historic school over the existing bank. MHC no-demolition flag is not proof of present survival.','CIV-22':'North Village schoolhouse is demolition-flagged; no historic replacement is inserted into the current scene.','CIV-23':'Old Prospect school was replaced by Thompson; a Chase school is not established.','CIV-41h':'Historical Methodist/French Catholic building is not reliably joined to a surviving source body.','CIV-41i':'St Anthony church was demolished in 1978; present Dudley church is outside the town reconstruction. Its possible former school is already the current CIV-9d body, with identity caveat.'}
for k,v in historical.items():
 if k in records:records[k].update(status='historical_not_rebuilt',details=[v])
delegated={'CIV-4','CIV-9a','CIV-9b','CIV-9g','CIV-41g','CIV-60','CIV-61','CIV-62','CIV-63'}
for k in delegated:
 if k in records:records[k].update(status='environment_domain',details=['Source buildings/objects and environment layers are reviewed in the separate environment/roadside coverage. This institution ledger does not imply every site furnishing was added here.'])
known={
'CIV-9':'Grouped municipal short records are assessed individually; assessor use class alone does not establish exterior detail.',
'CIV-9c':'DPW storage bodies are mapped; source has no trustworthy door count, cladding, current yard inventory or shed roof measurements.',
'CIV-9e':'Municipal house is mapped; Veterans Way name does not establish veterans-services occupancy or a sign.',
'CIV-14':'School and gym identities are supported at campus scale, but exact assignment of the two large outlines is inferred and exterior material/roof/entry descriptions are absent. No unsupported facade or completed future work added.',
'CIV-19':'Converted schoolhouse/house: residential packet exists for principal SID 168388_865747 with documented=false; current generic residential form is not a claim that all historic ornament is present.',
'CIV-20':'Former schoolhouse requires current footprint/survival resolution; civic source gives date/use but not a sufficient present architectural description.',
'CIV-21':'Gore schoolhouse identity is historic; current source registration and survival remain unverified.',
'CIV-39':'Greek Orthodox church identity/date and broad footprint are known; the supplied source explicitly cannot distinguish dome, basilican plan or modern A-frame. A 1920s drawing belongs to the burned High Street predecessor and is not applied to the current 1968 church.',
'CIV-41':'Grouped religious short records are assessed individually; directory identities never become invented signs.',
'CIV-41a':'Advent church is a converted dwelling; source residential packet SID 168448_866377 is retained and documented=false. No present church branding is inferred.',
'CIV-41c':'8 Slater former parsonage is current apartment property. Source residential packet SID 169322_867594 is retained and documented=false; no unsupported current congregation identity.',
'CIV-41d':'Directory-only storefront congregation address; current business/sign/paint is not verified. Existing Main Street building treatment retained.',
'CIV-41e':'Directory-only ministries in office/apartment buildings; no supported custom facade or current signage.',
'CIV-41f':'Convent is identified on the basilica campus, but exact exterior description and current building assignment are not sufficiently established.',
'CIV-51':'PACC and TSKK have mapped principal bodies and use/age records, but the corpus supplies no observed material, entrance, glazing or facade rhythm. Their existing source bodies are retained.',
'CIV-52':'Veterans hall has a mapped 1920 two-story outline; exterior description is absent, so no invented insignia, window pattern or current banners.',
'CIV-53':'Grouped club records are assessed individually.',
'CIV-53b':'10 Dresser hall operator/appearance is not established.',
'CIV-53c':'27 Brandes hall operator/appearance is not established.',
'CIV-53d':'Killdeer club identity is supported; current exterior shape/material detail beyond the retained footprint is absent from the corpus.',
'CIV-53e':'Fish and Game club identity is supported; current facade, entrance and cladding are unobserved.',
'CIV-53f':'200 Sportsmen club identity is supported; current facade and grounds detail are unobserved.',
'CIV-55':'WHA documents garden walk-ups and family duplex/fourplex types; assessor counts include ancillary/service bodies. Generic retained housing is not a photographic campus reconstruction. Exact exterior materials, entries, stair locations and paint are missing.',
'CIV-56':'Care facilities have use/size/age records; the individual rows below distinguish identity from appearance.',
'CIV-56a':'Webster Manor: four-story modern mapped slab is retained; historic demolished Smith–Tiffany house must not replace it. Brick/panel colors in the chapter are explicitly conjectural.',
'CIV-56b':'Lanessa: large one-story source footprint and facility identity are retained. No observed wall/roof/entrance details supplied.',
'CIV-56c':'11 Pontiac nursing facility: assessor footprint/use only; operator and appearance not established.',
'CIV-56d':'Christopher Heights: mapped three-story form/identity, without a present facade photograph or distinctive exterior specification.',
'CIV-56e':'Care/educational premises: assessor-only operators and appearance; no fabricated YMCA identity.',
'CIV-56f':'37 Sutton health club: mapped large single-story body; operator and appearance unknown.'}
for k,v in known.items():
 if k in records:records[k].update(status='retained_source_insufficient_for_specific_completion',details=[v])
commercialPath=repo/'data/derived/town/commercial-completion.json';commercial=json.loads(commercialPath.read_bytes());commercialById={r['id']:r for r in commercial['rows']}
for r in records.values():
 line=r['sourceLine']-1;block=lines[line:line+1]
 if lines[line].startswith('####'):
  end=next((n for n in range(line+1,len(lines))if lines[n].startswith('####')),len(lines));block=lines[line:end]
 ids=set(re.findall(r'BLD-(\d+_\d+)','\n'.join(block)))|set(r.get('sourceIds',[]));matches=[commercialById[k]for k in sorted(ids)if k in commercialById]
 if matches:
  r['commercialProgramTreatments']=[{'sourceId':m['id'],'name':m['name'],'recipes':sorted(set(f['recipe']for f in m['frames'])),'basis':'Current-source guarded commercial program inference; not a dated exterior photograph or historic-form reproduction.'}for m in matches]
  if r.get('status')=='retained_source_insufficient_for_specific_completion':r['status']='commercial_program_treatment_present_historic_detail_unverified'
  r.setdefault('details',[]).append('A separate commercial program treatment is present for '+', '.join(m['id']+' ('+m['name']+')'for m in matches)+'. Its entry/glazing/bay rhythm is inferred; site-specific historic or current photo appearance remains unverified. No duplicate institutional replacement is added.')
 r.setdefault('status','group_cross_reference');r.setdefault('details',['Group heading or cross-reference; specific buildings are assessed in the linked rows.']);r.setdefault('limitations',[]);r['source']={'path':'research/sections/landmark-dossiers-civic-religious.md','line':r.pop('sourceLine'),'sha256':hashlib.sha256(source.read_bytes()).hexdigest()}
# Explicit remaining features with adequate description but incomplete placement.
remaining=[{'site':'Former Zion Church','sourceId':'169081_867095','feature':'Battlements','status':'partly_supported_placement_unresolved','reason':'The dated form explicitly records battlements, but gives no location/dimensions or current survival. Clapboard, arched glazing and brackets are implemented; a guessed corner tower is not.','source':'research/sections/macris-forms-145-229.md:585'}, {'site':'James Howe Slater Parish House','sourceId':'168654_867234','feature':'Cloister connection','status':'documented_connection_route_unresolved','reason':'A cloister to the church is documented. The retained principal footprints do not establish the exact roof/column alignment across the intervening area. No unsupported freestanding link is placed across paths.','source':'research/sections/macris-forms-001-073.md:640'}, {'site':'Sacred Heart Rectory','sourceId':'168842_867203','feature':'Full veranda depth and exact portico','status':'represented_with_bounded_inference','reason':'The wrap and upper portico are now visible, but their depth is deliberately capped under 0.8 m beyond the old roofprint; a measured full-depth reconstruction requires a registered exterior reference.','source':'research/sections/macris-forms-145-229.md:491'}]
report={'version':1,'asOf':'2026-09-07','scope':'All numbered civic chapter headings and short-table rows, plus independently read relevant MACRIS forms. This is a feature disposition ledger, not a claim of current photographic verification for every site.','commercialCatalogCount':len(commercial['rows']),'commercialCatalogSha256':hashlib.sha256(commercialPath.read_bytes()).hexdigest(),'institutionCommercialSourceIntersection':sorted(set(commercialById)&{r['id']for r in data['rows']}),'newBuildingCount':len(data['rows']),'applications':[{'id':r['id'],'name':r['name'],'tileId':r['tileId'],'evidenceId':r['evidenceId'],'observed':r['observed'],'inferred':r['inferred'],'sources':r['sources']}for r in data['rows']],'coverage':sorted(records.values(),key=lambda r:(int(re.search(r'\d+',r['id'])[0]),r['id'])),'remainingFeatureLimits':remaining,'noNewCurrentSigns':True}
(work/'coverage-ledger.json').write_text(json.dumps(report,indent=2)+'\n')
md=['# Institutional completion and wider civic coverage','',f"This module now replaces {len(data['rows'])} matched generic institutional bodies. The source outline, base, identity and tile hashes remain binding. Dated architectural descriptions guide the forms; exact dimensions, absent current colors and unmapped roof subdivisions remain explicit interpretations.",'','## New rendered forms','','| Site | Stable source ID | Applied detail |','|---|---|---|']
for r in data['rows']:md.append(f"| {r['name']} | {r['id']} | {' '.join(r['observed'])} |");
md+=['','## Wider civic review','','The following dispositions cover the entire numbered civic chapter, including religious, club, care, former-school and campus records. “Already specific” means a particular model exists; it does not mean every research phrase has been recreated. “Source insufficient” identifies the missing architectural evidence, not unfinished code hidden behind an uncertainty label.','','| Record | Disposition | Reason / precise limit |','|---|---|---|']
for r in report['coverage']:md.append(f"| [{r['id']} — {r['name']}](<{source.as_posix()}:{r['source']['line']}>) | {r['status'].replace('_',' ')} | {' '.join(r['details'])} |")
md+=['','## Explicit feature limits','']
for r in remaining:md.append(f"- **{r['site']}: {r['feature']}.** {r['reason']}")
md+=['','## Reproduction','','Run `python3 scripts/prepare-institutional-completion.py`, the focused Vitest file, `node scripts/institutional_completion/audit.mjs`, and `python3 scripts/institutional_completion/geometry-data-audit.py` from the website checkout. Generator inputs are whitelisted committed data; no cloud-only source geometry or owner records are required.','', 'The isolated visual harness prepares a local source-tile preview with `node scripts/institutional_completion/visual.mjs --prepare`. Serve its reported work-directory `preview` on port 54435, then run the command without `--prepare`. This is a geometry/material inspection, not a complete runtime/FPS acceptance test. Playwright path and Chrome executable may need local adaptation.','', 'Apply `applyInstitutionalCompletion(group, tileId, origin, level, sourceSha256)` before crafted fronts and evidence recoloring. Pass only its successful `ids` to the optional fifth `applyCraftedFrontages` argument. A source mismatch retains the old source and old crafted frontage. The normal world material pool and tile disposal own the generated batched resources.','']
(work/'COVERAGE.md').write_text('\n'.join(md));print(len(records),'coverage records;',len(data['rows']),'new buildings')
