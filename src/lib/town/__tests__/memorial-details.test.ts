// @vitest-environment node
import { describe,expect,it } from 'vitest';
import * as THREE from 'three';
import { applyMemorialDetails,MEMORIAL_DETAIL_PROVENANCE as data } from '../memorial-details';

function fixture(tileId:string){
 const[x,n]=tileId.split('_').map(Number),origin=[x*250,7,-n*250],group=new THREE.Group();
 const geometry=new THREE.PlaneGeometry(600,600).rotateX(-Math.PI/2).translate(125,38,-125),terrain:THREE.Mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial());terrain.name='terrain';group.add(terrain);return{group,terrain,origin};
}
describe('source-qualified civic objects',()=>{
 it('uses relocated Slater positions and recorded crossing device distinctions',()=>{
  const slater=data.objects.find(r=>r.id==='MON-013')!;
  expect(slater.coordinatesWGS84).toEqual([-71.86360595,42.06046689]);
  expect(data.objects.filter(r=>r.kind==='rail_crossing'&&r.gates).map(r=>r.id)).toEqual(['ST-35-a','ST-35-b']);
  for(const row of data.objects){expect(Math.hypot(...row.frame.tangent)).toBeCloseTo(1,8);expect(Math.hypot(...row.frame.outward)).toBeCloseTo(1,8);expect(row.source.length).toBeGreaterThan(0);}
 });
 it('places crossing masts from the actual named road projection, retaining the off-road FRA pin',()=>{
  const masts=data.objects.filter(r=>r.kind==='rail_crossing');expect(masts).toHaveLength(8);
  for(const r of masts){
   if(!('projectedRoadCenter'in r)||!r.projectedRoadCenter)throw new Error('Missing projected crossing road center');
   const delta=r.center.map((x,i)=>x-r.projectedRoadCenter![i]);
   const lateral=delta[0]*r.frame.tangent[0]+delta[1]*r.frame.tangent[1];
   expect(lateral).toBeCloseTo(r.width/2+1.15,6);
   expect(r.roadContext.distanceM-r.roadContext.halfWidthM).toBeGreaterThan(.6);
   expect(r.crossingPoint).toEqual(r.inventoryPoint);
  }
  const hill=masts.find(r=>r.id==='ST-37-a')!;
  expect(hill.center[0]).toBeCloseTo(-3304.7960057,5);expect(hill.center[1]).toBeCloseTo(-1653.9413835,5);
  expect(hill.inventoryToRoadShiftM).toBeCloseTo(2.2580233,5);
 });
 it('gives the Slater obelisk a proper pyramid without collapsed apex faces',()=>{
  const{group,origin}=fixture('-6_1');applyMemorialDetails(group,'-6_1',origin,0);
  group.getObjectByName('Research memorial details')!.traverse(o=>{
   if(!(o instanceof THREE.Mesh))return;const p=o.geometry.getAttribute('position'),n=o.geometry.getAttribute('normal');
   for(let i=0;i<p.count;i+=3){
    const a=new THREE.Vector3().fromBufferAttribute(p,i),b=new THREE.Vector3().fromBufferAttribute(p,i+1),c=new THREE.Vector3().fromBufferAttribute(p,i+2),normal=new THREE.Vector3().fromBufferAttribute(n,i),cross=b.sub(a).cross(c.sub(a));
    expect(cross.length()).toBeGreaterThan(1e-9);expect(cross.dot(normal)).toBeGreaterThan(0);
   }
  });
 });
 it.each([0,1,2])('preserves source buffers and finite geometry at LOD %s',level=>{
  for(const tile of new Set(data.objects.map(r=>r.tileId))){
   const{group,terrain,origin}=fixture(tile),original=terrain.geometry,positions=Array.from(original.getAttribute('position').array);
   const report=applyMemorialDetails(group,tile,origin,level)!;
   expect(report.skipped).toEqual([]);expect(report.ids.length).toBeGreaterThan(0);expect(report.addedMeshes).toBeLessThan(24);expect(report.addedTriangles).toBeLessThan(24000);
   expect(terrain.geometry).toBe(original);expect(Array.from(original.getAttribute('position').array)).toEqual(positions);
   expect(applyMemorialDetails(group,tile,origin,level)).toBe(report);
   group.getObjectByName('Research memorial details')!.traverse(o=>{if(!(o instanceof THREE.Mesh))return;const p=o.geometry.getAttribute('position'),n=o.geometry.getAttribute('normal');for(let i=0;i<p.count;i++){expect(Number.isFinite(p.getX(i)+p.getY(i)+p.getZ(i))).toBe(true);expect(Math.hypot(n.getX(i),n.getY(i),n.getZ(i))).toBeCloseTo(1,4);}});
  }
 });
 it.each([0,1,2])('keeps Court of Honor paving above a terrain crease between its corners at LOD %s',level=>{
  const{group,terrain,origin}=fixture('-11_-4'),court=data.objects.find(r=>r.kind==='honor_court')!,points:number[]=[];
  // A narrow 18 cm ridge crosses a paver internally; its four corners are flat.
  const stations=[[-300,45],[8,45],[8.2,45.18],[8.4,45],[300,45]];
  for(let i=0;i<stations.length-1;i++) {
   const[v0,y0]=stations[i],[v1,y1]=stations[i+1];
   for(const[u,y,v]of[[-300,y0,v0],[300,y0,v0],[300,y1,v1],[-300,y0,v0],[300,y1,v1],[-300,y1,v1]])points.push(court.frame.start[0]+u-origin[0],y-origin[1],-court.frame.start[1]-v-origin[2]);
  }
  terrain.geometry=new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(points,3));
  const original=Array.from(terrain.geometry.getAttribute('position').array);
  applyMemorialDetails(group,'-11_-4',origin,level);group.updateMatrixWorld(true);
  const paving:THREE.Mesh[]=[];group.traverse(o=>{if(o instanceof THREE.Mesh&&o.userData.townCrafted&&(o.material as THREE.Material).name.includes('paving'))paving.push(o);});
  expect(paving.length).toBe(1);expect((paving[0].material as THREE.MeshStandardMaterial).userData.pedestrianGroundFinish.id).toBe('MON-004-court');const ray=new THREE.Raycaster();ray.ray.direction.set(0,-1,0);
  for(let v=7.825;v<8.6;v+=.05)for(let u=-.575;u<.2;u+=.05) {
   ray.ray.origin.set(court.frame.start[0]+u-origin[0],1000,-court.frame.start[1]-v-origin[2]);
   const ground=ray.intersectObject(terrain)[0],paver=ray.intersectObjects(paving)[0];
   expect(ground).toBeDefined();expect(paver).toBeDefined();expect(paver.point.y-ground.point.y).toBeCloseTo(.04,4);
  }
  expect(Array.from(terrain.geometry.getAttribute('position').array)).toEqual(original);
 });
 it('fails closed without source terrain and ignores unrelated cells',()=>{
  const group=new THREE.Group();expect(applyMemorialDetails(group,'50_50',[12500,0,-12500])).toBeUndefined();
  const result=applyMemorialDetails(group,'-12_-4',[-3000,0,1000])!;expect(result.ids).toEqual([]);expect(result.addedTriangles).toBe(0);expect(result.skipped.length).toBe(2);
 });
});
