/**
 * The land-cover weights (r lawn, g canopy, b paved, a soil) come from a 1 m
 * classification resampled to each tile's 272 px grid. Its paved class has
 * soft, noisy edges: halos where roofs were misregistered, specks, slivers
 * along walls and fences, and fringes that fade over two or three metres.
 * Drawn as-is they read as dark stains with no clear edge.
 *
 * At load the paved share is smoothed and cut at one half; strips two pixels
 * wide or less are opened away; isolated islands smaller than a parking space
 * become lawn; then a narrow, smooth band is re-encoded around the surviving
 * outline so the ground shader can draw one crisp edge at its half-way
 * contour. Whatever paving gives up goes to the other classes in their
 * existing proportions (to lawn where there were none). Pixels with no cover
 * at all (buildings, water) are never changed.
 *
 * The canopy class marks where the 2016 aerials saw leaves, not what lies
 * beneath them. Small, isolated canopy patches are yard and street trees over
 * lawn, so their weight is handed to lawn (the live tree shades it); woods
 * keep their leaf litter.
 *
 * Seams: the 8 px gutter of each mask repeats its neighbour's first 8 px. The
 * smoothing and opening read at most six pixels away, and a component is only
 * ever removed when it stays clear of the 16 px band around the mask's edge,
 * so both tiles make the same decision for everything either of them draws.
 */
export type CoverCleanupReport = { pavedBefore: number; pavedAfter: number; islands: number; yardCanopy: number; changed: number; ms: number };

const COVERED = 24;             // of 255: below this a pixel is building or water
const ISLAND_PIXELS = 26;       // about 25 m²: one parking space and its apron
const YARD_CANOPY_PIXELS = 700; // about 670 m²: a few yard trees, never a wood
const SEAM_BAND = 16;           // px: the gutter and the neighbour's view of this core
const EDGE_SIGMA = 0.85;        // px: rounds the 1 m staircase without moving straight edges

/** 4-connected components of `set`; `visit` receives each one's pixels and whether it enters the seam band. */
function components(set: Uint8Array, width: number, height: number, visit: (members: number[], seam: boolean) => void): void {
  const seen = new Uint8Array(set.length), stack: number[] = [];
  const band = (x: number, y: number) => x < SEAM_BAND || y < SEAM_BAND || x >= width - SEAM_BAND || y >= height - SEAM_BAND;
  for (let seed = 0; seed < set.length; seed++) {
    if (!set[seed] || seen[seed]) continue;
    const members: number[] = [];
    let seam = false;
    seen[seed] = 1; stack.push(seed);
    while (stack.length) {
      const i = stack.pop()!, x = i % width, y = (i - x) / width;
      members.push(i);
      if (band(x, y)) seam = true;
      if (x > 0 && set[i - 1] && !seen[i - 1]) { seen[i - 1] = 1; stack.push(i - 1); }
      if (x < width - 1 && set[i + 1] && !seen[i + 1]) { seen[i + 1] = 1; stack.push(i + 1); }
      if (y > 0 && set[i - width] && !seen[i - width]) { seen[i - width] = 1; stack.push(i - width); }
      if (y < height - 1 && set[i + width] && !seen[i + width]) { seen[i + width] = 1; stack.push(i + width); }
    }
    visit(members, seam);
  }
}

function kernel(sigma: number, radius: number): Float32Array {
  const k = new Float32Array(radius * 2 + 1);
  let sum = 0;
  for (let i = -radius; i <= radius; i++) sum += k[i + radius] = Math.exp(-(i * i) / (2 * sigma * sigma));
  for (let i = 0; i < k.length; i++) k[i] /= sum;
  return k;
}

/** Separable blur of `values` weighted by `weights`, normalised where weights exist. */
function weightedBlur(values: Float32Array, weights: Float32Array, width: number, height: number, k: Float32Array): Float32Array {
  const radius = (k.length - 1) / 2, n = width * height;
  const num = new Float32Array(n), den = new Float32Array(n), out = new Float32Array(n);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    let a = 0, b = 0;
    for (let t = -radius; t <= radius; t++) {
      const i = y * width + Math.min(width - 1, Math.max(0, x + t)), w = k[t + radius] * weights[i];
      a += w * values[i]; b += w;
    }
    num[y * width + x] = a; den[y * width + x] = b;
  }
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    let a = 0, b = 0;
    for (let t = -radius; t <= radius; t++) {
      const i = Math.min(height - 1, Math.max(0, y + t)) * width + x;
      a += k[t + radius] * num[i]; b += k[t + radius] * den[i];
    }
    out[y * width + x] = b > 1e-6 ? a / b : 0;
  }
  return out;
}

export function regularizeCover(data: Uint8Array | Uint8ClampedArray, width: number, height: number): CoverCleanupReport {
  const clock = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const start = clock(), n = width * height;
  if (!(width > SEAM_BAND * 2 && height > SEAM_BAND * 2) || data.length !== n * 4) return { pavedBefore: 0, pavedAfter: 0, islands: 0, yardCanopy: 0, changed: 0, ms: 0 };
  const original = new Uint8Array(data);
  const cover = new Float32Array(n), covered = new Float32Array(n), share = new Float32Array(n);
  let pavedBefore = 0;
  for (let i = 0; i < n; i++) {
    const c = data[i * 4] + data[i * 4 + 1] + data[i * 4 + 2] + data[i * 4 + 3];
    cover[i] = c;
    if (c >= COVERED) { covered[i] = 1; share[i] = data[i * 4 + 2] / c; pavedBefore += data[i * 4 + 2]; }
  }
  // 1. A light blur of the paved share, cut at one half.
  const smooth = weightedBlur(share, covered, width, height, kernel(0.8, 2));
  const paved = new Uint8Array(n);
  for (let i = 0; i < n; i++) paved[i] = covered[i] && smooth[i] >= 0.5 ? 1 : 0;
  // 2. Opening with a 4-neighbour cross: strips two pixels wide or less (halos,
  // slivers along walls) go; buildings and water count as not paved. The
  // outer ring cannot be judged here and stays as it was.
  const eroded = new Uint8Array(n);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = y * width + x;
    if (!paved[i]) continue;
    eroded[i] = x === 0 || y === 0 || x === width - 1 || y === height - 1 ||
      (paved[i - 1] && paved[i + 1] && paved[i - width] && paved[i + width]) ? 1 : 0;
  }
  const opened = new Uint8Array(n);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = y * width + x;
    if (!paved[i]) continue;
    opened[i] = eroded[i] || (x > 0 && eroded[i - 1]) || (x < width - 1 && eroded[i + 1]) ||
      (y > 0 && eroded[i - width]) || (y < height - 1 && eroded[i + width]) ? 1 : 0;
  }
  // 3. Isolated islands smaller than a parking space become lawn. Driveways
  // join the street's paved band and are never islands.
  let islands = 0;
  components(opened, width, height, (members, seam) => {
    if (!seam && members.length < ISLAND_PIXELS) { islands++; for (const i of members) opened[i] = 0; }
  });
  // 4. Yard and street trees: small canopy patches hand their weight to what
  // surrounds them, lawn or (for a tree over a drive or lot) paving. Their
  // one-pixel soft fringe goes with them.
  const canopy = new Uint8Array(n), yard = new Uint8Array(n), under = new Uint8Array(n);
  for (let i = 0; i < n; i++) canopy[i] = covered[i] && data[i * 4 + 1] * 2 >= cover[i] ? 1 : 0;
  let yardCanopy = 0;
  components(canopy, width, height, (members, seam) => {
    if (seam || members.length >= YARD_CANOPY_PIXELS) return;
    yardCanopy++;
    let around = 0, pavedAround = 0;
    for (const i of members) for (const j of [i - 1, i + 1, i - width, i + width]) {
      if (canopy[j] || !covered[j]) continue;
      around++; pavedAround += opened[j];
    }
    const paving = around > 0 && pavedAround > around * 0.6 ? 1 : 0;
    for (const i of members) { yard[i] = 1; under[i] = paving; }
  });
  for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) {
    const i = y * width + x;
    if (yard[i] !== 1) continue;
    for (const j of [i - 1, i + 1, i - width, i + width]) if (!yard[j] && !canopy[j]) { yard[j] = 2; under[j] = under[i] && opened[j] ? 1 : 0; }
  }
  for (let i = 0; i < n; i++) {
    if (!yard[i] || !covered[i]) continue;
    const o = i * 4;
    data[o] = Math.min(255, data[o] + data[o + 1]); data[o + 1] = 0;
    if (under[i]) opened[i] = 1;
  }
  // 5. A smooth band around the kept outline; its half-way contour is the edge.
  const binary = new Float32Array(n);
  for (let i = 0; i < n; i++) binary[i] = opened[i];
  const band = weightedBlur(binary, covered, width, height, kernel(EDGE_SIGMA, 3));
  let pavedAfter = 0, changed = 0;
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    if (covered[i]) {
      const c = cover[i], paving = Math.min(255, Math.round(Math.min(1, Math.max(0, band[i])) * c));
      const r = data[o], g = data[o + 1], s = data[o + 3], rest = r + g + s, free = Math.max(0, c - paving);
      let nr = free, ng = 0, ns = 0;
      if (rest > 0) { const k = free / rest; nr = Math.round(r * k); ng = Math.round(g * k); ns = Math.max(0, Math.round(free) - nr - ng); }
      data[o] = Math.min(255, nr); data[o + 1] = Math.min(255, ng); data[o + 2] = paving; data[o + 3] = Math.min(255, ns);
      pavedAfter += paving;
    }
    if (data[o] !== original[o] || data[o + 1] !== original[o + 1] || data[o + 2] !== original[o + 2] || data[o + 3] !== original[o + 3]) changed++;
  }
  return { pavedBefore: pavedBefore / 255, pavedAfter: pavedAfter / 255, islands, yardCanopy, changed, ms: clock() - start };
}
