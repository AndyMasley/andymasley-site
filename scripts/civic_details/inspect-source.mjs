import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const output = process.env.WEBSTER_CIVIC_QA || '/private/tmp/webster-research-completion/landmarks';
fs.mkdirSync(output, { recursive: true });
const read = p => JSON.parse(fs.readFileSync(p));
const release = read(path.join(repo, 'data/derived/town/release.json'));
const base = path.join(repo, 'public/town-assets', release.directory);
const manifest = read(path.join(base, 'manifest.json'));
const selection = read(path.join(repo, 'data/derived/town/town-hall-materials.json'));
const tile = manifest.tiles.find(t => t.id === selection.tileId);
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
loader.register(() => ({ name: 'REFERENCE_TEXTURE_STUB', loadTexture() { return Promise.resolve(new THREE.DataTexture(new Uint8Array([255,255,255,255]), 1, 1)); } }));
const report = { tileId: tile.id, origin: tile.origin, lods: [] };
for (const lod of tile.lods) {
 const raw = fs.readFileSync(path.join(base, lod.url));
 const hash = createHash('sha256').update(raw).digest('hex');
 if (hash !== selection.lods[lod.level].sha256) throw Error('Source changed');
 const scene = (await loader.parseAsync(raw.buffer.slice(raw.byteOffset, raw.byteOffset+raw.byteLength), '')).scene;
 scene.updateMatrixWorld(true);
 const row = { level: lod.level, sha256: hash, wallTriangles: [], protected: [] };
 scene.traverse(o => {
  if (!(o instanceof THREE.Mesh)) return;
  const material = Array.isArray(o.material) ? o.material[0] : o.material;
  const p=o.geometry.getAttribute('position'), index=o.geometry.index, v=new THREE.Vector3();
  const point = i => {v.fromBufferAttribute(p,index?index.getX(i):i).applyMatrix4(o.matrixWorld);return [v.x+tile.origin[0],-v.z-tile.origin[2],v.y+tile.origin[1]];};
  if (o.name===selection.meshName && o.parent?.name===selection.parentName) {
   const [first,last]=selection.lods[lod.level].wallTriangles;
   for(let i=first;i<=last;i++) row.wallTriangles.push([0,1,2].map(k=>point(i*3+k)));
  }
  if (/Town Hall \|/.test(material.name)) {
   const vertices=[];for(let i=0;i<(index?.count??p.count);i++)vertices.push(point(i));
   row.protected.push({name:o.name,material:material.name,triangles:vertices.length/3,min:[0,1,2].map(k=>Math.min(...vertices.map(p=>p[k]))),max:[0,1,2].map(k=>Math.max(...vertices.map(p=>p[k]))),...(lod.level===0?{vertices}:{})});
  }
 });
 report.lods.push(row);
 const geometries=new Set(),materials=new Set(),textures=new Set();scene.traverse(o=>{if(o instanceof THREE.Mesh){geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material]){materials.add(m);for(const v of Object.values(m))if(v instanceof THREE.Texture)textures.add(v);}}});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());
 console.log(lod.level,row.wallTriangles.length,row.protected.map(p=>[p.material,p.triangles]));
}
fs.writeFileSync(path.join(output,'town-hall-source-geometry.json'),JSON.stringify(report));
