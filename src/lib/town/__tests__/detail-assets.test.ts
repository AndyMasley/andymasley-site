// @vitest-environment node
import {expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {validRoadsidePacket} from '../roadside-details';
import release from '../../../../data/derived/town/release.json';

const root=fileURLToPath(new URL('../../../../',import.meta.url));
type Ref={url:string;bytes:number;sha256:string};
it('ships every roadside packet under its exact content hash and valid source identity',()=>{
 const name='roadside-index',valid=validRoadsidePacket;
 const index=JSON.parse(readFileSync(root+'data/derived/town/'+name+'.json','utf8')) as {sourceManifestSha256:string;tiles:Record<string,Ref|{levels:Record<string,Ref>}>};
 expect(index.sourceManifestSha256).toBe(release.manifestSha256);
 for(const [tile,entry] of Object.entries(index.tiles))for(const ref of 'levels'in entry?Object.values(entry.levels):[entry]){
  expect(ref.url).toMatch(/^\/town-(roadside|evidence)\/[\w/.-]+\.json$/);
  const bytes=readFileSync(root+'public'+ref.url),sha=createHash('sha256').update(bytes).digest('hex');
  expect(bytes.length,ref.url).toBe(ref.bytes);expect(sha,ref.url).toBe(ref.sha256);expect(ref.url).toContain(sha.slice(0,12));
  expect(valid(JSON.parse(bytes.toString()),tile),ref.url).toBe(true);
 }
});
