/** Keep source anchor indices stable while clearing confirmed playing/access surfaces. */
export function excludedTreeAnchors(rows: readonly (readonly number[])[], origin: readonly number[], polygons: readonly (readonly (readonly number[])[])[]): Set<number> {
  const domains = polygons.filter(r => r.length >= 3 && r.every(p => p.length === 2 && p.every(Number.isFinite))).map(ring => ({
    ring, minX: Math.min(...ring.map(p => p[0])), maxX: Math.max(...ring.map(p => p[0])),
    minY: Math.min(...ring.map(p => p[1])), maxY: Math.max(...ring.map(p => p[1])),
  }));
  const excluded = new Set<number>();
  if (!domains.length) return excluded;
  rows.forEach((row, index) => {
    const x = row[0] + origin[0], y = -(row[2] + origin[2]);
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
