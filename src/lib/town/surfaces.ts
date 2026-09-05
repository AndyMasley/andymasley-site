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
    material.customProgramCacheKey = () => 'webster-cut-grass-ground-v3';
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
float townCutBlade(vec2 world) {
  vec2 p = world * 8.0, cell = floor(p), f = fract(p) - 0.5;
  float seed = townHash(cell);
  float angle = seed * 6.2831853;
  f = mat2(cos(angle), -sin(angle), sin(angle), cos(angle)) * f;
  float side = f.x + f.y*f.y*0.28;
  float aa = max(fwidth(side), 0.008);
  float blade = (1.0 - smoothstep(0.018-aa, 0.018+aa, abs(side))) *
    (1.0 - smoothstep(0.20, 0.40, abs(f.y)));
  return blade * (1.0 - smoothstep(0.3, 0.9, max(fwidth(p.x),fwidth(p.y))));
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
float townDistance = length(vTownGroundXZ - cameraPosition.xz);
float townClose = 1.0 - smoothstep(18.0, 70.0, townDistance);
vec3 townGrassSource = texture2D(townGrass, townDetailUV).rgb;
float townGrassValue = dot(townGrassSource,vec3(0.2126,0.7152,0.0722));
vec3 townGrassPalette = mix(vec3(0.067,0.115,0.035),vec3(0.215,0.300,0.120),smoothstep(0.025,0.24,townGrassValue));
vec3 townGrassColor = mix(townGrassSource*vec3(1.06,1.02,1.12),townGrassPalette,0.74);
float townMacro = townNoise(vTownGroundXZ / 13.0);
float townBlade = townCutBlade(vTownGroundXZ);
float townMown = sin(dot(vTownGroundXZ,vec2(0.38,0.17)));
townGrassColor *= mix(0.95,1.055,townMacro) * (1.0 + 0.022*townMown);
townGrassColor *= 0.97 + townBlade * townClose * 0.22;
vec3 townForestColor = texture2D(townForest,vTownGroundXZ/townOtherRepeats.y).rgb * mix(0.82,1.10,townMacro);
vec3 townSoilColor = texture2D(townSoil,vTownGroundXZ/townOtherRepeats.x).rgb * mix(0.82,1.15,townMacro);
vec3 townPavedSource = texture2D(townPavement,vTownGroundXZ/townOtherRepeats.z).rgb;
float townPavedValue = dot(townPavedSource,vec3(0.2126,0.7152,0.0722));
vec3 townPavedColor = mix(townPavedSource, townPavedValue*vec3(0.94,1.0,1.07),0.96) * 0.56;
float townVegetated = min(1.0, townWeights.r + townWeights.g + townWeights.a);
float townTotalWeight = townWeights.r + townWeights.g + townWeights.a + townWeights.b*townHasPavement;
vec3 townSurfaceColor = townGrassColor*townWeights.r + townForestColor*townWeights.g + townSoilColor*townWeights.a + townPavedColor*townWeights.b*townHasPavement;
townSurfaceColor /= max(townTotalWeight, 0.001);
// Blend once: sequential class blends expose the blurry aerial at mixed boundaries.
diffuseColor.rgb = mix(diffuseColor.rgb, townSurfaceColor, min(1.0,townTotalWeight));
`).replace('#include <roughnessmap_fragment>', `
#include <roughnessmap_fragment>
roughnessFactor = mix(roughnessFactor, max(0.87, texture2D(townGrassRoughness,townDetailUV).r), townWeights.r);
roughnessFactor = mix(roughnessFactor, max(roughnessFactor,0.9), min(1.0,townWeights.g+townWeights.a));
`).replace('#include <normal_fragment_maps>', `
#include <normal_fragment_maps>
vec3 townNormal = texture2D(townGrassNormal,townDetailUV).xyz * 2.0 - 1.0;
normal = normalize(normal + mat3(viewMatrix) * vec3(townNormal.x,0.0,townNormal.y) * townWeights.r * townClose * 0.56);
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
