"""Sparse terrain repairs against the immutable rendered shoulder triangles.

Run extract-terrain-finish.mjs first. Every replacement is clipped to the actual
road union and a1.5m verge. Mapped building/water polygons stay unchanged. Only
small intrusions are lowered; this does not raise terrain toward bridge decks.
"""
import argparse, gzip, hashlib, json, math, os, sys, time
from concurrent.futures import ProcessPoolExecutor
import multiprocessing
from pathlib import Path
import numpy as np
from shapely.geometry import Polygon, Point
from shapely.geometry.polygon import orient
from shapely.ops import unary_union
from shapely.strtree import STRtree
from shapely.errors import GEOSException
sys.path.insert(0, os.environ.get('WEBSTER_MANIFOLD_PATH','/private/tmp/webster-realism-v2-building/python-deps'))
import manifold3d as mf

SITE=Path(__file__).resolve().parents[1]
WORK=Path(os.environ.get('TERRAIN_FINISH_WORK','/private/tmp/webster-finished-streets-audit'))
SOURCE=Path(os.environ.get('WEBSTER_SOURCE','/Users/andy/Documents/New project/webster-blender'))
BLEND=1.5
CLEARANCE=.075
MAX_FULL_DROP=1.5
MAX_DROP=2.0
EXCLUSION_PATH=SITE/'data/derived/town/terrain-finish-source-exclusions.json'
EXCLUSIONS=json.loads(EXCLUSION_PATH.read_text())

def source_exclusion(tile_id,level,mesh,triangle,source_hash):
    for row in EXCLUSIONS['triangles']:
        if (row['tileId'],row['level'],row['mesh'],row['triangle'])==(tile_id,level,mesh['name'],triangle):
            if row['sourceSha256']!=source_hash or row['geometryStamp']!=mesh['geometryStamp']:raise ValueError('Stale retained source exception')
            return {k:v for k,v in row.items()if k not in ('tileId','sourceSha256','geometryStamp','quantizedDoubleArea','sourceDoubleArea')}
    return None

def digest(b):return hashlib.sha256(b).hexdigest()
def polygons(value):
    if isinstance(value,Polygon):return [value]if value.area>1e-10 else []
    return [p for p in getattr(value,'geoms',[])if isinstance(p,Polygon)and p.area>1e-10]
def smooth(t):return t*t*(3-2*t)
def height_plane(points):
    points=np.asarray(points,dtype=float);xy=points[:,[0,2]]
    coefficients=np.linalg.solve(np.column_stack((xy-xy[0],np.ones(3))),points[:,1])
    return xy,coefficients

def mesh_triangles(mesh):
    positions=np.asarray(mesh['positions'],dtype=float)
    ids=np.asarray(mesh['index']if mesh['index']is not None else np.arange(len(positions)),dtype=int).reshape((-1,3))
    return positions,ids

class Support:
    def __init__(self,roads,protected):
        self.roads=roads;self.shapes=[row[0]for row in roads];self.tree=STRtree(self.shapes)
        self.protected=protected;self.protected_tree=STRtree(protected);self.cache={}
    def target(self,x,z,original,candidates):
        key=(round(x,8),round(z,8))
        if key not in self.cache:
            p=Point(x,z);near=list(map(int,self.tree.query(p,predicate='dwithin',distance=BLEND)))
            fields=[]
            for k in near:
                shape,co,origin=self.roads[k];distance=shape.distance(p)
                if distance>=BLEND:continue
                y=(x-origin[0])*co[0]+(z-origin[1])*co[1]+co[2]-CLEARANCE
                fields.append((y,1-smooth(distance/BLEND)))
            exclusions=self.protected_tree.query(p,predicate='dwithin',distance=.75)
            distance=min((self.protected[k].distance(p)for k in exclusions),default=.75)
            protection=smooth(min(1,distance/.75))
            self.cache[key]=(fields,protection)
        fields,protection=self.cache[key];best=original
        for y,weight in fields:
            delta=original-y
            if delta<=0 or delta>=MAX_DROP:continue
            gate=1 if delta<=MAX_FULL_DROP else 1-smooth((delta-MAX_FULL_DROP)/(MAX_DROP-MAX_FULL_DROP))
            best=min(best,original-delta*weight*gate*protection)
        return best

    def repair(self,vertices):
        xy=np.asarray(vertices,dtype=float)[:,[0,2]];P=Polygon(xy)
        if P.area<1e-8:return None
        xy,co=height_plane(vertices)
        candidates=list(map(int,self.tree.query(P.buffer(BLEND))))
        if not candidates:return None
        height=lambda x,z:(x-xy[0,0])*co[0]+(z-xy[0,1])*co[1]+co[2]
        union=unary_union([self.shapes[k]for k in candidates])
        road=polygons(P.intersection(union));verge=polygons(P.intersection(union.buffer(BLEND,quad_segs=2)))
        exclusions=list(map(int,self.protected_tree.query(P.buffer(.75))))
        protection=unary_union([self.protected[k]for k in exclusions])if exclusions else None
        protected=[]if protection is None else polygons(P.intersection(protection))+polygons(P.intersection(protection.buffer(.75,quad_segs=2)))
        outlines=road+verge+protected
        maximum=max((height(x,z)-self.target(x,z,height(x,z),candidates)for q in outlines for x,z in q.exterior.coords),default=0)
        if maximum<.003:return None
        pieces=[P]
        for cutter in outlines:
            pieces=[part for piece in pieces for part in polygons(piece.intersection(cutter))+polygons(piece.difference(cutter))]
        if abs(sum(q.area for q in pieces)-P.area)>max(1e-6,P.area*1e-7):raise ValueError('Terrain polygon partition lost horizontal area')
        inverse=np.linalg.inv(np.column_stack((xy[1]-xy[0],xy[2]-xy[0])))
        output=[];drop=0;covered=0
        for q in pieces:
            if q.area<1e-10:continue
            q=orient(q,sign=1);rings=[np.asarray(q.exterior.coords[:-1])]+[np.asarray(r.coords[:-1])for r in q.interiors]
            points=np.concatenate(rings);reference=points[0];triangles=mf.triangulate([r-reference for r in rings],epsilon=1e-8)
            for indices in triangles:
                A=points[indices]
                area=abs((A[1,0]-A[0,0])*(A[2,1]-A[0,1])-(A[1,1]-A[0,1])*(A[2,0]-A[0,0]))/2
                if area<1e-10:continue
                covered+=area
                # RuntimeXZ is a reflected basis: clockwise gives upward faces.
                for x,z in A[[0,2,1]]:
                    old=height(x,z);new=self.target(x,z,old,candidates);drop=max(drop,old-new)
                    bary=inverse@(np.array([x,z])-xy[0])
                    output.append([round(float(bary[0]),8),round(float(bary[1]),8),round(float(new),6)])
        if abs(covered-P.area)>max(1e-6,P.area*1e-7):
            raise ValueError(f'Terrain patch lost horizontal area: original={P.area}, generated={covered}, coords={xy.tolist()}')
        return output,drop


def load_support(manifest,base,extracts):
    roads=[];protected=[]
    architecture=SOURCE/'street-detail/building_architecture.json'
    for row in json.loads(architecture.read_text()):
        p=Polygon([(x,-y)for x,y in row['outline_xy']])
        if p.is_valid and p.area:protected.append(p.buffer(.25,quad_segs=2))
    for tile in manifest['tiles']:
        if not tile['lods']:continue
        data=json.loads(gzip.decompress((extracts/f"{tile['id']}-0.json.gz").read_bytes()))
        if data.get('version')!=2 or data['sourceSha256']!=tile['lods'][0]['sha256']:raise ValueError('Stale source extraction')
        for mesh in data['meshes']:
            category=mesh['category']
            if category!='water' and not(category=='roads'and mesh['materials']==['Drive road | weathered shoulder']):continue
            positions,ids=mesh_triangles(mesh)
            for triangle in ids:
                points=positions[triangle];xy=points[:,[0,2]];p=Polygon(xy)
                if p.area<1e-7:continue
                if category=='water':protected.append(p)
                else:
                    _,co=height_plane(points);roads.append((p,co,xy[0]))
    return Support(roads,protected),digest(architecture.read_bytes())

def build_tile(tile,support,extracts,manifest_hash):
    packet={'version':1,'tileId':tile['id'],'sourceManifestSha256':manifest_hash,'levels':[]};maximum=0;replaced=added=0;failures=[]
    support.cache.clear()
    for asset in tile['lods']:
        data=json.loads(gzip.decompress((extracts/f"{tile['id']}-{asset['level']}.json.gz").read_bytes()))
        if data.get('version')!=2 or data['sourceSha256']!=asset['sha256']:raise ValueError('Stale source extraction')
        meshes=[]
        for mesh in data['meshes']:
            if mesh['category']!='terrain':continue
            positions,ids=mesh_triangles(mesh);patches=[]
            for i,triangle in enumerate(ids):
                retained=source_exclusion(tile['id'],asset['level'],mesh,i,asset['sha256'])
                if retained:
                    failures.append(retained);continue
                try:result=support.repair(positions[triangle])
                except (ValueError,np.linalg.LinAlgError,GEOSException)as error:
                    points=positions[triangle];area=Polygon(points[:,[0,2]]).area
                    failures.append({'level':asset['level'],'mesh':mesh['name'],'triangle':i,'center':[round(float(v),5)for v in points.mean(axis=0)],'areaM2':round(float(area),8),'reason':str(error)})
                    continue
                if result:
                    vertices,drop=result;patches.append([i,vertices]);maximum=max(maximum,drop);replaced+=1;added+=len(vertices)//3-1
            if patches:meshes.append({'mesh':mesh['name'],'geometryStamp':mesh['geometryStamp'],'positions':len(positions),'triangles':len(ids),'patches':patches})
        if meshes:packet['levels'].append({'level':asset['level'],'sourceSha256':asset['sha256'],'meshes':meshes})
    return packet,{'tileId':tile['id'],'replacedTriangles':replaced,'addedTriangles':added,'maximumDropM':round(maximum,6),'retainedUncertainTriangles':len(failures),'retainedUncertain':failures}

_WORKER=None
def initialize_worker(manifest,base,extracts,manifest_hash):
    global _WORKER
    support,_=load_support(manifest,Path(base),Path(extracts))
    _WORKER=(support,Path(extracts),manifest_hash)
def worker_tile(tile):
    support,extracts,manifest_hash=_WORKER
    return build_tile(tile,support,extracts,manifest_hash)

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--tiles',default='ALL');parser.add_argument('--workers',type=int,default=2);args=parser.parse_args()
    release=json.loads((SITE/'data/derived/town/release.json').read_text());base=SITE/'public/town-assets'/release['directory'];raw=(base/'manifest.json').read_bytes();manifest_hash=digest(raw)
    if manifest_hash!=release['manifestSha256'] or EXCLUSIONS['sourceManifestSha256']!=manifest_hash:raise ValueError('Source manifest hash mismatch')
    manifest=json.loads(raw);extracts=WORK/'extracted';started=time.time();architecture_hash=digest((SOURCE/'street-detail/building_architecture.json').read_bytes())
    selected=set(args.tiles.split(','));tiles=[t for t in manifest['tiles']if 'ALL'in selected or t['id']in selected]
    destination=SITE/'public/town-evidence/v1/terrain';destination.mkdir(parents=True,exist_ok=True);rows={};reports=[]
    # A bounded regeneration must never drop unrelated indexed packets.
    if 'ALL'not in selected:
        previous=SITE/'data/derived/town/terrain-finish-index.json';previous_report=WORK/'terrain-generation.json'
        if not previous.exists()or not previous_report.exists():raise ValueError('Partial generation requires a complete existing index and audit; run --tiles ALL first')
        old=json.loads(previous.read_text());old_report=json.loads(previous_report.read_text())
        if old['sourceManifestSha256']!=manifest_hash or old['buildingOutlinesSha256']!=architecture_hash or old_report['sourceManifestSha256']!=manifest_hash:raise ValueError('Partial generation source pins changed; run a complete generation')
        rows={k:v for k,v in old['tiles'].items()if k not in selected}
        reports=[row for row in old_report['tiles']if row['tileId']not in selected]
    executor=ProcessPoolExecutor(max_workers=max(1,min(2,args.workers)),mp_context=multiprocessing.get_context('spawn'),initializer=initialize_worker,initargs=(manifest,str(base),str(extracts),manifest_hash))
    try:
        for i,(tile,result)in enumerate(zip(tiles,executor.map(worker_tile,tiles,chunksize=1))):
            packet,stats=result
            if packet['levels']:
                levels={};stats['bytes']=stats['gzipBytes']=0;stats['levels']=[]
                for level in packet['levels']:
                    payload={**packet,'levels':[level]};encoded=json.dumps(payload,separators=(',',':'),allow_nan=False).encode();sha=digest(encoded);name=f"{tile['id']}-{level['level']}.{sha[:16]}.json";(destination/name).write_bytes(encoded)
                    level_replaced=sum(len(m['patches'])for m in level['meshes']);level_added=sum(len(vertices)//3-1 for m in level['meshes']for _,vertices in m['patches'])
                    levels[str(level['level'])]={'url':'/town-evidence/v1/terrain/'+name,'bytes':len(encoded),'sha256':sha,'replacedTriangles':level_replaced,'addedTriangles':level_added}
                    compressed=len(gzip.compress(encoded));stats['bytes']+=len(encoded);stats['gzipBytes']+=compressed;stats['levels'].append({'level':level['level'],'bytes':len(encoded),'gzipBytes':compressed,'addedTriangles':level_added,'replacedTriangles':level_replaced})
                rows[tile['id']]={'levels':levels}
            reports.append(stats)
            print(json.dumps({'index':i+1,'of':len(tiles),**{key:value for key,value in stats.items()if key!='retainedUncertain'},'seconds':round(time.time()-started,1)}),flush=True)
    finally:
        executor.shutdown(wait=True,cancel_futures=True)
    index={'version':1,'sourceManifestSha256':manifest_hash,'buildingOutlinesSha256':architecture_hash,'sourceExclusionsSha256':digest(EXCLUSION_PATH.read_bytes()),'basis':'Immutable rendered shoulder triangles including their globally indexed neighboring owners; measured Great Bridge correction; exact mapped water/building exclusions. Inferred cosmetic grade repair, not new elevation survey.','parameters':{'blendM':BLEND,'clearanceM':CLEARANCE,'fullLoweringThroughM':MAX_FULL_DROP,'fadeToNoChangeM':MAX_DROP,'buildingBufferM':.25,'protectedBlendM':.75},'tiles':rows}
    target=SITE/'data/derived/town/terrain-finish-index.json';temporary=target.with_suffix('.json.tmp');temporary.write_text(json.dumps(index,separators=(',',':'))+'\n');temporary.replace(target)
    retained={Path(a['url']).name for row in rows.values()for a in row['levels'].values()}
    for old in destination.glob('*.json'):
        if old.name not in retained:old.unlink()
    audit={'sourceManifestSha256':manifest_hash,'tiles':reports,'seconds':round(time.time()-started,2),'totalAddedTriangles':sum(r['addedTriangles']for r in reports),'totalReplacedTriangles':sum(r['replacedTriangles']for r in reports),'maximumDropM':max((r['maximumDropM']for r in reports),default=0),'totalBytes':sum(r.get('bytes',0)for r in reports),'totalGzipBytes':sum(r.get('gzipBytes',0)for r in reports),'retainedUncertainTriangles':sum(r['retainedUncertainTriangles']for r in reports)}
    (WORK/'terrain-generation.json').write_text(json.dumps(audit,indent=2)+'\n')
if __name__=='__main__':main()
