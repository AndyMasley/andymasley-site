/** Lossless request aliases only. Original files, pixels and glTFs stay intact. */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
export async function prepareSourceTextureAliases(project) {
  const release = JSON.parse(await readFile(path.join(project,'data/derived/town/release.json'),'utf8'));
  if (!/^2026-09-[a-f0-9]{8,64}$/.test(release.directory)) throw Error('Invalid pinned source directory');
  const root = path.join(project,'public/town-assets',release.directory), raw = await readFile(path.join(root,'manifest.json'));
  if (sha(raw) !== release.manifestSha256) throw Error('Pinned source manifest changed');
  const manifest = JSON.parse(raw), groups = new Map();
  for (const ref of manifest.textures ?? []) {
    if (!/^textures\/[A-Za-z0-9._-]+\.(?:png|jpe?g|webp)$/.test(ref.url) || !/^[a-f0-9]{64}$/.test(ref.sha256)) throw Error('Invalid source texture reference');
    const bytes = await readFile(path.join(root,ref.url));
    if (bytes.length !== ref.bytes || sha(bytes) !== ref.sha256) throw Error('Source texture checksum mismatch: '+ref.url);
    const group = groups.get(ref.sha256) ?? []; group.push(ref); groups.set(ref.sha256,group);
  }
  const aliases = [];
  for (const group of groups.values()) {
    group.sort((a,b)=>Number(a.url.startsWith('textures/v2-'))-Number(b.url.startsWith('textures/v2-'))||a.url.localeCompare(b.url));
    const canonical=group[0];
    for(const from of group.slice(1))aliases.push({from:from.url,to:canonical.url,sha256:canonical.sha256,bytes:canonical.bytes});
  }
  aliases.sort((a,b)=>a.from.localeCompare(b.from));
  const result={version:1,sourceManifestSha256:release.manifestSha256,directory:release.directory,basis:'Byte-identical source files only; request/cache aliases preserve every original file and decoded image.',aliases};
  const destination=path.join(project,'data/derived/town/source-texture-aliases.json');await mkdir(path.dirname(destination),{recursive:true});await writeFile(destination,JSON.stringify(result,null,2)+'\n');
  return result;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const result=await prepareSourceTextureAliases(path.resolve(fileURLToPath(new URL('..',import.meta.url))));
 console.log(`Source texture aliases: ${result.aliases.length} exact aliases, ${result.aliases.reduce((n,r)=>n+r.bytes,0)} duplicate source bytes; original files retained.`);
}
