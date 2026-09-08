import * as THREE from 'three';
import catalog from '../../../data/derived/town/bathhouse.json';
import { Batch, type Frame, type Role } from './crafted-frontages';
import { filterEvidenceSources } from './evidence-buildings';

export const BATHHOUSE = catalog;
export type BathhouseReport = {status:'applied'|'source-mismatch'|'no-source';ids:string[];removedTriangles:number;triangles:number;meshes:number;geometryBytes:number;floor:number;peak:number};
const stone='#98988d',trim='#c3c3b5',roof='#545a53';
const frame=(f:typeof catalog.frame):Frame=>({...f,structId:catalog.id,tileId:catalog.tileId});
function panel(b:Batch,f:Frame,role:Role,points:number[][],paint:string,up?:boolean){
 if(up!==undefined){const a=new THREE.Vector3().fromArray(points[0]),n=new THREE.Vector3().fromArray(points[1]).sub(a).cross(new THREE.Vector3().fromArray(points[2]).sub(a));if((n.y>0)!==up)points.reverse();}
 b.polygon(f,role,points,paint);
}
function opening(b:Batch,f:Frame,u:number,bottom:number,width:number,height:number,v=0){
 b.box(f,'recess',u,bottom+height/2,v+.02,width+.12,height+.12,.055,'#343d37');
 b.box(f,'glass',u,bottom+height/2,v+.057,width,height,.025,'#40524f');
 for(const x of[u-width/2-.025,u+width/2+.025])b.box(f,'trim',x,bottom+height/2,v+.085,.055,height+.10,.07,trim);
 for(const y of[bottom-.04,bottom+height+.05])b.box(f,'stone',u,y,v+.06,width+.23,.11,.14,'#aaa99c');
 if(b.level<2){b.box(f,'trim',u,bottom+height/2,v+.095,.043,height,.032,trim);b.box(f,'trim',u,bottom+height*.56,v+.095,width,.045,.032,trim);}
}
function entry(b:Batch,f:Frame,u:number,v:number,double=false){
 const width=double?1.68:.96,y=catalog.floor;
 b.box(f,'recess',u,y+1.11,v+.02,width+.18,2.26,.07,'#354139');
 b.box(f,'door',u,y+1.08,v+.077,width,2.16,.055,'#57655c');
 if(double)b.box(f,'metal',u,y+1.08,v+.113,.025,2.16,.025,'#727d70');
 const count=double?2:1;for(let i=0;i<count;i++){
  const x=u+(i-(count-1)/2)*width/count;
  b.box(f,'glass',x,y+1.54,v+.114,width/count-.18,.83,.018,'#44554f');
  if(b.level<2)b.box(f,'metal',x+(double?(i===0?.25:-.25):.26),y+1.06,v+.143,.025,.15,.025,'#aaa997');
 }
 for(const x of[u-width/2-.065,u+width/2+.065])b.box(f,'trim',x,y+1.10,v+.10,.115,2.25,.115,trim);
 b.box(f,'stone',u,y+2.27,v+.06,width+.28,.16,.17,'#aaa99c');
}
/** All body and detail geometry shares the mapped source plan. Roof valleys are
 * calculated offline as the upper envelope of three intersecting roof volumes,
 * with an exact coverage proof; they are not independent overlapping boxes. */
export function buildBathhouse(origin:THREE.Vector3,level:number){
 const b=new Batch(origin,level),f=frame(catalog.frame),floor=catalog.floor,base=catalog.sourceBase-.35;
 for(const triangle of catalog.roof){panel(b,f,'roof',triangle.map(p=>[...p]),roof,true);panel(b,f,'trim',triangle.map(p=>[p[0],p[1]-.10,p[2]]),trim,false);}
 // Every exterior roof edge has a fascia joining its top and soffit. Internal
 // valley edges are shared by both roof planes and intentionally have no cap.
 const edges=new Map<string,{a:number[];z:number[];count:number}>();
 for(const t of catalog.roof)for(let i=0;i<3;i++){const a=t[i],z=t[(i+1)%3],key=[a,z].map(p=>p.map(v=>v.toFixed(6)).join(',')).sort().join('|'),r=edges.get(key);if(r)r.count++;else edges.set(key,{a,z,count:1});}
 for(const {a,z,count}of edges.values())if(count===1){const mid=[(a[0]+z[0])/2,(a[2]+z[2])/2];let distance=Infinity;for(let i=0;i<catalog.outline.length-1;i++){const p=catalog.outline[i],q=catalog.outline[i+1],e=f.start[0]+f.tangent[0]*mid[0]+f.outward[0]*mid[1],n=f.start[1]+f.tangent[1]*mid[0]+f.outward[1]*mid[1],dx=q[0]-p[0],dy=q[1]-p[1],t=Math.max(0,Math.min(1,((e-p[0])*dx+(n-p[1])*dy)/(dx*dx+dy*dy)));distance=Math.min(distance,Math.hypot(e-p[0]-t*dx,n-p[1]-t*dy));}if(distance<.001)panel(b,f,'trim',[a,z,[z[0],z[1]-.10,z[2]],[a[0],a[1]-.10,a[2]]],trim);}
 for(const edge of catalog.walls){
  const wall=frame(edge),w=edge.width,portal=edge.sourceEdge===9;
  const v=portal?-1.05:0;
  for(let i=0;i<edge.profile.length-1;i++){const [a,ha]=edge.profile[i],[z,hz]=edge.profile[i+1];
   // The portico has a recessed entrance and open space below its lintel.
   const bottom=portal?floor+2.62:base;
   panel(b,wall,'stone',[[a,bottom,0],[z,bottom,0],[z,hz,0],[a,ha,0]],stone);
  }
  if(portal){
   b.box(wall,'stone',w/2,(base+floor+2.68)/2,v-.11,w,floor+2.68-base,.22,stone);
   for(const x of[.23,w*.31,w*.69,w-.23])b.box(wall,'stone',x,floor+1.34,-.13,.46,2.68,.50,stone);
   b.box(wall,'stone',w/2,floor+2.65,-.11,w,.22,.51,'#a6a698');
   b.box(wall,'paving',w/2,floor-.07,-.53,w,.14,1.48,'#999b8e');
   entry(b,wall,w/2,v+.035,true);
   for(const u of[w*.16,w*.84])opening(b,wall,u,floor+1.02,1.2,1.35,v+.035);
  }else if(edge.sourceEdge===0||edge.sourceEdge===6){for(let i=0;i<5;i++)opening(b,wall,(i+.5)*w/5,floor+.91,1.13,1.40);}
  else if(edge.sourceEdge===7||edge.sourceEdge===11){for(let i=0;i<4;i++)opening(b,wall,(i+.5)*w/4,floor+.91,Math.min(.98,w/4-.46),1.40);}
  else if(edge.sourceEdge===1||edge.sourceEdge===5){entry(b,wall,w*.5,.025);for(const [v,top,depth]of[[.13,floor,.26],[.39,floor-.15,.25]])b.box(wall,'paving',w/2,(base+top)/2,v,1.45,top-base,depth,'#999b8e');}
  else if(edge.sourceEdge===3){
   const width=Math.min(5.3,w-.9);opening(b,wall,w/2,floor+.92,width,1.37);
   b.box(wall,'stone',w/2,floor+.91,.24,width+.34,.13,.54,'#aaa99c');
   if(level<2)for(const u of[-1,0,1])b.box(wall,'metal',w/2+u*width/3,floor+1.62,.12,.044,1.30,.04,'#788276');
  }
  if(!portal)b.box(wall,'foundation',w/2,(base+floor)/2,-.035,w,floor-base,.07,'#86897d');
 }
 const result=b.finish();result.group.name='Memorial Beach granite bathhouse';result.group.traverse(o=>{if(o instanceof THREE.Mesh){const m=o.material as THREE.MeshStandardMaterial;o.name=`Memorial Beach bathhouse | ${m.userData.surfaceRole}`;o.userData.category='bathhouse';if(m.userData.surfaceRole==='stone'){
  const prior=m.onBeforeCompile;m.onBeforeCompile=(shader,renderer)=>{prior.call(m,shader,renderer);shader.fragmentShader=shader.fragmentShader.replace('vec2 craftedUnit=vec2(.62,.285);',`// Authored random-course ashlar at real masonry scale.
float bathCycle=mod(vCraftedWorld.y,1.13);
float bathCourse=bathCycle<.22?0.:bathCycle<.59?1.:bathCycle<.85?2.:3.;
float bathBase=bathCourse<.5?0.:bathCourse<1.5?.22:bathCourse<2.5?.59:.85;
float bathHeight=bathCourse<.5?.22:bathCourse<1.5?.37:bathCourse<2.5?.26:.28;
float bathWidth=bathCourse<.5?.48:bathCourse<1.5?.74:bathCourse<2.5?.59:.85;
vec2 craftedUnit=vec2(bathWidth,bathHeight);`).replace('vec2 craftedCell=vec2(craftedSurface.x/craftedUnit.x+mod(craftedCourse,2.)*.5,craftedSurface.y/craftedUnit.y);','vec2 craftedCell=vec2(craftedSurface.x/craftedUnit.x+bathCourse*.37,(bathCycle-bathBase)/bathHeight);');};m.customProgramCacheKey=()=>`bathhouse-ashlar-v1:${m.color.getHexString()}`;m.name+=' | random-course ashlar';
 }}});return result;
}
export function applyBathhouse(group:THREE.Group,tileId:string,origin:readonly number[],level:number,sourceSha256:string):BathhouseReport|undefined{
 if(tileId!==catalog.tileId)return;
 if(group.userData.bathhouse)return group.userData.bathhouse;
 const empty=(status:BathhouseReport['status']):BathhouseReport=>({status,ids:[],removedTriangles:0,triangles:0,meshes:0,geometryBytes:0,floor:catalog.floor,peak:catalog.peak});
 if(catalog.lods.find(l=>l.level===level)?.sha256!==sourceSha256||catalog.origin.some((v,i)=>v!==origin[i]))return empty('source-mismatch');
 const at=new THREE.Vector3().fromArray(origin),removed=filterEvidenceSources(group,at,[{id:catalog.id,tileId,outline:catalog.outline,base:catalog.sourceBase,peak:catalog.sourcePeak,replaceBody:true}]);
 if(!removed.matched.has(catalog.id))return empty('no-source');
 const built=buildBathhouse(at,level);group.add(built.group);
 const report={...empty('applied'),ids:[catalog.id],removedTriangles:removed.removedTriangles,triangles:built.triangles,meshes:built.group.children.length,geometryBytes:built.bytes};group.userData.bathhouse=report;return report;
}
