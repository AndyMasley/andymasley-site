import * as THREE from 'three';

function seedAt(x, z) {
  let h = Math.imul(Math.round(x * 10), 374761393) ^ Math.imul(Math.round(z * 10), 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

/** Spatial bins only accelerate the query; a real source anchor seeds each
 * cluster. Stable shuffled anchor order avoids rows aligned to the source grid. */
export function clusterCanopy(rows, origin, sourceBounds, { radius = 32, heightDifference = 7, blocked = () => false } = {}) {
  const anchors = rows.map(row => ({ row, x: row[0] + origin[0], y: row[1] + origin[1], z: row[2] + origin[2] }));
  anchors.sort((a,b) => seedAt(a.x,a.z) - seedAt(b.x,b.z) || a.x - b.x || a.z - b.z || a.y - b.y);
  const cells = new Map(), clusters = [], matrix = new THREE.Matrix4(), quaternion = new THREE.Quaternion();
  const point = new THREE.Vector3(), scale = new THREE.Vector3(), up = new THREE.Vector3(0,1,0);
  for (const anchor of anchors) {
    const { row, x, y, z } = anchor, cx = Math.floor(x / radius), cz = Math.floor(z / radius);
    let match, distance = radius * radius;
    for (let bx = cx-1; bx <= cx+1; bx++) for (let bz = cz-1; bz <= cz+1; bz++) {
      for (const candidate of cells.get(`${bx},${bz}`) ?? []) {
        const d = (x-candidate.x)**2 + (z-candidate.z)**2;
        if (d >= distance || Math.abs(y-candidate.y) > heightDifference) continue;
        const steps = Math.max(1, Math.ceil(Math.sqrt(d) / 2)); let crosses = false;
        for (let i=0; i<=steps; i++) if (blocked(candidate.x+(x-candidate.x)*i/steps,candidate.z+(z-candidate.z)*i/steps)) { crosses=true; break; }
        if (!crosses) { match=candidate; distance=d; }
      }
    }
    if (!match) {
      match = { x,y,z,seed:seedAt(x,z),bounds:new THREE.Box3(),count:0 };
      clusters.push(match); const key=`${cx},${cz}`;
      if (!cells.has(key)) cells.set(key,[]); cells.get(key).push(match);
    }
    matrix.compose(point.set(x,y,z),quaternion.setFromAxisAngle(up,row[6]),scale.set(row[3],row[4],row[5]));
    match.bounds.union(sourceBounds.clone().applyMatrix4(matrix)); match.count++;
  }
  return clusters;
}

const source = new THREE.IcosahedronGeometry(1,0), prototypeVertices=[], prototypeIndices=[], unique=new Map();
for (let i=0;i<source.attributes.position.count;i++) {
  const p=new THREE.Vector3().fromBufferAttribute(source.attributes.position,i),key=p.toArray().map(n=>n.toFixed(6)).join(',');
  let index=unique.get(key); if(index===undefined){index=prototypeVertices.length;unique.set(key,index);prototypeVertices.push(p);}
  prototypeIndices.push(index);
}
source.dispose();

/** A closed 20-face crown with smooth ellipsoid normals. The two upper crown
 * vertices replace the octahedron's single tall apex; seed-based yaw removes
 * repeated aligned diamond silhouettes. Each hull retains its source envelope. */
export function roundedCanopy(cluster) {
  const angle=(cluster.seed/4294967296)*Math.PI*2, axis=new THREE.Vector3(0,1,0);
  const vertices=prototypeVertices.map(p=>p.clone().applyAxisAngle(axis,angle));
  const limits=new THREE.Box3().setFromPoints(vertices), middle=limits.getCenter(new THREE.Vector3()), extent=limits.getSize(new THREE.Vector3()).multiplyScalar(.5);
  const center=cluster.bounds.getCenter(new THREE.Vector3()), size=cluster.bounds.getSize(new THREE.Vector3()).multiplyScalar(.5), positions=[],normals=[],colors=[];
  for(const vertex of vertices){
    vertex.sub(middle).divide(extent);
    positions.push(center.x+vertex.x*size.x,center.y+vertex.y*size.y,center.z+vertex.z*size.z);
    const normal=new THREE.Vector3(vertex.x/Math.max(.1,size.x),vertex.y/Math.max(.1,size.y),vertex.z/Math.max(.1,size.z)).normalize();
    normals.push(...normal.toArray());
    const variation=.94+(cluster.seed%101)/1000,shade=.86+.16*(vertex.y+1)*.5;
    colors.push(...[.095,.16,.057].map(value=>value*variation*shade));
  }
  return { positions,normals,colors,indices:prototypeIndices,errorM:size.length() };
}
