import * as THREE from 'three';
import {Batch,type Frame,type Role} from './crafted-frontages';

type V3=[number,number,number];
const white='#e3dfcd',red='#a13d34',dark='#303c40',brass='#b9a56b';
const canopyNavy='#263b54';
export const PRINCESS_FINISH_BASIS={
 photoSHA256:'fb3ed72229f658e117adc0aca81df806caaa2162e83cfd691cc387887f55a8f3',
 observed:['Three arched pilot-house front windows','Curved white pilot-house crown','Forward exterior stair rising aft to the open upper deck','Black stacks seated on the upper deck with red collars and open gold crowns','Partial blue canopy','Large lower-cabin name below the windows'],
 inference:'Dimensions, glazing divisions, stair count and decorative profile are authored from the viewed official exterior, not a measured vessel plan.',
 stair:{bottom:1,top:3.54,front:9.04,rear:5.50,width:.76,centerV:2.27,steps:14},
 canopy:{
  source:'https://www.youtube.com/watch?v=cuRQ1_whRsA',
  title:'Come Explore Webster Lake in Massachusetts!',
  timeSeconds:257.813333,
  reviewed:'2026-09-09',
  observation:'Root reviewer viewed the berthed vessel in V07: broad dark navy upper-deck canopy above the white cabin and red trim.',
  inference:'RGB #263b54 is an authored visual interpretation, not sampled from the video. Textile construction and the matte nonmetal finish are inferred; dimensions and registered berth are retained.',
 },
};
function emit(b:Batch,f:Frame,role:Role,g:THREE.BufferGeometry,color:string){const flat=g.index?g.toNonIndexed():g;b.geometry(f,role,flat.getAttribute('position').array,flat.getAttribute('normal').array,color);if(flat!==g)flat.dispose();g.dispose();}
function beam(b:Batch,f:Frame,a:V3,c:V3,r:number,color=white){const start=new THREE.Vector3(...a),end=new THREE.Vector3(...c),d=end.clone().sub(start);if(d.lengthSq()<1e-10)return;const g=new THREE.CylinderGeometry(r,r,d.length(),b.level===2?4:6);g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize()));g.translate(...start.add(end).multiplyScalar(.5).toArray()as V3);emit(b,f,'metal',g,color);}
function frontWindow(b:Batch,f:Frame,u:number,y:number,v:number,width:number,height:number){
 const profile=(w:number,h:number,base:number)=>{const p=[[-w/2,base],[w/2,base]];for(let i=0;i<=8;i++){const a=i*Math.PI/8;p.push([Math.cos(a)*w/2,base+h-w/2+Math.sin(a)*w/2]);}return p;};
 const inner=profile(width,height,y),outer=profile(width+.09,height+.09,y-.04);
 b.polygon(f,'glass',[...inner].reverse().map(([z,h])=>[u,h,v+z]),'#334c59');
 for(let i=0;i<inner.length;i++){const j=(i+1)%inner.length;b.polygon(f,'metal',[[u+.014,outer[i][1],v+outer[i][0]],[u+.014,inner[i][1],v+inner[i][0]],[u+.014,inner[j][1],v+inner[j][0]],[u+.014,outer[j][1],v+outer[j][0]]],white);}
 if(b.level<2){b.box(f,'metal',u+.027,y+height*.43,v,.035,.037,width,white);b.box(f,'metal',u+.026,y+height*.42,v,.033,height*.84,.035,white);}
}

/** The side stair has a real opening in the upper deck and terminates at its
 * landing. The old continuous roof and cabin enclosed that flight. */
export function buildPrincessForwardDetails(b:Batch,f:Frame,y:number){
 const s=PRINCESS_FINISH_BASIS.stair,run=(s.front-s.rear)/s.steps,rise=(s.top-s.bottom)/s.steps;
 for(let i=0;i<s.steps;i++)b.box(f,'metal',s.front-(i+.5)*run,y+s.bottom+(i+1)*rise-.042,s.centerV,run+.008,.084,s.width,white);
 for(const side of[-1,1]){
  const v=s.centerV+side*(s.width/2-.018);
  beam(b,f,[s.front,y+s.bottom+.11,v],[s.rear,y+s.top-.10,v],.043);
  beam(b,f,[s.front+.10,y+s.bottom+.98,v],[s.rear-.16,y+s.top+.98,v],.036,red);
  for(let i=0;i<=s.steps;i+=b.level===2?4:2){const t=i/s.steps,u=s.front+(s.rear-s.front)*t,h=y+s.bottom+(s.top-s.bottom)*t;beam(b,f,[u,h+.10,v],[u,h+.98,v],.020);}
 }
 // The photographed pilothouse has a full-height white forward vestibule;
 // its upper room must not float above the open bow or side stair.
 b.box(f,'metal',7.05,y+2.29,0,3.3,2.58,3.65,white);
 b.box(f,'glass',8.707,y+2.03,0,.014,1.66,.86,'#334c59');
 for(const v of[-.47,.47])b.box(f,'metal',8.728,y+2.02,v,.05,1.78,.055,white);
 for(const h of[1.15,2.9])b.box(f,'metal',8.727,y+h,0,.05,.06,.995,white);
 b.box(f,'metal',8.744,y+1.92,.31,.04,.17,.035,brass);
 // Retain the original supported wheelhouse envelope; distinguish its front.
 b.box(f,'metal',7.05,y+4.7,0,3.3,2.25,3.65,white);
 b.box(f,'metal',7.05,y+5.91,0,3.7,.18,4.0,white);
 for(const v of[-1.16,0,1.16])frontWindow(b,f,8.711,y+4.14,v,.91,1.33);
 // Authored curved white fascia follows the observed two raised outer lobes.
 const profile=[[-1.95,5.96],[-1.95,6.12],[-1.73,6.14],[-1.54,6.28],[-1.43,6.49],[-1.30,6.51],[-1.15,6.31],[-.91,6.21],[-.58,6.15],[0,6.13],[.58,6.15],[.91,6.21],[1.15,6.31],[1.30,6.51],[1.43,6.49],[1.54,6.28],[1.73,6.14],[1.95,6.12],[1.95,5.96]];
 const front=profile.map(([v,h])=>[8.94,y+h,v]as V3),back=profile.map(([v,h])=>[8.82,y+h,v]as V3);
 const faces=THREE.ShapeUtils.triangulateShape(profile.map(p=>new THREE.Vector2(...p)),[]);
 for(const t of faces){b.polygon(f,'metal',t.map(i=>front[i]).reverse(),white);b.polygon(f,'metal',t.map(i=>back[i]),white);}
 for(let i=0;i<profile.length;i++){const j=(i+1)%profile.length;b.polygon(f,'metal',[front[i],back[i],back[j],front[j]],white);}
 for(const v of[-1.36,1.36])emit(b,f,'metal',new THREE.SphereGeometry(.085,8,6).translate(8.88,y+6.54,v),white);
}

export function buildPrincessStacks(b:Batch,f:Frame,y:number){
 for(const v of[-1.7,1.7]){
  // Stack cylinders now connect to the deck instead of starting in mid-air.
  emit(b,f,'metal',new THREE.CylinderGeometry(.22,.28,3.70,b.level===2?8:12).translate(4.35,y+5.39,v),dark);
  for(const h of[3.64,6.91])emit(b,f,'metal',new THREE.CylinderGeometry(.285,.285,.14,12).translate(4.35,y+h,v),red);
  emit(b,f,'metal',new THREE.CylinderGeometry(.31,.25,.2,12).translate(4.35,y+7.30,v),brass);
  const count=b.level===2?6:8;
  for(let i=0;i<count;i++){const a=i*Math.PI*2/count;beam(b,f,[4.35+Math.cos(a)*.27,y+7.34,v+Math.sin(a)*.27],[4.35+Math.cos(a)*.32,y+7.64,v+Math.sin(a)*.32],.027,brass);}
  emit(b,f,'metal',new THREE.TorusGeometry(.295,.025,4,count).rotateX(Math.PI/2).translate(4.35,y+7.53,v),brass);
 }
}

export function buildPrincessCanopy(b:Batch,f:Frame,y:number){
 // A shallow canvas crown gives the observed canopy a coherent edge/silhouette.
 const section=[[-2.875,5.66],[0,5.82],[2.875,5.66],[2.875,5.74],[0,5.90],[-2.875,5.74]],ends=[-9.1,3.7];
 const faces=THREE.ShapeUtils.triangulateShape(section.map(p=>new THREE.Vector2(...p)),[]);
 for(const[side,u]of ends.entries())for(const face of faces){const p=face.map(i=>[u,y+section[i][1],section[i][0]]);b.polygon(f,'metal',side?p.reverse():p,canopyNavy);}
 for(let i=0;i<section.length;i++){const j=(i+1)%section.length;b.polygon(f,'metal',[[ends[0],y+section[i][1],section[i][0]],[ends[1],y+section[i][1],section[i][0]],[ends[1],y+section[j][1],section[j][0]],[ends[0],y+section[j][1],section[j][0]]],canopyNavy);}
}

/** This navy chunk belongs only to the canopy. Finish it before material
 * acquisition, keeping every other boat and shared frontage material intact. */
export function finishPrincessCanopyMaterial(group:THREE.Group){
 group.traverse(o=>{
  if(!(o instanceof THREE.Mesh))return;
  for(const m of Array.isArray(o.material)?o.material:[o.material]){
   if(!(m instanceof THREE.MeshStandardMaterial)||m.name!==`Crafted frontage | metal | ${canopyNavy}`)continue;
   m.metalness=0;m.roughness=.87;m.name='Indian Princess | matte navy canopy';
   m.userData.surfaceRole='canvas';m.userData.appearanceBasis=PRINCESS_FINISH_BASIS.canopy;
  }
 });
}
