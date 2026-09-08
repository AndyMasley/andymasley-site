import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,mkdir,writeFile,readFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { prepareSourceTextureAliases } from '../../scripts/prepare-source-texture-aliases.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
test('source aliases are generated from exact bytes, preserve originals and reject corruption',async()=>{
  const root=await mkdtemp(path.join(tmpdir(),'source-alias-test-'));
  try{
    const directory='2026-09-12345678',source=path.join(root,'public/town-assets',directory);
    await mkdir(path.join(source,'textures'),{recursive:true});await mkdir(path.join(root,'data/derived/town'),{recursive:true});
    const files=[['original.png','exact same bytes'],['v2-copy.png','exact same bytes'],['different.png','different bytes']];
    const textures=[];for(const[name,data]of files){await writeFile(path.join(source,'textures',name),data);textures.push({url:'textures/'+name,bytes:Buffer.byteLength(data),sha256:hash(data)});}
    const manifest=JSON.stringify({textures});await writeFile(path.join(source,'manifest.json'),manifest);
    await writeFile(path.join(root,'data/derived/town/release.json'),JSON.stringify({directory,manifestSha256:hash(manifest)}));
    const result=await prepareSourceTextureAliases(root);assert.deepEqual(result.aliases,[{from:'textures/v2-copy.png',to:'textures/original.png',sha256:hash('exact same bytes'),bytes:16}]);
    for(const[name,data]of files)assert.equal(await readFile(path.join(source,'textures',name),'utf8'),data);
    await writeFile(path.join(source,'textures/v2-copy.png'),'corrupt');
    await assert.rejects(prepareSourceTextureAliases(root),/checksum mismatch/);
  }finally{await rm(root,{recursive:true,force:true});}
});
