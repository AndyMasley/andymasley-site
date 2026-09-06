import * as THREE from 'three';
import data from '../../../data/derived/town/crafted-frontages.json';

type V2 = readonly number[];
type Frame = { start: V2; tangent: V2; outward: V2; structId: string; tileId: string };
type School = typeof data.school[number];
type Commercial = typeof data.commercial[number];
type Role = 'wall' | 'roof' | 'foundation' | 'trim' | 'glass' | 'recess' | 'door' | 'metal' | 'paving' | 'stone' | 'leaf' | 'brick';
type Chunk = { positions: number[]; normals: number[]; ids: Set<string>; role: Role; color: string };
export type FrontageReport = { version: number; tileId: string; schoolIds: string[]; commercialIds: string[]; removedTriangles: number; addedTriangles: number; addedMeshes: number; geometryBytes: number };

export const CRAFTED_FRONTAGE_VERSION = 1;
export const CRAFTED_SCHOOL_IDS = data.school.map((record) => record.structId);
export const CRAFTED_FRONTAGE_PROVENANCE = { sourceAtlasSha256: data.sourceAtlasSha256, sourceBuildingRegisterSha256: data.sourceBuildingRegisterSha256, sourcePhotosSha256: data.sourcePhotosSha256, school: data.school.map(({ structId, source, inference }) => ({ structId, source, inference })), commercial: data.commercial.map(({ structId, source, inference }) => ({ structId, source, inference })), excludedPhoto: data.excludedPhoto };

const PALETTE: Record<Role, string> = { wall: '#c7cabf', roof: '#50544e', foundation: '#79776b', trim: '#dedbd0', glass: '#3b545b', recess: '#354340', door: '#3d554d', metal: '#454e48', paving: '#656966', stone: '#919183', leaf: '#567044', brick: '#956b54' };
const box = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();
const boxPosition = Array.from(box.getAttribute('position').array);
const boxNormal = Array.from(box.getAttribute('normal').array);
box.dispose();
const shrub = new THREE.IcosahedronGeometry(1, 2);
const shrubVertices = shrub.getAttribute('position');
for(let i=0;i<shrubVertices.count;i++) {
  const x=shrubVertices.getX(i),y=shrubVertices.getY(i),z=shrubVertices.getZ(i);
  const relief=1+.07*Math.sin(x*11.3+y*7.1)*Math.sin(z*9.4-y*5.8)+.035*Math.sin(z*23.5+x*13.7);
  shrubVertices.setXYZ(i,x*relief,y*relief,z*relief);
}
const shrubPosition = Array.from(shrub.getAttribute('position').array);
const shrubNormal = Array.from(shrub.getAttribute('normal').array);
shrub.dispose();

function decode(value: string): Float32Array {
  const binary = atob(value), bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Float32Array(bytes.buffer);
}

function material(role: Role, color: string): THREE.MeshStandardMaterial {
  const result = new THREE.MeshStandardMaterial({ color, roughness: role === 'glass' ? 0.24 : role === 'metal' ? 0.6 : 0.87, metalness: role === 'glass' ? 0.22 : role === 'metal' ? 0.35 : 0 });
  result.name = `Crafted frontage | ${role} | ${color}`;
  result.userData.surfaceRole = role;
  result.userData.townCrafted = true;
  result.envMapIntensity = role === 'glass' ? .32 : .12;
  result.userData.appearanceBasis = 'Dated facade observations plus explicitly inferred dimensions and late-summer materials.';
  if (['wall', 'roof', 'brick', 'stone', 'paving', 'foundation', 'leaf'].includes(role)) {
    result.onBeforeCompile = (shader) => {
      shader.vertexShader = `varying vec3 vCraftedWorld;\n${shader.vertexShader}`.replace('#include <project_vertex>', '#include <project_vertex>\nvCraftedWorld = (modelMatrix * vec4(transformed,1.0)).xyz;');
      shader.fragmentShader = `varying vec3 vCraftedWorld;\n${shader.fragmentShader}`.replace('#include <map_fragment>', `
#include <map_fragment>
float craftedNear = 1.0-smoothstep(25.0,110.0,length(cameraPosition-vCraftedWorld));
float craftedRow = fract(vCraftedWorld.y/${role === 'brick' ? '0.085' : '0.145'});
float craftedFine = max(fwidth(vCraftedWorld.y/${role === 'brick' ? '0.085' : '0.145'}),0.002);
float craftedJoint = (1.0-smoothstep(0.025,0.045+craftedFine,craftedRow))*craftedNear;
float craftedNoise = sin(vCraftedWorld.x*4.41+vCraftedWorld.z*2.35)*sin(vCraftedWorld.z*7.63-vCraftedWorld.x*1.14);
diffuseColor.rgb *= 1.0+craftedNoise*0.025;
${role === 'wall' ? 'diffuseColor.rgb *= 1.0-craftedJoint*0.13;' : role === 'brick' ? 'diffuseColor.rgb = mix(diffuseColor.rgb,vec3(0.29,0.27,0.23),craftedJoint*0.5);' : role === 'leaf' ? 'diffuseColor.rgb *= 0.90+0.12*sin(vCraftedWorld.x*17.1+vCraftedWorld.y*12.7)*sin(vCraftedWorld.z*16.8-vCraftedWorld.y*6.2);' : ''}
`);
    };
    result.customProgramCacheKey = () => `crafted-frontages-v1:${role}`;
  }
  return result;
}

class Batch {
  readonly chunks = new Map<string, Chunk>();
  constructor(readonly origin: THREE.Vector3, readonly level: number) {}

  geometry(frame: Frame, role: Role, position: ArrayLike<number>, normal: ArrayLike<number>, color = PALETTE[role]): void {
    const key = `${role}:${color}`;
    let chunk = this.chunks.get(key);
    if (!chunk) { chunk = { positions: [], normals: [], ids: new Set(), role, color }; this.chunks.set(key, chunk); }
    chunk.ids.add(frame.structId);
    const [tx, ty] = frame.tangent, [nx, ny] = frame.outward;
    for (let i = 0; i < position.length; i += 3) {
      const u = position[i], height = position[i+1], v = position[i+2];
      chunk.positions.push(frame.start[0]+tx*u+nx*v-this.origin.x, height-this.origin.y, -(frame.start[1]+ty*u+ny*v)-this.origin.z);
      const a = normal[i], b = normal[i+1], c = normal[i+2];
      chunk.normals.push(tx*a+nx*c, b, -ty*a-ny*c);
    }
  }

  box(f: Frame, role: Role, u: number, y: number, v: number, width: number, height: number, depth: number, color = PALETTE[role], yaw = 0): void {
    if (Math.min(width,height,depth) <= 0) return;
    const p: number[] = [], n: number[] = [], c = Math.cos(yaw), s = Math.sin(yaw);
    for (let i = 0; i < boxPosition.length; i += 3) {
      const x = boxPosition[i]*width, z = boxPosition[i+2]*depth;
      p.push(u+x*c+z*s, y+boxPosition[i+1]*height, v-x*s+z*c);
      n.push(boxNormal[i]*c+boxNormal[i+2]*s,boxNormal[i+1],-boxNormal[i]*s+boxNormal[i+2]*c);
    }
    this.geometry(f,role,p,n,color);
  }

  polygon(f: Frame, role: Role, points: number[][], color = PALETTE[role]): void {
    if (points.length < 3) return;
    const a = new THREE.Vector3().fromArray(points[0]), b = new THREE.Vector3().fromArray(points[1]), c = new THREE.Vector3().fromArray(points[2]);
    const normal = b.sub(a).cross(c.sub(a)).normalize(), p: number[] = [], n: number[] = [];
    for (let j = 1; j < points.length-1; j++) for (const point of [points[0],points[j],points[j+1]]) { p.push(...point); n.push(normal.x,normal.y,normal.z); }
    this.geometry(f,role,p,n,color);
  }

  window(f: Frame, u: number, bottom: number, width: number, height: number, v = 0, paired = false, shutters = false): void {
    this.box(f,'recess',u,bottom+height/2,v+.018,width+.17,height+.17,.08);
    this.box(f,'glass',u,bottom+height/2,v+.078,width,height,.035);
    const trim = .085;
    for (const sign of [-1,1]) this.box(f,'trim',u+sign*(width/2+.035),bottom+height/2,v+.14,trim,height+.16,.13);
    for (const h of [bottom-.04,bottom+height+.045]) this.box(f,'trim',u,h,v+.17,width+.22,.085,.20);
    if (this.level < 2) {
      this.box(f,'trim',u,bottom+height*.5,v+.135,width,.035,.045);
      if (paired) this.box(f,'trim',u,bottom+height/2,v+.145,.085,height,.055);
      if (shutters) for (const sign of [-1,1]) {
        const x=u+sign*(width/2+.28);this.box(f,'door',x,bottom+height/2,v+.10,.37,height+.10,.075);
        if (!this.level) for (let j=0;j<8;j++) this.box(f,'metal',x,bottom+(j+.5)*height/8,v+.15,.31,.025,.035);
      }
    }
  }

  door(f: Frame, u: number, floor: number, v = 0, width = .98, color = PALETTE.door): void {
    this.box(f,'recess',u,floor+1.1,v+.06,width+.20,2.24,.13);
    this.box(f,'door',u,floor+1.04,v+.14,width,2.08,.065,color);
    this.box(f,'glass',u,floor+1.42,v+.183,width*.65,.74,.02);
    for(const sign of [-1,1]) this.box(f,'trim',u+sign*(width/2+.07),floor+1.1,v+.20,.11,2.26,.15);
    this.box(f,'trim',u,floor+2.2,v+.2,width+.32,.14,.18);
    if (!this.level) this.box(f,'metal',u+width*.33,floor+1.04,v+.20,.032,.11,.03);
  }

  cornice(f: Frame, width: number, height: number, v = 0): void {
    this.box(f,'trim',width/2,height-.12,v+.10,width+.14,.20,.20);
    this.box(f,'trim',width/2,height+.04,v+.22,width+.36,.10,.43);
    if (!this.level) for(let x=.35;x<width-.2;x+=.9) this.box(f,'trim',x,height-.29,v+.11,.085,.23,.22);
  }

  finish(): { group: THREE.Group; triangles: number; bytes: number } {
    const group = new THREE.Group(); group.name = 'Crafted buildings and frontages';
    let triangles=0, bytes=0;
    for(const chunk of this.chunks.values()) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position',new THREE.Float32BufferAttribute(chunk.positions,3));
      geometry.setAttribute('normal',new THREE.Float32BufferAttribute(chunk.normals,3));
      geometry.computeBoundingBox(); geometry.computeBoundingSphere();
      const mesh=new THREE.Mesh(geometry,material(chunk.role,chunk.color));
      mesh.name=`Crafted building frontage | ${chunk.role}`; mesh.userData.sourceIds=[...chunk.ids].sort(); mesh.userData.category='crafted-frontages';
      mesh.userData.townCrafted=true;
      mesh.castShadow=!['glass','paving'].includes(chunk.role);mesh.receiveShadow=true;
      group.add(mesh);triangles+=chunk.positions.length/9;bytes+=(chunk.positions.length+chunk.normals.length)*4;
    }
    return {group,triangles,bytes};
  }
}

export function frontageGround(record: School, u: number, outward: number): number {
  const grid=record.support, d=-outward;
  const ix=THREE.MathUtils.clamp(Math.floor((u-grid.x[0])/2),0,grid.x.length-2), iy=THREE.MathUtils.clamp(Math.floor((d-grid.depth[0])/2),0,grid.depth.length-2);
  const fx=THREE.MathUtils.clamp((u-grid.x[ix])/2,0,1), fy=THREE.MathUtils.clamp((d-grid.depth[iy])/2,0,1), offset=iy*grid.x.length+ix;
  return THREE.MathUtils.lerp(THREE.MathUtils.lerp(grid.heights[offset],grid.heights[offset+1],fx),THREE.MathUtils.lerp(grid.heights[offset+grid.x.length],grid.heights[offset+grid.x.length+1],fx),fy);
}

function groundStrip(batch: Batch, f: School, u0: number, u1: number, v0: number, v1: number, role: Role): void {
  for(let v=v0;v<v1-.001;v+=.8) {
    const end=Math.min(v1,v+.8), p=[[u0,frontageGround(f,u0,v)+.04,v],[u0,frontageGround(f,u0,end)+.04,end],[u1,frontageGround(f,u1,end)+.04,end],[u1,frontageGround(f,u1,v)+.04,v]];
    batch.polygon(f,role,p);
  }
}

function approach(batch: Batch, f: School, entry: number): void {
  const width=1.15, reach=f.approachM, start=f.porchDepth ? -f.porchDepth : 0;
  groundStrip(batch,f,entry-width/2,entry+width/2,start,reach,'paving');
  const ground=frontageGround(f,entry,.8), rise=Math.max(0,f.floor-ground), risers=Math.max(1,Math.ceil(rise/.18));
  for(let i=0;i<Math.min(10,risers);i++) {
    const v=start+.2+i*.29, bottom=frontageGround(f,entry,v)-.07, top=f.floor-.04-i*.17;
    if(top>bottom+.07 && v<reach) batch.box(f,'stone',entry,(top+bottom)/2,v,1.4,top-bottom,.32);
  }
  if(['121','130','135','140','151','156'].includes(f.number)) {
    const wallV=Math.max(.55,reach-.5);
    for(const [a,b] of [[.10,entry-.8],[entry+.8,f.width-.1]]) {
      if(b-a<.5)continue;
      const y=frontageGround(f,(a+b)/2,wallV); batch.box(f,'stone',(a+b)/2,y+.28,wallV,b-a,.56,.28);
      batch.box(f,'trim',(a+b)/2,y+.59,wallV,b-a+.06,.08,.36,'#bbb9a8');
    }
  }
}

function porch(batch: Batch, f: School, enclosed: boolean, entry: number): void {
  const h=2.55, depth=f.porchDepth, floor=f.floor, width=f.width;
  batch.box(f,'foundation',width/2,floor-.12,-depth/2,width,.22,depth);
  batch.polygon(f,'roof',[[0,floor+h+.18,.18],[width,floor+h+.18,.18],[width,floor+h+.65,-depth-.15],[0,floor+h+.65,-depth-.15]]);
  batch.cornice(f,width,floor+h);
  if(enclosed) {
    const bays=Math.max(6,Math.round(width/1.12));
    for(let i=0;i<bays;i++) {
      const u=(i+.5)*width/bays;
      if(Math.abs(u-entry)<.65)continue;
      batch.window(f,u,floor+.55,width/bays-.15,1.70,0,false);
    }
    batch.box(f,'wall',width/2,floor+.25,.02,width,.49,.13,f.paint);
    batch.door(f,entry,floor,.03,.9);
  } else {
    const posts=Math.max(4,Math.round(width/2.3)+1);
    for(let i=0;i<posts;i++) {
      const u=.12+i*(width-.24)/(posts-1);
      batch.box(f,'trim',u,floor+h/2,.07,.13,h,.16);
      batch.box(f,'trim',u,floor+.18,.07,.25,.36,.28);
      batch.box(f,'trim',u,floor+h-.15,.07,.25,.20,.28);
    }
    for(const [a,b]of[[.15,entry-.68],[entry+.68,width-.15]]) if(b>a) {
      batch.box(f,'trim',(a+b)/2,floor+.94,.10,b-a,.075,.12);
      batch.box(f,'trim',(a+b)/2,floor+.19,.10,b-a,.08,.12);
      if(batch.level<2)for(let u=a+.08;u<b;u+=.21)batch.box(f,'trim',u,floor+.56,.10,.035,.72,.035);
    }
    batch.door(f,entry,floor,-depth);
    for(const u of [width*.24,width*.78]) if(Math.abs(u-entry)>1)batch.window(f,u,floor+.95,1.0,1.30,-depth);
  }
}

function dormer(batch: Batch, f: School, u: number, bottom: number, width: number, roofDepth: number, shed = false): void {
  const v=-roofDepth, h=1.60;
  batch.box(f,'wall',u,bottom+h/2,v-.3,width+.22,h+.10,.7,f.paint);
  batch.window(f,u,bottom+.10,width-.1,1.38,v+.07);
  const top=bottom+h+.10;
  if(shed)batch.polygon(f,'roof',[[u-width/2-.2,top,v+.2],[u+width/2+.2,top,v+.2],[u+width/2+.2,top+.14,v-.85],[u-width/2-.2,top+.14,v-.85]]);
  else {
    batch.polygon(f,'trim',[[u-width/2-.15,top,v+.09],[u+width/2+.15,top,v+.09],[u,top+.40,v+.09]]);
    batch.polygon(f,'roof',[[u-width/2-.20,top,v+.18],[u,top+.45,v+.18],[u,top+.45,v-1.0],[u-width/2-.20,top,v-1.0]]);
    batch.polygon(f,'roof',[[u,top+.45,v+.18],[u+width/2+.20,top,v+.18],[u+width/2+.20,top,v-1.0],[u,top+.45,v-1.0]]);
  }
}

function planting(batch: Batch, f: School, entry: number): void {
  if(batch.level>1 || !['121','130','135','140','151','156','116'].includes(f.number))return;
  for(let u=.8;u<f.width-.6;u+=1.15) {
    if(Math.abs(u-entry)<1.25)continue;
    const v=.65,y=frontageGround(f,u,v), p: number[]=[],n: number[]=[];
    for(let i=0;i<shrubPosition.length;i+=3) {
      p.push(u+shrubPosition[i]*.54,y+.43+shrubPosition[i+1]*.48,v+shrubPosition[i+2]*.44);
      const normal=new THREE.Vector3(shrubNormal[i]/.54,shrubNormal[i+1]/.48,shrubNormal[i+2]/.44).normalize();n.push(normal.x,normal.y,normal.z);
    }
    batch.geometry(f,'leaf',p,n);
  }
}

function school(batch: Batch, f: School): void {
  for(const chunk of f.body)batch.geometry(f,chunk.role as Role,decode(chunk.position),decode(chunk.normal),chunk.role==='wall'?f.number==='116'?PALETTE.brick:f.paint:chunk.role==='roof'&&f.number==='130'?'#665b48':PALETTE[chunk.role as Role]);
  const w=f.width,g=f.floor;let entry=w*.5;
  const window=(u:number,bottom:number,width=.96,height=1.5,v=0,paired=false,shutters=false)=>batch.window(f,u,bottom,width,height,v,paired,shutters);
  if(f.number==='57') {
    for(const bottom of [g+.80,g+3.75])for(const u of [w*.25,w*.7])window(u,bottom,.98,1.63);
    batch.cornice(f,w,44.15);entry=w*.15;batch.door(f,entry,g);
    // Separate wing windows follow the registered long visible wall, not an
    // invented row copied around every elevation.
    const wing={...f,start:[f.start[0]+f.tangent[0]*6.7-f.outward[0]*15.3,f.start[1]+f.tangent[1]*6.7-f.outward[1]*15.3],tangent:[f.tangent[0]*.87-f.outward[0]*.50,f.tangent[1]*.87-f.outward[1]*.50],outward:[f.outward[0]*.87+f.tangent[0]*.50,f.outward[1]*.87+f.tangent[1]*.50]};
    for(let x=1.5;x<17;x+=3.4)for(const z of [g+.8,g+3.75])batch.window(wing,x,z,.95,1.6);
  } else if(f.number==='60') {
    entry=w*.20;for(const bottom of [g+.7,g+3.7])window(w*.66,bottom,1.8,1.4,0,true);
    window(w*.2,g+3.65,.85,1.65);batch.door(f,entry,g);batch.cornice(f,w,45.08);
    for(const u of [w*.30,w*.70])dormer(batch,f,u,45.45,1.22,.30,true);
  } else if(f.number==='79') {
    batch.box(f,'foundation',w/2,g+1.1,-.008,w,2.6,.12,'#7d7a6b');
    for(let level=0;level<3;level++)for(let i=0;i<5;i++)if(level||i!==2)window((i+.5)*w/5,g+.6+level*3.05,1.0,1.62);
    batch.door(f,entry,g);batch.cornice(f,w,48.92);
  } else if(f.number==='107') {
    batch.box(f,'trim',w/2,g+1.45,.02,w,3.1,.16,'#d9d7c5');
    for(const u of [w*.22,w*.78])window(u,g+.45,w*.32,2.1,.15,true);
    batch.door(f,entry,g,.2,1.04,'#8b4738');batch.cornice(f,w,42.55);
    batch.box(f,'trim',w/2,42.75,.03,w*.42,.42,.30);
  } else if(f.number==='116') {
    // The civic building sits behind a broad paved forecourt on School Street.
    // Its prior nearest-road field referred to High Street, not this approach.
    groundStrip(batch,f,-1.5,w+1.5,.5,Math.max(2,f.approachM-4),'paving');
    entry=w*.47;batch.box(f,'trim',w/2,47.12,.10,w+.28,.42,.31);
    for(let x=1;x<w;x+=2.0)if(Math.abs(x-entry)>2)window(x,g+2.15,1.34,.90);
    batch.box(f,'brick',entry,g+1.75,.40,3.1,3.5,1.1);batch.door(f,entry,g,1.0,1.24);
    batch.polygon(f,'roof',[[entry-1.85,g+3.65,1.12],[entry+1.85,g+3.65,1.12],[entry,g+4.65,-.20]]);
    batch.polygon(f,'roof',[[entry+1.85,g+3.65,1.12],[entry+1.85,g+3.65,-1.15],[entry,g+4.65,-.20]]);
    batch.polygon(f,'roof',[[entry-1.85,g+3.65,-1.15],[entry-1.85,g+3.65,1.12],[entry,g+4.65,-.20]]);
  } else if(f.number==='121') {
    entry=w*.78;porch(batch,f,true,entry);for(const u of [w*.25,w*.64])dormer(batch,f,u,45.65,1.40,2.65);
  } else if(f.number==='130') {
    for(let i=0;i<5;i++){window((i+.5)*w/5,g+3.55,1.02,1.58);if(i!==2)window((i+.5)*w/5,g+.60,1.02,1.58);}
    batch.door(f,entry,g);for(const sign of [-1,1])batch.box(f,'trim',entry+sign*.86,g+1.28,.72,.16,2.56,.18);
    batch.box(f,'trim',entry,g+2.66,.36,2.15,.20,1.18);batch.polygon(f,'roof',[[entry-1.17,g+2.74,1],[entry+1.17,g+2.74,1],[entry,g+3.2,1]]);
    batch.cornice(f,w,48.15);
  } else if(f.number==='135') {
    for(const bottom of [g+.65,g+3.6])for(const u of [w*.24,w*.76])window(u,bottom,1.05,1.53);
    window(w*.5,48.2,.68,1.0);batch.door(f,entry,g);batch.box(f,'trim',entry,g+2.39,.32,1.55,.15,.80);
  } else if(f.number==='140'||f.number==='156') {
    entry=w*.52;porch(batch,f,false,entry);
    for(let i=0;i<3;i++)window((i+.5)*w/3,g+3.64,.96,1.53,-f.porchDepth,false,f.number==='140');
    window(w*.5,f.number==='140'?48.15:49.05,.58,.88,-f.porchDepth);
  } else if(f.number==='151') {
    porch(batch,f,true,entry);
    for(const u of [w*.24,w*.72]) {
      batch.box(f,'wall',u,g+4.3,.18,2.2,2.7,.64,f.paint);window(u,g+3.15,1.46,1.58,.52,true);
      for(const sign of [-1,1])batch.box(f,'trim',u+sign*1.08,g+4.25,.39,.10,2.75,.55);
      batch.box(f,'trim',u,g+5.63,.33,2.6,.18,.92);batch.polygon(f,'trim',[[u-1.32,g+5.73,.81],[u+1.32,g+5.73,.81],[u,g+6.57,.81]]);
      batch.box(f,'trim',u,g+2.87,.6,2.55,.12,.20);
    }
  }
  // Quiet side elevations are inferred and subordinate to the observed front.
  if(!['57','116'].includes(f.number)) {
    const maxDepth=Math.max(...f.outline.map((point)=>point[1]));
    const side={...f,start:[f.start[0]-f.outward[0]*2.0,f.start[1]-f.outward[1]*2.0],tangent:[-f.outward[0],-f.outward[1]],outward:[-f.tangent[0],-f.tangent[1]]};
    for(let d=2;d<Math.min(maxDepth-3,15);d+=4.0)for(const bottom of [g+.80,g+3.7])if(bottom+1.3<f.roofMasses[0].eave-.2)batch.window(side,d,bottom,.88,1.3);
  }
  approach(batch,f,entry);planting(batch,f,entry);
  if(['60','79','121','135','140','156'].includes(f.number)) {
    const left=f.number==='156', x=left?-2.15:w+1.75;
    groundStrip(batch,f,x-1.25,x+1.25,-Math.min(12,Math.max(...f.outline.map(p=>p[1]))),f.approachM,'paving');
  }
}

function commercial(batch: Batch, f: Commercial): void {
  const w=f.width, height=f.eave-f.floor, count=Math.max(2,Math.round(w/4.2)), bay=w/count, entry=Math.floor(count/2), floor=f.floor;
  const wallColor=f.structId==='168461_866703'?'#976f55':f.structId==='168378_866662'?'#aa8970':'#b6b09c';
  batch.box(f,'brick',w/2,floor+height/2,.012,w,height,.10,wallColor);
  for(let i=0;i<count;i++) {
    const u=(i+.5)*bay;
    if(i===entry)batch.door(f,u,floor,.15,Math.min(1.4,bay*.4));
    else batch.window(f,u,floor+.42,bay-.52,Math.min(2.35,height-.7),.10,true);
    batch.box(f,'trim',i*bay,floor+1.48,.18,.17,3.0,.28,'#c9c1ac');
    // Solid, unlettered sign/cornice fascia: no fabricated business names.
    batch.box(f,'door',u,floor+3.05,.18,bay-.15,.40,.27,'#525e58');
  }
  if(height>5.1) {
    const upperCount=Math.max(count,Math.floor(w/2.8)), rows=Math.max(1,Math.floor((height-3.6)/2.7));
    for(let level=0;level<rows;level++)for(let i=0;i<upperCount;i++)batch.window(f,(i+.5)*w/upperCount,floor+3.75+level*2.7,Math.min(1.3,w/upperCount-.40),Math.min(1.65,height-4.05-level*2.7),.10);
    batch.box(f,'trim',w/2,floor+3.48,.20,w+.1,.13,.29,'#c4bda9');
  }
  batch.cornice(f,w,f.eave+.1);
}

function frontageCoordinates(frame: Frame, world: THREE.Vector3): [number,number] {
  const dx=world.x-frame.start[0],dy=-world.z-frame.start[1];
  return [dx*frame.tangent[0]+dy*frame.tangent[1],dx*frame.outward[0]+dy*frame.outward[1]];
}

function inCommercialBand(frame: Commercial, world: THREE.Vector3): boolean {
  const [u,v]=frontageCoordinates(frame,world);
  return u>=-.50&&u<=frame.width+.50&&v>=-.26&&v<=.65&&world.y>=frame.floor-.5&&world.y<=frame.eave+.65;
}

/** Patch a just-decoded tile BEFORE TownWorld.acquireMaterials. Original source
 * GLBs stay untouched. Only the exclusive School material namespace or generic
 * detail triangles in the reviewed Main Street facade bands are removed.
 */
export function applyCraftedFrontages(group: THREE.Object3D, tileId: string, tileOrigin: readonly number[], level=0): FrontageReport | undefined {
  const existing=group.userData.craftedFrontages as FrontageReport|undefined;
  if(existing)return existing;
  const schoolRows=data.school.filter(r=>r.tileId===tileId),commercialRows=data.commercial.filter(r=>r.tileId===tileId);
  if(!schoolRows.length&&!commercialRows.length)return undefined;
  const origin=new THREE.Vector3().fromArray(tileOrigin),batch=new Batch(origin,level);
  for(const row of schoolRows)school(batch,row);
  for(const row of commercialRows)commercial(batch,row);
  const built=batch.finish();
  group.updateMatrixWorld(true);
  const removedGeometries=new Set<THREE.BufferGeometry>(),oldMaterials=new Set<THREE.Material>();
  const meshes: THREE.Mesh[]=[];group.traverse(o=>{if(o instanceof THREE.Mesh)meshes.push(o);});
  let removedTriangles=0,schoolMaterialSeen=false;
  const world=new THREE.Vector3();
  for(const mesh of meshes) {
    const materials=Array.isArray(mesh.material)?mesh.material:[mesh.material],geometry=mesh.geometry;
    for(const item of materials)oldMaterials.add(item);
    const position=geometry.getAttribute('position');if(!position)continue;
    const index=geometry.index, count=index?.count??position.count;
    const indices:number[]=[],groups:{start:number;count:number;materialIndex:number}[]=[];
    const originalGroups=geometry.groups.length?geometry.groups:[{start:0,count,materialIndex:0}];
    let didRemove=false;
    for(const part of originalGroups) {
      const materialIndex=part.materialIndex??0,mat=materials[materialIndex],start=indices.length;
      if(!mat)throw new Error('Crafted frontage found an unbound source material.');
      const schoolMatch=schoolRows.length>0&&/^Reference \| School (?:\d+ |observed |historic )/.test(mat.name);
      if(schoolMatch)schoolMaterialSeen=true;
      const genericDetail=/^V2 inferred \| (?:trim|glass|door)$/.test(mat.name);
      for(let i=part.start;i<Math.min(count,part.start+part.count);i+=3) {
        const ids=[index?index.getX(i):i,index?index.getX(i+1):i+1,index?index.getX(i+2):i+2];
        let remove=schoolMatch;
        if(!remove&&genericDetail&&commercialRows.length) {
          world.set(0,0,0);for(const id of ids)world.add(new THREE.Vector3().fromBufferAttribute(position,id));world.multiplyScalar(1/3).applyMatrix4(mesh.matrixWorld).add(origin);
          remove=commercialRows.some(row=>inCommercialBand(row,world));
        }
        if(remove){didRemove=true;removedTriangles++;}else indices.push(...ids);
      }
      if(indices.length>start)groups.push({start,count:indices.length-start,materialIndex});
    }
    if(!didRemove)continue;
    removedGeometries.add(geometry);
    if(!indices.length){mesh.removeFromParent();continue;}
    const replacement=new THREE.BufferGeometry();for(const [name,attribute]of Object.entries(geometry.attributes))replacement.setAttribute(name,attribute);
    replacement.setIndex(indices);for(const part of groups)replacement.addGroup(part.start,part.count,part.materialIndex);
    replacement.boundingBox=geometry.boundingBox?.clone()??null;replacement.boundingSphere=geometry.boundingSphere?.clone()??null;
    replacement.userData={...geometry.userData,craftedFrontageFilter:true};mesh.geometry=replacement;
  }
  if(schoolRows.length&&!schoolMaterialSeen) {
    built.group.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();(o.material as THREE.Material).dispose();}});
    throw new Error('School replacement namespace missing; refusing duplicate geometry.');
  }
  group.add(built.group);
  const retainedGeometry=new Set<THREE.BufferGeometry>(),retainedMaterials=new Set<THREE.Material>(),retainedTextures=new Set<THREE.Texture>();
  group.traverse(o=>{if(o instanceof THREE.Mesh){retainedGeometry.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material]){retainedMaterials.add(m);for(const value of Object.values(m))if(value instanceof THREE.Texture)retainedTextures.add(value);}}});
  for(const geometry of removedGeometries)if(!retainedGeometry.has(geometry))geometry.dispose();
  const discardedTextures=new Set<THREE.Texture>();for(const m of oldMaterials)if(!retainedMaterials.has(m)){for(const value of Object.values(m))if(value instanceof THREE.Texture&&!retainedTextures.has(value))discardedTextures.add(value);m.dispose();}
  for(const texture of discardedTextures)texture.dispose();
  const report:FrontageReport={version:CRAFTED_FRONTAGE_VERSION,tileId,schoolIds:schoolRows.map(r=>r.structId),commercialIds:commercialRows.map(r=>r.structId),removedTriangles,addedTriangles:built.triangles,addedMeshes:built.group.children.length,geometryBytes:built.bytes};
  group.userData.craftedFrontages=report;return report;
}
