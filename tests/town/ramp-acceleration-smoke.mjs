import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const target = process.env.TOWN_URL;
if (!target) throw new Error('Set TOWN_URL');
const out = process.env.TOWN_OUT_DIR || '/private/tmp/webster-ramp-acceleration-acceptance/browser';
const { chromium } = await import(pathToFileURL('/Users/andy/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs').href);
await mkdir(out, { recursive: true });
const report = { url: target, passed: false, checks: [], errors: [], samples: [], testSetup: 'Initial positions use real mapped lanes through the debug engine. Acceleration, turning and braking use browser inputs and normal rendered time.' };
const browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const page = await browser.newPage({ viewport: { width: 1280, height: 850 }, serviceWorkers: 'block' });
page.setDefaultTimeout(120000);
page.on('pageerror', error => report.errors.push(error.message));
page.on('response', response => { if (/\/town-(assets|transfer)\//.test(response.url()) && response.status() >= 400) report.errors.push(`${response.status()} ${response.url()}`); });
const place = async (id, s = 0, speed = 0) => {
  await page.evaluate(async ({ id, s, speed }) => {
    const g = window.__webster, e = g.engine;
    e.paused = true; e.edgeId = id; e.s = s; e.phase = 'ROAD'; e.connection = null; e.connectionS = 0;
    e.speed = e.cruise = speed * 0.44704; e.acceleration = 0; e.cruiseAtLimit = false; e.endOfRoute = false;
    e.queue(null); e.history = [];
    const p = e.pose()[0]; await g.world.prepareAt([p[0], p[2], -p[1]]);
  }, { id, s, speed });
  await page.locator('[data-town-canvas]').focus();
};
try {
  await page.goto(target, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-town-play]').click();
  await page.waitForFunction(() => window.__webster?.ready && window.__webster.metrics.frames >= 3);
  await place(2628);
  await page.keyboard.press('ArrowLeft');
  assert.equal(await page.evaluate(() => window.__webster.engine.nextJunction()?.selected?.edgeId), 2438);
  await page.evaluate(() => {
    window.__rampSamples = [];
    window.__rampTimer = setInterval(() => {
      const e = window.__webster.engine;
      window.__rampSamples.push({ edge: e.edgeId, phase: e.phase, s: e.s, speed: e.speed / 0.44704, target: (e.rampTarget() ?? e.roadLimit()) / 0.44704, label: document.querySelector('[data-town-limit-label]').textContent });
    }, 100);
  });
  await page.keyboard.press('ArrowUp');
  await page.waitForFunction(() => window.__webster.engine.history.some(pair => pair[0] === 2451 && pair[1] === 2));
  await page.keyboard.press('Space');
  report.samples = await page.evaluate(() => { clearInterval(window.__rampTimer); return window.__rampSamples; });
  const ramp = report.samples.filter(sample => [2438, 2437, 2451].includes(sample.edge) && sample.phase === 'ROAD');
  assert.ok(ramp.length > 20);
  assert.ok(ramp[0].speed < 30);
  assert.ok(Math.max(...ramp.map(sample => sample.speed)) > 63);
  assert.ok(ramp.some(sample => sample.speed > 35 && sample.speed < 50 && sample.label === 'Ramp target'));
  for (const id of [2438, 2437, 2451]) assert.ok(ramp.some(sample => sample.edge === id));
  report.checks.push({ name: 'Real drive enters the ramp slowly, accelerates across its segments, and reaches highway speed before merging', passed: true, firstRampMph: ramp[0].speed, peakRampMph: Math.max(...ramp.map(sample => sample.speed)) });
  console.log('PASS entrance-ramp acceleration through the highway merge');

  await place(2451, 100, 42);
  await page.keyboard.press('ArrowUp');
  await page.keyboard.down('ArrowDown');
  await page.waitForFunction(() => !window.__webster.engine.cruiseAtLimit && window.__webster.engine.speed / 0.44704 < 34);
  await page.keyboard.up('ArrowDown');
  const requested = await page.evaluate(() => window.__webster.engine.cruise);
  await page.waitForFunction(requested => window.__webster.engine.speed < requested + 0.25, requested);
  assert.equal(await page.evaluate(() => window.__webster.engine.cruiseAtLimit), false);
  await page.keyboard.press('Space');
  report.checks.push({ name: 'Brake cancels automatic ramp acceleration', passed: true });
  console.log('PASS ramp braking');

  await place(2427, 30);
  await page.waitForFunction(() => document.querySelector('[data-town-limit-label]').textContent === 'Road limit');
  const exit = await page.evaluate(() => ({ ramp: window.__webster.engine.rampTarget(), limit: window.__webster.engine.roadLimit() / 0.44704, shown: document.querySelector('[data-town-limit]').textContent }));
  assert.equal(exit.ramp, undefined); assert.ok(exit.limit < 21); assert.equal(exit.shown, '20 mph');
  report.checks.push({ name: 'Offramps retain their own slower road limit', passed: true, evidence: exit });
  assert.deepEqual(report.errors, []);
  report.passed = true;
} catch (error) { report.error = error.stack; console.error(error.stack); process.exitCode = 1; }
finally {
  await page.evaluate(() => { clearInterval(window.__rampTimer); window.__webster?.dispose(); }).catch(() => {});
  await browser.close();
  await writeFile(out + '/report.json', JSON.stringify(report, null, 2) + '\n');
  console.log('Report ' + out + '/report.json');
}
