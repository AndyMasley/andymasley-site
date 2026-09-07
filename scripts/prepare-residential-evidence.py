"""Extract dated residential evidence and generate static, hashed per-tile game profiles.

Original photographs, owner details, prices and interiors are not copied. Listing
facts remain dated secondary evidence; assessor style drives explicitly inferred
geometry-aligned trim profiles. Existing source geometry is never modified.
"""
import argparse, collections, hashlib, json, math, pathlib, re, struct, sys

SITE = pathlib.Path(__file__).resolve().parents[1]
SOURCE = pathlib.Path('/Users/andy/Documents/New project/webster-blender')
REPORTS = pathlib.Path('/private/tmp/webster-realism-v2-building/townwide-assets')

def cells(line):return [s.strip().replace('\\|','|') for s in re.split(r'(?<!\\)\|',line.strip())[1:-1]]
def urls(text):return re.findall(r'https?://[^\s)<>]+',text)
def norm(a):
 a=re.sub(r'\([^)]*\)','',str(a or '')).upper().replace('–','-').replace('—','-');a=re.sub(r'[^A-Z0-9 \-/]','',a)
 aliases={'STREET':'ST','ROAD':'RD','AVENUE':'AVE','LANE':'LN','DRIVE':'DR','COURT':'CT','TERRACE':'TER','PARKWAY':'PKWY','PLACE':'PL','EXTENSION':'EXT','FIRST':'1ST','SECOND':'2ND','THIRD':'3RD','FOURTH':'4TH','FIFTH':'5TH','N':'NORTH','S':'SOUTH','E':'EAST','W':'WEST','HL':'HILL'}
 return ' '.join(aliases.get(w,w) for w in a.split())
def known(v):return v not in ('','n/s','—','–')
def field(v):return v if known(v) else None
def exterior_only(v):
 for old,new in [(' (contemporary, vaulted)',' (contemporary)'),('attached 2-car heated','attached 2-car'),('attached 2-car insulated','attached 2-car'),('attached 2-car w/ workshop','attached 2-car'),('detached 2-car w/ workshop','detached 2-car'),('insulated 2-car','2-car'),('enclosed knotty-pine front porch','enclosed front porch')]:v=v.replace(old,new)
 v=re.sub(r'\s*[;+]\s*workshop\b','',v,flags=re.I)
 return v

def extract_ledger(text, register, source_path):
    lines = text.splitlines()
    byaddr=collections.defaultdict(list);byid={}
    for b in register:byaddr[norm(b.get('parcelAddress',''))].append(b);byid[b['id']]=b
    columns=['id','address','built','typeStories','siding','color','roof','porchDeck','garage','driveway','fence','lotSite','foundation','windows','quote','listingDate','source']
    rows=[];group=None
    for n,l in enumerate(lines,1):
     if re.match(r'#### Group [A-E]:',l):group=l[5:]
     if l.startswith('| RES-'):
      c=cells(l);assert len(c)==17,(n,len(c));r=dict(zip(columns,c));r['line']=n;r['group']=group;rows.append(r)

    id_counts=collections.Counter(r['id'] for r in rows)
    records=[]
    for r in rows:
     address=norm(r['address']); matches=byaddr.get(address,[]); principal=[b for b in matches if b.get('principalStructureInferred')]
     candidate_rows=matches;reason='Exact address after suffix/direction/ordinal normalization; principal footprint remains an assessor-parcel inference.'
     status='matched_unique_principal' if len(principal)==1 else 'ambiguous_multiple_principals' if len(principal)>1 else 'unmatched'
     if not matches:
      m=re.match(r'^(\d+)-(\d+) (.+)$',address)
      if m:
       nums=[m[1],m[2]];street=m[3];candidate_rows=[b for b in register if norm(b.get('parcelAddress','')) in [a+' '+street for a in nums]]
       if candidate_rows:status='unresolved_address_range';reason='Listing uses an address range, but register only has individual endpoint addresses. Candidates retained; no automatic assignment.'
      if not candidate_rows:
       m=re.match(r'^(\d+)(.*)$',address)
       if m:
        candidate_rows=[b for b in register if norm(b.get('parcelAddress','')).startswith(m[1]+' ') and norm(b.get('parcelAddress','')).split(' ',1)[1].replace('PARK ','')==address.split(' ',1)[1].replace('PARK ','')]
        if candidate_rows:status='unresolved_street_alias';reason='Potential alternate street spelling; not treated as an exact address match.'
     source={'section':'RES-DOC / '+r['group'],'path':str(source_path),'line':r['line'],'listingDateRaw':r['listingDate'],'sourceUrls':urls(r['source']),'chapterCompiledDate':'2026-09-06','claimedRetrievedDate':'2026-09-06','extractionVerifiedOriginalWebPage':False,'evidenceClass':'Documented in supplied secondary listing-text compilation; not Observed'}
     caveats=['Listing facts apply to the stated address and listing period; current condition has not been visually verified.','Not stated does not mean absent.']
     if id_counts[r['id']]>1:caveats.append('Source ID is duplicated in this chapter; use the address-qualified recordId.')
     siding=r['siding'].lower();construction=[];cladding=[]
     if 'frame' in siding or '2x4' in siding:construction.append('frame')
     if 'modular' in siding:construction.append('modular')
     if 'post' in siding and 'beam' in siding:construction.append('post-and-beam')
     if 'vinyl' in siding:cladding.append('vinyl')
     if 'aluminum' in siding:cladding.append('aluminum')
     if 'brick' in siding:cladding.append('brick')
     if 'stone-faced' in siding:cladding.append('stone facing')
     if 'stone accents' in siding:cladding.append('stone accents')
     if known(r['siding']) and not cladding:caveats.append('Construction or unspecified siding field does not establish exterior cladding material.')
     if 'mahogany' in siding:caveats.append('Mahogany is mentioned without an explicit exterior location; excluded from cladding assertions.')
     if siding=='frame + stone':caveats.append('Frame plus stone does not establish whether stone is full-wall cladding or an accent; preserve for review.')
     color=r['color'].lower();color_families=[]
     for regex,value in [(r'white','white'),(r'gray|grey|graphite','gray'),(r'tan|beige|taupe','tan/beige/taupe'),(r'blue','blue'),(r'brown','brown'),(r'yellow','yellow'),(r'green|olive','green'),(r'red|crimson','red')]:
      if re.search(regex,color):color_families.append(value)
     color_kind='material-color label' if color in ('brick','stone') else 'body-color field' if known(r['color']) else 'not stated'
     roof=r['roof'].lower();roofmaterials=[]
     for regex,value in [(r'shingle','shingle (composition unspecified unless stated)'),(r'asphalt|composition','asphalt/composition shingle'),(r'rubber','rubber membrane'),(r'slate','slate')]:
      if re.search(regex,roof):roofmaterials.append(value)
     roofshapes=[v for regex,v in [(r'\bgable\b','gable'),(r'flat|low roof','flat/low')] if re.search(regex,roof)]
     porch=r['porchDeck'].lower();porchkinds=[v for regex,v in [(r'enclosed','enclosed'),(r'screen','screened'),(r'covered.*porch|porch.*covered','covered'),(r'farmer','farmers porch'),(r'wrap.?around','wraparound'),(r'\bfront porch','front'),(r'\brear porch|back porch','rear'),(r'\bside porch','side'),(r'3-season|three-season','three-season')] if re.search(regex,porch)]
     if 'porch' in porch and not porchkinds:porchkinds=['porch; form not stated']
     foundationmaterials=[v for regex,v in [(r'stone|granite','stone'),(r'granite','granite'),(r'concrete','concrete'),(r'block','block'),(r'brick','brick'),(r'slab','slab')] if re.search(regex,r['foundation'].lower())]
     documented={'builtYearSource':r['built'],'buildingTypeAndStoriesSource':exterior_only(r['typeStories']),'exteriorMaterials':{'sourceField':r['siding'] if known(r['siding']) and 'mahogany' not in siding else None,'constructionMethods':construction,'assertedCladdingMaterials':cladding,'claddingKnown':bool(cladding)},'bodyColor':{'sourceValue':field(r['color']),'kind':color_kind,'families':color_families,'asOf':r['listingDate'],'currentPaintVerified':False},'roof':{'sourceValue':field(r['roof']),'materials':roofmaterials,'shape':roofshapes,'color':None},'porchDeck':{'sourceValue':exterior_only(r['porchDeck']) if known(r['porchDeck']) else None,'porchKinds':porchkinds,'deckMentioned':bool(re.search(r'\bdeck',porch))},'windows':{'sourceValue':field(r['windows']),'morphology':[v for regex,v in [(r'picture','picture window'),(r'bay|bow','bay/bow window'),(r'arched','arched window'),(r'floor-to-ceiling','floor-to-ceiling glazing'),(r'wall of glass','wall of glass'),(r'oversized','oversized window')] if re.search(regex,r['windows'].lower())]},'garage':exterior_only(r['garage']) if known(r['garage']) else None,'driveway':field(r['driveway']),'fence':field(r['fence']),'lotSite':field(r['lotSite']),'foundation':{'sourceValue':field(r['foundation']),'assertedMaterials':foundationmaterials},'additionalExteriorAssertions':[]}
     if r['id']=='RES-SCHOOL-01':documented['additionalExteriorAssertions'].append('Oval-glass fiberglass front door explicitly stated in the source-row exterior quotation.')
     if r['id']=='RES-SCHOOL-02':documented['additionalExteriorAssertions'].append('Solar panels explicitly stated in the source-row exterior quotation.')
     if '2 bldgs' in r['typeStories'] or r['id']=='RES-LINCOLN-01':caveats.append('Two distinct houses share this address; the stated farmers porch belongs to the rear Cape. Do not attach that porch to the principal three-decker automatically.')
     if r['id']=='RES-LAKESIDE-03':caveats.append('Source lists a2024 roof permit alongside aDec2023 listing date; roof-update chronology requires original-source verification.')
     years=[int(y) for y in re.findall(r'(?<!\d)(?:18|19|20)\d{2}(?!\d)',r['listingDate'])]
     if years and max(years)<2020:caveats.append('Appearance evidence predates2020; do not assert it is current.')
     if r['listingDate']=='off-market':caveats.append('No listing-period date is provided; these are undated public-record attributes accessed in2026.')
     built=int(re.match(r'\d{4}',r['built'])[0]) if re.match(r'\d{4}',r['built']) else None
     geometry=[]
     for b in principal:
      year=b.get('footprintSourceDate');year=int(str(year)[:4]) if year and len(str(year))>=4 else None
      if built and year and built>year:geometry.append({'buildingId':b['id'],'footprintSourceYear':year,'listedBuiltYear':built,'status':'listing_building_newer_than_footprint_source; verify replacement or new footprint before assigning geometry'})
      if built and b.get('assessorYearBuilt') and abs(built-int(b['assessorYearBuilt']))>=10:caveats.append(f"Listing built year {built} differs from register assessor year {b['assessorYearBuilt']} for {b['id']}; neither is silently preferred.")
     if geometry:caveats.append('Listed building postdates source footprint imagery; current massing is unverified.')
     join={'status':status,'normalizedAddress':address,'confidence':'exact normalized property address; inferred principal footprint' if status=='matched_unique_principal' else 'unresolved','reason':reason,'principalBuildingIds':[b['id'] for b in principal] if matches else [],'ancillaryBuildingIds':[b['id'] for b in matches if not b.get('principalStructureInferred')],'candidates':[{'buildingId':b['id'],'parcelAddress':b.get('parcelAddress'),'parcelLocId':b.get('parcelLocId'),'principalInferred':b.get('principalStructureInferred'),'assessorStyle':b.get('assessorStyle'),'assessorStories':b.get('assessorStories'),'assessorYearBuilt':b.get('assessorYearBuilt'),'longitude':b.get('longitude'),'latitude':b.get('latitude'),'footprintSourceDate':b.get('footprintSourceDate')} for b in candidate_rows],'mayApplyDocumentedExteriorToUniquePrincipal':status=='matched_unique_principal' and r['id']!='RES-LINCOLN-01','mayAssertCurrentAppearance':False,'geometryAgeFlags':geometry}
     records.append({'recordId':r['id']+'@'+re.sub(r'[^a-z0-9]+','-',address.lower()).strip('-'),'sourceId':r['id'],'address':r['address'],'source':source,'documented':documented,'inferredFeatures':[],'join':join,'historicCrossReferences':re.findall(r'LND-WEB-[A-Z0-9]+',r['typeStories']),'caveats':caveats})
    OUT={'schemaVersion':'1.0','sourceDocument':str(source_path),'sourceSha256':hashlib.sha256(text.encode()).hexdigest(),'records':records,'audit':{'recordCount':len(records),'sourceIdDuplicates':{k:v for k,v in id_counts.items() if v>1},'joinCounts':dict(collections.Counter(r['join']['status'] for r in records)),'rawColorCounts':dict(collections.Counter(r['color'].lower() for r in rows if known(r['color']))),'nonStatedSidingRawCounts':dict(collections.Counter(r['siding'] for r in rows if known(r['siding'])))}}
    return OUT

# These are rendering inferences, deliberately separate from listing assertions.
TYPOLOGY_PROFILES = [
 ('TYPE-01','Mill worker doubles and rows',['DUPLEX / ROW'],[18.7,11.1],['Long coherent ridge; paired front entries and repeated narrow bays.','Covered porches are documented on individual Slater examples; no automatic porch on every row.']),
 ('TYPE-02','Three-deckers',['3 FAM FLATS'],[17.8,9.8],['Three visible wall levels where the retained eave allows them; regular vertically aligned windows.','Stacked porches and hip/flat or front-gable variants are plausible, but stories do not prove roof shape.']),
 ('TYPE-03','Converted older houses',['CONVERSION'],[16.1,10.3],['Preserve the main block and lower rear/side wings; tall narrow sash proportions.','Visible stone foundation is plausible before 1925; actual ground level governs exposed height.']),
 ('TYPE-04','Flats and mixed apartment houses',['FLATS / APTS','MIXED-APT','APARTMENTS'],[16.8,10.1],['Regular tall window bays with consistent floor spacing; differentiated ground-floor frontage only when commercial use is documented.','Mansards and historic details require an address-specific historic match.']),
 ('TYPE-05','Older conventional houses',['CONVENTIONAL'],[14.2,10.0],['Gable-front, cross-gable and side-gable variety follows the retained roof and wing geometry.','Restrained pale casings, coherent window alignment and visible foundation replace uniform glass grids.']),
 ('TYPE-06','Cottages and bungalows',['COTT/BUNGALOW'],[13.8,9.2],['Low eaves, wider trim and fewer compact window bays.','Porches and dormers are local possibilities, not universal assessor facts.']),
 ('TYPE-07','Capes',['CAPE'],[14.8,10.4],['One main wall floor and a roof-contained upper half story; steep uninterrupted roof faces.','Do not put a full second wall story or automatic repeated dormers above a low eave.']),
 ('TYPE-08','Ranches',['RANCH'],[16.8,10.9],['One long low occupied floor, broader picture-window grouping on the inferred street face.','Small paired side windows and a coherent low roof; garage location must be separately established.']),
 ('TYPE-09','Raised ranches and split levels',['RAISED RANCH','SPLIT LEVEL'],[14.9,9.5],['Assessor one-story raised ranches have an upper living floor and an exposed lower level; preserve the saved raised floor and terrain.','Lower windows only where the ground clears them; split wings use separate eave heights.']),
 ('TYPE-10','Lake cottages and later replacements',[],None,['Use actual shoreline direction to place lake-facing features; street names alone do not establish waterfront.','Mix older compact cottages with later taller houses; retain mapped lot spacing and step decks with real ground.']),
 ('TYPE-11','Later Colonials',['COLONIAL'],[17.1,10.2],['Two coherent rows of vertically aligned sash windows, often four or five front bays.','Lower attached wings retain their own eave; no second-story windows through a garage roof.']),
 ('TYPE-12','Contemporaries',['CONTEMPORARY'],[19.7,12.2],['Fewer larger window groups and asymmetric openings aligned to existing roof masses.','Fiber cement, black windows and metal accent roofs remain unverified regional possibilities, never blanket material claims.']),
 ('TYPE-13','Condominiums and apartment complexes',['CONDO','NORTH VILLAGE','ELDERLY HOUSING'],None,['Repeat coherent unit bays within each mapped block; distinguish one-floor paired ranch condos from three-floor lake rows.','Preserve complete block outlines and existing parking; complex name does not establish brick or vinyl.']),
 ('TYPE-14','Mobile homes',['MOBILE HOME'],[18.3,8.0],['Low narrow main body with compact windows and skirting; the wide outline may include a side porch or addition.','Keep existing low floor and roof geometry; do not turn every mobile home into a two-floor house.']),
 ('TYPE-15','Ancillary garages, sheds and barns',[],None,['Never transfer the principal house stories, windows or use to accessory footprints.','Use mapped ancillary distribution; do not add a shed to every postwar yard.']),
]


def enrich_ledger(ledger, text, register):
    lines=text.splitlines(); path=ledger['sourceDocument']
    profiles=[]; group=None
    for number,line in enumerate(lines,1):
        if line.startswith('### RES-GROUPS'): break
        m=re.match(r'\*\*([A-E])\. (.*?)\*\*',line)
        if m: group=m[1]
        if line.startswith('| ') and group:
            c=cells(line)
            if len(c)!=12 or not re.fullmatch(r'\d+',c[1]):continue
            profiles.append({'street':c[0],'normalizedStreet':norm(c[0]),'family':group,
                'source':{'path':path,'line':number,'section':'RES-PROFILES','evidenceClass':'Derived in supplied chapter'},
                'principalBuildings':int(c[1]),'ancillaryPerPrincipal':float(c[2]),
                'yearQuartiles':[int(x) for x in re.findall(r'\d+',c[3])],
                'medianStories':float(c[4]),'medianFootprintSqFt':int(c[5]),'medianNearestNeighborM':float(c[6]),
                'millEraShareSource':c[7],'postwarShareSource':c[8],'laterColonialContemporaryShareSource':c[9],
                'commonStylesSource':c[10],'eraCounts':[int(x) for x in re.findall(r'\d+',c[11])],
                'caveat':'Principal totals can include commercial uses; centroid spacing is not measured frontage or setback.'})
    types=[]
    for id,name,styles,plan,rules in TYPOLOGY_PROFILES:
        number=next((i for i,line in enumerate(lines,1) if line.startswith('#### '+id+' —')),None)
        types.append({'id':id,'name':name,'assessorStyles':styles,'chapterMedianPlanM':plan,'renderingInferences':rules,
            'source':{'path':path,'line':number,'section':id,'evidenceClass':'Inferred architectural guide; plan medians are chapter-derived'},
            'materialAndPaintRule':'Only explicit listing cladding becomes documented material. General palette and window layout remain inferred.'})
    # Curated exterior-only facts avoid importing tenancy, names or interior amenities.
    complex_facts={
      'TYPE-13-01':[], 'TYPE-13-02':[], 'TYPE-13-03':[], 'TYPE-13-04':[], 'TYPE-13-05':[],
      'TYPE-13-06':['Off-street parking','Grassed outdoor area'], 'TYPE-13-07':[], 'TYPE-13-08':[],
      'TYPE-13-09':['Private beach','Pool','Boat docks','Detached garage space','Oversize patio'],
      'TYPE-13-10':['Marina and boat slips','Pool','Private beach','Garage parking','Trex deck overlooking marina'],
      'TYPE-13-11':['Three stories','Approximately 25 ft from shore','Two boat docks','Garage space','Picture windows'],
      'TYPE-13-12':['Two stories','Wood roof stated; shake is the chapter interpretation','Composite deck with vinyl railing','Open common parking','Wooded backdrop'],
      'TYPE-13-13':['Two stories','Shingle roof','Wood deck','Assigned open parking','Dead-end street'],
      'TYPE-13-14':['One-level homes','Attached two-car garages','Screened/enclosed porch','Maintained private road','Community center'],
      'TYPE-13-15':[], 'TYPE-13-16':['18 Linwood St C: private deck with automatic awning'], 'TYPE-13-17':[], 'TYPE-13-18':[]}
    complexes=[]; byid={b['id']:b for b in register}
    bibliography=[]
    for number,line in enumerate(lines,1):
        if line.startswith('| TYPE-13-'):
            c=cells(line); ids=list(dict.fromkeys(re.findall(r'BLD-\d+_\d+',c[3]+' '+c[2])))
            complexes.append({'id':c[0],'name':re.sub(r'\([^)]*\)','',c[1]).strip(),'addressSource':c[2],
                'buildingIds':ids,'verifiedBuildingIds':[i for i in ids if i in byid],
                'unresolvedBuildingIds':[i for i in ids if i not in byid],
                'source':{'path':path,'line':number,'section':'TYPE-13','date':'2026-09-06','urls':urls(line)},
                'assessorSource':c[4],'geometryCountsSource':c[5],'documentedExterior':complex_facts[c[0]],
                'appearanceInference':c[7],'currentPaintVerified':False,
                'caveat':'Listed unit facts are not assigned to every building in the complex.'})
        if number>590 and line.startswith('| ['):
            c=cells(line)
            if len(c)>=4:bibliography.append({'title':re.sub(r'\]\(.*','',c[0]).lstrip('['),'urls':urls(c[0]),'sourceDate':c[2],'retrievedDate':c[3],'line':number})
    mobile=[]
    for number,line in enumerate(lines,1):
        m=re.search(r'\*\*(TYPE-14-0[12]) — (.*?)\*\*',line)
        if m:mobile.append({'id':m[1],'name':m[2],'source':{'path':path,'line':number,'date':'2026-09-06'},
            'buildingIds':re.findall(r'BLD-\d+_\d+',line),'inferredStyle':'Low narrow mobile-home bodies with separate side additions and entry landings.',
            'documentedExterior':['9 Humes: covered porch, carport, paved drive, new roof and exterior paint','15 Humes: tan color, shingle roof, ramp, driveway'] if m[1].endswith('02') else []})
    historic={'44-46 SLATER ST':'LND-WEB-252','10-12 HARTLEY ST':'LND-WEB-21','5-7 MARKET ST':'LND-WEB-58','40 EAST MAIN ST':'LND-WEB-264','27 ELM ST':'LND-WEB-354','76-78 NORTH MAIN ST':'LND-WEB-274','94 NORTH MAIN ST':'LND-WEB-277','779 SCHOOL ST':'LND-WEB-142'}
    for r in ledger['records']:
        hid=historic.get(r['join']['normalizedAddress'])
        if hid and hid not in r['historicCrossReferences']:r['historicCrossReferences'].append(hid)
        if hid:r['caveats'].append('Historic inventory identifies architectural context only; it supplies no current paint color.')
    ledger.update(streetProfiles=profiles,typologies=types,complexes=complexes,mobileHomeClusters=mobile,sourceBibliography=bibliography)
    ledger['globalRecommendations']=[
      {'priority':1,'action':'Apply style-specific proportions to retained floors, wings and roof envelopes before increasing detail count.','basis':['TYPE-07','TYPE-08','TYPE-09','TYPE-11']},
      {'priority':2,'action':'Align window rows and physical casings to each actual wall and local wing eave; clip openings against rendered terrain.','basis':['RES-RULES','TYPE-02','TYPE-03']},
      {'priority':3,'action':'Use a broad light-neutral siding palette with occasional blue, green, yellow and red, calibrated to dated listing evidence; do not claim exact paint RGB.','basis':['RES-COLOR-01','RES-DOC'],'sampleColorsStated':82,'sampleSize':130,'samplingLimit':'Convenience listing sample, not a random townwide paint survey.'},
      {'priority':4,'action':'Use exact-address exterior overrides only after a unique principal match; unresolved ranges and two-house parcels stay review-only.','basis':['RES-DOC']},
      {'priority':5,'action':'Keep mapped ancillary outlines separate from principal homes; match shed/garage proportions to their own area.','basis':['TYPE-15']},
      {'priority':6,'action':'Add only documented porches where a clear facade and supported terrain leave room; preserve individually photo-crafted School Street buildings.','basis':['RES-DOC','exterior-photos.md']},
      {'priority':7,'action':'Retain true mapped building locations; neighborhood centroid-spacing statistics guide character rather than relocation.','basis':['RES-METHOD','RES-PROFILES']},
    ]
    ledger['audit'].update(streetProfileCount=len(profiles),streetProfileFamilyCounts=dict(collections.Counter(p['family'] for p in profiles)),
        typologyCount=len(types),complexCount=len(complexes),mobileClusterCount=len(mobile),colorRecordsStated=sum(ledger['audit']['rawColorCounts'].values()),
        sourceLimitations=[
          'All 130 records are secondary listing-text assertions. Original pages and photographs were not independently verified in this extraction.',
          'The source color section claims 81 stated colors, but the 130 table rows contain 82.',
          'Selected style counts in the introduction total 5087; the stated 5132 residential total leaves 45 in unlisted categories.',
          'Introduction and typology totals differ: CAPE 624/626, CONVERSION 560/561, MOBILE HOME 45/46. Runtime uses actual register values.',
          'Ancillary area buckets sum to2309 against2310 ancillary records; one is outside the listed buckets or otherwise unclassified.',
          'Group D says all ten have attached garages, but 44 Scenic Ave explicitly lists none.',
          'Three stories alone does not establish a flat or hipped roof. Shingle alone does not establish asphalt composition.',
          'An MLS frame field establishes construction, not vinyl or wood cladding. Mahogany without an exterior location is excluded.',
          'Generic fences do not establish chain-link or stockade; insulated replacement windows do not establish sash shape.',
          'Current appearance cannot be inferred as observed from an old listing or historic inventory.',
          'Blank garage fields and none stated do not establish absence; road frontage cannot be measured from centroid spacing.',
          '131 Lakeside pairs a2024 roof permit with a2023 listing date; the original chronology needs review.',
        ])
    return ledger


def add_exterior_quotations(ledger, text):
    # Preserve the relevant exterior assertions from every table row, excluding
    # interior clauses and sales/occupancy claims accidentally included there.
    by_key={(r['sourceId'],r['source']['line']):r for r in ledger['records']}
    for number,line in enumerate(text.splitlines(),1):
        if not line.startswith('| RES-'):continue
        c=cells(line);r=by_key[(c[0],number)];q=c[14]
        replacements={
          '"fully occupied 3-decker" + "big farmer\'s porch" Cape at rear':'Three-decker plus rear Cape; large farmers porch belongs to the rear Cape.',
          '"Custom built Acorn Deck Home~Mahogany wood and lots of windows"':'Acorn Deck Home with many windows; exterior wood species is not established.',
          '"new roof ... interior & exterior paint"':'New roof and exterior paint.',
          '"no extra park fees, because this home is on it\'s own land"':'',
          '"Soaring vaulted ceilings" "private 1.76-acre lot"':'Private 1.76-acre lot.',
          '"extra large, two car garage has an entry door right into the kitchen"':'Large two-car garage.',
          '"Beautifully updated ranch on Killdeer Island" workshop':'Ranch on Killdeer Island.',
        }
        q=replacements.get(q,q)
        q=re.sub(r'\b\d+\s*(?:BR|bed|Rm)\b','',q,flags=re.I)
        q=re.sub(r'\b(?:heated|Budget-friendly|move-in ready)\s*','',q,flags=re.I)
        if q and not q.startswith('(public record'):
            r['documented']['additionalExteriorAssertions'].append(q)
        for key in ['buildingTypeAndStoriesSource','porchDeck','lotSite','garage']:
            value=r['documented'].get(key)
            if isinstance(value,str):r['documented'][key]=re.sub(r'\b\d+\s*(?:BR|bed|Rm)\b','',value,flags=re.I).strip()
        r['documented']['fence']=exterior_only(r['documented']['fence']) if r['documented']['fence'] else None
    return ledger


RESIDENTIAL_STYLES={s for _,_,styles,_,_ in TYPOLOGY_PROFILES for s in styles}
RESIDENTIAL_USES={'Single Family Residential','Two-Family Residential','Three-Family Residential',
    'Apartments with Four to Eight Units','Apartments with More than Eight Units','Residential Condominium',
    'Multiple Houses on one parcel','Mobile Home (includes mobile home park land)','Housing Authority',
    'Housing, Other (Charitable Org.)','Other Congregate Housing (includes non-transient shared living arrangements)',
    'Affordable Housing Units (Greater than 50% of the units qualify)','Mixed Use (Primarily Residential, some Commercial)',
    'Mixed Use (Primarily Residential, some Forest)'}


def residential_candidate(building):
    if not building.get('principalStructureInferred'):return False
    use=building.get('assessorUse') or ''
    return use in RESIDENTIAL_USES or (building.get('assessorStyle') in RESIDENTIAL_STYLES and
        (not use or use in {'Accessory Land with Improvement','Developable Residential Land','Undevelopable Residential Land','Potentially Developable Residential Land'}))


def semantic_paint(value, sid, family=None):
    """Author a stable RGB palette hint; MLS color names are not measured colors."""
    value=(value or '').lower()
    choices=[(r'graphite','#555e61'),(r'light gr[ae]y','#c2c5bd'),(r'slate gr[ae]y','#828d91'),
        (r'gr[ae]y/blue','#889ba3'),(r'white','#e0ded0'),(r'crimson','#8e4844'),(r'red','#a15d51'),
        (r'olive','#8e9472'),(r'green','#819486'),(r'blue','#809ba8'),(r'yellow','#d9c985'),
        (r'taupe','#aba08d'),(r'beige','#cabba1'),(r'tan','#c0af91'),(r'brown','#91816d'),
        (r'gr[ae]y','#a3aaa5'),(r'brick','#a46c58'),(r'stone','#a69e8c')]
    for pattern,paint in choices:
        if re.search(pattern,value):return paint
    # Calibrated to the broad, neutral-heavy 82-color convenience sample. Stable
    # hashing varies adjacent houses without identical street-wide paint.
    palette=['#deded2']*21+['#b4b9b3']*16+['#c0b298']*19+['#8e8171']*5+['#849aa5']*7+['#8c9b82']*4+['#d4c78e']*4+['#a66352']*3
    seed=int(hashlib.sha256(sid.encode()).hexdigest()[:8],16)
    return palette[seed%len(palette)]


def inferred_roof(report):
    description=' '.join(str(report.get(k,'')) for k in ['roof_style','method']).lower()
    for key in ['gambrel','mansard','hip','gable']:
        if key in description:return key
    return 'retained'


def evidence_appearance(building, report, evidence=None):
    id=building['structId'];style=building.get('assessorStyle') or report.get('source_style') or 'UNCLASSIFIED'
    result={'style':style,'year':building.get('assessorYearBuilt') or 0,'material':'siding','paint':semantic_paint(None,id),
        'roof':inferred_roof(report),'porch':'none','documented':False,'evidenceIds':[],
        'colorsDated':False,'materialBasis':'inferred','paintBasis':'inferred','porchPlacement':'none'}
    if evidence and evidence['join']['mayApplyDocumentedExteriorToUniquePrincipal']:
        d=evidence['documented']; result['documented']=True; result['evidenceIds']=[evidence['recordId']]
        result['sourceDate']=evidence['source']['listingDateRaw']
        result['sourceRefs']=[{'line':evidence['source']['line'],'urls':evidence['source']['sourceUrls']}]
        material=d['exteriorMaterials']['assertedCladdingMaterials']
        if 'brick' in material:result.update(material='brick',materialBasis='dated-listing')
        elif 'stone facing' in material:result.update(material='stone',materialBasis='dated-listing')
        elif any(m in material for m in ['vinyl','aluminum']):result.update(material='siding',materialBasis='dated-listing')
        # Stone accents must remain accents, not turn an entire vinyl house gray.
        if 'stone accents' in material:result['accentMaterial']='stone'
        color=d['bodyColor']
        if color['sourceValue']:
            result.update(paint=semantic_paint(color['sourceValue'],id),paintBasis='dated-listing-palette-hint',colorsDated=True,paletteHint=color['sourceValue'])
        porch=d['porchDeck']['sourceValue'] or '';low=porch.lower()
        if 'porch' in low:
            result['porch']='wraparound' if re.search('wrap.?around',low) else 'enclosed' if any(x in low for x in ['enclosed','screen','season']) else 'open'
            # Evidence of a rear/side porch must not create a new street porch.
            result['porchPlacement']='front' if re.search(r'front|farmer|wrap.?around',low) else 'rear' if re.search(r'back|rear',low) else 'side' if 'side' in low else 'unspecified'
        if d['roof']['sourceValue']:result['roofCopy']=d['roof']['sourceValue']
        if d['windows']['morphology']:result['windowHints']=d['windows']['morphology']
        result['confidence']='exact-address; principal footprint inferred; listing period only'
    return result


def read_json(path):return json.loads(path.read_text())
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def rounded_xy(p):return [round(float(p[0]),4),round(float(p[1]),4)]


def read_glb_json_header(path):
    """Read only the GLB JSON chunk; door bounds need no binary geometry decode."""
    with path.open('rb') as file:
        header=file.read(20)
        if len(header)!=20 or header[:4]!=b'glTF' or struct.unpack_from('<I',header,4)[0]!=2 or header[16:20]!=b'JSON':
            raise ValueError('Unsupported GLB header')
        length=struct.unpack_from('<I',header,12)[0]
        if length>8_000_000:raise ValueError('Unexpectedly large GLB JSON header')
        return json.loads(file.read(length))


def retained_entry(document, frames):
    """Project the existing generated door onto its matching source wall.

    The original V2 asset uses translation-only nodes and a single 24-vertex box
    for a doorway. A missing, combined, or ambiguous door stays explicitly null.
    Its matching entrance steps remain part of the unchanged source geometry.
    """
    doors=[]
    for node in document.get('nodes',[]):
        if 'mesh' not in node:continue
        if node.get('matrix') or node.get('rotation') or node.get('scale') or node.get('children'):
            raise ValueError('Entry extraction requires translation-only standalone mesh nodes')
        translation=node.get('translation',[0,0,0])
        for primitive in document['meshes'][node['mesh']]['primitives']:
            material=document.get('materials',[])[primitive.get('material',0)]
            if material.get('name')!='V2 inferred | door':continue
            accessor=document['accessors'][primitive['attributes']['POSITION']]
            if accessor.get('count')!=24 or accessor.get('type')!='VEC3':return None
            lo,hi=accessor.get('min'),accessor.get('max')
            if not lo or not hi or len(lo)!=3 or len(hi)!=3:return None
            if not all(math.isfinite(v) for v in [*lo,*hi,*translation]):return None
            east=translation[0]+(lo[0]+hi[0])/2
            north=-(translation[2]+(lo[2]+hi[2])/2)
            floor=translation[1]+lo[1]
            doors.append((east,north,floor))
    if len(doors)!=1:return None
    east,north,floor=doors[0];candidates=[]
    for i,frame in enumerate(frames):
        delta=[east-frame['start'][0],north-frame['start'][1]]
        u=sum(delta[k]*frame['tangent'][k] for k in range(2))
        offset=sum(delta[k]*frame['outward'][k] for k in range(2))
        if -.001<=u<=frame['width']+.001 and -.05<=offset<=.35:
            candidates.append((abs(offset-.07),i,u))
    if not candidates:return None
    candidates.sort()
    if len(candidates)>1 and abs(candidates[0][0]-candidates[1][0])<.001:return None
    _,index,u=candidates[0]
    return {'frameIndex':index,'u':round(u,4),'floor':floor}


def cleaned_outline(architecture, report):
    """Reproduce the original bounded cleanup without importing its writing module.

    This is the same transform in build_prototypes.clean_footprint. The report's
    saved center/rotation and cleanup area are checked before accepting it.
    """
    from shapely.geometry import Polygon
    from shapely import affinity
    import numpy as np
    coords=architecture['outline_xy']; original=Polygon(coords)
    if not report.get('local_rotation') or not report.get('masses'):
        return [[float(x),float(y)] for x,y in original.exterior.coords], 'source-outline'
    centre=np.asarray(report['source_world_origin'][:2]);rotation=np.asarray(report['local_rotation'])
    xy=np.asarray(coords[:-1])-centre;p=xy@rotation
    d=np.roll(p,-1,axis=0)-p;horizontal=abs(d[:,0])>=abs(d[:,1])
    constants=np.array([(a[1]+b[1])/2 if h else (a[0]+b[0])/2 for a,b,h in zip(p,np.roll(p,-1,axis=0),horizontal)])
    vertices=[]
    for i in range(len(p)):
        j=(i-1)%len(p)
        if horizontal[i]==horizontal[j]:continue
        vertices.append([constants[j],constants[i]] if horizontal[i] else [constants[i],constants[j]])
    polygon=Polygon(vertices)
    if not polygon.is_valid:raise ValueError('Invalid report cleanup reconstruction')
    polygon=polygon.buffer(.30,join_style=2).buffer(-.30,join_style=2).simplify(.025,preserve_topology=True)
    expected=report['cleanup'].get('clean_area_m2')
    if expected is not None and abs(polygon.area-expected)>.001:raise ValueError('Reconstructed cleanup area does not match existing asset')
    moved=affinity.affine_transform(polygon,[rotation[0,0],rotation[0,1],rotation[1,0],rotation[1,1],*centre])
    return [[float(x),float(y)] for x,y in moved.exterior.coords], 'existing-v2-clean-envelope'


def boundary_frames(outline, report, nearest_road):
    """Split each wall at mass boundaries so low extensions get low eave limits."""
    from shapely.geometry import Polygon
    polygon=Polygon(outline);ccw=polygon.exterior.is_ccw
    origin=report['source_world_origin'][:2];rot=report.get('local_rotation',[[1,0],[0,1]])
    def local(p):
        x,y=p[0]-origin[0],p[1]-origin[1]
        return [x*rot[0][0]+y*rot[1][0],x*rot[0][1]+y*rot[1][1]]
    masses=report.get('masses',[])
    eave=report.get('eave_z') or max((m['eave_z'] for m in masses),default=report['bounds']['max'][1]-.24)
    frames=[]
    for a,b in zip(outline[:-1],outline[1:]):
        length=math.dist(a,b)
        if length<.08:continue
        t=[(b[i]-a[i])/length for i in range(2)];n=[t[1],-t[0]] if ccw else [-t[1],t[0]]
        la,lb=local(a),local(b);cuts=[0.,1.]
        for mass in masses:
            rect=mass['rect']
            for axis in [0,1]:
                den=lb[axis]-la[axis]
                if abs(den)<1e-7:continue
                for threshold in [rect[axis],rect[axis+2]]:
                    f=(threshold-la[axis])/den
                    if .005<f<.995:cuts.append(f)
        cuts=sorted(set(round(f,7) for f in cuts))
        for left,right in zip(cuts,cuts[1:]):
            width=(right-left)*length
            if width<.08:continue
            start=[a[i]+(b[i]-a[i])*left for i in range(2)]
            mid=[a[i]+(b[i]-a[i])*(left+right)/2 for i in range(2)]
            p=local([mid[i]-n[i]*.03 for i in range(2)])
            allowed=[m['eave_z'] for m in masses if m['rect'][0]-.011<=p[0]<=m['rect'][2]+.011 and m['rect'][1]-.011<=p[1]<=m['rect'][3]+.011]
            wall_eave=max(allowed) if allowed else eave
            road_vector=[nearest_road[i]-mid[i] for i in range(2)]
            # A lower-bound estimate of spare road-facing depth, not a measured
            # cadastral setback. This never authorizes moving the source building.
            facing=sum(n[i]*road_vector[i] for i in range(2))
            frames.append({'start':rounded_xy(start),'tangent':[round(v,7) for v in t],
                'outward':[round(v,7) for v in n],'width':round(width,4),'front':False,
                'eave':round(float(wall_eave),4),'clearanceM':round(max(0.,facing-4.),3),
                '_frontScore':facing if width>=2.8 else -1e9})
    merged=[]
    for frame in frames:
        previous=merged[-1] if merged else None
        if previous and previous['tangent']==frame['tangent'] and abs(previous['eave']-frame['eave'])<.0001 and math.dist([previous['start'][i]+previous['tangent'][i]*previous['width'] for i in range(2)],frame['start'])<.002:
            previous['width']=round(previous['width']+frame['width'],4)
            previous['clearanceM']=min(previous['clearanceM'],frame['clearanceM'])
            previous['_frontScore']=max(previous['_frontScore'],frame['_frontScore'])
        else:merged.append(frame)
    frames=merged
    if len(frames)<4:raise ValueError('Fewer than four viable boundary frames')
    # Pick the most road-facing usable wall. On lower wings each frame is kept
    # separate, but only one receives an inferred entrance/front-window grouping.
    best=max(range(len(frames)),key=lambda i:frames[i]['_frontScore'])
    frames[best]['front']=True
    for frame in frames:frame.pop('_frontScore')
    return frames


class GroundSampler:
    """Exact barycentric heights from saved road-graded rendered terrain.

    A centroid KD tree only selects candidates; no nearest-neighbor elevation or
    extrapolated plane is accepted. Missed candidates get a wider bounded search;
    points outside the clipped mesh remain unsupported instead of extrapolated.
    """
    def __init__(self, source):
        import numpy as np
        from scipy.spatial import cKDTree
        self.layers=[];grade=np.load(source/'driving/roadbed_grading.npz')
        for file,prefix in [('townwide/terrain.npz','town'),('downtown/downtown_terrain.npz','downtown')]:
            data=np.load(source/file);vertices=data['vertices'].copy();vertices[grade[prefix+'_indices'],2]=grade[prefix+'_z']
            triangles=vertices[data['faces']].astype('f8');centers=triangles[:,:,:2].mean(axis=1)
            self.layers.append((triangles,cKDTree(centers),triangles[:,:,:2].min(axis=1),triangles[:,:,:2].max(axis=1)))

    @staticmethod
    def contained_heights(points, triangles):
        import numpy as np
        a=triangles[:,:,0,:2];u=triangles[:,:,1,:2]-a;v=triangles[:,:,2,:2]-a;q=points[:,None,:]-a
        den=u[:,:,0]*v[:,:,1]-u[:,:,1]*v[:,:,0];good=abs(den)>1e-12;den=np.where(good,den,1)
        wb=(q[:,:,0]*v[:,:,1]-q[:,:,1]*v[:,:,0])/den;wc=(u[:,:,0]*q[:,:,1]-u[:,:,1]*q[:,:,0])/den;wa=1-wb-wc
        valid=good&(wa>=-1e-6)&(wb>=-1e-6)&(wc>=-1e-6)
        z=wa*triangles[:,:,0,2]+wb*triangles[:,:,1,2]+wc*triangles[:,:,2,2]
        return np.max(np.where(valid,z,-np.inf),axis=1)

    def heights(self, points):
        import numpy as np
        points=np.asarray(points,dtype='f8');result=np.full(len(points),-np.inf)
        for triangles,tree,lo,hi in self.layers:
            layer_bounds=(lo.min(axis=0),hi.max(axis=0));inside=np.all(points>=layer_bounds[0]-1e-6,axis=1)&np.all(points<=layer_bounds[1]+1e-6,axis=1)
            indices=np.flatnonzero(inside)
            for start in range(0,len(indices),8192):
                ids=indices[start:start+8192];p=points[ids]
                _,near=tree.query(p,k=32)
                heights=self.contained_heights(p,triangles[near])
                missing=np.flatnonzero(~np.isfinite(heights))
                if len(missing):
                    _,wide=tree.query(p[missing],k=256)
                    heights[missing]=self.contained_heights(p[missing],triangles[wide])
                result[ids]=np.maximum(result[ids],heights)
        return result


def attach_ground(records, sampler):
    import numpy as np
    points=[];frames=[]
    for r in records:
        for f in r['frames']:
            frames.append((r,f))
            for fraction in [0,.25,.5,.75,1]:
                for outward in [.1,.4]:
                    points.append([f['start'][i]+f['tangent'][i]*f['width']*fraction+f['outward'][i]*outward for i in range(2)])
    samples=sampler.heights(points).reshape(len(frames),10);fallbacks=0
    for (record,frame),heights in zip(frames,samples):
        valid=np.isfinite(heights)
        fallback=record['groundMaximum']
        if not valid.all():fallbacks+=1;heights=np.where(valid,heights,fallback);frame['groundFallback']=True
        frame['groundMaximum']=round(float(heights.max()),4)
        frame['groundAt']=[round(float(max(heights[i],heights[i+1])),4) for i in [0,4,8]]
        frame['floorClearance']=round(record['floor']-frame['groundMaximum'],4)
    return {'framesSampled':len(frames),'terrainSamplePoints':len(points),'framesWithConservativeReportFallback':fallbacks}


def protected_ids(source, site):
    protected=set(read_json(source/'realism/photo_home_structures.json'))
    crafted=read_json(site/'data/derived/town/crafted-frontages.json')
    protected.update(row['structId'] for row in crafted.get('school',[]))
    protected.update(row['structId'] for row in crafted.get('downtown',[]) if row.get('structId'))
    protected.update(r['struct_id'] for r in read_json(source/'web-export/realism-v2/source-register.json') if r.get('eligibility')=='preserve_observed')
    return protected


def build_runtime_records(register, architecture, reports_dir, ledger, protected, source_owners=None):
    architecture={r['struct_id']:r for r in architecture};evidence={}
    for r in ledger['records']:
        if r['join']['mayApplyDocumentedExteriorToUniquePrincipal']:
            for bid in r['join']['principalBuildingIds']:
                assert bid not in evidence, 'Multiple listing overrides for one principal; resolve explicitly'
                evidence[bid]=r
    records=[];skips=collections.Counter();geometry=collections.Counter();errors=[];report_hashes=[]
    for b in sorted(register,key=lambda r:r['structId']):
        id=b['structId']
        if id in protected:skips['protected']+=1;continue
        if not residential_candidate(b):skips['not_residential_principal']+=1;continue
        path=reports_dir/(id+'.report.json')
        if not path.exists():skips['missing_report']+=1;continue
        report=read_json(path);a=architecture.get(id)
        if not a:skips['missing_architecture']+=1;continue
        if not report.get('principal_inferred'):skips['report_not_principal']+=1;continue
        try:
            outline,basis=cleaned_outline(a,report);frames=boundary_frames(outline,report,a['nearest_road_xy'])
        except (ValueError,KeyError) as e:
            errors.append({'id':id,'error':str(e)});continue
        centroid=a['centroid_xy'];centroid_tile=f'{math.floor(centroid[0]/250)}_{math.floor(centroid[1]/250)}'
        # A building is shipped whole in its original source tile. A later
        # roofprint centroid can cross a cell edge; source ownership takes
        # precedence so the evidence is loaded beside its actual mesh.
        tile=source_owners[id] if source_owners is not None else centroid_tile
        base=float(report['base_z']);floor=float(report['floor_z']);eave=max(f['eave'] for f in frames)
        peak=max((m['ridge_z'] for m in report.get('masses',[])),default=report['bounds']['max'][1])
        appearance=evidence_appearance(b,report,evidence.get(b['id']))
        record={'id':id,'tileId':tile,'address':b.get('parcelAddress') or '',
            'outline':[rounded_xy(p) for p in outline],'frames':frames,'base':base,'floor':floor,'eave':eave,'peak':peak,
            'stories':report.get('occupied_floors',1),'floorHeight':report.get('floor_height_m',2.62),
            'groundMinimum':min(report['ground_min_max_m']),'groundMaximum':max(report['ground_min_max_m']),
            'geometryBasis':basis,'reportMode':report['mode'],**appearance}
        document=read_glb_json_header(reports_dir/report['asset']['url'])
        entry=retained_entry(document,frames)
        record['entry']=entry
        record['entryBasis']='Retained generated source entry, not observed.' if entry else 'No unambiguous retained generated door; do not create an unsupported entrance.'
        if entry is not None:
            for i,frame in enumerate(frames):frame['front']=i==entry['frameIndex']
        records.append(record);geometry[basis]+=1;report_hashes.append([id,sha(path)])
    return records,{'skipped':dict(skips),'geometryBasisCounts':dict(geometry),'geometryErrors':errors,
        'reportManifestSha256':hashlib.sha256(json.dumps(report_hashes,separators=(',',':')).encode()).hexdigest()}


def source_owner_fixture(records, manifest, manifest_sha256):
    """Compact CI ownership evidence derived from the actual immutable export."""
    source_owners={}
    for tile in manifest['tiles']:
        for id in tile['sourceIds']:
            if id in source_owners:raise ValueError('Duplicate source building identity: '+id)
            source_owners[id]=tile['id']
    owners={}
    for record in sorted(records,key=lambda row:row['id']):
        id=record['id']
        if id in owners:raise ValueError('Duplicate residential identity: '+id)
        if source_owners.get(id)!=record['tileId']:raise ValueError('Residential source owner mismatch: '+id)
        owners[id]=source_owners[id]
    return {'version':1,'sourceManifestSha256':manifest_sha256,'count':len(owners),'owners':owners}


def write_source_owners(records, site):
    release=read_json(site/'data/derived/town/release.json')
    manifest=site/'public/town-assets'/release['directory']/'manifest.json'
    digest=sha(manifest)
    if digest!=release['manifestSha256']:raise ValueError('Pinned source manifest hash mismatch')
    fixture=source_owner_fixture(records,read_json(manifest),digest)
    path=site/'data/derived/town/residential-source-owners.json';temporary=path.with_suffix('.json.tmp')
    temporary.write_text(json.dumps(fixture,separators=(',',':'))+'\n');temporary.replace(path)
    return fixture


def write_tiles(records, ledger, site, audit, source_hashes):
    import gzip
    tiles=collections.defaultdict(list)
    for record in records:tiles[record['tileId']].append(record)
    output=site/'public/town-evidence/v1/residential';output.mkdir(parents=True,exist_ok=True)
    index={'version':1,'tileSize':250,'coordinateContract':'Source local east X/north Y/up Z; runtime X/up Y/-north Z. Outline and frames use source east/north. Floor, base and terrain are absolute saved local heights.',
        'evidenceScope':'Supplied dated listing text plus explicitly inferred assessor-style profiles. No independently observed current paint.',
        'count':len(records),'documentedCount':sum(r['documented'] for r in records),'tiles':{},'sources':source_hashes}
    raw_total=gzip_total=0
    for id,buildings in sorted(tiles.items()):
        payload=json.dumps({'version':1,'tileId':id,'buildings':buildings},separators=(',',':'),ensure_ascii=False).encode()
        digest=hashlib.sha256(payload).hexdigest();filename=id+'.'+digest[:12]+'.json'
        (output/filename).write_bytes(payload);raw_total+=len(payload);gz=len(gzip.compress(payload));gzip_total+=gz
        index['tiles'][id]={'url':'/town-evidence/v1/residential/'+filename,'count':len(buildings),'sha256':digest,'bytes':len(payload),'gzipBytes':gz}
    index['bytes']=raw_total;index['gzipBytes']=gzip_total
    # Tests run before CI downloads the large source archive. Keep its exact
    # ownership evidence in a compact committed fixture, verified at generation.
    write_source_owners(records,site)
    path=site/'data/derived/town/residential-evidence-index.json'
    temporary=path.with_suffix('.json.tmp');temporary.write_text(json.dumps(index,separators=(',',':'))+'\n');temporary.replace(path)
    # This task-owned supplement has not been deployed. Prune only its hashed
    # JSON payloads after every new tile and the final index are safely written.
    current={pathlib.Path(asset['url']).name for asset in index['tiles'].values()}
    for previous in output.glob('*.json'):
        if re.fullmatch(r'-?\d+_-?\d+\.[0-9a-f]{12}\.json',previous.name) and previous.name not in current:previous.unlink()
    audit.update(recordCount=len(records),documentedRuntimeCount=index['documentedCount'],tileCount=len(tiles),rawBytes=raw_total,gzipBytes=gzip_total,
        retainedEntryCount=sum(r.get('entry') is not None for r in records),explicitlyMissingEntryCount=sum(r.get('entry') is None for r in records),
        recordCountsByStyle=dict(collections.Counter(r['style'] for r in records)),
        materialBasisCounts=dict(collections.Counter(r['materialBasis'] for r in records)),
        documentedPorchCounts=dict(collections.Counter(r['porch'] for r in records if r['documented'])),
        outputIndex=str(path))
    return index


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source',type=pathlib.Path,default=SOURCE)
    parser.add_argument('--site',type=pathlib.Path,default=SITE)
    parser.add_argument('--reports',type=pathlib.Path,default=REPORTS)
    parser.add_argument('--ledger-only',action='store_true')
    args=parser.parse_args()
    deps=pathlib.Path('/private/tmp/webster-realism-v2-building/python-deps')
    if deps.exists():sys.path.insert(0,str(deps))
    chapter=args.source/'research/sections/residential-neighborhoods.md';register_path=args.source/'research/data/building-register.json'
    text=chapter.read_text();register=read_json(register_path)
    ledger=add_exterior_quotations(enrich_ledger(extract_ledger(text,register,chapter),text,register),text)
    assert len(ledger['records'])==130 and len(ledger['streetProfiles'])==106 and len(ledger['typologies'])==15
    implementation=args.source/'research/implementation';implementation.mkdir(exist_ok=True)
    ledger_path=implementation/'residential-evidence.json';ledger_path.write_text(json.dumps(ledger,indent=2,ensure_ascii=False)+'\n')
    if args.ledger_only:print(json.dumps(ledger['audit'],indent=2));return
    architecture_path=args.source/'street-detail/building_architecture.json'
    ownership_path=args.source/'web-export/realism-v2/source-register.json'
    source_owners={r['struct_id']:r['current_source']['tileId'] for r in read_json(ownership_path)}
    records,audit=build_runtime_records(register,read_json(architecture_path),args.reports,ledger,protected_ids(args.source,args.site),source_owners)
    if audit['geometryErrors']:raise RuntimeError(json.dumps(audit['geometryErrors'][:8]))
    applied={eid for record in records for eid in record['evidenceIds']}
    audit['matchedListingsNotRendered']=[{'recordId':r['recordId'],'address':r['address'],
        'buildingIds':r['join']['principalBuildingIds'],
        'reason':'No residential style/use established on the mapped source structure; new construction may postdate the roofprint. Keep evidence for explicit geometry review.'}
        for r in ledger['records'] if r['join']['mayApplyDocumentedExteriorToUniquePrincipal'] and r['recordId'] not in applied]
    audit['unresolvedListings']=[{'recordId':r['recordId'],'address':r['address'],'status':r['join']['status']}
        for r in ledger['records'] if r['join']['status']!='matched_unique_principal']
    print(f'Prepared {len(records)} residential profiles; sampling rendered terrain.',flush=True)
    audit.update(attach_ground(records,GroundSampler(args.source)))
    hashes={'ledgerSha256':sha(ledger_path),'chapterSha256':sha(chapter),'registerSha256':sha(register_path),'architectureSha256':sha(architecture_path),'sourceTileOwnershipSha256':sha(ownership_path),'reportManifestSha256':audit['reportManifestSha256']}
    write_tiles(records,ledger,args.site,audit,hashes)
    (implementation/'residential-runtime-audit.json').write_text(json.dumps(audit,indent=2)+'\n')
    print(json.dumps(audit,indent=2))


if __name__=='__main__':main()
