"""Derive shallow civic detail frames from the immutable Town Hall source envelope.

Run scripts/civic_details/inspect-source.mjs first. Source photos establish forms;
bay spacing, trim profiles and dimensions are explicitly modeled interpretations.
"""
import hashlib
import json
import math
import os
from pathlib import Path

SITE = Path(__file__).resolve().parents[1]
SOURCE = Path(os.environ.get('WEBSTER_SOURCE', '/Users/andy/Documents/New project/webster-blender'))
WORK = Path(os.environ.get('WEBSTER_CIVIC_QA', '/private/tmp/webster-research-completion/landmarks'))
read = lambda p: json.loads(p.read_bytes())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
selection = read(SITE / 'data/derived/town/town-hall-materials.json')
geometry = read(WORK / 'town-hall-source-geometry.json')
architecture = SOURCE / 'street-detail/building_architecture.json'
outline = next(r['outline_xy'] for r in read(architecture) if r['struct_id'] == selection['structId'])[:-1]
# Omit the complete protected Main Street front (faces21–25), and avoid adding
# unsupported openings to the largely blind school west end (face14).
recipes = {
 0: ('town-hall-side', 5), 1: ('town-hall-return', 2),
 2: ('auditorium', 4), 3: ('school-north', 1), 5: ('school-north-arched', 5),
 7: ('school-north', 2), 8: ('school-east', 4),
 9: ('school-south', 8), 11: ('school-entry', 5), 13: ('school-south', 9),
 14: ('school-blind-end', 0), 15: ('school-north', 9),
 18: ('auditorium', 4), 19: ('town-hall-return', 2), 20: ('town-hall-side', 5),
}
frames=[]
for i,(recipe,bays) in recipes.items():
 a,b=outline[i],outline[(i+1)%len(outline)]
 dx,dy=b[0]-a[0],b[1]-a[1];width=math.hypot(dx,dy)
 tangent=[dx/width,dy/width];outward=[-dy/width,dx/width]
 profiles=[]
 for row in geometry['lods']:
  vertices=[]
  for tri in row['wallTriangles']:
   uv=[((p[0]-a[0])*tangent[0]+(p[1]-a[1])*tangent[1],(p[0]-a[0])*outward[0]+(p[1]-a[1])*outward[1],p[2]) for p in tri]
   if all(abs(p[1])<.003 and -.003<=p[0]<=width+.003 for p in uv):vertices.extend(uv)
  assert vertices,(i,row['level'])
  profiles.append({'level':row['level'],'minZ':min(p[2]for p in vertices),'maxZ':max(p[2]for p in vertices)})
 frames.append({'id':f'CIVIC-{selection["structId"]}-F{i:02}', 'structId':selection['structId'],'tileId':selection['tileId'],'faceIndex':i,'start':a,'tangent':tangent,'outward':outward,'width':width,'recipe':recipe,'bays':bays,'sourceBounds':profiles,
 'evidenceIds':['CIV-1' if recipe.startswith('town')else'CIV-2'],'dimensionBasis':'Photograph-informed proportions fitted to the exact mapped wall plane; approximate bay spacing and detail dimensions, not a facade survey.'})
data={'version':1,'structId':selection['structId'],'tileId':selection['tileId'],'sourceManifestSha256':selection['sourceManifestSha256'],'sourceArchitectureSha256':sha(architecture),'sourceMaterialSelectionSha256':sha(SITE/'data/derived/town/town-hall-materials.json'),'sourcePhotoEvidenceSha256':sha(SOURCE/'research/implementation/town-hall-material-fix/evidence.json'),'sourceMeshName':selection['meshName'],'sourceParentName':selection['parentName'],'sourceMaterial':selection['sourceMaterial'],'lods':selection['lods'],'origin':geometry['origin'],'outline':outline,'frames':frames,
 'sourceUrls':['https://npgallery.nps.gov/GetAsset/ec54c744-9f1e-4c03-80a9-ecd91d3e6d6a/','https://www.dimellashaffer.com/projects/sitkowski-apartments/','https://www.dimellashaffer.com/wp-content/uploads/2017/08/Sitkowski_01.jpg','https://commons.wikimedia.org/wiki/File:Town_Hall,_Webster_MA.jpg'],
 'observations':['August2009 NPS photos17/18/19/22/23 show side openings, auditorium fanlights and school masonry trim.','Architect completed-renovation exterior shows five central school bays, six tall pale pilasters, pale lower entrance surround and a pediment clock.','Rectangular school glazing follows completed-renovation photo, not the opaque1970s infill visible in2009.'],
 'inference':['Wing bay counts, spacing and heights are approximate interpretations within the retained source envelope.','Simplified pale capitals/clock ornament retain recognizable forms without claiming sculptural accuracy.','Shallow exterior panes imply openings; the protected solid source wall is not cut or moved.','No new text signage, current business branding, surveyed entrances or terrain access paths are claimed.'],
 'excludedFaces':{'21-25':'Existing detailed Main Street portico and front windows, preserved exactly.','4,6,10,12,16,17':'Short footprint returns; omit detail to avoid crowded or unsupported miniature windows.'}}
out=SITE/'data/derived/town/civic-details.json';out.write_text(json.dumps(data,indent=2)+'\n')
print('Civic frames',len(frames),'source-gated LODs',len(data['lods']),'bytes',out.stat().st_size)
