// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { StairRoadClearance, type StairBlock } from '../stair-road-clearance';
import { applyEvidenceBuildings } from '../evidence-buildings';
import { Batch } from '../crafted-frontages';
import type { EvidenceBuilding } from '../evidence-types';

const frame = { start: [0, 0], tangent: [1, 0], outward: [0, 1], structId: 'stairs' };
function road(group: THREE.Group, north: number, name = 'Drive road | asphalt', height = 0): THREE.Mesh {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([-10,height,-north,10,height,-north,10,height,-(north+5),-10,height,-north,10,height,-(north+5),-10,height,-(north+5)],3));
  const material = new THREE.MeshStandardMaterial(); material.name = name;
  const mesh = new THREE.Mesh(geometry,material); group.add(mesh); return mesh;
}
const flight = (count = 6): StairBlock[] => Array.from({ length: count }, (_,i) => ({u:0,v:.3+i*.28,width:1.2,depth:.3,bottom:-.02,top:(count-i)*.18-.02}));
function dispose(group: THREE.Object3D) { group.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();for(const m of [o.material].flat())m.dispose();}}); }

describe('generated stairs beside actual roads',()=>{
  it('preserves a complete safe flight and does not mutate it',()=>{
    const group=new THREE.Group();road(group,3);const blocks=flight(),before=structuredClone(blocks),clearance=new StairRoadClearance(group,[0,0,0]);
    expect(clearance.fitFlight(frame,blocks)).toEqual(blocks);expect(blocks).toEqual(before);expect(clearance.decisions).toEqual([]);dispose(group);
  });
  it('compacts a run while keeping every tread at least24cm and retaining all riser heights',()=>{
    const group=new THREE.Group();road(group,1.7);const blocks=flight(),clearance=new StairRoadClearance(group,[0,0,0]),fit=clearance.fitFlight(frame,blocks)!;
    expect(fit).toHaveLength(6);expect(fit.map(b=>b.top)).toEqual(blocks.map(b=>b.top));expect(clearance.fits(frame,fit)).toBe(true);
    for(let i=1;i<fit.length;i++){expect(fit[i].v-fit[i-1].v).toBeCloseTo(.24,9);expect(fit[i].v-fit[i].depth/2).toBeLessThan(fit[i-1].v+fit[i-1].depth/2);}
    expect(clearance.decisions[0].status).toBe('compacted');dispose(group);
  });
  it('omits an entire unsupported run instead of returning isolated or partial steps',()=>{
    const group=new THREE.Group();road(group,.4);const clearance=new StairRoadClearance(group,[0,0,0]);
    expect(clearance.fitFlight(frame,flight())).toBeUndefined();expect(clearance.decisions).toMatchObject([{id:'stairs',status:'omitted',blocks:6}]);dispose(group);
  });
  it('preserves the full entry landing when shortening the flight below it',()=>{
    const group=new THREE.Group();road(group,1.7);const landing={u:0,v:.48,width:1.45,depth:.96,bottom:0,top:.8},blocks=[landing,...flight(3).map((b,i)=>({...b,v:1.105+i*.29,depth:.30}))],clearance=new StairRoadClearance(group,[0,0,0]);
    const fit=clearance.fitFlight(frame,blocks)!;expect(fit).toBeDefined();expect(fit[0]).toEqual(landing);expect(clearance.fits(frame,fit)).toBe(true);dispose(group);
  });
  it('does not treat parking lots, overhead bridges or grade-level paving as a stair obstruction',()=>{
    for(const [name,height]of [['Streetscape | parking apron asphalt',0],['Drive road | asphalt',6],['Drive road | asphalt',-6]] as const){const group=new THREE.Group();road(group,.1,name,height);expect(new StairRoadClearance(group,[0,0,0]).fitFlight(frame,flight())).toEqual(flight());dispose(group);}
    const group=new THREE.Group();road(group,.1);expect(new StairRoadClearance(group,[0,0,0]).fits(frame,[{...flight(1)[0],top:.03}])).toBe(true);dispose(group);
  });
  it('checks real triangles, including a narrow corner overlap missed by point samples',()=>{
    const group=new THREE.Group(),mesh=road(group,100);mesh.geometry.dispose();mesh.geometry=new THREE.BufferGeometry();
    mesh.geometry.setAttribute('position',new THREE.Float32BufferAttribute([.57,0,-.14,.7,0,-.14,.57,0,-.3],3));
    expect(new StairRoadClearance(group,[0,0,0]).fits(frame,[flight(1)[0]])).toBe(false);dispose(group);
  });
  it('uses inventory road materials and retains tile/world transforms',()=>{
    const group=new THREE.Group();group.position.set(600,80,-900);const mesh=road(group,.4,'Drive road | asphalt | gravel inventory surface');(mesh.material as THREE.Material).userData.townRoadSurfaceType=2;
    const moved={...frame,start:[600,900]};expect(new StairRoadClearance(group,[600,80,-900]).fitFlight(moved,flight().map(b=>({...b,top:b.top+80,bottom:b.bottom+80})))).toBeUndefined();dispose(group);
  });
  it('fits the whole inferred deck envelope while preserving its wall attachment and height',()=>{
    const group=new THREE.Group();road(group,1.43);const clearance=new StairRoadClearance(group,[0,0,0]),deck={u:0,v:1.2,width:4,depth:2.4,bottom:0,top:2};
    const depth=clearance.fitProjection(frame,deck)!;expect(depth).toBeGreaterThanOrEqual(1.42);expect(depth).toBeLessThanOrEqual(1.43);expect(depth).toBeGreaterThanOrEqual(1);expect(clearance.fits(frame,[{...deck,v:depth/2,depth}])).toBe(true);expect(clearance.decisions[0]).toMatchObject({feature:'deck',status:'compacted'});dispose(group);
  });
  it('does not leave a narrow unusable deck fragment when no complete minimum-depth deck fits',()=>{
    const group=new THREE.Group();road(group,.8);const clearance=new StairRoadClearance(group,[0,0,0]);expect(clearance.fitProjection(frame,{u:0,v:1.2,width:4,depth:2.4,bottom:0,top:2})).toBeUndefined();expect(clearance.decisions[0]).toMatchObject({feature:'deck',status:'omitted'});dispose(group);
  });
  it('keeps the photographed door and main floor unchanged when its inferred stair flight would occupy a road',()=>{
    const home:EvidenceBuilding={id:'stairs',tileId:'t',address:'Fixture',outline:[[0,0],[10,0],[10,-8],[0,-8]],frames:[{...frame,width:10,front:true,groundMaximum:0,clearanceM:0.454}],base:0,floor:.9,eave:6,peak:9,stories:2,style:'COLONIAL',year:1900,material:'siding',paint:'#deded2',roof:'retained',porch:'none',entry:null,documented:false,evidenceIds:[],colorsDated:true};
    const group=new THREE.Group(),geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute([4,1,.05,4.1,1,.05,4,1.1,.05],3));const material=new THREE.MeshStandardMaterial();material.name='V2 inferred | siding';group.add(new THREE.Mesh(geometry,material));road(group,.4);
    const boxes=vi.spyOn(Batch.prototype,'box'),before=structuredClone(home);
    try{applyEvidenceBuildings(group,'t',[0,0,0],0,[home],[],undefined,[],[{id:home.id,k:'h',o:[5,-4],b:0,f:{porch:'none',lo:{d:[50],w1:[20,80],st:2}}}]);
      expect(boxes.mock.calls.some(c=>c[1]==='door')).toBe(true);expect(boxes.mock.calls.filter(c=>c[1]==='foundation'&&c[8]==='#a19f93')).toHaveLength(0);expect(group.userData.stairRoadClearance).toMatchObject([{id:home.id,status:'omitted'}]);expect(home).toEqual(before);
    }finally{boxes.mockRestore();dispose(group);}
  });
});
