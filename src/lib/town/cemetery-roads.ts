import * as THREE from 'three';
import domains from '../../../data/derived/town/cemetery-road-domains.json';
type Domain={id:string;outline:number[][];holes:number[][][]};
function inside(p:readonly number[],ring:number[][]):boolean{let hit=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])hit=!hit;}return hit;}
export function applyCemeteryRoadFinish(group:THREE.Object3D,tileId:string,origin:readonly number[],manifestSha256:string){
 if(group.userData.cemeteryRoadFinish)return group.userData.cemeteryRoadFinish as {removedTriangles:number;meshes:number};
 const rows=(domains.tiles as Record<string,Domain[]>)[tileId],report={removedTriangles:0,meshes:0};if(!rows)return report;
 // The caller provides the immutable release pin; source identity is checked before edits.
 if(manifestSha256!==domains.sourceManifestSha256)return report;
 group.updateMatrixWorld(true);const inverse=group.matrixWorld.clone().invert(),owners=new Map<THREE.BufferGeometry,number>();group.traverse(o=>{if(o instanceof THREE.Mesh)owners.set(o.geometry,(owners.get(o.geometry)??0)+1);});
 const point=new THREE.Vector3();group.traverse(o=>{
  if(!(o instanceof THREE.Mesh))return;const materials=Array.isArray(o.material)?o.material:[o.material],eligible=materials.map(m=>m.name==='Drive road | warm yellow paint'||m.name==='Finished road | solid yellow centerline');if(!eligible.some(Boolean))return;
  const g=o.geometry,p=g.getAttribute('position'),index=g.index,matrix=inverse.clone().multiply(o.matrixWorld),ranges=g.groups.length?g.groups:[{start:0,count:index?.count??p.count,materialIndex:0}],kept:number[]=[];let removed=0;const newGroups:{start:number;count:number;materialIndex:number}[]=[];
  for(const range of ranges){const start=kept.length;for(let i=range.start;i<range.start+range.count;i+=3){const ids=[0,1,2].map(k=>index?index.getX(i+k):i+k),points=ids.map(id=>{point.fromBufferAttribute(p,id).applyMatrix4(matrix);return[point.x+origin[0],-point.z-origin[2]];});const covered=eligible[range.materialIndex??0]&&rows.some(r=>points.every(x=>inside(x,r.outline)&&!r.holes.some(h=>inside(x,h))));if(covered)removed++;else kept.push(...ids);}newGroups.push({start,count:kept.length-start,materialIndex:range.materialIndex??0});}
  if(!removed)return;const copy=g.clone();copy.setIndex(kept);copy.clearGroups();for(const r of newGroups)if(r.count)copy.addGroup(r.start,r.count,r.materialIndex);o.geometry=copy;owners.set(g,owners.get(g)!-1);if(!owners.get(g))g.dispose();report.removedTriangles+=removed;report.meshes++;
 });group.userData.cemeteryRoadFinish=report;return report;
}
