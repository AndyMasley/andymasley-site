import * as THREE from 'three';
import type { AssetRef, GroundSurfaces, V3 } from './contracts';
import { TownGrass, grassMaskFromTexture } from './grass';

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

  constructor(private definition: GroundSurfaces, private read: TextureReader) {}

  async initialize(signal: AbortSignal): Promise<void> {
    const grass = this.definition.grass;
    const results = await Promise.allSettled([
      this.read(grass.color, true, signal), this.read(grass.normal, false, signal), this.read(grass.roughness, false, signal),
      ...[this.definition.soil, this.definition.forest, this.definition.impervious].map(surface => surface ? this.read(surface.color, true, signal) : Promise.resolve(null)),
    ]);
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

  async apply(group: THREE.Object3D, id: string, signal: AbortSignal): Promise<void> {
    if (this.tiles.has(group)) return;
    const reference = this.definition.masks[id];
    if (!reference) return;
    const terrain: THREE.Mesh[] = [];
    group.traverse(object => {
      if (object instanceof THREE.Mesh && /^terrain(?:\b|_)/i.test(object.name)) terrain.push(object);
    });
    if (!terrain.length) return;
    const mask = await this.read(reference, false, signal, true);
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
    const grassMask = grassMaskFromTexture(mask, reference.bounds);
    if (grassMask) this.grass.register(group, id, grassMask, terrain);
  }

  update(position: V3, low: boolean, time: number): void { this.grass.update(position, low, time); }

  grassResources(): ReturnType<TownGrass['resources']> { return this.grass.resources(); }

  private patch(material: THREE.MeshStandardMaterial, mask: THREE.Texture, bounds: number[]): void {
    const [color, normal, roughness, soil, forest, impervious] = this.shared;
    material.customProgramCacheKey = () => 'webster-rooted-turf-ground-v4';
    material.onBeforeCompile = shader => {
      Object.assign(shader.uniforms, {
        townCover: { value: mask }, townGrass: { value: color }, townGrassNormal: { value: normal },
        townGrassRoughness: { value: roughness }, townCoverBounds: { value: new THREE.Vector4(...bounds) },
        townGrassRepeat: { value: this.definition.grass.repeatM },
        townSoil: { value: soil ?? color }, townForest: { value: forest ?? color }, townPavement: { value: impervious ?? color },
        townOtherRepeats: { value: new THREE.Vector3(this.definition.soil?.repeatM ?? 1, this.definition.forest?.repeatM ?? 1, this.definition.impervious?.repeatM ?? 2) },
        townHasPavement: { value: impervious ? 1 : 0 },
      });
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
  float townTurfValue = smoothstep(0.035,0.24,mix(townFine,townBroad,0.30));
  vec3 townLawnShade = vec3(0.068,0.127,0.038);
  vec3 townLawnLight = vec3(0.205,0.281,0.095);
  townGrassColor = mix(townLawnShade,townLawnLight,townTurfValue);
  townGrassColor *= mix(0.92,1.065,townMacro) * mix(0.97,1.035,townPatch);
  vec2 townBlade = townCutBlade(vTownGroundXZ);
  townGrassColor *= 1.0 + townBlade.x * townClose * 0.15 - townBlade.y * townClose * 0.14;
}
vec2 townForestUV = vTownGroundXZ / townOtherRepeats.y;
vec3 townForestSource = mix(texture2D(townForest,townForestUV).rgb,
  texture2D(townForest,townTurfRotation*townForestUV/1.17+vec2(7.13,2.87)).rgb,0.48);
float townForestValue = dot(townForestSource,vec3(0.2126,0.7152,0.0722));
// Last season's litter is muted and irregular, not a tiled orange autumn carpet.
vec3 townForestColor = mix(townForestValue*vec3(1.10,1.02,0.88),townForestSource,0.42) * mix(0.72,0.91,townMacro);
vec3 townSoilColor = texture2D(townSoil,vTownGroundXZ/townOtherRepeats.x).rgb * mix(0.90,1.08,townMacro);
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
    entry.materials.forEach(material => material.dispose());
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
    for (const group of this.tiles.keys()) this.release(group);
    this.grass.dispose();
    this.shared.forEach(texture => { if (texture) this.destroyTexture(texture); });
    this.shared = [];
  }
}
