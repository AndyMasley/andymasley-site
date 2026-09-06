import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const out=process.env.TOWN_OUT_DIR||'/private/tmp/webster-driving-controls-acceptance/controls';
const target=process.env.TOWN_URL;if(!target)throw new Error('Set TOWN_URL');
const {chromium}=await import(pathToFileURL('/Users/andy/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs').href);
await mkdir(out,{recursive:true});
const report={url:target,passed:false,checks:[],pageErrors:[],assetErrors:[],testSetup:'Positions are placed on real mapped lanes through the debug engine; controls and speed progression use the real rendered game.'};
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const page=await browser.newPage({viewport:{width:1280,height:850},serviceWorkers:'block'});page.setDefaultTimeout(90000);
page.on('pageerror',e=>report.pageErrors.push(e.message));
page.on('response',r=>{if(/\/town-(assets|transfer)\//.test(r.url())&&r.status()>=400)report.assetErrors.push({url:r.url(),status:r.status()})});
const state=()=>page.evaluate(()=>{const g=window.__webster,e=g.engine;return{edge:e.edgeId,road:e.edge.name,pose:e.pose(),speed:e.speed/0.44704,limit:e.roadLimit()/0.44704,distance:e.distance,paused:e.paused,phase:e.phase,queuedEdge:e.queuedEdge,queued:e.queued,frames:g.metrics.frames,history:e.history,manual:e.edge.manual_reverse_of}});
const check=async(name,run)=>{const evidence=await run();report.checks.push({name,passed:true,evidence});console.log('PASS '+name)};
const setup=async(edgeId,s)=>{
 await page.evaluate(async({edgeId,s})=>{const g=window.__webster,e=g.engine;e.paused=true;e.edgeId=edgeId;e.s=s;e.phase='ROAD';e.connection=null;e.connectionS=0;e.speed=e.cruise=e.acceleration=0;e.cruiseAtLimit=false;e.endOfRoute=false;e.queue(null);e.history=[];const p=e.pose()[0];await g.world.prepareAt([p[0],p[2],-p[1]]);},{edgeId,s});
 await page.locator('[data-town-canvas]').focus();
};
try{
 await page.goto(target,{waitUntil:'domcontentloaded'});await page.locator('[data-town-play]').click();await page.waitForFunction(()=>window.__webster?.ready&&window.__webster.metrics.frames>=3);
 await check('Turn around button reverses heading and preserves trip distance',async()=>{const before=await state();await page.locator('[data-town-reverse]').click();const after=await state();const dot=before.pose[1].reduce((sum,v,i)=>sum+v*after.pose[1][i],0);assert.ok(dot<-.85);assert.ok(Math.hypot(...before.pose[0].map((v,i)=>v-after.pose[0][i]))<10);assert.equal(after.distance,before.distance);return{before,after,dot}});
 await check('R turns around while paused without resuming the car',async()=>{await page.locator('[data-town-pause]').click();const before=await state();assert.equal(before.paused,true);await page.locator('[data-town-canvas]').focus();await page.keyboard.press('r');const after=await state();assert.equal(after.paused,true);assert.notEqual(after.edge,before.edge);return{before,after}});
 await check('I-395 right exit is a named clickable option and takes the selected branch',async()=>{
  const s=await page.evaluate(()=>window.__webster.graph.paths.get(0).length-55);await setup(0,s);
  const exit=page.locator('[data-town-choices] button[data-edge="2426"]');await exit.waitFor();assert.match(await exit.getAttribute('aria-label'),/^Right onto /);await exit.click();assert.equal((await state()).queuedEdge,2426);
  await page.keyboard.press('ArrowUp');await page.waitForFunction(()=>window.__webster.engine.phase==='TURN'&&window.__webster.engine.connection?.nextId===2426||window.__webster.engine.history.some(h=>h[0]===0&&h[1]===2426),null,{timeout:60000});
  const chosen=await state();assert.equal(chosen.queuedEdge,null);await page.keyboard.press('Space');return chosen;
 });
 await check('Real rendered highway drive accelerates to 65 mph',async()=>{
  await setup(2,250);await page.waitForFunction(()=>document.querySelector('[data-town-limit]').textContent==='65 mph');await page.keyboard.press('ArrowUp');
  await page.waitForFunction(()=>window.__webster.engine.speed/0.44704>=64.95,null,{timeout:90000});const driving=await state();assert.ok(driving.speed>=64.95);assert.equal(driving.limit,65);assert.equal(driving.road,'INTERSTATE 395');
  await page.keyboard.press('Space');if(process.env.TOWN_SCREENSHOTS!=='0')await page.screenshot({path:out+'/65-mph.png'});return driving;
 });
 await check('Turn around on I-395 uses the opposite mapped carriageway',async()=>{const before=await state();await page.locator('[data-town-reverse]').click();const after=await state();assert.equal(after.road,'INTERSTATE 395');assert.notEqual(before.edge,after.edge);assert.equal(after.limit,65);assert.equal(after.paused,true);assert.ok(before.pose[1].reduce((sum,v,i)=>sum+v*after.pose[1][i],0)<-.5);return{before,after}});
 await check('One-way road can reverse immediately without adding an ordinary junction option',async()=>{
  const source=await page.evaluate(()=>{const g=window.__webster;for(const e of g.graph.edges.values()){if(e.manual_reverse_of!==undefined||Number(e.road_type)===1||g.graph.obstacleStops.has(e.id))continue;const reverse=[...g.graph.edges.values()].some(o=>o.from===e.to&&o.to===e.from&&o.physical_id===e.physical_id);if(!reverse&&g.graph.paths.get(e.id).length>60)return e.id;}throw new Error('No one-way test road');});
  const midpoint=await page.evaluate(id=>window.__webster.graph.paths.get(id).length/2,source);await setup(source,midpoint);const before=await state();await page.locator('[data-town-reverse]').click();const after=await state();assert.equal(after.manual,source);assert.ok(Math.hypot(...before.pose[0].map((v,i)=>v-after.pose[0][i]))<.02);assert.ok(before.pose[1].reduce((sum,v,i)=>sum+v*after.pose[1][i],0)<-.99);return{before,after};
 });
 await check('No page or town asset errors',async()=>{assert.deepEqual(report.pageErrors,[]);assert.deepEqual(report.assetErrors,[]);return{pageErrors:[],assetErrors:[]}});
 report.passed=true;
}catch(e){report.error=e.stack;console.error(e.stack);process.exitCode=1;}finally{await page.evaluate(()=>window.__webster?.dispose()).catch(()=>{});await browser.close();await writeFile(out+'/report.json',JSON.stringify(report,null,2)+'\n');console.log('Report '+out+'/report.json');}
