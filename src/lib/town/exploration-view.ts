/** Keep the complete town inside the view while retaining close street detail.
 * The higher near plane improves distant depth precision during flight; its
 * smooth ramp stays well in front of the five-metre exploration camera boom. */
export function explorationClipPlanes(heightAboveGround: number): { near: number; far: number } {
  const height = Number.isFinite(heightAboveGround) ? Math.max(0, heightAboveGround) : 0;
  const progress = Math.max(0, Math.min(1, (height - 12) / (250 - 12)));
  const blend = progress * progress * (3 - 2 * progress);
  return { near: .08 + (1.5 - .08) * blend, far: 350000 };
}

/** Lengthen the flight view without automatically tilting the camera down.
 * Pitch remains the user's choice, so climbing preserves sky and horizon. */
export function explorationCameraOffset(heightAboveGround: number, pitchRadians = .24): { back: number; up: number } {
  const height = Number.isFinite(heightAboveGround) ? Math.max(0, heightAboveGround) : 0;
  const pitch = Number.isFinite(pitchRadians) ? Math.max(-.6, Math.min(1.25, pitchRadians)) : .24;
  const aerial = Math.max(0, Math.min(1, (height - 10) / 150)), boom = 5 + aerial * 3;
  return { back: boom * Math.cos(pitch), up: boom * Math.sin(pitch) };
}
