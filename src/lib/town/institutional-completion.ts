import * as THREE from 'three';
import data from '../../../data/derived/town/institutional-completion.json';
import {Batch,type Frame,type Role} from './crafted-frontages';
import {filterEvidenceSources} from './evidence-buildings';

type Row=typeof data.rows[number];
type Face=Row['parts'][number]['frames'][number];
export const INSTITUTIONAL_COMPLETION_ROWS=data.rows;
export type InstitutionalCompletionReport={status:'applied'|'source-mismatch';ids:string[];removedTriangles:number;triangles:number;geometryBytes:number;meshes:number};
const BRICK='#955e4b',DARK_BRICK='#795344',PALE='#bcb9a7',GLASS='#354e52',TEAL='#486779',SLATE='#535d60';
const frame=(r:Row,s:Row['frame']):Frame=>({...s,structId:r.id,tileId:r.tileId});
const world=(r:Row):Frame=>({start:[0,0],tangent:[1,0],outward:[0,1],structId:r.id,tileId:r.tileId});
function polygon(b:Batch,f:Frame,role:Role,points:readonly number[][],color:string,up=false):void{
 let p=points.map(x=>[...x]);
 for(let i=p.length-1;i>=0&&p.length>2;i--){const a=new THREE.Vector3(...p[(i+p.length-1)%p.length] as [number,number,number]),q=new THREE.Vector3(...p[i] as [number,number,number]),c=new THREE.Vector3(...p[(i+1)%p.length] as [number,number,number]);if(q.clone().sub(a).cross(c.sub(q)).length()<1e-7)p.splice(i,1);}
 if(p.length<3)return;
 const n=new THREE.Vector3().fromArray(p[1]).sub(new THREE.Vector3().fromArray(p[0])).cross(new THREE.Vector3().fromArray(p[2]).sub(new THREE.Vector3().fromArray(p[0])));
 if((up&&n.y<0)||(!up&&p.every(q=>Math.abs(q[2]-p[0][2])<1e-7)&&n.z<0))p.reverse();b.polygon(f,role,p,color);
}
function pane(b:Batch,f:Frame,u:number,bottom:number,w:number,h:number,trim=PALE,lights=2):void{
 b.box(f,'recess',u,bottom+h/2,.035,w+.17,h+.16,.11,'#303f3f');
 b.box(f,'glass',u,bottom+h/2,.108,w,h,.035,GLASS);
 for(const s of[-1,1])b.box(f,'trim',u+s*(w/2+.025),bottom+h/2,.15,.07,h+.13,.12,trim);
 for(const y of[bottom-.035,bottom+h+.035])b.box(f,'trim',u,y,.18,w+.20,.085,.18,trim);
 if(b.level<2){for(let i=1;i<lights;i++)b.box(f,'metal',u-w/2+w*i/lights,bottom+h/2,.17,.042,h,.04,trim);b.box(f,'metal',u,bottom+h*.70,.17,w,.045,.045,trim);}
}
function arched(b:Batch,f:Frame,u:number,bottom:number,w:number,h:number):void{
 const rad=w/2,shoulder=bottom+h-rad,v=.125,steps=b.level<2?10:6;
 const p=[[u-rad,bottom,v],[u+rad,bottom,v],[u+rad,shoulder,v]];
 for(let i=1;i<=steps;i++){const a=i*Math.PI/steps;p.push([u+Math.cos(a)*rad,shoulder+Math.sin(a)*rad,v]);}
 polygon(b,f,'glass',p,GLASS);
 for(const s of[-1,1])b.box(f,'brick',u+s*(rad+.085),(bottom+shoulder)/2,.15,.17,shoulder-bottom,.18,BRICK);
 for(let i=0;i<steps;i++){const a=i*Math.PI/steps,c=(i+1)*Math.PI/steps;polygon(b,f,'brick',[[u+Math.cos(a)*rad,shoulder+Math.sin(a)*rad,.18],[u+Math.cos(a)*(rad+.20),shoulder+Math.sin(a)*(rad+.20),.18],[u+Math.cos(c)*(rad+.20),shoulder+Math.sin(c)*(rad+.20),.18],[u+Math.cos(c)*rad,shoulder+Math.sin(c)*rad,.18]],BRICK);}
 b.box(f,'stone',u,bottom-.07,.17,w+.35,.13,.23,PALE);
 if(b.level<2){b.box(f,'metal',u,bottom+h/2,.19,.04,h,.04,'#b6bbaf');b.box(f,'metal',u,bottom+h*.45,.19,w,.04,.04,'#b6bbaf');}
}
function portal(b:Batch,r:Row,w:number,canopy:'flat'|'gable'|'curve'='flat'):void{
 const f=frame(r,r.frame),u=r.frame.width/2,y=r.floor,trim=r.recipe==='middle'?TEAL:PALE,h=r.recipe==='post'?3.45:2.75;
 b.box(f,'recess',u,y+h/2,.075,w+.22,h+.22,.14,'#303f3f');pane(b,f,u,y+.04,w,h,trim,4);
 for(const v of[-1,1])b.box(f,'stone',u+v*(w/2+.18),y+h/2,.18,.24,h+.25,.34,trim);
 b.box(f,'metal',u,y+1.05,.23,w*.8,.06,.06,trim);
 if(r.recipe==='post')b.box(f,'metal',u,y+2.30,.23,w,.075,.06,trim);
 if(canopy==='flat'){b.box(f,'roof',u,y+h+.25,.33,w+.85,.18,.92,SLATE);b.box(f,'trim',u,y+h+.20,.72,w+.9,.15,.15,trim);}
 else if(canopy==='gable'){
  const half=w*.65,peak=y+h+1.03,edge=y+h+.12;
  polygon(b,f,'roof',[[u-half,edge,-.05],[u,peak,-.05],[u,peak,.73],[u-half,edge,.73]],SLATE,true);
  polygon(b,f,'roof',[[u,peak,-.05],[u+half,edge,-.05],[u+half,edge,.73],[u,peak,.73]],SLATE,true);
  polygon(b,f,'trim',[[u-half,edge,.74],[u+half,edge,.74],[u,peak,.74]],trim);
 }else{
  const half=(w+.8)/2;for(let i=0;i<10;i++){const a=-Math.PI/2+i*Math.PI/10,c=-Math.PI/2+(i+1)*Math.PI/10;const x=u+Math.sin(a)*half,z=u+Math.sin(c)*half,ya=y+h+.14+Math.cos(a)*.52,yc=y+h+.14+Math.cos(c)*.52;polygon(b,f,'roof',[[x,ya,-.02],[z,yc,-.02],[z,yc,.71],[x,ya,.71]],PALE,true);}
 }
}
function shell(b:Batch,r:Row):void{
 const wood=['holy','emanuel','legion','siegel','zion','parish'].includes(r.recipe),body:Role=r.recipe==='rock'?'stone':wood?'wall':'brick',color=wood?'#c4c5b9':r.recipe==='rock'?'#a5a599':r.recipe==='middle'?'#ac7756':r.recipe==='bartlett'?DARK_BRICK:BRICK;
 for(const part of r.parts){
  for(const face of part.frames){const f=frame(r,face),w=face.width;
   b.box(f,body,w/2,(r.base+part.eave)/2,-.055,w,part.eave-r.base,.11,color);
   if(face.exterior){b.box(f,r.recipe==='rock'?'brick':'stone',w/2,r.floor-.13,.025,w,.26,.16,r.recipe==='rock'?BRICK:'#939284');b.box(f,'trim',w/2,part.eave+.045,.07,w+.05,.12,.26,r.recipe==='middle'?TEAL:r.recipe==='rock'?BRICK:PALE);}
   for(let i=0;i<face.roofEdge.length-1;i++){const [u,ha]=face.roofEdge[i],[v,hc]=face.roofEdge[i+1];polygon(b,f,body,[[u,part.eave,-.045],[v,part.eave,-.045],[v,hc,-.045],[u,ha,-.045]],color);}
  }
  for(const p of part.roofPolygons)polygon(b,world(r),'roof',p,r.recipe==='park'?'#a2aca8':SLATE,true);
 }
}
function windows(b:Batch,r:Row):void{
 if(['holy','emanuel','lodge','siegel','zion'].includes(r.recipe))return;
 for(const part of r.parts)for(const s of part.frames){if(!s.exterior||s.width<3.0)continue;const f=frame(r,s),w=s.width,h=part.eave-r.floor,front=s.outward[0]*r.frame.outward[0]+s.outward[1]*r.frame.outward[1]>.92;
  let stories=r.recipe==='post'?1:r.recipe==='anne'?3:(r.recipe==='legion'||r.recipe==='parish')?2:r.recipe==='park'&&h>8.5?3:h>6.7?2:1;
  const height=r.recipe==='post'?Math.min(3.90,h-1.10):stories===1?Math.min(2.1,h-1.5):Math.min(2.35,h/stories-1.35),step=h/stories;
  let count=Math.max(1,Math.floor((w-.7)/(r.recipe==='rock'?3.2:r.recipe==='anne'?2.3:r.recipe==='bartlett'?5.5:r.recipe==='park'?4.8:r.recipe==='police'?4.5:4.2)));
  if(r.recipe==='anne'&&front)count=s.width>12?7:4;
  if(r.recipe==='legion')count=front?5:s.width>23?9:Math.max(1,Math.floor(w/3));
  const spacing=w/count,ww=Math.min(r.recipe==='rock'?1.32:r.recipe==='anne'?1.32:r.recipe==='post'?3.6:r.recipe==='bartlett'?3.9:2.7,spacing-.8);
  for(let j=0;j<stories;j++)for(let i=0;i<count;i++){
   const u=(i+.5)*spacing,bottom=r.floor+(r.recipe==='post'?.55:.95)+j*step,px=s.start[0]+s.tangent[0]*u,py=s.start[1]+s.tangent[1]*u,du=(px-r.frame.start[0])*r.frame.tangent[0]+(py-r.frame.start[1])*r.frame.tangent[1],dv=(px-r.frame.start[0])*r.frame.outward[0]+(py-r.frame.start[1])*r.frame.outward[1];
   if(!j&&Math.abs(dv)<.5&&Math.abs(du-r.frame.width/2)<((r.recipe==='legion'||r.recipe==='rectory')?1.6:r.recipe==='anne'?1.2:3.6))continue;
   if(r.recipe==='rock'&&j===stories-1)arched(b,f,u,bottom,ww,height+.22);else pane(b,f,u,bottom,ww,height,r.recipe==='middle'?TEAL:PALE,r.recipe==='rock'?2:3);
  }
  if(r.recipe==='bartlett'||r.recipe==='police')for(let j=1;j<=stories;j++)b.box(f,'brick',w/2,r.floor+j*step-.20,.055,w,.42,.15,DARK_BRICK);
  if(r.recipe==='post'){
   // A restrained authored interpretation of the retained modern one-story
   // civic hall. Taller lights and their lintel resolve the otherwise blank
   // upper wall; they do not introduce an invented second story or signage.
   b.box(f,'stone',w/2,r.floor+.55+height+.18,.08,w,.18,.16,PALE);
   for(let i=1;i<count;i++){
    const u=i*spacing,px=s.start[0]+s.tangent[0]*u,py=s.start[1]+s.tangent[1]*u,du=(px-r.frame.start[0])*r.frame.tangent[0]+(py-r.frame.start[1])*r.frame.tangent[1],dv=(px-r.frame.start[0])*r.frame.outward[0]+(py-r.frame.start[1])*r.frame.outward[1];
    if(Math.abs(dv)<.5&&Math.abs(du-r.frame.width/2)<3.6)continue;
    b.box(f,'brick',u,(r.floor+part.eave)/2,.055,.18,h,.16,BRICK);
   }
  }
  if(r.recipe==='anne'||r.recipe==='saints'){for(let i=1;i<count;i++)b.box(f,'brick',i*spacing,(r.floor+part.eave)/2,.035,.24,h,.13,DARK_BRICK);b.box(f,'stone',w/2,part.eave-.45,.09,w,.20,.16,PALE);}
  if(r.recipe==='rock'){
   for(const u of[.18,w-.18])for(let y=r.floor+.32;y<part.eave-.2;y+=.52)b.box(f,'brick',u,y,.10,.42,.30,.23,BRICK);
   if(b.level===0)for(let x=.7;x<w-.5;x+=1.55)for(let y=r.floor+.35;y<part.eave-.3;y+=.95){const k=Math.round(x*7+y*11)%3;polygon(b,f,'stone',[[x-.32,y-.20,.015],[x+.40,y-.23,.015],[x+.37,y+.16,.015],[x-.28,y+.22,.015]],k===0?'#b0ae9e':k===1?'#949a92':'#a5a599');}
  }
 }
}
function rockDetails(b:Batch,r:Row):void{
 portal(b,r,2.3,'flat');
 const choices=[r.frame,r.frames.filter(s=>s.outward[0]<-.8&&s.width>15).sort((a,c)=>c.width-a.width)[0]].filter(Boolean);
 for(const s of choices){const f=frame(r,s),u=s.width/2,half=Math.min(4.0,s.width*.46),e=r.eave,p=r.peak-.12;
  polygon(b,f,'stone',[[u-half,e,.11],[u+half,e,.11],[u,p,.11]],'#a5a599');
  for(const side of[-1,1]){const a=[u+side*half,e,.20],c=[u,p,.20],dx=c[0]-a[0],dy=c[1]-a[1],len=Math.hypot(dx,dy);polygon(b,f,'brick',[a,c,[c[0]+side*dy/len*.16,c[1]-side*dx/len*.16,.20],[a[0]+side*dy/len*.16,a[1]-side*dx/len*.16,.20]],BRICK);}
  const cy=e+(p-e)*.47,rad=.43;for(let i=0;i<12;i++){const a=i*Math.PI/6,c=(i+1)*Math.PI/6;polygon(b,f,'glass',[[u,cy,.22],[u+Math.cos(a)*rad,cy+Math.sin(a)*rad,.22],[u+Math.cos(c)*rad,cy+Math.sin(c)*rad,.22]],GLASS);polygon(b,f,'brick',[[u+Math.cos(a)*rad,cy+Math.sin(a)*rad,.23],[u+Math.cos(a)*(rad+.16),cy+Math.sin(a)*(rad+.16),.23],[u+Math.cos(c)*(rad+.16),cy+Math.sin(c)*(rad+.16),.23],[u+Math.cos(c)*rad,cy+Math.sin(c)*rad,.23]],BRICK);}
 }
}
function middleDetails(b:Batch,r:Row):void{
 portal(b,r,3.9,'curve');const f=frame(r,r.frame),u=r.frame.width/2,v=-4.3,y=r.floor+6.05,w=6.2;
 b.box(f,'brick',u,y+.7,v,w,1.4,w,'#ac7756');
 // The source photograph supports a raised lantern; dimensions are fitted
 // to the entry elbow. This stays within the source plan, not over the bus loop.
 for(const s of[-1,1]){b.box(f,'glass',u,y+.75,v+s*(w/2+.01),4.8,1.02,.035,GLASS);b.box(f,'metal',u,y+.75,v+s*(w/2+.06),.06,1.08,.045,TEAL);}
 const lo=[[u-w/2,y+1.4,v-w/2],[u+w/2,y+1.4,v-w/2],[u+w/2,y+1.4,v+w/2],[u-w/2,y+1.4,v+w/2]],top=[u,y+2.7,v];
 for(let i=0;i<4;i++)polygon(b,f,'roof',[lo[i],lo[(i+1)%4],top],SLATE,true);
}
function historicCommunityDetails(b:Batch,r:Row):void{
 const f=frame(r,r.frame),doorU=r.frame.width/2;
 const lancet=(s:Frame,u:number,y:number,w:number,h:number)=>{
  const outer=[[u-w/2,y,.17],[u+w/2,y,.17],[u+w/2,y+h*.73,.17],[u,y+h,.17],[u-w/2,y+h*.73,.17]];
  polygon(b,s,'trim',outer,PALE);polygon(b,s,'glass',[[u-w/2+.09,y+.10,.18],[u+w/2-.09,y+.10,.18],[u+w/2-.09,y+h*.72,.18],[u,y+h-.15,.18],[u-w/2+.09,y+h*.72,.18]],GLASS);
  if(b.level<2){b.box(s,'metal',u,y+h*.45,.21,.055,h*.85,.045,PALE);b.box(s,'metal',u,y+h*.45,.21,w-.15,.055,.045,PALE);for(const side of[-1,1])polygon(b,s,'trim',[[u,y+h*.69,.215],[u+side*w*.23,y+h*.48,.215],[u+side*w*.23+.035,y+h*.51,.215],[u+.035,y+h*.72,.215]],PALE);}
 };
 if(r.recipe==='siegel'){
  const w=r.frame.width,step=w/6;
  for(let i=0;i<5;i++){
   const u=(i+.5)*w/5,y=r.floor+3.8;arched(b,f,u,y,1.20,2.1);
   if(b.level<2){const cy=y+1.52,rad=.28;for(const phase of[0,Math.PI])for(let j=0;j<3;j++){const a=phase-Math.PI/2+j*Math.PI*2/3,c=phase-Math.PI/2+(j+1)*Math.PI*2/3;const ax=u+Math.cos(a)*rad,ay=cy+Math.sin(a)*rad,cx=u+Math.cos(c)*rad,ccy=cy+Math.sin(c)*rad,len=Math.hypot(cx-ax,ccy-ay);polygon(b,f,'trim',[[ax,ay,.23],[cx,ccy,.23],[cx-(ccy-ay)/len*.025,ccy+(cx-ax)/len*.025,.23],[ax-(ccy-ay)/len*.025,ay+(cx-ax)/len*.025,.23]],PALE);}}
  }
  for(let i=0;i<6;i++){const u=(i+.5)*step;if(i===0||i===3){pane(b,f,u,r.floor+.04,1.5,2.7,PALE,2);b.box(f,'roof',u,r.floor+2.96,.38,1.95,.16,.75,SLATE);for(const side of[-1,1]){b.box(f,'trim',u+side*.83,r.floor+2.72,.32,.12,.40,.36,PALE);polygon(b,f,'trim',[[u+side*.83,r.floor+2.53,.15],[u+side*.83,r.floor+2.88,.52],[u+side*.83,r.floor+2.88,.15]],PALE);}}else pane(b,f,u,r.floor+1.05,1.15,1.95,PALE,2);}
  b.box(f,'stone',w*.5,r.floor+2.4,.17,.65,.42,.16,PALE);
  for(const face of r.frames){if(face.width<8||face.outward[0]*f.outward[0]+face.outward[1]*f.outward[1]>.9)continue;const sf=frame(r,face);for(let i=0;i<4;i++)for(let j=0;j<2;j++)pane(b,sf,(i+.5)*face.width/4,r.floor+1.0+j*3.3,1.22,1.85,PALE,2);}
 }else if(r.recipe==='zion'){
  for(const face of r.frames){if(face.width<8)continue;const sf=frame(r,face),front=face.outward[0]*f.outward[0]+face.outward[1]*f.outward[1]>.9,count=front?2:5;for(let i=0;i<count;i++)arched(b,sf,front?(i?.77:.23)*face.width:(i+.5)*face.width/count,r.floor+1.25,1.55,3.8);for(let x=.5;x<face.width-.3;x+=1.9)b.box(sf,'trim',x,r.eave-.24,.14,.12,.46,.33,PALE);}
  pane(b,f,doorU,r.floor+.04,2.3,2.8,PALE,2);
 }else if(r.recipe==='holy'||r.recipe==='emanuel'){
  for(const face of r.frames){if(face.width<7)continue;const s=frame(r,face),side=Math.abs(face.outward[0]*f.outward[0]+face.outward[1]*f.outward[1])<.4;if(!side)continue;const count=r.recipe==='holy'?5:4;
   for(let i=0;i<count;i++)lancet(s,(i+.5)*face.width/count,r.floor+1.1,r.recipe==='holy'?1.28:1.38,r.recipe==='holy'?4.5:3.25);
  }
  lancet(f,doorU,r.floor+.03,Math.min(2.45,r.frame.width-.3),3.5);
  b.box(f,'metal',doorU,r.floor+1.05,.23,1.35,.065,.055,PALE);
  // Historical wood cladding, current paint and exact chapel ridge inferred.
  for(const face of r.frames){if(face.width<2)continue;const s=frame(r,face);for(const x of[.08,face.width-.08])b.box(s,'trim',x,(r.floor+r.eave)/2,.11,.12,r.eave-r.floor,.18,PALE);}
 }else if(r.recipe==='legion'){
  portal(b,r,2.6,'flat');
  for(const p of r.parts)for(const face of p.frames){if(!face.exterior||face.width<3)continue;const s=frame(r,face);for(let x=.5;x<face.width-.3;x+=2.0){b.box(s,'trim',x,p.eave-.24,.18,.11,.42,.36,PALE);polygon(b,s,'trim',[[x-.065,p.eave-.47,.05],[x-.065,p.eave-.08,.35],[x-.065,p.eave-.08,.05]],PALE);}}
  for(const face of r.frames){if(face.width<10)continue;const s=frame(r,face);b.box(s,'brick',face.width/2,(r.base+r.floor)/2,.012,face.width,r.floor-r.base,.10,BRICK);}
 }else{
  // Four ascending corbie steps per half, continuous with the fitted gable.
  const w=r.frame.width,h=r.peak-.05-r.eave,half=w/2;for(let k=0;k<4;k++)for(const side of[-1,1]){const x=half+side*(half-(k+.5)*half/4),height=h*(k+1)/4;b.box(f,'brick',x,r.eave+height/2,.05,half/4+.012,height,.18,BRICK);b.box(f,'stone',x,r.eave+height+.028,.09,half/4+.12,.07,.25,PALE);}
  const segment=(face:Frame,u:number,y:number,w:number,h:number,blocked:boolean)=>{const rad=w/2,shoulder=y+h-.35,p=[[u-rad,y,.15],[u+rad,y,.15],[u+rad,shoulder,.15]];for(let i=1;i<=8;i++){const a=i*Math.PI/8;p.push([u+Math.cos(a)*rad,shoulder+Math.sin(a)*.35,.15]);}polygon(b,face,blocked?'brick':'glass',p,blocked?DARK_BRICK:GLASS);b.box(face,'brick',u,y-.06,.19,w+.20,.12,.22,DARK_BRICK);};
  for(const off of[-1,0,1])segment(f,half+off*w*.31,r.floor+(off===0?.05:1.05),off===0?1.5:1.55,off===0?2.8:1.8,false);
  for(const face of r.frames){if(face.width<12)continue;const s=frame(r,face);for(let i=0;i<4;i++)segment(s,(i+.5)*face.width/4,r.floor+1.05,1.45,1.8,true);}
 }
}
function residentialInstitutionDetails(b:Batch,r:Row):void{
 const rf=frame(r,r.frame);portal(b,r,Math.min(2.3,r.frame.width-.4),'flat');
 for(const face of r.frames){if(face.width<5)continue;const f=frame(r,face),count=Math.max(1,Math.floor(face.width/(r.recipe==='rectory'?5.3:7.0))),v=-.52;
  for(let i=0;i<count;i++){
   const u=(i+.5)*face.width/count,w=r.recipe==='rectory'?1.45:1.35,y=r.eave+.55,top=Math.min(r.peak-.35,y+2.1),e=top-.48;
   b.box(f,r.recipe==='rectory'?'brick':'wall',u,(r.eave+e)/2,v,w,e-r.eave,.82,r.recipe==='rectory'?BRICK:'#c4c5b9');
   const front={...f,start:[f.start[0]+f.outward[0]*(v+.42),f.start[1]+f.outward[1]*(v+.42)]};pane(b,front,u,y+.08,w-.30,e-y-.15,PALE,2);
   polygon(b,f,'trim',[[u-w/2,e,v+.43],[u+w/2,e,v+.43],[u,top,v+.43]],PALE);
   polygon(b,f,'roof',[[u-w/2,e,v-.45],[u,top,v-.45],[u,top,v+.45],[u-w/2,e,v+.45]],SLATE,true);
   polygon(b,f,'roof',[[u,top,v-.45],[u+w/2,e,v-.45],[u+w/2,e,v+.45],[u,top,v+.45]],SLATE,true);
  }
  if(r.recipe==='rectory'){
   const frontDot=face.outward[0]*rf.outward[0]+face.outward[1]*rf.outward[1];
   if(frontDot>.9||face.outward[0]<-.75){
    // A shallow, road-clear indication of the documented wrapping veranda.
    b.box(f,'paving',face.width/2,r.floor-.08,.35,face.width,.14,.70,'#939284');b.box(f,'roof',face.width/2,r.floor+2.93,.34,face.width+.05,.15,.74,SLATE);
    for(let x=.3;x<face.width-.1;x+=2.65)b.box(f,'trim',x,r.floor+1.40,.57,.13,2.8,.17,PALE);
    b.box(f,'trim',face.width/2,r.floor+2.84,.67,face.width,.20,.15,PALE);
   }
   for(let x=.35;x<face.width-.2;x+=1.25)b.box(f,'trim',x,r.eave-.24,.16,.12,.40,.31,PALE);
  }
 }
 if(r.recipe==='rectory'){
  const u=r.frame.width/2,y=r.floor+3.35;
  pane(b,rf,u,y+.08,1.75,2.60,PALE,2);
  b.box(rf,'stone',u,y,.39,2.9,.16,.75,PALE);for(const side of[-1,1])b.box(rf,'trim',u+side*1.2,y+1.32,.60,.14,2.62,.18,PALE);
  b.box(rf,'roof',u,y+2.72,.37,3.1,.16,.78,SLATE);b.box(rf,'metal',u,y+.47,.72,2.7,.055,.045,PALE);for(let x=-1.25;x<1.3;x+=.26)b.box(rf,'metal',u+x,y+.25,.72,.035,.48,.04,PALE);
 }
}
function detail(b:Batch,r:Row):void{
 shell(b,r);windows(b,r);
 if(r.recipe==='park'&&'pavilions' in r&&r.pavilions){
  for(const cap of r.pavilions){const f=frame(r,cap.frame),w=cap.frame.width;
   // Roof-clipped gabled pavilion: its front is outside the original wall
   // by 11 cm, with no opaque field covering existing top-floor windows.
   polygon(b,f,'brick',[[0,cap.eave,.11],[w,cap.eave,.11],[w/2,cap.peak,.11]],BRICK);
   for(const side of[-1,1]){const x=side<0?0:w,dx=w/2-x,dy=cap.peak-cap.eave,len=Math.hypot(dx,dy);polygon(b,f,'trim',[[x,cap.eave,.18],[w/2,cap.peak,.18],[w/2+side*dy/len*.13,cap.peak-side*dx/len*.13,.18],[x+side*dy/len*.13,cap.eave-side*dx/len*.13,.18]],PALE);}
   for(const edge of cap.roofEdge){const ef=frame(r,edge);for(let i=0;i<edge.roofEdge.length-1;i++){const a=edge.roofEdge[i],c=edge.roofEdge[i+1];polygon(b,ef,'brick',[[a[0],cap.eave,-.02],[c[0],cap.eave,-.02],[c[0],c[1],-.02],[a[0],a[1],-.02]],BRICK);}}
   for(const poly of cap.roofPolygons)polygon(b,world(r),'roof',poly,'#a2aca8',true);
  }
 }
 if(['holy','emanuel','legion','lodge','siegel','zion'].includes(r.recipe)){historicCommunityDetails(b,r);return;}
 if(r.recipe==='rectory'||r.recipe==='parish'){residentialInstitutionDetails(b,r);return;}
 if(r.recipe==='rock'){rockDetails(b,r);return;}
 if(r.recipe==='middle'){middleDetails(b,r);return;}
 portal(b,r,r.recipe==='post'?5.7:r.recipe==='bartlett'?5:r.recipe==='police'?3.0:r.recipe==='anne'?1.65:3.2,r.recipe==='park'?'gable':'flat');
 if(r.recipe==='anne'){
  const f=frame(r,r.frame),u=r.frame.width/2,top=r.eave;
  for(let i=0;i<4;i++)b.box(f,'stone',u,r.floor-.15*(i+1),.12+.16*i,3.8,.15,.20,PALE);
  b.box(f,'stone',u,top-.9,.12,2.3,.64,.17,PALE);b.box(f,'trim',u,top+.21,.1,3.0,.27,.24,PALE);
 }
}
export function applyInstitutionalCompletion(group:THREE.Group,tileId:string,origin:readonly number[],level:number,sourceSha256:string):InstitutionalCompletionReport|undefined{
 const rows=data.rows.filter(r=>r.tileId===tileId);if(!rows.length)return;
 if(group.userData.institutionalCompletion)return group.userData.institutionalCompletion as InstitutionalCompletionReport;
 if(rows.some(r=>r.lods.find(l=>l.level===level)?.sha256!==sourceSha256||r.origin.some((v,i)=>v!==origin[i])))return{status:'source-mismatch',ids:[],removedTriangles:0,triangles:0,geometryBytes:0,meshes:0};
 const position=new THREE.Vector3(...origin as [number,number,number]);
 const filtered=filterEvidenceSources(group,position,rows.map(r=>({id:r.id,tileId,outline:r.outline,base:r.base,peak:r.sourcePeak,replaceBody:true})));
 const selected=rows.filter(r=>filtered.matched.has(r.id)),batch=new Batch(position,level);for(const r of selected)detail(batch,r);
 const built=batch.finish();built.group.name='Institutional completion';built.group.traverse(o=>{if(o instanceof THREE.Mesh){o.name=`Institutional completion | ${(o.material as THREE.Material).name}`;o.userData.category='institutional-completion';}});if(built.triangles)group.add(built.group);
 const report:InstitutionalCompletionReport={status:'applied',ids:selected.map(r=>r.id),removedTriangles:filtered.removedTriangles,triangles:built.triangles,geometryBytes:built.bytes,meshes:built.group.children.length};group.userData.institutionalCompletion=report;return report;
}
