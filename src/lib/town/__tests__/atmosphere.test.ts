// @vitest-environment node
import {describe,it,expect} from 'vitest';
import * as THREE from 'three';
import {createShadowAnchor,createSummerHaze,createSummerSky,installAerialPerspective,SUMMER_LIGHT,SUMMER_SKY} from '../atmosphere';

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
  for(const span of[0,-1,Infinity,NaN])expect(()=>createShadowAnchor(new THREE.Vector3(1,1,0),250,4096,span)).toThrow();
 });
 it('snaps an afternoon rectangular light frame on both actual texel pitches without moving its depth',()=>{
  const direction=new THREE.Vector3(-290,118,-65),forward=direction.clone().normalize(),right=new THREE.Vector3(0,1,0).cross(forward).normalize(),up=forward.clone().cross(right).normalize();
  const stepX=250/4096,stepY=170/4096,snap=createShadowAnchor(direction,250,4096,170),target=new THREE.Vector3();
  for(let i=0;i<160;i++){
   const focus=new THREE.Vector3(-2800+i*.013,42+Math.sin(i*.13)*.09,970+i*.027);
   snap(focus,target);
   expect(target.dot(right)/stepX).toBeCloseTo(Math.round(target.dot(right)/stepX),7);
   expect(target.dot(up)/stepY).toBeCloseTo(Math.round(target.dot(up)/stepY),7);
   expect(target.dot(forward)).toBeCloseTo(focus.dot(forward),8);
   expect(target.distanceTo(focus)).toBeLessThanOrEqual(Math.hypot(stepX,stepY)/2+1e-9);
  }
  const a=snap(new THREE.Vector3(),new THREE.Vector3()),b=snap(right.clone().multiplyScalar(stepX*.2).addScaledVector(up,stepY*.3),new THREE.Vector3());
  expect(a.distanceTo(b)).toBeLessThan(1e-12);
  const previousGroundSpan=250/new THREE.Vector3(-260,205,180).normalize().y;
  expect(Math.abs(170/forward.y-previousGroundSpan)).toBeLessThan(2);
 });
});

// Three r160's fitted ACES filmic curve, as applied to the whole frame.
const aces=(rgb:readonly number[],exposure=SUMMER_LIGHT.exposure):number[]=>{
 const c=rgb.map(v=>v*exposure/.6);
 const input=[[.59719,.35458,.04823],[.07600,.90834,.01566],[.02840,.13383,.83777]],output=[[1.60475,-.53108,-.07367],[-.10208,1.10813,-.00605],[-.00327,-.07276,1.07602]];
 const mul=(m:number[][],v:number[])=>m.map(row=>row[0]*v[0]+row[1]*v[1]+row[2]*v[2]);
 const fitted=mul(input,c).map(v=>(v*(v+.0245786)-.000090537)/(v*(.983729*v+.4329510)+.238081));
 return mul(output,fitted).map(v=>Math.min(1,Math.max(0,v)));
};
const display=(rgb:readonly number[])=>aces(rgb).map(v=>Math.round(255*(v<=.0031308?v*12.92:1.055*v**(1/2.4)-.055)));
const hex=(value:string)=>[1,3,5].map(i=>parseInt(value.slice(i,i+2),16));

describe('summer sky exposure',()=>{
 it('keeps haze in the same linear sky color when direct rendering supplies an encoded fog uniform',()=>{
  const restore=installAerialPerspective(new THREE.Vector3(-290,118,-65));
  try{
   const fog=createSummerHaze(),linear=fog.color.getRGB(new THREE.Color(),THREE.LinearSRGBColorSpace),encoded=fog.color.getRGB(new THREE.Color(),THREE.SRGBColorSpace);
   // Three r160 uploads these different values for HDR targets versus the
   // direct framebuffer. Treating the latter as linear double-converts haze.
   expect(encoded.r-linear.r).toBeGreaterThan(.2);
   const shader=THREE.ShaderChunk.tonemapping_fragment;
   const input=shader.match(/townFogColor = townEveningSky\(vec3\(([^)]+)\)/);
   expect(input).not.toBeNull();
   const authored=input![1].split(',').map(Number);
   expect(authored).toEqual([linear.r,linear.g,linear.b]);
   expect(display(authored)).toEqual(display(SUMMER_SKY.horizon));
   expect(shader).not.toContain('townEveningSky(fogColor,');
   expect(shader).not.toContain('toneMapping(townFogColor)');
   expect(shader).not.toContain('linearToOutputTexel');
   expect(shader.indexOf('mix(gl_FragColor.rgb, townFogColor, fogFactor)')).toBeLessThan(shader.indexOf('toneMapping( gl_FragColor.rgb )'));
   expect(THREE.ShaderChunk.fog_fragment).not.toContain('mix(');
  }finally{restore();}
 });
 it('installs one linear haze blend before the tone curve and restores every shader chunk on teardown',()=>{
  const names=['fog_pars_vertex','fog_vertex','fog_pars_fragment','fog_fragment','tonemapping_fragment'] as const;
  const before=Object.fromEntries(names.map(name=>[name,THREE.ShaderChunk[name]]));
  const restore=installAerialPerspective(new THREE.Vector3(-290,118,-65));
  try{
   const tone=THREE.ShaderChunk.tonemapping_fragment,blend='gl_FragColor.rgb = mix(gl_FragColor.rgb, townFogColor, fogFactor);';
   expect(tone.startsWith('#ifdef USE_FOG')).toBe(true);
   expect(tone.split(blend)).toHaveLength(2);
   expect(tone.endsWith(before.tonemapping_fragment)).toBe(true);
   // Standard/physical materials and custom wires use this same order; a
   // direct framebuffer gets tone/encoding after the identical HDR blend.
   const physical=THREE.ShaderLib.physical.fragmentShader;
   expect(physical.indexOf('#include <tonemapping_fragment>')).toBeLessThan(physical.indexOf('#include <colorspace_fragment>'));
  }finally{restore();}
  for(const name of names)expect(THREE.ShaderChunk[name]).toBe(before[name]);
 });
 it('displays the documented zenith, horizon and cloud after the shared filmic curve',()=>{
  for(const [rgb,target] of [[SUMMER_SKY.zenith,'#3d7cc9'],[SUMMER_SKY.horizon,'#b7d0e8']] as const){
   display(rgb).forEach((channel,i)=>expect(Math.abs(channel-hex(target)[i])).toBeLessThanOrEqual(3));
  }
  expect(Math.min(...display(SUMMER_SKY.cloud))).toBeGreaterThan(236);
 });
 it('tone maps the visible sky with the town and fades haze into the same horizon',()=>{
  const sky=createSummerSky(new THREE.Vector3(-260,205,180)),fog=createSummerHaze();
  expect(sky.material.toneMapped).toBe(true);
  expect(sky.material.uniforms.summerSurroundings.value).toBe(0);
  expect(fog.color.equals(sky.material.uniforms.summerHorizon.value)).toBe(true);
  expect(fog.near).toBeLessThan(fog.far);
  sky.geometry.dispose();sky.material.dispose();
 });
 it('adds the treeline band only to the reflection source',()=>{
  const reflection=createSummerSky(new THREE.Vector3(-260,205,180),{surroundings:true});
  expect(reflection.material.uniforms.summerSurroundings.value).toBe(1);
  expect(reflection.material.fragmentShader).toContain('summerSurroundings * (1.0 - smoothstep(treelineTop - 0.03, treelineTop, direction.y))');
  expect(reflection.name).not.toBe(createSummerSky(new THREE.Vector3(-260,205,180)).name);
  reflection.geometry.dispose();reflection.material.dispose();
 });
 it('keeps the visible lower hemisphere in horizon haze while retaining the reflection ground',()=>{
  const visible=createSummerSky(new THREE.Vector3(-290,118,-65)),reflection=createSummerSky(new THREE.Vector3(-290,118,-65),{surroundings:true});
  try{
   expect(visible.material.uniforms.summerSurroundings.value).toBe(0);
   expect(reflection.material.uniforms.summerSurroundings.value).toBe(1);
   for(const sky of[visible,reflection]){
    expect(sky.material.fragmentShader).toContain('mix(color,summerGround,summerSurroundings * smoothstep(0.01,0.36,-direction.y))');
    expect(sky.material.fragmentShader).not.toContain('mix(color,summerGround,smoothstep(');
    expect(sky.material.depthWrite).toBe(false);
    expect(sky.material.vertexShader).toContain('gl_Position.z = gl_Position.w');
   }
  }finally{for(const sky of[visible,reflection]){sky.geometry.dispose();sky.material.dispose();}}
 });
});
