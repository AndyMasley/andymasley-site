import source from '../../../data/derived/town/historic-appearance.json';
import type { EvidenceBuilding } from './evidence-types';

type HistoricRow=(typeof source.rows)[number]&{masonryColor?:string;windowGroup?:EvidenceBuilding['historicalWindowGroup']};
const rows=new Map((source.rows as unknown as HistoricRow[]).map(r=>[r.id,r]));
export const HISTORIC_APPEARANCE_COVERAGE={homes:source.count,materials:source.materialCount,frontages:source.bayCount};

export function historicAppearance(home:EvidenceBuilding):EvidenceBuilding{
  const row=rows.get(home.id);if(!row)return home;
  const result:EvidenceBuilding={...home,historicalEvidenceIds:row.evidenceIds,frontageBays:row.frontageBays,eaveDetail:row.eaveDetail as EvidenceBuilding['eaveDetail']};
  if(row.windowGroup&&!home.documented)result.historicalWindowGroup=row.windowGroup;
  // Dated listings are more recent evidence. Their interpreted colors remain
  // untouched even when a historical form supplies the masonry family.
  if(row.material&&home.materialBasis!=='dated-listing'){
    result.material=row.material as EvidenceBuilding['material'];
    if(home.paintBasis==='inferred'&&row.material==='brick')result.paint='#9a705a';
    if(home.paintBasis==='inferred'&&row.material==='stone')result.paint='#97998d';
    if(home.materialBasis==='inferred'&&home.paintBasis==='inferred'&&row.material==='brick'&&row.masonryColor)result.paint=row.masonryColor;
  }
  return result;
}
