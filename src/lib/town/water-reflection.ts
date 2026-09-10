import * as THREE from 'three';
import lake from '../../../data/derived/town/lake-life.json';
import type { Quality } from './contracts';

/** VC-0383/0384/0388 motivate actual reflected shore forms. The retained lake
 * datum is shared with the source-qualified Princess berth; optical strength,
 * target size and distance limits are authored, not a water-quality survey. */
export const WATER_REFLECTION_LIMITS = {
  size: 384, intervalMs: 100, nearWaterM: 220, sceneRadiusM: 650,
  calls: 180, triangles: 350000, updateBudgetMs: 7, cooldownMs: 4000, inactiveTTLms: 5000,
  warmupBatchMaterials: 8, warmupTimeoutMs: 5000,
  reservedCrownCalls: 24, reservedCrownTriangles: 80000,
  lakeHeight: lake.height, planeToleranceM: .035,
  // Broad early-out only, rounded outward from the retained navigation-water
  // lake bounds. Actual selected water must still pass its own geometry tests.
  lakeBoundsXZ: [-1152, -316, 1773, 3784] as readonly number[],
} as const;
export type WaterReflectionMetrics = {
  active: boolean; reason: string; updates: number; calls: number; triangles: number;
  predictedCalls: number; predictedTriangles: number; includedMeshes: number;
  omittedMeshes: number; reflectedShoreMeshes: number; submissionMs: number;
  maxSubmissionMs: number; preflightMs: number; updateMs: number; maxUpdateMs: number;
  targetBytes: number; boundMaterials: number;
  warming: boolean; warmupBatches: number; warmupMaterials: number; warmupMs: number; maxWarmupMs: number;
  reservedCrownCalls:number; reservedCrownTriangles:number; reservedCrownMeshes:number;
};
type Binding = { compile: THREE.Material['onBeforeCompile']; key: THREE.Material['customProgramCacheKey']; hook: THREE.Material['onBeforeCompile']; reflectionKey: string; installed: boolean; onDispose: () => void };
type Candidate = { mesh: THREE.Mesh; calls: number; triangles: number; distance: number; priority: number; shore: boolean };
type WarmSpec = { key: string; source: THREE.Material; mesh: THREE.Mesh; side: THREE.Side; mode: 'water' | 'shore' };
type WarmEntry = WarmSpec & { clone: THREE.Material; ready: boolean; used: boolean; onDispose: () => void };
type WarmBatch = { generation: number; cancelled: boolean; entries: WarmEntry[]; timer?: ReturnType<typeof setTimeout> };
const names = new Set(['Mapped water | inferred level and appearance', 'Boundary context | water']);
const structuralRoles = new Set(['wall','roof','brick','siding','shingle','stucco','stone','foundation','trim','glass','door','recess']);
const waterMaterial = (m: THREE.Material): m is THREE.MeshStandardMaterial => m instanceof THREE.MeshStandardMaterial && names.has(m.name) && m.userData.townArt?.kind === 'water';
const materials = (m: THREE.Mesh): THREE.Material[] => Array.isArray(m.material) ? m.material : [m.material];
const meshName = (mesh: THREE.Object3D): string => {
  let name = mesh.name; for (let p = mesh.parent; p && !(p instanceof THREE.Scene); p = p.parent) name += ` ${p.name}`;
  return name;
};

/** Conservative submitted cost includes geometry groups, drawRange, instances,
 * and the two passes used by transparent double-sided standard materials. */
export function reflectionMeshCost(mesh: THREE.Mesh): { calls: number; triangles: number } {
  const g = mesh.geometry, count = g.index?.count ?? g.getAttribute('position')?.count ?? 0;
  const start = g.drawRange.start, end = Math.min(count, start + g.drawRange.count), ms = materials(mesh);
  const groups = Array.isArray(mesh.material) ? g.groups : [{ start: 0, count, materialIndex: 0 }];
  let calls = 0, triangles = 0;
  for (const group of groups) {
    const material = ms[group.materialIndex ?? 0];
    const n = Math.max(0, Math.min(end, group.start + group.count) - Math.max(start, group.start));
    if (!material?.visible || n < 3) continue;
    const passes = material.transparent && material.side === THREE.DoubleSide && !material.forceSinglePass ? 2 : 1;
    const instances = mesh instanceof THREE.InstancedMesh ? mesh.count : 1;
    if (!instances) continue;
    calls += passes; triangles += Math.floor(n / 3) * instances * passes;
  }
  return { calls, triangles };
}

/** Mirror a perspective camera in the retained horizontal plane and clip the
 * submerged half space. Uses the same oblique-plane construction as Three's
 * bundled Reflector, but owns neither a new water mesh nor scene geometry. */
export function reflectedWaterCamera(camera: THREE.PerspectiveCamera, height: number): { camera: THREE.PerspectiveCamera; textureMatrix: THREE.Matrix4 } | undefined {
  camera.updateMatrixWorld();
  const eye = new THREE.Vector3().setFromMatrixPosition(camera.matrixWorld);
  if (!Number.isFinite(height) || eye.y <= height + .08) return;
  const direction = camera.getWorldDirection(new THREE.Vector3()), up = new THREE.Vector3(0, 1, 0).transformDirection(camera.matrixWorld);
  const mirrored = new THREE.PerspectiveCamera();
  mirrored.position.set(eye.x, height * 2 - eye.y, eye.z);
  direction.y *= -1; up.y *= -1; mirrored.up.copy(up);
  mirrored.lookAt(mirrored.position.clone().add(direction));
  mirrored.near = camera.near; mirrored.far = camera.far;
  mirrored.layers.mask = camera.layers.mask;
  mirrored.updateMatrixWorld(); mirrored.projectionMatrix.copy(camera.projectionMatrix);
  const textureMatrix = new THREE.Matrix4().set(.5, 0, 0, .5, 0, .5, 0, .5, 0, 0, .5, .5, 0, 0, 0, 1)
    .multiply(mirrored.projectionMatrix).multiply(mirrored.matrixWorldInverse);
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -height).applyMatrix4(mirrored.matrixWorldInverse);
  const clip = new THREE.Vector4(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant), e = mirrored.projectionMatrix.elements;
  const q = new THREE.Vector4((Math.sign(clip.x) + e[8]) / e[0], (Math.sign(clip.y) + e[9]) / e[5], -1, (1 + e[10]) / e[14]);
  const divisor = clip.dot(q); if (!Number.isFinite(divisor) || Math.abs(divisor) < 1e-8) return;
  clip.multiplyScalar(2 / divisor);
  e[2] = clip.x; e[6] = clip.y; e[10] = clip.z + 1 - .0002; e[14] = clip.w;
  mirrored.projectionMatrixInverse.copy(mirrored.projectionMatrix).invert();
  return { camera: mirrored, textureMatrix };
}

function bounds(mesh: THREE.Mesh): THREE.Box3 | undefined {
  if (mesh instanceof THREE.InstancedMesh) {
    if (!mesh.boundingBox) mesh.computeBoundingBox();
    return mesh.boundingBox?.clone().applyMatrix4(mesh.matrixWorld);
  }
  if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
  return mesh.geometry.boundingBox?.clone().applyMatrix4(mesh.matrixWorld);
}
function distanceXZ(box: THREE.Box3, point: THREE.Vector3): number {
  return Math.hypot(Math.max(box.min.x - point.x, 0, point.x - box.max.x), Math.max(box.min.z - point.z, 0, point.z - box.max.z));
}

/** Program-relevant material and original geometry context. Source UUID catches
 * streamed replacements; layout/instancing/maps/defines catch reused materials
 * moving between native LODs. Values such as animation time are uniforms. */
function warmSignature(mesh: THREE.Mesh, material: THREE.Material, side: THREE.Side, context: string, mode: string, key: string): string {
  const m=material as THREE.MeshStandardMaterial & Record<string,unknown>;
  const textureState=Object.keys(m).filter(k=>m[k] instanceof THREE.Texture).sort().map(k=>{const t=m[k] as THREE.Texture;return[k,t.mapping,t.channel,t.colorSpace,t.type];});
  const flags=['fog','vertexColors','flatShading','transparent','forceSinglePass','alphaHash','premultipliedAlpha','dithering','normalMapType','wireframe','precision','toneMapped'].map(k=>m[k]);
  const layout=Object.entries(mesh.geometry.attributes).sort(([a],[b])=>a.localeCompare(b)).map(([name,a])=>[name,a.itemSize,a.normalized]);
  return JSON.stringify([mode,material.uuid,key,side,flags,m.alphaTest>0,m.defines,textureState,layout,mesh instanceof THREE.InstancedMesh,!!(mesh as THREE.InstancedMesh).instanceColor,
    !!(mesh as THREE.SkinnedMesh).isSkinnedMesh,Object.entries(mesh.geometry.morphAttributes).map(([k,v])=>[k,v.length]),
    (material as THREE.ShaderMaterial).vertexShader,(material as THREE.ShaderMaterial).fragmentShader,context]);
}

/** r160 compile() traverses hidden children too. This is an enumeration view of
 * exactly the selected original objects, not a reparented/rendered proxy scene.
 * Geometry, matrices, instancing and shader input context remain the originals. */
function compileView(entries: WarmEntry[]): THREE.Group {
  const view=new THREE.Group(); view.name='Optional lake shader warmup';
  view.traverse=(visit)=>{visit(view);for(const entry of entries){const old=entry.mesh.material;entry.mesh.material=entry.clone;try{visit(entry.mesh);}finally{entry.mesh.material=old;}}};
  view.traverseVisible=(visit)=>{visit(view);};
  return view;
}

export class TownWaterReflection {
  readonly metrics: WaterReflectionMetrics = { active: false, reason: 'off', updates: 0, calls: 0, triangles: 0, predictedCalls: 0, predictedTriangles: 0, includedMeshes: 0, omittedMeshes: 0, reflectedShoreMeshes: 0, submissionMs: 0, maxSubmissionMs: 0, preflightMs: 0, updateMs: 0, maxUpdateMs: 0, targetBytes: 0, boundMaterials: 0, warming:false,warmupBatches:0,warmupMaterials:0,warmupMs:0,maxWarmupMs:0,reservedCrownCalls:0,reservedCrownTriangles:0,reservedCrownMeshes:0 };
  private target?: THREE.WebGLRenderTarget;
  private readonly bindings = new Map<THREE.MeshStandardMaterial, Binding>();
  private readonly texture = { value: null as THREE.Texture | null };
  private readonly matrix = { value: new THREE.Matrix4() };
  private readonly enabled = { value: 0 };
  private readonly height = { value: WATER_REFLECTION_LIMITS.lakeHeight };
  private readonly lakeBounds = { value: new THREE.Vector4().fromArray(WATER_REFLECTION_LIMITS.lakeBoundsXZ) };
  private readonly capturedEye = new THREE.Vector3();
  private readonly capturedDirection = new THREE.Vector3();
  private last = -Infinity;
  private checked = -Infinity;
  private cooldown = -Infinity;
  private slow = 0;
  private disposed = false;
  private rendering = false;
  private generation=0;
  private readonly warmEntries=new Map<string,WarmEntry>();
  private warmed=new WeakMap<THREE.Material,Set<string>>();
  private batch?:WarmBatch;

  /** Register after the town art finish. The hook is installed only after its
   * onscreen program warms asynchronously; pooled materials stay world-owned. */
  bindWaterMaterial(material: THREE.Material): boolean {
    if (this.disposed || !waterMaterial(material)) return false;
    if (this.bindings.has(material)) return true;
    const compile = material.onBeforeCompile, key = material.customProgramCacheKey;
    const hook: THREE.Material['onBeforeCompile'] = (shader, renderer) => {
      compile.call(material, shader, renderer);
      if (!shader.fragmentShader.includes('varying vec3 vTownArtWorld;') || !shader.fragmentShader.includes('#include <opaque_fragment>')) throw new Error('Lake reflection requires the retained water art shader.');
      Object.assign(shader.uniforms, { townLakeReflection: this.texture, townLakeReflectionMatrix: this.matrix, townLakeReflectionEnabled: this.enabled, townLakeReflectionHeight: this.height, townLakeReflectionBounds: this.lakeBounds });
      shader.fragmentShader = `uniform sampler2D townLakeReflection;
uniform mat4 townLakeReflectionMatrix;
uniform float townLakeReflectionEnabled;
uniform float townLakeReflectionHeight;
uniform vec4 townLakeReflectionBounds;
${shader.fragmentShader}`.replace('#include <opaque_fragment>', `
// The render target is linear HDR; it receives the main tone mapping only once.
vec4 townLakeClip=townLakeReflectionMatrix*vec4(vTownArtWorld,1.0);
if(townLakeReflectionEnabled>.0 && abs(vTownArtWorld.y-townLakeReflectionHeight)<.035 && townLakeClip.w>0.0
 && vTownArtWorld.x>=townLakeReflectionBounds.x && vTownArtWorld.z>=townLakeReflectionBounds.y
 && vTownArtWorld.x<=townLakeReflectionBounds.z && vTownArtWorld.z<=townLakeReflectionBounds.w){
 vec2 townLakeUV=townLakeClip.xy/townLakeClip.w;
 vec3 townLakeNormal=inverseTransformDirection(normal,viewMatrix);
 townLakeUV+=townLakeNormal.xz*.009;
 float townLakeBorder=smoothstep(.005,.035,min(min(townLakeUV.x,townLakeUV.y),min(1.0-townLakeUV.x,1.0-townLakeUV.y)));
 float townLakeDistance=1.0-smoothstep(180.0,380.0,length(cameraPosition-vTownArtWorld));
 float townLakeFresnel=.08+.44*pow(1.0-clamp(abs(dot(normal,normalize(vViewPosition))),0.0,1.0),3.0);
 vec3 townLakeColor=texture2D(townLakeReflection,clamp(townLakeUV,vec2(.001),vec2(.999))).rgb;
 outgoingLight=mix(outgoingLight,townLakeColor,townLakeReflectionEnabled*townLakeBorder*townLakeDistance*townLakeFresnel);
}
#include <opaque_fragment>`);
    };
    const onDispose = () => { this.bindings.delete(material); material.removeEventListener('dispose', onDispose); this.metrics.boundMaterials = this.bindings.size; };
    // Material's default key uses its current hook; evaluate the old key before
    // replacing it so repeatedly binding cannot grow a self-referential key.
    const oldKey = key.call(material);
    material.addEventListener('dispose', onDispose);
    this.bindings.set(material, { compile, key, hook, reflectionKey:`${oldKey}|lake-planar-reflection-v1`,installed:false,onDispose }); this.metrics.boundMaterials = this.bindings.size;
    return true;
  }

  private dropWarm(entry:WarmEntry):void {
    entry.source.removeEventListener('dispose',entry.onDispose);
    if(this.warmEntries.get(entry.key)===entry)this.warmEntries.delete(entry.key);
    entry.clone.dispose(); // Material.dispose does not dispose borrowed texture maps.
  }
  private cancelWarmups():void {
    this.generation++;
    if(this.batch){this.batch.cancelled=true;clearTimeout(this.batch.timer);this.batch=undefined;}
    for(const entry of this.warmEntries.values())this.dropWarm(entry);
    this.metrics.warming=false;
  }

  /** A lost context invalidates all ready program assumptions. Our own timer is
   * cancelled synchronously before any clone or renderer cache is disposed. */
  resetContext():void {
    this.off('context-lost');this.releaseTarget();this.warmed=new WeakMap();this.checked=-Infinity;this.last=-Infinity;
    for(const [material,state] of this.bindings)if(state.installed){material.onBeforeCompile=state.compile;material.customProgramCacheKey=state.key;material.needsUpdate=true;state.installed=false;}
  }

  private warmSpecs(selected:Set<THREE.Mesh>,water:THREE.Mesh[],scene:THREE.Scene,renderer:THREE.WebGLRenderer):WarmSpec[] {
    const lights:string[]=[];scene.traverseVisible(o=>{if(o instanceof THREE.Light)lights.push(`${o.type}:${o.castShadow}:${o.layers.mask}`);});
    const context=JSON.stringify([scene.fog?.constructor.name,scene.environment?.uuid,lights.sort(),renderer.shadowMap.enabled,renderer.shadowMap.type,renderer.toneMapping,renderer.outputColorSpace]);
    const rows=new Map<string,WarmSpec>();
    for(const mode of ['water','shore'] as const)for(const mesh of mode==='water'?water:selected)for(const source of materials(mesh)){
      if(mode==='water'&&!waterMaterial(source))continue;
      const binding=this.bindings.get(source as THREE.MeshStandardMaterial);
      const programKey=mode==='water'&&binding?binding.reflectionKey:source.customProgramCacheKey();
      // r160 compileAsync polls only currentProgram. Separate private clones
      // ensure both passes of double-sided transparency are actually ready.
      const sides=source.transparent&&source.side===THREE.DoubleSide&&!source.forceSinglePass?[THREE.BackSide,THREE.FrontSide]:[source.side];
      for(const side of sides){const key=warmSignature(mesh,source,side,context,mode,programKey);rows.set(key,{key,source,mesh,side,mode});}
    }
    return [...rows.values()];
  }

  private collectAcquiredPrograms(renderer:THREE.WebGLRenderer):void {
    // A clone keeps the globally cached compiled program alive until an actual
    // original material has acquired it. Culled draws cannot falsely count.
    for(const entry of this.warmEntries.values()){
      if(!entry.ready)continue;
      const source=renderer.properties.get(entry.source).programs as Map<string,unknown>|undefined;
      const clone=renderer.properties.get(entry.clone).programs as Map<string,unknown>|undefined;
      if(!source?.size||!clone?.size||![...clone.values()].every(p=>[...source.values()].includes(p)))continue;
      const keys=this.warmed.get(entry.source)??new Set<string>();keys.add(entry.key);this.warmed.set(entry.source,keys);this.dropWarm(entry);
    }
  }

  private startWarmup(specs:WarmSpec[],renderer:THREE.WebGLRenderer,scene:THREE.Scene,camera:THREE.PerspectiveCamera,reflected:THREE.PerspectiveCamera):void {
    if(this.batch)return;
    const cold=specs.filter(s=>!this.warmed.get(s.source)?.has(s.key)&&!this.warmEntries.has(s.key)).slice(0,WATER_REFLECTION_LIMITS.warmupBatchMaterials);
    if(!cold.length)return;
    const began=performance.now(),generation=this.generation;
    const batch:WarmBatch={generation,cancelled:false,entries:[]};
    this.batch=batch;this.metrics.warming=true;
    for(const spec of cold){
      const clone=spec.source.clone(),binding=this.bindings.get(spec.source as THREE.MeshStandardMaterial);
      clone.onBeforeCompile=spec.mode==='water'&&binding?binding.hook:spec.source.onBeforeCompile;
      const key=spec.mode==='water'&&binding?binding.reflectionKey:spec.source.customProgramCacheKey();
      clone.customProgramCacheKey=()=>key;clone.side=spec.side;
      const entry:WarmEntry={...spec,clone,ready:false,used:false,onDispose:()=>{this.warmed.delete(spec.source);this.cancelWarmups();}};
      spec.source.addEventListener('dispose',entry.onDispose);this.warmEntries.set(entry.key,entry);batch.entries.push(entry);
    }
    const target=renderer.getRenderTarget(),cube=renderer.getActiveCubeFace(),mip=renderer.getActiveMipmapLevel();
    const viewport=renderer.getViewport(new THREE.Vector4()),scissor=renderer.getScissor(new THREE.Vector4()),scissorTest=renderer.getScissorTest();
    const shadowAuto=renderer.shadowMap.autoUpdate,shadowNeeds=renderer.shadowMap.needsUpdate,xr=renderer.xr.enabled;
    const programs=new Set<{isReady():boolean}>();
    try {
      renderer.xr.enabled=false;renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=false;
      for(const mode of ['water','shore'] as const){
        const entries=batch.entries.filter(e=>e.mode===mode);if(!entries.length)continue;
        renderer.setRenderTarget(mode==='shore'?this.target!:target,mode==='shore'?0:cube,mode==='shore'?0:mip);
        // This is r160 compileAsync's asynchronous KHR workflow with an owned,
        // cancellable poll. Native compileAsync's hidden timer cannot be stopped
        // after context loss/cache disposal and polls mutable currentProgram.
        renderer.compile(compileView(entries),mode==='shore'?reflected:camera,scene);
        for(const entry of entries){
          const owned=renderer.properties.get(entry.clone).programs as Map<string,{isReady():boolean}>|undefined;
          if(!owned?.size)throw new Error('Parallel warmup program cache unavailable');
          for(const program of owned.values()){if(typeof program.isReady!=='function')throw new Error('Parallel warmup readiness unavailable');programs.add(program);}
        }
      }
    } catch {batch.cancelled=true;this.metrics.reason='warmup-failed';}
    finally {
      renderer.shadowMap.autoUpdate=shadowAuto;renderer.shadowMap.needsUpdate=shadowNeeds;renderer.xr.enabled=xr;
      renderer.setRenderTarget(target,cube,mip);renderer.setViewport(viewport);renderer.setScissor(scissor);renderer.setScissorTest(scissorTest);
    }
    this.metrics.warmupBatches++;this.metrics.warmupMaterials+=batch.entries.length;
    this.metrics.warmupMs=performance.now()-began;this.metrics.maxWarmupMs=Math.max(this.metrics.maxWarmupMs,this.metrics.warmupMs);
    const poll=()=>{
      if(batch.cancelled||this.disposed||generation!==this.generation)return;
      if(renderer.getContext().isContextLost()){this.resetContext();return;}
      if(performance.now()-began>WATER_REFLECTION_LIMITS.warmupTimeoutMs){this.cancelWarmups();this.cooldown=performance.now()+WATER_REFLECTION_LIMITS.cooldownMs;this.off('warmup-timeout');return;}
      // isReady() uses nonblocking COMPLETION_STATUS_KHR; unsupported renderers
      // are rejected before allocation or any compile submission.
      let ready=false;
      try{ready=[...programs].every(program=>program.isReady());}catch{this.cancelWarmups();this.off('warmup-failed');return;}
      if(ready){
        for(const entry of batch.entries)entry.ready=true;
        if(this.batch===batch)this.batch=undefined;this.metrics.warming=false;return;
      }
      batch.timer=setTimeout(poll,10);
    };
    if(batch.cancelled){this.cancelWarmups();this.cooldown=performance.now()+WATER_REFLECTION_LIMITS.cooldownMs;}
    else poll();
  }

  private releaseTarget(): void {
    this.cancelWarmups();
    this.enabled.value = 0; this.texture.value = null;
    this.target?.dispose(); this.target = undefined; this.metrics.targetBytes = 0;
  }
  private off(reason: string, now?: number): WaterReflectionMetrics {
    this.enabled.value = 0; this.metrics.active = false; this.metrics.reason = reason;
    if (['quality','unsupported','disposed'].includes(reason) || (now !== undefined && now-this.last>=WATER_REFLECTION_LIMITS.inactiveTTLms)) this.releaseTarget();
    return this.metrics;
  }

  /** At most one bounded pass per 100 ms. No target is allocated until an actual
   * near visible lake surface and affordable reflected shore geometry exist. */
  update(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, now: number, options: { quality: Quality; mobile: boolean }): WaterReflectionMetrics {
    if (this.disposed) return this.off('disposed');
    if (this.rendering) return this.metrics;
    if (options.quality !== 'high' || options.mobile) return this.off('quality');
    if (!renderer.capabilities.isWebGL2 || !renderer.extensions.has('EXT_color_buffer_float') || !renderer.extensions.has('KHR_parallel_shader_compile') || renderer.xr.enabled) return this.off('unsupported');
    if (renderer.getContext().isContextLost()) { void this.resetContext(); return this.off('context-lost'); }
    if (!Number.isFinite(now) || now < this.cooldown) return this.off('cooldown',now);
    const updateStarted=performance.now();
    camera.updateMatrixWorld();
    const eye = camera.getWorldPosition(new THREE.Vector3()), direction = camera.getWorldDirection(new THREE.Vector3());
    if (eye.y <= this.height.value + .08 || eye.y > this.height.value + 130) return this.off('camera-height',now);
    const [minX,minZ,maxX,maxZ] = WATER_REFLECTION_LIMITS.lakeBoundsXZ;
    if (Math.hypot(Math.max(minX-eye.x,0,eye.x-maxX),Math.max(minZ-eye.z,0,eye.z-maxZ))>WATER_REFLECTION_LIMITS.nearWaterM) return this.off('far-from-lake',now);
    if (now - this.checked < WATER_REFLECTION_LIMITS.intervalMs) {
      // A teleport/large camera jump must never show a stale projected shore.
      if (eye.distanceTo(this.capturedEye) > 12 || direction.dot(this.capturedDirection) < .93) return this.off('camera-jump',now);
      return this.metrics;
    }
    this.checked=now;
    scene.updateMatrixWorld();
    const visible: THREE.Mesh[] = [], otherDraws: THREE.Object3D[] = [];
    scene.traverseVisible(o => { if (o instanceof THREE.Mesh) visible.push(o); else if(o instanceof THREE.Line||o instanceof THREE.Points||o instanceof THREE.Sprite)otherDraws.push(o); });
    const frustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    let nearWater = false;const nearWaterMeshes:THREE.Mesh[]=[];
    for (const mesh of visible) {
      if (!materials(mesh).some(waterMaterial)) continue;
      const box = bounds(mesh);
      // The clipped native water primitive must actually lie on the retained
      // lake datum. Mixed-height primitives are conservatively ineligible.
      if (!box || box.max.x<minX || box.min.x>maxX || box.max.z<minZ || box.min.z>maxZ || Math.abs(box.min.y - this.height.value) > .035 || Math.abs(box.max.y - this.height.value) > .035 || distanceXZ(box, eye) > WATER_REFLECTION_LIMITS.nearWaterM || !frustum.intersectsBox(box)) continue;
      for (const material of materials(mesh)) this.bindWaterMaterial(material);
      nearWaterMeshes.push(mesh);
      nearWater = true;
    }
    if (!nearWater) {
      this.metrics.preflightMs=performance.now()-updateStarted; this.metrics.updateMs=this.metrics.preflightMs;
      this.metrics.maxUpdateMs=Math.max(this.metrics.maxUpdateMs,this.metrics.updateMs);
      return this.off('no-near-visible-lake',now);
    }
    const reflected = reflectedWaterCamera(camera, this.height.value);
    if (!reflected) return this.off('camera-plane',now);
    const reflectedFrustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(reflected.camera.projectionMatrix, reflected.camera.matrixWorldInverse));
    const candidates: Candidate[] = [];
    for (const mesh of visible) {
      const ms = materials(mesh), name = meshName(mesh);
      if (ms.some(waterMaterial) || /\bwater\b|grass|turf blades|flower|shrub|hedge|lettering|roadside|bench|picnic|bollard|contact shadow|touring car/i.test(name)) continue;
      const sky = /\bsky\b/i.test(name) || (mesh.material instanceof THREE.ShaderMaterial && /sky/i.test(mesh.material.name));
      const shoreDetail = /dock|pier|Indian Princess|bridge|Indian Ranch open seating canopy/i.test(name);
      // Source-qualified house replacements own the visible shell after native
      // inferred bodies have been retired. Keep their structural batches; a
      // generic townCrafted rejection would reflect missing shore houses.
      const rebuiltHouse = mesh.userData.category==='crafted-frontages' && mesh.userData.sourceIds?.length>0
        && name.includes('Evidence-informed Webster buildings') && ms.every(m=>structuralRoles.has(m.userData.surfaceRole));
      if (mesh.userData.townCrafted && !shoreDetail && !rebuiltHouse && !sky) continue;
      const box = sky ? undefined : bounds(mesh);
      if (!sky && (!box || box.max.y < this.height.value || distanceXZ(box, eye) > WATER_REFLECTION_LIMITS.sceneRadiusM || !reflectedFrustum.intersectsBox(box))) continue;
      const cost = reflectionMeshCost(mesh); if (!cost.calls || cost.triangles > WATER_REFLECTION_LIMITS.triangles) continue;
      const tree = mesh.userData.treeKind;
      const shore = shoreDetail || !!tree || /building|roof|wall|facade/i.test(name);
      candidates.push({ mesh, ...cost, distance: box ? distanceXZ(box, eye) : 0, priority: sky ? 0 : tree === 'near' ? 4 : tree === 'far' ? 2 : shore ? 1 : 3, shore });
    }
    candidates.sort((a, b) => a.priority - b.priority || a.distance - b.distance || a.triangles - b.triangles || a.mesh.id - b.mesh.id);
    const selected = new Set<THREE.Mesh>(); let calls = 0, triangles = 0, shores = 0;
    const take=(row:Candidate):boolean=>{
      if(selected.has(row.mesh)||calls+row.calls>WATER_REFLECTION_LIMITS.calls||triangles+row.triangles>WATER_REFLECTION_LIMITS.triangles)return false;
      selected.add(row.mesh);calls+=row.calls;triangles+=row.triangles;if(row.shore)shores++;return true;
    };
    for(const row of candidates)if(row.priority===0)take(row);
    let crownCalls=0,crownTriangles=0,crownMeshes=0;
    // The source tree cohorts already provide affordable coarse crowns. Reserve
    // part of the SAME total budget before detailed wall batches can consume it;
    // reflected shore trees retain canopies rather than isolated bare trunks.
    for(const row of candidates.filter(c=>c.mesh.userData.treeKind==='far').sort((a,b)=>a.distance-b.distance||a.triangles-b.triangles||a.mesh.id-b.mesh.id)){
      if(crownCalls+row.calls>WATER_REFLECTION_LIMITS.reservedCrownCalls||crownTriangles+row.triangles>WATER_REFLECTION_LIMITS.reservedCrownTriangles)continue;
      if(take(row)){crownCalls+=row.calls;crownTriangles+=row.triangles;crownMeshes++;}
    }
    for (const row of candidates) {
      take(row);
    }
    Object.assign(this.metrics, { predictedCalls: calls, predictedTriangles: triangles, includedMeshes: selected.size, omittedMeshes: visible.length - selected.size, reflectedShoreMeshes: shores,reservedCrownCalls:crownCalls,reservedCrownTriangles:crownTriangles,reservedCrownMeshes:crownMeshes });
    this.metrics.preflightMs=performance.now()-updateStarted;
    if (!shores || !selected.size) return this.off('preflight-budget',now);
    if (!this.target) {
      this.target = new THREE.WebGLRenderTarget(WATER_REFLECTION_LIMITS.size, WATER_REFLECTION_LIMITS.size, { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: true, stencilBuffer: false, generateMipmaps: false });
      this.target.texture.name = 'Optional near-lake planar reflection';
      this.target.texture.colorSpace = THREE.LinearSRGBColorSpace;
      this.texture.value = this.target.texture;
      // RGBA16F plus conservatively budgeted four-byte depth; driver padding is
      // not measured by this estimate. There are no MSAA or mip allocations.
      this.metrics.targetBytes = WATER_REFLECTION_LIMITS.size ** 2 * 12;
    }
    this.collectAcquiredPrograms(renderer);
    const needed=this.warmSpecs(selected,nearWaterMeshes,scene,renderer),neededKeys=new Set(needed.map(e=>e.key));
    for(const entry of this.warmEntries.values())if(entry.ready&&!neededKeys.has(entry.key))this.dropWarm(entry);
    if(needed.some(spec=>!this.warmed.get(spec.source)?.has(spec.key)&&!this.warmEntries.get(spec.key)?.ready)){
      this.startWarmup(needed,renderer,scene,camera,reflected.camera);
      if(needed.some(spec=>!this.warmed.get(spec.source)?.has(spec.key)&&!this.warmEntries.get(spec.key)?.ready)){
        this.metrics.updateMs=performance.now()-updateStarted;this.metrics.maxUpdateMs=Math.max(this.metrics.maxUpdateMs,this.metrics.updateMs);
        this.metrics.warming=true;
        // Warming is eligible activity; do not expire its target against the
        // last rendered timestamp while the first batch is pending.
        return this.off('warming-shaders');
      }
    }
    for(const mesh of nearWaterMeshes)for(const material of materials(mesh)){
      const state=this.bindings.get(material as THREE.MeshStandardMaterial);if(!state||state.installed)continue;
      material.onBeforeCompile=state.hook;material.customProgramCacheKey=()=>state.reflectionKey;material.needsUpdate=true;state.installed=true;
    }
    const hidden = [...visible.filter(mesh => !selected.has(mesh)),...otherDraws];
    const target = renderer.getRenderTarget(), cube = renderer.getActiveCubeFace(), mip = renderer.getActiveMipmapLevel();
    const viewport = renderer.getViewport(new THREE.Vector4()), scissor = renderer.getScissor(new THREE.Vector4()), scissorTest = renderer.getScissorTest();
    const shadowAuto = renderer.shadowMap.autoUpdate, shadowNeeds = renderer.shadowMap.needsUpdate, xr = renderer.xr.enabled, infoReset = renderer.info.autoReset;
    this.enabled.value = 0; this.rendering = true; const start = performance.now();
    try {
      hidden.forEach(mesh => { mesh.visible = false; });
      renderer.xr.enabled = false; renderer.shadowMap.autoUpdate = false; renderer.shadowMap.needsUpdate = false;
      renderer.info.autoReset = true;
      renderer.setRenderTarget(this.target); renderer.setScissorTest(false); renderer.state.buffers.depth.setMask(true); renderer.clear();
      renderer.render(scene, reflected.camera);
      const submissionMs = performance.now() - start;
      Object.assign(this.metrics, { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, submissionMs, maxSubmissionMs: Math.max(this.metrics.maxSubmissionMs, submissionMs), updates: this.metrics.updates + 1 });
      this.last = now; this.capturedEye.copy(eye); this.capturedDirection.copy(direction);
      if (this.metrics.calls > WATER_REFLECTION_LIMITS.calls || this.metrics.triangles > WATER_REFLECTION_LIMITS.triangles) {
        this.cooldown = now + WATER_REFLECTION_LIMITS.cooldownMs; return this.off('runtime-budget');
      }
      this.matrix.value.copy(reflected.textureMatrix); this.enabled.value = 1;
      this.collectAcquiredPrograms(renderer);
      this.metrics.active = true; this.metrics.reason = 'reflected-shore'; return this.metrics;
    } catch {
      this.cooldown = now + WATER_REFLECTION_LIMITS.cooldownMs; return this.off('render-failed');
    } finally {
      hidden.forEach(mesh => { mesh.visible = true; });
      renderer.shadowMap.autoUpdate = shadowAuto; renderer.shadowMap.needsUpdate = shadowNeeds; renderer.xr.enabled = xr; renderer.info.autoReset = infoReset;
      renderer.setRenderTarget(target, cube, mip); renderer.setViewport(viewport); renderer.setScissor(scissor); renderer.setScissorTest(scissorTest);
      this.rendering = false;
      // Includes eligibility traversal, matrix/bounds/frustum work, sorting,
      // allocation, submission and all restoration. First-use compilation is
      // measured but exempt from the repeated steady-state total-cost guard.
      this.metrics.updateMs=performance.now()-updateStarted;
      this.metrics.maxUpdateMs=Math.max(this.metrics.maxUpdateMs,this.metrics.updateMs);
      this.slow = this.metrics.updates > 1 && this.metrics.updateMs > WATER_REFLECTION_LIMITS.updateBudgetMs ? this.slow + 1 : 0;
      if(this.metrics.active && this.slow>=3){ this.cooldown=now+WATER_REFLECTION_LIMITS.cooldownMs; this.off('runtime-budget'); }
    }
  }

  dispose(): void {
    if (this.disposed) return; this.disposed = true; this.off('disposed');
    for (const [material, state] of this.bindings) {
      material.removeEventListener('dispose', state.onDispose);
      if (material.onBeforeCompile === state.hook) { material.onBeforeCompile = state.compile; material.customProgramCacheKey = state.key; material.needsUpdate = true; }
    }
    this.bindings.clear(); this.metrics.boundMaterials = 0;
    this.releaseTarget();
  }
}
