import * as THREE from 'three';
import source from '../../../data/derived/town/landmark-evidence.json';
import { Batch, type Frame, type Role } from './crafted-frontages';

export type EvidenceLandmark = {
  id: string; structId: string; name: string; tileId: string; outline: number[][];
  frame: Omit<Frame, 'structId' | 'tileId'> & { width: number; depth: number };
  frames: Array<Omit<Frame, 'structId' | 'tileId'> & { width: number; front: boolean }>;
  base: number; floor: number; eave: number; peak: number; ridge: number;
  replaceBody: boolean; signature: string | null; material: Role | null; paint: string | null;
  evidenceIds: string[]; applicationIds: string[]; cautions: string[]; sharedOutline: boolean;
  renderHints: Record<string, unknown>; protectedNamespaces: string[];
  currentExteriorVerified: false;
};
export const LANDMARK_EVIDENCE_ROWS = source.rows as unknown as EvidenceLandmark[];
export const LANDMARK_EVIDENCE_PROVENANCE = { version: source.version, ledgerSha256: source.sourceLedgerSha256, architectureSha256: source.sourceArchitectureSha256, rules: source.rules };
const byTile = new Map<string, EvidenceLandmark[]>();
for (const row of LANDMARK_EVIDENCE_ROWS) byTile.set(row.tileId, [...(byTile.get(row.tileId) ?? []), row]);
export function landmarkRows(tileId: string): EvidenceLandmark[] { return byTile.get(tileId) ?? []; }

const STONE = '#85877f', CUT_STONE = '#b2b3a5', SLATE = '#535d60', COPPER = '#68847b', GLASS = '#354e55', DARK = '#303b3a';
function frame(row: EvidenceLandmark): Frame { return { ...row.frame, structId: row.id, tileId: row.tileId }; }
function facade(row: EvidenceLandmark, f: EvidenceLandmark['frames'][number]): Frame { return { ...f, structId: row.id, tileId: row.tileId }; }
function outline(row: EvidenceLandmark): number[][] {
  const f = row.frame;
  return row.outline.map(p => { const x=p[0]-f.start[0], y=p[1]-f.start[1]; return [x*f.tangent[0]+y*f.tangent[1],x*f.outward[0]+y*f.outward[1]]; });
}
function horizontal(batch: Batch, row: EvidenceLandmark, points: number[][], height: (u:number,v:number)=>number, role: Role, color: string): void {
  const triangles=THREE.ShapeUtils.triangulateShape(points.map(p=>new THREE.Vector2(p[0],p[1])),[]);
  for(const indices of triangles) {
    const p=indices.map(i=>[points[i][0],height(points[i][0],points[i][1]),points[i][1]]);
    const normal=new THREE.Vector3().fromArray(p[1]).sub(new THREE.Vector3().fromArray(p[0])).cross(new THREE.Vector3().fromArray(p[2]).sub(new THREE.Vector3().fromArray(p[0])));
    if(normal.y<0)p.reverse();
    batch.polygon(frame(row),role,p,color);
  }
}
function split(points: number[][], axis: number, position: number, keep: number): number[][] {
  const result:number[][]=[];
  for(let i=0;i<points.length;i++) {
    const a=points[i],b=points[(i+1)%points.length],da=(a[axis]-position)*keep,db=(b[axis]-position)*keep;
    if(da>=0)result.push(a);
    if((da<0)!==(db<0)){const t=da/(da-db);result.push(a.map((x,j)=>x+(b[j]-x)*t));}
  }
  return result.filter((p,i)=>{const q=result[(i+1)%result.length];return Math.hypot(p[0]-q[0],p[1]-q[1])>1e-8;});
}
function shell(batch: Batch,row: EvidenceLandmark,role: Role,color: string): void {
  for(const f of row.frames) {
    const ff=facade(row,f);
    batch.box(ff,'foundation',f.width/2,(row.base+row.floor)/2,-.08,f.width,row.floor-row.base,.24,'#817f73');
    batch.box(ff,role,f.width/2,(row.floor+row.eave)/2,-.075,f.width,row.eave-row.floor,.20,color);
  }
}
function roof(batch: Batch,row: EvidenceLandmark,pitched: boolean): void {
  const p=outline(row),w=row.frame.width;
  const top=(u:number)=>pitched?row.eave+(row.ridge-row.eave)*Math.max(0,1-Math.abs(u-w/2)/(w/2)):row.eave+.16;
  for(const side of [-1,1]) {
    const clipped=split(p,0,w/2,side);
    if(clipped.length>=3)horizontal(batch,row,clipped,top,'roof',SLATE);
  }
  for(const f of row.frames) {
    const ff=facade(row,f),a=f.start,b=[a[0]+f.tangent[0]*f.width,a[1]+f.tangent[1]*f.width];
    const localU=(v:readonly number[])=>(v[0]-row.frame.start[0])*row.frame.tangent[0]+(v[1]-row.frame.start[1])*row.frame.tangent[1];
    const ua=localU(a),ub=localU(b),cuts=[0,f.width];
    if(pitched&&(ua-w/2)*(ub-w/2)<0)cuts.splice(1,0,f.width*(w/2-ua)/(ub-ua));
    for(let i=0;i<cuts.length-1;i++){
      const left=cuts[i],right=cuts[i+1],ha=top(ua+(ub-ua)*left/f.width),hb=top(ua+(ub-ua)*right/f.width);
      if(Math.max(ha,hb)<row.eave+1e-7)continue;
      const strip=[[left,row.eave,-.075],[right,row.eave,-.075],[right,hb,-.075],[left,ha,-.075]].filter((p,j,all)=>Math.hypot(p[0]-all[(j+1)%all.length][0],p[1]-all[(j+1)%all.length][1])>1e-8);
      batch.polygon(ff,row.material??'brick',strip,row.paint??STONE);
    }
    batch.box(ff,'trim',f.width/2,row.eave,.03,f.width,.15,.25,'#b2b1a4');
  }
}
function arch(batch: Batch,f: Frame,u:number,bottom:number,width:number,height:number,v=0,color=CUT_STONE):void {
  const radius=width/2,spring=bottom+height-radius,points=[[u-radius,bottom,v+.13],[u+radius,bottom,v+.13],[u+radius,spring,v+.13]];
  const segments=batch.level===2?8:12;
  for(let i=1;i<=segments;i++){const angle=i*Math.PI/segments;points.push([u+Math.cos(angle)*radius,spring+Math.sin(angle)*radius,v+.13]);}
  batch.polygon(f,'glass',points,GLASS);
  for(const sign of [-1,1])batch.box(f,'trim',u+sign*(radius+.07),(bottom+spring)/2,v+.17,.15,spring-bottom,.18,color);
  for(let i=0;i<segments;i++){
    const a=i*Math.PI/segments,b=(i+1)*Math.PI/segments,r=radius+.16;
    batch.polygon(f,'trim',[[u+Math.cos(a)*radius,spring+Math.sin(a)*radius,v+.22],[u+Math.cos(a)*r,spring+Math.sin(a)*r,v+.22],[u+Math.cos(b)*r,spring+Math.sin(b)*r,v+.22],[u+Math.cos(b)*radius,spring+Math.sin(b)*radius,v+.22]],color);
  }
  batch.box(f,'trim',u,bottom+.06,v+.22,width+.36,.15,.23,color);
  if(batch.level<2){batch.box(f,'metal',u,bottom+height*.48,v+.24,.05,height*.94,.05,DARK);for(let i=1;i<4;i++)batch.box(f,'metal',u,bottom+i*(height-radius)/4,v+.23,width,.045,.045,DARK);}
}
function cylinder(batch:Batch,f:Frame,role:Role,u:number,y:number,v:number,base:number,top:number,height:number,color:string,sides=12):void {
  const indexed=new THREE.CylinderGeometry(top,base,height,sides,1),geometry=indexed.toNonIndexed(),position=geometry.getAttribute('position'),normal=geometry.getAttribute('normal'),p:number[]=[];
  indexed.dispose();
  for(let i=0;i<position.count;i++)p.push(u+position.getX(i),y+position.getY(i),v+position.getZ(i));
  batch.geometry(f,role,p,normal.array,color);geometry.dispose();
}
function inside(points:number[][],u:number,v:number):boolean {
  let result=false;
  for(let i=0,j=points.length-1;i<points.length;j=i++) {const a=points[i],b=points[j];if((a[1]>v)!==(b[1]>v)&&u<(b[0]-a[0])*(v-a[1])/(b[1]-a[1])+a[0])result=!result;}
  return result;
}
function frontDepth(row:EvidenceLandmark,u:number):number {
  const points=outline(row),intersections:number[]=[];
  for(let i=0;i<points.length;i++){
    const a=points[i],b=points[(i+1)%points.length];
    if((a[0]>u)===(b[0]>u))continue;
    intersections.push(a[1]+(b[1]-a[1])*(u-a[0])/(b[0]-a[0]));
  }
  return intersections.length?Math.max(...intersections):0;
}
function towerFoot(row:EvidenceLandmark,desiredU:number,size:number):{u:number;v:number;width:number}|null {
  const points=outline(row),w=row.frame.width,d=row.frame.depth;
  for(const scale of [1,.85,.7]){
    const s=size*scale;
    for(let depth=s/2+.25;depth<Math.min(d*.45,16);depth+=.5) for(const shift of [0,-.5,.5,-1,1,-2,2]) {
      const u=Math.max(s/2+.2,Math.min(w-s/2-.2,desiredU+shift)),v=-depth;
      if([-1,1].every(a=>[-1,1].every(b=>inside(points,u+a*s/2,v+b*s/2))))return{u,v,width:s};
    }
  }
  return null;
}
function cross(batch:Batch,f:Frame,u:number,top:number,v:number,size:number):void {
  batch.box(f,'metal',u,top-size*.45,v,.08,size*.9,.08,'#888b81');
  batch.box(f,'metal',u,top-size*.36,v,size*.46,.07,.08,'#888b81');
}
function belfry(batch:Batch,row:EvidenceLandmark,foot:{u:number;v:number;width:number},bottom:number,top:number):void {
  const f=frame(row),s=foot.width;
  batch.box(f,'stone',foot.u,(row.floor+bottom)/2,foot.v,s,bottom-row.floor,s,STONE);
  batch.box(f,'stone',foot.u,(bottom+top)/2,foot.v,s*.86,top-bottom,s*.86,STONE);
  batch.box(f,'trim',foot.u,bottom,foot.v,s+.28,.22,s+.28,CUT_STONE);
  batch.box(f,'trim',foot.u,top,foot.v,s+.32,.22,s+.32,CUT_STONE);
  for(let i=0;i<4;i++) {
    const angle=i*Math.PI/2,t=[Math.cos(angle),Math.sin(angle)],n=[-Math.sin(angle),Math.cos(angle)];
    const start=[foot.u-t[0]*s*.43+n[0]*s*.43,foot.v-t[1]*s*.43+n[1]*s*.43];
    const face:Frame={...f,start:[f.start[0]+f.tangent[0]*start[0]+f.outward[0]*start[1],f.start[1]+f.tangent[1]*start[0]+f.outward[1]*start[1]],tangent:[f.tangent[0]*t[0]+f.outward[0]*t[1],f.tangent[1]*t[0]+f.outward[1]*t[1]],outward:[f.tangent[0]*n[0]+f.outward[0]*n[1],f.tangent[1]*n[0]+f.outward[1]*n[1]]};
    arch(batch,face,s*.43,bottom+.38,s*.42,Math.max(1,top-bottom-.75));
  }
}
function churchOpenings(batch:Batch,row:EvidenceLandmark,customFront=false):void {
  for(const f of row.frames) {
    if(f.width<4)continue;
    if(customFront&&f.outward[0]*row.frame.outward[0]+f.outward[1]*row.frame.outward[1]>.7)continue;
    const count=Math.max(1,Math.floor(f.width/4.8)),height=Math.max(2,Math.min(4.8,row.eave-row.floor-2.5));
    for(let i=0;i<count;i++)arch(batch,facade(row,f),(i+.5)*f.width/count,row.floor+1.55,Math.min(1.6,f.width/count*.43),height);
    if(batch.level<2)for(let i=1;i<count;i++)batch.box(facade(row,f),'stone',i*f.width/count,row.floor+(row.eave-row.floor)*.45,.24,.42,(row.eave-row.floor)*.9,.62,STONE);
  }
}
function portal(batch:Batch,f:Frame,u:number,bottom:number,width:number,height:number,v:number):void {
  arch(batch,f,u,bottom,width,height,v);
  const doors=Math.min(2.65,height-width/2-.08);
  batch.box(f,'door',u,bottom+doors/2,v+.28,width-.14,doors,.09,'#554d3e');
  batch.box(f,'metal',u,bottom+doors/2,v+.34,.055,doors,.04,'#888675');
  if(batch.level<2)for(const sign of [-1,1]){
    batch.box(f,'trim',u+sign*width*.255,bottom+doors*.48,v+.335,width*.33,doors*.72,.025,'#655b48');
    batch.box(f,'metal',u+sign*.13,bottom+1.1,v+.37,.035,.18,.03,'#b7b097');
  }
}
function quoins(batch:Batch,f:Frame,u:number,v:number,width:number,bottom:number,top:number):void {
  for(let y=bottom+.25,i=0;y<top-.12;y+=.64,i++)for(const sign of [-1,1])batch.box(f,'trim',u+sign*(width/2-.13),y,v+.1,i%2?.40:.58,.25,.22,CUT_STONE);
}
function sacredHeart(batch:Batch,row:EvidenceLandmark):void {
  shell(batch,row,'stone',STONE);roof(batch,row,true);churchOpenings(batch,row,true);
  const f=frame(row),w=row.frame.width,front=row.frames.find(x=>x.front)!;
  const center=[front.start[0]+front.tangent[0]*front.width/2,front.start[1]+front.tangent[1]*front.width/2];
  const centerU=(center[0]-f.start[0])*f.tangent[0]+(center[1]-f.start[1])*f.tangent[1];
  const central=towerFoot(row,centerU,Math.min(6.4,front.width-.5));
  if(central){
    // The source roofprint includes the central projecting bay. A small forward
    // offset keeps its wall/openings in front of the continuous nave shell.
    central.v=frontDepth(row,central.u)-central.width/2+.30;
    const belfryTop=row.peak-5.8,belfryBase=belfryTop-3.3;
    belfry(batch,row,central,belfryBase,belfryTop);
    cylinder(batch,f,'roof',central.u,(belfryTop+row.peak-.55)/2,central.v,central.width*.58,.025,row.peak-.55-belfryTop,SLATE,8);
    cross(batch,f,central.u,row.peak,central.v,.9);
    const face=central.v+central.width/2;
    portal(batch,f,central.u,row.floor+.12,2.65,4.25,face);
    for(const sign of [-1,1])arch(batch,f,central.u+sign*1.12,row.floor+5.05,1.35,2.95,face);
    arch(batch,f,central.u,row.floor+8.8,1.75,2.85,face);
    quoins(batch,f,central.u,face,central.width,row.floor,belfryBase);
    for(const y of [row.floor+4.5,row.floor+8.25])batch.box(f,'trim',central.u,y,face+.1,central.width+.15,.16,.26,CUT_STONE);
  }
  for(const u of [w*.13,w*.87]){
    const foot=towerFoot(row,u,2.4);if(!foot)continue;
    const top=Math.min(row.eave+(row.ridge-row.eave)*.58,row.peak-9);
    batch.box(f,'stone',foot.u,(row.floor+top)/2,foot.v,foot.width,top-row.floor,foot.width,STONE);
    quoins(batch,f,foot.u,foot.v+foot.width/2,foot.width,row.floor,top);
    const capHeight=1.75;
    cylinder(batch,f,'metal',foot.u,top+.25,foot.v,foot.width*.67,foot.width*.54,.5,COPPER,4);
    cylinder(batch,f,'metal',foot.u,top+.5+capHeight/2,foot.v,foot.width*.54,.12,capHeight,COPPER,4);
    cross(batch,f,foot.u,top+capHeight+1,foot.v,.55);
  }
  for(const u of [w*.26,w*.84]){
    const v=frontDepth(row,u)+.03;
    portal(batch,f,u,row.floor+.12,1.9,3.65,v);
    arch(batch,f,u,row.floor+4.2,1.35,3.6,v);
  }
}
function firstBaptist(batch:Batch,row:EvidenceLandmark):void {
  shell(batch,row,'stone',STONE);roof(batch,row,true);churchOpenings(batch,row);
  const f=frame(row),w=row.frame.width;
  const southeast=f.tangent[0]-f.tangent[1]>0?w*.84:w*.16,foot=towerFoot(row,southeast,Math.min(4.1,w*.26));
  if(foot){const top=row.peak-4.4;belfry(batch,row,foot,top-2.5,top);cylinder(batch,f,'roof',foot.u,(top+row.peak-.55)/2,foot.v,foot.width*.62,.025,row.peak-.55-top,SLATE,8);cross(batch,f,foot.u,row.peak,foot.v,.8);}
  const radius=Math.min(1.45,w*.09),y=row.eave+.5;
  const disc=Array.from({length:24},(_,i)=>[w*.48+radius*Math.cos(i*Math.PI/12),y+radius*Math.sin(i*Math.PI/12),-.08]);
  batch.polygon(f,'glass',disc,GLASS);
  for(let i=0;i<16;i++){const a=i*Math.PI/8,b=(i+1)*Math.PI/8;batch.polygon(f,'trim',[[w*.48+radius*Math.cos(a),y+radius*Math.sin(a),.02],[w*.48+(radius+.16)*Math.cos(a),y+(radius+.16)*Math.sin(a),.02],[w*.48+(radius+.16)*Math.cos(b),y+(radius+.16)*Math.sin(b),.02],[w*.48+radius*Math.cos(b),y+radius*Math.sin(b),.02]],CUT_STONE);}
  arch(batch,f,w*.48,row.floor+.1,2.4,4.2,-.02);
}
function modernWindows(batch:Batch,row:EvidenceLandmark,floors:number):void {
  for(const f of row.frames){if(f.width<3)continue;const count=Math.max(1,Math.floor(f.width/4.3)),storey=(row.eave-row.floor)/floors;for(let floor=0;floor<floors;floor++)for(let i=0;i<count;i++)batch.window(facade(row,f),(i+.5)*f.width/count,row.floor+floor*storey+.9,Math.min(2.4,f.width/count*.66),Math.max(1.3,storey-1.65),.03,true);}
}
function saintLouis(batch:Batch,row:EvidenceLandmark):void {
  shell(batch,row,'brick','#997760');roof(batch,row,false);modernWindows(batch,row,1);
  const f=frame(row),w=row.frame.width,entrance=towerFoot(row,w*.5,Math.min(7,w*.2));
  if(entrance){const v=entrance.v+entrance.width/2;batch.box(f,'roof',entrance.u,row.floor+3.8,v+.15,entrance.width+.3,.24,1.6,'#686c64');for(const shift of [-.75,.75])batch.door(f,entrance.u+shift,row.floor,v,.95,'#4b4f4b');cross(batch,f,entrance.u,row.eave-.6,v+.23,1.55);}
  // The present 1971 brick church has no documented Gothic tower or pointed spires.
}
function kellyLibrary(batch:Batch,row:EvidenceLandmark):void {
  shell(batch,row,'brick','#a28169');roof(batch,row,false);modernWindows(batch,row,2);
  const f=frame(row),w=row.frame.width,h=row.eave-row.floor,front=row.frames.filter(x=>x.front).sort((a,b)=>b.width-a.width)[0];
  if(front){const ff=facade(row,front),span=front.width*.68,start=front.width*.16;
    batch.box(ff,'glass',start+span/2,row.floor+h/2,.12,span,h-.5,.05,GLASS);
    for(let u=start;u<start+span+.01;u+=span/8)batch.box(ff,'metal',u,row.floor+h/2,.22,.07,h-.35,.12,'#72776f');
    batch.box(ff,'metal',start+span/2,row.floor+h*.5,.24,span,.14,.12,'#72776f');
    batch.box(ff,'roof',start+span/2,row.eave,.25,span+.5,.25,1.15,'#a4a598');
    for(let i=0;i<4;i++)batch.box(ff,'trim',start+i*span/3,row.floor+h/2,.6,.2,h,.25,'#bcbcb0');
    batch.door(ff,start+span*.65,row.floor,.29,1.35,'#5b6663');
    // The architect documents a projecting two-storey reading-room glass corner.
    // Projection and mullion spacing are restrained inferred dimensions, not a survey.
    const bayFace=row.frames.filter(x=>x.width>6&&x.outward[0]*f.outward[0]+x.outward[1]*f.outward[1]>.95).sort((a,b)=>(b.start[1]+b.tangent[1]*b.width/2)-(a.start[1]+a.tangent[1]*a.width/2))[0]??front;
    const bf=facade(row,bayFace),bayWidth=Math.min(7.5,bayFace.width*.34),northEnd=bf.tangent[1]>0;
    const bayU=northEnd?bayFace.width-bayWidth/2-.3:bayWidth/2+.3;
    batch.box(bf,'glass',bayU,row.floor+h/2,.57,bayWidth,h-.45,.05,GLASS);
    for(const sign of [-1,1])batch.box(bf,'glass',bayU+sign*bayWidth/2,row.floor+h/2,.31,.05,h-.45,.55,GLASS);
    for(let i=0;i<=5;i++)batch.box(bf,'metal',bayU-bayWidth/2+i*bayWidth/5,row.floor+h/2,.63,.055,h-.3,.08,'#72776f');
    for(const y of [row.floor+.12,row.floor+h*.5,row.eave-.08])batch.box(bf,'trim',bayU,y,.37,bayWidth+.2,.15,.72,'#a4a598');
  }
  const lantern=towerFoot(row,w*.54,Math.min(6,w*.2));
  if(lantern){const rise=Math.min(2.2,row.peak-row.eave-.3);batch.box(f,'glass',lantern.u,row.eave+rise/2,lantern.v,lantern.width,rise,lantern.width,GLASS);batch.box(f,'roof',lantern.u,row.eave+rise,lantern.v,lantern.width+.3,.17,lantern.width+.3,'#a4a598');}
}
export function buildEvidenceLandmarks(batch:Batch,rows:EvidenceLandmark[]):void {
  for(const row of rows) {
    if(!row.replaceBody)continue;
    if(row.signature==='sacred-heart')sacredHeart(batch,row);
    else if(row.signature==='first-baptist')firstBaptist(batch,row);
    else if(row.signature==='saint-louis')saintLouis(batch,row);
    else if(row.signature==='kelly-library')kellyLibrary(batch,row);
  }
}
