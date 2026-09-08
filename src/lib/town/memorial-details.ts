import * as THREE from 'three';
import data from '../../../data/derived/town/memorial-details.json';
import { Batch, clipTerrainTriangle, type Frame, type Role } from './crafted-frontages';
import { PlanarTriangleIndex } from './planar-triangle-index';
import { TerrainRayIndex } from './terrain-ray-index';

type V3 = [number, number, number];
type Recipe = typeof data.objects[number];
export type MemorialReport = { tileId:string; level:number; ids:string[]; skipped:{id:string;reason:string}[]; addedTriangles:number; addedMeshes:number; geometryBytes:number; supports:{id:string;height:number}[] };
export const MEMORIAL_DETAIL_PROVENANCE = data;
const IRON='#3f4540', BRONZE='#897b55', GRANITE='#aaa69a';
const labels=[...new Set([...data.objects.map(r=>r.label).filter(Boolean),'WORLD WAR II','POW · MIA','GOLD STAR MOTHERS','PURPLE HEART','RAILROAD','CROSSING'])];

function emit(b:Batch,f:Frame,role:Role,g:THREE.BufferGeometry,color:string):void {
  const flat=g.index?g.toNonIndexed():g;
  b.geometry(f,role,flat.getAttribute('position').array,flat.getAttribute('normal').array,color);
  if(flat!==g)flat.dispose();g.dispose();
}
function beam(b:Batch,f:Frame,a:V3,c:V3,r:number,color=IRON):void {
  const p=new THREE.Vector3(...a),q=new THREE.Vector3(...c),d=q.clone().sub(p);
  const g=new THREE.CylinderGeometry(r,r,d.length(),b.level?6:8);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize()));
  g.translate(...p.add(q).multiplyScalar(.5).toArray() as V3);emit(b,f,'metal',g,color);
}
function ellipsoid(b:Batch,f:Frame,p:V3,size:V3,color:string,role:Role='metal'):void {
  emit(b,f,role,new THREE.SphereGeometry(1,b.level?8:12,b.level?5:8).scale(...size).translate(...p),color);
}
function sourceMeshes(group:THREE.Group,category:string):THREE.Mesh[] {
  const out:THREE.Mesh[]=[];group.traverse(o=>{
    if(!(o instanceof THREE.Mesh)||o.userData.townCrafted)return;
    for(let p:THREE.Object3D|null=o;p&&p!==group;p=p.parent)if(p.name===category||p.name.startsWith(category+'_')){out.push(o);break;}
  });return out;
}

/** One small shared atlas, original lettering only; no downloaded photographs. */
function letteringMaterial():THREE.MeshStandardMaterial {
  let texture:THREE.Texture;
  if(typeof document==='undefined')texture=new THREE.DataTexture(new Uint8Array([170,163,139,255]),1,1);
  else {
    const canvas=document.createElement('canvas');canvas.width=512;canvas.height=2048;
    const context=canvas.getContext('2d');
    if(context)labels.forEach((label,i)=>{
      const railroad=label==='RAILROAD'||label==='CROSSING';
      context.fillStyle=railroad?'#e0dfd2':'#39443d';context.fillRect(0,i*64,512,64);
      context.fillStyle=railroad?'#303632':'#d4ccb1';context.textAlign='center';context.textBaseline='middle';
      const lines=label.split('\n');context.font=`600 ${lines.length>1?19:23}px Georgia, serif`;
      lines.forEach((line,j)=>context.fillText(line,256,i*64+32+(j-(lines.length-1)/2)*25,486));
    });texture=context?new THREE.CanvasTexture(canvas):new THREE.DataTexture(new Uint8Array([170,163,139,255]),1,1);
  }
  texture.colorSpace=THREE.SRGBColorSpace;texture.userData.sourceUrl='town-generated:memorial-lettering-v1';texture.needsUpdate=true;
  const material=new THREE.MeshStandardMaterial({map:texture,roughness:.82,side:THREE.DoubleSide});
  material.name='Research memorial | original lettering v1';material.userData.townCrafted=true;material.envMapIntensity=.12;
  return material;
}
class Letters {
  positions:number[]=[];normals:number[]=[];uv:number[]=[];
  constructor(readonly origin:readonly number[]){}
  panel(f:Frame,text:string,x:number,y:number,z:number,w:number,h:number,rotation=0):void {
    const row=labels.indexOf(text);if(row<0)return;
    const c=Math.cos(rotation),s=Math.sin(rotation),t=f.tangent,n=f.outward;
    const corners=[[-w/2,-h/2],[w/2,-h/2],[w/2,h/2],[-w/2,h/2]];
    const order=n[0]*t[1]-t[0]*n[1]<0?[0,2,1,0,3,2]:[0,1,2,0,2,3];
    for(const i of order) {
      const [a,d]=corners[i],u=x+a*c-d*s,v=z;
      this.positions.push(f.start[0]+t[0]*u+n[0]*v-this.origin[0],y+a*s+d*c-this.origin[1],-f.start[1]-t[1]*u-n[1]*v-this.origin[2]);
      this.normals.push(n[0],0,-n[1]);this.uv.push(i===0||i===3?.01:.99,1-(row*64+(i<2?62:2))/2048);
    }
  }
  finish():THREE.Mesh|undefined {
    if(!this.positions.length)return;
    const g=new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(this.positions,3)).setAttribute('normal',new THREE.Float32BufferAttribute(this.normals,3)).setAttribute('uv',new THREE.Float32BufferAttribute(this.uv,2));
    g.computeBoundingBox();g.computeBoundingSphere();const mesh=new THREE.Mesh(g,letteringMaterial());mesh.name='Research memorial | lettering';mesh.userData.townCrafted=true;return mesh;
  }
}

function howitzer(b:Batch,f:Frame,y:number):void {
  b.box(f,'paving',0,y+.06,0,2.8,.12,1.9,'#a29f90');
  const axle=y+.77,wheelRadius=.66;
  for(const z of [-.70,.70]) {
    emit(b,f,'metal',new THREE.TorusGeometry(wheelRadius,.025,5,b.level?16:32).translate(0,axle,z),IRON);
    const spokes=b.level?8:12;
    for(let i=0;i<spokes;i++){const a=i*Math.PI*2/spokes;beam(b,f,[0,axle,z],[Math.cos(a)*wheelRadius,axle+Math.sin(a)*wheelRadius,z],.012);}
    ellipsoid(b,f,[0,axle,z],[.085,.085,.065],IRON);
  }
  beam(b,f,[0,axle,-.78],[0,axle,.78],.046);
  beam(b,f,[-.22,y+.92,0],[.25,y+1.05,0],.075);
  // The curved, slender iron trail and small rear wheel distinguish the boat carriage.
  for(const z of [-.16,.16]) {
    beam(b,f,[.15,axle,z],[.90,y+.22,z],.035);
    beam(b,f,[.90,y+.22,z],[1.35,y+.20,z],.030);
  }
  emit(b,f,'metal',new THREE.TorusGeometry(.19,.023,5,16).translate(1.27,y+.31,0),IRON);
  for(let i=0;i<5;i++){const a=i*Math.PI*2/5;beam(b,f,[1.27,y+.31,0],[1.27+Math.cos(a)*.19,y+.31+Math.sin(a)*.19,0],.012);}
  const barrelY=y+1.15;
  // Authored smooth bronze tube, hollow dark muzzle; no functional weapon simulation.
  emit(b,f,'metal',new THREE.CylinderGeometry(.142,.116,1.50,b.level?10:20,1,true).rotateZ(Math.PI/2).translate(-.22,barrelY,0),'#ad9464');
  ellipsoid(b,f,[.54,barrelY,0],[.15,.142,.142],'#ad9464');
  emit(b,f,'metal',new THREE.TorusGeometry(.118,.026,6,20).rotateY(Math.PI/2).translate(-.97,barrelY,0),'#aa9060');
  emit(b,f,'recess',new THREE.CircleGeometry(.095,16).rotateY(-Math.PI/2).translate(-.967,barrelY,0),'#303731');
  beam(b,f,[.52,barrelY-.13,0],[.62,y+.67,0],.021);
}

function soldier(b:Batch,f:Frame,y:number):void {
  for(const side of [-1,1]) {
    beam(b,f,[side*.13,y+.08,0],[side*.12,y+.89,0],.09,BRONZE);
    b.box(f,'metal',side*.13,y+.06,.08,.20,.12,.34,BRONZE);
  }
  ellipsoid(b,f,[0,y+1.18,0],[.28,.42,.17],BRONZE);
  ellipsoid(b,f,[0,y+1.79,0],[.15,.20,.15],BRONZE);
  ellipsoid(b,f,[0,y+1.91,0],[.20,.10,.19],BRONZE);
  beam(b,f,[-.24,y+1.41,0],[-.30,y+.95,.09],.065,BRONZE);
  beam(b,f,[.24,y+1.41,0],[.30,y+1.10,.17],.065,BRONZE);
}

function courtTerrain(terrain:THREE.Mesh[],f:Frame,origin:THREE.Vector3):number[][][] {
  const triangles:number[][][]=[],point=new THREE.Vector3();
  for(const mesh of terrain) {
    const geometry=mesh.geometry,p=geometry.getAttribute('position'),index=geometry.index;
    if(!p)continue;
    for(let i=0;i<(index?.count??p.count);i+=3) {
      const triangle=[0,1,2].map(k=>{
        point.fromBufferAttribute(p,index?index.getX(i+k):i+k).applyMatrix4(mesh.matrixWorld).add(origin);
        const east=point.x-f.start[0],north=-point.z-f.start[1];
        return[east*f.tangent[0]+north*f.tangent[1],point.y,east*f.outward[0]+north*f.outward[1]];
      });
      if(Math.max(...triangle.map(p=>p[0]))< -4.6||Math.min(...triangle.map(p=>p[0]))>4.6||Math.max(...triangle.map(p=>p[2]))< -6||Math.min(...triangle.map(p=>p[2]))>11)continue;
      triangles.push(triangle);
    }
  }
  return triangles;
}

function court(b:Batch,f:Frame,l:Letters,ground:(u:number,v:number)=>number|null,terrain:THREE.Mesh[]):void {
  const support=courtTerrain(terrain,f,b.origin);
  const supportIndex=new PlanarTriangleIndex(support,[-4.6,4.6,-6,11]);
  const step=b.level===0?.40:.80;
  for(let v=-6;v<11;v+=step)for(let u=-4.6;u<4.6;u+=step*2) {
    const width=Math.min(step*2,4.6-u),depth=Math.min(step,11-v);
    // Four corner samples can bridge over a terrain crease inside a paver.
    // Retain each rendered support plane, with the shared 4 cm paving clearance.
    for(const triangle of supportIndex.query([u,u+width,v,v+depth])) {
      if(Math.max(...triangle.map(p=>p[0]))<u||Math.min(...triangle.map(p=>p[0]))>u+width||Math.max(...triangle.map(p=>p[2]))<v||Math.min(...triangle.map(p=>p[2]))>v+depth)continue;
      b.polygon(f,'paving',clipTerrainTriangle(triangle,[u,u+width,v,v+depth]),(Math.round(v/step)+Math.round(u/step))%5?'#98684e':'#a77756');
    }
  }
  const wallY=ground(0,-6)??ground(0,0)!;
  for(let i=0;i<24;i++) {
    const a=Math.PI+i*Math.PI/24,c=Math.PI+(i+1)*Math.PI/24,r=4.6;
    const x=(Math.cos(a)+Math.cos(c))*r/2,z=-6+(Math.sin(a)+Math.sin(c))*r/2,y=ground(x,z)??wallY;
    b.box(f,'brick',x,y+.50,z,.62,1.0,.38,'#956951',-((a+c)/2+Math.PI/2));
    b.box(f,'stone',x,y+1.03,z,.64,.12,.48,'#b6b2a6',-((a+c)/2+Math.PI/2));
  }
  for(const [x,v,label] of [[-3.25,-3,'POW · MIA'],[3.25,-3,'GOLD STAR MOTHERS'],[3.25,2,'PURPLE HEART']] as [number,number,string][]) {
    const y=ground(x,v);if(y===null)continue;
    b.box(f,'stone',x,y+.12,v,1.10,.24,.65,GRANITE);b.box(f,'stone',x,y+.90,v,.88,1.35,.23,'#747d73');
    l.panel(f,label,x,y+1.17,v+.121,.76,.16);
  }
  const y=ground(0,-6);if(y!==null) {
    b.box(f,'stone',0,y+.10,-6,1.75,.20,1.55,GRANITE);b.box(f,'stone',0,y+.80,-6,1.05,1.40,.95,'#b1afa1');
    const moved={...f,start:[f.start[0]-f.outward[0]*6,f.start[1]-f.outward[1]*6]};soldier(b,moved,y+1.50);
    l.panel(f,'WORLD WAR II',0,y+1.05,-5.517,.85,.17);
  }
}

function marker(b:Batch,f:Frame,r:Recipe,y:number,l:Letters):void {
  const w=r.width,h=r.height,depth=r.kind==='boulder'?1.40:r.kind==='rock_plaque'?.54:.32;
  if(r.kind==='historical_tablet'||r.kind==='post_plaque') {
    beam(b,f,[0,y,0],[0,y+h,0],.044);
    const ph=r.kind==='historical_tablet'?.64:.2032;
    b.box(f,'metal',0,y+h-ph/2,0,w,ph,.055,IRON);
    if(r.kind==='historical_tablet')ellipsoid(b,f,[0,y+h,0],[w*.20,.14,.035],IRON);
    l.panel(f,r.label,0,y+h-ph/2,.030,w*.94,ph*.80);return;
  }
  b.box(f,'stone',0,y+.08,0,w+.18,.16,depth+.25,GRANITE);
  if(r.kind==='obelisk') {
    b.box(f,'stone',0,y+.24,0,w,.20,depth+.16,'#bfbeb0');
    emit(b,f,'stone',new THREE.CylinderGeometry(.13,.24,h-.34,4).rotateY(Math.PI/4).translate(0,y+.34+(h-.34)/2,0),'#cac8b9');
    // A true four-face pyramid avoids ConeGeometry's collapsed apex triangles.
    const base:V3[]=Array.from({length:4},(_,i)=>[Math.cos(Math.PI/4+i*Math.PI/2)*.13,y+h,Math.sin(Math.PI/4+i*Math.PI/2)*.13]);
    b.polygon(f,'stone',base,'#cac8b9');
    for(let i=0;i<4;i++)b.polygon(f,'stone',[base[i],[0,y+h+.18,0],base[(i+1)%4]],'#cac8b9');
    l.panel(f,r.label,0,y+.75,.203,w*.56,.13);return;
  }
  if(r.kind==='rock_plaque'||r.kind==='park_stone'||r.kind==='boulder')ellipsoid(b,f,[0,y+h*.48,0],[w*.58,h*.56,depth*.75],GRANITE,'stone');
  else b.box(f,'stone',0,y+.15+(h-.15)/2,0,w,h-.15,depth,GRANITE);
  if(r.kind==='podium') {
    emit(b,f,'stone',new THREE.BoxGeometry(w+.03,.12,depth+.10).rotateX(-.18).translate(0,y+h,0),'#b3b0a3');
  }
  const py=y+h*.66,pz=depth*.51;
  b.box(f,'metal',0,py,pz,w*.85,h*.32,.024,'#586050');l.panel(f,r.label,0,py,pz+.014,w*.80,h*.27);
  if(r.kind==='boulder')for(const v of [-1.65,1.65])for(let i=0;i<7;i++)b.box(f,'stone',-1.5+i*.5,y+.22,v,.48,.44,.40,i%3?'#92958a':'#a2a194');
  if(r.kind==='portrait_tablet')ellipsoid(b,f,[0,y+h*.86,pz+.02],[.12,.14,.025],BRONZE);
  if(r.kind==='park_stone') {
    b.box(f,'stone',0,y+.08,1.6,2.7,.16,.20,GRANITE);
    for(const x of [-1.0,0,1.0])ellipsoid(b,f,[x,y+.32,2.05],[.39,.34,.38],'#546c42','leaf');
  }
}

function crossing(b:Batch,f:Frame,r:Recipe,ground:(u:number,v:number)=>number|null,l:Letters):boolean {
  let made=false;
  {
    const y=ground(0,0);if(y===null)return false;
    // Each approach mast faces the oncoming road; gates are visibly raised.
    const c=f;
    beam(b,c,[0,y,0],[0,y+3.65,0],.068,'#9b9f96');b.box(c,'foundation',0,y+.09,0,.45,.18,.45,'#9f9f92');
    for(const angle of [-Math.PI/5,Math.PI/5]) {
      emit(b,c,'trim',new THREE.BoxGeometry(1.32,.19,.04).rotateZ(angle).translate(0,y+3.12,.06),'#e0dfd2');
      l.panel(c,angle<0?'RAILROAD':'CROSSING',0,y+3.12,.085,1.29,.16,angle);
    }
    beam(b,c,[-.52,y+2.38,.02],[.52,y+2.38,.02],.042,'#9b9f96');
    for(const x of [-.35,.35]) {
      emit(b,c,'metal',new THREE.CylinderGeometry(.17,.17,.12,12).rotateX(Math.PI/2).translate(x,y+2.38,.07),IRON);
      emit(b,c,'metal',new THREE.CircleGeometry(.11,12).translate(x,y+2.38,.136),'#623c36');
      b.box(c,'metal',x,y+2.53,.14,.30,.045,.23,IRON);
    }
    if(r.gates) {
      b.box(c,'metal',.30,y+.78,-.12,.38,.46,.32,'#92988f');
      for(let i=0;i<10;i++)b.box(c,'trim',.30,y+1.12+i*.39,-.12,.095,.39,.10,i%2?'#aa5547':'#e4ded0');
    }
    made=true;
  }
  return made;
}

/** Add only absent mapped civic objects, after source terrain correction. */
export function applyMemorialDetails(group:THREE.Group,tileId:string,origin:readonly number[],level=0):MemorialReport|undefined {
  const rows=data.objects.filter(r=>r.tileId===tileId);if(!rows.length)return;
  if(group.userData.townMemorialDetails)return group.userData.townMemorialDetails;
  group.updateMatrixWorld(true);const terrain=sourceMeshes(group,'terrain'),ray=new THREE.Raycaster();ray.ray.direction.set(0,-1,0);ray.far=2000;
  const terrainIndex=rows.some(r=>r.kind==='honor_court')?new TerrainRayIndex(terrain):undefined;
  const b=new Batch(new THREE.Vector3(...origin),level),letters=new Letters(origin);
  const report:MemorialReport={tileId,level,ids:[],skipped:[],addedTriangles:0,addedMeshes:0,geometryBytes:0,supports:[]};
  for(const r of rows) {
    const f:Frame={...r.frame,structId:r.id,tileId};
    const sample=(u:number,v:number):number|null=>{
      ray.ray.origin.set(f.start[0]+f.tangent[0]*u+f.outward[0]*v-origin[0],1000-origin[1],-f.start[1]-f.tangent[1]*u-f.outward[1]*v-origin[2]);
      const hit=terrainIndex?terrainIndex.first(ray.ray,ray.far):ray.intersectObjects(terrain,false)[0]?.point;return hit?hit.y+origin[1]:null;
    };
    const ground=sample(0,0);
    if(ground===null){report.skipped.push({id:r.id,reason:'Mapped source terrain support missing.'});continue;}
    if(r.kind==='rail_crossing') {
      if(!crossing(b,f,r,sample,letters)){report.skipped.push({id:r.id,reason:'Neither roadside mast has source terrain.'});continue;}
    }else {
      const radius=r.kind==='howitzer'?1.45:r.kind==='honor_court'?0:r.width*.5;
      if(r.roadContext.distanceM<r.roadContext.halfWidthM+radius+.15){report.skipped.push({id:r.id,reason:'Inventory point overlaps retained road clearance.'});continue;}
      const supports=[ground,sample(-radius,0),sample(radius,0),sample(0,-.5),sample(0,.5)];
      if(supports.some(y=>y===null)||Math.max(...supports as number[])-Math.min(...supports as number[])>1.0){report.skipped.push({id:r.id,reason:'Object footing lacks bounded terrain support.'});continue;}
      const y=Math.max(...supports as number[])+.018;
      if(r.kind==='howitzer')howitzer(b,f,y);
      else if(r.kind==='honor_court')court(b,f,letters,sample,terrain);
      else marker(b,f,r,y,letters);
    }
    report.ids.push(r.id);report.supports.push({id:r.id,height:ground});
  }
  const result=b.finish();result.group.name='Research memorial details';const text=letters.finish();if(text)result.group.add(text);
  result.group.traverse(o=>{if(!(o instanceof THREE.Mesh))return;o.name=o.name.replace('Crafted building frontage','Research memorial');o.userData.townCrafted=true;o.userData.category='research-memorial';o.userData.evidenceIds=report.ids;o.castShadow=true;
    report.addedTriangles+=(o.geometry.index?o.geometry.index.count:o.geometry.getAttribute('position').count)/3;for(const a of Object.values(o.geometry.attributes) as THREE.BufferAttribute[])report.geometryBytes+=a.array.byteLength;report.addedMeshes++;
  });
  group.add(result.group);group.userData.townMemorialDetails=report;return report;
}
