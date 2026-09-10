import * as THREE from 'three';
import catalog from '../../../data/derived/town/main-street-crossing.json';
import release from '../../../data/derived/town/release.json';
import { PavementIndex, clipRoadPaintPolygon, roadPaintHeightAt } from './road-finish';

export type MainStreetCrossingReport = { status:'applied'|'source-mismatch'|'no-support'; id:string; stripes:number; triangles:number; geometryBytes:number; supportedAreaM2:number; expectedAreaM2:number };
const cross=(a:number[],b:number[],c:number[])=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
const area=(p:number[][])=>Math.abs(p.slice(1,-1).reduce((n,q,i)=>n+cross(p[0],q,p[i+2]),0))/2;
export function churchCrossingStripes():number[][][]{
 const {center,tangent,roadAxis,count,pitchM,stripeWidthM,stripeLengthM}=catalog;
 return Array.from({length:count},(_,i)=>{const u=(i-(count-1)/2)*pitchM;return [[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,z])=>center.map((v,k)=>v+tangent[k]*(u+x*stripeWidthM/2)+roadAxis[k]*z*stripeLengthM/2));});
}

/** The photo establishes the crossing's existence, not its exact dimensions.
 * Paint is clipped to retained asphalt and follows each existing source plane. */
export function applyMainStreetCrossing(group:THREE.Group,tileId:string,origin:readonly number[],level:number,sourceSha256:string):MainStreetCrossingReport|undefined{
 if(tileId!==catalog.tileId)return;
 const expectedAreaM2=catalog.count*catalog.stripeWidthM*catalog.stripeLengthM;
 const empty=(status:MainStreetCrossingReport['status']):MainStreetCrossingReport=>({status,id:catalog.id,stripes:0,triangles:0,geometryBytes:0,supportedAreaM2:0,expectedAreaM2});
 if(release.manifestSha256!==catalog.sourceManifestSha256||catalog.lods.find(l=>l.level===level)?.sha256!==sourceSha256||origin.length!==3||origin.some((v,i)=>v!==catalog.origin[i]))return empty('source-mismatch');
 const previous=group.userData.mainStreetCrossing as MainStreetCrossingReport|undefined;if(previous)return previous;
 const shapes=churchCrossingStripes(),points=shapes.flat(),bounds=[Math.min(...points.map(p=>p[0])),Math.min(...points.map(p=>p[1])),Math.max(...points.map(p=>p[0])),Math.max(...points.map(p=>p[1]))];
 const road:number[][][]=[],point=new THREE.Vector3();group.updateMatrixWorld(true);const inverse=group.matrixWorld.clone().invert();
 group.traverse(o=>{
  if(!(o instanceof THREE.Mesh)||(o.name!=='roads'&&o.parent?.name!=='roads')||o.userData.townCrafted)return;
  const g=o.geometry,p=g.getAttribute('position');if(!p)return;const ix=g.index,count=ix?.count??p.count,m=Array.isArray(o.material)?o.material:[o.material],matrix=inverse.clone().multiply(o.matrixWorld);
  for(const part of g.groups.length?g.groups:[{start:0,count,materialIndex:0}]){
   if(m[part.materialIndex??0]?.name!=='Drive road | asphalt')continue;
   for(let i=part.start;i+2<Math.min(count,part.start+part.count);i+=3){
    const tri=[0,1,2].map(k=>{point.fromBufferAttribute(p,ix?ix.getX(i+k):i+k).applyMatrix4(matrix);return[point.x+origin[0],-point.z-origin[2],point.y+origin[1]];});
    if(Math.max(...tri.map(p=>p[0]))<bounds[0]||Math.min(...tri.map(p=>p[0]))>bounds[2]||Math.max(...tri.map(p=>p[1]))<bounds[1]||Math.min(...tri.map(p=>p[1]))>bounds[3]||Math.abs(cross(...tri as[number[],number[],number[]]))<1e-8)continue;
    if(tri.every(p=>Math.abs(p[2]-catalog.baseHeight)<=catalog.maxHeightDriftM))road.push(tri);
   }
  }
 });
 const ground=new PavementIndex(road),positions:number[]=[],normals:number[]=[];let covered=0;
 for(const shape of shapes){let supported=0;const seen=new Set<string>();
  for(const surface of ground.candidates(shape)){
   const clipped=clipRoadPaintPolygon(shape,surface.triangle);if(clipped.length<3||area(clipped)<1e-8)continue;
   for(let j=1;j<clipped.length-1;j++){
    const xy=[clipped[0],clipped[j],clipped[j+1]],key=xy.map(p=>p.map(v=>v.toFixed(5)).join(',')).sort().join('|');if(seen.has(key))continue;seen.add(key);
    const a=area(xy);if(a<1e-8)continue;
    // Calculate normals and winding from the actual GPU precision. Clipping
    // along coincident source edges can produce subpixel slivers.
    const vertices=xy.map(p=>new THREE.Vector3(Math.fround(p[0]-origin[0]),Math.fround(roadPaintHeightAt(surface.triangle,p)+catalog.offsetM-origin[1]),Math.fround(-p[1]-origin[2])));
    const n=vertices[1].clone().sub(vertices[0]).cross(vertices[2].clone().sub(vertices[0]));if(n.lengthSq()<1e-12||Math.abs(n.y)<1e-8)continue;n.normalize();supported+=a;if(n.y<0){[vertices[1],vertices[2]]=[vertices[2],vertices[1]];n.negate();}
    vertices.forEach(v=>{positions.push(...v.toArray());normals.push(...n.toArray());});
   }
  }
  if(Math.abs(supported-catalog.stripeWidthM*catalog.stripeLengthM)>catalog.coverageToleranceM2)return empty('no-support');covered+=supported;
 }
 const geometry=new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(positions,3)).setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));geometry.computeBoundingBox();geometry.computeBoundingSphere();
 const material=new THREE.MeshStandardMaterial({color:'#e5e4d8',roughness:.90});material.name='Main Street photo | Church crossing paint';material.userData={townCrafted:true,appearanceBasis:catalog.inference};
 const mesh=new THREE.Mesh(geometry,material);mesh.name='Main Street Church mouth crossing';mesh.receiveShadow=true;mesh.userData={townCrafted:true,sourceIds:[catalog.id],sourcePhotoSha256:catalog.sourcePhoto.sha256};group.add(mesh);
 const report:MainStreetCrossingReport={status:'applied',id:catalog.id,stripes:shapes.length,triangles:positions.length/9,geometryBytes:(positions.length+normals.length)*4,supportedAreaM2:covered,expectedAreaM2};group.userData.mainStreetCrossing=report;return report;
}
