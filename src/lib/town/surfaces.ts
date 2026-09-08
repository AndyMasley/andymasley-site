import * as THREE from 'three';
import type { AssetRef, GroundSurfaces, V3 } from './contracts';
import { TownGrass, grassMaskFromTexture, excludeGrassPolygons } from './grass';
import { pavedMaskReference } from './paved-surfaces';
import { beginOptionalDetail } from './optional-detail';
import { groundTexturePreview } from './ground-preview';

type TileSurface = { mask: THREE.Texture; materials: THREE.Material[] };
type TextureReader = (asset: AssetRef, color: boolean, signal: AbortSignal, data?: boolean) => Promise<THREE.Texture>;

/** Land cover is sampled in metres, independently of terrain tessellation and LOD. */
export function groundMaskUV(bounds: readonly number[], x: number, z: number): [number, number] {
  return [(x - bounds[0]) / (bounds[2] - bounds[0]), (z - bounds[1]) / (bounds[3] - bounds[1])];
}

export class TownSurfaces {
  private shared: (THREE.Texture | null)[] = [];
  private tiles = new Map<THREE.Object3D, TileSurface>();
  private disposed = false;
  private grass = new TownGrass();
  private fullMaps: { asset: AssetRef; color: boolean }[] = [];
  private previewSlots = new Set<number>();
  private fullResolutionWork?: Promise<void>;
  private upgradeTimer?: ReturnType<typeof setTimeout>;
  private upgradeRetryAt = 0;
  private upgradeFailures = 0;
  private shaders = new Map<THREE.Material, Set<Record<string, THREE.IUniform>>>();

  constructor(private definition: GroundSurfaces, private read: TextureReader) {}

  async initialize(signal: AbortSignal): Promise<void> {
    const grass = this.definition.grass;
    const definitions = [grass.color, grass.normal, grass.roughness, this.definition.soil?.color, this.definition.forest?.color, this.definition.impervious?.color];
    this.fullMaps = definitions.map((asset, i) => ({ asset: asset!, color: i === 0 || i > 2 }));
    const results = await Promise.allSettled(definitions.map(async (asset, i) => {
      if (!asset) return null;
      const preview = groundTexturePreview(asset);
      if (preview) {
        try { const texture = await this.read(preview, this.fullMaps[i].color, signal); this.previewSlots.add(i); return texture; }
        catch (error) { if (signal.aborted || this.disposed) throw error; }
      }
      return this.read(asset, this.fullMaps[i].color, signal);
    }));
    const textures = results.flatMap(result => result.status === 'fulfilled' && result.value ? [result.value] : []);
    const failure = results.find(result => result.status === 'rejected');
    if (this.disposed || signal.aborted || failure) {
      textures.forEach(texture => this.destroyTexture(texture));
      if (failure?.status === 'rejected') throw failure.reason;
      throw new DOMException('Loading cancelled', 'AbortError');
    }
    for (const texture of textures) {
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      texture.anisotropy = 4;
      texture.needsUpdate = true;
    }
    this.shared = results.map(result => result.status === 'fulfilled' ? result.value : null);
  }

  /** Only six shared ground maps refine after the first live render. Source
   * building/car maps always retain full quality. Failed refinement keeps the
   * usable preview and retries; no source texture or shader formula changes. */
  refine(signal: AbortSignal): void {
    if (this.disposed || signal.aborted || !this.previewSlots.size || this.fullResolutionWork || this.upgradeTimer || Date.now() < this.upgradeRetryAt) return;
    this.upgradeTimer = setTimeout(() => {
      this.upgradeTimer = undefined;
      if (this.disposed || signal.aborted) return;
      this.fullResolutionWork = Promise.all([...this.previewSlots].map(async i => {
        const source = this.fullMaps[i];
        try {
          const texture = await this.read(source.asset, source.color, signal);
          if (this.disposed || signal.aborted) { this.destroyTexture(texture); return; }
          texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.anisotropy = 4; texture.needsUpdate = true;
          const old = this.shared[i]; this.shared[i] = texture; this.previewSlots.delete(i);
          for (const versions of this.shaders.values()) for (const uniforms of versions) this.updateUniformTextures(uniforms);
          if (old) this.destroyTexture(old);
        } catch { if (!this.disposed && !signal.aborted) this.upgradeFailures++; }
      })).then(() => { this.upgradeRetryAt = Date.now() + 10000; }).finally(() => { this.fullResolutionWork = undefined; });
    }, 500);
  }

  retryRefinement(signal: AbortSignal): void { this.upgradeRetryAt = 0; this.refine(signal); }
  detailResources() { return { previewMaps: this.previewSlots.size, fullMaps: this.shared.filter(Boolean).length - this.previewSlots.size, upgrading: !!this.fullResolutionWork, failures: this.upgradeFailures }; }
  private updateUniformTextures(uniforms: Record<string, THREE.IUniform>): void {
    const [color, normal, roughness, soil, forest, impervious] = this.shared;
    for (const [name, texture] of Object.entries({ townGrass: color, townGrassNormal: normal, townGrassRoughness: roughness, townSoil: soil ?? color, townForest: forest ?? color, townPavement: impervious ?? color })) if (uniforms[name]) uniforms[name].value = texture;
  }

  async apply(group: THREE.Object3D, id: string, signal: AbortSignal): Promise<void> {
    if (this.tiles.has(group)) return;
    const reference = this.definition.masks[id];
    if (!reference) return;
    const terrain: THREE.Mesh[] = [];
    group.traverse(object => {
      if (object instanceof THREE.Mesh && /^terrain(?:\b|_)/i.test(object.name)) terrain.push(object);
    });
    if (!terrain.length) return;
    const replacement = pavedMaskReference(id, reference);
    let corrected: THREE.Texture | undefined;
    if (replacement) {
      const request = beginOptionalDetail(signal, async child => {
        const texture = await this.read(replacement, false, child, true);
        if (child.aborted || this.disposed) { this.destroyTexture(texture); return undefined; }
        return texture;
      });
      corrected = await request.finish();
    }
    const mask = corrected ?? await this.read(reference, false, signal, true);
    if (this.disposed || signal.aborted) {
      this.destroyTexture(mask);
      throw new DOMException('Loading cancelled', 'AbortError');
    }
    mask.wrapS = mask.wrapT = THREE.ClampToEdgeWrapping;
    mask.anisotropy = 1;
    const copies = new Map<THREE.Material, THREE.Material>();
    const clone = (source: THREE.Material): THREE.Material => {
      const existing = copies.get(source);
      if (existing) return existing;
      if (!(source instanceof THREE.MeshStandardMaterial)) return source;
      const material = source.clone();
      material.name = `${source.name} | summer surface ${id}`;
      this.patch(material, mask, reference.bounds);
      copies.set(source, material);
      return material;
    };
    for (const mesh of terrain) mesh.material = Array.isArray(mesh.material) ? mesh.material.map(clone) : clone(mesh.material);
    this.tiles.set(group, { mask, materials: [...copies.values()] });
    group.userData.pavedSurfaceMask = corrected ? replacement!.url : undefined;
    const grassMask = grassMaskFromTexture(mask, reference.bounds);
    if (grassMask) this.grass.register(group, id, excludeGrassPolygons(grassMask,group.userData.environmentGrassExclusions??[]), terrain);
  }

  update(position: V3, low: boolean, time: number): void { this.grass.update(position, low, time); }

  grassResources(): ReturnType<TownGrass['resources']> { return this.grass.resources(); }

  private patch(material: THREE.MeshStandardMaterial, mask: THREE.Texture, bounds: number[]): void {
    material.customProgramCacheKey = () => 'webster-finished-ground-v6';
    material.onBeforeCompile = shader => {
      const [color, normal, roughness, soil, forest, impervious] = this.shared;
      Object.assign(shader.uniforms, {
        townCover: { value: mask }, townGrass: { value: color }, townGrassNormal: { value: normal },
        townGrassRoughness: { value: roughness }, townCoverBounds: { value: new THREE.Vector4(...bounds) },
        townGrassRepeat: { value: this.definition.grass.repeatM },
        townSoil: { value: soil ?? color }, townForest: { value: forest ?? color }, townPavement: { value: impervious ?? color },
        townOtherRepeats: { value: new THREE.Vector3(this.definition.soil?.repeatM ?? 1, this.definition.forest?.repeatM ?? 1, this.definition.impervious?.repeatM ?? 2) },
        townHasPavement: { value: impervious ? 1 : 0 },
      });
      let versions = this.shaders.get(material); if (!versions) { versions = new Set(); this.shaders.set(material, versions); } versions.add(shader.uniforms);
      shader.vertexShader = `varying vec2 vTownGroundXZ;\n${shader.vertexShader}`
        .replace('#include <project_vertex>', '#include <project_vertex>\nvTownGroundXZ = (modelMatrix * vec4(transformed, 1.0)).xz;');
      shader.fragmentShader = `
varying vec2 vTownGroundXZ;
uniform sampler2D townCover, townGrass, townGrassNormal, townGrassRoughness;
uniform sampler2D townSoil, townForest, townPavement;
uniform vec4 townCoverBounds;
uniform vec3 townOtherRepeats;
uniform float townGrassRepeat, townHasPavement;
float townHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float townNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(townHash(i),townHash(i+vec2(1,0)),f.x),mix(townHash(i+vec2(0,1)),townHash(i+vec2(1,1)),f.x),f.y);
}
vec3 townScatteredGround(sampler2D groundTexture, vec2 world, float repeatSize) {
  vec2 cell = floor(world / 3.6), blend = fract(world / 3.6);
  blend = blend*blend*(3.0-2.0*blend);
  vec2 uv = world / repeatSize;
  vec2 a = vec2(townHash(cell),townHash(cell+vec2(71.3,9.7)))*47.0;
  vec2 b = vec2(townHash(cell+vec2(1,0)),townHash(cell+vec2(72.3,9.7)))*47.0;
  vec2 c = vec2(townHash(cell+vec2(0,1)),townHash(cell+vec2(71.3,10.7)))*47.0;
  vec2 d = vec2(townHash(cell+vec2(1,1)),townHash(cell+vec2(72.3,10.7)))*47.0;
  return mix(mix(texture2D(groundTexture,uv+a).rgb,texture2D(groundTexture,uv+b).rgb,blend.x),
    mix(texture2D(groundTexture,uv+c).rgb,texture2D(groundTexture,uv+d).rgb,blend.x),blend.y);
}
vec2 townCutBlade(vec2 world) {
  vec2 p = world * 24.0, cell = floor(p), f = fract(p) - 0.5;
  float seed = townHash(cell);
  float angle = seed * 6.2831853;
  f = mat2(cos(angle), -sin(angle), sin(angle), cos(angle)) * f;
  float side = f.x + f.y*f.y*0.38 + (seed-0.5)*0.23;
  float aa = max(fwidth(side), 0.015);
  float tip = 1.0 - smoothstep(0.12, 0.41, abs(f.y));
  float blade = (1.0 - smoothstep(0.034-aa, 0.034+aa, abs(side))) * tip;
  float contact = (1.0 - smoothstep(0.04-aa, 0.10+aa, abs(side+0.07))) * tip;
  float resolved = 1.0 - smoothstep(0.35, 0.95, max(fwidth(p.x),fwidth(p.y)));
  return vec2(blade,contact) * resolved;
}
${shader.fragmentShader}`.replace('#include <map_fragment>', `
#include <map_fragment>
vec2 townMaskUV = (vTownGroundXZ - townCoverBounds.xy) / (townCoverBounds.zw - townCoverBounds.xy);
vec4 townWeights = texture2D(townCover, townMaskUV);
// Sharpen mixed classes without manufacturing coverage in excluded water/buildings.
float townCoverage = min(1.0, dot(townWeights,vec4(1.0)));
townWeights *= townWeights;
townWeights *= townCoverage / max(dot(townWeights,vec4(1.0)),0.00001);
vec2 townDetailUV = vTownGroundXZ / townGrassRepeat;
// A second, differently oriented scale breaks the source tile's repeated clumps.
mat2 townTurfRotation = mat2(0.8,0.6,-0.6,0.8);
vec2 townDetailUV2 = townTurfRotation * townDetailUV * 0.43 + vec2(3.71,9.23);
float townDistance = length(vTownGroundXZ - cameraPosition.xz);
float townClose = 1.0 - smoothstep(14.0, 55.0, townDistance);
float townMacro = townNoise(vTownGroundXZ / 19.0);
float townPatch = townNoise(vTownGroundXZ / 3.7 + vec2(17.9,2.1));
vec3 townGrassColor = vec3(0.0);
if (townWeights.r > 0.001) {
  // Color textures are already decoded from sRGB by their GPU texture format.
  vec3 townGrassSource = texture2D(townGrass, townDetailUV).rgb;
  vec3 townGrassSource2 = texture2D(townGrass, townDetailUV2).rgb;
  float townFine = dot(townGrassSource,vec3(0.2126,0.7152,0.0722));
  float townBroad = dot(townGrassSource2,vec3(0.2126,0.7152,0.0722));
  // The actual decoded source has median luminance .092 and p10/p90 .057/.126.
  // The old .035–.24 smoothstep compressed that into nearly one flat paint tone.
  // Retain the source's blades and broader clumps, with a restrained summer range.
  float townTurfValue = clamp((mix(townFine,townBroad,0.19)-0.025)/0.155,0.0,1.0);
  vec3 townLawnShade = vec3(0.063,0.105,0.033);
  vec3 townLawnLight = vec3(0.198,0.259,0.094);
  townGrassColor = mix(townLawnShade,townLawnLight,townTurfValue);
  // Authored differences in moisture/cutting density, not surveyed lawn health.
  // Continuous metre-space variation avoids tile edges and repeated mowing grids.
  float townLawnDrift = townNoise(vTownGroundXZ/8.3+vec2(6.1,27.3));
  townGrassColor *= mix(vec3(1.04,0.985,0.89),vec3(0.945,1.025,1.055),townLawnDrift);
  townGrassColor *= mix(0.88,1.105,townMacro) * mix(0.955,1.055,townPatch);
  vec2 townBlade = townCutBlade(vTownGroundXZ);
  townGrassColor *= 1.0 + townBlade.x * townClose * 0.15 - townBlade.y * townClose * 0.14;
}
vec3 townForestColor = vec3(0.0);
if (townWeights.g > 0.001) {
  // Blend hashed texture offsets continuously in world space. The source leaf
  // photograph has strong pale patches that otherwise form a visible grid.
  vec3 townForestSource = townScatteredGround(townForest,vTownGroundXZ,townOtherRepeats.y);
  float townForestValue = smoothstep(0.035,0.30,dot(townForestSource,vec3(0.2126,0.7152,0.0722)));
  float townLitterDetail = 1.0 - smoothstep(8.0,42.0,townDistance);
  float townFloorVariation = mix(townNoise(vTownGroundXZ/1.9),townForestValue,0.24+0.40*townLitterDetail);
  townForestColor = mix(vec3(0.062,0.073,0.043),vec3(0.145,0.128,0.078),townFloorVariation);
  townForestColor *= mix(0.86,1.07,townMacro);
}
vec3 townSoilColor = vec3(0.0);
if (townWeights.a > 0.001) {
  vec3 townSoilSource = townScatteredGround(townSoil,vTownGroundXZ,townOtherRepeats.x);
  float townSoilValue = smoothstep(0.035,0.36,dot(townSoilSource,vec3(0.2126,0.7152,0.0722)));
  float townSoilDetail = 1.0 - smoothstep(9.0,45.0,townDistance);
  float townSoilVariation = mix(townNoise(vTownGroundXZ/2.4),townSoilValue,0.28+0.42*townSoilDetail);
  townSoilColor = mix(vec3(0.115,0.101,0.074),vec3(0.245,0.219,0.166),townSoilVariation);
  townSoilColor *= mix(0.91,1.07,townMacro);
}
vec3 townPavedSource = texture2D(townPavement,vTownGroundXZ/townOtherRepeats.z).rgb;
float townPavedValue = dot(townPavedSource,vec3(0.2126,0.7152,0.0722));
vec3 townPavedColor = mix(townPavedSource, townPavedValue*vec3(0.94,1.0,1.07),0.96) * 0.56;
float townTotalWeight = townWeights.r + townWeights.g + townWeights.a + townWeights.b*townHasPavement;
vec3 townSurfaceColor = townGrassColor*townWeights.r + townForestColor*townWeights.g + townSoilColor*townWeights.a + townPavedColor*townWeights.b*townHasPavement;
townSurfaceColor /= max(townTotalWeight, 0.001);
// Blend once: sequential class blends expose the blurry aerial at mixed boundaries.
diffuseColor.rgb = mix(diffuseColor.rgb, townSurfaceColor, min(1.0,townTotalWeight));
`).replace('#include <roughnessmap_fragment>', `
#include <roughnessmap_fragment>
roughnessFactor = mix(roughnessFactor, clamp(texture2D(townGrassRoughness,townDetailUV).r,0.88,0.99), townWeights.r);
roughnessFactor = mix(roughnessFactor, max(roughnessFactor,0.9), min(1.0,townWeights.g+townWeights.a));
`).replace('#include <normal_fragment_maps>', `
#include <normal_fragment_maps>
if (townWeights.r > 0.001) {
  vec2 townNormal = texture2D(townGrassNormal,townDetailUV).xy * 2.0 - 1.0;
  vec2 townNormal2 = texture2D(townGrassNormal,townDetailUV2).xy * 2.0 - 1.0;
  townNormal2 = mat2(0.8,-0.6,0.6,0.8) * townNormal2;
  townNormal = mix(townNormal,townNormal2,0.22);
  // Project the world-X texture axis onto the actual sloping terrain surface.
  vec3 townEast = mat3(viewMatrix) * vec3(1.0,0.0,0.0);
  if (abs(dot(normal,townEast)) > 0.95) townEast = mat3(viewMatrix) * vec3(0.0,0.0,1.0);
  vec3 townTangent = normalize(townEast - normal * dot(normal,townEast));
  vec3 townBitangent = normalize(cross(townTangent,normal));
  normal = normalize(normal + (townTangent*townNormal.x + townBitangent*townNormal.y) * townWeights.r * townClose * 0.38);
}
`);
    };
    material.needsUpdate = true;
  }

  release(group: THREE.Object3D): void {
    const entry = this.tiles.get(group);
    if (!entry) return;
    // Detach owned instancing before the world's generic mesh-disposal traversal.
    this.grass.release(group);
    entry.materials.forEach(material => { this.shaders.delete(material); material.dispose(); });
    this.destroyTexture(entry.mask);
    this.tiles.delete(group);
  }

  resources(): { materials: number; textures: number; bytes: number } {
    const textures = [...this.shared.filter((texture): texture is THREE.Texture => texture !== null), ...[...this.tiles.values()].map(entry => entry.mask)];
    return {
      materials: [...this.tiles.values()].reduce((sum, entry) => sum + entry.materials.length, 0) + this.grass.resources().materials,
      textures: textures.length,
      bytes: textures.reduce((sum, texture) => sum + (texture.image?.width ?? 0) * (texture.image?.height ?? 0) * 4 * (texture.generateMipmaps ? 4 / 3 : 1), 0),
    };
  }

  private destroyTexture(texture: THREE.Texture): void {
    texture.dispose();
    const bitmap = texture.image as { close?: () => void } | undefined;
    bitmap?.close?.();
  }

  dispose(): void {
    this.disposed = true;
    if (this.upgradeTimer) clearTimeout(this.upgradeTimer); this.upgradeTimer = undefined;
    for (const group of this.tiles.keys()) this.release(group);
    this.grass.dispose();
    this.shared.forEach(texture => { if (texture) this.destroyTexture(texture); });
    this.shared = [];
    this.previewSlots.clear(); this.shaders.clear();
  }
}
