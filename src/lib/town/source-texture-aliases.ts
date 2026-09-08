import * as THREE from 'three';
import type { GLTFLoader, GLTFLoaderPlugin, GLTFParser } from 'three/examples/jsm/loaders/GLTFLoader.js';
import catalog from '../../../data/derived/town/source-texture-aliases.json';
import release from '../../../data/derived/town/release.json';
const aliases = new Map(catalog.aliases.map(row => [row.from, row.to]));
const installed = new WeakSet<GLTFLoader>(), loadedImages = new WeakMap<object,string>();
type Delegate = { load(url:string, loaded:(value:object)=>void, progress:((event:ProgressEvent)=>void)|undefined, failed:(error:unknown)=>void):unknown };
export function canonicalSourceTextureURL(source: string): string | undefined {
  if (catalog.sourceManifestSha256 !== release.manifestSha256 || catalog.directory !== release.directory) return;
  let url: URL; try { url = new URL(source); } catch { return; }
  const prefix = `/town-assets/${release.directory}/`;
  if (!url.pathname.startsWith(prefix)) return;
  const target = aliases.get(url.pathname.slice(prefix.length)); if (!target) return;
  url.pathname = prefix + target; return url.href;
}
/** Identical files get one cache/material identity. Existing decoder, samplers
 * and source files are untouched. A missing canonical file retries the original. */
export function installSourceTextureAliases(loader: GLTFLoader): void {
  if (installed.has(loader)) return; installed.add(loader);
  loader.register((parser:GLTFParser):GLTFLoaderPlugin & {name:string} => ({
    name:'WEBSTER_IDENTICAL_SOURCE_TEXTURES',
    loadTexture(index:number) {
      const source = parser.json.textures?.[index]?.source, uri = parser.json.images?.[source]?.uri;
      if (typeof uri !== 'string') return null;
      let original: string; try { original = new URL(uri,parser.options.path).href; } catch { return null; }
      const canonical = canonicalSourceTextureURL(original); if (!canonical) return null;
      const delegate = parser.textureLoader, proxy = Object.create(delegate) as THREE.Loader & Delegate;
      proxy.load = (_url,loaded,progress,failed) => {
        const request = (url:string, fallback:boolean):unknown => {
          const error = (reason:unknown) => fallback ? request(original,false) : failed?.(reason);
          try {
            return (delegate as unknown as Delegate).load(url,value => {
              const image = value instanceof THREE.Texture ? value.source.data : value;
              if (image && typeof image === 'object') loadedImages.set(image,url);
              loaded(value);
            },progress,error);
          } catch(reason) { return error(reason); }
        };
        return request(canonical,true);
      };
      return parser.loadTextureImage(index,source,proxy);
    },
  }));
}
export function sourceTextureLoadedURL(texture: THREE.Texture): string | undefined {
  const image = texture.source?.data ?? texture.image;
  return image && typeof image === 'object' ? loadedImages.get(image) : undefined;
}
