// @vitest-environment node
import {describe,it,expect} from 'vitest';
import * as THREE from 'three';
import catalog from '../../../../data/derived/town/crafted-frontages.json';
import {applyCraftedFrontages,renderedSidewalkEdges} from '../crafted-frontages';
const home=catalog.school.find(h=>h.number==='121')!,origin=new THREE.Vector3(-3250,0,1250);
function patch(name:string,a:number,b:number,c:number,d:number){
 const positions:number[]=[];const p=(u:number,v:number)=>new THREE.Vector3(home.start[0]+home.tangent[0]*u+home.outward[0]*v-origin.x,40+.025*u-origin.y,-home.start[1]-home.tangent[1]*u-home.outward[1]*v-origin.z);
 for(const points of [[p(a,c),p(a,d),p(b,d)],[p(a,c),p(b,d),p(b,c)]]){if(points[1].clone().sub(points[0]).cross(points[2].clone().sub(points[0])).y<0)points.reverse();positions.push(...points.flatMap(p=>p.toArray()));}
 const g=new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.computeVertexNormals();const m=new THREE.MeshStandardMaterial();m.name=name;return new THREE.Mesh(g,m);
}
function dispose(group:THREE.Object3D){const mats=new Set<THREE.Material>();group.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])mats.add(m);}});mats.forEach(m=>m.dispose());}
describe('documented retaining edges clear the actual source sidewalk',()=>{
 it('uses its property side and rejects unrelated concrete or transverse fragments',()=>{
  const g=new THREE.Group();g.add(patch('Crafted frontage | trim | #bbb9a8',0,home.width,1,2),patch('Streetscape | warm sidewalk concrete',0,.2,2,6));
  expect(renderedSidewalkEdges(g,origin,[home]).size).toBe(0);
  g.add(patch('Streetscape | warm sidewalk concrete',0,home.width,3.6,5.8));
  expect(renderedSidewalkEdges(g,origin,[home]).get(home.structId)).toBeCloseTo(3.6,4);dispose(g);
 });
 it('keeps the full cap outside the sidewalk, embeds its footing, preserves the entrance and emits outward faces',()=>{
  for(const level of [0,1,2]){
   const g=new THREE.Group(),walk=patch('Streetscape | warm sidewalk concrete',0,home.width,3.6,5.8),terrain=patch('Realism aerial viewport512 | ground_000.jpg',-1,home.width+1,-2,home.approachM+2);
   const before=Array.from(walk.geometry.getAttribute('position').array);g.add(walk,terrain,patch('Reference | School 121 wall',0,1,0,1));
   const r=applyCraftedFrontages(g,home.tileId,origin.toArray(),level)!,wall=r.retainingWalls.find(w=>w.number==='121')!;
   expect(wall.status).toBe('placed');expect(wall.sidewalkV!-wall.wallV!-.18).toBeCloseTo(.12,6);expect(wall.segments).toHaveLength(2);
   expect(wall.segments[1][0]-wall.segments[0][1]).toBeCloseTo(1.6,8);
   for(const [a,b,ya,yb,ta,tb]of wall.segments){expect(Math.max(ya,yb)).toBeLessThanOrEqual(40+.025*a-.03);expect(ta).toBeCloseTo(40+.025*a+.28,4);expect(tb).toBeCloseTo(40+.025*b+.28,4);}
   for(const range of wall.geometryRanges!){const mesh=g.children.find(o=>o.name==='Crafted buildings and frontages')!.children.find(o=>o instanceof THREE.Mesh&&o.material.name===`Crafted frontage | ${range.key.replace(':',' | ')}`) as THREE.Mesh;const p=mesh.geometry.getAttribute('position'),n=mesh.geometry.getAttribute('normal');for(let i=range.start;i<range.start+range.count;i+=3){const a=new THREE.Vector3().fromBufferAttribute(p,i),b=new THREE.Vector3().fromBufferAttribute(p,i+1),c=new THREE.Vector3().fromBufferAttribute(p,i+2),cross=b.sub(a).cross(c.sub(a));expect(cross.length()).toBeGreaterThan(.0001);expect(cross.normalize().dot(new THREE.Vector3().fromBufferAttribute(n,i))).toBeGreaterThan(.999);}}
   expect(Array.from(walk.geometry.getAttribute('position').array)).toEqual(before);dispose(g);
  }
 });
 it('omits walls when no current terrain support exists rather than falling back to an old height grid',()=>{
  const g=new THREE.Group();g.add(patch('Streetscape | warm sidewalk concrete',0,home.width,3.6,5.8),patch('Reference | School 121 wall',0,1,0,1));
  const report=applyCraftedFrontages(g,home.tileId,origin.toArray())!;
  expect(report.retainingWalls.find(w=>w.number==='121')!.status).toBe('omitted-no-ground');dispose(g);
 });
});
