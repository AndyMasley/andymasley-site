// @vitest-environment node
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import catalog from '../../../../data/derived/town/road-finish-index.json';
import audit from '../../../../data/derived/town/road-finish-audit.json';
import { applyRoadFinish, clipRoadPaintPolygon, PavementIndex, RoadFinishStream, roadPaintHeightAt, validateRoadFinish, type RoadPaintPatch } from '../road-finish';

const packet=(tile:string)=>JSON.parse(readFileSync(new URL(`../../../../public${catalog.tiles[tile as keyof typeof catalog.tiles].url}`,import.meta.url),'utf8'));
const fileRows=Object.entries(catalog.tiles).map(([id,asset])=>({id,asset,packet:packet(id)}));
function sourceMesh(triangle:number[][],name='Drive road | asphalt',origin=[0,0,0]):THREE.Mesh{
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(triangle.flatMap(p=>[p[0]-origin[0],p[2]-origin[1],-p[1]-origin[2]]),3));geometry.computeVertexNormals();
  const material=new THREE.MeshStandardMaterial();material.name=name;const mesh=new THREE.Mesh(geometry,material);mesh.name='roads_1';return mesh;
}
function sceneWith(triangles:number[][][]):THREE.Group{const scene=new THREE.Group(),road=new THREE.Group();road.name='roads';for(const triangle of triangles)road.add(sourceMesh(triangle));scene.add(road);return scene;}
function area(polygon:number[][]):number{let value=0;for(let i=1;i<polygon.length-1;i++)value+=(polygon[i][0]-polygon[0][0])*(polygon[i+1][1]-polygon[0][1])-(polygon[i][1]-polygon[0][1])*(polygon[i+1][0]-polygon[0][0]);return Math.abs(value)/2;}
function meshXYArea(mesh:THREE.Mesh):number{const p=mesh.geometry.getAttribute('position'),index=mesh.geometry.index;let result=0;for(let i=0;i<(index?.count??p.count);i+=3)result+=area([0,1,2].map(j=>{const id=index?index.getX(i+j):i+j;return[p.getX(id),-p.getZ(id)];}));return result;}

describe('finished road markings',()=>{
  it('repairs survey cuts while preserving real junctions and original yellow-road eligibility',()=>{
    for(const node of [1111,1182,1189]){const decisions=audit.decisions.filter(row=>row.node===node);expect(decisions).toHaveLength(2);for(const row of decisions){expect(row.reason).toBe('survey_segmentation_continuation');expect(row.trim).toBe(0);}}
    const junction=audit.decisions.find(row=>row.node===370&&row.edgeId===2572)!;expect(junction.reason).toBe('width_based_real_junction');expect(junction.trim).toBeGreaterThanOrEqual(4.5);expect(junction.trim).toBeLessThan(5);
    const bytes=gunzipSync(readFileSync(new URL('../../../../data/derived/town/engine-network.json.gz',import.meta.url))),graph=JSON.parse(bytes.toString()),edges=new Map<number,any>(graph.edges.map((e:any)=>[e.id,e]));
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(catalog.sourceNetworkSha256);
    for(const id of audit.changedEdges){const edge=edges.get(id)!;expect(edge.road_type).toBeGreaterThan(2);expect(edge.road_type).toBeLessThanOrEqual(5);expect(edge.width_m).toBeGreaterThanOrEqual(5.5);expect(graph.edges.filter((e:any)=>e.physical_id===edge.physical_id)).toHaveLength(2);expect(audit.sourceYellowIntentPhysicalIds).toContain(edge.physical_id);}
    for(const row of audit.decisions.filter(row=>row.reason==='width_based_real_junction')){expect(row.trim).toBeGreaterThanOrEqual(4.5);expect(row.trim).toBeLessThanOrEqual(10);}
  });
  it('ships strictly validated, content-addressed optional tiles rather than bundling their geometry',()=>{
    expect(fileRows).toHaveLength(catalog.counts.tiles);
    for(const {id,asset,packet:body} of fileRows){const bytes=readFileSync(new URL(`../../../../public${asset.url}`,import.meta.url));expect(bytes.byteLength).toBe(asset.bytes);expect(createHash('sha256').update(bytes).digest('hex')).toBe(asset.sha256);expect(validateRoadFinish(body,id)).toHaveLength(asset.count);}
    const {id,packet:original}=fileRows[0],invalid=structuredClone(original);invalid.rows[0].surface[0][0]=NaN;expect(validateRoadFinish(invalid,id)).toBeUndefined();expect(validateRoadFinish(original,'wrong-tile')).toBeUndefined();
  });
  it('keeps every inferred addition outside all five observed ladder-crossing corridors',()=>{
    expect(audit.protectedCrosswalks).toHaveLength(5);
    for(const crossing of audit.protectedCrosswalks){
      const zone=crossing.polygon,low=[Math.min(...zone.map(p=>p[0])),Math.min(...zone.map(p=>p[1]))],high=[Math.max(...zone.map(p=>p[0])),Math.max(...zone.map(p=>p[1]))];
      for(const file of fileRows)for(const row of file.packet.rows as RoadPaintPatch[])for(const polygon of row.paint){
        if(Math.max(...polygon.map(p=>p[0]))<low[0]||Math.min(...polygon.map(p=>p[0]))>high[0]||Math.max(...polygon.map(p=>p[1]))<low[1]||Math.min(...polygon.map(p=>p[1]))>high[1])continue;
        const overlap=area(clipRoadPaintPolygon(polygon,[zone[0],zone[1],zone[2]]))+area(clipRoadPaintPolygon(polygon,[zone[0],zone[2],zone[3]]));expect(overlap,`${crossing.id} ${row.id}`).toBeLessThan(.000001);
      }
    }
  });
  it('keeps cross-tile paint with the asphalt triangle owner and leaves dashed/source geometry unchanged',()=>{
    const origin:[number,number,number]=[250,0,0],triangle=[[248,10,10],[254,10,10],[248,20,10]],scene=new THREE.Group(),road=new THREE.Group();road.name='roads';
    const asphalt=sourceMesh(triangle,'Drive road | asphalt',origin),white=sourceMesh([[250,11,10.021],[251,11,10.021],[250,12,10.021]],'Drive road | chalk white paint',origin);road.add(asphalt,white);scene.add(road);
    const sourceGeometry=asphalt.geometry,whiteGeometry=white.geometry,row:RoadPaintPatch={id:'cross-boundary',edgeId:1,physicalId:1,surface:triangle,paint:[[[249,11],[249,12],[250,12],[250,11]]]};
    const result=applyRoadFinish(scene,'1_0',origin,0,[row]);expect(result.matchedSurfaces).toBe(1);expect(result.addedTriangles).toBeGreaterThan(0);expect(asphalt.geometry).toBe(sourceGeometry);expect(white.geometry).toBe(whiteGeometry);
    const finish=scene.getObjectByName('Finished road centerlines')as THREE.Mesh,p=finish.geometry.getAttribute('position');expect(Array.from(p.array).filter((_,i)=>i%3===0).some(x=>x<0)).toBe(true);
    for(let i=0;i<p.count;i++)expect(p.getY(i)).toBeCloseTo(10.018,5);
    expect(applyRoadFinish(scene,'1_0',origin,2,[row])).toBe(result);expect(scene.children.filter(child=>child.name==='Finished road centerlines')).toHaveLength(1);
  });
  it('partitions overlapping asphalt planes exactly without filling a dash gap or choosing an overpass',()=>{
    const base=[[0,0,10],[8,0,10],[0,8,10]],upper=[[2,0,10.12],[8,0,10.12],[2,6,10.12]],overpass=base.map(p=>[p[0],p[1],p[2]+8]),polygon=[[1,1],[1,3],[4,3],[4,1]],index=new PavementIndex([base,upper,overpass]);
    const result=index.conform(polygon,base);expect(result.changed).toBe(true);expect(result.pieces.reduce((sum,p)=>sum+area(p.polygon),0)).toBeCloseTo(area(polygon),8);
    for(const piece of result.pieces){const center=piece.polygon.reduce((a,p)=>a.map((v,i)=>v+p[i]/piece.polygon.length),[0,0]),height=roadPaintHeightAt(piece.plane,center);expect(height).toBeLessThan(11);expect(height).toBeCloseTo(center[0]>2?10.12:10,6);}
    expect(clipRoadPaintPolygon([[20,20],[20,21],[21,20]],base)).toEqual([]);
  });
  it('raises only buried portions of existing source paint while retaining its exact horizontal footprint',()=>{
    const base=[[0,0,10],[8,0,10],[0,8,10]],upper=[[2,0,10.12],[8,0,10.12],[2,6,10.12]],scene=sceneWith([base,upper]),road=scene.children[0];
    const stripe=sourceMesh([[1,1,10.018],[4,1,10.018],[1,3,10.018]],'Drive road | warm yellow paint');road.add(stripe);const oldArea=meshXYArea(stripe),oldMaterial=stripe.material;
    const result=applyRoadFinish(scene,'0_0',[0,0,0],0);expect(result.conformedPaintTriangles).toBe(1);expect(result.conformedPaintMeshes).toBe(1);expect(meshXYArea(stripe)).toBeCloseTo(oldArea,6);expect(stripe.material).toBe(oldMaterial);
    const p=stripe.geometry.getAttribute('position');expect(p.count).toBeGreaterThan(3);for(let i=0;i<p.count;i++){expect(p.getX(i)).toBeGreaterThanOrEqual(1);expect(p.getX(i)).toBeLessThanOrEqual(4);if(p.getX(i)>2.001)expect(p.getY(i)).toBeCloseTo(10.138,5);else if(p.getX(i)<1.999)expect(p.getY(i)).toBeCloseTo(10.018,5);}
  });
  it('never invents support where the matching source road is absent',()=>{
    const scene=sceneWith([[[0,0,10],[8,0,10],[0,8,10]]]),row:RoadPaintPatch={id:'missing',edgeId:1,physicalId:1,surface:[[100,100,10],[108,100,10],[100,108,10]],paint:[[[101,101],[102,101],[101,102]]]};
    const report=applyRoadFinish(scene,'0_0',[0,0,0],0,[row]);expect(report.unmatchedIds).toEqual(['missing']);expect(report.addedTriangles).toBe(0);expect(scene.getObjectByName('Finished road centerlines')).toBeUndefined();
  });
});

describe('optional road finish streaming',()=>{
  it('caches complete packets, rejects corrupt data and caps residency at64 tiles',async()=>{
    const byUrl=new Map(fileRows.map(row=>[row.asset.url,row.packet])),read=vi.fn(async<T>(url:string)=>byUrl.get(url)as T),stream=new RoadFinishStream(<T>(url:string)=>read(url)as Promise<T>),signal=new AbortController().signal;
    for(const row of fileRows.slice(0,65))await stream.tile(row.id,signal);
    const before=read.mock.calls.length;await stream.tile(fileRows[64].id,signal);expect(read.mock.calls.length).toBe(before);await stream.tile(fileRows[0].id,signal);expect(read.mock.calls.length).toBe(before+1);
    const invalid=new RoadFinishStream(async<T>()=>({version:9})as T);expect(await invalid.tile(fileRows[0].id,signal)).toEqual([]);expect(invalid.failures).toBe(1);
  });
  it('never caches a cancelled result and cannot repopulate after disposal',async()=>{
    let resolve!:(value:unknown)=>void;const read=vi.fn(<T>()=>new Promise<T>(r=>{resolve=r as (value:unknown)=>void;})),stream=new RoadFinishStream(<T>()=>read()as Promise<T>),abort=new AbortController(),promise=stream.tile(fileRows[0].id,abort.signal);abort.abort();resolve(fileRows[0].packet);await expect(promise).rejects.toMatchObject({name:'AbortError'});
    const next=stream.tile(fileRows[0].id,new AbortController().signal);expect(read).toHaveBeenCalledTimes(2);stream.dispose();resolve(fileRows[0].packet);await expect(next).rejects.toMatchObject({name:'AbortError'});await expect(stream.tile(fileRows[0].id,new AbortController().signal)).rejects.toMatchObject({name:'AbortError'});
  });
});
