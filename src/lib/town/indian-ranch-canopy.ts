import * as THREE from 'three';
import catalog from '../../../data/derived/town/indian-ranch-canopy.json';
import release from '../../../data/derived/town/release.json';
import {Batch,type Frame,type Role} from './crafted-frontages';
import {filterEvidenceSources,planDistanceSquared} from './evidence-buildings';

export const INDIAN_RANCH_CANOPY=catalog;
type Level=typeof catalog.levels[number];
export type IndianRanchCanopyReport={status:'applied'|'source-mismatch'|'no-support'|'no-source';ids:string[];removedTriangles:number;triangles:number;meshes:number;geometryBytes:number;level:number;eave:number;peak:number;posts:number;benchSegments:number;groundRange:number[];supportChecks:number;sourceTerrainTiles:string[]};
const frame:Frame={structId:catalog.id,tileId:catalog.tileId,start:[0,0],tangent:[1,0],outward:[0,1]};

/** The canopy crosses a tile boundary. Offline support is pinned to BOTH native
 * terrain tiles at every LOD; the streamed owner must still match its available
 * terrain before any source body is touched. No neighbouring group is required. */
function supported(group:THREE.Group,origin:THREE.Vector3,level:Level):boolean{
  const checks=level.ownTerrainChecks,heights=checks.map(()=>undefined as number|undefined),p=new THREE.Vector3();
  group.updateMatrixWorld(true);
  group.traverse(object=>{
    if(!(object instanceof THREE.Mesh)||object.userData.townCrafted)return;
    const geometry=object.geometry,position=geometry.getAttribute('position'),index=geometry.index;if(!position)return;
    const count=index?.count??position.count,materials=Array.isArray(object.material)?object.material:[object.material];
    for(const part of geometry.groups.length?geometry.groups:[{start:0,count,materialIndex:0}]){
      if(!/^Realism aerial.*\| ground_/.test(materials[part.materialIndex??0]?.name??''))continue;
      for(let i=part.start;i<Math.min(count,part.start+part.count);i+=3){
        const t=[0,1,2].map(k=>{p.fromBufferAttribute(position,index?index.getX(i+k):i+k).applyMatrix4(object.matrixWorld).add(origin);return[p.x,-p.z,p.y];});
        const[a,b,c]=t,d=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);if(Math.abs(d)<1e-9)continue;
        for(let j=0;j<checks.length;j++){
          if(heights[j]!==undefined)continue;const[x,n]=checks[j];
          const u=((b[1]-c[1])*(x-c[0])+(c[0]-b[0])*(n-c[1]))/d,v=((c[1]-a[1])*(x-c[0])+(a[0]-c[0])*(n-c[1]))/d;
          if(u>=-1e-7&&v>=-1e-7&&u+v<=1+1e-7)heights[j]=u*a[2]+v*b[2]+(1-u-v)*c[2];
        }
      }
    }
  });
  return checks.length>=6&&heights.every((y,i)=>y!==undefined&&Math.abs(y-checks[i][2])<.015);
}

function sourcePresent(group:THREE.Group,origin:THREE.Vector3):boolean{
  const p=new THREE.Vector3(),center=new THREE.Vector3();let found=false;
  group.traverse(object=>{
    if(found||!(object instanceof THREE.Mesh)||object.userData.townCrafted)return;
    const g=object.geometry,position=g.getAttribute('position'),ix=g.index;if(!position)return;
    const count=ix?.count??position.count,mats=Array.isArray(object.material)?object.material:[object.material];
    for(const part of g.groups.length?g.groups:[{start:0,count,materialIndex:0}]){
      if(!/^V2 inferred \| (siding|brick|concrete_wall|roof|flat_roof)$/.test(mats[part.materialIndex??0]?.name??''))continue;
      for(let i=part.start;i<Math.min(count,part.start+part.count);i+=3){
        center.set(0,0,0);for(let k=0;k<3;k++)center.add(p.fromBufferAttribute(position,ix?ix.getX(i+k):i+k));
        center.multiplyScalar(1/3).applyMatrix4(object.matrixWorld).add(origin);
        if(center.y>=catalog.sourceBase-1&&center.y<=catalog.sourcePeak+12&&planDistanceSquared(catalog.outline,center.x,-center.z)<.85**2){found=true;return;}
      }
    }
  });return found;
}

function horizontal(batch:Batch,role:Role,points:number[][],paint:string,up:boolean){
  const [a,b,c]=points.map(p=>new THREE.Vector3().fromArray(p));
  if((b.sub(a).cross(c.sub(a)).y>0)!==up)points.reverse();batch.polygon(frame,role,points,paint);
}

export function buildIndianRanchCanopy(origin:THREE.Vector3,level:number){
  const placement=catalog.levels.find(r=>r.level===level);if(!placement)throw new Error('Unsupported canopy LOD');
  const b=new Batch(origin,level),eave=placement.eave;
  for(const triangle of catalog.roof){
    horizontal(b,'roof',triangle.map(p=>[p[0],eave+p[1],p[2]]),'#e0e2d7',true);
    horizontal(b,'trim',triangle.map(p=>[p[0],eave+p[1]-.10,p[2]]),'#bfc6bd',false);
  }
  for(const[a,z]of catalog.fascia)b.polygon(frame,'trim',[[a[0],eave+a[1],a[2]],[z[0],eave+z[1],z[2]],[z[0],eave+z[1]-.10,z[2]],[a[0],eave+a[1]-.10,a[2]]],'#e0e2d7');
  for(const triangle of placement.pad)horizontal(b,'paving',triangle.map(p=>[...p]),'#b6b5a8',true);
  for(const post of placement.posts){
    const[x,n]=post.point,bottom=post.ground+.025,top=eave+post.roofRise-.10;
    b.box(frame,'metal',x,(bottom+top)/2,n,.14,top-bottom,.14,'#3e4944');
    b.box(frame,'paving',x,bottom+.025,n,.29,.05,.29,'#b6b5a8');
  }
  for(const bench of placement.benches){
    const f:Frame={...frame,start:bench.center,tangent:catalog.seatTangent,outward:catalog.seatAway};
    // Actual row count, joinery and dimensions are authored. Segment floors
    // follow the native slope; individual legs reach their sampled ground.
    b.box(f,'trim',0,bench.seat,0,bench.width,.065,.43,'#79a18a');
    b.box(f,'trim',0,bench.seat+.25,.24,bench.width,.29,.055,'#79a18a');
    for(const side of[-1,1]){
      const indices=side<0?[0,3]:[1,2],ground=Math.min(...indices.map(i=>bench.ground[i]))+.035;
      b.box(f,'metal',side*(bench.width/2-.20),(ground+bench.seat)/2,0,.075,bench.seat-ground,.35,'#465a4d');
      if(level<2)b.box(f,'metal',side*(bench.width/2-.20),bench.seat+.17,.235,.045,.39,.045,'#465a4d');
    }
  }
  const built=b.finish();built.group.name='Indian Ranch open seating canopy';
  built.group.traverse(o=>{
    if(!(o instanceof THREE.Mesh))return;o.userData.category='indian-ranch-canopy';
    o.userData.sourceIds=[catalog.id];o.name=`Indian Ranch canopy | ${(o.material as THREE.Material).userData.surfaceRole}`;
    if((o.material as THREE.Material).userData.surfaceRole==='roof'){
      // The observed white canopy does not establish shingle construction.
      // Use a quiet painted roof surface, not the generic shingle shader.
      const old=o.material as THREE.MeshStandardMaterial;
      const m=new THREE.MeshStandardMaterial({color:old.color,roughness:.78});
      m.name='Indian Ranch canopy | authored pale roof';m.userData={...old.userData,appearanceBasis:catalog.inferred};o.material=m;old.dispose();
    }
  });return built;
}

export function applyIndianRanchCanopy(group:THREE.Group,tileId:string,origin:readonly number[],level:number,sourceSha256:string):IndianRanchCanopyReport|undefined{
  if(tileId!==catalog.tileId)return;
  const placement=catalog.levels.find(r=>r.level===level);
  const empty=(status:IndianRanchCanopyReport['status']):IndianRanchCanopyReport=>({status,ids:[],removedTriangles:0,triangles:0,meshes:0,geometryBytes:0,level,eave:placement?.eave??0,peak:0,posts:0,benchSegments:0,groundRange:placement?.groundRange??[],supportChecks:placement?.ownTerrainChecks.length??0,sourceTerrainTiles:placement?.terrainSources.map(r=>r.tileId)??[]});
  if(catalog.sourceManifestSha256!==release.manifestSha256||!placement||sourceSha256!==placement.sha256||origin.length!==3||catalog.origin.some((v,i)=>v!==origin[i]))return empty('source-mismatch');
  if(group.userData.indianRanchCanopy)return group.userData.indianRanchCanopy as IndianRanchCanopyReport;
  const at=new THREE.Vector3().fromArray(origin);
  if(!supported(group,at,placement))return empty('no-support');
  if(!sourcePresent(group,at))return empty('no-source');
  const built=buildIndianRanchCanopy(at,level);
  const removed=filterEvidenceSources(group,at,[{id:catalog.id,tileId,outline:catalog.outline,base:catalog.sourceBase,peak:catalog.sourcePeak,replaceBody:true}]);
  group.add(built.group);
  // Match other owned hard pads: exclude the actual draped triangles from the
  // grass sampler before surfaces.register, without editing its cover texture.
  (group.userData.environmentGrassExclusions??=[]).push(...placement.pad.map(t=>t.map(p=>[p[0],p[2]])));
  const report:IndianRanchCanopyReport={...empty('applied'),ids:[catalog.id],removedTriangles:removed.removedTriangles,triangles:built.triangles,meshes:built.group.children.length,geometryBytes:built.bytes,eave:placement.eave,peak:placement.eave+Math.max(...catalog.roof.flatMap(t=>t.map(p=>p[1]))),posts:placement.posts.length,benchSegments:placement.benches.length};
  group.userData.indianRanchCanopy=report;return report;
}
