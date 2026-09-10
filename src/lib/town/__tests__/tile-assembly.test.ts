// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { tileAssemblySteps } from '../tile-assembly';
import * as grading from '../street-corner-ground';
import * as corners from '../street-corners';
import * as dashes from '../road-dash-finish';
import * as roadMaterials from '../road-material-finish';
import type { TownTile } from '../contracts';
const tile: TownTile = { id:'a',origin:[0,0,250],bounds:{min:[0,0,0],max:[250,100,250]},lods:[{url:'a.glb',bytes:20,level:0,sha256:'a'.repeat(64)}] };
afterEach(()=>vi.restoreAllMocks());
describe('shared scene dependency order',()=>{
  it.each(['missing','rejected','applied'] as const)('requires successful registered grading before publishing corner geometry: %s',state=>{
    vi.spyOn(grading,'streetCornerGroundAsset').mockReturnValue({url:'/grading.json',bytes:1});
    vi.spyOn(grading,'applyStreetCornerGround').mockImplementation(group=>{
      if(state==='applied')group.userData.streetCornerGround={rejected:false};
      if(state==='rejected')return{rejected:true};
      return undefined;
    });
    const add=vi.spyOn(corners,'applyStreetCorners').mockReturnValue({features:1,triangles:2,rejected:false});
    const scene=new THREE.Group(),steps=tileAssemblySteps(scene,tile,0,{}),names=steps.map(s=>s.name);
    expect(names.indexOf('shoreline')).toBeLessThan(names.indexOf('streetCornerGround'));
    expect(names.indexOf('streetCornerGround')).toBeLessThan(names.indexOf('parking'));
    expect(names.indexOf('roadMaterials')).toBeLessThan(names.indexOf('roadCurve'));
    expect(names.indexOf('roadCurve')).toBeLessThan(names.indexOf('roadDash'));
    expect(names.indexOf('roadDash')).toBeLessThan(names.indexOf('streetCorners'));
    expect(names.indexOf('streetCorners')).toBeLessThan(names.indexOf('streetGeometry'));
    expect(names.indexOf('streetGeometry')).toBeLessThan(names.indexOf('arrivalGrounds'));
    expect(names.indexOf('evidenceBuildings')).toBeLessThan(names.indexOf('campStructures'));
    expect(names.indexOf('campStructures')).toBeLessThan(names.indexOf('indianRanchCanopy'));
    expect(names.indexOf('terrain')).toBeLessThan(names.indexOf('indianRanchGrounds'));
    expect(names.indexOf('indianRanchCanopy')).toBeLessThan(names.indexOf('indianRanchGrounds'));
    expect(names.indexOf('indianRanchGrounds')).toBeLessThan(names.indexOf('evidenceEnvironment'));
    expect(names.indexOf('evidenceBuildings')).toBeLessThan(names.indexOf('pointBreezeDetails'));
    expect(names.indexOf('propertyTerrain')).toBeLessThan(names.indexOf('frenchRiverPark'));
    expect(names.indexOf('frenchRiverPark')).toBeLessThan(names.indexOf('frenchRiverParkFurniture'));
    expect(names.indexOf('frenchRiverParkFurniture')).toBeLessThan(names.indexOf('evidenceEnvironment'));
    steps.find(s=>s.name==='streetCornerGround')!.apply();steps.find(s=>s.name==='streetCorners')!.apply();
    if(state==='applied'){expect(add).toHaveBeenCalledOnce();expect(scene.userData.optionalDetailMissing).toBeUndefined();}
    else{expect(add).not.toHaveBeenCalled();expect(scene.userData.optionalDetailMissing).toEqual(['streetCornerGround']);}
  });
  it('retries source-guard rejection in any supplied optional family',()=>{
    vi.spyOn(roadMaterials,'applyRoadMaterialFinish').mockReturnValue({triangles:0,meshes:0,rejectedMeshes:1,materialVariants:0,indexBytes:0,byType:{}});
    const scene=new THREE.Group();
    tileAssemblySteps(scene,tile,0,{}).find(s=>s.name==='roadMaterials')!.apply();
    expect(scene.userData.optionalDetailMissing).toEqual(['roadMaterials']);
    expect(scene.userData.assemblyReports.roadMaterials.rejectedMeshes).toBe(1);
  });
  it('retains dash rejection diagnostics and schedules a correction retry',()=>{
    const result={applied:false,rejected:true,removedTriangles:0,addedTriangles:0,geometryBytes:0,tinyPaintTriangles:0};
    vi.spyOn(dashes,'applyRoadDashFinish').mockReturnValue(result);
    const scene=new THREE.Group(),steps=tileAssemblySteps(scene,tile,0,{roadDash:{} as dashes.RoadDashPacket});
    steps.find(s=>s.name==='roadDash')!.apply();
    expect(scene.userData.optionalDetailMissing).toEqual(['roadDash']);
    expect(scene.userData.assemblyReports.roadDash).toEqual(result);
  });
  it('keeps a corner that needs no registered grading eligible without introducing a dependency',()=>{
    vi.spyOn(grading,'streetCornerGroundAsset').mockReturnValue(undefined);
    vi.spyOn(grading,'applyStreetCornerGround').mockReturnValue(undefined);
    const add=vi.spyOn(corners,'applyStreetCorners').mockReturnValue({features:1,triangles:2,rejected:false});
    const scene=new THREE.Group(),steps=tileAssemblySteps(scene,tile,0,{});
    steps.find(s=>s.name==='streetCornerGround')!.apply();steps.find(s=>s.name==='streetCorners')!.apply();
    expect(add).toHaveBeenCalledOnce();expect(scene.userData.optionalDetailMissing).toBeUndefined();
  });
});
