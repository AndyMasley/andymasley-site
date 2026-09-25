// @vitest-environment node
import {describe,expect,it} from 'vitest';
import * as THREE from 'three';
import {applyArtMaterial} from '../art-materials';
import {applyInventoryRoadAppearance} from '../road-inventory-material';
import {MINERAL_FINISH} from '../mineral-finish';
function compile(code:1|2|5){const m=new THREE.MeshStandardMaterial();m.name='Drive road | asphalt';m.map=new THREE.Texture();applyArtMaterial(m);applyInventoryRoadAppearance(m,code);const s=THREE.ShaderLib.standard,shader={vertexShader:s.vertexShader,fragmentShader:s.fragmentShader,uniforms:THREE.UniformsUtils.clone(s.uniforms)};m.onBeforeCompile(shader as Parameters<THREE.Material['onBeforeCompile']>[0],{}as THREE.WebGLRenderer);return{m,shader};}
describe('inventory gravel appearance',()=>{
 it('adds filtered stones after the base grain without overwriting either contribution',()=>{
  const{m,shader}=compile(2),fragment=shader.fragmentShader;
  expect(m.map).not.toBeNull();expect(m.opacity).toBe(1);
  expect(fragment).toContain('vTownArtWorld.xz*22.0');expect(fragment).toContain('smoothstep(.006,.045,townArtFootprint)');
  const spec=MINERAL_FINISH.gravel;
  const fine=fragment.indexOf('float townFineValue = (townStoneGrain-0.5)*townMineralResolved;');
  const aggregate=fragment.indexOf('float townAggregateValue = (townStoneAggregate-0.5)*townAggregateResolved;');
  const base=fragment.indexOf(`townArtHeight = townFineValue*${spec.relief}+townAggregateValue*${spec.aggregateRelief};`);
  const stones=fragment.indexOf('townArtHeight+=townGravelStone*.0013*townGravelResolved;');
  expect(fine).toBeGreaterThan(fragment.indexOf('#include <map_fragment>'));
  expect(aggregate).toBeGreaterThan(fragment.indexOf('#include <map_fragment>'));
  expect(base).toBeGreaterThan(fine);expect(base).toBeGreaterThan(aggregate);
  expect(fragment).toContain('townArtClose * (1.0-smoothstep(0.006,0.045,townArtFootprint))');
  expect(fragment).toContain('townArtClose * (1.0-smoothstep(0.25,1.05,townArtFootprint*12.0))');
  expect(fragment.match(/townArtNoise\(/g)).toHaveLength(12); // Declaration, three shared mineral reads and eight lane-wear reads (road-wear.ts).
  expect(stones).toBeGreaterThan(base);
  expect(fragment.slice(stones)).not.toMatch(/\btownArtHeight\s*=(?!=)/);
  expect(fragment.indexOf('vec2 townArtHeightGradient')).toBeGreaterThan(stones);
  expect(fragment).toContain('smoothstep(.14,.25,dot(townGravelF,townGravelF))');
  expect(fragment).toContain('townGravelRadius))*townGravelSupport');
  expect(fragment).toContain('townGravelStone*(.20+(townGravelSeed-.5)*.13)');
  expect(fragment).not.toContain('(townGravelStone-.54)*.20+(townGravelSeed-.5)*.13');
  expect(fragment).toContain('mix(length(townGravelShape),max(townGravelShape.x,townGravelShape.y),.38)');
  expect(fragment).toContain('0.115,0.117,0.102');expect(fragment).not.toContain('sRGBToLinear');expect(shader.vertexShader).not.toContain('townGravel');
  expect(m.customProgramCacheKey()).toContain('inventory-surface-v4:2');m.map!.dispose();m.dispose();
 });
 it('joins neighboring gravel cells without a color or relief step at every pixel scale',()=>{
  const smooth=(a:number,b:number,x:number)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
  const evaluate=(x:number,y:number,seed:number,pixel:number)=>{
   const support=1-smooth(.14,.25,x*x+y*y),resolved=1-smooth(.006,.045,pixel);
   // Regardless of each cell's rotated stone shape, its value lies in [0,1].
   // Check the extreme opposite neighbor shapes/seeds as a conservative bound.
   const stone=seed*support;
   return{color:1+(stone*(.20+(seed-.5)*.13)-.065)*resolved,height:stone*.0013*resolved};
  };
  for(const pixel of[.0001,.003,.012,.03,.06])for(const side of[-1,1])for(const offset of[-.5,-.3,0,.3,.5]){
   const left=evaluate(side*.5,offset,0,pixel),right=evaluate(-side*.5,offset,1,pixel);
   expect(left).toEqual(right);
   const inner=evaluate(side*(.5-1e-5),offset,1,pixel);
   expect(Math.abs(inner.color-left.color)).toBeLessThan(1e-7);expect(Math.abs(inner.height-left.height)).toBeLessThan(1e-9);
  }
 });
 it('keeps earth, gravel and chip-seal as distinct explicit programs with separate versioned keys',()=>{
  const keys=new Set<string>(),programs=new Set<string>();
  for(const[code,family,frequency]of[[1,'earth',18],[2,'gravel',45],[5,'chip-seal',75]]as const){
   const{m,shader}=compile(code),fragment=shader.fragmentShader;
   expect(fragment).toContain(`Webster mineral family: ${family}`);
   expect(fragment).toContain(`vTownArtWorld.xz*${frequency}.0`);
   expect(fragment).not.toContain('Webster mineral family: asphalt');
   expect(fragment.includes('townGravelStone')).toBe(code===2);
   expect(m.customProgramCacheKey()).toContain(`inventory-surface-v4:${code}`);
   expect(fragment.includes('townInventoryVariation')).toBe(code!==5);
   if(code===1)expect(fragment).toContain('0.185,0.131,0.080');
   else if(code===5)expect(fragment).toContain('townAsphaltValue');
   keys.add(m.customProgramCacheKey());programs.add(fragment);m.map!.dispose();m.dispose();
  }
  expect(keys.size).toBe(3);expect(programs.size).toBe(3);
 });
});
