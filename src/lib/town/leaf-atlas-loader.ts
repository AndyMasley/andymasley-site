import * as THREE from 'three';
import type{GLTFLoader,GLTFLoaderPlugin,GLTFParser}from'three/examples/jsm/loaders/GLTFLoader.js';
import release from '../../../data/derived/town/release.json';
import atlas from '../../../data/derived/town/leaf-atlas.json';
export const LEAF_ATLAS=atlas;
const installed=new WeakSet<GLTFLoader>(),loadedImages=new WeakMap<object,string>();
type Delegate={load(url:string,onLoad:(value:object)=>void,onProgress:((event:ProgressEvent)=>void)|undefined,onError:(error:unknown)=>void):unknown};
/** The normal glTF loader still owns decoding/samplers/lifetime. Only this pinned
 * source atlas request changes. A failed art asset retries the unchanged source. */
export function installLeafAtlasOverride(loader:GLTFLoader):void{
 if(installed.has(loader))return;installed.add(loader);
 loader.register((parser:GLTFParser):GLTFLoaderPlugin&{name:string}=>({name:'WEBSTER_CURVED_LEAF_ATLAS',loadTexture(index:number){
  const definition=parser.json.textures?.[index],source=definition?.source,uri=parser.json.images?.[source]?.uri;
  let sourceURL:URL;try{sourceURL=new URL(uri,parser.options.path);}catch{return null;}
  if(uri!==atlas.sourceUri||sourceURL.pathname!==`/town-assets/${release.directory}/textures/leaf-cluster.png`)return null;
  const delegate=parser.textureLoader,proxy=Object.create(delegate) as THREE.Loader & Delegate;
  const replacement=new URL(atlas.url,sourceURL).href,original=sourceURL.href;
  proxy.load=(_url,onLoad,onProgress,onError)=>{
   const request=(url:string,fallback:boolean):unknown=>{
    const failed=(error:unknown)=>fallback?request(original,false):onError?.(error);
    try{return(delegate as unknown as Delegate).load(url,value=>{const image=value instanceof THREE.Texture?value.source.data:value;if(image&&typeof image==='object')loadedImages.set(image,url);onLoad?.(value);},onProgress,failed);}catch(error){return failed(error);}
   };
   return request(replacement,true);
  };
  return parser.loadTextureImage(index,source,proxy);
 }}));
}
/** Use before material pooling; shared ImageBitmaps retain their actual identity
 * across glTF texture clones and retain the normal reference-counted disposer. */
export function leafAtlasTextureURL(texture:THREE.Texture):string|undefined{
 const image=texture.source?.data??texture.image;
 return image&&typeof image==='object'?loadedImages.get(image):undefined;
}
