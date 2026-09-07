// @vitest-environment node
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Batch, type Frame } from '../crafted-frontages';
import { applyArtMaterial, removeArtMaterial } from '../art-materials';
import { VEGETATION_FINISH_EVIDENCE, wetMarginFlowers } from '../vegetation-finish';

describe('bounded regional vegetation finish',()=>{
  it('adds fading bark relief without taking texture ownership or changing prototype geometry',()=>{
    const geometry=new THREE.CylinderGeometry(.3,.4,8,8),position=geometry.getAttribute('position'),before=position.array.slice(),index=geometry.index!.array.slice();
    const material=new THREE.MeshStandardMaterial({color:'#68553d'}),map=new THREE.Texture();material.name='Canopy trunks | schematic bark';material.map=map;
    const original={color:material.color.getHexString(),compile:material.onBeforeCompile,key:material.customProgramCacheKey};
    applyArtMaterial(material);const hook=material.onBeforeCompile;applyArtMaterial(material);expect(material.onBeforeCompile).toBe(hook);
    const standard=THREE.ShaderLib.standard,shader={vertexShader:standard.vertexShader,fragmentShader:standard.fragmentShader,uniforms:THREE.UniformsUtils.clone(standard.uniforms)};
    hook.call(material,shader as Parameters<THREE.Material['onBeforeCompile']>[0],{} as THREE.WebGLRenderer);
    expect(shader.vertexShader).toContain('townArtPosition = instanceMatrix * townArtPosition');
    expect(shader.fragmentShader).toContain('smoothstep(18.0,48.0,townArtDistance)');
    expect(shader.fragmentShader.indexOf('vec3 townArtDx')).toBeGreaterThan(shader.fragmentShader.indexOf('#include <normal_fragment_maps>'));
    expect(shader.fragmentShader.match(/#include <map_fragment>/g)).toHaveLength(1);
    expect(material.map).toBe(map);expect(position.array).toEqual(before);expect(geometry.index!.array).toEqual(index);
    expect(material.color.getHexString()).toBe(original.color); // Retain the mapped source factor; avoid double darkening.
    removeArtMaterial(material);expect(material.color.getHexString()).toBe(original.color);expect(material.onBeforeCompile).toBe(original.compile);expect(material.customProgramCacheKey).toBe(original.key);
    expect(VEGETATION_FINISH_EVIDENCE.addedTreeTriangles).toBe(0);expect(VEGETATION_FINISH_EVIDENCE.addedTextures).toBe(0);
    geometry.dispose();material.dispose();map.dispose();
  });
  it.each([0,1,2])('keeps wet-margin flower forms within existing shrub patches and below their triangle budget at LOD%s',level=>{
    for(const seed of[0,.07,.14,.47,.93]){
      const origin=new THREE.Vector3(250,0,-500),frame:Frame={start:[263,517],tangent:[.6,.8],outward:[.8,-.6],structId:'qualified-wetland-shrub',tileId:'1_2'},batch=new Batch(origin,level);
      wetMarginFlowers(batch,frame,32,seed);const result=batch.finish();expect(result.triangles).toBe(level===0?273:96);expect(result.group.children.length).toBeLessThanOrEqual(5);
      result.group.traverse(o=>{if(!(o instanceof THREE.Mesh))return;const p=o.geometry.getAttribute('position'),n=o.geometry.getAttribute('normal');
        for(let i=0;i<p.count;i+=3){const a=new THREE.Vector3().fromBufferAttribute(p,i),b=new THREE.Vector3().fromBufferAttribute(p,i+1),c=new THREE.Vector3().fromBufferAttribute(p,i+2),normal=new THREE.Vector3().fromBufferAttribute(n,i),cross=b.clone().sub(a).cross(c.clone().sub(a));expect([...a,...b,...c,...normal].every(Number.isFinite)).toBe(true);expect(cross.length()).toBeGreaterThan(1e-8);expect(cross.dot(normal)).toBeGreaterThan(0);
          for(const q of[a,b,c]){expect(Math.hypot(q.x+origin.x-frame.start[0],-q.z-origin.z-frame.start[1])).toBeLessThan(.56);expect(q.y).toBeGreaterThanOrEqual(31.99999);expect(q.y).toBeLessThan(33.756);}
        }
        for(const m of Array.isArray(o.material)?o.material:[o.material]){expect((m as THREE.MeshStandardMaterial).map).toBeNull();m.dispose();}o.geometry.dispose();
      });
    }
  });
  it('does not emit new geometry for invalid patch input',()=>{
    const batch=new Batch(new THREE.Vector3(),0),frame:Frame={start:[0,0],tangent:[1,0],outward:[0,-1],structId:'invalid',tileId:'0_0'};
    wetMarginFlowers(batch,frame,NaN,.1);wetMarginFlowers(batch,frame,0,1);expect(batch.finish().triangles).toBe(0);
  });
});
