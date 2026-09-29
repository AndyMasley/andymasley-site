// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { applyArtMaterial, removeArtMaterial } from '../art-materials';
import { frontageMaterial } from '../crafted-frontages';
import { GLASS_NORMAL_GLSL, OPENING_ATTRIBUTE, WINDOW_INTERIOR_GLSL, installOpeningMaterial, prepareOpenings } from '../opening-detail';

const compile = (material: THREE.MeshStandardMaterial) => {
  const source = THREE.ShaderLib.standard;
  const shader = { vertexShader: source.vertexShader, fragmentShader: source.fragmentShader, uniforms: THREE.UniformsUtils.clone(source.uniforms) };
  material.onBeforeCompile(shader as Parameters<THREE.Material['onBeforeCompile']>[0], {} as THREE.WebGLRenderer);
  return shader;
};

describe('view-dependent architectural glazing', () => {
  it('shares glass optics across crafted and pooled panes before lighting, without new samples or render resources', () => {
    const crafted = frontageMaterial('glass', '#344c50'), pooled = new THREE.MeshStandardMaterial(); pooled.name = 'V2 inferred | glass';
    const normalMap = new THREE.Texture(); crafted.normalMap = normalMap;
    const sourceColor = crafted.color.toArray(), sourceHook = pooled.onBeforeCompile;
    applyArtMaterial(pooled);
    for (const material of [crafted, pooled]) {
      const shader = compile(material), before = material.onBeforeCompile;
      if (material === crafted) installOpeningMaterial(material, 'glass'); else applyArtMaterial(material);
      expect(material.onBeforeCompile).toBe(before);
      expect(shader.fragmentShader.split('vec3 townGlassN =')).toHaveLength(2);
      expect(shader.fragmentShader.indexOf('vec3 townGlassN =')).toBeLessThan(shader.fragmentShader.indexOf('#include <lights_physical_fragment>'));
      expect(shader.fragmentShader.indexOf('float townFresnel =')).toBeGreaterThan(shader.fragmentShader.indexOf('vec3 outgoingLight ='));
      expect(shader.fragmentShader).toContain('vec2 townReveal = townPane + townRay.xy / townRay.z');
      expect(material.transparent).toBe(false); expect(material.depthWrite).toBe(true);
      expect(material.customProgramCacheKey()).toContain(material === crafted ? 'opening-glass-v2' : 'interior-rooms-v2');
      expect(GLASS_NORMAL_GLSL + WINDOW_INTERIOR_GLSL).not.toMatch(/texture2D|textureCube|sampler|discard|gl_FragCoord|townArtTime/);
    }
    expect(crafted.normalMap).toBe(normalMap); expect(crafted.color.toArray()).toEqual(sourceColor);
    const disposal = vi.spyOn(normalMap, 'dispose');
    removeArtMaterial(pooled); expect(pooled.onBeforeCompile).toBe(sourceHook);
    crafted.dispose(); pooled.dispose(); expect(disposal).not.toHaveBeenCalled(); normalMap.dispose();
  });

  it('keeps dielectric reflection bounded and monotonic from face-on to grazing views', () => {
    // Evaluate the actual scalar shader statements rather than a second copy
    // of the Fresnel formula that could drift away from the rendered surface.
    const statements = WINDOW_INTERIOR_GLSL.match(/float townSingleFresnel =[^;]+;\s*float townFresnel =[^;]+;/)![0]
      .replaceAll('float ', 'const ').replaceAll('pow(', 'Math.pow(');
    const reflectance = new Function('townGlassCos', `${statements} return townFresnel;`) as (cos: number) => number;
    expect(reflectance(1)).toBeCloseTo(.076923, 5); expect(reflectance(0)).toBe(1);
    let previous = 0;
    for (let angle = 0; angle <= 90; angle++) {
      const reflection = reflectance(Math.cos(angle * Math.PI / 180));
      expect(reflection).toBeGreaterThanOrEqual(previous); expect(reflection).toBeLessThanOrEqual(1);
      expect(1 - reflection).toBeGreaterThanOrEqual(0); previous = reflection;
    }
  });

  it('identifies broad display panes without applying their clear-room treatment to ordinary sash windows', () => {
    const assignment = WINDOW_INTERIOR_GLSL.match(/float townStore =[^;]+;/)![0].replace('float ', 'const ');
    const display = new Function('townPaneSize', 'step', `${assignment} return townStore;`) as (size: { x: number; y: number }, step: (a: number, b: number) => number) => number;
    const step = (edge: number, value: number) => Number(value >= edge);
    for (const [width, height] of [[3.2, 2.35], [1.8, 2.0], [4.8, 3.5]]) expect(display({ x: width, y: height }, step)).toBe(1);
    for (const [width, height] of [[.9, 1.4], [1.48, 2.2], [2.4, 1.25]]) expect(display({ x: width, y: height }, step)).toBe(0);
    expect(WINDOW_INTERIOR_GLSL).toContain('if (townStore < .5 && townTreatment < 0.42)');
    expect(WINDOW_INTERIOR_GLSL).toContain('else if (townStore < .5 && townTreatment < 0.72)');
  });

  it('retains pane coordinates and source vertices across opposite facade orientations, with one existing attribute only', () => {
    for (const angle of [0, .73, Math.PI]) {
      const material = frontageMaterial('glass', '#344c50'), geometry = new THREE.PlaneGeometry(3.2, 2.35).toNonIndexed();
      geometry.rotateY(angle); geometry.translate(13, 8, 5);
      const original = new Float32Array(geometry.getAttribute('position').array), root = new THREE.Group(), mesh = new THREE.Mesh(geometry, material); root.add(mesh);
      const report = prepareOpenings(root, [-3000, 0, 1000]), attribute = geometry.getAttribute(OPENING_ATTRIBUTE);
      expect(report.openings).toBe(1); expect(report.bytes).toBe(original.length / 3 * 16);
      expect(Array.from(geometry.getAttribute('position').array)).toEqual(Array.from(original));
      expect(Math.min(...Array.from({ length: attribute.count }, (_, i) => attribute.getX(i)))).toBeCloseTo(0);
      expect(Math.max(...Array.from({ length: attribute.count }, (_, i) => attribute.getX(i)))).toBeCloseTo(1);
      for (let i = 0; i < attribute.count; i++) { expect(attribute.getZ(i)).toBeCloseTo(3.2, 4); expect(attribute.getW(i)).toBeGreaterThanOrEqual(2.35); expect(attribute.getW(i)).toBeLessThan(2.36); }
      expect(prepareOpenings(root).bytes).toBe(0); expect(root.children).toHaveLength(1);
      geometry.dispose(); material.dispose();
    }
  });

  it('leaves door geometry and its panel shader outside the glass optics', () => {
    const material = frontageMaterial('door', '#594b3b'), shader = compile(material);
    expect(shader.fragmentShader).not.toContain('townGlassBow'); expect(shader.fragmentShader).not.toContain('townReveal');
    expect(shader.fragmentShader).toContain('townDoorW'); expect(material.customProgramCacheKey()).toContain('opening-door-v1');
    material.dispose();
  });
});
