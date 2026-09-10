// @vitest-environment node
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { applyArtMaterial, removeArtMaterial } from '../art-materials';
import { applyInventoryRoadAppearance } from '../road-inventory-material';
import { MINERAL_FINISH } from '../mineral-finish';

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
    expect(compiled.fragmentShader).toContain(code===1?'vec3(0.185,0.131,0.080)':code===2?'vec3(0.115,0.117,0.102)':'vTownArtWorld.xz*75.0');
    if(code===2){expect(compiled.fragmentShader).toContain('vec3(0.245,0.241,0.208)');expect(compiled.fragmentShader).toContain('townGravelResolved');}
    expect(compiled.fragmentShader).toContain('townArtClose');
    const family=code===1?'earth':code===2?'gravel':'chip-seal';
    expect(compiled.fragmentShader).toContain('Webster mineral family: '+family);
    expect(compiled.fragmentShader).not.toContain('Webster mineral family: asphalt');
    const spec=MINERAL_FINISH[family];
    expect(compiled.fragmentShader).toContain('float townFineValue = (townStoneGrain-0.5)*townMineralResolved;');
    expect(compiled.fragmentShader).toContain('float townAggregateValue = (townStoneAggregate-0.5)*townAggregateResolved;');
    expect(compiled.fragmentShader).toContain(`townArtHeight = townFineValue*${spec.relief}+townAggregateValue*${spec.aggregateRelief};`);
    expect(compiled.fragmentShader).toContain(`townArtClose * (1.0-smoothstep(${spec.resolved[0]},${spec.resolved[1]},townArtFootprint))`);
    expect(compiled.fragmentShader).toContain(`townArtClose * (1.0-smoothstep(0.25,1.05,townArtFootprint*${spec.aggregate.toFixed(1)}))`);
    expect(compiled.fragmentShader.match(/townArtNoise\(/g)).toHaveLength(4); // Three shared mineral reads and the function declaration.
    if(code===2){expect(compiled.fragmentShader).toContain('townArtFootprint*22.0');expect(compiled.fragmentShader).not.toContain('fwidth(townGravelRadius)');}
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
    expect(before.fragmentShader).toContain('vTownArtWorld.xz*110.0');expect(before.fragmentShader).toContain('0.00065');
    separate.dispose();asphalt.dispose();
  });
  it('fails visibly if another shader wrapper removes the mineral-family contract', () => {
    const material=new THREE.MeshStandardMaterial();material.name='Drive road | asphalt';applyArtMaterial(material);
    const compile=material.onBeforeCompile;material.onBeforeCompile=(shader,renderer)=>{compile.call(material,shader,renderer);shader.fragmentShader=shader.fragmentShader.replace('// Webster mineral family: asphalt','// missing family');};
    applyInventoryRoadAppearance(material,2);expect(()=>shader(material)).toThrow('mineral shader anchor changed');removeArtMaterial(material);material.dispose();
  });
});
