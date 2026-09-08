// @vitest-environment node
import {describe,expect,it} from 'vitest';
import * as THREE from 'three';
import {applyArtMaterial} from '../art-materials';
import {applyInventoryRoadAppearance} from '../road-inventory-material';
function compile(code:1|2|5){const m=new THREE.MeshStandardMaterial();m.name='Drive road | asphalt';m.map=new THREE.Texture();applyArtMaterial(m);applyInventoryRoadAppearance(m,code);const s=THREE.ShaderLib.standard,shader={vertexShader:s.vertexShader,fragmentShader:s.fragmentShader,uniforms:THREE.UniformsUtils.clone(s.uniforms)};m.onBeforeCompile(shader as Parameters<THREE.Material['onBeforeCompile']>[0],{}as THREE.WebGLRenderer);return{m,shader};}
describe('inventory gravel appearance',()=>{
 it('adds only gravel aggregate at physical scale after diffuse decoding, preserving texture and opacity',()=>{const{m,shader}=compile(2);expect(m.map).not.toBeNull();expect(m.opacity).toBe(1);expect(shader.fragmentShader).toContain('vTownArtWorld.xz*22.0');expect(shader.fragmentShader).toContain('smoothstep(.006,.045,townArtFootprint)');expect(shader.fragmentShader).toContain('townArtHeight+=townGravelStone');expect(shader.fragmentShader).toContain('townArtHeight += (townStoneGrain-0.5)');expect(shader.fragmentShader).toContain('0.115,0.117,0.102');expect(shader.fragmentShader).not.toContain('sRGBToLinear');expect(shader.vertexShader).not.toContain('townGravel');expect(m.customProgramCacheKey()).toContain('inventory-surface-v2:2');});
 it('retains the existing earth and surface-treated programs',()=>{for(const code of[1,5]as const){const{m,shader}=compile(code);expect(shader.fragmentShader).not.toContain('townGravel');expect(m.customProgramCacheKey()).toContain(`inventory-surface-v1:${code}`);if(code===1)expect(shader.fragmentShader).toContain('0.185,0.131,0.080');else expect(shader.fragmentShader).toContain('townAsphaltValue');}});
});
