import { describe, it, expect } from 'vitest';
import { computeFootprint } from '@/lib/carbon/baseline';
import { computePersonalActions } from '@/lib/carbon/personal-actions';
import { DEFAULT_BASELINE } from '@/lib/carbon/types';

describe('computePersonalActions', () => {
  it('does not offer impossible zero-count flight-type cuts', () => {
    const baseline = {
      ...DEFAULT_BASELINE,
      flightsPerYear: 2,
      transatlanticFlightsPerYear: 0,
      transpacificFlightsPerYear: 0,
      domesticFlightsPerYear: 2,
    };

    const actions = computePersonalActions(baseline, computeFootprint(baseline));
    const names = actions.map(action => action.name);

    expect(names).not.toContain('Eliminate one transatlantic flight');
    expect(names).not.toContain('Eliminate one transpacific flight');
    expect(names).toContain('Eliminate one domestic flight');
    expect(names).toContain('Eliminate all flights');
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
