import type { V3 } from './contracts';

export interface TreeForm {
  crown: { position: V3; scale: V3 };
  trunk: { position: V3; scale: V3 };
  yaw: number;
  family: 'rounded' | 'spreading' | 'open';
  groundY: number;
  topY: number;
}

// Bounds of the fixed release's leaf primitive and distant crown, before instancing.
// These describe render assets, not surveyed species or individual trunk locations.
export const CROWN_FORM_BOUNDS = {
  near: { min: [-1.0010135173797607, -0.41970714926719666, -1.109898567199707], max: [1.0013924837112427, 1.0466471910476685, 1.1201896667480469] },
  far: { min: [-0.71207195520401, -0.7491682171821594, -0.7033854722976685], max: [0.7261876463890076, 1.0236793756484985, 0.7357558012008667] },
} as const;

function variation(x: number, z: number, salt: number): number {
  let h = Math.imul(Math.round(x * 10) ^ salt, 374761393) ^ Math.imul(Math.round(z * 10), 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Authored broadleaf proportions preserve the source's implied foot and current top.
 * Rows remain unmodified. The world coordinate seed is independent of tile ownership.
 * Both LODs cover the same leaf envelope; only their displayed mesh changes.
 */
export function treeForm(row: readonly number[], origin: readonly number[], distant = false): TreeForm {
  if (row.length < 7 || !row.slice(0, 7).every(Number.isFinite) || row.slice(3, 6).some(value => value <= 0) ||
      origin.length < 3 || !origin.slice(0, 3).every(Number.isFinite)) throw new Error('Tree forms require finite positive source transforms.');
  const x = row[0] + origin[0], z = row[2] + origin[2];
  const seed = variation(x, z, 1877), detail = variation(x, z, 731);
  const family = seed < 0.42 ? 'rounded' : seed < 0.82 ? 'spreading' : 'open';
  const spread = family === 'spreading' ? 1.24 + detail * 0.12 : family === 'rounded' ? 1.12 + detail * 0.12 : 1.04 + detail * 0.10;
  const depth = family === 'open' ? 1.20 + detail * 0.10 : 1.32 + detail * 0.10;
  const asymmetry = 0.96 + variation(x, z, 2017) * 0.08;
  const near = CROWN_FORM_BOUNDS.near, target = distant ? CROWN_FORM_BOUNDS.far : near;
  const height = row[4] / 0.30;
  const groundY = row[1] - height * 0.71;
  const topY = row[1] + near.max[1] * row[4];
  const nearScale: V3 = [row[3] * spread * asymmetry, row[4] * depth, row[5] * spread / asymmetry];
  const scale = nearScale.map((value, axis) => value * (near.max[axis] - near.min[axis]) / (target.max[axis] - target.min[axis])) as V3;
  const offsetX = ((near.min[0] + near.max[0]) * nearScale[0] - (target.min[0] + target.max[0]) * scale[0]) * 0.5;
  const offsetZ = ((near.min[2] + near.max[2]) * nearScale[2] - (target.min[2] + target.max[2]) * scale[2]) * 0.5;
  const yaw = row[6], cosine = Math.cos(yaw), sine = Math.sin(yaw);
  const crownPosition: V3 = [row[0] + cosine * offsetX + sine * offsetZ, topY - target.max[1] * scale[1], row[2] - sine * offsetX + cosine * offsetZ];
  const leafBottom = topY - (near.max[1] - near.min[1]) * nearScale[1];
  // Trunk joins inside the branching crown instead of ending in a long exposed pole.
  const trunkTop = leafBottom + height * 0.12;
  const halfTrunk = (trunkTop - groundY) * 0.5;
  const radius = Math.max(0.12, Math.min(0.46, height * (0.014 + detail * 0.003)));
  return {
    crown: { position: crownPosition, scale },
    trunk: { position: [row[0], groundY + halfTrunk, row[2]], scale: [radius, halfTrunk, radius] },
    yaw, family, groundY, topY,
  };
}
