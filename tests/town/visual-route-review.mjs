#!/usr/bin/env node
/** Stratified road-level visual review. Captures are evidence to inspect, not
 * an automated declaration of visual quality or a road-by-road census. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';
const site=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const url=process.env.TOWN_URL;if(!url)throw Error('Set TOWN_URL to a frozen candidate');
const out=process.env.TOWN_VISUAL_OUT||'/private/tmp/webster-finished-game/visual-routes';fs.mkdirSync(out,{recursive:true});
const moduleName=process.env.PLAYWRIGHT_MODULE||'/Users/andy/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const {chromium}=await import(moduleName.startsWith('/')?pathToFileURL(moduleName).href:moduleName);
const network=JSON.parse(gunzipSync(fs.readFileSync(site+'/data/derived/town/engine-network.json.gz')));
const names=['MAIN STREET','NORTH MAIN STREET','SOUTH MAIN STREET','EAST MAIN STREET','SCHOOL STREET','POLAND STREET','SLATER STREET','HIGH STREET','PARK AVENUE','NEGUS STREET','HARRIS STREET','RACICOT AVENUE','MILL STREET','WORCESTER ROAD','OLD WORCESTER ROAD','THOMPSON ROAD','SUTTON ROAD','DOUGLAS ROAD','OLD DOUGLAS ROAD','CUDWORTH ROAD','UPPER GORE ROAD','LOWER GORE ROAD','GORE ROAD','LAKE STREET','LAKESIDE AVENUE','KILLDEER ISLAND ROAD','POINT BREEZE ROAD','BATES POINT ROAD','UNION POINT ROAD','SOUTH SHORE ROAD','MEMORIAL BEACH DRIVE','LAKE PARKWAY','INTERSTATE 395','RAMP-RT 16 TO RT 395 NB','RAMP-RT 395 NB TO RT 16','TOWN FOREST ROAD'];
const points=[];
for(const name of names){
 const physical=new Map();for(const e of network.edges.filter(e=>e.name===name))physical.set(e.physical_id,e);
 const candidates=[...physical.values()].filter(e=>e.length_m>35);if(!candidates.length)continue;
 const mids=candidates.map(e=>e.points[Math.floor(e.points.length/2)]),total=candidates.reduce((s,e)=>s+e.length_m,0),center=[0,1].map(k=>candidates.reduce((s,e,i)=>s+mids[i][k]*e.length_m,0)/total);
 candidates.sort((a,b)=>{const f=e=>{const m=e.points[Math.floor(e.points.length/2)];return Math.hypot(m[0]-center[0],m[1]-center[1]);};return f(a)-f(b);});
 const chosen=candidates[0],directions=network.edges.filter(e=>e.physical_id===chosen.physical_id);
 for(const e of directions)points.push({name,edgeId:e.id,physicalId:e.physical_id,fraction:.5});
}
for(const s of [79.22,139])points.push({name:'LAKESIDE AVENUE',edgeId:2783,physicalId:1463,s});
if(process.env.TOWN_VISUAL_TARGETS)points.push(...JSON.parse(fs.readFileSync(process.env.TOWN_VISUAL_TARGETS,'utf8')));
const report={url,started:new Date().toISOString(),scope:'Stratified current-road sample in both available directions; normal player camera, not a whole-town visual census.',rows:[],errors:[]};
let browser;
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_EXECUTABLE||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 const page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1});page.on('pageerror',e=>report.errors.push(e.message));
 await page.goto(url,{waitUntil:'domcontentloaded'});await page.locator('[data-town-play]').click();await page.waitForFunction(()=>window.__webster?.ready&&window.__webster.metrics.frames>3,null,{timeout:90000});
 const selection=process.env.TOWN_VISUAL_NAMES?.split('|');
 for(const row of points.filter(r=>!selection||selection.includes(r.name))){
  const state=await page.evaluate(async row=>{
   const g=window.__webster,e=g.engine;e.paused=true;e.speed=0;e.cruise=0;e.edgeId=row.edgeId;e.s=row.s??g.graph.paths.get(row.edgeId).length*row.fraction;e.phase='ROAD';e.connection=null;e.connectionS=0;e.queue(null);
   const [p]=e.pose();await g.world.prepareAt([p[0],p[2],-p[1]]);
   // The ordinary comfort control also resets camera tracking at this pose.
   const control=document.querySelector('[data-town-comfort]');control.value='steady';control.dispatchEvent(new Event('change',{bubbles:true}));
   return {pose:e.pose(),edge:e.edgeId,s:e.s};
  },row);
  await page.waitForTimeout(1200);
  await page.waitForFunction(()=>window.__webster.metrics.pending===0,null,{timeout:45000}).catch(()=>{});
  const file=`${String(report.rows.length+1).padStart(2,'0')}-${row.name.toLowerCase().replace(/[^a-z0-9]+/g,'-')}-${row.edgeId}.png`;
  await page.locator('[data-town-canvas]').screenshot({path:path.join(out,file)});
  const metadata=await page.evaluate(()=>({metrics:window.__webster.metrics,streaming:window.__webster.presentation.streaming,camera:window.__webster.cameraMode}));
  report.rows.push({...row,...state,...metadata,file,visualVerdict:'requires inspection'});console.log('Captured',report.rows.length,row.name,row.edgeId);
  fs.writeFileSync(out+'/report.json',JSON.stringify(report,null,2));
 }
}catch(error){report.error=String(error);process.exitCode=1;}finally{await browser?.close();report.finished=new Date().toISOString();fs.writeFileSync(out+'/report.json',JSON.stringify(report,null,2));}
