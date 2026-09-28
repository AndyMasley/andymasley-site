"""Register audited pavement intrusions, excluding protected buildings/water.

Run audit-road-ground-clearance.mjs with all three LODs first. --audit may repeat
for disjoint bounded native scans. Catalog entries merge source-identical road
triangles across LODs so all levels use the same continuous repair field.
"""
import argparse, hashlib, json, os
from pathlib import Path
from shapely.geometry import Polygon
from shapely.strtree import STRtree
SITE=Path(__file__).resolve().parents[1]
def sha(raw):return hashlib.sha256(raw).hexdigest()
def main():
    parser=argparse.ArgumentParser();parser.add_argument('--audit',action='append',required=True);parser.add_argument('--allow-aligned',action='store_true');parser.add_argument('--merge-existing',action='store_true');parser.add_argument('--architecture',default=os.environ.get('WEBSTER_SOURCE','/Users/andy/Documents/New project/webster-blender')+'/street-detail/building_architecture.json');parser.add_argument('--output',default=str(SITE/'data/derived/town/road-ground-clearance.json'));parser.add_argument('--report',required=True);args=parser.parse_args()
    release=json.loads((SITE/'data/derived/town/release.json').read_text());manifest=json.loads((SITE/'public/town-assets'/release['directory']/'manifest.json').read_text());tiles={t['id']:t for t in manifest['tiles']}
    architecture=Path(args.architecture).read_bytes();buildings=[Polygon(r['outline_xy'])for r in json.loads(architecture)];building_tree=STRtree(buildings)
    water_file=SITE/'data/derived/town/navigation-water.json';water_raw=water_file.read_bytes();water=[Polygon(r['rings'][0],r['rings'][1:])for r in json.loads(water_raw)['polygons']];water_tree=STRtree(water)
    aligned_tiles=set(json.loads((SITE/'data/derived/town/aerial-road-alignment.json').read_text())['tiles'])
    rows={};audit_hashes=[]
    for filename in args.audit:
        raw=Path(filename).read_bytes();audit_hashes.append(sha(raw));audit=json.loads(raw)
        if audit['sourceManifestSha256']!=release['manifestSha256']:raise ValueError('Audit source manifest changed')
        for r in audit['rows']:rows[(r['tileId'],r['level'])]=r
    catalog={};excluded=[];registered=0
    for(tile,level),row in sorted(rows.items()):
        if row['sourceSha256']!=tiles[tile]['lods'][level]['sha256']:raise ValueError('Audit GLB source changed')
        for road in row.get('activeRoads',[]):
            shape=Polygon([p[:2]for p in road['p']]);reason=None
            if not args.allow_aligned and tile in aligned_tiles:reason='separately registered aerial road alignment'
            elif shape.area<.0001:reason='unstable projected road area'
            elif len(building_tree.query(shape,predicate='dwithin',distance=1.05)):reason='protected building and transition buffer'
            elif len(water_tree.query(shape,predicate='dwithin',distance=1.05)):reason='protected water and transition buffer'
            else:
                x,y=map(int,tile.split('_'));bounds=shape.bounds
                if bounds[0]<x*250+1 or bounds[2]>(x+1)*250-1 or bounds[1]<y*250+1 or bounds[3]>(y+1)*250-1:reason='neighbor-owned boundary support requires separate registration'
            if reason:excluded.append({'tile':tile,'level':level,'mesh':road['mesh'],'triangle':road['triangle'],'reason':reason,'points':road['p']});continue
            target=catalog.setdefault(tile,{'sourceSha256':[l['sha256']for l in tiles[tile]['lods']],'meshes':{}});key=(road['mesh'],row['meshStamps'][road['mesh']]);record=target['meshes'].setdefault(key,{'name':key[0],'geometryStamp':key[1],'triangles':set()});record['triangles'].add(road['triangle'])
    for row in catalog.values():
        row['meshes']=[{**record,'triangles':sorted(record['triangles'])}for record in row['meshes'].values()];registered+=sum(len(m['triangles'])for m in row['meshes'])
    result={'version':1,'sourceManifestSha256':release['manifestSha256'],'buildingOutlinesSha256':sha(architecture),'waterFootprintsSha256':sha(water_raw),'basis':'Actual fully assembled pavement and terrain probes at all three LODs. Cosmetic terrain lowering only; original roads, graph and protected building/water footprints remain source-owned. Registrations exclude the tile boundary until neighbor support is established.','parameters':{'clearanceM':.035,'maximumLoweringM':.8,'maximumExteriorDistanceM':.75,'protectedBufferM':1.05},'tiles':catalog}
    output=Path(args.output)
    if args.merge_existing and output.exists():
        existing=json.loads(output.read_text())
        if any(existing[k]!=result[k]for k in ['sourceManifestSha256','buildingOutlinesSha256','waterFootprintsSha256']):raise ValueError('Existing registration source changed')
        reaudited={tile for tile,level in rows}
        result['tiles']={**{tile:row for tile,row in existing['tiles'].items()if tile not in reaudited},**result['tiles']}
    output.write_text(json.dumps(result,separators=(',',':'))+'\n');report={'auditSha256':audit_hashes,'auditedTileLevels':len(rows),'registeredTiles':len(catalog),'registeredRoadTriangles':registered,'catalogBytes':output.stat().st_size,'excluded':excluded};Path(args.report).write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({k:v for k,v in report.items()if k!='excluded'}))
if __name__=='__main__':main()
