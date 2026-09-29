// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { CinematicRenderer } from '../cinematic';

describe('cinematic startup scene compilation', () => {
  it.each([false, true])('uses the real HDR target and restores the prior target when failure is %s', failure => {
    const original = new THREE.WebGLRenderTarget(2, 2), hdr = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType });
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(), materials = new Set([new THREE.MeshStandardMaterial()]);
    let target = original;
    const renderer = {
      getRenderTarget: () => target, getActiveCubeFace: () => 2, getActiveMipmapLevel: () => 1,
      setRenderTarget: vi.fn((value: THREE.WebGLRenderTarget) => { target = value; }),
      compile: vi.fn((compiledScene: THREE.Scene, compiledCamera: THREE.Camera) => {
        expect(target).toBe(hdr); expect(compiledScene).toBe(scene); expect(compiledCamera).toBe(camera);
        if (failure) throw new Error('compile failed');
        return materials;
      }),
    };
    const finish = Object.assign(Object.create(CinematicRenderer.prototype), { renderer, scene, camera, composer: { inputBuffer: hdr }, disposed: false }) as CinematicRenderer;
    if (failure) expect(() => finish.compile()).toThrow('compile failed');
    else expect(finish.compile()).toBe(materials);
    expect(target).toBe(original); expect(renderer.setRenderTarget).toHaveBeenLastCalledWith(original, 2, 1);
    original.dispose(); hdr.dispose(); materials.forEach(material => material.dispose());
  });
});
