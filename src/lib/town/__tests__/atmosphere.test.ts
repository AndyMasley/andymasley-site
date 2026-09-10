// @vitest-environment node
import {describe,it,expect} from 'vitest';
import * as THREE from 'three';
import {createShadowAnchor} from '../atmosphere';

describe('stable moving directional shadows',()=>{
 it('locks both oblique light-plane axes to texels while preserving depth and sub-texel location',()=>{
  const direction=new THREE.Vector3(-260,205,180),forward=direction.clone().normalize(),right=new THREE.Vector3(0,1,0).cross(forward).normalize(),up=forward.clone().cross(right).normalize();
  const step=200/2048,snap=createShadowAnchor(direction,200,2048),target=new THREE.Vector3();
  for(let i=0;i<120;i++){
   const focus=new THREE.Vector3(-2800+i*.011,42+Math.sin(i*.11)*.07,970+i*.023);
   expect(snap(focus,target)).toBe(target);
   expect(target.dot(right)/step).toBeCloseTo(Math.round(target.dot(right)/step),7);
   expect(target.dot(up)/step).toBeCloseTo(Math.round(target.dot(up)/step),7);
   expect(target.dot(forward)).toBeCloseTo(focus.dot(forward),8);
   expect(target.distanceTo(focus)).toBeLessThanOrEqual(step/Math.sqrt(2)+1e-9);
  }
 });
 it('keeps a stationary image-plane anchor during motion smaller than one texel',()=>{
  const direction=new THREE.Vector3(-260,205,180),forward=direction.clone().normalize(),right=new THREE.Vector3(0,1,0).cross(forward).normalize(),up=forward.clone().cross(right).normalize(),step=200/2048;
  const snap=createShadowAnchor(direction,200,2048),a=new THREE.Vector3(),b=new THREE.Vector3();
  snap(new THREE.Vector3(),a);snap(right.clone().multiplyScalar(step*.2).addScaledVector(up,step*.3),b);
  expect(a.distanceTo(b)).toBeLessThan(1e-12);
 });
 it('rejects a degenerate light basis and invalid texel grid',()=>{
  expect(()=>createShadowAnchor(new THREE.Vector3(0,1,0),200,2048)).toThrow();
  expect(()=>createShadowAnchor(new THREE.Vector3(1,1,0),200,0)).toThrow();
 });
});
