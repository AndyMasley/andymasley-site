import * as THREE from 'three';
import library from '../../../data/derived/town/material-library.json';

/**
 * Shared, tileable surface textures (albedo, tangent-space normal and
 * occlusion/roughness) for the large inferred material families: painted
 * clapboard, architectural roof shingles, asphalt, sidewalk concrete, curb
 * granite and poured foundations. The images are procedurally authored by
 * scripts/town_material_library/generate.py; none is a photograph of Webster.
 *
 * The textures are projected in world space from each face's own orientation
 * (walls: along the wall and up; roofs: along the eave and up the slope;
 * pavement: plan view), so they never depend on the source UV layout. The sets
 * exist from the start of a session as one-texel placeholders (each set's mean
 * colour, a flat normal and neutral roughness), so materials compile once and
 * startup never waits for them; the full images stream in afterwards and replace
 * the placeholders in place. They are shared by every pooled material and
 * released with the world. If an image fails, its placeholder simply remains.
 */
export type SurfaceKind = keyof typeof library.materials;
export type SurfaceSet = { albedo: THREE.Texture; normal: THREE.Texture | null; orm: THREE.Texture | null; tileM: number; mean: THREE.Vector3 };
type Entry = { url: string; bytes: number; sha256: string; size: number };

let active: Map<SurfaceKind, SurfaceSet> | null = null;
let owner: object | null = null;

export const SURFACE_LIBRARY_VERSION = library.library;
export const SURFACE_KINDS = Object.keys(library.materials) as SurfaceKind[];

export function surfaceSet(kind: SurfaceKind): SurfaceSet | undefined {
  return active?.get(kind);
}

export function surfaceLibraryResources(): { sets: number; textures: number; bytes: number } {
  let textures = 0, bytes = 0;
  for (const set of active?.values() ?? []) for (const texture of [set.albedo, set.normal, set.orm]) {
    if (!texture) continue;
    textures++;
    const image = texture.image as { width?: number; height?: number } | undefined;
    bytes += (image?.width ?? 0) * (image?.height ?? 0) * 4 * 4 / 3;
  }
  return { sets: active?.size ?? 0, textures, bytes: Math.round(bytes) };
}

/** Mean linear luminance of a set's albedo (the tone its texture is centred on). */
export function surfaceMeanLuminance(kind: SurfaceKind): number {
  const [r, g, b] = library.materials[kind].meanLinearAlbedo;
  return r * 0.2126 + g * 0.7152 + b * 0.0722;
}

export function surfaceLibraryURL(file: string, base: string): string {
  return new URL(`/town-materials/${library.library}/${file}`, base).href;
}

async function readBitmap(entry: Entry, base: string, signal: AbortSignal): Promise<ImageBitmap> {
  const response = await fetch(surfaceLibraryURL(entry.url, base), { signal });
  if (!response.ok) throw new Error(`Surface texture could not load (${response.status}).`);
  const bitmap = await createImageBitmap(await response.blob(), { imageOrientation: 'none', premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
  if (signal.aborted) { bitmap.close(); throw new DOMException('Loading cancelled', 'AbortError'); }
  return bitmap;
}

/** A one-texel stand-in until the authored image arrives. */
function placeholder(rgb: readonly number[], color: boolean, name: string): THREE.Texture {
  const texel = new Uint8ClampedArray([...rgb.map(v => Math.round(Math.min(1, Math.max(0, v)) * 255)), 255]);
  const image = typeof ImageData === 'undefined' ? { data: texel, width: 1, height: 1 } : new ImageData(texel, 1, 1);
  const texture = new THREE.Texture(image as unknown as HTMLImageElement);
  texture.name = `Webster surface library | ${name} (placeholder)`;
  texture.flipY = false;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.generateMipmaps = false;
  texture.minFilter = texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

/** Swaps the full image into an existing texture object; uniforms keep pointing at it. */
function fill(texture: THREE.Texture, bitmap: ImageBitmap, name: string): void {
  // A new size needs new GPU storage: release the placeholder's allocation first.
  texture.dispose();
  texture.image = bitmap;
  texture.name = `Webster surface library | ${name}`;
  texture.anisotropy = 8;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
}

function destroy(texture: THREE.Texture | null): void {
  if (!texture) return;
  texture.dispose();
  (texture.image as { close?: () => void } | undefined)?.close?.();
}

const srgb8 = (linear: number) => linear <= 0.0031308 ? linear * 12.92 : 1.055 * Math.pow(linear, 1 / 2.4) - 0.055;

/**
 * Install every set immediately (placeholders) and stream the full images.
 * `detail` false (Low and mobile) keeps only the albedo maps; relief and
 * roughness then come from the existing procedural treatments. The returned
 * promise settles when every image has been tried; failures leave placeholders.
 */
export function loadSurfaceLibrary(base: string, detail: boolean, signal: AbortSignal, holder: object): Promise<void> {
  releaseSurfaceLibrary();
  const sets = new Map<SurfaceKind, SurfaceSet>();
  const jobs: Promise<void>[] = [];
  for (const kind of SURFACE_KINDS) {
    const spec = library.materials[kind] as unknown as { tileM: number; meanLinearAlbedo: number[]; albedo: Entry; normal: Entry; orm: Entry };
    const set: SurfaceSet = {
      albedo: placeholder(spec.meanLinearAlbedo.map(srgb8), true, spec.albedo.url),
      normal: detail ? placeholder([0.5, 0.5, 1], false, spec.normal.url) : null,
      orm: detail ? placeholder([1, 0.85, 0], false, spec.orm.url) : null,
      tileM: spec.tileM, mean: new THREE.Vector3(...spec.meanLinearAlbedo),
    };
    sets.set(kind, set);
    for (const [slot, entry] of [['albedo', spec.albedo], ['normal', spec.normal], ['orm', spec.orm]] as const) {
      const texture = set[slot];
      if (!texture) continue;
      jobs.push(readBitmap(entry, base, signal).then(bitmap => {
        // A released or replaced library must not adopt late images.
        if (active !== sets || signal.aborted) { bitmap.close(); return; }
        fill(texture, bitmap, entry.url);
      }));
    }
  }
  active = sets;
  owner = holder;
  return Promise.allSettled(jobs).then(results => {
    const failed = results.filter(result => result.status === 'rejected');
    if (failed.length && !signal.aborted) throw (failed[0] as PromiseRejectedResult).reason;
  });
}

/** Only the session that installed the library can release it. */
export function releaseSurfaceLibrary(holder?: object): void {
  if (holder && holder !== owner) return;
  for (const set of active?.values() ?? []) { destroy(set.albedo); destroy(set.normal); destroy(set.orm); }
  active = null;
  owner = null;
}

export type ProjectionMode = 'wall' | 'roof' | 'auto';

/** Uniforms for one pooled material; the texture objects are shared. */
export function surfaceUniforms(set: SurfaceSet, normalStrength: number, roughnessWeight: number, occlusion: number): Record<string, THREE.IUniform> {
  return {
    townLibAlbedo: { value: set.albedo },
    townLibNormal: { value: set.normal },
    townLibOrm: { value: set.orm },
    townLibTile: { value: set.tileM },
    townLibMean: { value: set.mean },
    townLibNormalStrength: { value: normalStrength },
    townLibRoughnessWeight: { value: roughnessWeight },
    townLibOcclusion: { value: occlusion },
  };
}

export function surfaceDeclarations(detail: boolean): string {
  return `
uniform sampler2D townLibAlbedo;
uniform float townLibTile, townLibNormalStrength, townLibRoughnessWeight, townLibOcclusion;
uniform vec3 townLibMean;
${detail ? 'uniform sampler2D townLibNormal, townLibOrm;\n#define TOWN_LIB_DETAIL' : ''}
`;
}

/**
 * Chooses a per-face projection frame and samples the set. Walls map along the
 * wall and straight up (clapboard laps stay level), roofs along the eave and up
 * the slope (shingle courses parallel to the eave, lapping downhill), and
 * pavement in plan. The face normal comes from screen derivatives, so smooth or
 * flat source normals, missing UVs and tile LODs all give the same frame.
 */
export function surfaceSampling(mode: ProjectionMode, world = 'vTownArtWorld', normal = 'vTownArtNormal'): string {
  const vertical = mode === 'auto' ? 'abs(townLibFace.y) < 0.72' : mode === 'roof' ? 'townLibEL > 0.12' : 'townLibEL > 0.05';
  // The interpolated vertex normal is exact on planar faces. A normal from
  // screen derivatives of world coordinates (kilometres from the origin) is
  // noisy enough to scramble the projection by metres from pixel to pixel.
  return `
vec3 townLibFace = normalize(${normal});
if (dot(townLibFace, cameraPosition - ${world}) < 0.0) townLibFace = -townLibFace;
vec3 townLibT = vec3(1.0,0.0,0.0), townLibB = vec3(0.0,0.0,-1.0);
vec2 townLibUV = vec2(${world}.x, -${world}.z);
vec3 townLibE = cross(vec3(0.0,1.0,0.0), townLibFace);
float townLibEL = length(townLibE);
if (${vertical}) {
  townLibT = townLibE / max(townLibEL, 1e-4);
  townLibB = normalize(cross(townLibFace, townLibT));
  townLibUV = vec2(dot(${world}, townLibT), dot(${world}, townLibB));
}
vec2 townLibST = townLibUV / townLibTile;
vec3 townLibAlb = texture2D(townLibAlbedo, townLibST).rgb;
float townLibDetailFade = 1.0 - smoothstep(45.0, 160.0, length(cameraPosition - ${world}));
#ifdef TOWN_LIB_DETAIL
vec3 townLibOrmS = texture2D(townLibOrm, townLibST).rgb;
vec3 townLibMapN = texture2D(townLibNormal, townLibST).xyz * 2.0 - 1.0;
#else
vec3 townLibOrmS = vec3(1.0, 0.8, 0.0);
vec3 townLibMapN = vec3(0.0, 0.0, 1.0);
#endif
`;
}

/** Adds the sampled relief to three's (smooth or flat) view-space normal. */
export const SURFACE_NORMAL = `
#include <normal_fragment_maps>
#ifdef TOWN_LIB_DETAIL
vec3 townLibPerturb = (townLibT * townLibMapN.x + townLibB * townLibMapN.y) * townLibNormalStrength * townLibDetailFade;
normal = normalize(normal + (viewMatrix * vec4(townLibPerturb, 0.0)).xyz);
#endif
`;

export const SURFACE_ROUGHNESS = `
#include <roughnessmap_fragment>
roughnessFactor = mix(roughnessFactor, townLibOrmS.g, townLibRoughnessWeight);
`;

/** Cavity occlusion only affects ambient/environment light, like an aoMap. */
export const SURFACE_OCCLUSION = `
#include <aomap_fragment>
float townLibAO = mix(1.0, townLibOrmS.r, townLibOcclusion);
reflectedLight.indirectDiffuse *= townLibAO;
reflectedLight.indirectSpecular *= townLibAO;
`;

export type SurfaceUse = { set: SurfaceKind; mode: ProjectionMode; normal: number; roughness: number; occlusion: number };

/** Albedo operations shared by every owner of a library surface. */
export const SURFACE_ALBEDO = {
  /** Paint colour times boards, joints and cavities (clapboard). */
  tint: 'diffuseColor.rgb *= townLibAlb;',
  /** Keeps the family colour as the mean (stone, concrete, foundations). */
  relative: 'diffuseColor.rgb *= townLibAlb / max(vec3(0.02), townLibMean);',
} as const;

/**
 * For materials outside the art pool (crafted frontages): injects the library
 * after their own map treatment. `world` names their world-position varying.
 * Returns false (and changes nothing) when the set has not been loaded.
 */
export function installSurfaceChunks(shader: { uniforms: Record<string, THREE.IUniform>; fragmentShader: string }, use: SurfaceUse, world: string, albedo: string, normal: string): boolean {
  const set = surfaceSet(use.set);
  if (!set) return false;
  for (const anchor of ['#include <map_fragment>', '#include <normal_fragment_maps>', '#include <roughnessmap_fragment>', '#include <aomap_fragment>']) {
    if (!shader.fragmentShader.includes(anchor)) throw new Error('Town surface library shader anchors changed.');
  }
  Object.assign(shader.uniforms, surfaceUniforms(set, use.normal, use.roughness, use.occlusion));
  shader.fragmentShader = surfaceDeclarations(!!set.normal) + shader.fragmentShader
    .replace('#include <map_fragment>', `#include <map_fragment>\n${surfaceSampling(use.mode, world, normal)}\n${albedo}\n`)
    .replace('#include <normal_fragment_maps>', SURFACE_NORMAL)
    .replace('#include <roughnessmap_fragment>', SURFACE_ROUGHNESS)
    .replace('#include <aomap_fragment>', SURFACE_OCCLUSION);
  return true;
}

export function surfaceLibraryState(kind: SurfaceKind): 'detail' | 'albedo' | 'off' {
  const set = surfaceSet(kind);
  return set ? set.normal ? 'detail' : 'albedo' : 'off';
}
