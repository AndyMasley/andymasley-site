// @vitest-environment node
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import release from '../../../../data/derived/town/release.json';
import type { WorldManifest } from '../contracts';
import { explorationCameraOffset, explorationClipPlanes } from '../exploration-view';

function depth(camera: THREE.PerspectiveCamera, distance: number): number {
  return (new THREE.Vector3(0, 0, -distance).applyMatrix4(camera.projectionMatrix).z + 1) / 2;
}

describe('town exploration camera clipping', () => {
  it('preserves the close street view and clamps invalid or extreme altitudes', () => {
    for (const height of [NaN, Infinity, -Infinity, -100, 0, .025, 1, 5, 12]) expect(explorationClipPlanes(height)).toEqual({ near: .08, far: 350000 });
    for (const height of [250, 1000, 1e9]) expect(explorationClipPlanes(height)).toEqual({ near: 1.5, far: 350000 });
    const camera = new THREE.PerspectiveCamera(57, 1, ...Object.values(explorationClipPlanes(0)) as [number, number]);
    expect(depth(camera, .1)).toBeGreaterThan(0); expect(depth(camera, .1)).toBeLessThan(1);
  });

  it('changes continuously with altitude without bringing the near plane into the avatar boom', () => {
    let previous = explorationClipPlanes(0).near;
    for (let height = 1; height <= 350; height++) {
      const { near, far } = explorationClipPlanes(height);
      expect(near).toBeGreaterThanOrEqual(previous); expect(near).toBeLessThan(3);
      expect(near - previous).toBeLessThan(.01); expect(far).toBeGreaterThan(near);
      previous = near;
    }
    expect(explorationClipPlanes(12.1).near - explorationClipPlanes(12).near).toBeLessThan(.00001);
    expect(explorationClipPlanes(250).near - explorationClipPlanes(249.9).near).toBeLessThan(.00001);
  });

  it('resolves distant surfaces that collapse into one24-bit depth step with the street near plane', () => {
    const { near, far } = explorationClipPlanes(1000), flight = new THREE.PerspectiveCamera(57, 1, near, far), street = new THREE.PerspectiveCamera(57, 1, .08, far);
    const unit = 1 / (2 ** 24 - 1);
    const flightSeparation = depth(flight, 4001) - depth(flight, 4000), streetSeparation = depth(street, 4001) - depth(street, 4000);
    expect(streetSeparation).toBeLessThan(unit); expect(flightSeparation).toBeGreaterThan(unit);
    expect(flightSeparation / streetSeparation).toBeGreaterThan(15);
    const nearer = depth(flight, 1000.25) - depth(flight, 1000);
    expect(nearer).toBeGreaterThan(5 * unit);
  });

  it('contains every pinned manifest corner from opposite town edges at maximum flight height', () => {
    const bytes = readFileSync(`public/town-assets/${release.directory}/manifest.json`);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(release.manifestSha256);
    const manifest = JSON.parse(bytes.toString()) as WorldManifest, corners: THREE.Vector3[] = [], town = new THREE.Box3();
    for (const tile of manifest.tiles) for (const x of [tile.bounds.min[0], tile.bounds.max[0]]) for (const y of [tile.bounds.min[1], tile.bounds.max[1]]) for (const z of [tile.bounds.min[2], tile.bounds.max[2]]) {
      const point = new THREE.Vector3(x, y, z); corners.push(point); town.expandByPoint(point);
    }
    expect(corners.length).toBeGreaterThan(5000);
    for (const x of [town.min.x, town.max.x]) for (const z of [town.min.z, town.max.z]) {
      const observer = new THREE.Vector3(x, town.max.y + 1000, z);
      const farthest = Math.max(...corners.map(corner => observer.distanceTo(corner)));
      expect(farthest).toBeLessThan(explorationClipPlanes(1000).far);
      expect(farthest).toBeGreaterThan(6500);
    }
  });
});

describe('exploration horizon framing', () => {
  function view(height: number, pitch?: number, heading = 0) {
    const camera = new THREE.PerspectiveCamera(57, 1.6, .08, 14000), offset = explorationCameraOffset(height, pitch);
    const focus = new THREE.Vector3(3200, 45 + height + 1.35, -3600), forward = new THREE.Vector3(-Math.sin(heading), 0, -Math.cos(heading));
    camera.position.copy(focus).addScaledVector(forward, -offset.back).add(new THREE.Vector3(0, offset.up, 0));
    camera.lookAt(focus.clone().addScaledVector(forward, 2)); camera.updateMatrixWorld();
    // Project the actual Earth-horizon bearing at a convenient in-frustum
    // distance; regional scenery owns the much more distant horizon itself.
    const dip = Math.acos(6371000 / (6371000 + camera.position.y + 100));
    const horizon = camera.position.clone().addScaledVector(forward, 10000); horizon.y -= Math.tan(dip) * 10000;
    return { camera, horizon: horizon.project(camera) };
  }

  it('keeps a useful band of sky above the real horizon at every default flight altitude and heading', () => {
    for (const height of [0, 20, 100, 160, 250, 500, 1000]) for (const heading of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      const { horizon } = view(height);
      expect(Math.abs(horizon.x)).toBeLessThan(1e-8);
      expect(horizon.y).toBeGreaterThan(.15); expect(horizon.y).toBeLessThan(.65);
      expect(horizon.z).toBeLessThan(1);
    }
  });

  it('still permits an intentional overhead view instead of clamping every view to the horizon', () => {
    expect(view(1000, 1.1).horizon.y).toBeGreaterThan(1);
    expect(view(1000, -.15).horizon.y).toBeLessThan(0);
  });

  it('lengthens the boom smoothly without changing its user-selected angle', () => {
    let previous = 0;
    for (let height = 0; height <= 1000; height += 5) {
      const { back, up } = explorationCameraOffset(height, .3), length = Math.hypot(back, up);
      expect(Math.atan2(up, back)).toBeCloseTo(.3, 10);
      expect(length).toBeGreaterThanOrEqual(previous - 1e-12); expect(length).toBeGreaterThan(5 - 1e-12); expect(length).toBeLessThan(8 + 1e-12);
      previous = length;
    }
    for (const value of [NaN, Infinity, -Infinity]) expect(explorationCameraOffset(value, value)).toEqual(explorationCameraOffset(0));
  });
});
