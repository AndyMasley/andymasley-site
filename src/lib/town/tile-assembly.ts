import * as THREE from 'three';
import type { TownTile } from './contracts';
import type { TileEvidence } from './evidence-stream';
import release from '../../../data/derived/town/release.json';
import { applyTownHallMaterials } from './town-hall-materials';
import { applyCivicDetails } from './civic-details';
import { applyCivicRoofFinish } from './civic-roof-finish';
import { applyChurchRoofFinish } from './church-roof-finish';
import { applyLandmarkCompletion } from './landmark-completion';
import { applyInstitutionalCompletion } from './institutional-completion';
import { applyCommercialCompletion } from './commercial-completion';
import { applyMemorialDetails } from './memorial-details';
import { additionalEnvironmentAsset, validAdditionalEnvironmentPacket, applyAdditionalEnvironment } from './additional-environment';
import { roadsideAsset, validRoadsidePacket, applyRoadsideDetails } from './roadside-details';
import { environmentGroundAsset, validEnvironmentGroundPacket, applyEnvironmentGround, type EnvironmentGroundPacket } from './environment-ground';
import { roadMaterialAsset, validRoadMaterialPacket, applyRoadMaterialFinish, type RoadMaterialPacket } from './road-material-finish';
import { applyCemeteryRoadFinish } from './cemetery-roads';
import { applyLakeLife } from './lake-life';
import { applyUtilitySiteDetails } from './utility-site-details';
import { environmentFacilitiesAsset, validEnvironmentFacilitiesPacket, applyEnvironmentFacilities } from './environment-facilities';
import { applyCraftedFrontages } from './crafted-frontages';
import { applyStreetGeometry } from './street-geometry';
import { applyRailCrossingFinish } from './rail-crossing-finish';
import { applyArrivalGrounds } from './arrival-grounds';
import { applyPropertyGrounds } from './property-grounds';
import { applyCommercialFrontageGrounds } from './commercial-frontage-grounds';
import { applyMillYardGrounds } from './mill-yard-grounds';
import { applyPropertyTerrainFinish } from './property-terrain-finish';
import { applyStreetCorners } from './street-corners';
import { streetCornerGroundAsset, applyStreetCornerGround } from './street-corner-ground';
import { applyRoadCurveFinish } from './road-curve-finish';
import { applyRoadDashFinish } from './road-dash-finish';
import { applyRampApronFinish } from './ramp-apron-finish';
import { applyCampStructures } from './camp-structures';
import { applyBathhouse } from './bathhouse';
import { applyBathhouseGrounds } from './bathhouse-grounds';
import { applyDockApproaches } from './dock-approaches';
import { applyEvidenceBuildings } from './evidence-buildings';
import { landmarkRows, buildEvidenceLandmarks } from './evidence-landmarks';
import { applyEvidenceEnvironment } from './evidence-environment';
import { applyMeasuredBridgeSurface } from './bridge-surface';
import { RoadFinishStream, applyRoadFinish } from './road-finish';
import { terrainFinishAsset, validTerrainFinishPacket, applyTerrainFinish, type TerrainFinishPacket } from './terrain-finish';
import { applyParkingFinish, validParkingPacket } from './parking-finish';

export interface TileDetails {
  evidence?: TileEvidence;
  streetCorners?: Parameters<typeof applyStreetCorners>[5];
  streetCornerGround?: Parameters<typeof applyStreetCornerGround>[5];
  roadCurve?: Parameters<typeof applyRoadCurveFinish>[5];
  roadDash?: Parameters<typeof applyRoadDashFinish>[5];
  propertyTerrain?: Parameters<typeof applyPropertyTerrainFinish>[5];
  road?: Parameters<typeof applyRoadFinish>[4];
  terrain?: Parameters<typeof applyTerrainFinish>[4];
  parking?: Parameters<typeof applyParkingFinish>[3];
  additional?: Parameters<typeof applyAdditionalEnvironment>[4];
  roadside?: Parameters<typeof applyRoadsideDetails>[5];
  environmentGround?: Parameters<typeof applyEnvironmentGround>[4];
  facilities?: Parameters<typeof applyEnvironmentFacilities>[4];
  roadMaterials?: Parameters<typeof applyRoadMaterialFinish>[5];
}
export type AssemblyStep = { name: string; apply: () => unknown };

/** One authoritative transaction order is shared by live loading and native QA.
 * A scene is unpublished until every step and its source guards complete. */
export function tileAssemblySteps(group: THREE.Group, tile: TownTile, level: number, details: TileDetails): AssemblyStep[] {
  const { evidence, road, terrain, parking, additional, roadside, environmentGround, facilities, roadMaterials, streetCorners, streetCornerGround, roadCurve, roadDash, propertyTerrain } = details;
  const sourceSha256 = tile.lods.find(row => row.level === level)?.sha256 ?? '';
  let institutions: ReturnType<typeof applyInstitutionalCompletion>;
  const landmarks = landmarkRows(tile.id);
  let cornerGroundReady = !streetCornerGroundAsset(tile.id, level);
  const steps: AssemblyStep[] = [
    { name: 'bridge', apply: () => { return applyMeasuredBridgeSurface(group,tile.id,tile.origin); } },
    { name: 'terrain', apply: () => { const matches=terrain?.levels.find(row=>row.level===level)?.sourceSha256===sourceSha256; return terrain && !matches ? {rejected:true,rejectionReason:'source SHA mismatch'} : applyTerrainFinish(group,tile.id,tile.origin,level,terrain); } },
    { name: 'shoreline', apply: () => { return applyEnvironmentGround(group,tile.id,tile.origin,level,environmentGround); } },
    { name: 'streetCornerGround', apply: () => {
      const result = applyStreetCornerGround(group,tile.id,tile.origin,level,sourceSha256,streetCornerGround);
      if (result) group.userData.streetCornerGroundResult = result;
      if (!cornerGroundReady) {
        cornerGroundReady = !!group.userData.streetCornerGround && !group.userData.streetCornerGround.rejected;
        if (!cornerGroundReady) group.userData.optionalDetailMissing = [...new Set([...(group.userData.optionalDetailMissing ?? []), 'streetCornerGround'])];
      }
      return result;
    } },
    { name: 'roadPaint', apply: () => { return applyRoadFinish(group,tile.id,tile.origin,level,road); } },
    { name: 'cemeteryPaint', apply: () => { return applyCemeteryRoadFinish(group,tile.id,tile.origin,release.manifestSha256); } },
    { name: 'parking', apply: () => { return applyParkingFinish(group,tile.id,tile.origin,parking,level); } },
    { name: 'roadMaterials', apply: () => { return applyRoadMaterialFinish(group,tile.id,tile.origin,level,sourceSha256,roadMaterials); } },
    { name: 'roadCurve', apply: () => {
      const result = applyRoadCurveFinish(group,tile.id,tile.origin,level,sourceSha256,roadCurve);
      if (roadCurve) group.userData.roadCurveResult = result;
      if (roadCurve && result.rejected) group.userData.optionalDetailMissing = [...new Set([...(group.userData.optionalDetailMissing ?? []), 'roadCurve'])];
      return result;
    } },
    { name: 'roadDash', apply: () => {
      const result = applyRoadDashFinish(group,tile.id,tile.origin,level,sourceSha256,roadDash);
      if (roadDash) group.userData.roadDashResult = result;
      if (roadDash && result.rejected) group.userData.optionalDetailMissing = [...new Set([...(group.userData.optionalDetailMissing ?? []), 'roadDash'])];
      return result;
    } },
    { name: 'rampApron', apply: () => { return applyRampApronFinish(group,tile.id,tile.origin,level,sourceSha256); } },
    { name: 'streetCorners', apply: () => { return cornerGroundReady ? applyStreetCorners(group,tile.id,tile.origin,level,sourceSha256,streetCorners) : {skipped:true,reason:'Registered corner grading did not apply'}; } },
    { name: 'streetGeometry', apply: () => { return applyStreetGeometry(group); } },
    { name: 'railCrossings', apply: () => { return applyRailCrossingFinish(group,tile.id,tile.origin,level,sourceSha256); } },
    { name: 'arrivalGrounds', apply: () => { return applyArrivalGrounds(group,tile.id,tile.origin,level,sourceSha256); } },
    { name: 'propertyTerrain', apply: () => { return applyPropertyTerrainFinish(group,tile.id,tile.origin,level,sourceSha256,propertyTerrain); } },
    { name: 'propertyGrounds', apply: () => { return applyPropertyGrounds(group,tile.id,tile.origin,level,sourceSha256); } },
    { name: 'commercialFrontageGrounds', apply: () => { return applyCommercialFrontageGrounds(group,tile.id,tile.origin,level,sourceSha256); } },
    { name: 'millYardGrounds', apply: () => { return applyMillYardGrounds(group,tile.id,tile.origin,level,sourceSha256); } },
    { name: 'institutions', apply: () => { return institutions=applyInstitutionalCompletion(group,tile.id,tile.origin,level,sourceSha256); } },
    { name: 'craftedFrontages', apply: () => { return applyCraftedFrontages(group,tile.id,tile.origin,level,institutions?.ids??[]); } },
    { name: 'landmarkCompletion', apply: () => { return applyLandmarkCompletion(group,tile.id,tile.origin,level,sourceSha256); } },
    { name: 'commercial', apply: () => { return applyCommercialCompletion(group,tile.id,tile.origin,level,sourceSha256); } },
    { name: 'evidenceBuildings', apply: () => { return applyEvidenceBuildings(group,tile.id,tile.origin,level,evidence?.buildings??[],landmarks.map(row=>({...row,material:row.material??undefined,paint:row.paint??undefined})),(batch,matched)=>buildEvidenceLandmarks(batch,landmarks.filter(row=>matched.has(row.id))),evidence?.roofs??[]); } },
    { name: 'campStructures', apply: () => { return applyCampStructures(group,tile.id,tile.origin,level,sourceSha256); } },
    { name: 'bathhouse', apply: () => { return applyBathhouse(group,tile.id,tile.origin,level,sourceSha256); } },
    { name: 'bathhouseGrounds', apply: () => { return applyBathhouseGrounds(group,tile.id,tile.origin,level,sourceSha256); } },
    { name: 'evidenceEnvironment', apply: () => { return applyEvidenceEnvironment(group,tile.id,tile.origin,level); } },
    { name: 'townHallMaterials', apply: () => { return applyTownHallMaterials(group,tile.id,level,sourceSha256); } },
    { name: 'civicRoof', apply: () => { return applyCivicRoofFinish(group,tile.id,level,sourceSha256); } },
    { name: 'churchRoof', apply: () => { return applyChurchRoofFinish(group,tile.id,level,sourceSha256); } },
    { name: 'civicDetails', apply: () => { return applyCivicDetails(group,tile.id,tile.origin,level,sourceSha256); } },
    { name: 'memorials', apply: () => { return applyMemorialDetails(group,tile.id,tile.origin,level); } },
    { name: 'additionalEnvironment', apply: () => { return applyAdditionalEnvironment(group,tile.id,tile.origin,level,additional); } },
    { name: 'facilities', apply: () => { return applyEnvironmentFacilities(group,tile.id,tile.origin,level,facilities); } },
    { name: 'dockApproaches', apply: () => { return applyDockApproaches(group,tile.id,tile.origin,level,sourceSha256); } },
    { name: 'utilities', apply: () => { return applyUtilitySiteDetails(group,tile.id,tile.origin,level,sourceSha256); } },
    { name: 'lakeLife', apply: () => { return applyLakeLife(group,tile.id,tile.origin,level,sourceSha256); } },
    { name: 'roadside', apply: () => { return applyRoadsideDetails(group,tile.id,tile.origin,level,sourceSha256,roadside); } },
  ];
  const familyByStage: Record<string,string> = {propertyTerrain:'propertyTerrain',terrain:'terrain',shoreline:'shoreline',roadPaint:'roadPaint',parking:'parking',roadMaterials:'roadMaterials',streetCornerGround:'streetCornerGround',roadCurve:'roadCurve',roadDash:'roadDash',streetCorners:'streetCorners',additionalEnvironment:'environment',facilities:'facilities',roadside:'roadside'};
  return steps.map(({name,apply}) => ({name,apply:()=>{
    const result=apply();
    if(result && typeof result==='object') {
      (group.userData.assemblyReports??={})[name]=result;
      const report=result as {rejected?:boolean;rejectedMeshes?:number},family=familyByStage[name];
      if(family && (report.rejected || (report.rejectedMeshes??0)>0)) group.userData.optionalDetailMissing=[...new Set([...(group.userData.optionalDetailMissing??[]),family])];
    }
    return result;
  }}));
}

export function assembleTileSync(group: THREE.Group, tile: TownTile, level: number, details: TileDetails): void {
  for (const step of tileAssemblySteps(group, tile, level, details)) step.apply();
}

/** Yield only between complete stages. No partially edited tile is attached to
 * the visible world; abort releases the unpublished transaction in its caller. */
export async function assembleTile(group: THREE.Group, tile: TownTile, level: number, details: TileDetails, signal: AbortSignal): Promise<Record<string, number>> {
  const timings: Record<string, number> = {}; let slice = performance.now();
  for (const step of tileAssemblySteps(group, tile, level, details)) {
    if (signal.aborted) throw new DOMException('Loading cancelled', 'AbortError');
    const start = performance.now(); step.apply(); timings[step.name] = performance.now() - start;
    if (performance.now() - slice >= 8) { await new Promise(resolve => setTimeout(resolve, 0)); slice = performance.now(); }
  }
  if (signal.aborted) throw new DOMException('Loading cancelled', 'AbortError');
  return timings;
}
