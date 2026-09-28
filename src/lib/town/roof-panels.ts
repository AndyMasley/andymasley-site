/** Fit one rigid panel to its measured roof footprint. Small facet differences
 * are cleared by the mounting gap; valleys and roof steps need separate cells. */
export function fitRoofPanel(height: (u: number, d: number) => number | undefined, u: number, d: number, width: number, depth: number): [number, number, number, number] | undefined {
  if (![u, d, width, depth].every(Number.isFinite) || width <= 0 || depth <= 0) return undefined;
  const corners = [[0, 0], [1, 0], [1, 1], [0, 1]] as const;
  const heights = corners.map(([x, y]) => height(u + x * width, d + y * depth));
  if (heights.some(z => z === undefined || !Number.isFinite(z))) return undefined;
  const [a, b, c, e] = heights as number[], mean = a / 4 + b / 4 + c / 4 + e / 4;
  const across = (b - a) / 2 + (c - e) / 2, back = (c - b) / 2 + (e - a) / 2;
  if (![mean, across, back].every(Number.isFinite)) return undefined;
  const plane = (x: number, y: number) => mean + across * (x - .5) + back * (y - .5);
  const columns = Math.ceil(width / .1), rows = Math.ceil(depth / .1);
  let low = Infinity, high = -Infinity;
  for (let i = 0; i <= columns; i++) for (let j = 0; j <= rows; j++) {
    const x = i / columns, y = j / rows, roof = height(u + x * width, d + y * depth);
    if (roof === undefined || !Number.isFinite(roof)) return undefined;
    const residual = roof - plane(x, y);
    low = Math.min(low, residual); high = Math.max(high, residual);
    if (high - low > .2) return undefined;
  }
  return corners.map(([x, y]) => plane(x, y) + high + .09) as [number, number, number, number];
}

/** Place full-size modules on each column's own street-facing roof facets.
 * A front gable can be level along a column while sloping across the array;
 * an adjacent wing can reach its ridge at a different depth. */
export function roofPanelRows(height: (u: number, d: number) => number | undefined, u: number, width: number, limit = 10): { d: number; depth: number; heights: [number, number, number, number] }[] {
  if (!Number.isFinite(u) || !Number.isFinite(width) || width <= 0 || Number.isNaN(limit)) return [];
  limit = Math.max(0, Math.min(10, limit));
  const mid = u + width / 2, rows: { d: number; depth: number; heights: [number, number, number, number] }[] = [];
  let first: number | undefined;
  for (let d = 0; d <= limit; d += .1) if (height(mid, d) !== undefined) { first = d; break; }
  if (first === undefined) return rows;
  for (let d = first + .5, attempts = 0; d < limit && attempts < 128; attempts++) {
    const bottom = height(mid, d);
    if (bottom === undefined || !Number.isFinite(bottom)) { d += .1; continue; }
    let low = 0, high: number | undefined;
    for (let step = 1; step <= 17; step++) {
      const depth = step / 10, top = height(mid, d + depth);
      if (top === undefined || !Number.isFinite(top)) break;
      if (Math.hypot(depth, top - bottom) >= 1.7) { high = depth; break; }
      low = depth;
    }
    if (high === undefined) { d += .1; continue; }
    // Bracket the full module length; fixed-point slope updates can oscillate
    // across a step and incorrectly turn a module into a narrow strip.
    let upper: number = high, valid = true;
    for (let k = 0; k < 16; k++) {
      const depth = (low + upper) / 2, top = height(mid, d + depth);
      if (top === undefined || !Number.isFinite(top)) { valid = false; break; }
      if (Math.hypot(depth, top - bottom) >= 1.7) upper = depth; else low = depth;
    }
    if (!valid) { d += .1; continue; }
    const depth = (low + upper) / 2, end = height(mid, d + depth), buffer = height(mid, d + depth + .35);
    if (d + depth + .35 > limit || end === undefined || (end - bottom) / depth < -.05 || buffer === undefined || buffer < end - .02) { d += .1; continue; }
    const heights = fitRoofPanel(height, u, d, width, depth);
    if (!heights || Math.abs(Math.hypot(depth, heights[3] - heights[0]) - 1.7) > .03) { d += .1; continue; }
    rows.push({ d, depth, heights });
    d += depth + .02;
  }
  return rows;
}
