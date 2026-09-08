/** Real browser transport/texture lifecycle acceptance. Image output requires
 * inspection; this is not a physical-device or frame-rate benchmark. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const url = process.env.TOWN_URL; if (!url) throw Error('Set TOWN_URL');
const out = process.env.TOWN_OUT_DIR ?? '/private/tmp/webster-finished-game/engineering/ground-refinement'; fs.mkdirSync(out,{recursive:true});
const {chromium} = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE ?? '/Users/andy/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs').href);
const report = {url,scope:'Frozen local Chrome source-map refinement and lifecycle; not physical-device performance acceptance',errors:[],requests:[]}; let browser;
try {
  browser = await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  const page=await browser.newPage({viewport:{width:1280,height:850}}); page.on('pageerror',e=>report.errors.push(e.message));page.on('request',r=>report.requests.push(r.url()));
  await page.goto(url,{waitUntil:'domcontentloaded'});
  report.decompression=await page.evaluate(()=>Object.fromEntries(['gzip','deflate','deflate-raw','brotli','br','zstd'].map(format=>{try{new DecompressionStream(format);return[format,true];}catch{return[format,false];}})));
  await page.locator('[data-town-play]').click(); await page.waitForFunction(()=>window.__webster?.ready&&window.__webster.metrics.frames>=3,null,{timeout:90000});
  report.initial=await page.evaluate(()=>window.__webster.world.streamingResources().groundTextures);
  await page.evaluate(()=>window.__webster.engine.paused=true); await page.locator('[data-town-canvas]').screenshot({path:path.join(out,'first-ready.png')});
  await page.waitForFunction(()=>window.__webster.world.streamingResources().groundTextures?.previewMaps===0,null,{timeout:30000}); await page.waitForTimeout(400);
  report.final=await page.evaluate(()=>{const s=window.__webster.world.surfaces;const names=['townGrass','townGrassNormal','townGrassRoughness','townSoil','townForest','townPavement'];return{state:s.detailResources(),maps:s.shared.map(t=>({width:t.image.width,height:t.image.height,colorSpace:t.colorSpace,wrapS:t.wrapS,anisotropy:t.anisotropy})),shaderVersions:[...s.shaders.values()].flatMap(versions=>[...versions].map(uniforms=>names.every((name,i)=>uniforms[name]?.value===s.shared[i])))};});
  assert.deepEqual(report.final.state,{previewMaps:0,fullMaps:6,upgrading:false,failures:0}); assert.ok(report.final.maps.every(map=>map.width>128));assert.ok(report.final.shaderVersions.length&&report.final.shaderVersions.every(Boolean));
  await page.locator('[data-town-canvas]').screenshot({path:path.join(out,'full-original-maps.png')});
  await page.evaluate(()=>{window.__retiredTown=window.__webster;window.__webster.dispose();});await page.waitForTimeout(1000);
  report.disposed=await page.evaluate(()=>({children:window.__retiredTown.world.root.children.length,cacheBytes:window.__retiredTown.world.streamingResources().estimatedCacheBytes,ground:window.__retiredTown.world.surfaces.resources()}));
  assert.equal(report.disposed.children,0);assert.equal(report.disposed.cacheBytes,0);assert.deepEqual(report.disposed.ground,{materials:0,textures:0,bytes:0});assert.deepEqual(report.errors,[]); report.status='PASS';
} catch(e) {report.error=e.stack;process.exitCode=1;} finally {await browser?.close();report.finishedAt=new Date().toISOString();fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,error:report.error,decompression:report.decompression}));}
