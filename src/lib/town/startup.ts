import startup from '../../../data/derived/town/startup.json';
import release from '../../../data/derived/town/release.json';
import type { LandmarkKey } from './engine';
import type { V3, WorldManifest } from './contracts';

/** Exact, version-bound lane position for warming scenery before graph parsing. */
export function startupPosition(key: LandmarkKey, manifest: WorldManifest): V3 | undefined {
  const network = (manifest as WorldManifest & { network?: { sha256?: string } }).network;
  if (startup.version !== 1 || startup.directory !== release.directory ||
    startup.manifestSha256 !== release.manifestSha256 || network?.sha256 !== startup.networkSha256 ||
    (manifest.tileSizeM ?? 250) !== startup.tileSizeM) return;
  const hint = startup.locations[key];
  if (!hint || hint.worldPosition.length !== 3) return;
  // Preserve the original double through JSON bundlers that rewrite numeric literals.
  const position = hint.worldPosition.map(Number);
  if (!position.every(Number.isFinite)) return;
  const size = startup.tileSizeM;
  const owner = manifest.tiles.find(tile => position[0] >= tile.origin[0] && position[0] < tile.origin[0] + size &&
    position[2] <= tile.origin[2] && position[2] > tile.origin[2] - size);
  if (owner?.id !== hint.tileId || !owner.lods.length || !owner.origin.every((value, i) => value === hint.tileOrigin[i])) return;
  // Callers may move vectors; never let a scene mutate the shared snapshot.
  return [...position] as V3;
}
