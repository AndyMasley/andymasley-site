/** Broad-phase only: coordinates and candidate order are never modified. The
 * caller still performs its exact clipping against the original triangles. */
export class PlanarTriangleIndex {
  private bins = new Map<string, number[]>();
  constructor(readonly triangles: number[][][], readonly domain: readonly number[], readonly cellSize = 1) {
    for (let i = 0; i < triangles.length; i++) {
      const triangle = triangles[i];
      const minX = Math.max(domain[0], Math.min(...triangle.map(p => p[0]))), maxX = Math.min(domain[1], Math.max(...triangle.map(p => p[0])));
      const minZ = Math.max(domain[2], Math.min(...triangle.map(p => p[2]))), maxZ = Math.min(domain[3], Math.max(...triangle.map(p => p[2])));
      if (minX > maxX || minZ > maxZ) continue;
      this.cells([minX, maxX, minZ, maxZ], key => { const bin = this.bins.get(key); if (bin) bin.push(i); else this.bins.set(key, [i]); });
    }
  }
  private cells(bounds: readonly number[], visit: (key: string) => void): void {
    const x0 = Math.floor(Math.max(bounds[0], this.domain[0]) / this.cellSize), x1 = Math.floor(Math.min(bounds[1], this.domain[1]) / this.cellSize);
    const z0 = Math.floor(Math.max(bounds[2], this.domain[2]) / this.cellSize), z1 = Math.floor(Math.min(bounds[3], this.domain[3]) / this.cellSize);
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) visit(`${x}:${z}`);
  }
  query(bounds: readonly number[]): number[][][] {
    const indices = new Set<number>(); this.cells(bounds, key => { for (const index of this.bins.get(key) ?? []) indices.add(index); });
    return [...indices].sort((a, b) => a - b).map(index => this.triangles[index]);
  }
}
