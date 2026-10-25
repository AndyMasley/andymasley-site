import * as THREE from 'three';
import { BlendFunction, BloomEffect, Effect, EffectComposer, EffectPass, RenderPass, ToneMappingEffect, ToneMappingMode } from 'postprocessing';

// After the Webster drive's camera finish: HDR render, restrained bloom for the glowing water,
// the AgX filmic curve, then contrast-adaptive sharpening and a gentle photographic grade.
export const FINISH = {
  exposure: 1.0,
  bloom: { threshold: 0.9, smoothing: 0.45, intensity: 0.85, radius: 0.62, levels: 6 },
  grade: { contrast: 1.18, saturation: 1.12, lift: -0.008, shadowTint: [0.97, 1.0, 1.03], highlightTint: [1.04, 1.0, 0.95], vignette: 0.28, sharpen: 0.45 },
};

const GRADE = /* glsl */`
uniform float contrast, saturation, lift, vignette, sharpen;
uniform vec3 shadowTint, highlightTint;
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec3 c = clamp(inputColor.rgb, 0.0, 1.0);
  if (sharpen > 0.0) {
    vec3 n = clamp(texture2D(inputBuffer, uv + vec2(0.0, texelSize.y)).rgb, 0.0, 1.0);
    vec3 s = clamp(texture2D(inputBuffer, uv - vec2(0.0, texelSize.y)).rgb, 0.0, 1.0);
    vec3 e = clamp(texture2D(inputBuffer, uv + vec2(texelSize.x, 0.0)).rgb, 0.0, 1.0);
    vec3 w = clamp(texture2D(inputBuffer, uv - vec2(texelSize.x, 0.0)).rgb, 0.0, 1.0);
    vec3 mn = min(c, min(min(n, s), min(e, w))), mx = max(c, max(max(n, s), max(e, w)));
    vec3 amp = sqrt(clamp(min(mn, 1.0 - mx) / max(mx, vec3(1e-4)), 0.0, 1.0));
    vec3 wt = amp * (-1.0 / mix(8.0, 5.0, sharpen));
    c = clamp((c + (n + s + e + w) * wt) / (1.0 + 4.0 * wt), 0.0, 1.0);
  }
  vec3 p = pow(c, vec3(1.0 / 2.2));
  float l = dot(p, vec3(0.2126, 0.7152, 0.0722));
  p = mix(vec3(l), p, saturation);
  vec3 sc = clamp(p, 0.0, 1.0); sc = sc * sc * (3.0 - 2.0 * sc);
  p = mix(p, sc, clamp(contrast - 1.0, 0.0, 1.0) * 1.6);
  p = p + lift * (1.0 - p);
  p *= mix(shadowTint, highlightTint, smoothstep(0.08, 0.85, l));
  vec2 d = (uv - 0.5) * vec2(1.0, 0.85);
  p *= 1.0 - vignette * smoothstep(0.10, 0.62, dot(d, d) * 2.0);
  outputColor = vec4(pow(max(p, 0.0), vec3(2.2)), inputColor.a);
}`;

// Additive light (dense flow particles) can pile up to hundreds of times white; anything past ~24 is white after the
// filmic curve anyway, and unbounded values upset the bloom chain, so clamp before it.
class ClampEffect extends Effect {
  constructor() {
    super('HdrClamp', /* glsl */`void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) { outputColor = vec4(min(inputColor.rgb, vec3(24.0)), inputColor.a); }`, { blendFunction: BlendFunction.SRC });
  }
}

class GradeEffect extends Effect {
  constructor(o) {
    super('WaterGrade', GRADE, {
      blendFunction: BlendFunction.SRC,
      uniforms: new Map([
        ['contrast', new THREE.Uniform(o.contrast)], ['saturation', new THREE.Uniform(o.saturation)], ['lift', new THREE.Uniform(o.lift)],
        ['vignette', new THREE.Uniform(o.vignette)], ['sharpen', new THREE.Uniform(o.sharpen)],
        ['shadowTint', new THREE.Uniform(new THREE.Vector3(...o.shadowTint))], ['highlightTint', new THREE.Uniform(new THREE.Vector3(...o.highlightTint))],
      ]),
    });
  }
}

export function createFinish(renderer, scene, camera, { quality = 'high' } = {}) {
  if (quality === 'low') {
    renderer.toneMapping = THREE.AgXToneMapping;
    renderer.toneMappingExposure = FINISH.exposure;
    return { render: () => renderer.render(scene, camera), setSize: () => {}, composer: null };
  }
  renderer.toneMapping = THREE.NoToneMapping;
  const composer = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType, multisampling: quality === 'high' ? 4 : 0 });
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new EffectPass(camera, new ClampEffect()));
  const bloom = new BloomEffect({ luminanceThreshold: FINISH.bloom.threshold, luminanceSmoothing: FINISH.bloom.smoothing, intensity: FINISH.bloom.intensity, radius: FINISH.bloom.radius, levels: FINISH.bloom.levels, mipmapBlur: true });
  const tone = new ToneMappingEffect({ mode: ToneMappingMode.AGX });
  composer.addPass(new EffectPass(camera, bloom, tone));
  composer.addPass(new EffectPass(camera, new GradeEffect(FINISH.grade)));
  return { render: (dt) => composer.render(dt), setSize: (w, h) => composer.setSize(w, h), composer, bloom };
}
