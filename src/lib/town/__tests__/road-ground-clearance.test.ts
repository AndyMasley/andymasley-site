// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
const catalog=vi.hoisted(()=>({sourceManifestSha256:'',tiles:{} as Record<string,unknown>}));
const index=vi.hoisted(()=>({sourceRegistrationSha256:'registration',tiles:{} as Record<string,{origin:number[];levels:Record<string,unknown>}>}));
vi.mock('../../../../data/derived/town/road-ground-clearance.json',()=>({default:catalog}));
vi.mock('../../../../data/derived/town/road-ground-clearance-index.json',()=>({default:index}));
import terrainIndex from '../../../../data/derived/town/terrain-finish-index.json';
import { applyRoadGroundClearance, validRoadGroundClearancePacket, type RoadGroundClearancePacket } from '../road-ground-clearance';
import { deriveRoadGroundClearance, roadGroundPieces } from '../road-ground-partition';
catalog.sourceManifestSha256=terrainIndex.sourceManifestSha256;
import { terrainGeometryStamp } from '../terrain-finish';
const square=(x0:number,x1:number,y0:number,y1:number,z:number)=>[[[x0,y0,z],[x1,y0,z],[x1,y1,z]],[[x0,y0,z],[x1,y1,z],[x0,y1,z]]];
const cross=(a:readonly number[],b:readonly number[],c:readonly number[])=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
const area=(p:readonly(readonly number[])[])=>Math.abs(p.reduce((n,a,i)=>{const b=p[(i+1)%p.length];return n+a[0]*b[1]-a[1]*b[0];},0))/2;
function sample(pieces:NonNullable<ReturnType<typeof roadGroundPieces>>,x:number,y:number):number[]{
  return pieces.filter(p=>{const signs=p.polygon.map((a,i)=>cross(a,p.polygon[(i+1)%p.polygon.length],[x,y]));return signs.every(s=>s>=-1e-7)||signs.every(s=>s<=1e-7);}).map(p=>p.plane[0]*x+p.plane[1]*y+p.plane[2]);
}
describe('registered road-ground clearance',()=>{
  it('clears the complete road face and conserves the surrounding terrain footprint',()=>{
    const source=[[-2,-2,.4],[4,-2,.4],[-2,4,.4]],roads=square(0,1,0,1,0),pieces=roadGroundPieces(source,roads)!;
    expect(pieces).toBeDefined();expect(pieces.reduce((n,p)=>n+area(p.polygon),0)).toBeCloseTo(area(source),8);
    for(let x=.05;x<1;x+=.1)for(let y=.05;y<1;y+=.1)for(const z of sample(pieces,x,y))expect(z).toBeCloseTo(-.035,7);
    expect(sample(pieces,-1,0)).toEqual([.4]);
  });
  it('joins adjacent independently triangulated faces without a height seam',()=>{
    const roads=square(-.4,.4,-.4,.4,0),a=roadGroundPieces([[-2,-2,.6],[2,-2,.6],[2,2,.6]],roads)!,b=roadGroundPieces([[-2,-2,.6],[2,2,.6],[-2,2,.6]],roads)!;
    for(let t=-1.5;t<=1.5;t+=.02){const heights=[...sample(a,t,t),...sample(b,t,t)];expect(heights.length).toBeGreaterThanOrEqual(2);expect(Math.max(...heights)-Math.min(...heights)).toBeLessThan(1e-7);}
  });
  it('tapers back to the exact input surface within the exterior buffer and caps lowering',()=>{
    const pieces=roadGroundPieces([[-3,-3,1.2],[6,-3,1.2],[-3,6,1.2]],square(0,1,0,1,0))!;
    expect(sample(pieces,.5,.5)[0]).toBeCloseTo(.4,7);
    expect(sample(pieces,-.375,.5)[0]).toBeGreaterThan(.4);expect(sample(pieces,-.375,.5)[0]).toBeLessThan(1.2);
    expect(sample(pieces,-.75,.5)[0]).toBeCloseTo(1.2,7);
    expect(sample(pieces,-1,.5)[0]).toBeCloseTo(1.2,7);
    for(const p of pieces)for(const q of p.polygon){const z=p.plane[0]*q[0]+p.plane[1]*q[1]+p.plane[2];expect(z).toBeGreaterThanOrEqual(.4-1e-7);expect(z).toBeLessThanOrEqual(1.2+1e-7);}
  });
  it('keeps shared-edge continuity on differently sloped source faces and does not amplify LOD height differences',()=>{
    const roads=square(-.4,.4,-.4,.4,0),a=roadGroundPieces([[-2,-2,.2],[2,-2,.7],[2,2,.6]],roads)!,b=roadGroundPieces([[-2,-2,.2],[2,2,.6],[-2,2,.9]],roads)!;
    for(let t=-1.5;t<=1.5;t+=.05){const heights=[...sample(a,t,t),...sample(b,t,t)];expect(heights.length).toBeGreaterThanOrEqual(2);expect(Math.max(...heights)-Math.min(...heights)).toBeLessThan(1e-7);}
    const lower=roadGroundPieces([[-2,-2,.2],[4,-2,.4],[-2,4,.5]],roads)!,upper=roadGroundPieces([[-2,-2,.4],[4,-2,.6],[-2,4,.7]],roads)!;
    for(let x=-1;x<=.9;x+=.1)for(let y=-1;y<=.9;y+=.1){const low=sample(lower,x,y),high=sample(upper,x,y);for(const z of low)for(const w of high)expect(w-z).toBeLessThanOrEqual(.2000001);}
  });
  it('retains already clear ground below a bridge deck and rejects degenerate support',()=>{
    const ground=[[-2,-2,0],[4,-2,0],[-2,4,0]];
    expect(roadGroundPieces(ground,square(0,1,0,1,8))).toBeUndefined();
    expect(roadGroundPieces(ground,[[[0,0,0],[1,0,0],[2,0,0]]])).toBeUndefined();
  });
});
function fixture(id:string){
  const group=new THREE.Group();group.position.set(200,10,-500);
  const make=(name:string,points:number[][][],materialName:string)=>{const geometry=new THREE.BufferGeometry(),flat=points.flat();geometry.setAttribute('position',new THREE.Float32BufferAttribute(flat.flatMap(([x,n,y])=>[x,y,-n]),3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(flat.flatMap(([x,n])=>[x/4,n/4]),2));geometry.computeVertexNormals();const material=new THREE.MeshStandardMaterial();material.name=materialName;const mesh=new THREE.Mesh(geometry,material);mesh.name=name;group.add(mesh);return mesh;};
  const road=make('road',square(0,1,0,1,0),'Drive road | asphalt'),ground=make('terrain',square(-2,3,-2,3,.4),'Ground'),other=make('house',square(6,8,6,8,2),'V2 inferred | roof');
  catalog.tiles[id]={sourceSha256:['a'.repeat(64)],meshes:[{name:'road',geometryStamp:terrainGeometryStamp(road.geometry),triangles:[0,1]}]};index.tiles[id]={origin:[200,10,-500],levels:{'0':{url:'fixture'}}};const derived=deriveRoadGroundClearance(group.clone(true),id,[200,10,-500],0,'a'.repeat(64));const packet={...derived.packet,sourceRegistrationSha256:index.sourceRegistrationSha256} as RoadGroundClearancePacket;return{group,road,ground,other,packet};
}
describe('source guarded terrain geometry',()=>{
  it('preserves road and unrelated geometry, original attributes, UV projection, transforms and idempotence',()=>{
    const{group,road,ground,other,packet}=fixture('valid'),roadBefore=road.geometry,houseBefore=other.geometry,oldPosition=Array.from(ground.geometry.getAttribute('position').array),oldUV=Array.from(ground.geometry.getAttribute('uv').array);
    const report=applyRoadGroundClearance(group,'valid',[200,10,-500],0,'a'.repeat(64),packet)!;expect(report.rejected).toBe(false);expect(report.replacedTriangles).toBeGreaterThan(0);expect(report.maximumDropM).toBeCloseTo(.435,6);
    expect(road.geometry).toBe(roadBefore);expect(other.geometry).toBe(houseBefore);expect(group.position.toArray()).toEqual([200,10,-500]);
    const position=ground.geometry.getAttribute('position'),uv=ground.geometry.getAttribute('uv');expect(Array.from(position.array).slice(0,oldPosition.length)).toEqual(oldPosition);expect(Array.from(uv.array).slice(0,oldUV.length)).toEqual(oldUV);
    for(let i=0;i<position.count;i++){expect(uv.getX(i)).toBeCloseTo(position.getX(i)/4,6);expect(uv.getY(i)).toBeCloseTo(-position.getZ(i)/4,6);}
    expect(applyRoadGroundClearance(group,'valid',[200,10,-500],0,'a'.repeat(64),packet)!).toBe(report);
  });
  it('keeps the entire scene when its source or road geometry predecessor changes',()=>{
    const{group,road,ground,packet}=fixture('guard'),before=ground.geometry;
    expect(applyRoadGroundClearance(group,'guard',[200,10,-500],0,'other',packet)!.rejected).toBe(true);expect(ground.geometry).toBe(before);
    road.geometry.getAttribute('position').setY(0,2);
    expect(applyRoadGroundClearance(group,'guard',[200,10,-500],0,'a'.repeat(64),packet)!.rejected).toBe(true);expect(ground.geometry).toBe(before);
    expect(applyRoadGroundClearance(group,'unregistered',[200,10,-500],0,'a'.repeat(64))).toBeUndefined();expect(ground.geometry).toBe(before);
  });
  it('rejects malformed packets and changed terrain before mutating',()=>{
    const {group,ground,packet}=fixture('terrain-guard'),before=ground.geometry;
    expect(validRoadGroundClearancePacket(packet,'terrain-guard')).toBe(true);
    expect(validRoadGroundClearancePacket({...packet,sourceRegistrationSha256:'other'},'terrain-guard')).toBe(false);
    ground.geometry.getAttribute('position').setY(0,3);
    expect(applyRoadGroundClearance(group,'terrain-guard',[200,10,-500],0,'a'.repeat(64),packet)?.rejected).toBe(true);
    expect(ground.geometry).toBe(before);
  });

});
