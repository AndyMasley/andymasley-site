// @vitest-environment node
import {describe,it,expect} from 'vitest';
import * as THREE from 'three';
import catalog from '../../../../data/derived/town/property-grounds.json';
import {applyPropertyGrounds,propertyGroundRecord} from '../property-grounds';
import type {V3} from '../contracts';

describe('registered residential grounds',()=>{
 it('decodes shared indexed footprints exactly and retains all current source/LOD guards',()=>{
  for(const [tileId,row]of Object.entries(catalog.tiles)){
   const record=propertyGroundRecord(tileId)!;
   expect(record.lods).toEqual(row.lods);expect(record.origin).toEqual(row.origin);
   expect(record.features.map(f=>f.id)).toEqual(catalog.features.filter(f=>row.features.includes(f.id)).map(f=>f.id));
   for(const f of record.features){const source=catalog.features.find(p=>p.id===f.id)!;
    expect(f.triangles.flat()).toEqual(source.indices.map(i=>source.points[i]));
   }
   expect(propertyGroundRecord(tileId)).toBe(record);
  }
  expect(propertyGroundRecord('outside')).toBeUndefined();
 });
 it('leaves wrong sources intact and excludes only dated paving from tree placement once',()=>{
  const tileId='6_-14',record=propertyGroundRecord(tileId)!,origin=record.origin as V3,group=new THREE.Group();
  const geometry=new THREE.PlaneGeometry(700,700,8,8).rotateX(-Math.PI/2).translate(125,40,-125),mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial());mesh.name='terrain_1';group.add(mesh);
  const source=geometry.getAttribute('position').array.slice();
  expect(applyPropertyGrounds(group,tileId,origin,0,'wrong')?.status).toBe('source-mismatch');expect(group.children).toHaveLength(1);
  const report=applyPropertyGrounds(group,tileId,origin,0,record.lods[0].sha256)!;
  expect(report.status).toBe('applied');expect(report.ids.length).toBeGreaterThan(2);expect(mesh.geometry).toBe(geometry);expect(geometry.getAttribute('position').array).toEqual(source);
  const expected=record.features.filter(f=>f.kind==='driveway').flatMap(f=>f.triangles);
  expect(group.userData.environmentTreeExclusions).toEqual(expected);expect(group.userData.environmentGrassExclusions.length).toBeGreaterThan(0);
  const count=group.children.length;expect(applyPropertyGrounds(group,tileId,origin,0,record.lods[0].sha256)).toBe(report);expect(group.children).toHaveLength(count);expect(group.userData.environmentTreeExclusions).toEqual(expected);
 });
});
