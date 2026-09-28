export type TreeGroundSampler = (east: number, north: number) => number | undefined;
export type TreeGroundSupport = { bounds: { min: readonly number[]; max: readonly number[] }; ground: TreeGroundSampler };

function groundedRow(row: number[], origin: readonly number[], y: number): number[] {
  const crown = y - origin[1] + .71 * row[4] / .30;
  if (!Number.isFinite(crown) || Math.abs(crown - row[1]) < 1e-8) return row;
  const placed = [...row]; placed[1] = crown;
  return placed;
}

/** Seat retained and surveyed trees without changing their source identity or
 * dimensions. Missing support is reported at stable instance indices; callers
 * can resolve a tile seam before excluding an unsupported rendered instance. */
export function groundTreeRows(rows: readonly number[][], origin: readonly number[], ground: TreeGroundSampler, missingGround?: (index: number) => void): number[][] {
  return rows.map((row,index) => {
    if (row.length !== 7 || !row.every(Number.isFinite) || row[4] <= 0) return row;
    const y = ground(row[0] + origin[0], -row[2] - origin[2]);
    if (y === undefined || !Number.isFinite(y)) { missingGround?.(index); return row; }
    return groundedRow(row,origin,y);
  });
}

/** Resolve only the owner's uncovered anchors against terrain that will be
 * visible in the same frame. No extrapolation, roof sampling, horizontal moves
 * or row removal: a true coverage gap remains an excluded stable index. */
export function resolveTreeGroundGaps(rows: number[][], origin: readonly number[], gaps: readonly number[], supports: readonly TreeGroundSupport[]): { rows: number[][]; unsupported: number[]; supported: number[] } {
  let placed = rows;
  const unsupported: number[] = [], supported: number[] = [];
  for (const index of gaps) {
    const row = rows[index];
    if (!row || row.length !== 7 || !row.every(Number.isFinite) || row[4] <= 0) { unsupported.push(index); continue; }
    const e = row[0] + origin[0], z = row[2] + origin[2];
    let y: number | undefined;
    for (const support of supports) {
      const {min,max} = support.bounds;
      if (e < min[0] - 1e-6 || e > max[0] + 1e-6 || z < min[2] - 1e-6 || z > max[2] + 1e-6) continue;
      const sample = support.ground(e,-z);
      if (sample !== undefined && Number.isFinite(sample) && (y === undefined || sample > y)) y = sample;
    }
    if (y === undefined) { unsupported.push(index); continue; }
    supported.push(index);
    const grounded = groundedRow(row,origin,y);
    if (grounded !== row) { if (placed === rows) placed = [...rows]; placed[index] = grounded; }
  }
  return { rows: placed, unsupported, supported };
}
