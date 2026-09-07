// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import source from '../../../../data/derived/town/historic-architecture-evidence.json';
import roofIndex from '../../../../data/derived/town/evidence-roofs-index.json';
import residentialIndex from '../../../../data/derived/town/residential-evidence-index.json';
import type { EvidenceBuilding } from '../evidence-types';
import { planDistanceSquared } from '../evidence-buildings';

const byMhc=(id:string)=>source.rows.find(row=>row.mhcIds.includes(id))!;
type Dormer={frame:{start:number[];tangent:number[];outward:number[];width:number};bottom:number;eave:number;peak:number;depth:number;window:{u:number;bottom:number;width:number;height:number};roofIntersection:{frontHeights:number[];rearHeight:number;overlapVolumeM3:number};sourceYear:number;evidenceIds:string[];countBasis:string;currentExteriorObserved:boolean};
type Roof={id:string;kind:string;roofShape:string;sourceYear?:number;sourceWingCount?:number;currentExteriorObserved?:boolean;tileId:string;origin:number[];outline:number[][];floor:number;eave:number;peak:number;dormers?:Dormer[];runtimeSliverRepair?:{toleranceM:number;originalFailureCount:number;volumeChangeM3:number};frameEaves?:number[];frameOutsets?:number[];frameOutsetCorrections?:Array<{frameIndex:number;maximumSourceWallDeparture:number;outset:number;clearance:number}>;wingHeights?:Array<{eave:number;peak:number;originalEave:number;originalPeak:number;principal:boolean;sourceFloors?:number}>;body:Array<{role:string;position:string;normal:string}>};
const roofs=Object.values(roofIndex.tiles).flatMap(tile=>JSON.parse(readFileSync(new URL(`../../../../public${tile.url}`,import.meta.url),'utf8')) as Roof[]);
function roofHeightAt(row:Roof,x:number,z:number):number {
  let top=-Infinity;x-=row.origin[0];z-=row.origin[2];
  for(const chunk of row.body){if(chunk.role!=='roof')continue;const bytes=Buffer.from(chunk.position,'base64'),p=new Float32Array(bytes.buffer,bytes.byteOffset,bytes.byteLength/4);
    for(let i=0;i<p.length;i+=9){const ax=p[i],az=p[i+2],bx=p[i+3],bz=p[i+5],cx=p[i+6],cz=p[i+8],det=(bz-cz)*(ax-cx)+(cx-bx)*(az-cz);if(Math.abs(det)<1e-8)continue;const a=((bz-cz)*(x-cx)+(cx-bx)*(z-cz))/det,b=((cz-az)*(x-cx)+(ax-cx)*(z-cz))/det,c=1-a-b;if(Math.min(a,b,c)>=-1e-6)top=Math.max(top,a*p[i+1]+b*p[i+4]+c*p[i+7]);}
  }
  return top;
}

describe('historical architectural evidence gates',()=>{
  it('audits every indexed form and only approves dated, address-checked principal footprints',()=>{
    expect(source.audit).toHaveLength(428);expect(new Set(source.audit.map(row=>row.mhcId)).size).toBe(428);
    expect(source.rows.length).toBeGreaterThan(150);expect(source.counts.conversionStyle).toBeGreaterThan(40);
    for(const row of source.rows){expect(row.gates.pointInsideFootprint).toBe(true);expect(row.gates.principalStructure).toBe(true);expect(row.gates.demolished).toBe(false);expect(row.gates.replacementAfterDescription).toBe(false);expect(row.gates.currentExteriorObserved).toBe(false);expect(row.currentSource.assessorYearBuilt).toBeLessThanOrEqual(row.sourceYear);expect(row.reliability.address).toMatch(/^(exact_or_overlapping_number|street_only)$/);expect(row.evidence.length).toBeGreaterThan(0);}
    expect(source.audit.filter(row=>row.status==='demolished_gate')).toHaveLength(57);
  });
  it('does not resurrect Corbin, map a rear addition onto the whole Bell house, or trust conflicting construction dates',()=>{
    expect(source.rows.some(row=>row.mhcIds.includes('WEB.113'))).toBe(false);
    expect(byMhc('WEB.36').roofShape).toBeNull();
    expect(source.audit.find(row=>row.mhcId==='WEB.1')?.status).toBe('review_required');
    expect(source.audit.find(row=>row.mhcId==='WEB.1')?.reasons).toContain('construction_dates_conflict_over_65_years');
    expect(source.audit.find(row=>row.mhcId==='WEB.160')?.reasons).toContain('parcel_building_postdates_description');
  });
  it('uses the source-specific old and new roof descriptions without silently merging their dates',()=>{
    expect(byMhc('WEB.44').roofShape).toBe('gable');expect(byMhc('WEB.44').sourceYear).toBe(2000);
    expect(byMhc('WEB.67').roofShape).toBe('mansard');expect(byMhc('WEB.67').sourceYear).toBe(1978);
    expect(byMhc('WEB.70').sourceYear).toBe(2023);
    for(const mid of ['WEB.346','WEB.347','WEB.348','WEB.359','WEB.361','WEB.362']){const row=byMhc(mid);expect(row.roofShape).toBe('hip');expect(row.stories).toBe(3);expect(row.sourceYear).toBe(2000);}
    expect(byMhc('WEB.376').roofShape).toBe('gambrel');expect(byMhc('WEB.376').roofVariant).toBe('jerkinhead');
  });
  it('keeps actual historical roof packets tied to approved evidence and preserves compound wings',()=>{
    const historical=roofs.filter(row=>row.kind==='dated_historical_roof_inference');expect(historical).toHaveLength(25);
    for(const row of historical){const evidence=source.rows.find(e=>e.structId===row.id)!;expect(evidence.allowRoofFormInference).toBe(true);expect(row.roofShape).toBe(evidence.roofShape);expect(row.sourceYear).toBe(evidence.sourceYear);expect(row.currentExteriorObserved).toBe(false);}
    expect(historical.find(row=>row.id==='168731_867801')?.roofShape).toBe('mansard');expect(historical.find(row=>row.id==='168731_867801')?.sourceWingCount).toBe(3);
    expect(historical.find(row=>row.id==='168415_865057')?.roofShape).toBe('gambrel');
    expect(historical.some(row=>row.id==='168266_865805')).toBe(false);
  });
  it('keeps real low wings below the main house and supplies matching lower window limits',()=>{
    for(const id of ['168486_866159','168499_866202','168748_867893','168288_865127']){
      const row=roofs.find(row=>row.id===id)!,tile=residentialIndex.tiles[row.tileId as keyof typeof residentialIndex.tiles];
      const profile=(JSON.parse(readFileSync(new URL(`../../../../public${tile.url}`,import.meta.url),'utf8')).buildings as EvidenceBuilding[]).find(home=>home.id===id)!;
      expect(row.frameEaves).toHaveLength(profile.frames.length);
      const lower=row.wingHeights!.filter(wing=>wing.sourceFloors===1);expect(lower.length).toBeGreaterThan(0);
      for(const wing of lower){expect(wing.eave).toBeLessThanOrEqual(wing.originalEave+.001);expect(wing.peak).toBeLessThanOrEqual(wing.originalPeak+.001);expect(wing.eave).toBeLessThan(row.eave-2);}
      const lowFrame=row.frameEaves!.findIndex(eave=>eave<row.eave-2);expect(lowFrame).toBeGreaterThanOrEqual(0);
      const edge=profile.frames[lowFrame],x=edge.start[0]+edge.tangent[0]*edge.width/2-edge.outward[0]*.04,north=edge.start[1]+edge.tangent[1]*edge.width/2-edge.outward[1]*.04;
      const actualTop=roofHeightAt(row,x,-north);expect(Number.isFinite(actualTop),id).toBe(true);expect(actualTop,id).toBeLessThan(row.eave-.8);expect(actualTop,id).toBeLessThanOrEqual(Math.max(...lower.map(wing=>wing.originalPeak))+.01);
    }
  });
  it('puts the two discrepant facade frames outside the original wall along their full length',()=>{
    const corrected=roofs.filter(row=>row.frameOutsetCorrections?.length);expect(corrected.map(row=>row.id).sort()).toEqual(['168288_865127','168748_867893']);
    for(const row of corrected){
      const tile=residentialIndex.tiles[row.tileId as keyof typeof residentialIndex.tiles],profile=(JSON.parse(readFileSync(new URL(`../../../../public${tile.url}`,import.meta.url),'utf8')).buildings as EvidenceBuilding[]).find(home=>home.id===row.id)!;
      expect(row.frameOutsets).toHaveLength(profile.frames.length);
      for(const correction of row.frameOutsetCorrections!){
        expect(correction.outset-correction.maximumSourceWallDeparture).toBeCloseTo(.03,9);expect(correction.outset).toBeGreaterThan(.13);expect(correction.outset).toBeLessThan(.16);
        const f=profile.frames[correction.frameIndex];
        for(let u=.03;u<f.width-.03;u+=.04){const x=f.start[0]+f.tangent[0]*u+f.outward[0]*(correction.outset+.08),y=f.start[1]+f.tangent[1]*u+f.outward[1]*(correction.outset+.08);expect(planDistanceSquared(row.outline,x,y),row.id).toBeGreaterThan(1e-8);}
      }
    }
  });
  it('joins documented WEB.67 dormers through the mansard below its measured ridge',()=>{
    const withDormers=roofs.filter(row=>row.dormers?.length);expect(withDormers.map(row=>row.id)).toEqual(['168731_867801']);
    const row=withDormers[0];expect(row.dormers).toHaveLength(3);
    expect(byMhc('WEB.67').evidence.some(fact=>fact.statement.includes('ornamentation over dormers'))).toBe(true);
    const sill=row.dormers![0].window.bottom;
    for(const dormer of row.dormers!){
      expect(dormer.currentExteriorObserved).toBe(false);expect(dormer.sourceYear).toBe(1978);expect(dormer.evidenceIds).toContain('macris-forms-001-073:LND-WEB-67');expect(dormer.countBasis).toContain('form documents dormers but not their count');
      expect(dormer.window.bottom).toBeCloseTo(sill,8);expect(dormer.window.bottom+dormer.window.height).toBeLessThan(dormer.eave);expect(dormer.peak).toBeLessThan(row.peak-.25);
      expect(dormer.bottom).toBeLessThan(Math.min(...dormer.roofIntersection.frontHeights)-.15);expect(dormer.roofIntersection.rearHeight).toBeGreaterThan(dormer.peak+.05);expect(dormer.roofIntersection.overlapVolumeM3).toBeGreaterThan(.25);
      const frame=dormer.frame;
      for(const u of [dormer.window.u-dormer.window.width/2,dormer.window.u,dormer.window.u+dormer.window.width/2]){
        const x=frame.start[0]+frame.tangent[0]*u,north=frame.start[1]+frame.tangent[1]*u;
        // The actual exported roof rises into the dormer behind its face; just
        // outside, the mansard remains below the glass rather than burying it.
        const inside=roofHeightAt(row,x-frame.outward[0]*.04,-north+frame.outward[1]*.04),outside=roofHeightAt(row,x+frame.outward[0]*.08,-north-frame.outward[1]*.08);
        expect(Number.isFinite(inside)).toBe(true);expect(Number.isFinite(outside)).toBe(true);expect(inside).toBeGreaterThan(dormer.eave);expect(outside).toBeLessThan(dormer.window.bottom-.1);
        expect(planDistanceSquared(row.outline,x-frame.outward[0]*dormer.depth,north-frame.outward[1]*dormer.depth)).toBe(0);
      }
    }
  });
  it('keeps every roof triangle outward after actual owner-tile Float32 translation',()=>{
    const repaired=roofs.filter(row=>row.runtimeSliverRepair);expect(repaired.map(row=>row.id).sort()).toEqual(['168811_865874','169322_869702','171720_866165','172716_864087']);
    for(const row of repaired){expect(row.runtimeSliverRepair!.toleranceM).toBe(.0005);expect(row.runtimeSliverRepair!.originalFailureCount).toBeGreaterThan(0);expect(Math.abs(row.runtimeSliverRepair!.volumeChangeM3)).toBeLessThan(.0002);}
    for(const row of roofs){
      const [tileX,tileY]=row.tileId.split('_').map(Number),offset=[row.origin[0]-tileX*250,0,row.origin[2]+tileY*250];
      for(const chunk of row.body){
        const pBytes=Buffer.from(chunk.position,'base64'),nBytes=Buffer.from(chunk.normal,'base64'),p=new Float32Array(pBytes.buffer,pBytes.byteOffset,pBytes.byteLength/4),n=new Float32Array(nBytes.buffer,nBytes.byteOffset,nBytes.byteLength/4);
        for(let i=0;i<p.length;i+=9){
          const a=[0,1,2].map(k=>Math.fround(p[i+k]+offset[k])),b=[0,1,2].map(k=>Math.fround(p[i+3+k]+offset[k])-a[k]),c=[0,1,2].map(k=>Math.fround(p[i+6+k]+offset[k])-a[k]);
          const cross=[b[1]*c[2]-b[2]*c[1],b[2]*c[0]-b[0]*c[2],b[0]*c[1]-b[1]*c[0]];
          expect(cross[0]*n[i]+cross[1]*n[i+1]+cross[2]*n[i+2],`${row.id} ${chunk.role} triangle${i/9}`).toBeGreaterThan(0);
        }
      }
    }
  });
});
