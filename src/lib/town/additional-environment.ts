import * as THREE from 'three';
import index from '../../../data/derived/town/additional-environment-index.json';
import {Batch,type Frame,type Role} from './crafted-frontages';
import {GrassTerrain} from './grass';
import {wetMarginFlowers} from './vegetation-finish';
import {finishLaunchSurfaces} from './site-surface-finish';
import type {AssetRef} from './contracts';

type V2=[number,number];
export type AdditionalEnvironmentObject={id:string;tileId:string;featureId:string;kind:'cemetery-stone'|'dam-crest'|'shore-lily'|'wetland-fern'|'wetland-shrub'|'boat-ramp';point:V2;supportPoint?:V2;evidenceIds:string[];seed:number;variant?:string;angle?:number;width?:number;lanes?:1|2;rampRange?:V2;sourceHeight:number;sourceSha256:string};
export type AdditionalEnvironmentPacket={version:1;tileId:string;sourceManifestSha256:string;objects:AdditionalEnvironmentObject[]};
export type AdditionalEnvironmentReport={tileId:string;level:number;ids:string[];featureIds:string[];skipped:{id:string;reason:string}[];addedTriangles:number;addedMeshes:number;geometryBytes:number;flowers:string[];launches:{id:string;lanes:number;slabs:number;requestedSlabs:number}[];rejected:boolean};
export function additionalEnvironmentAsset(tileId:string):AssetRef|undefined{return(index.tiles as Record<string,AssetRef>)[tileId];}
export function validAdditionalEnvironmentPacket(value:unknown,tileId:string):value is AdditionalEnvironmentPacket{
 const p=value as AdditionalEnvironmentPacket|undefined;
 if(!p||p.version!==1||p.tileId!==tileId||p.sourceManifestSha256!==index.sourceManifestSha256||!Array.isArray(p.objects)||p.objects.length>2500)return false;
 const ids=new Set<string>();
 return p.objects.every(r=>{
  if(!r||typeof r.id!=='string'||ids.has(r.id)||r.tileId!==tileId||typeof r.featureId!=='string'||!['cemetery-stone','dam-crest','shore-lily','wetland-fern','wetland-shrub','boat-ramp'].includes(r.kind)||!Array.isArray(r.point)||r.point.length!==2||!r.point.every(Number.isFinite)||!Number.isFinite(r.sourceHeight)||Math.abs(r.sourceHeight)>1000||!Number.isFinite(r.seed)||r.seed<0||r.seed>=1||!Array.isArray(r.evidenceIds)||!r.evidenceIds.length||!/^[a-f0-9]{64}$/.test(r.sourceSha256))return false;
  ids.add(r.id);
  return(!r.supportPoint||(r.supportPoint.length===2&&r.supportPoint.every(Number.isFinite)))&&(r.angle===undefined||Number.isFinite(r.angle))&&(r.lanes===undefined||r.lanes===1||r.lanes===2)&&(!r.rampRange||(r.rampRange.length===2&&r.rampRange.every(v=>Number.isInteger(v)&&Math.abs(v)<=30)&&r.rampRange[1]>r.rampRange[0]))&&(r.width===undefined||Number.isFinite(r.width)&&r.width>0&&r.width<8);
 });
}
function frame(r:AdditionalEnvironmentObject):Frame{
 const a=r.angle??0,t:V2=[Math.cos(a),Math.sin(a)];return{start:r.point,tangent:t,outward:[t[1],-t[0]],structId:r.id,tileId:r.tileId};
}
function emit(batch:Batch,f:Frame,role:Role,g:THREE.BufferGeometry,color:string):void{
 const flat=g.index?g.toNonIndexed():g;batch.geometry(f,role,flat.getAttribute('position').array,flat.getAttribute('normal').array,color);if(flat!==g)flat.dispose();g.dispose();
}
const palette=['#94958c','#a5a398','#8d9190','#b5aaa0'];
function stone(batch:Batch,f:Frame,r:AdditionalEnvironmentObject,base:number,minimum=base):void{
 const width=.48+r.seed*.40,height=.62+r.seed*.61,depth=.20+r.seed*.09,color=palette[Math.min(3,Math.floor(r.seed*4))];
 const bottom=base+.10,foot=minimum-.035;
 batch.box(f,'foundation',0,(foot+bottom)/2,0,width+.16,bottom-foot,depth+.18,'#929286');
 if(r.variant==='older'||r.variant==='mixed'&&r.seed<.4){
  const shape=new THREE.Shape();shape.moveTo(-width/2,0);shape.lineTo(width/2,0);shape.lineTo(width/2,height-width*.35);
  for(let i=0;i<=8;i++){const a=i*Math.PI/8;shape.lineTo(Math.cos(a)*width/2,height-width*.35+Math.sin(a)*width*.35);}shape.closePath();
  emit(batch,f,'stone',new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:false,steps:1,curveSegments:5}).translate(0,bottom,-depth/2),color);
 }else batch.box(f,'stone',0,bottom+height/2,0,width,height,depth,color);
 // Unmarked physical stone: no names, dates, inscriptions, specific burials or religious dedications are fabricated.
}
function leaf(batch:Batch,f:Frame,points:number[][],color:string):void{batch.polygon(f,'leaf',points,color);batch.polygon(f,'leaf',[...points].reverse(),color);}
function lilies(batch:Batch,f:Frame,r:AdditionalEnvironmentObject,water:number):void{
 const count=batch.level?8:17,segments=batch.level?8:12;
 for(let i=0;i<count;i++){
  const a=i*2.399963+r.seed*6.28,d=Math.sqrt((i+.5)/count)*1.8,u=Math.cos(a)*d,v=Math.sin(a)*d,size=.16+.16*((i*17%11)/11),y=water+.018+i*.00018;
  // A radial fan leaves a V-shaped notch; foliage remains on the mapped water plane.
  for(let j=0;j<segments-1;j++){
   const b=a+.20+j*(Math.PI*2-.40)/(segments-1),c=a+.20+(j+1)*(Math.PI*2-.40)/(segments-1);
   leaf(batch,f,[[u,y,v],[u+Math.cos(c)*size,y,v+Math.sin(c)*size],[u+Math.cos(b)*size,y,v+Math.sin(b)*size]],i%9?'#4f653c':'#7b794b');
  }
 }
}
function fern(batch:Batch,f:Frame,r:AdditionalEnvironmentObject,ground:number):void{
 const count=batch.level?4:7;
 for(let k=0;k<count;k++){
  const angle=k*6.283/count+r.seed*3,c=Math.cos(angle),s=Math.sin(angle),height=.40+.23*((k+3)%5)/5;
  for(let i=0;i<5;i++){
   const t=(i+1)/6,u=c*t*.62,v=s*t*.62,y=ground+Math.sin(t*Math.PI*.74)*height,width=.15*(1-t)+.045;
   for(const side of[-1,1])leaf(batch,f,[[u,y,v],[u+c*.15-s*width*side,y+.035,v+s*.15+c*width*side],[u+c*.21,y+.012,v+s*.21]],k%3?'#4c6739':'#597140');
  }
 }
}
function shrub(batch:Batch,f:Frame,r:AdditionalEnvironmentObject,ground:number):void{
 for(let i=0;i<3;i++){
  const a=i*2.09+r.seed*6.28,u=Math.cos(a)*.38,v=Math.sin(a)*.38;
  batch.box(f,'foundation',u,ground+.43,v,.065,.86,.065,'#625d49');
  emit(batch,f,'leaf',new THREE.IcosahedronGeometry(1,batch.level?0:1).scale(.57,.62,.57).translate(u,ground+.78,v),i%2?'#4a5f38':'#526b3c');
 }
}
function sourceMeshes(group:THREE.Object3D,kind:string):THREE.Mesh[]{
 const found:THREE.Mesh[]=[];group.traverse(o=>{if(!(o instanceof THREE.Mesh)||o.userData.townCrafted)return;for(let p:THREE.Object3D|null=o;p&&p!==group;p=p.parent)if(p.name===kind||p.name.startsWith(kind+'_')){found.push(o);break;}});return found;
}
/** Optional tile-owned contextual details. Every source object and material is read-only. */
export function applyAdditionalEnvironment(group:THREE.Group,tileId:string,origin:readonly number[],level=0,packet?:AdditionalEnvironmentPacket):AdditionalEnvironmentReport|undefined{
 if(!packet)return undefined;
 if(group.userData.townAdditionalEnvironment)return group.userData.townAdditionalEnvironment;
 const report:AdditionalEnvironmentReport={tileId,level,ids:[],featureIds:[],skipped:[],addedTriangles:0,addedMeshes:0,geometryBytes:0,flowers:[],launches:[],rejected:false};
 if(!validAdditionalEnvironmentPacket(packet,tileId)){report.rejected=true;return report;}
 group.updateMatrixWorld(true);const inverse=group.matrixWorld.clone().invert();
 const sampler=(kind:string):GrassTerrain=>{
  const meshes=sourceMeshes(group,kind).map(source=>{const proxy=new THREE.Mesh(source.geometry,source.material);proxy.matrixAutoUpdate=false;proxy.matrixWorld.copy(inverse).multiply(source.matrixWorld);return proxy;});
  return new GrassTerrain(meshes);
 };
 // One bounded spatial index replaces thousands of repeated full-mesh raycasts.
 // Proxies borrow geometry/materials and are never attached or disposed here.
 const needTerrain=packet.objects.some(r=>!['dam-crest','shore-lily'].includes(r.kind)),needWater=packet.objects.some(r=>['dam-crest','shore-lily','boat-ramp'].includes(r.kind));
 const terrain=needTerrain?sampler('terrain'):undefined,water=needWater?sampler('water'):undefined;
 const at=(p:readonly number[],kind:'terrain'|'water'):number|null=>{
  const sample=(kind==='water'?water:terrain)?.sample(p[0]-origin[0],-p[1]-origin[2]);return sample?sample.y+origin[1]:null;
 };
 const batch=new Batch(new THREE.Vector3(...origin),level),features=new Set<string>();
 for(const r of packet.objects){
  if(level===2&&r.kind!=='dam-crest'&&r.kind!=='boat-ramp'&&(r.kind!=='cemetery-stone'||r.seed>.28)||level===1&&r.kind==='cemetery-stone'&&r.seed>.62){report.skipped.push({id:r.id,reason:'Distant detail thinning.'});continue;}
  const waterKind=r.kind==='dam-crest'||r.kind==='shore-lily',p=r.supportPoint??r.point,y=at(p,waterKind?'water':'terrain');
  if(y===null||!Number.isFinite(y)||Math.abs(y-r.sourceHeight)>(waterKind?.20:1.8)){report.skipped.push({id:r.id,reason:'Matching source surface is absent or changed.'});continue;}
  const f=frame(r);
  if(r.kind==='cemetery-stone'){
   const support=[[-.48,-.3],[.48,-.3],[.48,.3],[-.48,.3]].map(([dx,dn])=>at([r.point[0]+dx,r.point[1]+dn],'terrain'));
   if(support.some(v=>v===null)||Math.max(...support as number[])-Math.min(...support as number[])>.7){report.skipped.push({id:r.id,reason:'Stone footing lacks bounded terrain support.'});continue;}
   stone(batch,f,r,Math.max(y,...support as number[])+.014,Math.min(y,...support as number[]));
  }else if(r.kind==='boat-ramp'){
   const point=(u:number,v:number):V2=>[r.point[0]+f.tangent[0]*u+f.outward[0]*v,r.point[1]+f.tangent[1]*u+f.outward[1]*v];
   const lanes=r.lanes??2,range=r.rampRange??[-6,7],middles=lanes===1?[0]:[-1.65,1.65],du=.5,columns=8,dv=3.1/columns,rows=Math.round((range[1]-range[0])/du);
   let made=0;
   for(const middle of middles){
    const grid:number[][]=[],lift:number[][]=[];
    for(let i=0;i<=rows;i++){
     grid[i]=[];lift[i]=[];
     for(let j=0;j<=columns;j++){const h=at(point(range[0]+i*du,middle-1.55+j*dv),'terrain');grid[i][j]=h??NaN;lift[i][j]=.045;}
    }
    if(grid.some(row=>row.some(h=>!Number.isFinite(h))))continue;
    // A coarse quad can pass beneath a ridge between its sampled corners. Check
    // both triangle interiors on a dense grid, then share each correction with
    // all four vertices: neighboring cells remain continuous and only rise.
    for(let i=0;i<rows;i++)for(let j=0;j<columns;j++){
     const a=grid[i][j],b=grid[i+1][j],c=grid[i+1][j+1],d=grid[i][j+1];let correction=0;
     for(const x of[0,.25,.5,.75,1])for(const z of[0,.25,.5,.75,1]){
      const h=at(point(range[0]+(i+x)*du,middle-1.55+(j+z)*dv),'terrain');
      const top=z>=x?a*(1-z)+d*(z-x)+c*x:a*(1-x)+c*z+b*(x-z);
      if(h!==null)correction=Math.max(correction,h-top);
     }
     for(const[ii,jj]of[[i,j],[i+1,j],[i+1,j+1],[i,j+1]])lift[ii][jj]=Math.max(lift[ii][jj],correction+.045);
    }
    const vertex=(i:number,j:number,bottom=false)=>[range[0]+i*du,grid[i][j]+lift[i][j]-(bottom?.12:0),middle-1.55+j*dv];
    const face=(points:number[][])=>batch.polygon(f,'paving',points,'#aaa99a');
    for(let i=0;i<rows;i++)for(let j=0;j<columns;j++){
     const a=vertex(i,j),b=vertex(i+1,j),c=vertex(i+1,j+1),d=vertex(i,j+1),ab=vertex(i,j,true),bb=vertex(i+1,j,true),cb=vertex(i+1,j+1,true),db=vertex(i,j+1,true);
     face([a,d,c]);face([a,c,b]);face([ab,bb,cb]);face([ab,cb,db]);
     if(j===0)face([a,b,bb,ab]);if(j===columns-1)face([c,d,db,cb]);
     if(i===0)face([d,a,ab,db]);if(i===rows-1)face([b,c,cb,bb]);
    }
    made+=range[1]-range[0];
   }
   if(!made){report.skipped.push({id:r.id,reason:'Concrete launch has no coherent source support.'});continue;}
   report.launches.push({id:r.id,lanes,slabs:made,requestedSlabs:(range[1]-range[0])*lanes});
  }else if(r.kind==='shore-lily'){
   // Entire pad patch must remain supported water; never spill onto a beach, ramp or lawn.
   if([[2,0],[-2,0],[0,2],[0,-2]].some(([dx,dn])=>at([r.point[0]+dx,r.point[1]+dn],'water')===null)){report.skipped.push({id:r.id,reason:'Water patch does not cover the whole leaf cluster.'});continue;}
   lilies(batch,f,r,y);
  }else if(r.kind==='wetland-fern')fern(batch,f,r,y+.018);
  else if(r.kind==='wetland-shrub'){if(r.seed<.265){wetMarginFlowers(batch,f,y,r.seed);report.flowers.push(r.id);}else shrub(batch,f,r,y);}
  else{
   // A restrained visible crest, not a guessed full-height dam or hydraulic model.
   batch.box(f,'stone',0,y-.16,0,r.width??1.48,.48,.72,'#8c8d7c');
   batch.box(f,'stone',0,y+.094,0,r.width??1.48,.055,.77,'#aba99a');
  }
  report.ids.push(r.id);features.add(r.featureId);
 }
 const result=batch.finish();result.group.name='Additional researched environment';result.group.userData.townCrafted=true;result.group.userData.environmentDetails=true;
 result.group.traverse(o=>{if(!(o instanceof THREE.Mesh))return;o.name=o.name.replace('Crafted building frontage','Additional environment');o.userData.category='additional-environment';o.userData.appearanceBasis='Mapped environmental domains with explicit regional/form inference; anonymous cemetery stones are not a surveyed grave inventory.';o.userData.townCrafted=true;if(level)o.castShadow=false;});
 const launches=packet.objects.filter(r=>r.kind==='boat-ramp'&&report.ids.includes(r.id)).map(r=>{
  // Source water may begin beyond the dry concrete. Sample only along the
  // existing registered ramp; absent coverage disables the wet transition.
  const f=frame(r),samples=(r.rampRange??[-6,7]).map(u=>at([r.point[0]+f.tangent[0]*u,r.point[1]+f.tangent[1]*u],'water')).filter((v):v is number=>v!==null);
  return{point:r.point,angle:r.angle,waterHeight:samples.length?samples.reduce((a,b)=>a+b,0)/samples.length:null};
 });
 const surfaceBytes=finishLaunchSurfaces(result.group,origin,launches);
 report.featureIds=[...features];report.addedTriangles=result.triangles;report.addedMeshes=result.group.children.length;report.geometryBytes=result.bytes+surfaceBytes;
 if(result.triangles)group.add(result.group);else result.group.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();}});
 group.userData.townAdditionalEnvironment=report;return report;
}
