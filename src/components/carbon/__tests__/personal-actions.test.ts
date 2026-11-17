import { describe, it, expect } from 'vitest';
import { computeFootprint } from '@/lib/carbon/baseline';
import {
  computePersonalActions,
  getEnabledPersonalSavings,
  getMaxPersonalSavings,
  getPersonalActionCurrentValue,
  getPersonalActionSavedKg,
  getPersonalActionSavedKgWith,
} from '@/lib/carbon/personal-actions';
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

describe('overlapping driving cuts', () => {
  // DEFAULT_BASELINE: gas car, 13,500 mi/yr, suburban, US-average grid
  const actions = computePersonalActions(DEFAULT_BASELINE, computeFootprint(DEFAULT_BASELINE));
  const drivingKg = Math.round(DEFAULT_BASELINE.milesPerYear * 0.40);
  const totalSaved = (names: string[], overrides: Record<string, number> = {}) =>
    [...getEnabledPersonalSavings(actions, new Set(names), overrides).values()].reduce((sum, kg) => sum + kg, 0);

  it('never saves more than the driving emits, even with an EV on top of cutting all driving', () => {
    const allOn = ['Switch to an EV', 'Cut driving 20%', 'Walk or bike for trips under 2 miles'];
    expect(totalSaved(allOn)).toBeLessThanOrEqual(drivingKg);
    expect(totalSaved(allOn, { 'Cut driving 20%': 5 })).toBe(drivingKg); // cut driving 100%
    expect(totalSaved(['Switch to an EV', 'Bike commute (replace car for commute)', 'Walk or bike for trips under 2 miles'])).toBeLessThanOrEqual(drivingKg);
  });

  it('only lets the EV clean up the miles left after cutting', () => {
    const ev = actions.find(a => a.name === 'Switch to an EV')!;
    const saved = getEnabledPersonalSavings(actions, new Set(['Switch to an EV', 'Cut driving 20%']), {});
    expect(saved.get('Cut driving 20%')).toBe(Math.round(DEFAULT_BASELINE.milesPerYear * 0.2 * 0.40));
    expect(saved.get('Switch to an EV')).toBe(Math.round(ev.savingsKg * 0.8));
  });

  it('keeps every action at its usual value when it is the only one on', () => {
    for (const action of actions) {
      expect(getEnabledPersonalSavings(actions, new Set([action.name]), {}).get(action.name)).toBe(getPersonalActionSavedKg(action, {}));
    }
  });

  it('shows a switched-off action at what it would add alongside the ones already on', () => {
    const ev = actions.find(a => a.name === 'Switch to an EV')!;
    const cut = actions.find(a => a.name === 'Cut driving 20%')!;
    const bike = actions.find(a => a.name === 'Bike commute (replace car for commute)')!;
    expect(getPersonalActionSavedKgWith(ev, actions, new Set(['Cut driving 20%']), {})).toBe(Math.round(ev.savingsKg * 0.8));
    // a bike commute would replace the 20% cut, not stack on it
    expect(getPersonalActionSavedKgWith(bike, actions, new Set(['Cut driving 20%']), {})).toBe(bike.savingsKg);
    expect(getPersonalActionSavedKgWith(cut, actions, new Set(), {})).toBe(cut.savingsKg);
  });

  it('caps the most transport can save at what the driving emits', () => {
    const transport = actions.filter(a => a.category === 'Transport');
    expect(getMaxPersonalSavings(transport, {})).toBeLessThanOrEqual(drivingKg);
    expect(getMaxPersonalSavings(transport, { 'Cut driving 20%': 5 })).toBe(drivingKg);
  });

  it('matches the old category max where nothing overlaps', () => {
    const food = actions.filter(a => a.category === 'Food');
    const oldMax = food.filter(a => !a.exclusiveGroup).reduce((s, a) => s + a.savingsKg, 0)
      + Math.max(0, ...food.filter(a => a.exclusiveGroup === 'diet-change').map(a => a.savingsKg));
    expect(getMaxPersonalSavings(food, {})).toBe(oldMax);
  });

  it('never credits a bike commute with more miles than you drive', () => {
    const lowMileage = { ...DEFAULT_BASELINE, milesPerYear: 3000 };
    const bike = computePersonalActions(lowMileage, computeFootprint(lowMileage)).find(a => a.name === 'Bike commute (replace car for commute)');
    expect(bike!.savingsKg).toBe(Math.round(3000 * 0.40));
  });
});
