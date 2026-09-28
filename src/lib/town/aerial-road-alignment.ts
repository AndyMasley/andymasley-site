import * as THREE from 'three';
import {removeNonStreetIslandRoutes} from './non-street-island-routes';
import {terminateObsoleteAccessRoute,removeObsoleteAccessSurface} from './obsolete-access-route';
import source from '../../../data/derived/town/aerial-road-alignment.json';
import type { NetworkData, RoadEdge } from './engine';
import type { V3 } from './contracts';

export const AERIAL_ROAD_ALIGNMENT = source;
const smooth = (x: number) => { const t = Math.max(0, Math.min(1, x)); return t * t * (3 - 2 * t); };
const window = (x: number, a: readonly number[]) => smooth((x-a[0])/(a[1]-a[0])) * (1-smooth((x-a[2])/(a[3]-a[2])));

/** One mapping for asphalt, paint, curbs, sidewalks, guided lanes and nodes.
 * Overlapping approach windows blend rather than adding two shifts. */
export function aerialRoadPoint(east: number, north: number): [number, number] {
  if (!Number.isFinite(east) || !Number.isFinite(north)) return [east,north];
  let dx=0,dy=0,total=0;
  for(const c of source.corridors){
    const x=east-c.start[0],y=north-c.start[1],s=x*c.tangent[0]+y*c.tangent[1],v=-x*c.tangent[1]+y*c.tangent[0];
    const weight=window(s,c.along)*(1-smooth((Math.abs(v)-c.across[0])/(c.across[1]-c.across[0])));if(weight<=0)continue;
    // Contract the carriageway, retaining curb/sidewalk thickness outside it.
    // At the Main Street junction only translation remains, so its cross-road
    // pavement keeps its own width and all shared vertices still coincide.
    const half=c.sourceWidth/2,target=c.width/2,across=Math.sign(v)*(Math.abs(v)<=half?Math.abs(v)*target/half:target+Math.abs(v)-half);
    const shift=c.lateralShift+(across-v)*window(s,c.widthAlong);
    dx-=c.tangent[1]*shift*weight;dy+=c.tangent[0]*shift*weight;total+=weight;
  }
  const divisor=Math.max(1,total);return[east+dx/divisor,north+dy/divisor];
}

const corrected = new WeakMap<NetworkData, NetworkData>();
/** Clone the decoded source; release bytes and original object remain intact.
 * Remove only the named conflict spans demonstrated clear by the paired native
 * pavement/body and full guided-car/connector probes. */
export function alignAerialRoadNetwork(network: NetworkData): NetworkData {
  const previous=corrected.get(network);if(previous)return previous;
  const valid=source.corridors.every(c=>c.directedIds.every(id=>network.edges.some(e=>e.id===id&&e.physical_id===c.physicalId&&e.name===c.name)));
  if(!valid)return network;
  const base=terminateObsoleteAccessRoute(network);
  const edges=base.edges.map(edge=>{
    let changed=false;
    const points=edge.points.map(p=>{const [e,n]=aerialRoadPoint(p[0],p[1]);if(Math.abs(e-p[0])+Math.abs(n-p[1])>1e-9)changed=true;return[e,n,...p.slice(2)];});
    if(!changed)return edge;
    const c=source.corridors.find(c=>c.physicalId===edge.physical_id),copy:RoadEdge={...edge,points};
    copy.length_m=points.slice(1).reduce((sum,p,i)=>sum+Math.hypot(p[0]-points[i][0],p[1]-points[i][1]),0);
    if(c){copy.width_m=c.networkWidth;copy.lane_offset_m=c.laneOffset;copy.blocked_spans=edge.blocked_spans?.filter(span=>!Array.isArray(span.structure_ids)||!span.structure_ids.length||!span.structure_ids.every(id=>c.resolvedStructures.includes(String(id))));}
    return copy;
  });
  const nodes=Array.isArray(base.nodes)?base.nodes.map(node=>{const p=node as {x:number;y:number};if(!Number.isFinite(p.x)||!Number.isFinite(p.y))return node;const [x,y]=aerialRoadPoint(p.x,p.y);return x===p.x&&y===p.y?node:{...node,x,y};}):base.nodes;
  const result=removeNonStreetIslandRoutes({...base,edges,nodes,aerialRoadAlignment:{version:source.version,basis:source.evidence.policy}});corrected.set(network,result);corrected.set(result,result);return result;
}

const ROAD=/^(?:Drive road \||Finished road \||Finished street corner \||Streetscape \| (?:warm sidewalk concrete|cool sidewalk concrete|repaired sidewalk concrete|granite curb|asphalt joint|asphalt utility repair|cast iron|inferred crossing paint))/;
/** Post-transaction display correction. Exact source tile/LOD gates apply;
 * retained building, water and terrain positions are never edited. */
export function applyAerialRoadAlignment(group:THREE.Group,tileId:string,origin:V3,level:number,sourceSha256:string):{vertices:number;meshes:number}|undefined{
  const tile=(source.tiles as Record<string,Record<string,string>>)[tileId];if(!tile||tile[String(level)]!==sourceSha256)return;
  if(group.userData.aerialRoadAlignment)return group.userData.aerialRoadAlignment;
  group.updateMatrixWorld(true);const rootInverse=group.matrixWorld.clone().invert(),matrix=new THREE.Matrix4(),inverse=new THREE.Matrix4(),point=new THREE.Vector3(),report={vertices:0,meshes:0},retired=new Set<THREE.BufferGeometry>();
  group.traverse(object=>{
    if(!(object instanceof THREE.Mesh)||object instanceof THREE.InstancedMesh)return;
    const geometry=object.geometry,position=geometry.getAttribute('position');if(!position)return;
    const materials=Array.isArray(object.material)?object.material:[object.material],count=geometry.index?.count??position.count,groups=geometry.groups.length?geometry.groups:[{start:0,count,materialIndex:0}],eligible=new Set<number>(),protectedVertices=new Set<number>();
    for(const part of groups){const m=materials[part.materialIndex??0],set=m&&(ROAD.test(m.name)||m.userData.townRoadSurfaceType)?eligible:protectedVertices;for(let i=part.start;i<Math.min(count,part.start+part.count);i++)set.add(geometry.index?.getX(i)??i);}
    if(!eligible.size)return;matrix.copy(rootInverse).multiply(object.matrixWorld);inverse.copy(matrix).invert();let clone:THREE.BufferGeometry|undefined;
    for(const id of eligible){if(protectedVertices.has(id))continue;point.fromBufferAttribute(position,id).applyMatrix4(matrix);const e=point.x+origin[0],n=-point.z-origin[2],[x,y]=aerialRoadPoint(e,n);if(Math.abs(x-e)+Math.abs(y-n)<1e-9)continue;
      const target=clone??(clone=geometry.clone() as THREE.BufferGeometry);point.x=x-origin[0];point.z=-y-origin[2];point.applyMatrix4(inverse);target.getAttribute('position').setXYZ(id,point.x,point.y,point.z);report.vertices++;
    }
    if(clone){clone.getAttribute('position').needsUpdate=true;clone.computeVertexNormals();clone.computeBoundingBox();clone.computeBoundingSphere();object.geometry=clone;retired.add(geometry);report.meshes++;}
  });
  group.traverse(o=>{if(o instanceof THREE.Mesh)retired.delete(o.geometry);});retired.forEach(g=>g.dispose());
  removeObsoleteAccessSurface(group,tileId,origin,level,sourceSha256);
  group.userData.aerialRoadAlignment=report;return report;
}
