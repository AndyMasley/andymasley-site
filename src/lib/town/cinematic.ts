import * as THREE from 'three';
import { BlendFunction, BloomEffect, Effect, EffectComposer, EffectPass, RenderPass, ShaderPass, ToneMappingEffect, ToneMappingMode } from 'postprocessing';
import { N8AOPostPass } from 'n8ao';

/**
 * Desktop camera finish: screen-space ambient occlusion, a restrained HDR
 * bloom, the existing ACES filmic curve and a small photographic grade.
 *
 * The Webster reference photographs are dominated by contact shade (under
 * parked cars, hedges, eaves and curb faces), crisp pale trim against red
 * masonry, and a quiet saturated summer sky. Occlusion supplies the contact
 * shade the single directional shadow cannot; the grade restores the
 * separation between sunlit and shaded faces. None of this changes geometry,
 * source colors or the driving model, and Low/mobile rendering stays direct.
 */
export const FILM = {
  multisampling: 4,
  maxRadiance: 24,
  ao: { radius: 2.4, distanceFalloff: 1.0, intensity: 2.5, color: '#101824', samples: 16, denoiseSamples: 8, denoiseRadius: 12 },
  bloom: { threshold: 2.0, smoothing: 0.5, intensity: 0.3, radius: 0.72, levels: 6 },
  grade: { contrast: 1.05, saturation: 1.08, shadowTint: [0.965, 0.99, 1.04], highlightTint: [1.03, 1.0, 0.965], vignette: 0.2 },
} as const;

const GRADE = /* glsl */ `
uniform float contrast;
uniform float saturation;
uniform vec3 shadowTint;
uniform vec3 highlightTint;
uniform float vignette;
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  // Grade in an approximately perceptual space after the filmic curve.
  vec3 p = pow(clamp(inputColor.rgb, 0.0, 1.0), vec3(1.0 / 2.2));
  float luma = dot(p, vec3(0.2126, 0.7152, 0.0722));
  p = mix(vec3(luma), p, saturation);
  // Gentle S-curve around mid-grey keeps highlights and blacks unclipped.
  vec3 s = p * p * (3.0 - 2.0 * p);
  p = mix(p, s, clamp(contrast - 1.0, 0.0, 1.0) * 1.6);
  p *= mix(shadowTint, highlightTint, smoothstep(0.08, 0.85, luma));
  vec2 d = (uv - 0.5) * vec2(1.0, 0.82);
  p *= 1.0 - vignette * smoothstep(0.12, 0.62, dot(d, d) * 2.0);
  outputColor = vec4(pow(max(p, 0.0), vec3(2.2)), inputColor.a);
}`;

// A non-finite or extreme single pixel (a degenerate normal, a grazing sun glint)
// is invisible in a direct 8-bit render but becomes a large disc once bloom
// spreads it. Scene-referred values stay untouched below the cap.
const SANITIZE = new THREE.ShaderMaterial({
  name: 'WebsterSanitize',
  uniforms: { inputBuffer: new THREE.Uniform(null) },
  depthWrite: false,
  depthTest: false,
  vertexShader: /* glsl */ `
varying vec2 vUv;
void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 1.0, 1.0); }`,
  fragmentShader: /* glsl */ `
uniform sampler2D inputBuffer;
varying vec2 vUv;
void main() {
  vec4 c = texture2D(inputBuffer, vUv);
  bool bad = any(isnan(c.rgb)) || any(isinf(c.rgb));
  gl_FragColor = vec4(bad ? vec3(0.0) : min(max(c.rgb, vec3(0.0)), vec3(${FILM.maxRadiance.toFixed(1)})), c.a);
}`,
});

class GradeEffect extends Effect {
  constructor() {
    const { contrast, saturation, shadowTint, highlightTint, vignette } = FILM.grade;
    super('WebsterGrade', GRADE, {
      blendFunction: BlendFunction.SRC,
      uniforms: new Map<string, THREE.Uniform>([
        ['contrast', new THREE.Uniform(contrast)],
        ['saturation', new THREE.Uniform(saturation)],
        ['shadowTint', new THREE.Uniform(new THREE.Vector3(...shadowTint))],
        ['highlightTint', new THREE.Uniform(new THREE.Vector3(...highlightTint))],
        ['vignette', new THREE.Uniform(vignette)],
      ]),
    });
  }
}

export interface CinematicMetrics { enabled: boolean; multisampling: number; aoHalfRes: boolean; width: number; height: number }

export class CinematicRenderer {
  private readonly composer: EffectComposer;
  private readonly ao: N8AOPostPass;
  private disposed = false;

  constructor(private readonly renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, options: { halfResAO: boolean }) {
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    this.composer = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType, multisampling: FILM.multisampling });
    this.composer.addPass(new RenderPass(scene, camera));
    this.ao = new N8AOPostPass(scene, camera, Math.max(1, size.x), Math.max(1, size.y));
    const ao = this.ao.configuration;
    // Transparent water, glass and foliage cards already write the depth that
    // matters here; a second transparent pass per frame is not worth its cost.
    this.ao.autoDetectTransparency = false;
    ao.transparencyAware = false;
    ao.gammaCorrection = false;
    ao.halfRes = options.halfResAO;
    ao.aoSamples = FILM.ao.samples;
    ao.denoiseSamples = FILM.ao.denoiseSamples;
    ao.denoiseRadius = FILM.ao.denoiseRadius;
    ao.aoRadius = FILM.ao.radius;
    ao.distanceFalloff = FILM.ao.distanceFalloff;
    ao.intensity = FILM.ao.intensity;
    ao.color = new THREE.Color(FILM.ao.color);
    this.composer.addPass(this.ao);
    this.composer.addPass(new ShaderPass(SANITIZE.clone(), 'inputBuffer'));
    const bloom = new BloomEffect({ mipmapBlur: true, luminanceThreshold: FILM.bloom.threshold, luminanceSmoothing: FILM.bloom.smoothing, intensity: FILM.bloom.intensity, radius: FILM.bloom.radius, levels: FILM.bloom.levels });
    const toneMapping = new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC });
    const finish = new EffectPass(camera, bloom, toneMapping, new GradeEffect());
    finish.dithering = true;
    this.composer.addPass(finish);
  }

  /** False when this device cannot render into the finish's half-float targets. */
  verify(): boolean {
    const gl = this.renderer.getContext(), previous = this.renderer.getRenderTarget();
    try {
      for (const target of [this.composer.inputBuffer, this.composer.outputBuffer]) {
        this.renderer.setRenderTarget(target);
        if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) return false;
      }
      return true;
    } finally { this.renderer.setRenderTarget(previous); }
  }

  setSize(width: number, height: number): void {
    if (!this.disposed) this.composer.setSize(Math.max(1, width), Math.max(1, height), false);
  }

  /** Cheaper configuration for slow devices; it does not recompile scene materials. */
  reduce(): boolean {
    if (this.composer.multisampling > 0) { this.composer.multisampling = 0; return true; }
    if (!this.ao.configuration.halfRes) { this.ao.configuration.halfRes = true; return true; }
    return false;
  }

  render(deltaSeconds: number): void {
    if (!this.disposed) this.composer.render(deltaSeconds);
  }

  metrics(): CinematicMetrics {
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    return { enabled: !this.disposed, multisampling: this.composer.multisampling, aoHalfRes: this.ao.configuration.halfRes, width: size.x, height: size.y };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    // The composer disposes its passes, their targets and the finish effects.
    // N8AO keeps its shader quads in helper objects the base Pass cleanup does
    // not reach, so release those materials and geometries here.
    for (const value of Object.values(this.ao as unknown as Record<string, unknown>)) {
      const quad = value as { _mesh?: unknown; dispose?: () => void } | null;
      if (quad && typeof quad === 'object' && '_mesh' in quad && typeof quad.dispose === 'function') quad.dispose();
    }
    this.composer.dispose();
  }
}
