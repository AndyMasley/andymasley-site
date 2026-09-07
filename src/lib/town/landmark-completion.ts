import * as THREE from 'three';
import data from '../../../data/derived/town/landmark-completion.json';
import { Batch, type Frame, type Role } from './crafted-frontages';
import { filterEvidenceSources } from './evidence-buildings';

type Row = typeof data.rows[number];
export const LANDMARK_COMPLETION_ROWS = data.rows;
export type LandmarkCompletionReport = { status:'applied'|'source-mismatch'; ids:string[]; removedTriangles:number; triangles:number; geometryBytes:number; meshes:number };
const PALE='#c6bda7', BRICK='#945441', SLATE='#485358', GLASS='#324b4e', METAL='#344343';
const f=(r:Row):Frame=>({...r.frame,structId:r.id,tileId:r.tileId});
const ff=(r:Row,s:Row['frames'][number]):Frame=>({...s,structId:r.id,tileId:r.tileId});
function panel(b:Batch,frame:Frame,role:Role,u:number,y:number,v:number,w:number,h:number,color:string):void{
 b.polygon(frame,role,[[u-w/2,y-h/2,v],[u+w/2,y-h/2,v],[u+w/2,y+h/2,v],[u-w/2,y+h/2,v]],color);
}
function local(r:Row,p:readonly number[]):number[]{const q=r.frame;return[(p[0]-q.start[0])*q.tangent[0]+(p[1]-q.start[1])*q.tangent[1],(p[0]-q.start[0])*q.outward[0]+(p[1]-q.start[1])*q.outward[1]];}
function split(points:number[][],axis:number,at:number,side:number):number[][]{
 const out:number[][]=[];for(let i=0;i<points.length;i++){const a=points[i],c=points[(i+1)%points.length],da=(a[axis]-at)*side,dc=(c[axis]-at)*side;if(da>=0)out.push(a);if((da<0)!==(dc<0)){const t=da/(da-dc);out.push(a.map((v,k)=>v+(c[k]-v)*t));}}
 return out.filter((p,i)=>Math.hypot(p[0]-out[(i+1)%out.length][0],p[1]-out[(i+1)%out.length][1])>1e-7);
}
function shell(b:Batch,r:Row,role:Role,color:string,eave=r.eave):void{
 for(const s of r.frames){const a=ff(r,s);b.box(a,'foundation',s.width/2,(r.base+r.floor)/2,-.09,s.width,r.floor-r.base,.18,'#817f73');b.box(a,role,s.width/2,(r.floor+eave)/2,-.06,s.width,eave-r.floor,.12,color);}
}
function roof(b:Batch,r:Row,eave:number,ridge:number,axis=0,center=r.frame.width/2,half=r.frame.width/2):void{
 const p=r.outline.map(v=>local(r,v));const height=(u:number,v:number)=>eave+(ridge-eave)*Math.max(0,1-Math.abs((axis?v:u)-center)/half);
 // Triangulate the concave retained footprint first, then split every triangle
 // at the ridge. No fan triangulation of a concave whole footprint.
 const tris=THREE.ShapeUtils.triangulateShape(p.map(v=>new THREE.Vector2(...v as [number,number])),[]);
 for(const tri of tris){let parts=[tri.map(i=>p[i])];for(const cut of[center-half,center,center+half])parts=parts.flatMap(poly=>[-1,1].map(side=>split(poly,axis,cut,side)).filter(poly=>poly.length>=3));for(const clipped of parts){const vertices=clipped.map(v=>[v[0],height(v[0],v[1]),v[1]]);const n=new THREE.Vector3().fromArray(vertices[1]).sub(new THREE.Vector3().fromArray(vertices[0])).cross(new THREE.Vector3().fromArray(vertices[2]).sub(new THREE.Vector3().fromArray(vertices[0])));if(n.y<0)vertices.reverse();b.polygon(f(r),'roof',vertices,SLATE);}}
 for(const s of r.frames){const a=local(r,s.start),end=[s.start[0]+s.tangent[0]*s.width,s.start[1]+s.tangent[1]*s.width],c=local(r,end),cuts=[0,1];for(const cut of[center-half,center,center+half])if((a[axis]-cut)*(c[axis]-cut)<0)cuts.push((cut-a[axis])/(c[axis]-a[axis]));cuts.sort((a,b)=>a-b);for(let i=0;i<cuts.length-1;i++){
  const t=cuts[i],v=cuts[i+1],ha=height(a[0]+(c[0]-a[0])*t,a[1]+(c[1]-a[1])*t),hb=height(a[0]+(c[0]-a[0])*v,a[1]+(c[1]-a[1])*v);
  const q=[[t*s.width,eave,-.04],[v*s.width,eave,-.04],[v*s.width,hb,-.04],[t*s.width,ha,-.04]].filter((p,j,all)=>Math.hypot(p[0]-all[(j+1)%all.length][0],p[1]-all[(j+1)%all.length][1])>1e-7);if(q.length>=3)b.polygon(ff(r,s),r.recipe==='reconciliation'?'wall':'brick',q,r.recipe==='reconciliation'?'#b5bab0':r.recipe==='museum'?'#474d4b':BRICK);
 }b.box(ff(r,s),'trim',s.width/2,eave+.04,.03,s.width,.12,.18,r.recipe==='joseph'?PALE:'#81867d');}
}
function lancet(b:Batch,frame:Frame,u:number,bottom:number,w:number,h:number,v=.1,color=PALE,louver=false):void{
 const shoulder=bottom+h-w*.64,top=bottom+h,points=[[u-w/2,bottom,v],[u+w/2,bottom,v],[u+w/2,shoulder,v],[u,top,v],[u-w/2,shoulder,v]];
 b.polygon(frame,louver?'metal':'glass',points,louver?'#343e38':GLASS);
 const border=.11;for(const sign of[-1,1])b.box(frame,'trim',u+sign*(w/2+border/2),(bottom+shoulder)/2,v+.04,border,shoulder-bottom,.10,color);
 for(const sign of[-1,1]){const a=[u+sign*w/2,shoulder],c=[u,top],dx=c[0]-a[0],dy=c[1]-a[1],len=Math.hypot(dx,dy),nx=-dy/len*border,ny=dx/len*border;b.polygon(frame,'trim',[[a[0],a[1],v+.1],[c[0],c[1],v+.1],[c[0]+sign*nx,c[1]+sign*ny,v+.1],[a[0]+sign*nx,a[1]+sign*ny,v+.1]],color);}
 b.box(frame,'trim',u,bottom-.07,v+.05,w+.30,.13,.19,color);
 if(b.level<2){if(louver)for(let y=bottom+.16;y<shoulder;y+=.20)b.box(frame,'metal',u,y,v+.06,w,.065,.09,'#697267');else{b.box(frame,'metal',u,bottom+h*.44,v+.12,.05,h*.85,.035,METAL);for(let i=1;i<4;i++)panel(b,frame,'metal',u,bottom+(shoulder-bottom)*i/4,v+.13,w,.035,METAL);}}
}
function cone(b:Batch,frame:Frame,role:Role,u:number,y:number,v:number,base:number,top:number,height:number,color:string,sides=8):void{
 const indexed=new THREE.CylinderGeometry(top,base,height,sides,1),g=indexed.toNonIndexed();indexed.dispose();if(sides===4)g.rotateY(Math.PI/4);g.computeVertexNormals();const p=g.getAttribute('position'),n=g.getAttribute('normal'),values:number[]=[];for(let i=0;i<p.count;i++)values.push(u+p.getX(i),y+p.getY(i),v+p.getZ(i));b.geometry(frame,role,values,n.array,color);g.dispose();
}
function cross(b:Batch,frame:Frame,u:number,y:number,v:number,size=.7):void{b.box(frame,'metal',u,y-size/2,v,.065,size,.065,'#999777');b.box(frame,'metal',u,y-size*.34,v,size*.47,.055,.065,'#999777');}
function faces(r:Row,u:number,v:number,w:number,d:number):Frame[]{const a=f(r);return [
 {...a,start:[a.start[0]+a.tangent[0]*(u-w/2)+a.outward[0]*(v+d/2),a.start[1]+a.tangent[1]*(u-w/2)+a.outward[1]*(v+d/2)]},
 {...a,start:[a.start[0]+a.tangent[0]*(u+w/2)+a.outward[0]*(v-d/2),a.start[1]+a.tangent[1]*(u+w/2)+a.outward[1]*(v-d/2)],tangent:a.tangent.map(x=>-x),outward:a.outward.map(x=>-x)},
 {...a,start:[a.start[0]+a.tangent[0]*(u+w/2)+a.outward[0]*(v+d/2),a.start[1]+a.tangent[1]*(u+w/2)+a.outward[1]*(v+d/2)],tangent:a.outward.map(x=>-x),outward:a.tangent},
 {...a,start:[a.start[0]+a.tangent[0]*(u-w/2)+a.outward[0]*(v-d/2),a.start[1]+a.tangent[1]*(u-w/2)+a.outward[1]*(v-d/2)],tangent:a.outward,outward:a.tangent.map(x=>-x)}];}
function joseph(b:Batch,r:Row):void{
 shell(b,r,'brick',BRICK);roof(b,r,r.eave,r.ridge);
 const a=f(r),w=r.frame.width,center=w*.49,portalV=-1.55;
 // Central facade is recessed between the two mapped projecting tower feet.
 const centerFrame={...a};b.box(a,'brick',center,r.floor+6.5,portalV-.12,8.0,13.0,.18,BRICK);
 b.polygon(a,'brick',[[center-4,r.floor+13,portalV-.12],[center+4,r.floor+13,portalV-.12],[center,r.ridge,portalV-.12]],BRICK);
 for(const y of[r.floor+3.0,r.floor+5.0,r.floor+11.8])b.box(a,'trim',center,y,portalV+.02,8.15,.20,.24,PALE);
 for(let i=0;i<5;i++)lancet(b,centerFrame,center+(i-2)*1.16,r.floor+5.25,1.02,5.8-Math.abs(i-2)*.34,portalV+.13);
 b.box(a,'door',center,r.floor+1.4,portalV+.1,5.1,2.8,.11,'#655846');for(let i=-2;i<=2;i++)b.box(a,'metal',center+i*1.02,r.floor+1.4,portalV+.18,.045,2.75,.04,'#b0a27f');
 b.box(a,'trim',center,r.floor+3.11,portalV+.13,5.55,.26,.28,PALE);
 const towers=[{u:3.02,v:-3.86,w:5.72,d:7.55},{u:w-3.62,v:-3.72,w:6.5,d:7.22}];
 for(const t of towers){const top=r.floor+17.25,base=r.floor+12.25;b.box(a,'brick',t.u,(r.floor+top)/2,t.v,t.w,top-r.floor,t.d,BRICK);
  const fs=faces(r,t.u,t.v,t.w,t.d);for(const [i,face]of fs.entries()){const width=i<2?t.w:t.d;
   for(const y of[r.floor+.5,r.floor+4.8,r.floor+9.4,base,top-.25])b.box(face,'trim',width/2,y,.04,width+.14,.18,.22,PALE);
   for(const u of[.32,width-.32]){b.box(face,'brick',u,r.floor+8.5,.2,.40,17,.42,'#854835');for(const y of[r.floor+4.7,r.floor+9.3,base,top-.3])b.box(face,'trim',u,y,.24,.66,.22,.48,PALE);}
   for(const u of[width*.33,width*.67])lancet(b,face,u,base+.35,Math.min(1.45,width*.22),3.3,.12,PALE,true);
   lancet(b,face,width/2,r.floor+6.0,1.0,2.6,.13);
   if(i===0)lancet(b,face,width/2,r.floor+1.05,1.0,2.45,.13);
   if(b.level<2)for(let u=.7;u<width-.5;u+=.85)panel(b,face,'trim',u,top-.7,.14,.22,.35,PALE);
  }
  const cap=r.peak-.75,neck=top+.45;cone(b,a,'metal',t.u,top+.18,t.v,t.w*.54,t.w*.45,.36,'#59685e',8);cone(b,a,'metal',t.u,(neck+cap)/2,t.v,t.w*.45,.035,cap-neck,SLATE,8);cross(b,a,t.u,r.peak,t.v,.75);
 }
 for(const s of r.frames){if(s.width<9||s.outward[0]*a.outward[0]+s.outward[1]*a.outward[1]>.65)continue;const count=Math.max(2,Math.floor(s.width/5.0));for(let i=0;i<count;i++)lancet(b,ff(r,s),(i+.5)*s.width/count,r.floor+2.2,1.8,5.9,.13);for(let i=1;i<count;i++)b.box(ff(r,s),'brick',i*s.width/count,r.floor+4.7,.22,.54,9.4,.60,'#854835');}
 // The small green fleche is distinct from the darker front spires.
 cone(b,a,'metal',center,r.ridge+1.1,-24,.70,.46,2.2,'#648c7d',8);cone(b,a,'metal',center,r.ridge+3.0,-24,.80,.025,1.7,'#648c7d',8);cross(b,a,center,r.ridge+4.2,-24,.5);
}
function reconciliation(b:Batch,r:Row):void{
 const a=f(r),eave=r.floor+4.8;shell(b,r,'wall','#b5bab0',eave);
 // Separate church and parish-hall ridges. Clip each zone to the same exact footprint.
 const original=r.outline,splitEast=-2651.4,points=original.map(p=>[p[0],p[1]]);
 const east=split(points,0,splitEast,1),west=split(points,0,splitEast,-1);
 const partial=(outline:number[][],direction:number[],center:number,half:number,peak:number)=>{if(outline.length<3)return;const area=outline.reduce((s,p,i)=>{const q=outline[(i+1)%outline.length];return s+p[0]*q[1]-q[0]*p[1];},0);const frames=outline.map((p,i)=>{const q=outline[(i+1)%outline.length],dx=q[0]-p[0],dy=q[1]-p[1],width=Math.hypot(dx,dy);return{start:p,tangent:[dx/width,dy/width],outward:area<0?[-dy/width,dx/width]:[dy/width,-dx/width],width};});const rr={...r,outline,frame:{...r.frame,start:[0,0],tangent:[1,0],outward:[0,1]},frames};roof(b,rr,eave,peak,direction[0]?0:1,center,half);};
 partial(east,[0,1],-332.7,7.5,r.sourcePeak);partial(west,[1,0],-2657.8,6.0,r.sourcePeak-.7);
 for(const s of r.frames){if(s.width<4)continue;const count=Math.max(1,Math.floor(s.width/4.8));for(let i=0;i<count;i++)lancet(b,ff(r,s),(i+.5)*s.width/count,r.floor+1.0,1.15,2.95,.12,'#747e72');if(b.level<2)for(let u=.20;u<s.width;u+=.37)b.box(ff(r,s),'trim',u,r.floor+2.4,.025,.035,4.8,.05,'#a4ada0');}
 // The 2025 aerial registers the tower in the northeast front corner.
 // Its footprint is fitted inside the retained east nave wall, with only
 // shallow trim beyond it; the west projection belongs to the rear complex.
 const center=[12.25,-2.02],tw=4.4,td=4.4,footTop=r.floor+5.8,neck=r.floor+11.8,bellTop=r.floor+14.0;
 b.box(a,'wall',center[0],(r.floor+footTop)/2,center[1],tw,footTop-r.floor,td,'#abb3a7');
 const fr=faces(r,center[0],center[1],tw,td);
 for(const [i,s]of fr.entries()){const w=i<2?tw:td;lancet(b,s,w/2,r.floor+1,1.12,2.95,.12,'#747e72');b.box(s,'trim',w/2,footTop,.08,w+.26,.16,.26,'#747e72');}
 // Four planar tapered roof faces, rectangular at the base (not a round cone).
 const x=center[0],v=center[1],topW=1.52,topD=1.52;
 const lo=[[-tw/2,-td/2],[tw/2,-td/2],[tw/2,td/2],[-tw/2,td/2]],hi=[[-topW/2,-topD/2],[topW/2,-topD/2],[topW/2,topD/2],[-topW/2,topD/2]];
 for(let i=0;i<4;i++){const j=(i+1)%4;b.polygon(a,'roof',[[x+lo[i][0],footTop,v+lo[i][1]],[x+lo[j][0],footTop,v+lo[j][1]],[x+hi[j][0],neck,v+hi[j][1]],[x+hi[i][0],neck,v+hi[i][1]]].reverse(),SLATE);}
 b.box(a,'wall',x,(neck+bellTop)/2,v,topW,bellTop-neck,topD,'#747e72');for(const s of faces(r,x,v,topW,topD))lancet(b,s,topW/2,neck+.25,.80,bellTop-neck-.5,.06,'#a7afa0',true);
 cone(b,a,'roof',x,(bellTop+r.peak-.25)/2,v,1.12,.015,r.peak-.25-bellTop,SLATE,4);cross(b,a,x,r.peak,v,.4);
 // The historic front has a hooded doorway beside the tower. The current
 // eastern street face is verified by aerial paths; exact bay spacing remains
 // an inference, not a claim that the aerial resolves the door itself.
 const entryU=4.65,entryY=r.floor+.03;
 b.box(a,'metal',entryU,entryY+1.25,.07,2.08,2.50,.13,'#343e38');
 b.box(a,'door',entryU,entryY+1.18,.15,1.86,2.36,.10,'#59604f');
 b.box(a,'metal',entryU,entryY+1.18,.215,.048,2.34,.035,METAL);
 for(const sign of[-1,1]){b.box(a,'trim',entryU+sign*1.04,entryY+1.35,.19,.13,2.70,.25,'#747e72');lancet(b,a,entryU+sign*.46,entryY+.91,.55,1.16,.22,'#747e72');}
 b.box(a,'trim',entryU,entryY+2.65,.27,2.36,.17,.58,'#747e72');
 b.polygon(a,'roof',[[entryU-1.3,entryY+2.80,.03],[entryU,entryY+3.32,.03],[entryU,entryY+3.32,.67],[entryU-1.3,entryY+2.80,.67]].reverse(),SLATE);
 b.polygon(a,'roof',[[entryU,entryY+3.32,.03],[entryU+1.3,entryY+2.80,.03],[entryU+1.3,entryY+2.80,.67],[entryU,entryY+3.32,.67]].reverse(),SLATE);
 b.polygon(a,'trim',[[entryU-1.3,entryY+2.8,.68],[entryU+1.3,entryY+2.8,.68],[entryU,entryY+3.32,.68]],'#747e72');
}
function fire(b:Batch,r:Row):void{
 const a=f(r),eave=r.eave;shell(b,r,'brick','#925948',eave);roof(b,r,eave,eave);
 const w=r.frame.width,band=eave-.44;
 b.box(a,'trim',w/2,band,.06,w,.7,.22,'#d0c7ae');b.box(a,'metal',w/2,eave+.02,.11,w+.08,.18,.32,'#8c2723');
 const step=(w-1.4)/10,width=Math.min(3.55,step-.38),height=Math.min(3.27,eave-r.floor-.92);
 for(let i=0;i<10;i++){const u=.7+(i+.5)*step;b.box(a,'recess',u,r.floor+height/2,.08,width+.14,height+.14,.11,'#313a35');panel(b,a,'door',u,r.floor+height/2,.15,width,height,'#b1b3a4');
  for(let j=1;j<6;j++)panel(b,a,'metal',u,r.floor+height*j/6,.165,width,.032,'#6c756b');for(const sign of[-1,1])b.box(a,'trim',u+sign*(width/2+.06),r.floor+height/2,.15,.11,height+.1,.14,'#bebead');
  for(let j=0;j<4;j++)panel(b,a,'glass',u+(j-1.5)*width*.23,r.floor+height*.63,.18,width*.20,.51,GLASS);
 }
 for(const s of r.frames){if(s.width<7||s.outward[0]*a.outward[0]+s.outward[1]*a.outward[1]>.8)continue;for(let u=3;u<s.width-2;u+=6.4)b.window(ff(r,s),u,r.floor+1.30,1.7,1.15,.05,true);}
}
function museum(b:Batch,r:Row):void{
 const a=f(r),eave=r.floor+3.6;shell(b,r,'brick','#454b49',eave);roof(b,r,eave,eave);
 // The raised drill-hall volume stays inside the original irregular plan.
 const w=25.6,d=31.0,u=17.0,v=-23.0,top=r.floor+8.25;
 b.box(a,'stucco',u,(eave+top)/2,v,w,top-eave,d,'#c3c3b7');b.box(a,'roof',u,top+.06,v,w+.08,.12,d+.08,'#72766d');
 for(const s of r.frames){if(s.width<6)continue;const count=Math.floor(s.width/4.4);for(let i=0;i<count;i++){const x=(i+.5)*s.width/count,front=s.outward[0]*a.outward[0]+s.outward[1]*a.outward[1]>.9;
  if(front&&s.width>13&&Math.abs(x-s.width/2)<3.5)continue;
  if(i%4>=2) {b.box(ff(r,s),'brick',x,r.floor+2.2,.02,1.18,1.6,.08,'#4a504e');b.box(ff(r,s),'metal',x,r.floor+1.35,.10,1.3,.09,.15,'#343c39');}else b.window(ff(r,s),x,r.floor+1.3,1.15,1.6,.03);
 }}
 // The shallow mapped north projection receives the documented glazed lobby.
 const center=local(r,[-1981.49,-682.04]),vw=6.2,vd=2.3,vc=center[1]-.95,vg=r.floor+3.4;
 b.box(a,'glass',center[0],r.floor+1.6,vc,vw,3.2,vd,GLASS);
 for(const [i,s]of faces(r,center[0],vc,vw,vd).entries()){const width=i<2?vw:vd;for(const x of[0,width/2,width])b.box(s,'trim',x,r.floor+1.64,.06,.11,3.28,.13,'#d1d3c7');for(const y of[r.floor+.1,r.floor+1.52,vg-.15])b.box(s,'trim',width/2,y,.07,width,.10,.14,'#d1d3c7');}
 b.box(a,'roof',center[0],vg,vc,vw+.28,.18,vd+.25,'#8b9187');b.box(a,'trim',center[0],vg-.1,vc+vd/2+.06,vw+.24,.25,.18,'#d1d3c7');
}
export function applyLandmarkCompletion(group:THREE.Group,tileId:string,origin:readonly number[],level:number,sourceSha256:string):LandmarkCompletionReport|undefined{
 const rows=data.rows.filter(r=>r.tileId===tileId);if(!rows.length)return;
 if(group.userData.landmarkCompletion)return group.userData.landmarkCompletion as LandmarkCompletionReport;
 if(rows.some(r=>r.lods.find(l=>l.level===level)?.sha256!==sourceSha256||r.origin.some((v,i)=>v!==origin[i])))return{status:'source-mismatch',ids:[],removedTriangles:0,triangles:0,geometryBytes:0,meshes:0};
 const position=new THREE.Vector3(...origin as [number,number,number]);
 const filtered=filterEvidenceSources(group,position,rows.map(r=>({id:r.id,tileId,outline:r.outline,base:r.base,peak:r.sourcePeak,replaceBody:true})));
 const selected=rows.filter(r=>filtered.matched.has(r.id)),batch=new Batch(position,level);
 for(const row of selected){if(row.recipe==='joseph')joseph(batch,row);else if(row.recipe==='reconciliation')reconciliation(batch,row);else if(row.recipe==='fire')fire(batch,row);else museum(batch,row);}
 const built=batch.finish();built.group.name='Civic landmark completion';built.group.traverse(o=>{if(o instanceof THREE.Mesh){o.name=`Civic landmark completion | ${(o.material as THREE.Material).name}`;o.userData.category='landmark-completion';}});if(built.triangles)group.add(built.group);
 const report:LandmarkCompletionReport={status:'applied',ids:selected.map(r=>r.id),removedTriangles:filtered.removedTriangles,triangles:built.triangles,geometryBytes:built.bytes,meshes:built.group.children.length};group.userData.landmarkCompletion=report;return report;
}
