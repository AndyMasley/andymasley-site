import * as THREE from 'three';
import type { GroundedSiteFeature } from './arrival-grounds';

export const GROUNDED_PLANTING_BASIS = 'VC-0213/0214/0219/0231/0259/0260: authored garden-bed soil and bark-chip appearance, with restrained uneven shrub crowns at existing planting positions. No product, species or exact photographed planting is asserted.';

/** Only a complete, exclusively bed-owned source batch qualifies. A matching
 * brown color alone cannot reclassify concrete, road paving or native terrain. */
export function finishGroundedPlantingSurfaces(group: THREE.Group, features: readonly GroundedSiteFeature[]): string[] {
  const finished = new Set<string>();
  group.traverse(mesh => {
    if (!(mesh instanceof THREE.Mesh) || Array.isArray(mesh.material) || !(mesh.material instanceof THREE.MeshStandardMaterial)
      || mesh.userData.townCrafted !== true || mesh.material.userData.townCrafted !== true || mesh.material.userData.surfaceRole !== 'paving') return;
    const material = mesh.material, sourceIds = mesh.userData.sourceIds as string[] | undefined;
    if (!Array.isArray(sourceIds) || !sourceIds.length || !sourceIds.every(id => typeof id === 'string') || material.userData.groundedPlantingFinish) return;
    const color = material.color.getHexString();
    const contributors = features.filter(f => sourceIds.includes(f.sid) && (f.color ?? (f.kind === 'bed' ? '#625546' : '#aaa697')).slice(1).toLowerCase() === color);
    if (!contributors.length || !contributors.every(f => f.kind === 'bed') || !sourceIds.every(id => contributors.some(f => f.sid === id))) return;
    const ids = [...new Set(contributors.map(f => f.id))].sort();
    const previous = material.onBeforeCompile, key = material.customProgramCacheKey();
    material.userData.groundedPlantingFinish = { ids, kind: 'authored-garden-bed', basis: GROUNDED_PLANTING_BASIS };
    material.name += ' | authored garden-bed soil and mulch'; material.roughness = .985;
    material.onBeforeCompile = (shader, renderer) => {
      previous.call(material, shader, renderer);
      // Replace the owned generic paving's two fields, not add another layer
      // of samples. Stronger elongated fragments read as bark/earth rather
      // than fine mineral aggregate; geometry and border alpha stay unchanged.
      const replacements = [
        ['float craftedPavingResolved=1.0-smoothstep(.002,.012,craftedPavingFootprint);', 'float craftedPavingResolved=1.0-smoothstep(.012,.055,craftedPavingFootprint);'],
        ['float craftedPavingGrain=craftedGroundNoise(vCraftedWorld.xz*65.0);', 'float craftedPavingGrain=smoothstep(.22,.77,craftedGroundNoise(mat2(.8,.6,-.6,.8)*vCraftedWorld.xz*vec2(16.0,48.0)));'],
        ['float craftedPavingAge=craftedGroundNoise(vCraftedWorld.xz*.35+vec2(17.1,41.7));', 'float craftedPavingAge=craftedGroundNoise(vCraftedWorld.xz*.85+vec2(17.1,41.7));'],
        ['diffuseColor.rgb*=mix(.97,1.03,craftedPavingAge)*(1.0+(craftedPavingGrain-.5)*.10*craftedPavingResolved);', 'diffuseColor.rgb*=mix(.83,1.15,craftedPavingAge)*(1.0+(craftedPavingGrain-.5)*.46*craftedPavingResolved);'],
        ['float craftedRelief=(craftedPavingGrain-.5)*.0007*craftedPavingResolved*craftedNear;', 'float craftedRelief=(craftedPavingGrain-.5)*.0028*craftedPavingResolved*craftedNear;'],
      ];
      for (const [from, to] of replacements) {
        if (!shader.fragmentShader.includes(from)) throw new Error('Owned planting-bed paving shader anchor changed.');
        shader.fragmentShader = shader.fragmentShader.replace(from, to);
      }
    };
    material.customProgramCacheKey = () => `${key}|grounded-planting-v1`;
    material.needsUpdate = true;
    ids.forEach(id => finished.add(id));
  });
  return [...finished].sort();
}

/** Three temporary, same-topology profiles. Every radial change is inward and
 * both vertical extrema remain fixed; no existing plant clearance expands. */
export function groundedShrubProfiles(level: number): THREE.BufferGeometry[] {
  return [0, 1, 2].map(variant => {
    const geometry = new THREE.SphereGeometry(1, level === 0 ? 7 : 5, level === 0 ? 5 : 4);
    const position = geometry.getAttribute('position'), phase = variant * 2.094395;
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i), y = position.getY(i), z = position.getZ(i), angle = Math.atan2(z, x);
      const radial = .90 + .075 * Math.cos(angle * 3 + y * 2.3 + phase);
      const rise = .035 * (1 - y * y) * Math.sin(angle * 2 + phase);
      position.setXYZ(i, x * radial, y + rise, z * radial);
    }
    geometry.computeVertexNormals();
    // Sphere seam/pole duplicates must share their recomputed smooth normal.
    const normal = geometry.getAttribute('normal'), groups = new Map<string, number[]>(), n = new THREE.Vector3();
    for (let i = 0; i < position.count; i++) {
      // Integer bins stringify both +0 and -0 as "0", joining the sphere's
      // coincident 0/-epsilon seam instead of preserving a false normal split.
      const key = [position.getX(i), position.getY(i), position.getZ(i)].map(v => Math.round(v * 1e6)).join(':');
      const ids = groups.get(key) ?? []; ids.push(i); groups.set(key, ids);
    }
    for (const ids of groups.values()) {
      n.set(0, 0, 0); for (const id of ids) n.add(new THREE.Vector3().fromBufferAttribute(normal, id));
      if (n.lengthSq() < 1e-10) n.fromBufferAttribute(position, ids[0]); n.normalize();
      for (const id of ids) normal.setXYZ(id, n.x, n.y, n.z);
    }
    position.needsUpdate = normal.needsUpdate = true;
    geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    return geometry;
  });
}
