import type * as THREE from 'three';

type Triangle = number[][];
const pending = new WeakMap<THREE.Object3D, Set<Triangle>>();

/** Exact emitted ground faces are temporary rasterization input, not another
 * persistent copy of the tile's geometry. Other modules retain their own data. */
export function registerHardscapeGrassExclusions(group: THREE.Object3D, triangles: Triangle[]): void {
  if (!triangles.length) return;
  const owned = pending.get(group) ?? new Set<Triangle>();
  triangles.forEach(triangle => owned.add(triangle));
  pending.set(group, owned);
  group.userData.environmentGrassExclusions = [...(group.userData.environmentGrassExclusions ?? []), ...triangles];
  group.userData.hardscapeGrassExclusions = { pendingTriangles: owned.size, numericBytes: owned.size * 6 * 8, releasedTriangles: 0 };
}

/** Call only after TownGrass has accepted the rasterized mask. Until then the
 * faces remain available; this does not change the surface-loader retry policy. */
export function releaseHardscapeGrassExclusions(group: THREE.Object3D): void {
  const owned = pending.get(group);
  if (!owned) return;
  group.userData.environmentGrassExclusions = (group.userData.environmentGrassExclusions as Triangle[]).filter(triangle => !owned.has(triangle));
  group.userData.hardscapeGrassExclusions = { pendingTriangles: 0, numericBytes: 0, releasedTriangles: owned.size };
  pending.delete(group);
}
