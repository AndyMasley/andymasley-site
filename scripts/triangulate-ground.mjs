/** Rare robust fallback for a nearly coincident polygon-overlay fragment. */
import fs from 'node:fs';
import { Earcut } from 'three/src/extras/Earcut.js';
const rings=JSON.parse(fs.readFileSync(0,'utf8')),points=[],holes=[];
for(const [i,ring]of rings.entries()){if(i)holes.push(points.length/2);for(const p of ring)points.push(p[0],p[1]);}
const indices=Earcut.triangulate(points,holes,2),triangles=[];
for(let i=0;i<indices.length;i+=3)triangles.push(indices.slice(i,i+3).map(n=>points.slice(n*2,n*2+2)));
process.stdout.write(JSON.stringify(triangles));
