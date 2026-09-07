import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/examples/jsm/libs/meshopt_decoder.module.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),work=process.env.WEBSTER_ROADSIDE_WORK??'/private/tmp/webster-final-details/streetscape';fs.mkdirSync(work,{recursive:true});
const read=p=>JSON.parse(fs.readFileSync(p)),hash=b=>createHash('sha256').update(b).digest('hex'),rel=read(root+'/data/derived/town/release.json'),base=root+'/public/town-assets/'+rel.directory+'/',manifest=read(base+'manifest.json'),index=read(root+'/data/derived/town/roadside-index.json');
if(hash(fs.readFileSync(base+'manifest.json'))!==index.sourceManifestSha256)throw new Error('Source manifest mismatch');
await build({entryPoints:[root+'/src/lib/town/roadside-details.ts'],outfile:work+'/compiled.mjs',bundle:true,format:'esm',platform:'node',plugins:[{name:'shared-three',setup(b){b.onResolve({filter:/^three$/},()=>({path:fileURLToPath(import.meta.resolve('three')),external:true}));}}],logLevel:'silent'});
const {applyRoadsideDetails}=await import(pathToFileURL(work+'/compiled.mjs').href+'?'+Date.now()),loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);loader.register(()=>({name:'ROADSIDE_AUDIT_TEXTURE_STUB',loadTexture(){return Promise.resolve(new THREE.DataTexture(new Uint8Array([255,255,255,255]),1,1));}}));
const geometryRows=[];
const bytes=a=>Buffer.from(a.array.buffer,a.array.byteOffset,a.array.byteLength),report={sourceManifestSha256:index.sourceManifestSha256,moduleSha256:hash(fs.readFileSync(root+'/src/lib/town/roadside-details.ts')),created:new Date().toISOString(),rows:[],failures:[]};
for(const [tileId,ref] of Object.entries(index.tiles)){
  const raw=fs.readFileSync(root+'/public'+ref.url);if(hash(raw)!==ref.sha256||raw.length!==ref.bytes)throw new Error('Packet integrity');const packet=JSON.parse(raw),tile=manifest.tiles.find(t=>t.id===tileId);
  for(const asset of tile.lods){
    const raw=fs.readFileSync(base+asset.url);if(hash(raw)!==asset.sha256)throw new Error('GLB source');const {scene}=await loader.parseAsync(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength),pathToFileURL(path.dirname(base+asset.url)+'/').href),source=[];
    scene.traverse(o=>{if(o instanceof THREE.Mesh)source.push({o,g:o.geometry,m:o.material,attrs:Object.fromEntries(Object.entries(o.geometry.attributes).map(([k,v])=>[k,hash(bytes(v))])),index:o.geometry.index?hash(bytes(o.geometry.index)):null});});
    const start=performance.now(),result=applyRoadsideDetails(scene,tileId,tile.origin,asset.level,asset.sha256,packet),elapsed=performance.now()-start,bad=[];
    for(const s of source){if(s.o.geometry!==s.g||s.o.material!==s.m)bad.push('Source reference mutation');for(const[k,h]of Object.entries(s.attrs))if(hash(bytes(s.o.geometry.getAttribute(k)))!==h)bad.push('Source attribute mutation');if(s.index&&hash(bytes(s.o.geometry.index))!==s.index)bad.push('Source index mutation');}
    let invalid=0,zero=0,backwards=0,error=0;const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),n=new THREE.Vector3();
    scene.getObjectByName('Research roadside details')?.traverse(o=>{if(!(o instanceof THREE.Mesh))return;for(const attr of Object.values(o.geometry.attributes))for(const v of attr.array)invalid+=Number(!Number.isFinite(v));const p=o.geometry.getAttribute('position'),normal=o.geometry.getAttribute('normal');for(let i=0;i<p.count;i+=3){a.fromBufferAttribute(p,i);b.fromBufferAttribute(p,i+1).sub(a);c.fromBufferAttribute(p,i+2).sub(a);const cross=b.cross(c);zero+=Number(cross.length()<1e-9);n.fromBufferAttribute(normal,i);backwards+=Number(cross.dot(n)<-1e-9);error=Math.max(error,Math.abs(n.length()-1));}});
    if(invalid||zero||backwards||error>.0001||result.rejected)bad.push('Geometry validity');if(applyRoadsideDetails(scene,tileId,tile.origin,asset.level,asset.sha256,packet)!==result)bad.push('Idempotence');
    report.rows.push({tileId,level:asset.level,applyMs:Math.round(elapsed*100)/100,invalid,zero,backwards,normalError:error,...result,failures:bad});if(bad.length)report.failures.push({tileId,level:asset.level,bad});
    if(process.env.EXPORT_ROADSIDE_GEOMETRY){const geometry=[];scene.getObjectByName('Research roadside details')?.traverse(o=>{if(o instanceof THREE.Mesh)geometry.push({name:o.name,sourceIds:o.userData.sourceIds??result.ids,position:Array.from(o.geometry.getAttribute('position').array)});});geometryRows.push({tileId,level:asset.level,origin:tile.origin,geometry});}
    const gs=new Set(),ms=new Set(),ts=new Set();scene.traverse(o=>{if(o instanceof THREE.Mesh){gs.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material]){ms.add(m);for(const t of Object.values(m))if(t instanceof THREE.Texture)ts.add(t);}}});gs.forEach(g=>g.dispose());ms.forEach(m=>m.dispose());ts.forEach(t=>t.dispose());
  }
}
report.summary={tiles:Object.keys(index.tiles).length,cases:report.rows.length,failures:report.failures.length,skipped:report.rows.flatMap(r=>r.skipped),maxApplyMs:Math.max(...report.rows.map(r=>r.applyMs)),maxMeshes:Math.max(...report.rows.map(r=>r.addedMeshes)),maxTriangles:Math.max(...report.rows.map(r=>r.addedTriangles)),lods:[0,1,2].map(level=>({level,objects:report.rows.filter(r=>r.level===level).reduce((s,r)=>s+r.ids.length,0),wireSpans:report.rows.filter(r=>r.level===level).reduce((s,r)=>s+r.wireSpans,0)}))};
if(process.env.EXPORT_ROADSIDE_GEOMETRY)fs.writeFileSync(work+'/all-lod-overlay-geometry.json',JSON.stringify(geometryRows));
fs.writeFileSync(work+'/native-audit.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report.summary));if(report.failures.length)process.exitCode=1;
