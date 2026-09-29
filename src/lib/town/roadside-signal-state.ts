/** Authored visual timing, not an observation of Webster's real controllers.
 * Both approach groups share a clock and offset, including two all-red gaps. */
export const ROADSIDE_SIGNAL_CYCLE_SECONDS = 52;
export const ROADSIDE_THREE_PHASE_CYCLE_SECONDS = 75;
export const roadsideSignalClock = { value: 0 };
export type SignalAspect = 'red' | 'amber' | 'green';

export function updateRoadsideSignalTime(timeSeconds: number): void {
  // A common multiple preserves both cycle lengths without large GPU floats.
  if (Number.isFinite(timeSeconds)) roadsideSignalClock.value = ((timeSeconds % 3900) + 3900) % 3900;
}

export function signalAspect(group: 0 | 1 | 2, timeSeconds: number, offsetSeconds = 0, phases: 2 | 3 = 2): SignalAspect {
  const cycle = phases === 3 ? ROADSIDE_THREE_PHASE_CYCLE_SECONDS : ROADSIDE_SIGNAL_CYCLE_SECONDS;
  const phase = ((timeSeconds + offsetSeconds) % cycle + cycle) % cycle;
  if (group === 0) return phase < 24 ? 'green' : phase < 27 ? 'amber' : 'red';
  if (group === 2) return phases === 3 && phase >= 52 && phase < 70 ? 'green' : phases === 3 && phase >= 70 && phase < 73 ? 'amber' : 'red';
  return phase >= 29 && phase < 47 ? 'green' : phase >= 47 && phase < 50 ? 'amber' : 'red';
}
