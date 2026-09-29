import * as THREE from 'three';
import type { Sky } from 'three/examples/jsm/objects/Sky.js';
import { createSummerSky } from './atmosphere';

export const CLOUD_DENSITY_URL = '/town-finish/v1/art/cloud-density-v1-41616ab20f0d.webp';

/** Optional density artwork. Bitmap orientation supplies the vertical flip
 * because WebGL ignores texture.flipY for ImageBitmap uploads. */
export async function loadCloudDensity(signal: AbortSignal): Promise<THREE.Texture> {
  const response = await fetch(CLOUD_DENSITY_URL, { signal });
  if (!response.ok) throw new Error('Cloud density unavailable.');
  const bitmap = await createImageBitmap(await response.blob(), { imageOrientation: 'flipY', premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
  if (signal.aborted) { bitmap.close(); throw new DOMException('Cloud loading cancelled', 'AbortError'); }
  const texture = new THREE.Texture(bitmap);
  texture.name = 'Late summer cloud density'; texture.colorSpace = THREE.NoColorSpace; texture.flipY = false;
  texture.wrapS = THREE.RepeatWrapping; texture.wrapT = THREE.ClampToEdgeWrapping;
  // This smooth sky field needs no mip chain. Linear filtering also avoids
  // undefined implicit derivatives along the panorama's seam-blending boundary.
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter; texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

/** Replace the two procedural density evaluations only once the asset exists.
 * Sky and PMREM keep the same horizon, sun, colours and density coordinates. */
export function installCloudDensity(sky: Sky, texture: THREE.Texture): void {
  const start = 'vec2 cloudUV = direction.xz', end = 'vec3 cloudShade =';
  const shader = sky.material.fragmentShader, from = shader.indexOf(start), to = shader.indexOf(end, from);
  if (from < 0 || to < 0) throw new Error('Cloud sky shader anchors changed.');
  const finish = shader.slice(to).replace('(1.0-smoothstep(0.54,0.63,field)) * smoothstep(0.50,0.55,field)', '(1.0-smoothstep(0.12,0.26,field)) * smoothstep(0.035,0.10,field)');
  sky.material.uniforms.summerCloudDensity = { value: texture };
  sky.material.fragmentShader = `uniform sampler2D summerCloudDensity;
float townCloudSample(vec2 uv) {
  float wrapped=fract(uv.x);
  float edge=min(wrapped,1.0-wrapped);
  if(edge<0.018) {
    // Keep sampling coordinates continuous across atan's longitude jump.
    // RepeatWrapping handles negative U without a discontinuous mip derivative.
    float seamU=wrapped>0.5?wrapped-1.0:wrapped;
    float density=texture2D(summerCloudDensity,vec2(seamU,uv.y)).r;
    float opposite=texture2D(summerCloudDensity,vec2(-seamU,uv.y)).r;
    return mix((density+opposite)*0.5,density,smoothstep(0.0,0.018,edge));
  }
  return texture2D(summerCloudDensity,uv).r;
}\n${shader.slice(0, from)}
      vec2 cloudUV = vec2(atan(direction.z,direction.x)*0.159154943+0.5,asin(clamp(direction.y,-1.0,1.0))*0.318309886+0.5);
      float field = townCloudSample(cloudUV);
      float lightField = townCloudSample(cloudUV+vec2(0.0018,0.0015));
      // Blend matching longitudes through the panorama edge instead of
      // punching a vertical clear-sky slit through dense cloud. Fade the pole.
      float cloud = smoothstep(0.035,0.26,field)*smoothstep(0.018,0.095,elevation)*(1.0-smoothstep(0.94,1.0,elevation));
      float cloudLight = clamp(0.06+pow(field,1.3)*0.94+(field-lightField)*0.45,0.06,1.0);
      ${finish}`;
  sky.material.needsUpdate = true;
}

/** Non-blocking, one-shot upgrade. The session owns the returned disposer;
 * its existing owner takes over each successfully generated environment. */
export function streamCloudSky(renderer: THREE.WebGLRenderer, sky: Sky, direction: THREE.Vector3, signal: AbortSignal, replaceEnvironment: (target: THREE.WebGLRenderTarget) => void): () => void {
  const request = new AbortController();
  let texture: THREE.Texture | undefined, stopped = false;
  const timer = setTimeout(() => request.abort(), 12000);
  const dispose = (): void => {
    if (stopped) return; stopped = true; request.abort(); clearTimeout(timer); signal.removeEventListener('abort', dispose);
    texture?.dispose(); (texture?.image as ImageBitmap | undefined)?.close(); texture = undefined;
  };
  if (signal.aborted) { dispose(); return dispose; }
  signal.addEventListener('abort', dispose, { once: true });
  void loadCloudDensity(request.signal).then(loaded => {
    clearTimeout(timer);
    if (stopped || request.signal.aborted || renderer.getContext().isContextLost()) { loaded.dispose(); (loaded.image as ImageBitmap).close(); return; }
    texture = loaded;
    const reflection = createSummerSky(direction, { surroundings: true }), scene = new THREE.Scene(), pmrem = new THREE.PMREMGenerator(renderer);
    let target: THREE.WebGLRenderTarget | undefined;
    try {
      installCloudDensity(reflection, loaded); scene.add(reflection);
      target = pmrem.fromScene(scene, 0.04);
      installCloudDensity(sky, loaded);
      replaceEnvironment(target); target = undefined;
    } finally {
      target?.dispose(); pmrem.dispose(); reflection.geometry.dispose(); reflection.material.dispose();
    }
  }).catch(() => { clearTimeout(timer); });
  return dispose;
}
