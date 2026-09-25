import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { advanceRealTime, DriveEngine, LANDMARKS, MPH, RoadGraph, spawnAtLandmark, type NetworkData } from './engine';
import { validateManifest, type Quality, type V3 } from './contracts';
import { TownWorld } from './world';
import { StreetDressing, updateDressingViewport } from './street-dressing';
import { HouseDressing } from './house-dressing';
import { RoadWear } from './road-wear';
import { CurbParking } from './curb-parking';
import { Traffic } from './traffic';
import { startupPosition } from './startup';
import { createSummerHaze, createSummerSky, createShadowAnchor, installAerialPerspective, SUMMER_LIGHT } from './atmosphere';
import { createTouringCar, type TouringCar } from './vehicle';
import { applyMeasuredBridgeGrades } from './bridge-grade';
import release from '../../../data/derived/town/release.json';
import { displayRoadName, turnDistanceLabel, displayChoices } from './road-display';
import { updateChoiceControls } from './choice-controls';
import { qualityPixelRatio, readPreferences, writePreferences, readSnapshot, restoreSnapshot, saveSnapshot, snapshotDrive, type CameraMode, type ComfortMode } from './ux-state';
import { drawTownOverview } from './explore-map';
import { drawNavigationBase, drawNavigationFurniture, drawNavigationPlaces, navigationPoint } from './navigation-map';
import placeDirectory from '../../../data/derived/town/place-directory.json';
import { readCriticalJson } from './critical-load';
import { CameraObstruction } from './camera-comfort';
import { RoadAudio } from './driving-audio';
import { checkTownUpdate } from './release-recovery';
import { TownWaterReflection } from './water-reflection';
import type { CinematicRenderer } from './cinematic';

type CinematicModule = typeof import('./cinematic');
const cinematicAllowed = (quality: Quality, mobile: boolean): boolean => !mobile && quality !== 'low';
const ASSET_ROOT = `/town-assets/${release.directory}/`;
const WORLD_URL = `${ASSET_ROOT}manifest.json`;
const NETWORK_URL = `${ASSET_ROOT}network.json`;
const SUN_OFFSET = new THREE.Vector3(-260, 205, 180);
const BASE_FOV = 57;
const SHADOW_MAP = 4096;
const SHADOW_SPAN = 250;
const SHADOW_LEAD = 55;
const CINEMATIC_FRAME_MS = 21;
const toWorld = (p: readonly number[]): V3 => [p[0], p[2], -p[1]];
type LandmarkKey = keyof typeof LANDMARKS;
type Session = { dispose(): void };


export async function startTown(root: HTMLElement): Promise<Session> {
  const element = <T extends HTMLElement>(name: string): T => {
    const node = root.querySelector<T>(`[data-town-${name}]`);
    if (!node) throw new Error(`The game interface is missing ${name}. Reload the page to try again.`);
    return node;
  };
  const canvas = element<HTMLCanvasElement>('canvas');
  const intro = element('intro');
  const play = element<HTMLButtonElement>('play');
  const status = element('status');
  const loading = root.querySelector<HTMLElement>('[data-town-loading]');
  const qualitySelect = element<HTMLSelectElement>('quality');
  const locationSelect = element<HTMLSelectElement>('location');
  const pauseButton = element<HTMLButtonElement>('pause');
  const reverseButton = element<HTMLButtonElement>('reverse');
  const cameraButton = element<HTMLButtonElement>('camera');
  const soundButton = element<HTMLButtonElement>('sound');
  const fullscreenButton = element<HTMLButtonElement>('fullscreen');
  const speedText = element('speed');
  const limitText = element('limit');
  const limitLabel = element('limit-label');
  const roadText = element('road');
  const distanceText = element('distance');
  const turnText = element('turn');
  const choicesText = element('choices');
  const clearButton = element<HTMLButtonElement>('clear');
  const cruiseText = element('cruise');
  const comfortSelect = element<HTMLSelectElement>('comfort');
  const engineVolume = element<HTMLInputElement>('engine-volume');
  const explore = element<HTMLDetailsElement>('explore');
  const overview = element<HTMLCanvasElement>('overview');
  let selectedDirectoryPlace: string | undefined;
  const recovery = element('recovery');
  const recoveryMessage = element('recovery-message');
  const retryStreet = element<HTMLButtonElement>('retry-street');
  const restart = element<HTMLButtonElement>('restart');
  const minimap = element<HTMLCanvasElement>('minimap');
  const map = minimap.getContext('2d');
  const abort = new AbortController();
  const signal = abort.signal;
  let disposed = false;
  let frame = 0;
  let world: TownWorld | undefined;
  let dressing: StreetDressing | undefined;
  let houses: HouseDressing | undefined;
  let curbParking: CurbParking | undefined;
  let traffic: Traffic | undefined;
  let restoreFog: (() => void) | undefined;
  let renderer: THREE.WebGLRenderer | undefined;
  let resize: ResizeObserver | undefined;
  let environmentTarget: THREE.WebGLRenderTarget | undefined;
  let sky: Sky | undefined;
  let scene: THREE.Scene | undefined;
  let car: THREE.Group | undefined;
  let vehicle: TouringCar | undefined;
  const audio = new RoadAudio();
  const cameraObstruction = new CameraObstruction();
  const waterReflection = new TownWaterReflection();
  let cinematic: CinematicRenderer | undefined;
  let cinematicModule: Promise<CinematicModule | undefined> | undefined;
  let cinematicReductions = 0;
  let cinematicUnsupported = false;
  const cameraAnchor = new THREE.Vector3();
  const held = new Set<string>();
  const snapshots: number[] = [];
  const startedAt = performance.now();
  const mobile = matchMedia('(pointer: coarse)').matches || window.innerWidth < 720;
  let storage: Storage | undefined;
  try { storage = localStorage; } catch { /* Private/blocked storage is optional. */ }
  const preferences = readPreferences(storage);
  comfortSelect.value = preferences.comfort;
  engineVolume.value = String(Math.round(preferences.engineVolume * 100));
  audio.volume = preferences.engineVolume;
  let graph: RoadGraph;
  let engine: DriveEngine;
  let cameraMode: CameraMode = preferences.camera;
  let quality: Quality = (qualitySelect.value as Quality) || 'auto';
  let streamPaused = false;
  let teleporting = false;
  let firstFrame = true;
  // QA-only camera placement (screenshot harnesses); null in normal play.
  let debugCamera: { eye: number[]; target: number[] } | null = null;
  const bodyLean = { roll: 0, pitch: 0 };
  let pixelRatio = qualityPixelRatio(quality, mobile, devicePixelRatio);
  let last = performance.now();
  let hudAt = 0;
  let streamingAt = 0;
  let qualityAt = 0;
  let drawCount = 0;
  let controlsReady = false;
  let lastEngineMessage = '';
  let lastAnnouncement = '';
  let savedAt = 0;
  let streamStartedAt = 0;
  let contextLost = false;
  let presentationTime = 0;
  let lastDraw = 0;
  let renderRequested = true;
  let updateAvailable = false;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const steady = (): boolean => preferences.comfort === 'steady' || (preferences.comfort === 'system' && reducedMotion.matches);
  const persist = (): void => { if (engine) saveSnapshot(snapshotDrive(engine, release.manifestSha256), storage); };
  const points = { car: new THREE.Vector3(), direction: new THREE.Vector3(), eye: new THREE.Vector3(), target: new THREE.Vector3(), wantedEye: new THREE.Vector3(), wantedTarget: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0), right: new THREE.Vector3() };

  const loadCinematic = (): Promise<CinematicModule | undefined> => cinematicModule ??= import('./cinematic').catch(() => { cinematicModule = undefined; return undefined; });
  const setStatus = (message: string): void => {
    if (status.textContent !== message) status.textContent = message;
    if (loading && !loading.hidden && loading.textContent !== message) loading.textContent = message;
  };
  const setPaused = (paused: boolean): void => {
    if (!engine) return;
    engine.paused = paused;
    renderRequested = true;
    held.clear();
    if (paused) { audio.silence(); persist(); }
    pauseButton.textContent = paused ? 'Resume' : 'Pause';
    pauseButton.setAttribute('aria-pressed', String(paused));
    root.dataset.paused = String(paused);
    if (paused) setStatus('Paused. Press Space or Resume to continue.');
    else setStatus('Up to cruise. Left and right choose your next turn.');
  };

  const session: Session = {
    dispose() {
      if (disposed) return;
      disposed = true;
      persist();
      abort.abort();
      cancelAnimationFrame(frame);
      resize?.disconnect();
      held.clear();
      audio.dispose();
      vehicle?.dispose();
      cinematic?.dispose();
      cinematic = undefined;
      waterReflection.dispose();
      world?.dispose();
      dressing?.dispose();
      houses?.dispose();
      curbParking?.dispose();
      traffic?.dispose();
      restoreFog?.();
      restoreFog = undefined;
      environmentTarget?.dispose();
      sky?.geometry.dispose();
      sky?.material.dispose();
      renderer?.dispose();
      delete root.dataset.ready;
      root.removeAttribute('aria-busy');
      const debug = (window as unknown as { __webster?: { root: HTMLElement } }).__webster;
      if (debug?.root === root) delete (window as unknown as { __webster?: unknown }).__webster;
    },
  };
  document.addEventListener('astro:before-swap', () => session.dispose(), { once: true, signal });
  play.disabled = true;
  root.setAttribute('aria-busy', 'true');
  if (loading) loading.hidden = false;

  try {
    setStatus('Loading the roads and the first streets…');
    const transfer = { roads: 0, manifest: 0 };
    const manifestRequest = readCriticalJson<unknown>(WORLD_URL, signal, { label: 'Town manifest', onProgress: p => { transfer.manifest = p.receivedBytes; } });
    const networkRequest = readCriticalJson<NetworkData>(NETWORK_URL, signal, { label: 'Road network', onProgress: p => { transfer.roads = p.receivedBytes; if (!disposed) setStatus(`Loading roads… ${(transfer.roads / 1048576).toFixed(1)} MB received`); } });
    const initialRequests = Promise.all([manifestRequest, networkRequest]);
    // A renderer failure can cancel requests before the later await attaches.
    void initialRequests.catch(() => {});
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = SUMMER_LIGHT.exposure;
    renderer.setPixelRatio(pixelRatio);
    // Counters are reset once per displayed frame so the camera finish's
    // fullscreen passes are included beside the scene's own draws.
    renderer.info.autoReset = false;
    renderer.shadowMap.enabled = !mobile && quality !== 'low';
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // The desktop camera finish is a separate optional chunk. Fetch it beside
    // the roads and first tiles so it is normally ready before the first frame.
    if (cinematicAllowed(quality, mobile)) void loadCinematic();
    scene = new THREE.Scene();
    scene.fog = createSummerHaze();
    restoreFog = installAerialPerspective(SUN_OFFSET);
    const camera = new THREE.PerspectiveCamera(BASE_FOV, 1, 0.08, 6500);
    const ambient = new THREE.HemisphereLight(SUMMER_LIGHT.skyFill, SUMMER_LIGHT.groundFill, SUMMER_LIGHT.fillIntensity);
    scene.add(ambient);
    const sun = new THREE.DirectionalLight(SUMMER_LIGHT.sun, SUMMER_LIGHT.sunIntensity);
    sun.castShadow = true;
    // Shadows are desktop-only. A finer map over a wider frame keeps crisp
    // contact shadows while reaching further down the street ahead.
    sun.shadow.mapSize.set(SHADOW_MAP, SHADOW_MAP);
    sun.shadow.camera.left = -SHADOW_SPAN / 2;
    sun.shadow.camera.right = SHADOW_SPAN / 2;
    sun.shadow.camera.top = SHADOW_SPAN / 2;
    sun.shadow.camera.bottom = -SHADOW_SPAN / 2;
    sun.shadow.camera.near = 10;
    sun.shadow.camera.far = 900;
    sun.shadow.bias = -0.00012;
    sun.shadow.normalBias = 0.035;
    const shadowAnchor=createShadowAnchor(SUN_OFFSET,SHADOW_SPAN,sun.shadow.mapSize.x);
    const shadowFocus = new THREE.Vector3();
    scene.add(sun, sun.target);
    const pmrem = new THREE.PMREMGenerator(renderer);
    sky = createSummerSky(SUN_OFFSET);
    scene.add(sky);
    const skyScene = new THREE.Scene();
    const environmentSky = createSummerSky(SUN_OFFSET, { surroundings: true });
    skyScene.add(environmentSky);
    try { environmentTarget = pmrem.fromScene(skyScene, 0.04); }
    finally { pmrem.dispose(); environmentSky.geometry.dispose(); environmentSky.material.dispose(); }
    scene.environment = environmentTarget.texture;

    const manifest = await manifestRequest;
    validateManifest(manifest);
    if (disposed) return session;
    const startingLocation = (locationSelect.value || 'DOWNTOWN') as LandmarkKey;
    const requestedResume = root.dataset.resumeDrive === 'true' ? readSnapshot(release.manifestSha256, storage) : null;
    delete root.dataset.resumeDrive;
    world = new TownWorld(manifest, new URL(WORLD_URL, location.href).href, () => {});
    world.setQuality(quality, mobile);
    scene.add(world.root);
    const landscapeReady = world.initialize(requestedResume?.position ? toWorld(requestedResume.position) : startupPosition(startingLocation, manifest));
    void landscapeReady.catch(() => {});
    const network = await networkRequest;
    await new Promise((resolve) => setTimeout(resolve, 0));
    if (disposed) return session;
    graph = new RoadGraph(network);
    applyMeasuredBridgeGrades(graph);
    // Overhead utilities and hydrants follow the named street centrelines.
    dressing = new StreetDressing(network);
    houses = new HouseDressing(dressing);
    curbParking = new CurbParking(network);
    world.setStreetDressing(dressing, houses, new RoadWear(network), curbParking);
    // A few cars share the mapped lanes; fewer on Low and mobile.
    traffic = new Traffic(graph, mobile || quality === 'low' ? 6 : 12);
    scene.add(traffic.root);
    engine = (requestedResume && restoreSnapshot(graph, requestedResume)) || spawnAtLandmark(graph, startingLocation);
    setStatus('Preparing the landscape and your car…');
    vehicle = createTouringCar();
    car = vehicle.root;
    await landscapeReady;
    if (disposed) return session;
    await world.prepareAt(toWorld(engine.pose()[0]));
    if (disposed) return session;
    car.name = 'Your car';
    scene.add(car);

    const fit = (): void => {
      renderRequested = true;
      const box = canvas.getBoundingClientRect();
      renderer!.setSize(Math.max(1, box.width), Math.max(1, box.height), false);
      cinematic?.setSize(box.width, box.height);
      camera.aspect = Math.max(1, box.width) / Math.max(1, box.height);
      camera.updateProjectionMatrix();
    };
    const createCinematic = (module: CinematicModule | undefined): void => {
      // The finish needs renderable WebGL2 half-float targets; otherwise the
      // direct render remains, exactly as on Low and mobile.
      if (cinematic || cinematicUnsupported || !module || disposed || contextLost || !cinematicAllowed(quality, mobile)) return;
      if (!renderer!.capabilities.isWebGL2 || !renderer!.extensions.has('EXT_color_buffer_float')) { cinematicUnsupported = true; return; }
      try {
        cinematic = new module.CinematicRenderer(renderer!, scene!, camera, { halfResAO: quality !== 'high' });
        if (!cinematic.verify()) { cinematic.dispose(); cinematic = undefined; cinematicUnsupported = true; }
      } catch { cinematic?.dispose(); cinematic = undefined; cinematicUnsupported = true; }
      cinematicReductions = 0;
      renderRequested = true;
    };
    const releaseCinematic = (): void => { cinematic?.dispose(); cinematic = undefined; renderRequested = true; };
    // Materials compile for the first frame's actual target, so the finish is
    // attached before that frame rather than swapped in once the street shows.
    if (cinematicAllowed(quality, mobile)) createCinematic(await Promise.race([loadCinematic(), new Promise<undefined>(resolve => setTimeout(resolve, 1500))]));
    if (disposed) return session;
    resize = new ResizeObserver(fit);
    resize.observe(canvas);
    intro.hidden = true;
    if (loading) loading.hidden = true;
    root.dataset.ready = 'true';
    root.removeAttribute('aria-busy');
    canvas.tabIndex = 0;
    canvas.focus({ preventScroll: true });
    fit();
    for (const button of [pauseButton, reverseButton, cameraButton, soundButton, fullscreenButton]) button.disabled = false;
    element<HTMLButtonElement>('recovery-reverse').disabled = false;
    cameraButton.textContent = `Camera: ${cameraMode}`;
    controlsReady = true;
    for (const button of root.querySelectorAll<HTMLButtonElement>('[data-town-place], [data-town-report], [data-town-directory-place], [data-town-directory-reset]')) button.disabled = false;
    if (engine.paused) setPaused(true);
    setStatus(engine.paused ? `Resumed on ${displayRoadName(engine.edge.name)}, safely paused. Press Up or Resume when ready.` : `Ready near ${LANDMARKS[startingLocation].name}. Press Up to cruise.`);
    lastEngineMessage = engine.lastMessage;

    const changeCamera = (): void => {
      cameraMode = cameraMode === 'hood' ? 'chase' : cameraMode === 'chase' ? 'wide' : 'hood';
      cameraButton.textContent = `Camera: ${cameraMode}`;
      preferences.camera = cameraMode; writePreferences(preferences, storage);
      firstFrame = true;
      renderRequested = true;
    };
    const reverseCar = (): void => {
      if (teleporting || contextLost) return;
      if (!engine.flipDirection()) { setStatus('The direction could not be changed here.'); return; }
      held.clear(); firstFrame = true; streamPaused = false;
      world!.update(toWorld(engine.pose()[0]), toWorld(engine.pose(100)[0]), true);
      refreshHud();
      setStatus(engine.lastMessage);
      persist();
    };
    const requestTurn = (turn: 'LEFT' | 'RIGHT' | null): void => {
      engine.queue(turn);
      refreshHud(); setStatus(engine.lastMessage);
    };
    const teleport = async (key: LandmarkKey): Promise<void> => {
      if (teleporting || contextLost) return;
      teleporting = true;
      locationSelect.disabled = true;
      if (loading) loading.hidden = false;
      const previous = engine;
      previous.paused = true;
      held.clear();
      audio.silence();
      const destination = spawnAtLandmark(graph, key);
      setStatus(`Loading ${LANDMARKS[key].name}…`);
      try {
        await world!.prepareAt(toWorld(destination.pose()[0]));
        if (disposed) return;
        engine = destination;
        traffic?.clear(engine);
        firstFrame = true;
        setPaused(false);
        locationSelect.value = key;
        setStatus(`Ready near ${LANDMARKS[key].name}. This drive starts at zero miles.`);
        persist();
        if (explore.open) drawTownOverview(overview, engine, selectedDirectoryPlace);
      } catch (error) {
        engine = previous;
        setPaused(true);
        setStatus(error instanceof Error ? error.message : 'This location could not load. Try again.');
      } finally {
        teleporting = false;
        locationSelect.disabled = false;
        if (loading) loading.hidden = true;
      }
    };
    const activate = (input: string): void => {
      if (!controlsReady || teleporting || contextLost) return;
      if (input === 'left') requestTurn('LEFT');
      if (input === 'right') requestTurn('RIGHT');
      if (input === 'up' || input === 'down') {
        if (input === 'up' && engine.paused && !teleporting) setPaused(false);
        held.add(input);
        if (!streamPaused) engine.step(1 / 60, held.has('up') && !held.has('down'), held.has('down'));
      }
    };
    const eventOptions = { signal };
    canvas.addEventListener('keydown', (event) => {
      if (!controlsReady || teleporting || contextLost) return;
      const key = event.key;
      const mapped: Record<string, string> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
      if (mapped[key]) {
        event.preventDefault();
        event.stopPropagation();
        if (!event.repeat) activate(mapped[key]);
      } else if (key === ' ' || key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        if (!event.repeat) setPaused(key === 'Escape' || !engine.paused);
      } else if (key.toLowerCase() === 'c') {
        event.preventDefault();
        if (!event.repeat) changeCamera();
      } else if (key.toLowerCase() === 'r') {
        event.preventDefault();
        if (!event.repeat) reverseCar();
      } else if (key.toLowerCase() === 's') {
        event.preventDefault();
        requestTurn(null);
      } else if (key.toLowerCase() === 'm') {
        event.preventDefault(); root.dispatchEvent(new Event('town:mute'));
      } else if (/^[1-6]$/.test(key)) {
        event.preventDefault();
        void teleport(Object.keys(LANDMARKS)[Number(key) - 1] as LandmarkKey);
      }
    }, eventOptions);
    window.addEventListener('keyup', (event) => {
      if (event.key === 'ArrowUp') held.delete('up');
      if (event.key === 'ArrowDown') held.delete('down');
    }, eventOptions);
    canvas.addEventListener('pointerdown', () => canvas.focus({ preventScroll: true }), eventOptions);
    canvas.addEventListener('blur', () => held.clear(), eventOptions);
    root.addEventListener('focusout', (event) => {
      if (event.relatedTarget instanceof Node && root.contains(event.relatedTarget)) return;
      setTimeout(() => { if (!disposed && !root.contains(document.activeElement)) setPaused(true); }, 0);
    }, eventOptions);
    window.addEventListener('blur', () => setPaused(true), eventOptions);
    document.addEventListener('visibilitychange', () => { if (document.hidden) setPaused(true); }, eventOptions);
    canvas.addEventListener('webglcontextlost', (event) => {
      event.preventDefault();
      contextLost = true;
      // This session stays paused until Restart creates a new one. Cancel its
      // optional shader work immediately rather than polling a lost context.
      waterReflection.dispose();
      releaseCinematic();
      updateAvailable = false;
      element<HTMLButtonElement>('dismiss-update').hidden = true;
      const updateButton = recovery.querySelector<HTMLButtonElement>('[data-town-reload]'); if (updateButton) updateButton.hidden = true;
      setPaused(true);
      recovery.hidden = false; retryStreet.hidden = true; restart.hidden = false;
      element<HTMLButtonElement>('recovery-reverse').disabled = true;
      recoveryMessage.textContent = 'Graphics were interrupted. Your last safe road position is saved.';
      setStatus('Graphics were interrupted. Use Restart graphics to continue from a safe paused position.');
    }, eventOptions);
    restart.addEventListener('click', () => { persist(); root.dispatchEvent(new Event('town:restart')); }, eventOptions);
    retryStreet.addEventListener('click', () => {
      world!.retryAt(toWorld(engine.pose(Math.max(12, engine.speed * 2))[0])); streamStartedAt = performance.now();
      setStatus('Retrying the next street. Your car stays safely paused while it loads.');
      void checkTownUpdate(signal).then(update => {
        if (disposed || update !== 'new') return;
        updateAvailable = true;
        recovery.hidden = false;
        const button = recovery.querySelector<HTMLButtonElement>('[data-town-reload]'); if (button) button.hidden = false;
        recoveryMessage.textContent = 'A newer version of the town is available. Reload to update; your safe road position is saved.';
        setStatus(recoveryMessage.textContent);
      });
    }, eventOptions);
    element<HTMLButtonElement>('dismiss-update').addEventListener('click', () => {
      updateAvailable = false;
      const button = recovery.querySelector<HTMLButtonElement>('[data-town-reload]'); if (button) button.hidden = true;
      refreshHud(); canvas.focus({ preventScroll: true });
      setStatus('Continuing this version. Reloading the page will update the game.');
    }, eventOptions);
    element<HTMLButtonElement>('recovery-reverse').addEventListener('click', () => { reverseCar(); canvas.focus({ preventScroll: true }); }, eventOptions);
    clearButton.addEventListener('click', (event) => {
      requestTurn(null);
      if (event.detail) canvas.focus({ preventScroll: true });
      else (choicesText.querySelector<HTMLButtonElement>('button[aria-pressed="true"]') ?? canvas).focus({ preventScroll: true });
    }, eventOptions);
    root.addEventListener('town:mute', () => { audio.turnOff(); soundButton.textContent = 'Engine sound off'; soundButton.setAttribute('aria-pressed', 'false'); setStatus('All sound is off. Driving sound and radio can be turned on separately.'); }, eventOptions);
    root.addEventListener('town:pause', () => setPaused(true), eventOptions);

    for (const button of root.querySelectorAll<HTMLElement>('[data-town-input]')) {
      button.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        button.setPointerCapture(event.pointerId);
        activate(button.dataset.townInput!);
      }, eventOptions);
      for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(name, () => held.delete(button.dataset.townInput!), eventOptions);
      button.addEventListener('keydown', (event) => {
        if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); if (!event.repeat) activate(button.dataset.townInput!); }
      }, eventOptions);
      button.addEventListener('keyup', () => held.delete(button.dataset.townInput!), eventOptions);
    }
    reverseButton.addEventListener('click', () => { reverseCar(); canvas.focus({ preventScroll: true }); }, eventOptions);
    choicesText.addEventListener('click', event => {
      const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('button[data-edge]') : null;
      if (button && !teleporting && engine.queueChoice(Number(button.dataset.edge))) {
        refreshHud(); setStatus(engine.lastMessage); if (event.detail) canvas.focus({ preventScroll: true });
      }
    }, eventOptions);
    pauseButton.addEventListener('click', () => { setPaused(!engine.paused); canvas.focus({ preventScroll: true }); }, eventOptions);
    cameraButton.addEventListener('click', () => { changeCamera(); canvas.focus({ preventScroll: true }); }, eventOptions);
    soundButton.addEventListener('click', async () => {
      try {
        const enabled = await audio.toggle();
        if (disposed) return;
        soundButton.setAttribute('aria-pressed', String(enabled));
        soundButton.textContent = enabled ? 'Engine sound on' : 'Engine sound off';
      } catch { setStatus('Sound is unavailable in this browser. Driving still works.'); }
    }, eventOptions);
    const syncFullscreen = (): void => {
      const expanded = document.fullscreenElement === root || root.classList.contains('town-expanded');
      fullscreenButton.textContent = expanded ? 'Exit full screen' : 'Full screen';
      fullscreenButton.setAttribute('aria-pressed', String(expanded));
      fit();
    };
    document.addEventListener('fullscreenchange', syncFullscreen, eventOptions);
    fullscreenButton.addEventListener('click', async () => {
      try {
        if (document.fullscreenElement) await document.exitFullscreen();
        else if (root.requestFullscreen) await root.requestFullscreen();
        else root.classList.toggle('town-expanded');
        canvas.focus({ preventScroll: true });
      } catch { root.classList.toggle('town-expanded'); }
      syncFullscreen();
    }, eventOptions);
    locationSelect.addEventListener('change', () => void teleport(locationSelect.value as LandmarkKey), eventOptions);
    comfortSelect.addEventListener('change', () => { preferences.comfort = comfortSelect.value as ComfortMode; writePreferences(preferences, storage); firstFrame = true; setStatus(steady() ? 'Steady camera enabled. Decorative motion is reduced.' : 'Standard camera enabled.'); }, eventOptions);
    engineVolume.addEventListener('input', () => { audio.volume = Number(engineVolume.value) / 100; preferences.engineVolume = audio.volume; writePreferences(preferences, storage); }, eventOptions);
    explore.addEventListener('toggle', () => { if (explore.open) { setPaused(true); drawTownOverview(overview, engine, selectedDirectoryPlace); } }, eventOptions);
    for (const button of root.querySelectorAll<HTMLButtonElement>('[data-town-place]')) button.addEventListener('click', () => { explore.open = false; void teleport(button.dataset.townPlace as LandmarkKey); }, eventOptions);
    const showDirectoryPlace = (id?: string): void => {
      const place = placeDirectory.places.find(row => row.id === id); selectedDirectoryPlace = place?.id;
      for (const button of root.querySelectorAll<HTMLButtonElement>('[data-town-directory-place]')) button.setAttribute('aria-pressed', String(button.dataset.townDirectoryPlace === place?.id));
      element('directory-info').textContent = place ? `${place.title}. Near ${place.nearRoad}. ${place.detail} The car stays where you left it.` : 'Whole-town view. Squares mark researched scenery; numbered circles are the six driving starts.';
      setPaused(true); drawTownOverview(overview, engine, selectedDirectoryPlace);
    };
    for (const button of root.querySelectorAll<HTMLButtonElement>('[data-town-directory-place]')) button.addEventListener('click', () => showDirectoryPlace(button.dataset.townDirectoryPlace), eventOptions);
    element<HTMLButtonElement>('directory-reset').addEventListener('click', () => showDirectoryPlace(), eventOptions);
    const reportOutput = element<HTMLTextAreaElement>('report-output');
    let reportPose: Record<string, unknown> = {};
    element<HTMLButtonElement>('report').addEventListener('click', () => {
      setPaused(true); element('report-panel').hidden = false;
      reportPose = { game: 'Webster', release: 'finished-webster-v8', source: release.directory, edge: engine.edgeId, road: engine.edge.name, s: engine.s, phase: engine.phase, pose: engine.pose(), camera: cameraMode, quality, url: location.href };
      reportOutput.value = JSON.stringify(reportPose, null, 2); element<HTMLTextAreaElement>('report-note').focus();
    }, eventOptions);
    element<HTMLButtonElement>('report-copy').addEventListener('click', async () => {
      reportOutput.value = JSON.stringify({ ...reportPose, note: element<HTMLTextAreaElement>('report-note').value.slice(0, 4000) }, null, 2);
      try { await navigator.clipboard.writeText(reportOutput.value); setStatus('Location and note copied. Nothing was sent.'); }
      catch { reportOutput.focus(); reportOutput.select(); setStatus('Select and copy the location report below. Nothing was sent.'); }
    }, eventOptions);
    qualitySelect.addEventListener('change', () => {
      quality = qualitySelect.value as Quality;
      world!.setQuality(quality, mobile);
      renderer!.shadowMap.enabled = quality !== 'low' && !mobile;
      pixelRatio = qualityPixelRatio(quality, mobile, devicePixelRatio);
      renderer!.setPixelRatio(pixelRatio);
      releaseCinematic();
      if (cinematicAllowed(quality, mobile)) void loadCinematic().then(module => { createCinematic(module); fit(); });
      world!.update(toWorld(engine.pose()[0]), toWorld(engine.pose(100)[0]), true);
      fit();
      try { localStorage.setItem('webster-quality', quality); } catch {}
    }, eventOptions);

    function drawMap(): void {
      if (!map) return;
      const size = 180;
      if (minimap.width !== size * 2) { minimap.width = size * 2; minimap.height = size * 2; }
      map.setTransform(2, 0, 0, 2, 0, 0);
      map.clearRect(0, 0, size, size);
      const [position, direction] = engine.pose();
      const scale = 0.19;
      const view = { width: size, height: size, center: position, scale };
      const project = (p: readonly number[]): [number, number] => navigationPoint(p, view);
      drawNavigationBase(map, graph, view);
      map.lineCap = 'round';
      const next = engine.nextJunction();
      const current = graph.paths.get(engine.edgeId)!;
      map.beginPath();
      current.points.forEach((p: readonly number[], index: number) => { const q = project(p); if (!index) map.moveTo(...q); else map.lineTo(...q); });
      map.strokeStyle = '#efe0ad';
      map.lineWidth = 2.8;
      map.stroke();
      if (next?.selected) {
        const selected = graph.paths.get(next.selected.edgeId);
        if (selected) {
          map.beginPath();
          selected.points.forEach((p: readonly number[], index: number) => { const q = project(p); if (!index) map.moveTo(...q); else map.lineTo(...q); });
          map.strokeStyle = '#efe0ad';
          map.lineWidth = 2;
          map.stroke();
        }
      }
      drawNavigationPlaces(map, view);
      map.save();
      map.translate(size / 2, size / 2);
      map.rotate(Math.atan2(direction[0], direction[1]));
      map.beginPath(); map.moveTo(0, -7); map.lineTo(5, 5); map.lineTo(0, 3); map.lineTo(-5, 5); map.closePath();
      map.strokeStyle = '#172a23'; map.lineWidth = 2.5; map.stroke();
      map.fillStyle = '#fff5d3'; map.fill();
      map.restore();
      drawNavigationFurniture(map, view);
    }

    function refreshHud(): void {
      speedText.textContent = String(Math.round(engine.speed / MPH));
      roadText.textContent = displayRoadName(engine.edge.name);
      const rampTarget = engine.rampTarget();
      limitLabel.textContent = rampTarget === undefined ? 'Road limit' : 'Ramp target';
      limitText.textContent = `${Math.round((rampTarget ?? engine.roadLimit()) / MPH)} mph`;
      limitText.title = rampTarget !== undefined ? 'Modeled acceleration toward the highway limit' : engine.edge.speed_status === 'posted inventory mph converted to km/h' ? 'Posted limit from the road inventory' : 'Game estimate from the mapped road class';
      limitText.setAttribute('aria-label', `${limitText.textContent}. ${limitText.title}. Details in How to drive.`);
      const next = engine.nextJunction();
      const committing = engine.phase === 'TURN' ? engine.connection!.choice : null;
      distanceText.textContent = `${(engine.distance / 1609.344).toFixed(1)} mi`;
      const boundary = !!next && !next.choices.length;
      turnText.textContent = engine.paused ? 'Drive paused' : streamPaused ? 'Loading the next street' : committing
        ? `${committing.label === 'U-turn' ? 'Turning around' : `Turning ${committing.label.toLowerCase()}`} · next choices below`
        : boundary ? `${next.obstacle ? 'Mapped obstruction' : next.boundary ? 'Town boundary · stopping' : 'Mapped road ends'} ${turnDistanceLabel(next.distance)}`
        : next?.selected ? `${next.selected.label === 'U-turn' ? 'Automatic turn around' : next.selected.label} ${turnDistanceLabel(next.distance)}` : 'Follow the road';
      choicesText.setAttribute('aria-label', committing ? 'Choices for the junction after this turn' : 'Available turns');
      updateChoiceControls(choicesText, graph, next);
      clearButton.hidden = engine.queued === null && engine.queuedEdge === null;
      cruiseText.textContent = engine.paused ? 'Paused' : streamPaused ? 'Waiting for street' : held.has('down') ? 'Braking' : engine.endOfRoute ? next?.boundary ? 'Town boundary' : 'Road ends' : engine.speed < 0.05 && !engine.cruiseAtLimit ? 'Up to cruise' : engine.cruiseAtLimit ? 'Cruise at limit' : `Cruise ${Math.round(engine.cruise / MPH)} mph`;
      if (engine.lastMessage !== lastEngineMessage) { lastEngineMessage = engine.lastMessage; setStatus(engine.lastMessage); }
      if (!engine.paused && !streamPaused && next && next.distance < Math.max(40, engine.speed * 6)) {
        const announcement = `${next.edgeId}:${next.selected?.edgeId ?? 'end'}:${committing ? 'later' : 'now'}`;
        if (announcement !== lastAnnouncement) {
          lastAnnouncement = announcement;
          const selected = displayChoices(graph, next.choices).find(row => row.choice.edgeId === next.selected?.edgeId);
          setStatus(boundary ? `${next.obstacle ? 'A mapped obstruction' : next.boundary ? 'The mapped town boundary' : 'The mapped road ends'} ${turnDistanceLabel(next.distance)}. ${next.boundary ? 'The car will stop before the edge. ' : ''}Turn around or choose another starting place.` : `${committing ? 'After this turn: ' : ''}${next.selected?.label} ${turnDistanceLabel(next.distance)} onto ${selected?.name}. Choose another branch with the arrow keys or road buttons.`);
        }
      }
      if (!contextLost) {
        recovery.hidden = !updateAvailable && !engine.endOfRoute && !(streamPaused && performance.now() - streamStartedAt > 8000);
        restart.hidden = true; retryStreet.hidden = !streamPaused;
        element<HTMLButtonElement>('dismiss-update').hidden = !updateAvailable;
        if (!recovery.hidden) recoveryMessage.textContent = updateAvailable ? 'A newer version of the town is available. Reload to update; your safe road position is saved.' : streamPaused ? 'This street is taking longer to load. Retry, turn around or choose a starting place.' : engine.lastMessage;
      }
      drawMap();
    }

    const tick = (now: number): void => {
      if (disposed) return;
      frame = requestAnimationFrame(tick);
      const elapsed = Math.min(0.5, Math.max(0, (now - last) / 1000));
      last = now;
      if (contextLost) return;
      if (!document.hidden && !engine.paused) {
        snapshots.push(elapsed * 1000);
        if (snapshots.length > 1800) snapshots.shift();
      }
      const forwardPoint = toWorld(engine.pose(Math.max(12, engine.speed * 2))[0]);
      if (!teleporting) {
        const ready = world!.isReadyAt(forwardPoint);
        if (!ready && engine.speed > 0.2 && !streamPaused) { streamPaused = true; streamStartedAt = now; audio.silence(); setStatus('Loading the next street…'); }
        if (ready && streamPaused) { streamPaused = false; setStatus(engine.paused ? 'Street ready. Your drive remains paused.' : 'Street ready. Continuing your drive.'); }
        if (!streamPaused) advanceRealTime(engine, elapsed, held.has('up') && !held.has('down'), held.has('down'));
      }
      const [position, tangent] = engine.pose();
      const renderedPosition = toWorld(position);
      points.car.fromArray(renderedPosition);
      points.direction.fromArray(toWorld(tangent)).normalize();
      points.right.crossVectors(points.direction, points.up).normalize();
      car!.position.copy(points.car);
      car!.rotation.set(Math.asin(Math.max(-1, Math.min(1, points.direction.y))), Math.atan2(-points.direction.x, -points.direction.z), 0, 'YXZ');
      const futureTangent = toWorld(engine.pose(3)[1]);
      const headingChange = Math.atan2(Math.sin(Math.atan2(-futureTangent[0], -futureTangent[2]) - car!.rotation.y), Math.cos(Math.atan2(-futureTangent[0], -futureTangent[2]) - car!.rotation.y));
      // Body lean from lateral and longitudinal acceleration, eased like a
      // damped suspension: outward roll in turns, dive under braking, squat
      // under power. The road pose, wheels and camera anchor are unchanged.
      const lateral = engine.speed * engine.speed * headingChange / 3, longitudinal = engine.paused ? 0 : engine.acceleration;
      const leanEase = 1 - Math.exp(-elapsed * 6);
      // Positive heading change is a left turn; the body rolls out to the right (negative Z).
      bodyLean.roll += (Math.max(-0.05, Math.min(0.05, -lateral * 0.009)) - bodyLean.roll) * leanEase;
      bodyLean.pitch += (Math.max(-0.035, Math.min(0.035, longitudinal * 0.006)) - bodyLean.pitch) * leanEase;
      vehicle!.update({ distanceM: engine.distance, steeringRadians: Math.max(-0.55, Math.min(0.55, Math.atan(2.6 * headingChange / 3))), braking: held.has('down') && !engine.paused, rollRadians: bodyLean.roll, pitchRadians: bodyLean.pitch });
      if (cameraMode === 'hood') {
        points.wantedEye.copy(points.car).addScaledVector(points.direction, 0.95).addScaledVector(points.right, -0.28).addScaledVector(points.up, 1.42);
        points.wantedTarget.fromArray(toWorld(engine.pose(20)[0])).addScaledVector(points.up, 1.5);
      } else {
        const wide = cameraMode === 'wide';
        points.wantedEye.copy(points.car).addScaledVector(points.direction, wide ? -12 : -8.8).addScaledVector(points.up, wide ? 6.4 : 3.6);
        points.wantedTarget.copy(points.car).addScaledVector(points.direction, 12).addScaledVector(points.up, 1.15);
      }
      const smoothing = firstFrame ? 1 : 1 - Math.exp(-elapsed * (cameraMode === 'hood' ? 18 : steady() ? 12 : 7));
      points.eye.lerp(points.wantedEye, smoothing);
      points.target.lerp(points.wantedTarget, smoothing);
      car!.visible = cameraMode !== 'hood';
      if (cameraMode !== 'hood') {
        cameraAnchor.copy(points.car).addScaledVector(points.up, 1.3);
        const clearance = cameraObstruction.resolve(cameraAnchor, points.eye, world!.cameraOccluders(renderedPosition, 24), now, firstFrame);
        if (clearance.close) {
          // If even the short boom would enter the car, use its clear road-eye
          // view until the obstruction passes, rather than showing body interiors.
          points.eye.copy(points.car).addScaledVector(points.direction, 0.95).addScaledVector(points.up, 1.42);
          points.target.fromArray(toWorld(engine.pose(20)[0])).addScaledVector(points.up, 1.5);
          car!.visible = false;
        }
      }
      camera.position.copy(points.eye);
      camera.lookAt(points.target);
      // The view widens a little with speed (57 to about 62 degrees at 25 m/s)
      // for a sense of pace; the steady camera and QA views keep a fixed lens.
      const wantedFov = BASE_FOV + (steady() || debugCamera ? 0 : Math.min(1, Math.max(0, engine.speed - 4) / 21) * 5);
      const fov = camera.fov + (wantedFov - camera.fov) * (firstFrame ? 1 : 1 - Math.exp(-elapsed * 2.5));
      if (Math.abs(fov - camera.fov) > 0.005) { camera.fov = fov; camera.updateProjectionMatrix(); }
      if (debugCamera) { camera.position.set(debugCamera.eye[0], debugCamera.eye[1], debugCamera.eye[2]); camera.lookAt(debugCamera.target[0], debugCamera.target[1], debugCamera.target[2]); }
      if (firstFrame) renderRequested = true;
      firstFrame = false;
      // Most of the shadow frame lies ahead of the car, where the camera looks.
      shadowAnchor(shadowFocus.copy(points.car).addScaledVector(points.direction, SHADOW_LEAD), sun.target.position);
      sun.position.copy(sun.target.position).add(SUN_OFFSET);
      const shore = Math.max(0, ...[LANDMARKS.LAKE, LANDMARKS.BEACH, LANDMARKS.RANCH].map(place => 1 - Math.hypot(position[0] - place.xy[0], position[1] - place.xy[1]) / 220));
      audio.update(engine.speed, engine.paused || streamPaused || teleporting, engine.acceleration, Number(engine.edge.surface_type ?? 6), shore);
      if (drawCount >= 3 && now - streamingAt > 300 && !teleporting) {
        world!.update(toWorld(position), toWorld(engine.pose(Math.max(100, engine.speed * 10))[0]));
        streamingAt = now;
      }
      if (now - hudAt > 120) { refreshHud(); hudAt = now; }
      if (now - savedAt > 5000) { persist(); savedAt = now; }
      if (!engine.paused && quality === 'auto' && now - startedAt > 15000 && world!.metrics.pending === 0 && now - qualityAt > 5000 && snapshots.length > 100) {
        const average = snapshots.slice(-100).reduce((a, b) => a + b, 0) / 100;
        // Automatic sessions keep the camera finish only while it holds a
        // smooth frame rate (about 48 fps): they first give up its costlier
        // options, then the finish itself, before lowering resolution.
        if (average > CINEMATIC_FRAME_MS && cinematic) {
          if (cinematicReductions < 2 && cinematic.reduce()) cinematicReductions++;
          else releaseCinematic();
          fit();
        } else if (average > 35 && pixelRatio > 0.8) {
          pixelRatio = Math.max(0.8, pixelRatio - 0.15);
          renderer!.setPixelRatio(pixelRatio);
          renderer!.shadowMap.enabled = false;
          fit();
        }
        qualityAt = now;
      }
      if (!engine.paused && !steady()) presentationTime += elapsed;
      // Keep controls, recovery and streaming responsive on the single RAF,
      // while a paused scene redraws at most ten times per second. Camera and
      // resize changes request an immediate frame; background tabs draw none.
      if (document.hidden || (engine.paused && !renderRequested && drawCount >= 3 && now - lastDraw < 100)) return;
      if (!teleporting) traffic?.update(elapsed, engine, camera, !engine.paused && !streamPaused);
      world!.updatePresentation(presentationTime, renderedPosition);
      // Optional shore reflection starts after the first playable frames. It
      // owns a bounded offscreen pass; the following main render keeps the
      // regular world draw/triangle counters and never waits for new assets.
      if (drawCount >= 3) waterReflection.update(renderer!, scene!, camera, now, { quality, mobile });
      renderer!.info.reset();
      updateDressingViewport(dressing, renderer!);
      if (cinematic) {
        cinematic.motion(car, !engine.paused && !steady() && !debugCamera && !teleporting);
        cinematic.render(elapsed);
      } else renderer!.render(scene!, camera);
      renderRequested = false; lastDraw = now;
      world!.metrics.triangles = renderer!.info.render.triangles;
      drawCount++;
      // Let the starting street draw before requesting surrounding blocks.
      if (drawCount === 3) streamingAt = performance.now();
    };
    last = performance.now();
    streamingAt = last;
    const readyAt = last;
    frame = requestAnimationFrame(tick);
    (window as unknown as { __webster: unknown }).__webster = {
      root,
      get engine() { return engine; },
      graph,
      world,
      get renderer() { return renderer; },
      get camera() { return camera; },
      get reflection() { return waterReflection; },
      reflectionResources() { return { ...waterReflection.metrics }; },
      get cinematic() { return cinematic?.metrics() ?? { enabled: false }; },
      get cameraMode() { return cameraMode; },
      get lights() { return { sun, ambient, scene }; },
      look(values: Parameters<NonNullable<typeof cinematic>['look']>[0]) { cinematic?.look(values); renderRequested = true; },
      redraw() { renderRequested = true; },
      get debugCamera() { return debugCamera; },
      set debugCamera(value: { eye: number[]; target: number[] } | null) { debugCamera = value; renderRequested = true; },
      get presentation() { return { version: 'finished-webster-v8', grass: world!.presentationResources(), vehicle: vehicle!.resources(), evidence: world!.evidenceResources(), finish: world!.finishResources(), research: world!.researchResources(), streaming: world!.streamingResources(), comfort: preferences.comfort, camera: { checks: cameraObstruction.checks, testedMeshes: cameraObstruction.testedMeshes, milliseconds: cameraObstruction.milliseconds, skippedCandidates: cameraObstruction.skippedCandidates } }; },
      get ready() { return controlsReady && !disposed; },
      get metrics() {
        const samples = [...snapshots].sort((a, b) => a - b);
        const scenery = world!.residentResources(), carResources = vehicle!.resources();
        return { frames: drawCount, timeToReadyMs: readyAt - startedAt, frameMsMedian: samples[Math.floor(samples.length / 2)] ?? 0, frameMsP95: samples[Math.floor(samples.length * 0.95)] ?? 0, ...world!.metrics, ...scenery,
          estimatedGeometryBytes: scenery.estimatedGeometryBytes + carResources.geometryBytes,
          materialCount: scenery.materialCount + carResources.materials,
          geometries: renderer!.info.memory.geometries, textures: renderer!.info.memory.textures, calls: renderer!.info.render.calls };
      },
      get traffic() { return traffic ? { ...traffic.metrics } : undefined; },
      /** QA: runs traffic for `seconds` of simulated time around the (unmoving) player. */
      advanceTraffic(seconds: number) { for (let t = 0; t < Math.min(600, seconds); t += 1 / 30) traffic?.update(1 / 30, engine, camera, true); renderRequested = true; },
      teleport,
      dispose: session.dispose,
    };
    return session;
  } catch (error) {
    session.dispose();
    play.disabled = false;
    play.textContent = 'Try again';
    if (loading) loading.hidden = true;
    intro.hidden = false;
    throw error;
  }
}
