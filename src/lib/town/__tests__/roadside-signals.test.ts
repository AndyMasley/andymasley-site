// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { applyRoadsideDetails, validRoadsidePacket, type RoadsideObject, type RoadsidePacket } from '../roadside-details';
import { roadsideSignalClock, signalAspect, updateRoadsideSignalTime } from '../roadside-signal-state';

const hash = 'a'.repeat(64);
const roots: THREE.Group[] = [];
function fixture(count = 3, mast = false) {
  const group = new THREE.Group(); roots.push(group);
  const terrain = new THREE.Mesh(new THREE.PlaneGeometry(250, 250).rotateX(-Math.PI / 2).translate(125, 40, -125), new THREE.MeshBasicMaterial());
  terrain.name = 'terrain'; group.add(terrain);
  const objects: RoadsideObject[] = Array.from({ length: count }, (_, i) => ({
    id: `signal-${i}`, kind: 'signal', point: [60 + i * 10, 60], base: 40, normal: [.6, .8], label: '',
    signalGroup: (i % 3) as 0 | 1 | 2, signalOffset: 7, signalPhases: 3, signalMount: mast ? 'mast' : 'post', armLength: mast ? 8 : undefined,
    evidence: 'Mapped traffic signal; mounting dimensions and controller timing are simulated.',
  }));
  const packet: RoadsidePacket = { version: 1, tileId: '0_0', origin: [0, 0, 0], sourceLods: { '0': hash, '1': hash, '2': hash }, objects };
  return { group, terrain, packet };
}
afterEach(() => {
  for (const group of roots.splice(0)) group.traverse(object => { if (object instanceof THREE.Mesh) { object.geometry.dispose(); for (const material of Array.isArray(object.material) ? object.material : [object.material]) material.dispose(); } });
  updateRoadsideSignalTime(0);
});

describe('simulated coordinated roadside signals', () => {
  it('has the specified green, amber and all-red boundaries in both cycle lengths', () => {
    for (const [time, major, minor] of [[0, 'green', 'red'], [23.999, 'green', 'red'], [24, 'amber', 'red'], [27, 'red', 'red'], [28.999, 'red', 'red'], [29, 'red', 'green'], [47, 'red', 'amber'], [50, 'red', 'red'], [51.999, 'red', 'red'], [52, 'green', 'red']] as const) {
      expect(signalAspect(0, time)).toBe(major); expect(signalAspect(1, time)).toBe(minor);
    }
    for (const [time, aspect] of [[51.999, 'red'], [52, 'green'], [69.999, 'green'], [70, 'amber'], [73, 'red'], [74.999, 'red'], [75, 'red']] as const) expect(signalAspect(2, time, 0, 3)).toBe(aspect);
    expect(signalAspect(0, 75, 0, 3)).toBe('green');
    for (const phases of [2, 3] as const) for (let time = -75; time < 150; time += .25) {
      const aspects = ([0, 1, 2] as const).slice(0, phases).map(group => signalAspect(group, time, 9, phases));
      expect(aspects.filter(aspect => aspect !== 'red').length).toBeLessThanOrEqual(1);
    }
    expect(signalAspect(0, -1)).toBe('red'); expect(signalAspect(1, 0, 29)).toBe('green');
  });

  it('rejects malformed control fields while accepting additive version-one signals', () => {
    const { packet } = fixture(); expect(validRoadsidePacket(packet, '0_0')).toBe(true);
    for (const changes of [{ signalGroup: 3 }, { signalGroup: 2, signalPhases: 2 }, { signalOffset: NaN }, { signalOffset: Infinity }, { signalMount: 'unknown' }, { signalMount: undefined }, { signalPhases: 4 }, { armLength: 2.99 }, { armLength: 12.01 }, { armLength: Infinity }]) {
      const copy = structuredClone(packet); Object.assign(copy.objects[0], changes); expect(validRoadsidePacket(copy, '0_0')).toBe(false);
    }
    for (const armLength of [undefined, 3, 12]) {
      const copy = structuredClone(packet); Object.assign(copy.objects[0], { signalGroup: 0, signalPhases: undefined, armLength }); expect(validRoadsidePacket(copy, '0_0')).toBe(true);
    }
  });

  it.each([0, 1, 2])('batches finite, outward geometry without changing source terrain at LOD %s', level => {
    const { group, terrain, packet } = fixture(3, true), source = terrain.geometry, positions = source.getAttribute('position').array.slice();
    const report = applyRoadsideDetails(group, '0_0', [0, 0, 0], level, hash, packet)!;
    expect(report.ids).toHaveLength(3); expect(report.skipped).toEqual([]); expect(report.addedMeshes).toBe(3); expect(report.addedTriangles).toBeLessThan(1600);
    expect(terrain.geometry).toBe(source); expect(source.getAttribute('position').array).toEqual(positions);
    expect(applyRoadsideDetails(group, '0_0', [0, 0, 0], level, hash, packet)).toBe(report);
    let triangles = 0;
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), normal = new THREE.Vector3();
    group.getObjectByName('Research roadside details')!.traverse(object => {
      expect(object).not.toBeInstanceOf(THREE.PointLight);
      if (!(object instanceof THREE.Mesh)) return;
      const p = object.geometry.getAttribute('position'), n = object.geometry.getAttribute('normal');
      for (const attribute of Object.values(object.geometry.attributes) as THREE.BufferAttribute[]) expect([...attribute.array].every(Number.isFinite)).toBe(true);
      for (let i = 0; i < p.count; i += 3) {
        a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1).sub(a); c.fromBufferAttribute(p, i + 2).sub(a); normal.fromBufferAttribute(n, i);
        expect(b.cross(c).length()).toBeGreaterThan(1e-9); expect(b.dot(normal)).toBeGreaterThanOrEqual(-1e-9); expect(normal.length()).toBeCloseTo(1, 5); triangles++;
      }
    });
    expect(triangles).toBe(report.addedTriangles);
  });

  it('extends a mast inward from the right curb and holds the head above road clearance', () => {
    const { group, packet } = fixture(1, true); applyRoadsideDetails(group, '0_0', [0, 0, 0], 0, hash, packet);
    const lens = group.getObjectByName('Research roadside | signal lenses') as THREE.Mesh, p = lens.geometry.getAttribute('position'), normal = lens.geometry.getAttribute('normal');
    for (let i = 0; i < p.count; i++) {
      const tangentPosition = (p.getX(i) - 60) * -.8 + (-p.getZ(i) - 60) * .6;
      expect(tangentPosition).toBeLessThan(-7.4); expect(tangentPosition).toBeGreaterThan(-7.9);
      expect(p.getY(i) - 40).toBeGreaterThan(5.1);
      expect(normal.getX(i)).toBeCloseTo(.6); expect(normal.getZ(i)).toBeCloseTo(-.8);
    }
  });

  it('shares one clock across tile lens shaders while preserving independent groups and offsets', () => {
    const shaders: THREE.WebGLProgramParametersWithUniforms[] = [];
    for (let tile = 0; tile < 2; tile++) {
      const { group, packet } = fixture(); applyRoadsideDetails(group, '0_0', [0, 0, 0], 0, hash, packet);
      const lens = group.getObjectByName('Research roadside | signal lenses') as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
      const phase = lens.geometry.getAttribute('signalPhase'); expect(phase.itemSize).toBe(4);
      expect(new Set(Array.from({ length: phase.count }, (_, i) => phase.getX(i)))).toEqual(new Set([0, 1, 2]));
      expect(new Set(Array.from({ length: phase.count }, (_, i) => phase.getY(i)))).toEqual(new Set([7]));
      expect(new Set(Array.from({ length: phase.count }, (_, i) => phase.getW(i)))).toEqual(new Set([3]));
      const standard = THREE.ShaderLib.standard, shader = { uniforms: THREE.UniformsUtils.clone(standard.uniforms), vertexShader: standard.vertexShader, fragmentShader: standard.fragmentShader } as THREE.WebGLProgramParametersWithUniforms;
      lens.material.onBeforeCompile(shader, {} as THREE.WebGLRenderer); shaders.push(shader);
      expect(shader.fragmentShader).toContain('vRoadsideSignal.w>2.5?75.0:52.0');
      expect(shader.fragmentShader).toContain('signalTime>=52.0&&signalTime<70.0');
      expect(shader.fragmentShader).toContain('totalEmissiveRadiance+=signalColor*signalLit');
      expect(lens.material.customProgramCacheKey()).toBe('town-roadside-signals-v1');
    }
    updateRoadsideSignalTime(3971);
    expect(roadsideSignalClock.value).toBe(71);
    for (const shader of shaders) { expect(shader.uniforms.roadsideSignalTime).toBe(roadsideSignalClock); expect(shader.uniforms.roadsideSignalTime.value).toBe(71); }
    updateRoadsideSignalTime(NaN); expect(roadsideSignalClock.value).toBe(71);
  });

  it('omits signals whose mapped source terrain no longer supports their pole', () => {
    const { group, terrain, packet } = fixture(); terrain.position.y = 5;
    const report = applyRoadsideDetails(group, '0_0', [0, 0, 0], 0, hash, packet)!;
    expect(report.ids).toEqual([]); expect(report.skipped).toHaveLength(3); expect(report.addedMeshes).toBe(0);
  });
});
