import * as THREE from 'three';
import catalog from '../../../data/derived/town/main-street-surfaces.json';
import release from '../../../data/derived/town/release.json';
import cornerIndex from '../../../data/derived/town/street-corners-index.json';
import { applyArtMaterial } from './art-materials';
import { surfaceSet, surfaceMeanLuminance } from './surface-library';
import { terrainGeometryStamp } from './terrain-finish';
import type { V3 } from './contracts';

type FinishKind = 'asphalt' | 'pavers';
type Assignment = [number, FinishKind, number, number, number, number, number, number];
type Selection = { ownership?: 'street-corner-apron'; name: string; parent: string; geometryStamp: string; positions: number; triangles: number; materials: string[]; assignments: Assignment[] };
export type MainStreetSurfaceReport = { applied: boolean; rejected: boolean; asphaltTriangles: number; sidewalkTriangles: number; meshes: number; materialVariants: number; addedDraws: number; geometryBytes: number };
export const MAIN_STREET_SURFACE_PROVENANCE = catalog;
const ASPHALT_LIBRARY_MEAN = surfaceMeanLuminance('asphalt');

const civicCrackFunctions = `
float mainCrackSegment(vec2 p,vec2 a,vec2 b){
  vec2 v=b-a;
  vec2 delta=p-a-v*clamp(dot(p-a,v)/dot(v,v),0.0,1.0);
  return dot(delta,delta);
}
`;

function finishMaterial(source: THREE.MeshStandardMaterial, kind: FinishKind): THREE.MeshStandardMaterial {
  const material = source.clone();
  applyArtMaterial(material);
  const previous = material.onBeforeCompile, previousKey = material.customProgramCacheKey();
  material.name = `${source.name} | photo-informed civic Main Street ${kind}`;
  material.userData.mainStreetSurface = { version: catalog.version, kind, physicalIds: catalog.physicalIds, basis: catalog.inference,
    finishBasis: kind==='asphalt'?'Sparse authored crack-seal vocabulary on this registered civic-asphalt interval; not surveyed present-day damage or repair locations.':'Authored 1.524 m concrete joint rhythm within the retained sidewalk tops; not a measured panel inventory.' };
  material.onBeforeCompile = (shader, renderer) => {
    previous.call(material, shader, renderer);
    if (!shader.vertexShader.includes('#include <project_vertex>') || !shader.fragmentShader.includes('#include <roughnessmap_fragment>')) throw Error('Main Street surface shader anchors changed');
    shader.vertexShader = `attribute vec2 townMainCoord; varying vec2 vTownMainCoord;\n${shader.vertexShader}`
      .replace('#include <project_vertex>', '#include <project_vertex>\nvTownMainCoord=townMainCoord;');
    shader.fragmentShader = `varying vec2 vTownMainCoord;\n${shader.fragmentShader}`;
    if (kind === 'asphalt') {
      shader.fragmentShader=civicCrackFunctions+shader.fragmentShader;
      const anchor = 'diffuseColor.rgb = mix(diffuseColor.rgb,vec3(townAsphaltValue)*vec3(0.94,1.0,1.07),0.96);';
      if (!shader.fragmentShader.includes(anchor)) throw Error('Main Street asphalt shader anchor changed');
      shader.fragmentShader = shader.fragmentShader.replace(anchor, `${anchor}
// Authored weathered-gray reflectance on exact registered road/apron triangles.
// Keep the existing aggregate atlas and apply its mineral detail afterwards.
float mainAsphaltFade=smoothstep(0.0,6.0,vTownMainCoord.x)*(1.0-smoothstep(${(catalog.lengthM-6).toFixed(6)},${catalog.lengthM.toFixed(6)},vTownMainCoord.x));
// Crossing road ribbons share the gray intersection, then return smoothly to
// their retained dark finish outside the Main Street road/parking envelope.
mainAsphaltFade*=1.0-smoothstep(${catalog.junctionFadeM[0].toFixed(1)},${catalog.junctionFadeM[1].toFixed(1)},vTownMainCoord.y);
${surfaceSet('asphalt') ? `// Oxidized binder lifts the whole surface toward the photographed pale gray;
// the aggregate keeps three quarters of its texture contrast (in log terms).
vec3 mainWeatheredGray=vec3(.198,.204,.205)*pow(max(townAsphaltValue,.001)/${ASPHALT_LIBRARY_MEAN.toFixed(4)},.75);` : `vec3 mainWeatheredGray=mix(vec3(.135,.142,.144),vec3(.235,.243,.242),smoothstep(.015,.20,townAsphaltValue));`}
diffuseColor.rgb=mix(diffuseColor.rgb,mainWeatheredGray,mainAsphaltFade);
// VC-0444/0445: a few connected, branched repair marks supply the observed
// older-civic asphalt vocabulary. Cells are world-anchored, not tile anchored.
// Every mark stops inside its cell, so the hash never exposes square seams.
vec2 mainCrackWorld=mat2(.961,-.276,.276,.961)*(vTownArtWorld.xz-vec2(-2885.,949.));
vec2 mainCrackCell=floor(mainCrackWorld/8.0),mainCrackP=fract(mainCrackWorld/8.0)*8.0-4.0;
float mainCrackSeed=townArtHash(mainCrackCell+vec2(43.8,11.2));
float mainCrackChoice=townArtHash(mainCrackCell+vec2(7.1,89.3));
mainCrackP.x*=mainCrackSeed<.5?-1.0:1.0;
mainCrackP-=vec2(mainCrackSeed-.5,mainCrackChoice-.5)*.55;
vec2 mainCrackJoin=vec2(.15+(mainCrackSeed-.5)*.6,-.1);
vec2 mainCrackBranch=vec2(1.65+mainCrackSeed*.5,.25+mainCrackChoice*.8);
float mainCrackDistance=min(mainCrackSegment(mainCrackP,vec2(-1.40+mainCrackSeed*.8,-3.15+mainCrackChoice*.7),mainCrackJoin),mainCrackSegment(mainCrackP,mainCrackJoin,vec2(-.65+mainCrackChoice,3.10-mainCrackSeed*.6)));
mainCrackDistance=min(mainCrackDistance,mainCrackSegment(mainCrackP,mainCrackJoin,mainCrackBranch));
mainCrackDistance=min(mainCrackDistance,mainCrackSegment(mainCrackP,mainCrackBranch,vec2(2.40+mainCrackSeed*.5,1.45+mainCrackChoice*.6)));
mainCrackDistance=min(mainCrackDistance,mainCrackSegment(mainCrackP,mainCrackJoin,vec2(-2.55+mainCrackChoice*.5,.8+mainCrackSeed)));
mainCrackDistance=sqrt(mainCrackDistance);
float mainCrackAA=max(townArtFootprint*.65,.001);
// Sealant bands are a few centimetres wide, soft-edged where the squeegee
// feathered them, and recede with distance instead of reading as pen lines.
float mainCrackWidth=mix(.018,.034,mainCrackSeed);
float mainCrackResolved=1.0-smoothstep(.010,.045,townArtFootprint);
float mainCrackCoverage=(1.0-smoothstep(mainCrackWidth*.45-mainCrackAA,mainCrackWidth+mainCrackAA,mainCrackDistance))
  *step(.80,mainCrackChoice)*mainCrackResolved*mainAsphaltFade;
diffuseColor.rgb*=1.0-mainCrackCoverage*.30;
`);
      shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',`
// Apply after the mineral field has assigned its height, before normal shading.
// This shallow sealed seam never changes road support or the paint layer.
townArtHeight-=mainCrackCoverage*.00055;
#include <roughnessmap_fragment>
`);
    } else {
      shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', `
// The band changes only this retained sidewalk top; curb volume and concrete
// walking center are preserved. Coordinates share one route-wide joint phase.
vec2 mainPaverAA=max(fwidth(vTownMainCoord),vec2(.0001));
float mainBand=smoothstep(${catalog.paverBandM[0]},${catalog.paverBandM[0]}+mainPaverAA.y,vTownMainCoord.y)
  *(1.0-smoothstep(${catalog.paverBandM[1]}-mainPaverAA.y,${catalog.paverBandM[1]},vTownMainCoord.y));
vec2 mainPaverGrid=vTownMainCoord/vec2(.2032,.1016);
mainPaverGrid.x+=mod(floor(mainPaverGrid.y),2.0)*.5;
vec2 mainPaverCell=floor(mainPaverGrid),mainPaverEdge=min(fract(mainPaverGrid),1.0-fract(mainPaverGrid))*vec2(.2032,.1016);
float mainPaverResolved=1.0-smoothstep(.006,.030,max(mainPaverAA.x,mainPaverAA.y));
vec2 mainPaverJoint=1.0-smoothstep(vec2(.0012),vec2(.0020)+mainPaverAA*.7,mainPaverEdge);
float mainPaverVariation=(townArtHash(mainPaverCell)-.5)*(1.0-smoothstep(.04,.12,max(mainPaverAA.x,mainPaverAA.y)));
vec3 mainPaverColor=vec3(.215,.073,.045)*(1.0+mainPaverVariation*.16);
mainPaverColor*=1.0-max(mainPaverJoint.x,mainPaverJoint.y)*.24*mainPaverResolved;
diffuseColor.rgb=mix(diffuseColor.rgb,mainPaverColor,mainBand);
// Authored five-foot panel rhythm follows this registered walk's curving route,
// rather than a global X/Z grid. Dimensions and joint ages are not a survey.
// Restrict joints to concrete: the separate curbside paver band keeps its phase.
float mainConcrete=1.0-mainBand;
float mainPanelPhase=vTownMainCoord.x/1.524;
float mainPanelEdge=min(fract(mainPanelPhase),1.0-fract(mainPanelPhase))*1.524;
float mainPanelResolved=1.0-smoothstep(.028,.13,mainPaverAA.x);
float mainPanelJoint=(1.0-smoothstep(.003,.007+mainPaverAA.x*.55,mainPanelEdge))*mainPanelResolved*mainConcrete;
float mainPanelVariation=(townArtHash(vec2(floor(mainPanelPhase),11.7))-.5)*.045*mainConcrete;
diffuseColor.rgb*=1.0+mainPanelVariation-mainPanelJoint*.28;
// The existing mineral normal hook consumes this sub-millimetre recess.
townArtHeight-=mainPanelJoint*.0012;
#include <roughnessmap_fragment>
`);
    }
  };
  material.customProgramCacheKey = () => `${previousKey}|main-street-surface-v6:${kind}`;
  material.needsUpdate = true;
  return material;
}

/** Apply after road inventory materials and street geometry, before pooling.
 * One all-or-nothing source qualification precedes the material regrouping.
 * All original attribute objects and every source triangle/winding survive. */
export function applyMainStreetSurfaces(group: THREE.Group, tileId: string, origin: V3, level: number, sourceSha256: string): MainStreetSurfaceReport | undefined {
  if (tileId !== catalog.tileId) return;
  const previous = group.userData.mainStreetSurfaces as MainStreetSurfaceReport | undefined;
  if (previous) return previous;
  const report: MainStreetSurfaceReport = { applied: false, rejected: false, asphaltTriangles: 0, sidewalkTriangles: 0, meshes: 0, materialVariants: 0, addedDraws: 0, geometryBytes: 0 };
  const selected = catalog.levels.find(row => row.level === level);
  if (catalog.sourceManifestSha256 !== release.manifestSha256 || selected?.sourceSha256 !== sourceSha256 || catalog.origin.some((v,i)=>v!==origin[i])) return { ...report, rejected: true };
  const all: THREE.Mesh[] = [];
  group.traverse(o=>{if(o instanceof THREE.Mesh)all.push(o);});
  const records = catalog.meshes as Selection[];
  const plans: { mesh: THREE.Mesh; geometry: THREE.BufferGeometry; materials: THREE.Material[] }[] = [];
  const ownedMaterials: THREE.Material[] = [];
  try {
    for (const record of records) {
      const cornerOwned=record.ownership==='street-corner-apron';
      if(cornerOwned){
        const ref=(cornerIndex.tiles as Record<string,{url:string;sha256:string}>)[tileId];
        if(record.name!=='finished_street_corner_apron'||ref?.url!==catalog.sourceCorners.url||ref.sha256!==catalog.sourceCorners.sha256||!group.userData.streetCorners||group.userData.streetCorners.rejected)throw Error('Corner source differs');
      }
      const candidates = all.filter(m=>m.name===record.name&&m.parent?.name===record.parent&&(cornerOwned?m.userData.townCrafted===true&&m.userData.category==='roads':!m.userData.townCrafted));
      if (candidates.length!==1) throw Error('Ambiguous source mesh');
      const mesh=candidates[0],old=mesh.geometry,p=old.getAttribute('position'),total=old.index?.count??p.count;
      const materials=Array.isArray(mesh.material)?mesh.material:[mesh.material];
      if (terrainGeometryStamp(old)!==record.geometryStamp || p.count!==record.positions || total!==record.triangles*3 || old.drawRange.start!==0 || old.drawRange.count!==Infinity || old.hasAttribute('townMainCoord') || JSON.stringify(materials.map(m=>m.name))!==JSON.stringify(record.materials)) throw Error('Source mesh differs');
      if(cornerOwned&&(materials.length!==1||materials[0].userData.townRoadSurfaceType!==6||record.assignments.length!==catalog.expectedCornerTriangles))throw Error('Corner material ownership differs');
      const parts=old.groups.length?old.groups:[{start:0,count:total,materialIndex:0}];
      const assignments=new Map(record.assignments.map(row=>[row[0],row]));
      if(assignments.size!==record.assignments.length)throw Error('Duplicate source assignment');
      const coords=new Float32Array(p.count*2),written=new Set<number>(),buckets=new Map<THREE.Material,number[]>(),variants=new Map<THREE.Material,Map<FinishKind,THREE.Material>>();
      const geometry=new THREE.BufferGeometry();
      // Register immediately so the transaction can dispose all prepared data.
      plans.push({mesh,geometry,materials:[]});
      for(const[name,a]of Object.entries(old.attributes))geometry.setAttribute(name,a);
      geometry.morphAttributes=old.morphAttributes;geometry.morphTargetsRelative=old.morphTargetsRelative;
      geometry.boundingBox=old.boundingBox?.clone()??null;geometry.boundingSphere=old.boundingSphere?.clone()??null;geometry.userData={...old.userData};
      let applied=0;
      for(let offset=0;offset<total;offset+=3){
        const part=parts.find(part=>offset>=part.start&&offset+2<part.start+part.count);
        let material=part?materials[part.materialIndex??0]:undefined;
        if(!material)throw Error('Incomplete source groups');
        const row=assignments.get(offset/3),ids=[0,1,2].map(k=>old.index?.getX(offset+k)??offset+k);
        if(row){
          const kind=row[1];
          if(!(material instanceof THREE.MeshStandardMaterial) || row.length!==8 || row.slice(2).some(v=>typeof v!=='number'||!Number.isFinite(v)) || (kind==='asphalt'?!(cornerOwned?material.name==='Finished street corner | asphalt apron':['Drive road | asphalt','Streetscape | parking apron asphalt'].includes(material.name)):kind!=='pavers'||!/^Streetscape \| (warm|cool|repaired) sidewalk concrete$/.test(material.name)))throw Error('Material source differs');
          for(let k=0;k<3;k++){
            const id=ids[k],u=row[2+k*2] as number,v=row[3+k*2] as number;
            if(written.has(id)&&(Math.abs(coords[id*2]-u)>.001||Math.abs(coords[id*2+1]-v)>.001))throw Error('Inconsistent shared source vertex');
            coords[id*2]=u;coords[id*2+1]=v;written.add(id);
          }
          let kinds=variants.get(material);if(!kinds){kinds=new Map();variants.set(material,kinds);}
          let variant=kinds.get(kind);if(!variant){variant=finishMaterial(material,kind);kinds.set(kind,variant);ownedMaterials.push(variant);report.materialVariants++;}
          material=variant;applied++;if(kind==='asphalt')report.asphaltTriangles++;else report.sidewalkTriangles++;
        }
        const bucket=buckets.get(material)??[];bucket.push(...ids);buckets.set(material,bucket);
      }
      if(applied!==assignments.size)throw Error('Invalid source triangle');
      const indices:number[]=[],next:THREE.Material[]=[];
      for(const[material,bucket]of buckets){geometry.addGroup(indices.length,bucket.length,next.length);indices.push(...bucket);next.push(material);}
      geometry.setIndex(p.count>65535?new THREE.Uint32BufferAttribute(indices,1):new THREE.Uint16BufferAttribute(indices,1));
      geometry.setAttribute('townMainCoord',new THREE.BufferAttribute(coords,2));
      plans.at(-1)!.materials=next;report.geometryBytes+=coords.byteLength+geometry.index!.array.byteLength;report.addedDraws+=next.length-parts.length;report.meshes++;
    }
  } catch {
    plans.forEach(p=>p.geometry.dispose());ownedMaterials.forEach(m=>m.dispose());
    return { applied:false,rejected:true,asphaltTriangles:0,sidewalkTriangles:0,meshes:0,materialVariants:0,addedDraws:0,geometryBytes:0 };
  }
  const retired=new Set<THREE.BufferGeometry>();
  for(const plan of plans){retired.add(plan.mesh.geometry);plan.mesh.geometry=plan.geometry;plan.mesh.material=plan.materials.length===1?plan.materials[0]:plan.materials;}
  all.forEach(m=>retired.delete(m.geometry));retired.forEach(g=>g.dispose());
  report.applied=true;group.userData.mainStreetSurfaces=report;return report;
}
