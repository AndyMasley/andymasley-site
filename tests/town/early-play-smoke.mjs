#!/usr/bin/env node
/** Reproduce an early real Play click while the poster delays Astro's initial page-load. */
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const target=process.env.TOWN_URL;if(!target)throw new Error('Set TOWN_URL to a running candidate.');
const out=process.env.TOWN_OUT_DIR||'/private/tmp/webster-early-play-acceptance';await mkdir(out,{recursive:true});
const moduleName=process.env.PLAYWRIGHT_MODULE||'/Users/andy/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const {chromium}=await import(moduleName.startsWith('/')?pathToFileURL(moduleName).href:moduleName);
const report={url:target,started:new Date().toISOString(),configuration:{realRenderedButton:true,delayedPoster:true,delayedDynamicMain:true,syntheticInitialPageLoad:false},events:[],checks:[],pageErrors:[],badResponses:[],passed:false};
let browser,releasePoster,releaseMain;
const posterGate=new Promise(resolve=>{releasePoster=resolve;}),mainGate=new Promise(resolve=>{releaseMain=resolve;});
let posterRequested=false,mainRequested=false;
const state=page=>page.evaluate(()=>({documentState:document.readyState,events:window.__earlyPlayEvents,ready:window.__webster?.ready??false,frames:window.__webster?.metrics.frames??0,playDisabled:document.querySelector('[data-town-play]')?.disabled,playText:document.querySelector('[data-town-play]')?.textContent,status:document.querySelector('[data-town-status]')?.textContent,canvases:document.querySelectorAll('[data-town-canvas]').length}));
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_EXECUTABLE||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 const context=await browser.newContext({viewport:{width:1280,height:850},serviceWorkers:'block'}),page=await context.newPage();page.setDefaultTimeout(30000);
 await page.addInitScript(()=>{window.__earlyPlayEvents=[];for(const name of ['load','astro:page-load','astro:before-swap']){const target=name==='load'?window:document;target.addEventListener(name,()=>window.__earlyPlayEvents.push({name,time:performance.now()}));}});
 page.on('pageerror',error=>report.pageErrors.push(error.message));page.on('response',response=>{if(response.status()>=400)report.badResponses.push({url:response.url(),status:response.status()});});
 await context.route(url=>/webster-poster[^/]*\.(?:webp|png|jpg)$/.test(url.pathname),async route=>{posterRequested=true;await posterGate;await route.continue();});
 await context.route(url=>/\/(?:_astro\/main\.[^/]+\.js|src\/lib\/town\/main\.ts)$/.test(url.pathname),async route=>{mainRequested=true;await mainGate;await route.continue();});
 await page.goto(target,{waitUntil:'domcontentloaded'});await page.locator('[data-town-play]').waitFor({state:'visible'});
 assert.ok(posterRequested,'The real poster request must be outstanding');report.beforePlay=await state(page);assert.equal(report.beforePlay.events.filter(e=>e.name==='astro:page-load').length,0);
 await page.locator('[data-town-play]').click();
 for(let i=0;i<100&&!mainRequested;i++)await page.waitForTimeout(20);
 assert.ok(mainRequested,'Play must begin the real dynamic game import before the page-load event');report.duringImport=await state(page);assert.equal(report.duringImport.playDisabled,true);
 releasePoster();await page.waitForFunction(()=>window.__earlyPlayEvents.some(e=>e.name==='astro:page-load'),null,{timeout:15000});
 report.afterLatePageLoad=await state(page);releaseMain();
 try{await page.waitForFunction(()=>window.__webster?.ready&&window.__webster.metrics.frames>=3,null,{timeout:Number(process.env.TOWN_READY_TIMEOUT_MS||45000)});}catch(error){report.stalled=await state(page);throw error;}
 report.ready=await state(page);assert.equal(report.ready.canvases,1);report.checks.push({name:'Early Play survives the natural late Astro page-load while import is pending',passed:true});
 await page.evaluate(()=>{window.__earlyPlaySession=window.__webster;document.dispatchEvent(new Event('astro:page-load'));});
 await page.waitForTimeout(150);assert.equal(await page.evaluate(()=>window.__webster===window.__earlyPlaySession&&window.__webster.ready&&!window.__webster.renderer.getContext().isContextLost()),true);
 report.checks.push({name:'Repeated page-load preserves the existing same-root game session',passed:true});
 await page.locator('[data-town-canvas]').focus();await page.keyboard.press('ArrowUp');const distance=await page.evaluate(()=>window.__webster.engine.distance);
 await page.waitForFunction(before=>window.__webster.engine.distance>before+.2,distance);report.checks.push({name:'The early-started game remains keyboard drivable',passed:true});
 report.final=await state(page);assert.deepEqual(report.pageErrors,[]);assert.deepEqual(report.badResponses,[]);report.passed=true;
}catch(error){report.error=error.stack;process.exitCode=1;console.error(error.stack);}
finally{releasePoster?.();releaseMain?.();await browser?.close();report.finished=new Date().toISOString();await writeFile(out+'/report.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:report.passed,checks:report.checks,stalled:report.stalled,report:out+'/report.json'}));}
