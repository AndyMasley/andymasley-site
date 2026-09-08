import * as THREE from 'three';
import catalog from '../../../data/derived/town/bathhouse-grounds.json';
import release from '../../../data/derived/town/release.json';
import { applyGroundedSiteFeatures, type GroundedSiteRecord } from './arrival-grounds';
import type { V3 } from './contracts';

const tiles = catalog.tiles as Record<string, {origin:number[];lods:{level:number;sha256:string}[];features:string[]}>;
const records = new Map<string, GroundedSiteRecord>();
function record(tileId:string):GroundedSiteRecord|undefined {
 const tile=tiles[tileId];if(!tile)return;
 const prior=records.get(tileId);if(prior)return prior;
 const ids=new Set(tile.features);const value={...tile,features:catalog.features.filter(f=>ids.has(f.id)).map(f=>({...f,basis:catalog.policy,triangles:Array.from({length:f.indices.length/3},(_,i)=>f.indices.slice(i*3,i*3+3).map(k=>f.points[k]))}))};records.set(tileId,value);return value;
}
/** The dated aerial trace includes a real approach and curved forecourt. The
 * round island and existing court are excluded; no garden or fixture inventory
 * is invented. The shared draper samples final retained terrain at every vertex.
 * A short connection to the existing authored entrance slab is labeled inferred.
 */
export function applyBathhouseGrounds(group: THREE.Group, tileId: string, origin: V3, level: number, sourceSha256: string) {
  if (catalog.sourceManifestSha256 !== release.manifestSha256) return;
  return applyGroundedSiteFeatures(group, tileId, origin, level, sourceSha256, record(tileId), 'bathhouseGrounds', 'Memorial Beach bathhouse forecourt');
}
