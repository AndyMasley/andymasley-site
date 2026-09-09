/** Retained 248 Main source protection in local east,north,height metres.
 * Texture placeholders are topology evidence, never appearance evidence. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const out = process.env.WEBSTER_MODERNE_SOURCE || '/private/tmp/webster-paver-band/native-source.json';
const read = p => JSON.parse(fs.readFileSync(p)), hash = b => createHash('sha256').update(b).digest('hex');
const release = read(path.join(root, 'data/derived/town/release.json'));
const base = path.join(root, 'public/town-assets', release.directory);
const manifestRaw = fs.readFileSync(path.join(base, 'manifest.json'));
if (hash(manifestRaw) !== release.manifestSha256) throw Error('Source manifest changed');
const rows = read(path.join(root, 'data/derived/town/commercial-completion.json'));
const row = rows.rows.find(r => r.id === '168341_866602'), frame = row.frames.find(f => f.id === 'MS-S-016');
const tile = JSON.parse(manifestRaw).tiles.find(t => t.id === row.tileId);
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
loader.register(() => ({name:'TOPOLOGY_PLACEHOLDER', loadTexture:async () => new THREE.DataTexture(new Uint8Array([255,255,255,255]),1,1)}));
const result = { sourceManifestSha256:release.manifestSha256, frame, tileId:tile.id, origin:tile.origin, lods:[] };
for (const lod of tile.lods) {
  const raw = fs.readFileSync(path.join(base,lod.url));
  if (hash(raw) !== lod.sha256) throw Error('Tile source changed');
  const group = (await loader.parseAsync(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength),'')).scene;
  group.updateMatrixWorld(true);
  const triangles = [];
  group.traverse(mesh => {
    if (!(mesh instanceof THREE.Mesh) || !/^(roads|water|buildings|landmarks|streetscape)(?:\b|_)/i.test(mesh.name)) return;
    const g = mesh.geometry, p = g.getAttribute('position'), materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material], count = g.index?.count ?? p.count;
    for (const part of g.groups.length ? g.groups : [{start:0,count,materialIndex:0}]) {
      const name = materials[part.materialIndex]?.name ?? '';
      for (let i=part.start;i<part.start+part.count;i+=3) {
        const triangle = [0,1,2].map(k => {
          const q = new THREE.Vector3().fromBufferAttribute(p,g.index?.getX(i+k) ?? i+k).applyMatrix4(mesh.matrixWorld);
          return [q.x+tile.origin[0],-q.z-tile.origin[2],q.y+tile.origin[1]];
        });
        const local = triangle.map(p => {
          const x=p[0]-frame.start[0], n=p[1]-frame.start[1];
          return [x*frame.tangent[0]+n*frame.tangent[1],x*frame.outward[0]+n*frame.outward[1]];
        });
        if (Math.max(...local.map(p=>p[0])) < -1 || Math.min(...local.map(p=>p[0])) > frame.width+1 || Math.max(...local.map(p=>p[1])) < -1 || Math.min(...local.map(p=>p[1])) > 7) continue;
        const [a,b,c] = triangle;
        if (Math.abs((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])) < 1e-8) continue;
        triangles.push({mesh:mesh.name,name,triangle});
      }
    }
  });
  result.lods.push({level:lod.level,sha256:lod.sha256,triangles});
}
fs.mkdirSync(path.dirname(out),{recursive:true});
fs.writeFileSync(out,JSON.stringify(result));
console.log(JSON.stringify(result.lods.map(l=>({level:l.level,triangles:l.triangles.length}))));
