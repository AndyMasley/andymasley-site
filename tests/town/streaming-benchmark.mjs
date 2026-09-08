#!/usr/bin/env node
/** Candidate diagnostics on an already frozen server. These measurements are
 * not physical-device or public-host acceptance unless run in those conditions.
 * TOWN_URL required; COLD_RUNS=3; DRIVE_SECONDS=180; DRIVE_MBPS=0 (unthrottled).
 * Cold Chromium CDP network: 10 Mbps/40 ms. DRIVE_MBPS=10 repeats that during driving. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const target = process.env.TOWN_URL;
if (!target) throw new Error('Set TOWN_URL to an already running frozen build.');
const out = path.resolve(process.env.TOWN_OUT_DIR || 'artifacts/town-streaming-benchmark');
const runs = Math.max(1, Number(process.env.COLD_RUNS || 3)), seconds = Math.max(0, Number(process.env.DRIVE_SECONDS || 180));
const driveMbps = Number(process.env.DRIVE_MBPS || 0);
const exploreDrive = process.env.DRIVE_EXPLORE === '1';
if (!Number.isFinite(driveMbps) || driveMbps < 0) throw new Error('DRIVE_MBPS must be a non-negative number.');
const imported = process.env.PLAYWRIGHT_MODULE || 'playwright';
const { chromium } = await import(imported.startsWith('/') ? pathToFileURL(imported).href : imported);
await mkdir(out, { recursive: true });
const report = { version: 1, url: target, began: new Date().toISOString(), scope: 'Frozen candidate diagnostics. Headless desktop Chromium; not physical mobile, thermal or public-host acceptance.', configuration: { coldRuns: runs, coldMbps: 10, latencyMs: 40, driveSeconds: seconds, exploreDrive, driveMbps: driveMbps || null, driveNetwork: driveMbps ? `${driveMbps} Mbps / 40 ms` : 'unthrottled', viewport: { width: 1280, height: 850 }, competingWork: process.env.COMPETING_WORK || 'not attested' }, cold: [], drive: null, functionalPass: false };
const checksum = b => createHash('sha256').update(b).digest('hex');
const pct = (values, p) => [...values].sort((a,b)=>a-b)[Math.min(values.length-1,Math.max(0,Math.ceil(values.length*p)-1))] ?? null;
let browser;
async function snapshot(page, includeFrames = false) {
  return page.evaluate(includeFrames => {
    const g = window.__webster;
    if (!g) return { ready: false, status: document.querySelector('[data-town-status]')?.textContent };
    const gl = g.renderer.getContext(), extension = gl.getExtension('WEBGL_debug_renderer_info');
    return { ready: g.ready, metrics: g.metrics, streaming: g.world.streamingResources(), finish: g.world.finishResources(),
      edge: g.engine.edgeId, position: g.engine.s, distance: g.engine.distance, speed: g.engine.speed, paused: g.engine.paused, end: g.engine.endOfRoute,
      status: document.querySelector('[data-town-status]')?.textContent, loaded: [...g.world.loaded].map(([id,t])=>({id,level:t.level,visible:t.group.visible})),
      contextLost: gl.isContextLost(), renderInfo: { calls:g.renderer.info.render.calls, triangles:g.renderer.info.render.triangles },
      renderer: extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
      ...(includeFrames ? { observedFrames: window.__streamBenchmark.frames.slice(), renderedIntervals: window.__streamBenchmark.renderedIntervals?.slice()??[], movingRenderedIntervals: window.__streamBenchmark.movingRenderedIntervals?.slice()??[], longTasks: window.__streamBenchmark.tasks.slice() } : {}),
      heap: performance.memory ? { used:performance.memory.usedJSHeapSize,total:performance.memory.totalJSHeapSize,limit:performance.memory.jsHeapSizeLimit } : null };
  }, includeFrames);
}
async function setup(mbps) {
  const context = await browser.newContext({ viewport:report.configuration.viewport, serviceWorkers:'block' });
  const page = await context.newPage(); page.setDefaultTimeout(90000);
  const errors = [], requests = new Map(), cdp = await context.newCDPSession(page);
  page.on('pageerror', error => errors.push(error.message));
  await cdp.send('Network.enable'); await cdp.send('Network.setCacheDisabled', { cacheDisabled:true });
  if (mbps) await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:40,downloadThroughput:mbps*1_000_000/8,uploadThroughput:Math.min(mbps,5)*1_000_000/8});
  cdp.on('Network.requestWillBeSent',e=>requests.set(e.requestId,{url:e.request.url,type:e.type,start:Date.now(),bytes:0}));
  cdp.on('Network.responseReceived',e=>{const row=requests.get(e.requestId);if(row){row.status=e.response.status;row.cached=!!e.response.fromDiskCache;}});
  cdp.on('Network.dataReceived',e=>{const row=requests.get(e.requestId);if(row)row.bytes+=e.encodedDataLength;});
  cdp.on('Network.loadingFinished',e=>{const row=requests.get(e.requestId);if(row){row.bytes=e.encodedDataLength;row.end=Date.now();}});
  cdp.on('Network.loadingFailed',e=>{const row=requests.get(e.requestId);if(row){row.error=e.errorText;row.end=Date.now();}});
  await page.addInitScript(()=>{
    const probe=window.__streamBenchmark={frames:[],tasks:[],record:false,last:0};
    new PerformanceObserver(list=>{for(const item of list.getEntries())probe.tasks.push({start:item.startTime,duration:item.duration});}).observe({entryTypes:['longtask']});
    function frame(now){if(probe.record&&probe.last)probe.frames.push(now-probe.last);probe.last=now;requestAnimationFrame(frame);}requestAnimationFrame(frame);
  });
  return {context,page,cdp,errors,requests};
}
try {
  browser = await chromium.launch({headless:process.env.HEADED!=='1',executablePath:process.env.CHROME_EXECUTABLE || (process.platform==='darwin'?'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome':undefined)});
  report.browserVersion = browser.version();
  for(let i=0;i<runs;i++) {
    const session=await setup(10), {page,context,errors,requests}=session;
    const row={run:i+1,passed:false};report.cold.push(row);
    try {
      await page.goto(target,{waitUntil:'domcontentloaded'});
      await page.locator('[data-town-play]').waitFor({state:'visible'});
      row.beforePlay=[...requests.values()].filter(r=>/\/town-(?:assets|transfer|evidence|finish|surfaces|roadside)\/.+\.(?:json|glb)(?:\.gz)?$/.test(new URL(r.url).pathname));
      assert.equal(row.beforePlay.length,0,'Heavy scenery requested before Play');
      const started=Date.now();await page.locator('[data-town-play]').click();
      await page.waitForFunction(()=>window.__webster?.ready&&window.__webster.metrics.frames>=3);
      row.clickToReadyMs=Date.now()-started;row.ready=await snapshot(page);
      row.requestsAtReady=[...requests.values()].map(r=>({...r}));
      row.wireBytesAtReady=row.requestsAtReady.reduce((n,r)=>n+r.bytes,0);
      assert.equal(row.ready.contextLost,false);assert.deepEqual(errors,[]);
      row.passed=true;console.log(JSON.stringify({cold:i+1,ms:row.clickToReadyMs,wireBytes:row.wireBytesAtReady,pending:row.ready.metrics.pending}));
    } catch(error){row.error=error.stack;row.failureState=await snapshot(page).catch(()=>null);throw error;}
    finally {row.pageErrors=errors;await page.evaluate(()=>window.__webster?.dispose()).catch(()=>{});await context.close();await writeFile(path.join(out,`cold-${i+1}.json`),JSON.stringify(row,null,2)+'\n');}
  }
  const values=report.cold.map(r=>r.clickToReadyMs);report.coldSummary={medianMs:pct(values,.5),p95Ms:pct(values,.95),count:values.length,localGoalMet:pct(values,.5)<=8000&&pct(values,.95)<=12000,note:'Three runs identify regressions; they do not establish a stable population p95 or public-host acceptance.'};
  if(seconds>0){
    const {page,context,errors,requests}=await setup(driveMbps),row={samples:[],actions:[],passed:false};report.drive=row;
    try {
      await page.goto(target,{waitUntil:'domcontentloaded'});await page.locator('[data-town-play]').click();await page.waitForFunction(()=>window.__webster?.ready&&window.__webster.metrics.frames>=3);
      row.initial=await snapshot(page);await page.locator('[data-town-canvas]').focus();await page.keyboard.press('ArrowUp');
      await page.waitForFunction(()=>window.__webster.engine.distance>.1);
      await page.evaluate(()=>{const g=window.__webster,p=window.__streamBenchmark;p.record=true;p.frames.length=0;p.tasks.length=0;p.last=0;p.renderedIntervals=[];p.movingRenderedIntervals=[];p.lastRender=0;p.lastMovingRender=0;const render=g.renderer.render.bind(g.renderer);g.renderer.render=(...args)=>{const now=performance.now();if(p.record){if(p.lastRender)p.renderedIntervals.push(now-p.lastRender);p.lastRender=now;if(!g.engine.paused&&g.engine.speed>.1){if(p.lastMovingRender)p.movingRenderedIntervals.push(now-p.lastMovingRender);p.lastMovingRender=now;}else p.lastMovingRender=0;}return render(...args);};});
      const started=Date.now(), visits=new Map();let previousEdge=null,decision=null,nextSample=0;
      while(Date.now()-started<seconds*1000){
        await page.waitForTimeout(Math.max(1,Math.min(exploreDrive?500:10000,seconds*1000-(Date.now()-started))));
        if(exploreDrive){
          // Read the normal UI/engine state; select through the same visible
          // button a player uses. No teleport, queue mutation or speed override.
          const state=await page.evaluate(()=>{const e=window.__webster.engine,n=e.nextJunction();return {edge:e.phase==='TURN'?e.connection.nextId:e.edgeId,junction:n?.edgeId,distance:n?.distance,choices:n?.choices.filter(c=>{const b=document.querySelector(`[data-town-choices] button[data-edge="${c.edgeId}"]`);return b&&!b.disabled&&b.getClientRects().length;})??[]};});
          if(state.edge!==previousEdge){visits.set(state.edge,(visits.get(state.edge)??0)+1);previousEdge=state.edge;}
          const key=state.edge+':'+state.junction;
          if(state.choices.length&&state.distance>3&&state.distance<100&&key!==decision){
            const choices=state.choices.sort((a,b)=>(visits.get(a.edgeId)??0)-(visits.get(b.edgeId)??0)||(a.label==='U-turn'?1:0)-(b.label==='U-turn'?1:0)||a.edgeId-b.edgeId),chosen=choices[0];
            const button=page.locator(`[data-town-choices] button[data-edge="${chosen.edgeId}"]`);
            // A short connector can commit between observation and action.
            // A missing button is recorded as a missed decision, never forced.
            try{await button.click({timeout:750});decision=key;row.actions.push({time:Date.now()-started,action:'Visible turn-choice click',junction:state.junction,edge:chosen.edgeId,label:chosen.label,name:chosen.name});}
            catch{row.actions.push({time:Date.now()-started,action:'Choice passed before click',junction:state.junction,edge:chosen.edgeId});decision=key;}
          }
          if(Date.now()-started<nextSample)continue;
        }
        const sample=await snapshot(page);sample.elapsedMs=Date.now()-started;nextSample=sample.elapsedMs+10000;
        delete sample.observedFrames;delete sample.longTasks;row.samples.push(sample);
        if(sample.end){await page.locator('[data-town-reverse]').click();await page.locator('[data-town-canvas]').focus();await page.keyboard.press('ArrowUp');row.actions.push({time:sample.elapsedMs,action:'Real Turn around click and ArrowUp at mapped end'});}
        console.log(JSON.stringify({driveSeconds:Math.round(sample.elapsedMs/1000),meters:sample.distance,loaded:sample.loaded.length,cacheMB:Math.round(sample.streaming.estimatedCacheBytes/1048576),geometryMB:Math.round(sample.metrics.estimatedGeometryBytes/1048576),pending:sample.metrics.pending}));
        assert.equal(sample.contextLost,false);assert.deepEqual(errors,[]);
      }
      row.visitedDirectedEdges=[...visits].map(([edge,entries])=>({edge,entries}));row.final=await snapshot(page,true);row.frameSummary={count:row.final.observedFrames.length,medianMs:pct(row.final.observedFrames,.5),p95Ms:pct(row.final.observedFrames,.95),p99Ms:pct(row.final.observedFrames,.99),over50Ms:row.final.observedFrames.filter(x=>x>50).length,over100Ms:row.final.observedFrames.filter(x=>x>100).length};
      const summarize=values=>({count:values.length,medianMs:pct(values,.5),p95Ms:pct(values,.95),p99Ms:pct(values,.99),over50Ms:values.filter(x=>x>50).length,over100Ms:values.filter(x=>x>100).length});
      row.renderedFrameSummary=summarize(row.final.renderedIntervals);row.movingRenderedFrameSummary=summarize(row.final.movingRenderedIntervals);
      row.frameMeasurement='frameSummary is browser RAF cadence. renderedFrameSummary measures actual renderer.render starts including deliberate paused throttling. movingRenderedFrameSummary measures actual draws while unpaused and moving above0.1m/s, resetting across stops. It is a headless desktop measurement, not physical-device acceptance.';
      await page.evaluate(()=>{window.__streamRetired=window.__webster;window.__webster.dispose();});await page.waitForTimeout(1500);
      row.disposed=await page.evaluate(()=>{const g=window.__streamRetired;return{ready:g.ready,loaded:g.world.loaded.size,children:g.world.root.children.length,streaming:g.world.streamingResources(),resources:g.world.residentResources()};});
      assert.equal(row.disposed.loaded,0);assert.equal(row.disposed.children,0);assert.equal(row.disposed.streaming.estimatedCacheBytes,0);row.passed=true;
    }catch(error){row.error=error.stack;throw error;}
    finally{row.pageErrors=errors;row.requests=[...requests.values()];await page.evaluate(()=>window.__webster?.dispose()).catch(()=>{});await context.close();await writeFile(path.join(out,'drive.json'),JSON.stringify(row,null,2)+'\n');}
  }
  report.functionalPass=true;
}catch(error){report.error=error.stack;process.exitCode=1;console.error(error.stack);}
finally{
  await browser?.close();report.finished=new Date().toISOString();
  if(process.env.TOWN_SNAPSHOT_FILE){const bytes=await readFile(process.env.TOWN_SNAPSHOT_FILE);report.snapshot={path:process.env.TOWN_SNAPSHOT_FILE,sha256:checksum(bytes),data:JSON.parse(bytes)};}
  await writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({functionalPass:report.functionalPass,cold:report.coldSummary,drive:report.drive?.frameSummary,report:path.join(out,'report.json')}));
}
