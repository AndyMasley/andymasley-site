"""Register only oversized inferred foundation faces from retained building GLBs.

The generator classified whole wall triangles by their centroid height. Runtime
uses these exact wall supports and floor planes to divide materials without
moving the shell. Source material factors are retained per building. Coordinates
are tile-relative millimetres; reported floors keep source double precision.
"""
import collections
import gzip
import hashlib
import json
import os
from pathlib import Path
import struct
import sys

sys.path.insert(0, os.environ.get('WEBSTER_PYTHON_DEPS', '/private/tmp/webster-realism-v2-building/python-deps'))
import numpy as np

SITE = Path(__file__).resolve().parents[1]
REPORTS = Path(os.environ.get('WEBSTER_BUILDING_REPORTS', '/private/tmp/webster-realism-v2-building/townwide-assets'))
OUTPUT = SITE / 'data/derived/town/foundation-wall-index.json'
WORK = Path(os.environ.get('WEBSTER_WALL_QA', '/private/tmp/webster-wall-ground-finish'))
WALL_NAMES = {'V2 inferred | siding', 'V2 inferred | brick', 'V2 inferred | concrete_wall'}


def sha(data):
    return hashlib.sha256(data).hexdigest()


def load_glb(data):
    size = struct.unpack_from('<I', data, 12)[0]
    doc = json.loads(data[20:20+size])
    binary = data[28+size:]

    def accessor(index):
        a = doc['accessors'][index]
        view = doc['bufferViews'][a['bufferView']]
        dtype = {5126:'<f4', 5125:'<u4', 5123:'<u2', 5121:'u1'}[a['componentType']]
        count = {'SCALAR':1, 'VEC2':2, 'VEC3':3, 'VEC4':4}[a['type']]
        return np.ndarray((a['count'], count), dtype=dtype, buffer=binary,
                          offset=view.get('byteOffset', 0)+a.get('byteOffset', 0))
    return doc, accessor


def main():
    release = json.loads((SITE/'data/derived/town/release.json').read_bytes())
    raw_manifest = (SITE/'public/town-assets'/release['directory']/'manifest.json').read_bytes()
    assert sha(raw_manifest) == release['manifestSha256']
    manifest = json.loads(raw_manifest)
    owner = {sid:t for t in manifest['tiles'] for sid in t['sourceIds']}
    materials, tiles, retained, skipped = [], {}, [], []
    for report_path in sorted(REPORTS.glob('*.report.json')):
        report_raw = report_path.read_bytes()
        r = json.loads(report_raw)
        sid, floor, base = r['struct_id'], r.get('floor_z'), r.get('base_z')
        if sid not in owner or floor is None or floor <= base+.04:
            continue
        glb_path = REPORTS/(sid+'.glb')
        raw = glb_path.read_bytes()
        assert sha(raw) == r['asset']['sha256'], sid
        doc, acc = load_glb(raw)
        supports, count, wall_materials = {}, 0, []
        shared_uv = {'foundation':{}, 'wall':{}}
        for node in doc['nodes']:
            if 'mesh' not in node:
                continue
            assert not any(k in node for k in ['matrix','rotation','scale'])
            translation = np.asarray(node.get('translation', [0,0,0]))
            for primitive in doc['meshes'][node['mesh']]['primitives']:
                material = doc['materials'][primitive['material']]
                if material['name'] in WALL_NAMES or material['name'] == 'V2 inferred | foundation':
                    attributes = primitive['attributes']
                    if 'TEXCOORD_0' in attributes:
                        positions, normals, uvs = [acc(attributes[a])for a in ['POSITION','NORMAL','TEXCOORD_0']]
                        corner_map = shared_uv['foundation' if material['name'] == 'V2 inferred | foundation' else 'wall']
                        for vertex, normal, uv in zip(positions, normals, uvs):
                            corner_map[tuple(np.round(np.concatenate((vertex,normal)),5))] = uv
                if material['name'] in WALL_NAMES:
                    factor = material['pbrMetallicRoughness']
                    signature = [material['name'], factor.get('baseColorFactor',[1,1,1,1])[:3], factor.get('roughnessFactor',1), factor.get('metallicFactor',1)]
                    if signature not in wall_materials:
                        wall_materials.append(signature)
                if material['name'] != 'V2 inferred | foundation':
                    continue
                points = acc(primitive['attributes']['POSITION'])[acc(primitive['indices']).reshape(-1,3)]+translation
                normals = np.cross(points[:,1]-points[:,0], points[:,2]-points[:,0])
                lengths = np.linalg.norm(normals,axis=1)
                bad = (lengths>1e-8)&(np.abs(normals[:,1])<lengths*.025)&(points[:,:,1].max(axis=1)>floor+.2)
                count += int(bad.sum())
                for triangle in points[bad]:
                    plan = triangle[:,[0,2]]
                    _, a, b = max((np.linalg.norm(plan[i]-plan[j]), i, j) for i in range(3) for j in range(i))
                    endpoints = sorted([tuple(np.round(plan[a],3)),tuple(np.round(plan[b],3))])
                    supports[tuple(endpoints[0]+endpoints[1])] = endpoints
        if not count:
            continue
        if len(wall_materials) != 1:
            skipped.append({'id':sid,'reason':'Missing or ambiguous own wall material','materials':wall_materials})
            continue
        ratios = [[],[]]
        for key in shared_uv['foundation'].keys() & shared_uv['wall'].keys():
            foundation_uv, wall_uv = shared_uv['foundation'][key], shared_uv['wall'][key]
            for axis in range(2):
                if abs(float(foundation_uv[axis])) > .01:
                    ratios[axis].append(float(wall_uv[axis])/float(foundation_uv[axis]))
        expected_scale = 2/3 if wall_materials[0][0] == 'V2 inferred | brick' else 1
        for values in ratios:
            assert values and max(abs(v-expected_scale)for v in values)<.00001, (sid,ratios)
        material = [*wall_materials[0], [expected_scale,expected_scale]]
        if material not in materials:
            materials.append(material)
        tile = owner[sid]
        entry = tiles.setdefault(tile['id'], {'sha256':[next(l['sha256']for l in tile['lods']if l['level']==n)for n in range(3)], 'rows':[]})
        origin = np.asarray(tile['origin'])[[0,2]]
        segments = [int(round((v-origin[k%2])*1000)) for endpoints in sorted(supports.values())for point in endpoints for k,v in enumerate(point)]
        entry['rows'].append([sid, floor, base, r['bounds']['max'][1], materials.index(material), segments])
        retained.append({'id':sid,'tileId':tile['id'],'sourceReportSha256':sha(report_raw),'sourceAssetSha256':sha(raw),'foundationErrorTriangles':count,'supports':len(supports),'worldBounds':r['bounds'],'sourceFloor':floor,'sourceUvScale':material[4],'sharedUvChecks':sum(map(len,ratios))})
    destination = SITE/'public/town-finish/v2/foundation-walls'
    destination.mkdir(parents=True,exist_ok=True)
    refs = {}
    total_packet_bytes = total_packet_gzip = 0
    for tile_id, entry in tiles.items():
        tile = next(t for t in manifest['tiles']if t['id']==tile_id)
        used = sorted({r[4]for r in entry['rows']})
        rows = [[*r[:4],used.index(r[4]),r[5]]for r in entry['rows']]
        packet = {'version':2,'tileId':tile_id,'sourceManifestSha256':release['manifestSha256'],'origin':tile['origin'],'sourceSha256':entry['sha256'],'materials':[materials[i]for i in used],'rows':rows}
        data = (json.dumps(packet,separators=(',',':'))+'\n').encode()
        filename = tile_id+'-'+sha(data)[:12]+'.json'
        (destination/filename).write_bytes(data)
        refs[tile_id] = {'url':'/town-finish/v2/foundation-walls/'+filename,'bytes':len(data),'sha256':sha(data),'count':len(rows)}
        total_packet_bytes += len(data)
        total_packet_gzip += len(gzip.compress(data,mtime=0))
    packet = {'version':2,'sourceManifestSha256':release['manifestSha256'],'tiles':refs}
    output = (json.dumps(packet,separators=(',',':'))+'\n').encode()
    OUTPUT.write_bytes(output)
    WORK.mkdir(parents=True,exist_ok=True)
    receipt = {'version':1,'method':__doc__,'sourceManifestSha256':release['manifestSha256'],'scriptSha256':sha(Path(__file__).read_bytes()),'indexSha256':sha(output),'indexBytes':len(output),'indexGzipBytes':len(gzip.compress(output,mtime=0)),'tiles':len(tiles),'packetBytes':total_packet_bytes,'packetGzipBytes':total_packet_gzip,'buildings':len(retained),'sourceErrorTriangles':sum(r['foundationErrorTriangles']for r in retained),'retained':retained,'skipped':skipped}
    (WORK/'foundation-wall-source-audit.json').write_text(json.dumps(receipt,indent=2)+'\n')
    print(json.dumps({k:v for k,v in receipt.items()if k not in ['retained','method']},indent=2))


if __name__ == '__main__':
    main()
