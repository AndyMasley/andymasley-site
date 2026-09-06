#!/usr/bin/env python3
"""Rebuild the 2026 AV incident ledger from NHTSA's ADS CSV.
Public source: https://static.nhtsa.gov/odi/ffdd/sgo-2021-01/SGO-2021-01_Incident_Reports_ADS.csv
Usage: python3 build-av-ledger.py INPUT.csv OUTPUT.json
Counts reports/unique incidents, not casualties or causation.
"""
import csv, json, hashlib, collections, sys
from datetime import datetime
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
src=Path(sys.argv[1]) if len(sys.argv)>1 else ROOT/'data/source/traffic/sgo-ads-20260827.csv'
out=Path(sys.argv[2]) if len(sys.argv)>2 else ROOT/'data/derived/traffic/av-2026-ledger.json'
with src.open(encoding='utf-8-sig',newline='') as f: raw=list(csv.DictReader(f))
latest={}
for r in raw:
    key=r['Report ID'].strip()
    if key not in latest or int(r['Report Version'])>int(latest[key]['Report Version']):
        latest[key]=r
in_year=[r for r in latest.values() if r['Incident Date'].endswith('-2026')]
verified=[r for r in in_year if r['Automation System Engaged?']=='ADS' and r['Engagement Status']=='Verified Engaged']
# Deduplicate report versions above, then assert NHTSA has distinct Same Incident IDs.
# Stop if a future release creates duplicate incident IDs so they can be reviewed explicitly.
ids=[r['Same Incident ID'].strip() for r in verified]
assert all(ids), 'Missing Same Incident ID requires review'
assert len(ids)==len(set(ids)), 'Multiple reports per incident require review'
injury_values={
    'Minor W/O Hospitalization','Minor W/ Hospitalization',
    'Moderate W/O Hospitalization','Moderate W/ Hospitalization',
    'Serious W/O Hospitalization','Serious W/ Hospitalization',
}
animals={
    '30270-15403': dict(species='dog',outcome='injury',count=1,summary='Waymo reported that a dog entered the road between parked cars and was struck while the vehicle slowed and moved left. The dog sustained injuries.'),
    '30270-15002': dict(species='domestic animal (unspecified)',outcome='injury',count=1,summary='Waymo reported striking a domestic animal that ran into its lane in Los Angeles. The animal sustained injuries.'),
    '30270-15249': dict(species='deer',outcome='unknown',count=1,summary='Waymo reported striking a deer that ran into its lane in Burlingame. Vehicle damage and towing were reported; the deer’s outcome was not stated.'),
    '31101-14654': dict(species='duck',outcome='death',count=1,summary='Avride reported that its vehicle approached a duck lying in the road and made contact with it while proceeding straight. The collision killed the duck.'),
    '30270-13663': dict(species='raccoon',outcome='unknown',count=1,summary='Waymo reported striking a raccoon that ran into its lane in Del Valle. Vehicle damage and towing were reported; the raccoon’s outcome was not stated.'),
}
CSV_URL='https://static.nhtsa.gov/odi/ffdd/sgo-2021-01/SGO-2021-01_Incident_Reports_ADS.csv'
ledger=[]
for r in verified:
    severity=r['Highest Injury Severity Alleged'].strip()
    is_injury=severity in injury_values
    is_fatal=severity=='Fatality'
    is_animal=r['Crash With'].strip()=='Animal'
    if not (is_injury or is_fatal or is_animal): continue
    date=datetime.strptime(r['Incident Date'],'%b-%Y').strftime('%Y-%m')
    item=dict(id=r['Report ID'],sameIncidentId=r['Same Incident ID'],reportVersion=int(r['Report Version']),month=date,sourceIncidentMonth=r['Incident Date'],reportSubmissionMonth=r['Report Submission Date'],entity=r['Reporting Entity'],city=r['City'],state=r['State'],crashWith=r['Crash With'],severity=severity,engagementStatus=r['Engagement Status'],driverOperatorType=r['Driver / Operator Type'],precrashSpeedMph=r['SV Precrash Speed (MPH)'],kind='animal' if is_animal else ('fatality_crash' if is_fatal else 'injury_crash'),sourceUrl=CSV_URL,narrative=r['Narrative'])
    if is_animal:
        assert r['Report ID'] in animals, 'New animal record requires narrative review'
        item['animal']=animals[r['Report ID']]
    ledger.append(item)
ledger.sort(key=lambda r:(r['month'],r['id']))
result={
 'metadata':{
  'title':'2026 ADS incidents reported to NHTSA: verified engagement',
  'retrievedDate':'2026-09-06',
  'sourceCsvUrl':CSV_URL,
  'sourceOverviewUrl':'https://www.nhtsa.gov/laws-regulations/standing-general-order-crash-reporting',
  'sourceDictionaryUrl':'https://static.nhtsa.gov/odi/ffdd/sgo-2021-01/SGO-2021-01_Data_Element_Definitions.pdf',
  'sourceReleaseDate':'2026-08-17',
  'sourceCorrectionDate':'2026-08-27',
  'reportsReceivedThrough':'2026-07-15',
  'sourceSha256':hashlib.sha256(src.read_bytes()).hexdigest(),
  'sourceRows':len(raw),'latestReportIds':len(latest),'latest2026ReportIds':len(in_year),
  '2026EngagementStatusCounts':dict(collections.Counter(r['Engagement Status'] for r in in_year)),
  'filter':'Latest Report Version for each Report ID; Incident Date in 2026; Automation System Engaged? = ADS; Engagement Status = Verified Engaged. Confirm Same Incident IDs are distinct.',
  'verifiedIncidentCount':len(verified),
  'verifiedIncidentMonths':dict(sorted(collections.Counter(datetime.strptime(r['Incident Date'],'%b-%Y').strftime('%Y-%m') for r in verified).items())),
  'minimumIncidentMonth':min(r['month'] for r in [dict(month=datetime.strptime(x['Incident Date'],'%b-%Y').strftime('%Y-%m')) for x in verified]),
  'maximumIncidentMonth':max(datetime.strptime(x['Incident Date'],'%b-%Y').strftime('%Y-%m') for x in verified),
  'injuryCrashCount':sum(r['Highest Injury Severity Alleged'] in injury_values for r in verified),
  'fatalityCodedCrashCount':sum(r['Highest Injury Severity Alleged']=='Fatality' for r in verified),
  'unknownSeverityIncidentCount':sum(r['Highest Injury Severity Alleged']=='Unknown' for r in verified),
  'verifiedSeverityCounts':dict(collections.Counter(r['Highest Injury Severity Alleged'] for r in verified)),
  'animalCollisionCount':len([r for r in verified if r['Crash With']=='Animal']),
  'animalNarrativeOutcomes':{'deaths':1,'injuries':2,'outcomeUnknown':2},
  'limits':[
   'Incident dates expose month and year only. July 15 is the report-receipt cutoff, not a guarantee all incidents through that date have been reported.',
   'Verified Engaged covers engagement at any time within 30 seconds immediately before commencement through conclusion of the crash. A human may have taken over before contact.',
   'Highest Injury Severity Alleged is one category per incident; the public CSV has no structured casualty-count fields. Injury-crash counts must not be labelled as numbers of injured people.',
   'The reports describe involvement and allegations; they do not adjudicate fault or establish that ADS caused the harm.',
   'Some records have unknown injury severity; reports can be delayed, incomplete, unverified or redacted. Zero fatality-coded records is not proof of zero deaths.',
   'Animal outcomes are coded separately here using narratives; all five animal-collision records have a no-injury/property-damage severity code. This is a documented minimum, not a census.',
   'ADS and SAE Level 2 ADAS are distinct. The latter require a human driver and are excluded from this AV ledger.',
   'Raw national human totals and these ADS counts have different units, periods, coverage and mileage exposure; they cannot establish comparative safety per mile.'
  ]
 },
 'incidents':ledger,
 'additionalEvidence':[
  {'id':'NTSB-HWY26FH008','date':'2026-01-23','kind':'independent_investigation','city':'Santa Monica','state':'CA','entity':'Waymo LLC','relatedReportId':'30270-13850','summary':'NTSB reports a Waymo ADS vehicle struck a 9-year-old pedestrian. The child reported minor injuries and did not require medical transport. The March 3 preliminary report says probable cause remains under investigation.','sourceUrl':'https://www.ntsb.gov/investigations/Pages/HWY26FH008.aspx','publicationDate':'2026-03-03'},
  {'id':'NBCDFW-Dallas-2026-08-07','date':'2026-08-07','kind':'post_cutoff_fatal_crash','city':'Dallas','state':'TX','entity':'Waymo LLC','peopleKilled':1,'summary':'NBC DFW, citing Dallas police and surveillance footage it obtained, reports an SUV struck a pedestrian, after which he contacted an unoccupied Waymo in the opposing lanes. The man died in hospital. The investigation was ongoing. This incident is after the federal CSV’s reporting cutoff and is not a finding that Waymo caused the death.','sourceUrl':'https://www.nbcdfw.com/news/local/pedestrian-killed-suv-crash-waymo-dallas/4060058/','publicationDate':'2026-08-08'}
 ]
}
out.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(result['metadata'],ensure_ascii=False,indent=2))
print('Wrote',str(out),'with',len(ledger),'records')
