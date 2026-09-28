import * as THREE from 'three';
import source from '../../../data/derived/town/obsolete-access-route.json';
import privateDriveway from '../../../data/derived/town/obsolete-private-driveway.json';
import privateComponent from '../../../data/derived/town/obsolete-private-component.json';
import nonStreetIslands from '../../../data/derived/town/non-street-island-routes.json';
import type {NetworkData,RoadEdge} from './engine';
import type {V3} from './contracts';

export const OBSOLETE_ACCESS_ROUTE=source;
export const OBSOLETE_ACCESS_ROUTES=[source,privateDriveway];
export const OBSOLETE_PRIVATE_EDGE_IDS=privateComponent.edges.map(e=>e.id);
const surfaceSources=[nonStreetIslands.surfaceRemoval,...OBSOLETE_ACCESS_ROUTES.flatMap(route=>[route,...Object.entries(route.additionalSourceLods).map(([tileId,sourceLods])=>({tileId,sourceLods,removalPolygons:route.removalPolygons}))]),...Object.entries(privateComponent.tiles).map(([tileId,sourceLods])=>({tileId,sourceLods,removalPolygons:privateComponent.removalPolygons}))];
const cache=new WeakMap<NetworkData,NetworkData>();
/** The aerial disproves this private through route; retain its actual loading-yard access. */
export function terminateObsoleteAccessRoute(network:NetworkData):NetworkData{
 const prior=cache.get(network);if(prior)return prior;
 let result=removePrivateComponent(network);for(const route of OBSOLETE_ACCESS_ROUTES)result=terminateRoute(result,route);
 cache.set(network,result);cache.set(result,result);return result;
}
function removePrivateComponent(network:NetworkData):NetworkData{
 const ids=new Set(OBSOLETE_PRIVATE_EDGE_IDS),nodes=new Set(privateComponent.removedNodes);
 const matches=privateComponent.edges.every(record=>{const edge=network.edges.find(e=>e.id===record.id);return edge&&edge.physical_id===record.physical_id&&edge.from===record.from&&edge.to===record.to&&edge.source_objectid===record.source_objectid&&edge.route_id===record.route_id&&JSON.stringify(edge.points)===JSON.stringify(record.points);});
 if(!matches||network.edges.some(e=>!ids.has(e.id)&&(nodes.has(e.from)||nodes.has(e.to))))return network;
 return {...network,edges:network.edges.filter(e=>!ids.has(e.id)),nodes:Array.isArray(network.nodes)?network.nodes.filter(n=>!nodes.has((n as {id:number}).id)):network.nodes,blocked_turns:network.blocked_turns?.filter(t=>!ids.has(t.from_edge)&&!ids.has(t.to_edge)),obsoletePrivateComponent:{removedEdgeIds:[...ids],basis:privateComponent.evidence.basis}};
}
function terminateRoute(network:NetworkData,source:typeof OBSOLETE_ACCESS_ROUTES[number]):NetworkData{
 const forward=network.edges.find(e=>e.id===source.forwardId),reverse=network.edges.find(e=>e.id===source.reverseId);
 if(!forward||!reverse||forward.physical_id!==source.physicalId||reverse.physical_id!==source.physicalId||forward.from!==source.fromNode||forward.to!==source.formerToNode||reverse.from!==source.formerToNode||reverse.to!==source.fromNode||!Array.isArray(network.nodes)||network.nodes.some(n=>(n as {id:number}).id===source.deadEndNode))return network;
 const sameStart=forward.points[0].every((v,i)=>Math.abs(v-source.retainedPoints[0][i])<1e-6);if(!sameStart)return network;
 const end=source.retainedPoints[source.retainedPoints.length-1],points=source.retainedPoints.map(p=>[...p]);
 const edges=network.edges.map(e=>e.id===forward.id?{...e,to:source.deadEndNode,points,length_m:source.retainedLengthM,width_m:source.widthM,lane_offset_m:source.laneOffset,blocked_spans:[]} as RoadEdge:e.id===reverse.id?{...e,from:source.deadEndNode,points:points.slice().reverse().map(p=>[...p]),length_m:source.retainedLengthM,width_m:source.widthM,lane_offset_m:source.laneOffset,blocked_spans:[]} as RoadEdge:e);
 const result={...network,edges,nodes:[...network.nodes,{id:source.deadEndNode,x:end[0],y:end[1],z:end[2]}],obsoleteAccessRoute:{physicalId:source.physicalId,basis:source.evidence.basis}};return result;
}

type Vertex={point:[number,number];values:number[][]};
type Polygon=Vertex[];
function makeCutters(polygons:number[][][]){return polygons.map(points=>({points,sign:Math.sign(points.reduce((s,a,i)=>{const b=points[(i+1)%points.length];return s+a[0]*b[1]-b[0]*a[1];},0)),bounds:[Math.min(...points.map(p=>p[0])),Math.min(...points.map(p=>p[1])),Math.max(...points.map(p=>p[0])),Math.max(...points.map(p=>p[1]))]}));}
const cuttersByTile=new Map(surfaceSources.map(route=>[route.tileId,makeCutters(route.removalPolygons)]));
function split(poly:Polygon,a:number[],b:number[],sign:number):[Polygon,Polygon]{
 const inside:Polygon=[],outside:Polygon=[],side=(p:Vertex)=>sign*((b[0]-a[0])*(p.point[1]-a[1])-(b[1]-a[1])*(p.point[0]-a[0]));
 for(let i=0;i<poly.length;i++){const p=poly[i],q=poly[(i+1)%poly.length],x=side(p),y=side(q);if(x>=0)inside.push(p);if(x<=0)outside.push(p);if(x*y<0){const t=x/(x-y),v:Vertex={point:[p.point[0]+(q.point[0]-p.point[0])*t,p.point[1]+(q.point[1]-p.point[1])*t],values:p.values.map((v,j)=>v.map((n,k)=>n+(q.values[j][k]-n)*t))};inside.push(v);outside.push(v);}}
 return[inside,outside];
}
function subtract(poly:Polygon,cutter:ReturnType<typeof makeCutters>[number]):Polygon[]{
 let remainder=poly;const kept:Polygon[]=[];
 for(let i=0;i<cutter.points.length;i++){const [inside,outside]=split(remainder,cutter.points[i],cutter.points[(i+1)%cutter.points.length],cutter.sign);if(outside.length>=3)kept.push(outside);remainder=inside;if(remainder.length<3)break;}
 return kept;
}
const ROAD=/^(?:Drive road \||Finished road \||Finished street corner \||Streetscape \| (?:warm sidewalk concrete|cool sidewalk concrete|repaired sidewalk concrete|granite curb|asphalt joint|asphalt utility repair|cast iron|inferred crossing paint))/;
/** Clip the disproved road ribbon, preserving other streets and every non-road material. */
export function removeObsoleteAccessSurface(group:THREE.Group,tileId:string,origin:V3,level:number,sha:string):{removedTriangles:number;addedTriangles:number;meshes:number}|undefined{
 const source=surfaceSources.find(route=>route.tileId===tileId&&(route.sourceLods as Record<string,string>)[String(level)]===sha);if(!source)return;
 const cutters=cuttersByTile.get(tileId)!;
 if(group.userData.obsoleteAccessRoute)return group.userData.obsoleteAccessRoute;
 const report={removedTriangles:0,addedTriangles:0,meshes:0},retired=new Set<THREE.BufferGeometry>(),point=new THREE.Vector3(),inverse=group.matrixWorld.clone().invert(),matrix=new THREE.Matrix4();group.updateMatrixWorld(true);inverse.copy(group.matrixWorld).invert();
 group.traverse(object=>{
  if(!(object instanceof THREE.Mesh)||object instanceof THREE.InstancedMesh)return;
  const g:THREE.BufferGeometry=object.geometry,attributes=Object.entries(g.attributes) as [string,THREE.BufferAttribute|THREE.InterleavedBufferAttribute][],position=g.getAttribute('position');if(!position||attributes.some(([,a])=>a.itemSize>4))return;
  const materials=Array.isArray(object.material)?object.material:[object.material],parts=g.groups.length?g.groups:[{start:0,count:g.index?.count??position.count,materialIndex:0}];if(!parts.some(p=>ROAD.test(materials[p.materialIndex??0]?.name??'')||materials[p.materialIndex??0]?.userData.townRoadSurfaceType))return;
  matrix.copy(inverse).multiply(object.matrixWorld);const values=attributes.map(()=>[] as number[]),groups:{start:number;count:number;materialIndex:number}[]=[];let removed=0,added=0,total=0;
  const vertex=(id:number):Vertex=>{point.fromBufferAttribute(position,id).applyMatrix4(matrix);return{point:[point.x+origin[0],-point.z-origin[2]],values:attributes.map(([,a])=>Array.from({length:a.itemSize},(_,k)=>[a.getX,a.getY,a.getZ,a.getW][k].call(a,id)))};};
  const emit=(poly:Polygon)=>{for(let i=1;i+1<poly.length;i++){const tri=[poly[0],poly[i],poly[i+1]],p=attributes.findIndex(([n])=>n==='position'),a=tri[0].values[p],b=tri[1].values[p],c=tri[2].values[p],u=b.map((n,k)=>n-a[k]),v=c.map((n,k)=>n-a[k]);if(Math.hypot(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0])<1e-9)continue;for(const q of tri)q.values.forEach((v,j)=>values[j].push(...v));total++;}};
  for(const part of parts){const start=total*3,m=materials[part.materialIndex??0],eligible=!!m&&(ROAD.test(m.name)||!!m.userData.townRoadSurfaceType);
   for(let i=part.start;i<part.start+part.count;i+=3){const triangle=[0,1,2].map(k=>vertex(g.index?.getX(i+k)??i+k));let pieces=[triangle];if(eligible){const xs=triangle.map(p=>p.point[0]),ys=triangle.map(p=>p.point[1]),bounds=[Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)];for(const c of cutters){if(c.bounds[0]>bounds[2]||c.bounds[2]<bounds[0]||c.bounds[1]>bounds[3]||c.bounds[3]<bounds[1])continue;pieces=pieces.flatMap(p=>subtract(p,c));if(!pieces.length)break;}}
    const before=total;pieces.forEach(emit);if(pieces.length!==1||pieces[0]!==triangle){removed++;added+=total-before;}
   }
   groups.push({start,count:total*3-start,materialIndex:part.materialIndex??0});
  }
  if(!removed)return;const geometry=g.clone();geometry.setIndex(null);attributes.forEach(([name,a],i)=>geometry.setAttribute(name,new THREE.Float32BufferAttribute(values[i],a.itemSize)));geometry.clearGroups();groups.filter(p=>p.count).forEach(p=>geometry.addGroup(p.start,p.count,p.materialIndex));geometry.computeBoundingBox();geometry.computeBoundingSphere();object.geometry=geometry;retired.add(g);report.removedTriangles+=removed;report.addedTriangles+=added;report.meshes++;
 });
 group.traverse(o=>{if(o instanceof THREE.Mesh)retired.delete(o.geometry);});retired.forEach(g=>g.dispose());group.userData.obsoleteAccessRoute=report;return report;
}
