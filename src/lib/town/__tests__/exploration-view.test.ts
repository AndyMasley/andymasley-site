// @vitest-environment node
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import release from '../../../../data/derived/town/release.json';
import type { WorldManifest } from '../contracts';
import { explorationClipPlanes } from '../exploration-view';

function depth(camera: THREE.PerspectiveCamera, distance: number): number {
  return (new THREE.Vector3(0, 0, -distance).applyMatrix4(camera.projectionMatrix).z + 1) / 2;
}

describe('town exploration camera clipping', () => {
  it('preserves the close street view and clamps invalid or extreme altitudes', () => {
    for (const height of [NaN, Infinity, -Infinity, -100, 0, .025, 1, 5, 12]) expect(explorationClipPlanes(height)).toEqual({ near: .08, far: 14000 });
    for (const height of [250, 1000, 1e9]) expect(explorationClipPlanes(height)).toEqual({ near: 1.5, far: 14000 });
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
