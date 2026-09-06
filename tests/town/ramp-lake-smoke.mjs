import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const target = process.env.TOWN_URL;
if (!target) throw new Error('Set TOWN_URL');
const out = process.env.TOWN_OUT_DIR || '/private/tmp/webster-ramp-lake-acceptance/browser';
const { chromium } = await import(pathToFileURL('/Users/andy/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs').href);
await mkdir(out, { recursive: true });
const report = { url: target, passed: false, checks: [], pageErrors: [], assetErrors: [], testSetup: 'Initial positions use real mapped lanes through the debug engine; turns use browser inputs and normal rendered simulation time.' };
const browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const page = await browser.newPage({ viewport: { width: 1280, height: 850 }, serviceWorkers: 'block' });
page.setDefaultTimeout(90000);
page.on('pageerror', error => report.pageErrors.push(error.message));
page.on('response', response => { if (/\/town-(assets|transfer)\//.test(response.url()) && response.status() >= 400) report.assetErrors.push({ url: response.url(), status: response.status() }); });
try {
  await page.goto(target, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-town-play]').click();
  await page.waitForFunction(() => window.__webster?.ready && window.__webster.metrics.frames >= 3);
  for (const [from, to, name, exact] of [
    [2628, 2438, 'East Main Street left onto I-395 southbound', false],
    [2245, 2422, 'Cudworth Road left onto I-395 northbound', false],
    [2683, 2128, 'Thompson Road sharp left onto Lake Street', false],
    [2685, 2126, 'Thompson Road earlier left onto Lake Street', false],
    [2571, 2302, 'South Main Street left onto Lake Street', false],
    [2431, 2627, 'Exact left branch from the I-395 exit onto East Main', true],
  ]) {
    await page.evaluate(async id => {
      const g = window.__webster, e = g.engine;
      e.paused = true; e.edgeId = id; e.s = Math.max(0, g.graph.paths.get(id).length - 55);
      e.phase = 'ROAD'; e.connection = null; e.connectionS = 0;
      e.speed = e.cruise = e.acceleration = 0; e.cruiseAtLimit = false; e.endOfRoute = false;
      e.queue(null); e.history = [];
      const p = e.pose()[0]; await g.world.prepareAt([p[0], p[2], -p[1]]);
    }, from);
    const option = page.locator(`[data-town-choices] button[data-edge="${to}"]`);
    await option.waitFor();
    assert.match(await option.getAttribute('aria-label'), /^Left onto /);
    if (exact) await option.click();
    else { await page.locator('[data-town-canvas]').focus(); await page.keyboard.press('ArrowLeft'); }
    const selected = await page.evaluate(() => window.__webster.engine.nextJunction()?.selected?.edgeId);
    assert.equal(selected, to, name);
    await page.keyboard.press('ArrowUp');
    await page.waitForFunction(({ from, to }) => window.__webster.engine.history.some(pair => pair[0] === from && pair[1] === to), { from, to }, { timeout: 60000 });
    await page.keyboard.press('Space');
    const evidence = await page.evaluate(() => { const e = window.__webster.engine; return { edge: e.edgeId, road: e.edge.name, history: e.history, queued: e.queued, queuedEdge: e.queuedEdge, pose: e.pose(), frames: window.__webster.metrics.frames }; });
    assert.equal(evidence.queued, null); assert.equal(evidence.queuedEdge, null);
    report.checks.push({ name, passed: true, from, to, evidence });
    console.log('PASS ' + name);
  }
  assert.deepEqual(report.pageErrors, []); assert.deepEqual(report.assetErrors, []);
  report.passed = true;
} catch (error) { report.error = error.stack; console.error(error.stack); process.exitCode = 1; }
finally {
  await page.evaluate(() => window.__webster?.dispose()).catch(() => {});
  await browser.close();
  await writeFile(out + '/report.json', JSON.stringify(report, null, 2) + '\n');
  console.log('Report ' + out + '/report.json');
}
