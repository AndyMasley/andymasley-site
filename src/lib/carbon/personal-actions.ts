/**
 * Personal actions computation — shared between Calculator (top 3) and PersonalChanges (full list).
 *
 * Extracted from PersonalChanges.tsx so the Calculator can display the top 3
 * actions inline without importing the full PersonalChanges component.
 */

import type { BaselineInputs, FootprintModel } from './types';
import { getGridIntensity } from './grid';

export type Friction = 'low' | 'medium' | 'high';

export interface PersonalAction {
  name: string;
  savingsKg: number;
  friction: Friction;
  upfrontCost: string;
  certainty: string;
  applicable: boolean;
  note: string;
}

export function computePersonalActions(baseline: BaselineInputs, footprint: FootprintModel): PersonalAction[] {
  const gridRate = getGridIntensity(baseline.state);

  const actions: PersonalAction[] = [
    {
      name: 'Switch to an EV',
      savingsKg: Math.round(
        (baseline.carOwnership === 'gas' ? 13500 * (8.89 / 25.4 - 0.3 * gridRate) : 0)
      ),
      friction: 'high',
      upfrontCost: '$25,000–$45,000 (new)',
      certainty: 'High — well-measured per-mile savings',
      applicable: baseline.carOwnership === 'gas' || baseline.carOwnership === 'hybrid',
      note: 'Savings depend on your grid — cleaner grids make EVs better',
    },
    {
      name: 'Install rooftop solar (7 kW)',
      savingsKg: Math.round((10000 * gridRate) / baseline.householdSize),
      friction: 'medium',
      upfrontCost: '$15,000–$25,000 (before tax credit)',
      certainty: 'High — production is predictable from location',
      applicable: baseline.housingType !== 'apartment',
      note: 'Savings scale with your grid intensity',
    },
    {
      name: 'Go vegan',
      savingsKg: baseline.dietType === 'average' ? 1450 : baseline.dietType === 'heavy-meat' ? 2150 : 0,
      friction: 'high',
      upfrontCost: '$0 (may save money)',
      certainty: 'Medium — varies with specific food choices',
      applicable: baseline.dietType === 'average' || baseline.dietType === 'heavy-meat' || baseline.dietType === 'light-meat',
      note: 'Largest food-related change available',
    },
    {
      name: 'Go vegetarian',
      savingsKg: baseline.dietType === 'average' ? 800 : baseline.dietType === 'heavy-meat' ? 1500 : 0,
      friction: 'medium',
      upfrontCost: '$0',
      certainty: 'Medium — varies with specific food choices',
      applicable: baseline.dietType === 'average' || baseline.dietType === 'heavy-meat',
      note: 'More achievable than vegan for most people',
    },
    {
      name: 'Replace gas furnace with heat pump',
      savingsKg: Math.round((500 * 5.3 - 3000 * gridRate) / baseline.householdSize),
      friction: 'medium',
      upfrontCost: '$8,000–$15,000 (before rebates)',
      certainty: 'High — engineering-based estimate',
      applicable: baseline.housingType !== 'apartment',
      note: 'Bigger savings on clean grids; may increase bills on coal-heavy grids',
    },
    {
      name: 'Eliminate one transatlantic flight',
      savingsKg: Math.round(4400 * 0.255),
      friction: 'medium',
      upfrontCost: '$0 (saves money)',
      certainty: 'High — well-measured per-mile rate',
      applicable: baseline.flightsPerYear > 0,
      note: 'One of the highest-impact single actions',
    },
    {
      name: 'Cut driving 20% (WFH, bike, transit)',
      savingsKg: baseline.carOwnership !== 'none'
        ? Math.round(13500 * 0.2 * 8.89 / 25.4)
        : 0,
      friction: 'low',
      upfrontCost: '$0 (saves money)',
      certainty: 'High — proportional to mileage reduction',
      applicable: baseline.carOwnership !== 'none',
      note: 'Often the lowest-friction transport change',
    },
    {
      name: 'Reduce spending 15%',
      savingsKg: Math.round((footprint.buckets.find(b => b.bucketId === 'goods-and-services')?.kgCO2ePerYear ?? 0) * 0.15),
      friction: 'low',
      upfrontCost: '$0 (saves money)',
      certainty: 'Low — spending-emissions link is approximate',
      applicable: true,
      note: 'Rough estimate — embodied emissions vary hugely by product',
    },
  ];

  return actions
    .filter(a => a.applicable && a.savingsKg > 0)
    .sort((a, b) => b.savingsKg - a.savingsKg);
}
