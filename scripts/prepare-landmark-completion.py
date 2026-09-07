"""Register four missing civic signatures to immutable source footprints.
Photo pixels remain research references only. Dimensions are fitted interpretations.
"""
import json, math, hashlib
from pathlib import Path
R=Path(__file__).resolve().parents[1]
read=lambda p:json.loads(p.read_bytes())
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
p=R/'data/derived/town/landmark-evidence.json';source=read(p)
rel=read(R/'data/derived/town/release.json');assets=R/'public/town-assets'/rel['directory'];manifest=read(assets/'manifest.json')
recipes={'169031_866728':'joseph','168650_867257':'reconciliation','169995_867213':'fire','169306_866882':'museum'}
rows=[]
for s in source['rows']:
 if s['id'] not in recipes:continue
 r={k:s[k] for k in ['id','structId','name','tileId','outline','frames','frame','base','floor','eave','peak','ridge','sourceEnvelope','footprintSource','evidenceIds']}
 area=sum(a[0]*b[1]-b[0]*a[1] for a,b in zip(r['outline'],r['outline'][1:]+r['outline'][:1]));r['frames']=[]
 for a,b in zip(r['outline'],r['outline'][1:]+r['outline'][:1]):
  dx,dy=b[0]-a[0],b[1]-a[1];w=math.hypot(dx,dy);tangent=[dx/w,dy/w];outward=[-dy/w,dx/w] if area<0 else [dy/w,-dx/w]
  r['frames'].append({'start':a,'tangent':tangent,'outward':outward,'width':w})
 r['recipe']=recipes[s['id']];t=next(t for t in manifest['tiles'] if t['id']==r['tileId'])
 r['origin']=t['origin'];r['lods']=[{'level':l['level'],'sha256':l['sha256']}for l in t['lods']]
 r['replaceBody']=True;r['sourcePeak']=r['peak'];r['heightException']=None
 # Correct the inferred nearest-road orientation using viewed exterior/context.
 if r['recipe']=='joseph':a,b=r['outline'][9],r['outline'][14]
 elif r['recipe']=='museum':a,b=r['outline'][7],r['outline'][0]
 elif r['recipe']=='reconciliation':a,b=r['outline'][1],r['outline'][0] # East nave gable; northeast tower mapped separately.
 else:a=r['frame']['start'];b=[a[k]+r['frame']['tangent'][k]*r['frame']['width'] for k in [0,1]]
 dx,dy=b[0]-a[0],b[1]-a[1];w=math.hypot(dx,dy);u=[dx/w,dy/w];n=[-u[1],u[0]]
 if r['recipe'] in ['reconciliation','fire']:n=[u[1],-u[0]] # East nave and west fire facade both use the right-hand exterior normal.
 points=[[(v[0]-a[0])*u[0]+(v[1]-a[1])*u[1],(v[0]-a[0])*n[0]+(v[1]-a[1])*n[1]] for v in r['outline']]
 # Frame origin lies on the selected facade; model vertices are authored in source coordinates.
 r['frame']={'start':a,'tangent':u,'outward':n,'width':w,'depth':max(v[1]for v in points)-min(v[1]for v in points)}
 if r['recipe']=='joseph':
  r['eave']=r['floor']+9.8;r['ridge']=r['floor']+15.0
  r['observed']=['2025-06-19 Commons photo: two square red-brick western towers; dark aged-metal octagonal spires; a separate smaller green ridge fleche.','Paired pointed belfry louvers, pale horizontal masonry and corner strips; broad central traceried glazing and shallow arched bronze-door portal.','Nave lancets, buttresses, pale foundation and dark pitched roof.']
  r['sources']=[{'url':'https://commons.wikimedia.org/wiki/File:St._Joseph_-_Webster_01.jpg','photoDate':'2025-06-19','author':'Farragutful','license':'CC BY-SA 4.0','viewed':True}]
  r['inferred']=['Tower/body proportions compressed into the retained 24.841 m source height. No source claim of surveyed tower dimensions.','Simplified paired lancets and pale diaper accents interpret the photograph; no copied image textures or sculptural facsimiles.']
 elif r['recipe']=='reconciliation':
  r['heightException']={'basis':'Parish history documents a 52-foot bell tower. Historical exterior confirms its tapered skirt and square louver belfry; the saved spring 2025 MassGIS aerial corroborates the tower at the northeast front corner, but no present-day ground-level exterior was verified.','heightM':52*.3048,'maximumZ':r['floor']+52*.3048,'sourceRoofMaximumZ':r['sourcePeak']}
  r['peak']=r['floor']+52*.3048
  r['observed']=['Viewed historical exterior: vertical board-and-batten walls, steep nave/cross gables, square tower base, strongly tapered skirt, smaller square louver belfry and pyramid cap.']
  r['sources']=[{'url':'https://www.mass.gov/info-details/massgis-data-2025-aerial-imagery','photoDate':'spring 2025; leaf-off aerial','viewed':True},{'url':'https://churchofthereconciliation.wordpress.com/our-history/','photoDate':'historical; exact capture date unverified','viewed':True},{'url':'https://oldewebster.wordpress.com/2021/04/05/church-of-the-reconciliation-1915/','photoDate':'captioned 1915','viewed':True}]
  r['inferred']=['Muted light timber paint is an authored current palette, not a historical monochrome-photo color claim.','Church and attached hall have separate roof fields; tower position corrected to the northeast front corner using the 2025 aerial. Tower form uses dated exterior evidence, not a current ground-level photograph.','East-gable hooded entrance is supported in the historic photo; exact door spacing, color and dimensions are inferred. Aerial paths establish street-side access, not individual door leaves.']
 elif r['recipe']=='fire':
  r['observed']=['Official apparatus photographs show red brick piers, pale broad sign band, thin red fascia and large glazed sectional apparatus doors.','Official station page documents 1968 headquarters with ten apparatus bays and a 2016 renovation.']
  r['sources']=[{'url':'https://webster-ma.gov/363/Our-Stations','viewed':False}]+[{'url':f'https://webster-ma.gov/ImageRepository/Document?documentID={i}','photoDate':'undated official apparatus image','viewed':True}for i in [7121,8743,7141]]
  r['inferred']=['The ten-bay distribution and spacing along the mapped Thompson Road face are an interpretation; published station count is not a surveyed elevation. The exterior normal points west; all ten door fronts must lie outside the source footprint.','Low flat roof and side service openings fitted to retained source envelope; no truck/department lettering added.']
 else:
  r['observed']=['Museum-hosted exterior: charcoal painted brick front, taller pale drill-hall volume, mixed glazed/blocked rectangular openings, white glazed projecting entrance vestibule, pale foundation and black handrails.']
  r['sources']=[{'url':'https://samuelslaterexperience.org/the-museum/','viewed':True},{'url':'https://samuelslaterexperience.org/wp-content/uploads/2021/12/2021-12-1024x546.jpg','photoDate':'publication path December 2021; capture date unverified','viewed':True}]
  r['inferred']=['Vestibule and raised hall are fitted inside the mapped roofprint; no new entrance path or exact floor survey is claimed.','Do not reproduce the printed portrait/mural or fabricate current event signage.']
 rows.append(r)
out={'version':1,'sourceManifestSha256':sha(assets/'manifest.json'),'sourceLandmarkEvidenceSha256':sha(p),'coordinateSystem':'source local east,north,up in metres; runtime X,Y,-north; tile origin applied once','rules':['Exact source SHA and origin gate; replace only selected V2 inferred triangles, never protected/observed geometry.','All current/historical observations and modeled dimensions are separate fields.','Original immutable scenery remains unchanged; source replacement is runtime-derived and batched by material.'],'rows':rows}
(R/'data/derived/town/landmark-completion.json').write_text(json.dumps(out,indent=2)+'\n')
print('Registered',len(rows),'landmarks')
