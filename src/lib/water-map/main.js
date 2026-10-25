import * as THREE from 'three';
import { SUN, SLAB_ORDER, exagAt, CAT, CATS, DC, riverLabel, lakeLabel, PHONE_MQ, SLAB_MOVE } from './core/config.js';
import { loadSlabs, progress, fetchPixels, fetchBitmap, setDataBase, resetProgress } from './core/assets.js';
import { Slab } from './world/slab.js';
import { TerrainSlab } from './world/terrain.js';
import { SubsurfaceSlab } from './world/subsurface.js';
import { createOceanMesh } from './world/water.js';
import { createSlabSides } from './world/sides.js';
import { createSky, createFloor, SKY } from './world/sky.js';
import { NlcdTiles } from './world/nlcd.js';
import { Aquifers } from './world/aquifers.js';
import { MapControls } from './controls/mapcontrols.js';
import { createFinish, FINISH } from './render/finish.js';
import { RiverNet } from './net/rivers.js';
import { WaterModel, CAT_KEYS, KIND, SRC } from './flow/model.js';
import { FlowParticles } from './flow/particles.js';
import { PlantLayer, DamLayer } from './net/plants.js';
import { Aqueducts } from './net/aqueducts.js';
import { loadDams, loadOsm, plantDots, OSM_KINDS, OSM_LABEL } from './net/infra.js';
import { AQ_FLOWS, DATA_CENTERS } from './core/flows_data.js';
import { projectLower48 } from './core/proj.js';
import { Hud, SRC_DEF, srcName } from './ui/hud.js';
import { Labels } from './ui/labels.js';
import { Tour } from './ui/tour.js';
import { esc, nf, volShort } from './ui/fmt.js';

const STATES = { AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', DC: 'District of Columbia', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming', PR: 'Puerto Rico', VI: 'U.S. Virgin Islands' };
const lin = (r, g, b) => new THREE.Color().setRGB(r, g, b, THREE.LinearSRGBColorSpace);

// day and night palettes for the lights, sky and water (linear RGB)
const LOOK = {
  day: { sunI: 2.4, sunC: lin(1.0, 0.93, 0.82), hemiI: 0.9, hemiSky: lin(0.55, 0.65, 0.80), hemiGround: lin(0.25, 0.22, 0.18),
    sky: lin(0.42, 0.55, 0.70), sunCol: lin(1.0, 0.86, 0.66), deep: lin(0.010, 0.040, 0.075), shallow: lin(0.55, 0.85, 0.85),
    zenith: SKY.zenith.clone(), horizon: SKY.horizon.clone(), floor: SKY.floor.clone(), fog: SKY.horizon.clone(), bloom: FINISH.bloom.intensity, thr: FINISH.bloom.threshold },
  night: { sunI: 0.46, sunC: lin(0.62, 0.72, 1.0), hemiI: 0.26, hemiSky: lin(0.30, 0.38, 0.62), hemiGround: lin(0.05, 0.05, 0.06),
    sky: lin(0.020, 0.035, 0.070), sunCol: lin(0.22, 0.26, 0.36), deep: lin(0.002, 0.007, 0.015), shallow: lin(0.10, 0.16, 0.22),
    zenith: lin(0.002, 0.004, 0.012), horizon: lin(0.012, 0.020, 0.040), floor: lin(0.004, 0.006, 0.007), fog: lin(0.010, 0.016, 0.030), bloom: 0.95, thr: 0.7 },
};

/**
 * Start the map inside `root` (the page section holding a [data-wm-stage] element with a canvas and a labels layer).
 * Returns a handle whose dispose() stops it and frees the GPU, for the site's page transitions.
 */
export async function startWaterMap(root, { dataBase = '/water-map/data/', lite = false } = {}) {
  setDataBase(dataBase); resetProgress();
  const stage = root.querySelector('[data-wm-stage]');
  const canvas = stage.querySelector('[data-wm-canvas]');
  const labelsEl = stage.querySelector('[data-wm-labels]');
  const loadingEl = stage.querySelector('[data-wm-loading]');
  const ac = new AbortController();
  const on = (el, ev, fn, o = {}) => el && el.addEventListener(ev, fn, { ...o, signal: ac.signal });
  const timers = new Set();
  const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); if (!disposed) fn(); }, ms); timers.add(t); return t; };
  let disposed = false, raf = 0;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
  const isMobile = matchMedia('(pointer: coarse)').matches || Math.min(screen.width, screen.height) < 600;
  const quality = isMobile ? 'medium' : 'high';
  const dpr = Math.min(window.devicePixelRatio, isMobile ? 1.5 : 2);
  renderer.setPixelRatio(dpr);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const maxTex = renderer.capabilities.maxTextureSize;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(SKY.horizon.clone(), 2000, 6000);
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 5000);
  const sunDir = new THREE.Vector3();
  {
    const az = (SUN.azimuthDeg * Math.PI) / 180, el = (SUN.elevationDeg * Math.PI) / 180;
    sunDir.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).normalize();
  }
  const shared = {
    uExag: { value: 24 },
    uTerrainLitMix: { value: 0.55 }, uTerrainFlat: { value: 1.05 },
    uFocus: { value: new THREE.Vector4(0, 0, 0, 0) }, uDim: { value: 0 },
    uSunDir: { value: sunDir }, uSkyCol: { value: LOOK.day.sky.clone() }, uSunCol: { value: LOOK.day.sunCol.clone() },
    uDeep: { value: LOOK.day.deep.clone() }, uShallow: { value: LOOK.day.shallow.clone() },
    uTime: { value: 0 }, uRipple: { value: 2.0 },
    uViewport: { value: new THREE.Vector2(1, 1) }, uFocalPx: { value: 1 }, uCamDist: { value: 1000 },
    uHoverCounty: { value: -1 }, uSelCounty: { value: -1 }, uCountyData: { value: null }, uChoro: { value: 0 },
    uDetailAmt: { value: 0 },
    uChoroTex: { value: null }, uChoroMode: { value: 0 }, uSelState: { value: -1 },
    uRamp: { value: ['#173847', '#1f6e86', '#3a9e8c', '#a9cf7f', '#f3e08a'].map((h) => new THREE.Color(h)) },
    uCatCols: { value: CATS.map((c) => new THREE.Color(c.color)) },
    uNight: { value: 0 }, uAqMode: { value: 0 }, uAqPal: { value: null }, uGwTex: { value: null }, uAqHover: { value: -1 }, uAqSel: { value: -1 },
    uAqDepth: { value: 4 }, uAqThick: { value: 3 }, uAqAlpha: { value: 0.36 },
    uIsoCol: { value: new THREE.Color(1, 1, 1) }, uIsoAmt: { value: 0 }, uStateLines: { value: 1 },
  };
  const sun = new THREE.DirectionalLight(LOOK.day.sunC.clone(), LOOK.day.sunI);
  sun.position.copy(sunDir).multiplyScalar(1000);
  scene.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight(LOOK.day.hemiSky.clone(), LOOK.day.hemiGround.clone(), LOOK.day.hemiI);
  scene.add(hemi);
  const sky = createSky(shared), floor = createFloor();
  scene.add(sky, floor);

  const loadBar = stage.querySelector('[data-wm-load-bar]');
  progress.listeners.add((f) => { if (loadBar) loadBar.style.transform = `scaleX(${f.toFixed(3)})`; });
  const modelP = new WaterModel().load();
  const raw = await loadSlabs(maxTex);
  if (disposed) return null;
  const slabs = SLAB_ORDER.map((n) => new Slab(raw[n]));
  const slabByName = Object.fromEntries(slabs.map((s) => [s.name, s]));
  await Promise.all(slabs.map(async (s) => {
    const { w, h, px } = await fetchPixels(`${s.name}_county.png`);
    const ids = new Int32Array(w * h), rg = new Uint8Array(w * h * 2);
    for (let i = 0, j = 0; i < w * h; i++, j += 4) { ids[i] = ((px[j] << 8) | px[j + 1]) - 1; rg[2 * i] = px[j]; rg[2 * i + 1] = px[j + 1]; }
    s.countyIds = ids; s.countyW = w; s.countyH = h;
    const t = new THREE.DataTexture(rg, w, h, THREE.RGFormat, THREE.UnsignedByteType);
    t.minFilter = t.magFilter = THREE.NearestFilter; t.generateMipmaps = false; t.needsUpdate = true;
    s.countyTex = t;
  }));
  await Promise.all(slabs.map(async (s) => {
    const bmp = await fetchBitmap(`${s.name}_land.webp`);
    const t = new THREE.Texture(bmp);
    t.flipY = false; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.needsUpdate = true;
    s.landTex = t;
  }));
  const nlcd = await new NlcdTiles(slabs, renderer).load();
  const terrains = [];
  for (const s of slabs) {
    const t = new TerrainSlab(s, shared, nlcd);
    terrains.push(t);
    scene.add(t.group);
    scene.add(createOceanMesh(s, shared));
    scene.add(createSlabSides(s, shared));
  }
  const slabAt = (x, z) => slabs.find((s) => s.contains(x, z)) || null;
  const surfaceY = (x, z) => { const s = slabAt(x, z); return s ? s.surfaceY(x, z, shared.uExag.value) : 0; };
  const hUnits = (x, z) => { const s = slabAt(x, z); return s ? Math.max(0, s.sampleH(x, z)) / s.mpu : 0; };
  const countyAt = (x, z) => {
    const s = slabAt(x, z); if (!s || !s.countyIds) return -1;
    const i = Math.floor((x - s.x0) * s.ppu), j = Math.floor((z - s.z0) * s.ppu);
    if (i < 0 || j < 0 || i >= s.countyW || j >= s.countyH) return -1;
    return s.countyIds[j * s.countyW + i];
  };

  const [rivers, model] = await Promise.all([new RiverNet(shared).load(slabByName), modelP]);
  if (disposed) return null;
  scene.add(rivers.group);
  {
    // per-county irrigation method shares and irrigated fraction, for the ground detail shader
    const cd = new Uint8Array(64 * 64 * 4);
    model.cdata.forEach((c, i) => { if (!c || i >= 4096) return; cd.set([c.mix[0] * 255, c.mix[1] * 255, c.mix[2] * 255, Math.min(1, c.irr_km2 / Math.max(1, c.area)) * 255].map(Math.round), 4 * i); });
    const t = new THREE.DataTexture(cd, 64, 64, THREE.RGBAFormat, THREE.UnsignedByteType);
    t.minFilter = t.magFilter = THREE.NearestFilter; t.needsUpdate = true;
    shared.uCountyData.value = t;
    // choropleth values (r: sequential 0..1, g: category index, b: state index, a: has data)
    const ch = new Uint8Array(64 * 64 * 4);
    const ct = new THREE.DataTexture(ch, 64, 64, THREE.RGBAFormat, THREE.UnsignedByteType);
    ct.minFilter = ct.magFilter = THREE.NearestFilter; ct.needsUpdate = true;
    shared.uChoroTex.value = ct;
  }
  const aquifers = await new Aquifers().load(slabs, model, shared).catch((e) => { console.warn('aquifers', e); return null; });
  const subsurface = [];
  if (aquifers) for (const s of slabs) if (s.aquiferTex) { const ss = new SubsurfaceSlab(s, shared); ss.setVisible(false); subsurface.push(ss); scene.add(ss.group); }
  const stateList = [...new Set(model.wu.st)].sort();
  const stateIdx = Object.fromEntries(stateList.map((s, i) => [s, i]));
  const density = (k) => (i) => { const c = model.cdata[i]; return c && c.area > 0 ? model.byCat[CAT[k].i][i] * 1e6 / (c.area / 2.58999) : 0; };
  const CHORO = {
    none: { name: 'Land cover', note: 'National Land Cover Database: farmland, forest, grass and scrub, wetlands, and developed land in gray (city lights at night).' },
    density: { name: 'Water per square mile', unit: 'Gallons a day withdrawn per square mile', log: [2e3, 2e6],
      f: (i) => { const c = model.cdata[i]; return c && c.area > 0 ? model.total[i] * 1e6 / (c.area / 2.58999) : 0; } },
    use: { name: 'Biggest use', cat: true },
    ground: { name: 'Groundwater share', unit: 'Percent of withdrawals pumped from wells', lin: [0, 100],
      f: (i) => { const c = model.county(i); return c.total > 0 ? 100 * Object.keys(c.src).reduce((s, k) => s + (c.src[k].gf || 0) + (c.src[k].gs || 0), 0) / c.total : -1; } },
    percap: { name: 'Water per resident', unit: 'Gallons a day withdrawn per resident, all uses', log: [50, 5e4],
      f: (i) => { const c = model.county(i); return c.pop > 0 ? c.total * 1e6 / (c.pop * 1000) : -1; } },
  };
  let userChoro = 'none';
  const writeChoro = (spec, mode) => {
    const ch = shared.uChoroTex.value.image.data;
    for (let i = 0; i < model.n && i < 4096; i++) {
      let r = 0, g = 0, a = 255;
      if (spec.cat) { const c = model.county(i); const top = CAT_KEYS.slice().sort((x, y) => c.W[y] - c.W[x])[0]; g = c.total > 0 ? CAT_KEYS.indexOf(top) : 0; a = c.total > 0 ? 255 : 0; }
      else if (spec.f) {
        const v = spec.f(i);
        if (v < 0) a = 0;
        else if (spec.log) r = v > 0 ? Math.round(255 * Math.min(1, Math.max(0, Math.log(Math.max(v, 1e-9) / spec.log[0]) / Math.log(spec.log[1] / spec.log[0])))) : 0;
        else r = Math.round(255 * Math.min(1, Math.max(0, (v - spec.lin[0]) / (spec.lin[1] - spec.lin[0]))));
        if (spec.log && v > 0 && r === 0) r = 1;
      }
      ch.set([r, g, stateIdx[model.wu.st[i]] ?? 255, a], 4 * i);
    }
    shared.uChoroTex.value.needsUpdate = true;
    shared.uChoroMode.value = mode;
  };
  const setChoro = (key) => {
    userChoro = key;
    const spec = CHORO[key] || CHORO.none;
    if (!app.iso) writeChoro(spec, spec.cat ? 2 : spec.f ? 1 : 0);
    return spec;
  };
  const plants = new PlantLayer(shared, model, slabAt);
  scene.add(plants.group);
  const dams3d = new DamLayer(shared, model.features.dams, slabAt, plants.uScale);
  scene.add(dams3d.group);
  const aqueducts = new Aqueducts(shared, model.features, slabAt, projectLower48);
  scene.add(aqueducts.group);
  const flows = new FlowParticles(shared, slabs, model);
  flows.setPlants(plants);
  flows.build(isMobile ? 8 : 2.0, lite ? 40000 : isMobile ? 60000 : 240000);
  scene.add(flows.group);
  const pdots = plantDots(shared, model, slabAt, CAT.pt.color);
  scene.add(pdots.group);

  const controls = new MapControls(camera, canvas, { groundAt: surfaceY, bounds: { x0: 0, x1: 1060, z0: 0, z1: 810 }, keyTarget: canvas });
  const SCENE_BOX = { x0: 58.7, x1: 998.8, z0: 14.8, z1: 793.2 };
  const home = { x: 435, z: 330, d: 1300, az: 0, tilt: 0.42 };
  // the opening view: every slab, framed in the part of the stage the panels leave free
  const freeRegion = () => {
    const sr = stage.getBoundingClientRect(), W0 = sr.width;
    if (window.matchMedia(PHONE_MQ).matches) return [-0.98, 0.98];
    const lg = stage.querySelector('[data-uses]'), ins = stage.querySelector('[data-insp]');
    const lr = lg && lg.offsetParent ? lg.getBoundingClientRect().right - sr.left + 8 : 8;
    const ir = ins && ins.offsetParent ? ins.getBoundingClientRect().left - sr.left - 8 : W0 - 8;
    return [(lr / W0) * 2 - 1, (ir / W0) * 2 - 1];
  };
  const phoneLayout = () => window.matchMedia(PHONE_MQ).matches;
  const fitHome = () => {
    const sr = stage.getBoundingClientRect();
    const portrait = sr.width / Math.max(1, sr.height) < 0.9;
    const phone = phoneLayout();
    const box = portrait ? { x0: 58.7, x1: 998.8, z0: 14.8, z1: 625.2 } : SCENE_BOX;
    home.x = (box.x0 + box.x1) / 2; home.z = (box.z0 + box.z1) / 2 + 8;
    home.tilt = portrait ? 0.30 : 0.42; home.az = 0;
    const [xl, xr] = freeRegion();
    const corners = [];
    for (const x of [box.x0, box.x1]) for (const z of [box.z0, box.z1]) corners.push(new THREE.Vector3(x, 0, z), new THREE.Vector3(x, -16, z));
    const save = { ...controls.state };
    const measure = (d) => {
      Object.assign(controls.state, home, { d, y: 0 }); controls.apply(); camera.updateMatrixWorld();
      let mnx = Infinity, mxx = -Infinity, mny = Infinity, mxy = -Infinity;
      for (const c of corners) { const p = c.clone().project(camera); mnx = Math.min(mnx, p.x); mxx = Math.max(mxx, p.x); mny = Math.min(mny, p.y); mxy = Math.max(mxy, p.y); }
      return { mnx, mxx, mny, mxy };
    };
    // keep clear of the toolbar at the bottom; on phones, keep the map in the top part, below the row of uses and
    // above the sheets that open from the bottom
    const sh = sr.height || 800;
    const yb = phone ? 1 - 2 * 0.58 : -1 + 2 * ((portrait ? 104 : 64) / sh);
    const yt = phone ? 1 - 2 * (52 / sh) : portrait ? 0.90 : 0.92;
    for (let pass = 0; pass < 3; pass++) {
      let lo = 150, hi = 8000;
      for (let it = 0; it < 28; it++) {
        const mid = Math.sqrt(lo * hi), r = measure(mid);
        const ok = r.mxx - r.mnx < (xr - xl) * 0.97 && r.mny > yb && r.mxy < yt;
        if (ok) hi = mid; else lo = mid;
      }
      home.d = hi;
      const r = measure(home.d);
      const shiftNdc = (xl + xr) / 2 - (r.mnx + r.mxx) / 2;
      const worldPerNdc = home.d * Math.tan((camera.fov * Math.PI) / 360) * camera.aspect;
      home.x -= shiftNdc * worldPerNdc;
      // and centre it in the height left free
      const shiftY = (yb + yt) / 2 - (r.mny + r.mxy) / 2;
      home.z += shiftY * home.d * (camera.userData.tanHalf || Math.tan((camera.fov * Math.PI) / 360)) / Math.max(0.3, Math.cos(home.tilt));
    }
    Object.assign(controls.state, save);
    controls.maxDist = Math.max(1900, home.d * 1.3);
  };

  const finish = createFinish(renderer, scene, camera, { quality });
  const frustum = new THREE.Frustum(), pv = new THREE.Matrix4();
  let W = 0, H = 0, started = false, hudRef = null;
  const resize = () => {
    const r = stage.getBoundingClientRect();
    W = Math.max(1, r.width | 0); H = Math.max(1, r.height | 0);
    renderer.setSize(W, H, false);
    finish.setSize(W, H);
    // on phones and upright tablets the panels open as sheets from the bottom, so the camera's focus sits higher
    const lift = phoneLayout() ? Math.round(H * 0.16) : 0;
    camera.aspect = W / (H + 2 * lift);
    if (lift) camera.setViewOffset(W, H + 2 * lift, 0, 2 * lift, W, H); else camera.clearViewOffset();
    camera.updateProjectionMatrix();
    camera.userData.tanHalf = Math.tan((camera.fov * Math.PI) / 360) * H / (H + 2 * lift);
    shared.uViewport.value.set(W, H);
    shared.uFocalPx.value = (H / 2) / camera.userData.tanHalf;
    const wasHome = !started || Math.abs(controls.goal.d - home.d) < 1;
    if (hudRef) hudRef.fitLeft();
    fitHome();
    if (wasHome) controls.set(home, !started);
  };
  const ro = new ResizeObserver(() => resize());
  ro.observe(stage);
  resize();
  started = true;

  // ---- ground picking: march the camera ray over the height field
  const ray = new THREE.Ray();
  const pickGround = (cx, cy) => {
    ray.copy(controls.ray(cx, cy));
    const d = controls.state.d;
    let t = 0, step = Math.max(0.05, d * 0.004), prev = null;
    for (let i = 0; i < 1600; i++) {
      const p = ray.at(t, new THREE.Vector3());
      const gy = surfaceY(p.x, p.z);
      if (p.y <= gy) {
        if (!prev) return p;
        let a = t - step, b = t;
        for (let k = 0; k < 12; k++) { const m = (a + b) / 2, q = ray.at(m, new THREE.Vector3()); if (q.y <= surfaceY(q.x, q.z)) b = m; else a = m; }
        return ray.at(b, new THREE.Vector3());
      }
      prev = p; t += step; step *= 1.004;
      if (p.y < -20) break;
    }
    return null;
  };

  // ---- labels
  const labels = new Labels(labelsEl, camera);
  /** the name of the nearest river to a point, ignoring the zoom cut-off */
  const riverNameNear = (x, z, radius = 2.5) => {
    let best = null;
    for (const s of rivers.slabs) {
      if (!s.slab.contains(x, z, radius)) continue;
      const { R, grid, cell, reachOf } = s;
      const i0 = Math.floor((x - radius) / cell), i1 = Math.floor((x + radius) / cell), j0 = Math.floor((z - radius) / cell), j1 = Math.floor((z + radius) / cell);
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
        const a = grid.get(`${i},${j}`); if (!a) continue;
        for (const v of a) {
          const r = reachOf[v]; if (!R.name[r]) continue;
          const d = Math.hypot(R.x[v] - x, R.z[v] - z); if (d > radius) continue;
          const score = d / radius - 0.25 * Math.log10(1 + R.q[r]);
          if (!best || score < best.score) best = { score, name: R.names[R.name[r] - 1] };
        }
      }
    }
    return best ? riverLabel(best.name) : null;
  };
  // the named lake whose shore is nearest a point (the outlines are in baked coordinates, before the insets moved)
  const lakeNameNear = (x, z) => {
    let best = null, bd = Infinity;
    for (const l of model.features.lakes) {
      if (!l.name || !l.polys) continue;
      const mv = SLAB_MOVE[l.slab] || [0, 0], px = x - mv[0], pz = z - mv[1];
      if (!l._bb) {
        const b = [Infinity, Infinity, -Infinity, -Infinity];
        for (const poly of l.polys) { const r = poly[0]; for (let k = 0; k < r.length; k += 2) { b[0] = Math.min(b[0], r[k]); b[1] = Math.min(b[1], r[k + 1]); b[2] = Math.max(b[2], r[k]); b[3] = Math.max(b[3], r[k + 1]); } }
        l._bb = b;
      }
      if (px < l._bb[0] - 4 || px > l._bb[2] + 4 || pz < l._bb[1] - 4 || pz > l._bb[3] + 4) continue;
      let d = Infinity;
      for (const poly of l.polys) for (const r of poly) for (let k = 0; k + 3 < r.length; k += 2) {
        const ax = r[k], az = r[k + 1], ex = r[k + 2] - ax, ez = r[k + 3] - az;
        const t = Math.max(0, Math.min(1, ((px - ax) * ex + (pz - az) * ez) / (ex * ex + ez * ez || 1)));
        d = Math.min(d, Math.hypot(px - ax - t * ex, pz - az - t * ez));
      }
      if (d < bd) { bd = d; best = l; }
    }
    return best && bd < 3 ? lakeLabel(best.name) : null;
  };
  {
    const acc = new Map();
    model.cdata.forEach((c, i) => { if (!c) return; const st = model.wu.st[i]; const a = acc.get(st) || [0, 0, 0]; a[0] += c.cx * c.area; a[1] += c.cz * c.area; a[2] += c.area; acc.set(st, a); });
    for (const [st, a] of acc) if (STATES[st] && a[2] > 0) labels.add({ text: STATES[st], cls: 'state', x: a[0] / a[2], z: a[1] / a[2], pri: 50 + Math.log10(a[2]), dmin: 140, dmax: 2600 });
    for (const c of model.features.cities) {
      const big = c.pop > 1.5e6, mid = c.pop > 4e5;
      labels.add({ text: c.name, cls: `city${big ? ' big' : ''}`, x: c.x, z: c.z, h: hUnits(c.x, c.z), pri: 40 + Math.log10(c.pop + 1) * 2, dmin: 0, dmax: big ? 1500 : mid ? 520 : c.pop > 1e5 ? 240 : 110 });
    }
    for (const s of rivers.slabs) {
      const R = s.R, byName = new Map();
      for (let r = 0; r < R.n; r++) { if (!R.name[r]) continue; const a = byName.get(R.name[r]); if (!a) byName.set(R.name[r], [r]); else a.push(r); }
      for (const [ni, rs] of byName) {
        const qmax = Math.max(...rs.map((r) => R.q[r]));
        if (qmax < 40) continue;
        const label = riverLabel(R.names[ni - 1]);
        rs.sort((a, b) => R.dd[a] - R.dd[b]);
        const picks = [rs[Math.floor(rs.length * 0.15)], rs[Math.floor(rs.length * 0.55)]];
        const dmax = qmax > 3000 ? 1100 : qmax > 700 ? 600 : qmax > 200 ? 320 : 160;
        for (const r of picks) {
          if (r == null) continue;
          const v = R.start[r] + Math.floor(R.nvs[r] / 2);
          labels.add({ text: label, cls: 'river', x: R.x[v], z: R.z[v], h: hUnits(R.x[v], R.z[v]), pri: 20 + Math.log10(qmax) * 4, dmin: 0, dmax });
        }
      }
    }
    for (const l of model.features.lakes) {
      const sl = slabByName[l.slab];
      const us = sl && (sl.maskAt(l.cx, l.cz) & 4);
      if (!l.name || l.area_km2 < 250 || (!us && l.area_km2 < 5000)) continue;
      labels.add({ text: lakeLabel(l.name), cls: 'lake', x: l.cx, z: l.cz, h: Math.max(0, l.level) / (sl?.mpu || 5135), pri: 25 + Math.log10(l.area_km2) * 3, dmin: 0, dmax: l.area_km2 > 15000 ? 1700 : l.area_km2 > 1500 ? 700 : 260 });
    }
    for (const dm of model.features.dams) if (dm.named && dm.ne_dam !== undefined) labels.add({ text: dm.name, cls: 'plant', x: dm.x, z: dm.z, h: hUnits(dm.x, dm.z), pri: 28 + Math.log10(1 + dm.q), dmin: 0, dmax: dm.q > 500 ? 160 : 70 });
    // aqueducts and canals, with the water they carried where the operator reports it
    const seen = new Set();
    for (const a of model.features.aqueducts) {
      if (a.km < 60) continue;
      const f = AQ_FLOWS[a.name];
      const sg = a.segs.reduce((b, s) => (s.p.length > b.p.length ? s : b), a.segs[0]);
      const k = Math.floor(sg.p.length / 4) * 2;
      const both = f && f.share && f.share < 1;
      const html = f ? `${esc(a.name)}<small>${volShort(f.mgd)}${f.label ? ` ${esc(f.label)}` : ''}${both ? ', both barrels' : ''}${f.year !== '2015' ? ` (${esc(f.year)})` : ''}</small>` : esc(a.name);
      if (f && both && seen.has(f.url)) continue;
      if (f) seen.add(f.url);
      labels.add({ html, cls: 'canal', x: sg.p[k], z: sg.p[k + 1], h: hUnits(sg.p[k], sg.p[k + 1]), pri: 26 + Math.log10(a.km) * 2 + (f ? 6 : 0), dmin: 0, dmax: f ? (f.mgd > 500 ? 1300 : 700) : a.km > 300 ? 650 : 260 });
    }
    const topPlants = model.plants.map((p, i) => [p, i]).filter(([p]) => (p.w_env || 0) > 20).sort((a, b) => b[0].w_env - a[0].w_env);
    for (const [p] of topPlants) labels.add({ text: p.name, cls: 'plant', x: p.x, z: p.z, h: hUnits(p.x, p.z), pri: 30 + Math.log10(p.w_env), dmin: 0, dmax: p.w_env > 800 ? 170 : 90 });
    // the counties that withdrew the most, with a dot in the colour of their biggest use (hidden while a use is isolated)
    {
      const ids = Array.from({ length: model.n }, (_, i) => i).sort((a, b) => model.total[b] - model.total[a]).slice(0, 36);
      ids.forEach((i, r) => {
        const c = model.cdata[i]; if (!c) return;
        const cc = model.county(i), top = CAT_KEYS.slice().sort((a, b) => cc.W[b] - cc.W[a])[0];
        labels.add({ html: `${esc(model.wu.name[i])}<small>${volShort(model.total[i])}, ${Math.round(100 * cc.W[top] / cc.total)}% ${esc(CAT[top].short.toLowerCase())}</small>`, cls: 'callout top', anchor: 'dot', color: CAT[top].color,
          x: c.cx, z: c.cz, h: hUnits(c.cx, c.cz), group: 'top', pri: 200 - r, dmin: 0, dmax: r < 6 ? 2600 : r < 16 ? 800 : 320 });
      });
    }
    // aquifer names, shown in the underground view
    if (aquifers) {
      for (const a of aquifers.list) {
        const an = aquifers.anchor.get(a.i), area = aquifers.area.get(a.i) || 0;
        if (!an || (a.total < 40 && area < 8000)) continue;
        labels.add({ html: `${esc(a.name)}<small>${volShort(a.total)} pumped</small>`, cls: 'aquifer', x: an.x, z: an.z, group: 'aquifers',
          y: (ex) => Math.max(0, an.slab.sampleH(an.x, an.z)) / an.slab.mpu * ex - shared.uAqDepth.value,
          pri: 70 + Math.log10(1 + a.total) * 3 + Math.log10(1 + area) * 0.5, dmin: 0, dmax: area > 60000 || a.total > 2000 ? 2600 : area > 15000 || a.total > 400 ? 900 : 320 });
      }
      labels.setGroup('aquifers', false);
    }
  }

  // ---- the app: selection, isolation, camera moves
  let selCounty = -1, selPlant = -1, hovered = null;
  const wTarget = new Float32Array(CAT_KEYS.length).fill(1);   // flows ease toward these emphasis weights
  const iso = { target: 0, pending: false };                     // the isolated use's tint fades in and out
  const looks = { night: 0, aq: 0 };
  const layerOn = { nid: true, infra: true, golf: true, dc: false, flows: true, plants: true, rivers: true, labels: true };
  const app = {
    model, flows, rivers, plants, controls, shared, CHORO, setChoro, stateList, aquifers, nlcd, canvas, stage,
    dams: null, osm: null, damCounty: null, damsByCounty: null,
    night: false, underground: false, iso: null, expanded: false, _home: () => home,
    setNight(on) { app.night = on; looks.night = on ? 1 : 0; hud.syncButtons(); writeHash(); },
    setUnderground(on) {
      app.underground = on; looks.aq = on ? 1 : 0;
      labels.setGroup('aquifers', on);
      syncTop();
      if (app.dams) app.dams.group.visible = layerOn.nid && !app.iso && !on;
      if (on) { terrains.forEach((t) => t.setGlass(true)); subsurface.forEach((s) => s.setVisible(true)); }
      hud.syncButtons();
      if (on && !tour.busy) {
        if (controls.state.tilt < 0.75) controls.flyTo({ tilt: 0.95 }, 900);
        if (selCounty < 0 && selPlant < 0) { app.isolate(null, true); hud.showGroundwater(); }
      }
      if (!on && hud.$('[data-insp]').dataset.kind === 'ground') hud.showNational();
      writeHash();
    },
    stateName: (st) => STATES[st] || st,
    psHub(ci) { const st = (flows.byCounty.get(ci) || []).find((s) => s.cat === 'ps' && s.kind === KIND.intake); return st ? st.to[0] : null; },
    /** emphasis on the flows: an isolated use, a use hovered in the picker, or a band hovered in a Sankey */
    _hoverCat: null, _flowFocus: null,
    applyEmphasis() {
      const w = wTarget;
      const ff = app._flowFocus, hc = app._hoverCat;
      for (let j = 0; j < CAT_KEYS.length; j++) {
        const k = CAT_KEYS[j];
        let v = 1;
        if (app.iso) v = app.iso === k ? 1.9 : 0;
        else if (hc) v = hc === k ? 1.6 : 0.12;
        if (ff && ff.use && ff.use !== '*') v *= ff.use === k ? 1.5 : 0.08;
        w[j] = v;
      }
      flows.common.uFocusSrc.value = ff && ff.src ? ({ sf: 0, gf: 1, gs: 1, ss: 2 }[ff.src] ?? -1) : -1;
    },
    focusCat(k) { app._hoverCat = k; app.applyEmphasis(); },
    focusFlow(use, src) { app._flowFocus = use ? { use, src } : null; app.applyEmphasis(); },
    /** show only one use's water (k: a USGS category or 'dc'), or every use (null) */
    isolate(k, quiet = false) {
      if (k && selCounty >= 0) app.clearSelection(true);
      app.iso = k || null;
      app._hoverCat = null;
      labels.removeGroup('iso');
      const cat = k && CAT[k];
      if (cat || k === 'dc') { shared.uIsoAmt.value = 0; iso.target = 1; iso.pending = false; }
      if (cat) {
        shared.uIsoCol.value.set(cat.color);
        // the ramp runs from 1/300th of the heaviest counties' density up to them (their 98th percentile)
        const f = density(k), vals = [];
        for (let i = 0; i < model.n; i++) { const v = f(i); if (v > 0) vals.push(v); }
        vals.sort((a, b) => a - b);
        const hi = vals.length ? vals[Math.floor(vals.length * 0.98)] : 1;
        writeChoro({ log: [hi / 300, hi], f }, 3);
      } else if (k === 'dc') {
        shared.uIsoCol.value.set(DC.color);
        writeChoro({ f: () => 0, lin: [0, 1] }, 3);
      } else if (shared.uChoroMode.value > 2.5) {
        // fade the tint out, then put back the reader's own land colouring
        iso.target = 0; iso.pending = true;
      } else {
        const spec = CHORO[userChoro] || CHORO.none;
        writeChoro(spec, spec.cat ? 2 : spec.f ? 1 : 0);
      }
      app.applyEmphasis();
      // facilities that belong to the use
      if (app.osm) {
        const v = app.osm.kindVis, b = app.osm.kindBoost;
        v[0] = v[1] = v[2] = !k && layerOn.infra ? 1 : 0; v[3] = (!k && layerOn.golf) || k === 'go' ? 1 : 0; v[4] = (!k && layerOn.dc) || k === 'dc' ? 1 : 0;
        if (k === 'ps') { v[1] = 1; v[0] = 0; }
        b.fill(1); b[4] = k === 'dc' ? 20 : layerOn.dc ? 14 : 1; b[3] = k === 'go' ? 4 : 1; b[1] = k === 'ps' ? 5 : 1;
        app.osm.uniforms.uPx.value = 1;
      }
      if (app.dams) app.dams.group.visible = !k && layerOn.nid && !app.underground;
      pdots.kindBoost[0] = k === 'pt' ? 120 : 1;
      pdots.group.visible = k === 'pt';
      // callouts at the places that use the most
      if (cat) {
        if (k === 'pt') {
          const top = model.plants.map((p, i) => [p, i]).filter(([p]) => p.w_env > 0).sort((a, b) => b[0].w_env - a[0].w_env).slice(0, 40);
          top.forEach(([p], r) => labels.add({ html: `${esc(p.name)}<small>${volShort(p.w_env)}</small>`, cls: 'callout', anchor: 'dot', color: cat.color, x: p.x, z: p.z, h: hUnits(p.x, p.z), group: 'iso', pri: 400 - r, dmin: 0, dmax: r < 8 ? 3000 : r < 20 ? 700 : 300 }));
        } else {
          const ids = Array.from({ length: model.n }, (_, i) => i).filter((i) => model.byCat[cat.i][i] > 0).sort((a, b) => model.byCat[cat.i][b] - model.byCat[cat.i][a]).slice(0, 48);
          ids.forEach((i, r) => {
            const c = model.cdata[i]; if (!c) return;
            labels.add({ html: `${esc(model.wu.name[i])}<small>${volShort(model.byCat[cat.i][i])}</small>`, cls: 'callout', anchor: 'dot', color: cat.color, x: c.cx, z: c.cz, h: hUnits(c.cx, c.cz), group: 'iso', pri: 400 - r, dmin: 0, dmax: r < 8 ? 3000 : r < 24 ? 700 : 300 });
          });
        }
      } else if (k === 'dc') {
        for (const r of DATA_CENTERS.reported || []) labels.add({ html: `${esc(r.name)}<small>${nf(r.gal / 365 / 1e6, 1)} Mgal/d (${esc(r.year)})</small>`, cls: 'callout dc', anchor: 'dot', color: DC.color, x: r.x, z: r.z, h: hUnits(r.x, r.z), group: 'iso', pri: 500 + Math.log10(r.gal), dmin: 0, dmax: 3000 });
        if (app.osm) {
          const byC = []; for (const [ci, a] of app.osm.byCounty) if (a[4] > 0) byC.push([ci, a[4]]);
          byC.sort((a, b) => b[1] - a[1]).slice(0, 14).forEach(([ci, cnt], r) => {
            const c = model.cdata[ci]; if (!c) return;
            labels.add({ html: `${esc(model.wu.name[ci])}<small>${nf(cnt)} mapped</small>`, cls: 'callout dc', anchor: 'dot', color: DC.color, x: c.cx, z: c.cz, h: hUnits(c.cx, c.cz), group: 'iso', pri: 300 - r, dmin: 0, dmax: r < 6 ? 3000 : 600 });
          });
        }
      }
      hud.syncUses();
      syncTop();
      if (!quiet) { if (k) hud.showCategory(k); else if (app.underground) hud.showGroundwater(); else hud.showNational(); }
      writeHash();
    },
    selectState(st, fly = true) {
      const ids = model.states.get(st); if (!ids) return;
      app.clearMarks(); clearTrace(); flows.clearFocus();
      selCounty = -1; selPlant = -1; shared.uSelCounty.value = -1; plants.uSelPlant.value = -1;
      shared.uSelState.value = stateIdx[st];
      hud.showState(st);
      if (fly) {
        let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
        for (const i of ids) { const c = model.cdata[i]; if (!c) continue; const r = Math.sqrt(c.area) / 5.135 / 2; x0 = Math.min(x0, c.cx - r); x1 = Math.max(x1, c.cx + r); z0 = Math.min(z0, c.cz - r); z1 = Math.max(z1, c.cz + r); }
        const span = Math.max(x1 - x0, (z1 - z0) * 1.4);
        controls.flyTo({ x: (x0 + x1) / 2, z: (z0 + z1) / 2 + span * 0.05, d: Math.min(1100, Math.max(40, span * 1.9)), tilt: 0.75, az: 0 }, 2000);
      }
    },
    setLayer(name, onv) {
      layerOn[name] = onv;
      if (name === 'rivers') { rivers.group.visible = onv; aqueducts.enabled = onv; }
      if (name === 'flows') flows.group.visible = onv;
      if (name === 'plants') { plants.enabled = onv; dams3d.enabled = onv; }
      if (name === 'labels') labels.enabled = onv;
      if (name === 'nid' && app.dams) app.dams.group.visible = onv && !app.iso && !app.underground;
      if (app.osm && ['infra', 'golf', 'dc'].includes(name) && !app.iso) {
        const v = app.osm.kindVis, b = app.osm.kindBoost;
        if (name === 'infra') { v[0] = v[1] = v[2] = onv ? 1 : 0; }
        if (name === 'golf') v[3] = onv ? 1 : 0;
        if (name === 'dc') { v[4] = onv ? 1 : 0; b[4] = onv ? 14 : 1; }
      }
    },
    flyTo(view, ms = 1800) { controls.flyTo(view, ms); },
    goHome() { app.clearSelection(true); if (app.iso) app.isolate(null); controls.flyTo({ ...home }, 2000); },
    clearMarks() { if (app.dams) app.dams.uniforms.uSel.value = -1; if (app.osm) app.osm.uniforms.uSel.value = -1; shared.uAqSel.value = -1; },
    selectCounty(i, fly = true) {
      if (i < 0) return app.clearSelection();
      if (app.iso) app.isolate(null, true);
      app.clearMarks();
      selCounty = i; selPlant = -1; shared.uSelState.value = -1;
      shared.uSelCounty.value = i; plants.uSelPlant.value = -1;
      flows.setFocus(flows.byCounty.get(i) || [], { county: i });
      const notes = traceCounty(i);
      syncTop();
      hud.showCounty(i, notes);
      writeHash();
      const c = model.cdata[i];
      if (fly && c) {
        const span = Math.sqrt(c.area) / 5.135;
        const upright = phoneLayout();
        controls.flyTo({ x: c.cx, z: c.cz + span * 0.08, d: Math.min(upright ? 700 : 420, Math.max(22, span * (upright ? 5.6 : 3.4))), tilt: Math.max(controls.state.tilt, 0.8) }, 1800);
      }
    },
    selectPlant(pi, fly = true) {
      const p = model.plants[pi]; if (!p) return;
      if (app.iso) app.isolate(null, true);
      app.clearMarks();
      selPlant = pi; selCounty = p.county; shared.uSelState.value = -1;
      plants.uSelPlant.value = pi; shared.uSelCounty.value = p.county;
      flows.setFocus(flows.streams.filter((s) => s.plant === p), { plant: pi });
      tracePlant(p);
      syncTop();
      hud.showPlant(pi);
      writeHash();
      if (fly) {
        // close enough that the plant and its channels fill the view: intake, plant and outfall
        let x0 = p.x, x1 = p.x, z0 = p.z, z1 = p.z;
        for (const q of [p.intake, p.outfall]) if (q) { x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); z0 = Math.min(z0, q.z); z1 = Math.max(z1, q.z); }
        app.fitBox(x0 - 0.9, x1 + 0.9, z0 - 0.7, z1 + 0.7, { minD: 8, maxD: 40, tilt: 1.05 });
      }
    },
    selectAquifer(ai, fly = true) {
      if (!aquifers) return;
      if (!app.underground) app.setUnderground(true);
      app.clearMarks(); clearTrace(); flows.clearFocus();
      shared.uAqSel.value = ai;
      hud.showAquifer(ai);
      writeHash();
      const e = aquifers.extent && aquifers.extent.get(ai);
      if (fly && e) { const span = Math.max(e.x1 - e.x0, (e.z1 - e.z0) * 1.3); controls.flyTo({ x: (e.x0 + e.x1) / 2, z: (e.z0 + e.z1) / 2 + span * 0.12, d: Math.min(1300, Math.max(60, span * 1.75)), tilt: 1.0, az: 0 }, 2000); }
    },
    async selectDam(i, fly = false) {
      if (!app.dams) return;
      await app.dams.loadNames();
      app.clearMarks(); clearTrace(); flows.clearFocus(); app.dams.uniforms.uSel.value = i;
      selCounty = -1; selPlant = -1; shared.uSelCounty.value = -1; plants.uSelPlant.value = -1; shared.uSelState.value = -1;
      hud.showDam(i);
      if (fly) controls.flyTo({ x: app.dams.data.x[i], z: app.dams.data.z[i] + 0.3, d: app.dams.data.stor[i] > 1e5 ? 30 : 14, tilt: Math.max(1.0, controls.state.tilt) }, 1800);
    },
    async selectOsm(i, fly = false) {
      if (!app.osm) return;
      await app.osm.loadNames();
      app.clearMarks(); clearTrace(); app.osm.uniforms.uSel.value = i;
      selCounty = -1; selPlant = -1; shared.uSelCounty.value = -1; plants.uSelPlant.value = -1; shared.uSelState.value = -1;
      const kind = OSM_KINDS[app.osm.data.kind[i]], ci = app.osm.data.county[i];
      const cat = kind === 'water_works' || kind === 'water_tower' ? 'ps' : kind === 'golf_course' ? 'go' : null;
      const ss = cat && ci >= 0 ? (flows.byCounty.get(ci) || []).filter((s) => s.cat === cat && s.kind !== KIND.vapor && s.kind !== KIND.ret) : [];
      if (ss.length) { flows.setFocus(ss, { county: ci, cat: CAT_KEYS.indexOf(cat) }); traceFacility(ci, cat, ss); } else flows.clearFocus();
      hud.showOsm(i);
      if (ss.length) {
        let x0 = app.osm.data.x[i], x1 = x0, z0 = app.osm.data.z[i], z1 = z0;
        for (const s of ss) for (const q of [...s.from, ...s.to]) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); z0 = Math.min(z0, q[1]); z1 = Math.max(z1, q[1]); }
        app.fitBox(x0 - 0.5, x1 + 0.5, z0 - 0.5, z1 + 0.5, { minD: 14, maxD: 420, tilt: Math.max(0.9, controls.state.tilt) });
      } else if (fly) controls.flyTo({ x: app.osm.data.x[i], z: app.osm.data.z[i] + 0.2, d: 9, tilt: Math.max(1.0, controls.state.tilt) }, 1800);
    },
    /** fly so a box of the map fills the part of the frame the panels leave open */
    fitBox(x0, x1, z0, z1, { tilt = Math.max(0.9, controls.state.tilt), minD = 10, maxD = 900, pad = 1.15 } = {}) {
      const [xl, xr] = freeRegion();
      const upright = phoneLayout();
      const th = camera.userData.tanHalf || Math.tan((camera.fov * Math.PI) / 360);
      const wFrac = (xr - xl) / 2, hFrac = upright ? 0.48 : 0.8;
      const d = pad * Math.max((x1 - x0) / (2 * th * (W / H) * wFrac), (z1 - z0) / (2 * th * hFrac));
      const dd = Math.min(maxD, Math.max(minD, d)), az = controls.state.az;
      const sx = -((xl + xr) / 2) * dd * th * (W / H);
      controls.flyTo({ x: (x0 + x1) / 2 + sx * Math.cos(az), z: (z0 + z1) / 2 - sx * Math.sin(az), d: dd, tilt }, 1800);
    },
    selectAqueduct(ai, fly = false) {
      const it = aqueducts.items[ai]; if (!it) return;
      app.clearMarks(); clearTrace(); flows.clearFocus();
      selCounty = -1; selPlant = -1; shared.uSelCounty.value = -1; plants.uSelPlant.value = -1; shared.uSelState.value = -1;
      hud.showAqueduct(it);
      if (fly) {
        const a = model.features.aqueducts[ai];
        let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
        for (const sg of a.segs) for (let k = 0; k < sg.p.length; k += 2) { x0 = Math.min(x0, sg.p[k]); x1 = Math.max(x1, sg.p[k]); z0 = Math.min(z0, sg.p[k + 1]); z1 = Math.max(z1, sg.p[k + 1]); }
        if (x0 < x1) app.fitBox(x0, x1, z0, z1);
      }
    },
    clearSelection(silent) {
      app.clearMarks(); clearTrace(); flows.clearFocus();
      selCounty = -1; selPlant = -1; shared.uSelCounty.value = -1; plants.uSelPlant.value = -1; shared.uSelState.value = -1;
      syncTop();
      if (silent && app.iso) return;
      if (app.iso) hud.showCategory(app.iso); else if (app.underground) hud.showGroundwater(); else hud.showNational();
      writeHash();
    },
    loadNames() { if (app.dams) app.dams.loadNames().then(() => { app._index = null; }); if (app.osm) app.osm.loadNames().then(() => { app._index = null; }); },
    _index: null,
    searchIndex() {
      if (app._index) return app._index;
      const idx = [];
      for (const st of stateList) { const nm = STATES[st]; if (nm) idx.push({ key: nm.toLowerCase(), label: nm, kind: 'State', weight: 9, st }); }
      model.wu.id.forEach((fid, i) => { const nm = model.wu.name[i], st = model.wu.st[i]; idx.push({ key: `${nm}, ${st}`.toLowerCase(), label: `${nm}, ${st}`, kind: 'County', weight: Math.log10(1 + model.total[i]), county: i }); });
      for (const c of model.features.cities) idx.push({ key: `${c.name}, ${c.st}`.toLowerCase(), label: `${c.name}, ${c.st}`, kind: 'City', weight: Math.log10(c.pop + 1) + 1, x: c.x, z: c.z, d: 60, county: c.county });
      model.plants.forEach((p, i) => idx.push({ key: `${p.name} ${p.st}`.toLowerCase(), label: `${p.name} (${p.st})`, kind: 'Power plant', weight: Math.log10(1 + (p.w_env || 0)), plant: i }));
      for (const s of rivers.slabs) {
        const R = s.R, best = new Map();
        for (let r = 0; r < R.n; r++) if (R.name[r] && (!best.has(R.name[r]) || R.q[r] > R.q[best.get(R.name[r])])) best.set(R.name[r], r);
        for (const [ni, r] of best) {
          const v = R.start[r] + Math.floor(R.nvs[r] / 2);
          const label = riverLabel(R.names[ni - 1]);
          idx.push({ key: label.toLowerCase(), label, kind: 'River', weight: Math.log10(1 + R.q[r]), x: R.x[v], z: R.z[v], d: 90 });
        }
      }
      for (const l of model.features.lakes) if (l.name) idx.push({ key: lakeLabel(l.name).toLowerCase(), label: lakeLabel(l.name), kind: l.kind === 'Reservoir' ? 'Reservoir' : 'Lake', weight: Math.log10(1 + l.area_km2), x: l.cx, z: l.cz, d: Math.min(700, Math.max(40, Math.sqrt(l.area_km2) / 5.135 * 4)) });
      model.features.aqueducts.forEach((a, ai) => { if (a.segs[0]) idx.push({ key: a.name.toLowerCase(), label: a.name, kind: a.kind === 'aqueduct' ? 'Aqueduct' : 'Canal', weight: Math.log10(1 + a.km), aqi: ai }); });
      if (aquifers) for (const a of aquifers.list) idx.push({ key: a.name.toLowerCase(), label: a.name, kind: 'Aquifer', weight: Math.log10(1 + a.total), aquifer: a.i });
      for (const c of [...CATS, DC]) idx.push({ key: c.name.toLowerCase(), label: c.name, kind: 'Use of water', weight: 12, iso: c.k });
      if (app.dams && app.dams.names) {
        const d = app.dams.data, N = app.dams.names;
        for (let i = 0; i < d.n; i++) { if (d.stor[i] < 2000 || d.fl[i]) continue; const nm = N[i][0]; if (!nm) continue; idx.push({ key: nm.toLowerCase(), label: `${nm}${N[i][1] ? ` (${N[i][1]})` : ''}`, kind: 'Dam', weight: Math.log10(1 + d.stor[i]) - 2, dam: i }); }
      } else for (const dm of model.features.dams) if (dm.named) idx.push({ key: dm.name.toLowerCase(), label: dm.name, kind: 'Dam', weight: 1, x: dm.x, z: dm.z, d: 25 });
      if (app.osm && app.osm.names) {
        const o = app.osm.data, N = app.osm.names;
        for (let i = 0; i < o.n; i++) { const k = o.kind[i]; if (!N[i] || k === 0) continue; idx.push({ key: N[i].toLowerCase(), label: N[i], kind: OSM_LABEL[OSM_KINDS[k]], weight: k === 4 ? 0.5 : 0, osm: i }); }
      }
      app._index = idx;
      return idx;
    },
    goSearch(it) {
      tour.stop();
      if (it.iso) return app.isolate(it.iso);
      if (it.plant != null) return app.selectPlant(it.plant, true);
      if (it.dam != null) return app.selectDam(it.dam, true);
      if (it.osm != null) return app.selectOsm(it.osm, true);
      if (it.aquifer != null) return app.selectAquifer(it.aquifer, true);
      if (it.aqi != null) return app.selectAqueduct(it.aqi, true);
      if (it.kind === 'County') return app.selectCounty(it.county, true);
      if (it.kind === 'State') return app.selectState(it.st, true);
      app.clearSelection(true);
      controls.flyTo({ x: it.x, z: it.z, d: it.d || 60, tilt: Math.max(0.85, controls.state.tilt) }, 1800);
      if (it.kind === 'City' && it.county >= 0) later(() => app.selectCounty(it.county, false), 900);
    },
    toggleExpanded() {
      if (document.fullscreenElement === root) { document.exitFullscreen?.(); return; }
      if (app.expanded) { root.classList.remove('wm-expanded'); document.documentElement.classList.remove('wm-lock'); app.expanded = false; hud.syncButtons(); return; }
      if (root.requestFullscreen && !isMobile) root.requestFullscreen().catch(() => { root.classList.add('wm-expanded'); app.expanded = true; hud.syncButtons(); });
      else { root.classList.add('wm-expanded'); document.documentElement.classList.add('wm-lock'); app.expanded = true; hud.syncButtons(); }
    },
  };
  on(document, 'fullscreenchange', () => { app.expanded = document.fullscreenElement === root || root.classList.contains('wm-expanded'); hud.syncButtons(); });

  // ---- links: the view's state rides in the address, so any view can be shared
  let hashTimer = 0, hashReady = false;
  function writeHash() {
    if (!hashReady || tour.i >= 0) return;
    clearTimeout(hashTimer);
    hashTimer = setTimeout(() => {
      if (disposed) return;
      const p = [];
      if (app.iso) p.push(`use=${app.iso}`);
      if (selPlant >= 0 && model.plants[selPlant]) p.push(`plant=${model.plants[selPlant].eia}`);
      else if (selCounty >= 0) p.push(`county=${model.wu.id[selCounty]}`);
      if (aquifers && shared.uAqSel.value > 0) { const a = aquifers.byIndex.get(shared.uAqSel.value); if (a) p.push(`aquifer=${a.code}`); }
      if (app.underground) p.push('under');
      if (!app.night) p.push('day');
      const h = p.length ? `#${p.join('&')}` : '';
      if (h === location.hash || (!h && !location.hash)) return;
      try { history.replaceState(history.state, '', `${location.pathname}${location.search}${h}`); } catch { /* not allowed here */ }
    }, 250);
  }
  function readHash() {
    const out = {};
    for (const kv of location.hash.replace(/^#/, '').split('&')) { if (!kv) continue; const [k, v = ''] = kv.split('='); out[decodeURIComponent(k)] = decodeURIComponent(v); }
    return out;
  }
  function syncTop() { labels.setGroup('top', !app.iso && !app.underground && selCounty < 0 && selPlant < 0); }
  // ---- tracing: name where a selected place's water comes from and where it goes, on the map
  function clearTrace() { labels.removeGroup('trace'); if (typeof syncTop === 'function') syncTop(); }
  function traceLabel(html, x, z, pri, cls = '') { labels.add({ html, cls: `trace ${cls}`, anchor: 'dot', x, z, h: hUnits(x, z), group: 'trace', pri: 900 + pri, dmin: 0, dmax: 4000 }); }
  const shareTxt = (f) => (f >= 0.9995 ? '100%' : f >= 0.99 ? `${nf(100 * f, 1)}%` : f >= 0.005 ? `${Math.round(100 * f)}%` : '<1%');
  const SRC_KEY = { [SRC.river]: 'sf', [SRC.lake]: 'sf', [SRC.sea]: 'ss', [SRC.ground]: 'gf', [SRC.reclaimed]: 'rec', [SRC.delivered]: 'ps' };
  /** where on the map to pin a source's label: its biggest intake, a well away from the hub, the sea, the sewage works */
  function sourceSpots(ss) {
    const spot = {};
    for (const s of ss) {
      if (s.kind !== KIND.intake) continue;
      const k = SRC_KEY[s.src]; if (!k) continue;
      const e = spot[k] || (spot[k] = { v: 0, p: null, w: -1 });
      e.v += s.vol;
      if (s.well) {
        if (s.vol > e.w) { const hub = flows.hubOf(s), far = s.to.slice().sort((p1, p2) => Math.hypot(p1[0] - hub[0], p1[1] - hub[1]) - Math.hypot(p2[0] - hub[0], p2[1] - hub[1])); e.p = far[Math.floor(far.length * 0.7)] || s.to[0]; e.w = s.vol; }
      } else {
        const top = s.from.reduce((bst, q) => (!bst || (q[2] || 0) > (bst[2] || 0) ? q : bst), null);
        if (s.vol > e.w && top) { e.p = top; e.w = s.vol; }
      }
    }
    return spot;
  }
  /** label each source of a set of streams with its share of their water */
  function traceSources(ss, total, names = {}) {
    const spot = sourceSpots(ss);
    Object.entries(spot).filter(([, e]) => e.p && e.v / total >= 0.02).sort((x, y) => y[1].v - x[1].v).slice(0, 4).forEach(([k, e]) => {
      const d = SRC_DEF[k], nm = names[k] || d.name, sub = names[`${k}_sub`] || '';
      // keep map labels short; the panel names the aquifers
      const short = sub && (nm.length + sub.length) < 34 ? sub : '';
      traceLabel(`<i class="wm-sw wm-sw-src" style="background:${d.color}"></i>${esc(nm)}<b>${shareTxt(e.v / total)}</b><small>${volShort(e.v)}${short ? ` · ${esc(short)}` : ''}</small>`, e.p[0], e.p[1], 30 + e.v / total * 40, 'src');
    });
  }
  function traceCounty(i) {
    clearTrace();
    const c = model.county(i), ss = flows.byCounty.get(i) || [];
    if (!(c.total > 0)) return '';
    const min = Math.max(0.05, c.total * 0.03);
    // uses, at the hub where each use's water gathers
    const uses = CAT_KEYS.filter((k) => c.W[k] >= min).sort((a, b) => c.W[b] - c.W[a]).slice(0, 5);
    for (const k of uses) {
      const st = ss.filter((q) => q.cat === k && (q.kind === KIND.intake || q.kind === KIND.deliver)).sort((x, y) => y.vol - x.vol)[0];
      if (!st) continue;
      const hub = k === 'ps' && st.kind === KIND.intake ? st.to[0] : flows.hubOf(st);
      traceLabel(`<i class="wm-sw" style="background:${CAT[k].color}"></i>${esc(CAT[k].name)}<b>${shareTxt(c.W[k] / c.total)}</b><small>${volShort(c.W[k])}</small>`, hub[0], hub[1], c.W[k] / c.total * 50, 'use');
    }
    // sources, by kind, with their share of the county's withdrawals (reclaimed water is extra, so it is not in the total)
    const aq = aquifers && aquifers.county ? aquifers.county[c.id] : null;
    const names = {};
    if (aq && aq[0] && aq[0][0] > 0) { const tot = aq.reduce((x, r) => x + r[2], 0); if (aq[0][2] / tot >= 0.5) names.gf_sub = aq[0][1]; }
    // (water bought from utilities or reclaimed is not a withdrawal of its own, so it is left out of the shares)
    traceSources(ss.filter((q) => q.src !== SRC.delivered && q.src !== SRC.reclaimed), c.total, names);
    // fates: consumed and returned (USGS estimated these for irrigation and power)
    const cu = Math.min(c.cu.ir, c.W.ir + c.other.ir_rec) + Math.min(c.cu.go, c.W.go + c.other.go_rec) + Math.min(c.cu.pt, c.W.pt + 1e9);
    const vap = ss.filter((q) => q.kind === KIND.vapor).sort((x, y) => y.vol - x.vol)[0];
    if (cu >= min && vap) traceLabel(`<i class="wm-sw wm-sw-vap"></i>Consumed<small>${volShort(cu)} evaporated or used up</small>`, vap.to[0][0] + 0.15, vap.to[0][1] - 0.15, 10, 'fate');
    const ret = ss.filter((q) => q.kind === KIND.ret).sort((x, y) => y.vol - x.vol)[0];
    const retV = ss.filter((q) => q.kind === KIND.ret).reduce((x, q) => x + q.vol, 0);
    if (ret && retV >= min) { const p = ret.plant ? ret.to[0] : ret.to[Math.floor(ret.to.length / 2)]; traceLabel(`<i class="wm-sw wm-sw-ret"></i>Returned<small>${volShort(retV)} to rivers</small>`, p[0], p[1], 8, 'fate'); }
    return '';
  }
  function tracePlant(p) {
    clearTrace();
    const ss = flows.streams.filter((q) => q.plant === p);
    const W = Object.values(p.src || {}).reduce((x, v) => x + v, 0);
    if (!(W > 0)) return;
    const own = p.wsrc && p.wsrc.startsWith('SW') ? (/SA|BE|BR/.test(p.wtype || '') ? 'ss' : 'sf') : null;
    const named = srcName(p.src_name);
    const names = {};
    if (own && named) names[own] = named;
    traceSources(ss, W, names);
    const cu = Math.min(p.c || 0, W), ret = Math.max(0, W - cu);
    if (cu > 0) traceLabel(`<i class="wm-sw wm-sw-vap"></i>Consumed<b>${shareTxt(cu / W)}</b><small>${volShort(cu)}, mostly evaporated</small>`, p.x + 0.12, p.z - 0.12, 10, 'fate');
    if (ret > 0.05 && p.outfall) traceLabel(`<i class="wm-sw wm-sw-ret"></i>Returned<b>${shareTxt(ret / W)}</b><small>${volShort(ret)}${/ONCE-THROUGH/.test(p.cooling || '') ? ', warmer' : ''}</small>`, p.outfall.x, p.outfall.z, 8, 'fate');
  }
  /** a treatment plant or golf course: the county's water for that use, by source */
  function traceFacility(ci, cat, ss) {
    clearTrace();
    const c = model.county(ci), W = c.W[cat] || 0;
    if (!(W > 0)) return;
    const aq = aquifers && aquifers.county ? aquifers.county[c.id] : null;
    const names = {};
    if (aq && aq[0] && aq[0][0] > 0) { const tot = aq.reduce((x, r) => x + r[2], 0); if (aq[0][2] / tot >= 0.5) names.gf_sub = aq[0][1]; }
    traceSources(ss, W + (cat === 'go' ? c.other.go_rec : 0), names);
    const st = ss.find((q) => q.kind === KIND.intake && !q.well) || ss[0];
    if (st) { const hub = cat === 'ps' ? st.to[0] : flows.hubOf(st); traceLabel(`<i class="wm-sw" style="background:${CAT[cat].color}"></i>${esc(CAT[cat].name)}<small>${volShort(W)}</small>`, hub[0], hub[1], 40, 'use'); }
  }

  const hud = new Hud(app, stage);
  app.hud = hud; hudRef = hud;
  const tour = new Tour(app);
  app.tour = tour;
  hud.syncButtons();
  // panels are in place now: frame the opening view around them. The model opens at night and drifts into place.
  fitHome(); controls.set(home, true);
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!lite) {
    app.setNight(true); shared.uNight.value = 1;
    if (!reduceMotion) {
      controls.set({ ...home, d: home.d * 1.45, tilt: 0.16, az: -0.32 }, true);
      later(() => controls.flyTo({ ...home }, 5200), 350);
    }
    const h = readHash();
    if ('day' in h) { app.setNight(false); shared.uNight.value = 0; }
    if (h.use && (CAT[h.use] || h.use === 'dc')) app.isolate(h.use);
    if ('under' in h) app.setUnderground(true);
    const ci = h.county ? model.wu.id.indexOf(h.county) : -1;
    const pi = h.plant ? model.plants.findIndex((q) => String(q.eia) === h.plant) : -1;
    const aq = h.aquifer && aquifers ? aquifers.list.find((q) => String(q.code) === h.aquifer) : null;
    if (pi >= 0) later(() => app.selectPlant(pi, true), 900);
    else if (ci >= 0) later(() => app.selectCounty(ci, true), 900);
    else if (aq) later(() => app.selectAquifer(aq.i, true), 900);
    if (!Object.keys(h).length) later(() => hud.welcome(), 1800);
  }

  later(() => { hashReady = true; }, 1200);
  // dams and mapped facilities load after the first frame
  (async () => {
    try {
      const [dams, osm] = await Promise.all([loadDams(shared, slabAt, slabs), loadOsm(shared, slabAt, slabs)]);
      if (disposed) return;
      app.dams = dams; app.osm = osm;
      scene.add(dams.group, osm.group);
      const dc = new Int32Array(dams.data.n), byC = new Map();
      for (let i = 0; i < dams.data.n; i++) {
        const c = countyAt(dams.data.x[i], dams.data.z[i]); dc[i] = c;
        if (c < 0) continue;
        let a = byC.get(c); if (!a) byC.set(c, (a = { n: 0, stor: 0 }));
        a.n++; if (!dams.data.fl[i]) a.stor += dams.data.stor[i];
      }
      app.damCounty = dc; app.damsByCounty = byC;
      for (const k of ['nid', 'infra', 'golf', 'dc']) app.setLayer(k, hud.layers[k]);
      if (app.iso) app.isolate(app.iso, true);
      app._index = null;
      dams.loadNames().then(() => {
        if (disposed) return;
        const d = dams.data;
        for (let i = 0; i < d.n && d.stor[i] >= 1.5e6; i++) {
          if (d.fl[i]) continue;
          const nm = dams.names[i][0]; if (!nm || model.features.dams.some((x) => x.name === nm)) continue;
          labels.add({ text: nm, cls: 'plant', x: d.x[i], z: d.z[i], h: dams.h[i], pri: 27 + Math.log10(d.stor[i]) * 0.5, dmin: 0, dmax: 140 });
        }
      });
    } catch (e) { console.warn('dams / facilities', e); }
  })();

  // ---- pointer: hover tooltips and selection
  let hoverPending = null;
  controls.onHover = (cx, cy) => { hoverPending = cx == null ? 'none' : [cx, cy]; };
  const clearHover = () => { hud.tip(0, 0, null); shared.uHoverCounty.value = -1; plants.uHoverPlant.value = -1; if (app.dams) app.dams.uniforms.uHover.value = -1; if (app.osm) app.osm.uniforms.uHover.value = -1; pdots.uniforms.uHover.value = -1; shared.uAqHover.value = -1; canvas.classList.remove('pointing'); hovered = null; };
  const subsurfaceAt = (g) => {
    // the aquifer seen at this pixel: march down the view ray from the glass surface to the bodies' top
    if (!aquifers) return 0;
    const V = new THREE.Vector3().subVectors(camera.position, g).normalize();
    const D = shared.uAqDepth.value;
    const t = D / Math.max(V.y, 0.2);
    const ax = g.x - V.x * t, az = g.z - V.z * t;
    return aquifers.at(slabAt(ax, az), ax, az);
  };
  const doHover = () => {
    if (!hoverPending) return;
    const hp = hoverPending; hoverPending = null;
    if (hp === 'none') { clearHover(); return; }
    const [cx, cy] = hp;
    const rect = canvas.getBoundingClientRect();
    const d = controls.state.d;
    if (app.dams) app.dams.uniforms.uHover.value = -1;
    if (app.osm) app.osm.uniforms.uHover.value = -1;
    pdots.uniforms.uHover.value = -1;
    const pi = plants.enabled !== false ? plants.pick(camera, cx, cy, rect, shared.uExag.value) : -1;
    if (pi >= 0) { hovered = { plant: pi }; plants.uHoverPlant.value = pi; shared.uHoverCounty.value = -1; hud.tip(cx, cy, hud.plantTip(pi)); canvas.classList.add('pointing'); return; }
    plants.uHoverPlant.value = -1;
    const di = dams3d.pick(camera, cx, cy, rect, shared.uExag.value);
    dams3d.uHover.value = di;
    if (di >= 0) { const dm = model.features.dams[di]; hovered = { dam: di }; hud.tip(cx, cy, hud.damTip(dm)); canvas.classList.add('pointing'); return; }
    const g = pickGround(cx, cy);
    if (!g) { clearHover(); return; }
    if (pdots.group.visible) {
      const k = pdots.pick(camera, cx, cy, rect, g, d);
      if (k >= 0) { pdots.uniforms.uHover.value = k; const pj = pdots.plantIndex[k]; hovered = { plant: pj }; hud.tip(cx, cy, hud.plantTip(pj)); canvas.classList.add('pointing'); return; }
    }
    if (app.osm) {
      const oi = app.osm.pick(camera, cx, cy, rect, g, d);
      if (oi >= 0) {
        app.osm.uniforms.uHover.value = oi; hovered = { osm: oi };
        if (!app.osm.names) app.osm.loadNames().then(() => { if (hovered && hovered.osm === oi) hud.tip(cx, cy, hud.osmTip(oi)); });
        hud.tip(cx, cy, hud.osmTip(oi)); canvas.classList.add('pointing'); return;
      }
    }
    if (app.dams && app.dams.group.visible) {
      const ni = app.dams.pick(camera, cx, cy, rect, g, d);
      if (ni >= 0) {
        app.dams.uniforms.uHover.value = ni; hovered = { nid: ni };
        if (!app.dams.names) app.dams.loadNames().then(() => { if (hovered && hovered.nid === ni) hud.tip(cx, cy, hud.nidTip(ni)); });
        hud.tip(cx, cy, hud.nidTip(ni)); canvas.classList.add('pointing'); return;
      }
    }
    const pxWorld = d * 2 * (camera.userData.tanHalf || Math.tan((camera.fov * Math.PI) / 360)) / H;
    const s = slabAt(g.x, g.z);
    if (app.underground && aquifers) {
      const ai = subsurfaceAt(g);
      shared.uAqHover.value = ai > 0 ? ai : -1;
      const ci = countyAt(g.x, g.z);
      shared.uHoverCounty.value = ci;
      if (ai > 0) { hovered = { aquifer: ai, county: ci }; hud.tip(cx, cy, hud.aquiferTip(ai)); canvas.classList.add('pointing'); return; }
    }
    const aq = aqueducts.group.visible ? aqueducts.pick(g.x, g.z, pxWorld * 6) : null;
    const rv = !aq && rivers.group.visible ? rivers.pick(g.x, g.z, pxWorld * 7) : null;
    const ci = countyAt(g.x, g.z);
    if (aq) { hovered = { aq }; shared.uHoverCounty.value = ci; hud.tip(cx, cy, hud.aqTip(aq)); canvas.classList.add('pointing'); return; }
    shared.uHoverCounty.value = ci;
    const cls = d < 120 && s ? nlcd.classAt(s, g.x, g.z) : -1;
    if (rv && rv.name) { hovered = { river: rv, county: ci }; hud.tip(cx, cy, hud.riverTip(rv)); canvas.classList.add('pointing'); return; }
    if (ci >= 0) { hovered = { county: ci }; hud.tip(cx, cy, hud.countyTip(ci, cls)); canvas.classList.add('pointing'); return; }
    clearHover();
  };
  controls.onStart = (kind) => { if (kind === 'drag') { hud.tip(0, 0, null); canvas.classList.add('dragging'); } };
  on(window, 'pointerup', () => canvas.classList.remove('dragging'));
  controls.onClick = (cx, cy) => {
    const rect = canvas.getBoundingClientRect();
    const pi = plants.enabled !== false ? plants.pick(camera, cx, cy, rect, shared.uExag.value) : -1;
    if (pi >= 0) { tour.stop(); return app.selectPlant(pi, true); }
    const g = pickGround(cx, cy);
    if (g && pdots.group.visible) { const k = pdots.pick(camera, cx, cy, rect, g, controls.state.d); if (k >= 0) { tour.stop(); return app.selectPlant(pdots.plantIndex[k], true); } }
    if (g && app.osm) { const oi = app.osm.pick(camera, cx, cy, rect, g, controls.state.d); if (oi >= 0) { tour.stop(); return app.selectOsm(oi); } }
    if (g && app.dams && app.dams.group.visible) { const ni = app.dams.pick(camera, cx, cy, rect, g, controls.state.d); if (ni >= 0) { tour.stop(); return app.selectDam(ni); } }
    if (g && app.underground && hovered && hovered.aquifer) { tour.stop(); return app.selectAquifer(hovered.aquifer, false); }
    if (g && aqueducts.group.visible && !app.underground) {
      const pxWorld = controls.state.d * 2 * (camera.userData.tanHalf || Math.tan((camera.fov * Math.PI) / 360)) / rect.height;
      const it = aqueducts.pick(g.x, g.z, pxWorld * (rect.width < 700 ? 9 : 6));
      if (it) { tour.stop(); return app.selectAqueduct(aqueducts.items.indexOf(it)); }
    }
    const ci = g ? countyAt(g.x, g.z) : -1;
    if (ci >= 0) { tour.stop(); if (ci === selCounty) app.selectCounty(ci, true); else app.selectCounty(ci, false); }
    else app.clearSelection();
  };
  controls.onDblClick = (cx, cy) => {
    const g = pickGround(cx, cy);
    if (g) controls.flyTo({ x: g.x, z: g.z, d: Math.max(controls.minDist, controls.state.d * 0.4) }, 900);
  };
  // the wheel zooms the map once it fills the window; until then it scrolls the page, docking the map at the top
  let dockUntil = 0;
  controls.wheelGate = (e) => {
    if (app.expanded) return true;
    const r = stage.getBoundingClientRect(), vh = window.innerHeight;
    const now = performance.now();
    if (now < dockUntil) { e.preventDefault(); return false; }
    const fills = r.top > -3 && r.top < 3;
    if (fills || r.height < vh * 0.6) {
      // zoomed all the way out, scrolling up hands the wheel back to the page
      if (e.deltaY < 0 && controls.goal.d >= controls.maxDist * 0.98 && window.scrollY > 0 && fills) return false;
      return true;
    }
    if ((e.deltaY > 0 && r.top > 0 && r.top < vh * 0.7) || (e.deltaY < 0 && r.top < 0 && r.bottom > vh * 0.3)) {
      e.preventDefault();
      window.scrollTo({ top: window.scrollY + r.top, behavior: reduceMotion ? 'auto' : 'smooth' });
      dockUntil = now + 450;
      return false;
    }
    return false;
  };
  on(stage, 'keydown', (e) => {
    if (e.target && e.target.closest && e.target.closest('input, textarea, select')) return;
    if (e.key === 'Escape') {
      if (!hud.$('[data-layers]').hidden) hud.$('[data-layers]').hidden = true;
      else if (tour.i >= 0) tour.stop();
      else if (app.expanded && !document.fullscreenElement) app.toggleExpanded();
      else if (app.iso) app.isolate(null);
      else app.clearSelection();
      return;
    }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'n' || e.key === 'N') app.setNight(!app.night);
    if (e.key === 'p' || e.key === 'P') perfEl.hidden = !perfEl.hidden;
    if (e.key === 'u' || e.key === 'U') app.setUnderground(!app.underground);
  });

  // ---- motion and performance
  if (reduceMotion) { flows.common.uSpeed.value = 0.35; const f0 = controls.flyTo.bind(controls); controls.flyTo = (to, ms) => f0(to, Math.min(ms || 600, 600)); }
  const perfEl = stage.querySelector('[data-wm-perf]');
  if (location.hash === '#perf' && perfEl) perfEl.hidden = false;
  let pr = renderer.getPixelRatio(), lowSince = 0, checks = 0;
  const adapt = (fps) => {
    if (++checks < 3 || lite) return;
    if (fps < 28 && pr > 1.0) { if (!lowSince) lowSince = checks; else if (checks - lowSince >= 1) { pr = Math.max(1, pr * 0.75); renderer.setPixelRatio(pr); resize(); lowSince = 0; } }
    else lowSince = 0;
  };
  const skyU = sky.userData.uniforms, floorU = floor.userData.uniforms;
  const applyLook = (t) => {
    const D = LOOK.day, N = LOOK.night;
    sun.intensity = D.sunI + (N.sunI - D.sunI) * t; sun.color.copy(D.sunC).lerp(N.sunC, t);
    hemi.intensity = D.hemiI + (N.hemiI - D.hemiI) * t; hemi.color.copy(D.hemiSky).lerp(N.hemiSky, t); hemi.groundColor.copy(D.hemiGround).lerp(N.hemiGround, t);
    shared.uSkyCol.value.copy(D.sky).lerp(N.sky, t); shared.uSunCol.value.copy(D.sunCol).lerp(N.sunCol, t);
    shared.uDeep.value.copy(D.deep).lerp(N.deep, t); shared.uShallow.value.copy(D.shallow).lerp(N.shallow, t);
    skyU.uZenith.value.copy(D.zenith).lerp(N.zenith, t); skyU.uHorizon.value.copy(D.horizon).lerp(N.horizon, t);
    floorU.uCol.value.copy(D.floor).lerp(N.floor, t);
    scene.fog.color.copy(D.fog).lerp(N.fog, t);
    if (finish.bloom) { finish.bloom.intensity = D.bloom + (N.bloom - D.bloom) * t; finish.bloom.luminanceMaterial.threshold = D.thr + (N.thr - D.thr) * t; }
  };
  applyLook(0);
  let last = performance.now(), frames = 0, lastScale = '', lastLook = -1, visible = true, riverBright = 1;
  const io = new IntersectionObserver((ents) => { for (const e of ents) visible = e.isIntersecting; }, { threshold: 0 });
  io.observe(stage);
  const stats = { lod: null, fps: 0 };
  const loop = (now) => {
    raf = requestAnimationFrame(loop);
    if (!visible || document.hidden) { last = now; return; }
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    shared.uTime.value = now / 1000;
    const k = 1 - Math.exp(-dt * 2.2);
    // emphasis and isolation ease in and out
    const ke = 1 - Math.exp(-dt * 7);
    for (let j = 0; j < wTarget.length; j++) { const w = flows.catW; w[j] += (wTarget[j] - w[j]) * ke; if (Math.abs(w[j] - wTarget[j]) < 0.004) w[j] = wTarget[j]; }
    shared.uIsoAmt.value += (iso.target - shared.uIsoAmt.value) * ke;
    if (iso.pending && shared.uIsoAmt.value < 0.02) { iso.pending = false; shared.uIsoAmt.value = 0; const spec = CHORO[userChoro] || CHORO.none; writeChoro(spec, spec.cat ? 2 : spec.f ? 1 : 0); }
    shared.uNight.value += (looks.night - shared.uNight.value) * k;
    if (Math.abs(shared.uNight.value - looks.night) < 0.002) shared.uNight.value = looks.night;
    shared.uAqMode.value += (looks.aq - shared.uAqMode.value) * k;
    if (Math.abs(shared.uAqMode.value - looks.aq) < 0.002) shared.uAqMode.value = looks.aq;
    // once the glass has faded back to solid, put the land back and stop drawing the aquifers
    if (!app.underground && shared.uAqMode.value === 0 && terrains[0].glass) { terrains.forEach((t) => t.setGlass(false)); subsurface.forEach((s) => s.setVisible(false)); }
    if (shared.uNight.value !== lastLook) { applyLook(shared.uNight.value); lastLook = shared.uNight.value; }
    const d = controls.state.d;
    shared.uExag.value = exagAt(d);
    shared.uCamDist.value = d;
    shared.uAqDepth.value = Math.min(16, Math.max(0.45, d * 0.0115)) * Math.min(1, shared.uAqMode.value * 1.5 + 0.0001);
    shared.uAqThick.value = Math.min(12, Math.max(0.32, d * 0.0085));
    shared.uRipple.value = Math.min(24, Math.max(1.5, 60 / Math.sqrt(d)));
    shared.uDetailAmt.value = 1 - Math.min(1, Math.max(0, (d - 45) / 75));
    shared.uStateLines.value = Math.min(1, Math.max(0, (d - 30) / 60));
    controls.update(dt);
    camera.updateMatrixWorld();
    scene.fog.near = d * 1.35; scene.fog.far = d * 7 + 400;
    pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(pv);
    const vh = H * renderer.getPixelRatio();
    stats.lod = terrains.map((t) => t.update(camera, frustum, shared.uExag.value, vh));
    for (const s of subsurface) s.update(camera, frustum, shared.uExag.value, vh, shared.uAqDepth.value, shared.uAqThick.value);
    nlcd.update(controls.state.x, controls.state.z, d);
    rivers.update(d);
    plants.update(d);
    if (plants.enabled === false) plants.group.visible = false;
    dams3d.update(d); aqueducts.update(d);
    const mk = Math.min(1.6, Math.max(0.9, Math.pow(160 / Math.max(d, 1), 0.18)));
    if (app.dams) app.dams.setPx(mk);
    if (app.osm) app.osm.setPx(app.iso === 'dc' ? mk * 1.5 : mk);
    pdots.setPx(mk);
    flows.update(d, controls.state.x, controls.state.z);
    const rb = flows.focus ? 0.5 : 1;
    if (rb !== riverBright) { rivers.setBright(rb); riverBright = rb; }
    doHover();
    if ((frames & 15) === 0) {
      // keep labels out from under the panels
      const sr = stage.getBoundingClientRect(), av = [];
      for (const el of stage.querySelectorAll('.wm-uses, .wm-key, .wm-insp, .wm-bar > *, .wm-caption, .wm-layers')) {
        if (!el.offsetParent || el.hidden) continue;
        const r = el.getBoundingClientRect(); if (!r.width) continue;
        av.push([r.left - sr.left, r.top - sr.top, r.right - sr.left, r.bottom - sr.top]);
      }
      labels.setAvoid(av);
    }
    labels.update(d, shared.uExag.value, { width: W, height: H });
    const det = flows.detail && d < 230;
    const sc = `${(det ? flows.detail.unit : flows.unit).toPrecision(2)}|${det}`;
    if (sc !== lastScale) { lastScale = sc; hud.setScale(det ? flows.detail.unit : flows.unit, det); }
    finish.render(dt);
    frames++;
  };
  raf = requestAnimationFrame(loop);
  const fpsTimer = setInterval(() => {
    stats.fps = frames; frames = 0; if (visible && !document.hidden) adapt(stats.fps);
    if (perfEl && !perfEl.hidden) perfEl.textContent = `${stats.fps} fps  ·  ${pr.toFixed(2)}x  ·  ${W}×${H}\nstreaks ${flows.count.toLocaleString()} + ${(flows.detail?.N || 0).toLocaleString()}  ·  d ${controls.state.d.toFixed(0)}  ·  nlcd ${nlcd.layers.filter(Boolean).length}`;
  }, 1000);
  if (loadingEl) loadingEl.classList.add('done');
  root.dataset.ready = 'true';
  const handle = {
    app, scene, camera, controls, shared, renderer, home, model, flows, labels, tour, hud, aquifers, subsurface, applyLook, terrains,
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(raf); clearInterval(fpsTimer); for (const t of timers) clearTimeout(t); timers.clear();
      ac.abort(); ro.disconnect(); io.disconnect();
      controls.dispose(); hud.dispose(); tour.dispose?.(); labels.dispose();
      root.classList.remove('wm-expanded'); document.documentElement.classList.remove('wm-lock');
      if (document.fullscreenElement === root) document.exitFullscreen?.();
      scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
        for (const m of mats) { for (const v of Object.values(m.uniforms || {})) if (v && v.value && v.value.isTexture) v.value.dispose(); m.dispose(); }
      });
      for (const s of slabs) for (const t of [s.heightTex, s.colorTex, s.countyTex, s.landTex, s.auxTex, s.aquiferTex]) t?.dispose?.();
      nlcd.arr?.dispose?.(); nlcd.src?.dispose?.();
      finish.composer?.dispose?.();
      renderer.dispose(); renderer.forceContextLoss();
      hud.wrap?.remove();
    },
  };
  if (typeof window !== 'undefined') window.__w = handle;
  return handle;
}
