import * as THREE from 'three';

export const TEXTURE_SLOTS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'alphaMap', 'bumpMap', 'displacementMap', 'lightMap', 'envMap'] as const;

export function textureIdentity(texture: THREE.Texture): string {
  // An unnamed generated image is not interchangeable with every other unnamed
  // image. Stable generated atlases explicitly provide a sourceUrl.
  const source = texture.userData?.sourceUrl || texture.image?.src || texture.uuid;
  return JSON.stringify([source, texture.colorSpace, texture.wrapS, texture.wrapT, texture.repeat.toArray(), texture.offset.toArray(), texture.center.toArray(), texture.rotation,
    texture.channel, texture.flipY, texture.minFilter, texture.magFilter, texture.generateMipmaps, texture.format, texture.type, texture.premultiplyAlpha, texture.unpackAlignment]);
}

export function materialIdentity(input: THREE.Material, textureKeys: string[]): string {
  const m = input as THREE.MeshStandardMaterial;
  return JSON.stringify([input.name, input.type, m.color?.toArray(), m.roughness, m.metalness, m.emissive?.toArray(), m.emissiveIntensity,
    m.normalScale?.toArray(), m.bumpScale, m.displacementScale, m.displacementBias, m.aoMapIntensity, m.lightMapIntensity, m.envMapIntensity,
    m.flatShading, m.wireframe, m.vertexColors, input.side, input.shadowSide, input.opacity, input.transparent, input.alphaTest,
    input.depthTest, input.depthWrite, input.depthFunc, input.colorWrite, input.toneMapped, m.fog,
    input.polygonOffset, input.polygonOffsetFactor, input.polygonOffsetUnits, input.blending, input.blendSrc, input.blendDst, input.blendEquation,
    input.premultipliedAlpha, input.stencilWrite, input.stencilFunc, input.stencilRef, input.stencilWriteMask,
    input.clippingPlanes?.map(p => [...p.normal.toArray(), p.constant]), input.clipIntersection, input.clipShadows,
    input.customProgramCacheKey(), m.defines, textureKeys]);
}
