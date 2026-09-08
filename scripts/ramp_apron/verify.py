"""Independent GEOS checks against the actual currently assembled source tile."""
import gzip,json
from pathlib import Path
import numpy as np
from shapely.geometry import Polygon,Point
from shapely.ops import unary_union
work=Path('/private/tmp/webster-finished-game/ramp-apron');source=work.parent/'road-review/current-assembly'
poses=json.loads((work/'poses.json').read_text());rows=[]
def plane(t):
    t=np.array(t);return t[0,:2],np.linalg.solve(np.column_stack([t[:,:2]-t[0,:2],np.ones(3)]),t[:,2])
def at(model,p):return (np.array(p)-model[0])@model[1][:2]+model[1][2]
for level in range(3):
    added=json.loads((work/f'output-{level}.json').read_text())['added'];roads=json.load(gzip.open(source/f'-5_1-{level}.pavement.json.gz'))
    old=unary_union([Polygon(np.array(t)[:,:2])for t in roads]);patch=unary_union([Polygon(np.array(t)[:,:2])for t in added]);new=old.union(patch)
    before=max(Polygon(p['quad']).difference(old).area for p in poses);after=max(Polygon(p['quad']).difference(new.buffer(.00001)).area for p in poses)
    assert after<.0001,(level,after)
    clearance=[];protected=[]
    context=json.load(gzip.open(source/f'-5_1-{level}.gap-context.json.gz'))
    for r in context:
        t=r['triangle'];p=Polygon(np.array(t)[:,:2])
        if p.area<1e-9:continue
        for a in added:
            overlap=p.intersection(Polygon(np.array(a)[:,:2]));
            if overlap.area<1e-8:continue
            polygons=[overlap]if overlap.geom_type=='Polygon'else[g for g in getattr(overlap,'geoms',[])if g.geom_type=='Polygon']
            for poly in polygons:
                heights=[float(at(plane(a),q)-at(plane(t),q))for q in poly.exterior.coords]
                if r['name'].startswith('terrain'):clearance+=heights
                elif not(r['material'].startswith('Drive road |')and('shoulder'in r['material']or'asphalt'in r['material'])):protected.append({'name':r['name'],'material':r['material'],'areaM2':poly.area,'minApronAboveM':min(heights)})
    assert min(clearance)>.015,(level,min(clearance))
    assert not protected,protected
    assert patch.intersection(old).area<.0001
    rows.append({'level':level,'carPoses':len(poses),'spacingM':.1,'carEnvelopeM':[5.2,2.4],'beforeWorstUnpavedM2':before,'afterWorstUnpavedM2':after,'apronAreaM2':patch.area,'minimumTerrainClearanceM':min(clearance),'sourcePavementOverlapM2':patch.intersection(old).area,'protectedMeshIntersections':len(protected)})
report={'passed':True,'rows':rows};(work/'surface-proof.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
