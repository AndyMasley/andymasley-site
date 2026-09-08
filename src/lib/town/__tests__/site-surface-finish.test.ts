// @vitest-environment node
import {describe,expect,it,vi} from 'vitest';
import * as THREE from 'three';
import {finishBasinSurfaces,finishLaunchSurfaces,finishRecreationSurfaces,applySiteArtMaterial} from '../site-surface-finish';
import {applyArtMaterial,removeArtMaterial} from '../art-materials';

function mesh(role:string,color:string,positions:number[]){
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.computeVertexNormals();
 const m=new THREE.MeshStandardMaterial({color});m.userData.surfaceRole=role;return new THREE.Mesh(g,m);
}
function compile(m:THREE.MeshStandardMaterial){const s=THREE.ShaderLib.standard,shader={vertexShader:s.vertexShader,fragmentShader:s.fragmentShader,uniforms:THREE.UniformsUtils.clone(s.uniforms)};m.onBeforeCompile(shader as Parameters<THREE.Material['onBeforeCompile']>[0],{}as THREE.WebGLRenderer);return shader;}
const ring=(x:number,size:number)=>[[x,0],[x+size,0],[x+size,size],[x,size]];

describe('registered site construction finishes',()=>{
 it('retains position/normal/topology and separates contact heights for basins sharing one material',()=>{
  const group=new THREE.Group(),o=mesh('foundation','#97998b',[0,0,0,1,0,0,0,3,0,20,10,0,21,10,0,20,13,0]);group.add(o);
  const source=o.geometry.getAttribute('position').array.slice(),normals=o.geometry.getAttribute('normal').array.slice(),map=new THREE.Texture();o.material.map=map;
  const rows=[{outline:ring(0,5),innerOutline:[[.3,.3],[4.7,.3],[4.7,4.7],[.3,4.7]],base:0,water:2},{outline:ring(20,5),innerOutline:[[20.3,.3],[24.7,.3],[24.7,4.7],[20.3,4.7]],base:10,water:12}];
  expect(finishBasinSurfaces(group,[0,0,0],rows)).toBe(96);expect(finishBasinSurfaces(group,[0,0,0],rows)).toBe(0);
  const a=o.geometry.getAttribute('townSiteData');expect(a.count).toBe(6);expect([a.getZ(0),a.getZ(1),a.getZ(2)]).toEqual([0,0,0]);expect([a.getZ(3),a.getZ(4),a.getZ(5)]).toEqual([10,10,10]);
  expect(o.geometry.getAttribute('position').array).toEqual(source);expect(o.geometry.getAttribute('normal').array).toEqual(normals);expect(o.geometry.index).toBeNull();expect(o.material.map).toBe(map);
 });
 it('restores an explicitly removed site shader and material without disposing shared images',()=>{
  const m=new THREE.MeshStandardMaterial({color:'#aaa99a',roughness:.5,metalness:.2});m.name='Finished site | launch concrete';m.map=new THREE.Texture();const dispose=vi.spyOn(m.map,'dispose'),before={color:m.color.toArray(),roughness:m.roughness,metalness:m.metalness,env:m.envMapIntensity,compile:m.onBeforeCompile,key:m.customProgramCacheKey};applyArtMaterial(m);removeArtMaterial(m);removeArtMaterial(m);expect(m.color.toArray()).toEqual(before.color);expect(m.roughness).toBe(before.roughness);expect(m.metalness).toBe(before.metalness);expect(m.envMapIntensity).toBe(before.env);expect(m.onBeforeCompile).toBe(before.compile);expect(m.customProgramCacheKey).toBe(before.key);expect(dispose).not.toHaveBeenCalled();applyArtMaterial(m);expect(compile(m).fragmentShader.match(/float siteFootprint=/g)).toHaveLength(1);
 });
 it('uses actual launch axes and disables wetness if retained water support is absent',()=>{
  const g=new THREE.Group(),o=mesh('paving','#aaa99a',[2,1,-3,3,1,-3,2,1,-4]);g.add(o);
  const source=o.geometry.getAttribute('position').array.slice();expect(finishLaunchSurfaces(g,[100,10,-200],[{point:[100,200],angle:Math.PI/2,waterHeight:null}])).toBe(48);
  const a=o.geometry.getAttribute('townSiteData');expect(a.getX(0)).toBeCloseTo(3);expect(a.getY(0)).toBeCloseTo(2);expect(a.getW(0)).toBe(0);expect(a.getZ(0)).toBe(-10000);expect(o.geometry.getAttribute('position').array).toEqual(source);
  const wet=new THREE.Group(),w=mesh('paving','#aaa99a',[2,1,-3,3,1,-3,2,1,-4]);wet.add(w);finishLaunchSurfaces(wet,[100,10,-200],[{point:[100,200],angle:0,waterHeight:10.8}]);expect(w.geometry.getAttribute('townSiteData').getZ(0)).toBeCloseTo(10.8);expect(w.geometry.getAttribute('townSiteData').getW(0)).toBe(1);
 });
 it('selects only authored sport surfaces and leaves equipment, markings and other pavement alone',()=>{
  const g=new THREE.Group(),items=[mesh('paving','#4c665c',[]),mesh('paving','#63736b',[]),mesh('paving','#687a65',[]),mesh('paving','#a68f6c',[]),mesh('trim','#e3e0cf',[]),mesh('paving','#74776f',[]),mesh('glass','#263a48',[])];g.add(...items);finishRecreationSurfaces(g);
  expect(items.slice(0,4).map(o=>o.material.name)).toEqual(['Finished site | court','Finished site | court','Finished site | field turf','Finished site | infield earth']);expect(items.slice(4).map(o=>o.material.name)).toEqual(['','','']);
 });
 it('chains pooled shader hooks without owning maps, changing alpha or creating draw calls',()=>{
  for(const kind of['launch concrete','basin concrete','court','field turf','infield earth']){
   const m=new THREE.MeshStandardMaterial();m.name=`Finished site | ${kind}`;m.map=new THREE.Texture();m.alphaTest=.2;m.opacity=.7;m.polygonOffset=true;
   const previous=vi.fn((s:{fragmentShader:string})=>{s.fragmentShader='// retained shader\n'+s.fragmentShader;});m.onBeforeCompile=previous;const dispose=vi.spyOn(m.map,'dispose');applyArtMaterial(m);const callback=m.onBeforeCompile;applyArtMaterial(m);expect(m.onBeforeCompile).toBe(callback);
   const s=compile(m);expect(previous).toHaveBeenCalledOnce();expect(s.fragmentShader).toContain('// retained shader');expect(s.fragmentShader.match(/#include <map_fragment>/g)).toHaveLength(1);expect(s.fragmentShader.indexOf('siteHeight=')).toBeLessThan(s.fragmentShader.indexOf('dFdx(siteHeight)'));expect(s.fragmentShader).toContain('#include <alphatest_fragment>');expect(s.fragmentShader).not.toContain('discard');expect(m.alphaTest).toBe(.2);expect(m.opacity).toBe(.7);expect(m.polygonOffset).toBe(true);m.dispose();expect(dispose).not.toHaveBeenCalled();
   if(kind==='launch concrete')expect(s.fragmentShader).toContain('vTownSiteWorld.y-vTownSiteData.z');
   if(kind==='basin concrete')expect(s.fragmentShader).toContain('siteContact');
  }
  const unrelated=new THREE.MeshStandardMaterial();unrelated.name='Town Hall | pale stone';expect(applySiteArtMaterial(unrelated)).toBe(false);
 });
});
