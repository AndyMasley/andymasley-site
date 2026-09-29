/** Keep the complete town inside the view while retaining close street detail.
 * The higher near plane improves distant depth precision during flight; its
 * smooth ramp stays well in front of the five-metre exploration camera boom. */
export function explorationClipPlanes(heightAboveGround: number): { near: number; far: number } {
  const height = Number.isFinite(heightAboveGround) ? Math.max(0, heightAboveGround) : 0;
  const progress = Math.max(0, Math.min(1, (height - 12) / (250 - 12)));
  const blend = progress * progress * (3 - 2 * progress);
  return { near: .08 + (1.5 - .08) * blend, far: 14000 };
}
