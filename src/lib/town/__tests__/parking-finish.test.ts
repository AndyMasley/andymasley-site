// @vitest-environment node
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { applyParkingFinish, layoutParking, parkingBayFits, validParkingPacket, type ParkingLot } from '../parking-finish';

const outer: [number,number][]=[[0,0],[54,0],[54,38],[0,38],[0,0]];
const lot: ParkingLot={id:'lot',tileId:'a',center:[27,19],material:'asphalt',sourcePolygons:[[outer]],polygons:[[outer]],markingPolygons:[[outer]],striping:'authored-permitted'};
describe('conservative authored parking',()=>{
  it('leaves real-sized aisles and never places bays in an island or narrow throat',()=>{
    const island: [number,number][]=[[25,8],[31,8],[31,28],[25,28],[25,8]];
    const scoped={...lot,markingPolygons:[[outer,island]]};
    const bays=layoutParking(scoped);
    expect(bays.length).toBeGreaterThan(10);
    for(const bay of bays){
      expect(parkingBayFits(bay.corners,scoped.markingPolygons)).toBe(true);
      expect(Math.hypot(bay.corners[0][0]-bay.corners[1][0],bay.corners[0][1]-bay.corners[1][1])).toBeCloseTo(2.65);
      expect(Math.hypot(bay.corners[1][0]-bay.corners[2][0],bay.corners[1][1]-bay.corners[2][1])).toBeCloseTo(5.1);
    }
    expect(parkingBayFits([[23,6],[33,6],[33,30],[23,30]],[[outer,island]])).toBe(false);
    expect(layoutParking({...lot,material:'gravel'})).toEqual([]);
    expect(layoutParking({...lot,striping:'none'})).toEqual([]);
    expect(layoutParking({...lot,sourcePolygons:[[[[0,0],[50,0],[50,8],[0,8],[0,0]]]]})).toEqual([]);
  });
  it('reserves space around retained shade-tree trunks',()=>{
    const bays=layoutParking(lot),center=bays[0].corners.reduce((s,p)=>[s[0]+p[0]/4,s[1]+p[1]/4] as [number,number],[0,0] as [number,number]);
    const withTree=layoutParking({...lot,treeIslands:[{center,radiusM:1.15}]});
    expect(withTree.length).toBeLessThan(bays.length);
    expect(withTree.some(bay=>bay.corners.every((p,i)=>p.every((v,k)=>v===bays[0].corners[i][k])))).toBe(false);
  });
  it('keeps the same layout under reordered polygon winding',()=>{
    const a=layoutParking(lot),b=layoutParking({...lot,sourcePolygons:[[outer.slice().reverse()]]});
    expect(a.length).toBe(b.length);
    expect(layoutParking(lot)).toEqual(a);
  });
  it('drapes paint over sloping ground and an overlapping parking apron, with upward winding',()=>{
    const group=new THREE.Group(),origin:[number,number,number]=[100,10,-200];
    const shifted={...lot,center:[127,219] as [number,number],sourcePolygons:lot.sourcePolygons.map(p=>p.map(r=>r.map(([x,y])=>[x+100,y+200] as [number,number])))};
    shifted.polygons=shifted.markingPolygons=shifted.sourcePolygons;
    const ground=new THREE.PlaneGeometry(54,38,2,2).rotateX(-Math.PI/2).translate(27,0,-19);
    const position=ground.getAttribute('position');for(let i=0;i<position.count;i++)position.setY(i,position.getX(i)*.03);
    const mesh=new THREE.Mesh(ground,new THREE.MeshStandardMaterial());mesh.name='terrain';group.add(mesh);
    const apronGeometry=new THREE.PlaneGeometry(54,38).rotateX(-Math.PI/2).translate(27,0,-19);
    const ap=apronGeometry.getAttribute('position');for(let i=0;i<ap.count;i++)ap.setY(i,ap.getX(i)*.03+.1);
    const material=new THREE.MeshStandardMaterial();material.name='Streetscape | parking apron asphalt';group.add(new THREE.Mesh(apronGeometry,material));
    const before=Array.from(position.array),packet={version:1,tileId:'a',lots:[shifted]};
    group.position.fromArray(origin);
    const report=applyParkingFinish(group,'a',origin,packet);
    expect(report.bays).toBeGreaterThan(10);expect(report.triangles).toBeGreaterThan(20);
    expect(Array.from(position.array)).toEqual(before);
    const paint=group.children.find(o=>o.name==='Finished parking | authored bays') as THREE.Mesh;
    const pp=paint.geometry.getAttribute('position'),normals=paint.geometry.getAttribute('normal');
    for(let i=0;i<pp.count;i++){expect(pp.getY(i)-pp.getX(i)*.03).toBeCloseTo(.114,4);expect(normals.getY(i)).toBeGreaterThan(.99);}
    expect(applyParkingFinish(group,'a',origin,packet)).toBe(report);
    expect(group.children.filter(o=>o.name===paint.name)).toHaveLength(1);
  });
  it('refuses malformed or cross-tile packets',()=>{
    const packet={version:1,tileId:'a',lots:[lot]};
    expect(validParkingPacket(packet,'a')).toBe(true);
    expect(validParkingPacket(packet,'b')).toBe(false);
    expect(validParkingPacket({...packet,lots:[{...lot,center:[NaN,2]}]},'a')).toBe(false);
  });
  it('drops paving slivers that collapse in GPU precision',()=>{
    const group=new THREE.Group(),geometry=new THREE.PlaneGeometry(54,38).rotateX(-Math.PI/2).translate(27,0,-19);
    const terrain=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial());terrain.name='terrain';group.add(terrain);
    const x=50.12345,tiny:[number,number][]=[[x,5],[x+1e-7,5],[x+1e-7,20],[x,20],[x,5]];
    const narrow={...lot,polygons:[[tiny]],markingPolygons:[],striping:'none' as const};
    const report=applyParkingFinish(group,'a',[0,0,0],{version:1,tileId:'a',lots:[narrow]});
    expect(report.pavingTriangles).toBe(0);
    expect(group.children).toHaveLength(1);
  });
});
