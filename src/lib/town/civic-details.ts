import * as THREE from 'three';
import source from '../../../data/derived/town/civic-details.json';
import schoolRoof from '../../../data/derived/town/civic-roof-finish.json';
import { Batch, type Frame, type Role } from './crafted-frontages';

type CivicFrame = Frame & { id: string; faceIndex: number; width: number; recipe: string; bays: number };
export type CivicDetailReport = { version: number; status: 'applied' | 'source-mismatch'; frames: number; windows: number; entrances: number; triangles: number; meshes: number; geometryBytes: number };
export const CIVIC_DETAIL_FRAMES = source.frames as unknown as CivicFrame[];
export const CIVIC_DETAIL_PROVENANCE = { sourceUrls: source.sourceUrls, observations: source.observations, inference: source.inference, sourceManifestSha256: source.sourceManifestSha256 };
const PALE = '#d7d3c6', FRAME = '#293b3b', GLASS = '#344d50', BRICK = '#864f3e';
const count = { windows: 0, entrances: 0 };
function panel(batch:Batch,f:CivicFrame,role:Role,u:number,y:number,v:number,width:number,height:number,color:string):void {
 batch.polygon(f,role,[[u-width/2,y-height/2,v],[u+width/2,y-height/2,v],[u+width/2,y+height/2,v],[u-width/2,y+height/2,v]],color);
}

function pane(batch: Batch, f: CivicFrame, u: number, bottom: number, width: number, height: number, columns = 3, rows = 4, v = .09): void {
  count.windows++;
  batch.box(f, 'recess', u, bottom+height/2, v, width+.12, height+.12, .05, FRAME);
  panel(batch,f,'glass',u,bottom+height/2,v+.055,width,height,GLASS);
  for (const sign of [-1,1]) batch.box(f, 'metal', u+sign*(width/2-.028), bottom+height/2, v+.068, .065, height, .05, FRAME);
  for (const y of [bottom+.03, bottom+height/2, bottom+height-.03]) batch.box(f, 'metal', u, y, v+.070, width, .065, .052, FRAME);
  if (batch.level < 2) {
    for (let i=1;i<columns;i++) panel(batch,f,'metal',u-width/2+i*width/columns,bottom+height/2,v+.085,.025,height,FRAME);
    for (let i=1;i<rows;i++) if (i*2!==rows) panel(batch,f,'metal',u,bottom+i*height/rows,v+.089,width,.025,FRAME);
  }
  batch.box(f, 'trim', u, bottom-.08, v+.09, width+.25, .14, .24, PALE);
}

function keystone(batch: Batch, f: CivicFrame, u: number, y: number, v=.14): void {
  batch.polygon(f, 'trim', [[u-.10,y,v],[u+.10,y,v],[u+.19,y+.38,v],[u-.19,y+.38,v]], PALE);
}

function arch(batch: Batch, f: CivicFrame, u: number, bottom: number, width: number, height: number, entrance=false, pale=false, v=.12): void {
  const radius=width/2, spring=bottom+height-radius, segments=batch.level===2?10:16;
  const outline=[[u-radius,bottom,v],[u+radius,bottom,v],[u+radius,spring,v]];
  for(let i=1;i<=segments;i++){const angle=i*Math.PI/segments;outline.push([u+radius*Math.cos(angle),spring+radius*Math.sin(angle),v]);}
  batch.polygon(f, entrance?'door':'glass', outline, entrance?FRAME:GLASS);
  const border=pale?.23:.12, role:Role=pale?'trim':'brick', color=pale?PALE:BRICK;
  for(const sign of[-1,1])batch.box(f,role,u+sign*(radius+border/2),(bottom+spring)/2,v+.025,border,spring-bottom,.14,color);
  for(let i=0;i<segments;i++){
    const a=i*Math.PI/segments,b=(i+1)*Math.PI/segments;
    batch.polygon(f,role,[[u+radius*Math.cos(a),spring+radius*Math.sin(a),v+.10],[u+(radius+border)*Math.cos(a),spring+(radius+border)*Math.sin(a),v+.10],[u+(radius+border)*Math.cos(b),spring+(radius+border)*Math.sin(b),v+.10],[u+radius*Math.cos(b),spring+radius*Math.sin(b),v+.10]],color);
  }
  keystone(batch,f,u,bottom+height+.035,v+.14);
  batch.box(f,'trim',u,bottom-.07,v+.10,width+.35,.14,.26,PALE);
  batch.box(f,'metal',u,(bottom+spring)/2,v+.13,.052,spring-bottom,.045,FRAME);
  batch.box(f,'metal',u,spring,v+.13,width,.065,.05,FRAME);
  if (entrance) {
    count.entrances++;
    const doorHeight=Math.min(3.3,spring-bottom);
    for(const sign of[-1,1])pane(batch,f,u+sign*width*.24,bottom+.65,width*.40,doorHeight-.92,2,3,v+.045);
    batch.box(f,'metal',u,bottom+doorHeight,v+.14,width,.07,.07,FRAME);
    for(const sign of[-1,1])batch.box(f,'metal',u+sign*.11,bottom+1.3,v+.17,.035,.30,.05,'#b0ada0');
  } else {
    count.windows++;
    if(batch.level<2){
      for(const offset of[-.25,.25])batch.box(f,'metal',u+offset*width,(bottom+spring)/2,v+.13,.033,spring-bottom,.04,FRAME);
      for(let i=1;i<5;i++)batch.box(f,'metal',u,bottom+(spring-bottom)*i/5,v+.14,width,.035,.04,FRAME);
    }
  }
  if(batch.level<2)for(const angle of[Math.PI/4,Math.PI/2,Math.PI*3/4]){
    const dx=radius*Math.cos(angle),dy=radius*Math.sin(angle),length=Math.hypot(dx,dy),nx=-dy/length*.016,ny=dx/length*.016;
    batch.polygon(f,'metal',[[u+nx,spring+ny,v+.15],[u+dx+nx,spring+dy+ny,v+.15],[u+dx-nx,spring+dy-ny,v+.15],[u-nx,spring-ny,v+.15]],FRAME);
  }
}

function cornice(batch: Batch, f:CivicFrame, height:number):void {
  const w=f.width-.16;
  batch.box(f,'trim',f.width/2,height-.31,.11,w,.60,.22,PALE);
  batch.box(f,'trim',f.width/2,height+.02,.18,w,.13,.40,PALE);
  batch.box(f,'trim',f.width/2,height+.18,.21,w,.12,.48,PALE);
  if(batch.level<2)for(let u=.35;u<f.width-.22;u+=.70)batch.box(f,'trim',u,height-.01,.32,.12,.19,.15,PALE);
}
function quoins(batch:Batch,f:CivicFrame,bottom:number,top:number):void {
  for(const sign of[-1,1])for(let y=bottom+.32,i=0;y<top-.4;y+=.64,i++){
    const w=i%2?.67:.80,u=sign<0?w/2:f.width-w/2;
    batch.box(f,'trim',u,y,.095,w,.60,.18,PALE);
  }
}
function hall(batch:Batch,f:CivicFrame):void {
  cornice(batch,f,50.64);
  quoins(batch,f,38.65,50.3);
  for(let i=0;i<f.bays;i++){
    const u=(i+.5)*f.width/f.bays;
    pane(batch,f,u,45.20,1.62,3.52,4,6);keystone(batch,f,u,48.86);
    batch.box(f,'trim',u,49.74,.12,2.10,.48,.15,PALE);
    if(f.recipe==='town-hall-side'&&i===2)arch(batch,f,u,38.85,2.25,4.30,true,true);
    else {pane(batch,f,u,39.45,1.62,3.34,4,6);keystone(batch,f,u,42.91);}
  }
}
function auditorium(batch:Batch,f:CivicFrame):void {
  cornice(batch,f,50.25);
  for(let i=0;i<f.bays;i++){
    const u=(i+.5)*f.width/f.bays;
    arch(batch,f,u,44.02,2.0,5.40);
    if(i===2){
      const floor=38.73;
      batch.box(f,'door',u,floor+1.47,.15,2.0,2.94,.09,FRAME);
      batch.box(f,'metal',u,floor+1.47,.205,.05,2.94,.05,'#46514c');
      keystone(batch,f,u,floor+3.06,.2);count.entrances++;
    }else{pane(batch,f,u,39.2,1.66,2.35,3,4);keystone(batch,f,u,41.68);}
  }
}
function clock(batch:Batch,f:CivicFrame,u:number,y:number):void {
  const radius=.53,n=batch.level===2?16:32;
  const disk=[[u,y,.45],...Array.from({length:n+1},(_,i)=>[u+radius*Math.cos(i*2*Math.PI/n),y+radius*Math.sin(i*2*Math.PI/n),.45])];
  for(let i=1;i<disk.length-1;i++)batch.polygon(f,'trim',[disk[0],disk[i],disk[i+1]],'#c6c8be');
  for(let i=0;i<12;i++){
    const a=i*Math.PI/6,r=radius*.82;
    batch.box(f,'metal',u+r*Math.sin(a),y+r*Math.cos(a),.47,.035,.08,.03,FRAME);
  }
  batch.box(f,'metal',u,y+.15,.49,.035,.30,.03,FRAME);
  batch.box(f,'metal',u+.115,y,.49,.23,.035,.03,FRAME);
  // Stylized paired scroll relief preserves the documented floral surround's
  // place and scale without inventing an exact sculptural reproduction.
  if(batch.level===0)for(const sign of[-1,1])for(let i=0;i<6;i++){
    const a=.25+i*.40,rr=.12+i*.026;
    batch.box(f,'trim',u+sign*(.70+Math.sin(a)*.35),y-.30+Math.cos(a)*.51,.35,rr,.14,.13,PALE,sign*.45);
  }
}
function school(batch:Batch,f:CivicFrame):void {
  const central=f.recipe==='school-entry', top=central?58.58:58.05;
  cornice(batch,f,top);
  if(f.recipe==='school-blind-end'){
    for(const y of[42.65,46.5])batch.box(f,'trim',f.width/2,y,.09,f.width-.15,.19,.20,PALE);
    return;
  }
  for(const y of[42.65,46.5])batch.box(f,'trim',f.width/2,y,.09,f.width-.15,.19,.20,PALE);
  if(central){
    batch.box(f,'trim',f.width/2,42.47,.08,f.width-.14,8.10,.14,PALE);
    const base=58.72,apex=60.85;
    batch.polygon(f,'trim',[[.5,base,.24],[f.width-.5,base,.24],[f.width/2,apex,.24]],PALE);
    // This pediment rises above the flat roof. Its rear and edge thickness must
    // remain solid when seen from the civic green behind the entrance facade.
    const pediment=[[.5,base],[f.width-.5,base],[f.width/2,apex]];
    batch.polygon(f,'trim',pediment.slice().reverse().map(([u,y])=>[u,y,.04]),PALE);
    for(let i=0;i<3;i++){
      const a=pediment[i],b=pediment[(i+1)%3];
      batch.polygon(f,'trim',[[a[0],a[1],.04],[b[0],b[1],.04],[b[0],b[1],.24],[a[0],a[1],.24]],PALE);
    }
    for(const sign of[-1,1]){
      const x0=sign<0?.5:f.width-.5,dx=f.width/2-x0,dy=apex-base,length=Math.hypot(dx,dy),nx=-dy/length*.10,ny=dx/length*.10;
      batch.polygon(f,'trim',[[x0+nx,base+ny,.39],[f.width/2+nx,apex+ny,.39],[f.width/2-nx,apex-ny,.39],[x0-nx,base-ny,.39]],'#dfdccf');
    }
    clock(batch,f,f.width/2,59.54);
    for(let i=0;i<=5;i++){
      const u=.62+i*(f.width-1.24)/5;
      batch.box(f,'trim',u,52.04,.14,.69,10.78,.22,PALE);
      batch.box(f,'trim',u,46.75,.23,.95,.30,.38,PALE);
      batch.box(f,'trim',u,57.44,.22,1.05,.35,.37,PALE);
      if(batch.level<2)for(const shift of[-.32,0,.32])batch.box(f,'trim',u+shift,57.23,.30,.15,.38,.22,PALE);
    }
    arch(batch,f,f.width/2,39.05,3.05,7.04,true,true,.21);
  }
  for(let i=0;i<f.bays;i++){
    const u=(i+.5)*f.width/f.bays, w=central?1.85:Math.min(1.8,f.width/f.bays*.47);
    if(!central||i!==2){pane(batch,f,u,39.72,w,2.65,4,4,central?.25:.10);pane(batch,f,u,43.08,w,2.80,4,4,central?.25:.10);}
    if(central){
      pane(batch,f,u,48.02,w,3.55,4,6,.18);
      for(const sign of[-1,1])batch.box(f,'trim',u+sign*(w/2+.12),49.80,.23,.17,3.9,.23,PALE);
      batch.box(f,'trim',u,51.94,.30,w+.62,.24,.42,PALE);
      batch.box(f,'trim',u,47.58,.22,w+.46,.58,.30,PALE);
      pane(batch,f,u,54.03,w,2.26,4,4,.17);
    }else{
      if(f.recipe==='school-north-arched')arch(batch,f,u,47.53,w*1.25,4.12);
      else{pane(batch,f,u,47.67,w,3.33,4,6);keystone(batch,f,u,51.13);}
      pane(batch,f,u,53.23,w,3.20,4,6);
    }
  }
}
/** The connector hides the lower stories of this internal height step. NPS
 * photo 18 supports upper rectangular windows and pale trim; the five-bay
 * spacing follows the adjacent school rhythm and is an authored inference. */
function schoolRoofStep(batch:Batch):void {
  const a=schoolRoof.polygon[schoolRoof.polygon.length-1],b=schoolRoof.polygon[0];
  const dx=b[0]-a[0],dy=b[1]-a[1],width=Math.hypot(dx,dy);
  const f:CivicFrame={id:'CIVIC-school-roof-step',faceIndex:-1,structId:schoolRoof.structId,tileId:schoolRoof.tileId,start:[a[0],a[1]],tangent:[dx/width,dy/width],outward:[-dy/width,dx/width],width,recipe:'school-roof-step',bays:5};
  cornice(batch,f,58.05);
  for(let i=0;i<f.bays;i++)pane(batch,f,(i+.5)*width/f.bays,53.23,1.8,3.20,4,6);
}

export function buildCivicDetails(batch:Batch,includeRoofStep=false):{windows:number;entrances:number} {
  count.windows=0;count.entrances=0;
  for(const f of CIVIC_DETAIL_FRAMES){if(f.recipe.startsWith('town-hall'))hall(batch,f);else if(f.recipe==='auditorium')auditorium(batch,f);else school(batch,f);}
  if(includeRoofStep)schoolRoofStep(batch);
  return {...count};
}

/** Add only the researched bare side/connector/school surfaces of this source. */
export function applyCivicDetails(group:THREE.Group,tileId:string,origin:readonly number[],level:number,sourceSha256:string):CivicDetailReport|undefined {
  if(tileId!==source.tileId)return;
  if(group.userData.civicDetails)return group.userData.civicDetails;
  const reject=():CivicDetailReport=>({version:source.version,status:'source-mismatch',frames:0,windows:0,entrances:0,triangles:0,meshes:0,geometryBytes:0});
  const lod=source.lods.find(r=>r.level===level);
  if(!lod||lod.sha256!==sourceSha256||origin.length!==3||!origin.every((value,i)=>Number.isFinite(value)&&Math.abs(value-source.origin[i])<.001))return reject();
  const matches:THREE.Mesh[]=[];
  group.traverse(o=>{if(o instanceof THREE.Mesh&&o.name===source.sourceMeshName&&o.parent?.name===source.sourceParentName)matches.push(o);});
  if(matches.length!==1)return reject();
  const mesh=matches[0],materials=Array.isArray(mesh.material)?mesh.material:[mesh.material];
  if(materials[0]?.name!==source.sourceMaterial||(mesh.geometry.index?.count??mesh.geometry.getAttribute('position')?.count)!==lod.totalTriangles*3)return reject();
  // Decorations must never float if the source-qualified wall repair rejects.
  const roofStep=group.userData.civicRoofFinish?.status==='applied'&&group.userData.civicRoofFinish.enclosureTriangles>0;
  const batch=new Batch(new THREE.Vector3(...origin),level),counts=buildCivicDetails(batch,roofStep),result=batch.finish();
  result.group.name='Civic details | Town Hall and Sitkowski School';
  result.group.userData.townCrafted=true;result.group.userData.sourceStructId=source.structId;
  result.group.userData.evidence=CIVIC_DETAIL_PROVENANCE;
  if(roofStep)result.group.userData.roofStepBasis='NPS photo 18: brick school wall and rectangular upper windows above the auditorium. Five-bay spacing and dimensions inferred from adjacent school windows, not surveyed.';
  for(const o of result.group.children){o.name=o.name.replace('Crafted building frontage','Civic details');o.userData.category='civic-details';}
  group.add(result.group);
  const report:CivicDetailReport={version:source.version,status:'applied',frames:CIVIC_DETAIL_FRAMES.length+Number(roofStep),...counts,triangles:result.triangles,meshes:result.group.children.length,geometryBytes:result.bytes};
  group.userData.civicDetails=report;return report;
}
