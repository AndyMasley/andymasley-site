export interface Point { x: number; z: number }

export function damp(current: number, target: number, rate: number, dt: number) {
  return target + (current - target) * Math.exp(-rate * Math.max(0, dt));
}

export function canStand(x: number, z: number) {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
  const apothem = 5 * Math.cos(Math.PI / 6);
  for (let wall = 0; wall < 6; wall++) {
    const angle = wall * Math.PI / 3;
    const limit = apothem - (wall === 0 || wall === 3 ? 0.25 : 0.7);
    if (x * Math.cos(angle) + z * Math.sin(angle) > limit) return false;
  }
  const distance = Math.hypot(x, z);
  if (distance < 0.55) return false;
  if (distance > 1.05 * Math.cos(Math.PI / 6) && distance < 2.37) {
    return x > 0 && Math.abs(z) < 0.5;
  }
  return true;
}

// Substeps stop low frame rates from tunneling through the pedestal or the bridge kerb.
export function slideMove(position: Point, delta: Point): Point {
  let { x, z } = position;
  const distance = Math.hypot(delta.x, delta.z);
  if (!Number.isFinite(distance) || !canStand(x, z)) return { x, z };
  const steps = Math.max(1, Math.ceil(distance / 0.035));
  const dx = delta.x / steps, dz = delta.z / steps;
  for (let i = 0; i < steps; i++) {
    if (canStand(x + dx, z + dz)) { x += dx; z += dz; }
    else if (canStand(x + dx, z)) x += dx;
    else if (canStand(x, z + dz)) z += dz;
  }
  return { x, z };
}

export function localMovement(x: number, z: number, yaw: number): Point {
  const length = Math.max(1, Math.hypot(x, z));
  return {
    x: (x * Math.cos(yaw) + z * Math.sin(yaw)) / length,
    z: (-x * Math.sin(yaw) + z * Math.cos(yaw)) / length,
  };
}

export function qualityStep(ratio: number, maximum: number, samples: number[]) {
  if (samples.length < 90) return ratio;
  const sorted = [...samples].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  if (median > 23) return Math.max(0.75, ratio - 0.25);
  if (median < 18) return Math.min(maximum, ratio + 0.125);
  return ratio;
}
