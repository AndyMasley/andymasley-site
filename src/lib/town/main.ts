import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { advanceRealTime, DriveEngine, LANDMARKS, MPH, RoadGraph, spawnAtLandmark } from './engine';
import { validateManifest, type Quality, type V3 } from './contracts';
import { TownWorld } from './world';
import { startupPosition } from './startup';
import { createSummerSky, SUMMER_LIGHT } from './atmosphere';
import { createTouringCar, type TouringCar } from './vehicle';
import release from '../../../data/derived/town/release.json';

const ASSET_ROOT = `/town-assets/${release.directory}/`;
const WORLD_URL = `${ASSET_ROOT}manifest.json`;
const NETWORK_URL = `${ASSET_ROOT}network.json`;
const SUN_OFFSET = new THREE.Vector3(-260, 205, 180);
const toWorld = (p: readonly number[]): V3 => [p[0], p[2], -p[1]];
type LandmarkKey = keyof typeof LANDMARKS;
type CameraMode = 'hood' | 'chase' | 'wide';
type Session = { dispose(): void };

class RoadAudio {
  context?: AudioContext;
  gain?: GainNode;
  engine?: OscillatorNode;
  harmonic?: OscillatorNode;
  enabled = false;

  async toggle(): Promise<boolean> {
    if (!this.context) {
      this.context = new AudioContext();
      this.gain = this.context.createGain();
      this.gain.gain.value = 0;
      this.gain.connect(this.context.destination);
      this.engine = this.context.createOscillator();
      this.engine.type = 'sine';
      this.engine.frequency.value = 44;
      this.engine.connect(this.gain);
      this.engine.start();
      const overtone = this.context.createGain();
      overtone.gain.value = 0.16;
      overtone.connect(this.gain);
      this.harmonic = this.context.createOscillator();
      this.harmonic.type = 'triangle';
      this.harmonic.connect(overtone);
      this.harmonic.start();
    }
    await this.context.resume();
    this.enabled = !this.enabled;
    return this.enabled;
  }

  update(speed: number, paused: boolean): void {
    if (!this.context || !this.gain || !this.engine || !this.harmonic) return;
    const now = this.context.currentTime;
    this.gain.gain.setTargetAtTime(this.enabled && !paused ? 0.022 + Math.min(0.012, speed * 0.0006) : 0, now, 0.15);
    this.engine.frequency.setTargetAtTime(38 + speed * 2.7, now, 0.12);
    this.harmonic.frequency.setTargetAtTime(76 + speed * 5.4, now, 0.12);
  }

  dispose(): void { this.engine?.stop(); this.harmonic?.stop(); void this.context?.close(); }
}

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
  const cameraButton = element<HTMLButtonElement>('camera');
  const soundButton = element<HTMLButtonElement>('sound');
  const fullscreenButton = element<HTMLButtonElement>('fullscreen');
  const speedText = element('speed');
  const roadText = element('road');
  const distanceText = element('distance');
  const turnText = element('turn');
  const choicesText = element('choices');
  const minimap = element<HTMLCanvasElement>('minimap');
  const map = minimap.getContext('2d');
  const abort = new AbortController();
  const signal = abort.signal;
  let disposed = false;
  let frame = 0;
  let world: TownWorld | undefined;
  let renderer: THREE.WebGLRenderer | undefined;
  let resize: ResizeObserver | undefined;
  let environmentTarget: THREE.WebGLRenderTarget | undefined;
  let sky: Sky | undefined;
  let scene: THREE.Scene | undefined;
  let car: THREE.Group | undefined;
  let vehicle: TouringCar | undefined;
  const audio = new RoadAudio();
  const held = new Set<string>();
  const snapshots: number[] = [];
  const startedAt = performance.now();
  const mobile = matchMedia('(pointer: coarse)').matches || window.innerWidth < 720;
  let graph: RoadGraph;
  let engine: DriveEngine;
  let cameraMode: CameraMode = 'chase';
  let quality: Quality = (qualitySelect.value as Quality) || 'auto';
  let streamPaused = false;
  let teleporting = false;
  let firstFrame = true;
  let pixelRatio = Math.min(devicePixelRatio || 1, mobile ? 1.2 : 1.6);
  let last = performance.now();
  let hudAt = 0;
  let streamingAt = 0;
  let qualityAt = 0;
  let drawCount = 0;
  let controlsReady = false;
  let shownChoices = '';
  let presentationTime = 0;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const points = { car: new THREE.Vector3(), direction: new THREE.Vector3(), eye: new THREE.Vector3(), target: new THREE.Vector3(), wantedEye: new THREE.Vector3(), wantedTarget: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0), right: new THREE.Vector3() };

  const setStatus = (message: string): void => {
    status.textContent = message;
    if (loading && !loading.hidden) loading.textContent = message;
  };
  const setPaused = (paused: boolean): void => {
    if (!engine) return;
    engine.paused = paused;
    held.clear();
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
      abort.abort();
      cancelAnimationFrame(frame);
      resize?.disconnect();
      held.clear();
      audio.dispose();
      vehicle?.dispose();
      world?.dispose();
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
    const initialRequests = Promise.all([fetch(WORLD_URL, { signal }), fetch(NETWORK_URL, { signal })]);
    // A renderer failure can cancel requests before the later await attaches.
    void initialRequests.catch(() => {});
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = SUMMER_LIGHT.exposure;
    renderer.setPixelRatio(pixelRatio);
    renderer.shadowMap.enabled = !mobile && quality !== 'low';
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    scene = new THREE.Scene();
    scene.fog = new THREE.Fog(SUMMER_LIGHT.haze, 440, 1800);
    const camera = new THREE.PerspectiveCamera(57, 1, 0.08, 6500);
    const ambient = new THREE.HemisphereLight(SUMMER_LIGHT.skyFill, SUMMER_LIGHT.groundFill, SUMMER_LIGHT.fillIntensity);
    scene.add(ambient);
    const sun = new THREE.DirectionalLight(SUMMER_LIGHT.sun, SUMMER_LIGHT.sunIntensity);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -100;
    sun.shadow.camera.right = 100;
    sun.shadow.camera.top = 100;
    sun.shadow.camera.bottom = -100;
    sun.shadow.camera.near = 10;
    sun.shadow.camera.far = 900;
    sun.shadow.bias = -0.00012;
    sun.shadow.normalBias = 0.055;
    scene.add(sun, sun.target);
    const pmrem = new THREE.PMREMGenerator(renderer);
    sky = createSummerSky(SUN_OFFSET);
    scene.add(sky);
    const skyScene = new THREE.Scene();
    const environmentSky = sky.clone();
    skyScene.add(environmentSky);
    try { environmentTarget = pmrem.fromScene(skyScene, 0.04); }
    finally { pmrem.dispose(); }
    scene.environment = environmentTarget.texture;

    const [manifestResponse, networkResponse] = await initialRequests;
    if (!manifestResponse.ok || !networkResponse.ok) throw new Error('The town files could not be loaded. Please try again.');
    const manifest: unknown = await manifestResponse.json();
    validateManifest(manifest);
    if (disposed) return session;
    const startingLocation = (locationSelect.value || 'DOWNTOWN') as LandmarkKey;
    world = new TownWorld(manifest, new URL(WORLD_URL, location.href).href, () => {});
    world.setQuality(quality, mobile);
    scene.add(world.root);
    const landscapeReady = world.initialize(startupPosition(startingLocation, manifest));
    void landscapeReady.catch(() => {});
    const network = await networkResponse.json();
    await new Promise((resolve) => setTimeout(resolve, 0));
    if (disposed) return session;
    graph = new RoadGraph(network);
    engine = spawnAtLandmark(graph, startingLocation);
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
      const box = canvas.getBoundingClientRect();
      renderer!.setSize(Math.max(1, box.width), Math.max(1, box.height), false);
      camera.aspect = Math.max(1, box.width) / Math.max(1, box.height);
      camera.updateProjectionMatrix();
    };
    resize = new ResizeObserver(fit);
    resize.observe(canvas);
    intro.hidden = true;
    if (loading) loading.hidden = true;
    root.dataset.ready = 'true';
    root.removeAttribute('aria-busy');
    canvas.tabIndex = 0;
    canvas.focus({ preventScroll: true });
    fit();
    for (const button of [pauseButton, cameraButton, soundButton, fullscreenButton]) button.disabled = false;
    cameraButton.textContent = `Camera: ${cameraMode}`;
    controlsReady = true;
    setStatus('Ready on Main Street. Press Up to cruise.');

    const changeCamera = (): void => {
      cameraMode = cameraMode === 'hood' ? 'chase' : cameraMode === 'chase' ? 'wide' : 'hood';
      cameraButton.textContent = `Camera: ${cameraMode}`;
      firstFrame = true;
    };
    const requestTurn = (turn: 'LEFT' | 'RIGHT' | null): void => {
      engine.queue(turn);
      setStatus(turn ? `${turn === 'LEFT' ? 'Left' : 'Right'} turn selected for the next junction.` : 'Continuing straight where possible.');
    };
    const teleport = async (key: LandmarkKey): Promise<void> => {
      if (teleporting) return;
      teleporting = true;
      locationSelect.disabled = true;
      if (loading) loading.hidden = false;
      const previous = engine;
      previous.paused = true;
      held.clear();
      const destination = spawnAtLandmark(graph, key);
      setStatus(`Loading ${LANDMARKS[key].name}…`);
      try {
        await world!.prepareAt(toWorld(destination.pose()[0]));
        if (disposed) return;
        engine = destination;
        firstFrame = true;
        setPaused(false);
        locationSelect.value = key;
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
      if (input === 'left') requestTurn('LEFT');
      if (input === 'right') requestTurn('RIGHT');
      if (input === 'up' || input === 'down') {
        if (input === 'up' && engine.paused && !teleporting) setPaused(false);
        held.add(input);
        engine.step(1 / 60, input === 'up', input === 'down');
      }
    };
    const eventOptions = { signal };
    canvas.addEventListener('keydown', (event) => {
      if (!controlsReady || teleporting) return;
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
      } else if (key.toLowerCase() === 's') {
        event.preventDefault();
        requestTurn(null);
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
      setPaused(true);
      setStatus('Graphics were interrupted. Reload this page to restart the drive.');
    }, eventOptions);

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
    pauseButton.addEventListener('click', () => { setPaused(!engine.paused); canvas.focus({ preventScroll: true }); }, eventOptions);
    cameraButton.addEventListener('click', () => { changeCamera(); canvas.focus({ preventScroll: true }); }, eventOptions);
    soundButton.addEventListener('click', async () => {
      try {
        const enabled = await audio.toggle();
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
    qualitySelect.addEventListener('change', () => {
      quality = qualitySelect.value as Quality;
      world!.setQuality(quality, mobile);
      renderer!.shadowMap.enabled = quality !== 'low' && !mobile;
      pixelRatio = Math.min(devicePixelRatio || 1, quality === 'high' ? 1.8 : quality === 'low' ? 1 : mobile ? 1.2 : 1.6);
      renderer!.setPixelRatio(pixelRatio);
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
      const project = (p: readonly number[]): [number, number] => [size / 2 + (p[0] - position[0]) * scale, size / 2 - (p[1] - position[1]) * scale];
      const drawn = new Set<number | string>();
      map.lineCap = 'round';
      for (const id of graph.nearby(position[0], position[1], 520)) {
        const edge = graph.edges.get(id)!;
        const physical = edge.physical_id ?? edge.id;
        if (drawn.has(physical)) continue;
        drawn.add(physical);
        map.beginPath();
        edge.points.forEach((p: readonly number[], index: number) => { const q = project(p); if (!index) map.moveTo(...q); else map.lineTo(...q); });
        map.strokeStyle = '#d3d6c58c';
        map.lineWidth = 1.4;
        map.stroke();
      }
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
      map.save();
      map.translate(size / 2, size / 2);
      map.rotate(Math.atan2(direction[0], direction[1]));
      map.beginPath(); map.moveTo(0, -7); map.lineTo(5, 5); map.lineTo(0, 3); map.lineTo(-5, 5); map.closePath();
      map.fillStyle = '#fff5d3'; map.fill();
      map.restore();
    }

    function refreshHud(): void {
      speedText.textContent = String(Math.round(engine.speed / MPH)).padStart(2, '0');
      roadText.textContent = engine.edge.name || 'Local road';
      const next = engine.nextJunction();
      distanceText.textContent = `${(engine.distance / 1609.344).toFixed(1)} mi`;
      const turnDistance = next ? next.distance < 160 ? `${Math.max(10, Math.round(next.distance * 3.28084 / 10) * 10)} ft` : `${(next.distance / 1609.344).toFixed(1)} mi` : '';
      turnText.textContent = engine.paused ? 'Drive paused' : next?.obstacle ? 'Road ends ahead' : next?.selected ? `${next.selected.label} in ${turnDistance}` : 'Follow the road';
      const choices = next?.choices ?? [];
      const choiceKey = choices.map(choice => `${choice.edgeId}:${choice.label}:${next?.selected?.edgeId === choice.edgeId}`).join('|');
      if (choiceKey !== shownChoices) {
        shownChoices = choiceKey;
        choicesText.replaceChildren(...choices.map(choice => {
          const badge = document.createElement('span');
          const selected = next?.selected?.edgeId === choice.edgeId;
          badge.className = 'town-choice';
          badge.setAttribute('role', 'listitem');
          badge.dataset.selected = String(selected);
          badge.setAttribute('aria-current', String(selected));
          badge.setAttribute('aria-label', `${choice.label}${selected ? ', selected' : ''}`);
          const arrow = document.createElement('span');
          arrow.setAttribute('aria-hidden', 'true');
          arrow.className = 'town-choice__arrow';
          arrow.textContent = choice.label === 'Left' ? '↰' : choice.label === 'Right' ? '↱' : choice.label === 'U-turn' ? '↶' : '↑';
          badge.append(arrow, document.createTextNode(choice.label));
          return badge;
        }));
      }
      if (engine.endOfRoute) setStatus(engine.lastMessage);
      drawMap();
    }

    const tick = (now: number): void => {
      if (disposed) return;
      frame = requestAnimationFrame(tick);
      const elapsed = Math.min(0.5, Math.max(0, (now - last) / 1000));
      last = now;
      if (!document.hidden) {
        snapshots.push(elapsed * 1000);
        if (snapshots.length > 1800) snapshots.shift();
      }
      const forwardPoint = toWorld(engine.pose(Math.max(12, engine.speed * 2))[0]);
      if (!teleporting) {
        const ready = world!.isReadyAt(forwardPoint);
        if (!ready && engine.speed > 0.2 && !streamPaused) { streamPaused = true; setStatus('Loading the next street…'); }
        if (ready && streamPaused) { streamPaused = false; setStatus('Street ready. Continuing your drive.'); }
        if (!streamPaused) advanceRealTime(engine, elapsed, held.has('up'), held.has('down'));
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
      vehicle!.update({ distanceM: engine.distance, steeringRadians: Math.max(-0.55, Math.min(0.55, Math.atan(2.6 * headingChange / 3))), braking: held.has('down') && !engine.paused });
      if (cameraMode === 'hood') {
        points.wantedEye.copy(points.car).addScaledVector(points.direction, 0.95).addScaledVector(points.right, -0.28).addScaledVector(points.up, 1.42);
        points.wantedTarget.fromArray(toWorld(engine.pose(20)[0])).addScaledVector(points.up, 1.5);
      } else {
        const wide = cameraMode === 'wide';
        points.wantedEye.copy(points.car).addScaledVector(points.direction, wide ? -12 : -8.8).addScaledVector(points.up, wide ? 6.4 : 3.6);
        points.wantedTarget.copy(points.car).addScaledVector(points.direction, 12).addScaledVector(points.up, 1.15);
      }
      const smoothing = firstFrame ? 1 : 1 - Math.exp(-elapsed * (cameraMode === 'hood' ? 18 : 7));
      points.eye.lerp(points.wantedEye, smoothing);
      points.target.lerp(points.wantedTarget, smoothing);
      camera.position.copy(points.eye);
      camera.lookAt(points.target);
      firstFrame = false;
      sun.position.copy(points.car).add(SUN_OFFSET);
      sun.target.position.copy(points.car);
      audio.update(engine.speed, engine.paused || streamPaused || teleporting);
      if (drawCount >= 3 && now - streamingAt > 300 && !teleporting) {
        world!.update(toWorld(position), toWorld(engine.pose(Math.max(100, engine.speed * 10))[0]));
        streamingAt = now;
      }
      if (now - hudAt > 120) { refreshHud(); hudAt = now; }
      if (quality === 'auto' && now - startedAt > 15000 && world!.metrics.pending === 0 && now - qualityAt > 5000 && snapshots.length > 100) {
        const average = snapshots.slice(-100).reduce((a, b) => a + b, 0) / 100;
        if (average > 35 && pixelRatio > 0.8) {
          pixelRatio = Math.max(0.8, pixelRatio - 0.15);
          renderer!.setPixelRatio(pixelRatio);
          renderer!.shadowMap.enabled = false;
          fit();
        }
        qualityAt = now;
      }
      if (!engine.paused && !reducedMotion.matches) presentationTime += elapsed;
      world!.updatePresentation(presentationTime, renderedPosition);
      renderer!.render(scene!, camera);
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
      get cameraMode() { return cameraMode; },
      get presentation() { return { version: 'crafted-webster-v2', grass: world!.presentationResources(), vehicle: vehicle!.resources() }; },
      get ready() { return controlsReady && !disposed; },
      get metrics() {
        const samples = [...snapshots].sort((a, b) => a - b);
        const scenery = world!.residentResources(), carResources = vehicle!.resources();
        return { frames: drawCount, timeToReadyMs: readyAt - startedAt, frameMsMedian: samples[Math.floor(samples.length / 2)] ?? 0, frameMsP95: samples[Math.floor(samples.length * 0.95)] ?? 0, ...world!.metrics, ...scenery,
          estimatedGeometryBytes: scenery.estimatedGeometryBytes + carResources.geometryBytes,
          materialCount: scenery.materialCount + carResources.materials,
          geometries: renderer!.info.memory.geometries, textures: renderer!.info.memory.textures, calls: renderer!.info.render.calls };
      },
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
