import * as THREE from 'three';
import catalog from '../../../data/derived/town/main-street-furniture.json';
import release from '../../../data/derived/town/release.json';
import { Batch, type Frame, type Role } from './crafted-frontages';
import { PavementIndex, clipRoadPaintPolygon, roadPaintHeightAt } from './road-finish';
import { subtractStreetPolygon } from './street-geometry';
import type { V3 } from './contracts';

type Lamp = typeof catalog.lamps[number];
export type MainStreetFurnitureReport = {
  status: 'applied' | 'source-mismatch' | 'no-support'; ids: string[];
  omitted: { id: string; reason: string }[]; triangles: number; meshes: number; geometryBytes: number;
  supports: { id: string; min: number; max: number; samples: number }[];
};
export const MAIN_STREET_FURNITURE_PROVENANCE = catalog;
const IRON = '#252a29', GLOBE = '#d2d9d2', LEAF = '#526839';
const cross = (a: number[], b: number[], c: number[]) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
const area = (p: number[][]) => Math.abs(p.slice(1, -1).reduce((s, v, i) => s + cross(p[0], v, p[i + 2]), 0)) / 2;
function contains(t: number[][], p: number[]) {
  const sides = t.map((a, i) => cross(a, t[(i + 1) % t.length], p));
  return sides.every(v => v >= -1e-7) || sides.every(v => v <= 1e-7);
}
function sample(index: PavementIndex, p: number[]): number | undefined {
  const levels = index.candidates([p]).filter(s => contains(s.triangle, p)).map(s => roadPaintHeightAt(s.triangle, p));
  return levels.length ? Math.max(...levels) : undefined;
}
/** Subtract the actual triangle union, so a hole between sampled corners still
 * rejects the whole object. Duplicate retained surface triangles are harmless. */
function supported(ring: number[][], index: PavementIndex): boolean {
  let remaining = [ring];
  for (const { triangle } of index.candidates(ring)) {
    remaining = remaining.flatMap(p => subtractStreetPolygon(p, triangle.map(q => q.slice(0, 2)))).filter(p => area(p) > 1e-9);
    if (!remaining.length) return true;
  }
  return remaining.reduce((s, p) => s + area(p), 0) < 2e-7;
}
function blocked(ring: number[][], index: PavementIndex): boolean {
  return index.candidates(ring).some(({ triangle }) => area(clipRoadPaintPolygon(ring, triangle)) > 1e-7);
}
function supports(group: THREE.Group, origin: V3) {
  const walk: number[][][] = [], terrain: number[][][] = [], obstacles: number[][][] = [];
  group.updateMatrixWorld(true); const inverse = group.matrixWorld.clone().invert();
  group.traverse(o => {
    if (!(o instanceof THREE.Mesh) || o instanceof THREE.InstancedMesh) return;
    const isTerrain = /^terrain(?:\b|_)/.test(o.name), g = o.geometry, p = g.getAttribute('position');
    if (!p) return;
    const ix = g.index, mats = Array.isArray(o.material) ? o.material : [o.material], matrix = inverse.clone().multiply(o.matrixWorld);
    for (const part of g.groups.length ? g.groups : [{ start: 0, count: ix?.count ?? p.count, materialIndex: 0 }]) {
      const material = mats[part.materialIndex ?? 0], isWalk = /Streetscape \| .*sidewalk concrete/.test(material?.name ?? '');
      const relevant = isTerrain || isWalk || /^(?:roads|streetscape|buildings|landmarks|parked)(?:\b|_)/.test(o.name)
        || /crafted.frontages|cars|roadside/.test(o.userData.category ?? '') || /^finished_street_corner/.test(o.name);
      if (!relevant) continue;
      for (let i = part.start; i + 2 < Math.min(ix?.count ?? p.count, part.start + part.count); i += 3) {
        const tri = [0, 1, 2].map(k => {
          const v = new THREE.Vector3().fromBufferAttribute(p, ix?.getX(i + k) ?? i + k).applyMatrix4(matrix);
          return [v.x + origin[0], -v.z - origin[2], v.y + origin[1]];
        });
        if (Math.max(...tri.map(v => v[0])) < -2928 || Math.min(...tri.map(v => v[0])) > -2806
          || Math.max(...tri.map(v => v[1])) < -960 || Math.min(...tri.map(v => v[1])) > -917 || Math.abs(cross(...tri as [number[], number[], number[]])) < 1e-8) continue;
        if (isTerrain || isWalk) {
          // Vertical curb faces and steep unsupported wedges cannot anchor furniture.
          const a = new THREE.Vector3(tri[1][0] - tri[0][0], tri[1][2] - tri[0][2], -tri[1][1] + tri[0][1]);
          const b = new THREE.Vector3(tri[2][0] - tri[0][0], tri[2][2] - tri[0][2], -tri[2][1] + tri[0][1]);
          if (a.cross(b).normalize().y < .78) continue;
          (isTerrain ? terrain : walk).push(tri);
        } else obstacles.push(tri);
      }
    }
  });
  return { walk: new PavementIndex(walk), terrain: new PavementIndex(terrain), obstacles: new PavementIndex(obstacles) };
}
function emit(b: Batch, f: Frame, role: Role, g: THREE.BufferGeometry, color: string) {
  const flat = g.index ? g.toNonIndexed() : g, p=flat.getAttribute('position'), n=flat.getAttribute('normal');
  const positions:number[]=[],normals:number[]=[],a=new THREE.Vector3(),c=new THREE.Vector3(),d=new THREE.Vector3(),normal=new THREE.Vector3();
  for(let i=0;i+2<p.count;i+=3){
    a.fromBufferAttribute(p,i);c.fromBufferAttribute(p,i+1);d.fromBufferAttribute(p,i+2);
    const face=c.sub(a).cross(d.sub(a));if(face.lengthSq()<1e-16)continue;face.normalize();
    for(let k=0;k<3;k++){positions.push(p.getX(i+k),p.getY(i+k),p.getZ(i+k));normal.fromBufferAttribute(n,i+k);if(normal.lengthSq()<1e-12)normal.copy(face);normal.normalize();if(normal.dot(face)<.001)normal.copy(face);normals.push(normal.x,normal.y,normal.z);}
  }
  b.geometry(f, role, positions, normals, color);
  if (flat !== g) flat.dispose(); g.dispose();
}
function lathe(b: Batch, f: Frame, profile: number[][], role: Role, color: string, sides: number) {
  emit(b, f, role, new THREE.LatheGeometry(profile.map(([r, h]) => new THREE.Vector2(r, h)), sides), color);
}
function lantern(b: Batch, row: Lamp, min: number, max: number) {
  const f: Frame = { structId: row.id, tileId: catalog.tileId, start: row.point, tangent: [1, 0], outward: [0, 1] };
  const sides = b.level === 0 ? 12 : b.level === 1 ? 8 : 6, y = max;
  // The cast pedestal intersects the sampled foot surface through the full
  // slope range. Its shaft, globe and finial stay upright at every LOD.
  lathe(b, f, [[0,min-.012],[.20,min-.012],[.20,y+.07],[.18,y+.12],[.14,y+.16],[.132,y+.48],[.10,y+.58],[.092,y+.64],[.081,y+.73],[.077,y+1.05],[.067,y+3.58],[.10,y+3.62],[.10,y+3.69],[.12,y+3.72],[0,y+3.72]], 'metal', IRON, sides);
  lathe(b, f, [[0,y+3.70],[.11,y+3.70],[.17,y+3.79],[.20,y+3.85],[.26,y+4.12],[.235,y+4.30],[0,y+4.30]], 'glass', GLOBE, sides);
  lathe(b, f, [[0,y+4.29],[.27,y+4.29],[.27,y+4.34],[.23,y+4.40],[.15,y+4.48],[.07,y+4.50],[0,y+4.50]], 'metal', IRON, sides);
  lathe(b, f, [[0,y+4.48],[.055,y+4.48],[.043,y+4.56],[.072,y+4.60],[.032,y+4.66],[0,y+row.heightM]], 'metal', IRON, sides);
  // The globe is segmented by physical black ribs; no transparent layers,
  // realtime light, extra texture or distant silhouette substitution.
  for (let j = 0; j < 4; j++) {
    const angle = Math.PI / 4 + j * Math.PI / 2;
    for (const [a, c] of [[[.116,3.72],[.264,4.12]],[[.264,4.12],[.239,4.31]]]) {
      const from = new THREE.Vector3(Math.cos(angle)*a[0],y+a[1],Math.sin(angle)*a[0]);
      const to = new THREE.Vector3(Math.cos(angle)*c[0],y+c[1],Math.sin(angle)*c[0]);
      const direction = to.clone().sub(from), geo = new THREE.CylinderGeometry(.014,.014,direction.length(),b.level ? 4 : 5,1,true);
      geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),direction.normalize()));geo.translate(...from.add(to).multiplyScalar(.5).toArray() as [number,number,number]);emit(b,f,'metal',geo,IRON);
    }
  }
}
function hedgeSections() {
  const line = catalog.hedge.line, sections: { point: number[]; normal: number[]; sourceHeight: number[] }[] = [];
  for (let i = 0; i + 1 < line.length; i++) {
    const a = line[i], z = line[i + 1], length = Math.hypot(z[0] - a[0], z[1] - a[1]), steps = Math.ceil(length / .45), normal = [-(z[1] - a[1]) / length, (z[0] - a[0]) / length];
    for (let j = 0; j < steps + Number(i === line.length - 2); j++) {
      const t = j / steps; sections.push({ point: a.map((v,k) => v + (z[k]-v)*t), normal,
        sourceHeight: catalog.hedge.baseHeights.map(h => h[i] + (h[i+1]-h[i])*t) });
    }
  }
  return sections;
}
function hedge(b: Batch, ground: PavementIndex, walk: PavementIndex, obstacles: PavementIndex, report: MainStreetFurnitureReport) {
  const row = catalog.hedge, sections = hedgeSections(), ring = row.ring;
  // Ring can be concave at small retained-road bends: prove each swept convex
  // interval independently, instead of passing a non-convex cut to the clipper.
  const swaths = sections.slice(1).map((z, i) => {
    const a = sections[i];return [[a,-1],[a,1],[z,1],[z,-1]].map(([s0,sign]) => {
      const s = s0 as typeof a;return s.point.map((v,k) => v + s.normal[k] * (sign as number) * row.widthM / 2);
    });
  });
  if (swaths.some(q => !supported(q, ground) || blocked(q, walk) || blocked(q, obstacles))) { report.omitted.push({id:row.id,reason:'Missing ground or protected surface inside hedge'});return; }
  const h = sections.map(s => [-1,0,1].map(k => sample(ground,s.point.map((v,i) => v + s.normal[i]*k*row.widthM/2))));
  if (h.some((r,i) => r.some(v => v === undefined || Math.abs(v-sections[i].sourceHeight[b.level]) > catalog.limits.hedgeBaseHeightChangeM))) { report.omitted.push({id:row.id,reason:'Missing or changed hedge support'});return; }
  const heights = h as number[][], positions: number[] = [], indices: number[] = [];
  const profile = [[-.41,.07],[-.47,.31],[-.46,.61],[-.36,.86],[-.18,.98],[.19,.98],[.37,.85],[.46,.60],[.47,.30],[.40,.07]];
  sections.forEach((s,i) => {
    const swell = .96 + .035*Math.sin(i*1.72), base = Math.min(...heights[i])-.012;
    profile.forEach(([side,up],j) => {
      const r = side*row.widthM*swell, ripple = .012*Math.sin(i*2.31+j*1.7)*up;
      positions.push(s.point[0]+s.normal[0]*r,base+row.heightM*up+ripple,s.point[1]+s.normal[1]*r);
    });
    if(i) for(let j=0;j<profile.length;j++){const a=(i-1)*profile.length+j,c=(i-1)*profile.length+(j+1)%profile.length,d=i*profile.length+(j+1)%profile.length,z=i*profile.length+j;indices.push(a,c,z,c,d,z);}
  });
  for(const end of [0,sections.length-1]) {
    const base=end*profile.length;for(let j=1;j+1<profile.length;j++)indices.push(...(end===0?[base,base+j+1,base+j]:[base,base+j,base+j+1]));
  }
  const geo=new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.setIndex(indices);geo.computeVertexNormals();
  const frame:Frame={structId:row.id,tileId:catalog.tileId,start:[0,0],tangent:[1,0],outward:[0,1]};emit(b,frame,'leaf',geo,LEAF);
  report.ids.push(row.id);report.supports.push({id:row.id,min:Math.min(...heights.flat()),max:Math.max(...heights.flat()),samples:heights.length*3});
  // Metadata is appended only after every section has support. The live cover
  // mask owns exclusion, while the original terrain and texture remain intact.
  return ring;
}
function materials(group: THREE.Group) {
  group.traverse(o => {
    if (!(o instanceof THREE.Mesh) || Array.isArray(o.material)) return;
    const m=o.material as THREE.MeshStandardMaterial,role=m.userData.surfaceRole;
    o.name=`Main Street furniture | ${role}`;o.userData.category='main-street-furniture';m.name=`Main Street furniture | ${role}`;
    m.userData.mainStreetFurniture={sourceInputSha256:catalog.sourceInputSha256,appearance:'Photo-supported furniture family; authored dimensions and source-grounded placement'};
    if(role==='glass') {m.roughness=.46;m.metalness=.03;m.envMapIntensity=.5;m.onBeforeCompile=()=>{};m.customProgramCacheKey=()=> 'main-street-lantern-globe-v1';}
    if(role==='leaf') {
      const previous=m.onBeforeCompile;
      m.onBeforeCompile=(shader,renderer)=>{previous.call(m,shader,renderer);shader.fragmentShader=`
float mainHedgeHash(vec3 p){p=fract(p*.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);}
float mainHedgeNoise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(mainHedgeHash(i),mainHedgeHash(i+vec3(1,0,0)),f.x),mix(mainHedgeHash(i+vec3(0,1,0)),mainHedgeHash(i+vec3(1,1,0)),f.x),f.y),mix(mix(mainHedgeHash(i+vec3(0,0,1)),mainHedgeHash(i+vec3(1,0,1)),f.x),mix(mainHedgeHash(i+vec3(0,1,1)),mainHedgeHash(i+vec3(1,1,1)),f.x),f.y),f.z);}
${shader.fragmentShader}`.replace('diffuseColor.rgb *= 0.90+0.12*sin(vCraftedWorld.x*17.1+vCraftedWorld.y*12.7)*sin(vCraftedWorld.z*16.8-vCraftedWorld.y*6.2);',`
vec3 mainHedgeLocal=vCraftedWorld-vec3(-2875.,36.,958.);
float mainHedgeFootprint=max(length(dFdx(mainHedgeLocal)),length(dFdy(mainHedgeLocal)));
float mainHedgeGrain=(mainHedgeNoise(mainHedgeLocal*32.)-.5)*(1.-smoothstep(.008,.055,mainHedgeFootprint));
float mainHedgeClusters=mainHedgeNoise(mainHedgeLocal*5.);
diffuseColor.rgb*=.86+mainHedgeClusters*.28+mainHedgeGrain*.22;
`);};m.customProgramCacheKey=()=> 'main-street-clipped-hedge-v1';
    }
  });
}

/** One bounded, source-guarded addition; never replaces an existing street or
 * building mesh. Geometry/material ownership follows normal tile disposal. */
export function applyMainStreetFurniture(group: THREE.Group, tileId: string, origin: V3, level: number, sourceSha256: string): MainStreetFurnitureReport | undefined {
  if (tileId !== catalog.tileId) return;
  const report: MainStreetFurnitureReport={status:'no-support',ids:[],omitted:[],triangles:0,meshes:0,geometryBytes:0,supports:[]};
  if(catalog.sourceManifestSha256!==release.manifestSha256 || !Number.isInteger(level) || catalog.lods.find(l=>l.level===level)?.sha256!==sourceSha256 || origin.some((v,i)=>v!==catalog.origin[i]))return{...report,status:'source-mismatch'};
  if(group.userData.mainStreetFurniture)return group.userData.mainStreetFurniture;
  const source=supports(group,origin),batch=new Batch(new THREE.Vector3(...origin),level);
  for(const row of catalog.lamps){
    const ring=Array.from({length:12},(_,i)=>{const a=i*Math.PI/6;return[row.point[0]+Math.cos(a)*row.footRadiusM,row.point[1]+Math.sin(a)*row.footRadiusM];});
    if(!supported(ring,source.walk)||blocked(ring,source.obstacles)){report.omitted.push({id:row.id,reason:'Missing sidewalk or protected geometry at lamp base'});continue;}
    const h=[row.point,...ring].map(p=>sample(source.walk,p));
    if(h.some(v=>v===undefined||Math.abs(v-row.baseHeights[level])>catalog.limits.baseHeightChangeM)){report.omitted.push({id:row.id,reason:'Missing or changed lamp support'});continue;}
    const heights=h as number[],min=Math.min(...heights),max=Math.max(...heights);
    if(max-min>catalog.limits.supportVariationM){report.omitted.push({id:row.id,reason:'Uneven lamp footing'});continue;}
    lantern(batch,row,min,max);report.ids.push(row.id);report.supports.push({id:row.id,min,max,samples:h.length});
  }
  const hedgeRing=hedge(batch,source.terrain,source.walk,source.obstacles,report);
  if(!report.ids.length)return report;
  const built=batch.finish();built.group.name='Main Street photo furniture';materials(built.group);
  report.status='applied';report.triangles=built.triangles;report.meshes=built.group.children.length;report.geometryBytes=built.bytes;
  group.add(built.group);if(hedgeRing)group.userData.environmentGrassExclusions=[...(group.userData.environmentGrassExclusions??[]),hedgeRing];
  group.userData.mainStreetFurniture=report;return report;
}
