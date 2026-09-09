import * as THREE from 'three';
import data from '../../../data/derived/town/video-venue-details.json';
import { Batch, type Frame, type Role } from './crafted-frontages';

export const VIDEO_VENUE_DETAILS = data;
type FacadeInput = { nativeId: string; facadeId: string; frame: Frame; width: number; floor: number; top: number };
const BRICK = '#9c5845', PALE = '#e0ddd1', DARK = '#292e2b', GLASS = '#354b4e', DOOR = '#493a2f';
function registeredVenue(input:FacadeInput){
  const r=data.venues.find(r=>r.id===input.nativeId&&r.facadeId===input.facadeId&&r.tileId===input.frame.tileId);
  if(!r)return;
  const expected=[...r.frame.start,...r.frame.tangent,...r.frame.outward,r.frame.width,r.frame.floor,r.frame.top];
  const actual=[...input.frame.start,...input.frame.tangent,...input.frame.outward,input.width,input.floor,input.top];
  if(actual.length!==expected.length||actual.some((v,i)=>!Number.isFinite(v)||Math.abs(v-expected[i])>.00001))return;
  return r;
}

/** Remove the preceding authored generic shop front only after its specialized
 * replacement has built successfully. Native bodies/openings and the new
 * commercial mesh cannot enter this category/source/frame-qualified filter. */
export function retireSupersededVideoFrontages(group:THREE.Group,origin:THREE.Vector3,inputs:FacadeInput[]):number {
  const rows=inputs.map(registeredVenue).filter((r):r is NonNullable<typeof r>=>!!r);
  if(!rows.length)return 0;
  group.updateMatrixWorld(true);
  const inverse=group.matrixWorld.clone().invert(),point=new THREE.Vector3(),retired=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>();
  const meshes:THREE.Mesh[]=[];
  group.traverse(o=>{if(o instanceof THREE.Mesh&&o.userData.townCrafted===true&&o.userData.category==='crafted-frontages'&&o.name.startsWith('Crafted building frontage | '))meshes.push(o);});
  let removed=0;
  for(const mesh of meshes){
    const targets=rows.filter(r=>mesh.userData.sourceIds?.includes(r.id));if(!targets.length)continue;
    const g=mesh.geometry,p=g.getAttribute('position');
    // Batch frontages are nonindexed position/normal meshes. Unknown layouts
    // remain untouched rather than acquiring a guessed compaction path.
    if(!p||g.index||g.groups.length||Object.values(g.attributes).some(a=>a instanceof THREE.InterleavedBufferAttribute||!(a.array instanceof Float32Array)))continue;
    const matrix=inverse.clone().multiply(mesh.matrixWorld),keep:number[]=[];let count=0;
    for(let i=0;i<p.count;i+=3){
      const owned=targets.some(r=>[0,1,2].every(k=>{
        point.fromBufferAttribute(p,i+k).applyMatrix4(matrix).add(origin);
        const dx=point.x-r.frame.start[0],dn=-point.z-r.frame.start[1],u=dx*r.frame.tangent[0]+dn*r.frame.tangent[1],v=dx*r.frame.outward[0]+dn*r.frame.outward[1];
        return u>=-.50&&u<=r.frame.width+.50&&v>=-.26&&v<=.65&&point.y>=r.frame.floor-.5&&point.y<=r.frame.top+.65;
      }));
      if(owned)count++;else keep.push(i,i+1,i+2);
    }
    if(!count)continue;removed+=count;retired.add(g);
    if(!keep.length){for(const m of Array.isArray(mesh.material)?mesh.material:[mesh.material])materials.add(m);mesh.removeFromParent();continue;}
    const next=new THREE.BufferGeometry();
    for(const[name,a]of Object.entries(g.attributes)){
      const values=new Float32Array(keep.length*a.itemSize);
      for(let i=0;i<keep.length;i++)for(let k=0;k<a.itemSize;k++)values[i*a.itemSize+k]=a.array[keep[i]*a.itemSize+k];
      next.setAttribute(name,new THREE.BufferAttribute(values,a.itemSize,a.normalized));
    }
    next.computeBoundingBox();next.computeBoundingSphere();next.userData={...g.userData,retiredGenericVideoFrontage:true};mesh.geometry=next;
  }
  const keptGeometry=new Set<THREE.BufferGeometry>(),keptMaterials=new Set<THREE.Material>();
  group.traverse(o=>{if(o instanceof THREE.Mesh){keptGeometry.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])keptMaterials.add(m);}});
  for(const g of retired)if(!keptGeometry.has(g))g.dispose();
  for(const m of materials)if(!keptMaterials.has(m))m.dispose();
  return removed;
}
function panel(b: Batch, f: Frame, role: Role, u: number, bottom: number, v: number, width: number, height: number, color: string): void {
  b.polygon(f, role, [[u-width/2,bottom,v],[u+width/2,bottom,v],[u+width/2,bottom+height,v],[u-width/2,bottom+height,v]], color);
}
function beam(b: Batch, f: Frame, a: readonly number[], c: readonly number[], y: number, size: number, color: string): void {
  const du=c[0]-a[0],dv=c[1]-a[1];
  b.box(f,'trim',(a[0]+c[0])/2,y,(a[1]+c[1])/2,Math.hypot(du,dv)+size,size,size,color,-Math.atan2(dv,du));
}
function archedLight(b: Batch, f: Frame, u: number, bottom: number, width: number, height: number): void {
  const half=width/2,spring=bottom+height-half,v=.423;
  const points=[[u-half,bottom,v],[u+half,bottom,v],[u+half,spring,v]];
  const steps=b.level===2?4:8;
  for(let i=1;i<=steps;i++){const angle=Math.PI*i/steps;points.push([u+half*Math.cos(angle),spring+half*Math.sin(angle),v]);}
  b.polygon(f,'glass',points,GLASS);
  for(let i=0;i<steps;i++){
    const a=Math.PI*i/steps,c=Math.PI*(i+1)/steps,outer=half+.025;
    b.polygon(f,'trim',[[u+half*Math.cos(a),spring+half*Math.sin(a),v+.012],[u+outer*Math.cos(a),spring+outer*Math.sin(a),v+.012],[u+outer*Math.cos(c),spring+outer*Math.sin(c),v+.012],[u+half*Math.cos(c),spring+half*Math.sin(c),v+.012]],PALE);
  }
}
function bow(b: Batch, f: Frame, u: number, floor: number, d: typeof data.venues[number]['dimensions']): void {
  const half=d.bowWidth/2,bottom=floor+d.bowBottom,top=bottom+d.bowHeight;
  const path=[[u-half,d.bowBackOffset],[u-half*.64,d.bowFrontOffset],[u+half*.64,d.bowFrontOffset],[u+half,d.bowBackOffset]];
  for(let i=0;i<3;i++){
    const a=path[i],c=path[i+1];
    b.polygon(f,'glass',[[a[0],bottom,a[1]],[c[0],bottom,c[1]],[c[0],top,c[1]],[a[0],top,a[1]]],GLASS);
    beam(b,f,a,c,bottom-.055,.10,DARK);beam(b,f,a,c,top+.035,.095,DARK);
    if(b.level<2)beam(b,f,a,c,bottom+d.bowHeight*.65,.033,DARK);
  }
  for(const p of path)b.box(f,'trim',p[0],(bottom+top)/2,p[1]+.008,.07,d.bowHeight+.09,.075,DARK);
  for(const fraction of [1/3,2/3])b.box(f,'trim',path[1][0]+(path[2][0]-path[1][0])*fraction,(bottom+top)/2,d.bowFrontOffset+.014,.047,d.bowHeight,.06,DARK);
  const rim=[[u-half-.075,top+.085,d.bowBackOffset-.04],[u-half*.68,top+.085,d.bowFrontOffset+.09],[u+half*.68,top+.085,d.bowFrontOffset+.09],[u+half+.075,top+.085,d.bowBackOffset-.04]];
  const ridgeLeft=[u-half*.40,top+d.bowCapRise,.55],ridgeRight=[u+half*.40,top+d.bowCapRise,.55];
  for(const points of [[rim[0],rim[1],ridgeLeft],[rim[1],rim[2],ridgeRight,ridgeLeft],[rim[2],rim[3],ridgeRight],[rim[3],rim[0],ridgeLeft,ridgeRight]])b.polygon(f,'metal',points,'#4e514a');
  // A shallow dark skirt closes the projected window below its sill.
  for(let i=0;i<3;i++){const a=path[i],c=path[i+1];b.polygon(f,'trim',[[a[0],bottom-.25,a[1]],[c[0],bottom-.25,c[1]],[c[0],bottom-.055,c[1]],[a[0],bottom-.055,a[1]]],DARK);}
}
function urn(b: Batch, f: Frame, u: number, bottom: number): void {
  const sides=b.level===2?6:10,v=.47,rings=[[bottom,.12],[bottom+.035,.16],[bottom+.10,.12],[bottom+.18,.15],[bottom+.25,.08],[bottom+.30,.065]];
  for(let ring=0;ring<rings.length-1;ring++)for(let i=0;i<sides;i++){
    const a=i*2*Math.PI/sides,c=(i+1)*2*Math.PI/sides,[y0,r0]=rings[ring],[y1,r1]=rings[ring+1];
    b.polygon(f,'trim',[[u+r0*Math.cos(a),y0,v+r0*Math.sin(a)],[u+r1*Math.cos(a),y1,v+r1*Math.sin(a)],[u+r1*Math.cos(c),y1,v+r1*Math.sin(c)],[u+r0*Math.cos(c),y0,v+r0*Math.sin(c)]],PALE);
  }
  b.box(f,'trim',u,bottom-.025,v,.25,.05,.24,PALE);
}

/** Replaces only an existing authored commercial facade, after its native source
 * guard. The matching frame and portal remain tied to that specific building. */
export function buildVideoVenueFacade(b: Batch, input: FacadeInput): boolean {
  const r=registeredVenue(input);
  if(!r)return false;
  const f=input.frame,w=input.width,y=input.floor,d=r.dimensions,u=w/2;
  panel(b,f,'brick',u,y,d.skinOffset,w,input.top-y,BRICK);
  panel(b,f,'trim',u,y+d.corniceBandBottom,.29,w-.18,d.corniceBandHeight,PALE);
  b.box(f,'trim',u,input.top-.055,.34,w+.08,.11,.25,PALE);
  for(const fraction of d.bowCenters)bow(b,f,w*fraction,y,d);
  panel(b,f,'recess',u,y,.35,d.portalWidth+.14,d.transomBottom+d.transomHeight+.05,DARK);
  panel(b,f,'door',u,y,.391,d.doorWidth,d.doorHeight,DOOR);
  for(const side of [-1,1]){
    const light=u+side*(d.doorWidth/2+.135);
    panel(b,f,'glass',light,y+.28,.421,.20,d.doorHeight-.35,GLASS);
    for(const x of [light-.13,light+.13])b.box(f,'trim',x,y+d.doorHeight/2,.44,.046,d.doorHeight,.055,PALE);
    b.box(f,'trim',u+side*(d.doorWidth/2+.018),y+(d.doorHeight+.03)/2,.435,.05,d.doorHeight+.03,.06,PALE);
    b.box(f,'trim',u+side*d.pilasterOffset,y+d.pilasterHeight/2,.39,d.pilasterWidth,d.pilasterHeight,.22,PALE);
    b.box(f,'trim',u+side*d.pilasterOffset,y+.11,.45,d.pilasterWidth+.12,.22,.28,PALE);
    b.box(f,'trim',u+side*d.pilasterOffset,y+d.pilasterHeight-.055,.45,d.pilasterWidth+.17,.15,.31,PALE);
    if(b.level<2)for(const offset of [-.105,-.035,.035,.105])b.box(f,'trim',u+side*d.pilasterOffset+offset,y+d.pilasterHeight*.52,.504,.023,d.pilasterHeight-.55,.014,'#c9c9be');
  }
  if(b.level<2){
    for(const height of [.50,1.55])panel(b,f,'trim',u,y+height-.21,.408,d.doorWidth-.20,.42,'#3c3028');
    b.box(f,'metal',u+d.doorWidth*.31,y+1.02,.434,.034,.14,.028,'#a19d86');
  }
  const transomWidth=.23,pitch=.295;
  for(let i=0;i<5;i++)archedLight(b,f,u+(i-2)*pitch,y+d.transomBottom,transomWidth,d.transomHeight);
  b.box(f,'trim',u,y+d.transomBottom-.035,.443,d.portalWidth+.1,.07,.10,PALE);
  b.box(f,'trim',u,y+d.entablatureBottom+d.entablatureHeight/2,.44,d.pilasterOffset*2+.62,d.entablatureHeight,.35,PALE);
  if(b.level<2)for(let x=u-d.pilasterOffset-.1;x<u+d.pilasterOffset+.2;x+=.135)b.box(f,'trim',x,y+d.entablatureBottom-.045,.545,.064,.085,.10,PALE);
  const half=d.pilasterOffset+.32,spring=y+d.entablatureBottom+d.entablatureHeight,peak=y+d.pedimentPeak,gap=.22;
  for(const side of [-1,1]){
    const a=u+side*half,c=u+side*gap;
    const innerHeight=peak-(peak-spring)*gap/half;
    const face=[[a,spring,.57],[c,innerHeight,.57],[c,innerHeight+.11,.57],[a,spring+.11,.57]];
    if(side>0)face.reverse();b.polygon(f,'trim',face,PALE);
  }
  urn(b,f,u,y+d.urnTop-.30);
  return true;
}
