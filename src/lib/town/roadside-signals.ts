import * as THREE from 'three';
import { Batch, type Frame } from './crafted-frontages';
import { roadsideSignalClock, ROADSIDE_SIGNAL_CYCLE_SECONDS, ROADSIDE_THREE_PHASE_CYCLE_SECONDS } from './roadside-signal-state';

export type RoadsideSignal = { signalGroup: 0 | 1 | 2; signalOffset: number; signalMount: 'post' | 'mast'; signalPhases?: 2 | 3; armLength?: number };
const HOUSING = '#202824', SUPPORT = '#626b65';
type V3 = [number, number, number];

function emit(batch: Batch, frame: Frame, geometry: THREE.BufferGeometry, color = HOUSING): void {
  const flat = geometry.index ? geometry.toNonIndexed() : geometry;
  batch.geometry(frame, 'metal', flat.getAttribute('position').array, flat.getAttribute('normal').array, color);
  if (flat !== geometry) flat.dispose(); geometry.dispose();
}

function beam(batch: Batch, frame: Frame, from: V3, to: V3, radius: number): void {
  const start = new THREE.Vector3(...from), end = new THREE.Vector3(...to), direction = end.clone().sub(start);
  const geometry = new THREE.CylinderGeometry(radius, radius, direction.length(), batch.level ? 6 : 10);
  geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize()));
  geometry.translate(...start.add(end).multiplyScalar(.5).toArray() as V3); emit(batch, frame, geometry, SUPPORT);
}

/** One lens mesh per tile, independent of head count. Every material references
 * the same clock uniform; phase selection runs on the GPU with no scene walks. */
export class RoadsideSignalLenses {
  private positions: number[] = [];
  private normals: number[] = [];
  private colors: number[] = [];
  private phases: number[] = [];
  private discs: number[] = [];
  constructor(private origin: readonly number[]) {}

  add(frame: Frame, x: number, y: number, z: number, signal: RoadsideSignal, segments: number): void {
    const geometry = new THREE.CircleGeometry(.148, segments).toNonIndexed(), vertices = geometry.getAttribute('position');
    const [tx, tn] = frame.tangent, [nx, nn] = frame.outward;
    const reflected = nx * tn - tx * nn < 0;
    const cycle = signal.signalPhases === 3 ? ROADSIDE_THREE_PHASE_CYCLE_SECONDS : ROADSIDE_SIGNAL_CYCLE_SECONDS;
    const offset = ((signal.signalOffset % cycle) + cycle) % cycle;
    for (const [aspect, color] of ['#fa3824', '#ffc338', '#34e898'].entries()) {
      const rgb = new THREE.Color(color), height = y + (.40 - aspect * .40);
      for (let i = 0; i < vertices.count; i++) {
        const at = reflected ? i - i % 3 + [0, 2, 1][i % 3] : i;
        const u = vertices.getX(at), v = vertices.getY(at);
        this.positions.push(frame.start[0] + tx * (x + u) + nx * z - this.origin[0], height + v - this.origin[1], -frame.start[1] - tn * (x + u) - nn * z - this.origin[2]);
        this.normals.push(nx, 0, -nn); this.colors.push(rgb.r, rgb.g, rgb.b);
        this.phases.push(signal.signalGroup, offset, aspect, signal.signalPhases ?? 2); this.discs.push(u / .148, v / .148);
      }
    }
    geometry.dispose();
  }

  finish(): THREE.Mesh | undefined {
    if (!this.positions.length) return;
    const geometry = new THREE.BufferGeometry()
      .setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3))
      .setAttribute('normal', new THREE.Float32BufferAttribute(this.normals, 3))
      .setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 3))
      .setAttribute('signalPhase', new THREE.Float32BufferAttribute(this.phases, 4))
      .setAttribute('signalDisc', new THREE.Float32BufferAttribute(this.discs, 2));
    geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .30, metalness: .04 });
    material.name = 'Research roadside | coordinated signal lenses'; material.userData.townCrafted = true;
    material.customProgramCacheKey = () => 'town-roadside-signals-v1';
    material.onBeforeCompile = shader => {
      shader.uniforms.roadsideSignalTime = roadsideSignalClock;
      shader.vertexShader = `attribute vec4 signalPhase; attribute vec2 signalDisc; varying vec4 vRoadsideSignal; varying vec2 vRoadsideDisc;\n${shader.vertexShader}`
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRoadsideSignal=signalPhase; vRoadsideDisc=signalDisc;');
      shader.fragmentShader = `uniform float roadsideSignalTime; varying vec4 vRoadsideSignal; varying vec2 vRoadsideDisc;\n${shader.fragmentShader}`
        .replace('#include <color_fragment>', `#include <color_fragment>
float signalTime=mod(roadsideSignalTime+vRoadsideSignal.y,vRoadsideSignal.w>2.5?75.0:52.0);
float signalAspect=0.0;
if(vRoadsideSignal.x<0.5) { if(signalTime<24.0) signalAspect=2.0; else if(signalTime<27.0) signalAspect=1.0; }
else if(vRoadsideSignal.x<1.5) { if(signalTime>=29.0&&signalTime<47.0) signalAspect=2.0; else if(signalTime>=47.0&&signalTime<50.0) signalAspect=1.0; }
else if(vRoadsideSignal.w>2.5) { if(signalTime>=52.0&&signalTime<70.0) signalAspect=2.0; else if(signalTime>=70.0&&signalTime<73.0) signalAspect=1.0; }
float signalLit=1.0-step(0.5,abs(vRoadsideSignal.z-signalAspect));
float signalOptics=0.92+0.04*cos(length(vRoadsideDisc)*110.0)+0.08*(1.0-clamp(length(vRoadsideDisc),0.0,1.0));
vec3 signalColor=diffuseColor.rgb;
diffuseColor.rgb*=mix(0.065,0.36,signalLit)*signalOptics;`)
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance+=signalColor*signalLit*1.9*signalOptics;');
    };
    const mesh = new THREE.Mesh(geometry, material); mesh.name = 'Research roadside | signal lenses'; mesh.userData.townCrafted = true;
    return mesh;
  }
}

export function buildRoadsideSignal(batch: Batch, frame: Frame, base: number, signal: RoadsideSignal, lenses: RoadsideSignalLenses): void {
  const mast = signal.signalMount === 'mast', length = Math.max(3, Math.min(12, signal.armLength ?? 7));
  const x = mast ? -length + .35 : 0, center = base + (mast ? 5.65 : 3.55), z = .24;
  const top = base + (mast ? 6.65 : 4.15), pole = new THREE.CylinderGeometry(.075, mast ? .145 : .105, top - base, batch.level ? 6 : 10);
  emit(batch, frame, pole.translate(0, (base + top) / 2, 0), SUPPORT);
  emit(batch, frame, new THREE.CylinderGeometry(.22, .22, .13, 8).translate(0, base + .065, 0), SUPPORT);
  if (mast) {
    // The tangent points toward the approach's right curb; negative tangent
    // brings the arm back across the carriageway from its supported pole.
    beam(batch, frame, [0, base + 6.0, 0], [-.85, base + 6.55, 0], .075);
    beam(batch, frame, [-.85, base + 6.55, 0], [-length, base + 6.55, 0], .065);
    beam(batch, frame, [x, base + 6.55, 0], [x, center + .50, z], .035);
  } else beam(batch, frame, [0, center, 0], [0, center, z], .035);
  // Broad matte backplate, three stacked chambers and individual cutaway
  // cylindrical visors keep the luminous lenses legible in bright daylight.
  batch.box(frame, 'metal', x, center, z - .155, .66, 1.52, .035, HOUSING);
  batch.box(frame, 'metal', x, center, z, .43, 1.29, .25, HOUSING);
  for (const offset of [.40, 0, -.40]) {
    const visor = new THREE.CylinderGeometry(.183, .183, .28, batch.level ? 8 : 12, 1, true, Math.PI / 2, Math.PI)
      .rotateX(Math.PI / 2).translate(x, center + offset, z + .23).toNonIndexed();
    // The inner wall is visible from a driver's lower viewpoint too.
    const inner = visor.clone(), p = inner.getAttribute('position'), n = inner.getAttribute('normal');
    for (let i = 0; i < p.count; i += 3) {
      for (const attribute of [p, n]) { const a = [attribute.getX(i + 1), attribute.getY(i + 1), attribute.getZ(i + 1)]; attribute.setXYZ(i + 1, attribute.getX(i + 2), attribute.getY(i + 2), attribute.getZ(i + 2)); attribute.setXYZ(i + 2, a[0], a[1], a[2]); }
      for (let j = i; j < i + 3; j++) n.setXYZ(j, -n.getX(j), -n.getY(j), -n.getZ(j));
    }
    emit(batch, frame, visor); emit(batch, frame, inner);
  }
  lenses.add(frame, x, center, z + .128, signal, batch.level ? 12 : 20);
}
