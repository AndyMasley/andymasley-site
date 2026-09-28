/** Fit one rigid panel to its measured roof footprint. Small facet differences
 * are cleared by the mounting gap; valleys and roof steps need separate cells. */
export function fitRoofPanel(height: (u: number, d: number) => number | undefined, u: number, d: number, width: number, depth: number): [number, number, number, number] | undefined {
  if (width <= 0 || depth <= 0) return undefined;
  const corners = [[0, 0], [1, 0], [1, 1], [0, 1]] as const;
  const heights = corners.map(([x, y]) => height(u + x * width, d + y * depth));
  if (heights.some(z => z === undefined)) return undefined;
  const [a, b, c, e] = heights as number[], mean = (a + b + c + e) / 4;
  const across = (b + c - a - e) / 2, back = (c + e - a - b) / 2;
  const plane = (x: number, y: number) => mean + across * (x - .5) + back * (y - .5);
  const columns = Math.ceil(width / .1), rows = Math.ceil(depth / .1);
  let low = Infinity, high = -Infinity;
  for (let i = 0; i <= columns; i++) for (let j = 0; j <= rows; j++) {
    const x = i / columns, y = j / rows, roof = height(u + x * width, d + y * depth);
    if (roof === undefined) return undefined;
    const residual = roof - plane(x, y);
    low = Math.min(low, residual); high = Math.max(high, residual);
    if (high - low > .2) return undefined;
  }
  return corners.map(([x, y]) => plane(x, y) + high + .09) as [number, number, number, number];
}
