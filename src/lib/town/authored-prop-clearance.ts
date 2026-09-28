import registration from '../../../data/derived/town/authored-prop-clearance.json';

type Position = { x: number; n: number; z: number };
export type AuthoredPropKind = 'pole' | 'hydrant' | 'sign' | 'utility';
export type AuthoredPropCorrections = Record<string, readonly number[] | null>;

/** Offline final-pavement/terrain clearance for authored decorations only.
 * Exact original anchors gate every record; source-mapped utility objects never
 * call this function. Null omits an unsupported or superseded decoration, including its wires.
 */
export function clearAuthoredProp<T extends Position>(kind: AuthoredPropKind, point: T, rows: AuthoredPropCorrections = registration.rows): T | undefined {
  const key = `${kind}:${point.x.toFixed(3)}:${point.n.toFixed(3)}`;
  const corrected = rows[key];
  if (corrected === null) return undefined;
  if (!corrected || corrected.length !== 3 || !corrected.every(Number.isFinite) || Math.hypot(corrected[0] - point.x, corrected[1] - point.n) > 6.002) return point;
  return { ...point, x: corrected[0], n: corrected[1], z: corrected[2] };
}

/** Wires share the registered endpoint even across packet/tile boundaries. */
export function clearAuthoredWireEnd(end: number[], rows: AuthoredPropCorrections = registration.rows, heightDeltas: Record<string, number> = (registration as { heightDeltas?: Record<string, number> }).heightDeltas ?? {}): number[] | undefined {
  const key = `utility:${end[0].toFixed(3)}:${end[1].toFixed(3)}`;
  const original = { x: end[0], n: end[1], z: end[2] };
  const point = clearAuthoredProp('utility', original, rows);
  if (!point) return undefined;
  if (point === original) return end;
  const delta = heightDeltas[key] ?? 0;
  return point.x === end[0] && point.n === end[1] && !delta ? end : [point.x, point.n, end[2] + (Number.isFinite(delta) ? delta : 0)];
}
