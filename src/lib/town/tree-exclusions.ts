/** Reviewed render artifacts; source tree packets and indices stay unchanged.
 * Birch Island Road, baseline view 3386 (2026-09-28): the inferred open crown
 * at this surveyed anchor fills the bridge driving view 0.66–1.27 m from the
 * camera. Corrected view 3386 also confirms index 164 foliage 1.03–2.15 m
 * above actual bridge pavement 15–18 m ahead. Reverse view 3387 confirms
 * index 166 foliage 0.45–1.65 m above the deck just 5.5–6.8 m ahead. Exact
 * grounding leaves these inferred crown/vehicle-envelope conflicts unchanged. */
export const REVIEWED_TREE_CROWN_EXCLUSIONS = [
  { east: -1189.6, north: -1349, height: 9.9, sourceTile: '-5_-6', sourceIndex: 163, view: 3386 },
  { east: -1175, north: -1343.8, height: 10.4, sourceTile: '-5_-6', sourceIndex: 164, view: 3386 },
  { east: -1203.5, north: -1340.3, height: 7.3, sourceTile: '-5_-6', sourceIndex: 166, view: 3387 },
] as const;

/** Keep source anchor indices stable while clearing confirmed playing/access surfaces. */
export function excludedTreeAnchors(rows: readonly (readonly number[])[], origin: readonly number[], polygons: readonly (readonly (readonly number[])[])[]): Set<number> {
  const domains = polygons.filter(r => r.length >= 3 && r.every(p => p.length === 2 && p.every(Number.isFinite))).map(ring => ({
    ring, minX: Math.min(...ring.map(p => p[0])), maxX: Math.max(...ring.map(p => p[0])),
    minY: Math.min(...ring.map(p => p[1])), maxY: Math.max(...ring.map(p => p[1])),
  }));
  const excluded = new Set<number>();

  rows.forEach((row, index) => {
    const x = row[0] + origin[0], y = -(row[2] + origin[2]);
    if (REVIEWED_TREE_CROWN_EXCLUSIONS.some(a => Math.abs(x - a.east) < .02 && Math.abs(y - a.north) < .02 && Math.abs(row[4] / .3 - a.height) < .02)) excluded.add(index);
    if (domains.some(({ring, minX, maxX, minY, maxY}) => {
      if (x < minX || x > maxX || y < minY || y > maxY) return false;
      let inside = false;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const a = ring[j], b = ring[i], cross = (x-a[0])*(b[1]-a[1])-(y-a[1])*(b[0]-a[0]);
        if (Math.abs(cross) < 1e-7 && x >= Math.min(a[0],b[0]) && x <= Math.max(a[0],b[0]) && y >= Math.min(a[1],b[1]) && y <= Math.max(a[1],b[1])) return true;
        if ((a[1] > y) !== (b[1] > y) && x < (b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0]) inside = !inside;
      }
      return inside;
    })) excluded.add(index);
  });
  return excluded;
}
