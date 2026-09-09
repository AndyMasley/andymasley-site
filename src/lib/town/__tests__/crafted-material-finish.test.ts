// @vitest-environment node
import {describe,it,expect} from 'vitest';
import * as THREE from 'three';
import {frontageMaterial} from '../crafted-frontages';
function compile(m:THREE.Material){const s=THREE.ShaderLib.standard,shader={vertexShader:s.vertexShader,fragmentShader:s.fragmentShader,uniforms:THREE.UniformsUtils.clone(s.uniforms)};m.onBeforeCompile(shader as Parameters<THREE.Material['onBeforeCompile']>[0],{} as THREE.WebGLRenderer);return shader;}
describe('crafted facade material continuity',()=>{
 it('adds filtered irregular grain to ground colors without reclassifying walks, hardstanding or earth beds',()=>{
  for(const color of ['#aaa697','#656966','#625546']){
   const m=frontageMaterial('paving',color),shader=compile(m);
   expect(m.color.getHexString()).toBe(color.slice(1));expect(m.userData.surfaceRole).toBe('paving');expect(m.map).toBeNull();expect(m.normalMap).toBeNull();expect(m.roughness).toBe(.87);
   expect(shader.fragmentShader).toContain('craftedPavingFootprint=max(length(dFdx(vCraftedWorld)),length(dFdy(vCraftedWorld)))');
   expect(shader.fragmentShader).toContain('craftedPavingResolved=1.0-smoothstep(.002,.012,craftedPavingFootprint)');
   expect(shader.fragmentShader).toContain('craftedRelief=(craftedPavingGrain-.5)*.0007*craftedPavingResolved*craftedNear');
   expect(shader.fragmentShader).not.toContain('float craftedNoise = sin(');
   expect(shader.fragmentShader.match(/#include <map_fragment>/g)).toHaveLength(1);expect(shader.fragmentShader.match(/#include <normal_fragment_maps>/g)).toHaveLength(1);
   expect(Object.keys(shader.uniforms)).toEqual(Object.keys(THREE.ShaderLib.standard.uniforms));
   expect(m.customProgramCacheKey()).toBe('crafted-frontages-v4:paving');m.dispose();
  }
 });
 it('keeps non-ground finishes and their program identities outside the ground change',()=>{
  for(const role of ['wall','roof','brick','stone','foundation','leaf','shingle','stucco'] as const){
   const m=frontageMaterial(role,'#956b54'),shader=compile(m);
   expect(shader.fragmentShader).not.toContain('craftedGroundNoise');expect(shader.fragmentShader).not.toContain('craftedPaving');
   expect(shader.fragmentShader).toContain('float craftedNoise = sin(vCraftedWorld.x*4.41+vCraftedWorld.z*2.35)*sin(vCraftedWorld.z*7.63-vCraftedWorld.x*1.14)');
   expect(m.customProgramCacheKey()).toBe(`crafted-frontages-v3:${role}`);expect(m.color.getHexString()).toBe('956b54');m.dispose();
  }
 });
 it('uses stable interpolated world normals for masonry orientation rather than differentiated large coordinates',()=>{for(const role of ['brick','stone','roof','shingle'] as const){const m=frontageMaterial(role,'#956b54'),shader=compile(m);expect(shader.vertexShader).toContain('inverseTransformDirection(transformedNormal,viewMatrix)');expect(shader.fragmentShader).toContain('normalize(vCraftedWorldNormal)');expect(shader.fragmentShader).not.toContain('cross(dFdx(vCraftedWorld),dFdy(vCraftedWorld))');expect(shader.fragmentShader.match(/#include <map_fragment>/g)).toHaveLength(1);expect(shader.fragmentShader.match(/#include <normal_fragment_maps>/g)).toHaveLength(1);expect(shader.vertexShader.indexOf('vCraftedWorldNormal =')).toBeGreaterThan(shader.vertexShader.indexOf('#include <defaultnormal_vertex>'));m.dispose();}});
 it('retains authored glass hues and dielectric reflections while reducing only the diffuse interior',()=>{
  for(const color of ['#3b545b','#506575']){
   const m=frontageMaterial('glass',color),shader=compile(m);
   expect(m.color.getHexString()).toBe(color.slice(1));expect(m.map).toBeNull();expect(m.envMapIntensity).toBe(.85);expect(m.roughness).toBe(.14);expect(m.metalness).toBe(0);
   expect(shader.fragmentShader.indexOf('outgoingLight -= totalDiffuse')).toBeGreaterThan(shader.fragmentShader.indexOf('vec3 outgoingLight ='));
   expect(shader.fragmentShader.match(/#include <opaque_fragment>/g)).toHaveLength(1);expect(shader.fragmentShader).not.toContain('craftedGlassFresnel');
   expect(shader.fragmentShader).not.toContain('outgoingLight +=');m.dispose();
  }
 });
});
