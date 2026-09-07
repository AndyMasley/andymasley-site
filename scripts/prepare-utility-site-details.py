"""Generate the photographed WWTP basin forms from whitelisted source inputs."""
import hashlib,json,math
from pathlib import Path
from shapely.geometry import Polygon,LineString
from shapely.geometry.polygon import orient

ROOT=Path(__file__).resolve().parents[1]
source_path=ROOT/'data/source/town/utility-site-source-input.json'
source=json.loads(source_path.read_bytes())
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
rows=[]
circle_max=max(s['max']for r in source['basins']if r['kind']=='circular'for s in r['terrainSupport'])
cell_max=max(s['max']for r in source['basins']if r['kind']=='rectangular'for s in r['terrainSupport'])
for r in source['basins']:
    shape=orient(Polygon(r['outline']),sign=1)
    assert shape.is_valid and r['protectedBuildingDistanceM']>.12
    assert all(abs(s['coveredAreaM2']-s['requestedAreaM2'])<.001 for s in r['terrainSupport'])
    outer=list(map(list,shape.exterior.coords))[:-1]
    # Radial/centroid inset retains paired vertices at every rim segment.
    c=shape.centroid
    if r['kind']=='circular':
        inner=[[x+(c.x-x)*.40/math.hypot(x-c.x,y-c.y),y+(c.y-y)*.40/math.hypot(x-c.x,y-c.y)]for x,y in outer]
    else:
        inset=orient(shape.buffer(-.40,join_style=2),sign=1)
        q=list(map(list,inset.exterior.coords))[:-1]
        inner=[min(q,key=lambda p:(p[0]-x)**2+(p[1]-y)**2)for x,y in outer]
    assert len(outer)==len(inner) and Polygon(inner).within(shape)
    bridge=r['bridge']
    if r['kind']=='circular':
        a,b=bridge;dx,dy=b[0]-a[0],b[1]-a[1];length=math.hypot(dx,dy);dx/=length;dy/=length
        boundary=shape.boundary.intersection(LineString([a,[a[0]+dx*100,a[1]+dy*100]]))
        assert boundary.geom_type=='Point'
        bridge=[a,[boundary.x-dx*.20,boundary.y-dy*.20]]
    water=(circle_max if r['kind']=='circular'else cell_max)+.10
    row={**r,'outline':outer,'innerOutline':inner,'bridge':bridge,'base':min(s['min']for s in r['terrainSupport'])-.10,'water':water,'rim':water+.36,'railHeightM':1.02,'walkwayWidthM':.72,'liquidPaint':'#304b4e'if r['kind']=='circular'else'#514f41','appearanceBasis':{'observed':'Open circular or rectangular interior, concrete rim, narrow bridge/walkway visible in the registered 2025 aerial.','inferred':'Uniform water/rim elevations fitted above every retained LOD terrain triangle; liquid colors, rail section/height, rim thickness and walkway width are authored. Circular walkway rays extend to the fitted rim so their ends are supported. No treatment process, operational state, public access or hydraulic depth is asserted.','source':'SITE-050 and IND-21; actual aerial supersedes the chapter square-bounding-box tank guesses.','currentStatus':'Visible in spring 2025 imagery; no claim of a 2026 site inspection.'}}
    rows.append(row)
out={'version':1,'sourceManifestSha256':source['sourceManifestSha256'],'sourceInputSha256':sha(source_path),'imagery':source['imagery'],'sourceChapter':{'path':'research/sections/institutions-utilities-sites.md','lines':[191,216],'url':'https://www.epa.gov/system/files/documents/2021-07/draftma0100439permit.pdf','basis':'Plant identity only; visual basin registration comes from the 2025 aerial.'},'sourceBuildingsRetained':[r['id']for r in source['protectedBuildings']],'sourceCorrections':['The ten tabulated mapped outlines predominantly follow roofed plant buildings; square bounding boxes do not prove circular tanks. The three large open circles and six central cells are outside all ten source building footprints.','No source triangles are removed or recolored. Other circular structures and the southern rectangular mapped body remain unchanged because their open/covered status is less certain at this image resolution.'],'rows':rows}
(ROOT/'data/derived/town/utility-site-details.json').write_text(json.dumps(out,separators=(',',':'))+'\n')
print(json.dumps({'rows':len(rows),'tiles':sorted(set(r['tileId']for r in rows)),'sourceTreesInBasins':sum(len(r['sourceTreeAnchorsInside'])for r in rows),'sha256':sha(ROOT/'data/derived/town/utility-site-details.json')}))
