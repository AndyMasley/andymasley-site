import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '/Users/andy/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const target=process.env.TOWN_URL;if(!target)throw new Error('Set TOWN_URL to a running build.');
const out=process.env.TOWN_OUT_DIR||'/private/tmp/webster-finish-acceptance/finish-browser';await mkdir(out,{recursive:true});
const index=JSON.parse(await readFile(new URL('../../data/derived/town/paved-surfaces-index.json',import.meta.url),'utf8'));
const lots=new Map();for(const asset of Object.values(index.lotAssets))for(const lot of JSON.parse(await readFile(new URL('../../public'+asset.url,import.meta.url),'utf8')).lots)lots.set(lot.id,lot);
const report={url:target,passed:false,views:[],errors:[],diagnosticCamera:'Parking overview screenshots use a temporary elevated camera. Driving screenshots use the actual game camera and controls.'};
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 const page=await browser.newPage({viewport:{width:1440,height:960},serviceWorkers:'block'});
 page.on('pageerror',e=>report.errors.push(e.message));page.on('response',r=>{if(r.status()>=400&&/\/town-(?:assets|transfer|finish|surfaces|evidence)\//.test(r.url()))report.errors.push(r.status()+' '+r.url());});
 await page.goto(target,{waitUntil:'domcontentloaded'});await page.locator('[data-town-play]').click();
 await page.waitForFunction(()=>window.__webster?.ready&&window.__webster.metrics.frames>3,null,{timeout:90000});
 await page.evaluate(()=>{
   const g=window.__webster,render=g.renderer.render.bind(g.renderer);
   g.renderer.render=(scene,camera)=>{const view=window.__finishView;if(view){const diagnostic=camera.clone();diagnostic.position.set(...view.position);diagnostic.lookAt(...view.target);diagnostic.updateMatrixWorld(true);render(scene,diagnostic);}else render(scene,camera);};
 });
 for(const [name,id] of [['north-main',2322],['east-main',2496],['school',2149],['great-bridge',2574]]){
   await page.evaluate(async id=>{const g=window.__webster,e=g.engine;e.paused=true;e.speed=e.cruise=0;e.edgeId=id;e.s=Math.max(0,g.graph.paths.get(id).length-35);e.phase='ROAD';e.connection=null;e.connectionS=0;e.queue(null);const p=e.pose()[0];await g.world.prepareAt([p[0],p[2],-p[1]]);},id);
   await page.waitForTimeout(1500);
   const state=await page.evaluate(()=>{const g=window.__webster;return{presentation:g.presentation,metrics:g.metrics,reports:[...g.world.loaded].map(([id,t])=>({id,road:t.group.userData.roadFinish,terrain:t.group.userData.terrainFinish}))};});
   assert.ok(state.presentation.finish.roadTriangles>0,name+' has filled source-link paint');
   assert.equal(state.presentation.finish.optionalFailures,0);
   for(const tile of state.reports)assert.equal(tile.road?.unmatchedIds?.length??0,0);
   if(name==='north-main'&&process.env.TOWN_REQUIRE_TERRAIN!=='0')assert.ok(state.presentation.finish.terrainTriangles>0,'North Main terrain repair is applied');
   await page.locator('[data-town-canvas]').screenshot({path:out+'/'+name+'.png'});report.views.push({name,kind:'driving',...state});
 }
 for(const id of ['PAVE-AERIAL-DOWNTOWN-01','PAVE-AERIAL-BEACH-EAST','PAVE-OSM-247622897','PAVE-OSM-1504195631','PAVE-OSM-1455549257']){
   const lot=lots.get(id);assert.ok(lot);
   const state=await page.evaluate(async lot=>{
     const g=window.__webster,e=g.engine,[id,s]=g.graph.nearest(lot.center);e.paused=true;e.speed=e.cruise=0;e.edgeId=id;e.s=s;e.phase='ROAD';e.connection=null;e.connectionS=0;e.queue(null);
     const p=e.pose()[0];await g.world.prepareAt([lot.center[0],p[2],-lot.center[1]]);
     const points=lot.sourcePolygons.flatMap(poly=>poly[0]),xs=points.map(p=>p[0]),ys=points.map(p=>p[1]),size=Math.max(Math.max(...xs)-Math.min(...xs),Math.max(...ys)-Math.min(...ys));
     const target=[lot.center[0],p[2],-lot.center[1]],height=Math.max(35,size*.9);window.__finishView={target,position:[target[0],target[1]+height,target[2]+height*.62]};
     return{edge:id,s,center:lot.center,treeIslands:lot.treeIslands};
   },lot);
   await page.waitForTimeout(1500);
   const finish=await page.evaluate(()=>window.__webster.presentation.finish);
   assert.ok(finish.pavedMasks>0,id+' uses the corrected cover mask');assert.ok(finish.parkingBays>0,id+' has authored bays');
   await page.locator('[data-town-canvas]').screenshot({path:out+'/'+id+'.png'});report.views.push({name:id,kind:'diagnostic parking overview',finish,...state});
   await page.evaluate(()=>{window.__finishView=null;});
 }
 assert.deepEqual(report.errors,[]);report.passed=true;
}catch(error){report.error=error.stack;process.exitCode=1;console.error(error);}
finally{await browser.close();await writeFile(out+'/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,views:report.views.length,errors:report.errors,report:out+'/report.json'}));}
