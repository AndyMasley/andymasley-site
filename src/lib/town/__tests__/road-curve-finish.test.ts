// @vitest-environment node
import * as THREE from 'three';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { applyRoadCurveFinish, roadCurveAsset, validRoadCurvePacket, type RoadCurvePacket } from '../road-curve-finish';

const packets=[0,1,2].map(level=>{
  const asset=roadCurveAsset('6_-14',level)!;
  return {level,asset,bytes:fs.readFileSync(new URL(`../../../..${asset.url.replace('/town-finish','/public/town-finish')}`,import.meta.url))};
});
describe('bounded Lake curve assets',()=>{
  it('pins all three LOD packets with the same curve geometry and original source identity',()=>{
    const decoded:RoadCurvePacket[]=[];
    for(const {level,asset,bytes}of packets){
      expect(bytes.length).toBe(asset.bytes);expect(createHash('sha256').update(bytes).digest('hex')).toBe(asset.sha256);
      const packet=JSON.parse(bytes.toString());expect(validRoadCurvePacket(packet,'6_-14',level)).toBe(true);
      expect(packet.targets.reduce((n:number,t:{remove:number[]})=>n+t.remove.length,0)).toBe(1079);
      decoded.push(packet);
    }
    expect(decoded[1].geometries).toEqual(decoded[0].geometries);expect(decoded[2].geometries).toEqual(decoded[0].geometries);
    expect(roadCurveAsset('-12_-4',0)).toBeUndefined();
  });
  it('rejects malformed geometry, wrong LOD and duplicate source removals',()=>{
    const packet=JSON.parse(packets[0].bytes.toString());
    expect(validRoadCurvePacket(packet,'6_-14',1)).toBe(false);
    packet.targets[0].remove.push(packet.targets[0].remove[0]);expect(validRoadCurvePacket(packet,'6_-14',0)).toBe(false);
    packet.targets[0].remove.pop();packet.geometries[0].positions[0][0]=Infinity;expect(validRoadCurvePacket(packet,'6_-14',0)).toBe(false);
  });
  it('leaves a missing or unqualified source scene intact',()=>{
    const packet=JSON.parse(packets[0].bytes.toString()),scene=new THREE.Group(),mesh=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial());scene.add(mesh);
    const geometry=mesh.geometry,material=mesh.material;
    expect(applyRoadCurveFinish(scene,'6_-14',[0,0,0],0,'0'.repeat(64),packet).rejected).toBe(true);
    expect(applyRoadCurveFinish(scene,'6_-14',[0,0,0],0,packet.sourceSha256,packet).rejected).toBe(true);
    expect(scene.children).toEqual([mesh]);expect(mesh.geometry).toBe(geometry);expect(mesh.material).toBe(material);expect(scene.userData.roadCurveFinish).toBeUndefined();
    geometry.dispose();material.dispose();
  });
});
