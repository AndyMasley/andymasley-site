// @vitest-environment node
import { describe, expect, it } from 'vitest';
import source from '../../../../data/derived/town/historic-appearance.json';
import { historicAppearance } from '../historic-appearance';
import type { EvidenceBuilding } from '../evidence-types';

const masonry=source.rows.find(row=>row.material==='brick')!;
const fixture:EvidenceBuilding={id:masonry.id,tileId:'0_0',address:'Historical priority fixture',
  outline:[[0,0],[10,0],[10,10],[0,10]],frames:[],base:0,floor:.3,eave:6,peak:9,
  stories:2,style:'COLONIAL',year:1880,material:'siding',paint:'#d4d8cc',roof:'gable',porch:'none',
  documented:false,evidenceIds:[],colorsDated:false,materialBasis:'inferred',paintBasis:'inferred',entry:null};

describe('dated architectural appearance priority',()=>{
  it('uses historical masonry only to improve an inferred material and palette',()=>{
    const input=structuredClone(fixture),before=structuredClone(input),result=historicAppearance(input);
    expect(result.material).toBe('brick');expect(result.paint).toBe('#9a705a');
    expect(result.historicalEvidenceIds).toEqual(masonry.evidenceIds);
    expect(result.documented).toBe(false);expect(result.colorsDated).toBe(false);
    expect(input).toEqual(before);expect(result).not.toBe(input);
  });
  it('preserves more recent listing cladding even when the older form describes masonry',()=>{
    const input={...fixture,material:'siding' as const,materialBasis:'dated-listing'};
    const result=historicAppearance(input);
    expect(result.material).toBe('siding');expect(result.paint).toBe(input.paint);
    expect(result.historicalEvidenceIds).toEqual(masonry.evidenceIds);
  });
  it('preserves a dated listing paint hint when a historical material fills an inference gap',()=>{
    const input={...fixture,paint:'#f0df8b',paintBasis:'dated-listing-palette-hint',colorsDated:true,documented:true,evidenceIds:['RES-DATED']};
    const result=historicAppearance(input);
    expect(result.material).toBe('brick');expect(result.paint).toBe('#f0df8b');
    expect(result.paintBasis).toBe(input.paintBasis);expect(result.colorsDated).toBe(true);
    expect(result.evidenceIds).toEqual(['RES-DATED']);expect(result).not.toHaveProperty('currentObserved',true);
  });
  it('returns an unknown identity unchanged without borrowing neighboring evidence',()=>{
    const input={...fixture,id:'unmatched-test-property'};expect(historicAppearance(input)).toBe(input);
  });
  it('carries the documented yellow pressed-brick fabric only into an inferred finish at 768 School',()=>{
    const input={...fixture,id:'168288_865127'},result=historicAppearance(input);
    expect(result.material).toBe('brick');expect(result.paint).toBe('#b49b69');
    expect(result.historicalEvidenceIds).toEqual(['WEB.371']);expect(result.documented).toBe(false);
    for(const protectedInput of[
      {...input,paint:'#eff0e9',paintBasis:'dated-listing-palette-hint',colorsDated:true},
      {...input,material:'siding' as const,materialBasis:'dated-listing'},
      {...input,material:'brick' as const,materialBasis:'observed'},
    ]){
      const protectedResult=historicAppearance(protectedInput);
      expect(protectedResult.paint).not.toBe('#b49b69');
      if(protectedInput.paintBasis!=='inferred')expect(protectedResult.paint).toBe(protectedInput.paint);
    }
    expect(historicAppearance({...input,id:'unmatched-neighbor'})).toEqual({...input,id:'unmatched-neighbor'});
  });
  it('limits dated triple 12-over-1 guidance to 790 School without overriding newer listed exteriors',()=>{
    const input={...fixture,id:'168330_865062'},result=historicAppearance(input);
    expect(result.historicalWindowGroup).toEqual({count:3,sash:'12-over-1'});
    expect(result.historicalEvidenceIds).toEqual(['WEB.373']);expect(result.frontageBays).toBe(3);
    expect(historicAppearance({...input,documented:true,evidenceIds:['LATER-LISTING']}).historicalWindowGroup).toBeUndefined();
    expect(historicAppearance({...input,id:'168251_865177'}).historicalWindowGroup).toBeUndefined();
    expect(input).not.toHaveProperty('historicalWindowGroup');
  });
  it('keeps every historical source explicitly dated and unobserved in the current town',()=>{
    expect(source.rows).toHaveLength(source.count);
    expect(new Set(source.rows.map(row=>row.id)).size).toBe(source.count);
    for(const row of source.rows){expect(row.currentObserved,row.id).toBe(false);expect(row.sourceYear,row.id).toBeLessThan(2026);}
  });
});
