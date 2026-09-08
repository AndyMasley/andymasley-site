// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { installLeafAtlasOverride, leafAtlasTextureURL, LEAF_ATLAS } from '../leaf-atlas-loader';
import { installSourceTextureAliases, sourceTextureLoadedURL } from '../source-texture-aliases';
import { TextureLifetime } from '../texture-lifetime';
import aliases from '../../../../data/derived/town/source-texture-aliases.json';
import release from '../../../../data/derived/town/release.json';

/** Exercise the real GLTF parser's plug-in order, texture cloning and sampler
 * application. Only the browser image decoder is replaced by a native fixture. */
describe('combined source texture loading through the actual glTF parser',()=>{
  it.each([false,true])('preserves source sampler and last image owner with optional-image fallback=%s',async fallback=>{
    const base=`https://example.test/town-assets/${release.directory}/`,alias=aliases.aliases[0],requests:string[]=[],images:{width:number;height:number;close:ReturnType<typeof vi.fn>}[]=[];
    const loader=new GLTFLoader();
    loader.register(parser=>{
      const delegate={load(url:string,done:(t:THREE.Texture)=>void,_progress:unknown,failed:(e:Error)=>void){
        requests.push(url);
        if(fallback&&(url.includes('/town-finish/')||url===base+alias.to)){failed(new Error('fixture optional 404'));return;}
        const image={width:512,height:512,close:vi.fn()};images.push(image);const texture=new THREE.Texture(image);done(texture);return texture;
      }};
      Object.assign(parser,{textureLoader:delegate});return{name:'NATIVE_IMAGE_DECODER_FIXTURE',beforeRoot:async()=>{}};
    });
    installLeafAtlasOverride(loader);installSourceTextureAliases(loader);
    const positions=new Float32Array([0,0,0,1,0,0,0,1,0]),buffer=Buffer.from(positions.buffer);
    const gltf={asset:{version:'2.0'},scene:0,scenes:[{nodes:[0]}],nodes:[{mesh:0}],meshes:[{primitives:[0,1].map(material=>({attributes:{POSITION:0},material}))}],buffers:[{uri:'data:application/octet-stream;base64,'+buffer.toString('base64'),byteLength:buffer.byteLength}],bufferViews:[{buffer:0,byteLength:buffer.byteLength}],accessors:[{bufferView:0,componentType:5126,count:3,type:'VEC3',min:[0,0,0],max:[1,1,0]}],materials:[0,1].map(index=>({pbrMetallicRoughness:{baseColorTexture:{index}}})),textures:[{source:0,sampler:0},{source:1,sampler:0}],images:[{uri:'../'+alias.from},{uri:LEAF_ATLAS.sourceUri}],samplers:[{wrapS:33648,wrapT:33071,minFilter:9728,magFilter:9728}]};
    class ProgressEventFixture {constructor(readonly type:string,readonly init:unknown){}}
    vi.stubGlobal('ProgressEvent',ProgressEventFixture);vi.stubGlobal('self',{URL});
    try{
      const parsed=await loader.parseAsync(JSON.stringify(gltf),base+'models/'),maps:THREE.Texture[]=[];
      parsed.scene.traverse(o=>{if(o instanceof THREE.Mesh){const material=o.material as THREE.MeshStandardMaterial;maps.push(material.map!);}});
      expect(maps).toHaveLength(2);
      for(const map of maps){expect(map.wrapS).toBe(THREE.MirroredRepeatWrapping);expect(map.wrapT).toBe(THREE.ClampToEdgeWrapping);expect(map.minFilter).toBe(THREE.NearestFilter);expect(map.magFilter).toBe(THREE.NearestFilter);expect(map.flipY).toBe(false);expect(map.colorSpace).toBe(THREE.SRGBColorSpace);}
      expect(sourceTextureLoadedURL(maps[0])).toBe(base+(fallback?alias.from:alias.to));
      expect(leafAtlasTextureURL(maps[1])).toBe(fallback?base+'textures/leaf-cluster.png':'https://example.test'+LEAF_ATLAS.url);
      expect(requests).toHaveLength(fallback?4:2);
      const lifetime=new TextureLifetime();
      for(const map of maps){const clone=map.clone();lifetime.register(map);lifetime.register(clone);lifetime.release(map);expect(map.image.close).not.toHaveBeenCalled();lifetime.release(clone);expect(map.image.close).toHaveBeenCalledOnce();}
      parsed.scene.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();(o.material as THREE.Material).dispose();}});
    }finally{vi.unstubAllGlobals();}
  });
});
