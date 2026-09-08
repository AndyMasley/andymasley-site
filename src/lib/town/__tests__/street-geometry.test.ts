import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { PavementIndex } from '../road-finish';
import { applyStreetGeometry, exteriorShoulderPieces, streetPolygonArea, subtractStreetPolygon } from '../street-geometry';

describe('joined street exterior', () => {
  it('subtracts a crossing without connecting the remaining shoulder across its opening', () => {
    const road = [[0, -3, 0], [8, -3, 0], [8, 3, 0]];
    const other = [[0, -3, 0], [8, 3, 0], [0, 3, 0]];
    const shoulder = [[-2, -1, .04], [10, -1, .04], [4, 5, .04]];
    const pieces = exteriorShoulderPieces(shoulder, new PavementIndex([road, other]));
    expect(pieces.length).toBeGreaterThan(1);
    for (const piece of pieces) {
      const center = piece.reduce((a, b) => [a[0] + b[0] / piece.length, a[1] + b[1] / piece.length], [0, 0]);
      expect(center[0] < 0 || center[0] > 8 || center[1] > 3).toBe(true);
    }
    expect(pieces.reduce((n, p) => n + streetPolygonArea(p), 0)).toBeLessThan(streetPolygonArea(shoulder));
  });

  it('keeps the exterior of grade-separated roads and trims a sloping intersection only within its layer', () => {
    const shoulder = [[0, 0, 4], [10, 0, 4], [0, 10, 4]];
    const low = [[0, 0, 0], [10, 0, 0], [0, 10, 0]];
    expect(exteriorShoulderPieces(shoulder, new PavementIndex([low]))).toEqual([shoulder.map(p => p.slice(0, 2))]);
    const sloping = [[0, 0, 4], [10, 0, 6], [0, 10, 4]];
    const area = exteriorShoulderPieces(shoulder, new PavementIndex([sloping])).reduce((n, p) => n + streetPolygonArea(p), 0);
    expect(area).toBeGreaterThan(0); expect(area).toBeLessThan(50);
  });

  it('conserves area outside a cut independent of polygon winding', () => {
    const square = [[0, 0], [8, 0], [8, 8], [0, 8]], cut = [[2, 2], [6, 2], [6, 6], [2, 6]];
    for (const a of [square, [...square].reverse()]) for (const b of [cut, [...cut].reverse()]) {
      expect(subtractStreetPolygon(a, b).reduce((n, p) => n + streetPolygonArea(p), 0)).toBeCloseTo(48, 6);
    }
  });

  it('changes only shoulder geometry, retains transform/UV support and is idempotent', () => {
    const group = new THREE.Group(); group.position.set(500, 12, -800);
    const make = (name: string, y: number) => {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, y, 0, 0, y, -8, 8, y, 0], 3));
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 0, 1, 1, 0], 2)); geometry.computeVertexNormals();
      const material = new THREE.MeshStandardMaterial(); material.name = name;
      const mesh = new THREE.Mesh(geometry, material); group.add(mesh); return mesh;
    };
    const pavement = make('Drive road | asphalt', 0), shoulder = make('Drive road | weathered shoulder', -.04), house = make('Building | brick', 4);
    shoulder.position.x = -1;
    const pavementGeometry = pavement.geometry, houseGeometry = house.geometry;
    const first = applyStreetGeometry(group);
    expect(first.removedAreaM2).toBeGreaterThan(20); expect(first.exteriorAreaM2).toBeGreaterThan(0);
    expect(pavement.geometry).toBe(pavementGeometry); expect(house.geometry).toBe(houseGeometry);
    expect(shoulder.position.x).toBe(-1);
    const uv = shoulder.geometry.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) { expect(uv.getX(i)).toBeGreaterThanOrEqual(-1e-6); expect(uv.getY(i)).toBeLessThanOrEqual(1 + 1e-6); }
    expect(applyStreetGeometry(group)).toBe(first);
  });
});
