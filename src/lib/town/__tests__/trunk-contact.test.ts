// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import release from '../../../../data/derived/town/release.json';
import { createTrunkContactPrototype, disposeTrunkContactPrototype } from '../trunk-contact';
import { treeForm } from '../vegetation';
import { TownWorld } from '../world';
import type { WorldManifest } from '../contracts';

async function nativeTrunk(): Promise<THREE.Group> {
  const root = `public/town-assets/${release.directory}/`, manifestBytes = readFileSync(root + 'manifest.json');
  expect(createHash('sha256').update(manifestBytes).digest('hex')).toBe(release.manifestSha256);
  const entry = JSON.parse(manifestBytes.toString()).trees.prototypes.find((p: { role: string }) => p.role === 'trunk');
  const bytes = readFileSync(root + entry.url);
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(entry.sha256);
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  loader.register(() => ({ name: 'GEOMETRY_ONLY_TEXTURE_PLACEHOLDER', loadTexture: async () => new THREE.DataTexture(new Uint8Array([255,255,255,255]),1,1) }) as never);
  return (await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')).scene;
}
function nativeMesh(group: THREE.Group): THREE.Mesh {
  let mesh: THREE.Mesh | undefined; group.traverse(o => { if (o instanceof THREE.Mesh) mesh = o; }); return mesh!;
}
function signature(geometry: THREE.BufferGeometry): string {
  const h = createHash('sha256');
  for (const a of Object.values(geometry.attributes)) h.update(new Uint8Array(a.array.buffer, a.array.byteOffset, a.array.byteLength));
  if (geometry.index) h.update(new Uint8Array(geometry.index.array.buffer)); return h.digest('hex');
}
function releaseSource(group: THREE.Group): void {
  const mesh = nativeMesh(group); mesh.geometry.dispose();
  for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) { (material as THREE.MeshStandardMaterial).map?.dispose(); material.dispose(); }
}

describe('bounded shared trunk foot', () => {
  it('encloses a flared foot inside the native straight prism, with ground/crown joins fixed at every tree scale', async () => {
    const base = await nativeTrunk(), source = nativeMesh(base), snapshot = signature(source.geometry);
    const result = createTrunkContactPrototype(base), mesh = nativeMesh(result), geometry = mesh.geometry;
    const p = geometry.getAttribute('position'), normal = geometry.getAttribute('normal'), ix = geometry.index!;
    expect(mesh.material).toBe(source.material); expect(result.children).toHaveLength(1);
    expect(result.userData.townTrunkContact).toMatchObject({ sourceTriangles:28, triangles:32, vertices:33, geometryBytes:1248 });
    source.geometry.computeBoundingBox(); expect(geometry.boundingBox).toEqual(source.geometry.boundingBox);
    const original = source.geometry.getAttribute('position');
    const unique = new Map<string, THREE.Vector2>();
    for (let i = 0; i < original.count; i++) if (original.getY(i) < -.999) unique.set(`${original.getX(i)},${original.getZ(i)}`, new THREE.Vector2(original.getX(i), original.getZ(i)));
    const ring = [...unique.values()].sort((a,b) => Math.atan2(a.y,a.x)-Math.atan2(b.y,b.x));
    const edgeCounts = new Map<string, number>(), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    const key = (id: number) => [p.getX(id),p.getY(id),p.getZ(id)].map(v => v.toFixed(6)).join(',');
    for (let i = 0; i < p.count; i++) {
      expect(Math.hypot(normal.getX(i),normal.getY(i),normal.getZ(i))).toBeCloseTo(1,6);
      for (let j=0;j<ring.length;j++) {
        const v=ring[j],w=ring[(j+1)%ring.length];
        expect((w.x-v.x)*(p.getZ(i)-v.y)-(w.y-v.y)*(p.getX(i)-v.x)).toBeGreaterThanOrEqual(-1e-6);
      }
    }
    for (let i=0;i<ix.count;i+=3) {
      const ids=[ix.getX(i),ix.getX(i+1),ix.getX(i+2)];
      a.fromBufferAttribute(p,ids[0]);b.fromBufferAttribute(p,ids[1]);c.fromBufferAttribute(p,ids[2]);
      const face=b.sub(a).cross(c.sub(a));expect(face.length()).toBeGreaterThan(.01);face.normalize();
      for(const id of ids)expect(face.dot(new THREE.Vector3().fromBufferAttribute(normal,id))).toBeGreaterThan(.25);
      for(let e=0;e<3;e++){const edge=[key(ids[e]),key(ids[(e+1)%3])].sort().join('|');edgeCounts.set(edge,(edgeCounts.get(edge)??0)+1);}
    }
    expect([...edgeCounts.values()].every(count=>count===2)).toBe(true);
    const radiusAt = (y:number) => Math.max(...Array.from({length:p.count},(_,i)=>Math.abs(p.getY(i)-y)<1e-5?Math.hypot(p.getX(i),p.getZ(i)):0));
    expect(radiusAt(-1)/radiusAt(-.72)).toBeGreaterThan(1.25);
    expect(radiusAt(-.72)/radiusAt(1)).toBeGreaterThan(1.1);
    for(const height of [3,7,14,22]) for(const distant of [false,true]) {
      const form=treeForm([9,height*.71,-8,2,height*.3,2,.7],[250,0,500],distant);
      expect(form.trunk.position[1]+geometry.boundingBox!.min.y*form.trunk.scale[1]).toBeCloseTo(form.groundY,6);
      const near=treeForm([9,height*.71,-8,2,height*.3,2,.7],[250,0,500]);
      expect(form.trunk).toEqual(near.trunk);
    }
    expect(signature(source.geometry)).toBe(snapshot);
    disposeTrunkContactPrototype(result);releaseSource(base);
  });

  it('owns only its geometry and rejects unrelated or changed prototypes', async () => {
    const base=await nativeTrunk(),source=nativeMesh(base),result=createTrunkContactPrototype(base),mesh=nativeMesh(result);
    const own=vi.spyOn(mesh.geometry,'dispose'),original=vi.spyOn(source.geometry,'dispose'),material=vi.spyOn(source.material as THREE.Material,'dispose');
    disposeTrunkContactPrototype(result);disposeTrunkContactPrototype(result);
    expect(own).toHaveBeenCalledOnce();expect(original).not.toHaveBeenCalled();expect(material).not.toHaveBeenCalled();expect(result.children).toHaveLength(0);
    expect(()=>createTrunkContactPrototype(new THREE.Group())).toThrow('single trunk');
    const changed=base.clone();nativeMesh(changed).geometry=source.geometry.clone();
    nativeMesh(changed).geometry.getAttribute('position').setY(0,NaN);
    expect(()=>createTrunkContactPrototype(changed)).toThrow('finite straight');
    nativeMesh(changed).geometry.dispose();releaseSource(base);
  });

  it('shares the replacement across near/far anchors, counts its resident buffer and retains it through tile eviction', async () => {
    const trunk=await nativeTrunk();
    const manifest:WorldManifest={version:1,coordinates:{axes:'Y_UP',conversion:'(x,z,-y)',horizontalOrigin:[1,2],sourceCRS:'EPSG:6491',sourceVerticalOffsetM:100},
      tiles:[{id:'trees',origin:[0,0,0],bounds:{min:[-1000,0,-1000],max:[1000,40,1000]},lods:[{level:0,url:'trees.glb',bytes:1}]}],
      fallback:{url:'fallback.glb',bytes:1},car:{url:'car.glb',bytes:1,forward:'-Z',wheelNodes:[]},
      trees:{prototypes:[{id:'near',url:'near.glb',bytes:1,role:'crown',level:0},{id:'far',url:'far.glb',bytes:1,role:'crown',level:1},{id:'trunk',url:'trunk.glb',bytes:1,role:'trunk'}]},stats:{}};
    const world=new TownWorld(manifest,'https://example.test/manifest.json',()=>{});
    const internal=world as unknown as {prototypes:THREE.Group[];trunkContactPrototypes:Map<number,THREE.Group>;acquireMaterials(group:THREE.Group):void;evict(id:string):void};
    const crowns=[new THREE.BoxGeometry(),new THREE.TetrahedronGeometry()].map(geometry=>{const group=new THREE.Group();group.add(new THREE.Mesh(geometry,new THREE.MeshStandardMaterial()));return group;});
    internal.prototypes=[...crowns,trunk];internal.prototypes.forEach(group=>internal.acquireMaterials(group));
    const material=nativeMesh(trunk).material,sourceDispose=vi.spyOn(nativeMesh(trunk).geometry,'dispose'),materialDispose=vi.spyOn(material as THREE.Material,'dispose');
    const baselineBytes=world.residentResources().estimatedGeometryBytes,variant=createTrunkContactPrototype(trunk),variantMesh=nativeMesh(variant);
    const variantDispose=vi.spyOn(variantMesh.geometry,'dispose');internal.trunkContactPrototypes.set(2,variant);
    expect(world.residentResources().estimatedGeometryBytes-baselineBytes).toBe(1248);
    const rows=[[20,10,0,3,4,5,.37],[420,11,15,3,4,5,.92]],before=structuredClone(rows);
    world.loaded.set('trees',{group:new THREE.Group(),level:0,lastUsed:performance.now(),treeRows:rows});world.update([0,0,0],[0,0,0]);
    const meshes=world.loaded.get('trees')!.trees!.children as THREE.InstancedMesh[];
    expect(meshes.filter(m=>m.userData.treeKind==='near').flatMap(m=>m.userData.sourceRows)).toEqual([0]);
    expect(meshes.filter(m=>m.userData.treeKind==='far').flatMap(m=>m.userData.sourceRows)).toEqual([1]);
    const trunkMeshes=meshes.filter(m=>m.userData.treeKind==='trunk'),actual=new THREE.Matrix4(),expected=new THREE.Matrix4();
    expect(trunkMeshes.flatMap(m=>m.userData.sourceRows).sort()).toEqual([0,1]);
    for(const mesh of trunkMeshes){
      expect(mesh.geometry).toBe(variantMesh.geometry);expect(mesh.material).toBe(material);
      for(let i=0;i<mesh.count;i++){
        const rowId=(mesh.userData.sourceRows as number[])[i],form=treeForm(rows[rowId],[0,0,0]);mesh.getMatrixAt(i,actual);
        expected.compose(new THREE.Vector3().fromArray(form.trunk.position),new THREE.Quaternion(),new THREE.Vector3().fromArray(form.trunk.scale));
        actual.elements.forEach((value,j)=>expect(value).toBeCloseTo(expected.elements[j],5));
      }
    }
    expect(rows).toEqual(before);const instanceDispose=trunkMeshes.map(m=>vi.spyOn(m,'dispose'));
    internal.evict('trees');instanceDispose.forEach(spy=>expect(spy).toHaveBeenCalledOnce());
    expect(variantDispose).not.toHaveBeenCalled();expect(sourceDispose).not.toHaveBeenCalled();expect(materialDispose).not.toHaveBeenCalled();
    world.dispose();world.dispose();expect(variantDispose).toHaveBeenCalledOnce();expect(sourceDispose).toHaveBeenCalledOnce();expect(materialDispose).toHaveBeenCalledOnce();
    expect(internal.trunkContactPrototypes.size).toBe(0);expect(internal.prototypes).toEqual([]);expect(world.residentResources().estimatedGeometryBytes).toBe(0);
  });
});
