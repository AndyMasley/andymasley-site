import type { Texture } from 'three';

/** A bitmap can back several Texture objects. Close it only after the last
 * registered texture is disposed, rather than whenever a duplicate map loses
 * its material. GPU disposal and decoded-image disposal are separate duties. */
export class TextureLifetime {
  private textures = new WeakSet<Texture>();
  private released = new WeakSet<Texture>();
  private images = new WeakMap<object, number>();
  private closed = new WeakSet<object>();
  private imageList(texture: Texture): { close: () => void }[] {
    const source = texture.source?.data ?? texture.image;
    const rows = Array.isArray(source) ? source : [source];
    return [...new Set(rows.filter(image => image && typeof image === 'object' && typeof image.close === 'function'))];
  }
  register(texture: Texture): void {
    if (this.textures.has(texture)) return;
    this.textures.add(texture);
    for (const image of this.imageList(texture)) this.images.set(image, (this.images.get(image) ?? 0) + 1);
  }
  release(texture: Texture): void {
    if (this.released.has(texture)) return;
    this.register(texture); this.released.add(texture); texture.dispose();
    for (const image of this.imageList(texture)) {
      const owners = (this.images.get(image) ?? 1) - 1;
      if (owners > 0) this.images.set(image, owners);
      else {
        this.images.delete(image);
        if (!this.closed.has(image)) { this.closed.add(image); image.close(); }
      }
    }
  }
}
