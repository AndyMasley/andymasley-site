import * as THREE from 'three';
import type { V3 } from './contracts';
import habitatData from '../../../data/derived/town/vegetation-habitats.json';
import { finishLeafClusters } from './foliage-clusters';

export interface TreeForm {
  crown: { position: V3; scale: V3 };
  trunk: { position: V3; scale: V3 };
  yaw: number;
  family: 'rounded' | 'spreading' | 'open' | 'tiered';
  renderFamily: 'broadleaf' | 'conifer';
  crownVariant: 'standard' | 'open';
  habitat: TreeHabitat;
  groundY: number;
  topY: number;
}

// Bounds of the fixed release's leaf primitive and distant crown, before instancing.
// These describe render assets, not surveyed species or individual trunk locations.
export const CROWN_FORM_BOUNDS = {
  near: { min: [-1.0010135173797607, -0.41970714926719666, -1.109898567199707], max: [1.0013924837112427, 1.0466471910476685, 1.1201896667480469] },
  far: { min: [-0.71207195520401, -0.7491682171821594, -0.7033854722976685], max: [0.7261876463890076, 1.0236793756484985, 0.7357558012008667] },
} as const;

export type TreeHabitat = 'evergreen-woodland' | 'deciduous-woodland' | 'forested-wetland' | 'wetland-edge' | 'scrub' | 'developed' | 'open' | 'unknown';
export const TREE_HABITAT_PROVENANCE = habitatData;
let habitatCells: Uint8Array | undefined;

/** The mapped 2016 canopy class supplies context, never a surveyed tree species. */
export function habitatAt(xEast: number, north: number): TreeHabitat {
  if (!Number.isFinite(xEast) || !Number.isFinite(north)) return 'unknown';
  const grid = habitatData.grid, [minX, minNorth, maxX, maxNorth] = grid.boundsLocalEastNorth;
  if (xEast < minX || xEast >= maxX || north <= minNorth || north > maxNorth) return 'unknown';
  if (!habitatCells) {
    const cells = new Uint8Array(grid.width * grid.height);
    let offset = 0;
    for (let i = 0; i < grid.runs.length; i += 2) {
      const code = grid.runs[i], count = grid.runs[i + 1];
      if (!Number.isInteger(code) || code < 0 || code > 255 || !Number.isInteger(count) || count <= 0 || offset + count > cells.length) throw new Error('Invalid tree habitat run encoding.');
      cells.fill(code, offset, offset + count);
      offset += count;
    }
    if (offset !== cells.length) throw new Error('Incomplete tree habitat grid.');
    habitatCells = cells;
  }
  const column = Math.floor((xEast - minX) / grid.cellSizeM), row = Math.floor((maxNorth - north) / grid.cellSizeM);
  const code = habitatCells[row * grid.width + column];
  if (code === 10) return 'evergreen-woodland';
  if (code === 9) return 'deciduous-woodland';
  if (code === 13) return 'forested-wetland';
  if ([14, 15, 16, 17, 18, 19, 21, 22].includes(code)) return 'wetland-edge';
  if (code === 12) return 'scrub';
  if (code === 2 || code === 5) return 'developed';
  if ([6, 7, 8, 20].includes(code)) return 'open';
  return 'unknown';
}

// Authored mixture weights, not measured local species frequencies. Two render
// cohorts keep the geometry and draw-call cost bounded at every LOD/shadow band.
const CONIFER_SHARE: Record<TreeHabitat, number> = {
  'evergreen-woodland': 0.86, 'deciduous-woodland': 0.08, 'forested-wetland': 0.025,
  'wetland-edge': 0.07, scrub: 0.13, developed: 0.10, open: 0.08, unknown: 0.08,
};

function variation(x: number, z: number, salt: number): number {
  let h = Math.imul(Math.round(x * 10) ^ salt, 374761393) ^ Math.imul(Math.round(z * 10), 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Authored habitat-informed proportions preserve the source's implied foot and current top.
 * Rows remain unmodified. The world coordinate seed is independent of tile ownership.
 * Both LODs cover the same leaf envelope; only their displayed mesh changes.
 */
export function treeForm(row: readonly number[], origin: readonly number[], distant = false): TreeForm {
  if (row.length < 7 || !row.slice(0, 7).every(Number.isFinite) || row.slice(3, 6).some(value => value <= 0) ||
      origin.length < 3 || !origin.slice(0, 3).every(Number.isFinite)) throw new Error('Tree forms require finite positive source transforms.');
  const x = row[0] + origin[0], z = row[2] + origin[2];
  const seed = variation(x, z, 1877), detail = variation(x, z, 731);
  const habitat = habitatAt(x, -z);
  const renderFamily = variation(x, z, 4021) < CONIFER_SHARE[habitat] ? 'conifer' : 'broadleaf';
  const roundLimit = habitat === 'forested-wetland' ? 0.70 : habitat === 'deciduous-woodland' ? 0.30 : 0.42;
  const spreadLimit = habitat === 'forested-wetland' ? 0.80 : habitat === 'deciduous-woodland' ? 0.88 : 0.82;
  const family = renderFamily === 'conifer' ? 'tiered' : seed < roundLimit ? 'rounded' : seed < spreadLimit ? 'spreading' : 'open';
  const spread = family === 'tiered' ? 0.92 + detail * 0.18 : family === 'spreading' ? 1.24 + detail * 0.12 : family === 'rounded' ? 1.12 + detail * 0.12 : 1.04 + detail * 0.10;
  const depth = family === 'tiered' ? 1.13 + detail * 0.11 : family === 'open' ? 1.20 + detail * 0.10 : 1.32 + detail * 0.10;
  const asymmetry = 0.96 + variation(x, z, 2017) * 0.08;
  const near = CROWN_FORM_BOUNDS.near, target = distant ? CROWN_FORM_BOUNDS.far : near;
  const height = row[4] / 0.30;
  const groundY = row[1] - height * 0.71;
  const topY = row[1] + near.max[1] * row[4];
  const nearScale: V3 = [row[3] * spread * asymmetry, row[4] * depth, row[5] * spread / asymmetry];
  const scale = nearScale.map((value, axis) => value * (near.max[axis] - near.min[axis]) / (target.max[axis] - target.min[axis])) as V3;
  const offsetX = ((near.min[0] + near.max[0]) * nearScale[0] - (target.min[0] + target.max[0]) * scale[0]) * 0.5;
  const offsetZ = ((near.min[2] + near.max[2]) * nearScale[2] - (target.min[2] + target.max[2]) * scale[2]) * 0.5;
  const yaw = row[6], cosine = Math.cos(yaw), sine = Math.sin(yaw);
  const crownPosition: V3 = [row[0] + cosine * offsetX + sine * offsetZ, topY - target.max[1] * scale[1], row[2] - sine * offsetX + cosine * offsetZ];
  const leafBottom = topY - (near.max[1] - near.min[1]) * nearScale[1];
  // Trunk joins inside the branching crown instead of ending in a long exposed pole.
  const trunkTop = leafBottom + height * 0.12;
  const halfTrunk = (trunkTop - groundY) * 0.5;
  const radius = Math.max(0.12, Math.min(0.46, height * (0.014 + detail * 0.003)));
  return {
    crown: { position: crownPosition, scale },
    trunk: { position: [row[0], groundY + halfTrunk, row[2]], scale: [radius, halfTrunk, radius] },
    yaw, family, renderFamily, crownVariant:renderFamily==='broadleaf'&&(family==='open'||(family==='spreading'&&variation(x,z,991)<.45))?'open':'standard', habitat, groundY, topY,
  };
}


const coniferGeometry = new WeakMap<THREE.Group, Set<THREE.BufferGeometry>>();

/** Build once for each shared crown LOD, not for individual trees or tiles.
 * Geometry is owned by the returned group. Materials, textures, UVs and vertex
 * colors remain borrowed from the fixed source prototype. The broken tiers and
 * off-centre leader evoke mature pine habit; the leaf atlas is not needle data.
 */
export function createConiferPrototype(base: THREE.Group): THREE.Group { return createCrownPrototype(base,'conifer'); }
/** One shared near broadleaf silhouette, with coherent branch/leaf deformation.
 * The returned geometry is owned; materials and textures remain borrowed. */
export function createOpenBroadleafPrototype(base:THREE.Group):THREE.Group { return createCrownPrototype(base,'open'); }
export function disposeOpenBroadleafPrototype(group:THREE.Group):void { disposeConiferPrototype(group); }
/** Shared standard broadleaf shading variant; source card locations unchanged. */
export function createBroadleafPrototype(base:THREE.Group):THREE.Group { return createCrownPrototype(base,'standard'); }
export function disposeBroadleafPrototype(group:THREE.Group):void { disposeConiferPrototype(group); }
function createCrownPrototype(base: THREE.Group, habit:'conifer'|'open'|'standard'): THREE.Group {
  base.updateMatrixWorld(true);
  const result = new THREE.Group();
  result.name = `${base.name || 'Tree crown'} | inferred ${habit} habit`;
  const owned = new Set<THREE.BufferGeometry>();
  coniferGeometry.set(result, owned);
  const leaves: THREE.Mesh[] = [];
  const all: THREE.Mesh[] = [];
  try {
    base.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      const geometry = object.geometry.clone();
      owned.add(geometry);
      geometry.applyMatrix4(object.matrixWorld);
      const mesh = new THREE.Mesh(geometry, object.material);
      mesh.name = object.name;
      mesh.castShadow = object.castShadow;
      mesh.receiveShadow = object.receiveShadow;
      mesh.userData[habit==='conifer'?'townConiferVariant':habit==='open'?'townOpenBroadleafVariant':'townBroadleafVariant'] = true;
      result.add(mesh);
      all.push(mesh);
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      if (!materials.every(material => /trunk|branch|bark/i.test(material.name))) leaves.push(mesh);
    });
    if (!leaves.length) throw new Error('A conifer variant requires a crown primitive.');
    const sourceBounds = new THREE.Box3();
    for (const mesh of leaves) {
      mesh.geometry.computeBoundingBox();
      sourceBounds.union(mesh.geometry.boundingBox!);
    }
    const size = sourceBounds.getSize(new THREE.Vector3()), center = sourceBounds.getCenter(new THREE.Vector3());
    if (![size.x, size.y, size.z].every(value => Number.isFinite(value) && value > 0)) throw new Error('Tree crown bounds must be finite and nonempty.');
    const deform=(px:number,py:number,pz:number,far=false):THREE.Vector3=>{
        if(habit==='standard')return new THREE.Vector3(px,py,pz);
        const x = (px - center.x) / size.x;
        const z = (pz - center.z) / size.z;
        const t = (py - sourceBounds.min.y) / size.y;
        const angle = Math.atan2(z, x);
        const inside = Math.max(0, Math.min(1, t));
        if(habit==='open'){
          // A flatter, off-centre upper branching habit and a few broad lobes
          // distinguish whole crown structure without new branch locations.
          const crown=Math.sin(inside*Math.PI),lobes=1+.14*crown*Math.cos(angle*3+inside*3.7);
          const radial=(.82+.24*Math.sin(inside*2.1+.35))*lobes;
          const sway=Math.sin(inside*3.0)*.055;
          return new THREE.Vector3(center.x+size.x*(x*radial+sway),sourceBounds.min.y+size.y*(t+.030*crown*Math.min(1,Math.hypot(x,z)*2.5)*Math.sin(angle*2+inside*3)),center.z+size.z*(z*radial-sway*.68));

        }
        // Broad, offset upper boughs and broken lower whorls, not a perfect cone.
        const radial = (0.78 + 0.30 * Math.exp(-Math.pow((inside - 0.57) / 0.30, 2)) - 0.08 * Math.pow(inside, 12)) *
          (.965+.035*Math.cos(inside*Math.PI*4+.6)) *
          (1 + 0.055 * Math.sin(angle * 3 + inside * 7) + 0.022 * Math.cos(angle * 5 - inside * 9));
        const sway = Math.sin(inside * 3.1) * 0.025;
        const y = t + .007 * Math.sin(inside * Math.PI * 4);
        return new THREE.Vector3( center.x + size.x * (x * radial + sway), sourceBounds.min.y + size.y * y,
          center.z + size.z * (z * radial - sway * 0.57));
    };
    for(const mesh of all){
      const geometry=mesh.geometry,position=geometry.getAttribute('position'),source=position.clone(),leaf=leaves.includes(mesh),far=!geometry.getAttribute('uv');
      for(let i=0;i<position.count;i++){const v=deform(source.getX(i),source.getY(i),source.getZ(i),far);position.setXYZ(i,v.x,v.y,v.z);}
      if(habit==='conifer'&&leaf&&!far){
        // Source cards are connected four-vertex components. Deform each with
        // the local affine derivative, retaining a planar leaf card instead of
        // folding its opposite triangles across a narrow crown tier.
        const parent=Array.from({length:position.count},(_,i)=>i),find=(n:number):number=>{while(parent[n]!==n){parent[n]=parent[parent[n]];n=parent[n];}return n;},index=geometry.index;
        for(let i=0;i<(index?.count??position.count);i+=3){const ids=[0,1,2].map(k=>index?index.getX(i+k):i+k);for(const k of ids)parent[find(k)]=find(ids[0]);}
        const components=new Map<number,number[]>();for(let i=0;i<position.count;i++){const key=find(i),list=components.get(key);if(list)list.push(i);else components.set(key,[i]);}
        for(const ids of components.values()){
          if(ids.length<3||ids.length>12)continue;
          const c=new THREE.Vector3();for(const i of ids)c.add(new THREE.Vector3().fromBufferAttribute(source,i));c.multiplyScalar(1/ids.length);
          const origin=deform(c.x,c.y,c.z),h=1e-4,jx=deform(c.x+h,c.y,c.z).sub(deform(c.x-h,c.y,c.z)).multiplyScalar(.5/h),jy=deform(c.x,c.y+h,c.z).sub(deform(c.x,c.y-h,c.z)).multiplyScalar(.5/h),jz=deform(c.x,c.y,c.z+h).sub(deform(c.x,c.y,c.z-h)).multiplyScalar(.5/h);
          if(jx.clone().cross(jy).dot(jz)<=0)throw new Error('Crown deformation must preserve orientation.');
          for(const i of ids){const v=origin.clone().addScaledVector(jx,source.getX(i)-c.x).addScaledVector(jy,source.getY(i)-c.y).addScaledVector(jz,source.getZ(i)-c.z);position.setXYZ(i,v.x,v.y,v.z);}
        }
      }
    }
    // Both source and variant use the same leaf bounds, so near/far crown and
    // trunk anchoring retain their exact source-derived height contract.
    const deformedBounds = new THREE.Box3();
    for (const mesh of leaves) {
      mesh.geometry.computeBoundingBox();
      deformedBounds.union(mesh.geometry.boundingBox!);
    }
    const deformedSize = deformedBounds.getSize(new THREE.Vector3());
    const scale = new THREE.Vector3(size.x / deformedSize.x, size.y / deformedSize.y, size.z / deformedSize.z);
    const shift = sourceBounds.min.clone().sub(deformedBounds.min.clone().multiply(scale));
    for (const mesh of all) {
      const geometry = mesh.geometry, position = geometry.getAttribute('position');
      for (let i = 0; i < position.count; i++) position.setXYZ(i,
        position.getX(i) * scale.x + shift.x, position.getY(i) * scale.y + shift.y,
        position.getZ(i) * scale.z + shift.z);
      position.needsUpdate = true;
      const previousNormal = geometry.getAttribute('normal')?.clone();
      geometry.computeVertexNormals();
      const normal = geometry.getAttribute('normal');
      if(habit==='conifer'&&!leaves.includes(mesh)){
        // Narrow branch sides have very different triangle areas after bending.
        // Equal face weights preserve the cylindrical smoothing instead of
        // letting one long triangle pull a short neighbour's normal backwards.
        const sums=new Float64Array(position.count*3),a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),index=geometry.index;
        for(let i=0;i<(index?.count??position.count);i+=3){
          const ids=[0,1,2].map(k=>index?index.getX(i+k):i+k);
          a.fromBufferAttribute(position,ids[0]);b.fromBufferAttribute(position,ids[1]);c.fromBufferAttribute(position,ids[2]);
          const face=b.sub(a).cross(c.sub(a)).normalize();
          for(const id of ids){sums[id*3]+=face.x;sums[id*3+1]+=face.y;sums[id*3+2]+=face.z;}
        }
        for(let i=0;i<position.count;i++){a.fromArray(sums,i*3).normalize();normal.setXYZ(i,a.x,a.y,a.z);}
      }
      for (let i = 0; i < normal.count; i++) {
        if (Math.hypot(normal.getX(i), normal.getY(i), normal.getZ(i)) > 1e-8) continue;
        // Unreferenced seam vertices can have zero area after Three recomputes
        // normals. Retain their previous unit direction; no rendered face changes.
        const nx = previousNormal?.getX(i) ?? 0, ny = previousNormal?.getY(i) ?? 1, nz = previousNormal?.getZ(i) ?? 0;
        const length = Math.hypot(nx, ny, nz) || 1;
        normal.setXYZ(i, nx / length, ny / length, nz / length);
      }
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      if(leaves.includes(mesh))finishLeafClusters(geometry,sourceBounds);
    }
    result.userData[habit==='conifer'?'townConiferVariant':habit==='open'?'townOpenBroadleafVariant':'townBroadleafVariant'] = true;
    result.userData.townBorrowedMaterials = true;
    result.userData.townCrownBounds = { min: sourceBounds.min.toArray(), max: sourceBounds.max.toArray() };
    const buffers = new Set<ArrayBufferLike>();
    for (const geometry of owned) {
      for (const attribute of Object.values(geometry.attributes)) buffers.add(attribute instanceof THREE.InterleavedBufferAttribute ? attribute.data.array.buffer : attribute.array.buffer);
      if (geometry.index) buffers.add(geometry.index.array.buffer);
    }
    result.userData.townCrownGeometryBytes = result.userData.townConiferGeometryBytes = [...buffers].reduce((total, buffer) => total + buffer.byteLength, 0);
    return result;
  } catch (error) {
    disposeConiferPrototype(result);
    throw error;
  }
}

/** Release only geometry created above; never dispose borrowed materials/textures. */
export function disposeConiferPrototype(group: THREE.Group): void {
  const owned = coniferGeometry.get(group);
  if (!owned) return;
  for (const geometry of owned) geometry.dispose();
  coniferGeometry.delete(group);
  group.clear();
}
