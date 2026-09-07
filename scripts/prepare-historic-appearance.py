"""Compact dated architectural guidance without shipping the research corpus."""
import hashlib
import json
import re
from pathlib import Path

SITE=Path(__file__).resolve().parents[1]
SOURCE=SITE/'data/derived/town/historic-architecture-evidence.json'
MATERIALS={'clapboard':'siding','vinyl_siding':'siding','aluminum_siding':'siding',
           'shingle':'shingle','asbestos_siding':'shingle','brick':'brick','granite':'stone','stucco':'stucco'}


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
        rows.append({'id':sid,'material':material,'frontageBays':bays,'sourceYear':historic['sourceYear'],
                     'eaveDetail':eave,
                     'evidenceIds':historic['mhcIds'],'currentObserved':False,
                     'urls':sorted({url for e in historic['evidence']for url in e['source']['urls']})})
    output={'version':1,'sourceSha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),'count':len(rows),
            'materialCount':sum(r['material']is not None for r in rows),'bayCount':sum(r['frontageBays']is not None for r in rows),
            'eaveDetailCount':sum(r['eaveDetail']is not None for r in rows),
            'policy':'Dated architectural descriptions guide plausible retained-house materials and bay rhythms. Current listing cladding wins; historic paint is never copied. Asbestos is represented only as a shingle-like historical visual pattern, not asserted as current building material.',
            'rows':rows}
    (SITE/'data/derived/town/historic-appearance.json').write_text(json.dumps(output,separators=(',',':'))+'\n')
    print(json.dumps({k:v for k,v in output.items()if k not in ['rows','policy']}))


if __name__=='__main__':main()
