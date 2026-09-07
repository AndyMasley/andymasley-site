// @vitest-environment node
import {describe,it,expect} from 'vitest';
import {createHash} from 'node:crypto';
import {readFileSync,readdirSync} from 'node:fs';
import {basename,resolve} from 'node:path';
import index from '../../../../data/derived/town/terrain-finish-index.json';
import release from '../../../../data/derived/town/release.json';
import excluded from '../../../../data/derived/town/terrain-finish-source-exclusions.json';
import {validTerrainFinishPacket} from '../terrain-finish';
const sha=(raw:Uint8Array)=>createHash('sha256').update(raw).digest('hex');

describe('emitted source terrain packet integrity',()=>{
  it('validates every packet hash, source pin, LOD, triangle count and explicit source fallback without ignored source archives',()=>{
    expect(index.sourceManifestSha256).toBe(release.manifestSha256);
    expect(excluded.sourceManifestSha256).toBe(release.manifestSha256);
    expect(sha(readFileSync(resolve('data/derived/town/terrain-finish-source-exclusions.json')))).toBe(index.sourceExclusionsSha256);
    const errors:string[]=[],files:string[]=[];let packets=0;
    for(const[tileId,tile]of Object.entries(index.tiles))for(const[level,ref]of Object.entries(tile.levels)){
      const raw=readFileSync(resolve('public',ref.url.slice(1))),packet=JSON.parse(raw.toString('utf8'));files.push(basename(ref.url));packets++;
      const check=(ok:boolean,message:string)=>{if(!ok)errors.push(`${tileId}/${level}: ${message}`);};
      check(raw.length===ref.bytes&&sha(raw)===ref.sha256,'hash or byte mismatch');
      check(basename(ref.url)===`${tileId}-${level}.${ref.sha256.slice(0,16)}.json`,'unversioned or wrong owner URL');
      const valid=validTerrainFinishPacket(packet,tileId);check(valid,'invalid finite/barycentric/source packet');
      if(!valid)continue;
      check(packet.levels.length===1&&packet.levels[0].level===Number(level),'packet LOD ownership');
      let replacements=0,additions=0;
      for(const layer of packet.levels)for(const mesh of layer.meshes){
        replacements+=mesh.patches.length;additions+=mesh.patches.reduce((sum,[,vertices])=>sum+vertices.length/3-1,0);
        for(const retained of excluded.triangles.filter(r=>r.tileId===tileId&&r.level===layer.level&&r.mesh===mesh.mesh)){
          check(layer.sourceSha256===retained.sourceSha256&&mesh.geometryStamp===retained.geometryStamp,'retained exception source changed');
          check(!mesh.patches.some(([triangle])=>triangle===retained.triangle),'guarded source triangle was replaced');
        }
      }
      check(replacements===ref.replacedTriangles&&additions===ref.addedTriangles,'declared triangle count mismatch');
    }
    expect(errors.slice(0,25)).toEqual([]);expect(packets).toBeGreaterThan(0);
    expect(new Set(files).size).toBe(packets);
    expect(readdirSync(resolve('public/town-evidence/v1/terrain')).filter(f=>f.endsWith('.json')).sort()).toEqual(files.sort());
  },30000);
});
