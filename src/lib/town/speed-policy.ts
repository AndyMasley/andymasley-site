export const METRES_PER_SECOND_PER_MPH = 0.44704;

export interface RoadSpeedData {
  speed_kph?: number;
  speed_status?: unknown;
}

/** The inventory converted posted integer mph values to rounded km/h. */
export function roadSpeedLimitMps(road: RoadSpeedData): number {
  const kph = Number(road.speed_kph);
  const metresPerSecond = Number.isFinite(kph) && kph > 0 ? kph / 3.6 : 40 / 3.6;
  if (road.speed_status === 'posted inventory mph converted to km/h') {
    const mph = metresPerSecond / METRES_PER_SECOND_PER_MPH;
    const postedMph = Math.round(mph);
    if (postedMph > 0 && Math.abs(mph - postedMph) < 0.01) return postedMph * METRES_PER_SECOND_PER_MPH;
  }
  return metresPerSecond;
}

/** A legacy global cruise setting must never keep the car below its road limit. */
export function cruiseCeilingMps(road: RoadSpeedData, requestedMaximumMph?: number): number {
  const limit = roadSpeedLimitMps(road);
  return Number.isFinite(requestedMaximumMph) && requestedMaximumMph! > 0
    ? Math.max(limit, requestedMaximumMph! * METRES_PER_SECOND_PER_MPH)
    : limit;
}
