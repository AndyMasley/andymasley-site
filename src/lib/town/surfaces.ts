import * as THREE from 'three';
import type { AssetRef, GroundSurfaces, V3 } from './contracts';
import { TownGrass, grassMaskFromTexture, excludeGrassPolygons } from './grass';
import { pavedMaskReference } from './paved-surfaces';
import { beginOptionalDetail } from './optional-detail';
import { groundTexturePreview } from './ground-preview';
import { FOREST_LITTER_GLSL, FOREST_LITTER_LIMITS } from './forest-litter';
import { releaseHardscapeGrassExclusions } from './hardscape-grass-exclusions';
import { regularizeCover } from './cover-cleanup';
import { surfaceSet, surfaceMeanLuminance } from './surface-library';

type TileSurface = { mask: THREE.Texture; materials: THREE.Material[] };
/** Mean linear reflectance of the streets' asphalt, and of the release's own atlas. */
const PAVING_REFLECTANCE = surfaceMeanLuminance('asphalt');
const RELEASE_ASPHALT_REFLECTANCE = 0.0805;
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
  /** Shared by every ground material: 0 on Low and mobile, which skip the
   * close-range turf, stripe, crack and edge-noise detail. */
  private detail = { value: 1 };

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
    const paving = this.paving(impervious, color);
    for (const [name, texture] of Object.entries({ townGrass: color, townGrassNormal: normal, townGrassRoughness: roughness, townSoil: soil ?? color, townForest: forest ?? color, townPavement: paving.texture })) if (uniforms[name]) uniforms[name].value = texture;
    if (uniforms.townPavedTile) uniforms.townPavedTile.value = paving.tile;
    if (uniforms.townPavedGain) uniforms.townPavedGain.value = paving.gain;
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
    // Crisp, cleaned paving outlines and lawn under yard trees (cover-cleanup.ts).
    // Grass, driveway and walk placement below read the same cleaned weights.
    const image = mask.image as { data?: Uint8Array | Uint8ClampedArray; width?: number; height?: number } | undefined;
    if (image?.data && image.width && image.height) {
      group.userData.coverCleanup = regularizeCover(image.data, image.width, image.height);
      mask.needsUpdate = true;
    }
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
    // House dressing reads the paved class to find driveways (no copy of the data).
    group.userData.coverMask = grassMask ?? undefined;
    if (grassMask) {
      this.grass.register(group, id, excludeGrassPolygons(grassMask,group.userData.environmentGrassExclusions??[]), terrain);
      releaseHardscapeGrassExclusions(group);
    }
  }

  update(position: V3, low: boolean, time: number): void { this.detail.value = low ? 0 : 1; this.grass.update(position, low, time); }

  grassResources(): ReturnType<TownGrass['resources']> { return this.grass.resources(); }

  /** Paving borrows the streets' authored asphalt when the surface library is
   * installed; otherwise the release's own asphalt atlas, scaled to the same
   * mean reflectance and displayed at the tile size the streets use. */
  private paving(impervious: THREE.Texture | null, fallback: THREE.Texture | null): { texture: THREE.Texture | null; tile: number; gain: number } {
    const library = surfaceSet('asphalt');
    if (library) return { texture: library.albedo, tile: library.tileM, gain: 1 };
    return { texture: impervious ?? fallback, tile: (this.definition.impervious?.repeatM ?? 2.08) / 1.6, gain: impervious ? PAVING_REFLECTANCE / RELEASE_ASPHALT_REFLECTANCE : 1 };
  }

  private patch(material: THREE.MeshStandardMaterial, mask: THREE.Texture, bounds: number[]): void {
    material.customProgramCacheKey = () => 'webster-finished-ground-v15';
    material.onBeforeCompile = (shader, renderer) => {
      const [color, normal, roughness, soil, forest, impervious] = this.shared;
      const paving = this.paving(impervious, color);
      Object.assign(shader.uniforms, {
        townCover: { value: mask }, townGrass: { value: color }, townGrassNormal: { value: normal },
        townGrassRoughness: { value: roughness }, townCoverBounds: { value: new THREE.Vector4(...bounds) },
        townGrassRepeat: { value: this.definition.grass.repeatM },
        townSoil: { value: soil ?? color }, townForest: { value: forest ?? color }, townPavement: { value: paving.texture },
        townOtherRepeats: { value: new THREE.Vector3(this.definition.soil?.repeatM ?? 1, this.definition.forest?.repeatM ?? 1, this.definition.impervious?.repeatM ?? 2) },
        townHasPavement: { value: impervious ? 1 : 0 },
        townPavedTile: { value: paving.tile }, townPavedGain: { value: paving.gain }, townGroundDetail: this.detail,
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
uniform float townGrassRepeat, townHasPavement, townPavedTile, townPavedGain, townGroundDetail;
float townHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float townNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(townHash(i),townHash(i+vec2(1,0)),f.x),mix(townHash(i+vec2(0,1)),townHash(i+vec2(1,1)),f.x),f.y);
}
vec3 townLotHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xxy + p3.yzz) * p3.zyx);
}
// Neighbouring lawns are kept differently. Authored lot-sized tints: most
// unchanged, some lusher, some drier, some paler from recent mowing.
vec3 townLotTint(float id) {
  return id < 0.44 ? vec3(1.0) : id < 0.64 ? vec3(0.87,0.96,0.89) : id < 0.84 ? vec3(1.13,1.07,0.85) : vec3(1.07,1.06,0.97);
}
// Drives and yards were paved at different times: most match the street,
// some are older and grayer, a few freshly sealed. Authored proportions.
float townPaveTone(float id) {
  return id < 0.46 ? 1.0 : id < 0.70 ? 1.13 : id < 0.86 ? 0.86 : 1.24;
}
${FOREST_LITTER_GLSL}
vec3 townScatteredGround(sampler2D groundTexture, vec2 world, vec2 worldDx, vec2 worldDy, float repeatSize, vec3 sourceMean) {
  vec2 cell = floor(world / 3.6), blend = fract(world / 3.6);
  blend = blend*blend*(3.0-2.0*blend);
  vec2 uv = world / repeatSize, uvDx = worldDx / repeatSize, uvDy = worldDy / repeatSize;
  // Hash offsets jump when a patch changes ownership. Implicit gradients would
  // read that jump as a huge pixel footprint and blur a seam into the ground.
  // Sampling gradients come from the continuous world domain, before any
  // cover-class branch; the four atlas reads and their blend stay unchanged.
  vec2 a = vec2(townHash(cell),townHash(cell+vec2(71.3,9.7)))*47.0;
  vec2 b = vec2(townHash(cell+vec2(1,0)),townHash(cell+vec2(72.3,9.7)))*47.0;
  vec2 c = vec2(townHash(cell+vec2(0,1)),townHash(cell+vec2(71.3,10.7)))*47.0;
  vec2 d = vec2(townHash(cell+vec2(1,1)),townHash(cell+vec2(72.3,10.7)))*47.0;
  vec3 scattered = mix(mix(textureGrad(groundTexture,uv+a,uvDx,uvDy).rgb,textureGrad(groundTexture,uv+b,uvDx,uvDy).rgb,blend.x),
    mix(textureGrad(groundTexture,uv+c,uvDx,uvDy).rgb,textureGrad(groundTexture,uv+d,uvDx,uvDy).rgb,blend.x),blend.y);
  // Offset blending removes tiling but also averages away leaf/stone contrast.
  // Restore its variance around the measured linear-RGB source mean, retaining
  // the same four reads and continuous blend at every patch boundary.
  vec4 weights = vec4((1.0-blend.x)*(1.0-blend.y),blend.x*(1.0-blend.y),(1.0-blend.x)*blend.y,blend.x*blend.y);
  return clamp(sourceMean+(scattered-sourceMean)*inversesqrt(dot(weights,weights)),0.0,1.0);
}
vec2 townCutBlade(vec2 world, float pixelWidth) {
  vec2 p = world * 9.0, cell = floor(p), f = fract(p) - 0.5;
  float seed = townHash(cell);
  // Broad, quiet clumps remain legible beside the driving camera. Fade their
  // support before cell edges so rotated fibres never reveal square seams.
  float support = 1.0 - smoothstep(0.1225, 0.225625, dot(f,f));
  f -= vec2(seed-0.5,fract(seed*13.7)-0.5)*0.12;
  float angle = seed * 6.2831853;
  f = mat2(cos(angle), -sin(angle), sin(angle), cos(angle)) * f;
  // Two unequal, bent fibres read as a short interwoven spray rather than
  // bright stipple. This is authored turf structure, not surveyed lawn detail.
  float side = f.x + f.y*f.y*0.42 + (seed-0.5)*0.16;
  float footprint = pixelWidth * 9.0;
  float aa = max(footprint * 0.65, 0.016);
  float tip = 1.0 - smoothstep(0.11, 0.34+seed*0.055, abs(f.y));
  float width = 0.029+seed*0.011;
  float blade = (1.0 - smoothstep(width-aa, width+aa, abs(side))) * tip;
  float fibreTip = 1.0 - smoothstep(0.06,0.285,abs(f.y+0.045));
  float fibre = (1.0-smoothstep(0.025-aa,0.025+aa,abs(f.x-f.y*0.55-0.11))) * fibreTip;
  float contact = (1.0 - smoothstep(0.022-aa, 0.090+aa, abs(side+0.064))) * tip;
  // Evaluate the footprint from continuous metre-space coordinates. Every
  // clump fades away before it becomes unresolved grazing-angle shimmer.
  float resolved = 1.0 - smoothstep(0.22, 0.68, footprint);
  return vec2(blade*(0.68+seed*0.32)+fibre*0.32,contact) * support * resolved;
}
${shader.fragmentShader}`.replace('#include <map_fragment>', `
#include <map_fragment>
vec2 townMaskUV = (vTownGroundXZ - townCoverBounds.xy) / (townCoverBounds.zw - townCoverBounds.xy);
vec4 townWeights = texture2D(townCover, townMaskUV);
float townCoverSum = dot(townWeights,vec4(1.0));
float townCoverage = min(1.0, townCoverSum);
float townDistance = length(vTownGroundXZ - cameraPosition.xz);
float townClose = 1.0 - smoothstep(14.0, 55.0, townDistance);
// Evaluate before class-dependent branches, including at grazing view angles.
vec2 townGroundFootprint = fwidth(vTownGroundXZ);
vec2 townWorldDx = dFdx(vTownGroundXZ), townWorldDy = dFdy(vTownGroundXZ);
float townPixelWidth = max(townGroundFootprint.x,townGroundFootprint.y);
float townGrassResolved = 1.0 - smoothstep(0.014,0.065,townPixelWidth);
float townGroundReliefResolved = 1.0-smoothstep(0.018,0.12,townPixelWidth);
// Paving: cover-cleanup.ts leaves a smooth band around each cleaned paved
// outline. Its half-way contour is drawn as one crisp edge, softened only as
// far as a screen pixel needs: across the band the share rises at most about
// half a unit per metre, so one pixel's footprint bounds the change.
float townPavedShare = townWeights.b / max(townCoverSum, 0.00001);
float townPavedAA = clamp(townPixelWidth*0.36, 0.012, 0.4);
float townPavedCover = smoothstep(0.5-townPavedAA, 0.5+townPavedAA, townPavedShare) * townHasPavement;
// Lawn beside paving thins and browns within about forty centimetres.
float townVerge = smoothstep(0.26, 0.49, townPavedShare) * (1.0 - townPavedCover) * townHasPavement;
// Lawn, canopy litter and bare soil meet along natural, ragged edges. The
// canopy and soil shares are nudged by a metre-scale field before the three
// are sharpened, so broad fades in the source become irregular edges a
// metre or two wide. Excluded water and buildings gain no coverage.
vec3 townOthers = townWeights.rga;
// Only where two classes actually meet; a single class normalizes the same.
if (townGroundDetail > 0.5 && dot(townOthers,vec3(1.0)) - max(townOthers.x,max(townOthers.y,townOthers.z)) > 0.004) {
  float townEdgeNoise = townNoise(vTownGroundXZ*0.37+vec2(4.1,9.3)) + (townNoise(vTownGroundXZ*1.21+vec2(13.7,2.9))-0.5)*0.55 - 0.5;
  townOthers *= vec3(1.0, 1.0+townEdgeNoise*0.7, 1.0-townEdgeNoise*0.5);
}
townOthers *= townOthers; townOthers *= townOthers;
townOthers *= townCoverage*(1.0-townPavedCover) / max(dot(townOthers,vec3(1.0)),1e-8);
townWeights = vec4(townOthers.x, townOthers.y, townPavedCover*townCoverage, townOthers.z);
float townGroundRelief = 0.0;
float townMacro = townNoise(vTownGroundXZ / 19.0);
float townPatch = townNoise(vTownGroundXZ / 2.6 + vec2(17.9,2.1));
// A continuous, gentle domain drift breaks the source tile's regular grid.
// Reuse the existing patch fields and keep color/normal/roughness coordinates
// registered; no hashed UV jumps, extra maps or additional texture reads.
vec2 townDetailUV = vTownGroundXZ * 1.65 / townGrassRepeat + vec2(townPatch,townMacro)*0.48;
mat2 townTurfRotation = mat2(0.8,0.6,-0.6,0.8);
vec2 townDetailUV2 = townTurfRotation * townDetailUV * 0.73 + vec2(3.71,9.23);
// Explicit derivatives also preserve filtering where adjacent pixels select
// different cover classes. Grass color, normals and roughness share the same
// warped coordinates AND gradients, including the rotated secondary sample.
vec2 townDetailDx = dFdx(townDetailUV), townDetailDy = dFdy(townDetailUV);
vec2 townDetailDx2 = townTurfRotation * townDetailDx * 0.73;
vec2 townDetailDy2 = townTurfRotation * townDetailDy * 0.73;
// Plan-view paving in the same frame as the streets' authored asphalt.
vec2 townPavedUV = vec2(vTownGroundXZ.x,-vTownGroundXZ.y)/townPavedTile;
vec2 townPavedDx = dFdx(townPavedUV), townPavedDy = dFdy(townPavedUV);
// Lot-sized cells (about 15-30 m) shared by lawns and paving: adjoining yards
// are kept, mown and paved differently. Nearest and second-nearest sites.
vec2 townLotP = vTownGroundXZ / 21.0, townLotCell = floor(townLotP), townLotCellA = townLotCell;
float townLotNear = 9.0, townLotNext = 9.0, townLotA = 0.0, townLotB = 0.0;
for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
  vec2 townLotC = townLotCell + vec2(float(i), float(j));
  vec3 townLotH = townLotHash(townLotC);
  float townLotD = length(townLotP - townLotC - 0.1 - townLotH.xy * 0.8);
  if (townLotD < townLotNear) { townLotNext = townLotNear; townLotB = townLotA; townLotNear = townLotD; townLotA = townLotH.z; townLotCellA = townLotC; }
  else if (townLotD < townLotNext) { townLotNext = townLotD; townLotB = townLotH.z; }
}
float townLotEdge = townLotNext - townLotNear;
vec3 townGrassColor = vec3(0.0);
if (townWeights.r > 0.001) {
  // Color textures are already decoded from sRGB by their GPU texture format.
  vec3 townGrassSource = textureGrad(townGrass,townDetailUV,townDetailDx,townDetailDy).rgb;
  vec3 townGrassSource2 = textureGrad(townGrass,townDetailUV2,townDetailDx2,townDetailDy2).rgb;
  // Preserve actual interwoven turf hues instead of replacing every source
  // pixel with a point on the same smooth green gradient. These measured means
  // belong to the pinned grass atlas, not a survey of a particular lawn.
  vec3 townTurfMean = vec3(0.060254,0.108959,0.022895);
  // Keep the detailed turf at comparable physical scales. The former coarse
  // overlay enlarged the atlas's weeds and baked shadows into soft green pools.
  vec3 townTurfSource = mix(townGrassSource,townGrassSource2,0.24);
  townTurfSource = max(vec3(0.006),townTurfMean+(townTurfSource-townTurfMean)*1.48);
  // Source texture hues supply the fibres; this late-summer midtone, a little
  // lighter and yellower than spring turf, is an artistic palette, not a
  // claim about the condition of individual lawns.
  townGrassColor = max(vec3(0.012),vec3(0.097,0.151,0.047)
    +(townTurfSource-townTurfMean)*vec3(1.18,1.18,1.05));
  // Turf is clumped at two scales the atlas cannot carry past a few metres:
  // tussocks a hand across and clumps about a stride across, the lighter ones
  // a little yellower. Each fades out before its pixels could alias.
  float townTussVis = 1.0 - smoothstep(0.03, 0.10, townPixelWidth);
  float townClumpVis = 1.0 - smoothstep(0.10, 0.34, townPixelWidth);
  float townClump = 0.5;
  if (townGroundDetail > 0.5 && townClumpVis > 0.0) {
    townClump = townNoise(vTownGroundXZ*1.7+vec2(8.3,1.2));
    float townTuss = townTussVis > 0.0 ? townNoise(vTownGroundXZ*6.3+vec2(3.1,7.7)) : 0.5;
    townGrassColor *= (1.0 + (townTuss-0.5)*0.30*townTussVis) * (1.0 + (townClump-0.5)*0.26*townClumpVis);
    townGrassColor *= mix(vec3(1.0), vec3(1.06,1.02,0.88), clamp(townClump*2.0-1.0,0.0,1.0)*townClumpVis);
    townGroundRelief += ((townTuss-0.5)*0.0022*townTussVis + (townClump-0.5)*0.006*townClumpVis)*townWeights.r;
  }
  float townLawnDrift = townNoise(vTownGroundXZ/8.3+vec2(6.1,27.3));
  float townLawnVariation = clamp(townLawnDrift+(townPatch-0.5)*0.34+(townClump-0.5)*0.22*townClumpVis,0.0,1.0);
  float townDryThatch = smoothstep(0.62,0.92,townLawnVariation);
  // Late-summer turf is a mosaic: straw-toned dry runs with ragged edges,
  // deeper green where it stays moist, and blue-green clover patches a metre
  // or two across. Authored variation in amplitude and scale, not a survey.
  townGrassColor *= mix(vec3(0.97,1.01,1.0),vec3(1.20,1.09,0.84),townDryThatch);
  float townLawnMoist = smoothstep(0.55,0.85,townNoise(vTownGroundXZ/13.0+vec2(41.2,3.3)));
  townGrassColor *= mix(vec3(1.0),vec3(0.86,0.96,0.91),townLawnMoist*(1.0-townDryThatch));
  float townClover = smoothstep(0.62,0.74,townNoise(vTownGroundXZ/1.7+vec2(9.4,61.8)))*smoothstep(0.35,0.6,townNoise(vTownGroundXZ/9.0+vec2(2.7,5.9)));
  townGrassColor *= mix(vec3(1.0),vec3(0.84,0.94,0.95),townClover);
  townGrassColor *= mix(0.90,1.08,townMacro) * mix(0.94,1.06,townPatch);
  // Adjoining yards read as separately kept, blended over a couple of metres.
  townGrassColor *= mix(mix(townLotTint(townLotA), townLotTint(townLotB), 0.5), townLotTint(townLotA), smoothstep(0.0, 0.09, townLotEdge));
  // Mown stripes: alternate passes lay the blades one way and then back, so
  // bands a mower deck wide lighten or darken with the viewing direction.
  // Whether a yard shows them, and their heading, is chosen lot by lot.
  vec3 townMow = townLotHash(townLotCellA + vec2(17.0,5.0));
  float townMowAA = townPixelWidth / 0.56;
  if (townGroundDetail > 0.5 && townMow.y > 0.52 && townMowAA < 0.7) {
    vec2 townMowDir = vec2(cos(townMow.x*3.14159), sin(townMow.x*3.14159));
    float townMowCoord = dot(vTownGroundXZ, vec2(-townMowDir.y, townMowDir.x)) / 0.56;
    float townMowWave = clamp(sin(townMowCoord*3.14159265)*2.2, -1.0, 1.0) * (1.0 - smoothstep(0.25, 0.7, townMowAA));
    vec2 townViewXZ = normalize(cameraPosition.xz - vTownGroundXZ + vec2(0.0001));
    townGrassColor *= 1.0 + 0.085 * townMowWave * dot(townViewXZ, townMowDir) * smoothstep(0.02, 0.1, townLotEdge);
  }
  // The verge along paving: thinner, straw and soil-toned turf.
  townGrassColor = mix(townGrassColor, townGrassColor*vec3(1.2,1.04,0.74)+vec3(0.010,0.007,0.002), townVerge*0.75);
  vec2 townBlade = townCutBlade(vTownGroundXZ,townPixelWidth);
  townGrassColor *= 1.0 + townBlade.x * townClose * 0.24 - townBlade.y * townClose * 0.16;
  townGroundRelief += (townBlade.x*0.0014-townBlade.y*0.00055)*townWeights.r*townClose;
}
vec3 townForestColor = vec3(0.0);
if (townWeights.g > 0.001) {
  // Blend hashed texture offsets continuously in world space. The source leaf
  // photograph has strong pale patches that otherwise form a visible grid.
  vec3 townForestSource = townScatteredGround(townForest,vTownGroundXZ,townWorldDx,townWorldDy,townOtherRepeats.y,vec3(0.198153,0.118377,0.046169));
  float townForestValue = dot(townForestSource,vec3(0.2126,0.7152,0.0722));
  float townLitterDetail = 1.0 - smoothstep(18.0,65.0,townDistance);
  float townFloorVariation = clamp((townForestValue-0.015)/0.34,0.0,1.0);
  vec3 townLitterHue = townForestSource-vec3(townForestValue);
  townForestColor = max(vec3(0.012),mix(vec3(0.048,0.040,0.025),vec3(0.138,0.107,0.061),townFloorVariation)+townLitterHue*0.10);
  townForestColor *= mix(0.91,1.08,townNoise(vTownGroundXZ/1.9));
  townForestColor *= mix(0.86,1.07,townMacro);
  // Sparse recognizable brown fragments supplement the retained atlas. They
  // affect this existing cover class only; no geometry or planted positions.
  vec2 townForestFragment=townLitterFragment(vTownGroundXZ,townPixelWidth,${FOREST_LITTER_LIMITS.forestOccupancy.toFixed(3)});
  townForestColor=mix(townForestColor,vec3(.18,.128,.068)*townForestFragment.y,townForestFragment.x*.82);
  townGroundRelief += (townFloorVariation-0.38)*0.0035*townWeights.g*townLitterDetail;
  townGroundRelief += townForestFragment.x*${FOREST_LITTER_LIMITS.reliefM.toFixed(6)}*townWeights.g*townLitterDetail;
}
vec3 townSoilColor = vec3(0.0);
if (townWeights.a > 0.001) {
  vec3 townSoilSource = townScatteredGround(townSoil,vTownGroundXZ,townWorldDx,townWorldDy,townOtherRepeats.x,vec3(0.182107,0.145364,0.080108));
  float townSoilValue = dot(townSoilSource,vec3(0.2126,0.7152,0.0722));
  float townSoilDetail = 1.0 - smoothstep(15.0,55.0,townDistance);
  float townSoilVariation = clamp((townSoilValue-0.025)/0.34,0.0,1.0);
  vec3 townSoilHue = townSoilSource-vec3(townSoilValue);
  townSoilColor = max(vec3(0.018),mix(vec3(0.070,0.055,0.035),vec3(0.255,0.211,0.144),townSoilVariation)+townSoilHue*0.12);
  townSoilColor *= mix(0.93,1.06,townNoise(vTownGroundXZ/2.4));
  townSoilColor *= mix(0.91,1.07,townMacro);
  vec2 townSoilFragment=townLitterFragment(vTownGroundXZ,townPixelWidth,${FOREST_LITTER_LIMITS.soilOccupancy.toFixed(3)});
  townSoilColor=mix(townSoilColor,vec3(.105,.072,.040)*townSoilFragment.y,townSoilFragment.x*.72);
  townGroundRelief += (townSoilVariation-0.38)*0.0020*townWeights.a*townSoilDetail;
  townGroundRelief += townSoilFragment.x*${FOREST_LITTER_LIMITS.reliefM.toFixed(6)}*townWeights.a*townSoilDetail;
}
float townPavedValue = 0.0, townPavedPatina = 0.5;
vec3 townPavedColor = vec3(0.0);
if (townWeights.b*townHasPavement > 0.001) {
  // The streets' authored asphalt at the streets' own reflectance, so drives
  // and yards read as the same material as the road beside them.
  vec3 townPavedSource = textureGrad(townPavement,townPavedUV,townPavedDx,townPavedDy).rgb * townPavedGain;
  townPavedValue = dot(townPavedSource,vec3(0.2126,0.7152,0.0722));
  townPavedColor = mix(townPavedSource, townPavedValue*vec3(0.955,1.0,1.04),0.85);
  townPavedColor *= mix(townPaveTone(townLotB), townPaveTone(townLotA), smoothstep(0.0, 0.012, townLotEdge));
  // Weathering is broad and continuous, with a few darker drip and seal stains.
  townPavedPatina = townNoise(vTownGroundXZ/5.8+vec2(33.8,7.2));
  townPavedColor *= mix(0.93,1.07,townPavedPatina);
  townPavedColor *= 1.0 - 0.09*smoothstep(0.64,0.82,townNoise(vTownGroundXZ/1.9+vec2(5.1,17.3)));
  // The outermost quarter metre of a paved edge is broken and dusty.
  townPavedColor *= mix(vec3(1.0), vec3(1.05,1.02,0.95), (1.0-smoothstep(0.5,0.66,townPavedShare))*0.6);
  // Hairline cracks meander through the older half of the paving. A warped
  // noise contour a couple of centimetres wide, drawn only while resolved.
  if (townGroundDetail > 0.5 && townPixelWidth < 0.06) {
    float townCrackField = townNoise(vTownGroundXZ*0.55+vec2(townNoise(vTownGroundXZ*1.7+vec2(3.3,8.1))*0.9,0.0));
    float townCrack = (1.0-smoothstep(0.0, 0.011+townPixelWidth*0.45, abs(townCrackField-0.5)))
      * (1.0-smoothstep(0.02,0.06,townPixelWidth)) * smoothstep(0.42,0.62,townNoise(vTownGroundXZ*0.083+vec2(9.1,2.3)));
    townPavedColor *= 1.0 - 0.3*townCrack;
    townGroundRelief -= townCrack*0.0018*townWeights.b;
  }
  float townPavedAggregate = townNoise(vTownGroundXZ*23.0+vec2(5.3,1.8));
  float townPavedResolved = townClose*(1.0-smoothstep(0.008,0.048,townPixelWidth));
  townPavedColor *= 1.0+(townPavedAggregate-0.5)*0.12*townPavedResolved;
  townGroundRelief += ((townPavedValue-0.13)*0.003*townClose
    +(townPavedAggregate-0.5)*0.0008*townPavedResolved)*townWeights.b;
}
townGroundRelief *= townGroundReliefResolved;
float townTotalWeight = townWeights.r + townWeights.g + townWeights.a + townWeights.b*townHasPavement;
vec3 townSurfaceColor = townGrassColor*townWeights.r + townForestColor*townWeights.g + townSoilColor*townWeights.a + townPavedColor*townWeights.b*townHasPavement;
townSurfaceColor /= max(townTotalWeight, 0.001);
// Blend once: sequential class blends expose the blurry aerial at mixed boundaries.
diffuseColor.rgb = mix(diffuseColor.rgb, townSurfaceColor, min(1.0,townTotalWeight));
`).replace('#include <roughnessmap_fragment>', `
#include <roughnessmap_fragment>
roughnessFactor = mix(roughnessFactor, 0.91+textureGrad(townGrassRoughness,townDetailUV,townDetailDx,townDetailDy).r*0.08, townWeights.r);
roughnessFactor = mix(roughnessFactor, max(roughnessFactor,0.9), min(1.0,townWeights.g+townWeights.a));
roughnessFactor = mix(roughnessFactor,clamp(0.87+townPavedValue*0.22+(townPavedPatina-0.5)*0.025,0.87,0.97),townWeights.b*townHasPavement);
`).replace('#include <normal_fragment_maps>', `
#include <normal_fragment_maps>
if (townWeights.r > 0.001) {
  vec2 townNormal = textureGrad(townGrassNormal,townDetailUV,townDetailDx,townDetailDy).xy * 2.0 - 1.0;
  vec2 townNormal2 = textureGrad(townGrassNormal,townDetailUV2,townDetailDx2,townDetailDy2).xy * 2.0 - 1.0;
  townNormal2 = mat2(0.8,-0.6,0.6,0.8) * townNormal2;
  townNormal = townNormal + townNormal2*0.28;
  // Project the world-X texture axis onto the actual sloping terrain surface.
  vec3 townEast = mat3(viewMatrix) * vec3(1.0,0.0,0.0);
  if (abs(dot(normal,townEast)) > 0.95) townEast = mat3(viewMatrix) * vec3(0.0,0.0,1.0);
  vec3 townTangent = normalize(townEast - normal * dot(normal,townEast));
  vec3 townBitangent = normalize(cross(townTangent,normal));
  normal = normalize(normal + (townTangent*townNormal.x + townBitangent*townNormal.y) * townWeights.r * townClose * townGrassResolved * 0.58);
  // Turf seen at a low angle shows blade sides and their sheen rather than the
  // shaded gaps between them, so lawns lighten and lose saturation toward the
  // horizon the way they do in the street-level photographs.
  float townTurfGrazing = smoothstep(0.45, 0.95, 1.0 - clamp(dot(nonPerturbedNormal, normalize(vViewPosition)), 0.0, 1.0));
  vec3 townTurfSheen = mix(diffuseColor.rgb, vec3(dot(diffuseColor.rgb, vec3(0.2126,0.7152,0.0722))), 0.25) * vec3(1.30,1.27,1.12);
  diffuseColor.rgb = mix(diffuseColor.rgb, townTurfSheen, townTurfGrazing * townWeights.r * 0.8);
}
// Litter, mineral ground and paved cover reuse the color samples as shallow
// relief. Differentiate after all class branches; nothing displaces terrain.
vec3 townGroundDx=dFdx(-vViewPosition),townGroundDy=dFdy(-vViewPosition);
vec3 townGroundR1=cross(townGroundDy,normal),townGroundR2=cross(normal,townGroundDx);
float townGroundDet=dot(townGroundDx,townGroundR1);
vec2 townReliefDerivative=vec2(dFdx(townGroundRelief),dFdy(townGroundRelief));
if(abs(townGroundDet)>1e-10)normal=normalize(abs(townGroundDet)*normal-sign(townGroundDet)*(townReliefDerivative.x*townGroundR1+townReliefDerivative.y*townGroundR2));
`);
      // The retained Three release can still create a WebGL1 renderer. Keep its
      // former sampling path when texture gradients are not core GLSL features.
      // WebGL2 (the normal game path) uses the derivative-safe detail samples.
      if (renderer.capabilities?.isWebGL2 === false) shader.fragmentShader = shader.fragmentShader.replace(
        /textureGrad\((groundTexture|townGrass|townGrassNormal|townGrassRoughness|townPavement),([^,()]+),[^,()]+,[^,()]+\)/g,
        'texture2D($1,$2)',
      );
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
