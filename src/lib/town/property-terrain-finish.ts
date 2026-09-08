import * as THREE from 'three';
import index from '../../../data/derived/town/property-terrain-index.json';
import { applyTerrainFinish, terrainFinishAsset, validTerrainFinishPacket, type TerrainFinishPacket, type TerrainFinishReport } from './terrain-finish';
import { environmentGroundAsset } from './environment-ground';
import { streetCornerGroundAsset } from './street-corner-ground';
import type { AssetRef, V3 } from './contracts';

type Predecessor = 'terrain-finish' | 'environment-ground' | 'street-corner-ground';
export type PropertyTerrainPacket = TerrainFinishPacket & {
  sourcePropertySha256: string;
  predecessors: Record<Predecessor, string | null>;
};
export type PropertyTerrainReport = TerrainFinishReport & { precisionSlivers: number; precisionFootprintLossM2: number; maximumPrecisionSliverWidthM: number };
const tiles = index.tiles as Record<string, { origin: number[]; levels: Record<string, AssetRef> }>;
const predecessorNames: Predecessor[] = ['terrain-finish', 'environment-ground', 'street-corner-ground'];
export function propertyTerrainAsset(tileId: string, level = 0): AssetRef | undefined {
  return tiles[tileId]?.levels[String(level)];
}
export function validPropertyTerrainPacket(value: unknown, tileId: string): value is PropertyTerrainPacket {
  if (!validTerrainFinishPacket(value, tileId)) return false;
  const p = value as PropertyTerrainPacket;
  return p.sourcePropertySha256 === index.sourcePropertySha256 && !!p.predecessors
    && predecessorNames.every(key => p.predecessors[key] === null || typeof p.predecessors[key] === 'string' && /^[a-f0-9]{64}$/.test(p.predecessors[key]!));
}
/** An optional bounded mesh repair precedes the property-paving draper. It reuses
 * the retained detailed ground, never shifts a road/water/building vertex, and
 * retains the original attribute arrays as an exact prefix. The narrow blend
 * is an authored construction transition, not newly measured terrain. */
export function applyPropertyTerrainFinish(group: THREE.Group, tileId: string, origin: V3, level: number, sourceSha256: string, packet?: PropertyTerrainPacket): PropertyTerrainReport | TerrainFinishReport | { rejected: true; rejectionReason: string } | undefined {
  if (group.userData.propertyTerrain) return group.userData.propertyTerrain as TerrainFinishReport;
  if (!packet) return;
  const tile = tiles[tileId];
  if (!tile || !tile.levels[String(level)] || !validPropertyTerrainPacket(packet, tileId)
    || tile.origin.some((v, i) => Math.abs(v - origin[i]) > .000001)
    || packet.levels.find(r => r.level === level)?.sourceSha256 !== sourceSha256
    || packet.predecessors['terrain-finish'] !== (terrainFinishAsset(tileId, level)?.sha256 ?? null)
    || packet.predecessors['environment-ground'] !== (environmentGroundAsset(tileId, level)?.sha256 ?? null)
    || packet.predecessors['street-corner-ground'] !== (streetCornerGroundAsset(tileId, level)?.sha256 ?? null)) {
    return { rejected: true, rejectionReason: 'Property terrain source, layout, or predecessor mismatch' };
  }
  const result = applyTerrainFinish(group, tileId, origin, level, packet, 'propertyTerrain', { raise: 1.3, lower: 1.3, footprintToleranceM2: .0005 });
  if (result.rejected) return result;
  const report: PropertyTerrainReport = { ...result, precisionSlivers: 0, precisionFootprintLossM2: 0, maximumPrecisionSliverWidthM: 0 };
  const rows = packet.levels.find(r => r.level === level)!.meshes;
  // Boolean overlay boundaries can differ by less than one Float32 ULP. Their
  // thin remnants have valid area in double precision but unstable slopes after
  // upload. Only appended sub-0.05 mm strips are removed; original faces and
  // all source attribute prefixes remain exact. This does not fill large gaps.
  group.updateMatrixWorld(true);const inverse = group.matrixWorld.clone().invert();
  group.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    const row = rows.find(r => r.mesh === object.name);if (!row) return;
    const g = object.geometry, p = g.getAttribute('position'), ix = g.index!;
    const matrix = inverse.clone().multiply(object.matrixWorld), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    const indices: number[] = [], groups: { start:number;count:number;materialIndex?:number }[] = [];
    for (const group of g.groups) {
      const start = indices.length;
      for (let i=group.start;i<group.start+group.count;i+=3) {
        const ids = [ix.getX(i),ix.getX(i+1),ix.getX(i+2)];
        if (ids.every(id=>id>=row.positions)) {
          a.fromBufferAttribute(p,ids[0]).applyMatrix4(matrix);b.fromBufferAttribute(p,ids[1]).applyMatrix4(matrix);c.fromBufferAttribute(p,ids[2]).applyMatrix4(matrix);
          const twiceArea = Math.abs((b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x));
          const longest = Math.max(Math.hypot(a.x-b.x,a.z-b.z),Math.hypot(a.x-c.x,a.z-c.z),Math.hypot(b.x-c.x,b.z-c.z));
          const width = twiceArea / longest;
          if (width < .00005 && twiceArea < .002) { report.precisionSlivers++;report.precisionFootprintLossM2+=twiceArea*.5;report.maximumPrecisionSliverWidthM=Math.max(report.maximumPrecisionSliverWidthM,width);continue; }
        }
        indices.push(...ids);
      }
      groups.push({start,count:indices.length-start,materialIndex:group.materialIndex});
    }
    g.setIndex(indices);g.clearGroups();for(const range of groups)g.addGroup(range.start,range.count,range.materialIndex);
  });
  report.addedTriangles-=report.precisionSlivers;group.userData.propertyTerrain=report;return report;
}
