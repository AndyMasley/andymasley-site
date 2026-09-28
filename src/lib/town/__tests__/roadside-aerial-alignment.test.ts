// @vitest-environment node
import {describe,it,expect,vi} from 'vitest';
import * as THREE from 'three';
import {Batch} from '../crafted-frontages';
import {AERIAL_ROAD_ALIGNMENT,aerialRoadPoint} from '../aerial-road-alignment';
import {applyRoadsideDetails,type RoadsidePacket} from '../roadside-details';
const tileId='-10_-3',origin=[-2500,0,750],sha=AERIAL_ROAD_ALIGNMENT.tiles[tileId]['0'];
const mount={id:'OSM-70409215-1',kind:'stop' as const,point:[-2288.5911,-639.3391],mappedPoint:[-2284.3697525431344,-634.9662135866238],normal:[-.2091853547855256,.9778760081642528],base:52.8415,label:'STOP',shiftM:6.078,evidence:'OSM control node and connected road geometry; roadside mounting authored with road clearance.'};
function scene(aligned:boolean){const group=new THREE.Group(),terrain=new THREE.Mesh(new THREE.PlaneGeometry(250,250).rotateX(-Math.PI/2).translate(125,52.85,-125),new THREE.MeshStandardMaterial());terrain.name='terrain';group.add(terrain);if(aligned)group.userData.aerialRoadAlignment={vertices:1,meshes:1};return group;}
function dispose(group:THREE.Group){group.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();for(const m of [o.material].flat())m.dispose();}});}
describe('road-derived stop mounts beside aerial-corrected roads',()=>{
 it('moves the real Whitcomb/Cutler authored mount with the curb, without changing source or mapped objects',()=>{
  const packet:RoadsidePacket={version:1,tileId,origin,sourceLods:{0:sha},objects:[mount,{...mount,id:'direct-mapped-stop',mappedPoint:undefined,shiftM:undefined},{...mount,id:'mapped-postbox',kind:'post-box'}]},before=structuredClone(packet),group=scene(true),spy=vi.spyOn(Batch.prototype,'box');
  try{applyRoadsideDetails(group,tileId,origin,0,sha,packet);const starts=new Map(spy.mock.calls.map(c=>[c[0].structId,c[0].start]));expect(starts.get(mount.id)).toEqual(aerialRoadPoint(...mount.point as [number,number]));expect(starts.get(mount.id)).not.toEqual(mount.point);expect(starts.get('direct-mapped-stop')).toEqual(mount.point);expect(starts.get('mapped-postbox')).toEqual(mount.point);expect(packet).toEqual(before);}finally{spy.mockRestore();dispose(group);}
 });
 it('retains the original mount when the source-qualified road stage did not apply',()=>{
  const group=scene(false),spy=vi.spyOn(Batch.prototype,'box');try{applyRoadsideDetails(group,tileId,origin,0,sha,{version:1,tileId,origin,sourceLods:{0:sha},objects:[mount]});expect(spy.mock.calls[0][0].start).toEqual(mount.point);}finally{spy.mockRestore();dispose(group);}
 });
});
