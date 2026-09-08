import * as THREE from 'three';

type Face = { mesh: number; a: number; b: number; c: number; side: THREE.Side };
/** Temporary vertical-ray broad phase for unchanged static terrain. Exact hit
 * math remains Three.Ray.intersectTriangle in each original mesh's local frame. */
export class TerrainRayIndex {
  private bins = new Map<string, number[]>();
  private faces: Face[] = [];
  private inverse: THREE.Matrix4[];
  constructor(private meshes: THREE.Mesh[], private cellSize = 8) {
    this.inverse = meshes.map(mesh => mesh.matrixWorld.clone().invert());
    const p = new THREE.Vector3();
    meshes.forEach((mesh, meshIndex) => {
      const g = mesh.geometry, position = g.getAttribute('position'); if (!position) return;
      const count = g.index?.count ?? position.count, materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const ranges = Array.isArray(mesh.material) ? g.groups : [{ start: 0, count, materialIndex: 0 }];
      for (const range of ranges) {
        const material = materials[range.materialIndex ?? 0]; if (!material) continue;
        const begin = Math.max(range.start, g.drawRange.start), end = Math.min(count, range.start + range.count, g.drawRange.start + g.drawRange.count);
        for (let i = begin; i + 2 < end; i += 3) {
          const indices = [0, 1, 2].map(k => g.index?.getX(i + k) ?? i + k);
          const points = indices.map(i => p.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld).clone());
          const x0 = Math.floor(Math.min(...points.map(p => p.x)) / cellSize), x1 = Math.floor(Math.max(...points.map(p => p.x)) / cellSize);
          const z0 = Math.floor(Math.min(...points.map(p => p.z)) / cellSize), z1 = Math.floor(Math.max(...points.map(p => p.z)) / cellSize);
          const index = this.faces.length; this.faces.push({ mesh: meshIndex, a: indices[0], b: indices[1], c: indices[2], side: material.side });
          for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) { const key = `${x}:${z}`, bin = this.bins.get(key); if (bin) bin.push(index); else this.bins.set(key, [index]); }
        }
      }
    });
  }
  first(ray: THREE.Ray, far = Infinity): THREE.Vector3 | undefined {
    if (ray.direction.x !== 0 || ray.direction.z !== 0) throw new Error('Terrain index requires a vertical ray');
    const candidates = this.bins.get(`${Math.floor(ray.origin.x / this.cellSize)}:${Math.floor(ray.origin.z / this.cellSize)}`) ?? [];
    const local = new Map<number, THREE.Ray>(), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), hit = new THREE.Vector3();
    let nearest: THREE.Vector3 | undefined, distance = far;
    for (const index of candidates) {
      const face = this.faces[index], mesh = this.meshes[face.mesh], position = mesh.geometry.getAttribute('position');
      let r = local.get(face.mesh); if (!r) { r = ray.clone().applyMatrix4(this.inverse[face.mesh]); local.set(face.mesh, r); }
      a.fromBufferAttribute(position, face.a); b.fromBufferAttribute(position, face.b); c.fromBufferAttribute(position, face.c);
      const intersection = face.side === THREE.BackSide ? r.intersectTriangle(c, b, a, true, hit) : r.intersectTriangle(a, b, c, face.side === THREE.FrontSide, hit);
      if (!intersection) continue;
      hit.applyMatrix4(mesh.matrixWorld); const d = ray.origin.distanceTo(hit);
      if (d < distance || !nearest && d === distance) { distance = d; nearest = hit.clone(); }
    }
    return nearest;
  }
}
