// @vitest-environment node
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import index from '../../../../data/derived/town/foundation-wall-index.json';
import { applyFoundationWallFinish, foundationWallAsset, validFoundationWallPacket, type FoundationWallPacket } from '../foundation-wall-finish';
const packets = Object.entries(index.tiles).map(([id, asset]) => ({ id, asset, raw:readFileSync('public'+asset.url) }));
const first = JSON.parse(packets[0].raw.toString()) as FoundationWallPacket;

describe('Source-qualified streamed wall registrations', () => {
  it('ships only valid, compact packets with exact references and unique building ownership', () => {
    const ids = new Set<string>();
    for (const {id,asset,raw} of packets) {
      expect(raw.length).toBe(asset.bytes);
      expect(createHash('sha256').update(raw).digest('hex')).toBe(asset.sha256);
      const p=JSON.parse(raw.toString()) as FoundationWallPacket;
      expect(validFoundationWallPacket(p,id),id).toBe(true);
      for(const r of p.rows){expect(ids.has(r[0]),r[0]).toBe(false);ids.add(r[0]);}
      expect(foundationWallAsset(id)).toBe(asset);
    }
    expect(ids.size).toBe(3205);
    expect(foundationWallAsset('unregistered')).toBeUndefined();
  });

  it('rejects stale LOD source, wrong origin, malformed supports and missing material registration', () => {
    const group = new THREE.Group(), sha=first.sourceSha256[0], origin=first.origin;
    expect(applyFoundationWallFinish(group,first.tileId,origin,0,'a'.repeat(64),first)).toMatchObject({rejected:true});
    expect(applyFoundationWallFinish(group,first.tileId,[1,2,3],0,sha,first)).toMatchObject({rejected:true});
    for(const edit of ['manifest','floor','segments','material'] as const){
      const p=structuredClone(first);
      if(edit==='manifest')p.sourceManifestSha256='a'.repeat(64);
      if(edit==='floor')(p.rows[0] as unknown as number[])[1]=NaN;
      if(edit==='segments')(p.rows[0] as unknown as unknown[])[5]=[1,2,3];
      if(edit==='material')(p.rows[0] as unknown as unknown[])[4]=9999;
      expect(validFoundationWallPacket(p,first.tileId),edit).toBe(false);
    }
    expect(group.children).toHaveLength(0);
  });
});
