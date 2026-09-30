import * as THREE from 'three';
import { withLoadDeadline } from './critical-load';

export type LandcoverCatalog = {
  version: number; format: string; sourceManifestSha256: string;
  asset: { url: string; rawUrl: string; compression: string; bytes: number; decodedBytes: number; sha256: string; decodedSha256: string };
  texture: { width: number; height: number; bounds: number[]; colorSpace: string; rowOrder: string };
};
const checksum = async (bytes: ArrayBuffer): Promise<string> => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(value => value.toString(16).padStart(2, '0')).join('');

/** One mipmapped linear reflectance map, shared by the existing terrain draw. */
export class RegionalLandcover {
  texture?: THREE.DataTexture;
  private disposed = false;
  private controller = new AbortController();

  constructor(readonly catalog: LandcoverCatalog) {
    const { asset, texture } = catalog;
    if (catalog.version !== 1 || catalog.format !== 'town-landcover-rgba-v1' || asset.compression !== 'gzip'
      || texture.width !== 2048 || texture.height !== 2048 || asset.decodedBytes !== 16 * 1048576
      || !Number.isSafeInteger(asset.bytes) || asset.bytes < 1 || asset.bytes > 8 * 1048576
      || texture.colorSpace !== 'linear' || texture.rowOrder !== 'north-to-south'
      || JSON.stringify(texture.bounds) !== '[-40020,-40020,40020,40020]'
      || ![catalog.sourceManifestSha256, asset.sha256, asset.decodedSha256].every(value => /^[a-f0-9]{64}$/.test(value))) throw new Error('Invalid regional landcover catalog.');
  }

  async initialize(baseURL: string, signal: AbortSignal): Promise<void> {
    const cancel = () => this.controller.abort();
    signal.addEventListener('abort', cancel, { once: true });
    if (signal.aborted || this.disposed) cancel();
    try {
      await withLoadDeadline(this.controller.signal, async requestSignal => {
        const asset = this.catalog.asset;
        const response = await fetch(new URL(typeof DecompressionStream === 'function' ? asset.url : asset.rawUrl, baseURL), { signal: requestSignal });
        if (!response.ok) throw new Error(`Regional landcover could not load (${response.status}).`);
        const packed = await response.arrayBuffer();
        if (requestSignal.aborted || this.disposed) throw new DOMException('Loading cancelled', 'AbortError');
        let raw = packed;
        if (new Uint8Array(packed)[0] === 31 && new Uint8Array(packed)[1] === 139) {
          if (packed.byteLength !== asset.bytes || await checksum(packed) !== asset.sha256) throw new Error('Regional landcover transport checksum did not match.');
          if (requestSignal.aborted || this.disposed) throw new DOMException('Loading cancelled', 'AbortError');
          const reader = new Blob([packed]).stream().pipeThrough(new DecompressionStream('gzip')).getReader();
          const target = new Uint8Array(asset.decodedBytes); let offset = 0;
          try {
            for (;;) {
              const { value, done } = await reader.read(); if (done) break;
              if (requestSignal.aborted || this.disposed) throw new DOMException('Loading cancelled', 'AbortError');
              if (offset + value.length > target.length) throw new Error('Regional landcover exceeded its decoded size.');
              target.set(value, offset); offset += value.length;
            }
            if (offset !== target.length) throw new Error('Regional landcover was incomplete.');
            raw = target.buffer;
          } finally { void reader.cancel().catch(() => {}); reader.releaseLock(); }
        }
        if (raw.byteLength !== asset.decodedBytes || await checksum(raw) !== asset.decodedSha256) throw new Error('Regional landcover checksum did not match.');
        if (requestSignal.aborted || this.disposed) throw new DOMException('Loading cancelled', 'AbortError');
        this.adopt(raw);
      }, { label: 'Regional landcover', timeoutMs: 30000 });
    } finally { signal.removeEventListener('abort', cancel); }
  }

  adopt(raw: ArrayBuffer): void {
    if (this.disposed) return;
    if (this.texture) throw new Error('Regional landcover is already loaded.');
    if (raw.byteLength !== this.catalog.asset.decodedBytes) throw new Error('Regional landcover size did not match.');
    const texture = new THREE.DataTexture(new Uint8Array(raw).slice(), 2048, 2048, THREE.RGBAFormat, THREE.UnsignedByteType);
    texture.name = 'NLCD2025 regional summer landcover';
    texture.colorSpace = THREE.NoColorSpace; texture.flipY = false;
    texture.generateMipmaps = true; texture.minFilter = THREE.LinearMipmapLinearFilter; texture.magFilter = THREE.LinearFilter;
    texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping; texture.needsUpdate = true;
    this.texture = texture;
  }

  patch(shader: THREE.WebGLProgramParametersWithUniforms): void {
    if (!this.texture) throw new Error('Regional landcover is not ready.');
    shader.uniforms.townRegionalCover = { value: this.texture };
    shader.vertexShader = 'varying vec2 vTownRegionalCoverUV;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvTownRegionalCoverUV = (position.xz + vec2(40020.0)) / 80040.0;');
    shader.fragmentShader = 'uniform sampler2D townRegionalCover; varying vec2 vTownRegionalCoverUV;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
vec4 regionalCover = texture2D(townRegionalCover, vTownRegionalCoverUV);
float regionalRadius = length(vTownRegionalCoverUV * 80040.0 - vec2(40020.0));
float regionalCoverage = regionalCover.a * (1.0 - smoothstep(39000.0, 40000.0, regionalRadius));
diffuseColor.rgb = mix(diffuseColor.rgb, regionalCover.rgb, regionalCoverage);`);
  }

  resources() { return { ready: !!this.texture, transferBytes: this.catalog.asset.bytes, textureBytes: this.texture ? Math.ceil(16 * 1048576 * 4 / 3) : 0, additionalDraws: 0 }; }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true; this.controller.abort(); this.texture?.dispose(); this.texture = undefined;
  }
}
