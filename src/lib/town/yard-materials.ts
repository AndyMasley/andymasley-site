import * as THREE from 'three';

function repeatTexture(data: Uint8Array<ArrayBuffer>, size: number): THREE.DataTexture {
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

/** Source observations distinguish pavers from poured concrete; their precise
 * colour and bond were not recorded. This neutral 20 × 10 cm bond is authored. */
export function paverDriveMaterial(): THREE.MeshStandardMaterial {
  const size = 128, data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const row = Math.floor(y / 32), shifted = (x + (row % 2) * 32) % size;
    const col = Math.floor(shifted / 64), edgeX = shifted % 64, edgeY = y % 32;
    const joint = Math.min(edgeX + .5, 63.5 - edgeX, edgeY + .5, 31.5 - edgeY) < .8;
    const grain = ((x * 73 + y * 151 + x * y * 17) % 11) - 5;
    const tone = ((row * 7 + col * 11) % 5) * 3 - 6 + grain;
    const color = joint ? [92, 90, 84] : [158 + tone, 155 + tone, 146 + tone];
    data.set([...color, 255], (y * size + x) * 4);
  }
  const texture = repeatTexture(data, size);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.MeshStandardMaterial({ color: '#ffffff', map: texture, bumpMap: texture, bumpScale: .008, roughness: .96, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  material.name = 'House dressing | paver drive';
  material.userData.townCrafted = true;
  return material;
}

/** Open diamond mesh, not tinted glass. The 8 cm repeat and wire gauge are
 * authored defaults; the fence category and its run come from source evidence. */
export function chainLinkMaterial(): THREE.MeshStandardMaterial {
  const size = 128, data = new Uint8Array(size * size * 4);
  const distance = (v: number) => Math.abs(v - Math.round(v));
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = (x + .5) / size, v = (y + .5) / size;
    const d = Math.min(distance(u + v), distance(u - v));
    const alpha = Math.round(255 * THREE.MathUtils.clamp((.026 - d) * size, 0, 1));
    data.set([alpha, alpha, alpha, 255], (y * size + x) * 4);
  }
  const material = new THREE.MeshStandardMaterial({ color: '#9a9d9b', roughness: .5, metalness: .5, alphaMap: repeatTexture(data, size), alphaTest: .01, transparent: true, opacity: 1, depthWrite: false, side: THREE.DoubleSide });
  material.name = 'House dressing | chain-link mesh';
  material.userData.townCrafted = true;
  material.forceSinglePass = true;
  return material;
}

/** Metre-scaled mesh apertures remain continuous across panel subdivisions and
 * follow arbitrary source frontage bearings, independent of tile origin. */
export function chainLinkUV(geometry: THREE.BufferGeometry, origin: readonly number[]): void {
  const p = geometry.getAttribute('position'), n = geometry.getAttribute('normal'), uv: number[] = [];
  for (let i = 0; i < p.count; i++) {
    const length = Math.hypot(n.getX(i), n.getZ(i)) || 1;
    uv.push((-(p.getX(i) + origin[0]) * n.getZ(i) + (p.getZ(i) + origin[2]) * n.getX(i)) / length / .08, (p.getY(i) + origin[1]) / .08);
  }
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
}
