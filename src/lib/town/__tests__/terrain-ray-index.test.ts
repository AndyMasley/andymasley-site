// @vitest-environment node
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { TerrainRayIndex } from '../terrain-ray-index';
import { PlanarTriangleIndex } from '../planar-triangle-index';

describe('exact static-terrain broad phases', () => {
  it('returns all overlapping candidates in original order, including large supports and shared cell boundaries', () => {
    const triangles = [ [[-100,0,-100],[100,0,-100],[0,0,100]], [[0,1,0],[1,1,0],[0,1,1]], [[8,2,8],[9,2,8],[8,2,9]] ];
    const index = new PlanarTriangleIndex(triangles, [-5,10,-5,10]);
    expect(index.query([0,1,0,1])).toEqual(triangles.slice(0,2));
    expect(index.query([8,9,8,9])).toEqual([triangles[0],triangles[2]]);
    expect(index.query([20,21,20,21])).toEqual([]);
  });
  it('uses the same exact triangle hit as Three across slopes, transforms, side selection and range limits', () => {
    const root = new THREE.Group(); root.position.set(25, 7, -18); root.rotation.y = .27;
    const low = new THREE.Mesh(new THREE.PlaneGeometry(80,80,10,10).rotateX(-Math.PI/2), new THREE.MeshBasicMaterial());
    const high = new THREE.Mesh(new THREE.PlaneGeometry(12,12).rotateX(-Math.PI/2), new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));
    low.rotation.z = .08; high.position.y = 3; root.add(low,high); root.updateMatrixWorld(true);
    const index = new TerrainRayIndex([low,high]), ray = new THREE.Raycaster(); ray.ray.direction.set(0,-1,0); ray.far = 2000;
    for(let x=-30;x<=70;x+=2.5)for(let z=-65;z<=30;z+=2.5) {
      ray.ray.origin.set(x,1000,z); const expected=ray.intersectObjects([low,high],false)[0]?.point, actual=index.first(ray.ray,ray.far);
      expect(actual?.toArray()).toEqual(expected?.toArray());
    }
    ray.ray.origin.set(25,1000,-18); expect(index.first(ray.ray,10)).toBeUndefined();
    low.geometry.dispose();high.geometry.dispose();
  });
});
