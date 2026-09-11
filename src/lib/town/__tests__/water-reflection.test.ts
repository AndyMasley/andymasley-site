// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { applyArtMaterial } from '../art-materials';
import { Batch, type Frame } from '../crafted-frontages';
import { reflectedWaterCamera, reflectionMeshCost, TownWaterReflection, WATER_REFLECTION_LIMITS as limits } from '../water-reflection';

const high = { quality: 'high' as const, mobile: false };
function fixture() {
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(60, 1.6, .08, 2000);
  camera.position.set(600, limits.lakeHeight + 10, 2700); camera.lookAt(600, limits.lakeHeight, 2770); camera.updateMatrixWorld();
  const material = new THREE.MeshStandardMaterial({ name: 'Mapped water | inferred level and appearance' });
  applyArtMaterial(material, { value: 0 });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(100, 110).rotateX(-Math.PI / 2), material); water.position.set(600, limits.lakeHeight, 2755); water.name = 'water'; scene.add(water);
  const house = new THREE.Mesh(new THREE.BoxGeometry(8, 7, 9), new THREE.MeshStandardMaterial()); house.position.set(600, limits.lakeHeight + 4, 2790); house.name = 'buildings'; scene.add(house);
  const grass = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()); grass.name = 'Town grass | test'; grass.position.copy(house.position); scene.add(grass);
  const hidden = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()); hidden.name = 'hidden source building'; hidden.visible = false; scene.add(hidden);
  return { scene, camera, water, material, house, grass, hidden };
}
function fakeRenderer(onRender?: (scene: THREE.Scene, camera: THREE.Camera) => void) {
  const originalTarget = new THREE.WebGLRenderTarget(16, 16), targets: (THREE.WebGLRenderTarget | null)[] = [];
  let target: THREE.WebGLRenderTarget | null = originalTarget, test = true;
  const viewport = new THREE.Vector4(11, 12, 640, 480), scissor = new THREE.Vector4(5, 6, 111, 222);
  const cache=new WeakMap<THREE.Material,{programs?:Map<string,{isReady():boolean}>;currentProgram?:{isReady():boolean}}>();
  let programsReady=true,lost=false;
  const props=(m:THREE.Material)=>{let p=cache.get(m);if(!p){p={};cache.set(m,p);}return p;};
  const r = {
    capabilities: { isWebGL2: true }, extensions: { has: () => true }, xr: { enabled: false },
    getContext: () => ({ isContextLost: () => lost }), properties:{get:props},
    shadowMap: { autoUpdate: true, needsUpdate: true }, info: { autoReset: false, render: { calls: 0, triangles: 0 } },
    state: { buffers: { depth: { setMask: vi.fn() } } },
    getRenderTarget: () => target, getActiveCubeFace: () => 2, getActiveMipmapLevel: () => 1,
    setRenderTarget: vi.fn((next: THREE.WebGLRenderTarget | null) => { target = next; targets.push(next); }),
    getViewport: (v: THREE.Vector4) => v.copy(viewport), setViewport: vi.fn((v: THREE.Vector4) => viewport.copy(v)),
    getScissor: (v: THREE.Vector4) => v.copy(scissor), setScissor: vi.fn((v: THREE.Vector4) => scissor.copy(v)),
    getScissorTest: () => test, setScissorTest: vi.fn((value: boolean) => { test = value; }), clear: vi.fn(),
    compile:vi.fn((view:THREE.Object3D,_camera:THREE.Camera,targetScene:THREE.Scene)=>{
      expect(targetScene).toBeInstanceOf(THREE.Scene);
      const used=new Set<THREE.Material>();
      view.traverse(o=>{if(o instanceof THREE.Mesh)for(const m of Array.isArray(o.material)?o.material:[o.material]){
        const program={isReady:()=>programsReady};Object.assign(props(m),{programs:new Map([[m.customProgramCacheKey(),program]]),currentProgram:program});used.add(m);
      }});return used;
    }),
    render: vi.fn((scene: THREE.Scene, camera: THREE.Camera) => {
      // Match r160's automatic scene update so redundant walks are observable.
      if(scene.matrixWorldAutoUpdate)scene.updateMatrixWorld();
      expect(r.shadowMap).toEqual({ autoUpdate: false, needsUpdate: false });
      r.info.render.calls = 0; r.info.render.triangles = 0;
      scene.traverseVisible(o => { if (o instanceof THREE.Mesh) { const cost = reflectionMeshCost(o); r.info.render.calls += cost.calls; r.info.render.triangles += cost.triangles; } });
      onRender?.(scene, camera);
    }),
  };
  return { r: r as unknown as THREE.WebGLRenderer, raw: r, targets, originalTarget, viewport, scissor, cache, ready:(v:boolean)=>{programsReady=v;},lose:()=>{lost=true;},restore:()=>{lost=false;} };
}
const shaderFor = (material: THREE.MeshStandardMaterial) => {
  const s = THREE.ShaderLib.standard;
  const shader = { vertexShader: s.vertexShader, fragmentShader: s.fragmentShader, uniforms: THREE.UniformsUtils.clone(s.uniforms) };
  material.onBeforeCompile(shader as Parameters<THREE.Material['onBeforeCompile']>[0], {} as THREE.WebGLRenderer); return shader;
};

describe('bounded real lake reflection', () => {
  it('mirrors shore geometry across the existing plane and clips submerged geometry', () => {
    const { camera } = fixture(), reflected = reflectedWaterCamera(camera, limits.lakeHeight)!;
    expect(reflected.camera.position.y).toBeCloseTo(limits.lakeHeight * 2 - camera.position.y);
    const real = new THREE.Vector3(603, limits.lakeHeight + 7, 2780);
    const virtual = real.clone(); virtual.y = limits.lakeHeight * 2 - virtual.y;
    // Projective sampling must put the real shore object at the plane point
    // where the viewer sees its mirrored image. A mirrored camera has opposite
    // handedness; comparing raw screen X without its texture matrix is wrong.
    const ray = virtual.clone().sub(camera.position);
    const waterPoint = camera.position.clone().addScaledVector(ray, (limits.lakeHeight-camera.position.y)/ray.y);
    const sample = waterPoint.applyMatrix4(reflected.textureMatrix), mirror = real.clone().applyMatrix4(reflected.textureMatrix);
    expect(mirror.x).toBeCloseTo(sample.x, 6); expect(mirror.y).toBeCloseTo(sample.y, 6);
    const frustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(reflected.camera.projectionMatrix, reflected.camera.matrixWorldInverse));
    expect(frustum.containsPoint(real)).toBe(true);
    expect(frustum.containsPoint(new THREE.Vector3(603, limits.lakeHeight - 3, 2780))).toBe(false);
    camera.position.y = limits.lakeHeight; expect(reflectedWaterCamera(camera, limits.lakeHeight)).toBeUndefined();
  });

  it('counts grouped, range-clipped and instanced submitted geometry conservatively', () => {
    const g = new THREE.BoxGeometry(), material = new THREE.MeshStandardMaterial({ transparent: true, side: THREE.DoubleSide });
    const mesh = new THREE.InstancedMesh(g, material, 10);
    expect(reflectionMeshCost(mesh)).toEqual({ calls: 2, triangles: 240 });
    g.setDrawRange(0, 6); expect(reflectionMeshCost(mesh)).toEqual({ calls: 2, triangles: 40 });
    (mesh as THREE.InstancedMesh<THREE.BufferGeometry, THREE.Material | THREE.Material[]>).material = [material, new THREE.MeshStandardMaterial()]; g.clearGroups(); g.addGroup(0, 3, 0); g.addGroup(3, 3, 1);
    expect(reflectionMeshCost(mesh)).toEqual({ calls: 3, triangles: 30 });
  });

  it('stays allocation-free and unbound on Low/mobile/auto, unsupported GPU, far views or wrong water datum', () => {
    for (const options of [{ quality: 'low' as const, mobile: false }, { quality: 'auto' as const, mobile: false }, { quality: 'high' as const, mobile: true }]) {
      const f = fixture(), renderer = fakeRenderer(), effect = new TownWaterReflection();
      expect(effect.update(renderer.r, f.scene, f.camera, 100, options).active).toBe(false);
      expect(effect.metrics.targetBytes).toBe(0); expect(effect.metrics.boundMaterials).toBe(0); expect(renderer.raw.render).not.toHaveBeenCalled(); effect.dispose();
    }
    const f = fixture(), renderer = fakeRenderer(), effect = new TownWaterReflection();
    renderer.raw.capabilities.isWebGL2 = false; expect(effect.update(renderer.r, f.scene, f.camera, 100, high).reason).toBe('unsupported');
    renderer.raw.capabilities.isWebGL2 = true; f.camera.position.x = -2800;
    expect(effect.update(renderer.r, f.scene, f.camera, 200, high).reason).toBe('far-from-lake');
    f.camera.position.x = 600; f.water.position.y += 1;
    expect(effect.update(renderer.r, f.scene, f.camera, 300, high).reason).toBe('no-near-visible-lake');
    expect(effect.metrics.targetBytes).toBe(0); expect(renderer.raw.render).not.toHaveBeenCalled(); effect.dispose();
  });

  it('renders real borrowed shore geometry, omits water/grass, limits cadence and restores all renderer/visibility state', () => {
    const f = fixture(), effect = new TownWaterReflection(), originalPosition = f.house.geometry.attributes.position.array.slice();
    const renderer = fakeRenderer(() => {
      expect(f.water.visible).toBe(false); expect(f.grass.visible).toBe(false); expect(f.house.visible).toBe(true);
      effect.update(renderer.r, f.scene, f.camera, 100, high); // recursion guard
    });
    expect(effect.update(renderer.r, f.scene, f.camera, 100, high)).toMatchObject({ active: true, reason: 'reflected-shore', updates: 1, calls: 1, triangles: 12, reflectedShoreMeshes: 1 });
    expect(effect.metrics.targetBytes).toBe(384 * 384 * 12);
    expect(renderer.r.getRenderTarget()).toBe(renderer.originalTarget);
    expect(renderer.raw.setRenderTarget).toHaveBeenLastCalledWith(renderer.originalTarget, 2, 1);
    expect(renderer.viewport.toArray()).toEqual([11, 12, 640, 480]); expect(renderer.scissor.toArray()).toEqual([5, 6, 111, 222]);
    expect(renderer.raw.getScissorTest()).toBe(true); expect(renderer.raw.shadowMap).toEqual({ autoUpdate: true, needsUpdate: true }); expect(renderer.raw.info.autoReset).toBe(false);
    expect(f.water.visible && f.grass.visible && f.house.visible).toBe(true); expect(f.hidden.visible).toBe(false);
    expect(f.house.geometry.attributes.position.array).toEqual(originalPosition);
    effect.update(renderer.r, f.scene, f.camera, 150, high); expect(renderer.raw.render).toHaveBeenCalledTimes(1);
    effect.update(renderer.r, f.scene, f.camera, 200, high); expect(renderer.raw.render).toHaveBeenCalledTimes(2);
    const target = renderer.targets.find(t=>t?.texture.name==='Optional near-lake planar reflection')!; expect(target.width).toBeLessThanOrEqual(512); expect(target.texture.colorSpace).toBe(THREE.LinearSRGBColorSpace); expect(target.samples).toBe(0); expect(target.texture.generateMipmaps).toBe(false);
    effect.dispose(); renderer.originalTarget.dispose();
  });

  it.each([
    { prior:true, fail:false }, { prior:false, fail:false },
    { prior:true, fail:true }, { prior:false, fail:true },
  ])('updates fresh transforms once and restores matrix policy $prior after failed=$fail submission', ({prior,fail}) => {
    const f=fixture(),effect=new TownWaterReflection(); f.scene.matrixWorldAutoUpdate=prior;
    f.house.position.x=603;
    const matrixUpdate=vi.spyOn(f.scene,'updateMatrixWorld');
    const renderer=fakeRenderer(()=>{
      expect(f.scene.matrixWorldAutoUpdate).toBe(false);
      expect(new THREE.Vector3().setFromMatrixPosition(f.house.matrixWorld).x).toBe(603);
      if(fail)throw new Error('fixture submission failure');
    });
    try{
      expect(effect.update(renderer.r,f.scene,f.camera,100,high).reason).toBe(fail?'render-failed':'reflected-shore');
      expect(matrixUpdate).toHaveBeenCalledTimes(1);
      expect(f.scene.matrixWorldAutoUpdate).toBe(prior);
      expect(f.water.visible&&f.house.visible&&f.grass.visible).toBe(true);
      // A following ordinary main render still follows the caller's policy.
      if(f.scene.matrixWorldAutoUpdate)f.scene.updateMatrixWorld();
      expect(matrixUpdate).toHaveBeenCalledTimes(prior?2:1);
    }finally{effect.dispose();matrixUpdate.mockRestore();}
  });

  it('reads a shared material descriptor once per update while still detecting a dynamic shader key', () => {
    const f=fixture(),effect=new TownWaterReflection(),renderer=fakeRenderer();
    let revision=1;
    const key=vi.fn(()=>`authored shader \"key\" with \\ escapes:${revision}`);
    (f.house.material as THREE.Material).customProgramCacheKey=key;
    for(let i=0;i<80;i++){const mesh=f.house.clone();mesh.position.x+=i*.01;f.scene.add(mesh);}
    try{
      expect(effect.update(renderer.r,f.scene,f.camera,100,high).active).toBe(true);
      expect(effect.metrics.warmupMaterials).toBe(2);
      key.mockClear();
      expect(effect.update(renderer.r,f.scene,f.camera,200,high).active).toBe(true);
      expect(key).toHaveBeenCalledTimes(1);
      expect(effect.metrics.warmupMaterials).toBe(2);
      revision++;
      effect.update(renderer.r,f.scene,f.camera,300,high);
      expect(effect.metrics.warmupMaterials).toBe(3);
      expect(effect.metrics.calls).toBe(81);
    }finally{effect.dispose();}
  });

  it.each(['defines','map','layout','morph-layout','flags'] as const)('revalidates in-place %s changes without a material version bump', kind => {
    const f=fixture(),effect=new TownWaterReflection(),renderer=fakeRenderer();
    const material=f.house.material as THREE.MeshStandardMaterial;
    material.defines={AUTHORED_TEST:1}; material.map=new THREE.Texture();
    try{
      effect.update(renderer.r,f.scene,f.camera,100,high);
      const version=material.version;
      if(kind==='defines')material.defines.AUTHORED_TEST=2;
      if(kind==='map')material.map.channel=1;
      if(kind==='layout')f.house.geometry.setAttribute('color',new THREE.Float32BufferAttribute(new Float32Array(f.house.geometry.attributes.position.count*3),3,true));
      if(kind==='morph-layout')f.house.geometry.morphAttributes.position=[f.house.geometry.attributes.position.clone()];
      if(kind==='flags')material.flatShading=true;
      expect(material.version).toBe(version);
      renderer.ready(false);
      expect(effect.update(renderer.r,f.scene,f.camera,200,high).reason).toBe('warming-shaders');
      expect(effect.metrics.warmupMaterials).toBe(3);
      expect(renderer.raw.render).toHaveBeenCalledTimes(1);
    }finally{effect.dispose();}
  });

  it('collects the identical visible light context in the mesh traversal and rewarms changed scene context', () => {
    const f=fixture(),effect=new TownWaterReflection(),renderer=fakeRenderer();
    const sun=new THREE.DirectionalLight(),ambient=new THREE.AmbientLight(),hidden=new THREE.Group(),hiddenLight=new THREE.PointLight();
    hidden.visible=false;hidden.add(hiddenLight);f.scene.add(sun,ambient,hidden);
    const traversal=vi.spyOn(f.scene,'traverseVisible');
    try{
      effect.update(renderer.r,f.scene,f.camera,100,high);
      // One eligibility/light pass plus the fake renderer's draw enumeration.
      expect(traversal).toHaveBeenCalledTimes(2);
      const initial=effect.metrics.warmupMaterials;
      hiddenLight.castShadow=true;hiddenLight.layers.set(2);
      sun.removeFromParent();f.scene.add(sun); // order has no shader meaning
      effect.update(renderer.r,f.scene,f.camera,200,high);
      expect(effect.metrics.warmupMaterials).toBe(initial);
      hidden.visible=true;
      effect.update(renderer.r,f.scene,f.camera,300,high);
      expect(effect.metrics.warmupMaterials).toBe(initial+2);
      sun.castShadow=true;sun.layers.set(1);
      effect.update(renderer.r,f.scene,f.camera,400,high);
      expect(effect.metrics.warmupMaterials).toBe(initial+4);
      f.scene.fog=new THREE.Fog(0x8899aa,10,500);
      effect.update(renderer.r,f.scene,f.camera,500,high);
      expect(effect.metrics.warmupMaterials).toBe(initial+6);
      f.scene.environment=new THREE.Texture();
      effect.update(renderer.r,f.scene,f.camera,600,high);
      expect(effect.metrics.warmupMaterials).toBe(initial+8);
    }finally{effect.dispose();traversal.mockRestore();}
  });

  it('retains a warming clone until the original acquires every compiled program', () => {
    const f=fixture(),effect=new TownWaterReflection(),renderer=fakeRenderer();
    try{
      effect.update(renderer.r,f.scene,f.camera,100,high);
      const clone=renderer.raw.compile.mock.results.flatMap(r=>[...r.value as Set<THREE.Material>]).find(m=>m.name!=='Mapped water | inferred level and appearance')!;
      const programs=renderer.raw.properties.get(clone).programs!,second={isReady:()=>true};
      programs.set('second-pass',second);
      const source=renderer.raw.properties.get(f.house.material as THREE.Material);
      source.programs=new Map([['first-pass',programs.values().next().value!]]);
      const dispose=vi.spyOn(clone,'dispose');
      effect.update(renderer.r,f.scene,f.camera,200,high);
      expect(dispose).not.toHaveBeenCalled();
      source.programs.set('second-pass',second);
      effect.update(renderer.r,f.scene,f.camera,300,high);
      expect(dispose).toHaveBeenCalledTimes(1);
      expect(effect.metrics.warmupMaterials).toBe(2);
    }finally{effect.dispose();}
  });

  it('chains the real water shader, restricts pooled materials by height and lake area, and never disposes borrowed resources', () => {
    const f = fixture(), effect = new TownWaterReflection(), renderer = fakeRenderer();
    const oldHook = f.material.onBeforeCompile, oldKey = f.material.customProgramCacheKey;
    const materialDispose = vi.spyOn(f.material, 'dispose'), geometryDispose = vi.spyOn(f.water.geometry, 'dispose');
    expect(effect.bindWaterMaterial(f.house.material as THREE.Material)).toBe(false);
    effect.update(renderer.r, f.scene, f.camera, 100, high); expect(effect.bindWaterMaterial(f.material)).toBe(true);
    const shader = shaderFor(f.material);
    expect(shader.fragmentShader).toContain('townWaterWind'); expect(shader.fragmentShader).toContain('texture2D(townLakeReflection');
    expect(shader.fragmentShader).toContain('abs(vTownArtWorld.y-townLakeReflectionHeight)<.035');
    expect(shader.fragmentShader).toContain('vTownArtWorld.x>=townLakeReflectionBounds.x');
    expect(shader.fragmentShader).toContain('vTownArtWorld.z<=townLakeReflectionBounds.w');
    expect(shader.uniforms.townLakeReflectionEnabled.value).toBe(1);
    expect(shader.uniforms.townLakeReflection.value).toBe(renderer.targets.find(t=>t?.texture.name==='Optional near-lake planar reflection')!.texture);
    const disposeTarget = vi.spyOn(renderer.targets.find(t=>t?.texture.name==='Optional near-lake planar reflection')!, 'dispose');
    effect.update(renderer.r, f.scene, f.camera, 120, { quality: 'low', mobile: false }); expect(shader.uniforms.townLakeReflectionEnabled.value).toBe(0);
    expect(shader.uniforms.townLakeReflection.value).toBeNull(); expect(effect.metrics.targetBytes).toBe(0); expect(disposeTarget).toHaveBeenCalledTimes(1);
    effect.dispose(); effect.dispose();
    expect(disposeTarget).toHaveBeenCalledTimes(1); expect(materialDispose).not.toHaveBeenCalled(); expect(geometryDispose).not.toHaveBeenCalled();
    expect(f.material.onBeforeCompile).toBe(oldHook); expect(f.material.customProgramCacheKey).toBe(oldKey); expect(effect.metrics.targetBytes).toBe(0);
  });

  it('bounds preflight cost and fails closed when no affordable shore remains', () => {
    const f = fixture(), effect = new TownWaterReflection(), renderer = fakeRenderer();
    f.house.removeFromParent();
    const heavy = new THREE.InstancedMesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial(), 30000); heavy.name = 'buildings';
    const transform = new THREE.Matrix4().makeTranslation(600, limits.lakeHeight + 4, 2790);
    for (let i = 0; i < heavy.count; i++) heavy.setMatrixAt(i, transform); f.scene.add(heavy);
    expect(effect.update(renderer.r, f.scene, f.camera, 100, high).reason).toBe('preflight-budget'); expect(effect.metrics.targetBytes).toBe(0);
    heavy.removeFromParent();
    for (let i = 0; i < 200; i++) { const mesh = f.house.clone(); mesh.position.x += i * .02; f.scene.add(mesh); }
    expect(effect.update(renderer.r, f.scene, f.camera, 200, high).active).toBe(true);
    expect(effect.metrics.calls).toBeLessThanOrEqual(180); expect(effect.metrics.triangles).toBeLessThanOrEqual(350000); effect.dispose();
  });

  it('disables stale output after a jump or failed/over-budget pass, preserving state even on errors', () => {
    const f = fixture(), effect = new TownWaterReflection(); let fail = false;
    const renderer = fakeRenderer(() => { if (fail) throw new Error('fixture GPU failure'); });
    effect.update(renderer.r, f.scene, f.camera, 100, high); const shader = shaderFor(f.material);
    f.camera.position.x += 20;
    expect(effect.update(renderer.r, f.scene, f.camera, 120, high).reason).toBe('camera-jump'); expect(shader.uniforms.townLakeReflectionEnabled.value).toBe(0);
    f.camera.position.x -= 20; fail = true;
    expect(effect.update(renderer.r, f.scene, f.camera, 200, high).reason).toBe('render-failed');
    expect(f.water.visible && f.house.visible && f.grass.visible).toBe(true); expect(renderer.r.getRenderTarget()).toBe(renderer.originalTarget);
    expect(effect.update(renderer.r, f.scene, f.camera, 300, high).reason).toBe('cooldown');
    effect.dispose();
  });

  it('drops streamed-out bindings when their owner disposes them', () => {
    const f = fixture(), effect = new TownWaterReflection(); effect.bindWaterMaterial(f.material);
    expect(effect.metrics.boundMaterials).toBe(1); f.material.dispose(); expect(effect.metrics.boundMaterials).toBe(0); effect.dispose();
  });

  it('rejects an actual submission that exceeds its conservative preflight ceiling', () => {
    const f = fixture(), effect = new TownWaterReflection();
    const renderer = fakeRenderer(() => { renderer.raw.info.render.calls = limits.calls + 1; });
    expect(effect.update(renderer.r, f.scene, f.camera, 100, high)).toMatchObject({ active: false, reason: 'runtime-budget', updates: 1, calls: 181 });
    expect(shaderFor(f.material).uniforms.townLakeReflectionEnabled.value).toBe(0);
    expect(effect.update(renderer.r, f.scene, f.camera, 200, high).reason).toBe('cooldown');
    expect(f.house.visible && f.water.visible).toBe(true); effect.dispose();
  });

  it('expires an inactive target, then recreates one fresh target when returning to the lake', () => {
    const f = fixture(), effect = new TownWaterReflection(), renderer = fakeRenderer();
    effect.update(renderer.r, f.scene, f.camera, 100, high); const first=renderer.targets.find(t=>t?.texture.name==='Optional near-lake planar reflection')!, dispose=vi.spyOn(first,'dispose'), shader=shaderFor(f.material);
    f.camera.position.x=-2800;
    effect.update(renderer.r,f.scene,f.camera,200,high); expect(effect.metrics.targetBytes).toBeGreaterThan(0); expect(shader.uniforms.townLakeReflectionEnabled.value).toBe(0);
    effect.update(renderer.r,f.scene,f.camera,5100,high); expect(effect.metrics.targetBytes).toBe(0); expect(dispose).toHaveBeenCalledTimes(1); expect(shader.uniforms.townLakeReflection.value).toBeNull();
    f.camera.position.x=600;
    expect(effect.update(renderer.r,f.scene,f.camera,5200,high).active).toBe(true);
    expect(shader.uniforms.townLakeReflection.value).not.toBe(first.texture); expect(effect.metrics.targetBytes).toBe(limits.size**2*12); effect.dispose();
  });

  it('budgets total preflight-through-restoration time, beyond render submission alone', () => {
    const f=fixture(),effect=new TownWaterReflection(),renderer=fakeRenderer(); let time=0;
    const clock=vi.spyOn(performance,'now').mockImplementation(()=>{time+=4;return time;});
    try {
      effect.update(renderer.r,f.scene,f.camera,100,high);
      expect(effect.metrics.preflightMs).toBe(4); expect(effect.metrics.submissionMs).toBe(4);
      expect(effect.metrics.updateMs).toBeGreaterThan(effect.metrics.preflightMs+effect.metrics.submissionMs);
      effect.update(renderer.r,f.scene,f.camera,200,high); effect.update(renderer.r,f.scene,f.camera,300,high);
      expect(effect.update(renderer.r,f.scene,f.camera,400,high).reason).toBe('runtime-budget');
    } finally {clock.mockRestore();effect.dispose();}
  });

  it('reflects the actual source-qualified replacement house shell while omitting other crafted furniture', () => {
    const f=fixture(),effect=new TownWaterReflection(); f.house.removeFromParent();
    const frame:Frame={start:[600,-2790],tangent:[1,0],outward:[0,-1],structId:'fixture-native-house',tileId:'2_-12'};
    const body=new Batch(new THREE.Vector3(),0);
    body.box(frame,'wall',0,limits.lakeHeight+4,0,8,7,9,'#c0c3b7');
    body.box(frame,'roof',0,limits.lakeHeight+7.6,0,8.3,.3,9.3,'#535959');
    const built=body.finish(); built.group.name='Evidence-informed Webster buildings'; f.scene.add(built.group);
    const detail=new Batch(new THREE.Vector3(),0); detail.box(frame,'trim',0,limits.lakeHeight+1,0,3,.2,1,'#5c7460');
    const furniture=detail.finish(); furniture.group.name='Unrelated park furniture'; f.scene.add(furniture.group);
    const renderer=fakeRenderer(()=>{
      expect(built.group.children.every(o=>o.visible)).toBe(true);
      expect(furniture.group.children.every(o=>!o.visible)).toBe(true);
    });
    expect(effect.update(renderer.r,f.scene,f.camera,100,high)).toMatchObject({active:true,reflectedShoreMeshes:2,calls:2,triangles:24});
    expect(furniture.group.children.every(o=>o.visible)).toBe(true); effect.dispose();
  });

  it('warms only private selected variants with original instancing context, never blocking on main currentProgram', () => {
    vi.useFakeTimers({toFake:['setTimeout','clearTimeout']});
    const f=fixture(),effect=new TownWaterReflection(),renderer=fakeRenderer();renderer.ready(false);
    const waterHook=f.material.onBeforeCompile,houseMaterial=f.house.material;
    try{
      expect(effect.update(renderer.r,f.scene,f.camera,100,high).reason).toBe('warming-shaders');
      expect(renderer.raw.render).not.toHaveBeenCalled();expect(f.material.onBeforeCompile).toBe(waterHook);expect(f.house.material).toBe(houseMaterial);
      expect(f.water.visible&&f.house.visible&&f.grass.visible).toBe(true);
      expect(renderer.raw.getRenderTarget()).toBe(renderer.originalTarget);
      expect(renderer.raw.shadowMap).toEqual({autoUpdate:true,needsUpdate:true});
      const clones=renderer.raw.compile.mock.results.flatMap(r=>[...r.value as Set<THREE.Material>]);
      expect(clones).toHaveLength(2);expect(clones).not.toContain(f.material);expect(clones).not.toContain(houseMaterial);
      // A main-view program becoming ready must not resolve the captured clone
      // target program, the failure mode in r160's mutable currentProgram poll.
      renderer.raw.properties.get(houseMaterial as THREE.Material).currentProgram={isReady:()=>true};
      vi.advanceTimersByTime(20);expect(effect.update(renderer.r,f.scene,f.camera,200,high).reason).toBe('warming-shaders');
      renderer.ready(true);vi.advanceTimersByTime(10);
      expect(effect.update(renderer.r,f.scene,f.camera,300,high).active).toBe(true);
      expect(f.material.onBeforeCompile).not.toBe(waterHook);expect(renderer.raw.render).toHaveBeenCalledTimes(1);
    }finally{effect.dispose();vi.useRealTimers();}
  });

  it('cancels pending polls and borrowed-map clones synchronously on disposal or context loss', () => {
    vi.useFakeTimers({toFake:['setTimeout','clearTimeout']});
    try{for(const mode of ['dispose','context'] as const){
      const f=fixture(),effect=new TownWaterReflection(),renderer=fakeRenderer();renderer.ready(false);
      const texture=new THREE.Texture(),textureDispose=vi.spyOn(texture,'dispose');(f.house.material as THREE.MeshStandardMaterial).map=texture;
      const waterHook=f.material.onBeforeCompile;
      effect.update(renderer.r,f.scene,f.camera,100,high);
      const clones=renderer.raw.compile.mock.results.flatMap(r=>[...r.value as Set<THREE.Material>]),spies=clones.map(c=>vi.spyOn(c,'dispose'));
      expect(vi.getTimerCount()).toBe(1);
      if(mode==='dispose'){effect.dispose();effect.dispose();}else{renderer.lose();vi.advanceTimersByTime(10);}
      expect(vi.getTimerCount()).toBe(0);expect(effect.metrics.targetBytes).toBe(0);expect(effect.metrics.active).toBe(false);
      expect(spies.every(s=>s.mock.calls.length===1)).toBe(true);expect(textureDispose).not.toHaveBeenCalled();expect(f.material.onBeforeCompile).toBe(waterHook);
      renderer.ready(true);vi.advanceTimersByTime(100);expect(renderer.raw.render).not.toHaveBeenCalled();
      if(mode==='context'){renderer.restore();expect(effect.update(renderer.r,f.scene,f.camera,300,high).active).toBe(true);expect(renderer.raw.compile).toHaveBeenCalledTimes(4);}
      effect.dispose();
    }}finally{vi.useRealTimers();}
  });

  it('warms streamed material and instanced-layout changes before drawing them, in batches of at most eight', () => {
    const f=fixture(),effect=new TownWaterReflection(),renderer=fakeRenderer();
    for(let i=0;i<12;i++){const m=f.house.clone();m.material=new THREE.MeshStandardMaterial({color:0x778899+i});m.position.x+=i*.1;f.scene.add(m);}
    expect(effect.update(renderer.r,f.scene,f.camera,100,high).reason).toBe('warming-shaders');
    expect(renderer.raw.compile.mock.results.reduce((n,r)=>n+(r.value as Set<THREE.Material>).size,0)).toBe(8);
    expect(effect.update(renderer.r,f.scene,f.camera,200,high).active).toBe(true);expect(effect.metrics.warmupMaterials).toBe(14);
    const instances=new THREE.InstancedMesh(f.house.geometry,f.house.material,1);instances.setMatrixAt(0,new THREE.Matrix4().makeTranslation(602,limits.lakeHeight+4,2790));instances.name='streamed buildings';f.scene.add(instances);
    renderer.ready(false);expect(effect.update(renderer.r,f.scene,f.camera,300,high).reason).toBe('warming-shaders');
    expect(effect.metrics.active).toBe(false);expect(effect.metrics.warmupMaterials).toBe(15);
    effect.dispose();
  });

  it('keeps unsupported parallel compilation entirely dormant rather than using a blocking fallback', () => {
    const f=fixture(),effect=new TownWaterReflection(),renderer=fakeRenderer();renderer.raw.extensions.has=(name?:string)=>name!=='KHR_parallel_shader_compile';
    expect(effect.update(renderer.r,f.scene,f.camera,100,high).reason).toBe('unsupported');
    expect(renderer.raw.compile).not.toHaveBeenCalled();expect(renderer.raw.render).not.toHaveBeenCalled();expect(effect.metrics.targetBytes).toBe(0);effect.dispose();
  });

  it('retains source far crowns under a saturated wall draw budget without expanding total limits', () => {
    const f=fixture(),effect=new TownWaterReflection();f.house.removeFromParent();
    for(let i=0;i<200;i++){const house=f.house.clone();house.position.x+=i*.005;f.scene.add(house);}
    const crown=new THREE.InstancedMesh(new THREE.BoxGeometry(5,7,5),new THREE.MeshStandardMaterial({color:0x536b3d}),100);
    crown.name='Webster trees | far | broadleaf | ordinary';crown.userData.treeKind='far';
    for(let i=0;i<crown.count;i++)crown.setMatrixAt(i,new THREE.Matrix4().makeTranslation(602+i*.02,limits.lakeHeight+10,2790));
    f.scene.add(crown);
    const positions=crown.geometry.attributes.position.array.slice(),matrices=crown.instanceMatrix.array.slice();
    const renderer=fakeRenderer(()=>{expect(crown.visible).toBe(true);});
    expect(effect.update(renderer.r,f.scene,f.camera,100,high)).toMatchObject({active:true,calls:180,reservedCrownCalls:1,reservedCrownTriangles:1200,reservedCrownMeshes:1});
    expect(effect.metrics.triangles).toBeLessThanOrEqual(limits.triangles);expect(effect.metrics.reservedCrownCalls).toBeLessThanOrEqual(24);expect(effect.metrics.reservedCrownTriangles).toBeLessThanOrEqual(80000);
    expect(crown.geometry.attributes.position.array).toEqual(positions);expect(crown.instanceMatrix.array).toEqual(matrices);expect(crown.count).toBe(100);effect.dispose();
  });
});
