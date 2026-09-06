"""Join the manual casualty audit to original reports; never infer a person from a crash count."""
import json
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
def read(path):
    return json.loads((ROOT / path).read_text())
ledger = read('data/derived/traffic/av-2026-ledger.json')
audit = read('data/source/traffic/casualty-audit.json')
later = read('data/source/traffic/postcutoff-audit.json')
reports = {r['id']: r for r in ledger['incidents'] if r['kind'] == 'injury_crash'}
assert {r['id'] for r in audit['entries']} == set(reports)
assert len(audit['entries']) == len(reports)
cases = []
for entry in audit['entries']:
    report = reports[entry['id']]
    count = entry['minimum']
    assert count is None or (isinstance(count, int) and count > 0)
    assert entry['precision'] != 'unresolved' or count is None
    if count is not None:
        assert entry['evidence'] in report['narrative']
    sources = [{'label': 'Federal report ' + report['id'], 'url': report['sourceUrl']}]
    sources += [{'label': 'NTSB investigation', 'url': x['sourceUrl']} for x in ledger['additionalEvidence'] if x.get('relatedReportId') == report['id']]
    cases.append(dict(id=entry['id'], date=report['month'], place=report['city'] + ', ' + report['state'], company=report['entity'], count=count, summary=entry['summary'], note=entry['responsibilityNote'], evidence=entry['evidence'], precision=entry['precision'], sources=sources))
for case in later['additionalCases']:
    assert case['incidentDate'] > later['scope']['federalSnapshotReportedThrough']
    cases.append(dict(id=case['id'], date=case['incidentDate'], place=case['city'] + ', ' + case['state'], company=case['company'], count=case['humanInjuriesMinimum'], summary=case['shortSummary'], note=case['causeSummary'] + ' ' + case['readerNote'], evidence=None, precision='exact' if case['humanInjuriesExact'] is not None else 'minimum', sources=[{'label': s['title'], 'url': s['url']} for s in case['sources']]))
fatal = later['existingCaseVerified']
deaths = [dict(id=fatal['id'], date=fatal['incidentDate'], place=fatal['city'] + ', ' + fatal['state'], company=fatal['company'], count=fatal['humanDeathsExact'], summary=fatal['shortSummary'], note=fatal['causeSummary'], evidence=None, precision='exact', sources=[{'label': fatal['source']['title'], 'url': fatal['source']['url']}])]
animals = []
for case in ledger['incidents']:
    if case['kind'] != 'animal': continue
    animal = case['animal']
    animals.append(dict(id=case['id'], date=case['month'], place=case['city'] + ', ' + case['state'], company=case['entity'], species=animal['species'], outcome=animal['outcome'], count=animal['count'], summary=animal['summary'], source=case['sourceUrl']))
assert len(set(x['id'] for x in cases)) == len(cases)
assert sum(x['minimum'] or 0 for x in audit['entries']) == audit['summary']['humanInjuredMinimumFromExplicitNarratives']
result = dict(through='2026-09-05', reviewed='2026-09-06', federalReceivedThrough=ledger['metadata']['reportsReceivedThrough'], injuryMinimum=sum(c['count'] or 0 for c in cases), unresolvedInjuryReports=sum(c['count'] is None for c in cases), unknownSeverityReports=ledger['metadata']['unknownSeverityIncidentCount'], federalInjuryMinimum=audit['summary']['humanInjuredMinimumFromExplicitNarratives'], deaths=deaths, injuries=cases, animals=animals, excluded=later['notAdded'], birdContext=dict(low=89000000, high=340000000, year=2014, source='https://doi.org/10.1002/jwmg.721', readableSource='https://www.fws.gov/story/threats-birds-collisions-road-vehicles'), unconfirmedAnimal=dict(date='2026-01-01', place='San Antonio, TX', summary='A cat was reportedly killed by a Waymo on January 1. The police account cited by the newspaper does not establish who or what was driving.', source='https://www.expressnews.com/business/article/waymo-robotaxis-san-antonio-neighborhoods-parked-21360403.php'))
(ROOT/'data/derived/traffic/visual.json').write_text(json.dumps(result, indent=2)+'\n')
print(f"Casualty view: {result['injuryMinimum']} reported injured people minimum; {result['unresolvedInjuryReports']} unquantified injury reports; {len(animals)} animal reports")
