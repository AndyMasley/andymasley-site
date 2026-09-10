import * as THREE from 'three';

export const FOLIAGE_CLUSTER_BASIS = 'VC-0184/0205/0207: authored late-summer branch-cluster shading, with darker interiors and restrained green/yellow-green variation between exposed clusters. Existing twig/card locations, atlas UVs, topology, crown envelope and habitat inference remain unchanged; no individual species is asserted.';

type Card = { ids: number[]; center: THREE.Vector3; normal: THREE.Vector3; radius: number; cluster: THREE.Vector3 };

/** Bake curved cluster lighting into an OWNED copy of an existing leaf mesh.
 * The original leaf atlas supplies the leaf edges. This supplies the volume:
 * normals vary across each card and neighboring twig cards share a light field.
 * No per-frame shader work, new vertices, texture, material, or draw call. */
export function finishLeafClusters(geometry: THREE.BufferGeometry, bounds: THREE.Box3): { cards: number; vertices: number } {
  const position = geometry.getAttribute('position'), uv = geometry.getAttribute('uv'), normal = geometry.getAttribute('normal');
  if (!position || !uv || !normal || !position.count) return { cards: 0, vertices: 0 };
  const parent = Array.from({ length: position.count }, (_, i) => i), index = geometry.index;
  const find = (n: number): number => { while (parent[n] !== n) { parent[n] = parent[parent[n]]; n = parent[n]; } return n; };
  for (let i = 0; i + 2 < (index?.count ?? position.count); i += 3) {
    const ids = [0, 1, 2].map(k => index?.getX(i + k) ?? i + k);
    for (const id of ids) parent[find(id)] = find(ids[0]);
  }
  const components = new Map<number, number[]>();
  for (let i = 0; i < position.count; i++) { const key = find(i), ids = components.get(key) ?? []; ids.push(i); components.set(key, ids); }
  const cards: Card[] = [], point = new THREE.Vector3();
  for (const ids of components.values()) {
    // Fixed source leaf cards have four vertices. Do not reinterpret a branch
    // cylinder, solid crown, or an unexpected connected asset as leaf cards.
    if (ids.length !== 4) continue;
    const center = new THREE.Vector3(), direction = new THREE.Vector3();
    for (const id of ids) { center.add(point.fromBufferAttribute(position, id)); direction.add(point.fromBufferAttribute(normal, id)); }
    center.multiplyScalar(1 / ids.length);
    if (direction.lengthSq() < 1e-10) continue;
    direction.normalize();
    const radius = Math.max(...ids.map(id => point.fromBufferAttribute(position, id).distanceTo(center)));
    if (!Number.isFinite(radius) || radius < 1e-6) continue;
    cards.push({ ids, center, normal: direction, radius, cluster: center.clone() });
  }
  if (!cards.length) return { cards: 0, vertices: 0 };
  // The source places five cards around each authored twig. Nearest-card groups
  // are shading neighborhoods only; they never create measured branch claims.
  for (const card of cards) {
    const neighbors: { other: Card; distance: number }[] = [];
    for (const other of cards) {
      const distance = other.center.distanceToSquared(card.center);
      if (neighbors.length === 5 && distance >= neighbors[4].distance) continue;
      let at = neighbors.findIndex(n => n.distance > distance); if (at < 0) at = neighbors.length;
      neighbors.splice(at, 0, { other, distance }); if (neighbors.length > 5) neighbors.pop();
    }
    card.cluster.set(0, 0, 0); let weight = 0;
    for (const { other, distance } of neighbors) { const w = 1 / (1 + distance / (card.radius * card.radius * 2)); card.cluster.addScaledVector(other.center, w); weight += w; }
    card.cluster.multiplyScalar(1 / weight);
  }
  const center = bounds.getCenter(new THREE.Vector3()), size = bounds.getSize(new THREE.Vector3());
  if (![size.x, size.y, size.z].every(v => Number.isFinite(v) && v > 0)) throw new Error('Leaf shading needs finite crown bounds.');
  const originalColors = geometry.getAttribute('color'), colors = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i++) colors.set([originalColors?.getX(i) ?? 1, originalColors?.getY(i) ?? 1, originalColors?.getZ(i) ?? 1], i * 3);
  const crown = new THREE.Vector3(), lobe = new THREE.Vector3(), direction = new THREE.Vector3();
  for (const card of cards) {
    const t = THREE.MathUtils.clamp((card.center.y - bounds.min.y) / size.y, 0, 1);
    crown.set((card.center.x - center.x) / size.x, (card.center.y - center.y) / size.y * .68 + .18, (card.center.z - center.z) / size.z).normalize();
    const orientation = crown.dot(card.normal) < 0 ? -1 : 1;
    const radius = Math.hypot((card.center.x - center.x) / size.x, (card.center.z - center.z) / size.z);
    const exposure = THREE.MathUtils.clamp(radius * 1.8 + t * .40, 0, 1);
    // Broad, continuous branch-scale variation is baked once. Neighbouring
    // cards share a tone while the individual source leaf edges remain intact.
    const cx = (card.cluster.x - center.x) / size.x, cy = (card.cluster.y - center.y) / size.y, cz = (card.cluster.z - center.z) / size.z;
    const clusterTone = Math.sin(cx * 7.1 + cy * 2.3) * Math.cos(cz * 6.7 - cy * 3.1);
    const shade = (.89 + .22 * exposure) * (1 + .035 * clusterTone);
    for (const id of card.ids) {
      point.fromBufferAttribute(position, id);
      lobe.copy(point).sub(card.cluster); lobe.y += card.radius * .23; lobe.normalize();
      direction.copy(crown).multiplyScalar(.72).addScaledVector(lobe, .28).normalize().multiplyScalar(orientation);
      // Keep the bent normals in the original card's hemisphere, so double-
      // sided alpha leaves retain a consistent front/back lighting response.
      direction.addScaledVector(card.normal, Math.max(0, .28 - direction.dot(card.normal))).normalize();
      direction.multiplyScalar(.66).addScaledVector(card.normal, .34).normalize();
      normal.setXYZ(id, direction.x, direction.y, direction.z);
      colors[id * 3] *= shade * (1.005 + t * .012 + .025 * clusterTone);
      colors[id * 3 + 1] *= shade * 1.025;
      colors[id * 3 + 2] *= shade * (.98 + (1 - t) * .02 - .012 * clusterTone);
    }
  }
  normal.needsUpdate = true;
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.userData.townLeafClusters = { cards: cards.length, basis: FOLIAGE_CLUSTER_BASIS };
  return { cards: cards.length, vertices: cards.reduce((n, c) => n + c.ids.length, 0) };
}
