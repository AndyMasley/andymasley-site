// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import type { GLTFLoader, GLTFLoaderPlugin, GLTFParser } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { canonicalSourceTextureURL, installSourceTextureAliases, sourceTextureLoadedURL } from '../source-texture-aliases';
import catalog from '../../../../data/derived/town/source-texture-aliases.json';
import release from '../../../../data/derived/town/release.json';
const alias = catalog.aliases[0], base = `https://example.test/town-assets/${release.directory}/`;
function fixture(fallback=false,bitmap=false) {
  let plugin!: GLTFLoaderPlugin;
  const image={width:8,height:8,close:vi.fn()},texture=new THREE.Texture(image);
  const load=vi.fn((url:string,done:(value:object)=>void,_progress:unknown,failed:(reason:Error)=>void)=>{
    if(fallback&&url===base+alias.to)failed(new Error('404'));else done(bitmap?image:texture);
  });
  const parser={json:{textures:[{source:0}],images:[{uri:'../'+alias.from}]},options:{path:base+'models/'},textureLoader:{load,isImageBitmapLoader:bitmap},
    loadTextureImage:(_texture:number,_source:number,delegate:THREE.Loader)=>new Promise<THREE.Texture>((resolve,reject)=>{
      (delegate as unknown as {load:typeof load}).load('not used',value=>resolve(bitmap?new THREE.Texture(value as ImageBitmap):value as THREE.Texture),undefined,reject);
    })} as unknown as GLTFParser;
  const register=vi.fn((factory:(parser:GLTFParser)=>GLTFLoaderPlugin)=>{plugin=factory(parser);return loader;});
  const loader={register} as unknown as GLTFLoader; installSourceTextureAliases(loader);return{plugin,loader,load,image,register};
}
describe('exact source texture aliases',()=>{
  it('uses only the pinned release and exact image path; aliases are acyclic and hash-bound',()=>{
    expect(catalog.sourceManifestSha256).toBe(release.manifestSha256);
    expect(canonicalSourceTextureURL(base+alias.from)).toBe(base+alias.to);
    expect(canonicalSourceTextureURL(base+'textures/not-present.png')).toBeUndefined();
    expect(canonicalSourceTextureURL(base.replace(release.directory,'old')+alias.from)).toBeUndefined();
    const from=new Set(catalog.aliases.map(row=>row.from));
    for(const row of catalog.aliases){expect(from.has(row.to)).toBe(false);expect(row.sha256).toMatch(/^[a-f0-9]{64}$/);expect(row.bytes).toBeGreaterThan(0);}
  });
  it.each([false,true])('preserves delegate decoding and image ownership for bitmap=%s',async bitmap=>{
    const f=fixture(false,bitmap),texture=await f.plugin.loadTexture!(0)!;
    expect(f.load).toHaveBeenCalledTimes(1);expect(f.load.mock.calls[0][0]).toBe(base+alias.to);
    expect(sourceTextureLoadedURL(texture)).toBe(base+alias.to);expect(sourceTextureLoadedURL(texture.clone())).toBe(base+alias.to);
    expect(f.image.close).not.toHaveBeenCalled();installSourceTextureAliases(f.loader);expect(f.register).toHaveBeenCalledOnce();
  });
  it('retries the original URI and records the actual fallback image identity',async()=>{
    const f=fixture(true,true),texture=await f.plugin.loadTexture!(0)!;
    expect(f.load.mock.calls.map(row=>row[0])).toEqual([base+alias.to,base+alias.from]);
    expect(sourceTextureLoadedURL(texture)).toBe(base+alias.from);expect(f.image.close).not.toHaveBeenCalled();
  });
});
