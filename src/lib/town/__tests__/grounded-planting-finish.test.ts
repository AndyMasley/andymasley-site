// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { Batch } from '../crafted-frontages';
import { finishGroundedPlantingSurfaces, groundedShrubProfiles } from '../grounded-planting-finish';
import type { GroundedSiteFeature } from '../arrival-grounds';

function source(id: string, kind = 'bed', sid = id, color = '#625546'): GroundedSiteFeature {
  return { id, kind, sid, color, site: 'fixture', basis: 'authored fixture', areaM2: 1, triangles: [[[0,0],[2,0],[0,1]]] };
}
function batch(features: GroundedSiteFeature[]) {
  const result = new Batch(new THREE.Vector3(), 0);
  for (const feature of features) result.geometry({structId:feature.sid,tileId:'test',start:[0,0],tangent:[1,0],outward:[0,1]},'paving',[0,0,0,2,0,0,0,0,1],[0,1,0,0,1,0,0,1,0],feature.color);
  return result.finish().group;
}
function compile(material: THREE.Material) {
  const standard=THREE.ShaderLib.standard;
  const shader={vertexShader:standard.vertexShader,fragmentShader:standard.fragmentShader,uniforms:THREE.UniformsUtils.clone(standard.uniforms)};
  material.onBeforeCompile(shader as Parameters<THREE.Material['onBeforeCompile']>[0],{} as THREE.WebGLRenderer);
  return shader;
}

describe('Owned garden-bed finish', () => {
  it('finishes only exclusively bed-owned batches, including different owners in one existing draw', () => {
    for(const features of [[source('a'),source('b')],[source('a'),source('b','bed','a')]]) {
      const group=batch(features),mesh=group.children[0] as THREE.Mesh, material=mesh.material as THREE.MeshStandardMaterial;
      const geometry=mesh.geometry,position=geometry.getAttribute('position'),normal=geometry.getAttribute('normal'),before=position.array.slice();
      const gd=vi.spyOn(geometry,'dispose'),md=vi.spyOn(material,'dispose'),vertex=compile(material).vertexShader;
      expect(finishGroundedPlantingSurfaces(group,features)).toEqual(['a','b']);
      expect(group.children).toHaveLength(1); expect(mesh.material).toBe(material);expect(mesh.geometry).toBe(geometry);
      expect(geometry.getAttribute('position')).toBe(position);expect(position.array).toEqual(before);expect(geometry.getAttribute('normal')).toBe(normal);
      expect(material.userData.groundedPlantingFinish.ids).toEqual(['a','b']); expect(material.userData.surfaceRole).toBe('paving');
      expect(material.transparent).toBe(false);expect(material.map).toBeNull();expect(material.roughness).toBe(.985);
      const shader=compile(material);expect(shader.vertexShader).toBe(vertex);
      // Two existing continuous noise samples are repurposed. No extra map,
      // loop, alpha clipping or geometry displacement enters the shader.
      expect([...shader.fragmentShader.matchAll(/=craftedGroundNoise\(|=smoothstep\([^;]*craftedGroundNoise\(/g)].length).toBe(2);
      expect(shader.fragmentShader).not.toMatch(/\bdiscard\b|textureGrad\(|texture2D\(/);
      expect(shader.fragmentShader.indexOf('craftedPavingFootprint=max(length(dFdx(vCraftedWorld))')).toBeLessThan(shader.fragmentShader.indexOf('float craftedPavingGrain='));
      expect(shader.fragmentShader).toContain('smoothstep(.012,.055,craftedPavingFootprint)');
      expect(shader.fragmentShader).toContain('*.0028*craftedPavingResolved*craftedNear');
      expect(finishGroundedPlantingSurfaces(group,features)).toEqual([]);
      expect(gd).not.toHaveBeenCalled();expect(md).not.toHaveBeenCalled();
      geometry.dispose();material.dispose();
    }
  });

  it('leaves mixed paving, unmatched owners, native materials and brown color matches alone', () => {
    for(const mode of ['mixed-owner','mixed-kind','unknown','native','material-array']) {
      const features=[source('a'),source('b',mode==='mixed-kind'?'walk':'bed',mode==='mixed-kind'?'a':'b')];
      if(mode==='mixed-owner')features[1].kind='walk';
      const group=batch(features),mesh=group.children[0] as THREE.Mesh, material=mesh.material as THREE.MeshStandardMaterial;
      if(mode==='unknown')mesh.userData.sourceIds.push('not-in-features');
      if(mode==='native')mesh.userData.townCrafted=false;
      if(mode==='material-array')mesh.material=[material];
      const hook=material.onBeforeCompile,key=material.customProgramCacheKey();
      expect(finishGroundedPlantingSurfaces(group,features)).toEqual([]);
      expect(material.onBeforeCompile).toBe(hook);expect(material.customProgramCacheKey()).toBe(key);expect(material.userData.groundedPlantingFinish).toBeUndefined();
      mesh.geometry.dispose();material.dispose();
    }
  });
});

describe('Existing shrub form refinement', () => {
  it('shares normals at actual coincident sphere seam and pole vertices regardless of signed zero', () => {
    let coincidentGroups=0;
    for(const level of [0,1])for(const geometry of groundedShrubProfiles(level)) {
      const p=geometry.getAttribute('position'),n=geometry.getAttribute('normal'),groups=new Map<string,number[]>();
      for(let i=0;i<p.count;i++) {
        const key=[p.getX(i),p.getY(i),p.getZ(i)].map(v=>Math.round(v*1e6)).join(':');
        const ids=groups.get(key)??[];ids.push(i);groups.set(key,ids);
      }
      for(const ids of groups.values())if(ids.length>1) {
        coincidentGroups++;
        for(const id of ids.slice(1)) {
          const first=ids[0];
          expect(Math.hypot(p.getX(id)-p.getX(first),p.getY(id)-p.getY(first),p.getZ(id)-p.getZ(first))).toBeLessThan(1e-6);
          expect(Math.hypot(n.getX(id)-n.getX(first),n.getY(id)-n.getY(first),n.getZ(id)-n.getZ(first))).toBeLessThan(1e-6);
        }
      }
      geometry.dispose();
    }
    expect(coincidentGroups).toBeGreaterThan(12);
  });

  it('preserves topology, source height extrema and horizontal clearance at both plant LODs', () => {
    for(const level of [0,1]) {
      const source=new THREE.SphereGeometry(1,level===0?7:5,level===0?5:4),original=source.getAttribute('position');
      const profiles=groundedShrubProfiles(level);expect(profiles).toHaveLength(3);
      const shapes=new Set<string>();
      for(const geometry of profiles) {
        const p=geometry.getAttribute('position'),n=geometry.getAttribute('normal'),index=geometry.index!;
        expect(p.count).toBe(original.count);expect(index.array).toEqual(source.index!.array);
        expect(geometry.boundingBox!.min.y).toBe(-1);expect(geometry.boundingBox!.max.y).toBe(1);
        for(let i=0;i<p.count;i++) {
          expect(Math.hypot(p.getX(i),p.getZ(i))).toBeLessThanOrEqual(Math.hypot(original.getX(i),original.getZ(i))+.000001);
          expect(p.getY(i)).toBeGreaterThanOrEqual(-1);expect(p.getY(i)).toBeLessThanOrEqual(1);
          expect(Math.hypot(n.getX(i),n.getY(i),n.getZ(i))).toBeCloseTo(1,5);
        }
        const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),face=new THREE.Vector3(),mean=new THREE.Vector3();
        for(let i=0;i<index.count;i+=3) {
          const ids=[index.getX(i),index.getX(i+1),index.getX(i+2)];
          a.fromBufferAttribute(p,ids[0]);b.fromBufferAttribute(p,ids[1]);c.fromBufferAttribute(p,ids[2]);face.copy(b).sub(a).cross(c.sub(a));
          expect(face.length()).toBeGreaterThan(1e-7);mean.set(0,0,0);for(const id of ids)mean.add(new THREE.Vector3().fromBufferAttribute(n,id));
          expect(face.normalize().dot(mean.normalize())).toBeGreaterThan(.55);
        }
        shapes.add(JSON.stringify([...p.array]));geometry.dispose();
      }
      expect(shapes.size).toBe(3);source.dispose();
    }
  });
});
