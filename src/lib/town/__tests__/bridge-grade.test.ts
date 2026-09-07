// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import * as THREE from 'three';
import { RoadGraph, type NetworkData } from '../engine';
import { applyMeasuredBridgeGrades, bridgeDeckDisplacement } from '../bridge-grade';
import { applyMeasuredBridgeSurface } from '../bridge-surface';

const network = () => JSON.parse(gunzipSync(readFileSync('data/derived/town/engine-network.json.gz')).toString()) as NetworkData;
const start = [-3355.1512, -974.2122, 27.6676];

describe('classified LiDAR correction of Great Bridge', () => {
  it('agrees with independent deck medians and removes the artificial18percent slope', () => {
    // 2021 class17 medians at these two source positions are29.865 and29.83m.
    expect(start[2] + bridgeDeckDisplacement(start[0], start[1])).toBeCloseTo(29.85202295, 6);
    expect(28.3686 + bridgeDeckDisplacement(-3351.3215, -973.5046)).toBeCloseTo(29.83500688, 6);
    const data = network(), graph = new RoadGraph(data), sourceBytes = JSON.stringify(data);
    const before = new Map([...graph.paths].map(([id, path]) => [id, structuredClone(path.points)]));
    expect(applyMeasuredBridgeGrades(graph)).toEqual([2574, 2575, 2576, 2577]);
    expect(JSON.stringify(data)).toBe(sourceBytes);
    for (const [id, path] of graph.paths) {
      const old = before.get(id)!;
      if (![2574, 2575, 2576, 2577].includes(id)) expect(path.points).toEqual(old);
      else for (let i = 0; i < path.points.length; i++) expect(path.points[i].slice(0, 2)).toEqual(old[i].slice(0, 2));
    }
    for (const id of [2574, 2575]) {
      const path = graph.paths.get(id)!;
      for (let s = 0; s <= path.length; s += .2) {
        const [point, tangent] = path.sample(s);
        expect(point[2]).toBeGreaterThan(29.73); expect(point[2]).toBeLessThan(29.96);
        expect(Math.abs(tangent[2] / Math.hypot(tangent[0], tangent[1]))).toBeLessThan(.025);
      }
    }
    const corrected = [...graph.paths].map(([id, path]) => [id, structuredClone(path.points)]);
    expect(applyMeasuredBridgeGrades(graph)).toEqual([]);
    expect([...graph.paths].map(([id, path]) => [id, path.points])).toEqual(corrected);
  });

  it('eases to unchanged approaches and leaves geographically unrelated roads alone', () => {
    const graph = new RoadGraph(network());
    const originalEnd = [...graph.paths.get(2576)!.points.at(-1)!];
    applyMeasuredBridgeGrades(graph);
    expect(graph.paths.get(2576)!.points.at(-1)).toEqual(originalEnd);
    expect(bridgeDeckDisplacement(0, 0)).toBe(0);
    expect(bridgeDeckDisplacement(start[0], start[1] + 25)).toBe(0);
    for (const [from, to] of [[2574, 2576], [2577, 2575]]) {
      const connector = graph.connector(from, to);
      for (const p of connector.path.points) expect(p.every(Number.isFinite)).toBe(true);
      expect(Math.min(...connector.path.points.map(p => p[2]))).toBeGreaterThan(29.70);
      expect(Math.max(...connector.path.points.map(p => p[2]))).toBeLessThan(30.05);
    }
  });

  it('moves road paint and sidewalks consistently while preserving excluded geometry and attributes', () => {
    const origin: [number, number, number] = [-3500, 0, 1000];
    const create = (name: string, material: string, lift = 0) => {
      // Shift the last point one metre across the bridge at the same along
      // station, giving a proper road triangle and a meaningful surface normal.
      const points = [start, [-3353.2364, -973.8584, 28.0181], [-3351.3215-.1684802563, -973.5046+.9857050285, 28.3686]];
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(points.flatMap(p => [p[0] - origin[0], p[2] + lift, -p[1] - origin[2]]), 3));
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1], 2));
      geometry.computeVertexNormals();
      const mat = new THREE.MeshStandardMaterial(); mat.name = material;
      const mesh = new THREE.Mesh(geometry, mat); mesh.name = name; return mesh;
    };
    const group = new THREE.Group(), road = create('roads', 'Drive road | asphalt');
    const paint = create('roads', 'Drive road | warm yellow paint', .03);
    const sidewalk = create('streetscape', 'Streetscape | granite curb', .18);
    const terrain = create('terrain', 'Drive road | asphalt'), building = create('roads', 'V2 inferred | brick');
    const splitRoad = new THREE.Group(); splitRoad.name = 'roads';
    paint.name = 'roads_2'; splitRoad.add(paint);
    group.add(road, splitRoad, sidewalk, terrain, building);
    const protectedBytes = [terrain, building].map(mesh => [...mesh.geometry.getAttribute('position').array]);
    expect(applyMeasuredBridgeSurface(group, '-14_-4', origin)).toBe(9);
    for (let i = 0; i < 3; i++) {
      const height = road.geometry.getAttribute('position').getY(i);
      expect(height).toBeGreaterThan(29.8);
      expect(paint.geometry.getAttribute('position').getY(i) - height).toBeCloseTo(.03, 4);
      expect(sidewalk.geometry.getAttribute('position').getY(i) - height).toBeCloseTo(.18, 4);
      for(const mesh of [road,paint,sidewalk]){
        const normal=mesh.geometry.getAttribute('normal');
        expect(Math.hypot(normal.getX(i),normal.getY(i),normal.getZ(i))).toBeCloseTo(1,6);
      }
    }
    expect([terrain, building].map(mesh => [...mesh.geometry.getAttribute('position').array])).toEqual(protectedBytes);
    expect([...road.geometry.getAttribute('uv').array]).toEqual([0, 0, 1, 0, 1, 1]);
    expect(applyMeasuredBridgeSurface(group, '-14_-4', origin)).toBe(0);
    expect(applyMeasuredBridgeSurface(new THREE.Group(), '-13_-4', origin)).toBe(0);
    for (const mesh of [road, paint, sidewalk, terrain, building]) { mesh.geometry.dispose(); mesh.material.dispose(); }
  });
});
