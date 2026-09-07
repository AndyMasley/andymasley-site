// @vitest-environment node
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { applyArtMaterial, removeArtMaterial } from '../art-materials';
import { applyInventoryRoadAppearance } from '../road-inventory-material';

function shader(material:THREE.MeshStandardMaterial) {
  const result = { vertexShader:THREE.ShaderLib.standard.vertexShader, fragmentShader:THREE.ShaderLib.standard.fragmentShader, uniforms:{} };
  material.onBeforeCompile(result as Parameters<THREE.Material['onBeforeCompile']>[0], {} as THREE.WebGLRenderer);
  return result;
}

describe('Inventory road appearance', () => {
  it.each([1,2,5] as const)('preserves class %s through the actual art shader without changing shared maps', code => {
    const original = new THREE.MeshStandardMaterial({map:new THREE.Texture(),normalMap:new THREE.Texture()});
    original.name='Drive road | asphalt';
    const originalColor=original.color.clone(), originalCompile=original.onBeforeCompile;
    const variant=original.clone();applyArtMaterial(variant);applyInventoryRoadAppearance(variant,code);
    const compiled=shader(variant),registered=variant.onBeforeCompile,key=variant.customProgramCacheKey();
    expect(compiled.fragmentShader.includes('diffuseColor.rgb = mix(diffuseColor.rgb,vec3(townAsphaltValue)')).toBe(code===5);
    expect(compiled.fragmentShader.includes('townInventoryVariation')).toBe(code!==5);
    expect(compiled.fragmentShader).toContain(code===1?'vec3(0.185,0.131,0.080)':code===2?'vec3(0.235,0.234,0.206)':'vTownArtWorld.xz*29.0');
    expect(compiled.fragmentShader).toContain('townArtClose');
    expect(compiled.fragmentShader).toContain('(townStoneGrain-0.5)*'+(code===2?'0.0015':'0.0008'));
    expect(compiled.fragmentShader.match(/#include <map_fragment>/g)).toHaveLength(1);
    expect(variant.map).toBe(original.map);expect(variant.normalMap).toBe(original.normalMap);
    applyArtMaterial(variant);expect(variant.onBeforeCompile).toBe(registered);expect(variant.customProgramCacheKey()).toBe(key);
    expect(original.color).toEqual(originalColor);expect(original.onBeforeCompile).toBe(originalCompile);
    removeArtMaterial(variant);expect(variant.onBeforeCompile).toBe(originalCompile);
    variant.dispose();original.map!.dispose();original.normalMap!.dispose();original.dispose();
  });

  it('leaves the ordinary asphalt shader and tone unchanged', () => {
    const asphalt=new THREE.MeshStandardMaterial();asphalt.name='Drive road | asphalt';applyArtMaterial(asphalt);
    const before=shader(asphalt),key=asphalt.customProgramCacheKey(),color=asphalt.color.clone();
    const separate=new THREE.MeshStandardMaterial();separate.name='Drive road | asphalt';applyArtMaterial(separate);applyInventoryRoadAppearance(separate,2);
    expect(shader(asphalt)).toEqual(before);expect(asphalt.customProgramCacheKey()).toBe(key);expect(asphalt.color).toEqual(color);
    expect(before.fragmentShader).toContain('vTownArtWorld.xz*37.0');expect(before.fragmentShader).toContain('0.00055');
    separate.dispose();asphalt.dispose();
  });
});
