// @vitest-environment node
import {describe,expect,it} from 'vitest';
import * as THREE from 'three';
import {applyArtMaterial} from '../art-materials';
import {applyInventoryRoadAppearance} from '../road-inventory-material';
function compile(code:1|2|5){const m=new THREE.MeshStandardMaterial();m.name='Drive road | asphalt';m.map=new THREE.Texture();applyArtMaterial(m);applyInventoryRoadAppearance(m,code);const s=THREE.ShaderLib.standard,shader={vertexShader:s.vertexShader,fragmentShader:s.fragmentShader,uniforms:THREE.UniformsUtils.clone(s.uniforms)};m.onBeforeCompile(shader as Parameters<THREE.Material['onBeforeCompile']>[0],{}as THREE.WebGLRenderer);return{m,shader};}
describe('inventory gravel appearance',()=>{
 it('adds filtered stones after the base grain without overwriting either contribution',()=>{
  const{m,shader}=compile(2),fragment=shader.fragmentShader;
  expect(m.map).not.toBeNull();expect(m.opacity).toBe(1);
  expect(fragment).toContain('vTownArtWorld.xz*22.0');expect(fragment).toContain('smoothstep(.006,.045,townArtFootprint)');
  const base=fragment.indexOf('townArtHeight = (townStoneGrain-0.5)*0.0015*townMineralResolved;');
  const stones=fragment.indexOf('townArtHeight+=townGravelStone*.0013*townGravelResolved;');
  expect(base).toBeGreaterThan(fragment.indexOf('#include <map_fragment>'));
  expect(stones).toBeGreaterThan(base);
  expect(fragment.slice(stones)).not.toMatch(/\btownArtHeight\s*=(?!=)/);
  expect(fragment.indexOf('vec2 townArtHeightGradient')).toBeGreaterThan(stones);
  expect(fragment).toContain('0.115,0.117,0.102');expect(fragment).not.toContain('sRGBToLinear');expect(shader.vertexShader).not.toContain('townGravel');
  expect(m.customProgramCacheKey()).toContain('inventory-surface-v3:2');m.map!.dispose();m.dispose();
 });
 it('keeps earth, gravel and chip-seal as distinct explicit programs with separate versioned keys',()=>{
  const keys=new Set<string>(),programs=new Set<string>();
  for(const[code,family,frequency]of[[1,'earth',18],[2,'gravel',45],[5,'chip-seal',75]]as const){
   const{m,shader}=compile(code),fragment=shader.fragmentShader;
   expect(fragment).toContain(`Webster mineral family: ${family}`);
   expect(fragment).toContain(`vTownArtWorld.xz*${frequency}.0`);
   expect(fragment).not.toContain('Webster mineral family: asphalt');
   expect(fragment.includes('townGravelStone')).toBe(code===2);
   expect(m.customProgramCacheKey()).toContain(`inventory-surface-v3:${code}`);
   expect(fragment.includes('townInventoryVariation')).toBe(code!==5);
   if(code===1)expect(fragment).toContain('0.185,0.131,0.080');
   else if(code===5)expect(fragment).toContain('townAsphaltValue');
   keys.add(m.customProgramCacheKey());programs.add(fragment);m.map!.dispose();m.dispose();
  }
  expect(keys.size).toBe(3);expect(programs.size).toBe(3);
 });
});
