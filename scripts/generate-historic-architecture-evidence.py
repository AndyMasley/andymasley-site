#!/usr/bin/env python3
"""Join dated MACRIS appearance evidence to current mapped buildings conservatively.

No nearest-point matching: approval requires containment in one mapped footprint,
the principal-structure gate, compatible current/atlas addresses, and a parcel
construction year no later than the dated form. Descriptions remain historical.
"""
import argparse
import collections
import hashlib
import json
import math
import re
from pathlib import Path

parser=argparse.ArgumentParser()
parser.add_argument('--research',type=Path,default=Path('/Users/andy/Documents/New project/webster-blender/research'))
parser.add_argument('--reports',type=Path,default=Path('/private/tmp/webster-realism-v2-building/townwide-assets'))
args=parser.parse_args();root=Path(__file__).resolve().parents[1]
paths={key:args.research/path for key,path in {'ledger':'implementation/landmark-evidence.json','register':'data/building-register.json','landmarks':'data/landmarks.json','footprints':'data/buildings-current.geojson'}.items()}
ledger=json.loads(paths['ledger'].read_text());register={r['structId']:r for r in json.loads(paths['register'].read_text())};landmarks={r['mhc_id']:r for r in json.loads(paths['landmarks'].read_text())['records']}
forms={r['mhcId']:r for r in ledger['formIndex']}
polygons=[]
for f in json.loads(paths['footprints'].read_text())['features']:
    q=f['geometry']['coordinates'][0]
    polygons.append((f['properties']['STRUCT_ID'],q,(min(p[0] for p in q),min(p[1] for p in q),max(p[0] for p in q),max(p[1] for p in q))))
def inside(p,polygon):
    x,y=p;result=False
    for a,b in zip(polygon,polygon[1:]+polygon[:1]):
        if (a[1]>y)!=(b[1]>y) and x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0]:result=not result
    return result
def clean(s):return re.sub(r'\s+',' ',s.replace('**','').replace('`','').replace('—','-').replace('–','-')).strip()
def ids_in(title):
    result=set()
    for match in re.finditer(r'WEB[.-](\d+)(?:\s*[-–]\s*(?:WEB\.)?(\d+))?',clean(title)):
        a=int(match[1]);b=int(match[2]) if match[2] else a
        if a<=b<a+25:result.update(f'WEB.{i}' for i in range(a,b+1))
        else:result.add(f'WEB.{a}')
    return result
def address(raw):
    s=(raw or '').upper().replace('½',' 1/2').replace('–','-').replace('.','')
    replacements={'STREET':'ST','ROAD':'RD','AVENUE':'AVE','COURT':'CT','DRIVE':'DR','LANE':'LN','PARKWAY':'PKWY','SOUTH':'SOUTH','NORTH':'NORTH','EAST':'EAST','WEST':'WEST'}
    s=re.sub(r'\b(STREET|ROAD|AVENUE|COURT|DRIVE|LANE|PARKWAY)\b',lambda m:replacements[m[0]],s)
    m=re.match(r'^(\d+[A-Z]?(?:\s*[-/]\s*\d+[A-Z]?)?(?:\s+1/2)?)\s+(.+)$',s)
    if not m:return s.strip(),None
    if re.search(r'\s+1/2$',m[1]):
        value=int(re.match(r'\d+',m[1])[0])+.5
        return m[2].strip(),(value,value)
    numbers=[int(n) for n in re.findall(r'\d+',m[1])];return m[2].strip(),(min(numbers[:2]),max(numbers[:2]))
def address_match(a,b):
    sa,na=address(a);sb,nb=address(b)
    if sa!=sb:return 'street_mismatch'
    if na is None:return 'street_only'
    if nb is None:return 'current_number_missing'
    if max(na[0],nb[0])<=min(na[1],nb[1]):return 'exact_or_overlapping_number'
    return 'number_mismatch'
def year(raw):
    years=re.findall(r'\b(1[6-9]\d{2}|20[0-2]\d)\b',str(raw or ''))
    return max(map(int,years)) if years else None

# The later area-form chapter has a single form date at the start of each area,
# followed by many separately titled buildings. Preserve that inherited date.
chapter_dates={}
for path in sorted((args.research/'sections').glob('macris-*.md')):
    lines=path.read_text().splitlines();current=1978
    dates=[]
    for lineno,line in enumerate(lines,1):
        if re.search(r'\b(?:recorded|surveyed|prepared)\b',line,re.I) and (y:=year(line)):
            if y>=1970:current=y
        dates.append(current)
    chapter_dates[str(path)]=dates
records_by_id=collections.defaultdict(list)
for record in ledger['records']:
    if not record['evidenceId'].startswith('macris-'):continue
    ids=ids_in(record['title'])|{i for i in record['mhcIds'] if re.fullmatch(r'WEB\.\d+',i)}
    for mid in ids:records_by_id[mid].append(record)

def form_year(record,mid):
    # A later explicit group/area description supersedes an earlier single form,
    # but not the current parcel geometry or a demolition/replacement gate.
    if 'area-forms-north-south' in record['source']['path']:return 2000
    if record['title'].startswith('Area form'):return 2000
    # Do not inherit years from a preceding building's history/bibliography.
    # The dedicated reachability table is the authoritative form-date index.
    return form_year_by_id.get(mid) or 1978
form_year_by_id={mid:year(f['formDateRaw']) for mid,f in forms.items()}

NUMBERS={'one':1,'two':2,'three':3,'four':4,'five':5,'six':6,'seven':7,'eight':8,'nine':9,'ten':10,'eleven':11,'twelve':12,'eighteen':18}
def number(value):
    v=value.lower().replace('-',' ').strip()
    if v in NUMBERS:return NUMBERS[v]
    if re.fullmatch(r'\d+(?:\.\d+)?',v):return float(v)
    for fraction,amount in [('one half',.5),('a half',.5),('three quarters',.75),('one quarter',.25)]:
        if fraction in v:return NUMBERS.get(v.split()[0],0)+amount
    for symbol,amount in [('½',.5),('¾',.75),('¼',.25)]:
        if symbol in v:return float(v.replace(symbol,''))+amount
    return None
NUMBER=r'(?:\d+(?:\.\d+|[½¾¼])?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|eighteen)(?:(?:[- ]and)?[- ](?:one[- ]half|a[- ]half|three[- ]quarters|one[- ]quarter))?'
def field(kind,value,statement,record,mid,line=None):
    return {'field':kind,'value':value,'statement':statement,'sourceYear':form_year(record,mid),'basis':'explicit_dated_description',
        'source':{'evidenceId':record['evidenceId'],'path':record['source']['path'],'line':line or record['source']['lineStart'],'urls':record['source']['urls'] or [forms.get(mid,{}).get('formUrl')],
        'formIndexLine':forms.get(mid,{}).get('line')},'currentObserved':False}
def roof_values(text):
    s=text.lower();result=[]
    patterns={'mansard':r'\bmansard\b','gambrel':r'\bgambrel\b','hip':r'\bhip(?:ped)?(?:[- ](?:slate|asphalt|metal|high|low|steep))*[- ]roof|\bdeck-on-hip\b',
        'gable':r'\b(?:(?:front|side|cross)[- ])?gabl(?:e|ed)(?:[- ](?:slate|asphalt))*[- ]roof|\b(?:front|side|cross)[- ]gabl(?:e|ed)(?:[- ]plan|\b)|\bgable ends? (?:to|toward|facing|turned toward) (?:the )?street|\bpedimented gable\b',
        'flat':r'\bflat[- ]roof','saltbox':r'\bsaltbox\b'}
    for shape,pattern in patterns.items():
        for match in re.finditer(pattern,s):
            before=s[max(0,match.start()-65):match.start()]
            after=s[match.end():match.end()+35]
            # A dormer, porch, barn or lost roof is not the principal building roof.
            if re.search(r'\b(?:rear|porch|dormer|barn|tower|ell|addition|hood|cupola|portico|oriel)\b[^.;]{0,45}$',before):continue
            if re.match(r'(?:ed|s)?[- ](?:dormer|porch|hood|portico|addition|ell|barn)\b',after):continue
            if re.search(r'\b(?:originally|removed|lost|demolished|no longer|not a)\b[^.;]{0,50}$',before):continue
            result.append(shape);break
    # A gambrel or mansard explicitly named is more specific than its gabled end.
    if 'gambrel' in result:result=[x for x in result if x!='gable']
    if 'mansard' in result:result=[x for x in result if x not in ['hip','gable']]
    if 'saltbox' in result:result=[x for x in result if x!='gable']
    return result
def extracted(record,mid):
    fields=[]
    for fact in record['facts']:
        text=clean(fact['statement']);label_match=re.match(r'^- ([^.:]{1,180})[.:]',text)
        # Unlabelled shared-group introductions can fall after a named heading;
        # they must not be assigned to the preceding individual building.
        if not label_match:continue
        label=label_match[1].lower()
        if fact.get('historicalNarrative') or re.match(r'^(?:history|bibliography|conflicts|atlas check|comparanda|outbuildings|foundation and outbuildings|lost |rear additions|setting|siting|significance|form numbering|inventory)',label):continue
        if 'inferred' in text.lower() and not text.lower().startswith('- walls'):continue
        massing=any(s in label for s in ['massing','roof','form','plan','size']) and not label.startswith('form:')
        if massing:
            for shape in roof_values(text):fields.append(field('roofShape',shape,text,record,mid,fact['line']))
            for match in re.finditer(r'\b('+NUMBER+r')[- ]stor(?:ey|y|ies|eys)\b',text,re.I):
                before=text[max(0,match.start()-35):match.start()].lower();after=text[match.end():match.end()+25].lower()
                if re.search(r'originally|not a|not a full|rear|addition|ell|porch|barn|dormer',before):continue
                if re.match(r'\s+(?:porches?|additions?|ells?|barns?|dormers?|pavilion)',after):continue
                value=number(match[1])
                if value and value<=6:fields.append(field('stories',value,text,record,mid,fact['line']))
        if massing or any(s in label for s in ['bay','facade','façade','plan']):
            for match in re.finditer(r'\b('+NUMBER+r')[- ]bay(?:s)?(?:[- ](?:long|wide|facade|façade|front|house|block|cottage))?',text,re.I):
                before=text[max(0,match.start()-30):match.start()].lower();after=text[match.end():match.end()+35].lower()
                if re.search(r'side|deep|ell|rear|dormer',before) or re.match(r'\s+(?:deep|on the side|wide \[deep\])',after):continue
                value=number(match[1])
                if value and value<=24:fields.append(field('frontageBays',value,text,record,mid,fact['line']))
        if any(s in label for s in ['walls','construction','materials']):
            main=text.split('Trim',1)[0].split('Foundation',1)[0]
            # Keep mixed materials literal; renderer must not replace composite walls
            # with whichever material happens to occur first in a paragraph.
            values=[]
            for material,pattern in [('granite',r'granite'),('brick',r'\bbrick\b'),('clapboard',r'clapboard'),('shingle',r'\bshingles?\b|shingled'),('stucco',r'stucco'),('aluminum_siding',r'aluminum'),('vinyl_siding',r'vinyl'),('asbestos_siding',r'asbestos')]:
                if re.search(pattern,main,re.I):values.append(material)
            if len(values)>1 and 'asbestos_siding' in values and 'shingle' in values:values.remove('shingle')
            if len(values)>1 and 'vinyl_siding' in values and 'shingle' in values:values.remove('shingle')
            if values:fields.append(field('wallMaterials',values,text,record,mid,fact['line']))
    return fields

# Exact members of the Elm and School Street area descriptions. These are
# per-address transcriptions of architectural statements, never generalized
# from a nearby house or from an architectural-style label alone.
manual=[]
def add(mid,line,**hints):manual.append((f'WEB.{mid}',line,hints))
for mid in [346,347,348,359,361,362]:add(mid,946,roofShape='hip',stories=3)
for mid in [346,347,348]:add(mid,946,frontageBays=2)
add(362,946,frontageBays=3)
add(363,946,roofShape='gable',stories=1.5,frontageBays=3)
for mid in [350,352,353,354,365]:add(mid,944,roofShape='gable')
add(350,944,stories=1.5,frontageBays=3,wallMaterials=['vinyl_siding'])
add(352,944,stories=2.5,wallMaterials=['vinyl_siding'])
add(354,944,stories=2.5)
add(365,944,stories=1.5,wallMaterials=['aluminum_siding'])
add(366,944,roofShape='hip')
for mid in [349,351]:add(mid,945,roofShape='hip',stories=2.5,frontageBays=3)
add(358,947,roofShape='gable',roofVariant='jerkinhead',stories=2.5,wallMaterials=['aluminum_siding'])
add(357,947,roofShape='gable',stories=2.5,frontageBays=3,wallMaterials=['shingle'])
# 30 Elm is described as apparently original; retain uncertainty instead of an
# automatic historical-roof instruction because its alterations are unresolved.
add(355,947,wallMaterials=['vinyl_siding'])
add(142,958,roofShape='gable',roofVariant='cross_gable',stories=2.5)
add(378,958,stories=2.5,frontageBays=5)
add(381,958,roofShape='gable',stories=1.5,frontageBays=3)
add(141,958,roofShape='hip',roofVariant='gable_on_hip')
add(371,959,roofShape='hip',stories=2.5,frontageBays=3,wallMaterials=['brick'],wallColor='yellow pressed brick')
add(373,959,roofShape='hip',roofVariant='front_hip_rear_gable',frontageBays=3)
add(370,959,frontageBays=7)
add(369,959,roofShape='hip',frontageBays=3)
add(383,960,roofShape='gable',stories=2,wallMaterials=['stucco'])
add(367,960,roofShape='gable',stories=1.5,frontageBays=3)
add(376,960,roofShape='gambrel',roofVariant='jerkinhead',stories=1.5)
add(368,961,roofShape='hip',frontageBays=3,wallMaterials=['shingle'])
add(374,961,roofShape='gable',wallMaterials=['brick'])
chapter=args.research/'sections/macris-forms-145-229.md';chapter_lines=chapter.read_text().splitlines()
manual_fields=collections.defaultdict(list)
for mid,line,hints in manual:
    actual=chapter_lines[line-1]
    record={'evidenceId':f'macris-forms-145-229:area-address:{mid}:L{line}','title':'Area form exact-address extraction','source':{'path':str(chapter),'lineStart':line,'urls':[f'https://mhc-macris.net/Documents/WEB/PDFs/WEB_{"Q" if line<950 else "R"}.pdf']}}
    for key,value in hints.items():
        evidence=field(key,value,'Exact member of the address-specific area description; see the complete paragraph in the cited source.',record,mid,line)
        evidence['sourceYear']=2000;evidence['basis']='reviewed_exact_address_area_description';manual_fields[mid].append(evidence)

audit=[];rows=[]
for mid,form in sorted(forms.items(),key=lambda x:int(x[0].split('.')[1]) if x[0].split('.')[1].isdigit() else 10000):
    landmark=landmarks.get(mid);reasons=[]
    entry={'mhcId':mid,'landmarkId':form['landmarkId'],'formReachability':form['reachabilityRaw'],'formSource':{'path':form['sourcePath'],'line':form['line'],'url':form['formUrl']}}
    if not landmark:entry.update(status='no_atlas_identity');audit.append(entry);continue
    point=landmark['coordinates'];entry['inventoryName']=landmark['name'];entry['inventoryAddress']=landmark['address'];entry['currentInventoryStatus']=landmark['status']['category']
    if not point:entry.update(status='no_point');audit.append(entry);continue
    contains=[sid for sid,q,box in polygons if box[0]<=point[0]<=box[2] and box[1]<=point[1]<=box[3] and inside(point,q)]
    entry['containingBuildingIds']=['BLD-'+s for s in contains]
    if 'demolished' in landmark['status']['category'] or landmark.get('mhc_inventory_retrieved_2026',{}).get('DEMOLISHED'):
        entry.update(status='demolished_gate');audit.append(entry);continue
    if len(contains)!=1:entry.update(status='no_unique_containing_polygon');audit.append(entry);continue
    sid=contains[0];building=register[sid];status=address_match(landmark['address'],building['parcelAddress']);entry['currentAddress']=building['parcelAddress'];entry['addressCheck']=status
    if not building['principalStructureInferred']:reasons.append('ancillary_or_compound_structure')
    if status not in ['exact_or_overlapping_number','street_only']:reasons.append(status)
    if landmark['resource_type']!='Building':reasons.append('non_building_inventory_type')
    if re.search(r'\bbarn\b|\bgarage\b',landmark['name'],re.I):reasons.append('outbuilding_identity_not_parcel_house')
    fields=[]
    for record in records_by_id[mid]:fields.extend(extracted(record,mid))
    fields.extend(manual_fields[mid])
    observed_year=max((f['sourceYear'] for f in fields),default=form_year_by_id.get(mid) or 1978)
    built=building['assessorYearBuilt'];historic_year=year(landmark.get('construction_date_text'))
    entry.update(assessorYearBuilt=built,historicConstructionYear=historic_year,latestDescriptionYear=observed_year)
    if not built:reasons.append('assessor_construction_year_missing')
    elif built>observed_year:reasons.append('parcel_building_postdates_description')
    if built and historic_year and abs(built-historic_year)>65:reasons.append('construction_dates_conflict_over_65_years')
    if not fields:reasons.append('no_explicit_appearance_fields')
    if reasons:entry.update(status='review_required',reasons=reasons);audit.append(entry);continue
    # Newer documented observations take precedence for each field. Conflicting
    # statements in the same observation year remain null, with candidates kept.
    selected={};conflicts={}
    for key in sorted({f['field'] for f in fields}):
        candidates=[f for f in fields if f['field']==key];latest=max(f['sourceYear'] for f in candidates);candidates=[f for f in candidates if f['sourceYear']==latest]
        manual_candidates=[f for f in candidates if f['basis']=='reviewed_exact_address_area_description']
        if manual_candidates:candidates=manual_candidates
        values={json.dumps(f['value'],sort_keys=True):f['value'] for f in candidates}
        if len(values)==1:selected[key]=next(iter(values.values()))
        else:selected[key]=None;conflicts[key]=list(values.values())
    report_path=args.reports/(sid+'.report.json');report=json.loads(report_path.read_text()) if report_path.exists() else None
    existing_roofs=sorted({m.get('roof') for m in (report or {}).get('masses',[]) if m.get('roof')})
    if report and not existing_roofs:existing_roofs=[report.get('roof_style') or report.get('roof_form') or report.get('roof','unspecified')]
    row={'structId':sid,'buildingId':'BLD-'+sid,'mhcIds':[mid],'name':landmark['name'],'address':building['parcelAddress'],
        'roofShape':selected.get('roofShape'),'roofVariant':selected.get('roofVariant'),'frontageBays':selected.get('frontageBays'),'stories':selected.get('stories'),
        'wallMaterials':selected.get('wallMaterials'),'wallColor':selected.get('wallColor'),'fieldConflicts':conflicts,
        'sourceYear':observed_year,'reliability':{'identity':'point_inside_one_principal_footprint_plus_address_and_construction_year_checks',
            'appearance':'dated_historical_description_guides_plausible_form_current_exterior_unverified','address':status,'constructionYearDelta':abs(built-historic_year) if historic_year else None},
        'gates':{'demolished':False,'replacementAfterDescription':False,'principalStructure':True,'pointInsideFootprint':True,'constructionYearChecked':True,'currentExteriorObserved':False},
        'currentSource':{'assessorYearBuilt':built,'assessorStyle':building['assessorStyle'],'assessorStories':building['assessorStories'],'assessorFY':building['assessorFY'],
            'footprintSourceDate':building['footprintSourceDate'],'footprintSourceData':building['footprintSourceData'],'sourceEditDate':building['sourceEditDate'],
            'genericV2ReportExists':bool(report),'existingRoofForms':existing_roofs},
        'evidence':fields,'cautions':['A historical form and current mapped outline do not establish a current exterior survey.','Roof dimensions and present materials remain inferred; retain modern photo evidence and preserve compound building parts.']}
    rows.append(row);entry.update(status='joined_dated_evidence',buildingId='BLD-'+sid,fields=[k for k,v in selected.items() if v is not None]);audit.append(entry)

# If multiple inventory identities landed on the same footprint, retain evidence
# without authorizing a whole-body replacement. Do not confuse a shared point or
# compound roofprint with separate houses.
counts=collections.Counter(row['structId'] for row in rows)
for row in rows:
    row['sharedFootprint']=counts[row['structId']]>1
    row['allowRoofFormInference']=row['roofShape'] is not None and not row['sharedFootprint'] and row['currentSource']['genericV2ReportExists']
    row['allowMaterialInference']=row['wallMaterials'] is not None and len(row['wallMaterials'])==1 and not row['sharedFootprint'] and row['currentSource']['genericV2ReportExists']
    if row['sharedFootprint']:row['cautions'].append('More than one inventory identity maps into this footprint; retain source segmentation.')
out={'schemaVersion':1,'asOf':'2026-09-06','method':'Containment, normalized atlas/current address, principal footprint, building type and construction-year gates; dated explicit physical descriptions only.',
    'sourceHashes':{k:hashlib.sha256(p.read_bytes()).hexdigest() for k,p in paths.items()},
    'rules':['Never use nearest MHC point alone.','Never equate a current parcel use with historic building survival.','Do not infer a roof from an architectural-style label.','No demolished or post-form replacement geometry is authorized.','Newer form observations supersede older fields; conflicting same-year values remain null.','All quoted architectural facts retain historical dates; current observed is always false.'],
    'counts':{'formsIndexed':len(audit),'auditStatus':dict(collections.Counter(a['status'] for a in audit)),'joinedRecords':len(rows),'distinctBuildings':len(set(r['structId'] for r in rows)),
        'roofInferenceAllowed':sum(r['allowRoofFormInference'] for r in rows),'materialInferenceAllowed':sum(r['allowMaterialInference'] for r in rows),'roofShapes':dict(collections.Counter(r['roofShape'] for r in rows if r['roofShape'])),
        'conversionStyle':sum(r['currentSource']['assessorStyle']=='CONVERSION' for r in rows)},'rows':rows,'audit':audit}
path=root/'data/derived/town/historic-architecture-evidence.json';path.write_text(json.dumps(out,separators=(',',':'),ensure_ascii=False)+'\n')
print(json.dumps({**out['counts'],'bytes':path.stat().st_size,'path':str(path)},indent=2))
