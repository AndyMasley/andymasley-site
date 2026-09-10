// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import catalog from '../../../../data/derived/town/main-street-furniture.json';
import proof from '../../../../data/source/town/main-street-furniture-proof.json';
import release from '../../../../data/derived/town/release.json';
import { applyMainStreetFurniture } from '../main-street-furniture';
import type { V3 } from '../contracts';
const origin = catalog.origin as V3;
function surface(ring: number[][], height: number, name: string, materialName: string, hole: number[][] = []) {
  const shape=ring.map(p=>new THREE.Vector2(p[0],p[1])),holes=hole.length?[hole.map(p=>new THREE.Vector2(p[0],p[1]))]:[];
  const points=[...shape,...holes.flat()],positions:number[]=[];
  for(const triangle of THREE.ShapeUtils.triangulateShape(shape,holes)){
    const p=triangle.map(k=>points[k]),cross=(p[1].x-p[0].x)*(p[2].y-p[0].y)-(p[1].y-p[0].y)*(p[2].x-p[0].x);
    for(const k of cross>0?[0,1,2]:[0,2,1])positions.push(p[k].x-origin[0],height-origin[1],-p[k].y-origin[2]);
  }
  const g=new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.computeVertexNormals();
  const m=new THREE.MeshStandardMaterial();m.name=materialName;const mesh=new THREE.Mesh(g,m);mesh.name=name;return mesh;
}
function scene(hole=false){
  const group=new THREE.Group();
  catalog.lamps.forEach((p,i)=>{
    const x=p.point[0]+.083,y=p.point[1]+.037;
    const small=hole&&i===0?[[x-.008,y-.008],[x+.008,y-.008],[x+.008,y+.008],[x-.008,y+.008]]:[];
    group.add(surface(p.sourceFootprint.slice(0,4),p.baseHeights[0],'streetscape_'+i,'Streetscape | warm sidewalk concrete | photo-informed civic Main Street pavers',small));
  });
  group.add(surface([[-2877,-960],[-2859,-960],[-2859,-952],[-2877,-952]],36.90,'terrain_1','retained terrain'));
  return group;
}
const apply=(g:THREE.Group,level=0)=>applyMainStreetFurniture(g,catalog.tileId,origin,level,catalog.lods[level].sha256)!;

describe('Main Street source-grounded furniture',()=>{
  it('has reproducible photo/sidewalk provenance and independently checked source/car clearance',()=>{
    expect(createHash('sha256').update(readFileSync('data/source/town/main-street-furniture-input.json')).digest('hex')).toBe(catalog.sourceInputSha256);
    expect(proof.sourceInputSha256).toBe(catalog.sourceInputSha256);
    expect(catalog.sourcePhoto.sha256).toMatch(/^[0-9a-f]{64}$/);expect(catalog.sourcePhoto.file).not.toContain('/Users/');
    expect(proof.guidedCar.poses).toBeGreaterThan(600000);expect(proof.guidedCar.intersectionAreaM2).toBe(0);
    for(const lamp of proof.lamps)for(const c of lamp.checks){expect(c.walkUncoveredM2).toBeLessThan(1e-7);expect(c.protectedOverlapM2+c.roadOverlapM2+c.paintOverlapM2).toBeLessThan(1e-7);}
    for(const c of proof.hedge)expect(c.terrainUncoveredM2+c.protectedOverlapM2+c.walkOverlapM2+c.roadOverlapM2+c.paintOverlapM2).toBeLessThan(1e-6);
  });
  it('preserves all retained buffers/materials and owns a small complete shape at each LOD',()=>{
    const counts:number[]=[];
    for(const lod of catalog.lods){
      const group=scene(),original=group.children.map(o=>{const m=o as THREE.Mesh;return{m,g:m.geometry,mat:m.material,p:m.geometry.getAttribute('position').array.slice()};});
      const r=apply(group,lod.level);expect(r.status).toBe('applied');expect(r.ids).toHaveLength(8);expect(r.omitted).toEqual([]);expect(r.meshes).toBe(3);expect(r.triangles).toBeLessThan(10000);counts.push(r.triangles);
      const before=group.children.slice();expect(apply(group,lod.level)).toBe(r);expect(group.children).toEqual(before);
      for(const v of original){expect(v.m.geometry).toBe(v.g);expect(v.m.material).toBe(v.mat);expect(v.g.getAttribute('position').array).toEqual(v.p);}
      expect(group.userData.environmentGrassExclusions).toEqual([catalog.hedge.ring]);
      const owned=group.getObjectByName('Main Street photo furniture')!;
      for(const o of owned.children){const m=o as THREE.Mesh<THREE.BufferGeometry,THREE.MeshStandardMaterial>;expect(m.userData.townCrafted).toBe(true);expect(m.material.userData.townCrafted).toBe(true);expect(m.material.map).toBeNull();expect(m.material.transparent).toBe(false);const normals=m.geometry.getAttribute('normal');for(let i=0;i<normals.count;i++)expect(new THREE.Vector3().fromBufferAttribute(normals,i).length()).toBeCloseTo(1,4);const p=m.geometry.getAttribute('position');for(let i=0;i<p.count;i+=3){const a=new THREE.Vector3().fromBufferAttribute(p,i),c=new THREE.Vector3().fromBufferAttribute(p,i+1).sub(a),d=new THREE.Vector3().fromBufferAttribute(p,i+2).sub(a),face=c.cross(d);expect(face.lengthSq()).toBeGreaterThan(1e-14);face.normalize();for(let k=0;k<3;k++)expect(face.dot(new THREE.Vector3().fromBufferAttribute(normals,i+k))).toBeGreaterThan(-.01);}}
    }
    expect(counts[0]).toBeGreaterThan(counts[1]);expect(counts[1]).toBeGreaterThan(counts[2]);
  });
  it('rejects stale source and wrong origin before creating geometry, then permits retry',()=>{
    const g=scene(),before=g.children.slice();expect(applyMainStreetFurniture(g,'wrong',origin,0,catalog.lods[0].sha256)).toBeUndefined();
    expect(applyMainStreetFurniture(g,catalog.tileId,origin,0,'old')?.status).toBe('source-mismatch');
    expect(applyMainStreetFurniture(g,catalog.tileId,[-2999,0,1000],0,catalog.lods[0].sha256)?.status).toBe('source-mismatch');
    expect(applyMainStreetFurniture(g,catalog.tileId,origin,3,catalog.lods[0].sha256)?.status).toBe('source-mismatch');
    const hash=release.manifestSha256;try{release.manifestSha256='changed';expect(apply(g).status).toBe('source-mismatch');}finally{release.manifestSha256=hash;}
    expect(g.children).toEqual(before);expect(g.userData.mainStreetFurniture).toBeUndefined();expect(apply(g).status).toBe('applied');
  });
  it('omits the whole lantern for an interior footing hole that none of its sampled corners touches',()=>{
    const g=scene(true),r=apply(g);expect(r.ids).not.toContain(catalog.lamps[0].id);expect(r.ids).toHaveLength(7);expect(r.omitted).toEqual([{id:catalog.lamps[0].id,reason:'Missing sidewalk or protected geometry at lamp base'}]);
  });
  it('keeps source road/paint occupied footprints clear and does not use buildings as ground',()=>{
    const g=scene(),p=catalog.lamps[0].point;g.add(surface([[p[0]-.05,p[1]-.05],[p[0]+.05,p[1]-.05],[p[0]+.05,p[1]+.05],[p[0]-.05,p[1]+.05]],37,'roads_4','Drive road | chalk white paint'));
    const r=apply(g);expect(r.ids).not.toContain(catalog.lamps[0].id);expect(r.omitted[0].reason).toContain('protected');
    const empty=new THREE.Group();empty.add(surface([[-3000,-1000],[-2800,-1000],[-2800,-900],[-3000,-900]],37,'buildings_1','roof'));
    expect(apply(empty).status).toBe('no-support');expect(empty.children).toHaveLength(1);expect(empty.userData.environmentGrassExclusions).toBeUndefined();
  });
  it('keeps the clipped hedge inside its observed-sidewalk-side domain, with filtered stationary detail',()=>{
    const g=scene();apply(g);const mesh=g.getObjectByName('Main Street furniture | leaf') as THREE.Mesh<THREE.BufferGeometry,THREE.MeshStandardMaterial>;
    const ring=catalog.hedge.ring;
    const inside=(x:number,y:number)=>{let hit=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])hit=!hit;}return hit;};
    const positions=mesh.geometry.getAttribute('position');for(let i=0;i<positions.count;i++){
      expect(positions.getY(i)).toBeLessThanOrEqual(36.90+catalog.hedge.heightM);
      expect(positions.getY(i)).toBeGreaterThanOrEqual(36.90-.012);
      const x=positions.getX(i)+origin[0],y=-positions.getZ(i)-origin[2];
      if(!inside(x,y)){
        // End vertices lie on the retained ring boundary; only Float32 upload
        // rounding is allowed outside it, never a visible envelope expansion.
        const distance=Math.min(...ring.map((a,j)=>{const b=ring[(j+1)%ring.length],dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy)));return Math.hypot(x-a[0]-t*dx,y-a[1]-t*dy);}));
        expect(distance,`hedge vertex ${i} at ${x},${y}`).toBeLessThan(.00005);
      }
    }
    const shader={uniforms:{},vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader};mesh.material.onBeforeCompile(shader as THREE.WebGLProgramParametersWithUniforms,{}as THREE.WebGLRenderer);
    expect(shader.fragmentShader).toContain('mainHedgeFootprint');expect(shader.fragmentShader).toContain('smoothstep(.008,.055,mainHedgeFootprint)');expect(shader.fragmentShader).not.toContain('gl_FragCoord');
    expect(shader.fragmentShader).toContain('craftedRelief=(mainHedgeClusters-.5)*.030*mainHedgeClusterResolved');
    expect(shader.fragmentShader).toContain('dFdx(craftedRelief)');expect(shader.fragmentShader).toContain('smoothstep(.055,.22,mainHedgeFootprint)');
    expect(shader.fragmentShader.indexOf('craftedRelief=(mainHedgeClusters')).toBeLessThan(shader.fragmentShader.indexOf('dFdx(craftedRelief)'));
    expect(shader.fragmentShader.match(/mainHedgeNoise\(mainHedgeLocal/g)).toHaveLength(2);
    expect(mesh.material.customProgramCacheKey()).toBe('main-street-clipped-hedge-v2');
    expect(shader.fragmentShader).not.toMatch(/discard|\btime\b/);
    expect(shader.fragmentShader.match(/uniform sampler\w+ \w+/g)).toEqual(THREE.ShaderLib.standard.fragmentShader.match(/uniform sampler\w+ \w+/g));
  });
  it('does not increase the existing furniture geometry, draws or texture allocation at any LOD',()=>{
    for(const level of[0,1,2]){
      const g=scene(),r=apply(g,level);expect(r.triangles).toBe([5892,4268,3512][level]);expect(r.meshes).toBe(3);
      const owned=g.getObjectByName('Main Street photo furniture')!;
      for(const o of owned.children){const m=o as THREE.Mesh<THREE.BufferGeometry,THREE.MeshStandardMaterial>;expect(Object.values(m.material).some(v=>v instanceof THREE.Texture)).toBe(false);}
    }
  });
});
