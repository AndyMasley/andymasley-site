// @vitest-environment node
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Batch } from '../crafted-frontages';
import { HouseDressing, type RoadLookup } from '../house-dressing';

const origin=[1000,60,-2000];
function fixture({bridge=false,road=false,terrain=true,foundationHeight=70}:{bridge?:boolean;road?:boolean;terrain?:boolean;foundationHeight?:number}={}) {
  const group=new THREE.Group(),batch=new Batch(new THREE.Vector3(...origin),0);
  batch.box({start:[1000,2010],tangent:[1,0],outward:[0,-1],structId:'home',tileId:'t'},'foundation',10,foundationHeight+.3,.022,20,.6,.08);
  const walls=batch.finish().group;if(bridge)walls.name='Evidence bridge details';group.add(walls);
  if(terrain){const ground=new THREE.Mesh(new THREE.PlaneGeometry(100,100).rotateX(-Math.PI/2).translate(10,10,0));ground.name='terrain';group.add(ground);}
  if(road){const material=new THREE.MeshStandardMaterial();material.name='Drive road | asphalt';group.add(new THREE.Mesh(new THREE.PlaneGeometry(100,4).rotateX(-Math.PI/2).translate(10,10.02,-8),material));}
  const roads:RoadLookup={nearestRoad:(e,n)=>({x:e,n:2008,z:70,tx:1,tn:0,width:4,type:5,distance:Math.abs(n-2008)})};
  group.position.fromArray(origin);const dressing=new HouseDressing(roads);
  return{group,dressing};
}
function roots(group:THREE.Group){const shrub=group.getObjectByName('House dressing | foundation shrubs') as THREE.InstancedMesh|undefined,m=new THREE.Matrix4(),rows:number[][]=[];if(shrub)for(let i=0;i<shrub.count;i++){shrub.getMatrixAt(i,m);rows.push([m.elements[12],m.elements[13],m.elements[14]]);}return rows;}

describe('generated foundation planting',()=>{
  it('keeps legitimate building planting while refusing bridge abutments sharing its material',()=>{
    const home=fixture(),bridge=fixture({bridge:true});
    expect(home.dressing.apply(home.group,origin,0).shrubs).toBeGreaterThan(5);
    expect(bridge.dressing.apply(bridge.group,origin,0).shrubs).toBe(0);
    home.dressing.dispose();bridge.dressing.dispose();
  });
  it('checks actual asphalt under the complete shrub crown rather than a sampled road centerline',()=>{
    const {group,dressing}=fixture({road:true}),report=dressing.apply(group,origin,0);
    expect(report.frontWalls).toBeGreaterThan(0);expect(report.shrubs).toBe(0);expect(report.beds).toBe(0);
    dressing.dispose();
  });
  it('requires real terrain and never hangs inferred planting at a high foundation edge',()=>{
    const absent=fixture({terrain:false}),raised=fixture({foundationHeight:78});
    expect(absent.dressing.apply(absent.group,origin,0).shrubs).toBe(0);
    expect(raised.dressing.apply(raised.group,origin,0).shrubs).toBeGreaterThan(5);
    for(const [,y]of roots(raised.group))expect(y).toBeCloseTo(9.96,5);
    absent.dressing.dispose();raised.dressing.dispose();
  });
});
