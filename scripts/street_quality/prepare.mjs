import fs from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
const root=process.cwd(), out=process.env.TOWN_QUALITY_OUT;
if(!out)throw new Error('Set TOWN_QUALITY_OUT to a local audit directory.');
fs.mkdirSync(out,{recursive:true});
const network=JSON.parse(gunzipSync(fs.readFileSync('data/derived/town/engine-network.json.gz')));
const physical=new Map();
for(const edge of network.edges)if(!physical.has(edge.physical_id??edge.id))physical.set(edge.physical_id??edge.id,edge);
const stations=[];
for(const [physicalId,edge] of physical){
 const distance=[0];for(let i=1;i<edge.points.length;i++)distance.push(distance.at(-1)+Math.hypot(edge.points[i][0]-edge.points[i-1][0],edge.points[i][1]-edge.points[i-1][1]));
 const length=distance.at(-1),count=Math.max(1,Math.ceil(length/90));
 for(let i=0;i<count;i++){
  const fraction=(i+.5)/count,s=length*fraction;let k=1;while(k<distance.length-1&&distance[k]<s)k++;
  const t=(s-distance[k-1])/(distance[k]-distance[k-1]),p=edge.points[k].map((v,j)=>edge.points[k-1][j]+(v-edge.points[k-1][j])*t);
  stations.push({id:`${physicalId}-${i}`,edgeId:edge.id,physicalId,name:edge.name??'Unnamed road',fraction,length,point:p});
 }
}
// Adjacent cells stay together so the real streamer's loaded neighborhoods are reused.
stations.sort((a,b)=>Math.floor(a.point[0]/250)-Math.floor(b.point[0]/250)||(Math.floor(a.point[0]/250)%2===0?1:-1)*(Math.floor(a.point[1]/250)-Math.floor(b.point[1]/250))||a.point[1]-b.point[1]||a.point[0]-b.point[0]);
const plan={source:'data/derived/town/engine-network.json.gz',physicalSegments:physical.size,namedStreets:new Set([...physical.values()].map(e=>e.name).filter(n=>n&&!/^Unnamed/.test(n))).size,stations:stations.length,views:stations.length*2,maxSpacingM:90,rows:stations};
fs.writeFileSync(path.join(out,'capture-plan.json'),JSON.stringify(plan,null,2));
let template=fs.readFileSync('scripts/street_quality/review.astro.template','utf8');
if(process.env.TOWN_QUALITY_SELECTION){
 const {indices}=JSON.parse(fs.readFileSync(process.env.TOWN_QUALITY_SELECTION));
 if(!Array.isArray(indices)||!indices.every(i=>Number.isInteger(i)&&i>=0&&i<stations.length))throw new Error('Invalid selected station indices');
 template=template.replace('id="quality-indices" value=""',`id="quality-indices" value="${[...new Set(indices)].join(',')}"`);
}
fs.writeFileSync('src/pages/town-review.astro',template.replace('/* CAPTURE_PLAN */',JSON.stringify(plan)));
console.log(JSON.stringify({...plan,rows:undefined}));
