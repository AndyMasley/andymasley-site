/** Native acceptance must distinguish finite fallback geometry from a successfully
 * applied registered correction. This reads reports only; no scene mutation. */
export function auditAssemblyReports(userData: Record<string, unknown>, supplied: Record<string, unknown>) {
  const reports: Record<string, any> = { ...(userData.assemblyReports as Record<string, unknown> ?? {}) };
  for (const key of ['streetCornerGroundResult','streetCorners','roadCurveResult','roadDashResult','arrivalGrounds','streetGeometry','parkedLife']) {
    if (userData[key] !== undefined) reports[key] = userData[key];
  }
  const optionalDetailMissing = Array.isArray(userData.optionalDetailMissing) ? [...userData.optionalDetailMissing] : [];
  const errors = optionalDetailMissing.map(name => `Incomplete optional correction: ${name}`);
  const required: Record<string,string> = { terrain:'terrain', environmentGround:'shoreline', road:'roadPaint', parking:'parking', roadMaterials:'roadMaterials', streetCornerGround:'streetCornerGround', roadCurve:'roadCurve', roadDash:'roadDash', streetCorners:'streetCorners', additional:'additionalEnvironment', facilities:'facilities', roadside:'roadside' };
  for (const [family, stage] of Object.entries(required)) {
    if (supplied[family] !== undefined && reports[stage] === undefined) errors.push(`Registered ${family} produced no assembly report`);
  }
  for (const [name, value] of Object.entries(reports)) {
    if (!value || typeof value !== 'object') continue;
    if (['source-mismatch','missing-source','no-support','rejected'].includes(value.status)) errors.push(`${name}: ${value.status}`);
    if (value.rejected === true) errors.push(`${name} rejected: ${value.rejectionReason ?? value.reason ?? 'source/geometry guard'}`);
    if (value.rejectedMeshes > 0) errors.push(`${name} rejected ${value.rejectedMeshes} registered meshes`);
    if (value.skipped === true && supplied[name] !== undefined) errors.push(`${name} skipped: ${value.reason ?? 'dependency did not apply'}`);
  }
  return { reports, optionalDetailMissing, errors: [...new Set(errors)] };
}
