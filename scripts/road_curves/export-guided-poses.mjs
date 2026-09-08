/** Actual full-size guided car poses on both Lake lanes; game XY is east/north. */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {gunzipSync,gzipSync} from 'node:zlib';
import {build} from 'esbuild';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),out=process.env.ROAD_CURVE_WORK??'/private/tmp/webster-finished-game/road-curves';
await build({entryPoints:[root+'/src/lib/town/engine.ts'],outfile:out+'/engine.mjs',bundle:true,format:'esm',platform:'node',logLevel:'silent'});
const {RoadGraph}=await import(pathToFileURL(out+'/engine.mjs'));
const graph=new RoadGraph(JSON.parse(gunzipSync(fs.readFileSync(root+'/data/derived/town/engine-network.json.gz'))));
const poses=[];
for(const edge of [2782,2783]){
 const lane=graph.paths.get(edge),count=Math.ceil(lane.length/.25);
 for(let i=0;i<=count;i++){
  const s=lane.length*i/count,[p,direction]=lane.sample(s),n=Math.hypot(direction[0],direction[1]),d=[direction[0]/n,direction[1]/n];
  const quad=[[2.6,1.2],[-2.6,1.2],[-2.6,-1.2],[2.6,-1.2]].map(([along,across])=>[p[0]+d[0]*along-d[1]*across,p[1]+d[1]*along+d[0]*across]);
  poses.push({edge,s,quad});
 }
}
fs.writeFileSync(out+'/guided-poses.json.gz',gzipSync(JSON.stringify(poses)));
console.log(JSON.stringify({poses:poses.length,edges:[2782,2783],maximumStepM:.25,vehicleEnvelopeM:[5.2,2.4]}));
