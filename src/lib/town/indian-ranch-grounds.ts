import * as THREE from 'three';
import catalog from '../../../data/derived/town/indian-ranch-grounds.json';
import release from '../../../data/derived/town/release.json';
import { applyGroundedSiteFeatures, type GroundedSiteRecord } from './arrival-grounds';
import { Batch, type Frame } from './crafted-frontages';
import { PavementIndex, roadPaintHeightAt } from './road-finish';
import type { V3 } from './contracts';

const tiles = catalog.tiles as Record<string, { origin: number[]; lods: { level: number; sha256: string }[]; features: string[] }>;
const records = new Map<string, GroundedSiteRecord>();
type Surface = typeof catalog.features[number];
const surfaces = new Map(catalog.features.map(row => [row.sid, row]));
function record(tileId: string): GroundedSiteRecord | undefined {
  const tile = tiles[tileId]; if (!tile) return;
  const prior = records.get(tileId); if (prior) return prior;
  const ids = new Set(tile.features);
  const value = { ...tile, features: catalog.features.filter(f => ids.has(f.id)).map(f => ({ ...f, basis: `${catalog.policy} ${f.inference}`, triangles: Array.from({ length: f.indices.length / 3 }, (_, i) => f.indices.slice(i * 3, i * 3 + 3).map(k => f.points[k])) })) };
  records.set(tileId, value); return value;
}

function finishMaterial(material: THREE.MeshStandardMaterial, source: Surface): void {
  const previous = material.onBeforeCompile, key = material.customProgramCacheKey();
  const soil = source.surface === 'pine-floor', gravel = source.surface === 'pale-gravel';
  material.name += ` | Indian Ranch ${source.surface}`;
  material.userData.indianRanchGround = { id: source.id, sourceInputSha256: catalog.sourceInputSha256, surface: source.surface, inference: source.inference };
  material.roughness = soil ? .99 : gravel ? .98 : .96;
  // The small loose-ground overlays feather into retained terrain. Hard-pad
  // boundaries stay crisp; no native material or class mask is modified.
  material.transparent = soil || gravel; material.depthWrite = !material.transparent;
  const origin = source.frameOrigin, ring = source.featherRing;
  material.onBeforeCompile = (shader, renderer) => {
    previous.call(material, shader, renderer);
    if (!shader.fragmentShader.includes('varying vec3 vCraftedWorld;') || !shader.fragmentShader.includes('#include <roughnessmap_fragment>')) throw new Error('Owned Ranch ground shader anchors changed');
    shader.uniforms.ranchGroundOrigin = { value: new THREE.Vector2(origin[0], -origin[1]) };
    if (soil || gravel) shader.uniforms.ranchGroundRing = { value: ring.map(p => new THREE.Vector2(p[0] - origin[0], -(p[1] - origin[1]))) };
    shader.fragmentShader = `
uniform vec2 ranchGroundOrigin;
${soil || gravel ? `uniform vec2 ranchGroundRing[${ring.length}];` : ''}
float ranchGroundHash(vec2 p){vec3 q=fract(vec3(p.xyx)*.1031);q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);}
float ranchGroundNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(ranchGroundHash(i),ranchGroundHash(i+vec2(1,0)),f.x),mix(ranchGroundHash(i+vec2(0,1)),ranchGroundHash(i+vec2(1,1)),f.x),f.y);}
${shader.fragmentShader}`.replace('#include <roughnessmap_fragment>', `
vec2 ranchGroundLocal=vCraftedWorld.xz-ranchGroundOrigin;
// Derivatives use continuous world metres before any floor/fract operation.
float ranchGroundFootprint=max(fwidth(ranchGroundLocal.x),fwidth(ranchGroundLocal.y));
float ranchGroundBroad=ranchGroundNoise(ranchGroundLocal*.65)-.5;
float ranchGroundGrain=(ranchGroundNoise(mat2(.8,.6,-.6,.8)*ranchGroundLocal/${gravel ? '.08' : soil ? '.11' : '.035'})-.5)*(1.0-smoothstep(.025,.11,ranchGroundFootprint));
diffuseColor.rgb*=1.0+ranchGroundBroad*${soil ? '.72' : gravel ? '.28' : '.055'}+ranchGroundGrain*${gravel ? '.45' : soil ? '.32' : '.07'};
${soil ? `// Authored dry pine litter: visible decimetre clusters, sparse fine needles.
// Each frequency fades using the continuous footprint, so oblique views do not sparkle.
float ranchLitter=(ranchGroundNoise(ranchGroundLocal*4.0+vec2(31.0,9.0))-.5)*(1.0-smoothstep(.04,.22,ranchGroundFootprint));
vec2 ranchNeedleAxes=mat2(.84,.54,-.54,.84)*ranchGroundLocal;
float ranchNeedleFootprint=max(fwidth(ranchNeedleAxes.x),fwidth(ranchNeedleAxes.y));
float ranchNeedles=smoothstep(.57,.76,ranchGroundNoise(ranchNeedleAxes*vec2(4.0,85.0)))*(1.0-smoothstep(.004,.025,ranchNeedleFootprint));
diffuseColor.rgb*=vec3(.80,.73,.66)*(1.0+ranchLitter*.65);
diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(1.32,1.20,1.03),ranchNeedles*.46);
float ranchSparseGreen=smoothstep(.68,.87,ranchGroundNoise(ranchGroundLocal*1.5+vec2(7.0,19.0)))*.30;
diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(.76,1.12,.69),ranchSparseGreen);` : gravel ? 'diffuseColor.rgb*=vec3(.62,.61,.59);' : ''}
${soil || gravel ? `float ranchGroundEdge=1e6;
for(int i=0;i<${ring.length};i++){vec2 a=ranchGroundRing[i],b=ranchGroundRing[(i+1)%${ring.length}],ab=b-a;float t=clamp(dot(ranchGroundLocal-a,ab)/max(dot(ab,ab),.000001),0.0,1.0);ranchGroundEdge=min(ranchGroundEdge,length(ranchGroundLocal-a-ab*t));}
// Irregular fading is entirely inward: it cannot expand the source-qualified domain.
float ranchEdgeNoise=ranchGroundNoise(ranchGroundLocal*${soil ? '1.35' : '3.1'}+vec2(11.0,23.0));
float ranchEdgeStart=${soil ? '.08+ranchEdgeNoise*.78' : '.015+ranchEdgeNoise*.15'};
float ranchEdgeEnd=ranchEdgeStart+${soil ? '.50+ranchGroundNoise(ranchGroundLocal*.65)*1.05' : '.28+ranchGroundNoise(ranchGroundLocal*1.4)*.30'};
diffuseColor.a*=smoothstep(ranchEdgeStart,ranchEdgeEnd,ranchGroundEdge);` : ''}
#include <roughnessmap_fragment>
`);
  };
  material.customProgramCacheKey = () => `${key}|ranch-ground-v3:${source.id}`;
  material.needsUpdate = true;
}

function padSampler(group: THREE.Group, origin: V3): (p: number[]) => number | undefined {
  const triangles: number[][][] = [], point = new THREE.Vector3();
  group.updateMatrixWorld(true); const inverse = group.matrixWorld.clone().invert();
  group.traverse(o => {
    if (!(o instanceof THREE.Mesh) || Array.isArray(o.material) || o.material.userData.indianRanchGround?.id !== 'RANCH-SEATING-PAD') return;
    const g = o.geometry, p = g.getAttribute('position'), ix = g.index, matrix = inverse.clone().multiply(o.matrixWorld);
    for (let i = 0; i < (ix?.count ?? p.count); i += 3) triangles.push([0, 1, 2].map(k => {
      point.fromBufferAttribute(p, ix?.getX(i + k) ?? i + k).applyMatrix4(matrix);
      return [point.x + origin[0], -point.z - origin[2], point.y + origin[1]];
    }));
  });
  const index = new PavementIndex(triangles);
  return p => {
    for (const { triangle: t } of index.candidates([p])) {
      const cross = (a: number[], b: number[], c: number[]) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
      const sides = [cross(t[0], t[1], p), cross(t[1], t[2], p), cross(t[2], t[0], p)];
      if (sides.every(v => v >= -1e-6) || sides.every(v => v <= 1e-6)) return roadPaintHeightAt(t, p);
    }
  };
}

function benchSections(group: THREE.Group, tileId: string, origin: V3, level: number) {
  const sample = padSampler(group, origin), batch = new Batch(new THREE.Vector3(...origin), level);
  const away = catalog.benchPolicy.frame.away, skipped: string[] = [], ids: string[] = [], supportHeights: number[][] = [], feet: { id: string; bottom: number; top: number; cornerHeights: number[] }[] = [], unsupportedFeet: string[] = [];
  for (const bench of catalog.benches.filter(b => b.tileId === tileId)) {
    const dx = bench.b[0] - bench.a[0], dn = bench.b[1] - bench.a[1], length = Math.hypot(dx, dn), tangent = [dx / length, dn / length];
    const middle = [(bench.a[0] + bench.b[0]) / 2, (bench.a[1] + bench.b[1]) / 2];
    const h = [bench.a, middle, bench.b].map(sample);
    if (h.some(y => y === undefined)) { skipped.push(bench.id); continue; }
    // Validate every load-bearing corner before emitting any seat or leg.
    // A narrow/partial retained pad must omit the whole section, not leave a floating seat.
    const footSamples = [.22, length - .22].map(u => ({ u, heights: [-.035, .035].flatMap(du => [-.14, .14].map(dv => sample([bench.a[0] + tangent[0] * (u + du) + away[0] * dv, bench.a[1] + tangent[1] * (u + du) + away[1] * dv]))) }));
    if (footSamples.some(foot => foot.heights.some(y => y === undefined))) { unsupportedFeet.push(bench.id); skipped.push(bench.id); continue; }
    const heights = h as number[], seat = Math.max(...heights) + catalog.benchPolicy.seatHeightM;
    const frame: Frame = { structId: bench.id, tileId, start: bench.a as [number, number], tangent: tangent as [number, number], outward: away as [number, number] };
    const color = catalog.benchPolicy.color;
    if (level === 0) for (const z of [-.092, .092]) batch.box(frame, 'trim', length / 2, seat, z, length, .055, .16, color);
    else batch.box(frame, 'trim', length / 2, seat, 0, length, .055, .34, color);
    batch.box(frame, 'trim', length / 2, seat + .26, .19, length, .23, .045, color);
    for (const { u, heights: foot } of footSamples) {
      const ground = Math.min(...foot as number[]) - .008;
      const height = seat + .015 - ground;
      batch.box(frame, 'metal', u, ground + height / 2, 0, .07, height, .28, '#556253');
      feet.push({ id: bench.id, bottom: ground, top: seat + .015, cornerHeights: foot as number[] });
      if (level < 2) batch.box(frame, 'metal', u, seat + .16, .19, .045, .36, .045, '#556253');
    }
    ids.push(bench.id); supportHeights.push(heights);
  }
  const built = batch.finish(); built.group.name = 'Indian Ranch exterior seating';
  built.group.traverse(o => { if (o instanceof THREE.Mesh && !Array.isArray(o.material)) { o.material.userData.indianRanchBench = true; if (o.material.userData.surfaceRole === 'trim') o.material.name = 'Indian Ranch exterior benches | green painted slats'; } });
  if (built.triangles) group.add(built.group);
  return { ids, skipped, supportHeights, feet, unsupportedFeet, triangles: built.triangles, geometryBytes: built.bytes, meshes: built.group.children.length };
}

export function applyIndianRanchGrounds(group: THREE.Group, tileId: string, origin: V3, level: number, sourceSha256: string) {
  if (catalog.sourceManifestSha256 !== release.manifestSha256) return;
  if (group.userData.indianRanchGrounds) return group.userData.indianRanchGrounds;
  const result = applyGroundedSiteFeatures(group, tileId, origin, level, sourceSha256, record(tileId), 'indianRanchGroundSurface', 'Indian Ranch venue ground');
  if (!result || result.status !== 'applied') return result;
  const addition = group.children.find(o => o.name === 'Indian Ranch venue ground')!;
  addition.traverse(o => {
    if (!(o instanceof THREE.Mesh) || Array.isArray(o.material) || !(o.material instanceof THREE.MeshStandardMaterial) || o.userData.townCrafted !== true || o.userData.sourceIds?.length !== 1) return;
    const source = surfaces.get(o.userData.sourceIds[0]);
    if (source && o.material.userData.surfaceRole === 'paving') finishMaterial(o.material, source);
  });
  const seating = benchSections(group, tileId, origin, level);
  return group.userData.indianRanchGrounds = { ...result, seating, sourceInputSha256: catalog.sourceInputSha256 };
}
