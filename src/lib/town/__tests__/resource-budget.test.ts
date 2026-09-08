// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { ByteCache, estimateRetainedBytes } from '../byte-cache';
import { TextureLifetime } from '../texture-lifetime';
import { materialIdentity, textureIdentity } from '../material-identity';

describe('decoded retention and renderer ownership', () => {
  it('evicts LRU by bytes, keeps recently touched rows, and never retains an oversized packet', () => {
    const cache = new ByteCache<string>(100, 64); cache.set('a', 'a', 40); cache.set('b', 'b', 40); cache.get('a'); cache.set('c', 'c', 40);
    expect(cache.get('b')).toBeUndefined(); expect(cache.get('a')).toBe('a'); expect(cache.bytes).toBe(80);
    cache.set('huge', 'huge', 101); expect(cache.size).toBe(2); expect(cache.bytes).toBe(80);
    cache.maxBytes = 40; cache.trim(); expect(cache.bytes).toBe(40); cache.clear(); expect(cache.bytes).toBe(0);
    expect(estimateRetainedBytes({ values: [1, 2, 3], encoded: 'abcd' })).toBeGreaterThan(40);
  });
  it('closes a shared decoded bitmap after the final distinct Texture owner only', () => {
    const bitmap = { width: 2, height: 2, close: vi.fn() }, a = new THREE.Texture(bitmap), b = new THREE.Texture(bitmap), lifetime = new TextureLifetime();
    lifetime.register(a); lifetime.register(b); lifetime.register(b); lifetime.release(a); expect(bitmap.close).not.toHaveBeenCalled();
    lifetime.release(b); lifetime.release(b); expect(bitmap.close).toHaveBeenCalledOnce();
  });
  it('does not pool incompatible render states, shader programs or normal scales', () => {
    const a = new THREE.MeshStandardMaterial(), b = a.clone(); expect(materialIdentity(a, [])).toBe(materialIdentity(b, []));
    b.normalScale.set(2, 1); expect(materialIdentity(a, [])).not.toBe(materialIdentity(b, [])); b.normalScale.copy(a.normalScale);
    b.depthWrite = false; expect(materialIdentity(a, [])).not.toBe(materialIdentity(b, [])); b.depthWrite = a.depthWrite;
    b.customProgramCacheKey = () => 'different shader'; expect(materialIdentity(a, [])).not.toBe(materialIdentity(b, []));
  });
  it('does not merge unrelated unnamed generated atlases but shares a documented identical source', () => {
    const a = new THREE.Texture(), b = new THREE.Texture(); expect(textureIdentity(a)).not.toBe(textureIdentity(b));
    a.userData.sourceUrl = b.userData.sourceUrl = 'atlas-v1'; expect(textureIdentity(a)).toBe(textureIdentity(b));
    b.minFilter = THREE.NearestFilter; expect(textureIdentity(a)).not.toBe(textureIdentity(b));
  });
});
