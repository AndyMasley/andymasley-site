// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { RoadGraph, type Choice, type RoadEdge } from '../engine';
import { classifyTurnOptions, chooseTurnOption } from '../turn-options';

function fork(angles: number[], names: string[], incomingName = 'Main') {
  const incoming: RoadEdge = { id: 0, from: 0, to: 1, physical_id: 0, points: [[0, -100, 0], [0, 0, 0]], name: incomingName };
  const roads = new Map<number, RoadEdge>();
  const legal: Choice[] = angles.map((angle, i) => {
    const radians = angle * Math.PI / 180, id = i + 1;
    roads.set(id, { id, from: 1, to: i + 2, points: [[0, 0, 0], [-100 * Math.sin(radians), 100 * Math.cos(radians), 0]], name: names[i] });
    return { edgeId: id, angleDeg: angle, label: 'Straight', name: names[i] };
  });
  return { incoming, roads, legal, choices: classifyTurnOptions(incoming, legal, roads) };
}

describe('junction instructions follow the road branches', () => {
  it('makes a shallow highway exit available to Right while continuing on the mainline by default', () => {
    const { choices } = fork([-0.01, -4.97], ['Main', 'Exit ramp']);
    expect(choices.map(choice => choice.label)).toEqual(['Straight', 'Right']);
    expect(chooseTurnOption(choices, 'Main')?.edgeId).toBe(1);
    expect(chooseTurnOption(choices, 'Main', 'RIGHT')?.edgeId).toBe(2);
  });

  it('offers both arms of an unmarked Y instead of two Straight choices', () => {
    const { choices } = fork([16, -15], ['Upper road', 'Lower road']);
    expect(choices.map(choice => choice.label)).toEqual(['Left', 'Right']);
    expect(chooseTurnOption(choices, 'Main', 'LEFT')?.edgeId).toBe(1);
    expect(chooseTurnOption(choices, 'Main', 'RIGHT')?.edgeId).toBe(2);
  });

  it('uses the named continuing road as the reference for a shallow side road', () => {
    const { choices } = fork([14, -3], ['Main', 'Side road']);
    expect(choices.map(choice => choice.label)).toEqual(['Straight', 'Right']);
    expect(chooseTurnOption(choices, 'Main')?.edgeId).toBe(1);
  });

  it('treats Unnamed road as missing data rather than evidence of a continuation', () => {
    const { choices } = fork([18, -19], ['Unnamed road', 'Lake path'], 'Unnamed road');
    expect(choices.map(choice => choice.label)).toEqual(['Left', 'Right']);
  });

  it('reads past a tiny shared endpoint segment to distinguish visibly diverging roads', () => {
    const fixture = fork([0, 0], ['Main', 'Side road']);
    fixture.roads.get(1)!.points = [[0, 0, 0], [0, 0.1, 0], [5, 20, 0]];
    fixture.roads.get(2)!.points = [[0, 0, 0], [0, 0.1, 0], [-5, 20, 0]];
    const choices = classifyTurnOptions(fixture.incoming, fixture.legal, fixture.roads);
    expect(choices.find(choice => choice.edgeId === 1)?.label).toBe('Straight');
    expect(choices.find(choice => choice.edgeId === 2)?.label).toBe('Left');
    expect(chooseTurnOption(choices, 'Main', 'LEFT')?.edgeId).toBe(2);
  });

  it('keeps the sole physical inverse a U-turn even when the source road curves', () => {
    const fixture = fork([0], ['Main']);
    fixture.roads.set(1, { ...fixture.incoming, id: 1, from: 1, to: 0, points: [...fixture.incoming.points].reverse() });
    const choices = classifyTurnOptions(fixture.incoming, fixture.legal, fixture.roads);
    expect(choices[0].label).toBe('U-turn');
  });

  it.each([160, -160, 179, -179])('makes a distinct %i° hairpin branch selectable without calling it a reversal', angle => {
    const { choices } = fork([0, angle], ['Main', 'Loop ramp']);
    const direction = angle > 0 ? 'LEFT' : 'RIGHT';
    expect(choices.find(choice => choice.edgeId === 2)?.label).toBe(angle > 0 ? 'Left' : 'Right');
    expect(chooseTurnOption(choices, 'Main', direction)?.edgeId).toBe(2);
  });

  it('does not add unknown, illegal, or inverse roads or mutate cached input choices', () => {
    const fixture = fork([0, -5], ['Main', 'Ramp']);
    const before = JSON.stringify(fixture.legal);
    const choices = classifyTurnOptions(fixture.incoming, fixture.legal.slice(0, 1), fixture.roads);
    expect(choices.map(choice => choice.edgeId)).toEqual([1]);
    expect(JSON.stringify(fixture.legal)).toBe(before);
    expect(chooseTurnOption([], 'Main')).toBeNull();
  });

  it('keeps alternatives with identical headings individually addressable and orders them deterministically', () => {
    const fixture = fork([0, 0, 0], ['Main', 'Ramp A', 'Ramp B']);
    const a = classifyTurnOptions(fixture.incoming, fixture.legal, fixture.roads);
    const b = classifyTurnOptions(fixture.incoming, [...fixture.legal].reverse(), fixture.roads);
    expect(a).toEqual(b);
    expect(new Set(a.map(choice => choice.edgeId)).size).toBe(3);
    expect(a.filter(choice => choice.label === 'Straight')).toHaveLength(1);
  });
});

describe('real Webster junction regressions', () => {
  let graph: RoadGraph;
  let sourceChoices: Map<number, number[]>;
  beforeAll(() => {
    const bytes = gunzipSync(readFileSync(new URL('../../../../data/derived/town/engine-network.json.gz', import.meta.url)));
    graph = new RoadGraph(JSON.parse(bytes.toString('utf8')));
    const original = JSON.parse(gunzipSync(readFileSync(new URL('../../../../data/derived/town/engine-golden.json.gz', import.meta.url))).toString('utf8'));
    sourceChoices = new Map(original.paths.map((row: { edgeId: number; choices: Choice[] }) => [row.edgeId, row.choices.map(choice => choice.edgeId).sort((a, b) => a - b)]));
  }, 30_000);

  function choices(edgeId: number): Choice[] {
    return classifyTurnOptions(graph.edges.get(edgeId)!, graph.choices(edgeId), graph.edges);
  }

  it.each([
    [0, 5, 2426], [2, 3, 2453], [6, 11, 2480], [7, 10, 2465], [12, 9, 2474],
  ])('offers the I-395 exit on approach %i without treating it as a second straight road', (from, through, ramp) => {
    const options = choices(from);
    expect(options.find(choice => choice.edgeId === through)?.label).toBe('Straight');
    expect(options.find(choice => choice.edgeId === ramp)?.label).toBe('Right');
    expect(chooseTurnOption(options, graph.edges.get(from)!.name, 'RIGHT')?.edgeId).toBe(ramp);
  });

  it.each([
    [2603, 1231, 'Right'], [921, 1523, 'Left'], [2726, 2128, 'Right'], [2242, 2422, 'Right'], [734, 1487, 'Right'],
  ] as const)('makes Webster approach %i → %i selectable as %s', (from, target, label) => {
    const options = choices(from);
    expect(options.find(choice => choice.edgeId === target)?.label).toBe(label);
    expect(chooseTurnOption(options, graph.edges.get(from)!.name, label === 'Left' ? 'LEFT' : 'RIGHT')?.edgeId).toBe(target);
  });

  it.each([
    [2628, 2438, 'RAMP-RT 16 TO RT 395 SB'],
    [2245, 2422, 'RAMP-CUDWORTH RD TO RT 395 NB'],
    [2683, 2128, 'LAKE STREET'],
  ])('allows Left from approach %i onto sharp branch %i (%s)', (from, target, name) => {
    const options = choices(from);
    const branch = options.find(choice => choice.edgeId === target);
    expect(branch?.name).toBe(name);
    expect(branch?.angleDeg).toBeGreaterThan(150);
    expect(branch?.label).toBe('Left');
    expect(chooseTurnOption(options, graph.edges.get(from)!.name, 'LEFT')?.edgeId).toBe(target);
  });

  it('retains every original legal-edge set, including all blocked-turn and obstacle exclusions', () => {
    for (const edge of graph.edges.values()) {
      const described = choices(edge.id);
      expect(described.map(choice => choice.edgeId).sort((a, b) => a - b), `edge ${edge.id}`).toEqual(sourceChoices.get(edge.id));
      expect(described.filter(choice => choice.label === 'Straight').length, `edge ${edge.id}`).toBeLessThanOrEqual(1);
      for (const choice of described) {
        expect(Number.isFinite(choice.angleDeg)).toBe(true);
        expect(graph.edges.get(choice.edgeId)!.from).toBe(edge.to);
        expect(graph.blockedTurns.has(`${edge.id},${choice.edgeId}`)).toBe(false);
      }
    }
  });
});
