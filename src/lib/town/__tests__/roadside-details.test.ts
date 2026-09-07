// @vitest-environment node
import {describe,it,expect} from 'vitest';
import * as THREE from 'three';
import {applyRoadsideDetails,validRoadsidePacket,type RoadsidePacket} from '../roadside-details';

const hash='a'.repeat(64);
function fixture(){
  const group=new THREE.Group(),terrain=new THREE.Mesh(new THREE.PlaneGeometry(250,250).rotateX(-Math.PI/2).translate(125,40,-125),new THREE.MeshBasicMaterial());terrain.name='terrain';group.add(terrain);
  const p:RoadsidePacket={version:1,tileId:'0_0',origin:[0,0,0],sourceLods:{'0':hash,'1':hash,'2':hash},objects:[
    {id:'box',kind:'post-box',point:[25,25],base:40,normal:[0,1],label:'',evidence:'Mapped collection box; blue form inferred'},
    {id:'stop',kind:'stop',point:[30,30],base:40,normal:[.6,.8],label:'STOP',evidence:'All-way OSM node; safe approach allocation'},
    {id:'bus',kind:'bus-stop',point:[35,35],base:40,normal:[0,-1],label:'WRTA\n42',evidence:'Published agency stop'},
    {id:'pole',kind:'utility-pole',point:[60,60],base:40,normal:[1,0],label:'',height:9.5,light:true,wireEnd:[100,60,49.31],evidence:'Inferred corridor utilities'},
  ]};return{group,terrain,p};
}
describe('source-gated roadside details',()=>{
  it('rejects wrong source identity, origin, incomplete pole, duplicate IDs and implausible wires',()=>{
    const{group,p}=fixture();expect(validRoadsidePacket(p,'0_0')).toBe(true);
    expect(applyRoadsideDetails(group,'0_0',[0,0,0],0,'b'.repeat(64),p)?.rejected).toBe(true);
    expect(applyRoadsideDetails(group,'0_0',[1,0,0],0,hash,p)?.rejected).toBe(true);
    for(const mutate of [(p:RoadsidePacket)=>{delete p.objects[3].height;},(p:RoadsidePacket)=>{p.objects[1].id='box';},(p:RoadsidePacket)=>{p.objects[3].wireEnd=[1000,0,50];},(p:RoadsidePacket)=>{p.objects[0].normal=[2,0];}]){const copy=structuredClone(p);mutate(copy);expect(validRoadsidePacket(copy,'0_0')).toBe(false);}
    expect(group.children).toHaveLength(1);
  });
  it.each([0,1,2])('preserves source geometry and emits finite outward triangles at LOD %s',level=>{
    const{group,terrain,p}=fixture(),original=terrain.geometry,bytes=Array.from(original.getAttribute('position').array),material=terrain.material;
    const report=applyRoadsideDetails(group,'0_0',[0,0,0],level,hash,p)!;expect(report.ids).toHaveLength(4);expect(report.skipped).toEqual([]);expect(report.wireSpans).toBe(1);expect(report.addedMeshes).toBeLessThan(17);expect(report.addedTriangles).toBeLessThan(3500);
    expect(applyRoadsideDetails(group,'0_0',[0,0,0],level,hash,p)).toBe(report);expect(terrain.geometry).toBe(original);expect(terrain.material).toBe(material);expect(Array.from(original.getAttribute('position').array)).toEqual(bytes);
    let invalid=0,zero=0,backwards=0,error=0;const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),n=new THREE.Vector3();
    group.getObjectByName('Research roadside details')!.traverse(o=>{if(!(o instanceof THREE.Mesh))return;for(const attr of Object.values(o.geometry.attributes) as THREE.BufferAttribute[])for(const v of attr.array)invalid+=Number(!Number.isFinite(v));const p=o.geometry.getAttribute('position'),normal=o.geometry.getAttribute('normal');for(let i=0;i<p.count;i+=3){a.fromBufferAttribute(p,i);b.fromBufferAttribute(p,i+1).sub(a);c.fromBufferAttribute(p,i+2).sub(a);const cross=b.cross(c);zero+=Number(cross.length()<1e-9);n.fromBufferAttribute(normal,i);backwards+=Number(cross.dot(n)<-1e-9);error=Math.max(error,Math.abs(n.length()-1));}});
    expect({invalid,zero,backwards}).toEqual({invalid:0,zero:0,backwards:0});expect(error).toBeLessThan(.0001);
  });
  it('keeps a sagging utility span above car and pedestrian clearance',()=>{
    const{group,p}=fixture();p.objects=p.objects.slice(3);applyRoadsideDetails(group,'0_0',[0,0,0],0,hash,p);let min=Infinity,count=0;
    group.getObjectByName('Research roadside details')!.traverse(o=>{if(!(o instanceof THREE.Mesh))return;const p=o.geometry.getAttribute('position');for(let i=0;i<p.count;i++)if(p.getX(i)>65&&p.getX(i)<95){min=Math.min(min,p.getY(i)-40);count++;}});
    expect(count).toBeGreaterThan(0);expect(min).toBeGreaterThan(8.8);
  });
  it('preserves lettering proportions on wide STOP and tall transit panels',()=>{
    const {group,p}=fixture();applyRoadsideDetails(group,'0_0',[0,0,0],0,hash,p);
    const mesh=group.getObjectByName('Research roadside | lettering') as THREE.Mesh,uv=mesh.geometry.getAttribute('uv');
    for(const [start,width,height] of [[0,.64,.18],[6,.32,.56]]){
      const u=Array.from({length:6},(_,i)=>uv.getX(start+i)),v=Array.from({length:6},(_,i)=>uv.getY(start+i));
      const imageAspect=(Math.max(...u)-Math.min(...u))*512/((Math.max(...v)-Math.min(...v))*1024);
      expect(Math.abs(imageAspect/(width/height)-1)).toBeLessThan(.05);
    }
    expect((mesh.material as THREE.MeshStandardMaterial).alphaTest).toBeGreaterThan(0);
  });
  it('fails closed when source terrain is absent or significantly different',()=>{
    const{p}=fixture();expect(applyRoadsideDetails(new THREE.Group(),'0_0',[0,0,0],0,hash,p)?.ids).toEqual([]);
    const{group}=fixture();group.children[0].position.y=5;const report=applyRoadsideDetails(group,'0_0',[0,0,0],0,hash,p)!;expect(report.ids).toEqual([]);expect(report.skipped).toHaveLength(4);
  });
});
