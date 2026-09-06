import type { Choice, RoadEdge, TurnLabel, TurnRequest } from './engine';

type Point = readonly number[];

function junctionHeading(points: readonly Point[], atEnd: boolean): [number, number] {
  const endpoint = points[atEnd ? points.length - 1 : 0];
  let previous = endpoint, remaining = 12;
  for (let step = 1; step < points.length; step++) {
    const point = points[atEnd ? points.length - 1 - step : step];
    const distance = Math.hypot(point[0] - previous[0], point[1] - previous[1]);
    if (distance < 1e-8) continue;
    const fraction = Math.min(1, remaining / distance);
    const sample = [previous[0] + (point[0] - previous[0]) * fraction, previous[1] + (point[1] - previous[1]) * fraction];
    if (distance >= remaining || step === points.length - 1) {
      return atEnd ? [endpoint[0] - sample[0], endpoint[1] - sample[1]] : [sample[0] - endpoint[0], sample[1] - endpoint[1]];
    }
    remaining -= distance;
    previous = point;
  }
  return [0, 0];
}

function angleBetween(a: readonly number[], b: readonly number[]): number {
  return Math.atan2(a[0] * b[1] - a[1] * b[0], a[0] * b[0] + a[1] * b[1]) * 180 / Math.PI;
}

function angleLabel(angle: number): TurnLabel {
  return angle > 25 ? 'Left' : angle < -25 ? 'Right' : 'Straight';
}

function roadName(name: string | undefined): string {
  const normalized = (name ?? '').trim().toLocaleLowerCase('en-US');
  return /^(unnamed|unknown)(\b|$)/.test(normalized) ? '' : normalized;
}

function ordered(a: Choice, b: Choice): number {
  if (a.angleDeg !== b.angleDeg) return b.angleDeg - a.angleDeg;
  return String(a.edgeId) < String(b.edgeId) ? -1 : String(a.edgeId) > String(b.edgeId) ? 1 : 0;
}

/** Describes only previously validated links; it never creates or removes a road connection. */
export function classifyTurnOptions(incoming: RoadEdge, legalChoices: readonly Choice[], roads: ReadonlyMap<number, RoadEdge>): Choice[] {
  const heading = junctionHeading(incoming.points, true);
  const choices = legalChoices.map(choice => {
    const outgoing = roads.get(choice.edgeId);
    if (!outgoing) return { ...choice };
    const angleDeg = angleBetween(heading, junctionHeading(outgoing.points, false));
    // A loop ramp can initially point almost backwards. Only the mapped reverse
    // of this physical road is a U-turn; a distinct branch stays arrow-selectable.
    const inverse = outgoing.to === incoming.from && (outgoing.physical_id ?? outgoing.id) === (incoming.physical_id ?? incoming.id);
    return { ...choice, angleDeg, label: inverse ? 'U-turn' as const : angleLabel(angleDeg) };
  }).sort(ordered);
  const shallow = choices.filter(choice => choice.label === 'Straight');
  if (shallow.length < 2) return choices;

  const name = roadName(incoming.name);
  const sameRoad = name ? shallow.filter(choice => roadName(choice.name) === name) : [];
  const closest = [...shallow].sort((a, b) => Math.abs(a.angleDeg) - Math.abs(b.angleDeg) || ordered(a, b))[0];
  const splitAroundApproach = shallow.some(choice => choice.angleDeg > 8) && shallow.some(choice => choice.angleDeg < -8);
  // At a named continuation the ramp is relative to that road. At an unmarked Y,
  // each arm is a turn; a fixed ±25° dead zone must not make both arms "Straight".
  const continuation = sameRoad.length === 1 ? sameRoad[0] : splitAroundApproach && Math.abs(closest.angleDeg) > 8 ? null : closest;
  for (const choice of shallow) {
    if (choice === continuation) continue;
    const relative = choice.angleDeg - (continuation?.angleDeg ?? 0);
    choice.label = relative >= 0 ? 'Left' : 'Right';
  }
  return choices;
}

export function chooseTurnOption(choices: readonly Choice[], incomingName: string, requested: TurnRequest = null): Choice | null {
  if (!choices.length) return null;
  const minimum = (items: readonly Choice[], score: (choice: Choice) => number): Choice => items.reduce((best, item) => score(item) < score(best) ? item : best);
  if (requested) {
    const wanted = requested === 'LEFT' ? 'Left' : 'Right';
    const matches = choices.filter(choice => choice.label === wanted);
    if (matches.length) return minimum(matches, choice => Math.abs(choice.angleDeg - (requested === 'LEFT' ? 90 : -90)));
  }
  const straight = choices.filter(choice => choice.label === 'Straight');
  return minimum(straight.length ? straight : choices, choice => Math.abs(choice.angleDeg) + (choice.name === incomingName ? 0 : 3));
}
