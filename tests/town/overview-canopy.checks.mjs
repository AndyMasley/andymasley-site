import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { clusterCanopy, roundedCanopy } from '../../scripts/town-overview-canopy.mjs';
const bounds=new THREE.Box3(new THREE.Vector3(-1,-.5,-.75),new THREE.Vector3(1,1.25,.75));
const row=(x,y=10,z=0)=>[x,y,z,3,4,2,.6];
const summary=clusters=>clusters.map(c=>({seed:c.seed,count:c.count,min:c.bounds.min.toArray(),max:c.bounds.max.toArray()}));

test('proximity grouping is deterministic under row order changes and accounts for every anchor',()=>{
  const rows=Array.from({length:40},(_,i)=>row(i%8*5,10,Math.floor(i/8)*5));
  const a=clusterCanopy(rows,[100,20,-50],bounds),b=clusterCanopy([...rows].reverse(),[100,20,-50],bounds);
  assert.deepEqual(summary(a),summary(b)); assert.equal(a.reduce((n,c)=>n+c.count,0),rows.length);
  assert(a.length>1); assert(a.every(c=>rows.some(r=>r[0]+100===c.x&&r[2]-50===c.z)));
});
test('roads and water separate close crown groups while distant height bands stay separate',()=>{
  const rows=[row(-6),row(6)]; assert.equal(clusterCanopy(rows,[0,0,0],bounds).length,1);
  assert.equal(clusterCanopy(rows,[0,0,0],bounds,{blocked:x=>Math.abs(x)<2}).length,2);
  assert.equal(clusterCanopy([row(0,10),row(1,25)],[0,0,0],bounds).length,2);
});
test('cluster envelope applies actual prototype bounds, source yaw, scale and world origin',()=>{
  const r=[5,12,-9,3,6,2,Math.PI/2],origin=[100,30,200],cluster=clusterCanopy([r],origin,bounds)[0];
  const matrix=new THREE.Matrix4().compose(new THREE.Vector3(105,42,191),new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),r[6]),new THREE.Vector3(3,6,2));
  assert.deepEqual(cluster.bounds.min.toArray(),bounds.clone().applyMatrix4(matrix).min.toArray());
  assert.deepEqual(cluster.bounds.max.toArray(),bounds.clone().applyMatrix4(matrix).max.toArray());
});
test('rounded crown is closed, outward-facing and finite with exact source envelope and smooth unit normals',()=>{
  const c=clusterCanopy([row(0),row(8,11,4)],[40,0,70],bounds)[0],g=roundedCanopy(c),edges=new Map(),center=c.bounds.getCenter(new THREE.Vector3());
  assert.equal(g.positions.length/3,12);assert.equal(g.indices.length/3,20);
  assert([...g.positions,...g.normals,...g.colors].every(Number.isFinite));
  const actual=new THREE.Box3(),p=new THREE.Vector3();for(let i=0;i<12;i++){actual.expandByPoint(p.fromArray(g.positions,i*3));assert(Math.abs(p.fromArray(g.normals,i*3).length()-1)<1e-8)}
  assert(actual.min.distanceTo(c.bounds.min)<1e-8);assert(actual.max.distanceTo(c.bounds.max)<1e-8);
  for(let i=0;i<g.indices.length;i+=3){const ids=g.indices.slice(i,i+3),a=new THREE.Vector3().fromArray(g.positions,ids[0]*3),b=new THREE.Vector3().fromArray(g.positions,ids[1]*3),d=new THREE.Vector3().fromArray(g.positions,ids[2]*3);assert(b.clone().sub(a).cross(d.clone().sub(a)).dot(a.clone().add(b).add(d).multiplyScalar(1/3).sub(center))>0);for(let j=0;j<3;j++){const key=[ids[j],ids[(j+1)%3]].sort((a,b)=>a-b).join(',');edges.set(key,(edges.get(key)||0)+1)}}
  assert([...edges.values()].every(n=>n===2));
  const top=Math.max(...g.positions.filter((_,i)=>i%3===1));assert.equal(g.positions.filter((v,i)=>i%3===1&&Math.abs(v-top)<1e-6).length,2);
});
