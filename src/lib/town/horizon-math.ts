/** Geometric scenery model, with no atmospheric refraction or height scaling.
 * The mean spherical Earth radius is (2a+b)/3 for WGS84, rounded to0.1m;
 * this is an explicit spherical approximation to the ellipsoid.
 * Source elevations are NAVD88 metres; the existing game subtracts 100m.
 *
 * References: NASA GSFC, "Distance to the Horizon"; NGA WGS84 parameters;
 * GDAL viewshed documentation distinguishes no refraction (coefficient1)
 * from its optional visible-light atmospheric assumption (coefficient6/7).
 * https://cdaweb.gsfc.nasa.gov/pub/documents/archived_websites/pwg.gsfc.nasa.gov/stargaze/Shorizon.htm
 * https://earth-info.nga.mil/?action=wgs84&dir=wgs84
 * https://gdal.org/en/stable/programs/gdal_raster_viewshed.html
 */
export const EARTH_RADIUS_M = 6371008.8;
export const WORLD_VERTICAL_OFFSET_M = 100;
export type HorizonPoint = readonly [x: number, y: number, z: number];
export type HorizonXZ = readonly [x: number, z: number];

function finite(value: number, name: string): number {
  if (!Number.isFinite(value)) throw new RangeError(`${name} must be finite.`);
  return value;
}

export function observerHeightASL(cameraWorldY: number): number {
  return finite(cameraWorldY, 'Camera height') + WORLD_VERTICAL_OFFSET_M;
}

/** A sea-level sphere's exact tangent range, surface arc and downward dip.
 * A viewpoint at/below sea level has no positive sea horizon in this model;
 * terrain visibility is a separate DEM line-of-sight question. */
export function geometricHorizon(heightASL: number): { tangentDistanceM: number; surfaceDistanceM: number; dipRadians: number } {
  const height = Math.max(0, finite(heightASL, 'Observer elevation'));
  const tangentDistanceM = Math.sqrt(height) * Math.sqrt(2 * EARTH_RADIUS_M + height);
  const dipRadians = Math.atan2(tangentDistanceM, EARTH_RADIUS_M);
  return { tangentDistanceM, surfaceDistanceM: EARTH_RADIUS_M * dipRadians, dipRadians };
}

/** Stable spherical sagitta for a surface-arc distance. Runtime uses local
 * projected EPSG6491 distance as that arc and retains projected X/Z, avoiding
 * distortion of the mapped coordinate frame. Omitting the horizontal sinc
 * correction is a documented regional approximation (0.037% at300km at sea
 * level), independent of DEM sampling and projection error. */
export function curvatureDrop(surfaceDistanceM: number, targetASL = 0): number {
  const distance = finite(surfaceDistanceM, 'Surface distance'), elevation = finite(targetASL, 'Target elevation');
  if (distance < 0 || distance > Math.PI * EARTH_RADIUS_M || elevation <= -EARTH_RADIUS_M) throw new RangeError('Invalid spherical surface position.');
  const sine = Math.sin(distance / (2 * EARTH_RADIUS_M));
  return finite((2 * sine * sine) * (EARTH_RADIUS_M + elevation), 'Curvature drop');
}

/** Display height after curvature, recomputed in the current observer's local
 * tangent frame; the measured DEM's horizontal coordinates remain fixed. */
export function curvedTargetHeight(targetXZ: HorizonXZ, targetWorldY: number, observerXZ: HorizonXZ): number {
  const dx = finite(targetXZ[0], 'Target X') - finite(observerXZ[0], 'Observer X');
  const dz = finite(targetXZ[1], 'Target Z') - finite(observerXZ[1], 'Observer Z');
  return finite(targetWorldY, 'Target height') - curvatureDrop(Math.hypot(dx, dz), observerHeightASL(targetWorldY));
}

/** Maximum unobstructed geometric surface range between two elevated points.
 * It is an upper bound: intervening measured terrain can hide the target. */
export function visibleTerrainRange(observerASL: number, targetASL: number): number {
  return geometricHorizon(observerASL).surfaceDistanceM + geometricHorizon(targetASL).surfaceDistanceM;
}

/** Bearing is clockwise from projected grid north: world-X east, world-Z south.
 * This angle is independent of the character/camera's yaw convention. */
export function terrainSightline(observer: HorizonPoint, target: HorizonPoint): { distanceM: number; bearingRadians: number; elevationRadians: number } {
  const dx = finite(target[0], 'Target X') - finite(observer[0], 'Observer X');
  const dz = finite(target[2], 'Target Z') - finite(observer[2], 'Observer Z');
  const distanceM = Math.hypot(dx, dz), targetY = curvedTargetHeight([target[0], target[2]], target[1], [observer[0], observer[2]]);
  const bearing = distanceM === 0 ? 0 : Math.atan2(dx, -dz);
  return { distanceM, bearingRadians: (bearing + Math.PI * 2) % (Math.PI * 2), elevationRadians: Math.atan2(targetY - finite(observer[1], 'Observer height'), distanceM) };
}

/** Conservative circular DEM-coverage check. Do not infer complete coverage
 * merely because the central viewpoint fits: flight translates the observer.
 * Maximum terrain elevation must come from the packet's actual height range. */
export function horizonCoverage(camera: HorizonPoint, maximumTerrainASL: number, coverageRadiusM: number, coverageCenter: HorizonXZ = [0, 0]) {
  const observerASL = observerHeightASL(camera[1]);
  const displacementM = Math.hypot(finite(camera[0], 'Camera X') - finite(coverageCenter[0], 'Coverage X'), finite(camera[2], 'Camera Z') - finite(coverageCenter[1], 'Coverage Z'));
  const radius = finite(coverageRadiusM, 'Coverage radius');
  if (radius < 0) throw new RangeError('Coverage radius must be nonnegative.');
  const horizon = geometricHorizon(observerASL), terrainRangeM = visibleTerrainRange(observerASL, maximumTerrainASL);
  const requiredRadiusM = displacementM + terrainRangeM;
  return { observerASL, seaHorizonM: horizon.surfaceDistanceM, seaDipRadians: horizon.dipRadians, terrainRangeM, displacementM,
    availableRadiusM: Math.max(0, radius - displacementM), requiredRadiusM, complete: requiredRadiusM <= radius };
}
