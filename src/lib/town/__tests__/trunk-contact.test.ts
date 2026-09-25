// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import release from '../../../../data/derived/town/release.json';
import { createTrunkContactPrototype, disposeTrunkContactPrototype } from '../trunk-contact';
import { treeForm, trunkMatrix, trunkProfile, TRUNK_BURY_M, CROWN_FORM_BOUNDS, createBroadleafPrototype, createOpenBroadleafPrototype, createConiferPrototype, type TrunkJoin } from '../vegetation';
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

async function nativePrototype(role: string, level = 0): Promise<THREE.Group> {
  const root = `public/town-assets/${release.directory}/`, manifest = JSON.parse(readFileSync(root + 'manifest.json').toString());
  const entry = manifest.trees.prototypes.find((p: { role: string; level?: number }) => p.role === role && (p.level ?? 0) === level);
  const bytes = readFileSync(root + entry.url);
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(entry.sha256);
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  loader.register(() => ({ name: 'GEOMETRY_ONLY_TEXTURE_PLACEHOLDER', loadTexture: async () => new THREE.DataTexture(new Uint8Array([255,255,255,255]),1,1) }) as never);
  return (await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')).scene;
}

describe('grounded shared trunk', () => {
  it.each([['near', 10, 8, 148, 98], ['far', 6, 3, 28, 27]] as const)('builds a closed, flared and tapering %s trunk over the source height', async (detail, sides, rings, triangles, vertices) => {
    const base = await nativeTrunk(), source = nativeMesh(base), snapshot = signature(source.geometry);
    const result = createTrunkContactPrototype(base, detail), mesh = nativeMesh(result), geometry = mesh.geometry;
    const p = geometry.getAttribute('position'), normal = geometry.getAttribute('normal'), ix = geometry.index!;
    expect(mesh.material).toBe(source.material); expect(result.children).toHaveLength(1);
    expect(result.userData.townTrunkContact).toMatchObject({ detail, sourceTriangles: 28, triangles, vertices });
    expect(result.userData.townTrunkContact.geometryBytes).toBe(Object.values(geometry.attributes).reduce((sum, a) => sum + a.array.byteLength, 0) + ix.array.byteLength);
    source.geometry.computeBoundingBox();
    expect(geometry.boundingBox!.min.y).toBeCloseTo(source.geometry.boundingBox!.min.y, 6);
    expect(geometry.boundingBox!.max.y).toBeCloseTo(source.geometry.boundingBox!.max.y, 6);
    // Mean radius of each ring follows the shared profile: flared foot, steady taper.
    const ringRadius = (y: number) => { const r: number[] = []; for (let i = 0; i < (rings) * (sides + 1); i++) if (Math.abs(p.getY(i) - y) < 1e-5) r.push(Math.hypot(p.getX(i), p.getZ(i))); return r.reduce((a, b) => a + b, 0) / r.length; };
    for (const h of [0, 0.12, 1]) expect(ringRadius(-1 + 2 * h)).toBeCloseTo(trunkProfile(h), 1);
    expect(ringRadius(-1) / ringRadius(1)).toBeGreaterThan(2.1);
    const edgeCounts = new Map<string, number>(), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    const key = (id: number) => [p.getX(id),p.getY(id),p.getZ(id)].map(v => v.toFixed(6)).join(',');
    for (let i = 0; i < p.count; i++) expect(Math.hypot(normal.getX(i),normal.getY(i),normal.getZ(i))).toBeCloseTo(1,6);
    for (let i=0;i<ix.count;i+=3) {
      const ids=[ix.getX(i),ix.getX(i+1),ix.getX(i+2)];
      a.fromBufferAttribute(p,ids[0]);b.fromBufferAttribute(p,ids[1]);c.fromBufferAttribute(p,ids[2]);
      const centre=a.clone().add(b).add(c).divideScalar(3),face=b.clone().sub(a).cross(c.clone().sub(a));
      expect(face.length()).toBeGreaterThan(1e-4);face.normalize();
      // Faces point outward (or up, for the top cap).
      expect(face.dot(new THREE.Vector3(centre.x,0,centre.z).normalize())+Math.max(0,face.y)).toBeGreaterThan(.5);
      for(const id of ids)expect(face.dot(new THREE.Vector3().fromBufferAttribute(normal,id))).toBeGreaterThan(.25);
      for(let e=0;e<3;e++){const edge=[key(ids[e]),key(ids[(e+1)%3])].sort().join('|');edgeCounts.set(edge,(edgeCounts.get(edge)??0)+1);}
    }
    // Watertight except the buried foot ring.
    const open=[...edgeCounts.entries()].filter(([,count])=>count!==2);
    expect(open).toHaveLength(sides);
    for(const [edge,count] of open){expect(count).toBe(1);for(const vertex of edge.split('|'))expect(Number(vertex.split(',')[1])).toBeCloseTo(-1,5);}
    expect(signature(source.geometry)).toBe(snapshot);
    disposeTrunkContactPrototype(result);releaseSource(base);
  });

  it.each(['standard', 'open', 'conifer'] as const)('continues the %s crown skeleton from below the ground, with no stub left hanging', async habit => {
    const crown = await nativePrototype('crown', 0), trunk = await nativeTrunk();
    const variant = habit === 'conifer' ? createConiferPrototype(crown) : habit === 'open' ? createOpenBroadleafPrototype(crown) : createBroadleafPrototype(crown);
    const join = variant.userData.townTrunkJoin as TrunkJoin;
    expect(join).toBeDefined();
    expect(join.bottom[1]).toBeLessThan(CROWN_FORM_BOUNDS.near.min[1] - 0.3);
    expect(join.top[1]).toBeGreaterThan(join.bottom[1] + 0.3);
    expect(join.bottomRadius).toBeGreaterThan(join.topRadius);
    // The skeleton no longer reaches down below its lowest branch fork.
    let lowest = Infinity;
    variant.traverse(o => { if (!(o instanceof THREE.Mesh) || !/bark/i.test((o.material as THREE.Material).name)) return;
      const p = o.geometry.getAttribute('position'), ix = o.geometry.index!;
      for (let i = 0; i < ix.count; i++) lowest = Math.min(lowest, p.getY(ix.getX(i))); });
    expect(lowest).toBeGreaterThan(join.bottom[1] + 0.2);
    const prototype = createTrunkContactPrototype(trunk), geometry = nativeMesh(prototype).geometry, m = new THREE.Matrix4();
    for (const height of [8, 14, 22, 30]) for (const yaw of [0, 1.3, -2.4]) {
      const row = [9, 30 + height * .71, -8, height * .3 * .9, height * .3, height * .3 * .9, yaw];
      const form = treeForm(row, [250, 0, 500]);
      if ((form.renderFamily === 'conifer') !== (habit === 'conifer')) continue;
      trunkMatrix(form, join, m);
      const foot = new THREE.Vector3(0, -1, 0).applyMatrix4(m), top = new THREE.Vector3(0, 1, 0).applyMatrix4(m);
      expect(foot.y).toBeCloseTo(form.groundY - TRUNK_BURY_M, 6);
      expect(Math.hypot(foot.x - row[0], foot.z - row[2])).toBeLessThan(1e-6);
      expect(top.y).toBeCloseTo(Math.max(form.trunkTopY, form.frame.position[1] + (join.top[1] + 0.02) * form.frame.scale[1]), 6);
      expect(top.y).toBeLessThan(form.topY);
      // At the old stub's top the trunk axis passes through its centre and is wider than it was.
      const frame = new THREE.Matrix4().compose(new THREE.Vector3(...form.frame.position), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), form.yaw), new THREE.Vector3(...form.frame.scale));
      const stubTop = new THREE.Vector3(...join.top).applyMatrix4(frame), hAtTop = (stubTop.y - foot.y) / (top.y - foot.y);
      const axis = new THREE.Vector3(0, -1 + 2 * hAtTop, 0).applyMatrix4(m);
      expect(axis.distanceTo(stubTop)).toBeLessThan(1e-4);
      const edge = new THREE.Vector3(trunkProfile(hAtTop), -1 + 2 * hAtTop, 0).applyMatrix4(m);
      expect(Math.hypot(edge.x - axis.x, edge.z - axis.z)).toBeGreaterThan(join.topRadius * Math.min(form.frame.scale[0], form.frame.scale[2]));
      const p = geometry.getAttribute('position');
      for (let i = 0; i < p.count; i++) expect(new THREE.Vector3().fromBufferAttribute(p, i).applyMatrix4(m).toArray().every(Number.isFinite)).toBe(true);
    }
    disposeTrunkContactPrototype(prototype); releaseSource(trunk);
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
    expect(world.residentResources().estimatedGeometryBytes-baselineBytes).toBe(variant.userData.townTrunkContact.geometryBytes);
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
