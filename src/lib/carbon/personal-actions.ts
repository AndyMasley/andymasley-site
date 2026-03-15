/**
 * Personal actions computation — categorized actions with savings estimates.
 *
 * Actions are organized into categories: Transport, Home, Food, Digital, Purchases, Flights.
 * Each action includes a category, savings estimate, applicability check, and note.
 */

import type { BaselineInputs, FootprintModel } from './types';
import { getGridIntensity } from './grid';

export interface PersonalAction {
  name: string;
  savingsKg: number;
  category: string;
  applicable: boolean;
  note: string;
  /** Actions in the same exclusive group are mutually exclusive — only one can be selected at a time */
  exclusiveGroup?: string;
}

export function computePersonalActions(baseline: BaselineInputs, footprint: FootprintModel): PersonalAction[] {
  const gridRate = getGridIntensity(baseline.state);

  const transportMiles: Record<string, number> = {
    urban: 8000,
    suburban: 13500,
    rural: 16000,
  };
  const miles = transportMiles[baseline.urbanForm] ?? 13500;
  const gasKgPerMile = 0.40;
  const hybridKgPerMile = 8.89 / 45;
  const evKgPerMile = 0.32 * gridRate;
  // Use the actual per-mile rate for whatever the user drives
  const userKgPerMile: Record<string, number> = {
    gas: gasKgPerMile,
    hybrid: hybridKgPerMile,
    ev: evKgPerMile,
    none: 0,
  };
  const drivingRate = userKgPerMile[baseline.carOwnership] ?? gasKgPerMile;

  const foodBucket = footprint.buckets.find(b => b.bucketId === 'food');
  const foodKg = foodBucket?.kgCO2ePerYear ?? 2500;

  const goodsBucket = footprint.buckets.find(b => b.bucketId === 'goods-and-services');
  const goodsKg = goodsBucket?.kgCO2ePerYear ?? 1200;

  const dietKgTable: Record<string, number> = {
    average: 2500,
    'heavy-meat': 3200,
    'light-meat': 2000,
    pescatarian: 1700,
    vegetarian: 1500,
    vegan: 1050,
  };
  const currentDietKg = dietKgTable[baseline.dietType] ?? 2500;

  const actions: PersonalAction[] = [
    // ── Transport ──
    {
      name: 'Switch to an EV',
      savingsKg: Math.round(
        baseline.carOwnership === 'gas'
          ? miles * (gasKgPerMile - 0.32 * gridRate)
          : baseline.carOwnership === 'hybrid'
            ? miles * (8.89 / 45 - 0.32 * gridRate)
            : 0
      ),
      category: 'Transport',
      applicable: baseline.carOwnership === 'gas' || baseline.carOwnership === 'hybrid',
      note: 'Savings depend on your grid — cleaner grids make EVs better',
    },
    {
      name: 'Cut driving 20%',
      savingsKg: baseline.carOwnership !== 'none'
        ? Math.round(miles * 0.2 * drivingRate)
        : 0,
      category: 'Transport',
      applicable: baseline.carOwnership !== 'none',
      note: 'Work from home, combine trips, or bike for short errands',
      exclusiveGroup: 'driving-reduction',
    },
    {
      name: 'Cut driving 50%',
      savingsKg: baseline.carOwnership !== 'none'
        ? Math.round(miles * 0.5 * drivingRate)
        : 0,
      category: 'Transport',
      applicable: baseline.carOwnership !== 'none',
      note: 'Major lifestyle shift — bike commute + transit for most trips',
      exclusiveGroup: 'driving-reduction',
    },
    {
      name: 'Bike commute (replace car for commute)',
      savingsKg: baseline.carOwnership !== 'none'
        ? Math.round(5000 * drivingRate) // ~5000 mi/yr commute
        : 0,
      category: 'Transport',
      applicable: baseline.carOwnership !== 'none' && (baseline.urbanForm === 'urban' || baseline.urbanForm === 'suburban'),
      note: 'Assumes ~5,000 miles/yr commute replaced by bike',
      exclusiveGroup: 'driving-reduction',
    },
    {
      name: 'Use public transit instead of driving',
      savingsKg: baseline.carOwnership !== 'none'
        ? Math.round(miles * 0.6 * (drivingRate - 0.05)) // transit emits ~0.05 kg/mi
        : 0,
      category: 'Transport',
      applicable: baseline.carOwnership !== 'none' && baseline.urbanForm === 'urban',
      note: 'Replace 60% of driving with transit (urban areas only)',
      exclusiveGroup: 'driving-reduction',
    },
    {
      name: 'Reduce ride-hailing/taxi 50%',
      savingsKg: Math.round(baseline.urbanForm === 'urban' ? 300 : 150),
      category: 'Transport',
      applicable: baseline.carOwnership === 'none',
      note: 'Walk, bike, or take transit instead of Uber/Lyft',
    },
    {
      name: 'Walk or bike for trips under 2 miles',
      savingsKg: Math.round(baseline.urbanForm === 'urban' ? 200 : 100),
      category: 'Transport',
      applicable: true,
      note: 'Short trips add up — 40% of US car trips are under 2 miles',
    },

    // ── Home ──
    {
      name: 'Install rooftop solar (7 kW)',
      savingsKg: Math.round((10000 * gridRate) / baseline.householdSize),
      category: 'Home',
      applicable: baseline.housingType !== 'apartment',
      note: 'Savings scale with your grid intensity',
    },
    {
      name: 'Replace gas furnace with heat pump',
      savingsKg: Math.round((500 * 5.3 - 3500 * gridRate) / baseline.householdSize),
      category: 'Home',
      applicable: baseline.housingType !== 'apartment',
      note: 'Saves ~500 therms gas, adds ~3,500 kWh electricity. Bigger savings on clean grids.',
    },
    {
      name: 'Reduce thermostat 2\u00B0F in winter',
      savingsKg: Math.round(200 / baseline.householdSize),
      category: 'Home',
      applicable: baseline.urbanForm !== 'urban' || baseline.housingType !== 'apartment',
      note: 'Saves ~3% of heating energy per degree',
    },
    {
      name: 'Switch to LED lighting',
      savingsKg: Math.round((300 * gridRate) / baseline.householdSize),
      category: 'Home',
      applicable: true,
      note: 'Replace all incandescent/CFL bulbs with LEDs',
    },
    {
      name: 'Air-dry clothes (no dryer)',
      savingsKg: Math.round((400 * gridRate) / baseline.householdSize),
      category: 'Home',
      applicable: true,
      note: 'Dryers use ~400 kWh/yr; line-drying eliminates this',
    },
    {
      name: 'Weatherize/insulate home',
      savingsKg: Math.round(500 / baseline.householdSize),
      category: 'Home',
      applicable: baseline.housingType !== 'apartment',
      note: 'Sealing drafts and adding insulation cuts heating/cooling ~15%',
    },

    // ── Food ──
    {
      name: 'Go vegan',
      savingsKg: Math.round(currentDietKg - 1050),
      category: 'Food',
      applicable: baseline.dietType !== 'vegan',
      note: 'Largest food-related change available',
      exclusiveGroup: 'diet-change',
    },
    {
      name: 'Go vegetarian',
      savingsKg: Math.round(currentDietKg - 1500),
      category: 'Food',
      applicable: baseline.dietType !== 'vegan' && baseline.dietType !== 'vegetarian',
      note: 'More achievable than vegan for most people',
      exclusiveGroup: 'diet-change',
    },
    {
      name: 'Cut beef by half',
      savingsKg: 450, // beef is ~900 kg of an average diet; halving saves ~450
      category: 'Food',
      applicable: baseline.dietType === 'average' || baseline.dietType === 'heavy-meat',
      note: 'Beef is the most emission-intensive common food',
      exclusiveGroup: 'diet-change',
    },
    {
      name: 'Cut food waste by half',
      savingsKg: Math.round(foodKg * 0.10 * 0.5), // ~10% of food emissions are from avoidable waste
      category: 'Food',
      applicable: true,
      note: 'Average American wastes ~30% of food; halving saves ~7.5% of food emissions',
    },
    {
      name: 'Buy local/seasonal produce',
      savingsKg: Math.round(150),
      category: 'Food',
      applicable: true,
      note: 'Reduces transport emissions; effect is moderate compared to diet changes',
    },

    // ── Digital ──
    {
      name: 'Stop using AI chatbots',
      savingsKg: 5,
      category: 'Digital',
      applicable: true,
      note: '~50 queries/day × 0.28 g CO₂ each = ~5 kg/yr. Negligible.',
    },
    {
      name: 'Reduce streaming by half',
      savingsKg: 17,
      category: 'Digital',
      applicable: true,
      note: 'HD streaming uses ~0.1 kWh per hour including data centers',
    },

    // ── Purchases ──
    {
      name: 'Buy 50% less clothing',
      savingsKg: Math.round(goodsKg * 0.12), // clothing is ~12% of goods emissions
      category: 'Purchases',
      applicable: true,
      note: 'Fast fashion has high embodied carbon; buying less has outsize impact',
    },
    {
      name: 'Buy used instead of new electronics',
      savingsKg: Math.round(goodsKg * 0.08), // electronics ~8% of goods emissions
      category: 'Purchases',
      applicable: true,
      note: 'Manufacturing new electronics is carbon-intensive',
    },
    {
      name: 'Reduce general spending 15%',
      savingsKg: Math.round(goodsKg * 0.15),
      category: 'Purchases',
      applicable: true,
      note: 'Rough estimate — embodied emissions vary hugely by product',
    },

    // ── Flights ──
    {
      name: 'Eliminate one transatlantic flight',
      savingsKg: Math.round(6900 * 0.255),
      category: 'Flights',
      applicable: baseline.flightsPerYear > 0,
      note: 'One of the highest-impact single actions',
      exclusiveGroup: 'flight-reduction',
    },
    {
      name: 'Eliminate one domestic flight',
      savingsKg: Math.round(2200 * 0.255),
      category: 'Flights',
      applicable: baseline.flightsPerYear > 0,
      note: 'Average domestic round-trip: ~2,200 miles',
      exclusiveGroup: 'flight-reduction',
    },
    {
      name: 'Eliminate all flights',
      savingsKg: Math.round(baseline.flightsPerYear * 2200 * 0.255),
      category: 'Flights',
      applicable: baseline.flightsPerYear > 1,
      note: `Eliminates all ${baseline.flightsPerYear} flights per year`,
      exclusiveGroup: 'flight-reduction',
    },
  ];

  const CATEGORY_ORDER = ['Transport', 'Home', 'Food', 'Digital', 'Purchases', 'Flights'];

  return actions
    .filter(a => a.applicable && a.savingsKg > 0)
    .sort((a, b) => {
      const catA = CATEGORY_ORDER.indexOf(a.category);
      const catB = CATEGORY_ORDER.indexOf(b.category);
      if (catA !== catB) return catA - catB;
      return b.savingsKg - a.savingsKg;
    });
}

