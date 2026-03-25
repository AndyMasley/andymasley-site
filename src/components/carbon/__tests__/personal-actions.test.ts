import { describe, it, expect } from 'vitest';
import { computeFootprint } from '@/lib/carbon/baseline';
import { computePersonalActions, getPersonalActionCurrentValue, getPersonalActionSavedKg } from '@/lib/carbon/personal-actions';
import { DEFAULT_BASELINE } from '@/lib/carbon/types';

describe('computePersonalActions', () => {
  it('keeps zero-count flight types editable without adding fake savings', () => {
    const baseline = {
      ...DEFAULT_BASELINE,
      flightsPerYear: 2,
      transatlanticFlightsPerYear: 0,
      transpacificFlightsPerYear: 0,
      domesticFlightsPerYear: 2,
    };

    const actions = computePersonalActions(baseline, computeFootprint(baseline));
    const transatlantic = actions.find(action => action.name === 'Eliminate one transatlantic flight');
    const transpacific = actions.find(action => action.name === 'Eliminate one transpacific flight');
    const domestic = actions.find(action => action.name === 'Eliminate one domestic flight');

    expect(transatlantic).toBeDefined();
    expect(transpacific).toBeDefined();
    expect(domestic).toBeDefined();
    expect(getPersonalActionCurrentValue(transatlantic!, {})).toBe(0);
    expect(getPersonalActionCurrentValue(transpacific!, {})).toBe(0);
    expect(getPersonalActionSavedKg(transatlantic!, {})).toBe(0);
    expect(getPersonalActionSavedKg(transpacific!, {})).toBe(0);
    expect(getPersonalActionCurrentValue(domestic!, {})).toBe(1);
    expect(getPersonalActionSavedKg(domestic!, {})).toBe(domestic!.savingsKg);
  });

  it('keeps total flight savings equal to the sum of the available flight cuts', () => {
    const baseline = {
      ...DEFAULT_BASELINE,
      flightsPerYear: 3,
      transatlanticFlightsPerYear: 1,
      transpacificFlightsPerYear: 0,
      domesticFlightsPerYear: 2,
    };

    const actions = computePersonalActions(baseline, computeFootprint(baseline));
    const flights = actions.filter(action => action.category === 'Flights');
    const allFlights = flights.find(action => action.name === 'Eliminate all flights');
    const individualTotal = flights
      .filter(action => action.name !== 'Eliminate all flights')
      .reduce((sum, action) => sum + action.savingsKg * (action.inlineParam2?.defaultVal ?? 1), 0);

    expect(allFlights).toBeDefined();
    expect(allFlights!.savingsKg).toBe(individualTotal);
  });
});
