// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import index from '../../../../data/derived/town/paved-surfaces-index.json';
import { pavedMaskReference } from '../paved-surfaces';
import { TownSurfaces } from '../surfaces';
import type { GroundSurfaces } from '../contracts';

afterEach(()=>vi.useRealTimers());
const [id,replacement]=Object.entries(index.masks)[0];
const source={url:'/original.png',bytes:2,sha256:replacement.sourceSha256,bounds:replacement.bounds as [number,number,number,number]};
const definition:GroundSurfaces={grass:{color:{url:'c',bytes:1},normal:{url:'n',bytes:1},roughness:{url:'r',bytes:1},repeatM:1},masks:{[id]:source}};
const group=()=>{const g=new THREE.Group(),m=new THREE.Mesh(new THREE.PlaneGeometry(),new THREE.MeshStandardMaterial());m.name='terrain';g.add(m);return g;};
it('only replaces the exact source mask and coordinate bounds',()=>{
  expect(pavedMaskReference(id,source)?.url).toBe(replacement.url);
  expect(pavedMaskReference(id,{...source,sha256:'0'.repeat(64)})).toBeUndefined();
  expect(pavedMaskReference(id,{...source,bounds:[0,0,1,1]})).toBeUndefined();
});
it('falls back to the source when the optional corrected mask fails',async()=>{
  const read=vi.fn(async(asset:{url:string})=>{if(asset.url===replacement.url)throw new Error('offline');return new THREE.Texture();});
  const surfaces=new TownSurfaces(definition,read),g=group();
  await surfaces.initialize(new AbortController().signal);await surfaces.apply(g,id,new AbortController().signal);
  expect(read.mock.calls.map(([a])=>a.url).slice(-2)).toEqual([replacement.url,source.url]);
  expect(g.userData.pavedSurfaceMask).toBeUndefined();surfaces.dispose();
});
it('bounds the optional mask wait and disposes a late decoded texture',async()=>{
  vi.useFakeTimers();let complete!:(value:THREE.Texture)=>void;
  const read=vi.fn(async(asset:{url:string})=>asset.url===replacement.url?new Promise<THREE.Texture>(r=>{complete=r;}):new THREE.Texture());
  const surfaces=new TownSurfaces(definition,read),g=group(),signal=new AbortController().signal;
  await surfaces.initialize(signal);const pending=surfaces.apply(g,id,signal);
  await vi.advanceTimersByTimeAsync(1500);await pending;
  expect(g.userData.pavedSurfaceMask).toBeUndefined();
  const late=new THREE.Texture(),dispose=vi.spyOn(late,'dispose');complete(late);
  await vi.advanceTimersByTimeAsync(0);expect(dispose).toHaveBeenCalledOnce();surfaces.dispose();
});
