// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { DriveEngine, RoadGraph } from '../engine';
import { displayChoices, displayRoadName, turnDistanceLabel } from '../road-display';
import { qualityPixelRatio, readPreferences, readSnapshot, restoreSnapshot, saveSnapshot, snapshotDrive, type StorageLike } from '../ux-state';

function graph() { return new RoadGraph({ edges: [
  { id: 0, from: 0, to: 1, name: 'MAIN STREET', points: [[0, -250, 0], [0, 0, 0]] },
  { id: 1, from: 1, to: 2, name: 'MAIN STREET', points: [[0, 0, 0], [0, 80, 0]] },
  { id: 2, from: 2, to: 3, name: 'Unnamed road', points: [[0, 80, 0], [-100, 170, 0]] },
  { id: 3, from: 2, to: 4, name: 'Unnamed road', points: [[0, 80, 0], [0, 200, 0]] },
  { id: 4, from: 3, to: 5, name: 'End', points: [[-100, 170, 0], [-200, 250, 0]] },
] }); }
const storage = (): StorageLike => { const values = new Map<string, string>(); return { getItem: k => values.get(k) ?? null, setItem: (k, v) => { values.set(k, v); } }; };

describe('truthful guided turn feedback', () => {
  it('anchors an exact branch to its displayed junction when a loop traverses that same edge earlier', () => {
    const roads = new RoadGraph(JSON.parse(gunzipSync(readFileSync(new URL('../../../../data/derived/town/engine-network.json.gz', import.meta.url))).toString()));
    for (const [from, target, junction] of [[710, 1576, 1577], [1345, 1347, 1335]]) {
      const engine = new DriveEngine(roads, from); expect(engine.nextJunction()?.edgeId).toBe(junction);
      expect(engine.queueChoice(target)).toBe(true); const distance = engine.nextJunction()!.distance;
      engine.advance(distance + 0.00001);
      expect(engine.phase).toBe('TURN'); expect(engine.edgeId).toBe(junction); expect(engine.connection?.nextId).toBe(target);
      expect(engine.queuedEdge).toBe(null); expect(engine.queuedJunction).toBe(null);
    }
  });
  it('rejects an unavailable arrow without replacing an already valid exact choice', () => {
    const engine = new DriveEngine(graph()); engine.queueChoice(2); engine.queue('RIGHT');
    expect(engine.queuedEdge).toBe(2); expect(engine.nextJunction()?.selected?.edgeId).toBe(2);
    expect(engine.lastMessage).toContain('No right branch'); expect(engine.lastMessage).toContain('remains selected');
  });
  it('counts intervening connector distance to the actual decision commitment', () => {
    const engine = new DriveEngine(graph()); engine.queue('LEFT');
    const distance = engine.nextJunction()!.distance;
    engine.advance(distance - 0.01);
    expect(engine.edgeId).toBe(1); expect(engine.phase).toBe('ROAD');
    engine.advance(0.02);
    expect(engine.phase).toBe('TURN'); expect(engine.connection?.nextId).toBe(2);
    expect(engine.queued).toBe(null);
  });
  it('can establish a stopped obstruction state without a positive travel increment', () => {
    const engine = new DriveEngine(new RoadGraph({ edges: [{ id: 0, from: 0, to: 1, points: [[0, 0, 0], [0, 100, 0]], blocked_spans: [{ from_m: 0, lane_from_m: 0 }] }] }));
    for (let i = 0; i < 10; i++) engine.step(1 / 60, true);
    expect(engine.speed).toBe(0); expect(engine.s).toBe(0); expect(engine.endOfRoute).toBe(true); expect(engine.cruiseAtLimit).toBe(false); expect(engine.lastMessage).toContain('obstructs');
  });
  it('offers unique, honest compass labels for unnamed choices without renaming graph data', () => {
    const roads = graph(); const names = displayChoices(roads, roads.choices(1)).map(x => x.name);
    expect(new Set(names).size).toBe(2); expect(names.join(' ')).toContain('northwest'); expect(names.join(' ')).toContain('north');
    expect(roads.edges.get(2)?.name).toBe('Unnamed road');
    expect(displayRoadName('MAIN STREET')).toBe('Main Street'); expect(displayRoadName('INTERSTATE 395')).toBe('I-395'); expect(displayRoadName('McDonald Road')).toBe('McDonald Road');
    expect(turnDistanceLabel(0)).toBe('now');
  });
});

describe('safe preferences and paused resume', () => {
  it('uses the same device-capped detail DPR at startup and on a later change', () => {
    expect(qualityPixelRatio('low', false, 2)).toBe(1); expect(qualityPixelRatio('high', false, 2)).toBe(1.8);
    expect(qualityPixelRatio('high', true, 3)).toBe(1.2); expect(qualityPixelRatio('auto', false, 1)).toBe(1);
  });
  it('resumes a source-qualified safe path position paused with zero speed, not its old throttle', () => {
    const roads = graph(), original = new DriveEngine(roads, 0, 50); original.speed = 15; original.cruiseAtLimit = true; original.distance = 300; original.elapsed = 33;
    const saved = snapshotDrive(original, 'network')!; const local = storage(); saveSnapshot(saved, local);
    expect(readSnapshot('different', local)).toBe(null);
    const restored = restoreSnapshot(roads, readSnapshot('network', local)!)!;
    expect(restored.pose()).toEqual(original.pose()); expect(restored.paused).toBe(true); expect(restored.speed).toBe(0); expect(restored.cruiseAtLimit).toBe(false); expect(restored.distance).toBe(300);
  });
  it('does not serialize an executing connector or accept out-of-bounds positions', () => {
    const roads = graph(), engine = new DriveEngine(roads); engine.advance(engine.path.length);
    expect(engine.phase).toBe('TURN'); expect(snapshotDrive(engine, 'network')).toBe(null);
    const saved = snapshotDrive(new DriveEngine(roads), 'network')!;
    expect(restoreSnapshot(roads, { ...saved, edge: 999 })).toBe(null); expect(restoreSnapshot(roads, { ...saved, s: 1e9 })).toBe(null);
  });
  it('plays normally when storage is denied or contains invalid preferences', () => {
    const denied = { getItem() { throw Error('denied'); }, setItem() { throw Error('denied'); } };
    expect(readPreferences(denied).camera).toBe('chase'); expect(readSnapshot('network', denied)).toBe(null);
    expect(() => saveSnapshot(snapshotDrive(new DriveEngine(graph()), 'network'), denied)).not.toThrow();
  });
});
