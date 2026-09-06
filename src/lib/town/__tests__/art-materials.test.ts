// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { applyArtMaterial, removeArtMaterial, treeArtColor } from '../art-materials';

const material = (name: string, color: [number,number,number] = [0.66,0.68,0.64]) => {
  const m = new THREE.MeshStandardMaterial(); m.name = name; m.color.setRGB(...color); return m;
};
const compile = (m: THREE.MeshStandardMaterial) => {
  const source = THREE.ShaderLib.standard;
  const shader = { vertexShader: source.vertexShader, fragmentShader: source.fragmentShader, uniforms: THREE.UniformsUtils.clone(source.uniforms) };
  m.onBeforeCompile(shader as Parameters<THREE.Material['onBeforeCompile']>[0], {} as THREE.WebGLRenderer);
  return shader;
};

describe('Scoped late-summer materials', () => {
  it('uses a coherent sRGB paint palette while retaining maps, UV transforms and source provenance', () => {
    const m = material('V2 inferred | siding');
    const map = new THREE.Texture(), normal = new THREE.Texture(); map.repeat.set(3,7); map.offset.set(0.2,0.4);
    m.map = map; m.normalMap = normal;
    applyArtMaterial(m);
    expect(m.color.getHexString()).toBe('a0ad96');
    expect(m.map).toBe(map); expect(m.normalMap).toBe(normal);
    expect(map.repeat.toArray()).toEqual([3,7]); expect(map.offset.toArray()).toEqual([0.2,0.4]);
    expect(m.userData.townArt.sourceColor).toEqual([0.66,0.68,0.64]);
    expect(m.color.g).toBeLessThan(0.5);
  });

  it('does not change terrain, observed landmarks, photo references, road markings or unrelated materials', () => {
    for (const name of ['Reference | church red brick','Town Hall | pale painted trim','Photo home | blue clapboard','Realism aerial viewport 512 | ground_342.jpg','Drive road | chalk white paint','Unrelated']) {
      const m = material(name), before = m.toJSON(), callback = m.onBeforeCompile;
      applyArtMaterial(m);
      expect(m.toJSON()).toEqual(before); expect(m.onBeforeCompile).toBe(callback);
    }
  });

  it('corrects box-smoothed sidewalk shading without changing other flat-shading states', () => {
    for (const name of ['Streetscape | warm sidewalk concrete','Streetscape | cool sidewalk concrete','Streetscape | repaired sidewalk concrete','Streetscape | granite curb']) {
      const m = material(name); applyArtMaterial(m); expect(m.flatShading).toBe(true); expect(m.roughness).toBeGreaterThan(0.95);
    }
    const roof = material('V2 inferred | roof'); applyArtMaterial(roof); expect(roof.flatShading).toBe(false);
  });

  it('chains prior shader hooks and keeps stage order, alpha test and instancing intact', () => {
    const m = material('Inferred deciduous leaf clusters'); m.alphaTest = 0.38; m.side = THREE.DoubleSide;
    const previous = vi.fn((shader: { fragmentShader: string }) => { shader.fragmentShader = '// earlier hook\n'+shader.fragmentShader; });
    m.onBeforeCompile = previous; m.customProgramCacheKey = () => 'prior'; applyArtMaterial(m);
    const shader = compile(m);
    expect(previous).toHaveBeenCalledOnce(); expect(m.customProgramCacheKey()).toBe('prior|webster-art-material-v1:leaf');
    expect(shader.vertexShader).toContain('townArtPosition = instanceMatrix * townArtPosition');
    expect(shader.fragmentShader).toContain('// earlier hook');
    expect(shader.fragmentShader).toContain('#include <alphatest_fragment>');
    expect(shader.fragmentShader.indexOf('outgoingLight +=')).toBeGreaterThan(shader.fragmentShader.indexOf('vec3 outgoingLight ='));
    expect(shader.fragmentShader.indexOf('outgoingLight +=')).toBeLessThan(shader.fragmentShader.indexOf('#include <opaque_fragment>'));
    expect(m.alphaTest).toBe(0.38); expect(m.side).toBe(THREE.DoubleSide);
  });

  it('keeps roof variation continuous across differing architectural UV families', () => {
    const m = material('V2 inferred | roof'); m.map = new THREE.Texture(); applyArtMaterial(m);
    const shader = compile(m);
    expect(shader.fragmentShader).toContain('townArtNoise(vTownArtWorld.xz*0.035)');
    expect(shader.fragmentShader).not.toContain('townRoofOrigin');
    expect(shader.fragmentShader).not.toContain('vMapUv');
  });

  it('adds bounded mineral detail after existing normal mapping without replacing diffuse images', () => {
    const m = material('Drive road | asphalt'); m.map = new THREE.Texture(); applyArtMaterial(m);
    const shader = compile(m);
    expect(shader.fragmentShader).toContain('townArtHeight');
    expect(shader.fragmentShader.indexOf('vec3 townArtDx')).toBeGreaterThan(shader.fragmentShader.indexOf('#include <normal_fragment_maps>'));
    expect(shader.fragmentShader).toContain('smoothstep(0.02,0.10,townArtFootprint)');
    expect(shader.fragmentShader.match(/#include <map_fragment>/g)).toHaveLength(1);
    expect(m.map).not.toBeNull();
  });

  it('neutralizes asphalt reflectance after diffuse decoding while retaining aggregate maps and material boundaries', () => {
    const road = material('Drive road | asphalt'), map = new THREE.Texture(); road.map = map;
    applyArtMaterial(road);
    const shader = compile(road);
    expect(road.color.toArray()).toEqual([0.5,0.5,0.5]);
    expect(road.map).toBe(map);
    expect(shader.fragmentShader.indexOf('float townAsphaltValue')).toBeGreaterThan(shader.fragmentShader.indexOf('#include <map_fragment>'));
    expect(shader.fragmentShader).toContain('vec3(townAsphaltValue)*vec3(0.94,1.0,1.07),0.96)');
    expect(shader.fragmentShader).not.toContain('sRGBToLinear');
    for (const name of ['V2 inferred | siding','Streetscape | granite curb','Drive road | weathered shoulder']) {
      const other = material(name); applyArtMaterial(other);
      expect(compile(other).fragmentShader).not.toContain('townAsphaltValue');
    }
  });

  it('is idempotent and restores original ownership without disposing shared resources', () => {
    const m = material('Streetscape | granite curb'); m.map = new THREE.Texture();
    const textureDispose = vi.spyOn(m.map,'dispose'), materialDispose = vi.spyOn(m,'dispose');
    const before = {color:m.color.toArray(),normal:m.normalScale.toArray(),roughness:m.roughness,flat:m.flatShading,compile:m.onBeforeCompile,key:m.customProgramCacheKey};
    applyArtMaterial(m); const color=m.color.toArray(), callback=m.onBeforeCompile;
    applyArtMaterial(m); expect(m.color.toArray()).toEqual(color); expect(m.onBeforeCompile).toBe(callback);
    removeArtMaterial(m); removeArtMaterial(m);
    expect(m.color.toArray()).toEqual(before.color); expect(m.normalScale.toArray()).toEqual(before.normal);
    expect(m.roughness).toBe(before.roughness); expect(m.flatShading).toBe(before.flat);
    expect(m.onBeforeCompile).toBe(before.compile); expect(m.customProgramCacheKey).toBe(before.key);
    expect(textureDispose).not.toHaveBeenCalled(); expect(materialDispose).not.toHaveBeenCalled();
  });

  it('reuses a supplied crown color and varies deterministically without changing LOD or tile coordinates', () => {
    const target = new THREE.Color(), a=treeArtColor(-2100.25,1760.75,target).toArray();
    expect(treeArtColor(-2100.25,1760.75,target)).toBe(target);
    expect(target.toArray()).toEqual(a);
    expect(treeArtColor(-2250+149.75,1750+10.75,target).toArray()).toEqual(a);
    expect(treeArtColor(-2073.5,1778,target).toArray()).not.toEqual(a);
    for (const v of target.toArray()) expect(v).toBeGreaterThan(0.8);
    for (const v of target.toArray()) expect(v).toBeLessThan(1.2);
    expect(treeArtColor(NaN,1,target).toArray()).toEqual([1,1,1]);
  });
});
