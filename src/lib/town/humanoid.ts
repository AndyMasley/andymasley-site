import * as THREE from 'three';

export interface HumanoidAppearance { skin: string; shirt: string; trousers: string; hair: string; height: number }
export interface HumanoidAnimation { time: number; speed: number; flying?: boolean; jetpackActive?: boolean; jetpackEquipped?: boolean }
export interface HumanoidPose extends HumanoidAnimation { position: THREE.Vector3; yaw: number; appearance: HumanoidAppearance }

const skins = ['#c48f70', '#8d5b41', '#e2b491', '#664330', '#ac7858', '#dab39a'];
const shirts = ['#235765', '#a74c3d', '#d0aa55', '#d8d5c8', '#3f536e', '#526e58', '#795e77', '#6b767e'];
const trousers = ['#28323e', '#555a60', '#5e584c', '#2f465a', '#383b3f'];
const hair = ['#29221d', '#493326', '#796042', '#c7ae7e', '#383534', '#988b79'];
function hash(seed: number): number { let n = Math.imul(seed ^ 0x45d9f3b, 0x45d9f3b); n = Math.imul(n ^ n >>> 16, 0x45d9f3b); return (n ^ n >>> 16) >>> 0; }
export function humanoidAppearance(seed: number): HumanoidAppearance {
  const n = hash(seed);
  return { skin: skins[n % skins.length], shirt: shirts[(n >>> 4) % shirts.length], trousers: trousers[(n >>> 8) % trousers.length], hair: hair[(n >>> 12) % hair.length], height: .94 + (n % 13) * .01 };
}

/** Six instanced draws, with articulated joints and independent instance colors. */
export class HumanoidBatch {
  readonly group = new THREE.Group();
  readonly meshes: THREE.InstancedMesh[] = [];
  private readonly material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .86, metalness: 0, envMapIntensity: .35 });
  private readonly counts = [0, 0, 0, 0, 0, 0];
  private readonly root = new THREE.Matrix4();
  private readonly local = new THREE.Matrix4();
  private readonly rotation = new THREE.Quaternion();
  private readonly scale = new THREE.Vector3();
  private readonly color = new THREE.Color();
  private disposed = false;

  constructor(readonly capacity: number, label = 'Sidewalk pedestrians') {
    this.group.name = label;
    this.material.name = label + ' | matte clothing and skin';
    // Shorter rounded caps keep fabric cylindrical through the limb instead
    // of giving every segment the tapered silhouette of a separate oval.
    const capsule = new THREE.CapsuleGeometry(1, 4, 3, 6); capsule.scale(1, 1 / 6, 1);
    const geometries = [new THREE.CylinderGeometry(1, .82, 1, 8), capsule, new THREE.SphereGeometry(1, 10, 8), new THREE.SphereGeometry(1, 10, 5, 0, Math.PI * 2, 0, Math.PI * .53), new THREE.BoxGeometry(1, 1, 1), new THREE.BoxGeometry(1, 1, 1)];
    const perPerson = [1, 12, 1, 1, 2, 3];
    for (let i = 0; i < geometries.length; i++) {
      const mesh = new THREE.InstancedMesh(geometries[i], this.material, capacity * perPerson[i]);
      mesh.name = label + ' | ' + ['shirts', 'articulated limbs', 'faces', 'hair', 'shoes', 'facial details'][i];
      mesh.count = 0; mesh.castShadow = i < 5; mesh.receiveShadow = true; mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.userData.townCrafted = true;
      this.meshes.push(mesh); this.group.add(mesh);
    }
  }

  begin(): void { this.counts.fill(0); }

  private part(kind: number, center: THREE.Vector3, size: THREE.Vector3, color: string, rotation?: THREE.Quaternion): void {
    const mesh = this.meshes[kind], index = this.counts[kind]++;
    this.local.compose(center, rotation ?? new THREE.Quaternion(), size).premultiply(this.root);
    mesh.setMatrixAt(index, this.local); mesh.setColorAt(index, this.color.set(color));
  }

  private bone(a: THREE.Vector3, b: THREE.Vector3, radius: number, color: string): void {
    const direction = b.clone().sub(a), length = direction.length();
    this.rotation.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.multiplyScalar(1 / Math.max(length, 1e-6)));
    // The normalized capsule narrows to a point at each end. Extend its caps
    // through the joints so elbows and knees retain a continuous silhouette.
    this.part(1, a.clone().add(b).multiplyScalar(.5), this.scale.set(radius, length + radius * 1.6, radius), color, this.rotation);
  }

  set(pose: HumanoidPose): void {
    if (this.disposed || this.counts[0] >= this.capacity) return;
    const appearance = pose.appearance, moving = Math.min(1, Math.max(0, pose.speed / 1.15));
    const phase = pose.time * (5.6 + Math.min(2, pose.speed) * 1.1), swing = Math.sin(phase), bob = moving * Math.sin(phase * 2) * .012;
    this.root.compose(pose.position, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), pose.yaw), new THREE.Vector3().setScalar(appearance.height));
    this.part(0, new THREE.Vector3(0, 1.115 + bob, 0), new THREE.Vector3(.205, .47, .135), appearance.shirt);
    this.part(1, new THREE.Vector3(0, .88 + bob, 0), new THREE.Vector3(.147, .19, .11), appearance.trousers);
    this.bone(new THREE.Vector3(0, 1.34 + bob, 0), new THREE.Vector3(0, 1.45 + bob, 0), .057, appearance.skin);
    this.part(2, new THREE.Vector3(0, 1.57 + bob, -.006), new THREE.Vector3(.117, .16, .114), appearance.skin);
    this.part(3, new THREE.Vector3(0, 1.601 + bob, .005), new THREE.Vector3(.121, .132, .119), appearance.hair);
    for (const side of [-1, 1]) {
      this.part(5, new THREE.Vector3(side * .043, 1.58 + bob, -.112), new THREE.Vector3(.018, .011, .008), '#292b2d');
      const arm = swing * moving * side;
      const shoulder = new THREE.Vector3(side * .218, 1.295 + bob, 0);
      const elbow = new THREE.Vector3(side * (pose.flying ? .32 : .25), 1.05 + bob, pose.flying ? -.12 : arm * .14);
      const hand = new THREE.Vector3(side * (pose.flying ? .40 : .25), (pose.flying ? 1.10 : .84) + bob, pose.flying ? -.28 : arm * .27 - .02);
      this.bone(shoulder, elbow, .068, appearance.shirt); this.bone(elbow, hand, .047, appearance.skin);
      const palm = hand.clone().addScaledVector(hand.clone().sub(elbow).normalize(), .036);
      this.part(1, palm, new THREE.Vector3(.047, .10, .034), appearance.skin, this.rotation);
      const stride = Math.sin(phase + (side > 0 ? Math.PI : 0));
      const lift = pose.flying ? .16 : Math.max(0, Math.cos(phase + (side > 0 ? Math.PI : 0))) * .075 * moving;
      const ankle = new THREE.Vector3(side * .102, .09 + lift, pose.flying ? .18 : stride * .245 * moving);
      const hip = new THREE.Vector3(side * .094, .91 + bob, 0), delta = ankle.clone().sub(hip), distance = Math.min(.838, delta.length());
      const direction = delta.normalize(), length = .425, along = distance / 2;
      const bend = new THREE.Vector3(0, 0, -1).addScaledVector(direction, direction.z).normalize();
      const knee = hip.clone().addScaledVector(direction, along).addScaledVector(bend, Math.sqrt(Math.max(0, length * length - along * along)));
      this.bone(hip, knee, .089, appearance.trousers); this.bone(knee, ankle, .072, appearance.trousers);
      this.part(4, new THREE.Vector3(ankle.x, .052 + lift, ankle.z - .058), new THREE.Vector3(.139, .10, .27), '#262a2e');
    }
    this.part(5, new THREE.Vector3(0, 1.55 + bob, -.119), new THREE.Vector3(.03, .038, .029), appearance.skin);
  }

  commit(): void {
    for (let i = 0; i < this.meshes.length; i++) {
      const mesh = this.meshes[i]; mesh.count = this.counts[i]; mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const mesh of this.meshes) { mesh.geometry.dispose(); mesh.dispose(); }
    this.material.dispose(); this.group.removeFromParent();
  }
}

export interface PlayerHumanoid { group: THREE.Group; update(state: HumanoidAnimation): void; dispose(): void }
export function createPlayerHumanoid(seed = 17): PlayerHumanoid {
  const batch = new HumanoidBatch(1, 'Player on foot'), group = batch.group, appearance = humanoidAppearance(seed), zero = new THREE.Vector3();
  const metal = new THREE.MeshStandardMaterial({ color: '#586770', roughness: .36, metalness: .62 });
  const trim = new THREE.MeshStandardMaterial({ color: '#252d32', roughness: .62 });
  const plume = new THREE.MeshBasicMaterial({ color: '#ffa847', transparent: true, opacity: .88, depthWrite: false });
  const core = new THREE.MeshBasicMaterial({ color: '#fff2c3', transparent: true, opacity: .94, depthWrite: false });
  const pack = new THREE.Group(); pack.name = 'Player | compact jetpack'; pack.scale.setScalar(appearance.height); group.add(pack);
  const geometries: THREE.BufferGeometry[] = [];
  const mesh = (geometry: THREE.BufferGeometry, material: THREE.Material, position: number[]) => {
    geometries.push(geometry); const object = new THREE.Mesh(geometry, material); object.position.fromArray(position); object.castShadow = material === metal || material === trim; pack.add(object); return object;
  };
  mesh(new THREE.BoxGeometry(.25, .37, .11), trim, [0, 1.16, .19]);
  const flames: THREE.Mesh[] = [];
  for (const side of [-1, 1]) {
    mesh(new THREE.CylinderGeometry(.066, .066, .40, 10), metal, [side * .11, 1.15, .25]);
    mesh(new THREE.CylinderGeometry(.045, .057, .075, 8), trim, [side * .11, .925, .25]);
    const outer = mesh(new THREE.ConeGeometry(.048, .30, 7), plume, [side * .11, .742, .25]); outer.rotation.x = Math.PI;
    const inner = mesh(new THREE.ConeGeometry(.025, .23, 7), core, [side * .11, .77, .25]); inner.rotation.x = Math.PI;
    flames.push(outer, inner);
  }
  let disposed = false;
  const update = (state: HumanoidAnimation) => {
    if (disposed) return;
    batch.begin(); batch.set({ ...state, position: zero, yaw: 0, appearance }); batch.commit();
    pack.visible = !!state.jetpackEquipped;
    for (let i = 0; i < flames.length; i++) { const flame = flames[i]; flame.visible = !!state.jetpackActive; flame.scale.y = .92 + .12 * Math.sin(state.time * 37 + i); }
  };
  update({ time: 0, speed: 0 });
  return { group, update, dispose() { if (disposed) return; disposed = true; batch.dispose(); for (const geometry of geometries) geometry.dispose(); metal.dispose(); trim.dispose(); plume.dispose(); core.dispose(); } };
}
