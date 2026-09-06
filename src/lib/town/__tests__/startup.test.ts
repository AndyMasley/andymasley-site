// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { LANDMARKS, RoadGraph, spawnAtLandmark, type LandmarkKey } from '../engine';
import { startupPosition } from '../startup';
import type { AssetRef, V3, WorldManifest } from '../contracts';
import startup from '../../../../data/derived/town/startup.json';
import release from '../../../../data/derived/town/release.json';

// Existing committed fixture: available in CI before prebuild fetches scene assets.
const networkBytes = gunzipSync(readFileSync(new URL('../../../../data/derived/town/engine-network.json.gz', import.meta.url)));
const sourceBytes = readFileSync(new URL('../engine.ts', import.meta.url));
const sourceSnapshot = JSON.parse(readFileSync(new URL('../../../../data/derived/town/startup.json', import.meta.url), 'utf8')) as typeof startup;
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const keys = Object.keys(LANDMARKS) as LandmarkKey[];
let graph: RoadGraph;

function manifest(): WorldManifest & { network: AssetRef } {
  const origins = new Map(Object.values(startup.locations).map(hint => [hint.tileId, hint.tileOrigin as V3]));
  return {
    version: 1, tileSizeM: startup.tileSizeM, network: { url: 'network.json', bytes: networkBytes.length, sha256: startup.networkSha256 },
    coordinates: { axes: 'Y_UP', conversion: '(x,z,-y)', sourceCRS: 'EPSG:6491', horizontalOrigin: [1, 2], sourceVerticalOffsetM: 100 },
    tiles: [...origins].map(([id, origin]) => ({ id, origin: [...origin], bounds: { min: [origin[0], 0, origin[2] - startup.tileSizeM], max: [origin[0] + startup.tileSizeM, 100, origin[2]] }, lods: [{ level: 0, url: `tiles/${id}-0.glb`, bytes: 1 }] })),
    fallback: { url: 'fallback.glb', bytes: 1 }, trees: { prototypes: [] },
    car: { url: 'car.glb', bytes: 1, forward: '-Z', wheelNodes: [] }, stats: {},
  };
}

beforeAll(() => { graph = new RoadGraph(JSON.parse(networkBytes.toString('utf8'))); }, 30_000);

describe('Exact startup lane hints', () => {
  it('binds all six positions to the committed network, engine source, and pinned scene release', () => {
    expect(startup.version).toBe(1);
    expect(startup.directory).toBe(release.directory);
    expect(startup.manifestSha256).toBe(release.manifestSha256);
    expect(startup.networkSha256).toBe(hash(networkBytes));
    expect(startup.engineSourceSha256).toBe(hash(sourceBytes));
    expect(Object.keys(startup.locations).sort()).toEqual([...keys].sort());
  });

  it.each(keys)('matches the current guided engine spawn exactly at %s', key => {
    const engine = spawnAtLandmark(graph, key), hint = sourceSnapshot.locations[key], pose = engine.pose();
    expect(hint.edgeId).toBe(engine.edgeId);
    expect(hint.road).toBe(engine.edge.name);
    expect(hint.s).toBe(engine.s);
    expect(hint.pose).toEqual(pose);
    const position: V3 = [pose[0][0], pose[0][2], -pose[0][1]];
    expect(hint.worldPosition.map(Number)).toEqual(position);
    expect(startupPosition(key, manifest())).toEqual(position);
  });

  it('returns an independent position so consumers cannot mutate the shared snapshot', () => {
    const original = startup.locations.DOWNTOWN.worldPosition.map(Number);
    const position = startupPosition('DOWNTOWN', manifest())!;
    position[0] += 1000;
    expect(startup.locations.DOWNTOWN.worldPosition.map(Number)).toEqual(original);
    expect(startupPosition('DOWNTOWN', manifest())).toEqual(original);
  });

  it('declines hints for an unknown network or changed scene grid', () => {
    const wrongNetwork = manifest(); wrongNetwork.network.sha256 = 'changed';
    expect(startupPosition('DOWNTOWN', wrongNetwork)).toBeUndefined();
    const missingHash = manifest(); delete missingHash.network.sha256;
    expect(startupPosition('DOWNTOWN', missingHash)).toBeUndefined();
    const wrongGrid = manifest(); wrongGrid.tileSizeM = 500;
    expect(startupPosition('DOWNTOWN', wrongGrid)).toBeUndefined();
  });

  it('declines hints if their actual owning tile is missing, moved, or lacks scenery', () => {
    const id = startup.locations.DOWNTOWN.tileId;
    const missing = manifest(); missing.tiles = missing.tiles.filter(tile => tile.id !== id);
    expect(startupPosition('DOWNTOWN', missing)).toBeUndefined();
    const moved = manifest(); moved.tiles.find(tile => tile.id === id)!.origin[0] += 1;
    expect(startupPosition('DOWNTOWN', moved)).toBeUndefined();
    const empty = manifest(); empty.tiles.find(tile => tile.id === id)!.lods = [];
    expect(startupPosition('DOWNTOWN', empty)).toBeUndefined();
  });

  it('declines an unknown starting location instead of guessing a landmark centre', () => {
    expect(startupPosition('UNKNOWN' as LandmarkKey, manifest())).toBeUndefined();
  });
});
