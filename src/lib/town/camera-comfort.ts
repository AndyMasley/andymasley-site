import * as THREE from 'three';

/** A bounded camera boom test against adopted solid scene meshes only. */
export class CameraObstruction {
  private ray = new THREE.Raycaster();
  private box = new THREE.Box3();
  private hit = new THREE.Vector3();
  private direction = new THREE.Vector3();
  private previousOrigin = new THREE.Vector3(Infinity, Infinity, Infinity);
  private previousDirection = new THREE.Vector3();
  private checkedAt = -Infinity;
  private allowed = Infinity;
  private lastMeshes: readonly THREE.Mesh[] = [];
  checks = 0;
  testedMeshes = 0;
  milliseconds = 0;
  skippedCandidates = 0;

  resolve(origin: THREE.Vector3, desired: THREE.Vector3, meshes: readonly THREE.Mesh[], now: number, force = false): { eye: THREE.Vector3; close: boolean } {
    this.direction.subVectors(desired, origin); const length = this.direction.length();
    if (length < 0.001) return { eye: desired, close: false };
    this.direction.divideScalar(length);
    const changed = meshes.length !== this.lastMeshes.length || meshes.some((mesh, i) => mesh !== this.lastMeshes[i]);
    if (force || now - this.checkedAt > 100 || this.previousOrigin.distanceToSquared(origin) > 0.36 || this.previousDirection.dot(this.direction) < 0.999 || changed) {
      const began = performance.now();
      this.ray.set(origin, this.direction); this.ray.near = 0.18; this.ray.far = length + 0.3;
      const candidates: { mesh: THREE.Mesh; distance: number }[] = [];
      for (const mesh of meshes) {
        if (!mesh.visible || !mesh.geometry.attributes.position) continue;
        mesh.updateWorldMatrix(true, false);
        if (mesh instanceof THREE.InstancedMesh) {
          // Parked cars share a prototype at the origin; their placement
          // matrices, rather than that prototype box, bound the visible batch.
          if (!mesh.boundingBox) mesh.computeBoundingBox();
          this.box.copy(mesh.boundingBox!).applyMatrix4(mesh.matrixWorld);
        } else {
          if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
          this.box.copy(mesh.geometry.boundingBox!).applyMatrix4(mesh.matrixWorld);
        }
        if (!this.ray.ray.intersectBox(this.box, this.hit)) continue;
        const distance = this.box.containsPoint(origin) ? 0 : this.hit.distanceTo(origin);
        if (distance <= length + 0.3) candidates.push({ mesh, distance });
      }
      candidates.sort((a, b) => a.distance - b.distance);
      // The boom is under 15m; source terrain/body batches dominate the nearest
      // boxes. This bound prevents unbounded detailed-prop ray tests per frame.
      const relevant = candidates.slice(0, 32).map(candidate => candidate.mesh);
      this.skippedCandidates += Math.max(0, candidates.length - relevant.length);
      const hits = this.ray.intersectObjects(relevant, false);
      this.allowed = hits.length ? Math.max(0.2, hits[0].distance - 0.3) : Infinity;
      this.previousOrigin.copy(origin); this.previousDirection.copy(this.direction); this.checkedAt = now; this.lastMeshes = meshes;
      this.checks++; this.testedMeshes += relevant.length; this.milliseconds += performance.now() - began;
    }
    if (this.allowed < length) desired.copy(origin).addScaledVector(this.direction, this.allowed);
    return { eye: desired, close: this.allowed < 2.4 };
  }
}
