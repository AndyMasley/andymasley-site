import type { Choice, RoadGraph } from './engine';

/** Presentation only: source inventory labels and graph identities remain untouched. */
export function displayRoadName(value: string | undefined): string {
  const name = (value ?? '').trim().replace(/\s+/g, ' ');
  if (!name || /^(unnamed|unknown)(\b|$)/i.test(name)) return 'Access road';
  if (/^(INTERSTATE|I[- ])\s*395$/i.test(name)) return 'I-395';
  if (name !== name.toUpperCase()) return name;
  return name.toLowerCase().replace(/\b[a-z]/g, letter => letter.toUpperCase())
    .replace(/\bUs\b/g, 'US').replace(/\bMa\b/g, 'MA');
}

export function branchBearing(graph: RoadGraph, id: number): string {
  const path = graph.paths.get(id);
  if (!path) return '';
  const from = path.sample(0)[0], to = path.sample(Math.min(35, path.length))[0];
  const angle = (Math.atan2(to[0] - from[0], to[1] - from[1]) * 180 / Math.PI + 360) % 360;
  return ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'][Math.round(angle / 45) % 8];
}

export function displayChoices(graph: RoadGraph, choices: readonly Choice[]): { choice: Choice; name: string }[] {
  const names = choices.map(choice => displayRoadName(choice.name));
  return choices.map((choice, i) => {
    const repeated = names.filter(name => name === names[i]).length > 1;
    let name = names[i];
    if (repeated || name === 'Access road') name += ` · ${branchBearing(graph, choice.edgeId)}`;
    const sameBearing = choices.filter((other, j) => names[j] === names[i] && branchBearing(graph, other.edgeId) === branchBearing(graph, choice.edgeId));
    if (sameBearing.length > 1) {
      const rank = [...sameBearing].sort((a, b) => b.angleDeg - a.angleDeg || a.edgeId - b.edgeId).findIndex(item => item.edgeId === choice.edgeId);
      name += ` · branch ${rank + 1}`;
    }
    return { choice, name };
  });
}

export function turnDistanceLabel(distance: number): string {
  if (distance < 3.1) return 'now';
  return distance < 160 ? `in ${Math.max(10, Math.round(distance * 3.28084 / 10) * 10)} ft` : `in ${(distance / 1609.344).toFixed(1)} mi`;
}
