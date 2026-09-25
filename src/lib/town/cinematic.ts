import * as THREE from 'three';
import { BlendFunction, BloomEffect, Effect, EffectAttribute, EffectComposer, EffectPass, RenderPass, ShaderPass, ToneMappingEffect, ToneMappingMode } from 'postprocessing';
import { N8AOPostPass } from 'n8ao';

/**
 * Desktop camera finish: screen-space ambient occlusion, a restrained HDR
 * bloom, the AgX filmic curve, contrast-adaptive sharpening and a photographic grade.
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
  // AgX keeps bright walls, sky and sunlit lawn from clipping to flat cyan-white
  // and keeps shade legible; the grade then restores punch and saturation.
  tone: 'agx',
  exposure: 1.2,
  // Shade stays close to neutral: the blue sky fill already cools it, and a
  // stronger tint turns shaded lawns and hedges teal.
  grade: { contrast: 1.45, saturation: 1.3, lift: -0.015, gamma: 1, gain: 1, shadowTint: [0.975, 1.0, 1.025], highlightTint: [1.05, 1.0, 0.93], vignette: 0.2 },
  // Contrast-adaptive sharpening restores the texture detail that multisampling
  // and the half-float resolve soften; 0 is off, 1 the strongest setting.
  sharpen: 0.5,
  // Camera motion blur: a 180-degree shutter over the frame's own camera
  // motion, capped in pixels. The player's car moves with the camera and is
  // masked out; nothing blurs while paused or with the steady camera.
  motion: { shutter: 0.5, maxPixels: 22, samples: 9 },
} as const;

const GRADE = /* glsl */ `
uniform float contrast;
uniform float saturation;
uniform float lift;
uniform float gamma;
uniform float gain;
uniform vec3 shadowTint;
uniform vec3 highlightTint;
uniform float vignette;
uniform float sharpen;
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec3 c = clamp(inputColor.rgb, 0.0, 1.0);
  // Contrast-adaptive sharpening (after AMD FidelityFX CAS): a four-neighbour
  // cross, weighted down where local contrast is already high, so edges do not
  // ring and flat sky or road stays clean.
  if (sharpen > 0.0) {
    vec3 n = clamp(texture2D(inputBuffer, uv + vec2(0.0, texelSize.y)).rgb, 0.0, 1.0);
    vec3 s = clamp(texture2D(inputBuffer, uv - vec2(0.0, texelSize.y)).rgb, 0.0, 1.0);
    vec3 e = clamp(texture2D(inputBuffer, uv + vec2(texelSize.x, 0.0)).rgb, 0.0, 1.0);
    vec3 w = clamp(texture2D(inputBuffer, uv - vec2(texelSize.x, 0.0)).rgb, 0.0, 1.0);
    vec3 mn = min(c, min(min(n, s), min(e, w)));
    vec3 mx = max(c, max(max(n, s), max(e, w)));
    vec3 amp = sqrt(clamp(min(mn, 1.0 - mx) / max(mx, vec3(1e-4)), 0.0, 1.0));
    vec3 weight = amp * (-1.0 / mix(8.0, 5.0, sharpen));
    c = clamp((c + (n + s + e + w) * weight) / (1.0 + 4.0 * weight), 0.0, 1.0);
  }
  // Grade in an approximately perceptual space after the filmic curve.
  vec3 p = pow(c, vec3(1.0 / 2.2));
  float luma = dot(p, vec3(0.2126, 0.7152, 0.0722));
  p = mix(vec3(luma), p, saturation);
  // Gentle S-curve around mid-grey keeps highlights and blacks unclipped.
  vec3 sc = clamp(p, 0.0, 1.0);
  sc = sc * sc * (3.0 - 2.0 * sc);
  p = mix(p, sc, clamp(contrast - 1.0, 0.0, 1.0) * 1.6);
  // Lift, gamma and gain (display-referred, like a colourist's wheels).
  p = gain * (p + lift * (1.0 - p));
  p = pow(max(p, 0.0), vec3(1.0 / gamma));
  p *= mix(shadowTint, highlightTint, smoothstep(0.08, 0.85, luma));
  vec2 d = (uv - 0.5) * vec2(1.0, 0.82);
  p *= 1.0 - vignette * smoothstep(0.12, 0.62, dot(d, d) * 2.0);
  outputColor = vec4(pow(max(p, 0.0), vec3(2.2)), inputColor.a);
}`;

const MOTION = /* glsl */ `
uniform mat4 previousViewProjection;
uniform mat4 inverseProjection;
uniform mat4 cameraWorld;
uniform mat4 subjectInverse;
uniform vec3 subjectHalf;
uniform float shutter;
uniform float maxPixels;
vec3 motionWorld(const in vec2 uv, const in float depth) {
  vec4 view = inverseProjection * vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
  return (cameraWorld * vec4(view.xyz / view.w, 1.0)).xyz;
}
bool motionOnSubject(const in vec3 world) {
  // The subject's origin is its road contact plane: the road under it still blurs.
  vec3 local = (subjectInverse * vec4(world, 1.0)).xyz;
  return abs(local.x) < subjectHalf.x && abs(local.z) < subjectHalf.z && local.y > 0.025 && local.y < subjectHalf.y;
}
void mainImage(const in vec4 inputColor, const in vec2 uv, const in float depth, out vec4 outputColor) {
  outputColor = inputColor;
  if (shutter <= 0.0) return;
  vec3 world = motionWorld(uv, depth);
  if (motionOnSubject(world)) return;
  vec4 previous = previousViewProjection * vec4(world, 1.0);
  if (previous.w <= 0.0) return;
  vec2 velocity = (uv - (previous.xy / previous.w * 0.5 + 0.5)) * shutter;
  float pixels = length(velocity * resolution);
  if (pixels < 0.75) return;
  velocity *= min(1.0, maxPixels / pixels);
  vec3 sum = inputColor.rgb;
  float weight = 1.0;
  for (int i = 0; i < ${FILM.motion.samples}; i++) {
    float t = (float(i) + 0.5) / float(${FILM.motion.samples}) - 0.5;
    vec2 at = uv + velocity * t;
    float sampleDepth = readDepth(at);
    // Never smear the car (or anything nearer than this pixel) into the background.
    if (motionOnSubject(motionWorld(at, sampleDepth)) || sampleDepth < depth - 0.0005) continue;
    sum += texture2D(inputBuffer, at).rgb;
    weight += 1.0;
  }
  outputColor = vec4(sum / weight, inputColor.a);
}`;

class MotionBlurEffect extends Effect {
  constructor() {
    super('WebsterMotionBlur', MOTION, {
      blendFunction: BlendFunction.SRC,
      attributes: EffectAttribute.CONVOLUTION | EffectAttribute.DEPTH,
      uniforms: new Map<string, THREE.Uniform>([
        ['previousViewProjection', new THREE.Uniform(new THREE.Matrix4())],
        ['inverseProjection', new THREE.Uniform(new THREE.Matrix4())],
        ['cameraWorld', new THREE.Uniform(new THREE.Matrix4())],
        ['subjectInverse', new THREE.Uniform(new THREE.Matrix4())],
        ['subjectHalf', new THREE.Uniform(new THREE.Vector3())],
        ['shutter', new THREE.Uniform(0)],
        ['maxPixels', new THREE.Uniform(FILM.motion.maxPixels)],
      ]),
    });
  }
}

/** Every tunable of the finish, for look development in the browser. */
export type FilmLook = {
  tone: 'aces' | 'agx'; exposure: number; contrast: number; saturation: number; lift: number; gamma: number; gain: number;
  shadowTint: number[]; highlightTint: number[]; vignette: number; sharpen: number; bloom: number; bloomThreshold: number; ao: number; aoRadius: number;
};

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
    const { contrast, saturation, lift, gamma, gain, shadowTint, highlightTint, vignette } = FILM.grade;
    super('WebsterGrade', GRADE, {
      blendFunction: BlendFunction.SRC,
      attributes: EffectAttribute.CONVOLUTION,
      uniforms: new Map<string, THREE.Uniform>([
        ['contrast', new THREE.Uniform(contrast)],
        ['saturation', new THREE.Uniform(saturation)],
        ['lift', new THREE.Uniform(lift)],
        ['gamma', new THREE.Uniform(gamma)],
        ['gain', new THREE.Uniform(gain)],
        ['shadowTint', new THREE.Uniform(new THREE.Vector3(...shadowTint))],
        ['highlightTint', new THREE.Uniform(new THREE.Vector3(...highlightTint))],
        ['vignette', new THREE.Uniform(vignette)],
        ['sharpen', new THREE.Uniform(FILM.sharpen)],
      ]),
    });
  }
}

export interface CinematicMetrics { enabled: boolean; multisampling: number; aoHalfRes: boolean; width: number; height: number }

export class CinematicRenderer {
  private readonly composer: EffectComposer;
  private readonly ao: N8AOPostPass;
  private readonly bloom: BloomEffect;
  private readonly toneMapping: ToneMappingEffect;
  private readonly grade: GradeEffect;
  private readonly motionBlur: MotionBlurEffect;
  private readonly previousViewProjection = new THREE.Matrix4();
  private readonly currentViewProjection = new THREE.Matrix4();
  private readonly previousCamera = new THREE.Vector3();
  private hasPrevious = false;
  private readonly previousExposure: number;
  private disposed = false;

  constructor(private readonly renderer: THREE.WebGLRenderer, scene: THREE.Scene, private readonly camera: THREE.PerspectiveCamera, options: { halfResAO: boolean }) {
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
    this.bloom = new BloomEffect({ mipmapBlur: true, luminanceThreshold: FILM.bloom.threshold, luminanceSmoothing: FILM.bloom.smoothing, intensity: FILM.bloom.intensity, radius: FILM.bloom.radius, levels: FILM.bloom.levels });
    this.toneMapping = new ToneMappingEffect({ mode: FILM.tone === 'agx' ? ToneMappingMode.AGX : ToneMappingMode.ACES_FILMIC });
    // The direct (Low/mobile) render keeps its own ACES exposure; restored on dispose.
    this.previousExposure = renderer.toneMappingExposure;
    renderer.toneMappingExposure = FILM.exposure;
    this.motionBlur = new MotionBlurEffect();
    this.composer.addPass(new EffectPass(camera, this.motionBlur, this.bloom, this.toneMapping));
    // Sharpening samples its neighbours, so the grade reads the tone-mapped
    // image in a pass of its own.
    this.grade = new GradeEffect();
    const finish = new EffectPass(camera, this.grade);
    finish.dithering = true;
    this.composer.addPass(finish);
  }

  /** Adjust the finish live (look development); unspecified values keep. */
  look(values: Partial<FilmLook>): void {
    const u = this.grade.uniforms;
    for (const key of ['contrast', 'saturation', 'lift', 'gamma', 'gain', 'vignette', 'sharpen'] as const) if (values[key] !== undefined) u.get(key)!.value = values[key];
    if (values.shadowTint) (u.get('shadowTint')!.value as THREE.Vector3).fromArray(values.shadowTint);
    if (values.highlightTint) (u.get('highlightTint')!.value as THREE.Vector3).fromArray(values.highlightTint);
    if (values.tone) this.toneMapping.mode = values.tone === 'agx' ? ToneMappingMode.AGX : ToneMappingMode.ACES_FILMIC;
    if (values.exposure !== undefined) this.renderer.toneMappingExposure = values.exposure;
    if (values.bloom !== undefined) this.bloom.intensity = values.bloom;
    if (values.bloomThreshold !== undefined) this.bloom.luminanceMaterial.threshold = values.bloomThreshold;
    if (values.ao !== undefined) this.ao.configuration.intensity = values.ao;
    if (values.aoRadius !== undefined) this.ao.configuration.aoRadius = values.aoRadius;
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

  /**
   * Camera motion blur for the coming frame. `subject` (the player's car)
   * travels with the camera and stays sharp; disabled frames reset history.
   */
  motion(subject: THREE.Object3D | undefined, enabled: boolean): void {
    const u = this.motionBlur.uniforms, camera = this.camera;
    camera.updateMatrixWorld();
    this.currentViewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    // A teleport or camera cut is not motion.
    const jumped = this.previousCamera.distanceTo(camera.position) > 6;
    const active = enabled && this.hasPrevious && !jumped;
    u.get('shutter')!.value = active ? FILM.motion.shutter : 0;
    (u.get('previousViewProjection')!.value as THREE.Matrix4).copy(this.hasPrevious ? this.previousViewProjection : this.currentViewProjection);
    (u.get('inverseProjection')!.value as THREE.Matrix4).copy(camera.projectionMatrixInverse);
    (u.get('cameraWorld')!.value as THREE.Matrix4).copy(camera.matrixWorld);
    if (subject?.visible) {
      subject.updateMatrixWorld();
      (u.get('subjectInverse')!.value as THREE.Matrix4).copy(subject.matrixWorld).invert();
      const dimensions = subject.userData.dimensions as { length?: number; mirrorWidth?: number } | undefined;
      (u.get('subjectHalf')!.value as THREE.Vector3).set((dimensions?.mirrorWidth ?? 2.3) / 2 + 0.08, 1.75, (dimensions?.length ?? 4.6) / 2 + 0.12);
    } else (u.get('subjectHalf')!.value as THREE.Vector3).set(0, 0, 0);
    this.previousViewProjection.copy(this.currentViewProjection);
    this.previousCamera.copy(camera.position);
    this.hasPrevious = enabled;
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
    this.renderer.toneMappingExposure = this.previousExposure;
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
