#!/usr/bin/env node
/** Real browser input/streaming checks. Run against a started dev/preview/deployed server; never starts or edits it. */
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const target = new URL(process.env.TOWN_URL || 'http://127.0.0.1:4322/town');
const browserName = process.env.BROWSER || 'chromium';
const out = path.resolve(process.env.TOWN_OUT_DIR || path.join(repo, 'data/derived/town', `browser-smoke-${browserName}-${new Date().toISOString().replace(/[:.]/g, '-')}`));
const timeout = Number(process.env.TOWN_TIMEOUT_MS || 90000);
const headless = process.env.HEADED !== '1';
const checkMissing = process.env.CHECK_MISSING_ASSET !== '0';
const bundle = '/Users/andy/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules';
const report = { version: 1, passed: false, startedAt: new Date().toISOString(), url: target.href, configuration: { browser: browserName, playwrightBrowsersPath: process.env.PLAYWRIGHT_BROWSERS_PATH || '(Playwright default)', headless, viewport: { width: 1280, height: 850 }, timeoutMs: timeout, checkMissingAsset: checkMissing }, checks: [], scenarios: [], console: [], pageErrors: [], requests: [], failedRequests: [], responses: [], screenshots: [], skipped: [] };
let browser;

async function playwrightModule() {
  const candidates = process.env.PLAYWRIGHT_MODULE ? [process.env.PLAYWRIGHT_MODULE] : ['playwright', 'playwright-core', path.join(bundle, 'playwright/index.mjs')];
  const failures = [];
  for (let candidate of candidates) {
    try {
      if (path.isAbsolute(candidate) || candidate.startsWith('.')) {
        candidate = path.resolve(candidate);
        if ((await stat(candidate)).isDirectory()) candidate = path.join(candidate, 'index.mjs');
        candidate = pathToFileURL(candidate).href;
      }
      const module = await import(candidate);
      report.configuration.playwrightModule = candidate;
      return module;
    } catch (error) { failures.push(`${candidate}: ${error.message}`); }
  }
  throw new Error(`Playwright unavailable. Set PLAYWRIGHT_MODULE to its package or index.mjs path.\n${failures.join('\n')}`);
}

async function shot(page, name) {
  if (page.isClosed()) return;
  const file = path.join(out, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false, timeout: 20000 });
  const bytes = await readFile(file);
  report.screenshots.push({ name, file, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
}

async function check(name, fn) {
  const start = Date.now();
  try {
    const evidence = await fn();
    report.checks.push({ name, passed: true, elapsedMs: Date.now() - start, evidence: evidence ?? null });
    console.log(`PASS ${name}`);
    return evidence;
  } catch (error) {
    report.checks.push({ name, passed: false, elapsedMs: Date.now() - start, error: error.stack || error.message });
    console.error(`FAIL ${name}: ${error.message}`);
    throw error;
  }
}

const townAsset = (url) => ['/town-assets/','/town-transfer/'].some(prefix=>new URL(url).pathname.includes(prefix));
const gatedAsset = (url) => townAsset(url) && /(?:\/manifest\.json|\/network\.json|\.glb(?:\.gz)?)$/.test(new URL(url).pathname);

async function observedPage(context, scenario) {
  const page = await context.newPage();
  page.setDefaultTimeout(timeout);
  page.setDefaultNavigationTimeout(timeout);
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') report.console.push({ scenario, type: message.type(), text: message.text(), location: message.location() });
  });
  page.on('pageerror', (error) => report.pageErrors.push({ scenario, message: error.message, stack: error.stack }));
  page.on('request', (request) => {
    if (townAsset(request.url())) report.requests.push({ scenario, url: request.url(), method: request.method(), type: request.resourceType(), time: Date.now() });
  });
  page.on('requestfailed', (request) => report.failedRequests.push({ scenario, url: request.url(), error: request.failure()?.errorText, expectedCancellation: /ERR_ABORTED|NS_BINDING_ABORTED|Load request cancel(?:led|ed)|^cancel(?:led|ed)$/i.test(request.failure()?.errorText || '') }));
  page.on('response', (response) => {
    if (townAsset(response.url()) && response.status() >= 400) report.responses.push({ scenario, url: response.url(), status: response.status() });
  });
  await page.addInitScript(() => {
    // Observe the scheduler without changing its timing. A stable town page should have one recurring RAF.
    const nativeRequest = window.requestAnimationFrame.bind(window), nativeCancel = window.cancelAnimationFrame.bind(window);
    const pending = new Map();
    window.__townSmoke = { documentId: `${Date.now()}-${Math.random()}`, pending, requested: 0, fired: 0, retired: null };
    window.requestAnimationFrame = (callback) => {
      let id;
      id = nativeRequest((now) => { pending.delete(id); window.__townSmoke.fired++; callback(now); });
      pending.set(id, { name: callback.name || '(anonymous)' });
      window.__townSmoke.requested++;
      return id;
    };
    window.cancelAnimationFrame = (id) => { pending.delete(id); nativeCancel(id); };
  });
  return page;
}

async function state(page) {
  return page.evaluate(() => {
    const game = window.__webster;
    if (!game) return { present: false, status: document.querySelector('[data-town-status]')?.textContent, rafs: window.__townSmoke.pending.size };
    const engine = game.engine, position = engine.pose()[0], car = game.world.root.parent?.getObjectByName('Your car');
    const expectedWheels = new Set(game.world.manifest.car.wheelNodes.map((name) => name.replace(/[^a-z0-9]/gi, '')));
    const wheels = [];
    car?.traverse((node) => {
      if (!expectedWheels.has(node.name.replace(/[^a-z0-9]/gi, ''))) return;
      const rolling = node.children.find((child) => child.userData.vehicleRole === 'wheel-roll');
      if (car.userData.vehicleVersion && !rolling) throw new Error(`Modeled wheel has no rolling assembly: ${node.name}`);
      let rollingMeshCount = 0;
      rolling?.traverse((child) => { if (child.isMesh) rollingMeshCount++; });
      wheels.push({ name: node.name, quaternion: rolling ? node.quaternion.clone().multiply(rolling.quaternion).toArray() : node.quaternion.toArray(), rollingQuaternion: rolling?.quaternion.toArray(), rollingMeshCount });
    });
    return { present: true, ready: game.ready, edgeId: engine.edgeId, road: engine.edge.name, phase: engine.phase, speed: engine.speed, cruise: engine.cruise, distance: engine.distance, elapsed: engine.elapsed, paused: engine.paused, queued: engine.queued, position, camera: game.cameraMode, frames: game.metrics.frames, contextLost: game.renderer.getContext().isContextLost(), canvasCount: document.querySelectorAll('[data-town-canvas]').length, rafs: window.__townSmoke.pending.size, rafNames: [...window.__townSmoke.pending.values()].map((x) => x.name), wheels, metrics: game.metrics, status: document.querySelector('[data-town-status]')?.textContent };
  });
}

async function waitReady(page) {
  await page.waitForFunction(() => window.__webster?.ready && window.__webster.metrics.frames >= 3, null, { timeout });
  const value = await state(page);
  assert.equal(value.contextLost, false, 'WebGL context is lost');
  assert.equal(value.canvasCount, 1, 'Expected exactly one game canvas');
  assert.ok(value.metrics.triangles > 0, 'No scene triangles were drawn');
  return value;
}

async function pressCanvas(page, key) {
  await page.locator('[data-town-canvas]').focus();
  await page.keyboard.press(key);
}

async function holdUntil(page, key, predicate, argument = null, maximum = 12000) {
  await page.locator('[data-town-canvas]').focus();
  await page.keyboard.down(key);
  try { await page.waitForFunction(predicate, argument, { timeout: maximum }); }
  finally { await page.keyboard.up(key); }
}

async function normalScenario(context) {
  const scenario = 'normal', page = await observedPage(context, scenario);
  let complete = false;
  try {
    await check('No town graph or GLB requests before Play', async () => {
      await page.goto(target.href, { waitUntil: 'domcontentloaded' });
      await page.locator('[data-town-play]').waitFor({ state: 'visible' });
      await page.waitForTimeout(700);
      const early = report.requests.filter((r) => r.scenario === scenario && gatedAsset(r.url));
      assert.deepEqual(early, []);
      assert.equal(await page.evaluate(() => Boolean(window.__webster)), false);
      return { townRequests: report.requests.filter((r) => r.scenario === scenario).map((r) => r.url) };
    });
    await check('Play loads and renders the actual town', async () => {
      await page.locator('[data-town-play]').click();
      const value = await waitReady(page);
      assert.equal(value.speed, 0, 'Drive should start stationary');
      assert.equal(value.wheels.length, 4, 'Car must expose four animated wheel nodes');
      report.release = await page.evaluate(() => {
        const world = window.__webster.world, m = world.manifest;
        return { manifestUrl: world.manifestUrl, sourceSha256: m.source?.sha256 ?? m.sourceSha256, pilot: m.stats.pilot, tiles: m.tiles.length, buildings: m.stats.buildings, treeAnchors: m.trees.sourceAnchors, network: m.network };
      });
      await shot(page, '01-ready');
      return value;
    });
    const beforeDrive = await state(page);
    await check('Arrow Up accelerates and release keeps cruising', async () => {
      await holdUntil(page, 'ArrowUp', () => window.__webster.engine.speed > 1.5);
      const released = await state(page);
      await page.waitForFunction((distance) => window.__webster.engine.distance > distance + 0.4, released.distance, { timeout: 12000 });
      const after = await state(page);
      assert.ok(after.cruise > 0 && after.speed > 0);
      assert.equal(after.paused, false);
      assert.equal(after.wheels.length, 4);
      assert.ok(after.wheels.every((wheel) => {
        const prior = beforeDrive.wheels.find((x) => x.name === wheel.name);
        const orientation = wheel.rollingQuaternion ?? wheel.quaternion;
        const previous = prior?.rollingQuaternion ?? prior?.quaternion;
        return previous && orientation.some((v, i) => Math.abs(v - previous[i]) > 0.001) && (!wheel.rollingQuaternion || wheel.rollingMeshCount > 0);
      }), 'All four wheels should rotate after actual driving');
      await shot(page, '02-cruising');
      return { released, after };
    });
    await check('Arrow Down brakes to a stop', async () => {
      const before = await state(page);
      await holdUntil(page, 'ArrowDown', () => window.__webster.engine.speed < 0.03);
      const after = await state(page);
      assert.ok(after.speed < before.speed && after.cruise === 0);
      return { beforeSpeed: before.speed, after };
    });
    await check('Arrow Left and Right buffer turn choices; S clears the choice', async () => {
      await pressCanvas(page, 'ArrowLeft');
      await page.waitForFunction(() => window.__webster.engine.queued === 'LEFT');
      const left = await state(page);
      await pressCanvas(page, 'ArrowRight');
      await page.waitForFunction(() => window.__webster.engine.queued === 'RIGHT');
      const right = await state(page);
      await pressCanvas(page, 's');
      await page.waitForFunction(() => window.__webster.engine.queued === null);
      return { left: left.queued, right: right.queued, cleared: (await state(page)).queued };
    });
    await check('Space pauses simulation while drawing remains live', async () => {
      await holdUntil(page, 'ArrowUp', () => window.__webster.engine.speed > 0.8);
      await pressCanvas(page, 'Space');
      await page.waitForFunction(() => window.__webster.engine.paused);
      const before = await state(page);
      await page.waitForFunction((frames) => window.__webster.metrics.frames > frames + 2, before.frames);
      const after = await state(page);
      assert.equal(after.distance, before.distance);
      assert.equal(after.elapsed, before.elapsed);
      assert.match(await page.locator('[data-town-pause]').innerText(), /Resume/);
      await pressCanvas(page, 'ArrowDown');
      const brakedWhilePaused = await state(page);
      assert.equal(brakedWhilePaused.paused, true, 'Brake must not resume a paused drive');
      assert.equal(brakedWhilePaused.distance, before.distance);
      await shot(page, '03-paused');
      await pressCanvas(page, 'Space');
      await page.waitForFunction(() => !window.__webster.engine.paused);
      return { before, after };
    });
    const outsideLink = await page.locator('a[href]').evaluateAll((links) => {
      const root = document.querySelector('[data-town-root]');
      return links.findIndex((link) => {
        const url = new URL(link.href, location.href), rect = link.getBoundingClientRect();
        return !root.contains(link) && url.origin === location.origin && url.pathname !== location.pathname && !url.hash && !link.hasAttribute('download') && !link.hasAttribute('data-astro-reload') && link.target !== '_blank' && rect.width > 0 && rect.height > 0;
      });
    });
    assert.ok(outsideLink >= 0, 'Site must provide a visible navigation link outside the game');
    await check('Leaving game focus pauses cruise', async () => {
      await page.locator('a[href]').nth(outsideLink).focus();
      await page.waitForFunction(() => window.__webster.engine.paused);
      const before = await state(page);
      await page.waitForTimeout(350);
      const after = await state(page);
      assert.equal(after.distance, before.distance);
      return after;
    });
    await check('Pause button resumes and pauses the drive', async () => {
      await page.locator('[data-town-pause]').click();
      await page.waitForFunction(() => !window.__webster.engine.paused);
      await page.locator('[data-town-pause]').click();
      await page.waitForFunction(() => window.__webster.engine.paused);
      return await state(page);
    });
    await check('Camera button and C cycle camera modes', async () => {
      const initial = (await state(page)).camera;
      await page.locator('[data-town-camera]').click();
      await page.waitForFunction((prior) => window.__webster.cameraMode !== prior, initial);
      const buttonMode = (await state(page)).camera;
      await pressCanvas(page, 'c');
      await page.waitForFunction((prior) => window.__webster.cameraMode !== prior, buttonMode);
      const keyboardMode = (await state(page)).camera;
      assert.notEqual(keyboardMode, initial);
      await pressCanvas(page, 'c');
      assert.equal((await state(page)).camera, initial);
      return { initial, buttonMode, keyboardMode };
    });
    await check('Low, High and Automatic quality controls apply', async () => {
      const evidence = [];
      for (const quality of ['low', 'high', 'auto']) {
        await page.locator('[data-town-quality]').selectOption(quality);
        const applied = await page.evaluate(() => ({ selected: document.querySelector('[data-town-quality]').value, saved: localStorage.getItem('webster-quality'), pixelRatio: window.__webster.renderer.getPixelRatio(), shadows: window.__webster.renderer.shadowMap.enabled }));
        assert.equal(applied.selected, quality); assert.equal(applied.saved, quality);
        if (quality === 'low') { assert.equal(applied.shadows, false); assert.ok(applied.pixelRatio <= 1); }
        if (quality === 'high') assert.equal(applied.shadows, true);
        evidence.push(applied);
      }
      return evidence;
    });
    await check('Sound button toggles only after user activation', async () => {
      const sound = page.locator('[data-town-sound]');
      assert.equal(await sound.getAttribute('aria-pressed'), 'false');
      await sound.click();
      await page.waitForFunction(() => document.querySelector('[data-town-sound]').getAttribute('aria-pressed') === 'true');
      await sound.click();
      await page.waitForFunction(() => document.querySelector('[data-town-sound]').getAttribute('aria-pressed') === 'false');
      return { text: await sound.innerText() };
    });
    await check('Fullscreen button enters and exits fullscreen or expanded fallback', async () => {
      await page.locator('[data-town-fullscreen]').click();
      await page.waitForFunction(() => Boolean(document.fullscreenElement) || document.querySelector('[data-town-root]').classList.contains('town-expanded'));
      const entered = await page.evaluate(() => ({ fullscreen: Boolean(document.fullscreenElement), expanded: document.querySelector('[data-town-root]').classList.contains('town-expanded') }));
      await page.locator('[data-town-fullscreen]').click();
      await page.waitForFunction(() => !document.fullscreenElement && !document.querySelector('[data-town-root]').classList.contains('town-expanded'));
      return entered;
    });
    if (report.release.pilot === false) {
      for (const key of ['DOWNTOWN', 'LAKE', 'BEACH', 'RANCH', 'BARTLETT', 'SCHOOL']) await check(`Starting location ${key} loads its street`, async () => {
        await page.evaluate(() => { window.__townSmoke.previousEngine = window.__webster.engine; });
        // Selecting an already-selected option may not emit change, so use its matching real keyboard shortcut for Main Street.
        if (await page.locator('[data-town-location]').inputValue() === key) await pressCanvas(page, '1');
        else await page.locator('[data-town-location]').selectOption(key);
        await page.waitForFunction((selected) => window.__webster.engine !== window.__townSmoke.previousEngine && document.querySelector('[data-town-location]').value === selected, key);
        const value = await state(page);
        assert.equal(value.speed, 0); assert.equal(value.distance, 0);
        const readiness = await page.evaluate(() => {
          const game = window.__webster, [x, y, z] = game.engine.pose()[0];
          return game.world.isReadyAt([x, z, -y]);
        });
        assert.equal(readiness, true);
        await page.waitForFunction((frames) => window.__webster.metrics.frames > frames + 2, value.frames);
        await shot(page, `location-${key.toLowerCase()}`);
        return value;
      });
    } else report.skipped.push({ name: 'Five full-town teleports', reason: 'Pilot scenery release; run this same harness against the full-town manifest before publishing.' });
    await check('Exactly one live game canvas and recurring RAF', async () => {
      await page.waitForFunction(() => window.__townSmoke.pending.size === 1, null, { timeout: 10000 });
      const value = await state(page);
      assert.equal(value.canvasCount, 1); assert.equal(value.rafs, 1);
      return value;
    });
    await check('Astro navigation disposes the old loop; history back starts one new session', async () => {
      const documentId = await page.evaluate(() => { window.__townSmoke.retired = window.__webster; return window.__townSmoke.documentId; });
      const away = page.locator('a[href]').nth(outsideLink), href = await away.getAttribute('href');
      await away.click();
      await page.waitForURL((url) => url.pathname !== target.pathname);
      await page.waitForFunction(() => !window.__webster);
      assert.equal(await page.evaluate(() => window.__townSmoke.documentId), documentId, 'Navigation did not exercise Astro client navigation');
      const retired = await page.evaluate(() => ({ ready: window.__townSmoke.retired.ready, frames: window.__townSmoke.retired.metrics.frames, children: window.__townSmoke.retired.world.root.children.length }));
      assert.equal(retired.ready, false); assert.equal(retired.children, 0);
      await page.waitForTimeout(400);
      assert.equal(await page.evaluate(() => window.__townSmoke.retired.metrics.frames), retired.frames, 'Retired driving RAF continued after navigation');
      const requestMark = report.requests.length;
      await page.goBack({ waitUntil: 'domcontentloaded' });
      await page.waitForURL((url) => url.pathname.replace(/\/$/, '') === target.pathname.replace(/\/$/, ''));
      await page.locator('[data-town-play]').waitFor({ state: 'visible' });
      assert.equal(await page.evaluate(() => window.__townSmoke.documentId), documentId, 'History back did not exercise Astro client navigation');
      assert.equal(await page.evaluate(() => Boolean(window.__webster)), false);
      assert.deepEqual(report.requests.slice(requestMark).filter((r) => gatedAsset(r.url)), []);
      await page.locator('[data-town-play]').click();
      const fresh = await waitReady(page);
      await page.waitForFunction(() => window.__townSmoke.pending.size === 1, null, { timeout: 10000 });
      assert.equal(await page.evaluate(() => window.__townSmoke.retired.metrics.frames), retired.frames);
      assert.equal(fresh.canvasCount, 1);
      await shot(page, '04-history-return');
      return { href, retired, fresh: await state(page) };
    });
    if (checkMissing) await check('An absent asset returns HTTP 404 rather than app HTML with status 200', async () => {
      const manifestUrl = report.release.manifestUrl, missing = new URL(`missing-smoke-${randomUUID()}.glb`, manifestUrl).href;
      const response = await context.request.get(missing, { failOnStatusCode: false });
      const evidence = { url: missing, status: response.status(), contentType: response.headers()['content-type'], bytes: (await response.body()).length };
      assert.equal(response.status(), 404);
      return evidence;
    });
    else report.skipped.push({ name: 'Missing asset HTTP 404', reason: 'CHECK_MISSING_ASSET=0; must be checked against served preview/deployment before publishing.' });
    complete = true;
  } catch (error) {
    report.scenarios.push({ name: scenario, complete: false, error: error.message });
    try { await shot(page, 'failure-normal'); report.failureState = await state(page); } catch {}
  } finally {
    if (complete) report.scenarios.push({ name: scenario, complete: true });
    await context.close();
  }
}

async function retryScenario(context) {
  const scenario = 'retry', page = await observedPage(context, scenario);
  let injectedUrl, complete = false;
  try {
    await page.route('**/town-assets/**', async (route) => {
      if (!injectedUrl && gatedAsset(route.request().url())) {
        injectedUrl = route.request().url();
        report.injectedFailure = { url: injectedUrl, status: 503, scenario };
        await route.fulfill({ status: 503, contentType: 'text/plain', body: 'Intentional one-shot browser smoke test failure.' });
      } else await route.continue();
    });
    await check('A one-shot initial asset HTTP 503 exposes an enabled Try again button', async () => {
      await page.goto(target.href, { waitUntil: 'domcontentloaded' });
      await page.locator('[data-town-play]').click();
      await page.waitForFunction(() => {
        const button = document.querySelector('[data-town-play]');
        return button && !button.disabled && /Try again/i.test(button.textContent) && !document.querySelector('[data-town-intro]').hidden;
      });
      assert.ok(injectedUrl);
      assert.equal(await page.evaluate(() => Boolean(window.__webster)), false);
      await shot(page, '05-injected-503');
      return { injectedUrl, status: await page.locator('[data-town-status]').innerText() };
    });
    await check('Try again creates a rendering, keyboard-drivable session on the same page', async () => {
      const documentId = await page.evaluate(() => window.__townSmoke.documentId);
      await page.locator('[data-town-play]').click();
      const ready = await waitReady(page);
      await holdUntil(page, 'ArrowUp', () => window.__webster.engine.speed > 0.5 && window.__webster.engine.distance > 0.15);
      await pressCanvas(page, 'Space');
      await page.waitForFunction(() => window.__webster.engine.paused);
      assert.equal(await page.evaluate(() => window.__townSmoke.documentId), documentId);
      await page.waitForFunction(() => window.__townSmoke.pending.size === 1, null, { timeout: 10000 });
      const after = await state(page);
      assert.equal(after.canvasCount, 1); assert.equal(after.contextLost, false);
      assert.ok(after.frames > ready.frames);
      await shot(page, '06-retry-success');
      return { ready, after };
    });
    complete = true;
  } catch (error) {
    report.scenarios.push({ name: scenario, complete: false, error: error.message });
    try { await shot(page, 'failure-retry'); } catch {}
  } finally {
    if (complete) report.scenarios.push({ name: scenario, complete: true });
    await context.close();
  }
}

try {
  assert.ok(Number.isFinite(timeout) && timeout > 0, 'TOWN_TIMEOUT_MS must be positive');
  assert.ok(['chromium', 'firefox', 'webkit'].includes(browserName), 'BROWSER must be chromium, firefox, or webkit');
  await mkdir(out, { recursive: true });
  // PLAYWRIGHT_BROWSERS_PATH is intentionally left intact before module import and launch.
  const playwright = await playwrightModule();
  const launchOptions = { headless };
  if (browserName === 'chromium') {
    let executablePath = process.env.CHROME_EXECUTABLE;
    if (!executablePath && process.platform === 'darwin') {
      const installed = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
      try { await stat(installed); executablePath = installed; } catch { /* Use Playwright-installed Chromium. */ }
    }
    report.configuration.chromeExecutable = executablePath || 'Playwright Chromium';
    launchOptions.executablePath = executablePath;
    launchOptions.args = ['--disable-dev-shm-usage'];
  }
  browser = await playwright[browserName].launch(launchOptions);
  report.browserVersion = browser.version();
  const settings = { viewport: report.configuration.viewport, deviceScaleFactor: 1, serviceWorkers: 'block' };
  await normalScenario(await browser.newContext(settings));
  await retryScenario(await browser.newContext(settings));
  await check('No unexpected JavaScript, console, or town asset errors', async () => {
    const unexpectedConsole = report.console.filter((entry) => entry.type === 'error' && !(entry.scenario === 'retry' && /503/.test(entry.text) && (!entry.location.url || entry.location.url === report.injectedFailure?.url)));
    const unexpectedResponses = report.responses.filter((entry) => !(entry.scenario === 'retry' && entry.status === 503 && entry.url === report.injectedFailure?.url));
    const unexpectedRequests = report.failedRequests.filter((entry) => townAsset(entry.url) && !entry.expectedCancellation);
    assert.deepEqual(report.pageErrors, []);
    assert.deepEqual(unexpectedConsole, []);
    assert.deepEqual(unexpectedResponses, []);
    assert.deepEqual(unexpectedRequests, []);
    return { expected503: report.injectedFailure, cancelledRequests: report.failedRequests.filter((r) => r.expectedCancellation).length, warnings: report.console.filter((r) => r.type === 'warning').length };
  });
} catch (error) {
  report.fatalError = error.stack || error.message;
  console.error(error.stack || error.message);
} finally {
  if (browser) await browser.close();
  report.finishedAt = new Date().toISOString();
  report.passed = !report.fatalError && report.scenarios.length === 2 && report.scenarios.every((s) => s.complete) && report.checks.every((c) => c.passed);
  report.summary = { passedChecks: report.checks.filter((c) => c.passed).length, failedChecks: report.checks.filter((c) => !c.passed).length, skipped: report.skipped.length, screenshots: report.screenshots.length };
  await mkdir(out, { recursive: true });
  await writeFile(path.join(out, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Browser smoke ${report.passed ? 'PASS' : 'FAIL'}: ${JSON.stringify(report.summary)}; ${path.join(out, 'report.json')}`);
  if (!report.passed) process.exitCode = 1;
}
