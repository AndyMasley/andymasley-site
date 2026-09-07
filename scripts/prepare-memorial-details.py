"""Compile small source-qualified civic objects; never modifies scene/road data."""
import hashlib
import json
import math
import os
from pathlib import Path
from pyproj import Transformer

SITE = Path(__file__).resolve().parents[1]
SOURCE = Path(os.environ.get('WEBSTER_SOURCE', '/Users/andy/Documents/New project/webster-blender'))
graph_path = SOURCE / 'web-export/engine/network.json'
graph = json.loads(graph_path.read_text())
origin = graph['origin_projected_m']
project = Transformer.from_crs(4326, 6491, always_xy=True)
rows = []

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def local(lon, lat):
    p = project.transform(lon, lat)
    return [round(p[i] - origin[i], 6) for i in (0, 1)]

def nearest(p, name=None):
    choices = []
    for edge in graph['edges']:
        if edge.get('direction') == 'reverse' or (name and edge['name'] != name):
            continue
        for a, b in zip(edge['points'], edge['points'][1:]):
            dx, dy = b[0] - a[0], b[1] - a[1]
            length = math.hypot(dx, dy)
            if not length:
                continue
            t = max(0, min(1, ((p[0]-a[0])*dx+(p[1]-a[1])*dy)/length**2))
            q = [a[0] + dx*t, a[1] + dy*t]
            choices.append((math.dist(p, q), edge['id'], q, [dx/length,dy/length], edge))
    return min(choices, key=lambda x:x[0])

def add(id, kind, lon, lat, label, width, height, source, inference, center=None):
    point = local(lon, lat)
    center = center or point
    distance, edgeid, q, along, edge = nearest(center)
    normal = [q[i]-center[i] for i in (0,1)]
    length = math.hypot(*normal)
    normal = [v/length for v in normal] if length else [0,1]
    record = dict(id=id, kind=kind, center=center, inventoryPoint=point,
        coordinatesWGS84=[lon,lat], tileId=f'{math.floor(center[0]/250)}_{math.floor(center[1]/250)}',
        frame=dict(start=center,tangent=[-normal[1],normal[0]],outward=normal),
        label=label,width=width,height=height,source=source,inference=inference,
        roadContext=dict(edgeId=edgeid,name=edge['name'],distanceM=distance,halfWidthM=edge['width_m']/2))
    rows.append(record)
    return record

nps='https://npgallery.nps.gov/GetAsset/ec54c744-9f1e-4c03-80a9-ecd91d3e6d6a/'
howitzer='https://www.santee1821.net/preserved-artillery/the-dahlgren-boat-howitzers-of-webster-massachusetts'
for suffix, xy in [('west', local(-71.880722,42.049689)), ('east',local(-71.880433,42.049744))]:
    r=add('MON-002-'+suffix,'howitzer',-71.880722,42.049689,'',1.8,1.4,[nps,howitzer],
        'NPS2009 photo6 and reviewed Santee1821 photographs show bronze short tubes, thin iron spoked wheels and a curved iron trail on concrete pads. They are Dahlgren boat howitzers, not Napoleon field guns. Pair spacing and exact dimensions are authored from the front-walk context; inventory supplies one point only.',xy)
    r['frame']={'start':xy,'tangent':[.954,.299813],'outward':[-.299813,.954]}
    # Normalize the rounded authored frontage direction.
    for key in ['tangent','outward']:
        length=math.hypot(*r['frame'][key]);r['frame'][key]=[v/length for v in r['frame'][key]]
r=add('MON-004-court','honor_court',-71.879981,42.049813,'COURT OF HONOR',9.2,1.0,[nps,'https://www.webster-ma.gov/DocumentCenter/View/18803/Veteran-Brick-Form---100'],
    'Brick paving, southern semicircular half-wall, bronze WWII soldier and rectangular newer stones are documented. Court extent, paver pattern, statue pose and relative minor stone placement are authored. Existing mapped Korea/Vietnam tablets are retained. No personal inscriptions are invented.',[-2738,-929])
r['frame']={'start':r['center'],'tangent':[1,0],'outward':[0,1]}

markers=[
 ('008','podium',-71.880020,42.050005,'GUENTHER SQUARE',.6096,1.2192,'936'),
 ('009','post_plaque',-71.877160,42.049713,'KOSCIUSKO SQUARE',.3048,2.4384,'906'),
 ('010','tablet',-71.877197,42.049712,'THE HUB · 1941–1945',.762,1.2192,'905'),
 ('011','portrait_tablet',-71.876064,42.054898,'LEGRIS SQUARE',.9144,1.3716,'908'),
 ('012','podium',-71.863714,42.060280,'ALBETSKI SQUARE',.75,1.15,'932'),
 ('020','tablet',-71.870368,42.051528,'URBANOWSKI SQUARE',.6096,1.2192,'915'),
 ('024','tablet',-71.845385,42.059985,'BICENTENNIAL SQUARE',2.1336,2.1336,'933'),
 ('025','podium',-71.831052,42.045063,'GORE CHURCH · 1872',1.05,.80,'935'),
 ('026','boulder',-71.840192,42.084223,'NESSMUK',1.8288,1.8288,'909'),
 ('018','podium',-71.863636,42.051860,'BORUS SQUARE',.72,1.15,'934'),
 ('019','tablet',-71.866583,42.053722,'JABLONSKI SQUARE',.72,1.10,'907'),
 ('023','park_stone',-71.876102,42.061894,'WILLIAM S. SLATER\nMEMORIAL PARK',1.0,1.2192,'918'),
]
for number,kind,lon,lat,label,width,height,macris in markers:
    center=local(lon,lat)
    if number=='012':center=[center[0]+3.75,center[1]-.30]
    r=add('MON-'+number,kind,lon,lat,label,width,height,[f'https://mhc-macris.net/Documents/WEB/PDFs/WEB_{macris}.pdf'],
        'MHC point and described memorial form; dated inventory is not a current survey. Unmeasured dimensions, inscription typography, patina and finish are authored. Only documented public monument names are lettered.',center)
    if number=='012':r['inference']+=' Albetski inventory pin falls inside the retained Worcester Road. A3.76m eastward placement on the adjacent documented junction corner is authored for clearance, not a surveyed marker relocation.'
    if number=='020':r['source'].append('https://webster-ma.gov/CivicAlerts.aspx?AID=414&ARC=780')
for number,kind,lon,lat,label,width,height,hmdb in [
 ('013','obelisk',-71.86360595,42.06046689,'SAMUEL SLATER',.80,1.524,'122917'),
 ('014','rock_plaque',-71.8635363,42.06040328,'SLATER COTTON MILL',.9,.85,'122920'),
 ('015','rock_plaque',-71.86339967,42.06036565,'EAST VILLAGE\nTEXTILE MILL',.9,.85,'122918'),
 ('017','historical_tablet',-71.86295,42.04595,'CHAUBUNAGUNGAMAUG\n1674',.94,2.0,'48783'),
]:
    add('MON-'+number,kind,lon,lat,label,width,height,[f'https://www.hmdb.org/m.asp?m={hmdb}'],
        'Uses published post-2012 relocated coordinates for Slater group, not obsolete MHC positions. Marker names/forms follow cited records; unmeasured plaque supports, colour and exact typography remain authored. Historical marker represents the physical tablet, not an assertion of the original settlement location.')

for code,number,name,lon,lat,gates in [
 ('35','501838S','MAIN STREET',-71.885142,42.0490489,True),
 ('36','501841A','NORTH MAIN STREET',-71.8787369,42.0650779,False),
 ('37','501837K','HILL STREET',-71.8867479,42.0430949,False),
 ('38','501836D','PERRYVILLE ROAD',-71.8831069,42.0248801,False),
]:
    point=local(lon,lat)
    distance,eid,q,along,edge=nearest(point,name)
    assert distance<20,(name,distance)
    normal=[along[1],-along[0]]
    r=add('ST-'+code,'rail_crossing',lon,lat,'',edge['width_m'],3.6,
        ['https://fragis.fra.dot.gov/arcgis/rest/services/FRA/FRAGradeXing/MapServer/0'],
        f'FRA{number}, inventory updated2025-11-17: '+('automatic gates' if gates else 'flashing lights without recorded gates')+'. Masts are authored outside the carriageway; Main Street arms are upright in this late-summer daytime scene. No daytime train, activation timing, exact hardware model or surveyed mast location is asserted.')
    r.update(gates=gates,fraCrossingId=number)
    r['frame']={'start':point,'tangent':along,'outward':normal}
    rows.remove(r)
    for side in [-1,1]:
        mast=json.loads(json.dumps(r));u=side*4.0;v=side*(r['width']/2+1.15)
        xy=[q[i]+along[i]*u+normal[i]*v for i in (0,1)]
        mast['id']=r['id']+('-a' if side<0 else '-b')
        mast['crossingPoint']=point;mast['projectedRoadCenter']=q;mast['center']=xy
        mast['placementBasis']='FRA crossing identity retained; device offsets start at its projection onto the named retained road, not the unsurveyed inventory point.'
        mast['inventoryToRoadShiftM']=distance
        mast_distance,mast_edgeid,_,_,mast_edge=nearest(xy,name)
        mast['roadContext']=dict(edgeId=mast_edgeid,name=name,distanceM=mast_distance,halfWidthM=mast_edge['width_m']/2)
        mast['tileId']=f'{math.floor(xy[0]/250)}_{math.floor(xy[1]/250)}'
        mast['frame']={'start':xy,'tangent':[normal[i]*side for i in (0,1)],'outward':[-along[i]*side for i in (0,1)]}
        rows.append(mast)
# This mapped plaque sits1.08m south of a250m cell seam. Its intact terrain
# triangle is owned by the north packet, verified with all three native GLBs.
slater=next(r for r in rows if r['id']=='MON-015');slater['tileId']='-6_1'
slater['ownershipBasis']='Native source terrain triangle ownership across the250m cell seam; object remains at its published coordinates.'

for row in rows:
    f=row['frame'];t,n=f['tangent'],f['outward']
    assert abs(math.hypot(*t)-1)<1e-9 and abs(math.hypot(*n)-1)<1e-9
    assert abs(t[0]*n[0]+t[1]*n[1])<1e-9
data={'version':1,'sourceNetworkSha256':sha(graph_path),'sourceChapters':[
 {'path':'sections/'+name,'sha256':sha(SOURCE/'research/sections'/name)} for name in ['signs-monuments-markers.md','streetscape-and-road-furniture.md']],
 'coordinates':'Source local EPSG6491 metres. Three X,Y,Z=east,height,-north.',
 'runtimePolicy':'Bounded per-tile additions; sample retained terrain; reject missing support or road-overlapping civic objects. No source mesh or driving graph mutations.', 'objects':rows}
path=SITE/'data/derived/town/memorial-details.json'
path.write_text(json.dumps(data,ensure_ascii=False,separators=(',',':'))+'\n')
print(f'{len(rows)} features, {path.stat().st_size} bytes')
