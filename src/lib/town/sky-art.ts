import * as THREE from 'three';
import type { Sky } from 'three/examples/jsm/objects/Sky.js';
import { createSummerSky } from './atmosphere';
import { withLoadDeadline } from './critical-load';

export const SKY_ART_URL = '/town-finish/v1/art/sky-color-v1-8dadf831b232.webp';

/** Optional photographic sky artwork; provenance lives in sky-art-v1.json.
 * Bitmap orientation supplies the vertical flip because WebGL ignores
 * texture.flipY for ImageBitmap uploads. The shader explicitly decodes sRGB. */
export async function loadSkyArt(signal: AbortSignal): Promise<THREE.Texture> {
  const response = await fetch(SKY_ART_URL, { signal });
  if (!response.ok) throw new Error('Sky artwork unavailable.');
  const bitmap = await createImageBitmap(await response.blob(), { imageOrientation: 'flipY', premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
  if (signal.aborted) { bitmap.close(); throw new DOMException('Sky loading cancelled', 'AbortError'); }
  const texture = new THREE.Texture(bitmap);
  texture.name = 'Late summer photographic sky'; texture.colorSpace = THREE.NoColorSpace; texture.flipY = false;
  texture.wrapS = THREE.RepeatWrapping; texture.wrapT = THREE.ClampToEdgeWrapping;
  // This smooth sky field needs no mip chain. Linear filtering also avoids
  // undefined implicit derivatives along the panorama's seam-blending boundary.
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter; texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

/** Replace procedural cloud shading only after the panorama exists. The same
 * linear radiance drives visible sky and PMREM; the horizon and sun stay shared. */
export function installSkyArt(sky: Sky, texture: THREE.Texture): void {
  const start = 'vec3 color = mix(summerHorizon', end = '// A broad warm scatter';
  const shader = sky.material.fragmentShader, from = shader.indexOf(start), to = shader.indexOf(end, from);
  if (from < 0 || to < 0) throw new Error('Sky artwork shader anchors changed.');
  sky.material.uniforms.summerSkyArt = { value: texture };
  sky.material.fragmentShader = `uniform sampler2D summerSkyArt;
vec3 townSkyLinear(vec3 color) {
  return mix(color/12.92,pow((color+0.055)/1.055,vec3(2.4)),step(vec3(0.04045),color));
}
vec3 townSkySample(vec2 uv) {
  float wrapped=fract(uv.x);
  float edge=min(wrapped,1.0-wrapped);
  if(edge<0.018) {
    // Keep sampling coordinates continuous across atan's longitude jump.
    // RepeatWrapping handles negative U without a discontinuous mip derivative.
    float seamU=wrapped>0.5?wrapped-1.0:wrapped;
    vec3 color=texture2D(summerSkyArt,vec2(seamU,uv.y)).rgb;
    vec3 opposite=texture2D(summerSkyArt,vec2(-seamU,uv.y)).rgb;
    return mix((color+opposite)*0.5,color,smoothstep(0.0,0.018,edge));
  }
  return texture2D(summerSkyArt,uv).rgb;
}\n${shader.slice(0, from)}
      vec3 sunDirection = normalize(vSunDirection);
      float sunFacing = max(0.0,dot(direction,sunDirection));
      vec3 color = mix(summerHorizon,summerZenith,pow(smoothstep(0.0,0.72,elevation),0.65));
      color = townEveningSky(color,direction,sunDirection);
      // The panorama's central glow faces the physical sun. Its upper half
      // maps to positive elevations after bitmap decoding supplies flipY.
      // Compress cloud height into the driving view while keeping the horizon
      // and zenith fixed; below the horizon the procedural landscape still wins.
      float skyLatitude = asin(clamp(direction.y,0.0,1.0))*0.636619772;
      vec2 skyUV = vec2((atan(direction.z,direction.x)-atan(sunDirection.z,sunDirection.x))*0.159154943+0.5,0.5+0.5*pow(skyLatitude,0.65));
      vec3 skyArt = townSkyLinear(townSkySample(skyUV))*2.2;
      // Keep blue gaps blue while low, sun-facing cloud highlights pick up
      // the same amber light as the street. Apply the shared scatter to the
      // artwork too: replacing the procedural field must not erase sunset.
      float skyPeak = max(max(skyArt.r,skyArt.g),skyArt.b);
      float cloudNeutral = min(min(skyArt.r,skyArt.g),skyArt.b)/max(skyPeak,0.0001);
      float cloudHighlight = smoothstep(0.45,0.8,cloudNeutral)*smoothstep(0.18,0.75,skyPeak);
      float cloudWarmth = cloudHighlight*pow(sunFacing,3.0)*(1.0-smoothstep(0.25,0.85,elevation));
      skyArt *= mix(vec3(1.0),vec3(1.3,1.02,0.7),cloudWarmth);
      skyArt = townEveningSky(skyArt,direction,sunDirection);
      color = mix(color,skyArt,smoothstep(0.0,0.10,elevation));
      ${shader.slice(to)}`;
  sky.material.needsUpdate = true;
}

/** Startup can await the actual artwork and reflection generation before GPU
 * warmup. Slow/failed images keep the procedural sky, without blocking forever.
 * The session owns dispose; its environment owner takes over the PMREM target. */
export function prepareSkyArt(renderer: THREE.WebGLRenderer, sky: Sky, direction: THREE.Vector3, signal: AbortSignal, replaceEnvironment: (target: THREE.WebGLRenderTarget) => void): { ready: Promise<void>; dispose: () => void } {
  const request = new AbortController();
  let texture: THREE.Texture | undefined, stopped = false;
  const dispose = (): void => {
    if (stopped) return; stopped = true; request.abort(); signal.removeEventListener('abort', dispose);
    texture?.dispose(); (texture?.image as ImageBitmap | undefined)?.close(); texture = undefined;
  };
  if (signal.aborted) { dispose(); return { ready: Promise.resolve(), dispose }; }
  signal.addEventListener('abort', dispose, { once: true });
  const ready = withLoadDeadline(request.signal, async child => {
    const loaded = await loadSkyArt(child);
    if (stopped || child.aborted || renderer.getContext().isContextLost()) { loaded.dispose(); (loaded.image as ImageBitmap).close(); dispose(); return; }
    texture = loaded;
    const reflection = createSummerSky(direction, { surroundings: true }), scene = new THREE.Scene();
    let pmrem: THREE.PMREMGenerator | undefined;
    let target: THREE.WebGLRenderTarget | undefined;
    const originalShader = sky.material.fragmentShader, originalUniform = sky.material.uniforms.summerSkyArt;
    let installed = false;
    try {
      pmrem = new THREE.PMREMGenerator(renderer);
      installSkyArt(reflection, loaded); scene.add(reflection);
      target = pmrem.fromScene(scene, 0.04);
      if (stopped || child.aborted || renderer.getContext().isContextLost()) throw new Error('Sky renderer unavailable.');
      installSkyArt(sky, loaded); installed = true;
      replaceEnvironment(target); target = undefined;
    } catch (error) {
      if (installed) {
        sky.material.fragmentShader = originalShader;
        if (originalUniform) sky.material.uniforms.summerSkyArt = originalUniform;
        else delete sky.material.uniforms.summerSkyArt;
        sky.material.needsUpdate = true;
      }
      throw error;
    } finally {
      target?.dispose(); pmrem?.dispose(); reflection.geometry.dispose(); reflection.material.dispose();
    }
  }, { label: 'Sky artwork', timeoutMs: 12000 }).catch(() => { dispose(); });
  return { ready, dispose };
}

/** Legacy streaming owner; readiness-aware startup uses prepareSkyArt instead. */
export function streamSkyArt(renderer: THREE.WebGLRenderer, sky: Sky, direction: THREE.Vector3, signal: AbortSignal, replaceEnvironment: (target: THREE.WebGLRenderTarget) => void): () => void {
  return prepareSkyArt(renderer, sky, direction, signal, replaceEnvironment).dispose;
}
