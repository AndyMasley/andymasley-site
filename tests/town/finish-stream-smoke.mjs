#!/usr/bin/env node
/** Run against a frozen, already-started candidate. Never builds or starts it.
 * TOWN_URL=http://127.0.0.1:4381/town/ node tests/town/finish-stream-smoke.mjs
 * Uses Chromium CDP for measured cold 10 Mbps transfer; no frame-rate assertion.
 */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const target = process.env.TOWN_URL;
if (!target) throw new Error('Set TOWN_URL to a running, frozen candidate.');
const out = process.env.TOWN_OUT_DIR || '/private/tmp/webster-finish-stream-acceptance';
const normalTimeout = Number(process.env.TOWN_READY_TIMEOUT_MS || 90000);
const fallbackTimeout = Number(process.env.TOWN_FAILURE_READY_TIMEOUT_MS || 45000);
const optionalFamilies = [
  ['/town-evidence/v1/additional-environment/', 'environment'], ['/town-roadside/', 'roadside'],
  ['/town-evidence/v1/environment-ground/', 'environment-ground'], ['/town-evidence/v1/environment-facilities/', 'facilities'],
  ['/town-evidence/v1/road-materials/', 'road-materials'], ['/town-finish/v1/corner-ground/', 'corner-ground'],
  ['/town-finish/v1/corners/', 'corners'], ['/town-finish/v1/curves/', 'road-curve'],
  ['/town-finish/v1/dashes/', 'road-dash'], ['/town-finish/v1/property-terrain/', 'property-terrain'],
  ['/town-finish/v1/context/', 'context'], ['/town-finish/v1/markings/', 'road'],
  ['/town-evidence/v1/terrain/', 'terrain'], ['/town-surfaces/v2/lots/', 'parking'], ['/town-surfaces/v2/masks/', 'mask'],
];
const optionalKind = url => {
  const p = new URL(url).pathname.replace('/town-transfer/json-gzip-v1', '').replace(/\.json\.gz$/, '.json');
  return optionalFamilies.find(([prefix]) => p.startsWith(prefix))?.[1] ?? null;
};
const townAsset = url => /^\/town-(?:assets|transfer|finish|surfaces|evidence|roadside|environment-ground)\//.test(new URL(url).pathname);
const gatedAsset = url => optionalKind(url) || /^\/town-finish\/v1\/network\//.test(new URL(url).pathname) || /^\/town-(?:transfer|evidence)\//.test(new URL(url).pathname) ||
  /^\/town-assets\/.+(?:\/(?:manifest|network)\.json|\.glb(?:\.gz)?)$/.test(new URL(url).pathname);
const report = {
  version: 1, url: target, started: new Date().toISOString(), passed: false,
  configuration: { coldMegabitsPerSecond: 10, latencyMs: 40, viewport: { width: 1280, height: 850 }, normalTimeoutMs: normalTimeout, fallbackTimeoutMs: fallbackTimeout, noFrameRateThreshold: true },
  scenarios: [],
};
await mkdir(out, { recursive: true });
const moduleName = process.env.PLAYWRIGHT_MODULE || '/Users/andy/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const { chromium } = await import(moduleName.startsWith('/') ? pathToFileURL(moduleName).href : moduleName);
let browser;

async function bounded(promise, ms, message) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms); })]); }
  finally { clearTimeout(timer); }
}

async function state(page) {
  return page.evaluate(() => {
    const g = window.__webster;
    if (!g) return { ready: false, status: document.querySelector('[data-town-status]')?.textContent };
    const e = g.engine;
    return {
      ready: g.ready, frames: g.metrics.frames, distance: e.distance, speed: e.speed, paused: e.paused,
      edge: e.edgeId, status: document.querySelector('[data-town-status]')?.textContent,
      contextLost: g.renderer.getContext().isContextLost(), canvases: document.querySelectorAll('[data-town-canvas]').length,
      metrics: g.metrics, finish: g.presentation.finish, streaming: g.world.streamingResources(),
      tiles: [...g.world.loaded].map(([id, t]) => ({ id, level: t.level, road: t.group.userData.roadFinish, roadMaterials:t.group.userData.roadMaterialFinish, terrain: t.group.userData.terrainFinish, parking: t.group.userData.parkingFinish, correctedMask: t.group.userData.pavedSurfaceMask, missing: t.group.userData.optionalDetailMissing ?? [] })),
    };
  });
}

async function runScenario(mode) {
  const scenario = { mode, passed: false, pageErrors: [], assetErrors: [], failedRequests: [], intercepted: [], routeErrors: [], checks: [] };
  report.scenarios.push(scenario);
  const context = await browser.newContext({ viewport: report.configuration.viewport, serviceWorkers: 'block' });
  const page = await context.newPage();
  const timeout = mode === 'cold-10mbps' ? normalTimeout : fallbackTimeout;
  page.setDefaultTimeout(timeout);
  const cdp = await context.newCDPSession(page);
  const transfers = new Map();
  let playedAt = Infinity, releaseHeld;
  const heldGate = new Promise(resolve => { releaseHeld = resolve; });
  const heldHandlers = new Set();
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  if (mode === 'cold-10mbps') await cdp.send('Network.emulateNetworkConditions', {
    offline: false, latency: 40, downloadThroughput: 10_000_000 / 8, uploadThroughput: 5_000_000 / 8,
  });
  cdp.on('Network.requestWillBeSent', e => transfers.set(e.requestId, { id: e.requestId, url: e.request.url, type: e.type, requestedAt: Date.now(), receivedBytes: 0, completed: false, fromDiskCache: false }));
  cdp.on('Network.dataReceived', e => { const r = transfers.get(e.requestId); if (r) r.receivedBytes += e.encodedDataLength; });
  cdp.on('Network.responseReceived', e => { const r = transfers.get(e.requestId); if (r) { r.status = e.response.status; r.fromDiskCache = !!e.response.fromDiskCache; } });
  cdp.on('Network.loadingFinished', e => { const r = transfers.get(e.requestId); if (r) { r.receivedBytes = e.encodedDataLength; r.completed = true; r.finishedAt = Date.now(); } });
  cdp.on('Network.loadingFailed', e => { const r = transfers.get(e.requestId); if (r) { r.failed = e.errorText; r.finishedAt = Date.now(); } });
  page.on('pageerror', e => scenario.pageErrors.push(e.message));
  page.on('response', response => {
    if (response.status() >= 400 && townAsset(response.url())) scenario.assetErrors.push({ url: response.url(), status: response.status(), expected: mode === 'optional-503' && !!optionalKind(response.url()) });
  });
  page.on('requestfailed', request => scenario.failedRequests.push({ url: request.url(), error: request.failure()?.errorText }));
  // Observe real fetch signals without changing response timing or cancellation.
  await page.addInitScript(families => {
    const original = window.fetch.bind(window);
    const probe = window.__finishStreamProbe = { rows: [], playAt: null };
    window.fetch = async (input, init) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, location.href).href;
      const p = new URL(url).pathname.replace('/town-transfer/json-gzip-v1', '').replace(/\.json\.gz$/, '.json');
      const kind = families.find(([prefix]) => p.startsWith(prefix))?.[1] ?? null;
      if (!kind) return original(input, init);
      const signal = init?.signal || (input instanceof Request ? input.signal : undefined);
      const row = { url, kind, start: performance.now(), hasSignal: !!signal, abort: signal?.aborted ? performance.now() : null, settled: null };
      probe.rows.push(row);
      const aborted = () => { row.abort = performance.now(); };
      signal?.addEventListener('abort', aborted, { once: true });
      try { const response = await original(input, init); row.status = response.status; return response; }
      catch (error) { row.error = error.name; throw error; }
      finally { row.settled = performance.now(); signal?.removeEventListener('abort', aborted); }
    };
  }, optionalFamilies);
  if (mode !== 'cold-10mbps') await context.route(url => !!optionalKind(url.href), route => {
    const run = (async () => {
      const row = { url: route.request().url(), kind: optionalKind(route.request().url()), time: Date.now() };
      scenario.intercepted.push(row);
      if (mode === 'optional-503') {
        await route.fulfill({ status: 503, contentType: 'text/plain', body: 'Intentional optional scenery outage.' });
        return;
      }
      // No timed release: readiness must succeed while every finish is withheld.
      await heldGate;
      row.releasedAt = Date.now();
      try { await route.continue(); row.continued = true; }
      catch (error) { scenario.routeErrors.push({ url: row.url, afterDisposal: true, message: error.message }); }
    })();
    heldHandlers.add(run);
    void run.finally(() => heldHandlers.delete(run)).catch(() => {});
    return run;
  });
  const transferSummary = () => {
    const rows = [...transfers.values()];
    const sum = list => ({ requests: list.length, completed: list.filter(r => r.completed).length, observedWireBytes: list.reduce((s, r) => s + r.receivedBytes, 0) });
    return { allPage: sum(rows), afterPlay: sum(rows.filter(r => r.requestedAt >= playedAt)), townAssets: sum(rows.filter(r => townAsset(r.url))), optionalFinishes: sum(rows.filter(r => optionalKind(r.url))) };
  };
  try {
    await page.goto(target, { waitUntil: 'domcontentloaded' });
    await page.locator('[data-town-play]').waitFor({ state: 'visible' });
    await page.waitForTimeout(700);
    const early = [...transfers.values()].filter(r => gatedAsset(r.url));
    assert.deepEqual(early, [], 'Heavy town and finish assets must stay gated before the real Play click');
    assert.equal(await page.evaluate(() => !!window.__webster), false);
    scenario.checks.push('No graph, scenery, or optional finish downloads before Play');
    scenario.beforePlayTransfers = transferSummary();
    playedAt = Date.now();
    await page.evaluate(() => { window.__finishStreamProbe.playAt = performance.now(); });
    await page.locator('[data-town-play]').click();
    await page.waitForFunction(() => window.__webster?.ready && window.__webster.metrics.frames >= 3, null, { timeout });
    scenario.clickToReadyMs = Date.now() - playedAt;
    scenario.ready = await state(page);
    scenario.readyTransfers = transferSummary();
    scenario.readyRequestLedger = [...transfers.values()].map(r => ({ ...r }));
    assert.equal(scenario.ready.contextLost, false);
    assert.equal(scenario.ready.canvases, 1);
    assert.ok(scenario.ready.metrics.triangles > 0 && scenario.ready.tiles.length > 0);
    scenario.checks.push('Base town renders and reaches ready within the configured bound');
    if (mode !== 'cold-10mbps') {
      for (const kind of ['road', 'terrain', 'mask']) assert.ok(scenario.intercepted.some(r => r.kind === kind), 'Candidate did not exercise ' + kind + ' fallback; rebuild the final finish assets');
      assert.ok(scenario.intercepted.filter(r => r.kind === 'terrain').every(r => /-[012]\.[a-f0-9]+\.json(?:\.gz)?$/.test(new URL(r.url).pathname)), 'Terrain must be requested per LOD, not as a combined packet');
      assert.equal(scenario.ready.finish.roadTriangles, 0);
      assert.equal(scenario.ready.finish.terrainTriangles, 0);
      assert.equal(scenario.ready.finish.parkingTriangles, 0);
      assert.equal(scenario.ready.finish.pavedMasks, 0);
      assert.ok([...transfers.values()].some(r => /\/town-assets\/.+\/masks\//.test(new URL(r.url).pathname) && r.completed), 'Original ground mask must load after corrected-mask failure');
      scenario.checks.push('Unavailable road, per-LOD terrain, parking and corrected mask supplements fall back to original scenery');
    }
    await page.locator('[data-town-canvas]').focus();
    const before = scenario.ready.distance;
    await page.keyboard.press('ArrowUp');
    await page.waitForFunction(distance => window.__webster.engine.distance > distance + .25 && window.__webster.engine.speed > 0, before, { timeout: 15000 });
    await page.keyboard.press('Space');
    scenario.driven = await state(page);
    assert.ok(scenario.driven.distance > before + .25);
    scenario.checks.push('Actual arrow-key input drives the fallback game');
    if (mode !== 'cold-10mbps') {
      // The startup neighborhood has no new environment packet. Visit the real
      // beach tile so its additional stream is exercised, not merely intercepted.
      scenario.environmentFallback = await page.evaluate(async () => {
        const g = window.__webster, e = g.engine;
        const [id, s] = g.graph.nearest([-796.64, -341.67]);
        e.paused = true; e.speed = e.cruise = 0; e.edgeId = id; e.s = s;
        e.phase = 'ROAD'; e.connection = null; e.connectionS = 0; e.queue(null);
        await g.world.prepareAt([-796.64, 45.7, 341.67]);
        return { ready: g.ready, lost: g.renderer.getContext().isContextLost(), research: g.presentation.research, streaming: g.world.streamingResources() };
      });
      assert.ok(scenario.intercepted.some(r => r.kind === 'environment') || scenario.environmentFallback.streaming.incompleteTiles.some(t => t.missing.includes('environment')), 'Beach tile did not exercise bounded environment fallback');
      assert.equal(scenario.environmentFallback.ready, true);
      assert.equal(scenario.environmentFallback.lost, false);
      assert.equal(scenario.environmentFallback.research.environmentObjects, 0);
      scenario.checks.push('Unavailable beach environment packet leaves its original scenery playable');
      scenario.bankFallback = await page.evaluate(async () => {
        const g=window.__webster, e=g.engine, point=[1669.7652,-3366.9247], [id,s]=g.graph.nearest(point);
        e.paused=true;e.speed=e.cruise=0;e.edgeId=id;e.s=s;e.phase='ROAD';e.connection=null;e.connectionS=0;e.queue(null);
        await g.world.prepareAt([point[0],46.34767,-point[1]]);
        return {ready:g.ready,lost:g.renderer.getContext().isContextLost(),applied:[...g.world.loaded.values()].some(t=>t.group.userData.environmentGround?.waterTriangles>0),roadside:g.presentation.research.roadsideObjects,facilities:g.presentation.research.facilities,roadSurfaces:g.world.finishResources().roadSurfaceTriangles,roadCurves:g.world.finishResources().roadCurve,streaming:g.world.streamingResources()};
      });
      const missing = new Set(scenario.bankFallback.streaming.incompleteTiles.flatMap(t => t.missing));
      const exercised = (kind, label) => scenario.intercepted.some(r => r.kind === kind) || missing.has(label) && scenario.bankFallback.streaming.detailRequests.cancelled > 0;
      assert.ok(exercised('environment-ground','shoreline'),'DCR tile did not exercise bounded ground fallback');
      assert.ok(exercised('roadside','roadside'),'Roadside fallback was not exercised');
      assert.equal(scenario.bankFallback.ready,true);assert.equal(scenario.bankFallback.lost,false);assert.equal(scenario.bankFallback.applied,false);assert.equal(scenario.bankFallback.roadside,0);assert.equal(scenario.bankFallback.facilities,0);assert.equal(scenario.bankFallback.roadSurfaces,0);
      assert.ok(exercised('facilities','facilities'),'Facilities fallback was not exercised');
      assert.ok(exercised('road-materials','roadMaterials'),'Road material fallback was not exercised');
      assert.ok(exercised('road-curve','roadCurve'),'Lake curve fallback was not exercised');
      assert.ok(scenario.bankFallback.roadCurves.every(row=>!row.applied),'Unavailable curve must preserve the complete original corridor');
      assert.deepEqual(scenario.ready.finish.streetCorners, [], 'Missing registered corner grading must not expose new unsupported slabs');
      scenario.checks.push('Unavailable DCR ground and roadside packets preserve playable original scenery');
      // The three earlier owners contain no registered dash packet. Exercise
      // the actual Thompson Road owner explicitly instead of depending on
      // whether speculative neighboring-tile loads happen to reach a dash.
      scenario.dashFallback = await page.evaluate(async () => {
        const g=window.__webster,e=g.engine,point=[-1356.354,-626.0703], [id,s]=g.graph.nearest(point);
        e.paused=true;e.speed=e.cruise=0;e.edgeId=id;e.s=s;e.phase='ROAD';e.connection=null;e.connectionS=0;e.queue(null);
        const p=e.pose()[0];await g.world.prepareAt([p[0],p[2],-p[1]]);
        return {ready:g.ready,lost:g.renderer.getContext().isContextLost(),dashes:g.world.finishResources().roadDash,streaming:g.world.streamingResources()};
      });
      assert.equal(scenario.dashFallback.ready,true);assert.equal(scenario.dashFallback.lost,false);
      assert.ok(scenario.dashFallback.dashes.every(row=>!row.applied),'Unavailable dashes must retain source markings');
      assert.ok(scenario.intercepted.some(row=>row.kind==='road-dash') || scenario.dashFallback.streaming.incompleteTiles.some(tile=>tile.id==='-6_-3' && tile.missing.includes('roadDash')), 'Registered Thompson Road dash owner was not exercised');
      scenario.checks.push('Unavailable registered Thompson Road dashes retain source markings and remain retryable');
    }
    scenario.fetchSignalsBeforeDispose = await page.evaluate(() => window.__finishStreamProbe.rows);
    if (mode === 'optional-stalled') {
      const observations = [scenario.ready.streaming, scenario.environmentFallback.streaming, scenario.bankFallback.streaming, scenario.dashFallback.streaming];
      const missing = new Set(observations.flatMap(s => s.incompleteTiles.flatMap(t => t.missing)));
      const labels = { road:'roadPaint', terrain:'terrain', mask:'coverMask', environment:'environment', roadside:'roadside', 'environment-ground':'shoreline', facilities:'facilities', 'road-materials':'roadMaterials', 'corners':'streetCorners', 'corner-ground':'streetCornerGround', 'road-curve':'roadCurve', 'road-dash':'roadDash' };
      for (const [kind,label] of Object.entries(labels)) {
        const attempted = scenario.fetchSignalsBeforeDispose.filter(r => r.kind === kind);
        if (attempted.length) assert.ok(attempted.some(r => r.hasSignal && r.abort !== null && r.error === 'AbortError'), 'Stalled '+kind+' did not abort');
        else assert.ok(missing.has(label) && observations.some(s => s.detailRequests.cancelled > 0), 'Queued '+kind+' was neither attempted nor explicitly cancelled with a recoverable fallback');
      }
      scenario.checks.push('Attempted optional requests abort; cancelled queued families remain explicitly incomplete and retryable without starting network work');
      assert.ok(scenario.intercepted.every(r => r.releasedAt === undefined), 'A stalled response was released before proving readiness');
      const retired = await page.evaluate(() => {
        const g = window.__finishRetired = window.__webster;
        g.dispose();
        return { ready: g.ready, frames: g.metrics.frames, children: g.world.root.children.length, loaded: g.world.loaded.size };
      });
      assert.equal(retired.ready, false); assert.equal(retired.children, 0); assert.equal(retired.loaded, 0);
      releaseHeld();
      // Routes may already be cancelled; await their attempted late delivery.
      await bounded(Promise.allSettled([...heldHandlers]), 5000, 'Late intercepted routes did not settle after game disposal');
      await page.waitForTimeout(600);
      scenario.afterLateRelease = await page.evaluate(() => {
        const g = window.__finishRetired;
        return { ready: g.ready, frames: g.metrics.frames, children: g.world.root.children.length, loaded: g.world.loaded.size, finish: g.world.finishResources(), signals: window.__finishStreamProbe.rows };
      });
      assert.equal(scenario.afterLateRelease.ready, false);
      assert.equal(scenario.afterLateRelease.frames, retired.frames, 'Disposed game continued rendering');
      assert.equal(scenario.afterLateRelease.children, 0, 'Late optional completion inserted scene objects after disposal');
      assert.equal(scenario.afterLateRelease.loaded, 0, 'Late optional completion inserted a retired tile');
      scenario.checks.push('Stalled fetches abort, and attempted late responses cannot revive or append to a disposed scene');
    }
    assert.deepEqual(scenario.pageErrors, []);
    assert.deepEqual(scenario.assetErrors.filter(r => !r.expected), []);
    scenario.passed = true;
  } catch (error) {
    scenario.error = error.stack;
    scenario.failureState = await state(page).catch(() => null);
    throw error;
  } finally {
    await page.evaluate(() => window.__webster?.dispose()).catch(() => {});
    releaseHeld();
    await context.close();
    scenario.finalTransfers = transferSummary();
    scenario.requests = [...transfers.values()];
    await writeFile(out + '/' + mode + '.json', JSON.stringify(scenario, null, 2) + '\n');
  }
}

try {
  browser = await chromium.launch({ headless: process.env.HEADED !== '1', executablePath: process.env.CHROME_EXECUTABLE || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
  for (const mode of ['cold-10mbps', 'optional-503', 'optional-stalled']) {
    await runScenario(mode);
    console.log('PASS ' + mode);
  }
  report.passed = true;
} catch (error) { report.error = error.stack; process.exitCode = 1; console.error(error.stack); }
finally {
  await browser?.close();
  report.finished = new Date().toISOString();
  await writeFile(out + '/report.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ passed: report.passed, scenarios: report.scenarios.map(s => ({ mode: s.mode, passed: s.passed, clickToReadyMs: s.clickToReadyMs, readyTransfers: s.readyTransfers })), report: out + '/report.json' }));
}
